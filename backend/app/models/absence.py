from uuid import UUID, uuid4
from datetime import date, datetime
from typing import Optional
from enum import Enum

from sqlmodel import SQLModel, Field


class AbsenceType(str, Enum):
    vacaciones            = "vacaciones"
    baja_medica           = "baja_medica"
    permiso               = "permiso"
    otros                 = "otros"
    asuntos_propios       = "asuntos_propios"        # remunerado, requiere aprobación
    maternidad_paternidad = "maternidad_paternidad"  # remunerado, sin aprobación previa
    lactancia             = "lactancia"              # remunerado, requiere aprobación
    excedencia            = "excedencia"             # no remunerado, requiere aprobación
    permiso_no_retribuido = "permiso_no_retribuido"  # no remunerado, requiere aprobación


class AbsenceStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class Absence(SQLModel, table=True):
    __tablename__ = "absence"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    type: AbsenceType
    start_date: date
    end_date: date
    notes: Optional[str] = None
    status: AbsenceStatus = Field(default=AbsenceStatus.pending)
    admin_notes: Optional[str] = None
    reviewed_by_id: Optional[UUID] = Field(default=None, foreign_key="user.id")
    reviewed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
