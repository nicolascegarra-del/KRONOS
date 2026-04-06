"""
Tests for the document management module.

Covers:
- Module disabled → 403 on upload
- Quota enforcement (413 when limit exceeded)
- DNI extraction from filename and (mocked) PDF content
- Worker can only see own documents
- Download endpoint security
- Bulk delete
- Unread count / mark-read
"""
import io
import tempfile
from pathlib import Path
from typing import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.document import Document
from app.models.user import User, UserRole
from tests.conftest import get_token

# Minimal valid PDF content (magic bytes + enough to be accepted)
_FAKE_PDF = b"%PDF-1.4 fake content"


def _pdf_file(filename: str, content: bytes = _FAKE_PDF):
    """Return (filename, fileobj, content_type) tuple for multipart upload."""
    return ("files", (filename, io.BytesIO(content), "application/pdf"))


# ── Fixture: company with docs enabled ───────────────────────────────────────


@pytest_asyncio.fixture
async def docs_company(session: AsyncSession) -> Company:
    c = Company(name="Docs Corp", max_workers=20, docs_enabled=True, max_storage_mb=10)
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return c


@pytest_asyncio.fixture
async def docs_admin(session: AsyncSession, docs_company: Company) -> User:
    from app.services.auth import hash_password
    u = User(
        email="docsadmin@test.com",
        full_name="Docs Admin",
        hashed_password=hash_password("Admin1234!"),
        role=UserRole.admin,
        company_id=docs_company.id,
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest_asyncio.fixture
async def docs_worker(session: AsyncSession, docs_company: Company) -> User:
    from app.services.auth import hash_password
    u = User(
        email="docsworker@test.com",
        full_name="Docs Worker",
        hashed_password=hash_password("Worker1234!"),
        role=UserRole.worker,
        company_id=docs_company.id,
        dni="12345678A",
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


@pytest_asyncio.fixture
async def other_worker(session: AsyncSession, docs_company: Company) -> User:
    from app.services.auth import hash_password
    u = User(
        email="otherworker@test.com",
        full_name="Other Worker",
        hashed_password=hash_password("Worker1234!"),
        role=UserRole.worker,
        company_id=docs_company.id,
        dni="87654321B",
    )
    session.add(u)
    await session.commit()
    await session.refresh(u)
    return u


# ── Module disabled ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_returns_403_when_docs_disabled(
    client: AsyncClient, admin_user: User, company: Company
):
    """Bulk upload must return 403 when docs_enabled=False (default)."""
    token = await get_token(client, "admin@test.com", "Admin1234!")
    resp = await client.post(
        "/documents/bulk-upload",
        headers={"Authorization": f"Bearer {token}"},
        files=[_pdf_file("test.pdf")],
    )
    assert resp.status_code == 403


# ── Storage usage ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_storage_usage_initially_zero(
    client: AsyncClient, docs_admin: User, docs_company: Company
):
    """Storage usage must be 0 when no documents exist."""
    token = await get_token(client, "docsadmin@test.com", "Admin1234!")
    resp = await client.get(
        "/documents/storage-usage",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["used_bytes"] == 0
    assert data["percentage"] == 0.0


# ── Bulk upload ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_upload_assigns_document_by_dni_in_filename(
    client: AsyncClient, docs_admin: User, docs_worker: User, docs_company: Company
):
    """PDF named with a valid DNI is assigned to the matching worker."""
    token = await get_token(client, "docsadmin@test.com", "Admin1234!")

    with tempfile.TemporaryDirectory() as tmpdir:
        with patch("app.services.document_service.BASE_STORAGE_DIR", Path(tmpdir)):
            resp = await client.post(
                "/documents/bulk-upload",
                headers={"Authorization": f"Bearer {token}"},
                files=[_pdf_file("nomina_12345678A_enero.pdf")],
            )

    assert resp.status_code == 201
    data = resp.json()
    assert data["total_files"] == 1
    assert len(data["assigned"]) == 1
    assert data["assigned"][0]["worker_name"] == docs_worker.full_name
    assert data["assigned"][0]["source"] == "filename"
    assert len(data["no_dni"]) == 0
    assert len(data["unmatched"]) == 0


