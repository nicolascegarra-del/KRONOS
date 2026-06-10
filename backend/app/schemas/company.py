from uuid import UUID
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


class CompanyCreate(BaseModel):
    name: str
    max_workers: int = 10
    # Admin user to create alongside the company
    admin_email: EmailStr
    admin_full_name: str
    admin_password: str


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    max_workers: Optional[int] = None
    geo_enabled: Optional[bool] = None
    schedule_enabled: Optional[bool] = None
    vacation_enabled: Optional[bool] = None
    max_fichajes: Optional[int] = None   # None = don't change; 0 = remove limit
    is_trial: Optional[bool] = None
    docs_enabled: Optional[bool] = None
    max_storage_mb: Optional[int] = None
    tablet_enabled: Optional[bool] = None
    # Billing
    nif: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    phone: Optional[str] = None
    billing_email: Optional[str] = None
    # Subscription
    subscription_plan: Optional[str] = None
    subscription_price: Optional[float] = None
    subscription_discount: Optional[float] = None
    subscription_start: Optional[datetime] = None
    subscription_end: Optional[datetime] = None
    # Plan tier
    plan_tier: Optional[str] = None
    max_documents: Optional[int] = None
    max_vacation_requests: Optional[int] = None


class CompanyRead(BaseModel):
    id: UUID
    name: str
    max_workers: int
    geo_enabled: bool
    schedule_enabled: bool = True
    vacation_enabled: bool = True
    worker_count: int
    created_at: datetime
    logo_url: Optional[str] = None
    is_trial: bool = False
    max_fichajes: Optional[int] = None
    fichaje_count: int = 0   # total fichajes used (populated by router)
    docs_enabled: bool = False
    max_storage_mb: int = 100
    tablet_enabled: bool = False
    # Billing
    nif: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    phone: Optional[str] = None
    billing_email: Optional[str] = None
    # Subscription
    subscription_plan: Optional[str] = None
    subscription_price: Optional[float] = None
    subscription_discount: Optional[float] = None
    subscription_start: Optional[datetime] = None
    subscription_end: Optional[datetime] = None
    # Plan tier
    plan_tier: Optional[str] = None
    max_documents: Optional[int] = None
    max_vacation_requests: Optional[int] = None

    model_config = {"from_attributes": True}


class CompanyPublic(BaseModel):
    """Minimal company info for admin/worker layouts."""
    id: UUID
    name: str
    logo_url: Optional[str] = None

    model_config = {"from_attributes": True}
