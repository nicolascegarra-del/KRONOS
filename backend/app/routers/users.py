import asyncio
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.dependencies import require_admin
from app.models.company import Company
from app.models.password_reset import PasswordResetToken
from app.models.user import User, UserRole
from app.schemas.user import TabletUserCreate, UserCreate, UserRead, UserUpdate
from app.services.auth import hash_password
from app.services.import_export import generate_csv_template, parse_workers_csv

router = APIRouter(prefix="/users", tags=["users"])

_FICHAJE_CODE_RE = re.compile(r"^\d{4,6}$")


async def _validate_fichaje_code(
    session: AsyncSession,
    company_id: Optional[UUID],
    code: str,
    exclude_user_id: Optional[UUID] = None,
) -> None:
    """Valida formato (4-6 dígitos) y unicidad del código dentro de la empresa."""
    if not _FICHAJE_CODE_RE.match(code):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El código de fichaje debe tener entre 4 y 6 dígitos numéricos",
        )
    query = select(User.id).where(
        User.company_id == company_id,
        User.fichaje_code == code,
    )
    if exclude_user_id is not None:
        query = query.where(User.id != exclude_user_id)
    existing = await session.execute(query)
    if existing.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un trabajador con ese código de fichaje en la empresa",
        )


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
        .where(User.company_id == admin.company_id, User.role != UserRole.tablet)
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

    # Cuando se envía set-password link, generamos una pwd aleatoria que nadie
    # llega a conocer (el trabajador la sobreescribe al usar el token).
    if body.send_set_password_link:
        initial_password = secrets.token_urlsafe(24)
    else:
        if not body.password or len(body.password) < 8:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="La contraseña debe tener al menos 8 caracteres",
            )
        initial_password = body.password

    if body.fichaje_code is not None:
        await _validate_fichaje_code(session, admin.company_id, body.fichaje_code)

    user = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(initial_password),
        role=body.role,
        scheduled_start=body.scheduled_start,
        scheduled_end=body.scheduled_end,
        dni=body.dni,
        fichaje_code=body.fichaje_code,
        company_id=admin.company_id,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    if body.send_set_password_link:
        # Token de 7 días para que el trabajador establezca su contraseña.
        token_value = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7)
        session.add(PasswordResetToken(user_id=user.id, token=token_value, expires_at=expires))
        await session.commit()
        cfg = get_settings()
        set_password_link = f"{cfg.APP_URL}/reset-password?token={token_value}"
        asyncio.create_task(_fire_set_password_email(
            admin.company_id, user.email, user.full_name, set_password_link
        ))
    else:
        # Fire-and-forget welcome email con la pwd elegida por el admin
        asyncio.create_task(_fire_welcome_email(admin.company_id, user.email, user.full_name, initial_password))

    return user


