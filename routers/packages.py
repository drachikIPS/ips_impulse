from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from database import get_db
import models
import auth
from routers.audit import set_created, set_updated, check_lock, audit_dict

router = APIRouter(prefix="/api/packages", tags=["packages"])


class PackageCreate(BaseModel):
    tag_number: str = Field(..., min_length=1, max_length=8)
    name: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    account_manager_id: Optional[int] = None
    package_owner_id: Optional[int] = None
    pmc_technical_reviewer_id: Optional[int] = None
    pmc_commercial_reviewer_id: Optional[int] = None
    client_technical_reviewer_id: Optional[int] = None
    client_commercial_reviewer_id: Optional[int] = None
    contact_ids: List[int] = []


class PackageUpdate(BaseModel):
    tag_number: Optional[str] = Field(None, max_length=8)
    name: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    account_manager_id: Optional[int] = None
    package_owner_id: Optional[int] = None
    pmc_technical_reviewer_id: Optional[int] = None
    pmc_commercial_reviewer_id: Optional[int] = None
    client_technical_reviewer_id: Optional[int] = None
    client_commercial_reviewer_id: Optional[int] = None
    contact_ids: Optional[List[int]] = None
    updated_at: Optional[str] = None


def _validate_package_owner(contact_id: Optional[int], project_id: int, db: Session):
    """Reject Bidder/Vendor contacts as Package Owner — Package Owner grants
    PROJECT_OWNER-equivalent rights on the package, which would conflict with
    their competitive (Bidder) or supplier (Vendor) project role."""
    if contact_id is None:
        return
    linked_user = db.query(models.User).filter_by(contact_id=contact_id).first()
    if not linked_user:
        return
    up = db.query(models.UserProject).filter_by(
        user_id=linked_user.id, project_id=project_id
    ).first()
    if up and up.role in ("BIDDER", "VENDOR"):
        raise HTTPException(
            status_code=400,
            detail="Bidders and Vendors cannot be assigned as Package Owners. "
                   "The Package Owner has Project-Owner-equivalent permissions on the package.",
        )


def _format(pkg: models.Package) -> dict:
    return {
        "id": pkg.id,
        "tag_number": pkg.tag_number,
        "name": pkg.name,
        "company": pkg.company,
        "address": pkg.address,
        "account_manager_id": pkg.account_manager_id,
        "account_manager_name": pkg.account_manager.name if pkg.account_manager else None,
        "package_owner_id": pkg.package_owner_id,
        "package_owner_name": pkg.package_owner.name if pkg.package_owner else None,
        "pmc_technical_reviewer_id": pkg.pmc_technical_reviewer_id,
        "pmc_technical_reviewer_name": pkg.pmc_technical_reviewer.name if pkg.pmc_technical_reviewer else None,
        "pmc_commercial_reviewer_id": pkg.pmc_commercial_reviewer_id,
        "pmc_commercial_reviewer_name": pkg.pmc_commercial_reviewer.name if pkg.pmc_commercial_reviewer else None,
        "client_technical_reviewer_id": pkg.client_technical_reviewer_id,
        "client_technical_reviewer_name": pkg.client_technical_reviewer.name if pkg.client_technical_reviewer else None,
        "client_commercial_reviewer_id": pkg.client_commercial_reviewer_id,
        "client_commercial_reviewer_name": pkg.client_commercial_reviewer.name if pkg.client_commercial_reviewer else None,
        "contact_ids": [pc.contact_id for pc in pkg.package_contacts],
        **audit_dict(pkg),
    }


@router.get("")
def list_packages(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    pkgs = (
        db.query(models.Package)
        .filter(models.Package.project_id == user.project_id)
        .order_by(models.Package.tag_number)
        .all()
    )
    return [_format(p) for p in pkgs]


@router.get("/{pkg_id}")
def get_package(
    pkg_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    pkg = db.query(models.Package).filter(
        models.Package.id == pkg_id,
        models.Package.project_id == user.project_id,
    ).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    return _format(pkg)


@router.post("")
def create_package(
    data: PackageCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only Project Owners can create packages")
    _validate_package_owner(data.package_owner_id, user.project_id, db)
    pkg = models.Package(
        project_id=user.project_id,
        tag_number=data.tag_number,
        name=data.name,
        company=data.company,
        address=data.address,
        account_manager_id=data.account_manager_id,
        package_owner_id=data.package_owner_id,
        pmc_technical_reviewer_id=data.pmc_technical_reviewer_id,
        pmc_commercial_reviewer_id=data.pmc_commercial_reviewer_id,
        client_technical_reviewer_id=data.client_technical_reviewer_id,
        client_commercial_reviewer_id=data.client_commercial_reviewer_id,
    )
    set_created(pkg, user.id)
    db.add(pkg)
    db.flush()
    for cid in data.contact_ids:
        db.add(models.PackageContact(package_id=pkg.id, contact_id=cid))
    db.commit()
    db.refresh(pkg)
    return _format(pkg)


@router.put("/{pkg_id}")
def update_package(
    pkg_id: int,
    data: PackageUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only Project Owners can edit packages")
    pkg = db.query(models.Package).filter(
        models.Package.id == pkg_id,
        models.Package.project_id == user.project_id,
    ).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    check_lock(pkg.updated_at, data.updated_at, "package")

    if "package_owner_id" in data.model_fields_set:
        _validate_package_owner(data.package_owner_id, user.project_id, db)

    # Use exclude_unset so an explicit `null` ("Not assigned") clears the
    # reviewer/owner — only truly-omitted fields are left untouched.
    payload = data.model_dump(exclude_unset=True, exclude={"updated_at", "contact_ids"})
    for field, val in payload.items():
        setattr(pkg, field, val)

    if data.contact_ids is not None:
        db.query(models.PackageContact).filter(
            models.PackageContact.package_id == pkg_id
        ).delete()
        for cid in data.contact_ids:
            db.add(models.PackageContact(package_id=pkg_id, contact_id=cid))

    set_updated(pkg, user.id)
    db.commit()
    db.refresh(pkg)

    # Auto-approve any PENDING document review rows whose Package-sourced
    # reviewer was just cleared. Also sweeps ITP/SC/Invoice/PR if present
    # — but those flows don't use source_kind yet, so this covers documents only.
    try:
        from routers.documents import sweep_auto_approve_cleared_sources
        affected_doc_ids = [
            d.id for d in db.query(models.Document.id).filter(
                models.Document.package_id == pkg_id,
                models.Document.status == "IN_REVIEW",
            ).all()
        ]
        if affected_doc_ids:
            sweep_auto_approve_cleared_sources(affected_doc_ids, db=db)
            db.commit()
    except Exception:
        pass

    return _format(pkg)


@router.delete("/{pkg_id}")
def delete_package(
    pkg_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only Project Owners can delete packages")
    pkg = db.query(models.Package).filter(
        models.Package.id == pkg_id,
        models.Package.project_id == user.project_id,
    ).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    db.delete(pkg)
    db.commit()
    return {"ok": True}
