from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import database, models, auth
from datetime import datetime, date
from calendar import monthrange
from routers.audit import set_created, set_updated, check_lock, audit_dict

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


def _distribute_weight_by_month(start_str: str, finish_str: str, weight: float) -> dict:
    """
    Distribute `weight` linearly across calendar months between start_str and finish_str.
    Returns {YYYY-MM: allocated_weight}. Total allocation == weight.
    """
    start  = date.fromisoformat(start_str)
    finish = date.fromisoformat(finish_str)
    if finish < start:
        finish = start
    total_days = (finish - start).days + 1
    result: dict[str, float] = {}
    cur_year, cur_month = start.year, start.month
    while (cur_year, cur_month) <= (finish.year, finish.month):
        m_last_day = monthrange(cur_year, cur_month)[1]
        overlap_start = max(start,  date(cur_year, cur_month, 1))
        overlap_end   = min(finish, date(cur_year, cur_month, m_last_day))
        if overlap_start <= overlap_end:
            overlap_days = (overlap_end - overlap_start).days + 1
            label = f"{cur_year:04d}-{cur_month:02d}"
            result[label] = result.get(label, 0.0) + weight * overlap_days / total_days
        cur_month += 1
        if cur_month > 12:
            cur_month = 1
            cur_year += 1
    return result


def _get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Schemas ───────────────────────────────────────────────────────────────────

class TaskBody(BaseModel):
    description: str
    details: Optional[str] = None
    package_id: Optional[int] = None
    start_date: Optional[str] = None
    finish_date: Optional[str] = None
    financial_weight: Optional[float] = None
    area_id: Optional[int] = None
    unit_id: Optional[int] = None
    updated_at: Optional[str] = None


class PRBody(BaseModel):
    task_id: int
    percentage: float
    note: Optional[str] = None


class BulkPREntry(BaseModel):
    task_id: int
    percentage: float
    note: Optional[str] = None


class BulkPRBody(BaseModel):
    package_id: int
    entries: List[BulkPREntry]
    submit: bool = False


class TaskApproval(BaseModel):
    entry_id: int
    approved: bool


class ReviewBody(BaseModel):
    approved: bool
    comment: str
    task_approvals: Optional[List[TaskApproval]] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _account_manager_package_ids(user, db: Session) -> List[int]:
    """Packages where user's contact is the account manager."""
    if not user.contact_id:
        return []
    pkgs = db.query(models.Package).filter(
        models.Package.project_id == user.project_id,
        models.Package.account_manager_id == user.contact_id,
    ).all()
    return [p.id for p in pkgs]


def _linked_contact_package_ids(user, db: Session) -> List[int]:
    """Packages where user's contact is a linked PackageContact."""
    if not user.contact_id:
        return []
    rows = db.query(models.PackageContact).filter_by(contact_id=user.contact_id).all()
    return [r.package_id for r in rows]


# kept for backward-compat (VENDOR via PackageContact)
def _vendor_package_ids(user, db: Session) -> List[int]:
    return _linked_contact_package_ids(user, db)


def _can_see_task(task: models.Task, user, db: Session) -> bool:
    if user.role in ("ADMIN", "PROJECT_OWNER", "PROJECT_TEAM", "CLIENT"):
        return True
    if not user.contact_id:
        return False
    # account manager or linked contact for this package
    pkg_ids = set(_account_manager_package_ids(user, db)) | set(_linked_contact_package_ids(user, db))
    return task.package_id in pkg_ids


def _can_submit_pr(task: models.Task, user, db: Session) -> bool:
    """Can user create/submit progress reports for this task's package?"""
    if auth.has_owner_or_lead_access(user, "Schedule", db):
        return True
    if not user.contact_id or not task.package_id:
        return False
    # account manager OR linked contact for this package
    pkg_ids = set(_account_manager_package_ids(user, db)) | set(_linked_contact_package_ids(user, db))
    return task.package_id in pkg_ids


def _can_manage_task(task: models.Task, user, db: Session) -> bool:
    """Can user create/edit/delete this task? (account manager of its package)."""
    if auth.has_owner_or_lead_access(user, "Schedule", db):
        return True
    if not user.contact_id or not task.package_id:
        return False
    return task.package_id in _account_manager_package_ids(user, db)


def _is_pmc_reviewer(pr: models.ProgressReport, user) -> bool:
    if not user.contact_id or not pr.package:
        return False
    return pr.package.pmc_commercial_reviewer_id == user.contact_id


def _is_client_reviewer(pr: models.ProgressReport, user) -> bool:
    if not user.contact_id or not pr.package:
        return False
    return pr.package.client_commercial_reviewer_id == user.contact_id


def _log_pr_review(db: Session, pr: models.ProgressReport, event: str, user, approved=None, comment=None):
    db.add(models.ProgressReportReview(
        progress_report_id=pr.id,
        event=event,
        approved=approved,
        comment=comment,
        actor_id=user.id if user else None,
    ))


