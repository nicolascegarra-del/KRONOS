import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
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


async def _fire_welcome_email(company_id, to_email: str, full_name: str, password: str) -> None:
    """Load email config and send welcome email (fire-and-forget, swallows errors)."""
    try:
        from app.database import AsyncSessionLocal
        from app.routers.settings import _get_email_config
        from app.services.email_service import send_welcome_email

        cfg = get_settings()
        async with AsyncSessionLocal() as session:
            config = await _get_email_config(session, company_id)
        await send_welcome_email(config, to_email, full_name, password, cfg.APP_URL)
    except Exception as exc:
        import logging; logging.getLogger(__name__).error("[welcome-email] Error: %s", exc)


@router.get("", response_model=list[UserRead])
async def list_users(
    limit: int = Query(default=500, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    result = await session.execute(
        select(User)
        .where(User.company_id == admin.company_id)
        .order_by(User.created_at)
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    # Admins can only create workers — only superadmin can assign admin/superadmin roles
    if body.role != UserRole.worker:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins can only create workers. Use superadmin to assign admin/superadmin roles.",
        )

    existing = await session.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Enforce worker limit per company
    if admin.company_id is not None:
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
        scheduled_end=body.scheduled_end,
        company_id=admin.company_id,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    # Fire-and-forget welcome email
    asyncio.create_task(_fire_welcome_email(admin.company_id, user.email, user.full_name, body.password))

    return user


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_user_password(
    user_id: UUID,
    body: dict,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Admin resets a worker's password. Optionally sends email notification."""
    result = await session.execute(
        select(User).where(User.id == user_id, User.company_id == admin.company_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    new_password: str = body.get("new_password", "")
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La contraseña debe tener al menos 8 caracteres",
        )

    user.hashed_password = hash_password(new_password)
    session.add(user)
    await session.commit()

    if body.get("send_email", True):
        asyncio.create_task(_fire_admin_password_reset_email(
            admin.company_id, user.email, user.full_name, new_password
        ))


async def _fire_admin_password_reset_email(
    company_id, to_email: str, full_name: str, new_password: str
) -> None:
    try:
        from app.database import AsyncSessionLocal
        from app.routers.settings import _get_email_config
        from app.services.email_service import send_admin_password_reset_email

        cfg = get_settings()
        async with AsyncSessionLocal() as session:
            config = await _get_email_config(session, company_id)
        await send_admin_password_reset_email(config, to_email, full_name, new_password, cfg.APP_URL)
    except Exception as exc:
        import logging; logging.getLogger(__name__).error("[admin-reset-email] Error: %s", exc)


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

    # Admins cannot escalate roles to admin/superadmin
    if "role" in update_data and update_data["role"] in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot assign admin or superadmin roles. Contact a superadmin.",
        )

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
    if len(content) > 10 * 1024 * 1024:  # 10 MB max
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="El archivo no puede superar 10 MB")
    try:
        workers = await asyncio.to_thread(parse_workers_csv, content)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    # Get company + current worker count once (evita N+1 dentro del loop)
    company = None
    current_count = 0
    if admin.company_id is not None:
        company_result = await session.execute(
            select(Company).where(Company.id == admin.company_id)
        )
        company = company_result.scalar_one_or_none()
        if company:
            current_count = await _active_worker_count(session, admin.company_id)

    created = []
    skipped = []
    for w in workers:
        existing = await session.execute(select(User).where(User.email == w["email"]))
        if existing.scalar_one_or_none():
            skipped.append(w["email"])
            continue

        if company and current_count >= company.max_workers:
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
        current_count += 1  # seguimiento local sin nueva query

    await session.commit()
    return {"created": created, "skipped": skipped}
