"""Comprehensive demo-project seed for IPS ImPulse Suite.

Creates ONE full project named DEMO-FULL-2026 with thousands of records
across every module so dashboards and workflows have data to demonstrate.

Run from the project root (or via the in-app "Seed Full Demo" admin button):
    python "_Supporting files/seed_full_demo.py"

Idempotent: aborts cleanly if DEMO-FULL-2026 already exists.
"""

import os
import sys
import random
from datetime import datetime, date, timedelta

# Allow running from inside _Supporting files/ folder
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models  # noqa: E402
import database  # noqa: E402
import auth as auth_mod  # noqa: E402
import seed_data  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

DEMO_NUMBER = "DEMO-FULL-2026"
DEMO_PASSWORD = "demo123"
TODAY = date.today()


def _today() -> str:
    return TODAY.isoformat()


def _days(n: int) -> str:
    return (TODAY + timedelta(days=n)).isoformat()


def _ensure_user(db: Session, email: str, name: str, role: str = "PROJECT_TEAM"):
    u = db.query(models.User).filter(models.User.email == email).first()
    if u:
        return u
    u = models.User(
        name=name, email=email,
        password_hash=auth_mod.hash_password(DEMO_PASSWORD),
        role=role if role == "ADMIN" else "PROJECT_TEAM",
    )
    db.add(u); db.flush()
    return u


def _ensure_contact(db: Session, project_id: int, name: str, email: str,
                    company: str = "", function: str = "", phone: str = ""):
    c = db.query(models.Contact).filter(
        models.Contact.project_id == project_id,
        models.Contact.email == email,
    ).first()
    if c:
        return c
    c = models.Contact(
        project_id=project_id, name=name, email=email,
        company=company or None, function=function or None, phone=phone or None,
    )
    db.add(c); db.flush()
    return c


def _link_user_to_contact(db: Session, user, contact):
    if user.contact_id != contact.id:
        user.contact_id = contact.id
    db.flush()


def _assign_user_to_project(db: Session, user, project_id: int, role: str):
    up = db.query(models.UserProject).filter_by(user_id=user.id, project_id=project_id).first()
    if up:
        up.role = role
        return up
    up = models.UserProject(user_id=user.id, project_id=project_id, role=role)
    db.add(up); db.flush()
    return up


# ── Stage 1: project + people ────────────────────────────────────────────────

def stage_project_and_people(db: Session):
    existing = db.query(models.Project).filter_by(project_number=DEMO_NUMBER).first()
    if existing:
        print(f"[demo] Project {DEMO_NUMBER} already exists (id={existing.id}); aborting.")
        return None

    admin = db.query(models.User).filter_by(role="ADMIN").first()
    actor_id = admin.id if admin else None

    proj = models.Project(
        project_number=DEMO_NUMBER,
        description="Full demonstration project — all modules, all flows",
        client="ACME Energy NV",
        client_reference="ACME-2026-001",
        general_description="Greenfield substation upgrade — comprehensive demo data.",
        start_date=_days(-180),
        end_date=_days(540),
        status="ACTIVE",
        location="Antwerp, Belgium",
        created_by_id=actor_id,
    )
    db.add(proj); db.flush()

    seed_data.seed_subservices_for_project(proj.id, db)
    seed_data.seed_risk_data_for_project(proj.id, db)
    seed_data.seed_settings_for_project(proj.id, db)
    seed_data.seed_procurement_for_project(proj.id, db)
    seed_data.seed_qc_defaults_for_project(proj.id, db)
    seed_data.seed_construction_defaults_for_project(proj.id, db)
    seed_data.seed_safety_setup_defaults_for_project(proj.id, db)
    db.flush()

    people_spec = [
        ("po",       "Pieter Owens",      "po@demo.ips",        "PROJECT_OWNER", "Group-IPS",     "Project Owner"),
        ("pmc_tech1","Tina Tech",         "tina@demo.ips",      "PROJECT_TEAM",  "Group-IPS",     "Lead Engineer"),
        ("pmc_tech2","Tom Engineer",      "tom@demo.ips",       "PROJECT_TEAM",  "Group-IPS",     "QA/QC Manager"),
        ("pmc_comm1","Charlotte Cost",    "charlotte@demo.ips", "PROJECT_TEAM",  "Group-IPS",     "Cost Controller"),
        ("pmc_comm2","Carl Contracts",    "carl@demo.ips",      "PROJECT_TEAM",  "Group-IPS",     "Contracts Manager"),
        ("pmc_qa",   "Quincy QA",         "quincy@demo.ips",    "PROJECT_TEAM",  "Group-IPS",     "Construction Manager"),
        ("cli_t",    "Claire Client",     "claire@acme.com",    "CLIENT",        "ACME Energy NV","Client Tech Lead"),
        ("cli_c",    "Christophe Coin",   "christophe@acme.com","CLIENT",        "ACME Energy NV","Client Cost Manager"),
        ("cli_m",    "Charles Mgr",       "charles@acme.com",   "CLIENT",        "ACME Energy NV","Client Project Manager"),
        ("vendor1",  "Vivian Vendor",     "vivian@altaport.eu", "VENDOR",        "AltaPort Construction","Site Manager"),
        ("vendor2",  "Victor Verde",      "victor@verdetech.eu","VENDOR",        "Verde Tech Solutions","Project Engineer"),
        ("vendor3",  "Vera Voltage",      "vera@voltrix.eu",    "VENDOR",        "Voltrix Power", "Operations Lead"),
        ("vendor4",  "Vince Verge",       "vince@verge-mech.eu","VENDOR",        "Verge Mechanical","Foreman"),
        ("vendor5",  "Veronica Vault",    "veronica@vault-civ.eu","VENDOR",      "Vault Civil Works","Project Lead"),
        ("sup1",     "Sandra Supervise",  "sandra@demo.ips",    "PROJECT_TEAM",  "Group-IPS",     "Site Supervisor — North"),
        ("sup2",     "Stefan Watch",      "stefan@demo.ips",    "PROJECT_TEAM",  "Group-IPS",     "Site Supervisor — South"),
        ("bidder1",  "Brian Bid",         "brian@bidcorp.eu",   "BIDDER",        "BidCorp",       "Tendering Manager"),
        ("bidder2",  "Bea Tender",        "bea@tendrx.eu",      "BIDDER",        "Tendrx",        "Lead Estimator"),
    ]
    users, contacts = {}, {}
    for handle, name, email, role, company, function in people_spec:
        u = _ensure_user(db, email, name, role)
        c = _ensure_contact(db, proj.id, name, email, company=company, function=function)
        _link_user_to_contact(db, u, c)
        _assign_user_to_project(db, u, proj.id, role)
        users[handle] = u
        contacts[handle] = c
    db.commit()

    return {"project": proj, "users": users, "contacts": contacts, "actor_id": actor_id}


# ── Stage 2: areas, units, packages ──────────────────────────────────────────

def stage_areas_units_packages(db: Session, ctx: dict):
    proj = ctx["project"]
    contacts = ctx["contacts"]

    areas_spec = [
        ("HV-YARD",  "High-Voltage Yard",  [contacts["sup1"]]),
        ("CONTROL",  "Control Building",   [contacts["sup2"]]),
        ("CIVIL-N",  "Civil Works North",  [contacts["sup1"]]),
        ("CIVIL-S",  "Civil Works South",  [contacts["sup2"]]),
    ]
    areas = {}
    for code, desc, supervisors in areas_spec:
        a = models.Area(project_id=proj.id, tag=code, description=desc)
        db.add(a); db.flush()
        for s in supervisors:
            db.add(models.AreaSiteSupervisor(area_id=a.id, contact_id=s.id))
        areas[code] = a

    # Units (project-scoped — Unit has no area_id FK; we keep a logical mapping
    # for downstream stages that need an area to go with a unit.)
    units_spec = [
        ("HV-101",  "Main Transformer #1",  areas["HV-YARD"]),
        ("HV-102",  "Switchyard Bay A",     areas["HV-YARD"]),
        ("HV-103",  "Switchyard Bay B",     areas["HV-YARD"]),
        ("CTRL-201","Control Room",         areas["CONTROL"]),
        ("CTRL-202","Battery Room",         areas["CONTROL"]),
        ("CIV-301", "Foundations North",    areas["CIVIL-N"]),
        ("CIV-401", "Cable Trenches South", areas["CIVIL-S"]),
    ]
    units, unit_area = {}, {}
    for code, desc, area in units_spec:
        u = models.Unit(project_id=proj.id, tag=code, description=desc)
        db.add(u); db.flush()
        units[code] = u
        unit_area[code] = area
    db.flush()

    # Wire a couple of subservices to PMC + Client reviewers (subservice
    # reviewers are document-only; informational here)
    subservices = db.query(models.Subservice).filter_by(project_id=proj.id).all()
    for ss in subservices[:3]:
        ss.pmc_reviewer_id = contacts["pmc_tech1"].id
        ss.client_reviewer_id = contacts["cli_t"].id
    db.flush()

    packages_spec = [
        ("HV-A",  "HV Switchgear A",       "po", "pmc_tech1", "pmc_tech1", "pmc_comm1", "cli_t", "cli_c", ["pmc_qa","sup1","vendor1"], "vendor1"),
        ("HV-B",  "HV Switchgear B",       "po", "pmc_tech2", "pmc_tech2", "pmc_comm1", "cli_t", "cli_c", ["pmc_qa","sup1","vendor3"], "vendor3"),
        ("CTRL",  "Control & Protection",  "po", "pmc_tech1", "pmc_tech1", "pmc_comm2", "cli_t", "cli_c", ["pmc_qa","sup2","vendor2"], "vendor2"),
        ("CIV",   "Civil Works",           "po", "pmc_qa",    "pmc_tech2", "pmc_comm2", "cli_t", "cli_c", ["sup1","sup2","vendor5"],   "vendor5"),
        ("MECH",  "Mechanical Auxiliaries","po", "pmc_tech2", "pmc_tech2", "pmc_comm1", "cli_t", "cli_c", ["pmc_qa","sup2","vendor4"], "vendor4"),
    ]
    packages = {}
    for tag, name, po_h, am_h, pt, pc, ct, cc, contact_hs, vendor_h in packages_spec:
        pkg = models.Package(
            project_id=proj.id, tag_number=tag, name=name,
            company=contacts[vendor_h].company,
            package_owner_id=contacts[po_h].id,
            account_manager_id=contacts[am_h].id,
            pmc_technical_reviewer_id=contacts[pt].id,
            pmc_commercial_reviewer_id=contacts[pc].id,
            client_technical_reviewer_id=contacts[ct].id,
            client_commercial_reviewer_id=contacts[cc].id,
        )
        db.add(pkg); db.flush()
        for h in contact_hs:
            db.add(models.PackageContact(package_id=pkg.id, contact_id=contacts[h].id))
        packages[tag] = pkg
    db.commit()

    ctx["areas"] = areas
    ctx["units"] = units
    ctx["unit_area"] = unit_area
    ctx["packages"] = packages
    # Pre-determine which packages will be AWARDED in procurement so other
    # stages (budget orders/invoices) can stay consistent: a package without
    # an awarded vendor should NOT have any PO or invoice yet.
    # The procurement stage iterates packages.keys() with index k and awards
    # k%2==0 → keep this rule in one place.
    ctx["awarded_tags"] = [tag for k, tag in enumerate(packages.keys()) if k % 2 == 0]
    return ctx


