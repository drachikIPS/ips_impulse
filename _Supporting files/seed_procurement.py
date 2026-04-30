"""
Seed fake procurement data for OFFSHORE-2025-001 (project_id=5).
Run: python seed_procurement.py
"""
import sqlite3
from datetime import date, timedelta, datetime

DB = "projectmanagement.db"
PROJECT_ID = 5
ADMIN_USER_ID = 1

# Step ids and names (sorted by sort_order)
# id, step_id (name), weight, sort_order
STEPS = [
    (37, "NDA",                      0.05,  0),
    (38, "RFI",                      0.05,  1),
    (39, "Short Vendor List",        0.05,  2),
    (40, "RFQ",                      0.20,  3),
    (41, "Q&A",                      0.10,  4),
    (42, "Quotation Submittal",      0.10,  5),
    (43, "Bid Comparison",           0.05,  6),
    (44, "Technical Negotiations",   0.10,  7),
    (45, "Commercial Negotiations",  0.10,  8),
    (46, "BAFO",                     0.05,  9),
    (47, "Recommendation Report",    0.10, 10),
    (48, "Contract Awarding",        0.05, 11),
]
STEP_COUNT = len(STEPS)

# Package ids
PKG_MECH  = 9
PKG_ELEC  = 10
PKG_STRUC = 11
PKG_INST  = 12
PKG_BPU   = 13  # leave existing data alone

CONTRACT_TYPE_LUMP_SUM = 28
CONTRACT_TYPE_UNIT_PRICE = 29

def step_due(base: date, step_idx: int) -> str:
    """Due date = base + step_idx * 20 days."""
    return (base + timedelta(days=step_idx * 20)).isoformat()

def step_actual(base: date, step_idx: int, slack_days: int = 3) -> str:
    """Actual completion date = due + slack_days."""
    return (base + timedelta(days=step_idx * 20 + slack_days)).isoformat()

def now_str(offset_days: int = 0) -> str:
    dt = datetime.utcnow() + timedelta(days=offset_days)
    return dt.strftime("%Y-%m-%d %H:%M:%S.%f")

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# ── 1. Create package plans for MECH, STRUC, INST ────────────────────────────
# PKG-ELEC already has plan_id=1; PKG-BPU has plan_id=2
plan_id_map = {10: 1, 13: 2}  # pre-existing
for pkg_id, ct_id in [(PKG_MECH, CONTRACT_TYPE_LUMP_SUM),
                       (PKG_STRUC, CONTRACT_TYPE_LUMP_SUM),
                       (PKG_INST, CONTRACT_TYPE_UNIT_PRICE)]:
    existing = cur.execute(
        "SELECT id FROM package_plans WHERE package_id=? AND project_id=?",
        (pkg_id, PROJECT_ID)
    ).fetchone()
    if existing:
        plan_id_map[pkg_id] = existing["id"]
        print(f"  Plan already exists for pkg {pkg_id}: plan_id={existing['id']}")
    else:
        cur.execute(
            """INSERT INTO package_plans (project_id, package_id, contract_type_id, created_at, created_by_id)
               VALUES (?, ?, ?, ?, ?)""",
            (PROJECT_ID, pkg_id, ct_id, now_str(), ADMIN_USER_ID)
        )
        plan_id_map[pkg_id] = cur.lastrowid
        print(f"  Created plan for pkg {pkg_id}: plan_id={plan_id_map[pkg_id]}")

conn.commit()

# ── 2. Insert step due dates for plans ────────────────────────────────────────
# Base dates per package (staggered so S-curves look different)
pkg_base_dates = {
    PKG_MECH:  date(2024, 6,  1),
    PKG_ELEC:  date(2024, 9,  1),
    PKG_STRUC: date(2025, 1,  1),
    PKG_INST:  date(2025, 4,  1),
}

for pkg_id, base in pkg_base_dates.items():
    plan_id = plan_id_map.get(pkg_id)
    if not plan_id:
        continue
    for step_id, step_name, weight, sort_order in STEPS:
        due = step_due(base, sort_order)
        existing = cur.execute(
            "SELECT id FROM package_plan_step_dates WHERE plan_id=? AND step_id=?",
            (plan_id, step_id)
        ).fetchone()
        if existing:
            cur.execute("UPDATE package_plan_step_dates SET due_date=? WHERE id=?",
                        (due, existing["id"]))
        else:
            cur.execute(
                "INSERT INTO package_plan_step_dates (plan_id, step_id, due_date) VALUES (?,?,?)",
                (plan_id, step_id, due)
            )

