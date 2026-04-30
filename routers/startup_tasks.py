"""
Project start-up checklist API.

Surfaces the per-project rows seeded by `seed_startup_tasks_for_project`
to PROJECT_OWNER (and ADMIN) users only. Closing a row closes it for the
whole project, not just for the calling user (single shared checklist).
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models
import auth

router = APIRouter(prefix="/api/startup-tasks", tags=["startup-tasks"])


def _can_manage(user: auth.ProjectContext) -> bool:
    return user.role in ("ADMIN", "PROJECT_OWNER")


def _format(t: models.ProjectStartupTask) -> dict:
    return {
        "id": t.id,
        "task_key": t.task_key,
        "title": t.title,
        "body": t.body,
        "target_module": t.target_module,
        "target_subtab": t.target_subtab,
        "sort_order": t.sort_order,
        "status": t.status,
        "closed_at": t.closed_at.isoformat() + "Z" if t.closed_at else None,
        "closed_by_id": t.closed_by_id,
    }


@router.get("")
def list_startup_tasks(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """List OPEN startup tasks for the current project. Returned only to
    project owners (and admins) — everyone else gets an empty list so the
    frontend can call this unconditionally."""
    if not _can_manage(user):
        return []
    rows = (db.query(models.ProjectStartupTask)
              .filter_by(project_id=user.project_id, status="OPEN")
              .order_by(models.ProjectStartupTask.sort_order)
              .all())
    return [_format(t) for t in rows]


@router.post("/{task_id}/close")
def close_startup_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Mark a startup task as CLOSED. Single shared row, so closing here
    removes it from every PROJECT_OWNER's action list."""
    if not _can_manage(user):
        raise HTTPException(403, "Project owner access required")
    t = (db.query(models.ProjectStartupTask)
           .filter_by(id=task_id, project_id=user.project_id).first())
    if not t:
        raise HTTPException(404, "Startup task not found")
    if t.status != "CLOSED":
        t.status = "CLOSED"
        t.closed_at = datetime.utcnow()
        t.closed_by_id = user.id
        db.commit()
    return _format(t)
