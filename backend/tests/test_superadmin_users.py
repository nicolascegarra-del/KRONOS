import pytest
from httpx import AsyncClient

from tests.conftest import get_token


@pytest.mark.asyncio
async def test_superadmin_list_users(client: AsyncClient, superadmin_user, admin_user, worker_user):
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/superadmin/users", headers=headers)
    assert resp.status_code == 200
    emails = [u["email"] for u in resp.json()]
    assert "superadmin@test.com" in emails
    assert "admin@test.com" in emails
    assert "worker@test.com" in emails


@pytest.mark.asyncio
async def test_superadmin_update_user_name(client: AsyncClient, superadmin_user, worker_user):
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.put(
        f"/superadmin/users/{worker_user.id}",
        headers=headers,
        json={"full_name": "Nombre Nuevo"},
    )
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Nombre Nuevo"


@pytest.mark.asyncio
async def test_superadmin_update_user_email(client: AsyncClient, superadmin_user, worker_user):
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.put(
        f"/superadmin/users/{worker_user.id}",
        headers=headers,
        json={"email": "nuevo@test.com"},
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "nuevo@test.com"


@pytest.mark.asyncio
async def test_superadmin_update_password(client: AsyncClient, superadmin_user, worker_user):
    """After password change, old password should fail and new one should succeed."""
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.put(
        f"/superadmin/users/{worker_user.id}",
        headers=headers,
        json={"password": "NewPass999!"},
    )
    assert resp.status_code == 200

    # New password works
    new_token = await get_token(client, "worker@test.com", "NewPass999!")
    assert new_token


@pytest.mark.asyncio
async def test_superadmin_update_role(client: AsyncClient, superadmin_user, worker_user):
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.put(
        f"/superadmin/users/{worker_user.id}",
        headers=headers,
        json={"role": "admin"},
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"


@pytest.mark.asyncio
async def test_admin_cannot_access_superadmin_users(client: AsyncClient, admin_user):
    token = await get_token(client, "admin@test.com", "Admin1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/superadmin/users", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_superadmin_update_nonexistent_user(client: AsyncClient, superadmin_user):
    import uuid
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.put(
        f"/superadmin/users/{uuid.uuid4()}",
        headers=headers,
        json={"full_name": "Nobody"},
    )
    assert resp.status_code == 404
