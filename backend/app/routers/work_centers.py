from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_admin
from app.models.user import User
from app.models.work_center import WorkCenter
from app.schemas.work_center import WorkCenterCreate, WorkCenterRead, WorkCenterUpdate

router = APIRouter(prefix="/work-centers", tags=["work-centers"])


@router.get("", response_model=list[WorkCenterRead])
async def list_work_centers(
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(WorkCenter).where(WorkCenter.company_id == admin.company_id).order_by(WorkCenter.name)
    )
    return result.scalars().all()


@router.post("", response_model=WorkCenterRead, status_code=status.HTTP_201_CREATED)
async def create_work_center(
    body: WorkCenterCreate,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    wc = WorkCenter(**body.model_dump(), company_id=admin.company_id)
    session.add(wc)
    await session.commit()
    await session.refresh(wc)
    return wc


@router.put("/{wc_id}", response_model=WorkCenterRead)
async def update_work_center(
    wc_id: UUID,
    body: WorkCenterUpdate,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(WorkCenter).where(WorkCenter.id == wc_id, WorkCenter.company_id == admin.company_id)
    )
    wc = result.scalar_one_or_none()
    if not wc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work center not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(wc, key, value)
    session.add(wc)
    await session.commit()
    await session.refresh(wc)
    return wc


@router.delete("/{wc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_work_center(
    wc_id: UUID,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(WorkCenter).where(WorkCenter.id == wc_id, WorkCenter.company_id == admin.company_id)
    )
    wc = result.scalar_one_or_none()
    if not wc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work center not found")
    await session.delete(wc)
    await session.commit()
