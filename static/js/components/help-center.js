// ─────────────────────────────────────────────────────────────────────────────
// Help Center — single component with internal sidebar navigation, rich
// per-module documentation, and HTML/CSS flow diagrams for the major workflows.
// ─────────────────────────────────────────────────────────────────────────────

app.component('help-center', {
  props: ['currentUser'],
  template: `
<div class="help-center">
  <div class="help-shell">
    <!-- Top: section tabs -->
    <div class="help-topbar">
      <nav class="help-tabs" role="tablist">
        <button v-for="s in groups.overview" :key="s.id" @click="setSection(s.id)"
          :class="['help-tab', 'priority', section === s.id ? 'active' : '']" :title="s.label">{{ s.label }}</button>
        <button v-for="s in groups.modules" :key="s.id" @click="setSection(s.id)"
          :class="['help-tab', section === s.id ? 'active' : '']" :title="s.label">{{ s.label }}</button>
      </nav>
    </div>

    <!-- Bottom: content -->
    <main class="help-content">
      <article class="help-article">

        <!-- ═══ Introduction ═══ -->
        <section v-if="section === 'intro'">
          <h1>Welcome to ImPulse Suite</h1>
          <p class="lead">Group-IPS's full-stack engineering &amp; construction project management platform — covering project organization, planning, procurement, construction execution, quality, safety, scope &amp; budget governance.</p>

          <div class="callout">
            <p>The platform is organised around a left-hand <strong>navigation pane</strong>. Each entry is a self-contained module with its own sub-tabs, dashboards and workflow records. This Help Center is structured to mirror that navigation: pick a module on the left to read about it.</p>
          </div>

          <h2>Module map</h2>
          <p>Modules visible to a user depend on their <strong>project role</strong> (see <a href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>). The full list below describes each module's purpose.</p>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 my-4">
            <div v-for="m in moduleSummaries" :key="m.key" class="help-modulecard">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-semibold text-gray-800">{{ m.title }}</h3>
                <button class="text-xs text-ips-blue hover:underline" @click="setSection(m.key)">Open →</button>
              </div>
              <p class="text-xs text-gray-500 mt-1 leading-snug">{{ m.summary }}</p>
            </div>
          </div>

          <h2>Cross-cutting concepts</h2>
          <ul>
            <li><strong>Project scoping</strong> — every record carries a <code>project_id</code>; users are scoped to the project(s) they have a <code>UserProject</code> entry for.</li>
            <li><strong>Workflow records</strong> — most modules use a common pattern: a draft → submitted → reviewed → closed lifecycle, with reviewer assignments coming from the Package, with a re-open / resubmit path on rejection. See the <a href="#" @click.prevent="setSection('permissions')">Permissions</a> section for the full flow.</li>
            <li><strong>Files</strong> — uploads attach to records via <code>FileAttachment</code>. Generated PDF reports and Floorplans surface in the master Files list without duplication.</li>
            <li><strong>Audit</strong> — every workflow event is captured with actor, timestamp and comment; review history is shown inline on the record.</li>
          </ul>
        </section>

        <!-- ═══ Permissions ═══ -->
        <section v-if="section === 'permissions'">
          <h1>Permissions &amp; Roles</h1>
          <p class="lead">A complete, code-grounded description of who can do what in the platform.</p>

          <h2>Project roles</h2>
          <p>Every user has a <strong>global role</strong> (<code>UserRole</code>) and a <strong>per-project role</strong> stored on <code>UserProject.role</code>. Endpoints check the per-project role through a <code>ProjectContext</code> attached to every request.</p>

          <table class="help-table">
            <thead><tr><th>Role</th><th>Scope</th><th>Capabilities</th></tr></thead>
            <tbody>
              <tr><td><strong>ADMIN</strong></td><td>Global, cross-project</td><td>Full access to every project. Manages users, projects, system settings. Can impersonate any user for diagnostics.</td></tr>
              <tr><td><strong>PROJECT_OWNER</strong></td><td>Per project</td><td>Project Owner — full access within the project: create/edit/delete on every module, override every workflow gate, manage Module Leads and Package Owners.</td></tr>
              <tr><td><strong>PROJECT_TEAM</strong></td><td>Per project</td><td>Internal IPS team. Create/edit on most modules. Cannot override reviews unless they are also a Module Lead or Package Owner. The default role for new contacts.</td></tr>
              <tr><td><strong>CLIENT</strong></td><td>Per project</td><td>Client-side reviewer/observer. Reads almost everything; reviews where assigned to a Client Commercial or Client Technical slot on a package, or as a Subservice / Area / Unit reviewer in the Document review chain.</td></tr>
              <tr><td><strong>VENDOR</strong></td><td>Per project</td><td>Supplier/contractor on awarded packages. Sees only data for packages they are linked to. Submits work permits, daily reports, ITP records, observations on those packages.</td></tr>
              <tr><td><strong>BIDDER</strong></td><td>Per project</td><td>Pre-award procurement participant. Sees only the bidder portal for packages they are invited to. Cannot see meetings, schedule, budget, etc.</td></tr>
            </tbody>
          </table>

          <h2>Module Leads</h2>
          <p>A Module Lead is a contact granted <strong>PROJECT_OWNER-equivalent rights for one specific module</strong>, without elevating their global role. Used to delegate (e.g., a "QA/QC Manager" gets full Quality Control rights without admin powers elsewhere).</p>

          <ul>
            <li>Configured under <strong>Project Setup → Module Leads</strong>.</li>
            <li>One contact per (project, module) pair via the <code>ProjectModuleLead</code> table.</li>
            <li>Available for 9 modules: <em>Schedule, Budget, Risk Register, Procurement, Scope Changes, Document Management, Quality Control, Construction, Safety</em>.</li>
            <li>Bidders cannot be Module Leads.</li>
            <li>Backend gate: <code>auth.has_owner_or_lead_access(user, module, db)</code> — single source of truth across the 9 supported modules.</li>
          </ul>

          <h2>Package Owners</h2>
          <p>The <code>package_owner_id</code> on a Package elevates one contact to <strong>PROJECT_OWNER-equivalent rights for that one package, in every module except Meetings</strong>. They can override reviews, force-approve workflow records, edit data on the package, and award procurement.</p>

          <ul>
            <li>Configured per package under <strong>Project Organization → Packages</strong>.</li>
            <li>Bidders and Vendors <strong>cannot</strong> be assigned as Package Owners — this is enforced at the API and hidden from the dropdown.</li>
            <li>Backend helper: <code>auth.package_access_path(user, module, package, db)</code> returns <code>"OWNER_OR_LEAD"</code>, <code>"PACKAGE_OWNER"</code> or <code>None</code>. The audit comment for an override default reads e.g. <em>"Decision overridden by John Doe (as Package Owner)"</em> so the path used is preserved.</li>
            <li>Excluded from Meetings (meetings have their own owning-package contact concept which only grants meeting-edit rights).</li>
            <li>Risk Register also excluded — risks are not package-bound.</li>
          </ul>

          <h2>Reviewer &amp; approver assignments</h2>
          <p>Beyond the project roles above, the platform uses several <strong>assignment-based reviewer slots</strong> attached to packages, areas, units and subservices. These are <em>not</em> user roles — they are slots where you nominate a contact to act as the official approver for a class of records. Each slot drives one or more workflow steps:</p>

          <table class="help-table">
            <thead><tr><th>Reviewer slot</th><th>Where assigned</th><th>What they review / approve</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>PMC Technical</strong></td>
                <td>Package (Project Organization → Packages)</td>
                <td>Technical-side review on the package: <strong>ITP Records</strong> (Pattern C — primary reviewer), and any technical <strong>Document</strong>. Engineering drawings, calculations, technical specifications, test execution sign-off.</td>
              </tr>
              <tr>
                <td><strong>PMC Commercial</strong></td>
                <td>Package</td>
                <td>Commercial-side review on the package: <strong>Scope Changes</strong>, <strong>Invoices</strong>, <strong>Progress Reports</strong> (commercial-impact entries) and any commercial <strong>Document</strong>.</td>
              </tr>
              <tr>
                <td><strong>Client Technical</strong></td>
                <td>Package</td>
                <td>Client-side technical review — mirrors PMC Technical from the client's organization. Reviews <strong>ITP Records</strong> and technical <strong>Documents</strong> on behalf of the client; rejection requires technical justification.</td>
              </tr>
              <tr>
                <td><strong>Client Commercial</strong></td>
                <td>Package</td>
                <td>Client-side commercial review — mirrors PMC Commercial. Reviews <strong>Scope Changes</strong>, <strong>Invoices</strong>, <strong>Progress Reports</strong>, and commercial <strong>Documents</strong>; final commercial approval before the record reaches APPROVED.</td>
              </tr>
              <tr>
                <td><strong>Site Supervisor (per area)</strong></td>
                <td>Area (Project Organization → Areas, multi-select per area)</td>
                <td>Approves <strong>Work Permits</strong> per area (each linked area on a permit is approved independently by its supervisors), closes <strong>Safety Incidents</strong> on its area, approves <strong>Workers</strong> assigned to its area, and validates <strong>LOTOs</strong>. <em>For large projects, multiple site supervisors may be appointed — each on different areas — so work-permit approval is correctly scoped: every area gets approved by its own supervisors, never by a supervisor of an unrelated area.</em> Site supervisors also receive <strong>Toolbox</strong> Acknowledge action points for any toolbox linked to their areas.</td>
              </tr>
              <tr>
                <td><strong>Area Manager</strong></td>
                <td>Area (single contact per area)</td>
                <td>Optional reviewer step in the <strong>Document review chain</strong> — runs first when set, before any other reviewer, on documents linked to the area. Used when a senior area-level sign-off is required ahead of the package PMC/Client review.</td>
              </tr>
              <tr>
                <td><strong>Unit Manager</strong></td>
                <td>Unit (single contact per unit)</td>
                <td>Optional reviewer step in the <strong>Document review chain</strong> — runs after Area Manager (when set), on documents linked to the unit. Used for finer-grained sign-off when a unit has its own technical authority.</td>
              </tr>
              <tr>
                <td><strong>Subservice PMC</strong></td>
                <td>Subservice (Project Organization → Subservices)</td>
                <td>Optional PMC reviewer step in the <strong>Document review chain</strong> only — runs when a document is classified under a subservice that has this slot configured. <em>Not</em> used for ITP records (which go through PMC Technical on the package).</td>
              </tr>
              <tr>
                <td><strong>Subservice Client</strong></td>
                <td>Subservice</td>
                <td>Optional Client reviewer step in the <strong>Document review chain</strong> only. Same scope as Subservice PMC. <em>Not</em> used for ITP records.</td>
              </tr>
            </tbody>
          </table>

          <p class="caption"><strong>Rule of thumb:</strong> the package's <strong>PMC + Client</strong> slots run on every review-bearing record — Commercial slots for SC / Invoices / Progress Reports, Technical slots for ITPs. <strong>Subservice, Area Manager and Unit Manager</strong> slots are <em>only</em> used by the <strong>Document review chain</strong> as optional pre-reviewers; if a slot isn't configured, the chain skips it.</p>

          <h2>Approval flows</h2>
          <p>Every review-bearing record across the platform uses one of nine canonical workflow patterns. The full ISO-style flowcharts — including the rejection / resubmit loops and override paths — are embedded directly inside the help page of each relevant module. Open the module's help tab to see its diagram in context.</p>
          <ul>
            <li><strong>Pattern A — PMC + Client review</strong>: two-reviewer approval (Scope Changes, Invoices). Reviewers from the package's PMC + Client slots.</li>
            <li><strong>Document review chain</strong>: extended chain for Documents only — optional Area Manager / Unit Manager / Subservice PMC / Subservice Client run BEFORE the mandatory PMC + Client review; can end as APPROVED or APPROVED WITH COMMENTS.</li>
            <li><strong>Pattern B — Multi-entry Progress Reports</strong>: PR with multiple entries, all entries must be approved by PMC + Client. Override approves/rejects all at once.</li>
            <li><strong>Pattern C — ITP Records</strong>: same shape as Pattern A but uses the package's PMC Technical + Client Technical slots (technical review). Subservice reviewers are <em>not</em> involved here.</li>
            <li><strong>Pattern D — Work Permit + LOTO interlock</strong>: area-scoped multi-supervisor approval, gated by the LOTO rollup state.</li>
            <li><strong>Pattern E — Safety Incidents</strong>: five-stage investigative lifecycle with multiple role-gated transitions and re-open with reason.</li>
            <li><strong>Pattern F — Toolboxes (Acknowledge)</strong>: lighter three-state flow with multi-acknowledger gate.</li>
            <li><strong>Pattern G — Worker review</strong>: single-reviewer approve / reject by site supervisor with certificate validity check.</li>
            <li><strong>Pattern H — Procurement (Submittal receipt + Award)</strong>: bidder uploads at each step → user receipts → advance until final step → award + forced Create Order.</li>
            <li><strong>Pattern I — Document distribution + acknowledge receipt</strong>: post-approval recipient list + per-recipient acknowledgement (triggered by either APPROVED or APPROVED WITH COMMENTS).</li>
          </ul>

          <h2>Acknowledge, Resubmit, Re-open</h2>
          <ul>
            <li><strong>Acknowledge</strong> — used in Toolboxes and on document distribution receipts. The recipient simply confirms they have read/received the record. No approval power, no rejection.</li>
            <li><strong>Resubmit</strong> — author re-opens an editable form on a <em>rejected</em> record, applies changes, and re-submits. Reviewers re-review (their previous decisions are reset to PENDING for the affected step). The history of all prior reviews is kept on the record.</li>
            <li><strong>Re-open</strong> — a closed/approved record can be re-opened by an authorised user with a mandatory reason. Re-open events go into the history; field state at the moment of re-open is preserved so the workflow comment trail never loses context.</li>
          </ul>

          <h2>Quick reference — who can override</h2>
          <table class="help-table">
            <thead><tr><th>Module &amp; record</th><th>ADMIN</th><th>PROJECT_OWNER</th><th>Module Lead</th><th>Package Owner</th></tr></thead>
            <tbody>
              <tr><td>Document review override</td><td>✓</td><td>✓</td><td>✓ (Document Mgmt)</td><td>✓</td></tr>
              <tr><td>Scope change override</td><td>✓</td><td>✓</td><td>✓ (Scope Changes)</td><td>✓</td></tr>
              <tr><td>Invoice override</td><td>✓</td><td>✓</td><td>✓ (Budget)</td><td>✓</td></tr>
              <tr><td>Progress report override</td><td>✓</td><td>✓</td><td>✓ (Schedule)</td><td>✓</td></tr>
              <tr><td>ITP override</td><td>✓</td><td>✓</td><td>✓ (Quality Control)</td><td>✓</td></tr>
              <tr><td>Punch override</td><td>✓</td><td>✓</td><td>✓ (Quality Control)</td><td>✓</td></tr>
              <tr><td>Worker override</td><td>✓</td><td>✓</td><td>✓ (Construction)</td><td>✓</td></tr>
              <tr><td>Work permit approve/reject</td><td>✓</td><td>✓</td><td>✓ (Construction)</td><td>✓</td></tr>
              <tr><td>Safety incident approval</td><td>✓</td><td>✓</td><td>✓ (Safety)</td><td>✓</td></tr>
              <tr><td>Procurement award</td><td>✓</td><td>✓</td><td>✓ (Procurement)</td><td>✓</td></tr>
              <tr><td>Risk Register edits</td><td>✓</td><td>✓</td><td>✓ (Risk Register)</td><td>—</td></tr>
              <tr><td>Meeting edits</td><td>✓</td><td>✓</td><td>—</td><td>—</td></tr>
            </tbody>
          </table>
          <p class="caption">"Module Lead" only counts when the user is a Lead for the matching module. "Package Owner" only counts for actions on their package — not project-wide.</p>
        </section>

        <!-- ═══ Project Organization ═══ -->
        <section v-if="section === 'contacts'">
          <h1>Project Organization</h1>
          <p class="lead">The directory of people, packages, areas/units and reference data — every other module reads from here.</p>
          <div class="help-references">
            <span class="help-ref-label">Related</span>
            <a class="help-ref-link" href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>
          </div>

          <h2>Tabs in detail</h2>

          <h3>1. Contacts</h3>
          <p>The master list of everyone involved with the project: client side, PMC side, vendors, bidders, internal team. Supports an Excel template / preview / apply import path; multi-select bulk delete.</p>
          <p><strong>Data collected per contact:</strong> name, email, company, phone, function/title, project role (linked via <code>UserProject.role</code>), optional linked user account (a contact without a user can be referenced but cannot log in), inherited audit fields (created/updated by + timestamps).</p>

          <h3>2. Packages</h3>
          <p>Work / procurement packages — the unit around which most permissions and budgets are organised.</p>
          <p><strong>Data collected per package:</strong> tag number, name, company, address, <strong>Account Manager</strong> (must be a linked contact on the package), <strong>Package Owner</strong> (gets PROJECT_OWNER-equivalent rights — see <a href="#" @click.prevent="setSection('permissions')">Permissions</a>; bidders/vendors not eligible), four reviewer slots (<em>PMC Technical, PMC Commercial, Client Technical, Client Commercial</em>) used by document, scope-change, invoice and progress-report flows, and a many-to-many list of linked contacts.</p>

          <h3>3. Areas &amp; Units</h3>
          <p>Physical site geography. Areas are the main level (used for work permits, safety incidents, daily reports). Units optionally subdivide an Area.</p>
          <p><strong>Data collected per area:</strong> name, code, description, ordering, multi-select <strong>Site Supervisors</strong> (must be contacts linked to a User who is PROJECT_OWNER / PROJECT_TEAM / CLIENT — bidders excluded), optional floorplan attached for pinpointing.</p>
          <p><strong>Data collected per unit:</strong> name, parent area, ordering.</p>

          <h3>4. Subservices</h3>
          <p>Service category catalogue (SC, DC, ENG, SAF, …). Used <strong>only by Documents</strong> — to classify each document under a service category and to provide optional reviewer slots for the Document review chain. There is no link between subservices and ITP test types or any other module.</p>
          <p><strong>Data collected:</strong> service code, service name, subservice code, subservice name, optional Subservice PMC reviewer, optional Subservice Client reviewer. The reviewer slots are picked up only when a document is classified under that subservice.</p>

          <h3>5. Floorplans</h3>
          <p>PDF / image floorplans attached to areas. Used as the visual canvas for the safety-observation and punch-list pinpoint features. Greyscale or B&amp;W floorplans give the cleanest red-pin overlay in printed reports.</p>
          <p><strong>Data collected:</strong> name, area assignment, file (max 25 MB), optional description.</p>

          <h3>6. Org Chart</h3>
          <p>Hierarchical reporting links between contacts — visual only, does not affect permissions.</p>
          <p><strong>Data collected per link:</strong> from-contact, to-contact (reports-to), relation type (LINE or STAFF).</p>

          <h2>Imports</h2>
          <p>Contacts, Subservices, Areas, Units all support an Excel template/preview/apply pattern (gated to ADMIN / PROJECT_OWNER). Errors flagged row-by-row in the preview.</p>
        </section>

        <!-- ═══ My Action Points ═══ -->
        <section v-if="section === 'my-points'">
          <h1>My Action Points</h1>
          <p class="lead">A unified inbox of everything that needs <em>your</em> attention across all modules — pending reviews, pending acknowledgements, prepared meeting points, rejected records to resubmit.</p>
          <div class="help-references">
            <span class="help-ref-label">Related</span>
            <a class="help-ref-link" href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>
          </div>

          <h2>Sources surfaced here</h2>
          <ul>
            <li>Meeting action points where you are the responsible.</li>
            <li>Pending PMC / Client reviews on Documents, Scope Changes, Invoices, Progress Reports, ITP records.</li>
            <li>Pending Toolbox acknowledgements (you are a site supervisor on a linked area/package).</li>
            <li>Pending Safety Incident actions (you are a package contact for an action-in-progress incident).</li>
            <li>Pending bidder submittals when you are a bidder portal user.</li>
            <li>Rejected workflow records you authored — ready to resubmit.</li>
          </ul>
          <p>Clicking an item deep-links into the relevant module record with the right tab and modal pre-opened.</p>
        </section>

        <!-- ═══ Meetings ═══ -->
        <section v-if="section === 'meetings'">
          <h1>Meeting Management</h1>
          <p class="lead">Recurring meeting templates, instances, action point lifecycle and PDF/Excel minute exports.</p>
          <div class="help-references">
            <span class="help-ref-label">Related</span>
            <a class="help-ref-link" href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>
          </div>

          <h2>Tabs in detail</h2>

          <h3>1. Meeting Types</h3>
          <p>Templates that drive the recurring meeting calendar. Edit rights: ADMIN/PROJECT_OWNER plus contacts linked to the owning package.</p>
          <p><strong>Data collected:</strong> name, code, recurrence pattern (weekly / monthly / ad-hoc), default location, owning package (drives edit rights), default participants list (contacts), agenda template, color tag for the calendar grid.</p>

          <h3>2. Weekly View</h3>
          <p>A 7-day calendar grid showing scheduled meeting types and their instances. Useful as a "what's on this week" overview.</p>
          <p><strong>Data shown:</strong> meeting type tag, day-of-week + time slot, instance count.</p>

          <h3>3. Meetings</h3>
          <p>Actual meeting instances. Open one to manage participants, agenda, points and notes. Each instance generates an exportable minute (PDF / Excel) on close.</p>
          <p><strong>Data collected per meeting:</strong> meeting type, date/time, location, status (DRAFT/HELD/CANCELLED), participant list (per-meeting overrides on top of the type's default list), agenda items, action / decision / information points, free-form notes, attachments. The export captures all of this in a structured PDF/Excel.</p>

          <h3>4. All Points</h3>
          <p>Flat, filterable, searchable list of every meeting point across the project. The fastest way to see what's overdue or pending for a specific contact.</p>
          <p><strong>Filters available:</strong> status (open/closed), type (action/decision/info), responsible contact, meeting type, date range, free-text search.</p>

          <h3>5. Dashboard</h3>
          <p>KPIs + a cumulative weekly bar chart (opens vs. closes per ISO week, horizontal-scrollable, default-scrolled to the most recent 26 weeks). Visible to ADMIN / PROJECT_OWNER / PROJECT_TEAM / CLIENT.</p>
          <p><strong>Data shown:</strong> total open points, overdue count by week, weekly opens-vs-closes stacked bar, top-5 overdue responsibles, breakdown by meeting type.</p>

          <h2>Meeting point lifecycle</h2>
          <p>Each point has type (ACTION / DECISION / INFO), responsible contact, due date, status, and a notes thread. Points carry preparation flags so the responsible can pre-load context. Closure leaves an audit-friendly history; re-open requires a reason.</p>

          <h2>Visibility scoping</h2>
          <p>ADMIN/PROJECT_OWNER see every meeting. Other roles see meetings where they are a default-participant on the meeting type, or were individually added as a participant. Owning-package contact status grants <em>edit</em> rights but not view rights.</p>
        </section>

        <!-- ═══ Schedule ═══ -->
        <section v-if="section === 'schedule'">
          <h1>Schedule Management</h1>
          <p class="lead">Tasks, baselines, the project Gantt, and per-package Progress Reports for PMC + Client sign-off.</p>
          <div class="help-references">
            <span class="help-ref-label">Related</span>
            <a class="help-ref-link" href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>
          </div>

          <h2>Tabs in detail</h2>

          <h3>1. Tasks</h3>
          <p>Flat list of project tasks. Vendors see only tasks on packages they are linked to.</p>
          <p><strong>Data collected per task:</strong> WBS code, name, package, parent task (for hierarchical roll-up), description, planned start &amp; end, actual start &amp; end, % complete (0–100), status (Not Started / In Progress / Done / On Hold / Cancelled), responsible contact, milestone flag, optional area assignment, attachments.</p>

          <h3>2. Overall Time Schedule (Gantt)</h3>
          <p>Read-only Gantt rendered from <code>/api/schedule/tasks/all</code>. Visible to every project contact (vendors included), excluding bidders. Critical-path style visualisation; today-line indicator; baseline overlay.</p>

          <h3>3. Baselines</h3>
          <p>Snapshot the entire task list at a point in time for later variance analysis.</p>
          <p><strong>Data collected per baseline:</strong> name, snapshot date, author, comment, frozen copy of all tasks (planned start, end, %, status). Multiple baselines are kept; the Gantt can overlay any one.</p>

          <h3>4. Progress Reports</h3>
          <p>Periodic per-package report consolidating progress across many entries (e.g. by area, by sub-WBS). Each entry receives PMC + Client review.</p>
          <p><strong>Data collected per PR:</strong> period (start–end date), package, author, summary text, multi-entry table where each entry has: scope description, planned %, actual %, deviation comment, attachments. PR status: <code>DRAFT → SUBMITTED → APPROVED / REJECTED</code>.</p>

          <h2>Progress Report approval flow</h2>
          <p>The PR moves to APPROVED only when every entry has both PMC and Client approval. Any rejection sends the whole PR back to the author for amend &amp; resubmit. Override decides on all entries at once and is available to ADMIN, PROJECT_OWNER, Schedule Lead, or Package Owner.</p>
          <div class="flow-chart" v-html="flow('progressReport')"></div>

          <h2>Modernization note</h2>
          <p>An MS-Project-style planner (typed dependencies FS/SS/FF/SF with lag, summary task rollup, area/package roll-up, inline grid edit, opt-in toggle) is on the roadmap as a 9–14 week piece of work — see the engineering memory for the recommended library (Bryntum / DHTMLX) and effort breakdown.</p>
        </section>

        <!-- ═══ Budget ═══ -->
        <section v-if="section === 'budget'">
          <h1>Budget Management</h1>
          <p class="lead">Per-package cost control: baselines, transfers, orders, invoices, scope-change impact and approval workflows.</p>
          <div class="help-references">
            <span class="help-ref-label">Related</span>
            <a class="help-ref-link" href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>
          </div>

          <h2>Overview tab</h2>
          <p>One row per package across 9 columns (equal width):</p>
          <ul>
            <li><strong>Baseline</strong> — initial budget. Editable inline by ADMIN / PROJECT_OWNER.</li>
            <li><strong>Actual Budget</strong> — Baseline + net Transfers/Injections. The transfer delta is shown below the value.</li>
            <li><strong>Bid Value</strong> — average of non-excluded bids from Procurement; switches to the awarded bid once the package is awarded. Red when above Actual Budget. Status pill: "In Progress" or "Awarded".</li>
            <li><strong>Committed</strong> — confirmed Orders + approved scope changes not yet linked to an Order. SC contribution shown as <code>SC = X</code>. Red when above Actual Budget.</li>
            <li><strong>Remaining</strong> — Actual Budget − Committed (when Committed has value), otherwise Actual Budget − Bid Value. Small label below indicates which formula was used. Red when negative.</li>
            <li><strong>Pending SC</strong> — cost of scope changes still in Draft or Submitted status.</li>
            <li><strong>Remaining incl. Pending SC</strong> — Remaining − Pending SC. Red when negative.</li>
            <li><strong>Spend</strong> — approved invoices.</li>
          </ul>

          <h2>Other tabs</h2>
          <ul>
            <li><strong>Orders</strong> — raise &amp; manage POs against a package. Status: DRAFT → COMMITTED → CANCELLED.</li>
            <li><strong>Transfers &amp; Injections</strong> — three flavours: TRANSFER (between packages, net-zero), INJECTION (external new money), RISK_INTEGRATION (move risk reserve into baseline).</li>
            <li><strong>Invoices</strong> — invoices per Order with PMC + Client review. Override available to ADMIN / PROJECT_OWNER / Budget Lead / Package Owner.</li>
            <li><strong>Approvals</strong> — invoices currently awaiting your review (PMC or Client side, depending on package configuration).</li>
            <li><strong>Dashboard</strong> — 8 KPI cards mirroring the Overview columns + budget-status horizontal bar + risk budget impact + monthly &amp; cumulative invoices.</li>
          </ul>

          <h2>Invoice approval flow</h2>
          <p>Invoices follow the canonical PMC + Client review pattern (Pattern A). The Invoices tab lists items per Order; each invoice receives PMC Commercial then Client Commercial review. Rejection sends the record back to the author for amend &amp; resubmit. Override available to ADMIN, PROJECT_OWNER, Budget Lead, or Package Owner.</p>
          <div class="flow-chart" v-html="flow('review')"></div>
        </section>

        <!-- ═══ Risk Register ═══ -->
        <section v-if="section === 'risks'">
          <h1>Risk Register</h1>
          <p class="lead">Project-wide risks with probability × impact scoring, mitigation tracking and budget-impact integration.</p>
          <div class="help-references">
            <span class="help-ref-label">Related</span>
            <a class="help-ref-link" href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>
          </div>

          <h2>Tabs in detail</h2>

          <h3>1. Register</h3>
          <p>The list of all live risks. Filterable by category, phase, status, owner.</p>
          <p><strong>Data collected per risk:</strong> code (auto), title, description, category, phase, owner (contact), probability (1–5 scale, configurable), capex impact (€), schedule impact (days or score), severity score (auto-derived from prob × impact via the matrix), status (Open / Mitigated / Closed), mitigation actions list (with owner, due date, status), residual probability + impact (after mitigation), closure date, actual cost realised, attachments, threaded notes.</p>

          <h3>2. Scoring Matrix</h3>
          <p>5×5 (or configurable) matrix mapping probability × impact to a severity colour band. Configurable per project.</p>
          <p><strong>Data collected:</strong> probability cells (5 default rows), impact cells (5 default columns: 0 / 25 / 50 / 75 / 100 default capex bands), severity colour per cell (green/yellow/orange/red), severity score per cell.</p>

          <h3>3. Setup (Categories &amp; Phases &amp; Score Setup)</h3>
          <p>Project taxonomies and the score formula configuration. ADMIN / PROJECT_OWNER / Risk Lead only.</p>
          <p><strong>Data collected:</strong> Category list (code, name), Phase list (code, name, ordering), Score Setup (probability scale labels, impact band thresholds for capex and schedule).</p>

          <h3>4. Dashboard</h3>
          <p>KPIs and charts: open risks by severity, residual budget impact (open + closed), top-10 highest-residual risks, mitigation completion rate, risks-by-phase distribution.</p>

          <h2>Permissions note</h2>
          <p>Risks are <strong>not</strong> package-bound, so Package Owner override does not apply here. Edits/closures use <code>has_owner_or_lead_access(user, "Risk Register", db)</code> (ADMIN / PROJECT_OWNER / Risk Lead). Reads are visible to all non-bidder/non-vendor roles.</p>
        </section>

        <!-- ═══ Procurement ═══ -->
        <section v-if="section === 'procurement'">
          <h1>Procurement</h1>
          <p class="lead">From RFQ planning, through the bidding portal, to the award decision and budget integration.</p>
          <div class="help-references">
            <span class="help-ref-label">Related</span>
            <a class="help-ref-link" href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>
          </div>

          <h2>Tabs</h2>
          <ul>
            <li><strong>Dashboard</strong> — Overall progress, packages with plan, bidding company counts, late-step counter, financial weight donut chart per applicable package, technical &amp; commercial compliance bars, bid-vs-budget bars (avg / forecast / min / max).</li>
            <li><strong>Setup → Steps</strong> — define the project's procurement step sequence with weights (must sum to 100%). Once validated the sequence is locked.</li>
            <li><strong>Setup → Contract Types</strong> — reusable contract type catalogue.</li>
            <li><strong>Setup → Bidding Companies</strong> — company catalogue, with linked bidder-role users and per-package eligibility lists.</li>
            <li><strong>Plan</strong> — per package: which bidding companies are invited, the planned dates per step, and a "Not applicable" toggle to exclude from procurement entirely.</li>
            <li><strong>Register</strong> — the live procurement workflow. Each row = one bidding company on one package. Header per package shows bid value (or awarded value), package progress, and bidder count. Click a row to open a read-only View modal (or Edit, if authorised).</li>
            <li><strong>Bidder Portal</strong> — for users with the BIDDER role. Per-package tabs, split attachments (Project / My uploads), step-tagged uploads, lock-on-submit, "My Submittals" + activity log.</li>
          </ul>

          <h2>Step lifecycle, submittal receipt &amp; award</h2>
          <p>Each entry advances through the step sequence by uploading a <strong>submittal</strong> at the current step. A project user reviews the submittal, optionally fails it for compliance (which excludes the bidder), and "receipts" approved submittals — that's what advances the bidder to the next step. The package's <em>procurement progress</em> is the average cumulative step weight across non-excluded entries. Final-step bidders become eligible for award; awarding sets the entry to AWARDED, excludes the others, and forces the Create Budget Order modal.</p>
          <div class="flow-chart" v-html="flow('procurementAward')"></div>
          <p class="caption">Includes the full <strong>submittal-receipt loop</strong>: bidder uploads → user receipts (compliance check + bid value capture) → step advances → next round, until the final step. Compliance failure can exclude a bidder mid-process; awarding excludes all other bidders and forces the Create Order modal.</p>

          <h2>Permissions</h2>
          <ul>
            <li>Vendors fully blocked from this module.</li>
            <li>Bidders only see the bidder portal for packages they are invited to.</li>
            <li>PROJECT_TEAM and CLIENT can create/edit/link bidding companies (delete + bidder-contact assignment stay PROJECT_OWNER-only).</li>
            <li>Award &amp; plan editing: ADMIN / PROJECT_OWNER / Procurement Module Lead / Package Owner.</li>
          </ul>
        </section>

        <!-- ═══ Scope Changes ═══ -->
        <section v-if="section === 'scope-changes'">
          <h1>Scope Changes</h1>
          <p class="lead">Variation orders / change requests with PMC + Client review and traceable cost impact.</p>
          <div class="help-references">
            <span class="help-ref-label">Related</span>
            <a class="help-ref-link" href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>
          </div>

          <h2>Lifecycle</h2>
          <p>Pattern A applied to scope changes: <code>DRAFT → SUBMITTED → APPROVED / REJECTED</code>. A REJECTED SC can be edited and resubmitted. Override available to ADMIN / PROJECT_OWNER / Scope Changes Lead / Package Owner. After approval, the SC can optionally be linked to a budget Order.</p>
          <div class="flow-chart" v-html="flow('review')"></div>
          <p class="caption">Two-reviewer pattern: PMC Commercial → Client Commercial. Override available to ADMIN, PROJECT_OWNER, Scope Changes Lead, or Package Owner.</p>

          <h2>Cost impact</h2>
          <p>An APPROVED SC not yet linked to an Order shows up as <code>SC = X</code> contribution under the <em>Committed</em> column in Budget Overview. Once linked to an Order, the contribution flips into the Order's COMMITTED amount.</p>
        </section>

        <!-- ═══ Documents ═══ -->
        <section v-if="section === 'documents'">
          <h1>Document Management</h1>
          <p class="lead">Versioned uploads, multi-reviewer approval chains, threaded comments per version, and distribution receipts.</p>
          <div class="help-references">
            <span class="help-ref-label">Related</span>
            <a class="help-ref-link" href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>
          </div>

          <h2>Versioning</h2>
          <p>A Document has many <code>DocumentVersion</code> rows. Each new version supersedes the previous. Reviews and comments are version-scoped: re-uploading creates a fresh review chain.</p>

          <h2>Review flow</h2>
          <p>The full document approval chain runs up to <strong>four optional reviewers</strong> in sequence — Area Manager → Unit Manager → Subservice PMC → Subservice Client — before the mandatory <strong>PMC review</strong> and <strong>Client review</strong>. Each optional step is only included if a reviewer is configured for that document; if not assigned, the chain skips it. Both reviewer steps can decide <strong>Approve</strong> or <strong>Approve with comments</strong> — both lead to a successful end state and trigger distribution.</p>
          <div class="flow-chart" v-html="flow('documentReview')"></div>
          <p class="caption">Any reviewer in the chain (optional or mandatory) can <strong>reject</strong> — this aborts the chain and sends the document back to the author for amendment. Override (left-side dashed path) bypasses the entire chain — available to ADMIN, PROJECT_OWNER, the Document Mgmt Lead, and the Package Owner.</p>

          <h2>Distribution + acknowledge receipt flow</h2>
          <p>After APPROVED or APPROVED WITH COMMENTS, the document can be distributed to a recipient list. Each recipient gets a Receipt entry on their My Action Points — receipts remain PENDING until each recipient has explicitly acknowledged having read the document. Uploading a new version of the document <em>resets</em> the distribution: the new version must be re-distributed and re-acknowledged.</p>
          <div class="flow-chart" v-html="flow('documentDistribute')"></div>

          <h2>Other features</h2>
          <ul>
            <li>Auto-approve sweep when a package reviewer slot is cleared (the corresponding pending review row is auto-approved).</li>
            <li>Camera-capture upload for tablet users on the file-attachments component.</li>
            <li>In-app full-screen file viewer (PDF / images) — no <code>window.open</code> popups.</li>
          </ul>
        </section>

        <!-- ═══ Quality Control ═══ -->
        <section v-if="section === 'quality-control'">
          <h1>Quality Control</h1>
          <p class="lead">ITP (Inspection Test Plan) records with technical PMC + Client review, witness levels, and the project punch list with floorplan pinpoint.</p>
          <div class="help-references">
            <span class="help-ref-label">Related</span>
            <a class="help-ref-link" href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>
          </div>

          <h2>Tabs in detail</h2>

          <h3>1. ITP Register</h3>
          <p>The live list of all ITP records. Each row = one test execution. Inline Punch button on every row opens a pre-filled punch modal.</p>
          <p><strong>Data collected per ITP record:</strong> ITP number (auto), test type, package, area, unit, witness level (inherited from test type), planned date, executed date, vendor / IPS author, description, results (pass/fail + notes), measurements (free-form), photo attachments, <strong>PMC Technical review</strong> from the package (status, comment, reviewed_at), <strong>Client Technical review</strong> from the package (status, comment, reviewed_at), status (<code>DRAFT → SUBMITTED → APPROVED / REJECTED</code>), full history of every state transition.</p>

          <h3>2. Punch List</h3>
          <p>Defects / open items raised during construction or inspection. Multi-state lifecycle to track resolution.</p>
          <p><strong>Data collected per punch item:</strong> punch number (auto), title, description, package, area, unit, optional ITP record link (when raised inline from the ITP register), severity (Low / Medium / High / Critical), assigned-to (contact), due date, status (<code>OPEN → IN_PROGRESS → RESOLVED → CLOSED</code>), photo attachments, optional <strong>floorplan pin</strong> (x/y on the area's floorplan), resolution notes, closer contact, closed date.</p>

          <h3>3. Floorplan View</h3>
          <p>Heatmap of all punch-item pins on each area's floorplan. Pins clustered by status; filterable by package, severity, status, age. Toggleable number labels.</p>

          <h3>4. Reports</h3>
          <p>Background-generated PDF reports for ITPs and / or punch items. Cover page + one-record-per-A4-page detail layout with photos and floorplan pin location + landscape floorplan summary (optional split-per-package). Multi-select filter form; daemon thread; status polling.</p>
          <p><strong>Stored at:</strong> <code>uploads/{PROJECT}/Punch List Reports/</code>. Surfaces in the Files master list automatically.</p>

          <h3>5. Setup (Configuration)</h3>
          <p>Project-level catalogues for QC. ADMIN / PROJECT_OWNER / QC Lead only.</p>
          <p><strong>Test Types:</strong> name, description, sort order. Reviewers come from the package's PMC Technical + Client Technical slots (no subservice link).<br>
          <strong>Witness Levels:</strong> code, name, mandatory-witness flag (Hold = must witness, Witness = may witness, Surveillance = sample-based, Review = paper-only).</p>

          <h3>6. Dashboard</h3>
          <p>KPIs: ITP records by status, punch items by status, top-5 areas with open punch, ITP completion rate per package, severity distribution chart.</p>

          <h2>ITP review flow (Pattern C)</h2>
          <p>ITP records follow the same shape as Pattern A but use the package's <strong>PMC Technical</strong> + <strong>Client Technical</strong> reviewer slots. Witness Levels (Hold / Witness / Surveillance / Review) drive what each side must do during execution. Override available to ADMIN, PROJECT_OWNER, QC Lead, or Package Owner.</p>
          <div class="flow-chart" v-html="flow('review')"></div>
          <p class="caption">Substitute the diagram's labels: <strong>PMC review</strong> → <strong>PMC Technical</strong>, <strong>Client review</strong> → <strong>Client Technical</strong>. Subservice reviewer slots are <em>not</em> used here — they apply only to the Document review chain.</p>

          <h2>Punch item review flow (Pattern G)</h2>
          <p>Punch items follow a single-reviewer approve / reject by the package contact. Override available to QC Lead or Package Owner.</p>
          <div class="flow-chart" v-html="flow('worker')"></div>
        </section>

        <!-- ═══ Construction ═══ -->
        <section v-if="section === 'construction'">
          <h1>Construction</h1>
          <p class="lead">Work permits with area approvals, hazards / PPE / LOTO lockdown; daily reports with area work logs; workers, subcontractors and certificate management.</p>
          <div class="help-references">
            <span class="help-ref-label">Related</span>
            <a class="help-ref-link" href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>
          </div>

          <h2>Tabs in detail</h2>

          <h3>1. Work Permits</h3>
          <p>The flagship workflow of the Construction module. Permits are area-scoped: each linked area is approved or rejected independently by its declared site supervisors. The permit reaches APPROVED only when <em>every</em> linked area is APPROVED. LOTO records gate approval — the permit cannot transition while any LOTO is still LOCKED. Closing an APPROVED permit cascades remaining LOCKED LOTOs to TO_BE_RELEASED.</p>
          <p><strong>Data collected per permit:</strong> permit number (auto), permit type(s) (e.g. Hot Work, Confined Space, Working at Height — multi-select), vendor / contractor, package, planned start &amp; end (date+time), description / scope, multi-area selection (one row per area, each independently approved by its site supervisors), hazard list (multi-select from the Construction Management hazard library, with auto-suggested PPE per hazard), PPE list (multi-select from PPE library), LOTO list (one row per LOTO point with description, location, and individual lock state), uploaded attachments (method statements, risk assessments, JSAs).</p>
          <div class="flow-chart" v-html="flow('workPermit')"></div>
          <p class="caption">The LOTO rollup keeps looping back to "Supervisors execute LOTO" until every LOTO is DONE or NA — only then does per-area approval open. Override bypasses the area-supervisor check but <em>still respects the LOTO rollup gate</em>.</p>

          <h3>2. LOTOs</h3>
          <p>Lock-Out / Tag-Out records — gates the work-permit approval. Sub-tab on the permit detail or a project-wide list view. Each LOTO is a logical lockable item.</p>
          <p><strong>Data collected per LOTO:</strong> description, location, equipment, lock state (LOCKED, REFUSED, DONE, NA, CANCELLED, RELEASED, TO_BE_RELEASED), lock applied by, lock applied at, release-by (target user), release notes, parent permit. State machine driven by site supervisors; the rollup state of all LOTOs on a permit gates that permit's approval.</p>

          <h3>3. Daily Reports</h3>
          <p>Per-day, per-vendor record of who worked where, capturing utilisation analytics on the construction dashboard.</p>
          <p><strong>Data collected per daily report:</strong> date, vendor, package, weather (temp / conditions / wind), workers present (multi-select from the vendor's approved workers list), areas worked + hours per area, equipment used, free-form note, attachments (photos). Generates one <code>WorkLog</code> entry per (worker × area) combination for the dashboard's utilisation chart.</p>

          <h3>4. Workers</h3>
          <p>Vendor's site personnel — submitted for review and approved before they can be added to a daily report. Single-reviewer pattern: site supervisor approves or rejects. Certificate validity is checked at approval time — expired certs flag the worker on subsequent daily reports.</p>
          <p><strong>Data collected per worker:</strong> first &amp; last name, ID number, role, vendor (or subcontractor), package, certificate rows (one per certificate type: training, medical fitness, induction, plus user-defined types) — each with issue date, expiry date, attached file.</p>
          <div class="flow-chart" v-html="flow('worker')"></div>

          <h3>5. Subcontractors</h3>
          <p>Companies sub-contracted by a vendor on a package. Their workers contribute to the parent vendor's daily reports.</p>
          <p><strong>Data collected:</strong> name, parent vendor, package, contact details, insurance reference + expiry, status (active/inactive), notes.</p>

          <h3>6. Setup (Configuration)</h3>
          <p>Project-level catalogues used by all the above tabs. ADMIN / PROJECT_OWNER / Construction Lead only.</p>
          <p><strong>Data collected:</strong> Permit Types (with default validity duration), Hazard library (code, description, suggested PPE), PPE library (code, description, image), Worker Certificate Types (name, validity in months, mandatory yes/no).</p>

          <h3>7. Dashboard</h3>
          <p>Live KPIs across permits, LOTOs, workers and daily reports. Performance-optimised in 2026-04 (5,000-query render → single GROUP BY).</p>
          <p><strong>Data shown:</strong> active workers (last-7-day moving average), permits by status, LOTOs by state, late-permit count, daily worker-hour bar chart, weekly worker-presence heatmap, expiring certificates list (next 30 days), top-active vendors.</p>
        </section>

        <!-- ═══ Safety ═══ -->
        <section v-if="section === 'safety'">
          <h1>Safety</h1>
          <p class="lead">Safety observations, full investigative incident lifecycle, toolbox talks with acknowledgement, and configurable PDF reporting.</p>
          <div class="help-references">
            <span class="help-ref-label">Related</span>
            <a class="help-ref-link" href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>
          </div>

          <h2>Tabs in detail</h2>

          <h3>1. Observations</h3>
          <p>Field-side notes capturing safe behaviour (positive) or unsafe acts/conditions (negative). Anyone in the project can record. Status: <code>DRAFT → SUBMITTED → REVIEWED</code>.</p>
          <p><strong>Data collected:</strong> author, date/time, package, area, optional unit, category (which carries polarity — positive or negative), severity class (linked to the Severity Classes setup), description, photo attachments (from gallery or live camera capture on tablets), optional <strong>floorplan pin</strong> (x/y coordinates on a floorplan attached to the area), corrective action description, status, reviewer, review comment.</p>

          <h3>2. Incidents</h3>
          <p>Multi-step investigative workflow for actual safety events. Notes are editable at every stage including CLOSED. Five-stage lifecycle gated by different roles: site supervisor approves the investigation plan, package contact confirms action completion, supervisor closes. Re-open requires a written reason captured in the incident's history.</p>
          <p><strong>Data collected:</strong> incident number (auto), date/time of occurrence, package, area, multi-worker selection (workers involved), incident category, cause (linked to Incident Causes setup), severity class, description, witness statements, immediate actions taken, corrective action plan, root-cause analysis text, attached photos / PDFs (stored under <code>uploads/{project}/{package}/Incidents/</code>), status history with actor + timestamp + comment for every transition, <strong>re-open reason</strong> (required field on each re-open).</p>
          <div class="flow-chart" v-html="flow('incident')"></div>

          <h3>3. Toolboxes</h3>
          <p>Toolbox / safety briefings. Lighter three-state flow with a multi-acknowledger gate: on SUBMIT, every site supervisor on the linked areas / packages receives an Acknowledge action point; the record stays SUBMITTED until <em>every</em> required acknowledger has confirmed. Re-open back to DRAFT requires a reason and resets all prior acknowledgements.</p>
          <p><strong>Data collected:</strong> title, category (Toolbox Categories setup), date held, given-by (user OR worker — single dropdown spans both), multi-package, multi-area, multi-worker (attendees), multi-linked observations, multi-linked incidents, free-form notes, attendees signing-off list, attachments stored at <em>project level</em> (under <code>uploads/{project}/Safety Toolboxes/</code> — not package level, since toolboxes can span packages).</p>
          <div class="flow-chart" v-html="flow('toolbox')"></div>

          <h3>4. Setup (Configuration)</h3>
          <p>Project-level catalogues. ADMIN / PROJECT_OWNER / Safety Lead only.</p>
          <p><strong>Severity Classes:</strong> code, name, explicit <code>level</code> field driving a reorder-by-id endpoint, colour (rendered as a yellow→red gradient bar in the UI).<br>
          <strong>Incident Causes:</strong> code, name. The "Other" default is server-protected (cannot be deleted).<br>
          <strong>Toolbox Categories:</strong> code, name, description.</p>

          <h3>5. Reports</h3>
          <p>Background-generated PDF reports — cover page + one-record-per-A4-page layout with photos and floorplan-with-pin location + landscape floorplan summary (optionally split per package). Runs in a daemon thread; status polling on the page. Multi-select filter form lets you scope by date, package, area, severity, status before generating.</p>
          <p><strong>Stored at:</strong> <code>uploads/{PROJECT}/Safety Reports/</code>. Surfaces in the Files master list automatically.</p>

          <h3>6. Floorplan view (per Observations &amp; Incidents)</h3>
          <p>Heatmap-style overlay on the area's floorplan showing every pin clustered by polarity. 5+ pins of the same type/area cluster into a numbered marker. Filterable by package &amp; status; toggleable number labels.</p>
        </section>

        <!-- ═══ Files ═══ -->
        <section v-if="section === 'files'">
          <h1>Files</h1>
          <p class="lead">The master file index across the entire project.</p>
          <div class="help-references">
            <span class="help-ref-label">Related</span>
            <a class="help-ref-link" href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>
          </div>
          <h2>What appears here</h2>
          <ul>
            <li>Every <code>FileAttachment</code> uploaded against any record in any module.</li>
            <li>Floorplans (which live in their own table) are surfaced via a UNION pattern so they appear here without being duplicated.</li>
            <li>Generated PDF reports (Safety / Punch List) appear here as soon as they are ready, sourced directly from the <code>Report</code> table.</li>
          </ul>
          <h2>Filters</h2>
          <p>Filter by package, by category, by step (procurement step-tagged uploads), and by free-text search on filename.</p>
          <h2>Per-project upload size</h2>
          <p>Configurable under Project Setup → Files (1–500 MB, default 100 MB). Floorplans keep their separate 25 MB cap.</p>
        </section>

        <!-- ═══ Settings ═══ -->
        <section v-if="section === 'settings'">
          <h1>Project Setup &amp; Settings</h1>
          <p class="lead">ADMIN / PROJECT_OWNER tools to configure the project.</p>
          <div class="help-references">
            <span class="help-ref-label">Related</span>
            <a class="help-ref-link" href="#" @click.prevent="setSection('permissions')">Permissions &amp; Roles</a>
          </div>
          <h2>Tabs</h2>
          <ul>
            <li><strong>General</strong> — project name, code, currency, date format, default timezone.</li>
            <li><strong>Module Leads</strong> — assign a contact as Module Lead per module (see <a href="#" @click.prevent="setSection('permissions')">Permissions</a>).</li>
            <li><strong>Files</strong> — per-project upload size cap.</li>
            <li><strong>Permissions Overview</strong> — read-only summary of role/lead/package-owner access. Links to this Help Center for full detail.</li>
          </ul>
          <h2>User Management (admin)</h2>
          <p>Create / edit / disable users. Link a user to a contact in any project (or use the impersonation feature for diagnostics — ADMIN-only).</p>
        </section>

      </article>
    </main>
  </div>
</div>
  `,

  data() {
    return {
      section: 'intro',
      groups: {
        overview: [
          { id: 'intro',       label: 'Introduction' },
          { id: 'permissions', label: 'Permissions & Roles' },
        ],
        modules: [
          { id: 'contacts',        label: 'Project Organization' },
          { id: 'my-points',       label: 'My Action Points' },
          { id: 'meetings',        label: 'Meetings' },
          { id: 'schedule',        label: 'Schedule' },
          { id: 'budget',          label: 'Budget' },
          { id: 'risks',           label: 'Risk Register' },
          { id: 'procurement',     label: 'Procurement' },
          { id: 'scope-changes',   label: 'Scope Changes' },
          { id: 'documents',       label: 'Documents' },
          { id: 'quality-control', label: 'Quality Control' },
          { id: 'construction',    label: 'Construction' },
          { id: 'safety',          label: 'Safety' },
          { id: 'files',           label: 'Files' },
          { id: 'settings',        label: 'Settings & Admin' },
        ],
      },
      moduleSummaries: [
        { key: 'contacts',        title: 'Project Organization', summary: 'Contacts, packages, areas/units, subservices and the org chart — the directory of everyone and everything in the project.' },
        { key: 'my-points',       title: 'My Action Points',     summary: 'Personal inbox of every pending review, acknowledgement, action point and rejected record needing your attention.' },
        { key: 'meetings',        title: 'Meetings',              summary: 'Meeting types & instances, action points, weekly view, dashboard, and PDF/Excel minute exports.' },
        { key: 'schedule',        title: 'Schedule',              summary: 'Tasks, baselines, the project Gantt and per-package progress reports with PMC + Client review.' },
        { key: 'budget',          title: 'Budget',                summary: 'Per-package baselines, transfers, orders, invoices and scope-change impact across 9 columns.' },
        { key: 'risks',           title: 'Risk Register',         summary: 'Project-wide risks with probability × impact scoring and integrated mitigation tracking.' },
        { key: 'procurement',     title: 'Procurement',           summary: 'RFQ planning, bidder portal, the live register with step weights, and the awarding decision.' },
        { key: 'scope-changes',   title: 'Scope Changes',         summary: 'Variation orders / change requests with PMC + Client review and direct cost impact in Budget.' },
        { key: 'documents',       title: 'Documents',             summary: 'Versioned uploads with multi-reviewer approval chains and distribution receipts.' },
        { key: 'quality-control', title: 'Quality Control',       summary: 'ITP records (PMC Technical + Client Technical review, witness levels) and the project punch list.' },
        { key: 'construction',    title: 'Construction',          summary: 'Work permits with area approvals, hazards/PPE/LOTO; daily reports; workers and subcontractors with certificates.' },
        { key: 'safety',          title: 'Safety',                summary: 'Observations, incidents (full investigative lifecycle) and toolbox talks with PDF reporting.' },
        { key: 'files',           title: 'Files',                 summary: 'Master file index across the project — attachments, floorplans and ready PDF reports unified in one list.' },
        { key: 'settings',        title: 'Settings & Admin',      summary: 'Project setup, module leads, file size limits, user management and the read-only permissions overview.' },
      ],

      // ── Flowchart specs (rendered via this.flow(name)) ─────────────────────
      flowSpecs: {

        // ── Pattern: PMC + Client review (Documents / Scope Changes / Invoices / ITP-like) ──
        review: {
          w: 1180, h: 460,
          nodes: [
            { id:'start',    x:510, y:14,  w:160, h:38, type:'start',    label:'DRAFT' },
            { id:'submit',   x:510, y:90,  w:160, h:38, type:'process',  label:'Submit' },
            { id:'pmc',      x:495, y:160, w:190, h:70, type:'decision', label:'PMC review' },
            { id:'client',   x:495, y:262, w:190, h:70, type:'decision', label:'Client review' },
            { id:'approved', x:510, y:362, w:160, h:44, type:'end',      label:'APPROVED' },
            { id:'reject',   x:830, y:160, w:170, h:38, type:'reject',   label:'REJECTED' },
            { id:'amend',    x:830, y:266, w:170, h:38, type:'process',  label:'Author amends' },
            { id:'over',     x:30,  y:90,  w:230, h:38, type:'override', label:'Project Owner / Lead / Pkg Owner' },
            { id:'overdec',  x:60,  y:160, w:170, h:70, type:'decision', label:'Override?' },
            { id:'overapp',  x:30,  y:266, w:110, h:38, type:'end',      label:'APPROVED' },
            { id:'overrej',  x:155, y:266, w:110, h:38, type:'cancel',   label:'REJECTED' },
          ],
          edges: [
            { from:'start',   to:'submit',   fromSide:'b', toSide:'t' },
            { from:'submit',  to:'pmc',      fromSide:'b', toSide:'t' },
            { from:'pmc',     to:'client',   fromSide:'b', toSide:'t', label:'approve' },
            { from:'client',  to:'approved', fromSide:'b', toSide:'t', label:'approve' },
            { from:'pmc',     to:'reject',   fromSide:'r', toSide:'l', label:'reject' },
            { from:'client',  to:'reject',   points:[[685,297],[800,297],[800,179],[830,179]], label:'reject' },
            { from:'reject',  to:'amend',    fromSide:'b', toSide:'t' },
            { from:'amend',   to:'submit',   points:[[1000,285],[1050,285],[1050,109],[670,109]], label:'resubmit' },
            { from:'submit',  to:'over',     points:[[510,109],[260,109]], dashed:true, label:'override' },
            { from:'over',    to:'overdec',  fromSide:'b', toSide:'t' },
            { from:'overdec', to:'overapp',  points:[[145,230],[85,260],[85,266]], label:'approve' },
            { from:'overdec', to:'overrej',  points:[[145,230],[210,260],[210,266]], label:'reject' },
          ],
        },

        // ── Pattern: Progress Reports — multi-entry review ──────────────────
        progressReport: {
          w: 1120, h: 400,
          nodes: [
            { id:'start',    x:480, y:14,  w:160, h:38, type:'start',    label:'DRAFT entries' },
            { id:'submit',   x:480, y:90,  w:160, h:38, type:'process',  label:'Submit PR' },
            { id:'review',   x:455, y:160, w:210, h:70, type:'decision', label:'Per-entry PMC + Client' },
            { id:'approved', x:480, y:262, w:160, h:44, type:'end',      label:'APPROVED' },
            { id:'reject',   x:790, y:178, w:170, h:38, type:'reject',   label:'REJECTED' },
            { id:'amend',    x:790, y:240, w:170, h:38, type:'process',  label:'Author resubmits' },
            { id:'over',     x:30,  y:90,  w:230, h:38, type:'override', label:'PO / Schedule Lead / Pkg Owner' },
            { id:'overdec',  x:60,  y:160, w:170, h:70, type:'decision', label:'Override all' },
            { id:'overapp',  x:30,  y:262, w:110, h:38, type:'end',      label:'APPROVED' },
            { id:'overrej',  x:155, y:262, w:110, h:38, type:'cancel',   label:'REJECTED' },
          ],
          edges: [
            { from:'start',   to:'submit',   fromSide:'b', toSide:'t' },
            { from:'submit',  to:'review',   fromSide:'b', toSide:'t' },
            { from:'review',  to:'approved', fromSide:'b', toSide:'t', label:'all approved' },
            { from:'review',  to:'reject',   points:[[665,195],[790,197]], label:'any rejected' },
            { from:'reject',  to:'amend',    fromSide:'b', toSide:'t' },
            { from:'amend',   to:'submit',   points:[[960,259],[1010,259],[1010,109],[640,109]], label:'resubmit' },
            { from:'submit',  to:'over',     points:[[480,109],[260,109]], dashed:true, label:'override' },
            { from:'over',    to:'overdec',  fromSide:'b', toSide:'t' },
            { from:'overdec', to:'overapp',  points:[[145,230],[85,256],[85,262]], label:'approve' },
            { from:'overdec', to:'overrej',  points:[[145,230],[210,256],[210,262]], label:'reject' },
          ],
        },

        // ── Pattern: Work Permit + LOTO interlock ──────────────────────────
        workPermit: {
          w: 1020, h: 700,
          nodes: [
            { id:'start',    x:420, y:14,   w:180, h:38, type:'start',    label:'Vendor drafts permit' },
            { id:'submit',   x:420, y:76,   w:180, h:38, type:'process',  label:'Submit permit' },
            { id:'loto',     x:410, y:138,  w:200, h:64, type:'decision', label:'LOTO required?' },
            { id:'lock',     x:420, y:226,  w:180, h:38, type:'process',  label:'LOTOs raised + LOCKED' },
            { id:'exec',     x:420, y:284,  w:180, h:38, type:'process',  label:'Supervisors execute LOTO' },
            { id:'rollup',   x:410, y:344,  w:200, h:64, type:'decision', label:'Rollup = DONE / NA' },
            { id:'approval', x:410, y:432,  w:200, h:64, type:'decision', label:'Per-area approval\nby supervisors' },
            { id:'approved', x:420, y:530,  w:180, h:42, type:'end',      label:'APPROVED' },
            { id:'close',    x:420, y:594,  w:180, h:38, type:'process',  label:'Supervisor closes' },
            { id:'cascade',  x:400, y:652,  w:220, h:38, type:'end',      label:'CLOSED — LOTOs → TO_BE_RELEASED' },
            { id:'reject',   x:730, y:432,  w:180, h:38, type:'reject',   label:'REJECTED' },
            { id:'edit',     x:730, y:498,  w:180, h:38, type:'process',  label:'Vendor edits & resubmits' },
            { id:'over',     x:30,  y:138,  w:180, h:64, type:'override', label:'PO / Construction Lead /\nPackage Owner' },
            { id:'overdec',  x:30,  y:240,  w:180, h:64, type:'decision', label:'Override?' },
            { id:'overapp',  x:8,   y:336,  w:96,  h:38, type:'end',      label:'APPROVED' },
            { id:'overrej',  x:128, y:336,  w:96,  h:38, type:'cancel',   label:'REJECTED' },
          ],
          edges: [
            { from:'start',    to:'submit',   fromSide:'b', toSide:'t' },
            { from:'submit',   to:'loto',     fromSide:'b', toSide:'t' },
            { from:'loto',     to:'lock',     fromSide:'b', toSide:'t', label:'required' },
            { from:'loto',     to:'rollup',   points:[[610,170],[680,170],[680,376],[610,376]], label:'done / NA' },
            { from:'lock',     to:'exec',     fromSide:'b', toSide:'t' },
            { from:'exec',     to:'rollup',   fromSide:'b', toSide:'t' },
            { from:'rollup',   to:'approval', fromSide:'b', toSide:'t', label:'yes' },
            { from:'rollup',   to:'exec',     points:[[410,376],[340,376],[340,302],[420,302]], label:'no — keep working' },
            { from:'approval', to:'approved', fromSide:'b', toSide:'t', label:'all approved' },
            { from:'approval', to:'reject',   points:[[610,464],[730,450]], label:'any rejected' },
            { from:'reject',   to:'edit',     fromSide:'b', toSide:'t' },
            { from:'edit',     to:'submit',   points:[[910,517],[940,517],[940,94],[600,94]], label:'resubmit' },
            { from:'approved', to:'close',    fromSide:'b', toSide:'t' },
            { from:'close',    to:'cascade',  fromSide:'b', toSide:'t' },
            { from:'submit',   to:'over',     points:[[420,94],[210,94],[210,138]], dashed:true, label:'override' },
            { from:'over',     to:'overdec',  fromSide:'b', toSide:'t' },
            { from:'overdec',  to:'overapp',  points:[[120,304],[55,328],[55,336]], label:'approve' },
            { from:'overdec',  to:'overrej',  points:[[120,304],[176,328],[176,336]], label:'reject' },
          ],
        },

        // ── Pattern: Safety Incident lifecycle ──────────────────────────────
        incident: {
          w: 1180, h: 360,
          nodes: [
            { id:'start',    x:30,   y:140, w:160, h:46, type:'start',   label:'DRAFT' },
            { id:'invest',   x:240,  y:140, w:180, h:46, type:'process', label:'UNDER\nINVESTIGATION' },
            { id:'action',   x:470,  y:140, w:180, h:46, type:'process', label:'ACTION IN\nPROGRESS' },
            { id:'pending',  x:700,  y:140, w:180, h:46, type:'process', label:'PENDING\nREVIEW' },
            { id:'closed',   x:930,  y:140, w:180, h:46, type:'end',     label:'CLOSED' },
            { id:'over',     x:240,  y:30,  w:300, h:38, type:'override',label:'Site supervisor (or PO / Safety Lead / Pkg Owner)' },
            { id:'pkgctc',   x:550,  y:248, w:300, h:38, type:'process', label:'Package contact confirms action done' },
            { id:'sup',      x:240,  y:248, w:280, h:38, type:'process', label:'Supervisor closes the incident' },
          ],
          edges: [
            { from:'start',   to:'invest',  fromSide:'r', toSide:'l' },
            { from:'invest',  to:'action',  fromSide:'r', toSide:'l' },
            { from:'action',  to:'pending', fromSide:'r', toSide:'l' },
            { from:'pending', to:'closed',  fromSide:'r', toSide:'l' },
            { from:'over',    to:'invest',  points:[[390,68],[330,120],[330,140]], dashed:true, label:'approves plan' },
            { from:'pkgctc',  to:'action',  points:[[700,248],[700,210],[560,210],[560,186]], dashed:true, label:'confirms' },
            { from:'sup',     to:'pending', points:[[380,248],[380,212],[790,212],[790,186]], dashed:true, label:'closes' },
            { from:'closed',  to:'start',   points:[[1020,186],[1020,330],[110,330],[110,186]], dashed:true, label:'Re-open with reason' },
          ],
        },

        // ── Pattern: Toolbox (Acknowledge) ──────────────────────────────────
        toolbox: {
          w: 1080, h: 240,
          nodes: [
            { id:'start',  x:80,  y:90,  w:170, h:46, type:'start',   label:'DRAFT' },
            { id:'subm',   x:430, y:90,  w:200, h:46, type:'process', label:'SUBMITTED' },
            { id:'recv',   x:830, y:90,  w:170, h:46, type:'end',     label:'RECEIVED' },
          ],
          edges: [
            { from:'start', to:'subm',  fromSide:'r', toSide:'l' },
            { from:'subm',  to:'recv',  fromSide:'r', toSide:'l', label:'all linked supervisors acknowledge' },
            { from:'subm',  to:'start', points:[[530,136],[530,200],[165,200],[165,136]], dashed:true, label:'Re-open with reason' },
          ],
        },

        // ── Pattern: Worker review ──────────────────────────────────────────
        worker: {
          w: 1140, h: 380,
          nodes: [
            { id:'start',    x:490, y:14,  w:170, h:38, type:'start',    label:'DRAFT (Vendor)' },
            { id:'submit',   x:495, y:90,  w:160, h:38, type:'process',  label:'Submit' },
            { id:'review',   x:475, y:160, w:200, h:70, type:'decision', label:'Site supervisor' },
            { id:'approved', x:495, y:262, w:160, h:44, type:'end',      label:'APPROVED' },
            { id:'reject',   x:800, y:178, w:170, h:38, type:'reject',   label:'REJECTED' },
            { id:'amend',    x:800, y:240, w:170, h:38, type:'process',  label:'Vendor amends' },
            { id:'over',     x:30,  y:90,  w:240, h:38, type:'override', label:'PO / Construction Lead / Pkg Owner' },
            { id:'overdec',  x:65,  y:160, w:170, h:70, type:'decision', label:'Override?' },
            { id:'overapp',  x:30,  y:262, w:110, h:38, type:'end',      label:'APPROVED' },
            { id:'overrej',  x:160, y:262, w:110, h:38, type:'cancel',   label:'REJECTED' },
          ],
          edges: [
            { from:'start',   to:'submit',   fromSide:'b', toSide:'t' },
            { from:'submit',  to:'review',   fromSide:'b', toSide:'t' },
            { from:'review',  to:'approved', fromSide:'b', toSide:'t', label:'approve' },
            { from:'review',  to:'reject',   points:[[675,195],[800,197]], label:'reject' },
            { from:'reject',  to:'amend',    fromSide:'b', toSide:'t' },
            { from:'amend',   to:'submit',   points:[[970,259],[1020,259],[1020,109],[655,109]], label:'resubmit' },
            { from:'submit',  to:'over',     points:[[495,109],[270,109]], dashed:true, label:'override' },
            { from:'over',    to:'overdec',  fromSide:'b', toSide:'t' },
            { from:'overdec', to:'overapp',  points:[[150,230],[85,256],[85,262]], label:'approve' },
            { from:'overdec', to:'overrej',  points:[[150,230],[215,256],[215,262]], label:'reject' },
          ],
        },

        // ── Pattern: Procurement (Bidder submittal + step advancement + Award) ──
        procurementAward: {
          w: 1300, h: 600,
          nodes: [
            { id:'plan',     x:30,   y:30,  w:220, h:46, type:'start',    label:'Plan: bidders\ninvited per package' },
            { id:'subm',     x:300,  y:30,  w:240, h:46, type:'process',  label:'Bidder uploads submittal\nat current step' },
            { id:'recv',     x:590,  y:30,  w:240, h:46, type:'process',  label:'Project user reviews\nand "receipts" submittal' },
            { id:'eval',     x:880,  y:14,  w:240, h:78, type:'decision', label:'Compliance OK?' },
            { id:'advance',  x:880,  y:140, w:240, h:46, type:'process',  label:'Advance entry to next step' },
            { id:'excluded', x:590,  y:140, w:240, h:46, type:'cancel',   label:'EXCLUDED (non-compliant)' },
            { id:'allSteps', x:880,  y:222, w:240, h:78, type:'decision', label:'All steps done?' },
            { id:'await',    x:590,  y:236, w:240, h:46, type:'process',  label:'Awaiting next step submittal' },
            { id:'compete',  x:880,  y:340, w:240, h:46, type:'process',  label:'Bidder reaches final step' },
            { id:'award',    x:880,  y:410, w:240, h:78, type:'decision', label:'Award decision\n(PO / Lead / Pkg Owner)' },
            { id:'awarded',  x:880,  y:520, w:240, h:46, type:'end',      label:'AWARDED' },
            { id:'others',   x:590,  y:520, w:240, h:46, type:'cancel',   label:'Other bidders EXCLUDED' },
            { id:'order',    x:300,  y:520, w:240, h:46, type:'end',      label:'Order COMMITTED in Budget' },
            { id:'rejBidder',x:300,  y:140, w:240, h:46, type:'reject',   label:'Bidder withdraws → EXCLUDED' },
          ],
          edges: [
            { from:'plan',    to:'subm',    fromSide:'r', toSide:'l' },
            { from:'subm',    to:'recv',    fromSide:'r', toSide:'l' },
            { from:'recv',    to:'eval',    fromSide:'r', toSide:'l' },
            { from:'eval',    to:'advance', fromSide:'b', toSide:'t', label:'pass' },
            { from:'eval',    to:'excluded',points:[[880,53],[860,53],[860,163],[830,163]], label:'fail' },
            { from:'advance', to:'allSteps',fromSide:'b', toSide:'t' },
            { from:'allSteps',to:'await',   fromSide:'l', toSide:'r', label:'no' },
            { from:'await',   to:'subm',    points:[[590,259],[565,259],[565,80],[420,80]], label:'next round' },
            { from:'allSteps',to:'compete', fromSide:'b', toSide:'t', label:'yes' },
            { from:'compete', to:'award',   fromSide:'b', toSide:'t' },
            { from:'award',   to:'awarded', fromSide:'b', toSide:'t', label:'awarded' },
            { from:'awarded', to:'others',  fromSide:'l', toSide:'r' },
            { from:'awarded', to:'order',   points:[[880,543],[540,543]], dashed:true, label:'forced create-order' },
            { from:'subm',    to:'rejBidder',points:[[420,76],[420,140]], label:'opt out' },
          ],
        },

        // ── NEW: Document review chain — full approval flow with optional reviewers ──
        // Documents have a richer review chain than Scope Changes / Invoices: up to 4
        // optional reviewers (Area Manager, Unit Manager, Subservice PMC, Subservice
        // Client) can run in sequence BEFORE the mandatory PMC + Client review. Each
        // optional step is included only when a reviewer is configured for that document.
        // The flow has TWO end states: APPROVED and APPROVED WITH COMMENTS — both
        // trigger distribution (see Pattern I).
        documentReview: {
          w: 1280, h: 680,
          nodes: [
            { id:'start',     x:550, y:14,  w:200, h:38, type:'start',    label:'DRAFT' },
            { id:'submit',    x:550, y:80,  w:200, h:38, type:'process',  label:'Submit for review' },
            { id:'area',      x:530, y:148, w:240, h:38, type:'process',  label:'Area Manager (if assigned)' },
            { id:'unit',      x:530, y:200, w:240, h:38, type:'process',  label:'Unit Manager (if assigned)' },
            { id:'subPMC',    x:530, y:252, w:240, h:38, type:'process',  label:'Subservice PMC (if assigned)' },
            { id:'subClient', x:530, y:304, w:240, h:38, type:'process',  label:'Subservice Client (if assigned)' },
            { id:'pmc',       x:550, y:372, w:200, h:70, type:'decision', label:'PMC review' },
            { id:'client',    x:550, y:464, w:200, h:70, type:'decision', label:'Client review' },
            { id:'approved',  x:430, y:592, w:200, h:44, type:'end',      label:'APPROVED' },
            { id:'approvedC', x:660, y:592, w:280, h:44, type:'end',      label:'APPROVED w/ COMMENTS' },
            { id:'reject',    x:920, y:388, w:180, h:38, type:'reject',   label:'REJECTED' },
            { id:'amend',     x:920, y:480, w:180, h:38, type:'process',  label:'Author amends' },
            { id:'over',      x:30,  y:80,  w:240, h:38, type:'override', label:'Project Owner / Lead / Pkg Owner' },
            { id:'overdec',   x:65,  y:148, w:170, h:70, type:'decision', label:'Override?' },
            { id:'overapp',   x:30,  y:260, w:110, h:38, type:'end',      label:'APPROVED' },
            { id:'overrej',   x:160, y:260, w:110, h:38, type:'cancel',   label:'REJECTED' },
          ],
          edges: [
            { from:'start',     to:'submit',    fromSide:'b', toSide:'t' },
            { from:'submit',    to:'area',      fromSide:'b', toSide:'t' },
            { from:'area',      to:'unit',      fromSide:'b', toSide:'t' },
            { from:'unit',      to:'subPMC',    fromSide:'b', toSide:'t' },
            { from:'subPMC',    to:'subClient', fromSide:'b', toSide:'t' },
            { from:'subClient', to:'pmc',       fromSide:'b', toSide:'t' },
            { from:'pmc',       to:'client',    fromSide:'b', toSide:'t', label:'approve' },
            { from:'client',    to:'approved',  points:[[650,534],[530,592]], label:'approve' },
            { from:'client',    to:'approvedC', points:[[650,534],[800,592]], label:'approve w/ comments' },
            { from:'pmc',       to:'reject',    fromSide:'r', toSide:'l', label:'reject' },
            { from:'client',    to:'reject',    points:[[750,499],[890,499],[890,407],[920,407]], label:'reject' },
            { from:'reject',    to:'amend',     fromSide:'b', toSide:'t' },
            { from:'amend',     to:'submit',    points:[[1100,499],[1140,499],[1140,99],[750,99]], label:'resubmit' },
            { from:'submit',    to:'over',      points:[[550,99],[270,99]], dashed:true, label:'override' },
            { from:'over',      to:'overdec',   fromSide:'b', toSide:'t' },
            { from:'overdec',   to:'overapp',   points:[[150,218],[85,254],[85,260]], label:'approve' },
            { from:'overdec',   to:'overrej',   points:[[150,218],[215,254],[215,260]], label:'reject' },
          ],
        },

        // ── Document distribution + acknowledge receipt ────────────────────
        // Distribution triggers on EITHER approval terminal state — both
        // "APPROVED" and "APPROVED WITH COMMENTS" feed into the distribution chain.
        documentDistribute: {
          w: 1280, h: 460,
          nodes: [
            { id:'approved',  x:30,   y:14,   w:200, h:42, type:'end',     label:'Document APPROVED' },
            { id:'approvedC', x:30,   y:74,   w:200, h:42, type:'end',     label:'APPROVED w/ COMMENTS' },
            { id:'merge',     x:280,  y:48,   w:60,  h:60, type:'decision',label:'Either' },
            { id:'distList',  x:380,  y:54,   w:200, h:46, type:'process', label:'Build distribution\nrecipient list' },
            { id:'send',      x:620,  y:54,   w:220, h:46, type:'process', label:'Send: each recipient\ngets a Receipt' },
            { id:'inbox',     x:880,  y:54,   w:240, h:46, type:'process', label:'Receipt appears in\nMy Action Points' },
            { id:'open',      x:880,  y:144,  w:240, h:46, type:'process', label:'Recipient opens the document' },
            { id:'ack',       x:880,  y:226,  w:240, h:78, type:'decision',label:'Acknowledge?' },
            { id:'received',  x:880,  y:344,  w:240, h:46, type:'end',     label:'RECEIVED' },
            { id:'pending',   x:570,  y:244,  w:240, h:46, type:'cancel',  label:'Stays PENDING\non inbox' },
            { id:'rev',       x:30,   y:244,  w:380, h:46, type:'process', label:'Author launches NEW VERSION → distribution resets' },
          ],
          edges: [
            { from:'approved', to:'merge',    points:[[230,35],[280,68]] },
            { from:'approvedC',to:'merge',    points:[[230,95],[280,88]] },
            { from:'merge',    to:'distList', fromSide:'r', toSide:'l' },
            { from:'distList', to:'send',     fromSide:'r', toSide:'l' },
            { from:'send',     to:'inbox',    fromSide:'r', toSide:'l' },
            { from:'inbox',    to:'open',     fromSide:'b', toSide:'t' },
            { from:'open',     to:'ack',      fromSide:'b', toSide:'t' },
            { from:'ack',      to:'received', fromSide:'b', toSide:'t', label:'yes — confirm read' },
            { from:'ack',      to:'pending',  fromSide:'l', toSide:'r', label:'not yet' },
            { from:'received', to:'rev',      points:[[1000,390],[220,390],[220,290]], dashed:true, label:'new version → reset' },
          ],
        },

      },
    };
  },

  mounted() {
    // Deep-link target: the parent app may set window._pendingHelpSection
    // when navigating from a CTA elsewhere (e.g. Settings → Permissions).
    const all = [...this.groups.overview, ...this.groups.modules].map(s => s.id);
    const stash = window._pendingHelpSection;
    if (stash && all.includes(stash)) {
      this.section = stash;
    }
    if (stash !== undefined) delete window._pendingHelpSection;
  },

  methods: {
    setSection(id, anchor) {
      this.section = id;
      this.$nextTick(() => {
        const content = this.$el && this.$el.querySelector('.help-content');
        if (!content) return;
        if (anchor) {
          const target = this.$el.querySelector('#' + anchor);
          if (target) {
            const cRect = content.getBoundingClientRect();
            const tRect = target.getBoundingClientRect();
            content.scrollTop += tRect.top - cRect.top - 16;
            return;
          }
        }
        content.scrollTop = 0;
      });
    },

    // ── ISO 5807-style flowchart renderer ─────────────────────────────────────
    // Takes a spec key from this.flowSpecs and returns an SVG string.
    // Spec shape:
    //   { w, h, nodes: [{id, x, y, w, h, type, label}], edges: [{from, to, label, dashed, points, fromSide, toSide, labelAt}] }
    // Node types: 'start' (rounded navy), 'process' (rounded white), 'decision' (diamond),
    //             'end' (rounded green), 'cancel' (rounded red), 'reject' (rect red),
    //             'override' (rounded amber), 'doc' (parallelogram-like)
    // Edge sides: 't','b','l','r' for top/bottom/left/right anchor on the node.
    // points: explicit polyline waypoints [[x,y],...]; if fromSide/toSide also set,
    //         the helper prepends/appends the side anchor points.
    flow(name) {
      const spec = this.flowSpecs[name];
      if (!spec) return '<p style="color:#dc2626">Missing flowchart: ' + name + '</p>';
      const byId = {};
      spec.nodes.forEach(n => { byId[n.id] = n; });
      const palette = {
        start:    { f: '#1B4F8C', s: '#1B4F8C', t: '#ffffff' },
        process:  { f: '#ffffff', s: '#1B4F8C', t: '#1B4F8C' },
        decision: { f: '#F0F9FF', s: '#0369A1', t: '#0369A1' },
        end:      { f: '#ECFDF5', s: '#059669', t: '#047857' },
        cancel:   { f: '#FEF2F2', s: '#DC2626', t: '#B91C1C' },
        reject:   { f: '#FEF2F2', s: '#DC2626', t: '#B91C1C' },
        override: { f: '#FEF3C7', s: '#D97706', t: '#92400E' },
        doc:      { f: '#FFFFFF', s: '#1B4F8C', t: '#1B4F8C' },
      };
      const sidePt = (n, side) => {
        const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
        if (side === 't') return [cx, n.y];
        if (side === 'b') return [cx, n.y + n.h];
        if (side === 'l') return [n.x, cy];
        if (side === 'r') return [n.x + n.w, cy];
        return [cx, cy];
      };
      const esc = s => String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

      const defs = '<defs>'
        + '<marker id="fcArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
        +   '<path d="M0,0 L10,5 L0,10 z" fill="#1B4F8C"/></marker>'
        + '<marker id="fcArrAlt" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
        +   '<path d="M0,0 L10,5 L0,10 z" fill="#D97706"/></marker>'
        + '</defs>';

      // Edges first (under nodes)
      let edgesSvg = '';
      for (const e of spec.edges) {
        const a = byId[e.from], b = byId[e.to];
        if (!a || !b) continue;
        let pts;
        if (e.points && e.points.length) {
          pts = e.points.slice();
          if (e.fromSide) pts.unshift(sidePt(a, e.fromSide));
          if (e.toSide)   pts.push(sidePt(b, e.toSide));
        } else {
          pts = [sidePt(a, e.fromSide || 'b'), sidePt(b, e.toSide || 't')];
        }
        const d = 'M ' + pts.map(p => p[0] + ' ' + p[1]).join(' L ');
        const stroke = e.dashed ? '#D97706' : '#1B4F8C';
        const dash = e.dashed ? ' stroke-dasharray="6,4"' : '';
        const marker = e.dashed ? 'url(#fcArrAlt)' : 'url(#fcArr)';
        edgesSvg += '<path d="' + d + '" stroke="' + stroke + '" fill="none" stroke-width="1.5"' + dash + ' marker-end="' + marker + '"/>';
        if (e.label) {
          let lx, ly;
          if (e.labelAt) { [lx, ly] = e.labelAt; }
          else {
            // Midpoint along path (longest-segment midpoint as a simple approximation)
            let totalLen = 0;
            const segs = [];
            for (let i = 1; i < pts.length; i++) {
              const dx = pts[i][0] - pts[i-1][0];
              const dy = pts[i][1] - pts[i-1][1];
              const len = Math.hypot(dx, dy);
              segs.push({ len, x1: pts[i-1][0], y1: pts[i-1][1], x2: pts[i][0], y2: pts[i][1] });
              totalLen += len;
            }
            const target = totalLen / 2;
            let acc = 0;
            for (const seg of segs) {
              if (acc + seg.len >= target) {
                const r = (target - acc) / seg.len;
                lx = seg.x1 + (seg.x2 - seg.x1) * r;
                ly = seg.y1 + (seg.y2 - seg.y1) * r;
                break;
              }
              acc += seg.len;
            }
          }
          const tw = e.label.length * 5.6 + 12;
          edgesSvg += '<g><rect x="' + (lx - tw/2) + '" y="' + (ly - 8) + '" width="' + tw + '" height="14" rx="3" fill="#FAFBFC" opacity="0.95"/>'
            + '<text x="' + lx + '" y="' + (ly + 3) + '" text-anchor="middle" font-size="10.5" fill="#374151" font-weight="600">' + esc(e.label) + '</text></g>';
        }
      }

      // Nodes
      let nodesSvg = '';
      for (const n of spec.nodes) {
        const c = palette[n.type] || palette.process;
        const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
        let shape;
        if (n.type === 'decision') {
          const pts = cx + ',' + n.y + ' ' + (n.x + n.w) + ',' + cy + ' ' + cx + ',' + (n.y + n.h) + ' ' + n.x + ',' + cy;
          shape = '<polygon points="' + pts + '" fill="' + c.f + '" stroke="' + c.s + '" stroke-width="1.5"/>';
        } else if (n.type === 'start' || n.type === 'end' || n.type === 'cancel') {
          const r = n.h / 2;
          shape = '<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="' + r + '" ry="' + r + '" fill="' + c.f + '" stroke="' + c.s + '" stroke-width="1.5"/>';
        } else if (n.type === 'doc') {
          // Document shape: rectangle with wavy bottom
          const w = n.w, h = n.h;
          const x = n.x, y = n.y;
          shape = '<path d="M ' + x + ' ' + y + ' L ' + (x+w) + ' ' + y + ' L ' + (x+w) + ' ' + (y+h-6)
                + ' Q ' + (x+w*0.75) + ' ' + (y+h+4) + ' ' + (x+w*0.5) + ' ' + (y+h-4)
                + ' Q ' + (x+w*0.25) + ' ' + (y+h-12) + ' ' + x + ' ' + (y+h-4) + ' Z" '
                + 'fill="' + c.f + '" stroke="' + c.s + '" stroke-width="1.5"/>';
        } else {
          shape = '<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="6" ry="6" fill="' + c.f + '" stroke="' + c.s + '" stroke-width="1.5"/>';
        }
        const lines = String(n.label || '').split('\n');
        const lh = 13;
        const startY = cy - (lines.length - 1) * lh / 2 + 4;
        const text = lines.map((line, i) =>
          '<text x="' + cx + '" y="' + (startY + i * lh) + '" text-anchor="middle" font-size="11" font-weight="600" fill="' + c.t + '">' + esc(line) + '</text>'
        ).join('');
        nodesSvg += shape + text;
      }

      return '<svg viewBox="0 0 ' + spec.w + ' ' + spec.h + '" xmlns="http://www.w3.org/2000/svg" class="flowchart-svg" preserveAspectRatio="xMidYMid meet">' + defs + edgesSvg + nodesSvg + '</svg>';
    },
  },
});
