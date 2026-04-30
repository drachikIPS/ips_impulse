# ─────────────────────────────────────────────────────────────────────────────
# Shared seed data — imported by main.py (initial DB seed) and
# routers/projects.py (seed new projects on creation).
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_SUBSERVICES = [
    ("SC", "STRATEGIC CONSULTING", "03D", "Strategic Business Advisory"),
    ("SC", "STRATEGIC CONSULTING", "03F", "Masterplan"),
    ("SC", "STRATEGIC CONSULTING", "03A", "Investment Decision Services"),
    ("SC", "STRATEGIC CONSULTING", "03B", "Transaction Services"),
    ("SC", "STRATEGIC CONSULTING", "03C", "Operations Services"),
    ("SC", "STRATEGIC CONSULTING", "03E", "Auditing - and Identification Services"),
    ("DC", "DIGITAL CONSULTING", "03G", "Management & Optimization"),
    ("DC", "DIGITAL CONSULTING", "03G", "IT Strategy"),
    ("DC", "DIGITAL CONSULTING", "03G", "Implementation"),
    ("DC", "DIGITAL CONSULTING", "03G", "Transformation"),
    ("SCO", "SUPPLY CHAIN & OPERATIONS", "04A", "Supply Chain"),
    ("SCO", "SUPPLY CHAIN & OPERATIONS", "04B", "Intralogistics & Operations"),
    ("SPE", "PROCESS & ENVIRONMENT", "04C", "Process Innovation"),
    ("SPE", "PROCESS & ENVIRONMENT", "04D", "Environmental Innovation"),
    ("IM", "INNOVATION MANAGEMENT", "04E", "Innovation Methodology"),
    ("IM", "INNOVATION MANAGEMENT", "04F", "Technology Readiness Levels"),
    ("PM", "PROJECT MANAGEMENT", "01", "Organization"),
    ("PM", "PROJECT MANAGEMENT", "05", "Project Coordination"),
    ("PM", "PROJECT MANAGEMENT", "05", "Project Piloting"),
    ("PM", "PROJECT MANAGEMENT", "05", "Project Definition"),
    ("PM", "PROJECT MANAGEMENT", "05", "Project Risk Management"),
    ("PM", "PROJECT MANAGEMENT", "05", "Package Management"),
    ("PM", "PROJECT MANAGEMENT", "05", "Time Schedule Management"),
    ("PM", "PROJECT MANAGEMENT", "05", "Cost Management"),
    ("PM", "PROJECT MANAGEMENT", "07", "Permitting"),
    ("PM", "PROJECT MANAGEMENT", "08", "Procurement"),
    ("PM", "PROJECT MANAGEMENT", "08A", "Contract Management"),
    ("PM", "PROJECT MANAGEMENT", "09", "Construction Management"),
    ("PM", "PROJECT MANAGEMENT", "10A", "Commissioning Management"),
    ("PM", "PROJECT MANAGEMENT", "10B", "Project Handover and closure"),
    ("PM", "PROJECT MANAGEMENT", "20A", "Layout"),
    ("PA", "PROJECT ASSISTANCE", "01A", "Quality Control"),
    ("PA", "PROJECT ASSISTANCE", "01B", "Document Control"),
    ("PA", "PROJECT ASSISTANCE", "01C", "Finance Control"),
    ("SAF", "SAFETY", "06H", "Safety Engineering"),
    ("SAF", "SAFETY", "09A", "Safety Prevention"),
    ("SAF", "SAFETY", "09B", "Safety & Site Supervision"),
    ("SAF", "SAFETY", "09C", "Safety Coordination"),
    ("ARC", "ARCHITECTURE", "06L", "Architecture"),
    ("ARC", "ARCHITECTURE", "06L", "Building Permit Dossier"),
    ("ENG", "ENGINEERING", "06A", "Process engineering"),
    ("ENG", "ENGINEERING", "06B", "Mechanical engineering"),
    ("ENG", "ENGINEERING", "06C", "Piping engineering"),
    ("ENG", "ENGINEERING", "06D", "Electrical engineering"),
    ("ENG", "ENGINEERING", "06E", "Instrumentation engineering"),
    ("ENG", "ENGINEERING", "06F", "Structural engineering"),
    ("ENG", "ENGINEERING", "06G", "Civil engineering"),
    ("ENG", "ENGINEERING", "06I", "Automation"),
    ("ENG", "ENGINEERING", "06J", "Environmental engineering"),
    ("ENG", "ENGINEERING", "06K", "HVAC engineering"),
    ("ENG", "ENGINEERING", "06M", "Pipeline engineering"),
    ("ENG", "ENGINEERING", "06N", "Metallurgy and Corrosion engineering"),
    ("ENG", "ENGINEERING", "06O", "Utilities engineering"),
    ("ENG", "ENGINEERING", "06P", "Infrastructure engineering"),
    ("ENG", "ENGINEERING", "06Q", "Telecommunication engineering"),
    ("ENG", "ENGINEERING", "06R", "Logistics"),
    ("ENG", "ENGINEERING", "06S", "IT engineering"),
    ("ENG", "ENGINEERING", "06T", "Fire Protection Engineering"),
    ("ENG", "ENGINEERING", "06U", "Security Engineering"),
    ("ENG", "ENGINEERING", "06V", "Geotechnical engineering"),
    ("ENG", "ENGINEERING", "06X", "Clean Utilities"),
    ("ENG", "ENGINEERING", "06Y", "Clean Finishes"),
    ("ENG", "ENGINEERING", "20A", "Layout"),
    ("ENG", "ENGINEERING", "20B", "BIM"),
]

