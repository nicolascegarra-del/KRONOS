"""
Document management module.

Endpoints:
  POST /documents/bulk-upload          — admin: upload multiple PDFs
  GET  /documents                      — admin: list with filters + storage info
  GET  /documents/storage-usage        — admin: current quota
  GET  /documents/my                   — worker: own documents
  GET  /documents/{id}/download        — admin or assigned worker
  DELETE /documents/{id}               — admin: delete one
  POST /documents/bulk-delete          — admin: delete multiple
"""

from pathlib import Path
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_admin, get_current_user
from app.models.company import Company
from app.models.document import Document
from app.models.user import User, UserRole
from app.schemas.document import (
    AssignedItem,
    BulkDeleteRequest,
    BulkUploadReport,
    DocumentListResponse,
    DocumentOut,
    NoDniItem,
    StorageUsage,
    UnmatchedItem,
)
from app.services import document_service as ds

router = APIRouter(prefix="/documents", tags=["documents"])

_MAX_UPLOAD_MB = 50


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_company(session: AsyncSession, company_id: UUID) -> Company:
    result = await session.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    return company


async def _get_storage_used(session: AsyncSession, company_id: UUID) -> int:
    result = await session.execute(
        select(func.coalesce(func.sum(Document.size_bytes), 0))
        .where(Document.company_id == company_id)
    )
    return result.scalar_one()


def _storage_usage(used_bytes: int, max_mb: int) -> StorageUsage:
    max_bytes = max_mb * 1024 * 1024
    pct = round((used_bytes / max_bytes * 100) if max_bytes > 0 else 0, 1)
    return StorageUsage(
        used_bytes=used_bytes,
        max_bytes=max_bytes,
        percentage=min(pct, 100.0),
        warning=pct >= 80,
    )


async def _worker_name_map(session: AsyncSession, company_id: UUID) -> dict[UUID, str]:
    """Return {user_id: full_name} for all active workers in the company."""
    result = await session.execute(
        select(User.id, User.full_name)
        .where(User.company_id == company_id, User.role == UserRole.worker, User.is_active == True)
    )
    return {row.id: row.full_name for row in result.all()}


def _to_doc_out(doc: Document, worker_names: dict) -> DocumentOut:
    return DocumentOut(
        id=doc.id,
        filename=doc.filename,
        content_type=doc.content_type,
        size_bytes=doc.size_bytes,
        uploaded_at=doc.uploaded_at,
        category=doc.category,
        description=doc.description,
        user_id=doc.user_id,
        worker_name=worker_names.get(doc.user_id) if doc.user_id else None,
    )


# ── Storage usage ─────────────────────────────────────────────────────────────

