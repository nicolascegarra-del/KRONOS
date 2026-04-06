from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel, Field
from app.database import get_session
from app.dependencies import require_admin, require_superadmin
from app.models.app_settings import AppSettings
from app.models.email_config import EmailConfig
from app.models.user import User
from app.schemas.app_settings import AppSettingsRead, AppSettingsUpdate

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
    """Load EmailConfig for the given company_id."""
    if company_id is not None:
        result = await session.execute(
            select(EmailConfig).where(EmailConfig.company_id == company_id)
        )
        config = result.scalar_one_or_none()
        if config:
            return config
    # Fallback: legacy singleton row (company_id IS NULL)
    result = await session.execute(
        select(EmailConfig).where(EmailConfig.company_id == None)  # noqa: E711
    )
    return result.scalar_one_or_none()
