from uuid import UUID
from datetime import datetime, time
from typing import Optional
from pydantic import BaseModel, EmailStr

from app.models.user import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: UserRole = UserRole.worker
    scheduled_start: Optional[time] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    scheduled_start: Optional[time] = None
    is_active: Optional[bool] = None


class SuperadminUserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    scheduled_start: Optional[time] = None
    is_active: Optional[bool] = None
    company_id: Optional[UUID] = None


class UserRead(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    scheduled_start: Optional[time] = None
    created_at: datetime
    company_id: Optional[UUID] = None

    model_config = {"from_attributes": True}