def _update_pr_status(pr: models.ProgressReport):
    """Keep the PR SUBMITTED until BOTH reviewers have acted (missing
    reviewers are auto-approved at submit time). Either reviewer can still
    submit their decision even after the other has rejected."""
    if not (pr.pmc_reviewed and pr.client_reviewed):
        return
    if pr.pmc_approved is False or pr.client_approved is False:
        pr.status = "REJECTED"
    else:
        pr.status = "APPROVED"


def _fmt_entry(entry: models.ProgressReportEntry) -> dict:
    task = entry.task
    return {
        "id": entry.id,
        "task_id": entry.task_id,
        "task_description": task.description if task else None,
        "task_seq_id": task.project_seq_id if task else None,
        "percentage": entry.percentage,
        "note": entry.note,
        "pmc_approved": entry.pmc_approved,
        "client_approved": entry.client_approved,
    }


def _fmt_pr(pr: models.ProgressReport) -> dict:
    pkg = pr.package
    return {
        "id": pr.id,
        "package_id": pkg.id if pkg else None,
        "package_tag": pkg.tag_number if pkg else None,
        "package_name": pkg.name if pkg else None,
        "pmc_reviewer_name": pkg.pmc_commercial_reviewer.name if pkg and pkg.pmc_commercial_reviewer else None,
        "client_reviewer_name": pkg.client_commercial_reviewer.name if pkg and pkg.client_commercial_reviewer else None,
        "status": pr.status,
        "created_by_id": pr.created_by_id,
        "created_by_name": pr.created_by.name if pr.created_by else None,
        "submitted_at": pr.submitted_at.isoformat() + 'Z' if pr.submitted_at else None,
        "pmc_reviewed": pr.pmc_reviewed,
        "pmc_approved": pr.pmc_approved,
        "pmc_comment": pr.pmc_comment,
        "pmc_reviewed_at": pr.pmc_reviewed_at.isoformat() + 'Z' if pr.pmc_reviewed_at else None,
        "client_reviewed": pr.client_reviewed,
        "client_approved": pr.client_approved,
        "client_comment": pr.client_comment,
        "client_reviewed_at": pr.client_reviewed_at.isoformat() + 'Z' if pr.client_reviewed_at else None,
        "created_at": pr.created_at.isoformat() + 'Z' if pr.created_at else None,
        "entries": [_fmt_entry(e) for e in pr.entries],
    }


def _fmt_task(task: models.Task, db: Session) -> dict:
    pkg = task.package

    # Latest approved entry for this task (from any approved PR for its package)
    latest_approved_entry = None
    if task.package_id:
        latest_approved_entry = (
            db.query(models.ProgressReportEntry)
            .join(models.ProgressReport)
            .filter(
                models.ProgressReportEntry.task_id == task.id,
                models.ProgressReport.status == "APPROVED",
            )
            .order_by(models.ProgressReport.submitted_at.desc())
            .first()
        )

    # Active package-level PR (DRAFT / SUBMITTED / REJECTED)
    active_pr = None
    active_entry = None
    if task.package_id:
        active_pr = (
            db.query(models.ProgressReport)
            .filter(
                models.ProgressReport.package_id == task.package_id,
                models.ProgressReport.project_id == task.project_id,
                models.ProgressReport.status.in_(["DRAFT", "SUBMITTED", "REJECTED"]),
            )
            .order_by(models.ProgressReport.created_at.desc())
            .first()
        )
        if active_pr:
            active_entry = (
                db.query(models.ProgressReportEntry)
                .filter_by(progress_report_id=active_pr.id, task_id=task.id)
                .first()
            )

    current_pct = latest_approved_entry.percentage if latest_approved_entry else 0.0
    today = date.today().isoformat()
    is_late = bool(task.finish_date and task.finish_date < today and current_pct < 100)

    return {
        "id": task.id,
        "seq_id": task.project_seq_id,
        "project_id": task.project_id,
        "package_id": task.package_id,
        "package_tag": pkg.tag_number if pkg else None,
        "package_name": pkg.name if pkg else None,
        "description": task.description,
        "details": task.details,
        "start_date": task.start_date,
        "finish_date": task.finish_date,
        "financial_weight": task.financial_weight,
        "area_id": task.area_id,
        "area_tag": task.area.tag if task.area else None,
        "area_description": task.area.description if task.area else None,
        "unit_id": task.unit_id,
        "unit_tag": task.unit.tag if task.unit else None,
        "unit_description": task.unit.description if task.unit else None,
        "current_progress": current_pct,
        "is_late": is_late,
        # Active PR fields (package-level, shared by all tasks in the package)
        "active_pr_id": active_pr.id if active_pr else None,
        "active_pr_status": active_pr.status if active_pr else None,
        # Entry-level fields for pre-filling the modal
        "active_pr_percentage": active_entry.percentage if active_entry else current_pct,
        "active_pr_note": active_entry.note if active_entry else None,
        "active_pr_entry_id": active_entry.id if active_entry else None,
        "active_pr_entry_pmc_approved": active_entry.pmc_approved if active_entry else None,
        "active_pr_entry_client_approved": active_entry.client_approved if active_entry else None,
        **audit_dict(task),
    }


