from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class EmailConfigRead(BaseModel):
    smtp_host: str
    smtp_port: int
    smtp_user: str
    from_email: str
    from_name: str
    use_tls: bool
    has_password: bool = False  # True when a password is stored

    model_config = {"from_attributes": True}


class EmailConfigUpdate(BaseModel):
    smtp_host: str
    smtp_port: int = 587
    smtp_user: str
    smtp_password: Optional[str] = None  # None = keep existing
    from_email: str
    from_name: str = "Fichajes"
    use_tls: bool = True


class EmailTestRequest(BaseModel):
    to: str
