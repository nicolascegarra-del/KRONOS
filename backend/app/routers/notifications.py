from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_admin
from app.models.app_settings import AppSettings
from app.models.fichaje import Fichaje
from app.models.user import User, UserRole

router = APIRouter(prefix="/admin/notifications", tags=["notifications"])


class LateAlert(BaseModel):
    type: Literal["late", "absent"]
    user_id: str
    full_name: str
    email: str
    scheduled_start: str
    minutes_late: int


@router.get("/late", response_model=list[LateAlert])
async def get_late_alerts(
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    # Check if alerts are enabled
    result = await session.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings or not settings.late_alert_enabled:
        return []

    threshold = settings.late_alert_minutes
    now = datetime.utcnow()
    today = now.date()
    from_dt = datetime.combine(today, datetime.min.time())
    to_dt = datetime.combine(today, datetime.max.time())

    # All active workers in admin's company that have a scheduled start time
    result = await session.execute(
        select(User).where(
            User.role == UserRole.worker,
            User.is_active == True,
            User.scheduled_start != None,
            User.company_id == admin.company_id,
        )
    )
    workers = result.scalars().all()

    # Filter to workers whose threshold has already passed
    eligible = [
        w for w in workers
        if now >= datetime.combine(today, w.scheduled_start) + timedelta(minutes=threshold)
    ]

    alerts: list[LateAlert] = []
    if not eligible:
        return alerts

    # Batch-fetch today's earliest fichaje for all eligible workers in one query
    from sqlalchemy import func as sql_func
    eligible_ids = [w.id for w in eligible]
    fichajes_result = await session.execute(
        select(Fichaje.user_id, sql_func.min(Fichaje.start_time).label("first_start"), sql_func.min(Fichaje.late_minutes).label("late_min"))
        .where(
            Fichaje.user_id.in_(eligible_ids),
            Fichaje.start_time >= from_dt,
            Fichaje.start_time <= to_dt,
        )
        .group_by(Fichaje.user_id)
    )
    fichaje_map: dict = {row.user_id: row for row in fichajes_result.all()}

    for worker in eligible:
        scheduled_str = worker.scheduled_start.strftime("%H:%M")
        row = fichaje_map.get(worker.id)

        if row is None:
            minutes_late = int(
                (now - datetime.combine(today, worker.scheduled_start)).total_seconds() / 60
            )
            alerts.append(
                LateAlert(
                    type="absent",
                    user_id=str(worker.id),
                    full_name=worker.full_name,
                    email=worker.email,
                    scheduled_start=scheduled_str,
                    minutes_late=minutes_late,
                )
            )
        elif (row.late_min or 0) >= threshold:
            alerts.append(
                LateAlert(
                    type="late",
                    user_id=str(worker.id),
                    full_name=worker.full_name,
                    email=worker.email,
                    scheduled_start=scheduled_str,
                    minutes_late=row.late_min or 0,
                )
            )

    return alerts
