"""
Demo data seeder — run once to populate a full demo project.

Usage:
    python seed_demo.py

Creates project "Greenfield Chemical Plant — Phase 2" with complete dummy data
across all modules: contacts, packages, meetings, budget, risks, scope changes,
and schedule with progress reports.

WARNING: Run only once. Running again will create duplicate data.
"""

import sys
from datetime import datetime, date, timedelta
import database
import models
import auth

db = database.SessionLocal()

def d(offset_days: int) -> str:
    """Return ISO date string relative to today."""
    return (date.today() + timedelta(days=offset_days)).isoformat()

def dt(offset_days: int) -> datetime:
    return datetime.utcnow() + timedelta(days=offset_days)

print("=== Demo Data Seeder ===\n")

# ─────────────────────────────────────────────────────────────────────────────
# 1. Project
# ─────────────────────────────────────────────────────────────────────────────
project = models.Project(
    project_number="GCP-2024-001",
    description="Phase 2 Expansion",
    client="ChemCorp International S.A.",
    client_reference="CC-PM-2024-42",
    general_description=(
        "Greenfield expansion of the existing chemical plant in Antwerp. "
        "Phase 2 covers the installation of a new process unit (Unit 400), "
        "including civil works, process equipment, electrical, HVAC, and "
        "automation systems. Target commissioning: Q3 2026."
    ),
    start_date=d(-270),
    end_date=d(365),
    status="ACTIVE",
    location="Antwerp, Belgium",
)
db.add(project)
db.commit()
db.refresh(project)
pid = project.id
print(f"✓ Project created  → id={pid}  [{project.project_number}]")

# Seed subservices, risk meta, settings
import seed_data as sd
sd.seed_subservices_for_project(pid, db)
sd.seed_risk_data_for_project(pid, db)
sd.seed_settings_for_project(pid, db)
print("✓ Subservices, risk meta, settings seeded")

# ─────────────────────────────────────────────────────────────────────────────
# 2. Contacts
# ─────────────────────────────────────────────────────────────────────────────
def mk_contact(**kw):
    c = models.Contact(project_id=pid, **kw)
    db.add(c)
    db.flush()
    return c

# PMC Team
c_owner      = mk_contact(name="Sophie Laurent",    email="s.laurent@pmc.be",     company="PMC Consult", function="Project Director",    phone="+32 2 123 45 60")
c_pm         = mk_contact(name="Marc Dubois",        email="m.dubois@pmc.be",      company="PMC Consult", function="Project Manager",      phone="+32 2 123 45 61")
c_cost       = mk_contact(name="Lena Hoffman",       email="l.hoffman@pmc.be",     company="PMC Consult", function="Cost Controller",      phone="+32 2 123 45 62")
c_hse        = mk_contact(name="Johan Pieters",      email="j.pieters@pmc.be",     company="PMC Consult", function="HSE Manager",          phone="+32 2 123 45 63")

# Client
c_client_pm  = mk_contact(name="Claire Moreau",      email="c.moreau@chemcorp.com", company="ChemCorp International", function="Project Owner",     phone="+32 3 456 78 90")
c_client_eng = mk_contact(name="Tom De Smedt",       email="t.desmedt@chemcorp.com",company="ChemCorp International", function="Lead Engineer",     phone="+32 3 456 78 91")

# Vendors
c_civil_pm   = mk_contact(name="Erik Vandenberghe",  email="e.v@civiltec.be",      company="CivilTec NV",            function="Site Manager",      phone="+32 9 100 20 30")
c_elec_pm    = mk_contact(name="Ana Ferreira",        email="a.ferreira@voltex.eu", company="Voltex Engineering",     function="Project Lead",      phone="+32 9 200 30 40")
c_proc_pm    = mk_contact(name="Klaus Werner",        email="k.werner@processgmbh.de",company="ProcessGmbH",          function="Project Manager",   phone="+49 89 300 40 50")
c_hvac_pm    = mk_contact(name="Sara Janssen",        email="s.janssen@klimatek.be",company="KlimaTek BVBA",          function="Project Engineer",  phone="+32 9 300 50 60")
c_auto_pm    = mk_contact(name="Ravi Sharma",         email="r.sharma@autosys.in",  company="AutoSys Ltd",            function="Automation Lead",   phone="+91 80 400 50 60")

db.commit()
print("✓ 11 contacts created")

# ─────────────────────────────────────────────────────────────────────────────
# 3. Users
# ─────────────────────────────────────────────────────────────────────────────
def mk_user(name, email, pw, role, contact=None):
    u = models.User(
        name=name,
        email=email,
        password_hash=auth.hash_password(pw),
        role=role,
        contact_id=contact.id if contact else None,
    )
    db.add(u)
    db.flush()
    db.add(models.UserProject(user_id=u.id, project_id=pid, role=role))
    return u