# ── Stage 3: budget — baselines, transfers, orders, invoices ────────────────

def stage_budget(db: Session, ctx: dict):
    packages = ctx["packages"]
    actor_id = ctx["actor_id"]
    rng = random.Random(42)

    # Baselines — one per package (BudgetBaseline has only package_id/amount/currency)
    baseline_amounts = {"HV-A":1_800_000, "HV-B":1_500_000, "CTRL":900_000, "CIV":2_400_000, "MECH":1_100_000}
    for tag, amt in baseline_amounts.items():
        db.add(models.BudgetBaseline(package_id=packages[tag].id, amount=amt, currency="EUR"))

    # 12 transfers — BudgetTransfer.type, no project_id
    base_transfers = [
        ("CIV", "HV-A", "TRANSFER", 120_000),
        ("HV-B","CTRL", "TRANSFER", 60_000),
        ("MECH","CIV",  "TRANSFER", 80_000),
        (None,  "CTRL", "INJECTION", 80_000),
        (None,  "HV-A", "INJECTION", 150_000),
        (None,  "MECH", "INJECTION", 40_000),
        (None,  "MECH", "RISK_INTEGRATION", 30_000),
        (None,  "CIV",  "RISK_INTEGRATION", 50_000),
        (None,  "HV-B", "RISK_INTEGRATION", 25_000),
        ("CIV", "HV-B", "TRANSFER", 90_000),
        (None,  "CTRL", "INJECTION", 35_000),
        ("HV-A","MECH", "TRANSFER", 45_000),
    ]
    for i, (from_tag, to_tag, t_type, amt) in enumerate(base_transfers):
        db.add(models.BudgetTransfer(
            type=t_type,
            from_package_id=packages[from_tag].id if from_tag else None,
            to_package_id=packages[to_tag].id,
            amount=amt + rng.randint(-5000, 5000),
            currency="EUR",
            description=f"{t_type.title().replace('_',' ')} #{i+1}",
            transfer_date=_days(-150 + i * 10),
        ))

    # Orders only on AWARDED packages — non-awarded packages are still in
    # procurement and shouldn't have POs/invoices yet.
    awarded_tags = ctx.get("awarded_tags", list(packages.keys()))
    order_descriptions = [
        "Switchgear delivery", "Cabling materials", "Protection panels",
        "Civil works phase", "Mechanical fittings", "Site supervision",
        "Engineering services", "Testing equipment", "Installation labour",
        "Spare parts package", "Commissioning",
    ]
    order_statuses = ["COMMITTED"] * 7 + ["DRAFT"] * 2 + ["CANCELLED"] * 1
    orders = {}
    seq = 1
    # 5 orders per awarded package (15 total for 3 awarded packages)
    for tag in awarded_tags:
        for j in range(5):
            po_no = f"PO-2026-{seq:03d}"
            o = models.Order(
                package_id=packages[tag].id,
                po_number=po_no,
                description=f"{rng.choice(order_descriptions)} ({tag} #{j+1})",
                vendor_name=packages[tag].company,
                amount=rng.choice([150_000, 250_000, 320_000, 450_000, 600_000, 900_000, 1_200_000]),
                currency="EUR",
                status=rng.choice(order_statuses),
                order_date=_days(-200 + seq * 8),
                created_by_id=actor_id,
            )
            db.add(o); db.flush()
            orders[po_no] = o
            seq += 1

    # Invoices spread across the project window (Oct 2025 → Apr 2026 ≈ -210 to 0 days).
    # 28 invoices — only against committed orders on awarded packages.
    committed_orders = [o for o in orders.values() if o.status == "COMMITTED"]
    inv_statuses = ["APPROVED"] * 14 + ["PENDING"] * 8 + ["REJECTED"] * 4 + ["DRAFT"] * 2
    rng.shuffle(inv_statuses)
    if committed_orders:
        for i in range(28):
            o = rng.choice(committed_orders)
            status = inv_statuses[i]
            inv_no = f"INV-{i+1:03d}"
            # Span -205 → -7 days = 7-day cadence × 28 ≈ Oct '25 - late Apr '26
            invoice_offset = -205 + i * 7
            inv = models.Invoice(
                order_id=o.id, package_id=o.package_id,
                invoice_number=inv_no,
                description=f"Invoice {inv_no} for {o.po_number}",
                amount=rng.choice([50_000, 100_000, 200_000, 300_000, 450_000, 600_000]),
                currency="EUR",
                invoice_date=_days(invoice_offset),
                status=status,
                created_by_id=actor_id,
            )
            if status == "APPROVED":
                inv.pmc_reviewed = True; inv.pmc_approved = True; inv.pmc_comment = "Approved"
                inv.client_reviewed = True; inv.client_approved = True; inv.client_comment = "Approved"
                inv.pmc_reviewed_at = datetime.utcnow(); inv.client_reviewed_at = datetime.utcnow()
            elif status == "REJECTED":
                inv.pmc_reviewed = True; inv.pmc_approved = False
                inv.pmc_comment = rng.choice(["Quantity discrepancy", "Missing supporting docs", "Wrong VAT rate"])
                inv.pmc_reviewed_at = datetime.utcnow()
            elif status == "PENDING" and i % 2 == 0:
                inv.pmc_reviewed = True; inv.pmc_approved = True; inv.pmc_comment = "OK from PMC side"
                inv.pmc_reviewed_at = datetime.utcnow()
            db.add(inv)
    db.commit()


# ── Stage 4: risks ───────────────────────────────────────────────────────────

