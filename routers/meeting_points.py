from datetime import date as date_type, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
import models
import schemas
import auth
from routers.audit import set_created, set_updated, check_lock, audit_dict

router = APIRouter(prefix="/api/meeting-points", tags=["meeting-points"])


def _format_note(n: models.MeetingPointNote) -> dict:
    return {
        "id": n.id,
        "meeting_point_id": n.meeting_point_id,
        "meeting_id": n.meeting_id,
        "content": n.content,
        "created_at": n.created_at.isoformat() + 'Z' if n.created_at else None,
        "created_by_id": n.created_by_id,
        "author_name": n.author.name if n.author else None,
        "meeting_title": n.meeting.title if n.meeting else None,
    }


def _point_meeting_type_id(p: models.MeetingPoint) -> Optional[int]:
    """Return the meeting type id of any linked meeting (all linked meetings of a
    point share the same type by construction)."""
    for lnk in p.meeting_links:
        if lnk.meeting and lnk.meeting.meeting_type_id:
            return lnk.meeting.meeting_type_id
    return None


def _can_full_edit(p: models.MeetingPoint, user, db: Session) -> bool:
    """Full edit (create/update/delete/close/reopen) on a point.
    Granted to ADMIN, PROJECT_OWNER, and contacts of the meeting type's owning package.
    """
    if user.role in ("ADMIN", "PROJECT_OWNER"):
        return True
    mt_id = _point_meeting_type_id(p)
    if mt_id is None:
        return False
    return auth.is_owning_package_contact(user, mt_id, db)


def _has_read_access(p: models.MeetingPoint, user, db: Session) -> bool:
    """Read access — used to allow declare-done / add notes.

    Granted to: ADMIN/PROJECT_OWNER, the point's responsible, default
    participants of the meeting type, and per-meeting participants of any
    meeting this point is linked to.

    Owning-package contact status is NOT a view grant — it only upgrades to
    full edit on points the user can already see via one of the routes above.
    """
    if user.role in ("ADMIN", "PROJECT_OWNER"):
        return True
    if not user.contact_id:
        return False
    if p.responsible_id == user.contact_id:
        return True
    mt_id = _point_meeting_type_id(p)
    if mt_id is not None:
        is_default = db.query(models.MeetingTypeParticipant).filter(
            models.MeetingTypeParticipant.meeting_type_id == mt_id,
            models.MeetingTypeParticipant.contact_id == user.contact_id,
        ).first() is not None
        if is_default:
            return True
    # Per-meeting participant of any meeting that this point links to
    linked_meeting_ids = [lnk.meeting_id for lnk in p.meeting_links]
    if not linked_meeting_ids:
        return False
    return db.query(models.MeetingParticipant).filter(
        models.MeetingParticipant.meeting_id.in_(linked_meeting_ids),
        models.MeetingParticipant.contact_id == user.contact_id,
    ).first() is not None


def _format(p: models.MeetingPoint, attachment_count: int = 0,
            can_full_edit: bool = False, can_declare_done: bool = False) -> dict:
    return {
        "id": p.id,
        "seq_id": p.project_seq_id,
        "type": p.type,
        "topic": p.topic,
        "details": p.details,
        "responsible_id": p.responsible_id,
        "responsible_name": p.responsible.name if p.responsible else None,
        "responsible_company": p.responsible.company if p.responsible else None,
        "due_date": p.due_date,
        "status": p.status,
        "closed_at": p.closed_at.isoformat() + 'Z' if p.closed_at else None,
        "source_module": p.source_module or "Meeting Management",
        "created_at": p.created_at.isoformat() + 'Z' if p.created_at else None,
        "attachment_count": attachment_count,
        "meeting_type_id": _point_meeting_type_id(p),
        "meeting_ids": [lnk.meeting_id for lnk in p.meeting_links],
        "preparation_meeting_ids": [
            lnk.meeting_id for lnk in p.meeting_links if lnk.for_preparation
        ],
        "notes": [_format_note(n) for n in sorted(p.notes, key=lambda x: x.created_at or datetime.min)],
        "_perms": {
            "can_full_edit": can_full_edit,
            "can_declare_done": can_declare_done,
        },
        **audit_dict(p),
    }