def _month_end(year: int, month: int) -> str:
    last_day = monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}-{last_day:02d}"


def _linear_pct(start: str, finish: str, at_date: str) -> float:
    if not start or not finish:
        return 0.0
    if at_date >= finish:
        return 1.0
    if at_date < start:
        return 0.0
    s = date.fromisoformat(start)
    f = date.fromisoformat(finish)
    d = date.fromisoformat(at_date)
    duration = (f - s).days
    if duration <= 0:
        return 1.0
    return (d - s).days / duration


# ── Task Endpoints ─────────────────────────────────────────────────────────────

@router.get("/tasks")
def list_tasks(
    package_id: Optional[int] = None,
    db: Session = Depends(_get_db),
    user=Depends(auth.get_project_user),
):
    q = db.query(models.Task).filter(models.Task.project_id == user.project_id)
    if package_id:
        q = q.filter(models.Task.package_id == package_id)
    tasks = q.order_by(models.Task.start_date, models.Task.id).all()
    return [_fmt_task(t, db) for t in tasks if _can_see_task(t, user, db)]


@router.get("/tasks/all")
def list_all_tasks_for_overall_view(
    db: Session = Depends(_get_db),
    user=Depends(auth.get_project_user),
):
    # Bidders never see project schedules; everyone else sees the full Gantt.
    if user.role == "BIDDER":
        raise HTTPException(403, "Bidders cannot view the schedule")
    tasks = (
        db.query(models.Task)
        .filter(models.Task.project_id == user.project_id)
        .order_by(models.Task.start_date, models.Task.id)
        .all()
    )
    return [_fmt_task(t, db) for t in tasks]


