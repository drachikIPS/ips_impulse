from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text
import logging
import mimetypes
import os
import traceback
import database
import models
import auth

# ─────────────────────────────────────────────────────────────────────────────
# Operating environment switches (read once at process start)
# ─────────────────────────────────────────────────────────────────────────────
# IPS_DEBUG=1 enables developer-friendly error responses (raw exception
# string in the 500 body). Default OFF so production deployments do not
# leak tracebacks.
_IPS_DEBUG = os.environ.get("IPS_DEBUG", "0").lower() in ("1", "true", "yes", "on")

# IPS_CORS_ORIGINS is a comma-separated list of allowed origins. Empty
# string (default) disables the CORS middleware altogether — the platform
# serves the SPA and the API from the same origin, so CORS is only needed
# when an external host calls the API.
_IPS_CORS_ORIGINS = [
    o.strip() for o in os.environ.get("IPS_CORS_ORIGINS", "").split(",") if o.strip()
]

_log = logging.getLogger("ips.app")

# Ensure browsers receive the right Content-Type for the PWA manifest.
mimetypes.add_type("application/manifest+json", ".webmanifest")

from routers import auth_router, contacts, meeting_types, meetings, meeting_points, dashboard
from routers import packages, settings as settings_router
from routers import subservices as subservices_router
from routers import budget as budget_router
from routers import risks as risks_router
from routers import scope_changes as scope_changes_router
from routers import schedule as schedule_router
from routers import projects as projects_router
from routers import procurement as procurement_router
from routers.areas_units import area_router, unit_router, floorplan_router
from routers import documents as documents_router
from routers import attachments as attachments_router
from routers import export_import as export_import_router
from routers import quality_control as qc_router
from routers import meeting_export as meeting_export_router
from routers import org_chart as org_chart_router
from routers import construction as construction_router
from routers import safety as safety_router
from routers import safety_export as safety_export_router
from routers import punch_export as punch_export_router
from routers import reports as reports_router
from routers import module_leads as module_leads_router
from routers import startup_tasks as startup_tasks_router
from routers import full_export as full_export_router

import seed_data as sd

# ─────────────────────────────────────────────────────────────────────────────
# Create new tables (existing tables are left untouched by create_all)
# ─────────────────────────────────────────────────────────────────────────────
models.Base.metadata.create_all(bind=database.engine)


