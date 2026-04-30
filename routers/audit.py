"""
Shared helpers for audit fields (created_by, updated_by, optimistic locking).
"""
from datetime import datetime
from typing import Optional
from fastapi import HTTPException


def check_lock(record_updated_at: Optional[datetime], client_updated_at: Optional[str], entity: str = "record"):
    """
    Raise HTTP 409 if the record was modified after the client loaded it.
    Pass None for either argument to skip the check (backward-compatible).
    """
    if not client_updated_at or not record_updated_at:
        return
    stored = record_updated_at.replace(microsecond=0).isoformat()
    client = client_updated_at[:19].replace(" ", "T")
    if stored != client:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This {entity} was modified by another user since you opened it. "
                "Please reload and try again."
            ),
        )


def set_created(record, user_id: int):
    """Set created_by_id (and created_at if not already set)."""
    if hasattr(record, "created_by_id"):
        record.created_by_id = user_id
    if hasattr(record, "created_at") and not record.created_at:
        record.created_at = datetime.utcnow()


def set_updated(record, user_id: int):
    """Set updated_at and updated_by_id."""
    if hasattr(record, "updated_at"):
        record.updated_at = datetime.utcnow()
    if hasattr(record, "updated_by_id"):
        record.updated_by_id = user_id


def audit_dict(record) -> dict:
    """Return the four audit fields as a dict to merge into any response."""
    return {
        "created_at":      record.created_at.isoformat() + 'Z' if getattr(record, "created_at", None) else None,
        "created_by_name": record.created_by.name if getattr(record, "created_by", None) else None,
        "updated_at":      record.updated_at.isoformat() + 'Z' if getattr(record, "updated_at", None) else None,
        "updated_by_name": record.updated_by.name if getattr(record, "updated_by", None) else None,
    }
