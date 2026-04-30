import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
import schemas
import auth
from routers.audit import set_created, set_updated, check_lock, audit_dict

router = APIRouter(prefix="/api/meeting-types", tags=["meeting-types"])


def _parse_days(mt: models.MeetingType):
    """Return days_of_week as a Python list, handling legacy day_of_week."""
    if mt.days_of_week:
        try:
            return json.loads(mt.days_of_week)
        except Exception:
            pass
    # legacy: single day_of_week stored directly
    if mt.day_of_week is not None and mt.recurrence != "MONTHLY":
        return [mt.day_of_week]
    return []


def _owning_package_contact_ids(mt: models.MeetingType) -> list[int]:
    pkg = mt.owning_package
    if not pkg:
        return []
    return [pc.contact_id for pc in pkg.package_contacts]


def _format(mt: models.MeetingType) -> dict:
    return {
        "id": mt.id,
        "name": mt.name,
        "description": mt.description,
        "is_recurrent": bool(mt.is_recurrent),
        "recurrence": mt.recurrence,
        "days_of_week": _parse_days(mt),        # [0,2,4] for DAILY/WEEKLY/BIWEEKLY
        "day_of_week": mt.day_of_week,           # int for MONTHLY
        "monthly_week_position": mt.monthly_week_position,
        "recurrence_time": mt.recurrence_time,
        "duration": mt.duration,
        "owning_package_id": mt.owning_package_id,
        "owning_package_tag": mt.owning_package.tag_number if mt.owning_package else None,
        "owning_package_name": mt.owning_package.name if mt.owning_package else None,
        "owning_package_contact_ids": _owning_package_contact_ids(mt),
        "participant_ids": [p.contact_id for p in mt.participants],
        **audit_dict(mt),
    }


@router.get("")
def list_meeting_types(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    type_ids = auth.get_user_accessible_meeting_type_ids(user, db)
    q = db.query(models.MeetingType).filter(
        models.MeetingType.project_id == user.project_id
    ).order_by(models.MeetingType.name)
    if type_ids is not None:
        if not type_ids:
            return []
        q = q.filter(models.MeetingType.id.in_(type_ids))
    return [_format(mt) for mt in q.all()]


@router.get("/all-recurring")
def list_all_recurring_meeting_types(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Read-only list of all recurring meeting types in the project.
    Visible to every project contact except BIDDER (transparency for the team)."""
    if user.role == "BIDDER":
        raise HTTPException(status_code=403, detail="Not allowed")
    q = db.query(models.MeetingType).filter(
        models.MeetingType.project_id == user.project_id,
        models.MeetingType.is_recurrent == True,
    ).order_by(models.MeetingType.name)
    return [_format(mt) for mt in q.all()]


@router.get("/{mt_id}")
def get_meeting_type(
    mt_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    mt = db.query(models.MeetingType).filter(
        models.MeetingType.id == mt_id,
        models.MeetingType.project_id == user.project_id,
    ).first()
    if not mt:
        raise HTTPException(status_code=404, detail="Meeting type not found")
    return _format(mt)


def _validate_owning_package(user, package_id: int, db: Session) -> None:
    """Owning package must belong to the project. Non-admin/owner users can only
    pick packages where they are a linked contact."""
    pkg = db.query(models.Package).filter(
        models.Package.id == package_id,
        models.Package.project_id == user.project_id,
    ).first()
    if not pkg:
        raise HTTPException(status_code=422, detail="Owning package does not exist in this project")
    if user.role in ("ADMIN", "PROJECT_OWNER"):
        return
    if not user.contact_id:
        raise HTTPException(status_code=403, detail="No contact linked to your account")
    is_linked = db.query(models.PackageContact).filter(
        models.PackageContact.package_id == package_id,
        models.PackageContact.contact_id == user.contact_id,
    ).first() is not None
    if not is_linked:
        raise HTTPException(status_code=403, detail="You can only pick a package you are a linked contact of")


@router.post("")
def create_meeting_type(
    data: schemas.MeetingTypeCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(status_code=403, detail="Bidders cannot create meeting types")
    if data.owning_package_id is not None:
        _validate_owning_package(user, data.owning_package_id, db)
    mt = models.MeetingType(
        project_id=user.project_id,
        name=data.name,
        description=data.description,
        is_recurrent=data.is_recurrent,
        recurrence=data.recurrence if data.is_recurrent else None,
        days_of_week=json.dumps(data.days_of_week) if data.is_recurrent and data.days_of_week is not None else None,
        day_of_week=data.day_of_week if data.is_recurrent and data.recurrence == "MONTHLY" else None,
        monthly_week_position=data.monthly_week_position if data.is_recurrent and data.recurrence == "MONTHLY" else None,
        recurrence_time=data.recurrence_time if data.is_recurrent else None,
        duration=data.duration if data.is_recurrent else None,
        owning_package_id=data.owning_package_id,
    )
    set_created(mt, user.id)
    db.add(mt)
    db.flush()
    for cid in data.participant_ids:
        db.add(models.MeetingTypeParticipant(meeting_type_id=mt.id, contact_id=cid))
    db.commit()
    db.refresh(mt)
    return _format(mt)


@router.put("/{mt_id}")
def update_meeting_type(
    mt_id: int,
    data: schemas.MeetingTypeUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(status_code=403, detail="Bidders cannot edit meeting types")
    mt = db.query(models.MeetingType).filter(
        models.MeetingType.id == mt_id,
        models.MeetingType.project_id == user.project_id,
    ).first()
    if not mt:
        raise HTTPException(status_code=404, detail="Meeting type not found")
    check_lock(mt.updated_at, data.updated_at, "meeting type")
    if data.name is not None:
        mt.name = data.name
    if data.description is not None:
        mt.description = data.description
    if data.is_recurrent is not None:
        mt.is_recurrent = data.is_recurrent
        if not data.is_recurrent:
            mt.recurrence = None
            mt.days_of_week = None
            mt.day_of_week = None
            mt.monthly_week_position = None
            mt.recurrence_time = None
            mt.duration = None
    if data.recurrence is not None:
        mt.recurrence = data.recurrence
    if data.days_of_week is not None:
        mt.days_of_week = json.dumps(data.days_of_week)
    if data.day_of_week is not None:
        mt.day_of_week = data.day_of_week
    if data.monthly_week_position is not None:
        mt.monthly_week_position = data.monthly_week_position
    if data.recurrence_time is not None:
        mt.recurrence_time = data.recurrence_time
    if data.duration is not None:
        mt.duration = data.duration
    if data.owning_package_id is not None:
        _validate_owning_package(user, data.owning_package_id, db)
        mt.owning_package_id = data.owning_package_id
    if data.participant_ids is not None:
        db.query(models.MeetingTypeParticipant).filter(
            models.MeetingTypeParticipant.meeting_type_id == mt_id
        ).delete()
        for cid in data.participant_ids:
            db.add(models.MeetingTypeParticipant(meeting_type_id=mt_id, contact_id=cid))
    set_updated(mt, user.id)
    db.commit()
    db.refresh(mt)
    return _format(mt)


@router.delete("/{mt_id}")
def delete_meeting_type(
    mt_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role == "BIDDER":
        raise HTTPException(status_code=403, detail="Bidders cannot delete meeting types")
    mt = db.query(models.MeetingType).filter(
        models.MeetingType.id == mt_id,
        models.MeetingType.project_id == user.project_id,
    ).first()
    if not mt:
        raise HTTPException(status_code=404, detail="Meeting type not found")
    db.delete(mt)
    db.commit()
    return {"ok": True}
