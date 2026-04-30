"""
Quality Control module — Inspection and Test Plan (ITP).
"""
from datetime import datetime, date, timedelta
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

import auth
import models
from database import get_db
from routers.audit import audit_dict, check_lock, set_created, set_updated

router = APIRouter(prefix="/api/qc", tags=["quality_control"])


# ─────────────────────────────────────────────────────────────────────────────
# Access helpers
# ─────────────────────────────────────────────────────────────────────────────

def _deny_bidder(user: auth.ProjectContext):
    if user.role == "BIDDER":
        raise HTTPException(403, "Access denied")


def _can_manage(user: auth.ProjectContext, package: models.Package, db: Session) -> bool:
    """ADMIN, PROJECT_OWNER, or the package owner can fully manage ITP records."""
    if auth.has_owner_or_lead_access(user, "Quality Control", db):
        return True
    if user.contact_id and package.package_owner_id == user.contact_id:
        return True
    return False


def _can_create_or_edit_itp(user: auth.ProjectContext, package: models.Package, db: Session) -> bool:
    """ITP record authoring — extends _can_manage to include vendors that are
    linked to the package via PackageContact, so they can file their own ITPs."""
    if _can_manage(user, package, db):
        return True
    return _is_vendor_on_package(user, package.id, db)


def _log_itp_review(db: Session, r: models.ITPRecord, event: str, user, approved=None, comment=None):
    db.add(models.ITPReviewHistory(
        itp_id=r.id,
        event=event,
        approved=approved,
        comment=comment,
        actor_id=user.id if user else None,
    ))


def _is_vendor_on_package(user: auth.ProjectContext, package_id: int, db: Session) -> bool:
    if user.role != "VENDOR":
        return False
    if not user.contact_id:
        return False
    return bool(
        db.query(models.PackageContact)
        .filter_by(package_id=package_id, contact_id=user.contact_id)
        .first()
    )


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────

class NoteBody(BaseModel):
    content: str


class TestTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: int = 0


