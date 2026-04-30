import os
import re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

import database, models, auth
import seed_data
from routers.audit import set_created, set_updated, check_lock, audit_dict

router = APIRouter(prefix="/api/projects", tags=["projects"])

# Customer feedback files live OUTSIDE the project upload tree so they
# survive project archiving and can be aggregated across projects.
CUSTOMER_FEEDBACK_DIR = os.path.join("uploads", "Customer Feedbacks")
os.makedirs(CUSTOMER_FEEDBACK_DIR, exist_ok=True)


def _sanitize_filename_part(s: str) -> str:
    """Make a string safe for use as a filename component."""
    if not s:
        return ""
    s = re.sub(r"[\\/:*?\"<>|]+", "_", s)
    s = re.sub(r"\s+", "_", s.strip())
    return s[:80]


def _get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    # Project number is part of folder paths (uploads, exports) — keep it short.
    project_number: str = Field(..., min_length=1, max_length=15)
    # Required at create time so every project starts with a complete identity
    # card. Edit endpoint stays partial (see ProjectUpdate) so legacy rows
    # can still be patched.
    description: str = Field(..., min_length=1)
    client: str = Field(..., min_length=1)
    client_reference: str = Field(..., min_length=1)
    general_description: str = Field(..., min_length=1)
    start_date: str = Field(..., min_length=1)
    end_date: str = Field(..., min_length=1)
    location: str = Field(..., min_length=1)
    status: str = "ACTIVE"


class ProjectUpdate(BaseModel):
    project_number: Optional[str] = Field(None, max_length=15)
    description: Optional[str] = None
    client: Optional[str] = None
    client_reference: Optional[str] = None
    general_description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None
    location: Optional[str] = None
    updated_at: Optional[str] = None


class LessonAreaInput(BaseModel):
    area_key: str
    score: str             # GOOD | ACCEPTABLE | BAD | NA
    comment: Optional[str] = None


class ProjectClose(BaseModel):
    closure_date: str
    lessons_summary: Optional[str] = None
    area_scores: List[LessonAreaInput] = []
    # Optional override; if not supplied, the overall result is derived from
    # the area scores.
    overall_result: Optional[str] = None


VALID_PROJECT_ROLES = ("PROJECT_OWNER", "PROJECT_TEAM", "CLIENT", "VENDOR", "BIDDER")

class UserProjectAssign(BaseModel):
    user_id: int
    role: str  # PROJECT_OWNER, PROJECT_TEAM, CLIENT, VENDOR, BIDDER


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _fmt_project(p: models.Project, my_role: str = None) -> dict:
    d = {
        "id": p.id,
        "project_number": p.project_number,
        "description": p.description,
        "client": p.client,
        "client_reference": p.client_reference,
        "general_description": p.general_description,
        "start_date": p.start_date,
        "end_date": p.end_date,
        "status": p.status,
        "location": p.location,
        **audit_dict(p),
        "closure_date": p.closure_date,
        "overall_result": p.overall_result,
        "lessons_learned": p.lessons_learned,
    }
    if my_role is not None:
        d["my_role"] = my_role
    return d


def _can_manage_project(user: models.User, project_id: int, db: Session) -> bool:
    """True if user is ADMIN or PROJECT_OWNER of this project."""
    if user.role == "ADMIN":
        return True
    up = db.query(models.UserProject).filter_by(user_id=user.id, project_id=project_id).first()
    return up and up.role == "PROJECT_OWNER"


# ─────────────────────────────────────────────────────────────────────────────
# Project CRUD
# ─────────────────────────────────────────────────────────────────────────────

@router.get("")
def list_projects(
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(_get_db),
):
    """List all projects the current user has access to (ADMIN sees all)."""
    if user.role == "ADMIN":
        projects = db.query(models.Project).order_by(models.Project.created_at.desc()).all()
        return [_fmt_project(p, my_role="ADMIN") for p in projects]

    up_rows = db.query(models.UserProject).filter_by(user_id=user.id).all()
    if not up_rows:
        return []
    role_map = {up.project_id: up.role for up in up_rows}
    project_ids = list(role_map.keys())
    projects = (
        db.query(models.Project)
        .filter(models.Project.id.in_(project_ids))
        .order_by(models.Project.created_at.desc())
        .all()
    )
    return [_fmt_project(p, my_role=role_map.get(p.id)) for p in projects]


