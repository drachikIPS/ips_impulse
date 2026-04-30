from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
import models
import auth

router = APIRouter(prefix="/api/subservices", tags=["subservices"])


def _format(s: models.Subservice) -> dict:
    return {
        "id": s.id,
        "service_code": s.service_code,
        "service_name": s.service_name,
        "subservice_code": s.subservice_code,
        "subservice_name": s.subservice_name,
        "pmc_reviewer_id": s.pmc_reviewer_id,
        "pmc_reviewer_name": s.pmc_reviewer.name if s.pmc_reviewer else None,
        "client_reviewer_id": s.client_reviewer_id,
        "client_reviewer_name": s.client_reviewer.name if s.client_reviewer else None,
        "sort_order": s.sort_order,
    }


class SubserviceCreate(BaseModel):
    service_code: str
    service_name: str
    subservice_code: str
    subservice_name: str
    pmc_reviewer_id: Optional[int] = None
    client_reviewer_id: Optional[int] = None
    sort_order: int = 0


class SubserviceUpdate(BaseModel):
    service_code: Optional[str] = None
    service_name: Optional[str] = None
    subservice_code: Optional[str] = None
    subservice_name: Optional[str] = None
    pmc_reviewer_id: Optional[int] = None
    client_reviewer_id: Optional[int] = None
    sort_order: Optional[int] = None


@router.get("")
def list_subservices(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    items = (
        db.query(models.Subservice)
        .filter(models.Subservice.project_id == user.project_id)
        .order_by(models.Subservice.service_code, models.Subservice.sort_order)
        .all()
    )
    return [_format(s) for s in items]


@router.post("")
def create_subservice(
    data: SubserviceCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only Project Owners can manage subservices")
    if not data.service_code.strip() or not data.service_name.strip():
        raise HTTPException(status_code=400, detail="Service code and name are required")
    if not data.subservice_code.strip() or not data.subservice_name.strip():
        raise HTTPException(status_code=400, detail="Subservice code and name are required")
    s = models.Subservice(
        project_id=user.project_id,
        service_code=data.service_code.strip(),
        service_name=data.service_name.strip(),
        subservice_code=data.subservice_code.strip(),
        subservice_name=data.subservice_name.strip(),
        pmc_reviewer_id=data.pmc_reviewer_id or None,
        client_reviewer_id=data.client_reviewer_id or None,
        sort_order=data.sort_order,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    s = db.query(models.Subservice).filter_by(id=s.id).first()
    return _format(s)


@router.put("/{subservice_id}")
def update_subservice(
    subservice_id: int,
    data: SubserviceUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only Project Owners can edit subservices")
    s = db.query(models.Subservice).filter(
        models.Subservice.id == subservice_id,
        models.Subservice.project_id == user.project_id,
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Subservice not found")
    if data.service_code is not None:
        s.service_code = data.service_code.strip()
    if data.service_name is not None:
        s.service_name = data.service_name.strip()
    if data.subservice_code is not None:
        s.subservice_code = data.subservice_code.strip()
    if data.subservice_name is not None:
        s.subservice_name = data.subservice_name.strip()
    if data.pmc_reviewer_id is not None:
        s.pmc_reviewer_id = data.pmc_reviewer_id if data.pmc_reviewer_id > 0 else None
    if data.client_reviewer_id is not None:
        s.client_reviewer_id = data.client_reviewer_id if data.client_reviewer_id > 0 else None
    if data.sort_order is not None:
        s.sort_order = data.sort_order
    db.commit()

    # Auto-approve any PENDING document review rows whose subservice-sourced
    # reviewer was just cleared.
    try:
        from routers.documents import sweep_auto_approve_cleared_sources
        affected_doc_ids = [
            d.id for d in db.query(models.Document.id).filter(
                models.Document.subservice_id == subservice_id,
                models.Document.status == "IN_REVIEW",
            ).all()
        ]
        if affected_doc_ids:
            sweep_auto_approve_cleared_sources(affected_doc_ids, db=db)
            db.commit()
    except Exception:
        pass

    s = db.query(models.Subservice).filter_by(id=s.id).first()
    return _format(s)


class BulkDeleteBody(BaseModel):
    ids: List[int]


@router.post("/bulk-delete")
def bulk_delete_subservices(
    body: BulkDeleteBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only Project Owners can delete subservices")
    if not body.ids:
        return {"deleted": 0}
    subs = db.query(models.Subservice).filter(
        models.Subservice.id.in_(body.ids),
        models.Subservice.project_id == user.project_id,
    ).all()
    for s in subs:
        db.delete(s)
    db.commit()
    return {"deleted": len(subs)}


@router.delete("/{subservice_id}")
def delete_subservice(
    subservice_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if user.role not in ("ADMIN", "PROJECT_OWNER"):
        raise HTTPException(status_code=403, detail="Only Project Owners can delete subservices")
    s = db.query(models.Subservice).filter(
        models.Subservice.id == subservice_id,
        models.Subservice.project_id == user.project_id,
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Subservice not found")
    db.delete(s)
    db.commit()
    return {"ok": True}