DEFAULT_RISK_CATEGORIES = [
    "Scope", "Safety", "Quality", "Regulatory", "Technology",
    "Technical", "Management", "Procurement", "Commercial",
    "Ressources", "Supply Chain", "Environmental", "Natural Hazards", "Reputational",
]

DEFAULT_RISK_PHASES = [
    "Masterplan-Inception", "Feasibility", "Preparation", "Realization", "Operation",
]

DEFAULT_PROCUREMENT_STEPS = [
    # (step_id, weight_fraction, description)
    ("NDA",                   0.05, "Notice Disclosure Agreement: signature of the selected contractor required to proceed to next step"),
    ("RFI",                   0.05, "Request For Interest: description of the project and scope, request if interest to participate and questions to be answered on which the first exclusion from long list to short list shall be performed (financial capability, reference projects, capacity and resources, Health and Safety, Quality, Legal)"),
    ("Short Vendor List",     0.05, "Exclusion of first set of contractors based upon received answers on RFI. Elaborate short list and inform excluded contractors"),
    ("RFQ",                   0.20, "Request For Quotation: The RFQ package consists of contractual and technical documents defining the project scope, execution, and commercial framework. It includes a Contractual Document List establishing document hierarchy, transversal documents clarifying interfaces between packages, and a detailed scope of work with technical requirements. The Contractor Deliverables List specifies expected outputs and workflows, while the Bill of Quantities provides the basis for pricing and bid comparison."),
    ("Q&A",                   0.10, "Start-up of the Questions and Answers which will serve as reporting during the complete procurement sequence (clarifications, negotiations). This document shall be part of the final Contractual Agreement"),
    ("Quotation Submittal",   0.10, "Quotation submittal by the contractors according to the instructions in the ITT and the filled in BOQ."),
    ("Bid Comparison",        0.05, "Comparison between the different quotations based upon the BOQ and an additional Decision matrix with pre-defined criteria for decision"),
    ("Technical Negotiations",0.10, "Meeting in order to align the technical compliance of the scope. Reporting will be done in the Q&A (dedicated sections) and quotation can be updated by the Contractor"),
    ("Commercial Negotiations",0.10,"Meeting in order to align the commercial compliance of the scope. The financial position of the contractor compared to its competitors is communicated. Reporting will be done in the Q&A (dedicated sections) and quotation can be updated by the Contractor"),
    ("BAFO",                  0.05, "Best And Final Offer: last opportunity for the contractor to submit his best quotation"),
    ("Recommendation Report", 0.10, "Final report of the procurement process of a package including the recommendation to purchase for the customer. The Q&A, the bid comparison and the deviation list are added as an annex to the Recommendation letter."),
    ("Contract Awarding",     0.05, "Based on the customer feedback on the recommendation report, select the contractor for awarding the contract. Notify the successful contractor(s) and initiate the contract awarding process. Finalize and sign the Contractual Agreement and the CDL with the selected contractor."),
]

