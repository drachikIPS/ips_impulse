"""
Safety module — setup (Safety Observation Categories) + Observations
workflow (DRAFT → SUBMITTED → RECEIVED → CLOSED, with re-open back to
SUBMITTED). All endpoints are tenant-isolated per project.
"""
from datetime import datetime, date, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from routers.audit import audit_dict, check_lock, set_created, set_updated
import models
import auth

router = APIRouter(prefix="/api/safety", tags=["safety"])


def _is_owner_or_admin(user: auth.ProjectContext, db: Session) -> bool:
    return auth.has_owner_or_lead_access(user, "Safety", db)


def _vendor_visible_package_ids(user: auth.ProjectContext, db: Session) -> List[int]:
    """Package IDs in the project that a vendor can see — those they are
    linked to as package_owner, account_manager, or via package_contacts.
    Used to scope safety records the same way other modules do."""
    if not user.contact_id:
        return []
    rows = (
        db.query(models.Package.id)
          .outerjoin(models.PackageContact,
                     models.PackageContact.package_id == models.Package.id)
          .filter(
              models.Package.project_id == user.project_id,
              or_(
                  models.Package.package_owner_id == user.contact_id,
                  models.Package.account_manager_id == user.contact_id,
                  models.PackageContact.contact_id == user.contact_id,
              ),
          )
          .distinct()
          .all()
    )
    return [r[0] for r in rows]


class SetupItemCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: Optional[int] = None
    polarity: Optional[str] = None   # POSITIVE | NEGATIVE


class SetupItemUpdate(SetupItemCreate):
    pass


def _fmt_category(r: models.SafetyObservationCategory) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "description": r.description or "",
        "sort_order": r.sort_order or 0,
        "polarity": (r.polarity or "NEGATIVE").upper(),
    }


@router.get("/setup/observation-categories")
def list_categories(db: Session = Depends(get_db),
                    user: auth.ProjectContext = Depends(auth.get_project_user)):
    rows = (
        db.query(models.SafetyObservationCategory)
          .filter_by(project_id=user.project_id)
          .order_by(models.SafetyObservationCategory.sort_order,
                    models.SafetyObservationCategory.id)
          .all()
    )
    return [_fmt_category(r) for r in rows]


@router.post("/setup/observation-categories")
def create_category(body: SetupItemCreate,
                    db: Session = Depends(get_db),
                    user: auth.ProjectContext = Depends(auth.get_project_user)):
    if not _is_owner_or_admin(user, db):
        raise HTTPException(403, "Only project owners can edit setup lists")
    if not body.name.strip():
        raise HTTPException(400, "Name is required")
    existing = db.query(models.SafetyObservationCategory).filter_by(project_id=user.project_id).all()
    next_order = body.sort_order if body.sort_order is not None else (
        (max((r.sort_order or 0) for r in existing) + 1) if existing else 0
    )
    polarity = (body.polarity or "NEGATIVE").upper()
    if polarity not in ("POSITIVE", "NEGATIVE"):
        polarity = "NEGATIVE"
    row = models.SafetyObservationCategory(
        project_id=user.project_id,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        polarity=polarity,
        sort_order=next_order,
    )
    db.add(row); db.commit(); db.refresh(row)
    return _fmt_category(row)


@router.put("/setup/observation-categories/{item_id}")
def update_category(item_id: int, body: SetupItemUpdate,
                    db: Session = Depends(get_db),
                    user: auth.ProjectContext = Depends(auth.get_project_user)):
    if not _is_owner_or_admin(user, db):
        raise HTTPException(403, "Only project owners can edit setup lists")
    row = db.query(models.SafetyObservationCategory).filter_by(
        id=item_id, project_id=user.project_id).first()
    if not row:
        raise HTTPException(404, "Category not found")
    if not body.name.strip():
        raise HTTPException(400, "Name is required")
    row.name = body.name.strip()
    row.description = (body.description or "").strip() or None
    if body.sort_order is not None:
        row.sort_order = body.sort_order
    if body.polarity is not None:
        p = body.polarity.upper()
        row.polarity = p if p in ("POSITIVE", "NEGATIVE") else "NEGATIVE"
    db.commit(); db.refresh(row)
    return _fmt_category(row)


@router.delete("/setup/observation-categories/{item_id}")
def delete_category(item_id: int,
                    db: Session = Depends(get_db),
                    user: auth.ProjectContext = Depends(auth.get_project_user)):
    if not _is_owner_or_admin(user, db):
        raise HTTPException(403, "Only project owners can edit setup lists")
    row = db.query(models.SafetyObservationCategory).filter_by(
        id=item_id, project_id=user.project_id).first()
    if not row:
        raise HTTPException(404, "Category not found")
    db.delete(row); db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Severity Classes  —  level 1 = worst, ascending = less severe
# ─────────────────────────────────────────────────────────────────────────────

class SeverityClassCreate(BaseModel):
    name: str
    description: Optional[str] = None
    level: Optional[int] = None


class SeverityClassUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    level: Optional[int] = None
    updated_at: Optional[str] = None


def _fmt_severity_class(s: "models.SafetySeverityClass") -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "description": s.description or "",
        "level": s.level,
        **audit_dict(s),
    }


@router.get("/setup/severity-classes")
def list_severity_classes(db: Session = Depends(get_db),
                          user: auth.ProjectContext = Depends(auth.get_project_user)):
    rows = (
        db.query(models.SafetySeverityClass)
          .filter_by(project_id=user.project_id)
          .order_by(models.SafetySeverityClass.level, models.SafetySeverityClass.id)
          .all()
    )
    return [_fmt_severity_class(r) for r in rows]


@router.post("/setup/severity-classes")
def create_severity_class(body: SeverityClassCreate,
                          db: Session = Depends(get_db),
                          user: auth.ProjectContext = Depends(auth.get_project_user)):
    if not _is_owner_or_admin(user, db):
        raise HTTPException(403, "Only project owners can edit setup lists")
    if not (body.name or "").strip():
        raise HTTPException(400, "Name is required")
    existing = db.query(models.SafetySeverityClass).filter_by(project_id=user.project_id).all()
    next_level = body.level if body.level is not None else (
        (max((r.level or 0) for r in existing) + 1) if existing else 1
    )
    row = models.SafetySeverityClass(
        project_id=user.project_id,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        level=int(next_level),
    )
    set_created(row, user.id)
    db.add(row); db.commit(); db.refresh(row)
    return _fmt_severity_class(row)


@router.put("/setup/severity-classes/{item_id}")
def update_severity_class(item_id: int, body: SeverityClassUpdate,
                          db: Session = Depends(get_db),
                          user: auth.ProjectContext = Depends(auth.get_project_user)):
    if not _is_owner_or_admin(user, db):
        raise HTTPException(403, "Only project owners can edit setup lists")
    row = db.query(models.SafetySeverityClass).filter_by(
        id=item_id, project_id=user.project_id).first()
    if not row:
        raise HTTPException(404, "Severity class not found")
    check_lock(row.updated_at, body.updated_at, "severity class")
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(400, "Name is required")
        row.name = body.name.strip()
    if body.description is not None:
        row.description = body.description.strip() or None
    if body.level is not None:
        row.level = int(body.level)
    set_updated(row, user.id)
    db.commit(); db.refresh(row)
    return _fmt_severity_class(row)


@router.delete("/setup/severity-classes/{item_id}")
def delete_severity_class(item_id: int,
                          db: Session = Depends(get_db),
                          user: auth.ProjectContext = Depends(auth.get_project_user)):
    if not _is_owner_or_admin(user, db):
        raise HTTPException(403, "Only project owners can edit setup lists")
    row = db.query(models.SafetySeverityClass).filter_by(
        id=item_id, project_id=user.project_id).first()
    if not row:
        raise HTTPException(404, "Severity class not found")
    db.delete(row); db.commit()
    return {"ok": True}


class SeverityReorderBody(BaseModel):
    ids: List[int]


@router.post("/setup/severity-classes/reorder")
def reorder_severity_classes(body: SeverityReorderBody,
                             db: Session = Depends(get_db),
                             user: auth.ProjectContext = Depends(auth.get_project_user)):
    """Renumber the level field according to the order of `ids` (worst first).
    The first id becomes level 1, the second level 2, and so on."""
    if not _is_owner_or_admin(user, db):
        raise HTTPException(403, "Only project owners can edit setup lists")
    rows = (
        db.query(models.SafetySeverityClass)
          .filter(models.SafetySeverityClass.project_id == user.project_id,
                  models.SafetySeverityClass.id.in_(body.ids))
          .all()
    )
    by_id = {r.id: r for r in rows}
    for idx, sid in enumerate(body.ids):
        r = by_id.get(sid)
        if r is not None:
            r.level = idx + 1
            set_updated(r, user.id)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Incident Causes  —  "Other" is protected (cannot be deleted)
# ─────────────────────────────────────────────────────────────────────────────

class IncidentCauseCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: Optional[int] = None


class IncidentCauseUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    updated_at: Optional[str] = None


def _fmt_incident_cause(c: "models.SafetyIncidentCause") -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "description": c.description or "",
        "sort_order": c.sort_order or 0,
        "is_default": bool(c.is_default),
        **audit_dict(c),
    }


@router.get("/setup/incident-causes")
def list_incident_causes(db: Session = Depends(get_db),
                         user: auth.ProjectContext = Depends(auth.get_project_user)):
    rows = (
        db.query(models.SafetyIncidentCause)
          .filter_by(project_id=user.project_id)
          .order_by(models.SafetyIncidentCause.sort_order,
                    models.SafetyIncidentCause.id)
          .all()
    )
    return [_fmt_incident_cause(r) for r in rows]


@router.post("/setup/incident-causes")
def create_incident_cause(body: IncidentCauseCreate,
                          db: Session = Depends(get_db),
                          user: auth.ProjectContext = Depends(auth.get_project_user)):
    if not _is_owner_or_admin(user, db):
        raise HTTPException(403, "Only project owners can edit setup lists")
    if not (body.name or "").strip():
        raise HTTPException(400, "Name is required")
    existing = db.query(models.SafetyIncidentCause).filter_by(project_id=user.project_id).all()
    next_order = body.sort_order if body.sort_order is not None else (
        (max((r.sort_order or 0) for r in existing) + 1) if existing else 0
    )
    row = models.SafetyIncidentCause(
        project_id=user.project_id,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        sort_order=int(next_order),
        is_default=False,
    )
    set_created(row, user.id)
    db.add(row); db.commit(); db.refresh(row)
    return _fmt_incident_cause(row)


@router.put("/setup/incident-causes/{item_id}")
def update_incident_cause(item_id: int, body: IncidentCauseUpdate,
                          db: Session = Depends(get_db),
                          user: auth.ProjectContext = Depends(auth.get_project_user)):
    if not _is_owner_or_admin(user, db):
        raise HTTPException(403, "Only project owners can edit setup lists")
    row = db.query(models.SafetyIncidentCause).filter_by(
        id=item_id, project_id=user.project_id).first()
    if not row:
        raise HTTPException(404, "Incident cause not found")
    check_lock(row.updated_at, body.updated_at, "incident cause")
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(400, "Name is required")
        # Don't let users rename the protected default away — keep it identifiable.
        if row.is_default and body.name.strip() != row.name:
            raise HTTPException(400, "The default 'Other' cause cannot be renamed")
        row.name = body.name.strip()
    if body.description is not None:
        row.description = body.description.strip() or None
    if body.sort_order is not None:
        row.sort_order = int(body.sort_order)
    set_updated(row, user.id)
    db.commit(); db.refresh(row)
    return _fmt_incident_cause(row)


@router.delete("/setup/incident-causes/{item_id}")
def delete_incident_cause(item_id: int,
                          db: Session = Depends(get_db),
                          user: auth.ProjectContext = Depends(auth.get_project_user)):
    if not _is_owner_or_admin(user, db):
        raise HTTPException(403, "Only project owners can edit setup lists")
    row = db.query(models.SafetyIncidentCause).filter_by(
        id=item_id, project_id=user.project_id).first()
    if not row:
        raise HTTPException(404, "Incident cause not found")
    if row.is_default:
        raise HTTPException(400, "The default 'Other' cause cannot be deleted")
    db.delete(row); db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Toolbox Categories  —  "Other" is protected (cannot be deleted or renamed)
# ─────────────────────────────────────────────────────────────────────────────

class ToolboxCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: Optional[int] = None


class ToolboxCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    updated_at: Optional[str] = None


def _fmt_toolbox_category(c: "models.SafetyToolboxCategory") -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "description": c.description or "",
        "sort_order": c.sort_order or 0,
        "is_default": bool(c.is_default),
        **audit_dict(c),
    }


