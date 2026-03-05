from uuid import UUID, uuid4
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.fichaje import Fichaje


class Pausa(SQLModel, table=True):
    __tablename__ = "pausa"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    fichaje_id: UUID = Field(foreign_key="fichaje.id")
    start_time: datetime
    end_time: Optional[datetime] = None
    comment: str = Field(min_length=1)
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None

    fichaje: Optional["Fichaje"] = Relationship(back_populates="pausas")
