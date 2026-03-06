from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from app.database import get_session
from app.dependencies import require_superadmin
from app.models.user import User
from app.models.invoice_config import InvoiceConfig, DEFAULT_TEMPLATE

router = APIRouter(prefix="/invoice-config", tags=["invoice-config"])


class InvoiceConfigRead(BaseModel):
    issuer_name: str
    issuer_nif: str
    issuer_address: str
    issuer_city: str
    issuer_postal_code: str
    issuer_phone: str
    issuer_email: str
    logo_base64: Optional[str] = None
    invoice_prefix: str
    next_invoice_number: int
    notes: Optional[str] = None
    html_template: str

    model_config = {"from_attributes": True}


class InvoiceConfigUpdate(BaseModel):
    issuer_name: Optional[str] = None
    issuer_nif: Optional[str] = None
    issuer_address: Optional[str] = None
    issuer_city: Optional[str] = None
    issuer_postal_code: Optional[str] = None
    issuer_phone: Optional[str] = None
    issuer_email: Optional[str] = None
    logo_base64: Optional[str] = None
    invoice_prefix: Optional[str] = None
    next_invoice_number: Optional[int] = None
    notes: Optional[str] = None
    html_template: Optional[str] = None


async def _get_or_create(session: AsyncSession) -> InvoiceConfig:
    result = await session.execute(select(InvoiceConfig).where(InvoiceConfig.id == 1))
    cfg = result.scalar_one_or_none()
    if not cfg:
        cfg = InvoiceConfig()
        session.add(cfg)
        await session.commit()
        await session.refresh(cfg)
    return cfg


@router.get("", response_model=InvoiceConfigRead)
async def get_invoice_config(
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    return await _get_or_create(session)


@router.put("", response_model=InvoiceConfigRead)
async def update_invoice_config(
    body: InvoiceConfigUpdate,
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    cfg = await _get_or_create(session)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(cfg, field, value)
    session.add(cfg)
    await session.commit()
    await session.refresh(cfg)
    return cfg


@router.post("/increment-number", response_model=InvoiceConfigRead)
async def increment_invoice_number(
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    """Increments next_invoice_number after an invoice is generated."""
    cfg = await _get_or_create(session)
    cfg.next_invoice_number += 1
    session.add(cfg)
    await session.commit()
    await session.refresh(cfg)
    return cfg
