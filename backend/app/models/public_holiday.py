from uuid import UUID, uuid4
from datetime import date

from sqlmodel import SQLModel, Field


class PublicHoliday(SQLModel, table=True):
    __tablename__ = "public_holiday"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    region_code: str = Field(index=True)   # ES-MD, ES-CT, etc.
    holiday_date: date = Field(index=True)
    name: str
    year: int = Field(index=True)
