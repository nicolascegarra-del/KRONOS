from uuid import UUID
from pydantic import BaseModel, Field


class PausaTipoRead(BaseModel):
    id: UUID
    name: str
    active: bool

    model_config = {"from_attributes": True}


class PausaTipoCreate(BaseModel):
    name: str = Field(min_length=2, max_length=60)
