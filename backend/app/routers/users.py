from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_admin
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services.auth import hash_password
from app.services.import_export import generate_csv_template, parse_workers_csv

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
async def list_users(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    result = await session.execute(select(User).order_by(User.created_at))
    return result.scalars().all()


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    existing = await session.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=body.role,
        scheduled_start=body.scheduled_start,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: UUID,
    body: UserUpdate,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)

    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(
    user_id: UUID,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = False
    session.add(user)
    await session.commit()


@router.get("/template", response_class=Response)
async def download_template(_admin: User = Depends(require_admin)):
    content = generate_csv_template()
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=fichajes_template.csv"},
    )


@router.post("/import", status_code=status.HTTP_201_CREATED)
async def import_users(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_admin),
):
    content = await file.read()
    try:
        workers = parse_workers_csv(content)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    created = []
    skipped = []
    for w in workers:
        existing = await session.execute(select(User).where(User.email == w["email"]))
        if existing.scalar_one_or_none():
            skipped.append(w["email"])
            continue

        user = User(
            email=w["email"],
            full_name=w["full_name"],
            hashed_password=hash_password(w["password"]),
            scheduled_start=w.get("scheduled_start"),
        )
        session.add(user)
        created.append(w["email"])

    await session.commit()
    return {"created": created, "skipped": skipped}
