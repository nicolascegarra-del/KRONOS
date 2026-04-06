"""Tests for worker schedule (annual calendar) endpoints."""
import pytest
from httpx import AsyncClient

from app.models.user import User
from tests.conftest import get_token


@pytest.mark.asyncio
async def test_admin_can_save_schedule_days(
    client: AsyncClient, admin_user: User, worker_user: User
):
    """Admin can upsert days for a worker."""
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    payload = {
        "days": [
            {"schedule_date": "2026-03-10", "start_time": "09:00:00", "end_time": "17:00:00"},
            {"schedule_date": "2026-03-11", "start_time": "09:00:00", "end_time": "17:00:00"},
        ]
    }
    resp = await client.put(
        f"/users/{worker_user.id}/schedule",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2


@pytest.mark.asyncio
async def test_admin_get_schedule_returns_month_days(
    client: AsyncClient, admin_user: User, worker_user: User
):
    """GET returns only days in the requested month."""
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    # Save days in two different months
    payload = {
        "days": [
            {"schedule_date": "2026-03-15", "start_time": "08:00:00", "end_time": "16:00:00"},
            {"schedule_date": "2026-04-01", "start_time": "08:00:00", "end_time": "16:00:00"},
        ]
    }
    await client.put(
        f"/users/{worker_user.id}/schedule",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    resp = await client.get(
        f"/users/{worker_user.id}/schedule",
        params={"year": 2026, "month": 3},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["schedule_date"] == "2026-03-15"


@pytest.mark.asyncio
async def test_worker_can_read_own_schedule(
    client: AsyncClient, admin_user: User, worker_user: User
):
    """Worker can read their own schedule."""
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    payload = {
        "days": [
            {"schedule_date": "2026-03-20", "start_time": "10:00:00", "end_time": "18:00:00"},
        ]
    }
    await client.put(
        f"/users/{worker_user.id}/schedule",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    resp = await client.get(
        "/workers/me/schedule",
        params={"year": 2026, "month": 3},
        headers={"Authorization": f"Bearer {worker_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert any(d["schedule_date"] == "2026-03-20" for d in data)


@pytest.mark.asyncio
async def test_delete_day_via_null_times(
    client: AsyncClient, admin_user: User, worker_user: User
):
    """Sending null start_time/end_time deletes that day."""
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    # First save
    await client.put(
        f"/users/{worker_user.id}/schedule",
        json={"days": [{"schedule_date": "2026-03-25", "start_time": "09:00:00", "end_time": "17:00:00"}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    # Then delete via null
    await client.put(
        f"/users/{worker_user.id}/schedule",
        json={"days": [{"schedule_date": "2026-03-25", "start_time": None, "end_time": None}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    resp = await client.get(
        f"/users/{worker_user.id}/schedule",
        params={"year": 2026, "month": 3},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    data = resp.json()
    assert not any(d["schedule_date"] == "2026-03-25" for d in data)


# ── Horario partido (split shift) ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_split_shift_saved_and_returned(
    client: AsyncClient, admin_user: User, worker_user: User
):
    """Admin can save a split shift and the two time ranges are returned correctly."""
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    payload = {
        "days": [
            {
                "schedule_date": "2026-06-10",
                "start_time": "09:00:00",
                "end_time": "14:00:00",
                "start_time_2": "17:00:00",
                "end_time_2": "20:00:00",
            }
        ]
    }
    resp = await client.put(
        f"/users/{worker_user.id}/schedule",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    get_resp = await client.get(
        f"/users/{worker_user.id}/schedule",
        params={"year": 2026, "month": 6},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert get_resp.status_code == 200
    days = get_resp.json()
    day = next((d for d in days if d["schedule_date"] == "2026-06-10"), None)
    assert day is not None
    assert day["start_time"].startswith("09:00")
    assert day["end_time"].startswith("14:00")
    assert day["start_time_2"].startswith("17:00")
    assert day["end_time_2"].startswith("20:00")


@pytest.mark.asyncio
async def test_worker_can_read_own_split_schedule(
    client: AsyncClient, admin_user: User, worker_user: User
):
    """Worker endpoint also returns start_time_2 / end_time_2 for split shifts."""
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    payload = {
        "days": [
            {
                "schedule_date": "2026-06-15",
                "start_time": "10:00:00",
                "end_time": "14:00:00",
                "start_time_2": "16:00:00",
                "end_time_2": "19:30:00",
            }
        ]
    }
    await client.put(
        f"/users/{worker_user.id}/schedule",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    resp = await client.get(
        "/workers/me/schedule",
        params={"year": 2026, "month": 6},
        headers={"Authorization": f"Bearer {worker_token}"},
    )
    assert resp.status_code == 200
    days = resp.json()
    day = next((d for d in days if d["schedule_date"] == "2026-06-15"), None)
    assert day is not None
    assert day["start_time_2"].startswith("16:00")
    assert day["end_time_2"].startswith("19:30")


@pytest.mark.asyncio
async def test_single_shift_has_null_split_fields(
    client: AsyncClient, admin_user: User, worker_user: User
):
    """A regular (non-split) shift must return null for start_time_2/end_time_2."""
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    payload = {
        "days": [
            {"schedule_date": "2026-06-20", "start_time": "08:00:00", "end_time": "16:00:00"},
        ]
    }
    await client.put(
        f"/users/{worker_user.id}/schedule",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    get_resp = await client.get(
        f"/users/{worker_user.id}/schedule",
        params={"year": 2026, "month": 6},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    days = get_resp.json()
    day = next((d for d in days if d["schedule_date"] == "2026-06-20"), None)
    assert day is not None
    assert day.get("start_time_2") is None
    assert day.get("end_time_2") is None


@pytest.mark.asyncio
async def test_overwrite_split_shift_with_single_shift(
    client: AsyncClient, admin_user: User, worker_user: User
):
    """Overwriting a split shift with a single shift clears the second time range."""
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    # Save split shift
    await client.put(
        f"/users/{worker_user.id}/schedule",
        json={"days": [{"schedule_date": "2026-06-25", "start_time": "09:00:00", "end_time": "14:00:00",
                        "start_time_2": "17:00:00", "end_time_2": "20:00:00"}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    # Overwrite with a normal shift (no split)
    await client.put(
        f"/users/{worker_user.id}/schedule",
        json={"days": [{"schedule_date": "2026-06-25", "start_time": "08:00:00", "end_time": "16:00:00"}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    get_resp = await client.get(
        f"/users/{worker_user.id}/schedule",
        params={"year": 2026, "month": 6},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    day = next((d for d in get_resp.json() if d["schedule_date"] == "2026-06-25"), None)
    assert day is not None
    assert day.get("start_time_2") is None
    assert day.get("end_time_2") is None