u_owner  = mk_user("Sophie Laurent",    "s.laurent@pmc.be",      "demo123", "PROJECT_OWNER", c_owner)
u_pm     = mk_user("Marc Dubois",        "m.dubois@pmc.be",       "demo123", "PROJECT_TEAM",  c_pm)
u_cost   = mk_user("Lena Hoffman",       "l.hoffman@pmc.be",      "demo123", "PROJECT_TEAM",  c_cost)
u_client = mk_user("Claire Moreau",      "c.moreau@chemcorp.com", "demo123", "CLIENT",        c_client_pm)
u_civil  = mk_user("Erik Vandenberghe", "e.v@civiltec.be",       "demo123", "VENDOR",        c_civil_pm)
u_elec   = mk_user("Ana Ferreira",       "a.ferreira@voltex.eu",  "demo123", "VENDOR",        c_elec_pm)
u_proc   = mk_user("Klaus Werner",       "k.werner@processgmbh.de","demo123","VENDOR",        c_proc_pm)

db.commit()
print("✓ 7 users created  (owner: s.laurent@pmc.be / demo123)")

# ─────────────────────────────────────────────────────────────────────────────
# 4. Packages
# ─────────────────────────────────────────────────────────────────────────────
def mk_pkg(tag, name, company, contact, pmc_comm, client_comm):
    p = models.Package(
        project_id=pid,
        tag_number=tag,
        name=name,
        company=company,
        package_owner_id=contact.id,
        pmc_commercial_reviewer_id=pmc_comm.id,
        client_commercial_reviewer_id=client_comm.id,
        pmc_technical_reviewer_id=c_pm.id,
        client_technical_reviewer_id=c_client_eng.id,
    )
    db.add(p)
    db.flush()
    # Link vendor contact to package
    db.add(models.PackageContact(package_id=p.id, contact_id=contact.id))
    return p

pkg_civil  = mk_pkg("PKG-01", "Civil & Structural Works",   "CivilTec NV",       c_civil_pm, c_cost, c_client_pm)
pkg_elec   = mk_pkg("PKG-02", "Electrical Installation",    "Voltex Engineering", c_elec_pm,  c_cost, c_client_pm)
pkg_proc   = mk_pkg("PKG-03", "Process Equipment Supply",   "ProcessGmbH",        c_proc_pm,  c_cost, c_client_pm)
pkg_hvac   = mk_pkg("PKG-04", "HVAC & Ventilation",         "KlimaTek BVBA",      c_hvac_pm,  c_cost, c_client_pm)
pkg_auto   = mk_pkg("PKG-05", "Automation & Control",       "AutoSys Ltd",        c_auto_pm,  c_cost, c_client_pm)

db.commit()
print("✓ 5 packages created")

# ─────────────────────────────────────────────────────────────────────────────
# 5. Budget baselines & orders & transfers & invoices
# ─────────────────────────────────────────────────────────────────────────────
baselines = {
    pkg_civil.id:  3_200_000,
    pkg_elec.id:   1_850_000,
    pkg_proc.id:   4_500_000,
    pkg_hvac.id:     650_000,
    pkg_auto.id:     900_000,
}
for pkg_id, amount in baselines.items():
    db.add(models.BudgetBaseline(package_id=pkg_id, amount=amount, currency="EUR"))
db.flush()

# Orders
o_civil1  = models.Order(package_id=pkg_civil.id,  po_number="PO-2024-0101", description="Foundations & Slab Works",       vendor_name="CivilTec NV",       amount=1_450_000, currency="EUR", order_date=d(-240), status="COMMITTED")
o_civil2  = models.Order(package_id=pkg_civil.id,  po_number="PO-2024-0102", description="Structural Steel Erection",     vendor_name="CivilTec NV",       amount=980_000,   currency="EUR", order_date=d(-180), status="COMMITTED")
o_elec1   = models.Order(package_id=pkg_elec.id,   po_number="PO-2024-0201", description="MV/LV Switchgear & Cabling",    vendor_name="Voltex Engineering", amount=1_200_000, currency="EUR", order_date=d(-200), status="COMMITTED")
o_proc1   = models.Order(package_id=pkg_proc.id,   po_number="PO-2024-0301", description="Reactor Vessels R-401/R-402",   vendor_name="ProcessGmbH",       amount=2_100_000, currency="EUR", order_date=d(-210), status="COMMITTED")
o_proc2   = models.Order(package_id=pkg_proc.id,   po_number="PO-2024-0302", description="Heat Exchangers & Pumps",       vendor_name="ProcessGmbH",       amount=850_000,   currency="EUR", order_date=d(-150), status="COMMITTED")
o_hvac1   = models.Order(package_id=pkg_hvac.id,   po_number="PO-2024-0401", description="AHU & Ductwork Supply",         vendor_name="KlimaTek BVBA",     amount=580_000,   currency="EUR", order_date=d(-160), status="COMMITTED")
o_auto1   = models.Order(package_id=pkg_auto.id,   po_number="PO-2024-0501", description="DCS System & Field Instruments", vendor_name="AutoSys Ltd",       amount=820_000,   currency="EUR", order_date=d(-190), status="COMMITTED")

