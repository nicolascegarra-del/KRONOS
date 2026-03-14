import base64
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_superadmin
from app.models.adminaccesslog import AdminAccessLog
from app.models.company import Company
from app.models.fichaje import Fichaje
from app.models.absence import Absence
from app.models.user import User, UserRole
from app.models.worker_schedule import WorkerSchedule
from app.models.email_config import EmailConfig
from app.schemas.company import CompanyCreate, CompanyPublic, CompanyRead, CompanyUpdate
from app.schemas.email_config import EmailConfigRead, EmailConfigUpdate, EmailTestRequest
from app.services.auth import hash_password
from app.services.email_service import send_email

router = APIRouter(prefix="/companies", tags=["companies"])


async def _worker_count(session: AsyncSession, company_id: UUID) -> int:
    result = await session.execute(
        select(func.count()).select_from(User).where(
            User.company_id == company_id,
            User.role == UserRole.worker,
            User.is_active == True,
        )
    )
    return result.scalar_one()


def _to_read(c: Company, worker_count: int) -> CompanyRead:
    return CompanyRead(
        id=c.id,
        name=c.name,
        max_workers=c.max_workers,
        geo_enabled=c.geo_enabled,
        schedule_enabled=c.schedule_enabled if c.schedule_enabled is not None else True,
        vacation_enabled=c.vacation_enabled if c.vacation_enabled is not None else True,
        worker_count=worker_count,
        created_at=c.created_at,
        logo_url=c.logo_url,
        nif=c.nif,
        address=c.address,
        city=c.city,
        postal_code=c.postal_code,
        phone=c.phone,
        billing_email=c.billing_email,
        subscription_plan=c.subscription_plan,
        subscription_price=c.subscription_price,
        subscription_discount=c.subscription_discount,
        subscription_start=c.subscription_start,
        subscription_end=c.subscription_end,
    )


