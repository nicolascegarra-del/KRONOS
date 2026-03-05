from enum import Enum
from uuid import UUID, uuid4
from datetime import datetime
from typing import TYPE_CHECKING, Optional, List
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.pausa import Pausa


class FichajeStatus(str, Enum):
    active = "active"
    paused = "paused"
    finished = "finished"


class Fichaje(SQLModel, table=True):
    __tablename__ = "fichaje"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id")
    start_time: datetime
    end_time: Optional[datetime] = None
    status: FichajeStatus = Field(default=FichajeStatus.active)
    total_minutes: Optional[int] = None   # computed on end
    late_minutes: Optional[int] = None    # minutes after scheduled_start
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None

    user: Optional["User"] = Relationship(back_populates="fichajes")
    pausas: List["Pausa"] = Relationship(back_populates="fichaje")