for o in [o_civil1, o_civil2, o_elec1, o_proc1, o_proc2, o_hvac1, o_auto1]:
    db.add(o)
db.flush()

# Budget transfer (contingency added to process)
db.add(models.BudgetTransfer(
    type="TRANSFER", from_package_id=None, to_package_id=pkg_proc.id,
    amount=150_000, currency="EUR",
    description="Contingency allocation for reactor vessel delivery risk",
    transfer_date=d(-90),
))

# Invoices
invoices = [
    models.Invoice(order_id=o_civil1.id, package_id=pkg_civil.id,  invoice_number="INV-CIV-001", description="Mobilisation & Earthworks (30%)", amount=435_000, currency="EUR", invoice_date=d(-190), status="APPROVED", pmc_approved=True, client_approved=True, created_by_id=u_civil.id),
    models.Invoice(order_id=o_civil1.id, package_id=pkg_civil.id,  invoice_number="INV-CIV-002", description="Foundation Works (40%)",          amount=580_000, currency="EUR", invoice_date=d(-120), status="APPROVED", pmc_approved=True, client_approved=True, created_by_id=u_civil.id),
    models.Invoice(order_id=o_civil2.id, package_id=pkg_civil.id,  invoice_number="INV-CIV-003", description="Steel Erection Progress (50%)",   amount=490_000, currency="EUR", invoice_date=d(-60),  status="PENDING",  pmc_approved=False, client_approved=False, created_by_id=u_civil.id),
    models.Invoice(order_id=o_elec1.id,  package_id=pkg_elec.id,   invoice_number="INV-ELC-001", description="Switchgear Delivery (60%)",       amount=720_000, currency="EUR", invoice_date=d(-100), status="APPROVED", pmc_approved=True, client_approved=True, created_by_id=u_elec.id),
    models.Invoice(order_id=o_proc1.id,  package_id=pkg_proc.id,   invoice_number="INV-PRO-001", description="Reactor Vessels Advance (25%)",   amount=525_000, currency="EUR", invoice_date=d(-200), status="APPROVED", pmc_approved=True, client_approved=True, created_by_id=u_proc.id),
    models.Invoice(order_id=o_proc1.id,  package_id=pkg_proc.id,   invoice_number="INV-PRO-002", description="Reactor Vessels Delivery (50%)",  amount=1_050_000,currency="EUR",invoice_date=d(-80),  status="APPROVED", pmc_approved=True, client_approved=True, created_by_id=u_proc.id),
    models.Invoice(order_id=o_proc2.id,  package_id=pkg_proc.id,   invoice_number="INV-PRO-003", description="Heat Exchangers Supply (80%)",    amount=680_000, currency="EUR", invoice_date=d(-30),  status="PENDING",  pmc_approved=False, client_approved=False, created_by_id=u_proc.id),
]
for inv in invoices:
    db.add(inv)

db.commit()
print("✓ Budget: baselines, 7 orders, 1 transfer, 7 invoices")

# ─────────────────────────────────────────────────────────────────────────────
# 6. Meeting types & meetings
# ─────────────────────────────────────────────────────────────────────────────
mt_weekly = models.MeetingType(project_id=pid, name="Weekly Progress Meeting",
    description="Weekly internal progress coordination meeting")
mt_monthly = models.MeetingType(project_id=pid, name="Monthly Steering Committee",
    description="Monthly client steering committee with senior stakeholders")
mt_safety = models.MeetingType(project_id=pid, name="HSE Toolbox Meeting",
    description="Site safety and HSE coordination meeting")
for mt in [mt_weekly, mt_monthly, mt_safety]:
    db.add(mt)
db.flush()

# Default participants for meeting types
for c in [c_owner, c_pm, c_cost]:
    db.add(models.MeetingTypeParticipant(meeting_type_id=mt_weekly.id, contact_id=c.id))
