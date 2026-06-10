import asyncio
from datetime import date, datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import func as sql_func
from app.database import get_session
from app.limiter import limiter
from app.dependencies import (
    get_current_user,
    require_admin,
    require_admin_or_superadmin,
    require_superadmin,
    require_tablet,
)
from app.models.company import Company
from app.models.fichaje import Fichaje, FichajeStatus
from app.models.pausa import Pausa
from app.models.user import User, UserRole
from app.models.work_center import WorkCenter
from app.schemas.fichaje import (
    FichajeAdminCreate, FichajeAdminListResponse, FichajeAdminRead, FichajeAdminUpdate,
    FichajeEditLogRead, FichajeRead, FieldChange,
    PauseRequest, StartRequest, EndRequest, ResumeRequest,
)
from app.models.fichajeeditlog import FichajeEditLog
from app.services.access_log import log_admin_access
from app.services.geofence import is_within_any_work_center
from app.services.hours import calculate_total_minutes, calculate_late_minutes

router = APIRouter(prefix="/fichajes", tags=["fichajes"])


def _now() -> datetime:
    """Return current UTC time as naive datetime (no tzinfo) for PostgreSQL TIMESTAMP."""
    return datetime.utcnow()


def _to_naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Normalize a datetime to naive UTC.

    The DB column is `TIMESTAMP WITHOUT TIME ZONE` and the rest of the code
    uses `datetime.utcnow()` (naive). Frontend may send ISO strings with `Z`
    or `+00:00` which Pydantic parses as aware datetimes — those would fail
    when subtracted from naive datetimes (TypeError) or be persisted with
    tzinfo causing inconsistencies.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


async def _get_active_fichaje(user_id: UUID, session: AsyncSession) -> Fichaje | None:
    result = await session.execute(
        select(Fichaje)
        .options(selectinload(Fichaje.pausas))
        .where(
            Fichaje.user_id == user_id,
            Fichaje.status.in_([FichajeStatus.active, FichajeStatus.paused]),
        )
    )
    return result.scalar_one_or_none()


async def _reload(session: AsyncSession, fichaje_id: UUID) -> Fichaje:
    """Reload a fichaje with its pausas — expunge first to bypass identity-map cache."""
    # Expunge any cached instance so SQLAlchemy fetches fresh data from DB
    try:
        cached = await session.get(Fichaje, fichaje_id)
        if cached is not None:
            session.expunge(cached)
    except Exception:
        pass
    result = await session.execute(
        select(Fichaje)
        .options(selectinload(Fichaje.pausas))
        .where(Fichaje.id == fichaje_id)
    )
    return result.scalar_one()


async def _reload_admin(session: AsyncSession, fichaje_id: UUID) -> Fichaje:
    """Reload a fichaje with pausas AND user — needed when the response_model
    is FichajeAdminRead (which serializes the `user` relation). Without
    eager-loading `user`, Pydantic triggers lazy load in async session and
    raises MissingGreenlet, returning 500 even though the row was committed."""
    try:
        cached = await session.get(Fichaje, fichaje_id)
        if cached is not None:
            session.expunge(cached)
    except Exception:
        pass
    result = await session.execute(
        select(Fichaje)
        .options(selectinload(Fichaje.user), selectinload(Fichaje.pausas))
        .where(Fichaje.id == fichaje_id)
    )
    return result.scalar_one()


async def _check_fichaje_limit(user: User, session: AsyncSession) -> None:
    """Raise 403 if the user's company has reached its fichaje quota."""
    if not user.company_id:
        return
    company_result = await session.execute(
        select(Company).where(Company.id == user.company_id)
    )
    company = company_result.scalar_one_or_none()
    if not company or company.max_fichajes is None:
        return  # no limit configured

    count_result = await session.execute(
        select(sql_func.count(Fichaje.id))
        .join(User, Fichaje.user_id == User.id)
        .where(
            User.company_id == user.company_id,
            Fichaje.is_deleted == False,
        )
    )
    total = count_result.scalar_one()
    if total >= company.max_fichajes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Tu empresa ha alcanzado el límite de {company.max_fichajes} fichajes "
                f"incluidos en el plan gratuito. Contacta con nosotros para ampliar tu plan."
            ),
        )


