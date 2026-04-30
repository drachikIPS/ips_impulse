// ─────────────────────────────────────────────────────────────────────────────
// Construction module
//   • Setup tab (project owners only): Work-permit types / Safety-observation
//     categories / Worker-certificate types + read-only Areas view with the
//     site supervisors assigned in the Project Organization module.
//   • Workers & Subcontractors tab: vendors register their subcontractors
//     (SU-xxxxxx) and workers (WK-xxxxxx) scoped to the packages they are
//     linked to; worker certificates can be uploaded as attachments.
// ─────────────────────────────────────────────────────────────────────────────
app.component('construction-module', {
  props: ['currentUser', 'initialTab', 'pendingOpen'],
  emits: ['subtab-change', 'record-change'],

  data() {
    return {
      activeTab: 'daily',             // 'dashboard' | 'setup' | 'people' | 'approvals' | 'daily' | 'permits' | 'worklogs' | 'coactivity' | 'loto'
      // Dashboard state: a single package filter cascades through every
      // card + the active-workers line chart.
      dashboardPackageFilter: null,
      activeWorkersChartObj: null,
      activeWorkersSeries: { labels: [], data: [] },  // fetched from dashboard endpoint

      // Catalogue of hazard symbols (served from /static/assets/hazards/).
      // `key` is the SVG filename (less extension). These are the symbols
      // shipped in the Hazard symbols folder.
      hazardCatalog: [
        { key: 'General danger',          label: 'General danger' },
        { key: 'Fire Hazard',             label: 'Fire hazard' },
        { key: 'Electrical Danger',       label: 'Electrical danger' },
        { key: 'Corrosive substances',    label: 'Corrosive substances' },
        { key: 'Toxic substances',        label: 'Toxic substances' },
        { key: 'Hot surface',             label: 'Hot surface' },
        { key: 'Crusshing hazard',        label: 'Crushing hazard' },
        { key: 'Lifting operations',      label: 'Lifting operations' },
        { key: 'Pressurized cilinders',   label: 'Pressurised cylinders' },
        { key: 'Risk of Falling',         label: 'Risk of falling' },
        { key: 'Slippery surface',        label: 'Slippery surface' },
      ],
      // PPE catalogue. `default` items are pre-selected on new permits.
      ppeCatalog: [
        { key: 'Safety goggles',        label: 'Safety goggles',        default: true },
        { key: 'Safety helmet',         label: 'Safety helmet',         default: true },
        { key: 'Safety shoes',          label: 'Safety shoes',          default: true },
        { key: 'Protective gloves',     label: 'Protective gloves',     default: true },
        { key: 'Safety clothing',       label: 'Safety clothing',       default: false },
        { key: 'Ear protection',        label: 'Ear protection',        default: false },
        { key: 'Mask',                  label: 'Dust mask',             default: false },
        { key: 'respiratory protection',label: 'Respiratory protection',default: false },
        { key: 'Harness',               label: 'Harness',               default: false },
      ],
      setupSubtab: 'permits',         // 'permits' | 'certs' | 'areas'
      peopleSubtab: 'workers',        // 'workers' | 'subcontractors'

      // Setup lists
      permitTypes: [],
      certificateTypes: [],
      areasWithSupervisors: [],

      // Setup editing state
      setupEditing: null,      // { kind, item? } — null when not editing
      setupForm: { name: '', description: '', polarity: 'NEGATIVE' },
      setupSaving: false,
      setupError: '',

      // Packages (for selects)
      packages: [],
      vendorPackageIds: [],    // packages the current user is linked to

      // Subcontractors
      subcontractors: [],
      subLoading: false,
      showSubModal: false,
      editingSub: null,
      subForm: {
        package_id: null, company: '', contact_person: '',
        phone: '', email: '', description: '',
      },
      subSaving: false,
      subError: '',
      subPackageFilter: null,

      // Workers
      workers: [],
      workerLoading: false,
      showWorkerModal: false,
      editingWorker: null,
      workerForm: {
        package_id: null, name: '', phone: '',
        is_subcontractor: false, subcontractor_id: null,
        certificate_type_ids: [],
      },
      workerSaving: false,
      workerError: '',
      workerPackageFilter: null,
      lastSavedWorkerId: null,   // allow file upload right after create

      // Approvals queue
      pendingApprovalWorkers: [],
      approvalPackageFilter: null,
      // Reject-comment modal
      rejectModalWorker: null,
      rejectComment: '',
      rejectSaving: false,
      // Override (admin / project owner) modal
      overrideModalWorker: null,
      overrideApproved: true,
      overrideComment: '',
      overrideSaving: false,
      // Worker history — shown in its own modal (like invoice history)
      historyWorker: null,
      workerHistory: [],
      workerHistoryLoading: false,
      workflowSaving: false,

      // Daily reports
      dailyReports: [],
      dailyReportLoading: false,
      showReportModal: false,
      editingReport: null,
      reportForm: {
        package_id: null, report_date: '', avg_hours_per_worker: 0,
        description: '', worker_ids: [], area_ids: [], no_work: false,
      },
      reportSaving: false,
      reportError: '',
      reportPackageFilter: null,
      reportAreaFilter: null,
      showUnlockModal: false,
      unlockTargetReport: null,
      unlockComment: '',
      unlockSaving: false,
      unlockError: '',

      // Areas from project organisation (for report form multi-select)
      projectAreas: [],

      // Excel export (green button, matches Risk Register pattern). One
      // boolean per list so multiple exports can be triggered without
      // crossing their loading states.
      xlsxExportingDaily:       false,
      xlsxExportingWorkLogs:    false,
      xlsxExportingWorkersSubs: false,
      xlsxExportingPermits:     false,
      xlsxExportingLotos:       false,

      // Workers/Subcontractors import (mirrors risk-register's pattern)
      showWsImportModal: false,
      wsImportFile: null,
      wsImportPreview: null,
      wsImportLoading: false,
      wsImportApplying: false,
      wsImportError: '',
      wsImportResult: null,

      // LOTO
      lotos: [],
      lotoLoading: false,
      pendingLotos: [],
      lotoPackageFilter: null,
      lotoStatusFilter: null,
      lotoPermitFilter: null,
      showLotoRefuseModal: false,
      lotoRefuseTarget: null,
      lotoRefuseComment: '',
      lotoRefuseSaving: false,
      lotoRefuseError: '',
      showLotoOverrideModal: false,
      lotoOverrideTarget: null,
      lotoOverrideApprove: true,
      lotoOverrideComment: '',
      lotoOverrideSaving: false,
      lotoOverrideError: '',
      showLotoHistoryModal: false,
      lotoHistoryLoto: null,
      lotoHistoryRows: [],
      lotoHistoryLoading: false,

      // Work permits
      workPermits: [],
      workPermitLoading: false,
      showPermitModal: false,
      editingPermit: null,
      permitForm: {
        package_id: null, title: '', description: '',
        start_date: '', end_date: '',
        permit_type_ids: [], area_ids: [],
        hazards: {},         // hazard_key → preventive_measure
        hazards_other: '',
        ppe_keys: [],
        ppe_other: '',
        lotos: [],           // [{ id?, tag_number, description, status, locked_state, refusal_comment }]
      },
      permitSaving: false,
      permitError: '',
      permitPackageFilter: null,
      permitAreaFilter: null,
      permitStatusFilter: null,

      // Work-permit approval — per-area decision modal
      showPermitDecisionModal: false,
      permitDecisionMode: 'approve',   // 'approve' | 'reject'
      permitDecisionAreaIds: [],       // which area_ids to act on
      permitDecisionComment: '',
      permitDecisionSaving: false,
      permitDecisionError: '',

      // Work-permit review-history modal
      showPermitHistoryModal: false,
      permitHistoryPermit: null,
      permitHistoryRows: [],
      permitHistoryLoading: false,

      // Co-activity board — horizontal scroll anchor (Monday of the
      // leftmost visible week). Initialised on first mount to the Monday
      // of the current week. Granularity toggles between a daily grid
      // (56 columns) and a weekly grid (8 columns) over the same 8-week
      // window.
      coactivityStartISO: null,
      coactivityWeeks: 8,
      coactivityGranularity: 'day',   // 'day' | 'week'

      // Close / extension modals
      showPermitCloseModal: false,
      permitCloseComment: '',
      permitCloseSaving: false,
      permitCloseError: '',
      showPermitExtensionModal: false,
      permitExtensionNewDate: '',
      permitExtensionComment: '',
      permitExtensionSaving: false,
      permitExtensionError: '',

      // Work logs
      workLogs: [],
      workLogLoading: false,
      showLogModal: false,
      editingLog: null,
      logForm: { package_id: null, start_date: '', end_date: '', notes: '' },
      logSaving: false,
      logError: '',
      logPackageFilter: null,
    };
  },

  computed: {
    isOwnerOrAdmin() {
      if (!this.currentUser) return false;
      const r = this.currentUser.role;
      if (r === 'ADMIN' || r === 'PROJECT_OWNER') return true;
      // Construction Manager (Construction Module Lead) gets the same UI gates.
      return (this.currentUser.lead_modules || []).includes('Construction');
    },
    isVendor() {
      return this.currentUser && this.currentUser.role === 'VENDOR';
    },
    // True iff current contact is declared a site supervisor on at least
    // one area of the project. Backed by areasWithSupervisors which is
    // loaded by loadSetupLists() on module mount.
    isSiteSupervisor() {
      const cid = this.currentUser && this.currentUser.contact_id;
      if (!cid) return false;
      return (this.areasWithSupervisors || []).some(a =>
        (a.site_supervisors || []).some(s => s.id === cid)
      );
    },
    canEditSetup() { return this.isOwnerOrAdmin; },
    canEditWorkLogs() {
      const r = this.currentUser && this.currentUser.role;
      return r === 'ADMIN' || r === 'PROJECT_OWNER' || r === 'PROJECT_TEAM';
    },

    filteredWorkLogs() {
      if (!this.logPackageFilter) return this.workLogs;
      return this.workLogs.filter(l => l.package_id === this.logPackageFilter);
    },

    filteredDailyReports() {
      let rows = this.dailyReports;
      if (this.reportPackageFilter) {
        rows = rows.filter(r => r.package_id === this.reportPackageFilter);
      }
      if (this.reportAreaFilter) {
        const aid = this.reportAreaFilter;
        rows = rows.filter(r => (r.area_ids || []).includes(aid));
      }
      return rows;
    },
    canUnlockReports() {
      if (this.isOwnerOrAdmin) return true;
      const cid = this.currentUser && this.currentUser.contact_id;
      if (!cid) return false;
      return (this.areasWithSupervisors || []).some(a =>
        (a.site_supervisors || []).some(s => s.id === cid)
      );
    },
    reportFormReadOnly() {
      return !!(this.editingReport && this.editingReport.locked);
    },

    filteredWorkPermits() {
      let rows = this.workPermits;
      if (this.permitPackageFilter) {
        rows = rows.filter(r => r.package_id === this.permitPackageFilter);
      }
      if (this.permitAreaFilter) {
        const aid = this.permitAreaFilter;
        rows = rows.filter(r => (r.area_ids || []).includes(aid));
      }
      if (this.permitStatusFilter) {
        rows = rows.filter(r => (r.status || 'DRAFT') === this.permitStatusFilter);
      }
      return rows;
    },
    // Area IDs the current user supervises (reused by the permit approval
    // section). Empty for users who are not site supervisors on any area.
    mySupervisedAreaIds() {
      const cid = this.currentUser && this.currentUser.contact_id;
      if (!cid) return [];
      return (this.areasWithSupervisors || [])
        .filter(a => (a.site_supervisors || []).some(s => s.id === cid))
        .map(a => a.id);
    },
    // The permit we are currently editing; null for a brand-new permit.
    // Guarded against stale editingPermit references after a status change.
    currentPermit() {
      if (!this.editingPermit) return null;
      return this.workPermits.find(p => p.id === this.editingPermit.id) || this.editingPermit;
    },
    permitFormStatus() {
      const p = this.currentPermit;
      return (p && p.status) || 'DRAFT';
    },
    // Areas of the current permit that the current user supervises and
    // where the per-area approval is still PENDING. Used to show the
    // Approve / Reject buttons.
    permitAreasReviewableByMe() {
      const p = this.currentPermit;
      if (!p || p.status !== 'PENDING') return [];
      const mine = new Set(this.mySupervisedAreaIds);
      const isOverride = this.isOwnerOrAdmin;
      return (p.area_approvals || []).filter(ap =>
        ap.status === 'PENDING' && (isOverride || mine.has(ap.area_id))
      );
    },
    // True when the current vendor/supervisor/admin contact can manage the
    // permit's package (creator-side access). Used to decide whether the
    // LOTO-refused deadlock escape hatch applies for this user.
    permitUserCanManage() {
      const p = this.currentPermit;
      if (!p || !p.id) return false;
      if (this.isOwnerOrAdmin || this.isSiteSupervisor) return true;
      return (this.vendorPackageIds || []).includes(p.package_id);
    },
    // Deadlock recovery: when a permit is PENDING but at least one LOTO
    // was REFUSED, supervisors are blocked by the LOTO gate ("LOTO to be
    // executed before release"), so the vendor needs to reopen the permit
    // to resubmit LOTOs (or change anything else) and resubmit.
    permitInLotoDeadlock() {
      const p = this.currentPermit;
      if (!p) return false;
      return p.status === 'PENDING'
          && (p.loto_rollup === 'REFUSED' || this.permitLotoRollupForForm === 'REFUSED');
    },
    permitCanSubmit() {
      const p = this.currentPermit;
      if (!p || !p.id) return false;
      const s = p.status || 'DRAFT';
      if (s === 'DRAFT' || s === 'REJECTED') return true;
      // PENDING with a REFUSED LOTO: the vendor can fix and resubmit to
      // restart the supervisors' review cycle.
      return this.permitInLotoDeadlock && this.permitUserCanManage;
    },
    permitCanEdit() {
      const p = this.currentPermit;
      if (!p) return true;   // new permit
      const s = p.status || 'DRAFT';
      if (s === 'DRAFT' || s === 'REJECTED') return true;
      // PENDING + REFUSED LOTO: vendor edits allowed (deadlock recovery).
      if (this.permitInLotoDeadlock && this.permitUserCanManage) return true;
      // PENDING/APPROVED/CLOSED otherwise: admins and owners retain override.
      return this.isOwnerOrAdmin;
    },
    // True when the current user is a linked vendor contact for this
    // permit's package — drives visibility of close / extension buttons
    // on APPROVED permits and the "Close or Extend" action point.
    permitCanCloseOrExtend() {
      const p = this.currentPermit;
      if (!p || !p.id) return false;
      if (p.status !== 'APPROVED') return false;
      if (this.isOwnerOrAdmin) return true;
      return (this.vendorPackageIds || []).includes(p.package_id);
    },
    permitLotoRollupForForm() {
      // Use the live form state so the vendor sees immediate feedback while
      // editing (e.g. after clicking "Resubmit" on a refused LOTO).
      const arr = (this.permitForm.lotos || []).map(l => ({ status: l.status }));
      if (arr.length === 0) return 'NA';
      if (arr.some(l => l.status === 'REFUSED')) return 'REFUSED';
      if (arr.every(l => l.status === 'LOCKED' || l.status === 'CANCELLED')) return 'DONE';
      return 'IN PROGRESS';
    },

    // ── Co-activity board ────────────────────────────────────────────────
    // Permits considered "scheduled" for the matrix. DRAFTs haven't been
    // submitted yet so we hide them; every other status keeps its colour
    // from permitStatusStyle (PENDING amber, APPROVED green, REJECTED red,
    // CLOSED slate).
    scheduledPermits() {
      return (this.workPermits || [])
        .filter(p => (p.status || 'DRAFT') !== 'DRAFT' && p.start_date && p.end_date);
    },
    // 56 day objects (8 weeks × 7 days) starting from coactivityStartISO.
    coactivityDays() {
      const start = this.coactivityStartISO
        ? new Date(this.coactivityStartISO + 'T00:00:00')
        : this._mondayOf(new Date());
      const today = this._todayISO();
      const out = [];
      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      for (let i = 0; i < this.coactivityWeeks * 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const iso = this._isoDate(d);
        out.push({
          iso,
          date: d,
          dayNum: d.getDate(),
          dayName: dayNames[(d.getDay() + 6) % 7],   // Monday-first
          isWeekend: (d.getDay() === 0 || d.getDay() === 6),
          isToday: (iso === today),
          monthLabel: d.toLocaleDateString(undefined, { month: 'short' }),
        });
      }
      return out;
    },
    // Group the 56 days into 8 weeks for the header row.
    coactivityWeekHeaders() {
      const weeks = [];
      const days = this.coactivityDays;
      for (let i = 0; i < days.length; i += 7) {
        const first = days[i];
        const last = days[i + 6];
        weeks.push({
          start: first,
          monthRange: (first.monthLabel === last.monthLabel)
            ? first.monthLabel
            : first.monthLabel + '/' + last.monthLabel,
          label: first.iso,
        });
      }
      return weeks;
    },
    coactivityRangeLabel() {
      const days = this.coactivityDays;
      if (!days.length) return '';
      const first = days[0].date, last = days[days.length - 1].date;
      const opts = { day: '2-digit', month: 'short', year: 'numeric' };
      return first.toLocaleDateString(undefined, opts)
        + ' – ' + last.toLocaleDateString(undefined, opts);
    },
    // Map of "areaId::iso" → array of permits covering that cell.
    // Pre-computed once per render to keep the 56 × areas grid cheap.
    coactivityCells() {
      const map = {};
      const days = this.coactivityDays.map(d => d.iso);
      if (!days.length) return map;
      const windowStart = days[0];
      const windowEnd = days[days.length - 1];
      for (const p of this.scheduledPermits) {
        // String compare is safe — dates are ISO YYYY-MM-DD.
        if (p.end_date < windowStart || p.start_date > windowEnd) continue;
        for (const iso of days) {
          if (iso < p.start_date || iso > p.end_date) continue;
          for (const aid of (p.area_ids || [])) {
            const k = aid + '::' + iso;
            (map[k] = map[k] || []).push(p);
          }
        }
      }
      return map;
    },
    coactivityLegendStatuses() {
      // Order matches permitStatusStyle cases so the legend reads L→R
      // from in-flight to terminal.
      return ['PENDING', 'APPROVED', 'REJECTED', 'CLOSED'];
    },

    // ── Dashboard helpers ─────────────────────────────────────────────────
    dashboardScopedWorkLogs() {
      if (!this.dashboardPackageFilter) return this.workLogs;
      return this.workLogs.filter(w => w.package_id === this.dashboardPackageFilter);
    },
    dashboardScopedReports() {
      if (!this.dashboardPackageFilter) return this.dailyReports;
      return this.dailyReports.filter(r => r.package_id === this.dashboardPackageFilter);
    },
    dashboardScopedPermits() {
      if (!this.dashboardPackageFilter) return this.workPermits;
      return this.workPermits.filter(p => p.package_id === this.dashboardPackageFilter);
    },
    dashboardScopedLotos() {
      if (!this.dashboardPackageFilter) return this.lotos;
      return this.lotos.filter(l => l.package_id === this.dashboardPackageFilter);
    },
    dashboardScopedWorkers() {
      if (!this.dashboardPackageFilter) return this.workers;
      return this.workers.filter(w => w.package_id === this.dashboardPackageFilter);
    },
    dashboardScopedSubcontractors() {
      if (!this.dashboardPackageFilter) return this.subcontractors;
      return this.subcontractors.filter(s => s.package_id === this.dashboardPackageFilter);
    },
    dashboardTotalHours() {
      // Sum of avg_hours × #workers for every non-"no work" report in scope.
      let total = 0;
      for (const r of this.dashboardScopedReports) {
        if (r.no_work) continue;
        total += (r.total_hours != null)
          ? r.total_hours
          : (r.avg_hours_per_worker || 0) * ((r.worker_ids || []).length);
      }
      return Math.round(total * 10) / 10;
    },
    dashboardReportCounts() {
      let work = 0, noWork = 0;
      for (const r of this.dashboardScopedReports) {
        if (r.no_work) noWork += 1; else work += 1;
      }
      return { work, noWork, total: work + noWork };
    },
    dashboardPermitCounts() {
      const out = { DRAFT: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, CLOSED: 0 };
      for (const p of this.dashboardScopedPermits) {
        const s = p.status || 'DRAFT';
        if (out[s] != null) out[s] += 1;
      }
      return out;
    },
    dashboardLotoCounts() {
      const out = { REQUEST: 0, LOCKED: 0, REFUSED: 0, CANCELLED: 0,
                    TO_BE_RELEASED: 0, RELEASED: 0 };
      for (const l of this.dashboardScopedLotos) {
        if (out[l.status] != null) out[l.status] += 1;
      }
      return out;
    },
    dashboardWorkerCounts() {
      const out = { APPROVED: 0, PENDING: 0, REJECTED: 0, CANCELLED: 0 };
      for (const w of this.dashboardScopedWorkers) {
        if (out[w.status] != null) out[w.status] += 1;
      }
      return out;
    },
    // Per-package breakdown rows (always shows every eligible package,
    // even when the filter is active, so comparisons stay visible).
    dashboardPerPackageRows() {
      const pkgs = this.dashboardPackageFilter
        ? this.packages.filter(p => p.id === this.dashboardPackageFilter)
        : this.packages;
      const rows = [];
      for (const p of pkgs) {
        const workers = this.workers.filter(w => w.package_id === p.id);
        const subs = this.subcontractors.filter(s => s.package_id === p.id);
        rows.push({
          id: p.id, tag_number: p.tag_number, name: p.name,
          workers_total: workers.length,
          workers_approved: workers.filter(w => w.status === 'APPROVED').length,
          workers_pending: workers.filter(w => w.status === 'PENDING').length,
          workers_rejected: workers.filter(w => w.status === 'REJECTED').length,
          subs_total: subs.length,
          missing_reports: this._missingReportsForPackage(p.id),
        });
      }
      return rows;
    },
    dashboardMissingReportsTotal() {
      return this.dashboardPerPackageRows
        .reduce((sum, r) => sum + r.missing_reports, 0);
    },
    // Active-workers timeline series — populated by the lightweight
    // /dashboard/active-workers endpoint so the chart no longer loops over
    // the full daily-reports payload.
    dashboardChartSeries() {
      return this.activeWorkersSeries || { labels: [], data: [] };
    },
    // Columns rendered in the matrix — either one per day (56) or one
    // per week (8) depending on `coactivityGranularity`. Each item
    // carries the list of ISO days it covers so the cell-permits lookup
    // stays uniform.
    coactivityColumns() {
      const days = this.coactivityDays;
      if (this.coactivityGranularity === 'week') {
        const out = [];
        for (let i = 0; i < days.length; i += 7) {
          const chunk = days.slice(i, i + 7);
          const first = chunk[0];
          const last = chunk[chunk.length - 1];
          const isoOfToday = this._todayISO();
          const containsToday = chunk.some(d => d.iso === isoOfToday);
          out.push({
            kind: 'week',
            iso: first.iso,
            days: chunk,
            dayIsos: chunk.map(d => d.iso),
            label: `Week of ${first.iso}`,
            short: first.monthLabel + ' ' + first.dayNum
              + (first.monthLabel !== last.monthLabel ? ' – ' + last.monthLabel + ' ' + last.dayNum
                 : ' – ' + last.dayNum),
            isToday: containsToday,
            isWeekend: false,
          });
        }
        return out;
      }
      return days.map(d => ({
        kind: 'day',
        iso: d.iso,
        days: [d],
        dayIsos: [d.iso],
        label: d.iso,
        short: '',
        isToday: d.isToday,
        isWeekend: d.isWeekend,
        dayNum: d.dayNum,
        dayName: d.dayName,
        monthLabel: d.monthLabel,
      }));
    },
    filteredLotos() {
      let rows = this.lotos;
      if (this.lotoPackageFilter) {
        rows = rows.filter(r => r.package_id === this.lotoPackageFilter);
      }
      if (this.lotoPermitFilter) {
        rows = rows.filter(r => r.work_permit_id === this.lotoPermitFilter);
      }
      if (this.lotoStatusFilter) {
        rows = rows.filter(r => r.status === this.lotoStatusFilter);
      }
      return rows;
    },
    // Permits that currently have at least one LOTO — narrowed by the
    // active package filter so the dropdown stays relevant to the view.
    lotoPermitOptions() {
      const source = this.lotoPackageFilter
        ? this.lotos.filter(l => l.package_id === this.lotoPackageFilter)
        : this.lotos;
      const seen = new Map();
      for (const l of source) {
        if (l.work_permit_id != null && !seen.has(l.work_permit_id)) {
          seen.set(l.work_permit_id, l.work_permit_display_id || ('Permit #' + l.work_permit_id));
        }
      }
      return [...seen.entries()]
        .map(([id, display_id]) => ({ id, display_id }))
        .sort((a, b) => (a.display_id || '').localeCompare(b.display_id || ''));
    },
    lotoReviewableCount() { return this.pendingLotos.length; },
    // Approved workers linked to the current report's package
    reportEligibleWorkers() {
      if (!this.reportForm.package_id) return [];
      return this.workers.filter(w =>
        w.package_id === this.reportForm.package_id && w.status === 'APPROVED'
      );
    },
    reportAllWorkersSelected() {
      const ids = this.reportEligibleWorkers.map(w => w.id);
      return ids.length > 0 && ids.every(id => this.reportForm.worker_ids.includes(id));
    },
    reportAllAreasSelected() {
      const ids = this.projectAreas.map(a => a.id);
      return ids.length > 0 && ids.every(id => this.reportForm.area_ids.includes(id));
    },
    reportTotalHours() {
      const avg = parseFloat(this.reportForm.avg_hours_per_worker) || 0;
      return +(avg * (this.reportForm.worker_ids || []).length).toFixed(2);
    },

    // Package choices for the forms.
    // Vendors can only pick from their linked packages; everyone else sees all.
    eligiblePackages() {
      if (this.isVendor) {
        return this.packages.filter(p => this.vendorPackageIds.includes(p.id));
      }
      return this.packages;
    },
    // Work-permit scope is wider than the generic package scope: any
    // declared site supervisor on the project may raise a permit on any
    // package, even if they are otherwise a vendor with a narrow list.
    eligiblePermitPackages() {
      if (this.isOwnerOrAdmin || this.isSiteSupervisor) return this.packages;
      return this.eligiblePackages;
    },

    // Subcontractors available on the currently-selected worker package
    subsForCurrentWorker() {
      if (!this.workerForm.package_id) return [];
      return this.subcontractors.filter(s => s.package_id === this.workerForm.package_id);
    },

    filteredSubcontractors() {
      if (!this.subPackageFilter) return this.subcontractors;
      return this.subcontractors.filter(s => s.package_id === this.subPackageFilter);
    },
    filteredWorkers() {
      if (!this.workerPackageFilter) return this.workers;
      return this.workers.filter(w => w.package_id === this.workerPackageFilter);
    },
    filteredApprovalWorkers() {
      if (!this.approvalPackageFilter) return this.pendingApprovalWorkers;
      return this.pendingApprovalWorkers.filter(w => w.package_id === this.approvalPackageFilter);
    },
    // Packages that have at least one worker pending approval — used to
    // populate the filter dropdown on the Approvals tab.
    approvalFilterPackages() {
      const ids = new Set(this.pendingApprovalWorkers.map(w => w.package_id));
      return this.packages.filter(p => ids.has(p.id));
    },
  },

  watch: {
    activeTab(v) {
      this.$emit('subtab-change', v);
      if (v === 'dashboard') this.ensureDashboardChart();
    },
    editingWorker(val) {
      this.$emit('record-change', val ? { type: 'worker', id: val.id } : null);
    },
    editingSub(val) {
      if (this.editingWorker) return;
      this.$emit('record-change', val ? { type: 'subcontractor', id: val.id } : null);
    },
    editingReport(val) {
      if (this.editingWorker || this.editingSub) return;
      this.$emit('record-change', val ? { type: 'daily_report', id: val.id } : null);
    },
    editingPermit(val) {
      if (this.editingWorker || this.editingSub || this.editingReport) return;
      this.$emit('record-change', val ? { type: 'work_permit', id: val.id } : null);
    },
    editingLog(val) {
      if (this.editingWorker || this.editingSub || this.editingReport || this.editingPermit) return;
      this.$emit('record-change', val ? { type: 'loto', id: val.id } : null);
    },
    dashboardPackageFilter() {
      if (this.activeTab === 'dashboard') this.ensureDashboardChart();
    },
    // After a daily report is created/updated/deleted in the same session,
    // refresh the chart series so the dashboard reflects the change.
    dailyReports() {
      if (this.activeTab === 'dashboard') this.loadActiveWorkersSeries();
    },
    'workerForm.is_subcontractor'(v) {
      if (!v) this.workerForm.subcontractor_id = null;
    },
    'workerForm.package_id'() {
      // If changing package clears the previously selected sub (it belonged to a different package)
      const valid = this.subsForCurrentWorker.some(s => s.id === this.workerForm.subcontractor_id);
      if (!valid) this.workerForm.subcontractor_id = null;
    },
  },

  // When the user navigates away from Construction, destroy the dashboard
  // chart so it doesn't linger in Chart.js's global registry pointing at a
  // detached canvas — a ghost instance throws "ctx.save() on null" on the
  // next animation frame and can blank other dashboards that mount after.
  beforeUnmount() {
    if (this.activeWorkersChartObj) {
      try { this.activeWorkersChartObj.destroy(); } catch (e) { /* orphaned */ }
      this.activeWorkersChartObj = null;
    }
  },

  async mounted() {
    if (this.initialTab) this.activeTab = this.initialTab;
    this.initCoactivity();
    await this.loadPackages();
    await Promise.all([
      this.loadPermitTypes(),
      this.loadCertificateTypes(),
      this.loadAreasWithSupervisors(),
      this.loadSubcontractors(),
      this.loadWorkers(),
      this.loadWorkLogs(),
      this.loadPendingApprovalWorkers(),
      this.loadDailyReports(),
      this.loadWorkPermits(),
      this.loadLotos(),
      this.loadPendingLotos(),
      this.loadProjectAreas(),
    ]);
    this.checkPendingOpen();
    if (this.activeTab === 'dashboard') this.ensureDashboardChart();
  },

  methods: {
    // ── Packages ──────────────────────────────────────────────────────────
    async loadPackages() {
      try {
        this.packages = await API.getPackages();
      } catch (e) { console.error('Load packages failed', e); }
      // Vendor: figure out which packages they're linked to
      const cid = this.currentUser && this.currentUser.contact_id;
      if (cid) {
        this.vendorPackageIds = this.packages
          .filter(p => (p.contact_ids || []).includes(cid) || p.package_owner_id === cid)
          .map(p => p.id);
      }
    },

    // ── Setup — each list ─────────────────────────────────────────────────
    async loadPermitTypes()      { this.permitTypes      = await API.listConstructionSetup('work-permit-types'); },
    async loadCertificateTypes() { this.certificateTypes = await API.listConstructionSetup('worker-certificate-types'); },
    async loadAreasWithSupervisors() {
      try { this.areasWithSupervisors = await API.getConstructionAreasSupervisors(); }
      catch { this.areasWithSupervisors = []; }
    },

    openSetupModal(kind, item = null) {
      this.setupEditing = { kind, item };
      this.setupForm = item
        ? { name: item.name, description: item.description || '',
            polarity: item.polarity || 'NEGATIVE' }
        : { name: '', description: '', polarity: 'NEGATIVE' };
      this.setupError = '';
    },
    closeSetupModal() { this.setupEditing = null; },

    async saveSetup() {
      if (!this.setupForm.name.trim()) { this.setupError = 'Name is required'; return; }
      this.setupSaving = true; this.setupError = '';
      try {
        const { kind, item } = this.setupEditing;
        const body = {
          name: this.setupForm.name.trim(),
          description: this.setupForm.description.trim() || null,
        };
        if (kind === 'safety-observation-categories') {
          body.polarity = this.setupForm.polarity === 'POSITIVE' ? 'POSITIVE' : 'NEGATIVE';
        }
        if (item) await API.updateConstructionSetup(kind, item.id, body);
        else      await API.createConstructionSetup(kind, body);
        if (kind === 'work-permit-types') await this.loadPermitTypes();
        if (kind === 'worker-certificate-types') await this.loadCertificateTypes();
        this.closeSetupModal();
      } catch (e) { this.setupError = e.message || 'Save failed'; }
      finally { this.setupSaving = false; }
    },

    async deleteSetup(kind, item) {
      if (!confirm(`Remove "${item.name}" ?`)) return;
      try {
        await API.deleteConstructionSetup(kind, item.id);
        if (kind === 'work-permit-types') await this.loadPermitTypes();
        if (kind === 'worker-certificate-types') await this.loadCertificateTypes();
      } catch (e) { alert(e.message || 'Delete failed'); }
    },

    // ── Subcontractors ────────────────────────────────────────────────────
    async loadSubcontractors() {
      this.subLoading = true;
      try { this.subcontractors = await API.getSubcontractors(); }
      catch (e) { console.error('Subs load failed', e); }
      finally { this.subLoading = false; }
    },

    openSubModal(sub = null) {
      this.editingSub = sub;
      this.subForm = sub
        ? { package_id: sub.package_id, company: sub.company,
            contact_person: sub.contact_person || '', phone: sub.phone || '',
            email: sub.email || '', description: sub.description || '' }
        : { package_id: this.eligiblePackages[0]?.id || null, company: '',
            contact_person: '', phone: '', email: '', description: '' };
      this.subError = '';
      this.showSubModal = true;
    },

    async saveSub() {
      if (!this.subForm.package_id) { this.subError = 'Select a package'; return; }
      if (!this.subForm.company.trim()) { this.subError = 'Company is required'; return; }
      this.subSaving = true; this.subError = '';
      try {
        const body = {
          package_id: Number(this.subForm.package_id),
          company: this.subForm.company.trim(),
          contact_person: this.subForm.contact_person.trim() || null,
          phone: this.subForm.phone.trim() || null,
          email: this.subForm.email.trim() || null,
          description: this.subForm.description.trim() || null,
        };
        if (this.editingSub) await API.updateSubcontractor(this.editingSub.id, body);
        else                 await API.createSubcontractor(body);
        await this.loadSubcontractors();
        this.showSubModal = false;
      } catch (e) { this.subError = e.message || 'Save failed'; }
      finally { this.subSaving = false; }
    },

    async deleteSub(sub) {
      if (!confirm(`Delete subcontractor ${sub.display_id} — ${sub.company} ?`)) return;
      try { await API.deleteSubcontractor(sub.id); await this.loadSubcontractors(); await this.loadWorkers(); }
      catch (e) { alert(e.message || 'Delete failed'); }
    },

    // ── Workers ───────────────────────────────────────────────────────────
    async loadWorkers() {
      this.workerLoading = true;
      try { this.workers = await API.getWorkers(); }
      catch (e) { console.error('Workers load failed', e); }
      finally { this.workerLoading = false; }
    },

    openWorkerModal(w = null) {
      this.editingWorker = w;
      this.workerForm = w
        ? { package_id: w.package_id, name: w.name, phone: w.phone || '',
            is_subcontractor: w.is_subcontractor, subcontractor_id: w.subcontractor_id,
            certificate_type_ids: [...(w.certificate_type_ids || [])] }
        : { package_id: this.eligiblePackages[0]?.id || null, name: '', phone: '',
            is_subcontractor: false, subcontractor_id: null, certificate_type_ids: [] };
      this.workerError = '';
      this.lastSavedWorkerId = w ? w.id : null;
      this.showWorkerModal = true;
    },

    async openWorkerHistory(w) {
      this.historyWorker = w;
      this.workerHistory = [];
      this.workerHistoryLoading = true;
      try { this.workerHistory = await API.getWorkerHistory(w.id); }
      catch (e) { console.error('Load worker history failed', e); }
      finally { this.workerHistoryLoading = false; }
    },
    closeWorkerHistory() { this.historyWorker = null; this.workerHistory = []; },

    async saveWorker() {
      if (!this.workerForm.package_id) { this.workerError = 'Select a package'; return; }
      if (!this.workerForm.name.trim()) { this.workerError = 'Name is required'; return; }
      if (this.workerForm.is_subcontractor && !this.workerForm.subcontractor_id) {
        this.workerError = 'Select a subcontractor or uncheck the box'; return;
      }
      this.workerSaving = true; this.workerError = '';
      try {
        const body = {
          package_id: Number(this.workerForm.package_id),
          name: this.workerForm.name.trim(),
          phone: this.workerForm.phone.trim() || null,
          is_subcontractor: !!this.workerForm.is_subcontractor,
          subcontractor_id: this.workerForm.is_subcontractor
            ? Number(this.workerForm.subcontractor_id) : null,
          certificate_type_ids: (this.workerForm.certificate_type_ids || []).map(Number),
        };
        let saved;
        const wasCreate = !this.editingWorker;
        if (this.editingWorker) saved = await API.updateWorker(this.editingWorker.id, body);
        else                    saved = await API.createWorker(body);
        this.lastSavedWorkerId = saved.id;
        // On first save, keep the modal open and flag the record so the
        // footer shows the final "Create Worker" button. Subsequent saves
        // on the same record behave as normal edits.
        if (wasCreate) {
          this.editingWorker = { ...saved, _justCreated: true };
        } else {
          this.editingWorker = saved;
        }
        await this.loadWorkers();
      } catch (e) { this.workerError = e.message || 'Save failed'; }
      finally { this.workerSaving = false; }
    },

    async finalizeWorker() {
      // Step 2 of the create flow — re-save any in-form changes that happened
      // since the first Save and then close the modal.
      if (!this.editingWorker) { this.showWorkerModal = false; return; }
      this.workerSaving = true; this.workerError = '';
      try {
        const body = {
          package_id: Number(this.workerForm.package_id),
          name: this.workerForm.name.trim(),
          phone: this.workerForm.phone.trim() || null,
          is_subcontractor: !!this.workerForm.is_subcontractor,
          subcontractor_id: this.workerForm.is_subcontractor
            ? Number(this.workerForm.subcontractor_id) : null,
          certificate_type_ids: (this.workerForm.certificate_type_ids || []).map(Number),
        };
        await API.updateWorker(this.editingWorker.id, body);
        await this.loadWorkers();
        this.showWorkerModal = false;
      } catch (e) { this.workerError = e.message || 'Save failed'; }
      finally { this.workerSaving = false; }
    },

    async deleteWorker(w) {
      if (!confirm(`Delete worker ${w.display_id} — ${w.name} ?`)) return;
      try { await API.deleteWorker(w.id); await this.loadWorkers(); }
      catch (e) { alert(e.message || 'Delete failed'); }
    },

    // ── Excel Exports (one green button per list) ─────────────────────────
    async exportDailyReportsToExcel() {
      this.xlsxExportingDaily = true;
      try { await API.exportDailyReportsXlsx(); }
      catch (e) { alert('Export failed: ' + (e.message || '')); }
      finally { this.xlsxExportingDaily = false; }
    },
    async exportWorkLogsToExcel() {
      this.xlsxExportingWorkLogs = true;
      try { await API.exportWorkLogsXlsx(); }
      catch (e) { alert('Export failed: ' + (e.message || '')); }
      finally { this.xlsxExportingWorkLogs = false; }
    },
    async exportWorkersSubsToExcel() {
      this.xlsxExportingWorkersSubs = true;
      try { await API.exportWorkersSubsXlsx(); }
      catch (e) { alert('Export failed: ' + (e.message || '')); }
      finally { this.xlsxExportingWorkersSubs = false; }
    },
    async exportWorkPermitsToExcel() {
      this.xlsxExportingPermits = true;
      try { await API.exportWorkPermitsXlsx(); }
      catch (e) { alert('Export failed: ' + (e.message || '')); }
      finally { this.xlsxExportingPermits = false; }
    },
    async exportLotosToExcel() {
      this.xlsxExportingLotos = true;
      try { await API.exportLotosXlsx(); }
      catch (e) { alert('Export failed: ' + (e.message || '')); }
      finally { this.xlsxExportingLotos = false; }
    },

    // ── Workers/Subcontractors Import ──
    // Same principle as the Risk Register import: Export template, pick file,
    // Preview (validates rows, flags errors), then Confirm & Apply.
    async exportWorkersSubsXlsx() {
      try { await API.exportWorkersSubs(); }
      catch (e) { alert(e.message || 'Export failed'); }
    },
    openWsImportModal() {
      this.showWsImportModal = true;
      this.wsImportFile = null;
      this.wsImportPreview = null;
      this.wsImportError = '';
      this.wsImportResult = null;
    },
    resetWsImport() {
      if (this.wsImportPreview) {
        this.wsImportPreview = null;
        this.wsImportError = '';
      } else {
        this.showWsImportModal = false;
      }
    },
    onWsImportFileChange(e) {
      this.wsImportFile = e.target.files[0] || null;
      this.wsImportError = '';
    },
    async runWsImportPreview() {
      if (!this.wsImportFile) return;
      this.wsImportLoading = true;
      this.wsImportError = '';
      try {
        this.wsImportPreview = await API.previewWorkersSubsImport(this.wsImportFile);
      } catch (e) {
        this.wsImportError = e.message || 'Preview failed';
      } finally {
        this.wsImportLoading = false;
      }
    },
    async applyWsImport() {
      if (!this.wsImportPreview) return;
      this.wsImportApplying = true;
      this.wsImportError = '';
      try {
        this.wsImportResult = await API.applyWorkersSubsImport({ rows: this.wsImportPreview.rows });
      } catch (e) {
        this.wsImportError = e.message || 'Import failed';
      } finally {
        this.wsImportApplying = false;
      }
    },
    async closeWsImportAndRefresh() {
      this.showWsImportModal = false;
      await Promise.all([this.loadSubcontractors(), this.loadWorkers()]);
    },

    checkPendingOpen() {
      if (!this.pendingOpen) return;
      const { record_type, record_id, meta } = this.pendingOpen;
      if (record_type === 'worker_batch') {
        this.activeTab = 'approvals';
        this.approvalPackageFilter = record_id || null;
        return;
      }
      if (record_type === 'daily_report_pending') {
        // meta = { package_id, report_date }
        this.activeTab = 'daily';
        const pkg_id = meta && meta.package_id;
        const report_date = meta && meta.report_date;
        if (pkg_id && report_date) {
          this.reportPackageFilter = pkg_id;
          this.openReportModal(null, { package_id: pkg_id, report_date });
        }
        return;
      }
      if (record_type === 'loto_batch') {
        this.activeTab = 'loto';
        this.lotoStatusFilter = 'REQUEST';
        return;
      }
      if (record_type === 'loto_refused_batch'
          || record_type === 'work_permit_approval'
          || record_type === 'work_permit_rejected'
          || record_type === 'work_permit_close_extend') {
        // Open the work permit directly — supervisors land on the approval
        // panel, vendors on the rejection / close-extend view.
        this.activeTab = 'permits';
        const open = () => {
          const p = this.workPermits.find(x => x.id === record_id);
          if (p) this.openPermitModal(p);
        };
        const permit = this.workPermits.find(p => p.id === record_id);
        if (permit) this.openPermitModal(permit);
        else this.loadWorkPermits().then(open);
        return;
      }
      if (record_type === 'loto_release') {
        // Supervisor path: filter the LOTO tab to TO_BE_RELEASED so the
        // Confirm Release buttons are immediately visible.
        this.activeTab = 'loto';
        this.lotoStatusFilter = 'TO_BE_RELEASED';
        return;
      }
      if (record_type === 'loto') {
        this.activeTab = 'loto';
        this.lotoStatusFilter = 'REFUSED';
        return;
      }
      if (record_type !== 'worker') return;
      const w = this.workers.find(x => x.id === record_id);
      if (!w) return;
      this.openWorkerModal(w);
    },

    // ── Worker approval workflow ──────────────────────────────────────────
    statusBadgeClass(st) {
      switch (st) {
        case 'PENDING':   return 'bg-amber-100 text-amber-700';
        case 'APPROVED':  return 'bg-green-100 text-green-700';
        case 'REJECTED':  return 'bg-red-100 text-red-700';
        case 'CANCELLED': return 'bg-gray-200 text-gray-600';
        default:          return 'bg-gray-100 text-gray-600';
      }
    },

    async loadPendingApprovalWorkers() {
      try { this.pendingApprovalWorkers = await API.getWorkersPendingApproval(); }
      catch (e) { console.error('Load pending approvals failed', e); }
    },

    async approveWorker(w) {
      try {
        await API.approveWorker(w.id);
        await Promise.all([this.loadPendingApprovalWorkers(), this.loadWorkers()]);
      } catch (e) { alert(e.message || 'Approve failed'); }
    },

    openRejectModal(w) {
      this.rejectModalWorker = w;
      this.rejectComment = '';
    },
    closeRejectModal() {
      this.rejectModalWorker = null; this.rejectComment = '';
    },
    async submitReject() {
      if (!this.rejectModalWorker) return;
      if (!this.rejectComment.trim()) { alert('A rejection comment is required'); return; }
      this.rejectSaving = true;
      try {
        await API.rejectWorker(this.rejectModalWorker.id, { comment: this.rejectComment.trim() });
        this.closeRejectModal();
        await Promise.all([this.loadPendingApprovalWorkers(), this.loadWorkers()]);
      } catch (e) { alert(e.message || 'Reject failed'); }
      finally { this.rejectSaving = false; }
    },

    openOverrideModal(w, approved) {
      this.overrideModalWorker = w;
      this.overrideApproved = !!approved;
      this.overrideComment = '';
    },
    closeOverrideModal() {
      this.overrideModalWorker = null; this.overrideComment = '';
    },
    async submitOverride() {
      if (!this.overrideModalWorker) return;
      this.overrideSaving = true;
      try {
        await API.overrideWorker(this.overrideModalWorker.id, {
          approved: !!this.overrideApproved,
          comment: this.overrideComment.trim() || null,
        });
        this.closeOverrideModal();
        await Promise.all([this.loadPendingApprovalWorkers(), this.loadWorkers()]);
      } catch (e) { alert(e.message || 'Override failed'); }
      finally { this.overrideSaving = false; }
    },

    async loadWorkerHistory(id) {
      try { this.workerHistory = await API.getWorkerHistory(id); }
      catch (e) { this.workerHistory = []; }
    },

    async resubmitWorker() {
      if (!this.editingWorker) return;
      if (!confirm('Resubmit this worker for site-supervisor review?')) return;
      this.workflowSaving = true;
      try {
        const updated = await API.resubmitWorker(this.editingWorker.id);
        this.editingWorker = { ...updated };
        await this.loadWorkers();
        await this.loadWorkerHistory(updated.id);
      } catch (e) { alert(e.message || 'Resubmit failed'); }
      finally { this.workflowSaving = false; }
    },

    async cancelWorkerDeclaration() {
      if (!this.editingWorker) return;
      if (!confirm('Cancel this worker declaration? The record will stay for audit.')) return;
      this.workflowSaving = true;
      try {
        const updated = await API.cancelWorker(this.editingWorker.id);
        this.editingWorker = { ...updated };
        await this.loadWorkers();
        await this.loadWorkerHistory(updated.id);
      } catch (e) { alert(e.message || 'Cancel failed'); }
      finally { this.workflowSaving = false; }
    },

    eventLabel(ev) {
      return {
        SUBMIT: 'Submitted for review', APPROVE: 'Approved', REJECT: 'Rejected',
        RESUBMIT: 'Resubmitted', CANCEL: 'Cancelled', OVERRIDE: 'Overridden',
      }[ev] || ev;
    },
    eventBadgeClass(ev, approved) {
      if (ev === 'APPROVE' || approved === true)  return 'bg-green-100 text-green-700';
      if (ev === 'REJECT'  || approved === false) return 'bg-red-100 text-red-700';
      if (ev === 'CANCEL') return 'bg-gray-200 text-gray-600';
      return 'bg-blue-100 text-blue-700';
    },

    // ── Work logs ─────────────────────────────────────────────────────────
    async loadWorkLogs() {
      this.workLogLoading = true;
      try { this.workLogs = await API.getWorkLogs(); }
      catch (e) { console.error('Work logs load failed', e); }
      finally { this.workLogLoading = false; }
    },

    openLogModal(log = null) {
      this.editingLog = log;
      this.logForm = log
        ? { package_id: log.package_id, start_date: log.start_date,
            end_date: log.end_date || '', notes: log.notes || '' }
        : { package_id: this.packages[0]?.id || null,
            start_date: new Date().toISOString().slice(0, 10),
            end_date: '', notes: '' };
      this.logError = '';
      this.showLogModal = true;
    },

    async saveLog() {
      if (!this.logForm.package_id) { this.logError = 'Select a package'; return; }
      if (!this.logForm.start_date)  { this.logError = 'Start date is required'; return; }
      if (this.logForm.end_date && this.logForm.end_date < this.logForm.start_date) {
        this.logError = 'End date cannot be before start date'; return;
      }
      this.logSaving = true; this.logError = '';
      try {
        const body = {
          package_id: Number(this.logForm.package_id),
          start_date: this.logForm.start_date,
          end_date: this.logForm.end_date || null,
          notes: (this.logForm.notes || '').trim() || null,
        };
        if (this.editingLog) await API.updateWorkLog(this.editingLog.id, body);
        else                 await API.createWorkLog(body);
        await this.loadWorkLogs();
        this.showLogModal = false;
      } catch (e) { this.logError = e.message || 'Save failed'; }
      finally { this.logSaving = false; }
    },

    // ── Daily reports ─────────────────────────────────────────────────────
    async loadProjectAreas() {
      try { this.projectAreas = await API.getAreas(); }
      catch (e) { this.projectAreas = []; }
    },
    async loadDailyReports() {
      this.dailyReportLoading = true;
      try { this.dailyReports = await API.getDailyReports(); }
      catch (e) { console.error('Daily reports load failed', e); }
      finally { this.dailyReportLoading = false; }
    },

    openReportModal(report = null, defaults = null) {
      this.editingReport = report;
      if (report) {
        this.reportForm = {
          package_id: report.package_id,
          report_date: report.report_date,
          avg_hours_per_worker: report.avg_hours_per_worker || 0,
          description: report.description || '',
          worker_ids: [...(report.worker_ids || [])],
          area_ids: [...(report.area_ids || [])],
          no_work: !!report.no_work,
        };
      } else {
        this.reportForm = {
          package_id: defaults?.package_id ?? (this.eligiblePackages[0]?.id || null),
          report_date: defaults?.report_date ?? new Date().toISOString().slice(0, 10),
          avg_hours_per_worker: 0,
          description: '',
          worker_ids: [],
          area_ids: [],
          no_work: false,
        };
      }
      this.reportError = '';
      this.showReportModal = true;
    },

    reportSelectAllWorkers() {
      this.reportForm.worker_ids = this.reportEligibleWorkers.map(w => w.id);
    },
    reportClearAllWorkers() { this.reportForm.worker_ids = []; },
    reportToggleAllWorkers() {
      if (this.reportAllWorkersSelected) this.reportClearAllWorkers();
      else this.reportSelectAllWorkers();
    },

    reportSelectAllAreas() {
      this.reportForm.area_ids = this.projectAreas.map(a => a.id);
    },
    reportClearAllAreas() { this.reportForm.area_ids = []; },
    reportToggleAllAreas() {
      if (this.reportAllAreasSelected) this.reportClearAllAreas();
      else this.reportSelectAllAreas();
    },

    reportMarkNoWork() {
      // Quick "no works done" button — zero everything so the form is instantly
      // valid as a no-work report.
      this.reportForm.avg_hours_per_worker = 0;
      this.reportForm.worker_ids = [];
      this.reportForm.area_ids = [];
      this.reportForm.description = '';
      this.reportForm.no_work = true;
    },

    async saveReport() {
      if (!this.reportForm.package_id) { this.reportError = 'Select a package'; return; }
      if (!this.reportForm.report_date) { this.reportError = 'Select a date'; return; }
      const hoursNum = parseFloat(this.reportForm.avg_hours_per_worker) || 0;
      if (!this.reportForm.no_work && hoursNum > 0) {
        if (!this.reportForm.worker_ids.length) { this.reportError = 'Select at least one worker'; return; }
        if (!this.reportForm.area_ids.length)   { this.reportError = 'Select at least one area'; return; }
        if (!this.reportForm.description.trim()){ this.reportError = 'Description is required'; return; }
      }
      this.reportSaving = true; this.reportError = '';
      try {
        const body = {
          package_id: Number(this.reportForm.package_id),
          report_date: this.reportForm.report_date,
          avg_hours_per_worker: hoursNum,
          description: this.reportForm.description.trim() || null,
          worker_ids: (this.reportForm.worker_ids || []).map(Number),
          area_ids: (this.reportForm.area_ids || []).map(Number),
          no_work: !!this.reportForm.no_work || (hoursNum === 0 && !this.reportForm.worker_ids.length
                    && !this.reportForm.area_ids.length && !this.reportForm.description.trim()),
        };
        if (this.editingReport) await API.updateDailyReport(this.editingReport.id, body);
        else                    await API.createDailyReport(body);
        await this.loadDailyReports();
        this.showReportModal = false;
      } catch (e) { this.reportError = e.message || 'Save failed'; }
      finally { this.reportSaving = false; }
    },

    async deleteReport(r) {
      if (!confirm(`Delete the daily report for ${r.package_tag} on ${r.report_date}?`)) return;
      try { await API.deleteDailyReport(r.id); await this.loadDailyReports(); }
      catch (e) { alert(e.message || 'Delete failed'); }
    },

    openUnlockModal(r) {
      this.unlockTargetReport = r;
      this.unlockComment = '';
      this.unlockError = '';
      this.showUnlockModal = true;
    },
    closeUnlockModal() {
      this.showUnlockModal = false;
      this.unlockTargetReport = null;
      this.unlockComment = '';
      this.unlockError = '';
    },
    async submitUnlock() {
      if (!this.unlockTargetReport) return;
      this.unlockSaving = true; this.unlockError = '';
      try {
        const updated = await API.unlockDailyReport(
          this.unlockTargetReport.id, { comment: this.unlockComment }
        );
        // Update in-place if present in the list and in the open modal
        const idx = this.dailyReports.findIndex(x => x.id === updated.id);
        if (idx >= 0) this.dailyReports.splice(idx, 1, updated);
        if (this.editingReport && this.editingReport.id === updated.id) {
          this.editingReport = updated;
        }
        this.closeUnlockModal();
      } catch (e) {
        this.unlockError = e.message || 'Re-open failed';
      } finally {
        this.unlockSaving = false;
      }
    },

    async deleteLog(log) {
      if (!confirm(`Delete this work period (${log.package_tag}, ${log.start_date} → ${log.end_date || 'ongoing'}) ?`)) return;
      try { await API.deleteWorkLog(log.id); await this.loadWorkLogs(); }
      catch (e) { alert(e.message || 'Delete failed'); }
    },

    // Close an ongoing work period by setting its actual end date to today.
    // Preserves the existing package / start_date / notes so the row is
    // otherwise unchanged.
    async endLog(log) {
      const today = this._todayISO();
      if (!confirm(`End this work period (${log.package_tag}) on ${today}?`)) return;
      try {
        await API.updateWorkLog(log.id, {
          package_id: log.package_id,
          start_date: log.start_date,
          end_date: today,
          notes: log.notes || null,
        });
        await this.loadWorkLogs();
      } catch (e) {
        alert(e.message || 'Could not end work period');
      }
    },

    // ── Work permits ──────────────────────────────────────────────────────
    hazardIcon(key) {
      return '/static/assets/hazards/' + encodeURIComponent(key) + '.svg';
    },
    ppeIcon(key) {
      return '/static/assets/ppe/' + encodeURIComponent(key) + '.svg';
    },
    hazardLabel(key) {
      const h = this.hazardCatalog.find(x => x.key === key);
      return h ? h.label : key;
    },
    ppeLabel(key) {
      const p = this.ppeCatalog.find(x => x.key === key);
      return p ? p.label : key;
    },

    async loadWorkPermits() {
      this.workPermitLoading = true;
      try { this.workPermits = await API.getWorkPermits(); }
      catch (e) { this.workPermits = []; }
      finally { this.workPermitLoading = false; }
    },

    openPermitModal(permit = null) {
      this.editingPermit = permit;
      if (permit) {
        const hz = {};
        (permit.hazards || []).forEach(h => { hz[h.hazard_key] = h.preventive_measure || ''; });
        this.permitForm = {
          package_id: permit.package_id,
          title: permit.title || '',
          description: permit.description || '',
          start_date: permit.start_date,
          end_date: permit.end_date,
          permit_type_ids: [...(permit.permit_type_ids || [])],
          area_ids: [...(permit.area_ids || [])],
          hazards: hz,
          hazards_other: permit.hazards_other || '',
          ppe_keys: [...(permit.ppe_keys || [])],
          ppe_other: permit.ppe_other || '',
          lotos: (permit.lotos || []).map(l => ({
            id: l.id,
            tag_number: l.tag_number,
            description: l.description || '',
            status: l.status,
            locked_state: !!l.locked_state,
            refusal_comment: l.refusal_comment || '',
            _action: null,   // 'resubmit' | 'cancel' | null — applied on Save
          })),
        };
      } else {
        const today = new Date().toISOString().slice(0, 10);
        this.permitForm = {
          package_id: this.eligiblePermitPackages[0]?.id || null,
          title: '', description: '',
          start_date: today, end_date: today,
          permit_type_ids: [],
          area_ids: [],
          hazards: {},
          hazards_other: '',
          ppe_keys: this.ppeCatalog.filter(p => p.default).map(p => p.key),
          ppe_other: '',
          lotos: [],
        };
      }
      this.permitError = '';
      this.showPermitModal = true;
    },

    togglePermitHazard(key) {
      if (key in this.permitForm.hazards) {
        const next = { ...this.permitForm.hazards };
        delete next[key];
        this.permitForm.hazards = next;
      } else {
        this.permitForm.hazards = { ...this.permitForm.hazards, [key]: '' };
      }
    },
    togglePermitPPE(key) {
      const arr = this.permitForm.ppe_keys || [];
      if (arr.includes(key)) {
        this.permitForm.ppe_keys = arr.filter(k => k !== key);
      } else {
        this.permitForm.ppe_keys = [...arr, key];
      }
    },

    // Validate permitForm and build the payload sent to create/update.
    // Returns { ok: true, payload } on success, { ok: false, error } on failure.
    _buildPermitPayload() {
      const f = this.permitForm;
      if (!f.package_id)           return { ok: false, error: 'Select a package' };
      if (!(f.title || '').trim()) return { ok: false, error: 'Title is required' };
      if (!f.start_date)           return { ok: false, error: 'Start date is required' };
      if (!f.end_date)             return { ok: false, error: 'Finish date is required' };
      if (f.end_date < f.start_date) return { ok: false, error: 'Finish date must be on or after the start date' };
      if (!(f.description || '').trim()) return { ok: false, error: 'Description of the work is required' };
      if (!(f.permit_type_ids || []).length) return { ok: false, error: 'Select at least one permit type' };
      if (!(f.area_ids || []).length)        return { ok: false, error: 'Select at least one area' };
      for (const [key, measure] of Object.entries(f.hazards || {})) {
        if (!(measure || '').trim()) {
          return { ok: false, error: `Describe a preventive measure for hazard "${this.hazardLabel(key)}"` };
        }
      }
      for (const l of (f.lotos || [])) {
        if (!(l.tag_number || '').trim()) {
          return { ok: false, error: 'LOTO tag number is required on each row' };
        }
      }
      return {
        ok: true,
        payload: {
          package_id: f.package_id,
          title: f.title, description: f.description,
          start_date: f.start_date, end_date: f.end_date,
          permit_type_ids: f.permit_type_ids,
          area_ids: f.area_ids,
          hazards: Object.entries(f.hazards || {}).map(([k, v]) => ({
            hazard_key: k, preventive_measure: v,
          })),
          hazards_other: f.hazards_other,
          ppe_keys: f.ppe_keys,
          ppe_other: f.ppe_other,
          lotos: (f.lotos || []).map(l => ({
            id: l.id || null,
            tag_number: l.tag_number,
            description: l.description,
            action: l._action || null,
          })),
        },
      };
    },

    // Persist the form via create or update, WITHOUT closing the modal.
    // Returns the updated permit on success, null on failure (error stored
    // in this.permitError). Used by savePermit (then closes modal) and by
    // submitPermitForApproval (auto-save before submit).
    async _persistPermit() {
      const built = this._buildPermitPayload();
      if (!built.ok) { this.permitError = built.error; return null; }
      this.permitError = '';
      try {
        const updated = this.editingPermit
          ? await API.updateWorkPermit(this.editingPermit.id, built.payload)
          : await API.createWorkPermit(built.payload);
        this._mergePermitIntoLists(updated);
        return updated;
      } catch (e) {
        this.permitError = e.message || 'Save failed';
        return null;
      }
    },

    async savePermit() {
      // Creating a fresh permit (Create Draft) keeps the modal open and
      // rehydrates it from the saved permit so the user can immediately
      // click "Submit for Approval" without reopening. Save Changes on an
      // existing permit closes the modal like other save actions.
      const wasCreating = !this.editingPermit;
      this.permitSaving = true;
      try {
        const updated = await this._persistPermit();
        if (!updated) return;   // validation error or API failure
        await this.loadWorkPermits();
        await this.loadLotos();
        await this.loadPendingLotos();
        if (wasCreating) {
          const fresh = this.workPermits.find(p => p.id === updated.id) || updated;
          this.openPermitModal(fresh);
        } else {
          this.showPermitModal = false;
          this.editingPermit = null;
        }
      } finally {
        this.permitSaving = false;
      }
    },

    async deletePermit(r) {
      if (!confirm(`Delete work permit ${r.display_id} (${r.package_tag}, ${r.start_date} → ${r.end_date}) ?`)) return;
      try { await API.deleteWorkPermit(r.id); await this.loadWorkPermits(); await this.loadLotos(); }
      catch (e) { alert(e.message || 'Delete failed'); }
    },

    // ── Work-permit approval flow ────────────────────────────────────────
    permitStatusLabel(s) {
      return {
        DRAFT:    'Draft',
        PENDING:  'Pending approval',
        APPROVED: 'Approved',
        REJECTED: 'Rejected',
        CLOSED:   'Closed',
      }[s || 'DRAFT'] || (s || 'DRAFT');
    },
    permitStatusStyle(s) {
      switch (s) {
        case 'DRAFT':    return 'bg-gray-100 text-gray-600 border-gray-200';
        case 'PENDING':  return 'bg-amber-50 text-amber-700 border-amber-200';
        case 'APPROVED': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'REJECTED': return 'bg-red-50 text-red-700 border-red-200';
        case 'CLOSED':   return 'bg-slate-200 text-slate-700 border-slate-300';
        default:         return 'bg-gray-50 text-gray-500 border-gray-200';
      }
    },
    areaApprovalStatusStyle(s) {
      switch (s) {
        case 'APPROVED': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'REJECTED': return 'bg-red-50 text-red-700 border-red-200';
        case 'PENDING':  return 'bg-amber-50 text-amber-700 border-amber-200';
        default:         return 'bg-gray-100 text-gray-500 border-gray-200';
      }
    },
    // Replace the cached permit (and editingPermit) with the latest payload
    // returned by the backend so the modal UI stays in sync after an action.
    _mergePermitIntoLists(updated) {
      const idx = this.workPermits.findIndex(p => p.id === updated.id);
      if (idx >= 0) this.workPermits.splice(idx, 1, updated);
      else this.workPermits.unshift(updated);
      if (this.editingPermit && this.editingPermit.id === updated.id) {
        this.editingPermit = updated;
      }
    },
    async submitPermitForApproval() {
      const p = this.currentPermit;
      if (!p || !p.id) return;
      const isResubmit = (p.status === 'REJECTED' || this.permitInLotoDeadlock);
      const verb = isResubmit ? 'Resubmit' : 'Submit';
      if (!confirm(`${verb} ${p.display_id} for supervisor approval?`)) return;
      this.permitSaving = true;
      this.permitError = '';
      try {
        // Auto-save the form first so any edits the vendor made (fixing the
        // issues raised in the rejection) are persisted before transition
        // to PENDING locks the permit. If validation fails or the save 500s,
        // _persistPermit leaves permitError set and returns null — we stop.
        if (this.permitCanEdit) {
          const saved = await this._persistPermit();
          if (!saved) return;
        }
        const updated = await API.submitWorkPermit(p.id, { comment: '' });
        this._mergePermitIntoLists(updated);
        await this.loadWorkPermits();
        await this.loadLotos();
        await this.loadPendingLotos();
        // The permit is now PENDING and locked — close the modal so the
        // vendor returns to the list (matches the Save Changes behaviour).
        this.showPermitModal = false;
        this.editingPermit = null;
      } catch (e) {
        this.permitError = e.message || 'Submit failed';
      } finally {
        this.permitSaving = false;
      }
    },
    openApprovePermit() {
      if (this.permitLotoRollupForForm !== 'NA' && this.permitLotoRollupForForm !== 'DONE') {
        alert('LOTO to be executed before release');
        return;
      }
      this.permitDecisionMode = 'approve';
      this.permitDecisionAreaIds = this.permitAreasReviewableByMe.map(a => a.area_id);
      this.permitDecisionComment = '';
      this.permitDecisionError = '';
      this.showPermitDecisionModal = true;
    },
    openRejectPermit() {
      this.permitDecisionMode = 'reject';
      this.permitDecisionAreaIds = this.permitAreasReviewableByMe.map(a => a.area_id);
      this.permitDecisionComment = '';
      this.permitDecisionError = '';
      this.showPermitDecisionModal = true;
    },
    closePermitDecisionModal() {
      this.showPermitDecisionModal = false;
      this.permitDecisionAreaIds = [];
      this.permitDecisionComment = '';
      this.permitDecisionError = '';
    },
    togglePermitDecisionArea(aid) {
      const idx = this.permitDecisionAreaIds.indexOf(aid);
      if (idx >= 0) this.permitDecisionAreaIds.splice(idx, 1);
      else this.permitDecisionAreaIds.push(aid);
    },
    async submitPermitDecision() {
      const p = this.currentPermit;
      if (!p || !p.id) return;
      if (this.permitDecisionAreaIds.length === 0) {
        this.permitDecisionError = 'Select at least one area to review';
        return;
      }
      const isReject = this.permitDecisionMode === 'reject';
      if (isReject && !this.permitDecisionComment.trim()) {
        this.permitDecisionError = 'A rejection comment is required';
        return;
      }
      this.permitDecisionSaving = true;
      this.permitDecisionError = '';
      try {
        const body = {
          area_ids: this.permitDecisionAreaIds,
          comment: this.permitDecisionComment.trim() || null,
        };
        const fn = isReject ? API.rejectWorkPermit : API.approveWorkPermit;
        const updated = await fn(p.id, body);
        this._mergePermitIntoLists(updated);
        this.closePermitDecisionModal();
      } catch (e) {
        this.permitDecisionError = e.message || 'Action failed';
      } finally {
        this.permitDecisionSaving = false;
      }
    },
    // ── Close permit (vendor) ────────────────────────────────────────────
    openPermitClose() {
      this.permitCloseComment = '';
      this.permitCloseError = '';
      this.showPermitCloseModal = true;
    },
    closePermitCloseModal() {
      this.showPermitCloseModal = false;
      this.permitCloseComment = '';
      this.permitCloseError = '';
    },
    async confirmPermitClose() {
      const p = this.currentPermit;
      if (!p || !p.id) return;
      this.permitCloseSaving = true;
      this.permitCloseError = '';
      try {
        const updated = await API.closeWorkPermit(p.id, {
          comment: this.permitCloseComment.trim() || null,
        });
        this._mergePermitIntoLists(updated);
        await this.loadLotos();
        await this.loadPendingLotos();
        this.closePermitCloseModal();
      } catch (e) {
        this.permitCloseError = e.message || 'Close failed';
      } finally {
        this.permitCloseSaving = false;
      }
    },

    // ── Extension request (vendor) ───────────────────────────────────────
    openPermitExtension() {
      const p = this.currentPermit;
      if (!p) return;
      this.permitExtensionNewDate = p.end_date || '';
      this.permitExtensionComment = '';
      this.permitExtensionError = '';
      this.showPermitExtensionModal = true;
    },
    closePermitExtensionModal() {
      this.showPermitExtensionModal = false;
      this.permitExtensionNewDate = '';
      this.permitExtensionComment = '';
      this.permitExtensionError = '';
    },
    async confirmPermitExtension() {
      const p = this.currentPermit;
      if (!p || !p.id) return;
      if (!this.permitExtensionNewDate) {
        this.permitExtensionError = 'New finish date is required';
        return;
      }
      if (this.permitExtensionNewDate <= (p.end_date || '')) {
        this.permitExtensionError = 'New finish date must be after the current finish date';
        return;
      }
      this.permitExtensionSaving = true;
      this.permitExtensionError = '';
      try {
        const updated = await API.requestWorkPermitExtension(p.id, {
          end_date: this.permitExtensionNewDate,
          comment: this.permitExtensionComment.trim() || null,
        });
        this._mergePermitIntoLists(updated);
        this.closePermitExtensionModal();
      } catch (e) {
        this.permitExtensionError = e.message || 'Extension request failed';
      } finally {
        this.permitExtensionSaving = false;
      }
    },

    // One-page A4 export. Authenticated fetch (token + project header)
    // → blob → triggered download so the user gets a native Save As.
    async exportPermitPdf() {
      const p = this.currentPermit;
      if (!p || !p.id) return;
      try {
        const headers = API.headers();
        delete headers['Content-Type'];   // GET body-less
        const resp = await fetch(API.base + API.workPermitPdfUrl(p.id), { headers });
        if (!resp.ok) {
          const msg = await resp.text();
          throw new Error(msg || ('HTTP ' + resp.status));
        }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${p.display_id || 'work-permit'}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) {
        alert(e.message || 'PDF export failed');
      }
    },

    async openPermitHistory() {
      const p = this.currentPermit;
      if (!p || !p.id) return;
      this.permitHistoryPermit = p;
      this.permitHistoryRows = [];
      this.permitHistoryLoading = true;
      this.showPermitHistoryModal = true;
      try { this.permitHistoryRows = await API.getWorkPermitHistory(p.id); }
      catch (e) { console.error('Permit history load failed', e); }
      finally { this.permitHistoryLoading = false; }
    },
    closePermitHistory() {
      this.showPermitHistoryModal = false;
      this.permitHistoryPermit = null;
      this.permitHistoryRows = [];
    },
    permitEventLabel(ev) {
      return {
        SUBMIT:   'Submitted for approval',
        RESUBMIT: 'Resubmitted',
        EXTEND:   'Extension requested',
        APPROVE:  'Approved',
        REJECT:   'Rejected',
        CLOSE:    'Closed',
        OVERRIDE: 'Overridden',
      }[ev] || ev;
    },
    permitEventBadgeStyle(h) {
      switch ((h && h.event) || '') {
        case 'SUBMIT':
        case 'RESUBMIT':
        case 'EXTEND':
          return 'bg-amber-100 text-amber-700';
        case 'APPROVE':
          return 'bg-green-100 text-green-700';
        case 'REJECT':
          return 'bg-red-100 text-red-700';
        case 'CLOSE':
          return 'bg-slate-200 text-slate-700';
        case 'OVERRIDE':
          if (h.approved === true)  return 'bg-green-100 text-green-700';
          if (h.approved === false) return 'bg-red-100 text-red-700';
          return 'bg-blue-100 text-blue-700';
        default:
          return 'bg-blue-100 text-blue-700';
      }
    },
    permitEventDotClass(h) {
      switch ((h && h.event) || '') {
        case 'APPROVE':  return 'bg-green-500';
        case 'REJECT':   return 'bg-red-500';
        case 'CLOSE':    return 'bg-slate-500';
        case 'EXTEND':   return 'bg-amber-500';
        case 'OVERRIDE':
          if (h.approved === true)  return 'bg-green-500';
          if (h.approved === false) return 'bg-red-500';
          return 'bg-blue-500';
        default:
          return 'bg-blue-500';
      }
    },

    // ── Co-activity board helpers ────────────────────────────────────────
    _isoDate(d) {
      const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
      return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    },
    _todayISO() { return this._isoDate(new Date()); },
    _mondayOf(d) {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      // JS: Sunday=0 ... Saturday=6. We want Monday=0.
      const offset = (x.getDay() + 6) % 7;
      x.setDate(x.getDate() - offset);
      return x;
    },
    initCoactivity() {
      if (!this.coactivityStartISO) {
        this.coactivityStartISO = this._isoDate(this._mondayOf(new Date()));
      }
    },
    shiftCoactivity(weeks) {
      const d = new Date(this.coactivityStartISO + 'T00:00:00');
      d.setDate(d.getDate() + weeks * 7);
      this.coactivityStartISO = this._isoDate(d);
    },
    resetCoactivity() {
      this.coactivityStartISO = this._isoDate(this._mondayOf(new Date()));
    },
    coactivityCellPermits(area_id, column) {
      // `column` may be an ISO string (day mode) or a column object
      // (week mode) with a `dayIsos` list. Collect permits across every
      // day the column covers, deduplicated by permit.id.
      const isos = (typeof column === 'string')
        ? [column]
        : (column && column.dayIsos) || [];
      const seen = new Set();
      const out = [];
      for (const iso of isos) {
        for (const p of (this.coactivityCells[area_id + '::' + iso] || [])) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          out.push(p);
        }
      }
      return out;
    },
    // Expected - actual daily reports for a single package. Mirrors the
    // backend's _expected_report_dates rule: every day in every WorkLog
    // window of that package, clamped to today.
    _missingReportsForPackage(package_id) {
      const logs = this.workLogs.filter(w => w.package_id === package_id);
      if (!logs.length) return 0;
      const today = this._todayISO();
      const expected = new Set();
      for (const wl of logs) {
        if (!wl.start_date) continue;
        const start = new Date(wl.start_date + 'T00:00:00');
        const rawEnd = wl.end_date ? new Date(wl.end_date + 'T00:00:00') : new Date(today + 'T00:00:00');
        if (rawEnd < start) continue;
        const end = (wl.end_date && wl.end_date > today) ? new Date(today + 'T00:00:00') : rawEnd;
        const cur = new Date(start);
        while (cur <= end) {
          expected.add(this._isoDate(cur));
          cur.setDate(cur.getDate() + 1);
        }
      }
      const actual = new Set(
        this.dailyReports
          .filter(r => r.package_id === package_id)
          .map(r => r.report_date)
      );
      let missing = 0;
      for (const iso of expected) if (!actual.has(iso)) missing += 1;
      return missing;
    },

    // Chart.js renderer: one bar per day — "Active workers on site per day" —
    // tinted with the Group-IPS blue.
    renderActiveWorkersChart() {
      const ref = this.$refs.activeWorkersChart;
      if (!ref) return;
      // Destroy the previous chart defensively: Chart.js crashes with
      // "Cannot read properties of null (reading 'save')" if the canvas
      // was already unmounted by Vue (e.g. tab switch, dashLoading toggle).
      if (this.activeWorkersChartObj) {
        try { this.activeWorkersChartObj.destroy(); } catch (e) { /* orphaned canvas */ }
        this.activeWorkersChartObj = null;
      }
      const s = this.dashboardChartSeries;
      if (!s.labels.length) return;
      this.activeWorkersChartObj = new Chart(ref, {
        type: 'bar',
        data: {
          labels: s.labels,
          datasets: [{
            label: 'Active workers on site',
            data: s.data,
            backgroundColor: '#00AEEF',
            borderRadius: 2,
            borderSkipped: false,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => items[0].label,
                label: (item) => ' ' + item.parsed.y + ' worker'
                  + (item.parsed.y === 1 ? '' : 's'),
              },
            },
            datalabels: { display: false },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                font: { size: 10 },
                maxTicksLimit: 14,
                autoSkip: true,
              },
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0,0,0,0.05)' },
              ticks: { font: { size: 10 }, precision: 0 },
            },
          },
        },
      });
    },
    async loadActiveWorkersSeries() {
      try {
        const params = {};
        if (this.dashboardPackageFilter) params.package_id = this.dashboardPackageFilter;
        const rows = await API.getConstructionActiveWorkersSeries(params);
        this.activeWorkersSeries = {
          labels: rows.map(r => r.date),
          data:   rows.map(r => r.count),
        };
      } catch (e) {
        console.error('Active-workers series load failed', e);
        this.activeWorkersSeries = { labels: [], data: [] };
      }
    },
    // Called when the Dashboard tab becomes active. The canvas is only
    // in the DOM while activeTab === 'dashboard', so we wait for the
    // next tick before binding (same pattern as procurement dashboard).
    async ensureDashboardChart() {
      await this.loadActiveWorkersSeries();
      this.$nextTick(() => this.renderActiveWorkersChart());
    },

    coactivityBadgeTitle(permit) {
      const parts = [
        permit.package_tag || ('Pkg ' + permit.package_id),
        permit.display_id,
      ].filter(Boolean);
      let head = parts.join(' · ');
      if (permit.title) head += ' — ' + permit.title;
      head += '  [' + this.permitStatusLabel(permit.status) + ']';
      const desc = (permit.description || '').trim();
      return desc ? head + '\n' + desc : head;
    },

    // ── LOTO list (in-permit editor) ─────────────────────────────────────
    permitAddLoto() {
      this.permitForm.lotos = [
        ...(this.permitForm.lotos || []),
        { id: null, tag_number: '', description: '', status: null, locked_state: false,
          refusal_comment: '', _action: null },
      ];
    },
    permitRemoveLoto(idx) {
      const row = this.permitForm.lotos[idx];
      if (row && row.status === 'LOCKED') return;    // cannot remove confirmed
      this.permitForm.lotos.splice(idx, 1);
    },
    // Toggle a pending action ('resubmit' | 'cancel') on a REFUSED LOTO row.
    // The intent is stored locally and applied atomically when the permit is
    // saved, so the vendor updates tag/description + resubmits in one go.
    permitSetLotoAction(idx, action) {
      const row = this.permitForm.lotos[idx];
      if (!row || row.status !== 'REFUSED') return;
      row._action = (row._action === action) ? null : action;
    },
    lotoStatusStyle(status) {
      switch (status) {
        case 'REQUEST':        return 'bg-amber-50 text-amber-700 border-amber-200';
        case 'LOCKED':         return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'REFUSED':        return 'bg-red-50 text-red-700 border-red-200';
        case 'CANCELLED':      return 'bg-gray-100 text-gray-500 border-gray-200';
        case 'TO_BE_RELEASED': return 'bg-orange-50 text-orange-700 border-orange-200';
        case 'RELEASED':       return 'bg-slate-200 text-slate-700 border-slate-300';
        default:               return 'bg-gray-50 text-gray-500 border-gray-200';
      }
    },
    lotoStatusLabel(status) {
      if (status === 'TO_BE_RELEASED') return 'TO BE RELEASED';
      return status || 'NEW';
    },
    // Roll-up LOTO status shown on the work-permit list.
    //   NA          — no LOTOs declared
    //   REFUSED     — at least one LOTO is currently REFUSED (takes priority)
    //   RELEASED    — every non-cancelled LOTO is RELEASED (terminal state)
    //   DONE        — every LOTO is LOCKED or CANCELLED
    //   IN PROGRESS — anything else (at least one REQUEST / TO_BE_RELEASED)
    permitLotoStatus(permit) {
      const arr = (permit && permit.lotos) || [];
      if (arr.length === 0) return 'NA';
      if (arr.some(l => l.status === 'REFUSED')) return 'REFUSED';
      const active = arr.filter(l => l.status !== 'CANCELLED');
      if (active.length > 0 && active.every(l => l.status === 'RELEASED')) return 'RELEASED';
      const allDone = arr.every(l => l.status === 'LOCKED' || l.status === 'CANCELLED');
      return allDone ? 'DONE' : 'IN PROGRESS';
    },
    permitLotoStatusStyle(status) {
      switch (status) {
        case 'NA':          return 'bg-gray-100 text-gray-500 border-gray-200';
        case 'DONE':        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'RELEASED':    return 'bg-slate-200 text-slate-700 border-slate-300';
        case 'IN PROGRESS': return 'bg-amber-50 text-amber-700 border-amber-200';
        case 'REFUSED':     return 'bg-red-50 text-red-700 border-red-200';
        default:            return 'bg-gray-50 text-gray-500 border-gray-200';
      }
    },
    // History badge colour matches the LOTO status the event transitions to,
    // so SUBMIT/RESUBMIT → amber (REQUEST), CONFIRM → emerald (LOCKED),
    // REFUSE → red (REFUSED), CANCEL → gray (CANCELLED). OVERRIDE uses the
    // `confirmed` flag to pick between LOCKED / REFUSED colours.
    lotoHistoryEventStyle(h) {
      switch ((h && h.event) || '') {
        case 'SUBMIT':
        case 'RESUBMIT':
          return this.lotoStatusStyle('REQUEST');
        case 'CONFIRM':
          return this.lotoStatusStyle('LOCKED');
        case 'REFUSE':
          return this.lotoStatusStyle('REFUSED');
        case 'CANCEL':
          return this.lotoStatusStyle('CANCELLED');
        case 'RELEASE_REQUEST':
          return this.lotoStatusStyle('TO_BE_RELEASED');
        case 'RELEASE':
          return this.lotoStatusStyle('RELEASED');
        case 'OVERRIDE':
          if (h.confirmed === true)  return this.lotoStatusStyle('LOCKED');
          if (h.confirmed === false) return this.lotoStatusStyle('REFUSED');
          return this.lotoStatusStyle(null);
        default:
          return this.lotoStatusStyle(null);
      }
    },
    lotoEventLabel(ev) {
      return {
        SUBMIT:          'Submitted for review',
        CONFIRM:         'Confirmed (locked)',
        REFUSE:          'Refused',
        RESUBMIT:        'Resubmitted',
        CANCEL:          'Cancelled',
        RELEASE_REQUEST: 'Release requested',
        RELEASE:         'Released',
        OVERRIDE:        'Overridden',
      }[ev] || ev;
    },
    lotoEventDotClass(h) {
      const ev = (h && h.event) || '';
      if (ev === 'CONFIRM')         return 'bg-green-500';
      if (ev === 'REFUSE')          return 'bg-red-500';
      if (ev === 'CANCEL')          return 'bg-gray-400';
      if (ev === 'RELEASE_REQUEST') return 'bg-orange-500';
      if (ev === 'RELEASE')         return 'bg-slate-500';
      if (ev === 'OVERRIDE') {
        if (h.confirmed === true)  return 'bg-green-500';
        if (h.confirmed === false) return 'bg-red-500';
        return 'bg-blue-500';
      }
      // SUBMIT / RESUBMIT / unknown
      return 'bg-blue-500';
    },

    // ── LOTO tab ─────────────────────────────────────────────────────────
    async loadLotos() {
      this.lotoLoading = true;
      try { this.lotos = await API.getLotos(); }
      catch { this.lotos = []; }
      finally { this.lotoLoading = false; }
    },
    async loadPendingLotos() {
      try { this.pendingLotos = await API.getLotosPendingApproval(); }
      catch { this.pendingLotos = []; }
    },

    canReviewLoto(loto) {
      // LOTO review is project-scoped: any declared site supervisor can
      // confirm/refuse any LOTO, regardless of the permit's areas. This
      // differs from work-permit approval, which is strictly per area.
      if (this.isOwnerOrAdmin) return true;
      return this.isSiteSupervisor;
    },
    canManageLoto(loto) {
      if (this.isOwnerOrAdmin) return true;
      const permit = this.workPermits.find(p => p.id === loto.work_permit_id);
      if (!permit) return false;
      return (this.vendorPackageIds || []).includes(permit.package_id);
    },

    async confirmLoto(loto) {
      if (!confirm(`Mark LOTO ${loto.display_id} (tag "${loto.tag_number}") as LOCKED?`)) return;
      try {
        const updated = await API.confirmLoto(loto.id, { comment: '' });
        this._updateLotoInLists(updated);
      } catch (e) { alert(e.message || 'Confirm failed'); }
    },
    openRefuseLoto(loto) {
      this.lotoRefuseTarget = loto;
      this.lotoRefuseComment = '';
      this.lotoRefuseError = '';
      this.showLotoRefuseModal = true;
    },
    closeRefuseLotoModal() {
      this.showLotoRefuseModal = false;
      this.lotoRefuseTarget = null;
      this.lotoRefuseComment = '';
      this.lotoRefuseError = '';
    },
    async submitRefuseLoto() {
      if (!this.lotoRefuseTarget) return;
      if (!(this.lotoRefuseComment || '').trim()) {
        this.lotoRefuseError = 'A refusal comment is required';
        return;
      }
      this.lotoRefuseSaving = true; this.lotoRefuseError = '';
      try {
        const updated = await API.refuseLoto(this.lotoRefuseTarget.id,
          { comment: this.lotoRefuseComment });
        this._updateLotoInLists(updated);
        this.closeRefuseLotoModal();
      } catch (e) {
        this.lotoRefuseError = e.message || 'Refuse failed';
      } finally {
        this.lotoRefuseSaving = false;
      }
    },

    openLotoOverride(loto, approve) {
      this.lotoOverrideTarget = loto;
      this.lotoOverrideApprove = approve;
      this.lotoOverrideComment = '';
      this.lotoOverrideError = '';
      this.showLotoOverrideModal = true;
    },
    closeLotoOverride() {
      this.showLotoOverrideModal = false;
      this.lotoOverrideTarget = null;
      this.lotoOverrideComment = '';
      this.lotoOverrideError = '';
    },
    async submitLotoOverride() {
      if (!this.lotoOverrideTarget) return;
      if (!this.lotoOverrideApprove && !(this.lotoOverrideComment || '').trim()) {
        this.lotoOverrideError = 'A comment is required to override with refusal';
        return;
      }
      this.lotoOverrideSaving = true; this.lotoOverrideError = '';
      try {
        const updated = await API.overrideLoto(this.lotoOverrideTarget.id, {
          approved: !!this.lotoOverrideApprove,
          comment: this.lotoOverrideComment,
        });
        this._updateLotoInLists(updated);
        this.closeLotoOverride();
      } catch (e) {
        this.lotoOverrideError = e.message || 'Override failed';
      } finally {
        this.lotoOverrideSaving = false;
      }
    },

    async resubmitLotoFromList(loto) {
      if (!confirm(`Resubmit LOTO ${loto.display_id} for a new review?`)) return;
      try {
        const updated = await API.resubmitLoto(loto.id, {});
        this._updateLotoInLists(updated);
      } catch (e) { alert(e.message || 'Resubmit failed'); }
    },
    async cancelLotoFromList(loto) {
      if (!confirm(`Cancel LOTO ${loto.display_id}?`)) return;
      try {
        const updated = await API.cancelLoto(loto.id, {});
        this._updateLotoInLists(updated);
      } catch (e) { alert(e.message || 'Cancel failed'); }
    },
    async releaseLotoFromList(loto) {
      if (!confirm(`Confirm physical release of LOTO ${loto.display_id} (tag "${loto.tag_number}")?`)) return;
      try {
        const updated = await API.releaseLoto(loto.id, {});
        this._updateLotoInLists(updated);
      } catch (e) { alert(e.message || 'Release failed'); }
    },

    _updateLotoInLists(updated) {
      const idx = this.lotos.findIndex(x => x.id === updated.id);
      if (idx >= 0) this.lotos.splice(idx, 1, updated);
      else this.lotos.unshift(updated);
      // Refresh the pending queue
      this.loadPendingLotos();
      // Mirror into the cached permit row so reopening its modal shows the
      // fresh LOTO state without a full page refresh.
      const permit = this.workPermits.find(p => p.id === updated.work_permit_id);
      if (permit) {
        const arr = permit.lotos || [];
        const lIdx = arr.findIndex(x => x.id === updated.id);
        if (lIdx >= 0) arr.splice(lIdx, 1, updated);
        else arr.push(updated);
      }
      // Mirror into the open permit form if it contains this LOTO
      if (this.showPermitModal && this.editingPermit &&
          this.editingPermit.id === updated.work_permit_id) {
        const pIdx = (this.permitForm.lotos || []).findIndex(x => x.id === updated.id);
        if (pIdx >= 0) {
          const next = [...this.permitForm.lotos];
          next.splice(pIdx, 1, {
            id: updated.id,
            tag_number: updated.tag_number,
            description: updated.description,
            status: updated.status,
            locked_state: updated.locked_state,
            refusal_comment: updated.refusal_comment,
            _action: null,
          });
          this.permitForm.lotos = next;
        }
      }
    },

    async openLotoHistory(loto) {
      this.lotoHistoryLoto = loto;
      this.showLotoHistoryModal = true;
      this.lotoHistoryLoading = true;
      this.lotoHistoryRows = [];
      try { this.lotoHistoryRows = await API.getLotoHistory(loto.id); }
      catch { this.lotoHistoryRows = []; }
      finally { this.lotoHistoryLoading = false; }
    },
    closeLotoHistory() {
      this.showLotoHistoryModal = false;
      this.lotoHistoryLoto = null;
      this.lotoHistoryRows = [];
    },

    packageLabel(pkg) { return pkg ? `${pkg.tag_number} — ${pkg.name}` : ''; },

    fmtDate(d) { return d ? d.slice(0, 10) : ''; },
  },

  template: `
  <div>
    <!-- Sub-tabs -->
    <div class="sub-tabs">
      <button @click="activeTab = 'daily'"
        :class="['sub-tab', activeTab === 'daily' ? 'active' : '']">Daily Reports</button>
      <button @click="activeTab = 'worklogs'"
        :class="['sub-tab', activeTab === 'worklogs' ? 'active' : '']">Work Logs</button>
      <button @click="activeTab = 'people'"
        :class="['sub-tab', activeTab === 'people' ? 'active' : '']">Workers/Subcontracts</button>
      <button @click="activeTab = 'permits'"
        :class="['sub-tab', activeTab === 'permits' ? 'active' : '']">Work Permits</button>
      <button @click="activeTab = 'loto'"
        :class="['sub-tab', activeTab === 'loto' ? 'active' : '']">
        LOTO
        <span v-if="lotoReviewableCount > 0"
          class="ml-1 inline-block px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">{{ lotoReviewableCount }}</span>
      </button>
      <button @click="activeTab = 'coactivity'"
        :class="['sub-tab', activeTab === 'coactivity' ? 'active' : '']">Co-activity</button>
      <button @click="activeTab = 'dashboard'"
        :class="['sub-tab', activeTab === 'dashboard' ? 'active' : '']">Dashboard</button>
      <button @click="activeTab = 'approvals'"
        :class="['sub-tab', activeTab === 'approvals' ? 'active' : '']">
        Worker Approvals
        <span v-if="pendingApprovalWorkers.length > 0"
          class="ml-1 inline-block px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">{{ pendingApprovalWorkers.length }}</span>
      </button>
      <button @click="activeTab = 'setup'"
        :class="['sub-tab', activeTab === 'setup' ? 'active' : '']">Setup</button>
    </div>

    <!-- ═════════════════════ DASHBOARD ═════════════════════ -->
    <div v-if="activeTab === 'dashboard'">
      <!-- Filter bar -->
      <div class="flex flex-wrap items-center gap-2 mt-6 mb-4">
        <label class="text-xs uppercase tracking-wider text-gray-500">Package</label>
        <select v-model="dashboardPackageFilter" class="input-field text-sm" style="width:auto;min-width:220px">
          <option :value="null">All packages</option>
          <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
        </select>
        <span v-if="dashboardPackageFilter" class="text-xs text-gray-500">
          Dashboard is filtered to a single package.
        </span>
        <span v-else class="text-xs text-gray-400">Showing every package on the project.</span>
        <button @click="ensureDashboardChart" class="btn-secondary text-sm flex items-center gap-1.5 ml-auto" title="Re-render dashboard chart">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Refresh
        </button>
      </div>

      <!-- Top KPI row -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div class="card p-4">
          <div class="text-[11px] uppercase tracking-wider text-gray-400">Hours performed</div>
          <div class="text-3xl font-semibold text-gray-800 mt-1">{{ dashboardTotalHours.toLocaleString() }}</div>
          <div class="text-xs text-gray-500 mt-1">
            {{ dashboardReportCounts.work }} working day report(s)
            · {{ dashboardReportCounts.noWork }} no-work
          </div>
        </div>
        <div class="card p-4">
          <div class="text-[11px] uppercase tracking-wider text-gray-400">Workers</div>
          <div class="text-3xl font-semibold text-gray-800 mt-1">{{ dashboardScopedWorkers.length }}</div>
          <div class="text-xs text-gray-500 mt-1">
            <span class="text-emerald-700 font-medium">{{ dashboardWorkerCounts.APPROVED }}</span> approved
            · <span class="text-amber-700 font-medium">{{ dashboardWorkerCounts.PENDING }}</span> pending
            · <span class="text-red-700 font-medium">{{ dashboardWorkerCounts.REJECTED }}</span> rejected
          </div>
        </div>
        <div class="card p-4">
          <div class="text-[11px] uppercase tracking-wider text-gray-400">Subcontractors</div>
          <div class="text-3xl font-semibold text-gray-800 mt-1">{{ dashboardScopedSubcontractors.length }}</div>
          <div class="text-xs text-gray-500 mt-1">
            across {{ dashboardPerPackageRows.length }} package{{ dashboardPerPackageRows.length === 1 ? '' : 's' }}
          </div>
        </div>
        <div class="card p-4">
          <div class="text-[11px] uppercase tracking-wider text-gray-400">Daily reports missing</div>
          <div :class="['text-3xl font-semibold mt-1', dashboardMissingReportsTotal > 0 ? 'text-amber-700' : 'text-emerald-700']">
            {{ dashboardMissingReportsTotal }}
          </div>
          <div class="text-xs text-gray-500 mt-1">
            vs expected days from work logs
          </div>
        </div>
      </div>

      <!-- Permits + LOTOs split -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div class="card p-4">
          <h3 class="text-sm font-semibold text-gray-800 mb-3">Work permit status</h3>
          <div class="flex flex-wrap gap-2">
            <template v-for="s in ['DRAFT','PENDING','APPROVED','REJECTED','CLOSED']" :key="s">
              <div :class="['inline-flex items-center gap-2 px-3 py-1.5 rounded-full border',
                            permitStatusStyle(s)]">
                <span class="text-[10px] font-bold uppercase tracking-wider">{{ permitStatusLabel(s) }}</span>
                <span class="text-sm font-semibold">{{ dashboardPermitCounts[s] }}</span>
              </div>
            </template>
          </div>
          <p class="mt-3 text-xs text-gray-500">
            Total: {{ dashboardScopedPermits.length }} work permit(s){{ dashboardPackageFilter ? ' on the selected package' : ' across the project' }}.
          </p>
        </div>

        <div class="card p-4">
          <h3 class="text-sm font-semibold text-gray-800 mb-3">LOTO status</h3>
          <div class="flex flex-wrap gap-2">
            <template v-for="s in ['REQUEST','LOCKED','REFUSED','CANCELLED','TO_BE_RELEASED','RELEASED']" :key="s">
              <div :class="['inline-flex items-center gap-2 px-3 py-1.5 rounded-full border',
                            lotoStatusStyle(s)]">
                <span class="text-[10px] font-bold uppercase tracking-wider">{{ lotoStatusLabel(s) }}</span>
                <span class="text-sm font-semibold">{{ dashboardLotoCounts[s] }}</span>
              </div>
            </template>
          </div>
          <p class="mt-3 text-xs text-gray-500">
            Total: {{ dashboardScopedLotos.length }} LOTO(s).
          </p>
        </div>
      </div>

      <!-- Per-package breakdown -->
      <div class="card p-0 overflow-hidden mb-4">
        <div class="px-4 py-3 border-b border-gray-100">
          <h3 class="text-sm font-semibold text-gray-800">Workers / subcontractors / missing reports — per package</h3>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
            <tr>
              <th class="text-left px-3 py-2 w-32">Package</th>
              <th class="text-left px-3 py-2">Name</th>
              <th class="text-right px-3 py-2 w-24">Workers</th>
              <th class="text-right px-3 py-2 w-28">Approved</th>
              <th class="text-right px-3 py-2 w-28">Pending</th>
              <th class="text-right px-3 py-2 w-28">Rejected</th>
              <th class="text-right px-3 py-2 w-28">Subcontractors</th>
              <th class="text-right px-3 py-2 w-32">Missing reports</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in dashboardPerPackageRows" :key="r.id" class="border-b border-gray-100">
              <td class="px-3 py-1.5 whitespace-nowrap">
                <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ r.tag_number }}</span>
              </td>
              <td class="px-3 py-1.5 text-gray-800">{{ r.name }}</td>
              <td class="px-3 py-1.5 text-right font-semibold">{{ r.workers_total }}</td>
              <td class="px-3 py-1.5 text-right text-emerald-700">{{ r.workers_approved }}</td>
              <td class="px-3 py-1.5 text-right text-amber-700">{{ r.workers_pending }}</td>
              <td class="px-3 py-1.5 text-right text-red-700">{{ r.workers_rejected }}</td>
              <td class="px-3 py-1.5 text-right">{{ r.subs_total }}</td>
              <td :class="['px-3 py-1.5 text-right font-semibold',
                           r.missing_reports > 0 ? 'text-amber-700' : 'text-emerald-700']">
                {{ r.missing_reports }}
              </td>
            </tr>
            <tr v-if="dashboardPerPackageRows.length === 0">
              <td colspan="8" class="px-4 py-8 text-center text-gray-400">No packages yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Timeline chart -->
      <div class="card p-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold text-gray-800">Active workers on site — per day</h3>
          <span class="text-[11px] text-gray-400">From daily reports · unique worker ids per date</span>
        </div>
        <div v-if="dashboardChartSeries.labels.length === 0"
             class="text-center text-gray-400 py-8 text-sm">
          No daily reports in scope yet.
        </div>
        <div v-else style="position:relative;height:260px">
          <canvas ref="activeWorkersChart"></canvas>
        </div>
      </div>
    </div>

    <!-- ═════════════════════ SETUP ═════════════════════ -->
    <div v-if="activeTab === 'setup'">
      <div v-if="!canEditSetup" class="card p-4 mb-4 bg-amber-50 border-amber-200 text-amber-700 text-sm">
        Read-only — only project owners can edit construction setup.
      </div>

      <div class="flex gap-2 mt-6 mb-4 flex-wrap">
        <button :class="['btn-secondary', setupSubtab === 'permits' ? 'font-semibold' : '']" @click="setupSubtab = 'permits'">Work Permit Types</button>
        <button :class="['btn-secondary', setupSubtab === 'certs' ? 'font-semibold' : '']" @click="setupSubtab = 'certs'">Worker Certificate Types</button>
        <button :class="['btn-secondary', setupSubtab === 'areas' ? 'font-semibold' : '']" @click="setupSubtab = 'areas'">Areas &amp; Supervisors</button>
      </div>

      <!-- ─── Work Permit Types ─── -->
      <div v-if="setupSubtab === 'permits'" class="mt-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm text-gray-500">Permit types available on this project.</p>
          <button v-if="canEditSetup" @click="openSetupModal('work-permit-types')" class="btn-primary text-sm">+ New Permit Type</button>
        </div>
        <div class="card p-0 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th class="text-left px-4 py-3">Permit</th>
                <th class="text-left px-4 py-3">Description</th>
                <th v-if="canEditSetup" class="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in permitTypes" :key="p.id" class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3 font-medium text-gray-800">{{ p.name }}</td>
                <td class="px-4 py-3 text-gray-500">{{ p.description || '—' }}</td>
                <td v-if="canEditSetup" class="px-4 py-3 text-right">
                  <button @click="openSetupModal('work-permit-types', p)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button @click="deleteSetup('work-permit-types', p)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </td>
              </tr>
              <tr v-if="permitTypes.length === 0"><td colspan="3" class="px-4 py-6 text-center text-gray-400">No permit types yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>


      <!-- ─── Worker Certificate Types ─── -->
      <div v-if="setupSubtab === 'certs'" class="mt-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm text-gray-500">Certificates a worker may hold.</p>
          <button v-if="canEditSetup" @click="openSetupModal('worker-certificate-types')" class="btn-primary text-sm">+ New Certificate</button>
        </div>
        <div class="card p-0 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th class="text-left px-4 py-3">Certificate</th>
                <th class="text-left px-4 py-3">Description</th>
                <th v-if="canEditSetup" class="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in certificateTypes" :key="c.id" class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3 font-medium text-gray-800">{{ c.name }}</td>
                <td class="px-4 py-3 text-gray-500">{{ c.description || '—' }}</td>
                <td v-if="canEditSetup" class="px-4 py-3 text-right">
                  <button @click="openSetupModal('worker-certificate-types', c)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button @click="deleteSetup('worker-certificate-types', c)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </td>
              </tr>
              <tr v-if="certificateTypes.length === 0"><td colspan="3" class="px-4 py-6 text-center text-gray-400">No certificate types yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ─── Areas & Supervisors (read-only) ─── -->
      <div v-if="setupSubtab === 'areas'" class="mt-4">
        <div class="card p-4 mb-3 bg-blue-50 border-blue-100 text-xs text-blue-800">
          Site supervisors are assigned in <strong>Project Organization → Areas</strong>. This list must be populated before work-permit features can be used per area.
        </div>
        <div class="card p-0 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th class="text-left px-4 py-3 w-24">Tag</th>
                <th class="text-left px-4 py-3">Description</th>
                <th class="text-left px-4 py-3">Area Owner</th>
                <th class="text-left px-4 py-3">Site Supervisors</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in areasWithSupervisors" :key="a.id" class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3">
                  <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ a.tag }}</span>
                </td>
                <td class="px-4 py-3 font-medium text-gray-800">{{ a.description }}</td>
                <td class="px-4 py-3 text-gray-600">{{ a.owner_name || '—' }}</td>
                <td class="px-4 py-3 text-gray-600">
                  <div v-if="(a.site_supervisors || []).length === 0" class="text-amber-600 text-xs font-medium">⚠ No supervisors assigned</div>
                  <div v-else class="flex flex-wrap gap-1">
                    <span v-for="s in a.site_supervisors" :key="s.id"
                      class="inline-block px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200"
                      :title="s.company || ''">{{ s.name }}</span>
                  </div>
                </td>
              </tr>
              <tr v-if="areasWithSupervisors.length === 0"><td colspan="4" class="px-4 py-6 text-center text-gray-400">No areas defined yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Setup edit modal -->
      <div v-if="setupEditing" class="modal-overlay" @click.self="closeSetupModal">
        <div class="modal-box">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">
              {{ setupEditing.item ? 'Edit' : 'New' }} —
              {{ setupEditing.kind === 'work-permit-types' ? 'Permit Type' : 'Certificate Type' }}
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
            <p v-if="setupError" class="text-red-500 text-sm">{{ setupError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="closeSetupModal" class="btn-secondary">Cancel</button>
            <button @click="saveSetup" :disabled="setupSaving" class="btn-primary">
              {{ setupSaving ? 'Saving…' : (setupEditing.item ? 'Save Changes' : 'Create') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═════════════════════ WORKERS & SUBCONTRACTORS ═════════════════════ -->
    <div v-if="activeTab === 'people'">
      <div class="flex gap-2 mt-6 mb-4 flex-wrap items-center">
        <button :class="['btn-secondary', peopleSubtab === 'subcontractors' ? 'font-semibold' : '']" @click="peopleSubtab = 'subcontractors'">Subcontractors</button>
        <button :class="['btn-secondary', peopleSubtab === 'workers' ? 'font-semibold' : '']" @click="peopleSubtab = 'workers'">Workers</button>
        <button @click="exportWorkersSubsToExcel" :disabled="xlsxExportingWorkersSubs"
          class="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          {{ xlsxExportingWorkersSubs ? 'Exporting...' : 'Export Excel' }}
        </button>
        <button v-if="isOwnerOrAdmin" @click="openWsImportModal" class="btn-secondary text-sm flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 8l-3-3m3 3l3-3"/></svg>
          Import
        </button>
      </div>

      <!-- ─── Subcontractors ─── -->
      <div v-if="peopleSubtab === 'subcontractors'" class="mt-4">
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <button @click="openSubModal()" class="btn-primary text-sm">+ New Subcontractor</button>
          <select v-model="subPackageFilter" class="input-field text-sm" style="width:auto;min-width:180px">
            <option :value="null">All packages</option>
            <option v-for="p in eligiblePackages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
          </select>
          <span class="ml-auto text-xs text-gray-500">{{ filteredSubcontractors.length }} subcontractor(s)</span>
        </div>
        <div class="card p-0 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th class="text-left px-3 py-2 w-28">ID</th>
                <th class="text-left px-3 py-2 w-28">Package</th>
                <th class="text-left px-3 py-2">Company</th>
                <th class="text-left px-3 py-2">Contact</th>
                <th class="text-left px-3 py-2 w-36">Phone</th>
                <th class="text-left px-3 py-2">Email</th>
                <th class="text-left px-3 py-2">Scope</th>
                <th class="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in filteredSubcontractors" :key="s.id" @click="openSubModal(s)" class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                <td class="px-3 py-1.5 text-xs text-gray-400 font-mono whitespace-nowrap">{{ s.display_id }}</td>
                <td class="px-3 py-1.5">
                  <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ s.package_tag }}</span>
                </td>
                <td class="px-3 py-1.5 font-medium text-gray-800">{{ s.company }}</td>
                <td class="px-3 py-1.5 text-gray-600">{{ s.contact_person || '—' }}</td>
                <td class="px-3 py-1.5 text-gray-600 whitespace-nowrap">{{ s.phone || '—' }}</td>
                <td class="px-3 py-1.5 text-gray-600 truncate max-w-[14rem]" :title="s.email">{{ s.email || '—' }}</td>
                <td class="px-3 py-1.5 text-gray-500 truncate max-w-[20rem]" :title="s.description">{{ s.description || '—' }}</td>
                <td class="px-3 py-1.5 text-right whitespace-nowrap" @click.stop>
                  <button @click="openSubModal(s)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button @click="deleteSub(s)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </td>
              </tr>
              <tr v-if="filteredSubcontractors.length === 0"><td colspan="8" class="px-4 py-8 text-center text-gray-400">No subcontractors yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ─── Workers ─── -->
      <div v-if="peopleSubtab === 'workers'" class="mt-4">
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <button @click="openWorkerModal()" class="btn-primary text-sm">+ New Worker</button>
          <select v-model="workerPackageFilter" class="input-field text-sm" style="width:auto;min-width:180px">
            <option :value="null">All packages</option>
            <option v-for="p in eligiblePackages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
          </select>
          <span class="ml-auto text-xs text-gray-500">{{ filteredWorkers.length }} worker(s)</span>
        </div>
        <div class="card p-0 overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th class="text-left px-3 py-2 w-28">ID</th>
                <th class="text-left px-3 py-2 w-28">Package</th>
                <th class="text-left px-3 py-2">Name</th>
                <th class="text-left px-3 py-2 w-36">Phone</th>
                <th class="text-left px-3 py-2">Employer</th>
                <th class="text-left px-3 py-2">Certificates</th>
                <th class="text-left px-3 py-2 w-28">Status</th>
                <th class="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in filteredWorkers" :key="w.id" @click="openWorkerModal(w)" class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                <td class="px-3 py-1.5 text-xs text-gray-400 font-mono whitespace-nowrap">{{ w.display_id }}</td>
                <td class="px-3 py-1.5">
                  <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ w.package_tag }}</span>
                </td>
                <td class="px-3 py-1.5 font-medium text-gray-800">{{ w.name }}</td>
                <td class="px-3 py-1.5 text-gray-600 whitespace-nowrap">{{ w.phone || '—' }}</td>
                <td class="px-3 py-1.5 text-gray-600">
                  <span v-if="w.is_subcontractor" class="text-xs text-blue-700">{{ w.subcontractor_company || '—' }}</span>
                  <span v-else class="text-xs text-gray-400 italic">Direct</span>
                </td>
                <td class="px-3 py-1.5 text-gray-600">
                  <div v-if="(w.certificates || []).length === 0" class="text-gray-300">—</div>
                  <div v-else class="flex flex-wrap gap-1">
                    <span v-for="c in w.certificates" :key="c.id"
                      class="inline-block px-2 py-0.5 rounded-full text-[11px] bg-green-50 text-green-700 border border-green-200">{{ c.name }}</span>
                  </div>
                </td>
                <td class="px-3 py-1.5 whitespace-nowrap">
                  <span :class="['inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold', statusBadgeClass(w.status || 'PENDING')]">{{ w.status || 'PENDING' }}</span>
                </td>
                <td class="px-3 py-1.5 text-right whitespace-nowrap" @click.stop>
                  <button @click="openWorkerHistory(w)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Review history">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  </button>
                  <button @click="openWorkerModal(w)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button @click="deleteWorker(w)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </td>
              </tr>
              <tr v-if="filteredWorkers.length === 0"><td colspan="8" class="px-4 py-8 text-center text-gray-400">No workers yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ═════════════════════ WORKER APPROVALS ═════════════════════ -->
    <div v-if="activeTab === 'approvals'">
      <div class="flex flex-wrap items-center gap-2 mt-6 mb-3">
        <p class="text-sm text-gray-500">Workers waiting for site-supervisor review. Approve authorises them to work; reject requires a comment.</p>
        <select v-model="approvalPackageFilter" class="input-field text-sm ml-auto" style="width:auto;min-width:180px">
          <option :value="null">All packages</option>
          <option v-for="p in approvalFilterPackages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
        </select>
        <span class="text-xs text-gray-500">{{ filteredApprovalWorkers.length }} pending</span>
      </div>
      <div class="card p-0 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
            <tr>
              <th class="text-left px-3 py-2 w-28">ID</th>
              <th class="text-left px-3 py-2 w-28">Package</th>
              <th class="text-left px-3 py-2">Name</th>
              <th class="text-left px-3 py-2 w-36">Phone</th>
              <th class="text-left px-3 py-2">Employer</th>
              <th class="text-left px-3 py-2">Certificates</th>
              <th class="text-left px-3 py-2 w-44">Submitted</th>
              <th class="px-3 py-2 w-52"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="w in filteredApprovalWorkers" :key="w.id" class="border-b border-gray-100 hover:bg-gray-50">
              <td class="px-3 py-1.5 text-xs text-gray-400 font-mono whitespace-nowrap">{{ w.display_id }}</td>
              <td class="px-3 py-1.5">
                <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ w.package_tag }}</span>
              </td>
              <td class="px-3 py-1.5 font-medium text-gray-800">{{ w.name }}</td>
              <td class="px-3 py-1.5 text-gray-600 whitespace-nowrap">{{ w.phone || '—' }}</td>
              <td class="px-3 py-1.5 text-gray-600">
                <span v-if="w.is_subcontractor" class="text-xs text-blue-700">{{ w.subcontractor_company || '—' }}</span>
                <span v-else class="text-xs text-gray-400 italic">Direct</span>
              </td>
              <td class="px-3 py-1.5 text-gray-600">
                <div v-if="(w.certificates || []).length === 0" class="text-gray-300">—</div>
                <div v-else class="flex flex-wrap gap-1">
                  <span v-for="c in w.certificates" :key="c.id"
                    class="inline-block px-2 py-0.5 rounded-full text-[11px] bg-green-50 text-green-700 border border-green-200">{{ c.name }}</span>
                </div>
              </td>
              <td class="px-3 py-1.5 text-xs text-gray-500 whitespace-nowrap">{{ fmtDate(w.submitted_at) || '—' }}</td>
              <td class="px-3 py-1.5 text-right whitespace-nowrap">
                <button @click="approveWorker(w)" class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-100 text-green-700 hover:bg-green-200 text-xs font-semibold" title="Approve">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  Approve
                </button>
                <button @click="openRejectModal(w)" class="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-100 text-red-700 hover:bg-red-200 text-xs font-semibold" title="Reject">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                  Reject
                </button>
                <span v-if="isOwnerOrAdmin" class="ml-2 text-[10px] uppercase tracking-wider text-gray-400">Override</span>
                <button v-if="isOwnerOrAdmin" @click="openOverrideModal(w, true)"
                  class="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-green-300 text-green-700 hover:bg-green-50 text-xs font-semibold"
                  title="Override — approve directly">
                  Approve
                </button>
                <button v-if="isOwnerOrAdmin" @click="openOverrideModal(w, false)"
                  class="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold"
                  title="Override — reject directly">
                  Reject
                </button>
                <button @click="openWorkerHistory(w)" class="ml-1 btn-icon text-gray-400 hover:text-ips-blue" title="Review history">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </button>
                <button @click="openWorkerModal(w)" class="ml-1 btn-icon text-gray-400 hover:text-ips-blue" title="Open details">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                </button>
              </td>
            </tr>
            <tr v-if="filteredApprovalWorkers.length === 0">
              <td colspan="8" class="px-4 py-10 text-center text-gray-400 text-sm">No workers waiting for approval.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Workers/Subcontractors import modal (mirrors the Risk Register import) -->
    <div v-if="showWsImportModal" class="modal-overlay" @click.self="showWsImportModal = false">
      <div class="modal-box" style="max-width:900px">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">Import Workers &amp; Subcontractors from Excel</h3>
          <button @click="showWsImportModal = false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body space-y-4">
          <div v-if="wsImportResult" class="rounded-lg p-4 bg-green-50 border border-green-200 text-sm text-green-800 space-y-1">
            <p class="font-semibold">Import completed successfully.</p>
            <p>Created: <strong>{{ wsImportResult.created }}</strong> &nbsp; Updated: <strong>{{ wsImportResult.updated }}</strong> &nbsp; Skipped: <strong>{{ wsImportResult.skipped }}</strong></p>
          </div>
          <div v-if="!wsImportPreview && !wsImportResult" class="space-y-3">
            <p class="text-sm text-gray-600">Upload an Excel file (.xlsx) with two sheets — <strong>Subcontractors</strong> and <strong>Workers</strong> — to import. Download the template first to see the expected format and available package tags.</p>
            <div class="flex items-center gap-3 flex-wrap">
              <button @click="exportWorkersSubsXlsx" class="btn-secondary text-sm flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 8l-3-3m3 3l3-3"/></svg>
                Export / Download Template
              </button>
              <label class="btn-secondary text-sm cursor-pointer flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                Choose File
                <input type="file" accept=".xlsx" class="hidden" @change="onWsImportFileChange" />
              </label>
              <span v-if="wsImportFile" class="text-sm text-gray-600">{{ wsImportFile.name }}</span>
            </div>
            <p v-if="wsImportError" class="text-red-500 text-sm">{{ wsImportError }}</p>
            <p class="text-xs text-gray-400">Unique key: <strong>ID</strong> column on each sheet. Leave blank to create; fill in an existing ID to update. A worker may reference a subcontractor being created in the Subcontractors sheet of the same file — match by company name on the same package.</p>
          </div>
          <div v-if="wsImportPreview && !wsImportResult" class="space-y-3">
            <div class="flex items-center gap-4 text-sm flex-wrap">
              <span class="px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium">{{ wsImportPreview.summary.creates }} to create</span>
              <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">{{ wsImportPreview.summary.updates }} to update</span>
              <span v-if="wsImportPreview.summary.errors > 0" class="px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium">{{ wsImportPreview.summary.errors }} error(s)</span>
            </div>
            <p v-if="wsImportError" class="text-red-500 text-sm">{{ wsImportError }}</p>
            <div class="overflow-x-auto max-h-96 border rounded">
              <table class="w-full text-xs">
                <thead class="bg-gray-100 sticky top-0">
                  <tr>
                    <th class="px-2 py-1 text-left">Row</th>
                    <th class="px-2 py-1 text-left">Kind</th>
                    <th class="px-2 py-1 text-left">Action</th>
                    <th class="px-2 py-1 text-left">ID</th>
                    <th class="px-2 py-1 text-left">Package</th>
                    <th class="px-2 py-1 text-left">Company / Name</th>
                    <th class="px-2 py-1 text-left">Detail</th>
                    <th class="px-2 py-1 text-left">Errors / Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(r, idx) in wsImportPreview.rows" :key="r.kind + '-' + r.row_num + '-' + idx"
                    :class="r.errors.length ? 'bg-red-50' : r.warnings.length ? 'bg-yellow-50' : ''">
                    <td class="px-2 py-1 text-gray-500">{{ r.row_num }}</td>
                    <td class="px-2 py-1">
                      <span :class="['px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase',
                                     r.kind === 'subcontractor' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700']">
                        {{ r.kind === 'subcontractor' ? 'Subcontractor' : 'Worker' }}
                      </span>
                    </td>
                    <td class="px-2 py-1"><span :class="r.action==='CREATE' ? 'text-green-700 font-semibold' : 'text-blue-700 font-semibold'">{{ r.action }}</span></td>
                    <td class="px-2 py-1 text-gray-500">{{ r.id || '—' }}</td>
                    <td class="px-2 py-1">{{ r.package_tag || '—' }}</td>
                    <td class="px-2 py-1 max-w-xs truncate" :title="r.kind === 'subcontractor' ? r.company : r.name">
                      {{ r.kind === 'subcontractor' ? r.company : r.name }}
                    </td>
                    <td class="px-2 py-1 text-gray-600 max-w-xs truncate">
                      <template v-if="r.kind === 'subcontractor'">
                        {{ [r.contact_person, r.phone, r.email].filter(Boolean).join(' · ') || '—' }}
                      </template>
                      <template v-else>
                        <span v-if="r.is_subcontractor" class="text-blue-700">{{ r.subcontractor_company || '—' }}</span>
                        <span v-else class="text-gray-500">Vendor-employed</span>
                        <span v-if="r.phone" class="ml-1 text-gray-500">· {{ r.phone }}</span>
                      </template>
                    </td>
                    <td class="px-2 py-1">
                      <span v-for="e in r.errors" :key="e" class="block text-red-600">{{ e }}</span>
                      <span v-for="w in r.warnings" :key="w" class="block text-yellow-700">{{ w }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button v-if="!wsImportResult" @click="resetWsImport" class="btn-secondary">{{ wsImportPreview ? 'Back' : 'Cancel' }}</button>
          <button v-if="wsImportResult" @click="closeWsImportAndRefresh" class="btn-primary">Close &amp; Refresh</button>
          <button v-if="!wsImportPreview && !wsImportResult && wsImportFile" @click="runWsImportPreview"
            :disabled="wsImportLoading" class="btn-primary">
            {{ wsImportLoading ? 'Analysing...' : 'Preview Import' }}
          </button>
          <button v-if="wsImportPreview && !wsImportResult && wsImportPreview.summary.errors === 0"
            @click="applyWsImport" :disabled="wsImportApplying" class="btn-primary">
            {{ wsImportApplying ? 'Applying...' : 'Confirm &amp; Apply' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Worker review-history modal (mirrors the Invoice history modal) -->
    <div v-if="historyWorker" class="modal-overlay" @click.self="closeWorkerHistory" style="z-index:120">
      <div class="modal-box" style="max-width:560px">
        <div class="modal-header">
          <div>
            <p class="text-xs font-mono text-gray-400">Worker {{ historyWorker.display_id }}</p>
            <h3 class="text-lg font-semibold text-gray-800">Review History</h3>
          </div>
          <button @click="closeWorkerHistory" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto">
          <div v-if="workerHistoryLoading" class="text-center py-6 text-gray-400">
            <img src="/static/assets/impulse-loader.svg" class="h-6 mx-auto" alt="Loading"/>
          </div>
          <div v-else-if="workerHistory.length === 0" class="text-center py-6 text-gray-400 text-sm">No review events recorded yet.</div>
          <ol v-else class="relative border-l-2 border-gray-200 ml-3 space-y-4 pl-5">
            <li v-for="h in workerHistory" :key="h.id" class="relative">
              <span class="absolute -left-[29px] top-1 w-3 h-3 rounded-full border-2 border-white"
                :class="h.event === 'APPROVE' ? 'bg-green-500' : (h.event === 'REJECT' ? 'bg-red-500' : 'bg-blue-500')"></span>
              <div class="flex items-center gap-2 flex-wrap">
                <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', eventBadgeClass(h.event, h.approved)]">{{ eventLabel(h.event) }}</span>
                <span class="text-xs text-gray-500">{{ fmtDate(h.created_at) }}</span>
              </div>
              <p class="text-xs text-gray-600 mt-1">by <span class="font-medium">{{ h.actor_name || '—' }}</span></p>
              <p v-if="h.comment" class="text-sm text-gray-700 italic mt-1 bg-gray-50 rounded p-2 whitespace-pre-line">{{ h.comment }}</p>
            </li>
          </ol>
        </div>
        <div class="modal-footer">
          <button @click="closeWorkerHistory" class="btn-secondary">Close</button>
        </div>
      </div>
    </div>

    <!-- Override modal (admins / project owners only) -->
    <div v-if="overrideModalWorker" class="modal-overlay" @click.self="closeOverrideModal" style="z-index:130">
      <div class="modal-box" style="max-width:520px">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">
            Override — {{ overrideApproved ? 'Approve' : 'Reject' }} worker
            <span class="text-sm text-gray-500 font-normal ml-1">· {{ overrideModalWorker.display_id }} · {{ overrideModalWorker.name }}</span>
          </h3>
          <button @click="closeOverrideModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body space-y-3">
          <p class="text-sm text-gray-600">
            Override the site-supervisor review. The worker will be set to
            <strong>{{ overrideApproved ? 'APPROVED' : 'REJECTED' }}</strong>.
            The decision and the comment below are recorded in the review history.
          </p>
          <div>
            <label class="form-label">Reason (optional)</label>
            <textarea v-model="overrideComment" class="input-field" rows="4"
              placeholder="Why are you overriding the supervisor's review?"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeOverrideModal" class="btn-secondary">Cancel</button>
          <button @click="submitOverride" :disabled="overrideSaving"
            :class="['px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 text-white',
                     overrideApproved ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700']">
            {{ overrideSaving ? 'Saving…' : (overrideApproved ? 'Confirm Approve' : 'Confirm Reject') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Reject-comment modal -->
    <div v-if="rejectModalWorker" class="modal-overlay" @click.self="closeRejectModal" style="z-index:130">
      <div class="modal-box" style="max-width:520px">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">
            Reject worker — {{ rejectModalWorker.display_id }} · {{ rejectModalWorker.name }}
          </h3>
          <button @click="closeRejectModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body space-y-3">
          <p class="text-sm text-gray-600">Please explain what needs to be fixed. The vendor will see this in their My Action Points.</p>
          <textarea v-model="rejectComment" class="input-field" rows="5" placeholder="Reason for rejection..."></textarea>
        </div>
        <div class="modal-footer">
          <button @click="closeRejectModal" class="btn-secondary">Cancel</button>
          <button @click="submitReject" :disabled="rejectSaving || !rejectComment.trim()"
            class="btn-primary" style="background:#dc2626;border-color:#dc2626">
            {{ rejectSaving ? 'Rejecting…' : 'Reject worker' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ═════════════════════ DAILY REPORTS ═════════════════════ -->
    <div v-if="activeTab === 'daily'">
      <div class="flex flex-wrap items-center gap-2 mt-6 mb-3">
        <button @click="openReportModal()" class="btn-primary text-sm">+ New Daily Report</button>
        <select v-model="reportPackageFilter" class="input-field text-sm" style="width:auto;min-width:180px">
          <option :value="null">All packages</option>
          <option v-for="p in eligiblePackages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
        </select>
        <select v-model="reportAreaFilter" class="input-field text-sm" style="width:auto;min-width:180px">
          <option :value="null">All areas</option>
          <option v-for="a in projectAreas" :key="a.id" :value="a.id">{{ a.tag }} — {{ a.description }}</option>
        </select>
        <span class="ml-auto text-xs text-gray-500">{{ filteredDailyReports.length }} report(s)</span>
        <button @click="exportDailyReportsToExcel" :disabled="xlsxExportingDaily"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          {{ xlsxExportingDaily ? 'Exporting...' : 'Export Excel' }}
        </button>
      </div>
      <div class="card p-0 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
            <tr>
              <th class="text-left px-3 py-2 w-28">Date</th>
              <th class="text-left px-3 py-2 w-28">Package</th>
              <th class="text-left px-3 py-2 w-20">Workers</th>
              <th class="text-left px-3 py-2 w-20">Avg h</th>
              <th class="text-left px-3 py-2 w-20">Total h</th>
              <th class="text-left px-3 py-2">Areas</th>
              <th class="text-left px-3 py-2">Description</th>
              <th class="text-left px-3 py-2 w-28">Declared by</th>
              <th class="text-left px-3 py-2 w-24">Status</th>
              <th class="px-3 py-2 w-28"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredDailyReports" :key="r.id" @click="openReportModal(r)"
              class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
              <td class="px-3 py-1.5 text-gray-700 whitespace-nowrap">{{ r.report_date }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap">
                <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ r.package_tag }}</span>
              </td>
              <td class="px-3 py-1.5 text-gray-700">
                <span v-if="r.no_work" class="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">No work</span>
                <span v-else>{{ (r.workers || []).length }}</span>
              </td>
              <td class="px-3 py-1.5 text-gray-700">{{ r.avg_hours_per_worker || 0 }}</td>
              <td class="px-3 py-1.5 text-gray-700 font-semibold">{{ r.total_hours || 0 }}</td>
              <td class="px-3 py-1.5 text-gray-600">
                <div v-if="(r.areas || []).length === 0" class="text-gray-300 text-xs">—</div>
                <div v-else class="flex flex-wrap gap-1">
                  <span v-for="a in r.areas" :key="a.id" class="inline-block px-2 py-0.5 rounded text-[11px] font-bold text-white" style="background:#1B4F8C">{{ a.tag }}</span>
                </div>
              </td>
              <td class="px-3 py-1.5 text-gray-500 truncate max-w-[20rem]" :title="r.description">{{ r.description || '—' }}</td>
              <td class="px-3 py-1.5 text-xs text-gray-500">{{ r.created_by_name || '—' }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap">
                <span v-if="r.locked" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c-1.104 0-2 .896-2 2s.896 2 2 2 2-.896 2-2-.896-2-2-2zm6-4V6a6 6 0 10-12 0v1H4v13h16V7h-2zM8 6a4 4 0 118 0v1H8V6z"/></svg>
                  Locked
                </span>
                <span v-else class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/></svg>
                  Re-opened
                </span>
              </td>
              <td class="px-3 py-1.5 text-right whitespace-nowrap" @click.stop>
                <button v-if="r.locked && canUnlockReports"
                  @click="openUnlockModal(r)"
                  class="btn-icon text-gray-400 hover:text-amber-600" title="Re-open for editing">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/></svg>
                </button>
                <button @click="deleteReport(r)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </td>
            </tr>
            <tr v-if="filteredDailyReports.length === 0"><td colspan="10" class="px-4 py-8 text-center text-gray-400">No daily reports yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ─── Daily report modal ─── -->
    <div v-if="showReportModal" class="modal-overlay" @click.self="showReportModal = false">
      <div class="modal-box modal-xl" style="height:92vh;max-height:92vh;display:flex;flex-direction:column">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">
            {{ editingReport ? 'Edit Daily Report' : 'New Daily Report' }}
            <span v-if="reportForm.report_date" class="text-sm text-gray-500 font-normal ml-2">· {{ reportForm.report_date }}</span>
          </h3>
          <button @click="showReportModal = false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body space-y-3 overflow-y-auto flex flex-col" style="padding:20px 24px">
          <!-- Lock banner -->
          <div v-if="editingReport && editingReport.locked"
            class="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 flex items-start gap-2">
            <svg class="w-4 h-4 mt-0.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c-1.104 0-2 .896-2 2s.896 2 2 2 2-.896 2-2-.896-2-2-2zm6-4V6a6 6 0 10-12 0v1H4v13h16V7h-2zM8 6a4 4 0 118 0v1H8V6z"/></svg>
            <div class="text-xs text-gray-700">
              This daily report is <strong>locked</strong> and view-only.
              <template v-if="canUnlockReports">Use the <em>Re-open for editing</em> button below if corrections are needed.</template>
              <template v-else>Ask a project owner, admin or site supervisor to re-open it if corrections are needed.</template>
            </div>
          </div>
          <div v-if="editingReport && !editingReport.locked && editingReport.unlocked_at"
            class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
            <svg class="w-4 h-4 mt-0.5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/></svg>
            <div class="text-xs text-amber-800">
              Re-opened by <strong>{{ editingReport.unlocked_by_name || '—' }}</strong> · {{ fmtDate(editingReport.unlocked_at) }}
              <div v-if="editingReport.unlock_comment" class="mt-1 text-amber-900">“{{ editingReport.unlock_comment }}”</div>
              <div class="mt-1">Saving will re-lock this report.</div>
            </div>
          </div>

          <!-- Top row: package, date, avg hours, total hours, no-work shortcut -->
          <div class="grid grid-cols-4 gap-3">
            <div>
              <label class="form-label">Package <span class="text-red-500">*</span></label>
              <select v-model="reportForm.package_id" :disabled="!!editingReport || reportFormReadOnly" class="input-field">
                <option :value="null">— Select —</option>
                <option v-for="p in eligiblePackages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
              </select>
            </div>
            <div>
              <label class="form-label">Date <span class="text-red-500">*</span></label>
              <input v-model="reportForm.report_date" :disabled="!!editingReport || reportFormReadOnly" type="date" class="input-field"/>
            </div>
            <div>
              <label class="form-label">Avg hours per worker</label>
              <input v-model.number="reportForm.avg_hours_per_worker" :disabled="reportFormReadOnly" type="number" min="0" step="0.5" class="input-field"/>
            </div>
            <div>
              <label class="form-label">Total hours</label>
              <div class="input-field bg-gray-50 font-semibold text-gray-700">{{ reportTotalHours }}</div>
            </div>
          </div>

          <div>
            <button type="button" @click="reportMarkNoWork" :disabled="reportFormReadOnly"
              class="text-xs font-semibold px-3 py-1 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">
              Declare no works done
            </button>
            <span v-if="reportForm.no_work" class="ml-2 text-xs text-gray-500 italic">No-work report — no workers / areas / description required.</span>
          </div>

          <!-- Side-by-side multi-selects -->
          <div class="grid grid-cols-2 gap-4 flex-1 min-h-0">
            <!-- Workers (left column) -->
            <div class="flex flex-col min-h-0">
              <div class="flex items-center justify-between mb-1">
                <label class="form-label mb-0">
                  Workers on site
                  <span v-if="!reportForm.no_work && reportForm.avg_hours_per_worker > 0" class="text-red-500">*</span>
                </label>
                <button type="button" @click="reportToggleAllWorkers" :disabled="reportFormReadOnly"
                  class="text-xs text-ips-blue hover:underline disabled:opacity-50 disabled:cursor-not-allowed">
                  {{ reportAllWorkersSelected ? 'Deselect all' : 'Select all' }}
                </button>
              </div>
              <div class="border border-gray-200 rounded-lg overflow-y-auto divide-y divide-gray-100 flex-1 min-h-0">
                <div v-if="reportEligibleWorkers.length === 0" class="px-3 py-4 text-xs text-gray-400 text-center">
                  <template v-if="!reportForm.package_id">Select a package first.</template>
                  <template v-else>No approved workers on this package yet.</template>
                </div>
                <label v-for="w in reportEligibleWorkers" :key="w.id"
                  class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm whitespace-nowrap"
                  :class="reportFormReadOnly ? 'opacity-60 cursor-not-allowed' : ''">
                  <input type="checkbox" :value="w.id" v-model="reportForm.worker_ids" :disabled="reportFormReadOnly" class="rounded"/>
                  <span class="text-gray-800 truncate">{{ w.name }}</span>
                  <span class="ml-auto text-xs text-gray-400">{{ w.display_id }}</span>
                </label>
              </div>
              <div class="mt-1 text-xs text-gray-500">{{ (reportForm.worker_ids || []).length }} / {{ reportEligibleWorkers.length }} selected</div>
            </div>

            <!-- Areas (right column) -->
            <div class="flex flex-col min-h-0">
              <div class="flex items-center justify-between mb-1">
                <label class="form-label mb-0">
                  Areas worked in
                  <span v-if="!reportForm.no_work && reportForm.avg_hours_per_worker > 0" class="text-red-500">*</span>
                </label>
                <button type="button" @click="reportToggleAllAreas" :disabled="reportFormReadOnly"
                  class="text-xs text-ips-blue hover:underline disabled:opacity-50 disabled:cursor-not-allowed">
                  {{ reportAllAreasSelected ? 'Deselect all' : 'Select all' }}
                </button>
              </div>
              <div class="border border-gray-200 rounded-lg overflow-y-auto divide-y divide-gray-100 flex-1 min-h-0">
                <div v-if="projectAreas.length === 0" class="px-3 py-4 text-xs text-gray-400 text-center">
                  No areas defined on this project yet.
                </div>
                <label v-for="a in projectAreas" :key="a.id"
                  class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm whitespace-nowrap"
                  :class="reportFormReadOnly ? 'opacity-60 cursor-not-allowed' : ''">
                  <input type="checkbox" :value="a.id" v-model="reportForm.area_ids" :disabled="reportFormReadOnly" class="rounded"/>
                  <span class="inline-block px-2 py-0.5 rounded text-[11px] font-bold text-white" style="background:#1B4F8C">{{ a.tag }}</span>
                  <span class="text-gray-800 truncate">{{ a.description }}</span>
                </label>
              </div>
              <div class="mt-1 text-xs text-gray-500">{{ (reportForm.area_ids || []).length }} / {{ projectAreas.length }} selected</div>
            </div>
          </div>

          <div>
            <label class="form-label">
              Description of works performed
              <span v-if="!reportForm.no_work && reportForm.avg_hours_per_worker > 0" class="text-red-500">*</span>
            </label>
            <textarea v-model="reportForm.description" :disabled="reportFormReadOnly" class="input-field" rows="3" placeholder="Summary of the works performed..."></textarea>
          </div>

          <p v-if="reportError" class="text-red-500 text-sm">{{ reportError }}</p>
        </div>
        <div class="modal-footer">
          <button v-if="editingReport && editingReport.locked && canUnlockReports"
            @click="openUnlockModal(editingReport)"
            class="btn-secondary" style="border-color:#f59e0b;color:#b45309">Re-open for editing</button>
          <button @click="showReportModal = false" class="btn-secondary">{{ reportFormReadOnly ? 'Close' : 'Cancel' }}</button>
          <button v-if="!reportFormReadOnly" @click="saveReport" :disabled="reportSaving" class="btn-primary">
            {{ reportSaving ? 'Saving…' : (editingReport ? 'Save Changes' : 'Submit Report') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ─── Unlock confirmation modal ─── -->
    <div v-if="showUnlockModal" class="modal-overlay" @click.self="closeUnlockModal">
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">Re-open daily report</h3>
          <button @click="closeUnlockModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body space-y-3">
          <p class="text-sm text-gray-600">
            This will allow the vendor to edit the report for
            <strong v-if="unlockTargetReport">{{ unlockTargetReport.package_tag }} — {{ unlockTargetReport.report_date }}</strong>.
            Their next save will re-lock it automatically.
          </p>
          <div>
            <label class="form-label">Comment (optional)</label>
            <textarea v-model="unlockComment" class="input-field" rows="3" placeholder="Why is this report being re-opened?"></textarea>
          </div>
          <p v-if="unlockError" class="text-red-500 text-sm">{{ unlockError }}</p>
        </div>
        <div class="modal-footer">
          <button @click="closeUnlockModal" class="btn-secondary">Cancel</button>
          <button @click="submitUnlock" :disabled="unlockSaving" class="btn-primary"
            style="background:#f59e0b;border-color:#f59e0b">
            {{ unlockSaving ? 'Re-opening…' : 'Re-open report' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ═════════════════════ WORK PERMITS ═════════════════════ -->
    <div v-if="activeTab === 'permits'">
      <div class="flex flex-wrap items-center gap-2 mt-6 mb-3">
        <button v-if="eligiblePermitPackages.length"
                @click="openPermitModal()" class="btn-primary text-sm">+ New Work Permit</button>
        <select v-model="permitPackageFilter" class="input-field text-sm" style="width:auto;min-width:180px">
          <option :value="null">All packages</option>
          <option v-for="p in eligiblePermitPackages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
        </select>
        <select v-model="permitAreaFilter" class="input-field text-sm" style="width:auto;min-width:180px">
          <option :value="null">All areas</option>
          <option v-for="a in projectAreas" :key="a.id" :value="a.id">{{ a.tag }} — {{ a.description }}</option>
        </select>
        <select v-model="permitStatusFilter" class="input-field text-sm" style="width:auto;min-width:150px">
          <option :value="null">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING">Pending approval</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CLOSED">Closed</option>
        </select>
        <span class="ml-auto text-xs text-gray-500">{{ filteredWorkPermits.length }} permit(s)</span>
        <button @click="exportWorkPermitsToExcel" :disabled="xlsxExportingPermits"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          {{ xlsxExportingPermits ? 'Exporting...' : 'Export Excel' }}
        </button>
      </div>
      <div class="card p-0 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
            <tr>
              <th class="text-left px-3 py-2 w-28">Permit</th>
              <th class="text-left px-3 py-2 w-28">Package</th>
              <th class="text-left px-3 py-2 w-28">Start</th>
              <th class="text-left px-3 py-2 w-28">Finish</th>
              <th class="text-left px-3 py-2">Title</th>
              <th class="text-left px-3 py-2">Permit types</th>
              <th class="text-left px-3 py-2">Areas</th>
              <th class="text-left px-3 py-2 w-28">LOTO</th>
              <th class="text-left px-3 py-2 w-32">Status</th>
              <th class="text-left px-3 py-2 w-32">Declared by</th>
              <th class="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filteredWorkPermits" :key="p.id" @click="openPermitModal(p)"
              class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
              <td class="px-3 py-1.5 font-mono text-gray-700 whitespace-nowrap">{{ p.display_id }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap">
                <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ p.package_tag }}</span>
              </td>
              <td class="px-3 py-1.5 text-gray-700 whitespace-nowrap">{{ p.start_date }}</td>
              <td class="px-3 py-1.5 text-gray-700 whitespace-nowrap">{{ p.end_date }}</td>
              <td class="px-3 py-1.5 text-gray-800 font-medium truncate max-w-[18rem]" :title="p.description || ''">{{ p.title || '—' }}</td>
              <td class="px-3 py-1.5 text-gray-600">
                <div v-if="(p.permit_types || []).length === 0" class="text-gray-300 text-xs">—</div>
                <div v-else class="flex flex-wrap gap-1">
                  <span v-for="pt in p.permit_types" :key="pt.id"
                    class="inline-block px-2 py-0.5 rounded text-[11px] bg-blue-50 text-blue-700 border border-blue-200">{{ pt.name }}</span>
                </div>
              </td>
              <td class="px-3 py-1.5 text-gray-600">
                <div v-if="(p.areas || []).length === 0" class="text-gray-300 text-xs">—</div>
                <div v-else class="flex flex-wrap gap-1">
                  <span v-for="a in p.areas" :key="a.id" class="inline-block px-2 py-0.5 rounded text-[11px] font-bold text-white" style="background:#1B4F8C">{{ a.tag }}</span>
                </div>
              </td>
              <td class="px-3 py-1.5 whitespace-nowrap">
                <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border', permitLotoStatusStyle(permitLotoStatus(p))]">
                  {{ permitLotoStatus(p) }}
                </span>
              </td>
              <td class="px-3 py-1.5 whitespace-nowrap">
                <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border', permitStatusStyle(p.status || 'DRAFT')]">
                  {{ permitStatusLabel(p.status || 'DRAFT') }}
                </span>
              </td>
              <td class="px-3 py-1.5 text-xs text-gray-500">{{ p.created_by_name || '—' }}</td>
              <td class="px-3 py-1.5 text-right whitespace-nowrap" @click.stop>
                <button @click="deletePermit(p)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </td>
            </tr>
            <tr v-if="filteredWorkPermits.length === 0"><td colspan="11" class="px-4 py-8 text-center text-gray-400">No work permits yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ─── Work permit modal ─── -->
    <div v-if="showPermitModal" class="modal-overlay" @click.self="showPermitModal = false">
      <div class="modal-box modal-xl" style="height:94vh;max-height:94vh;display:flex;flex-direction:column">
        <div class="modal-header">
          <div class="flex items-center gap-3 flex-wrap">
            <h3 class="text-lg font-semibold text-gray-800">
              {{ editingPermit ? ('Work Permit ' + editingPermit.display_id) : 'New Work Permit' }}
            </h3>
            <span v-if="editingPermit"
              :class="['inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border', permitStatusStyle(permitFormStatus)]">
              {{ permitStatusLabel(permitFormStatus) }}
            </span>
            <span v-if="editingPermit && currentPermit && currentPermit.pending_kind === 'EXTEND' && permitFormStatus === 'PENDING'"
              class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-amber-50 text-amber-700 border-amber-200">
              Extension
            </span>
            <button v-if="editingPermit" type="button" @click="openPermitHistory"
              class="text-xs text-gray-500 hover:text-ips-blue underline decoration-dotted">
              History
            </button>
          </div>
          <button @click="showPermitModal = false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body overflow-y-auto flex-1 space-y-4" style="padding:20px 24px">

          <!-- Status banner / area approval panel -->
          <div v-if="editingPermit && permitFormStatus !== 'DRAFT'"
            :class="['rounded-md border px-3 py-2', permitStatusStyle(permitFormStatus)]">
            <div class="flex items-start gap-2 text-xs">
              <div class="flex-1">
                <template v-if="permitFormStatus === 'PENDING'">
                  <strong v-if="currentPermit && currentPermit.pending_kind === 'EXTEND'">
                    Extension request — pending site-supervisor approval.
                  </strong>
                  <strong v-else>Pending site-supervisor approval.</strong>
                  Submitted
                  <span v-if="currentPermit && currentPermit.submitted_at">{{ fmtDate(currentPermit.submitted_at) }}</span>
                  <span v-if="currentPermit && currentPermit.submitted_by_name"> by {{ currentPermit.submitted_by_name }}</span>.
                  <template v-if="permitInLotoDeadlock">
                    <br/><strong class="text-red-700">At least one LOTO was refused.</strong>
                    Supervisors can't approve until the LOTOs are resolved — update the LOTOs below (or any other field) and resubmit.
                  </template>
                  <template v-else>
                    The permit is locked until every area is approved or one is rejected.
                  </template>
                </template>
                <template v-else-if="permitFormStatus === 'APPROVED'">
                  <strong>Approved.</strong> All area supervisors released this permit.
                  <span v-if="permitCanCloseOrExtend">
                    Use the buttons at the bottom to <em>Close</em> the permit when the work is finished, or <em>Request Extension</em> if more time is needed.
                  </span>
                </template>
                <template v-else-if="permitFormStatus === 'REJECTED'">
                  <strong>Rejected.</strong> Review the area comments below, update the permit and resubmit.
                </template>
                <template v-else-if="permitFormStatus === 'CLOSED'">
                  <strong>Closed.</strong> The permit is archived. Associated LOTOs were handed off for release.
                </template>
              </div>
            </div>
            <div v-if="(currentPermit && currentPermit.area_approvals || []).length"
              class="mt-2 border-t border-white/60 pt-2 space-y-1.5">
              <div v-for="ap in (currentPermit.area_approvals || [])" :key="ap.area_id"
                class="flex items-start gap-2 text-xs text-gray-800 bg-white/70 rounded px-2 py-1.5">
                <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style="background:#1B4F8C">{{ ap.area_tag || '—' }}</span>
                <span class="flex-1 truncate">{{ ap.area_description || '' }}</span>
                <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border', areaApprovalStatusStyle(ap.status)]">{{ ap.status }}</span>
                <span v-if="ap.reviewed_by_name" class="text-gray-500">{{ ap.reviewed_by_name }}</span>
              </div>
              <div v-for="ap in (currentPermit.area_approvals || []).filter(x => x.status === 'REJECTED' && x.rejection_comment)"
                :key="'rc-' + ap.area_id"
                class="text-xs text-red-700 bg-white/80 border border-red-200 rounded px-2 py-1 ml-1">
                <strong>{{ ap.area_tag }} rejected:</strong> {{ ap.rejection_comment }}
              </div>
            </div>
          </div>

          <!-- Editable form — disabled while the permit is locked -->
          <fieldset :disabled="!permitCanEdit" class="m-0 p-0 border-0 space-y-4 min-w-0 disabled:opacity-80">
          <!-- Section 1 — general -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label">Package <span class="text-red-500">*</span></label>
              <select v-model="permitForm.package_id" :disabled="!!editingPermit" class="input-field">
                <option :value="null">— Select —</option>
                <option v-for="p in eligiblePermitPackages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
              </select>
            </div>
            <div>
              <label class="form-label">Title <span class="text-red-500">*</span></label>
              <input v-model="permitForm.title" type="text" class="input-field" placeholder="Short title for this permit"/>
            </div>
            <div>
              <label class="form-label">Start date <span class="text-red-500">*</span></label>
              <input v-model="permitForm.start_date" type="date" class="input-field"/>
            </div>
            <div>
              <label class="form-label">Finish date <span class="text-red-500">*</span></label>
              <input v-model="permitForm.end_date" type="date" class="input-field"/>
            </div>
          </div>

          <div>
            <label class="form-label">Description of work <span class="text-red-500">*</span></label>
            <textarea v-model="permitForm.description" class="input-field" rows="2" placeholder="What work will be performed?"></textarea>
          </div>

          <!-- Section 2 — permit types + areas -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="form-label">Permit types <span class="text-red-500">*</span></label>
              <div class="border border-gray-200 rounded-lg overflow-y-auto divide-y divide-gray-100 max-h-48">
                <div v-if="permitTypes.length === 0" class="px-3 py-4 text-xs text-gray-400 text-center">
                  No permit types defined in Setup.
                </div>
                <label v-for="t in permitTypes" :key="t.id"
                  class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
                  <input type="checkbox" :value="t.id" v-model="permitForm.permit_type_ids" class="rounded"/>
                  <span class="text-gray-800">{{ t.name }}</span>
                </label>
              </div>
            </div>
            <div>
              <label class="form-label">Areas <span class="text-red-500">*</span></label>
              <div class="border border-gray-200 rounded-lg overflow-y-auto divide-y divide-gray-100 max-h-48">
                <div v-if="projectAreas.length === 0" class="px-3 py-4 text-xs text-gray-400 text-center">
                  No areas defined on this project yet.
                </div>
                <label v-for="a in projectAreas" :key="a.id"
                  class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
                  <input type="checkbox" :value="a.id" v-model="permitForm.area_ids" class="rounded"/>
                  <span class="inline-block px-2 py-0.5 rounded text-[11px] font-bold text-white" style="background:#1B4F8C">{{ a.tag }}</span>
                  <span class="text-gray-800 truncate">{{ a.description }}</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Section 3 — Risk assessment (hazards) -->
          <div class="pt-2 border-t border-gray-200">
            <h4 class="text-sm font-semibold text-gray-800 mb-2">Risk assessment</h4>
            <p class="text-xs text-gray-500 mb-3">Check each hazard present on this work and describe the preventive measure.</p>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div v-for="h in hazardCatalog" :key="h.key"
                :class="['border rounded-lg p-2 flex flex-col',
                         (h.key in permitForm.hazards) ? 'border-red-300 bg-red-50' : 'border-gray-200']">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" :checked="h.key in permitForm.hazards"
                    @change="togglePermitHazard(h.key)" class="rounded"/>
                  <img :src="hazardIcon(h.key)" :alt="h.label" class="w-8 h-8 shrink-0"/>
                  <span class="text-xs font-medium text-gray-800">{{ h.label }}</span>
                </label>
                <textarea v-if="h.key in permitForm.hazards"
                  :value="permitForm.hazards[h.key]"
                  @input="permitForm.hazards = { ...permitForm.hazards, [h.key]: $event.target.value }"
                  rows="2" class="input-field mt-2 text-xs"
                  placeholder="Preventive measure…"></textarea>
              </div>
            </div>
            <div class="mt-3">
              <label class="form-label">Others</label>
              <textarea v-model="permitForm.hazards_other" class="input-field" rows="2"
                placeholder="Any other hazards & preventive measures not listed above..."></textarea>
            </div>
          </div>

          <!-- Section 4 — PPE -->
          <div class="pt-2 border-t border-gray-200">
            <h4 class="text-sm font-semibold text-gray-800 mb-2">Personal Protective Equipment</h4>
            <p class="text-xs text-gray-500 mb-3">Click an icon to select / deselect. Goggles, helmet, shoes and gloves are selected by default.</p>
            <div class="grid grid-cols-3 md:grid-cols-5 gap-3">
              <button type="button" v-for="p in ppeCatalog" :key="p.key"
                @click="togglePermitPPE(p.key)"
                :class="['border rounded-lg p-2 flex flex-col items-center gap-1 transition',
                         (permitForm.ppe_keys || []).includes(p.key)
                           ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
                           : 'border-gray-200 bg-white hover:border-gray-300']">
                <img :src="ppeIcon(p.key)" :alt="p.label" class="w-10 h-10"/>
                <span class="text-[11px] text-center text-gray-700 leading-tight">{{ p.label }}</span>
              </button>
            </div>
            <div class="mt-3">
              <label class="form-label">Others</label>
              <textarea v-model="permitForm.ppe_other" class="input-field" rows="2"
                placeholder="Any other PPE required not listed above..."></textarea>
            </div>
          </div>

          <!-- Section 5 — Required LOTOs -->
          <div class="pt-2 border-t border-gray-200">
            <div class="flex items-center justify-between mb-2">
              <div>
                <h4 class="text-sm font-semibold text-gray-800">Required LOTOs</h4>
                <p class="text-xs text-gray-500">Each LOTO is created in REQUEST and must be confirmed by a site supervisor on one of the permit's areas. Refused LOTOs can be updated below and resubmitted (or cancelled) from this form.</p>
              </div>
              <button type="button" @click="permitAddLoto"
                class="px-3 py-1.5 rounded-md bg-ips-blue text-white text-xs font-semibold hover:opacity-90">
                + Add LOTO
              </button>
            </div>
            <div v-if="(permitForm.lotos || []).length === 0"
              class="text-xs text-gray-400 italic px-2 py-4 border border-dashed border-gray-200 rounded-md text-center">
              No LOTOs declared on this permit.
            </div>
            <div v-else class="space-y-2">
              <div v-for="(l, idx) in permitForm.lotos" :key="idx"
                class="border border-gray-200 rounded-md px-3 py-2 bg-gray-50">
                <div class="flex items-center gap-2">
                  <span v-if="l.status"
                    :class="['inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border', lotoStatusStyle(l.status)]">{{ lotoStatusLabel(l.status) }}</span>
                  <span v-else class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-blue-50 text-blue-700 border-blue-200">NEW</span>
                  <input v-model="l.tag_number" type="text"
                    :disabled="l.status === 'LOCKED'"
                    class="input-field flex-shrink-0" style="max-width:180px" placeholder="Tag number *"/>
                  <input v-model="l.description" type="text"
                    :disabled="l.status === 'LOCKED'"
                    class="input-field flex-1" placeholder="Description"/>
                  <span v-if="l.locked_state" class="text-emerald-600" title="Locked state">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c-1.104 0-2 .896-2 2s.896 2 2 2 2-.896 2-2-.896-2-2-2zm6-4V6a6 6 0 10-12 0v1H4v13h16V7h-2zM8 6a4 4 0 118 0v1H8V6z"/></svg>
                  </span>
                  <button type="button" v-if="l.status !== 'LOCKED'"
                    @click="permitRemoveLoto(idx)"
                    class="text-gray-400 hover:text-red-500 p-1" title="Remove">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
                <div v-if="l.status === 'REFUSED'"
                  class="mt-2 space-y-1.5">
                  <div v-if="l.refusal_comment"
                    class="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                    <strong>Refused:</strong> {{ l.refusal_comment }}
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="text-gray-500">Update the LOTO above if needed, then:</span>
                    <button type="button"
                      @click="permitSetLotoAction(idx, 'resubmit')"
                      :class="['px-2.5 py-1 rounded border font-semibold',
                               l._action === 'resubmit'
                                 ? 'bg-ips-blue text-white border-ips-blue'
                                 : 'bg-white text-ips-blue border-ips-blue hover:bg-sky-50']">
                      {{ l._action === 'resubmit' ? '✓ Will resubmit' : 'Resubmit' }}
                    </button>
                    <button type="button"
                      @click="permitSetLotoAction(idx, 'cancel')"
                      :class="['px-2.5 py-1 rounded border font-semibold',
                               l._action === 'cancel'
                                 ? 'bg-gray-600 text-white border-gray-600'
                                 : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50']">
                      {{ l._action === 'cancel' ? '✓ Will cancel' : 'Cancel' }}
                    </button>
                    <span v-if="l._action"
                      class="text-[11px] text-gray-500 italic">applied on Save Changes</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p v-if="permitError" class="text-red-500 text-sm">{{ permitError }}</p>

          </fieldset>  <!-- end editable form fieldset -->
        </div>
        <div class="modal-footer">
          <button @click="showPermitModal = false" class="btn-secondary">Close</button>

          <!-- Export PDF — available on APPROVED or CLOSED permits -->
          <button v-if="editingPermit && (permitFormStatus === 'APPROVED' || permitFormStatus === 'CLOSED')"
                  @click="exportPermitPdf" class="btn-secondary"
                  title="Download a one-page A4 copy of the approved permit">
            Export PDF
          </button>

          <!-- Save (editable states only) -->
          <button v-if="permitCanEdit" @click="savePermit" :disabled="permitSaving" class="btn-secondary">
            {{ permitSaving ? 'Saving…' : (editingPermit ? 'Save Changes' : 'Create Draft') }}
          </button>

          <!-- Submit / Resubmit for approval (DRAFT, REJECTED, or PENDING + LOTO refused) -->
          <button v-if="editingPermit && permitCanSubmit"
                  @click="submitPermitForApproval" class="btn-primary">
            {{ (permitFormStatus === 'REJECTED' || permitInLotoDeadlock) ? 'Resubmit for Approval' : 'Submit for Approval' }}
          </button>

          <!-- Approve / Reject (PENDING only, for area supervisors) -->
          <template v-if="editingPermit && permitFormStatus === 'PENDING' && permitAreasReviewableByMe.length">
            <button type="button" @click="openRejectPermit"
              class="px-3 py-2 rounded-md text-sm font-semibold bg-white border border-red-300 text-red-600 hover:bg-red-50">
              Reject
            </button>
            <button type="button" @click="openApprovePermit" class="btn-primary">
              Approve
            </button>
          </template>

          <!-- Close / Request Extension (APPROVED only, vendor contacts + admins) -->
          <template v-if="permitCanCloseOrExtend">
            <button type="button" @click="openPermitExtension"
              class="px-3 py-2 rounded-md text-sm font-semibold bg-white border border-amber-300 text-amber-700 hover:bg-amber-50">
              Request Extension
            </button>
            <button type="button" @click="openPermitClose" class="btn-primary">
              Close Permit
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- ─── Close-permit confirmation modal ─── -->
    <div v-if="showPermitCloseModal" class="modal-overlay"
         @click.self="closePermitCloseModal" style="z-index:130">
      <div class="modal-box" style="max-width:520px">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">
            Close Work Permit
            <span v-if="currentPermit" class="text-sm text-gray-400 font-mono ml-2">{{ currentPermit.display_id }}</span>
          </h3>
          <button @click="closePermitCloseModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body space-y-3" style="padding:20px 24px">
          <p class="text-sm text-gray-700">
            Confirm that this permit can be closed and its associated <strong>LOTOs released</strong>.
            All <em>locked</em> LOTOs will move to <strong>To be released</strong> and each site supervisor
            will be asked to confirm release on site.
          </p>
          <div>
            <label class="form-label">Comment (optional)</label>
            <textarea v-model="permitCloseComment" rows="2" class="input-field"
              placeholder="e.g. Work completed, no more access required…"></textarea>
          </div>
          <p v-if="permitCloseError" class="text-red-500 text-sm">{{ permitCloseError }}</p>
        </div>
        <div class="modal-footer">
          <button @click="closePermitCloseModal" class="btn-secondary">Cancel</button>
          <button @click="confirmPermitClose" :disabled="permitCloseSaving" class="btn-primary">
            {{ permitCloseSaving ? 'Closing…' : 'Confirm & Close' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ─── Extension request modal ─── -->
    <div v-if="showPermitExtensionModal" class="modal-overlay"
         @click.self="closePermitExtensionModal" style="z-index:130">
      <div class="modal-box" style="max-width:520px">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">
            Request Extension
            <span v-if="currentPermit" class="text-sm text-gray-400 font-mono ml-2">{{ currentPermit.display_id }}</span>
          </h3>
          <button @click="closePermitExtensionModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body space-y-3" style="padding:20px 24px">
          <p class="text-sm text-gray-700">
            Submitting a new finish date sends the permit back to <strong>Pending approval</strong>.
            Every area supervisor will be asked to re-approve for the extended window.
          </p>
          <div>
            <label class="form-label">Current finish date</label>
            <input :value="currentPermit ? currentPermit.end_date : ''" disabled type="date" class="input-field"/>
          </div>
          <div>
            <label class="form-label">New finish date <span class="text-red-500">*</span></label>
            <input v-model="permitExtensionNewDate" type="date" class="input-field"/>
          </div>
          <div>
            <label class="form-label">Comment (optional)</label>
            <textarea v-model="permitExtensionComment" rows="2" class="input-field"
              placeholder="Reason for the extension…"></textarea>
          </div>
          <p v-if="permitExtensionError" class="text-red-500 text-sm">{{ permitExtensionError }}</p>
        </div>
        <div class="modal-footer">
          <button @click="closePermitExtensionModal" class="btn-secondary">Cancel</button>
          <button @click="confirmPermitExtension" :disabled="permitExtensionSaving" class="btn-primary">
            {{ permitExtensionSaving ? 'Submitting…' : 'Submit Extension Request' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ─── Work-permit approval decision modal ─── -->
    <div v-if="showPermitDecisionModal" class="modal-overlay"
         @click.self="closePermitDecisionModal" style="z-index:130">
      <div class="modal-box" style="max-width:560px">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">
            {{ permitDecisionMode === 'reject' ? 'Reject Work Permit' : 'Approve Work Permit' }}
            <span v-if="currentPermit" class="text-sm text-gray-400 font-mono ml-2">{{ currentPermit.display_id }}</span>
          </h3>
          <button @click="closePermitDecisionModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body space-y-3" style="padding:20px 24px">
          <p class="text-xs text-gray-600">
            Select the area(s) you review and {{ permitDecisionMode === 'reject' ? 'reject' : 'approve' }} them.
            Only the areas still pending and assigned to you are listed.
          </p>
          <div class="space-y-1.5">
            <label v-for="ap in permitAreasReviewableByMe" :key="ap.area_id"
                   class="flex items-center gap-2 text-sm border border-gray-200 rounded px-2 py-1.5">
              <input type="checkbox"
                     :checked="permitDecisionAreaIds.includes(ap.area_id)"
                     @change="togglePermitDecisionArea(ap.area_id)"
                     class="rounded"/>
              <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style="background:#1B4F8C">{{ ap.area_tag }}</span>
              <span class="text-gray-700">{{ ap.area_description || '' }}</span>
            </label>
          </div>
          <div>
            <label class="form-label">
              {{ permitDecisionMode === 'reject' ? 'Rejection comment *' : 'Comment (optional)' }}
            </label>
            <textarea v-model="permitDecisionComment" rows="3" class="input-field"
              :placeholder="permitDecisionMode === 'reject' ? 'Explain what must be fixed…' : 'Optional note for the record…'"></textarea>
          </div>
          <p v-if="permitDecisionError" class="text-red-500 text-sm">{{ permitDecisionError }}</p>
        </div>
        <div class="modal-footer">
          <button @click="closePermitDecisionModal" class="btn-secondary">Cancel</button>
          <button @click="submitPermitDecision" :disabled="permitDecisionSaving"
            :class="permitDecisionMode === 'reject'
                      ? 'px-3 py-2 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-700'
                      : 'btn-primary'">
            {{ permitDecisionSaving
                 ? 'Saving…'
                 : (permitDecisionMode === 'reject' ? 'Confirm Rejection' : 'Confirm Approval') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ─── Work-permit review-history modal ─── -->
    <div v-if="showPermitHistoryModal" class="modal-overlay"
         @click.self="closePermitHistory" style="z-index:120">
      <div class="modal-box" style="max-width:560px">
        <div class="modal-header">
          <div>
            <p class="text-xs font-mono text-gray-400">
              <span v-if="permitHistoryPermit">Permit {{ permitHistoryPermit.display_id }}</span>
            </p>
            <h3 class="text-lg font-semibold text-gray-800">Review History</h3>
          </div>
          <button @click="closePermitHistory" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto">
          <div v-if="permitHistoryLoading" class="text-center py-6 text-gray-400">
            <img src="/static/assets/impulse-loader.svg" class="h-6 mx-auto" alt="Loading"/>
          </div>
          <div v-else-if="permitHistoryRows.length === 0" class="text-center py-6 text-gray-400 text-sm">No review events recorded yet.</div>
          <ol v-else class="relative border-l-2 border-gray-200 ml-3 space-y-4 pl-5">
            <li v-for="h in permitHistoryRows" :key="h.id" class="relative">
              <span :class="['absolute -left-[29px] top-1 w-3 h-3 rounded-full border-2 border-white', permitEventDotClass(h)]"></span>
              <div class="flex items-center gap-2 flex-wrap">
                <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', permitEventBadgeStyle(h)]">{{ permitEventLabel(h.event) }}</span>
                <span v-if="h.area_tag" class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style="background:#1B4F8C">{{ h.area_tag }}</span>
                <span class="text-xs text-gray-500">{{ fmtDate(h.created_at) }}</span>
              </div>
              <p class="text-xs text-gray-600 mt-1">by <span class="font-medium">{{ h.actor_name || '—' }}</span></p>
              <p v-if="h.comment" class="text-sm text-gray-700 italic mt-1 bg-gray-50 rounded p-2 whitespace-pre-line">{{ h.comment }}</p>
            </li>
          </ol>
        </div>
        <div class="modal-footer">
          <button @click="closePermitHistory" class="btn-secondary">Close</button>
        </div>
      </div>
    </div>

    <!-- ═════════════════════ LOTO TAB ═════════════════════ -->
    <div v-if="activeTab === 'loto'">
      <div class="flex flex-wrap items-center gap-2 mt-6 mb-3">
        <select v-model="lotoPackageFilter" @change="lotoPermitFilter = null" class="input-field text-sm" style="width:auto;min-width:180px">
          <option :value="null">All packages</option>
          <option v-for="p in eligiblePackages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
        </select>
        <select v-model="lotoPermitFilter" class="input-field text-sm" style="width:auto;min-width:180px"
          :disabled="lotoPermitOptions.length === 0">
          <option :value="null">All work permits</option>
          <option v-for="pm in lotoPermitOptions" :key="pm.id" :value="pm.id">{{ pm.display_id }}</option>
        </select>
        <select v-model="lotoStatusFilter" class="input-field text-sm" style="width:auto;min-width:150px">
          <option :value="null">All statuses</option>
          <option value="REQUEST">Request</option>
          <option value="LOCKED">Locked</option>
          <option value="REFUSED">Refused</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="TO_BE_RELEASED">To be released</option>
          <option value="RELEASED">Released</option>
        </select>
        <span class="ml-auto text-xs text-gray-500">{{ filteredLotos.length }} LOTO(s)</span>
        <button @click="exportLotosToExcel" :disabled="xlsxExportingLotos"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          {{ xlsxExportingLotos ? 'Exporting...' : 'Export Excel' }}
        </button>
      </div>
      <div class="card p-0 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
            <tr>
              <th class="text-left px-3 py-2 w-28">LOTO</th>
              <th class="text-left px-3 py-2 w-24">Package</th>
              <th class="text-left px-3 py-2 w-32">Tag number</th>
              <th class="text-left px-3 py-2">Description</th>
              <th class="text-left px-3 py-2 w-28">Permit</th>
              <th class="text-left px-3 py-2 w-24">Locked</th>
              <th class="text-left px-3 py-2 w-40">Status</th>
              <th class="text-left px-3 py-2 w-32">Reviewed by</th>
              <th class="px-3 py-2 w-72"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in filteredLotos" :key="l.id"
              class="border-b border-gray-100 hover:bg-gray-50">
              <td class="px-3 py-1.5 font-mono text-gray-700 whitespace-nowrap">{{ l.display_id }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap">
                <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ l.package_tag }}</span>
              </td>
              <td class="px-3 py-1.5 font-medium text-gray-800">{{ l.tag_number }}</td>
              <td class="px-3 py-1.5 text-gray-600 truncate max-w-[18rem]" :title="l.description || ''">{{ l.description || '—' }}</td>
              <td class="px-3 py-1.5 font-mono text-xs text-gray-600 whitespace-nowrap">{{ l.work_permit_display_id }}</td>
              <td class="px-3 py-1.5">
                <span v-if="l.locked_state" class="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c-1.104 0-2 .896-2 2s.896 2 2 2 2-.896 2-2-.896-2-2-2zm6-4V6a6 6 0 10-12 0v1H4v13h16V7h-2zM8 6a4 4 0 118 0v1H8V6z"/></svg>
                  Locked
                </span>
                <span v-else class="text-gray-400 text-xs">—</span>
              </td>
              <td class="px-3 py-1.5">
                <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border', lotoStatusStyle(l.status)]">{{ lotoStatusLabel(l.status) }}</span>
              </td>
              <td class="px-3 py-1.5 text-xs text-gray-500">{{ l.reviewed_by_name || '—' }}</td>
              <td class="px-3 py-1.5 text-right whitespace-nowrap">
                <button @click="openLotoHistory(l)"
                  class="mr-1 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-medium" title="History">
                  History
                </button>
                <template v-if="l.status === 'REQUEST'">
                  <button v-if="canReviewLoto(l)" @click="confirmLoto(l)"
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs font-semibold">Locked</button>
                  <button v-if="canReviewLoto(l)" @click="openRefuseLoto(l)"
                    class="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold">Refuse</button>
                  <template v-if="isOwnerOrAdmin">
                    <span class="ml-2 text-[10px] uppercase tracking-wider text-gray-400">Override</span>
                    <button @click="openLotoOverride(l, true)"
                      class="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-green-300 text-green-700 hover:bg-green-50 text-xs font-semibold">Locked</button>
                    <button @click="openLotoOverride(l, false)"
                      class="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold">Refuse</button>
                  </template>
                </template>
                <template v-else-if="l.status === 'REFUSED'">
                  <button v-if="canManageLoto(l)" @click="resubmitLotoFromList(l)"
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50 text-xs font-semibold">Resubmit</button>
                  <button v-if="canManageLoto(l)" @click="cancelLotoFromList(l)"
                    class="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs font-semibold">Cancel</button>
                </template>
                <template v-else-if="l.status === 'TO_BE_RELEASED'">
                  <button v-if="canReviewLoto(l)" @click="releaseLotoFromList(l)"
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-orange-300 text-orange-700 hover:bg-orange-50 text-xs font-semibold">Confirm Release</button>
                </template>
              </td>
            </tr>
            <tr v-if="filteredLotos.length === 0">
              <td colspan="9" class="px-4 py-8 text-center text-gray-400">No LOTOs yet — they are created from Work Permits.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- LOTO refuse modal -->
    <div v-if="showLotoRefuseModal" class="modal-overlay" @click.self="closeRefuseLotoModal">
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">Refuse LOTO</h3>
          <button @click="closeRefuseLotoModal" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body space-y-3">
          <p class="text-sm text-gray-600">
            Refuse LOTO <strong v-if="lotoRefuseTarget">{{ lotoRefuseTarget.display_id }} — {{ lotoRefuseTarget.tag_number }}</strong>.
            The linked package contacts will see this in their My Action Points so they can correct and resubmit.
          </p>
          <textarea v-model="lotoRefuseComment" class="input-field" rows="4" placeholder="Reason for refusal..."></textarea>
          <p v-if="lotoRefuseError" class="text-red-500 text-sm">{{ lotoRefuseError }}</p>
        </div>
        <div class="modal-footer">
          <button @click="closeRefuseLotoModal" class="btn-secondary">Cancel</button>
          <button @click="submitRefuseLoto" :disabled="lotoRefuseSaving || !lotoRefuseComment.trim()"
            class="btn-primary" style="background:#dc2626;border-color:#dc2626">
            {{ lotoRefuseSaving ? 'Refusing…' : 'Refuse LOTO' }}
          </button>
        </div>
      </div>
    </div>

    <!-- LOTO override modal -->
    <div v-if="showLotoOverrideModal" class="modal-overlay" @click.self="closeLotoOverride">
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">
            Override — {{ lotoOverrideApprove ? 'Lock' : 'Refuse' }} LOTO
          </h3>
          <button @click="closeLotoOverride" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body space-y-3">
          <p class="text-sm text-gray-600">
            You are overriding the normal site-supervisor decision for
            <strong v-if="lotoOverrideTarget">{{ lotoOverrideTarget.display_id }} — {{ lotoOverrideTarget.tag_number }}</strong>.
            This will be recorded in the LOTO history.
          </p>
          <textarea v-model="lotoOverrideComment" class="input-field" rows="3"
            placeholder="Reason for overriding (optional for confirm, required for refuse)..."></textarea>
          <p v-if="lotoOverrideError" class="text-red-500 text-sm">{{ lotoOverrideError }}</p>
        </div>
        <div class="modal-footer">
          <button @click="closeLotoOverride" class="btn-secondary">Cancel</button>
          <button @click="submitLotoOverride" :disabled="lotoOverrideSaving"
            class="btn-primary"
            :style="lotoOverrideApprove ? '' : 'background:#dc2626;border-color:#dc2626'">
            {{ lotoOverrideSaving
                ? 'Saving…'
                : (lotoOverrideApprove ? 'Override & lock' : 'Override & refuse') }}
          </button>
        </div>
      </div>
    </div>

    <!-- LOTO review-history modal (mirrors the Worker history modal) -->
    <div v-if="showLotoHistoryModal" class="modal-overlay" @click.self="closeLotoHistory" style="z-index:120">
      <div class="modal-box" style="max-width:560px">
        <div class="modal-header">
          <div>
            <p class="text-xs font-mono text-gray-400">
              LOTO <span v-if="lotoHistoryLoto">{{ lotoHistoryLoto.display_id }}<span v-if="lotoHistoryLoto.tag_number"> — {{ lotoHistoryLoto.tag_number }}</span></span>
            </p>
            <h3 class="text-lg font-semibold text-gray-800">Review History</h3>
          </div>
          <button @click="closeLotoHistory" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body" style="max-height:70vh;overflow-y:auto">
          <div v-if="lotoHistoryLoading" class="text-center py-6 text-gray-400">
            <img src="/static/assets/impulse-loader.svg" class="h-6 mx-auto" alt="Loading"/>
          </div>
          <div v-else-if="lotoHistoryRows.length === 0" class="text-center py-6 text-gray-400 text-sm">No review events recorded yet.</div>
          <ol v-else class="relative border-l-2 border-gray-200 ml-3 space-y-4 pl-5">
            <li v-for="h in lotoHistoryRows" :key="h.id" class="relative">
              <span :class="['absolute -left-[29px] top-1 w-3 h-3 rounded-full border-2 border-white', lotoEventDotClass(h)]"></span>
              <div class="flex items-center gap-2 flex-wrap">
                <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', lotoHistoryEventStyle(h)]">{{ lotoEventLabel(h.event) }}</span>
                <span class="text-xs text-gray-500">{{ fmtDate(h.created_at) }}</span>
              </div>
              <p class="text-xs text-gray-600 mt-1">by <span class="font-medium">{{ h.actor_name || '—' }}</span></p>
              <p v-if="h.comment" class="text-sm text-gray-700 italic mt-1 bg-gray-50 rounded p-2 whitespace-pre-line">{{ h.comment }}</p>
            </li>
          </ol>
        </div>
        <div class="modal-footer">
          <button @click="closeLotoHistory" class="btn-secondary">Close</button>
        </div>
      </div>
    </div>

    <!-- ═════════════════════ WORK LOGS ═════════════════════ -->
    <div v-if="activeTab === 'worklogs'">
      <div class="card p-3 mt-6 mb-3 border-l-4 border-ips-blue bg-ips-light/40">
        <div class="flex items-start gap-2.5">
          <svg class="w-5 h-5 text-ips-blue shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="text-xs text-gray-700 leading-relaxed">
            <span class="font-semibold text-ips-dark">Work periods declare when a package is active on site.</span>
            They are the baseline used to check daily-report compliance: for every day inside a declared work period,
            the package is expected to submit a daily report. Days outside any declared period are not counted.
            <span class="block mt-1 text-gray-500">Rule: <span class="font-medium text-gray-700">During a work period → the package must produce a daily report.</span></span>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <button v-if="canEditWorkLogs" @click="openLogModal()" class="btn-primary text-sm">+ New Work Period</button>
        <select v-model="logPackageFilter" class="input-field text-sm" style="width:auto;min-width:180px">
          <option :value="null">All packages</option>
          <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
        </select>
        <span class="ml-auto text-xs text-gray-500">{{ filteredWorkLogs.length }} work period(s)</span>
        <button @click="exportWorkLogsToExcel" :disabled="xlsxExportingWorkLogs"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          {{ xlsxExportingWorkLogs ? 'Exporting...' : 'Export Excel' }}
        </button>
      </div>
      <div v-if="!canEditWorkLogs" class="card p-3 mb-3 bg-amber-50 border-amber-200 text-amber-700 text-xs">
        Read-only — only project owners and team members can declare work periods.
      </div>
      <div class="card p-0 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
            <tr>
              <th class="text-left px-3 py-2 w-40">Package</th>
              <th class="text-left px-3 py-2 w-36">Start Date</th>
              <th class="text-left px-3 py-2 w-36">End Date</th>
              <th class="text-left px-3 py-2">Notes</th>
              <th class="text-left px-3 py-2 w-40">Declared by</th>
              <th v-if="canEditWorkLogs" class="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in filteredWorkLogs" :key="l.id" class="border-b border-gray-100 hover:bg-gray-50">
              <td class="px-3 py-1.5 whitespace-nowrap">
                <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ l.package_tag }}</span>
                <span class="ml-2 text-xs text-gray-500">{{ l.package_name }}</span>
              </td>
              <td class="px-3 py-1.5 text-gray-700 whitespace-nowrap">{{ l.start_date }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap">
                <span v-if="l.end_date" class="text-gray-700">{{ l.end_date }}</span>
                <span v-else class="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">ongoing</span>
              </td>
              <td class="px-3 py-1.5 text-gray-500 truncate max-w-[28rem]" :title="l.notes">{{ l.notes || '—' }}</td>
              <td class="px-3 py-1.5 text-xs text-gray-500">{{ l.created_by_name || '—' }}</td>
              <td v-if="canEditWorkLogs" class="px-3 py-1.5 text-right whitespace-nowrap">
                <button v-if="!l.end_date" @click="endLog(l)"
                  class="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs font-semibold mr-1"
                  title="End this work period — set actual end date to today">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  End work
                </button>
                <button @click="openLogModal(l)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button @click="deleteLog(l)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </td>
            </tr>
            <tr v-if="filteredWorkLogs.length === 0"><td colspan="6" class="px-4 py-8 text-center text-gray-400">No work periods declared yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ═════════════════════ CO-ACTIVITY BOARD ═════════════════════ -->
    <div v-if="activeTab === 'coactivity'">
      <!-- Toolbar: navigation + legend -->
      <div class="flex flex-wrap items-center gap-2 mt-6 mb-3">
        <div class="inline-flex items-center rounded-md border border-gray-200 overflow-hidden text-sm">
          <button @click="shiftCoactivity(-4)"
            class="px-2 py-1 hover:bg-gray-50 text-gray-600 border-r border-gray-200" title="Back 4 weeks">« 4w</button>
          <button @click="shiftCoactivity(-1)"
            class="px-2 py-1 hover:bg-gray-50 text-gray-600 border-r border-gray-200" title="Back 1 week">‹ 1w</button>
          <button @click="resetCoactivity"
            class="px-3 py-1 hover:bg-gray-50 text-ips-blue font-medium border-r border-gray-200" title="Jump to this week">Today</button>
          <button @click="shiftCoactivity(1)"
            class="px-2 py-1 hover:bg-gray-50 text-gray-600 border-r border-gray-200" title="Forward 1 week">1w ›</button>
          <button @click="shiftCoactivity(4)"
            class="px-2 py-1 hover:bg-gray-50 text-gray-600" title="Forward 4 weeks">4w »</button>
        </div>
        <span class="text-xs text-gray-600">{{ coactivityRangeLabel }}</span>
        <!-- Granularity toggle: day grid (56 cols) vs week grid (8 cols) -->
        <div class="inline-flex items-center rounded-md border border-gray-200 overflow-hidden text-sm">
          <button @click="coactivityGranularity = 'day'"
            :class="['px-3 py-1', coactivityGranularity === 'day'
                     ? 'bg-ips-blue text-white font-semibold'
                     : 'text-gray-600 hover:bg-gray-50']">
            Days
          </button>
          <button @click="coactivityGranularity = 'week'"
            :class="['px-3 py-1 border-l border-gray-200',
                     coactivityGranularity === 'week'
                       ? 'bg-ips-blue text-white font-semibold'
                       : 'text-gray-600 hover:bg-gray-50']">
            Weeks
          </button>
        </div>
        <div class="ml-auto flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
          <span class="uppercase tracking-wider text-gray-400">Legend</span>
          <span v-for="s in coactivityLegendStatuses" :key="s"
            :class="['inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border', permitStatusStyle(s)]">
            {{ permitStatusLabel(s) }}
          </span>
        </div>
      </div>

      <!-- Matrix -->
      <div class="card p-0 overflow-auto">
        <table class="text-xs border-collapse" style="min-width:100%">
          <thead>
            <!-- Week grouping row (only visible in day mode; in week mode
                 the single row below already shows the week label). -->
            <tr v-if="coactivityGranularity === 'day'">
              <th rowspan="2"
                class="sticky left-0 z-10 bg-gray-50 border-b border-r border-gray-200 px-3 py-2 text-left text-xs uppercase text-gray-500"
                style="min-width:180px">Area</th>
              <th v-for="w in coactivityWeekHeaders" :key="w.label"
                colspan="7"
                class="bg-gray-50 border-b border-r border-gray-200 px-2 py-1 text-center text-[11px] text-gray-600 font-semibold">
                Week of {{ w.start.iso }} <span class="text-gray-400 font-normal">· {{ w.monthRange }}</span>
              </th>
            </tr>
            <!-- Column header row (days in day mode, weeks in week mode) -->
            <tr>
              <th v-if="coactivityGranularity === 'week'"
                class="sticky left-0 z-10 bg-gray-50 border-b border-r border-gray-200 px-3 py-2 text-left text-xs uppercase text-gray-500"
                style="min-width:180px">Area</th>
              <th v-for="col in coactivityColumns" :key="col.iso"
                :class="['border-b border-gray-200 py-1 font-medium',
                         col.isWeekend ? 'bg-gray-100 text-gray-400' : 'bg-gray-50 text-gray-600',
                         col.isToday ? 'ring-2 ring-ips-blue' : '',
                         coactivityGranularity === 'week'
                           ? 'border-l border-gray-300 px-2'
                           : (col.dayName === 'Mon' ? 'border-l border-gray-300' : 'border-l border-gray-100')]"
                :style="coactivityGranularity === 'week' ? 'min-width:110px' : 'min-width:28px'">
                <template v-if="coactivityGranularity === 'day'">
                  <div class="text-center text-[10px] leading-none">{{ col.dayName[0] }}</div>
                  <div class="text-center text-[11px] leading-tight">{{ col.dayNum }}</div>
                </template>
                <template v-else>
                  <div class="text-center text-[10px] uppercase tracking-wider text-gray-400 leading-none">Week</div>
                  <div class="text-center text-[11px] leading-tight font-semibold text-gray-700">{{ col.iso }}</div>
                  <div class="text-center text-[10px] text-gray-500 leading-tight">{{ col.short }}</div>
                </template>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="area in projectAreas" :key="area.id"
                class="border-b border-gray-100">
              <td class="sticky left-0 z-10 bg-white border-r border-gray-200 px-3 py-1.5 whitespace-nowrap">
                <span class="inline-block px-2 py-0.5 rounded text-[11px] font-bold text-white mr-2" style="background:#1B4F8C">{{ area.tag }}</span>
                <span class="text-xs text-gray-700">{{ area.description || '' }}</span>
              </td>
              <td v-for="col in coactivityColumns" :key="col.iso"
                :class="['p-0.5 align-top',
                         col.isWeekend ? 'bg-gray-50' : '',
                         col.isToday ? 'ring-1 ring-ips-blue' : '',
                         coactivityGranularity === 'week'
                           ? 'border-l border-gray-300'
                           : (col.dayName === 'Mon' ? 'border-l border-gray-300' : 'border-l border-gray-100')]"
                :style="coactivityGranularity === 'week' ? 'min-width:110px' : 'min-width:28px'">
                <div v-for="p in coactivityCellPermits(area.id, col)" :key="p.id"
                  @click="openPermitModal(p)"
                  :title="coactivityBadgeTitle(p)"
                  :class="['mb-0.5 font-bold text-center rounded border cursor-pointer leading-tight',
                           'px-1 py-0.5 hover:ring-1 hover:ring-ips-blue',
                           coactivityGranularity === 'week' ? 'text-[10px]' : 'text-[9px]',
                           permitStatusStyle(p.status)]">
                  {{ p.package_tag || ('P' + p.package_id) }}
                  <span v-if="coactivityGranularity === 'week' && p.display_id"
                        class="ml-1 font-mono font-normal opacity-70">{{ p.display_id }}</span>
                </div>
              </td>
            </tr>
            <tr v-if="projectAreas.length === 0">
              <td :colspan="coactivityColumns.length + 1"
                class="px-4 py-8 text-center text-gray-400">
                No areas defined on this project.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="scheduledPermits.length === 0"
         class="mt-3 text-xs text-gray-400 text-center">
        No scheduled work permits yet. Once a permit is submitted (PENDING, APPROVED or CLOSED), it will appear here.
      </p>
    </div>

    <!-- ─── Work-log modal ─── -->
    <div v-if="showLogModal" class="modal-overlay" @click.self="showLogModal = false">
      <div class="modal-box" style="max-width:560px">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">{{ editingLog ? 'Edit Work Period' : 'New Work Period' }}</h3>
          <button @click="showLogModal = false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body space-y-3">
          <div>
            <label class="form-label">Package <span class="text-red-500">*</span></label>
            <select v-model="logForm.package_id" class="input-field">
              <option :value="null">— Select a package —</option>
              <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label">Start Date <span class="text-red-500">*</span></label>
              <input v-model="logForm.start_date" type="date" class="input-field"/>
            </div>
            <div>
              <label class="form-label">End Date <span class="text-gray-400 font-normal">(leave empty for ongoing)</span></label>
              <input v-model="logForm.end_date" type="date" class="input-field"/>
            </div>
          </div>
          <div>
            <label class="form-label">Notes</label>
            <textarea v-model="logForm.notes" class="input-field" rows="3" placeholder="Optional notes about this work period..."></textarea>
          </div>
          <p v-if="logError" class="text-red-500 text-sm">{{ logError }}</p>
        </div>
        <div class="modal-footer">
          <button @click="showLogModal = false" class="btn-secondary">Cancel</button>
          <button @click="saveLog" :disabled="logSaving" class="btn-primary">
            {{ logSaving ? 'Saving…' : (editingLog ? 'Save Changes' : 'Create') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ─── Subcontractor modal ─── -->
    <div v-if="showSubModal" class="modal-overlay" @click.self="showSubModal = false">
      <div class="modal-box" style="max-width:620px">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">{{ editingSub ? 'Edit Subcontractor' : 'New Subcontractor' }}</h3>
          <button @click="showSubModal = false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body space-y-3">
          <div>
            <label class="form-label">Package <span class="text-red-500">*</span></label>
            <select v-model="subForm.package_id" class="input-field">
              <option :value="null">— Select a package —</option>
              <option v-for="p in eligiblePackages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label">Company <span class="text-red-500">*</span></label>
              <input v-model="subForm.company" type="text" class="input-field"/>
            </div>
            <div>
              <label class="form-label">Contact Person</label>
              <input v-model="subForm.contact_person" type="text" class="input-field"/>
            </div>
            <div>
              <label class="form-label">Phone</label>
              <input v-model="subForm.phone" type="text" class="input-field"/>
            </div>
            <div>
              <label class="form-label">Email</label>
              <input v-model="subForm.email" type="email" class="input-field"/>
            </div>
          </div>
          <div>
            <label class="form-label">Description of subcontracted works</label>
            <textarea v-model="subForm.description" class="input-field" rows="3"></textarea>
          </div>
          <p v-if="subError" class="text-red-500 text-sm">{{ subError }}</p>
        </div>
        <div class="modal-footer">
          <button @click="showSubModal = false" class="btn-secondary">Cancel</button>
          <button @click="saveSub" :disabled="subSaving" class="btn-primary">
            {{ subSaving ? 'Saving…' : (editingSub ? 'Save Changes' : 'Create') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ─── Worker modal ─── -->
    <div v-if="showWorkerModal" class="modal-overlay" @click.self="showWorkerModal = false">
      <div class="modal-box modal-xl" style="height:92vh;max-height:92vh;min-height:min(92vh,720px);display:flex;flex-direction:column">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">
            {{ editingWorker ? ('Worker · ' + (editingWorker.display_id || '')) : 'New Worker' }}
          </h3>
          <button @click="showWorkerModal = false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Two-column body: form on the left, attachments pinned on the right -->
        <div class="modal-body" style="padding:0;display:flex;overflow:hidden">
          <div class="flex-1 min-w-0 overflow-y-auto flex flex-col" style="padding:20px 24px">
            <!-- Compact status strip (no feedback/buttons — those live at the bottom) -->
            <div v-if="editingWorker && editingWorker.id" class="mb-3 flex items-center gap-2 flex-wrap text-xs">
              <span :class="['inline-block px-2 py-0.5 rounded-full font-semibold', statusBadgeClass(editingWorker.status)]">{{ editingWorker.status }}</span>
              <span v-if="editingWorker.submitted_at" class="text-gray-500">Submitted {{ fmtDate(editingWorker.submitted_at) }}</span>
              <span v-if="editingWorker.reviewed_at" class="text-gray-500">· Reviewed {{ fmtDate(editingWorker.reviewed_at) }} by {{ editingWorker.reviewed_by_name || '—' }}</span>
              <button v-if="editingWorker.id" @click="openWorkerHistory(editingWorker)"
                class="ml-auto px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600" title="Show review history">History</button>
            </div>

            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="form-label">Package <span class="text-red-500">*</span></label>
                  <select v-model="workerForm.package_id" class="input-field">
                    <option :value="null">— Select a package —</option>
                    <option v-for="p in eligiblePackages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Phone</label>
                  <input v-model="workerForm.phone" type="text" class="input-field"/>
                </div>
              </div>
              <div>
                <label class="form-label">Name <span class="text-red-500">*</span></label>
                <input v-model="workerForm.name" type="text" class="input-field"/>
              </div>

              <div class="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
                <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" v-model="workerForm.is_subcontractor" class="rounded"/>
                  Worker is employed by a subcontractor
                </label>
                <div v-if="workerForm.is_subcontractor">
                  <label class="form-label">Subcontractor <span class="text-red-500">*</span></label>
                  <select v-model="workerForm.subcontractor_id" class="input-field">
                    <option :value="null">— Select —</option>
                    <option v-for="s in subsForCurrentWorker" :key="s.id" :value="s.id">{{ s.display_id }} · {{ s.company }}</option>
                  </select>
                  <p v-if="subsForCurrentWorker.length === 0" class="text-xs text-amber-700 mt-1">
                    No subcontractors registered for this package yet — register one first on the Subcontractors tab.
                  </p>
                </div>
              </div>

              <p v-if="workerError" class="text-red-500 text-sm">{{ workerError }}</p>
            </div>

            <!-- Certificates list flexes to fill the remaining vertical space -->
            <div class="mt-3 flex flex-col flex-1 min-h-0">
              <label class="form-label">Certificates</label>
              <div v-if="certificateTypes.length === 0" class="text-xs text-gray-400">No certificate types set up yet.</div>
              <div v-else class="border border-gray-200 rounded-lg overflow-y-auto divide-y divide-gray-100 flex-1 min-h-0">
                <label v-for="c in certificateTypes" :key="c.id"
                  class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm whitespace-nowrap">
                  <input type="checkbox" :value="c.id" v-model="workerForm.certificate_type_ids" class="rounded"/>
                  <span class="text-gray-800 truncate">{{ c.name }}</span>
                </label>
              </div>
            </div>

            <!-- Rejection feedback + workflow actions pinned to the bottom of the form -->
            <div v-if="editingWorker && editingWorker.id && editingWorker.status === 'REJECTED'" class="mt-4 border-l-4 border-red-400 bg-red-50 text-red-700 text-sm px-3 py-2 rounded-r">
              <div class="font-semibold text-xs uppercase tracking-wider mb-0.5">Supervisor feedback</div>
              <div>{{ editingWorker.rejection_comment || '—' }}</div>
            </div>
            <div v-if="editingWorker && editingWorker.id && (editingWorker.status === 'REJECTED' || editingWorker.status === 'CANCELLED' || editingWorker.status === 'PENDING')"
              class="mt-3 flex items-center gap-2">
              <button v-if="editingWorker.status === 'REJECTED' || editingWorker.status === 'CANCELLED'"
                @click="resubmitWorker" :disabled="workflowSaving"
                class="px-3 py-1 text-xs font-semibold rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200">Resubmit for review</button>
              <button v-if="editingWorker.status !== 'CANCELLED' && editingWorker.status !== 'APPROVED'"
                @click="cancelWorkerDeclaration" :disabled="workflowSaving"
                class="px-3 py-1 text-xs font-semibold rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300">Cancel declaration</button>
            </div>
          </div>
          <div class="w-[28rem] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Certificate Attachments</p>
            <div v-if="!lastSavedWorkerId" class="text-xs text-gray-400 italic">
              Click <span class="font-semibold">Save</span> below to create the worker. The upload zone will appear here afterwards so you can attach the certificates.
            </div>
            <file-attachments v-else record-type="worker" :record-id="lastSavedWorkerId" :can-upload="true" :can-edit="true"></file-attachments>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showWorkerModal = false" class="btn-secondary">Cancel</button>
          <!-- Step 1: no worker yet → Save (creates the worker, attachments panel unlocks) -->
          <button v-if="!lastSavedWorkerId" @click="saveWorker" :disabled="workerSaving" class="btn-primary">
            {{ workerSaving ? 'Saving…' : 'Save' }}
          </button>
          <!-- Step 2: worker just created → Create Worker (persists any final field changes + closes) -->
          <button v-else-if="editingWorker && editingWorker._justCreated" @click="finalizeWorker" :disabled="workerSaving" class="btn-primary">
            {{ workerSaving ? 'Saving…' : 'Create Worker' }}
          </button>
          <!-- Editing an existing worker: simple Save Changes -->
          <button v-else @click="saveWorker" :disabled="workerSaving" class="btn-primary">
            {{ workerSaving ? 'Saving…' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>

  </div>
  `,
});
