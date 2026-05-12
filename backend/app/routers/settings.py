from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel, Field
from app.database import get_session
from app.dependencies import require_admin, require_superadmin
from app.models.app_settings import AppSettings
from app.models.email_config import EmailConfig
from app.models.user import User
from app.schemas.app_settings import AppSettingsRead, AppSettingsUpdate
from app.schemas.email_config import EmailConfigRead, EmailConfigUpdate, EmailTestRequest
from app.services.email_service import send_email

router = APIRouter(prefix="/settings", tags=["settings"])


# ── App settings ──────────────────────────────────────────────────────────────

@router.get("/app", response_model=AppSettingsRead)
async def get_app_settings(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        return AppSettingsRead(late_alert_enabled=False, late_alert_minutes=15,
                               auto_close_enabled=False, auto_close_hours=12)
    return settings


@router.put("/app", response_model=AppSettingsRead)
async def save_app_settings(
    body: AppSettingsUpdate,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = AppSettings(id=1)

    settings.late_alert_enabled = body.late_alert_enabled
    settings.late_alert_minutes = body.late_alert_minutes
    settings.auto_close_enabled = body.auto_close_enabled
    settings.auto_close_hours = body.auto_close_hours
    settings.free_trial_max_fichajes = body.free_trial_max_fichajes

    session.add(settings)
    await session.commit()
    await session.refresh(settings)
    return settings


# ── Superadmin global settings ────────────────────────────────────────────────

class SuperadminSettingsUpdate(BaseModel):
    free_trial_max_fichajes: int = Field(default=60, ge=1, le=100000)


@router.get("/superadmin", response_model=AppSettingsRead)
async def get_superadmin_settings(
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        return AppSettingsRead(late_alert_enabled=False, late_alert_minutes=15,
                               auto_close_enabled=False, auto_close_hours=12,
                               free_trial_max_fichajes=60)
    return settings


@router.put("/superadmin", response_model=AppSettingsRead)
async def save_superadmin_settings(
    body: SuperadminSettingsUpdate,
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = AppSettings(id=1)
    settings.free_trial_max_fichajes = body.free_trial_max_fichajes
    session.add(settings)
    await session.commit()
    await session.refresh(settings)
    return settings


# ── Internal helper (used by email sending functions) ─────────────────────────

async def _get_email_config(session: AsyncSession, company_id: Optional[UUID]) -> Optional[EmailConfig]:
    """Load EmailConfig for the given company_id.

    Si la empresa no tiene SMTP propio, devuelve la fila singleton (company_id IS NULL)
    que actúa como fallback global de Klyp.
    """
    if company_id is not None:
        result = await session.execute(
            select(EmailConfig).where(EmailConfig.company_id == company_id)
        )
        config = result.scalar_one_or_none()
        if config and config.smtp_host:
            return config
    # Fallback: global singleton (company_id IS NULL) — Klyp SMTP
    result = await session.execute(
        select(EmailConfig).where(EmailConfig.company_id == None)  # noqa: E711
    )
    return result.scalar_one_or_none()


# ── Superadmin global SMTP (fallback Klyp) ────────────────────────────────────

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


@router.get("/superadmin/email-config", response_model=EmailConfigRead)
async def get_global_email_config(
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    """SMTP global de Klyp (fallback cuando una empresa no tiene SMTP propio)."""
    result = await session.execute(
        select(EmailConfig).where(EmailConfig.company_id == None)  # noqa: E711
    )
    config = result.scalar_one_or_none()
    if not config:
        return EmailConfigRead(
            smtp_host="", smtp_port=587, smtp_user="",
            from_email="", from_name="Fichajes", use_tls=True,
        )
    return _email_to_read(config)


@router.put("/superadmin/email-config", response_model=EmailConfigRead)
async def save_global_email_config(
    body: EmailConfigUpdate,
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(EmailConfig).where(EmailConfig.company_id == None)  # noqa: E711
    )
    config = result.scalar_one_or_none()
    if not config:
        config = EmailConfig(company_id=None)

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


@router.post("/superadmin/email-config/test")
async def test_global_email_config(
    body: EmailTestRequest,
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(EmailConfig).where(EmailConfig.company_id == None)  # noqa: E711
    )
    config = result.scalar_one_or_none()
    if not config or not config.smtp_host:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Configura primero el SMTP global de Klyp",
        )
    try:
        await send_email(
            config,
            to=body.to,
            subject="✅ Test SMTP global Klyp — Fichajes",
            body_html=(
                "<p>Email de prueba enviado desde el <strong>SMTP global de Klyp</strong>.</p>"
                "<p>La configuración es correcta.</p>"
            ),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error al enviar: {exc}",
        )
    return {"ok": True, "message": f"Email de prueba enviado a {body.to}"}