DEFAULT_CONTRACT_TYPES = [
    # (name, description)
    ("Lump-Sum", "With a lump-sum contract, the contractor delivers the project at a preset price. The contractor will deliver a total price for the project rather than bidding on the deliverables. Works well for projects with a well-defined scope."),
    ("Unit Price", "The unit price contract details prices per unit, which may include materials, labor, overhead, supplies, and profit. The owner pays the contractor based on the units at agreed-upon rates."),
    ("Combined Lump-Sum / Unit Price", "Combination of two types: lump sum for a specific part of the scope, unit rate for other parts."),
    ("Cost-Plus", "Under a cost-plus contract, contractors are paid for all of their construction-related expenses including direct costs (labor, materials, supplies) and overhead costs, plus an agreed-upon profit amount."),
    ("Design & Build", "A design-build contract addresses design and construction costs simultaneously. Construction begins before the final design is completed, saving the owner time and money by combining both project delivery phases into one contract."),
    ("Guaranteed Maximum Price", "Under the GMP contract, the maximum amount the owner will have to pay the contractor is capped. Any additional expenses incurred beyond the cap are covered by the contractor."),
    ("Incentive Construction", "Incentive contracts provide the contractor with an agreed-upon payment if the project is delivered by a certain date and at a specific cost. The contractor is incentivized for controlling costs and staying on schedule."),
    ("Integrated Project Delivery", "IPD is a delivery model using a single contract for design and construction with a shared risk/reward model, guaranteed costs, waivers of liability between team members, and a collaborative culture based on lean principles."),
    ("Time & Materials", "Under a T&M contract, the owner pays an agreed-upon price based on the time spent on the project, required materials, and the included profit rate. Allows for more flexibility in costs."),
]

DEFAULT_SETTINGS = {
    "timezone": "Europe/Brussels",
    "date_format": "DD/MM/YYYY",
    "currency": "EUR",
    "project_name": "My Project",
}


def seed_subservices_for_project(project_id: int, db):
    """Seed the default subservice list for a given project."""
    import models
    for i, (sc, sn, ssc, ssn) in enumerate(DEFAULT_SUBSERVICES):
        db.add(models.Subservice(
            project_id=project_id,
            service_code=sc, service_name=sn,
            subservice_code=ssc, subservice_name=ssn,
            sort_order=i,
        ))
    db.commit()


def seed_risk_data_for_project(project_id: int, db):
    """Seed default risk categories and phases for a given project."""
    import models
    for i, name in enumerate(DEFAULT_RISK_CATEGORIES):
        db.add(models.RiskCategory(project_id=project_id, name=name, sort_order=i))
    for i, name in enumerate(DEFAULT_RISK_PHASES):
        db.add(models.RiskPhase(project_id=project_id, name=name, sort_order=i))
    db.commit()


def seed_procurement_for_project(project_id: int, db):
    """Seed default procurement steps, contract types, and config for a given
    project. Idempotent — won't duplicate rows on repeated calls."""
    import models
    if db.query(models.ProcurementStep).filter_by(project_id=project_id).count() == 0:
        for i, (step_id, weight, description) in enumerate(DEFAULT_PROCUREMENT_STEPS):
            db.add(models.ProcurementStep(
                project_id=project_id,
                step_id=step_id,
                description=description,
                weight=weight,
                sort_order=i,
            ))
    if db.query(models.ContractType).filter_by(project_id=project_id).count() == 0:
        for i, (name, description) in enumerate(DEFAULT_CONTRACT_TYPES):
            db.add(models.ContractType(
                project_id=project_id,
                name=name,
                description=description,
                sort_order=i,
            ))
    if not db.query(models.ProcurementConfig).filter_by(project_id=project_id).first():
        db.add(models.ProcurementConfig(project_id=project_id, sequence_validated=False))
    db.commit()


