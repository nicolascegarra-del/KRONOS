import pytest
from httpx import AsyncClient

from tests.conftest import get_token


@pytest.mark.asyncio
async def test_superadmin_get_email_config_empty(client: AsyncClient, superadmin_user, company):
    """Superadmin can read email config for a company; returns empty defaults when not configured."""
    superadmin_token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.get(
        f"/companies/{company.id}/email-config",
        headers={"Authorization": f"Bearer {superadmin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "smtp_host" in data
    assert "has_password" in data
    assert "smtp_password" not in data


@pytest.mark.asyncio
async def test_superadmin_save_email_config(client: AsyncClient, superadmin_user, company):
    """Superadmin can save and retrieve email config per company."""
    superadmin_token = await get_token(client, "superadmin@test.com", "Super1234!")
    headers = {"Authorization": f"Bearer {superadmin_token}"}

    payload = {
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "smtp_user": "test@gmail.com",
        "smtp_password": "secret123",
        "from_email": "test@gmail.com",
        "from_name": "Test App",
        "use_tls": True,
    }
    resp = await client.put(f"/companies/{company.id}/email-config", headers=headers, json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["smtp_host"] == "smtp.gmail.com"
    assert data["smtp_user"] == "test@gmail.com"
    assert data["has_password"] is True
    assert "smtp_password" not in data

    # GET reflects saved config
    resp2 = await client.get(f"/companies/{company.id}/email-config", headers=headers)
    assert resp2.json()["smtp_host"] == "smtp.gmail.com"


@pytest.mark.asyncio
async def test_admin_cannot_access_email_config(client: AsyncClient, admin_user, company):
    """Admin role cannot access company email config endpoints (superadmin only)."""
    admin_token = await get_token(client, "admin@test.com", "Admin1234!")
    headers = {"Authorization": f"Bearer {admin_token}"}

    resp = await client.get(f"/companies/{company.id}/email-config", headers=headers)
    assert resp.status_code == 403

    resp = await client.put(f"/companies/{company.id}/email-config", headers=headers, json={})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_get_app_settings_defaults(client: AsyncClient, admin_user):
    token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.get("/settings/app", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "late_alert_enabled" in data
    assert "late_alert_minutes" in data
    assert "auto_close_enabled" in data
    assert "auto_close_hours" in data
    assert data["auto_close_enabled"] is False
    assert data["auto_close_hours"] == 12


@pytest.mark.asyncio
async def test_admin_save_app_settings(client: AsyncClient, admin_user):
    token = await get_token(client, "admin@test.com", "Admin1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.put(
        "/settings/app",
        headers=headers,
        json={"late_alert_enabled": True, "late_alert_minutes": 20},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["late_alert_enabled"] is True
    assert data["late_alert_minutes"] == 20

    # GET reflects saved values
    resp2 = await client.get("/settings/app", headers=headers)
    assert resp2.json()["late_alert_minutes"] == 20


@pytest.mark.asyncio
async def test_admin_save_auto_close_settings(client: AsyncClient, admin_user):
    token = await get_token(client, "admin@test.com", "Admin1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.put(
        "/settings/app",
        headers=headers,
        json={
            "late_alert_enabled": False,
            "late_alert_minutes": 15,
            "auto_close_enabled": True,
            "auto_close_hours": 8,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["auto_close_enabled"] is True
    assert data["auto_close_hours"] == 8

    # GET reflects saved values
    resp2 = await client.get("/settings/app", headers=headers)
    assert resp2.json()["auto_close_enabled"] is True
    assert resp2.json()["auto_close_hours"] == 8


@pytest.mark.asyncio
async def test_admin_save_auto_close_invalid_hours(client: AsyncClient, admin_user):
    token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.put(
        "/settings/app",
        headers={"Authorization": f"Bearer {token}"},
        json={"late_alert_enabled": False, "late_alert_minutes": 15, "auto_close_hours": 0},  # < 1 → invalid
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_admin_save_app_settings_invalid_minutes(client: AsyncClient, admin_user):
    token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.put(
        "/settings/app",
        headers={"Authorization": f"Bearer {token}"},
        json={"late_alert_enabled": True, "late_alert_minutes": 0},  # < 1 → invalid
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_worker_cannot_access_app_settings(client: AsyncClient, worker_user):
    token = await get_token(client, "worker@test.com", "Worker1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/settings/app", headers=headers)
    assert resp.status_code == 403

    resp = await client.put(
        "/settings/app",
        headers=headers,
        json={"late_alert_enabled": False, "late_alert_minutes": 10},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_late_alerts_disabled_by_default(client: AsyncClient, admin_user, worker_user):
    """With alerts disabled, /admin/notifications/late must return an empty list."""
    token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.get(
        "/admin/notifications/late",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_worker_cannot_access_notifications(client: AsyncClient, worker_user):
    token = await get_token(client, "worker@test.com", "Worker1234!")
    resp = await client.get(
        "/admin/notifications/late",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