for c in [c_owner, c_client_pm, c_client_eng, c_pm, c_cost]:
    db.add(models.MeetingTypeParticipant(meeting_type_id=mt_monthly.id, contact_id=c.id))
for c in [c_pm, c_hse, c_civil_pm]:
    db.add(models.MeetingTypeParticipant(meeting_type_id=mt_safety.id, contact_id=c.id))
db.flush()

def mk_meeting(title, mdate, mtype, status="COMPLETED"):
    m = models.Meeting(project_id=pid, title=title, date=mdate, time="09:00",
        location="PMC Site Office, Antwerp", meeting_type_id=mtype.id, status=status)
    db.add(m)
    db.flush()
    # Add participants
    for c in [c_owner, c_pm, c_cost, c_client_pm]:
        db.add(models.MeetingParticipant(meeting_id=m.id, contact_id=c.id, present=True))
    return m

m1 = mk_meeting("Progress Meeting W-12", d(-84), mt_weekly)
m2 = mk_meeting("Steering Committee — April", d(-60), mt_monthly)
m3 = mk_meeting("Progress Meeting W-20", d(-35), mt_weekly)
m4 = mk_meeting("Steering Committee — May", d(-14), mt_monthly)
m5 = mk_meeting("Progress Meeting W-24", d(7),  mt_weekly, status="PLANNED")

db.commit()
print("✓ 2 meeting types, 5 meetings created")

# ─────────────────────────────────────────────────────────────────────────────
# 7. Meeting points (action items & decisions)
# ─────────────────────────────────────────────────────────────────────────────
def mk_point(type_, topic, details, responsible, due_offset, status="IN_PROGRESS", closed=False):
    p = models.MeetingPoint(
        project_id=pid, type=type_, topic=topic, details=details,
        responsible_id=responsible.id,
        due_date=d(due_offset),
        status=status,
        closed_at=datetime.utcnow() if closed else None,
        source_module="Meeting Management",
    )
    db.add(p)
    db.flush()
    return p

ap1  = mk_point("ACTION",   "Submit revised IFC drawings for PKG-01 foundations",
    "CivilTec to resubmit corrected drawings following RFI-007 comments.",
    c_civil_pm, -7, "IN_PROGRESS")
ap2  = mk_point("ACTION",   "Resolve MV cable routing conflict near substation",
    "Voltex and CivilTec to coordinate cable tray routing by end of week.",
    c_elec_pm, 7, "NOT_STARTED")
ap3  = mk_point("ACTION",   "Confirm reactor delivery schedule with ProcessGmbH",
    "Procurement to chase updated FAT schedule from ProcessGmbH.",
    c_cost, 14, "NOT_STARTED")
ap4  = mk_point("DECISION", "Approved change in foundation pile specification",
    "Client approved use of bored piles instead of driven piles for Unit 400 foundations.",
    c_client_pm, -50, "CLOSED", closed=True)
ap5  = mk_point("ACTION",   "Prepare HSE incident report for near-miss event on 14/03",
    "HSE manager to complete and distribute incident report within 5 working days.",
    c_hse, -30, "CLOSED", closed=True)
ap6  = mk_point("ACTION",   "Update project schedule after 3-week steel delivery delay",
    "PM to update baseline schedule and communicate impact to steering committee.",
    c_pm, 21, "IN_PROGRESS")
ap7  = mk_point("INFO",     "HVAC equipment lead time extended to 20 weeks",
    "KlimaTek confirmed that AHU delivery is pushed to week 32 due to supply chain issues.",
    c_hvac_pm, -10, "NOT_STARTED")
ap8  = mk_point("ACTION",   "Review and approve Automation FAT procedure",
    "Client engineering team to review AutoSys FAT procedure document v1.2.",
    c_client_eng, 30, "NOT_STARTED")

db.flush()

# Link points to meetings
links = [
    (ap1, m3, False), (ap2, m3, False), (ap3, m4, False),
    (ap4, m2, False), (ap5, m1, False), (ap6, m4, False),
    (ap7, m4, False), (ap8, m5, True),
]
for point, meeting, prep in links:
    db.add(models.MeetingPointLink(meeting_point_id=point.id, meeting_id=meeting.id, for_preparation=prep))

# Add a note to action point 1
db.add(models.MeetingPointNote(
    meeting_point_id=ap1.id, meeting_id=m3.id,
    content="RFI-007 response received. CivilTec committed to revised submission by Friday.",
    created_by_id=u_pm.id,
))

db.commit()
print("✓ 8 meeting points with links and notes")

