import csv
import io
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_admin
from app.models.fichaje import Fichaje, FichajeStatus
from app.models.pausa import Pausa
from app.models.user import User
from app.schemas.reports import HoursReport, LatenessAlert, WorkerHoursSummary
from app.services.hours import calculate_pause_minutes, scheduled_daily_minutes
from app.services.access_log import log_admin_access

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/hours", response_model=HoursReport)
async def hours_report(
    from_date: date = Query(..., description="Start date (inclusive)"),
    to_date: date = Query(..., description="End date (inclusive)"),
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    from_dt = datetime.combine(from_date, datetime.min.time())
    to_dt = datetime.combine(to_date, datetime.max.time())

    # Load all finished fichajes in range with their pausas and users
    result = await session.execute(
        select(Fichaje)
        .join(User, Fichaje.user_id == User.id)
        .options(selectinload(Fichaje.pausas), selectinload(Fichaje.user))
        .where(
            Fichaje.start_time >= from_dt,
            Fichaje.start_time <= to_dt,
            Fichaje.status == FichajeStatus.finished,
            User.company_id == admin.company_id,
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
                overtime_minutes=0,
                late_minutes=0,
                fichaje_count=0,
                pause_count=0,
            )
        summary = workers_map[uid]
        fichaje_minutes = f.total_minutes or 0
        scheduled = scheduled_daily_minutes(f.user)
        summary.total_minutes += fichaje_minutes
        summary.overtime_minutes += max(0, fichaje_minutes - scheduled)
        summary.late_minutes += f.late_minutes or 0
        summary.fichaje_count += 1
        summary.pause_count += len(f.pausas)

    for summary in workers_map.values():
        summary.total_hours = round(summary.total_minutes / 60, 2)

    import json
    details = json.dumps({"from_date": from_date.isoformat(), "to_date": to_date.isoformat()})
    await log_admin_access(admin.id, "EXPORT_REPORT", details)
    return HoursReport(
        from_date=from_date,
        to_date=to_date,
        workers=list(workers_map.values()),
    )


@router.get("/fichajes-export")
async def fichajes_raw_export(
    from_date: date = Query(..., description="Fecha inicio (inclusive)"),
    to_date: date = Query(..., description="Fecha fin (inclusive)"),
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Export all raw fichajes for the company as CSV (for ITSS inspection)."""
    from_dt = datetime.combine(from_date, datetime.min.time())
    to_dt = datetime.combine(to_date, datetime.max.time())

    result = await session.execute(
        select(Fichaje)
        .join(User, Fichaje.user_id == User.id)
        .options(selectinload(Fichaje.pausas), selectinload(Fichaje.user))
        .where(
            Fichaje.start_time >= from_dt,
            Fichaje.start_time <= to_dt,
            User.company_id == admin.company_id,
        )
        .order_by(User.full_name, Fichaje.start_time)
    )
    fichajes = result.scalars().all()

    # Load editors (last_edited_by_id) in bulk
    editor_ids = {f.last_edited_by_id for f in fichajes if f.last_edited_by_id}
    editors: dict[UUID, str] = {}
    if editor_ids:
        ed_result = await session.execute(
            select(User).where(User.id.in_(editor_ids))
        )
        editors = {u.id: u.full_name for u in ed_result.scalars().all()}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "trabajador", "dni", "email",
        "fecha", "inicio", "fin", "duracion_minutos", "minutos_ordinarios", "minutos_extraordinarios", "minutos_tarde",
        "estado", "modalidad", "descanso_insuficiente", "pausas",
        "motivo_edicion", "editado_por", "editado_fecha",
    ])

    for f in fichajes:
        u = f.user
        fecha = f.start_time.date().isoformat() if f.start_time else ""
        inicio = f.start_time.strftime("%H:%M:%S") if f.start_time else ""
        fin = f.end_time.strftime("%H:%M:%S") if f.end_time else ""

        pausa_parts = []
        for p in sorted(f.pausas, key=lambda x: x.start_time):
            p_start = p.start_time.strftime("%H:%M") if p.start_time else "?"
            p_end = p.end_time.strftime("%H:%M") if p.end_time else "?"
            label = p.comment or "Pausa"
            pausa_parts.append(f"{label} {p_start}-{p_end}")

        editor_name = editors.get(f.last_edited_by_id, "") if f.last_edited_by_id else ""
        edited_at = f.last_edited_at.strftime("%Y-%m-%d %H:%M") if f.last_edited_at else ""

        fichaje_min = f.total_minutes or 0
        if u and u.scheduled_start and u.scheduled_end:
            sched_start_m = u.scheduled_start.hour * 60 + u.scheduled_start.minute
            sched_end_m = u.scheduled_end.hour * 60 + u.scheduled_end.minute
            sched_daily = max(0, sched_end_m - sched_start_m)
        else:
            sched_daily = 480  # 8h default
        ordinary_min = min(fichaje_min, sched_daily)
        overtime_min = max(0, fichaje_min - sched_daily)

        writer.writerow([
            u.full_name if u else "",
            u.dni or "" if u else "",
            u.email if u else "",
            fecha, inicio, fin,
            fichaje_min or "",
            ordinary_min,
            overtime_min,
            f.late_minutes or 0,
            f.status.value if f.status else "",
            getattr(f, "modalidad", "") or "",
            "Sí" if getattr(f, "rest_violation", False) else "No",
            "; ".join(pausa_parts),
            f.edit_comment or "",
            editor_name,
            edited_at,
        ])

    csv_bytes = output.getvalue().encode("utf-8-sig")
    filename = f"registros_jornada_{from_date}_{to_date}.csv"
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/alerts", response_model=list[LatenessAlert])
async def lateness_alerts(
    from_date: date = Query(...),
    to_date: date = Query(...),
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    from_dt = datetime.combine(from_date, datetime.min.time())
    to_dt = datetime.combine(to_date, datetime.max.time())

    result = await session.execute(
        select(Fichaje)
        .join(User, Fichaje.user_id == User.id)
        .options(selectinload(Fichaje.user))
        .where(
            Fichaje.start_time >= from_dt,
            Fichaje.start_time <= to_dt,
            Fichaje.late_minutes > 0,
            User.company_id == admin.company_id,
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