# ─────────────────────────────────────────────────────────────────────────────
# Database migrations
# ─────────────────────────────────────────────────────────────────────────────
def migrate_db():
    with database.engine.connect() as conn:

        # ── settings table: recreate with id PK + project_id if needed ────────
        settings_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(settings)")).fetchall()}
        if "project_id" not in settings_cols:
            conn.execute(text("ALTER TABLE settings RENAME TO settings_old"))
            conn.execute(text("""
                CREATE TABLE settings (
                    id INTEGER PRIMARY KEY,
                    project_id INTEGER NOT NULL DEFAULT 1,
                    key VARCHAR(100) NOT NULL,
                    value TEXT
                )
            """))
            conn.execute(text(
                "INSERT INTO settings (project_id, key, value) SELECT 1, key, value FROM settings_old"
            ))
            conn.execute(text("DROP TABLE settings_old"))
            conn.commit()

        # ── meeting_points: legacy columns ────────────────────────────────────
        mp_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(meeting_points)")).fetchall()}
        if "closed_at" not in mp_cols:
            conn.execute(text("ALTER TABLE meeting_points ADD COLUMN closed_at DATETIME"))
        if "source_module" not in mp_cols:
            conn.execute(text(
                "ALTER TABLE meeting_points ADD COLUMN source_module VARCHAR(100) DEFAULT 'Meeting Management'"
            ))

        # ── packages: reviewer columns ─────────────────────────────────────────
        pkg_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(packages)")).fetchall()}
        for col in ("pmc_technical_reviewer_id", "pmc_commercial_reviewer_id",
                    "client_technical_reviewer_id", "client_commercial_reviewer_id"):
            if col not in pkg_cols:
                conn.execute(text(f"ALTER TABLE packages ADD COLUMN {col} INTEGER"))

        # ── invoices: approval columns ─────────────────────────────────────────
        inv_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(invoices)")).fetchall()}
        if "pmc_approved" not in inv_cols:
            conn.execute(text("ALTER TABLE invoices ADD COLUMN pmc_approved BOOLEAN DEFAULT 0"))
        if "client_approved" not in inv_cols:
            conn.execute(text("ALTER TABLE invoices ADD COLUMN client_approved BOOLEAN DEFAULT 0"))
        if "created_by_id" not in inv_cols:
            conn.execute(text("ALTER TABLE invoices ADD COLUMN created_by_id INTEGER"))
        if "review_comment" not in inv_cols:
            conn.execute(text("ALTER TABLE invoices ADD COLUMN review_comment TEXT"))
        # Per-reviewer columns (align invoice approval flow with scope changes)
        for col, defn in [
            ("pmc_reviewed",      "BOOLEAN DEFAULT 0"),
            ("pmc_comment",       "TEXT"),
            ("pmc_reviewed_at",   "DATETIME"),
            ("client_reviewed",   "BOOLEAN DEFAULT 0"),
            ("client_comment",    "TEXT"),
            ("client_reviewed_at","DATETIME"),
            ("submitted_at",      "DATETIME"),
        ]:
            if col not in inv_cols:
                conn.execute(text(f"ALTER TABLE invoices ADD COLUMN {col} {defn}"))
        conn.commit()
        # Backfill per-reviewer state from legacy fields so existing APPROVED
        # invoices show the correct timeline status in the new UI.
        conn.execute(text("""
            UPDATE invoices
               SET pmc_reviewed = 1
             WHERE pmc_approved = 1 AND (pmc_reviewed IS NULL OR pmc_reviewed = 0)
        """))
        conn.execute(text("""
            UPDATE invoices
               SET client_reviewed = 1
             WHERE client_approved = 1 AND (client_reviewed IS NULL OR client_reviewed = 0)
        """))
        # If legacy review_comment exists on an invoice without per-reviewer
        # comments, copy it into both slots so reviewers see context.
        conn.execute(text("""
            UPDATE invoices
               SET pmc_comment = review_comment
             WHERE pmc_comment IS NULL AND review_comment IS NOT NULL AND pmc_reviewed = 1
        """))
        conn.execute(text("""
            UPDATE invoices
               SET client_comment = review_comment
             WHERE client_comment IS NULL AND review_comment IS NOT NULL AND client_reviewed = 1
        """))
        conn.commit()

        # ── Unblock items rejected under the old "first rejection wins" flow ──
        # Under the new rule the status stays PENDING/SUBMITTED until BOTH
        # reviewers have acted, so records previously auto-rejected before the
        # second reviewer had a chance are put back into review.
        conn.execute(text("""
            UPDATE invoices
               SET status = 'PENDING'
             WHERE status = 'REJECTED'
               AND (pmc_reviewed = 0 OR client_reviewed = 0)
        """))
        conn.execute(text("""
            UPDATE scope_changes
               SET status = 'SUBMITTED'
             WHERE status = 'REJECTED'
               AND (pmc_reviewed = 0 OR client_reviewed = 0)
        """))
        # Progress reports — same fix for records rejected before both reviewers acted.
        try:
            conn.execute(text("""
                UPDATE progress_reports
                   SET status = 'SUBMITTED'
                 WHERE status = 'REJECTED'
                   AND (pmc_reviewed = 0 OR client_reviewed = 0)
            """))
        except Exception:
            pass
        conn.commit()

        # ── Auto-approve sides with no reviewer assigned on the package ───────
        # Matches the submit-time auto-approval for invoices, scope changes and
        # progress reports. Records already in review before those fixes still
        # require approval from a non-existent reviewer, so patch them here.
        _auto_pairs = [
            ("invoices",        "PENDING"),
            ("scope_changes",   "SUBMITTED"),
            ("progress_reports","SUBMITTED"),
        ]
        for _tbl, _in_review in _auto_pairs:
            try:
                # PMC side
                conn.execute(text(f"""
                    UPDATE {_tbl}
                       SET pmc_reviewed    = 1,
                           pmc_approved    = 1,
                           pmc_comment     = COALESCE(pmc_comment, 'No reviewer assigned'),
                           pmc_reviewed_at = COALESCE(pmc_reviewed_at, CURRENT_TIMESTAMP)
                     WHERE status = :s
                       AND (pmc_reviewed = 0 OR pmc_reviewed IS NULL)
                       AND package_id IN (
                           SELECT id FROM packages WHERE pmc_commercial_reviewer_id IS NULL
                       )
                """), {"s": _in_review})
                # Client side
                conn.execute(text(f"""
                    UPDATE {_tbl}
                       SET client_reviewed    = 1,
                           client_approved    = 1,
                           client_comment     = COALESCE(client_comment, 'No reviewer assigned'),
                           client_reviewed_at = COALESCE(client_reviewed_at, CURRENT_TIMESTAMP)
                     WHERE status = :s
                       AND (client_reviewed = 0 OR client_reviewed IS NULL)
                       AND package_id IN (
                           SELECT id FROM packages WHERE client_commercial_reviewer_id IS NULL
                       )
                """), {"s": _in_review})
            except Exception as _e:
                print(f"[migration] auto-approve missing reviewers on {_tbl} failed: {_e}")

        # Progress report ENTRIES also need per-task flags for the grid to
        # render the auto-approved side consistently.
        try:
            conn.execute(text("""
                UPDATE progress_report_entries
                   SET pmc_approved = 1
                 WHERE pmc_approved IS NULL
                   AND progress_report_id IN (
                       SELECT pr.id FROM progress_reports pr
                        WHERE pr.pmc_reviewed = 1
                          AND pr.pmc_approved = 1
                          AND pr.pmc_comment  = 'No reviewer assigned'
                   )
            """))
            conn.execute(text("""
                UPDATE progress_report_entries
                   SET client_approved = 1
                 WHERE client_approved IS NULL
                   AND progress_report_id IN (
                       SELECT pr.id FROM progress_reports pr
                        WHERE pr.client_reviewed = 1
                          AND pr.client_approved = 1
                          AND pr.client_comment  = 'No reviewer assigned'
                   )
            """))
        except Exception as _e:
            print(f"[migration] auto-approve PR entries failed: {_e}")

        # Now that auto-approval has been applied, re-evaluate terminal status.
        for _tbl, _in_review in _auto_pairs:
            try:
                conn.execute(text(f"""
                    UPDATE {_tbl}
                       SET status = 'APPROVED'
                     WHERE status = :s
                       AND pmc_reviewed = 1 AND pmc_approved = 1
                       AND client_reviewed = 1 AND client_approved = 1
                """), {"s": _in_review})
            except Exception as _e:
                print(f"[migration] terminal status re-eval on {_tbl} failed: {_e}")
        conn.commit()

        # ── users: must_change_password, phone, last_login_at ────────────────
        user_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(users)")).fetchall()}
        if "must_change_password" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT 0"))
        if "last_login_at" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN last_login_at DATETIME"))
        if "phone" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(50)"))
            # Backfill phone from linked contact's phone if available
            conn.execute(text("""
                UPDATE users
                SET phone = (SELECT c.phone FROM contacts c WHERE c.id = users.contact_id)
                WHERE contact_id IS NOT NULL AND phone IS NULL
            """))

        # ── Migrate old USER role to PROJECT_TEAM ─────────────────────────────
        conn.execute(text("UPDATE users SET role='PROJECT_TEAM' WHERE role='USER'"))
        # Ensure BIDDER role is valid (no migration needed — string column)

        # ── Add project_id to all data tables (DEFAULT 1 = default project) ───
        tables_and_cols = [
            ("contacts",       "project_id INTEGER"),
            ("packages",       "project_id INTEGER"),
            ("subservices",    "project_id INTEGER"),
            ("meeting_types",  "project_id INTEGER"),
            ("meetings",       "project_id INTEGER"),
            ("meeting_points", "project_id INTEGER"),
            ("risk_categories","project_id INTEGER"),
            ("risk_phases",    "project_id INTEGER"),
            ("risks",          "project_id INTEGER"),
        ]
        for table, col_def in tables_and_cols:
            try:
                cols = {r[1] for r in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()}
                if "project_id" not in cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_def} DEFAULT 1"))
            except Exception:
                pass

        # ── projects: closure fields ──────────────────────────────────────────
        proj_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(projects)")).fetchall()}
        for col, defn in [
            ("closure_date",   "VARCHAR(20)"),
            ("overall_result", "VARCHAR(50)"),
            ("lessons_learned","TEXT"),
        ]:
            if col not in proj_cols:
                conn.execute(text(f"ALTER TABLE projects ADD COLUMN {col} {defn}"))

        # ── tasks: details field ──────────────────────────────────────────────
        try:
            task_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(tasks)")).fetchall()}
            if "details" not in task_cols:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN details TEXT"))
        except Exception:
            pass

        # ── Audit columns: created_at, created_by_id, updated_at, updated_by_id ─
        audit_additions = [
            # (table, column, definition)
            ("projects",       "created_by_id", "INTEGER REFERENCES users(id)"),
            ("projects",       "updated_at",    "DATETIME"),
            ("projects",       "updated_by_id", "INTEGER REFERENCES users(id)"),
            ("contacts",       "created_at",    "DATETIME"),
            ("contacts",       "created_by_id", "INTEGER REFERENCES users(id)"),
            ("contacts",       "updated_at",    "DATETIME"),
            ("contacts",       "updated_by_id", "INTEGER REFERENCES users(id)"),
            ("packages",       "created_by_id", "INTEGER REFERENCES users(id)"),
            ("packages",       "updated_at",    "DATETIME"),
            ("packages",       "updated_by_id", "INTEGER REFERENCES users(id)"),
            ("meeting_types",  "created_at",    "DATETIME"),
            ("meeting_types",  "created_by_id", "INTEGER REFERENCES users(id)"),
            ("meeting_types",  "updated_at",    "DATETIME"),
            ("meeting_types",  "updated_by_id", "INTEGER REFERENCES users(id)"),
            ("meetings",       "created_by_id", "INTEGER REFERENCES users(id)"),
            ("meetings",       "updated_at",    "DATETIME"),
            ("meetings",       "updated_by_id", "INTEGER REFERENCES users(id)"),
            ("meeting_points", "created_by_id", "INTEGER REFERENCES users(id)"),
            ("meeting_points", "updated_at",    "DATETIME"),
            ("meeting_points", "updated_by_id", "INTEGER REFERENCES users(id)"),
            ("risks",          "created_by_id", "INTEGER REFERENCES users(id)"),
            ("risks",          "updated_at",    "DATETIME"),
            ("risks",          "updated_by_id", "INTEGER REFERENCES users(id)"),
            ("scope_changes",  "updated_at",    "DATETIME"),
            ("scope_changes",  "updated_by_id", "INTEGER REFERENCES users(id)"),
            ("tasks",          "created_by_id", "INTEGER REFERENCES users(id)"),
            ("tasks",          "updated_at",    "DATETIME"),
            ("tasks",          "updated_by_id", "INTEGER REFERENCES users(id)"),
            ("orders",         "created_by_id", "INTEGER REFERENCES users(id)"),
            ("orders",         "updated_at",    "DATETIME"),
            ("orders",         "updated_by_id", "INTEGER REFERENCES users(id)"),
            ("invoices",       "updated_at",    "DATETIME"),
            ("invoices",       "updated_by_id", "INTEGER REFERENCES users(id)"),
        ]
        for table, col, defn in audit_additions:
            try:
                cols = {r[1] for r in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()}
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {defn}"))
            except Exception:
                pass

        # ── procurement_entries: add compliance notes and exclusion reason columns ──
        try:
            pe_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(procurement_entries)")).fetchall()}
            if pe_cols:
                for col, defn in [
                    ("exclusion_reason",          "TEXT"),
                    ("technical_compliance_note",  "TEXT"),
                    ("commercial_compliance_note", "TEXT"),
                ]:
                    if col not in pe_cols:
                        conn.execute(text(f"ALTER TABLE procurement_entries ADD COLUMN {col} {defn}"))
                conn.commit()
        except Exception:
            pass

        # ── package_plan_bidders: old schema had user_id, new schema has company_id ─
        try:
            ppb_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(package_plan_bidders)")).fetchall()}
            if ppb_cols and "company_id" not in ppb_cols:
                # Drop old table — create_all will recreate with correct schema
                conn.execute(text("DROP TABLE IF EXISTS package_plan_bidders"))
                conn.commit()
        except Exception:
            pass

        # ── tasks: add area_id and unit_id columns ───────────────────────────
        try:
            task_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(tasks)")).fetchall()}
            for col in ("area_id", "unit_id"):
                if task_cols and col not in task_cols:
                    conn.execute(text(f"ALTER TABLE tasks ADD COLUMN {col} INTEGER REFERENCES areas(id)"))
            conn.commit()
        except Exception:
            pass

        # ── role_permissions table is no longer used (matrix replaced by ──────
        # ── hardcoded role rules); drop it once on startup. ──────────────────
        try:
            conn.execute(text("DROP TABLE IF EXISTS role_permissions"))
            conn.commit()
        except Exception:
            pass

        # ── package_plans: add not_applicable flag (excludes a package from ───
        # ── the procurement Register tab and Dashboard). ─────────────────────
        try:
            pp_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(package_plans)")).fetchall()}
            if pp_cols and "not_applicable" not in pp_cols:
                conn.execute(text("ALTER TABLE package_plans ADD COLUMN not_applicable BOOLEAN NOT NULL DEFAULT 0"))
                conn.commit()
        except Exception:
            pass

        # ── file_attachments: add step_id (auto-stamped on procurement_entry ──
        # ── uploads so the bidder portal can group docs by step). ───────────
        try:
            fa_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(file_attachments)")).fetchall()}
            if fa_cols and "step_id" not in fa_cols:
                conn.execute(text("ALTER TABLE file_attachments ADD COLUMN step_id INTEGER"))
                conn.commit()
        except Exception:
            pass

        # ── progress_reports: migrate from per-task to per-package schema ──────
        try:
            pr_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(progress_reports)")).fetchall()}
            if pr_cols and "task_id" in pr_cols and "package_id" not in pr_cols:
                # Old per-task schema — drop and let create_all rebuild
                conn.execute(text("DROP TABLE IF EXISTS progress_reports"))
                conn.commit()
        except Exception:
            pass

        # ── progress_report_entries: create if missing ────────────────────────
        try:
            conn.execute(text("SELECT 1 FROM progress_report_entries LIMIT 1"))
        except Exception:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS progress_report_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    progress_report_id INTEGER NOT NULL REFERENCES progress_reports(id) ON DELETE CASCADE,
                    task_id INTEGER NOT NULL REFERENCES tasks(id),
                    percentage REAL NOT NULL DEFAULT 0.0,
                    note TEXT,
                    pmc_approved BOOLEAN,
                    client_approved BOOLEAN,
                    created_at DATETIME
                )
            """))
            conn.commit()

        # ── document management tables ────────────────────────────────────────
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL REFERENCES projects(id),
                    package_id INTEGER NOT NULL REFERENCES packages(id),
                    subservice_id INTEGER NOT NULL REFERENCES subservices(id),
                    document_type VARCHAR(20) NOT NULL,
                    description VARCHAR(500) NOT NULL,
                    area_id INTEGER REFERENCES areas(id),
                    unit_id INTEGER REFERENCES units(id),
                    require_area_review BOOLEAN DEFAULT 0,
                    require_unit_review BOOLEAN DEFAULT 0,
                    start_date VARCHAR(20),
                    first_issue_date VARCHAR(20),
                    approval_due_date VARCHAR(20),
                    distribution_package_ids TEXT DEFAULT '[]',
                    status VARCHAR(20) DEFAULT 'DRAFT',
                    current_version INTEGER DEFAULT 0,
                    created_at DATETIME,
                    created_by_id INTEGER REFERENCES users(id),
                    updated_at DATETIME,
                    updated_by_id INTEGER REFERENCES users(id)
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS document_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id INTEGER NOT NULL REFERENCES documents(id),
                    version INTEGER NOT NULL,
                    status VARCHAR(20) DEFAULT 'IN_REVIEW',
                    launched_at DATETIME,
                    launched_by_id INTEGER REFERENCES users(id),
                    completed_at DATETIME
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS document_reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id INTEGER NOT NULL REFERENCES documents(id),
                    version INTEGER NOT NULL,
                    reviewer_contact_id INTEGER REFERENCES contacts(id),
                    reviewer_role VARCHAR(300),
                    source_kind VARCHAR(50),
                    status VARCHAR(20) DEFAULT 'PENDING',
                    comment TEXT,
                    reviewed_at DATETIME,
                    reviewed_by_id INTEGER REFERENCES users(id)
                )
            """))
            conn.commit()
        except Exception:
            pass

        # ── document_reviews: add source_kind + split collapsed PENDING rows ──
        try:
            dr_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(document_reviews)")).fetchall()}
            if "source_kind" not in dr_cols:
                conn.execute(text("ALTER TABLE document_reviews ADD COLUMN source_kind VARCHAR(50)"))
                conn.commit()

            # Backfill source_kind from role text for rows that don't have it yet.
            # Role label -> source_kind. Labels come from _collect_reviewers.
            role_to_source = [
                ("PMC Technical (Package)",        "PACKAGE_PMC_TECHNICAL"),
                ("Client Technical (Package)",     "PACKAGE_CLIENT_TECHNICAL"),
                ("PMC Commercial (Package)",       "PACKAGE_PMC_COMMERCIAL"),
                ("Client Commercial (Package)",    "PACKAGE_CLIENT_COMMERCIAL"),
                ("PMC Technical (Sub-service)",    "SUBSERVICE_PMC"),
                ("PMC Commercial (Sub-service)",   "SUBSERVICE_PMC"),
                ("Client Technical (Sub-service)", "SUBSERVICE_CLIENT"),
                ("Client Commercial (Sub-service)","SUBSERVICE_CLIENT"),
                ("Area Owner",                     "AREA_OWNER"),
                ("Unit Owner",                     "UNIT_OWNER"),
            ]

            # Rows still needing a source_kind.
            rows = conn.execute(text(
                "SELECT id, reviewer_role, status, document_id, version, reviewer_contact_id, "
                "comment, reviewed_at, reviewed_by_id FROM document_reviews WHERE source_kind IS NULL"
            )).fetchall()

            def parts_of(role_text):
                return [p.strip() for p in (role_text or "").split(" / ") if p.strip()]

            def resolve_kind(part):
                for label, kind in role_to_source:
                    if label == part:
                        return kind
                return None

            for r in rows:
                rid, role_text, status, doc_id, ver, contact_id, comment, r_at, r_by = r
                parts = parts_of(role_text)
                if not parts:
                    continue
                if len(parts) == 1:
                    kind = resolve_kind(parts[0])
                    if kind:
                        conn.execute(text(
                            "UPDATE document_reviews SET source_kind=:k WHERE id=:id"
                        ), {"k": kind, "id": rid})
                    continue

                # Collapsed row (multiple " / "-separated roles).
                # For PENDING rows: split into one row per source; assign the first
                # source to the existing row, create siblings for the rest.
                # For decided rows (non-PENDING): assign the first source and leave
                # the combined historical label alone — it's an immutable audit row.
                kinds = [resolve_kind(p) for p in parts]
                kinds = [k for k in kinds if k]
                if not kinds:
                    continue

                if status == "PENDING":
                    # Update existing row to first kind + single-role label
                    conn.execute(text(
                        "UPDATE document_reviews SET source_kind=:k, reviewer_role=:r WHERE id=:id"
                    ), {"k": kinds[0], "r": parts[0], "id": rid})
                    # Insert siblings for remaining kinds
                    for extra_part, extra_kind in zip(parts[1:], kinds[1:]):
                        conn.execute(text(
                            "INSERT INTO document_reviews "
                            "(document_id, version, reviewer_contact_id, reviewer_role, source_kind, status, comment, reviewed_at, reviewed_by_id) "
                            "VALUES (:doc, :ver, :cid, :role, :k, 'PENDING', NULL, NULL, NULL)"
                        ), {"doc": doc_id, "ver": ver, "cid": contact_id, "role": extra_part, "k": extra_kind})
                else:
                    # Historical collapsed decision — tag with first kind only
                    conn.execute(text(
                        "UPDATE document_reviews SET source_kind=:k WHERE id=:id"
                    ), {"k": kinds[0], "id": rid})
            conn.commit()
        except Exception:
            pass

        # ── file attachments ─────────────────────────────────────────────────────
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS file_attachments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL REFERENCES projects(id),
                    record_type VARCHAR(50) NOT NULL,
                    record_id INTEGER NOT NULL,
                    original_filename VARCHAR(500) NOT NULL,
                    stored_path VARCHAR(1000) NOT NULL,
                    file_size INTEGER DEFAULT 0,
                    content_type VARCHAR(200),
                    uploaded_at DATETIME,
                    uploaded_by_id INTEGER REFERENCES users(id)
                )
            """))
            conn.commit()
        except Exception:
            pass

        # ── meeting_types: recurrence fields ─────────────────────────────────────
        try:
            mt_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(meeting_types)")).fetchall()}
            for col, defn in [
                ("is_recurrent",          "BOOLEAN DEFAULT 0"),
                ("recurrence",            "VARCHAR(20)"),
                ("days_of_week",          "TEXT"),
                ("day_of_week",           "INTEGER"),
                ("monthly_week_position", "INTEGER"),
                ("recurrence_time",       "VARCHAR(10)"),
                ("duration",              "INTEGER"),
                ("owning_package_id",     "INTEGER REFERENCES packages(id)"),
            ]:
                if col not in mt_cols:
                    conn.execute(text(f"ALTER TABLE meeting_types ADD COLUMN {col} {defn}"))
            conn.commit()
        except Exception:
            pass

        # ── documents: weight + actual start fields ──────────────────────────────
        try:
            doc_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(documents)")).fetchall()}
            for col, defn in [
                ("weight",               "INTEGER DEFAULT 8"),
                ("actual_start_date",    "VARCHAR(20)"),
                ("actual_start_by_id",   "INTEGER REFERENCES users(id)"),
            ]:
                if col not in doc_cols:
                    conn.execute(text(f"ALTER TABLE documents ADD COLUMN {col} {defn}"))
            conn.commit()
        except Exception:
            pass

        # ── Quality Control — ITP tables ──────────────────────────────────────
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS itp_test_types (

                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL REFERENCES projects(id),
                    name VARCHAR(200) NOT NULL,
                    description TEXT,
                    sort_order INTEGER DEFAULT 0,
                    created_at DATETIME,
                    created_by_id INTEGER REFERENCES users(id),
                    updated_at DATETIME,
                    updated_by_id INTEGER REFERENCES users(id)
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS itp_witness_levels (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL REFERENCES projects(id),
                    code VARCHAR(10) NOT NULL,
                    name VARCHAR(200) NOT NULL,
                    description TEXT,
                    sort_order INTEGER DEFAULT 0,
                    created_at DATETIME,
                    created_by_id INTEGER REFERENCES users(id),
                    updated_at DATETIME,
                    updated_by_id INTEGER REFERENCES users(id)
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS itp_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL REFERENCES projects(id),
                    package_id INTEGER NOT NULL REFERENCES packages(id),
                    test_type_id INTEGER NOT NULL REFERENCES itp_test_types(id),
                    description VARCHAR(500) NOT NULL,
                    witness_level_id INTEGER NOT NULL REFERENCES itp_witness_levels(id),
                    status VARCHAR(20) DEFAULT 'DRAFT',
                    approval_status VARCHAR(20) DEFAULT 'PENDING',
                    area_id INTEGER REFERENCES areas(id),
                    unit_id INTEGER REFERENCES units(id),
                    acceptance_criteria TEXT,
                    result TEXT,
                    planned_date VARCHAR(20),
                    executed_date VARCHAR(20),
                    created_at DATETIME,
                    created_by_id INTEGER REFERENCES users(id),
                    updated_at DATETIME,
                    updated_by_id INTEGER REFERENCES users(id)
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS itp_reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    itp_id INTEGER NOT NULL REFERENCES itp_records(id) ON DELETE CASCADE,
                    reviewer_contact_id INTEGER NOT NULL REFERENCES contacts(id),
                    reviewer_role VARCHAR(50),
                    status VARCHAR(20) DEFAULT 'PENDING',
                    comment TEXT,
                    reviewed_at DATETIME,
                    reviewed_by_id INTEGER REFERENCES users(id)
                )
            """))
            conn.commit()
        except Exception:
            pass

        # ── itp_records: rebuild table to drop description NOT NULL, add test/details ──
        try:
            itp_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(itp_records)")).fetchall()}
            if "description" in itp_cols:
                # Disable FK enforcement so DROP TABLE itp_records doesn't fail
                conn.execute(text("PRAGMA foreign_keys = OFF"))
                conn.execute(text("DROP TABLE IF EXISTS itp_records_new"))
                conn.execute(text("""
                    CREATE TABLE itp_records_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        project_id INTEGER NOT NULL REFERENCES projects(id),
                        package_id INTEGER NOT NULL REFERENCES packages(id),
                        test_type_id INTEGER NOT NULL REFERENCES itp_test_types(id),
                        test VARCHAR(200),
                        details VARCHAR(500),
                        witness_level_id INTEGER NOT NULL REFERENCES itp_witness_levels(id),
                        status VARCHAR(20) DEFAULT 'DRAFT',
                        approval_status VARCHAR(20) DEFAULT 'PENDING',
                        area_id INTEGER REFERENCES areas(id),
                        unit_id INTEGER REFERENCES units(id),
                        acceptance_criteria TEXT,
                        result TEXT,
                        planned_date VARCHAR(20),
                        executed_date VARCHAR(20),
                        created_at DATETIME,
                        created_by_id INTEGER REFERENCES users(id),
                        updated_at DATETIME,
                        updated_by_id INTEGER REFERENCES users(id)
                    )
                """))
                conn.execute(text("""
                    INSERT INTO itp_records_new
                        (id, project_id, package_id, test_type_id, test, details,
                         witness_level_id, status, approval_status, area_id, unit_id,
                         acceptance_criteria, result, planned_date, executed_date,
                         created_at, created_by_id, updated_at, updated_by_id)
                    SELECT id, project_id, package_id, test_type_id, NULL, description,
                           witness_level_id, status, approval_status, area_id, unit_id,
                           acceptance_criteria, result, planned_date, executed_date,
                           created_at, created_by_id, updated_at, updated_by_id
                    FROM itp_records
                """))
                conn.execute(text("DROP TABLE itp_records"))
                conn.execute(text("ALTER TABLE itp_records_new RENAME TO itp_records"))
                conn.execute(text("PRAGMA foreign_keys = ON"))
                conn.commit()
                print("[migration] itp_records rebuilt: description removed, test/details added")
        except Exception as e:
            print(f"[migration] itp_records rebuild failed: {e}")
            conn.execute(text("PRAGMA foreign_keys = ON"))

        # ── areas and units tables (created by create_all; no migration needed) ─
        # Ensure tables exist for older DBs that pre-date create_all adding them
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS areas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL REFERENCES projects(id),
                    tag VARCHAR(100) NOT NULL,
                    description VARCHAR(300) NOT NULL,
                    details TEXT,
                    owner_id INTEGER REFERENCES contacts(id),
                    created_at DATETIME,
                    created_by_id INTEGER REFERENCES users(id),
                    updated_at DATETIME,
                    updated_by_id INTEGER REFERENCES users(id)
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS units (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL REFERENCES projects(id),
                    tag VARCHAR(100) NOT NULL,
                    description VARCHAR(300) NOT NULL,
                    details TEXT,
                    owner_id INTEGER REFERENCES contacts(id),
                    created_at DATETIME,
                    created_by_id INTEGER REFERENCES users(id),
                    updated_at DATETIME,
                    updated_by_id INTEGER REFERENCES users(id)
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS area_site_supervisors (
                    area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
                    contact_id INTEGER NOT NULL REFERENCES contacts(id),
                    PRIMARY KEY (area_id, contact_id)
                )
            """))
            conn.commit()
        except Exception:
            pass

        # ── floorplans table + areas.floorplan_id column ──────────────────────
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS floorplans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL REFERENCES projects(id),
                    name VARCHAR(255) NOT NULL,
                    stored_path VARCHAR(512) NOT NULL,
                    original_filename VARCHAR(255),
                    content_type VARCHAR(100),
                    file_size INTEGER,
                    uploaded_at DATETIME,
                    uploaded_by_id INTEGER REFERENCES users(id)
                )
            """))
            a_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(areas)")).fetchall()}
            if a_cols and "floorplan_id" not in a_cols:
                conn.execute(text(
                    "ALTER TABLE areas ADD COLUMN floorplan_id INTEGER REFERENCES floorplans(id)"
                ))
            conn.commit()
        except Exception:
            pass

        # ── workers: approval-workflow columns ────────────────────────────────
        try:
            w_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(workers)")).fetchall()}
            if w_cols:
                for col, defn in [
                    ("status",            "VARCHAR(20) DEFAULT 'PENDING'"),
                    ("submitted_at",      "DATETIME"),
                    ("reviewed_at",       "DATETIME"),
                    ("reviewed_by_id",    "INTEGER"),
                    ("rejection_comment", "TEXT"),
                ]:
                    if col not in w_cols:
                        conn.execute(text(f"ALTER TABLE workers ADD COLUMN {col} {defn}"))
                conn.execute(text(
                    "UPDATE workers SET status='PENDING' WHERE status IS NULL OR status=''"
                ))
                conn.commit()
        except Exception:
            pass

        # ── daily_reports: lock columns ───────────────────────────────────────
        try:
            dr_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(daily_reports)")).fetchall()}
            if dr_cols:
                for col, defn in [
                    ("locked",           "BOOLEAN DEFAULT 1"),
                    ("locked_at",        "DATETIME"),
                    ("unlocked_at",      "DATETIME"),
                    ("unlocked_by_id",   "INTEGER"),
                    ("unlock_comment",   "TEXT"),
                ]:
                    if col not in dr_cols:
                        conn.execute(text(f"ALTER TABLE daily_reports ADD COLUMN {col} {defn}"))
                conn.execute(text(
                    "UPDATE daily_reports SET locked=1 WHERE locked IS NULL"
                ))
                conn.commit()
        except Exception:
            pass

        # ── safety_observation_categories: polarity column ────────────────────
        try:
            soc_cols = {r[1] for r in conn.execute(text(
                "PRAGMA table_info(safety_observation_categories)"
            )).fetchall()}
            if soc_cols and "polarity" not in soc_cols:
                conn.execute(text(
                    "ALTER TABLE safety_observation_categories "
                    "ADD COLUMN polarity VARCHAR(10) DEFAULT 'NEGATIVE'"
                ))
                # Flag any pre-existing "positive" category as POSITIVE so we
                # don't lose the one-off in the default seed list.
                conn.execute(text(
                    "UPDATE safety_observation_categories "
                    "SET polarity = 'POSITIVE' "
                    "WHERE LOWER(name) LIKE '%positive%'"
                ))
                conn.commit()
        except Exception:
            pass

        # ── Hot-path indexes ──────────────────────────────────────────────────
        # Most filter-heavy queries scan large multi-tenant tables by project_id
        # and then by a foreign key (responsible, daily-report id, etc.). These
        # indexes turn full scans into index lookups and make the Construction /
        # Meeting dashboards feel instant. CREATE INDEX IF NOT EXISTS is idempotent.
        for stmt in [
            "CREATE INDEX IF NOT EXISTS ix_daily_reports_project_date ON daily_reports(project_id, report_date)",
            "CREATE INDEX IF NOT EXISTS ix_daily_reports_package_date ON daily_reports(package_id, report_date)",
            "CREATE INDEX IF NOT EXISTS ix_daily_report_workers_report ON daily_report_workers(daily_report_id)",
            "CREATE INDEX IF NOT EXISTS ix_daily_report_workers_worker ON daily_report_workers(worker_id)",
            "CREATE INDEX IF NOT EXISTS ix_daily_report_areas_report ON daily_report_areas(daily_report_id)",
            "CREATE INDEX IF NOT EXISTS ix_meeting_points_project_resp ON meeting_points(project_id, responsible_id)",
            "CREATE INDEX IF NOT EXISTS ix_meeting_points_due_date ON meeting_points(due_date)",
            "CREATE INDEX IF NOT EXISTS ix_meetings_project_type ON meetings(project_id, meeting_type_id)",
            "CREATE INDEX IF NOT EXISTS ix_meeting_point_links_meeting ON meeting_point_links(meeting_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_observations_project ON safety_observations(project_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_observations_floorplan ON safety_observations(floorplan_id)",
            "CREATE INDEX IF NOT EXISTS ix_workers_project_package ON workers(project_id, package_id)",
            "CREATE INDEX IF NOT EXISTS ix_work_permits_project ON work_permits(project_id)",
            "CREATE INDEX IF NOT EXISTS ix_areas_project_floorplan ON areas(project_id, floorplan_id)",
            "CREATE INDEX IF NOT EXISTS ix_documents_project_pkg ON documents(project_id, package_id)",
            "CREATE INDEX IF NOT EXISTS ix_punch_items_project ON punch_items(project_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_incidents_project ON safety_incidents(project_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_incidents_package ON safety_incidents(project_id, package_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_incidents_area ON safety_incidents(project_id, area_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_incident_workers_incident ON safety_incident_workers(incident_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_incident_reviews_incident ON safety_incident_reviews(incident_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_incident_notes_incident ON safety_incident_notes(incident_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_toolboxes_project ON safety_toolboxes(project_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_toolbox_packages_toolbox ON safety_toolbox_packages(toolbox_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_toolbox_packages_package ON safety_toolbox_packages(package_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_toolbox_workers_toolbox ON safety_toolbox_workers(toolbox_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_toolbox_observations_obs ON safety_toolbox_observations(observation_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_toolbox_incidents_inc ON safety_toolbox_incidents(incident_id)",
            "CREATE INDEX IF NOT EXISTS ix_safety_toolbox_reviews_toolbox ON safety_toolbox_reviews(toolbox_id)",
        ]:
            try:
                conn.execute(text(stmt))
            except Exception:
                # Table may not exist yet on a fresh DB — Base.metadata.create_all
                # ran above so this is rare, but stay defensive.
                pass
        try:
            conn.commit()
        except Exception:
            pass

        # ── safety_observations: floorplan pin columns ────────────────────────
        try:
            so_cols = {r[1] for r in conn.execute(text(
                "PRAGMA table_info(safety_observations)"
            )).fetchall()}
            if so_cols:
                for col, defn in [
                    ("floorplan_id", "INTEGER REFERENCES floorplans(id)"),
                    ("floorplan_x",  "FLOAT"),
                    ("floorplan_y",  "FLOAT"),
                ]:
                    if col not in so_cols:
                        conn.execute(text(
                            f"ALTER TABLE safety_observations ADD COLUMN {col} {defn}"
                        ))
                conn.commit()
        except Exception:
            pass

        # ── safety_toolboxes: acknowledge columns ─────────────────────────────
        try:
            tbx_cols = {r[1] for r in conn.execute(text(
                "PRAGMA table_info(safety_toolboxes)"
            )).fetchall()}
            if tbx_cols:
                for col, defn in [
                    ("acknowledged_at",     "DATETIME"),
                    ("acknowledged_by_id",  "INTEGER REFERENCES users(id)"),
                    ("acknowledge_comment", "TEXT"),
                ]:
                    if col not in tbx_cols:
                        conn.execute(text(
                            f"ALTER TABLE safety_toolboxes ADD COLUMN {col} {defn}"
                        ))
                conn.commit()
        except Exception:
            pass

        # ── reports: background-generated PDF jobs ────────────────────────────
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL REFERENCES projects(id),
                    kind VARCHAR(50) NOT NULL,
                    status VARCHAR(20) DEFAULT 'PENDING' NOT NULL,
                    title VARCHAR(255),
                    filters_json TEXT,
                    filter_summary TEXT,
                    item_count INTEGER,
                    stored_path VARCHAR(1000),
                    file_size INTEGER,
                    error_message TEXT,
                    requested_by_id INTEGER REFERENCES users(id),
                    requested_at DATETIME NOT NULL,
                    started_at DATETIME,
                    completed_at DATETIME
                )
            """))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_reports_project_kind "
                "ON reports(project_id, kind)"
            ))
            # Reports stuck in PENDING/GENERATING when the worker died (e.g.,
            # because the app was restarted) can never complete — flag them so
            # the UI doesn't leave a permanent spinner.
            conn.execute(text("""
                UPDATE reports
                SET status = 'FAILED',
                    error_message = COALESCE(error_message, 'Interrupted by app restart'),
                    completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
                WHERE status IN ('PENDING', 'GENERATING')
            """))
            conn.commit()
        except Exception:
            pass

        # ── punch_items: floorplan pin columns ────────────────────────────────
        try:
            pi_cols = {r[1] for r in conn.execute(text(
                "PRAGMA table_info(punch_items)"
            )).fetchall()}
            if pi_cols:
                for col, defn in [
                    ("floorplan_id", "INTEGER REFERENCES floorplans(id)"),
                    ("floorplan_x",  "FLOAT"),
                    ("floorplan_y",  "FLOAT"),
                ]:
                    if col not in pi_cols:
                        conn.execute(text(
                            f"ALTER TABLE punch_items ADD COLUMN {col} {defn}"
                        ))
                conn.commit()
        except Exception:
            pass

        # ── per-project sequence IDs ──────────────────────────────────────────
        # Add project_seq_id column to all sequenced tables and backfill
        # existing rows with a per-project sequential number (ordered by id).
        _seq_tables = [
            "scope_changes", "risks", "documents",
            "meeting_points", "tasks", "itp_records", "punch_items",
        ]
        for _tbl in _seq_tables:
            try:
                _cols = {r[1] for r in conn.execute(text(f"PRAGMA table_info({_tbl})")).fetchall()}
                if "project_seq_id" not in _cols:
                    conn.execute(text(f"ALTER TABLE {_tbl} ADD COLUMN project_seq_id INTEGER"))
                    conn.commit()
                # Backfill: assign sequential numbers per project ordered by id
                conn.execute(text(f"""
                    UPDATE {_tbl}
                    SET project_seq_id = (
                        SELECT COUNT(*) FROM {_tbl} t2
                        WHERE t2.project_id = {_tbl}.project_id
                          AND t2.id <= {_tbl}.id
                    )
                    WHERE project_seq_id IS NULL
                """))
                conn.commit()
            except Exception as _e:
                print(f"[migration] project_seq_id for {_tbl} failed: {_e}")

        # ── itp_records: fix approval_status for pre-execute records ──────────
        # Records that are DRAFT or PLANNED have never been executed, so their
        # approval_status should be TO_SUBMIT, not PENDING.
        try:
            conn.execute(text("""
                UPDATE itp_records
                SET approval_status = 'TO_SUBMIT'
                WHERE approval_status = 'PENDING'
                  AND status IN ('DRAFT', 'PLANNED')
            """))
            conn.commit()
        except Exception as e:
            print(f"[migration] itp approval_status fix failed: {e}")

        # ── itp_records: per-reviewer columns (mirror SC/Invoice/PR) ──────────
        # Fold existing itp_reviews rows into flat columns on itp_records so
        # reviewer lookup becomes dynamic via Package.*technical_reviewer_id.
        try:
            itp_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(itp_records)")).fetchall()}
            for col, defn in [
                ("pmc_reviewed",         "BOOLEAN DEFAULT 0"),
                ("pmc_approved",         "BOOLEAN"),
                ("pmc_comment",          "TEXT"),
                ("pmc_reviewed_at",      "DATETIME"),
                ("pmc_reviewed_by_id",   "INTEGER REFERENCES users(id)"),
                ("client_reviewed",      "BOOLEAN DEFAULT 0"),
                ("client_approved",      "BOOLEAN"),
                ("client_comment",       "TEXT"),
                ("client_reviewed_at",   "DATETIME"),
                ("client_reviewed_by_id","INTEGER REFERENCES users(id)"),
            ]:
                if col not in itp_cols:
                    conn.execute(text(f"ALTER TABLE itp_records ADD COLUMN {col} {defn}"))
            conn.commit()
            # Backfill from itp_reviews — one row per reviewer role per ITP.
            try:
                rows = conn.execute(text("""
                    SELECT itp_id, reviewer_role, status, comment, reviewed_at, reviewed_by_id
                      FROM itp_reviews
                """)).fetchall()
            except Exception:
                rows = []
            for itp_id, role, status, comment, reviewed_at, reviewed_by_id in rows:
                reviewed_flag = 1 if status in ("APPROVED", "REJECTED") else 0
                approved_flag = 1 if status == "APPROVED" else (0 if status == "REJECTED" else None)
                prefix = "pmc" if role == "PMC_TECHNICAL" else ("client" if role == "CLIENT_TECHNICAL" else None)
                if prefix is None:
                    continue
                conn.execute(text(f"""
                    UPDATE itp_records
                       SET {prefix}_reviewed       = :rev,
                           {prefix}_approved       = :app,
                           {prefix}_comment        = :cmt,
                           {prefix}_reviewed_at    = :at,
                           {prefix}_reviewed_by_id = :by
                     WHERE id = :itp
                       AND ({prefix}_reviewed IS NULL OR {prefix}_reviewed = 0)
                """), {
                    "rev": reviewed_flag, "app": approved_flag, "cmt": comment,
                    "at": reviewed_at, "by": reviewed_by_id, "itp": itp_id,
                })
            conn.commit()
        except Exception as e:
            print(f"[migration] itp per-reviewer columns failed: {e}")

        conn.commit()

        # ── documents: backfill DRAFT DocumentVersion records ────────────────
        # Documents created before per-version attachment support have no DocumentVersion
        # record for their current DRAFT/APPROVED version. Create one so attachments work.
        try:
            docs_without_ver = conn.execute(text("""
                SELECT d.id, d.current_version FROM documents d
                WHERE NOT EXISTS (
                    SELECT 1 FROM document_versions dv
                    WHERE dv.document_id = d.id AND dv.version = d.current_version
                )
            """)).fetchall()
            for doc_id, cur_ver in docs_without_ver:
                conn.execute(text("""
                    INSERT INTO document_versions (document_id, version, status)
                    VALUES (:doc_id, :version, 'DRAFT')
                """), {"doc_id": doc_id, "version": cur_ver})
            conn.commit()
        except Exception as e:
            print(f"[migration] document_versions backfill failed: {e}")

        # ── documents: last_approved_version ─────────────────────────────────
        try:
            doc_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(documents)")).fetchall()}
            if doc_cols and "last_approved_version" not in doc_cols:
                conn.execute(text("ALTER TABLE documents ADD COLUMN last_approved_version INTEGER"))
                conn.commit()
            # Backfill: set last_approved_version for documents approved before this column existed
            conn.execute(text("""
                UPDATE documents
                SET last_approved_version = (
                    SELECT MAX(dv.version)
                    FROM document_versions dv
                    WHERE dv.document_id = documents.id
                      AND dv.status = 'APPROVED'
                )
                WHERE last_approved_version IS NULL
                  AND EXISTS (
                    SELECT 1 FROM document_versions dv2
                    WHERE dv2.document_id = documents.id
                      AND dv2.status = 'APPROVED'
                  )
            """))
            conn.commit()
        except Exception as e:
            print(f"[migration] documents.last_approved_version failed: {e}")

        # ── Migrate DRAFT status to NOT_STARTED / IN_PROGRESS ──
        try:
            conn.execute(text("""
                UPDATE documents SET status = 'IN_PROGRESS'
                WHERE status = 'DRAFT' AND actual_start_date IS NOT NULL
            """))
            conn.execute(text("""
                UPDATE documents SET status = 'NOT_STARTED'
                WHERE status = 'DRAFT'
            """))
            conn.execute(text("""
                UPDATE document_versions SET status = 'NOT_STARTED'
                WHERE status = 'DRAFT'
            """))
            conn.commit()
        except Exception as e:
            print(f"[migration] document DRAFT→NOT_STARTED/IN_PROGRESS failed: {e}")

        # ── work_permits: approval workflow columns ──────────────────────────
        try:
            wp_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(work_permits)")).fetchall()}
            if wp_cols:
                for col, defn in [
                    ("status",           "VARCHAR(20) DEFAULT 'DRAFT'"),
                    ("submitted_at",     "DATETIME"),
                    ("submitted_by_id",  "INTEGER"),
                ]:
                    if col not in wp_cols:
                        conn.execute(text(f"ALTER TABLE work_permits ADD COLUMN {col} {defn}"))
                conn.execute(text(
                    "UPDATE work_permits SET status='DRAFT' WHERE status IS NULL OR status=''"
                ))
                conn.commit()
        except Exception as e:
            print(f"[migration] work_permits approval columns failed: {e}")

        # ── work_permit_reviews: backfill synthetic events for permits that
        # were submitted / approved / rejected / closed before the history
        # logging was wired into the approval endpoints. Uses timestamps
        # already on work_permits and work_permit_area_approvals; nothing
        # is synthesised for permits that already have at least one review
        # row so re-running the migration is a no-op. ─────────────────────
        try:
            # Only target permits missing any review row — runs once per permit.
            missing = conn.execute(text("""
                SELECT wp.id, wp.status, wp.submitted_at, wp.submitted_by_id,
                       wp.updated_at, wp.updated_by_id, wp.created_at, wp.created_by_id
                FROM work_permits wp
                WHERE wp.status IN ('PENDING','APPROVED','REJECTED','CLOSED')
                  AND NOT EXISTS (
                    SELECT 1 FROM work_permit_reviews wpr
                    WHERE wpr.work_permit_id = wp.id
                  )
            """)).fetchall()
            for row in missing:
                pid, status, submitted_at, submitted_by_id, \
                    updated_at, updated_by_id, created_at, created_by_id = row
                submit_ts = submitted_at or created_at or updated_at
                submit_actor = submitted_by_id or created_by_id
                conn.execute(text("""
                    INSERT INTO work_permit_reviews
                        (work_permit_id, event, actor_id, created_at)
                    VALUES (:pid, 'SUBMIT', :uid, :ts)
                """), {"pid": pid, "uid": submit_actor, "ts": submit_ts})

                areas = conn.execute(text("""
                    SELECT area_id, status, reviewed_at, reviewed_by_id, rejection_comment
                    FROM work_permit_area_approvals
                    WHERE work_permit_id = :pid
                    ORDER BY reviewed_at NULLS LAST, area_id
                """), {"pid": pid}).fetchall()
                for aid, ap_status, reviewed_at, reviewed_by_id, rejection_comment in areas:
                    ts = reviewed_at or submit_ts
                    if ap_status == "APPROVED":
                        conn.execute(text("""
                            INSERT INTO work_permit_reviews
                                (work_permit_id, event, area_id, approved, actor_id, created_at)
                            VALUES (:pid, 'APPROVE', :aid, 1, :uid, :ts)
                        """), {"pid": pid, "aid": aid, "uid": reviewed_by_id, "ts": ts})
                    elif ap_status == "REJECTED":
                        conn.execute(text("""
                            INSERT INTO work_permit_reviews
                                (work_permit_id, event, area_id, approved, comment, actor_id, created_at)
                            VALUES (:pid, 'REJECT', :aid, 0, :cmt, :uid, :ts)
                        """), {"pid": pid, "aid": aid, "cmt": rejection_comment,
                               "uid": reviewed_by_id, "ts": ts})
                if status == "CLOSED":
                    conn.execute(text("""
                        INSERT INTO work_permit_reviews
                            (work_permit_id, event, actor_id, created_at)
                        VALUES (:pid, 'CLOSE', :uid, :ts)
                    """), {"pid": pid, "uid": updated_by_id, "ts": updated_at or submit_ts})
            if missing:
                conn.commit()
                print(f"[migration] Backfilled work_permit_reviews for {len(missing)} permit(s).")
        except Exception as e:
            print(f"[migration] work_permit_reviews backfill failed: {e}")


migrate_db()


# ─────────────────────────────────────────────────────────────────────────────
# Seed functions
# ─────────────────────────────────────────────────────────────────────────────

def seed_default_project():
    """Create a default project and migrate all existing data to it."""
    db = database.SessionLocal()
    try:
        if db.query(models.Project).count() > 0:
            return  # Already have projects

        # Create the default project
        project = models.Project(
            project_number="DEFAULT",
            description="Default Project",
            status="ACTIVE",
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        pid = project.id

        # Assign all existing data to this project
        from sqlalchemy import text as t
        with database.engine.connect() as conn:
            for table in ("contacts", "packages", "subservices", "meeting_types",
                          "meetings", "meeting_points", "risk_categories",
                          "risk_phases", "risks"):
                conn.execute(t(f"UPDATE {table} SET project_id = {pid} WHERE project_id IS NULL OR project_id = 1"))
            conn.execute(t(f"UPDATE settings SET project_id = {pid} WHERE project_id = 1"))
            conn.commit()

        # Create user_projects entries for all non-ADMIN users
        users = db.query(models.User).filter(models.User.role != "ADMIN").all()
        for u in users:
            existing = db.query(models.UserProject).filter_by(
                user_id=u.id, project_id=pid
            ).first()
            if not existing:
                db.add(models.UserProject(user_id=u.id, project_id=pid, role=u.role))
        db.commit()

        print(f"Default project created (id={pid}). All existing data migrated.")
    finally:
        db.close()


seed_default_project()


def seed_admin():
    db = database.SessionLocal()
    try:
        if not db.query(models.User).first():
            admin = models.User(
                name="Administrator",
                email="admin@ips.com",
                password_hash=auth.hash_password("admin123"),
                role="ADMIN",
            )
            db.add(admin)
            db.commit()
            print("Default admin created: admin@ips.com / admin123")
    finally:
        db.close()


seed_admin()


def seed_construction_defaults_all():
    """Seed construction defaults for every existing project (idempotent)."""
    db = database.SessionLocal()
    try:
        for project in db.query(models.Project).all():
            sd.seed_construction_defaults_for_project(project.id, db)
    finally:
        db.close()


seed_construction_defaults_all()


def seed_risk_setup():
    db = database.SessionLocal()
    try:
        if db.query(models.RiskScoreSetup).count() > 0:
            return
        # Capex and Schedule impacts step linearly 0/25/50/75/100; probability
        # is left at the platform's stock progression.
        defaults = {
            1: (10.0,   0.0,   0.0),
            2: (30.0,  25.0,  25.0),
            3: (40.0,  50.0,  50.0),
            4: (50.0,  75.0,  75.0),
            5: (80.0, 100.0, 100.0),
        }
        for score, (prob, capex, sched) in defaults.items():
            db.add(models.RiskScoreSetup(
                score=score, probability_pct=prob,
                capex_impact_pct=capex, schedule_impact_pct=sched
            ))
        db.commit()
    finally:
        db.close()


seed_risk_setup()


def seed_risk_matrix():
    db = database.SessionLocal()
    try:
        if db.query(models.RiskMatrixCell).count() > 0:
            return
        for prob in range(1, 6):
            for impact in range(1, 6):
                product = prob * impact
                if product <= 6:
                    level = "LOW"
                elif product <= 14:
                    level = "MEDIUM"
                else:
                    level = "HIGH"
                db.add(models.RiskMatrixCell(prob_score=prob, impact_score=impact, level=level))
        db.commit()
    finally:
        db.close()


seed_risk_matrix()


def seed_procurement_defaults():
    """Seed procurement steps and contract types for any projects that don't have them yet."""
    db = database.SessionLocal()
    try:
        projects = db.query(models.Project).all()
        for p in projects:
            if db.query(models.ProcurementStep).filter_by(project_id=p.id).count() == 0:
                sd.seed_procurement_for_project(p.id, db)
    finally:
        db.close()


