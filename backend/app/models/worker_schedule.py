from datetime import date, time
from typing import Optional, TYPE_CHECKING
from uuid import UUID, uuid4
from sqlmodel import Field, Relationship, SQLModel, UniqueConstraint

if TYPE_CHECKING:
    from app.models.user import User


class WorkerSchedule(SQLModel, table=True):
    __tablename__ = "worker_schedule"
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    schedule_date: date = Field()
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    # Optional second shift for split/partido schedules (e.g. 10:00-14:00 + 17:00-20:00)
    start_time_2: Optional[time] = None
    end_time_2: Optional[time] = None
    user: Optional["User"] = Relationship(back_populates="schedule")

    __table_args__ = (
        UniqueConstraint("user_id", "schedule_date", name="uq_worker_schedule_user_date"),
    )
