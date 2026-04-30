"""
Adds meeting types + recurrent meetings + procurement progress to the
previously-created DEMO-2026-A demo project.

Run:  python seed_demo_extras.py
"""
import json
import random
from datetime import datetime, timedelta

from database import SessionLocal
import models

random.seed(99)

PROJECT_NUMBER = "DEMO-2026-A"


def rand_dt_between(start: datetime, end: datetime) -> datetime:
    delta_s = int((end - start).total_seconds())
    return start + timedelta(seconds=random.randint(0, max(delta_s, 1)))


def run():
    db = SessionLocal()
    try:
        proj = db.query(models.Project).filter_by(project_number=PROJECT_NUMBER).first()
        if not proj:
            print(f"No project '{PROJECT_NUMBER}' found. Run seed_demo_project.py first.")
            return
        pid = proj.id

        admin = db.query(models.User).filter_by(role="ADMIN").first()
        contacts = db.query(models.Contact).filter_by(project_id=pid).all()
        packages = db.query(models.Package).filter_by(project_id=pid).all()
        points   = db.query(models.MeetingPoint).filter_by(project_id=pid).all()
        bidders  = db.query(models.BiddingCompany).filter_by(project_id=pid).all()
        steps    = db.query(models.ProcurementStep).filter_by(project_id=pid).order_by(models.ProcurementStep.sort_order).all()
        contracts= db.query(models.ContractType).filter_by(project_id=pid).all()

        pmc_contacts = [c for c in contacts if c.company and "impulse" in c.company.lower()]
        cli_contacts = [c for c in contacts if c.company and "helios" in c.company.lower()]
        vendor_by_co = {}
        for c in contacts:
            if c.company and "impulse" not in c.company.lower() and "helios" not in c.company.lower():
                vendor_by_co.setdefault(c.company, []).append(c)

        # ─── 1.  Meeting Types + Recurrent Meetings ─────────────────────────
        existing_mt_names = {m.name for m in db.query(models.MeetingType).filter_by(project_id=pid).all()}
        mt_defs = [
            ("Weekly Project Status",
             "Overall project status review with PMC + Client.",
             True, "WEEKLY", json.dumps([1]), None, None, "09:00", 60,
             (pmc_contacts[:5] + cli_contacts[:3])),
            ("Monthly Steering Committee",
             "Monthly high-level review with directors + project managers.",
             True, "MONTHLY", None, 2, 2, "14:00", 90,
             (pmc_contacts[:3] + cli_contacts[:2])),
            ("Bi-Weekly Engineering Coordination",
             "Engineering discipline alignment.",
             True, "BIWEEKLY", json.dumps([3]), None, None, "10:00", 60,
             (pmc_contacts[3:10])),
            ("Weekly Safety Stand-up",
             "Short HSE briefing.",
             True, "DAILY", json.dumps([0, 1, 2, 3, 4]), None, None, "08:00", 15,
             (pmc_contacts[-3:] + cli_contacts[-2:])),
            ("Ad-hoc Design Review", "One-off design review sessions.",
             False, None, None, None, None, None, None, pmc_contacts[:6]),
        ]
        meeting_types_created = []
        for (name, desc, rec, freq, dow_list, dow, wk_pos, t, dur, parts) in mt_defs:
            if name in existing_mt_names:
                mt = db.query(models.MeetingType).filter_by(project_id=pid, name=name).first()
            else:
                mt = models.MeetingType(
                    project_id=pid, name=name, description=desc,
                    is_recurrent=rec, recurrence=freq, days_of_week=dow_list,
                    day_of_week=dow, monthly_week_position=wk_pos,
                    recurrence_time=t, duration=dur,
                    created_by_id=admin.id,
                )
                db.add(mt); db.flush()
                for c in parts:
                    db.add(models.MeetingTypeParticipant(meeting_type_id=mt.id, contact_id=c.id))
            meeting_types_created.append(mt)
        db.commit()
        print(f"Meeting types ensured: {len(meeting_types_created)}")

        # Generate meetings — recurrent types get a series of past + future instances
        meetings_created = []
        recurrent_cfg = [
            (meeting_types_created[0], 7,   "2025-09-01", "2026-04-13"),  # Weekly
            (meeting_types_created[1], 30,  "2025-09-01", "2026-04-01"),  # Monthly
            (meeting_types_created[2], 14,  "2025-09-01", "2026-04-08"),  # Bi-weekly
            (meeting_types_created[3], 7,   "2026-02-01", "2026-04-17"),  # Daily stand-up (we just sample weekly for volume)
        ]
        for mt, step_days, start_s, end_s in recurrent_cfg:
            start = datetime.fromisoformat(start_s)
            end   = datetime.fromisoformat(end_s)
            cur   = start
            while cur <= end:
                status = "COMPLETED" if cur.date() < datetime(2026, 4, 19).date() else "PLANNED"
                m = models.Meeting(
                    project_id=pid, title=f"{mt.name} — {cur.strftime('%d %b %Y')}",
                    date=cur.strftime("%Y-%m-%d"),
                    time=mt.recurrence_time or "09:00",
                    location="Project Site — Meeting Room A",
                    meeting_type_id=mt.id, status=status,
                    notes=("Discussion covered progress, blockers, next-step actions."
                           if status == "COMPLETED" else None),
                    created_by_id=admin.id,
                )
                db.add(m); meetings_created.append(m)
                cur += timedelta(days=step_days)

        # Ad-hoc design reviews — 5 single instances
        for i in range(5):
            dt = datetime.fromisoformat("2025-10-01") + timedelta(days=30 * i + random.randint(0, 14))
            m = models.Meeting(
                project_id=pid, title=f"Ad-hoc Design Review #{i+1}",
                date=dt.strftime("%Y-%m-%d"), time="10:00",
                location="PMC Office — Review Room",
                meeting_type_id=meeting_types_created[-1].id,
                status=("COMPLETED" if dt < datetime(2026, 4, 19) else "PLANNED"),
                created_by_id=admin.id,
            )
            db.add(m); meetings_created.append(m)
        db.commit()
        for m in meetings_created: db.refresh(m)
        print(f"Meetings created: {len(meetings_created)}")

        # Participants for each meeting: inherit meeting-type participants
        for m in meetings_created:
            mt = db.query(models.MeetingType).filter_by(id=m.meeting_type_id).first()
            if not mt: continue
            mt_participants = db.query(models.MeetingTypeParticipant).filter_by(meeting_type_id=mt.id).all()
            for tp in mt_participants:
                db.add(models.MeetingParticipant(
                    meeting_id=m.id, contact_id=tp.contact_id,
                    present=(m.status == "COMPLETED" and random.random() < 0.85),
                ))
        db.commit()

        # ─── 2.  Link meeting points to meetings ────────────────────────────
        # Each point → linked to 1–3 meetings. Prefer meetings on/after point creation.
        completed_meetings_sorted = sorted(
            [m for m in meetings_created if m.status == "COMPLETED"],
            key=lambda m: m.date,
        )
        planned_meetings = [m for m in meetings_created if m.status == "PLANNED"]

        links_created = 0
        for pt in points:
            # Pick 1–3 meetings, include at least one completed meeting created after
            # the point so the link timeline makes sense
            ref_date = (pt.created_at or datetime(2025, 9, 1)).date()
            pool = [m for m in completed_meetings_sorted
                    if datetime.fromisoformat(m.date).date() >= ref_date] or completed_meetings_sorted
            picks = []
            if pool:
                picks.append(random.choice(pool))
            if random.random() < 0.4 and planned_meetings:
                picks.append(random.choice(planned_meetings))
            if random.random() < 0.25 and pool:
                picks.append(random.choice(pool))
            for i, m in enumerate(picks):
                # Skip duplicates
                exists = db.query(models.MeetingPointLink).filter_by(
                    meeting_point_id=pt.id, meeting_id=m.id).first()
                if exists: continue
                db.add(models.MeetingPointLink(
                    meeting_point_id=pt.id, meeting_id=m.id,
                    for_preparation=(m.status == "PLANNED"), sort_order=i,
                ))
                links_created += 1
        db.commit()
        print(f"Meeting point <-> meeting links: {links_created}")

        # ─── 3.  Procurement progress ───────────────────────────────────────
        # For each package, pick 3–5 bidders and advance them through steps.
        if not steps:
            print("No procurement steps found for this project — skipping procurement progress.")
            return

        # Validate the sequence so the module exposes the register
        cfg = db.query(models.ProcurementConfig).filter_by(project_id=pid).first()
        if cfg and not cfg.sequence_validated:
            cfg.sequence_validated = True
            cfg.sequence_validated_at = datetime(2025, 8, 15, 10, 0)
            cfg.sequence_validated_by_id = admin.id

        # Create a package plan for each package (contract type, notes)
        contract_fallback = contracts[0] if contracts else None
        for pkg in packages:
            pp = db.query(models.PackagePlan).filter_by(package_id=pkg.id).first()
            if not pp:
                pp = models.PackagePlan(
                    project_id=pid, package_id=pkg.id,
                    contract_type_id=(random.choice(contracts).id if contracts else None),
                    notes="Package procurement plan — demo data",
                    created_by_id=admin.id,
                )
                db.add(pp); db.flush()
            # Step dates — assign a target date for each step across 2025-08 to 2026-03
            base = datetime(2025, 8, 1)
            for i, step in enumerate(steps):
                if db.query(models.PackagePlanStepDate).filter_by(plan_id=pp.id, step_id=step.id).first():
                    continue
                db.add(models.PackagePlanStepDate(
                    plan_id=pp.id, step_id=step.id,
                    due_date=(base + timedelta(days=20 * i + random.randint(0, 5))).strftime("%Y-%m-%d"),
                ))
            # Plan bidders — assign 4–5 per package
            assigned = random.sample(bidders, min(5, len(bidders))) if bidders else []
            for b in assigned:
                if db.query(models.PackagePlanBidder).filter_by(plan_id=pp.id, company_id=b.id).first():
                    continue
                db.add(models.PackagePlanBidder(plan_id=pp.id, company_id=b.id))
        db.commit()

        step_by_sort = sorted(steps, key=lambda s: s.sort_order)
        step_count   = len(step_by_sort)
        compliance_vals = ["NA", "PENDING", "PASS", "FAIL"]
        compliance_weights = [5, 30, 55, 10]

        entries_created = 0
        events_created = 0
        submittals_created = 0
        for pkg in packages:
            # Pick 3–5 bidders for this package's procurement entries
            selected = random.sample(bidders, min(random.randint(3, 5), len(bidders))) if bidders else []
            # One bidder gets AWARDED; one EXCLUDED early; one AWAITING; others COMPETING
            roles = ["AWARDED", "EXCLUDED"] + ["COMPETING"] * (len(selected) - 3) + ["AWAITING"]
            random.shuffle(roles)
            # Ensure no more than one AWARDED per package
            ensured = []
            awarded_assigned = False
            for r in roles[:len(selected)]:
                if r == "AWARDED":
                    if awarded_assigned: r = "COMPETING"
                    else: awarded_assigned = True
                ensured.append(r)

            # Final step in the sequence represents award; second-to-last = BAFO/rec
            for comp, status in zip(selected, ensured):
                if db.query(models.ProcurementEntry).filter_by(
                        package_id=pkg.id, company_id=comp.id).first():
                    continue
                # How far this bidder progressed
                if status == "EXCLUDED":
                    max_idx = random.randint(2, max(2, step_count // 3))
                elif status == "AWAITING":
                    max_idx = random.randint(step_count // 2, step_count - 2)
                elif status == "AWARDED":
                    max_idx = step_count - 1
                else:  # COMPETING
                    max_idx = random.randint(step_count // 2, step_count - 2)
                current_step = step_by_sort[max_idx]

                bid_value = None
                if max_idx >= 5:
                    bid_value = random.randint(80, 350) * 1000
                tech = random.choices(compliance_vals, weights=compliance_weights)[0]
                comm = random.choices(compliance_vals, weights=compliance_weights)[0]
                if status == "AWARDED":
                    tech = "PASS"; comm = "PASS"
                if status == "EXCLUDED":
                    tech = random.choice(["FAIL", "PENDING"])

                entry = models.ProcurementEntry(
                    project_id=pid, package_id=pkg.id, company_id=comp.id,
                    current_step_id=current_step.id, status=status,
                    exclusion_reason=("Insufficient reference projects" if status == "EXCLUDED" else None),
                    technical_compliance=tech, commercial_compliance=comm,
                    technical_compliance_note=("Meets all requirements" if tech == "PASS" else
                                                ("Missing data" if tech == "PENDING" else
                                                 ("Does not meet scope" if tech == "FAIL" else None))),
                    commercial_compliance_note=("Within budget" if comm == "PASS" else None),
                    bid_value=bid_value,
                    created_by_id=admin.id,
                    created_at=datetime(2025, 8, 20, 10, 0),
                )
                db.add(entry); db.flush(); entries_created += 1

                # Events: one STEP_ADVANCE per step traversed + submittal at quotation stages
                cur_dt = datetime(2025, 9, 1)
                for i, st in enumerate(step_by_sort[: max_idx + 1]):
                    advance_dt = cur_dt + timedelta(days=14 * i + random.randint(0, 5))
                    db.add(models.ProcurementEvent(
                        entry_id=entry.id, event_type="STEP_ADVANCE",
                        step_name=st.step_id,
                        old_status=None, new_status=None,
                        comment=f"Advanced to {st.step_id}",
                        created_at=advance_dt, created_by_id=admin.id,
                    ))
                    events_created += 1
                    # Submittals at key steps: Quotation Submittal / BAFO / Recommendation Report
                    if st.step_id in ("Quotation Submittal", "BAFO") and bid_value:
                        db.add(models.BidderSubmittal(
                            entry_id=entry.id, step_id=st.id, step_name=st.step_id,
                            bid_value=bid_value + random.randint(-20000, 20000),
                            comment=f"Submittal at {st.step_id}",
                            submitted_at=advance_dt + timedelta(days=1),
                            submitted_by_id=admin.id,
                        ))
                        submittals_created += 1

                # Final status event
                if status in ("AWARDED", "EXCLUDED"):
                    db.add(models.ProcurementEvent(
                        entry_id=entry.id, event_type="STATUS_CHANGE",
                        old_status="COMPETING", new_status=status,
                        comment=("Contract awarded" if status == "AWARDED"
                                 else "Excluded from further consideration"),
                        created_at=cur_dt + timedelta(days=14 * max_idx + 10),
                        created_by_id=admin.id,
                    ))
                    events_created += 1
        db.commit()
        print(f"Procurement entries: {entries_created} | events: {events_created} | submittals: {submittals_created}")
        print("Done.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
