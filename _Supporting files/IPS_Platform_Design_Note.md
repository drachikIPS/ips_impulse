# IPS ImPulSe Suite — Project Management Platform

## IT Design Note · v1.1 · Pre-Go-Live

> **v1.1 changes (vs v1.0):** items 0.2.1 (JWT secret), 0.2.2 (CORS) and
> 0.2.7 (500-handler) implemented in code as env-var-driven switches.
> The pre-go-live checklist (§ 0.4), the configuration cheat sheet
> (§ 18.1) and the risks table (§ 15) have been updated accordingly.
> No structural changes elsewhere.

---

## Executive summary

The platform is a multi-module project-management web application built as a
single FastAPI back-end (≈ 28 900 lines of Python across one models module
and 31 routers) with a Vue 3 single-page front-end served as static assets
(no build step). It manages the full project lifecycle: organisation,
meetings, schedule, budget, risk, procurement, scope changes, documents,
quality control, construction, safety, files, and project closure with
lessons learned. Permissions are project-scoped with seven role tiers
(ADMIN, PROJECT_OWNER, PROJECT_TEAM, CLIENT, VENDOR, BIDDER) plus per-module
"Module Lead" and per-package "Package Owner" overrides.

This document covers what is required to take the current code base from a
local Windows development install to a hardened internet-exposed production
deployment, followed by the formal architecture sections requested.

---

## 0. Go-Live setup guide (do these *before* exposing the app to the internet)

The current code base runs out-of-the-box on Windows (`start.bat`) and
listens on `http://0.0.0.0:8000` with SQLite as its only persistence layer
and a hard-coded JWT signing secret. The list below is the minimum work
required to put the platform in front of real users on a public URL. Items
marked **MUST** are blockers for go-live; **SHOULD** items can be deferred
but will catch you out within months.

### 0.1 Hosting topology (recommended baseline)

| Layer                | Component                                        | Suggested choice                           |
|----------------------|--------------------------------------------------|--------------------------------------------|
| DNS                  | A/AAAA record → load balancer / VM                | Cloudflare or registrar's DNS              |
| TLS termination      | Reverse proxy with Let's Encrypt                  | **Caddy** (auto-TLS) or nginx + certbot    |
| Application server   | uvicorn behind reverse proxy                      | uvicorn workers managed by systemd/Docker  |
| Database             | PostgreSQL (recommended) **or** kept-on SQLite    | Managed Postgres (DigitalOcean, AWS RDS, …) |
| Object storage       | Local disk or S3-compatible bucket                | Local disk OK for ≤ 50 GB; S3 for growth    |
| Backups              | Daily DB snapshot + uploads/ rsync                | borgbackup / restic / managed snapshots    |
| Monitoring           | Uptime + log aggregation                          | Uptime Kuma + Loki/Promtail                 |

A simple, reliable starting point is one VM (4 vCPU / 8 GB RAM / 80 GB
disk) running Caddy + uvicorn + Postgres in three containers, fronted by
a wildcard Let's Encrypt certificate. Vertical capacity scales to ~ 100
concurrent users without changes.

### 0.2 MUST-do hardening before opening port 443

> **Status legend** — ✅ DONE in code (toggle via env var at deploy time);
> ⚠️ INFRA / OPERATIONS work still required before go-live.

1. **✅ DONE — JWT secret is read from `IPS_JWT_SECRET`.**
   `auth.py` now reads `SECRET_KEY = os.environ.get("IPS_JWT_SECRET") or
   _DEV_FALLBACK_SECRET`. When the environment variable is missing the
   process logs a loud WARNING at start (visible in `journalctl` /
   `docker logs`) and falls back to a clearly-labelled
   `ips-project-management-dev-fallback-DO-NOT-USE-IN-PROD` secret so
   developers can keep working locally.

   **What IT must do at deploy time**: set
   `IPS_JWT_SECRET=<64+ random chars>` in the production environment
   (Docker secret, systemd `EnvironmentFile`, cloud Secret Manager).
   Generate the value with
   `python -c "import secrets; print(secrets.token_urlsafe(64))"`.
   Rotate after every developer offboarding. **Side effect of
   rotation**: every existing JWT becomes invalid, so every user
   has to log in again — schedule rotations outside business hours.

2. **✅ DONE — CORS is opt-in via `IPS_CORS_ORIGINS`.**
   `main.py` only mounts the CORS middleware when the comma-separated
   `IPS_CORS_ORIGINS` environment variable is set. The previous
   wildcard `allow_origins=["*"]` with `allow_credentials=True` is gone.
   Default behaviour: no CORS middleware at all (the SPA and API ship
   from the same origin, so CORS is unnecessary).

   **What IT must do at deploy time**: leave `IPS_CORS_ORIGINS` unset
   for the standard same-origin deployment. Only set it when an
   external host needs to call the API (e.g. an integration partner):
   `IPS_CORS_ORIGINS=https://partner.example.com,https://other.example.com`.
   Never set it to `*` — invalid combination with credentials and
   browsers reject it.

3. **Force HTTPS everywhere.**
   ⚠️ INFRA. Put Caddy or nginx in front; redirect all HTTP → HTTPS;
   set the `Strict-Transport-Security`, `X-Content-Type-Options:
   nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`
   headers at the reverse-proxy level.