def seed_settings_for_project(project_id: int, db):
    """Seed default settings for a given project."""
    import models
    for key, value in DEFAULT_SETTINGS.items():
        existing = db.query(models.Setting).filter_by(project_id=project_id, key=key).first()
        if not existing:
            db.add(models.Setting(project_id=project_id, key=key, value=value))
    db.commit()


DEFAULT_WORK_PERMIT_TYPES = [
    ("Cold Work Permit",            "General work without ignition sources"),
    ("Hot Work Permit",             "Work involving heat sparks or open flames"),
    ("Confined Space Entry Permit", "Entry into enclosed or restricted spaces"),
    ("Electrical Work Permit",      "Work on or near electrical systems"),
    ("LOTO Permit",                 "Isolation of hazardous energy sources"),
    ("Excavation Permit",           "Ground disturbance or digging activities"),
    ("Work at Height Permit",       "Work performed at elevated positions"),
    ("Lifting Permit",              "Crane and heavy lifting operations"),
    ("Radiography Permit",          "Use of radioactive sources for testing"),
    ("Pressure Testing Permit",     "Testing systems under pressure"),
    ("Chemical Permit",             "Handling or use of hazardous substances"),
    ("Demolition Permit",           "Dismantling or removal of structures"),
]

DEFAULT_SAFETY_SEVERITY_CLASSES = [
    # (level, name, description) — level 1 = worst, ascending = less severe
    (1, "Fatality",                  "Work-related injury or illness resulting in death."),
    (2, "Lost Time Injury (LTI)",    "Injury causing the worker to miss at least one full scheduled workday after the incident."),
    (3, "Restricted Work Case (RWC)","Injury where the worker cannot perform normal duties and is assigned restricted or modified work."),
    (4, "Medical Treatment Case (MTC)","Injury requiring medical treatment beyond first aid, without resulting in lost time or restricted work."),
    (5, "First Aid Case (FAC)",      "Minor injury treated with basic first aid, with no need for medical treatment or work restrictions."),
    (6, "Near Miss",                 "Unplanned event that did not result in injury or damage but had the potential to do so."),
]

DEFAULT_SAFETY_INCIDENT_CAUSES = [
    # (name, description, is_default)  — "Other" is protected from deletion
    ("Falls from height",   None, False),
    ("Struck by object",    None, False),
    ("Caught-in/between",   None, False),
    ("Electrical",          None, False),
    ("Transport/vehicles",  None, False),
    ("Other",               "Catch-all for incidents that don't fit any other cause.", True),
]

DEFAULT_SAFETY_TOOLBOX_CATEGORIES = [
    # (name, description, is_default) — "Other" is protected from deletion/rename
    ("Work at height",                    None, False),
    ("Lifting operations",                None, False),
    ("Electrical safety",                 None, False),
    ("Personal Protection Equipment (PPE)", None, False),
    ("Housekeeping",                      None, False),
    ("Tools & equipment",                 None, False),
    ("Excavation",                        None, False),
    ("Traffic & vehicles",                None, False),
    ("Other",                             "Catch-all for toolbox topics that don't fit any other category.", True),
]

DEFAULT_SAFETY_OBSERVATION_CATEGORIES = [
    # (name, description, polarity)
    ("People / Behavior",       "How workers act (safe or unsafe practices, PPE use)",          "NEGATIVE"),
    ("Equipment / Tools",       "Condition and correct use of machinery and tools",             "NEGATIVE"),
    ("Work Environment",        "Physical site conditions (housekeeping, lighting, hazards)",   "NEGATIVE"),
    ("Procedures",              "Compliance with rules, permits, and work instructions",        "NEGATIVE"),
    ("Ergonomics",              "Risks from posture, lifting, or repetitive work",              "NEGATIVE"),
    ("Chemicals / Substances",  "Handling, storage, and labeling of hazardous materials",       "NEGATIVE"),
    ("Electrical Safety",       "Risks related to electrical systems and equipment",            "NEGATIVE"),
    ("Working at Height",       "Fall protection, ladders, scaffolding",                        "NEGATIVE"),
    ("Fire Safety",             "Fire risks, extinguishers, and emergency exits",               "NEGATIVE"),
    ("Traffic / Vehicles",      "Movement of vehicles and interaction with pedestrians",        "NEGATIVE"),
    ("Environment (EHS)",       "Waste, spills, emissions, environmental impact",               "NEGATIVE"),
    ("Emergency Preparedness",  "Readiness for incidents (alarms, exits, drills)",              "NEGATIVE"),
    ("Positive Observations",   "Good practices and safe behaviors observed",                   "POSITIVE"),
]

