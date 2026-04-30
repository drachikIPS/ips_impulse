"""
Admin Demo Seeder
=================
Creates project "OFFSHORE-2025-001" with rich data across every module.
The admin account (admin@ips.com) is wired as PMC Commercial Reviewer on all
packages, so it can approve invoices, progress reports and scope changes.

Usage:
    python seed_admin_demo.py

Safe to run once on a live database — creates a new project only.
"""

from datetime import datetime, date, timedelta
import database, models, auth

db = database.SessionLocal()

def d(offset: int) -> str:
    return (date.today() + timedelta(days=offset)).isoformat()

def dt(offset: int = 0) -> datetime:
    return datetime.utcnow() + timedelta(days=offset)

print("\n=== Admin Demo Seeder — OFFSHORE-2025-001 ===\n")

# ─────────────────────────────────────────────────────────────────────────────
# Guard: don't run twice
# ─────────────────────────────────────────────────────────────────────────────
if db.query(models.Project).filter_by(project_number="OFFSHORE-2025-001").first():
    print("Project OFFSHORE-2025-001 already exists. Aborting.")
    db.close()
    exit(0)

# ─────────────────────────────────────────────────────────────────────────────
# 1. Project
# ─────────────────────────────────────────────────────────────────────────────
project = models.Project(
    project_number="OFFSHORE-2025-001",
    description="Offshore Platform Topside Upgrade",
    client="NorthSea Energy NV",
    client_reference="NSE-PM-2025-07",
    general_description=(
        "Upgrade and life-extension of the Bravo-Alpha offshore platform in the North Sea. "
        "Scope includes replacement of the process compression train, new power generation module, "
        "structural strengthening of the main deck, new safety systems, and control room upgrade. "
        "Target mechanical completion: Q4 2026. Project value: €28M."
    ),
    start_date=d(-300),
    end_date=d(400),
    status="ACTIVE",
    location="North Sea, Block F/3-BA",
)
db.add(project)
db.commit()
db.refresh(project)
pid = project.id
print(f"[OK] Project created  ->> id={pid}")

# Seed per-project meta (subservices, risk setup, settings)
import seed_data as sd
sd.seed_subservices_for_project(pid, db)
sd.seed_risk_data_for_project(pid, db)
sd.seed_settings_for_project(pid, db)
print("[OK] Subservices / risk meta / settings seeded")

# ─────────────────────────────────────────────────────────────────────────────
# 2. Admin contact — link to admin user so approval workflows work
# ─────────────────────────────────────────────────────────────────────────────
admin_user = db.query(models.User).filter_by(email="admin@ips.com").first()
if not admin_user:
    print("ERROR: admin@ips.com not found. Run the server once first to seed it.")
    db.close()
    exit(1)

admin_contact = models.Contact(
    project_id=pid,
    name="IPS Administrator",
    email="admin@ips.com",
    company="Group IPS",
    function="PMC Commercial Director",
    phone="+32 2 555 00 01",
)
db.add(admin_contact)
db.flush()

# Link admin user to this contact so reviewer checks pass
admin_user.contact_id = admin_contact.id
db.flush()
print(f"[OK] Admin contact created and linked  (contact_id={admin_contact.id})")

# ─────────────────────────────────────────────────────────────────────────────
# 3. Contacts
# ─────────────────────────────────────────────────────────────────────────────
def mk_contact(**kw):
    c = models.Contact(project_id=pid, **kw)
    db.add(c); db.flush(); return c

# PMC Team
c_pm       = mk_contact(name="Thomas Claes",       email="t.claes@ips-group.be",      company="Group IPS",        function="Project Manager",        phone="+32 2 555 00 10")
c_cost     = mk_contact(name="Nathalie Berger",     email="n.berger@ips-group.be",     company="Group IPS",        function="Cost Controller",        phone="+32 2 555 00 11")
c_hse      = mk_contact(name="Dirk Smeets",         email="d.smeets@ips-group.be",     company="Group IPS",        function="HSE Coordinator",        phone="+32 2 555 00 12")
c_eng      = mk_contact(name="Isabelle Fontaine",   email="i.fontaine@ips-group.be",   company="Group IPS",        function="Lead Engineer",          phone="+32 2 555 00 13")

# Client
c_cli_pm   = mk_contact(name="Hans Bakker",         email="h.bakker@northsea.nl",      company="NorthSea Energy NV", function="Asset Owner",           phone="+31 10 600 10 20")
c_cli_eng  = mk_contact(name="Laura De Vries",      email="l.devries@northsea.nl",     company="NorthSea Energy NV", function="Technical Authority",   phone="+31 10 600 10 21")
c_cli_com  = mk_contact(name="Peter Jansen",        email="p.jansen@northsea.nl",      company="NorthSea Energy NV", function="Contracts Manager",     phone="+31 10 600 10 22")

# Vendors
c_mech_pm  = mk_contact(name="Gunnar Eriksen",      email="g.eriksen@nordicmech.no",   company="Nordic Mechanical AS", function="Site Manager",        phone="+47 22 400 30 10")
c_elec_pm  = mk_contact(name="Sofia Andersen",      email="s.andersen@offshore-e.dk",  company="Offshore Electro DK",  function="Electrical Lead",     phone="+45 33 200 40 50")
c_struc_pm = mk_contact(name="Marco Visser",         email="m.visser@steelworks.nl",    company="SteelWorks BV",        function="Structural Engineer", phone="+31 20 300 50 60")
c_inst_pm  = mk_contact(name="Yuki Tanaka",         email="y.tanaka@controlsys.jp",    company="ControlSys Japan",     function="Instrumentation Lead",phone="+81 3 500 60 70")

db.commit()
print("[OK] 12 contacts created (+ admin contact)")

