from uuid import UUID, uuid4
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class AdminAccessLog(SQLModel, table=True):
    __tablename__ = "admin_access_log"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    admin_id: UUID = Field(foreign_key="user.id", index=True)
    action: str  # "VIEW_FICHAJES", "EXPORT_REPORT", "EDIT_FICHAJE"
    target_user_id: Optional[UUID] = Field(default=None)
    accessed_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    details: Optional[str] = Field(default=None)  # JSON with filters used
