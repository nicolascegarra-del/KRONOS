from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_superadmin
from app.models.company import Company
from app.models.fichaje import Fichaje
from app.models.pausa import Pausa
from app.models.user import User, UserRole
from app.models.worker_schedule import WorkerSchedule
from app.schemas.user import UserRead, SuperadminUserUpdate
from app.services.auth import hash_password


class BulkUserDelete(BaseModel):
    user_ids: List[UUID]

router = APIRouter(prefix="/superadmin/users", tags=["superadmin-users"])


@router.get("", response_model=list[UserRead])
async def list_all_users(
    _sa: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()

    # Build company name lookup
    company_ids = {u.company_id for u in users if u.company_id is not None}
    company_names: dict = {}
    if company_ids:
        c_result = await session.execute(select(Company).where(Company.id.in_(company_ids)))
        for c in c_result.scalars().all():
            company_names[c.id] = c.name

    out = []
    for u in users:
        data = UserRead.model_validate(u)
        data.company_name = company_names.get(u.company_id) if u.company_id else None
        out.append(data)
    return out


@router.put("/{user_id}", response_model=UserRead)
async def update_any_user(
    user_id: UUID,
    body: SuperadminUserUpdate,
    _sa: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    data = body.model_dump(exclude_unset=True)
    if "password" in data:
        user.hashed_password = hash_password(data.pop("password"))
    for key, value in data.items():
        setattr(user, key, value)

    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Bulk delete fichajes
# ---------------------------------------------------------------------------

async def _delete_fichajes_for_users(session: AsyncSession, user_ids: list) -> int:
    """Delete all fichajes (and their pausas) for the given user IDs. Returns count."""
    fichaje_result = await session.execute(
        select(Fichaje).where(Fichaje.user_id.in_(user_ids))
    )
    fichajes = fichaje_result.scalars().all()
    for f in fichajes:
        pausa_result = await session.execute(select(Pausa).where(Pausa.fichaje_id == f.id))
        for p in pausa_result.scalars().all():
            await session.delete(p)
        await session.delete(f)
    await session.commit()
    return len(fichajes)


@router.delete("/fichajes", status_code=status.HTTP_200_OK)
async def delete_fichajes(
    user_id: Optional[UUID] = Query(default=None),
    company_id: Optional[UUID] = Query(default=None),
    _sa: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    """Delete all fichajes for a specific user or for all users in a company."""
    if user_id is None and company_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide user_id or company_id",
        )

    if user_id is not None:
        deleted = await _delete_fichajes_for_users(session, [user_id])
    else:
        # Get all user IDs in the company
        users_result = await session.execute(
            select(User.id).where(User.company_id == company_id)
        )
        ids = [row[0] for row in users_result.all()]
        deleted = await _delete_fichajes_for_users(session, ids) if ids else 0

    return {"deleted": deleted}


# ---------------------------------------------------------------------------
# Bulk delete users
# ---------------------------------------------------------------------------

@router.delete("/bulk", status_code=status.HTTP_200_OK)
async def bulk_delete_users(
    body: BulkUserDelete,
    _sa: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    """Delete a list of users and all their associated data (fichajes, pausas, schedules)."""
    if not body.user_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="user_ids list cannot be empty",
        )

    # Prevent deletion of superadmin accounts
    sa_result = await session.execute(
        select(User).where(User.id.in_(body.user_ids), User.role == UserRole.superadmin)
    )
    if sa_result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete superadmin accounts",
        )

    # Delete related data then users
    await _delete_fichajes_for_users(session, body.user_ids)

    schedule_result = await session.execute(
        select(WorkerSchedule).where(WorkerSchedule.user_id.in_(body.user_ids))
    )
    for ws in schedule_result.scalars().all():
        await session.delete(ws)

    users_result = await session.execute(select(User).where(User.id.in_(body.user_ids)))
    users = users_result.scalars().all()
    for u in users:
        await session.delete(u)

    await session.commit()
    return {"deleted": len(users)}
