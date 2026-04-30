"""
Module Leads — per-project, per-module override roles.

A contact assigned as Lead for a module gets PROJECT_OWNER-equivalent access
inside that module only. Used in place of the old role-permissions matrix for
the 9 modules listed in `models.MODULE_LEAD_KEYS`. Bidders are not eligible.

Only ADMIN / PROJECT_OWNER can assign Leads.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import auth
import models
from database import get_db

router = APIRouter(prefix="/api/module-leads", tags=["module-leads"])


def _check_admin_or_owner(user: auth.ProjectContext):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(403, "Only Project Owners can manage Module Leads")


def _check_module_key(module: str):
    if module not in models.MODULE_LEAD_KEYS:
        raise HTTPException(400, f"Unknown module key '{module}'")


# ── GET /api/module-leads ────────────────────────────────────────────────────
# Returns a flat list of {module, contact_id, contact_name, contact_company}
# for every assignment in the current project.

@router.get("")
def list_module_leads(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    rows = (
        db.query(models.ProjectModuleLead)
        .filter_by(project_id=user.project_id)
        .all()
    )
    out = []
    for r in rows:
        c = r.contact
        out.append({
            "module": r.module,
            "contact_id": r.contact_id,
            "contact_name": c.name if c else None,
            "contact_company": c.company if c else None,
        })
    out.sort(key=lambda x: (x["module"], (x["contact_name"] or "").lower()))
    return {"leads": out, "modules": list(models.MODULE_LEAD_KEYS)}


# ── GET /api/module-leads/mine ───────────────────────────────────────────────
# Convenience for the frontend to ungate UI buttons for the logged-in user.

@router.get("/mine")
def list_my_lead_modules(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    return {"lead_modules": auth.lead_modules_for_user(user, db)}


# ── GET /api/module-leads/eligible-contacts ──────────────────────────────────
# Project contacts whose linked user is *not* a Bidder. Contacts without a
# linked user are also eligible (an assignment is harmless until they get a
# login), but we surface only those that can actually log in to keep the picker
# meaningful.

@router.get("/eligible-contacts")
def list_eligible_contacts(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
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
        if project_role == "BIDDER":
            continue
        out.append({
            "id": c.id,
            "name": c.name,
            "company": c.company,
            "role": project_role or u.role if u else None,
        })
    out.sort(key=lambda x: (x["name"] or "").lower())
    return out


# ── PUT /api/module-leads/{module} ───────────────────────────────────────────
# Replace the full set of Leads for one module.

class LeadSetBody(BaseModel):
    contact_ids: List[int]


@router.put("/{module}")
def set_module_leads(
    module: str,
    body: LeadSetBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    _check_admin_or_owner(user)
    _check_module_key(module)

    requested_ids = {int(cid) for cid in body.contact_ids if cid}

    # Validate every requested contact: must be in this project, and the
    # linked user (if any) must not be a Bidder.
    if requested_ids:
        contacts = db.query(models.Contact).filter(
            models.Contact.id.in_(requested_ids),
            models.Contact.project_id == user.project_id,
        ).all()
        valid_ids = {c.id for c in contacts}
        bad = requested_ids - valid_ids
        if bad:
            raise HTTPException(400, f"Contact(s) not in this project: {sorted(bad)}")

        # Reject Bidders.
        linked = (
            db.query(models.User, models.UserProject)
            .outerjoin(
                models.UserProject,
                (models.UserProject.user_id == models.User.id)
                & (models.UserProject.project_id == user.project_id),
            )
            .filter(models.User.contact_id.in_(requested_ids))
            .all()
        )
        for (u, up) in linked:
            project_role = (up.role if up else u.role) if u else None
            if project_role == "BIDDER":
                raise HTTPException(400, f"Bidders cannot be assigned as Module Leads (contact_id={u.contact_id})")

    # Replace the set
    db.query(models.ProjectModuleLead).filter_by(
        project_id=user.project_id, module=module,
    ).delete()
    db.flush()
    for cid in requested_ids:
        db.add(models.ProjectModuleLead(
            project_id=user.project_id, module=module, contact_id=cid,
        ))
    db.commit()
    return {"module": module, "contact_ids": sorted(requested_ids)}
