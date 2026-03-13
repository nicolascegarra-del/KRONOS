import csv
import io
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user
from app.models.fichaje import Fichaje
from app.models.user import User
from app.schemas.user import UserRead

router = APIRouter(prefix="/workers", tags=["workers"])


@router.get("/me", response_model=UserRead)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
):
    """Return the current worker's own profile data."""
    return current_user


class WorkerProfileUpdate(BaseModel):
    full_name: str
    email: EmailStr


@router.put("/me/profile", response_model=UserRead)
async def update_my_profile(
    body: WorkerProfileUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Worker can update their own full_name and email."""
    if body.email != current_user.email:
        existing = await session.execute(select(User).where(User.email == body.email))
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ese email ya está en uso por otra cuenta",
            )
        current_user.email = body.email
    current_user.full_name = body.full_name
    session.add(current_user)
    await session.commit()
    await session.refresh(current_user)
    return current_user


@router.get("/me/export")
async def export_my_data(
    from_date: Optional[date] = Query(default=None),
    to_date: Optional[date] = Query(default=None),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """RGPD Art. 20 — Portability: download fichajes as CSV, optionally filtered by date."""
    query = (
        select(Fichaje)
        .options(selectinload(Fichaje.pausas))
        .where(Fichaje.user_id == current_user.id)
        .order_by(Fichaje.start_time.desc())
    )
    if from_date:
        query = query.where(Fichaje.start_time >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        query = query.where(Fichaje.start_time <= datetime.combine(to_date, datetime.max.time()))

    result = await session.execute(query)
    fichajes = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "fecha", "inicio", "fin", "duracion_minutos",
        "minutos_tarde", "modalidad", "descanso_insuficiente",
        "estado", "pausas", "motivo_edicion",
    ])

    for f in fichajes:
        fecha = f.start_time.date().isoformat() if f.start_time else ""
        inicio = f.start_time.strftime("%H:%M") if f.start_time else ""
        fin = f.end_time.strftime("%H:%M") if f.end_time else ""
        duracion = f.total_minutes or ""
        tarde = f.late_minutes or 0
        modalidad = getattr(f, "modalidad", None) or "presencial"
        rest_viol = "Sí" if getattr(f, "rest_violation", False) else "No"
        estado = f.status.value if f.status else ""

        pausa_parts = []
        for p in sorted(f.pausas, key=lambda x: x.start_time):
            p_start = p.start_time.strftime("%H:%M") if p.start_time else "?"
            p_end = p.end_time.strftime("%H:%M") if p.end_time else "?"
            label = p.comment or "Pausa"
            pausa_parts.append(f"{label} {p_start}-{p_end}")
        pausas_str = "; ".join(pausa_parts)

        writer.writerow([
            fecha, inicio, fin, duracion, tarde, modalidad, rest_viol,
            estado, pausas_str, f.edit_comment or "",
        ])

    csv_bytes = output.getvalue().encode("utf-8-sig")  # BOM for Excel compatibility
    # Use date range in filename if filters applied, otherwise current month
    if from_date or to_date:
        label = f"{from_date or 'inicio'}_{to_date or 'hoy'}"
    else:
        label = datetime.utcnow().strftime("%Y-%m")
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="fichajes_{label}.csv"'},
    )


@router.post("/me/privacy-notice", status_code=status.HTTP_204_NO_CONTENT)
async def accept_privacy_notice(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """RGPD Art. 13 — Record that the worker has read the privacy information notice."""
    current_user.privacy_notice_accepted = True
    current_user.privacy_notice_date = datetime.utcnow()
    session.add(current_user)
    await session.commit()


class GeoConsentBody(BaseModel):
    accepted: bool


@router.post("/me/geo-consent", status_code=status.HTTP_204_NO_CONTENT)
async def save_geo_consent(
    body: GeoConsentBody,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """RGPD Art. 7 — Record explicit geolocation consent."""
    current_user.geo_consent = body.accepted
    current_user.geo_consent_date = datetime.utcnow()
    session.add(current_user)
    await session.commit()


class PreferencesBody(BaseModel):
    monthly_report_enabled: bool


@router.get("/me/preferences")
async def get_preferences(
    current_user: User = Depends(get_current_user),
):
    """Get worker notification preferences."""
    return {"monthly_report_enabled": getattr(current_user, "monthly_report_enabled", False)}


@router.put("/me/preferences", status_code=status.HTTP_204_NO_CONTENT)
async def update_preferences(
    body: PreferencesBody,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Worker notification preferences (e.g. monthly report opt-in)."""
    current_user.monthly_report_enabled = body.monthly_report_enabled
    session.add(current_user)
    await session.commit()
