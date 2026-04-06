from pydantic import BaseModel, Field


class AppSettingsRead(BaseModel):
    late_alert_enabled: bool
    late_alert_minutes: int
    auto_close_enabled: bool
    auto_close_hours: int
    free_trial_max_fichajes: int = 60

    model_config = {"from_attributes": True}


class AppSettingsUpdate(BaseModel):
    late_alert_enabled: bool
    late_alert_minutes: int = Field(ge=1, le=480)
    auto_close_enabled: bool = False
    auto_close_hours: int = Field(default=12, ge=1, le=168)
    free_trial_max_fichajes: int = Field(default=60, ge=1, le=100000)
