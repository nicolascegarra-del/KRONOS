from uuid import UUID
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, model_validator

from app.models.absence import AbsenceType, AbsenceStatus


class AbsenceCreate(BaseModel):
    type: AbsenceType
    start_date: date
    end_date: date
    notes: Optional[str] = None

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("La fecha de fin debe ser igual o posterior a la de inicio")
        return self


class AbsenceReview(BaseModel):
    status: AbsenceStatus
    admin_notes: Optional[str] = None


class AbsenceOut(BaseModel):
    id: UUID
    user_id: UUID
    type: AbsenceType
    start_date: date
    end_date: date
    notes: Optional[str] = None
    status: AbsenceStatus
    admin_notes: Optional[str] = None
    reviewed_by_id: Optional[UUID] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    user_name: Optional[str] = None
    user_vacation_days: Optional[int] = None  # total vacation days allocated to this worker

    model_config = {"from_attributes": True}


class VacationSummary(BaseModel):
    total: int
    approved: int
    pending: int
    remaining: int