@router.post("/tasks")
def create_task(body: TaskBody, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    if not auth.has_owner_or_lead_access(user, "Schedule", db):
        if not body.package_id or body.package_id not in _account_manager_package_ids(user, db):
            raise HTTPException(403, "Only Project Owners or the package account manager can create tasks")
    task = models.Task(
        project_id=user.project_id,
        project_seq_id=models.next_project_seq(db, models.Task, user.project_id),
        package_id=body.package_id,
        description=body.description,
        details=body.details,
        start_date=body.start_date,
        finish_date=body.finish_date,
        financial_weight=body.financial_weight,
        area_id=body.area_id or None,
        unit_id=body.unit_id or None,
    )
    set_created(task, user.id)
    db.add(task)
    db.commit()
    db.refresh(task)
    return _fmt_task(task, db)


@router.put("/tasks/{task_id}")
def update_task(task_id: int, body: TaskBody, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    if not auth.has_owner_or_lead_access(user, "Schedule", db):
        task_check = db.query(models.Task).filter_by(id=task_id, project_id=user.project_id).first()
        if not task_check or not _can_manage_task(task_check, user, db):
            raise HTTPException(403, "Only Project Owners or the package account manager can edit tasks")
    task = db.query(models.Task).filter_by(id=task_id, project_id=user.project_id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    check_lock(task.updated_at, body.updated_at, "task")
    task.description = body.description
    task.details = body.details
    task.package_id = body.package_id
    task.start_date = body.start_date
    task.finish_date = body.finish_date
    task.financial_weight = body.financial_weight
    task.area_id = body.area_id or None
    task.unit_id = body.unit_id or None
    set_updated(task, user.id)
    db.commit()
    db.refresh(task)
    return _fmt_task(task, db)


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    if not auth.has_owner_or_lead_access(user, "Schedule", db):
        task_check = db.query(models.Task).filter_by(id=task_id, project_id=user.project_id).first()
        if not task_check or not _can_manage_task(task_check, user, db):
            raise HTTPException(403, "Only Project Owners or the package account manager can delete tasks")
    task = db.query(models.Task).filter_by(id=task_id, project_id=user.project_id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    db.delete(task)
    db.commit()
    return {"ok": True}


# ── Progress Report Endpoints ─────────────────────────────────────────────────

@router.get("/pending-reviews")
def get_pending_reviews(db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    if not user.contact_id:
        return []
    prs = db.query(models.ProgressReport).filter(
        models.ProgressReport.project_id == user.project_id,
        models.ProgressReport.status == "SUBMITTED",
    ).all()
    result = []
    for pr in prs:
        if _is_pmc_reviewer(pr, user) and not pr.pmc_reviewed:
            result.append({**_fmt_pr(pr), "reviewer_role": "PMC_COMMERCIAL"})
        elif _is_client_reviewer(pr, user) and not pr.client_reviewed:
            result.append({**_fmt_pr(pr), "reviewer_role": "CLIENT_COMMERCIAL"})
    return result


@router.get("/my-rejected")
def get_my_rejected(db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    """Return REJECTED PRs created by this user OR for packages where they are a linked contact."""
    q = db.query(models.ProgressReport).filter(
        models.ProgressReport.project_id == user.project_id,
        models.ProgressReport.status == "REJECTED",
    )
    linked_pkg_ids = _linked_contact_package_ids(user, db)
    if not auth.has_owner_or_lead_access(user, "Schedule", db) and linked_pkg_ids:
        q = q.filter(
            (models.ProgressReport.created_by_id == user.id) |
            (models.ProgressReport.package_id.in_(linked_pkg_ids))
        )
    elif not auth.has_owner_or_lead_access(user, "Schedule", db):
        q = q.filter(models.ProgressReport.created_by_id == user.id)
    prs = q.order_by(models.ProgressReport.created_at.desc()).all()
    return [_fmt_pr(pr) for pr in prs]


@router.get("/my-package-permissions")
def my_package_permissions(db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    """Return package IDs where user is account manager or linked contact."""
    return {
        "account_manager_ids": _account_manager_package_ids(user, db),
        "linked_contact_ids": _linked_contact_package_ids(user, db),
    }


@router.get("/progress-reports")
def list_prs(
    package_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(_get_db),
    user=Depends(auth.get_project_user),
):
    q = db.query(models.ProgressReport).filter(
        models.ProgressReport.project_id == user.project_id
    )
    if package_id:
        q = q.filter(models.ProgressReport.package_id == package_id)
    if status:
        q = q.filter(models.ProgressReport.status == status)
    prs = q.order_by(models.ProgressReport.created_at.desc()).all()
    return [_fmt_pr(pr) for pr in prs]


@router.post("/progress-reports/{pr_id}/submit")
def submit_pr(pr_id: int, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    pr = db.query(models.ProgressReport).filter_by(id=pr_id, project_id=user.project_id).first()
    if not pr:
        raise HTTPException(404, "Progress report not found")
    if pr.created_by_id != user.id and not auth.has_owner_or_lead_access(user, "Schedule", db):
        raise HTTPException(403, "Not authorized")
    if pr.status not in ("DRAFT", "REJECTED"):
        raise HTTPException(400, "Can only submit DRAFT or REJECTED progress reports")
    if not pr.entries:
        raise HTTPException(400, "Cannot submit a progress report with no task entries")
    pr.status = "SUBMITTED"
    pr.submitted_at = datetime.utcnow()
    pr.pmc_reviewed = False
    pr.pmc_approved = None
    pr.pmc_comment = None
    pr.pmc_reviewed_at = None
    pr.client_reviewed = False
    pr.client_approved = None
    pr.client_comment = None
    pr.client_reviewed_at = None
    # Reset per-entry review decisions on resubmission
    for entry in pr.entries:
        entry.pmc_approved = None
        entry.client_approved = None
    _log_pr_review(db, pr, "SUBMIT", user)
    # Auto-approve sides with no reviewer defined on the package so the
    # workflow isn't blocked waiting on a non-existent reviewer.
    now = datetime.utcnow()
    pkg = pr.package
    if pkg and not pkg.pmc_commercial_reviewer_id:
        pr.pmc_reviewed = True
        pr.pmc_approved = True
        pr.pmc_comment = "No reviewer assigned"
        pr.pmc_reviewed_at = now
        for entry in pr.entries:
            entry.pmc_approved = True
    if pkg and not pkg.client_commercial_reviewer_id:
        pr.client_reviewed = True
        pr.client_approved = True
        pr.client_comment = "No reviewer assigned"
        pr.client_reviewed_at = now
        for entry in pr.entries:
            entry.client_approved = True
    _update_pr_status(pr)
    db.commit()
    db.refresh(pr)
    return _fmt_pr(pr)


@router.post("/progress-reports/{pr_id}/pmc-review")
def pmc_review(pr_id: int, body: ReviewBody, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    pr = db.query(models.ProgressReport).filter_by(id=pr_id, project_id=user.project_id).first()
    if not pr:
        raise HTTPException(404, "Progress report not found")
    if pr.status != "SUBMITTED":
        raise HTTPException(400, "Progress report is not under review")
    if not _is_pmc_reviewer(pr, user) and not auth.has_owner_or_lead_access(user, "Schedule", db):
        raise HTTPException(403, "You are not the PMC Commercial reviewer for this package")
    if not body.comment or not body.comment.strip():
        raise HTTPException(400, "Comment is required")
    # Apply per-entry task approvals
    approval_map = {ta.entry_id: ta.approved for ta in (body.task_approvals or [])}
    for entry in pr.entries:
        entry.pmc_approved = approval_map.get(entry.id, body.approved)
    # Overall: True only if all entries approved
    all_approved = all(e.pmc_approved for e in pr.entries)
    pr.pmc_reviewed = True
    pr.pmc_approved = all_approved
    pr.pmc_comment = body.comment
    pr.pmc_reviewed_at = datetime.utcnow()
    _log_pr_review(db, pr, "PMC", user, approved=all_approved, comment=body.comment)
    _update_pr_status(pr)
    # If approved, update task current_progress
    if pr.status == "APPROVED":
        for entry in pr.entries:
            task = db.query(models.Task).filter_by(id=entry.task_id).first()
            # (progress is read dynamically from entries, no separate field to update)
    db.commit()
    db.refresh(pr)
    return _fmt_pr(pr)


@router.post("/progress-reports/{pr_id}/client-review")
def client_review(pr_id: int, body: ReviewBody, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    pr = db.query(models.ProgressReport).filter_by(id=pr_id, project_id=user.project_id).first()
    if not pr:
        raise HTTPException(404, "Progress report not found")
    if pr.status != "SUBMITTED":
        raise HTTPException(400, "Progress report is not under review")
    if not _is_client_reviewer(pr, user) and not auth.has_owner_or_lead_access(user, "Schedule", db):
        raise HTTPException(403, "You are not the Client Commercial reviewer for this package")
    if not body.comment or not body.comment.strip():
        raise HTTPException(400, "Comment is required")
    approval_map = {ta.entry_id: ta.approved for ta in (body.task_approvals or [])}
    for entry in pr.entries:
        entry.client_approved = approval_map.get(entry.id, body.approved)
    all_approved = all(e.client_approved for e in pr.entries)
    pr.client_reviewed = True
    pr.client_approved = all_approved
    pr.client_comment = body.comment
    pr.client_reviewed_at = datetime.utcnow()
    _log_pr_review(db, pr, "CLIENT", user, approved=all_approved, comment=body.comment)
    _update_pr_status(pr)
    db.commit()
    db.refresh(pr)
    return _fmt_pr(pr)


@router.post("/progress-reports/{pr_id}/override")
def override_pr(pr_id: int, body: ReviewBody, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    pr = db.query(models.ProgressReport).filter_by(id=pr_id, project_id=user.project_id).first()
    if not pr:
        raise HTTPException(404, "Progress report not found")
    pkg = db.query(models.Package).filter_by(id=pr.package_id).first() if pr.package_id else None
    gate = auth.package_access_path(user, "Schedule", pkg, db)
    if not gate:
        raise HTTPException(403, "Only Admins, Project Owners, Module Leads or the Package Owner can override")
    if pr.status != "SUBMITTED":
        raise HTTPException(400, "Can only override SUBMITTED progress reports")
    comment = (body.comment or "").strip() or auth.override_default_comment(user.name, gate)
    now = datetime.utcnow()
    approved = body.approved
    for entry in pr.entries:
        entry.pmc_approved = approved
        entry.client_approved = approved
    pr.pmc_reviewed = True
    pr.pmc_approved = approved
    pr.pmc_comment = comment
    pr.pmc_reviewed_at = now
    pr.client_reviewed = True
    pr.client_approved = approved
    pr.client_comment = comment
    pr.client_reviewed_at = now
    pr.status = "APPROVED" if approved else "REJECTED"
    _log_pr_review(db, pr, "OVERRIDE", user, approved=approved, comment=comment)
    db.commit()
    db.refresh(pr)
    return _fmt_pr(pr)


@router.get("/progress-reports/{pr_id}/history")
def get_pr_history(pr_id: int, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    pr = db.query(models.ProgressReport).filter_by(id=pr_id, project_id=user.project_id).first()
    if not pr:
        raise HTTPException(404, "Progress report not found")
    rows = db.query(models.ProgressReportReview).filter_by(
        progress_report_id=pr_id
    ).order_by(models.ProgressReportReview.created_at.asc()).all()
    return [
        {
            "id": r.id,
            "event": r.event,
            "approved": r.approved,
            "comment": r.comment,
            "actor_id": r.actor_id,
            "actor_name": r.actor.name if r.actor else None,
            "created_at": r.created_at.isoformat() + 'Z' if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/progress-reports/{pr_id}/cancel")
def cancel_pr(pr_id: int, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    pr = db.query(models.ProgressReport).filter_by(id=pr_id, project_id=user.project_id).first()
    if not pr:
        raise HTTPException(404, "Progress report not found")
    if pr.created_by_id != user.id and not auth.has_owner_or_lead_access(user, "Schedule", db):
        raise HTTPException(403, "Not authorized")
    if pr.status == "APPROVED":
        raise HTTPException(400, "Cannot cancel an approved progress report")
    pr.status = "CANCELLED"
    db.commit()
    return {"ok": True}


# ── Bulk Progress Report (create / update package-level PR) ───────────────────

@router.post("/progress-reports/bulk")
def bulk_create_pr(body: BulkPRBody, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    """Create or update the package-level draft PR, then optionally submit it."""
    # Validate package & permission
    pkg = db.query(models.Package).filter_by(id=body.package_id, project_id=user.project_id).first()
    if not pkg:
        raise HTTPException(404, "Package not found")

    # Permission: admin/owner, account manager or linked contact for this package
    if not auth.has_owner_or_lead_access(user, "Schedule", db):
        allowed = set(_account_manager_package_ids(user, db)) | set(_linked_contact_package_ids(user, db))
        if body.package_id not in allowed:
            raise HTTPException(403, "Not authorized to report progress for this package")

    # Validate percentages
    for entry in body.entries:
        if not 0 <= entry.percentage <= 100:
            raise HTTPException(400, f"Percentage for task {entry.task_id} must be 0–100")

    # Block if a SUBMITTED PR already exists for this package
    submitted = db.query(models.ProgressReport).filter(
        models.ProgressReport.package_id == body.package_id,
        models.ProgressReport.project_id == user.project_id,
        models.ProgressReport.status == "SUBMITTED",
    ).first()
    if submitted:
        raise HTTPException(400, "A progress report for this package is currently under review. Wait for it to be approved or rejected before submitting a new one.")

    # Find existing DRAFT or REJECTED PR or create a new one
    pr = db.query(models.ProgressReport).filter(
        models.ProgressReport.package_id == body.package_id,
        models.ProgressReport.project_id == user.project_id,
        models.ProgressReport.status.in_(["DRAFT", "REJECTED"]),
    ).order_by(models.ProgressReport.created_at.desc()).first()

    if pr:
        if pr.status == "REJECTED":
            # Reset review fields for resubmission
            pr.pmc_reviewed = False; pr.pmc_approved = None; pr.pmc_comment = None; pr.pmc_reviewed_at = None
            pr.client_reviewed = False; pr.client_approved = None; pr.client_comment = None; pr.client_reviewed_at = None
        pr.status = "DRAFT"
    else:
        pr = models.ProgressReport(
            package_id=body.package_id,
            project_id=user.project_id,
            created_by_id=user.id,
            status="DRAFT",
        )
        db.add(pr)
        db.flush()

    # Upsert entries
    existing_entries = {e.task_id: e for e in pr.entries}
    for item in body.entries:
        if item.task_id in existing_entries:
            e = existing_entries[item.task_id]
            e.percentage = item.percentage
            e.note = item.note
            e.pmc_approved = None
            e.client_approved = None
        else:
            e = models.ProgressReportEntry(
                progress_report_id=pr.id,
                task_id=item.task_id,
                percentage=item.percentage,
                note=item.note,
            )
            db.add(e)

    if body.submit:
        pr.status = "SUBMITTED"
        pr.submitted_at = datetime.utcnow()
        # Reset review state in case we're re-submitting a prior DRAFT
        pr.pmc_reviewed = False
        pr.pmc_approved = None
        pr.pmc_comment = None
        pr.pmc_reviewed_at = None
        pr.client_reviewed = False
        pr.client_approved = None
        pr.client_comment = None
        pr.client_reviewed_at = None
        db.flush()  # make sure pr.entries reflects newly-added rows before we iterate
        for entry in pr.entries:
            entry.pmc_approved = None
            entry.client_approved = None
        _log_pr_review(db, pr, "SUBMIT", user)
        # Auto-approve sides with no reviewer defined on the package.
        now = datetime.utcnow()
        if pkg and not pkg.pmc_commercial_reviewer_id:
            pr.pmc_reviewed = True
            pr.pmc_approved = True
            pr.pmc_comment = "No reviewer assigned"
            pr.pmc_reviewed_at = now
            for entry in pr.entries:
                entry.pmc_approved = True
        if pkg and not pkg.client_commercial_reviewer_id:
            pr.client_reviewed = True
            pr.client_approved = True
            pr.client_comment = "No reviewer assigned"
            pr.client_reviewed_at = now
            for entry in pr.entries:
                entry.client_approved = True
        _update_pr_status(pr)

    db.commit()
    db.refresh(pr)
    return _fmt_pr(pr)


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard(
    package_id: Optional[int] = None,
    area_id: Optional[int] = None,
    unit_id: Optional[int] = None,
    db: Session = Depends(_get_db),
    user=Depends(auth.get_project_user),
):
    if user.role == "VENDOR":
        raise HTTPException(403, "Vendors cannot access the schedule dashboard")

    q = db.query(models.Task).filter(models.Task.project_id == user.project_id)
    if package_id:
        q = q.filter(models.Task.package_id == package_id)
    if area_id:
        q = q.filter(models.Task.area_id == area_id)
    if unit_id:
        q = q.filter(models.Task.unit_id == unit_id)
    tasks = q.all()

    today = date.today().isoformat()

    # Latest approved progress percentage per task (from ProgressReportEntry)
    approved_pct: dict[int, float] = {}
    for task in tasks:
        entry = (
            db.query(models.ProgressReportEntry)
            .join(models.ProgressReport,
                  models.ProgressReportEntry.progress_report_id == models.ProgressReport.id)
            .filter(
                models.ProgressReportEntry.task_id == task.id,
                models.ProgressReport.status == "APPROVED",
            )
            .order_by(models.ProgressReport.submitted_at.desc())
            .first()
        )
        approved_pct[task.id] = entry.percentage if entry else 0.0

    # KPIs
    total = len(tasks)
    completed = sum(1 for t in tasks if approved_pct[t.id] >= 100)
    late = sum(1 for t in tasks if t.finish_date and t.finish_date < today and approved_pct[t.id] < 100)
    on_schedule = total - late - completed

    # Actual progress — weighted average if weights exist, simple average otherwise
    def _task_progress(t):
        return approved_pct[t.id]

    total_weight = sum(t.financial_weight or 0 for t in tasks)
    tasks_with_weight = sum(1 for t in tasks if t.financial_weight)

    if total_weight > 0:
        actual_progress = sum(_task_progress(t) * (t.financial_weight or 0) for t in tasks) / total_weight
    elif total > 0:
        actual_progress = sum(_task_progress(t) for t in tasks) / total
    else:
        actual_progress = 0.0

    # Per-package breakdown
    pkg_breakdown = []
    all_pkg_ids = list({t.package_id for t in tasks if t.package_id}) if not package_id else [package_id]
    for pid in all_pkg_ids:
        pkg_tasks = [t for t in tasks if t.package_id == pid]
        pkg = db.query(models.Package).filter(models.Package.id == pid).first()
        pkg_total = len(pkg_tasks)
        pkg_completed = sum(1 for t in pkg_tasks if _task_progress(t) >= 100)
        pkg_late = sum(1 for t in pkg_tasks if t.finish_date and t.finish_date < today and _task_progress(t) < 100)
        pkg_on_schedule = pkg_total - pkg_late - pkg_completed
        pkg_w = sum(t.financial_weight or 0 for t in pkg_tasks)
        if pkg_w > 0:
            pkg_progress = sum(_task_progress(t) * (t.financial_weight or 0) for t in pkg_tasks) / pkg_w
        elif pkg_total > 0:
            pkg_progress = sum(_task_progress(t) for t in pkg_tasks) / pkg_total
        else:
            pkg_progress = 0.0
        pkg_breakdown.append({
            "package_id":   pid,
            "package_tag":  pkg.tag_number if pkg else "—",
            "package_name": pkg.name if pkg else "—",
            "total":        pkg_total,
            "completed":    pkg_completed,
            "late":         pkg_late,
            "on_schedule":  pkg_on_schedule,
            "actual_progress": round(pkg_progress, 1),
        })

    # Package forecast comparison (financial weight vs budget forecast = baseline + transfers)
    pkg_comparisons = []
    pkg_ids_for_cmp = list({t.package_id for t in tasks if t.package_id}) if not package_id else [package_id]
    for pid in pkg_ids_for_cmp:
        pkg_tasks = [t for t in tasks if t.package_id == pid]
        pkg = db.query(models.Package).filter(models.Package.id == pid).first()
        weight_sum = sum(t.financial_weight or 0 for t in pkg_tasks)

        bl = db.query(models.BudgetBaseline).filter(models.BudgetBaseline.package_id == pid).first()
        baseline_amt = bl.amount if bl else 0.0
        transfers_in  = db.query(models.BudgetTransfer).filter(models.BudgetTransfer.to_package_id   == pid).all()
        transfers_out = db.query(models.BudgetTransfer).filter(models.BudgetTransfer.from_package_id == pid).all()
        transfer_net  = sum(t.amount for t in transfers_in) - sum(t.amount for t in transfers_out)
        forecast_amt  = baseline_amt + transfer_net

        pkg_comparisons.append({
            "package_id":      pid,
            "package_tag":     pkg.tag_number if pkg else "—",
            "package_name":    pkg.name if pkg else "—",
            "financial_weight": weight_sum,
            "forecast":        forecast_amt,
            "gap":             weight_sum - forecast_amt,
        })

    # EV Charts
    ev_forecast_pts = []   # cumulative planned value: [{date, value}]
    ev_actual_pts = []     # cumulative earned value:  [{date, value}]
    ev_monthly = []        # non-cumulative per month: [{month, forecast, actual}]
    ev_date_range = None

    dated_tasks = [t for t in tasks if t.finish_date and t.financial_weight]
    if dated_tasks:
        # Date range: earliest of (start_date, finish_date) → latest finish_date
        all_dates = [t.finish_date for t in dated_tasks]
        for t in dated_tasks:
            if t.start_date:
                all_dates.append(t.start_date)
        min_date = min(all_dates)
        max_date = max(t.finish_date for t in dated_tasks)
        ev_date_range = {"min": min_date, "max": max_date}

        # ── Forecast: time-phased distribution across months ─────────────────
        # Each task's weight is spread linearly over [start_date, finish_date].
        # Tasks without a start_date fall back to the old finish-date assignment.
        monthly_forecast: dict[str, float] = {}
        for t in dated_tasks:
            if t.start_date:
                dist = _distribute_weight_by_month(t.start_date, t.finish_date, t.financial_weight)
                for m, v in dist.items():
                    monthly_forecast[m] = monthly_forecast.get(m, 0.0) + v
            else:
                m = t.finish_date[:7]
                monthly_forecast[m] = monthly_forecast.get(m, 0.0) + t.financial_weight

        # Build ev_forecast_pts from monthly totals (cumulative, mid-month proxy dates)
        cumul = 0.0
        for label in sorted(monthly_forecast):
            cumul += monthly_forecast[label]
            yr, mo = int(label[:4]), int(label[5:7])
            mid = f"{yr:04d}-{mo:02d}-15"
            ev_forecast_pts.append({"date": mid, "value": round(cumul, 2)})

        # ── Actual cumulative ─────────────────────────────────────────────────
        # For each approved PR entry: increment = (new_pct - prev_pct) / 100 * weight.
        # This gives the delta EV when progress changes; cumsum = total EV over time.
        actual_events: list[tuple[str, float]] = []
        for task in dated_tasks:
            rows = (
                db.query(models.ProgressReportEntry, models.ProgressReport)
                .join(models.ProgressReport,
                      models.ProgressReportEntry.progress_report_id == models.ProgressReport.id)
                .filter(
                    models.ProgressReportEntry.task_id == task.id,
                    models.ProgressReport.status == "APPROVED",
                )
                .order_by(models.ProgressReport.submitted_at)
                .all()
            )
            prev_pct = 0.0
            for entry, pr in rows:
                pr_date = (
                    pr.submitted_at.strftime("%Y-%m-%d") if pr.submitted_at
                    else (pr.created_at.strftime("%Y-%m-%d") if pr.created_at else None)
                )
                if pr_date:
                    increment = (entry.percentage - prev_pct) / 100.0 * task.financial_weight
                    actual_events.append((pr_date, increment))
                    prev_pct = entry.percentage

        actual_events.sort(key=lambda x: x[0])

        date_actual: dict[str, float] = {}
        for d, inc in actual_events:
            date_actual[d] = date_actual.get(d, 0.0) + inc

        cumul = 0.0
        for d in sorted(date_actual):
            cumul += date_actual[d]
            ev_actual_pts.append({"date": d, "value": round(cumul, 2)})

        # ── Monthly actual (non-cumulative) ──────────────────────────────────
        monthly_actual: dict[str, float] = {}
        for d, inc in actual_events:
            m = d[:7]
            monthly_actual[m] = monthly_actual.get(m, 0.0) + inc

        start_year, start_month = int(min_date[:4]), int(min_date[5:7])
        end_year, end_month = int(max_date[:4]), int(max_date[5:7])
        year, month = start_year, start_month
        cum_forecast = 0.0
        cum_actual = 0.0
        while (year, month) <= (end_year, end_month):
            label = f"{year:04d}-{month:02d}"
            last_day = monthrange(year, month)[1]
            m_end = f"{year:04d}-{month:02d}-{last_day:02d}"
            fc_nc = round(monthly_forecast.get(label, 0.0), 2)
            ac_nc = round(monthly_actual.get(label, 0.0), 2)
            cum_forecast += fc_nc
            cum_actual += ac_nc
            ev_monthly.append({
                "month": label,
                "forecast_nc": fc_nc,
                "actual_nc": ac_nc,
                "forecast_cum": round(cum_forecast, 2),
                "actual_cum": round(cum_actual, 2) if label <= today[:7] else None,
            })
            month += 1
            if month > 12:
                month = 1
                year += 1

    return {
        "total": total,
        "completed": completed,
        "late": late,
        "on_schedule": on_schedule,
        "actual_progress": round(actual_progress, 1),
        "total_weight": total_weight,
        "tasks_with_weight": tasks_with_weight,
        "pkg_comparisons": pkg_comparisons,
        "pkg_breakdown": pkg_breakdown,
        "ev_forecast_pts": ev_forecast_pts,
        "ev_actual_pts": ev_actual_pts,
        "ev_monthly": ev_monthly,
        "ev_date_range": ev_date_range,
    }