# ─────────────────────────────────────────────────────────────────────────────
# 4. Users (linked to contacts)
# ─────────────────────────────────────────────────────────────────────────────
def mk_user(name, email, pw, role, contact):
    u = models.User(name=name, email=email, password_hash=auth.hash_password(pw),
                    role=role, contact_id=contact.id)
    db.add(u); db.flush()
    db.add(models.UserProject(user_id=u.id, project_id=pid, role=role))
    return u

# Assign admin to project as owner
if not db.query(models.UserProject).filter_by(user_id=admin_user.id, project_id=pid).first():
    db.add(models.UserProject(user_id=admin_user.id, project_id=pid, role="PROJECT_OWNER"))

u_pm     = mk_user("Thomas Claes",    "t.claes@ips-group.be",     "demo123", "PROJECT_TEAM",  c_pm)
u_cost   = mk_user("Nathalie Berger", "n.berger@ips-group.be",    "demo123", "PROJECT_TEAM",  c_cost)
u_client = mk_user("Hans Bakker",     "h.bakker@northsea.nl",     "demo123", "CLIENT",        c_cli_pm)
u_mech   = mk_user("Gunnar Eriksen",  "g.eriksen@nordicmech.no",  "demo123", "VENDOR",        c_mech_pm)
u_elec   = mk_user("Sofia Andersen",  "s.andersen@offshore-e.dk", "demo123", "VENDOR",        c_elec_pm)
u_inst   = mk_user("Yuki Tanaka",     "y.tanaka@controlsys.jp",   "demo123", "VENDOR",        c_inst_pm)

db.commit()
print("[OK] 6 users created  (all passwords: demo123)")
print("  Admin is assigned to project as PROJECT_OWNER and PMC Commercial Reviewer")

# ─────────────────────────────────────────────────────────────────────────────
# 5. Packages  — admin_contact as PMC commercial reviewer on ALL packages
# ─────────────────────────────────────────────────────────────────────────────
def mk_pkg(tag, name, company, owner_c, client_comm_c):
    p = models.Package(
        project_id=pid,
        tag_number=tag, name=name, company=company,
        package_owner_id=owner_c.id,
        pmc_technical_reviewer_id=c_eng.id,
        pmc_commercial_reviewer_id=admin_contact.id,   # ← admin reviews commercially
        client_technical_reviewer_id=c_cli_eng.id,
        client_commercial_reviewer_id=c_cli_com.id,
    )
    db.add(p); db.flush()
    db.add(models.PackageContact(package_id=p.id, contact_id=owner_c.id))
    return p

pkg_mech  = mk_pkg("PKG-MECH",  "Mechanical & Process Equipment",  "Nordic Mechanical AS", c_mech_pm,  c_cli_com)
pkg_elec  = mk_pkg("PKG-ELEC",  "Electrical & Power Systems",      "Offshore Electro DK",  c_elec_pm,  c_cli_com)
pkg_struc = mk_pkg("PKG-STRUC", "Structural Strengthening Works",  "SteelWorks BV",        c_struc_pm, c_cli_com)
pkg_inst  = mk_pkg("PKG-INST",  "Instrumentation & Control",       "ControlSys Japan",     c_inst_pm,  c_cli_com)

db.commit()
print("[OK] 4 packages — admin is PMC Commercial Reviewer on all")

# ─────────────────────────────────────────────────────────────────────────────
# 6. Budget — baselines, transfers, orders, invoices
# ─────────────────────────────────────────────────────────────────────────────
baselines = {
    pkg_mech.id:   9_500_000,
    pkg_elec.id:   5_200_000,
    pkg_struc.id:  7_800_000,
    pkg_inst.id:   3_100_000,
}
for pkg_id, amt in baselines.items():
    db.add(models.BudgetBaseline(package_id=pkg_id, amount=amt, currency="EUR"))
db.flush()

# Budget transfers
db.add(models.BudgetTransfer(
    type="TRANSFER", from_package_id=pkg_struc.id, to_package_id=pkg_mech.id,
    amount=300_000, currency="EUR",
    description="Contingency transfer: compressor procurement cost overrun",
    transfer_date=d(-90),
))
db.add(models.BudgetTransfer(
    type="TRANSFER", from_package_id=None, to_package_id=pkg_inst.id,
    amount=150_000, currency="EUR",
    description="Management reserve release for additional I/O points",
    transfer_date=d(-45),
))
db.flush()

# Orders
orders = [
    models.Order(package_id=pkg_mech.id,  po_number="PO-MECH-001", description="Compression Train Skid — Compressor C-101",       vendor_name="Nordic Mechanical AS", amount=4_200_000, currency="EUR", order_date=d(-250), status="COMMITTED"),
    models.Order(package_id=pkg_mech.id,  po_number="PO-MECH-002", description="Gas Cooler & Separator Vessels",                  vendor_name="Nordic Mechanical AS", amount=1_800_000, currency="EUR", order_date=d(-220), status="COMMITTED"),
    models.Order(package_id=pkg_mech.id,  po_number="PO-MECH-003", description="Piping Fabrication & Installation",               vendor_name="Nordic Mechanical AS", amount=2_100_000, currency="EUR", order_date=d(-180), status="COMMITTED"),
    models.Order(package_id=pkg_elec.id,  po_number="PO-ELEC-001", description="Diesel Generator Sets DG-201/202",                vendor_name="Offshore Electro DK",  amount=2_800_000, currency="EUR", order_date=d(-240), status="COMMITTED"),
    models.Order(package_id=pkg_elec.id,  po_number="PO-ELEC-002", description="HV/LV Switchgear & UPS Systems",                  vendor_name="Offshore Electro DK",  amount=1_600_000, currency="EUR", order_date=d(-200), status="COMMITTED"),
    models.Order(package_id=pkg_struc.id, po_number="PO-STRUC-001", description="Deck Plating Replacement — Main Deck Level A",    vendor_name="SteelWorks BV",        amount=3_500_000, currency="EUR", order_date=d(-260), status="COMMITTED"),
    models.Order(package_id=pkg_struc.id, po_number="PO-STRUC-002", description="Secondary Steel & Grating Works",               vendor_name="SteelWorks BV",        amount=1_900_000, currency="EUR", order_date=d(-210), status="COMMITTED"),
    models.Order(package_id=pkg_inst.id,  po_number="PO-INST-001", description="DCS Upgrade — Yokogawa CENTUM VP System",         vendor_name="ControlSys Japan",     amount=1_850_000, currency="EUR", order_date=d(-230), status="COMMITTED"),
    models.Order(package_id=pkg_inst.id,  po_number="PO-INST-002", description="Field Instruments & Analyser Package",             vendor_name="ControlSys Japan",     amount=850_000,  currency="EUR", order_date=d(-170), status="COMMITTED"),
]
for o in orders: db.add(o)
db.flush()

