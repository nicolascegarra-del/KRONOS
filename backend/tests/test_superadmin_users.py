import json
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


@pytest.mark.asyncio
async def test_superadmin_delete_fichajes_by_user(
    client: AsyncClient, superadmin_user, worker_user
):
    """Superadmin can delete all fichajes for a specific worker."""
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    # Create a fichaje
    await client.post("/fichajes/start", headers={"Authorization": f"Bearer {worker_token}"})
    await client.post("/fichajes/end", headers={"Authorization": f"Bearer {worker_token}"})

    sa_token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.delete(
        f"/superadmin/users/fichajes?user_id={worker_user.id}",
        headers={"Authorization": f"Bearer {sa_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["deleted"] >= 1

    # Worker history should now be empty
    resp2 = await client.get("/fichajes/me", headers={"Authorization": f"Bearer {worker_token}"})
    assert resp2.json() == []


@pytest.mark.asyncio
async def test_superadmin_delete_fichajes_by_company(
    client: AsyncClient, superadmin_user, admin_user, worker_user, company
):
    """Superadmin can delete all fichajes for all users in a company."""
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    await client.post("/fichajes/start", headers={"Authorization": f"Bearer {worker_token}"})
    await client.post("/fichajes/end", headers={"Authorization": f"Bearer {worker_token}"})

    sa_token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.delete(
        f"/superadmin/users/fichajes?company_id={company.id}",
        headers={"Authorization": f"Bearer {sa_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["deleted"] >= 1


@pytest.mark.asyncio
async def test_superadmin_delete_fichajes_requires_filter(
    client: AsyncClient, superadmin_user
):
    """Request without user_id or company_id should fail with 422."""
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.delete(
        "/superadmin/users/fichajes",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_superadmin_bulk_delete_users(
    client: AsyncClient, superadmin_user, worker_user
):
    """Superadmin can bulk-delete workers (and their fichajes)."""
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    await client.post("/fichajes/start", headers={"Authorization": f"Bearer {worker_token}"})
    await client.post("/fichajes/end", headers={"Authorization": f"Bearer {worker_token}"})

    sa_token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.request(
        "DELETE",
        "/superadmin/users/bulk",
        headers={"Authorization": f"Bearer {sa_token}", "Content-Type": "application/json"},
        content=json.dumps({"user_ids": [str(worker_user.id)]}),
    )
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 1

    # User should be gone from list
    list_resp = await client.get("/superadmin/users", headers={"Authorization": f"Bearer {sa_token}"})
    emails = [u["email"] for u in list_resp.json()]
    assert "worker@test.com" not in emails


@pytest.mark.asyncio
async def test_superadmin_cannot_bulk_delete_superadmin(
    client: AsyncClient, superadmin_user
):
    """Bulk delete is blocked when list includes a superadmin account."""
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.request(
        "DELETE",
        "/superadmin/users/bulk",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        content=json.dumps({"user_ids": [str(superadmin_user.id)]}),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_cannot_delete_fichajes(client: AsyncClient, admin_user, worker_user):
    """Admin cannot call superadmin delete-fichajes endpoint."""
    token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.delete(
        f"/superadmin/users/fichajes?user_id={worker_user.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
