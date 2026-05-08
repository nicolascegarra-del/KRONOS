from uuid import UUID
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, model_validator

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
    modalidad: Optional[str] = None  # "presencial" | "teletrabajo"


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
    modalidad: Optional[str] = None
    rest_violation: Optional[bool] = None
    pausas: List[PausaRead] = []

    model_config = {"from_attributes": True}


class FichajeAdminRead(FichajeRead):
    user: Optional[UserBasic] = None
    edit_comment: Optional[str] = None
    last_edited_at: Optional[datetime] = None


class FichajeAdminUpdate(BaseModel):
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[FichajeStatus] = None
    total_minutes: Optional[int] = None
    late_minutes: Optional[int] = None
    out_of_range: Optional[bool] = None
    modalidad: Optional[str] = None
    edit_comment: str = Field(min_length=3)


class FichajeAdminCreate(BaseModel):
    """Payload para que admin/superadmin creen un fichaje manualmente.

    El backend ignora `company_id` y deriva la empresa del `user_id`. Para admin,
    se valida que el target pertenezca a su empresa; para superadmin no hay filtro.
    """

    user_id: UUID
    company_id: Optional[UUID] = None  # informativo en superadmin
    start_time: datetime
    end_time: Optional[datetime] = None
    modalidad: Optional[str] = "presencial"
    late_minutes: Optional[int] = Field(default=None, ge=0)
    total_minutes: Optional[int] = Field(default=None, ge=0)
    out_of_range: Optional[bool] = False
    edit_comment: str = Field(min_length=3, max_length=500)

    @model_validator(mode="after")
    def _validate(self) -> "FichajeAdminCreate":
        if self.modalidad not in (None, "presencial", "teletrabajo"):
            raise ValueError("modalidad must be 'presencial' or 'teletrabajo'")
        if self.end_time is not None and self.start_time is not None:
            if self.end_time <= self.start_time:
                raise ValueError("end_time must be after start_time")
        # start_time no puede ser futuro (margen 5 min para desfase de reloj)
        now_utc = datetime.now(timezone.utc)
        st = self.start_time
        if st is not None:
            st_utc = st.astimezone(timezone.utc) if st.tzinfo else st.replace(tzinfo=timezone.utc)
            if st_utc > now_utc + timedelta(minutes=5):
                raise ValueError("start_time cannot be in the future")
        return self


class FieldChange(BaseModel):
    before: Optional[str] = None
    after: Optional[str] = None


class FichajeAdminListResponse(BaseModel):
    items: List[FichajeAdminRead]
    total: int


class FichajeEditLogRead(BaseModel):
    id: UUID
    edited_at: datetime
    edited_by: Optional[UserBasic] = None
    comment: str
    changes: dict[str, FieldChange]
