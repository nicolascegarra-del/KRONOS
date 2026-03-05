from typing import Optional
from sqlmodel import SQLModel, Field


class EmailConfig(SQLModel, table=True):
    __tablename__ = "email_config"

    id: int = Field(default=1, primary_key=True)  # singleton row
    smtp_host: str = Field(default="")
    smtp_port: int = Field(default=587)
    smtp_user: str = Field(default="")
    smtp_password: str = Field(default="")  # stored as-is; admin-controlled app
    from_email: str = Field(default="")
    from_name: str = Field(default="Fichajes")
    use_tls: bool = Field(default=True)
