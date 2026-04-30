"""
Seeds a large fictive demo project with realistic data across every module.

Run:  python seed_demo_project.py
"""
import json
import random
from datetime import datetime, timedelta

from database import SessionLocal, engine, Base
import models
import auth
from seed_data import (
    seed_subservices_for_project,
    seed_risk_data_for_project,
    seed_procurement_for_project,
    seed_settings_for_project,
    seed_qc_defaults_for_project,
)

random.seed(42)

PROJECT_NUMBER = "DEMO-2026-A"
CLIENT_NAME    = "Helios Chemicals N.V."
PROJECT_DESC   = "Helios Unit 500 Revamp"
GENERAL_DESC   = ("Revamp of Process Unit 500 at the Helios Antwerp complex, "
                  "covering civil, mechanical, piping, electrical and instrumentation "
                  "scope. Target mechanical completion Q3 2027.")
LOCATION       = "Antwerp, Belgium"
START_DATE     = "2025-06-01"
END_DATE       = "2027-09-30"

# ── Name pools ──────────────────────────────────────────────────────────────
FIRST_NAMES = [
    "Alice", "Bram", "Chloe", "Diego", "Erik", "Fiona", "Gael", "Hana",
    "Ivan", "Julia", "Karim", "Lena", "Mario", "Nina", "Omar", "Petra",
    "Quentin", "Rania", "Sven", "Tara", "Ugo", "Vera", "Willem", "Xavier",
    "Yana", "Zara", "Arno", "Bo", "Cato", "Dieter", "Elke", "Freek",
    "Gunter", "Hilde", "Ingrid", "Jeroen", "Koen", "Lotte", "Maarten",
    "Nienke", "Olaf", "Paulien", "Renaat", "Sofie", "Tom", "Ulrike",
    "Valerie", "Wouter", "Yves", "Zoe",
]
LAST_NAMES = [
    "Janssens", "Peeters", "Maes", "Willems", "Claes", "Goossens", "Wouters",
    "De Smet", "Hendrickx", "Martens", "Van de Velde", "Dupont", "Dubois",
    "Martin", "Lefevre", "Laurent", "Schmidt", "Fischer", "Weber", "Meyer",
    "Bauer", "Rossi", "Ferrari", "Esposito", "Garcia", "Lopez", "Sanchez",
    "Silva", "Costa", "Nakamura", "Tanaka", "Yamamoto", "Ibrahim", "Hassan",
    "Khan", "Singh", "Patel", "Andersson", "Johansson", "Lindberg", "Novak",
    "Horvath", "Kowalski", "Nowak", "Petrov", "Kuznetsov", "Walsh", "Murphy",
    "O'Brien", "Kelly",
]
COMPANIES_CLIENT = ["Helios Chemicals N.V."]
COMPANIES_PMC    = ["ImPulSe Project Management"]
COMPANIES_VENDOR = [
    "DeWaele Civil Works", "Beltech Mechanical Services", "VanderBerg Piping",
    "Nord Electrical", "Fluid Automation BV", "Kroes Instrumentation",
    "Heliox Structural", "Greenfield Environmental", "ProCool HVAC",
    "Stavros Welding Co.", "BluePrint Architects", "Sigma Process Engineering",
    "Delta Civil", "Omega Telecom",
]
FUNCTIONS_PMC = [
    "Project Director", "Project Manager", "Package Manager",
    "Lead Engineer", "QA/QC Lead", "Construction Manager",
    "Planning Engineer", "Cost Controller", "Document Controller",
    "HSE Manager",
]
FUNCTIONS_CLIENT = [
    "Client Project Director", "Client Project Manager",
    "Client Technical Reviewer", "Client Commercial Reviewer",
    "Client Commissioning Lead",
]
FUNCTIONS_VENDOR = [
    "Project Manager", "Site Supervisor", "Lead Engineer",
    "Foreman", "Sales Representative", "QHSE Officer",
]
AREAS = [
    ("A1", "Raw Materials Area"),
    ("A2", "Reactor Bay"),
    ("A3", "Distillation Area"),
    ("A4", "Storage Tanks"),
    ("A5", "Pump House"),
    ("A6", "Control Room"),
    ("A7", "Utility Area"),
    ("A8", "Loading Dock"),
    ("A9", "Offsites"),
    ("A10", "Admin & Services"),
]
UNITS = [
    ("U100", "Feed Pre-heater"),
    ("U200", "Primary Reactor"),
    ("U300", "Stripping Column"),
    ("U400", "Overhead Condenser"),
    ("U500", "Product Pump Group"),
    ("U600", "Heat Exchanger Skid"),
    ("U700", "Flare Stack"),
    ("U800", "Cooling Tower"),
    ("U900", "Storage Tank T-01"),
    ("U1000","Effluent Treatment"),
]
PACKAGES_DEF = [
    ("CIV", "Civil Works",                   "DeWaele Civil Works"),
    ("MEC", "Mechanical Erection",           "Beltech Mechanical Services"),
    ("PIP", "Piping",                         "VanderBerg Piping"),
    ("ELE", "Electrical",                     "Nord Electrical"),
    ("INS", "Instrumentation",                "Kroes Instrumentation"),
    ("AUT", "Automation",                     "Fluid Automation BV"),
    ("HVA", "HVAC",                           "ProCool HVAC"),
    ("STR", "Structural Steelwork",           "Heliox Structural"),
    ("COM", "Commissioning Services",         "Sigma Process Engineering"),
    ("ENV", "Environmental & Effluent",       "Greenfield Environmental"),
]

