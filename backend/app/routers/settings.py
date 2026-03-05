from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_admin
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
        return AppSettingsRead(late_alert_enabled=False, late_alert_minutes=15)
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

    session.add(settings)
    await session.commit()
    await session.refresh(settings)
    return settings


# ── Email config helpers ───────────────────────────────────────────────────────

def _to_read(config: EmailConfig) -> EmailConfigRead:
    return EmailConfigRead(
        smtp_host=config.smtp_host,
        smtp_port=config.smtp_port,
        smtp_user=config.smtp_user,
        from_email=config.from_email,
        from_name=config.from_name,
        use_tls=config.use_tls,
        has_password=bool(config.smtp_password),
    )


@router.get("/email", response_model=EmailConfigRead)
async def get_email_config(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(EmailConfig).where(EmailConfig.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        # Return empty defaults — nothing stored yet
        return EmailConfigRead(
            smtp_host="", smtp_port=587, smtp_user="",
            from_email="", from_name="Fichajes", use_tls=True,
        )
    return _to_read(config)


@router.put("/email", response_model=EmailConfigRead)
async def save_email_config(
    body: EmailConfigUpdate,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(EmailConfig).where(EmailConfig.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        config = EmailConfig(id=1)

    config.smtp_host = body.smtp_host
    config.smtp_port = body.smtp_port
    config.smtp_user = body.smtp_user
    config.from_email = body.from_email
    config.from_name = body.from_name
    config.use_tls = body.use_tls
    if body.smtp_password:  # Only overwrite if a new password was supplied
        config.smtp_password = body.smtp_password

    session.add(config)
    await session.commit()
    await session.refresh(config)
    return _to_read(config)


@router.post("/email/test")
async def test_email_config(
    body: EmailTestRequest,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(EmailConfig).where(EmailConfig.id == 1))
    config = result.scalar_one_or_none()
    if not config or not config.smtp_host:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Configura primero el servidor SMTP",
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
