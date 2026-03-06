from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_superadmin
from app.models.company import Company
from app.models.user import User, UserRole
from app.schemas.company import CompanyCreate, CompanyRead, CompanyUpdate
from app.services.auth import hash_password

router = APIRouter(prefix="/companies", tags=["companies"])


async def _worker_count(session: AsyncSession, company_id: UUID) -> int:
    result = await session.execute(
        select(func.count()).select_from(User).where(
            User.company_id == company_id,
            User.role == UserRole.worker,
            User.is_active == True,
        )
    )
    return result.scalar_one()


def _to_read(c: Company, worker_count: int) -> CompanyRead:
    return CompanyRead(
        id=c.id,
        name=c.name,
        max_workers=c.max_workers,
        geo_enabled=c.geo_enabled,
        worker_count=worker_count,
        created_at=c.created_at,
        nif=c.nif,
        address=c.address,
        city=c.city,
        postal_code=c.postal_code,
        phone=c.phone,
        billing_email=c.billing_email,
        subscription_plan=c.subscription_plan,
        subscription_price=c.subscription_price,
        subscription_discount=c.subscription_discount,
        subscription_start=c.subscription_start,
        subscription_end=c.subscription_end,
    )


@router.get("", response_model=list[CompanyRead])
async def list_companies(
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Company).order_by(Company.created_at))
    companies = result.scalars().all()
    out = []
    for c in companies:
        out.append(_to_read(c, await _worker_count(session, c.id)))
    return out


@router.post("", response_model=CompanyRead, status_code=status.HTTP_201_CREATED)
async def create_company(
    body: CompanyCreate,
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    # Validate uniqueness
    existing_company = await session.execute(
        select(Company).where(Company.name == body.name)
    )
    if existing_company.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una empresa con ese nombre",
        )

    existing_user = await session.execute(
        select(User).where(User.email == body.admin_email)
    )
    if existing_user.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El email del administrador ya está registrado",
        )

    company = Company(name=body.name, max_workers=body.max_workers)
    session.add(company)
    await session.flush()  # populate company.id

    admin = User(
        email=body.admin_email,
        full_name=body.admin_full_name,
        hashed_password=hash_password(body.admin_password),
        role=UserRole.admin,
        company_id=company.id,
    )
    session.add(admin)
    await session.commit()
    await session.refresh(company)

    return _to_read(company, 0)


@router.put("/{company_id}", response_model=CompanyRead)
async def update_company(
    company_id: UUID,
    body: CompanyUpdate,
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    if body.name is not None:
        company.name = body.name
    if body.max_workers is not None:
        company.max_workers = body.max_workers
    if body.geo_enabled is not None:
        company.geo_enabled = body.geo_enabled
    if body.nif is not None:
        company.nif = body.nif
    if body.address is not None:
        company.address = body.address
    if body.city is not None:
        company.city = body.city
    if body.postal_code is not None:
        company.postal_code = body.postal_code
    if body.phone is not None:
        company.phone = body.phone
    if body.billing_email is not None:
        company.billing_email = body.billing_email
    if body.subscription_plan is not None:
        company.subscription_plan = body.subscription_plan
    if body.subscription_price is not None:
        company.subscription_price = body.subscription_price
    if body.subscription_discount is not None:
        company.subscription_discount = body.subscription_discount
    if body.subscription_start is not None:
        company.subscription_start = body.subscription_start
    if body.subscription_end is not None:
        company.subscription_end = body.subscription_end

    session.add(company)
    await session.commit()
    await session.refresh(company)

    return _to_read(company, await _worker_count(session, company.id))


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(
    company_id: UUID,
    _: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    user_count_result = await session.execute(
        select(func.count()).select_from(User).where(User.company_id == company_id)
    )
    if user_count_result.scalar_one() > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar una empresa con usuarios asociados",
        )

    await session.delete(company)
    await session.commit()
