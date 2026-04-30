import logging
import os
from datetime import datetime, timedelta
from typing import Optional
import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
import models

# JWT signing secret. In production this MUST be supplied via the
# IPS_JWT_SECRET environment variable. The fallback below is intended for
# local development only — a warning is logged at process start so any
# accidental prod deployment without the env var is loudly visible.
_DEV_FALLBACK_SECRET = "ips-project-management-dev-fallback-DO-NOT-USE-IN-PROD"
SECRET_KEY = os.environ.get("IPS_JWT_SECRET") or _DEV_FALLBACK_SECRET
if SECRET_KEY == _DEV_FALLBACK_SECRET:
    logging.getLogger("ips.auth").warning(
        "IPS_JWT_SECRET not set — falling back to the development secret. "
        "Set IPS_JWT_SECRET to a 64-character random string in production."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

security = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> models.User:
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ─────────────────────────────────────────────────────────────────────────────
# Project Context
# ─────────────────────────────────────────────────────────────────────────────

class ProjectContext:
    """
    Lightweight user context with project-specific role.
    Mirrors the User interface (id, name, email, role, contact_id)
    so existing endpoint code works unchanged.
    """
    __slots__ = ('id', 'name', 'email', 'role', 'contact_id', 'project_id')

    def __init__(self, user: models.User, role: str, project_id: int):
        self.id = user.id
        self.name = user.name
        self.email = user.email
        self.role = role
        self.contact_id = user.contact_id
        self.project_id = project_id


def get_project_user(
    x_project_id: Optional[int] = Header(None, alias="X-Project-ID"),
    x_impersonate_user_id: Optional[int] = Header(None, alias="X-Impersonate-User-ID"),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectContext:
    """
    Returns a ProjectContext with the user's effective role for the current project.
    - ADMIN: full access to any project (project_id still required for data scoping).
      If X-Impersonate-User-ID is also set, the returned context uses the target
      user's id, role, and contact_id — so all endpoints behave exactly as if
      that user were logged in.
    - Others: must have a UserProject entry for the given project_id.
    """
    if not x_project_id:
        raise HTTPException(status_code=400, detail="X-Project-ID header required")

    if user.role == "ADMIN":
        # Optional impersonation: substitute the target user's context
        if x_impersonate_user_id:
            target = db.query(models.User).filter_by(id=x_impersonate_user_id).first()
            if not target:
                raise HTTPException(status_code=404, detail="Impersonated user not found")
            up = db.query(models.UserProject).filter_by(
                user_id=x_impersonate_user_id, project_id=x_project_id
            ).first()
            if not up:
                raise HTTPException(status_code=403, detail="Impersonated user has no access to this project")
            return ProjectContext(target, up.role, x_project_id)
        return ProjectContext(user, "ADMIN", x_project_id)

    up = db.query(models.UserProject).filter_by(
        user_id=user.id, project_id=x_project_id
    ).first()
    if not up:
        raise HTTPException(status_code=403, detail="No access to this project")

    return ProjectContext(user, up.role, x_project_id)


# ─────────────────────────────────────────────────────────────────────────────
# Role guards (work with both User and ProjectContext)
# ─────────────────────────────────────────────────────────────────────────────

def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role != models.UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_admin_or_owner(current_user=Depends(get_current_user)):
    if current_user.role not in (models.UserRole.ADMIN, models.UserRole.PROJECT_OWNER):
        raise HTTPException(status_code=403, detail="Admin or Project Owner access required")
    return current_user


# ─────────────────────────────────────────────────────────────────────────────
# Permission helpers (work with ProjectContext too, since .role is present)
# ─────────────────────────────────────────────────────────────────────────────

def get_owning_package_meeting_type_ids(user, db: Session) -> list[int]:
    """Meeting type IDs whose owning_package lists `user.contact_id` as a linked contact."""
    if not user.contact_id:
        return []
    rows = (
        db.query(models.MeetingType.id)
        .join(models.PackageContact, models.PackageContact.package_id == models.MeetingType.owning_package_id)
        .filter(
            models.MeetingType.project_id == user.project_id,
            models.PackageContact.contact_id == user.contact_id,
        )
        .all()
    )
    return [r[0] for r in rows]


def is_owning_package_contact(user, meeting_type_id: int, db: Session) -> bool:
    """True if user is a linked contact of the meeting type's owning package."""
    if not user.contact_id or not meeting_type_id:
        return False
    return db.query(models.PackageContact).join(
        models.MeetingType, models.MeetingType.owning_package_id == models.PackageContact.package_id
    ).filter(
        models.MeetingType.id == meeting_type_id,
        models.PackageContact.contact_id == user.contact_id,
    ).first() is not None


def get_user_accessible_meeting_type_ids(user, db: Session):
    """Returns None if unrestricted, or list of accessible meeting type IDs (may be empty).

    Only ADMIN and PROJECT_OWNER are unrestricted. Every other role (PROJECT_TEAM,
    VENDOR, CLIENT, BIDDER) sees meeting types where they are a default participant.
    Owning-package contact status grants edit rights, not view.
    """
    if user.role in (models.UserRole.ADMIN, models.UserRole.PROJECT_OWNER):
        return None
    if not user.contact_id:
        return []
    rows = db.query(models.MeetingTypeParticipant.meeting_type_id).filter(
        models.MeetingTypeParticipant.contact_id == user.contact_id
    ).all()
    return [r[0] for r in rows]


def get_accessible_meeting_ids(user, db: Session):
    """
    For restricted users returns the set of meeting IDs they can access:
      1. Meetings whose meeting type lists them as a default participant
      2. Meetings where they were individually declared as a participant

    Owning-package contact status grants edit rights (see is_owning_package_contact)
    but is NOT a view grant — a non-default participant who is only an owning-package
    contact does not see the meeting unless individually added as a participant.

    Only ADMIN and PROJECT_OWNER are unrestricted (returns None). Every other role
    (PROJECT_TEAM, VENDOR, CLIENT, BIDDER) goes through the participation filter.
    Returns an empty set when the user has no contact or no relevant meetings.
    """
    if user.role in (models.UserRole.ADMIN, models.UserRole.PROJECT_OWNER):
        return None

    if not user.contact_id:
        return set()

    meeting_ids: set[int] = set()

    # 1. Default participation
    default_type_ids = [
        r[0] for r in db.query(models.MeetingTypeParticipant.meeting_type_id).filter(
            models.MeetingTypeParticipant.contact_id == user.contact_id
        ).all()
    ]
    if default_type_ids:
        rows = db.query(models.Meeting.id).filter(
            models.Meeting.meeting_type_id.in_(default_type_ids),
            models.Meeting.project_id == user.project_id,
        ).all()
        meeting_ids.update(r[0] for r in rows)

    # 2. Individual meeting participation
    rows = (
        db.query(models.MeetingParticipant.meeting_id)
        .join(models.Meeting, models.Meeting.id == models.MeetingParticipant.meeting_id)
        .filter(
            models.MeetingParticipant.contact_id == user.contact_id,
            models.Meeting.project_id == user.project_id,
        )
        .all()
    )
    meeting_ids.update(r[0] for r in rows)

    return meeting_ids


# ─────────────────────────────────────────────────────────────────────────────
# Module Lead overrides — a contact can be elevated to PROJECT_OWNER-equivalent
# access within one specific module without changing their base role globally.
# ─────────────────────────────────────────────────────────────────────────────

def lead_modules_for_user(user, db: Session) -> list:
    """Return the list of module keys this user is a Lead for in the current
    project. Returns [] if the user has no contact_id."""
    if not getattr(user, "contact_id", None) or not getattr(user, "project_id", None):
        return []
    rows = db.query(models.ProjectModuleLead.module).filter(
        models.ProjectModuleLead.project_id == user.project_id,
        models.ProjectModuleLead.contact_id == user.contact_id,
    ).all()
    return [r[0] for r in rows]


def is_module_lead(user, module: str, db: Session) -> bool:
    if not getattr(user, "contact_id", None) or not getattr(user, "project_id", None):
        return False
    return db.query(models.ProjectModuleLead).filter_by(
        project_id=user.project_id, module=module, contact_id=user.contact_id,
    ).first() is not None


def has_owner_or_lead_access(user, module: str, db: Session) -> bool:
    """Single source of truth used by routers in place of the old
    `user.role in ('ADMIN', 'PROJECT_OWNER')` check, for the 9 modules that
    support Lead overrides."""
    if user.role in ("ADMIN", "PROJECT_OWNER"):
        return True
    return is_module_lead(user, module, db)


# ─────────────────────────────────────────────────────────────────────────────
# Package Owner overrides — a Package Owner gets PROJECT_OWNER-equivalent access
# for actions bound to their package, in every module except Meetings.
# Bidders and Vendors cannot be assigned as Package Owners (enforced in
# routers/packages.py at create/update time).
# ─────────────────────────────────────────────────────────────────────────────

def is_package_owner(user, package, db: Session) -> bool:
    """True if the user is the Package Owner of the given package."""
    return bool(
        package
        and getattr(user, "contact_id", None)
        and package.package_owner_id == user.contact_id
    )


def package_access_path(user, module: str, package, db: Session) -> Optional[str]:
    """Returns the access path that grants project-owner-equivalent rights for
    a package-bound action, or None if the user has no such access.

      - 'OWNER_OR_LEAD' — user is ADMIN, PROJECT_OWNER, or Module Lead for `module`
      - 'PACKAGE_OWNER' — user is the Package Owner of `package`
      - None — no access
    """
    if has_owner_or_lead_access(user, module, db):
        return "OWNER_OR_LEAD"
    if is_package_owner(user, package, db):
        return "PACKAGE_OWNER"
    return None


def has_owner_lead_or_package_access(user, module: str, package, db: Session) -> bool:
    """Boolean variant of package_access_path."""
    return package_access_path(user, module, package, db) is not None


def override_default_comment(user_name: str, gate_path: Optional[str]) -> str:
    """Standard default comment for override events. Tags the gate path
    ('Project Owner' vs 'Package Owner') so the audit trail records both
    the actor's name and the role under which they overrode."""
    role_label = "Package Owner" if gate_path == "PACKAGE_OWNER" else "Project Owner"
    return f"Decision overridden by {user_name} (as {role_label})"