@router.get("/storage-usage", response_model=StorageUsage)
async def get_storage_usage(
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    company = await _get_company(session, current_user.company_id)
    used = await _get_storage_used(session, company.id)
    return _storage_usage(used, company.max_storage_mb or 100)


# ── Worker: own documents ─────────────────────────────────────────────────────

@router.get("/my", response_model=List[DocumentOut])
async def list_my_documents(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if not current_user.company_id:
        return []
    result = await session.execute(
        select(Document)
        .where(
            Document.company_id == current_user.company_id,
            Document.user_id == current_user.id,
        )
        .order_by(Document.uploaded_at.desc())
    )
    docs = result.scalars().all()
    return [DocumentOut(
        id=d.id,
        filename=d.filename,
        content_type=d.content_type,
        size_bytes=d.size_bytes,
        uploaded_at=d.uploaded_at,
        category=d.category,
        description=d.description,
        user_id=d.user_id,
    ) for d in docs]


# ── Download ──────────────────────────────────────────────────────────────────

@router.get("/{document_id}/download")
async def download_document(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc or doc.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")

    if current_user.role == UserRole.worker and doc.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin acceso a este documento")

    path = Path(doc.stored_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado en disco")

    async def _iter():
        import aiofiles
        async with aiofiles.open(path, "rb") as f:
            while chunk := await f.read(65536):
                yield chunk

    safe_name = doc.filename.replace('"', '_')
    return StreamingResponse(
        _iter(),
        media_type=doc.content_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


# ── Admin: list documents ─────────────────────────────────────────────────────

@router.get("", response_model=DocumentListResponse)
async def list_documents(
    worker_id: Optional[UUID] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    company = await _get_company(session, current_user.company_id)

    q = select(Document).where(Document.company_id == company.id)
    if worker_id:
        q = q.where(Document.user_id == worker_id)
    if category:
        q = q.where(Document.category == category)
    if search:
        q = q.where(Document.filename.ilike(f"%{search}%"))

    count_result = await session.execute(
        select(func.count()).select_from(q.subquery())
    )
    total = count_result.scalar_one()

    q = q.order_by(Document.uploaded_at.desc()).offset((page - 1) * page_size).limit(page_size)
    docs_result = await session.execute(q)
    docs = docs_result.scalars().all()

    worker_names = await _worker_name_map(session, company.id)
    used = await _get_storage_used(session, company.id)

    return DocumentListResponse(
        items=[_to_doc_out(d, worker_names) for d in docs],
        total=total,
        storage=_storage_usage(used, company.max_storage_mb or 100),
    )


# ── Admin: bulk upload ────────────────────────────────────────────────────────

@router.post("/bulk-upload", response_model=BulkUploadReport, status_code=status.HTTP_201_CREATED)
async def bulk_upload(
    files: List[UploadFile],
    category: Optional[str] = None,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    company = await _get_company(session, current_user.company_id)

    if not company.docs_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El módulo de documentos no está activado para esta empresa",
        )

    # Load all workers with DNI for batch lookup
    workers_result = await session.execute(
        select(User.id, User.full_name, User.dni)
        .where(
            User.company_id == company.id,
            User.role == UserRole.worker,
            User.is_active == True,
            User.dni.isnot(None),
        )
    )
    worker_by_dni: dict[str, tuple[UUID, str]] = {
        row.dni.upper(): (row.id, row.full_name)
        for row in workers_result.all()
        if row.dni
    }

    used_bytes = await _get_storage_used(session, company.id)
    max_bytes = (company.max_storage_mb or 100) * 1024 * 1024

    assigned: List[AssignedItem] = []
    unmatched: List[UnmatchedItem] = []
    no_dni: List[NoDniItem] = []
    written_paths: List[Path] = []  # for rollback on commit failure
    total_new_bytes = 0

    for file in files:
        content = await file.read()
        size = len(content)

        # Individual size cap
        if size > _MAX_UPLOAD_MB * 1024 * 1024:
            no_dni.append(NoDniItem(filename=file.filename or "unknown", size_bytes=size))
            continue

        # Validate PDF magic bytes
        if not ds.is_valid_pdf(content):
            no_dni.append(NoDniItem(filename=file.filename or "unknown", size_bytes=size))
            continue

        # Quota check per-file (accumulative)
        if used_bytes + total_new_bytes + size > max_bytes:
            # Stop processing further files once quota would be exceeded
            break

        original_name = file.filename or "documento.pdf"

        # DNI extraction — level 1: filename; level 2: PDF content
        source = "filename"
        dni = ds.extract_dni(original_name)
        if not dni:
            source = "content"
            dni = ds.extract_dni_from_pdf_bytes(content)

        # Write file to disk
        stored_name = ds.make_stored_name(original_name)
        path = ds.get_storage_path(str(company.id), stored_name)
        await ds.write_file(path, content)
        written_paths.append(path)

        doc = Document(
            company_id=company.id,
            filename=original_name,
            stored_path=str(path),
            content_type=file.content_type or "application/pdf",
            size_bytes=size,
            uploaded_by=current_user.id,
            category=category,
        )

        if dni and dni in worker_by_dni:
            user_id, worker_name = worker_by_dni[dni]
            doc.user_id = user_id
            session.add(doc)
            # flush to get doc.id before commit
            await session.flush()
            assigned.append(AssignedItem(
                filename=original_name,
                worker_name=worker_name,
                worker_id=str(user_id),
                size_bytes=size,
                document_id=str(doc.id),
                source=source,
            ))
        elif dni:
            session.add(doc)
            unmatched.append(UnmatchedItem(
                filename=original_name,
                dni_found=dni,
                size_bytes=size,
                source=source,
            ))
        else:
            session.add(doc)
            no_dni.append(NoDniItem(filename=original_name, size_bytes=size))

        total_new_bytes += size

    try:
        await session.commit()
    except Exception as exc:
        # Rollback filesystem writes to keep disk and DB in sync
        for p in written_paths:
            ds.delete_file(p)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al guardar en base de datos: {exc}",
        )

    final_used = await _get_storage_used(session, company.id)

    return BulkUploadReport(
        assigned=assigned,
        unmatched=unmatched,
        no_dni=no_dni,
        total_files=len(files),
        total_size_bytes=total_new_bytes,
        storage_used_bytes=final_used,
        storage_max_bytes=max_bytes,
    )


# ── Admin: delete one ─────────────────────────────────────────────────────────

@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc or doc.company_id != current_user.company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")

    ds.delete_file(Path(doc.stored_path))
    await session.delete(doc)
    await session.commit()


# ── Admin: bulk delete ────────────────────────────────────────────────────────

@router.post("/bulk-delete", status_code=status.HTTP_200_OK)
async def bulk_delete_documents(
    body: BulkDeleteRequest,
    current_user: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    if not body.ids:
        return {"deleted": 0}

    result = await session.execute(
        select(Document).where(
            Document.id.in_(body.ids),
            Document.company_id == current_user.company_id,
        )
    )
    docs = result.scalars().all()

    for doc in docs:
        ds.delete_file(Path(doc.stored_path))

    await session.execute(
        sa_delete(Document).where(
            Document.id.in_([d.id for d in docs]),
            Document.company_id == current_user.company_id,
        )
    )
    await session.commit()
    return {"deleted": len(docs)}