o_mech1, o_mech2, o_mech3, o_elec1, o_elec2, o_struc1, o_struc2, o_inst1, o_inst2 = orders

# Invoices — mix of APPROVED (history) and SUBMITTED (admin can review now)
invoices_data = [
    # Approved (history)
    dict(order_id=o_mech1.id,  package_id=pkg_mech.id,  invoice_number="INV-MECH-001", description="Compressor C-101 — Advance Payment 20%",        amount=840_000,  currency="EUR", invoice_date=d(-230), status="APPROVED",  pmc_approved=True,  client_approved=True,  created_by_id=u_mech.id),
    dict(order_id=o_mech1.id,  package_id=pkg_mech.id,  invoice_number="INV-MECH-002", description="Compressor C-101 — FAT Milestone 40%",           amount=1_680_000,currency="EUR", invoice_date=d(-130), status="APPROVED",  pmc_approved=True,  client_approved=True,  created_by_id=u_mech.id),
    dict(order_id=o_mech2.id,  package_id=pkg_mech.id,  invoice_number="INV-MECH-003", description="Gas Cooler Delivery",                            amount=1_440_000,currency="EUR", invoice_date=d(-100), status="APPROVED",  pmc_approved=True,  client_approved=True,  created_by_id=u_mech.id),
    dict(order_id=o_elec1.id,  package_id=pkg_elec.id,  invoice_number="INV-ELEC-001", description="DG-201 Delivery Milestone",                      amount=1_400_000,currency="EUR", invoice_date=d(-190), status="APPROVED",  pmc_approved=True,  client_approved=True,  created_by_id=u_elec.id),
    dict(order_id=o_elec2.id,  package_id=pkg_elec.id,  invoice_number="INV-ELEC-002", description="Switchgear Delivery",                            amount=960_000,  currency="EUR", invoice_date=d(-150), status="APPROVED",  pmc_approved=True,  client_approved=True,  created_by_id=u_elec.id),
    dict(order_id=o_struc1.id, package_id=pkg_struc.id, invoice_number="INV-STRUC-001", description="Deck Plating — Fabrication Progress 30%",         amount=1_050_000,currency="EUR", invoice_date=d(-210), status="APPROVED",  pmc_approved=True,  client_approved=True,  created_by_id=admin_user.id),
    dict(order_id=o_struc1.id, package_id=pkg_struc.id, invoice_number="INV-STRUC-002", description="Deck Plating — Delivery to Site 60%",             amount=2_100_000,currency="EUR", invoice_date=d(-110), status="APPROVED",  pmc_approved=True,  client_approved=True,  created_by_id=admin_user.id),
    dict(order_id=o_inst1.id,  package_id=pkg_inst.id,  invoice_number="INV-INST-001", description="DCS System — Hardware Delivery",                  amount=1_110_000,currency="EUR", invoice_date=d(-170), status="APPROVED",  pmc_approved=True,  client_approved=True,  created_by_id=u_inst.id),
    # Rejected example
    dict(order_id=o_mech3.id,  package_id=pkg_mech.id,  invoice_number="INV-MECH-004", description="Piping Works — Progress Claim (incorrect qty)",  amount=630_000,  currency="EUR", invoice_date=d(-70),  status="REJECTED",  pmc_approved=False, client_approved=None,  created_by_id=u_mech.id,
         review_comment="Quantities do not match site measurement report. Please resubmit with corrected bill of quantities."),
    # SUBMITTED — waiting for admin (PMC) review
    dict(order_id=o_mech3.id,  package_id=pkg_mech.id,  invoice_number="INV-MECH-005", description="Piping Works — Corrected Progress Claim (50%)",  amount=1_050_000,currency="EUR", invoice_date=d(-10),  status="SUBMITTED", pmc_approved=None,  client_approved=None,  created_by_id=u_mech.id),
    dict(order_id=o_elec1.id,  package_id=pkg_elec.id,  invoice_number="INV-ELEC-003", description="DG-202 Delivery & Hook-up Milestone",             amount=840_000,  currency="EUR", invoice_date=d(-5),   status="SUBMITTED", pmc_approved=None,  client_approved=None,  created_by_id=u_elec.id),
    dict(order_id=o_struc2.id, package_id=pkg_struc.id, invoice_number="INV-STRUC-003", description="Secondary Steel — Erection Progress 45%",         amount=855_000,  currency="EUR", invoice_date=d(-3),   status="SUBMITTED", pmc_approved=None,  client_approved=None,  created_by_id=admin_user.id),
    dict(order_id=o_inst2.id,  package_id=pkg_inst.id,  invoice_number="INV-INST-002", description="Field Instruments — Delivery Batch 1",            amount=510_000,  currency="EUR", invoice_date=d(-2),   status="SUBMITTED", pmc_approved=None,  client_approved=None,  created_by_id=u_inst.id),
]
for inv_d in invoices_data:
    db.add(models.Invoice(**inv_d))

