from uuid import UUID, uuid4
from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.user import User


class Company(SQLModel, table=True):
    __tablename__ = "company"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(unique=True, index=True)
    max_workers: int = Field(default=10)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    users: List["User"] = Relationship(back_populates="company")
