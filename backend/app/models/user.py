from enum import Enum
from uuid import UUID, uuid4
from datetime import datetime, time
from typing import TYPE_CHECKING, Optional, List
from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.fichaje import Fichaje


class UserRole(str, Enum):
    admin = "admin"
    worker = "worker"


class User(SQLModel, table=True):
    __tablename__ = "user"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(unique=True, index=True)
    full_name: str
    hashed_password: str
    role: UserRole = Field(default=UserRole.worker)
    is_active: bool = True
    scheduled_start: Optional[time] = None  # e.g. 09:00 for lateness alerts
    created_at: datetime = Field(default_factory=datetime.utcnow)

    fichajes: List["Fichaje"] = Relationship(back_populates="user")
