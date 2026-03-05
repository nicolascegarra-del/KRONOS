import pytest
from httpx import AsyncClient

from tests.conftest import get_token


@pytest.mark.asyncio
async def test_full_shift_flow(client: AsyncClient, worker_user):
    """start → pause (with comment) → resume → end"""
    token = await get_token(client, "worker@test.com", "Worker1234!")
    headers = {"Authorization": f"Bearer {token}"}

    # Start shift
    resp = await client.post("/fichajes/start", headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "active"
    assert data["end_time"] is None

    # Cannot start another shift
    resp2 = await client.post("/fichajes/start", headers=headers)
    assert resp2.status_code == 409

    # Pause shift (requires comment)
    resp = await client.post(
        "/fichajes/pause",
        headers=headers,
        json={"comment": "Lunch break"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "paused"

    # Cannot pause again
    resp = await client.post(
        "/fichajes/pause",
        headers=headers,
        json={"comment": "another"},
    )
    assert resp.status_code == 409

    # Resume
    resp = await client.post("/fichajes/resume", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"

    # End shift
    resp = await client.post("/fichajes/end", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "finished"
    assert data["end_time"] is not None
    assert data["total_minutes"] is not None
    assert data["total_minutes"] >= 0


@pytest.mark.asyncio
async def test_cannot_start_shift_if_already_active(client: AsyncClient, worker_user):
    token = await get_token(client, "worker@test.com", "Worker1234!")
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/fichajes/start", headers=headers)
    resp = await client.post("/fichajes/start", headers=headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_pause_requires_comment(client: AsyncClient, worker_user):
    token = await get_token(client, "worker@test.com", "Worker1234!")
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/fichajes/start", headers=headers)

    # Empty comment
    resp = await client.post(
        "/fichajes/pause",
        headers=headers,
        json={"comment": ""},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_active_fichaje(client: AsyncClient, worker_user):
    token = await get_token(client, "worker@test.com", "Worker1234!")
    headers = {"Authorization": f"Bearer {token}"}

    # No active fichaje initially
    resp = await client.get("/fichajes/active", headers=headers)
    assert resp.status_code == 200
    assert resp.json() is None

    # Start one
    await client.post("/fichajes/start", headers=headers)
    resp = await client.get("/fichajes/active", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


@pytest.mark.asyncio
async def test_get_history(client: AsyncClient, worker_user):
    token = await get_token(client, "worker@test.com", "Worker1234!")
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/fichajes/start", headers=headers)
    await client.post("/fichajes/end", headers=headers)

    resp = await client.get("/fichajes/me", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


# ---------------------------------------------------------------------------
# Admin endpoint tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_list_fichajes(client: AsyncClient, admin_user, worker_user):
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    await client.post("/fichajes/start", headers={"Authorization": f"Bearer {worker_token}"})

    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.get("/fichajes/admin", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert "user" in data[0]
    assert data[0]["user"]["email"] == "worker@test.com"


@pytest.mark.asyncio
async def test_admin_end_fichaje(client: AsyncClient, admin_user, worker_user):
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    resp = await client.post("/fichajes/start", headers={"Authorization": f"Bearer {worker_token}"})
    fichaje_id = resp.json()["id"]

    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.post(
        f"/fichajes/admin/{fichaje_id}/end",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "finished"
    assert data["end_time"] is not None
    assert data["total_minutes"] is not None


@pytest.mark.asyncio
async def test_admin_edit_fichaje(client: AsyncClient, admin_user, worker_user):
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    resp = await client.post("/fichajes/start", headers={"Authorization": f"Bearer {worker_token}"})
    fichaje_id = resp.json()["id"]
    await client.post("/fichajes/end", headers={"Authorization": f"Bearer {worker_token}"})

    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.patch(
        f"/fichajes/admin/{fichaje_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"total_minutes": 120, "late_minutes": 5},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_minutes"] == 120
    assert data["late_minutes"] == 5


@pytest.mark.asyncio
async def test_admin_delete_fichaje(client: AsyncClient, admin_user, worker_user):
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    resp = await client.post("/fichajes/start", headers={"Authorization": f"Bearer {worker_token}"})
    fichaje_id = resp.json()["id"]

    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.delete(
        f"/fichajes/admin/{fichaje_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 204

    # Confirm it no longer exists
    resp = await client.get("/fichajes/admin", headers={"Authorization": f"Bearer {admin_token}"})
    ids = [f["id"] for f in resp.json()]
    assert fichaje_id not in ids


@pytest.mark.asyncio
async def test_non_admin_cannot_access_admin_endpoints(client: AsyncClient, worker_user):
    token = await get_token(client, "worker@test.com", "Worker1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/fichajes/admin", headers=headers)
    assert resp.status_code == 403

    resp = await client.post("/fichajes/admin/00000000-0000-0000-0000-000000000000/end", headers=headers)
    assert resp.status_code == 403

    resp = await client.patch("/fichajes/admin/00000000-0000-0000-0000-000000000000", headers=headers, json={})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_close_all(client: AsyncClient, admin_user, worker_user):
    """close-all endpoint closes all active shifts for the company."""
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    await client.post("/fichajes/start", headers={"Authorization": f"Bearer {worker_token}"})

    # Verify shift is active
    resp = await client.get("/fichajes/active", headers={"Authorization": f"Bearer {worker_token}"})
    assert resp.json()["status"] == "active"

    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.post(
        "/fichajes/admin/close-all",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["closed"] >= 1

    # Shift should now be finished
    resp = await client.get("/fichajes/active", headers={"Authorization": f"Bearer {worker_token}"})
    assert resp.json() is None


@pytest.mark.asyncio
async def test_admin_close_all_no_active_shifts(client: AsyncClient, admin_user, worker_user):
    """close-all returns 0 when no active shifts exist."""
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.post(
        "/fichajes/admin/close-all",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["closed"] == 0


@pytest.mark.asyncio
async def test_worker_cannot_close_all(client: AsyncClient, worker_user):
    """Workers cannot call the close-all endpoint."""
    token = await get_token(client, "worker@test.com", "Worker1234!")
    resp = await client.post(
        "/fichajes/admin/close-all",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
