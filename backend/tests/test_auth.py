import pytest
from httpx import AsyncClient

from tests.conftest import get_token


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, worker_user):
    resp = await client.post(
        "/auth/login",
        json={"email": "worker@test.com", "password": "Worker1234!"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, worker_user):
    resp = await client.post(
        "/auth/login",
        json={"email": "worker@test.com", "password": "wrongpassword"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(client: AsyncClient):
    resp = await client.post(
        "/auth/login",
        json={"email": "nobody@test.com", "password": "pass"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient, worker_user):
    # Login to get refresh cookie
    login_resp = await client.post(
        "/auth/login",
        json={"email": "worker@test.com", "password": "Worker1234!"},
    )
    assert login_resp.status_code == 200

    # Use the cookie set on login
    refresh_resp = await client.post("/auth/refresh")
    assert refresh_resp.status_code == 200
    assert "access_token" in refresh_resp.json()


@pytest.mark.asyncio
async def test_logout(client: AsyncClient, worker_user):
    token = await get_token(client, "worker@test.com", "Worker1234!")
    resp = await client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_protected_route_without_token(client: AsyncClient):
    resp = await client.get("/fichajes/me")
    assert resp.status_code == 401
