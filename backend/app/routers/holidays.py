from __future__ import annotations

import calendar
from datetime import date
from typing import Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_admin
from app.models.absence import Absence, AbsenceStatus
from app.models.public_holiday import PublicHoliday
from app.models.user import User, UserRole

router = APIRouter(tags=["holidays"])

OPENHOLIDAYS_URL = "https://openholidaysapi.org/PublicHolidays"


# ── Schemas ───────────────────────────────────────────────────────────────────

class HolidayOut(BaseModel):
    holiday_date: date
    name: str
    region_code: str


class WorkerCalendarEntry(BaseModel):
    user_id: UUID
    full_name: str
    department: Optional[str] = None
    region_code: Optional[str] = None
    absences: list[dict]   # [{start_date, end_date, type, status}]
    holidays: list[str]    # list of ISO date strings that are holidays


# ── Sync festivos from OpenHolidays API ──────────────────────────────────────

@router.post("/admin/holidays/sync")
async def sync_holidays(
    region_code: str = Query(..., description="ES-MD, ES-CT, ES-AN, etc."),
    year: int = Query(...),
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Fetch public holidays from OpenHolidays API and cache in DB."""
    from_date = f"{year}-01-01"
    to_date = f"{year}-12-31"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                OPENHOLIDAYS_URL,
                params={
                    "countryIsoCode": "ES",
                    "subdivisionCode": region_code,
                    "validFrom": from_date,
                    "validTo": to_date,
                    "languageIsoCode": "ES",
                },
            )
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Error al contactar OpenHolidays API: {exc}")

    # Delete existing cache for this region+year
    await session.execute(
        delete(PublicHoliday).where(
            PublicHoliday.region_code == region_code,
            PublicHoliday.year == year,
        )
    )

    # Insert new holidays
    count = 0
    for item in data:
        raw_date = item.get("startDate", "")[:10]
        try:
            h_date = date.fromisoformat(raw_date)
        except ValueError:
            continue

        # Extract Spanish name
        names = item.get("name", [])
        name_es = next((n["text"] for n in names if n.get("language") == "ES"), None)
        if not name_es and names:
            name_es = names[0].get("text", "Festivo")
        if not name_es:
            name_es = "Festivo"

        session.add(PublicHoliday(
            region_code=region_code,
            holiday_date=h_date,
            name=name_es,
            year=year,
        ))
        count += 1

    await session.commit()
    return {"synced": count, "region_code": region_code, "year": year}


# ── Get cached holidays ───────────────────────────────────────────────────────

@router.get("/admin/holidays", response_model=list[HolidayOut])
async def get_holidays(
    region_code: str = Query(...),
    year: int = Query(...),
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(PublicHoliday)
        .where(PublicHoliday.region_code == region_code, PublicHoliday.year == year)
        .order_by(PublicHoliday.holiday_date)
    )
    rows = result.scalars().all()
    return [HolidayOut(holiday_date=r.holiday_date, name=r.name, region_code=r.region_code) for r in rows]


# ── Team calendar ─────────────────────────────────────────────────────────────

@router.get("/admin/team-calendar", response_model=list[WorkerCalendarEntry])
async def get_team_calendar(
    year: int = Query(...),
    month: int = Query(...),
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    first_day = date(year, month, 1)
    last_day = date(year, month, calendar.monthrange(year, month)[1])

    # 1 query — all active workers in the company
    workers_result = await session.execute(
        select(User).where(
            User.company_id == admin.company_id,
            User.role == UserRole.worker,
            User.is_active == True,
        ).order_by(User.department, User.full_name)
    )
    workers = workers_result.scalars().all()
    if not workers:
        return []

    worker_ids = [w.id for w in workers]

    # 1 query — all absences in the month for all workers
    absences_result = await session.execute(
        select(Absence).where(
            Absence.user_id.in_(worker_ids),
            Absence.start_date <= last_day,
            Absence.end_date >= first_day,
            Absence.status != AbsenceStatus.rejected,
        )
    )
    absences_by_worker: dict[UUID, list[Absence]] = {}
    for ab in absences_result.scalars().all():
        absences_by_worker.setdefault(ab.user_id, []).append(ab)

    # 1 query — all cached holidays for all regions used by workers in this month
    region_codes = {w.region_code for w in workers if w.region_code}
    holidays_by_region: dict[str, set[str]] = {}
    if region_codes:
        holidays_result = await session.execute(
            select(PublicHoliday).where(
                PublicHoliday.region_code.in_(region_codes),
                PublicHoliday.year == year,
                PublicHoliday.holiday_date >= first_day,
                PublicHoliday.holiday_date <= last_day,
            )
        )
        for h in holidays_result.scalars().all():
            holidays_by_region.setdefault(h.region_code, set()).add(h.holiday_date.isoformat())

    # Build response
    entries = []
    for worker in workers:
        worker_absences = [
            {
                "start_date": ab.start_date.isoformat(),
                "end_date": ab.end_date.isoformat(),
                "type": ab.type,
                "status": ab.status,
            }
            for ab in absences_by_worker.get(worker.id, [])
        ]
        worker_holidays = sorted(holidays_by_region.get(worker.region_code or "", set()))
        entries.append(WorkerCalendarEntry(
            user_id=worker.id,
            full_name=worker.full_name,
            department=worker.department,
            region_code=worker.region_code,
            absences=worker_absences,
            holidays=worker_holidays,
        ))

    return entries
