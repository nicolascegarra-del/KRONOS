from __future__ import annotations

import calendar
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_admin
from app.models.user import User, UserRole
from app.models.worker_schedule import WorkerSchedule
from app.schemas.worker_schedule import WorkerScheduleDay, WorkerScheduleUpdate

router = APIRouter(tags=["schedule"])


# ── Worker: read own schedule ──────────────────────────────────────────────────

@router.get("/workers/me/schedule", response_model=list[WorkerScheduleDay])
async def get_my_schedule(
    year: int = Query(...),
    month: int = Query(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    first_day = date(year, month, 1)
    last_day = date(year, month, calendar.monthrange(year, month)[1])
    result = await session.execute(
        select(WorkerSchedule)
        .where(WorkerSchedule.user_id == current_user.id)
        .where(WorkerSchedule.schedule_date >= first_day)
        .where(WorkerSchedule.schedule_date <= last_day)
    )
    rows = result.scalars().all()
    return [
        WorkerScheduleDay(
            schedule_date=r.schedule_date,
            start_time=r.start_time,
            end_time=r.end_time,
            start_time_2=r.start_time_2,
            end_time_2=r.end_time_2,
        )
        for r in rows
    ]


# ── Admin: read worker schedule ────────────────────────────────────────────────

@router.get("/users/{user_id}/schedule", response_model=list[WorkerScheduleDay])
async def get_worker_schedule(
    user_id: UUID,
    year: int = Query(...),
    month: int = Query(...),
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    worker = await session.get(User, user_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if admin.role != UserRole.superadmin and worker.company_id != admin.company_id:
        raise HTTPException(status_code=403, detail="Access denied")

    first_day = date(year, month, 1)
    last_day = date(year, month, calendar.monthrange(year, month)[1])
    result = await session.execute(
        select(WorkerSchedule)
        .where(WorkerSchedule.user_id == user_id)
        .where(WorkerSchedule.schedule_date >= first_day)
        .where(WorkerSchedule.schedule_date <= last_day)
    )
    rows = result.scalars().all()
    return [
        WorkerScheduleDay(
            schedule_date=r.schedule_date,
            start_time=r.start_time,
            end_time=r.end_time,
            start_time_2=r.start_time_2,
            end_time_2=r.end_time_2,
        )
        for r in rows
    ]


# ── Admin: upsert schedule days ────────────────────────────────────────────────

@router.put("/users/{user_id}/schedule", response_model=list[WorkerScheduleDay])
async def upsert_worker_schedule(
    user_id: UUID,
    payload: WorkerScheduleUpdate,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    worker = await session.get(User, user_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if admin.role != UserRole.superadmin and worker.company_id != admin.company_id:
        raise HTTPException(status_code=403, detail="Access denied")

    saved: list[WorkerScheduleDay] = []

    for day in payload.days:
        # Find existing row
        result = await session.execute(
            select(WorkerSchedule)
            .where(WorkerSchedule.user_id == user_id)
            .where(WorkerSchedule.schedule_date == day.schedule_date)
        )
        existing = result.scalars().first()

        if day.start_time is None and day.end_time is None:
            # Delete if exists
            if existing:
                await session.delete(existing)
        else:
            if existing:
                existing.start_time = day.start_time
                existing.end_time = day.end_time
                existing.start_time_2 = day.start_time_2
                existing.end_time_2 = day.end_time_2
                session.add(existing)
            else:
                new_row = WorkerSchedule(
                    user_id=user_id,
                    schedule_date=day.schedule_date,
                    start_time=day.start_time,
                    end_time=day.end_time,
                    start_time_2=day.start_time_2,
                    end_time_2=day.end_time_2,
                )
                session.add(new_row)
            saved.append(day)

    await session.commit()
    return saved


# ── Admin: delete a single day ─────────────────────────────────────────────────

@router.delete("/users/{user_id}/schedule/date/{schedule_date}", status_code=204)
async def delete_schedule_day(
    user_id: UUID,
    schedule_date: date,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    worker = await session.get(User, user_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    if admin.role != UserRole.superadmin and worker.company_id != admin.company_id:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await session.execute(
        select(WorkerSchedule)
        .where(WorkerSchedule.user_id == user_id)
        .where(WorkerSchedule.schedule_date == schedule_date)
    )
    row = result.scalars().first()
    if row:
        await session.delete(row)
        await session.commit()