seed_procurement_defaults()


def seed_procurement_config_defaults():
    """Ensure every project has a ProcurementConfig row (for existing projects)."""
    db = database.SessionLocal()
    try:
        projects = db.query(models.Project).all()
        for p in projects:
            if not db.query(models.ProcurementConfig).filter_by(project_id=p.id).first():
                db.add(models.ProcurementConfig(project_id=p.id, sequence_validated=False))
        db.commit()
    finally:
        db.close()


seed_procurement_config_defaults()


def seed_itp_defaults():
    """Seed default ITP test types and witness levels for any project that lacks them."""
    db = database.SessionLocal()
    try:
        default_test_types = [
            "Dimensional Check",
            "Visual Inspection",
            "Hydrostatic Test",
            "Non-Destructive Examination (NDE)",
            "Material Traceability Review",
            "Factory Acceptance Test (FAT)",
            "Functional Test",
            "Weld Inspection",
            "Coating / Painting Inspection",
            "Documentation Review",
        ]
        default_witness_levels = [
            ("H", "Hold",        "Work cannot proceed without witness present"),
            ("W", "Witness",     "Witness required, work may proceed if notified and no-show"),
            ("R", "Review",      "Document review only, no physical presence required"),
            ("I", "Information", "For information only, no action required"),
        ]
        projects = db.query(models.Project).all()
        for p in projects:
            if db.query(models.ITPTestType).filter_by(project_id=p.id).count() == 0:
                for i, name in enumerate(default_test_types):
                    db.add(models.ITPTestType(project_id=p.id, name=name, sort_order=i))
            if db.query(models.ITPWitnessLevel).filter_by(project_id=p.id).count() == 0:
                for i, (code, name, desc) in enumerate(default_witness_levels):
                    db.add(models.ITPWitnessLevel(
                        project_id=p.id, code=code, name=name, description=desc, sort_order=i
                    ))
        db.commit()
    finally:
        db.close()