DEFAULT_WORKER_CERTIFICATE_TYPES = [
    ("VCA Basic Safety",              "Safety awareness certificate for site workers"),
    ("VCA Supervisor Safety",         "Safety certificate for supervisors"),
    ("First Aid",                     "First-aid responder certification"),
    ("Working at Heights",            "Certified to perform work at elevated positions"),
    ("Confined Space Entry",          "Certified to enter confined spaces"),
    ("Scaffold Erector",              "Certified to erect and inspect scaffolding"),
    ("Rigging & Lifting",             "Certified rigger for lifting operations"),
    ("Forklift Operator",             "Certified forklift operator"),
    ("Crane Operator",                "Certified crane operator"),
    ("Mobile Elevated Work Platform", "Certified MEWP / cherry-picker operator"),
    ("Welding Certification",         "Qualified welder per applicable code"),
    ("Electrical Work Authorization", "Authorized for electrical work (e.g. BA4 / BA5)"),
    ("Hot Work Authorization",        "Authorized to perform hot work under permit"),
    ("Excavation / Ground Work",      "Certified for ground-disturbance activities"),
    ("Hazardous Substances",          "Trained for handling hazardous substances"),
]


def seed_construction_defaults_for_project(project_id: int, db):
    """Seed default work-permit types, safety-observation categories, and
    worker-certificate types for a new project."""
    import models
    if db.query(models.WorkPermitType).filter_by(project_id=project_id).count() == 0:
        for i, (name, desc) in enumerate(DEFAULT_WORK_PERMIT_TYPES):
            db.add(models.WorkPermitType(project_id=project_id, name=name, description=desc, sort_order=i))
    if db.query(models.SafetyObservationCategory).filter_by(project_id=project_id).count() == 0:
        for i, (name, desc, polarity) in enumerate(DEFAULT_SAFETY_OBSERVATION_CATEGORIES):
            db.add(models.SafetyObservationCategory(
                project_id=project_id, name=name, description=desc,
                polarity=polarity, sort_order=i,
            ))
    if db.query(models.WorkerCertificateType).filter_by(project_id=project_id).count() == 0:
        for i, (name, desc) in enumerate(DEFAULT_WORKER_CERTIFICATE_TYPES):
            db.add(models.WorkerCertificateType(project_id=project_id, name=name, description=desc, sort_order=i))
    db.commit()


def seed_safety_setup_defaults_for_project(project_id: int, db):
    """Seed default severity classes, incident causes, and toolbox categories
    for a new project."""
    import models
    if db.query(models.SafetySeverityClass).filter_by(project_id=project_id).count() == 0:
        for level, name, desc in DEFAULT_SAFETY_SEVERITY_CLASSES:
            db.add(models.SafetySeverityClass(
                project_id=project_id, name=name, description=desc, level=level,
            ))
    if db.query(models.SafetyIncidentCause).filter_by(project_id=project_id).count() == 0:
        for i, (name, desc, is_default) in enumerate(DEFAULT_SAFETY_INCIDENT_CAUSES):
            db.add(models.SafetyIncidentCause(
                project_id=project_id, name=name, description=desc,
                sort_order=i, is_default=is_default,
            ))
    if db.query(models.SafetyToolboxCategory).filter_by(project_id=project_id).count() == 0:
        for i, (name, desc, is_default) in enumerate(DEFAULT_SAFETY_TOOLBOX_CATEGORIES):
            db.add(models.SafetyToolboxCategory(
                project_id=project_id, name=name, description=desc,
                sort_order=i, is_default=is_default,
            ))
    db.commit()


