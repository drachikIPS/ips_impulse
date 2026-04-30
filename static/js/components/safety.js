// ─────────────────────────────────────────────────────────────────────────────
// Safety module
//   • Observations tab: full DRAFT → SUBMITTED → RECEIVED → CLOSED workflow
//     with right-pane attachments (punch-list pattern), history log, and
//     cascading package → subcontractor/worker dropdowns.
//   • Setup tab (project owners only): Safety Observation Categories.
// ─────────────────────────────────────────────────────────────────────────────
app.component('safety-module', {
  props: ['currentUser', 'initialTab', 'pendingOpen'],
  emits: ['subtab-change', 'record-change'],

  data() {
    return {
      activeTab: 'observations',   // 'observations' | 'setup'
      setupSubtab: 'categories',

      // Excel-export button states (one per safety list)
      xlsxExportingObs: false,
      xlsxExportingInc: false,
      xlsxExportingTbx: false,

      // Reference data
      categories: [],
      packages: [],
      areas: [],
      floorplans: [],               // [{id, name, image_url, area_ids, ...}]
      floorplanBlobs: {},           // id → object URL (cached thumbnail)
      floorplanDims:  {},           // id → { w, h } from naturalWidth/Height
      subcontractorsByPackage: {},  // { [pkgId]: [ {id, company}, ... ] }
      workersByPackage: {},         // { [pkgId]: [ {id, name}, ... ] }

      // Observations list + filters
      observations: [],
      obsLoading: false,
      obsFilterStatus: '',
      obsFilterPackage: '',
      obsFilterArea: '',
      obsFilterCategory: '',

      // Detail modal
      showObsModal: false,
      obsMode: 'view',              // 'new' | 'view' | 'edit'
      obsCurrent: null,             // the full observation record
      obsForm: {
        package_id: null, area_id: null, category_id: null,
        details: '', subcontractor_id: null, worker_id: null,
        remediation_request: '',
        floorplan_id: null, floorplan_x: null, floorplan_y: null,
        updated_at: null,
      },
      pinTouched: false,            // true if user explicitly set/cleared the pin in this edit
      showPinPicker: false,
      obsError: '',
      obsSaving: false,

      // Workflow inline prompts (comment / reason)
      workflowComment: '',
      workflowMode: null,           // null | 'acknowledge' | 'close' | 'reopen'
      workflowSaving: false,

      // History modal (separate overlay — matches the ITP history pattern)
      showHistoryModal: false,

      // PDF export modal + reports list (background-generated)
      recentReports: [],
      reportsLoading: false,
      reportsTimer: null,
      showExportModal: false,
      exportFilters: {
        package_ids: [],
        area_ids: [],
        statuses: [],
        group_by: 'package_area',
        per_package_plans: false,
      },
      exporting: false,
      exportError: '',

      // Heatmap (Floorplan view) tab
      heatPolarity: 'ALL',     // ALL | POSITIVE | NEGATIVE
      heatStatus: 'ACTIVE',    // ALL | ACTIVE (non-closed) | CLOSED
      heatPackage: '',         // '' | package id
      heatExpanded: null,      // { fpId, idx } when a cluster is expanded
      showPinNumbers: true,    // toggle pin number badges
      expandAll: false,        // expand every floorplan card on the heatmap
      expandedFloorplans: {},  // { [fpId]: true } per-card expansion overrides

      // Setup form (categories)
      setupEditing: null,
      setupForm: { name: '', description: '', polarity: 'NEGATIVE' },
      setupSaving: false,
      setupError: '',

      // Severity classes (Setup → Severity Classes sub-tab)
      severityClasses: [],
      severityEditing: null,                 // { item } when modal open (null otherwise)
      severityForm: { name: '', description: '', updated_at: null },
      severitySaving: false,
      severityError: '',

      // Incident causes (Setup → Incident Causes sub-tab)
      incidentCauses: [],
      incidentCauseEditing: null,            // { item } when modal open (null otherwise)
      incidentCauseForm: { name: '', description: '', updated_at: null },
      incidentCauseSaving: false,
      incidentCauseError: '',

      // Toolbox categories (Setup → Toolbox Categories sub-tab)
      toolboxCategories: [],
      toolboxCategoryEditing: null,
      toolboxCategoryForm: { name: '', description: '', updated_at: null },
      toolboxCategorySaving: false,
      toolboxCategoryError: '',

      // Incidents tab
      incidents: [],
      incLoading: false,
      incFilterStatus: '',
      incFilterPackage: '',
      incFilterArea: '',
      incFilterSeverity: '',

      showIncModal: false,
      incMode: 'view',          // 'new' | 'view' | 'edit'
      incCurrent: null,         // full record
      incForm: {
        package_id: null,
        area_id: null,
        worker_ids: [],
        incident_date: '',
        severity_class_id: null,
        incident_cause_id: null,
        other_cause_text: '',
        details: '',
        action: '',
        updated_at: null,
      },
      incError: '',
      incSaving: false,

      // Workflow inline prompts on the incident modal
      incWorkflowMode: null,    // null | 'submit' | 'approve_investigation' | 'mark_action_done' | 'close' | 'reopen'
      incWorkflowComment: '',
      incWorkflowSaving: false,

      // History overlay
      showIncHistoryModal: false,

      // Notes pane
      newNoteContent: '',
      noteEditingId: null,
      noteEditingContent: '',
      noteSaving: false,

      // ── Toolbox tab ────────────────────────────────────────────────────
      toolboxes: [],
      tbxLoading: false,
      tbxFilterStatus: '',
      tbxFilterCategory: '',
      tbxFilterPackage: '',

      tbxGivers: { users: [], workers: [] },

      showTbxModal: false,
      tbxMode: 'view',          // 'new' | 'view' | 'edit'
      tbxCurrent: null,
      tbxForm: {
        package_ids: [],
        worker_ids: [],
        observation_ids: [],
        incident_ids: [],
        given_by_user_id: null,
        given_by_worker_id: null,
        category_id: null,
        other_category_text: '',
        talk_date: '',
        details: '',
        updated_at: null,
      },
      tbxError: '',
      tbxSaving: false,
      tbxWorkflowSaving: false,
      tbxWorkflowMode: null,    // null | 'reopen'
      tbxWorkflowComment: '',
      showTbxHistoryModal: false,

      // Search inputs above Given By / Observations / Incidents pickers.
      // Cap candidate lists so the form stays responsive on tablet even with
      // hundreds of records.
      tbxGiverSearch: '',
      tbxObsSearch: '',
      tbxIncSearch: '',
      tbxCandidateLimit: 50,

      // ── Dashboard tab ──────────────────────────────────────────────────
      dashData: null,
      dashLoading: false,
      dashRefHoursDraft: null,        // when editing the reference hours
      dashRefHoursSaving: false,
      dashTrendPackage: '',           // '' = all packages
      dashChartObjs: { hours: null, neg_obs: null, incidents: null, toolboxes: null },
    };
  },

  computed: {
    isBidder()        { return this.currentUser && this.currentUser.role === 'BIDDER'; },
    isOwnerOrAdmin() {
      if (!this.currentUser) return false;
      const r = this.currentUser.role;
      if (r === 'ADMIN' || r === 'PROJECT_OWNER') return true;
      // HSE Manager (Safety Module Lead) gets the same UI gates.
      return (this.currentUser.lead_modules || []).includes('Safety');
    },
    canEditSetup()    { return this.isOwnerOrAdmin; },
    canCreateObservation() { return !this.isBidder; },

    filteredObservations() {
      let list = this.observations;
      if (this.obsFilterStatus)   list = list.filter(o => o.status === this.obsFilterStatus);
      if (this.obsFilterPackage)  list = list.filter(o => o.package_id === this.obsFilterPackage);
      if (this.obsFilterArea)     list = list.filter(o => o.area_id === this.obsFilterArea);
      if (this.obsFilterCategory) list = list.filter(o => o.category_id === this.obsFilterCategory);
      return list;
    },

    formSubcontractorOptions() {
      const pkgId = this.obsForm.package_id;
      return (pkgId && this.subcontractorsByPackage[pkgId]) || [];
    },
    formWorkerOptions() {
      const pkgId = this.obsForm.package_id;
      return (pkgId && this.workersByPackage[pkgId]) || [];
    },

    canSaveForm() {
      const f = this.obsForm;
      return !!(f.package_id && f.area_id && f.category_id && (f.details || '').trim());
    },

    // Floorplan that covers the currently-selected area (or null).
    currentAreaFloorplan() {
      const aId = this.obsForm.area_id;
      if (!aId) return null;
      const area = this.areas.find(a => a.id === aId);
      if (!area || !area.floorplan_id) return null;
      return this.floorplans.find(fp => fp.id === area.floorplan_id) || null;
    },

    currentFloorplanThumb() {
      const fp = this.currentAreaFloorplan;
      return fp ? (this.floorplanBlobs[fp.id] || null) : null;
    },

    currentThumbAspect() {
      const fp = this.currentAreaFloorplan;
      if (!fp) return '4 / 3';
      const d = this.floorplanDims[fp.id];
      return d ? (d.w + ' / ' + d.h) : '4 / 3';
    },

    canEditPin() {
      // Only editable while creating or editing the record.
      if (this.obsMode === 'new' || this.obsMode === 'edit') return true;
      return false;
    },

    activeReportsCount() {
      return (this.recentReports || []).filter(r =>
        r.status === 'PENDING' || r.status === 'GENERATING'
      ).length;
    },

    // Pinned observations grouped per floorplan, with current filters applied.
    pinsByFloorplan() {
      const pol = this.heatPolarity;
      const status = this.heatStatus;
      const pkgId = this.heatPackage;
      const out = {};
      for (const o of this.observations) {
        if (!o.floorplan_id || o.floorplan_x == null || o.floorplan_y == null) continue;
        if (pol !== 'ALL' && (o.category_polarity || 'NEGATIVE') !== pol) continue;
        if (status === 'ACTIVE' && o.status === 'CLOSED') continue;
        if (status === 'CLOSED' && o.status !== 'CLOSED') continue;
        if (pkgId && o.package_id !== pkgId) continue;
        if (!out[o.floorplan_id]) out[o.floorplan_id] = [];
        out[o.floorplan_id].push(o);
      }
      return out;
    },

    floorplansWithPins() {
      const grouped = this.pinsByFloorplan;
      return this.floorplans
        .filter(fp => grouped[fp.id] && grouped[fp.id].length)
        .map(fp => {
          const pins = grouped[fp.id];
          const pos = pins.filter(p => (p.category_polarity || 'NEGATIVE') === 'POSITIVE').length;
          const neg = pins.length - pos;
          return { ...fp, pins, posCount: pos, negCount: neg };
        });
    },

    obsAllowed() {
      return (this.obsCurrent && this.obsCurrent.allowed_actions) || [];
    },

    statusBadgeClass() {
      const s = this.obsCurrent && this.obsCurrent.status;
      return {
        DRAFT:     'bg-gray-100 text-gray-600 border-gray-200',
        SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
        RECEIVED:  'bg-amber-50 text-amber-700 border-amber-200',
        CLOSED:    'bg-emerald-50 text-emerald-700 border-emerald-200',
      }[s] || 'bg-gray-100 text-gray-500 border-gray-200';
    },
    // Workflow comments to surface in the observation form (chronological).
    obsWorkflowComments() {
      const hist = (this.obsCurrent && this.obsCurrent.history) || [];
      const interesting = ['ACKNOWLEDGED', 'CLOSED', 'REOPENED'];
      return hist.filter(h =>
        interesting.indexOf(h.event) !== -1 && (h.comment || '').trim().length > 0
      );
    },

    // ── Incidents ──────────────────────────────────────────────────────────
    filteredIncidents() {
      let list = this.incidents;
      if (this.incFilterStatus)   list = list.filter(i => i.status === this.incFilterStatus);
      if (this.incFilterPackage)  list = list.filter(i => i.package_id === this.incFilterPackage);
      if (this.incFilterArea)     list = list.filter(i => i.area_id === this.incFilterArea);
      if (this.incFilterSeverity) list = list.filter(i => i.severity_class_id === this.incFilterSeverity);
      return list;
    },
    incFormWorkerOptions() {
      const pkgId = this.incForm.package_id;
      const list = (pkgId && this.workersByPackage[pkgId]) || [];
      return list.slice().sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
      );
    },
    incCauseSelected() {
      const id = this.incForm.incident_cause_id;
      if (!id) return null;
      return this.incidentCauses.find(c => c.id === id) || null;
    },
    incCauseIsOther() {
      const c = this.incCauseSelected;
      return !!(c && c.is_default);
    },
    canSaveIncidentForm() {
      const f = this.incForm;
      const baseOk = !!(
        f.package_id && f.area_id && f.incident_date &&
        f.severity_class_id && f.incident_cause_id &&
        (f.details || '').trim() && (f.action || '').trim()
      );
      if (!baseOk) return false;
      if (this.incCauseIsOther && !(f.other_cause_text || '').trim()) return false;
      return true;
    },
    incAllowed() {
      return (this.incCurrent && this.incCurrent.allowed_actions) || [];
    },
    // Workflow comments to surface in the form (in chronological order, newest
    // last). Pulled from the history log so re-opens and prior action
    // confirmations remain visible after the supervisor sends the report
    // back to ACTION_IN_PROGRESS.
    incWorkflowComments() {
      const hist = (this.incCurrent && this.incCurrent.history) || [];
      const interesting = ['INVESTIGATED', 'ACTION_DONE', 'REOPENED', 'CLOSED'];
      return hist.filter(h =>
        interesting.indexOf(h.event) !== -1 && (h.comment || '').trim().length > 0
      );
    },
    incStatusBadgeClass() {
      const s = this.incCurrent && this.incCurrent.status;
      return {
        DRAFT:               'bg-gray-100 text-gray-700 border-gray-300',
        UNDER_INVESTIGATION: 'bg-blue-100 text-blue-800 border-blue-300',
        ACTION_IN_PROGRESS:  'bg-violet-100 text-violet-800 border-violet-300',
        PENDING_REVIEW:      'bg-amber-100 text-amber-800 border-amber-300',
        CLOSED:              'bg-emerald-100 text-emerald-800 border-emerald-300',
      }[s] || 'bg-gray-100 text-gray-600 border-gray-300';
    },
    // ── Toolbox helpers ────────────────────────────────────────────────────
    filteredToolboxes() {
      let list = this.toolboxes;
      if (this.tbxFilterStatus)   list = list.filter(t => t.status === this.tbxFilterStatus);
      if (this.tbxFilterCategory) list = list.filter(t => t.category_id === this.tbxFilterCategory);
      if (this.tbxFilterPackage)  list = list.filter(t => (t.package_ids || []).indexOf(this.tbxFilterPackage) !== -1);
      return list;
    },
    tbxAllowed() {
      return (this.tbxCurrent && this.tbxCurrent.allowed_actions) || [];
    },
    tbxStatusBadgeClass() {
      const s = this.tbxCurrent && this.tbxCurrent.status;
      return {
        DRAFT:     'bg-gray-100 text-gray-700 border-gray-300',
        SUBMITTED: 'bg-blue-100 text-blue-800 border-blue-300',
        RECEIVED:  'bg-emerald-100 text-emerald-800 border-emerald-300',
      }[s] || 'bg-gray-100 text-gray-600 border-gray-300';
    },
    // Packages eligible for the toolbox form. Vendors only see their own.
    tbxPackageOptions() {
      if (!this.currentUser || this.currentUser.role !== 'VENDOR') return this.packages;
      const cid = this.currentUser.contact_id;
      if (!cid) return [];
      return this.packages.filter(p =>
        p.package_owner_id === cid
        || p.account_manager_id === cid
        || (p.contact_ids || []).indexOf(cid) !== -1
      );
    },
    // Workers cascaded from the selected packages, alphabetised + APPROVED only.
    tbxWorkerOptions() {
      const ids = this.tbxForm.package_ids || [];
      if (!ids.length) return [];
      const all = [];
      for (const pid of ids) {
        for (const w of (this.workersByPackage[pid] || [])) all.push(w);
      }
      // de-duplicate by id, then sort
      const seen = new Set();
      const uniq = [];
      for (const w of all) { if (!seen.has(w.id)) { seen.add(w.id); uniq.push(w); } }
      uniq.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
      return uniq;
    },
    tbxCategorySelected() {
      const id = this.tbxForm.category_id;
      if (!id) return null;
      return this.toolboxCategories.find(c => c.id === id) || null;
    },
    tbxCategoryIsOther() {
      const c = this.tbxCategorySelected;
      return !!(c && c.is_default);
    },
    canSaveToolboxForm() {
      const f = this.tbxForm;
      const baseOk = !!(
        (f.package_ids && f.package_ids.length) &&
        (f.given_by_user_id || f.given_by_worker_id) &&
        f.category_id && (f.talk_date || '').trim() && (f.details || '').trim()
      );
      if (!baseOk) return false;
      if (this.tbxCategoryIsOther && !(f.other_category_text || '').trim()) return false;
      return true;
    },
    // ── Dashboard column maxes (for column-wise heat-map colouring) ──────
    consolidatedColMax() {
      if (!this.dashData) return {};
      const ps = this.dashData.packages;
      const m = (key) => Math.max(0, ...ps.map(p => (this.dashData[key] || {})[p.id] || 0));
      return {
        hours:     Math.max(0, ...ps.map(p => this.dashData.hours_by_package[p.id] || 0)),
        incidents: m('incidents_per_pkg'),
        neg_obs:   m('neg_obs_per_pkg'),
        pos_obs:   m('pos_obs_per_pkg'),
        toolboxes: m('toolboxes_per_pkg'),
      };
    },
    incidentColMax() {
      if (!this.dashData) return {};
      const out = {};
      for (const s of this.dashData.severities) {
        out[s.id] = Math.max(0, ...this.dashData.packages.map(
          p => (this.dashData.incidents_matrix[p.id] || {})[s.id] || 0));
      }
      return out;
    },
    negObsColMax() {
      if (!this.dashData) return {};
      const out = {};
      for (const c of this.dashData.neg_categories) {
        out[c.id] = Math.max(0, ...this.dashData.packages.map(
          p => (this.dashData.neg_obs_matrix[p.id] || {})[c.id] || 0));
      }
      return out;
    },
    posObsColMax() {
      if (!this.dashData) return {};
      const out = {};
      for (const c of this.dashData.pos_categories) {
        out[c.id] = Math.max(0, ...this.dashData.packages.map(
          p => (this.dashData.pos_obs_matrix[p.id] || {})[c.id] || 0));
      }
      return out;
    },

    // ── Filtered + capped lists for the Toolbox form pickers ──────────────
    tbxFilteredGivers() {
      const s = (this.tbxGiverSearch || '').trim().toLowerCase();
      const filt = (arr) => !s ? arr : arr.filter(x => (x.name || '').toLowerCase().includes(s));
      return {
        users:   filt(this.tbxGivers.users   || []),
        workers: filt(this.tbxGivers.workers || []),
      };
    },
    // Already-selected observations (full record), in selection order.
    tbxSelectedObservations() {
      const ids = this.tbxForm.observation_ids || [];
      return ids
        .map(id => this.observations.find(o => o.id === id))
        .filter(Boolean);
    },
    // Candidate observations to show under the search box. Excludes already
    // selected ones, applies the search filter, and caps at tbxCandidateLimit
    // so a 200+ list stays snappy on tablet.
    tbxCandidateObservations() {
      const sel = new Set(this.tbxForm.observation_ids || []);
      const s = (this.tbxObsSearch || '').trim().toLowerCase();
      let list = this.observations.filter(o => !sel.has(o.id));
      if (s) {
        list = list.filter(o =>
          ((o.display_id || '') + ' ' + (o.category_name || '') + ' ' + (o.details || ''))
            .toLowerCase().includes(s)
        );
      }
      return { items: list.slice(0, this.tbxCandidateLimit), total: list.length };
    },
    tbxSelectedIncidents() {
      const ids = this.tbxForm.incident_ids || [];
      return ids
        .map(id => this.incidents.find(i => i.id === id))
        .filter(Boolean);
    },
    tbxCandidateIncidents() {
      const sel = new Set(this.tbxForm.incident_ids || []);
      const s = (this.tbxIncSearch || '').trim().toLowerCase();
      let list = this.incidents.filter(i => !sel.has(i.id));
      if (s) {
        list = list.filter(i =>
          ((i.display_id || '') + ' ' + (i.severity_class_name || '') + ' '
            + (i.incident_cause_name || '') + ' ' + (i.details || ''))
            .toLowerCase().includes(s)
        );
      }
      return { items: list.slice(0, this.tbxCandidateLimit), total: list.length };
    },

    // Combined dropdown value for "Given By": either "user:<id>" or "worker:<id>"
    givenBySelectValue: {
      get() {
        if (this.tbxForm.given_by_user_id)   return 'user:' + this.tbxForm.given_by_user_id;
        if (this.tbxForm.given_by_worker_id) return 'worker:' + this.tbxForm.given_by_worker_id;
        return '';
      },
      set(v) {
        if (!v) {
          this.tbxForm.given_by_user_id = null;
          this.tbxForm.given_by_worker_id = null;
          return;
        }
        const [kind, idStr] = v.split(':');
        const id = parseInt(idStr, 10);
        if (kind === 'user')        { this.tbxForm.given_by_user_id = id;   this.tbxForm.given_by_worker_id = null; }
        else if (kind === 'worker') { this.tbxForm.given_by_worker_id = id; this.tbxForm.given_by_user_id   = null; }
      },
    },
    canCreateIncidentInThisProject() {
      // Bidders cannot. Vendors must be linked to at least one package
      // (otherwise the package dropdown would be empty).
      if (this.isBidder) return false;
      if (this.currentUser && this.currentUser.role === 'VENDOR') {
        return this.incidentPackageOptions.length > 0;
      }
      return true;
    },
    // Package list shown in the incident form's Package dropdown.
    // Vendors only see packages where their contact is linked (owner,
    // account manager, or in the package contacts list). All other roles
    // see every package on the project.
    incidentPackageOptions() {
      if (!this.currentUser || this.currentUser.role !== 'VENDOR') return this.packages;
      const cid = this.currentUser.contact_id;
      if (!cid) return [];
      const linked = this.packages.filter(p =>
        p.package_owner_id === cid
        || p.account_manager_id === cid
        || (p.contact_ids || []).indexOf(cid) !== -1
      );
      // Always keep the currently-selected package visible, even if the user
      // has since lost their contact link to it (so the form can still render).
      const currentId = this.incForm.package_id;
      if (currentId && !linked.some(p => p.id === currentId)) {
        const cur = this.packages.find(p => p.id === currentId);
        if (cur) return [cur, ...linked];
      }
      return linked;
    },
  },

  watch: {
    activeTab(v) {
      this.$emit('subtab-change', v);
      // Floorplan cards are collapsed by default — blobs are now loaded
      // lazily on expansion (toggleFloorplan / toggleExpandAll), so we
      // don't pre-fetch every floorplan image here.
      if (v === 'dashboard') {
        this.loadDashboard().then(() => this.$nextTick(() => this.renderDashCharts()));
      } else {
        this.destroyDashCharts();
      }
    },
    obsCurrent(val) {
      // Observation detail modal — guarded by showObsModal so we don't emit
      // for transient state during modal teardown.
      if (!this.showObsModal) return;
      this.$emit('record-change', val ? { type: 'safety_observation', id: val.id } : null);
    },
    showObsModal(val) {
      if (!val) this.$emit('record-change', null);
    },
    incCurrent(val) {
      if (!this.showIncModal) return;
      this.$emit('record-change', val ? { type: 'safety_incident', id: val.id } : null);
    },
    showIncModal(val) {
      if (!val) this.$emit('record-change', null);
    },
    tbxCurrent(val) {
      if (!this.showTbxModal) return;
      this.$emit('record-change', val ? { type: 'safety_toolbox', id: val.id } : null);
    },
    showTbxModal(val) {
      if (!val) this.$emit('record-change', null);
    },
    dashTrendPackage() {
      if (this.activeTab === 'dashboard') {
        this.$nextTick(() => this.renderDashCharts());
      }
    },
    'obsForm.package_id'(newId, oldId) {
      if (newId && newId !== oldId) {
        this.ensureWorkersLoadedFor(newId);
        // Clear the downstream selections if they don't match the new package.
        if (this.obsMode !== 'view') {
          this.obsForm.subcontractor_id = null;
          this.obsForm.worker_id        = null;
        }
      }
    },
    'incForm.package_id'(newId, oldId) {
      if (newId && newId !== oldId) {
        this.ensureWorkersLoadedFor(newId);
        // Drop any selected workers that don't belong to the new package.
        if (this.incMode !== 'view' && this.incForm.worker_ids.length) {
          this.incForm.worker_ids = [];
        }
      }
    },
    'obsForm.area_id'(newId, oldId) {
      if (newId === oldId) return;
      if (this.obsMode === 'view') return;
      // Lazy-load thumbnail for the new area's floorplan
      const fp = this.currentAreaFloorplan;
      if (fp) this.loadThumbnailBlob(fp.id);
      // Drop any pin that no longer matches the new area's floorplan.
      const targetFpId = fp ? fp.id : null;
      if (this.obsForm.floorplan_id && this.obsForm.floorplan_id !== targetFpId) {
        this.obsForm.floorplan_id = null;
        this.obsForm.floorplan_x  = null;
        this.obsForm.floorplan_y  = null;
        this.pinTouched = true;
      }
    },
    pendingOpen: {
      immediate: true,
      async handler(v) {
        if (!v) return;
        if (v.record_type === 'safety_observation' && v.record_id) {
          this.activeTab = 'observations';
          await this.$nextTick();
          await this.openObservationById(v.record_id);
        } else if (v.record_type === 'safety_incident' && v.record_id) {
          this.activeTab = 'incidents';
          await this.$nextTick();
          await this.openIncidentById(v.record_id);
        } else if (v.record_type === 'safety_toolbox' && v.record_id) {
          this.activeTab = 'toolbox';
          await this.$nextTick();
          await this.openToolbox({ id: v.record_id });
        }
      },
    },
  },

  async mounted() {
    if (this.initialTab) this.activeTab = this.initialTab;
    await Promise.all([
      this.loadCategories(),
      this.loadPackages(),
      this.loadAreas(),
      this.loadFloorplans(),
      this.loadObservations(),
      this.loadReports(),
      this.loadSeverityClasses(),
      this.loadIncidentCauses(),
      this.loadToolboxCategories(),
      this.loadIncidents(),
      this.loadToolboxes(),
      this.loadToolboxGivers(),
    ]);
  },

  beforeUnmount() {
    Object.values(this.floorplanBlobs).forEach(url => {
      try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
    });
    if (this.reportsTimer) { clearTimeout(this.reportsTimer); this.reportsTimer = null; }
    this.destroyDashCharts();
  },

  methods: {
    // ── Excel exports (mirror the daily-reports pattern) ─────────────────
    async exportObservationsToExcel() {
      this.xlsxExportingObs = true;
      try { await API.exportSafetyObservationsXlsx(); }
      catch (e) { alert('Export failed: ' + (e.message || '')); }
      finally { this.xlsxExportingObs = false; }
    },
    async exportIncidentsToExcel() {
      this.xlsxExportingInc = true;
      try { await API.exportSafetyIncidentsXlsx(); }
      catch (e) { alert('Export failed: ' + (e.message || '')); }
      finally { this.xlsxExportingInc = false; }
    },
    async exportToolboxesToExcel() {
      this.xlsxExportingTbx = true;
      try { await API.exportSafetyToolboxesXlsx(); }
      catch (e) { alert('Export failed: ' + (e.message || '')); }
      finally { this.xlsxExportingTbx = false; }
    },

    // ── Reference data ────────────────────────────────────────────────────
    async loadCategories() {
      try { this.categories = await API.listSafetyObservationCategories(); }
      catch (e) { console.error('Load safety categories failed', e); }
    },
    async loadPackages() {
      try { this.packages = await API.getPackages(); }
      catch (e) { console.error('Load packages failed', e); }
    },
    async loadAreas() {
      try { this.areas = await API.getAreas(); }
      catch (e) { console.error('Load areas failed', e); }
    },
    async loadFloorplans() {
      try { this.floorplans = await API.getFloorplans(); }
      catch (e) { console.error('Load floorplans failed', e); this.floorplans = []; }
    },
    async loadThumbnailBlob(fpId) {
      if (!fpId || this.floorplanBlobs[fpId]) return;
      try {
        const blob = await API.fetchFloorplanImageBlob(fpId);
        this.floorplanBlobs[fpId] = URL.createObjectURL(blob);
      } catch (e) { console.error('Floorplan thumb load failed', e); }
    },
    onFloorplanImgLoad(fpId, e) {
      const img = e && e.target;
      if (!img || !img.naturalWidth || !img.naturalHeight) return;
      // Use a fresh object so reactivity tracks the change.
      this.floorplanDims = {
        ...this.floorplanDims,
        [fpId]: { w: img.naturalWidth, h: img.naturalHeight },
      };
    },
    floorplanAspect(fpId) {
      const d = this.floorplanDims[fpId];
      return d ? (d.w + ' / ' + d.h) : '4 / 3';
    },
    async ensureWorkersLoadedFor(pkgId) {
      if (this.subcontractorsByPackage[pkgId] && this.workersByPackage[pkgId]) return;
      try {
        const [subs, workers] = await Promise.all([
          API.getSubcontractors({ package_id: pkgId }).catch(() => []),
          API.getWorkers({ package_id: pkgId }).catch(() => []),
        ]);
        this.subcontractorsByPackage[pkgId] = subs || [];
        // Only APPROVED workers are eligible to be picked in an observation.
        this.workersByPackage[pkgId] = (workers || []).filter(w => w.status === 'APPROVED');
      } catch (e) { console.error('Load workers/subs for package failed', e); }
    },

    // ── Observations list ─────────────────────────────────────────────────
    async loadObservations() {
      this.obsLoading = true;
      try { this.observations = await API.listSafetyObservations(); }
      catch (e) { console.error('Load observations failed', e); this.observations = []; }
      finally { this.obsLoading = false; }
    },
    statusPill(s) {
      const map = {
        DRAFT:     'bg-gray-100 text-gray-600 border-gray-200',
        SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
        RECEIVED:  'bg-amber-50 text-amber-700 border-amber-200',
        CLOSED:    'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
      return map[s] || 'bg-gray-100 text-gray-500 border-gray-200';
    },
    fmtDateTime(iso) {
      if (!iso) return '';
      try { const d = new Date(iso); return d.toLocaleString(); } catch { return iso; }
    },
    eventLabel(e) {
      return {
        CREATED: 'Created', SUBMITTED: 'Submitted',
        ACKNOWLEDGED: 'Acknowledged', CLOSED: 'Closed', REOPENED: 'Re-opened',
      }[e] || e;
    },
    eventBadgeClass(e) {
      return {
        CREATED:      'bg-gray-100 text-gray-700',
        SUBMITTED:    'bg-blue-100 text-blue-700',
        ACKNOWLEDGED: 'bg-indigo-100 text-indigo-700',
        CLOSED:       'bg-emerald-100 text-emerald-700',
        REOPENED:     'bg-amber-100 text-amber-700',
      }[e] || 'bg-gray-100 text-gray-600';
    },
    eventBulletClass(e) {
      // Mirrors ITP's colour convention so the two history modals look the same.
      return {
        CREATED:      'bg-gray-400',
        SUBMITTED:    'bg-blue-500',
        ACKNOWLEDGED: 'bg-indigo-500',
        CLOSED:       'bg-emerald-500',
        REOPENED:     'bg-amber-500',
      }[e] || 'bg-gray-400';
    },
    openHistoryModal() {
      if (!this.obsCurrent) return;
      this.showHistoryModal = true;
    },
    // Quick-access from the list row — load just the history without opening
    // the full detail modal, so the user can glance at the log and close.
    async openHistoryFromRow(o) {
      try {
        const full = await API.getSafetyObservation(o.id);
        this.obsCurrent = full;
        this.showHistoryModal = true;
      } catch (e) { alert(e.message || 'Could not load history'); }
    },
    closeHistoryModal() {
      this.showHistoryModal = false;
      // If the full detail modal isn't open, drop the loaded record so a
      // later row click doesn't see a stale obsCurrent.
      if (!this.showObsModal) this.obsCurrent = null;
    },

    // ── Modal: open / close ───────────────────────────────────────────────
    openNewObservation() {
      if (!this.canCreateObservation) return;
      this.obsMode = 'new';
      this.obsCurrent = null;
      this.obsForm = {
        package_id: null, area_id: null, category_id: null,
        details: '', subcontractor_id: null, worker_id: null,
        remediation_request: '',
        floorplan_id: null, floorplan_x: null, floorplan_y: null,
        updated_at: null,
      };
      this.pinTouched = false;
      this.obsError = '';
      this.workflowComment = '';
      this.workflowMode = null;
      this.showObsModal = true;
    },
    async openObservation(o) {
      try {
        const full = await API.getSafetyObservation(o.id);
        this.obsCurrent = full;
        this.obsMode = 'view';
        this.obsError = '';
        this.workflowComment = '';
        this.workflowMode = null;
        this.obsForm = {
          package_id: full.package_id,
          area_id: full.area_id,
          category_id: full.category_id,
          details: full.details,
          subcontractor_id: full.subcontractor_id,
          worker_id: full.worker_id,
          remediation_request: full.remediation_request || '',
          floorplan_id: full.floorplan_id || null,
          floorplan_x:  (full.floorplan_x  != null) ? full.floorplan_x  : null,
          floorplan_y:  (full.floorplan_y  != null) ? full.floorplan_y  : null,
          updated_at: full.updated_at,
        };
        this.pinTouched = false;
        await this.ensureWorkersLoadedFor(full.package_id);
        if (full.floorplan_id) this.loadThumbnailBlob(full.floorplan_id);
        else {
          // Even with no pin, prefetch the thumbnail of the area's floorplan so
          // the user can pin it without waiting on a fetch.
          const fp = this.currentAreaFloorplan;
          if (fp) this.loadThumbnailBlob(fp.id);
        }
        this.showObsModal = true;
      } catch (e) { alert(e.message || 'Could not open observation'); }
    },
    async openObservationById(id) {
      try {
        const full = await API.getSafetyObservation(id);
        await this.openObservation(full);
      } catch (e) { alert(e.message || 'Could not open observation'); }
    },
    closeObsModal() {
      this.showObsModal = false;
      this.obsCurrent = null;
      this.obsMode = 'view';
      this.workflowMode = null;
      this.workflowComment = '';
    },
    startEdit() {
      if (!this.obsCurrent) return;
      this.obsMode = 'edit';
      this.workflowMode = null;
    },
    cancelEdit() {
      if (this.obsCurrent) {
        this.obsForm = {
          package_id: this.obsCurrent.package_id,
          area_id: this.obsCurrent.area_id,
          category_id: this.obsCurrent.category_id,
          details: this.obsCurrent.details,
          subcontractor_id: this.obsCurrent.subcontractor_id,
          worker_id: this.obsCurrent.worker_id,
          remediation_request: this.obsCurrent.remediation_request || '',
          floorplan_id: this.obsCurrent.floorplan_id || null,
          floorplan_x:  (this.obsCurrent.floorplan_x  != null) ? this.obsCurrent.floorplan_x  : null,
          floorplan_y:  (this.obsCurrent.floorplan_y  != null) ? this.obsCurrent.floorplan_y  : null,
          updated_at: this.obsCurrent.updated_at,
        };
        this.pinTouched = false;
      }
      this.obsMode = 'view';
    },

    // ── Pin picker ────────────────────────────────────────────────────────
    openPinPicker() {
      if (!this.canEditPin) return;
      const fp = this.currentAreaFloorplan;
      if (!fp) return;
      this.showPinPicker = true;
    },
    onPinSave(coords) {
      const fp = this.currentAreaFloorplan;
      if (!fp) { this.showPinPicker = false; return; }
      this.obsForm.floorplan_id = fp.id;
      this.obsForm.floorplan_x  = coords.x;
      this.obsForm.floorplan_y  = coords.y;
      this.pinTouched = true;
      this.showPinPicker = false;
    },
    onPinClear() {
      this.obsForm.floorplan_id = null;
      this.obsForm.floorplan_x  = null;
      this.obsForm.floorplan_y  = null;
      this.pinTouched = true;
      this.showPinPicker = false;
    },
    onPinCancel() {
      this.showPinPicker = false;
    },

    // ── PDF export ────────────────────────────────────────────────────────
    openExportModal() {
      this.exportFilters = {
        package_ids: [],
        area_ids: [],
        statuses: [],
        group_by: 'package_area',
        per_package_plans: false,
      };
      this.exportError = '';
      this.showExportModal = true;
    },
    closeExportModal() {
      if (this.exporting) return;
      this.showExportModal = false;
    },
    toggleExportArrayValue(key, value) {
      const arr = this.exportFilters[key];
      const idx = arr.indexOf(value);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(value);
    },
    toggleSelectAllExport(key, ids) {
      const arr = this.exportFilters[key];
      if (arr.length === ids.length) {
        this.exportFilters[key] = [];
      } else {
        this.exportFilters[key] = [...ids];
      }
    },
    async runExport() {
      this.exporting = true;
      this.exportError = '';
      try {
        await API.exportSafetyObservationsPdf(this.exportFilters);
        this.showExportModal = false;
        // Refresh the reports panel right away and start polling — the
        // background worker will mark the new row READY when the PDF lands
        // on disk.
        await this.loadReports();
        alert(
          'Your report is being generated in the background.\n\n' +
          'You can download it from the "Reports" tab once it is ready.'
        );
      } catch (e) {
        this.exportError = e.message || 'Export failed.';
      } finally {
        this.exporting = false;
      }
    },

    // ── Reports list (background-generated PDFs) ─────────────────────────
    async loadReports() {
      this.reportsLoading = true;
      try {
        this.recentReports = await API.listReports('safety', 15);
      } catch (e) {
        console.error('Load reports failed', e);
      } finally {
        this.reportsLoading = false;
        this.scheduleReportsPoll();
      }
    },
    scheduleReportsPoll() {
      if (this.reportsTimer) { clearTimeout(this.reportsTimer); this.reportsTimer = null; }
      const hasActive = (this.recentReports || []).some(r =>
        r.status === 'PENDING' || r.status === 'GENERATING'
      );
      if (hasActive) {
        this.reportsTimer = setTimeout(() => this.loadReports(), 4000);
      }
    },
    reportStatusClass(status) {
      return {
        PENDING:    'bg-gray-100 text-gray-600 border-gray-200',
        GENERATING: 'bg-blue-50 text-blue-700 border-blue-200',
        READY:      'bg-emerald-50 text-emerald-700 border-emerald-200',
        FAILED:     'bg-red-50 text-red-700 border-red-200',
      }[status] || 'bg-gray-100 text-gray-500 border-gray-200';
    },
    fmtFileSize(bytes) {
      if (bytes == null) return '';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },
    async onDownloadReport(r) {
      try {
        const fname = `safety_observations_${(r.requested_at || '').slice(0,10)}.pdf`;
        await API.downloadReport(r.id, fname);
      } catch (e) {
        alert(e.message || 'Download failed');
      }
    },
    async onDeleteReport(r) {
      if (!confirm('Delete this report?')) return;
      try {
        await API.deleteReport(r.id);
        await this.loadReports();
      } catch (e) {
        alert(e.message || 'Delete failed');
      }
    },

    // ── Heatmap helpers ───────────────────────────────────────────────────
    // Group nearby pins, but keep positive and negative pins in separate
    // clusters — same-type only, so a green cluster never absorbs a red pin
    // and vice-versa.
    clusterPins(pins) {
      const buckets = { POSITIVE: [], NEGATIVE: [] };
      for (const p of pins) {
        const pol = (p.category_polarity || 'NEGATIVE') === 'POSITIVE' ? 'POSITIVE' : 'NEGATIVE';
        buckets[pol].push(p);
      }
      const singletons = [];
      const clusters = [];
      let clusterCounter = 0;
      for (const polarity of Object.keys(buckets)) {
        const groups = this.greedyGroup(buckets[polarity], 0.05);
        for (const g of groups) {
          if (g.length >= 5) {
            const cx = g.reduce((s, p) => s + p.floorplan_x, 0) / g.length;
            const cy = g.reduce((s, p) => s + p.floorplan_y, 0) / g.length;
            clusters.push({
              key: 'c-' + (clusterCounter++),
              x: cx, y: cy, items: g, polarity,
            });
          } else {
            g.forEach(p => singletons.push(p));
          }
        }
      }
      return { singletons, clusters };
    },

    greedyGroup(pins, threshold) {
      const remaining = [...pins];
      const groups = [];
      while (remaining.length) {
        const seed = remaining.shift();
        const group = [seed];
        for (let i = remaining.length - 1; i >= 0; i--) {
          const d = Math.hypot(
            remaining[i].floorplan_x - seed.floorplan_x,
            remaining[i].floorplan_y - seed.floorplan_y,
          );
          if (d < threshold) {
            group.push(remaining[i]);
            remaining.splice(i, 1);
          }
        }
        groups.push(group);
      }
      return groups;
    },

    clusterDotSize(count) {
      // 32px base, growing modestly with count, capped at 64px.
      return Math.min(64, 26 + Math.round(Math.sqrt(count) * 5));
    },

    clusterBg(cluster) {
      return cluster.polarity === 'POSITIVE' ? '#10b981' : '#dc2626';
    },

    pinColor(o) {
      if (o.status === 'CLOSED') return '#9ca3af'; // gray-400
      return (o.category_polarity === 'POSITIVE') ? '#10b981' : '#dc2626'; // emerald / red
    },

    isFloorplanExpanded(fpId) {
      return this.expandAll || !!this.expandedFloorplans[fpId];
    },
    toggleFloorplan(fpId) {
      this.expandedFloorplans = {
        ...this.expandedFloorplans,
        [fpId]: !this.expandedFloorplans[fpId],
      };
      // Lazy-load the image if we're expanding for the first time.
      if (this.expandedFloorplans[fpId]) this.loadThumbnailBlob(fpId);
    },
    toggleExpandAll() {
      this.expandAll = !this.expandAll;
      if (this.expandAll) {
        this.ensureHeatmapBlobs();
      }
    },

    expandCluster(fpId, idx) {
      this.heatExpanded = { fpId, idx };
    },
    collapseCluster() { this.heatExpanded = null; },

    isClusterExpanded(fpId, idx) {
      return this.heatExpanded
        && this.heatExpanded.fpId === fpId
        && this.heatExpanded.idx === idx;
    },

    async openHeatmapPin(o) {
      // The detail modal is rendered at the top level — open it on top of
      // the floorplan tab without navigating away.
      await this.openObservationById(o.id);
    },

    async ensureHeatmapBlobs() {
      const list = this.floorplansWithPins;
      for (const fp of list) {
        if (!this.floorplanBlobs[fp.id]) {
          await this.loadThumbnailBlob(fp.id);
        }
      }
    },

    // ── Save (create draft or update) ─────────────────────────────────────
    async saveObs() {
      if (!this.canSaveForm) {
        this.obsError = 'Package, area, category and details are required';
        return;
      }
      this.obsSaving = true;
      this.obsError = '';
      try {
        const payload = {
          package_id: this.obsForm.package_id,
          area_id: this.obsForm.area_id,
          category_id: this.obsForm.category_id,
          details: this.obsForm.details.trim(),
          subcontractor_id: this.obsForm.subcontractor_id || null,
          worker_id: this.obsForm.worker_id || null,
          remediation_request: (this.obsForm.remediation_request || '').trim() || null,
        };
        // Pin fields: only emit when the user touched the pin in this edit.
        if (this.obsMode === 'new') {
          if (this.obsForm.floorplan_id != null) {
            payload.floorplan_id = this.obsForm.floorplan_id;
            payload.floorplan_x  = this.obsForm.floorplan_x;
            payload.floorplan_y  = this.obsForm.floorplan_y;
          }
        } else if (this.pinTouched) {
          if (this.obsForm.floorplan_id != null) {
            payload.floorplan_id = this.obsForm.floorplan_id;
            payload.floorplan_x  = this.obsForm.floorplan_x;
            payload.floorplan_y  = this.obsForm.floorplan_y;
          } else {
            payload.clear_pin = true;
          }
        }
        let saved;
        if (this.obsMode === 'new') {
          saved = await API.createSafetyObservation(payload);
        } else {
          payload.updated_at = this.obsCurrent && this.obsCurrent.updated_at;
          saved = await API.updateSafetyObservation(this.obsCurrent.id, payload);
        }
        this.obsCurrent = saved;
        this.obsForm.updated_at = saved.updated_at;
        this.pinTouched = false;
        this.obsMode = 'view';
        await this.loadObservations();
      } catch (e) { this.obsError = e.message || 'Save failed'; }
      finally { this.obsSaving = false; }
    },

    // ── Workflow actions ──────────────────────────────────────────────────
    async submitObs() {
      if (!this.obsCurrent) return;
      if (!confirm(`Submit observation ${this.obsCurrent.display_id}? Package contacts will be notified to acknowledge it.`)) return;
      this.workflowSaving = true;
      try {
        const saved = await API.submitSafetyObservation(this.obsCurrent.id,
          { updated_at: this.obsCurrent.updated_at });
        this.obsCurrent = saved;
        this.obsForm.updated_at = saved.updated_at;
        await this.loadObservations();
      } catch (e) { alert(e.message || 'Submit failed'); }
      finally { this.workflowSaving = false; }
    },
    startWorkflow(mode) {
      this.workflowMode = mode;
      this.workflowComment = '';
      // Surface the comment box so the user can see it on tablet-sized screens.
      this.$nextTick(() => {
        const el = this.$refs.obsWorkflowPrompt;
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const ta = this.$refs.obsWorkflowTextarea;
        if (ta && typeof ta.focus === 'function') ta.focus();
      });
    },
    cancelWorkflow() {
      this.workflowMode = null;
      this.workflowComment = '';
    },
    async confirmWorkflow() {
      if (!this.obsCurrent || !this.workflowMode) return;
      if (this.workflowMode === 'reopen' && !this.workflowComment.trim()) {
        alert('A reason is required when re-opening the observation');
        return;
      }
      this.workflowSaving = true;
      try {
        const body = {
          comment: this.workflowComment.trim() || null,
          updated_at: this.obsCurrent.updated_at,
        };
        let saved;
        if (this.workflowMode === 'acknowledge') saved = await API.acknowledgeSafetyObservation(this.obsCurrent.id, body);
        else if (this.workflowMode === 'close')  saved = await API.closeSafetyObservation(this.obsCurrent.id, body);
        else if (this.workflowMode === 'reopen') saved = await API.reopenSafetyObservation(this.obsCurrent.id, body);
        this.obsCurrent = saved;
        this.obsForm.updated_at = saved.updated_at;
        this.workflowMode = null;
        this.workflowComment = '';
        await this.loadObservations();
      } catch (e) { alert(e.message || 'Action failed'); }
      finally { this.workflowSaving = false; }
    },

    async deleteObs() {
      if (!this.obsCurrent) return;
      if (!confirm(`Delete observation ${this.obsCurrent.display_id}? This cannot be undone.`)) return;
      try {
        await API.deleteSafetyObservation(this.obsCurrent.id);
        this.closeObsModal();
        await this.loadObservations();
      } catch (e) { alert(e.message || 'Delete failed'); }
    },

    // ── Setup (categories — unchanged from the previous module) ───────────
    openSetupModal(item = null) {
      this.setupEditing = { item };
      this.setupForm = item
        ? { name: item.name, description: item.description || '',
            polarity: item.polarity || 'NEGATIVE' }
        : { name: '', description: '', polarity: 'NEGATIVE' };
      this.setupError = '';
    },
    closeSetupModal() { this.setupEditing = null; },
    async saveSetupItem() {
      if (!this.setupForm.name.trim()) { this.setupError = 'Name is required'; return; }
      this.setupSaving = true; this.setupError = '';
      try {
        const body = {
          name: this.setupForm.name.trim(),
          description: this.setupForm.description.trim() || null,
          polarity: this.setupForm.polarity === 'POSITIVE' ? 'POSITIVE' : 'NEGATIVE',
        };
        if (this.setupEditing.item) await API.updateSafetyObservationCategory(this.setupEditing.item.id, body);
        else                         await API.createSafetyObservationCategory(body);
        await this.loadCategories();
        this.closeSetupModal();
      } catch (e) { this.setupError = e.message || 'Save failed'; }
      finally { this.setupSaving = false; }
    },
    async deleteSetupItem(item) {
      if (!confirm(`Remove "${item.name}" ?`)) return;
      try { await API.deleteSafetyObservationCategory(item.id); await this.loadCategories(); }
      catch (e) { alert(e.message || 'Delete failed'); }
    },

    // ── Setup → Severity classes ──────────────────────────────────────────
    async loadSeverityClasses() {
      try { this.severityClasses = await API.listSafetySeverityClasses(); }
      catch (e) { console.error('Load severity classes failed', e); this.severityClasses = []; }
    },
    // Yellow → red gradient, interpolated on the row's index in the ordered list
    // (worst row = solid red, least-worst row = solid yellow).
    severityBarStyle(index) {
      const n = this.severityClasses.length;
      // t=0 at the worst row, t=1 at the least-worst row
      const t = (n <= 1) ? 0 : index / (n - 1);
      // Interpolate between red (#dc2626) at t=0 and yellow (#facc15) at t=1
      const r1 = 0xdc, g1 = 0x26, b1 = 0x26;     // red-600
      const r2 = 0xfa, g2 = 0xcc, b2 = 0x15;     // yellow-400
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return { background: `rgb(${r}, ${g}, ${b})` };
    },
    openSeverityModal(item = null) {
      this.severityEditing = { item };
      this.severityForm = item
        ? { name: item.name, description: item.description || '', updated_at: item.updated_at }
        : { name: '', description: '', updated_at: null };
      this.severityError = '';
    },
    closeSeverityModal() { this.severityEditing = null; },
    async saveSeverityClass() {
      if (!this.severityForm.name.trim()) { this.severityError = 'Name is required'; return; }
      this.severitySaving = true; this.severityError = '';
      try {
        const body = {
          name: this.severityForm.name.trim(),
          description: this.severityForm.description.trim() || null,
        };
        if (this.severityEditing.item) {
          body.updated_at = this.severityForm.updated_at;
          await API.updateSafetySeverityClass(this.severityEditing.item.id, body);
        } else {
          await API.createSafetySeverityClass(body);
        }
        await this.loadSeverityClasses();
        this.closeSeverityModal();
      } catch (e) { this.severityError = e.message || 'Save failed'; }
      finally { this.severitySaving = false; }
    },
    async deleteSeverityClass(item) {
      if (!confirm(`Remove severity class "${item.name}" ?`)) return;
      try { await API.deleteSafetySeverityClass(item.id); await this.loadSeverityClasses(); }
      catch (e) { alert(e.message || 'Delete failed'); }
    },
    async moveSeverity(index, direction) {
      // direction: -1 = up (becomes worse), +1 = down (becomes less severe)
      const target = index + direction;
      if (target < 0 || target >= this.severityClasses.length) return;
      const reordered = this.severityClasses.slice();
      const [moved] = reordered.splice(index, 1);
      reordered.splice(target, 0, moved);
      try {
        await API.reorderSafetySeverityClasses(reordered.map(s => s.id));
        await this.loadSeverityClasses();
      } catch (e) { alert(e.message || 'Reorder failed'); }
    },

    // ── Setup → Incident causes ───────────────────────────────────────────
    async loadIncidentCauses() {
      try { this.incidentCauses = await API.listSafetyIncidentCauses(); }
      catch (e) { console.error('Load incident causes failed', e); this.incidentCauses = []; }
    },
    openIncidentCauseModal(item = null) {
      this.incidentCauseEditing = { item };
      this.incidentCauseForm = item
        ? { name: item.name, description: item.description || '', updated_at: item.updated_at }
        : { name: '', description: '', updated_at: null };
      this.incidentCauseError = '';
    },
    closeIncidentCauseModal() { this.incidentCauseEditing = null; },
    async saveIncidentCause() {
      if (!this.incidentCauseForm.name.trim()) { this.incidentCauseError = 'Name is required'; return; }
      this.incidentCauseSaving = true; this.incidentCauseError = '';
      try {
        const body = {
          name: this.incidentCauseForm.name.trim(),
          description: this.incidentCauseForm.description.trim() || null,
        };
        if (this.incidentCauseEditing.item) {
          body.updated_at = this.incidentCauseForm.updated_at;
          await API.updateSafetyIncidentCause(this.incidentCauseEditing.item.id, body);
        } else {
          await API.createSafetyIncidentCause(body);
        }
        await this.loadIncidentCauses();
        this.closeIncidentCauseModal();
      } catch (e) { this.incidentCauseError = e.message || 'Save failed'; }
      finally { this.incidentCauseSaving = false; }
    },
    async deleteIncidentCause(item) {
      if (item.is_default) { alert('The default "Other" cause cannot be removed.'); return; }
      if (!confirm(`Remove cause "${item.name}" ?`)) return;
      try { await API.deleteSafetyIncidentCause(item.id); await this.loadIncidentCauses(); }
      catch (e) { alert(e.message || 'Delete failed'); }
    },

    // ── Setup → Toolbox categories ────────────────────────────────────────
    async loadToolboxCategories() {
      try { this.toolboxCategories = await API.listSafetyToolboxCategories(); }
      catch (e) { console.error('Load toolbox categories failed', e); this.toolboxCategories = []; }
    },
    openToolboxCategoryModal(item = null) {
      this.toolboxCategoryEditing = { item };
      this.toolboxCategoryForm = item
        ? { name: item.name, description: item.description || '', updated_at: item.updated_at }
        : { name: '', description: '', updated_at: null };
      this.toolboxCategoryError = '';
    },
    closeToolboxCategoryModal() { this.toolboxCategoryEditing = null; },
    async saveToolboxCategory() {
      if (!this.toolboxCategoryForm.name.trim()) { this.toolboxCategoryError = 'Name is required'; return; }
      this.toolboxCategorySaving = true; this.toolboxCategoryError = '';
      try {
        const body = {
          name: this.toolboxCategoryForm.name.trim(),
          description: this.toolboxCategoryForm.description.trim() || null,
        };
        if (this.toolboxCategoryEditing.item) {
          body.updated_at = this.toolboxCategoryForm.updated_at;
          await API.updateSafetyToolboxCategory(this.toolboxCategoryEditing.item.id, body);
        } else {
          await API.createSafetyToolboxCategory(body);
        }
        await this.loadToolboxCategories();
        this.closeToolboxCategoryModal();
      } catch (e) { this.toolboxCategoryError = e.message || 'Save failed'; }
      finally { this.toolboxCategorySaving = false; }
    },
    async deleteToolboxCategory(item) {
      if (item.is_default) { alert('The default "Other" category cannot be removed.'); return; }
      if (!confirm(`Remove category "${item.name}" ?`)) return;
      try { await API.deleteSafetyToolboxCategory(item.id); await this.loadToolboxCategories(); }
      catch (e) { alert(e.message || 'Delete failed'); }
    },

    // ── Incidents ─────────────────────────────────────────────────────────
    async loadIncidents() {
      this.incLoading = true;
      try { this.incidents = await API.listSafetyIncidents(); }
      catch (e) { console.error('Load incidents failed', e); this.incidents = []; }
      finally { this.incLoading = false; }
    },
    incidentStatusPill(s) {
      return {
        DRAFT:               'bg-gray-100 text-gray-700 border-gray-300',
        UNDER_INVESTIGATION: 'bg-blue-100 text-blue-800 border-blue-300',
        ACTION_IN_PROGRESS:  'bg-violet-100 text-violet-800 border-violet-300',
        PENDING_REVIEW:      'bg-amber-100 text-amber-800 border-amber-300',
        CLOSED:              'bg-emerald-100 text-emerald-800 border-emerald-300',
      }[s] || 'bg-gray-100 text-gray-600 border-gray-300';
    },
    incidentStatusLabel(s) {
      return {
        DRAFT: 'Draft',
        UNDER_INVESTIGATION: 'Under investigation',
        ACTION_IN_PROGRESS:  'Action in progress',
        PENDING_REVIEW:      'Pending review',
        CLOSED:              'Closed',
      }[s] || s;
    },
    severityPillStyle(level) {
      // Deterministic yellow→red mapping (level 1 = worst). We don't know the
      // total here, so use a fixed scale of 6 (default seed) clamped to 1..6.
      const t = Math.min(Math.max(((level || 1) - 1) / 5, 0), 1);
      const r1=0xdc, g1=0x26, b1=0x26;
      const r2=0xfa, g2=0xcc, b2=0x15;
      const r = Math.round(r1 + (r2-r1)*t);
      const g = Math.round(g1 + (g2-g1)*t);
      const b = Math.round(b1 + (b2-b1)*t);
      return { background: `rgb(${r}, ${g}, ${b})` };
    },
    incidentEventLabel(e) {
      return {
        CREATED: 'Created',
        SUBMITTED: 'Submitted',
        INVESTIGATED: 'Investigation approved',
        ACTION_DONE: 'Action confirmed done',
        CLOSED: 'Closed',
        REOPENED: 'Re-opened',
      }[e] || e;
    },
    incidentEventBadgeClass(e) {
      return {
        CREATED:      'bg-gray-100 text-gray-700',
        SUBMITTED:    'bg-blue-100 text-blue-700',
        INVESTIGATED: 'bg-indigo-100 text-indigo-700',
        ACTION_DONE:  'bg-amber-100 text-amber-700',
        CLOSED:       'bg-emerald-100 text-emerald-700',
        REOPENED:     'bg-amber-100 text-amber-700',
      }[e] || 'bg-gray-100 text-gray-600';
    },
    incidentEventBulletClass(e) {
      return {
        CREATED:      'bg-gray-400',
        SUBMITTED:    'bg-blue-500',
        INVESTIGATED: 'bg-indigo-500',
        ACTION_DONE:  'bg-amber-500',
        CLOSED:       'bg-emerald-500',
        REOPENED:     'bg-amber-500',
      }[e] || 'bg-gray-400';
    },

    todayIso() {
      const d = new Date();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${m}-${day}`;
    },

    openNewIncident() {
      if (!this.canCreateIncidentInThisProject) return;
      this.incMode = 'new';
      this.incCurrent = null;
      this.incForm = {
        package_id: null,
        area_id: null,
        worker_ids: [],
        incident_date: this.todayIso(),
        severity_class_id: null,
        incident_cause_id: null,
        other_cause_text: '',
        details: '',
        action: '',
        updated_at: null,
      };
      this.incError = '';
      this.incWorkflowMode = null;
      this.incWorkflowComment = '';
      this.showIncModal = true;
    },
    async openIncident(i) {
      try {
        const full = await API.getSafetyIncident(i.id);
        this.incCurrent = full;
        this.incMode = 'view';
        this.incError = '';
        this.incWorkflowMode = null;
        this.incWorkflowComment = '';
        this.incForm = this.incFormFromRecord(full);
        await this.ensureWorkersLoadedFor(full.package_id);
        this.showIncModal = true;
      } catch (e) { alert(e.message || 'Could not open incident'); }
    },
    async openIncidentById(id) {
      await this.openIncident({ id });
    },
    incFormFromRecord(full) {
      return {
        package_id: full.package_id,
        area_id: full.area_id,
        worker_ids: (full.worker_ids || []).slice(),
        incident_date: full.incident_date || '',
        severity_class_id: full.severity_class_id,
        incident_cause_id: full.incident_cause_id,
        other_cause_text: full.other_cause_text || '',
        details: full.details || '',
        action: full.action || '',
        updated_at: full.updated_at,
      };
    },
    closeIncidentModal() {
      this.showIncModal = false;
      this.incCurrent = null;
      this.incMode = 'view';
      this.incWorkflowMode = null;
      this.incWorkflowComment = '';
      this.newNoteContent = '';
      this.noteEditingId = null;
      this.noteEditingContent = '';
    },
    startEditIncident() {
      if (!this.incCurrent) return;
      this.incMode = 'edit';
      this.incWorkflowMode = null;
    },
    cancelEditIncident() {
      if (this.incCurrent) this.incForm = this.incFormFromRecord(this.incCurrent);
      this.incMode = 'view';
      this.incError = '';
    },
    async saveIncident() {
      if (!this.canSaveIncidentForm) {
        this.incError = 'Please fill in all required fields.';
        return;
      }
      this.incSaving = true;
      this.incError = '';
      try {
        const cause = this.incCauseSelected;
        const body = {
          package_id: this.incForm.package_id,
          area_id: this.incForm.area_id,
          worker_ids: (this.incForm.worker_ids || []).slice(),
          incident_date: this.incForm.incident_date,
          severity_class_id: this.incForm.severity_class_id,
          incident_cause_id: this.incForm.incident_cause_id,
          other_cause_text: (cause && cause.is_default)
            ? (this.incForm.other_cause_text || '').trim()
            : null,
          details: (this.incForm.details || '').trim(),
          action: (this.incForm.action || '').trim(),
        };
        let saved;
        if (this.incMode === 'new') {
          saved = await API.createSafetyIncident(body);
        } else {
          body.updated_at = this.incForm.updated_at;
          saved = await API.updateSafetyIncident(this.incCurrent.id, body);
        }
        this.incCurrent = saved;
        this.incForm = this.incFormFromRecord(saved);
        this.incMode = 'view';
        await this.loadIncidents();
      } catch (e) {
        this.incError = e.message || 'Save failed';
      } finally {
        this.incSaving = false;
      }
    },
    async deleteIncident() {
      if (!this.incCurrent) return;
      if (!confirm(`Delete incident ${this.incCurrent.display_id}? This cannot be undone.`)) return;
      try {
        await API.deleteSafetyIncident(this.incCurrent.id);
        this.closeIncidentModal();
        await this.loadIncidents();
      } catch (e) { alert(e.message || 'Delete failed'); }
    },

    startIncWorkflow(mode) {
      this.incWorkflowMode = mode;
      this.incWorkflowComment = '';
      // Surface the comment box so the user can see it on tablet-sized screens.
      this.$nextTick(() => {
        const el = this.$refs.incWorkflowPrompt;
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const ta = this.$refs.incWorkflowTextarea;
        if (ta && typeof ta.focus === 'function') ta.focus();
      });
    },
    cancelIncWorkflow() {
      this.incWorkflowMode = null;
      this.incWorkflowComment = '';
    },
    async confirmIncWorkflow() {
      if (!this.incCurrent || !this.incWorkflowMode) return;
      this.incWorkflowSaving = true;
      try {
        const body = {
          comment: (this.incWorkflowComment || '').trim() || null,
          updated_at: this.incCurrent.updated_at,
        };
        let updated;
        switch (this.incWorkflowMode) {
          case 'submit':
            updated = await API.submitSafetyIncident(this.incCurrent.id, body); break;
          case 'approve_investigation':
            updated = await API.approveIncidentInvestigation(this.incCurrent.id, body); break;
          case 'mark_action_done':
            updated = await API.markIncidentActionDone(this.incCurrent.id, body); break;
          case 'close':
            updated = await API.closeSafetyIncident(this.incCurrent.id, body); break;
          case 'reopen':
            if (!body.comment) { alert('Please provide a reason for re-opening.'); this.incWorkflowSaving = false; return; }
            updated = await API.reopenSafetyIncident(this.incCurrent.id, body); break;
          default: return;
        }
        this.incCurrent = updated;
        this.incForm = this.incFormFromRecord(updated);
        this.incWorkflowMode = null;
        this.incWorkflowComment = '';
        await this.loadIncidents();
      } catch (e) { alert(e.message || 'Action failed'); }
      finally { this.incWorkflowSaving = false; }
    },

    async submitIncidentDraft() {
      if (!this.incCurrent) return;
      this.incWorkflowSaving = true;
      try {
        const updated = await API.submitSafetyIncident(this.incCurrent.id, {
          updated_at: this.incCurrent.updated_at,
        });
        this.incCurrent = updated;
        this.incForm = this.incFormFromRecord(updated);
        await this.loadIncidents();
      } catch (e) { alert(e.message || 'Submit failed'); }
      finally { this.incWorkflowSaving = false; }
    },

    openIncHistoryModal() {
      if (!this.incCurrent) return;
      this.showIncHistoryModal = true;
    },
    async openIncHistoryFromRow(i) {
      try {
        const full = await API.getSafetyIncident(i.id);
        this.incCurrent = full;
        this.showIncHistoryModal = true;
      } catch (e) { alert(e.message || 'Could not load history'); }
    },
    closeIncHistoryModal() {
      this.showIncHistoryModal = false;
      if (!this.showIncModal) this.incCurrent = null;
    },

    // ── Incident notes ────────────────────────────────────────────────────
    async addIncNote() {
      const content = (this.newNoteContent || '').trim();
      if (!content || !this.incCurrent) return;
      this.noteSaving = true;
      try {
        await API.addSafetyIncidentNote(this.incCurrent.id, { content });
        this.newNoteContent = '';
        const full = await API.getSafetyIncident(this.incCurrent.id);
        this.incCurrent = full;
      } catch (e) { alert(e.message || 'Failed to add note'); }
      finally { this.noteSaving = false; }
    },
    startEditNote(n) {
      this.noteEditingId = n.id;
      this.noteEditingContent = n.content;
    },
    cancelEditNote() {
      this.noteEditingId = null;
      this.noteEditingContent = '';
    },
    async saveEditNote() {
      const content = (this.noteEditingContent || '').trim();
      if (!content || !this.incCurrent || !this.noteEditingId) return;
      this.noteSaving = true;
      try {
        await API.updateSafetyIncidentNote(this.incCurrent.id, this.noteEditingId, { content });
        const full = await API.getSafetyIncident(this.incCurrent.id);
        this.incCurrent = full;
        this.noteEditingId = null;
        this.noteEditingContent = '';
      } catch (e) { alert(e.message || 'Failed to update note'); }
      finally { this.noteSaving = false; }
    },
    async deleteIncNote(n) {
      if (!this.incCurrent) return;
      if (!confirm('Delete this note?')) return;
      try {
        await API.deleteSafetyIncidentNote(this.incCurrent.id, n.id);
        const full = await API.getSafetyIncident(this.incCurrent.id);
        this.incCurrent = full;
      } catch (e) { alert(e.message || 'Failed to delete note'); }
    },
    canEditNote(n) {
      if (!n || !this.currentUser) return false;
      if (this.isOwnerOrAdmin) return true;
      return n.created_by_name === this.currentUser.name;
    },

    incidentTooltip(i) {
      if (!i) return '';
      const details = (i.details || '').trim() || '—';
      const action  = (i.action  || '').trim() || '—';
      return 'Details:\n' + details + '\n\nAction:\n' + action;
    },

    // ── Safety Dashboard ──────────────────────────────────────────────────
    async loadDashboard() {
      this.dashLoading = true;
      try { this.dashData = await API.getSafetyDashboard(); }
      catch (e) { console.error('Load safety dashboard failed', e); this.dashData = null; }
      finally { this.dashLoading = false; }
    },
    startEditRefHours() {
      if (!this.dashData) return;
      this.dashRefHoursDraft = this.dashData.reference_hours;
    },
    cancelEditRefHours() {
      this.dashRefHoursDraft = null;
    },
    async saveRefHours() {
      const v = parseInt(this.dashRefHoursDraft, 10);
      if (!v || v <= 0) { alert('Please enter a positive integer for reference hours.'); return; }
      this.dashRefHoursSaving = true;
      try {
        const r = await API.setSafetyReferenceHours({ reference_hours: v });
        if (this.dashData) this.dashData.reference_hours = r.reference_hours;
        this.dashRefHoursDraft = null;
      } catch (e) { alert(e.message || 'Save failed'); }
      finally { this.dashRefHoursSaving = false; }
    },
    // Rate formula: count × reference_hours / total_hours_on_site (project-wide).
    // Returns 0 when total hours is 0, so the user sees "absolute only" until
    // hours are recorded.
    dashRate(absolute) {
      if (!this.dashData || !this.dashData.total_hours_on_site) return 0;
      return absolute * this.dashData.reference_hours / this.dashData.total_hours_on_site;
    },
    fmtNum(n, decimals = 0) {
      if (n == null || isNaN(n)) return '—';
      return Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    },
    fmtRate(n) {
      if (!n || n === 0) return '—';
      // Show one decimal for rates < 10, integer otherwise
      return n < 10 ? this.fmtNum(n, 1) : this.fmtNum(n, 0);
    },
    severityCellColor(level) {
      // Mirror the severity bar palette (red→yellow); paler tint for cells.
      const t = Math.min(Math.max(((level || 1) - 1) / 5, 0), 1);
      const r = Math.round(0xfe + (0xff - 0xfe) * t);
      const g = Math.round(0xe2 + (0xfb - 0xe2) * t);
      const b = Math.round(0xe2 + (0xeb - 0xe2) * t);
      return `rgb(${r},${g},${b})`;
    },
    // Incident severity pyramid — width tapers from wide (bottom, least
    // severe) to narrow (top, worst). Pixels are easier to reason about
    // than %, but % keeps it responsive — clamp to 35..95.
    pyramidWidth(i, n) {
      if (n <= 1) return 70;
      // i=0 → top (worst, narrowest); i=n-1 → bottom (widest)
      return 35 + (95 - 35) * (i / (n - 1));
    },
    // Top = red (#dc2626) → bottom = yellow (#facc15), interpolated.
    pyramidColor(i, n) {
      const t = (n <= 1) ? 0 : i / (n - 1);
      // i=0 (top, t=0) = red; i=n-1 (bottom, t=1) = yellow
      const r1 = 0xdc, g1 = 0x26, b1 = 0x26;
      const r2 = 0xfa, g2 = 0xcc, b2 = 0x15;
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `rgb(${r},${g},${b})`;
    },
    // Column-wise heatmap: green (low) → red (high) within a column.
    // Pass invert=true for "more is better" metrics (positive observations,
    // toolbox talks) so green marks the highest value instead.
    // Uses pastel ranges so the cell text remains readable.
    heatmapColor(value, max, invert = false) {
      if (!value || max <= 0) return 'transparent';
      let t = Math.min(Math.max(value / max, 0), 1);
      if (invert) t = 1 - t;
      // Green-200 #BBF7D0 → Red-200 #FECACA
      const r1 = 0xBB, g1 = 0xF7, b1 = 0xD0;
      const r2 = 0xFE, g2 = 0xCA, b2 = 0xCA;
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `rgb(${r},${g},${b})`;
    },
    destroyDashCharts() {
      Object.keys(this.dashChartObjs).forEach(k => {
        const c = this.dashChartObjs[k];
        if (c) { try { c.destroy(); } catch (e) {} this.dashChartObjs[k] = null; }
      });
    },
    dashTrendSeries(metric) {
      if (!this.dashData) return [];
      if (this.dashTrendPackage) {
        const pkg = this.dashData.trend_per_pkg[this.dashTrendPackage];
        return pkg ? pkg[metric] : [];
      }
      return this.dashData.trend_total[metric] || [];
    },
    renderDashCharts() {
      if (typeof Chart === 'undefined' || !this.dashData) return;
      this.destroyDashCharts();
      const labels = this.dashData.weeks.map(w => w.label);
      const config = (data, color, isFloat) => ({
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: color,
            borderRadius: 0,
            borderSkipped: false,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, datalabels: { display: false },
            tooltip: { callbacks: {
              title: (items) => 'Week of ' + (this.dashData.weeks[items[0].dataIndex] || {}).start,
              label: (item) => isFloat
                ? Math.round(item.parsed.y).toLocaleString() + ' h'
                : String(item.parsed.y),
            } },
          },
          scales: {
            x: { stacked: false, grid: { display: false }, ticks: { font: { size: 10 }, autoSkip: false } },
            y: { beginAtZero: true, grid: { color: '#F3F4F6' }, ticks: { font: { size: 10 }, precision: isFloat ? 1 : 0 } },
          },
        },
      });
      const refs = [
        ['hours',     '#00AEEF', true ],
        ['neg_obs',   '#dc2626', false],
        ['incidents', '#7c3aed', false],
        ['toolboxes', '#10b981', false],
      ];
      for (const [metric, color, isFloat] of refs) {
        const canvas = this.$refs['dashChart_' + metric];
        if (!canvas) continue;
        const data = this.dashTrendSeries(metric);
        this.dashChartObjs[metric] = new Chart(canvas, config(data, color, isFloat));
      }
      // Default-scroll the wrapper to the right so the most recent week is in view.
      this.$nextTick(() => {
        const wrap = this.$refs.dashTrendScroll;
        if (wrap) wrap.scrollLeft = wrap.scrollWidth;
      });
    },
    obsWorkflowCommentBoxClass(event) {
      return {
        ACKNOWLEDGED: 'bg-indigo-50 border-indigo-200',
        CLOSED:       'bg-emerald-50 border-emerald-200',
        REOPENED:     'bg-orange-50 border-orange-200',
      }[event] || 'bg-gray-50 border-gray-200';
    },
    obsWorkflowCommentLabelClass(event) {
      return {
        ACKNOWLEDGED: 'text-indigo-600',
        CLOSED:       'text-emerald-700',
        REOPENED:     'text-orange-700',
      }[event] || 'text-gray-600';
    },
    obsWorkflowCommentTitle(entry) {
      const who = entry.actor_name || '—';
      const when = entry.created_at ? this.fmtDateTime(entry.created_at) : '';
      const verb = {
        ACKNOWLEDGED: 'Acknowledged by',
        CLOSED:       'Closed by',
        REOPENED:     'Re-opened by',
      }[entry.event] || entry.event + ' by';
      return `${verb} ${who}${when ? ' · ' + when : ''}`;
    },
    incWorkflowCommentBoxClass(event) {
      return {
        INVESTIGATED: 'bg-indigo-50 border-indigo-200',
        ACTION_DONE:  'bg-amber-50 border-amber-200',
        REOPENED:     'bg-orange-50 border-orange-200',
        CLOSED:       'bg-emerald-50 border-emerald-200',
      }[event] || 'bg-gray-50 border-gray-200';
    },
    incWorkflowCommentLabelClass(event) {
      return {
        INVESTIGATED: 'text-indigo-600',
        ACTION_DONE:  'text-amber-700',
        REOPENED:     'text-orange-700',
        CLOSED:       'text-emerald-700',
      }[event] || 'text-gray-600';
    },
    incWorkflowCommentTitle(entry) {
      const who = entry.actor_name || '—';
      const when = entry.created_at ? this.fmtDateTime(entry.created_at) : '';
      const verb = {
        INVESTIGATED: 'Action plan reviewed by',
        ACTION_DONE:  'Action confirmed done by',
        REOPENED:     'Re-opened by',
        CLOSED:       'Closed by',
      }[entry.event] || entry.event + ' by';
      return `${verb} ${who}${when ? ' · ' + when : ''}`;
    },
    // ── Toolbox tab ────────────────────────────────────────────────────────
    async loadToolboxes() {
      this.tbxLoading = true;
      try { this.toolboxes = await API.listSafetyToolboxes(); }
      catch (e) { console.error('Load toolboxes failed', e); this.toolboxes = []; }
      finally { this.tbxLoading = false; }
    },
    async loadToolboxGivers() {
      try { this.tbxGivers = await API.getSafetyToolboxGivers(); }
      catch (e) { console.error('Load toolbox givers failed', e); this.tbxGivers = { users: [], workers: [] }; }
    },
    tbxStatusPill(s) {
      return {
        DRAFT:     'bg-gray-100 text-gray-700 border-gray-300',
        SUBMITTED: 'bg-blue-100 text-blue-800 border-blue-300',
        RECEIVED:  'bg-emerald-100 text-emerald-800 border-emerald-300',
      }[s] || 'bg-gray-100 text-gray-600 border-gray-300';
    },
    tbxStatusLabel(s) {
      return { DRAFT: 'Draft', SUBMITTED: 'Submitted', RECEIVED: 'Received' }[s] || s;
    },
    tbxEventLabel(e) {
      return {
        CREATED: 'Created', SUBMITTED: 'Submitted',
        ACKNOWLEDGED: 'Acknowledged', REOPENED: 'Re-opened',
      }[e] || e;
    },
    tbxEventBadgeClass(e) {
      return {
        CREATED:      'bg-gray-100 text-gray-700',
        SUBMITTED:    'bg-blue-100 text-blue-700',
        ACKNOWLEDGED: 'bg-emerald-100 text-emerald-700',
        REOPENED:     'bg-amber-100 text-amber-700',
      }[e] || 'bg-gray-100 text-gray-600';
    },
    tbxEventBulletClass(e) {
      return {
        CREATED:      'bg-gray-400',
        SUBMITTED:    'bg-blue-500',
        ACKNOWLEDGED: 'bg-emerald-500',
        REOPENED:     'bg-amber-500',
      }[e] || 'bg-gray-400';
    },
    openNewToolbox() {
      if (this.isBidder) return;
      this.tbxMode = 'new';
      this.tbxCurrent = null;
      this.tbxForm = {
        package_ids: [],
        worker_ids: [],
        observation_ids: [],
        incident_ids: [],
        given_by_user_id: null,
        given_by_worker_id: null,
        category_id: null,
        other_category_text: '',
        talk_date: this.todayIso(),
        details: '',
        updated_at: null,
      };
      this.tbxError = '';
      this.tbxGiverSearch = '';
      this.tbxObsSearch = '';
      this.tbxIncSearch = '';
      this.tbxWorkflowMode = null;
      this.tbxWorkflowComment = '';
      this.showTbxModal = true;
    },
    async openToolbox(t) {
      try {
        const full = await API.getSafetyToolbox(t.id);
        this.tbxCurrent = full;
        this.tbxMode = 'view';
        this.tbxError = '';
        this.tbxForm = this.tbxFormFromRecord(full);
        this.tbxGiverSearch = '';
        this.tbxObsSearch = '';
        this.tbxIncSearch = '';
        // make sure cascaded worker lists are loaded for every selected pkg
        for (const pid of full.package_ids || []) {
          await this.ensureWorkersLoadedFor(pid);
        }
        this.showTbxModal = true;
      } catch (e) { alert(e.message || 'Could not open toolbox'); }
    },
    tbxFormFromRecord(full) {
      return {
        package_ids:     (full.package_ids || []).slice(),
        worker_ids:      (full.worker_ids || []).slice(),
        observation_ids: (full.observation_ids || []).slice(),
        incident_ids:    (full.incident_ids || []).slice(),
        given_by_user_id:   full.given_by_user_id,
        given_by_worker_id: full.given_by_worker_id,
        category_id: full.category_id,
        other_category_text: full.other_category_text || '',
        talk_date: full.talk_date || '',
        details: full.details || '',
        updated_at: full.updated_at,
      };
    },
    closeTbxModal() {
      this.showTbxModal = false;
      this.tbxCurrent = null;
      this.tbxMode = 'view';
      this.tbxWorkflowMode = null;
      this.tbxWorkflowComment = '';
    },
    startEditToolbox() {
      if (!this.tbxCurrent) return;
      this.tbxMode = 'edit';
    },
    cancelEditToolbox() {
      if (this.tbxCurrent) this.tbxForm = this.tbxFormFromRecord(this.tbxCurrent);
      this.tbxMode = 'view';
      this.tbxError = '';
    },
    togglePackageInTbx(pid) {
      if (this.tbxMode === 'view') return;
      const idx = this.tbxForm.package_ids.indexOf(pid);
      if (idx === -1) {
        this.tbxForm.package_ids.push(pid);
        this.ensureWorkersLoadedFor(pid);
      } else {
        this.tbxForm.package_ids.splice(idx, 1);
        // Drop workers that no longer have a package in the selection.
        const allWorkers = this.tbxWorkerOptions.map(w => w.id);
        this.tbxForm.worker_ids = this.tbxForm.worker_ids.filter(wid => allWorkers.indexOf(wid) !== -1);
      }
    },
    selectAllPackagesInTbx() {
      if (this.tbxMode === 'view') return;
      this.tbxForm.package_ids = this.tbxPackageOptions.map(p => p.id);
      for (const pid of this.tbxForm.package_ids) this.ensureWorkersLoadedFor(pid);
    },
    clearAllPackagesInTbx() {
      if (this.tbxMode === 'view') return;
      this.tbxForm.package_ids = [];
      this.tbxForm.worker_ids = [];
    },
    toggleWorkerInTbx(wid) {
      if (this.tbxMode === 'view') return;
      const idx = this.tbxForm.worker_ids.indexOf(wid);
      if (idx === -1) this.tbxForm.worker_ids.push(wid);
      else this.tbxForm.worker_ids.splice(idx, 1);
    },
    selectAllWorkersInTbx() {
      if (this.tbxMode === 'view') return;
      this.tbxForm.worker_ids = this.tbxWorkerOptions.map(w => w.id);
    },
    clearAllWorkersInTbx() {
      if (this.tbxMode === 'view') return;
      this.tbxForm.worker_ids = [];
    },
    toggleObservationInTbx(oid) {
      if (this.tbxMode === 'view') return;
      const idx = this.tbxForm.observation_ids.indexOf(oid);
      if (idx === -1) this.tbxForm.observation_ids.push(oid);
      else this.tbxForm.observation_ids.splice(idx, 1);
    },
    toggleIncidentInTbx(iid) {
      if (this.tbxMode === 'view') return;
      const idx = this.tbxForm.incident_ids.indexOf(iid);
      if (idx === -1) this.tbxForm.incident_ids.push(iid);
      else this.tbxForm.incident_ids.splice(idx, 1);
    },
    async saveToolbox() {
      if (!this.canSaveToolboxForm) {
        this.tbxError = 'Please fill in all required fields.';
        return;
      }
      this.tbxSaving = true; this.tbxError = '';
      try {
        const cat = this.tbxCategorySelected;
        const body = {
          package_ids: this.tbxForm.package_ids.slice(),
          worker_ids:  this.tbxForm.worker_ids.slice(),
          observation_ids: this.tbxForm.observation_ids.slice(),
          incident_ids:    this.tbxForm.incident_ids.slice(),
          given_by_user_id:   this.tbxForm.given_by_user_id || null,
          given_by_worker_id: this.tbxForm.given_by_worker_id || null,
          category_id: this.tbxForm.category_id,
          other_category_text: (cat && cat.is_default) ? (this.tbxForm.other_category_text || '').trim() : null,
          talk_date: this.tbxForm.talk_date,
          details: (this.tbxForm.details || '').trim(),
        };
        let saved;
        if (this.tbxMode === 'new') saved = await API.createSafetyToolbox(body);
        else {
          body.updated_at = this.tbxForm.updated_at;
          saved = await API.updateSafetyToolbox(this.tbxCurrent.id, body);
        }
        this.tbxCurrent = saved;
        this.tbxForm = this.tbxFormFromRecord(saved);
        this.tbxMode = 'view';
        await this.loadToolboxes();
      } catch (e) { this.tbxError = e.message || 'Save failed'; }
      finally { this.tbxSaving = false; }
    },
    async deleteToolbox() {
      if (!this.tbxCurrent) return;
      if (!confirm(`Delete toolbox ${this.tbxCurrent.display_id}? This cannot be undone.`)) return;
      try {
        await API.deleteSafetyToolbox(this.tbxCurrent.id);
        this.closeTbxModal();
        await this.loadToolboxes();
      } catch (e) { alert(e.message || 'Delete failed'); }
    },
    async submitToolbox() {
      if (!this.tbxCurrent) return;
      this.tbxWorkflowSaving = true;
      try {
        const updated = await API.submitSafetyToolbox(this.tbxCurrent.id, { updated_at: this.tbxCurrent.updated_at });
        this.tbxCurrent = updated;
        this.tbxForm = this.tbxFormFromRecord(updated);
        await this.loadToolboxes();
        // refresh observations/incidents lists so the toolbox_count badges update
        await Promise.all([this.loadObservations(), this.loadIncidents()]);
      } catch (e) { alert(e.message || 'Submit failed'); }
      finally { this.tbxWorkflowSaving = false; }
    },
    async acknowledgeToolbox() {
      if (!this.tbxCurrent) return;
      this.tbxWorkflowSaving = true;
      try {
        const updated = await API.acknowledgeSafetyToolbox(this.tbxCurrent.id, { updated_at: this.tbxCurrent.updated_at });
        this.tbxCurrent = updated;
        this.tbxForm = this.tbxFormFromRecord(updated);
        await this.loadToolboxes();
      } catch (e) { alert(e.message || 'Acknowledge failed'); }
      finally { this.tbxWorkflowSaving = false; }
    },
    startTbxReopen() {
      this.tbxWorkflowMode = 'reopen';
      this.tbxWorkflowComment = '';
      this.$nextTick(() => {
        const el = this.$refs.tbxWorkflowPrompt;
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const ta = this.$refs.tbxWorkflowTextarea;
        if (ta && typeof ta.focus === 'function') ta.focus();
      });
    },
    cancelTbxWorkflow() {
      this.tbxWorkflowMode = null;
      this.tbxWorkflowComment = '';
    },
    async confirmTbxWorkflow() {
      if (!this.tbxCurrent || this.tbxWorkflowMode !== 'reopen') return;
      const reason = (this.tbxWorkflowComment || '').trim();
      if (!reason) { alert('Please provide a reason for re-opening.'); return; }
      this.tbxWorkflowSaving = true;
      try {
        const updated = await API.reopenSafetyToolbox(this.tbxCurrent.id, {
          comment: reason, updated_at: this.tbxCurrent.updated_at,
        });
        this.tbxCurrent = updated;
        this.tbxForm = this.tbxFormFromRecord(updated);
        this.tbxMode = 'view';
        this.tbxWorkflowMode = null;
        this.tbxWorkflowComment = '';
        await this.loadToolboxes();
      } catch (e) { alert(e.message || 'Re-open failed'); }
      finally { this.tbxWorkflowSaving = false; }
    },
    openTbxHistoryModal() {
      if (!this.tbxCurrent) return;
      this.showTbxHistoryModal = true;
    },
    async openTbxHistoryFromRow(t) {
      try {
        const full = await API.getSafetyToolbox(t.id);
        this.tbxCurrent = full;
        this.showTbxHistoryModal = true;
      } catch (e) { alert(e.message || 'Could not load history'); }
    },
    closeTbxHistoryModal() {
      this.showTbxHistoryModal = false;
      if (!this.showTbxModal) this.tbxCurrent = null;
    },
    // Toggle a worker id on/off in the multi-select chip list.
    toggleWorker(workerId) {
      if (this.incMode === 'view') return;
      const idx = this.incForm.worker_ids.indexOf(workerId);
      if (idx === -1) this.incForm.worker_ids.push(workerId);
      else this.incForm.worker_ids.splice(idx, 1);
    },
  },

  template: `
  <div>
    <div class="sub-tabs">
      <button @click="activeTab = 'dashboard'"
        :class="['sub-tab', activeTab === 'dashboard' ? 'active' : '']">Dashboard</button>
      <button @click="activeTab = 'observations'"
        :class="['sub-tab', activeTab === 'observations' ? 'active' : '']">Observations</button>
      <button @click="activeTab = 'incidents'"
        :class="['sub-tab', activeTab === 'incidents' ? 'active' : '']">Incidents</button>
      <button @click="activeTab = 'toolbox'"
        :class="['sub-tab', activeTab === 'toolbox' ? 'active' : '']">Toolbox</button>
      <button @click="activeTab = 'floorplans'"
        :class="['sub-tab', activeTab === 'floorplans' ? 'active' : '']">Floorplan view</button>
      <button @click="activeTab = 'reports'"
        :class="['sub-tab', activeTab === 'reports' ? 'active' : '']">
        Reports
        <span v-if="activeReportsCount > 0"
              class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">{{ activeReportsCount }}</span>
      </button>
      <button @click="activeTab = 'setup'"
        :class="['sub-tab', activeTab === 'setup' ? 'active' : '']">Setup</button>
    </div>

    <!-- ════════════════════════ DASHBOARD TAB ═══════════════════════════ -->
    <div v-if="activeTab === 'dashboard'">
      <div v-if="isBidder" class="card p-4 bg-amber-50 border-amber-200 text-amber-700 text-sm mt-4">
        Bidders cannot view the safety dashboard.
      </div>

      <template v-else>
        <!-- Loading state -->
        <div v-if="dashLoading && !dashData" class="text-center py-12">
          <img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/>
        </div>

        <template v-if="dashData">
          <!-- ── Reference hours header ────────────────────────────────── -->
          <div class="card flex items-center justify-between flex-wrap gap-3 mt-6 mb-4 px-4 py-3 bg-gray-50 border-gray-200">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background:#E0F2FE">
                <svg class="w-5 h-5 text-ips-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
              </div>
              <div>
                <p class="text-xs uppercase tracking-wider text-gray-500 font-semibold">Reference hours for rate calculation</p>
                <div v-if="dashRefHoursDraft === null" class="flex items-baseline gap-2">
                  <p class="text-2xl font-bold text-gray-800">{{ fmtNum(dashData.reference_hours) }}</p>
                  <p class="text-xs text-gray-500">all rates below are <span class="font-mono">absolute × {{ fmtNum(dashData.reference_hours) }} / total hours on site</span></p>
                </div>
                <div v-else class="flex items-center gap-2">
                  <input v-model.number="dashRefHoursDraft" type="number" min="1"
                         class="input-field text-sm" style="width:160px" />
                  <button @click="saveRefHours" :disabled="dashRefHoursSaving"
                          class="btn-primary text-xs">
                    {{ dashRefHoursSaving ? 'Saving…' : 'Save' }}
                  </button>
                  <button @click="cancelEditRefHours" class="btn-secondary text-xs">Cancel</button>
                </div>
              </div>
            </div>
            <button v-if="isOwnerOrAdmin && dashRefHoursDraft === null"
                    @click="startEditRefHours" class="btn-secondary text-xs">Change</button>
          </div>

          <!-- ── KPI strip ─────────────────────────────────────────────── -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <div class="card text-white" style="background:linear-gradient(135deg,#00AEEF,#0090cc)">
              <p class="text-sm opacity-80">Total Hours On Site</p>
              <p class="text-3xl font-bold mt-1">{{ fmtNum(dashData.total_hours_on_site) }}</p>
              <p class="text-xs opacity-60 mt-1">hours worked</p>
            </div>
            <div class="card text-white" style="background:linear-gradient(135deg,#dc2626,#b91c1c)">
              <p class="text-sm opacity-80">Negative Observations</p>
              <p class="text-3xl font-bold mt-1">{{ fmtNum(dashData.neg_obs_total) }}</p>
              <p class="text-xs opacity-60 mt-1">rate {{ fmtRate(dashRate(dashData.neg_obs_total)) }}</p>
            </div>
            <div class="card text-white" style="background:linear-gradient(135deg,#7c3aed,#5b21b6)">
              <p class="text-sm opacity-80">Incidents</p>
              <p class="text-3xl font-bold mt-1">{{ fmtNum(dashData.incidents_total) }}</p>
              <p class="text-xs opacity-60 mt-1">rate {{ fmtRate(dashRate(dashData.incidents_total)) }}</p>
            </div>
            <div class="card text-white" style="background:linear-gradient(135deg,#10b981,#047857)">
              <p class="text-sm opacity-80">Toolbox Talks</p>
              <p class="text-3xl font-bold mt-1">{{ fmtNum(dashData.toolboxes_total) }}</p>
              <p class="text-xs opacity-60 mt-1">rate {{ fmtRate(dashRate(dashData.toolboxes_total)) }}</p>
            </div>
          </div>

          <!-- ── Incident severity pyramid ──────────────────────────────── -->
          <div class="card p-0 overflow-hidden mb-5">
            <div class="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-1">
              <h4 class="font-semibold text-gray-800 text-sm">Incident severity pyramid</h4>
              <p class="text-xs text-gray-500">Worst severity at the top (red), least severe at the bottom (yellow). Each level shows the rate (large) and the absolute count.</p>
            </div>
            <div class="p-4">
              <div class="flex flex-col items-stretch gap-1">
                <div v-for="(s, i) in dashData.severities" :key="'pyr-' + s.id"
                     class="mx-auto rounded text-white px-4 py-2 shadow-sm"
                     :style="{ width: pyramidWidth(i, dashData.severities.length) + '%', background: pyramidColor(i, dashData.severities.length) }">
                  <div class="grid grid-cols-3 items-center gap-2">
                    <!-- Left: severity name -->
                    <span class="font-semibold text-xs uppercase tracking-wider truncate text-left">{{ s.name }}</span>
                    <!-- Middle: absolute count (prominent) -->
                    <div class="text-center">
                      <div class="text-xl font-bold leading-none">{{ dashData.incidents_per_sev[s.id] }}</div>
                      <div class="text-[10px] opacity-80 leading-tight">{{ dashData.incidents_per_sev[s.id] === 1 ? 'incident' : 'incidents' }}</div>
                    </div>
                    <!-- Right: rate -->
                    <div class="text-right">
                      <div class="text-sm font-semibold leading-none">
                        {{ dashData.incidents_per_sev[s.id]
                            ? fmtRate(dashRate(dashData.incidents_per_sev[s.id]))
                            : '—' }}
                      </div>
                      <div class="text-[10px] opacity-80 leading-tight">rate</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Per-package totals matrix (consolidated heat-map) ─────── -->
          <div class="card p-0 overflow-hidden mb-5">
            <div class="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-1">
              <h4 class="font-semibold text-gray-800 text-sm">Per-package overview</h4>
              <p class="text-xs text-gray-500">Each cell shows the rate (large) and the absolute count or hours (small). Cells are coloured per column from green (lowest) to red (highest).</p>
            </div>
            <table class="w-full text-xs">
              <thead class="bg-gray-50 border-b border-gray-200 text-[10px] text-gray-500 uppercase tracking-wider">
                <tr>
                  <th class="text-left px-3 py-1.5 whitespace-nowrap">Package</th>
                  <th class="text-center px-2 py-1.5">Hours worked</th>
                  <th class="text-center px-2 py-1.5">Incidents</th>
                  <th class="text-center px-2 py-1.5">Negative obs.</th>
                  <th class="text-center px-2 py-1.5">Positive obs.</th>
                  <th class="text-center px-2 py-1.5">Toolboxes</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in dashData.packages" :key="'oa-' + p.id" class="border-b border-gray-100">
                  <td class="px-3 py-1.5 align-middle whitespace-nowrap">
                    <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white mr-1.5" style="background:#1B4F8C">{{ p.tag }}</span>
                    <span class="text-gray-700">{{ p.name }}</span>
                  </td>
                  <!-- Hours: absolute primary (rate not meaningful for hours) -->
                  <td class="text-center px-2 py-1.5"
                      :style="{ background: heatmapColor(dashData.hours_by_package[p.id] || 0, consolidatedColMax.hours) }">
                    <div class="font-semibold">{{ fmtNum(dashData.hours_by_package[p.id] || 0) }} h</div>
                    <div class="text-[10px] text-gray-600">{{ dashData.total_hours_on_site
                       ? fmtNum((dashData.hours_by_package[p.id] || 0) / dashData.total_hours_on_site * 100, 1) + '% of site'
                       : '—' }}</div>
                  </td>
                  <!-- Incidents -->
                  <td class="text-center px-2 py-1.5"
                      :style="{ background: heatmapColor(dashData.incidents_per_pkg[p.id] || 0, consolidatedColMax.incidents) }">
                    <template v-if="dashData.incidents_per_pkg[p.id]">
                      <div class="font-semibold">{{ fmtRate(dashRate(dashData.incidents_per_pkg[p.id])) }}</div>
                      <div class="text-[10px] text-gray-600">({{ dashData.incidents_per_pkg[p.id] }})</div>
                    </template>
                    <span v-else class="text-gray-300">—</span>
                  </td>
                  <!-- Negative obs -->
                  <td class="text-center px-2 py-1.5"
                      :style="{ background: heatmapColor(dashData.neg_obs_per_pkg[p.id] || 0, consolidatedColMax.neg_obs) }">
                    <template v-if="dashData.neg_obs_per_pkg[p.id]">
                      <div class="font-semibold">{{ fmtRate(dashRate(dashData.neg_obs_per_pkg[p.id])) }}</div>
                      <div class="text-[10px] text-gray-600">({{ dashData.neg_obs_per_pkg[p.id] }})</div>
                    </template>
                    <span v-else class="text-gray-300">—</span>
                  </td>
                  <!-- Positive obs (more = better; invert the colour scale) -->
                  <td class="text-center px-2 py-1.5"
                      :style="{ background: heatmapColor(dashData.pos_obs_per_pkg[p.id] || 0, consolidatedColMax.pos_obs, true) }">
                    <template v-if="dashData.pos_obs_per_pkg[p.id]">
                      <div class="font-semibold">{{ fmtRate(dashRate(dashData.pos_obs_per_pkg[p.id])) }}</div>
                      <div class="text-[10px] text-gray-600">({{ dashData.pos_obs_per_pkg[p.id] }})</div>
                    </template>
                    <span v-else class="text-gray-300">—</span>
                  </td>
                  <!-- Toolboxes -->
                  <td class="text-center px-2 py-1.5"
                      :style="{ background: heatmapColor(dashData.toolboxes_per_pkg[p.id] || 0, consolidatedColMax.toolboxes) }">
                    <template v-if="dashData.toolboxes_per_pkg[p.id]">
                      <div class="font-semibold">{{ fmtRate(dashRate(dashData.toolboxes_per_pkg[p.id])) }}</div>
                      <div class="text-[10px] text-gray-600">({{ dashData.toolboxes_per_pkg[p.id] }})</div>
                    </template>
                    <span v-else class="text-gray-300">—</span>
                  </td>
                </tr>
                <tr class="bg-gray-50 font-semibold border-t-2 border-gray-300">
                  <td class="px-3 py-1.5">Total on site</td>
                  <td class="text-center px-2 py-1.5">
                    <div>{{ fmtNum(dashData.total_hours_on_site) }} h</div>
                    <div class="text-[10px] text-gray-500 font-normal">100%</div>
                  </td>
                  <td class="text-center px-2 py-1.5">
                    <div>{{ fmtRate(dashRate(dashData.incidents_total)) }}</div>
                    <div class="text-[10px] text-gray-500 font-normal">({{ dashData.incidents_total }})</div>
                  </td>
                  <td class="text-center px-2 py-1.5">
                    <div>{{ fmtRate(dashRate(dashData.neg_obs_total)) }}</div>
                    <div class="text-[10px] text-gray-500 font-normal">({{ dashData.neg_obs_total }})</div>
                  </td>
                  <td class="text-center px-2 py-1.5">
                    <div>{{ fmtRate(dashRate(dashData.pos_obs_total)) }}</div>
                    <div class="text-[10px] text-gray-500 font-normal">({{ dashData.pos_obs_total }})</div>
                  </td>
                  <td class="text-center px-2 py-1.5">
                    <div>{{ fmtRate(dashRate(dashData.toolboxes_total)) }}</div>
                    <div class="text-[10px] text-gray-500 font-normal">({{ dashData.toolboxes_total }})</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- ── Trending charts ───────────────────────────────────────── -->
          <div class="card p-0 overflow-hidden mb-5">
            <div class="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
              <h4 class="font-semibold text-gray-800 text-sm">Weekly trends</h4>
              <div class="flex items-center gap-2">
                <label class="text-xs font-semibold text-gray-500">Package</label>
                <select v-model.number="dashTrendPackage" class="input-field text-sm" style="width:auto;min-width:200px">
                  <option :value="''">All packages (totals)</option>
                  <option v-for="p in dashData.packages" :key="'tr-p-' + p.id" :value="p.id">{{ p.tag }} — {{ p.name }}</option>
                </select>
              </div>
            </div>
            <div class="p-4 space-y-4">
              <div>
                <p class="text-xs font-semibold text-gray-600 mb-1.5">Hours worked</p>
                <div ref="dashTrendScroll" class="overflow-x-auto" style="-webkit-overflow-scrolling:touch">
                  <div :style="{ width: Math.max(dashData.weeks.length, 1) * 36 + 'px', minWidth: '100%', height: '160px' }">
                    <canvas ref="dashChart_hours"></canvas>
                  </div>
                </div>
              </div>
              <div>
                <p class="text-xs font-semibold text-gray-600 mb-1.5">Negative safety observations</p>
                <div class="overflow-x-auto" style="-webkit-overflow-scrolling:touch">
                  <div :style="{ width: Math.max(dashData.weeks.length, 1) * 36 + 'px', minWidth: '100%', height: '160px' }">
                    <canvas ref="dashChart_neg_obs"></canvas>
                  </div>
                </div>
              </div>
              <div>
                <p class="text-xs font-semibold text-gray-600 mb-1.5">Incidents</p>
                <div class="overflow-x-auto" style="-webkit-overflow-scrolling:touch">
                  <div :style="{ width: Math.max(dashData.weeks.length, 1) * 36 + 'px', minWidth: '100%', height: '160px' }">
                    <canvas ref="dashChart_incidents"></canvas>
                  </div>
                </div>
              </div>
              <div>
                <p class="text-xs font-semibold text-gray-600 mb-1.5">Toolbox talks</p>
                <div class="overflow-x-auto" style="-webkit-overflow-scrolling:touch">
                  <div :style="{ width: Math.max(dashData.weeks.length, 1) * 36 + 'px', minWidth: '100%', height: '160px' }">
                    <canvas ref="dashChart_toolboxes"></canvas>
                  </div>
                </div>
              </div>
              <p class="text-xs text-gray-400 mt-1">
                {{ dashData.weeks.length }} weeks of history · ≈26 weeks visible · scroll horizontally to view earlier data.
              </p>
            </div>
          </div>

          <!-- ══════════ Detailed matrices (per-package × dimension) ══════════ -->

          <!-- ── Incidents matrix (per severity) ──────────────────────── -->
          <div class="card p-0 overflow-hidden mb-5">
            <div class="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-1">
              <h4 class="font-semibold text-gray-800 text-sm">Incidents per severity per package</h4>
              <p class="text-xs text-gray-500">Cells coloured per column from green (lowest) to red (highest).</p>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead class="bg-gray-50 border-b border-gray-200 text-[10px] text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th class="text-left px-3 py-1.5 sticky left-0 bg-gray-50 align-bottom whitespace-nowrap">Package</th>
                    <th v-for="s in dashData.severities" :key="'inc-h-' + s.id"
                        class="text-center px-2 py-1.5 align-bottom" style="min-width:6rem;max-width:8rem"
                        :title="s.name">
                      <div class="flex flex-col items-center gap-1">
                        <span class="w-2.5 h-2.5 rounded-sm" :style="{ background: severityCellColor(s.level) }"></span>
                        <span class="font-semibold text-[10px] leading-tight whitespace-normal break-words">{{ s.name }}</span>
                      </div>
                    </th>
                    <th class="text-right px-3 py-1.5 w-20 bg-gray-100 align-bottom">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in dashData.packages" :key="'inc-r-' + p.id" class="border-b border-gray-100">
                    <td class="px-3 py-1.5 sticky left-0 bg-white whitespace-nowrap">
                      <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white mr-1.5" style="background:#1B4F8C">{{ p.tag }}</span>
                      <span class="text-gray-700">{{ p.name }}</span>
                    </td>
                    <td v-for="s in dashData.severities" :key="'inc-c-' + p.id + '-' + s.id"
                        class="text-center px-2 py-1.5"
                        :style="{ background: heatmapColor(dashData.incidents_matrix[p.id][s.id], incidentColMax[s.id]) }">
                      <template v-if="dashData.incidents_matrix[p.id][s.id]">
                        <div class="font-semibold">{{ fmtRate(dashRate(dashData.incidents_matrix[p.id][s.id])) }}</div>
                        <div class="text-[10px] text-gray-600">({{ dashData.incidents_matrix[p.id][s.id] }})</div>
                      </template>
                      <span v-else class="text-gray-300">—</span>
                    </td>
                    <td class="text-right px-3 py-1.5 font-semibold bg-gray-50">
                      <div>{{ fmtRate(dashRate(dashData.incidents_per_pkg[p.id])) }}</div>
                      <div class="text-[10px] text-gray-500 font-normal">({{ dashData.incidents_per_pkg[p.id] }})</div>
                    </td>
                  </tr>
                  <tr class="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                    <td class="px-3 py-1.5 sticky left-0 bg-gray-50 whitespace-nowrap">Total on site</td>
                    <td v-for="s in dashData.severities" :key="'inc-t-' + s.id" class="text-center px-2 py-1.5">
                      <div>{{ fmtRate(dashRate(dashData.incidents_per_sev[s.id])) }}</div>
                      <div class="text-[10px] text-gray-500 font-normal">({{ dashData.incidents_per_sev[s.id] }})</div>
                    </td>
                    <td class="text-right px-3 py-1.5 bg-gray-100">
                      <div>{{ fmtRate(dashRate(dashData.incidents_total)) }}</div>
                      <div class="text-[10px] text-gray-500 font-normal">({{ dashData.incidents_total }})</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- ── Negative observations matrix ──────────────────────────── -->
          <div class="card p-0 overflow-hidden mb-5">
            <div class="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-1">
              <h4 class="font-semibold text-gray-800 text-sm">Negative observations per category per package</h4>
              <p class="text-xs text-gray-500">Cells coloured per column from green (lowest) to red (highest).</p>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead class="bg-gray-50 border-b border-gray-200 text-[10px] text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th class="text-left px-3 py-1.5 sticky left-0 bg-gray-50 align-bottom whitespace-nowrap">Package</th>
                    <th v-for="c in dashData.neg_categories" :key="'no-h-' + c.id"
                        class="text-center px-2 py-1.5 align-bottom" style="min-width:6rem;max-width:8rem"
                        :title="c.name">
                      <span class="font-semibold text-[10px] leading-tight whitespace-normal break-words">{{ c.name }}</span>
                    </th>
                    <th class="text-right px-3 py-1.5 w-20 bg-gray-100 align-bottom">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in dashData.packages" :key="'no-r-' + p.id" class="border-b border-gray-100">
                    <td class="px-3 py-1.5 sticky left-0 bg-white whitespace-nowrap">
                      <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white mr-1.5" style="background:#1B4F8C">{{ p.tag }}</span>
                      <span class="text-gray-700">{{ p.name }}</span>
                    </td>
                    <td v-for="c in dashData.neg_categories" :key="'no-c-' + p.id + '-' + c.id"
                        class="text-center px-2 py-1.5"
                        :style="{ background: heatmapColor(dashData.neg_obs_matrix[p.id][c.id], negObsColMax[c.id]) }">
                      <template v-if="dashData.neg_obs_matrix[p.id][c.id]">
                        <div class="font-semibold">{{ fmtRate(dashRate(dashData.neg_obs_matrix[p.id][c.id])) }}</div>
                        <div class="text-[10px] text-gray-600">({{ dashData.neg_obs_matrix[p.id][c.id] }})</div>
                      </template>
                      <span v-else class="text-gray-300">—</span>
                    </td>
                    <td class="text-right px-3 py-1.5 font-semibold bg-gray-50">
                      <div>{{ fmtRate(dashRate(dashData.neg_obs_per_pkg[p.id])) }}</div>
                      <div class="text-[10px] text-gray-500 font-normal">({{ dashData.neg_obs_per_pkg[p.id] }})</div>
                    </td>
                  </tr>
                  <tr class="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                    <td class="px-3 py-1.5 sticky left-0 bg-gray-50 whitespace-nowrap">Total on site</td>
                    <td v-for="c in dashData.neg_categories" :key="'no-t-' + c.id" class="text-center px-2 py-1.5">
                      <div>{{ fmtRate(dashRate(dashData.neg_obs_per_cat[c.id])) }}</div>
                      <div class="text-[10px] text-gray-500 font-normal">({{ dashData.neg_obs_per_cat[c.id] }})</div>
                    </td>
                    <td class="text-right px-3 py-1.5 bg-gray-100">
                      <div>{{ fmtRate(dashRate(dashData.neg_obs_total)) }}</div>
                      <div class="text-[10px] text-gray-500 font-normal">({{ dashData.neg_obs_total }})</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- ── Positive observations matrix ──────────────────────────── -->
          <div v-if="dashData.pos_categories.length" class="card p-0 overflow-hidden mb-5">
            <div class="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-1">
              <h4 class="font-semibold text-gray-800 text-sm">Positive observations per category per package</h4>
              <p class="text-xs text-gray-500">Cells coloured per column from green (lowest) to red (highest).</p>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead class="bg-gray-50 border-b border-gray-200 text-[10px] text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th class="text-left px-3 py-1.5 sticky left-0 bg-gray-50 align-bottom whitespace-nowrap">Package</th>
                    <th v-for="c in dashData.pos_categories" :key="'po-h-' + c.id"
                        class="text-center px-2 py-1.5 align-bottom" style="min-width:6rem;max-width:8rem"
                        :title="c.name">
                      <span class="font-semibold text-[10px] leading-tight whitespace-normal break-words">{{ c.name }}</span>
                    </th>
                    <th class="text-right px-3 py-1.5 w-20 bg-gray-100 align-bottom">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in dashData.packages" :key="'po-r-' + p.id" class="border-b border-gray-100">
                    <td class="px-3 py-1.5 sticky left-0 bg-white whitespace-nowrap">
                      <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white mr-1.5" style="background:#1B4F8C">{{ p.tag }}</span>
                      <span class="text-gray-700">{{ p.name }}</span>
                    </td>
                    <td v-for="c in dashData.pos_categories" :key="'po-c-' + p.id + '-' + c.id"
                        class="text-center px-2 py-1.5"
                        :style="{ background: heatmapColor(dashData.pos_obs_matrix[p.id][c.id], posObsColMax[c.id], true) }">
                      <template v-if="dashData.pos_obs_matrix[p.id][c.id]">
                        <div class="font-semibold">{{ fmtRate(dashRate(dashData.pos_obs_matrix[p.id][c.id])) }}</div>
                        <div class="text-[10px] text-gray-600">({{ dashData.pos_obs_matrix[p.id][c.id] }})</div>
                      </template>
                      <span v-else class="text-gray-300">—</span>
                    </td>
                    <td class="text-right px-3 py-1.5 font-semibold bg-gray-50">
                      <div>{{ fmtRate(dashRate(dashData.pos_obs_per_pkg[p.id])) }}</div>
                      <div class="text-[10px] text-gray-500 font-normal">({{ dashData.pos_obs_per_pkg[p.id] }})</div>
                    </td>
                  </tr>
                  <tr class="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                    <td class="px-3 py-1.5 sticky left-0 bg-gray-50 whitespace-nowrap">Total on site</td>
                    <td v-for="c in dashData.pos_categories" :key="'po-t-' + c.id" class="text-center px-2 py-1.5">
                      <div>{{ fmtRate(dashRate(dashData.pos_obs_per_cat[c.id])) }}</div>
                      <div class="text-[10px] text-gray-500 font-normal">({{ dashData.pos_obs_per_cat[c.id] }})</div>
                    </td>
                    <td class="text-right px-3 py-1.5 bg-gray-100">
                      <div>{{ fmtRate(dashRate(dashData.pos_obs_total)) }}</div>
                      <div class="text-[10px] text-gray-500 font-normal">({{ dashData.pos_obs_total }})</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </template>
      </template>
    </div>

    <!-- ════════════════════════ OBSERVATIONS TAB ════════════════════════ -->
    <div v-if="activeTab === 'observations'">
      <div v-if="isBidder" class="card p-4 bg-amber-50 border-amber-200 text-amber-700 text-sm mt-4">
        Bidders cannot view safety observations.
      </div>

      <template v-else>
        <!-- Toolbar -->
        <div class="flex flex-wrap items-center gap-2 mt-6 mb-3">
          <button v-if="canCreateObservation" @click="openNewObservation" class="btn-primary text-sm">+ New Safety Observation</button>
          <button @click="openExportModal" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            Export PDF
          </button>
          <button @click="exportObservationsToExcel" :disabled="xlsxExportingObs"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            {{ xlsxExportingObs ? 'Exporting...' : 'Export Excel' }}
          </button>

          <select v-model="obsFilterStatus" class="input-field text-sm" style="width:auto;min-width:150px">
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="RECEIVED">Received</option>
            <option value="CLOSED">Closed</option>
          </select>
          <select v-model.number="obsFilterPackage" class="input-field text-sm" style="width:auto;min-width:180px">
            <option :value="''">All packages</option>
            <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
          </select>
          <select v-model.number="obsFilterArea" class="input-field text-sm" style="width:auto;min-width:180px">
            <option :value="''">All areas</option>
            <option v-for="a in areas" :key="a.id" :value="a.id">{{ a.tag }} — {{ a.description }}</option>
          </select>
          <select v-model.number="obsFilterCategory" class="input-field text-sm" style="width:auto;min-width:180px">
            <option :value="''">All categories</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>

          <span class="ml-auto text-xs text-gray-500">{{ filteredObservations.length }} observation(s)</span>
        </div>

        <!-- List -->
        <div class="card p-0 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th class="text-left px-3 py-2 w-28">ID</th>
                <th class="text-left px-3 py-2 w-32">Package</th>
                <th class="text-center px-3 py-2 w-12">Type</th>
                <th class="text-left px-3 py-2 w-40">Category</th>
                <th class="text-left px-3 py-2 w-24">Area</th>
                <th class="text-left px-3 py-2">Details</th>
                <th class="text-left px-3 py-2 w-28">Status</th>
                <th class="text-left px-3 py-2 w-32">Created by</th>
                <th class="text-left px-3 py-2 w-32">Created at</th>
                <th class="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in filteredObservations" :key="o.id"
                @click="openObservation(o)"
                class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                <td class="px-3 py-1.5 font-mono text-gray-700">
                  {{ o.display_id }}
                  <span v-if="o.toolbox_count > 0"
                        class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
                        :title="o.toolbox_count + ' toolbox talk(s) reference this observation'">
                    TB·{{ o.toolbox_count }}
                  </span>
                </td>
                <td class="px-3 py-1.5">
                  <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ o.package_tag }}</span>
                </td>
                <td class="px-3 py-1.5 text-center">
                  <span v-if="o.category_polarity === 'POSITIVE'" class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100" title="Positive">
                    <svg class="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M2 11h3v11H2zM22 9c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 0 6.59 6.59C6.22 6.95 6 7.45 6 8v11c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2.98z"/></svg>
                  </span>
                  <span v-else class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100" title="Negative">
                    <svg class="w-3.5 h-3.5 text-red-600" fill="currentColor" viewBox="0 0 24 24"><path d="M22 13h-3V2h3zM2 15c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L10.83 24l6.58-6.59c.37-.36.59-.86.59-1.41V5c0-1.1-.9-2-2-2H7c-.83 0-1.54.5-1.84 1.22L2.14 11.27c-.09.23-.14.47-.14.73v3z"/></svg>
                  </span>
                </td>
                <td class="px-3 py-1.5 text-gray-800">{{ o.category_name }}</td>
                <td class="px-3 py-1.5 text-gray-600">{{ o.area_tag }}</td>
                <td class="px-3 py-1.5 text-gray-600 truncate max-w-[24rem]" :title="o.details">{{ o.details }}</td>
                <td class="px-3 py-1.5">
                  <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border', statusPill(o.status)]">{{ o.status }}</span>
                </td>
                <td class="px-3 py-1.5 text-gray-600 text-xs">{{ o.created_by_name || '—' }}</td>
                <td class="px-3 py-1.5 text-gray-500 text-xs">{{ fmtDateTime(o.created_at) }}</td>
                <td class="px-3 py-1.5 text-right whitespace-nowrap" @click.stop>
                  <button @click="openHistoryFromRow(o)"
                    class="btn-icon text-gray-400 hover:text-ips-blue"
                    title="Show history">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </button>
                </td>
              </tr>
              <tr v-if="!obsLoading && filteredObservations.length === 0">
                <td colspan="10" class="px-4 py-8 text-center text-gray-400">No safety observations yet.</td>
              </tr>
              <tr v-if="obsLoading">
                <td colspan="10" class="px-4 py-8 text-center text-gray-400">
                  <img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <!-- ════════════════════════ INCIDENTS TAB ═══════════════════════════ -->
    <div v-if="activeTab === 'incidents'">
      <div v-if="isBidder" class="card p-4 bg-amber-50 border-amber-200 text-amber-700 text-sm mt-4">
        Bidders cannot view safety incidents.
      </div>

      <template v-else>
        <!-- Toolbar -->
        <div class="flex flex-wrap items-center gap-2 mt-6 mb-3">
          <button v-if="canCreateIncidentInThisProject" @click="openNewIncident" class="btn-primary text-sm">+ New Incident</button>
          <button @click="exportIncidentsToExcel" :disabled="xlsxExportingInc"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            {{ xlsxExportingInc ? 'Exporting...' : 'Export Excel' }}
          </button>

          <select v-model="incFilterStatus" class="input-field text-sm" style="width:auto;min-width:170px">
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="UNDER_INVESTIGATION">Under investigation</option>
            <option value="ACTION_IN_PROGRESS">Action in progress</option>
            <option value="PENDING_REVIEW">Pending review</option>
            <option value="CLOSED">Closed</option>
          </select>
          <select v-model.number="incFilterPackage" class="input-field text-sm" style="width:auto;min-width:180px">
            <option :value="''">All packages</option>
            <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
          </select>
          <select v-model.number="incFilterArea" class="input-field text-sm" style="width:auto;min-width:180px">
            <option :value="''">All areas</option>
            <option v-for="a in areas" :key="a.id" :value="a.id">{{ a.tag }} — {{ a.description }}</option>
          </select>
          <select v-model.number="incFilterSeverity" class="input-field text-sm" style="width:auto;min-width:200px">
            <option :value="''">All severities</option>
            <option v-for="s in severityClasses" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>

          <span class="ml-auto text-xs text-gray-500">{{ filteredIncidents.length }} incident(s)</span>
        </div>

        <!-- List -->
        <div class="card p-0 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th class="text-left px-3 py-2 w-28">ID</th>
                <th class="text-left px-3 py-2 w-32">Package</th>
                <th class="px-2 py-2 w-2"></th>
                <th class="text-left px-3 py-2 w-44">Severity</th>
                <th class="text-left px-3 py-2 w-24">Area</th>
                <th class="text-left px-3 py-2 w-28">Date</th>
                <th class="text-left px-3 py-2">Cause</th>
                <th class="text-left px-3 py-2 w-52">Status</th>
                <th class="text-left px-3 py-2 w-32">Reported by</th>
                <th class="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="i in filteredIncidents" :key="i.id"
                  @click="openIncident(i)"
                  class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                <td class="px-3 py-1.5 font-mono text-gray-700">
                  {{ i.display_id }}
                  <span v-if="i.toolbox_count > 0"
                        class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
                        :title="i.toolbox_count + ' toolbox talk(s) reference this incident'">
                    TB·{{ i.toolbox_count }}
                  </span>
                </td>
                <td class="px-3 py-1.5">
                  <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ i.package_tag }}</span>
                </td>
                <td class="px-2 py-1.5">
                  <div class="w-2 h-6 rounded-sm" :style="severityPillStyle(i.severity_class_level)"
                       :title="i.severity_class_name || ''"></div>
                </td>
                <td class="px-3 py-1.5 text-gray-800">{{ i.severity_class_name || '—' }}</td>
                <td class="px-3 py-1.5 text-gray-600">{{ i.area_tag }}</td>
                <td class="px-3 py-1.5 text-gray-600 whitespace-nowrap">{{ i.incident_date }}</td>
                <td class="px-3 py-1.5 text-gray-600 truncate max-w-[18rem]"
                    :title="incidentTooltip(i)">
                  {{ i.incident_cause_name }}<span v-if="i.incident_cause_is_default && i.other_cause_text"> — {{ i.other_cause_text }}</span>
                </td>
                <td class="px-3 py-1.5">
                  <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap', incidentStatusPill(i.status)]">
                    {{ incidentStatusLabel(i.status) }}
                  </span>
                </td>
                <td class="px-3 py-1.5 text-gray-600 text-xs">{{ i.created_by_name || '—' }}</td>
                <td class="px-3 py-1.5 text-right whitespace-nowrap" @click.stop>
                  <button @click="openIncHistoryFromRow(i)"
                          class="btn-icon text-gray-400 hover:text-ips-blue"
                          title="Show history">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </button>
                </td>
              </tr>
              <tr v-if="!incLoading && filteredIncidents.length === 0">
                <td colspan="10" class="px-4 py-8 text-center text-gray-400">No safety incidents yet.</td>
              </tr>
              <tr v-if="incLoading">
                <td colspan="10" class="px-4 py-8 text-center text-gray-400">
                  <img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <!-- ════════════════════════ TOOLBOX TAB ═════════════════════════════ -->
    <div v-if="activeTab === 'toolbox'">
      <div v-if="isBidder" class="card p-4 bg-amber-50 border-amber-200 text-amber-700 text-sm mt-4">
        Bidders cannot view toolbox talks.
      </div>

      <template v-else>
        <div class="flex flex-wrap items-center gap-2 mt-6 mb-3">
          <button @click="openNewToolbox" class="btn-primary text-sm">+ New Toolbox Talk</button>
          <button @click="exportToolboxesToExcel" :disabled="xlsxExportingTbx"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            {{ xlsxExportingTbx ? 'Exporting...' : 'Export Excel' }}
          </button>

          <select v-model="tbxFilterStatus" class="input-field text-sm" style="width:auto;min-width:150px">
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="RECEIVED">Received</option>
          </select>
          <select v-model.number="tbxFilterCategory" class="input-field text-sm" style="width:auto;min-width:200px">
            <option :value="''">All categories</option>
            <option v-for="c in toolboxCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <select v-model.number="tbxFilterPackage" class="input-field text-sm" style="width:auto;min-width:180px">
            <option :value="''">All packages</option>
            <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
          </select>
          <span class="ml-auto text-xs text-gray-500">{{ filteredToolboxes.length }} toolbox talk(s)</span>
        </div>

        <div class="card p-0 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th class="text-left px-3 py-2 w-28">ID</th>
                <th class="text-left px-3 py-2 w-44">Category</th>
                <th class="text-left px-3 py-2 w-28">Date</th>
                <th class="text-left px-3 py-2 w-40">Given by</th>
                <th class="text-left px-3 py-2">Packages</th>
                <th class="text-left px-3 py-2 w-32">Status</th>
                <th class="text-left px-3 py-2 w-32">Created by</th>
                <th class="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in filteredToolboxes" :key="t.id"
                  @click="openToolbox(t)"
                  class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                <td class="px-3 py-1.5 font-mono text-gray-700">{{ t.display_id }}</td>
                <td class="px-3 py-1.5 text-gray-800 truncate max-w-[16rem]"
                    :title="t.category_name + (t.category_is_default && t.other_category_text ? ' — ' + t.other_category_text : '')">
                  {{ t.category_name }}<span v-if="t.category_is_default && t.other_category_text"> — {{ t.other_category_text }}</span>
                </td>
                <td class="px-3 py-1.5 text-gray-600 whitespace-nowrap">{{ t.talk_date }}</td>
                <td class="px-3 py-1.5 text-gray-600 truncate" :title="t.given_by_name + ' (' + t.given_by_kind + ')'">
                  {{ t.given_by_name || '—' }}
                  <span class="text-[10px] text-gray-400">({{ t.given_by_kind }})</span>
                </td>
                <td class="px-3 py-1.5">
                  <span v-for="p in (t.packages || []).slice(0, 4)" :key="p.id"
                        class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white mr-1" style="background:#1B4F8C">{{ p.tag_number }}</span>
                  <span v-if="(t.packages || []).length > 4" class="text-xs text-gray-400">+{{ t.packages.length - 4 }}</span>
                </td>
                <td class="px-3 py-1.5">
                  <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap', tbxStatusPill(t.status)]">{{ tbxStatusLabel(t.status) }}</span>
                </td>
                <td class="px-3 py-1.5 text-gray-600 text-xs">{{ t.created_by_name || '—' }}</td>
                <td class="px-3 py-1.5 text-right whitespace-nowrap" @click.stop>
                  <button @click="openTbxHistoryFromRow(t)"
                          class="btn-icon text-gray-400 hover:text-ips-blue"
                          title="Show history">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </button>
                </td>
              </tr>
              <tr v-if="!tbxLoading && filteredToolboxes.length === 0">
                <td colspan="8" class="px-4 py-8 text-center text-gray-400">No toolbox talks yet.</td>
              </tr>
              <tr v-if="tbxLoading">
                <td colspan="8" class="px-4 py-8 text-center text-gray-400">
                  <img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <!-- ════════════════════════ FLOORPLAN VIEW (heatmap) ════════════════ -->
    <div v-if="activeTab === 'floorplans'">
      <div v-if="isBidder" class="card p-4 bg-amber-50 border-amber-200 text-amber-700 text-sm mt-4">
        Bidders cannot view safety observations.
      </div>
      <template v-else>
        <div class="flex flex-wrap items-center gap-2 mt-6 mb-3">
          <p class="text-sm text-gray-500">Pinned safety observations on each floorplan. Click a dot to open the record.</p>
          <label class="ml-auto inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
            <input type="checkbox" v-model="showPinNumbers" class="rounded"/>
            Show numbers
          </label>
          <select v-model="heatPolarity" class="input-field text-sm" style="width:auto;min-width:140px">
            <option value="ALL">All types</option>
            <option value="POSITIVE">Positive only</option>
            <option value="NEGATIVE">Negative only</option>
          </select>
          <select v-model="heatStatus" class="input-field text-sm" style="width:auto;min-width:140px">
            <option value="ACTIVE">Open (not closed)</option>
            <option value="CLOSED">Closed only</option>
            <option value="ALL">All statuses</option>
          </select>
          <select v-model.number="heatPackage" class="input-field text-sm" style="width:auto;min-width:180px">
            <option :value="''">All packages</option>
            <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
          </select>
        </div>

        <div v-if="floorplansWithPins.length === 0"
             class="card text-center py-12 text-gray-400">
          <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
          <p>No pinned observations match these filters.</p>
        </div>

        <template v-else>
          <div class="flex justify-end mb-2">
            <button @click="toggleExpandAll" class="text-xs text-ips-blue font-semibold hover:underline">
              {{ expandAll ? 'Collapse all' : 'Expand all' }}
            </button>
          </div>

          <div class="space-y-3">
            <div v-for="fp in floorplansWithPins" :key="fp.id" class="card p-0 overflow-hidden">
              <button @click="toggleFloorplan(fp.id)"
                      class="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-gray-50 transition-colors"
                      :class="{ 'border-b border-gray-100': isFloorplanExpanded(fp.id) }">
                <div class="flex items-center gap-3 min-w-0">
                  <svg class="w-4 h-4 text-gray-400 transition-transform shrink-0"
                       :class="{ 'rotate-90': isFloorplanExpanded(fp.id) }"
                       fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
                  <h4 class="font-semibold text-gray-800 truncate">{{ fp.name }}</h4>
                </div>
                <div class="flex items-center gap-2 text-xs shrink-0">
                  <span v-if="fp.posCount > 0"
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                    <span class="w-1.5 h-1.5 rounded-full" style="background:#10b981"></span>
                    {{ fp.posCount }} positive
                  </span>
                  <span v-if="fp.negCount > 0"
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-semibold">
                    <span class="w-1.5 h-1.5 rounded-full" style="background:#dc2626"></span>
                    {{ fp.negCount }} negative
                  </span>
                  <span class="text-gray-400">{{ fp.pins.length }} total</span>
                </div>
              </button>

              <div v-if="isFloorplanExpanded(fp.id)"
                   class="relative bg-gray-50">
                <img v-if="floorplanBlobs[fp.id]" :src="floorplanBlobs[fp.id]" :alt="fp.name"
                     class="block w-full h-auto"
                     draggable="false"
                     @load="onFloorplanImgLoad(fp.id, $event)"/>
                <div v-else class="aspect-[4/3] flex items-center justify-center text-gray-400 text-xs">
                  Loading floorplan…
                </div>

                <template v-if="floorplanBlobs[fp.id]">
                  <!-- Singleton pins -->
                  <template v-for="o in clusterPins(fp.pins).singletons" :key="o.id">
                    <div class="absolute cursor-pointer"
                         :style="{ left: (o.floorplan_x * 100) + '%', top: (o.floorplan_y * 100) + '%', transform: 'translate(-50%, -100%)' }"
                         @click.stop="openHeatmapPin(o)"
                         :title="o.display_id + ' — ' + (o.category_name || '')">
                      <svg width="24" height="30" viewBox="0 0 24 30" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.55))">
                        <path d="M12 0C6.48 0 2 4.48 2 10c0 7.5 10 20 10 20s10-12.5 10-20C22 4.48 17.52 0 12 0z"
                              :fill="pinColor(o)" stroke="white" stroke-width="2"/>
                        <circle cx="12" cy="10" r="3.6" fill="white"/>
                      </svg>
                    </div>
                    <!-- Number label, offset to the right of the pin tip -->
                    <div v-if="showPinNumbers" class="absolute pointer-events-none"
                         :style="{ left: (o.floorplan_x * 100) + '%', top: (o.floorplan_y * 100) + '%', transform: 'translate(12px, -30px)' }">
                      <span class="inline-block px-1.5 py-0.5 text-[13px] font-bold leading-tight bg-white text-gray-800 border border-gray-300 rounded shadow-sm whitespace-nowrap">
                        {{ o.project_seq_id || o.id }}
                      </span>
                    </div>
                  </template>

                  <!-- Clusters (positive vs negative kept separate) -->
                  <div v-for="(c, idx) in clusterPins(fp.pins).clusters" :key="c.key"
                       class="absolute cursor-pointer"
                       :style="{ left: (c.x * 100) + '%', top: (c.y * 100) + '%', transform: 'translate(-50%, -50%)' }"
                       @click.stop="expandCluster(fp.id, idx)">
                    <div class="rounded-full text-white border-2 border-white flex items-center justify-center font-bold shadow-md hover:scale-105 transition-transform"
                         :style="{ background: clusterBg(c), width: clusterDotSize(c.items.length) + 'px', height: clusterDotSize(c.items.length) + 'px', fontSize: '13px' }">
                      {{ c.items.length }}
                    </div>

                    <!-- Expanded list popover -->
                    <div v-if="isClusterExpanded(fp.id, idx)"
                         class="absolute left-1/2 top-full mt-2 -translate-x-1/2 z-20 w-80 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden cursor-default"
                         @click.stop>
                      <div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                        <span class="text-xs font-semibold text-gray-700">
                          {{ c.items.length }} {{ c.polarity === 'POSITIVE' ? 'positive' : 'negative' }} pins here
                        </span>
                        <button @click="collapseCluster" class="text-gray-400 hover:text-gray-600">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                      <div class="max-h-60 overflow-y-auto">
                        <button v-for="o in c.items" :key="o.id"
                                @click="openHeatmapPin(o)"
                                class="w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-gray-50 flex items-start gap-2">
                          <span class="inline-block w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                                :style="{ background: pinColor(o) }"></span>
                          <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-1.5 flex-wrap mb-0.5">
                              <span v-if="o.package_tag" class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style="background:#1B4F8C">{{ o.package_tag }}</span>
                              <span class="text-xs font-mono text-gray-500">{{ o.display_id }}</span>
                            </div>
                            <p class="text-sm text-gray-800 truncate">{{ o.category_name || '—' }}</p>
                            <p class="text-xs text-gray-500 truncate">{{ o.details }}</p>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </template>
      </template>
    </div>

    <!-- ════════════════════════ REPORTS TAB ═══════════════════════════════ -->
    <div v-if="activeTab === 'reports'">
      <div class="flex items-center justify-between mt-6 mb-3">
        <p class="text-sm text-gray-500">Background-generated PDF exports for this project. Files are saved under <span class="font-mono text-xs text-gray-700">uploads / {project} / Safety Reports</span>.</p>
        <button @click="loadReports" :disabled="reportsLoading" class="btn-secondary text-sm">
          <svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          {{ reportsLoading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>

      <div class="card p-0 overflow-hidden">
        <div v-if="recentReports.length === 0" class="px-6 py-12 text-center text-gray-400">
          <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <p class="text-sm">No reports yet.</p>
          <p class="text-xs mt-1">Go to the <strong>Observations</strong> tab and click <strong>Export PDF</strong> to generate one.</p>
        </div>
        <div v-else class="divide-y divide-gray-100">
          <div v-for="r in recentReports" :key="r.id"
               class="px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
            <span :class="['inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border whitespace-nowrap', reportStatusClass(r.status)]">
              <svg v-if="r.status === 'GENERATING'" class="w-3.5 h-3.5 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              {{ r.status }}
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-gray-800 font-medium truncate">{{ r.title || 'Report' }}<span v-if="r.file_size" class="text-xs text-gray-400 ml-2 font-normal">{{ fmtFileSize(r.file_size) }}</span></p>
              <p class="text-xs text-gray-500 truncate">{{ r.filter_summary }}</p>
              <p class="text-[11px] text-gray-400">{{ r.requested_by_name || '—' }} · {{ fmtDateTime(r.requested_at) }}</p>
              <p v-if="r.error_message" class="text-xs text-red-600 truncate">{{ r.error_message }}</p>
            </div>
            <button v-if="r.downloadable" @click="onDownloadReport(r)"
                    class="px-3 py-2 rounded-lg bg-ips-blue text-white text-sm font-semibold hover:opacity-90 inline-flex items-center gap-1.5"
                    title="Download PDF">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Download
            </button>
            <button @click="onDeleteReport(r)"
                    class="btn-icon text-gray-400 hover:text-red-500 p-2" title="Delete">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ════════════════════════ SETUP TAB ════════════════════════ -->
    <div v-if="activeTab === 'setup'">
      <div v-if="!canEditSetup" class="card p-4 mb-4 bg-amber-50 border-amber-200 text-amber-700 text-sm">
        Read-only — only project owners can edit safety setup.
      </div>

      <div class="flex gap-2 mt-6 mb-4 flex-wrap">
        <button :class="['btn-secondary', setupSubtab === 'categories' ? 'font-semibold' : '']" @click="setupSubtab = 'categories'">Safety Observation Categories</button>
        <button :class="['btn-secondary', setupSubtab === 'severity' ? 'font-semibold' : '']" @click="setupSubtab = 'severity'">Severity Classes</button>
        <button :class="['btn-secondary', setupSubtab === 'causes' ? 'font-semibold' : '']" @click="setupSubtab = 'causes'">Incident Causes</button>
        <button :class="['btn-secondary', setupSubtab === 'toolbox' ? 'font-semibold' : '']" @click="setupSubtab = 'toolbox'">Toolbox Categories</button>
      </div>

      <div v-if="setupSubtab === 'categories'" class="mt-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm text-gray-500">Categories used when logging safety observations.</p>
          <button v-if="canEditSetup" @click="openSetupModal()" class="btn-primary text-sm">+ New Category</button>
        </div>
        <div class="card p-0 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th class="text-center px-3 py-3 w-16">Type</th>
                <th class="text-left px-4 py-3">Category</th>
                <th class="text-left px-4 py-3">Description</th>
                <th v-if="canEditSetup" class="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in categories" :key="c.id" class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-3 py-3 text-center">
                  <span v-if="c.polarity === 'POSITIVE'" class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100" title="Positive observation">
                    <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M2 11h3v11H2zM22 9c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 0 6.59 6.59C6.22 6.95 6 7.45 6 8v11c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2.98z"/></svg>
                  </span>
                  <span v-else class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100" title="Negative observation">
                    <svg class="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 24 24"><path d="M22 13h-3V2h3zM2 15c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L10.83 24l6.58-6.59c.37-.36.59-.86.59-1.41V5c0-1.1-.9-2-2-2H7c-.83 0-1.54.5-1.84 1.22L2.14 11.27c-.09.23-.14.47-.14.73v3z"/></svg>
                  </span>
                </td>
                <td class="px-4 py-3 font-medium text-gray-800">{{ c.name }}</td>
                <td class="px-4 py-3 text-gray-500">{{ c.description || '—' }}</td>
                <td v-if="canEditSetup" class="px-4 py-3 text-right">
                  <button @click="openSetupModal(c)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button @click="deleteSetupItem(c)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </td>
              </tr>
              <tr v-if="categories.length === 0"><td colspan="4" class="px-4 py-6 text-center text-gray-400">No categories yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Severity Classes ─────────────────────────────────────────── -->
      <div v-if="setupSubtab === 'severity'" class="mt-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm text-gray-500">
            Severity classes used when classifying safety incidents. Order them from <strong>worst</strong> (top) to <strong>least worst</strong> (bottom). The colour bar shifts from red (worst) to yellow (least worst).
          </p>
          <button v-if="canEditSetup" @click="openSeverityModal()" class="btn-primary text-sm">+ New Severity Class</button>
        </div>
        <div class="card p-0 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th class="text-left px-4 py-3 w-16">Order</th>
                <th class="px-2 py-3 w-2"></th>
                <th class="text-left px-4 py-3 w-72">Class</th>
                <th class="text-left px-4 py-3">Description</th>
                <th v-if="canEditSetup" class="px-4 py-3 w-32"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(s, idx) in severityClasses" :key="s.id" class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3 text-gray-500">
                  <div class="flex items-center gap-1">
                    <span class="font-mono text-xs text-gray-700 w-6">{{ idx + 1 }}</span>
                    <button v-if="canEditSetup" @click="moveSeverity(idx, -1)" :disabled="idx === 0"
                      class="btn-icon text-gray-400 hover:text-ips-blue disabled:opacity-30 disabled:cursor-not-allowed" title="Move up (more severe)">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>
                    </button>
                    <button v-if="canEditSetup" @click="moveSeverity(idx, 1)" :disabled="idx === severityClasses.length - 1"
                      class="btn-icon text-gray-400 hover:text-ips-blue disabled:opacity-30 disabled:cursor-not-allowed" title="Move down (less severe)">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                  </div>
                </td>
                <td class="px-2 py-3">
                  <div class="w-2 h-7 rounded-sm" :style="severityBarStyle(idx)"
                    :title="idx === 0 ? 'Most severe' : (idx === severityClasses.length - 1 ? 'Least severe' : '')"></div>
                </td>
                <td class="px-4 py-3 font-medium text-gray-800">{{ s.name }}</td>
                <td class="px-4 py-3 text-gray-500">{{ s.description || '—' }}</td>
                <td v-if="canEditSetup" class="px-4 py-3 text-right whitespace-nowrap">
                  <button @click="openSeverityModal(s)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button @click="deleteSeverityClass(s)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </td>
              </tr>
              <tr v-if="severityClasses.length === 0"><td colspan="5" class="px-4 py-6 text-center text-gray-400">No severity classes yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Incident Causes ──────────────────────────────────────────── -->
      <div v-if="setupSubtab === 'causes'" class="mt-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm text-gray-500">High-level causes used when classifying safety incidents. The default <strong>Other</strong> entry is locked and cannot be removed.</p>
          <button v-if="canEditSetup" @click="openIncidentCauseModal()" class="btn-primary text-sm">+ New Incident Cause</button>
        </div>
        <div class="card p-0 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th class="text-left px-4 py-3 w-72">Cause</th>
                <th class="text-left px-4 py-3">Description</th>
                <th v-if="canEditSetup" class="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in incidentCauses" :key="c.id" class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3 font-medium text-gray-800">
                  {{ c.name }}
                  <span v-if="c.is_default" class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 border border-gray-200" title="Default catch-all — cannot be deleted">Default</span>
                </td>
                <td class="px-4 py-3 text-gray-500">{{ c.description || '—' }}</td>
                <td v-if="canEditSetup" class="px-4 py-3 text-right whitespace-nowrap">
                  <button @click="openIncidentCauseModal(c)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button @click="deleteIncidentCause(c)" :disabled="c.is_default"
                          class="btn-icon disabled:opacity-30 disabled:cursor-not-allowed"
                          :class="c.is_default ? 'text-gray-300' : 'text-gray-400 hover:text-red-500'"
                          :title="c.is_default ? 'Default cause cannot be deleted' : 'Delete'">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </td>
              </tr>
              <tr v-if="incidentCauses.length === 0"><td colspan="3" class="px-4 py-6 text-center text-gray-400">No incident causes yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Toolbox Categories ──────────────────────────────────────────── -->
      <div v-if="setupSubtab === 'toolbox'" class="mt-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm text-gray-500">Categories used when logging toolbox sessions. The default <strong>Other</strong> entry is locked and cannot be removed or renamed.</p>
          <button v-if="canEditSetup" @click="openToolboxCategoryModal()" class="btn-primary text-sm">+ New Toolbox Category</button>
        </div>
        <div class="card p-0 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th class="text-left px-4 py-3 w-72">Category</th>
                <th class="text-left px-4 py-3">Description</th>
                <th v-if="canEditSetup" class="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in toolboxCategories" :key="c.id" class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3 font-medium text-gray-800">
                  {{ c.name }}
                  <span v-if="c.is_default" class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 border border-gray-200" title="Default catch-all — cannot be deleted or renamed">Default</span>
                </td>
                <td class="px-4 py-3 text-gray-500">{{ c.description || '—' }}</td>
                <td v-if="canEditSetup" class="px-4 py-3 text-right whitespace-nowrap">
                  <button @click="openToolboxCategoryModal(c)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button @click="deleteToolboxCategory(c)" :disabled="c.is_default"
                          class="btn-icon disabled:opacity-30 disabled:cursor-not-allowed"
                          :class="c.is_default ? 'text-gray-300' : 'text-gray-400 hover:text-red-500'"
                          :title="c.is_default ? 'Default category cannot be deleted' : 'Delete'">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </td>
              </tr>
              <tr v-if="toolboxCategories.length === 0"><td colspan="3" class="px-4 py-6 text-center text-gray-400">No toolbox categories yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Severity class edit modal -->
      <div v-if="severityEditing" class="modal-overlay" @click.self="closeSeverityModal">
        <div class="modal-box">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">
              {{ severityEditing.item ? 'Edit' : 'New' }} — Severity Class
            </h3>
            <button @click="closeSeverityModal" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body space-y-3">
            <div>
              <label class="form-label">Name <span class="text-red-500">*</span></label>
              <input v-model="severityForm.name" type="text" class="input-field" placeholder="e.g. Lost Time Injury (LTI)"/>
            </div>
            <div>
              <label class="form-label">Description</label>
              <textarea v-model="severityForm.description" class="input-field" rows="3" placeholder="Short definition shown to anyone classifying an incident."></textarea>
            </div>
            <p v-if="!severityEditing.item" class="text-xs text-gray-500">New severity classes are added at the bottom of the list (least severe). Use the up/down arrows to reorder.</p>
            <p v-if="severityError" class="text-red-500 text-sm">{{ severityError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="closeSeverityModal" class="btn-secondary">Cancel</button>
            <button @click="saveSeverityClass" :disabled="severitySaving" class="btn-primary">
              {{ severitySaving ? 'Saving…' : (severityEditing.item ? 'Save Changes' : 'Create') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Incident cause edit modal -->
      <div v-if="incidentCauseEditing" class="modal-overlay" @click.self="closeIncidentCauseModal">
        <div class="modal-box">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">
              {{ incidentCauseEditing.item ? 'Edit' : 'New' }} — Incident Cause
            </h3>
            <button @click="closeIncidentCauseModal" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body space-y-3">
            <div>
              <label class="form-label">Name <span class="text-red-500">*</span></label>
              <input v-model="incidentCauseForm.name" type="text" class="input-field"
                     :disabled="incidentCauseEditing.item && incidentCauseEditing.item.is_default"
                     placeholder="e.g. Falls from height"/>
              <p v-if="incidentCauseEditing.item && incidentCauseEditing.item.is_default" class="text-xs text-gray-500 mt-1">The default 'Other' cause cannot be renamed.</p>
            </div>
            <div>
              <label class="form-label">Description</label>
              <textarea v-model="incidentCauseForm.description" class="input-field" rows="3"></textarea>
            </div>
            <p v-if="incidentCauseError" class="text-red-500 text-sm">{{ incidentCauseError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="closeIncidentCauseModal" class="btn-secondary">Cancel</button>
            <button @click="saveIncidentCause" :disabled="incidentCauseSaving" class="btn-primary">
              {{ incidentCauseSaving ? 'Saving…' : (incidentCauseEditing.item ? 'Save Changes' : 'Create') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Toolbox category edit modal -->
      <div v-if="toolboxCategoryEditing" class="modal-overlay" @click.self="closeToolboxCategoryModal">
        <div class="modal-box">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">
              {{ toolboxCategoryEditing.item ? 'Edit' : 'New' }} — Toolbox Category
            </h3>
            <button @click="closeToolboxCategoryModal" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body space-y-3">
            <div>
              <label class="form-label">Name <span class="text-red-500">*</span></label>
              <input v-model="toolboxCategoryForm.name" type="text" class="input-field"
                     :disabled="toolboxCategoryEditing.item && toolboxCategoryEditing.item.is_default"
                     placeholder="e.g. Work at height"/>
              <p v-if="toolboxCategoryEditing.item && toolboxCategoryEditing.item.is_default" class="text-xs text-gray-500 mt-1">The default 'Other' category cannot be renamed.</p>
            </div>
            <div>
              <label class="form-label">Description</label>
              <textarea v-model="toolboxCategoryForm.description" class="input-field" rows="3"></textarea>
            </div>
            <p v-if="toolboxCategoryError" class="text-red-500 text-sm">{{ toolboxCategoryError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="closeToolboxCategoryModal" class="btn-secondary">Cancel</button>
            <button @click="saveToolboxCategory" :disabled="toolboxCategorySaving" class="btn-primary">
              {{ toolboxCategorySaving ? 'Saving…' : (toolboxCategoryEditing.item ? 'Save Changes' : 'Create') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Category edit modal -->
      <div v-if="setupEditing" class="modal-overlay" @click.self="closeSetupModal">
        <div class="modal-box">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">
              {{ setupEditing.item ? 'Edit' : 'New' }} — Safety Category
            </h3>
            <button @click="closeSetupModal" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body space-y-3">
            <div>
              <label class="form-label">Name <span class="text-red-500">*</span></label>
              <input v-model="setupForm.name" type="text" class="input-field"/>
            </div>
            <div>
              <label class="form-label">Description</label>
              <textarea v-model="setupForm.description" class="input-field" rows="3"></textarea>
            </div>
            <div>
              <label class="form-label">Observation type</label>
              <div class="flex gap-2">
                <button type="button" @click="setupForm.polarity = 'POSITIVE'"
                  :class="['flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-colors',
                           setupForm.polarity === 'POSITIVE'
                             ? 'bg-green-50 border-green-400 text-green-700'
                             : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50']">
                  <svg class="w-5 h-5" :class="setupForm.polarity === 'POSITIVE' ? 'text-green-600' : 'text-gray-400'" fill="currentColor" viewBox="0 0 24 24"><path d="M2 11h3v11H2zM22 9c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 0 6.59 6.59C6.22 6.95 6 7.45 6 8v11c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2.98z"/></svg>
                  <span class="text-sm font-medium">Positive</span>
                </button>
                <button type="button" @click="setupForm.polarity = 'NEGATIVE'"
                  :class="['flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-colors',
                           setupForm.polarity === 'NEGATIVE'
                             ? 'bg-red-50 border-red-400 text-red-700'
                             : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50']">
                  <svg class="w-5 h-5" :class="setupForm.polarity === 'NEGATIVE' ? 'text-red-600' : 'text-gray-400'" fill="currentColor" viewBox="0 0 24 24"><path d="M22 13h-3V2h3zM2 15c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L10.83 24l6.58-6.59c.37-.36.59-.86.59-1.41V5c0-1.1-.9-2-2-2H7c-.83 0-1.54.5-1.84 1.22L2.14 11.27c-.09.23-.14.47-.14.73v3z"/></svg>
                  <span class="text-sm font-medium">Negative</span>
                </button>
              </div>
            </div>
            <p v-if="setupError" class="text-red-500 text-sm">{{ setupError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="closeSetupModal" class="btn-secondary">Cancel</button>
            <button @click="saveSetupItem" :disabled="setupSaving" class="btn-primary">
              {{ setupSaving ? 'Saving…' : (setupEditing.item ? 'Save Changes' : 'Create') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════ OBSERVATION DETAIL MODAL (two-col) ══════════════════ -->
    <div v-if="showObsModal" class="modal-overlay" @click.self="closeObsModal">
      <div class="modal-box modal-xl" style="max-width:min(1450px,95vw) !important;height:95vh;max-height:95vh;min-height:min(85vh,700px);display:flex;flex-direction:column;overflow:hidden">
        <div class="modal-header">
          <div class="flex items-center gap-3">
            <h3 class="text-lg font-semibold text-gray-800">
              <template v-if="obsMode === 'new'">New Safety Observation</template>
              <template v-else>{{ obsCurrent ? obsCurrent.display_id : '' }} — Safety Observation</template>
            </h3>
            <span v-if="obsCurrent" :class="['inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border', statusBadgeClass]">
              {{ obsCurrent.status }}
            </span>
          </div>
          <button @click="closeObsModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="modal-body" style="padding:0;display:flex;overflow:hidden;flex:1">
          <!-- LEFT: form + history -->
          <div class="min-w-0 overflow-y-auto" style="flex:1 1 50%;padding:20px 24px">
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="form-label">Package <span class="text-red-500">*</span></label>
                  <select v-model.number="obsForm.package_id" class="input-field"
                          :disabled="obsMode === 'view' || (obsCurrent && obsCurrent.status !== 'DRAFT' && obsCurrent.status !== 'SUBMITTED')">
                    <option :value="null">Select a package</option>
                    <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Area <span class="text-red-500">*</span></label>
                  <select v-model.number="obsForm.area_id" class="input-field"
                          :disabled="obsMode === 'view'">
                    <option :value="null">Select an area</option>
                    <option v-for="a in areas" :key="a.id" :value="a.id">{{ a.tag }} — {{ a.description }}</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="form-label">Category <span class="text-red-500">*</span></label>
                <select v-model.number="obsForm.category_id" class="input-field"
                        :disabled="obsMode === 'view'">
                  <option :value="null">Select a category</option>
                  <option v-for="c in categories" :key="c.id" :value="c.id">
                    {{ c.polarity === 'POSITIVE' ? '👍' : '👎' }} {{ c.name }}
                  </option>
                </select>
              </div>
              <div>
                <label class="form-label">Details <span class="text-red-500">*</span></label>
                <textarea v-model="obsForm.details" class="input-field" rows="4"
                          :disabled="obsMode === 'view'"
                          placeholder="What was observed?"></textarea>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="form-label">Subcontractor <span class="text-gray-400 text-xs">(optional)</span></label>
                  <select v-model.number="obsForm.subcontractor_id" class="input-field"
                          :disabled="obsMode === 'view' || !obsForm.package_id">
                    <option :value="null">—</option>
                    <option v-for="s in formSubcontractorOptions" :key="s.id" :value="s.id">{{ s.company }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Worker <span class="text-gray-400 text-xs">(optional)</span></label>
                  <select v-model.number="obsForm.worker_id" class="input-field"
                          :disabled="obsMode === 'view' || !obsForm.package_id">
                    <option :value="null">—</option>
                    <option v-for="w in formWorkerOptions" :key="w.id" :value="w.id">{{ w.name }}</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="form-label">Remediation request <span class="text-gray-400 text-xs">(optional)</span></label>
                <textarea v-model="obsForm.remediation_request" class="input-field" rows="2"
                          :disabled="obsMode === 'view'"
                          placeholder="Suggested action to fix the condition..."></textarea>
              </div>

              <p v-if="obsError" class="text-red-500 text-sm">{{ obsError }}</p>

              <!-- ── Floorplan pin (only if the chosen area has a plan) ────── -->
              <div v-if="currentAreaFloorplan" class="border-t border-gray-200 pt-3">
                <div class="flex items-center justify-between mb-2">
                  <label class="form-label mb-0">
                    Floorplan location
                    <span class="text-gray-400 text-xs font-normal">(optional)</span>
                  </label>
                  <span v-if="canEditPin" class="text-xs text-gray-500">
                    {{ obsForm.floorplan_id ? 'Tap to move or clear the pin' : 'Tap the floorplan to drop a pin' }}
                  </span>
                </div>
                <div class="rounded-lg overflow-hidden border bg-gray-100 mx-auto"
                     style="max-width:28rem"
                     :class="canEditPin ? 'border-gray-200 hover:border-ips-blue cursor-pointer' : 'border-gray-200 cursor-default'"
                     @click="openPinPicker">
                  <!-- Image sizes itself; wrapper shrinks to image so pin
                       percentages map 1:1 to the rendered drawing. -->
                  <div class="relative bg-white">
                    <img v-if="currentFloorplanThumb" :src="currentFloorplanThumb"
                         :alt="currentAreaFloorplan.name"
                         class="block w-full h-auto"
                         draggable="false"
                         @load="onFloorplanImgLoad(currentAreaFloorplan.id, $event)"/>
                    <div v-else class="aspect-[4/3] flex items-center justify-center text-gray-400 text-xs">
                      Loading floorplan…
                    </div>
                    <div v-if="obsForm.floorplan_x != null && obsForm.floorplan_y != null"
                         class="absolute pointer-events-none"
                         :style="{ left: (obsForm.floorplan_x * 100) + '%', top: (obsForm.floorplan_y * 100) + '%', transform: 'translate(-50%, -100%)' }">
                      <svg width="24" height="30" viewBox="0 0 24 30" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.55))">
                        <path d="M12 0C6.48 0 2 4.48 2 10c0 7.5 10 20 10 20s10-12.5 10-20C22 4.48 17.52 0 12 0z"
                              fill="#dc2626" stroke="white" stroke-width="2"/>
                        <circle cx="12" cy="10" r="3.6" fill="white"/>
                      </svg>
                    </div>
                  </div>
                  <div class="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-white border-t border-gray-200">
                    <span class="font-medium text-gray-700 truncate">{{ currentAreaFloorplan.name }}</span>
                    <span v-if="obsForm.floorplan_x != null" class="text-emerald-600 font-semibold whitespace-nowrap">Pin set</span>
                    <span v-else class="text-gray-400 whitespace-nowrap">No pin yet</span>
                  </div>
                </div>
              </div>
              <div v-else-if="obsForm.area_id" class="border-t border-gray-200 pt-3">
                <p class="text-xs text-gray-400 italic">
                  This area has no floorplan linked. Link a floorplan in Project Organization → Floorplans to enable pin-pointing.
                </p>
              </div>

              <!-- Created by / at -->
              <div v-if="obsCurrent" class="text-xs text-gray-500 pt-2 border-t border-gray-200">
                Created by <span class="font-medium text-gray-700">{{ obsCurrent.created_by_name || '—' }}</span>
                on {{ fmtDateTime(obsCurrent.created_at) }}
                <span v-if="obsCurrent.updated_at"> · last updated {{ fmtDateTime(obsCurrent.updated_at) }}</span>
              </div>

              <!-- Workflow comments — pulled from history so re-open reasons
                   and prior acknowledgements remain visible after status changes. -->
              <div v-for="entry in obsWorkflowComments" :key="entry.id"
                   :class="['mt-3 rounded-lg p-3 text-sm border', obsWorkflowCommentBoxClass(entry.event)]">
                <p :class="['text-xs uppercase tracking-wider mb-1', obsWorkflowCommentLabelClass(entry.event)]">
                  {{ obsWorkflowCommentTitle(entry) }}
                </p>
                <p class="text-gray-700 whitespace-pre-line">{{ entry.comment }}</p>
              </div>

              <!-- Workflow inline prompts -->
              <div v-if="workflowMode" ref="obsWorkflowPrompt"
                   class="mt-3 rounded-lg bg-amber-50 border-2 border-amber-300 p-3 shadow-sm ring-2 ring-amber-200/60">
                <p class="text-sm font-semibold text-amber-800 mb-2">
                  <template v-if="workflowMode === 'acknowledge'">Acknowledge this observation</template>
                  <template v-else-if="workflowMode === 'close'">Close this observation</template>
                  <template v-else-if="workflowMode === 'reopen'">Reason for re-opening</template>
                </p>
                <textarea v-model="workflowComment" class="input-field" rows="3"
                          ref="obsWorkflowTextarea"
                          :placeholder="workflowMode === 'reopen' ? 'Reason for re-opening (required)' : 'Comment (optional)'"></textarea>
                <div class="flex justify-end gap-2 mt-2">
                  <button @click="cancelWorkflow" class="btn-secondary text-sm">Cancel</button>
                  <button @click="confirmWorkflow" :disabled="workflowSaving"
                    :class="['text-sm font-semibold rounded-lg text-white px-4 py-2 disabled:opacity-50',
                             workflowMode === 'close' ? 'bg-emerald-600 hover:bg-emerald-700'
                             : workflowMode === 'reopen' ? 'bg-amber-600 hover:bg-amber-700'
                             : 'bg-indigo-600 hover:bg-indigo-700']">
                    {{ workflowSaving ? 'Saving…' :
                       workflowMode === 'acknowledge' ? 'Confirm Acknowledge' :
                       workflowMode === 'close'       ? 'Confirm Close' :
                       workflowMode === 'reopen'      ? 'Confirm Re-open' : 'Confirm' }}
                  </button>
                </div>
              </div>

            </div>
          </div>

          <!-- RIGHT: attachments (hidden while the record hasn't been saved yet) -->
          <div class="min-w-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="flex:1 1 50%;padding:20px 16px">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
            <div v-if="obsMode === 'new' || !obsCurrent" class="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg p-3">
              Save the observation first, then attachments can be added here.
            </div>
            <file-attachments v-else
              record-type="safety_observation"
              :record-id="obsCurrent.id"
              :can-upload="obsCurrent.status !== 'CLOSED'"
              :can-edit="(obsAllowed.indexOf('edit') !== -1) || isOwnerOrAdmin"
              :gallery-mode="true">
            </file-attachments>
          </div>
        </div>

        <!-- Footer: contextual workflow buttons -->
        <div class="modal-footer">
          <button @click="closeObsModal" class="btn-secondary">Close</button>
          <button v-if="obsCurrent && obsMode !== 'new'"
            @click="openHistoryModal"
            class="btn-secondary flex items-center gap-1.5"
            title="Show history log">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            History
          </button>

          <template v-if="obsMode === 'new'">
            <button @click="saveObs" :disabled="obsSaving || !canSaveForm" class="btn-primary">
              {{ obsSaving ? 'Saving…' : 'Save as Draft' }}
            </button>
          </template>

          <template v-else-if="obsMode === 'edit'">
            <button @click="cancelEdit" class="btn-secondary" :disabled="obsSaving">Cancel</button>
            <button @click="saveObs" :disabled="obsSaving || !canSaveForm" class="btn-primary">
              {{ obsSaving ? 'Saving…' : 'Save Changes' }}
            </button>
          </template>

          <template v-else>
            <button v-if="obsAllowed.indexOf('delete') !== -1"
              @click="deleteObs" class="px-3 py-1.5 text-sm font-semibold rounded-lg border border-red-300 text-red-700 bg-white hover:bg-red-50">
              Delete
            </button>
            <button v-if="obsAllowed.indexOf('edit') !== -1"
              @click="startEdit" class="btn-secondary">Edit</button>
            <button v-if="obsAllowed.indexOf('submit') !== -1"
              @click="submitObs" :disabled="workflowSaving" class="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {{ workflowSaving ? 'Submitting…' : 'Submit' }}
            </button>
            <button v-if="obsAllowed.indexOf('acknowledge') !== -1 && !workflowMode"
              @click="startWorkflow('acknowledge')" class="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
              Acknowledge
            </button>
            <button v-if="obsAllowed.indexOf('close') !== -1 && !workflowMode"
              @click="startWorkflow('close')" class="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
              Close
            </button>
            <button v-if="obsAllowed.indexOf('reopen') !== -1 && !workflowMode"
              @click="startWorkflow('reopen')" class="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700">
              Re-open
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- ══════════════════════ EXPORT PDF MODAL ════════════════════════════════ -->
    <div v-if="showExportModal" class="modal-overlay" style="z-index:130" @click.self="closeExportModal">
      <div class="modal-box" style="max-width:680px;width:95vw">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">Export Safety Observations</h3>
          <button @click="closeExportModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto">
          <p class="text-xs text-gray-500 mb-4">
            Pick the points to include and how to group them. Empty selections mean "all".
          </p>

          <div class="grid grid-cols-2 gap-4">
            <!-- Packages -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="form-label mb-0">Packages</label>
                <button type="button"
                        @click="toggleSelectAllExport('package_ids', packages.map(p => p.id))"
                        class="text-xs text-ips-blue font-semibold hover:underline">
                  {{ exportFilters.package_ids.length === packages.length && packages.length ? 'Clear all' : 'Select all' }}
                </button>
              </div>
              <div class="border border-gray-200 rounded-lg max-h-80 overflow-y-auto divide-y divide-gray-100">
                <div v-if="!packages.length" class="px-3 py-3 text-xs text-gray-400 text-center">No packages</div>
                <label v-for="p in packages" :key="p.id"
                       class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
                  <input type="checkbox" :value="p.id"
                         :checked="exportFilters.package_ids.includes(p.id)"
                         @change="toggleExportArrayValue('package_ids', p.id)"
                         class="rounded"/>
                  <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ p.tag_number }}</span>
                  <span class="text-gray-700 truncate">{{ p.name }}</span>
                </label>
              </div>
            </div>

            <!-- Areas -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="form-label mb-0">Areas</label>
                <button type="button"
                        @click="toggleSelectAllExport('area_ids', areas.map(a => a.id))"
                        class="text-xs text-ips-blue font-semibold hover:underline">
                  {{ exportFilters.area_ids.length === areas.length && areas.length ? 'Clear all' : 'Select all' }}
                </button>
              </div>
              <div class="border border-gray-200 rounded-lg max-h-80 overflow-y-auto divide-y divide-gray-100">
                <div v-if="!areas.length" class="px-3 py-3 text-xs text-gray-400 text-center">No areas</div>
                <label v-for="a in areas" :key="a.id"
                       class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
                  <input type="checkbox" :value="a.id"
                         :checked="exportFilters.area_ids.includes(a.id)"
                         @change="toggleExportArrayValue('area_ids', a.id)"
                         class="rounded"/>
                  <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ a.tag }}</span>
                  <span class="text-gray-700 truncate">{{ a.description }}</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Statuses -->
          <div class="mt-4">
            <label class="form-label">Statuses</label>
            <div class="flex flex-wrap gap-2">
              <label v-for="st in ['DRAFT','SUBMITTED','RECEIVED','CLOSED']" :key="st"
                     class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm"
                     :class="exportFilters.statuses.includes(st)
                       ? 'bg-ips-blue text-white border-ips-blue'
                       : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'">
                <input type="checkbox" :value="st"
                       :checked="exportFilters.statuses.includes(st)"
                       @change="toggleExportArrayValue('statuses', st)"
                       class="hidden"/>
                {{ st }}
              </label>
            </div>
          </div>

          <!-- Grouping -->
          <div class="mt-4">
            <label class="form-label">Grouping</label>
            <select v-model="exportFilters.group_by" class="input-field" style="max-width:320px">
              <option value="package_area">Package then Area (default)</option>
              <option value="area_package">Area then Package</option>
              <option value="package">Package only</option>
              <option value="area">Area only</option>
              <option value="status">Status</option>
              <option value="none">None — chronological</option>
            </select>
          </div>

          <!-- Floorplan summary pages — split per package -->
          <div class="mt-4">
            <label class="inline-flex items-start gap-2 cursor-pointer text-sm select-none">
              <input type="checkbox" v-model="exportFilters.per_package_plans" class="rounded mt-0.5"/>
              <span>
                <span class="font-medium text-gray-800">Floorplan pages per package</span>
                <span class="block text-xs text-gray-500 mt-0.5">
                  Repeats each floorplan once per package (less crowded when many points share a plan).
                </span>
              </span>
            </label>
          </div>

          <p v-if="exportError" class="text-red-500 text-sm mt-3">{{ exportError }}</p>
        </div>
        <div class="modal-footer">
          <button @click="closeExportModal" :disabled="exporting" class="btn-secondary">Cancel</button>
          <button @click="runExport" :disabled="exporting" class="btn-primary">
            <svg v-if="exporting" class="w-4 h-4 mr-2 inline animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            {{ exporting ? 'Generating PDF…' : 'Generate PDF' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ══════════════════════ FLOORPLAN PIN PICKER ════════════════════════════ -->
    <floorplan-pin-picker v-if="showPinPicker && currentAreaFloorplan"
      :floorplan-id="currentAreaFloorplan.id"
      :floorplan-name="currentAreaFloorplan.name"
      :initial-x="obsForm.floorplan_x"
      :initial-y="obsForm.floorplan_y"
      @save="onPinSave"
      @clear="onPinClear"
      @cancel="onPinCancel">
    </floorplan-pin-picker>

    <!-- ══════════════════════ HISTORY MODAL (ITP pattern) ══════════════════════ -->
    <div v-if="showHistoryModal && obsCurrent" class="modal-overlay" @click.self="closeHistoryModal" style="z-index:120">
      <div class="modal-box" style="max-width:560px">
        <div class="modal-header">
          <div>
            <p class="text-xs font-mono text-gray-400">{{ obsCurrent.display_id }}</p>
            <h3 class="text-lg font-semibold text-gray-800">History</h3>
          </div>
          <button @click="closeHistoryModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto">
          <div v-if="!obsCurrent.history || obsCurrent.history.length === 0"
            class="text-center py-6 text-gray-400 text-sm">No history events recorded yet.</div>
          <ol v-else class="relative border-l-2 border-gray-200 ml-3 space-y-4 pl-5">
            <li v-for="entry in obsCurrent.history" :key="entry.id" class="relative">
              <span class="absolute -left-[29px] top-1 w-3 h-3 rounded-full border-2 border-white"
                :class="eventBulletClass(entry.event)"></span>
              <div class="flex items-center gap-2 flex-wrap">
                <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', eventBadgeClass(entry.event)]">
                  {{ eventLabel(entry.event) }}
                </span>
                <span class="text-xs text-gray-500">{{ fmtDateTime(entry.created_at) }}</span>
              </div>
              <p class="text-xs text-gray-600 mt-1">by <span class="font-medium">{{ entry.actor_name || '—' }}</span></p>
              <p v-if="entry.comment" class="text-sm text-gray-700 italic mt-1 bg-gray-50 rounded p-2 whitespace-pre-line">{{ entry.comment }}</p>
            </li>
          </ol>
        </div>
        <div class="modal-footer">
          <button @click="closeHistoryModal" class="btn-secondary">Close</button>
        </div>
      </div>
    </div>

    <!-- ══════════════════ INCIDENT DETAIL MODAL (two-col, mirrors observation) ══════════════════ -->
    <div v-if="showIncModal" class="modal-overlay" @click.self="closeIncidentModal">
      <div class="modal-box modal-xl" style="max-width:min(1450px,95vw) !important;height:95vh;max-height:95vh;min-height:min(85vh,700px);display:flex;flex-direction:column;overflow:hidden">
        <div class="modal-header">
          <div class="flex items-center gap-3">
            <h3 class="text-lg font-semibold text-gray-800">
              <template v-if="incMode === 'new'">New Safety Incident</template>
              <template v-else>{{ incCurrent ? incCurrent.display_id : '' }} — Safety Incident</template>
            </h3>
            <span v-if="incCurrent" :class="['inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap', incStatusBadgeClass]">
              {{ incidentStatusLabel(incCurrent.status) }}
            </span>
          </div>
          <button @click="closeIncidentModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="modal-body" style="padding:0;display:flex;overflow:hidden;flex:1">
          <!-- LEFT: form + notes + history toggle -->
          <div class="min-w-0 overflow-y-auto" style="flex:1 1 50%;padding:20px 24px">
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="form-label">Package <span class="text-red-500">*</span></label>
                  <select v-model.number="incForm.package_id" class="input-field"
                          :disabled="incMode === 'view' || (incCurrent && incCurrent.status !== 'DRAFT')">
                    <option :value="null">Select a package</option>
                    <option v-for="p in incidentPackageOptions" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Area <span class="text-red-500">*</span></label>
                  <select v-model.number="incForm.area_id" class="input-field"
                          :disabled="incMode === 'view'">
                    <option :value="null">Select an area</option>
                    <option v-for="a in areas" :key="a.id" :value="a.id">{{ a.tag }} — {{ a.description }}</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="form-label">Date <span class="text-red-500">*</span></label>
                  <input v-model="incForm.incident_date" type="date" class="input-field"
                         :disabled="incMode === 'view'"/>
                </div>
                <div>
                  <label class="form-label">Severity class <span class="text-red-500">*</span></label>
                  <select v-model.number="incForm.severity_class_id" class="input-field"
                          :disabled="incMode === 'view'">
                    <option :value="null">Select a severity</option>
                    <option v-for="s in severityClasses" :key="s.id" :value="s.id">{{ s.name }}</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="form-label">Incident cause <span class="text-red-500">*</span></label>
                <select v-model.number="incForm.incident_cause_id" class="input-field"
                        :disabled="incMode === 'view'">
                  <option :value="null">Select a cause</option>
                  <option v-for="c in incidentCauses" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>

              <div v-if="incCauseIsOther">
                <label class="form-label">Specify the cause <span class="text-red-500">*</span></label>
                <input v-model="incForm.other_cause_text" type="text" class="input-field" maxlength="300"
                       placeholder="Describe the cause (required because 'Other' is selected)"
                       :disabled="incMode === 'view'"/>
              </div>

              <!-- Workers (multi-select chip list) -->
              <div>
                <label class="form-label">Workers <span class="text-gray-400 text-xs">(optional, multiple)</span></label>
                <div v-if="!incForm.package_id" class="text-xs text-gray-400 italic px-1 py-2">Select a package first to choose workers.</div>
                <div v-else-if="incFormWorkerOptions.length === 0" class="text-xs text-gray-400 italic px-1 py-2">No approved workers on this package.</div>
                <div v-else class="flex flex-wrap gap-1.5 rounded-lg border border-gray-200 bg-white p-2 overflow-y-auto"
                     style="max-height:14rem">
                  <button v-for="w in incFormWorkerOptions" :key="w.id"
                          type="button"
                          @click="toggleWorker(w.id)"
                          :disabled="incMode === 'view'"
                          :class="['px-2.5 py-1 rounded-full border text-xs font-medium transition-colors',
                                   incForm.worker_ids.indexOf(w.id) !== -1
                                     ? 'bg-ips-blue text-white border-ips-blue'
                                     : 'bg-white border-gray-300 text-gray-600 hover:border-ips-blue',
                                   incMode === 'view' ? 'cursor-default' : '']">
                    {{ w.name }}
                  </button>
                </div>
              </div>

              <div>
                <label class="form-label">Details <span class="text-red-500">*</span></label>
                <textarea v-model="incForm.details" class="input-field" rows="4"
                          :disabled="incMode === 'view'"
                          placeholder="What happened?"></textarea>
              </div>

              <div>
                <label class="form-label">Action <span class="text-red-500">*</span></label>
                <textarea v-model="incForm.action" class="input-field" rows="3"
                          :disabled="incMode === 'view'"
                          placeholder="What action will be taken (immediate measures, follow-up, prevention)?"></textarea>
              </div>

              <p v-if="incError" class="text-red-500 text-sm">{{ incError }}</p>

              <!-- Created by / at + workflow context -->
              <div v-if="incCurrent" class="text-xs text-gray-500 pt-2 border-t border-gray-200">
                Created by <span class="font-medium text-gray-700">{{ incCurrent.created_by_name || '—' }}</span>
                on {{ fmtDateTime(incCurrent.created_at) }}
                <span v-if="incCurrent.updated_at"> · last updated {{ fmtDateTime(incCurrent.updated_at) }}</span>
              </div>

              <div v-for="entry in incWorkflowComments" :key="entry.id"
                   :class="['rounded-lg p-3 text-sm border', incWorkflowCommentBoxClass(entry.event)]">
                <p :class="['text-xs uppercase tracking-wider mb-1', incWorkflowCommentLabelClass(entry.event)]">
                  {{ incWorkflowCommentTitle(entry) }}
                </p>
                <p class="text-gray-700 whitespace-pre-line">{{ entry.comment }}</p>
              </div>

              <!-- Workflow inline prompt -->
              <div v-if="incWorkflowMode" ref="incWorkflowPrompt"
                   class="mt-3 rounded-lg bg-amber-50 border-2 border-amber-300 p-3 shadow-sm ring-2 ring-amber-200/60">
                <p class="text-sm font-semibold text-amber-800 mb-2">
                  <template v-if="incWorkflowMode === 'approve_investigation'">Comments on Action Plan</template>
                  <template v-else-if="incWorkflowMode === 'mark_action_done'">Comments on completed action</template>
                  <template v-else-if="incWorkflowMode === 'close'">Closure comments</template>
                  <template v-else-if="incWorkflowMode === 'reopen'">Reason for re-opening</template>
                </p>
                <textarea v-model="incWorkflowComment" class="input-field" rows="3"
                          ref="incWorkflowTextarea"
                          :placeholder="incWorkflowMode === 'reopen' ? 'Reason for re-opening (required)' : 'Comment (optional)'"></textarea>
                <div class="flex justify-end gap-2 mt-2">
                  <button @click="cancelIncWorkflow" class="btn-secondary text-sm">Cancel</button>
                  <button @click="confirmIncWorkflow" :disabled="incWorkflowSaving"
                    :class="['text-sm font-semibold rounded-lg text-white px-4 py-2 disabled:opacity-50',
                             incWorkflowMode === 'close' ? 'bg-emerald-600 hover:bg-emerald-700'
                             : incWorkflowMode === 'reopen' ? 'bg-amber-600 hover:bg-amber-700'
                             : incWorkflowMode === 'mark_action_done' ? 'bg-amber-600 hover:bg-amber-700'
                             : incWorkflowMode === 'approve_investigation' ? 'bg-indigo-600 hover:bg-indigo-700'
                             : 'bg-blue-600 hover:bg-blue-700']">
                    {{ incWorkflowSaving ? 'Saving…' : 'Confirm' }}
                  </button>
                </div>
              </div>

              <!-- Notes (meeting-points style) -->
              <div v-if="incCurrent && incMode !== 'new'" class="border-t border-gray-200 pt-3 mt-3">
                <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Notes</h4>
                <div v-if="!incCurrent.notes || incCurrent.notes.length === 0" class="text-xs text-gray-400 italic mb-2">No notes yet.</div>
                <div v-else class="space-y-2 mb-3">
                  <div v-for="n in incCurrent.notes" :key="n.id" class="rounded-lg bg-gray-50 border border-gray-200 p-2.5">
                    <div class="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span><span class="font-medium text-gray-700">{{ n.created_by_name || '—' }}</span> · {{ fmtDateTime(n.created_at) }}</span>
                      <div v-if="canEditNote(n)" class="flex items-center gap-1">
                        <button @click="startEditNote(n)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button @click="deleteIncNote(n)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </div>
                    </div>
                    <div v-if="noteEditingId === n.id">
                      <textarea v-model="noteEditingContent" class="input-field text-sm" rows="2"></textarea>
                      <div class="flex justify-end gap-2 mt-1">
                        <button @click="cancelEditNote" class="btn-secondary text-xs">Cancel</button>
                        <button @click="saveEditNote" :disabled="noteSaving" class="btn-primary text-xs">{{ noteSaving ? 'Saving…' : 'Save' }}</button>
                      </div>
                    </div>
                    <p v-else class="text-sm text-gray-700 whitespace-pre-line">{{ n.content }}</p>
                  </div>
                </div>
                <div v-if="!isBidder">
                  <textarea v-model="newNoteContent" class="input-field text-sm" rows="2" placeholder="Add a note…"></textarea>
                  <div class="flex justify-end mt-1">
                    <button @click="addIncNote" :disabled="noteSaving || !newNoteContent.trim()" class="btn-primary text-xs">
                      {{ noteSaving ? 'Adding…' : 'Add note' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- RIGHT: attachments -->
          <div class="min-w-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="flex:1 1 50%;padding:20px 16px">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
            <div v-if="incMode === 'new' || !incCurrent" class="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg p-3">
              Save the incident first, then attachments can be added here.
            </div>
            <file-attachments v-else
              record-type="incident"
              :record-id="incCurrent.id"
              :can-upload="incCurrent.status !== 'CLOSED'"
              :can-edit="(incAllowed.indexOf('edit') !== -1) || isOwnerOrAdmin"
              :gallery-mode="true">
            </file-attachments>
          </div>
        </div>

        <!-- Footer: contextual workflow buttons -->
        <div class="modal-footer">
          <button @click="closeIncidentModal" class="btn-secondary">Close</button>
          <button v-if="incCurrent && incMode !== 'new'"
                  @click="openIncHistoryModal"
                  class="btn-secondary flex items-center gap-1.5"
                  title="Show history log">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            History
          </button>

          <template v-if="incMode === 'new'">
            <button @click="saveIncident" :disabled="incSaving || !canSaveIncidentForm" class="btn-primary">
              {{ incSaving ? 'Saving…' : 'Save as Draft' }}
            </button>
          </template>

          <template v-else-if="incMode === 'edit'">
            <button @click="cancelEditIncident" class="btn-secondary" :disabled="incSaving">Cancel</button>
            <button @click="saveIncident" :disabled="incSaving || !canSaveIncidentForm" class="btn-primary">
              {{ incSaving ? 'Saving…' : 'Save Changes' }}
            </button>
          </template>

          <template v-else>
            <button v-if="incAllowed.indexOf('delete') !== -1"
                    @click="deleteIncident"
                    class="px-3 py-1.5 text-sm font-semibold rounded-lg border border-red-300 text-red-700 bg-white hover:bg-red-50">
              Delete
            </button>
            <button v-if="incAllowed.indexOf('edit') !== -1"
                    @click="startEditIncident" class="btn-secondary">Edit</button>
            <button v-if="incAllowed.indexOf('submit') !== -1 && !incWorkflowMode"
                    @click="submitIncidentDraft" :disabled="incWorkflowSaving"
                    class="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {{ incWorkflowSaving ? 'Submitting…' : 'Submit' }}
            </button>
            <button v-if="incAllowed.indexOf('approve_investigation') !== -1 && !incWorkflowMode"
                    @click="startIncWorkflow('approve_investigation')"
                    class="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
              Review Action Plan
            </button>
            <button v-if="incAllowed.indexOf('mark_action_done') !== -1 && !incWorkflowMode"
                    @click="startIncWorkflow('mark_action_done')"
                    class="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700">
              Confirm action done
            </button>
            <button v-if="incAllowed.indexOf('close') !== -1 && !incWorkflowMode"
                    @click="startIncWorkflow('close')"
                    class="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
              Close
            </button>
            <button v-if="incAllowed.indexOf('reopen') !== -1 && !incWorkflowMode"
                    @click="startIncWorkflow('reopen')"
                    class="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700">
              Re-open
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- ══════════════════════ INCIDENT HISTORY MODAL ══════════════════════ -->
    <div v-if="showIncHistoryModal && incCurrent" class="modal-overlay" @click.self="closeIncHistoryModal" style="z-index:120">
      <div class="modal-box" style="max-width:560px">
        <div class="modal-header">
          <div>
            <p class="text-xs font-mono text-gray-400">{{ incCurrent.display_id }}</p>
            <h3 class="text-lg font-semibold text-gray-800">History</h3>
          </div>
          <button @click="closeIncHistoryModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto">
          <div v-if="!incCurrent.history || incCurrent.history.length === 0"
               class="text-center py-6 text-gray-400 text-sm">No history events recorded yet.</div>
          <ol v-else class="relative border-l-2 border-gray-200 ml-3 space-y-4 pl-5">
            <li v-for="entry in incCurrent.history" :key="entry.id" class="relative">
              <span class="absolute -left-[29px] top-1 w-3 h-3 rounded-full border-2 border-white"
                    :class="incidentEventBulletClass(entry.event)"></span>
              <div class="flex items-center gap-2 flex-wrap">
                <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', incidentEventBadgeClass(entry.event)]">
                  {{ incidentEventLabel(entry.event) }}
                </span>
                <span class="text-xs text-gray-500">{{ fmtDateTime(entry.created_at) }}</span>
              </div>
              <p class="text-xs text-gray-600 mt-1">by <span class="font-medium">{{ entry.actor_name || '—' }}</span></p>
              <p v-if="entry.comment" class="text-sm text-gray-700 italic mt-1 bg-gray-50 rounded p-2 whitespace-pre-line">{{ entry.comment }}</p>
            </li>
          </ol>
        </div>
        <div class="modal-footer">
          <button @click="closeIncHistoryModal" class="btn-secondary">Close</button>
        </div>
      </div>
    </div>

    <!-- ══════════════════ TOOLBOX DETAIL MODAL (two-col, mirrors observation/incident) ══════════════════ -->
    <div v-if="showTbxModal" class="modal-overlay" @click.self="closeTbxModal">
      <div class="modal-box modal-xl" style="max-width:min(1450px,95vw) !important;height:95vh;max-height:95vh;min-height:min(85vh,700px);display:flex;flex-direction:column;overflow:hidden">
        <div class="modal-header">
          <div class="flex items-center gap-3">
            <h3 class="text-lg font-semibold text-gray-800">
              <template v-if="tbxMode === 'new'">New Toolbox Talk</template>
              <template v-else>{{ tbxCurrent ? tbxCurrent.display_id : '' }} — Toolbox Talk</template>
            </h3>
            <span v-if="tbxCurrent" :class="['inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap', tbxStatusBadgeClass]">
              {{ tbxStatusLabel(tbxCurrent.status) }}
            </span>
          </div>
          <button @click="closeTbxModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="modal-body" style="padding:0;display:flex;overflow:hidden;flex:1">
          <!-- LEFT: form -->
          <div class="min-w-0 overflow-y-auto" style="flex:1 1 50%;padding:20px 24px">
            <div class="space-y-3">
              <!-- Packages (multi-select chips with Select all) -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="form-label mb-0">Packages <span class="text-red-500">*</span></label>
                  <div v-if="tbxMode !== 'view'" class="flex items-center gap-2 text-xs">
                    <button type="button" @click="selectAllPackagesInTbx" class="text-ips-blue hover:underline font-semibold">Select all</button>
                    <span class="text-gray-300">·</span>
                    <button type="button" @click="clearAllPackagesInTbx" class="text-gray-500 hover:underline">Clear</button>
                  </div>
                </div>
                <div class="flex flex-wrap gap-1.5 rounded-lg border border-gray-200 bg-white p-2 overflow-y-auto" style="max-height:11rem">
                  <button v-for="p in tbxPackageOptions" :key="p.id"
                          type="button"
                          @click="togglePackageInTbx(p.id)"
                          :disabled="tbxMode === 'view'"
                          :class="['px-2.5 py-1 rounded-full border text-xs font-medium transition-colors',
                                   tbxForm.package_ids.indexOf(p.id) !== -1
                                     ? 'bg-ips-blue text-white border-ips-blue'
                                     : 'bg-white border-gray-300 text-gray-600 hover:border-ips-blue',
                                   tbxMode === 'view' ? 'cursor-default' : '']">
                    {{ p.tag_number }} — {{ p.name }}
                  </button>
                </div>
              </div>

              <!-- Date / Category -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="form-label">Date <span class="text-red-500">*</span></label>
                  <input v-model="tbxForm.talk_date" type="date" class="input-field" :disabled="tbxMode === 'view'"/>
                </div>
                <div>
                  <label class="form-label">Toolbox category <span class="text-red-500">*</span></label>
                  <select v-model.number="tbxForm.category_id" class="input-field" :disabled="tbxMode === 'view'">
                    <option :value="null">Select a category</option>
                    <option v-for="c in toolboxCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
                  </select>
                </div>
              </div>

              <div v-if="tbxCategoryIsOther">
                <label class="form-label">Specify the topic <span class="text-red-500">*</span></label>
                <input v-model="tbxForm.other_category_text" type="text" class="input-field" maxlength="300"
                       placeholder="Describe the topic (required because 'Other' is selected)"
                       :disabled="tbxMode === 'view'"/>
              </div>

              <!-- Given by (combined user + worker dropdown, with search) -->
              <div>
                <label class="form-label">Given by <span class="text-red-500">*</span></label>
                <input v-if="tbxMode !== 'view'" v-model="tbxGiverSearch" type="text"
                       class="input-field text-sm mb-1.5"
                       placeholder="Search users or workers by name…"/>
                <select v-model="givenBySelectValue" class="input-field" :disabled="tbxMode === 'view'">
                  <option value="">Select…</option>
                  <optgroup label="Users" v-if="tbxFilteredGivers.users.length">
                    <option v-for="u in tbxFilteredGivers.users" :key="'u-' + u.id" :value="'user:' + u.id">{{ u.name }}</option>
                  </optgroup>
                  <optgroup label="Workers" v-if="tbxFilteredGivers.workers.length">
                    <option v-for="w in tbxFilteredGivers.workers" :key="'w-' + w.id" :value="'worker:' + w.id">{{ w.name }}</option>
                  </optgroup>
                </select>
                <p v-if="tbxMode !== 'view' && tbxGiverSearch && !tbxFilteredGivers.users.length && !tbxFilteredGivers.workers.length"
                   class="text-xs text-gray-400 italic mt-1">No users or workers match this search.</p>
              </div>

              <!-- Workers (multi-select chips with Select all) -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="form-label mb-0">Workers <span class="text-gray-400 text-xs">(optional, multiple)</span></label>
                  <div v-if="tbxMode !== 'view' && tbxWorkerOptions.length" class="flex items-center gap-2 text-xs">
                    <button type="button" @click="selectAllWorkersInTbx" class="text-ips-blue hover:underline font-semibold">Select all</button>
                    <span class="text-gray-300">·</span>
                    <button type="button" @click="clearAllWorkersInTbx" class="text-gray-500 hover:underline">Clear</button>
                  </div>
                </div>
                <div v-if="!tbxForm.package_ids.length" class="text-xs text-gray-400 italic px-1 py-2">Select packages first to choose workers.</div>
                <div v-else-if="tbxWorkerOptions.length === 0" class="text-xs text-gray-400 italic px-1 py-2">No approved workers on the selected packages.</div>
                <div v-else class="flex flex-wrap gap-1.5 rounded-lg border border-gray-200 bg-white p-2 overflow-y-auto" style="max-height:14rem">
                  <button v-for="w in tbxWorkerOptions" :key="w.id"
                          type="button"
                          @click="toggleWorkerInTbx(w.id)"
                          :disabled="tbxMode === 'view'"
                          :class="['px-2.5 py-1 rounded-full border text-xs font-medium transition-colors',
                                   tbxForm.worker_ids.indexOf(w.id) !== -1
                                     ? 'bg-ips-blue text-white border-ips-blue'
                                     : 'bg-white border-gray-300 text-gray-600 hover:border-ips-blue',
                                   tbxMode === 'view' ? 'cursor-default' : '']">
                    {{ w.name }}
                  </button>
                </div>
              </div>

              <div>
                <label class="form-label">Details <span class="text-red-500">*</span></label>
                <textarea v-model="tbxForm.details" class="input-field" rows="4"
                          :disabled="tbxMode === 'view'"
                          placeholder="What was discussed during the toolbox talk?"></textarea>
              </div>

              <!-- Linked observations (search + selected chips + capped candidates) -->
              <div>
                <label class="form-label">Linked safety observations <span class="text-gray-400 text-xs">(optional, multiple)</span></label>
                <div v-if="observations.length === 0" class="text-xs text-gray-400 italic px-1 py-2">No observations available.</div>
                <template v-else>
                  <!-- Selected chips (always rendered when present) -->
                  <div v-if="tbxSelectedObservations.length"
                       class="flex flex-wrap gap-1.5 mb-1.5">
                    <span v-for="o in tbxSelectedObservations" :key="'sel-o-' + o.id"
                          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-ips-blue text-white text-xs font-medium"
                          :title="o.details || ''">
                      {{ o.display_id }} — {{ o.category_name || '' }}
                      <button v-if="tbxMode !== 'view'" type="button"
                              @click="toggleObservationInTbx(o.id)"
                              class="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-white/20"
                              title="Remove">×</button>
                    </span>
                  </div>
                  <!-- Search + candidate list (hidden in view mode) -->
                  <template v-if="tbxMode !== 'view'">
                    <input v-model="tbxObsSearch" type="text"
                           class="input-field text-sm mb-1.5"
                           placeholder="Search observations by ID, category, or details…"/>
                    <div class="flex flex-wrap gap-1.5 rounded-lg border border-gray-200 bg-white p-2 overflow-y-auto" style="max-height:11rem">
                      <button v-for="o in tbxCandidateObservations.items" :key="'cand-o-' + o.id"
                              type="button"
                              @click="toggleObservationInTbx(o.id)"
                              :title="o.details || ''"
                              class="px-2.5 py-1 rounded-full border bg-white border-gray-300 text-gray-600 hover:border-ips-blue text-xs font-medium transition-colors">
                        {{ o.display_id }} — {{ o.category_name || '' }}
                      </button>
                      <span v-if="tbxCandidateObservations.items.length === 0" class="text-xs text-gray-400 italic px-1 py-1">
                        {{ tbxObsSearch ? 'No matches.' : 'All observations are already selected.' }}
                      </span>
                    </div>
                    <p v-if="tbxCandidateObservations.total > tbxCandidateLimit"
                       class="text-xs text-gray-400 mt-1">
                      Showing {{ tbxCandidateLimit }} of {{ tbxCandidateObservations.total }} matching — refine the search to narrow down.
                    </p>
                  </template>
                </template>
              </div>

              <!-- Linked incidents (search + selected chips + capped candidates) -->
              <div>
                <label class="form-label">Linked safety incidents <span class="text-gray-400 text-xs">(optional, multiple)</span></label>
                <div v-if="incidents.length === 0" class="text-xs text-gray-400 italic px-1 py-2">No incidents available.</div>
                <template v-else>
                  <div v-if="tbxSelectedIncidents.length"
                       class="flex flex-wrap gap-1.5 mb-1.5">
                    <span v-for="i in tbxSelectedIncidents" :key="'sel-i-' + i.id"
                          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-ips-blue text-white text-xs font-medium"
                          :title="i.details || ''">
                      {{ i.display_id }} — {{ i.severity_class_name || '' }}
                      <button v-if="tbxMode !== 'view'" type="button"
                              @click="toggleIncidentInTbx(i.id)"
                              class="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-white/20"
                              title="Remove">×</button>
                    </span>
                  </div>
                  <template v-if="tbxMode !== 'view'">
                    <input v-model="tbxIncSearch" type="text"
                           class="input-field text-sm mb-1.5"
                           placeholder="Search incidents by ID, severity, cause, or details…"/>
                    <div class="flex flex-wrap gap-1.5 rounded-lg border border-gray-200 bg-white p-2 overflow-y-auto" style="max-height:11rem">
                      <button v-for="i in tbxCandidateIncidents.items" :key="'cand-i-' + i.id"
                              type="button"
                              @click="toggleIncidentInTbx(i.id)"
                              :title="i.details || ''"
                              class="px-2.5 py-1 rounded-full border bg-white border-gray-300 text-gray-600 hover:border-ips-blue text-xs font-medium transition-colors">
                        {{ i.display_id }} — {{ i.severity_class_name || '' }}
                      </button>
                      <span v-if="tbxCandidateIncidents.items.length === 0" class="text-xs text-gray-400 italic px-1 py-1">
                        {{ tbxIncSearch ? 'No matches.' : 'All incidents are already selected.' }}
                      </span>
                    </div>
                    <p v-if="tbxCandidateIncidents.total > tbxCandidateLimit"
                       class="text-xs text-gray-400 mt-1">
                      Showing {{ tbxCandidateLimit }} of {{ tbxCandidateIncidents.total }} matching — refine the search to narrow down.
                    </p>
                  </template>
                </template>
              </div>

              <p v-if="tbxError" class="text-red-500 text-sm">{{ tbxError }}</p>

              <!-- Created by / at + workflow trail -->
              <div v-if="tbxCurrent" class="text-xs text-gray-500 pt-2 border-t border-gray-200">
                Created by <span class="font-medium text-gray-700">{{ tbxCurrent.created_by_name || '—' }}</span>
                on {{ fmtDateTime(tbxCurrent.created_at) }}
                <span v-if="tbxCurrent.updated_at"> · last updated {{ fmtDateTime(tbxCurrent.updated_at) }}</span>
              </div>
              <div v-if="tbxCurrent && tbxCurrent.submitted_at" class="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-800">
                Submitted by <span class="font-medium">{{ tbxCurrent.submitted_by_name || '—' }}</span> on {{ fmtDateTime(tbxCurrent.submitted_at) }}
              </div>
              <div v-if="tbxCurrent && tbxCurrent.acknowledged_at" class="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800">
                Acknowledged by <span class="font-medium">{{ tbxCurrent.acknowledged_by_name || '—' }}</span> on {{ fmtDateTime(tbxCurrent.acknowledged_at) }}
                <p v-if="tbxCurrent.acknowledge_comment" class="text-gray-700 whitespace-pre-line mt-1">{{ tbxCurrent.acknowledge_comment }}</p>
              </div>
              <div v-if="tbxCurrent && tbxCurrent.reopened_at" class="rounded-lg bg-orange-50 border border-orange-200 p-2.5 text-xs text-orange-800">
                Re-opened by <span class="font-medium">{{ tbxCurrent.reopened_by_name || '—' }}</span> on {{ fmtDateTime(tbxCurrent.reopened_at) }}
              </div>

              <!-- Inline re-open prompt -->
              <div v-if="tbxWorkflowMode === 'reopen'" ref="tbxWorkflowPrompt"
                   class="mt-3 rounded-lg bg-amber-50 border-2 border-amber-300 p-3 shadow-sm ring-2 ring-amber-200/60">
                <p class="text-sm font-semibold text-amber-800 mb-2">Reason for re-opening</p>
                <textarea v-model="tbxWorkflowComment" class="input-field" rows="3"
                          ref="tbxWorkflowTextarea"
                          placeholder="Why is this toolbox being sent back for editing? (required)"></textarea>
                <div class="flex justify-end gap-2 mt-2">
                  <button @click="cancelTbxWorkflow" class="btn-secondary text-sm">Cancel</button>
                  <button @click="confirmTbxWorkflow" :disabled="tbxWorkflowSaving"
                          class="text-sm font-semibold rounded-lg text-white px-4 py-2 disabled:opacity-50 bg-amber-600 hover:bg-amber-700">
                    {{ tbxWorkflowSaving ? 'Re-opening…' : 'Confirm Re-open' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- RIGHT: attachments -->
          <div class="min-w-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="flex:1 1 50%;padding:20px 16px">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
            <div v-if="tbxMode === 'new' || !tbxCurrent" class="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg p-3">
              Save the toolbox first, then attachments can be added here.
            </div>
            <file-attachments v-else
              record-type="safety_toolbox"
              :record-id="tbxCurrent.id"
              :can-upload="tbxCurrent.status !== 'SUBMITTED'"
              :can-edit="(tbxAllowed.indexOf('edit') !== -1) || isOwnerOrAdmin"
              :gallery-mode="true">
            </file-attachments>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="closeTbxModal" class="btn-secondary">Close</button>
          <button v-if="tbxCurrent && tbxMode !== 'new'"
                  @click="openTbxHistoryModal"
                  class="btn-secondary flex items-center gap-1.5"
                  title="Show history log">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            History
          </button>

          <template v-if="tbxMode === 'new'">
            <button @click="saveToolbox" :disabled="tbxSaving || !canSaveToolboxForm" class="btn-primary">
              {{ tbxSaving ? 'Saving…' : 'Save as Draft' }}
            </button>
          </template>

          <template v-else-if="tbxMode === 'edit'">
            <button @click="cancelEditToolbox" class="btn-secondary" :disabled="tbxSaving">Cancel</button>
            <button @click="saveToolbox" :disabled="tbxSaving || !canSaveToolboxForm" class="btn-primary">
              {{ tbxSaving ? 'Saving…' : 'Save Changes' }}
            </button>
          </template>

          <template v-else>
            <button v-if="tbxAllowed.indexOf('delete') !== -1"
                    @click="deleteToolbox"
                    class="px-3 py-1.5 text-sm font-semibold rounded-lg border border-red-300 text-red-700 bg-white hover:bg-red-50">
              Delete
            </button>
            <button v-if="tbxAllowed.indexOf('edit') !== -1"
                    @click="startEditToolbox" class="btn-secondary">Edit</button>
            <button v-if="tbxAllowed.indexOf('submit') !== -1"
                    @click="submitToolbox" :disabled="tbxWorkflowSaving"
                    class="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {{ tbxWorkflowSaving ? 'Submitting…' : 'Submit' }}
            </button>
            <button v-if="tbxAllowed.indexOf('acknowledge') !== -1 && !tbxWorkflowMode"
                    @click="acknowledgeToolbox" :disabled="tbxWorkflowSaving"
                    class="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
              {{ tbxWorkflowSaving ? 'Acknowledging…' : 'Acknowledge' }}
            </button>
            <button v-if="tbxAllowed.indexOf('reopen') !== -1 && !tbxWorkflowMode"
                    @click="startTbxReopen"
                    class="px-4 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700">
              Re-open
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- ══════════════════ TOOLBOX HISTORY MODAL ══════════════════ -->
    <div v-if="showTbxHistoryModal && tbxCurrent" class="modal-overlay" @click.self="closeTbxHistoryModal" style="z-index:120">
      <div class="modal-box" style="max-width:560px">
        <div class="modal-header">
          <div>
            <p class="text-xs font-mono text-gray-400">{{ tbxCurrent.display_id }}</p>
            <h3 class="text-lg font-semibold text-gray-800">History</h3>
          </div>
          <button @click="closeTbxHistoryModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto">
          <div v-if="!tbxCurrent.history || tbxCurrent.history.length === 0"
               class="text-center py-6 text-gray-400 text-sm">No history events recorded yet.</div>
          <ol v-else class="relative border-l-2 border-gray-200 ml-3 space-y-4 pl-5">
            <li v-for="entry in tbxCurrent.history" :key="entry.id" class="relative">
              <span class="absolute -left-[29px] top-1 w-3 h-3 rounded-full border-2 border-white"
                    :class="tbxEventBulletClass(entry.event)"></span>
              <div class="flex items-center gap-2 flex-wrap">
                <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', tbxEventBadgeClass(entry.event)]">
                  {{ tbxEventLabel(entry.event) }}
                </span>
                <span class="text-xs text-gray-500">{{ fmtDateTime(entry.created_at) }}</span>
              </div>
              <p class="text-xs text-gray-600 mt-1">by <span class="font-medium">{{ entry.actor_name || '—' }}</span></p>
              <p v-if="entry.comment" class="text-sm text-gray-700 italic mt-1 bg-gray-50 rounded p-2 whitespace-pre-line">{{ entry.comment }}</p>
            </li>
          </ol>
        </div>
        <div class="modal-footer">
          <button @click="closeTbxHistoryModal" class="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  </div>
  `,
});
