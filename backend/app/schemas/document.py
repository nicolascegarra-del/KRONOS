from uuid import UUID
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class DocumentOut(BaseModel):
    id: UUID
    filename: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime
    category: Optional[str] = None
    description: Optional[str] = None
    user_id: Optional[UUID] = None
    worker_name: Optional[str] = None   # populated by router join

    model_config = {"from_attributes": True}


# ── Bulk upload report ─────────────────────────────────────────────────────────

class AssignedItem(BaseModel):
    filename: str
    worker_name: str
    worker_id: str
    size_bytes: int
    document_id: str
    source: str   # "filename" | "content"

class UnmatchedItem(BaseModel):
    filename: str
    dni_found: str
    size_bytes: int
    source: str

class NoDniItem(BaseModel):
    filename: str
    size_bytes: int

class BulkUploadReport(BaseModel):
    assigned: List[AssignedItem]
    unmatched: List[UnmatchedItem]
    no_dni: List[NoDniItem]
    total_files: int
    total_size_bytes: int
    storage_used_bytes: int
    storage_max_bytes: int


# ── Storage usage ──────────────────────────────────────────────────────────────

class StorageUsage(BaseModel):
    used_bytes: int
    max_bytes: int
    percentage: float   # 0-100
    warning: bool       # True when >= 80%


# ── Document list response ─────────────────────────────────────────────────────

class DocumentListResponse(BaseModel):
    items: List[DocumentOut]
    total: int
    storage: StorageUsage


# ── Bulk delete ────────────────────────────────────────────────────────────────

class BulkDeleteRequest(BaseModel):
    ids: List[UUID]
