"""Seed realistic construction-module demo data for project KUT-PIS (id=7).

Populates subcontractors, workers (all workflow states), work logs, and
work permits + LOTOs covering every lifecycle scenario:

    • DRAFT permit (never submitted)
    • PENDING permit (awaiting supervisor decisions)
    • PENDING permit with REFUSED LOTO (the deadlock recovery case)
    • PENDING permit — extension request of a previously approved permit
    • APPROVED permit, work ongoing
    • APPROVED permit past finish date (Close/Extend action point)
    • REJECTED permit
    • CLOSED permit with LOTOs still TO_BE_RELEASED
    • CLOSED permit with all LOTOs RELEASED

Worker states covered: PENDING, APPROVED, REJECTED, REJECTED→CANCELLED,
REJECTED→RESUBMIT (currently PENDING again).

The script is idempotent: if any worker / subcontractor / work permit
already exists for KUT-PIS it exits without doing anything.

Run with:   python seed_kut_construction.py
"""
from __future__ import annotations
from datetime import datetime, timedelta, date
from typing import Optional

import database
import models


PROJECT_ID = 7

# Packages (from DB)
PKG_P001 = 16   # Building
PKG_P002 = 17   # Equipment
PKG_CTG  = 18   # Contingencies

# Package owners / contacts we'll use as actors
OWNER_UID          = 29   # Owner (project owner)
ADMIN_UID          = 1    # IPS Administrator
PO1_UID            = 30   # Package Owner 1 (contact 58)
PO2_UID            = 36   # Package Owner 2 (contact 64, also supervisor on A2)
CM_UID             = 112  # Construction Manager (contact 141, supervisor on A1, A3)
BIDDER1_UID        = 31   # Bidder 1 (contact 59, on P001 + CTG)
BIDDER2_UID        = 32   # Bidder 2 (contact 60, on P002)
BIDDER3_UID        = 33   # Bidder 3 (contact 61, on P001)

# Areas
A1 = 2
A2 = 3
A3 = 4

# Certificate types
CERT_VCA_BASIC      = 91
CERT_VCA_SUP        = 92
CERT_FIRST_AID      = 93
CERT_WORKING_HEIGHT = 94
CERT_CONFINED_SPACE = 95
CERT_SCAFFOLD       = 96
CERT_RIGGING        = 97
CERT_FORKLIFT       = 98
CERT_CRANE          = 99
CERT_MEWP           = 100
CERT_WELDING        = 101
CERT_ELEC           = 102
CERT_HOT_WORK       = 103
CERT_EXCAVATION     = 104
CERT_HAZMAT         = 105

# Work permit types
PT_COLD      = 73
PT_HOT       = 74
PT_CONFINED  = 75
PT_ELEC      = 76
PT_LOTO      = 77
PT_EXCAV     = 78
PT_HEIGHT    = 79
PT_LIFTING   = 80
PT_PRESSURE  = 82
PT_CHEMICAL  = 83


# ── Helpers ──────────────────────────────────────────────────────────────────

def _next_seq(db, model) -> int:
    return models.next_project_seq(db, model, PROJECT_ID)


def _already_seeded(db) -> bool:
    """Guard so the script is safe to re-run. We key off a marker record
    (subcontractor "Delta Civil Works BV") that only this script creates —
    so the script appends cleanly to any unrelated hand-made test rows."""
    marker = (db.query(models.Subcontractor)
                .filter_by(project_id=PROJECT_ID, company="Delta Civil Works BV")
                .first())
    return marker is not None


def _dt(iso: str) -> datetime:
    """ISO date (YYYY-MM-DD) → datetime at noon that day."""
    return datetime.fromisoformat(iso + "T12:00:00")


def make_subcontractor(db, *, package_id: int, company: str, contact_person: str,
                       phone: str, email: str, description: str,
                       created_uid: int, created_at: datetime):
    s = models.Subcontractor(
        project_seq_id=_next_seq(db, models.Subcontractor),
        project_id=PROJECT_ID,
        package_id=package_id,
        company=company, contact_person=contact_person, phone=phone,
        email=email, description=description,
        created_by_id=created_uid, created_at=created_at,
    )
    db.add(s); db.flush()
    return s


def make_worker(db, *, package_id: int, name: str, phone: str,
                is_sub: bool, subcontractor_id: Optional[int],
                cert_ids: list, status: str,
                created_uid: int, created_at: datetime,
                submitted_at: Optional[datetime] = None,
                reviewed_at: Optional[datetime] = None,
                reviewed_by_uid: Optional[int] = None,
                rejection_comment: Optional[str] = None):
    w = models.Worker(
        project_seq_id=_next_seq(db, models.Worker),
        project_id=PROJECT_ID, package_id=package_id,
        name=name, phone=phone,
        is_subcontractor=is_sub, subcontractor_id=subcontractor_id,
        status=status,
        submitted_at=submitted_at or created_at,
        reviewed_at=reviewed_at,
        reviewed_by_id=reviewed_by_uid,
        rejection_comment=rejection_comment,
        created_by_id=created_uid, created_at=created_at,
    )
    db.add(w); db.flush()
    for cid in cert_ids:
        db.add(models.WorkerCertificate(worker_id=w.id, certificate_type_id=cid))
    return w


def log_worker(db, worker, event, actor_uid, *, approved=None, comment=None,
               at: Optional[datetime] = None):
    r = models.WorkerReview(
        worker_id=worker.id, event=event, approved=approved,
        comment=comment, actor_id=actor_uid,
    )
    if at is not None:
        r.created_at = at
    db.add(r)


