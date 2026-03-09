from datetime import date, datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
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
    action: str
    target_user_id: Optional[UUID] = None
    accessed_at: datetime
    details: Optional[str] = None

    model_config = {"from_attributes": True}


@router.get("", response_model=list[AccessLogRead])
async def list_access_logs(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    company_id: Optional[UUID] = None,
    _superadmin: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    query = (
        select(AdminAccessLog)
        .order_by(AdminAccessLog.accessed_at.desc())
        .limit(500)
    )
    if from_date:
        query = query.where(
            AdminAccessLog.accessed_at >= datetime.combine(from_date, datetime.min.time())
        )
    if to_date:
        query = query.where(
            AdminAccessLog.accessed_at <= datetime.combine(to_date, datetime.max.time())
        )
    result = await session.execute(query)
    logs = result.scalars().all()

    # Enrich with admin user info
    admin_ids = list({log.admin_id for log in logs})
    users_result = await session.execute(
        select(User).where(User.id.in_(admin_ids))
    )
    users_map = {u.id: u for u in users_result.scalars().all()}

    enriched = []
    for log in logs:
        u = users_map.get(log.admin_id)
        # Filter by company if requested
        if company_id and u and u.company_id != company_id:
            continue
        enriched.append(AccessLogRead(
            id=log.id,
            admin_id=log.admin_id,
            admin_email=u.email if u else None,
            admin_name=u.full_name if u else None,
            action=log.action,
            target_user_id=log.target_user_id,
            accessed_at=log.accessed_at,
            details=log.details,
        ))
    return enriched