def seed_qc_defaults_for_project(project_id: int, db):
    """Seed default ITP test types, witness levels, and obligation times for a new project."""
    import models
    default_test_types = [
        "Dimensional Check", "Visual Inspection", "Hydrostatic Test",
        "Non-Destructive Examination (NDE)", "Material Traceability Review",
        "Factory Acceptance Test (FAT)", "Functional Test", "Weld Inspection",
        "Coating / Painting Inspection", "Documentation Review",
    ]
    default_witness_levels = [
        ("H", "Hold",        "Work cannot proceed without witness present"),
        ("W", "Witness",     "Witness required, work may proceed if notified and no-show"),
        ("R", "Review",      "Document review only, no physical presence required"),
        ("I", "Information", "For information only, no action required"),
    ]
    default_obligation_times = [
        ("A", "Immediate Remediation"),
        ("B", "Before Delivery"),
        ("C", "Before Mechanical Completion"),
        ("D", "Before Cold Commissioning"),
        ("E", "Before Hot Commissioning"),
        ("F", "Before Provisional Acceptance"),
        ("G", "Before Final Acceptance"),
    ]
    if db.query(models.ITPTestType).filter_by(project_id=project_id).count() == 0:
        for i, name in enumerate(default_test_types):
            db.add(models.ITPTestType(project_id=project_id, name=name, sort_order=i))
    if db.query(models.ITPWitnessLevel).filter_by(project_id=project_id).count() == 0:
        for i, (code, name, desc) in enumerate(default_witness_levels):
            db.add(models.ITPWitnessLevel(project_id=project_id, code=code, name=name, description=desc, sort_order=i))
    if db.query(models.ObligationTime).filter_by(project_id=project_id).count() == 0:
        for i, (code, name) in enumerate(default_obligation_times):
            db.add(models.ObligationTime(project_id=project_id, code=code, name=name, sort_order=i))
    db.commit()


# Per-role permissions are now hardcoded in each router (see
# routers/permissions_overview comment in static/js/components/settings.js).


