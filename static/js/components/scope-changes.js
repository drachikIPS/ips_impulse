// ─────────────────────────────────────────────────────────────────────────────
// Scope Changes Module
// ─────────────────────────────────────────────────────────────────────────────
app.component('scope-changes-module', {
  props: ['currentUser', 'contacts', 'pendingOpen', 'initialTab'],
  emits: ['subtab-change', 'record-change'],

  data() {
    return {
      tab: 'list',
      scopeChanges: [],
      packages: [],
      loading: false,
      statusFilter: '',
      exporting: false,
      packageFilter: null,

      // Dashboard
      dashboard: null,
      dashLoading: false,
      dashPkgFilter: '',      // '' = all packages; otherwise package_id
      scCostChartObj: null,
      scMonthsChartObj: null,

      // Create / Edit modal
      showForm: false,
      editingSc: null,
      scForm: { description: '', details: '', cost: 0, schedule_impact_months: 0, package_id: null },
      scError: '',
      savingSc: false,

      // Detail / Review modal
      selectedSc: null,
      reviewRole: '',   // 'pmc' | 'client'
      reviewForm: { approved: true, comment: '' },
      reviewError: '',
      reviewSaving: false,

      // Create order from SCs
      orderPkgId: null,
      orderApprovedScs: [],
      orderSelectedIds: [],
      orderForm: { po_number: '', vendor_name: '', order_date: '', amount: 0, currency: 'EUR' },
      orderError: '',
      orderSaving: false,
      orderSuccess: '',

      // Override modal (admin/owner)
      showOverrideModal: false,
      overrideSc: null,
      overrideApproved: true,
      overrideComment: '',
      overrideSaving: false,
      overrideError: '',

      // History modal
      historySc: null,
      historyEntries: [],
      historyLoading: false,
      historyError: '',
    };
  },

  computed: {
    projectCurrency() {
      return (window.AppSettings && window.AppSettings.currency) || 'EUR';
    },

    isAdminOrOwner() {
      if (!this.currentUser) return false;
      if (['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role)) return true;
      // Change Manager (Scope Changes Module Lead) gets the same UI gates.
      return (this.currentUser.lead_modules || []).includes('Scope Changes');
    },

    pendingScApprovals() {
      return this.scopeChanges.filter(sc => sc.status === 'SUBMITTED');
    },

    visiblePackageIds() {
      const role = this.currentUser && this.currentUser.role;
      if (!role || ['ADMIN', 'PROJECT_OWNER', 'PROJECT_TEAM', 'CLIENT'].includes(role)) return null;
      // VENDOR: only packages where they are a linked contact
      const cid = this.currentUser.contact_id;
      if (!cid) return new Set();
      return new Set(
        this.packages.filter(p => p.contact_ids && p.contact_ids.includes(cid)).map(p => p.id)
      );
    },
    visiblePackages() {
      if (this.visiblePackageIds === null) return this.packages;
      return this.packages.filter(p => this.visiblePackageIds.has(p.id));
    },
    filteredScs() {
      return this.scopeChanges.filter(sc => {
        if (this.visiblePackageIds !== null && !this.visiblePackageIds.has(sc.package_id)) return false;
        if (this.statusFilter && sc.status !== this.statusFilter) return false;
        if (this.packageFilter && sc.package_id !== this.packageFilter) return false;
        return true;
      });
    },
    canViewDashboard() {
      const role = this.currentUser && this.currentUser.role;
      return ['ADMIN', 'PROJECT_OWNER', 'PROJECT_TEAM', 'CLIENT'].includes(role);
    },
    isScReviewer() {
      if (!this.currentUser || !this.currentUser.contact_id) return false;
      const cid = this.currentUser.contact_id;
      return (this.packages || []).some(p =>
        p.pmc_commercial_reviewer_id === cid || p.client_commercial_reviewer_id === cid
      );
    },
    canSeeApprovals() {
      return this.isAdminOrOwner || this.isScReviewer;
    },

    canCreateOrder() {
      if (!this.currentUser) return false;
      const role = this.currentUser.role;
      if (role === 'VENDOR') return false;
      if (['ADMIN', 'PROJECT_OWNER', 'CLIENT'].includes(role)) return true;
      // Package owner: can create orders for their package(s)
      const cid = this.currentUser.contact_id;
      if (!cid) return false;
      return this.packages.some(p => p.package_owner_id === cid);
    },
    orderPackages() {
      if (!this.currentUser) return [];
      const role = this.currentUser.role;
      if (['ADMIN', 'PROJECT_OWNER', 'CLIENT'].includes(role)) return this.packages;
      const cid = this.currentUser.contact_id;
      if (!cid) return [];
      return this.packages.filter(p => p.package_owner_id === cid);
    },
    orderTotal() {
      return this.orderApprovedScs
        .filter(sc => this.orderSelectedIds.includes(sc.id))
        .reduce((s, sc) => s + (sc.cost || 0), 0);
    },
    orderSchedule() {
      return this.orderApprovedScs
        .filter(sc => this.orderSelectedIds.includes(sc.id))
        .reduce((s, sc) => s + (sc.schedule_impact_months || 0), 0);
    },

    dashStatusTotals() {
      // Returns { DRAFT: {cost, months}, SUBMITTED: {...}, ... } respecting
      // the package filter. When no package is selected, use the project-wide
      // by_status payload; otherwise re-aggregate from by_package.
      const statuses = ['DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED'];
      const empty = () => Object.fromEntries(statuses.map(s => [s, { cost: 0, months: 0 }]));
      if (!this.dashboard) return empty();
      if (!this.dashPkgFilter) {
        const out = empty();
        statuses.forEach(s => {
          const row = this.dashboard.by_status[s] || {};
          out[s] = { cost: row.cost || 0, months: row.months || 0 };
        });
        return out;
      }
      const pkg = (this.dashboard.by_package || []).find(p => p.package_id === this.dashPkgFilter);
      const out = empty();
      if (!pkg) return out;
      statuses.forEach(s => {
        const k = s.toLowerCase();
        out[s] = { cost: pkg[k + '_cost'] || 0, months: pkg[k + '_months'] || 0 };
      });
      return out;
    },
  },

  watch: {
    tab(val) { this.$emit('subtab-change', val); },
    selectedSc(val) {
      // Single-record View modal in scope-changes
      this.$emit('record-change', val ? { type: 'scope_change', id: val.id } : null);
    },
    dashPkgFilter() {
      if (this.tab === 'dashboard') this.$nextTick(() => this.renderScDashCharts());
    },
    dashboard() {
      if (this.tab === 'dashboard') this.$nextTick(() => this.renderScDashCharts());
    },
    // Destroy charts before Vue unmounts their canvases — a detached
    // canvas in Chart.js's registry throws on the next animation frame
    // and blanks the new charts that are about to render.
    dashLoading(v) {
      if (!v) return;
      if (this.scCostChartObj)   { try { this.scCostChartObj.destroy(); }   catch (e) {} this.scCostChartObj = null; }
      if (this.scMonthsChartObj) { try { this.scMonthsChartObj.destroy(); } catch (e) {} this.scMonthsChartObj = null; }
    },
  },

  async mounted() {
    if (this.initialTab) this.tab = this.initialTab;
    await Promise.all([this.loadScs(), this.loadPackages()]);
    this.checkPendingOpen();
  },

  // Destroy charts on unmount so they don't linger in Chart.js's global
  // registry with detached canvases and throw on later animation frames.
  beforeUnmount() {
    if (this.scCostChartObj)   { try { this.scCostChartObj.destroy(); }   catch (e) {} this.scCostChartObj = null; }
    if (this.scMonthsChartObj) { try { this.scMonthsChartObj.destroy(); } catch (e) {} this.scMonthsChartObj = null; }
  },

  methods: {
    checkPendingOpen() {
      if (!this.pendingOpen || this.pendingOpen.record_type !== 'scope_change') return;
      const sc = this.scopeChanges.find(x => x.id === this.pendingOpen.record_id);
      if (sc) this.openDetail(sc);
    },

    // ── Data loading ──────────────────────────────────────────────────────────
    async loadScs() {
      this.loading = true;
      try {
        const params = {};
        if (this.statusFilter) params.status = this.statusFilter;
        if (this.packageFilter) params.package_id = this.packageFilter;
        this.scopeChanges = await API.getScopeChanges(params);
      } catch (e) {
        console.error(e);
      } finally {
        this.loading = false;
      }
    },

    async loadPackages() {
      this.packages = await API.getPackages().catch(() => []);
    },

    async loadDashboard() {
      this.dashLoading = true;
      try {
        this.dashboard = await API.getScDashboard();
      } finally {
        this.dashLoading = false;
      }
    },

    async switchTab(t) {
      this.tab = t;
      if (t === 'dashboard') {
        await this.loadDashboard();
        this.$nextTick(() => this.renderScDashCharts());
      }
      if (t === 'approvals') await this.loadScs();
    },

    // ── Filters ───────────────────────────────────────────────────────────────
    setStatus(s) {
      this.statusFilter = this.statusFilter === s ? '' : s;
      this.loadScs();
    },
    setPackage(id) {
      this.packageFilter = this.packageFilter === id ? null : id;
      this.loadScs();
    },

    // ── Create / Edit ─────────────────────────────────────────────────────────
    openAdd() {
      this.editingSc = null;
      this.scForm = { description: '', details: '', cost: 0, schedule_impact_months: 0, package_id: null };
      this.scError = '';
      this.showForm = true;
    },

    openEdit(sc) {
      this.editingSc = sc;
      this.scForm = {
        description: sc.description || '',
        details: sc.details || '',
        cost: sc.cost || 0,
        schedule_impact_months: sc.schedule_impact_months || 0,
        package_id: sc.package_id || null,
        updated_at: sc.updated_at || null,
      };
      this.scError = '';
      this.showForm = true;
    },

    async saveSc() {
      if (!this.scForm.description.trim()) { this.scError = 'Description is required.'; return; }
      if (!this.scForm.package_id) { this.scError = 'Package is required.'; return; }
      this.savingSc = true;
      this.scError = '';
      try {
        const data = { ...this.scForm };
        if (this.editingSc) {
          await API.updateScopeChange(this.editingSc.id, data);
          this.showForm = false;
        } else {
          this.editingSc = { ...await API.createScopeChange(data), _justCreated: true };
        }
        await this.loadScs();
      } catch (e) {
        this.scError = e.status === 409
          ? 'This scope change was modified by another user. Please close and reopen to get the latest version.'
          : (e.message || 'Save failed.');
      } finally {
        this.savingSc = false;
      }
    },

    // ── Submit ────────────────────────────────────────────────────────────────
    async submitSc(sc) {
      const label = sc.status === 'DRAFT' ? 'Submit' : 'Resubmit';
      if (!confirm(`${label} SC-${String(sc.seq_id || sc.id).padStart(6,'0')} for review?`)) return;
      try {
        await API.submitScopeChange(sc.id);
        await this.loadScs();
        if (this.selectedSc && this.selectedSc.id === sc.id) {
          this.selectedSc = this.scopeChanges.find(s => s.id === sc.id) || null;
        }
      } catch (e) {
        alert(e.message || 'Submit failed.');
      }
    },

    // ── Cancel / Re-open ──────────────────────────────────────────────────────
    async cancelSc(sc) {
      if (!confirm(`Cancel SC-${String(sc.seq_id || sc.id).padStart(6,'0')}? This cannot be undone.`)) return;
      try {
        await API.cancelScopeChange(sc.id);
        await this.loadScs();
        if (this.selectedSc && this.selectedSc.id === sc.id) this.selectedSc = null;
      } catch (e) {
        alert(e.message || 'Cancel failed.');
      }
    },

    async reopenSc(sc) {
      try {
        await API.reopenScopeChange(sc.id);
        await this.loadScs();
        if (this.selectedSc && this.selectedSc.id === sc.id)
          this.selectedSc = this.scopeChanges.find(s => s.id === sc.id) || null;
      } catch (e) {
        alert(e.message || 'Re-open failed.');
      }
    },

    // ── Detail modal ──────────────────────────────────────────────────────────
    openDetail(sc) {
      this.selectedSc = sc;
      this.reviewRole = '';
      this.reviewForm = { approved: true, comment: '' };
      this.reviewError = '';
    },

    openReview(sc, role) {
      this.selectedSc = sc;
      this.reviewRole = role;
      this.reviewForm = { approved: true, comment: '' };
      this.reviewError = '';
    },

    async submitReview() {
      if (!this.reviewForm.comment.trim()) { this.reviewError = 'Comment is required.'; return; }
      this.reviewSaving = true;
      this.reviewError = '';
      try {
        const data = { approved: this.reviewForm.approved, comment: this.reviewForm.comment };
        if (this.reviewRole === 'pmc') {
          await API.pmcReviewSc(this.selectedSc.id, data);
        } else {
          await API.clientReviewSc(this.selectedSc.id, data);
        }
        await this.loadScs();
        this.selectedSc = this.scopeChanges.find(s => s.id === this.selectedSc.id) || null;
        this.reviewRole = '';
      } catch (e) {
        this.reviewError = e.message || 'Review failed.';
      } finally {
        this.reviewSaving = false;
      }
    },

    // ── Reviewer helpers ──────────────────────────────────────────────────────
    isPmcReviewer(sc) {
      return this.currentUser && this.currentUser.contact_id &&
        sc.pmc_reviewer_contact_id === this.currentUser.contact_id &&
        sc.status === 'SUBMITTED' && !sc.pmc_reviewed;
    },
    isClientReviewer(sc) {
      return this.currentUser && this.currentUser.contact_id &&
        sc.client_reviewer_contact_id === this.currentUser.contact_id &&
        sc.status === 'SUBMITTED' && !sc.client_reviewed;
    },
    isPackageMember(sc) {
      // Owner, account manager, or any contact linked to the SC's package.
      if (!this.currentUser || !this.currentUser.contact_id || !sc.package_id) return false;
      const pkg = this.packages.find(p => p.id === sc.package_id);
      if (!pkg) return false;
      const cid = this.currentUser.contact_id;
      if (pkg.package_owner_id === cid) return true;
      if (pkg.account_manager_id === cid) return true;
      return Array.isArray(pkg.contact_ids) && pkg.contact_ids.includes(cid);
    },
    canManageSc(sc) {
      if (!this.currentUser) return false;
      if (['ADMIN','PROJECT_OWNER'].includes(this.currentUser.role)) return true;
      if (sc.created_by_id === this.currentUser.id) return true;
      return this.isPackageMember(sc);
    },
    canOverrideSc(sc) {
      // Mirrors the backend gate at scope_changes.py override endpoint:
      // ADMIN / PROJECT_OWNER / Scope Changes Module Lead / Package Owner of the SC's package.
      if (this.isAdminOrOwner) return true;
      if (!sc || !this.currentUser) return false;
      const pkg = (this.packages || []).find(p => p.id === sc.package_id);
      return !!(pkg && pkg.package_owner_id && pkg.package_owner_id === this.currentUser.contact_id);
    },
    hasScRejection(sc) {
      // One reviewer has already rejected — the SC is effectively doomed,
      // so the author/package contact can fix & resubmit without waiting.
      return (sc.pmc_reviewed && sc.pmc_approved === false) ||
             (sc.client_reviewed && sc.client_approved === false);
    },
    isScEditable(sc) {
      return ['DRAFT','REJECTED'].includes(sc.status) ||
        (sc.status === 'SUBMITTED' && this.hasScRejection(sc));
    },
    canEdit(sc) {
      return this.isScEditable(sc) && this.canManageSc(sc);
    },
    canSubmit(sc) {
      return this.isScEditable(sc) && this.canManageSc(sc);
    },
    canCancel(sc) {
      return sc.status !== 'APPROVED' && sc.status !== 'CANCELLED' && this.canManageSc(sc);
    },
    canReopen(sc) {
      return sc.status === 'CANCELLED' && this.canManageSc(sc);
    },

    // ── Reviewer actions in Approvals tab ──────────────────────────────────────
    canReviewScAsPmc(sc) {
      if (sc.pmc_reviewed) return false;
      if (!this.currentUser || !this.currentUser.contact_id) return false;
      const cid = this.currentUser.contact_id;
      return sc.pmc_reviewer_contact_id === cid;
    },
    canReviewScAsClient(sc) {
      if (sc.client_reviewed) return false;
      if (!this.currentUser || !this.currentUser.contact_id) return false;
      const cid = this.currentUser.contact_id;
      return sc.client_reviewer_contact_id === cid;
    },
    reviewScFromTab(sc, role) {
      // Open the detail view and pre-select the review role
      this.openDetail(sc);
      this.$nextTick(() => { this.reviewRole = role; });
    },

    // ── Order creation ────────────────────────────────────────────────────────
    async onOrderPkgChange() {
      this.orderSelectedIds = [];
      this.orderSuccess = '';
      if (!this.orderPkgId) { this.orderApprovedScs = []; this.orderForm.vendor_name = ''; return; }
      const pkg = this.packages.find(p => p.id === this.orderPkgId);
      this.orderForm.vendor_name = (pkg && pkg.company) || '';
      try {
        const all = await API.getScopeChanges({ status: 'APPROVED', package_id: this.orderPkgId });
        this.orderApprovedScs = all.filter(sc => !sc.order_id);
        this.orderForm.amount = this.orderApprovedScs.reduce((s, sc) => s + (sc.cost || 0), 0);
      } catch { this.orderApprovedScs = []; }
    },

    toggleOrderSc(id) {
      const idx = this.orderSelectedIds.indexOf(id);
      if (idx === -1) this.orderSelectedIds.push(id);
      else this.orderSelectedIds.splice(idx, 1);
      this.orderForm.amount = this.orderApprovedScs
        .filter(sc => this.orderSelectedIds.includes(sc.id))
        .reduce((s, sc) => s + (sc.cost || 0), 0);
    },

    async submitOrder() {
      if (!this.orderSelectedIds.length) { this.orderError = 'Select at least one scope change.'; return; }
      if (!this.orderForm.po_number.trim()) { this.orderError = 'PO number is required.'; return; }
      this.orderSaving = true;
      this.orderError = '';
      this.orderSuccess = '';
      try {
        const res = await API.createOrderFromScs({
          package_id: this.orderPkgId,
          scope_change_ids: this.orderSelectedIds,
          po_number: this.orderForm.po_number,
          vendor_name: this.orderForm.vendor_name,
          order_date: this.orderForm.order_date,
          amount: this.orderForm.amount,
          currency: this.projectCurrency,
        });
        this.orderSuccess = `Order created (ID: ${res.order_id}) for ${res.count} scope change(s).`;
        this.orderSelectedIds = [];
        this.orderForm = { po_number: '', vendor_name: '', order_date: '', amount: 0, currency: this.projectCurrency };
        await this.onOrderPkgChange();
        await this.loadScs();
      } catch (e) {
        this.orderError = e.message || 'Order creation failed.';
      } finally {
        this.orderSaving = false;
      }
    },

    // ── Override (admin/owner) ────────────────────────────────────────────────
    openOverride(sc, approved) {
      this.overrideSc = sc;
      this.overrideApproved = approved;
      this.overrideComment = '';
      this.overrideError = '';
      this.showOverrideModal = true;
    },

    async submitOverride() {
      this.overrideSaving = true;
      this.overrideError = '';
      try {
        await API.overrideSc(this.overrideSc.id, { approved: this.overrideApproved, comment: this.overrideComment });
        await this.loadScs();
        this.showOverrideModal = false;
        this.overrideSc = null;
      } catch (e) {
        this.overrideError = e.message || 'Override failed.';
      } finally {
        this.overrideSaving = false;
      }
    },

    // ── Review history ────────────────────────────────────────────────────────
    async openHistory(sc) {
      this.historySc = sc;
      this.historyEntries = [];
      this.historyError = '';
      this.historyLoading = true;
      try {
        this.historyEntries = await API.getScHistory(sc.id);
      } catch (e) {
        this.historyError = e.message || 'Failed to load history.';
      } finally {
        this.historyLoading = false;
      }
    },

    historyEventLabel(entry) {
      if (entry.event === 'SUBMIT') return 'Submitted for review';
      if (entry.event === 'OVERRIDE') return 'Override — ' + (entry.approved ? 'Approved' : 'Rejected');
      const who = entry.event === 'PMC' ? 'PMC Commercial' : 'Client Commercial';
      return who + (entry.approved ? ' — Approved' : ' — Rejected');
    },

    historyEventClass(entry) {
      if (entry.event === 'SUBMIT') return 'bg-blue-100 text-blue-700';
      if (entry.approved === true) return 'bg-green-100 text-green-700';
      if (entry.approved === false) return 'bg-red-100 text-red-700';
      return 'bg-gray-100 text-gray-600';
    },

    tabClass(t) {
      return ['px-4 py-1.5 rounded text-sm font-medium transition-all', this.tab === t ? 'bg-white shadow text-ips-blue' : 'text-gray-500 hover:text-gray-700'];
    },

    // ── Display helpers ───────────────────────────────────────────────────────
    statusBadge(status) {
      const m = {
        DRAFT: 'bg-gray-100 text-gray-600',
        SUBMITTED: 'bg-blue-100 text-blue-700',
        APPROVED: 'bg-green-100 text-green-700',
        REJECTED: 'bg-red-100 text-red-700',
        CANCELLED: 'bg-gray-100 text-gray-400',
      };
      return m[status] || 'bg-gray-100 text-gray-500';
    },
    fmtCost(v) {
      if (!v && v !== 0) return '—';
      return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
    },
    fmtDate(d) {
      if (!d) return '—';
      return d.slice(0, 10);
    },
    fmtDateTime(d) {
      if (!d) return '—';
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toLocaleString([], {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
        timeZone: (window.AppSettings && window.AppSettings.timezone) || undefined,
      });
    },

    renderScDashCharts() {
      if (typeof Chart === 'undefined') return;
      const statuses = [
        { key: 'DRAFT',     label: 'Draft',        color: '#6B7280' },
        { key: 'SUBMITTED', label: 'Under Review', color: '#3B82F6' },
        { key: 'APPROVED',  label: 'Approved',     color: '#10B981' },
        { key: 'REJECTED',  label: 'Rejected',     color: '#EF4444' },
        { key: 'CANCELLED', label: 'Cancelled',    color: '#9CA3AF' },
      ];
      const totals = this.dashStatusTotals;
      const labels = statuses.map(s => s.label);
      const colors = statuses.map(s => s.color);
      const costData   = statuses.map(s => totals[s.key].cost   || 0);
      const monthsData = statuses.map(s => totals[s.key].months || 0);

      const fmtK = v => {
        if (!v && v !== 0) return '';
        if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (Math.abs(v) >= 1000)    return (v / 1000).toFixed(0) + 'K';
        return String(Math.round(v));
      };

      // ChartDataLabels ships via CDN; if it is slow to load (or blocked),
      // the global is undefined and `plugins: [undefined]` makes Chart.js
      // throw on construction and blanks the canvas. Fall back silently
      // when the plugin isn't available.
      const dataLabelsPlugin = (typeof ChartDataLabels !== 'undefined')
        ? [ChartDataLabels] : [];

      const buildConfig = (data, valueFmt, axisFmt) => ({
        type: 'bar',
        plugins: dataLabelsPlugin,
        data: {
          labels,
          datasets: [{ data, backgroundColor: colors, borderRadius: 4 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => valueFmt(ctx.raw),
              },
            },
            datalabels: {
              anchor: 'end',
              align: 'end',
              clamp: true,
              color: '#374151',
              font: { size: 11, weight: '600' },
              formatter: v => v ? valueFmt(v) : '',
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { beginAtZero: true, ticks: { callback: axisFmt, font: { size: 10 } }, grid: { color: '#F3F4F6' } },
          },
          layout: { padding: { top: 20 } },
        },
      });

      const currency = (window.AppSettings && window.AppSettings.currency) || 'EUR';
      const costCanvas = this.$refs.scCostChart;
      const monthsCanvas = this.$refs.scMonthsChart;

      // Destroy defensively: when the user leaves and re-enters the tab
      // the old chart objects reference now-detached canvases, and
      // destroy() can throw — which would swallow the rest of the render.
      const safeDestroy = obj => { try { obj && obj.destroy(); } catch (e) { /* ignore */ } };
      safeDestroy(this.scCostChartObj);   this.scCostChartObj = null;
      safeDestroy(this.scMonthsChartObj); this.scMonthsChartObj = null;

      if (costCanvas) {
        try {
          this.scCostChartObj = new Chart(
            costCanvas,
            buildConfig(costData, v => fmtK(v) + ' ' + currency, v => fmtK(v)),
          );
        } catch (e) { console.error('scCostChart render failed', e); }
      }
      if (monthsCanvas) {
        try {
          this.scMonthsChartObj = new Chart(
            monthsCanvas,
            buildConfig(monthsData, v => (v || 0).toFixed(1) + ' mo', v => v),
          );
        } catch (e) { console.error('scMonthsChart render failed', e); }
      }
    },
    reviewerStatus(reviewed, approved) {
      if (!reviewed) return { cls: 'bg-yellow-50 text-yellow-600', label: 'Pending' };
      return approved
        ? { cls: 'bg-green-50 text-green-700', label: 'Approved' }
        : { cls: 'bg-red-50 text-red-700', label: 'Rejected' };
    },

    async exportExcel() {
      this.exporting = true;
      try {
        const params = new URLSearchParams();
        if (this.statusFilter)  params.set('status', this.statusFilter);
        if (this.packageFilter) params.set('package_id', this.packageFilter);
        const qs = params.toString() ? '?' + params.toString() : '';
        const date = new Date().toISOString().split('T')[0];
        await API.download(`/api/scope-changes/export/excel${qs}`, `scope_changes_${date}.xlsx`);
      } catch (e) {
        alert('Export failed: ' + e.message);
      } finally {
        this.exporting = false;
      }
    },
  },

  template: `
<div>
  <!-- Tab bar -->
  <div class="sub-tab-bar">
    <button @click="switchTab('list')" :class="['sub-tab', tab==='list' ? 'active' : '']">Scope Changes</button>
    <button v-if="canViewDashboard" @click="switchTab('dashboard')" :class="['sub-tab', tab==='dashboard' ? 'active' : '']">Dashboard</button>
    <button v-if="canCreateOrder" @click="switchTab('order')" :class="['sub-tab', tab==='order' ? 'active' : '']">Create Order</button>
    <button v-if="canSeeApprovals" @click="switchTab('approvals')" :class="['sub-tab', tab==='approvals' ? 'active' : '']">
      Approvals
      <span v-if="pendingScApprovals.length > 0" class="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{{ pendingScApprovals.length }}</span>
    </button>
  </div>

  <!-- ══ LIST TAB ══ -->
  <div v-if="tab==='list'" class="content-area">

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <div class="flex gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
        <button v-for="s in ['DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED']" :key="s"
          @click="setStatus(s)"
          :class="['px-3 py-1 rounded text-xs font-medium transition-all',
            statusFilter===s ? statusBadge(s)+' shadow-sm' : 'text-gray-500 hover:text-gray-700']">
          {{ s }}
        </button>
      </div>
      <select v-model="packageFilter" @change="loadScs" class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
        <option :value="null">All packages</option>
        <option v-for="p in visiblePackages" :key="p.id" :value="p.id">{{ p.tag_number }} {{ p.name }}</option>
      </select>
      <button @click="exportExcel" :disabled="exporting" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50 ml-auto">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
        </svg>
        {{ exporting ? 'Exporting...' : 'Export Excel' }}
      </button>
      <button @click="openAdd" class="btn-primary">
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        New Scope Change
      </button>
    </div>

    <!-- Table -->
    <div v-if="loading" class="text-center py-10 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="filteredScs.length===0" class="card text-center py-10 text-gray-400">No scope changes found.</div>
    <div v-else class="card p-0 overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-gray-50 border-b border-gray-200">
            <th class="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">ID</th>
            <th class="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">Description</th>
            <th class="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">Package</th>
            <th class="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">Cost</th>
            <th class="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">Months</th>
            <th class="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">Approvals</th>
            <th class="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">Status</th>
            <th class="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">By</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="sc in filteredScs" :key="sc.id"
            class="hover:bg-gray-50 cursor-pointer"
            @click="openDetail(sc)">
            <td class="px-4 py-3 text-gray-400 font-mono text-xs">SC-{{ String(sc.seq_id || sc.id).padStart(6,'0') }}</td>
            <td class="px-4 py-3">
              <p class="font-medium text-gray-800 truncate max-w-xs" :title="sc.details || ''">{{ sc.description }}</p>
              <p v-if="sc.order_id" class="text-xs text-green-600">Ordered (PO linked)</p>
            </td>
            <td class="px-4 py-3">
              <span v-if="sc.package_tag" class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ sc.package_tag }}</span>
              <span v-else class="text-gray-400 text-xs">—</span>
            </td>
            <td class="px-4 py-3 text-gray-700 font-medium">{{ fmtCost(sc.cost) }}</td>
            <td class="px-4 py-3 text-gray-600">{{ sc.schedule_impact_months || 0 }}</td>
            <td class="px-4 py-3">
              <div class="space-y-1">
                <div class="flex items-center gap-1.5 text-xs">
                  <svg v-if="sc.pmc_reviewed && sc.pmc_approved" class="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  <svg v-else-if="sc.pmc_reviewed" class="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                  <svg v-else class="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                  <span :class="sc.pmc_reviewed && sc.pmc_approved ? 'text-green-700' : (sc.pmc_reviewed ? 'text-red-600' : 'text-gray-400')">
                    PMC: {{ sc.pmc_reviewer_name || '—' }}
                  </span>
                </div>
                <div class="flex items-center gap-1.5 text-xs">
                  <svg v-if="sc.client_reviewed && sc.client_approved" class="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  <svg v-else-if="sc.client_reviewed" class="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                  <svg v-else class="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                  <span :class="sc.client_reviewed && sc.client_approved ? 'text-green-700' : (sc.client_reviewed ? 'text-red-600' : 'text-gray-400')">
                    Client: {{ sc.client_reviewer_name || '—' }}
                  </span>
                </div>
              </div>
            </td>
            <td class="px-4 py-3">
              <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', statusBadge(sc.status)]">{{ sc.status }}</span>
            </td>
            <td class="px-4 py-3 text-gray-500 text-xs truncate max-w-[120px]">{{ sc.created_by_name || '—' }}</td>
            <td class="px-4 py-3 text-right" @click.stop>
              <div class="flex items-center gap-1 justify-end">
                <button v-if="isPmcReviewer(sc)" @click="openReview(sc,'pmc')"
                  class="px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded hover:bg-blue-200">PMC Review</button>
                <button v-if="isClientReviewer(sc)" @click="openReview(sc,'client')"
                  class="px-2 py-1 text-xs font-semibold bg-purple-100 text-purple-700 rounded hover:bg-purple-200">Client Review</button>
                <button v-if="canEdit(sc)" @click="openEdit(sc)"
                  class="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded hover:bg-gray-200">Edit</button>
                <button v-if="canSubmit(sc)" @click="submitSc(sc)"
                  class="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200">{{ sc.status === 'DRAFT' ? 'Submit' : 'Resubmit' }}</button>
                <button v-if="canCancel(sc)" @click="cancelSc(sc)"
                  class="p-1 text-red-300 hover:text-red-500">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Create/Edit Modal ── -->
    <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
      <div class="modal-box modal-xl">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">{{ editingSc ? 'Edit Scope Change' : 'New Scope Change' }}</h3>
          <button @click="showForm=false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body" style="padding:0;display:flex;overflow:hidden">
          <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
            <div class="space-y-3">
              <div>
                <label class="form-label">Package *</label>
                <select v-model="scForm.package_id" class="input-field">
                  <option :value="null">— Select package —</option>
                  <option v-for="p in visiblePackages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
                </select>
              </div>
              <div>
                <label class="form-label">Description *</label>
                <input v-model="scForm.description" class="input-field" placeholder="Brief description of the scope change"/>
              </div>
              <div>
                <label class="form-label">Details</label>
                <textarea v-model="scForm.details" class="input-field" rows="3" placeholder="Detailed explanation..."></textarea>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="form-label">Cost Impact (EUR)</label>
                  <input v-model.number="scForm.cost" type="number" step="1000" class="input-field" placeholder="0"/>
                </div>
                <div>
                  <label class="form-label">Schedule Impact (months)</label>
                  <input v-model.number="scForm.schedule_impact_months" type="number" step="0.5" class="input-field" placeholder="0"/>
                </div>
              </div>
              <p v-if="scError" class="text-red-500 text-sm">{{ scError }}</p>
            </div>
          </div>
          <div class="w-[28rem] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
            <file-attachments record-type="scope_change" :record-id="editingSc ? editingSc.id : null" :can-edit="true"></file-attachments>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="showForm=false" class="btn-secondary">Cancel</button>
          <button v-if="!editingSc" @click="saveSc" :disabled="savingSc" class="btn-primary">{{ savingSc ? 'Saving...' : 'Save' }}</button>
          <button v-else-if="editingSc._justCreated" @click="showForm=false" class="btn-primary">Create Scope Change</button>
          <button v-else @click="saveSc" :disabled="savingSc" class="btn-primary">{{ savingSc ? 'Saving...' : 'Save Changes' }}</button>
        </div>
      </div>
    </div>

  </div>

  <!-- ══ APPROVALS TAB ══ -->
  <div v-if="tab==='approvals' && canSeeApprovals" class="content-area">
    <div class="flex items-center justify-between mb-4">
      <p class="text-sm text-gray-500">Scope changes awaiting approval</p>
      <button @click="loadScs" class="btn-secondary text-sm">Refresh</button>
    </div>
    <div v-if="pendingScApprovals.length === 0" class="card text-center py-10 text-gray-400">No scope changes currently awaiting approval.</div>
    <div v-else class="space-y-4">
      <div v-for="sc in pendingScApprovals" :key="sc.id" class="card p-0 overflow-hidden">
        <!-- Header -->
        <div class="flex items-center gap-3 px-4 py-3 bg-blue-50 border-b border-blue-100 flex-wrap">
          <span class="font-mono text-xs font-bold text-gray-700">SC-{{ String(sc.seq_id || sc.id).padStart(6,'0') }}</span>
          <span class="font-semibold text-gray-800 truncate flex-1">{{ sc.description }}</span>
          <span class="text-xs text-gray-500">{{ sc.package_tag }} {{ sc.package_name }}</span>
          <span class="text-xs font-semibold text-blue-700">{{ fmtCost(sc.cost) }} EUR</span>
          <span class="text-xs text-gray-500">{{ sc.schedule_impact_months || 0 }} months</span>
          <button @click="openHistory(sc)" class="ml-2 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600" title="Review history">History</button>
          <button @click="openDetail(sc)" class="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600">Open</button>
        </div>
        <!-- Reviewer rows -->
        <div class="divide-y divide-gray-100">
          <!-- PMC row -->
          <div class="flex items-center gap-3 px-4 py-3 flex-wrap">
            <div class="w-32 shrink-0">
              <p class="text-xs font-semibold text-gray-500">PMC Commercial</p>
              <p class="text-xs text-gray-700">{{ sc.pmc_reviewer_name || 'Not assigned' }}</p>
            </div>
            <div class="flex-1 flex items-center gap-2 flex-wrap">
              <span v-if="!sc.pmc_reviewed" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>
              <span v-else-if="sc.pmc_approved" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Approved</span>
              <span v-else class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Rejected</span>
              <span v-if="sc.pmc_comment" class="text-xs text-gray-500 italic">{{ sc.pmc_comment }}</span>
            </div>
            <div v-if="canReviewScAsPmc(sc)" class="shrink-0">
              <button @click="reviewScFromTab(sc, 'pmc')" class="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Submit Review</button>
            </div>
          </div>
          <!-- Client row -->
          <div class="flex items-center gap-3 px-4 py-3 flex-wrap">
            <div class="w-32 shrink-0">
              <p class="text-xs font-semibold text-gray-500">Client Commercial</p>
              <p class="text-xs text-gray-700">{{ sc.client_reviewer_name || 'Not assigned' }}</p>
            </div>
            <div class="flex-1 flex items-center gap-2 flex-wrap">
              <span v-if="!sc.client_reviewed" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>
              <span v-else-if="sc.client_approved" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Approved</span>
              <span v-else class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Rejected</span>
              <span v-if="sc.client_comment" class="text-xs text-gray-500 italic">{{ sc.client_comment }}</span>
            </div>
            <div v-if="canReviewScAsClient(sc)" class="shrink-0">
              <button @click="reviewScFromTab(sc, 'client')" class="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Submit Review</button>
            </div>
          </div>
          <!-- Override row (admin / project owner / scope changes lead / package owner) -->
          <div v-if="canOverrideSc(sc)" class="flex items-center gap-2 px-4 py-2 bg-gray-50 flex-wrap">
            <span class="text-xs text-gray-400 mr-2">Override:</span>
            <button @click="openOverride(sc, true)"
              class="px-3 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded hover:bg-green-200">Approve</button>
            <button @click="openOverride(sc, false)"
              class="px-3 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded hover:bg-red-200">Reject</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Override confirmation modal -->
  <div v-if="showOverrideModal" class="modal-overlay" @click.self="showOverrideModal=false">
    <div class="modal-box" style="max-width:480px">
      <div class="modal-header">
        <h3 class="text-lg font-semibold text-gray-800">
          {{ overrideApproved ? 'Approve' : 'Reject' }} SC-{{ overrideSc ? String(overrideSc.id).padStart(6,'0') : '' }}
        </h3>
        <button @click="showOverrideModal=false" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body space-y-3">
        <p class="text-sm text-gray-600">Override all reviewer decisions. This will set the scope change to <strong>{{ overrideApproved ? 'APPROVED' : 'REJECTED' }}</strong>.</p>
        <div>
          <label class="form-label">Comment (optional)</label>
          <textarea v-model="overrideComment" class="input-field" rows="3" placeholder="Reason for override..."></textarea>
        </div>
        <p v-if="overrideError" class="text-red-500 text-sm">{{ overrideError }}</p>
      </div>
      <div class="modal-footer">
        <button @click="showOverrideModal=false" class="btn-secondary">Cancel</button>
        <button @click="submitOverride" :disabled="overrideSaving"
          :class="['px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 text-white', overrideApproved ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700']">
          {{ overrideSaving ? 'Saving...' : (overrideApproved ? 'Confirm Approve' : 'Confirm Reject') }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Review History Modal ── -->
  <div v-if="historySc" class="modal-overlay" @click.self="historySc=null" style="z-index:120">
    <div class="modal-box" style="max-width:560px">
      <div class="modal-header">
        <div>
          <p class="text-xs font-mono text-gray-400">SC-{{ String(historySc.seq_id || historySc.id).padStart(6,'0') }}</p>
          <h3 class="text-lg font-semibold text-gray-800">Review History</h3>
        </div>
        <button @click="historySc=null" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <div v-if="historyLoading" class="text-center py-6 text-gray-400">
          <img src="/static/assets/impulse-loader.svg" class="h-6 mx-auto" alt="Loading"/>
        </div>
        <div v-else-if="historyError" class="text-red-500 text-sm">{{ historyError }}</div>
        <div v-else-if="historyEntries.length === 0" class="text-center py-6 text-gray-400 text-sm">No review events recorded yet.</div>
        <ol v-else class="relative border-l-2 border-gray-200 ml-3 space-y-4 pl-5">
          <li v-for="entry in historyEntries" :key="entry.id" class="relative">
            <span class="absolute -left-[29px] top-1 w-3 h-3 rounded-full border-2 border-white"
              :class="entry.approved === true ? 'bg-green-500' : (entry.approved === false ? 'bg-red-500' : 'bg-blue-500')"></span>
            <div class="flex items-center gap-2 flex-wrap">
              <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', historyEventClass(entry)]">
                {{ historyEventLabel(entry) }}
              </span>
              <span class="text-xs text-gray-500">{{ fmtDateTime(entry.created_at) }}</span>
            </div>
            <p class="text-xs text-gray-600 mt-1">by <span class="font-medium">{{ entry.actor_name || '—' }}</span></p>
            <p v-if="entry.comment" class="text-sm text-gray-700 italic mt-1 bg-gray-50 rounded p-2 whitespace-pre-line">{{ entry.comment }}</p>
          </li>
        </ol>
      </div>
      <div class="modal-footer">
        <button @click="historySc=null" class="btn-secondary">Close</button>
      </div>
    </div>
  </div>

  <!-- ══ DASHBOARD TAB ══ -->
  <div v-if="tab==='dashboard' && canViewDashboard" class="content-area">
    <div class="flex justify-end mb-3">
      <button @click="loadDashboard" :disabled="dashLoading" class="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-50">
        <svg :class="['w-3.5 h-3.5', dashLoading ? 'animate-spin' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        {{ dashLoading ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>
    <div v-if="dashLoading" class="text-center py-10 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="!dashboard" class="text-center py-10 text-gray-400">No data yet.</div>
    <div v-else>
      <!-- Filters + status charts -->
      <div class="card mb-6 py-4">
        <div class="flex flex-wrap items-center gap-4 mb-4">
          <div>
            <label class="form-label mb-1">Package</label>
            <select v-model="dashPkgFilter" class="input-field w-64">
              <option value="">All packages</option>
              <option v-for="p in (dashboard.by_package || [])" :key="p.package_id" :value="p.package_id">
                {{ p.package_tag }} — {{ p.package_name || '' }}
              </option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 class="font-semibold text-gray-700 text-sm mb-2">Cost per status</h4>
            <div style="position:relative;height:260px">
              <canvas ref="scCostChart"></canvas>
            </div>
          </div>
          <div>
            <h4 class="font-semibold text-gray-700 text-sm mb-2">Schedule impact per status (months)</h4>
            <div style="position:relative;height:260px">
              <canvas ref="scMonthsChart"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- By package table -->
      <div class="card p-0 overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-100">
          <h3 class="font-semibold text-gray-800">By Package</h3>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th class="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase">Package</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500 text-xs uppercase">Draft</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500 text-xs uppercase">Under Review</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500 text-xs uppercase">Approved</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500 text-xs uppercase">Rejected</th>
              <th class="text-center px-3 py-3 font-medium text-gray-500 text-xs uppercase">Cancelled</th>
              <th class="text-center px-3 py-3 font-medium text-teal-600 text-xs uppercase">Ordered</th>
              <th class="text-center px-3 py-3 font-medium text-amber-600 text-xs uppercase">To Be Ordered</th>
            </tr>
            <tr class="bg-gray-50 border-b border-gray-100 text-xs text-gray-400">
              <th></th>
              <th class="px-3 pb-2 text-center font-normal">count · EUR · mo</th>
              <th class="px-3 pb-2 text-center font-normal">count · EUR · mo</th>
              <th class="px-3 pb-2 text-center font-normal">count · EUR · mo</th>
              <th class="px-3 pb-2 text-center font-normal">count · EUR · mo</th>
              <th class="px-3 pb-2 text-center font-normal">count · EUR · mo</th>
              <th class="px-3 pb-2 text-center font-normal">count · EUR · mo</th>
              <th class="px-3 pb-2 text-center font-normal">count · EUR · mo</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="dashboard.by_package.length===0">
              <td colspan="8" class="px-4 py-8 text-center text-gray-400">No scope changes yet.</td>
            </tr>
            <tr v-for="row in dashboard.by_package" :key="row.package_id" class="hover:bg-gray-50">
              <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded text-xs font-bold text-white mr-1" style="background:#1B4F8C">{{ row.package_tag }}</span>
                <span class="text-gray-600 text-xs">{{ row.package_name }}</span>
              </td>
              <td class="px-3 py-3 text-center">
                <p class="text-gray-500">{{ row.draft }}</p>
                <p class="text-xs text-gray-400">{{ fmtCost(row.draft_cost) }}</p>
                <p class="text-xs text-gray-300">{{ row.draft_months.toFixed(1) }} mo</p>
              </td>
              <td class="px-3 py-3 text-center">
                <p class="text-blue-600 font-medium">{{ row.submitted }}</p>
                <p class="text-xs text-blue-400">{{ fmtCost(row.submitted_cost) }}</p>
                <p class="text-xs text-blue-300">{{ row.submitted_months.toFixed(1) }} mo</p>
              </td>
              <td class="px-3 py-3 text-center">
                <p class="text-green-600 font-medium">{{ row.approved }}</p>
                <p class="text-xs text-green-500">{{ fmtCost(row.approved_cost) }}</p>
                <p class="text-xs text-green-400">{{ row.approved_months.toFixed(1) }} mo</p>
              </td>
              <td class="px-3 py-3 text-center">
                <p class="text-red-500">{{ row.rejected }}</p>
                <p class="text-xs text-red-400">{{ fmtCost(row.rejected_cost) }}</p>
                <p class="text-xs text-red-300">{{ row.rejected_months.toFixed(1) }} mo</p>
              </td>
              <td class="px-3 py-3 text-center">
                <p class="text-gray-400">{{ row.cancelled }}</p>
                <p class="text-xs text-gray-300">{{ fmtCost(row.cancelled_cost) }}</p>
                <p class="text-xs text-gray-200">{{ row.cancelled_months.toFixed(1) }} mo</p>
              </td>
              <td class="px-3 py-3 text-center">
                <p class="text-teal-600 font-medium">{{ row.ordered }}</p>
                <p class="text-xs text-teal-500">{{ fmtCost(row.ordered_cost) }}</p>
                <p class="text-xs text-teal-400">{{ row.ordered_months.toFixed(1) }} mo</p>
              </td>
              <td class="px-3 py-3 text-center">
                <p class="text-amber-600 font-medium">{{ row.to_be_ordered }}</p>
                <p class="text-xs text-amber-500">{{ fmtCost(row.to_be_ordered_cost) }}</p>
                <p class="text-xs text-amber-400">{{ row.to_be_ordered_months.toFixed(1) }} mo</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Top 10 non-approved -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">

        <!-- Top 10 by Cost -->
        <div class="card p-0 overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100">
            <h3 class="font-semibold text-gray-800">Top 10 — Highest Cost Impact</h3>
            <p class="text-xs text-gray-400 mt-0.5">Not yet approved (Draft · Under Review · Rejected)</p>
          </div>
          <div v-if="dashboard.top10_cost.length === 0" class="px-4 py-6 text-center text-gray-400 text-sm">No pending scope changes.</div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase">
                <th class="text-left px-4 py-2">Description</th>
                <th class="text-left px-3 py-2">Pkg</th>
                <th class="text-left px-3 py-2">Status</th>
                <th class="text-right px-4 py-2">Cost (EUR)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="sc in dashboard.top10_cost" :key="sc.id" class="hover:bg-gray-50 cursor-pointer" @click="openDetail(scopeChanges.find(s=>s.id===sc.id) || sc)">
                <td class="px-4 py-2.5">
                  <p class="font-medium text-gray-800 truncate max-w-[180px]" :title="sc.description">{{ sc.description }}</p>
                  <p class="text-xs font-mono text-gray-400">SC-{{ String(sc.seq_id || sc.id).padStart(6,'0') }}</p>
                </td>
                <td class="px-3 py-2.5">
                  <span class="px-1.5 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ sc.package_tag }}</span>
                </td>
                <td class="px-3 py-2.5">
                  <span :class="['text-xs font-semibold px-1.5 py-0.5 rounded-full', statusBadge(sc.status)]">{{ sc.status }}</span>
                </td>
                <td class="px-4 py-2.5 text-right font-semibold text-gray-800">{{ fmtCost(sc.cost) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Top 10 by Schedule Impact -->
        <div class="card p-0 overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100">
            <h3 class="font-semibold text-gray-800">Top 10 — Highest Schedule Impact</h3>
            <p class="text-xs text-gray-400 mt-0.5">Not yet approved (Draft · Under Review · Rejected)</p>
          </div>
          <div v-if="dashboard.top10_months.length === 0" class="px-4 py-6 text-center text-gray-400 text-sm">No pending scope changes.</div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase">
                <th class="text-left px-4 py-2">Description</th>
                <th class="text-left px-3 py-2">Pkg</th>
                <th class="text-left px-3 py-2">Status</th>
                <th class="text-right px-4 py-2">Months</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              <tr v-for="sc in dashboard.top10_months" :key="sc.id" class="hover:bg-gray-50 cursor-pointer" @click="openDetail(scopeChanges.find(s=>s.id===sc.id) || sc)">
                <td class="px-4 py-2.5">
                  <p class="font-medium text-gray-800 truncate max-w-[180px]" :title="sc.description">{{ sc.description }}</p>
                  <p class="text-xs font-mono text-gray-400">SC-{{ String(sc.seq_id || sc.id).padStart(6,'0') }}</p>
                </td>
                <td class="px-3 py-2.5">
                  <span class="px-1.5 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ sc.package_tag }}</span>
                </td>
                <td class="px-3 py-2.5">
                  <span :class="['text-xs font-semibold px-1.5 py-0.5 rounded-full', statusBadge(sc.status)]">{{ sc.status }}</span>
                </td>
                <td class="px-4 py-2.5 text-right font-semibold text-gray-800">{{ sc.schedule_impact_months.toFixed(1) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  </div>

  <!-- ══ CREATE ORDER TAB ══ -->
  <div v-if="tab==='order' && canCreateOrder" class="content-area">
    <div class="card max-w-3xl mx-auto">
      <h2 class="text-lg font-semibold text-gray-800 mb-4">Create Budget Order from Approved Scope Changes</h2>

      <!-- Package selector -->
      <div class="mb-4">
        <label class="form-label">Select Package</label>
        <select v-model="orderPkgId" @change="onOrderPkgChange" class="input-field">
          <option :value="null">— Select a package —</option>
          <option v-for="p in orderPackages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
        </select>
      </div>

      <!-- Approved SCs for this package -->
      <div v-if="orderPkgId && orderApprovedScs.length===0" class="text-gray-400 text-sm mb-4">
        No approved, unordered scope changes for this package.
      </div>
      <div v-if="orderApprovedScs.length > 0" class="mb-4">
        <label class="form-label">Select Scope Changes to Include</label>
        <div class="border border-gray-200 rounded-lg overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-100">
                <th class="w-8 px-3 py-2"></th>
                <th class="text-left px-3 py-2 font-medium text-gray-500 text-xs uppercase">ID</th>
                <th class="text-left px-3 py-2 font-medium text-gray-500 text-xs uppercase">Description</th>
                <th class="text-right px-3 py-2 font-medium text-gray-500 text-xs uppercase">Cost (EUR)</th>
                <th class="text-right px-3 py-2 font-medium text-gray-500 text-xs uppercase">Months</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="sc in orderApprovedScs" :key="sc.id"
                class="hover:bg-gray-50 cursor-pointer"
                @click="toggleOrderSc(sc.id)">
                <td class="px-3 py-2">
                  <input type="checkbox" :checked="orderSelectedIds.includes(sc.id)"
                    @click.stop="toggleOrderSc(sc.id)"
                    class="w-4 h-4" style="accent-color:#00AEEF"/>
                </td>
                <td class="px-3 py-2 font-mono text-xs text-gray-400">SC-{{ String(sc.seq_id || sc.id).padStart(6,'0') }}</td>
                <td class="px-3 py-2 text-gray-700">{{ sc.description }}</td>
                <td class="px-3 py-2 text-right font-medium text-gray-800">{{ fmtCost(sc.cost) }}</td>
                <td class="px-3 py-2 text-right text-gray-600">{{ sc.schedule_impact_months || 0 }}</td>
              </tr>
            </tbody>
            <tfoot v-if="orderSelectedIds.length > 0">
              <tr class="bg-gray-50 border-t border-gray-200 font-semibold">
                <td colspan="3" class="px-3 py-2 text-sm text-gray-600">{{ orderSelectedIds.length }} selected</td>
                <td class="px-3 py-2 text-right text-gray-800">{{ fmtCost(orderTotal) }}</td>
                <td class="px-3 py-2 text-right text-gray-600">{{ orderSchedule.toFixed(1) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Order fields -->
      <div v-if="orderSelectedIds.length > 0" class="space-y-3 border-t pt-4">
        <h3 class="font-medium text-gray-700">Order Details</h3>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">PO Number *</label>
            <input v-model="orderForm.po_number" class="input-field" placeholder="PO-2024-001"/>
          </div>
          <div>
            <label class="form-label">Vendor Name</label>
            <input :value="orderForm.vendor_name" class="input-field bg-gray-50" readonly/>
          </div>
          <div>
            <label class="form-label">Order Date</label>
            <input v-model="orderForm.order_date" type="date" class="input-field"/>
          </div>
          <div>
            <label class="form-label">Currency</label>
            <input :value="projectCurrency" class="input-field bg-gray-50" readonly/>
          </div>
          <div class="col-span-2">
            <label class="form-label">Amount ({{ orderForm.currency }}) — calculated from selected scope changes</label>
            <input :value="orderForm.amount" type="number" class="input-field bg-gray-50" readonly/>
          </div>
        </div>

        <p v-if="orderError" class="text-red-500 text-sm">{{ orderError }}</p>
        <p v-if="orderSuccess" class="text-green-600 text-sm font-medium">{{ orderSuccess }}</p>

        <div class="flex justify-end">
          <button @click="submitOrder" :disabled="orderSaving" class="btn-primary">
            {{ orderSaving ? 'Creating...' : 'Create Order' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Detail / Review Modal (available from any tab) ── -->
  <div v-if="selectedSc" class="modal-overlay" @click.self="selectedSc=null">
    <div class="modal-box modal-xl">
      <div class="modal-header">
        <div>
          <p class="text-xs font-mono text-gray-400">SC-{{ String(selectedSc.seq_id || selectedSc.id).padStart(6,'0') }}</p>
          <h3 class="text-lg font-semibold text-gray-800">{{ selectedSc.description }}</h3>
        </div>
        <div class="flex items-center gap-2">
          <span :class="['text-xs font-semibold px-2 py-1 rounded-full', statusBadge(selectedSc.status)]">{{ selectedSc.status }}</span>
          <button @click="openHistory(selectedSc)"
            class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded"
            title="Show review history">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            History
          </button>
          <button @click="selectedSc=null" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="modal-body" style="padding:0;display:flex;overflow:hidden">
        <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
          <div class="space-y-4">

            <!-- Info grid -->
            <div class="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-4 text-sm">
              <div><span class="text-gray-500">Package:</span>
                <span class="ml-1 font-medium">{{ selectedSc.package_tag || '—' }} {{ selectedSc.package_name || '' }}</span>
              </div>
              <div><span class="text-gray-500">Created by:</span>
                <span class="ml-1 font-medium">{{ selectedSc.created_by_name || '—' }}</span>
              </div>
              <div><span class="text-gray-500">Cost impact:</span>
                <span class="ml-1 font-semibold text-gray-800">{{ fmtCost(selectedSc.cost) }} EUR</span>
              </div>
              <div><span class="text-gray-500">Schedule impact:</span>
                <span class="ml-1 font-medium">{{ selectedSc.schedule_impact_months || 0 }} months</span>
              </div>
              <div v-if="selectedSc.submitted_at"><span class="text-gray-500">Submitted:</span>
                <span class="ml-1">{{ fmtDateTime(selectedSc.submitted_at) }}</span>
              </div>
              <div v-if="selectedSc.order_id"><span class="text-gray-500">Order ID:</span>
                <span class="ml-1 font-medium text-green-700">#{{ selectedSc.order_id }}</span>
              </div>
            </div>

            <div v-if="selectedSc.details" class="mb-4">
              <p class="text-xs font-semibold text-gray-400 uppercase mb-1">Details</p>
              <p class="text-sm text-gray-700 whitespace-pre-line bg-gray-50 rounded-lg p-3">{{ selectedSc.details }}</p>
            </div>

            <!-- Review status -->
            <div class="mb-4">
              <p class="text-xs font-semibold text-gray-400 uppercase mb-2">Reviews</p>
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-lg p-3 border" :class="reviewerStatus(selectedSc.pmc_reviewed, selectedSc.pmc_approved).cls">
                  <p class="text-xs font-semibold mb-1">PMC Commercial — {{ selectedSc.pmc_reviewer_name || 'Not assigned' }}</p>
                  <p class="text-xs font-medium">{{ reviewerStatus(selectedSc.pmc_reviewed, selectedSc.pmc_approved).label }}</p>
                  <p v-if="selectedSc.pmc_comment" class="text-xs mt-1 italic">{{ selectedSc.pmc_comment }}</p>
                </div>
                <div class="rounded-lg p-3 border" :class="reviewerStatus(selectedSc.client_reviewed, selectedSc.client_approved).cls">
                  <p class="text-xs font-semibold mb-1">Client Commercial — {{ selectedSc.client_reviewer_name || 'Not assigned' }}</p>
                  <p class="text-xs font-medium">{{ reviewerStatus(selectedSc.client_reviewed, selectedSc.client_approved).label }}</p>
                  <p v-if="selectedSc.client_comment" class="text-xs mt-1 italic">{{ selectedSc.client_comment }}</p>
                </div>
              </div>
            </div>

            <!-- Review form (shown if user is a reviewer and hasn't reviewed yet) -->
            <div v-if="reviewRole" class="border-t pt-4">
              <h4 class="font-semibold text-gray-800 mb-3">
                Submit {{ reviewRole === 'pmc' ? 'PMC Commercial' : 'Client Commercial' }} Review
              </h4>
              <div class="flex gap-3 mb-3">
                <button @click="reviewForm.approved=true"
                  :class="['flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all',
                    reviewForm.approved ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500']">
                  ✓ Approve
                </button>
                <button @click="reviewForm.approved=false"
                  :class="['flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all',
                    !reviewForm.approved ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500']">
                  ✗ Reject
                </button>
              </div>
              <div class="mb-3">
                <label class="form-label">Comment (required)</label>
                <textarea v-model="reviewForm.comment" class="input-field" rows="3"
                  :placeholder="reviewForm.approved ? 'Approval comment...' : 'Reason for rejection...'"></textarea>
              </div>
              <p v-if="reviewError" class="text-red-500 text-sm mb-2">{{ reviewError }}</p>
              <div class="flex justify-end gap-2 mt-3">
                <button @click="reviewRole=''" class="btn-secondary">Cancel</button>
                <button @click="submitReview" :disabled="reviewSaving"
                  :class="['px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50',
                    reviewForm.approved ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-600 text-white hover:bg-red-700']">
                  {{ reviewSaving ? 'Submitting...' : (reviewForm.approved ? 'Approve' : 'Reject') }}
                </button>
              </div>
            </div>

          </div><!-- end space-y-4 -->
        </div><!-- end left column -->
        <div class="w-[28rem] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
          <file-attachments record-type="scope_change" :record-id="selectedSc.id" :can-edit="true"></file-attachments>
        </div>
      </div><!-- end modal-body -->
      <!-- Actions footer -->
      <div v-if="!reviewRole" class="modal-footer justify-start">
        <button v-if="isPmcReviewer(selectedSc)" @click="reviewRole='pmc'"
          class="px-3 py-1.5 text-sm font-semibold bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">
          PMC Review
        </button>
        <button v-if="isClientReviewer(selectedSc)" @click="reviewRole='client'"
          class="px-3 py-1.5 text-sm font-semibold bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200">
          Client Review
        </button>
        <button v-if="canEdit(selectedSc)" @click="openEdit(selectedSc); selectedSc=null"
          class="btn-secondary">Edit</button>
        <button v-if="canSubmit(selectedSc)" @click="submitSc(selectedSc)"
          class="btn-primary">{{ selectedSc.status === 'DRAFT' ? 'Submit for Review' : 'Resubmit for Review' }}</button>
        <button v-if="canCancel(selectedSc)" @click="cancelSc(selectedSc)"
          class="px-3 py-1.5 text-sm font-semibold text-red-600 hover:text-red-700">Cancel SC</button>
        <button v-if="canReopen(selectedSc)" @click="reopenSc(selectedSc)"
          class="px-3 py-1.5 text-sm font-semibold bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200">Re-open</button>
        <button @click="selectedSc=null" class="btn-secondary ml-auto">Close</button>
      </div>
    </div>
  </div>
</div>
  `,
});