@router.get("/limit")
async def get_fichaje_limit(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return the fichaje quota for the current user's company (null if unlimited)."""
    if not current_user.company_id:
        return {"has_limit": False, "max_fichajes": None, "used": 0, "remaining": None}

    company_result = await session.execute(
        select(Company).where(Company.id == current_user.company_id)
    )
    company = company_result.scalar_one_or_none()
    if not company or company.max_fichajes is None:
        return {"has_limit": False, "max_fichajes": None, "used": 0, "remaining": None}

    count_result = await session.execute(
        select(sql_func.count(Fichaje.id))
        .join(User, Fichaje.user_id == User.id)
        .where(
            User.company_id == current_user.company_id,
            Fichaje.is_deleted == False,
        )
    )
    used = count_result.scalar_one()
    return {
        "has_limit": True,
        "max_fichajes": company.max_fichajes,
        "used": used,
        "remaining": max(0, company.max_fichajes - used),
    }


@router.post("/start", response_model=FichajeRead, status_code=status.HTTP_201_CREATED)
async def start_fichaje(
    body: StartRequest = StartRequest(),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # Check fichaje quota before creating
    await _check_fichaje_limit(current_user, session)

    existing = await _get_active_fichaje(current_user.id, session)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A shift is already active",
        )

    now = _now()
    fichaje = Fichaje(
        user_id=current_user.id,
        start_time=now,
        late_minutes=0,
        start_lat=body.coords.lat if body.coords else None,
        start_lng=body.coords.lng if body.coords else None,
        modalidad=body.modalidad or "presencial",
    )
    session.add(fichaje)
    await session.flush()

    fichaje.late_minutes = calculate_late_minutes(current_user, fichaje)

    # Check minimum 12h rest between shifts (Art. 34.3 ET)
    last_result = await session.execute(
        select(Fichaje)
        .where(
            Fichaje.user_id == current_user.id,
            Fichaje.status == FichajeStatus.finished,
            Fichaje.end_time.isnot(None),
            Fichaje.is_deleted == False,
        )
        .order_by(Fichaje.end_time.desc())
        .limit(1)
    )
    last_fichaje = last_result.scalar_one_or_none()
    if last_fichaje and last_fichaje.end_time:
        rest_seconds = (now - last_fichaje.end_time).total_seconds()
        if rest_seconds < 12 * 3600:
            fichaje.rest_violation = True

    # Geofence check: only if company has geo_enabled=True, work centers exist, and coords provided
    if body.coords and current_user.company_id:
        company_result = await session.execute(
            select(Company).where(Company.id == current_user.company_id)
        )
        company_obj = company_result.scalar_one_or_none()
        if company_obj and company_obj.geo_enabled:
            wc_result = await session.execute(
                select(WorkCenter).where(WorkCenter.company_id == current_user.company_id)
            )
            work_centers = wc_result.scalars().all()
            if work_centers:
                in_range = is_within_any_work_center(body.coords.lat, body.coords.lng, work_centers)
                fichaje.out_of_range = not in_range
                if not in_range:
                    t = asyncio.create_task(_notify_out_of_range(current_user, current_user.company_id))
                    t.add_done_callback(lambda _: None)  # keep reference alive until completion

    session.add(fichaje)
    await session.commit()
    return await _reload(session, fichaje.id)


async def _notify_out_of_range(worker: User, company_id: UUID) -> None:
    """Send an email to all company admins when a worker clocks in out of range.

    Uses its own DB session — never reuse the request session in a background task.
    """
    try:
        from app.services.email_service import send_email
        from app.routers.settings import _get_email_config
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            config = await _get_email_config(session, company_id)
            if not config or not config.smtp_host:
                return

            admin_result = await session.execute(
                select(User).where(
                    User.company_id == company_id,
                    User.role == UserRole.admin,
                    User.is_active == True,
                )
            )
            admins = admin_result.scalars().all()

            subject = f"⚠️ Trabajador fuera de rango — {worker.full_name}"
            body = f"""
            <p>El trabajador <strong>{worker.full_name}</strong> ({worker.email}) ha fichado
            su inicio de jornada fuera de los centros de trabajo configurados.</p>
            <p>Revisa el panel de fichajes para más detalles.</p>
            """
            await asyncio.gather(
                *[send_email(config, admin.email, subject, body) for admin in admins],
                return_exceptions=True,
            )
    except Exception:
        pass


@router.post("/end", response_model=FichajeRead)
async def end_fichaje(
    body: EndRequest = EndRequest(),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    fichaje = await _get_active_fichaje(current_user.id, session)
    if not fichaje:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active shift found",
        )

    now = _now()
    for p in fichaje.pausas:
        if p.end_time is None:
            p.end_time = now
            session.add(p)

    fichaje.end_time = now
    fichaje.status = FichajeStatus.finished
    fichaje.total_minutes = calculate_total_minutes(fichaje, fichaje.pausas)
    fichaje.end_lat = body.coords.lat if body.coords else None
    fichaje.end_lng = body.coords.lng if body.coords else None
    session.add(fichaje)
    await session.commit()
    return await _reload(session, fichaje.id)


@router.post("/pause", response_model=FichajeRead)
async def pause_fichaje(
    body: PauseRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    fichaje = await _get_active_fichaje(current_user.id, session)
    if not fichaje:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active shift found",
        )

    if fichaje.status == FichajeStatus.paused:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Shift is already paused",
        )

    pausa = Pausa(
        fichaje_id=fichaje.id,
        start_time=_now(),
        comment=body.comment,
        start_lat=body.coords.lat if body.coords else None,
        start_lng=body.coords.lng if body.coords else None,
    )
    session.add(pausa)
    fichaje.status = FichajeStatus.paused
    session.add(fichaje)
    await session.commit()
    return await _reload(session, fichaje.id)


