import io
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
import models
import auth
import storage

router = APIRouter(tags=["areas-units"])

UPLOAD_ROOT = Path("uploads")
ALLOWED_FLOORPLAN_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/pjpeg"}
ALLOWED_FLOORPLAN_EXTS = {".jpg", ".jpeg", ".png"}
MAX_FLOORPLAN_SIZE = 25 * 1024 * 1024  # 25 MB


def _sanitize(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', str(name)).strip("_. ") or "unknown"

# Roles whose linked contacts are eligible to act as site supervisor on an area.
SUPERVISOR_ROLES = {"PROJECT_OWNER", "PROJECT_TEAM", "CLIENT"}


# ── Schemas ───────────────────────────────────────────────────────────────────

class AreaCreate(BaseModel):
    tag: str
    description: str
    details: Optional[str] = None
    owner_id: Optional[int] = None
    site_supervisor_ids: Optional[List[int]] = None

class AreaUpdate(AreaCreate):
    updated_at: Optional[datetime] = None

class UnitCreate(BaseModel):
    tag: str
    description: str
    details: Optional[str] = None
    owner_id: Optional[int] = None

class UnitUpdate(UnitCreate):
    updated_at: Optional[datetime] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_eligible_supervisor(db: Session, project_id: int, contact_id: int) -> bool:
    """True when the contact is linked to a user who has PROJECT_OWNER /
    PROJECT_TEAM / CLIENT role on this project. Also accepts contacts whose
    *user-level* role (on the users table) is ADMIN / PROJECT_OWNER (admins
    can always supervise). Returns False if no user is linked."""
    user = db.query(models.User).filter(models.User.contact_id == contact_id).first()
    if not user:
        return False
    if user.role == "ADMIN":
        return True
    # Role within the project (stored on user_projects)
    up = db.query(models.UserProject).filter_by(
        user_id=user.id, project_id=project_id,
    ).first()
    project_role = up.role if up else user.role
    return project_role in SUPERVISOR_ROLES


def _apply_supervisors(db: Session, area: models.Area, contact_ids: Optional[List[int]]):
    """Replace the set of site supervisors on an area. None = leave unchanged."""
    if contact_ids is None:
        return
    # Validate every supplied contact id
    cleaned = []
    for cid in contact_ids:
        if cid is None: continue
        if not _is_eligible_supervisor(db, area.project_id, cid):
            raise HTTPException(
                status_code=400,
                detail=f"Contact {cid} is not eligible as site supervisor "
                       "(must be linked to a Project Owner, Project Team or Client user).",
            )
        cleaned.append(cid)
    # Remove old, insert new (unique set)
    db.query(models.AreaSiteSupervisor).filter_by(area_id=area.id).delete()
    db.flush()
    for cid in set(cleaned):
        db.add(models.AreaSiteSupervisor(area_id=area.id, contact_id=cid))


# ── Formatters ────────────────────────────────────────────────────────────────

def _fmt_area(a: models.Area) -> dict:
    supervisors = []
    for ss in (a.site_supervisors or []):
        c = ss.contact
        if c:
            supervisors.append({"id": c.id, "name": c.name, "company": c.company})
    return {
        "id": a.id,
        "tag": a.tag,
        "description": a.description,
        "details": a.details,
        "owner_id": a.owner_id,
        "owner_name": a.owner.name if a.owner else None,
        "site_supervisor_ids": [s["id"] for s in supervisors],
        "site_supervisors": supervisors,
        "floorplan_id": a.floorplan_id,
        "floorplan_name": a.floorplan.name if a.floorplan else None,
        "created_at": a.created_at.isoformat() + 'Z' if a.created_at else None,
        "updated_at": a.updated_at.isoformat() + 'Z' if a.updated_at else None,
    }

def _fmt_unit(u: models.Unit) -> dict:
    return {
        "id": u.id,
        "tag": u.tag,
        "description": u.description,
        "details": u.details,
        "owner_id": u.owner_id,
        "owner_name": u.owner.name if u.owner else None,
        "created_at": u.created_at.isoformat() + 'Z' if u.created_at else None,
        "updated_at": u.updated_at.isoformat() + 'Z' if u.updated_at else None,
    }


# ── Areas ─────────────────────────────────────────────────────────────────────

area_router = APIRouter(prefix="/api/areas", tags=["areas"])

@area_router.get("")
def list_areas(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    items = db.query(models.Area).filter(
        models.Area.project_id == user.project_id
    ).order_by(models.Area.tag).all()
    return [_fmt_area(a) for a in items]


@area_router.get("/eligible-supervisors")
def list_eligible_supervisors(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Contacts whose linked user has PROJECT_OWNER / PROJECT_TEAM / CLIENT
    role on this project — the only roles allowed as site supervisor."""
    rows = (
        db.query(models.Contact, models.User, models.UserProject)
          .join(models.User, models.User.contact_id == models.Contact.id)
          .outerjoin(
              models.UserProject,
              (models.UserProject.user_id == models.User.id)
              & (models.UserProject.project_id == user.project_id),
          )
          .filter(models.Contact.project_id == user.project_id)
          .all()
    )
    out = []
    for (c, u, up) in rows:
        project_role = (up.role if up else u.role) if u else None
        if u and (u.role == "ADMIN" or project_role in SUPERVISOR_ROLES):
            out.append({
                "id": c.id, "name": c.name, "company": c.company,
                "role": project_role or u.role,
            })
    out.sort(key=lambda x: (x["name"] or "").lower())
    return out


@area_router.post("")
def create_area(
    data: AreaCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only project owners can create areas")
    if not data.tag.strip():
        raise HTTPException(status_code=400, detail="Tag is required")
    if not data.description.strip():
        raise HTTPException(status_code=400, detail="Description is required")
    area = models.Area(
        project_id=user.project_id,
        tag=data.tag.strip(),
        description=data.description.strip(),
        details=data.details,
        owner_id=data.owner_id,
        created_by_id=user.id,
    )
    db.add(area)
    db.flush()
    _apply_supervisors(db, area, data.site_supervisor_ids)
    db.commit()
    db.refresh(area)
    return _fmt_area(area)


@area_router.put("/{area_id}")
def update_area(
    area_id: int,
    data: AreaUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only project owners can edit areas")
    area = db.query(models.Area).filter(
        models.Area.id == area_id,
        models.Area.project_id == user.project_id,
    ).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    if not data.tag.strip():
        raise HTTPException(status_code=400, detail="Tag is required")
    if not data.description.strip():
        raise HTTPException(status_code=400, detail="Description is required")
    area.tag = data.tag.strip()
    area.description = data.description.strip()
    area.details = data.details
    area.owner_id = data.owner_id
    area.updated_at = datetime.utcnow()
    area.updated_by_id = user.id
    _apply_supervisors(db, area, data.site_supervisor_ids)
    db.commit()
    db.refresh(area)

    # Auto-approve any PENDING document review rows whose area-sourced reviewer
    # was just cleared.
    try:
        from routers.documents import sweep_auto_approve_cleared_sources
        affected_doc_ids = [
            d.id for d in db.query(models.Document.id).filter(
                models.Document.area_id == area_id,
                models.Document.status == "IN_REVIEW",
            ).all()
        ]
        if affected_doc_ids:
            sweep_auto_approve_cleared_sources(affected_doc_ids, db=db)
            db.commit()
    except Exception:
        pass

    return _fmt_area(area)


@area_router.delete("/{area_id}")
def delete_area(
    area_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only project owners can delete areas")
    area = db.query(models.Area).filter(
        models.Area.id == area_id,
        models.Area.project_id == user.project_id,
    ).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")
    db.delete(area)
    db.commit()
    return {"ok": True}


# ── Units ─────────────────────────────────────────────────────────────────────

unit_router = APIRouter(prefix="/api/units", tags=["units"])

@unit_router.get("")
def list_units(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    items = db.query(models.Unit).filter(
        models.Unit.project_id == user.project_id
    ).order_by(models.Unit.tag).all()
    return [_fmt_unit(u) for u in items]


@unit_router.post("")
def create_unit(
    data: UnitCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only project owners can create units")
    if not data.tag.strip():
        raise HTTPException(status_code=400, detail="Tag is required")
    if not data.description.strip():
        raise HTTPException(status_code=400, detail="Description is required")
    unit = models.Unit(
        project_id=user.project_id,
        tag=data.tag.strip(),
        description=data.description.strip(),
        details=data.details,
        owner_id=data.owner_id,
        created_by_id=user.id,
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return _fmt_unit(unit)


@unit_router.put("/{unit_id}")
def update_unit(
    unit_id: int,
    data: UnitUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only project owners can edit units")
    unit = db.query(models.Unit).filter(
        models.Unit.id == unit_id,
        models.Unit.project_id == user.project_id,
    ).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    if not data.tag.strip():
        raise HTTPException(status_code=400, detail="Tag is required")
    if not data.description.strip():
        raise HTTPException(status_code=400, detail="Description is required")
    unit.tag = data.tag.strip()
    unit.description = data.description.strip()
    unit.details = data.details
    unit.owner_id = data.owner_id
    unit.updated_at = datetime.utcnow()
    unit.updated_by_id = user.id
    db.commit()
    db.refresh(unit)

    # Auto-approve any PENDING document review rows whose unit-sourced reviewer
    # was just cleared.
    try:
        from routers.documents import sweep_auto_approve_cleared_sources
        affected_doc_ids = [
            d.id for d in db.query(models.Document.id).filter(
                models.Document.unit_id == unit_id,
                models.Document.status == "IN_REVIEW",
            ).all()
        ]
        if affected_doc_ids:
            sweep_auto_approve_cleared_sources(affected_doc_ids, db=db)
            db.commit()
    except Exception:
        pass

    return _fmt_unit(unit)


@unit_router.delete("/{unit_id}")
def delete_unit(
    unit_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only project owners can delete units")
    unit = db.query(models.Unit).filter(
        models.Unit.id == unit_id,
        models.Unit.project_id == user.project_id,
    ).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    db.delete(unit)
    db.commit()
    return {"ok": True}


# ── Floorplans ────────────────────────────────────────────────────────────────

floorplan_router = APIRouter(prefix="/api/floorplans", tags=["floorplans"])


def _fmt_floorplan(fp: models.Floorplan, db: Session) -> dict:
    linked = (
        db.query(models.Area)
          .filter(models.Area.floorplan_id == fp.id)
          .order_by(models.Area.tag)
          .all()
    )
    safety_pins = db.query(models.SafetyObservation).filter(
        models.SafetyObservation.floorplan_id == fp.id,
        models.SafetyObservation.floorplan_x.isnot(None),
        models.SafetyObservation.floorplan_y.isnot(None),
    ).count()
    punch_pins = db.query(models.PunchItem).filter(
        models.PunchItem.floorplan_id == fp.id,
        models.PunchItem.floorplan_x.isnot(None),
        models.PunchItem.floorplan_y.isnot(None),
    ).count()
    return {
        "id": fp.id,
        "name": fp.name,
        "original_filename": fp.original_filename,
        "content_type": fp.content_type,
        "file_size": fp.file_size,
        "image_url": f"/api/floorplans/{fp.id}/image",
        "uploaded_at": fp.uploaded_at.isoformat() + 'Z' if fp.uploaded_at else None,
        "uploaded_by_id": fp.uploaded_by_id,
        "uploaded_by_name": fp.uploaded_by.name if fp.uploaded_by else None,
        "areas": [
            {"id": a.id, "tag": a.tag, "description": a.description}
            for a in linked
        ],
        "area_ids": [a.id for a in linked],
        "safety_pin_count": safety_pins,
        "punch_pin_count": punch_pins,
        "pin_count": safety_pins + punch_pins,
    }


def _apply_area_links(db: Session, floorplan: models.Floorplan, area_ids: List[int]):
    """Set this floorplan as the linked plan for the given areas, and unlink it
    from any area that is no longer in the list. Areas must belong to the same
    project as the floorplan."""
    target = set(int(x) for x in (area_ids or []) if x is not None)
    # Validate areas belong to this project
    if target:
        valid_rows = db.query(models.Area.id).filter(
            models.Area.project_id == floorplan.project_id,
            models.Area.id.in_(target),
        ).all()
        valid = {r[0] for r in valid_rows}
        bad = target - valid
        if bad:
            raise HTTPException(400, f"Areas not in this project: {sorted(bad)}")
    # Unlink areas that previously pointed at this floorplan but are no longer in the set
    q_unlink = db.query(models.Area).filter(models.Area.floorplan_id == floorplan.id)
    if target:
        q_unlink = q_unlink.filter(~models.Area.id.in_(target))
    q_unlink.update({models.Area.floorplan_id: None}, synchronize_session=False)
    # Link the new set (overrides any other floorplan they were pointing at)
    if target:
        db.query(models.Area).filter(
            models.Area.project_id == floorplan.project_id,
            models.Area.id.in_(target),
        ).update({models.Area.floorplan_id: floorplan.id}, synchronize_session=False)


@floorplan_router.get("")
def list_floorplans(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    items = (
        db.query(models.Floorplan)
          .filter(models.Floorplan.project_id == user.project_id)
          .order_by(models.Floorplan.uploaded_at.desc().nullslast(), models.Floorplan.id.desc())
          .all()
    )
    return [_fmt_floorplan(fp, db) for fp in items]


@floorplan_router.post("/upload")
async def upload_floorplan(
    name: str = Form(...),
    area_ids: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(403, "Only project owners can upload floorplans")
    name = (name or "").strip()
    if not name:
        raise HTTPException(400, "Name is required")

    raw_name = file.filename or "floorplan"
    ext = Path(raw_name).suffix.lower()
    ctype = (file.content_type or "").lower()
    if ext not in ALLOWED_FLOORPLAN_EXTS or ctype not in ALLOWED_FLOORPLAN_TYPES:
        raise HTTPException(400, "Only JPG and PNG files are accepted")

    content = await file.read()
    if len(content) > MAX_FLOORPLAN_SIZE:
        raise HTTPException(400, f"File exceeds maximum size of {MAX_FLOORPLAN_SIZE // (1024*1024)} MB")
    if not content:
        raise HTTPException(400, "Uploaded file is empty")

    project = db.query(models.Project).filter_by(id=user.project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # Parse area ids (comma-separated)
    parsed_ids: List[int] = []
    for chunk in (area_ids or "").split(","):
        chunk = chunk.strip()
        if chunk:
            try:
                parsed_ids.append(int(chunk))
            except ValueError:
                raise HTTPException(400, f"Invalid area id: {chunk}")

    # Persist file
    stem = _sanitize(Path(raw_name).stem) or "floorplan"
    stem = stem[:60]
    uid8 = uuid.uuid4().hex[:8]
    stored_name = f"FP_{stem}_{uid8}{ext}"
    stored_path_str = str(Path(_sanitize(project.project_number)) / "Floor Plans" / stored_name)
    storage.upload_file(stored_path_str, content, ctype)

    fp = models.Floorplan(
        project_id=user.project_id,
        name=name,
        stored_path=stored_path_str,
        original_filename=raw_name,
        content_type=ctype,
        file_size=len(content),
        uploaded_at=datetime.utcnow(),
        uploaded_by_id=user.id,
    )
    db.add(fp)
    db.flush()
    _apply_area_links(db, fp, parsed_ids)
    db.commit()
    db.refresh(fp)
    return _fmt_floorplan(fp, db)


@floorplan_router.get("/{floorplan_id}/image")
def get_floorplan_image(
    floorplan_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    fp = db.query(models.Floorplan).filter(
        models.Floorplan.id == floorplan_id,
        models.Floorplan.project_id == user.project_id,
    ).first()
    if not fp:
        raise HTTPException(404, "Floorplan not found")
    file_bytes = storage.get_file_bytes(fp.stored_path)
    if file_bytes is None:
        raise HTTPException(404, "Floorplan file not found")
    fname = fp.original_filename or Path(fp.stored_path).name
    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=fp.content_type or "image/jpeg",
        headers={"Content-Disposition": f'inline; filename="{fname}"'},
    )


class FloorplanUpdate(BaseModel):
    name: Optional[str] = None
    area_ids: Optional[List[int]] = None


@floorplan_router.put("/{floorplan_id}")
def update_floorplan(
    floorplan_id: int,
    data: FloorplanUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(403, "Only project owners can edit floorplans")
    fp = db.query(models.Floorplan).filter(
        models.Floorplan.id == floorplan_id,
        models.Floorplan.project_id == user.project_id,
    ).first()
    if not fp:
        raise HTTPException(404, "Floorplan not found")
    if data.name is not None:
        n = data.name.strip()
        if not n:
            raise HTTPException(400, "Name is required")
        fp.name = n
    if data.area_ids is not None:
        _apply_area_links(db, fp, data.area_ids)
    db.commit()
    db.refresh(fp)
    return _fmt_floorplan(fp, db)


@floorplan_router.delete("/{floorplan_id}")
def delete_floorplan(
    floorplan_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(403, "Only project owners can delete floorplans")
    fp = db.query(models.Floorplan).filter(
        models.Floorplan.id == floorplan_id,
        models.Floorplan.project_id == user.project_id,
    ).first()
    if not fp:
        raise HTTPException(404, "Floorplan not found")
    # Unlink from any areas
    db.query(models.Area).filter(
        models.Area.floorplan_id == fp.id
    ).update({models.Area.floorplan_id: None}, synchronize_session=False)
    # Best-effort delete of the underlying file
    try:
        storage.delete_file(fp.stored_path)
    except Exception:
        pass
    db.delete(fp)
    db.commit()
    return {"ok": True}


# Inline assignment from the area list
class AreaFloorplanSet(BaseModel):
    floorplan_id: Optional[int] = None


@area_router.put("/{area_id}/floorplan")
def set_area_floorplan(
    area_id: int,
    data: AreaFloorplanSet,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(403, "Only project owners can change the area floorplan")
    area = db.query(models.Area).filter(
        models.Area.id == area_id,
        models.Area.project_id == user.project_id,
    ).first()
    if not area:
        raise HTTPException(404, "Area not found")
    if data.floorplan_id is not None:
        fp = db.query(models.Floorplan).filter(
            models.Floorplan.id == data.floorplan_id,
            models.Floorplan.project_id == user.project_id,
        ).first()
        if not fp:
            raise HTTPException(400, "Floorplan not found in this project")
    area.floorplan_id = data.floorplan_id
    area.updated_at = datetime.utcnow()
    area.updated_by_id = user.id
    db.commit()
    db.refresh(area)
    return _fmt_area(area)