# ─────────────────────────────────────────────────────────────────────────────
# 8. Risks
# ─────────────────────────────────────────────────────────────────────────────
cat_commercial = db.query(models.RiskCategory).filter_by(project_id=pid, name="Commercial").first()
cat_supply     = db.query(models.RiskCategory).filter_by(project_id=pid, name="Supply Chain").first()
cat_safety     = db.query(models.RiskCategory).filter_by(project_id=pid, name="Safety").first()
cat_technical  = db.query(models.RiskCategory).filter_by(project_id=pid, name="Technical").first()
cat_scope      = db.query(models.RiskCategory).filter_by(project_id=pid, name="Scope").first()

phase_real = db.query(models.RiskPhase).filter_by(project_id=pid, name="Realization").first()
phase_prep = db.query(models.RiskPhase).filter_by(project_id=pid, name="Preparation").first()

def mk_risk(title, desc, cat, phase, prob_b, capex_b, sched_b, prob_a, capex_a, sched_a,
            capex_val, sched_val, mitigation, mit_action, status="OPEN", action_status="IN_PROGRESS"):
    r = models.Risk(
        project_id=pid, title=title, description=desc,
        status=status, category_id=cat.id if cat else None,
        phase_id=phase.id if phase else None,
        date_opened=d(-200), owner_id=c_pm.id,
        prob_score_before=prob_b, capex_score_before=capex_b, schedule_score_before=sched_b,
        capex_value=capex_val, schedule_value=sched_val,
        mitigation_type=mitigation, mitigation_action=mit_action,
        action_due_date=d(30), action_status=action_status,
        prob_score_after=prob_a, capex_score_after=capex_a, schedule_score_after=sched_a,
    )
    db.add(r)
    db.flush()
    return r

risk1 = mk_risk(
    "Steel price escalation exceeds contingency budget",
    "Global steel prices have risen 18% since contract award. Risk that PO value exceeds approved budget.",
    cat_commercial, phase_real, 3, 4, 2, 2, 3, 1,
    280_000, 0, "MITIGATE",
    "Negotiate fixed-price amendment with CivilTec. Monitor commodity index monthly.",
)
risk2 = mk_risk(
    "Reactor vessel delivery delay (FAT failure)",
    "ProcessGmbH first FAT attempt failed due to weld defects on R-401. Re-FAT scheduled in 6 weeks.",
    cat_supply, phase_real, 4, 3, 4, 3, 3, 3,
    0, 42, "MITIGATE",
    "Daily monitoring of repair progress. Evaluate parallel installation strategy for R-402.",
)
risk3 = mk_risk(
    "Excavation soil contamination — Unit 400 area",
    "Soil samples from excavation revealed hydrocarbon contamination above threshold. Regulatory notification required.",
    cat_safety, phase_real, 3, 3, 3, 2, 2, 2,
    120_000, 14, "MITIGATE",
    "Engage certified soil remediation contractor. Notify regional environmental authority within 5 days.",
    status="OPEN", action_status="IN_PROGRESS",
)
risk4 = mk_risk(
    "Automation FAT scope expansion requested by client",
    "Client engineering requested additional 47 test scenarios not included in original FAT procedure.",
    cat_scope, phase_real, 3, 2, 3, 2, 2, 2,
    75_000, 21, "ACCEPT",
    "Raise scope change request. Negotiate extension of FAT schedule with AutoSys.",
)
risk5 = mk_risk(
    "HVAC equipment delivery delayed (supply chain)",
    "AHU lead time extended from 14 to 20 weeks. Impact on HVAC commissioning path.",
    cat_supply, phase_real, 3, 1, 4, 2, 1, 3,
    0, 28, "MITIGATE",
    "Explore alternative supplier for secondary AHUs. Adjust commissioning sequence.",
)
risk6 = mk_risk(
    "Earthworks depth greater than assumed in design",
    "Geotechnical report confirmed rock layer 0.8m deeper than assumed. Piling equipment upgrade required.",
    cat_technical, phase_prep, 4, 3, 3, 4, 3, 3,
    185_000, 14, "MITIGATE",
    "Issued variation order to CivilTec. Geotechnical engineer engaged for additional investigation.",
    status="CLOSED", action_status="CLOSED",
)

# Add risk notes
db.add(models.RiskNote(
    risk_id=risk2.id, content="Re-FAT confirmed for 15 May. Vendor committed to completion.",
    created_by_id=u_pm.id,
))
db.add(models.RiskNote(
    risk_id=risk2.id, content="Re-FAT passed for R-401. R-402 FAT scheduled for 28 May.",
    created_by_id=u_pm.id,
))
db.add(models.RiskNote(
    risk_id=risk3.id, content="Environmental authority notified. Remediation contractor mobilising next week.",
    created_by_id=u_owner.id,
))