def _format_with_perms(p: models.MeetingPoint, attachment_count: int, user, db: Session) -> dict:
    full = _can_full_edit(p, user, db)
    return _format(
        p,
        attachment_count=attachment_count,
        can_full_edit=full,
        can_declare_done=full or _has_read_access(p, user, db),
    )


def _attachment_counts(db: Session, point_ids: list[int]) -> dict[int, int]:
    if not point_ids:
        return {}
    rows = db.query(
        models.FileAttachment.record_id,
        func.count(models.FileAttachment.id),
    ).filter(
        models.FileAttachment.record_type == "meeting_point",
        models.FileAttachment.record_id.in_(point_ids),
    ).group_by(models.FileAttachment.record_id).all()
    return {r[0]: r[1] for r in rows}


@router.get("")
def list_points(
    meeting_id: Optional[int] = Query(None),
    meeting_type_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    point_type: Optional[str] = Query(None),
    responsible_id: Optional[int] = Query(None),
    for_preparation: Optional[bool] = Query(None),
    my_points: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    q = db.query(models.MeetingPoint).filter(
        models.MeetingPoint.project_id == user.project_id
    )

    # For non-privileged roles: filter points by the access matrix.
    # Visible points are the union of:
    #   a) responsible_id == user.contact_id
    #   b) points whose meeting type has user as a default participant (read on all points of that type)
    #   c) points linked to a meeting where user is declared-present (limited to that meeting)
    # Owning-package contact status grants edit rights but is NOT a view grant.
    # Only ADMIN and PROJECT_OWNER are unrestricted; every other role (including
    # PROJECT_TEAM) goes through this filter.
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        if not user.contact_id:
            return []
        allowed_point_ids: set[int] = set()

        default_type_ids = {r[0] for r in db.query(models.MeetingTypeParticipant.meeting_type_id).filter(
            models.MeetingTypeParticipant.contact_id == user.contact_id
        ).all()}
        if default_type_ids:
            rows = (
                db.query(models.MeetingPointLink.meeting_point_id)
                .join(models.Meeting, models.Meeting.id == models.MeetingPointLink.meeting_id)
                .filter(
                    models.Meeting.project_id == user.project_id,
                    models.Meeting.meeting_type_id.in_(default_type_ids),
                )
                .all()
            )
            allowed_point_ids.update(r[0] for r in rows)

        # Meetings where user is directly added as a participant — limited to points linked to those meetings
        direct_meeting_ids = {r[0] for r in db.query(models.MeetingParticipant.meeting_id).join(
            models.Meeting, models.Meeting.id == models.MeetingParticipant.meeting_id
        ).filter(
            models.MeetingParticipant.contact_id == user.contact_id,
            models.Meeting.project_id == user.project_id,
        ).all()}
        if direct_meeting_ids:
            rows = db.query(models.MeetingPointLink.meeting_point_id).filter(
                models.MeetingPointLink.meeting_id.in_(direct_meeting_ids)
            ).all()
            allowed_point_ids.update(r[0] for r in rows)

        # Points where user is the responsible
        rows = db.query(models.MeetingPoint.id).filter(
            models.MeetingPoint.project_id == user.project_id,
            models.MeetingPoint.responsible_id == user.contact_id,
        ).all()
        allowed_point_ids.update(r[0] for r in rows)

        if not allowed_point_ids:
            return []
        q = q.filter(models.MeetingPoint.id.in_(allowed_point_ids))

    if meeting_type_id:
        type_meeting_ids = db.query(models.Meeting.id).filter(
            models.Meeting.meeting_type_id == meeting_type_id,
            models.Meeting.project_id == user.project_id,
        ).subquery()
        type_point_ids = db.query(models.MeetingPointLink.meeting_point_id).filter(
            models.MeetingPointLink.meeting_id.in_(type_meeting_ids)
        ).subquery()
        q = q.filter(models.MeetingPoint.id.in_(type_point_ids))
    elif meeting_id:
        q = q.join(models.MeetingPointLink).filter(
            models.MeetingPointLink.meeting_id == meeting_id
        )
        if for_preparation is not None:
            q = q.filter(models.MeetingPointLink.for_preparation == for_preparation)

    if status:
        q = q.filter(models.MeetingPoint.status == status)
    if point_type:
        q = q.filter(models.MeetingPoint.type == point_type)
    if responsible_id:
        q = q.filter(models.MeetingPoint.responsible_id == responsible_id)
    if my_points and user.contact_id:
        q = q.filter(models.MeetingPoint.responsible_id == user.contact_id)

    points = q.order_by(models.MeetingPoint.created_at.desc()).all()
    counts = _attachment_counts(db, [p.id for p in points])
    return [_format_with_perms(p, counts.get(p.id, 0), user, db) for p in points]


def _load_point(db: Session, point_id: int, user) -> models.MeetingPoint:
    p = db.query(models.MeetingPoint).filter(
        models.MeetingPoint.id == point_id,
        models.MeetingPoint.project_id == user.project_id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Meeting point not found")
    return p


@router.get("/{point_id}")
def get_point(
    point_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    p = _load_point(db, point_id, user)
    counts = _attachment_counts(db, [p.id])
    return _format_with_perms(p, counts.get(p.id, 0), user, db)


@router.post("")
def create_point(
    data: schemas.MeetingPointCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    meeting = db.query(models.Meeting).filter(
        models.Meeting.id == data.meeting_id,
        models.Meeting.project_id == user.project_id,
    ).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Only ADMIN/PROJECT_OWNER or owning-package contacts of the meeting type can create points.
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        if not meeting.meeting_type_id:
            raise HTTPException(status_code=403, detail="Meeting type missing — cannot create point")
        if not auth.is_owning_package_contact(user, meeting.meeting_type_id, db):
            raise HTTPException(status_code=403, detail="Only owning-package contacts can create points for this meeting type")

    point = models.MeetingPoint(
        project_id=user.project_id,
        project_seq_id=models.next_project_seq(db, models.MeetingPoint, user.project_id),
        type=data.type,
        topic=data.topic,
        details=data.details,
        responsible_id=data.responsible_id,
        due_date=data.due_date,
        status=data.status,
    )
    set_created(point, user.id)
    db.add(point)
    db.flush()

    link = models.MeetingPointLink(
        meeting_point_id=point.id,
        meeting_id=data.meeting_id,
        for_preparation=data.for_preparation,
    )
    db.add(link)
    db.commit()
    db.refresh(point)
    counts = _attachment_counts(db, [point.id])
    return _format_with_perms(point, counts.get(point.id, 0), user, db)


@router.put("/{point_id}")
def update_point(
    point_id: int,
    data: schemas.MeetingPointUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    p = _load_point(db, point_id, user)
    if not _can_full_edit(p, user, db):
        raise HTTPException(status_code=403, detail="Only owning-package contacts can edit this point")
    check_lock(p.updated_at, data.updated_at, "meeting point")
    for field, value in data.model_dump(exclude_none=True, exclude={"updated_at"}).items():
        setattr(p, field, value)
    set_updated(p, user.id)
    db.commit()
    db.refresh(p)
    counts = _attachment_counts(db, [p.id])
    return _format_with_perms(p, counts.get(p.id, 0), user, db)


@router.post("/{point_id}/close")
def close_point(
    point_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    p = _load_point(db, point_id, user)
    if not _can_full_edit(p, user, db):
        raise HTTPException(status_code=403, detail="Only owning-package contacts can close this point")
    p.status = "CLOSED"
    p.closed_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    counts = _attachment_counts(db, [p.id])
    return _format_with_perms(p, counts.get(p.id, 0), user, db)


@router.post("/{point_id}/reopen")
def reopen_point(
    point_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    p = _load_point(db, point_id, user)
    if not _can_full_edit(p, user, db):
        raise HTTPException(status_code=403, detail="Only owning-package contacts can reopen this point")
    p.status = "IN_PROGRESS"
    p.closed_at = None
    db.commit()
    db.refresh(p)
    counts = _attachment_counts(db, [p.id])
    return _format_with_perms(p, counts.get(p.id, 0), user, db)


@router.post("/{point_id}/declare-done")
def declare_done(
    point_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Set status to DECLARED_DONE. Available to anyone with read access on the
    point (responsible, default participant, declared-present participant, or
    owning-package contact). Owning-package contacts then close or reopen."""
    p = _load_point(db, point_id, user)
    if not (_can_full_edit(p, user, db) or _has_read_access(p, user, db)):
        raise HTTPException(status_code=403, detail="No access to this point")
    p.status = "DECLARED_DONE"
    p.closed_at = None
    db.commit()
    db.refresh(p)
    counts = _attachment_counts(db, [p.id])
    return _format_with_perms(p, counts.get(p.id, 0), user, db)


@router.delete("/{point_id}")
def delete_point(
    point_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    p = _load_point(db, point_id, user)
    if not _can_full_edit(p, user, db):
        raise HTTPException(status_code=403, detail="Only owning-package contacts can delete this point")
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.post("/{point_id}/link")
def link_to_meeting(
    point_id: int,
    data: schemas.MeetingPointLinkCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    p = db.query(models.MeetingPoint).filter(
        models.MeetingPoint.id == point_id,
        models.MeetingPoint.project_id == user.project_id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Meeting point not found")
    existing = db.query(models.MeetingPointLink).filter(
        models.MeetingPointLink.meeting_point_id == point_id,
        models.MeetingPointLink.meeting_id == data.meeting_id,
    ).first()
    if existing:
        existing.for_preparation = data.for_preparation
    else:
        db.add(models.MeetingPointLink(
            meeting_point_id=point_id,
            meeting_id=data.meeting_id,
            for_preparation=data.for_preparation,
        ))
    db.commit()
    db.refresh(p)
    counts = _attachment_counts(db, [p.id])
    return _format_with_perms(p, counts.get(p.id, 0), user, db)


@router.put("/{point_id}/preparation")
def toggle_preparation(
    point_id: int,
    meeting_id: int,
    for_preparation: bool,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    link = db.query(models.MeetingPointLink).filter(
        models.MeetingPointLink.meeting_point_id == point_id,
        models.MeetingPointLink.meeting_id == meeting_id,
    ).first()
    if not link:
        if for_preparation:
            # Point exists in another meeting of the same type — create the link
            link = models.MeetingPointLink(
                meeting_point_id=point_id,
                meeting_id=meeting_id,
                for_preparation=True,
            )
            db.add(link)
        # If unsetting and no link exists, nothing to do
    else:
        link.for_preparation = for_preparation
    db.commit()
    return {"ok": True}


# ── Notes ─────────────────────────────────────────────────────────────────────

@router.post("/{point_id}/notes")
def add_note(
    point_id: int,
    data: schemas.MeetingPointNoteCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    p = _load_point(db, point_id, user)
    if not (_can_full_edit(p, user, db) or _has_read_access(p, user, db)):
        raise HTTPException(status_code=403, detail="No access to this point")
    note = models.MeetingPointNote(
        meeting_point_id=point_id,
        meeting_id=data.meeting_id,
        content=data.content,
        created_by_id=user.id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return _format_note(note)


@router.put("/{point_id}/notes/{note_id}")
def update_note(
    point_id: int,
    note_id: int,
    data: schemas.MeetingPointNoteCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    note = db.query(models.MeetingPointNote).filter(
        models.MeetingPointNote.id == note_id,
        models.MeetingPointNote.meeting_point_id == point_id,
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.content = data.content
    db.commit()
    db.refresh(note)
    return _format_note(note)


@router.delete("/{point_id}/notes/{note_id}")
def delete_note(
    point_id: int,
    note_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    note = db.query(models.MeetingPointNote).filter(
        models.MeetingPointNote.id == note_id,
        models.MeetingPointNote.meeting_point_id == point_id,
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return {"ok": True}
