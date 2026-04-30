import secrets
import string

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
import schemas
import auth
from routers.audit import set_created, set_updated, check_lock, audit_dict

router = APIRouter(prefix="/api/contacts", tags=["contacts"])

VALID_PROJECT_ROLES = ("PROJECT_OWNER", "PROJECT_TEAM", "CLIENT", "VENDOR", "BIDDER")


def _format(c: models.Contact) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "email": c.email,
        "company": c.company,
        "phone": c.phone,
        "function": c.function,
        **audit_dict(c),
    }


@router.get("")
def list_contacts(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    contacts = (
        db.query(models.Contact)
        .filter(models.Contact.project_id == user.project_id)
        .order_by(models.Contact.name)
        .all()
    )

    # Bulk lookup: which users are linked to these contacts?
    contact_ids = [c.id for c in contacts]
    linked_users = (
        db.query(models.User)
        .filter(models.User.contact_id.in_(contact_ids))
        .all()
    ) if contact_ids else []
    user_by_contact: dict[int, models.User] = {u.contact_id: u for u in linked_users}

    # Bulk lookup: project roles for those users
    linked_user_ids = [u.id for u in linked_users]
    project_roles = (
        db.query(models.UserProject)
        .filter(
            models.UserProject.project_id == user.project_id,
            models.UserProject.user_id.in_(linked_user_ids),
        )
        .all()
    ) if linked_user_ids else []
    project_role_by_user: dict[int, str] = {up.user_id: up.role for up in project_roles}

    result = []
    for c in contacts:
        d = _format(c)
        linked = user_by_contact.get(c.id)
        if linked:
            d["linked_user_id"] = linked.id
            d["linked_user_name"] = linked.name
            d["project_role"] = project_role_by_user.get(linked.id)
        else:
            d["linked_user_id"] = None
            d["linked_user_name"] = None
            d["project_role"] = None
        result.append(d)
    return result


@router.post("")
def create_contact(
    data: schemas.ContactCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if data.email and data.email.strip():
        duplicate = db.query(models.Contact).filter(
            models.Contact.project_id == user.project_id,
            models.Contact.email.ilike(data.email.strip()),
        ).first()
        if duplicate:
            raise HTTPException(status_code=400, detail=f"A contact with email '{data.email.strip()}' already exists in this project.")

    contact = models.Contact(**data.model_dump(), project_id=user.project_id)
    set_created(contact, user.id)
    db.add(contact)
    db.flush()

    # Auto-link if a platform user with this email exists
    linked_user = None
    project_role = None
    if data.email and data.email.strip():
        matched = db.query(models.User).filter(
            models.User.email.ilike(data.email.strip())
        ).first()
        if matched:
            # Only set contact_id if the user has none, or their existing contact
            # belongs to a different project (so we can link them here instead)
            should_link = not matched.contact_id
            if not should_link and matched.contact_id:
                existing = db.query(models.Contact).filter_by(
                    id=matched.contact_id, project_id=user.project_id
                ).first()
                should_link = existing is None  # existing contact is in another project
            if should_link:
                matched.contact_id = contact.id
            linked_user = matched
            up = db.query(models.UserProject).filter_by(
                user_id=matched.id, project_id=user.project_id
            ).first()
            project_role = up.role if up else None

    db.commit()
    db.refresh(contact)
    d = _format(contact)
    d["linked_user_id"] = linked_user.id if linked_user else None
    d["linked_user_name"] = linked_user.name if linked_user else None
    d["project_role"] = project_role
    return d


@router.put("/{contact_id}")
def update_contact(
    contact_id: int,
    data: schemas.ContactUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    contact = db.query(models.Contact).filter(
        models.Contact.id == contact_id,
        models.Contact.project_id == user.project_id,
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    check_lock(contact.updated_at, data.updated_at, "contact")

    # If this contact is linked to a platform user, only that user (or an ADMIN)
    # may change the name and phone — other editors must update those via the
    # user's personal profile so they stay in sync across projects.
    linked = db.query(models.User).filter_by(contact_id=contact_id).first()
    payload = data.model_dump(exclude_none=True, exclude={"updated_at"})
    if linked and user.role != "ADMIN" and linked.id != user.id:
        restricted = {k for k in ("name", "phone") if k in payload}
        if restricted:
            raise HTTPException(
                status_code=403,
                detail=f"{', '.join(sorted(restricted))} can only be changed by {linked.name} in their personal profile.",
            )

    for field, value in payload.items():
        setattr(contact, field, value)
    set_updated(contact, user.id)
    db.commit()
    db.refresh(contact)
    d = _format(contact)
    linked = db.query(models.User).filter_by(contact_id=contact_id).first()
    if linked:
        up = db.query(models.UserProject).filter_by(user_id=linked.id, project_id=user.project_id).first()
        d["linked_user_id"] = linked.id
        d["linked_user_name"] = linked.name
        d["project_role"] = up.role if up else None
    else:
        d["linked_user_id"] = None
        d["linked_user_name"] = None
        d["project_role"] = None
    return d


@router.delete("/{contact_id}")
def delete_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    contact = db.query(models.Contact).filter(
        models.Contact.id == contact_id,
        models.Contact.project_id == user.project_id,
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()
    return {"ok": True}


@router.post("/{contact_id}/create-account")
def create_account_from_contact(
    contact_id: int,
    data: schemas.CreateAccountFromContact,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Create a platform user account from a contact (PROJECT_OWNER or ADMIN only)."""
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only Project Owners and Admins can create accounts")

    if data.role not in VALID_PROJECT_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of: {', '.join(VALID_PROJECT_ROLES)}")

    contact = db.query(models.Contact).filter(
        models.Contact.id == contact_id,
        models.Contact.project_id == user.project_id,
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    if not contact.email:
        raise HTTPException(status_code=400, detail="Contact must have an email address to create an account")

    # Check if already linked to a user
    existing_linked = db.query(models.User).filter(models.User.contact_id == contact_id).first()
    if existing_linked:
        raise HTTPException(status_code=400, detail="This contact already has a linked account")

    # Check if a user with this email already exists — if so, link them instead of creating a new account
    existing_user = db.query(models.User).filter(models.User.email == contact.email).first()
    if existing_user:
        # Link the existing user to this contact if not already linked
        if not existing_user.contact_id:
            existing_user.contact_id = contact_id
        # Add/update project membership
        existing_up = db.query(models.UserProject).filter_by(
            user_id=existing_user.id, project_id=user.project_id
        ).first()
        if existing_up:
            existing_up.role = data.role
        else:
            db.add(models.UserProject(
                user_id=existing_user.id,
                project_id=user.project_id,
                role=data.role,
            ))
        db.commit()
        db.refresh(existing_user)
        return {
            "user_id": existing_user.id,
            "name": existing_user.name,
            "email": existing_user.email,
            "project_role": data.role,
            "must_change_password": False,
            "temp_password": None,
            "linked_existing": True,
        }

    # Generate temp password if not provided
    set_must_change = not bool(data.password)
    password = data.password or ''.join(
        secrets.choice(string.ascii_letters + string.digits) for _ in range(12)
    )

    new_user = models.User(
        name=contact.name,
        email=contact.email,
        password_hash=auth.hash_password(password),
        role="PROJECT_TEAM",
        contact_id=contact_id,
        must_change_password=set_must_change,
    )
    db.add(new_user)
    db.flush()

    # Add to project with given role
    existing_up = db.query(models.UserProject).filter_by(
        user_id=new_user.id, project_id=user.project_id
    ).first()
    if existing_up:
        existing_up.role = data.role
    else:
        db.add(models.UserProject(
            user_id=new_user.id,
            project_id=user.project_id,
            role=data.role,
        ))
    db.commit()
    db.refresh(new_user)

    return {
        "user_id": new_user.id,
        "name": new_user.name,
        "email": new_user.email,
        "project_role": data.role,
        "must_change_password": new_user.must_change_password,
        "temp_password": password if set_must_change else None,
        "linked_existing": False,
    }
