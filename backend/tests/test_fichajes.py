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
