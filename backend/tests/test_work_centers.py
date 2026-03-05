import pytest
from httpx import AsyncClient

from tests.conftest import get_token


@pytest.mark.asyncio
async def test_admin_create_work_center(client: AsyncClient, admin_user):
    token = await get_token(client, "admin@test.com", "Admin1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/work-centers",
        headers=headers,
        json={"name": "Oficina Central", "lat": 37.61228, "lng": -1.01195, "radius_meters": 300},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Oficina Central"
    assert data["radius_meters"] == 300


@pytest.mark.asyncio
async def test_admin_list_work_centers(client: AsyncClient, admin_user):
    token = await get_token(client, "admin@test.com", "Admin1234!")
    headers = {"Authorization": f"Bearer {token}"}

    await client.post("/work-centers", headers=headers,
                      json={"name": "Sede A", "lat": 37.0, "lng": -1.0, "radius_meters": 200})
    await client.post("/work-centers", headers=headers,
                      json={"name": "Sede B", "lat": 38.0, "lng": -2.0, "radius_meters": 100})

    resp = await client.get("/work-centers", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_admin_update_work_center(client: AsyncClient, admin_user):
    token = await get_token(client, "admin@test.com", "Admin1234!")
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post("/work-centers", headers=headers,
                               json={"name": "Old Name", "lat": 37.0, "lng": -1.0, "radius_meters": 200})
    wc_id = create.json()["id"]

    resp = await client.put(f"/work-centers/{wc_id}", headers=headers, json={"name": "New Name", "radius_meters": 500})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"
    assert resp.json()["radius_meters"] == 500


@pytest.mark.asyncio
async def test_admin_delete_work_center(client: AsyncClient, admin_user):
    token = await get_token(client, "admin@test.com", "Admin1234!")
    headers = {"Authorization": f"Bearer {token}"}

    create = await client.post("/work-centers", headers=headers,
                               json={"name": "To Delete", "lat": 37.0, "lng": -1.0, "radius_meters": 200})
    wc_id = create.json()["id"]

    resp = await client.delete(f"/work-centers/{wc_id}", headers=headers)
    assert resp.status_code == 204

    resp = await client.get("/work-centers", headers=headers)
    assert len(resp.json()) == 0


@pytest.mark.asyncio
async def test_worker_cannot_access_work_centers(client: AsyncClient, worker_user):
    token = await get_token(client, "worker@test.com", "Worker1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/work-centers", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_geofence_out_of_range_marked(client: AsyncClient, admin_user, worker_user):
    """When a work center exists and worker clocks in far away, out_of_range should be True."""
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Create a work center in Madrid (far from coords we'll use)
    await client.post("/work-centers", headers=admin_headers,
                      json={"name": "Madrid", "lat": 40.4168, "lng": -3.7038, "radius_meters": 200})

    # Worker clocks in from Barcelona (far from Madrid)
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    worker_headers = {"Authorization": f"Bearer {worker_token}"}

    resp = await client.post(
        "/fichajes/start",
        headers=worker_headers,
        json={"coords": {"lat": 41.3851, "lng": 2.1734}},  # Barcelona
    )
    assert resp.status_code == 201
    assert resp.json()["out_of_range"] is True


@pytest.mark.asyncio
async def test_geofence_in_range_not_marked(client: AsyncClient, admin_user, worker_user):
    """When worker clocks in within range, out_of_range should be False."""
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    await client.post("/work-centers", headers=admin_headers,
                      json={"name": "Oficina", "lat": 40.4168, "lng": -3.7038, "radius_meters": 500})

    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    worker_headers = {"Authorization": f"Bearer {worker_token}"}

    # Clock in ~50m from center
    resp = await client.post(
        "/fichajes/start",
        headers=worker_headers,
        json={"coords": {"lat": 40.4170, "lng": -3.7040}},
    )
    assert resp.status_code == 201
    assert resp.json()["out_of_range"] is False


@pytest.mark.asyncio
async def test_geofence_no_work_center_no_check(client: AsyncClient, worker_user):
    """When no work centers exist, out_of_range remains None."""
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    worker_headers = {"Authorization": f"Bearer {worker_token}"}

    resp = await client.post(
        "/fichajes/start",
        headers=worker_headers,
        json={"coords": {"lat": 41.3851, "lng": 2.1734}},
    )
    assert resp.status_code == 201
    assert resp.json()["out_of_range"] is None


@pytest.mark.asyncio
async def test_geofence_no_coords_no_check(client: AsyncClient, admin_user, worker_user):
    """When no coords provided, out_of_range remains None even if work centers exist."""
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    await client.post(
        "/work-centers",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "Oficina", "lat": 40.4168, "lng": -3.7038, "radius_meters": 200},
    )

    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    resp = await client.post("/fichajes/start", headers={"Authorization": f"Bearer {worker_token}"})
    assert resp.status_code == 201
    assert resp.json()["out_of_range"] is None