def stage_risks(db: Session, ctx: dict):
    proj = ctx["project"]
    contacts = ctx["contacts"]
    rng = random.Random(43)
    cats = db.query(models.RiskCategory).filter_by(project_id=proj.id).all()
    phases = db.query(models.RiskPhase).filter_by(project_id=proj.id).all()
    if not cats or not phases:
        return
    risks_pool = [
        ("Equipment delivery delay", "Vendor delays for HV switchgear"),
        ("Permit not granted in time", "Possible delay in environmental permit"),
        ("Weather impact on civil works", "Heavy rainfall risk during execution"),
        ("Cable shortage on the market", "Global supply tightness"),
        ("Soil contamination found", "Unexpected soil condition in north zone"),
        ("Currency fluctuation", "EUR/USD impact on imported materials"),
        ("Scope creep on control system", "Additional features requested late"),
        ("Design change late in EPC phase", "Client requested elevation change"),
        ("Vendor quality issues", "Inspection findings during FAT"),
        ("Skilled labour shortage", "Local market scarce in welders"),
        ("Late access to site", "Adjacent works blocking handover"),
        ("Fuel price escalation", "Diesel surcharge from haulage contractors"),
        ("Cybersecurity incident on SCADA", "Need additional hardening"),
        ("Regulatory change mid-project", "New environmental rule applicable"),
        ("Subcontractor bankruptcy", "Tier-2 mechanical contractor at risk"),
        ("Logistics — port congestion", "Antwerp delays for inbound shipments"),
    ]
    # Risk statuses on the FE are: OPEN, MONITORING, CLOSED.
    # MONITORING == "mitigation in flight, residual risk being watched".
    statuses = ["OPEN"] * 18 + ["MONITORING"] * 8 + ["CLOSED"] * 6
    rng.shuffle(statuses)
    owners = [contacts["pmc_tech1"], contacts["pmc_tech2"], contacts["pmc_qa"], contacts["pmc_comm1"], contacts["po"]]
    for i in range(32):
        title, descr = risks_pool[i % len(risks_pool)]
        # All three scores are on a 1-5 scale (per the project's risk matrix).
        # Bias the BEFORE side to medium-high (3..5) so mitigation has somewhere
        # to drop AFTER scores.
        prob_before = rng.randint(3, 5)
        capex_before = rng.randint(3, 5)
        sched_before = rng.randint(3, 5)
        # capex_value (€) and schedule_value (days) are independent of the
        # probability/impact scoring — they capture the absolute exposure.
        capex_val = rng.choice([25_000, 50_000, 80_000, 120_000, 200_000])
        sched_val = rng.choice([7, 14, 21, 30, 45])
        status = statuses[i]
        # Always populate after-mitigation scores: drop each axis by 1-2 points
        # but never below 1, and never above the before value. Even for OPEN
        # risks the after-mitigation expectation is captured upfront so the
        # dashboard can show residual exposure.
        prob_after = max(1, prob_before - rng.randint(1, 2))
        capex_after = max(1, capex_before - rng.randint(1, 2))
        sched_after = max(1, sched_before - rng.randint(1, 2))
        r = models.Risk(
            project_id=proj.id,
            title=f"{title} (#{i+1})", description=descr,
            status=status,
            category_id=rng.choice(cats).id,
            phase_id=rng.choice(phases).id,
            owner_id=rng.choice(owners).id,
            date_opened=_days(-rng.randint(10, 180)),
            prob_score_before=prob_before,
            capex_score_before=capex_before,
            schedule_score_before=sched_before,
            capex_value=capex_val,
            schedule_value=sched_val,
            mitigation_type=rng.choice(["Avoid", "Mitigate", "Transfer", "Accept"]),
            mitigation_action=rng.choice([
                "Engage alternate vendor in parallel",
                "Add weekly progress checkpoint",
                "Pre-purchase critical components",
                "Reinforce QA inspection plan",
                "Lock in fixed-price contract clause",
                "Increase site supervision coverage",
            ]),
            action_due_date=_days(rng.randint(-20, 90)),
            prob_score_after=prob_after,
            capex_score_after=capex_after,
            schedule_score_after=sched_after,
        )
        # action_status drives the action-progress widgets:
        #  OPEN risks → action still NOT_STARTED / IN_PROGRESS / ON_HOLD
        #  MONITORING / CLOSED → mitigation has been executed, so action CLOSED
        if status in ("MONITORING", "CLOSED"):
            r.action_status = "CLOSED"
        else:
            r.action_status = rng.choice(["NOT_STARTED", "IN_PROGRESS", "ON_HOLD"])
        if status == "CLOSED":
            r.date_closed = _days(-rng.randint(0, 30))
        db.add(r)
    db.commit()


# ── Stage 5: meetings + action points ───────────────────────────────────────

def stage_meetings(db: Session, ctx: dict):
    import json as _json_mod
    proj = ctx["project"]
    contacts = ctx["contacts"]
    packages = ctx["packages"]
    rng = random.Random(44)

    # 12 meeting types — recurrence stored UPPERCASE ("WEEKLY"/"MONTHLY"/...).
    # Weekly types need days_of_week (JSON list) + recurrence_time + duration.
    # Monthly types need day_of_week (0..6) + monthly_week_position (1..5)
    # + recurrence_time + duration. The weekly-view UI requires these fields.
    types_pool = [
        # name, recurrence, pkg, participants, days_of_week, day_of_week, monthly_week_position, time, duration
        ("Weekly Project Review",      "WEEKLY",  "HV-A", [contacts["po"], contacts["pmc_tech1"], contacts["cli_m"]],     [0],          None, None, "09:00", 60),
        ("Monthly Steering Review",    "MONTHLY", "HV-A", [contacts["po"], contacts["cli_m"], contacts["pmc_comm1"]],     None,         3,    1,    "10:00", 90),
        ("Weekly HSE Meeting",         "WEEKLY",  "CIV",  [contacts["pmc_qa"], contacts["sup1"], contacts["sup2"]],       [1],          None, None, "08:30", 45),
        ("Civil Coordination Weekly",  "WEEKLY",  "CIV",  [contacts["pmc_qa"], contacts["vendor5"], contacts["sup1"]],    [2],          None, None, "11:00", 60),
        ("Mechanical Coordination",    "WEEKLY",  "MECH", [contacts["pmc_tech2"], contacts["vendor4"]],                   [2],          None, None, "14:00", 60),
        ("Control Coordination",       "WEEKLY",  "CTRL", [contacts["pmc_tech1"], contacts["vendor2"]],                   [3],          None, None, "10:30", 60),
        ("HV-A Vendor Weekly",         "WEEKLY",  "HV-A", [contacts["pmc_tech1"], contacts["vendor1"]],                   [3],          None, None, "13:30", 60),
        ("HV-B Vendor Weekly",         "WEEKLY",  "HV-B", [contacts["pmc_tech2"], contacts["vendor3"]],                   [4],          None, None, "13:30", 60),
        ("Design Review Board",        "MONTHLY", "HV-A", [contacts["po"], contacts["pmc_tech1"], contacts["cli_t"]],     None,         1,    2,    "15:00", 120),
        ("Commercial Coordination",    "MONTHLY", "HV-A", [contacts["pmc_comm1"], contacts["pmc_comm2"], contacts["cli_c"]], None,      2,    3,    "11:00", 60),
        ("Risk Review",                "MONTHLY", "HV-A", [contacts["po"], contacts["pmc_tech1"], contacts["pmc_qa"]],    None,         4,    1,    "14:00", 90),
        ("Live-line Toolbox",          "WEEKLY",  "HV-A", [contacts["sup1"], contacts["sup2"]],                           [4],          None, None, "07:30", 30),
    ]
    types = []
    for name, recurrence, pkg_tag, participants, dow_list, dow_int, mwk_pos, rec_time, dur in types_pool:
        mt = models.MeetingType(
            project_id=proj.id, name=name,
            description=f"{name} for {pkg_tag}",
            is_recurrent=True, recurrence=recurrence,
            days_of_week=_json_mod.dumps(dow_list) if dow_list is not None else None,
            day_of_week=dow_int,
            monthly_week_position=mwk_pos,
            recurrence_time=rec_time,
            duration=dur,
            owning_package_id=packages[pkg_tag].id,
        )
        db.add(mt); db.flush()
        for c in participants:
            db.add(models.MeetingTypeParticipant(meeting_type_id=mt.id, contact_id=c.id))
        types.append(mt)

    # 20 meetings — Meeting has title, date, time, location, meeting_type_id
    meetings = []
    for i in range(20):
        mt = types[i % len(types)]
        m = models.Meeting(
            project_id=proj.id, meeting_type_id=mt.id,
            title=f"{mt.name} — {_days(-3 - i * 4)}",
            date=_days(-3 - i * 4),
            time=mt.recurrence_time or "09:00",
            location=rng.choice(["HQ — Room 3", "Site Office", "Online — Teams", "Client Office"]),
            status="HELD" if i > 0 else "DRAFT",
        )
        db.add(m); db.flush()
        meetings.append(m)

    # 32 action points — MeetingPoint has type, topic, details, responsible_id, due_date, status
    point_titles = [
        ("ACTION", "Confirm cable routing with vendor",       "vendor1"),
        ("ACTION", "Update budget forecast",                  "pmc_comm1"),
        ("DECISION","Approve revised foundation depth",       "po"),
        ("ACTION", "Site induction for new contractors",      "sup1"),
        ("INFO",   "New HSE policy v2",                       "pmc_qa"),
        ("ACTION", "Submit progress photos",                  "vendor3"),
        ("ACTION", "Re-baseline schedule",                    "pmc_tech1"),
        ("ACTION", "Issue PO amendment for switchgear",       "pmc_comm2"),
        ("ACTION", "Quote review for cable spec",             "vendor1"),
        ("ACTION", "Audit contractor PPE compliance",         "sup2"),
        ("DECISION","Select grounding strategy",              "pmc_tech1"),
        ("ACTION", "Coordinate FAT logistics",                "pmc_qa"),
        ("ACTION", "Update risk register entries",            "pmc_tech2"),
        ("ACTION", "Schedule client walk-through",            "cli_m"),
        ("INFO",   "New procurement procedure",               "pmc_comm1"),
        ("ACTION", "Resolve invoice discrepancy",             "pmc_comm2"),
    ]
    statuses = ["OPEN"] * 18 + ["CLOSED"] * 14
    rng.shuffle(statuses)
    for i in range(32):
        ptype, topic, resp_h = point_titles[i % len(point_titles)]
        m = meetings[i % len(meetings)]
        p = models.MeetingPoint(
            project_id=proj.id,
            type=ptype,
            topic=f"{topic} (#{i+1})",
            details=f"Auto-generated action point #{i+1}",
            responsible_id=contacts.get(resp_h, contacts["po"]).id,
            due_date=_days(rng.randint(-25, 25)),
            status=statuses[i],
        )
        db.add(p)
    db.commit()


# ── Stage 6: schedule (tasks + progress reports) ────────────────────────────
# Note: there is no ScheduleBaseline model in this codebase.