db.commit()
print(f"[OK] Budget: 4 baselines, 2 transfers, {len(orders)} orders, {len(invoices_data)} invoices")
print("  ->> 4 invoices SUBMITTED and waiting for admin PMC review")

# ─────────────────────────────────────────────────────────────────────────────
# 7. Meeting types & meetings
# ─────────────────────────────────────────────────────────────────────────────
mt_pm    = models.MeetingType(project_id=pid, name="Weekly PM Meeting",      description="Weekly internal project management coordination")
mt_steer = models.MeetingType(project_id=pid, name="Steering Committee",     description="Monthly client steering with senior stakeholders")
mt_tech  = models.MeetingType(project_id=pid, name="Technical Review",       description="Engineering and technical coordination meeting")
mt_hse   = models.MeetingType(project_id=pid, name="HSE Toolbox Talk",       description="Weekly site safety briefing and toolbox talk")
for mt in [mt_pm, mt_steer, mt_tech, mt_hse]: db.add(mt)
db.flush()

for c in [admin_contact, c_pm, c_cost]:           db.add(models.MeetingTypeParticipant(meeting_type_id=mt_pm.id,    contact_id=c.id))
for c in [admin_contact, c_cli_pm, c_pm, c_cost]: db.add(models.MeetingTypeParticipant(meeting_type_id=mt_steer.id, contact_id=c.id))
for c in [c_pm, c_eng, c_cli_eng]:                db.add(models.MeetingTypeParticipant(meeting_type_id=mt_tech.id,  contact_id=c.id))
for c in [c_pm, c_hse]:                            db.add(models.MeetingTypeParticipant(meeting_type_id=mt_hse.id,   contact_id=c.id))
db.flush()

def mk_meeting(title, offset, mtype, status="COMPLETED"):
    m = models.Meeting(project_id=pid, title=title, date=d(offset), time="10:00",
                       location="NorthSea Energy Office, Rotterdam", meeting_type_id=mtype.id, status=status)
    db.add(m); db.flush()
    for c in [admin_contact, c_pm, c_cost, c_cli_pm]:
        db.add(models.MeetingParticipant(meeting_id=m.id, contact_id=c.id, present=True))
    db.add(models.MeetingParticipant(meeting_id=m.id, contact_id=c_cli_eng.id, present=False))
    return m

m1 = mk_meeting("PM Meeting W-03",              -180, mt_pm)
m2 = mk_meeting("Steering Committee — January", -150, mt_steer)
m3 = mk_meeting("Technical Review — Compression Train", -120, mt_tech)
m4 = mk_meeting("PM Meeting W-15",              -90,  mt_pm)
m5 = mk_meeting("Steering Committee — March",   -60,  mt_steer)
m6 = mk_meeting("PM Meeting W-22",              -35,  mt_pm)
m7 = mk_meeting("Technical Review — DCS Architecture",  -20, mt_tech)
m8 = mk_meeting("Steering Committee — May",     -7,   mt_steer)
m9 = mk_meeting("PM Meeting W-28",               7,   mt_pm,    status="PLANNED")
m10= mk_meeting("Steering Committee — June",    21,   mt_steer, status="PLANNED")

db.commit()
print("[OK] 4 meeting types, 10 meetings created")

# ─────────────────────────────────────────────────────────────────────────────
# 8. Meeting points
# ─────────────────────────────────────────────────────────────────────────────
def mk_point(type_, topic, details, responsible, due_offset, status="IN_PROGRESS", closed=False, meeting=None, prep=False):
    p = models.MeetingPoint(
        project_id=pid, type=type_, topic=topic, details=details,
        responsible_id=responsible.id, due_date=d(due_offset),
        status=status, source_module="Meeting Management",
        closed_at=datetime.utcnow() if closed else None,
    )
    db.add(p); db.flush()
    if meeting:
        db.add(models.MeetingPointLink(meeting_point_id=p.id, meeting_id=meeting.id, for_preparation=prep))
    return p

ap1  = mk_point("ACTION",   "Submit revised HAZop action close-out report",
    "Nordic Mechanical to provide written confirmation of all HAZop action items closed. Required before pre-commissioning.",
    c_mech_pm, 14, "IN_PROGRESS", meeting=m8)
ap2  = mk_point("ACTION",   "Confirm DG-202 commissioning schedule",
    "Offshore Electro to confirm final commissioning window and crew mobilisation dates for DG-202.",
    c_elec_pm, 21, "NOT_STARTED", meeting=m8)
ap3  = mk_point("ACTION",   "Issue ITT for marine spread (hook-up campaign)",
    "Procurement to issue Invitation to Tender for marine vessel and dive support for hook-up campaign.",
    c_cost, 30, "NOT_STARTED", meeting=m6)
ap4  = mk_point("ACTION",   "Resolve cable routing conflict at junction box JB-4102",
    "Electrical and instrumentation teams to resolve routing conflict. Revised cable schedule required.",
    c_inst_pm, 7, "IN_PROGRESS", meeting=m7)
ap5  = mk_point("DECISION", "Approved use of composite material for deck grating replacement",
    "Client technical authority approved substitution of carbon steel grating with composite FRP grating "
    "for zones with high corrosion exposure. Saves 3 weeks on coating schedule.",
    c_cli_eng, -50, "CLOSED", closed=True, meeting=m5)