@router.get("/setup/toolbox-categories")
def list_toolbox_categories(db: Session = Depends(get_db),
                            user: auth.ProjectContext = Depends(auth.get_project_user)):
    rows = (
        db.query(models.SafetyToolboxCategory)
          .filter_by(project_id=user.project_id)
          .order_by(models.SafetyToolboxCategory.sort_order,
                    models.SafetyToolboxCategory.id)
          .all()
    )
    return [_fmt_toolbox_category(r) for r in rows]


@router.post("/setup/toolbox-categories")
def create_toolbox_category(body: ToolboxCategoryCreate,
                            db: Session = Depends(get_db),
                            user: auth.ProjectContext = Depends(auth.get_project_user)):
    if not _is_owner_or_admin(user, db):
        raise HTTPException(403, "Only project owners can edit setup lists")
    if not (body.name or "").strip():
        raise HTTPException(400, "Name is required")
    existing = db.query(models.SafetyToolboxCategory).filter_by(project_id=user.project_id).all()
    next_order = body.sort_order if body.sort_order is not None else (
        (max((r.sort_order or 0) for r in existing) + 1) if existing else 0
    )
    row = models.SafetyToolboxCategory(
        project_id=user.project_id,
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        sort_order=int(next_order),
        is_default=False,
    )
    set_created(row, user.id)
    db.add(row); db.commit(); db.refresh(row)
    return _fmt_toolbox_category(row)


@router.put("/setup/toolbox-categories/{item_id}")
def update_toolbox_category(item_id: int, body: ToolboxCategoryUpdate,
                            db: Session = Depends(get_db),
                            user: auth.ProjectContext = Depends(auth.get_project_user)):
    if not _is_owner_or_admin(user, db):
        raise HTTPException(403, "Only project owners can edit setup lists")
    row = db.query(models.SafetyToolboxCategory).filter_by(
        id=item_id, project_id=user.project_id).first()
    if not row:
        raise HTTPException(404, "Toolbox category not found")
    check_lock(row.updated_at, body.updated_at, "toolbox category")
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(400, "Name is required")
        if row.is_default and body.name.strip() != row.name:
            raise HTTPException(400, "The default 'Other' category cannot be renamed")
        row.name = body.name.strip()
    if body.description is not None:
        row.description = body.description.strip() or None
    if body.sort_order is not None:
        row.sort_order = int(body.sort_order)
    set_updated(row, user.id)
    db.commit(); db.refresh(row)
    return _fmt_toolbox_category(row)


@router.delete("/setup/toolbox-categories/{item_id}")
def delete_toolbox_category(item_id: int,
                            db: Session = Depends(get_db),
                            user: auth.ProjectContext = Depends(auth.get_project_user)):
    if not _is_owner_or_admin(user, db):
        raise HTTPException(403, "Only project owners can edit setup lists")
    row = db.query(models.SafetyToolboxCategory).filter_by(
        id=item_id, project_id=user.project_id).first()
    if not row:
        raise HTTPException(404, "Toolbox category not found")
    if row.is_default:
        raise HTTPException(400, "The default 'Other' category cannot be deleted")
    db.delete(row); db.commit()
    return {"ok": True}


# ═════════════════════════════════════════════════════════════════════════════
# Safety Observations — DRAFT → SUBMITTED → RECEIVED → CLOSED (+ re-open)
# ═════════════════════════════════════════════════════════════════════════════

def _is_project_site_supervisor(user: auth.ProjectContext, db: Session) -> bool:
    """True if the user's contact is a site-supervisor on ANY area in this
    project — matches the Project Organization convention."""
    if not user.contact_id:
        return False
    row = (
        db.query(models.AreaSiteSupervisor)
          .join(models.Area, models.Area.id == models.AreaSiteSupervisor.area_id)
          .filter(
              models.Area.project_id == user.project_id,
              models.AreaSiteSupervisor.contact_id == user.contact_id,
          )
          .first()
    )
    return row is not None


def _is_package_contact(user: auth.ProjectContext, package_id: int, db: Session) -> bool:
    """True if the user's contact is linked to the given package — either as
    package_owner, account_manager, or in the package_contacts M2M list."""
    if not user.contact_id:
        return False
    pkg = db.query(models.Package).filter_by(id=package_id, project_id=user.project_id).first()
    if not pkg:
        return False
    if pkg.package_owner_id == user.contact_id:
        return True
    if pkg.account_manager_id == user.contact_id:
        return True
    link = (
        db.query(models.PackageContact)
          .filter_by(package_id=package_id, contact_id=user.contact_id)
          .first()
    )
    return link is not None


def _can_edit_observation(obs: "models.SafetyObservation",
                          user: auth.ProjectContext, db: Session) -> bool:
    """Edit permissions (applies to field-update + delete):
       - Creator can always edit (until CLOSED).
       - Project owner/admin can always edit.
       - Site supervisors (any area in this project) can always edit, including
         DRAFT — they may need to amend or submit on behalf of the creator.
    """
    if user.role == "ADMIN" or user.role == "PROJECT_OWNER":
        return True
    if obs.created_by_id == user.id:
        return True
    if _is_project_site_supervisor(user, db):
        return True
    return False


def _log_obs_event(db: Session, obs: "models.SafetyObservation",
                   event: str, user: auth.ProjectContext,
                   comment: Optional[str] = None) -> None:
    db.add(models.SafetyObservationReview(
        observation_id=obs.id,
        event=event,
        comment=(comment or None),
        actor_id=user.id,
        created_at=datetime.utcnow(),
    ))


def _fmt_contact(c) -> Optional[dict]:
    if not c:
        return None
    return {"id": c.id, "name": c.name}


def _compute_allowed_actions(obs: "models.SafetyObservation",
                             user: Optional[auth.ProjectContext],
                             db: Session) -> List[str]:
    """Which workflow actions are available to the caller on this record."""
    if user is None:
        return []
    actions = []
    is_super = _is_project_site_supervisor(user, db)
    is_pkg_contact = _is_package_contact(user, obs.package_id, db)
    is_po_admin = auth.has_owner_or_lead_access(user, "Safety", db)
    can_edit = _can_edit_observation(obs, user, db) and obs.status != "CLOSED"
    if can_edit:
        actions.append("edit")
    if obs.status == "DRAFT":
        if obs.created_by_id == user.id or is_po_admin or is_super:
            actions.extend(["submit", "delete"])
    elif obs.status == "SUBMITTED":
        if is_pkg_contact or is_po_admin:
            actions.append("acknowledge")
    elif obs.status == "RECEIVED":
        if is_super or is_po_admin:
            actions.extend(["close", "reopen"])
    return actions


def _fmt_observation(obs: "models.SafetyObservation", with_history: bool = False,
                     user: Optional[auth.ProjectContext] = None,
                     db: Optional[Session] = None) -> dict:
    toolbox_count = 0
    if db is not None:
        toolbox_count = (
            db.query(models.SafetyToolboxObservation)
              .filter_by(observation_id=obs.id)
              .count()
        )
    out = {
        "id": obs.id,
        "display_id": f"SO-{(obs.project_seq_id or obs.id):06d}",
        "toolbox_count": toolbox_count,
        "project_seq_id": obs.project_seq_id,
        "status": obs.status,
        "package_id": obs.package_id,
        "package_tag": obs.package.tag_number if obs.package else None,
        "package_name": obs.package.name if obs.package else None,
        "area_id": obs.area_id,
        "area_tag": obs.area.tag if obs.area else None,
        "area_description": obs.area.description if obs.area else None,
        "category_id": obs.category_id,
        "category_name": obs.category.name if obs.category else None,
        "category_polarity": (obs.category.polarity if obs.category else None) or "NEGATIVE",
        "details": obs.details or "",
        "subcontractor_id": obs.subcontractor_id,
        "subcontractor_company": obs.subcontractor.company if obs.subcontractor else None,
        "worker_id": obs.worker_id,
        "worker_name": obs.worker.name if obs.worker else None,
        "remediation_request": obs.remediation_request or "",
        "floorplan_id": obs.floorplan_id,
        "floorplan_name": obs.floorplan.name if obs.floorplan else None,
        "floorplan_x": obs.floorplan_x,
        "floorplan_y": obs.floorplan_y,
        "submitted_at":    obs.submitted_at.isoformat()    + "Z" if obs.submitted_at    else None,
        "acknowledged_at": obs.acknowledged_at.isoformat() + "Z" if obs.acknowledged_at else None,
        "acknowledged_by_name": obs.acknowledged_by.name if obs.acknowledged_by else None,
        "acknowledge_comment": obs.acknowledge_comment or "",
        "closed_at":   obs.closed_at.isoformat() + "Z" if obs.closed_at else None,
        "closed_by_name": obs.closed_by.name if obs.closed_by else None,
        "created_at":  obs.created_at.isoformat() + "Z" if obs.created_at else None,
        "created_by_name": obs.created_by.name if obs.created_by else None,
        "updated_at":  obs.updated_at.isoformat() + "Z" if obs.updated_at else None,
        "updated_by_name": obs.updated_by.name if obs.updated_by else None,
    }
    if user is not None and db is not None:
        out["allowed_actions"] = _compute_allowed_actions(obs, user, db)
    if with_history:
        out["history"] = [{
            "id": h.id,
            "event": h.event,
            "comment": h.comment or "",
            "actor_name": h.actor.name if h.actor else None,
            "created_at": h.created_at.isoformat() + "Z" if h.created_at else None,
        } for h in obs.history]
    return out


class ObservationCreate(BaseModel):
    package_id: int
    area_id: int
    category_id: int
    details: str
    subcontractor_id: Optional[int] = None
    worker_id: Optional[int] = None
    remediation_request: Optional[str] = None
    floorplan_id: Optional[int] = None
    floorplan_x: Optional[float] = None
    floorplan_y: Optional[float] = None


class ObservationUpdate(BaseModel):
    package_id: Optional[int] = None
    area_id: Optional[int] = None
    category_id: Optional[int] = None
    details: Optional[str] = None
    subcontractor_id: Optional[int] = None
    worker_id: Optional[int] = None
    remediation_request: Optional[str] = None
    floorplan_id: Optional[int] = None
    floorplan_x: Optional[float] = None
    floorplan_y: Optional[float] = None
    clear_pin: Optional[bool] = None
    updated_at: Optional[str] = None


class WorkflowBody(BaseModel):
    comment: Optional[str] = None
    updated_at: Optional[str] = None


def _resolve_pin(area_id: int, fp_id: Optional[int],
                 fp_x: Optional[float], fp_y: Optional[float],
                 user: auth.ProjectContext, db: Session):
    """Returns (floorplan_id, x, y) to persist. Validates the pin belongs to
    the area's floorplan and that x/y are normalized to [0,1]. None values
    mean 'no pin'. If fp_x/fp_y are missing while fp_id is given, treat as
    no pin (the user opened then cancelled the picker)."""
    if fp_id is None or fp_x is None or fp_y is None:
        return (None, None, None)
    area = db.query(models.Area).filter_by(id=area_id, project_id=user.project_id).first()
    if not area or area.floorplan_id != fp_id:
        raise HTTPException(400, "Pin floorplan does not match the selected area")
    if not (0.0 <= float(fp_x) <= 1.0) or not (0.0 <= float(fp_y) <= 1.0):
        raise HTTPException(400, "Pin coordinates must be between 0 and 1")
    return (int(fp_id), float(fp_x), float(fp_y))


def _validate_refs(body_pkg: int, body_area: int, body_cat: int,
                   sub_id: Optional[int], worker_id: Optional[int],
                   user: auth.ProjectContext, db: Session) -> None:
    pkg = db.query(models.Package).filter_by(id=body_pkg, project_id=user.project_id).first()
    if not pkg:
        raise HTTPException(400, "Package not found in this project")
    area = db.query(models.Area).filter_by(id=body_area, project_id=user.project_id).first()
    if not area:
        raise HTTPException(400, "Area not found in this project")
    cat = db.query(models.SafetyObservationCategory).filter_by(
        id=body_cat, project_id=user.project_id).first()
    if not cat:
        raise HTTPException(400, "Category not found in this project")
    if sub_id is not None:
        sub = db.query(models.Subcontractor).filter_by(
            id=sub_id, project_id=user.project_id).first()
        if not sub:
            raise HTTPException(400, "Subcontractor not found")
        if sub.package_id != body_pkg:
            raise HTTPException(400, "Subcontractor is not linked to the selected package")
    if worker_id is not None:
        w = db.query(models.Worker).filter_by(
            id=worker_id, project_id=user.project_id).first()
        if not w:
            raise HTTPException(400, "Worker not found")
        if w.package_id != body_pkg:
            raise HTTPException(400, "Worker is not linked to the selected package")