async def _fire_set_password_email(company_id, to_email: str, full_name: str, link: str) -> None:
    """Envía email tipo 'establece tu contraseña' al dar de alta a un trabajador."""
    try:
        from app.database import AsyncSessionLocal
        from app.routers.settings import _get_email_config
        from app.services.email_service import send_password_reset_email

        async with AsyncSessionLocal() as s:
            config = await _get_email_config(s, company_id)
        await send_password_reset_email(config, to_email, full_name, link)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("[set-password-email] Error enviando a %s: %s", to_email, exc)


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: UUID,
    body: dict,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Admin resets a worker's password. Optionally sends email notification.

    El envío se espera y se reporta al cliente: la respuesta incluye
    `email_sent` y `email_error` (cuando proceda) para que el admin sepa
    si el trabajador recibió el aviso o por qué falló.
    """
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

    email_sent = False
    email_error: Optional[str] = None
    if body.get("send_email", True):
        email_sent, email_error = await _send_admin_password_reset_email(
            admin.company_id, user.email, user.full_name, new_password
        )

    return {"ok": True, "email_sent": email_sent, "email_error": email_error}


async def _send_admin_password_reset_email(
    company_id, to_email: str, full_name: str, new_password: str
) -> tuple[bool, Optional[str]]:
    """Envía el email de aviso de password reset.

    Devuelve (sent, error_msg). Si no hay SMTP configurado (ni el de la empresa
    ni el global de Klyp) → (False, "SMTP no configurado").
    """
    import logging
    log = logging.getLogger(__name__)
    try:
        from app.database import AsyncSessionLocal
        from app.routers.settings import _get_email_config
        from app.services.email_service import send_admin_password_reset_email

        cfg = get_settings()
        async with AsyncSessionLocal() as s:
            config = await _get_email_config(s, company_id)
        if not config or not config.smtp_host:
            return False, "No hay SMTP configurado (ni para la empresa ni global)"
        await send_admin_password_reset_email(config, to_email, full_name, new_password, cfg.APP_URL)
        return True, None
    except Exception as exc:
        log.exception("[admin-reset-email] Error enviando email a %s", to_email)
        return False, f"{exc.__class__.__name__}: {exc}"


@router.post("/{user_id}/fichaje-code/email")
async def send_fichaje_code(
    user_id: UUID,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Reenvía por email al trabajador su código de fichaje actual.

    Devuelve `email_sent` y `email_error` igual que el reset de contraseña.
    """
    result = await session.execute(
        select(User).where(User.id == user_id, User.company_id == admin.company_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.fichaje_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El trabajador no tiene un código de fichaje asignado",
        )

    company_result = await session.execute(
        select(Company.name).where(Company.id == admin.company_id)
    )
    company_name = company_result.scalar_one_or_none()

    email_sent, email_error = await _send_fichaje_code_email(
        admin.company_id, user.email, user.full_name, user.fichaje_code, company_name
    )
    return {"ok": True, "email_sent": email_sent, "email_error": email_error}


async def _send_fichaje_code_email(
    company_id, to_email: str, full_name: str, code: str, company_name: Optional[str]
) -> tuple[bool, Optional[str]]:
    """Envía el email con el código de fichaje. Devuelve (sent, error_msg)."""
    import logging
    log = logging.getLogger(__name__)
    try:
        from app.database import AsyncSessionLocal
        from app.routers.settings import _get_email_config
        from app.services.email_service import send_fichaje_code_email

        async with AsyncSessionLocal() as s:
            config = await _get_email_config(s, company_id)
        if not config or not config.smtp_host:
            return False, "No hay SMTP configurado (ni para la empresa ni global)"
        await send_fichaje_code_email(config, to_email, full_name, code, company_name)
        return True, None
    except Exception as exc:
        log.exception("[fichaje-code-email] Error enviando email a %s", to_email)
        return False, f"{exc.__class__.__name__}: {exc}"


# ── Cuentas tablet (kiosco de fichaje) ──────────────────────────────────────────

async def _require_tablet_module(session: AsyncSession, company_id: UUID) -> Company:
    """Carga la empresa y verifica que el módulo tablet esté activado (403 si no)."""
    result = await session.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    if not company.tablet_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El módulo de tablet de fichaje no está activado para esta empresa",
        )
    return company


@router.get("/tablet", response_model=list[UserRead])
async def list_tablet_users(
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    result = await session.execute(
        select(User)
        .where(User.company_id == admin.company_id, User.role == UserRole.tablet)
        .order_by(User.created_at)
    )
    return result.scalars().all()


@router.post("/tablet", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_tablet_user(
    body: TabletUserCreate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    await _require_tablet_module(session, admin.company_id)

    if len(body.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La contraseña debe tener al menos 8 caracteres",
        )

    existing = await session.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=UserRole.tablet,
        company_id=admin.company_id,
        work_center_id=body.work_center_id,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.delete("/tablet/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tablet_user(
    user_id: UUID,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    result = await session.execute(
        select(User).where(
            User.id == user_id,
            User.company_id == admin.company_id,
            User.role == UserRole.tablet,
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tablet user not found")
    await session.delete(user)
    await session.commit()


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

    # Validar código de fichaje (formato + unicidad en la empresa). "" => limpiar.
    if "fichaje_code" in update_data:
        code = update_data["fichaje_code"]
        if code:
            await _validate_fichaje_code(session, user.company_id, code, exclude_user_id=user.id)
        else:
            update_data["fichaje_code"] = None

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
