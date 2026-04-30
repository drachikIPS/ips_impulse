from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
import models
import auth

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _points_query(db: Session, project_id: int, meeting_type_id: Optional[int] = None):
    """Base query for MeetingPoints, optionally filtered to a meeting type."""
    q = db.query(models.MeetingPoint).filter(
        models.MeetingPoint.project_id == project_id
    )
    if meeting_type_id:
        point_ids = (
            db.query(models.MeetingPointLink.meeting_point_id)
            .join(models.Meeting, models.MeetingPointLink.meeting_id == models.Meeting.id)
            .filter(models.Meeting.meeting_type_id == meeting_type_id)
            .distinct()
        )
        q = q.filter(models.MeetingPoint.id.in_(point_ids))
    return q


@router.get("/summary")
def get_summary(
    meeting_type_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    today = date.today().isoformat()
    week_from_now = (date.today() + timedelta(days=7)).isoformat()

    all_points = _points_query(db, user.project_id, meeting_type_id).all()
    total = len(all_points)

    by_status = {}
    by_type = {}
    overdue = 0
    upcoming_7 = 0
    open_actions = 0

    for p in all_points:
        by_status[p.status] = by_status.get(p.status, 0) + 1
        by_type[p.type] = by_type.get(p.type, 0) + 1
        if p.status not in ("CLOSED",) and p.due_date and p.due_date < today:
            overdue += 1
        if p.due_date and today <= p.due_date <= week_from_now and p.status not in ("CLOSED",):
            upcoming_7 += 1
        if p.type == "ACTION" and p.status not in ("CLOSED",):
            open_actions += 1

    meetings_q = db.query(models.Meeting).filter(
        models.Meeting.project_id == user.project_id
    )
    if meeting_type_id:
        meetings_q = meetings_q.filter(models.Meeting.meeting_type_id == meeting_type_id)
    total_meetings = meetings_q.count()

    return {
        "total_points": total,
        "by_status": by_status,
        "by_type": by_type,
        "overdue": overdue,
        "upcoming_7_days": upcoming_7,
        "total_meetings": total_meetings,
        "open_actions": open_actions,
    }


@router.get("/my-points")
def get_my_points(
    meeting_type_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not user.contact_id:
        return []
    points = (
        _points_query(db, user.project_id, meeting_type_id)
        .filter(
            models.MeetingPoint.responsible_id == user.contact_id,
            models.MeetingPoint.status != "CLOSED",
        )
        .order_by(models.MeetingPoint.due_date)
        .all()
    )
    today = date.today().isoformat()
    result = []
    for p in points:
        result.append({
            "id": p.id,
            "type": p.type,
            "topic": p.topic,
            "due_date": p.due_date,
            "status": p.status,
            "overdue": bool(p.due_date and p.due_date < today),
            "meeting_ids": [lnk.meeting_id for lnk in p.meeting_links],
        })
    return result


@router.get("/by-responsible")
def get_by_responsible(
    meeting_type_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    contacts = db.query(models.Contact).filter(
        models.Contact.project_id == user.project_id
    ).all()
    result = []
    for c in contacts:
        points = (
            _points_query(db, user.project_id, meeting_type_id)
            .filter(
                models.MeetingPoint.responsible_id == c.id,
                models.MeetingPoint.status != "CLOSED",
            )
            .count()
        )
        if points > 0:
            result.append({"name": c.name, "company": c.company, "open_points": points})
    return sorted(result, key=lambda x: -x["open_points"])


@router.get("/upcoming")
def get_upcoming(
    days: int = Query(14),
    meeting_type_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    today = date.today().isoformat()
    deadline = (date.today() + timedelta(days=days)).isoformat()
    points = (
        _points_query(db, user.project_id, meeting_type_id)
        .filter(
            models.MeetingPoint.due_date >= today,
            models.MeetingPoint.due_date <= deadline,
            models.MeetingPoint.status != "CLOSED",
        )
        .order_by(models.MeetingPoint.due_date)
        .all()
    )
    return [
        {
            "id": p.id,
            "topic": p.topic,
            "type": p.type,
            "status": p.status,
            "due_date": p.due_date,
            "responsible_name": p.responsible.name if p.responsible else None,
            "responsible_company": p.responsible.company if p.responsible else None,
        }
        for p in points
    ]


@router.get("/points-per-week")
def get_points_per_week(
    meeting_type_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Cumulative weekly buckets of meeting points. For every ISO week from
    the earliest creation date to today, returns the total number of points
    that had been opened (created_at ≤ end-of-week) and the total that had
    been closed by then. The frontend renders this as a stacked bar showing
    'still open' (opened − closed) and 'closed'."""
    points = _points_query(db, user.project_id, meeting_type_id).all()
    if not points:
        return []

    def week_start(d):
        return d - timedelta(days=d.weekday())

    timestamps = []
    for p in points:
        if p.created_at:
            timestamps.append(p.created_at.date())
        if p.closed_at:
            timestamps.append(p.closed_at.date())
    if not timestamps:
        return []

    start = week_start(min(timestamps))
    end   = week_start(date.today())
    weeks = []
    cur = start
    while cur <= end:
        weeks.append(cur)
        cur = cur + timedelta(days=7)

    out = []
    for w in weeks:
        we = w + timedelta(days=6)
        opened = sum(1 for p in points if p.created_at and p.created_at.date() <= we)
        closed = sum(1 for p in points if p.closed_at  and p.closed_at.date()  <= we)
        iso = w.isocalendar()
        out.append({
            "week_start":  w.isoformat(),
            "iso_week":    iso[1],
            "iso_year":    iso[0],
            "label":       f"W{iso[1]:02d} '{str(iso[0])[-2:]}",
            "opened_total": opened,
            "closed_total": closed,
            "still_open":   opened - closed,
        })
    return out


@router.get("/meetings-per-month")
def get_meetings_per_month(
    meeting_type_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Return meeting count per month (YYYY-MM), optionally filtered by meeting type."""
    q = db.query(models.Meeting).filter(
        models.Meeting.project_id == user.project_id,
        models.Meeting.date.isnot(None),
    )
    if meeting_type_id:
        q = q.filter(models.Meeting.meeting_type_id == meeting_type_id)
    meetings = q.order_by(models.Meeting.date).all()

    counts: dict[str, int] = {}
    for m in meetings:
        month = m.date[:7]  # "YYYY-MM"
        counts[month] = counts.get(month, 0) + 1

    return [{"month": k, "count": v} for k, v in sorted(counts.items())]
