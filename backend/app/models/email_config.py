from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import SQLModel, Field


class EmailConfig(SQLModel, table=True):
    __tablename__ = "email_config"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    company_id: Optional[UUID] = Field(default=None, foreign_key="company.id", index=True)
    smtp_host: str = Field(default="")
    smtp_port: int = Field(default=587)
    smtp_user: str = Field(default="")
    smtp_password: str = Field(default="")  # stored as-is; admin-controlled app
    from_email: str = Field(default="")
    from_name: str = Field(default="Fichajes")
    use_tls: bool = Field(default=True)