db.commit()
print("✓ 6 risks with notes")

# ─────────────────────────────────────────────────────────────────────────────
# 9. Scope Changes
# ─────────────────────────────────────────────────────────────────────────────
def mk_sc(desc, details, cost, sched, pkg, status, pmc_approved=None, pmc_comment=None,
           client_approved=None, client_comment=None):
    pmc_reviewed = pmc_approved is not None
    client_reviewed = client_approved is not None
    final_status = status

    sc = models.ScopeChange(
        project_id=pid, description=desc, details=details,
        cost=cost, schedule_impact_months=sched, package_id=pkg.id,
        created_by_id=u_owner.id, status=final_status,
        pmc_reviewed=pmc_reviewed, pmc_approved=pmc_approved, pmc_comment=pmc_comment,
        pmc_reviewed_at=datetime.utcnow() if pmc_reviewed else None,
        client_reviewed=client_reviewed, client_approved=client_approved, client_comment=client_comment,
        client_reviewed_at=datetime.utcnow() if client_reviewed else None,
        submitted_at=datetime.utcnow() if status not in ("DRAFT",) else None,
    )
    db.add(sc)
    db.flush()
    return sc

sc1 = mk_sc(
    "Foundation pile specification change",
    "Replace driven steel piles with bored concrete piles for Unit 400 foundations due to soil conditions "
    "identified in updated geotechnical survey. Scope change covers additional design, equipment mobilisation "
    "and extended piling works.",
    185_000, 0.5, pkg_civil, "APPROVED",
    pmc_approved=True, pmc_comment="Technically justified. Budget impact within contingency.",
    client_approved=True, client_comment="Approved. Please ensure schedule impact is minimised.",
)
sc2 = mk_sc(
    "Additional MV cable routing — substation area",
    "Routing conflict between MV cables and process pipework requires 380m of additional cable tray and "
    "rerouting of 4 MV cable runs. Required to maintain minimum separation distances per IEC 61936.",
    64_000, 0, pkg_elec, "APPROVED",
    pmc_approved=True, pmc_comment="Routing conflict confirmed on site. Cost reasonable.",
    client_approved=True, client_comment="Approved. Ensure as-built drawings are updated.",
)
sc3 = mk_sc(
    "Automation scope extension — additional FAT test scenarios",
    "Client requested 47 additional FAT test scenarios covering emergency shutdown sequences not in original "
    "automation scope. Includes AutoSys engineering, simulation environment setup and extended FAT duration.",
    75_000, 0.75, pkg_auto, "SUBMITTED",
    pmc_approved=True, pmc_comment="Scope extension is valid and priced fairly.",
)
sc4 = mk_sc(
    "HVAC supply air flow rate increase — cleanroom areas",
    "Process requirement update from client process engineering requires a 25% increase in supply air flow "
    "for the controlled atmosphere zones in Unit 400. Requires upsizing of 3 AHU units and associated ductwork.",
    92_000, 1.0, pkg_hvac, "DRAFT",
)

db.commit()
print("✓ 4 scope changes (2 approved, 1 submitted, 1 draft)")

# ─────────────────────────────────────────────────────────────────────────────
# 10. Schedule — Tasks
# ─────────────────────────────────────────────────────────────────────────────
def mk_task(pkg, desc, details, start_offset, finish_offset, weight=None):
    t = models.Task(
        project_id=pid, package_id=pkg.id,
        description=desc, details=details,
        start_date=d(start_offset), finish_date=d(finish_offset),
        financial_weight=weight,
    )
    db.add(t)
    db.flush()
    return t

# PKG-01 Civil
t_c1 = mk_task(pkg_civil, "Earthworks & Excavation",
    "Bulk earthwork, topsoil removal, and excavation to formation level for Unit 400 footprint. "
    "Includes export of approx. 8,500 m³ of material.",
    -240, -150, 310_000)
t_c2 = mk_task(pkg_civil, "Pile Foundation Works",
    "Installation of 142 bored concrete piles Ø600mm. Rock sockets required for 28 piles "
    "in northern section per updated geotech survey.",
    -160, -90, 420_000)
t_c3 = mk_task(pkg_civil, "Ground Floor Slab",
    "Reinforced concrete ground floor slab 450mm thick over pile cap and grade beam system.",
    -100, -40, 280_000)