ap6  = mk_point("DECISION", "Confirmed vendor: ControlSys Japan for DCS upgrade",
    "Steering committee approved ControlSys Japan as DCS vendor following bid evaluation. "
    "Contract value €1.85M. Contract award: " + d(-170) + ".",
    admin_contact, -150, "CLOSED", closed=True, meeting=m2)
ap7  = mk_point("ACTION",   "Prepare updated project schedule (baseline rev 3)",
    "PM to issue baseline revision 3 incorporating confirmed delivery dates from all vendors.",
    c_pm, -10, "CLOSED", closed=True, meeting=m6)
ap8  = mk_point("INFO",     "Compressor lead time confirmed at 22 weeks from FAT",
    "Nordic Mechanical confirmed compressor C-101 delivery will be 22 weeks from FAT completion. "
    "FAT scheduled weeks 28-29. Delivery expected week 51.",
    c_mech_pm, -30, "NOT_STARTED", meeting=m5)
ap9  = mk_point("ACTION",   "Submit ITP (Inspection and Test Plan) for structural works",
    "SteelWorks BV to submit ITP document for review by IPS and client technical team.",
    c_struc_pm, 10, "IN_PROGRESS", meeting=m7)
ap10 = mk_point("ACTION",   "Update risk register following HAZop session",
    "IPS to update risk register with new items identified during HAZop session on compression train.",
    admin_contact, 5, "NOT_STARTED", meeting=m9, prep=True)
ap11 = mk_point("ACTION",   "Verify weight & CoG calculations for new module",
    "Structural engineer to verify weight and centre of gravity calculations for new power generation module.",
    c_eng, 14, "IN_PROGRESS", meeting=m7)
ap12 = mk_point("DECISION", "Approved revised marine spread scope",
    "Client approved inclusion of ROV support vessel in marine spread for pre-commissioning inspection.",
    c_cli_pm, -20, "CLOSED", closed=True, meeting=m8)

# Notes on some points
db.add(models.MeetingPointNote(meeting_point_id=ap1.id,  meeting_id=m8.id,
    content="Nordic Mechanical confirmed HAZop close-out report will be issued by " + d(7) + ".",
    created_by_id=u_pm.id))
db.add(models.MeetingPointNote(meeting_point_id=ap4.id,  meeting_id=m7.id,
    content="IPS engineering reviewed conflict. Solution agreed: reroute cable run 4102-C via cable tray CT-N12.",
    created_by_id=admin_user.id))
db.add(models.MeetingPointNote(meeting_point_id=ap9.id,  meeting_id=m7.id,
    content="SteelWorks submitted ITP draft v1.0. Under review by IPS lead engineer.",
    created_by_id=u_pm.id))

db.commit()
print("[OK] 12 meeting points with links and notes")

# ─────────────────────────────────────────────────────────────────────────────
# 9. Risks
# ─────────────────────────────────────────────────────────────────────────────
def get_cat(name): return db.query(models.RiskCategory).filter_by(project_id=pid, name=name).first()
def get_phase(name): return db.query(models.RiskPhase).filter_by(project_id=pid, name=name).first()

def mk_risk(title, desc, cat_name, phase_name, pb, cb, sb, pa, ca, sa,
            capex_val, sched_val, mit_type, mit_action, status="OPEN", act_status="IN_PROGRESS"):
    cat   = get_cat(cat_name)
    phase = get_phase(phase_name)
    r = models.Risk(
        project_id=pid, title=title, description=desc, status=status,
        category_id=cat.id if cat else None, phase_id=phase.id if phase else None,
        date_opened=d(-280), owner_id=admin_contact.id,
        prob_score_before=pb, capex_score_before=cb, schedule_score_before=sb,
        capex_value=capex_val, schedule_value=sched_val,
        mitigation_type=mit_type, mitigation_action=mit_action,
        action_due_date=d(30), action_status=act_status,
        prob_score_after=pa, capex_score_after=ca, schedule_score_after=sa,
    )
    db.add(r); db.flush(); return r

