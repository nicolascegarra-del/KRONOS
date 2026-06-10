"""Tests del módulo Tablet de fichaje (kiosco por código)."""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.user import User, UserRole
from app.services.auth import hash_password
from tests.conftest import get_token


@pytest_asyncio.fixture
async def tablet_company(session: AsyncSession) -> Company:
    c = Company(name="Tablet Co", max_workers=10, tablet_enabled=True)
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return c


@pytest_asyncio.fixture
async def tablet_admin(session: AsyncSession, tablet_company: Company) -> User:
    u = User(
        email="admin-tablet@test.com",
        full_name="Admin Tablet",
        hashed_password=hash_password("Admin1234!"),
        role=UserRole.admin,
        company_id=tablet_company.id,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest_asyncio.fixture
async def tablet_account(session: AsyncSession, tablet_company: Company) -> User:
    u = User(
        email="tablet@test.com",
        full_name="Tablet de fichaje",
        hashed_password=hash_password("Tablet1234!"),
        role=UserRole.tablet,
        company_id=tablet_company.id,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest_asyncio.fixture
async def coded_worker(session: AsyncSession, tablet_company: Company) -> User:
    u = User(
        email="coded-worker@test.com",
        full_name="Coded Worker",
        hashed_password=hash_password("Worker1234!"),
        role=UserRole.worker,
        company_id=tablet_company.id,
        fichaje_code="1234",
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


async def _tablet_headers(client: AsyncClient) -> dict:
    token = await get_token(client, "tablet@test.com", "Tablet1234!")
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_kiosk_start_then_end(client: AsyncClient, tablet_account, coded_worker):
    """Mismo código: primera vez entrada, segunda vez salida con total_minutes."""
    headers = await _tablet_headers(client)

    r1 = await client.post("/fichajes/kiosk", headers=headers, json={"code": "1234"})
    assert r1.status_code == 200, r1.text
    assert r1.json()["action"] == "start"
    assert r1.json()["worker_name"] == "Coded Worker"

    r2 = await client.post("/fichajes/kiosk", headers=headers, json={"code": "1234"})
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["action"] == "end"
    assert body["total_minutes"] is not None
    assert body["total_minutes"] >= 0


@pytest.mark.asyncio
async def test_kiosk_invalid_code_returns_404(client: AsyncClient, tablet_account, coded_worker):
    headers = await _tablet_headers(client)
    r = await client.post("/fichajes/kiosk", headers=headers, json={"code": "9999"})
    assert r.status_code == 404
    assert "responsable" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_worker_cannot_use_kiosk(client: AsyncClient, tablet_account, coded_worker):
    """Un trabajador autenticado no puede usar el endpoint de kiosco (rol incorrecto)."""
    token = await get_token(client, "coded-worker@test.com", "Worker1234!")
    headers = {"Authorization": f"Bearer {token}"}
    r = await client.post("/fichajes/kiosk", headers=headers, json={"code": "1234"})
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_kiosk_tenant_isolation(client: AsyncClient, tablet_account, session: AsyncSession):
    """Una tablet no puede fichar a un trabajador de otra empresa (código de otra empresa)."""
    other = Company(name="Other Co", max_workers=10, tablet_enabled=True)
    session.add(other)
    await session.flush()
    other_worker = User(
        email="other-worker@test.com",
        full_name="Other Worker",
        hashed_password=hash_password("Worker1234!"),
        role=UserRole.worker,
        company_id=other.id,
        fichaje_code="1234",
    )
    session.add(other_worker)
    await session.commit()

    headers = await _tablet_headers(client)
    r = await client.post("/fichajes/kiosk", headers=headers, json={"code": "1234"})
    # El worker con código 1234 pertenece a otra empresa → no se encuentra en la del tablet.
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_create_tablet_user_requires_module(client: AsyncClient, session: AsyncSession):
    """Si tablet_enabled=False, el admin no puede crear cuentas de tablet."""
    c = Company(name="No Tablet Co", max_workers=10, tablet_enabled=False)
    session.add(c)
    await session.flush()
    admin = User(
        email="admin-notablet@test.com",
        full_name="Admin",
        hashed_password=hash_password("Admin1234!"),
        role=UserRole.admin,
        company_id=c.id,
    )
    session.add(admin)
    await session.commit()

    token = await get_token(client, "admin-notablet@test.com", "Admin1234!")
    headers = {"Authorization": f"Bearer {token}"}
    r = await client.post(
        "/users/tablet",
        headers=headers,
        json={"email": "t@test.com", "full_name": "T", "password": "Tablet1234!"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_fichaje_code_unique_per_company(client: AsyncClient, tablet_admin, coded_worker):
    """Crear un segundo trabajador con el mismo código en la empresa → 409."""
    token = await get_token(client, "admin-tablet@test.com", "Admin1234!")
    headers = {"Authorization": f"Bearer {token}"}
    r = await client.post(
        "/users",
        headers=headers,
        json={
            "email": "dup@test.com",
            "full_name": "Dup",
            "password": "Worker1234!",
            "fichaje_code": "1234",
        },
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_fichaje_code_format_validation(client: AsyncClient, tablet_admin):
    token = await get_token(client, "admin-tablet@test.com", "Admin1234!")
    headers = {"Authorization": f"Bearer {token}"}
    r = await client.post(
        "/users",
        headers=headers,
        json={
            "email": "badcode@test.com",
            "full_name": "Bad",
            "password": "Worker1234!",
            "fichaje_code": "12",  # demasiado corto
        },
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_tablet_users_excluded_from_worker_list(client: AsyncClient, tablet_admin, tablet_account, coded_worker):
    """El listado /users no debe incluir cuentas de rol tablet."""
    token = await get_token(client, "admin-tablet@test.com", "Admin1234!")
    headers = {"Authorization": f"Bearer {token}"}
    r = await client.get("/users", headers=headers)
    assert r.status_code == 200
    roles = {u["role"] for u in r.json()}
    assert "tablet" not in roles
