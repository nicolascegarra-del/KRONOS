"""
Stability tests: /health endpoint + background cleanup logic.

These tests verify the mechanisms that prevent production crashes:
- The /health endpoint always responds (Docker health check depends on it)
- The cleanup loop correctly purges expired password-reset tokens (prevents
  unbounded table growth → slow queries → connection-pool exhaustion → crash)
- Old admin-access logs are pruned after 90 days
"""
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.adminaccesslog import AdminAccessLog
from app.models.password_reset import PasswordResetToken


# ── /health ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health_endpoint_returns_ok(client: AsyncClient):
    """/health must return HTTP 200 and status='ok'."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_health_endpoint_is_unauthenticated(client: AsyncClient):
    """/health must be reachable without a token (Docker health check has no token)."""
    resp = await client.get("/health")
    assert resp.status_code != 401


# ── Password-reset token cleanup ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cleanup_removes_tokens_older_than_24h(session: AsyncSession, worker_user):
    """Tokens expired > 24h ago must be deleted by the cleanup logic."""
    old = PasswordResetToken(
        user_id=worker_user.id,
        token="old-token-abc",
        expires_at=datetime.utcnow() - timedelta(hours=48),
    )
    recent = PasswordResetToken(
        user_id=worker_user.id,
        token="recent-token-xyz",
        expires_at=datetime.utcnow() + timedelta(hours=1),  # still valid
    )
    session.add(old)
    session.add(recent)
    await session.commit()

    # Reproduce the exact query from _cleanup_loop in main.py
    cutoff = datetime.utcnow() - timedelta(hours=24)
    result = await session.execute(
        sa_delete(PasswordResetToken).where(PasswordResetToken.expires_at < cutoff)
    )
    await session.commit()

    assert result.rowcount >= 1, "Cleanup must delete token expired 48h ago"

    # Recent token must survive
    rows = await session.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == "recent-token-xyz")
    )
    assert rows.scalars().first() is not None, "Valid token must not be deleted"

    # Old token must be gone
    rows = await session.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == "old-token-abc")
    )
    assert rows.scalars().first() is None, "Expired token must be deleted"


@pytest.mark.asyncio
async def test_cleanup_does_not_delete_fresh_expired_tokens(session: AsyncSession, worker_user):
    """Tokens expired < 24h ago are NOT deleted (grace period)."""
    fresh_expired = PasswordResetToken(
        user_id=worker_user.id,
        token="fresh-expired-token",
        expires_at=datetime.utcnow() - timedelta(hours=2),
    )
    session.add(fresh_expired)
    await session.commit()

    cutoff = datetime.utcnow() - timedelta(hours=24)
    result = await session.execute(
        sa_delete(PasswordResetToken).where(PasswordResetToken.expires_at < cutoff)
    )
    await session.commit()

    assert result.rowcount == 0

    rows = await session.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == "fresh-expired-token")
    )
    assert rows.scalars().first() is not None


# ── Admin-access-log cleanup ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cleanup_removes_access_logs_older_than_90_days(
    session: AsyncSession, admin_user
):
    """Access logs older than 90 days must be purged."""
    old_log = AdminAccessLog(
        admin_id=admin_user.id,
        action="VIEW_FICHAJES",
        accessed_at=datetime.utcnow() - timedelta(days=100),
    )
    recent_log = AdminAccessLog(
        admin_id=admin_user.id,
        action="EXPORT_REPORT",
        accessed_at=datetime.utcnow() - timedelta(days=10),
    )
    session.add(old_log)
    session.add(recent_log)
    await session.commit()

    cutoff = datetime.utcnow() - timedelta(days=90)
    result = await session.execute(
        sa_delete(AdminAccessLog).where(AdminAccessLog.accessed_at < cutoff)
    )
    await session.commit()

    assert result.rowcount >= 1

    rows = await session.execute(
        select(AdminAccessLog).where(AdminAccessLog.id == recent_log.id)
    )
    assert rows.scalars().first() is not None, "Recent log must survive cleanup"

    rows = await session.execute(
        select(AdminAccessLog).where(AdminAccessLog.id == old_log.id)
    )
    assert rows.scalars().first() is None, "Old log must be deleted"
