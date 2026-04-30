# ─────────────────────────────────────────────────────────────────────────────
# Budget Management Router
# ─────────────────────────────────────────────────────────────────────────────
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
import models
import auth
import database
from routers.audit import set_created, set_updated, check_lock, audit_dict

router = APIRouter(prefix="/api/budget", tags=["budget"])


def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _user_package_ids(user: auth.ProjectContext, db: Session):
    """Returns None (all project packages visible) or a list of specific package IDs."""
    if user.role in ("ADMIN", "PROJECT_OWNER", "PROJECT_TEAM", "CLIENT"):
        return None  # All packages in the project — filtered below by project_id
    # VENDOR: only packages they are linked to
    if not user.contact_id:
        return []
    links = db.query(models.PackageContact).filter_by(contact_id=user.contact_id).all()
    return [lnk.package_id for lnk in links]


def _can_edit_package(user: auth.ProjectContext, package, db: Session):
    if auth.has_owner_or_lead_access(user, "Budget", db):
        return True
    if user.role == "PROJECT_TEAM":
        return (
            package is not None
            and package.package_owner_id is not None
            and package.package_owner_id == user.contact_id
        )
    return False


def _can_submit_invoice(user: auth.ProjectContext, package_id: int, db: Session):
    if user.role in ("ADMIN", "PROJECT_OWNER", "PROJECT_TEAM"):
        return True
    if user.role == "VENDOR":
        if not user.contact_id:
            return False
        link = db.query(models.PackageContact).filter_by(
            contact_id=user.contact_id, package_id=package_id
        ).first()
        return link is not None
    return False


# ─── Risk Budget Impact ──────────────────────────────────────────────────────

