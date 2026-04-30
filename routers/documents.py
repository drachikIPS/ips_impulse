from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from pydantic import BaseModel
from typing import Optional, List
from collections import defaultdict
from datetime import datetime, date, timedelta
import json

from database import get_db
import models
import auth
from routers.audit import check_lock

router = APIRouter(prefix="/api/documents", tags=["documents"])


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _package_contact_ids(package, db) -> set:
    """Set of contact IDs linked to a package (via PackageContact table)."""
    rows = db.query(models.PackageContact).filter_by(package_id=package.id).all()
    return {r.contact_id for r in rows}


def _user_is_package_linked(user: auth.ProjectContext, package, db) -> bool:
    if not user.contact_id:
        return False
    return user.contact_id in _package_contact_ids(package, db)


def _user_is_package_owner(user: auth.ProjectContext, package) -> bool:
    return user.contact_id and package.package_owner_id == user.contact_id


def _can_write_doc(user: auth.ProjectContext, package, db) -> bool:
    """Can this user create / edit documents for this package?"""
    role = user.role
    if role in ("ADMIN", "PROJECT_OWNER"):
        return True
    if _user_is_package_owner(user, package):
        return True
    # PROJECT_TEAM, CLIENT, VENDOR: only if linked to the package
    if role in ("PROJECT_TEAM", "CLIENT", "VENDOR"):
        return _user_is_package_linked(user, package, db)
    return False


def _can_launch(user: auth.ProjectContext, package, db) -> bool:
    """Can this user launch the approval workflow for this document?"""
    role = user.role
    if role in ("ADMIN", "PROJECT_OWNER"):
        return True
    if _user_is_package_owner(user, package):
        return True
    return _user_is_package_linked(user, package, db)


def _visible_package_ids(user: auth.ProjectContext, db) -> Optional[set]:
    """None = all packages visible; set = restricted to these package IDs."""
    role = user.role
    if role in ("ADMIN", "PROJECT_OWNER", "PROJECT_TEAM", "CLIENT"):
        return None
    if role == "VENDOR" and user.contact_id:
        rows = db.query(models.PackageContact).filter_by(contact_id=user.contact_id).all()
        return {r.package_id for r in rows}
    return set()


def _source_kinds_for_doc(document: models.Document) -> list:
    """
    All source kinds that apply to this document, as a list of
    (source_kind, role_label) — in a stable display order.
    Does NOT look up contacts; pair with _resolve_live_contact to get the live holder.
    """
    kinds: list = []
    if document.document_type == "TECHNICAL":
        kinds.append(("PACKAGE_PMC_TECHNICAL",    "PMC Technical (Package)"))
        kinds.append(("PACKAGE_CLIENT_TECHNICAL", "Client Technical (Package)"))
        kinds.append(("SUBSERVICE_PMC",           "PMC Technical (Sub-service)"))
        kinds.append(("SUBSERVICE_CLIENT",        "Client Technical (Sub-service)"))
    else:  # COMMERCIAL
        kinds.append(("PACKAGE_PMC_COMMERCIAL",    "PMC Commercial (Package)"))
        kinds.append(("PACKAGE_CLIENT_COMMERCIAL", "Client Commercial (Package)"))
        kinds.append(("SUBSERVICE_PMC",            "PMC Commercial (Sub-service)"))
        kinds.append(("SUBSERVICE_CLIENT",         "Client Commercial (Sub-service)"))

    if document.require_area_review and document.area_id:
        kinds.append(("AREA_OWNER", "Area Owner"))
    if document.require_unit_review and document.unit_id:
        kinds.append(("UNIT_OWNER", "Unit Owner"))
    return kinds


def _resolve_live_contact(source_kind: str, document: models.Document, db) -> Optional[int]:
    """
    Return the current contact_id that holds this source_kind for the document,
    or None if no one is assigned. Used to dynamically re-resolve reviewer
    ownership whenever Package/Subservice/Area/Unit reviewers change.
    """
    if not source_kind:
        return None
    pkg = document.package
    ss = document.subservice
    if source_kind == "PACKAGE_PMC_TECHNICAL":
        return pkg.pmc_technical_reviewer_id if pkg else None
    if source_kind == "PACKAGE_CLIENT_TECHNICAL":
        return pkg.client_technical_reviewer_id if pkg else None
    if source_kind == "PACKAGE_PMC_COMMERCIAL":
        return pkg.pmc_commercial_reviewer_id if pkg else None
    if source_kind == "PACKAGE_CLIENT_COMMERCIAL":
        return pkg.client_commercial_reviewer_id if pkg else None
    if source_kind == "SUBSERVICE_PMC":
        return ss.pmc_reviewer_id if ss else None
    if source_kind == "SUBSERVICE_CLIENT":
        return ss.client_reviewer_id if ss else None
    if source_kind == "AREA_OWNER":
        if not document.area_id:
            return None
        area = db.query(models.Area).filter_by(id=document.area_id).first()
        return area.owner_id if area else None
    if source_kind == "UNIT_OWNER":
        if not document.unit_id:
            return None
        unit = db.query(models.Unit).filter_by(id=document.unit_id).first()
        return unit.owner_id if unit else None
    return None


def _collect_reviewers(document: models.Document, db) -> list:
    """
    Return list of (contact_id, role_label, source_kind) for every applicable
    source that has a live reviewer. Sources with no assigned contact are
    omitted (the caller will treat those as auto-approved).

    No collapsing: the same contact appears multiple times if they hold
    several roles on the same document. Each role gets its own DocumentReview row.
    """
    out: list = []
    for kind, label in _source_kinds_for_doc(document):
        cid = _resolve_live_contact(kind, document, db)
        if cid:
            out.append((cid, label, kind))
    return out


def _check_launch_prereqs(document: models.Document, db):
    """Raise HTTPException if area/unit review is required but owner is missing."""
    if document.require_area_review and document.area_id:
        area = db.query(models.Area).filter_by(id=document.area_id).first()
        if not area or not area.owner_id:
            raise HTTPException(400, "Area review is required but no Area Owner is assigned")
    if document.require_unit_review and document.unit_id:
        unit = db.query(models.Unit).filter_by(id=document.unit_id).first()
        if not unit or not unit.owner_id:
            raise HTTPException(400, "Unit review is required but no Unit Owner is assigned")


def sweep_auto_approve_cleared_sources(doc_ids: Optional[List[int]] = None, db: Session = None):
    """
    Reconcile PENDING DocumentReview rows on IN_REVIEW documents against the
    current live reviewer assignments:

    1. **Cleared sources** — a PENDING row exists but its source_kind no longer
       resolves to a live contact (e.g. Package PMC Technical was cleared while
       a review was still pending). Auto-approve the row. Mirrors the
       auto-approve-missing-reviewer behaviour in ITP/SC/Invoice/PR flows.

    2. **Added sources** — a source_kind applies to the document (per
       _source_kinds_for_doc) and has a live contact, but no row exists for it
       on the current version yet. Create a new PENDING row. This lets an
       admin/owner enable area/unit review or assign an area owner after launch
       and have the new reviewer's action point appear immediately.

    Call after any update that can change Package/Subservice/Area/Unit
    reviewer ownership OR document-level flags (area_id, unit_id,
    require_area_review, require_unit_review, document_type). Pass a list of
    affected document IDs; an empty list is a no-op.
    """
    if db is None or doc_ids is None:
        return
    if not doc_ids:
        return

    docs = db.query(models.Document).filter(
        models.Document.id.in_(doc_ids),
        models.Document.status == "IN_REVIEW",
    ).all()
    touched_versions = set()  # (doc_id, version)
    now = datetime.utcnow()

    for doc in docs:
        existing = db.query(models.DocumentReview).filter_by(
            document_id=doc.id, version=doc.current_version
        ).all()
        by_kind = {}
        for r in existing:
            if r.source_kind:
                by_kind.setdefault(r.source_kind, []).append(r)

        expected = _source_kinds_for_doc(doc)

        # ── Direction A: clear → auto-approve any PENDING rows whose source
        # is no longer live.
        for r in existing:
            if r.status != "PENDING" or not r.source_kind:
                continue
            live_cid = _resolve_live_contact(r.source_kind, doc, db)
            if live_cid:
                continue
            r.status = "APPROVED"
            r.comment = "No reviewer assigned — auto-approved"
            r.reviewed_at = now
            r.reviewed_by_id = None
            r.reviewer_contact_id = None
            touched_versions.add((doc.id, doc.current_version))

        # ── Direction B: add → create a new PENDING row for any expected
        # source_kind that now has a live contact but has never had a row
        # on the current version (i.e. the source was enabled / an owner was
        # assigned after launch).
        for kind, label in expected:
            rows_for_kind = by_kind.get(kind, [])
            if rows_for_kind:
                continue  # already tracked (decided or pending)
            live_cid = _resolve_live_contact(kind, doc, db)
            if not live_cid:
                continue
            db.add(models.DocumentReview(
                document_id=doc.id,
                version=doc.current_version,
                reviewer_contact_id=live_cid,
                reviewer_role=label,
                source_kind=kind,
                status="PENDING",
            ))

    # Re-evaluate each touched version so the parent doc status rolls forward
    # if all pending rows are now resolved (direction A) — direction B by
    # definition leaves a PENDING row in place.
    for doc_id, ver in touched_versions:
        doc = db.query(models.Document).filter_by(id=doc_id).first()
        if doc:
            _complete_version_if_done(doc, ver, db)


