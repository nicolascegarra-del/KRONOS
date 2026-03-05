from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_admin
from app.models.user import User, UserRole
from app.models.worker_schedule import WorkerSchedule
from app.schemas.worker_schedule import WorkerScheduleDay, WorkerScheduleUpdate

router = APIRouter(tags=["schedule"])

DAYS = list(range(7))  # 0=Lunes ... 6=Domingo


def _build_response(rows: list[WorkerSchedule]) -> list[WorkerScheduleDay]:
    """Return all 7 days, filling missing ones with null times."""
    by_day = {r.day_of_week: r for r in rows}
    return [
        WorkerScheduleDay(
            day_of_week=d,
            start_time=by_day[d].start_time if d in by_day else None,
            end_time=by_day[d].end_time if d in by_day else None,
        )
        for d in DAYS
    ]


# ── Worker: own schedule ──────────────────────────────────────────────────────

@router.get("/workers/me/schedule", response_model=list[WorkerScheduleDay])
async def get_my_schedule(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(WorkerSchedule).where(WorkerSchedule.user_id == current_user.id)
    )
    return _build_response(result.scalars().all())


@router.put("/workers/me/schedule", response_model=list[WorkerScheduleDay])
async def update_my_schedule(
    body: WorkerScheduleUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    for day_data in body.schedule:
        if not (0 <= day_data.day_of_week <= 6):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"day_of_week debe estar entre 0 y 6",
            )

        result = await session.execute(
            select(WorkerSchedule).where(
                WorkerSchedule.user_id == current_user.id,
                WorkerSchedule.day_of_week == day_data.day_of_week,
            )
        )
        row = result.scalar_one_or_none()

        if day_data.start_time is None and day_data.end_time is None:
            # No schedule for this day — delete if exists
            if row:
                await session.delete(row)
        else:
            if row:
                row.start_time = day_data.start_time
                row.end_time = day_data.end_time
                session.add(row)
            else:
                session.add(WorkerSchedule(
                    user_id=current_user.id,
                    day_of_week=day_data.day_of_week,
                    start_time=day_data.start_time,
                    end_time=day_data.end_time,
                ))

    await session.commit()

    result = await session.execute(
        select(WorkerSchedule).where(WorkerSchedule.user_id == current_user.id)
    )
    return _build_response(result.scalars().all())


# ── Admin: view/edit any worker schedule ────────────────────────────────────

@router.get("/users/{user_id}/schedule", response_model=list[WorkerScheduleDay])
async def get_worker_schedule(
    user_id: str,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    from uuid import UUID
    result = await session.execute(
        select(WorkerSchedule).where(WorkerSchedule.user_id == UUID(user_id))
    )
    return _build_response(result.scalars().all())


@router.put("/users/{user_id}/schedule", response_model=list[WorkerScheduleDay])
async def update_worker_schedule(
    user_id: str,
    body: WorkerScheduleUpdate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    from uuid import UUID
    uid = UUID(user_id)

    for day_data in body.schedule:
        result = await session.execute(
            select(WorkerSchedule).where(
                WorkerSchedule.user_id == uid,
                WorkerSchedule.day_of_week == day_data.day_of_week,
            )
        )
        row = result.scalar_one_or_none()

        if day_data.start_time is None and day_data.end_time is None:
            if row:
                await session.delete(row)
        else:
            if row:
                row.start_time = day_data.start_time
                row.end_time = day_data.end_time
                session.add(row)
            else:
                session.add(WorkerSchedule(
                    user_id=uid,
                    day_of_week=day_data.day_of_week,
                    start_time=day_data.start_time,
                    end_time=day_data.end_time,
                ))

    await session.commit()

    result = await session.execute(
        select(WorkerSchedule).where(WorkerSchedule.user_id == uid)
    )
    return _build_response(result.scalars().all())