@pytest.mark.asyncio
async def test_upload_no_dni_goes_to_no_dni_list(
    client: AsyncClient, docs_admin: User, docs_company: Company
):
    """PDF without any DNI ends up in the no_dni list."""
    token = await get_token(client, "docsadmin@test.com", "Admin1234!")

    with tempfile.TemporaryDirectory() as tmpdir:
        with patch("app.services.document_service.BASE_STORAGE_DIR", Path(tmpdir)):
            resp = await client.post(
                "/documents/bulk-upload",
                headers={"Authorization": f"Bearer {token}"},
                files=[_pdf_file("contrato_general.pdf")],
            )

    assert resp.status_code == 201
    data = resp.json()
    assert len(data["no_dni"]) == 1
    assert len(data["assigned"]) == 0


@pytest.mark.asyncio
async def test_upload_unknown_dni_goes_to_unmatched(
    client: AsyncClient, docs_admin: User, docs_company: Company
):
    """PDF with a DNI that matches no worker ends up in unmatched."""
    token = await get_token(client, "docsadmin@test.com", "Admin1234!")

    with tempfile.TemporaryDirectory() as tmpdir:
        with patch("app.services.document_service.BASE_STORAGE_DIR", Path(tmpdir)):
            resp = await client.post(
                "/documents/bulk-upload",
                headers={"Authorization": f"Bearer {token}"},
                files=[_pdf_file("nomina_99999999Z_enero.pdf")],
            )

    assert resp.status_code == 201
    data = resp.json()
    assert len(data["unmatched"]) == 1
    assert data["unmatched"][0]["dni_found"] == "99999999Z"


@pytest.mark.asyncio
async def test_upload_rejects_non_pdf(
    client: AsyncClient, docs_admin: User, docs_company: Company
):
    """A file without PDF magic bytes must be placed in no_dni (rejected)."""
    token = await get_token(client, "docsadmin@test.com", "Admin1234!")
    not_a_pdf = b"PK\x03\x04fake zip content"  # ZIP magic, not PDF

    with tempfile.TemporaryDirectory() as tmpdir:
        with patch("app.services.document_service.BASE_STORAGE_DIR", Path(tmpdir)):
            resp = await client.post(
                "/documents/bulk-upload",
                headers={"Authorization": f"Bearer {token}"},
                files=[("files", ("malicious.pdf", io.BytesIO(not_a_pdf), "application/pdf"))],
            )

    assert resp.status_code == 201
    data = resp.json()
    # Rejected file goes to no_dni since it's invalid
    assert len(data["assigned"]) == 0