def make_work_log(db, *, package_id: int, start_date: str, end_date: Optional[str],
                  notes: str, created_uid: int, created_at: datetime):
    wl = models.WorkLog(
        project_id=PROJECT_ID, package_id=package_id,
        start_date=start_date, end_date=end_date,
        notes=notes,
        created_by_id=created_uid, created_at=created_at,
    )
    db.add(wl); db.flush()
    return wl


def make_permit(db, *, package_id: int, title: str, description: str,
                start_date: str, end_date: str,
                permit_type_ids: list, area_ids: list,
                hazards: list, hazards_other: str = "",
                ppe_keys: list, ppe_other: str = "",
                status: str,
                created_uid: int, created_at: datetime,
                submitted_at: Optional[datetime] = None,
                submitted_by_uid: Optional[int] = None):
    p = models.WorkPermit(
        project_seq_id=_next_seq(db, models.WorkPermit),
        project_id=PROJECT_ID, package_id=package_id,
        title=title, description=description,
        start_date=start_date, end_date=end_date,
        hazards_other=(hazards_other or None),
        ppe_other=(ppe_other or None),
        status=status,
        submitted_at=submitted_at,
        submitted_by_id=submitted_by_uid,
        created_by_id=created_uid, created_at=created_at,
    )
    db.add(p); db.flush()
    for ptid in permit_type_ids:
        db.add(models.WorkPermitPermitType(work_permit_id=p.id, permit_type_id=ptid))
    for aid in area_ids:
        db.add(models.WorkPermitArea(work_permit_id=p.id, area_id=aid))
    for h in hazards:  # list of (key, measure)
        db.add(models.WorkPermitHazard(
            work_permit_id=p.id, hazard_key=h[0], preventive_measure=h[1],
        ))
    for ppe in ppe_keys:
        db.add(models.WorkPermitPPE(work_permit_id=p.id, ppe_key=ppe))
    db.flush()
    return p


def seed_area_approvals(db, permit, decisions: list):
    """decisions: list of (area_id, status, reviewed_uid, reviewed_at, comment?)."""
    for area_id, st, uid, ts, *rest in decisions:
        cmt = rest[0] if rest else None
        ap = models.WorkPermitAreaApproval(
            work_permit_id=permit.id, area_id=area_id,
            status=st,
            reviewed_at=ts if st != "PENDING" else None,
            reviewed_by_id=uid if st != "PENDING" else None,
            rejection_comment=cmt,
        )
        db.add(ap)


def log_permit(db, permit, event, actor_uid, *, area_id=None, approved=None,
               comment=None, at: Optional[datetime] = None):
    r = models.WorkPermitReview(
        work_permit_id=permit.id, event=event, area_id=area_id,
        approved=approved, comment=comment, actor_id=actor_uid,
    )
    if at is not None:
        r.created_at = at
    db.add(r)


def make_loto(db, *, permit, tag: str, description: str, status: str,
              created_uid: int, created_at: datetime,
              submitted_at: Optional[datetime] = None,
              reviewed_at: Optional[datetime] = None,
              reviewed_by_uid: Optional[int] = None,
              refusal_comment: Optional[str] = None):
    locked_state = (status == "LOCKED")
    l = models.LOTO(
        project_seq_id=_next_seq(db, models.LOTO),
        project_id=PROJECT_ID, work_permit_id=permit.id,
        tag_number=tag, description=description,
        status=status, locked_state=locked_state,
        submitted_at=submitted_at or created_at,
        reviewed_at=reviewed_at,
        reviewed_by_id=reviewed_by_uid,
        refusal_comment=refusal_comment,
        created_by_id=created_uid, created_at=created_at,
    )
    db.add(l); db.flush()
    return l


def log_loto(db, loto, event, actor_uid, *, confirmed=None, comment=None,
             at: Optional[datetime] = None):
    r = models.LOTOReview(
        loto_id=loto.id, event=event, confirmed=confirmed,
        comment=comment, actor_id=actor_uid,
    )
    if at is not None:
        r.created_at = at
    db.add(r)


# ── Main seed ────────────────────────────────────────────────────────────────

