from uuid import UUID
from datetime import time
from typing import Optional

from pydantic import BaseModel


class WorkerScheduleDay(BaseModel):
    day_of_week: int  # 0=Lunes, ..., 6=Domingo
    start_time: Optional[time] = None
    end_time: Optional[time] = None

    model_config = {"from_attributes": True}


class WorkerScheduleUpdate(BaseModel):
    schedule: list[WorkerScheduleDay]