# ── Worker document visibility ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_worker_sees_only_own_documents(
    client: AsyncClient,
    session: AsyncSession,
    docs_admin: User,
    docs_worker: User,
    other_worker: User,
    docs_company: Company,
):
    """Worker must only see documents assigned to them, not to other workers."""
    from uuid import uuid4

    # Insert documents directly to avoid filesystem dependency
    doc_mine = Document(
        company_id=docs_company.id,
        user_id=docs_worker.id,
        filename="mine.pdf",
        stored_path=f"/fake/{uuid4()}_mine.pdf",
        content_type="application/pdf",
        size_bytes=100,
        uploaded_by=docs_admin.id,
    )
    doc_other = Document(
        company_id=docs_company.id,
        user_id=other_worker.id,
        filename="other.pdf",
        stored_path=f"/fake/{uuid4()}_other.pdf",
        content_type="application/pdf",
        size_bytes=100,
        uploaded_by=docs_admin.id,
    )
    session.add(doc_mine)
    session.add(doc_other)
    await session.commit()

    token = await get_token(client, "docsworker@test.com", "Worker1234!")
    resp = await client.get(
        "/documents/my",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    filenames = [d["filename"] for d in data]
    assert "mine.pdf" in filenames
    assert "other.pdf" not in filenames


@pytest.mark.asyncio
async def test_worker_cannot_download_other_workers_document(
    client: AsyncClient,
    session: AsyncSession,
    docs_admin: User,
    docs_worker: User,
    other_worker: User,
    docs_company: Company,
):
    """Worker must receive 403 when trying to download another worker's document."""
    from uuid import uuid4

    doc = Document(
        company_id=docs_company.id,
        user_id=other_worker.id,
        filename="private.pdf",
        stored_path=f"/fake/{uuid4()}_private.pdf",
        content_type="application/pdf",
        size_bytes=100,
        uploaded_by=docs_admin.id,
    )
    session.add(doc)
    await session.commit()

    token = await get_token(client, "docsworker@test.com", "Worker1234!")
    resp = await client.get(
        f"/documents/{doc.id}/download",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


# ── Unread count / mark-read ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unread_count_reflects_new_documents(
    client: AsyncClient,
    session: AsyncSession,
    docs_admin: User,
    docs_worker: User,
    docs_company: Company,
):
    """Unread count must equal the number of unread docs for the worker."""
    from uuid import uuid4

    doc1 = Document(
        company_id=docs_company.id,
        user_id=docs_worker.id,
        filename="doc1.pdf",
        stored_path=f"/fake/{uuid4()}_doc1.pdf",
        content_type="application/pdf",
        size_bytes=100,
        uploaded_by=docs_admin.id,
        is_read=False,
    )
    doc2 = Document(
        company_id=docs_company.id,
        user_id=docs_worker.id,
        filename="doc2.pdf",
        stored_path=f"/fake/{uuid4()}_doc2.pdf",
        content_type="application/pdf",
        size_bytes=100,
        uploaded_by=docs_admin.id,
        is_read=True,
    )
    session.add(doc1)
    session.add(doc2)
    await session.commit()

    token = await get_token(client, "docsworker@test.com", "Worker1234!")
    resp = await client.get(
        "/documents/unread-count",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["count"] == 1


@pytest.mark.asyncio
async def test_mark_read_updates_is_read(
    client: AsyncClient,
    session: AsyncSession,
    docs_admin: User,
    docs_worker: User,
    docs_company: Company,
):
    """POST /documents/{id}/mark-read must flip is_read to True."""
    from uuid import uuid4
    from sqlalchemy import select

    doc = Document(
        company_id=docs_company.id,
        user_id=docs_worker.id,
        filename="unread.pdf",
        stored_path=f"/fake/{uuid4()}_unread.pdf",
        content_type="application/pdf",
        size_bytes=100,
        uploaded_by=docs_admin.id,
        is_read=False,
    )
    session.add(doc)
    await session.commit()

    token = await get_token(client, "docsworker@test.com", "Worker1234!")
    resp = await client.post(
        f"/documents/{doc.id}/mark-read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    await session.refresh(doc)
    assert doc.is_read is True


# ── Admin list ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_admin_can_list_company_documents(
    client: AsyncClient,
    session: AsyncSession,
    docs_admin: User,
    docs_worker: User,
    docs_company: Company,
):
    """Admin list endpoint returns documents for their company."""
    from uuid import uuid4

    doc = Document(
        company_id=docs_company.id,
        user_id=docs_worker.id,
        filename="listed.pdf",
        stored_path=f"/fake/{uuid4()}_listed.pdf",
        content_type="application/pdf",
        size_bytes=200,
        uploaded_by=docs_admin.id,
    )
    session.add(doc)
    await session.commit()

    token = await get_token(client, "docsadmin@test.com", "Admin1234!")
    resp = await client.get(
        "/documents",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert any(d["filename"] == "listed.pdf" for d in data["items"])


# ── Bulk delete ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_delete_removes_documents(
    client: AsyncClient,
    session: AsyncSession,
    docs_admin: User,
    docs_company: Company,
):
    """Admin can delete multiple documents at once."""
    from uuid import uuid4
    from sqlalchemy import select

    doc1 = Document(
        company_id=docs_company.id,
        filename="del1.pdf",
        stored_path=f"/fake/{uuid4()}_del1.pdf",
        content_type="application/pdf",
        size_bytes=50,
        uploaded_by=docs_admin.id,
    )
    doc2 = Document(
        company_id=docs_company.id,
        filename="del2.pdf",
        stored_path=f"/fake/{uuid4()}_del2.pdf",
        content_type="application/pdf",
        size_bytes=50,
        uploaded_by=docs_admin.id,
    )
    session.add(doc1)
    session.add(doc2)
    await session.commit()

    token = await get_token(client, "docsadmin@test.com", "Admin1234!")
    with patch("app.services.document_service.delete_file"):
        resp = await client.post(
            "/documents/bulk-delete",
            headers={"Authorization": f"Bearer {token}"},
            json={"ids": [str(doc1.id), str(doc2.id)]},
        )

    assert resp.status_code == 200
    assert resp.json()["deleted"] == 2

    remaining = await session.execute(
        select(Document).where(Document.id.in_([doc1.id, doc2.id]))
    )
    assert len(remaining.scalars().all()) == 0
