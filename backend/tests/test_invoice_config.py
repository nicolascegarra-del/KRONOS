"""Tests for invoice config endpoints."""
import pytest
from httpx import AsyncClient

from app.models.user import User


@pytest.mark.asyncio
async def test_get_invoice_config_requires_superadmin(client: AsyncClient, admin_user: User):
    from tests.conftest import get_token
    token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.get("/invoice-config", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_invoice_config_creates_default(client: AsyncClient, superadmin_user: User):
    from tests.conftest import get_token
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    resp = await client.get("/invoice-config", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["invoice_prefix"] == "FAC"
    assert data["next_invoice_number"] == 1
    assert "html_template" in data
    assert "{{INVOICE_NUMBER}}" in data["html_template"]


@pytest.mark.asyncio
async def test_update_invoice_config(client: AsyncClient, superadmin_user: User):
    from tests.conftest import get_token
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.put(
        "/invoice-config",
        headers=headers,
        json={
            "issuer_name": "KRONOS SL",
            "issuer_nif": "B87654321",
            "issuer_address": "Calle Mayor 1",
            "issuer_city": "Madrid",
            "issuer_postal_code": "28001",
            "issuer_phone": "+34 900 000 000",
            "issuer_email": "facturacion@kronos.com",
            "invoice_prefix": "KRN",
            "notes": "Gracias por su confianza.",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["issuer_name"] == "KRONOS SL"
    assert data["issuer_nif"] == "B87654321"
    assert data["invoice_prefix"] == "KRN"
    assert data["notes"] == "Gracias por su confianza."


@pytest.mark.asyncio
async def test_update_invoice_config_partial(client: AsyncClient, superadmin_user: User):
    """Partial update only changes specified fields."""
    from tests.conftest import get_token
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    headers = {"Authorization": f"Bearer {token}"}

    # First set a value
    await client.put("/invoice-config", headers=headers, json={"issuer_name": "Original SL"})

    # Partial update should not overwrite issuer_name
    resp = await client.put("/invoice-config", headers=headers, json={"invoice_prefix": "INV"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["invoice_prefix"] == "INV"
    assert data["issuer_name"] == "Original SL"


@pytest.mark.asyncio
async def test_increment_invoice_number(client: AsyncClient, superadmin_user: User):
    from tests.conftest import get_token
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    headers = {"Authorization": f"Bearer {token}"}

    # Get initial number
    resp = await client.get("/invoice-config", headers=headers)
    initial = resp.json()["next_invoice_number"]

    # Increment
    resp = await client.post("/invoice-config/increment-number", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["next_invoice_number"] == initial + 1

    # Increment again
    resp = await client.post("/invoice-config/increment-number", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["next_invoice_number"] == initial + 2


@pytest.mark.asyncio
async def test_update_logo_base64(client: AsyncClient, superadmin_user: User):
    from tests.conftest import get_token
    token = await get_token(client, "superadmin@test.com", "Super1234!")
    headers = {"Authorization": f"Bearer {token}"}

    fake_logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    resp = await client.put("/invoice-config", headers=headers, json={"logo_base64": fake_logo})
    assert resp.status_code == 200
    assert resp.json()["logo_base64"] == fake_logo


@pytest.mark.asyncio
async def test_worker_cannot_access_invoice_config(client: AsyncClient, worker_user: User):
    from tests.conftest import get_token
    token = await get_token(client, "worker@test.com", "Worker1234!")
    resp = await client.get("/invoice-config", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
