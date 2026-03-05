from uuid import UUID, uuid4
from typing import TYPE_CHECKING, Optional

from sqlmodel import SQLModel, Field, Relationship

if TYPE_CHECKING:
    from app.models.company import Company


class WorkCenter(SQLModel, table=True):
    __tablename__ = "work_center"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    company_id: UUID = Field(foreign_key="company.id", index=True)
    name: str
    lat: float
    lng: float
    radius_meters: int = Field(default=200)

    company: Optional["Company"] = Relationship(back_populates="work_centers")
