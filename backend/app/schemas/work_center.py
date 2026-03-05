from uuid import UUID
from typing import Optional
from pydantic import BaseModel


class WorkCenterCreate(BaseModel):
    name: str
    lat: float
    lng: float
    radius_meters: int = 200


class WorkCenterUpdate(BaseModel):
    name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_meters: Optional[int] = None


class WorkCenterRead(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    lat: float
    lng: float
    radius_meters: int

    model_config = {"from_attributes": True}
