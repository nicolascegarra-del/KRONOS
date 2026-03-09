from uuid import UUID, uuid4
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class FichajeEditLog(SQLModel, table=True):
    __tablename__ = "fichaje_edit_log"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    fichaje_id: UUID = Field(foreign_key="fichaje.id")
    edited_at: datetime = Field(default_factory=datetime.utcnow)
    edited_by_id: UUID = Field(foreign_key="user.id")
    comment: str
    original_data: str  # JSON snapshot of the fichaje before the edit