@router.post("/resume", response_model=FichajeRead)
async def resume_fichaje(
    body: ResumeRequest = ResumeRequest(),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    fichaje = await _get_active_fichaje(current_user.id, session)
    if not fichaje:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active shift found",
        )

    if fichaje.status != FichajeStatus.paused:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Shift is not paused",
        )

    now = _now()
    for p in fichaje.pausas:
        if p.end_time is None:
            p.end_time = now
            p.end_lat = body.coords.lat if body.coords else None
            p.end_lng = body.coords.lng if body.coords else None
            session.add(p)

    fichaje.status = FichajeStatus.active
    session.add(fichaje)
    await session.commit()
    return await _reload(session, fichaje.id)


@router.get("/active", response_model=FichajeRead | None)
async def get_active_fichaje(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await _get_active_fichaje(current_user.id, session)


# ── Kiosco / Tablet ─────────────────────────────────────────────────────────────

class KioskRequest(BaseModel):
    code: str


class KioskResponse(BaseModel):
    worker_name: str
    action: str  # "start" | "end"
    total_minutes: Optional[int] = None
    start_time: Optional[datetime] = None


@router.post("/kiosk", response_model=KioskResponse)
@limiter.limit("30/minute")
async def kiosk_fichaje(
    request: Request,
    body: KioskRequest,
    tablet: User = Depends(require_tablet),
    session: AsyncSession = Depends(get_session),
):
    """Fichaje desde la tablet compartida: resuelve el trabajador por su código y
    decide automáticamente entrada/salida según tenga o no jornada activa.

    El trabajador NUNCA elige entrada o salida — solo introduce su código.
    """
    code = (body.code or "").strip()
    worker_result = await session.execute(
        select(User).where(
            User.company_id == tablet.company_id,
            User.fichaje_code == code,
            User.role == UserRole.worker,
            User.is_active == True,
        )
    )
    worker = worker_result.scalar_one_or_none()
    if not worker or not code:
        # Mensaje genérico para no revelar qué códigos existen.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trabajador no válido. Avise a su responsable.",
        )

    active = await _get_active_fichaje(worker.id, session)

    if active is None:
        # ── Entrada ──
        await _check_fichaje_limit(worker, session)
        now = _now()
        fichaje = Fichaje(
            user_id=worker.id,
            start_time=now,
            late_minutes=0,
            modalidad="presencial",
        )
        session.add(fichaje)
        await session.flush()
        fichaje.late_minutes = calculate_late_minutes(worker, fichaje)

        # Descanso mínimo de 12h entre jornadas (Art. 34.3 ET)
        last_result = await session.execute(
            select(Fichaje)
            .where(
                Fichaje.user_id == worker.id,
                Fichaje.status == FichajeStatus.finished,
                Fichaje.end_time.isnot(None),
                Fichaje.is_deleted == False,
            )
            .order_by(Fichaje.end_time.desc())
            .limit(1)
        )
        last_fichaje = last_result.scalar_one_or_none()
        if last_fichaje and last_fichaje.end_time:
            if (now - last_fichaje.end_time).total_seconds() < 12 * 3600:
                fichaje.rest_violation = True

        session.add(fichaje)
        await session.commit()
        return KioskResponse(worker_name=worker.full_name, action="start")

    # ── Salida ──
    now = _now()
    for p in active.pausas:
        if p.end_time is None:
            p.end_time = now
            session.add(p)
    active.end_time = now
    active.status = FichajeStatus.finished
    active.total_minutes = calculate_total_minutes(active, active.pausas)
    session.add(active)
    await session.commit()
    return KioskResponse(
        worker_name=worker.full_name,
        action="end",
        total_minutes=active.total_minutes,
        start_time=active.start_time,
    )


