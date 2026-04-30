"""Seed daily reports for KUT-PIS (project 7) covering every day of every
work log for each package.

Rules that match the platform's behaviour:

• For each package, the reporting period is the union of all its WorkLog
  windows, clamped to today. This mirrors `_expected_report_dates()` in
  routers/construction.py — so after running this script the vendor's
  "pending daily reports" queue should be empty (the system sees one
  report per expected date).

• Weekdays  → full report: 3-8 APPROVED workers on site, 1-2 areas, avg
  hours in [7.5, 9.0], a rotating description.
• Weekends  → no_work=True report (empty workers/areas, 0 hours,
  description "Weekend — no work").
• About 3% of weekdays are logged as no_work too (bank holidays,
  weather, unplanned stops) so the data isn't perfectly uniform.

Each report is locked by default (matches the UI where the vendor's save
locks the report). Re-running skips any (package, date) that already has
a row, so it is safe to run multiple times and alongside hand-made test
reports.

Run with:   python seed_kut_daily_reports.py
"""
from __future__ import annotations
from datetime import date, datetime, timedelta
import random

import database
import models


PROJECT_ID = 7

# Actor uids (matching seed_kut_construction.py)
BIDDER1_UID = 31   # P001 + CTG
BIDDER2_UID = 32   # P002
BIDDER3_UID = 33   # P001 (masonry)

PKG_P001 = 16
PKG_P002 = 17
PKG_CTG  = 18

# Pick a reasonable reporter per package: the vendor who submitted the
# majority of work logs on that package.
PACKAGE_REPORTER = {
    PKG_P001: BIDDER1_UID,
    PKG_P002: BIDDER2_UID,
    PKG_CTG:  BIDDER1_UID,
}

# Plausible area picks per package (scoped to areas the package actually
# worked on, drawn from the work-permit history).
PACKAGE_AREAS = {
    PKG_P001: [2, 3, 4],    # A1, A2, A3
    PKG_P002: [3, 4],       # A2, A3
    PKG_CTG:  [2],          # A1
}

# Descriptions rotated to give reports some texture.
DESCRIPTIONS_BY_PKG = {
    PKG_P001: [
        "Foundation pours and rebar placement on Area 1 north grid.",
        "Steel column erection; plumbing and levelling.",
        "Floor slab preparation and screed.",
        "Masonry block-work on partition walls.",
        "Plastering and finishing coats on interior walls.",
        "Rebar ties and formwork on stair cores.",
        "Cladding panel installation — north façade.",
        "Roofing membrane and flashing installation.",
        "Waterproofing below-grade walls.",
        "Painting, second coat in main hall.",
    ],
    PKG_P002: [
        "Piping spool fabrication — rack section B.",
        "Pipe erection and alignment, loop 2A.",
        "Welding of stainless piping, X-ray inspection follow-up.",
        "Hydro-test preparation and flushing.",
        "Instrument tubing installation.",
        "Cable tray pulls between Area 2 and Area 3.",
        "DCS loop checks and instrument calibration.",
        "Pump alignment and baseplate grouting.",
        "Valve actuator mounting and stroke testing.",
        "Equipment insulation wrap — hot lines.",
    ],
    PKG_CTG: [
        "Site road widening and compaction.",
        "Temporary fencing repairs — east perimeter.",
        "Snow clearance and gritting of access roads.",
        "Temporary lighting check and bulb replacement.",
        "Drainage inspection and clearing storm sumps.",
        "Minor repair crew — miscellaneous patch-ups.",
    ],
}