@router.post("/seed-demo")
def seed_full_demo(
    user: models.User = Depends(auth.require_admin),
    db: Session = Depends(_get_db),
):
    """Run the full demo seed script (admin only). Creates a project named
    DEMO-FULL-2026 with thousands of records across every module. Idempotent:
    if a project with that number exists already, returns 409."""
    # Late-import the seed module from the _Supporting files folder. The
    # folder name has a space in it so we can't use a normal `import` —
    # load the file by path instead.
    import importlib.util
    seed_path = os.path.abspath(os.path.join(
        os.path.dirname(__file__), "..", "_Supporting files", "seed_full_demo.py"
    ))
    if not os.path.exists(seed_path):
        raise HTTPException(500, f"Demo seed script not found at {seed_path}")

    # Pre-check: refuse if the demo project already exists, so we don't
    # silently no-op (the script aborts cleanly but the API caller wants to know).
    existing = db.query(models.Project).filter_by(project_number="DEMO-FULL-2026").first()
    if existing:
        raise HTTPException(409, "Demo project DEMO-FULL-2026 already exists. Delete it first to re-seed.")

    spec = importlib.util.spec_from_file_location("seed_full_demo", seed_path)
    if spec is None or spec.loader is None:
        raise HTTPException(500, "Failed to load demo seed module")
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
        mod.main()
    except Exception as e:
        raise HTTPException(500, f"Demo seed failed: {e}")

    # Re-query to confirm and return summary
    proj = db.query(models.Project).filter_by(project_number="DEMO-FULL-2026").first()
    if not proj:
        raise HTTPException(500, "Demo seed completed but project not found")
    return {
        "ok": True,
        "project_id": proj.id,
        "project_number": proj.project_number,
        "message": f"Demo project {proj.project_number} created successfully.",
    }


@router.post("")
def create_project(
    data: ProjectCreate,
    user: models.User = Depends(auth.require_admin),
    db: Session = Depends(_get_db),
):
    """Create a new project (ADMIN only). Seeds default subservices, risk data, and settings."""
    p = models.Project(**data.model_dump())
    set_created(p, user.id)
    db.add(p)
    db.commit()
    db.refresh(p)

    # Seed default data for the new project
    seed_data.seed_subservices_for_project(p.id, db)
    seed_data.seed_risk_data_for_project(p.id, db)
    seed_data.seed_settings_for_project(p.id, db)
    seed_data.seed_procurement_for_project(p.id, db)
    seed_data.seed_qc_defaults_for_project(p.id, db)
    seed_data.seed_construction_defaults_for_project(p.id, db)
    seed_data.seed_safety_setup_defaults_for_project(p.id, db)
    seed_data.seed_startup_tasks_for_project(p.id, db)

    return _fmt_project(p, my_role="ADMIN")