r1 = mk_risk(
    "Compressor C-101 offshore installation weather window",
    "Critical lift of compressor C-101 (82 tonnes) requires a minimum 3-day weather window. "
    "North Sea autumn forecast indicates limited windows in Q4. Risk of 4-6 week delay.",
    "Schedule", "Realization", 3, 1, 4, 2, 1, 3,
    0, 35, "MITIGATE",
    "Identify primary and secondary lift windows. Engage marine warranty surveyor. "
    "Pre-position crane vessel 2 weeks early to capture any early window.",
)
r2 = mk_risk(
    "DCS integration testing scope underestimated",
    "Detailed FAT planning has revealed the integration test matrix between DCS and existing legacy ESD "
    "system is 40% larger than originally scoped. Risk of 3-4 week FAT overrun.",
    "Technical", "Realization", 3, 2, 3, 2, 2, 2,
    0, 21, "MITIGATE",
    "Engage ControlSys Japan for additional test engineering support. "
    "Parallel test stream where feasible. Negotiate with client for extended FAT campaign.",
)
r3 = mk_risk(
    "Structural corrosion discovered under grating panel D4-G22",
    "Inspection during preparatory works revealed hidden corrosion on deck plate area approx. 12m². "
    "Extent of corrosion not yet fully assessed. Risk of significant additional scope.",
    "Technical", "Realization", 4, 4, 3, 3, 3, 2,
    480_000, 28, "MITIGATE",
    "Complete detailed NDT survey of affected zone. Issue variation order to SteelWorks BV. "
    "Notify client and update insurance risk register.",
)
r4 = mk_risk(
    "Compressor driver shaft material non-conformance",
    "Factory inspection identified potential material certificate discrepancy on shaft forgings. "
    "Vendor has initiated NCR process. Risk of re-manufacturing lead time of 8 weeks.",
    "Supply Chain", "Realization", 3, 2, 4, 2, 2, 3,
    0, 56, "MITIGATE",
    "IPS QA to witness additional destructive testing on sample shafts. "
    "Investigate alternative forging supplier as contingency.",
)
r5 = mk_risk(
    "Marine spread dayrate cost escalation",
    "Global offshore vessel market tightening. Current market dayrates 22% above budget assumption. "
    "Risk that hook-up campaign cost exceeds approved budget by €600k-900k.",
    "Commercial", "Realization", 4, 3, 1, 3, 3, 1,
    650_000, 0, "MITIGATE",
    "Lock in vessel contract at current market rates. Explore frame agreement with two operators. "
    "Evaluate scope optimisation to reduce vessel days.",
)
r6 = mk_risk(
    "Regulatory approval delay — modified safety case",
    "Modification of compression train requires update to platform safety case. "
    "Norwegian PSA review timeline uncertain. Potential 6-10 week approval delay.",
    "Regulatory", "Preparation", 3, 1, 4, 2, 1, 3,
    0, 56, "MITIGATE",
    "Early engagement with PSA through pre-application meeting. "
    "Appoint specialist safety case consultant. Submit application 8 weeks ahead of schedule.",
)
r7 = mk_risk(
    "Subsea riser inspection — additional findings",
    "Planned riser inspection campaign may identify corrosion or damage requiring unplanned repair. "
    "Risk of extending offshore campaign duration.",
    "Technical", "Preparation", 2, 3, 3, 2, 2, 2,
    250_000, 14, "ACCEPT",
    "Include provisional sum in contract for riser repairs. "
    "Schedule inspection campaign early in offshore window.",
)
r8 = mk_risk(
    "Key IPS personnel unavailability (site manager)",
    "IPS site manager has confirmed leave request during critical commissioning period (weeks 38-42). "
    "Risk of insufficient experienced supervision during pre-commissioning.",
    "Resource", "Realization", 2, 1, 2, 1, 1, 1,
    0, 14, "MITIGATE",
    "Identify and brief deputy site manager. Arrange overlap handover period of minimum 1 week.",
    status="CLOSED", act_status="CLOSED",
)

# Risk notes
db.add(models.RiskNote(risk_id=r3.id,
    content="NDT survey complete. Affected area confirmed at 18m². Variation order VO-STRUC-003 raised.",
    created_by_id=admin_user.id))
db.add(models.RiskNote(risk_id=r3.id,
    content="Client approved variation. SteelWorks BV mobilising additional crew for repair works.",
    created_by_id=u_pm.id))
db.add(models.RiskNote(risk_id=r4.id,
    content="Additional testing passed. NCR closed. Shaft forgings accepted by IPS QA.",
    created_by_id=admin_user.id))
db.add(models.RiskNote(risk_id=r1.id,
    content="Marine warranty surveyor (MWS) engaged. Provisional lift window identified: week 42.",
    created_by_id=u_pm.id))

db.commit()
print("[OK] 8 risks with notes")

# ─────────────────────────────────────────────────────────────────────────────
# 10. Scope Changes
# ─────────────────────────────────────────────────────────────────────────────
def mk_sc(desc, details, cost, sched, pkg, status,
          pmc_ok=None, pmc_note=None, cli_ok=None, cli_note=None):
    sc = models.ScopeChange(
        project_id=pid, description=desc, details=details,
        cost=cost, schedule_impact_months=sched, package_id=pkg.id,
        created_by_id=admin_user.id, status=status,
        submitted_at=dt(-30) if status != "DRAFT" else None,
        pmc_reviewed=pmc_ok is not None,
        pmc_approved=pmc_ok, pmc_comment=pmc_note,
        pmc_reviewed_at=dt(-20) if pmc_ok is not None else None,
        client_reviewed=cli_ok is not None,
        client_approved=cli_ok, client_comment=cli_note,
        client_reviewed_at=dt(-10) if cli_ok is not None else None,
    )
    db.add(sc); db.flush(); return sc

mk_sc("Hidden corrosion repair — deck area D4-G22",
    "Additional structural steel repair works following NDT survey findings on deck plate area D4-G22. "
    "Scope includes removal of deteriorated plating (18m²), structural repair, NDT re-inspection and coating.",
    480_000, 0.75, pkg_struc, "APPROVED",
    pmc_ok=True,  pmc_note="Scope technically necessary. Cost validated against market rates. Approved.",
    cli_ok=True,  cli_note="Approved. Priority repair. Ensure coating spec matches original qualification.")

mk_sc("DCS additional I/O points — process modifications",
    "Client process engineering requested addition of 48 analog I/O points for new process monitoring "
    "instrumentation added to the compression train design during FEED update. "
    "Includes DCS cabinet extension, marshalling, and engineering.",
    168_000, 0.5, pkg_inst, "APPROVED",
    pmc_ok=True,  pmc_note="I/O count confirmed by IPS engineering. Price benchmarked — reasonable.",
    cli_ok=True,  cli_note="Approved. Please ensure FAT scope includes new points.")

mk_sc("Compressor C-101 — extended offshore pre-commissioning support",
    "Nordic Mechanical vendor representative support required for 4 additional weeks during offshore "
    "pre-commissioning and commissioning phase, following revised commissioning sequence agreed with client. "
    "Includes travel, accommodation and technical support.",
    95_000, 0, pkg_mech, "SUBMITTED",
    pmc_ok=True,  pmc_note="Duration and rates verified against contract. Justified by revised commissioning plan.")
    # Client review still pending — admin (as PMC) already approved; client needs to review