@router.get("/me", response_model=list[FichajeRead])
async def get_my_fichajes(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Fichaje)
        .options(selectinload(Fichaje.pausas))
        .where(Fichaje.user_id == current_user.id, Fichaje.is_deleted == False)
        .order_by(Fichaje.start_time.desc())
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@router.get("/admin", response_model=FichajeAdminListResponse)
async def admin_list_fichajes(
    user_id: Optional[UUID] = None,
    fichaje_status: Optional[FichajeStatus] = Query(default=None, alias="status"),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    import json
    from sqlalchemy import func as sql_func

    base_where = [User.company_id == admin.company_id, Fichaje.is_deleted == False]
    if user_id:
        base_where.append(Fichaje.user_id == user_id)
    if fichaje_status:
        base_where.append(Fichaje.status == fichaje_status)
    if from_date:
        base_where.append(Fichaje.start_time >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        base_where.append(Fichaje.start_time <= datetime.combine(to_date, datetime.max.time()))

    count_q = (
        select(sql_func.count())
        .select_from(Fichaje)
        .join(User, Fichaje.user_id == User.id)
        .where(*base_where)
    )
    total = (await session.execute(count_q)).scalar_one()

    query = (
        select(Fichaje)
        .join(User, Fichaje.user_id == User.id)
        .options(selectinload(Fichaje.user), selectinload(Fichaje.pausas))
        .where(*base_where)
        .order_by(Fichaje.start_time.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.execute(query)).scalars().all()

    details = json.dumps({
        "user_id": str(user_id) if user_id else None,
        "status": fichaje_status.value if fichaje_status else None,
        "from_date": from_date.isoformat() if from_date else None,
        "to_date": to_date.isoformat() if to_date else None,
    })
    t = asyncio.create_task(log_admin_access(admin.id, "VIEW_FICHAJES", details))
    t.add_done_callback(lambda _: None)  # keep reference alive until completion
    return FichajeAdminListResponse(items=list(rows), total=total)


@router.post("/admin/{fichaje_id}/end", response_model=FichajeRead)
async def admin_end_fichaje(
    fichaje_id: UUID,
    caller: User = Depends(require_admin_or_superadmin),
    session: AsyncSession = Depends(get_session),
):
    where_clauses = [Fichaje.id == fichaje_id]
    if caller.role == UserRole.admin:
        where_clauses.append(User.company_id == caller.company_id)

    result = await session.execute(
        select(Fichaje)
        .join(User, Fichaje.user_id == User.id)
        .options(selectinload(Fichaje.pausas))
        .where(*where_clauses)
    )
    fichaje = result.scalar_one_or_none()
    if not fichaje:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichaje not found")
    if fichaje.status == FichajeStatus.finished:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Shift is already finished")

    import json

    now = _now()

    # Snapshot before force-end so it appears correctly in edit history
    original_snapshot = {
        "start_time": fichaje.start_time.isoformat() if fichaje.start_time else None,
        "end_time": fichaje.end_time.isoformat() if fichaje.end_time else None,
        "status": fichaje.status.value if fichaje.status else None,
        "modalidad": fichaje.modalidad,
        "total_minutes": fichaje.total_minutes,
        "late_minutes": fichaje.late_minutes,
        "out_of_range": fichaje.out_of_range,
        "edit_comment": fichaje.edit_comment,
    }
    force_end_log = FichajeEditLog(
        fichaje_id=fichaje.id,
        edited_by_id=caller.id,
        comment="Jornada finalizada manualmente por el administrador",
        original_data=json.dumps(original_snapshot),
        action="force_end",
    )
    session.add(force_end_log)

    for p in fichaje.pausas:
        if p.end_time is None:
            p.end_time = now
            session.add(p)

    fichaje.end_time = now
    fichaje.status = FichajeStatus.finished
    fichaje.total_minutes = calculate_total_minutes(fichaje, fichaje.pausas)
    fichaje.last_edited_by_id = caller.id
    fichaje.last_edited_at = now
    session.add(fichaje)
    await session.commit()
    return await _reload(session, fichaje.id)


@router.delete("/admin/{fichaje_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_fichaje(
    fichaje_id: UUID,
    _superadmin: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Fichaje).where(Fichaje.id == fichaje_id)
    )
    fichaje = result.scalar_one_or_none()
    if not fichaje:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichaje not found")

    # Soft delete — never remove records from the database
    fichaje.is_deleted = True
    fichaje.deleted_at = _now()
    session.add(fichaje)
    await session.commit()


class BulkFichajeDelete(BaseModel):
    ids: list[UUID]


@router.delete("/superadmin/bulk", status_code=status.HTTP_200_OK)
async def superadmin_bulk_delete_fichajes(
    body: BulkFichajeDelete,
    _superadmin: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    if not body.ids:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ids list cannot be empty")
    # Soft delete — never remove records from the database
    now = _now()
    from sqlalchemy import update as sa_update
    await session.execute(
        sa_update(Fichaje)
        .where(Fichaje.id.in_(body.ids))
        .values(is_deleted=True, deleted_at=now)
    )
    await session.commit()
    return {"deleted": len(body.ids)}


@router.post("/admin", response_model=FichajeAdminRead, status_code=status.HTTP_201_CREATED)
async def admin_create_fichaje(
    body: FichajeAdminCreate,
    caller: User = Depends(require_admin_or_superadmin),
    session: AsyncSession = Depends(get_session),
):
    """Create a fichaje manually on behalf of a worker.

    Admin: only for users in their own company.
    Superadmin: any user. The optional `company_id` in the body is ignored;
    the company is derived from the target user.
    """
    import json

    # 1. Resolve target user
    target = await session.get(User, body.user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # 2. Tenant check
    if caller.role == UserRole.admin and target.company_id != caller.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not belong to your company",
        )

    # 3. Normalize timestamps to naive UTC (consistent with rest of codebase)
    new_start = _to_naive_utc(body.start_time)
    new_end = _to_naive_utc(body.end_time)

    # 4. Conflict check: if creating an open shift, target must not have one already
    if new_end is None:
        existing = await _get_active_fichaje(target.id, session)
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El trabajador ya tiene una jornada activa.",
            )

    # 5. Quota check on the target's company (NOT the caller's)
    await _check_fichaje_limit(target, session)

    # 6. Determine final status
    final_status = FichajeStatus.finished if new_end is not None else FichajeStatus.active

    now = _now()
    fichaje = Fichaje(
        user_id=target.id,
        start_time=new_start,
        end_time=new_end,
        status=final_status,
        modalidad=body.modalidad or "presencial",
        out_of_range=body.out_of_range,
        edit_comment=body.edit_comment,
        last_edited_by_id=caller.id,
        last_edited_at=now,
    )
    session.add(fichaje)
    await session.flush()

    # 7. late_minutes — explicit value or computed from worker schedule
    if body.late_minutes is not None:
        fichaje.late_minutes = body.late_minutes
    else:
        fichaje.late_minutes = calculate_late_minutes(target, fichaje)

    # 8. total_minutes — explicit override or computed when end_time is set
    if body.total_minutes is not None:
        fichaje.total_minutes = body.total_minutes
    elif new_end is not None:
        # No pausas on freshly-created manual fichaje
        fichaje.total_minutes = calculate_total_minutes(fichaje, [])

    # 9. Rest violation check (Art. 34.3 ET) — only meaningful for closed shifts
    if new_end is not None:
        last_result = await session.execute(
            select(Fichaje)
            .where(
                Fichaje.user_id == target.id,
                Fichaje.id != fichaje.id,
                Fichaje.status == FichajeStatus.finished,
                Fichaje.end_time.isnot(None),
                Fichaje.is_deleted == False,
                Fichaje.end_time < new_start,
            )
            .order_by(Fichaje.end_time.desc())
            .limit(1)
        )
        last_fichaje = last_result.scalar_one_or_none()
        if last_fichaje and last_fichaje.end_time:
            rest_seconds = (new_start - last_fichaje.end_time).total_seconds()
            if rest_seconds < 12 * 3600:
                fichaje.rest_violation = True

    # 10. Audit log entry — for creation, the snapshot is the post-state itself
    snapshot_after = {
        "start_time": fichaje.start_time.isoformat() if fichaje.start_time else None,
        "end_time": fichaje.end_time.isoformat() if fichaje.end_time else None,
        "status": fichaje.status.value if fichaje.status else None,
        "total_minutes": fichaje.total_minutes,
        "late_minutes": fichaje.late_minutes,
        "out_of_range": fichaje.out_of_range,
        "modalidad": fichaje.modalidad,
        "edit_comment": fichaje.edit_comment,
    }
    create_log = FichajeEditLog(
        fichaje_id=fichaje.id,
        edited_by_id=caller.id,
        comment=body.edit_comment,
        original_data=json.dumps(snapshot_after),
        action="create",
    )
    session.add(create_log)

    session.add(fichaje)
    await session.commit()
    return await _reload_admin(session, fichaje.id)


@router.patch("/admin/{fichaje_id}", response_model=FichajeAdminRead)
async def admin_edit_fichaje(
    fichaje_id: UUID,
    body: FichajeAdminUpdate,
    caller: User = Depends(require_admin_or_superadmin),
    session: AsyncSession = Depends(get_session),
):
    import json

    # Tenant filter: admin restricted to their company; superadmin sees all
    where_clauses = [Fichaje.id == fichaje_id]
    if caller.role == UserRole.admin:
        where_clauses.append(User.company_id == caller.company_id)

    result = await session.execute(
        select(Fichaje)
        .join(User, Fichaje.user_id == User.id)
        .options(selectinload(Fichaje.pausas))
        .where(*where_clauses)
    )
    fichaje = result.scalar_one_or_none()
    if not fichaje:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichaje not found")

    # Snapshot original state before applying changes
    original_snapshot = {
        "start_time": fichaje.start_time.isoformat() if fichaje.start_time else None,
        "end_time": fichaje.end_time.isoformat() if fichaje.end_time else None,
        "status": fichaje.status.value if fichaje.status else None,
        "total_minutes": fichaje.total_minutes,
        "late_minutes": fichaje.late_minutes,
        "out_of_range": fichaje.out_of_range,
        "modalidad": fichaje.modalidad,
        "edit_comment": fichaje.edit_comment,
    }
    edit_log = FichajeEditLog(
        fichaje_id=fichaje.id,
        edited_by_id=caller.id,
        comment=body.edit_comment,
        original_data=json.dumps(original_snapshot),
        action="update",
    )
    session.add(edit_log)

    # Normalize incoming datetimes to naive UTC for consistent comparison/storage
    new_start = _to_naive_utc(body.start_time)
    new_end = _to_naive_utc(body.end_time)

    if new_start is not None:
        fichaje.start_time = new_start
    if new_end is not None:
        fichaje.end_time = new_end
    if body.status is not None:
        fichaje.status = body.status
    if body.late_minutes is not None:
        fichaje.late_minutes = body.late_minutes
    if body.out_of_range is not None:
        fichaje.out_of_range = body.out_of_range
    if body.modalidad is not None:
        fichaje.modalidad = body.modalidad

    # Auto-close: if end_time was added and status not finished, mark finished
    # and close any open pausas (same pattern as POST /end and admin/{id}/end).
    end_time_added = new_end is not None
    if end_time_added and fichaje.status != FichajeStatus.finished:
        now = _now()
        for p in fichaje.pausas:
            if p.end_time is None:
                p.end_time = now
                session.add(p)
        fichaje.status = FichajeStatus.finished

    # Validate end > start if both are set after applying changes
    if (
        fichaje.end_time is not None
        and fichaje.start_time is not None
        and fichaje.end_time <= fichaje.start_time
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_time must be after start_time",
        )

    # Recalculate total_minutes whenever there is a closed range, regardless of
    # the original status. Explicit override via body.total_minutes takes priority.
    if body.total_minutes is not None:
        fichaje.total_minutes = body.total_minutes
    elif fichaje.end_time is not None and fichaje.start_time is not None:
        fichaje.total_minutes = calculate_total_minutes(fichaje, fichaje.pausas)

    fichaje.edit_comment = body.edit_comment
    fichaje.last_edited_by_id = caller.id
    fichaje.last_edited_at = _now()

    session.add(fichaje)
    await session.commit()
    return await _reload_admin(session, fichaje.id)


_DIFF_FIELDS = ["start_time", "end_time", "status", "modalidad", "total_minutes", "late_minutes", "out_of_range"]


def _snapshot_from_fichaje(f: "Fichaje") -> dict:
    return {
        "start_time": f.start_time.isoformat() if f.start_time else None,
        "end_time": f.end_time.isoformat() if f.end_time else None,
        "status": f.status.value if f.status else None,
        "modalidad": f.modalidad,
        "total_minutes": f.total_minutes,
        "late_minutes": f.late_minutes,
    }


def _compute_diff(before: dict, after: dict) -> "dict[str, FieldChange]":
    changes: dict = {}
    for field in _DIFF_FIELDS:
        b = str(before.get(field)) if before.get(field) is not None else None
        a = str(after.get(field)) if after.get(field) is not None else None
        if b != a:
            changes[field] = FieldChange(before=b, after=a)
    return changes


@router.get("/admin/{fichaje_id}/history", response_model=list[FichajeEditLogRead])
async def admin_fichaje_history(
    fichaje_id: UUID,
    caller: User = Depends(require_admin_or_superadmin),
    session: AsyncSession = Depends(get_session),
):
    import json

    # Verify fichaje exists and (for admin) belongs to their company
    where_clauses = [Fichaje.id == fichaje_id]
    if caller.role == UserRole.admin:
        where_clauses.append(User.company_id == caller.company_id)

    result = await session.execute(
        select(Fichaje)
        .join(User, Fichaje.user_id == User.id)
        .where(*where_clauses)
    )
    fichaje = result.scalar_one_or_none()
    if not fichaje:
        raise HTTPException(status_code=404, detail="Fichaje not found")

    # Fetch all logs ordered oldest first to compute diffs
    logs_result = await session.execute(
        select(FichajeEditLog)
        .where(FichajeEditLog.fichaje_id == fichaje_id)
        .order_by(FichajeEditLog.edited_at.asc())
    )
    logs = logs_result.scalars().all()

    # Fetch editors
    editor_ids = list({log.edited_by_id for log in logs})
    editors: dict = {}
    if editor_ids:
        editors_result = await session.execute(
            select(User).where(User.id.in_(editor_ids))
        )
        for u in editors_result.scalars().all():
            editors[u.id] = u

    # Build diff list: each log's "after" = next log's "before", or current fichaje for the latest
    current_snapshot = _snapshot_from_fichaje(fichaje)
    entries = []
    for i, log in enumerate(logs):
        before = json.loads(log.original_data)
        # Determine "after" state: snapshot of next log's "before", or current fichaje
        if i + 1 < len(logs):
            after = json.loads(logs[i + 1].original_data)
        else:
            after = current_snapshot
        editor = editors.get(log.edited_by_id)
        entries.append(FichajeEditLogRead(
            id=log.id,
            edited_at=log.edited_at,
            edited_by=editor,
            comment=log.comment,
            changes=_compute_diff(before, after),
        ))

    # Return newest first
    entries.reverse()
    return entries


@router.get("/superadmin", response_model=list[FichajeAdminRead])
async def superadmin_list_fichajes(
    company_id: Optional[UUID] = None,
    user_id: Optional[UUID] = None,
    fichaje_status: Optional[FichajeStatus] = Query(default=None, alias="status"),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    _superadmin: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    query = (
        select(Fichaje)
        .join(User, Fichaje.user_id == User.id)
        .options(selectinload(Fichaje.user), selectinload(Fichaje.pausas))
        .where(Fichaje.is_deleted == False)
        .order_by(Fichaje.start_time.desc())
        .limit(limit)
        .offset(offset)
    )
    if company_id:
        query = query.where(User.company_id == company_id)
    if user_id:
        query = query.where(Fichaje.user_id == user_id)
    if fichaje_status:
        query = query.where(Fichaje.status == fichaje_status)
    if from_date:
        query = query.where(Fichaje.start_time >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        query = query.where(Fichaje.start_time <= datetime.combine(to_date, datetime.max.time()))
    result = await session.execute(query)
    return result.scalars().all()


@router.post("/admin/close-all", status_code=status.HTTP_200_OK)
async def admin_close_all_fichajes(
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Close all active/paused shifts for the company immediately."""
    closed = await _close_open_fichajes(session, company_id=admin.company_id)
    return {"closed": closed}


async def _close_open_fichajes(session: AsyncSession, company_id=None, max_hours: int = 0) -> int:
    """
    Close open fichajes.
    - If company_id provided: only that company.
    - If max_hours > 0: only fichajes open longer than max_hours hours.
    Returns number of fichajes closed.
    """
    from datetime import timedelta

    query = (
        select(Fichaje)
        .join(User, Fichaje.user_id == User.id)
        .options(selectinload(Fichaje.pausas))
        .where(Fichaje.status.in_([FichajeStatus.active, FichajeStatus.paused]), Fichaje.is_deleted == False)
    )
    if company_id is not None:
        query = query.where(User.company_id == company_id)
    if max_hours > 0:
        cutoff = _now() - timedelta(hours=max_hours)
        query = query.where(Fichaje.start_time <= cutoff)

    result = await session.execute(query)
    fichajes = result.scalars().all()

    now = _now()
    for fichaje in fichajes:
        for p in fichaje.pausas:
            if p.end_time is None:
                p.end_time = now
                session.add(p)
        fichaje.end_time = now
        fichaje.status = FichajeStatus.finished
        fichaje.total_minutes = calculate_total_minutes(fichaje, fichaje.pausas)
        session.add(fichaje)

    await session.commit()
    return len(fichajes)
