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
    user_id: UUID = Field(foreign_key="user.id", index=True)
    start_time: datetime = Field(index=True)
    end_time: Optional[datetime] = None
    status: FichajeStatus = Field(default=FichajeStatus.active, index=True)
    total_minutes: Optional[int] = None   # computed on end
    late_minutes: Optional[int] = None    # minutes after scheduled_start
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None
    out_of_range: Optional[bool] = None  # None = no check, True = outside work center
    modalidad: Optional[str] = Field(default=None)  # "presencial" | "teletrabajo"
    rest_violation: Optional[bool] = None   # True if < 12h rest since last shift (Art. 34.3 ET)
    edit_comment: Optional[str] = None
    last_edited_by_id: Optional[UUID] = None
    last_edited_at: Optional[datetime] = None

    user: Optional["User"] = Relationship(back_populates="fichajes")
    pausas: List["Pausa"] = Relationship(back_populates="fichaje")