mk_sc("Electrical — additional Ex-rated lighting in Zone 1 areas",
    "Safety review identified requirement for 14 additional Ex-rated light fittings in newly reclassified "
    "Zone 1 areas following ATEX reclassification study update. Includes supply, installation and certification.",
    62_000, 0, pkg_elec, "SUBMITTED")
    # Both PMC and client reviews pending — admin can approve as PMC reviewer

mk_sc("HVAC ventilation upgrade — control room positive pressure increase",
    "Updated dispersion study requires increase of control room positive pressure from 25 Pa to 50 Pa. "
    "Requires upsizing of two HVAC supply fans and addition of pressure relief dampers.",
    44_000, 0.25, pkg_elec, "DRAFT")

db.commit()
print("[OK] 5 scope changes (2 approved, 2 submitted pending review, 1 draft)")
print("  ->> Admin can review SC-003 (as PMC) and SC-004 (as PMC)")

# ─────────────────────────────────────────────────────────────────────────────
# 11. Schedule — Tasks with financial weights
# ─────────────────────────────────────────────────────────────────────────────
def mk_task(pkg, desc, details, s, f, weight):
    t = models.Task(project_id=pid, package_id=pkg.id, description=desc, details=details,
                    start_date=d(s), finish_date=d(f), financial_weight=weight)
    db.add(t); db.flush(); return t

# PKG-MECH  (total weight ~9.8M)
t_m1 = mk_task(pkg_mech, "Compressor C-101 — Engineering & Procurement",
    "Detail engineering, requisition, bid evaluation and purchase order for compression train C-101 "
    "including driver, cooler and scrubber. FEED basis.",
    -290, -220, 900_000)
t_m2 = mk_task(pkg_mech, "Compressor C-101 — Manufacturing & FAT",
    "Vendor manufacturing surveillance, factory acceptance test (FAT) at Nordic Mechanical workshop.",
    -220, -80, 1_800_000)
t_m3 = mk_task(pkg_mech, "Gas Cooler & Separator — Supply & Delivery",
    "Supply of gas cooler E-101 and inlet separator V-101. Includes vendor inspection and shipping.",
    -200, -90, 1_600_000)
t_m4 = mk_task(pkg_mech, "Piping Fabrication & Spool Delivery",
    "Offshore-grade piping fabrication: approx. 480 spools in CS, DSS and SS. ASME B31.3 compliance.",
    -160, -30, 2_100_000)
t_m5 = mk_task(pkg_mech, "Offshore Mechanical Installation & Hook-up",
    "Offshore installation of compression train, gas cooler, separator and all associated piping, "
    "including hook-up to existing topsides pipework. Critical path activity.",
    -30, 120, 2_400_000)
t_m6 = mk_task(pkg_mech, "Mechanical Completion & Pre-commissioning",
    "Flushing, pressure testing, leak testing, and mechanical completion documentation.",
    110, 160, 1_000_000)

# PKG-ELEC (total weight ~5.2M)
t_e1 = mk_task(pkg_elec, "Power Generation — Engineering & Procurement",
    "Detail engineering and procurement of DG-201 and DG-202 diesel generator sets (2 × 3.5 MVA).",
    -270, -190, 800_000)
t_e2 = mk_task(pkg_elec, "DG Sets — Manufacturing & Factory Test",
    "Generator set manufacturing, factory test and third-party inspection at Offshore Electro DK.",
    -190, -80, 1_400_000)
t_e3 = mk_task(pkg_elec, "HV/LV Switchgear — Supply & Installation",
    "Supply and offshore installation of new 11kV and 400V switchgear, UPS, and battery chargers.",
    -140, 20, 1_600_000)
t_e4 = mk_task(pkg_elec, "Cable Installation & Termination",
    "Installation of HV/LV power and control cables. Approx. 4,200m cable across 6 decks.",
    -60, 100, 900_000)
t_e5 = mk_task(pkg_elec, "Electrical Testing & Commissioning",
    "Insulation resistance tests, functional checks, load tests and commissioning of all electrical systems.",
    90, 160, 500_000)

# PKG-STRUC (total weight ~7.5M)
t_s1 = mk_task(pkg_struc, "Structural Engineering & Drawings",
    "Detail design of deck strengthening, new module supports and structural modifications. "
    "Includes weight and CoG report, primary steel connection design.",
    -280, -200, 600_000)
t_s2 = mk_task(pkg_struc, "Deck Plating Replacement — Fabrication",
    "Offshore-grade deck plating fabrication: 380m² of 12mm and 16mm carbon steel. Surface prep and primer.",
    -220, -110, 2_500_000)
t_s3 = mk_task(pkg_struc, "Structural Steelwork — Offshore Installation",
    "Offshore installation of new deck plating, primary steel and secondary steel. "
    "Includes demolition of existing corroded sections.",
    -100, 60, 2_800_000)
t_s4 = mk_task(pkg_struc, "Coating & Corrosion Protection",
    "Application of NORSOK M-501 compliant coating system on all new and repaired structural steel.",
    40, 130, 1_200_000)
t_s5 = mk_task(pkg_struc, "Structural Inspection & Mechanical Completion",
    "Final structural inspection, NDT survey, dimensional check and mechanical completion record.",
    120, 160, 400_000)

# PKG-INST (total weight ~3.25M)
t_i1 = mk_task(pkg_inst, "DCS Engineering & Configuration",
    "Detail DCS engineering: I/O list, cause & effect, loop diagrams, configuration and programming.",
    -250, -140, 700_000)
t_i2 = mk_task(pkg_inst, "DCS Hardware Delivery & Factory Acceptance Test",
    "DCS cabinet delivery from ControlSys Japan. Factory acceptance test (FAT) at vendor facility.",
    -160, -80, 600_000)
