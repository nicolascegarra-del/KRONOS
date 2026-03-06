"""Tests for multi-tenant company management."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.user import User, UserRole
from app.services.auth import hash_password
from tests.conftest import get_token


@pytest.mark.asyncio
async def test_list_companies_requires_superadmin(client: AsyncClient, admin_user: User):
    token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.get("/companies", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_companies_superadmin(
    client: AsyncClient, superadmin_user: User, company: Company
):
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.get("/companies", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Test Company"
    assert data[0]["max_workers"] == 10
    assert data[0]["worker_count"] == 0


@pytest.mark.asyncio
async def test_create_company(client: AsyncClient, superadmin_user: User):
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.post(
        "/companies",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Nueva Empresa",
            "max_workers": 5,
            "admin_email": "newadmin@empresa.com",
            "admin_full_name": "Admin Nueva",
            "admin_password": "Admin1234!",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Nueva Empresa"
    assert data["max_workers"] == 5
    assert data["worker_count"] == 0


@pytest.mark.asyncio
async def test_create_company_duplicate_name(
    client: AsyncClient, superadmin_user: User, company: Company
):
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.post(
        "/companies",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Test Company",
            "max_workers": 5,
            "admin_email": "other@empresa.com",
            "admin_full_name": "Other Admin",
            "admin_password": "Admin1234!",
        },
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_update_company(
    client: AsyncClient, superadmin_user: User, company: Company
):
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.put(
        f"/companies/{company.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Renamed Company", "max_workers": 20},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Renamed Company"
    assert data["max_workers"] == 20


@pytest.mark.asyncio
async def test_delete_company_with_users_fails(
    client: AsyncClient, superadmin_user: User, company: Company, admin_user: User
):
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.delete(
        f"/companies/{company.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_empty_company(
    client: AsyncClient, superadmin_user: User, session: AsyncSession
):
    empty_company = Company(name="Empty Co", max_workers=5)
    session.add(empty_company)
    await session.commit()

    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.delete(
        f"/companies/{empty_company.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_worker_limit_enforced(
    client: AsyncClient, admin_user: User, company: Company, session: AsyncSession
):
    """Admin cannot create more workers than company.max_workers."""
    # Fill up to max_workers (company fixture has max_workers=10, add 10 workers)
    token = await get_token(client, "admin@test.com", "Admin1234!")

    # Set max_workers to 2 for quick test
    company.max_workers = 2
    session.add(company)
    await session.commit()

    # Create worker 1
    resp = await client.post(
        "/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "email": "w1@test.com",
            "full_name": "Worker 1",
            "password": "Worker1234!",
            "role": "worker",
        },
    )
    assert resp.status_code == 201

    # Create worker 2
    resp = await client.post(
        "/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "email": "w2@test.com",
            "full_name": "Worker 2",
            "password": "Worker1234!",
            "role": "worker",
        },
    )
    assert resp.status_code == 201

    # Worker 3 should be rejected
    resp = await client.post(
        "/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "email": "w3@test.com",
            "full_name": "Worker 3",
            "password": "Worker1234!",
            "role": "worker",
        },
    )
    assert resp.status_code == 409
    assert "Límite" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_company_scoping_admin_sees_only_own_workers(
    client: AsyncClient,
    superadmin_user: User,
    company: Company,
    admin_user: User,
    session: AsyncSession,
):
    """An admin should only see users from their own company."""
    # Create a second company with its own admin and worker
    company2 = Company(name="Other Company", max_workers=10)
    session.add(company2)
    await session.flush()

    admin2 = User(
        email="admin2@other.com",
        full_name="Admin Two",
        hashed_password=hash_password("Admin1234!"),
        role=UserRole.admin,
        company_id=company2.id,
    )
    worker2 = User(
        email="worker2@other.com",
        full_name="Worker Two",
        hashed_password=hash_password("Worker1234!"),
        role=UserRole.worker,
        company_id=company2.id,
    )
    session.add(admin2)
    session.add(worker2)
    await session.commit()

    # admin of company1 should only see their company's users
    token1 = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.get("/users", headers={"Authorization": f"Bearer {token1}"})
    assert resp.status_code == 200
    emails = [u["email"] for u in resp.json()]
    assert "admin@test.com" in emails
    assert "worker2@other.com" not in emails

    # admin of company2 should only see their company's users
    token2 = await get_token(client, "admin2@other.com", "Admin1234!")
    resp = await client.get("/users", headers={"Authorization": f"Bearer {token2}"})
    assert resp.status_code == 200
    emails2 = [u["email"] for u in resp.json()]
    assert "worker2@other.com" in emails2
    assert "admin@test.com" not in emails2


@pytest.mark.asyncio
async def test_worker_count_in_company_list(
    client: AsyncClient,
    superadmin_user: User,
    company: Company,
    admin_user: User,
    worker_user: User,
):
    """worker_count should reflect active workers in company."""
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.get("/companies", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["worker_count"] == 1  # only worker_user counts (not admin_user)


@pytest.mark.asyncio
async def test_company_has_geo_enabled_by_default(
    client: AsyncClient, superadmin_user: User, company: Company
):
    """New companies have geo_enabled=True by default."""
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.get("/companies", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()[0]["geo_enabled"] is True


@pytest.mark.asyncio
async def test_superadmin_can_toggle_geo(
    client: AsyncClient, superadmin_user: User, company: Company
):
    """Superadmin can disable and re-enable geolocation for a company."""
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.put(
        f"/companies/{company.id}", headers=headers, json={"geo_enabled": False}
    )
    assert resp.status_code == 200
    assert resp.json()["geo_enabled"] is False

    resp = await client.put(
        f"/companies/{company.id}", headers=headers, json={"geo_enabled": True}
    )
    assert resp.status_code == 200
    assert resp.json()["geo_enabled"] is True


@pytest.mark.asyncio
async def test_admin_cannot_create_admin_role(client: AsyncClient, admin_user: User):
    """Admin cannot create another admin — only workers allowed."""
    token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.post(
        "/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "email": "newadmin@test.com",
            "full_name": "New Admin",
            "password": "Admin1234!",
            "role": "admin",
        },
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_cannot_escalate_role(
    client: AsyncClient, admin_user: User, worker_user: User
):
    """Admin cannot change a worker's role to admin."""
    token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.put(
        f"/users/{worker_user.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"role": "admin"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_company_billing_fields(
    client: AsyncClient, superadmin_user: User, company: Company
):
    """Superadmin can set billing fields on a company."""
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.put(
        f"/companies/{company.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "nif": "B12345678",
            "address": "Calle Gran Via 1",
            "city": "Madrid",
            "postal_code": "28013",
            "phone": "+34 910 000 000",
            "billing_email": "facturas@testcompany.com",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["nif"] == "B12345678"
    assert data["address"] == "Calle Gran Via 1"
    assert data["city"] == "Madrid"
    assert data["postal_code"] == "28013"
    assert data["phone"] == "+34 910 000 000"
    assert data["billing_email"] == "facturas@testcompany.com"


@pytest.mark.asyncio
async def test_update_company_subscription(
    client: AsyncClient, superadmin_user: User, company: Company
):
    """Superadmin can assign a subscription plan to a company."""
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.put(
        f"/companies/{company.id}",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "subscription_plan": "monthly",
            "subscription_price": 49.99,
            "subscription_discount": 10.0,
            "subscription_start": "2026-01-01T00:00:00",
            "subscription_end": "2026-12-31T23:59:59",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["subscription_plan"] == "monthly"
    assert data["subscription_price"] == 49.99
    assert data["subscription_discount"] == 10.0
    assert data["subscription_start"] is not None
    assert data["subscription_end"] is not None


@pytest.mark.asyncio
async def test_company_billing_fields_in_list(
    client: AsyncClient, superadmin_user: User, company: Company
):
    """Billing fields are returned in the company list."""
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    headers = {"Authorization": f"Bearer {token}"}

    await client.put(
        f"/companies/{company.id}",
        headers=headers,
        json={"nif": "A98765432", "subscription_plan": "annual"},
    )

    resp = await client.get("/companies", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    c = next(d for d in data if d["id"] == str(company.id))
    assert c["nif"] == "A98765432"
    assert c["subscription_plan"] == "annual"


@pytest.mark.asyncio
async def test_new_company_has_null_billing_fields(
    client: AsyncClient, superadmin_user: User
):
    """Newly created companies have null billing and subscription fields."""
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.post(
        "/companies",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Fresh Company",
            "max_workers": 5,
            "admin_email": "fresh@empresa.com",
            "admin_full_name": "Fresh Admin",
            "admin_password": "Admin1234!",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["nif"] is None
    assert data["subscription_plan"] is None
    assert data["subscription_price"] is None


@pytest.mark.asyncio
async def test_superadmin_users_include_company_name(
    client: AsyncClient, superadmin_user: User, admin_user: User, worker_user: User
):
    """Superadmin user list returns company_name for users that belong to a company."""
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.get("/superadmin/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    users = resp.json()
    admin_data = next(u for u in users if u["email"] == "admin@test.com")
    worker_data = next(u for u in users if u["email"] == "worker@test.com")
    sa_data = next(u for u in users if u["email"] == "superadmin@test.com")
    assert admin_data["company_name"] == "Test Company"
    assert worker_data["company_name"] == "Test Company"
    assert sa_data["company_name"] is None
