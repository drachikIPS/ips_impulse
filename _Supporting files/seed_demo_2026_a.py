"""
Comprehensive demo seed for project DEMO-2026-A.

Wipes and reseeds the *workflow* data on the project (work permits + their
children, LOTOs, daily reports, safety observations / incidents / toolboxes,
plus all their history events).  Foundation data — workers, subcontractors,
area site supervisors, contacts, packages, areas, lookup tables — is kept.

Records are spread across the last ~6 months and use age-weighted status
distributions so older items are mostly closed and recent items mostly
active.  Every workflow transition is logged in the appropriate history
table with proper actor and timestamps.

Usage:  python seed_demo_2026_a.py
"""
import random
from datetime import datetime, timedelta, date

import models
import database


# ─────────────────────────────────────────────────────────────────────────────
# Tunables
# ─────────────────────────────────────────────────────────────────────────────

PROJECT_NUMBER = 'DEMO-2026-A'
TODAY          = date(2026, 4, 26)
WINDOW_DAYS    = 180

# Volume targets (≈ 1 month average then × 6 for the window)
TARGET_PERMITS         = 32
TARGET_LOTOS           = 14
TARGET_OBSERVATIONS    = 95
TARGET_INCIDENTS       = 48
TARGET_TOOLBOXES       = 60

random.seed(2026)


def utc_dt(d: date, hour: int = 9, minute: int = 0) -> datetime:
    return datetime.combine(d, datetime.min.time()).replace(
        hour=hour, minute=minute, second=0
    )


def days_ago(n: int) -> date:
    return TODAY - timedelta(days=n)


# Per-class seq counters so we don't race next_project_seq() inside loops
class SeqCounter:
    def __init__(self, db, project_id):
        self.db = db; self.pid = project_id; self.cache = {}
    def next(self, cls):
        if cls not in self.cache:
            from sqlalchemy import func
            cur = (self.db.query(func.max(cls.project_seq_id))
                          .filter(cls.project_id == self.pid).scalar()) or 0
            self.cache[cls] = cur
        self.cache[cls] += 1
        return self.cache[cls]


# ─────────────────────────────────────────────────────────────────────────────
# Wipe the workflow tables (keep foundation)
# ─────────────────────────────────────────────────────────────────────────────

def wipe(db, proj_id):
    """Delete workflow data only.  Children deleted explicitly because SQLite
    FK cascades don't fire by default (PRAGMA foreign_keys is off)."""
    print('Wiping workflow data for project', proj_id, '...')

    # Daily reports
    dr_ids = [r.id for r in db.query(models.DailyReport).filter_by(project_id=proj_id).all()]
    if dr_ids:
        db.query(models.DailyReportWorker).filter(models.DailyReportWorker.daily_report_id.in_(dr_ids)).delete(synchronize_session=False)
        db.query(models.DailyReportArea).filter(models.DailyReportArea.daily_report_id.in_(dr_ids)).delete(synchronize_session=False)
        db.query(models.DailyReport).filter(models.DailyReport.id.in_(dr_ids)).delete(synchronize_session=False)

    # WorkLogs
    db.query(models.WorkLog).filter_by(project_id=proj_id).delete(synchronize_session=False)

    # LOTOs + their reviews
    loto_ids = [r.id for r in db.query(models.LOTO).filter_by(project_id=proj_id).all()]
    if loto_ids:
        db.query(models.LOTOReview).filter(models.LOTOReview.loto_id.in_(loto_ids)).delete(synchronize_session=False)
        db.query(models.LOTO).filter(models.LOTO.id.in_(loto_ids)).delete(synchronize_session=False)

    # Work permits + all their children. Nuke any orphan child rows too —
    # SQLite default has FK enforcement off so previous runs may have left
    # detached children with no surviving parent.
    wp_ids = [r.id for r in db.query(models.WorkPermit).filter_by(project_id=proj_id).all()]
    if wp_ids:
        db.query(models.WorkPermitReview).filter(models.WorkPermitReview.work_permit_id.in_(wp_ids)).delete(synchronize_session=False)
        db.query(models.WorkPermitAreaApproval).filter(models.WorkPermitAreaApproval.work_permit_id.in_(wp_ids)).delete(synchronize_session=False)
        db.query(models.WorkPermitArea).filter(models.WorkPermitArea.work_permit_id.in_(wp_ids)).delete(synchronize_session=False)
        db.query(models.WorkPermitPermitType).filter(models.WorkPermitPermitType.work_permit_id.in_(wp_ids)).delete(synchronize_session=False)
        db.query(models.WorkPermitHazard).filter(models.WorkPermitHazard.work_permit_id.in_(wp_ids)).delete(synchronize_session=False)
        db.query(models.WorkPermitPPE).filter(models.WorkPermitPPE.work_permit_id.in_(wp_ids)).delete(synchronize_session=False)
        db.query(models.WorkPermit).filter(models.WorkPermit.id.in_(wp_ids)).delete(synchronize_session=False)
    # Defensive: orphan child rows where parent permit no longer exists
    surviving = {r[0] for r in db.query(models.WorkPermit.id).all()}
    for child_cls in (models.WorkPermitReview, models.WorkPermitAreaApproval,
                      models.WorkPermitArea, models.WorkPermitPermitType,
                      models.WorkPermitHazard, models.WorkPermitPPE):
        for row in db.query(child_cls).all():
            if row.work_permit_id not in surviving:
                db.delete(row)

    # Toolboxes + children
    tbx_ids = [r.id for r in db.query(models.SafetyToolbox).filter_by(project_id=proj_id).all()]
    if tbx_ids:
        db.query(models.SafetyToolboxReview).filter(models.SafetyToolboxReview.toolbox_id.in_(tbx_ids)).delete(synchronize_session=False)
        db.query(models.SafetyToolboxIncident).filter(models.SafetyToolboxIncident.toolbox_id.in_(tbx_ids)).delete(synchronize_session=False)
        db.query(models.SafetyToolboxObservation).filter(models.SafetyToolboxObservation.toolbox_id.in_(tbx_ids)).delete(synchronize_session=False)
        db.query(models.SafetyToolboxWorker).filter(models.SafetyToolboxWorker.toolbox_id.in_(tbx_ids)).delete(synchronize_session=False)
        db.query(models.SafetyToolboxPackage).filter(models.SafetyToolboxPackage.toolbox_id.in_(tbx_ids)).delete(synchronize_session=False)
        db.query(models.SafetyToolbox).filter(models.SafetyToolbox.id.in_(tbx_ids)).delete(synchronize_session=False)

    # Incidents + children
    inc_ids = [r.id for r in db.query(models.SafetyIncident).filter_by(project_id=proj_id).all()]
    if inc_ids:
        db.query(models.SafetyIncidentNote).filter(models.SafetyIncidentNote.incident_id.in_(inc_ids)).delete(synchronize_session=False)
        db.query(models.SafetyIncidentReview).filter(models.SafetyIncidentReview.incident_id.in_(inc_ids)).delete(synchronize_session=False)
        db.query(models.SafetyIncidentWorker).filter(models.SafetyIncidentWorker.incident_id.in_(inc_ids)).delete(synchronize_session=False)
        db.query(models.SafetyIncident).filter(models.SafetyIncident.id.in_(inc_ids)).delete(synchronize_session=False)

    # Observations + reviews
    obs_ids = [r.id for r in db.query(models.SafetyObservation).filter_by(project_id=proj_id).all()]
    if obs_ids:
        db.query(models.SafetyObservationReview).filter(models.SafetyObservationReview.observation_id.in_(obs_ids)).delete(synchronize_session=False)
        db.query(models.SafetyObservation).filter(models.SafetyObservation.id.in_(obs_ids)).delete(synchronize_session=False)

    # Project-wide orphan sweep: rows whose parent no longer exists.
    # SQLite FK enforcement is off by default so previous runs may have left
    # orphans that will conflict with new INSERTs hitting the same parent id.
    parent_fk_pairs = [
        # (child_class, parent_attr, parent_class)
        (models.SafetyIncidentWorker, 'incident_id', models.SafetyIncident),
        (models.SafetyIncidentReview, 'incident_id', models.SafetyIncident),
        (models.SafetyIncidentNote,   'incident_id', models.SafetyIncident),
        (models.SafetyObservationReview, 'observation_id', models.SafetyObservation),
        (models.SafetyToolboxReview, 'toolbox_id', models.SafetyToolbox),
        (models.SafetyToolboxIncident, 'toolbox_id', models.SafetyToolbox),
        (models.SafetyToolboxObservation, 'toolbox_id', models.SafetyToolbox),
        (models.SafetyToolboxWorker, 'toolbox_id', models.SafetyToolbox),
        (models.SafetyToolboxPackage, 'toolbox_id', models.SafetyToolbox),
        (models.LOTOReview, 'loto_id', models.LOTO),
    ]
    for child_cls, attr, parent_cls in parent_fk_pairs:
        valid = {r[0] for r in db.query(parent_cls.id).all()}
        # Also valid: incident/observation/toolbox links pointing at sibling tables
        # (e.g. SafetyToolboxObservation needs both toolbox AND observation valid)
        for row in db.query(child_cls).all():
            if getattr(row, attr) not in valid:
                db.delete(row)

    db.commit()
    print('Wipe complete.')