t_i3 = mk_task(pkg_inst, "Field Instruments — Supply & Calibration",
    "Supply, calibration certificate and packaging of all field instruments: ~320 tags including "
    "pressure, temperature, flow and level instruments.",
    -140, -40, 750_000)
t_i4 = mk_task(pkg_inst, "DCS & Instrument Offshore Installation",
    "Offshore installation of DCS cabinets, marshalling racks and all field instruments. "
    "Loop checking and pre-commissioning of all I&C systems.",
    -30, 110, 850_000)
t_i5 = mk_task(pkg_inst, "System Integration Test & Commissioning",
    "DCS/ESD integration testing, cause & effect testing, and functional safety verification (SIL).",
    100, 160, 350_000)

db.commit()
print("[OK] 21 tasks with financial weights across 4 packages")

# ─────────────────────────────────────────────────────────────────────────────
# 12. Progress Reports — Approved (EV data) + Submitted (admin can review)
# ─────────────────────────────────────────────────────────────────────────────
def mk_pr(task, pct, note, created_by, submit_offset, status="APPROVED",
          pmc_ok=True, cli_ok=True):
    pr = models.ProgressReport(
        task_id=task.id, project_id=pid,
        percentage=pct, note=note,
        created_by_id=created_by.id, status=status,
        submitted_at=dt(submit_offset),
        pmc_reviewed=pmc_ok is not None,  pmc_approved=pmc_ok,
        pmc_comment="Progress confirmed on site." if pmc_ok else None,
        pmc_reviewed_at=dt(submit_offset + 3) if pmc_ok is not None else None,
        client_reviewed=cli_ok is not None, client_approved=cli_ok,
        client_comment="Accepted." if cli_ok else None,
        client_reviewed_at=dt(submit_offset + 5) if cli_ok is not None else None,
    )
    db.add(pr); db.flush(); return pr

def mk_pr_submitted(task, pct, note, created_by, submit_offset):
    """PR submitted — awaiting PMC (admin) and client review."""
    pr = models.ProgressReport(
        task_id=task.id, project_id=pid,
        percentage=pct, note=note,
        created_by_id=created_by.id, status="SUBMITTED",
        submitted_at=dt(submit_offset),
        pmc_reviewed=False, pmc_approved=None,
        client_reviewed=False, client_approved=None,
    )
    db.add(pr); db.flush(); return pr

# PKG-MECH — approved history + one submitted
mk_pr(t_m1, 100, "Engineering complete. PO awarded to Nordic Mechanical AS.",          admin_user, -210)
mk_pr(t_m2, 100, "FAT completed successfully. Compressor C-101 accepted.",             u_mech,     -75)
mk_pr(t_m3, 100, "Gas cooler and separator delivered to marshalling yard.",             u_mech,     -80)
mk_pr(t_m4, 85,  "Piping fabrication 85% complete. Final spool batch in progress.",    u_mech,     -25)
mk_pr(t_m5, 25,  "Offshore campaign commenced. C-101 module set on deck.",             u_mech,     -10)
mk_pr_submitted(t_m5, 40, "Piping hook-up 40% complete. On programme.",                u_mech,     -2)

# PKG-ELEC — approved history + one submitted
mk_pr(t_e1, 100, "Procurement complete. Both DG sets on order.",                       u_elec,     -180)
mk_pr(t_e2, 100, "DG-201 and DG-202 factory tested and released for shipment.",        u_elec,     -70)
mk_pr(t_e3, 75,  "Switchgear installed. LV distribution 75% complete.",                u_elec,     -15)
mk_pr_submitted(t_e3, 90, "HV/LV installation 90% complete. Final connections pending.", u_elec,  -3)

# PKG-STRUC — approved history + one submitted
mk_pr(t_s1, 100, "Structural design package issued for construction. AFC drawings complete.", admin_user, -190)
mk_pr(t_s2, 100, "All structural fabrication complete. Shipped to site.",              admin_user, -100)
mk_pr(t_s3, 65,  "Deck installation 65% complete. Main structural frame erected.",    admin_user, -20)
mk_pr_submitted(t_s3, 80, "Deck plating 80% installed. Secondary steel in progress.", admin_user, -4)

# PKG-INST — approved history + one submitted
mk_pr(t_i1, 100, "DCS engineering complete. Configuration delivered to site.",         u_inst,     -130)
mk_pr(t_i2, 100, "DCS FAT passed. Hardware shipped and received on platform.",         u_inst,     -65)
mk_pr(t_i3, 100, "All field instruments delivered and calibration certs received.",    u_inst,     -35)
mk_pr(t_i4, 30,  "Offshore instrument installation 30% complete.",                    u_inst,     -8)
mk_pr_submitted(t_i4, 45, "DCS cabinets installed. Field instrument loop checks 45% complete.", u_inst, -1)

db.commit()
print("[OK] Progress reports: ~18 APPROVED (EV history), 4 SUBMITTED awaiting admin review")
print("  ->> Admin can approve PRs for: PKG-MECH t_m5, PKG-ELEC t_e3, PKG-STRUC t_s3, PKG-INST t_i4")

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────
db.close()
print("""
==================================================================
  OFFSHORE-2025-001 seeded successfully!                         
                                                                  
  Login:  admin@ips.com  /  admin123                              
  Select project: OFFSHORE-2025-001                               
                                                                  
  As admin you can review and approve:                            
  • Budget ->> Invoices ->> Pending Review (4 invoices)              
  • Schedule ->> Progress Reporting ->> Pending Reviews (4 PRs)      
  • Scope Changes ->> Pending Reviews (SC-003, SC-004)              
==================================================================
""")
