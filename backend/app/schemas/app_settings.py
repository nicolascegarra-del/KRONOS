from pydantic import BaseModel, Field


class AppSettingsRead(BaseModel):
    late_alert_enabled: bool
    late_alert_minutes: int

    model_config = {"from_attributes": True}


class AppSettingsUpdate(BaseModel):
    late_alert_enabled: bool
    late_alert_minutes: int = Field(ge=1, le=480)