# ─────────────────────────────────────────────────────────────────────────────
# Foundations: ensure supervisors/subs/workers exist (idempotent)
# ─────────────────────────────────────────────────────────────────────────────

SUB_TEMPLATES = {
    'AUT': [('Helios Automation BV', 'Bjorn Vermeulen', 'b.vermeulen@helios-aut.com')],
    'CIV': [('North Bay Civil Works', 'Jan Hendrickx', 'jan@nbcw.eu'),
            ('Heimdall Concrete', 'Petra Janssens', 'p.janssens@heimdall.be')],
    'COM': [('Apex Commissioning Services', 'Mark Lauwers', 'mark@apex-com.com')],
    'ELE': [('VoltaWerk', 'Inge Maes', 'inge@voltawerk.com')],
    'ENV': [('GreenStream Environmental', 'Olaf Andersen', 'o.andersen@greenstream.io')],
    'HVA': [('Boreas HVAC Solutions', 'Karen Devos', 'karen@boreashvac.com')],
    'INS': [('Loop Instrumentation', 'Tom Smeets', 'tom@loop-inst.eu')],
    'MEC': [('Atlas Mechanical Erection', 'Wim Govaerts', 'wim@atlas-me.com'),
            ('Forge & Lift', 'Maud Lemoine', 'maud@forgelift.fr')],
    'PIP': [('Rhine Piping Group', 'Lucas Schmidt', 'lucas@rhinepg.de'),
            ('Pipeline Pro NV', 'Sara Verheyden', 'sara@pipelinepro.be')],
    'STR': [('SteelOne Erectors', 'Hans Petersen', 'hans@steelone.no')],
}

WORKER_DIST = {
    'AUT': 4, 'CIV': 8, 'COM': 2, 'ELE': 6, 'ENV': 1,
    'HVA': 4, 'INS': 5, 'MEC': 7, 'PIP': 8, 'STR': 6,
}
WORKER_FIRST = ['Adam','Bram','Cedric','Dieter','Erik','Felix','Gilles','Hugo','Ivan','Jeroen',
                'Kris','Lars','Maxim','Niels','Ove','Pieter','Quinn','Ruben','Stijn','Thijs',
                'Uwe','Viktor','Wout','Xander','Yannick','Zeno','Bart','Cas','Dries','Elias',
                'Floris','Gauthier','Hannes','Ibrahim','Joris','Karel','Leon','Mats','Noah',
                'Oscar','Paul','Quentin','Ronan','Simon','Tristan','Urs','Victor','Wessel','Yago','Zico']
WORKER_LAST  = ['Peeters','Janssens','Maes','Smeets','Wouters','Claes','Devos','Vermeulen',
                'Cools','Hendrickx','Goossens','De Smet','Lambrechts','Van Damme','Verbeke',
                'Lemmens','Mertens','De Clercq','Van der Veen','Verhoeven']


def ensure_foundations(db, ctx, seq):
    """Idempotently ensure area site supervisors, subcontractors and workers
    exist on the project.  Skipped if already present."""
    proj = ctx['project']
    pid  = proj.id

    # Site supervisors (5 distinct PROJECT_TEAM contacts cover the 10 areas)
    pt_users = ctx['project_team_users']
    pt_contact_ids = [u.contact_id for u in pt_users if u.contact_id]
    n_links_added = 0
    for i, area in enumerate(ctx['areas']):
        cid = pt_contact_ids[i % min(len(pt_contact_ids), 5)] if pt_contact_ids else None
        if not cid: continue
        if not db.query(models.AreaSiteSupervisor).filter_by(area_id=area.id, contact_id=cid).first():
            db.add(models.AreaSiteSupervisor(area_id=area.id, contact_id=cid))
            n_links_added += 1

    # Subcontractors per package
    n_subs = 0
    pkg_by_tag = {p.tag_number: p for p in ctx['packages']}
    for tag, templates in SUB_TEMPLATES.items():
        pkg = pkg_by_tag.get(tag)
        if not pkg: continue
        existing = db.query(models.Subcontractor).filter_by(project_id=pid, package_id=pkg.id).count()
        if existing >= len(templates): continue
        for company, contact, email in templates:
            already = db.query(models.Subcontractor).filter_by(
                project_id=pid, package_id=pkg.id, company=company).first()
            if already: continue
            sub = models.Subcontractor(
                project_id=pid, package_id=pkg.id,
                project_seq_id=seq.next(models.Subcontractor),
                company=company, contact_person=contact,
                phone='+32 2 555 0' + str(100 + n_subs)[1:],
                email=email, description=f'{company} — services for {pkg.name}',
                created_at=utc_dt(days_ago(WINDOW_DAYS - 5)),
                created_by_id=ctx['project_owner'].id if ctx['project_owner'] else None,
            )
            db.add(sub); db.flush()
            n_subs += 1

    # Workers
    n_workers = 0
    if db.query(models.Worker).filter_by(project_id=pid).count() == 0:
        name_pool = [(f, l) for f in WORKER_FIRST for l in WORKER_LAST]
        random.shuffle(name_pool)
        name_iter = iter(name_pool)
        owner_id = ctx['project_owner'].id if ctx['project_owner'] else None
        for tag, count in WORKER_DIST.items():
            pkg = pkg_by_tag.get(tag)
            if not pkg: continue
            sub = db.query(models.Subcontractor).filter_by(project_id=pid, package_id=pkg.id).first()
            for _ in range(count):
                f, l = next(name_iter)
                r = random.random()
                status = 'APPROVED' if r < 0.85 else ('PENDING' if r < 0.95 else 'REJECTED')
                submitted = utc_dt(days_ago(random.randint(60, WINDOW_DAYS - 20)))
                reviewed  = utc_dt(days_ago(random.randint(20, 59))) if status != 'PENDING' else None
                w = models.Worker(
                    project_id=pid, package_id=pkg.id,
                    project_seq_id=seq.next(models.Worker),
                    name=f'{f} {l}',
                    phone='+32 47' + str(random.randint(1000000, 9999999)),
                    is_subcontractor=bool(sub), subcontractor_id=sub.id if sub else None,
                    status=status, submitted_at=submitted, reviewed_at=reviewed,
                    rejection_comment=('Documents incomplete — missing VCA card' if status == 'REJECTED' else None),
                    created_at=submitted, created_by_id=owner_id,
                )
                db.add(w); db.flush(); n_workers += 1
    db.commit()
    print(f'  area-supervisor links: {n_links_added} added')
    print(f'  subcontractors: {n_subs} added')
    print(f'  workers:        {n_workers} added')