t_c4 = mk_task(pkg_civil, "Structural Steel Erection",
    "Erection of main structural steel frame for Unit 400 process building. "
    "Approx. 680 tonnes structural steel.",
    -50, 60, 680_000)
t_c5 = mk_task(pkg_civil, "Roof & Cladding",
    "Installation of insulated roof panels, wall cladding, and rainwater drainage system.",
    50, 120, 180_000)

# PKG-02 Electrical
t_e1 = mk_task(pkg_elec, "MV/LV Switchgear Installation",
    "Supply and installation of new 11kV switchgear panel (4 feeders) and 400V MCC panels "
    "in new electrical room E-400.",
    -180, -80, 480_000)
t_e2 = mk_task(pkg_elec, "MV Cable Pulling & Termination",
    "Installation of 1,850m of 11kV XLPE cable including cable tray, pulling and termination "
    "at both ends. Includes additional routing per SC-002.",
    -90, 10, 380_000)
t_e3 = mk_task(pkg_elec, "LV Distribution & Field Wiring",
    "LV distribution from MCC panels to field equipment. Includes cable pulling, glanding "
    "and termination for approx. 320 field instruments and motors.",
    0, 90, 420_000)
t_e4 = mk_task(pkg_elec, "Electrical Testing & Commissioning",
    "High voltage testing, insulation resistance testing, and pre-commissioning of all "
    "electrical systems. Includes SAT with client.",
    80, 150, 270_000)

# PKG-03 Process Equipment
t_p1 = mk_task(pkg_proc, "Reactor Vessels R-401/R-402 Delivery & Setting",
    "Factory acceptance test, transport, cranage and setting on foundations of both "
    "reactor vessels. R-401: 85t, R-402: 72t.",
    -210, -60, 1_200_000)
t_p2 = mk_task(pkg_proc, "Heat Exchangers & Pumps Installation",
    "Supply, setting and mechanical completion of 6 shell & tube heat exchangers "
    "and 8 centrifugal process pumps.",
    -120, 30, 650_000)
t_p3 = mk_task(pkg_proc, "Process Piping Fabrication & Erection",
    "Fabrication and erection of approx. 4,200 dia-inches of process piping "
    "in alloy steel and stainless steel.",
    -80, 90, 1_100_000)
t_p4 = mk_task(pkg_proc, "Pressure Testing & Flushing",
    "Hydrostatic testing of all process piping systems, chemical flushing "
    "and reinstatement.",
    80, 130, 350_000)

# PKG-04 HVAC
t_h1 = mk_task(pkg_hvac, "AHU & Ductwork Supply",
    "Supply and delivery of 5 air handling units (AHU-401 to AHU-405) "
    "including all ductwork components and accessories.",
    -160, -20, 220_000)
t_h2 = mk_task(pkg_hvac, "HVAC Installation & Ductwork Erection",
    "Installation of AHUs on structural supports, ductwork erection and "
    "connection to distribution network. Includes fire dampers.",
    -10, 100, 260_000)
t_h3 = mk_task(pkg_hvac, "HVAC Commissioning & TAB",
    "Testing, adjusting and balancing of all HVAC systems. Air flow measurements "
    "and performance verification against design specification.",
    90, 140, 120_000)

# PKG-05 Automation
t_a1 = mk_task(pkg_auto, "DCS Engineering & Configuration",
    "Detailed DCS engineering, I/O list finalisation, control narrative review, "
    "and programming of PLC/DCS logic for Unit 400.",
    -190, -50, 280_000)
t_a2 = mk_task(pkg_auto, "Field Instrument Supply & Installation",
    "Supply and installation of 320 field instruments including transmitters, "
    "control valves, and safety instrumented system devices.",
    -60, 60, 360_000)
t_a3 = mk_task(pkg_auto, "Factory Acceptance Test (FAT)",
    "FAT of complete DCS/SIS system at AutoSys facility. Includes client witness. "
    "Extended scope per SC-003 (pending approval).",
    50, 110, 180_000)
t_a4 = mk_task(pkg_auto, "Site Integration & Commissioning",
    "Loop checking, functional testing, SIL verification and site integration "
    "of DCS/SIS with process systems.",
    100, 170, 220_000)

db.commit()
print("✓ 18 tasks created across 5 packages")

