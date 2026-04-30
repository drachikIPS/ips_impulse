app.component('quality-control-module', {
  props: ['currentUser', 'initialTab', 'pendingOpen'],
  emits: ['subtab-change', 'record-change'],

  data() {
    return {
      activeTab: 'itp',          // 'itp' | 'approvals' | 'dashboard' | 'setup' | 'punchlist'
      setupSubTab: 'testTypes',  // 'testTypes' | 'witnessLevels' | 'obligationTimes'
      dashView: 'package',       // 'package' | 'area' | 'unit'

      // Lookups
      testTypes: [],
      witnessLevels: [],
      obligationTimes: [],
      packages: [],
      areas: [],
      units: [],

      // ITP list + filters
      itpRecords: [],
      itpFilter: {
        package_id: null, test_type_id: null, witness_level_id: null,
        area_id: null, unit_id: null, status: null,
      },

      // ITP create/edit modal
      showItpModal: false,
      itpModalMode: 'create',
      itpForm: {
        package_id: null, test_type_id: null, test: '', details: '',
        witness_level_id: null, area_id: null, unit_id: null,
        acceptance_criteria: '', planned_date: '', updated_at: null,
      },
      editingItpId: null,

      // Detail / view modal
      viewingItp: null,
      itpNotes: [],
      newItpNote: '',
      savingItpNote: false,

      // Execute modal
      showExecuteModal: false,
      executeForm: { status: 'PASSED', result: '', executed_date: '' },
      executingItpId: null,
      executingItpUpdatedAt: null,

      // Review modal (for linked reviewer)
      showReviewModal: false,
      reviewForm: { status: 'APPROVED', comment: '' },
      reviewingItpId: null,
      // Inline review form inside the ITP detail modal
      inlineReviewing: false,
      inlineReviewForm: { status: 'APPROVED', comment: '' },
      inlineReviewError: '',
      inlineReviewSaving: false,
      // ITP review history modal
      historyItp: null,
      itpHistoryEntries: [],
      itpHistoryLoading: false,
      itpHistoryError: '',

      // Override modal (admin / owner)
      showOverrideModal: false,
      overrideForm: { review_id: null, status: 'APPROVED', comment: '' },
      overridingItpId: null,
      overrideReviewerName: '',

      // Approvals tab
      approvalRecords: [],
      approvalLoading: false,

      // Test type modal
      showTestTypeModal: false,
      testTypeForm: { name: '', description: '', sort_order: 0, updated_at: null },
      editingTestTypeId: null,

      // Witness level modal
      showWitnessLevelModal: false,
      witnessLevelForm: { code: '', name: '', description: '', sort_order: 0, updated_at: null },
      editingWitnessLevelId: null,

      // Obligation time modal
      showObligationTimeModal: false,
      obligationTimeForm: { code: '', name: '', sort_order: 0, updated_at: null },
      editingObligationTimeId: null,

      // Punchlist
      punchItems: [],
      punchFilter: { package_id: null, status: null, obligation_time_id: null, area_id: null, unit_id: null, mine: false },
      showPunchModal: false,
      punchModalMode: 'create',
      punchForm: {
        package_id: null, obligation_time_id: null, itp_record_id: null,
        area_id: null, unit_id: null, topic: '', details: '',
        floorplan_id: null, floorplan_x: null, floorplan_y: null,
        updated_at: null,
      },
      pinTouched: false,
      showPinPicker: false,

      // Floorplans (shared between punch modal pinning and the heatmap tab)
      floorplans: [],
      floorplanBlobs: {},   // id → object URL
      floorplanDims:  {},   // id → { w, h }

      // PDF export modal (punchlist) + reports list (background-generated)
      recentPunchReports: [],
      punchReportsLoading: false,
      punchReportsTimer: null,
      showPunchExportModal: false,
      punchExportFilters: {
        package_ids: [],
        area_ids: [],
        statuses: [],
        group_by: 'package_area',
        per_package_plans: false,
      },
      punchExporting: false,
      punchExportError: '',

      // Heatmap (Floorplan view) tab
      heatStatus: 'OPEN',     // OPEN | TO_REVIEW | CLOSED | ALL  (defaults to actionable)
      heatPackage: '',
      heatExpanded: null,     // { fpId, idx } when a cluster is expanded
      showPinNumbers: true,
      expandAll: false,
      expandedFloorplans: {},
      editingPunchId: null,
      currentPunchStatus: null,   // 'DRAFT' | 'OPEN' | … — used to show DRAFT badge and Submit button in modal
      submittingPunch: false,
      viewingPunch: null,
      punchNotes: [],
      newPunchNote: '',
      savingPunchNote: false,
      showRespondModal: false,
      respondForm: { response: '', updated_at: null },
      showPunchReviewModal: false,
      punchReviewForm: { action: 'CLOSE', comment: '', updated_at: null },
      showPunchOverrideModal: false,
      punchOverrideForm: { status: 'OPEN', updated_at: null },
      punchLoading: false,
      exporting: false,
      savingPunch: false,
      punchError: null,

      // Dashboard
      dashboard: null,
      punchDashboard: null,
      dashFilter: {
        package_id: null, test_type_id: null, witness_level_id: null,
        area_id: null, unit_id: null,
      },
      punchDashView: 'package',  // 'package' | 'area' | 'unit'
      punchDashFilter: { package_id: null, area_id: null, unit_id: null },

      // ITP Import / Export
      itpExporting: false,
      showItpImportModal: false,
      itpImportFile: null,
      itpImportPreview: null,
      itpImportLoading: false,
      itpImportApplying: false,
      itpImportError: '',
      itpImportResult: null,

      loading: false,
      savingItp: false,
      error: null,
      _itpStatusChart: null,
      _approvalPieChart: null,
      _punchStatusChart: null,
      _punchTrendChart: null,
    };
  },

  computed: {
    canManage() {
      if (!this.currentUser) return false;
      if (['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role)) return true;
      // QA/QC Manager (Quality Control Module Lead) gets the same UI gates.
      return (this.currentUser.lead_modules || []).includes('Quality Control');
    },
    isVendor() {
      return this.currentUser && this.currentUser.role === 'VENDOR';
    },
    vendorLinkedPackageIds() {
      // Packages the vendor is linked to via PackageContact — enables ITP
      // creation / import for those packages.
      if (!this.isVendor || !this.currentUser.contact_id) return [];
      return (this.packages || [])
        .filter(p => Array.isArray(p.contact_ids) && p.contact_ids.includes(this.currentUser.contact_id))
        .map(p => p.id);
    },
    canCreateItp() {
      // Admin/PROJECT_OWNER always can; a vendor with at least one linked
      // package gets the same entry points.
      return this.canManage || (this.isVendor && this.vendorLinkedPackageIds.length > 0);
    },
    itpAvailablePackages() {
      // Packages selectable when creating / editing / filtering ITPs.
      // Vendors only see packages they're linked to via PackageContact;
      // everyone else sees all project packages.
      if (this.isVendor) {
        const ids = new Set(this.vendorLinkedPackageIds);
        return (this.packages || []).filter(p => ids.has(p.id));
      }
      return this.packages || [];
    },
    canExecute() {
      return this.currentUser && ['ADMIN', 'PROJECT_OWNER', 'VENDOR'].includes(this.currentUser.role);
    },
    canCreatePunch() {
      return this.currentUser && ['ADMIN', 'PROJECT_OWNER', 'PROJECT_TEAM', 'CLIENT'].includes(this.currentUser.role);
    },
    isTechnicalReviewer() {
      if (!this.currentUser || !this.currentUser.contact_id) return false;
      return this.packages.some(p =>
        p.pmc_technical_reviewer_id === this.currentUser.contact_id ||
        p.client_technical_reviewer_id === this.currentUser.contact_id
      );
    },
    canSeeApprovals() {
      return this.canManage || this.isTechnicalReviewer;
    },
    punchStatusOptions() {
      return [
        { value: null,        label: 'All Statuses' },
        { value: 'OPEN',      label: 'Open' },
        { value: 'TO_REVIEW', label: 'To Review' },
        { value: 'CLOSED',    label: 'Closed' },
      ];
    },
    itpRecordsForSelectedPackage() {
      if (!this.punchForm.package_id) return [];
      return this.itpRecords.filter(r => r.package_id === this.punchForm.package_id);
    },

    // ── Floorplan pin selection (in-modal) ────────────────────────────────
    currentAreaFloorplan() {
      const aId = this.punchForm.area_id;
      if (!aId) return null;
      const area = this.areas.find(a => a.id === aId);
      if (!area || !area.floorplan_id) return null;
      return this.floorplans.find(fp => fp.id === area.floorplan_id) || null;
    },

    // Floorplan attached to the currently viewed (read-only) punch item.
    viewPunchFloorplan() {
      const p = this.viewingPunch;
      if (!p || !p.floorplan_id) return null;
      return this.floorplans.find(fp => fp.id === p.floorplan_id) || null;
    },
    viewPunchFloorplanBlob() {
      const fp = this.viewPunchFloorplan;
      return fp ? (this.floorplanBlobs[fp.id] || null) : null;
    },
    viewPunchThumbAspect() {
      const fp = this.viewPunchFloorplan;
      if (!fp) return '4 / 3';
      const d = this.floorplanDims[fp.id];
      return d ? (d.w + ' / ' + d.h) : '4 / 3';
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
      return this.showPunchModal;  // editable in any modal mode
    },

    activePunchReportsCount() {
      return (this.recentPunchReports || []).filter(r =>
        r.status === 'PENDING' || r.status === 'GENERATING'
      ).length;
    },

    // ── Heatmap (Floorplan view) tab ──────────────────────────────────────
    pinsByFloorplan() {
      const status = this.heatStatus;
      const pkgId = this.heatPackage;
      const out = {};
      for (const p of (this.punchItems || [])) {
        if (!p.floorplan_id || p.floorplan_x == null || p.floorplan_y == null) continue;
        if (status !== 'ALL' && p.status !== status) continue;
        if (pkgId && p.package_id !== pkgId) continue;
        if (!out[p.floorplan_id]) out[p.floorplan_id] = [];
        out[p.floorplan_id].push(p);
      }
      return out;
    },
    floorplansWithPins() {
      const grouped = this.pinsByFloorplan;
      return this.floorplans
        .filter(fp => grouped[fp.id] && grouped[fp.id].length)
        .map(fp => {
          const pins = grouped[fp.id];
          const open    = pins.filter(p => p.status === 'OPEN').length;
          const review  = pins.filter(p => p.status === 'TO_REVIEW').length;
          const closed  = pins.filter(p => p.status === 'CLOSED').length;
          return { ...fp, pins, openCount: open, reviewCount: review, closedCount: closed };
        });
    },
    statusOptions() {
      return [
        { value: null, label: 'All Statuses' },
        { value: 'DRAFT', label: 'Draft' },
        { value: 'PLANNED', label: 'Planned' },
        { value: 'PASSED', label: 'Passed' },
        { value: 'FAILED', label: 'Failed' },
      ];
    },
    dashTotalsCards() {
      if (!this.dashboard) return [];
      const t = this.dashboard.totals;
      return [
        { label: 'Total',   value: t.total,   color: '#6B7280' },
        { label: 'Draft',   value: t.DRAFT,   color: '#9CA3AF' },
        { label: 'Planned', value: t.PLANNED, color: '#3B82F6' },
        { label: 'Passed',  value: t.PASSED,  color: '#10B981' },
        { label: 'Failed',  value: t.FAILED,  color: '#EF4444' },
      ];
    },
    dashGroupData() {
      if (!this.dashboard) return [];
      if (this.dashView === 'package') return this.dashboard.by_package;
      if (this.dashView === 'area')    return this.dashboard.by_area;
      if (this.dashView === 'unit')    return this.dashboard.by_unit;
      return [];
    },
    punchDashGroupData() {
      if (!this.punchDashboard) return [];
      if (this.punchDashView === 'package') return this.punchDashboard.by_package;
      if (this.punchDashView === 'area')    return this.punchDashboard.by_area;
      if (this.punchDashView === 'unit')    return this.punchDashboard.by_unit;
      return [];
    },
  },

  async mounted() {
    if (this.initialTab) {
      this.activeTab = this.initialTab;
    }
    await this.loadAll();
    // Preload approvals so the tab badge count shows up immediately, even
    // when the user hasn't clicked into the Approvals tab yet.
    if (this.canSeeApprovals) await this.loadApprovals();
    if (this.activeTab === 'punchlist') await this.loadPunches();
    if (this.activeTab === 'dashboard') await this.loadDashboard();
    this.checkPendingOpen();
    // Reports list (background-generated PDFs) — load up-front so the badge
    // shows even when the user has just landed on a non-Punchlist tab.
    this.loadPunchReports();
  },

  // Destroy charts on unmount so they don't linger in Chart.js's global
  // registry with detached canvases and throw on later animation frames.
  beforeUnmount() {
    if (this._itpStatusChart)   { try { this._itpStatusChart.destroy(); }   catch (e) {} this._itpStatusChart = null; }
    if (this._approvalPieChart) { try { this._approvalPieChart.destroy(); } catch (e) {} this._approvalPieChart = null; }
    if (this._punchStatusChart) { try { this._punchStatusChart.destroy(); } catch (e) {} this._punchStatusChart = null; }
    if (this._punchTrendChart)  { try { this._punchTrendChart.destroy(); }  catch (e) {} this._punchTrendChart = null; }
    if (this.punchReportsTimer) { clearTimeout(this.punchReportsTimer); this.punchReportsTimer = null; }
  },

  watch: {
    viewingItp(val) {
      this.$emit('record-change', val ? { type: 'itp', id: val.id } : null);
    },
    viewingPunch(val) {
      this.$emit('record-change', val ? { type: 'punch', id: val.id } : null);
    },
  },

  methods: {
    checkPendingOpen() {
      if (!this.pendingOpen) return;
      const { record_type, record_id } = this.pendingOpen;
      if (record_type === 'itp') {
        const r = this.itpRecords.find(x => x.id === record_id);
        if (!r) return;
        // Respect a specific tab hint from My Action Points:
        //   - 'register' for rejected ITPs (the creator/vendor needs to fix/resubmit)
        //   - 'approvals' for pending reviews
        // When no hint is provided, fall back to the approvals tab.
        const known = ['itp', 'register', 'approvals', 'punchlist', 'dashboard', 'setup'];
        const hinted = this.initialTab && known.includes(this.initialTab)
          ? this.initialTab
          : 'approvals';
        // 'register' is the common alias for the ITP tab — map it to 'itp'.
        this.activeTab = hinted === 'register' ? 'itp' : hinted;
        this.viewItp(r);
      } else if (record_type === 'punch') {
        this.activeTab = 'punchlist';
        // Ensure the punch list is loaded (it isn't when we arrive from another
        // tab) before trying to locate and open the record's detail form.
        (async () => {
          if (!this.punchItems || this.punchItems.length === 0) {
            try { await this.loadPunches(); } catch (e) { /* silent */ }
          }
          const p = (this.punchItems || []).find(x => x.id === record_id);
          if (p) this.openViewPunch(p);
        })();
      }
    },
    canEditItpRecord(r) {
      // Admin/owner unconditionally, or a vendor linked to that record's
      // package (backend enforces the same rule).
      if (this.canManage) return true;
      if (this.isVendor && r && r.package_id) {
        return this.vendorLinkedPackageIds.includes(r.package_id);
      }
      return false;
    },

    hasItpRejection(r) {
      // Any individual review has already been REJECTED — even while the
      // overall approval is still PENDING waiting for the other reviewer.
      return (r.pmc_reviewed && r.pmc_approved === false) ||
             (r.client_reviewed && r.client_approved === false) ||
             ((r.reviews || []).some(rv => rv.status === 'REJECTED'));
    },

    canResubmitItp(r) {
      // Same authz as canEditItpRecord. Shown whenever the record is
      // fully REJECTED, OR PENDING with at least one rejection (so the
      // linked vendor doesn't have to wait for the other reviewer).
      if (!this.canEditItpRecord(r)) return false;
      if (r.approval_status === 'REJECTED') return true;
      if (r.approval_status === 'PENDING' && this.hasItpRejection(r)) return true;
      return false;
    },

    async resubmitItp(r) {
      if (!confirm(`Resubmit ITP "${r.test}" for review?`)) return;
      try {
        await API.resubmitITP(r.id);
        await this.loadItp();
      } catch (e) {
        alert(e.message || 'Resubmit failed');
      }
    },

    async openItpHistory(r) {
      this.historyItp = r;
      this.itpHistoryEntries = [];
      this.itpHistoryError = '';
      this.itpHistoryLoading = true;
      try {
        this.itpHistoryEntries = await API.getITPHistory(r.id);
      } catch (e) {
        this.itpHistoryError = e.message || 'Failed to load history.';
      } finally {
        this.itpHistoryLoading = false;
      }
    },

    historyEventLabelItp(entry) {
      if (entry.event === 'SUBMIT') return 'Submitted for review';
      if (entry.event === 'RESUBMIT') return 'Resubmitted for review';
      if (entry.event === 'OVERRIDE') return 'Override — ' + (entry.approved ? 'Approved' : 'Rejected');
      const who = entry.event === 'PMC' ? 'PMC Technical' : 'Client Technical';
      return who + (entry.approved ? ' — Approved' : ' — Rejected');
    },

    historyEventClassItp(entry) {
      if (entry.event === 'SUBMIT' || entry.event === 'RESUBMIT') return 'bg-blue-100 text-blue-700';
      if (entry.approved === true) return 'bg-green-100 text-green-700';
      if (entry.approved === false) return 'bg-red-100 text-red-700';
      return 'bg-gray-100 text-gray-600';
    },

    fmtDateTimeItp(d) {
      if (!d) return '—';
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toLocaleString([], {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        timeZone: (window.AppSettings && window.AppSettings.timezone) || undefined,
      });
    },

    async loadAll() {
      this.loading = true;
      try {
        await Promise.all([this.loadItp(), this.loadSetup(), this.loadLookups()]);
      } finally {
        this.loading = false;
      }
    },

    async loadItp() {
      try {
        const params = {};
        const f = this.itpFilter;
        if (f.package_id)      params.package_id      = f.package_id;
        if (f.test_type_id)    params.test_type_id    = f.test_type_id;
        if (f.witness_level_id)params.witness_level_id= f.witness_level_id;
        if (f.area_id)         params.area_id         = f.area_id;
        if (f.unit_id)         params.unit_id         = f.unit_id;
        if (f.status)          params.status          = f.status;
        this.itpRecords = await API.listITP(params);
      } catch (e) {
        this.error = e.message;
      }
    },

    async loadSetup() {
      try {
        [this.testTypes, this.witnessLevels, this.obligationTimes] = await Promise.all([
          API.getITPTestTypes(),
          API.getITPWitnessLevels(),
          API.getObligationTimes(),
        ]);
      } catch (e) { /* silent */ }
    },

    async loadPunches() {
      this.punchLoading = true;
      try {
        const params = {};
        const f = this.punchFilter;
        if (f.package_id)         params.package_id         = f.package_id;
        if (f.status)             params.status             = f.status;
        if (f.obligation_time_id) params.obligation_time_id = f.obligation_time_id;
        if (f.area_id)            params.area_id            = f.area_id;
        if (f.unit_id)            params.unit_id            = f.unit_id;
        if (f.mine)               params.mine               = true;
        this.punchItems = await API.listPunches(params);
      } catch (e) {
        this.punchError = e.message;
      } finally {
        this.punchLoading = false;
      }
    },

    async loadLookups() {
      try {
        [this.packages, this.areas, this.units, this.floorplans] = await Promise.all([
          API.getPackages(),
          API.getAreas(),
          API.getUnits(),
          API.getFloorplans().catch(() => []),
        ]);
      } catch (e) { /* silent */ }
    },

    async loadDashboard() {
      try {
        const params = {};
        const f = this.dashFilter;
        if (f.package_id)       params.package_id       = f.package_id;
        if (f.test_type_id)     params.test_type_id     = f.test_type_id;
        if (f.witness_level_id) params.witness_level_id = f.witness_level_id;
        if (f.area_id)          params.area_id          = f.area_id;
        if (f.unit_id)          params.unit_id          = f.unit_id;
        const pf = this.punchDashFilter;
        const punchParams = {};
        if (pf.package_id) punchParams.package_id = pf.package_id;
        if (pf.area_id)    punchParams.area_id    = pf.area_id;
        if (pf.unit_id)    punchParams.unit_id    = pf.unit_id;
        [this.dashboard, this.punchDashboard] = await Promise.all([
          API.getITPDashboard(params),
          API.getPunchDashboard(punchParams),
        ]);
        this.$nextTick(() => this._renderDashCharts());
      } catch (e) { this.error = e.message; }
    },

    _renderDashCharts() {
      if (!this.dashboard) return;
      const t = this.dashboard.totals;
      const at = this.dashboard.approval_totals;

      // ── Vertical bar chart — ITP status ──────────────────────────────────
      const barCanvas = document.getElementById('qc-itp-status-bar');
      if (barCanvas) {
        if (this._itpStatusChart) this._itpStatusChart.destroy();
        this._itpStatusChart = new Chart(barCanvas, {
          type: 'bar',
          plugins: [ChartDataLabels],
          data: {
            labels: ['Draft', 'Planned', 'Passed', 'Failed'],
            datasets: [{
              data: [t.DRAFT, t.PLANNED, t.PASSED, t.FAILED],
              backgroundColor: ['#9CA3AF', '#3B82F6', '#10B981', '#EF4444'],
              borderRadius: 4,
              borderSkipped: false,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => ` ${ctx.parsed.y} record${ctx.parsed.y !== 1 ? 's' : ''}`,
                },
              },
              datalabels: {
                anchor: 'end',
                align: 'end',
                color: '#374151',
                font: { weight: 'bold', size: 13 },
                formatter: v => v > 0 ? v : '',
              },
            },
            scales: {
              x: { grid: { display: false } },
              y: {
                beginAtZero: true,
                ticks: { stepSize: 1, precision: 0 },
                grid: { color: '#F3F4F6' },
              },
            },
            layout: { padding: { top: 20 } },
          },
        });
      }

      // ── Pie chart — Approval status ───────────────────────────────────────
      const pieCanvas = document.getElementById('qc-approval-pie');
      if (pieCanvas) {
        if (this._approvalPieChart) this._approvalPieChart.destroy();
        const pieData = [at.TO_SUBMIT, at.PENDING, at.APPROVED, at.REJECTED];
        const pieTotal = pieData.reduce((a, b) => a + b, 0);

        // Custom plugin — outside labels with leader lines. For each slice
        // with a non-zero value, draw a connector from the arc edge out to
        // a label containing the category name + count / percentage.
        const outsideLabelPlugin = {
          id: 'outsideLabels',
          afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            const meta = chart.getDatasetMeta(0);
            const data = chart.data.datasets[0].data;
            const labels = chart.data.labels;
            const colors = chart.data.datasets[0].backgroundColor;
            const total = data.reduce((a, b) => a + (+b || 0), 0);
            if (total === 0) return;

            ctx.save();
            meta.data.forEach((arc, i) => {
              const value = +data[i] || 0;
              if (value === 0) return;
              const pct = (value / total * 100).toFixed(1);
              const cx = arc.x, cy = arc.y;
              const midA = (arc.startAngle + arc.endAngle) / 2;
              const outerR = arc.outerRadius;
              const cos = Math.cos(midA), sin = Math.sin(midA);
              const isRight = cos >= 0;

              const tipX   = cx + (outerR + 2)  * cos;
              const tipY   = cy + (outerR + 2)  * sin;
              const elbowX = cx + (outerR + 20) * cos;
              const elbowY = cy + (outerR + 20) * sin;
              const labelX = elbowX + (isRight ? 28 : -28);
              const labelY = elbowY;

              ctx.strokeStyle = colors[i] || '#6B7280';
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(tipX, tipY);
              ctx.lineTo(elbowX, elbowY);
              ctx.lineTo(labelX, labelY);
              ctx.stroke();

              ctx.beginPath();
              ctx.arc(labelX, labelY, 2.5, 0, Math.PI * 2);
              ctx.fillStyle = colors[i] || '#6B7280';
              ctx.fill();

              const textX = labelX + (isRight ? 6 : -6);
              ctx.textAlign = isRight ? 'left' : 'right';
              ctx.textBaseline = 'middle';

              ctx.font = '600 12px Barlow, sans-serif';
              ctx.fillStyle = '#374151';
              ctx.fillText(labels[i], textX, labelY - 8);
              ctx.font = '11px Barlow, sans-serif';
              ctx.fillStyle = '#6B7280';
              ctx.fillText(value + '  \u00b7  ' + pct + '%', textX, labelY + 8);
            });
            ctx.restore();
          },
        };

        this._approvalPieChart = new Chart(pieCanvas, {
          type: 'pie',
          plugins: [outsideLabelPlugin],
          data: {
            labels: ['To Submit', 'Approval Pending', 'Approved', 'Rejected'],
            datasets: [{
              data: pieData,
              backgroundColor: ['#9CA3AF', '#FCD34D', '#10B981', '#EF4444'],
              borderWidth: 2,
              borderColor: '#fff',
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            // Generous padding so the outside labels have room to sit.
            layout: { padding: { top: 22, bottom: 22, left: 110, right: 110 } },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => {
                    const pct = pieTotal > 0 ? ((ctx.parsed / pieTotal) * 100).toFixed(1) : 0;
                    return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                  },
                },
              },
              // Suppress the in-slice datalabels — we render outside instead.
              datalabels: { display: false },
            },
          },
        });
      }

      // ── Line chart — Open punches over time ───────────────────────────────
      if (this.punchDashboard) {
        const trendCanvas = this.$refs.punchTrendChart;
        const points = this.punchDashboard.open_punches_timeline || [];
        if (this._punchTrendChart) { this._punchTrendChart.destroy(); this._punchTrendChart = null; }
        if (trendCanvas && points.length > 0) {
          const labels = points.map(p => {
            const d = new Date(p.week + 'T00:00:00');
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
          });
          const series = points.map(p => p.open || 0);
          const maxVal = Math.max(1, ...series);
          this._punchTrendChart = new Chart(trendCanvas, {
            type: 'line',
            data: {
              labels,
              datasets: [{
                label: 'Open punches',
                data: series,
                borderColor: '#F59E0B',
                backgroundColor: 'rgba(245,158,11,0.12)',
                fill: true,
                tension: 0.25,
                pointRadius: 3,
                pointHoverRadius: 5,
                borderWidth: 2,
              }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    title: items => {
                      const p = points[items[0].dataIndex];
                      return p ? ('Week of ' + p.week) : '';
                    },
                    label: ctx => {
                      const p = points[ctx.dataIndex];
                      if (!p) return '';
                      const parts = [ctx.raw + ' open'];
                      if (p.opened) parts.push('+' + p.opened + ' opened');
                      if (p.closed) parts.push('-' + p.closed + ' closed');
                      return parts.join(' · ');
                    },
                  },
                },
                datalabels: { display: false },
              },
              scales: {
                x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 10 } } },
                y: {
                  beginAtZero: true,
                  suggestedMax: maxVal + 1,
                  ticks: { stepSize: 1, precision: 0, font: { size: 10 } },
                  grid: { color: '#F3F4F6' },
                },
              },
            },
          });
        }
      }

      // ── Vertical bar chart — Punch status ─────────────────────────────────
      if (this.punchDashboard) {
        const pt = this.punchDashboard.totals;
        const punchCanvas = document.getElementById('qc-punch-status-bar');
        if (punchCanvas) {
          if (this._punchStatusChart) this._punchStatusChart.destroy();
          this._punchStatusChart = new Chart(punchCanvas, {
            type: 'bar',
            plugins: [ChartDataLabels],
            data: {
              labels: ['Open', 'To Review', 'Closed'],
              datasets: [{
                data: [pt.OPEN, pt.TO_REVIEW, pt.CLOSED],
                backgroundColor: ['#3B82F6', '#F59E0B', '#10B981'],
                borderRadius: 4,
                borderSkipped: false,
              }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: ctx => ` ${ctx.parsed.y} item${ctx.parsed.y !== 1 ? 's' : ''}`,
                  },
                },
                datalabels: {
                  anchor: 'end',
                  align: 'end',
                  color: '#374151',
                  font: { weight: 'bold', size: 13 },
                  formatter: v => v > 0 ? v : '',
                },
              },
              scales: {
                x: { grid: { display: false } },
                y: {
                  beginAtZero: true,
                  ticks: { stepSize: 1, precision: 0 },
                  grid: { color: '#F3F4F6' },
                },
              },
              layout: { padding: { top: 20 } },
            },
          });
        }
      }
    },

    async loadApprovals() {
      this.approvalLoading = true;
      try {
        this.approvalRecords = await API.getITPApprovals();
      } catch (e) { this.error = e.message; }
      finally { this.approvalLoading = false; }
    },

    setTab(tab) {
      this.activeTab = tab;
      this.$emit('subtab-change', tab);
      if (tab === 'dashboard')  this.loadDashboard();
      if (tab === 'approvals')  this.loadApprovals();
      if (tab === 'punchlist')  this.loadPunches();
      if (tab === 'punchplans') {
        // Heatmap relies on the punch list — make sure it's loaded.
        if (!this.punchItems || !this.punchItems.length) this.loadPunches();
      }
    },

    resetItpFilters() {
      this.itpFilter = { package_id: null, test_type_id: null, witness_level_id: null, area_id: null, unit_id: null, status: null };
      this.loadItp();
    },

    resetDashFilters() {
      this.dashFilter = { package_id: null, test_type_id: null, witness_level_id: null, area_id: null, unit_id: null };
      this.loadDashboard();
    },

    resetPunchDashFilters() {
      this.punchDashFilter = { package_id: null, area_id: null, unit_id: null };
      this.loadDashboard();
    },

    // ── ITP CRUD ────────────────────────────────────────────────────────────

    openCreateItp() {
      this.itpModalMode = 'create';
      this.editingItpId = null;
      this.itpForm = {
        package_id: null, test_type_id: null, test: '', details: '',
        witness_level_id: null, area_id: null, unit_id: null,
        acceptance_criteria: '', planned_date: '', updated_at: null,
      };
      this.showItpModal = true;
    },

    openEditItp(r) {
      this.itpModalMode = 'edit';
      this.editingItpId = r.id;
      this.itpForm = {
        package_id: r.package_id,
        test_type_id: r.test_type_id,
        test: r.test || '',
        details: r.details || '',
        witness_level_id: r.witness_level_id,
        area_id: r.area_id,
        unit_id: r.unit_id,
        acceptance_criteria: r.acceptance_criteria || '',
        planned_date: r.planned_date || '',
        updated_at: r.updated_at,
      };
      this.showItpModal = true;
    },

    async saveItp() {
      if (!this.itpForm.package_id || !this.itpForm.test_type_id || !this.itpForm.test || !this.itpForm.witness_level_id) {
        alert('Package, Test Type, Test, and Witness Level are required.');
        return;
      }
      this.savingItp = true;
      try {
        const savedId = this.editingItpId;
        if (this.itpModalMode === 'create') {
          await API.createITP(this.itpForm);
        } else {
          await API.updateITP(this.editingItpId, this.itpForm);
        }
        this.showItpModal = false;
        await this.loadItp();
        // If the detail-view modal was open on this record, refresh it from
        // the updated list so the user lands back on the view with the new
        // values (and can still click Resubmit / Record Execution / etc.).
        if (this.viewingItp && savedId && this.viewingItp.id === savedId) {
          const refreshed = this.itpRecords.find(x => x.id === savedId);
          if (refreshed) this.viewingItp = refreshed;
        }
      } catch (e) {
        alert(e.message);
      } finally {
        this.savingItp = false;
      }
    },

    async deleteItp(r) {
      if (!confirm(`Delete ITP "${r.test}"?\nThis cannot be undone.`)) return;
      try {
        await API.deleteITP(r.id);
        await this.loadItp();
      } catch (e) { alert(e.message); }
    },

    // ── ITP Export / Import ─────────────────────────────────────────────────
    async exportItpExcel() {
      this.itpExporting = true;
      try {
        const params = new URLSearchParams();
        const f = this.itpFilter;
        if (f.package_id)       params.set('package_id',       f.package_id);
        if (f.test_type_id)     params.set('test_type_id',     f.test_type_id);
        if (f.witness_level_id) params.set('witness_level_id', f.witness_level_id);
        if (f.status)           params.set('status',           f.status);
        const qs = params.toString() ? '?' + params.toString() : '';
        const date = new Date().toISOString().split('T')[0];
        await API.download(`/api/itp/export/excel${qs}`, `itp_register_${date}.xlsx`);
      } catch (e) {
        alert('Export failed: ' + e.message);
      } finally { this.itpExporting = false; }
    },

    async exportItp() {
      try { await API.exportITP(); }
      catch (e) { alert(e.message || 'Export failed'); }
    },
    openItpImportModal() {
      this.showItpImportModal = true;
      this.itpImportFile = null;
      this.itpImportPreview = null;
      this.itpImportError = '';
      this.itpImportResult = null;
    },
    resetItpImport() {
      if (this.itpImportPreview) {
        this.itpImportPreview = null;
        this.itpImportError = '';
      } else {
        this.showItpImportModal = false;
      }
    },
    onItpImportFileChange(e) {
      this.itpImportFile = e.target.files[0] || null;
      this.itpImportError = '';
    },
    async runItpImportPreview() {
      if (!this.itpImportFile) return;
      this.itpImportLoading = true;
      this.itpImportError = '';
      try {
        this.itpImportPreview = await API.previewITPImport(this.itpImportFile);
      } catch (e) {
        this.itpImportError = e.message || 'Preview failed';
      } finally {
        this.itpImportLoading = false;
      }
    },
    async applyItpImport() {
      if (!this.itpImportPreview) return;
      this.itpImportApplying = true;
      this.itpImportError = '';
      try {
        this.itpImportResult = await API.applyITPImport({ rows: this.itpImportPreview.rows });
      } catch (e) {
        this.itpImportError = e.message || 'Import failed';
      } finally {
        this.itpImportApplying = false;
      }
    },

    async planItp(r) {
      if (!r.planned_date) {
        alert('A planned date is required before moving to PLANNED status. Please edit the record first.');
        return;
      }
      if (!confirm(`Move ITP "${r.test}" to PLANNED?\nThis will create review records for the package's technical reviewers.`)) return;
      try {
        await API.planITP(r.id);
        await this.loadItp();
      } catch (e) { alert(e.message); }
    },

    openExecuteModal(r) {
      this.executingItpId = r.id;
      this.executingItpUpdatedAt = r.updated_at;
      this.executeForm = { status: 'PASSED', result: '', executed_date: new Date().toISOString().slice(0, 10) };
      this.showExecuteModal = true;
    },

    async submitExecute() {
      if (!this.executeForm.result) { alert('Please enter a result description.'); return; }
      try {
        await API.executeITP(this.executingItpId, {
          ...this.executeForm,
          updated_at: this.executingItpUpdatedAt,
        });
        this.showExecuteModal = false;
        await this.loadItp();
      } catch (e) { alert(e.message); }
    },

    openReviewModal(r) {
      // Open the full ITP detail modal and switch straight into the
      // inline review form, so the reviewer sees every field + attachments
      // before approving or rejecting.
      this.viewItp(r);
      this.inlineReviewForm = { status: 'APPROVED', comment: '' };
      this.inlineReviewError = '';
      this.inlineReviewing = true;
    },

    startInlineReview() {
      this.inlineReviewForm = { status: 'APPROVED', comment: '' };
      this.inlineReviewError = '';
      this.inlineReviewing = true;
    },

    async submitInlineReview() {
      if (!this.inlineReviewForm.comment || !this.inlineReviewForm.comment.trim()) {
        this.inlineReviewError = 'A comment is required.';
        return;
      }
      if (!this.viewingItp) return;
      this.inlineReviewSaving = true;
      this.inlineReviewError = '';
      try {
        const updated = await API.reviewITP(this.viewingItp.id, this.inlineReviewForm);
        // Refresh the viewing record with the server response so the review
        // status pills update in-place without closing the modal.
        this.viewingItp = updated;
        this.inlineReviewing = false;
        await this.loadItp();
        if (this.activeTab === 'approvals') await this.loadApprovals();
      } catch (e) {
        this.inlineReviewError = e.message || 'Failed to submit review';
      } finally {
        this.inlineReviewSaving = false;
      }
    },

    async submitReview() {
      if (!this.reviewForm.comment || !this.reviewForm.comment.trim()) {
        alert('A comment is required.');
        return;
      }
      try {
        await API.reviewITP(this.reviewingItpId, this.reviewForm);
        this.showReviewModal = false;
        await this.loadItp();
        if (this.activeTab === 'approvals') await this.loadApprovals();
      } catch (e) { alert(e.message); }
    },

    hasPendingReview(r) {
      if (!this.currentUser || !this.currentUser.contact_id) return false;
      const cid = this.currentUser.contact_id;
      if (r.pmc_reviewer_contact_id === cid && !r.pmc_reviewed) return true;
      if (r.client_reviewer_contact_id === cid && !r.client_reviewed) return true;
      return false;
    },

    canOverrideReview(r) {
      if (!this.canManage) return false;
      return r.approval_status && r.approval_status !== 'TO_SUBMIT';
    },

    openOverrideModal(itpRecord) {
      this.overridingItpId = itpRecord.id;
      this.overrideReviewerName = 'both reviewers';
      this.overrideForm = { status: 'APPROVED', comment: '' };
      this.showOverrideModal = true;
    },

    async submitOverride() {
      try {
        await API.overrideITPReview(this.overridingItpId, this.overrideForm);
        this.showOverrideModal = false;
        await this.loadApprovals();
        await this.loadItp();
      } catch (e) { alert(e.message); }
    },

    async viewItp(r) {
      this.viewingItp = r;
      this.newItpNote = '';
      this.itpNotes = [];
      this.inlineReviewing = false;
      this.inlineReviewError = '';
      try {
        this.itpNotes = await API.listITPNotes(r.id);
      } catch (e) { /* silent */ }
    },

    async addItpNote() {
      if (!this.newItpNote.trim()) return;
      this.savingItpNote = true;
      try {
        const note = await API.addITPNote(this.viewingItp.id, { content: this.newItpNote.trim() });
        this.itpNotes.push(note);
        this.newItpNote = '';
      } catch (e) { alert(e.message); }
      finally { this.savingItpNote = false; }
    },

    async deleteItpNote(n) {
      if (!confirm('Delete this note?')) return;
      try {
        await API.deleteITPNote(this.viewingItp.id, n.id);
        this.itpNotes = this.itpNotes.filter(x => x.id !== n.id);
      } catch (e) { alert(e.message); }
    },

    canDeleteItpNote(n) {
      if (!this.currentUser) return false;
      if (['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role)) return true;
      return n.author_id === this.currentUser.id;
    },

    // ── Test Types CRUD ─────────────────────────────────────────────────────

    openCreateTestType() {
      this.editingTestTypeId = null;
      this.testTypeForm = { name: '', description: '', sort_order: 0, updated_at: null };
      this.showTestTypeModal = true;
    },

    openEditTestType(tt) {
      this.editingTestTypeId = tt.id;
      this.testTypeForm = { name: tt.name, description: tt.description || '', sort_order: tt.sort_order, updated_at: tt.updated_at };
      this.showTestTypeModal = true;
    },

    async saveTestType() {
      if (!this.testTypeForm.name) { alert('Name is required.'); return; }
      try {
        if (this.editingTestTypeId) {
          await API.updateITPTestType(this.editingTestTypeId, this.testTypeForm);
        } else {
          await API.createITPTestType(this.testTypeForm);
        }
        this.showTestTypeModal = false;
        await this.loadSetup();
      } catch (e) { alert(e.message); }
    },

    async deleteTestType(tt) {
      if (!confirm(`Delete test type "${tt.name}"?`)) return;
      try {
        await API.deleteITPTestType(tt.id);
        await this.loadSetup();
      } catch (e) { alert(e.message); }
    },

    // ── Witness Levels CRUD ─────────────────────────────────────────────────

    openCreateWitnessLevel() {
      this.editingWitnessLevelId = null;
      this.witnessLevelForm = { code: '', name: '', description: '', sort_order: 0, updated_at: null };
      this.showWitnessLevelModal = true;
    },

    openEditWitnessLevel(wl) {
      this.editingWitnessLevelId = wl.id;
      this.witnessLevelForm = { code: wl.code, name: wl.name, description: wl.description || '', sort_order: wl.sort_order, updated_at: wl.updated_at };
      this.showWitnessLevelModal = true;
    },

    async saveWitnessLevel() {
      if (!this.witnessLevelForm.code || !this.witnessLevelForm.name) { alert('Code and Name are required.'); return; }
      try {
        if (this.editingWitnessLevelId) {
          await API.updateITPWitnessLevel(this.editingWitnessLevelId, this.witnessLevelForm);
        } else {
          await API.createITPWitnessLevel(this.witnessLevelForm);
        }
        this.showWitnessLevelModal = false;
        await this.loadSetup();
      } catch (e) { alert(e.message); }
    },

    async deleteWitnessLevel(wl) {
      if (!confirm(`Delete witness level "${wl.code} – ${wl.name}"?`)) return;
      try {
        await API.deleteITPWitnessLevel(wl.id);
        await this.loadSetup();
      } catch (e) { alert(e.message); }
    },

    // ── Styling helpers ─────────────────────────────────────────────────────

    statusBadge(status) {
      const map = {
        DRAFT:   'background:#E5E7EB;color:#374151',
        PLANNED: 'background:#DBEAFE;color:#1D4ED8',
        PASSED:  'background:#D1FAE5;color:#065F46',
        FAILED:  'background:#FEE2E2;color:#991B1B',
      };
      return map[status] || map.DRAFT;
    },

    approvalBadge(status) {
      const map = {
        TO_SUBMIT: 'background:#F3F4F6;color:#6B7280',
        PENDING:   'background:#FEF3C7;color:#92400E',
        APPROVED:  'background:#D1FAE5;color:#065F46',
        REJECTED:  'background:#FEE2E2;color:#991B1B',
      };
      return map[status] || map.TO_SUBMIT;
    },

    approvalLabel(status) {
      const map = {
        TO_SUBMIT: 'To Submit',
        PENDING:   'Pending',
        APPROVED:  'Approved',
        REJECTED:  'Rejected',
      };
      return map[status] || status;
    },

    witnessLevelBadge(code) {
      const map = {
        H: 'background:#FEE2E2;color:#991B1B',
        W: 'background:#FEF3C7;color:#92400E',
        R: 'background:#DBEAFE;color:#1D4ED8',
        I: 'background:#F3F4F6;color:#374151',
      };
      return map[code] || map.I;
    },

    dashCountBar(counts) {
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (!total) return [];
      const colors = { DRAFT: '#9CA3AF', PLANNED: '#3B82F6', PASSED: '#10B981', FAILED: '#EF4444' };
      return Object.entries(counts)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ status: k, pct: (v / total * 100).toFixed(1), color: colors[k] || '#9CA3AF', count: v }));
    },

    punchCountBar(counts) {
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (!total) return [];
      const colors = { OPEN: '#3B82F6', TO_REVIEW: '#F59E0B', CLOSED: '#10B981' };
      const labels = { OPEN: 'Open', TO_REVIEW: 'To Review', CLOSED: 'Closed' };
      return Object.entries(counts)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ status: labels[k] || k, pct: (v / total * 100).toFixed(1), color: colors[k] || '#9CA3AF', count: v }));
    },

    // ── Obligation Times ─────────────────────────────────────────────────────
    openCreateObligationTime() {
      this.editingObligationTimeId = null;
      this.obligationTimeForm = { code: '', name: '', sort_order: 0, updated_at: null };
      this.showObligationTimeModal = true;
    },

    openEditObligationTime(ot) {
      this.editingObligationTimeId = ot.id;
      this.obligationTimeForm = { code: ot.code, name: ot.name, sort_order: ot.sort_order, updated_at: ot.updated_at };
      this.showObligationTimeModal = true;
    },

    async saveObligationTime() {
      if (!this.obligationTimeForm.code.trim() || !this.obligationTimeForm.name.trim()) {
        alert('Code and name are required.');
        return;
      }
      try {
        if (this.editingObligationTimeId) {
          await API.updateObligationTime(this.editingObligationTimeId, this.obligationTimeForm);
        } else {
          await API.createObligationTime(this.obligationTimeForm);
        }
        this.showObligationTimeModal = false;
        await this.loadSetup();
      } catch (e) {
        alert(e.message || 'Save failed.');
      }
    },

    async deleteObligationTime(ot) {
      if (!confirm(`Delete "${ot.code} – ${ot.name}"?`)) return;
      try {
        await API.deleteObligationTime(ot.id);
        await this.loadSetup();
      } catch (e) {
        alert(e.message || 'Delete failed.');
      }
    },

    // ── Punchlist ────────────────────────────────────────────────────────────
    async exportExcel() {
      this.exporting = true;
      try {
        const params = new URLSearchParams();
        const f = this.punchFilter;
        if (f.package_id)         params.set('package_id',         f.package_id);
        if (f.obligation_time_id) params.set('obligation_time_id', f.obligation_time_id);
        if (f.area_id)            params.set('area_id',            f.area_id);
        if (f.unit_id)            params.set('unit_id',            f.unit_id);
        if (f.status)             params.set('status',             f.status);
        const qs = params.toString() ? '?' + params.toString() : '';
        const date = new Date().toISOString().split('T')[0];
        await API.download(`/api/punch-items/export/excel${qs}`, `punchlist_${date}.xlsx`);
      } catch (e) {
        alert('Export failed: ' + e.message);
      } finally { this.exporting = false; }
    },

    resetPunchFilters() {
      this.punchFilter = { package_id: null, status: null, obligation_time_id: null, area_id: null, unit_id: null, mine: false };
      this.loadPunches();
    },

    toggleMyPunches() {
      this.punchFilter.mine = !this.punchFilter.mine;
      this.loadPunches();
    },

    punchStatusBadge(status) {
      const map = {
        DRAFT:     'background:#FEF3C7;color:#92400E;border:1px solid #FCD34D',
        OPEN:      'background:#DBEAFE;color:#1E40AF',
        TO_REVIEW: 'background:#EDE9FE;color:#5B21B6',
        CLOSED:    'background:#D1FAE5;color:#065F46',
      };
      return map[status] || '';
    },

    openCreatePunch() {
      this.punchModalMode = 'create';
      this.editingPunchId = null;
      this.currentPunchStatus = null;
      this.punchForm = {
        package_id: null, obligation_time_id: null, itp_record_id: null,
        area_id: null, unit_id: null, topic: '', details: '',
        floorplan_id: null, floorplan_x: null, floorplan_y: null,
        updated_at: null,
      };
      this.pinTouched = false;
      this.punchError = null;
      this.showPunchModal = true;
    },

    // Inline shortcut from the ITP register: open the punch-list create modal
    // pre-filled with the package + ITP record (and area/unit when present).
    openCreatePunchForItp(r) {
      this.punchModalMode = 'create';
      this.editingPunchId = null;
      this.currentPunchStatus = null;
      this.punchForm = {
        package_id: r.package_id,
        obligation_time_id: null,
        itp_record_id: r.id,
        area_id: r.area_id || null,
        unit_id:  r.unit_id  || null,
        topic: '',
        details: '',
        floorplan_id: null, floorplan_x: null, floorplan_y: null,
        updated_at: null,
      };
      this.pinTouched = false;
      this.punchError = null;
      this.showPunchModal = true;
      // Prefetch the area's floorplan thumbnail so the picker is responsive
      // when the user opens it on a tablet.
      if (r.area_id) {
        const fp = this.currentAreaFloorplan;
        if (fp) this.loadThumbnailBlob(fp.id);
      }
    },

    openEditPunch(p) {
      this.punchModalMode = 'edit';
      this.editingPunchId = p.id;
      this.currentPunchStatus = p.status || null;
      this.punchForm = {
        package_id: p.package_id, obligation_time_id: p.obligation_time_id,
        itp_record_id: p.itp_record_id, area_id: p.area_id, unit_id: p.unit_id,
        topic: p.topic, details: p.details,
        floorplan_id: p.floorplan_id || null,
        floorplan_x:  (p.floorplan_x != null) ? p.floorplan_x : null,
        floorplan_y:  (p.floorplan_y != null) ? p.floorplan_y : null,
        updated_at: p.updated_at,
      };
      this.pinTouched = false;
      if (p.floorplan_id) this.loadThumbnailBlob(p.floorplan_id);
      else {
        const fp = this.currentAreaFloorplan;
        if (fp) this.loadThumbnailBlob(fp.id);
      }
      this.punchError = null;
      this.showPunchModal = true;
    },

    // ── Floorplan helpers (shared by punch modal + heatmap) ──────────────
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
      this.floorplanDims = {
        ...this.floorplanDims,
        [fpId]: { w: img.naturalWidth, h: img.naturalHeight },
      };
    },
    floorplanAspect(fpId) {
      const d = this.floorplanDims[fpId];
      return d ? (d.w + ' / ' + d.h) : '4 / 3';
    },

    // ── Pin picker (modal child) ──────────────────────────────────────────
    openPinPicker() {
      if (!this.canEditPin) return;
      const fp = this.currentAreaFloorplan;
      if (!fp) return;
      this.showPinPicker = true;
    },
    onPinSave(coords) {
      const fp = this.currentAreaFloorplan;
      if (!fp) { this.showPinPicker = false; return; }
      this.punchForm.floorplan_id = fp.id;
      this.punchForm.floorplan_x = coords.x;
      this.punchForm.floorplan_y = coords.y;
      this.pinTouched = true;
      this.showPinPicker = false;
    },
    onPinClear() {
      this.punchForm.floorplan_id = null;
      this.punchForm.floorplan_x  = null;
      this.punchForm.floorplan_y  = null;
      this.pinTouched = true;
      this.showPinPicker = false;
    },
    onPinCancel() { this.showPinPicker = false; },

    // ── Punchlist PDF export ──────────────────────────────────────────────
    openPunchExportModal() {
      this.punchExportFilters = {
        package_ids: [],
        area_ids: [],
        statuses: [],
        group_by: 'package_area',
        per_package_plans: false,
      };
      this.punchExportError = '';
      this.showPunchExportModal = true;
    },
    closePunchExportModal() {
      if (this.punchExporting) return;
      this.showPunchExportModal = false;
    },
    togglePunchExportArrayValue(key, value) {
      const arr = this.punchExportFilters[key];
      const idx = arr.indexOf(value);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(value);
    },
    togglePunchSelectAll(key, ids) {
      const arr = this.punchExportFilters[key];
      if (arr.length === ids.length) {
        this.punchExportFilters[key] = [];
      } else {
        this.punchExportFilters[key] = [...ids];
      }
    },
    async runPunchExport() {
      this.punchExporting = true;
      this.punchExportError = '';
      try {
        await API.exportPunchListPdf(this.punchExportFilters);
        this.showPunchExportModal = false;
        await this.loadPunchReports();
        alert(
          'Your report is being generated in the background.\n\n' +
          'You can download it from the "Reports" tab once it is ready.'
        );
      } catch (e) {
        this.punchExportError = e.message || 'Export failed.';
      } finally {
        this.punchExporting = false;
      }
    },

    // ── Punch reports list (background-generated PDFs) ────────────────────
    async loadPunchReports() {
      this.punchReportsLoading = true;
      try {
        this.recentPunchReports = await API.listReports('punch', 15);
      } catch (e) {
        console.error('Load punch reports failed', e);
      } finally {
        this.punchReportsLoading = false;
        this.schedulePunchReportsPoll();
      }
    },
    schedulePunchReportsPoll() {
      if (this.punchReportsTimer) { clearTimeout(this.punchReportsTimer); this.punchReportsTimer = null; }
      const hasActive = (this.recentPunchReports || []).some(r =>
        r.status === 'PENDING' || r.status === 'GENERATING'
      );
      if (hasActive) {
        this.punchReportsTimer = setTimeout(() => this.loadPunchReports(), 4000);
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
    fmtReportFileSize(bytes) {
      if (bytes == null) return '';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },
    fmtReportDateTime(iso) {
      if (!iso) return '';
      try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
    },
    async onDownloadPunchReport(r) {
      try {
        const fname = `punch_list_${(r.requested_at || '').slice(0,10)}.pdf`;
        await API.downloadReport(r.id, fname);
      } catch (e) {
        alert(e.message || 'Download failed');
      }
    },
    async onDeletePunchReport(r) {
      if (!confirm('Delete this report?')) return;
      try {
        await API.deleteReport(r.id);
        await this.loadPunchReports();
      } catch (e) {
        alert(e.message || 'Delete failed');
      }
    },

    onPunchAreaChanged() {
      // Area changed in the modal — drop any pin that no longer matches the
      // new area's floorplan, and lazy-load the new thumbnail.
      const fp = this.currentAreaFloorplan;
      if (fp) this.loadThumbnailBlob(fp.id);
      const targetFpId = fp ? fp.id : null;
      if (this.punchForm.floorplan_id && this.punchForm.floorplan_id !== targetFpId) {
        this.punchForm.floorplan_id = null;
        this.punchForm.floorplan_x  = null;
        this.punchForm.floorplan_y  = null;
        this.pinTouched = true;
      }
    },

    // ── Heatmap helpers ───────────────────────────────────────────────────
    clusterPins(pins) {
      const groups = this.greedyGroup(pins, 0.05);
      const singletons = [];
      const clusters = [];
      groups.forEach((g, idx) => {
        if (g.length >= 5) {
          const cx = g.reduce((s, p) => s + p.floorplan_x, 0) / g.length;
          const cy = g.reduce((s, p) => s + p.floorplan_y, 0) / g.length;
          clusters.push({ key: 'c-' + idx, x: cx, y: cy, items: g });
        } else {
          g.forEach(p => singletons.push(p));
        }
      });
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
      return Math.min(64, 26 + Math.round(Math.sqrt(count) * 5));
    },
    pinColor(p) {
      if (p.status === 'CLOSED')   return '#9ca3af'; // gray
      if (p.status === 'TO_REVIEW') return '#f59e0b'; // amber
      return '#dc2626';                              // red — open
    },
    isFloorplanExpanded(fpId) {
      return this.expandAll || !!this.expandedFloorplans[fpId];
    },
    toggleFloorplan(fpId) {
      this.expandedFloorplans = {
        ...this.expandedFloorplans,
        [fpId]: !this.expandedFloorplans[fpId],
      };
      if (this.expandedFloorplans[fpId]) this.loadThumbnailBlob(fpId);
    },
    toggleExpandAll() {
      this.expandAll = !this.expandAll;
      if (this.expandAll) {
        for (const fp of this.floorplansWithPins) this.loadThumbnailBlob(fp.id);
      }
    },
    expandCluster(fpId, idx) { this.heatExpanded = { fpId, idx }; },
    collapseCluster() { this.heatExpanded = null; },
    isClusterExpanded(fpId, idx) {
      return this.heatExpanded
        && this.heatExpanded.fpId === fpId
        && this.heatExpanded.idx === idx;
    },
    async openHeatmapPin(p) {
      // The view modal is rendered at the top level — open it on top of
      // the floorplan tab without navigating away.
      await this.openViewPunch(p);
    },

    async savePunch() {
      if (!this.punchForm.package_id) { this.punchError = 'Package is required.'; return; }
      if (!this.punchForm.obligation_time_id) { this.punchError = 'Obligation time is required.'; return; }
      if (!this.punchForm.topic.trim()) { this.punchError = 'Topic is required.'; return; }
      if (!this.punchForm.details.trim()) { this.punchError = 'Details are required.'; return; }
      this.savingPunch = true;
      this.punchError = null;
      try {
        const payload = {
          package_id: this.punchForm.package_id,
          obligation_time_id: this.punchForm.obligation_time_id,
          itp_record_id: this.punchForm.itp_record_id,
          area_id: this.punchForm.area_id,
          unit_id: this.punchForm.unit_id,
          topic: this.punchForm.topic,
          details: this.punchForm.details,
          updated_at: this.punchForm.updated_at,
        };
        if (this.punchModalMode === 'create') {
          if (this.punchForm.floorplan_id != null) {
            payload.floorplan_id = this.punchForm.floorplan_id;
            payload.floorplan_x  = this.punchForm.floorplan_x;
            payload.floorplan_y  = this.punchForm.floorplan_y;
          }
        } else if (this.pinTouched) {
          if (this.punchForm.floorplan_id != null) {
            payload.floorplan_id = this.punchForm.floorplan_id;
            payload.floorplan_x  = this.punchForm.floorplan_x;
            payload.floorplan_y  = this.punchForm.floorplan_y;
          } else {
            payload.clear_pin = true;
          }
        }
        let saved;
        if (this.punchModalMode === 'edit') {
          saved = await API.updatePunch(this.editingPunchId, payload);
        } else {
          saved = await API.createPunch(payload);
        }
        this.pinTouched = false;
        await this.loadPunches();
        // After the very first save, keep the modal open and switch to edit
        // mode so the user can attach files and then explicitly Submit.
        if (this.punchModalMode === 'create' && saved && saved.id) {
          this.punchModalMode = 'edit';
          this.editingPunchId = saved.id;
          this.currentPunchStatus = saved.status || 'DRAFT';
          if (saved.updated_at) this.punchForm.updated_at = saved.updated_at;
        } else if (saved && saved.status) {
          this.currentPunchStatus = saved.status;
          if (saved.updated_at) this.punchForm.updated_at = saved.updated_at;
        }
      } catch (e) {
        this.punchError = e.message || 'Save failed.';
      } finally {
        this.savingPunch = false;
      }
    },

    async submitPunchDraft() {
      if (!this.editingPunchId) return;
      if (this.currentPunchStatus !== 'DRAFT') return;
      this.submittingPunch = true;
      this.punchError = null;
      try {
        const saved = await API.submitPunchDraft(this.editingPunchId);
        this.currentPunchStatus = saved.status || 'OPEN';
        if (saved.updated_at) this.punchForm.updated_at = saved.updated_at;
        await this.loadPunches();
        this.showPunchModal = false;
      } catch (e) {
        this.punchError = e.message || 'Submit failed.';
      } finally {
        this.submittingPunch = false;
      }
    },

    async deletePunch(p) {
      if (!confirm(`Delete punch item "${p.topic}"?`)) return;
      try {
        await API.deletePunch(p.id);
        await this.loadPunches();
      } catch (e) {
        alert(e.message || 'Delete failed.');
      }
    },

    async openViewPunch(p) {
      this.viewingPunch = p;
      this.newPunchNote = '';
      this.punchNotes = [];
      if (p && p.floorplan_id) this.loadThumbnailBlob(p.floorplan_id);
      try {
        this.punchNotes = await API.listPunchNotes(p.id);
      } catch (e) { /* silent */ }
    },

    async addPunchNote() {
      if (!this.newPunchNote.trim()) return;
      this.savingPunchNote = true;
      try {
        const note = await API.addPunchNote(this.viewingPunch.id, { content: this.newPunchNote.trim() });
        this.punchNotes.push(note);
        this.newPunchNote = '';
      } catch (e) { alert(e.message); }
      finally { this.savingPunchNote = false; }
    },

    async deletePunchNote(n) {
      if (!confirm('Delete this note?')) return;
      try {
        await API.deletePunchNote(this.viewingPunch.id, n.id);
        this.punchNotes = this.punchNotes.filter(x => x.id !== n.id);
      } catch (e) { alert(e.message); }
    },

    canDeletePunchNote(n) {
      if (!this.currentUser) return false;
      if (['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role)) return true;
      return n.author_id === this.currentUser.id;
    },

    openRespondPunch(p) {
      this.viewingPunch = p;
      this.respondForm = { response: p.response || '', updated_at: p.updated_at };
      this.showRespondModal = true;
    },

    async submitRespondPunch() {
      if (!this.respondForm.response.trim()) { this.punchError = 'Response is required.'; return; }
      this.punchError = null;
      try {
        await API.respondPunch(this.viewingPunch.id, this.respondForm);
        this.showRespondModal = false;
        this.viewingPunch = null;
        await this.loadPunches();
      } catch (e) {
        this.punchError = e.message || 'Submit failed.';
      }
    },

    openPunchReview(p) {
      this.viewingPunch = p;
      this.punchReviewForm = { action: 'CLOSE', comment: '', updated_at: p.updated_at };
      this.punchError = null;
      this.showPunchReviewModal = true;
    },

    async submitPunchReview() {
      this.punchError = null;
      try {
        await API.reviewPunch(this.viewingPunch.id, this.punchReviewForm);
        this.showPunchReviewModal = false;
        this.viewingPunch = null;
        await this.loadPunches();
      } catch (e) {
        this.punchError = e.message || 'Review failed.';
      }
    },

    openPunchOverride(p) {
      this.viewingPunch = p;
      this.punchOverrideForm = { status: p.status, updated_at: p.updated_at };
      this.punchError = null;
      this.showPunchOverrideModal = true;
    },

    async submitPunchOverride() {
      this.punchError = null;
      try {
        await API.overridePunchStatus(this.viewingPunch.id, this.punchOverrideForm);
        this.showPunchOverrideModal = false;
        this.viewingPunch = null;
        await this.loadPunches();
      } catch (e) {
        this.punchError = e.message || 'Override failed.';
      }
    },
  },

  template: `
<div>
  <!-- Tab bar -->
  <div class="sub-tab-bar mb-6">
    <button :class="['sub-tab', activeTab === 'itp' ? 'active' : '']" @click="setTab('itp')">
      ITP Register
    </button>
    <button v-if="canSeeApprovals" :class="['sub-tab', activeTab === 'approvals' ? 'active' : '']" @click="setTab('approvals')">
      Approvals
      <span v-if="approvalRecords.length > 0" class="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{{ approvalRecords.length }}</span>
    </button>
    <button :class="['sub-tab', activeTab === 'punchlist' ? 'active' : '']" @click="setTab('punchlist')">
      Punchlist
    </button>
    <button :class="['sub-tab', activeTab === 'punchplans' ? 'active' : '']" @click="setTab('punchplans')">
      Floorplan view
    </button>
    <button :class="['sub-tab', activeTab === 'dashboard' ? 'active' : '']" @click="setTab('dashboard')">
      Dashboard
    </button>
    <button :class="['sub-tab', activeTab === 'reports' ? 'active' : '']" @click="setTab('reports')">
      Reports
      <span v-if="activePunchReportsCount > 0"
            class="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">{{ activePunchReportsCount }}</span>
    </button>
    <button v-if="canManage" :class="['sub-tab', activeTab === 'setup' ? 'active' : '']" @click="setTab('setup')">
      Setup
    </button>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       ITP REGISTER TAB
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="activeTab === 'itp'">

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <button v-if="canCreateItp" @click="openCreateItp" class="btn-primary">
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        New ITP Record
      </button>

      <select v-model="itpFilter.package_id" @change="loadItp" class="input-field" style="width:auto;min-width:140px">
        <option :value="null">All Packages</option>
        <option v-for="p in itpAvailablePackages" :key="p.id" :value="p.id">{{ p.tag_number }}</option>
      </select>
      <select v-model="itpFilter.test_type_id" @change="loadItp" class="input-field" style="width:auto;min-width:150px">
        <option :value="null">All Test Types</option>
        <option v-for="tt in testTypes" :key="tt.id" :value="tt.id">{{ tt.name }}</option>
      </select>
      <select v-model="itpFilter.witness_level_id" @change="loadItp" class="input-field" style="width:auto;min-width:140px">
        <option :value="null">All Witness Levels</option>
        <option v-for="wl in witnessLevels" :key="wl.id" :value="wl.id">{{ wl.code }} – {{ wl.name }}</option>
      </select>
      <select v-model="itpFilter.area_id" @change="loadItp" class="input-field" style="width:auto;min-width:120px">
        <option :value="null">All Areas</option>
        <option v-for="a in areas" :key="a.id" :value="a.id">{{ a.tag }}</option>
      </select>
      <select v-model="itpFilter.unit_id" @change="loadItp" class="input-field" style="width:auto;min-width:120px">
        <option :value="null">All Units</option>
        <option v-for="u in units" :key="u.id" :value="u.id">{{ u.tag }}</option>
      </select>
      <select v-model="itpFilter.status" @change="loadItp" class="input-field" style="width:auto;min-width:130px">
        <option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
      <button @click="resetItpFilters" class="btn-secondary text-sm">Clear Filters</button>
      <span class="ml-auto text-sm text-gray-500">{{ itpRecords.length }} record(s)</span>
      <div class="flex items-center gap-2">
        <button @click="exportItpExcel" :disabled="itpExporting" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          {{ itpExporting ? 'Exporting...' : 'Export Excel' }}
        </button>
        <button @click="exportItp" class="btn-secondary text-sm flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 8l-3-3m3 3l3-3"/></svg>
          Export
        </button>
        <button v-if="canCreateItp" @click="openItpImportModal" class="btn-secondary text-sm flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 4v12m0-4l-3 3m3-3l3 3"/></svg>
          Import
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-12 text-gray-500"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>

    <div v-else-if="itpRecords.length === 0" class="text-center py-12 text-gray-400">
      <svg class="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
      </svg>
      <p class="text-gray-500 font-medium">No ITP records found</p>
      <p v-if="canManage" class="text-sm mt-1">Click "New ITP Record" to get started.</p>
    </div>

    <div v-else class="card overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <th class="text-left px-3 py-2 w-16">ID</th>
            <th class="text-left px-3 py-2 w-24">Package</th>
            <th class="text-left px-3 py-2">Test</th>
            <th class="text-left px-3 py-2 w-16">Witness</th>
            <th class="text-left px-3 py-2 w-24">Area / Unit</th>
            <th class="text-left px-3 py-2 w-20">Status</th>
            <th class="text-left px-3 py-2 w-64 whitespace-nowrap">Approvals</th>
            <th class="text-left px-3 py-2 w-28 whitespace-nowrap">Approval Status</th>
            <th class="text-left px-3 py-2 w-24 whitespace-nowrap">Planned</th>
            <th class="px-3 py-2 w-44"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in itpRecords" :key="r.id" class="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer" @click="viewItp(r)">
            <td class="px-3 py-2 text-xs text-gray-400 font-mono whitespace-nowrap">IT-{{ String(r.seq_id || r.id).padStart(6,'0') }}</td>
            <td class="px-3 py-2 whitespace-nowrap" :title="r.package_name || ''">
              <span class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ r.package_tag }}</span>
            </td>
            <td class="px-3 py-2 text-sm text-gray-800" :title="(r.details ? r.details : r.test) || ''">
              <div class="flex items-center gap-1.5">
                <span class="truncate">{{ r.test }}</span>
                <span v-if="r.open_punches_count > 0"
                  class="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none"
                  :title="r.open_punches_count + ' open punch item' + (r.open_punches_count === 1 ? '' : 's')">
                  {{ r.open_punches_count }}
                </span>
              </div>
            </td>
            <td class="px-3 py-2">
              <span class="px-2 py-0.5 rounded text-xs font-bold" :style="witnessLevelBadge(r.witness_level_code)">
                {{ r.witness_level_code }}
              </span>
            </td>
            <td class="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
              <span v-if="r.area_tag">{{ r.area_tag }}</span>
              <span v-if="r.area_tag && r.unit_tag"> / </span>
              <span v-if="r.unit_tag">{{ r.unit_tag }}</span>
              <span v-if="!r.area_tag && !r.unit_tag">—</span>
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              <span class="px-2 py-0.5 rounded-full text-xs font-semibold" :style="statusBadge(r.status)">
                {{ r.status }}
              </span>
            </td>
            <td class="px-3 py-2">
              <div class="space-y-0.5">
                <div class="flex items-center gap-1.5 text-xs cursor-default whitespace-nowrap"
                  :title="'PMC' + (r.pmc_reviewer_name ? ': ' + r.pmc_reviewer_name : '') + (r.pmc_comment ? ' — ' + r.pmc_comment : '')">
                  <svg v-if="r.pmc_reviewed && r.pmc_approved" class="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  <svg v-else-if="r.pmc_reviewed && !r.pmc_approved" class="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  <svg v-else class="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                  <span :class="['truncate min-w-0', r.pmc_reviewed ? (r.pmc_approved ? 'text-green-700' : 'text-red-600') : 'text-gray-400']">
                    PMC<span v-if="r.pmc_reviewer_name" class="font-medium">: {{ r.pmc_reviewer_name }}</span>
                  </span>
                </div>
                <div class="flex items-center gap-1.5 text-xs cursor-default whitespace-nowrap"
                  :title="'Client' + (r.client_reviewer_name ? ': ' + r.client_reviewer_name : '') + (r.client_comment ? ' — ' + r.client_comment : '')">
                  <svg v-if="r.client_reviewed && r.client_approved" class="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  <svg v-else-if="r.client_reviewed && !r.client_approved" class="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  <svg v-else class="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                  <span :class="['truncate min-w-0', r.client_reviewed ? (r.client_approved ? 'text-green-700' : 'text-red-600') : 'text-gray-400']">
                    Client<span v-if="r.client_reviewer_name" class="font-medium">: {{ r.client_reviewer_name }}</span>
                  </span>
                </div>
              </div>
            </td>
            <td class="px-3 py-2 whitespace-nowrap">
              <span class="px-2 py-0.5 rounded-full text-xs font-semibold" :style="approvalBadge(r.approval_status)">
                {{ approvalLabel(r.approval_status) }}
              </span>
            </td>
            <td class="px-3 py-2 text-sm text-gray-500 whitespace-nowrap">{{ r.planned_date || '—' }}</td>
            <td class="px-3 py-2 text-right" @click.stop>
              <div class="flex items-center justify-end gap-1">

                <!-- Plan (DRAFT → PLANNED) -->
                <button
                  v-if="canEditItpRecord(r) && r.status === 'DRAFT'"
                  @click="planItp(r)"
                  class="btn-icon text-gray-400 hover:text-blue-600"
                  title="Move to Planned">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                </button>

                <!-- Execute (or re-execute when the record has a rejection) -->
                <button
                  v-if="canExecute && (['DRAFT','PLANNED'].includes(r.status) || r.approval_status === 'REJECTED' || (r.approval_status === 'PENDING' && hasItpRejection(r)))"
                  @click="openExecuteModal(r)"
                  class="btn-icon text-gray-400 hover:text-green-600"
                  title="Record execution result">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </button>

                <!-- Resubmit (REJECTED or PENDING with at least one rejection) -->
                <button
                  v-if="canResubmitItp(r)"
                  @click="resubmitItp(r)"
                  class="btn-icon text-gray-400 hover:text-amber-600"
                  title="Resubmit for review">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                </button>

                <!-- Review History -->
                <button
                  @click="openItpHistory(r)"
                  class="btn-icon text-gray-400 hover:text-ips-blue"
                  title="Review history">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </button>

                <!-- My review -->
                <button
                  v-if="hasPendingReview(r)"
                  @click="openReviewModal(r)"
                  class="btn-icon text-gray-400 hover:text-amber-600"
                  title="Submit your review">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </button>

                <!-- Edit (DRAFT/PLANNED, or a partial-rejection case) -->
                <button
                  v-if="canEditItpRecord(r) && (['DRAFT','PLANNED'].includes(r.status) || (r.approval_status === 'REJECTED') || (r.approval_status === 'PENDING' && hasItpRejection(r)))"
                  @click="openEditItp(r)"
                  class="btn-icon text-gray-400 hover:text-ips-blue"
                  title="Edit">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </button>

                <!-- Delete -->
                <button
                  v-if="canManage"
                  @click="deleteItp(r)"
                  class="btn-icon text-gray-400 hover:text-red-500"
                  title="Delete">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>

                <!-- New Punch from this ITP (tablet-friendly, prominent) -->
                <button
                  v-if="canManage"
                  @click="openCreatePunchForItp(r)"
                  class="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 active:bg-amber-200 transition-colors text-xs font-semibold whitespace-nowrap"
                  style="min-height:36px;min-width:36px"
                  title="Create a punch item linked to this ITP">
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11v6m-3-3h6"/>
                  </svg>
                  Punch
                </button>

              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       APPROVALS TAB
  ═══════════════════════════════════════════════════════════════ -->
  <div v-else-if="activeTab === 'approvals'">
    <div class="flex items-center gap-3 mb-4">
      <p class="text-sm text-gray-500">ITP records with active review flows. Use <strong>Override</strong> to approve or reject on behalf of a reviewer.</p>
      <button @click="loadApprovals" class="btn-secondary text-sm ml-auto">Refresh</button>
    </div>

    <div v-if="approvalLoading" class="text-center py-10 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="approvalRecords.length === 0" class="card text-center py-10 text-gray-400">
      No ITP records with active review flows.
    </div>

    <div v-else class="space-y-4">
      <div v-for="r in approvalRecords" :key="r.id" class="card p-0 overflow-hidden">
        <!-- Record header -->
        <div class="flex items-center gap-3 px-4 py-3 bg-blue-50 border-b border-blue-100">
          <span class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ r.package_tag }}</span>
          <span class="text-xs text-gray-500">{{ r.package_name }}</span>
          <span class="mx-1 text-gray-300">·</span>
          <span class="text-xs font-semibold text-gray-600">{{ r.test_type_name }}</span>
          <span class="font-medium text-gray-800 ml-1 truncate" style="max-width:280px" :title="r.test">{{ r.test }}</span>
          <span class="ml-auto">
            <span class="px-2 py-0.5 rounded-full text-xs font-semibold" :style="statusBadge(r.status)">{{ r.status }}</span>
          </span>
          <span class="px-2 py-0.5 rounded-full text-xs font-semibold" :style="approvalBadge(r.approval_status)">{{ approvalLabel(r.approval_status) }}</span>
          <button @click="openItpHistory(r)" class="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600" title="Review history">History</button>
          <button @click="viewItp(r)" class="btn-secondary text-xs py-1 px-2">Open</button>
          <button v-if="canManage" @click="openOverrideModal(r)"
            class="px-2 py-1 text-xs font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 rounded">Override</button>
        </div>
        <!-- Reviewer rows: fixed PMC + Client (read from flat columns) -->
        <div class="divide-y divide-gray-100">
          <div class="flex items-center gap-3 px-4 py-2.5 flex-wrap"
            :class="r.pmc_reviewed ? (r.pmc_approved ? 'bg-green-50' : 'bg-red-50') : 'hover:bg-gray-50'">
            <div class="w-44 shrink-0">
              <p class="text-xs font-semibold text-gray-700">PMC Technical</p>
              <p class="text-xs text-gray-500">{{ r.pmc_reviewer_name || 'Not assigned' }}</p>
            </div>
            <div class="flex-1 flex items-center gap-2 flex-wrap">
              <span v-if="!r.pmc_reviewed" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>
              <span v-else-if="r.pmc_approved" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Approved</span>
              <span v-else class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Rejected</span>
              <span v-if="r.pmc_comment" class="text-xs text-gray-500 italic">{{ r.pmc_comment }}</span>
            </div>
            <div v-if="!r.pmc_reviewed && currentUser && r.pmc_reviewer_contact_id === currentUser.contact_id" class="shrink-0">
              <button @click="openReviewModal(r)"
                class="px-3 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200">Review</button>
            </div>
          </div>
          <div class="flex items-center gap-3 px-4 py-2.5 flex-wrap"
            :class="r.client_reviewed ? (r.client_approved ? 'bg-green-50' : 'bg-red-50') : 'hover:bg-gray-50'">
            <div class="w-44 shrink-0">
              <p class="text-xs font-semibold text-gray-700">Client Technical</p>
              <p class="text-xs text-gray-500">{{ r.client_reviewer_name || 'Not assigned' }}</p>
            </div>
            <div class="flex-1 flex items-center gap-2 flex-wrap">
              <span v-if="!r.client_reviewed" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>
              <span v-else-if="r.client_approved" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Approved</span>
              <span v-else class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Rejected</span>
              <span v-if="r.client_comment" class="text-xs text-gray-500 italic">{{ r.client_comment }}</span>
            </div>
            <div v-if="!r.client_reviewed && currentUser && r.client_reviewer_contact_id === currentUser.contact_id" class="shrink-0">
              <button @click="openReviewModal(r)"
                class="px-3 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200">Review</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       DASHBOARD TAB
  ═══════════════════════════════════════════════════════════════ -->
  <div v-else-if="activeTab === 'dashboard'">
    <!-- ITP filters -->
    <p class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Inspection and Test Records</p>
    <div class="flex flex-wrap items-center gap-2 mb-6">
      <select v-model="dashFilter.package_id" @change="loadDashboard" class="input-field" style="width:auto;min-width:140px">
        <option :value="null">All Packages</option>
        <option v-for="p in (dashboard && dashboard.filter_options ? dashboard.filter_options.packages : [])" :key="p.id" :value="p.id">{{ p.tag }}</option>
      </select>
      <select v-model="dashFilter.test_type_id" @change="loadDashboard" class="input-field" style="width:auto;min-width:150px">
        <option :value="null">All Test Types</option>
        <option v-for="tt in (dashboard && dashboard.filter_options ? dashboard.filter_options.test_types : testTypes)" :key="tt.id" :value="tt.id">{{ tt.name }}</option>
      </select>
      <select v-model="dashFilter.witness_level_id" @change="loadDashboard" class="input-field" style="width:auto;min-width:140px">
        <option :value="null">All Witness Levels</option>
        <option v-for="wl in (dashboard && dashboard.filter_options ? dashboard.filter_options.witness_levels : witnessLevels)" :key="wl.id" :value="wl.id">{{ wl.code }} – {{ wl.name }}</option>
      </select>
      <select v-model="dashFilter.area_id" @change="loadDashboard" class="input-field" style="width:auto;min-width:120px">
        <option :value="null">All Areas</option>
        <option v-for="a in (dashboard && dashboard.filter_options ? dashboard.filter_options.areas : [])" :key="a.id" :value="a.id">{{ a.tag }}</option>
      </select>
      <select v-model="dashFilter.unit_id" @change="loadDashboard" class="input-field" style="width:auto;min-width:120px">
        <option :value="null">All Units</option>
        <option v-for="u in (dashboard && dashboard.filter_options ? dashboard.filter_options.units : [])" :key="u.id" :value="u.id">{{ u.tag }}</option>
      </select>
      <button @click="resetDashFilters" class="btn-secondary text-sm">Clear Filters</button>
    </div>

    <div v-if="!dashboard" class="text-center py-12 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else>
      <!-- Charts row -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <!-- ITP Status — vertical bar chart -->
        <div class="card">
          <p class="font-semibold text-gray-700 mb-1">ITP Status</p>
          <p class="text-xs text-gray-400 mb-3">{{ dashboard.totals.total }} records total</p>
          <div style="height:200px">
            <canvas id="qc-itp-status-bar"></canvas>
          </div>
        </div>
        <!-- Approval Status — pie chart -->
        <div class="card">
          <p class="font-semibold text-gray-700 mb-1">Approval Status</p>
          <p class="text-xs text-gray-400 mb-3">{{ dashboard.totals.total }} records total</p>
          <div style="height:280px">
            <canvas id="qc-approval-pie"></canvas>
          </div>
        </div>
      </div>
      <!-- ITP Group chart -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-700">ITP Status by Group</h3>
          <div class="flex gap-1">
            <button :class="['text-xs py-1 px-2', dashView === 'package' ? 'btn-primary' : 'btn-secondary']" @click="dashView = 'package'">By Package</button>
            <button :class="['text-xs py-1 px-2', dashView === 'area'    ? 'btn-primary' : 'btn-secondary']" @click="dashView = 'area'">By Area</button>
            <button :class="['text-xs py-1 px-2', dashView === 'unit'    ? 'btn-primary' : 'btn-secondary']" @click="dashView = 'unit'">By Unit</button>
          </div>
        </div>
        <div v-if="dashGroupData.length === 0" class="text-center py-8 text-gray-400 text-sm">
          No data for this grouping.
        </div>
        <div v-else class="space-y-3">
          <div v-for="row in dashGroupData" :key="row.label">
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-medium text-gray-700 truncate" style="max-width:50%">{{ row.label }}</span>
              <span class="text-xs text-gray-500 ml-2">{{ row.total }} total</span>
            </div>
            <div class="flex rounded overflow-hidden h-5">
              <div v-for="seg in dashCountBar(row.counts)" :key="seg.status"
                :style="{ width: seg.pct + '%', background: seg.color }"
                :title="seg.status + ': ' + seg.count"
                class="flex items-center justify-center text-white text-xs font-bold">
                <span v-if="parseFloat(seg.pct) > 10">{{ seg.count }}</span>
              </div>
            </div>
            <div class="flex gap-3 mt-1">
              <span v-for="seg in dashCountBar(row.counts)" :key="seg.status" class="text-xs text-gray-500">
                <span class="inline-block w-2 h-2 rounded-full mr-0.5" :style="{ background: seg.color }"></span>
                {{ seg.status }}: {{ seg.count }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Punchlist Dashboard ── -->
      <div v-if="punchDashboard" class="mt-8">
        <p class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Punch List Overview</p>
        <div class="flex flex-wrap items-center gap-2 mb-5">
          <select v-model="punchDashFilter.package_id" @change="loadDashboard" class="input-field" style="width:auto;min-width:140px">
            <option :value="null">All Packages</option>
            <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }}</option>
          </select>
          <select v-model="punchDashFilter.area_id" @change="loadDashboard" class="input-field" style="width:auto;min-width:120px">
            <option :value="null">All Areas</option>
            <option v-for="a in areas" :key="a.id" :value="a.id">{{ a.tag }}</option>
          </select>
          <select v-model="punchDashFilter.unit_id" @change="loadDashboard" class="input-field" style="width:auto;min-width:120px">
            <option :value="null">All Units</option>
            <option v-for="u in units" :key="u.id" :value="u.id">{{ u.tag }}</option>
          </select>
          <button @click="resetPunchDashFilters" class="btn-secondary text-sm">Clear Filters</button>
        </div>

        <!-- Punch status bar chart -->
        <div class="card mb-5">
          <p class="font-semibold text-gray-700 mb-1">Punchlist Status</p>
          <p class="text-xs text-gray-400 mb-3">{{ punchDashboard.totals.total }} items total</p>
          <div style="height:200px">
            <canvas id="qc-punch-status-bar"></canvas>
          </div>
        </div>

        <!-- Punch group chart -->
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <h4 class="font-semibold text-gray-700">Punchlist Status by Group</h4>
            <div class="flex gap-1">
              <button :class="['text-xs py-1 px-2', punchDashView === 'package' ? 'btn-primary' : 'btn-secondary']" @click="punchDashView = 'package'">By Package</button>
              <button :class="['text-xs py-1 px-2', punchDashView === 'area'    ? 'btn-primary' : 'btn-secondary']" @click="punchDashView = 'area'">By Area</button>
              <button :class="['text-xs py-1 px-2', punchDashView === 'unit'    ? 'btn-primary' : 'btn-secondary']" @click="punchDashView = 'unit'">By Unit</button>
            </div>
          </div>
          <div v-if="punchDashGroupData.length === 0" class="text-center py-8 text-gray-400 text-sm">
            No punch items for this grouping.
          </div>
          <div v-else class="space-y-3">
            <div v-for="row in punchDashGroupData" :key="row.label">
              <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-medium text-gray-700 truncate" style="max-width:50%">{{ row.label }}</span>
                <div class="flex items-center gap-3 ml-2">
                  <span class="text-xs text-gray-500">{{ row.total }} total</span>
                  <span v-if="row.counts.OPEN > 0" class="text-xs font-semibold text-blue-600">{{ row.counts.OPEN }} open</span>
                  <span v-if="row.counts.TO_REVIEW > 0" class="text-xs font-semibold text-amber-600">{{ row.counts.TO_REVIEW }} to review</span>
                  <span v-if="row.counts.CLOSED > 0" class="text-xs font-semibold text-green-700">{{ row.counts.CLOSED }} closed</span>
                </div>
              </div>
              <div class="flex rounded overflow-hidden h-5">
                <div v-for="seg in punchCountBar(row.counts)" :key="seg.status"
                  :style="{ width: seg.pct + '%', background: seg.color }"
                  :title="seg.status + ': ' + seg.count"
                  class="flex items-center justify-center text-white text-xs font-bold">
                  <span v-if="parseFloat(seg.pct) > 10">{{ seg.count }}</span>
                </div>
              </div>
            </div>
          </div>
          <!-- Legend -->
          <div class="flex gap-4 mt-4 pt-3 border-t border-gray-100">
            <span class="flex items-center gap-1.5 text-xs text-gray-500">
              <span class="inline-block w-3 h-3 rounded-sm" style="background:#3B82F6"></span> Open
            </span>
            <span class="flex items-center gap-1.5 text-xs text-gray-500">
              <span class="inline-block w-3 h-3 rounded-sm" style="background:#F59E0B"></span> To Review
            </span>
            <span class="flex items-center gap-1.5 text-xs text-gray-500">
              <span class="inline-block w-3 h-3 rounded-sm" style="background:#10B981"></span> Closed
            </span>
          </div>
        </div>

        <!-- Open Punches Trend -->
        <div class="card mt-5">
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-semibold text-gray-700">Open Punches Over Time</h4>
            <span class="text-xs text-gray-400">Running total of open + to-review items at end of each week</span>
          </div>
          <div v-if="!(punchDashboard.open_punches_timeline || []).length"
            class="text-center text-gray-400 text-sm py-6">
            No punch items yet.
          </div>
          <div v-else style="height:220px">
            <canvas ref="punchTrendChart"></canvas>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       SETUP TAB
  ═══════════════════════════════════════════════════════════════ -->
  <div v-else-if="activeTab === 'setup'">
    <div class="flex gap-2 mb-4">
      <button :class="['btn-secondary', setupSubTab === 'testTypes' ? 'font-semibold' : '']" @click="setupSubTab = 'testTypes'">Test Types</button>
      <button :class="['btn-secondary', setupSubTab === 'witnessLevels' ? 'font-semibold' : '']" @click="setupSubTab = 'witnessLevels'">Witness Levels</button>
      <button :class="['btn-secondary', setupSubTab === 'obligationTimes' ? 'font-semibold' : '']" @click="setupSubTab = 'obligationTimes'">Obligation Times</button>
    </div>

    <div v-if="setupSubTab === 'testTypes'">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-gray-700">Test Types</h3>
        <button @click="openCreateTestType" class="btn-primary text-sm">+ Add Test Type</button>
      </div>
      <div class="card overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-3 w-20">Order</th>
              <th class="text-left px-4 py-3">Name</th>
              <th class="text-left px-4 py-3">Description</th>
              <th class="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="testTypes.length === 0">
              <td colspan="4" class="text-center text-gray-400 px-4 py-6">No test types defined.</td>
            </tr>
            <tr v-for="tt in testTypes" :key="tt.id" class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td class="px-4 py-3 text-sm text-gray-500 text-center">{{ tt.sort_order }}</td>
              <td class="px-4 py-3 text-sm font-medium text-gray-800">{{ tt.name }}</td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ tt.description || '—' }}</td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1">
                  <button @click="openEditTestType(tt)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                  </button>
                  <button @click="deleteTestType(tt)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else-if="setupSubTab === 'witnessLevels'">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-gray-700">Witness Levels</h3>
        <button @click="openCreateWitnessLevel" class="btn-primary text-sm">+ Add Witness Level</button>
      </div>
      <div class="card overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-3 w-20">Order</th>
              <th class="text-left px-4 py-3 w-20">Code</th>
              <th class="text-left px-4 py-3">Name</th>
              <th class="text-left px-4 py-3">Description</th>
              <th class="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="witnessLevels.length === 0">
              <td colspan="5" class="text-center text-gray-400 px-4 py-6">No witness levels defined.</td>
            </tr>
            <tr v-for="wl in witnessLevels" :key="wl.id" class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td class="px-4 py-3 text-sm text-gray-500 text-center">{{ wl.sort_order }}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded text-xs font-bold" :style="witnessLevelBadge(wl.code)">{{ wl.code }}</span>
              </td>
              <td class="px-4 py-3 text-sm font-medium text-gray-800">{{ wl.name }}</td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ wl.description || '—' }}</td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1">
                  <button @click="openEditWitnessLevel(wl)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                  </button>
                  <button @click="deleteWitnessLevel(wl)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else-if="setupSubTab === 'obligationTimes'">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-gray-700">Obligation Times</h3>
        <button @click="openCreateObligationTime" class="btn-primary text-sm">+ Add Obligation Time</button>
      </div>
      <div class="card overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-3 w-20">Order</th>
              <th class="text-left px-4 py-3 w-20">Code</th>
              <th class="text-left px-4 py-3">Name</th>
              <th class="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="obligationTimes.length === 0">
              <td colspan="4" class="text-center text-gray-400 px-4 py-6">No obligation times defined.</td>
            </tr>
            <tr v-for="ot in obligationTimes" :key="ot.id" class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td class="px-4 py-3 text-sm text-gray-500 text-center">{{ ot.sort_order }}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800">{{ ot.code }}</span>
              </td>
              <td class="px-4 py-3 text-sm font-medium text-gray-800">{{ ot.name }}</td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1">
                  <button @click="openEditObligationTime(ot)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                  </button>
                  <button @click="deleteObligationTime(ot)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       PUNCHLIST TAB
  ═══════════════════════════════════════════════════════════════ -->
  <div v-else-if="activeTab === 'punchlist'">

    <div class="flex flex-wrap items-center gap-2 mb-4">
      <button v-if="canCreatePunch" @click="openCreatePunch" class="btn-primary">
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        New Punch Item
      </button>
      <button @click="exportExcel" :disabled="exporting" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
        </svg>
        {{ exporting ? 'Exporting...' : 'Export Excel' }}
      </button>
      <button @click="openPunchExportModal" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition-colors">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        Export PDF
      </button>
      <select v-model="punchFilter.package_id" @change="loadPunches" class="input-field" style="width:auto;min-width:140px">
        <option :value="null">All Packages</option>
        <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }}</option>
      </select>
      <select v-model="punchFilter.obligation_time_id" @change="loadPunches" class="input-field" style="width:auto;min-width:160px">
        <option :value="null">All Obligation Times</option>
        <option v-for="ot in obligationTimes" :key="ot.id" :value="ot.id">{{ ot.code }} – {{ ot.name }}</option>
      </select>
      <select v-model="punchFilter.area_id" @change="loadPunches" class="input-field" style="width:auto;min-width:120px">
        <option :value="null">All Areas</option>
        <option v-for="a in areas" :key="a.id" :value="a.id">{{ a.tag }}</option>
      </select>
      <select v-model="punchFilter.unit_id" @change="loadPunches" class="input-field" style="width:auto;min-width:120px">
        <option :value="null">All Units</option>
        <option v-for="u in units" :key="u.id" :value="u.id">{{ u.tag }}</option>
      </select>
      <select v-model="punchFilter.status" @change="loadPunches" class="input-field" style="width:auto;min-width:130px">
        <option v-for="s in punchStatusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
      <button @click="toggleMyPunches"
        :class="['text-sm px-3 py-1.5 rounded-lg font-medium border transition-colors',
                 punchFilter.mine ? 'bg-ips-blue text-white border-ips-blue hover:bg-ips-dark' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50']">
        {{ punchFilter.mine ? '✓ My Punches' : 'My Punches' }}
      </button>
      <button @click="resetPunchFilters" class="btn-secondary text-sm">Clear Filters</button>
      <span class="ml-auto text-sm text-gray-500">{{ punchItems.length }} item(s)</span>
    </div>

    <div v-if="punchLoading" class="text-center py-12 text-gray-500"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="punchItems.length === 0" class="text-center py-12 text-gray-400">No punch items found.</div>
    <div v-else class="card overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <th class="text-left px-3 py-2 w-24">ID</th>
            <th class="text-left px-3 py-2 w-28">Package</th>
            <th class="text-left px-3 py-2 w-32">Obligation</th>
            <th class="text-left px-3 py-2 w-56">Topic</th>
            <th class="text-left px-3 py-2 w-56">Response</th>
            <th class="text-left px-3 py-2 w-24 whitespace-nowrap">Area / Unit</th>
            <th class="text-left px-3 py-2 w-28">Status</th>
            <th class="text-left px-3 py-2 w-32">Created By</th>
            <th class="px-3 py-2 w-36"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in punchItems" :key="p.id" class="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer" @click="openViewPunch(p)">
            <td class="px-3 py-1.5 text-xs text-gray-400 font-mono whitespace-nowrap">PI-{{ String(p.seq_id || p.id).padStart(6,'0') }}</td>
            <td class="px-3 py-1.5 text-sm whitespace-nowrap" :title="p.package_name || ''">
              <span class="inline-block px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800">{{ p.package_tag }}</span>
            </td>
            <td class="px-3 py-1.5 text-sm whitespace-nowrap" :title="p.obligation_time_name || ''">
              <span class="inline-block px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800">{{ p.obligation_time_code }}</span>
            </td>
            <td class="px-3 py-1.5 text-sm font-medium text-gray-800 max-w-[14rem]">
              <div class="truncate" :title="p.topic">{{ p.topic }}</div>
              <div v-if="p.details" class="text-gray-400 text-xs font-normal truncate" :title="p.details">{{ p.details }}</div>
            </td>
            <td class="px-3 py-1.5 text-xs text-gray-500">
              <span v-if="p.response" class="truncate block max-w-xs" :title="p.response">{{ p.response }}</span>
              <span v-else class="text-gray-300">—</span>
            </td>
            <td class="px-3 py-1.5 text-xs text-gray-500 whitespace-nowrap">
              <span v-if="p.area_tag">{{ p.area_tag }}</span>
              <span v-if="p.area_tag && p.unit_tag"> / </span>
              <span v-if="p.unit_tag">{{ p.unit_tag }}</span>
              <span v-if="!p.area_tag && !p.unit_tag">—</span>
            </td>
            <td class="px-3 py-1.5 whitespace-nowrap">
              <span class="px-2 py-0.5 rounded text-xs font-bold" :style="punchStatusBadge(p.status)">{{ p.status.replace('_',' ') }}</span>
            </td>
            <td class="px-3 py-1.5 text-xs text-gray-500 whitespace-nowrap">{{ p.created_by_name || '—' }}</td>
            <td class="px-3 py-1.5" @click.stop>
              <div class="flex items-center justify-end gap-1">
                <button v-if="p.status === 'OPEN'" @click="openRespondPunch(p)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Respond &amp; Submit">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                </button>
                <button v-if="p.status === 'TO_REVIEW'" @click="openPunchReview(p)" class="btn-icon text-gray-400 hover:text-green-600" title="Review">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </button>
                <button v-if="canManage && (p.status === 'OPEN' || p.status === 'DRAFT')" @click="openEditPunch(p)" class="btn-icon text-gray-400 hover:text-ips-blue" :title="p.status === 'DRAFT' ? 'Edit draft & submit' : 'Edit'">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                </button>
                <button v-if="canManage" @click="openPunchOverride(p)" class="btn-icon text-gray-400 hover:text-purple-600" title="Override Status">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                </button>
                <button v-if="canManage" @click="deletePunch(p)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       FLOORPLAN VIEW (heatmap) TAB
  ═══════════════════════════════════════════════════════════════ -->
  <div v-else-if="activeTab === 'punchplans'">
    <div class="flex flex-wrap items-center gap-2 mt-2 mb-3">
      <p class="text-sm text-gray-500">Pinned punch items on each floorplan. Click a dot to open the record.</p>
      <label class="ml-auto inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
        <input type="checkbox" v-model="showPinNumbers" class="rounded"/>
        Show numbers
      </label>
      <select v-model="heatStatus" class="input-field text-sm" style="width:auto;min-width:150px">
        <option value="OPEN">Open only</option>
        <option value="TO_REVIEW">To review only</option>
        <option value="CLOSED">Closed only</option>
        <option value="ALL">All statuses</option>
      </select>
      <select v-model.number="heatPackage" class="input-field text-sm" style="width:auto;min-width:180px">
        <option :value="''">All packages</option>
        <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
      </select>
    </div>

    <div v-if="floorplansWithPins.length === 0" class="card text-center py-12 text-gray-400">
      <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
      <p>No pinned punch items match these filters.</p>
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
              <span v-if="fp.openCount > 0" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-semibold">
                <span class="w-1.5 h-1.5 rounded-full" style="background:#dc2626"></span>
                {{ fp.openCount }} open
              </span>
              <span v-if="fp.reviewCount > 0" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                <span class="w-1.5 h-1.5 rounded-full" style="background:#f59e0b"></span>
                {{ fp.reviewCount }} to review
              </span>
              <span v-if="fp.closedCount > 0" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 font-semibold">
                <span class="w-1.5 h-1.5 rounded-full" style="background:#9ca3af"></span>
                {{ fp.closedCount }} closed
              </span>
              <span class="text-gray-400">{{ fp.pins.length }} total</span>
            </div>
          </button>

          <div v-if="isFloorplanExpanded(fp.id)" class="relative bg-gray-50">
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
                     :title="'PI-' + (o.seq_id || o.id) + ' — ' + (o.topic || '')">
                  <svg width="24" height="30" viewBox="0 0 24 30" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.55))">
                    <path d="M12 0C6.48 0 2 4.48 2 10c0 7.5 10 20 10 20s10-12.5 10-20C22 4.48 17.52 0 12 0z"
                          :fill="pinColor(o)" stroke="white" stroke-width="2"/>
                    <circle cx="12" cy="10" r="3.6" fill="white"/>
                  </svg>
                </div>
                <div v-if="showPinNumbers" class="absolute pointer-events-none"
                     :style="{ left: (o.floorplan_x * 100) + '%', top: (o.floorplan_y * 100) + '%', transform: 'translate(12px, -30px)' }">
                  <span class="inline-block px-1.5 py-0.5 text-[13px] font-bold leading-tight bg-white text-gray-800 border border-gray-300 rounded shadow-sm whitespace-nowrap">
                    {{ o.seq_id || o.id }}
                  </span>
                </div>
              </template>

              <!-- Clusters (≥5 same-area pins → red bigger dot) -->
              <div v-for="(c, idx) in clusterPins(fp.pins).clusters" :key="c.key"
                   class="absolute cursor-pointer"
                   :style="{ left: (c.x * 100) + '%', top: (c.y * 100) + '%', transform: 'translate(-50%, -50%)' }"
                   @click.stop="expandCluster(fp.id, idx)">
                <div class="rounded-full text-white border-2 border-white flex items-center justify-center font-bold shadow-md hover:scale-105 transition-transform"
                     :style="{ background: '#dc2626', width: clusterDotSize(c.items.length) + 'px', height: clusterDotSize(c.items.length) + 'px', fontSize: '13px' }">
                  {{ c.items.length }}
                </div>

                <div v-if="isClusterExpanded(fp.id, idx)"
                     class="absolute left-1/2 top-full mt-2 -translate-x-1/2 z-20 w-80 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden cursor-default"
                     @click.stop>
                  <div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <span class="text-xs font-semibold text-gray-700">{{ c.items.length }} pins here</span>
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
                          <span class="text-xs font-mono text-gray-500">PI-{{ o.seq_id || o.id }}</span>
                        </div>
                        <p class="text-sm text-gray-800 truncate">{{ o.topic || '—' }}</p>
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
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       REPORTS TAB
  ═══════════════════════════════════════════════════════════════ -->
  <div v-else-if="activeTab === 'reports'">
    <div class="flex items-center justify-between mt-2 mb-3">
      <p class="text-sm text-gray-500">Background-generated PDF exports for this project. Files are saved under <span class="font-mono text-xs text-gray-700">uploads / {project} / Punch List Reports</span>.</p>
      <button @click="loadPunchReports" :disabled="punchReportsLoading" class="btn-secondary text-sm">
        <svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        {{ punchReportsLoading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>

    <div class="card p-0 overflow-hidden">
      <div v-if="recentPunchReports.length === 0" class="px-6 py-12 text-center text-gray-400">
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p class="text-sm">No reports yet.</p>
        <p class="text-xs mt-1">Go to the <strong>Punchlist</strong> tab and click <strong>Export PDF</strong> to generate one.</p>
      </div>
      <div v-else class="divide-y divide-gray-100">
        <div v-for="r in recentPunchReports" :key="r.id"
             class="px-4 py-3 flex items-center gap-3 hover:bg-gray-50">
          <span :class="['inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border whitespace-nowrap', reportStatusClass(r.status)]">
            <svg v-if="r.status === 'GENERATING'" class="w-3.5 h-3.5 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            {{ r.status }}
          </span>
          <div class="flex-1 min-w-0">
            <p class="text-gray-800 font-medium truncate">{{ r.title || 'Report' }}<span v-if="r.file_size" class="text-xs text-gray-400 ml-2 font-normal">{{ fmtReportFileSize(r.file_size) }}</span></p>
            <p class="text-xs text-gray-500 truncate">{{ r.filter_summary }}</p>
            <p class="text-[11px] text-gray-400">{{ r.requested_by_name || '—' }} · {{ fmtReportDateTime(r.requested_at) }}</p>
            <p v-if="r.error_message" class="text-xs text-red-600 truncate">{{ r.error_message }}</p>
          </div>
          <button v-if="r.downloadable" @click="onDownloadPunchReport(r)"
                  class="px-3 py-2 rounded-lg bg-ips-blue text-white text-sm font-semibold hover:opacity-90 inline-flex items-center gap-1.5"
                  title="Download PDF">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Download
          </button>
          <button @click="onDeletePunchReport(r)"
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

  <!-- ═══════════════════════════════════════════════════════════════
       ITP CREATE / EDIT MODAL
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="showItpModal" class="modal-overlay" @click.self="showItpModal = false" :style="viewingItp ? 'z-index:120' : ''">
    <div class="modal-box modal-xl" style="max-height:90vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h2 class="font-semibold text-gray-800">{{ itpModalMode === 'create' ? 'New ITP Record' : 'Edit ITP Record' }}</h2>
        <button @click="showItpModal = false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="modal-body" style="padding:0;display:flex;overflow:hidden;flex:1">
      <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Package <span class="text-red-500">*</span></label>
            <select v-model="itpForm.package_id" class="input-field">
              <option :value="null">Select package...</option>
              <option v-for="p in itpAvailablePackages" :key="p.id" :value="p.id">{{ p.tag_number }} – {{ p.name }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Test Type <span class="text-red-500">*</span></label>
            <select v-model="itpForm.test_type_id" class="input-field">
              <option :value="null">Select test type...</option>
              <option v-for="tt in testTypes" :key="tt.id" :value="tt.id">{{ tt.name }}</option>
            </select>
          </div>
        </div>
        <div>
          <label class="form-label">Test <span class="text-red-500">*</span></label>
          <input v-model="itpForm.test" class="input-field" placeholder="Short test name / identifier (e.g. Weld Visual Check — Spool 12)"/>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Witness Level <span class="text-red-500">*</span></label>
            <select v-model="itpForm.witness_level_id" class="input-field">
              <option :value="null">Select witness level...</option>
              <option v-for="wl in witnessLevels" :key="wl.id" :value="wl.id">{{ wl.code }} – {{ wl.name }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Planned Date</label>
            <input v-model="itpForm.planned_date" type="date" class="input-field"/>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Area</label>
            <select v-model="itpForm.area_id" class="input-field">
              <option :value="null">None</option>
              <option v-for="a in areas" :key="a.id" :value="a.id">{{ a.tag }} – {{ a.description }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Unit</label>
            <select v-model="itpForm.unit_id" class="input-field">
              <option :value="null">None</option>
              <option v-for="u in units" :key="u.id" :value="u.id">{{ u.tag }} – {{ u.description }}</option>
            </select>
          </div>
        </div>
        <div>
          <label class="form-label">Details</label>
          <textarea v-model="itpForm.details" class="input-field" rows="2" placeholder="Additional details or description..."></textarea>
        </div>
        <div>
          <label class="form-label">Acceptance Criteria</label>
          <textarea v-model="itpForm.acceptance_criteria" class="input-field" rows="3" placeholder="Define the acceptance criteria for this test..."></textarea>
        </div>
      </div><!-- end space-y-4 -->
      </div><!-- end left column -->
      <div class="w-96 shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
        <file-attachments record-type="itp" :record-id="editingItpId" :can-upload="true" :can-edit="canManage"></file-attachments>
      </div>
      </div><!-- end modal-body -->
      <div class="modal-footer">
        <button @click="showItpModal = false" class="btn-secondary">Cancel</button>
        <button @click="saveItp" :disabled="savingItp" class="btn-primary">
          {{ savingItp ? 'Saving...' : (itpModalMode === 'create' ? 'Create' : 'Save Changes') }}
        </button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       ITP DETAIL VIEW MODAL
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="viewingItp" class="modal-overlay" @click.self="viewingItp = null">
    <div class="modal-box modal-xl" style="max-height:90vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h2 class="font-semibold text-gray-800">ITP Record — {{ viewingItp.package_tag }}</h2>
        <div class="flex items-center gap-2">
          <button @click="openItpHistory(viewingItp)"
            class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded"
            title="Show review history">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            History
          </button>
          <button @click="viewingItp = null" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
      </div>
      <div class="modal-body" style="padding:0;display:flex;overflow:hidden;flex:1">
      <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div><span class="text-gray-500">Package:</span> <span class="font-semibold">{{ viewingItp.package_tag }} – {{ viewingItp.package_name }}</span></div>
          <div><span class="text-gray-500">Test Type:</span> <span class="font-semibold">{{ viewingItp.test_type_name }}</span></div>
          <div>
            <span class="text-gray-500">Witness Level:</span>
            <span class="ml-1 px-2 py-0.5 rounded text-xs font-bold" :style="witnessLevelBadge(viewingItp.witness_level_code)">{{ viewingItp.witness_level_code }}</span>
            {{ viewingItp.witness_level_name }}
          </div>
          <div>
            <span class="text-gray-500">Status:</span>
            <span class="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold" :style="statusBadge(viewingItp.status)">{{ viewingItp.status }}</span>
          </div>
          <div v-if="viewingItp.area_tag"><span class="text-gray-500">Area:</span> {{ viewingItp.area_tag }}</div>
          <div v-if="viewingItp.unit_tag"><span class="text-gray-500">Unit:</span> {{ viewingItp.unit_tag }}</div>
          <div v-if="viewingItp.planned_date"><span class="text-gray-500">Planned Date:</span> {{ viewingItp.planned_date }}</div>
          <div v-if="viewingItp.executed_date"><span class="text-gray-500">Executed Date:</span> {{ viewingItp.executed_date }}</div>
        </div>
        <div v-if="viewingItp.test">
          <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">Test</p>
          <p class="text-sm font-medium">{{ viewingItp.test }}</p>
        </div>
        <div v-if="viewingItp.details">
          <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">Details</p>
          <p class="text-sm whitespace-pre-line">{{ viewingItp.details }}</p>
        </div>
        <div v-if="viewingItp.acceptance_criteria">
          <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">Acceptance Criteria</p>
          <p class="text-sm whitespace-pre-line">{{ viewingItp.acceptance_criteria }}</p>
        </div>
        <div v-if="viewingItp.result">
          <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">Result</p>
          <p class="text-sm whitespace-pre-line">{{ viewingItp.result }}</p>
        </div>
        <!-- Inline review form (shown when the current user clicks Submit Review) -->
        <div v-if="inlineReviewing" class="border-t pt-4">
          <h4 class="font-semibold text-gray-800 mb-3">Submit Your Review</h4>
          <div class="flex gap-3 mb-3">
            <button type="button" @click="inlineReviewForm.status = 'APPROVED'"
              :class="['flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all',
                inlineReviewForm.status === 'APPROVED' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500']">
              ✓ Approve
            </button>
            <button type="button" @click="inlineReviewForm.status = 'REJECTED'"
              :class="['flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all',
                inlineReviewForm.status === 'REJECTED' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500']">
              ✗ Reject
            </button>
          </div>
          <div class="mb-3">
            <label class="form-label">Comment <span class="text-red-500">*</span></label>
            <textarea v-model="inlineReviewForm.comment" class="input-field" rows="3"
              :placeholder="inlineReviewForm.status === 'APPROVED' ? 'Approval comment...' : 'Reason for rejection...'"></textarea>
          </div>
          <p v-if="inlineReviewError" class="text-red-500 text-sm mb-2">{{ inlineReviewError }}</p>
          <div class="flex justify-end gap-2">
            <button @click="inlineReviewing = false" class="btn-secondary">Cancel</button>
            <button @click="submitInlineReview" :disabled="inlineReviewSaving"
              :class="['px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50',
                inlineReviewForm.status === 'APPROVED' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-600 text-white hover:bg-red-700']">
              {{ inlineReviewSaving ? 'Submitting...' : (inlineReviewForm.status === 'APPROVED' ? 'Approve' : 'Reject') }}
            </button>
          </div>
        </div>

        <div v-if="viewingItp.pmc_reviewer_name || viewingItp.client_reviewer_name || viewingItp.pmc_reviewed || viewingItp.client_reviewed">
          <p class="text-xs text-gray-500 uppercase tracking-wider mb-2">Approval Reviews</p>
          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-lg p-3 border"
              :class="viewingItp.pmc_reviewed ? (viewingItp.pmc_approved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200') : 'bg-yellow-50 border-yellow-200'">
              <p class="text-xs font-semibold mb-1">PMC Technical — {{ viewingItp.pmc_reviewer_name || 'Not assigned' }}</p>
              <p class="text-xs font-medium">
                <span v-if="!viewingItp.pmc_reviewed" class="text-yellow-700">Pending</span>
                <span v-else-if="viewingItp.pmc_approved" class="text-green-700">Approved</span>
                <span v-else class="text-red-700">Rejected</span>
              </p>
              <p v-if="viewingItp.pmc_comment" class="text-xs mt-1 italic">{{ viewingItp.pmc_comment }}</p>
              <p v-if="viewingItp.pmc_reviewed_at" class="text-xs text-gray-400 mt-1">{{ fmtDateTimeItp(viewingItp.pmc_reviewed_at) }}</p>
            </div>
            <div class="rounded-lg p-3 border"
              :class="viewingItp.client_reviewed ? (viewingItp.client_approved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200') : 'bg-yellow-50 border-yellow-200'">
              <p class="text-xs font-semibold mb-1">Client Technical — {{ viewingItp.client_reviewer_name || 'Not assigned' }}</p>
              <p class="text-xs font-medium">
                <span v-if="!viewingItp.client_reviewed" class="text-yellow-700">Pending</span>
                <span v-else-if="viewingItp.client_approved" class="text-green-700">Approved</span>
                <span v-else class="text-red-700">Rejected</span>
              </p>
              <p v-if="viewingItp.client_comment" class="text-xs mt-1 italic">{{ viewingItp.client_comment }}</p>
              <p v-if="viewingItp.client_reviewed_at" class="text-xs text-gray-400 mt-1">{{ fmtDateTimeItp(viewingItp.client_reviewed_at) }}</p>
            </div>
          </div>
        </div>
        <div class="text-xs text-gray-400 border-t pt-2">
          Created: {{ viewingItp.created_at ? viewingItp.created_at.slice(0,10) : '—' }}
          <span v-if="viewingItp.updated_at"> · Updated: {{ viewingItp.updated_at.slice(0,10) }}</span>
        </div>
        <!-- Notes -->
        <div class="border-t pt-4">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Notes</p>
          <div v-if="itpNotes.length === 0" class="text-sm text-gray-400 italic mb-3">No notes yet.</div>
          <div v-else class="space-y-2 mb-3">
            <div v-for="n in itpNotes" :key="n.id" class="bg-gray-50 rounded-lg p-3 text-sm">
              <div class="flex items-start justify-between gap-2">
                <p class="text-gray-800 whitespace-pre-line flex-1">{{ n.content }}</p>
                <button v-if="canDeleteItpNote(n)" @click="deleteItpNote(n)" class="text-gray-300 hover:text-red-500 flex-shrink-0 mt-0.5" title="Delete note">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <p class="text-xs text-gray-400 mt-1">{{ n.author_name || 'Unknown' }} · {{ n.created_at ? n.created_at.slice(0,10) : '' }}</p>
            </div>
          </div>
          <div class="flex gap-2">
            <textarea v-model="newItpNote" class="input-field text-sm flex-1" rows="2" placeholder="Add a note..."></textarea>
            <button @click="addItpNote" :disabled="savingItpNote || !newItpNote.trim()" class="btn-primary text-sm self-end">Add</button>
          </div>
        </div>
      </div><!-- end space-y-4 -->
      </div><!-- end left column -->
      <div class="w-72 shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
        <file-attachments record-type="itp" :record-id="viewingItp.id" :can-upload="true" :can-edit="canManage"></file-attachments>
      </div>
      </div><!-- end modal-body -->
      <div class="modal-footer" v-if="!inlineReviewing">
        <button @click="viewingItp = null" class="btn-secondary">Close</button>
        <button v-if="canEditItpRecord(viewingItp) && (['DRAFT','PLANNED'].includes(viewingItp.status) || viewingItp.approval_status === 'REJECTED' || (viewingItp.approval_status === 'PENDING' && hasItpRejection(viewingItp)))"
          @click="openEditItp(viewingItp)"
          class="btn-primary">Edit</button>
        <button v-if="canEditItpRecord(viewingItp) && viewingItp.status === 'DRAFT'" @click="planItp(viewingItp); viewingItp = null" class="btn-secondary">Move to Planned</button>
        <button v-if="canExecute && (['DRAFT','PLANNED'].includes(viewingItp.status) || viewingItp.approval_status === 'REJECTED' || (viewingItp.approval_status === 'PENDING' && hasItpRejection(viewingItp)))"
          @click="openExecuteModal(viewingItp); viewingItp = null"
          class="btn-secondary">Record Execution</button>
        <button v-if="canResubmitItp(viewingItp)" @click="resubmitItp(viewingItp); viewingItp = null" class="btn-secondary">Resubmit</button>
        <button v-if="hasPendingReview(viewingItp)" @click="startInlineReview" class="btn-primary">Submit Review</button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       ITP IMPORT MODAL
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="showItpImportModal" class="modal-overlay" @click.self="showItpImportModal = false">
    <div class="modal-box" style="max-width:860px">
      <div class="modal-header">
        <h3 class="font-semibold text-gray-800">Import ITP Records from Excel</h3>
        <button @click="showItpImportModal = false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="modal-body space-y-4">

        <!-- Result state -->
        <div v-if="itpImportResult" class="rounded-lg p-4 bg-green-50 border border-green-200 text-sm text-green-800 space-y-1">
          <p class="font-semibold">Import completed successfully.</p>
          <p>Created: <strong>{{ itpImportResult.created }}</strong> &nbsp; Updated: <strong>{{ itpImportResult.updated }}</strong> &nbsp; Skipped: <strong>{{ itpImportResult.skipped }}</strong></p>
        </div>

        <!-- File picker + template download -->
        <div v-if="!itpImportPreview && !itpImportResult" class="space-y-3">
          <p class="text-sm text-gray-600">Upload an Excel file (.xlsx) to import ITP records. Use the export to download the current data as a template with valid lookup values.</p>
          <div class="flex items-center gap-3 flex-wrap">
            <button @click="exportItp" class="btn-secondary text-sm flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 8l-3-3m3 3l3-3"/></svg>
              Export / Download Template
            </button>
            <label class="btn-secondary text-sm cursor-pointer flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
              Choose File
              <input type="file" accept=".xlsx" class="hidden" @change="onItpImportFileChange" />
            </label>
            <span v-if="itpImportFile" class="text-sm text-gray-600">{{ itpImportFile.name }}</span>
          </div>
          <p v-if="itpImportError" class="text-red-500 text-sm">{{ itpImportError }}</p>
          <p class="text-xs text-gray-400">Unique key: <strong>ID</strong> column. Leave blank to create new records; fill in an existing ID to update. Required fields: Package Tag, Test Type, Test, Witness Level Code.</p>
        </div>

        <!-- Preview table -->
        <div v-if="itpImportPreview && !itpImportResult" class="space-y-3">
          <div class="flex items-center gap-4 text-sm flex-wrap">
            <span class="px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium">{{ itpImportPreview.summary.creates }} to create</span>
            <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">{{ itpImportPreview.summary.updates }} to update</span>
            <span v-if="itpImportPreview.summary.errors > 0" class="px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium">{{ itpImportPreview.summary.errors }} error(s)</span>
          </div>
          <p v-if="itpImportError" class="text-red-500 text-sm">{{ itpImportError }}</p>
          <div class="overflow-x-auto max-h-96 border rounded">
            <table class="w-full text-xs">
              <thead class="bg-gray-100 sticky top-0">
                <tr>
                  <th class="px-2 py-1 text-left">Row</th>
                  <th class="px-2 py-1 text-left">Action</th>
                  <th class="px-2 py-1 text-left">ID</th>
                  <th class="px-2 py-1 text-left">Package</th>
                  <th class="px-2 py-1 text-left">Test Type</th>
                  <th class="px-2 py-1 text-left">Test</th>
                  <th class="px-2 py-1 text-left">Witness</th>
                  <th class="px-2 py-1 text-left">Status</th>
                  <th class="px-2 py-1 text-left">Errors / Warnings</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in itpImportPreview.rows" :key="r.row_num"
                  :class="r.errors.length ? 'bg-red-50' : r.warnings.length ? 'bg-yellow-50' : ''">
                  <td class="px-2 py-1 text-gray-500">{{ r.row_num }}</td>
                  <td class="px-2 py-1">
                    <span :class="r.action==='CREATE' ? 'text-green-700 font-semibold' : 'text-blue-700 font-semibold'">{{ r.action }}</span>
                  </td>
                  <td class="px-2 py-1 text-gray-500">{{ r.id || '—' }}</td>
                  <td class="px-2 py-1">{{ r.package_tag }}</td>
                  <td class="px-2 py-1">{{ r.test_type }}</td>
                  <td class="px-2 py-1 max-w-xs truncate" :title="r.test">{{ r.test }}</td>
                  <td class="px-2 py-1">{{ r.witness_level }}</td>
                  <td class="px-2 py-1">{{ r.status }}</td>
                  <td class="px-2 py-1">
                    <span v-for="e in r.errors" :key="e" class="block text-red-600">✗ {{ e }}</span>
                    <span v-for="w in r.warnings" :key="w" class="block text-yellow-700">⚠ {{ w }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button v-if="!itpImportResult" @click="resetItpImport" class="btn-secondary">{{ itpImportPreview ? 'Back' : 'Cancel' }}</button>
        <button v-if="itpImportResult" @click="showItpImportModal = false; loadItp()" class="btn-primary">Close &amp; Refresh</button>
        <button v-if="!itpImportPreview && !itpImportResult && itpImportFile" @click="runItpImportPreview"
          :disabled="itpImportLoading" class="btn-primary">
          {{ itpImportLoading ? 'Analysing…' : 'Preview Import' }}
        </button>
        <button v-if="itpImportPreview && !itpImportResult && itpImportPreview.summary.errors === 0" @click="applyItpImport"
          :disabled="itpImportApplying" class="btn-primary">
          {{ itpImportApplying ? 'Applying…' : 'Confirm &amp; Apply' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       EXECUTE MODAL
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="showExecuteModal" class="modal-overlay" @click.self="showExecuteModal = false">
    <div class="modal-box" style="max-width:480px">
      <div class="modal-header">
        <h2 class="font-semibold text-gray-800">Record Execution Result</h2>
        <button @click="showExecuteModal = false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="modal-body space-y-4">
        <div>
          <label class="form-label">Outcome <span class="text-red-500">*</span></label>
          <div class="flex gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" v-model="executeForm.status" value="PASSED"/>
              <span class="px-3 py-1 rounded-full text-sm font-semibold" style="background:#D1FAE5;color:#065F46">PASSED</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" v-model="executeForm.status" value="FAILED"/>
              <span class="px-3 py-1 rounded-full text-sm font-semibold" style="background:#FEE2E2;color:#991B1B">FAILED</span>
            </label>
          </div>
        </div>
        <div>
          <label class="form-label">Execution Date</label>
          <input v-model="executeForm.executed_date" type="date" class="input-field"/>
        </div>
        <div>
          <label class="form-label">Result / Notes <span class="text-red-500">*</span></label>
          <textarea v-model="executeForm.result" class="input-field" rows="4" placeholder="Describe the test result, observations, and any non-conformances..."></textarea>
        </div>
        <div>
          <label class="form-label">Attachments</label>
          <p class="text-xs text-gray-400 mb-2">Upload photos, reports or supporting documents for this execution. Files are linked to the ITP record.</p>
          <file-attachments record-type="itp" :record-id="executingItpId" :can-upload="true" :can-edit="true"></file-attachments>
        </div>
      </div>
      <div class="modal-footer">
        <button @click="showExecuteModal = false" class="btn-secondary">Cancel</button>
        <button @click="submitExecute" class="btn-primary">Submit Result</button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       REVIEW MODAL (own review)
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="showReviewModal" class="modal-overlay" @click.self="showReviewModal = false">
    <div class="modal-box" style="max-width:480px">
      <div class="modal-header">
        <h2 class="font-semibold text-gray-800">Submit ITP Review</h2>
        <button @click="showReviewModal = false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="modal-body space-y-4">
        <div>
          <label class="form-label">Decision <span class="text-red-500">*</span></label>
          <div class="flex gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" v-model="reviewForm.status" value="APPROVED"/>
              <span class="px-3 py-1 rounded-full text-sm font-semibold" style="background:#D1FAE5;color:#065F46">APPROVED</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" v-model="reviewForm.status" value="REJECTED"/>
              <span class="px-3 py-1 rounded-full text-sm font-semibold" style="background:#FEE2E2;color:#991B1B">REJECTED</span>
            </label>
          </div>
        </div>
        <div>
          <label class="form-label">Comment</label>
          <label class="form-label">Comment <span class="text-red-500">*</span></label>
          <textarea v-model="reviewForm.comment" class="input-field" rows="3" placeholder="Add your review comment..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button @click="showReviewModal = false" class="btn-secondary">Cancel</button>
        <button @click="submitReview" class="btn-primary">Submit Review</button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       OVERRIDE MODAL (admin / owner)
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="showOverrideModal" class="modal-overlay" @click.self="showOverrideModal = false">
    <div class="modal-box" style="max-width:480px">
      <div class="modal-header">
        <h2 class="font-semibold text-gray-800">Override Review Decision</h2>
        <button @click="showOverrideModal = false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="modal-body space-y-4">
        <p class="text-sm text-gray-600">
          You are overriding both PMC Technical and Client Technical reviews at once.
          The ITP will be set to <strong>{{ overrideForm.status }}</strong>. This action is logged.
        </p>
        <div>
          <label class="form-label">Decision <span class="text-red-500">*</span></label>
          <div class="flex gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" v-model="overrideForm.status" value="APPROVED"/>
              <span class="px-3 py-1 rounded-full text-sm font-semibold" style="background:#D1FAE5;color:#065F46">APPROVED</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" v-model="overrideForm.status" value="REJECTED"/>
              <span class="px-3 py-1 rounded-full text-sm font-semibold" style="background:#FEE2E2;color:#991B1B">REJECTED</span>
            </label>
          </div>
        </div>
        <div>
          <label class="form-label">Comment</label>
          <textarea v-model="overrideForm.comment" class="input-field" rows="3" placeholder="Reason for override..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button @click="showOverrideModal = false" class="btn-secondary">Cancel</button>
        <button @click="submitOverride" class="btn-primary">Override Decision</button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       ITP REVIEW HISTORY MODAL
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="historyItp" class="modal-overlay" @click.self="historyItp = null" style="z-index:120">
    <div class="modal-box" style="max-width:560px">
      <div class="modal-header">
        <div>
          <p class="text-xs font-mono text-gray-400">IT-{{ String(historyItp.seq_id || historyItp.id).padStart(6,'0') }}</p>
          <h3 class="text-lg font-semibold text-gray-800">Review History</h3>
        </div>
        <button @click="historyItp = null" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <div v-if="itpHistoryLoading" class="text-center py-6 text-gray-400">
          <img src="/static/assets/impulse-loader.svg" class="h-6 mx-auto" alt="Loading"/>
        </div>
        <div v-else-if="itpHistoryError" class="text-red-500 text-sm">{{ itpHistoryError }}</div>
        <div v-else-if="itpHistoryEntries.length === 0" class="text-center py-6 text-gray-400 text-sm">No review events recorded yet.</div>
        <ol v-else class="relative border-l-2 border-gray-200 ml-3 space-y-4 pl-5">
          <li v-for="entry in itpHistoryEntries" :key="entry.id" class="relative">
            <span class="absolute -left-[29px] top-1 w-3 h-3 rounded-full border-2 border-white"
              :class="entry.approved === true ? 'bg-green-500' : (entry.approved === false ? 'bg-red-500' : 'bg-blue-500')"></span>
            <div class="flex items-center gap-2 flex-wrap">
              <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', historyEventClassItp(entry)]">
                {{ historyEventLabelItp(entry) }}
              </span>
              <span class="text-xs text-gray-500">{{ fmtDateTimeItp(entry.created_at) }}</span>
            </div>
            <p class="text-xs text-gray-600 mt-1">by <span class="font-medium">{{ entry.actor_name || '—' }}</span></p>
            <p v-if="entry.comment" class="text-sm text-gray-700 italic mt-1 bg-gray-50 rounded p-2 whitespace-pre-line">{{ entry.comment }}</p>
          </li>
        </ol>
      </div>
      <div class="modal-footer">
        <button @click="historyItp = null" class="btn-secondary">Close</button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       PUNCH VIEW MODAL
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="viewingPunch && !showRespondModal && !showPunchReviewModal && !showPunchOverrideModal" class="modal-overlay" @click.self="viewingPunch = null">
    <div class="modal-box modal-xl" style="max-width:min(1450px,95vw) !important;height:95vh;max-height:95vh;min-height:min(85vh,700px);display:flex;flex-direction:column">
      <div class="modal-header">
        <h2 class="font-semibold text-gray-800">Punch Item — {{ viewingPunch.package_tag }}</h2>
        <button @click="viewingPunch = null" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="modal-body" style="padding:0;display:flex;overflow:hidden;flex:1">
      <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
      <div class="space-y-4 text-sm">
        <div class="grid grid-cols-2 gap-4">
          <div><span class="text-gray-500">Package:</span> <span class="font-semibold">{{ viewingPunch.package_tag }} – {{ viewingPunch.package_name }}</span></div>
          <div>
            <span class="text-gray-500">Obligation Time:</span>
            <span class="ml-1 px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800">{{ viewingPunch.obligation_time_code }}</span>
            {{ viewingPunch.obligation_time_name }}
          </div>
          <div v-if="viewingPunch.area_tag"><span class="text-gray-500">Area:</span> {{ viewingPunch.area_tag }}</div>
          <div v-if="viewingPunch.unit_tag"><span class="text-gray-500">Unit:</span> {{ viewingPunch.unit_tag }}</div>
          <div v-if="viewingPunch.itp_test"><span class="text-gray-500">ITP Test:</span> {{ viewingPunch.itp_test }}</div>
          <div>
            <span class="text-gray-500">Status:</span>
            <span class="ml-1 px-2 py-0.5 rounded text-xs font-bold" :style="punchStatusBadge(viewingPunch.status)">{{ viewingPunch.status.replace('_',' ') }}</span>
          </div>
        </div>
        <div>
          <p class="text-gray-500 font-semibold mb-1">Topic</p>
          <p class="font-medium text-gray-800">{{ viewingPunch.topic }}</p>
        </div>
        <div>
          <p class="text-gray-500 font-semibold mb-1">Details</p>
          <p class="text-gray-700 whitespace-pre-wrap">{{ viewingPunch.details }}</p>
        </div>
        <div v-if="viewingPunch.response">
          <p class="text-gray-500 font-semibold mb-1">Response</p>
          <p class="text-gray-700 whitespace-pre-wrap">{{ viewingPunch.response }}</p>
        </div>
        <div class="text-xs text-gray-400">Created by {{ viewingPunch.created_by_name || '—' }}</div>

        <!-- Floorplan location (read-only thumbnail with the saved pin) -->
        <div v-if="viewPunchFloorplan" class="border-t pt-4">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Floorplan location</p>
          <div class="rounded-lg overflow-hidden border border-gray-200 bg-white mx-auto" style="max-width:28rem">
            <div class="relative bg-white">
              <img v-if="viewPunchFloorplanBlob" :src="viewPunchFloorplanBlob" :alt="viewPunchFloorplan.name"
                   class="block w-full h-auto"
                   draggable="false"
                   @load="onFloorplanImgLoad(viewPunchFloorplan.id, $event)"/>
              <div v-else class="aspect-[4/3] flex items-center justify-center text-gray-400 text-xs">
                Loading floorplan…
              </div>
              <div v-if="viewingPunch.floorplan_x != null && viewingPunch.floorplan_y != null"
                   class="absolute pointer-events-none"
                   :style="{ left: (viewingPunch.floorplan_x * 100) + '%', top: (viewingPunch.floorplan_y * 100) + '%', transform: 'translate(-50%, -100%)' }">
                <svg width="24" height="30" viewBox="0 0 24 30" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.55))">
                  <path d="M12 0C6.48 0 2 4.48 2 10c0 7.5 10 20 10 20s10-12.5 10-20C22 4.48 17.52 0 12 0z"
                        fill="#dc2626" stroke="white" stroke-width="2"/>
                  <circle cx="12" cy="10" r="3.6" fill="white"/>
                </svg>
              </div>
            </div>
            <div class="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-white border-t border-gray-200">
              <span class="font-medium text-gray-700 truncate">{{ viewPunchFloorplan.name }}</span>
              <span v-if="viewingPunch.floorplan_x != null" class="text-emerald-600 font-semibold whitespace-nowrap">Pin set</span>
              <span v-else class="text-gray-400 whitespace-nowrap">No pin</span>
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div class="border-t pt-4">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Notes</p>
          <div v-if="punchNotes.length === 0" class="text-sm text-gray-400 italic mb-3">No notes yet.</div>
          <div v-else class="space-y-2 mb-3">
            <div v-for="n in punchNotes" :key="n.id" class="bg-gray-50 rounded-lg p-3 text-sm">
              <div class="flex items-start justify-between gap-2">
                <p class="text-gray-800 whitespace-pre-line flex-1">{{ n.content }}</p>
                <button v-if="canDeletePunchNote(n)" @click="deletePunchNote(n)" class="text-gray-300 hover:text-red-500 flex-shrink-0 mt-0.5" title="Delete note">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <p class="text-xs text-gray-400 mt-1">{{ n.author_name || 'Unknown' }} · {{ n.created_at ? n.created_at.slice(0,10) : '' }}</p>
            </div>
          </div>
          <div class="flex gap-2">
            <textarea v-model="newPunchNote" class="input-field text-sm flex-1" rows="2" placeholder="Add a note..."></textarea>
            <button @click="addPunchNote" :disabled="savingPunchNote || !newPunchNote.trim()" class="btn-primary text-sm self-end">Add</button>
          </div>
        </div>
      </div><!-- end space-y-4 -->
      </div><!-- end left column -->
      <div class="w-[54rem] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
        <file-attachments record-type="punch" :record-id="viewingPunch.id" :can-upload="true" :can-edit="canManage" :gallery-mode="true"></file-attachments>
      </div>
      </div><!-- end modal-body -->
      <div class="modal-footer">
        <button @click="viewingPunch = null" class="btn-secondary">Close</button>
        <button v-if="canManage && viewingPunch.status === 'OPEN'" @click="openEditPunch(viewingPunch); viewingPunch = null" class="btn-primary">Edit</button>
        <button v-if="viewingPunch.status === 'OPEN'" @click="openRespondPunch(viewingPunch)" class="btn-primary">Respond &amp; Submit</button>
        <button v-if="viewingPunch.status === 'TO_REVIEW'" @click="openPunchReview(viewingPunch)" class="btn-primary">Review</button>
        <button v-if="canManage" @click="openPunchOverride(viewingPunch)" class="btn-secondary">Override Status</button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       PUNCH CREATE / EDIT MODAL
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="showPunchModal" class="modal-overlay" @click.self="showPunchModal = false">
    <div class="modal-box modal-xl" style="max-width:min(1565px,95vw) !important;height:95vh;max-height:95vh;min-height:min(85vh,700px);display:flex;flex-direction:column">
      <div class="modal-header">
        <div class="flex items-center gap-3">
          <h2 class="font-semibold text-gray-800">{{ punchModalMode === 'create' ? 'New Punch Item' : 'Edit Punch Item' }}</h2>
          <span v-if="currentPunchStatus === 'DRAFT'" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">DRAFT</span>
          <span v-else-if="currentPunchStatus === 'OPEN'" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200">OPEN</span>
          <span v-else-if="currentPunchStatus === 'TO_REVIEW'" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">TO REVIEW</span>
          <span v-else-if="currentPunchStatus === 'CLOSED'" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">CLOSED</span>
        </div>
        <button @click="showPunchModal = false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="modal-body" style="padding:0;display:flex;overflow:hidden;flex:1">
      <div class="min-w-0 overflow-y-auto" style="flex:1 1 50%;padding:20px 24px">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Package <span class="text-red-500">*</span></label>
            <select v-model="punchForm.package_id" @change="punchForm.itp_record_id = null" class="input-field">
              <option :value="null">Select package...</option>
              <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }} – {{ p.name }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Obligation Time <span class="text-red-500">*</span></label>
            <select v-model="punchForm.obligation_time_id" class="input-field">
              <option :value="null">Select obligation time...</option>
              <option v-for="ot in obligationTimes" :key="ot.id" :value="ot.id">{{ ot.code }} – {{ ot.name }}</option>
            </select>
          </div>
        </div>
        <div>
          <label class="form-label">Topic <span class="text-red-500">*</span></label>
          <input v-model="punchForm.topic" class="input-field" placeholder="Short description of the punch item"/>
        </div>
        <div>
          <label class="form-label">Details <span class="text-red-500">*</span></label>
          <textarea v-model="punchForm.details" class="input-field" rows="3" placeholder="Full description, reference to drawing/specification..."></textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Area</label>
            <select v-model="punchForm.area_id" @change="onPunchAreaChanged" class="input-field">
              <option :value="null">None</option>
              <option v-for="a in areas" :key="a.id" :value="a.id">{{ a.tag }} – {{ a.description }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Unit</label>
            <select v-model="punchForm.unit_id" class="input-field">
              <option :value="null">None</option>
              <option v-for="u in units" :key="u.id" :value="u.id">{{ u.tag }} – {{ u.description }}</option>
            </select>
          </div>
        </div>
        <div>
          <label class="form-label">ITP Record (optional)</label>
          <select v-model="punchForm.itp_record_id" class="input-field" :disabled="!punchForm.package_id">
            <option :value="null">{{ punchForm.package_id ? 'None' : 'Select a package first' }}</option>
            <option v-for="r in itpRecordsForSelectedPackage" :key="r.id" :value="r.id">{{ r.test }}</option>
          </select>
        </div>
        <p v-if="punchError" class="text-red-600 text-sm">{{ punchError }}</p>

        <!-- ── Floorplan pin (only if the chosen area has a plan) ────────── -->
        <div v-if="currentAreaFloorplan" class="border-t border-gray-200 pt-3">
          <div class="flex items-center justify-between mb-2">
            <label class="form-label mb-0">
              Floorplan location
              <span class="text-gray-400 text-xs font-normal">(optional)</span>
            </label>
            <span v-if="canEditPin" class="text-xs text-gray-500">
              {{ punchForm.floorplan_id ? 'Tap to move or clear the pin' : 'Tap the floorplan to drop a pin' }}
            </span>
          </div>
          <div class="rounded-lg overflow-hidden border bg-gray-100 mx-auto"
               style="max-width:28rem"
               :class="canEditPin ? 'border-gray-200 hover:border-ips-blue cursor-pointer' : 'border-gray-200 cursor-default'"
               @click="openPinPicker">
            <div class="relative bg-white">
              <img v-if="currentFloorplanThumb" :src="currentFloorplanThumb"
                   :alt="currentAreaFloorplan.name"
                   class="block w-full h-auto"
                   draggable="false"
                   @load="onFloorplanImgLoad(currentAreaFloorplan.id, $event)"/>
              <div v-else class="aspect-[4/3] flex items-center justify-center text-gray-400 text-xs">
                Loading floorplan…
              </div>
              <div v-if="punchForm.floorplan_x != null && punchForm.floorplan_y != null"
                   class="absolute pointer-events-none"
                   :style="{ left: (punchForm.floorplan_x * 100) + '%', top: (punchForm.floorplan_y * 100) + '%', transform: 'translate(-50%, -100%)' }">
                <svg width="24" height="30" viewBox="0 0 24 30" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.55))">
                  <path d="M12 0C6.48 0 2 4.48 2 10c0 7.5 10 20 10 20s10-12.5 10-20C22 4.48 17.52 0 12 0z"
                        fill="#dc2626" stroke="white" stroke-width="2"/>
                  <circle cx="12" cy="10" r="3.6" fill="white"/>
                </svg>
              </div>
            </div>
            <div class="flex items-center justify-between gap-2 px-3 py-2 text-xs bg-white border-t border-gray-200">
              <span class="font-medium text-gray-700 truncate">{{ currentAreaFloorplan.name }}</span>
              <span v-if="punchForm.floorplan_x != null" class="text-emerald-600 font-semibold whitespace-nowrap">Pin set</span>
              <span v-else class="text-gray-400 whitespace-nowrap">No pin yet</span>
            </div>
          </div>
        </div>
        <div v-else-if="punchForm.area_id" class="border-t border-gray-200 pt-3">
          <p class="text-xs text-gray-400 italic">
            This area has no floorplan linked. Link a floorplan in Project Organization → Floorplans to enable pin-pointing.
          </p>
        </div>
      </div><!-- end space-y-4 -->
      </div><!-- end left column -->
      <div class="flex-1 min-w-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="flex:1 1 50%;padding:20px 16px">
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
        <file-attachments record-type="punch" :record-id="editingPunchId" :can-upload="true" :can-edit="canManage" :gallery-mode="true"></file-attachments>
      </div>
      </div><!-- end modal-body -->
      <div class="modal-footer">
        <button @click="showPunchModal = false" class="btn-secondary">{{ currentPunchStatus === 'DRAFT' ? 'Close' : 'Cancel' }}</button>
        <!-- First save (creating) → store as DRAFT, modal stays open -->
        <button v-if="punchModalMode === 'create'" @click="savePunch" :disabled="savingPunch" class="btn-primary">
          {{ savingPunch ? 'Saving...' : 'Save as Draft' }}
        </button>
        <!-- Editing an already-saved record -->
        <template v-else>
          <button @click="savePunch" :disabled="savingPunch || submittingPunch" class="btn-secondary">
            {{ savingPunch ? 'Saving...' : 'Save Changes' }}
          </button>
          <!-- Submit only appears while the item is still a DRAFT -->
          <button v-if="currentPunchStatus === 'DRAFT'"
            @click="submitPunchDraft"
            :disabled="savingPunch || submittingPunch"
            class="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {{ submittingPunch ? 'Submitting…' : 'Submit' }}
          </button>
        </template>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       PUNCHLIST EXPORT PDF MODAL
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="showPunchExportModal" class="modal-overlay" style="z-index:130" @click.self="closePunchExportModal">
    <div class="modal-box" style="max-width:680px;width:95vw">
      <div class="modal-header">
        <h3 class="text-lg font-semibold text-gray-800">Export Punch List</h3>
        <button @click="closePunchExportModal" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <p class="text-xs text-gray-500 mb-4">
          Pick the items to include and how to group them. Empty selections mean "all".
        </p>

        <div class="grid grid-cols-2 gap-4">
          <!-- Packages -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="form-label mb-0">Packages</label>
              <button type="button"
                      @click="togglePunchSelectAll('package_ids', packages.map(p => p.id))"
                      class="text-xs text-ips-blue font-semibold hover:underline">
                {{ punchExportFilters.package_ids.length === packages.length && packages.length ? 'Clear all' : 'Select all' }}
              </button>
            </div>
            <div class="border border-gray-200 rounded-lg max-h-80 overflow-y-auto divide-y divide-gray-100">
              <div v-if="!packages.length" class="px-3 py-3 text-xs text-gray-400 text-center">No packages</div>
              <label v-for="p in packages" :key="p.id"
                     class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
                <input type="checkbox" :value="p.id"
                       :checked="punchExportFilters.package_ids.includes(p.id)"
                       @change="togglePunchExportArrayValue('package_ids', p.id)"
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
                      @click="togglePunchSelectAll('area_ids', areas.map(a => a.id))"
                      class="text-xs text-ips-blue font-semibold hover:underline">
                {{ punchExportFilters.area_ids.length === areas.length && areas.length ? 'Clear all' : 'Select all' }}
              </button>
            </div>
            <div class="border border-gray-200 rounded-lg max-h-80 overflow-y-auto divide-y divide-gray-100">
              <div v-if="!areas.length" class="px-3 py-3 text-xs text-gray-400 text-center">No areas</div>
              <label v-for="a in areas" :key="a.id"
                     class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
                <input type="checkbox" :value="a.id"
                       :checked="punchExportFilters.area_ids.includes(a.id)"
                       @change="togglePunchExportArrayValue('area_ids', a.id)"
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
            <label v-for="st in ['OPEN','TO_REVIEW','CLOSED']" :key="st"
                   class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm"
                   :class="punchExportFilters.statuses.includes(st)
                     ? 'bg-ips-blue text-white border-ips-blue'
                     : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'">
              <input type="checkbox" :value="st"
                     :checked="punchExportFilters.statuses.includes(st)"
                     @change="togglePunchExportArrayValue('statuses', st)"
                     class="hidden"/>
              {{ st }}
            </label>
          </div>
        </div>

        <!-- Grouping -->
        <div class="mt-4">
          <label class="form-label">Grouping</label>
          <select v-model="punchExportFilters.group_by" class="input-field" style="max-width:320px">
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
            <input type="checkbox" v-model="punchExportFilters.per_package_plans" class="rounded mt-0.5"/>
            <span>
              <span class="font-medium text-gray-800">Floorplan pages per package</span>
              <span class="block text-xs text-gray-500 mt-0.5">
                Repeats each floorplan once per package (less crowded when many points share a plan).
              </span>
            </span>
          </label>
        </div>

        <p v-if="punchExportError" class="text-red-500 text-sm mt-3">{{ punchExportError }}</p>
      </div>
      <div class="modal-footer">
        <button @click="closePunchExportModal" :disabled="punchExporting" class="btn-secondary">Cancel</button>
        <button @click="runPunchExport" :disabled="punchExporting" class="btn-primary">
          <svg v-if="punchExporting" class="w-4 h-4 mr-2 inline animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          {{ punchExporting ? 'Generating PDF…' : 'Generate PDF' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       FLOORPLAN PIN PICKER (mounted while a punch modal is open)
  ═══════════════════════════════════════════════════════════════ -->
  <floorplan-pin-picker v-if="showPinPicker && currentAreaFloorplan"
    :floorplan-id="currentAreaFloorplan.id"
    :floorplan-name="currentAreaFloorplan.name"
    :initial-x="punchForm.floorplan_x"
    :initial-y="punchForm.floorplan_y"
    @save="onPinSave"
    @clear="onPinClear"
    @cancel="onPinCancel">
  </floorplan-pin-picker>

  <!-- ═══════════════════════════════════════════════════════════════
       PUNCH RESPOND MODAL
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="showRespondModal" class="modal-overlay" @click.self="showRespondModal = false">
    <div class="modal-box modal-xl" style="max-width:min(1450px,95vw) !important;height:95vh;max-height:95vh;min-height:min(85vh,700px);display:flex;flex-direction:column">
      <div class="modal-header">
        <h2 class="font-semibold text-gray-800">Respond to Punch Item</h2>
        <button @click="showRespondModal = false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="modal-body" style="padding:0;display:flex;overflow:hidden;flex:1">
      <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
      <div class="space-y-4">
        <div v-if="viewingPunch" class="bg-gray-50 rounded-lg p-4 text-sm space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div><span class="text-gray-500">Package:</span> <span class="font-semibold">{{ viewingPunch.package_tag }} – {{ viewingPunch.package_name }}</span></div>
            <div>
              <span class="text-gray-500">Obligation Time:</span>
              <span class="ml-1 px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800">{{ viewingPunch.obligation_time_code }}</span>
              <span class="text-gray-700"> {{ viewingPunch.obligation_time_name }}</span>
            </div>
            <div v-if="viewingPunch.area_tag"><span class="text-gray-500">Area:</span> {{ viewingPunch.area_tag }}</div>
            <div v-if="viewingPunch.unit_tag"><span class="text-gray-500">Unit:</span> {{ viewingPunch.unit_tag }}</div>
            <div v-if="viewingPunch.itp_test" class="col-span-2"><span class="text-gray-500">ITP Test:</span> {{ viewingPunch.itp_test }}</div>
          </div>
          <div class="border-t border-gray-200 pt-3">
            <p class="text-gray-500 font-semibold mb-1">Topic</p>
            <p class="font-medium text-gray-800">{{ viewingPunch.topic }}</p>
          </div>
          <div>
            <p class="text-gray-500 font-semibold mb-1">Details</p>
            <p class="text-gray-700 whitespace-pre-wrap">{{ viewingPunch.details }}</p>
          </div>
          <div class="text-xs text-gray-400">Created by {{ viewingPunch.created_by_name || '—' }}</div>
        </div>
        <div>
          <label class="form-label">Your Response <span class="text-red-500">*</span></label>
          <textarea v-model="respondForm.response" class="input-field" rows="4" placeholder="Describe the remediation action taken..."></textarea>
        </div>
        <p v-if="punchError" class="text-red-600 text-sm">{{ punchError }}</p>
      </div><!-- end space-y-4 -->
      </div><!-- end left column -->
      <div class="w-[54rem] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
        <file-attachments record-type="punch" :record-id="viewingPunch ? viewingPunch.id : null" :can-upload="true" :can-edit="canManage" :gallery-mode="true"></file-attachments>
      </div>
      </div><!-- end modal-body -->
      <div class="modal-footer">
        <button @click="showRespondModal = false" class="btn-secondary">Cancel</button>
        <button @click="submitRespondPunch" class="btn-primary">Submit for Review</button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       PUNCH REVIEW MODAL
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="showPunchReviewModal" class="modal-overlay" @click.self="showPunchReviewModal = false">
    <div class="modal-box" style="max-width:520px">
      <div class="modal-header">
        <h2 class="font-semibold text-gray-800">Review Punch Item</h2>
        <button @click="showPunchReviewModal = false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="modal-body space-y-4">
        <div v-if="viewingPunch" class="bg-gray-50 rounded p-3 text-sm space-y-2">
          <p class="font-semibold text-gray-700">{{ viewingPunch.topic }}</p>
          <p class="text-gray-500">{{ viewingPunch.details }}</p>
          <div v-if="viewingPunch.response" class="border-t border-gray-200 pt-2">
            <p class="text-xs text-gray-400 font-semibold uppercase mb-1">Response from contractor</p>
            <p class="text-gray-700">{{ viewingPunch.response }}</p>
          </div>
        </div>
        <div>
          <label class="form-label">Decision <span class="text-red-500">*</span></label>
          <div class="flex gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" v-model="punchReviewForm.action" value="CLOSE"/>
              <span class="px-3 py-1 rounded-full text-sm font-semibold" style="background:#D1FAE5;color:#065F46">Close</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" v-model="punchReviewForm.action" value="REOPEN"/>
              <span class="px-3 py-1 rounded-full text-sm font-semibold" style="background:#FEE2E2;color:#991B1B">Reopen</span>
            </label>
          </div>
        </div>
        <div>
          <label class="form-label">Comment</label>
          <textarea v-model="punchReviewForm.comment" class="input-field" rows="3" placeholder="Optional review comment..."></textarea>
        </div>
        <p v-if="punchError" class="text-red-600 text-sm">{{ punchError }}</p>
      </div>
      <div class="modal-footer">
        <button @click="showPunchReviewModal = false" class="btn-secondary">Cancel</button>
        <button @click="submitPunchReview" class="btn-primary">Submit</button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       PUNCH OVERRIDE MODAL
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="showPunchOverrideModal" class="modal-overlay" @click.self="showPunchOverrideModal = false">
    <div class="modal-box" style="max-width:420px">
      <div class="modal-header">
        <h2 class="font-semibold text-gray-800">Override Punch Status</h2>
        <button @click="showPunchOverrideModal = false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="modal-body space-y-4">
        <div>
          <label class="form-label">New Status <span class="text-red-500">*</span></label>
          <select v-model="punchOverrideForm.status" class="input-field">
            <option value="OPEN">Open</option>
            <option value="TO_REVIEW">To Review</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <p v-if="punchError" class="text-red-600 text-sm">{{ punchError }}</p>
      </div>
      <div class="modal-footer">
        <button @click="showPunchOverrideModal = false" class="btn-secondary">Cancel</button>
        <button @click="submitPunchOverride" class="btn-primary">Apply Override</button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       OBLIGATION TIME MODAL
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="showObligationTimeModal" class="modal-overlay" @click.self="showObligationTimeModal = false">
    <div class="modal-box" style="max-width:420px">
      <div class="modal-header">
        <h2 class="font-semibold text-gray-800">{{ editingObligationTimeId ? 'Edit Obligation Time' : 'New Obligation Time' }}</h2>
        <button @click="showObligationTimeModal = false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="modal-body space-y-4">
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="form-label">Code <span class="text-red-500">*</span></label>
            <input v-model="obligationTimeForm.code" class="input-field" placeholder="A" maxlength="10"/>
          </div>
          <div class="col-span-2">
            <label class="form-label">Name <span class="text-red-500">*</span></label>
            <input v-model="obligationTimeForm.name" class="input-field" placeholder="e.g. Before Delivery"/>
          </div>
        </div>
        <div>
          <label class="form-label">Sort Order</label>
          <input v-model.number="obligationTimeForm.sort_order" type="number" class="input-field" style="max-width:100px"/>
        </div>
      </div>
      <div class="modal-footer">
        <button @click="showObligationTimeModal = false" class="btn-secondary">Cancel</button>
        <button @click="saveObligationTime" class="btn-primary">{{ editingObligationTimeId ? 'Save Changes' : 'Create' }}</button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       TEST TYPE MODAL
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="showTestTypeModal" class="modal-overlay" @click.self="showTestTypeModal = false">
    <div class="modal-box" style="max-width:480px">
      <div class="modal-header">
        <h2 class="font-semibold text-gray-800">{{ editingTestTypeId ? 'Edit Test Type' : 'New Test Type' }}</h2>
        <button @click="showTestTypeModal = false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="modal-body space-y-4">
        <div>
          <label class="form-label">Name <span class="text-red-500">*</span></label>
          <input v-model="testTypeForm.name" class="input-field" placeholder="e.g. Hydrostatic Test"/>
        </div>
        <div>
          <label class="form-label">Description</label>
          <textarea v-model="testTypeForm.description" class="input-field" rows="2"></textarea>
        </div>
        <div>
          <label class="form-label">Sort Order</label>
          <input v-model.number="testTypeForm.sort_order" type="number" class="input-field" style="max-width:100px"/>
        </div>
      </div>
      <div class="modal-footer">
        <button @click="showTestTypeModal = false" class="btn-secondary">Cancel</button>
        <button @click="saveTestType" class="btn-primary">{{ editingTestTypeId ? 'Save Changes' : 'Create' }}</button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════
       WITNESS LEVEL MODAL
  ═══════════════════════════════════════════════════════════════ -->
  <div v-if="showWitnessLevelModal" class="modal-overlay" @click.self="showWitnessLevelModal = false">
    <div class="modal-box" style="max-width:480px">
      <div class="modal-header">
        <h2 class="font-semibold text-gray-800">{{ editingWitnessLevelId ? 'Edit Witness Level' : 'New Witness Level' }}</h2>
        <button @click="showWitnessLevelModal = false" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      <div class="modal-body space-y-4">
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="form-label">Code <span class="text-red-500">*</span></label>
            <input v-model="witnessLevelForm.code" class="input-field" placeholder="H" maxlength="10"/>
          </div>
          <div class="col-span-2">
            <label class="form-label">Name <span class="text-red-500">*</span></label>
            <input v-model="witnessLevelForm.name" class="input-field" placeholder="e.g. Hold"/>
          </div>
        </div>
        <div>
          <label class="form-label">Description</label>
          <textarea v-model="witnessLevelForm.description" class="input-field" rows="2"></textarea>
        </div>
        <div>
          <label class="form-label">Sort Order</label>
          <input v-model.number="witnessLevelForm.sort_order" type="number" class="input-field" style="max-width:100px"/>
        </div>
      </div>
      <div class="modal-footer">
        <button @click="showWitnessLevelModal = false" class="btn-secondary">Cancel</button>
        <button @click="saveWitnessLevel" class="btn-primary">{{ editingWitnessLevelId ? 'Save Changes' : 'Create' }}</button>
      </div>
    </div>
  </div>

</div>
  `,
});