conn.commit()
print("Step due dates set.")

# ── 3. Create bidding companies ───────────────────────────────────────────────
company_names = [
    "Offshore Tech BV",
    "Nordic Marine AS",
    "Atlas Engineering SA",
    "GlobalProcure Ltd",
]
company_ids = {}
for name in company_names:
    existing = cur.execute(
        "SELECT id FROM bidding_companies WHERE name=? AND project_id=?",
        (name, PROJECT_ID)
    ).fetchone()
    if existing:
        company_ids[name] = existing["id"]
        print(f"  Company exists: {name} id={existing['id']}")
    else:
        cur.execute(
            "INSERT INTO bidding_companies (project_id, name, created_at) VALUES (?,?,?)",
            (PROJECT_ID, name, now_str())
        )
        company_ids[name] = cur.lastrowid
        print(f"  Created company: {name} id={cur.lastrowid}")

conn.commit()

OT = company_ids["Offshore Tech BV"]
NM = company_ids["Nordic Marine AS"]
AE = company_ids["Atlas Engineering SA"]
GP = company_ids["GlobalProcure Ltd"]

# ── 4. Helper: upsert procurement entry ──────────────────────────────────────
def upsert_entry(pkg_id: int, company_id: int, status: str,
                 step_index: int, exclusion_reason: str = None) -> int:
    step_id = STEPS[step_index][0]
    existing = cur.execute(
        "SELECT id FROM procurement_entries WHERE package_id=? AND company_id=? AND project_id=?",
        (pkg_id, company_id, PROJECT_ID)
    ).fetchone()
    if existing:
        cur.execute(
            """UPDATE procurement_entries
               SET status=?, current_step_id=?, exclusion_reason=?, updated_at=?
               WHERE id=?""",
            (status, step_id, exclusion_reason, now_str(), existing["id"])
        )
        return existing["id"]
    else:
        cur.execute(
            """INSERT INTO procurement_entries
               (project_id, package_id, company_id, current_step_id, status, exclusion_reason,
                created_at, created_by_id)
               VALUES (?,?,?,?,?,?,?,?)""",
            (PROJECT_ID, pkg_id, company_id, step_id, status, exclusion_reason,
             now_str(), ADMIN_USER_ID)
        )
        return cur.lastrowid

# ── 5. Helper: log STEP_ADVANCE events ───────────────────────────────────────
def log_advances(entry_id: int, base: date, up_to_step_index: int):
    """Log STEP_ADVANCE events from step 0 to up_to_step_index (exclusive).
    Each advance moves TO the next step, so we log 'advancing TO steps[i+1]'
    for i in range(0, up_to_step_index).
    Dates are spread across the progression timeline."""
    for i in range(up_to_step_index):
        to_step = STEPS[i + 1]
        # actual date = day after due + some slack
        event_date = step_actual(base, i, slack_days=3)
        # Check duplicate
        existing_ev = cur.execute(
            """SELECT id FROM procurement_events
               WHERE entry_id=? AND event_type='STEP_ADVANCE' AND step_name=?""",
            (entry_id, to_step[1])
        ).fetchone()
        if not existing_ev:
            cur.execute(
                """INSERT INTO procurement_events
                   (entry_id, event_type, step_name, comment, created_at, created_by_id)
                   VALUES (?,?,?,?,?,?)""",
                (entry_id, "STEP_ADVANCE", to_step[1], None,
                 f"{event_date} 09:00:00.000000", ADMIN_USER_ID)
            )

# ── 6. PKG-MECH: OT=AWARDED(all steps), NM=EXCLUDED(step 7), ─────────────────
#       AE=COMPETING(step 9), GP=COMPETING(step 9)
base_mech = pkg_base_dates[PKG_MECH]

