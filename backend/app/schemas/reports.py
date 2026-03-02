from uuid import UUID
from datetime import date
from typing import List, Optional
from pydantic import BaseModel


class WorkerHoursSummary(BaseModel):
    user_id: UUID
    full_name: str
    email: str
    total_minutes: int
    total_hours: float
    late_minutes: int
    fichaje_count: int
    pause_count: int


class HoursReport(BaseModel):
    from_date: date
    to_date: date
    workers: List[WorkerHoursSummary]


class LatenessAlert(BaseModel):
    user_id: UUID
    full_name: str
    email: str
    date: date
    scheduled_start: Optional[str]
    actual_start: str
    late_minutes: int