def stage_schedule(db: Session, ctx: dict):
    proj = ctx["project"]
    packages = ctx["packages"]
    actor_id = ctx["actor_id"]
    rng = random.Random(45)

    # 56 tasks — Task has description, details, start_date, finish_date,
    # financial_weight, area_id, unit_id (no name/wbs/percent/status)
    task_templates = [
        ("Engineering",            -180, -90,   8),
        ("Procurement",            -150, -60,   8),
        ("Manufacturing FAT",       -90,  30,  12),
        ("Logistics & delivery",     30,  60,   6),
        ("Pre-installation",         20,  50,   6),
        ("Installation",             60, 150,  14),
        ("Site testing",            150, 180,   6),
        ("Commissioning",           180, 210,   8),
        ("Documentation",           -60,  90,   4),
        ("Quality control",         -30, 120,   6),
        ("Hand-over preparation",   100, 180,   6),
        ("Lessons learned",         200, 220,   2),
    ]
    seq = 1
    for tag in packages.keys():
        for label, ps, pe, weight in task_templates[:12]:
            if seq > 56:
                break
            db.add(models.Task(
                project_id=proj.id, package_id=packages[tag].id,
                description=f"{label} — {tag}",
                details=f"{label} works for package {tag}",
                start_date=_days(ps), finish_date=_days(pe),
                financial_weight=weight,
                created_by_id=actor_id,
            ))
            seq += 1

    db.flush()

    # 8 progress reports — PR has package_id, status, submitted_at + entries.
    # Spread submitted_at evenly across Nov 2025 → late-Apr 2026 (~180 days
    # before TODAY → today) so the submitted-PRs timeline shows bars across
    # the project execution window.
    pr_statuses = ["APPROVED"] * 4 + ["SUBMITTED"] * 2 + ["DRAFT"] * 1 + ["REJECTED"] * 1
    pkg_tags = list(packages.keys())
    for i in range(8):
        tag = pkg_tags[i % len(pkg_tags)]
        status = pr_statuses[i]
        pr_offset_days = 180 - i * 25 + rng.randint(-3, 3)  # 180, 155, 130, 105, 80, 55, 30, 5 (~ish)
        pr = models.ProgressReport(
            project_id=proj.id, package_id=packages[tag].id,
            status=status,
            submitted_at=datetime.utcnow() - timedelta(days=max(1, pr_offset_days)),
            created_by_id=actor_id,
        )
        if status == "APPROVED":
            pr.pmc_reviewed = True; pr.pmc_approved = True
            pr.client_reviewed = True; pr.client_approved = True
        elif status == "REJECTED":
            pr.pmc_reviewed = True; pr.pmc_approved = False
        db.add(pr); db.flush()

        # Add a couple of entries per PR using existing tasks
        sample_tasks = (db.query(models.Task)
                        .filter_by(project_id=proj.id, package_id=packages[tag].id)
                        .limit(3).all())
        for t in sample_tasks:
            db.add(models.ProgressReportEntry(
                progress_report_id=pr.id,
                task_id=t.id,
                percentage=rng.randint(10, 95),
                note=rng.choice([None, "On track", "Slight delay", "Recovered"]),
                pmc_approved=True if status == "APPROVED" else None,
                client_approved=True if status == "APPROVED" else None,
            ))
    db.commit()


# ── Stage 7: scope changes ──────────────────────────────────────────────────

def stage_scope_changes(db: Session, ctx: dict):
    proj = ctx["project"]
    packages = ctx["packages"]
    actor_id = ctx["actor_id"]
    rng = random.Random(46)
    sc_pool = [
        ("Add redundant cooling fan", 35_000),
        ("Upgrade panel finish", 8_000),
        ("Additional drainage works", 120_000),
        ("Add SCADA module", 45_000),
        ("Replace pipe spec for corrosion", 22_000),
        ("Extra grounding rod stations", 18_000),
        ("Reroute cables around new excavation", 65_000),
        ("Switch to higher-spec relay", 28_000),
        ("Additional area lighting", 12_500),
        ("Modify substation gantry height", 90_000),
        ("Add fire-fighting system upgrade", 75_000),
        ("Spare relay panel", 40_000),
        ("Asphalt the access road", 60_000),
        ("Increase battery autonomy", 22_000),
        ("Provide secondary HMI station", 35_000),
        ("Replace gaskets to FKM", 15_000),
        ("Additional civil concrete plinth", 18_000),
        ("Adjust transformer cooling cycle", 24_000),
        ("Add CCTV cameras at perimeter", 30_000),
        ("Spare parts package upgrade", 95_000),
    ]
    statuses = ["APPROVED"] * 8 + ["DRAFT"] * 4 + ["SUBMITTED"] * 5 + ["REJECTED"] * 3
    rng.shuffle(statuses)
    pkg_tags = list(packages.keys())
    for i, (descr, cost) in enumerate(sc_pool[:20]):
        status = statuses[i]
        tag = pkg_tags[i % len(pkg_tags)]
        sc = models.ScopeChange(
            project_id=proj.id, package_id=packages[tag].id,
            description=descr,
            details=f"Scope change details for {descr}",
            cost=cost,
            schedule_impact_months=rng.choice([0, 0, 1, 2, 3]),
            status=status,
            created_by_id=actor_id,
        )
        if status == "APPROVED":
            sc.pmc_reviewed = True; sc.pmc_approved = True
            sc.client_reviewed = True; sc.client_approved = True
        elif status == "REJECTED":
            sc.pmc_reviewed = True; sc.pmc_approved = False
        db.add(sc)
    db.commit()


# ── Stage 8: documents ──────────────────────────────────────────────────────

def stage_documents(db: Session, ctx: dict):
    import json as _json_mod
    proj = ctx["project"]
    packages = ctx["packages"]
    users = ctx["users"]
    actor_id = ctx["actor_id"]
    rng = random.Random(47)
    subs = db.query(models.Subservice).filter_by(project_id=proj.id).all()
    if not subs:
        return
    pkg_id_list = [p.id for p in packages.values()]
    comment_authors = [users["pmc_tech1"], users["pmc_tech2"], users["cli_t"], users["pmc_qa"]]
    sample_comments = [
        "Reference is missing on note 3 — please clarify.",
        "Update the title block: revision letter should be 'B'.",
        "Cross-section conflicts with the latest cable schedule.",
        "Please add the IEC reference for this protection setting.",
        "Stamp from PMC reviewer is illegible on this revision.",
        "Coordinate with civil package — invert level looks off.",
        "Material spec mismatch with the approved BOM.",
        "Page 4: please add the test acceptance criterion.",
    ]
    doc_titles = [
        "Single-line diagram", "Commercial offer revision",
        "Protection settings table", "Foundation drawings",
        "Pipe routing P&ID", "Switchgear arrangement",
        "Site layout plan", "Cable schedule",
        "Lighting plan", "Earthing plan",
        "FAT report", "Erection manual",
        "Operation & maintenance manual", "Test certificate",
        "HMI screens specification", "Rack layout",
        "Risk assessment", "Method statement",
        "Spare-parts list", "Quality plan",
        "As-built drawings", "Commissioning protocol",
        "Cybersecurity plan", "Hand-over checklist",
    ]
    statuses = ["APPROVED"] * 10 + ["IN_REVIEW"] * 6 + ["IN_PROGRESS"] * 5 + ["NOT_STARTED"] * 2 + ["REJECTED"] * 1
    rng.shuffle(statuses)
    types = ["TECHNICAL"] * 18 + ["COMMERCIAL"] * 6
    rng.shuffle(types)
    pkg_tags = list(packages.keys())
    for i in range(24):
        tag = pkg_tags[i % len(pkg_tags)]
        pkg = packages[tag]
        descr = f"{doc_titles[i]} — {tag}"
        status = statuses[i]
        cur_v = 2 if status in ("APPROVED", "REJECTED") else 1
        # Schedule dates: start ahead of first-issue, first-issue ahead of approval-due
        start_offset = -rng.randint(60, 150)
        first_issue_offset = start_offset + rng.randint(20, 50)
        approval_due_offset = first_issue_offset + rng.randint(15, 45)
        # Pick 1–2 other packages for distribution (so the column is non-empty)
        distrib = rng.sample([pid for pid in pkg_id_list if pid != pkg.id],
                             k=min(2, len(pkg_id_list) - 1)) if len(pkg_id_list) > 1 else []
        d = models.Document(
            project_id=proj.id, package_id=pkg.id,
            subservice_id=rng.choice(subs).id,
            document_type=types[i],
            description=descr,
            status=status,
            current_version=cur_v,
            weight=rng.choice([4, 6, 8, 10]),
            start_date=_days(start_offset),
            first_issue_date=_days(first_issue_offset),
            approval_due_date=_days(approval_due_offset),
            distribution_package_ids=_json_mod.dumps(distrib),
            actual_start_date=_days(start_offset + rng.randint(0, 5)) if status != "NOT_STARTED" else None,
            actual_start_by_id=actor_id if status != "NOT_STARTED" else None,
            created_by_id=actor_id,
        )
        db.add(d); db.flush()
        # DocumentVersion: document_id, version, status, launched_at, completed_at
        for v in range(1, cur_v + 1):
            dv_status = "APPROVED" if (v == cur_v and status == "APPROVED") else (
                "REJECTED" if (v == cur_v and status == "REJECTED") else
                "IN_REVIEW" if (v == cur_v and status == "IN_REVIEW") else "DRAFT"
            )
            db.add(models.DocumentVersion(
                document_id=d.id, version=v, status=dv_status,
                launched_at=datetime.utcnow() - timedelta(days=rng.randint(5, 80)),
                completed_at=datetime.utcnow() if dv_status in ("APPROVED", "REJECTED") else None,
                launched_by_id=actor_id,
            ))
        # Comments — only on docs that actually entered review (have a v1 review).
        # Skip NOT_STARTED so we don't create comments without a review history.
        if status != "NOT_STARTED":
            n_comments = rng.randint(1, 3)
            for cn in range(n_comments):
                c_status = "RESOLVED" if status == "APPROVED" and cn == 0 else rng.choice(["OPEN", "OPEN", "CLOSED", "RESOLVED"])
                comment_v = rng.choice(range(1, cur_v + 1))
                db.add(models.DocumentComment(
                    document_id=d.id,
                    version=comment_v,
                    text=rng.choice(sample_comments),
                    author_id=rng.choice(comment_authors).id,
                    status=c_status,
                    page_number=rng.choice([None, 1, 2, 3, 4]),
                    package_id=pkg.id,
                ))
    db.commit()