# ─────────────────────────────────────────────────────────────────────────────
# Context helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_context(db):
    proj = db.query(models.Project).filter_by(project_number=PROJECT_NUMBER).first()
    if not proj:
        raise RuntimeError(f"Project {PROJECT_NUMBER} not found")
    pid = proj.id

    packages = db.query(models.Package).filter_by(project_id=pid).order_by(models.Package.tag_number).all()
    areas    = db.query(models.Area).filter_by(project_id=pid).order_by(models.Area.tag).all()

    users_by_role = {}
    for up in db.query(models.UserProject).filter_by(project_id=pid).all():
        u = db.query(models.User).filter_by(id=up.user_id).first()
        if u: users_by_role.setdefault(up.role, []).append(u)
    project_owner = (users_by_role.get('PROJECT_OWNER') or [None])[0]

    user_by_contact = {u.contact_id: u for u in db.query(models.User).all() if u.contact_id}

    super_by_area = {}
    super_contact_ids = set()
    for area in areas:
        sups = [s.contact_id for s in db.query(models.AreaSiteSupervisor).filter_by(area_id=area.id).all()]
        super_by_area[area.id] = sups
        super_contact_ids.update(sups)
    super_users = [user_by_contact[cid] for cid in super_contact_ids if cid in user_by_contact]

    pkg_contacts = {}
    for pkg in packages:
        cids = [pkg.package_owner_id, pkg.account_manager_id] + [pc.contact_id for pc in pkg.package_contacts]
        pkg_contacts[pkg.id] = [c for c in cids if c]

    workers_by_pkg = {}
    for pkg in packages:
        workers_by_pkg[pkg.id] = (
            db.query(models.Worker).filter_by(project_id=pid, package_id=pkg.id, status='APPROVED').all()
        )

    return {
        'project': proj, 'pid': pid,
        'packages': packages, 'areas': areas,
        'users_by_role': users_by_role,
        'project_team_users': users_by_role.get('PROJECT_TEAM', []),
        'vendor_users': users_by_role.get('VENDOR', []),
        'client_users': users_by_role.get('CLIENT', []),
        'project_owner': project_owner,
        'user_by_contact': user_by_contact,
        'super_by_area': super_by_area,
        'super_users': super_users,
        'pkg_contacts': pkg_contacts,
        'workers_by_pkg': workers_by_pkg,
        'obs_categories': db.query(models.SafetyObservationCategory).filter_by(project_id=pid)
                              .order_by(models.SafetyObservationCategory.sort_order).all(),
        'severities': db.query(models.SafetySeverityClass).filter_by(project_id=pid)
                          .order_by(models.SafetySeverityClass.level).all(),
        'incident_causes': db.query(models.SafetyIncidentCause).filter_by(project_id=pid)
                              .order_by(models.SafetyIncidentCause.sort_order).all(),
        'tbx_categories': db.query(models.SafetyToolboxCategory).filter_by(project_id=pid)
                              .order_by(models.SafetyToolboxCategory.sort_order).all(),
        'permit_types': db.query(models.WorkPermitType).filter_by(project_id=pid).all(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# WORK PERMITS — areas + approvals + types + hazards + PPE + history
# ─────────────────────────────────────────────────────────────────────────────

PERMIT_TEMPLATES = [
    # (title, description, package_tag, area_tags, permit_type_names, hazards, ppes, weight)
    ('Hot Work — welding repair on shell flange',          'Welding to repair shell flange',                'MEC', ['A2'],     ['Hot Work Permit'],         ['Fire Hazard'],             ['Safety helmet','Protective gloves','Safety shoes'], 5),
    ('Hot Work — structural steel cutting',                'Modification of platform supports',             'STR', ['A2'],     ['Hot Work Permit'],         ['Fire Hazard'],             ['Safety helmet','Safety goggles','Protective gloves'], 4),
    ('Confined Space — distillation column entry',         'Vessel cleaning and inspection',                'MEC', ['A3'],     ['Confined Space Entry Permit'], ['General danger'],      ['Safety helmet','Safety goggles'], 4),
    ('Confined Space — storage tank T-301',                'Internal coating inspection',                   'PIP', ['A4'],     ['Confined Space Entry Permit'], ['General danger'],      ['Safety helmet','Safety goggles'], 3),
    ('Excavation — utility trench A7',                     'Trenching for new fire-water main',             'CIV', ['A7'],     ['Excavation Permit'],       ['Risk of Falling'],         ['Safety helmet','Safety shoes'], 4),
    ('LOTO — main switchgear',                             'Isolation for cable replacement',               'ELE', ['A6'],     ['LOTO Permit','Electrical Work Permit'], [], ['Safety helmet','Protective gloves'], 5),
    ('Working at height — pipe rack installation',         'Installation of new piping spools',             'PIP', ['A2','A3'],['Work at Height Permit'],   ['Risk of Falling'],         ['Safety helmet','Protective gloves','Safety shoes'], 5),
    ('Lifting — heavy crane operation',                    'Reactor head lift',                             'MEC', ['A2'],     ['Lifting Permit'],          ['Lifting operations','Crusshing hazard'], ['Safety helmet'], 4),
    ('Electrical Work — cable tray modifications',         'New tray installation',                         'ELE', ['A4','A6'],['Electrical Work Permit'],  [],                          ['Safety helmet','Protective gloves'], 4),
    ('General Permit — HVAC commissioning',                'AHU startup and balancing',                     'HVA', ['A6','A7'],['Cold Work Permit'],        [],                          ['Safety helmet'], 3),
    ('Pressure Test — fire-water main',                    'Hydrostatic test of new piping',                'PIP', ['A7'],     ['Pressure Testing Permit'], [],                          ['Safety helmet','Safety goggles'], 3),
    ('Demolition — old utility shed',                      'Manual demolition and waste removal',           'CIV', ['A10'],    ['Demolition Permit'],       ['General danger'],          ['Safety helmet','Safety shoes'], 2),
    ('Chemical Permit — cleaning agents',                  'Chemical wash of distillation tray',            'PIP', ['A3'],     ['Chemical Permit'],         ['General danger'],          ['Safety helmet','Safety goggles','Protective gloves'], 2),
    ('Radiography — weld inspection',                      'NDT radiography on critical welds',             'PIP', ['A4'],     ['Radiography Permit'],      ['General danger'],          ['Safety helmet'], 2),
    ('LOTO — pump bay isolation',                          'Maintenance on circulation pumps',              'MEC', ['A5'],     ['LOTO Permit'],             [],                          ['Safety helmet','Protective gloves'], 4),
    ('Working at height — tank roof inspection',           'Annual inspection of tank roof',                'PIP', ['A4'],     ['Work at Height Permit'],   ['Risk of Falling'],         ['Safety helmet','Protective gloves'], 3),
    ('Hot Work — pipe spool tie-in',                       'Field welding for spool connection',            'PIP', ['A3'],     ['Hot Work Permit'],         ['Fire Hazard'],             ['Safety helmet','Protective gloves'], 4),
    ('Confined Space — manhole entry',                     'Sewer line inspection',                         'CIV', ['A8','A9'],['Confined Space Entry Permit'], ['General danger'],      ['Safety helmet','Safety goggles'], 3),
    ('Excavation — equipment foundation',                  'Foundation excavation for new pump',            'CIV', ['A5'],     ['Excavation Permit'],       ['Risk of Falling'],         ['Safety helmet','Safety shoes'], 3),
    ('Lifting — module installation',                      'Crane lift for skid module',                    'MEC', ['A1'],     ['Lifting Permit'],          ['Lifting operations'],      ['Safety helmet'], 3),
]


def seed_work_permits(db, ctx, seq):
    pid = ctx['pid']
    proj = ctx['project']
    owner_id = ctx['project_owner'].id if ctx['project_owner'] else None
    pkg_by_tag  = {p.tag_number: p for p in ctx['packages']}
    area_by_tag = {a.tag: a for a in ctx['areas']}
    types_by_name = {t.name: t for t in ctx['permit_types']}
    super_users = ctx['super_users'] or ([ctx['project_owner']] if ctx['project_owner'] else [])

    if not super_users:
        print('  WARNING: no supervisors — skipping permits'); return

    # Build a weighted template pool
    pool = []
    for tpl in PERMIT_TEMPLATES:
        pool.extend([tpl] * tpl[7])

    # Status by age band
    def pick_status(days_back):
        # >120d: 80% closed, 15% rejected, 5% draft
        # 60-120d: 50% closed, 30% approved, 10% rejected, 10% draft
        # 14-60d: 40% approved, 25% pending, 20% closed, 5% rejected, 10% draft
        # 0-14d:  35% pending, 30% approved, 20% draft, 15% closed
        r = random.random()
        if days_back > 120:
            return 'CLOSED' if r < 0.80 else ('REJECTED' if r < 0.95 else 'DRAFT')
        if days_back > 60:
            return ('CLOSED' if r < 0.50
                    else 'APPROVED' if r < 0.80
                    else 'REJECTED' if r < 0.90 else 'DRAFT')
        if days_back > 14:
            return ('APPROVED' if r < 0.40
                    else 'PENDING' if r < 0.65
                    else 'CLOSED' if r < 0.85
                    else 'REJECTED' if r < 0.90 else 'DRAFT')
        return ('PENDING' if r < 0.35
                else 'APPROVED' if r < 0.65
                else 'DRAFT' if r < 0.85 else 'CLOSED')

    n = 0
    for i in range(TARGET_PERMITS):
        tpl = random.choice(pool)
        title, desc, pkg_tag, area_tags, type_names, hazards, ppes, _w = tpl
        pkg  = pkg_by_tag.get(pkg_tag)
        if not pkg: continue

        # Distribute across the 180-day window
        days_back = random.randint(2, WINDOW_DAYS)
        start = days_ago(days_back)
        end   = start + timedelta(days=random.randint(2, 14))
        status = pick_status(days_back)

        creation = utc_dt(start - timedelta(days=random.randint(2, 5)))
        wp = models.WorkPermit(
            project_id=pid, package_id=pkg.id,
            project_seq_id=seq.next(models.WorkPermit),
            title=title, description=desc,
            start_date=start.isoformat(), end_date=end.isoformat(),
            status=status,
            submitted_at=(creation + timedelta(days=1)) if status != 'DRAFT' else None,
            submitted_by_id=owner_id if status != 'DRAFT' else None,
            created_at=creation, created_by_id=owner_id,
        )
        db.add(wp); db.flush()

        # Permit types
        for tn in type_names:
            t = types_by_name.get(tn)
            if t:
                db.add(models.WorkPermitPermitType(work_permit_id=wp.id, permit_type_id=t.id))
        # Hazards
        for hz in hazards:
            db.add(models.WorkPermitHazard(
                work_permit_id=wp.id, hazard_key=hz,
                preventive_measure='Standing instructions enforced; toolbox briefing held.',
            ))
        # PPE
        for pp in ppes:
            db.add(models.WorkPermitPPE(work_permit_id=wp.id, ppe_key=pp))
        # Areas
        for tag in area_tags:
            area = area_by_tag.get(tag)
            if not area: continue
            db.add(models.WorkPermitArea(work_permit_id=wp.id, area_id=area.id))

        # CREATED event
        db.add(models.WorkPermitReview(
            work_permit_id=wp.id, event='CREATED', actor_id=owner_id,
            created_at=creation,
        ))

        if status == 'DRAFT':
            n += 1; continue

        # SUBMITTED event
        sdt = wp.submitted_at
        db.add(models.WorkPermitReview(
            work_permit_id=wp.id, event='SUBMITTED', actor_id=owner_id, created_at=sdt,
        ))

        # Per-area approval rows + decision events
        sup_actor = random.choice(super_users)
        for tag in area_tags:
            area = area_by_tag.get(tag)
            if not area: continue
            ap_status = 'PENDING'
            reviewed_at = None
            reviewer = None
            comment = None
            if status == 'APPROVED' or status == 'CLOSED':
                ap_status = 'APPROVED'
                reviewed_at = sdt + timedelta(hours=random.randint(8, 36))
                reviewer = sup_actor
            elif status == 'REJECTED':
                ap_status = 'REJECTED'
                reviewed_at = sdt + timedelta(hours=random.randint(4, 24))
                reviewer = sup_actor
                comment  = random.choice([
                    'Insufficient PPE plan — please revise.',
                    'Hazard identification incomplete.',
                    'Method statement missing — please attach before resubmission.',
                ])
            elif status == 'PENDING':
                ap_status = 'PENDING'
            db.add(models.WorkPermitAreaApproval(
                work_permit_id=wp.id, area_id=area.id,
                status=ap_status, reviewed_at=reviewed_at,
                reviewed_by_id=reviewer.id if reviewer else None,
                rejection_comment=comment,
            ))
            if reviewed_at:
                db.add(models.WorkPermitReview(
                    work_permit_id=wp.id,
                    event='APPROVED' if ap_status == 'APPROVED' else 'REJECTED',
                    area_id=area.id,
                    approved=(ap_status == 'APPROVED'),
                    comment=comment,
                    actor_id=reviewer.id, created_at=reviewed_at,
                ))

        # Closure event for CLOSED
        if status == 'CLOSED':
            cdt = utc_dt(end + timedelta(days=random.randint(0, 2)), 17)
            db.add(models.WorkPermitReview(
                work_permit_id=wp.id, event='CLOSED', actor_id=sup_actor.id,
                comment='Work completed; permit closed.', created_at=cdt,
            ))
            wp.updated_at = cdt; wp.updated_by_id = sup_actor.id
        else:
            wp.updated_at = sdt; wp.updated_by_id = owner_id

        n += 1
    db.commit()
    print(f'  work permits: {n}')


# ─────────────────────────────────────────────────────────────────────────────
# LOTOs — linked to LOTO Permit work permits
# ─────────────────────────────────────────────────────────────────────────────

def seed_lotos(db, ctx, seq):
    pid = ctx['pid']
    super_users = ctx['super_users'] or ([ctx['project_owner']] if ctx['project_owner'] else [])
    if not super_users:
        return

    # Find permits that include a LOTO type
    loto_type = next((t for t in ctx['permit_types'] if t.name == 'LOTO Permit'), None)
    if not loto_type:
        return
    loto_permits = (db.query(models.WorkPermit)
                      .join(models.WorkPermitPermitType,
                            models.WorkPermitPermitType.work_permit_id == models.WorkPermit.id)
                      .filter(models.WorkPermit.project_id == pid,
                              models.WorkPermitPermitType.permit_type_id == loto_type.id)
                      .all())
    if not loto_permits:
        return

    n = 0
    for i in range(TARGET_LOTOS):
        wp = random.choice(loto_permits)
        # LOTO status flow: DRAFT → PENDING → APPROVED/REFUSED → RELEASED
        days_back = random.randint(2, WINDOW_DAYS)
        creation = utc_dt(days_ago(days_back))
        owner = ctx['project_owner']
        owner_id = owner.id if owner else None

        # Pick a status weighted by age
        r = random.random()
        if days_back > 90:
            status = 'RELEASED' if r < 0.80 else 'APPROVED' if r < 0.90 else 'REFUSED'
        elif days_back > 30:
            status = 'APPROVED' if r < 0.45 else 'RELEASED' if r < 0.75 else 'PENDING' if r < 0.90 else 'REFUSED'
        else:
            status = 'PENDING' if r < 0.45 else 'APPROVED' if r < 0.75 else 'DRAFT'

        loto = models.LOTO(
            project_id=pid, work_permit_id=wp.id,
            project_seq_id=seq.next(models.LOTO),
            tag_number=f'LO-{(seq.cache.get(models.LOTO, 0)):03d}',
            description=f'Isolation point for permit {wp.title[:45]}',
            status=status,
            locked_state=(status in ('APPROVED', 'PENDING')),
            submitted_at=creation + timedelta(hours=2) if status != 'DRAFT' else None,
            reviewed_at=creation + timedelta(hours=10) if status in ('APPROVED','REFUSED','RELEASED') else None,
            reviewed_by_id=random.choice(super_users).id if status in ('APPROVED','REFUSED','RELEASED') else None,
            refusal_comment='Lock incompatible with valve type — replace and resubmit.' if status == 'REFUSED' else None,
            created_at=creation, created_by_id=owner_id,
        )
        db.add(loto); db.flush()
        db.add(models.LOTOReview(
            loto_id=loto.id, event='CREATED', actor_id=owner_id, created_at=creation,
        ))
        if status != 'DRAFT':
            db.add(models.LOTOReview(
                loto_id=loto.id, event='SUBMITTED', actor_id=owner_id,
                created_at=loto.submitted_at,
            ))
        if status in ('APPROVED','REFUSED','RELEASED'):
            db.add(models.LOTOReview(
                loto_id=loto.id,
                event='APPROVED' if status != 'REFUSED' else 'REFUSED',
                confirmed=(status != 'REFUSED'),
                comment=loto.refusal_comment if status == 'REFUSED' else 'Lock confirmed on site.',
                actor_id=loto.reviewed_by_id, created_at=loto.reviewed_at,
            ))
        if status == 'RELEASED':
            rel_dt = loto.reviewed_at + timedelta(days=random.randint(2, 14))
            db.add(models.LOTOReview(
                loto_id=loto.id, event='RELEASED',
                comment='Lock released after work completion.',
                actor_id=loto.reviewed_by_id, created_at=rel_dt,
            ))
            loto.updated_at = rel_dt; loto.updated_by_id = loto.reviewed_by_id
        n += 1
    db.commit()
    print(f'  LOTOs: {n}')


# ─────────────────────────────────────────────────────────────────────────────
# DAILY REPORTS — weekday cadence on active packages
# ─────────────────────────────────────────────────────────────────────────────

def seed_daily_reports(db, ctx):
    pid = ctx['pid']
    active_pkgs = [p for p in ctx['packages'] if p.tag_number in ('CIV','MEC','PIP','STR','ELE')]
    workers_by_pkg = {p.id: ctx['workers_by_pkg'].get(p.id, []) for p in active_pkgs}
    areas = ctx['areas'][:6]
    owner_id = ctx['project_owner'].id if ctx['project_owner'] else None

    n = 0
    descs = [
        'Spool installation, hydro-test prep.',
        'Reactor base bolting and grouting.',
        'Cable tray erection on platform 2.',
        'Concrete pour for foundation F-12.',
        'Erection of structural steel modules.',
        'Painting of newly installed piping.',
        'Pipe support installation in distillation area.',
        'Continued mechanical erection of skid modules.',
        'Cable pulling between MCC and field junction boxes.',
        'Form work and rebar placement for foundation pad.',
        'Insulation work on hot piping sections.',
        'Pre-commissioning checks on instrument loops.',
    ]
    no_work_reasons = [
        'Public holiday.',
        'Weather standdown — heavy rain.',
        'Site access restricted for maintenance.',
        'Materials delayed; crew demobilised for the day.',
    ]

    # 180 calendar days, weekdays only, ~75% participation per package per day
    for d in range(WINDOW_DAYS, 0, -1):
        dt = days_ago(d)
        if dt.weekday() >= 5:  # Sat/Sun
            continue
        for pkg in active_pkgs:
            if random.random() < 0.20:  # gap
                continue
            ws = workers_by_pkg.get(pkg.id, [])
            if not ws:
                continue
            no_work = (random.random() < 0.07)
            description = random.choice(no_work_reasons) if no_work else random.choice(descs)
            avg_hours = 0.0 if no_work else round(random.uniform(7.5, 9.5), 1)
            dr = models.DailyReport(
                project_id=pid, package_id=pkg.id,
                report_date=dt.isoformat(),
                description=description, avg_hours_per_worker=avg_hours, no_work=no_work,
                locked=True, locked_at=utc_dt(dt, 18),
                created_at=utc_dt(dt, 17), created_by_id=owner_id,
            )
            db.add(dr); db.flush()
            if not no_work:
                k = max(2, int(len(ws) * random.uniform(0.55, 0.95)))
                for w in random.sample(ws, k=min(k, len(ws))):
                    db.add(models.DailyReportWorker(daily_report_id=dr.id, worker_id=w.id))
                for a in random.sample(areas, k=min(2, len(areas))):
                    db.add(models.DailyReportArea(daily_report_id=dr.id, area_id=a.id))
            n += 1
    db.commit()
    print(f'  daily reports: {n}')


# ─────────────────────────────────────────────────────────────────────────────
# SAFETY OBSERVATIONS
# ─────────────────────────────────────────────────────────────────────────────

OBS_DETAILS_NEG = [
    'Worker on platform without harness clipped to anchor point.',
    'Hose laid across walkway creating trip hazard.',
    'Unguarded edge on temporary scaffold.',
    'Compressed gas cylinders not secured upright.',
    'Energised panel found with door open and no warning sign.',
    'Spill of hydraulic oil near pump P-201, not contained.',
    'Temporary lighting drooping into pedestrian path.',
    'Mobile crane outriggers not on adequate spreader pads.',
    'Welding screens missing during arc work in shared area.',
    'Worker observed using grinder without face shield.',
    'Fire extinguisher access blocked by stored materials.',
    'Excavation barrier breached on the south side of trench.',
    'Operator using ladder beyond top safe-step height.',
    'Hand tools left at height with no lanyard.',
    'Improper storage of flammable solvents near hot work area.',
    'Damaged power cable observed running across walkway.',
    'Work area not barricaded during overhead lift.',
    'Two workers in confined space with only one attendant.',
    'PPE missing during chemical handling — no goggles.',
    'Open flame near unsecured solvent container.',
]
OBS_DETAILS_POS = [
    'Crew held a pre-task safety briefing before lift operation.',
    'Excellent housekeeping observed in PIP work area today.',
    'Worker self-reported a near-miss before any harm occurred.',
    'Subcontractor team using a written permit-to-work checklist.',
    'Visible PPE compliance during a difficult cutting job.',
    'Crew identified and isolated an energy source proactively.',
    'Use of intrinsically safe radios in the classified area.',
    'Toolbox talk extended after question on electrical hazards.',
    'Worker proactively flagged a defective tool for replacement.',
    'Foreman led a safety walk identifying improvement actions.',
]
OBS_REMEDIATION = [
    'Stop work and re-instruct on harness anchoring procedure.',
    'Re-route hose along designated cable tray.',
    'Install handrail or barrier and tag scaffold accordingly.',
    'Secure cylinders with chains; replace defective rack.',
    'Close panel; install warning sign per lockout standard.',
    'Brief crew on cable management on next toolbox.',
    '',
]


def seed_observations(db, ctx, seq):
    pid = ctx['pid']
    cats = ctx['obs_categories']
    pos_cats = [c for c in cats if c.polarity == 'POSITIVE']
    neg_cats = [c for c in cats if c.polarity == 'NEGATIVE']
    pkgs = ctx['packages']; areas = ctx['areas']
    creators = list(ctx['project_team_users']) + list(ctx['vendor_users'])
    if ctx['project_owner']: creators.append(ctx['project_owner'])
    if not creators: return

    super_by_area = ctx['super_by_area']
    user_by_contact = ctx['user_by_contact']
    pkg_contacts = ctx['pkg_contacts']
    workers_by_pkg = ctx['workers_by_pkg']

    def pick_status(days_back):
        # Older = mostly closed. Recent = mostly draft/submitted.
        r = random.random()
        if days_back > 90:
            return 'CLOSED' if r < 0.85 else 'RECEIVED'
        if days_back > 30:
            return ('CLOSED' if r < 0.55
                    else 'RECEIVED' if r < 0.80
                    else 'SUBMITTED' if r < 0.92 else 'DRAFT')
        if days_back > 7:
            return ('SUBMITTED' if r < 0.30
                    else 'RECEIVED' if r < 0.55
                    else 'CLOSED' if r < 0.80 else 'DRAFT')
        return 'DRAFT' if r < 0.40 else ('SUBMITTED' if r < 0.85 else 'RECEIVED')

    n = 0
    for _ in range(TARGET_OBSERVATIONS):
        days_back = random.randint(1, WINDOW_DAYS)
        target = pick_status(days_back)
        is_positive = (random.random() < 0.18)
        cat = random.choice(pos_cats if (is_positive and pos_cats) else neg_cats)
        details = (random.choice(OBS_DETAILS_POS) if is_positive else random.choice(OBS_DETAILS_NEG))
        pkg = random.choice(pkgs); area = random.choice(areas)
        wpool = workers_by_pkg.get(pkg.id, [])
        worker = random.choice(wpool) if wpool and random.random() < 0.45 else None
        creator = random.choice(creators)
        cdt = utc_dt(days_ago(days_back))

        obs = models.SafetyObservation(
            project_id=pid,
            project_seq_id=seq.next(models.SafetyObservation),
            package_id=pkg.id, area_id=area.id, category_id=cat.id,
            details=details,
            worker_id=worker.id if worker else None,
            remediation_request=(random.choice(OBS_REMEDIATION) or None) if not is_positive else None,
            status='DRAFT',
            created_at=cdt, created_by_id=creator.id,
        )
        db.add(obs); db.flush()
        db.add(models.SafetyObservationReview(
            observation_id=obs.id, event='CREATED', actor_id=creator.id, created_at=cdt
        ))
        if target == 'DRAFT':
            n += 1; continue

        sdt = cdt + timedelta(hours=random.randint(1, 36))
        obs.status = 'SUBMITTED'; obs.submitted_at = sdt
        obs.updated_at = sdt; obs.updated_by_id = creator.id
        db.add(models.SafetyObservationReview(
            observation_id=obs.id, event='SUBMITTED', actor_id=creator.id, created_at=sdt
        ))
        if target == 'SUBMITTED':
            n += 1; continue

        ack_actor = next((user_by_contact[cid] for cid in pkg_contacts.get(pkg.id, []) if cid in user_by_contact), creator)
        adt = sdt + timedelta(hours=random.randint(2, 60))
        obs.status = 'RECEIVED'; obs.acknowledged_at = adt; obs.acknowledged_by_id = ack_actor.id
        ack_comment = random.choice([
            'Confirmed — instruction issued to crew foreman.',
            'Tag-out applied; will follow up tomorrow.',
            'Looping in subcontractor lead for permanent fix.',
            'Acknowledged — corrective action already underway.',
            None, None,
        ])
        if ack_comment: obs.acknowledge_comment = ack_comment
        obs.updated_at = adt; obs.updated_by_id = ack_actor.id
        db.add(models.SafetyObservationReview(
            observation_id=obs.id, event='ACKNOWLEDGED', actor_id=ack_actor.id,
            comment=ack_comment, created_at=adt,
        ))
        if target == 'RECEIVED':
            n += 1; continue

        sup_actor = next((user_by_contact[cid] for cid in super_by_area.get(area.id, []) if cid in user_by_contact), creator)
        cldt = adt + timedelta(hours=random.randint(4, 96))
        obs.status = 'CLOSED'; obs.closed_at = cldt; obs.closed_by_id = sup_actor.id
        obs.updated_at = cldt; obs.updated_by_id = sup_actor.id
        cl_comment = random.choice([
            'Verified on site — corrective action in place.',
            'Closed after walkdown.',
            'Closing — issue properly remediated.',
            None, None,
        ])
        db.add(models.SafetyObservationReview(
            observation_id=obs.id, event='CLOSED', actor_id=sup_actor.id,
            comment=cl_comment, created_at=cldt,
        ))
        n += 1
    db.commit()
    print(f'  observations: {n}')


# ─────────────────────────────────────────────────────────────────────────────
# SAFETY INCIDENTS
# ─────────────────────────────────────────────────────────────────────────────

INC_DETAILS = [
    'Worker slipped on oily surface near pump P-201. Required first aid for bruised knee.',
    'Pipe spool fell from rack during lifting operation; no injury but near miss.',
    'Worker received minor electrical shock through ungrounded power tool casing.',
    'Forklift collision with scaffold support; no personal injury but structure damaged.',
    'Worker fell from 1.5 m platform; sprained ankle, lost-time injury.',
    'Hand laceration from grinder kickback; required medical treatment, no time off.',
    'Hot slag burn through welder PPE during overhead welding.',
    'Worker exposed to chemical splash; rinsed at safety shower, no medical needed.',
    'Crane outrigger punched through pavement; crane operator unhurt.',
    'Trench wall collapse; worker recovered without injury — near miss.',
    'Fall from ladder (~2 m) onto concrete; concussion, lost-time injury.',
    'Vehicle struck stationary equipment; minor property damage.',
    'Worker pinned briefly between piping and rack; bruised ribs, restricted work.',
    'Sharp edge cut on neck during cleanup; first aid only.',
    'Worker unwell on site; precautionary medical evaluation, returned to work.',
    'Tool dropped from height — no impact, near miss only.',
    'Hot flange touched without gloves; minor burn, first aid.',
    'Object struck overhead support during lift; reroute required.',
]
INC_ACTIONS = [
    'Re-train crew on safe rigging; replace defective slings; toolbox talk on lift planning.',
    'Implement housekeeping plan for spill containment; review daily inspection.',
    'Replace damaged power tool; re-issue tool inspection checklist.',
    'Review lift plan with crane company; install marshal during all heavy lifts.',
    'Re-inspect all temporary platforms; install handrails where missing.',
    'Refresh refresher on grinder safety; mandatory face shield audit next week.',
    'Update PPE matrix for overhead hot work; introduce leather sleeves.',
    'Walk-down of all chemical handling areas; verify shower/eye-wash function.',
    'Engineer review of pavement; install crane spreader pads (mandatory).',
    'Re-train crew on shoring and trench inspection; use trench box from now on.',
    'Mandatory ladder safety training; replace fixed ladder with stairs where feasible.',
    'Review traffic plan; install bollards near critical equipment.',
    'Re-train on safe access in piping racks; barricade restricted zones.',
    'Toolbox talk on cleanup hazards; provide cut-resistant gloves to all.',
    'Heat-stress monitoring procedure; provide rest area and water access.',
]
INC_NOTES = [
    'Worker returned to site next day; HSE follow-up scheduled.',
    'Photos of incident scene attached for the investigation file.',
    'Subcontractor toolbox conducted within 24 hours.',
    'Coordinating with insurance for damaged equipment claim.',
    'Will update once external investigation report is received.',
    'Lessons-learned briefing held with all foremen.',
    'New procedure issued and signed by all relevant crew.',
]


def seed_incidents(db, ctx, seq):
    pid = ctx['pid']
    sevs = ctx['severities']; causes = ctx['incident_causes']
    pkgs = ctx['packages']; areas = ctx['areas']
    user_by_contact = ctx['user_by_contact']
    super_by_area = ctx['super_by_area']
    pkg_contacts = ctx['pkg_contacts']
    workers_by_pkg = ctx['workers_by_pkg']
    creators = list(ctx['project_team_users']) + list(ctx['vendor_users'])
    if ctx['project_owner']: creators.append(ctx['project_owner'])
    if not creators or not sevs or not causes: return

    def pick_status(days_back):
        r = random.random()
        if days_back > 90:
            return 'CLOSED' if r < 0.90 else 'PENDING_REVIEW'
        if days_back > 30:
            return ('CLOSED' if r < 0.55
                    else 'PENDING_REVIEW' if r < 0.70
                    else 'ACTION_IN_PROGRESS' if r < 0.88
                    else 'UNDER_INVESTIGATION')
        if days_back > 7:
            return ('UNDER_INVESTIGATION' if r < 0.30
                    else 'ACTION_IN_PROGRESS' if r < 0.55
                    else 'PENDING_REVIEW' if r < 0.75
                    else 'CLOSED' if r < 0.92 else 'DRAFT')
        return 'DRAFT' if r < 0.50 else ('UNDER_INVESTIGATION' if r < 0.85 else 'ACTION_IN_PROGRESS')

    n = 0
    for _ in range(TARGET_INCIDENTS):
        days_back = random.randint(1, WINDOW_DAYS)
        target = pick_status(days_back)
        sev = random.choice(sevs)
        if random.random() < 0.15:
            cause = next((c for c in causes if c.is_default), causes[-1])
            other_text = random.choice([
                'Slip on housekeeping debris.',
                'Tooling failure during preventive maintenance.',
                'Heat stress event during summer work.',
                'Communication breakdown between crews.',
            ])
        else:
            cause = random.choice([c for c in causes if not c.is_default])
            other_text = None

        pkg = random.choice(pkgs); area = random.choice(areas)
        wpool = workers_by_pkg.get(pkg.id, [])
        n_workers = random.choices([0, 1, 2, 3], weights=[1, 4, 3, 2])[0]
        chosen = random.sample(wpool, k=min(n_workers, len(wpool))) if wpool else []
        creator = random.choice(creators)

        cdt = utc_dt(days_ago(days_back))
        idate = (cdt - timedelta(days=random.randint(0, 2))).date().isoformat()
        inc = models.SafetyIncident(
            project_id=pid,
            project_seq_id=seq.next(models.SafetyIncident),
            package_id=pkg.id, area_id=area.id,
            incident_date=idate,
            severity_class_id=sev.id, incident_cause_id=cause.id,
            other_cause_text=other_text,
            details=random.choice(INC_DETAILS), action=random.choice(INC_ACTIONS),
            status='DRAFT', created_at=cdt, created_by_id=creator.id,
        )
        db.add(inc); db.flush()
        for w in chosen:
            db.add(models.SafetyIncidentWorker(incident_id=inc.id, worker_id=w.id))
        db.add(models.SafetyIncidentReview(
            incident_id=inc.id, event='CREATED', actor_id=creator.id, created_at=cdt
        ))
        if target == 'DRAFT':
            n += 1; continue

        sdt = cdt + timedelta(hours=random.randint(2, 24))
        inc.status = 'UNDER_INVESTIGATION'
        inc.submitted_at = sdt; inc.submitted_by_id = creator.id
        inc.updated_at = sdt; inc.updated_by_id = creator.id
        db.add(models.SafetyIncidentReview(
            incident_id=inc.id, event='SUBMITTED', actor_id=creator.id, created_at=sdt
        ))
        if target == 'UNDER_INVESTIGATION':
            n += 1; continue

        sup_actor = next((user_by_contact[cid] for cid in super_by_area.get(area.id, []) if cid in user_by_contact), creator)
        idt = sdt + timedelta(hours=random.randint(8, 72))
        inc.status = 'ACTION_IN_PROGRESS'
        inc.investigated_at = idt; inc.investigated_by_id = sup_actor.id
        inv_comment = random.choice([
            'Action plan reviewed — proceed.',
            'Approved with one extra step: notify subcontractor lead.',
            'Action plan acceptable; please coordinate with HSE.',
            'OK to proceed; report back when actions complete.',
            None,
        ])
        if inv_comment: inc.investigation_comment = inv_comment
        inc.updated_at = idt; inc.updated_by_id = sup_actor.id
        db.add(models.SafetyIncidentReview(
            incident_id=inc.id, event='INVESTIGATED', actor_id=sup_actor.id,
            comment=inv_comment, created_at=idt,
        ))
        if target == 'ACTION_IN_PROGRESS':
            n += 1; continue

        contact_actor = next((user_by_contact[cid] for cid in pkg_contacts.get(pkg.id, []) if cid in user_by_contact), creator)
        adt = idt + timedelta(days=random.randint(2, 8))
        inc.status = 'PENDING_REVIEW'
        inc.action_completed_at = adt; inc.action_completed_by_id = contact_actor.id
        ad_comment = random.choice([
            'All training and procedure updates completed.',
            'Defective tool replaced; team briefed.',
            'Corrective actions executed — see attached records.',
            'Implemented and verified on site this morning.',
            None,
        ])
        if ad_comment: inc.action_completion_comment = ad_comment
        inc.updated_at = adt; inc.updated_by_id = contact_actor.id
        db.add(models.SafetyIncidentReview(
            incident_id=inc.id, event='ACTION_DONE', actor_id=contact_actor.id,
            comment=ad_comment, created_at=adt,
        ))

        # ~20% PENDING_REVIEW gets reopened mid-flow
        if target == 'PENDING_REVIEW' and random.random() < 0.20:
            rdt = adt + timedelta(days=random.randint(1, 3))
            inc.status = 'ACTION_IN_PROGRESS'
            inc.action_completed_at = None; inc.action_completed_by_id = None; inc.action_completion_comment = None
            inc.updated_at = rdt; inc.updated_by_id = sup_actor.id
            db.add(models.SafetyIncidentReview(
                incident_id=inc.id, event='REOPENED', actor_id=sup_actor.id,
                comment='Action incomplete — please address remaining items.', created_at=rdt,
            ))
            n += 1; continue
        if target == 'PENDING_REVIEW':
            n += 1; continue

        clt = adt + timedelta(days=random.randint(1, 5))
        inc.status = 'CLOSED'
        inc.closed_at = clt; inc.closed_by_id = sup_actor.id
        inc.updated_at = clt; inc.updated_by_id = sup_actor.id
        cl_comment = random.choice([
            'Verified — closing.',
            'Actions effective; closing the incident.',
            'Closed; lessons learned shared with HSE committee.',
            None,
        ])
        db.add(models.SafetyIncidentReview(
            incident_id=inc.id, event='CLOSED', actor_id=sup_actor.id,
            comment=cl_comment, created_at=clt,
        ))
        n += 1

        # 35% chance to add 1-2 free-text notes
        if random.random() < 0.35:
            for _ in range(random.randint(1, 2)):
                ndt = sdt + timedelta(days=random.randint(1, 14))
                db.add(models.SafetyIncidentNote(
                    incident_id=inc.id, content=random.choice(INC_NOTES),
                    created_by_id=random.choice([creator.id, sup_actor.id, contact_actor.id]),
                    created_at=ndt,
                ))
    db.commit()
    print(f'  incidents: {n}')


# ─────────────────────────────────────────────────────────────────────────────
# SAFETY TOOLBOXES
# ─────────────────────────────────────────────────────────────────────────────

TBX_DETAILS = [
    'Discussion on harness anchor selection and inspection.',
    'Reviewed lift plan and exclusion zone for next week\'s heavy lift.',
    'Refresher on isolation procedure and double-block-bleed verification.',
    'Toolbox on hot work permits — when they apply, how to apply for one.',
    'Housekeeping standards reviewed; designated lay-down areas reinforced.',
    'Hand and power tool inspection checklist refresher.',
    'Excavation safety: shoring, sloping, ingress/egress.',
    'Site driving rules and pedestrian-vehicle separation.',
    'PPE inspection procedure; what to look for and when to replace.',
    'Site emergency procedures: muster points, alarms, first responders.',
    'Confined space entry — atmosphere testing and standby attendant.',
    'Reactive chemicals handling and spill response.',
    'Manual handling and ergonomics review.',
    'Working in extreme weather conditions — heat and cold stress.',
    'Hot work fire watch responsibilities.',
]


def seed_toolboxes(db, ctx, seq):
    pid = ctx['pid']
    cats = ctx['tbx_categories']
    pkgs = ctx['packages']
    workers_by_pkg = ctx['workers_by_pkg']
    super_users = ctx['super_users'] or ([ctx['project_owner']] if ctx['project_owner'] else [])
    creators = list(ctx['project_team_users']) + list(ctx['vendor_users'])
    if ctx['project_owner']: creators.append(ctx['project_owner'])
    if not creators or not cats: return

    obs_pool = db.query(models.SafetyObservation).filter_by(project_id=pid).all()
    inc_pool = db.query(models.SafetyIncident).filter_by(project_id=pid).all()

    def pick_status(days_back):
        r = random.random()
        if days_back > 30:
            return 'RECEIVED' if r < 0.85 else 'SUBMITTED'
        if days_back > 7:
            return 'RECEIVED' if r < 0.55 else 'SUBMITTED' if r < 0.90 else 'DRAFT'
        return 'DRAFT' if r < 0.40 else 'SUBMITTED'

    n = 0
    for _ in range(TARGET_TOOLBOXES):
        days_back = random.randint(1, WINDOW_DAYS)
        target = pick_status(days_back)

        if random.random() < 0.15:
            cat = next((c for c in cats if c.is_default), cats[-1])
            other_text = random.choice([
                'Refresher on radiography permits.',
                'Heat-stress prevention measures.',
                'Site behaviour during extended shutdown.',
            ])
        else:
            cat = random.choice([c for c in cats if not c.is_default])
            other_text = None

        n_pkgs = random.choices([1, 2, 3], weights=[5, 3, 1])[0]
        chosen_pkgs = random.sample(pkgs, k=n_pkgs)
        worker_pool = []
        for p in chosen_pkgs: worker_pool.extend(workers_by_pkg.get(p.id, []))
        chosen_workers = (
            random.sample(worker_pool, k=min(len(worker_pool), random.randint(2, 8)))
            if worker_pool else []
        )
        if worker_pool and random.random() < 0.30:
            given_worker = random.choice(worker_pool); given_user = None
        else:
            given_worker = None; given_user = random.choice(creators)
        creator = random.choice(creators)

        cdt = utc_dt(days_ago(days_back))
        talk_date = (cdt - timedelta(days=random.randint(0, 1))).date().isoformat()

        chosen_obs = []
        if obs_pool and random.random() < 0.40:
            chosen_obs = random.sample(obs_pool, k=random.randint(1, min(3, len(obs_pool))))
        chosen_inc = []
        if inc_pool and random.random() < 0.30:
            chosen_inc = random.sample(inc_pool, k=random.randint(1, min(2, len(inc_pool))))

        tbx = models.SafetyToolbox(
            project_id=pid,
            project_seq_id=seq.next(models.SafetyToolbox),
            category_id=cat.id, other_category_text=other_text,
            given_by_user_id=given_user.id if given_user else None,
            given_by_worker_id=given_worker.id if given_worker else None,
            talk_date=talk_date, details=random.choice(TBX_DETAILS),
            status='DRAFT', created_at=cdt, created_by_id=creator.id,
        )
        db.add(tbx); db.flush()
        for p in chosen_pkgs:
            db.add(models.SafetyToolboxPackage(toolbox_id=tbx.id, package_id=p.id))
        for w in chosen_workers:
            db.add(models.SafetyToolboxWorker(toolbox_id=tbx.id, worker_id=w.id))
        for o in chosen_obs:
            db.add(models.SafetyToolboxObservation(toolbox_id=tbx.id, observation_id=o.id))
        for ic in chosen_inc:
            db.add(models.SafetyToolboxIncident(toolbox_id=tbx.id, incident_id=ic.id))
        db.add(models.SafetyToolboxReview(
            toolbox_id=tbx.id, event='CREATED', actor_id=creator.id, created_at=cdt,
        ))
        if target == 'DRAFT':
            n += 1; continue

        sdt = cdt + timedelta(hours=random.randint(1, 24))
        tbx.status = 'SUBMITTED'; tbx.submitted_at = sdt; tbx.submitted_by_id = creator.id
        tbx.updated_at = sdt; tbx.updated_by_id = creator.id
        db.add(models.SafetyToolboxReview(
            toolbox_id=tbx.id, event='SUBMITTED', actor_id=creator.id, created_at=sdt,
        ))
        if target == 'SUBMITTED':
            # 12% chance of a reopen→resubmit cycle in the history
            if random.random() < 0.12 and super_users:
                rdt = sdt + timedelta(hours=random.randint(6, 48))
                sup = random.choice(super_users)
                tbx.status = 'DRAFT'
                tbx.reopened_at = rdt; tbx.reopened_by_id = sup.id
                tbx.updated_at = rdt; tbx.updated_by_id = sup.id
                db.add(models.SafetyToolboxReview(
                    toolbox_id=tbx.id, event='REOPENED', actor_id=sup.id,
                    comment='Please add list of attendees.', created_at=rdt,
                ))
                rsdt = rdt + timedelta(hours=random.randint(1, 12))
                tbx.status = 'SUBMITTED'; tbx.submitted_at = rsdt; tbx.submitted_by_id = creator.id
                tbx.updated_at = rsdt; tbx.updated_by_id = creator.id
                db.add(models.SafetyToolboxReview(
                    toolbox_id=tbx.id, event='SUBMITTED', actor_id=creator.id, created_at=rsdt,
                ))
            n += 1; continue

        ack_actor = random.choice(super_users) if super_users else creator
        adt = sdt + timedelta(hours=random.randint(2, 60))
        tbx.status = 'RECEIVED'; tbx.acknowledged_at = adt; tbx.acknowledged_by_id = ack_actor.id
        ack_comment = random.choice([
            'Received — thanks.',
            'Confirmed — consistent with site procedures.',
            'Good content; sharing with HSE.',
            None, None,
        ])
        if ack_comment: tbx.acknowledge_comment = ack_comment
        tbx.updated_at = adt; tbx.updated_by_id = ack_actor.id
        db.add(models.SafetyToolboxReview(
            toolbox_id=tbx.id, event='ACKNOWLEDGED', actor_id=ack_actor.id,
            comment=ack_comment, created_at=adt,
        ))
        n += 1
    db.commit()
    print(f'  toolboxes: {n}')


# ─────────────────────────────────────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────────────────────────────────────

def main():
    db = database.SessionLocal()
    try:
        ctx = get_context(db)
        proj = ctx['project']
        print(f'Seeding project: {proj.project_number} (id={proj.id})  window={WINDOW_DAYS} days')
        seq = SeqCounter(db, proj.id)

        # Foundations (idempotent)
        print('---- Foundations ----')
        ensure_foundations(db, ctx, seq)
        ctx = get_context(db)  # refresh

        # Wipe workflow data
        wipe(db, proj.id)

        # Reseed
        print('---- Construction ----')
        seed_work_permits(db, ctx, seq)
        seed_lotos(db, ctx, seq)
        seed_daily_reports(db, ctx)
        print('---- Safety ----')
        seed_observations(db, ctx, seq)
        seed_incidents(db, ctx, seq)
        seed_toolboxes(db, ctx, seq)

        print()
        print('Final tallies:')
        pid = proj.id
        print(f'  area-supervisor links: {db.query(models.AreaSiteSupervisor).join(models.Area).filter(models.Area.project_id==pid).count()}')
        print(f'  subcontractors: {db.query(models.Subcontractor).filter_by(project_id=pid).count()}')
        print(f'  workers:        {db.query(models.Worker).filter_by(project_id=pid).count()}')
        print(f'  work permits:   {db.query(models.WorkPermit).filter_by(project_id=pid).count()}')
        print(f'    perm reviews: {db.query(models.WorkPermitReview).join(models.WorkPermit).filter(models.WorkPermit.project_id==pid).count()}')
        print(f'    permit areas: {db.query(models.WorkPermitArea).join(models.WorkPermit).filter(models.WorkPermit.project_id==pid).count()}')
        print(f'    area approvals: {db.query(models.WorkPermitAreaApproval).join(models.WorkPermit).filter(models.WorkPermit.project_id==pid).count()}')
        print(f'  LOTOs:          {db.query(models.LOTO).filter_by(project_id=pid).count()}')
        print(f'  daily reports:  {db.query(models.DailyReport).filter_by(project_id=pid).count()}')
        print(f'  observations:   {db.query(models.SafetyObservation).filter_by(project_id=pid).count()}')
        print(f'    obs reviews:  {db.query(models.SafetyObservationReview).join(models.SafetyObservation).filter(models.SafetyObservation.project_id==pid).count()}')
        print(f'  incidents:      {db.query(models.SafetyIncident).filter_by(project_id=pid).count()}')
        print(f'    inc reviews:  {db.query(models.SafetyIncidentReview).join(models.SafetyIncident).filter(models.SafetyIncident.project_id==pid).count()}')
        print(f'    inc notes:    {db.query(models.SafetyIncidentNote).join(models.SafetyIncident).filter(models.SafetyIncident.project_id==pid).count()}')
        print(f'  toolboxes:      {db.query(models.SafetyToolbox).filter_by(project_id=pid).count()}')
        print(f'    tbx reviews:  {db.query(models.SafetyToolboxReview).join(models.SafetyToolbox).filter(models.SafetyToolbox.project_id==pid).count()}')
    finally:
        db.close()


if __name__ == '__main__':
    main()
