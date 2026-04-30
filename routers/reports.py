"""
Reports — list, status, download, and delete background-generated PDFs.

Reports are produced by safety_export.py and punch_export.py worker threads.
This router is the read/management surface for the frontend.
"""
import io
from datetime import datetime
from pathlib import Path
from typing import Optional

import storage
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
import models
import auth


router = APIRouter(prefix="/api/reports", tags=["reports"])


def _fmt_report(r: models.Report) -> dict:
    return {
        "id": r.id,
        "kind": r.kind,
        "status": r.status,
        "title": r.title or "",
        "filter_summary": r.filter_summary or "",
        "item_count": r.item_count,
        "file_size": r.file_size,
        "error_message": r.error_message or "",
        "requested_by_id": r.requested_by_id,
        "requested_by_name": r.requested_by.name if r.requested_by else None,
        "requested_at": r.requested_at.isoformat() + "Z" if r.requested_at else None,
        "started_at":   r.started_at.isoformat()   + "Z" if r.started_at   else None,
        "completed_at": r.completed_at.isoformat() + "Z" if r.completed_at else None,
        "downloadable": r.status == "READY" and bool(r.stored_path),
    }


@router.get("")
def list_reports(
    kind: Optional[str] = None,
    limit: int = 25,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """List reports for the current project, newest first."""
    q = db.query(models.Report).filter(models.Report.project_id == user.project_id)
    if kind:
        q = q.filter(models.Report.kind == kind)
    rows = q.order_by(models.Report.requested_at.desc()).limit(max(1, min(limit, 200))).all()
    return [_fmt_report(r) for r in rows]


@router.get("/{report_id}")
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    r = db.query(models.Report).filter_by(id=report_id, project_id=user.project_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    return _fmt_report(r)


@router.get("/{report_id}/download")
def download_report(
    report_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    r = db.query(models.Report).filter_by(id=report_id, project_id=user.project_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    if r.status != "READY" or not r.stored_path:
        raise HTTPException(400, f"Report is not ready (status: {r.status})")
    file_content = storage.get_file_bytes(r.stored_path)
    if file_content is None:
        raise HTTPException(404, "Report file not found")
    fname = Path(r.stored_path).name
    return StreamingResponse(
        io.BytesIO(file_content),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.delete("/{report_id}")
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    r = db.query(models.Report).filter_by(id=report_id, project_id=user.project_id).first()
    if not r:
        raise HTTPException(404, "Report not found")
    if r.stored_path:
        try:
            storage.delete_file(r.stored_path)
        except Exception:
            pass
    db.delete(r)
    db.commit()
    return {"ok": True}