def _complete_version_if_done(document: models.Document, version: int, db):
    """After a review is submitted, check if all reviews are complete and update statuses."""
    reviews = db.query(models.DocumentReview).filter_by(
        document_id=document.id, version=version
    ).all()
    if not reviews:
        return
    pending = [r for r in reviews if r.status == "PENDING"]
    rejected = [r for r in reviews if r.status == "REJECTED"]
    awc     = [r for r in reviews if r.status == "APPROVED_WITH_COMMENTS"]
    if pending:
        return  # Still waiting

    ver_row = db.query(models.DocumentVersion).filter_by(
        document_id=document.id, version=version
    ).first()
    now = datetime.utcnow()
    if rejected:
        new_status = "REJECTED"
    elif awc:
        new_status = "APPROVED_WITH_COMMENTS"
    else:
        new_status = "APPROVED"
    if ver_row:
        ver_row.status = new_status
        ver_row.completed_at = now
    document.status = new_status
    if new_status in ("APPROVED", "APPROVED_WITH_COMMENTS"):
        document.last_approved_version = version
        _create_receipts_for_document(document, version, db)


def _create_receipts_for_document(document: models.Document, version: int, db):
    """Create receipt rows for all distribution packages when a document is approved."""
    try:
        dist_ids = json.loads(document.distribution_package_ids or "[]")
    except Exception:
        dist_ids = []
    # Only distribution packages — owning package doesn't need to acknowledge
    all_pkg_ids = list(set(dist_ids) - {document.package_id})
    for pkg_id in all_pkg_ids:
        existing = db.query(models.DocumentReceipt).filter_by(
            document_id=document.id, version=version, package_id=pkg_id
        ).first()
        if not existing:
            db.add(models.DocumentReceipt(
                document_id=document.id,
                version=version,
                package_id=pkg_id,
            ))


# ─────────────────────────────────────────────────────────────────────────────
# Formatters
# ─────────────────────────────────────────────────────────────────────────────

def _fmt_receipt(r: models.DocumentReceipt):
    return {
        "id": r.id,
        "document_id": r.document_id,
        "version": r.version,
        "package_id": r.package_id,
        "package_tag": r.package.tag_number if r.package else None,
        "package_name": r.package.name if r.package else None,
        "acknowledged": r.acknowledged,
        "acknowledged_at": r.acknowledged_at.isoformat() + 'Z' if r.acknowledged_at else None,
        "acknowledged_by_name": r.acknowledged_by.name if r.acknowledged_by else None,
    }


def _fmt_doc(doc: models.Document, db, include_reviews=False, as_distribution=False):
    """
    Format a document for API response.
    as_distribution=True: the caller has access via a distribution package, not the origin package.
    In that case, expose the last approved version's state rather than the current working state,
    so that distribution contacts always see a stable approved view even when a new revision is
    being drafted or reviewed.
    """
    try:
        dist_ids = json.loads(doc.distribution_package_ids or "[]")
    except Exception:
        dist_ids = []

    # For distribution viewers, show the last approved/AWC version, not the current draft state.
    effective_version = doc.last_approved_version if as_distribution else doc.current_version

    # Resolve the DocumentVersion record ID for the effective version (used for per-version attachments)
    ver_record = db.query(models.DocumentVersion).filter_by(
        document_id=doc.id, version=effective_version
    ).first()
    current_version_id = ver_record.id if ver_record else None

    if as_distribution:
        effective_status = ver_record.status if ver_record else "APPROVED"
    else:
        effective_status = doc.status

    d = {
        "id": doc.id,
        "seq_id": doc.project_seq_id,
        "doc_number": f"DO-{doc.project_seq_id:06d}" if doc.project_seq_id else f"DO-{doc.id:06d}",
        "project_id": doc.project_id,
        "package_id": doc.package_id,
        "package_tag": doc.package.tag_number if doc.package else None,
        "package_name": doc.package.name if doc.package else None,
        "package_owner_id": doc.package.package_owner_id if doc.package else None,
        "subservice_id": doc.subservice_id,
        "subservice_code": doc.subservice.subservice_code if doc.subservice else None,
        "subservice_name": doc.subservice.subservice_name if doc.subservice else None,
        "document_type": doc.document_type,
        "description": doc.description,
        "area_id": doc.area_id,
        "area_tag": doc.area.tag if doc.area else None,
        "unit_id": doc.unit_id,
        "unit_tag": doc.unit.tag if doc.unit else None,
        "require_area_review": doc.require_area_review,
        "require_unit_review": doc.require_unit_review,
        "start_date": doc.start_date,
        "first_issue_date": doc.first_issue_date,
        "approval_due_date": doc.approval_due_date,
        "distribution_package_ids": dist_ids,
        "status": effective_status,
        "current_version": effective_version,
        "last_approved_version": doc.last_approved_version,
        "current_version_id": current_version_id,
        "distribution_view": as_distribution,
        "weight": doc.weight if doc.weight is not None else 8,
        "actual_start_date": doc.actual_start_date,
        "actual_start_by_name": doc.actual_start_by.name if doc.actual_start_by else None,
        "created_at": doc.created_at.isoformat() + 'Z' if doc.created_at else None,
        "created_by_name": doc.created_by.name if doc.created_by else None,
        "updated_at": doc.updated_at.isoformat() + 'Z' if doc.updated_at else None,
    }
    # Best milestone ever reached — never decreases even after new version is created
    versions = db.query(models.DocumentVersion).filter_by(document_id=doc.id).all()
    all_ver_statuses = {v.status for v in versions}
    has_launched = any(v.launched_at for v in versions)
    if "APPROVED" in all_ver_statuses:
        best_milestone = "APPROVED"
    elif "APPROVED_WITH_COMMENTS" in all_ver_statuses:
        best_milestone = "APPROVED_WITH_COMMENTS"
    elif has_launched or doc.status == "IN_REVIEW":
        best_milestone = "FIRST_ISSUED"
    elif doc.actual_start_date:
        best_milestone = "STARTED"
    else:
        best_milestone = "NOT_STARTED"
    d["best_milestone"] = best_milestone
    # Count of comments still in OPEN status across all versions — surfaced in
    # the document list so reviewers can see outstanding items at a glance.
    d["open_comments_count"] = db.query(models.DocumentComment).filter_by(
        document_id=doc.id, status="OPEN"
    ).count()

    if include_reviews:
        reviews = db.query(models.DocumentReview).filter_by(
            document_id=doc.id, version=effective_version
        ).all()
        d["reviews"] = [_fmt_review(r, db, doc) for r in reviews]

    # Include receipts if document has been approved
    if doc.last_approved_version is not None:
        receipts = db.query(models.DocumentReceipt).filter_by(
            document_id=doc.id, version=doc.last_approved_version
        ).all()
        d["receipts"] = [_fmt_receipt(r) for r in receipts]
    else:
        d["receipts"] = []

    return d


def _fmt_review(r: models.DocumentReview, db=None, document: Optional[models.Document] = None):
    """
    For PENDING rows: resolve the reviewer contact live from source_kind so that a
    reassignment of the Package/Subservice/Area/Unit reviewer is reflected without
    touching the stored row. For decided rows: use the frozen snapshot on the row.
    """
    live_contact_id = r.reviewer_contact_id
    live_contact = r.reviewer_contact
    if r.status == "PENDING" and r.source_kind and document is not None and db is not None:
        resolved = _resolve_live_contact(r.source_kind, document, db)
        if resolved and resolved != r.reviewer_contact_id:
            live_contact_id = resolved
            live_contact = db.query(models.Contact).filter_by(id=resolved).first()
        elif resolved is None:
            live_contact_id = None
            live_contact = None
    return {
        "id": r.id,
        "reviewer_contact_id": live_contact_id,
        "reviewer_name": live_contact.name if live_contact else None,
        "reviewer_role": r.reviewer_role,
        "source_kind": r.source_kind,
        "status": r.status,
        "comment": r.comment,
        "reviewed_at": r.reviewed_at.isoformat() + 'Z' if r.reviewed_at else None,
        "reviewed_by_name": r.reviewed_by.name if r.reviewed_by else None,
    }


