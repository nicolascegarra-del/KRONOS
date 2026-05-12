from uuid import UUID
from datetime import date, datetime, time
from typing import Optional
from pydantic import BaseModel, EmailStr

from app.models.user import UserRole, VacationDaysType


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: UserRole = UserRole.worker
    scheduled_start: Optional[time] = None
    scheduled_end: Optional[time] = None
    dni: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    scheduled_start: Optional[time] = None
    scheduled_end: Optional[time] = None
    is_active: Optional[bool] = None
    dni: Optional[str] = None
    vacation_days: Optional[int] = None
    vacation_days_type: Optional[VacationDaysType] = None
    # HR profile
    position: Optional[str] = None
    department: Optional[str] = None
    contract_type: Optional[str] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    region_code: Optional[str] = None


class SuperadminUserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: UserRole = UserRole.worker
    company_id: Optional[UUID] = None
    scheduled_start: Optional[time] = None
    scheduled_end: Optional[time] = None
    dni: Optional[str] = None
    is_active: bool = True


class SuperadminUserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    scheduled_start: Optional[time] = None
    scheduled_end: Optional[time] = None
    is_active: Optional[bool] = None
    company_id: Optional[UUID] = None
    # HR profile
    position: Optional[str] = None
    department: Optional[str] = None
    contract_type: Optional[str] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    region_code: Optional[str] = None


class UserRead(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    scheduled_start: Optional[time] = None
    scheduled_end: Optional[time] = None
    created_at: datetime
    company_id: Optional[UUID] = None
    company_name: Optional[str] = None
    dni: Optional[str] = None
    geo_consent: Optional[bool] = None
    vacation_days: int = 22
    vacation_days_type: VacationDaysType = VacationDaysType.laborales
    # HR profile
    position: Optional[str] = None
    department: Optional[str] = None
    contract_type: Optional[str] = None
    contract_start: Optional[date] = None
    contract_end: Optional[date] = None
    region_code: Optional[str] = None

    model_config = {"from_attributes": True}
