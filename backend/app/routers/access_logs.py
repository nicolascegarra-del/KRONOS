import csv
import io
from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_superadmin
from app.models.adminaccesslog import AdminAccessLog
from app.models.user import User

router = APIRouter(prefix="/superadmin/access-logs", tags=["access-logs"])


class AccessLogRead(BaseModel):
    id: UUID
    admin_id: UUID
    admin_email: Optional[str] = None
    admin_name: Optional[str] = None
    company_name: Optional[str] = None
    action: str
    target_user_id: Optional[UUID] = None
    accessed_at: datetime
    details: Optional[str] = None

    model_config = {"from_attributes": True}


class AccessLogListResponse(BaseModel):
    items: List[AccessLogRead]
    total: int


ACTION_LABELS = {
    "VIEW_FICHAJES": "Ver fichajes",
    "EXPORT_REPORT": "Exportar informe",
    "EDIT_FICHAJE": "Editar fichaje",
}


def _build_query(
    from_date: Optional[date],
    to_date: Optional[date],
    company_id: Optional[UUID],
    admin_id: Optional[UUID],
):
    """Base query joining AdminAccessLog with User (and optionally Company)."""
    from app.models.company import Company

    q = (
        select(AdminAccessLog, User, Company)
        .join(User, AdminAccessLog.admin_id == User.id, isouter=True)
        .join(Company, User.company_id == Company.id, isouter=True)
    )
    if from_date:
        q = q.where(AdminAccessLog.accessed_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date:
        q = q.where(AdminAccessLog.accessed_at <= datetime.combine(to_date, datetime.max.time()))
    if company_id:
        q = q.where(User.company_id == company_id)
    if admin_id:
        q = q.where(AdminAccessLog.admin_id == admin_id)
    return q


@router.get("", response_model=AccessLogListResponse)
async def list_access_logs(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    company_id: Optional[UUID] = None,
    admin_id: Optional[UUID] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    _superadmin: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    base_q = _build_query(from_date, to_date, company_id, admin_id)

    # Total count
    count_q = select(func.count()).select_from(base_q.subquery())
    total = (await session.execute(count_q)).scalar_one()

    # Paginated rows
    rows_q = (
        base_q
        .order_by(AdminAccessLog.accessed_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(rows_q)).all()

    items = [
        AccessLogRead(
            id=log.id,
            admin_id=log.admin_id,
            admin_email=user.email if user else None,
            admin_name=user.full_name if user else None,
            company_name=company.name if company else None,
            action=log.action,
            target_user_id=log.target_user_id,
            accessed_at=log.accessed_at,
            details=log.details,
        )
        for log, user, company in rows
    ]
    return AccessLogListResponse(items=items, total=total)


@router.get("/export.csv")
async def export_access_logs_csv(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    company_id: Optional[UUID] = None,
    admin_id: Optional[UUID] = None,
    _superadmin: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    q = (
        _build_query(from_date, to_date, company_id, admin_id)
        .order_by(AdminAccessLog.accessed_at.desc())
        .limit(10000)
    )
    rows = (await session.execute(q)).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Fecha/Hora", "Admin", "Email", "Empresa", "Acción", "Detalles"])

    for log, user, company in rows:
        writer.writerow([
            log.accessed_at.strftime("%Y-%m-%d %H:%M:%S"),
            user.full_name if user else "",
            user.email if user else "",
            company.name if company else "",
            ACTION_LABELS.get(log.action, log.action),
            log.details or "",
        ])

    output.seek(0)
    filename = f"access_logs_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