@router.get("/risk-impact")
def get_risk_budget_impact(
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    """Return the total budget impact of risks: open before/after mitigation, closed after mitigation."""
    # Load score setup lookup
    setup_rows = db.query(models.RiskScoreSetup).all()
    setup = {s.score: s for s in setup_rows}

    def calc_impact(risk, use_after=False):
        if not risk.capex_value:
            return 0.0
        ps = risk.prob_score_after if use_after else risk.prob_score_before
        cs = risk.capex_score_after if use_after else risk.capex_score_before
        if not ps or not cs:
            return 0.0
        p_setup = setup.get(ps)
        c_setup = setup.get(cs)
        if not p_setup or not c_setup:
            return 0.0
        return risk.capex_value * (p_setup.probability_pct / 100) * (c_setup.capex_impact_pct / 100)

    risks = db.query(models.Risk).filter(
        models.Risk.project_id == user.project_id
    ).all()

    open_before = 0.0
    open_after = 0.0
    closed_after = 0.0

    for r in risks:
        if r.status == "OPEN":
            open_before += calc_impact(r, use_after=False)
            open_after += calc_impact(r, use_after=True)
        elif r.status == "CLOSED":
            closed_after += calc_impact(r, use_after=True)

    # Sum all RISK_INTEGRATION transfers for this project
    project_pkg_ids = [
        r[0] for r in db.query(models.Package.id).filter(
            models.Package.project_id == user.project_id
        ).all()
    ]
    risk_integrations = db.query(models.BudgetTransfer).filter(
        models.BudgetTransfer.type == "RISK_INTEGRATION",
        models.BudgetTransfer.to_package_id.in_(project_pkg_ids),
    ).all()
    total_integrated = sum(t.amount for t in risk_integrations)

    # Apply deduction: first from closed, then proportionally from open
    remaining = total_integrated

    closed_deducted = min(remaining, closed_after)
    remaining -= closed_deducted

    # Same absolute amount deducted from both open values
    open_deducted = 0.0
    if remaining > 0:
        open_deducted = remaining

    return {
        "open_before_mitigation": max(open_before - open_deducted, 0.0),
        "open_after_mitigation": max(open_after - open_deducted, 0.0),
        "closed_after_mitigation": closed_after - closed_deducted,
        "initial_open_before": open_before,
        "initial_open_after": open_after,
        "initial_closed_after": closed_after,
        "total_integrated": total_integrated,
        "closed_deducted": closed_deducted,
        "open_deducted": open_deducted,
    }


# ─── Budget Overview ──────────────────────────────────────────────────────────

@router.get("/overview")
def get_budget_overview(
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    from routers.procurement import compute_pkg_bid_summary

    pkg_ids = _user_package_ids(user, db)
    q = db.query(models.Package).filter(models.Package.project_id == user.project_id)
    if pkg_ids is not None:
        q = q.filter(models.Package.id.in_(pkg_ids))
    packages = q.order_by(models.Package.tag_number).all()

    proc_entries_by_pkg: dict = {}
    for e in db.query(models.ProcurementEntry).filter_by(project_id=user.project_id).all():
        proc_entries_by_pkg.setdefault(e.package_id, []).append(e)

    result = []
    for pkg in packages:
        bl = db.query(models.BudgetBaseline).filter_by(package_id=pkg.id).first()
        baseline = bl.amount if bl else 0.0
        currency = bl.currency if bl else "EUR"

        transfers_in = db.query(models.BudgetTransfer).filter(
            models.BudgetTransfer.to_package_id == pkg.id
        ).all()
        transfers_out = db.query(models.BudgetTransfer).filter(
            models.BudgetTransfer.from_package_id == pkg.id
        ).all()
        transfer_net = sum(t.amount for t in transfers_in) - sum(t.amount for t in transfers_out)
        forecast_base = baseline + transfer_net

        orders = db.query(models.Order).filter(
            models.Order.package_id == pkg.id,
            models.Order.status.notin_(["DRAFT", "CANCELLED"]),
        ).all()
        committed = sum(o.amount for o in orders)

        invoices = db.query(models.Invoice).filter(
            models.Invoice.package_id == pkg.id,
            models.Invoice.status == "APPROVED",
        ).all()
        spend = sum(i.amount for i in invoices)

        # Approved scope changes not yet linked to a PO (add to forecast as pending cost)
        approved_sc_no_po = sum(
            sc.cost or 0
            for sc in db.query(models.ScopeChange).filter(
                models.ScopeChange.package_id == pkg.id,
                models.ScopeChange.status == "APPROVED",
                models.ScopeChange.order_id == None,
            ).all()
        )

        # Draft + Submitted scope changes (not yet approved — potential future cost)
        pending_sc_cost = sum(
            sc.cost or 0
            for sc in db.query(models.ScopeChange).filter(
                models.ScopeChange.package_id == pkg.id,
                models.ScopeChange.status.in_(["DRAFT", "SUBMITTED"]),
            ).all()
        )

        forecast = forecast_base + approved_sc_no_po

        bid_summary = compute_pkg_bid_summary(proc_entries_by_pkg.get(pkg.id, []))

        result.append({
            "package_id": pkg.id,
            "tag_number": pkg.tag_number,
            "name": pkg.name,
            "package_owner_id": pkg.package_owner_id,
            "currency": currency,
            "baseline": baseline,
            "transfer_net": transfer_net,
            "forecast": forecast,
            "approved_sc_no_po": approved_sc_no_po,
            "committed": committed,
            "spend": spend,
            "remaining": forecast - committed,
            "pending_sc_cost": pending_sc_cost,
            "remaining_incl_pending": forecast - committed - pending_sc_cost,
            "bid_value": bid_summary["display_value"],
            "bid_status": bid_summary["bid_status"],
            "is_awarded": bid_summary["is_awarded"],
            "awarded_company_name": bid_summary["awarded_company_name"],
        })
    return result


# ─── Baselines ────────────────────────────────────────────────────────────────

class BaselineUpdate(BaseModel):
    amount: float
    currency: str = "EUR"


@router.put("/baselines/{package_id}")
def upsert_baseline(
    package_id: int,
    body: BaselineUpdate,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    pkg = db.query(models.Package).filter(
        models.Package.id == package_id,
        models.Package.project_id == user.project_id,
    ).first()
    if not pkg:
        raise HTTPException(404, "Package not found")
    if not _can_edit_package(user, pkg, db):
        raise HTTPException(403, "Not authorized to edit this package budget")

    row = db.query(models.BudgetBaseline).filter_by(package_id=package_id).first()
    if row:
        row.amount = body.amount
        row.currency = body.currency
    else:
        row = models.BudgetBaseline(
            package_id=package_id, amount=body.amount, currency=body.currency
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return {"package_id": row.package_id, "amount": row.amount, "currency": row.currency}


# ─── Orders ───────────────────────────────────────────────────────────────────

class OrderCreate(BaseModel):
    package_id: int
    po_number: str
    description: Optional[str] = None
    vendor_name: Optional[str] = None
    amount: float = 0.0
    currency: str = "EUR"
    order_date: Optional[str] = None
    status: str = "COMMITTED"


class OrderUpdate(BaseModel):
    po_number: Optional[str] = None
    description: Optional[str] = None
    vendor_name: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    order_date: Optional[str] = None
    status: Optional[str] = None
    updated_at: Optional[str] = None


def _fmt_order(o):
    return {
        "id": o.id,
        "package_id": o.package_id,
        "package_tag": o.package.tag_number if o.package else None,
        "package_name": o.package.name if o.package else None,
        "po_number": o.po_number,
        "description": o.description,
        "vendor_name": o.vendor_name,
        "amount": o.amount,
        "currency": o.currency,
        "order_date": o.order_date,
        "status": o.status,
        **audit_dict(o),
    }


@router.get("/orders")
def list_orders(
    package_id: Optional[int] = None,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    pkg_ids = _user_package_ids(user, db)
    q = db.query(models.Order).join(models.Package).filter(
        models.Package.project_id == user.project_id
    )
    if pkg_ids is not None:
        q = q.filter(models.Order.package_id.in_(pkg_ids))
    if package_id:
        q = q.filter(models.Order.package_id == package_id)
    orders = q.order_by(models.Order.created_at.desc()).all()
    return [_fmt_order(o) for o in orders]


@router.post("/orders")
def create_order(
    body: OrderCreate,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    pkg = db.query(models.Package).filter(
        models.Package.id == body.package_id,
        models.Package.project_id == user.project_id,
    ).first()
    if not pkg:
        raise HTTPException(404, "Package not found")
    if not _can_edit_package(user, pkg, db):
        raise HTTPException(403, "Not authorized to create orders for this package")
    order = models.Order(**body.model_dump())
    set_created(order, user.id)
    db.add(order)
    db.commit()
    db.refresh(order)
    order = db.query(models.Order).filter_by(id=order.id).first()
    return _fmt_order(order)


@router.put("/orders/{order_id}")
def update_order(
    order_id: int,
    body: OrderUpdate,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    order = db.query(models.Order).filter_by(id=order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    pkg = db.query(models.Package).filter(
        models.Package.id == order.package_id,
        models.Package.project_id == user.project_id,
    ).first()
    if not pkg or not _can_edit_package(user, pkg, db):
        raise HTTPException(403, "Not authorized")
    check_lock(order.updated_at, body.updated_at, "order")
    for field, val in body.model_dump(exclude_unset=True, exclude={"updated_at"}).items():
        setattr(order, field, val)
    set_updated(order, user.id)
    db.commit()
    return _fmt_order(order)


@router.delete("/orders/{order_id}")
def delete_order(
    order_id: int,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    order = db.query(models.Order).filter_by(id=order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    pkg = db.query(models.Package).filter(
        models.Package.id == order.package_id,
        models.Package.project_id == user.project_id,
    ).first()
    if not pkg or not _can_edit_package(user, pkg, db):
        raise HTTPException(403, "Not authorized")
    db.delete(order)
    db.commit()
    return {"ok": True}


# ─── Transfers ────────────────────────────────────────────────────────────────

class TransferCreate(BaseModel):
    type: str = "TRANSFER"
    from_package_id: Optional[int] = None
    to_package_id: int
    amount: float
    currency: str = "EUR"
    description: Optional[str] = None
    transfer_date: Optional[str] = None


def _fmt_transfer(t):
    return {
        "id": t.id,
        "type": t.type,
        "from_package_id": t.from_package_id,
        "from_package_tag": t.from_package.tag_number if t.from_package else None,
        "to_package_id": t.to_package_id,
        "to_package_tag": t.to_package.tag_number if t.to_package else None,
        "amount": t.amount,
        "currency": t.currency,
        "description": t.description,
        "transfer_date": t.transfer_date,
        "created_at": t.created_at.isoformat() + 'Z' if t.created_at else None,
    }


@router.get("/transfers")
def list_transfers(
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    pkg_ids = _user_package_ids(user, db)
    # Get all project package IDs for scoping
    project_pkg_ids = [
        r[0] for r in db.query(models.Package.id).filter(
            models.Package.project_id == user.project_id
        ).all()
    ]
    transfers = db.query(models.BudgetTransfer).filter(
        (models.BudgetTransfer.to_package_id.in_(project_pkg_ids)) |
        (models.BudgetTransfer.from_package_id.in_(project_pkg_ids))
    ).order_by(models.BudgetTransfer.created_at.desc()).all()

    result = []
    for t in transfers:
        if pkg_ids is not None:
            visible_ids = set(pkg_ids)
            if t.to_package_id not in visible_ids and (
                t.from_package_id is None or t.from_package_id not in visible_ids
            ):
                continue
        result.append(_fmt_transfer(t))
    return result


@router.post("/transfers")
def create_transfer(
    body: TransferCreate,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    if not auth.has_owner_or_lead_access(user, "Budget", db):
        if user.role == "PROJECT_TEAM":
            pkg = db.query(models.Package).filter(
                models.Package.id == body.to_package_id,
                models.Package.project_id == user.project_id,
            ).first()
            if not _can_edit_package(user, pkg, db):
                raise HTTPException(403, "Not authorized")
        else:
            raise HTTPException(403, "Not authorized to create budget transfers")
    if body.type == "TRANSFER" and not body.from_package_id:
        raise HTTPException(400, "from_package_id required for TRANSFER type")
    transfer = models.BudgetTransfer(**body.model_dump())
    db.add(transfer)
    db.commit()
    db.refresh(transfer)
    transfer = db.query(models.BudgetTransfer).filter_by(id=transfer.id).first()
    return _fmt_transfer(transfer)


@router.delete("/transfers/{transfer_id}")
def delete_transfer(
    transfer_id: int,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    transfer = db.query(models.BudgetTransfer).filter_by(id=transfer_id).first()
    if not transfer:
        raise HTTPException(404, "Transfer not found")
    if not auth.has_owner_or_lead_access(user, "Budget", db):
        raise HTTPException(403, "Only Project Owners can delete transfers")
    db.delete(transfer)
    db.commit()
    return {"ok": True}


# ─── Invoices ─────────────────────────────────────────────────────────────────

class InvoiceCreate(BaseModel):
    order_id: int
    invoice_number: str
    description: Optional[str] = None
    amount: float = 0.0
    currency: str = "EUR"
    invoice_date: str


class InvoiceUpdate(BaseModel):
    invoice_number: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    invoice_date: Optional[str] = None
    status: Optional[str] = None
    updated_at: Optional[str] = None


def _fmt_invoice(inv):
    pkg = inv.package
    pmc_c = pkg.pmc_commercial_reviewer if pkg else None
    cli_c = pkg.client_commercial_reviewer if pkg else None
    return {
        "id": inv.id,
        "order_id": inv.order_id,
        "po_number": inv.order.po_number if inv.order else None,
        "package_id": inv.package_id,
        "package_tag": pkg.tag_number if pkg else None,
        "package_name": pkg.name if pkg else None,
        # New naming aligned with scope changes (pmc_reviewer_*, client_reviewer_*)
        "pmc_reviewer_contact_id": pkg.pmc_commercial_reviewer_id if pkg else None,
        "pmc_reviewer_name": pmc_c.name if pmc_c else None,
        "client_reviewer_contact_id": pkg.client_commercial_reviewer_id if pkg else None,
        "client_reviewer_name": cli_c.name if cli_c else None,
        # Legacy keys kept for any older UI/import code still referencing them.
        "pmc_commercial_reviewer_id": pkg.pmc_commercial_reviewer_id if pkg else None,
        "pmc_commercial_reviewer_name": pmc_c.name if pmc_c else None,
        "client_commercial_reviewer_id": pkg.client_commercial_reviewer_id if pkg else None,
        "client_commercial_reviewer_name": cli_c.name if cli_c else None,
        "invoice_number": inv.invoice_number,
        "description": inv.description,
        "amount": inv.amount,
        "currency": inv.currency,
        "invoice_date": inv.invoice_date,
        "status": inv.status,
        "pmc_reviewed": bool(inv.pmc_reviewed),
        "pmc_approved": inv.pmc_approved,
        "pmc_comment": inv.pmc_comment,
        "pmc_reviewed_at": inv.pmc_reviewed_at.isoformat() + 'Z' if inv.pmc_reviewed_at else None,
        "client_reviewed": bool(inv.client_reviewed),
        "client_approved": inv.client_approved,
        "client_comment": inv.client_comment,
        "client_reviewed_at": inv.client_reviewed_at.isoformat() + 'Z' if inv.client_reviewed_at else None,
        "submitted_at": inv.submitted_at.isoformat() + 'Z' if inv.submitted_at else None,
        "created_by_id": inv.created_by_id,
        "created_by_name": inv.created_by.name if getattr(inv, "created_by", None) else None,
        "review_comment": inv.review_comment,
        **audit_dict(inv),
    }


def _user_can_resubmit_invoice(inv: models.Invoice, user, db: Session) -> bool:
    """Creator, ADMIN/PROJECT_OWNER, or any contact linked to the invoice's
    package (package owner, account manager, or PackageContact member)."""
    if auth.has_owner_or_lead_access(user, "Budget", db):
        return True
    if inv.created_by_id == user.id:
        return True
    if not user.contact_id or not inv.package_id:
        return False
    pkg = inv.package
    if pkg and (pkg.package_owner_id == user.contact_id or pkg.account_manager_id == user.contact_id):
        return True
    linked = db.query(models.PackageContact).filter_by(
        package_id=inv.package_id, contact_id=user.contact_id
    ).first()
    return linked is not None


def _has_rejection_inv(inv: models.Invoice) -> bool:
    """True if any reviewer has already rejected — even if the invoice is
    still PENDING waiting for the other side. Such an invoice is effectively
    doomed, so the creator/package contact can edit & resubmit immediately."""
    return (inv.pmc_reviewed and inv.pmc_approved is False) or \
           (inv.client_reviewed and inv.client_approved is False)


def _can_edit_or_resubmit_inv(inv: models.Invoice) -> bool:
    return inv.status in ("DRAFT", "REJECTED") or (inv.status == "PENDING" and _has_rejection_inv(inv))


def _is_pmc_reviewer_inv(inv: models.Invoice, user) -> bool:
    if not user.contact_id or not inv.package:
        return False
    return inv.package.pmc_commercial_reviewer_id == user.contact_id


def _is_client_reviewer_inv(inv: models.Invoice, user) -> bool:
    if not user.contact_id or not inv.package:
        return False
    return inv.package.client_commercial_reviewer_id == user.contact_id


def _log_invoice_review(db: Session, inv: models.Invoice, event: str, user, approved=None, comment=None):
    db.add(models.InvoiceReview(
        invoice_id=inv.id,
        event=event,
        approved=approved,
        comment=comment,
        actor_id=user.id if user else None,
    ))


def _update_invoice_status(inv: models.Invoice):
    """Keep the invoice in review until BOTH sides have reviewed (missing
    reviewers are auto-approved at submit time). Either reviewer can still
    submit their decision even after the other has rejected."""
    if not (inv.pmc_reviewed and inv.client_reviewed):
        return
    if inv.pmc_approved is False or inv.client_approved is False:
        inv.status = "REJECTED"
    else:
        inv.status = "APPROVED"


@router.get("/invoices")
def list_invoices(
    package_id: Optional[int] = None,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    pkg_ids = _user_package_ids(user, db)
    q = db.query(models.Invoice).join(models.Package).filter(
        models.Package.project_id == user.project_id
    )
    if pkg_ids is not None:
        q = q.filter(models.Invoice.package_id.in_(pkg_ids))
    if package_id:
        q = q.filter(models.Invoice.package_id == package_id)
    invoices = q.order_by(models.Invoice.created_at.desc()).all()
    return [_fmt_invoice(inv) for inv in invoices]


@router.post("/invoices")
def create_invoice(
    body: InvoiceCreate,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    order = db.query(models.Order).filter_by(id=body.order_id).first()
    if not order:
        raise HTTPException(404, "Order not found")
    # Ensure order belongs to this project
    pkg = db.query(models.Package).filter(
        models.Package.id == order.package_id,
        models.Package.project_id == user.project_id,
    ).first()
    if not pkg:
        raise HTTPException(404, "Order not found in this project")
    if not _can_submit_invoice(user, order.package_id, db):
        raise HTTPException(403, "Not authorized to submit invoices for this package")
    # Check that total invoiced amount does not exceed order value
    existing_total = db.query(models.Invoice).filter(
        models.Invoice.order_id == body.order_id,
        models.Invoice.status.notin_(["CANCELLED", "REJECTED", "DRAFT"]),
    ).with_entities(models.Invoice.amount).all()
    invoiced_so_far = sum(r[0] or 0 for r in existing_total)
    if invoiced_so_far + body.amount > order.amount:
        remaining = order.amount - invoiced_so_far
        raise HTTPException(
            400,
            f"Invoice amount exceeds order value. "
            f"Order value: {order.amount:,.2f} {order.currency}, "
            f"Already invoiced: {invoiced_so_far:,.2f}, "
            f"Remaining: {remaining:,.2f}"
        )
    inv = models.Invoice(
        order_id=body.order_id,
        package_id=order.package_id,
        invoice_number=body.invoice_number,
        description=body.description,
        amount=body.amount,
        currency=body.currency,
        invoice_date=body.invoice_date,
        status="DRAFT",
        created_by_id=user.id,
    )
    set_created(inv, user.id)
    db.add(inv)
    db.commit()
    db.refresh(inv)
    inv = db.query(models.Invoice).filter_by(id=inv.id).first()
    return _fmt_invoice(inv)


class ReviewBody(BaseModel):
    approved: bool
    comment: str


@router.post("/invoices/{invoice_id}/submit")
def submit_invoice(
    invoice_id: int,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    """Move an invoice into review. Works for both initial submissions (DRAFT)
    and resubmissions after rejection (REJECTED)."""
    inv = db.query(models.Invoice).filter_by(id=invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if not _user_can_resubmit_invoice(inv, user, db):
        raise HTTPException(403, "Not authorized")
    if not _can_edit_or_resubmit_inv(inv):
        raise HTTPException(400, "Can only submit DRAFT, REJECTED, or already-rejected-by-one-reviewer invoices")
    inv.status = "PENDING"
    inv.submitted_at = datetime.utcnow()
    inv.pmc_reviewed = False
    inv.pmc_approved = None
    inv.pmc_comment = None
    inv.pmc_reviewed_at = None
    inv.client_reviewed = False
    inv.client_approved = None
    inv.client_comment = None
    inv.client_reviewed_at = None
    inv.review_comment = None
    _log_invoice_review(db, inv, "SUBMIT", user)
    # Auto-approve sides with no reviewer defined on the package.
    now = datetime.utcnow()
    pkg = inv.package
    if pkg and not pkg.pmc_commercial_reviewer_id:
        inv.pmc_reviewed = True
        inv.pmc_approved = True
        inv.pmc_comment = "No reviewer assigned"
        inv.pmc_reviewed_at = now
    if pkg and not pkg.client_commercial_reviewer_id:
        inv.client_reviewed = True
        inv.client_approved = True
        inv.client_comment = "No reviewer assigned"
        inv.client_reviewed_at = now
    _update_invoice_status(inv)
    set_updated(inv, user.id)
    db.commit()
    return _fmt_invoice(inv)


@router.get("/invoices/pending-review")
def get_pending_invoice_reviews(
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    if not user.contact_id:
        return []
    invoices = db.query(models.Invoice).join(models.Package).filter(
        models.Package.project_id == user.project_id,
        models.Invoice.status == "PENDING",
    ).all()
    result = []
    for inv in invoices:
        if _is_pmc_reviewer_inv(inv, user) and not inv.pmc_reviewed:
            result.append({**_fmt_invoice(inv), "my_role": "PMC Commercial", "reviewer_role": "PMC_COMMERCIAL"})
        elif _is_client_reviewer_inv(inv, user) and not inv.client_reviewed:
            result.append({**_fmt_invoice(inv), "my_role": "Client Commercial", "reviewer_role": "CLIENT_COMMERCIAL"})
    return result


@router.get("/invoices/{invoice_id}/history")
def get_invoice_history(
    invoice_id: int,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    inv = db.query(models.Invoice).join(models.Package).filter(
        models.Invoice.id == invoice_id,
        models.Package.project_id == user.project_id,
    ).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    rows = db.query(models.InvoiceReview).filter_by(
        invoice_id=invoice_id
    ).order_by(models.InvoiceReview.created_at.asc()).all()
    return [
        {
            "id": r.id,
            "event": r.event,
            "approved": r.approved,
            "comment": r.comment,
            "actor_id": r.actor_id,
            "actor_name": r.actor.name if r.actor else None,
            "created_at": r.created_at.isoformat() + 'Z' if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/invoices/{invoice_id}/pmc-review")
def invoice_pmc_review(
    invoice_id: int,
    body: ReviewBody,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    inv = db.query(models.Invoice).filter_by(id=invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.status != "PENDING":
        raise HTTPException(400, "Invoice is not under review")
    if not _is_pmc_reviewer_inv(inv, user):
        raise HTTPException(403, "You are not the PMC Commercial reviewer for this package")
    if not body.comment or not body.comment.strip():
        raise HTTPException(400, "Comment is required")
    inv.pmc_reviewed = True
    inv.pmc_approved = body.approved
    inv.pmc_comment = body.comment
    inv.pmc_reviewed_at = datetime.utcnow()
    _log_invoice_review(db, inv, "PMC", user, approved=body.approved, comment=body.comment)
    _update_invoice_status(inv)
    db.commit()
    return _fmt_invoice(inv)


@router.post("/invoices/{invoice_id}/client-review")
def invoice_client_review(
    invoice_id: int,
    body: ReviewBody,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    inv = db.query(models.Invoice).filter_by(id=invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if inv.status != "PENDING":
        raise HTTPException(400, "Invoice is not under review")
    if not _is_client_reviewer_inv(inv, user):
        raise HTTPException(403, "You are not the Client Commercial reviewer for this package")
    if not body.comment or not body.comment.strip():
        raise HTTPException(400, "Comment is required")
    inv.client_reviewed = True
    inv.client_approved = body.approved
    inv.client_comment = body.comment
    inv.client_reviewed_at = datetime.utcnow()
    _log_invoice_review(db, inv, "CLIENT", user, approved=body.approved, comment=body.comment)
    _update_invoice_status(inv)
    db.commit()
    return _fmt_invoice(inv)


@router.post("/invoices/{invoice_id}/override")
def override_invoice(
    invoice_id: int,
    body: ReviewBody,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    inv = db.query(models.Invoice).filter_by(id=invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    pkg = db.query(models.Package).filter_by(id=inv.package_id).first() if inv.package_id else None
    gate = auth.package_access_path(user, "Budget", pkg, db)
    if not gate:
        raise HTTPException(403, "Only Admins, Project Owners, Module Leads or the Package Owner can override")
    if inv.status != "PENDING":
        raise HTTPException(400, "Can only override PENDING invoices")
    comment = (body.comment or "").strip() or auth.override_default_comment(user.name, gate)
    now = datetime.utcnow()
    inv.pmc_reviewed = True
    inv.pmc_approved = body.approved
    inv.pmc_comment = comment
    inv.pmc_reviewed_at = now
    inv.client_reviewed = True
    inv.client_approved = body.approved
    inv.client_comment = comment
    inv.client_reviewed_at = now
    inv.status = "APPROVED" if body.approved else "REJECTED"
    _log_invoice_review(db, inv, "OVERRIDE", user, approved=body.approved, comment=comment)
    db.commit()
    return _fmt_invoice(inv)


@router.get("/invoices/my-rejected")
def get_my_rejected_invoices(
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    """Rejected invoices the user can resubmit — created by them or linked
    to the invoice's package as owner / account manager / package contact."""
    invoices = db.query(models.Invoice).join(models.Package).filter(
        models.Package.project_id == user.project_id,
        models.Invoice.status == "REJECTED",
    ).order_by(models.Invoice.created_at.desc()).all()
    return [_fmt_invoice(inv) for inv in invoices if _user_can_resubmit_invoice(inv, user, db)]


@router.post("/invoices/{invoice_id}/reopen")
def reopen_invoice(
    invoice_id: int,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    inv = db.query(models.Invoice).filter_by(id=invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if not _user_can_resubmit_invoice(inv, user, db):
        raise HTTPException(403, "Not authorized")
    if inv.status != "CANCELLED":
        raise HTTPException(400, "Only cancelled invoices can be re-opened")
    inv.status = "DRAFT"
    db.commit()
    return _fmt_invoice(inv)


@router.post("/invoices/{invoice_id}/cancel")
def cancel_invoice(
    invoice_id: int,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    inv = db.query(models.Invoice).filter_by(id=invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if user.id != inv.created_by_id and not auth.has_owner_or_lead_access(user, "Budget", db):
        raise HTTPException(403, "Not authorized")
    inv.status = "CANCELLED"
    db.commit()
    return _fmt_invoice(inv)


@router.put("/invoices/{invoice_id}")
def update_invoice(
    invoice_id: int,
    body: InvoiceUpdate,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    inv = db.query(models.Invoice).filter_by(id=invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")

    updates = body.model_dump(exclude_unset=True, exclude={"updated_at"})

    if auth.has_owner_or_lead_access(user, "Budget", db):
        pass
    elif user.role == "PROJECT_TEAM":
        pkg = db.query(models.Package).filter_by(id=inv.package_id).first()
        if not _can_edit_package(user, pkg, db):
            raise HTTPException(403, "Not authorized")
    elif user.role == "VENDOR":
        if not _can_submit_invoice(user, inv.package_id, db):
            raise HTTPException(403, "Not authorized")
        if "status" in updates:
            raise HTTPException(403, "Vendors cannot change invoice status")
    else:
        raise HTTPException(403, "Not authorized")

    check_lock(inv.updated_at, body.updated_at, "invoice")
    # If amount is being changed, validate against order value
    if "amount" in updates:
        order = db.query(models.Order).filter_by(id=inv.order_id).first()
        if order:
            existing_total = db.query(models.Invoice).filter(
                models.Invoice.order_id == inv.order_id,
                models.Invoice.id != invoice_id,
                models.Invoice.status.notin_(["CANCELLED", "REJECTED", "DRAFT"]),
            ).with_entities(models.Invoice.amount).all()
            invoiced_so_far = sum(r[0] or 0 for r in existing_total)
            if invoiced_so_far + updates["amount"] > order.amount:
                remaining = order.amount - invoiced_so_far
                raise HTTPException(
                    400,
                    f"Invoice amount exceeds order value. "
                    f"Order value: {order.amount:,.2f} {order.currency}, "
                    f"Other invoices: {invoiced_so_far:,.2f}, "
                    f"Remaining: {remaining:,.2f}"
                )
    for field, val in updates.items():
        setattr(inv, field, val)
    set_updated(inv, user.id)
    db.commit()
    return _fmt_invoice(inv)


@router.delete("/invoices/{invoice_id}")
def delete_invoice(
    invoice_id: int,
    user: auth.ProjectContext = Depends(auth.get_project_user),
    db: Session = Depends(get_db),
):
    inv = db.query(models.Invoice).filter_by(id=invoice_id).first()
    if not inv:
        raise HTTPException(404, "Invoice not found")
    if auth.has_owner_or_lead_access(user, "Budget", db):
        pass  # admins and project owners can always delete
    elif inv.status in ("PENDING", "APPROVED"):
        raise HTTPException(403, "Only ADMIN or PROJECT_OWNER can delete submitted or approved invoices")
    else:
        pkg = db.query(models.Package).filter_by(id=inv.package_id).first()
        if not _can_edit_package(user, pkg, db):
            raise HTTPException(403, "Not authorized")
    db.delete(inv)
    db.commit()
    return {"ok": True}
