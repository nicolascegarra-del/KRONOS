from uuid import UUID
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

from app.models.fichaje import FichajeStatus


class UserBasic(BaseModel):
    id: UUID
    email: str
    full_name: str

    model_config = {"from_attributes": True}


class PausaRead(BaseModel):
    id: UUID
    fichaje_id: UUID
    start_time: datetime
    end_time: Optional[datetime] = None
    comment: str
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None

    model_config = {"from_attributes": True}


class GeoCoords(BaseModel):
    lat: float
    lng: float


class PauseRequest(BaseModel):
    comment: str = Field(min_length=3)
    coords: Optional[GeoCoords] = None


class StartRequest(BaseModel):
    coords: Optional[GeoCoords] = None


class EndRequest(BaseModel):
    coords: Optional[GeoCoords] = None


class ResumeRequest(BaseModel):
    coords: Optional[GeoCoords] = None


class FichajeRead(BaseModel):
    id: UUID
    user_id: UUID
    start_time: datetime
    end_time: Optional[datetime] = None
    status: FichajeStatus
    total_minutes: Optional[int] = None
    late_minutes: Optional[int] = None
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None
    out_of_range: Optional[bool] = None
    pausas: List[PausaRead] = []

    model_config = {"from_attributes": True}


class FichajeAdminRead(FichajeRead):
    user: Optional[UserBasic] = None


class FichajeAdminUpdate(BaseModel):
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[FichajeStatus] = None
    total_minutes: Optional[int] = None
    late_minutes: Optional[int] = None
    out_of_range: Optional[bool] = None