@router.get("/mine", response_model=CompanyPublic)
async def get_my_company(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return the current user's company (for admin/worker layouts to load logo)."""
    if not user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No company assigned")
    result = await session.execute(select(Company).where(Company.id == user.company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return company


@router.get("/features")
async def get_company_features(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Return feature flags for the current user's company (usable by admin and worker)."""
    if not user.company_id:
        # Superadmin has no company — all features enabled
        return {"schedule_enabled": True, "vacation_enabled": True}
    result = await session.execute(select(Company).where(Company.id == user.company_id))
    company = result.scalar_one_or_none()
    if not company:
        return {"schedule_enabled": True, "vacation_enabled": True}
    return {
        "schedule_enabled": company.schedule_enabled if company.schedule_enabled is not None else True,
        "vacation_enabled": company.vacation_enabled if company.vacation_enabled is not None else True,
    }


@router.post("/{company_id}/logo", response_model=CompanyRead)
async def upload_company_logo(
    company_id: UUID,
    file: UploadFile = File(...),
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    allowed = {"image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato no permitido (png, jpg, webp, svg)")

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Imagen demasiado grande (máx 2 MB)")

    b64 = base64.b64encode(content).decode()
    company.logo_url = f"data:{file.content_type};base64,{b64}"
    session.add(company)
    await session.commit()
    await session.refresh(company)
    return _to_read(company, await _worker_count(session, company.id))


@router.delete("/{company_id}/logo", response_model=CompanyRead)
async def delete_company_logo(
    company_id: UUID,
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    company.logo_url = None
    session.add(company)
    await session.commit()
    await session.refresh(company)
    return _to_read(company, await _worker_count(session, company.id))


@router.get("", response_model=list[CompanyRead])
async def list_companies(
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Company).order_by(Company.created_at))
    companies = result.scalars().all()

    # Single query for all worker counts (avoids N+1)
    counts_result = await session.execute(
        select(User.company_id, func.count().label("cnt"))
        .where(
            User.company_id.in_([c.id for c in companies]),
            User.role == UserRole.worker,
            User.is_active == True,
        )
        .group_by(User.company_id)
    )
    counts: dict = {row.company_id: row.cnt for row in counts_result.all()}

    return [_to_read(c, counts.get(c.id, 0)) for c in companies]


@router.post("", response_model=CompanyRead, status_code=status.HTTP_201_CREATED)
async def create_company(
    body: CompanyCreate,
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    # Validate uniqueness
    existing_company = await session.execute(
        select(Company).where(Company.name == body.name)
    )
    if existing_company.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una empresa con ese nombre",
        )

    existing_user = await session.execute(
        select(User).where(User.email == body.admin_email)
    )
    if existing_user.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El email del administrador ya está registrado",
        )

    company = Company(name=body.name, max_workers=body.max_workers)
    session.add(company)
    await session.flush()  # populate company.id

    admin = User(
        email=body.admin_email,
        full_name=body.admin_full_name,
        hashed_password=hash_password(body.admin_password),
        role=UserRole.admin,
        company_id=company.id,
    )
    session.add(admin)
    await session.commit()
    await session.refresh(company)

    return _to_read(company, 0)


@router.put("/{company_id}", response_model=CompanyRead)
async def update_company(
    company_id: UUID,
    body: CompanyUpdate,
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    if body.name is not None:
        company.name = body.name
    if body.max_workers is not None:
        company.max_workers = body.max_workers
    if body.geo_enabled is not None:
        company.geo_enabled = body.geo_enabled
    if body.schedule_enabled is not None:
        company.schedule_enabled = body.schedule_enabled
    if body.vacation_enabled is not None:
        company.vacation_enabled = body.vacation_enabled
    if body.nif is not None:
        company.nif = body.nif
    if body.address is not None:
        company.address = body.address
    if body.city is not None:
        company.city = body.city
    if body.postal_code is not None:
        company.postal_code = body.postal_code
    if body.phone is not None:
        company.phone = body.phone
    if body.billing_email is not None:
        company.billing_email = body.billing_email
    if body.subscription_plan is not None:
        company.subscription_plan = body.subscription_plan
    if body.subscription_price is not None:
        company.subscription_price = body.subscription_price
    if body.subscription_discount is not None:
        company.subscription_discount = body.subscription_discount
    if body.subscription_start is not None:
        company.subscription_start = body.subscription_start
    if body.subscription_end is not None:
        company.subscription_end = body.subscription_end

    session.add(company)
    await session.commit()
    await session.refresh(company)

    return _to_read(company, await _worker_count(session, company.id))


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(
    company_id: UUID,
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    # Get all user IDs for this company
    users_result = await session.execute(select(User.id).where(User.company_id == company_id))
    user_ids = [row[0] for row in users_result.all()]

    if user_ids:
        # Block deletion if the company has any fichajes — records must never be destroyed
        fichaje_count_result = await session.execute(
            select(func.count()).select_from(Fichaje).where(Fichaje.user_id.in_(user_ids))
        )
        if fichaje_count_result.scalar_one() > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "No se puede eliminar la empresa porque tiene fichajes registrados. "
                    "Desactiva la empresa en su lugar."
                ),
            )

        # No fichajes — safe to remove schedules, absences, access logs and deactivate users
        await session.execute(delete(AdminAccessLog).where(AdminAccessLog.admin_id.in_(user_ids)))
        await session.execute(delete(WorkerSchedule).where(WorkerSchedule.user_id.in_(user_ids)))
        await session.execute(delete(Absence).where(Absence.user_id.in_(user_ids)))
        await session.execute(delete(Absence).where(Absence.reviewed_by_id.in_(user_ids)))
        await session.execute(delete(User).where(User.id.in_(user_ids)))

    await session.delete(company)
    await session.commit()


# ── Email config (superadmin per company) ─────────────────────────────────────

def _email_to_read(config: EmailConfig) -> EmailConfigRead:
    return EmailConfigRead(
        smtp_host=config.smtp_host,
        smtp_port=config.smtp_port,
        smtp_user=config.smtp_user,
        from_email=config.from_email,
        from_name=config.from_name,
        use_tls=config.use_tls,
        has_password=bool(config.smtp_password),
    )


@router.get("/{company_id}/email-config", response_model=EmailConfigRead)
async def get_company_email_config(
    company_id: UUID,
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(EmailConfig).where(EmailConfig.company_id == company_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        return EmailConfigRead(
            smtp_host="", smtp_port=587, smtp_user="",
            from_email="", from_name="Fichajes", use_tls=True,
        )
    return _email_to_read(config)


@router.put("/{company_id}/email-config", response_model=EmailConfigRead)
async def save_company_email_config(
    company_id: UUID,
    body: EmailConfigUpdate,
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    # Verify company exists
    company_result = await session.execute(select(Company).where(Company.id == company_id))
    if not company_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    result = await session.execute(
        select(EmailConfig).where(EmailConfig.company_id == company_id)
    )
    config = result.scalar_one_or_none()
    if not config:
        config = EmailConfig(company_id=company_id)

    config.smtp_host = body.smtp_host
    config.smtp_port = body.smtp_port
    config.smtp_user = body.smtp_user
    config.from_email = body.from_email
    config.from_name = body.from_name
    config.use_tls = body.use_tls
    if body.smtp_password:
        config.smtp_password = body.smtp_password

    session.add(config)
    await session.commit()
    await session.refresh(config)
    return _email_to_read(config)


@router.post("/{company_id}/email-config/test")
async def test_company_email_config(
    company_id: UUID,
    body: EmailTestRequest,
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(EmailConfig).where(EmailConfig.company_id == company_id)
    )
    config = result.scalar_one_or_none()
    if not config or not config.smtp_host:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Configura primero el servidor SMTP para esta empresa",
        )
    try:
        await send_email(
            config,
            to=body.to,
            subject="✅ Test de configuración — Fichajes",
            body_html=(
                "<p>Este es un correo de prueba enviado desde <strong>Fichajes</strong>.</p>"
                "<p>La configuración SMTP es correcta.</p>"
            ),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error al enviar: {exc}",
        )
    return {"ok": True, "message": f"Email de prueba enviado a {body.to}"}