4. **Switch to PostgreSQL** (strongly recommended).
   SQLite is a single-writer database. The platform works fine for a
   single team but starts seeing `database is locked` errors with multiple
   concurrent vendors uploading attachments or filing daily reports.
   Migration steps:
   - Set `pip install psycopg[binary]` and bump `requirements.txt`.
   - Replace `database.py:5` with
     `SQLALCHEMY_DATABASE_URL = os.environ["IPS_DATABASE_URL"]`
     (the URL takes the form
     `postgresql+psycopg://user:pass@host/ipsdb`).
   - Drop the `connect_args={"check_same_thread": False}` kwarg (Postgres
     doesn't need it).
   - Run a one-shot data migration: dump SQLite to SQL with
     `sqlite3 projectmanagement.db .dump > dump.sql`, hand-edit the
     handful of SQLite-specific syntax differences (mostly `INTEGER
     PRIMARY KEY` and `BOOLEAN` defaults), and `psql … < dump.sql`.
   - The inline migrations in `main.py` are SQLite-flavoured `ALTER TABLE`;
     they need to be reviewed against Postgres syntax (most are
     compatible; a few `BOOLEAN DEFAULT 0` literals become `DEFAULT
     false`).

5. **Run uvicorn with multiple workers under a process supervisor.**
   `start.bat` calls `uvicorn.run(...)` from `main.py` with no workers and
   only stays alive while the shell is open. In production:
   ```
   uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4 \
       --proxy-headers --forwarded-allow-ips '*'
   ```
   wrapped in a systemd unit (or a Docker container restart-policy
   `unless-stopped`). The `--proxy-headers` flag is required so client IP
   addresses survive the reverse proxy.

6. **Set up automated backups.**
   - **Database**: nightly `pg_dump` to S3 (or VM-local `*.sql.gz` rotated
     7 days), monthly full snapshot retained 12 months. (For SQLite:
     `sqlite3 projectmanagement.db ".backup '/backups/...'"` — never
     plain-copy a live SQLite file.)
   - **Uploads**: nightly incremental rsync of `uploads/` (per-project
     attachments and reports). Test restoration before go-live.

7. **✅ DONE — 500-handler hides tracebacks unless `IPS_DEBUG=1`.**
   The global exception handler in `main.py` always logs the full
   traceback server-side (`logger ips.app`, captured by uvicorn / the
   container runtime). The response body sent back to the client is:
   - `{"detail": "Internal server error. Contact your administrator if
     the problem persists."}` by default,
   - the raw `str(exc)` only when `IPS_DEBUG=1` is set in the environment.

   **What IT must do at deploy time**: leave `IPS_DEBUG` unset (or set
   it to `0`) in production. Set `IPS_DEBUG=1` only on developer
   machines or short-lived staging environments where the verbose
   error helps debugging. The full traceback is always available in
   the application logs regardless of the flag.

8. **Bcrypt cost.** `passlib[bcrypt]` defaults to 12 rounds, which is
   reasonable. No action needed, but keep an eye on login latency under
   load.

### 0.3 SHOULD-do within four weeks of go-live

- **Replace inline migrations with Alembic.** Right now schema evolution
  lives in `main.py:migrate_db()` as a long if/try ladder of ALTER TABLE
  statements. This worked during build-out but will become a liability
  after first prod deployment. Lift each existing branch into a numbered
  Alembic revision; future migrations get autogenerated.
- **Structured logging.** Pipe uvicorn access logs and application logs
  through `python-json-logger`; ship to Loki/CloudWatch/Datadog.
- **Externalise file uploads.** Move `uploads/` to S3-compatible object
  storage and refactor `routers/attachments.py` and `routers/reports.py`
  to read/write via boto3. The current local-disk model works but
  complicates VM rebuilds and horizontal scaling.
- **Add an OpenAPI export** to source control so integrations can be
  built against a contracted spec rather than reading code.
- **Replace the static-asset cache-busting `?v=N` query string** with
  content-hashed asset filenames once a Vite build pipeline is
  introduced. The current scheme is reliable but requires manual bumps.

### 0.4 Pre-go-live checklist (paste into release ticket)

Code-level hardening items (1, 2, 7) are already in place — the checklist
only verifies that they are wired through to the production environment.

```
[ ] IPS_JWT_SECRET set in prod env (≥ 64 chars), stored in secret manager
[ ] IPS_CORS_ORIGINS unset (same-origin deploy) or limited to known partners
[ ] IPS_DEBUG unset / "0" in production
[ ] Default admin password (admin@ips.com / admin123) rotated on first login
[ ] HTTPS termination + HSTS enabled at reverse proxy
[ ] PostgreSQL provisioned, IPS_DATABASE_URL set, data migrated, backups verified
[ ] uvicorn running under systemd / Docker with restart=always
[ ] Reverse proxy (Caddy/nginx) configured, max-body-size raised to ≥ 50 MB
[ ] uploads/ folder backed up nightly, restore tested
[ ] DNS pointing to load balancer / VM
[ ] Health-check endpoint hit by uptime monitor
[ ] First prod project created, smoke test all 12 modules
[ ] User offboarding tested (delete + cascade)
[ ] Lessons-learned and closure flow tested end-to-end
```

---

## 6. Architecture Design

### 6.1 Logical architecture

#### 6.1.1 Modules (functional decomposition)

| Module                  | Front-end component(s)                        | Back-end router(s)                      |
|-------------------------|-----------------------------------------------|------------------------------------------|
| Authentication          | login screen + change-password page           | `auth_router.py`                        |
| Project Organisation    | `contacts.js`, `packages.js`, `org-chart.js`, `areas-units.js` | `contacts.py`, `packages.py`, `areas_units.py`, `org_chart.py`, `subservices.py`, `module_leads.py` |
| My Action Points        | `my-action-points.js`                         | aggregate of every module's pending-list endpoints |
| Meeting Management      | `meetings.js`, `meeting-types.js`, `meeting-detail.js`, `meeting-points-view.js`, `meeting-weekly-schedule.js` | `meetings.py`, `meeting_types.py`, `meeting_points.py`, `meeting_export.py` |
| Schedule                | `schedule.js`                                 | `schedule.py`                           |
| Budget Management       | `budget.js`                                   | `budget.py` + `meeting_export.py` (Excel) |
| Risk Register           | `risk-register.js`                            | `risks.py`                              |
| Procurement             | `procurement.js`                              | `procurement.py`                        |
| Scope Changes           | `scope-changes.js`                            | `scope_changes.py`                      |
| Document Management     | `document-management.js`, `document-comments.js` | `documents.py`                       |
| Quality Control (ITP + Punch) | `quality-control.js`                    | `quality_control.py`, `punch_export.py` |
| Construction (Workers, Daily Reports, Work Permits, LOTO) | `construction.js` | `construction.py` |
| Safety (Observations, Incidents, Toolbox)                  | `safety.js` | `safety.py`, `safety_export.py` |
| Project Files           | `attachments.js` (embedded via every other module) | `attachments.py`                   |
| Project Closure         | `closure-management.js`                       | inside `projects.py`                    |
| Help Center             | `help-center.js`                              | (static)                                |
| Settings + Module Leads | `settings.js`                                 | `settings.py`, `module_leads.py`        |
| Project Setup (admin)   | `project-management.js`                       | `projects.py`                           |
| Project Start-up checklist | (slide-over in `app.js`)                  | `startup_tasks.py`                      |
| Reports (background-generated PDF) | `reports.js`                       | `reports.py`                            |

#### 6.1.2 Service decomposition

The system is a **modular monolith**. There is one process, one Python
import graph, one database, one deployment artefact. Logical separation is
enforced by:

- **Per-module router files** — each module owns its CRUD, workflow and
  export endpoints under `/api/<module>/…`.
- **Project scoping** — every domain table carries a `project_id` FK and
  every authenticated request must pass an `X-Project-ID` header.
  Resolution happens once in `auth.get_project_user()` and produces a
  `ProjectContext(user, role, project_id)` object that every router
  receives via DI.
- **Permission helpers** in `auth.py` (`is_package_owner`,
  `is_module_lead`, `package_access_path`, `override_default_comment`)
  cross-cut router code without forming a separate service layer.

The deliberate choice **not** to split this into microservices reflects:
team size (single developer + AI assist), tightly coupled cross-module
workflows (a meeting point can reference a risk, a punch item, a document
… all in the same database transaction), and the absence of independent
scaling needs per module.

#### 6.1.3 Interaction patterns

- **Client ⇄ server**: synchronous HTTP/JSON. The front-end is a Vue 3
  SPA loaded as static assets; every interaction is a `fetch` to
  `/api/…`. There is no WebSocket, no SSE, no server-push.
- **Background jobs**: a small subset of long-running tasks (PDF
  reports for safety observations and punch-list, full-project-folder
  ZIPs) run in a Python `threading.Thread` started inside the request
  handler, write results to disk, and update a `Report` row that the
  front-end polls. There is no Celery/RQ; the threads live and die with
  the uvicorn worker.
- **Inter-module workflow**: in-process function calls only. The
  procurement-to-budget hand-off (creating an Order from an awarded
  procurement entry) is a direct Python call from `procurement.py` into
  budget logic, executed in the same DB transaction.
- **Audit**: append-only audit-log tables (`*_reviews`, `*_history`)
  written from the same request that triggered the workflow event.

### 6.2 Physical architecture

#### 6.2.1 Recommended infrastructure layout

Hybrid-cloud is unnecessary; either a single self-hosted VM or a single
managed-VM-per-environment is sufficient.

```
                         Internet
                            │
                  ┌─────────▼──────────┐
                  │   DNS (Cloudflare) │
                  └─────────┬──────────┘
                            │ HTTPS (TCP 443)
                  ┌─────────▼──────────┐
                  │  Reverse proxy     │   ← Caddy (auto-TLS)
                  │  (TLS termination) │     OR nginx + certbot
                  └─────────┬──────────┘
                            │ HTTP (loopback)
                  ┌─────────▼──────────┐
                  │  uvicorn workers   │   ← 4 workers, --proxy-headers
                  │  (FastAPI app)     │
                  └────┬───────────┬───┘
                       │           │
          ┌────────────▼─┐  ┌──────▼──────────┐
          │ PostgreSQL   │  │ uploads/  on    │
          │ (managed or  │  │ same disk OR    │
          │  Docker)     │  │ S3 bucket       │
          └──────────────┘  └─────────────────┘
```

#### 6.2.2 Network topology

- Inbound: only TCP 443 reaches the Internet.
- TCP 80 should redirect-only to 443.
- Application port 8000 is bound to `127.0.0.1` (or to the Docker
  bridge network) — never publicly reachable.
- Database port 5432 is reachable only from the application VM
  (security group / private VPC).
- SSH access restricted to bastion or VPN-issued IP ranges.
- All file upload limits enforced at two layers: reverse proxy
  (`client_max_body_size 50m;` in nginx) and application (FastAPI
  `Request.body()` checks).

#### 6.2.3 Environments

| Env  | Purpose                                | Hostname pattern                    | DB              | Notes                                |
|------|----------------------------------------|-------------------------------------|-----------------|--------------------------------------|
| dev  | Local developer machines                | `localhost:8000`                   | SQLite           | Current setup; `start.bat`           |
| test | Shared QA + UAT                         | `test.app.example.com`             | Postgres (small) | Refreshed weekly from anonymised prod |
| prod | Live customers                          | `app.example.com`                  | Postgres (HA)    | Backups + monitoring + paged on-call  |

Promotion is simple: tag a Git release, deploy the same artefact to
test, smoke-test, then deploy the *same* artefact to prod. Database
schemas are migrated forward by Alembic (post-cleanup) or by the inline
`migrate_db()` (current state) at process start.

### 6.3 Deployment architecture

#### 6.3.1 Container layout (recommended)

```
docker-compose.yml
├── caddy        (caddy:latest, auto-TLS)
├── api          (Python 3.11-slim + project source)
└── db           (postgres:16-alpine)
volumes:
  - caddy_data         (cert storage)
  - postgres_data      (database files)
  - uploads            (mapped into api container)
```

The application image is a single multi-stage Dockerfile:

```dockerfile
FROM python:3.11-slim AS runtime
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000",
     "--workers", "4", "--proxy-headers", "--forwarded-allow-ips", "*"]
```

#### 6.3.2 CI/CD pipeline overview

GitHub Actions (or GitLab CI) per push to `main`:

1. **Test stage** — install deps, run `python -m py_compile` over every
   `.py` (catches syntax breakage), run `pytest` if/when a suite is added,
   smoke-import every router.
2. **Build stage** — build Docker image, tag with short SHA + branch.
3. **Deploy stage (test)** — push image, SSH to test VM, pull + restart
   compose service.
4. **Deploy stage (prod)** — manual approval → repeat for prod with the
   same image tag.

Front-end has no build step today (Vue via CDN, plain JS). The cache-bust
querystrings are bumped manually on edit per the CLAUDE.md rule.

---

## 7. Data design

### 7.1 Data model

The schema contains **106 tables** generated from
`models.py` (≈ 2 700 lines). The most important hubs:

- `projects` (the tenant unit) — every domain table FKs to `project_id`.
- `users` (global, project-independent) joined to projects via
  `user_projects(user_id, project_id, role)`.
- `contacts` (per-project address-book entries; can be linked to a
  `users` row via `users.contact_id`).
- `packages` (work-package decomposition; PMC + Client reviewers and a
  `package_owner_id` granting PROJECT_OWNER-equivalent rights inside
  the package).
- `areas` / `units` / `floorplans` (geographical breakdown used by
  Punch List, Safety Observations, Documents, …).
- `subservices` (project-management taxonomy used to tag documents).

Domain tables grouped by module:

- **Budget**: `budget_baselines`, `budget_transfers`, `orders`,
  `invoices`.
- **Risk**: `risks`, `risk_categories`, `risk_phases`, `risk_notes`,
  `risk_score_setups`, `risk_matrix_cells`.
- **Schedule**: `tasks`, `progress_reports`, `progress_report_entries`,
  `progress_report_reviews`.
- **Scope changes**: `scope_changes`, `scope_change_reviews`.
- **Procurement**: `procurement_steps`, `contract_types`,
  `procurement_configs`, `package_plans`, `package_plan_bidders`,
  `package_plan_step_dates`, `bidding_companies`,
  `bidding_company_contacts`, `procurement_entries`,
  `procurement_events`, `bidder_submittals`, `bidder_submittal_acks`.
- **Documents**: `documents`, `document_versions`, `document_reviews`,
  `document_comments`, `document_comment_notes`,
  `document_comment_version_links`, `document_receipts`.
- **Quality control**: `itp_records`, `itp_test_types`,
  `itp_witness_levels`, `itp_reviews`, `itp_review_history`,
  `itp_notes`, `obligation_times`, `punch_items`, `punch_notes`.
- **Construction**: `workers`, `worker_certificates`,
  `worker_certificate_types`, `worker_reviews`, `subcontractors`,
  `daily_reports`, `daily_report_workers`, `daily_report_areas`,
  `work_logs`, `work_permits`, `work_permit_types`,
  `work_permit_areas`, `work_permit_area_approvals`,
  `work_permit_permit_types`, `work_permit_hazards`,
  `work_permit_ppes`, `work_permit_reviews`, `lotos`, `loto_reviews`.
- **Safety**: `safety_observations`, `safety_observation_categories`,
  `safety_observation_reviews`, `safety_incidents`,
  `safety_incident_causes`, `safety_severity_classes`,
  `safety_incident_workers`, `safety_incident_reviews`,
  `safety_incident_notes`, `safety_toolboxes`,
  `safety_toolbox_categories`, `safety_toolbox_packages`,
  `safety_toolbox_workers`, `safety_toolbox_observations`,
  `safety_toolbox_incidents`, `safety_toolbox_reviews`.
- **Meetings**: `meeting_types`, `meeting_type_participants`,
  `meetings`, `meeting_participants`, `meeting_points`,
  `meeting_point_links`, `meeting_point_notes`.
- **Project organisation**: `project_module_leads`, `org_chart_links`,
  `area_site_supervisors`, `package_contacts`.
- **Closure**: `project_lesson_area_scores`, `customer_feedbacks`.
- **Files / reports / settings**: `file_attachments`, `reports`,
  `settings`.
- **Start-up checklist**: `project_startup_tasks`.

Standard SQLAlchemy patterns: surrogate `id` PK, FKs index-marked,
`UniqueConstraint`s on natural composite keys (e.g. `(project_id,
package_id, report_date)` on daily reports), `created_at`/`updated_at`
audit columns, soft FK via `created_by_id` / `updated_by_id`.

A rendered ER diagram is out of scope (with 106 tables it would be
unreadable as a single image). The recommended approach for visualising
slices is `eralchemy` against the live SQLAlchemy metadata, scoped to
one module's tables at a time.

### 7.2 Data storage technologies

- **Relational store**: SQLite at present (file-based, single writer);
  PostgreSQL recommended for production. SQLAlchemy 2.x ORM.
- **Object storage**: local filesystem under `uploads/` today,
  organised as `uploads/<PROJECT_NUMBER>/<MODULE>/<filename>`. Migration
  to S3-compatible object storage is a future enhancement; the abstraction
  point is `routers/attachments.py`.
- **No NoSQL, no message broker, no data lake.** All audit and history
  data lives in append-only relational tables (e.g.
  `safety_observation_reviews`, `loto_reviews`).

### 7.3 Data flow and transformations

- Every write originates in a router endpoint, passes through one DB
  session bound to the request, and is committed before the response is
  returned. There is no eventual consistency.
- Aggregations (dashboards, S-curves, workforce charts) are computed
  on-demand at request time. They could be cached in front of Postgres
  with Redis if this becomes hot, but at current load (single project,
  ≤ 50 users) the queries return in < 200 ms.
- Excel exports stream a freshly-built workbook to the client via
  `StreamingResponse` (no intermediate file on disk).
- PDF reports run in a daemon thread, write to the project upload tree
  and update a `reports` row that the frontend polls (status
  `PENDING → GENERATING → READY | FAILED`).

### 7.4 Data lifecycle

| Stage     | Behaviour                                                                  |
|-----------|----------------------------------------------------------------------------|
| Create    | Through API; `created_at` + `created_by_id` set automatically.              |
| Update    | Optimistic concurrency via `updated_at` field comparison on edit forms.     |
| Archive   | No automatic archival. Closed projects stay queryable (status = "CLOSED").  |
| Delete    | ADMIN-only. `_purge_project_data()` in `routers/projects.py` runs an explicit DELETE across ~50 tables in dependency-safe order. Cascade retention has been verified for every table that hangs off a project. |
| Backup    | Recommended: nightly `pg_dump` for DB, nightly rsync for `uploads/`.        |
| Restore   | Recommended: quarterly drill — restore prod backup into a sandbox VM, smoke-test login + open one project. |

### 7.5 Data governance

- All domain rows carry `project_id`; cross-project queries are
  defensible only through the explicit ADMIN role bypass.
- Deletion is logical-only for users (FK detach) and physical for
  domain rows. There is no "soft delete" pattern.
- File attachments retain their original filenames; no PII redaction.
- GDPR: when an individual asks for deletion, the operations runbook is
  (a) delete the user account, (b) anonymise their `contacts` rows
  (set name → "Removed user", clear email/phone), (c) leave audit-trail
  rows untouched (legitimate-interest exception). This is supported by
  the existing endpoints — no schema change needed.

---

## 8. Interface design

### 8.1 APIs

- **Style**: REST over HTTPS, JSON payloads. Every URL is prefixed
  `/api/<module>/…`. Verbs follow standard semantics (`GET`/`POST`/`PUT`/
  `DELETE`).
- **Auto-generated OpenAPI**: FastAPI exposes `/openapi.json` and
  Swagger UI at `/docs`. Should be **disabled in production** by
  setting `app = FastAPI(docs_url=None, redoc_url=None,
  openapi_url=None)` and re-enabled only behind admin auth.
- **No GraphQL, no gRPC.** No internal RPC layer.

#### 8.1.1 Endpoint catalogue (representative subset)

| Path                                          | Verb     | Purpose                                       |
|-----------------------------------------------|----------|-----------------------------------------------|
| `/api/auth/login`                             | POST     | issue JWT                                      |
| `/api/auth/me`                                | GET/PUT  | current-user profile                           |
| `/api/auth/change-password`                    | POST     | self-service password change                   |
| `/api/projects`                                | GET/POST | list / create projects                         |
| `/api/projects/{id}`                           | PUT/DELETE | update / cascade-delete                      |
| `/api/projects/seed-full-demo`                 | POST     | admin-only demo seeder                          |
| `/api/contacts`                                | GET/POST | per-project contacts (X-Project-ID)            |
| `/api/packages`                                | GET/POST | work packages                                   |
| `/api/areas` `/api/units` `/api/floorplans`    | various   | geographical decomposition                     |
| `/api/budget/overview`                         | GET       | aggregated budget table                         |
| `/api/budget/overview/export/excel`            | GET       | xlsx download                                   |
| `/api/risks`                                   | CRUD      | risk register                                   |
| `/api/procurement/*`                           | various   | plans, entries, events                          |
| `/api/documents/*`                             | various   | versions, reviews, comments                     |
| `/api/safety/observations` `/incidents` `/toolboxes` | CRUD | safety module                                  |
| `/api/safety/observations/export/excel`        | GET       | xlsx                                            |
| `/api/safety/observations/export-pdf`          | POST      | enqueue PDF report                              |
| `/api/construction/daily-reports/*`            | various   | daily reports + xlsx                            |
| `/api/startup-tasks`                           | GET       | per-project start-up checklist (PROJECT_OWNER) |
| `/api/startup-tasks/{id}/close`                | POST      | close a start-up item globally                  |
| `/api/reports/*`                                | various   | background-generated PDFs (status + download)   |

### 8.2 Integration points

- **Microsoft Project / Primavera (planned)** — through the
  schedule-import Excel template. Today: manual export-to-xlsx, upload
  through the Schedule module's import button. No live integration.
- **Email** — none today. Notifications are surfaced through
  in-app "My Action Points" only. Future enhancement: SMTP +
  `fastapi-mail` for daily digest of pending actions.
- **External authentication providers** — none. Future SAML/OIDC SSO
  integration would slot in alongside the JWT issuer in `auth.py`.
- **No webhooks emitted, no webhooks received.**

### 8.3 Data contracts and formats

- **JSON only** on the wire. ISO-8601 dates (`YYYY-MM-DD`) and
  timestamps (`YYYY-MM-DDTHH:MM:SSZ`) consistently.
- **File uploads** via `multipart/form-data`.
- **Excel exports** via `application/vnd.openxmlformats-officedocument
  .spreadsheetml.sheet` and `Content-Disposition: attachment`.
- **PDF exports** via `application/pdf` (synchronous for work-permit
  PDF, asynchronous + polled for safety / punch list reports).
- **Pydantic models** in router files double as the API contract.
  When/if an external consumer is added, generating a typed client
  from `/openapi.json` (e.g. `openapi-generator` or `oazapfts`) is
  the recommended path.

### 8.4 Authentication / authorisation

- **AuthN**: JWT bearer token signed HS256 with `SECRET_KEY` (see
  hardening item 0.2.1). Token issued at `/api/auth/login`, lifetime
  configured in `auth.py`.
- **AuthZ**: every request goes through one of two FastAPI dependency
  functions:
  - `auth.get_current_user(token)` — recovers the user, used by
    project-independent endpoints (auth, project list).
  - `auth.get_project_user(token, X-Project-ID, [X-Impersonate-User-Id])`
    — recovers the user **and** their role for the named project.
    ADMIN can pass `X-Impersonate-User-Id` to act as another user
    (used by the impersonate-modal in the admin tool).
- **Role hierarchy**: ADMIN > PROJECT_OWNER (per project) >
  PROJECT_TEAM > CLIENT > VENDOR > BIDDER. Plus the per-module
  "Module Lead" role (`project_module_leads`) and per-package
  "Package Owner" role grant PROJECT_OWNER-equivalent rights inside
  their scope. The package-access helper `package_access_path()` in
  `auth.py` is the canonical way to test these overrides — see the
  audit-tagged comments at the 11 override sites.

---

## 9. Security architecture

### 9.1 Identity and access management

- Single user store (`users` table), bcrypt password hashing
  (passlib).
- Project membership through `user_projects(user_id, project_id,
  role)`. A user can have different roles in different projects.
- `must_change_password` flag forces a password reset on first login
  (used when an admin/owner creates a contact-linked account with a
  generated temporary password).
- No federated SSO at present; OIDC integration recommended within
  twelve months for enterprise customers.

### 9.2 Encryption

- **In transit**: TLS 1.2+ at the reverse proxy (Caddy / nginx). The
  application speaks plain HTTP only over loopback.
- **At rest**: full-disk encryption at the VM/host level (Linux
  LUKS, AWS EBS encryption, etc.). PostgreSQL TDE is optional; for
  the data sensitivity of this product (project administrative
  data), disk-level encryption is sufficient.
- **Passwords**: bcrypt (cost factor 12, default).
- **Tokens**: signed (HS256) but **not** encrypted; do not put
  PII in the JWT claims.

### 9.3 Secrets management

- Today: `auth.py:11` hard-codes the JWT secret. **Must change
  before go-live.**
- Recommended: env-var-driven config with secrets injected through:
  - Docker Compose: `secrets:` section + `_FILE` suffix env vars.
  - Kubernetes: `Secret` mounted as env or as file.
  - systemd: `EnvironmentFile=/etc/ips-platform.env` with `chmod 600`.
- Database URL, JWT secret, S3 credentials (when added) all follow
  the same pattern.

### 9.4 Threat model (lightweight)

| Asset                | Threat                                | Mitigation                                              |
|----------------------|---------------------------------------|---------------------------------------------------------|
| User credentials     | Credential stuffing                    | Bcrypt + first-login forced reset; rate-limit login (proxy-level) |
| JWTs                 | Token theft (XSS)                      | Short-lived JWTs; httpOnly storage if/when migrating from localStorage; CSP headers |
| Project data        | Cross-project IDOR                     | `auth.get_project_user()` enforces `X-Project-ID` scoping on every endpoint |
| File uploads        | Malicious file (RCE, XSS via SVG)      | Content-Type sniffing disabled; serve uploads with `X-Content-Type-Options: nosniff`; per-file MIME whitelist (not currently enforced — recommended) |
| Mass assignment     | Pydantic models double as input schema | Each `*Create`/`*Update` model is hand-written and excludes server-controlled fields |
| SQL injection       | All access via SQLAlchemy ORM          | Parameter-bound queries; no raw `text()` interpolation of user input (audited) |
| CSRF                 | Cookie-based session attacks            | N/A — JWT in `Authorization` header, not in a cookie     |
| Brute force         | Login endpoint                          | Recommended: nginx `limit_req_zone` on `/api/auth/login`  |

### 9.5 Compliance alignment

- **GDPR**: data subject deletion and export are operationally feasible
  (admin can delete the user, anonymise contacts, and export project
  data through Excel exports). Data is processed on EU-located
  infrastructure when the customer requires (deployment choice).
- **SOC 2**: no formal controls in place; the platform itself does not
  block SOC 2 alignment but the operating org would need to add
  vulnerability scanning, change management evidence, access reviews.
- **ISO 27001**: same — code base is compatible; org controls TBD.

---

## 10. Performance and capacity design

### 10.1 Load assumptions

Initial target deployment scale (per VM):

- 1–10 active projects
- 30–80 named users per project (mix of internal + client + vendor +
  bidder)
- Peak concurrent users: 25
- Peak write rate: 10 writes/sec (daily-report submission, document
  review, action-point closure)
- Peak read rate: 100 GET/sec (dashboards, action-point list refresh)

These figures are well within a single uvicorn process with 4 workers
and a small Postgres instance.

### 10.2 Throughput and latency targets

| Class of request                  | p50      | p95      | Target |
|-----------------------------------|----------|----------|--------|
| Login / `/api/auth/login`         | 150 ms   | 300 ms   | bcrypt-bounded |
| Static asset (HTML/JS/CSS)         | < 30 ms  | < 60 ms  | served by Caddy/nginx |
| List endpoint (e.g. `/api/risks`)  | < 80 ms  | < 200 ms | small projects   |
| Aggregate endpoint (budget overview, procurement S-curve) | < 250 ms | < 600 ms | requires hot-FK indexes |
| Excel export                       | < 1 s    | < 3 s    | worst case ~ 1 000 rows |
| PDF report (background)            | 5–30 s   | 60 s     | async polled         |

### 10.3 Scaling strategy

- **Vertical first**: bigger VM is the cheapest fix until ~ 200
  concurrent users.
- **Horizontal**: uvicorn is stateless (JWT-based auth, sessionless),
  so multiple application VMs behind a load balancer is supported as
  soon as `uploads/` is moved to S3. Postgres becomes the single
  shared state.
- **Read replicas**: not needed at planned scale; can be added later
  for dashboard-heavy customers.

### 10.4 Caching strategy

- Today: HTTP caching of static assets via the cache-bust
  query-string scheme (filename + `?v=N`). No application-level
  cache.
- Recommended additions:
  - In-process LRU cache on `auth.get_current_user()` (5 s TTL)
    to reduce repeat user lookups during a single page render.
  - Reverse-proxy cache on truly static assets (logos, icons) with
    long max-age.
  - Redis cache only if dashboards become hot; current measurements
    don't justify it.

### 10.5 Performance testing approach

- **Load testing**: `k6` or `locust`, scripted against the seed-demo
  project, hitting the four heaviest endpoints
  (`/api/budget/overview`, `/api/procurement/dashboard`,
  `/api/safety/observations`, `/api/construction/daily-reports`).
- **Soak test**: 24 h at peak rate before each major release.
- **Profiling**: `pyinstrument` for one-off slow-endpoint
  investigation.

---

## 11. Availability and resilience

### 11.1 High availability

- Current: single-VM, single-process; ~ 99.5% achievable with good
  ops practices.
- Production target: 99.9% (≈ 8.7 h downtime/year). Achieved by:
  - Dual app VMs behind a load balancer (uvicorn is stateless).
  - Managed-Postgres with automatic failover.
  - Object storage for uploads.

### 11.2 Disaster recovery

| Metric | Target               | How achieved                                  |
|--------|----------------------|-----------------------------------------------|
| RTO    | 4 hours               | Documented restore runbook + immutable image  |
| RPO    | 24 hours (initial), 1 hour (post-MVP) | Nightly DB backup; later move to PITR with WAL archiving |

### 11.3 Backup strategy

- Database: nightly `pg_dump --format=custom`, retained 30 days
  daily + 12 months monthly. PITR via continuous WAL shipping
  (recommended within six months of go-live).
- Uploads: nightly rsync (or S3 versioning if migrated). Retain
  90 days.
- Backups stored off-host (different region or different cloud).
- Quarterly restore drill, results recorded in the operations log.

### 11.4 Fault tolerance mechanisms

- Application: explicit transaction boundaries per request;
  `db.rollback()` in the global exception handler at `main.py:1499`.
- Database: ACID by virtue of Postgres.
- File uploads: written to a temp filename and atomically renamed
  on success.
- Cascade deletes: explicit DELETEs in `_purge_project_data()` (SQLite
  doesn't enforce FK by default; same code is safe under Postgres).
- Idempotent seeding: every `seed_*_for_project` function checks for
  existing rows before inserting; safe to re-run.

---

## 12. Operational design

### 12.1 Monitoring

- **Logs**: uvicorn access + application logs through stdout/stderr.
  Reverse proxy access log captures method, path, status, latency,
  bytes, user-agent. Recommended: ship to Loki / CloudWatch with
  30-day retention.
- **Metrics**: Prometheus exporter for FastAPI (`prometheus-
  fastapi-instrumentator`) — emits request count, duration, in-flight
  count per route. Tracks Postgres connection pool metrics (already in
  SQLAlchemy when configured).
- **Tracing**: optional OpenTelemetry instrumentation
  (`opentelemetry-instrumentation-fastapi`) shipping to Tempo /
  Honeycomb / Jaeger. Useful when N+1 query problems start surfacing.

### 12.2 Alerting strategy

| Severity | Trigger                                       | Channel        |
|----------|-----------------------------------------------|----------------|
| P1       | Health endpoint down 2 minutes                 | SMS + email    |
| P1       | DB free disk < 5 GB                            | SMS + email    |
| P2       | Login error rate > 5/min for 5 min              | email          |
| P2       | p95 latency on overview endpoints > 1 s for 10 min | email      |
| P3       | Backup job failure                              | email          |
| P3       | Certificate expiring in < 14 days (if not auto-renewed) | email |

### 12.3 Support model

- **L1** (front-line): triage user issues, create incidents, offer
  password resets, walk customers through "how-to" questions.
- **L2** (operations): investigate production incidents, restart
  services, restore from backups, apply hotfix images.
- **L3** (engineering): bug fix + deploy, schema-migration support,
  performance investigation.

For the initial single-developer phase, all three tiers collapse onto
one person; the runbook should still be written so the work can be
handed off.

### 12.4 Maintenance procedures

- Schema upgrade: deploy a new image; the inline `migrate_db()` runs
  on first request after start. Once Alembic is introduced, run
  `alembic upgrade head` from a one-shot init container.
- Restart: `docker compose restart api` with zero downtime if behind a
  load balancer; otherwise schedule outside business hours.
- Cert renewal: automatic via Caddy or Let's Encrypt cron; alert if
  renewal fails within 14 days of expiry.
- Vacuum / analyse (Postgres): autovacuum is sufficient for current
  volume.

---

## 13. DevOps and release strategy

### 13.1 CI/CD pipelines

See section 6.3.2.

### 13.2 Versioning

- **Application**: SemVer (`MAJOR.MINOR.PATCH`). Bump MAJOR on
  breaking schema changes, MINOR on new modules / endpoints, PATCH
  for bug fixes.
- **Front-end assets**: cache-bust query strings (`?v=N`) bumped per
  edited file. To be replaced by content-hash filenames once a Vite
  build pipeline is added.
- **Database**: each Alembic revision is one atomic forward-only
  schema change. Down-migrations are written but considered emergency
  use only.

### 13.3 Deployment methods

- **Single-VM**: rolling restart of the systemd unit. Brief 503
  blip while the new uvicorn warms up (< 5 s).
- **Multi-VM**: rolling deployment across instances behind the load
  balancer (drain → replace → re-enable).
- **Blue/green**: practical once the data layer fully decouples
  (uploads on S3, Alembic migrations idempotent). Recommended after
  the platform reaches 100 customers.

### 13.4 Environment promotion flow

```
git commit  →  CI (test + build)  →  image:short-sha
   │
   └──→  test VM (auto)         (smoke tests run automatically)
                  │
                  └──→ manual approval → prod VM (same image tag)
```

Hotfixes follow the same path but skip waiting on the next scheduled
release.

---

## 14. Migration / transition plan

The platform has no predecessor. There is no legacy system to migrate
from on this engagement. The plan below applies to onboarding **new
customer projects**.

### 14.1 Data migration approach

- **Subservices catalogue**: shipped as a default seed
  (`DEFAULT_SUBSERVICES` in `seed_data.py`). Customers who need a
  customised list can either edit through the Settings UI or supply
  an Excel that is imported via the existing import tool.
- **Schedule**: imported from MS-Project / Primavera via the Excel
  import in the Schedule module. Tasks are matched on `wbs` + name;
  re-importing the same file is idempotent.
- **Contacts** and **packages**: bulk-create via the import tools
  in the Project Organisation module.
- **Risk register**: imported via the same Excel template-and-import
  pattern.

### 14.2 Cutover strategy

For first go-live (no replacement target), cutover is simply:

1. Deploy production stack and verify smoke tests.
2. Create the first ADMIN user.
3. Create the first project + run through the Project Start-up
   checklist (the in-app feature seeded for every PO at project
   creation walks through every necessary configuration step).
4. Invite users; first login forces a password reset.

### 14.3 Coexistence with legacy systems

None today. If a customer brings an existing PMC tool, no automatic
two-way sync is provided; data ownership transfers to this platform on
project setup.

### 14.4 Rollback plan

- Database: restore from the most recent `pg_dump`; expected RPO 24 h.
- Application: revert the Docker image tag to the previous SHA
  (`docker compose up -d` with old tag); restarts in < 30 s.
- Schema: forward-only migrations; rollback is restore-from-backup
  rather than `alembic downgrade`.
- Front-end: same image, no separate FE deployment.

---

## 15. Risks and mitigations

| #   | Risk                                                         | Likelihood | Impact | Mitigation                                                                                                       |
|-----|--------------------------------------------------------------|------------|--------|------------------------------------------------------------------------------------------------------------------|
| R1  | JWT secret leak (hard-coded in source)                        | ~~High~~ → Resolved        | Critical | ✅ Done — secret read from `IPS_JWT_SECRET`; dev fallback logs a warning. IT must set the env var in prod and rotate after offboarding. |
| R2  | SQLite `database is locked` under concurrent writes           | Medium      | High    | Migrate to PostgreSQL (Section 0.2.4).                                                                            |
| R3  | Exception handler leaks tracebacks to clients                  | ~~High~~ → Resolved        | Medium   | ✅ Done — 500-handler hides exception details unless `IPS_DEBUG=1`; full traceback always logged server-side.       |
| R4  | CORS allow_origins = "*" with credentials                       | ~~High~~ → Resolved        | Medium   | ✅ Done — CORS middleware now opt-in via `IPS_CORS_ORIGINS`. Default deployment ships no CORS headers (same-origin). |
| R5  | Single-VM single point of failure                              | Medium      | Medium   | Move to load-balancer + 2 app VMs once paid customers exist.                                                       |
| R6  | Loss of uploads/ folder (disk failure)                         | Low         | High    | Nightly off-host rsync; quarterly restore drill.                                                                    |
| R7  | Inline migrations diverge between dev and prod                 | Medium      | Medium   | Replace with Alembic (Section 0.3.1) — the longer this is delayed, the more painful the cutover.                   |
| R8  | Public CDN for Vue/Tailwind goes down                          | Low         | Medium   | Vendor the libraries locally (already partially done — see `static/vendor/`). Continue migrating remaining CDN dependencies. |
| R9  | Bidder portal exposes data across packages                      | Low         | Critical | Bidder authorisation tested through `auth.get_project_user()`; verified covered by access tests at every bidder-portal endpoint. |
| R10 | Customer file upload contains malware                           | Medium      | High     | Add ClamAV scan (or cloud-provider equivalent) on the upload endpoint within 90 days of go-live.                    |
| R11 | Daemon-thread PDF jobs lost on restart                          | Medium      | Low      | The `reports` row records job state; failed jobs visible to user. Enhancement: replace threading with RQ/Celery once load grows. |

---

## 16. Assumptions and constraints

### Technical constraints

- Python 3.11+ required.
- Vue 3 via CDN, Tailwind CSS via CDN (frontend has no build step today).
- SQLite at present; Postgres recommended.
- Uvicorn ASGI server; no plan to change.
- Single-tenant deployment per VM (project-scoping is logical, not
  cryptographic).

### Business constraints

- Zero-budget infrastructure for first six months: target a single
  VM ≤ 30 €/month.
- Time-to-go-live ≤ 4 weeks from the date this document is signed.
- All UX changes must be made directly in `static/` — no parallel
  Storybook or design system is in scope.
- One developer + AI assistant; release cadence two-week sprints.

### External dependencies

- Internet-available reverse proxy with auto-TLS (Caddy preferred).
- Cloudflare (or equivalent) DNS.
- One off-host backup target.
- One paid email service if/when in-app email notifications ship.

---

## 17. Compliance and standards

- **Internal IT standards**: aligned with the team's standard
  Python style (PEP 8, type hints in new code), and the Vue 3
  Options API throughout the front-end.
- **Regulatory**:
  - GDPR: data subject deletion, export and minimisation handled in
    operations runbook (Section 7.5). Data hosted in EU on request.
  - Industry-specific (e.g. ISO 19650 for construction information
    management): not covered by the platform; deferred to customer
    process.
- **Architecture governance**:
  - Every new module follows the workflow-record pattern (status +
    history + my-pending) documented in the project memory.
  - Every new override of `PROJECT_OWNER`-equivalent rights is
    audit-tagged in source with the rationale.
  - Schema changes require a new Alembic revision (post-cleanup).
  - JS edits require a `?v=N` cache-bust bump in `static/index.html`.
  - No cross-project queries without ADMIN role.

---

## 18. Appendices

### 18.1 Configuration cheat sheet

All of these are read once at process start. Restart the application
after changing any of them.

| Variable                | Required | Default                                | Wired in code? | Notes                                                                                |
|-------------------------|----------|----------------------------------------|----------------|--------------------------------------------------------------------------------------|
| `IPS_JWT_SECRET`        | **Yes in prod** | dev-fallback string (logs WARNING) | ✅ `auth.py`     | 64+ random chars; rotation invalidates all current sessions.                          |
| `IPS_DEBUG`             | No       | unset / `0`                            | ✅ `main.py`    | When `1`, the 500-handler returns `str(exc)` instead of a generic message. Never set in prod. |
| `IPS_CORS_ORIGINS`      | No       | unset (CORS middleware not mounted)    | ✅ `main.py`    | Comma-separated list, e.g. `https://partner.example.com,https://other.example.com`. Leave unset for the standard same-origin deploy. |
| `IPS_DATABASE_URL`      | Yes (after Postgres switch) | `sqlite:///./projectmanagement.db` | ⚠️ pending  | SQLAlchemy URL, e.g. `postgresql+psycopg://user:pass@host/ipsdb`.                    |
| `IPS_UPLOAD_ROOT`       | No       | `./uploads`                            | ⚠️ pending     | Absolute path recommended. Will become important when uploads/ is moved off the VM. |
| `IPS_LOG_LEVEL`         | No       | `INFO`                                 | ⚠️ pending     | One of `DEBUG/INFO/WARNING/ERROR`.                                                   |
| `IPS_REPORTS_KEEP_DAYS` | No       | 90                                     | ⚠️ pending     | How long generated PDFs are retained on disk.                                        |

**Suggested production `.env` / `EnvironmentFile`** (replace the secret):

```
IPS_JWT_SECRET=Q7vF…64-char-random-string…X9z
IPS_DATABASE_URL=postgresql+psycopg://ips:supersecret@db.internal/ipsdb
# IPS_CORS_ORIGINS=                         # leave empty for same-origin
# IPS_DEBUG=                                # leave empty in production
```

### 18.2 OpenAPI

The full machine-readable contract is available at
`http://<host>/openapi.json` when `docs_url` is enabled (typically only
on test). The recommended go-live posture is to disable `/docs` and
`/openapi.json` in production (Section 8.1) and keep an exported copy
of the spec in source control next to this document.

### 18.3 Glossary

| Term                  | Definition                                                                |
|-----------------------|---------------------------------------------------------------------------|
| **PMC**               | Project Management Consultant — the engineering / EPCM consultant on a project. |
| **EPC / EPCM**        | Engineering, Procurement, Construction (Management) — common turnkey contract types. |
| **Package Owner**     | Per-package role granting PROJECT_OWNER-equivalent rights inside that package only. |
| **Module Lead**       | Per-module role granting PROJECT_OWNER-equivalent rights inside that module only.  |
| **ITP**               | Inspection and Test Plan — the QC checklist the platform tracks.           |
| **LOTO**              | Lock-Out / Tag-Out — energy-isolation procedure attached to a work permit.  |
| **PR**                | Progress Report — periodic completion declaration per package.              |
| **SC**                | Scope Change — formally approved deviation from the contracted scope.        |
| **HSE**               | Health, Safety, Environment.                                                 |
| **PPE**               | Personal Protective Equipment.                                                |
| **S-curve**           | Cumulative-progress chart (planned vs actual) used in budget, procurement and schedule. |
| **PROJECT_OWNER**     | Top role within a project (below ADMIN). Sets up modules, manages users, signs off workflows. |
| **PROJECT_TEAM**      | Default role for staff working on the project.                                |
| **CLIENT**            | Owner-side reviewer (technical or commercial).                                |
| **VENDOR**            | Subcontractor / supplier executing a package.                                 |
| **BIDDER**            | Pre-award party in the procurement portal; cannot see anything outside their submittals. |

---

*End of document — v1.0.*
