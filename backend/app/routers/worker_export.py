import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user
from app.models.fichaje import Fichaje
from app.models.pausa import Pausa
from app.models.user import User

router = APIRouter(prefix="/workers", tags=["workers"])


@router.get("/me/export")
async def export_my_data(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """RGPD Art. 20 — Portability: download all fichajes as CSV."""
    result = await session.execute(
        select(Fichaje)
        .options(selectinload(Fichaje.pausas))
        .where(Fichaje.user_id == current_user.id)
        .order_by(Fichaje.start_time.desc())
    )
    fichajes = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "fecha", "inicio", "fin", "duracion_minutos",
        "minutos_tarde", "estado", "pausas", "motivo_edicion",
    ])

    for f in fichajes:
        fecha = f.start_time.date().isoformat() if f.start_time else ""
        inicio = f.start_time.strftime("%H:%M") if f.start_time else ""
        fin = f.end_time.strftime("%H:%M") if f.end_time else ""
        duracion = f.total_minutes or ""
        tarde = f.late_minutes or 0
        estado = f.status.value if f.status else ""

        pausa_parts = []
        for p in sorted(f.pausas, key=lambda x: x.start_time):
            p_start = p.start_time.strftime("%H:%M") if p.start_time else "?"
            p_end = p.end_time.strftime("%H:%M") if p.end_time else "?"
            label = p.comment or "Pausa"
            pausa_parts.append(f"{label} {p_start}-{p_end}")
        pausas_str = "; ".join(pausa_parts)

        writer.writerow([
            fecha, inicio, fin, duracion, tarde, estado,
            pausas_str, f.edit_comment or "",
        ])

    csv_bytes = output.getvalue().encode("utf-8-sig")  # BOM for Excel compatibility
    month = datetime.utcnow().strftime("%Y-%m")
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="fichajes_{month}.csv"'},
    )


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