@router.get("/observations")
def list_observations(
    status: Optional[str] = None,
    package_id: Optional[int] = None,
    area_id: Optional[int] = None,
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Bidders cannot view safety observations")
    q = db.query(models.SafetyObservation).filter(
        models.SafetyObservation.project_id == user.project_id
    )
    if user.role == "VENDOR":
        visible = _vendor_visible_package_ids(user, db)
        if not visible:
            return []
        q = q.filter(models.SafetyObservation.package_id.in_(visible))
    if status:
        q = q.filter(models.SafetyObservation.status == status.upper())
    if package_id:
        q = q.filter(models.SafetyObservation.package_id == package_id)
    if area_id:
        q = q.filter(models.SafetyObservation.area_id == area_id)
    if category_id:
        q = q.filter(models.SafetyObservation.category_id == category_id)
    rows = q.order_by(models.SafetyObservation.id.desc()).all()
    return [_fmt_observation(r, user=user, db=db) for r in rows]


@router.get("/observations/my-pending")
def my_pending_observations(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Feeds the My Action Points module:
       - to_acknowledge: SUBMITTED items whose package the current user is
         linked to as a contact (owner / account manager / package_contact).
       - to_review: RECEIVED items (open loop) when the current user is a
         site supervisor on any area of the project.
    """
    if user.role == "BIDDER" or not user.contact_id:
        return {"to_acknowledge": [], "to_review": []}

    is_supervisor = _is_project_site_supervisor(user, db)

    subs_rows = (
        db.query(models.SafetyObservation)
          .filter(
              models.SafetyObservation.project_id == user.project_id,
              models.SafetyObservation.status == "SUBMITTED",
          ).all()
    )
    to_ack = [
        _fmt_observation(o, user=user, db=db) for o in subs_rows
        if _is_package_contact(user, o.package_id, db)
    ]

    to_rev = []
    if is_supervisor:
        rec_rows = (
            db.query(models.SafetyObservation)
              .filter(
                  models.SafetyObservation.project_id == user.project_id,
                  models.SafetyObservation.status == "RECEIVED",
              ).all()
        )
        to_rev = [_fmt_observation(o, user=user, db=db) for o in rec_rows]

    return {"to_acknowledge": to_ack, "to_review": to_rev}


def _assert_vendor_can_see_observation(obs: "models.SafetyObservation",
                                        user: auth.ProjectContext, db: Session) -> None:
    """Vendors can only see observations whose package they are linked to."""
    if user.role != "VENDOR":
        return
    if obs.package_id not in _vendor_visible_package_ids(user, db):
        raise HTTPException(404, "Observation not found")


@router.get("/observations/{obs_id}")
def get_observation(
    obs_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Bidders cannot view safety observations")
    obs = db.query(models.SafetyObservation).filter_by(
        id=obs_id, project_id=user.project_id).first()
    if not obs:
        raise HTTPException(404, "Observation not found")
    _assert_vendor_can_see_observation(obs, user, db)
    return _fmt_observation(obs, with_history=True, user=user, db=db)


@router.post("/observations")
def create_observation(
    body: ObservationCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Bidders cannot create safety observations")
    if user.role == "VENDOR" \
       and body.package_id not in _vendor_visible_package_ids(user, db):
        raise HTTPException(403, "You can only file observations for packages you are linked to")
    if not (body.details or "").strip():
        raise HTTPException(400, "Details are required")
    _validate_refs(body.package_id, body.area_id, body.category_id,
                   body.subcontractor_id, body.worker_id, user, db)
    fp_id, fp_x, fp_y = _resolve_pin(body.area_id, body.floorplan_id,
                                     body.floorplan_x, body.floorplan_y, user, db)
    now = datetime.utcnow()
    obs = models.SafetyObservation(
        project_id=user.project_id,
        project_seq_id=models.next_project_seq(db, models.SafetyObservation, user.project_id),
        package_id=body.package_id,
        area_id=body.area_id,
        category_id=body.category_id,
        details=body.details.strip(),
        subcontractor_id=body.subcontractor_id,
        worker_id=body.worker_id,
        remediation_request=(body.remediation_request or "").strip() or None,
        floorplan_id=fp_id,
        floorplan_x=fp_x,
        floorplan_y=fp_y,
        status="DRAFT",
        created_at=now,
        created_by_id=user.id,
    )
    db.add(obs); db.flush()
    _log_obs_event(db, obs, "CREATED", user)
    db.commit(); db.refresh(obs)
    return _fmt_observation(obs, with_history=True, user=user, db=db)


@router.put("/observations/{obs_id}")
def update_observation(
    obs_id: int,
    body: ObservationUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    obs = db.query(models.SafetyObservation).filter_by(
        id=obs_id, project_id=user.project_id).first()
    if not obs:
        raise HTTPException(404, "Observation not found")
    _assert_vendor_can_see_observation(obs, user, db)
    if not _can_edit_observation(obs, user, db):
        raise HTTPException(403, "You are not allowed to edit this observation")
    if obs.status == "CLOSED":
        raise HTTPException(400, "Closed observations cannot be modified")
    check_lock(obs.updated_at, body.updated_at, "safety observation")

    pkg_id = body.package_id if body.package_id is not None else obs.package_id
    area_id = body.area_id if body.area_id is not None else obs.area_id
    cat_id  = body.category_id if body.category_id is not None else obs.category_id
    sub_id  = body.subcontractor_id if body.subcontractor_id is not None else obs.subcontractor_id
    wrk_id  = body.worker_id if body.worker_id is not None else obs.worker_id
    _validate_refs(pkg_id, area_id, cat_id, sub_id, wrk_id, user, db)

    obs.package_id = pkg_id
    obs.area_id    = area_id
    obs.category_id = cat_id
    # When package changes, drop a worker/subcontractor that no longer matches
    obs.subcontractor_id = sub_id if (sub_id is None or True) else None
    obs.worker_id        = wrk_id if (wrk_id is None or True) else None
    if body.details is not None:
        if not body.details.strip():
            raise HTTPException(400, "Details are required")
        obs.details = body.details.strip()
    if body.remediation_request is not None:
        obs.remediation_request = body.remediation_request.strip() or None

    # Pin handling: explicit clear / explicit set / passive auto-clear if the
    # area's plan no longer matches the currently-stored pin.
    if body.clear_pin:
        obs.floorplan_id = obs.floorplan_x = obs.floorplan_y = None
    elif body.floorplan_id is not None or body.floorplan_x is not None or body.floorplan_y is not None:
        fp_id, fp_x, fp_y = _resolve_pin(area_id, body.floorplan_id,
                                         body.floorplan_x, body.floorplan_y, user, db)
        obs.floorplan_id = fp_id
        obs.floorplan_x  = fp_x
        obs.floorplan_y  = fp_y
    elif obs.floorplan_id is not None:
        # Area changed and no longer covered by the stored pin's floorplan?
        new_area = db.query(models.Area).filter_by(id=area_id, project_id=user.project_id).first()
        if not new_area or new_area.floorplan_id != obs.floorplan_id:
            obs.floorplan_id = obs.floorplan_x = obs.floorplan_y = None

    obs.updated_at = datetime.utcnow()
    obs.updated_by_id = user.id
    db.commit(); db.refresh(obs)
    return _fmt_observation(obs, with_history=True, user=user, db=db)


@router.post("/observations/{obs_id}/submit")
def submit_observation(
    obs_id: int,
    body: WorkflowBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    obs = db.query(models.SafetyObservation).filter_by(
        id=obs_id, project_id=user.project_id).first()
    if not obs:
        raise HTTPException(404, "Observation not found")
    _assert_vendor_can_see_observation(obs, user, db)
    if obs.status not in ("DRAFT",):
        raise HTTPException(400, f"Cannot submit from status {obs.status}")
    if not _can_edit_observation(obs, user, db):
        raise HTTPException(403, "You are not allowed to submit this observation")
    check_lock(obs.updated_at, body.updated_at, "safety observation")
    now = datetime.utcnow()
    obs.status = "SUBMITTED"
    obs.submitted_at = now
    obs.updated_at = now
    obs.updated_by_id = user.id
    _log_obs_event(db, obs, "SUBMITTED", user)
    db.commit(); db.refresh(obs)
    return _fmt_observation(obs, with_history=True, user=user, db=db)


@router.post("/observations/{obs_id}/acknowledge")
def acknowledge_observation(
    obs_id: int,
    body: WorkflowBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    obs = db.query(models.SafetyObservation).filter_by(
        id=obs_id, project_id=user.project_id).first()
    if not obs:
        raise HTTPException(404, "Observation not found")
    _assert_vendor_can_see_observation(obs, user, db)
    if obs.status != "SUBMITTED":
        raise HTTPException(400, f"Cannot acknowledge from status {obs.status}")
    # Allowed: any package contact, OR PO/ADMIN (override).
    if not _is_package_contact(user, obs.package_id, db) \
       and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(403, "Only linked package contacts can acknowledge this observation")
    check_lock(obs.updated_at, body.updated_at, "safety observation")
    now = datetime.utcnow()
    obs.status = "RECEIVED"
    obs.acknowledged_at = now
    obs.acknowledged_by_id = user.id
    obs.acknowledge_comment = (body.comment or "").strip() or None
    obs.updated_at = now
    obs.updated_by_id = user.id
    _log_obs_event(db, obs, "ACKNOWLEDGED", user, comment=obs.acknowledge_comment)
    db.commit(); db.refresh(obs)
    return _fmt_observation(obs, with_history=True, user=user, db=db)


@router.post("/observations/{obs_id}/close")
def close_observation(
    obs_id: int,
    body: WorkflowBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    obs = db.query(models.SafetyObservation).filter_by(
        id=obs_id, project_id=user.project_id).first()
    if not obs:
        raise HTTPException(404, "Observation not found")
    _assert_vendor_can_see_observation(obs, user, db)
    if obs.status != "RECEIVED":
        raise HTTPException(400, f"Cannot close from status {obs.status}")
    if not _is_project_site_supervisor(user, db) \
       and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(403, "Only site supervisors can close observations")
    check_lock(obs.updated_at, body.updated_at, "safety observation")
    now = datetime.utcnow()
    obs.status = "CLOSED"
    obs.closed_at = now
    obs.closed_by_id = user.id
    obs.updated_at = now
    obs.updated_by_id = user.id
    _log_obs_event(db, obs, "CLOSED", user, comment=(body.comment or "").strip() or None)
    db.commit(); db.refresh(obs)
    return _fmt_observation(obs, with_history=True, user=user, db=db)


@router.post("/observations/{obs_id}/reopen")
def reopen_observation(
    obs_id: int,
    body: WorkflowBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    obs = db.query(models.SafetyObservation).filter_by(
        id=obs_id, project_id=user.project_id).first()
    if not obs:
        raise HTTPException(404, "Observation not found")
    _assert_vendor_can_see_observation(obs, user, db)
    if obs.status != "RECEIVED":
        raise HTTPException(400, f"Cannot re-open from status {obs.status}")
    if not _is_project_site_supervisor(user, db) \
       and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(403, "Only site supervisors can re-open observations")
    reason = (body.comment or "").strip()
    if not reason:
        raise HTTPException(400, "A reason is required when re-opening")
    check_lock(obs.updated_at, body.updated_at, "safety observation")
    now = datetime.utcnow()
    obs.status = "SUBMITTED"
    # Clear the previous ack so the ack badge/date don't linger on a re-opened record.
    obs.acknowledged_at = None
    obs.acknowledged_by_id = None
    obs.acknowledge_comment = None
    obs.updated_at = now
    obs.updated_by_id = user.id
    _log_obs_event(db, obs, "REOPENED", user, comment=reason)
    db.commit(); db.refresh(obs)
    return _fmt_observation(obs, with_history=True, user=user, db=db)


@router.delete("/observations/{obs_id}")
def delete_observation(
    obs_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    obs = db.query(models.SafetyObservation).filter_by(
        id=obs_id, project_id=user.project_id).first()
    if not obs:
        raise HTTPException(404, "Observation not found")
    _assert_vendor_can_see_observation(obs, user, db)
    if obs.status != "DRAFT" and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(400, "Only draft observations can be deleted")
    if obs.created_by_id != user.id and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(403, "You are not allowed to delete this observation")
    db.delete(obs); db.commit()
    return {"ok": True}


# ═════════════════════════════════════════════════════════════════════════════
# Safety Incidents
#   DRAFT → UNDER_INVESTIGATION → ACTION_IN_PROGRESS → PENDING_REVIEW → CLOSED
#   (with re-open back to ACTION_IN_PROGRESS)
# ═════════════════════════════════════════════════════════════════════════════

INCIDENT_STATUSES = (
    "DRAFT", "UNDER_INVESTIGATION", "ACTION_IN_PROGRESS",
    "PENDING_REVIEW", "CLOSED",
)


def _assert_vendor_can_see_incident(inc: "models.SafetyIncident",
                                     user: auth.ProjectContext, db: Session) -> None:
    """Vendors can only see incidents whose package they are linked to."""
    if user.role != "VENDOR":
        return
    if inc.package_id not in _vendor_visible_package_ids(user, db):
        raise HTTPException(404, "Incident not found")


def _is_area_site_supervisor(user: auth.ProjectContext, area_id: int, db: Session) -> bool:
    """True if the user's contact is a site-supervisor on the given area."""
    if not user.contact_id:
        return False
    row = (
        db.query(models.AreaSiteSupervisor)
          .filter_by(area_id=area_id, contact_id=user.contact_id)
          .first()
    )
    return row is not None


def _can_create_incident_for_package(user: auth.ProjectContext, package_id: int,
                                     db: Session) -> bool:
    """Vendors must be linked to the package; everyone else (non-bidders) is OK."""
    if user.role == "BIDDER":
        return False
    if auth.has_owner_or_lead_access(user, "Safety", db):
        return True
    if user.role == "VENDOR":
        return _is_package_contact(user, package_id, db)
    # PROJECT_TEAM, CLIENT, … can log an incident anywhere on the project.
    return True


def _validate_incident_refs(pkg_id: int, area_id: int, sev_id: int, cause_id: int,
                            worker_ids: List[int],
                            user: auth.ProjectContext, db: Session) -> models.SafetyIncidentCause:
    pkg = db.query(models.Package).filter_by(id=pkg_id, project_id=user.project_id).first()
    if not pkg:
        raise HTTPException(400, "Package not found in this project")
    area = db.query(models.Area).filter_by(id=area_id, project_id=user.project_id).first()
    if not area:
        raise HTTPException(400, "Area not found in this project")
    sev = db.query(models.SafetySeverityClass).filter_by(
        id=sev_id, project_id=user.project_id).first()
    if not sev:
        raise HTTPException(400, "Severity class not found in this project")
    cause = db.query(models.SafetyIncidentCause).filter_by(
        id=cause_id, project_id=user.project_id).first()
    if not cause:
        raise HTTPException(400, "Incident cause not found in this project")
    if worker_ids:
        rows = (
            db.query(models.Worker)
              .filter(models.Worker.project_id == user.project_id,
                      models.Worker.id.in_(worker_ids))
              .all()
        )
        if len(rows) != len(set(worker_ids)):
            raise HTTPException(400, "One or more workers not found")
        bad = [w.id for w in rows if w.package_id != pkg_id]
        if bad:
            raise HTTPException(400, "Worker(s) not linked to the selected package")
    return cause


def _can_edit_incident(inc: "models.SafetyIncident",
                       user: auth.ProjectContext, db: Session) -> bool:
    """Once the site supervisor has approved the action plan (status moves
    past UNDER_INVESTIGATION) the report is locked for everyone except
    project admins/owners. Further changes happen through workflow
    transitions and notes."""
    # Admins and project owners can always edit (superuser privilege across
    # the whole platform).
    if auth.has_owner_or_lead_access(user, "Safety", db):
        return True
    if inc.status not in ("DRAFT", "UNDER_INVESTIGATION"):
        return False
    if inc.created_by_id == user.id:
        return True
    # Site supervisor can amend the report while it is UNDER_INVESTIGATION.
    if inc.status == "UNDER_INVESTIGATION" \
       and _is_area_site_supervisor(user, inc.area_id, db):
        return True
    return False


def _log_incident_event(db: Session, inc: "models.SafetyIncident",
                        event: str, user: auth.ProjectContext,
                        comment: Optional[str] = None) -> None:
    db.add(models.SafetyIncidentReview(
        incident_id=inc.id,
        event=event,
        comment=(comment or None),
        actor_id=user.id,
        created_at=datetime.utcnow(),
    ))


def _compute_incident_actions(inc: "models.SafetyIncident",
                              user: Optional[auth.ProjectContext],
                              db: Session) -> List[str]:
    if user is None:
        return []
    actions = []
    is_super  = _is_area_site_supervisor(user, inc.area_id, db)
    is_pkg    = _is_package_contact(user, inc.package_id, db)
    is_po_adm = auth.has_owner_or_lead_access(user, "Safety", db)
    can_edit  = _can_edit_incident(inc, user, db)
    if can_edit:
        actions.append("edit")
    if inc.status == "DRAFT":
        if inc.created_by_id == user.id or is_po_adm:
            actions.extend(["submit", "delete"])
    elif inc.status == "UNDER_INVESTIGATION":
        if is_super or is_po_adm:
            actions.append("approve_investigation")
    elif inc.status == "ACTION_IN_PROGRESS":
        if is_pkg or is_po_adm:
            actions.append("mark_action_done")
    elif inc.status == "PENDING_REVIEW":
        if is_super or is_po_adm:
            actions.extend(["close", "reopen"])
    return actions


def _fmt_incident_note(n: "models.SafetyIncidentNote") -> dict:
    return {
        "id": n.id,
        "content": n.content,
        "created_by_name": n.author.name if n.author else None,
        "created_at": n.created_at.isoformat() + "Z" if n.created_at else None,
    }


def _fmt_incident(inc: "models.SafetyIncident", *, with_detail: bool = False,
                  user: Optional[auth.ProjectContext] = None,
                  db: Optional[Session] = None) -> dict:
    toolbox_count = 0
    if db is not None:
        toolbox_count = (
            db.query(models.SafetyToolboxIncident)
              .filter_by(incident_id=inc.id)
              .count()
        )
    out = {
        "id": inc.id,
        "display_id": f"IR-{(inc.project_seq_id or inc.id):06d}",
        "project_seq_id": inc.project_seq_id,
        "toolbox_count": toolbox_count,
        "status": inc.status,
        "package_id": inc.package_id,
        "package_tag":  inc.package.tag_number if inc.package else None,
        "package_name": inc.package.name       if inc.package else None,
        "area_id":   inc.area_id,
        "area_tag":  inc.area.tag         if inc.area else None,
        "area_description": inc.area.description if inc.area else None,
        "incident_date":   inc.incident_date,
        "severity_class_id":   inc.severity_class_id,
        "severity_class_name": inc.severity_class.name  if inc.severity_class else None,
        "severity_class_level": inc.severity_class.level if inc.severity_class else None,
        "incident_cause_id":   inc.incident_cause_id,
        "incident_cause_name": inc.incident_cause.name if inc.incident_cause else None,
        "incident_cause_is_default": bool(inc.incident_cause.is_default) if inc.incident_cause else False,
        "other_cause_text": inc.other_cause_text or "",
        "details": inc.details or "",
        "action":  inc.action or "",
        "worker_ids": [w.worker_id for w in inc.workers] if inc.workers else [],
        "workers": [
            {"id": w.worker_id,
             "name": w.worker.name if w.worker else None}
            for w in (inc.workers or [])
        ],
        "submitted_at":         inc.submitted_at.isoformat() + "Z" if inc.submitted_at else None,
        "submitted_by_name":    inc.submitted_by.name if inc.submitted_by else None,
        "investigated_at":      inc.investigated_at.isoformat() + "Z" if inc.investigated_at else None,
        "investigated_by_name": inc.investigated_by.name if inc.investigated_by else None,
        "investigation_comment": inc.investigation_comment or "",
        "action_completed_at":      inc.action_completed_at.isoformat() + "Z" if inc.action_completed_at else None,
        "action_completed_by_name": inc.action_completed_by.name if inc.action_completed_by else None,
        "action_completion_comment": inc.action_completion_comment or "",
        "closed_at":      inc.closed_at.isoformat() + "Z" if inc.closed_at else None,
        "closed_by_name": inc.closed_by.name if inc.closed_by else None,
        "created_at":     inc.created_at.isoformat() + "Z" if inc.created_at else None,
        "created_by_name": inc.created_by.name if inc.created_by else None,
        "updated_at":     inc.updated_at.isoformat() + "Z" if inc.updated_at else None,
        "updated_by_name": inc.updated_by.name if inc.updated_by else None,
    }
    if user is not None and db is not None:
        out["allowed_actions"] = _compute_incident_actions(inc, user, db)
    if with_detail:
        out["history"] = [{
            "id": h.id,
            "event": h.event,
            "comment": h.comment or "",
            "actor_name": h.actor.name if h.actor else None,
            "created_at": h.created_at.isoformat() + "Z" if h.created_at else None,
        } for h in inc.history]
        out["notes"] = [_fmt_incident_note(n) for n in inc.notes]
    return out


class IncidentCreate(BaseModel):
    package_id: int
    area_id: int
    incident_date: str                      # YYYY-MM-DD
    severity_class_id: int
    incident_cause_id: int
    other_cause_text: Optional[str] = None
    details: str
    action: str
    worker_ids: Optional[List[int]] = None


class IncidentUpdate(BaseModel):
    package_id: Optional[int] = None
    area_id: Optional[int] = None
    incident_date: Optional[str] = None
    severity_class_id: Optional[int] = None
    incident_cause_id: Optional[int] = None
    other_cause_text: Optional[str] = None
    details: Optional[str] = None
    action: Optional[str] = None
    worker_ids: Optional[List[int]] = None
    updated_at: Optional[str] = None


class IncidentWorkflowBody(BaseModel):
    comment: Optional[str] = None
    updated_at: Optional[str] = None


class IncidentNoteBody(BaseModel):
    content: str


def _check_other_cause(cause: models.SafetyIncidentCause, other_text: Optional[str]) -> None:
    if cause.is_default:
        if not (other_text or "").strip():
            raise HTTPException(400, "Please describe the cause when 'Other' is selected")


@router.get("/incidents")
def list_incidents(
    status: Optional[str] = None,
    package_id: Optional[int] = None,
    area_id: Optional[int] = None,
    severity_class_id: Optional[int] = None,
    incident_cause_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Bidders cannot view safety incidents")
    q = db.query(models.SafetyIncident).filter(
        models.SafetyIncident.project_id == user.project_id
    )
    if user.role == "VENDOR":
        visible = _vendor_visible_package_ids(user, db)
        if not visible:
            return []
        q = q.filter(models.SafetyIncident.package_id.in_(visible))
    if status:
        q = q.filter(models.SafetyIncident.status == status.upper())
    if package_id:
        q = q.filter(models.SafetyIncident.package_id == package_id)
    if area_id:
        q = q.filter(models.SafetyIncident.area_id == area_id)
    if severity_class_id:
        q = q.filter(models.SafetyIncident.severity_class_id == severity_class_id)
    if incident_cause_id:
        q = q.filter(models.SafetyIncident.incident_cause_id == incident_cause_id)
    rows = q.order_by(models.SafetyIncident.id.desc()).all()
    return [_fmt_incident(r, user=user, db=db) for r in rows]


@router.get("/incidents/my-pending")
def my_pending_incidents(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Feeds the My Action Points module — three buckets:
       - to_investigate: UNDER_INVESTIGATION incidents whose linked area has the
         current user as a site supervisor.
       - to_action: ACTION_IN_PROGRESS incidents whose linked package the
         current user is a contact of.
       - to_review: PENDING_REVIEW incidents whose linked area has the current
         user as a site supervisor."""
    if user.role == "BIDDER" or not user.contact_id:
        return {"to_investigate": [], "to_action": [], "to_review": []}

    # Areas where the user is a site supervisor (in this project).
    super_area_ids = {row.area_id for row in (
        db.query(models.AreaSiteSupervisor)
          .join(models.Area, models.Area.id == models.AreaSiteSupervisor.area_id)
          .filter(models.Area.project_id == user.project_id,
                  models.AreaSiteSupervisor.contact_id == user.contact_id)
          .all()
    )}

    to_investigate, to_action, to_review = [], [], []

    if super_area_ids:
        ui_rows = (
            db.query(models.SafetyIncident)
              .filter(models.SafetyIncident.project_id == user.project_id,
                      models.SafetyIncident.status == "UNDER_INVESTIGATION",
                      models.SafetyIncident.area_id.in_(super_area_ids))
              .all()
        )
        to_investigate = [_fmt_incident(r, user=user, db=db) for r in ui_rows]

        rev_rows = (
            db.query(models.SafetyIncident)
              .filter(models.SafetyIncident.project_id == user.project_id,
                      models.SafetyIncident.status == "PENDING_REVIEW",
                      models.SafetyIncident.area_id.in_(super_area_ids))
              .all()
        )
        to_review = [_fmt_incident(r, user=user, db=db) for r in rev_rows]

    aip_rows = (
        db.query(models.SafetyIncident)
          .filter(models.SafetyIncident.project_id == user.project_id,
                  models.SafetyIncident.status == "ACTION_IN_PROGRESS")
          .all()
    )
    to_action = [
        _fmt_incident(r, user=user, db=db) for r in aip_rows
        if _is_package_contact(user, r.package_id, db)
    ]

    return {"to_investigate": to_investigate, "to_action": to_action, "to_review": to_review}


@router.get("/incidents/{inc_id}")
def get_incident(
    inc_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Bidders cannot view safety incidents")
    inc = db.query(models.SafetyIncident).filter_by(
        id=inc_id, project_id=user.project_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    _assert_vendor_can_see_incident(inc, user, db)
    return _fmt_incident(inc, with_detail=True, user=user, db=db)


@router.post("/incidents")
def create_incident(
    body: IncidentCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Bidders cannot create safety incidents")
    if not _can_create_incident_for_package(user, body.package_id, db):
        raise HTTPException(403, "You are not linked to this package and cannot file an incident for it")
    if not (body.details or "").strip():
        raise HTTPException(400, "Details are required")
    if not (body.action or "").strip():
        raise HTTPException(400, "Action is required")
    if not (body.incident_date or "").strip():
        raise HTTPException(400, "Date is required")
    worker_ids = list({wid for wid in (body.worker_ids or []) if wid})
    cause = _validate_incident_refs(body.package_id, body.area_id,
                                    body.severity_class_id, body.incident_cause_id,
                                    worker_ids, user, db)
    _check_other_cause(cause, body.other_cause_text)

    now = datetime.utcnow()
    inc = models.SafetyIncident(
        project_id=user.project_id,
        project_seq_id=models.next_project_seq(db, models.SafetyIncident, user.project_id),
        package_id=body.package_id,
        area_id=body.area_id,
        incident_date=body.incident_date.strip(),
        severity_class_id=body.severity_class_id,
        incident_cause_id=body.incident_cause_id,
        other_cause_text=(body.other_cause_text or "").strip() or None,
        details=body.details.strip(),
        action=body.action.strip(),
        status="DRAFT",
        created_at=now,
        created_by_id=user.id,
    )
    db.add(inc); db.flush()
    for wid in worker_ids:
        db.add(models.SafetyIncidentWorker(incident_id=inc.id, worker_id=wid))
    _log_incident_event(db, inc, "CREATED", user)
    db.commit(); db.refresh(inc)
    return _fmt_incident(inc, with_detail=True, user=user, db=db)


@router.put("/incidents/{inc_id}")
def update_incident(
    inc_id: int,
    body: IncidentUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    inc = db.query(models.SafetyIncident).filter_by(
        id=inc_id, project_id=user.project_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    _assert_vendor_can_see_incident(inc, user, db)
    if not _can_edit_incident(inc, user, db):
        raise HTTPException(403, "You are not allowed to edit this incident")
    check_lock(inc.updated_at, body.updated_at, "safety incident")

    pkg_id = body.package_id if body.package_id is not None else inc.package_id
    area_id = body.area_id if body.area_id is not None else inc.area_id
    sev_id  = body.severity_class_id if body.severity_class_id is not None else inc.severity_class_id
    cause_id = body.incident_cause_id if body.incident_cause_id is not None else inc.incident_cause_id

    # Resolve final worker list (None means "no change").
    if body.worker_ids is None:
        new_worker_ids = [w.worker_id for w in inc.workers]
    else:
        new_worker_ids = list({wid for wid in body.worker_ids if wid})

    cause = _validate_incident_refs(pkg_id, area_id, sev_id, cause_id,
                                    new_worker_ids, user, db)

    other_text = body.other_cause_text if body.other_cause_text is not None else inc.other_cause_text
    _check_other_cause(cause, other_text)

    inc.package_id = pkg_id
    inc.area_id    = area_id
    inc.severity_class_id = sev_id
    inc.incident_cause_id = cause_id
    if body.incident_date is not None:
        if not body.incident_date.strip():
            raise HTTPException(400, "Date cannot be empty")
        inc.incident_date = body.incident_date.strip()
    if body.details is not None:
        if not body.details.strip():
            raise HTTPException(400, "Details are required")
        inc.details = body.details.strip()
    if body.action is not None:
        if not body.action.strip():
            raise HTTPException(400, "Action is required")
        inc.action = body.action.strip()
    if body.other_cause_text is not None:
        inc.other_cause_text = body.other_cause_text.strip() or None
    elif not cause.is_default:
        # Clear stale "other" text when cause is no longer the default catch-all.
        inc.other_cause_text = None

    if body.worker_ids is not None:
        existing = {w.worker_id: w for w in inc.workers}
        keep = set(new_worker_ids)
        # Remove links no longer wanted.
        for wid, link in list(existing.items()):
            if wid not in keep:
                db.delete(link)
        # Add new ones.
        for wid in new_worker_ids:
            if wid not in existing:
                db.add(models.SafetyIncidentWorker(incident_id=inc.id, worker_id=wid))

    inc.updated_at = datetime.utcnow()
    inc.updated_by_id = user.id
    db.commit(); db.refresh(inc)
    return _fmt_incident(inc, with_detail=True, user=user, db=db)


@router.post("/incidents/{inc_id}/submit")
def submit_incident(
    inc_id: int,
    body: IncidentWorkflowBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    inc = db.query(models.SafetyIncident).filter_by(
        id=inc_id, project_id=user.project_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    _assert_vendor_can_see_incident(inc, user, db)
    if inc.status != "DRAFT":
        raise HTTPException(400, f"Cannot submit from status {inc.status}")
    if inc.created_by_id != user.id and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(403, "Only the creator can submit")
    check_lock(inc.updated_at, body.updated_at, "safety incident")
    now = datetime.utcnow()
    inc.status = "UNDER_INVESTIGATION"
    inc.submitted_at = now
    inc.submitted_by_id = user.id
    inc.updated_at = now
    inc.updated_by_id = user.id
    _log_incident_event(db, inc, "SUBMITTED", user, comment=(body.comment or "").strip() or None)
    db.commit(); db.refresh(inc)
    return _fmt_incident(inc, with_detail=True, user=user, db=db)


@router.post("/incidents/{inc_id}/approve-investigation")
def approve_investigation(
    inc_id: int,
    body: IncidentWorkflowBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Site-supervisor of the area approves the action plan and hands it
    over to the package contact to execute."""
    inc = db.query(models.SafetyIncident).filter_by(
        id=inc_id, project_id=user.project_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    _assert_vendor_can_see_incident(inc, user, db)
    if inc.status != "UNDER_INVESTIGATION":
        raise HTTPException(400, f"Cannot approve from status {inc.status}")
    inc_pkg = db.query(models.Package).filter_by(id=inc.package_id).first() if inc.package_id else None
    if not _is_area_site_supervisor(user, inc.area_id, db) \
       and not auth.has_owner_lead_or_package_access(user, "Safety", inc_pkg, db):
        raise HTTPException(403, "Only a site supervisor of the linked area, the Package Owner, a Module Lead or the Project Owner can approve the investigation")
    check_lock(inc.updated_at, body.updated_at, "safety incident")
    now = datetime.utcnow()
    inc.status = "ACTION_IN_PROGRESS"
    inc.investigated_at = now
    inc.investigated_by_id = user.id
    inc.investigation_comment = (body.comment or "").strip() or None
    inc.updated_at = now
    inc.updated_by_id = user.id
    _log_incident_event(db, inc, "INVESTIGATED", user,
                        comment=inc.investigation_comment)
    db.commit(); db.refresh(inc)
    return _fmt_incident(inc, with_detail=True, user=user, db=db)


@router.post("/incidents/{inc_id}/mark-action-done")
def mark_action_done(
    inc_id: int,
    body: IncidentWorkflowBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Package contact confirms the actions have been carried out."""
    inc = db.query(models.SafetyIncident).filter_by(
        id=inc_id, project_id=user.project_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    _assert_vendor_can_see_incident(inc, user, db)
    if inc.status != "ACTION_IN_PROGRESS":
        raise HTTPException(400, f"Cannot mark action done from status {inc.status}")
    if not _is_package_contact(user, inc.package_id, db) \
       and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(403, "Only a linked package contact can mark the action as done")
    check_lock(inc.updated_at, body.updated_at, "safety incident")
    now = datetime.utcnow()
    inc.status = "PENDING_REVIEW"
    inc.action_completed_at = now
    inc.action_completed_by_id = user.id
    inc.action_completion_comment = (body.comment or "").strip() or None
    inc.updated_at = now
    inc.updated_by_id = user.id
    _log_incident_event(db, inc, "ACTION_DONE", user,
                        comment=inc.action_completion_comment)
    db.commit(); db.refresh(inc)
    return _fmt_incident(inc, with_detail=True, user=user, db=db)


@router.post("/incidents/{inc_id}/close")
def close_incident(
    inc_id: int,
    body: IncidentWorkflowBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    inc = db.query(models.SafetyIncident).filter_by(
        id=inc_id, project_id=user.project_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    _assert_vendor_can_see_incident(inc, user, db)
    if inc.status != "PENDING_REVIEW":
        raise HTTPException(400, f"Cannot close from status {inc.status}")
    if not _is_area_site_supervisor(user, inc.area_id, db) \
       and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(403, "Only a site supervisor of the linked area can close this incident")
    check_lock(inc.updated_at, body.updated_at, "safety incident")
    now = datetime.utcnow()
    inc.status = "CLOSED"
    inc.closed_at = now
    inc.closed_by_id = user.id
    inc.updated_at = now
    inc.updated_by_id = user.id
    _log_incident_event(db, inc, "CLOSED", user,
                        comment=(body.comment or "").strip() or None)
    db.commit(); db.refresh(inc)
    return _fmt_incident(inc, with_detail=True, user=user, db=db)


@router.post("/incidents/{inc_id}/reopen")
def reopen_incident(
    inc_id: int,
    body: IncidentWorkflowBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Supervisor disagrees that the action is complete — back to ACTION_IN_PROGRESS."""
    inc = db.query(models.SafetyIncident).filter_by(
        id=inc_id, project_id=user.project_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    _assert_vendor_can_see_incident(inc, user, db)
    if inc.status != "PENDING_REVIEW":
        raise HTTPException(400, f"Cannot re-open from status {inc.status}")
    if not _is_area_site_supervisor(user, inc.area_id, db) \
       and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(403, "Only a site supervisor of the linked area can re-open this incident")
    reason = (body.comment or "").strip()
    if not reason:
        raise HTTPException(400, "A reason is required when re-opening")
    check_lock(inc.updated_at, body.updated_at, "safety incident")
    now = datetime.utcnow()
    inc.status = "ACTION_IN_PROGRESS"
    # Clear the previous "action done" marker so the badge doesn't linger.
    inc.action_completed_at = None
    inc.action_completed_by_id = None
    inc.action_completion_comment = None
    inc.updated_at = now
    inc.updated_by_id = user.id
    _log_incident_event(db, inc, "REOPENED", user, comment=reason)
    db.commit(); db.refresh(inc)
    return _fmt_incident(inc, with_detail=True, user=user, db=db)


@router.delete("/incidents/{inc_id}")
def delete_incident(
    inc_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    inc = db.query(models.SafetyIncident).filter_by(
        id=inc_id, project_id=user.project_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    _assert_vendor_can_see_incident(inc, user, db)
    if inc.status != "DRAFT" and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(400, "Only draft incidents can be deleted")
    if inc.created_by_id != user.id and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(403, "You are not allowed to delete this incident")
    db.delete(inc); db.commit()
    return {"ok": True}


# ── Notes (free-text, similar to MeetingPointNote) ──────────────────────────

@router.post("/incidents/{inc_id}/notes")
def add_incident_note(
    inc_id: int,
    body: IncidentNoteBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Bidders cannot add notes")
    inc = db.query(models.SafetyIncident).filter_by(
        id=inc_id, project_id=user.project_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    _assert_vendor_can_see_incident(inc, user, db)
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(400, "Note content is required")
    note = models.SafetyIncidentNote(
        incident_id=inc.id,
        content=content,
        created_by_id=user.id,
        created_at=datetime.utcnow(),
    )
    db.add(note); db.commit(); db.refresh(note)
    return _fmt_incident_note(note)


@router.put("/incidents/{inc_id}/notes/{note_id}")
def update_incident_note(
    inc_id: int,
    note_id: int,
    body: IncidentNoteBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    note = db.query(models.SafetyIncidentNote).filter(
        models.SafetyIncidentNote.id == note_id,
        models.SafetyIncidentNote.incident_id == inc_id,
    ).first()
    if not note:
        raise HTTPException(404, "Note not found")
    inc = db.query(models.SafetyIncident).filter_by(
        id=inc_id, project_id=user.project_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    _assert_vendor_can_see_incident(inc, user, db)
    if note.created_by_id != user.id and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(403, "You can only edit notes you wrote")
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(400, "Note content is required")
    note.content = content
    db.commit(); db.refresh(note)
    return _fmt_incident_note(note)


@router.delete("/incidents/{inc_id}/notes/{note_id}")
def delete_incident_note(
    inc_id: int,
    note_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    note = db.query(models.SafetyIncidentNote).filter(
        models.SafetyIncidentNote.id == note_id,
        models.SafetyIncidentNote.incident_id == inc_id,
    ).first()
    if not note:
        raise HTTPException(404, "Note not found")
    inc = db.query(models.SafetyIncident).filter_by(
        id=inc_id, project_id=user.project_id).first()
    if not inc:
        raise HTTPException(404, "Incident not found")
    _assert_vendor_can_see_incident(inc, user, db)
    if note.created_by_id != user.id and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(403, "You can only delete notes you wrote")
    db.delete(note); db.commit()
    return {"ok": True}


# ═════════════════════════════════════════════════════════════════════════════
# Safety Toolboxes
#   DRAFT → SUBMITTED   (re-open available to supervisors / PO / ADMIN)
# ═════════════════════════════════════════════════════════════════════════════


def _can_view_toolbox(tbx: "models.SafetyToolbox",
                      user: auth.ProjectContext, db: Session) -> bool:
    """Vendors can only see toolboxes that touch one of their packages."""
    if user.role != "VENDOR":
        return True
    visible = set(_vendor_visible_package_ids(user, db))
    if not visible:
        return False
    return any(p.package_id in visible for p in (tbx.packages or []))


def _assert_vendor_can_see_toolbox(tbx: "models.SafetyToolbox",
                                   user: auth.ProjectContext, db: Session) -> None:
    if not _can_view_toolbox(tbx, user, db):
        raise HTTPException(404, "Toolbox not found")


def _can_edit_toolbox(tbx: "models.SafetyToolbox",
                      user: auth.ProjectContext, db: Session) -> bool:
    """Editing is allowed only on DRAFT, by the creator or by a project
    owner / admin (admins can also edit submitted records — see below)."""
    if auth.has_owner_or_lead_access(user, "Safety", db):
        # Admins/owners can always edit; submission state is enforced separately.
        return tbx.status == "DRAFT"
    if tbx.status != "DRAFT":
        return False
    return tbx.created_by_id == user.id


def _can_reopen_toolbox(tbx: "models.SafetyToolbox",
                        user: auth.ProjectContext, db: Session) -> bool:
    if tbx.status not in ("SUBMITTED", "RECEIVED"):
        return False
    if auth.has_owner_or_lead_access(user, "Safety", db):
        return True
    return _is_project_site_supervisor(user, db)


def _can_acknowledge_toolbox(tbx: "models.SafetyToolbox",
                             user: auth.ProjectContext, db: Session) -> bool:
    if tbx.status != "SUBMITTED":
        return False
    if auth.has_owner_or_lead_access(user, "Safety", db):
        return True
    return _is_project_site_supervisor(user, db)


def _compute_toolbox_actions(tbx: "models.SafetyToolbox",
                             user: Optional[auth.ProjectContext],
                             db: Session) -> List[str]:
    if user is None:
        return []
    actions: List[str] = []
    if _can_edit_toolbox(tbx, user, db):
        actions.append("edit")
    if tbx.status == "DRAFT":
        if _can_edit_toolbox(tbx, user, db):
            actions.extend(["submit", "delete"])
    elif tbx.status == "SUBMITTED":
        if _can_acknowledge_toolbox(tbx, user, db):
            actions.append("acknowledge")
        if _can_reopen_toolbox(tbx, user, db):
            actions.append("reopen")
    elif tbx.status == "RECEIVED":
        if _can_reopen_toolbox(tbx, user, db):
            actions.append("reopen")
    return actions


def _log_toolbox_event(db: Session, tbx: "models.SafetyToolbox",
                       event: str, user: auth.ProjectContext,
                       comment: Optional[str] = None) -> None:
    db.add(models.SafetyToolboxReview(
        toolbox_id=tbx.id,
        event=event,
        comment=(comment or None),
        actor_id=user.id,
        created_at=datetime.utcnow(),
    ))


def _fmt_toolbox(tbx: "models.SafetyToolbox", *, with_detail: bool = False,
                 user: Optional[auth.ProjectContext] = None,
                 db: Optional[Session] = None) -> dict:
    cat = tbx.category
    given_name = None
    given_kind = None
    if tbx.given_by_user:
        given_name = tbx.given_by_user.name
        given_kind = "user"
    elif tbx.given_by_worker:
        given_name = tbx.given_by_worker.name
        given_kind = "worker"
    out = {
        "id": tbx.id,
        "display_id": f"TB-{(tbx.project_seq_id or tbx.id):06d}",
        "project_seq_id": tbx.project_seq_id,
        "status": tbx.status,
        "category_id":   tbx.category_id,
        "category_name": cat.name if cat else None,
        "category_is_default": bool(cat.is_default) if cat else False,
        "other_category_text": tbx.other_category_text or "",
        "given_by_user_id":   tbx.given_by_user_id,
        "given_by_worker_id": tbx.given_by_worker_id,
        "given_by_name": given_name,
        "given_by_kind": given_kind,
        "talk_date": tbx.talk_date,
        "details":   tbx.details or "",
        "package_ids":     [p.package_id    for p in (tbx.packages    or [])],
        "worker_ids":      [w.worker_id     for w in (tbx.workers     or [])],
        "observation_ids": [o.observation_id for o in (tbx.observations or [])],
        "incident_ids":    [i.incident_id   for i in (tbx.incidents    or [])],
        "packages": [
            {"id": p.package.id, "tag_number": p.package.tag_number, "name": p.package.name}
            for p in (tbx.packages or []) if p.package
        ],
        "workers": [
            {"id": w.worker.id, "name": w.worker.name}
            for w in (tbx.workers or []) if w.worker
        ],
        "observations": [
            {"id": o.observation.id,
             "display_id": f"SO-{(o.observation.project_seq_id or o.observation.id):06d}",
             "details": (o.observation.details or "")[:80]}
            for o in (tbx.observations or []) if o.observation
        ],
        "incidents": [
            {"id": i.incident.id,
             "display_id": f"IR-{(i.incident.project_seq_id or i.incident.id):06d}",
             "details": (i.incident.details or "")[:80]}
            for i in (tbx.incidents or []) if i.incident
        ],
        "submitted_at":     tbx.submitted_at.isoformat() + "Z" if tbx.submitted_at else None,
        "submitted_by_name": tbx.submitted_by.name if tbx.submitted_by else None,
        "acknowledged_at":      tbx.acknowledged_at.isoformat() + "Z" if tbx.acknowledged_at else None,
        "acknowledged_by_name": tbx.acknowledged_by.name if tbx.acknowledged_by else None,
        "acknowledge_comment":  tbx.acknowledge_comment or "",
        "reopened_at":      tbx.reopened_at.isoformat() + "Z" if tbx.reopened_at else None,
        "reopened_by_name":  tbx.reopened_by.name if tbx.reopened_by else None,
        "created_at":       tbx.created_at.isoformat() + "Z" if tbx.created_at else None,
        "created_by_name":  tbx.created_by.name if tbx.created_by else None,
        "updated_at":       tbx.updated_at.isoformat() + "Z" if tbx.updated_at else None,
        "updated_by_name":  tbx.updated_by.name if tbx.updated_by else None,
    }
    if user is not None and db is not None:
        out["allowed_actions"] = _compute_toolbox_actions(tbx, user, db)
    if with_detail:
        out["history"] = [{
            "id": h.id,
            "event": h.event,
            "comment": h.comment or "",
            "actor_name": h.actor.name if h.actor else None,
            "created_at": h.created_at.isoformat() + "Z" if h.created_at else None,
        } for h in (tbx.history or [])]
    return out


class ToolboxCreate(BaseModel):
    package_ids: List[int]
    worker_ids: Optional[List[int]] = None
    observation_ids: Optional[List[int]] = None
    incident_ids: Optional[List[int]] = None
    given_by_user_id: Optional[int] = None
    given_by_worker_id: Optional[int] = None
    category_id: int
    other_category_text: Optional[str] = None
    talk_date: str                  # YYYY-MM-DD
    details: str


class ToolboxUpdate(BaseModel):
    package_ids: Optional[List[int]] = None
    worker_ids: Optional[List[int]] = None
    observation_ids: Optional[List[int]] = None
    incident_ids: Optional[List[int]] = None
    given_by_user_id: Optional[int] = None
    given_by_worker_id: Optional[int] = None
    category_id: Optional[int] = None
    other_category_text: Optional[str] = None
    talk_date: Optional[str] = None
    details: Optional[str] = None
    updated_at: Optional[str] = None


class ToolboxWorkflowBody(BaseModel):
    comment: Optional[str] = None
    updated_at: Optional[str] = None


def _validate_toolbox_payload(*, package_ids: List[int], worker_ids: List[int],
                              observation_ids: List[int], incident_ids: List[int],
                              given_by_user_id: Optional[int],
                              given_by_worker_id: Optional[int],
                              category_id: int, other_category_text: Optional[str],
                              talk_date: str, details: str,
                              user: auth.ProjectContext, db: Session) -> models.SafetyToolboxCategory:
    if not package_ids:
        raise HTTPException(400, "At least one package is required")
    if not (talk_date or "").strip():
        raise HTTPException(400, "Date is required")
    if not (details or "").strip():
        raise HTTPException(400, "Details are required")
    # exactly one given-by source
    has_user   = given_by_user_id is not None
    has_worker = given_by_worker_id is not None
    if has_user == has_worker:
        raise HTTPException(400, "Pick exactly one 'Given by' (user OR worker)")

    # validate packages belong to project; vendors must be linked to each
    pkg_rows = (
        db.query(models.Package)
          .filter(models.Package.project_id == user.project_id,
                  models.Package.id.in_(package_ids))
          .all()
    )
    if len({p.id for p in pkg_rows}) != len(set(package_ids)):
        raise HTTPException(400, "One or more packages not found in this project")
    if user.role == "VENDOR":
        visible = set(_vendor_visible_package_ids(user, db))
        bad = [pid for pid in package_ids if pid not in visible]
        if bad:
            raise HTTPException(403, "You can only file toolbox talks for packages you are linked to")

    # workers must belong to one of the selected packages
    if worker_ids:
        worker_rows = (
            db.query(models.Worker)
              .filter(models.Worker.project_id == user.project_id,
                      models.Worker.id.in_(worker_ids))
              .all()
        )
        if len(worker_rows) != len(set(worker_ids)):
            raise HTTPException(400, "One or more workers not found")
        pkg_set = set(package_ids)
        bad_w = [w.id for w in worker_rows if w.package_id not in pkg_set]
        if bad_w:
            raise HTTPException(400, "Worker(s) not linked to any of the selected packages")

    if observation_ids:
        n = (
            db.query(models.SafetyObservation)
              .filter(models.SafetyObservation.project_id == user.project_id,
                      models.SafetyObservation.id.in_(observation_ids))
              .count()
        )
        if n != len(set(observation_ids)):
            raise HTTPException(400, "One or more safety observations not found")

    if incident_ids:
        n = (
            db.query(models.SafetyIncident)
              .filter(models.SafetyIncident.project_id == user.project_id,
                      models.SafetyIncident.id.in_(incident_ids))
              .count()
        )
        if n != len(set(incident_ids)):
            raise HTTPException(400, "One or more safety incidents not found")

    if has_user:
        u_row = db.query(models.User).filter_by(id=given_by_user_id).first()
        if not u_row:
            raise HTTPException(400, "'Given by' user not found")
    else:
        w_row = (
            db.query(models.Worker)
              .filter_by(id=given_by_worker_id, project_id=user.project_id)
              .first()
        )
        if not w_row:
            raise HTTPException(400, "'Given by' worker not found in this project")

    cat = (
        db.query(models.SafetyToolboxCategory)
          .filter_by(id=category_id, project_id=user.project_id)
          .first()
    )
    if not cat:
        raise HTTPException(400, "Toolbox category not found in this project")
    if cat.is_default and not (other_category_text or "").strip():
        raise HTTPException(400, "Please describe the topic when 'Other' is selected")
    return cat


@router.get("/toolboxes/my-pending")
def my_pending_toolboxes(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """SUBMITTED toolboxes that the current user (as a site supervisor) is
    expected to acknowledge. Surfaces in the My Action Points module."""
    if user.role == "BIDDER" or not user.contact_id:
        return []
    if not auth.has_owner_or_lead_access(user, "Safety", db) and not _is_project_site_supervisor(user, db):
        return []
    rows = (
        db.query(models.SafetyToolbox)
          .filter(models.SafetyToolbox.project_id == user.project_id,
                  models.SafetyToolbox.status == "SUBMITTED")
          .all()
    )
    return [_fmt_toolbox(r, user=user, db=db) for r in rows]


@router.get("/toolbox-givers")
def list_toolbox_givers(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Combined list of project users + project workers used by the
    'Given By' dropdown in the toolbox form."""
    if user.role == "BIDDER":
        return []
    user_rows = (
        db.query(models.User)
          .join(models.UserProject, models.UserProject.user_id == models.User.id)
          .filter(models.UserProject.project_id == user.project_id)
          .all()
    )
    worker_rows = (
        db.query(models.Worker)
          .filter(models.Worker.project_id == user.project_id,
                  models.Worker.status == "APPROVED")
          .all()
    )
    return {
        "users":   [{"id": u.id, "name": u.name, "email": u.email} for u in user_rows],
        "workers": [{"id": w.id, "name": w.name, "package_id": w.package_id} for w in worker_rows],
    }


@router.get("/toolboxes")
def list_toolboxes(
    status: Optional[str] = None,
    package_id: Optional[int] = None,
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Bidders cannot view toolbox talks")
    q = db.query(models.SafetyToolbox).filter(
        models.SafetyToolbox.project_id == user.project_id
    )
    if status:
        q = q.filter(models.SafetyToolbox.status == status.upper())
    if category_id:
        q = q.filter(models.SafetyToolbox.category_id == category_id)
    if package_id:
        q = q.join(models.SafetyToolboxPackage,
                   models.SafetyToolboxPackage.toolbox_id == models.SafetyToolbox.id) \
             .filter(models.SafetyToolboxPackage.package_id == package_id)
    rows = q.order_by(models.SafetyToolbox.id.desc()).all()
    if user.role == "VENDOR":
        visible = set(_vendor_visible_package_ids(user, db))
        if not visible:
            return []
        rows = [
            t for t in rows
            if any(p.package_id in visible for p in (t.packages or []))
        ]
    return [_fmt_toolbox(r, user=user, db=db) for r in rows]


@router.get("/toolboxes/{tbx_id}")
def get_toolbox(
    tbx_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Bidders cannot view toolbox talks")
    tbx = db.query(models.SafetyToolbox).filter_by(
        id=tbx_id, project_id=user.project_id).first()
    if not tbx:
        raise HTTPException(404, "Toolbox not found")
    _assert_vendor_can_see_toolbox(tbx, user, db)
    return _fmt_toolbox(tbx, with_detail=True, user=user, db=db)


@router.post("/toolboxes")
def create_toolbox(
    body: ToolboxCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Bidders cannot create toolbox talks")
    package_ids     = list({pid for pid in (body.package_ids or [])     if pid})
    worker_ids      = list({wid for wid in (body.worker_ids or [])      if wid})
    observation_ids = list({oid for oid in (body.observation_ids or []) if oid})
    incident_ids    = list({iid for iid in (body.incident_ids or [])    if iid})
    cat = _validate_toolbox_payload(
        package_ids=package_ids, worker_ids=worker_ids,
        observation_ids=observation_ids, incident_ids=incident_ids,
        given_by_user_id=body.given_by_user_id,
        given_by_worker_id=body.given_by_worker_id,
        category_id=body.category_id, other_category_text=body.other_category_text,
        talk_date=body.talk_date, details=body.details,
        user=user, db=db,
    )
    now = datetime.utcnow()
    tbx = models.SafetyToolbox(
        project_id=user.project_id,
        project_seq_id=models.next_project_seq(db, models.SafetyToolbox, user.project_id),
        category_id=body.category_id,
        other_category_text=(body.other_category_text or "").strip() or None if cat.is_default else None,
        given_by_user_id=body.given_by_user_id,
        given_by_worker_id=body.given_by_worker_id,
        talk_date=body.talk_date.strip(),
        details=body.details.strip(),
        status="DRAFT",
        created_at=now,
        created_by_id=user.id,
    )
    db.add(tbx); db.flush()
    for pid in package_ids:
        db.add(models.SafetyToolboxPackage(toolbox_id=tbx.id, package_id=pid))
    for wid in worker_ids:
        db.add(models.SafetyToolboxWorker(toolbox_id=tbx.id, worker_id=wid))
    for oid in observation_ids:
        db.add(models.SafetyToolboxObservation(toolbox_id=tbx.id, observation_id=oid))
    for iid in incident_ids:
        db.add(models.SafetyToolboxIncident(toolbox_id=tbx.id, incident_id=iid))
    _log_toolbox_event(db, tbx, "CREATED", user)
    db.commit(); db.refresh(tbx)
    return _fmt_toolbox(tbx, with_detail=True, user=user, db=db)


def _replace_links(db: Session, tbx_id: int, model_class, key_attr: str, new_ids: List[int]) -> None:
    existing = {getattr(r, key_attr): r for r in db.query(model_class).filter_by(toolbox_id=tbx_id).all()}
    keep = set(new_ids)
    for k, row in list(existing.items()):
        if k not in keep:
            db.delete(row)
    for k in new_ids:
        if k not in existing:
            db.add(model_class(**{"toolbox_id": tbx_id, key_attr: k}))


@router.put("/toolboxes/{tbx_id}")
def update_toolbox(
    tbx_id: int,
    body: ToolboxUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    tbx = db.query(models.SafetyToolbox).filter_by(
        id=tbx_id, project_id=user.project_id).first()
    if not tbx:
        raise HTTPException(404, "Toolbox not found")
    _assert_vendor_can_see_toolbox(tbx, user, db)
    if not _can_edit_toolbox(tbx, user, db):
        raise HTTPException(403, "This toolbox can no longer be edited")
    check_lock(tbx.updated_at, body.updated_at, "toolbox talk")

    package_ids = list({pid for pid in (body.package_ids if body.package_ids is not None
                                        else [p.package_id for p in tbx.packages]) if pid})
    worker_ids  = list({wid for wid in (body.worker_ids  if body.worker_ids  is not None
                                        else [w.worker_id for w in tbx.workers]) if wid})
    obs_ids     = list({oid for oid in (body.observation_ids if body.observation_ids is not None
                                        else [o.observation_id for o in tbx.observations]) if oid})
    inc_ids     = list({iid for iid in (body.incident_ids    if body.incident_ids    is not None
                                        else [i.incident_id   for i in tbx.incidents]) if iid})
    given_user   = body.given_by_user_id   if body.given_by_user_id   is not None else tbx.given_by_user_id
    given_worker = body.given_by_worker_id if body.given_by_worker_id is not None else tbx.given_by_worker_id
    # Setting one of them clears the other
    if body.given_by_user_id is not None and body.given_by_user_id:
        given_worker = None
    if body.given_by_worker_id is not None and body.given_by_worker_id:
        given_user = None
    cat_id        = body.category_id if body.category_id is not None else tbx.category_id
    other_text    = body.other_category_text if body.other_category_text is not None else tbx.other_category_text
    talk_date     = body.talk_date if body.talk_date is not None else tbx.talk_date
    details       = body.details   if body.details   is not None else tbx.details

    cat = _validate_toolbox_payload(
        package_ids=package_ids, worker_ids=worker_ids,
        observation_ids=obs_ids, incident_ids=inc_ids,
        given_by_user_id=given_user, given_by_worker_id=given_worker,
        category_id=cat_id, other_category_text=other_text,
        talk_date=talk_date, details=details,
        user=user, db=db,
    )

    tbx.category_id = cat_id
    tbx.other_category_text = (other_text or "").strip() or None if cat.is_default else None
    tbx.given_by_user_id   = given_user
    tbx.given_by_worker_id = given_worker
    tbx.talk_date = talk_date.strip()
    tbx.details = details.strip()

    if body.package_ids is not None:
        _replace_links(db, tbx.id, models.SafetyToolboxPackage,     "package_id",    package_ids)
    if body.worker_ids is not None:
        _replace_links(db, tbx.id, models.SafetyToolboxWorker,      "worker_id",     worker_ids)
    if body.observation_ids is not None:
        _replace_links(db, tbx.id, models.SafetyToolboxObservation, "observation_id", obs_ids)
    if body.incident_ids is not None:
        _replace_links(db, tbx.id, models.SafetyToolboxIncident,    "incident_id",   inc_ids)

    tbx.updated_at = datetime.utcnow()
    tbx.updated_by_id = user.id
    db.commit(); db.refresh(tbx)
    return _fmt_toolbox(tbx, with_detail=True, user=user, db=db)


@router.post("/toolboxes/{tbx_id}/submit")
def submit_toolbox(
    tbx_id: int,
    body: ToolboxWorkflowBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    tbx = db.query(models.SafetyToolbox).filter_by(
        id=tbx_id, project_id=user.project_id).first()
    if not tbx:
        raise HTTPException(404, "Toolbox not found")
    _assert_vendor_can_see_toolbox(tbx, user, db)
    if tbx.status != "DRAFT":
        raise HTTPException(400, f"Cannot submit from status {tbx.status}")
    if tbx.created_by_id != user.id and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(403, "Only the creator can submit this toolbox talk")
    check_lock(tbx.updated_at, body.updated_at, "toolbox talk")
    now = datetime.utcnow()
    tbx.status = "SUBMITTED"
    tbx.submitted_at = now
    tbx.submitted_by_id = user.id
    tbx.updated_at = now
    tbx.updated_by_id = user.id
    _log_toolbox_event(db, tbx, "SUBMITTED", user, comment=(body.comment or "").strip() or None)
    db.commit(); db.refresh(tbx)
    return _fmt_toolbox(tbx, with_detail=True, user=user, db=db)


@router.post("/toolboxes/{tbx_id}/acknowledge")
def acknowledge_toolbox(
    tbx_id: int,
    body: ToolboxWorkflowBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Site supervisor confirms receipt of the toolbox talk: SUBMITTED → RECEIVED."""
    tbx = db.query(models.SafetyToolbox).filter_by(
        id=tbx_id, project_id=user.project_id).first()
    if not tbx:
        raise HTTPException(404, "Toolbox not found")
    _assert_vendor_can_see_toolbox(tbx, user, db)
    if tbx.status != "SUBMITTED":
        raise HTTPException(400, f"Cannot acknowledge from status {tbx.status}")
    if not _can_acknowledge_toolbox(tbx, user, db):
        raise HTTPException(403, "Only site supervisors / project owners / admins can acknowledge a toolbox")
    check_lock(tbx.updated_at, body.updated_at, "toolbox talk")
    now = datetime.utcnow()
    tbx.status = "RECEIVED"
    tbx.acknowledged_at = now
    tbx.acknowledged_by_id = user.id
    tbx.acknowledge_comment = (body.comment or "").strip() or None
    tbx.updated_at = now
    tbx.updated_by_id = user.id
    _log_toolbox_event(db, tbx, "ACKNOWLEDGED", user, comment=tbx.acknowledge_comment)
    db.commit(); db.refresh(tbx)
    return _fmt_toolbox(tbx, with_detail=True, user=user, db=db)


@router.post("/toolboxes/{tbx_id}/reopen")
def reopen_toolbox(
    tbx_id: int,
    body: ToolboxWorkflowBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    tbx = db.query(models.SafetyToolbox).filter_by(
        id=tbx_id, project_id=user.project_id).first()
    if not tbx:
        raise HTTPException(404, "Toolbox not found")
    _assert_vendor_can_see_toolbox(tbx, user, db)
    if not _can_reopen_toolbox(tbx, user, db):
        raise HTTPException(403, "Only site supervisors / project owners / admins can re-open a submitted toolbox")
    reason = (body.comment or "").strip()
    if not reason:
        raise HTTPException(400, "A reason is required when re-opening")
    check_lock(tbx.updated_at, body.updated_at, "toolbox talk")
    now = datetime.utcnow()
    tbx.status = "DRAFT"
    # Clear any previous acknowledgement so the badge/date don't linger when
    # the supervisor sends the talk back to the creator.
    tbx.acknowledged_at = None
    tbx.acknowledged_by_id = None
    tbx.acknowledge_comment = None
    tbx.reopened_at = now
    tbx.reopened_by_id = user.id
    tbx.updated_at = now
    tbx.updated_by_id = user.id
    _log_toolbox_event(db, tbx, "REOPENED", user, comment=reason)
    db.commit(); db.refresh(tbx)
    return _fmt_toolbox(tbx, with_detail=True, user=user, db=db)


@router.delete("/toolboxes/{tbx_id}")
def delete_toolbox(
    tbx_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    tbx = db.query(models.SafetyToolbox).filter_by(
        id=tbx_id, project_id=user.project_id).first()
    if not tbx:
        raise HTTPException(404, "Toolbox not found")
    _assert_vendor_can_see_toolbox(tbx, user, db)
    if tbx.status != "DRAFT" and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(400, "Only draft toolbox talks can be deleted")
    if tbx.created_by_id != user.id and not auth.has_owner_or_lead_access(user, "Safety", db):
        raise HTTPException(403, "You are not allowed to delete this toolbox")
    db.delete(tbx); db.commit()
    return {"ok": True}


# ═════════════════════════════════════════════════════════════════════════════
# Safety Dashboard
# ═════════════════════════════════════════════════════════════════════════════

REFERENCE_HOURS_KEY = "safety_reference_hours"
DEFAULT_REFERENCE_HOURS = 1_000_000


def _get_reference_hours(db: Session, project_id: int) -> int:
    s = db.query(models.Setting).filter_by(
        project_id=project_id, key=REFERENCE_HOURS_KEY
    ).first()
    if s and s.value:
        try:
            return int(s.value)
        except (TypeError, ValueError):
            return DEFAULT_REFERENCE_HOURS
    return DEFAULT_REFERENCE_HOURS


class ReferenceHoursBody(BaseModel):
    reference_hours: int


@router.get("/dashboard/reference-hours")
def get_reference_hours(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    return {"reference_hours": _get_reference_hours(db, user.project_id)}


@router.put("/dashboard/reference-hours")
def set_reference_hours(
    body: ReferenceHoursBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _is_owner_or_admin(user, db):
        raise HTTPException(403, "Only project owners can change the reference hours")
    if body.reference_hours <= 0:
        raise HTTPException(400, "Reference hours must be a positive integer")
    s = db.query(models.Setting).filter_by(
        project_id=user.project_id, key=REFERENCE_HOURS_KEY
    ).first()
    if not s:
        s = models.Setting(project_id=user.project_id, key=REFERENCE_HOURS_KEY)
        db.add(s)
    s.value = str(int(body.reference_hours))
    db.commit()
    return {"reference_hours": int(s.value)}


def _iso_week_key(d):
    """Return (iso_year, iso_week, monday_date) for a date."""
    y, w, _wd = d.isocalendar()
    monday = d - timedelta(days=d.weekday())
    return (y, w, monday)


@router.get("/dashboard")
def get_safety_dashboard(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(403, "Bidders cannot view the safety dashboard")
    pid = user.project_id

    reference_hours = _get_reference_hours(db, pid)

    packages = (db.query(models.Package).filter_by(project_id=pid)
                  .order_by(models.Package.tag_number).all())
    severities = (db.query(models.SafetySeverityClass).filter_by(project_id=pid)
                    .order_by(models.SafetySeverityClass.level).all())
    obs_categories = (db.query(models.SafetyObservationCategory).filter_by(project_id=pid)
                        .order_by(models.SafetyObservationCategory.sort_order,
                                  models.SafetyObservationCategory.id).all())
    neg_categories = [c for c in obs_categories if c.polarity != "POSITIVE"]
    pos_categories = [c for c in obs_categories if c.polarity == "POSITIVE"]

    pkg_by_id = {p.id: p for p in packages}

    # ── Hours per package (avg_hours_per_worker × #workers_present) ──────────
    daily_reports = db.query(models.DailyReport).filter_by(project_id=pid).all()
    # Pre-load worker links so we don't N+1
    dr_worker_counts: dict[int, int] = {}
    for row in db.query(models.DailyReportWorker).all():
        dr_worker_counts[row.daily_report_id] = dr_worker_counts.get(row.daily_report_id, 0) + 1

    hours_by_package: dict[int, float] = {p.id: 0.0 for p in packages}
    total_hours_on_site = 0.0
    for dr in daily_reports:
        if dr.no_work:
            continue
        n = dr_worker_counts.get(dr.id, 0)
        h = float(dr.avg_hours_per_worker or 0.0) * n
        hours_by_package[dr.package_id] = hours_by_package.get(dr.package_id, 0.0) + h
        total_hours_on_site += h

    # ── Incidents matrix: package × severity ─────────────────────────────────
    incidents = db.query(models.SafetyIncident).filter_by(project_id=pid).all()
    incidents_matrix: dict[int, dict[int, int]] = {p.id: {s.id: 0 for s in severities} for p in packages}
    incidents_total_per_pkg: dict[int, int] = {p.id: 0 for p in packages}
    incidents_total_per_sev: dict[int, int] = {s.id: 0 for s in severities}
    for inc in incidents:
        if inc.package_id in incidents_matrix and inc.severity_class_id in incidents_matrix[inc.package_id]:
            incidents_matrix[inc.package_id][inc.severity_class_id] += 1
            incidents_total_per_pkg[inc.package_id] += 1
            incidents_total_per_sev[inc.severity_class_id] += 1
    incidents_total = sum(incidents_total_per_pkg.values())

    # ── Observations matrices: package × category, split positive/negative ───
    observations = db.query(models.SafetyObservation).filter_by(project_id=pid).all()
    def empty_matrix(cats):
        return {p.id: {c.id: 0 for c in cats} for p in packages}
    neg_matrix = empty_matrix(neg_categories)
    pos_matrix = empty_matrix(pos_categories)
    neg_per_pkg = {p.id: 0 for p in packages}
    pos_per_pkg = {p.id: 0 for p in packages}
    neg_per_cat = {c.id: 0 for c in neg_categories}
    pos_per_cat = {c.id: 0 for c in pos_categories}
    for o in observations:
        if not o.category:
            continue
        if o.category.polarity == "POSITIVE":
            if o.package_id in pos_matrix and o.category_id in pos_matrix[o.package_id]:
                pos_matrix[o.package_id][o.category_id] += 1
                pos_per_pkg[o.package_id] += 1
                pos_per_cat[o.category_id] += 1
        else:
            if o.package_id in neg_matrix and o.category_id in neg_matrix[o.package_id]:
                neg_matrix[o.package_id][o.category_id] += 1
                neg_per_pkg[o.package_id] += 1
                neg_per_cat[o.category_id] += 1
    neg_total = sum(neg_per_pkg.values())
    pos_total = sum(pos_per_pkg.values())

    # ── Toolboxes per package (a toolbox can span multiple packages, count
    #    once per linked package; "total" counts each toolbox once) ──────────
    toolboxes = db.query(models.SafetyToolbox).all()
    toolboxes = [t for t in toolboxes if t.project_id == pid]
    toolboxes_per_pkg: dict[int, int] = {p.id: 0 for p in packages}
    for tbx in toolboxes:
        for link in tbx.packages:
            if link.package_id in toolboxes_per_pkg:
                toolboxes_per_pkg[link.package_id] += 1
    toolboxes_total = len(toolboxes)

    # ── Weekly trends ────────────────────────────────────────────────────────
    # Build the union of week-Monday dates spanning the earliest event we
    # know about up to today.
    candidate_dates: list = []
    for dr in daily_reports:
        if dr.report_date:
            try: candidate_dates.append(date.fromisoformat(dr.report_date))
            except Exception: pass
    for o in observations:
        if o.created_at: candidate_dates.append(o.created_at.date())
    for inc in incidents:
        if inc.created_at: candidate_dates.append(inc.created_at.date())
    for tbx in toolboxes:
        if tbx.created_at: candidate_dates.append(tbx.created_at.date())
    if candidate_dates:
        first = min(candidate_dates) - timedelta(days=min(candidate_dates).weekday())
    else:
        first = date.today() - timedelta(days=date.today().weekday())
    last  = date.today() - timedelta(days=date.today().weekday())

    weeks: list = []
    cur = first
    while cur <= last:
        iso = cur.isocalendar()
        weeks.append({
            "start": cur.isoformat(),
            "iso_week": iso[1],
            "iso_year": iso[0],
            "label": f"W{iso[1]:02d} '{str(iso[0])[-2:]}",
        })
        cur += timedelta(days=7)
    week_index = {w["start"]: i for i, w in enumerate(weeks)}

    def empty_trend():
        return [0] * len(weeks)
    def empty_trend_f():
        return [0.0] * len(weeks)

    # Per-package and total trends
    trend_per_pkg: dict[int, dict[str, list]] = {p.id: {
        "hours":     empty_trend_f(),
        "neg_obs":   empty_trend(),
        "incidents": empty_trend(),
        "toolboxes": empty_trend(),
    } for p in packages}
    trend_total = {
        "hours":     empty_trend_f(),
        "neg_obs":   empty_trend(),
        "incidents": empty_trend(),
        "toolboxes": empty_trend(),
    }

    def week_idx_of(d):
        monday = d - timedelta(days=d.weekday())
        return week_index.get(monday.isoformat())

    # Hours per week
    for dr in daily_reports:
        if dr.no_work or not dr.report_date:
            continue
        try:
            d = date.fromisoformat(dr.report_date)
        except Exception:
            continue
        idx = week_idx_of(d)
        if idx is None:
            continue
        n = dr_worker_counts.get(dr.id, 0)
        h = float(dr.avg_hours_per_worker or 0.0) * n
        if dr.package_id in trend_per_pkg:
            trend_per_pkg[dr.package_id]["hours"][idx] += h
        trend_total["hours"][idx] += h

    # Negative observations per week
    for o in observations:
        if not o.created_at or not o.category or o.category.polarity == "POSITIVE":
            continue
        idx = week_idx_of(o.created_at.date())
        if idx is None:
            continue
        if o.package_id in trend_per_pkg:
            trend_per_pkg[o.package_id]["neg_obs"][idx] += 1
        trend_total["neg_obs"][idx] += 1

    # Incidents per week
    for inc in incidents:
        if not inc.created_at:
            continue
        idx = week_idx_of(inc.created_at.date())
        if idx is None:
            continue
        if inc.package_id in trend_per_pkg:
            trend_per_pkg[inc.package_id]["incidents"][idx] += 1
        trend_total["incidents"][idx] += 1

    # Toolboxes per week (a multi-package toolbox counts +1 in each of its
    # packages' rows; total counts each toolbox once)
    for tbx in toolboxes:
        if not tbx.created_at:
            continue
        idx = week_idx_of(tbx.created_at.date())
        if idx is None:
            continue
        for link in tbx.packages:
            if link.package_id in trend_per_pkg:
                trend_per_pkg[link.package_id]["toolboxes"][idx] += 1
        trend_total["toolboxes"][idx] += 1

    return {
        "reference_hours": reference_hours,
        "total_hours_on_site": round(total_hours_on_site, 2),

        "packages":   [{"id": p.id, "tag": p.tag_number, "name": p.name} for p in packages],
        "severities": [{"id": s.id, "name": s.name, "level": s.level} for s in severities],
        "neg_categories": [{"id": c.id, "name": c.name} for c in neg_categories],
        "pos_categories": [{"id": c.id, "name": c.name} for c in pos_categories],

        "hours_by_package": {pid_: round(h, 2) for pid_, h in hours_by_package.items()},

        "incidents_matrix": incidents_matrix,
        "incidents_per_pkg": incidents_total_per_pkg,
        "incidents_per_sev": incidents_total_per_sev,
        "incidents_total":   incidents_total,

        "neg_obs_matrix": neg_matrix,
        "neg_obs_per_pkg": neg_per_pkg,
        "neg_obs_per_cat": neg_per_cat,
        "neg_obs_total":   neg_total,

        "pos_obs_matrix": pos_matrix,
        "pos_obs_per_pkg": pos_per_pkg,
        "pos_obs_per_cat": pos_per_cat,
        "pos_obs_total":   pos_total,

        "toolboxes_per_pkg": toolboxes_per_pkg,
        "toolboxes_total":   toolboxes_total,

        "weeks": weeks,
        "trend_per_pkg": trend_per_pkg,
        "trend_total":   trend_total,
    }