# ── Stage 9: ITP records + Punch items ──────────────────────────────────────

def stage_itp_and_punch(db: Session, ctx: dict):
    proj = ctx["project"]
    packages = ctx["packages"]
    units = ctx["units"]
    unit_area = ctx["unit_area"]
    actor_id = ctx["actor_id"]
    rng = random.Random(48)

    test_types = db.query(models.ITPTestType).filter_by(project_id=proj.id).all()
    witness_levels = db.query(models.ITPWitnessLevel).filter_by(project_id=proj.id).all()
    if not test_types or not witness_levels:
        return

    itp_descriptions = [
        "Routine acceptance test", "Insulation test", "Functional test SCADA",
        "Concrete pour inspection", "Pressure test", "Visual inspection bay",
        "Cable continuity test", "Earthing resistance test",
        "Insulation resistance test", "High-pot test",
        "Mechanical operation test", "Tightening torque check",
    ]
    statuses = ["APPROVED"] * 10 + ["SUBMITTED"] * 6 + ["DRAFT"] * 4 + ["REJECTED"] * 4
    rng.shuffle(statuses)
    pkg_tags = list(packages.keys())
    unit_codes = list(units.keys())
    for i in range(24):
        tag = pkg_tags[i % len(pkg_tags)]
        unit_code = unit_codes[i % len(unit_codes)] if i % 4 != 3 else None
        area = unit_area.get(unit_code) if unit_code else None
        status = statuses[i]
        # ITPRecord uses 'test' (the test name) and 'details'
        r = models.ITPRecord(
            project_id=proj.id, package_id=packages[tag].id,
            test=f"{itp_descriptions[i % len(itp_descriptions)]} #{i+1}",
            details=f"Auto-generated ITP record #{i+1}",
            test_type_id=rng.choice(test_types).id,
            witness_level_id=rng.choice(witness_levels).id,
            status=status,
            area_id=area.id if area else None,
            unit_id=units[unit_code].id if unit_code else None,
            planned_date=_days(rng.randint(-60, 30)),
            created_by_id=actor_id,
        )
        if status == "APPROVED":
            r.pmc_reviewed = True; r.pmc_approved = True
            r.client_reviewed = True; r.client_approved = True
        elif status == "REJECTED":
            r.pmc_reviewed = True; r.pmc_approved = False
        db.add(r)

    # 20 Punch items — PunchItem requires obligation_time_id (NOT NULL).
    # ObligationTime rows are auto-seeded by seed_qc_defaults_for_project.
    obligation_times = (db.query(models.ObligationTime)
                        .filter_by(project_id=proj.id)
                        .order_by(models.ObligationTime.sort_order).all())
    if not obligation_times:
        # Defensive: skip punches if QC defaults didn't run
        db.commit()
        return
    punch_titles = [
        "Loose cable gland", "Concrete crack visible", "Wrong cable label",
        "Missing PPE on shelf", "Bay paint damage", "Door alignment issue",
        "Drainage pipe blockage", "Lighting fixture loose", "Floor finish chip",
        "Anchor bolt corrosion",
    ]
    p_statuses = ["OPEN"] * 8 + ["IN_PROGRESS"] * 6 + ["RESOLVED"] * 4 + ["CLOSED"] * 2
    rng.shuffle(p_statuses)
    for i in range(20):
        tag = pkg_tags[i % len(pkg_tags)]
        unit_code = unit_codes[i % len(unit_codes)] if i % 5 != 4 else None
        area = unit_area.get(unit_code) if unit_code else None
        topic = f"{punch_titles[i % len(punch_titles)]} (#{i+1})"
        p = models.PunchItem(
            project_id=proj.id, package_id=packages[tag].id,
            topic=topic, details=topic,
            status=p_statuses[i],
            obligation_time_id=rng.choice(obligation_times).id,
            area_id=area.id if area else None,
            unit_id=units[unit_code].id if unit_code else None,
            created_by_id=actor_id,
        )
        db.add(p)
    db.commit()


# ── Stage 10: construction (workers + work permits) ──────────────────────────

