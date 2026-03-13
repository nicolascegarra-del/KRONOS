from datetime import date, time
from typing import Optional
from pydantic import BaseModel


class WorkerScheduleDay(BaseModel):
    schedule_date: date
    start_time: Optional[time] = None
    end_time: Optional[time] = None


class WorkerScheduleUpdate(BaseModel):
    days: list[WorkerScheduleDay]