class TestTypeUpdate(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: int = 0
    updated_at: Optional[str] = None


class WitnessLevelCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    sort_order: int = 0


class WitnessLevelUpdate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    sort_order: int = 0
    updated_at: Optional[str] = None


class ITPCreate(BaseModel):
    package_id: int
    test_type_id: int
    test: str
    details: Optional[str] = None
    witness_level_id: int
    area_id: Optional[int] = None
    unit_id: Optional[int] = None
    acceptance_criteria: Optional[str] = None
    planned_date: Optional[str] = None


class ITPUpdate(BaseModel):
    package_id: int
    test_type_id: int
    test: str
    details: Optional[str] = None
    witness_level_id: int
    area_id: Optional[int] = None
    unit_id: Optional[int] = None
    acceptance_criteria: Optional[str] = None
    planned_date: Optional[str] = None
    updated_at: Optional[str] = None


class ITPOverrideReview(BaseModel):
    review_id: int
    status: str   # APPROVED | REJECTED
    comment: Optional[str] = None


class ITPExecuteBody(BaseModel):
    status: str  # PASSED | FAILED
    result: str
    executed_date: Optional[str] = None
    updated_at: Optional[str] = None


class ITPReviewBody(BaseModel):
    status: str  # APPROVED | REJECTED
    comment: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Formatters
# ─────────────────────────────────────────────────────────────────────────────

def _fmt_test_type(tt: models.ITPTestType) -> dict:
    return {
        "id": tt.id,
        "name": tt.name,
        "description": tt.description,
        "sort_order": tt.sort_order,
        **audit_dict(tt),
    }


def _fmt_witness_level(wl: models.ITPWitnessLevel) -> dict:
    return {
        "id": wl.id,
        "code": wl.code,
        "name": wl.name,
        "description": wl.description,
        "sort_order": wl.sort_order,
        **audit_dict(wl),
    }


def _fmt_itp(r: models.ITPRecord) -> dict:
    # Flat per-reviewer state — read directly from the record columns.
    # Reviewer contact id and name come from the package at request time
    # (dynamic lookup), matching ScopeChange / Invoice / ProgressReport.
    pkg = r.package
    # Count of non-closed punch items linked to this ITP record — surfaced
    # in the register so reviewers see open findings at a glance.
    open_punches_count = 0
    try:
        from sqlalchemy.orm import object_session
        sess = object_session(r)
        if sess is not None:
            open_punches_count = sess.query(models.PunchItem).filter(
                models.PunchItem.itp_record_id == r.id,
                models.PunchItem.status.notin_(["CLOSED", "DRAFT"]),
            ).count()
    except Exception:
        open_punches_count = 0
    pmc_name = pkg.pmc_technical_reviewer.name if pkg and pkg.pmc_technical_reviewer else None
    cli_name = pkg.client_technical_reviewer.name if pkg and pkg.client_technical_reviewer else None
    # Synthesise the legacy `reviews` list from the flat columns so any
    # consumer still reading the array keeps working. Rows only appear when
    # a reviewer is assigned on the package (or the record's flag is set).
    synth_reviews = []
    if (pkg and pkg.pmc_technical_reviewer_id) or r.pmc_reviewed:
        synth_reviews.append({
            "id": None,
            "reviewer_contact_id": pkg.pmc_technical_reviewer_id if pkg else None,
            "reviewer_contact_name": pmc_name,
            "reviewer_role": "PMC_TECHNICAL",
            "status": ("APPROVED" if r.pmc_approved else "REJECTED") if r.pmc_reviewed else "PENDING",
            "comment": r.pmc_comment,
            "reviewed_at": r.pmc_reviewed_at.isoformat() + 'Z' if r.pmc_reviewed_at else None,
        })
    if (pkg and pkg.client_technical_reviewer_id) or r.client_reviewed:
        synth_reviews.append({
            "id": None,
            "reviewer_contact_id": pkg.client_technical_reviewer_id if pkg else None,
            "reviewer_contact_name": cli_name,
            "reviewer_role": "CLIENT_TECHNICAL",
            "status": ("APPROVED" if r.client_approved else "REJECTED") if r.client_reviewed else "PENDING",
            "comment": r.client_comment,
            "reviewed_at": r.client_reviewed_at.isoformat() + 'Z' if r.client_reviewed_at else None,
        })
    return {
        "id": r.id,
        "seq_id": r.project_seq_id,
        "package_id": r.package_id,
        "package_tag": r.package.tag_number if r.package else None,
        "package_name": r.package.name if r.package else None,
        "test_type_id": r.test_type_id,
        "test_type_name": r.test_type.name if r.test_type else None,
        "test": r.test,
        "details": r.details,
        "witness_level_id": r.witness_level_id,
        "witness_level_code": r.witness_level.code if r.witness_level else None,
        "witness_level_name": r.witness_level.name if r.witness_level else None,
        "status": r.status,
        "approval_status": r.approval_status,
        "area_id": r.area_id,
        "area_tag": r.area.tag if r.area else None,
        "unit_id": r.unit_id,
        "unit_tag": r.unit.tag if r.unit else None,
        "acceptance_criteria": r.acceptance_criteria,
        "result": r.result,
        "planned_date": r.planned_date,
        "executed_date": r.executed_date,
        "reviews": synth_reviews,
        "pmc_reviewer_contact_id": pkg.pmc_technical_reviewer_id if pkg else None,
        "pmc_reviewer_name": pmc_name,
        "pmc_reviewed": bool(r.pmc_reviewed),
        "pmc_approved": r.pmc_approved,
        "pmc_comment": r.pmc_comment,
        "pmc_reviewed_at": r.pmc_reviewed_at.isoformat() + 'Z' if r.pmc_reviewed_at else None,
        "client_reviewer_contact_id": pkg.client_technical_reviewer_id if pkg else None,
        "client_reviewer_name": cli_name,
        "client_reviewed": bool(r.client_reviewed),
        "client_approved": r.client_approved,
        "client_comment": r.client_comment,
        "client_reviewed_at": r.client_reviewed_at.isoformat() + 'Z' if r.client_reviewed_at else None,
        "open_punches_count": open_punches_count,
        **audit_dict(r),
    }


def _unique_dicts(items: list, key: str) -> list:
    seen = set()
    result = []
    for item in items:
        k = item[key]
        if k not in seen:
            seen.add(k)
            result.append(item)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Test Types
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/test-types")
def list_test_types(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    _deny_bidder(user)
    items = (
        db.query(models.ITPTestType)
        .filter_by(project_id=user.project_id)
        .order_by(models.ITPTestType.sort_order, models.ITPTestType.name)
        .all()
    )
    return [_fmt_test_type(t) for t in items]


@router.post("/test-types")
def create_test_type(
    body: TestTypeCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not auth.has_owner_or_lead_access(user, "Quality Control", db):
        raise HTTPException(403, "Only ADMIN or PROJECT_OWNER can manage test types")
    tt = models.ITPTestType(
        project_id=user.project_id,
        name=body.name,
        description=body.description,
        sort_order=body.sort_order,
    )
    set_created(tt, user.id)
    db.add(tt)
    db.commit()
    db.refresh(tt)
    return _fmt_test_type(tt)


@router.put("/test-types/{tt_id}")
def update_test_type(
    tt_id: int,
    body: TestTypeUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not auth.has_owner_or_lead_access(user, "Quality Control", db):
        raise HTTPException(403, "Only ADMIN or PROJECT_OWNER can manage test types")
    tt = db.query(models.ITPTestType).filter_by(id=tt_id, project_id=user.project_id).first()
    if not tt:
        raise HTTPException(404, "Test type not found")
    check_lock(tt.updated_at, body.updated_at, "test type")
    tt.name = body.name
    tt.description = body.description
    tt.sort_order = body.sort_order
    set_updated(tt, user.id)
    db.commit()
    db.refresh(tt)
    return _fmt_test_type(tt)


@router.delete("/test-types/{tt_id}")
def delete_test_type(
    tt_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not auth.has_owner_or_lead_access(user, "Quality Control", db):
        raise HTTPException(403, "Only ADMIN or PROJECT_OWNER can manage test types")
    tt = db.query(models.ITPTestType).filter_by(id=tt_id, project_id=user.project_id).first()
    if not tt:
        raise HTTPException(404, "Test type not found")
    if db.query(models.ITPRecord).filter_by(test_type_id=tt_id).first():
        raise HTTPException(400, "Test type is in use and cannot be deleted")
    db.delete(tt)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Witness Levels
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/witness-levels")
def list_witness_levels(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    _deny_bidder(user)
    items = (
        db.query(models.ITPWitnessLevel)
        .filter_by(project_id=user.project_id)
        .order_by(models.ITPWitnessLevel.sort_order, models.ITPWitnessLevel.code)
        .all()
    )
    return [_fmt_witness_level(w) for w in items]


@router.post("/witness-levels")
def create_witness_level(
    body: WitnessLevelCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not auth.has_owner_or_lead_access(user, "Quality Control", db):
        raise HTTPException(403, "Only ADMIN or PROJECT_OWNER can manage witness levels")
    wl = models.ITPWitnessLevel(
        project_id=user.project_id,
        code=body.code,
        name=body.name,
        description=body.description,
        sort_order=body.sort_order,
    )
    set_created(wl, user.id)
    db.add(wl)
    db.commit()
    db.refresh(wl)
    return _fmt_witness_level(wl)


@router.put("/witness-levels/{wl_id}")
def update_witness_level(
    wl_id: int,
    body: WitnessLevelUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not auth.has_owner_or_lead_access(user, "Quality Control", db):
        raise HTTPException(403, "Only ADMIN or PROJECT_OWNER can manage witness levels")
    wl = db.query(models.ITPWitnessLevel).filter_by(id=wl_id, project_id=user.project_id).first()
    if not wl:
        raise HTTPException(404, "Witness level not found")
    check_lock(wl.updated_at, body.updated_at, "witness level")
    wl.code = body.code
    wl.name = body.name
    wl.description = body.description
    wl.sort_order = body.sort_order
    set_updated(wl, user.id)
    db.commit()
    db.refresh(wl)
    return _fmt_witness_level(wl)


@router.delete("/witness-levels/{wl_id}")
def delete_witness_level(
    wl_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not auth.has_owner_or_lead_access(user, "Quality Control", db):
        raise HTTPException(403, "Only ADMIN or PROJECT_OWNER can manage witness levels")
    wl = db.query(models.ITPWitnessLevel).filter_by(id=wl_id, project_id=user.project_id).first()
    if not wl:
        raise HTTPException(404, "Witness level not found")
    if db.query(models.ITPRecord).filter_by(witness_level_id=wl_id).first():
        raise HTTPException(400, "Witness level is in use and cannot be deleted")
    db.delete(wl)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# ITP Records
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/itp")
def list_itp(
    package_id: Optional[int] = None,
    test_type_id: Optional[int] = None,
    witness_level_id: Optional[int] = None,
    area_id: Optional[int] = None,
    unit_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    _deny_bidder(user)
    q = db.query(models.ITPRecord).filter_by(project_id=user.project_id)

    if user.role == "VENDOR":
        if not user.contact_id:
            return []
        pkg_ids = [
            pc.package_id for pc in
            db.query(models.PackageContact).filter_by(contact_id=user.contact_id).all()
        ]
        q = q.filter(models.ITPRecord.package_id.in_(pkg_ids))

    if package_id:
        q = q.filter(models.ITPRecord.package_id == package_id)
    if test_type_id:
        q = q.filter(models.ITPRecord.test_type_id == test_type_id)
    if witness_level_id:
        q = q.filter(models.ITPRecord.witness_level_id == witness_level_id)
    if area_id:
        q = q.filter(models.ITPRecord.area_id == area_id)
    if unit_id:
        q = q.filter(models.ITPRecord.unit_id == unit_id)
    if status:
        q = q.filter(models.ITPRecord.status == status)

    return [_fmt_itp(r) for r in q.order_by(models.ITPRecord.id.desc()).all()]


@router.post("/itp")
def create_itp(
    body: ITPCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    _deny_bidder(user)
    package = db.query(models.Package).filter_by(id=body.package_id, project_id=user.project_id).first()
    if not package:
        raise HTTPException(404, "Package not found")
    if not _can_create_or_edit_itp(user, package, db):
        raise HTTPException(403, "Insufficient permissions to create ITP for this package")
    r = models.ITPRecord(
        project_id=user.project_id,
        project_seq_id=models.next_project_seq(db, models.ITPRecord, user.project_id),
        package_id=body.package_id,
        test_type_id=body.test_type_id,
        test=body.test,
        details=body.details,
        witness_level_id=body.witness_level_id,
        area_id=body.area_id,
        unit_id=body.unit_id,
        acceptance_criteria=body.acceptance_criteria,
        planned_date=body.planned_date,
    )
    set_created(r, user.id)
    db.add(r)
    db.commit()
    db.refresh(r)
    return _fmt_itp(r)


@router.get("/itp/{itp_id}")
def get_itp(
    itp_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    _deny_bidder(user)
    r = db.query(models.ITPRecord).filter_by(id=itp_id, project_id=user.project_id).first()
    if not r:
        raise HTTPException(404, "ITP record not found")
    if user.role == "VENDOR" and not _is_vendor_on_package(user, r.package_id, db):
        raise HTTPException(403, "Access denied")
    return _fmt_itp(r)


@router.put("/itp/{itp_id}")
def update_itp(
    itp_id: int,
    body: ITPUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    _deny_bidder(user)
    r = db.query(models.ITPRecord).filter_by(id=itp_id, project_id=user.project_id).first()
    if not r:
        raise HTTPException(404, "ITP record not found")
    package = db.query(models.Package).filter_by(id=r.package_id).first()
    if not _can_create_or_edit_itp(user, package, db):
        raise HTTPException(403, "Insufficient permissions")
    if r.status in ("PASSED", "FAILED"):
        # Completed ITPs are normally frozen — but if the approval flow has at
        # least one rejection, the author/vendor can still fix the record and
        # resubmit, so we allow edits in that partial-rejection case too.
        allow_partial = (
            r.approval_status == "REJECTED"
            or (r.approval_status == "PENDING" and _itp_has_rejection(r.id, db))
        )
        if not allow_partial:
            raise HTTPException(400, "Cannot edit a completed ITP record")
    check_lock(r.updated_at, body.updated_at, "ITP record")
    r.package_id = body.package_id
    r.test_type_id = body.test_type_id
    r.test = body.test
    r.details = body.details
    r.witness_level_id = body.witness_level_id
    r.area_id = body.area_id
    r.unit_id = body.unit_id
    r.acceptance_criteria = body.acceptance_criteria
    r.planned_date = body.planned_date
    set_updated(r, user.id)
    db.commit()
    db.refresh(r)
    return _fmt_itp(r)


@router.delete("/itp/{itp_id}")
def delete_itp(
    itp_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    _deny_bidder(user)
    r = db.query(models.ITPRecord).filter_by(id=itp_id, project_id=user.project_id).first()
    if not r:
        raise HTTPException(404, "ITP record not found")
    package = db.query(models.Package).filter_by(id=r.package_id).first()
    if not _can_manage(user, package, db):
        raise HTTPException(403, "Insufficient permissions")
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.post("/itp/{itp_id}/plan")
def plan_itp(
    itp_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Transition ITP from DRAFT to PLANNED and create review slots for package reviewers."""
    _deny_bidder(user)
    r = db.query(models.ITPRecord).filter_by(id=itp_id, project_id=user.project_id).first()
    if not r:
        raise HTTPException(404, "ITP record not found")
    package = db.query(models.Package).filter_by(id=r.package_id).first()
    if not _can_create_or_edit_itp(user, package, db):
        raise HTTPException(403, "Insufficient permissions")
    if r.status != "DRAFT":
        raise HTTPException(400, f"Cannot plan an ITP that is already in status {r.status}")
    if not r.planned_date:
        raise HTTPException(400, "A planned date is required before moving to PLANNED status")

    r.status = "PLANNED"
    _reset_itp_reviews(r, package)
    set_updated(r, user.id)
    _log_itp_review(db, r, "SUBMIT", user)
    _update_itp_approval_status(r)
    db.commit()
    db.refresh(r)
    return _fmt_itp(r)


@router.post("/itp/{itp_id}/execute")
def execute_itp(
    itp_id: int,
    body: ITPExecuteBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Record test execution result — PASSED or FAILED."""
    _deny_bidder(user)
    r = db.query(models.ITPRecord).filter_by(id=itp_id, project_id=user.project_id).first()
    if not r:
        raise HTTPException(404, "ITP record not found")
    package = db.query(models.Package).filter_by(id=r.package_id).first()
    can_exec = _can_manage(user, package, db) or _is_vendor_on_package(user, r.package_id, db)
    if not can_exec:
        raise HTTPException(403, "Insufficient permissions to execute this ITP")
    # Allow execution from DRAFT / PLANNED; also allow re-execution when the
    # record has a rejection on the approval flow (so the vendor can rerun
    # the test and update the result without waiting for the other reviewer).
    allow_re_exec = r.status in ("PASSED", "FAILED") and (
        r.approval_status == "REJECTED"
        or (r.approval_status == "PENDING" and _itp_has_rejection(r.id, db))
    )
    if r.status not in ("DRAFT", "PLANNED") and not allow_re_exec:
        raise HTTPException(400, f"Cannot execute an ITP in status {r.status}")
    if body.status not in ("PASSED", "FAILED"):
        raise HTTPException(400, "status must be PASSED or FAILED")
    check_lock(r.updated_at, body.updated_at, "ITP record")
    r.status = body.status
    r.result = body.result
    r.executed_date = body.executed_date
    _reset_itp_reviews(r, package)
    _log_itp_review(db, r, "SUBMIT", user, comment=body.result)
    _update_itp_approval_status(r)
    set_updated(r, user.id)
    db.commit()
    db.refresh(r)
    return _fmt_itp(r)


def _is_pmc_reviewer_itp(r: models.ITPRecord, user) -> bool:
    if not user.contact_id or not r.package:
        return False
    return r.package.pmc_technical_reviewer_id == user.contact_id


def _is_client_reviewer_itp(r: models.ITPRecord, user) -> bool:
    if not user.contact_id or not r.package:
        return False
    return r.package.client_technical_reviewer_id == user.contact_id


def _update_itp_approval_status(r: models.ITPRecord):
    """Only finalise APPROVED/REJECTED once BOTH reviewer slots have acted.
    Mirrors the scope-change / progress-report pattern."""
    if not (r.pmc_reviewed and r.client_reviewed):
        r.approval_status = "PENDING"
        return
    if r.pmc_approved is False or r.client_approved is False:
        r.approval_status = "REJECTED"
    else:
        r.approval_status = "APPROVED"


def _reset_itp_reviews(r: models.ITPRecord, package: models.Package):
    """Reset the 8 per-reviewer columns at submit / resubmit time, and
    auto-approve any side whose package reviewer is not assigned so the
    workflow isn't blocked waiting on a non-existent reviewer."""
    now = datetime.utcnow()
    r.pmc_reviewed = False
    r.pmc_approved = None
    r.pmc_comment = None
    r.pmc_reviewed_at = None
    r.pmc_reviewed_by_id = None
    r.client_reviewed = False
    r.client_approved = None
    r.client_comment = None
    r.client_reviewed_at = None
    r.client_reviewed_by_id = None
    r.approval_status = "PENDING"
    if package and not package.pmc_technical_reviewer_id:
        r.pmc_reviewed = True
        r.pmc_approved = True
        r.pmc_comment = "No reviewer assigned"
        r.pmc_reviewed_at = now
    if package and not package.client_technical_reviewer_id:
        r.client_reviewed = True
        r.client_approved = True
        r.client_comment = "No reviewer assigned"
        r.client_reviewed_at = now


@router.post("/itp/{itp_id}/review")
def review_itp(
    itp_id: int,
    body: ITPReviewBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Submit a PMC or Client Technical review."""
    if not user.contact_id:
        raise HTTPException(403, "Your user account is not linked to a contact")
    r = db.query(models.ITPRecord).filter_by(id=itp_id, project_id=user.project_id).first()
    if not r:
        raise HTTPException(404, "ITP record not found")
    if r.approval_status != "PENDING":
        raise HTTPException(400, "ITP is not under review")
    if body.status not in ("APPROVED", "REJECTED"):
        raise HTTPException(400, "status must be APPROVED or REJECTED")
    # Route the review to the right column based on which reviewer the
    # user is on the package. A user who is neither side can't review.
    approved = (body.status == "APPROVED")
    now = datetime.utcnow()
    if _is_pmc_reviewer_itp(r, user) and not r.pmc_reviewed:
        r.pmc_reviewed = True
        r.pmc_approved = approved
        r.pmc_comment = body.comment
        r.pmc_reviewed_at = now
        r.pmc_reviewed_by_id = user.id
        _log_itp_review(db, r, "PMC", user, approved=approved, comment=body.comment)
    elif _is_client_reviewer_itp(r, user) and not r.client_reviewed:
        r.client_reviewed = True
        r.client_approved = approved
        r.client_comment = body.comment
        r.client_reviewed_at = now
        r.client_reviewed_by_id = user.id
        _log_itp_review(db, r, "CLIENT", user, approved=approved, comment=body.comment)
    else:
        raise HTTPException(403, "You do not have a pending review for this ITP")
    _update_itp_approval_status(r)
    set_updated(r, user.id)
    db.commit()
    db.refresh(r)
    return _fmt_itp(r)


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard(
    package_id: Optional[int] = None,
    test_type_id: Optional[int] = None,
    witness_level_id: Optional[int] = None,
    area_id: Optional[int] = None,
    unit_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    _deny_bidder(user)
    q = db.query(models.ITPRecord).filter_by(project_id=user.project_id)
    if user.role == "VENDOR" and user.contact_id:
        pkg_ids = [
            pc.package_id for pc in
            db.query(models.PackageContact).filter_by(contact_id=user.contact_id).all()
        ]
        q = q.filter(models.ITPRecord.package_id.in_(pkg_ids))

    all_records = q.all()

    # Derive filter options from the full (unfiltered) set
    filter_options = {
        "packages": sorted(
            _unique_dicts([
                {"id": r.package_id, "tag": r.package.tag_number, "name": r.package.name or ""}
                for r in all_records if r.package
            ], "id"),
            key=lambda x: x["tag"],
        ),
        "test_types": sorted(
            _unique_dicts([
                {"id": r.test_type_id, "name": r.test_type.name}
                for r in all_records if r.test_type
            ], "id"),
            key=lambda x: x["name"],
        ),
        "witness_levels": sorted(
            _unique_dicts([
                {"id": r.witness_level_id, "code": r.witness_level.code, "name": r.witness_level.name}
                for r in all_records if r.witness_level
            ], "id"),
            key=lambda x: x["code"],
        ),
        "areas": sorted(
            _unique_dicts([
                {"id": r.area_id, "tag": r.area.tag}
                for r in all_records if r.area_id and r.area
            ], "id"),
            key=lambda x: x["tag"],
        ),
        "units": sorted(
            _unique_dicts([
                {"id": r.unit_id, "tag": r.unit.tag}
                for r in all_records if r.unit_id and r.unit
            ], "id"),
            key=lambda x: x["tag"],
        ),
    }

    # Apply filters
    filtered = all_records
    if package_id:
        filtered = [r for r in filtered if r.package_id == package_id]
    if test_type_id:
        filtered = [r for r in filtered if r.test_type_id == test_type_id]
    if witness_level_id:
        filtered = [r for r in filtered if r.witness_level_id == witness_level_id]
    if area_id:
        filtered = [r for r in filtered if r.area_id == area_id]
    if unit_id:
        filtered = [r for r in filtered if r.unit_id == unit_id]

    statuses = ["DRAFT", "PLANNED", "PASSED", "FAILED"]

    def _counts_by(records, key_fn, label_fn):
        groups: dict = {}
        for r in records:
            k = key_fn(r)
            if k is None:
                continue
            if k not in groups:
                groups[k] = {"label": label_fn(r), "counts": {s: 0 for s in statuses}, "total": 0}
            s = r.status if r.status in statuses else "DRAFT"
            groups[k]["counts"][s] += 1
            groups[k]["total"] += 1
        return sorted(groups.values(), key=lambda x: x["label"])

    by_package = _counts_by(
        filtered,
        lambda r: r.package_id,
        lambda r: f"{r.package.tag_number} – {r.package.name}" if r.package else "Unknown",
    )
    by_area = _counts_by(
        [r for r in filtered if r.area_id],
        lambda r: r.area_id,
        lambda r: r.area.tag if r.area else "Unknown",
    )
    by_unit = _counts_by(
        [r for r in filtered if r.unit_id],
        lambda r: r.unit_id,
        lambda r: r.unit.tag if r.unit else "Unknown",
    )

    totals = {s: sum(1 for r in filtered if r.status == s) for s in statuses}
    totals["total"] = len(filtered)
    approval_totals = {
        "TO_SUBMIT": sum(1 for r in filtered if r.approval_status == "TO_SUBMIT"),
        "PENDING": sum(1 for r in filtered if r.approval_status == "PENDING"),
        "APPROVED": sum(1 for r in filtered if r.approval_status == "APPROVED"),
        "REJECTED": sum(1 for r in filtered if r.approval_status == "REJECTED"),
    }

    return {
        "totals": totals,
        "approval_totals": approval_totals,
        "by_package": by_package,
        "by_area": by_area,
        "by_unit": by_unit,
        "filter_options": filter_options,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Approvals overview
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/approvals")
def list_approvals(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Return ITP records that are under review or finalised (not TO_SUBMIT)."""
    _deny_bidder(user)
    q = (
        db.query(models.ITPRecord)
        .filter(
            models.ITPRecord.project_id == user.project_id,
            models.ITPRecord.approval_status != "TO_SUBMIT",
        )
    )
    if user.role == "VENDOR":
        if not user.contact_id:
            return []
        pkg_ids = [
            pc.package_id for pc in
            db.query(models.PackageContact).filter_by(contact_id=user.contact_id).all()
        ]
        q = q.filter(models.ITPRecord.package_id.in_(pkg_ids))
    return [_fmt_itp(r) for r in q.order_by(models.ITPRecord.id.desc()).all()]


@router.post("/itp/{itp_id}/override-review")
def override_review(
    itp_id: int,
    body: ITPOverrideReview,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Admin / Project Owner / Package Owner can set both review slots at
    once (mirrors the scope-change / invoice override). Status finalises
    immediately to APPROVED or REJECTED."""
    _deny_bidder(user)
    r = db.query(models.ITPRecord).filter_by(id=itp_id, project_id=user.project_id).first()
    if not r:
        raise HTTPException(404, "ITP record not found")
    package = db.query(models.Package).filter_by(id=r.package_id).first()
    if not _can_manage(user, package, db):
        raise HTTPException(403, "Only ADMIN, PROJECT_OWNER, or Package Owner can override reviews")
    if body.status not in ("APPROVED", "REJECTED"):
        raise HTTPException(400, "status must be APPROVED or REJECTED")

    approved = (body.status == "APPROVED")
    comment = (body.comment or "").strip() or f"Decision overridden by {user.name}"
    now = datetime.utcnow()
    r.pmc_reviewed = True
    r.pmc_approved = approved
    r.pmc_comment = comment
    r.pmc_reviewed_at = now
    r.pmc_reviewed_by_id = user.id
    r.client_reviewed = True
    r.client_approved = approved
    r.client_comment = comment
    r.client_reviewed_at = now
    r.client_reviewed_by_id = user.id
    r.approval_status = "APPROVED" if approved else "REJECTED"
    _log_itp_review(db, r, "OVERRIDE", user, approved=approved, comment=comment)

    set_updated(r, user.id)
    db.commit()
    db.refresh(r)
    return _fmt_itp(r)


# ─────────────────────────────────────────────────────────────────────────────
# My Action Points integration
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/my-pending-reviews")
def my_pending_reviews(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """ITP records where the current user is the PMC or Client Technical
    reviewer on the package AND their side hasn't been reviewed yet."""
    if not user.contact_id:
        return []
    records = (
        db.query(models.ITPRecord)
        .join(models.Package, models.Package.id == models.ITPRecord.package_id)
        .filter(
            models.ITPRecord.project_id == user.project_id,
            models.ITPRecord.approval_status == "PENDING",
        )
        .all()
    )
    result = []
    for r in records:
        pkg = r.package
        if not pkg:
            continue
        if pkg.pmc_technical_reviewer_id == user.contact_id and not r.pmc_reviewed:
            data = _fmt_itp(r)
            data["my_reviewer_role"] = "PMC_TECHNICAL"
            result.append(data)
        elif pkg.client_technical_reviewer_id == user.contact_id and not r.client_reviewed:
            data = _fmt_itp(r)
            data["my_reviewer_role"] = "CLIENT_TECHNICAL"
            result.append(data)
    return result


@router.get("/my-rejected-itps")
def my_rejected_itps(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """ITP records with a REJECTED approval where the user is a vendor contact on the package."""
    if not user.contact_id:
        return []
    pkg_ids = [
        pc.package_id for pc in
        db.query(models.PackageContact).filter_by(contact_id=user.contact_id).all()
    ]
    if not pkg_ids:
        return []
    records = (
        db.query(models.ITPRecord)
        .filter(
            models.ITPRecord.project_id == user.project_id,
            models.ITPRecord.package_id.in_(pkg_ids),
            models.ITPRecord.approval_status.in_(["REJECTED", "PENDING"]),
        )
        .all()
    )
    # Include fully REJECTED records, plus PENDING records where at least one
    # reviewer has already rejected — the vendor can then resubmit early
    # without waiting for the other reviewer.
    result = []
    for r in records:
        if r.approval_status == "REJECTED":
            result.append(_fmt_itp(r))
        elif r.approval_status == "PENDING" and _itp_has_rejection(r.id, db):
            result.append(_fmt_itp(r))
    return result


@router.get("/itp/{itp_id}/history")
def get_itp_history(
    itp_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    _deny_bidder(user)
    r = db.query(models.ITPRecord).filter_by(id=itp_id, project_id=user.project_id).first()
    if not r:
        raise HTTPException(404, "ITP record not found")
    if user.role == "VENDOR" and not _is_vendor_on_package(user, r.package_id, db):
        raise HTTPException(403, "Access denied")
    rows = (
        db.query(models.ITPReviewHistory)
        .filter_by(itp_id=itp_id)
        .order_by(models.ITPReviewHistory.created_at.asc())
        .all()
    )
    return [
        {
            "id": row.id,
            "event": row.event,
            "approved": row.approved,
            "comment": row.comment,
            "actor_id": row.actor_id,
            "actor_name": row.actor.name if row.actor else None,
            "created_at": row.created_at.isoformat() + 'Z' if row.created_at else None,
        }
        for row in rows
    ]


def _itp_has_rejection(r_or_id, db: Session = None) -> bool:
    """True if at least one reviewer has already rejected — checked against
    the flat columns on the ITP record. Accepts either an ITPRecord instance
    or an itp_id (for backward compat with older call sites)."""
    if isinstance(r_or_id, models.ITPRecord):
        r = r_or_id
    else:
        r = db.query(models.ITPRecord).filter_by(id=r_or_id).first()
        if not r:
            return False
    return (r.pmc_reviewed and r.pmc_approved is False) or \
           (r.client_reviewed and r.client_approved is False)


@router.post("/itp/{itp_id}/resubmit")
def resubmit_itp(
    itp_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Reset all reviews to PENDING so the ITP can be re-approved after
    rejection. Allowed on fully-REJECTED records AND on PENDING records where
    at least one reviewer has already rejected (the ITP is effectively doomed
    so the package-linked vendor doesn't have to wait for the other side)."""
    _deny_bidder(user)
    r = db.query(models.ITPRecord).filter_by(id=itp_id, project_id=user.project_id).first()
    if not r:
        raise HTTPException(404, "ITP record not found")
    if r.approval_status == "REJECTED":
        pass  # always resubmittable
    elif r.approval_status == "PENDING" and _itp_has_rejection(itp_id, db):
        pass  # partial rejection — allow early resubmit
    else:
        raise HTTPException(400, "ITP has no rejection to resubmit from")

    can_resubmit = _can_manage(user, r.package, db) or _is_vendor_on_package(user, r.package_id, db)
    if not can_resubmit:
        raise HTTPException(403, "You are not permitted to resubmit this ITP")

    _reset_itp_reviews(r, r.package)
    _log_itp_review(db, r, "RESUBMIT", user)
    _update_itp_approval_status(r)
    set_updated(r, user.id)
    db.commit()
    db.refresh(r)
    return _fmt_itp(r)


# ─────────────────────────────────────────────────────────────────────────────
# Obligation Times
# ─────────────────────────────────────────────────────────────────────────────

class ObligationTimeCreate(BaseModel):
    code: str
    name: str
    sort_order: int = 0


class ObligationTimeUpdate(BaseModel):
    code: str
    name: str
    sort_order: int = 0
    updated_at: Optional[str] = None


def _fmt_obligation_time(ot: models.ObligationTime) -> dict:
    return {
        "id": ot.id,
        "code": ot.code,
        "name": ot.name,
        "sort_order": ot.sort_order,
        **audit_dict(ot),
    }


@router.get("/obligation-times")
def list_obligation_times(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    _deny_bidder(user)
    items = (
        db.query(models.ObligationTime)
        .filter_by(project_id=user.project_id)
        .order_by(models.ObligationTime.sort_order, models.ObligationTime.code)
        .all()
    )
    return [_fmt_obligation_time(ot) for ot in items]


@router.post("/obligation-times")
def create_obligation_time(
    body: ObligationTimeCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not auth.has_owner_or_lead_access(user, "Quality Control", db):
        raise HTTPException(403, "Only ADMIN or PROJECT_OWNER can manage obligation times")
    ot = models.ObligationTime(
        project_id=user.project_id,
        code=body.code,
        name=body.name,
        sort_order=body.sort_order,
    )
    set_created(ot, user.id)
    db.add(ot)
    db.commit()
    db.refresh(ot)
    return _fmt_obligation_time(ot)


@router.put("/obligation-times/{ot_id}")
def update_obligation_time(
    ot_id: int,
    body: ObligationTimeUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not auth.has_owner_or_lead_access(user, "Quality Control", db):
        raise HTTPException(403, "Only ADMIN or PROJECT_OWNER can manage obligation times")
    ot = db.query(models.ObligationTime).filter_by(id=ot_id, project_id=user.project_id).first()
    if not ot:
        raise HTTPException(404, "Obligation time not found")
    check_lock(ot.updated_at, body.updated_at, "obligation_time")
    ot.code = body.code
    ot.name = body.name
    ot.sort_order = body.sort_order
    set_updated(ot, user.id)
    db.commit()
    db.refresh(ot)
    return _fmt_obligation_time(ot)


@router.delete("/obligation-times/{ot_id}")
def delete_obligation_time(
    ot_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not auth.has_owner_or_lead_access(user, "Quality Control", db):
        raise HTTPException(403, "Only ADMIN or PROJECT_OWNER can manage obligation times")
    ot = db.query(models.ObligationTime).filter_by(id=ot_id, project_id=user.project_id).first()
    if not ot:
        raise HTTPException(404, "Obligation time not found")
    if db.query(models.PunchItem).filter_by(obligation_time_id=ot_id).count() > 0:
        raise HTTPException(400, "Cannot delete: obligation time is used by existing punch items")
    db.delete(ot)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Punchlist
# ─────────────────────────────────────────────────────────────────────────────

class PunchCreate(BaseModel):
    package_id: int
    obligation_time_id: int
    itp_record_id: Optional[int] = None
    area_id: Optional[int] = None
    unit_id: Optional[int] = None
    topic: str
    details: str
    floorplan_id: Optional[int] = None
    floorplan_x: Optional[float] = None
    floorplan_y: Optional[float] = None


class PunchUpdate(BaseModel):
    package_id: int
    obligation_time_id: int
    itp_record_id: Optional[int] = None
    area_id: Optional[int] = None
    unit_id: Optional[int] = None
    topic: str
    details: str
    floorplan_id: Optional[int] = None
    floorplan_x: Optional[float] = None
    floorplan_y: Optional[float] = None
    clear_pin: Optional[bool] = None
    updated_at: Optional[str] = None


class PunchRespondBody(BaseModel):
    response: str
    updated_at: Optional[str] = None


class PunchReviewBody(BaseModel):
    action: str           # CLOSE | REOPEN
    comment: Optional[str] = None
    updated_at: Optional[str] = None


class PunchOverrideBody(BaseModel):
    status: str           # OPEN | TO_REVIEW | CLOSED
    updated_at: Optional[str] = None


def _resolve_punch_pin(area_id: Optional[int], fp_id: Optional[int],
                       fp_x: Optional[float], fp_y: Optional[float],
                       user: auth.ProjectContext, db: Session):
    """Returns (floorplan_id, x, y). None means no pin. Validates the pin's
    floorplan matches the area's plan and that x/y are in [0,1]."""
    if fp_id is None or fp_x is None or fp_y is None:
        return (None, None, None)
    if area_id is None:
        raise HTTPException(400, "An area must be selected before pinning a floorplan location")
    area = db.query(models.Area).filter_by(id=area_id, project_id=user.project_id).first()
    if not area or area.floorplan_id != fp_id:
        raise HTTPException(400, "Pin floorplan does not match the selected area")
    if not (0.0 <= float(fp_x) <= 1.0) or not (0.0 <= float(fp_y) <= 1.0):
        raise HTTPException(400, "Pin coordinates must be between 0 and 1")
    return (int(fp_id), float(fp_x), float(fp_y))


def _fmt_punch(p: models.PunchItem) -> dict:
    return {
        "id": p.id,
        "seq_id": p.project_seq_id,
        "package_id": p.package_id,
        "package_tag": p.package.tag_number if p.package else None,
        "package_name": p.package.name if p.package else None,
        "obligation_time_id": p.obligation_time_id,
        "obligation_time_code": p.obligation_time.code if p.obligation_time else None,
        "obligation_time_name": p.obligation_time.name if p.obligation_time else None,
        "itp_record_id": p.itp_record_id,
        "itp_test": p.itp_record.test if p.itp_record else None,
        "area_id": p.area_id,
        "area_tag": p.area.tag if p.area else None,
        "unit_id": p.unit_id,
        "unit_tag": p.unit.tag if p.unit else None,
        "topic": p.topic,
        "details": p.details,
        "response": p.response,
        "status": p.status,
        "submitted_by_id": p.submitted_by_id,
        "submitted_by_name": p.submitted_by.name if p.submitted_by else None,
        "floorplan_id": p.floorplan_id,
        "floorplan_name": p.floorplan.name if p.floorplan else None,
        "floorplan_x": p.floorplan_x,
        "floorplan_y": p.floorplan_y,
        **audit_dict(p),
    }


def _can_manage_punch(user: auth.ProjectContext, punch: models.PunchItem, db: Session) -> bool:
    """ADMIN, PROJECT_OWNER, or the package owner can override punch status."""
    if auth.has_owner_or_lead_access(user, "Quality Control", db):
        return True
    if user.contact_id and punch.package.package_owner_id == user.contact_id:
        return True
    return False


def _is_package_contact(user: auth.ProjectContext, package_id: int, db: Session) -> bool:
    """True if user's contact is linked to the package."""
    if not user.contact_id:
        return False
    return bool(
        db.query(models.PackageContact)
        .filter_by(package_id=package_id, contact_id=user.contact_id)
        .first()
    )


def _is_reviewer_contact(user: auth.ProjectContext, db: Session) -> bool:
    """True if user's contact is assigned as a technical reviewer on any package."""
    if not user.contact_id:
        return False
    cid = user.contact_id
    return db.query(models.Package).filter(
        models.Package.project_id == user.project_id,
        or_(
            models.Package.pmc_technical_reviewer_id == cid,
            models.Package.client_technical_reviewer_id == cid,
        )
    ).first() is not None


@router.get("/punches")
def list_punches(
    package_id: Optional[int] = None,
    status: Optional[str] = None,
    obligation_time_id: Optional[int] = None,
    area_id: Optional[int] = None,
    unit_id: Optional[int] = None,
    mine: bool = False,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    _deny_bidder(user)
    q = db.query(models.PunchItem).filter_by(project_id=user.project_id)
    if package_id:
        q = q.filter(models.PunchItem.package_id == package_id)
    if status:
        q = q.filter(models.PunchItem.status == status)
    if obligation_time_id:
        q = q.filter(models.PunchItem.obligation_time_id == obligation_time_id)
    if area_id:
        q = q.filter(models.PunchItem.area_id == area_id)
    if unit_id:
        q = q.filter(models.PunchItem.unit_id == unit_id)

    # DRAFT items are private to the creator (and ADMIN/PROJECT_OWNER).
    if not auth.has_owner_or_lead_access(user, "Quality Control", db):
        q = q.filter(or_(
            models.PunchItem.status != "DRAFT",
            models.PunchItem.created_by_id == user.id,
        ))

    # Vendors can only see punches for packages they are linked to
    if user.role == "VENDOR":
        if not user.contact_id:
            return []
        pkg_ids = [
            pc.package_id for pc in
            db.query(models.PackageContact).filter_by(contact_id=user.contact_id).all()
        ]
        q = q.filter(models.PunchItem.package_id.in_(pkg_ids))

    # "My Punches" filter — user-centric shortlist used by the toolbar button:
    #   • OPEN punches on any package the user is a linked contact of, AND
    #   • OPEN + TO_REVIEW punches the user created, AND
    #   • OPEN + TO_REVIEW punches whose package has the user as PMC Technical
    #     or Client Technical reviewer.
    # CLOSED punches are never surfaced here.
    if mine:
        if not user.id and not user.contact_id:
            return []
        clauses = []
        linked_pkg_ids = []
        if user.contact_id:
            linked_pkg_ids = [
                pc.package_id for pc in
                db.query(models.PackageContact).filter_by(contact_id=user.contact_id).all()
            ]
            # Linked-contact branch: OPEN only
            if linked_pkg_ids:
                clauses.append(
                    and_(
                        models.PunchItem.package_id.in_(linked_pkg_ids),
                        models.PunchItem.status == "OPEN",
                    )
                )
            # Reviewer branch (PMC/Client Technical on the punch's own package):
            # OPEN and TO_REVIEW
            reviewer_pkg_ids = [
                p.id for p in
                db.query(models.Package).filter(
                    models.Package.project_id == user.project_id,
                    or_(
                        models.Package.pmc_technical_reviewer_id == user.contact_id,
                        models.Package.client_technical_reviewer_id == user.contact_id,
                    ),
                ).all()
            ]
            if reviewer_pkg_ids:
                clauses.append(
                    and_(
                        models.PunchItem.package_id.in_(reviewer_pkg_ids),
                        models.PunchItem.status.in_(["OPEN", "TO_REVIEW"]),
                    )
                )
        if user.id:
            # Creator branch: OPEN and TO_REVIEW
            clauses.append(
                and_(
                    models.PunchItem.created_by_id == user.id,
                    models.PunchItem.status.in_(["OPEN", "TO_REVIEW"]),
                )
            )
        if not clauses:
            return []
        q = q.filter(or_(*clauses))

    items = q.order_by(models.PunchItem.created_at.desc()).all()
    return [_fmt_punch(item) for item in items]


@router.post("/punches")
def create_punch(
    body: PunchCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER", "PROJECT_TEAM", "CLIENT"):
        raise HTTPException(403, "Only PROJECT_OWNER, PROJECT_TEAM, or CLIENT can create punch items")
    pkg = db.query(models.Package).filter_by(id=body.package_id, project_id=user.project_id).first()
    if not pkg:
        raise HTTPException(404, "Package not found")
    ot = db.query(models.ObligationTime).filter_by(id=body.obligation_time_id, project_id=user.project_id).first()
    if not ot:
        raise HTTPException(404, "Obligation time not found")
    fp_id, fp_x, fp_y = _resolve_punch_pin(body.area_id, body.floorplan_id,
                                           body.floorplan_x, body.floorplan_y, user, db)
    punch = models.PunchItem(
        project_id=user.project_id,
        project_seq_id=models.next_project_seq(db, models.PunchItem, user.project_id),
        package_id=body.package_id,
        obligation_time_id=body.obligation_time_id,
        itp_record_id=body.itp_record_id,
        area_id=body.area_id,
        unit_id=body.unit_id,
        topic=body.topic,
        details=body.details,
        floorplan_id=fp_id,
        floorplan_x=fp_x,
        floorplan_y=fp_y,
        status="DRAFT",
        submitted_by_id=None,
    )
    set_created(punch, user.id)
    db.add(punch)
    db.commit()
    db.refresh(punch)
    return _fmt_punch(punch)


@router.post("/punches/{punch_id}/submit")
def submit_punch_draft(
    punch_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Transition a DRAFT punch item to OPEN — i.e. publish it so the rest
    of the project can see it. Only the creator (or ADMIN/PROJECT_OWNER) can
    submit; once OPEN, the regular punch workflow takes over."""
    punch = db.query(models.PunchItem).filter_by(id=punch_id, project_id=user.project_id).first()
    if not punch:
        raise HTTPException(404, "Punch item not found")
    if punch.status != "DRAFT":
        raise HTTPException(400, "Only DRAFT punch items can be submitted")
    is_creator = user.id and punch.created_by_id == user.id
    if not (is_creator or auth.has_owner_or_lead_access(user, "Quality Control", db)):
        raise HTTPException(403, "Only the creator can submit this draft")
    punch.status = "OPEN"
    punch.submitted_by_id = user.id
    set_updated(punch, user.id)
    db.commit()
    db.refresh(punch)
    return _fmt_punch(punch)


@router.get("/punches/{punch_id}")
def get_punch(
    punch_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    _deny_bidder(user)
    punch = db.query(models.PunchItem).filter_by(id=punch_id, project_id=user.project_id).first()
    if not punch:
        raise HTTPException(404, "Punch item not found")
    return _fmt_punch(punch)


@router.put("/punches/{punch_id}")
def update_punch(
    punch_id: int,
    body: PunchUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    punch = db.query(models.PunchItem).filter_by(id=punch_id, project_id=user.project_id).first()
    if not punch:
        raise HTTPException(404, "Punch item not found")
    if punch.status != "OPEN":
        raise HTTPException(400, "Only OPEN punch items can be edited")
    if not _can_manage_punch(user, punch, db):
        raise HTTPException(403, "Not authorized to edit this punch item")
    check_lock(punch.updated_at, body.updated_at, "punch_item")
    punch.package_id = body.package_id
    punch.obligation_time_id = body.obligation_time_id
    punch.itp_record_id = body.itp_record_id
    punch.area_id = body.area_id
    punch.unit_id = body.unit_id
    punch.topic = body.topic
    punch.details = body.details

    # Pin handling: explicit clear / explicit set / passive auto-clear if the
    # area's plan no longer matches the currently-stored pin.
    if body.clear_pin:
        punch.floorplan_id = punch.floorplan_x = punch.floorplan_y = None
    elif body.floorplan_id is not None or body.floorplan_x is not None or body.floorplan_y is not None:
        fp_id, fp_x, fp_y = _resolve_punch_pin(body.area_id, body.floorplan_id,
                                               body.floorplan_x, body.floorplan_y, user, db)
        punch.floorplan_id = fp_id
        punch.floorplan_x  = fp_x
        punch.floorplan_y  = fp_y
    elif punch.floorplan_id is not None:
        # Area changed and no longer matches the stored pin's plan?
        if body.area_id is None:
            punch.floorplan_id = punch.floorplan_x = punch.floorplan_y = None
        else:
            new_area = db.query(models.Area).filter_by(id=body.area_id, project_id=user.project_id).first()
            if not new_area or new_area.floorplan_id != punch.floorplan_id:
                punch.floorplan_id = punch.floorplan_x = punch.floorplan_y = None

    set_updated(punch, user.id)
    db.commit()
    db.refresh(punch)
    return _fmt_punch(punch)


@router.delete("/punches/{punch_id}")
def delete_punch(
    punch_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    punch = db.query(models.PunchItem).filter_by(id=punch_id, project_id=user.project_id).first()
    if not punch:
        raise HTTPException(404, "Punch item not found")
    if not _can_manage_punch(user, punch, db):
        raise HTTPException(403, "Not authorized to delete this punch item")
    db.delete(punch)
    db.commit()
    return {"ok": True}


@router.post("/punches/{punch_id}/respond")
def respond_punch(
    punch_id: int,
    body: PunchRespondBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Package contacts (linked to the package) provide a response and submit for review."""
    punch = db.query(models.PunchItem).filter_by(id=punch_id, project_id=user.project_id).first()
    if not punch:
        raise HTTPException(404, "Punch item not found")
    if punch.status != "OPEN":
        raise HTTPException(400, "Only OPEN punch items can be responded to")

    can_respond = (
        _can_manage_punch(user, punch, db)
        or _is_package_contact(user, punch.package_id, db)
    )
    if not can_respond:
        raise HTTPException(403, "Not authorized to respond to this punch item")

    check_lock(punch.updated_at, body.updated_at, "punch_item")
    punch.response = body.response
    punch.status = "TO_REVIEW"
    punch.submitted_by_id = user.id
    set_updated(punch, user.id)
    db.commit()
    db.refresh(punch)
    return _fmt_punch(punch)


@router.post("/punches/{punch_id}/review")
def review_punch(
    punch_id: int,
    body: PunchReviewBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """PMC/Client technical reviewers (and submitter) close or reopen a punch item."""
    punch = db.query(models.PunchItem).filter_by(id=punch_id, project_id=user.project_id).first()
    if not punch:
        raise HTTPException(404, "Punch item not found")
    if punch.status != "TO_REVIEW":
        raise HTTPException(400, "Punch item is not in TO_REVIEW status")

    # Reviewer permission is scoped to the punch's own package — not any
    # package in the project. The creator of the punch (who logged it) is
    # also allowed to close/reopen, mirroring the "My Action Points" surface.
    # `submitted_by_id` is the responder and changes at response time, so
    # we match on `created_by_id` for the creator branch.
    pkg = punch.package
    is_reviewer = bool(user.contact_id and pkg and (
        pkg.pmc_technical_reviewer_id == user.contact_id or
        pkg.client_technical_reviewer_id == user.contact_id
    ))
    is_creator = punch.created_by_id == user.id
    can_review = _can_manage_punch(user, punch, db) or is_reviewer or is_creator
    if not can_review:
        raise HTTPException(403, "Not authorized to review this punch item")

    check_lock(punch.updated_at, body.updated_at, "punch_item")
    if body.action == "CLOSE":
        punch.status = "CLOSED"
    elif body.action == "REOPEN":
        punch.status = "OPEN"
        punch.response = None
    else:
        raise HTTPException(400, "action must be CLOSE or REOPEN")
    set_updated(punch, user.id)
    db.commit()
    db.refresh(punch)
    return _fmt_punch(punch)


@router.post("/punches/{punch_id}/override")
def override_punch_status(
    punch_id: int,
    body: PunchOverrideBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """ADMIN, PROJECT_OWNER, or package owner can set status to any value."""
    punch = db.query(models.PunchItem).filter_by(id=punch_id, project_id=user.project_id).first()
    if not punch:
        raise HTTPException(404, "Punch item not found")
    if not _can_manage_punch(user, punch, db):
        raise HTTPException(403, "Not authorized to override punch item status")
    if body.status not in ("OPEN", "TO_REVIEW", "CLOSED"):
        raise HTTPException(400, "Invalid status")
    check_lock(punch.updated_at, body.updated_at, "punch_item")
    punch.status = body.status
    set_updated(punch, user.id)
    db.commit()
    db.refresh(punch)
    return _fmt_punch(punch)


@router.get("/punch-dashboard")
def get_punch_dashboard(
    package_id: Optional[int] = None,
    area_id: Optional[int] = None,
    unit_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    _deny_bidder(user)
    q = db.query(models.PunchItem).filter_by(project_id=user.project_id)
    if user.role == "VENDOR" and user.contact_id:
        pkg_ids = [
            pc.package_id for pc in
            db.query(models.PackageContact).filter_by(contact_id=user.contact_id).all()
        ]
        q = q.filter(models.PunchItem.package_id.in_(pkg_ids))

    all_items = q.all()

    # DRAFTs are private to the creator and never counted in the dashboard.
    all_items = [i for i in all_items if i.status != "DRAFT"]

    # Apply filters
    if package_id:
        all_items = [i for i in all_items if i.package_id == package_id]
    if area_id:
        all_items = [i for i in all_items if i.area_id == area_id]
    if unit_id:
        all_items = [i for i in all_items if i.unit_id == unit_id]
    statuses = ["OPEN", "TO_REVIEW", "CLOSED"]

    def _punch_counts_by(items, key_fn, label_fn):
        groups: dict = {}
        for item in items:
            k = key_fn(item)
            if k is None:
                continue
            if k not in groups:
                groups[k] = {"label": label_fn(item), "counts": {s: 0 for s in statuses}, "total": 0}
            s = item.status if item.status in statuses else "OPEN"
            groups[k]["counts"][s] += 1
            groups[k]["total"] += 1
        return sorted(groups.values(), key=lambda x: x["label"])

    by_package = _punch_counts_by(
        all_items,
        lambda i: i.package_id,
        lambda i: f"{i.package.tag_number} – {i.package.name}" if i.package else "Unknown",
    )
    by_area = _punch_counts_by(
        [i for i in all_items if i.area_id],
        lambda i: i.area_id,
        lambda i: i.area.tag if i.area else "Unknown",
    )
    by_unit = _punch_counts_by(
        [i for i in all_items if i.unit_id],
        lambda i: i.unit_id,
        lambda i: i.unit.tag if i.unit else "Unknown",
    )

    totals = {s: sum(1 for i in all_items if i.status == s) for s in statuses}
    totals["total"] = len(all_items)

    # ── Open-punches trend (weekly, respects current filters) ────────────────
    # Each punch contributes +1 at its creation week; CLOSED punches contribute
    # -1 at their updated_at week (proxy for close time). The cumulative "open"
    # count at the end of each week (OPEN + TO_REVIEW — anything not CLOSED) is
    # what we plot.
    timeline: list = []
    events: list = []  # (date, +1 | -1)
    for p in all_items:
        if p.created_at:
            events.append((p.created_at.date(), 1))
        if p.status == "CLOSED" and p.updated_at:
            events.append((p.updated_at.date(), -1))
    if events:
        def week_start(d: date) -> date:
            return d - timedelta(days=d.weekday())  # Monday
        weekly = defaultdict(lambda: {"opened": 0, "closed": 0})
        for d, sign in events:
            key = week_start(d).isoformat()
            if sign > 0:
                weekly[key]["opened"] += 1
            else:
                weekly[key]["closed"] += 1
        first_ws = week_start(min(e[0] for e in events))
        last_ws  = max(week_start(max(e[0] for e in events)), week_start(date.today()))
        cur = first_ws
        running = 0
        while cur <= last_ws:
            key = cur.isoformat()
            opened = weekly.get(key, {}).get("opened", 0)
            closed = weekly.get(key, {}).get("closed", 0)
            running += opened - closed
            timeline.append({"week": key, "opened": opened, "closed": closed, "open": running})
            cur += timedelta(days=7)

    return {
        "totals": totals,
        "by_package": by_package,
        "by_area": by_area,
        "by_unit": by_unit,
        "open_punches_timeline": timeline,
    }


@router.get("/my-open-punches")
def my_open_punches(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Punch items in OPEN status visible to the user's contact as a package contact."""
    if not user.contact_id:
        return []
    pkg_ids = [
        pc.package_id for pc in
        db.query(models.PackageContact).filter_by(contact_id=user.contact_id).all()
    ]
    if not pkg_ids:
        return []
    items = (
        db.query(models.PunchItem)
        .filter(
            models.PunchItem.project_id == user.project_id,
            models.PunchItem.package_id.in_(pkg_ids),
            models.PunchItem.status == "OPEN",
        )
        .order_by(models.PunchItem.created_at.desc())
        .all()
    )
    return [_fmt_punch(item) for item in items]


@router.get("/my-review-punches")
def my_review_punches(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """
    Punch items in TO_REVIEW status where the current user is either:
      - the original creator (so they see the response come back for review), OR
      - the PMC Technical reviewer on the punch's own package, OR
      - the Client Technical reviewer on the punch's own package.

    The reviewer match is scoped to the specific punch's package — not any
    package in the project — so users only get action points for punches
    they're actually responsible for. `submitted_by_id` is the responder, not
    the originator, so we match on `created_by_id` for the creator branch.
    """
    if not user.contact_id and not user.id:
        return []

    q = (
        db.query(models.PunchItem)
        .join(models.Package, models.Package.id == models.PunchItem.package_id)
        .filter(
            models.PunchItem.project_id == user.project_id,
            models.PunchItem.status == "TO_REVIEW",
        )
    )

    clauses = []
    if user.id:
        clauses.append(models.PunchItem.created_by_id == user.id)
    if user.contact_id:
        clauses.append(models.Package.pmc_technical_reviewer_id == user.contact_id)
        clauses.append(models.Package.client_technical_reviewer_id == user.contact_id)
    if not clauses:
        return []
    q = q.filter(or_(*clauses))

    items = q.order_by(models.PunchItem.created_at.desc()).all()
    return [_fmt_punch(item) for item in items]


# ─────────────────────────────────────────────────────────────────────────────
# ITP Notes
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/itp/{itp_id}/notes")
def list_itp_notes(itp_id: int, db: Session = Depends(get_db), user: auth.ProjectContext = Depends(auth.get_project_user)):
    _deny_bidder(user)
    r = db.query(models.ITPRecord).filter_by(id=itp_id, project_id=user.project_id).first()
    if not r:
        raise HTTPException(404, "ITP record not found")
    return [
        {
            "id": n.id,
            "content": n.content,
            "created_at": n.created_at.isoformat() + 'Z' if n.created_at else None,
            "author_name": n.author.name if n.author else None,
            "author_id": n.created_by_id,
        }
        for n in r.notes
    ]


@router.post("/itp/{itp_id}/notes")
def add_itp_note(itp_id: int, body: NoteBody, db: Session = Depends(get_db), user: auth.ProjectContext = Depends(auth.get_project_user)):
    _deny_bidder(user)
    r = db.query(models.ITPRecord).filter_by(id=itp_id, project_id=user.project_id).first()
    if not r:
        raise HTTPException(404, "ITP record not found")
    note = models.ITPNote(itp_record_id=itp_id, content=body.content, created_by_id=user.id)
    db.add(note)
    db.commit()
    db.refresh(note)
    return {
        "id": note.id,
        "content": note.content,
        "created_at": note.created_at.isoformat() + 'Z' if note.created_at else None,
        "author_name": note.author.name if note.author else None,
        "author_id": note.created_by_id,
    }


@router.delete("/itp/{itp_id}/notes/{note_id}")
def delete_itp_note(itp_id: int, note_id: int, db: Session = Depends(get_db), user: auth.ProjectContext = Depends(auth.get_project_user)):
    note = db.query(models.ITPNote).filter_by(id=note_id, itp_record_id=itp_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    if not auth.has_owner_or_lead_access(user, "Quality Control", db) and note.created_by_id != user.id:
        raise HTTPException(403, "Not authorized")
    db.delete(note)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Punch Notes
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/punches/{punch_id}/notes")
def list_punch_notes(punch_id: int, db: Session = Depends(get_db), user: auth.ProjectContext = Depends(auth.get_project_user)):
    _deny_bidder(user)
    p = db.query(models.PunchItem).filter_by(id=punch_id, project_id=user.project_id).first()
    if not p:
        raise HTTPException(404, "Punch item not found")
    return [
        {
            "id": n.id,
            "content": n.content,
            "created_at": n.created_at.isoformat() + 'Z' if n.created_at else None,
            "author_name": n.author.name if n.author else None,
            "author_id": n.created_by_id,
        }
        for n in p.notes
    ]


@router.post("/punches/{punch_id}/notes")
def add_punch_note(punch_id: int, body: NoteBody, db: Session = Depends(get_db), user: auth.ProjectContext = Depends(auth.get_project_user)):
    _deny_bidder(user)
    p = db.query(models.PunchItem).filter_by(id=punch_id, project_id=user.project_id).first()
    if not p:
        raise HTTPException(404, "Punch item not found")
    note = models.PunchNote(punch_item_id=punch_id, content=body.content, created_by_id=user.id)
    db.add(note)
    db.commit()
    db.refresh(note)
    return {
        "id": note.id,
        "content": note.content,
        "created_at": note.created_at.isoformat() + 'Z' if note.created_at else None,
        "author_name": note.author.name if note.author else None,
        "author_id": note.created_by_id,
    }


@router.delete("/punches/{punch_id}/notes/{note_id}")
def delete_punch_note(punch_id: int, note_id: int, db: Session = Depends(get_db), user: auth.ProjectContext = Depends(auth.get_project_user)):
    note = db.query(models.PunchNote).filter_by(id=note_id, punch_item_id=punch_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    if not auth.has_owner_or_lead_access(user, "Quality Control", db) and note.created_by_id != user.id:
        raise HTTPException(403, "Not authorized")
    db.delete(note)
    db.commit()
    return {"ok": True}

    return [_fmt_punch(item) for item in items]
