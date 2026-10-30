"""On-disk storage for uploaded and derived PDFs, with age-based cleanup."""

import os
import time
import uuid
from pathlib import Path

UPLOAD_DIR = Path(
    os.environ.get("PDF_WORKBENCH_UPLOAD_DIR")
    or Path(__file__).resolve().parent / "temp_documents"
)
DOCUMENT_TTL_SECONDS = int(float(os.environ.get("DOCUMENT_TTL_MINUTES", "120")) * 60)
CLEANUP_INTERVAL_SECONDS = 10 * 60


def ensure_upload_dir() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def new_document() -> tuple[str, Path]:
    """Allocate a fresh document id and the path it will be stored at."""
    ensure_upload_dir()
    document_id = str(uuid.uuid4())
    return document_id, UPLOAD_DIR / f"{document_id}.pdf"


def document_path(document_id: str) -> Path:
    """Path for an existing document. Raises ValueError (bad id) or FileNotFoundError."""
    parsed = uuid.UUID(document_id)  # rejects anything that isn't a UUID
    path = UPLOAD_DIR / f"{parsed}.pdf"
    if not path.is_file():
        raise FileNotFoundError(document_id)
    os.utime(path)  # active documents stay alive past the TTL
    return path


def delete_document(document_id: str) -> bool:
    try:
        path = document_path(document_id)
    except (ValueError, FileNotFoundError):
        return False
    path.unlink(missing_ok=True)
    return True


def cleanup_old_documents(max_age_seconds: int | None = None) -> int:
    """Delete documents not touched within max_age_seconds. Returns how many were removed."""
    max_age = DOCUMENT_TTL_SECONDS if max_age_seconds is None else max_age_seconds
    if not UPLOAD_DIR.is_dir():
        return 0
    cutoff = time.time() - max_age
    removed = 0
    for path in UPLOAD_DIR.glob("*.pdf"):
        try:
            if path.stat().st_mtime < cutoff:
                path.unlink()
                removed += 1
        except OSError:
            continue
    return removed
