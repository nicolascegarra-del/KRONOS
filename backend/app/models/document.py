from uuid import UUID, uuid4
from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class Document(SQLModel, table=True):
    __tablename__ = "document"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    company_id: UUID = Field(foreign_key="company.id", index=True)
    # user_id is null when the DNI was not found among company workers
    user_id: Optional[UUID] = Field(default=None, foreign_key="user.id", index=True, nullable=True)
    filename: str                              # original filename shown to users
    stored_path: str = Field(unique=True)      # absolute path on disk
    content_type: str
    size_bytes: int
    uploaded_by: UUID = Field(foreign_key="user.id")
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    category: Optional[str] = Field(default=None)    # nomina | contrato | otros
    description: Optional[str] = Field(default=None)
    is_read: bool = Field(default=False)              # worker has opened/viewed this doc