# ─────────────────────────────────────────────────────────────────────────────
# 11. Progress Reports
# ─────────────────────────────────────────────────────────────────────────────
def mk_pr(task, pct, note, status, submitted_offset=None,
          pmc_approved=None, pmc_comment=None,
          client_approved=None, client_comment=None,
          created_by=None):
    pmc_reviewed = pmc_approved is not None
    client_reviewed = client_approved is not None
    pr = models.ProgressReport(
        task_id=task.id, project_id=pid,
        percentage=pct, note=note, status=status,
        created_by_id=(created_by or u_civil).id,
        submitted_at=dt(submitted_offset) if submitted_offset is not None else None,
        pmc_reviewed=pmc_reviewed, pmc_approved=pmc_approved, pmc_comment=pmc_comment,
        pmc_reviewed_at=datetime.utcnow() if pmc_reviewed else None,
        client_reviewed=client_reviewed, client_approved=client_approved, client_comment=client_comment,
        client_reviewed_at=datetime.utcnow() if client_reviewed else None,
    )
    db.add(pr)
    db.flush()
    return pr

# PKG-01 Civil — earthworks complete, piling complete, slab complete, steel ongoing
mk_pr(t_c1, 100, "Earthworks and excavation 100% complete. Material exported.",
    "APPROVED", -150, True, "Confirmed complete.", True, "Accepted.", u_civil)
mk_pr(t_c2, 100, "All 142 piles completed including rock socket piles.",
    "APPROVED", -85, True, "Pile record sheets reviewed.", True, "Confirmed complete.", u_civil)
mk_pr(t_c3, 100, "Ground floor slab poured and cured. Ready for steel.",
    "APPROVED", -38, True, "Concrete test cubes passed.", True, "Accepted.", u_civil)
mk_pr(t_c4, 55, "Structural steel 55% erected. Columns and main beams complete. Secondary beams in progress.",
    "SUBMITTED", -10, True, "Progress confirmed on site visit.",
    created_by=u_civil)

# PKG-02 Electrical — switchgear done, MV cable in progress
mk_pr(t_e1, 100, "MV/LV switchgear installed and energised.",
    "APPROVED", -75, True, "FAT records reviewed.", True, "Energisation witnessed.", u_elec)
mk_pr(t_e2, 65, "MV cable pulling 65% complete. Rerouting per SC-002 incorporated.",
    "APPROVED", -15, True, "Reviewed cable records.", True, "Noted.", u_elec)

# PKG-03 Process — reactors delivered, HX in progress, piping started
mk_pr(t_p1, 100, "Both reactors set on foundations. Grouting complete.",
    "APPROVED", -55, True, "Setting records OK.", True, "Witnessed.", u_proc)
mk_pr(t_p2, 70, "4 of 6 heat exchangers set. Pump baseplates grouted.",
    "APPROVED", -12, True, "Progress acceptable.", True, "Accepted.", u_proc)
mk_pr(t_p3, 25, "Process piping 25% complete. Priority lines on reactors finished.",
    "SUBMITTED", -5,
    created_by=u_proc)

# PKG-04 HVAC — equipment arrived late, installation just starting
mk_pr(t_h1, 100, "All AHU units delivered to site and in temporary storage.",
    "APPROVED", -18, True, "Delivery notes checked.", True, "Confirmed.", u_cost)
mk_pr(t_h2, 10, "AHU-401 and AHU-402 lifted into position. Ductwork erection started.",
    "DRAFT", created_by=u_cost)

# PKG-05 Automation — DCS engineering done, instruments in progress, FAT not started
mk_pr(t_a1, 100, "DCS engineering complete. All logic reviewed with client.",
    "APPROVED", -45, True, "Engineering documents accepted.", True, "Approved.", u_pm)
mk_pr(t_a2, 40, "160 of 320 instruments installed and tagged.",
    "REJECTED", -20,
    pmc_approved=False, pmc_comment="Installation records incomplete. Resubmit with full punch list status.",
    created_by=u_pm)

db.commit()
print("✓ 13 progress reports (7 approved, 2 submitted, 1 draft, 1 rejected, 2 approved)")

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("DEMO DATA SEEDED SUCCESSFULLY")
print("=" * 60)
print(f"\nProject:  {project.project_number} — {project.description}")
print(f"Client:   {project.client}")
print(f"\nLogin credentials:")
print(f"  Project Owner:  s.laurent@pmc.be      / demo123")
print(f"  Team Member:    m.dubois@pmc.be        / demo123")
print(f"  Cost Control:   l.hoffman@pmc.be       / demo123")
print(f"  Client:         c.moreau@chemcorp.com  / demo123")
print(f"  Vendor (Civil): e.v@civiltec.be        / demo123")
print(f"  Vendor (Elec):  a.ferreira@voltex.eu   / demo123")
print(f"  Vendor (Proc):  k.werner@processgmbh.de/ demo123")
print(f"\nAdmin:          admin@ips.com           / admin123")
print()

db.close()
