from pydantic import BaseModel, Field


class AppSettingsRead(BaseModel):
    late_alert_enabled: bool
    late_alert_minutes: int
    auto_close_enabled: bool
    auto_close_hours: int

    model_config = {"from_attributes": True}


class AppSettingsUpdate(BaseModel):
    late_alert_enabled: bool
    late_alert_minutes: int = Field(ge=1, le=480)
    auto_close_enabled: bool = False
    auto_close_hours: int = Field(default=12, ge=1, le=168)
