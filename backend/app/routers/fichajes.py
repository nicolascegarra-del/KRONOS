from datetime import date, datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_admin
from app.models.fichaje import Fichaje, FichajeStatus
from app.models.pausa import Pausa
from app.models.user import User
from app.schemas.fichaje import FichajeAdminRead, FichajeAdminUpdate, FichajeRead, PauseRequest
from app.services.hours import calculate_total_minutes, calculate_late_minutes

router = APIRouter(prefix="/fichajes", tags=["fichajes"])


def _now() -> datetime:
    """Return current UTC time as naive datetime (no tzinfo) for PostgreSQL TIMESTAMP."""
    return datetime.utcnow()


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
    from sqlalchemy import inspect as sa_inspect
    try:
        cached = session.get_one(Fichaje, fichaje_id)
        session.expunge(cached)
    except Exception:
        pass
    result = await session.execute(
        select(Fichaje)
        .options(selectinload(Fichaje.pausas))
        .where(Fichaje.id == fichaje_id)
    )
    return result.scalar_one()


@router.post("/start", response_model=FichajeRead, status_code=status.HTTP_201_CREATED)
async def start_fichaje(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    existing = await _get_active_fichaje(current_user.id, session)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A shift is already active",
        )

    fichaje = Fichaje(
        user_id=current_user.id,
        start_time=_now(),
        late_minutes=0,
    )
    session.add(fichaje)
    await session.flush()

    fichaje.late_minutes = calculate_late_minutes(current_user, fichaje)
    session.add(fichaje)
    await session.commit()
    return await _reload(session, fichaje.id)


@router.post("/end", response_model=FichajeRead)
async def end_fichaje(
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
    )
    session.add(pausa)
    fichaje.status = FichajeStatus.paused
    session.add(fichaje)
    await session.commit()
    return await _reload(session, fichaje.id)


@router.post("/resume", response_model=FichajeRead)
async def resume_fichaje(
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


@router.get("/me", response_model=list[FichajeRead])
async def get_my_fichajes(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Fichaje)
        .options(selectinload(Fichaje.pausas))
        .where(Fichaje.user_id == current_user.id)
        .order_by(Fichaje.start_time.desc())
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@router.get("/admin", response_model=list[FichajeAdminRead])
async def admin_list_fichajes(
    user_id: Optional[UUID] = None,
    fichaje_status: Optional[FichajeStatus] = Query(default=None, alias="status"),
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    query = (
        select(Fichaje)
        .join(User, Fichaje.user_id == User.id)
        .options(selectinload(Fichaje.user), selectinload(Fichaje.pausas))
        .where(User.company_id == admin.company_id)
        .order_by(Fichaje.start_time.desc())
    )
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


@router.post("/admin/{fichaje_id}/end", response_model=FichajeRead)
async def admin_end_fichaje(
    fichaje_id: UUID,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Fichaje)
        .join(User, Fichaje.user_id == User.id)
        .options(selectinload(Fichaje.pausas))
        .where(Fichaje.id == fichaje_id, User.company_id == admin.company_id)
    )
    fichaje = result.scalar_one_or_none()
    if not fichaje:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichaje not found")
    if fichaje.status == FichajeStatus.finished:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Shift is already finished")

    now = _now()
    for p in fichaje.pausas:
        if p.end_time is None:
            p.end_time = now
            session.add(p)

    fichaje.end_time = now
    fichaje.status = FichajeStatus.finished
    fichaje.total_minutes = calculate_total_minutes(fichaje, fichaje.pausas)
    session.add(fichaje)
    await session.commit()
    return await _reload(session, fichaje.id)


@router.delete("/admin/{fichaje_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_fichaje(
    fichaje_id: UUID,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Fichaje)
        .join(User, Fichaje.user_id == User.id)
        .options(selectinload(Fichaje.pausas))
        .where(Fichaje.id == fichaje_id, User.company_id == admin.company_id)
    )
    fichaje = result.scalar_one_or_none()
    if not fichaje:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichaje not found")

    for p in fichaje.pausas:
        await session.delete(p)
    await session.delete(fichaje)
    await session.commit()


@router.patch("/admin/{fichaje_id}", response_model=FichajeRead)
async def admin_edit_fichaje(
    fichaje_id: UUID,
    body: FichajeAdminUpdate,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Fichaje)
        .join(User, Fichaje.user_id == User.id)
        .options(selectinload(Fichaje.pausas))
        .where(Fichaje.id == fichaje_id, User.company_id == admin.company_id)
    )
    fichaje = result.scalar_one_or_none()
    if not fichaje:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fichaje not found")

    if body.start_time is not None:
        fichaje.start_time = body.start_time
    if body.end_time is not None:
        fichaje.end_time = body.end_time
    if body.status is not None:
        fichaje.status = body.status
    if body.late_minutes is not None:
        fichaje.late_minutes = body.late_minutes

    # If total_minutes explicitly provided, use it; otherwise auto-recalculate
    # when start/end changed on a finished shift.
    if body.total_minutes is not None:
        fichaje.total_minutes = body.total_minutes
    elif (body.start_time is not None or body.end_time is not None):
        if fichaje.status == FichajeStatus.finished and fichaje.end_time is not None:
            fichaje.total_minutes = calculate_total_minutes(fichaje, fichaje.pausas)

    session.add(fichaje)
    await session.commit()
    return await _reload(session, fichaje.id)