def _fmt_version(v: models.DocumentVersion, db):
    reviews = db.query(models.DocumentReview).filter_by(
        document_id=v.document_id, version=v.version
    ).all()
    doc = db.query(models.Document).filter_by(id=v.document_id).first()
    return {
        "id": v.id,
        "version": v.version,
        "status": v.status,
        "launched_at": v.launched_at.isoformat() + 'Z' if v.launched_at else None,
        "launched_by_name": v.launched_by.name if v.launched_by else None,
        "completed_at": v.completed_at.isoformat() + 'Z' if v.completed_at else None,
        "reviews": [_fmt_review(r, db, doc) for r in reviews],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────────────────────────────────────

class DocumentCreate(BaseModel):
    package_id: int
    subservice_id: int
    document_type: str          # TECHNICAL | COMMERCIAL
    description: str
    area_id: Optional[int] = None
    unit_id: Optional[int] = None
    require_area_review: bool = False
    require_unit_review: bool = False
    start_date: Optional[str] = None
    first_issue_date: Optional[str] = None
    approval_due_date: Optional[str] = None
    distribution_package_ids: List[int] = []
    weight: int = 8


class DocumentUpdate(DocumentCreate):
    updated_at: Optional[str] = None


class ReviewBody(BaseModel):
    review_status: str  # APPROVED | APPROVED_WITH_COMMENTS | REJECTED
    comment: str


class OverrideBody(BaseModel):
    override_status: str  # APPROVED | APPROVED_WITH_COMMENTS | REJECTED
    comment: Optional[str] = ""


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("")
def list_documents(
    package_id: Optional[int] = None,
    status: Optional[str] = None,
    document_type: Optional[str] = None,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Bidders do not have access to Document Management")

    visible_pkg_ids = _visible_package_ids(user, db)

    if visible_pkg_ids is not None:
        # Restricted role (VENDOR): show own-package docs + approved distribution docs.
        if not visible_pkg_ids:
            return []

        # 1. Own-package documents (all statuses)
        own_q = db.query(models.Document).filter(
            models.Document.project_id == user.project_id,
            models.Document.package_id.in_(visible_pkg_ids),
        )
        if package_id:
            own_q = own_q.filter(models.Document.package_id == package_id)
        if status:
            own_q = own_q.filter(models.Document.status == status)
        if document_type:
            own_q = own_q.filter(models.Document.document_type == document_type)
        own_docs = own_q.all()
        own_ids = {d.id for d in own_docs}

        # 2. Distribution documents: approved (last_approved_version set), distributed to their packages,
        #    and NOT already included in own_docs.
        dist_candidates = db.query(models.Document).filter(
            models.Document.project_id == user.project_id,
            models.Document.last_approved_version.isnot(None),
            models.Document.package_id.notin_(visible_pkg_ids),
        ).all()

        dist_docs = []
        for d in dist_candidates:
            if d.id in own_ids:
                continue
            try:
                d_pkg_ids = set(json.loads(d.distribution_package_ids or "[]"))
            except Exception:
                d_pkg_ids = set()
            if d_pkg_ids & visible_pkg_ids:  # intersection: at least one shared package
                dist_docs.append(d)

        # Apply filters to distribution docs (effective status is APPROVED or APPROVED_WITH_COMMENTS)
        if package_id:
            dist_docs = [d for d in dist_docs if d.package_id == package_id]
        if status:
            if status not in ("APPROVED", "APPROVED_WITH_COMMENTS"):
                dist_docs = []
            else:
                # Filter by effective status of the last approved version
                filtered_dist = []
                for d in dist_docs:
                    ver = db.query(models.DocumentVersion).filter_by(
                        document_id=d.id, version=d.last_approved_version
                    ).first()
                    if ver and ver.status == status:
                        filtered_dist.append(d)
                dist_docs = filtered_dist
        if document_type:
            dist_docs = [d for d in dist_docs if d.document_type == document_type]

        result = [_fmt_doc(d, db) for d in own_docs]
        result += [_fmt_doc(d, db, as_distribution=True) for d in dist_docs]
        result.sort(key=lambda x: x["id"], reverse=True)
        return result

    # Unrestricted roles (ADMIN, PROJECT_OWNER, PROJECT_TEAM, CLIENT): standard query
    q = db.query(models.Document).filter(models.Document.project_id == user.project_id)
    if package_id:
        q = q.filter(models.Document.package_id == package_id)
    if status:
        q = q.filter(models.Document.status == status)
    if document_type:
        q = q.filter(models.Document.document_type == document_type)
    docs = q.order_by(models.Document.id.desc()).all()
    return [_fmt_doc(d, db) for d in docs]


@router.get("/my-pending-reviews")
def my_pending_reviews(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Pending document reviews assigned to the current user (by live contact lookup)."""
    if not user.contact_id:
        return []
    # Self-heal any stale row sets before evaluating — covers the case where
    # a Package/Subservice/Area/Unit reviewer was assigned after launch and
    # the corresponding PENDING row hadn't been created yet.
    in_review_ids = [
        d.id for d in db.query(models.Document.id).filter(
            models.Document.project_id == user.project_id,
            models.Document.status == "IN_REVIEW",
        ).all()
    ]
    if in_review_ids:
        sweep_auto_approve_cleared_sources(in_review_ids, db=db)
        db.commit()
    # Pull all PENDING rows in the user's project and match by live source resolution.
    # This way a reviewer swap on a Package/Subservice/Area/Unit is reflected
    # immediately without having to rewrite row snapshots.
    pending = (
        db.query(models.DocumentReview)
        .join(models.Document, models.Document.id == models.DocumentReview.document_id)
        .filter(
            models.DocumentReview.status == "PENDING",
            models.Document.project_id == user.project_id,
        )
        .all()
    )
    result = []
    seen_docs = set()
    for r in pending:
        doc = db.query(models.Document).filter_by(id=r.document_id).first()
        if not doc or doc.project_id != user.project_id:
            continue
        if r.source_kind:
            live_cid = _resolve_live_contact(r.source_kind, doc, db)
        else:
            live_cid = r.reviewer_contact_id
        if live_cid != user.contact_id:
            continue
        # Collapse duplicates for the same document — one action-point per doc,
        # not per role. The submit endpoint handles all of the user's rows at once.
        if r.document_id in seen_docs:
            continue
        seen_docs.add(r.document_id)
        result.append({
            "review_id": r.id,
            "document_id": r.document_id,
            "doc_number": f"DO-{doc.id:06d}",
            "description": doc.description,
            "package_id": doc.package_id,
            "package_tag": doc.package.tag_number if doc.package else None,
            "package_name": doc.package.name if doc.package else None,
            "subservice_code": doc.subservice.subservice_code if doc.subservice else None,
            "subservice_name": doc.subservice.subservice_name if doc.subservice else None,
            "document_type": doc.document_type,
            "version": r.version,
            "reviewer_role": r.reviewer_role,
        })
    return result


@router.get("/approval-overview")
def approval_overview(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """All IN_REVIEW documents with their reviews, scoped by user visibility."""
    if user.role == "BIDDER":
        raise HTTPException(403, "Access denied")
    visible_pkg_ids = _visible_package_ids(user, db)
    q = db.query(models.Document).filter(
        models.Document.project_id == user.project_id,
        models.Document.status == "IN_REVIEW",
    )
    if visible_pkg_ids is not None:
        if not visible_pkg_ids:
            return []
        q = q.filter(models.Document.package_id.in_(visible_pkg_ids))
    docs = q.order_by(models.Document.id.desc()).all()
    # Self-heal stale review rows so action-points / approvals tab reflects
    # the current Package/Subservice/Area/Unit reviewer assignments.
    if docs:
        sweep_auto_approve_cleared_sources([d.id for d in docs], db=db)
        db.commit()
        docs = q.order_by(models.Document.id.desc()).all()
    return [_fmt_doc(d, db, include_reviews=True) for d in docs]


@router.get("/my-rejected")
def get_my_rejected(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Rejected documents the current user is responsible for resubmitting —
    anyone who has write permission on the owning package (admins, project
    owners, the package owner, or users linked to the package contact list)."""
    if user.role == "BIDDER":
        return []
    docs = db.query(models.Document).filter(
        models.Document.project_id == user.project_id,
        models.Document.status == "REJECTED",
    ).order_by(models.Document.id.desc()).all()
    result = []
    for d in docs:
        pkg = d.package
        if not pkg:
            continue
        if _can_write_doc(user, pkg, db):
            result.append(_fmt_doc(d, db))
    return result


@router.get("/all-comments")
def list_all_comments(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """All comments across all documents the user can see. For the Comment Log tab."""
    if user.role in ("BIDDER", "VENDOR"):
        raise HTTPException(403, "No access")
    vis = _visible_package_ids(user, db)
    q = db.query(models.DocumentComment).join(models.Document).filter(
        models.Document.project_id == user.project_id
    )
    if vis is not None:
        q = q.filter(models.Document.package_id.in_(vis))
    if status:
        q = q.filter(models.DocumentComment.status == status)
    comments = q.order_by(models.DocumentComment.created_at.desc()).all()
    result = []
    for c in comments:
        d = _fmt_comment(c)
        doc = c.document
        d["doc_number"] = f"DO-{doc.project_seq_id:06d}" if doc and doc.project_seq_id else f"DO-{c.document_id:06d}"
        d["doc_description"] = c.document.description if c.document else None
        result.append(d)
    return result


@router.post("")
def create_document(
    body: DocumentCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Access denied")

    if body.document_type not in ("TECHNICAL", "COMMERCIAL"):
        raise HTTPException(400, "document_type must be TECHNICAL or COMMERCIAL")
    if not body.description.strip():
        raise HTTPException(400, "Description is required")

    pkg = db.query(models.Package).filter_by(id=body.package_id, project_id=user.project_id).first()
    if not pkg:
        raise HTTPException(404, "Package not found")
    ss = db.query(models.Subservice).filter_by(id=body.subservice_id, project_id=user.project_id).first()
    if not ss:
        raise HTTPException(404, "Sub-service not found")

    if not _can_write_doc(user, pkg, db):
        raise HTTPException(403, "You are not authorized to create documents for this package")

    doc = models.Document(
        project_id=user.project_id,
        project_seq_id=models.next_project_seq(db, models.Document, user.project_id),
        package_id=body.package_id,
        subservice_id=body.subservice_id,
        document_type=body.document_type,
        description=body.description.strip(),
        area_id=body.area_id or None,
        unit_id=body.unit_id or None,
        require_area_review=body.require_area_review,
        require_unit_review=body.require_unit_review,
        start_date=body.start_date or None,
        first_issue_date=body.first_issue_date or None,
        approval_due_date=body.approval_due_date or None,
        distribution_package_ids=json.dumps(body.distribution_package_ids),
        weight=body.weight if body.weight else 8,
        status="NOT_STARTED",
        current_version=0,
        created_by_id=user.id,
        created_at=datetime.utcnow(),
    )
    db.add(doc)
    db.flush()  # get doc.id before commit
    # Create the initial version record so attachments can be linked immediately
    db.add(models.DocumentVersion(
        document_id=doc.id,
        version=0,
        status="NOT_STARTED",
    ))
    db.commit()
    db.refresh(doc)
    doc = db.query(models.Document).filter_by(id=doc.id).first()
    return _fmt_doc(doc, db)


@router.put("/{doc_id}")
def update_document(
    doc_id: int,
    body: DocumentUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    doc = db.query(models.Document).filter_by(id=doc_id, project_id=user.project_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    pkg = doc.package
    if not _can_write_doc(user, pkg, db):
        raise HTTPException(403, "Not authorized to edit this document")
    if doc.status == "IN_REVIEW" and not auth.has_owner_or_lead_access(user, "Document Management", db) and not _user_is_package_owner(user, pkg):
        raise HTTPException(400, "Cannot edit a document that is currently in review")

    check_lock(doc.updated_at, body.updated_at, "document")

    if body.document_type not in ("TECHNICAL", "COMMERCIAL"):
        raise HTTPException(400, "document_type must be TECHNICAL or COMMERCIAL")
    if not body.description.strip():
        raise HTTPException(400, "Description is required")

    # If changing package, re-check write permission on new package
    if body.package_id != doc.package_id:
        new_pkg = db.query(models.Package).filter_by(id=body.package_id, project_id=user.project_id).first()
        if not new_pkg:
            raise HTTPException(404, "Package not found")
        if not _can_write_doc(user, new_pkg, db):
            raise HTTPException(403, "Not authorized to move document to this package")

    was_in_review = doc.status == "IN_REVIEW"

    doc.package_id = body.package_id
    doc.subservice_id = body.subservice_id
    doc.document_type = body.document_type
    doc.description = body.description.strip()
    doc.area_id = body.area_id or None
    doc.unit_id = body.unit_id or None
    doc.require_area_review = body.require_area_review
    doc.require_unit_review = body.require_unit_review
    doc.start_date = body.start_date or None
    doc.first_issue_date = body.first_issue_date or None
    doc.approval_due_date = body.approval_due_date or None
    doc.distribution_package_ids = json.dumps(body.distribution_package_ids)
    doc.weight = body.weight if body.weight else 8
    doc.updated_at = datetime.utcnow()
    doc.updated_by_id = user.id
    db.commit()

    # If the document is in review, reconcile review rows against the new
    # field values: e.g. the editor just enabled require_area_review and
    # picked an area with an owner → add a new PENDING row for that owner.
    if was_in_review:
        sweep_auto_approve_cleared_sources([doc_id], db=db)
        db.commit()

    doc = db.query(models.Document).filter_by(id=doc_id).first()
    return _fmt_doc(doc, db)


@router.delete("/{doc_id}")
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    doc = db.query(models.Document).filter_by(id=doc_id, project_id=user.project_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    pkg = doc.package
    if not auth.has_owner_or_lead_access(user, "Document Management", db) and not _user_is_package_owner(user, pkg):
        raise HTTPException(403, "Only Project Owners or Package Owners can delete documents")
    comment_ids = [c.id for c in db.query(models.DocumentComment.id).filter_by(document_id=doc_id).all()]
    if comment_ids:
        db.query(models.DocumentCommentNote).filter(models.DocumentCommentNote.comment_id.in_(comment_ids)).delete(synchronize_session=False)
        db.query(models.DocumentCommentVersionLink).filter(models.DocumentCommentVersionLink.comment_id.in_(comment_ids)).delete(synchronize_session=False)
        db.query(models.DocumentComment).filter_by(document_id=doc_id).delete(synchronize_session=False)
    db.query(models.DocumentReview).filter_by(document_id=doc_id).delete()
    db.query(models.DocumentVersion).filter_by(document_id=doc_id).delete()
    db.delete(doc)
    db.commit()
    return {"ok": True}


@router.get("/dashboard")
def get_dashboard(
    package_id: Optional[int] = None,
    subservice_id: Optional[int] = None,
    area_id: Optional[int] = None,
    unit_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Return status counts (by package/subservice/area/unit), totals, S-curve data and filter options."""
    if user.role == "BIDDER":
        raise HTTPException(403, "Access denied")

    visible_pkg_ids = _visible_package_ids(user, db)

    # ── Base query (visibility-restricted, unfiltered) for building filter options ──
    base_q = db.query(models.Document).filter(models.Document.project_id == user.project_id)
    if visible_pkg_ids is not None:
        if not visible_pkg_ids:
            return {
                "by_package": [], "by_subservice": [], "by_area": [], "by_unit": [],
                "totals": {"NOT_STARTED": 0, "IN_PROGRESS": 0, "IN_REVIEW": 0, "APPROVED": 0, "APPROVED_WITH_COMMENTS": 0, "REJECTED": 0},
                "prior_approval_counts": {"NOT_STARTED": {"APPROVED": 0, "APPROVED_WITH_COMMENTS": 0}, "IN_PROGRESS": {"APPROVED": 0, "APPROVED_WITH_COMMENTS": 0}, "IN_REVIEW": {"APPROVED": 0, "APPROVED_WITH_COMMENTS": 0}, "REJECTED": {"APPROVED": 0, "APPROVED_WITH_COMMENTS": 0}},
                "scurve_docs": [], "filter_options": {"packages": [], "subservices": [], "areas": [], "units": []},
            }
        base_q = base_q.filter(models.Document.package_id.in_(visible_pkg_ids))
    all_docs = base_q.all()

    # ── Filtered query (used for counts + S-curve) ───────────────────────────
    filtered_docs = all_docs
    if package_id is not None:
        filtered_docs = [d for d in filtered_docs if d.package_id == package_id]
    if subservice_id is not None:
        filtered_docs = [d for d in filtered_docs if d.subservice_id == subservice_id]
    if area_id is not None:
        filtered_docs = [d for d in filtered_docs if d.area_id == area_id]
    if unit_id is not None:
        filtered_docs = [d for d in filtered_docs if d.unit_id == unit_id]

    # ── Pre-compute late flags per document ─────────────────────────────────
    # Three "late" categories:
    #   late_start         : actual_start_date later than planned start_date
    #                        (or actual missing AND planned in the past)
    #   late_first_issue   : v1 launched_at later than first_issue_date
    #                        (or v1 not launched yet AND planned in the past)
    #   late_approval      : first fully-APPROVED version completed_at later
    #                        than approval_due_date (or no approval yet AND
    #                        planned in the past)
    today_iso = date.today().isoformat()
    filtered_ids = [d.id for d in filtered_docs]
    versions_by_doc: dict[int, list] = {}
    if filtered_ids:
        for v in (db.query(models.DocumentVersion)
                    .filter(models.DocumentVersion.document_id.in_(filtered_ids))
                    .order_by(models.DocumentVersion.document_id, models.DocumentVersion.version)
                    .all()):
            versions_by_doc.setdefault(v.document_id, []).append(v)

    def _is_late_start(doc) -> bool:
        # Only late while the step is still pending: not yet started AND target date passed.
        if not doc.start_date:
            return False
        if doc.actual_start_date:
            return False
        return doc.start_date < today_iso

    def _is_late_first_issue(doc) -> bool:
        # Only late while v1 has not yet been launched AND target date passed.
        if not doc.first_issue_date:
            return False
        v1 = next((v for v in versions_by_doc.get(doc.id, []) if v.version == 1), None)
        if v1 and v1.launched_at:
            return False
        return doc.first_issue_date < today_iso

    def _is_late_approval(doc) -> bool:
        # Only late while no version has yet been approved AND target date passed.
        if not doc.approval_due_date:
            return False
        first_appr = next(
            (v for v in versions_by_doc.get(doc.id, [])
             if v.status == "APPROVED" and v.completed_at),
            None,
        )
        if first_appr:
            return False
        return doc.approval_due_date < today_iso

    late_flags = {
        d.id: {
            "late_start":        _is_late_start(d),
            "late_first_issue":  _is_late_first_issue(d),
            "late_approval":     _is_late_approval(d),
        }
        for d in filtered_docs
    }

    # ── Status counts by package ─────────────────────────────────────────────
    pkg_map: dict = {}
    for doc in filtered_docs:
        pid = doc.package_id
        if pid not in pkg_map:
            pkg_map[pid] = {
                "id": pid,
                "tag": doc.package.tag_number if doc.package else str(pid),
                "name": doc.package.name if doc.package else None,
                "NOT_STARTED": 0, "IN_PROGRESS": 0, "IN_REVIEW": 0, "APPROVED": 0, "REJECTED": 0,
                "open_comments": 0,
                "late_start": 0, "late_first_issue": 0, "late_approval": 0,
            }
        pkg_map[pid][doc.status] = pkg_map[pid].get(doc.status, 0) + 1
        flags = late_flags.get(doc.id, {})
        if flags.get("late_start"):       pkg_map[pid]["late_start"]       += 1
        if flags.get("late_first_issue"): pkg_map[pid]["late_first_issue"] += 1
        if flags.get("late_approval"):    pkg_map[pid]["late_approval"]    += 1

    # Open-comment counts per package across the filtered document set.
    filtered_ids = [d.id for d in filtered_docs]
    if filtered_ids:
        rows = (
            db.query(models.Document.package_id, func.count(models.DocumentComment.id))
              .join(models.DocumentComment, models.DocumentComment.document_id == models.Document.id)
              .filter(
                  models.Document.id.in_(filtered_ids),
                  models.DocumentComment.status == "OPEN",
              )
              .group_by(models.Document.package_id)
              .all()
        )
        for pid, cnt in rows:
            if pid in pkg_map:
                pkg_map[pid]["open_comments"] = cnt

    # ── Status counts by subservice ──────────────────────────────────────────
    ss_map: dict = {}
    for doc in filtered_docs:
        sid = doc.subservice_id
        if sid not in ss_map:
            ss_map[sid] = {
                "id": sid,
                "code": doc.subservice.subservice_code if doc.subservice else str(sid),
                "name": doc.subservice.subservice_name if doc.subservice else None,
                "NOT_STARTED": 0, "IN_PROGRESS": 0, "IN_REVIEW": 0, "APPROVED": 0, "REJECTED": 0,
                "late_start": 0, "late_first_issue": 0, "late_approval": 0,
            }
        ss_map[sid][doc.status] = ss_map[sid].get(doc.status, 0) + 1
        flags = late_flags.get(doc.id, {})
        if flags.get("late_start"):       ss_map[sid]["late_start"]       += 1
        if flags.get("late_first_issue"): ss_map[sid]["late_first_issue"] += 1
        if flags.get("late_approval"):    ss_map[sid]["late_approval"]    += 1

    # ── Status counts by area (only docs with area assigned) ─────────────────
    area_map: dict = {}
    for doc in filtered_docs:
        if not doc.area_id:
            continue
        aid = doc.area_id
        if aid not in area_map:
            area_map[aid] = {
                "id": aid,
                "tag": doc.area.tag if doc.area else str(aid),
                "NOT_STARTED": 0, "IN_PROGRESS": 0, "IN_REVIEW": 0, "APPROVED": 0, "REJECTED": 0,
                "late_start": 0, "late_first_issue": 0, "late_approval": 0,
            }
        area_map[aid][doc.status] = area_map[aid].get(doc.status, 0) + 1
        flags = late_flags.get(doc.id, {})
        if flags.get("late_start"):       area_map[aid]["late_start"]       += 1
        if flags.get("late_first_issue"): area_map[aid]["late_first_issue"] += 1
        if flags.get("late_approval"):    area_map[aid]["late_approval"]    += 1

    # ── Status counts by unit (only docs with unit assigned) ─────────────────
    unit_map: dict = {}
    for doc in filtered_docs:
        if not doc.unit_id:
            continue
        uid = doc.unit_id
        if uid not in unit_map:
            unit_map[uid] = {
                "id": uid,
                "tag": doc.unit.tag if doc.unit else str(uid),
                "NOT_STARTED": 0, "IN_PROGRESS": 0, "IN_REVIEW": 0, "APPROVED": 0, "REJECTED": 0,
                "late_start": 0, "late_first_issue": 0, "late_approval": 0,
            }
        unit_map[uid][doc.status] = unit_map[uid].get(doc.status, 0) + 1
        flags = late_flags.get(doc.id, {})
        if flags.get("late_start"):       unit_map[uid]["late_start"]       += 1
        if flags.get("late_first_issue"): unit_map[uid]["late_first_issue"] += 1
        if flags.get("late_approval"):    unit_map[uid]["late_approval"]    += 1

    # ── Totals ───────────────────────────────────────────────────────────────
    totals = {"NOT_STARTED": 0, "IN_PROGRESS": 0, "IN_REVIEW": 0, "APPROVED": 0, "APPROVED_WITH_COMMENTS": 0, "REJECTED": 0}
    for doc in filtered_docs:
        totals[doc.status] = totals.get(doc.status, 0) + 1

    # ── Prior approval counts ────────────────────────────────────────────────
    # For documents that are *currently* not in an approved state, count how
    # many of them have at least one earlier version that was APPROVED or
    # APPROVED_WITH_COMMENTS. Surfaced in the dashboard cards as small notes
    # so users can see why an in-review doc may not move the S-curve again
    # — the S-curve is based on each document's *first* approval.
    prior_approval_counts = {
        "NOT_STARTED": {"APPROVED": 0, "APPROVED_WITH_COMMENTS": 0},
        "IN_PROGRESS": {"APPROVED": 0, "APPROVED_WITH_COMMENTS": 0},
        "IN_REVIEW":   {"APPROVED": 0, "APPROVED_WITH_COMMENTS": 0},
        "REJECTED":    {"APPROVED": 0, "APPROVED_WITH_COMMENTS": 0},
    }
    for doc in filtered_docs:
        bucket = prior_approval_counts.get(doc.status)
        if bucket is None:
            continue
        versions = versions_by_doc.get(doc.id, [])
        if any(v.status == "APPROVED" for v in versions):
            bucket["APPROVED"] += 1
        if any(v.status == "APPROVED_WITH_COMMENTS" for v in versions):
            bucket["APPROVED_WITH_COMMENTS"] += 1

    # ── S-curve documents ────────────────────────────────────────────────────
    scurve_docs = []
    for doc in filtered_docs:
        launched_at = None
        ver = (db.query(models.DocumentVersion)
               .filter_by(document_id=doc.id)
               .order_by(models.DocumentVersion.version.asc())
               .first())
        if ver and ver.launched_at:
            launched_at = ver.launched_at.strftime("%Y-%m-%d")

        approved_at = None
        approved_ver = (db.query(models.DocumentVersion)
                        .filter(
                            models.DocumentVersion.document_id == doc.id,
                            models.DocumentVersion.status == "APPROVED"
                        )
                        .order_by(models.DocumentVersion.version.desc())
                        .first())
        if approved_ver and approved_ver.completed_at:
            approved_at = approved_ver.completed_at.strftime("%Y-%m-%d")

        awc_at = None
        awc_ver = (db.query(models.DocumentVersion)
                   .filter_by(document_id=doc.id, status="APPROVED_WITH_COMMENTS")
                   .order_by(models.DocumentVersion.version.desc())
                   .first())
        if awc_ver and awc_ver.completed_at:
            awc_at = awc_ver.completed_at.strftime("%Y-%m-%d")

        scurve_docs.append({
            "id": doc.id,
            "weight": doc.weight if doc.weight is not None else 8,
            "start_date": doc.start_date,
            "first_issue_date": doc.first_issue_date,
            "approval_due_date": doc.approval_due_date,
            "actual_start_date": doc.actual_start_date,
            "actual_first_issue_date": launched_at,
            "actual_awc_date": awc_at,
            "actual_approval_date": approved_at,
        })

    # ── Filter options (derived from full unfiltered set) ────────────────────
    seen_pkg = {}; seen_ss = {}; seen_area = {}; seen_unit = {}
    for doc in all_docs:
        if doc.package_id and doc.package_id not in seen_pkg:
            seen_pkg[doc.package_id] = {
                "id": doc.package_id,
                "tag": doc.package.tag_number if doc.package else str(doc.package_id),
                "name": doc.package.name if doc.package else None,
            }
        if doc.subservice_id and doc.subservice_id not in seen_ss:
            seen_ss[doc.subservice_id] = {
                "id": doc.subservice_id,
                "code": doc.subservice.subservice_code if doc.subservice else str(doc.subservice_id),
                "name": doc.subservice.subservice_name if doc.subservice else None,
            }
        if doc.area_id and doc.area_id not in seen_area:
            seen_area[doc.area_id] = {
                "id": doc.area_id,
                "tag": doc.area.tag if doc.area else str(doc.area_id),
            }
        if doc.unit_id and doc.unit_id not in seen_unit:
            seen_unit[doc.unit_id] = {
                "id": doc.unit_id,
                "tag": doc.unit.tag if doc.unit else str(doc.unit_id),
            }

    # ── Open-comments trend (weekly, respecting current filters) ─────────────
    # Each comment contributes +1 at its creation week; CLOSED/RESOLVED
    # comments contribute -1 at their updated_at week (proxy for close time).
    # Cumulative "open" count at the end of each week is what we plot.
    timeline: list = []
    if filtered_ids:
        comments = (
            db.query(models.DocumentComment)
              .filter(models.DocumentComment.document_id.in_(filtered_ids))
              .all()
        )
        events: list = []  # (date, +1 | -1)
        for c in comments:
            if c.created_at:
                events.append((c.created_at.date(), 1))
            if c.status in ("CLOSED", "RESOLVED") and c.updated_at:
                events.append((c.updated_at.date(), -1))
        if events:
            def week_start(d: date) -> date:
                return d - timedelta(days=d.weekday())  # Monday
            weekly: dict = defaultdict(lambda: {"opened": 0, "closed": 0})
            for d, sign in events:
                key = week_start(d).isoformat()
                if sign > 0:
                    weekly[key]["opened"] += 1
                else:
                    weekly[key]["closed"] += 1
            first_ws = week_start(min(e[0] for e in events))
            last_ws = max(week_start(max(e[0] for e in events)), week_start(date.today()))
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
        "by_package":    sorted(pkg_map.values(),  key=lambda x: x["tag"]),
        "by_subservice": sorted(ss_map.values(),   key=lambda x: x["code"]),
        "by_area":       sorted(area_map.values(), key=lambda x: x["tag"]),
        "by_unit":       sorted(unit_map.values(), key=lambda x: x["tag"]),
        "totals":        totals,
        "prior_approval_counts": prior_approval_counts,
        "scurve_docs":   scurve_docs,
        "open_comments_timeline": timeline,
        "filter_options": {
            "packages":    sorted(seen_pkg.values(),  key=lambda x: x["tag"]),
            "subservices": sorted(seen_ss.values(),   key=lambda x: x["code"]),
            "areas":       sorted(seen_area.values(), key=lambda x: x["tag"]),
            "units":       sorted(seen_unit.values(), key=lambda x: x["tag"]),
        },
    }


@router.get("/{doc_id}")
def get_document(
    doc_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Access denied")
    doc = db.query(models.Document).filter_by(id=doc_id, project_id=user.project_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    # Self-heal stale review rows: if the document was launched before a
    # Package/Subservice/Area/Unit reviewer was assigned (or before the
    # source_kind logic was in place), reconcile now so the viewer sees the
    # correct set of approval lines.
    if doc.status == "IN_REVIEW":
        sweep_auto_approve_cleared_sources([doc.id], db=db)
        db.commit()
        doc = db.query(models.Document).filter_by(id=doc_id).first()

    visible_pkg_ids = _visible_package_ids(user, db)
    if visible_pkg_ids is not None:
        # Restricted role: check direct package access or distribution access
        if doc.package_id in visible_pkg_ids:
            return _fmt_doc(doc, db, include_reviews=True)
        # Check distribution access: document must be approved and distributed to one of their packages
        if doc.last_approved_version is not None:
            try:
                d_pkg_ids = set(json.loads(doc.distribution_package_ids or "[]"))
            except Exception:
                d_pkg_ids = set()
            if d_pkg_ids & visible_pkg_ids:
                return _fmt_doc(doc, db, include_reviews=False, as_distribution=True)
        raise HTTPException(403, "You do not have access to this document")

    return _fmt_doc(doc, db, include_reviews=True)


@router.get("/{doc_id}/history")
def get_history(
    doc_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Access denied")
    doc = db.query(models.Document).filter_by(id=doc_id, project_id=user.project_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    versions = db.query(models.DocumentVersion).filter_by(document_id=doc_id).order_by(
        models.DocumentVersion.version.desc()
    ).all()
    return [_fmt_version(v, db) for v in versions]


@router.post("/{doc_id}/launch")
def launch_approval(
    doc_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    doc = db.query(models.Document).filter_by(id=doc_id, project_id=user.project_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.status not in ("NOT_STARTED", "IN_PROGRESS"):
        raise HTTPException(400, f"Cannot launch approval: document is currently {doc.status}")

    pkg = doc.package
    if not _can_launch(user, pkg, db):
        raise HTTPException(403, "You are not authorized to launch the approval workflow for this document")

    _check_launch_prereqs(doc, db)

    reviewer_list = _collect_reviewers(doc, db)
    if not reviewer_list:
        raise HTTPException(400, "No reviewers found. Assign reviewers to the package and sub-service first.")

    now = datetime.utcnow()
    # Update the existing version record (created at new_version / create_document time).
    # Fall back to creating one for documents that pre-date this logic.
    ver = db.query(models.DocumentVersion).filter_by(
        document_id=doc.id, version=doc.current_version
    ).first()
    if ver:
        ver.status = "IN_REVIEW"
        ver.launched_at = now
        ver.launched_by_id = user.id
    else:
        ver = models.DocumentVersion(
            document_id=doc.id,
            version=doc.current_version,
            status="IN_REVIEW",
            launched_at=now,
            launched_by_id=user.id,
        )
        db.add(ver)

    # Create one review row per live source. Sources with no assigned contact
    # are simply skipped (treated as auto-approved by omission).
    for contact_id, role_label, source_kind in reviewer_list:
        db.add(models.DocumentReview(
            document_id=doc.id,
            version=doc.current_version,
            reviewer_contact_id=contact_id,
            reviewer_role=role_label,
            source_kind=source_kind,
            status="PENDING",
        ))

    doc.status = "IN_REVIEW"
    doc.updated_at = now
    doc.updated_by_id = user.id
    db.commit()
    doc = db.query(models.Document).filter_by(id=doc_id).first()
    return _fmt_doc(doc, db, include_reviews=True)


@router.post("/{doc_id}/review")
def submit_review(
    doc_id: int,
    body: ReviewBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not user.contact_id:
        raise HTTPException(403, "Your user account is not linked to a contact")
    doc = db.query(models.Document).filter_by(id=doc_id, project_id=user.project_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.status != "IN_REVIEW":
        raise HTTPException(400, "Document is not currently in review")

    if not body.comment.strip():
        raise HTTPException(400, "A comment is required when submitting a review")
    if body.review_status not in ("APPROVED", "APPROVED_WITH_COMMENTS", "REJECTED"):
        raise HTTPException(400, "Invalid review_status")

    # Find every PENDING row on the current version whose live-resolved contact
    # is this user. One user may hold multiple roles (e.g. Package PMC Technical
    # + Subservice PMC); in that case all of their pending rows are decided by
    # this one submission with identical status + comment.
    pending = db.query(models.DocumentReview).filter_by(
        document_id=doc_id,
        version=doc.current_version,
        status="PENDING",
    ).all()
    mine = []
    for r in pending:
        if r.source_kind:
            live_cid = _resolve_live_contact(r.source_kind, doc, db)
        else:
            live_cid = r.reviewer_contact_id  # legacy row with no source_kind
        if live_cid == user.contact_id:
            mine.append(r)
    if not mine:
        raise HTTPException(403, "You are not a pending reviewer for this document")

    now = datetime.utcnow()
    for review in mine:
        review.status = body.review_status
        review.comment = body.comment.strip()
        review.reviewed_at = now
        review.reviewed_by_id = user.id
        # Freeze the snapshot to the actual decider (in case the source's live
        # holder changed between launch and decision).
        review.reviewer_contact_id = user.contact_id

    _complete_version_if_done(doc, doc.current_version, db)
    doc.updated_at = now
    db.commit()
    doc = db.query(models.Document).filter_by(id=doc_id).first()
    return _fmt_doc(doc, db, include_reviews=True)


@router.post("/{doc_id}/override")
def override_approval(
    doc_id: int,
    body: OverrideBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    doc = db.query(models.Document).filter_by(id=doc_id, project_id=user.project_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.status not in ("IN_REVIEW", "REJECTED"):
        raise HTTPException(400, "Override is only applicable to documents IN_REVIEW or REJECTED")

    pkg = doc.package
    is_pkg_owner = _user_is_package_owner(user, pkg)
    if not auth.has_owner_or_lead_access(user, "Document Management", db) and not is_pkg_owner:
        raise HTTPException(403, "Only Project Owners or the Package Owner can override")

    if body.override_status not in ("APPROVED", "APPROVED_WITH_COMMENTS", "REJECTED"):
        raise HTTPException(400, "Invalid override_status")

    new_status = body.override_status
    status_label = {"APPROVED": "approved", "APPROVED_WITH_COMMENTS": "approved with comments", "REJECTED": "rejected"}[new_status]
    override_comment = (body.comment or "").strip() or f"Overridden ({status_label}) by {user.name}"

    now = datetime.utcnow()
    # Mark all pending reviews with the override decision. The snapshot row's
    # reviewer_contact_id is kept as-is (the override is attributed via
    # reviewed_by_id — the contact snapshot still records who was on the hook).
    db.query(models.DocumentReview).filter_by(
        document_id=doc_id,
        version=doc.current_version,
        status="PENDING",
    ).update({"status": new_status, "comment": override_comment, "reviewed_at": now, "reviewed_by_id": user.id})

    # Update version record
    ver = db.query(models.DocumentVersion).filter_by(document_id=doc_id, version=doc.current_version).first()
    if ver:
        ver.status = new_status
        ver.completed_at = now

    doc.status = new_status
    if new_status in ("APPROVED", "APPROVED_WITH_COMMENTS"):
        doc.last_approved_version = doc.current_version
        _create_receipts_for_document(doc, doc.current_version, db)
    doc.updated_at = now
    doc.updated_by_id = user.id
    db.commit()
    doc = db.query(models.Document).filter_by(id=doc_id).first()
    return _fmt_doc(doc, db, include_reviews=True)


@router.post("/{doc_id}/new-version")
def new_version(
    doc_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    doc = db.query(models.Document).filter_by(id=doc_id, project_id=user.project_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.status == "IN_REVIEW":
        raise HTTPException(400, "Cannot create a new version while the document is in review")
    if doc.status in ("NOT_STARTED", "IN_PROGRESS"):
        raise HTTPException(400, "Launch the current version first before creating a new one")

    pkg = doc.package
    if not _can_write_doc(user, pkg, db):
        raise HTTPException(403, "Not authorized to create a new version of this document")

    doc.current_version += 1
    doc.status = "NOT_STARTED"
    doc.updated_at = datetime.utcnow()
    doc.updated_by_id = user.id
    # Create version record immediately so attachments can be linked before launch
    db.add(models.DocumentVersion(
        document_id=doc.id,
        version=doc.current_version,
        status="NOT_STARTED",
    ))
    db.commit()
    doc = db.query(models.Document).filter_by(id=doc_id).first()
    return _fmt_doc(doc, db)


@router.post("/{doc_id}/start")
def start_document(
    doc_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Record the actual start date for a document (user clicks the Start button)."""
    if user.role == "BIDDER":
        raise HTTPException(403, "Access denied")
    doc = db.query(models.Document).filter_by(id=doc_id, project_id=user.project_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.status != "NOT_STARTED":
        raise HTTPException(400, "Document has already been started")
    pkg = doc.package
    if not _can_launch(user, pkg, db):
        raise HTTPException(403, "Not authorized to start this document")
    doc.status = "IN_PROGRESS"
    doc.actual_start_date = datetime.utcnow().strftime("%Y-%m-%d")
    doc.actual_start_by_id = user.id
    doc.updated_at = datetime.utcnow()
    db.commit()
    doc = db.query(models.Document).filter_by(id=doc_id).first()
    return _fmt_doc(doc, db)



@router.get("/{doc_id}/preview-reviewers")
def preview_reviewers(
    doc_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Return what reviewers would be assigned if approval were launched now."""
    doc = db.query(models.Document).filter_by(id=doc_id, project_id=user.project_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    reviewers = _collect_reviewers(doc, db)
    result = []
    for contact_id, role_label, _source_kind in reviewers:
        c = db.query(models.Contact).filter_by(id=contact_id).first()
        result.append({"contact_id": contact_id, "name": c.name if c else f"#{contact_id}", "role": role_label})
    return result


# ─── Document Comment Log ────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    text: str
    page_number: Optional[int] = None
    version: Optional[int] = None


class CommentUpdate(BaseModel):
    text: Optional[str] = None
    status: Optional[str] = None
    updated_at: Optional[str] = None


class CommentNoteCreate(BaseModel):
    content: str


class CommentVersionLinkBody(BaseModel):
    version: int


def _can_view_document(user, doc, db) -> bool:
    """Check if user can view this document (used for comment access)."""
    if user.role == "BIDDER":
        return False
    vis = _visible_package_ids(user, db)
    if vis is not None and doc.package_id not in vis:
        # Vendors also see documents distributed to their packages
        dist_ids = json.loads(doc.distribution_package_ids or "[]")
        if not (vis & set(dist_ids)):
            return False
    return True


def _fmt_comment(c):
    return {
        "id": c.id,
        "document_id": c.document_id,
        "version": c.version,
        "text": c.text,
        "author_id": c.author_id,
        "author_name": c.author.name if c.author else None,
        "status": c.status,
        "page_number": c.page_number,
        "package_id": c.package_id,
        "created_at": c.created_at.isoformat() + 'Z' if c.created_at else None,
        "updated_at": c.updated_at.isoformat() + 'Z' if c.updated_at else None,
        "notes": [
            {
                "id": n.id,
                "content": n.content,
                "author_id": n.author_id,
                "author_name": n.author.name if n.author else None,
                "created_at": n.created_at.isoformat() + 'Z' if n.created_at else None,
            }
            for n in (c.notes or [])
        ],
        "version_links": [
            {
                "version": vl.version,
                "linked_by_name": vl.linked_by.name if vl.linked_by else None,
                "linked_at": vl.linked_at.isoformat() + 'Z' if vl.linked_at else None,
            }
            for vl in (c.version_links or [])
        ],
    }


@router.get("/{doc_id}/comments")
def list_comments(
    doc_id: int,
    version: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "No access")
    doc = db.query(models.Document).filter_by(id=doc_id, project_id=user.project_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    if not _can_view_document(user, doc, db):
        raise HTTPException(403, "No access to this document")

    q = db.query(models.DocumentComment).filter_by(document_id=doc_id)

    if version is not None:
        # Comments created at this version OR linked to this version
        linked_ids = [
            r[0] for r in db.query(models.DocumentCommentVersionLink.comment_id).filter_by(version=version).all()
        ]
        if linked_ids:
            q = q.filter(or_(
                models.DocumentComment.version == version,
                models.DocumentComment.id.in_(linked_ids),
            ))
        else:
            q = q.filter(models.DocumentComment.version == version)

    if status:
        q = q.filter(models.DocumentComment.status == status)

    comments = q.order_by(models.DocumentComment.created_at.desc()).all()
    return [_fmt_comment(c) for c in comments]


@router.post("/{doc_id}/comments")
def create_comment(
    doc_id: int,
    body: CommentCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "No access")
    doc = db.query(models.Document).filter_by(id=doc_id, project_id=user.project_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    if not _can_view_document(user, doc, db):
        raise HTTPException(403, "No access to this document")
    if not body.text or not body.text.strip():
        raise HTTPException(400, "Comment text is required")

    version = body.version if body.version is not None else doc.current_version

    # For vendors, stamp their package_id
    pkg_id = None
    if user.role == "VENDOR" and user.contact_id:
        pkg_id = doc.package_id

    comment = models.DocumentComment(
        document_id=doc_id,
        version=version,
        text=body.text.strip(),
        author_id=user.id,
        status="OPEN",
        page_number=body.page_number,
        package_id=pkg_id,
        created_at=datetime.utcnow(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    comment = db.query(models.DocumentComment).filter_by(id=comment.id).first()
    return _fmt_comment(comment)


@router.put("/{doc_id}/comments/{comment_id}")
def update_comment(
    doc_id: int,
    comment_id: int,
    body: CommentUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "No access")
    comment = db.query(models.DocumentComment).filter_by(id=comment_id, document_id=doc_id).first()
    if not comment:
        raise HTTPException(404, "Comment not found")

    check_lock(comment.updated_at, body.updated_at, "comment")

    # Permission for status change
    if body.status and body.status != comment.status:
        if user.role in ("ADMIN", "PROJECT_OWNER", "PROJECT_TEAM", "CLIENT"):
            pass  # allowed
        elif user.id == comment.author_id:
            pass  # author can change own comment status
        elif user.role == "VENDOR":
            # Vendors can only close their own comments linked to same package
            if comment.author_id != user.id:
                raise HTTPException(403, "Vendors can only close their own comments")
            if comment.package_id:
                vis = _visible_package_ids(user, db)
                if vis is not None and comment.package_id not in vis:
                    raise HTTPException(403, "Not authorized for this package")
        else:
            raise HTTPException(403, "Not authorized to change comment status")
        comment.status = body.status

    if body.text is not None:
        if user.id != comment.author_id and not auth.has_owner_or_lead_access(user, "Document Management", db):
            raise HTTPException(403, "Only the author or admins can edit comment text")
        comment.text = body.text.strip()

    comment.updated_at = datetime.utcnow()
    db.commit()
    comment = db.query(models.DocumentComment).filter_by(id=comment_id).first()
    return _fmt_comment(comment)


@router.delete("/{doc_id}/comments/{comment_id}")
def delete_comment(
    doc_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    comment = db.query(models.DocumentComment).filter_by(id=comment_id, document_id=doc_id).first()
    if not comment:
        raise HTTPException(404, "Comment not found")
    if not auth.has_owner_or_lead_access(user, "Document Management", db) and user.id != comment.author_id:
        raise HTTPException(403, "Only the author or admins can delete comments")
    db.query(models.DocumentCommentNote).filter_by(comment_id=comment_id).delete()
    db.query(models.DocumentCommentVersionLink).filter_by(comment_id=comment_id).delete()
    db.delete(comment)
    db.commit()
    return {"ok": True}


@router.post("/{doc_id}/comments/{comment_id}/notes")
def add_comment_note(
    doc_id: int,
    comment_id: int,
    body: CommentNoteCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "No access")
    comment = db.query(models.DocumentComment).filter_by(id=comment_id, document_id=doc_id).first()
    if not comment:
        raise HTTPException(404, "Comment not found")
    if not body.content or not body.content.strip():
        raise HTTPException(400, "Note content is required")
    note = models.DocumentCommentNote(
        comment_id=comment_id,
        content=body.content.strip(),
        author_id=user.id,
        created_at=datetime.utcnow(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return {
        "id": note.id,
        "content": note.content,
        "author_id": note.author_id,
        "author_name": note.author.name if note.author else None,
        "created_at": note.created_at.isoformat() + 'Z' if note.created_at else None,
    }


@router.post("/{doc_id}/comments/{comment_id}/link-version")
def link_comment_version(
    doc_id: int,
    comment_id: int,
    body: CommentVersionLinkBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "No access")
    comment = db.query(models.DocumentComment).filter_by(id=comment_id, document_id=doc_id).first()
    if not comment:
        raise HTTPException(404, "Comment not found")
    # Verify version exists
    doc = db.query(models.Document).filter_by(id=doc_id).first()
    if body.version > doc.current_version:
        raise HTTPException(400, f"Version {body.version} does not exist yet")
    if body.version <= comment.version:
        raise HTTPException(400, "Can only link to a newer version")
    # Check for duplicate
    existing = db.query(models.DocumentCommentVersionLink).filter_by(
        comment_id=comment_id, version=body.version
    ).first()
    if existing:
        raise HTTPException(400, "Comment is already linked to this version")
    link = models.DocumentCommentVersionLink(
        comment_id=comment_id,
        version=body.version,
        linked_by_id=user.id,
        linked_at=datetime.utcnow(),
    )
    db.add(link)
    db.commit()
    comment = db.query(models.DocumentComment).filter_by(id=comment_id).first()
    return _fmt_comment(comment)


@router.delete("/{doc_id}/comments/{comment_id}/link-version/{version}")
def unlink_comment_version(
    doc_id: int,
    comment_id: int,
    version: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    link = db.query(models.DocumentCommentVersionLink).filter_by(
        comment_id=comment_id, version=version
    ).first()
    if not link:
        raise HTTPException(404, "Version link not found")
    db.delete(link)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Document Receipt Acknowledgment
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{doc_id}/receipts")
def get_receipts(
    doc_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    doc = db.query(models.Document).filter_by(id=doc_id, project_id=user.project_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    version = doc.last_approved_version
    if version is None:
        return []
    receipts = db.query(models.DocumentReceipt).filter_by(
        document_id=doc_id, version=version
    ).all()
    return [_fmt_receipt(r) for r in receipts]


@router.post("/{doc_id}/receipts/{package_id}/acknowledge")
def acknowledge_receipt(
    doc_id: int,
    package_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    doc = db.query(models.Document).filter_by(id=doc_id, project_id=user.project_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.last_approved_version is None:
        raise HTTPException(400, "Document has not been approved yet")

    receipt = db.query(models.DocumentReceipt).filter_by(
        document_id=doc_id, version=doc.last_approved_version, package_id=package_id
    ).first()
    if not receipt:
        raise HTTPException(404, "No receipt record found for this package")
    if receipt.acknowledged:
        return _fmt_receipt(receipt)  # already acknowledged

    receipt.acknowledged = True
    receipt.acknowledged_at = datetime.utcnow()
    receipt.acknowledged_by_id = user.id
    db.commit()
    return _fmt_receipt(receipt)


@router.get("/receipts/pending")
def get_all_pending_receipts(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    q = (
        db.query(models.DocumentReceipt)
        .join(models.Document, models.DocumentReceipt.document_id == models.Document.id)
        .filter(
            models.Document.project_id == user.project_id,
            models.DocumentReceipt.acknowledged == False,
        )
    )
    # Non-admin/owner users only see receipts for packages they're linked to
    if not auth.has_owner_or_lead_access(user, "Document Management", db):
        if not user.contact_id:
            return []
        cid = user.contact_id
        # Packages where user is owner or linked contact
        owned_pkg_ids = [p.id for p in db.query(models.Package).filter(
            models.Package.project_id == user.project_id,
            models.Package.package_owner_id == cid,
        ).all()]
        linked_pkg_ids = [pc.package_id for pc in db.query(models.PackageContact).filter(
            models.PackageContact.contact_id == cid,
        ).all()]
        my_pkg_ids = list(set(owned_pkg_ids + linked_pkg_ids))
        if not my_pkg_ids:
            return []
        q = q.filter(models.DocumentReceipt.package_id.in_(my_pkg_ids))

    receipts = q.all()
    result = []
    for r in receipts:
        doc = db.query(models.Document).filter_by(id=r.document_id).first()
        d = _fmt_receipt(r)
        d["doc_number"] = f"DO-{doc.project_seq_id:06d}" if doc and doc.project_seq_id else f"DO-{r.document_id:06d}"
        d["doc_description"] = doc.description if doc else None
        d["doc_status"] = doc.status if doc else None
        d["origin_package_tag"] = doc.package.tag_number if doc and doc.package else None
        result.append(d)
    return result
