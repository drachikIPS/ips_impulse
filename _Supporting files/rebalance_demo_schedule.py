"""
Re-balance the DEMO-2026-A schedule so that only a handful of tasks
are late. Most late tasks become completed (latest-approved entry set
to 100 %) or get their finish_date pushed into the near future; a small
realistic tail stays late.

Run:  python rebalance_demo_schedule.py
"""
import random
from datetime import date, datetime, timedelta

from database import SessionLocal
import models

PROJECT_NUMBER = "DEMO-2026-A"
TARGET_LATE    = 7       # realistic residual "slipping" tasks
random.seed(7)


def latest_approved_entry(db, task_id):
    """Return the latest ProgressReportEntry belonging to an APPROVED PR for this task."""
    return (
        db.query(models.ProgressReportEntry)
          .join(models.ProgressReport, models.ProgressReport.id == models.ProgressReportEntry.progress_report_id)
          .filter(
              models.ProgressReportEntry.task_id == task_id,
              models.ProgressReport.status == "APPROVED",
          )
          .order_by(models.ProgressReport.submitted_at.desc())
          .first()
    )


def run():
    db = SessionLocal()
    try:
        proj = db.query(models.Project).filter_by(project_number=PROJECT_NUMBER).first()
        if not proj:
            print(f"No project '{PROJECT_NUMBER}' found.")
            return

        today = date.today()
        tasks = db.query(models.Task).filter_by(project_id=proj.id).all()

        # Classify
        late, completed, future = [], [], []
        for t in tasks:
            if not t.finish_date:
                continue
            try:
                fin = date.fromisoformat(t.finish_date)
            except ValueError:
                continue
            pct = 0.0
            entry = latest_approved_entry(db, t.id)
            if entry:
                pct = entry.percentage or 0.0
            if pct >= 100:
                completed.append(t)
            elif fin < today:
                late.append((t, entry, fin))
            else:
                future.append(t)

        print(f"Before:  total={len(tasks)}  late={len(late)}  completed={len(completed)}  future={len(future)}")

        random.shuffle(late)
        # Keep a small realistic tail
        to_keep_late = late[:TARGET_LATE]
        to_fix       = late[TARGET_LATE:]

        made_complete = 0
        pushed_out    = 0
        for (t, entry, fin) in to_fix:
            # Tasks with an existing approved entry → bump that entry to 100 %.
            # Tasks with no approved entry → push the finish date out, because
            # silently creating a completion entry would need an APPROVED PR
            # that may not exist for this package.
            want_complete = (entry is not None) and (random.random() < 0.80)
            if want_complete:
                entry.percentage = 100.0
                made_complete += 1
            else:
                new_finish = today + timedelta(days=random.randint(30, 180))
                t.finish_date = new_finish.isoformat()
                if t.start_date and t.start_date > t.finish_date:
                    t.start_date = (new_finish - timedelta(days=30)).isoformat()
                pushed_out += 1

        db.commit()

        # Verify
        late_after = 0
        done_after = 0
        for t in tasks:
            if not t.finish_date:
                continue
            fin = date.fromisoformat(t.finish_date)
            entry = latest_approved_entry(db, t.id)
            pct = entry.percentage if entry else 0.0
            if pct >= 100:
                done_after += 1
            elif fin < today:
                late_after += 1

        print(f"Actions: made_complete={made_complete}  pushed_out={pushed_out}  kept_late={len(to_keep_late)}")
        print(f"After:   late={late_after}  completed={done_after}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