def stage_construction(db: Session, ctx: dict):
    proj = ctx["project"]
    packages = ctx["packages"]
    areas = ctx["areas"]
    actor_id = ctx["actor_id"]
    rng = random.Random(49)

    # 32 workers — Worker has name (single string), phone, is_subcontractor,
    # subcontractor_id, status. No first_name/last_name/role/vendor_id/id_number.
    first_names = [
        "Frank", "Anna", "Bram", "Jan", "Marie", "Lukas", "Sven", "Eva",
        "Tom", "Sarah", "Mark", "Lara", "Pieter", "Emma", "Noah", "Lisa",
        "Daan", "Mila", "Finn", "Roos", "Levi", "Saar", "Joris", "Nele",
        "Bart", "Liesbeth", "Rik", "Femke", "Wout", "Anke", "Jeroen", "Ine",
    ]
    statuses = ["APPROVED"] * 22 + ["PENDING"] * 6 + ["REJECTED"] * 4
    rng.shuffle(statuses)
    pkg_tags = list(packages.keys())
    for i in range(32):
        tag = pkg_tags[i % len(pkg_tags)]
        w = models.Worker(
            project_id=proj.id, package_id=packages[tag].id,
            name=f"{first_names[i]} Demo{i+1:02d}",
            phone=f"+32 9 {100 + i:03d} {1000 + i:04d}",
            is_subcontractor=(i % 5 == 0),
            status=statuses[i],
            submitted_at=datetime.utcnow() - timedelta(days=rng.randint(5, 60)),
            created_by_id=actor_id,
        )
        if w.status == "APPROVED":
            w.reviewed_at = datetime.utcnow()
            w.reviewed_by_id = actor_id
        elif w.status == "REJECTED":
            w.rejection_comment = "Missing certificate"
            w.reviewed_at = datetime.utcnow()
            w.reviewed_by_id = actor_id
        db.add(w)

    # 16 work permits — WorkPermit has title, description, start_date, end_date, status.
    # Plus child rows: WorkPermitArea (multi-area), WorkPermitPermitType (multi-type),
    # WorkPermitHazard (declared hazards + preventive measures), WorkPermitPPE.
    permit_type_rows = (db.query(models.WorkPermitType)
                        .filter_by(project_id=proj.id)
                        .order_by(models.WorkPermitType.sort_order).all())
    permit_type_by_name = {pt.name: pt for pt in permit_type_rows}

    # Map UI permit "type" -> primary + auxiliary type rows + hazard keys + PPE keys
    permit_profiles = {
        "Hot Work":             (["Hot Work Permit", "Cold Work Permit"],
                                 ["Fire Hazard", "Hot surface", "General danger"],
                                 ["Safety helmet", "Safety goggles", "Protective gloves", "Safety clothing"]),
        "Working at Height":    (["Work at Height Permit", "Cold Work Permit"],
                                 ["Risk of Falling", "General danger"],
                                 ["Safety helmet", "Harness", "Safety shoes"]),
        "Confined Space":       (["Confined Space Entry Permit"],
                                 ["Toxic substances", "General danger"],
                                 ["Safety helmet", "Mask", "respiratory protection", "Safety goggles"]),
        "Excavation":           (["Excavation Permit", "Cold Work Permit"],
                                 ["Crusshing hazard", "General danger"],
                                 ["Safety helmet", "Safety shoes", "Protective gloves"]),
        "Live Electrical Work": (["Electrical Work Permit", "LOTO Permit"],
                                 ["Electrical Danger", "General danger"],
                                 ["Safety helmet", "Protective gloves", "Safety goggles", "Safety shoes"]),
        "Lifting Operation":    (["Lifting Permit"],
                                 ["Lifting operations", "Crusshing hazard"],
                                 ["Safety helmet", "Safety shoes", "Safety clothing"]),
    }
    preventive_measures = {
        "Fire Hazard":      "Fire watch + extinguisher within 5 m; remove combustibles in 10 m radius.",
        "Hot surface":      "Allow surfaces to cool below 50 °C before contact; use heat-resistant gloves.",
        "General danger":   "Site induction completed; toolbox talk delivered before start.",
        "Risk of Falling":  "Edge protection in place; harness anchored to certified anchor point.",
        "Toxic substances": "Atmosphere tested every 30 min; portable gas detector in use.",
        "Crusshing hazard": "Exclusion zone marked; spotter assigned; banksman supervises moves.",
        "Electrical Danger":"LOTO applied and verified; voltage tested at point of work.",
        "Lifting operations":"Lift plan signed; rigger present; load chart consulted.",
    }
    p_statuses = ["APPROVED"] * 8 + ["PENDING"] * 5 + ["REJECTED"] * 2 + ["CLOSED"] * 1
    rng.shuffle(p_statuses)
    # Each package can pop into 1–2 areas (multi-area work permits)
    pkg_to_areas = {
        "HV-A": ["HV-YARD"],
        "HV-B": ["HV-YARD", "CIVIL-N"],
        "CTRL": ["CONTROL"],
        "CIV":  ["CIVIL-N", "CIVIL-S"],
        "MECH": ["HV-YARD", "CONTROL"],
    }
    profile_keys = list(permit_profiles.keys())
    for i in range(16):
        tag = pkg_tags[i % len(pkg_tags)]
        profile_name = profile_keys[i % len(profile_keys)]
        type_names, hazard_keys, ppe_keys = permit_profiles[profile_name]
        status = p_statuses[i]
        wp = models.WorkPermit(
            project_id=proj.id, package_id=packages[tag].id,
            title=f"{profile_name} permit #{i+1} ({tag})",
            description=f"{profile_name} works on {tag}",
            start_date=_days(rng.randint(-40, 0)),
            end_date=_days(rng.randint(10, 60)),
            status=status,
            submitted_at=datetime.utcnow() - timedelta(days=rng.randint(2, 30)),
            created_by_id=actor_id,
        )
        db.add(wp); db.flush()

        # Permit types — link the matching WorkPermitType rows
        for tn in type_names:
            pt = permit_type_by_name.get(tn)
            if pt:
                db.add(models.WorkPermitPermitType(work_permit_id=wp.id, permit_type_id=pt.id))

        # Areas — link 1–2 areas; one approval row per area
        area_codes = pkg_to_areas[tag]
        approval_status = ("APPROVED" if status == "APPROVED"
                           else "REJECTED" if status == "REJECTED"
                           else "PENDING")
        for ac in area_codes:
            db.add(models.WorkPermitArea(work_permit_id=wp.id, area_id=areas[ac].id))
            db.add(models.WorkPermitAreaApproval(
                work_permit_id=wp.id, area_id=areas[ac].id, status=approval_status,
            ))

        # Hazards (with preventive measures) and PPE checklist
        for hk in hazard_keys:
            db.add(models.WorkPermitHazard(
                work_permit_id=wp.id,
                hazard_key=hk,
                preventive_measure=preventive_measures.get(hk, "Site supervisor briefed and standby."),
            ))
        for pk in ppe_keys:
            db.add(models.WorkPermitPPE(work_permit_id=wp.id, ppe_key=pk))

        # ── LOTOs ──────────────────────────────────────────────────────────
        # Attach LOTO entries on every other permit (8 of 16). Profiles that
        # naturally need isolation (Live Electrical, Confined Space, Hot Work)
        # get 2 LOTOs; the rest of the LOTO-eligible set gets 1.
        if i % 2 == 0:
            n_lotos = 2 if profile_name in ("Live Electrical Work",
                                            "Confined Space",
                                            "Hot Work") else 1
            loto_status_pool = ["LOCKED"] * 4 + ["REQUEST"] * 2 + ["REFUSED"] * 1 + ["CANCELLED"] * 1
            for j in range(n_lotos):
                lt_status = rng.choice(loto_status_pool)
                tag_no = f"LOTO-{i+1:02d}-{j+1}"
                lt_descr = {
                    "Live Electrical Work": "Isolate and lock incoming feeder + downstream breakers.",
                    "Confined Space":       "Isolate inlet/outlet valves; lock cover hatch.",
                    "Hot Work":              "Isolate gas line and lock fuel cut-off.",
                }.get(profile_name, "Isolate energy source for the duration of the works.")
                submit_dt = datetime.utcnow() - timedelta(days=rng.randint(3, 30))
                lt = models.LOTO(
                    project_id=proj.id, work_permit_id=wp.id,
                    tag_number=tag_no,
                    description=lt_descr,
                    status=lt_status,
                    locked_state=(lt_status == "LOCKED"),
                    submitted_at=submit_dt,
                    created_at=submit_dt,
                    created_by_id=actor_id,
                )
                if lt_status in ("LOCKED", "REFUSED"):
                    review_dt = submit_dt + timedelta(hours=rng.randint(2, 24))
                    lt.reviewed_at = review_dt
                    lt.reviewed_by_id = actor_id
                    if lt_status == "REFUSED":
                        lt.refusal_comment = "Tag mismatch with isolation list — please revise."
                db.add(lt); db.flush()

                # Audit trail rows
                db.add(models.LOTOReview(
                    loto_id=lt.id, event="SUBMIT",
                    actor_id=actor_id, created_at=submit_dt,
                ))
                if lt_status == "LOCKED":
                    db.add(models.LOTOReview(
                        loto_id=lt.id, event="CONFIRM", confirmed=True,
                        comment="Isolation verified, locks applied.",
                        actor_id=actor_id, created_at=lt.reviewed_at,
                    ))
                elif lt_status == "REFUSED":
                    db.add(models.LOTOReview(
                        loto_id=lt.id, event="REFUSE", confirmed=False,
                        comment=lt.refusal_comment,
                        actor_id=actor_id, created_at=lt.reviewed_at,
                    ))
                elif lt_status == "CANCELLED":
                    db.add(models.LOTOReview(
                        loto_id=lt.id, event="CANCEL",
                        comment="Vendor withdrew the LOTO request.",
                        actor_id=actor_id,
                        created_at=submit_dt + timedelta(hours=rng.randint(2, 24)),
                    ))
    db.commit()

    # ── Daily reports — Oct 2025 → Apr 2026 ────────────────────────────────
    # The "active workers per day" dashboard reads daily_reports + their
    # workers; without these the chart is empty. We seed reports for each
    # AWARDED package only (vendors only declare daily work after the order
    # is placed), spread across the project execution window (-210 → 0 days),
    # weekdays only, with ~40% density. Each report links 2-5 workers from
    # its own package + 1-2 areas + an avg-hours/worker between 6 and 9.
    awarded_tags = ctx.get("awarded_tags", list(packages.keys()))
    pkg_to_areas_for_dr = {
        "HV-A": ["HV-YARD"],
        "HV-B": ["HV-YARD", "CIVIL-N"],
        "CTRL": ["CONTROL"],
        "CIV":  ["CIVIL-N", "CIVIL-S"],
        "MECH": ["HV-YARD", "CONTROL"],
    }
    daily_rng = random.Random(60)
    descriptions = [
        "Switchgear assembly and labelling.",
        "Cable pulling on the south trench.",
        "Foundation concrete pour — bay 2.",
        "FAT preparation and pre-checks.",
        "Control panel wiring inside the control room.",
        "Earthing rod installation, north zone.",
        "Mechanical fittings on the auxiliary cooling skid.",
        "Site cleanup, scaffold dismantle, daily housekeeping.",
        "Insulation testing on phase A.",
        "Internal QC walk-down with vendor.",
        "Cable termination on bay B.",
        "Fire-fighting system pressure check.",
    ]
    no_work_reasons = [
        "Public holiday — no work executed.",
        "Heavy rainfall, civil works paused.",
        "Materials delayed; no productive activity.",
    ]
    for tag in awarded_tags:
        pkg = packages[tag]
        # Workers belonging to this package and APPROVED (the ones that
        # would actually be on site).
        pkg_workers = (db.query(models.Worker)
                       .filter_by(project_id=proj.id, package_id=pkg.id, status="APPROVED")
                       .all())
        if not pkg_workers:
            continue
        pkg_areas = [areas[ac] for ac in pkg_to_areas_for_dr.get(tag, []) if ac in areas]

        # Iterate every day in the window; pick weekdays at 40% probability
        for offset in range(-210, 1):
            day_dt = TODAY + timedelta(days=offset)
            if day_dt.weekday() >= 5:  # skip Sat/Sun
                continue
            if daily_rng.random() > 0.4:
                continue
            no_work = (daily_rng.random() < 0.05)
            description = (daily_rng.choice(no_work_reasons) if no_work
                           else daily_rng.choice(descriptions))
            avg_h = 0.0 if no_work else round(daily_rng.uniform(6.5, 9.0), 1)
            dr = models.DailyReport(
                project_id=proj.id, package_id=pkg.id,
                report_date=day_dt.isoformat(),
                description=description,
                avg_hours_per_worker=avg_h,
                no_work=no_work,
                created_at=datetime(day_dt.year, day_dt.month, day_dt.day, 17, 30),
                created_by_id=actor_id,
                locked=True,
                locked_at=datetime(day_dt.year, day_dt.month, day_dt.day, 17, 30),
            )
            db.add(dr); db.flush()
            if no_work:
                continue
            # 2-5 distinct workers from this package
            n_workers = daily_rng.randint(2, min(5, len(pkg_workers)))
            for w in daily_rng.sample(pkg_workers, n_workers):
                db.add(models.DailyReportWorker(
                    daily_report_id=dr.id, worker_id=w.id,
                ))
            # 1-2 areas from this package
            if pkg_areas:
                n_areas = daily_rng.randint(1, min(2, len(pkg_areas)))
                for a in daily_rng.sample(pkg_areas, n_areas):
                    db.add(models.DailyReportArea(
                        daily_report_id=dr.id, area_id=a.id,
                    ))
    db.commit()


# ── Stage 11: safety (observations + incidents) ─────────────────────────────

