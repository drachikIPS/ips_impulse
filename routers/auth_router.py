from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
import models
import schemas
import auth

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(data: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user or not auth.verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user.last_login_at = datetime.utcnow()
    db.commit()
    token = auth.create_access_token({"sub": str(user.id), "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "contact_id": user.contact_id,
            "must_change_password": bool(user.must_change_password),
        },
    }


@router.get("/me")
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "contact_id": current_user.contact_id,
        "phone": current_user.phone,
        "must_change_password": bool(current_user.must_change_password),
    }


@router.put("/me")
def update_me(
    data: schemas.UpdateMeRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Users update their own profile name/phone; changes cascade to every
    contact record linked to this account across all projects."""
    name_changed = data.name is not None and data.name.strip() and data.name.strip() != current_user.name
    phone_changed = data.phone is not None and (data.phone or None) != current_user.phone

    if name_changed:
        current_user.name = data.name.strip()
    if phone_changed:
        current_user.phone = data.phone or None

    # Cascade to contacts — any contact directly linked via User.contact_id,
    # plus any contact in any project sharing this user's email.
    contact_query = db.query(models.Contact).filter(
        (models.Contact.id == current_user.contact_id) |
        (models.Contact.email.ilike(current_user.email))
    )
    for c in contact_query.all():
        if name_changed:
            c.name = current_user.name
        if phone_changed:
            c.phone = current_user.phone

    db.commit()
    db.refresh(current_user)
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "contact_id": current_user.contact_id,
        "phone": current_user.phone,
        "must_change_password": bool(current_user.must_change_password),
    }


@router.post("/change-password")
def change_password(
    data: schemas.ChangePasswordRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not data.new_password or len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    current_user.password_hash = auth.hash_password(data.new_password)
    current_user.must_change_password = False
    db.commit()
    return {"ok": True}


@router.get("/users")
def list_users(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Returns all users + last_login_at + the list of projects each user
    is associated with — taking both UserProject memberships AND Contact
    rows (linked by User.contact_id or by matching email) into account, so
    users that have been added as a project contact but never logged in
    still surface their projects."""
    if current_user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Admin or Project Owner access required")

    users = db.query(models.User).all()

    # user_id → set of project_ids
    by_user_pids: dict = {}

    # (a) Direct UserProject memberships
    for up in db.query(models.UserProject).all():
        by_user_pids.setdefault(up.user_id, set()).add(up.project_id)

    # (b) Contact-based association: a contact is "this user" when
    #   - User.contact_id matches the contact's id, OR
    #   - the contact's email matches the user's email (same person across projects)
    email_to_uid: dict = {}
    contact_id_to_uid: dict = {}
    for u in users:
        if u.email:
            email_to_uid[u.email.lower()] = u.id
        if u.contact_id:
            contact_id_to_uid[u.contact_id] = u.id

    contacts = db.query(models.Contact).all()
    for c in contacts:
        if not c.project_id:
            continue
        uids = set()
        if c.id in contact_id_to_uid:
            uids.add(contact_id_to_uid[c.id])
        if c.email and c.email.lower() in email_to_uid:
            uids.add(email_to_uid[c.email.lower()])
        for uid in uids:
            by_user_pids.setdefault(uid, set()).add(c.project_id)

    # Project lookup — include status so the UI can color-code open vs. closed
    projects_by_id = {
        p.id: {
            "id": p.id,
            "project_number": p.project_number,
            "description": p.description,
            "status": p.status or "ACTIVE",
        }
        for p in db.query(models.Project).all()
    }

    out = []
    for u in users:
        d = schemas.UserOut.model_validate(u).model_dump()
        d["last_login_at"] = u.last_login_at.isoformat() + "Z" if u.last_login_at else None
        pids = by_user_pids.get(u.id, set())
        plist = [projects_by_id[pid] for pid in pids if pid in projects_by_id]
        d["projects"] = sorted(plist, key=lambda p: (p.get("project_number") or "").lower())
        out.append(d)
    return out


@router.post("/users", dependencies=[Depends(auth.require_admin_or_owner)])
def create_user(data: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = models.User(
        name=data.name,
        email=data.email,
        password_hash=auth.hash_password(data.password),
        role="ADMIN" if data.is_admin else "PROJECT_TEAM",
        contact_id=data.contact_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return schemas.UserOut.model_validate(user)


@router.put("/users/{user_id}", dependencies=[Depends(auth.require_admin_or_owner)])
def update_user(user_id: int, data: schemas.UserUpdate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.name is not None:
        user.name = data.name
    if data.email is not None:
        user.email = data.email
    if data.password is not None:
        user.password_hash = auth.hash_password(data.password)
    if data.is_admin is not None:
        user.role = "ADMIN" if data.is_admin else "PROJECT_TEAM"
    if data.contact_id is not None:
        user.contact_id = data.contact_id
    db.commit()
    db.refresh(user)
    return schemas.UserOut.model_validate(user)


@router.delete("/users/{user_id}", dependencies=[Depends(auth.require_admin_or_owner)])
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Clean up orphaned project assignments before deleting
    db.query(models.UserProject).filter_by(user_id=user_id).delete()
    db.delete(user)
    db.commit()
    return {"ok": True}


class BulkDeleteBody(BaseModel):
    ids: List[int] = []


@router.post("/users/bulk-delete", dependencies=[Depends(auth.require_admin_or_owner)])
def bulk_delete_users(
    body: BulkDeleteBody,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Delete multiple users in a single call. Skips the requesting admin
    silently to avoid self-lockout."""
    if not body.ids:
        return {"deleted": 0, "skipped_self": False}
    target_ids = [i for i in body.ids if i != current_user.id]
    skipped_self = len(target_ids) != len(body.ids)
    if not target_ids:
        return {"deleted": 0, "skipped_self": skipped_self}
    db.query(models.UserProject).filter(models.UserProject.user_id.in_(target_ids)).delete(synchronize_session=False)
    deleted = db.query(models.User).filter(models.User.id.in_(target_ids)).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted, "skipped_self": skipped_self}
