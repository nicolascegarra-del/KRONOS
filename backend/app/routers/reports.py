from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_admin
from app.models.fichaje import Fichaje, FichajeStatus
from app.models.pausa import Pausa
from app.models.user import User
from app.schemas.reports import HoursReport, LatenessAlert, WorkerHoursSummary
from app.services.hours import calculate_pause_minutes

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/hours", response_model=HoursReport)
async def hours_report(
    from_date: date = Query(..., description="Start date (inclusive)"),
    to_date: date = Query(..., description="End date (inclusive)"),
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    from_dt = datetime.combine(from_date, datetime.min.time())
    to_dt = datetime.combine(to_date, datetime.max.time())

    # Load all finished fichajes in range with their pausas and users
    result = await session.execute(
        select(Fichaje)
        .options(selectinload(Fichaje.pausas), selectinload(Fichaje.user))
        .where(
            Fichaje.start_time >= from_dt,
            Fichaje.start_time <= to_dt,
            Fichaje.status == FichajeStatus.finished,
        )
    )
    fichajes = result.scalars().all()

    # Aggregate per user
    workers_map: dict[UUID, WorkerHoursSummary] = {}
    for f in fichajes:
        uid = f.user_id
        if uid not in workers_map:
            workers_map[uid] = WorkerHoursSummary(
                user_id=uid,
                full_name=f.user.full_name if f.user else "",
                email=f.user.email if f.user else "",
                total_minutes=0,
                total_hours=0.0,
                late_minutes=0,
                fichaje_count=0,
                pause_count=0,
            )
        summary = workers_map[uid]
        summary.total_minutes += f.total_minutes or 0
        summary.late_minutes += f.late_minutes or 0
        summary.fichaje_count += 1
        summary.pause_count += len(f.pausas)

    for summary in workers_map.values():
        summary.total_hours = round(summary.total_minutes / 60, 2)

    return HoursReport(
        from_date=from_date,
        to_date=to_date,
        workers=list(workers_map.values()),
    )


@router.get("/alerts", response_model=list[LatenessAlert])
async def lateness_alerts(
    from_date: date = Query(...),
    to_date: date = Query(...),
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    from_dt = datetime.combine(from_date, datetime.min.time())
    to_dt = datetime.combine(to_date, datetime.max.time())

    result = await session.execute(
        select(Fichaje)
        .options(selectinload(Fichaje.user))
        .where(
            Fichaje.start_time >= from_dt,
            Fichaje.start_time <= to_dt,
            Fichaje.late_minutes > 0,
        )
        .order_by(Fichaje.start_time.desc())
    )
    fichajes = result.scalars().all()

    alerts = []
    for f in fichajes:
        u = f.user
        if not u:
            continue
        start = f.start_time
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        alerts.append(
            LatenessAlert(
                user_id=u.id,
                full_name=u.full_name,
                email=u.email,
                date=start.date(),
                scheduled_start=(
                    u.scheduled_start.strftime("%H:%M") if u.scheduled_start else None
                ),
                actual_start=start.strftime("%H:%M"),
                late_minutes=f.late_minutes or 0,
            )
        )

    return alerts