# Belgian public holidays that fell inside our window (treat as no-work
# days even on weekdays so the data looks realistic).
HOLIDAYS = {
    "2025-11-11", "2025-12-25", "2025-12-26",
    "2026-01-01", "2026-04-06",   # Easter Monday (approx)
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _dt(iso: str) -> datetime:
    return datetime.fromisoformat(iso + "T18:00:00")


def expected_dates_for_package(db, package_id: int) -> set:
    """Union of every work-log window for this package, clamped to today.
    Matches _expected_report_dates() in routers/construction.py."""
    today = date.today()
    out = set()
    logs = db.query(models.WorkLog).filter_by(
        project_id=PROJECT_ID, package_id=package_id,
    ).all()
    for wl in logs:
        try:
            start = date.fromisoformat(wl.start_date) if wl.start_date else None
        except Exception:
            start = None
        if not start:
            continue
        try:
            end = date.fromisoformat(wl.end_date) if wl.end_date else today
        except Exception:
            end = today
        if end > today: end = today
        if start > today: continue
        cur = start
        while cur <= end:
            out.add(cur.isoformat())
            cur += timedelta(days=1)
    return out


def approved_workers_for_package(db, package_id: int):
    return (db.query(models.Worker)
              .filter_by(project_id=PROJECT_ID, package_id=package_id, status="APPROVED")
              .all())


def existing_report_dates(db, package_id: int) -> set:
    rows = (db.query(models.DailyReport.report_date)
              .filter_by(project_id=PROJECT_ID, package_id=package_id).all())
    return {r[0] for r in rows}


# ── Main seed ────────────────────────────────────────────────────────────────

def main():
    # Deterministic randomness so re-running produces the same reports.
    rnd = random.Random(20260422)

    db = database.SessionLocal()
    try:
        total_created = 0
        total_skipped = 0

        for package_id, reporter_uid in PACKAGE_REPORTER.items():
            approved = approved_workers_for_package(db, package_id)
            if not approved:
                print(f"  package {package_id}: no approved workers — skipping")
                continue
            expected = expected_dates_for_package(db, package_id)
            already = existing_report_dates(db, package_id)
            to_create = sorted(expected - already)
            skipped = len(expected & already)
            if skipped:
                total_skipped += skipped

            descriptions = DESCRIPTIONS_BY_PKG[package_id]
            area_pool = PACKAGE_AREAS[package_id]
            desc_idx = 0

            for iso in to_create:
                d = date.fromisoformat(iso)
                is_weekend = d.weekday() >= 5
                is_holiday = iso in HOLIDAYS
                # ~3% random unplanned off-days on weekdays
                unplanned_off = (not is_weekend and not is_holiday
                                 and rnd.random() < 0.03)
                no_work = is_weekend or is_holiday or unplanned_off

                if no_work:
                    avg_hours = 0.0
                    worker_ids: list = []
                    area_ids: list = []
                    if is_weekend:
                        desc = "Weekend — no work."
                    elif is_holiday:
                        desc = "Public holiday — no work."
                    else:
                        desc = "No work today — weather / unplanned stop."
                else:
                    avg_hours = round(7.5 + rnd.random() * 1.5, 1)   # 7.5–9.0
                    crew_size = rnd.randint(min(3, len(approved)),
                                            min(8, len(approved)))
                    worker_ids = [w.id for w in rnd.sample(approved, crew_size)]
                    n_areas = 1 if rnd.random() < 0.6 else min(2, len(area_pool))
                    area_ids = rnd.sample(area_pool, n_areas)
                    desc = descriptions[desc_idx % len(descriptions)]
                    desc_idx += 1

                ts = _dt(iso)
                rep = models.DailyReport(
                    project_id=PROJECT_ID, package_id=package_id,
                    report_date=iso,
                    description=desc,
                    avg_hours_per_worker=avg_hours,
                    no_work=no_work,
                    created_by_id=reporter_uid,
                    created_at=ts,
                    locked=True,
                    locked_at=ts,
                )
                db.add(rep); db.flush()
                for wid in worker_ids:
                    db.add(models.DailyReportWorker(daily_report_id=rep.id, worker_id=wid))
                for aid in area_ids:
                    db.add(models.DailyReportArea(daily_report_id=rep.id, area_id=aid))
                total_created += 1

            pkg_tag = db.query(models.Package).get(package_id).tag_number
            print(f"  {pkg_tag:6s}  expected={len(expected)}  "
                  f"created={len(to_create)}  skipped(existed)={skipped}")

        db.commit()
        print(f"\nDone. Total reports created: {total_created} "
              f"(skipped {total_skipped} pre-existing).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
