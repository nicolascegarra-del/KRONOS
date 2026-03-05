from uuid import UUID, uuid4
from datetime import time
from typing import Optional, TYPE_CHECKING

from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint

if TYPE_CHECKING:
    from app.models.user import User


class WorkerSchedule(SQLModel, table=True):
    __tablename__ = "worker_schedule"
    __table_args__ = (UniqueConstraint("user_id", "day_of_week", name="uq_worker_schedule_user_day"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    day_of_week: int  # 0=Lunes, 1=Martes, ..., 6=Domingo
    start_time: Optional[time] = None
    end_time: Optional[time] = None

    user: Optional["User"] = Relationship(back_populates="schedule")