@router.put("/{project_id}")
def update_project(
    project_id: int,
    data: ProjectUpdate,
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(_get_db),
):
    """Update project details (ADMIN or PROJECT_OWNER of this project)."""
    if not _can_manage_project(user, project_id, db):
        raise HTTPException(403, "Not authorized to edit this project")
    p = db.query(models.Project).filter_by(id=project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    check_lock(p.updated_at, data.updated_at, "project")
    for field, val in data.model_dump(exclude_unset=True, exclude={"updated_at"}).items():
        setattr(p, field, val)
    set_updated(p, user.id)
    db.commit()
    db.refresh(p)
    return _fmt_project(p)


def _purge_project_data(db: Session, project_id: int):
    """Delete every row tied to a project before deleting the project itself.
    SQLite's foreign keys aren't enforced by default and the model relationships
    don't all use cascade='all,delete-orphan', so we do this explicitly to
    avoid orphans (which manifested as 'duplicated' procurement steps and
    similar artefacts on re-seed)."""
    from sqlalchemy import text
    pid = project_id

    # Run as a single transaction; ordered so child rows are deleted first
    # ── Construction (workers, daily reports, work permits, LOTOs) ──────────
    db.execute(text("""
        DELETE FROM work_permit_reviews WHERE work_permit_id IN
            (SELECT id FROM work_permits WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM work_permit_area_approvals WHERE work_permit_id IN
            (SELECT id FROM work_permits WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM work_permit_areas WHERE work_permit_id IN
            (SELECT id FROM work_permits WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM work_permit_hazards WHERE work_permit_id IN
            (SELECT id FROM work_permits WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM work_permit_permit_types WHERE work_permit_id IN
            (SELECT id FROM work_permits WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM work_permit_ppes WHERE work_permit_id IN
            (SELECT id FROM work_permits WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM loto_reviews WHERE loto_id IN
            (SELECT id FROM lotos WHERE work_permit_id IN
                (SELECT id FROM work_permits WHERE project_id = :pid))
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM lotos WHERE work_permit_id IN
            (SELECT id FROM work_permits WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("DELETE FROM work_permits WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM work_permit_types WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("""
        DELETE FROM worker_certificates WHERE worker_id IN
            (SELECT id FROM workers WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM worker_reviews WHERE worker_id IN
            (SELECT id FROM workers WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM daily_report_workers WHERE daily_report_id IN
            (SELECT id FROM daily_reports WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM daily_report_areas WHERE daily_report_id IN
            (SELECT id FROM daily_reports WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("DELETE FROM work_logs WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM daily_reports WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM workers WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM subcontractors WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM worker_certificate_types WHERE project_id = :pid"), {"pid": pid})

    # ── Quality control ────────────────────────────────────────────────────
    db.execute(text("""
        DELETE FROM punch_notes WHERE punch_item_id IN
            (SELECT id FROM punch_items WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("DELETE FROM punch_items WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("""
        DELETE FROM itp_notes WHERE itp_record_id IN
            (SELECT id FROM itp_records WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM itp_review_history WHERE itp_id IN
            (SELECT id FROM itp_records WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM itp_reviews WHERE itp_id IN
            (SELECT id FROM itp_records WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("DELETE FROM itp_records WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM itp_test_types WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM itp_witness_levels WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM obligation_times WHERE project_id = :pid"), {"pid": pid})

    # ── Documents ───────────────────────────────────────────────────────────
    db.execute(text("""
        DELETE FROM document_versions WHERE document_id IN
            (SELECT id FROM documents WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM document_reviews WHERE document_id IN
            (SELECT id FROM documents WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM document_receipts WHERE document_id IN
            (SELECT id FROM documents WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM document_comments WHERE document_id IN
            (SELECT id FROM documents WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("DELETE FROM documents WHERE project_id = :pid"), {"pid": pid})

    # ── Budget (orders/invoices/baselines/transfers via packages) ──────────
    db.execute(text("""
        DELETE FROM invoices WHERE order_id IN
            (SELECT id FROM orders WHERE package_id IN
                (SELECT id FROM packages WHERE project_id = :pid))
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM orders WHERE package_id IN
            (SELECT id FROM packages WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM budget_baselines WHERE package_id IN
            (SELECT id FROM packages WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM budget_transfers
        WHERE from_package_id IN (SELECT id FROM packages WHERE project_id = :pid)
           OR   to_package_id IN (SELECT id FROM packages WHERE project_id = :pid)
    """), {"pid": pid})

    # ── Schedule ──────────────────────────────────────────────────────────
    db.execute(text("""
        DELETE FROM progress_report_entries WHERE progress_report_id IN
            (SELECT id FROM progress_reports WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM progress_report_reviews WHERE progress_report_id IN
            (SELECT id FROM progress_reports WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("DELETE FROM progress_reports WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM tasks WHERE project_id = :pid"), {"pid": pid})

    # ── Scope changes ─────────────────────────────────────────────────────
    db.execute(text("""
        DELETE FROM scope_change_reviews WHERE scope_change_id IN
            (SELECT id FROM scope_changes WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("DELETE FROM scope_changes WHERE project_id = :pid"), {"pid": pid})

    # ── Risks ─────────────────────────────────────────────────────────────
    db.execute(text("DELETE FROM risks WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM risk_categories WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM risk_phases WHERE project_id = :pid"), {"pid": pid})
    # risk_matrix_cells / risk_score_setups (soft-skipped if tables absent)
    for tbl in ("risk_matrix_cells", "risk_score_setups"):
        try:
            db.execute(text(f"DELETE FROM {tbl} WHERE project_id = :pid"), {"pid": pid})
        except Exception:
            pass

    # ── Safety ────────────────────────────────────────────────────────────
    db.execute(text("""
        DELETE FROM safety_observation_reviews WHERE observation_id IN
            (SELECT id FROM safety_observations WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM safety_incident_notes WHERE incident_id IN
            (SELECT id FROM safety_incidents WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM safety_incident_reviews WHERE incident_id IN
            (SELECT id FROM safety_incidents WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM safety_incident_workers WHERE incident_id IN
            (SELECT id FROM safety_incidents WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM safety_toolbox_reviews WHERE toolbox_id IN
            (SELECT id FROM safety_toolboxes WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM safety_toolbox_packages WHERE toolbox_id IN
            (SELECT id FROM safety_toolboxes WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM safety_toolbox_workers WHERE toolbox_id IN
            (SELECT id FROM safety_toolboxes WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM safety_toolbox_observations WHERE toolbox_id IN
            (SELECT id FROM safety_toolboxes WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM safety_toolbox_incidents WHERE toolbox_id IN
            (SELECT id FROM safety_toolboxes WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("DELETE FROM safety_observations WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM safety_incidents WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM safety_toolboxes WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM safety_observation_categories WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM safety_incident_causes WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM safety_severity_classes WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM safety_toolbox_categories WHERE project_id = :pid"), {"pid": pid})

    # ── Meetings ──────────────────────────────────────────────────────────
    db.execute(text("DELETE FROM meeting_point_links WHERE meeting_id IN (SELECT id FROM meetings WHERE project_id = :pid)"), {"pid": pid})
    db.execute(text("DELETE FROM meeting_point_notes WHERE meeting_point_id IN (SELECT id FROM meeting_points WHERE project_id = :pid)"), {"pid": pid})
    db.execute(text("DELETE FROM meeting_points WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM meeting_participants WHERE meeting_id IN (SELECT id FROM meetings WHERE project_id = :pid)"), {"pid": pid})
    db.execute(text("DELETE FROM meetings WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM meeting_type_participants WHERE meeting_type_id IN (SELECT id FROM meeting_types WHERE project_id = :pid)"), {"pid": pid})
    db.execute(text("DELETE FROM meeting_types WHERE project_id = :pid"), {"pid": pid})

    # ── Procurement ───────────────────────────────────────────────────────
    db.execute(text("""
        DELETE FROM procurement_events WHERE entry_id IN
            (SELECT id FROM procurement_entries WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM bidder_submittals WHERE entry_id IN
            (SELECT id FROM procurement_entries WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("DELETE FROM procurement_entries WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("""
        DELETE FROM package_plan_step_dates WHERE plan_id IN
            (SELECT id FROM package_plans WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM package_plan_bidders WHERE plan_id IN
            (SELECT id FROM package_plans WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("DELETE FROM package_plans WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("""
        DELETE FROM bidding_company_contacts WHERE company_id IN
            (SELECT id FROM bidding_companies WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("DELETE FROM bidding_companies WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM procurement_steps WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM contract_types WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM procurement_configs WHERE project_id = :pid"), {"pid": pid})

    # ── Files / customer feedback ────────────────────────────────────────
    db.execute(text("DELETE FROM file_attachments WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM reports WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM customer_feedbacks WHERE project_id = :pid"), {"pid": pid})

    # ── Closure scoring & start-up checklist ─────────────────────────────
    db.execute(text("DELETE FROM project_lesson_area_scores WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM project_startup_tasks WHERE project_id = :pid"), {"pid": pid})

    # ── Project organization ────────────────────────────────────────────
    db.execute(text("DELETE FROM project_module_leads WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM org_chart_links WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("""
        DELETE FROM area_site_supervisors WHERE area_id IN
            (SELECT id FROM areas WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("""
        DELETE FROM package_contacts WHERE package_id IN
            (SELECT id FROM packages WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("DELETE FROM packages WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM units WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM areas WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM floorplans WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM subservices WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM settings WHERE project_id = :pid"), {"pid": pid})
    db.execute(text("DELETE FROM user_projects WHERE project_id = :pid"), {"pid": pid})
    # Detach contacts (referenced by users.contact_id) before delete
    db.execute(text("""
        UPDATE users SET contact_id = NULL WHERE contact_id IN
            (SELECT id FROM contacts WHERE project_id = :pid)
    """), {"pid": pid})
    db.execute(text("DELETE FROM contacts WHERE project_id = :pid"), {"pid": pid})


@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    user: models.User = Depends(auth.require_admin),
    db: Session = Depends(_get_db),
):
    """Delete a project and ALL its data (ADMIN only). Performs an explicit
    cascade across every project-related table — SQLite does not enforce
    foreign keys by default, so we cannot rely on relational cascade alone."""
    p = db.query(models.Project).filter_by(id=project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    _purge_project_data(db, project_id)
    db.delete(p)
    db.commit()
    return {"ok": True}


def _derive_overall_result(area_scores: List[LessonAreaInput]) -> str:
    """Compute the project-level result from the 12-area Lessons Learned scores.
    NA scores are excluded from the count.
      - any BAD or majority < 50% GOOD+ACCEPTABLE → UNSUCCESSFUL
      - >=70% GOOD (of non-NA) → SUCCESS
      - else → PARTIAL_SUCCESS
    """
    counted = [s for s in area_scores if s.score in ("GOOD", "ACCEPTABLE", "BAD")]
    n = len(counted) or 1
    good = sum(1 for s in counted if s.score == "GOOD")
    bad = sum(1 for s in counted if s.score == "BAD")
    if bad >= 2 or (good + (n - good - bad)) < n / 2:
        # 2+ BAD or fewer than half non-bad
        return "UNSUCCESSFUL"
    if good / n >= 0.70 and bad == 0:
        return "SUCCESS"
    return "PARTIAL_SUCCESS"


@router.post("/{project_id}/close")
def close_project(
    project_id: int,
    data: ProjectClose,
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(_get_db),
):
    """Close a project with the structured Lessons Learned form (ADMIN or
    PROJECT_OWNER). Twelve canonical areas; each requires a score of
    GOOD / ACCEPTABLE / BAD / NA. A BAD score requires a comment.
    The overall result is derived from the scores (no separate picker)."""
    if not _can_manage_project(user, project_id, db):
        raise HTTPException(403, "Not authorized to close this project")
    p = db.query(models.Project).filter_by(id=project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    if not data.closure_date:
        raise HTTPException(400, "closure_date is required")
    if not data.area_scores:
        raise HTTPException(400, "area_scores is required (12 area entries)")

    # Validate the structured area scores
    seen = set()
    for entry in data.area_scores:
        if entry.area_key not in models.LESSON_AREA_LABELS:
            raise HTTPException(400, f"Unknown lesson area: {entry.area_key}")
        if entry.score not in models.LESSON_SCORES:
            raise HTTPException(400, f"Invalid score for {entry.area_key}: {entry.score}")
        if entry.score == "BAD" and not (entry.comment and entry.comment.strip()):
            raise HTTPException(400,
                f"A comment is required when {models.LESSON_AREA_LABELS[entry.area_key]} is scored BAD")
        seen.add(entry.area_key)
    missing = [k for k in models.LESSON_AREA_KEYS if k not in seen]
    if missing:
        labels = ", ".join(models.LESSON_AREA_LABELS[k] for k in missing)
        raise HTTPException(400, f"Missing area scores: {labels}")

    # Replace any previous scores for this project (idempotent close)
    db.query(models.ProjectLessonAreaScore).filter_by(project_id=project_id).delete()
    for entry in data.area_scores:
        db.add(models.ProjectLessonAreaScore(
            project_id=project_id,
            area_key=entry.area_key,
            score=entry.score,
            comment=(entry.comment or "").strip() or None,
        ))

    p.status = "CLOSED"
    p.closure_date = data.closure_date
    p.overall_result = data.overall_result or _derive_overall_result(data.area_scores)
    p.lessons_learned = (data.lessons_summary or "").strip() or None
    set_updated(p, user.id)
    db.commit()
    db.refresh(p)
    return _fmt_project(p)


@router.get("/{project_id}/post-close-removal-candidates")
def post_close_removal_candidates(
    project_id: int,
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(_get_db),
):
    """Returns users who are tied to this project AND not active anywhere
    else — candidates for clean-up after a project closes.

    "Active elsewhere" means the user has UserProject membership on at least
    one OTHER project, OR a Contact row in another project. ADMIN users are
    always excluded (their global role is project-independent)."""
    if not _can_manage_project(user, project_id, db):
        raise HTTPException(403, "Not authorized")

    # Step 1: find all users linked to this project (by UserProject OR Contact)
    linked_user_ids = set()
    for up in db.query(models.UserProject).filter_by(project_id=project_id).all():
        linked_user_ids.add(up.user_id)

    project_contacts = db.query(models.Contact).filter_by(project_id=project_id).all()
    contact_email_set = {(c.email or "").lower() for c in project_contacts if c.email}
    contact_id_set = {c.id for c in project_contacts}
    # Users linked via Contact.id == User.contact_id or by matching email
    for u in db.query(models.User).all():
        if u.contact_id and u.contact_id in contact_id_set:
            linked_user_ids.add(u.id)
        if u.email and u.email.lower() in contact_email_set:
            linked_user_ids.add(u.id)

    # Step 2: filter to users with NO other active linkage
    candidates = []
    for uid in linked_user_ids:
        u = db.query(models.User).filter_by(id=uid).first()
        if not u:
            continue
        if u.role == "ADMIN":
            continue  # never propose admin removal
        # Other UserProject memberships
        other_up = db.query(models.UserProject).filter(
            models.UserProject.user_id == uid,
            models.UserProject.project_id != project_id,
        ).first()
        if other_up:
            continue
        # Other Contact rows (different project)
        other_contact_q = db.query(models.Contact).filter(
            models.Contact.project_id != project_id,
            models.Contact.project_id.isnot(None),
        )
        # Match by id or by email
        match = False
        if u.contact_id:
            match = match or other_contact_q.filter(models.Contact.id == u.contact_id).first() is not None
        if u.email:
            match = match or other_contact_q.filter(models.Contact.email.ilike(u.email)).first() is not None
        if match:
            continue
        candidates.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "last_login_at": u.last_login_at.isoformat() + "Z" if u.last_login_at else None,
        })
    candidates.sort(key=lambda c: (c.get("name") or "").lower())
    return {"candidates": candidates}


@router.get("/{project_id}/lessons-learned")
def get_project_lessons_learned(
    project_id: int,
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(_get_db),
):
    """Structured area scores for a single project."""
    if not _can_manage_project(user, project_id, db):
        # Anyone with project access can read the lessons learned for that project
        up = db.query(models.UserProject).filter_by(user_id=user.id, project_id=project_id).first()
        if user.role != "ADMIN" and not up:
            raise HTTPException(403, "Not authorized")
    p = db.query(models.Project).filter_by(id=project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    rows = db.query(models.ProjectLessonAreaScore).filter_by(project_id=project_id).all()
    by_key = {r.area_key: r for r in rows}
    return {
        "project_id": p.id,
        "project_number": p.project_number,
        "client": p.client,
        "closure_date": p.closure_date,
        "overall_result": p.overall_result,
        "lessons_summary": p.lessons_learned,
        "areas": [
            {
                "area_key": k,
                "area_label": models.LESSON_AREA_LABELS[k],
                "score": by_key[k].score if k in by_key else None,
                "comment": by_key[k].comment if k in by_key else None,
            }
            for k in models.LESSON_AREA_KEYS
        ],
    }


@router.get("/lessons-learned/portal")
def lessons_learned_portal(
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(_get_db),
):
    """Cross-project Lessons Learned dashboard. Returns one row per closed
    project + per-area score distribution + the user's accessible scope."""
    # Determine which projects the user can see
    if user.role == "ADMIN":
        projects = db.query(models.Project).filter_by(status="CLOSED").all()
    else:
        ups = db.query(models.UserProject).filter_by(user_id=user.id).all()
        if not ups:
            return {"projects": [], "area_distribution": {}}
        ids = [up.project_id for up in ups]
        projects = (db.query(models.Project)
                    .filter(models.Project.id.in_(ids), models.Project.status == "CLOSED")
                    .all())
    if not projects:
        return {"projects": [], "area_distribution": {k: {"GOOD":0,"ACCEPTABLE":0,"BAD":0,"NA":0} for k in models.LESSON_AREA_KEYS}}

    proj_ids = [p.id for p in projects]
    all_scores = (db.query(models.ProjectLessonAreaScore)
                  .filter(models.ProjectLessonAreaScore.project_id.in_(proj_ids))
                  .all())
    scores_by_proj: dict = {}
    for s in all_scores:
        scores_by_proj.setdefault(s.project_id, {})[s.area_key] = {"score": s.score, "comment": s.comment}

    # Customer feedback counts per project
    fb_counts: dict = {}
    fb_rows = (db.query(models.CustomerFeedback)
               .filter(models.CustomerFeedback.project_id.in_(proj_ids))
               .all())
    for fb in fb_rows:
        fb_counts.setdefault(fb.project_id, {"POSITIVE": 0, "NEGATIVE": 0})[fb.polarity] = \
            fb_counts.get(fb.project_id, {}).get(fb.polarity, 0) + 1

    # Aggregate distribution per area
    area_distribution = {k: {"GOOD":0, "ACCEPTABLE":0, "BAD":0, "NA":0} for k in models.LESSON_AREA_KEYS}
    for s in all_scores:
        if s.area_key in area_distribution and s.score in area_distribution[s.area_key]:
            area_distribution[s.area_key][s.score] += 1

    out_projects = []
    for p in projects:
        out_projects.append({
            "id": p.id,
            "project_number": p.project_number,
            "description": p.description,
            "client": p.client,
            "closure_date": p.closure_date,
            "overall_result": p.overall_result,
            "lessons_summary": p.lessons_learned,
            "scores": scores_by_proj.get(p.id, {}),
            "feedback_counts": fb_counts.get(p.id, {"POSITIVE": 0, "NEGATIVE": 0}),
        })
    out_projects.sort(key=lambda x: (x.get("closure_date") or ""), reverse=True)
    return {
        "areas": [{"key": k, "label": v} for k, v in models.LESSON_AREAS],
        "projects": out_projects,
        "area_distribution": area_distribution,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Customer Feedback letters (stored OUTSIDE the project upload tree)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/{project_id}/customer-feedback")
def upload_customer_feedback(
    project_id: int,
    polarity: str = Form(...),
    received_date: str = Form(""),
    notes: str = Form(""),
    file: UploadFile = File(...),
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(_get_db),
):
    if not _can_manage_project(user, project_id, db):
        raise HTTPException(403, "Not authorized")
    polarity_up = (polarity or "").upper()
    if polarity_up not in ("POSITIVE", "NEGATIVE"):
        raise HTTPException(400, "polarity must be POSITIVE or NEGATIVE")
    p = db.query(models.Project).filter_by(id=project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")

    date_part = received_date or datetime.utcnow().strftime("%Y-%m-%d")
    pno = _sanitize_filename_part(p.project_number) or f"P{project_id}"
    cli = _sanitize_filename_part(p.client or "")
    pol = polarity_up
    ts = datetime.utcnow().strftime("%H%M%S")
    ext = os.path.splitext(file.filename or "")[1].lower() or ""
    base = "_".join(part for part in (pno, cli, date_part, pol, ts) if part)
    saved_name = f"{base}{ext}"
    saved_path = os.path.join(CUSTOMER_FEEDBACK_DIR, saved_name)

    # Avoid collisions
    counter = 2
    while os.path.exists(saved_path):
        saved_name = f"{base}_{counter}{ext}"
        saved_path = os.path.join(CUSTOMER_FEEDBACK_DIR, saved_name)
        counter += 1

    with open(saved_path, "wb") as out:
        out.write(file.file.read())

    fb = models.CustomerFeedback(
        project_id=project_id,
        polarity=polarity_up,
        file_name=saved_name,
        file_path=saved_path,
        received_date=date_part,
        notes=(notes or "").strip() or None,
        uploaded_by_id=user.id,
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return {
        "id": fb.id,
        "polarity": fb.polarity,
        "file_name": fb.file_name,
        "received_date": fb.received_date,
        "notes": fb.notes,
        "uploaded_at": fb.uploaded_at.isoformat() + "Z" if fb.uploaded_at else None,
    }


@router.get("/{project_id}/customer-feedbacks")
def list_customer_feedbacks(
    project_id: int,
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(_get_db),
):
    if not _can_manage_project(user, project_id, db):
        up = db.query(models.UserProject).filter_by(user_id=user.id, project_id=project_id).first()
        if user.role != "ADMIN" and not up:
            raise HTTPException(403, "Not authorized")
    rows = (db.query(models.CustomerFeedback)
            .filter_by(project_id=project_id)
            .order_by(models.CustomerFeedback.uploaded_at.desc()).all())
    return [{
        "id": r.id,
        "polarity": r.polarity,
        "file_name": r.file_name,
        "received_date": r.received_date,
        "notes": r.notes,
        "uploaded_at": r.uploaded_at.isoformat() + "Z" if r.uploaded_at else None,
        "uploaded_by_name": r.uploaded_by.name if r.uploaded_by else None,
    } for r in rows]


@router.get("/customer-feedbacks/{feedback_id}/download")
def download_customer_feedback(
    feedback_id: int,
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(_get_db),
):
    fb = db.query(models.CustomerFeedback).filter_by(id=feedback_id).first()
    if not fb:
        raise HTTPException(404, "Feedback not found")
    if user.role != "ADMIN":
        up = db.query(models.UserProject).filter_by(user_id=user.id, project_id=fb.project_id).first()
        if not up:
            raise HTTPException(403, "Not authorized")
    if not os.path.exists(fb.file_path):
        raise HTTPException(404, "File missing on disk")
    return FileResponse(fb.file_path, filename=fb.file_name)


@router.delete("/customer-feedbacks/{feedback_id}")
def delete_customer_feedback(
    feedback_id: int,
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(_get_db),
):
    fb = db.query(models.CustomerFeedback).filter_by(id=feedback_id).first()
    if not fb:
        raise HTTPException(404, "Feedback not found")
    if not _can_manage_project(user, fb.project_id, db):
        raise HTTPException(403, "Not authorized")
    try:
        if os.path.exists(fb.file_path):
            os.remove(fb.file_path)
    except OSError:
        pass
    db.delete(fb)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# User-Project Assignment
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{project_id}/users")
def list_project_users(
    project_id: int,
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(_get_db),
):
    """List users assigned to a project."""
    if not _can_manage_project(user, project_id, db):
        # Non-managers can still see their own project members
        up = db.query(models.UserProject).filter_by(user_id=user.id, project_id=project_id).first()
        if not up:
            raise HTTPException(403, "Not authorized")

    rows = db.query(models.UserProject).filter_by(project_id=project_id).all()
    result = []
    for row in rows:
        u = db.query(models.User).filter_by(id=row.user_id).first()
        if u:
            result.append({
                "user_id": u.id,
                "name": u.name,
                "email": u.email,
                "role": row.role,
                "contact_id": u.contact_id,
            })
    return result


def _ensure_contact_for_user(target_user: models.User, project_id: int, db: Session):
    """Ensure the user has a Contact entry in the project. Creates one if missing."""
    # If user already has a contact_id, check if it belongs to this project
    if target_user.contact_id:
        contact = db.query(models.Contact).filter_by(
            id=target_user.contact_id, project_id=project_id
        ).first()
        if contact:
            return  # Already linked to a contact in this project

    # Check if a contact with this email already exists in the project
    if target_user.email:
        existing = db.query(models.Contact).filter_by(
            email=target_user.email, project_id=project_id
        ).first()
        if existing:
            target_user.contact_id = existing.id  # Always link to this project's contact
            return

    # Create a new contact for this user in the project
    new_contact = models.Contact(
        project_id=project_id,
        name=target_user.name,
        email=target_user.email,
    )
    db.add(new_contact)
    db.flush()
    target_user.contact_id = new_contact.id  # Always link to the newly created contact


@router.post("/{project_id}/users")
def add_project_user(
    project_id: int,
    data: UserProjectAssign,
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(_get_db),
):
    """Add or update a user's role in a project."""
    if not _can_manage_project(user, project_id, db):
        raise HTTPException(403, "Not authorized")

    if data.role not in VALID_PROJECT_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(VALID_PROJECT_ROLES)}")

    p = db.query(models.Project).filter_by(id=project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    target_user = db.query(models.User).filter_by(id=data.user_id).first()
    if not target_user:
        raise HTTPException(404, "User not found")

    existing = db.query(models.UserProject).filter_by(
        user_id=data.user_id, project_id=project_id
    ).first()
    if existing:
        existing.role = data.role
    else:
        db.add(models.UserProject(
            user_id=data.user_id, project_id=project_id, role=data.role
        ))

    # Auto-create/link a Contact entry for this user in the project
    _ensure_contact_for_user(target_user, project_id, db)

    db.commit()
    return {"ok": True}


@router.put("/{project_id}/users/{target_user_id}")
def update_project_user_role(
    project_id: int,
    target_user_id: int,
    data: UserProjectAssign,
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(_get_db),
):
    """Update a user's role in a project."""
    if not _can_manage_project(user, project_id, db):
        raise HTTPException(403, "Not authorized")
    if data.role not in VALID_PROJECT_ROLES:
        raise HTTPException(400, f"Role must be one of: {', '.join(VALID_PROJECT_ROLES)}")
    row = db.query(models.UserProject).filter_by(
        user_id=target_user_id, project_id=project_id
    ).first()
    if not row:
        raise HTTPException(404, "User not assigned to this project")
    row.role = data.role
    db.commit()
    return {"ok": True}


@router.delete("/{project_id}/users/{target_user_id}")
def remove_project_user(
    project_id: int,
    target_user_id: int,
    user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(_get_db),
):
    """Remove a user from a project."""
    if not _can_manage_project(user, project_id, db):
        raise HTTPException(403, "Not authorized")
    row = db.query(models.UserProject).filter_by(
        user_id=target_user_id, project_id=project_id
    ).first()
    if not row:
        raise HTTPException(404, "User not assigned to this project")
    db.delete(row)
    db.commit()
    return {"ok": True}