def stage_safety(db: Session, ctx: dict):
    proj = ctx["project"]
    packages = ctx["packages"]
    areas = ctx["areas"]
    actor_id = ctx["actor_id"]
    rng = random.Random(50)
    cats = db.query(models.SafetyObservationCategory).filter_by(project_id=proj.id).all()
    if not cats:
        return

    # 20 observations — SafetyObservation uses 'details' (no description)
    obs_titles = [
        "Excellent housekeeping at switchyard",
        "Loose scaffolding boards observed",
        "Good toolbox attendance",
        "Workers without earplugs near pump",
        "Best PPE compliance this week",
        "Slippery floor near control room",
        "Cable trip hazard on access route",
        "Proactive identification of hazard",
        "Improper ladder placement",
        "Excellent emergency drill",
    ]
    # SafetyObservation has 4 statuses: DRAFT | SUBMITTED | RECEIVED | CLOSED.
    # Most observations should be CLOSED (loop fully closed by the supervisor).
    statuses = ["CLOSED"] * 14 + ["RECEIVED"] * 3 + ["SUBMITTED"] * 2 + ["DRAFT"] * 1
    rng.shuffle(statuses)
    pkg_tags = list(packages.keys())
    pkg_to_area = {"HV-A":"HV-YARD", "HV-B":"HV-YARD", "CTRL":"CONTROL", "CIV":"CIVIL-N", "MECH":"HV-YARD"}
    # Spread submitted_at across Nov 2025 → late-Apr 2026 (~180 → 5 days ago).
    for i in range(20):
        tag = pkg_tags[i % len(pkg_tags)]
        area_code = pkg_to_area[tag]
        cat = cats[i % len(cats)]
        title = f"{obs_titles[i % len(obs_titles)]} (#{i+1})"
        # Linear distribution: 20 obs across ~175 days = roughly every 9 days.
        submitted_offset = 175 - i * 9 + rng.randint(-2, 2)
        submitted_at = datetime.utcnow() - timedelta(days=max(2, submitted_offset))
        status = statuses[i]
        o = models.SafetyObservation(
            project_id=proj.id, package_id=packages[tag].id,
            area_id=areas[area_code].id, category_id=cat.id,
            details=title, status=status,
            submitted_at=submitted_at if status != "DRAFT" else None,
            created_at=submitted_at - timedelta(hours=4),
            created_by_id=actor_id,
        )
        # Workflow timestamps: ack lands ~1-3 days after submit; close ~3-10
        # days after ack. Walk these forward only as far as the row's status.
        if status in ("RECEIVED", "CLOSED"):
            o.acknowledged_at = submitted_at + timedelta(days=rng.randint(1, 3))
            o.acknowledged_by_id = actor_id
            o.acknowledge_comment = "Received and assigned for follow-up."
        if status == "CLOSED":
            o.closed_at = (o.acknowledged_at or submitted_at) + timedelta(days=rng.randint(3, 10))
            o.closed_by_id = actor_id
        db.add(o)

    # 12 incidents — SafetyIncident uses 'details', 'incident_cause_id', 'severity_class_id'
    causes = db.query(models.SafetyIncidentCause).filter_by(project_id=proj.id).all()
    severities = db.query(models.SafetySeverityClass).filter_by(project_id=proj.id).all()
    if causes and severities:
        inc_titles = [
            "Hand laceration during handling", "Near-miss: dropped tool",
            "Slip and fall (no injury)", "Eye irritation from dust",
            "Minor electrical shock", "Heat exhaustion symptoms",
            "Forklift near-miss with worker", "Sprained ankle on uneven ground",
            "Chemical splash on coverall", "Pinch injury closing access door",
        ]
        statuses = (["DRAFT"] * 1 + ["UNDER_INVESTIGATION"] * 3
                    + ["ACTION_IN_PROGRESS"] * 3 + ["PENDING_REVIEW"] * 2 + ["CLOSED"] * 3)
        rng.shuffle(statuses)
        # Spread incident_date evenly across Jan 2026 → late Apr 2026.
        # With TODAY ~ Apr 29 2026 that's offsets -118 → -1; 12 incidents
        # at ~10-day cadence with a small jitter so two incidents don't
        # land on the exact same day.
        for i in range(12):
            tag = pkg_tags[i % len(pkg_tags)]
            area_code = pkg_to_area[tag]
            details = f"{inc_titles[i % len(inc_titles)]} (#{i+1})"
            incident_offset = -118 + i * 10 + rng.randint(-2, 2)
            incident_offset = max(-118, min(-1, incident_offset))
            inc = models.SafetyIncident(
                project_id=proj.id, package_id=packages[tag].id,
                area_id=areas[area_code].id,
                incident_cause_id=rng.choice(causes).id,
                severity_class_id=rng.choice(severities).id,
                incident_date=_days(incident_offset),
                details=details,
                action=rng.choice([
                    "Stopped work, retrained crew, replaced damaged item.",
                    "Cordoned area, supervisor briefed team, work resumed safely.",
                    "Reported hazard to HSE; replaced PPE; toolbox talk delivered.",
                    "Investigation completed; revised procedure issued.",
                ]),
                status=statuses[i],
                # submitted_at lands 0-3 days after the incident
                submitted_at=datetime.utcnow() + timedelta(days=incident_offset + rng.randint(0, 3)),
                created_by_id=actor_id,
            )
            db.add(inc)
    db.commit()

    # ── 20 toolbox talks ───────────────────────────────────────────────────
    # SafetyToolbox status flow: DRAFT → SUBMITTED → RECEIVED, with re-open
    # available. Categories were seeded by seed_safety_setup_defaults.
    tbx_categories = (db.query(models.SafetyToolboxCategory)
                      .filter_by(project_id=proj.id)
                      .order_by(models.SafetyToolboxCategory.sort_order).all())
    workers_all = (db.query(models.Worker)
                   .filter_by(project_id=proj.id, status="APPROVED").all())
    obs_for_link = (db.query(models.SafetyObservation)
                    .filter_by(project_id=proj.id).all())
    inc_for_link = (db.query(models.SafetyIncident)
                    .filter_by(project_id=proj.id).all())
    if tbx_categories and workers_all:
        toolbox_topics = [
            ("Working at height refresher",
             "Reviewed harness inspection, anchor-point selection and fall-arrest principles. Q&A on guard-rail tolerances."),
            ("Lifting operations briefing",
             "Pre-lift checklist walk-through: rigger duties, exclusion zone marking, banksman signals."),
            ("Electrical safety: LOTO recap",
             "Refreshed LOTO procedure, voltage-test before-touch rule, and recovery from refused isolation."),
            ("PPE compliance reminder",
             "Walk-through of mandatory PPE per work zone, defective-PPE replacement process."),
            ("Housekeeping & trip hazards",
             "Inspection of cable management, exclusion of stored materials from walkways."),
            ("Tools & equipment inspection",
             "Pre-use inspection for hand tools and powered tools. Quarantine tag procedure."),
            ("Excavation safety",
             "Soil classification, shoring requirements, daily inspection and entry logging."),
            ("Traffic & vehicle interaction",
             "Site speed limits, banksman duty during reversing, separation of pedestrians and vehicles."),
            ("Emergency drill review",
             "Walk-through of muster points, emergency contacts, role of fire warden."),
            ("Hot work and fire watch",
             "Hot-work permit, fire-watch duration, extinguisher coverage, area cool-down."),
        ]
        tbx_statuses = ["RECEIVED"] * 14 + ["SUBMITTED"] * 4 + ["DRAFT"] * 2
        rng.shuffle(tbx_statuses)
        for i in range(20):
            topic, body = toolbox_topics[i % len(toolbox_topics)]
            cat = rng.choice(tbx_categories)
            # Span Nov 2025 → late Apr 2026 (offset 0 = today): -175 → -5 days
            day_offset = -175 + int((i / 19) * 170) + rng.randint(-3, 3)
            talk_dt = datetime.utcnow() + timedelta(days=day_offset)
            status = tbx_statuses[i]
            tbx = models.SafetyToolbox(
                project_id=proj.id, category_id=cat.id,
                given_by_user_id=actor_id,
                talk_date=talk_dt.date().isoformat(),
                details=body,
                status=status,
                created_at=talk_dt - timedelta(hours=2),
                created_by_id=actor_id,
            )
            db.add(tbx); db.flush()
            # Audit trail
            db.add(models.SafetyToolboxReview(
                toolbox_id=tbx.id, event="CREATED",
                actor_id=actor_id, created_at=talk_dt - timedelta(hours=2),
            ))
            if status in ("SUBMITTED", "RECEIVED"):
                tbx.submitted_at = talk_dt
                tbx.submitted_by_id = actor_id
                db.add(models.SafetyToolboxReview(
                    toolbox_id=tbx.id, event="SUBMITTED",
                    actor_id=actor_id, created_at=talk_dt,
                ))
            if status == "RECEIVED":
                ack_dt = talk_dt + timedelta(days=rng.randint(1, 4))
                tbx.acknowledged_at = ack_dt
                tbx.acknowledged_by_id = actor_id
                tbx.acknowledge_comment = "Acknowledged by site supervisor."
                db.add(models.SafetyToolboxReview(
                    toolbox_id=tbx.id, event="ACKNOWLEDGED",
                    actor_id=actor_id, created_at=ack_dt,
                    comment="Acknowledged by site supervisor.",
                ))
            # Packages — 1–2 packages per toolbox
            pkg_subset = rng.sample(list(packages.values()), rng.randint(1, 2))
            for p in pkg_subset:
                db.add(models.SafetyToolboxPackage(toolbox_id=tbx.id, package_id=p.id))
            # Workers — 4–10 attendees, weighted toward the chosen packages
            pkg_ids = {p.id for p in pkg_subset}
            pref_workers = [w for w in workers_all if w.package_id in pkg_ids]
            pool = pref_workers if len(pref_workers) >= 6 else workers_all
            n_attendees = rng.randint(4, min(10, len(pool)))
            for w in rng.sample(pool, n_attendees):
                db.add(models.SafetyToolboxWorker(toolbox_id=tbx.id, worker_id=w.id))
            # Link 0–2 observations and 0–1 incidents that the talk references
            if obs_for_link and rng.random() < 0.5:
                for o in rng.sample(obs_for_link, min(rng.randint(1, 2), len(obs_for_link))):
                    db.add(models.SafetyToolboxObservation(
                        toolbox_id=tbx.id, observation_id=o.id,
                    ))
            if inc_for_link and rng.random() < 0.3:
                inc = rng.choice(inc_for_link)
                db.add(models.SafetyToolboxIncident(
                    toolbox_id=tbx.id, incident_id=inc.id,
                ))
        db.commit()