seed_itp_defaults()


def seed_obligation_time_defaults():
    """Seed default obligation times for any project that lacks them."""
    db = database.SessionLocal()
    try:
        defaults = [
            ("A", "Immediate Remediation"),
            ("B", "Before Delivery"),
            ("C", "Before Mechanical Completion"),
            ("D", "Before Cold Commissioning"),
            ("E", "Before Hot Commissioning"),
            ("F", "Before Provisional Acceptance"),
            ("G", "Before Final Acceptance"),
        ]
        projects = db.query(models.Project).all()
        for p in projects:
            if db.query(models.ObligationTime).filter_by(project_id=p.id).count() == 0:
                for i, (code, name) in enumerate(defaults):
                    db.add(models.ObligationTime(project_id=p.id, code=code, name=name, sort_order=i))
        db.commit()
    finally:
        db.close()


seed_obligation_time_defaults()


def seed_safety_setup_defaults():
    """Seed default severity classes and incident causes for any project that lacks them."""
    db = database.SessionLocal()
    try:
        projects = db.query(models.Project).all()
        for p in projects:
            sd.seed_safety_setup_defaults_for_project(p.id, db)
    finally:
        db.close()


seed_safety_setup_defaults()


# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="IPS Project Management Platform", version="2.0.0")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Always log the full traceback server-side. The client only sees the
    # exception text when IPS_DEBUG=1 (development). In production we
    # return a generic message so internal details never leak through the
    # API surface.
    _log.error(
        "Unhandled exception on %s %s\n%s",
        request.method, request.url.path, traceback.format_exc(),
    )
    if _IPS_DEBUG:
        return JSONResponse(status_code=500, content={"detail": str(exc)})
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Contact your administrator if the problem persists."},
    )


