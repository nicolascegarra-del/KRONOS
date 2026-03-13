"""Tests for absence/vacation management."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.user import User
from tests.conftest import get_token


@pytest.mark.asyncio
async def test_worker_create_absence(client: AsyncClient, worker_user: User, admin_user: User):
    token = await get_token(client, "worker@test.com", "Worker1234!")
    resp = await client.post(
        "/workers/me/absences",
        json={"type": "vacaciones", "start_date": "2026-07-01", "end_date": "2026-07-15"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["type"] == "vacaciones"
    assert data["status"] == "pending"
    assert data["start_date"] == "2026-07-01"
    assert data["end_date"] == "2026-07-15"


@pytest.mark.asyncio
async def test_worker_create_absence_invalid_dates(client: AsyncClient, worker_user: User):
    token = await get_token(client, "worker@test.com", "Worker1234!")
    resp = await client.post(
        "/workers/me/absences",
        json={"type": "permiso", "start_date": "2026-07-15", "end_date": "2026-07-01"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_worker_list_absences(client: AsyncClient, worker_user: User, admin_user: User):
    token = await get_token(client, "worker@test.com", "Worker1234!")
    # Create one
    await client.post(
        "/workers/me/absences",
        json={"type": "baja_medica", "start_date": "2026-06-01", "end_date": "2026-06-05"},
        headers={"Authorization": f"Bearer {token}"},
    )
    resp = await client.get("/workers/me/absences", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_worker_cancel_pending_absence(client: AsyncClient, worker_user: User, admin_user: User):
    token = await get_token(client, "worker@test.com", "Worker1234!")
    create_resp = await client.post(
        "/workers/me/absences",
        json={"type": "otros", "start_date": "2026-08-01", "end_date": "2026-08-02"},
        headers={"Authorization": f"Bearer {token}"},
    )
    absence_id = create_resp.json()["id"]
    delete_resp = await client.delete(
        f"/workers/me/absences/{absence_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert delete_resp.status_code == 204


@pytest.mark.asyncio
async def test_admin_list_absences(client: AsyncClient, worker_user: User, admin_user: User):
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    await client.post(
        "/workers/me/absences",
        json={"type": "vacaciones", "start_date": "2026-09-01", "end_date": "2026-09-10"},
        headers={"Authorization": f"Bearer {worker_token}"},
    )
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.get("/admin/absences", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["user_name"] == "Worker User"


@pytest.mark.asyncio
async def test_admin_approve_absence(client: AsyncClient, worker_user: User, admin_user: User):
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    create_resp = await client.post(
        "/workers/me/absences",
        json={"type": "vacaciones", "start_date": "2026-10-01", "end_date": "2026-10-05"},
        headers={"Authorization": f"Bearer {worker_token}"},
    )
    absence_id = create_resp.json()["id"]

    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.patch(
        f"/admin/absences/{absence_id}",
        json={"status": "approved", "admin_notes": "Aprobado, disfruta tus vacaciones"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "approved"
    assert data["admin_notes"] == "Aprobado, disfruta tus vacaciones"
    assert data["reviewed_by_id"] is not None


@pytest.mark.asyncio
async def test_admin_reject_absence(client: AsyncClient, worker_user: User, admin_user: User):
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    create_resp = await client.post(
        "/workers/me/absences",
        json={"type": "permiso", "start_date": "2026-11-01", "end_date": "2026-11-01"},
        headers={"Authorization": f"Bearer {worker_token}"},
    )
    absence_id = create_resp.json()["id"]

    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.patch(
        f"/admin/absences/{absence_id}",
        json={"status": "rejected", "admin_notes": "Demasiadas ausencias ese mes"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"


@pytest.mark.asyncio
async def test_worker_cannot_cancel_approved_absence(
    client: AsyncClient, worker_user: User, admin_user: User
):
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    create_resp = await client.post(
        "/workers/me/absences",
        json={"type": "vacaciones", "start_date": "2026-12-01", "end_date": "2026-12-05"},
        headers={"Authorization": f"Bearer {worker_token}"},
    )
    absence_id = create_resp.json()["id"]

    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    await client.patch(
        f"/admin/absences/{absence_id}",
        json={"status": "approved"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    # Worker tries to cancel already-approved absence
    resp = await client.delete(
        f"/workers/me/absences/{absence_id}",
        headers={"Authorization": f"Bearer {worker_token}"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_admin_filter_by_status(client: AsyncClient, worker_user: User, admin_user: User):
    worker_token = await get_token(client, "worker@test.com", "Worker1234!")
    create_resp = await client.post(
        "/workers/me/absences",
        json={"type": "vacaciones", "start_date": "2026-07-01", "end_date": "2026-07-05"},
        headers={"Authorization": f"Bearer {worker_token}"},
    )
    absence_id = create_resp.json()["id"]

    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    await client.patch(
        f"/admin/absences/{absence_id}",
        json={"status": "approved"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    resp_pending = await client.get(
        "/admin/absences?filter_status=pending",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp_pending.json() == []

    resp_approved = await client.get(
        "/admin/absences?filter_status=approved",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert len(resp_approved.json()) == 1


@pytest.mark.asyncio
async def test_admin_cannot_see_other_company_absences(
    client: AsyncClient, session: AsyncSession, worker_user: User, admin_user: User
):
    """Admin scoping: can only see absences from their own company."""
    from app.models.company import Company
    from app.models.user import User, UserRole
    from app.models.absence import Absence
    from app.services.auth import hash_password
    from datetime import date

    other_company = Company(name="Other Corp", max_workers=5)
    session.add(other_company)
    await session.commit()
    await session.refresh(other_company)

    other_worker = User(
        email="other@worker.com",
        full_name="Other Worker",
        hashed_password=hash_password("Worker1234!"),
        role=UserRole.worker,
        company_id=other_company.id,
    )
    session.add(other_worker)
    await session.commit()
    await session.refresh(other_worker)

    other_absence = Absence(
        user_id=other_worker.id,
        type="vacaciones",
        start_date=date(2026, 8, 1),
        end_date=date(2026, 8, 5),
    )
    session.add(other_absence)
    await session.commit()

    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.get("/admin/absences", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    # Admin should see 0 absences (the other company's absence should not appear)
    assert resp.json() == []
