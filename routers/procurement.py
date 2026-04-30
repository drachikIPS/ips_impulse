"""
Procurement module router:
  - Setup tab: procurement steps (sequence) + contract types
  - Procurement Plan tab: sequence validation + per-package plans
"""
from collections import defaultdict
from datetime import datetime, date as date_type
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from pydantic import BaseModel
from typing import Dict, List, Optional
from database import get_db
import models
import auth
from routers.audit import set_created, set_updated, check_lock, audit_dict

router = APIRouter(prefix="/api/procurement", tags=["procurement"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _can_edit(user: auth.ProjectContext, db: Session) -> bool:
    return auth.has_owner_or_lead_access(user, "Procurement", db)


def _can_manage_companies(user: auth.ProjectContext, db: Session) -> bool:
    """Bidding-company create/update/link-to-packages is open to PROJECT_TEAM
    and CLIENT in addition to the Procurement editors. Delete and contact
    assignment remain editor-only (they grant or revoke bidder access)."""
    if _can_edit(user, db):
        return True
    return user.role in ("PROJECT_TEAM", "CLIENT")


def _can_view(user: auth.ProjectContext) -> bool:
    return user.role in ("ADMIN", "PROJECT_OWNER", "PROJECT_TEAM", "CLIENT")


def _fmt_step(s: models.ProcurementStep) -> dict:
    return {
        "id": s.id,
        "step_id": s.step_id,
        "description": s.description,
        "weight": s.weight,
        "sort_order": s.sort_order,
        **audit_dict(s),
    }


def _fmt_contract_type(ct: models.ContractType) -> dict:
    return {
        "id": ct.id,
        "name": ct.name,
        "description": ct.description,
        "sort_order": ct.sort_order,
        **audit_dict(ct),
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class StepCreate(BaseModel):
    step_id: str
    description: Optional[str] = None
    weight: float
    sort_order: Optional[int] = 0


class StepUpdate(BaseModel):
    step_id: Optional[str] = None
    description: Optional[str] = None
    weight: Optional[float] = None
    sort_order: Optional[int] = None
    updated_at: Optional[str] = None


class ContractTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: Optional[int] = 0


class ContractTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    updated_at: Optional[str] = None


# ── Procurement Steps ─────────────────────────────────────────────────────────

@router.get("/steps")
def list_steps(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_view(user):
        raise HTTPException(403, "Access denied")
    steps = (
        db.query(models.ProcurementStep)
        .filter(models.ProcurementStep.project_id == user.project_id)
        .order_by(models.ProcurementStep.sort_order, models.ProcurementStep.id)
        .all()
    )
    return [_fmt_step(s) for s in steps]


@router.post("/steps")
def create_step(
    data: StepCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_edit(user, db):
        raise HTTPException(403, "Only Project Owners can manage the procurement sequence")
    step = models.ProcurementStep(
        project_id=user.project_id,
        step_id=data.step_id,
        description=data.description,
        weight=data.weight,
        sort_order=data.sort_order or 0,
    )
    set_created(step, user.id)
    db.add(step)
    db.commit()
    db.refresh(step)
    return _fmt_step(step)


@router.put("/steps/{step_id}")
def update_step(
    step_id: int,
    data: StepUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_edit(user, db):
        raise HTTPException(403, "Only Project Owners can manage the procurement sequence")
    step = db.query(models.ProcurementStep).filter(
        models.ProcurementStep.id == step_id,
        models.ProcurementStep.project_id == user.project_id,
    ).first()
    if not step:
        raise HTTPException(404, "Procurement step not found")
    check_lock(step.updated_at, data.updated_at, "procurement step")
    for field, value in data.model_dump(exclude_none=True, exclude={"updated_at"}).items():
        setattr(step, field, value)
    set_updated(step, user.id)
    db.commit()
    db.refresh(step)
    return _fmt_step(step)


@router.delete("/steps/{step_id}")
def delete_step(
    step_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_edit(user, db):
        raise HTTPException(403, "Only Project Owners can manage the procurement sequence")
    step = db.query(models.ProcurementStep).filter(
        models.ProcurementStep.id == step_id,
        models.ProcurementStep.project_id == user.project_id,
    ).first()
    if not step:
        raise HTTPException(404, "Procurement step not found")
    db.delete(step)
    db.commit()
    return {"ok": True}


# ── Contract Types ────────────────────────────────────────────────────────────

@router.get("/contract-types")
def list_contract_types(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_view(user):
        raise HTTPException(403, "Access denied")
    cts = (
        db.query(models.ContractType)
        .filter(models.ContractType.project_id == user.project_id)
        .order_by(models.ContractType.sort_order, models.ContractType.id)
        .all()
    )
    return [_fmt_contract_type(ct) for ct in cts]


@router.post("/contract-types")
def create_contract_type(
    data: ContractTypeCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_edit(user, db):
        raise HTTPException(403, "Only Project Owners can manage contract types")
    ct = models.ContractType(
        project_id=user.project_id,
        name=data.name,
        description=data.description,
        sort_order=data.sort_order or 0,
    )
    set_created(ct, user.id)
    db.add(ct)
    db.commit()
    db.refresh(ct)
    return _fmt_contract_type(ct)


@router.put("/contract-types/{ct_id}")
def update_contract_type(
    ct_id: int,
    data: ContractTypeUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_edit(user, db):
        raise HTTPException(403, "Only Project Owners can manage contract types")
    ct = db.query(models.ContractType).filter(
        models.ContractType.id == ct_id,
        models.ContractType.project_id == user.project_id,
    ).first()
    if not ct:
        raise HTTPException(404, "Contract type not found")
    check_lock(ct.updated_at, data.updated_at, "contract type")
    for field, value in data.model_dump(exclude_none=True, exclude={"updated_at"}).items():
        setattr(ct, field, value)
    set_updated(ct, user.id)
    db.commit()
    db.refresh(ct)
    return _fmt_contract_type(ct)


@router.delete("/contract-types/{ct_id}")
def delete_contract_type(
    ct_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_edit(user, db):
        raise HTTPException(403, "Only Project Owners can manage contract types")
    ct = db.query(models.ContractType).filter(
        models.ContractType.id == ct_id,
        models.ContractType.project_id == user.project_id,
    ).first()
    if not ct:
        raise HTTPException(404, "Contract type not found")
    db.delete(ct)
    db.commit()
    return {"ok": True}


# ── Sequence Validation ───────────────────────────────────────────────────────

def _get_or_create_config(project_id: int, db: Session) -> models.ProcurementConfig:
    cfg = db.query(models.ProcurementConfig).filter_by(project_id=project_id).first()
    if not cfg:
        cfg = models.ProcurementConfig(project_id=project_id, sequence_validated=False)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("/sequence-status")
def get_sequence_status(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_view(user):
        raise HTTPException(403, "Access denied")
    cfg = _get_or_create_config(user.project_id, db)
    return {
        "sequence_validated": cfg.sequence_validated,
        "validated_at": cfg.sequence_validated_at.isoformat() + 'Z' if cfg.sequence_validated_at else None,
        "validated_by": cfg.sequence_validated_by.name if cfg.sequence_validated_by else None,
    }


@router.post("/sequence-validate")
def validate_sequence(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_edit(user, db):
        raise HTTPException(403, "Only Project Owners can validate the sequence")
    steps = db.query(models.ProcurementStep).filter_by(project_id=user.project_id).all()
    if not steps:
        raise HTTPException(400, "No procurement steps defined")
    total = sum(s.weight for s in steps)
    if abs(total - 1.0) > 0.001:
        raise HTTPException(400, f"Total weight must equal 100% (current: {round(total * 100, 1)}%)")
    cfg = _get_or_create_config(user.project_id, db)
    cfg.sequence_validated = True
    cfg.sequence_validated_at = datetime.utcnow()
    cfg.sequence_validated_by_id = user.id
    db.commit()
    return {"ok": True}


@router.post("/sequence-unvalidate")
def unvalidate_sequence(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_edit(user, db):
        raise HTTPException(403, "Only Project Owners can unvalidate the sequence")
    cfg = _get_or_create_config(user.project_id, db)
    cfg.sequence_validated = False
    cfg.sequence_validated_at = None
    cfg.sequence_validated_by_id = None
    db.commit()
    return {"ok": True}


# ── Bidder Users (for contact assignment) ────────────────────────────────────

@router.get("/bidder-users")
def list_bidder_users(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Return all users with BIDDER role in this project — used when assigning contacts to a company."""
    if not _can_view(user):
        raise HTTPException(403, "Access denied")
    bidders = (
        db.query(models.User)
        .join(models.UserProject, models.UserProject.user_id == models.User.id)
        .filter(
            models.UserProject.project_id == user.project_id,
            models.UserProject.role == "BIDDER",
        )
        .order_by(models.User.name)
        .all()
    )
    return [{"id": b.id, "name": b.name, "email": b.email} for b in bidders]


# ── Bidding Companies ─────────────────────────────────────────────────────────

class BiddingCompanyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    website: Optional[str] = None


class BiddingCompanyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    website: Optional[str] = None
    updated_at: Optional[str] = None


def _fmt_bidding_company(co: models.BiddingCompany, db=None) -> dict:
    package_ids: list = []
    if db is not None:
        package_ids = [
            r[0] for r in db.query(models.PackagePlan.package_id)
                            .join(models.PackagePlanBidder,
                                  models.PackagePlanBidder.plan_id == models.PackagePlan.id)
                            .filter(models.PackagePlanBidder.company_id == co.id,
                                    models.PackagePlan.project_id == co.project_id)
                            .all()
        ]
    return {
        "id": co.id,
        "name": co.name,
        "description": co.description,
        "website": co.website,
        "contacts": [
            {"user_id": c.user_id, "name": c.user.name, "email": c.user.email}
            for c in co.contacts
        ],
        "package_ids": package_ids,
        **audit_dict(co),
    }


@router.get("/bidding-companies")
def list_bidding_companies(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_view(user):
        raise HTTPException(403, "Access denied")
    companies = (
        db.query(models.BiddingCompany)
        .filter_by(project_id=user.project_id)
        .order_by(models.BiddingCompany.name)
        .all()
    )
    return [_fmt_bidding_company(co, db) for co in companies]


@router.post("/bidding-companies")
def create_bidding_company(
    data: BiddingCompanyCreate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_manage_companies(user, db):
        raise HTTPException(403, "Not authorized to create bidding companies")
    duplicate = db.query(models.BiddingCompany).filter(
        models.BiddingCompany.project_id == user.project_id,
        models.BiddingCompany.name.ilike(data.name.strip()),
    ).first()
    if duplicate:
        raise HTTPException(409, f"A bidding company named '{data.name.strip()}' already exists in this project.")
    co = models.BiddingCompany(
        project_id=user.project_id,
        name=data.name.strip(),
        description=data.description,
        website=data.website,
    )
    set_created(co, user.id)
    db.add(co)
    db.commit()
    db.refresh(co)
    return _fmt_bidding_company(co, db)


@router.put("/bidding-companies/{company_id}")
def update_bidding_company(
    company_id: int,
    data: BiddingCompanyUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_manage_companies(user, db):
        raise HTTPException(403, "Not authorized to edit bidding companies")
    co = db.query(models.BiddingCompany).filter_by(id=company_id, project_id=user.project_id).first()
    if not co:
        raise HTTPException(404, "Bidding company not found")
    check_lock(co.updated_at, data.updated_at, "bidding company")
    if data.name is not None and data.name.strip().lower() != co.name.lower():
        duplicate = db.query(models.BiddingCompany).filter(
            models.BiddingCompany.project_id == user.project_id,
            models.BiddingCompany.name.ilike(data.name.strip()),
            models.BiddingCompany.id != company_id,
        ).first()
        if duplicate:
            raise HTTPException(409, f"A bidding company named '{data.name.strip()}' already exists in this project.")
    for field, value in data.model_dump(exclude_none=True, exclude={"updated_at"}).items():
        setattr(co, field, value)
    set_updated(co, user.id)
    db.commit()
    db.refresh(co)
    return _fmt_bidding_company(co, db)


@router.delete("/bidding-companies/{company_id}")
def delete_bidding_company(
    company_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_edit(user, db):
        raise HTTPException(403, "Only Project Owners can manage bidding companies")
    co = db.query(models.BiddingCompany).filter_by(id=company_id, project_id=user.project_id).first()
    if not co:
        raise HTTPException(404, "Bidding company not found")
    db.delete(co)
    db.commit()
    return {"ok": True}


class CompanyPackagesUpdate(BaseModel):
    package_ids: List[int] = []


@router.put("/bidding-companies/{company_id}/packages")
def set_company_packages(
    company_id: int,
    data: CompanyPackagesUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Set the list of packages this bidding company is linked to.
    For each package: ensures a PackagePlan exists and its bidder list
    contains this company. For deselected packages, removes the linkage.
    Other plan fields (contract_type, notes, step_dates) are left untouched."""
    if not _can_manage_companies(user, db):
        raise HTTPException(403, "Not authorized to link bidding companies to packages")
    cfg = _get_or_create_config(user.project_id, db)
    if not cfg.sequence_validated:
        raise HTTPException(400, "Sequence must be validated before linking companies to packages")
    co = db.query(models.BiddingCompany).filter_by(
        id=company_id, project_id=user.project_id).first()
    if not co:
        raise HTTPException(404, "Bidding company not found")

    target_pkg_ids = set(data.package_ids or [])
    # Validate all targeted packages belong to this project
    if target_pkg_ids:
        valid = {
            p.id for p in db.query(models.Package)
                            .filter(models.Package.project_id == user.project_id,
                                    models.Package.id.in_(target_pkg_ids)).all()
        }
        if valid != target_pkg_ids:
            raise HTTPException(400, "One or more packages not found in this project")

    # Current linkages: package_id → plan_id
    current_links = {}
    for plan in db.query(models.PackagePlan).filter_by(project_id=user.project_id).all():
        for b in plan.bidders:
            if b.company_id == company_id:
                current_links[plan.package_id] = plan.id
    current_pkg_ids = set(current_links.keys())

    # Remove linkages no longer wanted
    for pkg_id in current_pkg_ids - target_pkg_ids:
        plan_id = current_links[pkg_id]
        db.query(models.PackagePlanBidder).filter_by(
            plan_id=plan_id, company_id=company_id).delete(synchronize_session=False)

    # Add new linkages (creating empty plans where missing)
    for pkg_id in target_pkg_ids - current_pkg_ids:
        plan = db.query(models.PackagePlan).filter_by(
            project_id=user.project_id, package_id=pkg_id).first()
        if plan is None:
            plan = models.PackagePlan(project_id=user.project_id, package_id=pkg_id)
            set_created(plan, user.id)
            db.add(plan); db.flush()
        existing = db.query(models.PackagePlanBidder).filter_by(
            plan_id=plan.id, company_id=company_id).first()
        if not existing:
            db.add(models.PackagePlanBidder(plan_id=plan.id, company_id=company_id))

    db.commit()
    db.refresh(co)
    return _fmt_bidding_company(co, db)


class AddContactBody(BaseModel):
    user_id: int


@router.post("/bidding-companies/{company_id}/contacts")
def add_company_contact(
    company_id: int,
    data: AddContactBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_edit(user, db):
        raise HTTPException(403, "Only Project Owners can manage bidding company contacts")
    co = db.query(models.BiddingCompany).filter_by(id=company_id, project_id=user.project_id).first()
    if not co:
        raise HTTPException(404, "Bidding company not found")
    target = db.query(models.User).filter_by(id=data.user_id).first()
    if not target:
        raise HTTPException(400, "User not found")
    up = db.query(models.UserProject).filter_by(user_id=data.user_id, project_id=user.project_id).first()
    if not up or up.role != "BIDDER":
        raise HTTPException(400, "User must exist and have the Bidder role in this project")
    existing = db.query(models.BiddingCompanyContact).filter_by(
        company_id=company_id, user_id=data.user_id
    ).first()
    if not existing:
        db.add(models.BiddingCompanyContact(company_id=company_id, user_id=data.user_id))
        db.commit()
    return {"ok": True}


@router.delete("/bidding-companies/{company_id}/contacts/{user_id}")
def remove_company_contact(
    company_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_edit(user, db):
        raise HTTPException(403, "Only Project Owners can manage bidding company contacts")
    row = db.query(models.BiddingCompanyContact).filter_by(
        company_id=company_id, user_id=user_id
    ).first()
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}


# ── Procurement Plans ─────────────────────────────────────────────────────────

class PlanUpsert(BaseModel):
    contract_type_id: Optional[int] = None
    notes: Optional[str] = None
    bidder_ids: List[int] = []
    step_dates: Dict[str, Optional[str]] = {}
    not_applicable: Optional[bool] = None
    updated_at: Optional[str] = None


def _can_edit_plan(user: auth.ProjectContext, pkg: models.Package, db: Session) -> bool:
    if auth.has_owner_or_lead_access(user, "Procurement", db):
        return True
    if user.role == "PROJECT_TEAM":
        return user.contact_id is not None and pkg.package_owner_id == user.contact_id
    return False


def _fmt_plan(pkg: models.Package, plan: models.PackagePlan | None,
               forecast: float, currency: str, financial_weight_pct: float,
               procurement_progress: float = 0.0) -> dict:
    return {
        "package_id": pkg.id,
        "package_tag": pkg.tag_number,
        "package_name": pkg.name,
        "package_owner_contact_id": pkg.package_owner_id,
        "package_owner_name": pkg.package_owner.name if pkg.package_owner else None,
        "forecast": forecast,
        "currency": currency,
        "financial_weight_pct": round(financial_weight_pct, 2),
        "procurement_progress": procurement_progress,
        "plan_id": plan.id if plan else None,
        "contract_type_id": plan.contract_type_id if plan else None,
        "contract_type_name": plan.contract_type.name if plan and plan.contract_type else None,
        "bidding_company_ids": [b.company_id for b in plan.bidders] if plan else [],
        "step_dates": {str(sd.step_id): sd.due_date for sd in plan.step_dates} if plan else {},
        "notes": plan.notes if plan else None,
        "not_applicable": bool(plan.not_applicable) if plan else False,
        "updated_at": plan.updated_at.isoformat() + 'Z' if plan and plan.updated_at else None,
    }


@router.get("/plans")
def list_plans(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_view(user):
        raise HTTPException(403, "Access denied")
    cfg = _get_or_create_config(user.project_id, db)
    packages = (
        db.query(models.Package)
        .filter_by(project_id=user.project_id)
        .order_by(models.Package.tag_number)
        .all()
    )

    # Compute forecasted budget per package
    forecasts = {}
    currencies = {}
    total_forecast = 0.0
    for pkg in packages:
        bl = db.query(models.BudgetBaseline).filter_by(package_id=pkg.id).first()
        baseline = bl.amount if bl else 0.0
        currency = bl.currency if bl else "EUR"
        tin = sum(t.amount for t in db.query(models.BudgetTransfer).filter_by(to_package_id=pkg.id).all())
        tout = sum(t.amount for t in db.query(models.BudgetTransfer).filter_by(from_package_id=pkg.id).all())
        fc = baseline + tin - tout
        forecasts[pkg.id] = fc
        currencies[pkg.id] = currency
        total_forecast += fc

    # Compute procurement progress per package from register entries
    steps = db.query(models.ProcurementStep).filter_by(
        project_id=user.project_id
    ).order_by(models.ProcurementStep.sort_order).all()
    cum_weights = _get_cum_weights(steps)
    all_entries = db.query(models.ProcurementEntry).filter_by(
        project_id=user.project_id
    ).all()
    entries_by_pkg = {}
    for e in all_entries:
        entries_by_pkg.setdefault(e.package_id, []).append(e)

    result = []
    for pkg in packages:
        plan = db.query(models.PackagePlan).filter_by(
            package_id=pkg.id, project_id=user.project_id
        ).first()
        fc = forecasts[pkg.id]
        weight_pct = (fc / total_forecast * 100) if total_forecast > 0 else 0.0
        pkg_progress = _pkg_avg_progress(entries_by_pkg.get(pkg.id, []), cum_weights)
        result.append(_fmt_plan(pkg, plan, fc, currencies[pkg.id], weight_pct, pkg_progress))

    return {"sequence_validated": cfg.sequence_validated, "plans": result}


@router.put("/plans/{package_id}")
def upsert_plan(
    package_id: int,
    data: PlanUpsert,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    cfg = _get_or_create_config(user.project_id, db)
    if not cfg.sequence_validated:
        raise HTTPException(400, "Sequence must be validated before creating a plan")

    pkg = db.query(models.Package).filter_by(id=package_id, project_id=user.project_id).first()
    if not pkg:
        raise HTTPException(404, "Package not found")
    if not _can_edit_plan(user, pkg, db):
        raise HTTPException(403, "Not authorized to edit this package plan")

    plan = db.query(models.PackagePlan).filter_by(
        package_id=package_id, project_id=user.project_id
    ).first()
    is_new = plan is None
    if is_new:
        plan = models.PackagePlan(project_id=user.project_id, package_id=package_id)
        set_created(plan, user.id)
        db.add(plan)
    else:
        check_lock(plan.updated_at, data.updated_at, "package plan")

    plan.contract_type_id = data.contract_type_id
    plan.notes = data.notes
    if data.not_applicable is not None:
        plan.not_applicable = bool(data.not_applicable)
    set_updated(plan, user.id)
    db.flush()  # ensure plan.id is available

    # Replace bidding companies
    db.query(models.PackagePlanBidder).filter_by(plan_id=plan.id).delete(synchronize_session=False)
    for cid in set(data.bidder_ids):
        db.add(models.PackagePlanBidder(plan_id=plan.id, company_id=cid))

    # Replace step dates
    db.query(models.PackagePlanStepDate).filter_by(plan_id=plan.id).delete(synchronize_session=False)
    for step_id_str, due_date in data.step_dates.items():
        if due_date:
            db.add(models.PackagePlanStepDate(
                plan_id=plan.id, step_id=int(step_id_str), due_date=due_date
            ))

    db.commit()
    db.refresh(plan)
    return {"ok": True, "plan_id": plan.id}


# ── Procurement Dashboard ─────────────────────────────────────────────────────

@router.get("/dashboard")
def get_procurement_dashboard(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
    package_id: Optional[int] = None,
):
    if not _can_view(user):
        raise HTTPException(403, "Access denied")

    today = date_type.today()

    # Load steps + cum_weights
    steps = (
        db.query(models.ProcurementStep)
        .filter_by(project_id=user.project_id)
        .order_by(models.ProcurementStep.sort_order)
        .all()
    )
    cum_weights = _get_cum_weights(steps)
    step_by_name: dict = {s.step_id: s for s in steps}
    step_index_map: dict = {s.id: i for i, s in enumerate(steps)}

    # Load all packages (all projects packages for KPI totals, filter later for chart/detail)
    # Packages flagged as "Not applicable" on their plan are fully excluded
    # from the dashboard pipeline.
    not_applicable_pkg_ids = {
        p.package_id for p in db.query(models.PackagePlan).filter_by(
            project_id=user.project_id, not_applicable=True
        ).all()
    }
    all_packages = [
        p for p in (
            db.query(models.Package)
            .filter_by(project_id=user.project_id)
            .order_by(models.Package.tag_number)
            .all()
        )
        if p.id not in not_applicable_pkg_ids
    ]
    # packages used for chart/detail: filtered when a package_id is selected
    packages = [p for p in all_packages if package_id is None or p.id == package_id]

    # Compute forecast per package (for ALL packages, needed for global KPIs)
    pkg_forecasts: dict = {}
    pkg_currencies: dict = {}
    for pkg in all_packages:
        bl = db.query(models.BudgetBaseline).filter_by(package_id=pkg.id).first()
        baseline = bl.amount if bl else 0.0
        currency = bl.currency if bl else "EUR"
        tin = sum(
            t.amount for t in db.query(models.BudgetTransfer).filter_by(to_package_id=pkg.id).all()
        )
        tout = sum(
            t.amount for t in db.query(models.BudgetTransfer).filter_by(from_package_id=pkg.id).all()
        )
        pkg_forecasts[pkg.id] = baseline + tin - tout
        pkg_currencies[pkg.id] = currency

    global_forecast = sum(fc for fc in pkg_forecasts.values() if fc > 0)
    # total_forecast used for S-curve: only selected packages when filtered
    total_forecast = sum(
        pkg_forecasts[p.id] for p in packages if pkg_forecasts.get(p.id, 0) > 0
    )

    # Load entries grouped by package — drop entries belonging to packages
    # marked not_applicable (in case any pre-existing rows were left behind).
    all_entries_q = db.query(models.ProcurementEntry).filter_by(project_id=user.project_id)
    if package_id is not None:
        all_entries_q = all_entries_q.filter_by(package_id=package_id)
    all_entries = [
        e for e in all_entries_q.all() if e.package_id not in not_applicable_pkg_ids
    ]
    entries_by_pkg: dict = defaultdict(list)
    for e in all_entries:
        entries_by_pkg[e.package_id].append(e)

    # Load plans
    plans_by_pkg: dict = {}
    plans = db.query(models.PackagePlan).filter_by(project_id=user.project_id).all()
    for plan in plans:
        plans_by_pkg[plan.package_id] = plan

    # Overall progress (budget-weighted)
    total_w = total_forecast
    overall_progress = 0.0
    if total_w > 0:
        overall_progress = round(
            sum(
                _pkg_avg_progress(entries_by_pkg.get(pkg.id, []), cum_weights) * pkg_forecasts[pkg.id]
                for pkg in packages if pkg_forecasts[pkg.id] > 0
            ) / total_w,
            1,
        )

    # Summary counts always reflect the full project (not filtered) — but
    # still exclude entries from not_applicable packages.
    all_entries_full = all_entries if package_id is None else [
        e for e in db.query(models.ProcurementEntry).filter_by(project_id=user.project_id).all()
        if e.package_id not in not_applicable_pkg_ids
    ]
    all_entries_full_by_pkg: dict = defaultdict(list)
    for e in all_entries_full:
        all_entries_full_by_pkg[e.package_id].append(e)

    total_packages = len(all_packages)
    packages_with_plan = sum(1 for pkg in all_packages if pkg.id in plans_by_pkg)
    packages_with_entries = sum(1 for pkg in all_packages if all_entries_full_by_pkg.get(pkg.id))
    total_bidders = len(all_entries_full)
    awarded_count = sum(1 for e in all_entries_full if e.status == "AWARDED")

    # Global late steps count (always across all packages, ignores package filter)
    def _count_late_steps(pkg_list, entries_by_pkg_map):
        count = 0
        if not steps:
            return 0
        for pkg in pkg_list:
            plan = plans_by_pkg.get(pkg.id)
            if not plan:
                continue
            sdm = {sd.step_id: sd.due_date for sd in plan.step_dates}
            active_idxs = set()
            for e in entries_by_pkg_map.get(pkg.id, []):
                if e.status not in ("EXCLUDED", "AWARDED") and e.current_step_id in step_index_map:
                    active_idxs.add(step_index_map[e.current_step_id])
            for step in steps:
                due_str = sdm.get(step.id)
                if not due_str:
                    continue
                try:
                    due = date_type.fromisoformat(due_str)
                except ValueError:
                    continue
                if due >= today:
                    continue
                s_idx = step_index_map.get(step.id, -1)
                if any(ai <= s_idx for ai in active_idxs):
                    count += 1
        return count

    global_late_steps_count = _count_late_steps(all_packages, all_entries_full_by_pkg)

    # Build pkg_stats (filtered by package when a filter is active)
    pkg_stats = []
    for pkg in packages:
        entries = entries_by_pkg.get(pkg.id, [])
        plan = plans_by_pkg.get(pkg.id)
        fc = pkg_forecasts[pkg.id]
        financial_weight_pct = (fc / global_forecast * 100) if global_forecast > 0 else 0.0
        procurement_progress = _pkg_avg_progress(entries, cum_weights)

        # Company status counts
        company_statuses = {"COMPETING": 0, "EXCLUDED": 0, "AWAITING": 0, "AWARDED": 0}
        for e in entries:
            if e.status in company_statuses:
                company_statuses[e.status] += 1

        # Bid summary (avg over non-excluded entries with a bid value, plus awarded info)
        bid_summary = compute_pkg_bid_summary(entries)
        avg_bid_value = bid_summary["avg_bid_value"]
        min_bid_value = bid_summary["min_bid_value"]
        max_bid_value = bid_summary["max_bid_value"]

        # Compliance counts (non-excluded entries only — the compliance flags
        # only matter for actively competing bidders). Stored values are
        # PASS / FAIL / PENDING / NA — bucket NA/None/anything-else as PENDING.
        def _bucket(v):
            if v == "PASS": return "YES"
            if v == "FAIL": return "NO"
            return "PENDING"
        active_entries = [e for e in entries if e.status != "EXCLUDED"]
        tech_counts = {"YES": 0, "NO": 0, "PENDING": 0}
        comm_counts = {"YES": 0, "NO": 0, "PENDING": 0}
        for e in active_entries:
            tech_counts[_bucket(e.technical_compliance)] += 1
            comm_counts[_bucket(e.commercial_compliance)] += 1

        # Late steps (for detail list in the filtered view)
        late_steps = []
        if plan and steps:
            step_dates_map: dict = {sd.step_id: sd.due_date for sd in plan.step_dates}
            active_entries = [e for e in entries if e.status not in ("EXCLUDED", "AWARDED")]
            active_step_indices = set()
            for e in active_entries:
                if e.current_step_id and e.current_step_id in step_index_map:
                    active_step_indices.add(step_index_map[e.current_step_id])

            for step in steps:
                if step.id not in step_dates_map:
                    continue
                due_str = step_dates_map[step.id]
                if not due_str:
                    continue
                try:
                    due = date_type.fromisoformat(due_str)
                except ValueError:
                    continue
                if due >= today:
                    continue
                s_idx = step_index_map.get(step.id, -1)
                if any(ai <= s_idx for ai in active_step_indices):
                    days_late = (today - due).days
                    late_steps.append({
                        "step_name": step.step_id,
                        "due_date": due_str,
                        "days_late": days_late,
                    })

        pkg_stats.append({
            "package_id": pkg.id,
            "package_tag": pkg.tag_number,
            "package_name": pkg.name,
            "financial_weight_pct": round(financial_weight_pct, 2),
            "forecast": fc,
            "currency": pkg_currencies.get(pkg.id, "EUR"),
            "procurement_progress": procurement_progress,
            "company_statuses": company_statuses,
            "avg_bid_value": avg_bid_value,
            "min_bid_value": min_bid_value,
            "max_bid_value": max_bid_value,
            "awarded_value": bid_summary["awarded_value"],
            "awarded_company_name": bid_summary["awarded_company_name"],
            "is_awarded": bid_summary["is_awarded"],
            "bid_display_value": bid_summary["display_value"],
            "bid_status": bid_summary["bid_status"],
            "compliance": {"technical": tech_counts, "commercial": comm_counts},
            "late_steps": late_steps,
            "has_plan": plan is not None,
            "has_entries": len(entries) > 0,
        })

    # ── Forecast series ──────────────────────────────────────────────────────
    # For each package/step with a due_date, compute expected overall progress
    # at that date (cumulative, budget-weighted).
    # key: (pkg_id, step_id) -> (date_str, contribution_to_overall_pct)
    # We build per-date, per-package max progress snapshots.

    # pkg_progress_at_date[date][pkg_id] = max cum_weight at or before that date
    pkg_dates: dict = defaultdict(dict)  # pkg_id -> {date_str: pkg_progress_pct}
    for pkg in packages:
        plan = plans_by_pkg.get(pkg.id)
        if not plan or not steps:
            continue
        step_dates_map = {sd.step_id: sd.due_date for sd in plan.step_dates}
        for step in steps:
            if step.id not in step_dates_map:
                continue
            due_str = step_dates_map[step.id]
            if not due_str:
                continue
            # progress AFTER completing this step = cum_weights_before + this_step_weight
            # (cum_weights gives progress when you're AT step S, i.e. steps before S are done;
            #  completing step S itself adds step.weight * 100 on top of that)
            prog = cum_weights.get(step.id, 0.0) + step.weight * 100
            existing = pkg_dates[pkg.id].get(due_str, 0.0)
            pkg_dates[pkg.id][due_str] = max(existing, prog)

    # Collect all forecast dates
    all_forecast_dates = sorted(set(
        d for pkg_id, dates in pkg_dates.items() for d in dates
    ))

    forecast_series = []
    if all_forecast_dates and total_forecast > 0:
        # running max per package
        pkg_running: dict = {pkg.id: 0.0 for pkg in packages}
        for d in all_forecast_dates:
            for pkg in packages:
                if d in pkg_dates.get(pkg.id, {}):
                    pkg_running[pkg.id] = max(pkg_running[pkg.id], pkg_dates[pkg.id][d])
            overall = sum(
                pkg_running[pkg.id] * pkg_forecasts[pkg.id]
                for pkg in packages if pkg_forecasts[pkg.id] > 0
            ) / total_forecast
            forecast_series.append({"date": d, "progress": round(overall, 2)})

    # ── Actual series ────────────────────────────────────────────────────────
    # Query events (STEP_ADVANCE, STEP_REVERT, AWARD) joined through entries
    entry_ids = [e.id for e in all_entries]
    actual_series = []
    if entry_ids:
        events = (
            db.query(models.ProcurementEvent)
            .filter(
                models.ProcurementEvent.entry_id.in_(entry_ids),
                models.ProcurementEvent.event_type.in_(["STEP_ADVANCE", "STEP_REVERT", "AWARD"]),
            )
            .order_by(models.ProcurementEvent.created_at)
            .all()
        )

        # entry_id -> current progress (0-100)
        entry_prog_tracker: dict = {e.id: 0.0 for e in all_entries}
        entry_pkg_map: dict = {e.id: e.package_id for e in all_entries}
        # Current excluded entries don't contribute to averages (consistent with _pkg_avg_progress)
        excluded_entry_ids: set = {e.id for e in all_entries if e.status == "EXCLUDED"}

        # Group events by date
        events_by_date: dict = defaultdict(list)
        for ev in events:
            d = ev.created_at.date().isoformat() + 'Z' if ev.created_at else None
            if d:
                events_by_date[d].append(ev)

        def _compute_overall_actual():
            if total_forecast <= 0:
                return 0.0
            # Average non-EXCLUDED entry progress per package, then weight by forecast
            pkg_entry_progress: dict = defaultdict(list)
            for eid, prog in entry_prog_tracker.items():
                if eid in excluded_entry_ids:
                    continue
                pkg_id = entry_pkg_map.get(eid)
                if pkg_id:
                    pkg_entry_progress[pkg_id].append(prog)
            total = 0.0
            for pkg in packages:
                if pkg_forecasts[pkg.id] <= 0:
                    continue
                progs = pkg_entry_progress.get(pkg.id, [])
                avg = sum(progs) / len(progs) if progs else 0.0
                total += avg * pkg_forecasts[pkg.id]
            return round(total / total_forecast, 2)

        for d in sorted(events_by_date.keys()):
            for ev in events_by_date[d]:
                if ev.event_type == "AWARD":
                    entry_prog_tracker[ev.entry_id] = 100.0
                else:
                    # STEP_ADVANCE or STEP_REVERT: look up step by name
                    if ev.step_name and ev.step_name in step_by_name:
                        step_obj = step_by_name[ev.step_name]
                        entry_prog_tracker[ev.entry_id] = cum_weights.get(step_obj.id, 0.0)
            overall_actual = _compute_overall_actual()
            actual_series.append({"date": d, "progress": overall_actual})

        # Append today's actual if not already present
        today_str = today.isoformat()
        if not actual_series or actual_series[-1]["date"] != today_str:
            actual_series.append({"date": today_str, "progress": _compute_overall_actual()})

    return {
        "overall_progress": overall_progress,
        "total_packages": total_packages,
        "packages_with_plan": packages_with_plan,
        "packages_with_entries": packages_with_entries,
        "total_bidders": total_bidders,
        "awarded_count": awarded_count,
        "late_steps_count": global_late_steps_count,
        "pkg_stats": pkg_stats,
        "forecast_series": forecast_series,
        "actual_series": actual_series,
        "filtered_package_id": package_id,
        "all_packages": [
            {
                "id": p.id,
                "tag": p.tag_number,
                "name": p.name,
                "forecast": pkg_forecasts.get(p.id, 0.0),
                "financial_weight_pct": round(
                    (pkg_forecasts.get(p.id, 0.0) / global_forecast * 100), 2
                ) if global_forecast > 0 else 0.0,
            }
            for p in all_packages
        ],
    }


# ── Procurement Register ──────────────────────────────────────────────────────

class RegisterUpdate(BaseModel):
    status: Optional[str] = None
    exclusion_reason: Optional[str] = None
    technical_compliance: Optional[str] = None
    technical_compliance_note: Optional[str] = None
    commercial_compliance: Optional[str] = None
    commercial_compliance_note: Optional[str] = None
    bid_value: Optional[float] = None
    bid_currency: Optional[str] = None
    comment: Optional[str] = None
    updated_at: Optional[str] = None

class AwardBody(BaseModel):
    comment: Optional[str] = None

class StepActionBody(BaseModel):
    comment: Optional[str] = None


def _pkg_avg_progress(entries: list, cum_weights: dict) -> float:
    """Average cumulative progress of non-excluded entries for a package (0-100).
    Awarded entries always count as 100%."""
    active = [e for e in entries if e.status != "EXCLUDED"]
    if not active:
        return 0.0
    total = sum(
        100.0 if e.status == "AWARDED" else cum_weights.get(e.current_step_id, 0.0)
        for e in active
    )
    return round(total / len(active), 1)


def compute_pkg_bid_summary(entries: list) -> dict:
    """Aggregate bid value information for a package.

    - avg/min/max_bid_value: from non-excluded entries with a bid_value (consistent with the dashboard).
    - awarded_value / awarded_company_name: from the AWARDED entry, if any.
    - display_value: awarded_value when awarded, otherwise avg_bid_value.
    - bid_status: 'AWARDED' if the package is awarded, 'IN_PROGRESS' if there is at least one
      bid value but no award yet, otherwise None.
    """
    bid_entries = [e for e in entries if e.status != "EXCLUDED" and e.bid_value]
    avg_bid_value = round(sum(e.bid_value for e in bid_entries) / len(bid_entries), 0) if bid_entries else None
    min_bid_value = min((e.bid_value for e in bid_entries), default=None)
    max_bid_value = max((e.bid_value for e in bid_entries), default=None)

    awarded_entry = next((e for e in entries if e.status == "AWARDED"), None)
    is_awarded = awarded_entry is not None
    awarded_value = awarded_entry.bid_value if awarded_entry else None
    awarded_company_name = (
        awarded_entry.company.name if awarded_entry and awarded_entry.company else None
    )

    if is_awarded:
        display_value = awarded_value if awarded_value is not None else avg_bid_value
        bid_status = "AWARDED"
    elif avg_bid_value is not None:
        display_value = avg_bid_value
        bid_status = "IN_PROGRESS"
    else:
        display_value = None
        bid_status = None

    return {
        "avg_bid_value": avg_bid_value,
        "min_bid_value": min_bid_value,
        "max_bid_value": max_bid_value,
        "awarded_value": awarded_value,
        "awarded_company_name": awarded_company_name,
        "is_awarded": is_awarded,
        "display_value": display_value,
        "bid_status": bid_status,
    }


def _get_cum_weights(steps) -> dict:
    """step_id -> cumulative weight% of all steps before this one (steps already completed)."""
    result = {}
    running = 0.0
    for s in sorted(steps, key=lambda x: x.sort_order):
        result[s.id] = round(running * 100, 1)
        running += s.weight
    return result

def _fmt_entry(entry: models.ProcurementEntry, cum_weights: dict, steps_ordered: list = None, has_current_step_submittal: bool = False) -> dict:
    progress = 100.0 if entry.status == "AWARDED" else (
        cum_weights.get(entry.current_step_id, 0.0) if entry.current_step_id else 0.0
    )

    step_index = None
    step_count = len(steps_ordered) if steps_ordered else 0
    next_step_id = None
    next_step_name = None
    prev_step_id = None
    prev_step_name = None

    if steps_ordered and entry.current_step_id:
        for i, s in enumerate(steps_ordered):
            if s.id == entry.current_step_id:
                step_index = i
                if i + 1 < len(steps_ordered):
                    next_step_id = steps_ordered[i + 1].id
                    next_step_name = steps_ordered[i + 1].step_id
                if i > 0:
                    prev_step_id = steps_ordered[i - 1].id
                    prev_step_name = steps_ordered[i - 1].step_id
                break

    return {
        "id": entry.id,
        "package_id": entry.package_id,
        "company_id": entry.company_id,
        "company_name": entry.company.name if entry.company else None,
        "current_step_id": entry.current_step_id,
        "current_step_name": entry.current_step.step_id if entry.current_step else None,
        "step_index": step_index,
        "step_count": step_count,
        "next_step_id": next_step_id,
        "next_step_name": next_step_name,
        "prev_step_id": prev_step_id,
        "prev_step_name": prev_step_name,
        "progress_pct": progress,
        "status": entry.status,
        "exclusion_reason": entry.exclusion_reason,
        "technical_compliance": entry.technical_compliance,
        "technical_compliance_note": entry.technical_compliance_note,
        "commercial_compliance": entry.commercial_compliance,
        "commercial_compliance_note": entry.commercial_compliance_note,
        "bid_value": entry.bid_value,
        "bid_currency": entry.bid_currency or "EUR",
        "has_current_step_submittal": has_current_step_submittal,
        **audit_dict(entry),
    }


@router.get("/register")
def get_register(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_view(user):
        raise HTTPException(403, "Access denied")

    steps = db.query(models.ProcurementStep).filter_by(
        project_id=user.project_id
    ).order_by(models.ProcurementStep.sort_order).all()
    cum_weights = _get_cum_weights(steps)
    first_step_id = steps[0].id if steps else None

    # Auto-sync: create missing entries for companies in current plans, but
    # skip packages flagged as not_applicable on their plan.
    plans = db.query(models.PackagePlan).filter_by(project_id=user.project_id).all()
    not_applicable_pkg_ids = {p.package_id for p in plans if p.not_applicable}
    synced = False
    for plan in plans:
        if plan.not_applicable:
            continue
        for bidder in plan.bidders:
            existing = db.query(models.ProcurementEntry).filter_by(
                package_id=plan.package_id, company_id=bidder.company_id
            ).first()
            if not existing:
                e = models.ProcurementEntry(
                    project_id=user.project_id,
                    package_id=plan.package_id,
                    company_id=bidder.company_id,
                    status="COMPETING",
                    current_step_id=first_step_id,
                )
                set_created(e, user.id)
                db.add(e)
                synced = True
    if synced:
        db.commit()

    packages = [
        p for p in (
            db.query(models.Package)
            .filter_by(project_id=user.project_id)
            .order_by(models.Package.tag_number)
            .all()
        )
        if p.id not in not_applicable_pkg_ids
    ]

    # Pre-fetch all entries and forecasts for all packages in one pass
    all_entries = db.query(models.ProcurementEntry).filter_by(
        project_id=user.project_id
    ).all()
    entries_by_pkg: dict = {}
    for e in all_entries:
        entries_by_pkg.setdefault(e.package_id, []).append(e)

    # Pre-fetch submittals to determine current-step submittal indicator
    entry_ids = [e.id for e in all_entries]
    all_submittals = db.query(models.BidderSubmittal).filter(
        models.BidderSubmittal.entry_id.in_(entry_ids)
    ).all() if entry_ids else []
    submitted_keys = {(s.entry_id, s.step_id) for s in all_submittals}

    pkg_forecasts: dict = {}
    pkg_currencies: dict = {}
    for pkg in packages:
        bl = db.query(models.BudgetBaseline).filter_by(package_id=pkg.id).first()
        baseline = bl.amount if bl else 0.0
        currency = bl.currency if bl else "EUR"
        tin = sum(t.amount for t in db.query(models.BudgetTransfer).filter_by(to_package_id=pkg.id).all())
        tout = sum(t.amount for t in db.query(models.BudgetTransfer).filter_by(from_package_id=pkg.id).all())
        pkg_forecasts[pkg.id] = baseline + tin - tout
        pkg_currencies[pkg.id] = currency

    # Overall procurement progress: ALL packages weighted by forecast budget
    # Packages with no bidding companies contribute 0% progress but still count
    total_w = sum(fc for fc in pkg_forecasts.values() if fc > 0)
    overall_progress = round(
        sum(
            _pkg_avg_progress(entries_by_pkg.get(pkg.id, []), cum_weights) * pkg_forecasts[pkg.id]
            for pkg in packages if pkg_forecasts[pkg.id] > 0
        ) / total_w,
        1,
    ) if total_w > 0 else 0.0

    # Register table: only packages that have bidding companies
    result = []
    for pkg in packages:
        entries = entries_by_pkg.get(pkg.id, [])
        if not entries:
            continue
        pkg_progress = _pkg_avg_progress(entries, cum_weights)
        bid_summary = compute_pkg_bid_summary(entries)
        result.append({
            "package_id": pkg.id,
            "package_tag": pkg.tag_number,
            "package_name": pkg.name,
            "package_owner_contact_id": pkg.package_owner_id,
            "forecast": pkg_forecasts[pkg.id],
            "currency": pkg_currencies[pkg.id],
            "package_progress": pkg_progress,
            "bid_value": bid_summary["display_value"],
            "bid_status": bid_summary["bid_status"],
            "is_awarded": bid_summary["is_awarded"],
            "awarded_company_name": bid_summary["awarded_company_name"],
            "entries": [
                _fmt_entry(
                    e, cum_weights, steps,
                    has_current_step_submittal=(e.id, e.current_step_id) in submitted_keys
                )
                for e in entries
            ],
        })

    return {"overall_progress": overall_progress, "packages": result}


@router.put("/register/{entry_id}")
def update_register_entry(
    entry_id: int,
    data: RegisterUpdate,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    entry = db.query(models.ProcurementEntry).filter_by(
        id=entry_id, project_id=user.project_id
    ).first()
    if not entry:
        raise HTTPException(404, "Entry not found")

    pkg = db.query(models.Package).filter_by(id=entry.package_id).first()
    if not _can_edit_plan(user, pkg, db):
        raise HTTPException(403, "Not authorized to edit this package")

    check_lock(entry.updated_at, data.updated_at, "procurement entry")

    now = datetime.utcnow()
    any_event = False

    # Status change
    if data.status is not None and data.status != entry.status:
        if data.status == "EXCLUDED" and not (data.exclusion_reason or "").strip():
            raise HTTPException(400, "Exclusion reason is required when excluding a company")
        event_comment = data.exclusion_reason if data.status == "EXCLUDED" else (data.comment or None)
        db.add(models.ProcurementEvent(
            entry_id=entry.id,
            event_type="STATUS_CHANGE",
            old_status=entry.status,
            new_status=data.status,
            comment=event_comment,
            created_at=now,
            created_by_id=user.id,
        ))
        entry.status = data.status
        if data.status == "EXCLUDED":
            entry.exclusion_reason = data.exclusion_reason
        any_event = True

    # Evaluation updates
    eval_parts = []
    if data.technical_compliance is not None and data.technical_compliance != (entry.technical_compliance or ""):
        eval_parts.append(f"Technical -> {data.technical_compliance}")
        entry.technical_compliance = data.technical_compliance
    if data.technical_compliance_note is not None:
        entry.technical_compliance_note = data.technical_compliance_note or None
    if data.commercial_compliance is not None and data.commercial_compliance != (entry.commercial_compliance or ""):
        eval_parts.append(f"Commercial -> {data.commercial_compliance}")
        entry.commercial_compliance = data.commercial_compliance
    if data.commercial_compliance_note is not None:
        entry.commercial_compliance_note = data.commercial_compliance_note or None
    if data.bid_value is not None and data.bid_value != entry.bid_value:
        ccy = data.bid_currency or entry.bid_currency or "EUR"
        eval_parts.append(f"Bid -> {data.bid_value:,.0f} {ccy}")
    if data.bid_value is not None:
        entry.bid_value = data.bid_value
    if data.bid_currency is not None:
        entry.bid_currency = data.bid_currency

    if eval_parts:
        txt = " | ".join(eval_parts)
        if data.comment:
            txt += f" -- {data.comment}"
        db.add(models.ProcurementEvent(
            entry_id=entry.id,
            event_type="EVALUATION",
            comment=txt,
            created_at=now,
            created_by_id=user.id,
        ))
        any_event = True

    if data.comment and not any_event:
        db.add(models.ProcurementEvent(
            entry_id=entry.id,
            event_type="COMMENT",
            comment=data.comment,
            created_at=now,
            created_by_id=user.id,
        ))

    set_updated(entry, user.id)
    db.commit()
    db.refresh(entry)

    steps = db.query(models.ProcurementStep).filter_by(
        project_id=user.project_id
    ).order_by(models.ProcurementStep.sort_order).all()
    return _fmt_entry(entry, _get_cum_weights(steps), steps)


@router.post("/register/{entry_id}/advance")
def advance_step(
    entry_id: int,
    data: StepActionBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    entry = db.query(models.ProcurementEntry).filter_by(
        id=entry_id, project_id=user.project_id
    ).first()
    if not entry:
        raise HTTPException(404, "Entry not found")

    pkg = db.query(models.Package).filter_by(id=entry.package_id).first()
    if not _can_edit_plan(user, pkg, db):
        raise HTTPException(403, "Not authorized")

    if entry.status in ("EXCLUDED", "AWARDED"):
        raise HTTPException(400, "Cannot advance step for an excluded or awarded entry")

    steps = db.query(models.ProcurementStep).filter_by(
        project_id=user.project_id
    ).order_by(models.ProcurementStep.sort_order).all()
    if not steps:
        raise HTTPException(400, "No procurement steps defined")

    step_ids = [s.id for s in steps]
    if entry.current_step_id is None:
        new_step = steps[0]
    else:
        try:
            idx = step_ids.index(entry.current_step_id)
        except ValueError:
            raise HTTPException(400, "Current step not found in sequence")
        if idx + 1 >= len(steps):
            raise HTTPException(400, "Already at the last step")
        new_step = steps[idx + 1]

    entry.current_step_id = new_step.id
    set_updated(entry, user.id)
    db.add(models.ProcurementEvent(
        entry_id=entry.id,
        event_type="STEP_ADVANCE",
        step_name=new_step.step_id,
        comment=data.comment or None,
        created_at=datetime.utcnow(),
        created_by_id=user.id,
    ))
    db.commit()
    db.refresh(entry)
    return _fmt_entry(entry, _get_cum_weights(steps), steps)


@router.post("/register/{entry_id}/revert")
def revert_step(
    entry_id: int,
    data: StepActionBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    entry = db.query(models.ProcurementEntry).filter_by(
        id=entry_id, project_id=user.project_id
    ).first()
    if not entry:
        raise HTTPException(404, "Entry not found")

    pkg = db.query(models.Package).filter_by(id=entry.package_id).first()
    if not _can_edit_plan(user, pkg, db):
        raise HTTPException(403, "Not authorized")

    if entry.status in ("EXCLUDED", "AWARDED"):
        raise HTTPException(400, "Cannot revert step for an excluded or awarded entry")

    steps = db.query(models.ProcurementStep).filter_by(
        project_id=user.project_id
    ).order_by(models.ProcurementStep.sort_order).all()
    step_ids = [s.id for s in steps]

    if entry.current_step_id is None:
        raise HTTPException(400, "Entry has not started the process yet")

    try:
        idx = step_ids.index(entry.current_step_id)
    except ValueError:
        raise HTTPException(400, "Current step not found in sequence")

    if idx == 0:
        raise HTTPException(400, "Already at the first step, cannot revert further")

    new_step = steps[idx - 1]
    entry.current_step_id = new_step.id
    set_updated(entry, user.id)
    db.add(models.ProcurementEvent(
        entry_id=entry.id,
        event_type="STEP_REVERT",
        step_name=new_step.step_id,
        comment=data.comment or None,
        created_at=datetime.utcnow(),
        created_by_id=user.id,
    ))
    db.commit()
    db.refresh(entry)
    return _fmt_entry(entry, _get_cum_weights(steps), steps)


@router.post("/register/{entry_id}/award")
def award_entry(
    entry_id: int,
    data: AwardBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    entry = db.query(models.ProcurementEntry).filter_by(
        id=entry_id, project_id=user.project_id
    ).first()
    if not entry:
        raise HTTPException(404, "Entry not found")

    pkg = db.query(models.Package).filter_by(id=entry.package_id).first()
    if not _can_edit_plan(user, pkg, db):
        raise HTTPException(403, "Not authorized")

    now = datetime.utcnow()
    old_status = entry.status
    entry.status = "AWARDED"
    set_updated(entry, user.id)
    db.add(models.ProcurementEvent(
        entry_id=entry.id,
        event_type="AWARD",
        old_status=old_status,
        new_status="AWARDED",
        comment=data.comment or None,
        created_at=now,
        created_by_id=user.id,
    ))

    # Exclude all other competing/awaiting entries for this package
    others = db.query(models.ProcurementEntry).filter(
        models.ProcurementEntry.package_id == entry.package_id,
        models.ProcurementEntry.project_id == user.project_id,
        models.ProcurementEntry.id != entry.id,
        models.ProcurementEntry.status.in_(["COMPETING", "AWAITING"]),
    ).all()
    awarded_name = entry.company.name if entry.company else "another company"
    for other in others:
        old = other.status
        other.status = "EXCLUDED"
        set_updated(other, user.id)
        db.add(models.ProcurementEvent(
            entry_id=other.id,
            event_type="STATUS_CHANGE",
            old_status=old,
            new_status="EXCLUDED",
            comment=f"Excluded following award to {awarded_name}",
            created_at=now,
            created_by_id=user.id,
        ))

    db.commit()
    return {"ok": True}


class CreateOrderFromAwardBody(BaseModel):
    po_number: str
    description: Optional[str] = None
    amount: float = 0.0
    currency: str = "EUR"
    order_date: Optional[str] = None
    assign_vendor_role: bool = False


@router.post("/register/{entry_id}/create-order")
def create_order_from_award(
    entry_id: int,
    body: CreateOrderFromAwardBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_edit(user, db):
        raise HTTPException(403, "Access denied")
    entry = db.query(models.ProcurementEntry).filter_by(
        id=entry_id, project_id=user.project_id
    ).first()
    if not entry:
        raise HTTPException(404, "Entry not found")
    if entry.status != "AWARDED":
        raise HTTPException(400, "Entry must be AWARDED to create an order")

    # Create the budget order
    order = models.Order(
        package_id=entry.package_id,
        po_number=body.po_number,
        description=body.description,
        vendor_name=entry.company.name if entry.company else None,
        amount=body.amount,
        currency=body.currency,
        order_date=body.order_date,
        status="COMMITTED",
    )
    set_created(order, user.id)
    db.add(order)
    db.flush()

    assigned_count = 0
    if body.assign_vendor_role:
        company_contacts = db.query(models.BiddingCompanyContact).filter_by(
            company_id=entry.company_id
        ).all()
        for cc in company_contacts:
            # Update per-project role to VENDOR
            user_proj = db.query(models.UserProject).filter_by(
                user_id=cc.user_id,
                project_id=user.project_id,
            ).first()
            if user_proj:
                user_proj.role = "VENDOR"
            # Link user's contact to the package
            u = db.query(models.User).filter_by(id=cc.user_id).first()
            if u and u.contact_id:
                existing = db.query(models.PackageContact).filter_by(
                    package_id=entry.package_id,
                    contact_id=u.contact_id,
                ).first()
                if not existing:
                    db.add(models.PackageContact(
                        package_id=entry.package_id,
                        contact_id=u.contact_id,
                    ))
                    assigned_count += 1

    # Log the order creation in the entry's event log
    db.add(models.ProcurementEvent(
        entry_id=entry.id,
        event_type="ORDER_CREATED",
        comment=f"Budget order created — {order.currency} {order.amount:,.2f} (PO: {order.po_number})"
                + (f" — Vendor role assigned to {assigned_count} contact(s)" if assigned_count else ""),
        created_at=datetime.utcnow(),
        created_by_id=user.id,
    ))

    db.commit()
    return {
        "order_id": order.id,
        "vendor_name": order.vendor_name,
        "amount": order.amount,
        "currency": order.currency,
        "assigned_contacts": assigned_count,
    }


@router.get("/register/{entry_id}/events")
def get_entry_events(
    entry_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    if not _can_view(user):
        raise HTTPException(403, "Access denied")
    entry = db.query(models.ProcurementEntry).filter_by(
        id=entry_id, project_id=user.project_id
    ).first()
    if not entry:
        raise HTTPException(404, "Entry not found")
    events = db.query(models.ProcurementEvent).filter_by(
        entry_id=entry_id
    ).order_by(models.ProcurementEvent.created_at.desc()).all()
    return [
        {
            "id": e.id,
            "event_type": e.event_type,
            "step_name": e.step_name,
            "old_status": e.old_status,
            "new_status": e.new_status,
            "comment": e.comment,
            "created_at": e.created_at.isoformat() + 'Z' if e.created_at else None,
            "created_by_name": e.created_by.name if e.created_by else None,
        }
        for e in events
    ]


# ── Bidder Portal ─────────────────────────────────────────────────────────────

class BidderUpdateBody(BaseModel):
    bid_value: Optional[float] = None
    bid_currency: Optional[str] = None
    comment: Optional[str] = None


@router.get("/my-entries")
def get_my_entries(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Return all procurement entries for the bidder's company (BIDDER role only)."""
    if user.role != "BIDDER":
        raise HTTPException(403, "Only bidder users can access this endpoint")

    # Find which company (or companies) this user is a contact for
    contacts = db.query(models.BiddingCompanyContact).filter_by(user_id=user.id).all()
    company_ids = [c.company_id for c in contacts]
    if not company_ids:
        return {"company": None, "entries": []}

    company = db.query(models.BiddingCompany).filter(
        models.BiddingCompany.id.in_(company_ids),
        models.BiddingCompany.project_id == user.project_id,
    ).first()
    if not company:
        return {"company": None, "entries": []}

    entries = (
        db.query(models.ProcurementEntry)
        .filter(
            models.ProcurementEntry.project_id == user.project_id,
            models.ProcurementEntry.company_id.in_(company_ids),
        )
        .all()
    )

    steps = (
        db.query(models.ProcurementStep)
        .filter_by(project_id=user.project_id)
        .order_by(models.ProcurementStep.sort_order)
        .all()
    )
    cum_weights = _get_cum_weights(steps)
    step_index_map = {s.id: i for i, s in enumerate(steps)}

    plans = db.query(models.PackagePlan).filter_by(project_id=user.project_id).all()
    plans_by_pkg = {p.package_id: p for p in plans}

    result = []
    for entry in entries:
        pkg = db.query(models.Package).filter_by(id=entry.package_id).first()
        plan = plans_by_pkg.get(entry.package_id)

        # Step schedule
        step_dates_map = {sd.step_id: sd.due_date for sd in plan.step_dates} if plan else {}
        current_idx = step_index_map.get(entry.current_step_id, -1)
        schedule = []
        for i, step in enumerate(steps):
            if i < current_idx:
                status = "completed"
            elif i == current_idx:
                status = "current"
            else:
                status = "upcoming"
            schedule.append({
                "step_id": step.id,
                "step_name": step.step_id,
                "description": step.description,
                "weight_pct": round(step.weight * 100, 1),
                "due_date": step_dates_map.get(step.id),
                "status": status,
            })

        # Events visible to bidder (exclude internal evaluation notes)
        events = (
            db.query(models.ProcurementEvent)
            .filter(
                models.ProcurementEvent.entry_id == entry.id,
                models.ProcurementEvent.event_type.in_(
                    ["STEP_ADVANCE", "STATUS_CHANGE", "AWARD", "BIDDER_COMMENT", "BIDDER_SUBMITTAL"]
                ),
            )
            .order_by(models.ProcurementEvent.created_at.desc())
            .all()
        )

        submittals = entry.submittals

        # Lock indicator: has the bidder already submitted at the current step?
        has_current_step_submittal = any(
            s.step_id == entry.current_step_id for s in submittals
        ) if entry.current_step_id else False

        current_step = next((s for s in steps if s.id == entry.current_step_id), None)
        progress = 100.0 if entry.status == "AWARDED" else cum_weights.get(entry.current_step_id, 0.0)

        result.append({
            "entry_id": entry.id,
            "package_id": entry.package_id,
            "package_tag": pkg.tag_number if pkg else None,
            "package_name": pkg.name if pkg else None,
            "status": entry.status,
            "progress": progress,
            "step_index": current_idx + 1,
            "step_count": len(steps),
            "current_step_id": entry.current_step_id,
            "current_step_name": current_step.step_id if current_step else None,
            "current_step_description": current_step.description if current_step else None,
            "has_current_step_submittal": has_current_step_submittal,
            "bid_value": entry.bid_value,
            "bid_currency": entry.bid_currency or "EUR",
            "technical_compliance": entry.technical_compliance,
            "technical_compliance_note": entry.technical_compliance_note,
            "commercial_compliance": entry.commercial_compliance,
            "commercial_compliance_note": entry.commercial_compliance_note,
            "exclusion_reason": entry.exclusion_reason,
            "schedule": schedule,
            "events": [
                {
                    "event_type": e.event_type,
                    "step_name": e.step_name,
                    "old_status": e.old_status,
                    "new_status": e.new_status,
                    "comment": e.comment,
                    "created_at": e.created_at.isoformat() + 'Z' if e.created_at else None,
                    "created_by_name": e.created_by.name if e.created_by else None,
                }
                for e in events
            ],
            "submittals": [
                {
                    "id": s.id,
                    "step_id": s.step_id,
                    "step_name": s.step_name,
                    "bid_value": s.bid_value,
                    "bid_currency": s.bid_currency or "EUR",
                    "comment": s.comment,
                    "submitted_at": s.submitted_at.isoformat() + 'Z' if s.submitted_at else None,
                    "submitted_by_name": s.submitted_by.name if s.submitted_by else None,
                }
                for s in sorted(submittals, key=lambda x: x.submitted_at or datetime.min, reverse=True)
            ],
        })

    return {"company": {"id": company.id, "name": company.name}, "entries": result}


@router.post("/entries/{entry_id}/bidder-update")
def bidder_update_entry(
    entry_id: int,
    data: BidderUpdateBody,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Allow a BIDDER to submit/update their bid value and add a comment."""
    if user.role != "BIDDER":
        raise HTTPException(403, "Only bidder users can access this endpoint")

    # Verify this entry belongs to the user's company
    contacts = db.query(models.BiddingCompanyContact).filter_by(user_id=user.id).all()
    company_ids = [c.company_id for c in contacts]

    entry = db.query(models.ProcurementEntry).filter_by(
        id=entry_id, project_id=user.project_id
    ).first()
    if not entry or entry.company_id not in company_ids:
        raise HTTPException(404, "Entry not found")

    # Lock once a submittal already exists for the current step. The bidder
    # has to wait for the project team to advance the step before they can
    # submit again.
    if entry.current_step_id is not None:
        existing = db.query(models.BidderSubmittal).filter_by(
            entry_id=entry.id, step_id=entry.current_step_id,
        ).first()
        if existing:
            raise HTTPException(
                409,
                "You have already submitted for the current step. "
                "Wait for the project team to advance the step before submitting again."
            )

    now = datetime.utcnow()

    # Update bid value on the entry if provided
    if data.bid_value is not None:
        entry.bid_value = data.bid_value
        entry.bid_currency = data.bid_currency or entry.bid_currency or "EUR"
        set_updated(entry, user.id)

    # Resolve current step for the submittal record
    current_step = entry.current_step
    step_name = current_step.step_id if current_step else None

    # Create a formal BidderSubmittal record
    submittal = models.BidderSubmittal(
        entry_id=entry.id,
        step_id=entry.current_step_id,
        step_name=step_name,
        bid_value=data.bid_value,
        bid_currency=data.bid_currency or entry.bid_currency or "EUR",
        comment=data.comment.strip() if data.comment and data.comment.strip() else None,
        submitted_at=now,
        submitted_by_id=user.id,
    )
    db.add(submittal)

    # Log as BIDDER_SUBMITTAL event (visible to project team)
    comment_parts = []
    if data.bid_value is not None:
        currency = data.bid_currency or entry.bid_currency or "EUR"
        comment_parts.append(f"Bid: {data.bid_value:,.2f} {currency}")
    if data.comment and data.comment.strip():
        comment_parts.append(data.comment.strip())
    db.add(models.ProcurementEvent(
        entry_id=entry.id,
        event_type="BIDDER_SUBMITTAL",
        step_name=step_name,
        comment=" | ".join(comment_parts) if comment_parts else None,
        created_at=now,
        created_by_id=user.id,
    ))

    db.commit()
    return {"ok": True}


# ── Bidder submittal action points (My Action Points integration) ───────────

@router.get("/my-pending-submittals")
def my_pending_submittals(
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Action-point feed: bidder submittals where the current user is the
    package owner / PMC commercial / Client commercial reviewer and hasn't
    acknowledged the submittal yet. Each of those three reviewers consumes
    their action point independently."""
    if user.role == "BIDDER" or not user.contact_id:
        return []

    # Submittals on entries belonging to packages where the user is one of
    # the three review roles. We join through ProcurementEntry → Package.
    rows = (
        db.query(models.BidderSubmittal, models.ProcurementEntry, models.Package)
        .join(models.ProcurementEntry, models.BidderSubmittal.entry_id == models.ProcurementEntry.id)
        .join(models.Package, models.ProcurementEntry.package_id == models.Package.id)
        .filter(
            models.ProcurementEntry.project_id == user.project_id,
            or_(
                models.Package.package_owner_id == user.contact_id,
                models.Package.pmc_commercial_reviewer_id == user.contact_id,
                models.Package.client_commercial_reviewer_id == user.contact_id,
            ),
        )
        .all()
    )
    if not rows:
        return []

    # Drop submittals this user has already acknowledged.
    acked_ids = {
        a.submittal_id for a in db.query(models.BidderSubmittalAck.submittal_id)
            .filter(models.BidderSubmittalAck.user_id == user.id)
            .all()
    }

    result = []
    for (s, entry, pkg) in rows:
        if s.id in acked_ids:
            continue
        roles = []
        if pkg.package_owner_id == user.contact_id:
            roles.append("Package Owner")
        if pkg.pmc_commercial_reviewer_id == user.contact_id:
            roles.append("PMC Commercial")
        if pkg.client_commercial_reviewer_id == user.contact_id:
            roles.append("Client Commercial")
        result.append({
            "submittal_id": s.id,
            "entry_id": entry.id,
            "package_id": pkg.id,
            "package_tag": pkg.tag_number,
            "package_name": pkg.name,
            "company_id": entry.company_id,
            "company_name": entry.company.name if entry.company else None,
            "step_name": s.step_name,
            "submitted_at": s.submitted_at.isoformat() + 'Z' if s.submitted_at else None,
            "submitted_by_name": s.submitted_by.name if s.submitted_by else None,
            "bid_value": s.bid_value,
            "bid_currency": s.bid_currency,
            "comment": s.comment,
            "your_roles": roles,
        })
    # Newest first
    result.sort(key=lambda r: r["submitted_at"] or "", reverse=True)
    return result


@router.post("/submittals/{submittal_id}/acknowledge")
def acknowledge_submittal(
    submittal_id: int,
    db: Session = Depends(get_db),
    user: auth.ProjectContext = Depends(auth.get_project_user),
):
    """Mark this user's action point for the submittal as consumed. Idempotent
    — calling twice is a no-op. Other reviewers' action points stay."""
    s = db.query(models.BidderSubmittal).filter_by(id=submittal_id).first()
    if not s:
        raise HTTPException(404, "Submittal not found")
    entry = s.entry
    if not entry or entry.project_id != user.project_id:
        raise HTTPException(404, "Submittal not found")
    existing = db.query(models.BidderSubmittalAck).filter_by(
        submittal_id=submittal_id, user_id=user.id,
    ).first()
    if not existing:
        db.add(models.BidderSubmittalAck(submittal_id=submittal_id, user_id=user.id))
        db.commit()
    return {"ok": True}