def main():
    db = database.SessionLocal()
    try:
        if _already_seeded(db):
            print("KUT-PIS already has construction data — aborting so nothing is duplicated.")
            return

        # Anchor dates: 8-month window ending today (2026-04-22).
        TODAY = date.today()
        T = lambda iso: _dt(iso)

        # ════════════════════════════════════════════════════════════════════
        # SUBCONTRACTORS
        # ════════════════════════════════════════════════════════════════════
        print("-> subcontractors")
        sub_delta = make_subcontractor(
            db, package_id=PKG_P001, company="Delta Civil Works BV",
            contact_person="Erik Vandenberghe", phone="+32 3 555 0110",
            email="ev@deltacivil.be",
            description="Civil works, foundations, concrete pours",
            created_uid=BIDDER1_UID, created_at=T("2025-08-25"))
        sub_omega = make_subcontractor(
            db, package_id=PKG_P001, company="Omega Foundations NV",
            contact_person="Julia Novak", phone="+32 3 555 0211",
            email="j.novak@omegafoundations.be",
            description="Piling and ground improvement",
            created_uid=BIDDER1_UID, created_at=T("2025-09-02"))
        sub_alpha = make_subcontractor(
            db, package_id=PKG_P001, company="Alpha Masonry Co.",
            contact_person="Koen Hassan", phone="+32 3 555 0322",
            email="k.hassan@alphamasonry.be",
            description="Block-work, brick-work and plastering",
            created_uid=BIDDER3_UID, created_at=T("2025-09-18"))
        sub_precision = make_subcontractor(
            db, package_id=PKG_P002, company="Precision Piping GmbH",
            contact_person="Klaus Werner", phone="+49 30 555 0123",
            email="k.werner@precisionpiping.de",
            description="Stainless steel piping, welding, pressure testing",
            created_uid=BIDDER2_UID, created_at=T("2025-08-28"))
        sub_autoflow = make_subcontractor(
            db, package_id=PKG_P002, company="AutoFlow Instruments",
            contact_person="Tara Lopez", phone="+32 2 555 0433",
            email="t.lopez@autoflow.eu",
            description="Instrumentation loops, DCS commissioning",
            created_uid=BIDDER2_UID, created_at=T("2025-10-05"))

        # ════════════════════════════════════════════════════════════════════
        # WORKERS — cover every status + history
        # ════════════════════════════════════════════════════════════════════
        print("-> workers")

        # -- Bidder 1 / P001 (Delta Civil + Omega): mostly approved, 1 rejected
        approved_p001_b1 = [
            ("Jean De Clercq", "+32 470 111001", True,  sub_delta.id,
                [CERT_VCA_BASIC, CERT_WORKING_HEIGHT, CERT_SCAFFOLD],
                T("2025-08-28"), T("2025-09-02")),
            ("Pieter Vermeulen", "+32 470 111002", True, sub_delta.id,
                [CERT_VCA_BASIC, CERT_EXCAVATION, CERT_FORKLIFT],
                T("2025-09-01"), T("2025-09-04")),
            ("Ahmed El-Sayed", "+32 470 111003", True, sub_omega.id,
                [CERT_VCA_BASIC, CERT_RIGGING, CERT_CRANE],
                T("2025-09-05"), T("2025-09-09")),
            ("Mehmet Yilmaz", "+32 470 111004", False, None,
                [CERT_VCA_SUP, CERT_FIRST_AID, CERT_WORKING_HEIGHT],
                T("2025-09-08"), T("2025-09-12")),
        ]
        for name, phone, is_sub, sid, certs, submitted, reviewed in approved_p001_b1:
            w = make_worker(db, package_id=PKG_P001, name=name, phone=phone,
                            is_sub=is_sub, subcontractor_id=sid, cert_ids=certs,
                            status="APPROVED",
                            created_uid=BIDDER1_UID, created_at=submitted,
                            submitted_at=submitted, reviewed_at=reviewed,
                            reviewed_by_uid=CM_UID)
            log_worker(db, w, "SUBMIT", BIDDER1_UID, at=submitted)
            log_worker(db, w, "APPROVE", CM_UID, approved=True, at=reviewed)

        # PENDING worker
        w_p1 = make_worker(db, package_id=PKG_P001, name="Luc Hendrickx",
                           phone="+32 470 111201", is_sub=False, subcontractor_id=None,
                           cert_ids=[CERT_VCA_BASIC, CERT_MEWP],
                           status="PENDING",
                           created_uid=BIDDER1_UID, created_at=T("2026-04-12"),
                           submitted_at=T("2026-04-12"))
        log_worker(db, w_p1, "SUBMIT", BIDDER1_UID, at=T("2026-04-12"))

        # REJECTED worker, awaiting vendor action
        w_rej1 = make_worker(db, package_id=PKG_P001, name="Dragos Popescu",
                             phone="+40 721 555001", is_sub=True, subcontractor_id=sub_delta.id,
                             cert_ids=[CERT_VCA_BASIC],
                             status="REJECTED",
                             created_uid=BIDDER1_UID, created_at=T("2026-04-06"),
                             submitted_at=T("2026-04-06"),
                             reviewed_at=T("2026-04-08"),
                             reviewed_by_uid=CM_UID,
                             rejection_comment="Working-at-heights certificate missing — required for this scope.")
        log_worker(db, w_rej1, "SUBMIT", BIDDER1_UID, at=T("2026-04-06"))
        log_worker(db, w_rej1, "REJECT", CM_UID, approved=False,
                   comment="Working-at-heights certificate missing — required for this scope.",
                   at=T("2026-04-08"))

        # REJECTED → CANCELLED (vendor withdrew)
        w_canc = make_worker(db, package_id=PKG_P001, name="Nicolae Tanase",
                             phone="+40 721 555002", is_sub=True, subcontractor_id=sub_omega.id,
                             cert_ids=[CERT_VCA_BASIC],
                             status="CANCELLED",
                             created_uid=BIDDER1_UID, created_at=T("2025-10-10"),
                             submitted_at=T("2025-10-10"),
                             reviewed_at=T("2025-10-12"),
                             reviewed_by_uid=CM_UID,
                             rejection_comment="Duplicate declaration — worker already on package.")
        log_worker(db, w_canc, "SUBMIT", BIDDER1_UID, at=T("2025-10-10"))
        log_worker(db, w_canc, "REJECT", CM_UID, approved=False,
                   comment="Duplicate declaration — worker already on package.",
                   at=T("2025-10-12"))
        log_worker(db, w_canc, "CANCEL", BIDDER1_UID,
                   comment="Vendor acknowledged duplication and withdrew.",
                   at=T("2025-10-13"))

        # -- Bidder 3 / P001: 3 approved + 1 pending
        approved_p001_b3 = [
            ("Tom De Wit", "+32 470 112001", True, sub_alpha.id,
                [CERT_VCA_BASIC, CERT_SCAFFOLD], T("2025-09-22"), T("2025-09-25")),
            ("Sven Peeters", "+32 470 112002", True, sub_alpha.id,
                [CERT_VCA_BASIC, CERT_WORKING_HEIGHT], T("2025-09-24"), T("2025-09-27")),
            ("Bart Segers", "+32 470 112003", False, None,
                [CERT_VCA_SUP, CERT_FIRST_AID], T("2025-10-01"), T("2025-10-03")),
        ]
        for name, phone, is_sub, sid, certs, submitted, reviewed in approved_p001_b3:
            w = make_worker(db, package_id=PKG_P001, name=name, phone=phone,
                            is_sub=is_sub, subcontractor_id=sid, cert_ids=certs,
                            status="APPROVED",
                            created_uid=BIDDER3_UID, created_at=submitted,
                            submitted_at=submitted, reviewed_at=reviewed,
                            reviewed_by_uid=CM_UID)
            log_worker(db, w, "SUBMIT", BIDDER3_UID, at=submitted)
            log_worker(db, w, "APPROVE", CM_UID, approved=True, at=reviewed)

        w_p2 = make_worker(db, package_id=PKG_P001, name="Tim Vlaeminck",
                           phone="+32 470 112004", is_sub=True, subcontractor_id=sub_alpha.id,
                           cert_ids=[CERT_VCA_BASIC],
                           status="PENDING",
                           created_uid=BIDDER3_UID, created_at=T("2026-04-15"),
                           submitted_at=T("2026-04-15"))
        log_worker(db, w_p2, "SUBMIT", BIDDER3_UID, at=T("2026-04-15"))

        # -- Bidder 2 / P002: approved + rejected/cancelled + pending + resubmit
        approved_p002_b2 = [
            ("Andreas Schmidt", "+49 160 7770011", True, sub_precision.id,
                [CERT_VCA_BASIC, CERT_WELDING, CERT_HOT_WORK], T("2025-09-04"), T("2025-09-08")),
            ("Matthias Becker", "+49 160 7770022", True, sub_precision.id,
                [CERT_VCA_BASIC, CERT_WELDING, CERT_CONFINED_SPACE], T("2025-09-05"), T("2025-09-09")),
            ("Felix Weber", "+49 160 7770033", True, sub_precision.id,
                [CERT_VCA_BASIC, CERT_RIGGING, CERT_CRANE, CERT_HOT_WORK],
                T("2025-09-08"), T("2025-09-11")),
            ("Simone Ricci", "+39 320 555011", True, sub_autoflow.id,
                [CERT_VCA_BASIC, CERT_ELEC], T("2025-10-12"), T("2025-10-15")),
        ]
        for name, phone, is_sub, sid, certs, submitted, reviewed in approved_p002_b2:
            w = make_worker(db, package_id=PKG_P002, name=name, phone=phone,
                            is_sub=is_sub, subcontractor_id=sid, cert_ids=certs,
                            status="APPROVED",
                            created_uid=BIDDER2_UID, created_at=submitted,
                            submitted_at=submitted, reviewed_at=reviewed,
                            reviewed_by_uid=PO2_UID)
            log_worker(db, w, "SUBMIT", BIDDER2_UID, at=submitted)
            log_worker(db, w, "APPROVE", PO2_UID, approved=True, at=reviewed)

        # RESUBMITTED worker (first rejected, then resubmitted — currently PENDING again)
        w_resub = make_worker(db, package_id=PKG_P002, name="Sven Mueller",
                              phone="+49 160 7770055", is_sub=True, subcontractor_id=sub_precision.id,
                              cert_ids=[CERT_VCA_BASIC, CERT_WELDING, CERT_HOT_WORK, CERT_CONFINED_SPACE],
                              status="PENDING",
                              created_uid=BIDDER2_UID, created_at=T("2026-03-20"),
                              submitted_at=T("2026-04-16"))
        log_worker(db, w_resub, "SUBMIT", BIDDER2_UID, at=T("2026-03-20"))
        log_worker(db, w_resub, "REJECT", PO2_UID, approved=False,
                   comment="Hot-work certificate document not attached.",
                   at=T("2026-03-25"))
        log_worker(db, w_resub, "RESUBMIT", BIDDER2_UID,
                   comment="Hot-work certificate uploaded, please re-review.",
                   at=T("2026-04-16"))

        # Plain PENDING
        w_p3 = make_worker(db, package_id=PKG_P002, name="Yuri Ivanov",
                           phone="+31 6 50 444011", is_sub=False, subcontractor_id=None,
                           cert_ids=[CERT_VCA_BASIC, CERT_ELEC],
                           status="PENDING",
                           created_uid=BIDDER2_UID, created_at=T("2026-04-18"),
                           submitted_at=T("2026-04-18"))
        log_worker(db, w_p3, "SUBMIT", BIDDER2_UID, at=T("2026-04-18"))

        # -- Bidder 1 / CTG: 2 approved
        for name, phone, certs, submitted, reviewed in [
            ("Peter Callens", "+32 470 113001",
                [CERT_VCA_BASIC, CERT_EXCAVATION], T("2025-11-04"), T("2025-11-06")),
            ("Hans Vermeiren", "+32 470 113002",
                [CERT_VCA_BASIC, CERT_FIRST_AID, CERT_MEWP], T("2025-11-08"), T("2025-11-11")),
        ]:
            w = make_worker(db, package_id=PKG_CTG, name=name, phone=phone,
                            is_sub=False, subcontractor_id=None, cert_ids=certs,
                            status="APPROVED",
                            created_uid=BIDDER1_UID, created_at=submitted,
                            submitted_at=submitted, reviewed_at=reviewed,
                            reviewed_by_uid=CM_UID)
            log_worker(db, w, "SUBMIT", BIDDER1_UID, at=submitted)
            log_worker(db, w, "APPROVE", CM_UID, approved=True, at=reviewed)

        # ════════════════════════════════════════════════════════════════════
        # WORK LOGS
        # ════════════════════════════════════════════════════════════════════
        print("-> work logs")
        make_work_log(db, package_id=PKG_P001, start_date="2025-09-15",
                      end_date="2025-12-20",
                      notes="Foundations & civil works — Area 1 north side",
                      created_uid=BIDDER1_UID, created_at=T("2025-09-15"))
        make_work_log(db, package_id=PKG_P001, start_date="2025-10-01",
                      end_date="2026-01-15",
                      notes="Structural steel erection — Area 1/3",
                      created_uid=BIDDER1_UID, created_at=T("2025-10-01"))
        make_work_log(db, package_id=PKG_P001, start_date="2025-10-12",
                      end_date="2026-02-10",
                      notes="Masonry & plastering — Area 3",
                      created_uid=BIDDER3_UID, created_at=T("2025-10-12"))
        make_work_log(db, package_id=PKG_P001, start_date="2026-02-01",
                      end_date=None,
                      notes="Finishing works — Area 1 (ongoing)",
                      created_uid=BIDDER1_UID, created_at=T("2026-02-01"))
        make_work_log(db, package_id=PKG_P002, start_date="2025-09-20",
                      end_date="2026-02-28",
                      notes="Process piping fabrication and erection — Area 2",
                      created_uid=BIDDER2_UID, created_at=T("2025-09-20"))
        make_work_log(db, package_id=PKG_P002, start_date="2025-11-10",
                      end_date=None,
                      notes="Instrumentation & DCS loop checks — Area 2/3 (ongoing)",
                      created_uid=BIDDER2_UID, created_at=T("2025-11-10"))
        make_work_log(db, package_id=PKG_CTG, start_date="2025-11-15",
                      end_date="2026-01-30",
                      notes="Temporary site roads & fencing — contingency pool",
                      created_uid=BIDDER1_UID, created_at=T("2025-11-15"))
        make_work_log(db, package_id=PKG_CTG, start_date="2026-03-05",
                      end_date=None,
                      notes="Emergency repair crew on call",
                      created_uid=BIDDER1_UID, created_at=T("2026-03-05"))

        # ════════════════════════════════════════════════════════════════════
        # WORK PERMITS — every state + extension + deadlock
        # ════════════════════════════════════════════════════════════════════
        print("-> work permits")
        # Hazards / PPE picked from the catalogues already used in construction.js.
        HAZ_FIRE    = ("Fire Hazard", "Extinguishers on standby; hot-work watch")
        HAZ_HEIGHT  = ("Risk of Falling", "Full harness + collective edge protection")
        HAZ_ELEC    = ("Electrical Danger", "LOTO on all live circuits; permit-to-work")
        HAZ_CRUSH   = ("Crusshing hazard", "Exclusion zone; rigger signals only")
        HAZ_LIFT    = ("Lifting operations", "Certified rigger + daily equipment check")
        HAZ_TOXIC   = ("Toxic substances", "Continuous gas monitoring; respiratory PPE")
        HAZ_SLIP    = ("Slippery surface", "Anti-slip matting; housekeeping at end of shift")
        HAZ_HOT     = ("Hot surface", "Thermal gloves; insulate hot surfaces; cool-down period")

        PPE_STD = ["Safety goggles", "Safety helmet", "Safety shoes", "Protective gloves"]
        PPE_HOT = PPE_STD + ["Safety clothing", "respiratory protection"]
        PPE_HEIGHT = PPE_STD + ["Harness"]
        PPE_NOISE = PPE_STD + ["Ear protection"]
        PPE_CHEM  = PPE_STD + ["Safety clothing", "respiratory protection", "Mask"]

        # ─── 1. CLOSED permit, all LOTOs RELEASED — full happy-path lifecycle
        wp1 = make_permit(
            db, package_id=PKG_P001,
            title="Structural steel erection phase 1 — columns grid A-E",
            description="Erection of steel columns and primary beams, including bolt-up of "
                        "splices and grouting of base plates on Area 1.",
            start_date="2025-10-05", end_date="2025-12-15",
            permit_type_ids=[PT_COLD, PT_HEIGHT, PT_LIFTING, PT_LOTO],
            area_ids=[A1, A3],
            hazards=[HAZ_HEIGHT, HAZ_LIFT, HAZ_CRUSH],
            ppe_keys=PPE_HEIGHT,
            status="CLOSED",
            created_uid=BIDDER1_UID, created_at=T("2025-09-28"),
            submitted_at=T("2025-09-30"), submitted_by_uid=BIDDER1_UID,
        )
        seed_area_approvals(db, wp1, [
            (A1, "APPROVED", CM_UID, T("2025-10-02")),
            (A3, "APPROVED", CM_UID, T("2025-10-02")),
        ])
        log_permit(db, wp1, "SUBMIT", BIDDER1_UID, at=T("2025-09-30"))
        log_permit(db, wp1, "APPROVE", CM_UID, area_id=A1, approved=True,
                   at=T("2025-10-02"))
        log_permit(db, wp1, "APPROVE", CM_UID, area_id=A3, approved=True,
                   at=T("2025-10-02"))
        log_permit(db, wp1, "CLOSE", BIDDER1_UID,
                   comment="Erection complete; all LOTOs handed off for release.",
                   at=T("2025-12-18"))
        # 2 LOTOs, both released
        loto_a = make_loto(
            db, permit=wp1, tag="LT-STEEL-01",
            description="Bolt-up rig on column row B",
            status="RELEASED", created_uid=BIDDER1_UID, created_at=T("2025-10-01"),
            submitted_at=T("2025-10-01"), reviewed_at=T("2025-12-20"),
            reviewed_by_uid=CM_UID)
        log_loto(db, loto_a, "SUBMIT", BIDDER1_UID, at=T("2025-10-01"))
        log_loto(db, loto_a, "CONFIRM", CM_UID, confirmed=True, at=T("2025-10-03"))
        log_loto(db, loto_a, "RELEASE_REQUEST", BIDDER1_UID,
                 comment="Permit closed — release requested", at=T("2025-12-18"))
        log_loto(db, loto_a, "RELEASE", CM_UID, at=T("2025-12-20"))

        loto_b = make_loto(
            db, permit=wp1, tag="LT-STEEL-02",
            description="Temporary hoist power isolation",
            status="RELEASED", created_uid=BIDDER1_UID, created_at=T("2025-10-01"),
            submitted_at=T("2025-10-01"), reviewed_at=T("2025-12-20"),
            reviewed_by_uid=CM_UID)
        log_loto(db, loto_b, "SUBMIT", BIDDER1_UID, at=T("2025-10-01"))
        log_loto(db, loto_b, "CONFIRM", CM_UID, confirmed=True, at=T("2025-10-03"))
        log_loto(db, loto_b, "RELEASE_REQUEST", BIDDER1_UID,
                 comment="Permit closed — release requested", at=T("2025-12-18"))
        log_loto(db, loto_b, "RELEASE", CM_UID, at=T("2025-12-20"))

        # ─── 2. CLOSED permit, LOTOs still TO_BE_RELEASED (closed yesterday)
        wp2 = make_permit(
            db, package_id=PKG_P002,
            title="Stainless piping hydro-test — process loop 2A",
            description="Hydrostatic test of SS piping loop in Area 2 up to design pressure.",
            start_date="2026-03-10", end_date="2026-04-20",
            permit_type_ids=[PT_COLD, PT_PRESSURE, PT_LOTO],
            area_ids=[A2],
            hazards=[HAZ_ELEC],
            ppe_keys=PPE_STD,
            status="CLOSED",
            created_uid=BIDDER2_UID, created_at=T("2026-03-05"),
            submitted_at=T("2026-03-07"), submitted_by_uid=BIDDER2_UID,
        )
        seed_area_approvals(db, wp2, [
            (A2, "APPROVED", PO2_UID, T("2026-03-09")),
        ])
        log_permit(db, wp2, "SUBMIT", BIDDER2_UID, at=T("2026-03-07"))
        log_permit(db, wp2, "APPROVE", PO2_UID, area_id=A2, approved=True,
                   at=T("2026-03-09"))
        log_permit(db, wp2, "CLOSE", BIDDER2_UID,
                   comment="Hydro-test completed successfully — release LOTOs on site.",
                   at=T("2026-04-21"))
        loto_c = make_loto(
            db, permit=wp2, tag="LT-PIPE-10",
            description="Isolation valve V-210A locked closed",
            status="TO_BE_RELEASED", created_uid=BIDDER2_UID, created_at=T("2026-03-08"),
            submitted_at=T("2026-03-08"), reviewed_at=None, reviewed_by_uid=None)
        log_loto(db, loto_c, "SUBMIT", BIDDER2_UID, at=T("2026-03-08"))
        log_loto(db, loto_c, "CONFIRM", PO2_UID, confirmed=True, at=T("2026-03-10"))
        log_loto(db, loto_c, "RELEASE_REQUEST", BIDDER2_UID,
                 comment="Permit closed — release requested", at=T("2026-04-21"))

        loto_d = make_loto(
            db, permit=wp2, tag="LT-PIPE-11",
            description="Pump P-201 motor electrical isolation",
            status="TO_BE_RELEASED", created_uid=BIDDER2_UID, created_at=T("2026-03-08"),
            submitted_at=T("2026-03-08"), reviewed_at=None, reviewed_by_uid=None)
        log_loto(db, loto_d, "SUBMIT", BIDDER2_UID, at=T("2026-03-08"))
        log_loto(db, loto_d, "CONFIRM", PO2_UID, confirmed=True, at=T("2026-03-10"))
        log_loto(db, loto_d, "RELEASE_REQUEST", BIDDER2_UID,
                 comment="Permit closed — release requested", at=T("2026-04-21"))

        # ─── 3. APPROVED permit, work currently ongoing
        wp3 = make_permit(
            db, package_id=PKG_P001,
            title="Interior finishing — plaster & painting Area 1",
            description="Plastering, primer and finishing coats on interior walls in Area 1.",
            start_date="2026-03-01", end_date="2026-05-31",
            permit_type_ids=[PT_COLD, PT_HEIGHT],
            area_ids=[A1],
            hazards=[HAZ_HEIGHT, HAZ_SLIP],
            ppe_keys=PPE_HEIGHT,
            status="APPROVED",
            created_uid=BIDDER1_UID, created_at=T("2026-02-20"),
            submitted_at=T("2026-02-22"), submitted_by_uid=BIDDER1_UID,
        )
        seed_area_approvals(db, wp3, [
            (A1, "APPROVED", CM_UID, T("2026-02-25")),
        ])
        log_permit(db, wp3, "SUBMIT", BIDDER1_UID, at=T("2026-02-22"))
        log_permit(db, wp3, "APPROVE", CM_UID, area_id=A1, approved=True,
                   at=T("2026-02-25"))
        # No LOTOs required (cold work only) — rollup will be NA

        # ─── 4. APPROVED permit, finish date already passed (vendor sees
        # "Close or Extend" in their action points).
        wp4 = make_permit(
            db, package_id=PKG_P001,
            title="External cladding Area 3 — north façade",
            description="Install pre-fab aluminium cladding panels on the north face of Area 3.",
            start_date="2026-01-15", end_date="2026-04-10",
            permit_type_ids=[PT_COLD, PT_HEIGHT, PT_LIFTING],
            area_ids=[A3],
            hazards=[HAZ_HEIGHT, HAZ_LIFT],
            ppe_keys=PPE_HEIGHT,
            status="APPROVED",
            created_uid=BIDDER1_UID, created_at=T("2026-01-08"),
            submitted_at=T("2026-01-10"), submitted_by_uid=BIDDER1_UID,
        )
        seed_area_approvals(db, wp4, [
            (A3, "APPROVED", CM_UID, T("2026-01-12")),
        ])
        log_permit(db, wp4, "SUBMIT", BIDDER1_UID, at=T("2026-01-10"))
        log_permit(db, wp4, "APPROVE", CM_UID, area_id=A3, approved=True,
                   at=T("2026-01-12"))
        loto_e = make_loto(
            db, permit=wp4, tag="LT-CLAD-01",
            description="Scissor-lift platform power isolation (end of shift)",
            status="LOCKED", created_uid=BIDDER1_UID, created_at=T("2026-01-09"),
            submitted_at=T("2026-01-09"), reviewed_at=T("2026-01-12"),
            reviewed_by_uid=CM_UID)
        log_loto(db, loto_e, "SUBMIT", BIDDER1_UID, at=T("2026-01-09"))
        log_loto(db, loto_e, "CONFIRM", CM_UID, confirmed=True, at=T("2026-01-12"))

        # ─── 5. PENDING permit, standard review cycle (not yet decided)
        wp5 = make_permit(
            db, package_id=PKG_P002,
            title="Instrumentation cable pulls — Area 2 / Area 3",
            description="Pull and terminate instrumentation cable trays between Area 2 and Area 3.",
            start_date="2026-04-25", end_date="2026-05-30",
            permit_type_ids=[PT_COLD, PT_ELEC, PT_LOTO],
            area_ids=[A2, A3],
            hazards=[HAZ_ELEC, HAZ_HEIGHT],
            ppe_keys=PPE_HEIGHT,
            status="PENDING",
            created_uid=BIDDER2_UID, created_at=T("2026-04-15"),
            submitted_at=T("2026-04-18"), submitted_by_uid=BIDDER2_UID,
        )
        seed_area_approvals(db, wp5, [
            (A2, "PENDING", None, None),
            (A3, "PENDING", None, None),
        ])
        log_permit(db, wp5, "SUBMIT", BIDDER2_UID, at=T("2026-04-18"))
        loto_f = make_loto(
            db, permit=wp5, tag="LT-INST-05",
            description="DCS panel power isolation during terminations",
            status="REQUEST", created_uid=BIDDER2_UID, created_at=T("2026-04-18"),
            submitted_at=T("2026-04-18"))
        log_loto(db, loto_f, "SUBMIT", BIDDER2_UID, at=T("2026-04-18"))
        loto_g = make_loto(
            db, permit=wp5, tag="LT-INST-06",
            description="Marshalling cabinet LOTO",
            status="REQUEST", created_uid=BIDDER2_UID, created_at=T("2026-04-18"),
            submitted_at=T("2026-04-18"))
        log_loto(db, loto_g, "SUBMIT", BIDDER2_UID, at=T("2026-04-18"))

        # ─── 6. PENDING permit — extension request on previously approved permit
        wp6 = make_permit(
            db, package_id=PKG_P001,
            title="Roofing & weather-proofing — Area 1/2",
            description="Membrane roofing and flashing works on Area 1 and Area 2 roofs.",
            start_date="2026-02-15", end_date="2026-05-15",   # extended end_date
            permit_type_ids=[PT_COLD, PT_HEIGHT, PT_HOT],
            area_ids=[A1, A2],
            hazards=[HAZ_HEIGHT, HAZ_FIRE],
            ppe_keys=PPE_HEIGHT + ["Safety clothing"],
            status="PENDING",
            created_uid=BIDDER1_UID, created_at=T("2026-02-05"),
            submitted_at=T("2026-04-19"), submitted_by_uid=BIDDER1_UID,
        )
        # Area approvals are reset on extension — both PENDING
        seed_area_approvals(db, wp6, [
            (A1, "PENDING", None, None),
            (A2, "PENDING", None, None),
        ])
        # History shows the full narrative
        log_permit(db, wp6, "SUBMIT", BIDDER1_UID, at=T("2026-02-08"))
        log_permit(db, wp6, "APPROVE", CM_UID, area_id=A1, approved=True,
                   at=T("2026-02-11"))
        log_permit(db, wp6, "APPROVE", PO2_UID, area_id=A2, approved=True,
                   at=T("2026-02-12"))
        log_permit(db, wp6, "EXTEND", BIDDER1_UID,
                   comment="Extension requested: 2026-04-30 → 2026-05-15 | "
                           "Weather delays; need 2 more weeks to finish west roof.",
                   at=T("2026-04-19"))
        loto_h = make_loto(
            db, permit=wp6, tag="LT-ROOF-03",
            description="HVAC unit UH-03 power isolation (still required for extension)",
            status="LOCKED", created_uid=BIDDER1_UID, created_at=T("2026-02-09"),
            submitted_at=T("2026-02-09"), reviewed_at=T("2026-02-11"),
            reviewed_by_uid=CM_UID)
        log_loto(db, loto_h, "SUBMIT", BIDDER1_UID, at=T("2026-02-09"))
        log_loto(db, loto_h, "CONFIRM", CM_UID, confirmed=True, at=T("2026-02-11"))

        # ─── 7. REJECTED permit — needs vendor rework before resubmit
        wp7 = make_permit(
            db, package_id=PKG_P002,
            title="Pump P-201 overhaul — Area 2",
            description="Remove, overhaul and reinstall pump P-201 including alignment.",
            start_date="2026-04-08", end_date="2026-04-30",
            permit_type_ids=[PT_COLD, PT_LIFTING, PT_LOTO],
            area_ids=[A2, A3],
            hazards=[HAZ_LIFT, HAZ_ELEC, HAZ_HOT],
            ppe_keys=PPE_STD,
            status="REJECTED",
            created_uid=BIDDER2_UID, created_at=T("2026-04-01"),
            submitted_at=T("2026-04-03"), submitted_by_uid=BIDDER2_UID,
        )
        seed_area_approvals(db, wp7, [
            (A2, "APPROVED", PO2_UID, T("2026-04-05")),
            (A3, "REJECTED", CM_UID, T("2026-04-06"),
             "Lifting plan missing. Need crane load chart and rigging study before approval."),
        ])
        log_permit(db, wp7, "SUBMIT", BIDDER2_UID, at=T("2026-04-03"))
        log_permit(db, wp7, "APPROVE", PO2_UID, area_id=A2, approved=True,
                   at=T("2026-04-05"))
        log_permit(db, wp7, "REJECT", CM_UID, area_id=A3, approved=False,
                   comment="Lifting plan missing. Need crane load chart and rigging study before approval.",
                   at=T("2026-04-06"))
        # No LOTOs yet — vendor was still preparing

        # ─── 8. PENDING permit with REFUSED LOTO — the deadlock
        wp8 = make_permit(
            db, package_id=PKG_P001,
            title="Concrete core drilling — Area 1 floor slab",
            description="Core drill 8 penetrations through the Area 1 floor slab for ducting.",
            start_date="2026-04-22", end_date="2026-05-05",
            permit_type_ids=[PT_COLD, PT_LOTO],
            area_ids=[A1],
            hazards=[HAZ_ELEC, HAZ_CRUSH],
            ppe_keys=PPE_NOISE,
            status="PENDING",
            created_uid=BIDDER1_UID, created_at=T("2026-04-16"),
            submitted_at=T("2026-04-17"), submitted_by_uid=BIDDER1_UID,
        )
        seed_area_approvals(db, wp8, [
            (A1, "PENDING", None, None),
        ])
        log_permit(db, wp8, "SUBMIT", BIDDER1_UID, at=T("2026-04-17"))
        # Two LOTOs — one is REFUSED, causing the deadlock
        loto_i = make_loto(
            db, permit=wp8, tag="LT-CORE-01",
            description="Corridor lighting circuit isolation",
            status="REQUEST", created_uid=BIDDER1_UID, created_at=T("2026-04-17"),
            submitted_at=T("2026-04-17"))
        log_loto(db, loto_i, "SUBMIT", BIDDER1_UID, at=T("2026-04-17"))

        loto_j = make_loto(
            db, permit=wp8, tag="LT-CORE-02",
            description="Fire alarm loop isolation during drilling",
            status="REFUSED", created_uid=BIDDER1_UID, created_at=T("2026-04-17"),
            submitted_at=T("2026-04-17"), reviewed_at=T("2026-04-19"),
            reviewed_by_uid=CM_UID,
            refusal_comment="Fire alarm loop cannot be isolated without a fire-watch plan. "
                            "Submit a fire-watch schedule before re-requesting.")
        log_loto(db, loto_j, "SUBMIT", BIDDER1_UID, at=T("2026-04-17"))
        log_loto(db, loto_j, "REFUSE", CM_UID, confirmed=False,
                 comment="Fire alarm loop cannot be isolated without a fire-watch plan. "
                         "Submit a fire-watch schedule before re-requesting.",
                 at=T("2026-04-19"))

        # ─── 9. DRAFT permit — vendor still preparing
        make_permit(
            db, package_id=PKG_P001,
            title="Stairwell handrail installation — Area 3",
            description="Install galvanised steel handrails on the Area 3 emergency stairwell.",
            start_date="2026-05-05", end_date="2026-05-20",
            permit_type_ids=[PT_COLD, PT_HEIGHT, PT_HOT],
            area_ids=[A3],
            hazards=[HAZ_HEIGHT, HAZ_FIRE],
            ppe_keys=PPE_HEIGHT,
            status="DRAFT",
            created_uid=BIDDER1_UID, created_at=T("2026-04-20"),
        )

        # ─── 10. Old CLOSED permit from the start of the window (CTG contingency)
        wp10 = make_permit(
            db, package_id=PKG_CTG,
            title="Temporary site road widening",
            description="Widen the northern site access road to accommodate crane traffic.",
            start_date="2025-08-25", end_date="2025-09-25",
            permit_type_ids=[PT_EXCAV, PT_LIFTING],
            area_ids=[A1],
            hazards=[HAZ_CRUSH, HAZ_LIFT],
            ppe_keys=PPE_STD,
            status="CLOSED",
            created_uid=BIDDER1_UID, created_at=T("2025-08-22"),
            submitted_at=T("2025-08-23"), submitted_by_uid=BIDDER1_UID,
        )
        seed_area_approvals(db, wp10, [
            (A1, "APPROVED", CM_UID, T("2025-08-25")),
        ])
        log_permit(db, wp10, "SUBMIT", BIDDER1_UID, at=T("2025-08-23"))
        log_permit(db, wp10, "APPROVE", CM_UID, area_id=A1, approved=True,
                   at=T("2025-08-25"))
        log_permit(db, wp10, "CLOSE", BIDDER1_UID,
                   comment="Road widening complete; no LOTOs involved.",
                   at=T("2025-09-26"))

        db.commit()
        print("\nDone. Seeded:")
        print(f"  subcontractors:  {db.query(models.Subcontractor).filter_by(project_id=PROJECT_ID).count()}")
        print(f"  workers:         {db.query(models.Worker).filter_by(project_id=PROJECT_ID).count()}")
        print(f"  work logs:       {db.query(models.WorkLog).filter_by(project_id=PROJECT_ID).count()}")
        print(f"  work permits:    {db.query(models.WorkPermit).filter_by(project_id=PROJECT_ID).count()}")
        print(f"  LOTOs:           {db.query(models.LOTO).filter_by(project_id=PROJECT_ID).count()}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
