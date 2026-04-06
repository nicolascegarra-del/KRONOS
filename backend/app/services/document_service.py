"""
Document storage service.

Responsibilities:
- Filesystem I/O (write / delete files)
- DNI extraction from filename and PDF content
- Filename sanitization and path safety
"""

import io
import os
import re
from pathlib import Path
from typing import Optional
from uuid import uuid4

import aiofiles

# Base directory where all documents are stored (Docker volume mounted here)
BASE_STORAGE_DIR = Path("/app/storage/documents")

# DNI / NIE regex patterns (Spanish national ID)
_DNI_RE = re.compile(r'\b(\d{8}[A-Za-z])\b')
_NIE_RE = re.compile(r'\b([XYZxyz]\d{7}[A-Za-z])\b')

# Maximum individual file size (50 MB)
MAX_FILE_BYTES = 50 * 1024 * 1024

# PDF magic bytes
_PDF_MAGIC = b'%PDF-'


def sanitize_filename(filename: str) -> str:
    """Remove unsafe characters; keep alphanumerics, dots, dashes, underscores."""
    # Strip path components first
    name = Path(filename).name
    return re.sub(r'[^\w.\-]', '_', name)


def extract_dni(text: str) -> Optional[str]:
    """Return the first DNI or NIE found in *text*, uppercased, or None."""
    m = _DNI_RE.search(text) or _NIE_RE.search(text)
    return m.group(1).upper() if m else None


def extract_dni_from_pdf_bytes(content: bytes) -> Optional[str]:
    """
    Extract text from the first 3 pages of a PDF and search for a DNI/NIE.
    Returns the first match found (uppercased) or None.
    Falls back gracefully if pypdf is unavailable or the PDF is malformed.
    """
    try:
        import pypdf  # lazy import — only needed when filename has no DNI

        reader = pypdf.PdfReader(io.BytesIO(content))
        pages_to_check = min(3, len(reader.pages))
        for i in range(pages_to_check):
            try:
                page_text = reader.pages[i].extract_text() or ""
                dni = extract_dni(page_text)
                if dni:
                    return dni
            except Exception:
                continue
    except Exception:
        pass
    return None


def is_valid_pdf(content: bytes) -> bool:
    """Verify PDF magic bytes (%PDF-) to prevent disguised file uploads."""
    return content[:5] == _PDF_MAGIC


def get_storage_path(company_id: str, stored_name: str) -> Path:
    """Return the absolute path for a stored file, validated against the base dir."""
    company_dir = BASE_STORAGE_DIR / str(company_id)
    target = (company_dir / stored_name).resolve()
    if not str(target).startswith(str(BASE_STORAGE_DIR.resolve())):
        raise ValueError("Path traversal attempt detected")
    return target


async def write_file(path: Path, content: bytes) -> None:
    """Asynchronously write *content* to *path*, creating parent dirs as needed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(path, "wb") as f:
        await f.write(content)
    os.chmod(path, 0o640)


def delete_file(path: Path) -> None:
    """Delete a file from disk; silently ignore if it does not exist."""
    try:
        path.unlink(missing_ok=True)
    except Exception:
        pass


def make_stored_name(original_filename: str) -> str:
    """Generate a unique stored filename: {uuid}_{sanitized_original}."""
    sanitized = sanitize_filename(original_filename)
    return f"{uuid4()}_{sanitized}"
