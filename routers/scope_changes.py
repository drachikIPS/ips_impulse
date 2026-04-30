from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import database, models, auth
from datetime import datetime
from routers.audit import set_created, set_updated, check_lock, audit_dict

router = APIRouter(prefix="/api/scope-changes", tags=["scope-changes"])


def _get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _fmt_sc(sc: models.ScopeChange):
    pkg = sc.package
    pmc_c = pkg.pmc_commercial_reviewer if pkg else None
    cli_c = pkg.client_commercial_reviewer if pkg else None
    return {
        "id": sc.id,
        "seq_id": sc.project_seq_id,
        "description": sc.description,
        "details": sc.details,
        "cost": sc.cost,
        "schedule_impact_months": sc.schedule_impact_months,
        "package_id": sc.package_id,
        "package_tag": pkg.tag_number if pkg else None,
        "package_name": pkg.name if pkg else None,
        "pmc_reviewer_contact_id": pkg.pmc_commercial_reviewer_id if pkg else None,
        "pmc_reviewer_name": pmc_c.name if pmc_c else None,
        "client_reviewer_contact_id": pkg.client_commercial_reviewer_id if pkg else None,
        "client_reviewer_name": cli_c.name if cli_c else None,
        "created_by_id": sc.created_by_id,
        "created_by_name": sc.created_by.name if sc.created_by else None,
        "status": sc.status,
        "pmc_reviewed": sc.pmc_reviewed,
        "pmc_approved": sc.pmc_approved,
        "pmc_comment": sc.pmc_comment,
        "pmc_reviewed_at": sc.pmc_reviewed_at.isoformat() + 'Z' if sc.pmc_reviewed_at else None,
        "client_reviewed": sc.client_reviewed,
        "client_approved": sc.client_approved,
        "client_comment": sc.client_comment,
        "client_reviewed_at": sc.client_reviewed_at.isoformat() + 'Z' if sc.client_reviewed_at else None,
        "order_id": sc.order_id,
        "submitted_at": sc.submitted_at.isoformat() + 'Z' if sc.submitted_at else None,
        **audit_dict(sc),
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class ScBody(BaseModel):
    description: str
    details: Optional[str] = None
    cost: Optional[float] = 0.0
    schedule_impact_months: Optional[float] = 0.0
    package_id: Optional[int] = None
    updated_at: Optional[str] = None


class ReviewBody(BaseModel):
    approved: bool
    comment: str


class CreateOrderBody(BaseModel):
    package_id: int
    scope_change_ids: List[int]
    po_number: str
    vendor_name: Optional[str] = None
    order_date: Optional[str] = None
    amount: float
    currency: str = "EUR"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_sc(sc_id: int, user, db: Session) -> models.ScopeChange:
    sc = db.query(models.ScopeChange).filter_by(id=sc_id, project_id=user.project_id).first()
    if not sc:
        raise HTTPException(404, "Scope change not found")
    return sc


def _can_see(sc: models.ScopeChange, user, db: Session) -> bool:
    if user.role in ("ADMIN", "PROJECT_OWNER", "PROJECT_TEAM", "CLIENT"):
        return True
    if user.role == "VENDOR" and user.contact_id and sc.package_id:
        return db.query(models.PackageContact).filter_by(
            package_id=sc.package_id, contact_id=user.contact_id
        ).first() is not None
    return False


def _user_can_resubmit(sc: models.ScopeChange, user, db: Session) -> bool:
    """True for the SC's creator, ADMIN/PROJECT_OWNER, or any contact linked
    to the SC's package (owner, account manager, or in PackageContact)."""
    if auth.has_owner_or_lead_access(user, "Scope Changes", db):
        return True
    if sc.created_by_id == user.id:
        return True
    if not user.contact_id or not sc.package_id:
        return False
    pkg = sc.package
    if pkg and (pkg.package_owner_id == user.contact_id or pkg.account_manager_id == user.contact_id):
        return True
    linked = db.query(models.PackageContact).filter_by(
        package_id=sc.package_id, contact_id=user.contact_id
    ).first()
    return linked is not None


def _has_rejection(sc: models.ScopeChange) -> bool:
    """True if any reviewer has already rejected — even if the SC is still
    SUBMITTED waiting for the other side. Such an SC is effectively doomed,
    so the author/package contact can edit & resubmit immediately."""
    return (sc.pmc_reviewed and sc.pmc_approved is False) or \
           (sc.client_reviewed and sc.client_approved is False)


def _can_edit_or_resubmit(sc: models.ScopeChange) -> bool:
    return sc.status in ("DRAFT", "REJECTED") or (sc.status == "SUBMITTED" and _has_rejection(sc))


def _is_pmc_reviewer(sc: models.ScopeChange, user) -> bool:
    if not user.contact_id or not sc.package:
        return False
    return sc.package.pmc_commercial_reviewer_id == user.contact_id


def _is_client_reviewer(sc: models.ScopeChange, user) -> bool:
    if not user.contact_id or not sc.package:
        return False
    return sc.package.client_commercial_reviewer_id == user.contact_id


def _log_review(db: Session, sc: models.ScopeChange, event: str, user, approved=None, comment=None):
    db.add(models.ScopeChangeReview(
        scope_change_id=sc.id,
        event=event,
        approved=approved,
        comment=comment,
        actor_id=user.id if user else None,
    ))


def _update_status(sc: models.ScopeChange):
    """Keep the SC in review until BOTH sides have reviewed (missing reviewers
    are auto-approved at submit time so they count as reviewed already). Only
    when every defined reviewer has acted do we finalise APPROVED/REJECTED —
    otherwise either reviewer can still submit their decision independently."""
    if not (sc.pmc_reviewed and sc.client_reviewed):
        return
    if sc.pmc_approved is False or sc.client_approved is False:
        sc.status = "REJECTED"
    else:
        sc.status = "APPROVED"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/pending-reviews")
def get_pending_reviews(db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    if not user.contact_id:
        return []
    scs = db.query(models.ScopeChange).filter(
        models.ScopeChange.project_id == user.project_id,
        models.ScopeChange.status == "SUBMITTED",
    ).all()
    result = []
    for sc in scs:
        if _is_pmc_reviewer(sc, user) and not sc.pmc_reviewed:
            result.append({**_fmt_sc(sc), "reviewer_role": "PMC_COMMERCIAL"})
        elif _is_client_reviewer(sc, user) and not sc.client_reviewed:
            result.append({**_fmt_sc(sc), "reviewer_role": "CLIENT_COMMERCIAL"})
    return result


@router.get("/{sc_id}/history")
def get_review_history(sc_id: int, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    sc = _get_sc(sc_id, user, db)
    if not _can_see(sc, user, db):
        raise HTTPException(403, "Access denied")
    rows = db.query(models.ScopeChangeReview).filter_by(
        scope_change_id=sc_id
    ).order_by(models.ScopeChangeReview.created_at.asc()).all()
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


@router.get("/my-rejected")
def get_my_rejected(db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    """Rejected scope changes that the user is responsible for resubmitting —
    either they created it, or their contact is linked to the SC's package
    (package owner, account manager, or listed in PackageContact)."""
    scs = db.query(models.ScopeChange).filter(
        models.ScopeChange.project_id == user.project_id,
        models.ScopeChange.status == "REJECTED",
    ).order_by(models.ScopeChange.created_at.desc()).all()
    result = []
    for sc in scs:
        if _user_can_resubmit(sc, user, db):
            result.append(_fmt_sc(sc))
    return result


@router.get("/dashboard")
def get_dashboard(db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    scs = db.query(models.ScopeChange).filter(
        models.ScopeChange.project_id == user.project_id
    ).all()
    statuses = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"]
    by_status = {s: {"count": 0, "cost": 0.0, "months": 0.0} for s in statuses}
    ordered      = {"count": 0, "cost": 0.0, "months": 0.0}
    to_be_ordered = {"count": 0, "cost": 0.0, "months": 0.0}
    by_package = {}

    for sc in scs:
        s = sc.status
        c = sc.cost or 0
        m = sc.schedule_impact_months or 0

        if s in by_status:
            by_status[s]["count"]  += 1
            by_status[s]["cost"]   += c
            by_status[s]["months"] += m

        # Ordered / to-be-ordered (subset of APPROVED)
        if sc.order_id:
            ordered["count"]  += 1
            ordered["cost"]   += c
            ordered["months"] += m
        elif s == "APPROVED":
            to_be_ordered["count"]  += 1
            to_be_ordered["cost"]   += c
            to_be_ordered["months"] += m

        key = sc.package_id
        if key not in by_package:
            by_package[key] = {
                "package_id":   key,
                "package_tag":  sc.package.tag_number if sc.package else "—",
                "package_name": sc.package.name if sc.package else "—",
                "draft": 0,     "draft_cost": 0.0,     "draft_months": 0.0,
                "submitted": 0, "submitted_cost": 0.0, "submitted_months": 0.0,
                "approved": 0,  "approved_cost": 0.0,  "approved_months": 0.0,
                "rejected": 0,  "rejected_cost": 0.0,  "rejected_months": 0.0,
                "cancelled": 0, "cancelled_cost": 0.0, "cancelled_months": 0.0,
                "ordered": 0,   "ordered_cost": 0.0,   "ordered_months": 0.0,
                "to_be_ordered": 0, "to_be_ordered_cost": 0.0, "to_be_ordered_months": 0.0,
            }
        d = by_package[key]
        if s in statuses:
            d[s.lower()]                  = d.get(s.lower(), 0) + 1
            d[s.lower() + "_cost"]       += c
            d[s.lower() + "_months"]     += m
        if sc.order_id:
            d["ordered"]               += 1
            d["ordered_cost"]          += c
            d["ordered_months"]        += m
        elif s == "APPROVED":
            d["to_be_ordered"]         += 1
            d["to_be_ordered_cost"]    += c
            d["to_be_ordered_months"]  += m

    # Top 10 non-approved active SCs (exclude APPROVED and CANCELLED)
    active = [sc for sc in scs if sc.status not in ("APPROVED", "CANCELLED")]

    def _sc_summary(sc):
        return {
            "id":                      sc.id,
            "seq_id":                  sc.project_seq_id,
            "description":             sc.description,
            "status":                  sc.status,
            "cost":                    sc.cost or 0,
            "schedule_impact_months":  sc.schedule_impact_months or 0,
            "package_tag":             sc.package.tag_number if sc.package else "—",
            "package_name":            sc.package.name if sc.package else None,
        }

    top10_cost   = [_sc_summary(sc) for sc in sorted(active, key=lambda x: x.cost or 0,                    reverse=True)[:10]]
    top10_months = [_sc_summary(sc) for sc in sorted(active, key=lambda x: x.schedule_impact_months or 0, reverse=True)[:10]]

    return {
        "by_status":      by_status,
        "ordered":        ordered,
        "to_be_ordered":  to_be_ordered,
        "by_package":     list(by_package.values()),
        "top10_cost":     top10_cost,
        "top10_months":   top10_months,
    }


@router.get("")
def list_scope_changes(
    status: Optional[str] = None,
    package_id: Optional[int] = None,
    db: Session = Depends(_get_db),
    user=Depends(auth.get_project_user),
):
    q = db.query(models.ScopeChange).filter(models.ScopeChange.project_id == user.project_id)
    if status:
        q = q.filter(models.ScopeChange.status == status)
    if package_id:
        q = q.filter(models.ScopeChange.package_id == package_id)
    scs = q.order_by(models.ScopeChange.created_at.desc()).all()
    return [_fmt_sc(sc) for sc in scs if _can_see(sc, user, db)]


@router.post("")
def create_scope_change(body: ScBody, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    sc = models.ScopeChange(
        project_id=user.project_id,
        project_seq_id=models.next_project_seq(db, models.ScopeChange, user.project_id),
        description=body.description,
        details=body.details,
        cost=body.cost or 0.0,
        schedule_impact_months=body.schedule_impact_months or 0.0,
        package_id=body.package_id,
        created_by_id=user.id,
        status="DRAFT",
    )
    set_created(sc, user.id)
    db.add(sc)
    db.commit()
    db.refresh(sc)
    return _fmt_sc(sc)


@router.get("/{sc_id}")
def get_scope_change(sc_id: int, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    sc = _get_sc(sc_id, user, db)
    if not _can_see(sc, user, db):
        raise HTTPException(403, "Access denied")
    return _fmt_sc(sc)


@router.put("/{sc_id}")
def update_scope_change(sc_id: int, body: ScBody, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    sc = _get_sc(sc_id, user, db)
    if not _user_can_resubmit(sc, user, db):
        raise HTTPException(403, "Not authorized")
    if not _can_edit_or_resubmit(sc):
        raise HTTPException(400, "Can only edit DRAFT, REJECTED, or already-rejected-by-one-reviewer scope changes")
    check_lock(sc.updated_at, body.updated_at, "scope change")
    sc.description = body.description
    sc.details = body.details
    sc.cost = body.cost or 0.0
    sc.schedule_impact_months = body.schedule_impact_months or 0.0
    sc.package_id = body.package_id
    set_updated(sc, user.id)
    db.commit()
    db.refresh(sc)
    return _fmt_sc(sc)


@router.post("/{sc_id}/submit")
def submit_scope_change(sc_id: int, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    sc = _get_sc(sc_id, user, db)
    if not _user_can_resubmit(sc, user, db):
        raise HTTPException(403, "Not authorized")
    if not _can_edit_or_resubmit(sc):
        raise HTTPException(400, "Can only submit DRAFT, REJECTED, or already-rejected-by-one-reviewer scope changes")
    if not sc.package_id:
        raise HTTPException(400, "A package must be selected before submitting")
    sc.status = "SUBMITTED"
    sc.submitted_at = datetime.utcnow()
    sc.pmc_reviewed = False
    sc.pmc_approved = None
    sc.pmc_comment = None
    sc.pmc_reviewed_at = None
    sc.client_reviewed = False
    sc.client_approved = None
    sc.client_comment = None
    sc.client_reviewed_at = None
    _log_review(db, sc, "SUBMIT", user)
    # Auto-approve sides that have no reviewer defined on the package so the
    # workflow isn't blocked waiting on a non-existent reviewer.
    now = datetime.utcnow()
    pkg = sc.package
    if pkg and not pkg.pmc_commercial_reviewer_id:
        sc.pmc_reviewed = True
        sc.pmc_approved = True
        sc.pmc_comment = "No reviewer assigned"
        sc.pmc_reviewed_at = now
    if pkg and not pkg.client_commercial_reviewer_id:
        sc.client_reviewed = True
        sc.client_approved = True
        sc.client_comment = "No reviewer assigned"
        sc.client_reviewed_at = now
    _update_status(sc)  # covers the edge case where neither side has a reviewer
    db.commit()
    db.refresh(sc)
    return _fmt_sc(sc)


@router.post("/{sc_id}/pmc-review")
def pmc_review(sc_id: int, body: ReviewBody, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    sc = _get_sc(sc_id, user, db)
    if sc.status != "SUBMITTED":
        raise HTTPException(400, "Scope change is not under review")
    if not _is_pmc_reviewer(sc, user):
        raise HTTPException(403, "You are not the PMC Commercial reviewer for this package")
    if not body.comment or not body.comment.strip():
        raise HTTPException(400, "Comment is required")
    sc.pmc_reviewed = True
    sc.pmc_approved = body.approved
    sc.pmc_comment = body.comment
    sc.pmc_reviewed_at = datetime.utcnow()
    _log_review(db, sc, "PMC", user, approved=body.approved, comment=body.comment)
    _update_status(sc)
    db.commit()
    db.refresh(sc)
    return _fmt_sc(sc)


@router.post("/{sc_id}/client-review")
def client_review(sc_id: int, body: ReviewBody, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    sc = _get_sc(sc_id, user, db)
    if sc.status != "SUBMITTED":
        raise HTTPException(400, "Scope change is not under review")
    if not _is_client_reviewer(sc, user):
        raise HTTPException(403, "You are not the Client Commercial reviewer for this package")
    if not body.comment or not body.comment.strip():
        raise HTTPException(400, "Comment is required")
    sc.client_reviewed = True
    sc.client_approved = body.approved
    sc.client_comment = body.comment
    sc.client_reviewed_at = datetime.utcnow()
    _log_review(db, sc, "CLIENT", user, approved=body.approved, comment=body.comment)
    _update_status(sc)
    db.commit()
    db.refresh(sc)
    return _fmt_sc(sc)


@router.post("/{sc_id}/override")
def override_scope_change(sc_id: int, body: ReviewBody, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    sc = _get_sc(sc_id, user, db)
    pkg = db.query(models.Package).filter_by(id=sc.package_id).first() if sc.package_id else None
    gate = auth.package_access_path(user, "Scope Changes", pkg, db)
    if not gate:
        raise HTTPException(403, "Only Admins, Project Owners, Module Leads or the Package Owner can override")
    if sc.status != "SUBMITTED":
        raise HTTPException(400, "Can only override SUBMITTED scope changes")
    comment = (body.comment or "").strip() or auth.override_default_comment(user.name, gate)
    now = datetime.utcnow()
    sc.pmc_reviewed = True
    sc.pmc_approved = body.approved
    sc.pmc_comment = comment
    sc.pmc_reviewed_at = now
    sc.client_reviewed = True
    sc.client_approved = body.approved
    sc.client_comment = comment
    sc.client_reviewed_at = now
    sc.status = "APPROVED" if body.approved else "REJECTED"
    _log_review(db, sc, "OVERRIDE", user, approved=body.approved, comment=comment)
    db.commit()
    db.refresh(sc)
    return _fmt_sc(sc)


@router.post("/{sc_id}/cancel")
def cancel_scope_change(sc_id: int, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    sc = _get_sc(sc_id, user, db)
    if sc.created_by_id != user.id and not auth.has_owner_or_lead_access(user, "Scope Changes", db):
        raise HTTPException(403, "Not authorized")
    if sc.status == "APPROVED":
        raise HTTPException(400, "Cannot cancel an approved scope change")
    sc.status = "CANCELLED"
    db.commit()
    return {"ok": True}


@router.post("/{sc_id}/reopen")
def reopen_scope_change(sc_id: int, db: Session = Depends(_get_db), user=Depends(auth.get_project_user)):
    sc = _get_sc(sc_id, user, db)
    if sc.created_by_id != user.id and not auth.has_owner_or_lead_access(user, "Scope Changes", db):
        raise HTTPException(403, "Not authorized")
    if sc.status != "CANCELLED":
        raise HTTPException(400, "Only cancelled scope changes can be re-opened")
    sc.status = "DRAFT"
    db.commit()
    return {"ok": True}


@router.post("/create-order")
def create_order_from_scs(
    body: CreateOrderBody,
    db: Session = Depends(_get_db),
    user=Depends(auth.get_project_user),
):
    if not auth.has_owner_or_lead_access(user, "Scope Changes", db):
        raise HTTPException(403, "Only Project Owners can create orders from scope changes")
    if not body.scope_change_ids:
        raise HTTPException(400, "No scope changes selected")
    scs = db.query(models.ScopeChange).filter(
        models.ScopeChange.id.in_(body.scope_change_ids),
        models.ScopeChange.project_id == user.project_id,
        models.ScopeChange.package_id == body.package_id,
        models.ScopeChange.status == "APPROVED",
        models.ScopeChange.order_id == None,
    ).all()
    if len(scs) != len(body.scope_change_ids):
        raise HTTPException(400, "Some scope changes are not eligible (must be APPROVED, same package, not yet ordered)")
    sc_lines = "\n".join([f"  SC-{sc.id:06d}: {sc.description}" for sc in scs])
    full_desc = f"Created from scope changes:\n{sc_lines}"
    order = models.Order(
        package_id=body.package_id,
        po_number=body.po_number,
        description=full_desc,
        vendor_name=body.vendor_name,
        amount=body.amount,
        currency=body.currency,
        order_date=body.order_date,
        status="COMMITTED",
    )
    db.add(order)
    db.flush()
    for sc in scs:
        sc.order_id = order.id
    db.commit()
    return {"ok": True, "order_id": order.id, "count": len(scs)}
