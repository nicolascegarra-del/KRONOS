from enum import Enum
from uuid import UUID, uuid4
from datetime import date, datetime, time
from typing import TYPE_CHECKING, Optional, List

from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.fichaje import Fichaje
    from app.models.company import Company
    from app.models.worker_schedule import WorkerSchedule


class UserRole(str, Enum):
    superadmin = "superadmin"
    admin = "admin"
    worker = "worker"
    tablet = "tablet"  # cuenta de kiosco compartida (pantalla de fichaje por código)


class VacationDaysType(str, Enum):
    """Si los días anuales de vacaciones se cuentan como laborales (L-V, sin festivos) o naturales (todos)."""
    laborales = "laborales"
    naturales = "naturales"


class User(SQLModel, table=True):
    __tablename__ = "user"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(unique=True, index=True)
    full_name: str
    hashed_password: str
    role: UserRole = Field(default=UserRole.worker, index=True)
    is_active: bool = True
    scheduled_start: Optional[time] = None  # e.g. 09:00 for lateness alerts
    scheduled_end: Optional[time] = None    # e.g. 18:00 for overtime calculation (Art. 35 ET)
    work_center_id: Optional[UUID] = Field(default=None, foreign_key="work_center.id")  # assigned center; None = any
    created_at: datetime = Field(default_factory=datetime.utcnow)
    company_id: Optional[UUID] = Field(default=None, foreign_key="company.id", index=True)

    vacation_days: int = Field(default=22)  # total vacation days allocated per year
    vacation_days_type: VacationDaysType = Field(default=VacationDaysType.laborales)
    monthly_report_enabled: bool = Field(default=False)

    dni: Optional[str] = Field(default=None)
    fichaje_code: Optional[str] = Field(default=None, index=True)  # código numérico (4-6) para fichaje por tablet; único por empresa
    geo_consent: Optional[bool] = Field(default=None)
    geo_consent_date: Optional[datetime] = Field(default=None)
    privacy_notice_accepted: Optional[bool] = Field(default=None)
    privacy_notice_date: Optional[datetime] = Field(default=None)

    # HR profile
    position: Optional[str] = Field(default=None)        # puesto / cargo
    department: Optional[str] = Field(default=None)      # departamento
    contract_type: Optional[str] = Field(default=None)   # indefinido|temporal|practicas|formacion|autonomo
    contract_start: Optional[date] = Field(default=None) # fecha inicio contrato
    contract_end: Optional[date] = Field(default=None)   # fecha fin (None = indefinido)
    region_code: Optional[str] = Field(default=None)     # ES-MD, ES-CT, etc. para festivos

    fichajes: List["Fichaje"] = Relationship(back_populates="user")
    company: Optional["Company"] = Relationship(back_populates="users")
    schedule: List["WorkerSchedule"] = Relationship(back_populates="user")
