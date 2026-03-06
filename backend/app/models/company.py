from uuid import UUID, uuid4
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.work_center import WorkCenter


class Company(SQLModel, table=True):
    __tablename__ = "company"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(unique=True, index=True)
    max_workers: int = Field(default=10)
    geo_enabled: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Billing / fiscal data
    nif: Optional[str] = Field(default=None)
    address: Optional[str] = Field(default=None)
    city: Optional[str] = Field(default=None)
    postal_code: Optional[str] = Field(default=None)
    phone: Optional[str] = Field(default=None)
    billing_email: Optional[str] = Field(default=None)

    # Subscription
    subscription_plan: Optional[str] = Field(default=None)  # trial | monthly | annual
    subscription_price: Optional[float] = Field(default=None)
    subscription_discount: Optional[float] = Field(default=0.0)
    subscription_start: Optional[datetime] = Field(default=None)
    subscription_end: Optional[datetime] = Field(default=None)

    users: List["User"] = Relationship(back_populates="company")
    work_centers: List["WorkCenter"] = Relationship(back_populates="company")
