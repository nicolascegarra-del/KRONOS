from uuid import UUID
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status as http_status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_admin
from app.models.absence import Absence, AbsenceStatus, AbsenceType
from app.models.company import Company
from app.models.user import User
from app.schemas.absence import AbsenceCreate, AbsenceReview, AbsenceOut, VacationSummary

router = APIRouter(tags=["absences"])


def _count_days(start: date, end: date) -> int:
    return max(1, (end - start).days + 1)


def _to_out(
    absence: Absence,
    user_name: Optional[str] = None,
    user_vacation_days: Optional[int] = None,
) -> AbsenceOut:
    return AbsenceOut(
        id=absence.id,
        user_id=absence.user_id,
        type=absence.type,
        start_date=absence.start_date,
        end_date=absence.end_date,
        notes=absence.notes,
        status=absence.status,
        admin_notes=absence.admin_notes,
        reviewed_by_id=absence.reviewed_by_id,
        reviewed_at=absence.reviewed_at,
        created_at=absence.created_at,
        user_name=user_name,
        user_vacation_days=user_vacation_days,
    )


# ── Worker endpoints ──────────────────────────────────────────────────────────

@router.get("/workers/me/vacation-summary", response_model=VacationSummary)
async def get_vacation_summary(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Returns vacation days: total allocated, approved used, pending, remaining."""
    result = await session.execute(
        select(Absence).where(
            Absence.user_id == current_user.id,
            Absence.type == AbsenceType.vacaciones,
            Absence.status != AbsenceStatus.rejected,
        )
    )
    absences = result.scalars().all()
    approved = sum(_count_days(a.start_date, a.end_date) for a in absences if a.status == AbsenceStatus.approved)
    pending = sum(_count_days(a.start_date, a.end_date) for a in absences if a.status == AbsenceStatus.pending)
    total = current_user.vacation_days if current_user.vacation_days is not None else 22
    return VacationSummary(
        total=total,
        approved=approved,
        pending=pending,
        remaining=max(0, total - approved - pending),
    )


@router.get("/workers/me/absences", response_model=list[AbsenceOut])
async def get_my_absences(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(Absence)
        .where(Absence.user_id == current_user.id)
        .order_by(Absence.created_at.desc())
    )
    return [_to_out(a) for a in result.scalars().all()]


@router.post("/workers/me/absences", response_model=AbsenceOut, status_code=201)
async def create_my_absence(
    body: AbsenceCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # Check vacation request limit (trial plans)
    if current_user.company_id:
        company_result = await session.execute(
            select(Company).where(Company.id == current_user.company_id)
        )
        company = company_result.scalar_one_or_none()
        if company and company.max_vacation_requests is not None:
            count_result = await session.execute(
                select(func.count(Absence.id)).where(Absence.user_id == current_user.id)
            )
            if count_result.scalar_one() >= company.max_vacation_requests:
                raise HTTPException(
                    status_code=http_status.HTTP_403_FORBIDDEN,
                    detail=f"Límite de {company.max_vacation_requests} solicitudes alcanzado en tu plan actual",
                )

    absence = Absence(
        user_id=current_user.id,
        type=body.type,
        start_date=body.start_date,
        end_date=body.end_date,
        notes=body.notes,
    )
    session.add(absence)
    await session.commit()
    await session.refresh(absence)
    return _to_out(absence)


@router.delete("/workers/me/absences/{absence_id}", status_code=204)
async def cancel_my_absence(
    absence_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    result = await session.execute(
        select(Absence).where(
            Absence.id == absence_id,
            Absence.user_id == current_user.id,
        )
    )
    absence = result.scalar_one_or_none()
    if not absence:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if absence.status != AbsenceStatus.pending:
        raise HTTPException(
            status_code=400, detail="Solo se pueden cancelar solicitudes pendientes"
        )
    await session.delete(absence)
    await session.commit()


# ── Admin endpoints ───────────────────────────────────────────────────────────

@router.get("/admin/absences", response_model=list[AbsenceOut])
async def list_absences(
    filter_status: Optional[AbsenceStatus] = None,
    user_id: Optional[UUID] = None,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    q = (
        select(Absence, User.full_name, User.vacation_days)
        .join(User, Absence.user_id == User.id)
        .where(User.company_id == admin.company_id)
    )
    if filter_status:
        q = q.where(Absence.status == filter_status)
    if user_id:
        q = q.where(Absence.user_id == user_id)
    q = q.order_by(Absence.created_at.desc())
    result = await session.execute(q)
    return [_to_out(a, name, vdays) for a, name, vdays in result.all()]


@router.patch("/admin/absences/{absence_id}", response_model=AbsenceOut)
async def review_absence(
    absence_id: UUID,
    body: AbsenceReview,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    result = await session.execute(
        select(Absence, User.full_name, User.vacation_days)
        .join(User, Absence.user_id == User.id)
        .where(Absence.id == absence_id, User.company_id == admin.company_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    absence, user_name, user_vacation_days = row

    if body.status == AbsenceStatus.pending:
        raise HTTPException(
            status_code=400, detail="El estado debe ser 'approved' o 'rejected'"
        )

    absence.status = body.status
    absence.admin_notes = body.admin_notes
    absence.reviewed_by_id = admin.id
    absence.reviewed_at = datetime.utcnow()
    session.add(absence)
    await session.commit()
    await session.refresh(absence)
    return _to_out(absence, user_name, user_vacation_days)
