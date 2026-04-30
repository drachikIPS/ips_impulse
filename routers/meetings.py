import json as _json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
import models
import schemas
import auth
from routers.audit import set_created, set_updated, check_lock, audit_dict

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def _mt_days(mt: models.MeetingType) -> list[int]:
    """Return list of weekday ints (0=Mon..6=Sun) for non-MONTHLY recurrence."""
    if mt.days_of_week:
        try:
            return _json.loads(mt.days_of_week)
        except Exception:
            return []
    if mt.day_of_week is not None and mt.recurrence != "MONTHLY":
        return [mt.day_of_week]
    return []


def _generate_recurrent_dates(mt: models.MeetingType, start: date, finish: date) -> list[date]:
    if not mt.is_recurrent or not mt.recurrence or start > finish:
        return []
    rec = mt.recurrence
    if rec == "MONTHLY":
        if mt.day_of_week is None or mt.monthly_week_position is None:
            return []
        out: list[date] = []
        y, m = start.year, start.month
        while (y, m) <= (finish.year, finish.month):
            first = date(y, m, 1)
            offset = (mt.day_of_week - first.weekday()) % 7
            first_match = first + timedelta(days=offset)
            if mt.monthly_week_position == 5:
                target = first_match
                while True:
                    nxt = target + timedelta(days=7)
                    if nxt.month != m:
                        break
                    target = nxt
            else:
                target = first_match + timedelta(days=7 * (mt.monthly_week_position - 1))
                if target.month != m:
                    target = None
            if target and start <= target <= finish:
                out.append(target)
            if m == 12:
                y, m = y + 1, 1
            else:
                m += 1
        return out
    days = _mt_days(mt)
    if not days:
        return []
    out: list[date] = []
    if rec == "BIWEEKLY":
        anchor = start - timedelta(days=start.weekday())  # Monday of start week
        cur = start
        while cur <= finish:
            if cur.weekday() in days and ((cur - anchor).days // 7) % 2 == 0:
                out.append(cur)
            cur += timedelta(days=1)
        return out
    # DAILY / WEEKLY: every matching weekday
    cur = start
    while cur <= finish:
        if cur.weekday() in days:
            out.append(cur)
        cur += timedelta(days=1)
    return out


class BulkRecurringRequest(BaseModel):
    meeting_type_id: int
    start_date: str
    finish_date: str
    dry_run: bool = False


def _can_create_meeting_of_type(user, meeting_type_id: int, db: Session) -> bool:
    """Meeting creation rule: ADMIN/PROJECT_OWNER, or a user who is BOTH a contact
    of the meeting type's owning package AND a default participant of the type.
    """
    if user.role in ("ADMIN", "PROJECT_OWNER"):
        return True
    if not user.contact_id or not meeting_type_id:
        return False
    if not auth.is_owning_package_contact(user, meeting_type_id, db):
        return False
    return db.query(models.MeetingTypeParticipant).filter(
        models.MeetingTypeParticipant.meeting_type_id == meeting_type_id,
        models.MeetingTypeParticipant.contact_id == user.contact_id,
    ).first() is not None


def _format(m: models.Meeting) -> dict:
    return {
        "id": m.id,
        "title": m.title,
        "date": m.date,
        "time": m.time,
        "location": m.location,
        "meeting_type_id": m.meeting_type_id,
        "meeting_type_name": m.meeting_type.name if m.meeting_type else None,
        "status": m.status,
        "notes": m.notes,
        "created_at": m.created_at.isoformat() + 'Z' if m.created_at else None,
        "participant_ids": [p.contact_id for p in m.participants],
        "participant_count": len(m.participants),
        "point_count": len(m.point_links),
        **audit_dict(m),
    }


@router.get("")
def list_meetings(
    meeting_type_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    q = db.query(models.Meeting).filter(models.Meeting.project_id == user.project_id)
    accessible_ids = auth.get_accessible_meeting_ids(user, db)
    if accessible_ids is not None:
        if not accessible_ids:
            return []
        q = q.filter(models.Meeting.id.in_(accessible_ids))
    if meeting_type_id:
        q = q.filter(models.Meeting.meeting_type_id == meeting_type_id)
    if status:
        q = q.filter(models.Meeting.status == status)
    return [_format(m) for m in q.order_by(models.Meeting.date.desc()).all()]


@router.get("/{meeting_id}")
def get_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    m = db.query(models.Meeting).filter(
        models.Meeting.id == meeting_id,
        models.Meeting.project_id == user.project_id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    result = _format(m)
    result["participants"] = [
        {
            "contact_id": p.contact_id,
            "present": p.present,
            "name": p.contact.name,
            "company": p.contact.company,
            "function": p.contact.function,
        }
        for p in m.participants
    ]
    # Permission flag for the frontend: only ADMIN/PROJECT_OWNER or owning-package
    # contacts of the meeting type can create new points on this meeting.
    if user.role in ("ADMIN", "PROJECT_OWNER"):
        result["can_create_points"] = True
    elif m.meeting_type_id:
        result["can_create_points"] = auth.is_owning_package_contact(user, m.meeting_type_id, db)
    else:
        result["can_create_points"] = False
    return result


@router.post("")
def create_meeting(
    data: schemas.MeetingCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not data.meeting_type_id:
        raise HTTPException(status_code=422, detail="meeting_type_id is required")
    if not _can_create_meeting_of_type(user, data.meeting_type_id, db):
        raise HTTPException(
            status_code=403,
            detail="Only owning-package contacts who are also default participants can create meetings of this type",
        )
    meeting = models.Meeting(
        project_id=user.project_id,
        title=data.title,
        date=data.date,
        time=data.time,
        location=data.location,
        meeting_type_id=data.meeting_type_id,
        status=data.status,
        notes=data.notes,
    )
    set_created(meeting, user.id)
    db.add(meeting)
    db.flush()

    participant_ids = set(data.participant_ids)
    if not participant_ids and data.meeting_type_id:
        mt = db.query(models.MeetingType).filter(
            models.MeetingType.id == data.meeting_type_id
        ).first()
        if mt:
            participant_ids = {p.contact_id for p in mt.participants}

    for cid in participant_ids:
        db.add(models.MeetingParticipant(meeting_id=meeting.id, contact_id=cid))

    db.commit()
    db.refresh(meeting)
    return _format(meeting)


@router.put("/{meeting_id}")
def update_meeting(
    meeting_id: int,
    data: schemas.MeetingUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    meeting = db.query(models.Meeting).filter(
        models.Meeting.id == meeting_id,
        models.Meeting.project_id == user.project_id,
    ).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if not _can_create_meeting_of_type(user, meeting.meeting_type_id, db):
        raise HTTPException(
            status_code=403,
            detail="Only owning-package contacts who are also default participants can edit meetings of this type",
        )
    check_lock(meeting.updated_at, data.updated_at, "meeting")

    for field in ("title", "date", "time", "location", "meeting_type_id", "status", "notes"):
        val = getattr(data, field, None)
        if val is not None:
            setattr(meeting, field, val)

    if data.participant_ids is not None:
        db.query(models.MeetingParticipant).filter(
            models.MeetingParticipant.meeting_id == meeting_id
        ).delete()
        for cid in data.participant_ids:
            db.add(models.MeetingParticipant(meeting_id=meeting_id, contact_id=cid))

    set_updated(meeting, user.id)
    db.commit()
    db.refresh(meeting)
    return _format(meeting)


@router.delete("/{meeting_id}")
def delete_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    meeting = db.query(models.Meeting).filter(
        models.Meeting.id == meeting_id,
        models.Meeting.project_id == user.project_id,
    ).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if not _can_create_meeting_of_type(user, meeting.meeting_type_id, db):
        raise HTTPException(
            status_code=403,
            detail="Only owning-package contacts who are also default participants can delete meetings of this type",
        )
    db.delete(meeting)
    db.commit()
    return {"ok": True}


@router.put("/{meeting_id}/participants/{contact_id}/present")
def toggle_present(
    meeting_id: int,
    contact_id: int,
    present: bool,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    p = db.query(models.MeetingParticipant).filter(
        models.MeetingParticipant.meeting_id == meeting_id,
        models.MeetingParticipant.contact_id == contact_id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    p.present = present
    db.commit()
    return {"ok": True}


@router.post("/bulk-recurring")
def bulk_create_recurring(
    data: BulkRecurringRequest,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_create_meeting_of_type(user, data.meeting_type_id, db):
        raise HTTPException(
            status_code=403,
            detail="Only owning-package contacts who are also default participants can create meetings of this type",
        )
    mt = db.query(models.MeetingType).filter(
        models.MeetingType.id == data.meeting_type_id,
        models.MeetingType.project_id == user.project_id,
    ).first()
    if not mt:
        raise HTTPException(status_code=404, detail="Meeting type not found")
    if not mt.is_recurrent:
        raise HTTPException(status_code=400, detail="Meeting type is not recurrent")
    try:
        sd = date.fromisoformat(data.start_date)
        fd = date.fromisoformat(data.finish_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format (expected YYYY-MM-DD)")
    if sd > fd:
        raise HTTPException(status_code=422, detail="Start date must be on or before finish date")

    dates = _generate_recurrent_dates(mt, sd, fd)

    if data.dry_run:
        return {"count": len(dates), "dates": [d.isoformat() for d in dates]}

    participant_ids = [p.contact_id for p in mt.participants]
    created_ids: list[int] = []
    for d in dates:
        title = f"{d.strftime('%Y%m%d')}_{mt.name}"
        meeting = models.Meeting(
            project_id=user.project_id,
            title=title,
            date=d.isoformat(),
            time=mt.recurrence_time or None,
            location=None,
            meeting_type_id=mt.id,
            status="PLANNED",
            notes=None,
        )
        set_created(meeting, user.id)
        db.add(meeting)
        db.flush()
        for cid in participant_ids:
            db.add(models.MeetingParticipant(meeting_id=meeting.id, contact_id=cid))
        created_ids.append(meeting.id)
    db.commit()
    return {"count": len(created_ids), "ids": created_ids}
