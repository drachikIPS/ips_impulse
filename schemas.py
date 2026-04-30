from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


# ── Auth ──────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    is_admin: bool = False          # true → role=ADMIN, false → role=PROJECT_TEAM
    contact_id: Optional[int] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None  # if provided, sets role to ADMIN or PROJECT_TEAM
    contact_id: Optional[int] = None


class UpdateMeRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None


class CreateAccountFromContact(BaseModel):
    role: str  # project role for this project
    password: Optional[str] = None  # if omitted → must_change_password=True


class ChangePasswordRequest(BaseModel):
    new_password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    contact_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Contacts ──────────────────────────────────────────────────────────────────
class ContactBase(BaseModel):
    name: str
    email: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    function: Optional[str] = None


class ContactCreate(ContactBase):
    pass


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    function: Optional[str] = None
    updated_at: Optional[str] = None


class ContactOut(ContactBase):
    id: int
    created_at: Optional[datetime] = None
    created_by_name: Optional[str] = None
    updated_at: Optional[datetime] = None
    updated_by_name: Optional[str] = None

    class Config:
        from_attributes = True


# ── Meeting Types ─────────────────────────────────────────────────────────────
class MeetingTypeBase(BaseModel):
    name: str = Field(..., max_length=50)
    description: Optional[str] = None
    is_recurrent: bool = False
    recurrence: Optional[str] = None            # DAILY | WEEKLY | BIWEEKLY | MONTHLY
    days_of_week: Optional[List[int]] = None    # [0,2,4] for DAILY/WEEKLY/BIWEEKLY
    day_of_week: Optional[int] = None           # 0-6 for MONTHLY
    monthly_week_position: Optional[int] = None # 1-4, 5=last
    recurrence_time: Optional[str] = None       # HH:MM
    duration: Optional[int] = None              # minutes
    owning_package_id: Optional[int] = None     # contacts of this package have full edit on points of this type


class MeetingTypeCreate(MeetingTypeBase):
    participant_ids: List[int] = []


class MeetingTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_recurrent: Optional[bool] = None
    recurrence: Optional[str] = None
    days_of_week: Optional[List[int]] = None
    day_of_week: Optional[int] = None
    monthly_week_position: Optional[int] = None
    recurrence_time: Optional[str] = None
    duration: Optional[int] = None
    owning_package_id: Optional[int] = None
    participant_ids: Optional[List[int]] = None
    updated_at: Optional[str] = None


class MeetingTypeOut(MeetingTypeBase):
    id: int
    participant_ids: List[int] = []

    class Config:
        from_attributes = True


# ── Meetings ──────────────────────────────────────────────────────────────────
class MeetingParticipantOut(BaseModel):
    contact_id: int
    present: bool
    contact: ContactOut

    class Config:
        from_attributes = True


class MeetingBase(BaseModel):
    title: str
    date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    meeting_type_id: Optional[int] = None
    status: str = "PLANNED"
    notes: Optional[str] = None


class MeetingCreate(MeetingBase):
    participant_ids: List[int] = []


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    meeting_type_id: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    participant_ids: Optional[List[int]] = None
    updated_at: Optional[str] = None


class MeetingOut(MeetingBase):
    id: int
    created_at: datetime
    participant_ids: List[int] = []
    meeting_type_name: Optional[str] = None

    class Config:
        from_attributes = True


# ── Meeting Points ────────────────────────────────────────────────────────────
class MeetingPointNoteBase(BaseModel):
    content: str
    meeting_id: Optional[int] = None


class MeetingPointNoteCreate(MeetingPointNoteBase):
    pass


class MeetingPointNoteOut(MeetingPointNoteBase):
    id: int
    meeting_point_id: int
    created_at: datetime
    created_by_id: Optional[int] = None
    author_name: Optional[str] = None
    meeting_title: Optional[str] = None

    class Config:
        from_attributes = True


class MeetingPointBase(BaseModel):
    type: str = "ACTION"
    topic: str
    details: Optional[str] = None
    responsible_id: Optional[int] = None
    due_date: Optional[str] = None
    status: str = "NOT_STARTED"


class MeetingPointCreate(MeetingPointBase):
    meeting_id: int
    for_preparation: bool = False


class MeetingPointUpdate(BaseModel):
    type: Optional[str] = None
    topic: Optional[str] = None
    details: Optional[str] = None
    responsible_id: Optional[int] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    updated_at: Optional[str] = None


class MeetingPointOut(MeetingPointBase):
    id: int
    created_at: datetime
    responsible_name: Optional[str] = None
    meeting_ids: List[int] = []
    notes: List[MeetingPointNoteOut] = []

    class Config:
        from_attributes = True


class MeetingPointLinkCreate(BaseModel):
    meeting_id: int
    for_preparation: bool = False


# ── Dashboard ─────────────────────────────────────────────────────────────────
class DashboardSummary(BaseModel):
    total_points: int
    by_status: dict
    by_type: dict
    overdue: int
    upcoming_7_days: int
    total_meetings: int
    open_actions: int