# ── Utility ─────────────────────────────────────────────────────────────────
def rand_date_between(start: str, end: str) -> str:
    s = datetime.fromisoformat(start)
    e = datetime.fromisoformat(end)
    delta = (e - s).days
    return (s + timedelta(days=random.randint(0, max(delta, 1)))).strftime("%Y-%m-%d")

def rand_datetime_between(start: str, end: str) -> datetime:
    s = datetime.fromisoformat(start)
    e = datetime.fromisoformat(end)
    delta_s = int((e - s).total_seconds())
    return s + timedelta(seconds=random.randint(0, max(delta_s, 1)))

def iso_name(first, last): return f"{first} {last}"

def email_of(name, domain):
    return (name.lower()
             .replace(" ", ".")
             .replace("'", "")
             .replace("ä", "a").replace("ö", "o").replace("ü", "u")
             + "@" + domain)


def build():
    db = SessionLocal()
    try:
        # Make sure tables exist for fresh DBs
        Base.metadata.create_all(bind=engine)

        # Skip if already seeded
        existing = db.query(models.Project).filter_by(project_number=PROJECT_NUMBER).first()
        if existing:
            print(f"Project '{PROJECT_NUMBER}' already exists (id={existing.id}). Delete it manually if you want to re-seed.")
            return

        # ── Admin user (reuse or create) ────────────────────────────────────
        admin = db.query(models.User).filter_by(role="ADMIN").first()
        if not admin:
            admin = models.User(
                name="Administrator", email="admin@example.com",
                password_hash=auth.hash_password("admin"), role="ADMIN",
            )
            db.add(admin); db.commit(); db.refresh(admin)

        # ── Project ─────────────────────────────────────────────────────────
        proj = models.Project(
            project_number=PROJECT_NUMBER,
            description=PROJECT_DESC,
            client=CLIENT_NAME,
            client_reference="HCH-PM-2026-A",
            general_description=GENERAL_DESC,
            start_date=START_DATE, end_date=END_DATE,
            status="ACTIVE", location=LOCATION,
            created_at=datetime.utcnow(), created_by_id=admin.id,
        )
        db.add(proj); db.commit(); db.refresh(proj)
        pid = proj.id
        print(f"Project created: id={pid} ({PROJECT_NUMBER})")

        db.add(models.UserProject(user_id=admin.id, project_id=pid, role="PROJECT_OWNER"))
        db.commit()

        # ── Project defaults (subservices, risk cats, procurement, perms) ──
        seed_subservices_for_project(pid, db)
        seed_risk_data_for_project(pid, db)
        seed_procurement_for_project(pid, db)
        seed_settings_for_project(pid, db)
        seed_qc_defaults_for_project(pid, db)

        # ── Contacts (50+) ──────────────────────────────────────────────────
        contacts = []

        # 1 PMC project director + project managers
        pmc_contacts = []
        client_contacts = []
        vendor_contacts_by_company = {}

        used_emails = set()
        def add_contact(name, email, company, phone, function):
            if email in used_emails:
                email = email.replace("@", f".{random.randint(1000,9999)}@")
            used_emails.add(email)
            c = models.Contact(project_id=pid, name=name, email=email,
                               company=company, phone=phone, function=function,
                               created_by_id=admin.id)
            db.add(c); contacts.append(c)
            return c

        # Flush in-progress adds periodically to populate ids
        def flush():
            db.flush()

        # PMC — 15 contacts
        for i in range(15):
            fn = random.choice(FIRST_NAMES); ln = random.choice(LAST_NAMES)
            name = iso_name(fn, ln)
            role = FUNCTIONS_PMC[0] if i == 0 else (FUNCTIONS_PMC[1] if i == 1 else random.choice(FUNCTIONS_PMC[2:]))
            c = add_contact(name, email_of(name, "impulse-pm.example"),
                            COMPANIES_PMC[0], f"+32 4{random.randint(10,99)} {random.randint(100,999)} {random.randint(100,999)}", role)
            pmc_contacts.append(c)

        # Client — 8 contacts
        for i in range(8):
            fn = random.choice(FIRST_NAMES); ln = random.choice(LAST_NAMES)
            name = iso_name(fn, ln)
            role = FUNCTIONS_CLIENT[0] if i == 0 else random.choice(FUNCTIONS_CLIENT)
            c = add_contact(name, email_of(name, "helios-chem.example"),
                            CLIENT_NAME, f"+32 3{random.randint(10,99)} {random.randint(100,999)} {random.randint(100,999)}", role)
            client_contacts.append(c)

        # Vendors — 30+ contacts spread across 10 packages + other vendor cos
        vendor_cos = [p[2] for p in PACKAGES_DEF] + [
            c for c in COMPANIES_VENDOR if c not in {p[2] for p in PACKAGES_DEF}
        ][:5]  # cap on extras
        for co in vendor_cos:
            vendor_contacts_by_company[co] = []
            per = random.randint(2, 4)
            for _ in range(per):
                fn = random.choice(FIRST_NAMES); ln = random.choice(LAST_NAMES)
                name = iso_name(fn, ln)
                role = random.choice(FUNCTIONS_VENDOR)
                c = add_contact(name, email_of(name, co.lower().replace(' ', '').replace('.', '') + ".example"),
                                co, f"+32 9{random.randint(10,99)} {random.randint(100,999)} {random.randint(100,999)}", role)
                vendor_contacts_by_company[co].append(c)
        flush()

        total = len(contacts)
        print(f"Contacts seeded: {total} (pmc={len(pmc_contacts)}, client={len(client_contacts)}, vendors across companies)")

        db.commit()
        for c in contacts:
            db.refresh(c)

        # ── Org chart ───────────────────────────────────────────────────────
        # Client director → PMC director → PMC project managers → the rest of PMC team
        # Vendor project managers report to their package's responsible PMC manager
        client_director = client_contacts[0]
        pmc_director = pmc_contacts[0]
        pmc_pms = pmc_contacts[1:3]
        pmc_others = pmc_contacts[3:]

        org_links = []
        org_links.append(models.OrgChartLink(project_id=pid, contact_id=pmc_director.id,
                                              reports_to_id=client_director.id, relation_type="LINE"))
        # Client team report to client director
        for c in client_contacts[1:]:
            org_links.append(models.OrgChartLink(project_id=pid, contact_id=c.id,
                                                  reports_to_id=client_director.id, relation_type="LINE"))
        for pm in pmc_pms:
            org_links.append(models.OrgChartLink(project_id=pid, contact_id=pm.id,
                                                  reports_to_id=pmc_director.id, relation_type="LINE"))
        for i, c in enumerate(pmc_others):
            parent = pmc_pms[i % len(pmc_pms)]
            org_links.append(models.OrgChartLink(project_id=pid, contact_id=c.id,
                                                  reports_to_id=parent.id, relation_type="LINE"))
        db.add_all(org_links)
        db.commit()
        print(f"Org chart links: {len(org_links)}")

        # ── Areas & Units ───────────────────────────────────────────────────
        area_rows = []
        for i, (tag, desc) in enumerate(AREAS):
            a = models.Area(project_id=pid, tag=tag, description=desc,
                            owner_id=pmc_others[i % len(pmc_others)].id,
                            created_by_id=admin.id)
            db.add(a); area_rows.append(a)
        unit_rows = []
        for i, (tag, desc) in enumerate(UNITS):
            u = models.Unit(project_id=pid, tag=tag, description=desc,
                            owner_id=pmc_others[(i+2) % len(pmc_others)].id,
                            created_by_id=admin.id)
            db.add(u); unit_rows.append(u)
        db.commit()
        for a in area_rows: db.refresh(a)
        for u in unit_rows: db.refresh(u)
        print(f"Areas: {len(area_rows)} · Units: {len(unit_rows)}")

        # ── Packages (10) ──────────────────────────────────────────────────
        packages = []
        # Reviewer assignments cycle through pmc_contacts / client_contacts
        for i, (tag, name, vendor_co) in enumerate(PACKAGES_DEF):
            pmc_tech = pmc_others[i % len(pmc_others)]
            pmc_comm = pmc_others[(i+3) % len(pmc_others)]
            cli_tech = client_contacts[i % len(client_contacts)]
            cli_comm = client_contacts[(i+2) % len(client_contacts)]
            vendor_lead = (vendor_contacts_by_company.get(vendor_co) or [None])[0]
            package_owner = pmc_pms[i % len(pmc_pms)]

            pkg = models.Package(
                project_id=pid, tag_number=tag, name=name, company=vendor_co,
                address=LOCATION,
                account_manager_id=vendor_lead.id if vendor_lead else None,
                package_owner_id=package_owner.id,
                pmc_technical_reviewer_id=pmc_tech.id,
                pmc_commercial_reviewer_id=pmc_comm.id,
                client_technical_reviewer_id=cli_tech.id,
                client_commercial_reviewer_id=cli_comm.id,
                created_by_id=admin.id,
            )
            db.add(pkg); packages.append(pkg)
        db.commit()
        for p in packages: db.refresh(p)

        # Link vendor contacts to their package
        for pkg, (_, _, vendor_co) in zip(packages, PACKAGES_DEF):
            for c in vendor_contacts_by_company.get(vendor_co, []):
                db.add(models.PackageContact(package_id=pkg.id, contact_id=c.id))
        # Budget baselines for each package
        for i, pkg in enumerate(packages):
            db.add(models.BudgetBaseline(package_id=pkg.id,
                                         amount=500_000 + 150_000 * i + random.randint(-30000, 30000)))
        db.commit()
        print(f"Packages: {len(packages)} (with reviewers, package owner, vendor contacts, budget baseline)")

        # ── Meeting Points (100) ────────────────────────────────────────────
        # Create 4 meeting types + some meetings first
        mt = models.MeetingType(project_id=pid, name="Weekly Progress",
                                description="Weekly project status review")
        db.add(mt); db.commit(); db.refresh(mt)

        meeting_points = []
        statuses = ["NOT_STARTED", "IN_PROGRESS", "CLOSED", "ON_HOLD", "URGENT"]
        types    = ["ACTION", "DECISION", "INFO"]
        for i in range(100):
            created = rand_datetime_between("2025-07-01", "2026-04-18")
            st = random.choices(statuses, weights=[20, 30, 35, 5, 10])[0]
            mp = models.MeetingPoint(
                project_id=pid,
                project_seq_id=i + 1,
                type=random.choices(types, weights=[75, 15, 10])[0],
                topic=f"Action point {i+1}: " + random.choice([
                    "Review P&ID deviations",
                    "Confirm valve selection",
                    "Schedule hydrotest",
                    "Order long lead items",
                    "Clarify scope of subcontractor",
                    "Update progress curve",
                    "Validate material substitution",
                    "Submit commissioning plan",
                    "Prepare risk workshop",
                    "Close outstanding NCR",
                ]),
                details="Automatically generated during demo seed.",
                responsible_id=random.choice(pmc_others + client_contacts[1:]).id,
                due_date=rand_date_between("2025-08-01", "2026-08-31"),
                status=st,
                closed_at=created + timedelta(days=random.randint(2, 40)) if st == "CLOSED" else None,
                created_at=created,
                created_by_id=admin.id,
            )
            db.add(mp); meeting_points.append(mp)
        db.commit()
        print(f"Meeting points: {len(meeting_points)}")

        # ── Tasks (100) + Progress Reports ─────────────────────────────────
        tasks = []
        for i in range(100):
            pkg = packages[i % len(packages)]
            start = rand_date_between("2025-08-01", "2026-06-30")
            finish = (datetime.fromisoformat(start) + timedelta(days=random.randint(30, 180))).strftime("%Y-%m-%d")
            t = models.Task(
                project_id=pid,
                project_seq_id=i + 1,
                package_id=pkg.id,
                description=f"Task {i+1} for {pkg.tag_number}: " + random.choice([
                    "Detailed engineering",
                    "Procurement of bulk material",
                    "Prefabrication",
                    "Installation",
                    "Testing",
                    "Punch list resolution",
                    "Documentation handover",
                ]),
                details="",
                start_date=start,
                finish_date=finish,
                financial_weight=random.choice([1.0, 2.0, 3.0, 5.0, 8.0]),
                area_id=random.choice(area_rows).id,
                unit_id=random.choice(unit_rows).id,
                created_by_id=admin.id,
            )
            db.add(t); tasks.append(t)
        db.commit()
        print(f"Tasks: {len(tasks)}")

        # Progress reports — 2 per package with varied states
        pr_count = 0
        for pkg in packages:
            pkg_tasks = [t for t in tasks if t.package_id == pkg.id]
            if not pkg_tasks: continue
            for n in range(2):
                status = random.choices(
                    ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"],
                    weights=[20, 25, 45, 10],
                )[0]
                pr = models.ProgressReport(
                    project_id=pid, package_id=pkg.id, status=status,
                    created_by_id=admin.id,
                    submitted_at=rand_datetime_between("2026-01-01", "2026-04-17") if status != "DRAFT" else None,
                    pmc_reviewed=status in ("APPROVED", "REJECTED"),
                    pmc_approved=(True if status == "APPROVED" else (False if status == "REJECTED" else None)),
                    pmc_reviewed_at=rand_datetime_between("2026-01-01", "2026-04-17") if status in ("APPROVED", "REJECTED") else None,
                    client_reviewed=status == "APPROVED",
                    client_approved=(True if status == "APPROVED" else None),
                    client_reviewed_at=rand_datetime_between("2026-01-01", "2026-04-17") if status == "APPROVED" else None,
                )
                db.add(pr); db.flush()
                for t in pkg_tasks[:5]:
                    db.add(models.ProgressReportEntry(
                        progress_report_id=pr.id, task_id=t.id,
                        percentage=random.choice([10, 25, 40, 60, 75, 90, 100]),
                        pmc_approved=pr.pmc_approved,
                        client_approved=pr.client_approved,
                    ))
                pr_count += 1
        db.commit()
        print(f"Progress reports: {pr_count}")

        # ── Risks (50) ──────────────────────────────────────────────────────
        cats = db.query(models.RiskCategory).filter_by(project_id=pid).all()
        phases = db.query(models.RiskPhase).filter_by(project_id=pid).all()
        for i in range(50):
            st = random.choices(["OPEN", "IN_PROGRESS", "CLOSED"], weights=[35, 45, 20])[0]
            date_opened = rand_date_between("2025-07-01", "2026-03-31")
            r = models.Risk(
                project_id=pid,
                project_seq_id=i + 1,
                title=f"Risk {i+1}: " + random.choice([
                    "Delayed vendor drawings",
                    "Corrosion on exchanger bundles",
                    "Permit extension required",
                    "Subcontractor resource shortage",
                    "Hot work clash with operations",
                    "Late long-lead item delivery",
                    "Unexpected buried utilities",
                    "Weather impact on crane operations",
                    "Additional inspection hold points",
                    "Scope gap between packages",
                ]),
                description="Risk auto-generated for demo purposes.",
                status=st,
                category_id=random.choice(cats).id,
                phase_id=random.choice(phases).id,
                date_opened=date_opened,
                date_closed=(datetime.fromisoformat(date_opened) + timedelta(days=random.randint(20, 120))).strftime("%Y-%m-%d") if st == "CLOSED" else None,
                owner_id=random.choice(pmc_others).id,
                prob_score_before=random.randint(2, 5),
                capex_score_before=random.randint(1, 5),
                schedule_score_before=random.randint(1, 5),
                capex_value=random.choice([5000, 10000, 25000, 75000, 150000]),
                schedule_value=random.choice([1, 2, 3, 4, 8]),
                mitigation_type=random.choice(["AVOID", "TRANSFER", "REDUCE", "ACCEPT"]),
                mitigation_action=random.choice([
                    "Escalate to vendor to expedite",
                    "Add weekly status checkpoint",
                    "Transfer via back-to-back clause",
                    "Mitigate via alternative supplier",
                    "Insurance coverage updated",
                ]),
                action_due_date=rand_date_between("2026-01-01", "2026-12-31"),
                action_status=random.choice(["NOT_STARTED", "IN_PROGRESS", "DONE"]),
                prob_score_after=random.randint(1, 4),
                capex_score_after=random.randint(1, 3),
                schedule_score_after=random.randint(1, 3),
                created_by_id=admin.id,
            )
            db.add(r)
        db.commit()
        print(f"Risks: 50")

        # ── Scope Changes (50) ──────────────────────────────────────────────
        sc_statuses = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"]
        sc_weights  = [15, 25, 40, 15, 5]
        for i in range(50):
            st = random.choices(sc_statuses, weights=sc_weights)[0]
            pkg = random.choice(packages)
            created = rand_datetime_between("2025-08-01", "2026-04-17")
            sc = models.ScopeChange(
                project_id=pid,
                project_seq_id=i + 1,
                description=random.choice([
                    "Additional bypass valves", "Extended platform",
                    "Upgraded insulation class", "Extra piping supports",
                    "Additional scaffolding days", "Change of coating system",
                    "Removed redundant instrument", "Upgraded motor size",
                ]) + f" #{i+1}",
                details="Client-approved scope adjustment for the revamp.",
                cost=random.choice([-25000, 12000, 45000, 90000, 150000, 240000]),
                schedule_impact_months=random.choice([0, 0.5, 1.0, 1.5, 2.0, -0.5]),
                package_id=pkg.id,
                created_by_id=admin.id,
                status=st,
                pmc_reviewed=st in ("APPROVED", "REJECTED"),
                pmc_approved=(True if st == "APPROVED" else (False if st == "REJECTED" else None)),
                pmc_comment="PMC review comment." if st in ("APPROVED", "REJECTED") else None,
                pmc_reviewed_at=created + timedelta(days=random.randint(1, 10)) if st in ("APPROVED", "REJECTED") else None,
                client_reviewed=st == "APPROVED",
                client_approved=True if st == "APPROVED" else None,
                client_comment="Client review comment." if st == "APPROVED" else None,
                client_reviewed_at=created + timedelta(days=random.randint(5, 15)) if st == "APPROVED" else None,
                created_at=created,
                submitted_at=created + timedelta(hours=random.randint(2, 48)) if st != "DRAFT" else None,
            )
            db.add(sc)
        db.commit()
        print(f"Scope changes: 50")

        # ── Orders + Invoices (for budget + Monthly invoicing chart) ───────
        orders_created = []
        for pkg in packages:
            n = random.randint(2, 4)
            for k in range(n):
                order = models.Order(
                    package_id=pkg.id,
                    po_number=f"PO-{pkg.tag_number}-{1000 + k}",
                    description=f"Base contract order #{k+1}",
                    vendor_name=pkg.company,
                    amount=random.randint(80, 400) * 1000,
                    order_date=rand_date_between("2025-08-01", "2026-02-28"),
                    status="COMMITTED",
                    created_by_id=admin.id,
                )
                db.add(order); orders_created.append(order)
        db.commit()
        for o in orders_created: db.refresh(o)

        inv_statuses = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "CANCELLED"]
        inv_weights  = [10, 20, 55, 10, 5]
        inv_count = 0
        for order in orders_created:
            for _ in range(random.randint(2, 5)):
                st = random.choices(inv_statuses, weights=inv_weights)[0]
                inv_date = rand_date_between("2025-10-01", "2026-04-15")
                amount = int(order.amount * random.uniform(0.1, 0.35))
                inv = models.Invoice(
                    order_id=order.id, package_id=order.package_id,
                    invoice_number=f"INV-{order.po_number}-{random.randint(100,999)}",
                    description="Monthly progress invoice",
                    amount=amount,
                    invoice_date=inv_date,
                    status=st,
                    pmc_reviewed=st in ("APPROVED", "REJECTED"),
                    pmc_approved=(True if st == "APPROVED" else (False if st == "REJECTED" else None)),
                    client_reviewed=st == "APPROVED",
                    client_approved=True if st == "APPROVED" else None,
                    created_by_id=admin.id,
                    submitted_at=datetime.fromisoformat(inv_date + "T09:00:00") if st != "DRAFT" else None,
                )
                db.add(inv); inv_count += 1
        db.commit()
        print(f"Orders: {len(orders_created)} · Invoices: {inv_count}")

        # ── Budget transfers ────────────────────────────────────────────────
        for _ in range(8):
            from_pkg = random.choice(packages)
            to_pkg = random.choice([p for p in packages if p.id != from_pkg.id])
            db.add(models.BudgetTransfer(
                type="TRANSFER", from_package_id=from_pkg.id, to_package_id=to_pkg.id,
                amount=random.randint(10, 80) * 1000,
                description=f"Budget reallocation to support {to_pkg.tag_number}",
                transfer_date=rand_date_between("2025-11-01", "2026-04-10"),
            ))
        for _ in range(3):
            pkg = random.choice(packages)
            db.add(models.BudgetTransfer(
                type="INCREASE", from_package_id=None, to_package_id=pkg.id,
                amount=random.randint(25, 100) * 1000,
                description=f"Budget increase for {pkg.tag_number}",
                transfer_date=rand_date_between("2025-11-01", "2026-04-10"),
            ))
        db.commit()
        print("Budget transfers: 11")

        # ── Bidding companies (20) ──────────────────────────────────────────
        bc_count = 0
        for name in COMPANIES_VENDOR + [
            f"Bidder Alpha {i}" for i in range(1, 7)
        ]:
            bc = models.BiddingCompany(project_id=pid, name=name,
                                        description="Potential bidder", created_by_id=admin.id)
            db.add(bc); bc_count += 1
            if bc_count >= 20: break
        db.commit()
        print(f"Bidding companies: {bc_count}")

        # ── Documents (100) + Comments (100) ───────────────────────────────
        subservices = db.query(models.Subservice).filter_by(project_id=pid).all()
        doc_statuses = ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "APPROVED", "APPROVED_WITH_COMMENTS", "REJECTED"]
        doc_weights  = [15, 25, 15, 30, 10, 5]
        doc_objects = []
        for i in range(100):
            pkg = random.choice(packages)
            ss = random.choice(subservices)
            st = random.choices(doc_statuses, weights=doc_weights)[0]
            start_dt = rand_date_between("2025-07-01", "2026-03-01")
            cur_ver = 0 if st in ("NOT_STARTED", "IN_PROGRESS") else random.choice([0, 1, 2])
            last_approved = cur_ver if st in ("APPROVED", "APPROVED_WITH_COMMENTS") else None
            doc = models.Document(
                project_id=pid, project_seq_id=i + 1,
                package_id=pkg.id, subservice_id=ss.id,
                document_type=random.choices(["TECHNICAL", "COMMERCIAL"], weights=[80, 20])[0],
                description=random.choice([
                    "P&ID Revision", "GA Drawing", "Line List", "Hydraulic Calculation",
                    "Equipment Datasheet", "ITP Plan", "Method Statement",
                    "QA/QC Dossier", "As-Built Drawing", "Risk Assessment",
                ]) + f" #{i+1:03d}",
                area_id=random.choice(area_rows).id if random.random() < 0.5 else None,
                unit_id=random.choice(unit_rows).id if random.random() < 0.4 else None,
                require_area_review=random.random() < 0.3,
                require_unit_review=random.random() < 0.2,
                start_date=start_dt,
                first_issue_date=rand_date_between(start_dt, "2026-04-15") if st != "NOT_STARTED" else None,
                approval_due_date=rand_date_between("2026-05-01", "2026-12-31"),
                distribution_package_ids=json.dumps([p.id for p in random.sample(packages, k=2) if p.id != pkg.id]),
                status=st, current_version=cur_ver, last_approved_version=last_approved,
                weight=random.choice([4, 8, 12]),
                actual_start_date=start_dt if st != "NOT_STARTED" else None,
                actual_start_by_id=admin.id if st != "NOT_STARTED" else None,
                created_by_id=admin.id, created_at=datetime.fromisoformat(start_dt + "T08:00:00"),
            )
            db.add(doc); doc_objects.append(doc)
        db.commit()
        for d in doc_objects: db.refresh(d)

        # Create DocumentVersion rows (v0 for each, plus higher if present)
        for doc in doc_objects:
            for v in range(doc.current_version + 1):
                dv = models.DocumentVersion(
                    document_id=doc.id, version=v,
                    status="APPROVED" if (doc.last_approved_version is not None and v == doc.last_approved_version)
                           else (doc.status if v == doc.current_version else "APPROVED"),
                    launched_at=rand_datetime_between("2025-09-01", "2026-04-15") if v > 0 or doc.status == "IN_REVIEW" else None,
                    launched_by_id=admin.id,
                )
                db.add(dv)
        db.commit()

        # 100 document comments with varied statuses
        for i in range(100):
            doc = random.choice(doc_objects)
            st = random.choices(["OPEN", "RESOLVED", "CLOSED"], weights=[50, 30, 20])[0]
            created = rand_datetime_between("2025-11-01", "2026-04-17")
            cm = models.DocumentComment(
                document_id=doc.id, version=min(doc.current_version, random.choice([0, 1])),
                text=random.choice([
                    "Please check dimensions on item 3.",
                    "Tag numbers inconsistent with PID.",
                    "Missing signature block.",
                    "Revise revision cloud.",
                    "Update reviewer list.",
                    "Reference to obsolete spec — please update.",
                    "Cross-check valve CV against datasheet.",
                    "Align drawing frame with company template.",
                ]),
                author_id=admin.id, status=st,
                page_number=random.choice([None, 1, 2, 3, 4]),
                created_at=created,
                updated_at=(created + timedelta(days=random.randint(1, 10))) if st != "OPEN" else None,
            )
            db.add(cm)
        db.commit()
        print(f"Documents: 100 · Comments: 100")

        # ── ITP Records (100) ───────────────────────────────────────────────
        test_types   = db.query(models.ITPTestType).filter_by(project_id=pid).all()
        witness_lvls = db.query(models.ITPWitnessLevel).filter_by(project_id=pid).all()
        ob_times     = db.query(models.ObligationTime).filter_by(project_id=pid).all()
        itp_objects = []
        itp_statuses = ["DRAFT", "PLANNED", "PASSED", "FAILED"]
        appr_statuses= ["TO_SUBMIT", "PENDING", "APPROVED", "REJECTED"]
        for i in range(100):
            pkg = random.choice(packages)
            planned = rand_date_between("2025-09-01", "2026-09-30")
            st = random.choices(itp_statuses, weights=[15, 30, 45, 10])[0]
            ap = random.choices(appr_statuses, weights=[15, 25, 50, 10])[0]
            itp = models.ITPRecord(
                project_id=pid, project_seq_id=i + 1,
                package_id=pkg.id,
                test_type_id=random.choice(test_types).id,
                test=random.choice([
                    "Flange bolt torque check", "Radiographic weld test",
                    "Dimensional verification", "Paint adhesion test",
                    "Pressure hold test", "Insulation resistance",
                    "FAT for PLC cabinet", "Material cert review",
                ]) + f" #{i+1}",
                witness_level_id=random.choice(witness_lvls).id,
                status=st, approval_status=ap,
                pmc_reviewed=ap in ("APPROVED", "REJECTED"),
                pmc_approved=(True if ap == "APPROVED" else (False if ap == "REJECTED" else None)),
                client_reviewed=ap == "APPROVED",
                client_approved=True if ap == "APPROVED" else None,
                area_id=random.choice(area_rows).id if random.random() < 0.5 else None,
                unit_id=random.choice(unit_rows).id if random.random() < 0.4 else None,
                acceptance_criteria="As per applicable standards.",
                result=("OK" if st == "PASSED" else ("NOK" if st == "FAILED" else None)),
                planned_date=planned,
                executed_date=planned if st in ("PASSED", "FAILED") else None,
                created_at=datetime.fromisoformat(planned + "T10:00:00") - timedelta(days=30),
                created_by_id=admin.id,
            )
            db.add(itp); itp_objects.append(itp)
        db.commit()
        for t in itp_objects: db.refresh(t)
        print(f"ITP records: 100")

        # ── Punch items (100) ───────────────────────────────────────────────
        punch_statuses = ["OPEN", "TO_REVIEW", "CLOSED"]
        pw = [45, 30, 25]
        for i in range(100):
            pkg = random.choice(packages)
            itp_ref = random.choice(itp_objects) if random.random() < 0.6 else None
            st = random.choices(punch_statuses, weights=pw)[0]
            created = rand_datetime_between("2025-11-01", "2026-04-17")
            p = models.PunchItem(
                project_id=pid, project_seq_id=i + 1,
                package_id=pkg.id,
                obligation_time_id=random.choice(ob_times).id,
                itp_record_id=itp_ref.id if itp_ref else None,
                area_id=random.choice(area_rows).id if random.random() < 0.6 else None,
                unit_id=random.choice(unit_rows).id if random.random() < 0.5 else None,
                topic=random.choice([
                    "Missing gasket on flange",
                    "Paint touch-up required",
                    "Instrument tag missing",
                    "Support bracket loose",
                    "Hot work permit expired",
                    "Hydrotest records pending",
                    "Cable tray alignment",
                    "Insulation damage",
                    "Nameplate missing",
                    "Platform grating gap",
                ]) + f" #{i+1}",
                details="Detailed auto-generated finding for demo purposes.",
                response=("Repaired and re-inspected." if st != "OPEN" else None),
                status=st,
                submitted_by_id=admin.id if st != "OPEN" else None,
                created_at=created, updated_at=created + timedelta(days=random.randint(0, 60)),
                created_by_id=admin.id,
            )
            db.add(p)
        db.commit()
        print(f"Punch items: 100")

        print("\n✓ Demo project seeded successfully.")
        print(f"  Project number: {PROJECT_NUMBER}")
        print(f"  Project ID:     {pid}")

    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    build()
