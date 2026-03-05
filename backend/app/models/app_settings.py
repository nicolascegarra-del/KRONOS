from sqlmodel import SQLModel, Field


class AppSettings(SQLModel, table=True):
    __tablename__ = "app_settings"

    id: int = Field(default=1, primary_key=True)  # singleton row
    late_alert_enabled: bool = Field(default=False)
    late_alert_minutes: int = Field(default=15)
    auto_close_enabled: bool = Field(default=False)
    auto_close_hours: int = Field(default=12)
