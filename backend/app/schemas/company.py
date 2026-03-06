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


class CompanyRead(BaseModel):
    id: UUID
    name: str
    max_workers: int
    geo_enabled: bool
    worker_count: int
    created_at: datetime
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

    model_config = {"from_attributes": True}