# CORS is opt-in via IPS_CORS_ORIGINS. The SPA + API ship from the same
# origin, so by default no CORS headers are added at all.
if _IPS_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_IPS_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth_router.router)
app.include_router(projects_router.router)
app.include_router(contacts.router)
app.include_router(packages.router)
app.include_router(meeting_types.router)
app.include_router(meetings.router)
app.include_router(meeting_points.router)
app.include_router(dashboard.router)
app.include_router(settings_router.router)
app.include_router(module_leads_router.router)
app.include_router(subservices_router.router)
app.include_router(budget_router.router)
app.include_router(risks_router.router)
app.include_router(scope_changes_router.router)
app.include_router(schedule_router.router)
app.include_router(procurement_router.router)
app.include_router(area_router)
app.include_router(unit_router)
app.include_router(floorplan_router)
app.include_router(documents_router.router)
app.include_router(attachments_router.router)
app.include_router(export_import_router.router)
app.include_router(qc_router.router)
app.include_router(meeting_export_router.router)
app.include_router(org_chart_router.router)
app.include_router(construction_router.router)
app.include_router(safety_router.router)
app.include_router(safety_export_router.export_router)
app.include_router(punch_export_router.export_router)
app.include_router(reports_router.router)
app.include_router(startup_tasks_router.router)
app.include_router(full_export_router.router)

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def serve_root():
    return FileResponse("static/index.html")


@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    if full_path.startswith("api/"):
        return {"detail": "Not Found"}
    return FileResponse("static/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
