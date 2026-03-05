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


class CompanyRead(BaseModel):
    id: UUID
    name: str
    max_workers: int
    worker_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