# ── Stage 12: procurement ──────────────────────────────────────────────────

def stage_procurement(db: Session, ctx: dict):
    proj = ctx["project"]
    packages = ctx["packages"]
    contacts = ctx["contacts"]
    users = ctx["users"]
    actor_id = ctx["actor_id"]
    rng = random.Random(51)

    company_names = [
        "BidCorp",       "Tendrx",         "AltaPort",      "Verde Tech",
        "VoltaPower",    "Northwind EPC",  "EuroSwitch",    "MegaCircuit",
        "ECG Industries","SwitchLine",     "Proteus Group", "Ampere Solutions",
        "Volt-Mech",     "CoreGrid",       "ElectroBuild",  "Spark Engineering",
    ]
    bidder_users = [users["bidder1"], users["bidder2"]]
    companies = {}
    for i, name in enumerate(company_names):
        c = models.BiddingCompany(
            project_id=proj.id, name=name,
            description=f"Demo bidder {name}",
            created_by_id=actor_id,
        )
        db.add(c); db.flush()
        # BiddingCompanyContact: company_id + user_id (not contact_id)
        db.add(models.BiddingCompanyContact(
            company_id=c.id, user_id=bidder_users[i % len(bidder_users)].id,
        ))
        companies[name] = c

    steps = (db.query(models.ProcurementStep)
             .filter_by(project_id=proj.id)
             .order_by(models.ProcurementStep.sort_order).all())
    if not steps:
        return

    plan_pkgs = list(packages.keys())
    company_list = list(companies.keys())
    for k, tag in enumerate(plan_pkgs):
        pkg = packages[tag]
        plan = models.PackagePlan(
            project_id=proj.id, package_id=pkg.id,
            notes=f"Demo procurement plan for {tag}",
            created_by_id=actor_id,
        )
        db.add(plan); db.flush()
        bidder_subset = company_list[(k * 3) % len(company_list):(k * 3) % len(company_list) + 7]
        if len(bidder_subset) < 7:
            bidder_subset = (bidder_subset + company_list)[:7]
        for cname in bidder_subset:
            db.add(models.PackagePlanBidder(plan_id=plan.id, company_id=companies[cname].id))

        # Planned date per procurement step — required for the S-curve (planned
        # vs actual cumulative weight). Spread the steps across the package's
        # procurement window: ~6 months before TODAY → ~3 months after, staggered
        # by package index k so each plan gets a unique curve.
        n_steps = len(steps)
        for s_idx, step in enumerate(steps):
            # Linear distribution across the window
            offset = -180 + int(((s_idx + 1) / n_steps) * 270) + (k * 5)
            db.add(models.PackagePlanStepDate(
                plan_id=plan.id,
                step_id=step.id,
                due_date=_days(offset),
            ))

        # Register entries — 7 per package = 35 total.
        # Procurement runs early in the project. For awarded packages the
        # award lands around -60 days (~Mar 2026); for non-awarded packages
        # the entries are still mid-evaluation today. Procurement window:
        # -210 (Oct '25) → today, with steps spread across that span.
        # Awarded packages cover the FULL N steps; non-awarded reach about
        # 60% of the steps so the actual S-curve flattens (still in progress).
        n_steps = len(steps)
        is_awarded_package = (k % 2 == 0)
        # max step index that AWARDED-vendor entry has traversed = n_steps-1
        # max step index for COMPETING entries on awarded pkg = n_steps-2 (just before award)
        # max step index for COMPETING entries on non-awarded pkg = ~ceil(0.6 * n_steps)
        max_step_idx_awarded_winner = n_steps - 1
        max_step_idx_competing_awarded = max(1, n_steps - 2)
        max_step_idx_non_awarded = max(1, int(round(n_steps * 0.6)))
        # Window for STEP_ADVANCE events for THIS package
        # Awarded pkgs: -200 → -60. Non-awarded: -180 → -10.
        if is_awarded_package:
            window_start, window_end = -200, -60
        else:
            window_start, window_end = -180, -10

        for i, cname in enumerate(bidder_subset):
            if i == 0 and is_awarded_package:
                status = "AWARDED"
                step_idx = max_step_idx_awarded_winner
            elif is_awarded_package and 0 < i < 3:
                status = "EXCLUDED"
                step_idx = min(2, n_steps - 1)
            elif i == 6:
                status = "EXCLUDED"
                step_idx = min(2, n_steps - 1)
            else:
                # Still in evaluation. On awarded pkgs, COMPETING is moot
                # (a winner exists) but they still trace a parallel path.
                status = "COMPETING"
                step_idx = max_step_idx_competing_awarded if is_awarded_package else max_step_idx_non_awarded
            e = models.ProcurementEntry(
                project_id=proj.id, package_id=pkg.id, company_id=companies[cname].id,
                status=status,
                current_step_id=steps[step_idx].id,
                bid_value=(rng.choice([800_000, 920_000, 750_000, 1_050_000, 1_180_000])
                           if status != "EXCLUDED" else None),
                bid_currency="EUR",
                technical_compliance=rng.choice(["PASS", "PENDING", "PASS", "PASS"]) if status != "EXCLUDED" else None,
                commercial_compliance=rng.choice(["PASS", "PENDING", "PASS"]) if status != "EXCLUDED" else None,
                exclusion_reason=("Did not advance past compliance" if status == "EXCLUDED" else None),
                created_by_id=actor_id,
            )
            db.add(e); db.flush()

            # ── ProcurementEvents drive the actual S-curve ─────────────────
            # One STEP_ADVANCE event per step traversed (1 → step_idx),
            # spread linearly across the package window. The dashboard reads
            # these events (event_type IN STEP_ADVANCE/STEP_REVERT/AWARD)
            # and rebuilds the curve from cum_weights[step_obj.id].
            traversed_count = step_idx  # we advance from step 0 → step_idx
            if traversed_count > 0:
                span = window_end - window_start
                for s in range(1, traversed_count + 1):
                    advance_offset = window_start + int((s / max(traversed_count, 1)) * span)
                    advance_dt = datetime.utcnow() + timedelta(days=advance_offset)
                    db.add(models.ProcurementEvent(
                        entry_id=e.id, event_type="STEP_ADVANCE",
                        step_name=steps[s].step_id,
                        comment=f"Advanced to {steps[s].step_id}",
                        created_at=advance_dt,
                        created_by_id=actor_id,
                    ))
            # Final terminal events
            if status == "AWARDED":
                award_dt = datetime.utcnow() + timedelta(days=window_end + 2)
                db.add(models.ProcurementEvent(
                    entry_id=e.id, event_type="AWARD",
                    step_name=steps[step_idx].step_id,
                    old_status="COMPETING", new_status="AWARDED",
                    comment="Contract awarded",
                    created_at=award_dt,
                    created_by_id=actor_id,
                ))
            elif status == "EXCLUDED":
                excl_offset = window_start + int(0.4 * (window_end - window_start))
                excl_dt = datetime.utcnow() + timedelta(days=excl_offset)
                db.add(models.ProcurementEvent(
                    entry_id=e.id, event_type="STATUS_CHANGE",
                    old_status="COMPETING", new_status="EXCLUDED",
                    comment="Excluded — did not advance past compliance",
                    created_at=excl_dt,
                    created_by_id=actor_id,
                ))
    db.commit()


# ── Driver ──────────────────────────────────────────────────────────────────

def main():
    db: Session = database.SessionLocal()
    try:
        ctx = stage_project_and_people(db)
        if not ctx:
            return
        ctx = stage_areas_units_packages(db, ctx)
        stage_budget(db, ctx)
        stage_risks(db, ctx)
        stage_meetings(db, ctx)
        stage_schedule(db, ctx)
        stage_scope_changes(db, ctx)
        stage_documents(db, ctx)
        stage_itp_and_punch(db, ctx)
        stage_construction(db, ctx)
        stage_safety(db, ctx)
        stage_procurement(db, ctx)
        print(f"[demo] ✓ Created project {DEMO_NUMBER} (id={ctx['project'].id})")
        print(f"[demo]   Users created with password '{DEMO_PASSWORD}':")
        for handle, u in ctx["users"].items():
            print(f"    - {handle:10s} {u.email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
