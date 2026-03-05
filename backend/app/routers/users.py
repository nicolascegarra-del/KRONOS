from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_admin
from app.models.company import Company
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services.auth import hash_password
from app.services.import_export import generate_csv_template, parse_workers_csv

router = APIRouter(prefix="/users", tags=["users"])


async def _active_worker_count(session: AsyncSession, company_id: UUID) -> int:
    result = await session.execute(
        select(func.count()).select_from(User).where(
            User.company_id == company_id,
            User.role == UserRole.worker,
            User.is_active == True,
        )
    )
    return result.scalar_one()


@router.get("", response_model=list[UserRead])
async def list_users(
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    result = await session.execute(
        select(User)
        .where(User.company_id == admin.company_id)
        .order_by(User.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    existing = await session.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Enforce worker limit per company
    if body.role == UserRole.worker and admin.company_id is not None:
        company_result = await session.execute(
            select(Company).where(Company.id == admin.company_id)
        )
        company = company_result.scalar_one_or_none()
        if company:
            current_count = await _active_worker_count(session, admin.company_id)
            if current_count >= company.max_workers:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Límite de trabajadores alcanzado ({company.max_workers} máximo)",
                )

    user = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=body.role,
        scheduled_start=body.scheduled_start,
        company_id=admin.company_id,
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
    admin: User = Depends(require_admin),
):
    result = await session.execute(
        select(User).where(User.id == user_id, User.company_id == admin.company_id)
    )
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
    admin: User = Depends(require_admin),
):
    result = await session.execute(
        select(User).where(User.id == user_id, User.company_id == admin.company_id)
    )
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
    admin: User = Depends(require_admin),
):
    content = await file.read()
    try:
        workers = parse_workers_csv(content)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    # Get company for limit check
    company = None
    if admin.company_id is not None:
        company_result = await session.execute(
            select(Company).where(Company.id == admin.company_id)
        )
        company = company_result.scalar_one_or_none()

    created = []
    skipped = []
    for w in workers:
        existing = await session.execute(select(User).where(User.email == w["email"]))
        if existing.scalar_one_or_none():
            skipped.append(w["email"])
            continue

        # Check worker limit before adding each worker
        if company:
            current_count = await _active_worker_count(session, admin.company_id)
            if current_count >= company.max_workers:
                skipped.append(w["email"])
                continue

        user = User(
            email=w["email"],
            full_name=w["full_name"],
            hashed_password=hash_password(w["password"]),
            scheduled_start=w.get("scheduled_start"),
            company_id=admin.company_id,
        )
        session.add(user)
        created.append(w["email"])

    await session.commit()
    return {"created": created, "skipped": skipped}
