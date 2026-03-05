import pytest
from httpx import AsyncClient

from tests.conftest import get_token


@pytest.mark.asyncio
async def test_worker_can_list_pause_types(client: AsyncClient, admin_user, worker_user):
    # Seed a type as admin first
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    await client.post(
        "/pause-types",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Almuerzo"},
    )

    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    resp = await client.get("/pause-types", headers={"Authorization": f"Bearer {worker_token}"})
    assert resp.status_code == 200
    names = [t["name"] for t in resp.json()]
    assert "Almuerzo" in names


@pytest.mark.asyncio
async def test_admin_create_pause_type(client: AsyncClient, admin_user):
    token = await get_token(client, "admin@test.com", "Admin1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/pause-types", headers=headers, json={"name": "Formación"})
    assert resp.status_code == 201
    assert resp.json()["name"] == "Formación"

    # Duplicate rejected
    resp2 = await client.post("/pause-types", headers=headers, json={"name": "Formación"})
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_admin_delete_pause_type(client: AsyncClient, admin_user):
    token = await get_token(client, "admin@test.com", "Admin1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/pause-types", headers=headers, json={"name": "Temporal"})
    tipo_id = resp.json()["id"]

    resp = await client.delete(f"/pause-types/{tipo_id}", headers=headers)
    assert resp.status_code == 204

    # Should be gone from list
    resp = await client.get("/pause-types", headers=headers)
    ids = [t["id"] for t in resp.json()]
    assert tipo_id not in ids


@pytest.mark.asyncio
async def test_worker_cannot_create_or_delete_pause_type(client: AsyncClient, admin_user, worker_user):
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.post(
        "/pause-types",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "SoloAdmin"},
    )
    tipo_id = resp.json()["id"]

    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    headers = {"Authorization": f"Bearer {worker_token}"}

    resp = await client.post("/pause-types", headers=headers, json={"name": "Intento"})
    assert resp.status_code == 403

    resp = await client.delete(f"/pause-types/{tipo_id}", headers=headers)
    assert resp.status_code == 403
