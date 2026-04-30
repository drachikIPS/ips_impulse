"""
File storage abstraction.

In production (Supabase): set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
optionally STORAGE_BUCKET (defaults to "attachments").

In development (local): leave those vars unset — files are written to the
local "uploads/" directory as before.
"""
import os
from pathlib import Path
from typing import Optional

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
STORAGE_BUCKET = os.environ.get("STORAGE_BUCKET", "attachments")

_USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
UPLOAD_ROOT = Path("uploads")

_client = None


def _supabase():
    global _client
    if _client is None:
        from supabase import create_client
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _client


def upload_file(path: str, content: bytes, content_type: str) -> None:
    """Upload bytes to Supabase Storage or local disk."""
    if _USE_SUPABASE:
        _supabase().storage.from_(STORAGE_BUCKET).upload(
            path=path,
            file=content,
            file_options={"content-type": content_type, "upsert": "true"},
        )
    else:
        dest = UPLOAD_ROOT / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)


def get_file_bytes(stored_path: str) -> Optional[bytes]:
    """Return file bytes from Supabase Storage or local disk. Returns None if not found."""
    if _USE_SUPABASE:
        try:
            return _supabase().storage.from_(STORAGE_BUCKET).download(stored_path)
        except Exception:
            return None
    else:
        p = UPLOAD_ROOT / stored_path
        return p.read_bytes() if p.exists() else None


def delete_file(stored_path: str) -> None:
    """Delete a file from Supabase Storage or local disk. Silently ignores errors."""
    if _USE_SUPABASE:
        try:
            _supabase().storage.from_(STORAGE_BUCKET).remove([stored_path])
        except Exception:
            pass
    else:
        p = UPLOAD_ROOT / stored_path
        try:
            if p.exists():
                p.unlink()
        except Exception:
            pass
