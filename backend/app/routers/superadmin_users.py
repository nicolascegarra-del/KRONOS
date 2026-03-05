from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_superadmin
from app.models.user import User
from app.schemas.user import UserRead, SuperadminUserUpdate
from app.services.auth import hash_password

router = APIRouter(prefix="/superadmin/users", tags=["superadmin-users"])


@router.get("", response_model=list[UserRead])
async def list_all_users(
    _sa: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(User).order_by(User.created_at))
    return result.scalars().all()


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