# ─────────────────────────────────────────────────────────────────────────────
# Project start-up checklist — seeded on project creation; surfaces as a
# top group "Project Start-up" in My Action Points for every PROJECT_OWNER
# until they close each item. (target_module / target_subtab drive the
# auto-navigation when the user picks "Close & go".)
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_STARTUP_TASKS = [
    {
        "key": "settings",
        "title": "Configure project settings",
        "module": "settings", "subtab": None,
        "body": (
            "Open the project settings to set the regional defaults, the maximum file-upload size, "
            "and to switch ON the modules you want to use in the navigation pane. A project will "
            "often start with a limited subset of modules; you can activate more later as the project "
            "evolves.\n\n"
            "Use the Module Leads section to delegate per-module ownership: a Module Lead has the same "
            "rights as the Project Owner, but only inside that module (e.g. a Risk Manager getting "
            "full access to the Risk Register)."
        ),
    },
    {
        "key": "contacts",
        "title": "Add project contacts and define their roles",
        "module": "contacts", "subtab": None,
        "body": (
            "Add the people involved in the project as contacts and assign each one a project role. "
            "When a contact also needs platform access, create their account from the contact card "
            "and share the temporary password with them confidentially — they will be required to "
            "set a new password the first time they log in.\n\n"
            "Detailed information about each role and what it can do is available in the Help Center."
        ),
    },
    {
        "key": "packages",
        "title": "Define packages, package owners and reviewers",
        "module": "contacts", "subtab": "packages",
        "body": (
            "Define the packages of the project and assign a package owner plus reviewers for each "
            "package:\n\n"
            "• PMC reviewers — reviewers from the engineering office, EPCM or PMC consultant. The "
            "package owner can also act as a PMC reviewer.\n"
            "• Client reviewers — reviewers on the client side. The technical reviewer signs off on "
            "technical documents and inspections/tests; the commercial reviewer signs off on progress "
            "reports, invoicing and scope changes. The technical and commercial reviewer can of "
            "course be the same person.\n\n"
            "Packages are central to the platform: they drive permissions and they enable per-package "
            "reporting in every module."
        ),
    },
    {
        "key": "areas",
        "title": "Define project areas, area managers and site supervisors",
        "module": "contacts", "subtab": "areas",
        "body": (
            "Define the geographical / functional areas of the project and upload the floorplans for "
            "each one. Assign:\n\n"
            "• An area manager (technical coordinator of the area — can be the same person for every "
            "area when there is a single coordinator).\n"
            "• A site supervisor (responsible for site follow-up such as work permits and LOTO — can "
            "also be the same person for every area when there is a single site manager).\n\n"
            "Areas are used throughout the platform to anchor records (punch-list items, safety "
            "observations, documents, …). When floorplans are uploaded, safety observations and "
            "punch-list items can be located precisely using pinpoints on the plan."
        ),
    },
    {
        "key": "meetings",
        "title": "Define meeting types and default participants",
        "module": "meetings", "subtab": "types",
        "body": (
            "Set up the recurring and ad-hoc meeting types of the project, and attach the default "
            "participants for each one. Default participants will automatically have access to every "
            "action point linked to that meeting type.\n\n"
            "Take care to fill in the recurrence (day(s), time, duration) accurately for recurring "
            "meetings — this gives a clear at-a-glance picture in the Weekly view tab."
        ),
    },
    {
        "key": "schedule",
        "title": "Upload the project schedule",
        "module": "schedule", "subtab": None,
        "body": (
            "Upload your project schedule. The platform is a visualisation layer on top of your "
            "schedule — progress reports are then used to measure and validate progress against it.\n\n"
            "Use the Excel upload tool, and keep a clear correlation with your scheduling tool "
            "(Microsoft Project, Primavera, …) so that future updates can be re-imported without "
            "losing the link to existing tasks."
        ),
    },
    {
        "key": "budget",
        "title": "Set the budget baseline per package",
        "module": "budget", "subtab": "overview",
        "body": (
            "Open the Budget Overview tab and set the budget baseline for each package. The baseline "
            "is entered directly in the overview by clicking on the value in the baseline column.\n\n"
            "The baseline is the reference against which actual budget, committed orders and invoiced "
            "amounts are tracked across the rest of the budget module."
        ),
    },
    {
        "key": "risk_setup",
        "title": "Configure risk register scoring and categories",
        "module": "risks", "subtab": "setup",
        "body": (
            "Go to the Setup tab of the Risk Register and configure the scoring and categorisation "
            "rules for risks. Sensible defaults are provided out of the box; adapt them to your "
            "project's risk-management framework if needed."
        ),
    },
    {
        "key": "procurement_setup",
        "title": "Configure procurement sequence and contract types",
        "module": "procurement", "subtab": "setup",
        "body": (
            "Go to the Setup tab of the Procurement module and define the procurement sequence and "
            "the contract types that will be used on the project. Defaults are provided.\n\n"
            "This is critical to do BEFORE building the procurement plan: the plan identifies the "
            "bidders and the planning per package, and an Excel upload becomes available once the "
            "sequence has been validated."
        ),
    },
    {
        "key": "construction_setup_permits",
        "title": "Configure work permit types and worker certificates",
        "module": "construction", "subtab": "setup",
        "body": (
            "Go to the Setup section of the Construction module and configure the work permit types "
            "and the worker certificate types that apply on the project. Sensible defaults are "
            "provided — adapt or extend them to match your site rules."
        ),
    },
    {
        "key": "safety_setup",
        "title": "Configure safety categories, severities and incident causes",
        "module": "safety", "subtab": "setup",
        "body": (
            "Still inside the safety setup, configure the safety observation categories, severity "
            "classes, incident causes and toolbox-talk categories. Defaults are provided; adjust to "
            "the conventions used by your HSE team."
        ),
    },
]


def seed_startup_tasks_for_project(project_id: int, db) -> None:
    """Seed the start-up checklist for a newly created project. Idempotent: a
    second call is a no-op for tasks already present (matched on task_key)."""
    import models
    existing_keys = {
        k for (k,) in db.query(models.ProjectStartupTask.task_key)
                          .filter_by(project_id=project_id).all()
    }
    for i, t in enumerate(DEFAULT_STARTUP_TASKS):
        if t["key"] in existing_keys:
            continue
        db.add(models.ProjectStartupTask(
            project_id=project_id,
            task_key=t["key"],
            title=t["title"],
            body=t["body"],
            target_module=t["module"],
            target_subtab=t["subtab"],
            sort_order=i,
            status="OPEN",
        ))
    db.commit()
