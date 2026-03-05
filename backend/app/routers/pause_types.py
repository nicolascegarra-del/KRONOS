from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_admin
from app.models.pausa_tipo import PausaTipo
from app.models.user import User
from app.schemas.pause_tipo import PausaTipoCreate, PausaTipoRead

router = APIRouter(prefix="/pause-types", tags=["pause-types"])


@router.get("", response_model=list[PausaTipoRead])
async def list_pause_types(
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(PausaTipo).where(PausaTipo.active == True).order_by(PausaTipo.name)
    )
    return result.scalars().all()


@router.post("", response_model=PausaTipoRead, status_code=status.HTTP_201_CREATED)
async def create_pause_type(
    body: PausaTipoCreate,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    existing = await session.execute(
        select(PausaTipo).where(PausaTipo.name == body.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un tipo de pausa con ese nombre",
        )
    tipo = PausaTipo(name=body.name)
    session.add(tipo)
    await session.commit()
    await session.refresh(tipo)
    return tipo


@router.delete("/{tipo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pause_type(
    tipo_id: UUID,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(PausaTipo).where(PausaTipo.id == tipo_id)
    )
    tipo = result.scalar_one_or_none()
    if not tipo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tipo de pausa no encontrado",
        )
    await session.delete(tipo)
    await session.commit()
