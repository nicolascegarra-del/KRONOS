from uuid import UUID, uuid4
from sqlmodel import SQLModel, Field


class PausaTipo(SQLModel, table=True):
    __tablename__ = "pausa_tipo"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(unique=True, index=True)
    active: bool = Field(default=True)