eid_mech_ot = upsert_entry(PKG_MECH, OT, "AWARDED", 11)
log_advances(eid_mech_ot, base_mech, 11)
# Award event
if not cur.execute("SELECT id FROM procurement_events WHERE entry_id=? AND event_type='AWARD'",
                   (eid_mech_ot,)).fetchone():
    cur.execute(
        """INSERT INTO procurement_events
           (entry_id, event_type, old_status, new_status, comment, created_at, created_by_id)
           VALUES (?,?,?,?,?,?,?)""",
        (eid_mech_ot, "AWARD", "COMPETING", "AWARDED",
         "Contract awarded to Offshore Tech BV", "2025-02-15 10:00:00.000000", ADMIN_USER_ID)
    )

eid_mech_nm = upsert_entry(PKG_MECH, NM, "EXCLUDED", 6,
                            exclusion_reason="Did not meet technical compliance requirements.")
log_advances(eid_mech_nm, base_mech, 6)
if not cur.execute("SELECT id FROM procurement_events WHERE entry_id=? AND event_type='STATUS_CHANGE' AND new_status='EXCLUDED'",
                   (eid_mech_nm,)).fetchone():
    cur.execute(
        """INSERT INTO procurement_events
           (entry_id, event_type, old_status, new_status, comment, created_at, created_by_id)
           VALUES (?,?,?,?,?,?,?)""",
        (eid_mech_nm, "STATUS_CHANGE", "COMPETING", "EXCLUDED",
         "Did not meet technical compliance requirements.",
         step_actual(base_mech, 6) + " 10:00:00", ADMIN_USER_ID)
    )

eid_mech_ae = upsert_entry(PKG_MECH, AE, "COMPETING", 8)
log_advances(eid_mech_ae, base_mech, 8)

eid_mech_gp = upsert_entry(PKG_MECH, GP, "COMPETING", 8)
log_advances(eid_mech_gp, base_mech, 8)

conn.commit()
print("PKG-MECH entries done.")

# ── 7. PKG-ELEC: OT/NM at step 9, AE at step 8 ───────────────────────────────
base_elec = pkg_base_dates[PKG_ELEC]

eid_elec_ot = upsert_entry(PKG_ELEC, OT, "COMPETING", 8)
log_advances(eid_elec_ot, base_elec, 8)

eid_elec_nm = upsert_entry(PKG_ELEC, NM, "COMPETING", 8)
log_advances(eid_elec_nm, base_elec, 8)

eid_elec_ae = upsert_entry(PKG_ELEC, AE, "COMPETING", 7)
log_advances(eid_elec_ae, base_elec, 7)

conn.commit()
print("PKG-ELEC entries done.")

# ── 8. PKG-STRUC: NM/GP at step 4 ────────────────────────────────────────────
base_struc = pkg_base_dates[PKG_STRUC]

eid_struc_nm = upsert_entry(PKG_STRUC, NM, "COMPETING", 4)
log_advances(eid_struc_nm, base_struc, 4)

eid_struc_gp = upsert_entry(PKG_STRUC, GP, "COMPETING", 4)
log_advances(eid_struc_gp, base_struc, 4)

conn.commit()
print("PKG-STRUC entries done.")

# ── 9. PKG-INST: AE/GP at step 2 ─────────────────────────────────────────────
base_inst = pkg_base_dates[PKG_INST]

eid_inst_ae = upsert_entry(PKG_INST, AE, "COMPETING", 2)
log_advances(eid_inst_ae, base_inst, 2)

eid_inst_gp = upsert_entry(PKG_INST, GP, "COMPETING", 2)
log_advances(eid_inst_gp, base_inst, 2)

conn.commit()
print("PKG-INST entries done.")

conn.close()

print("\n=== Seeding complete! ===")
print("PKG-MECH  (9) : OT=AWARDED(12/12), NM=EXCLUDED(step7), AE=COMPETING(step9), GP=COMPETING(step9)")
print("PKG-ELEC  (10): OT=COMPETING(step9), NM=COMPETING(step9), AE=COMPETING(step8)")
print("PKG-STRUC (11): NM=COMPETING(step5), GP=COMPETING(step5)")
print("PKG-INST  (12): AE=COMPETING(step3), GP=COMPETING(step3)")
print("PKG-BPU   (13): unchanged")
