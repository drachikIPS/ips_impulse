// ─────────────────────────────────────────────────────────────────────────────
// Document Management Module
// ─────────────────────────────────────────────────────────────────────────────
app.component('document-management-module', {
  props: ['currentUser', 'pendingOpen', 'initialTab'],
  emits: ['subtab-change', 'record-change'],

  data() {
    return {
      // Lookup data
      packages: [],
      subservices: [],
      areas: [],
      units: [],

      // List
      documents: [],
      loading: false,
      exportingExcel: false,
      filterPackage: null,
      filterStatus: '',
      filterType: '',
      filterArea: null,
      filterUnit: null,
      filterSubservice: null,
      filterSearch: '',

      // Create / Edit modal
      showForm: false,
      editingDoc: null,
      docForm: {
        package_id: null, subservice_id: null,
        document_type: 'TECHNICAL', description: '',
        area_id: null, unit_id: null,
        require_area_review: false, require_unit_review: false,
        start_date: '', first_issue_date: '', approval_due_date: '',
        distribution_package_ids: [],
        weight: 8,
      },
      docError: '',
      savingDoc: false,

      // Detail / review modal
      selectedDoc: null,
      detailLoading: false,
      history: [],
      historyLoading: false,
      showHistory: false,
      // Toggle for the standalone Version History modal opened from the
      // detail form's "View History" button. The detail form itself only
      // shows the latest version inline; older versions live in this modal
      // so the form stays compact when there are many revisions.
      showVersionHistoryModal: false,
      // Reviewer chip whose detail panel is expanded inline (id of the review
      // row, or null). Lets us keep the per-reviewer status pill compact and
      // surface the comment / decision on demand instead of in every row.
      expandedReviewId: null,
      previewReviewers: [],

      // Review form (for reviewers)
      showReviewForm: false,
      reviewForm: { review_status: 'APPROVED', comment: '' },
      reviewError: '',
      reviewSaving: false,

      // Launch / override / new-version
      actionLoading: false,
      actionError: '',

      // Override modal
      showOverrideModal: false,
      overrideTarget: null,   // doc object to override
      overrideForm: { decision: 'APPROVED', comment: '' },
      overrideError: '',
      overrideSaving: false,

      // Tabs
      activeTab: 'documents',

      // Approvals tab
      approvalDocs: [],
      approvalLoading: false,

      // Receipts tab
      pendingReceipts: [],
      receiptsLoading: false,

      // Dashboard tab
      dashData: null,
      dashLoading: false,
      dashView: 'package',   // 'package' | 'subservice' | 'area' | 'unit'
      dashChartInstance: null,
      openCommentsChartInstance: null,
      commentsTrendChartInstance: null,
      dashFilterPkg: null,
      dashFilterSS: null,
      dashFilterArea: null,
      dashFilterUnit: null,

      // Import / Export
      showImportModal: false,
      importFile: null,
      importPreview: null,
      importLoading: false,
      importApplying: false,
      importError: '',
      importResult: null,

      // Comment Log tab
      allComments: [],
      allCommentsLoading: false,
      allCommentsStatusFilter: '',
      selectedComment: null,        // single-comment detail modal
      commentNoteText: '',
      commentNoteSaving: false,
      commentStatusSaving: false,
      commentLogDocId: null,
      showCommentLogModal: false,
      commentLogDoc: null,
      commentLogVersions: [],
      commentLogSelectedVersion: null,
      pdfViewerPage: 1,
      pdfViewerCollapsed: false,
      splitterPct: 60,
      splitterDragging: false,
      viewerUrl: null,
      viewerName: '',
      viewerIsImage: false,
      viewerIsPdf: false,
      viewerLoading: false,
      viewerKey: 0,

      // Setup tab
      setupSettings: { doc_progress_started: 15, doc_progress_first_issued: 65, doc_progress_awc: 80 },
      setupSaving: false,
      setupError: '',
      setupSuccess: false,
    };
  },

  computed: {
    isProjectOwnerOrAdmin() {
      if (!this.currentUser) return false;
      if (['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role)) return true;
      // Document Controller (Document Management Module Lead) gets the same UI gates.
      return (this.currentUser.lead_modules || []).includes('Document Management');
    },

    // Row in `history` for the document's current version. Carries the
    // version's row id (needed to scope file-attachments by version) plus
    // its review list. Falls back to a synthetic shape from selectedDoc
    // until the history fetch completes.
    currentVersionRow() {
      if (!this.selectedDoc) return null;
      const v = this.selectedDoc.current_version;
      const fromHistory = (this.history || []).find(h => h.version === v);
      if (fromHistory) return fromHistory;
      return {
        version: v,
        id: null,
        status: this.selectedDoc.status,
        reviews: this.selectedDoc.reviews || [],
      };
    },
    canViewCommentLog() {
      return this.currentUser && ['ADMIN', 'PROJECT_OWNER', 'PROJECT_TEAM', 'CLIENT'].includes(this.currentUser.role);
    },

    // Packages where the current user is package owner
    myOwnedPackageIds() {
      if (!this.currentUser || !this.currentUser.contact_id) return new Set();
      return new Set(this.packages.filter(p => p.package_owner_id === this.currentUser.contact_id).map(p => p.id));
    },

    // Packages where the current user is a linked contact
    myLinkedPackageIds() {
      if (!this.currentUser || !this.currentUser.contact_id) return new Set();
      const cid = this.currentUser.contact_id;
      return new Set(this.packages.filter(p => p.contact_ids && p.contact_ids.includes(cid)).map(p => p.id));
    },

    // Packages a vendor is allowed to author against. For everyone else,
    // returns the full project package list (the form keeps its current
    // behaviour). Used by the Package dropdown in the create/edit doc form.
    selectablePackagesForForm() {
      if (!this.currentUser || this.currentUser.role !== 'VENDOR') return this.packages;
      const allowed = this.myLinkedPackageIds;
      return this.packages.filter(p => allowed.has(p.id));
    },

    filteredDocs() {
      const s = (this.filterSearch || '').trim().toLowerCase();
      return this.documents.filter(d => {
        if (this.filterPackage && d.package_id !== this.filterPackage) return false;
        if (this.filterStatus && d.status !== this.filterStatus) return false;
        if (this.filterType && d.document_type !== this.filterType) return false;
        if (this.filterArea && d.area_id !== this.filterArea) return false;
        if (this.filterUnit && d.unit_id !== this.filterUnit) return false;
        if (this.filterSubservice && d.subservice_id !== this.filterSubservice) return false;
        if (s) {
          const hay = ((d.doc_number || '') + ' '
                    + (d.description || '') + ' '
                    + (d.subservice_code || '') + ' '
                    + (d.package_tag || '')).toLowerCase();
          if (hay.indexOf(s) === -1) return false;
        }
        return true;
      });
    },

    // Reviewers preview for the form (live computed from selections)
    formReviewerPreview() {
      if (!this.docForm.package_id || !this.docForm.subservice_id) return [];
      const pkg = this.packages.find(p => p.id === this.docForm.package_id);
      const ss = this.subservices.find(s => s.id === this.docForm.subservice_id);
      if (!pkg) return [];

      const byContact = {};
      const add = (cid, role) => {
        if (!cid) return;
        if (!byContact[cid]) byContact[cid] = [];
        byContact[cid].push(role);
      };

      if (this.docForm.document_type === 'TECHNICAL') {
        add(pkg.pmc_technical_reviewer_id, 'PMC Technical (Package)');
        add(pkg.client_technical_reviewer_id, 'Client Technical (Package)');
        if (ss) {
          add(ss.pmc_reviewer_id, 'PMC Technical (Sub-service)');
          add(ss.client_reviewer_id, 'Client Technical (Sub-service)');
        }
      } else {
        add(pkg.pmc_commercial_reviewer_id, 'PMC Commercial (Package)');
        add(pkg.client_commercial_reviewer_id, 'Client Commercial (Package)');
        if (ss) {
          add(ss.pmc_reviewer_id, 'PMC Commercial (Sub-service)');
          add(ss.client_reviewer_id, 'Client Commercial (Sub-service)');
        }
      }

      if (this.docForm.require_area_review && this.docForm.area_id) {
        const area = this.areas.find(a => a.id === this.docForm.area_id);
        if (area && area.owner_id) add(area.owner_id, 'Area Owner');
      }
      if (this.docForm.require_unit_review && this.docForm.unit_id) {
        const unit = this.units.find(u => u.id === this.docForm.unit_id);
        if (unit && unit.owner_id) add(unit.owner_id, 'Unit Owner');
      }

      return Object.entries(byContact).map(([cid, roles]) => {
        const cidNum = Number(cid);
        // Try to find the contact name from packages/subservices
        const name = this._contactName(cidNum);
        return { contact_id: cidNum, name, role: roles.join(' / ') };
      });
    },

    // Is the current user a pending reviewer for selectedDoc?
    // A single user can hold multiple roles on the same document (e.g. Package
    // PMC Technical + Subservice PMC). All of their pending rows are decided
    // in one submit; this computed returns a synthetic row combining the role
    // labels so the UI shows a single pending-review card as before.
    myPendingReview() {
      if (!this.selectedDoc || !this.currentUser || !this.currentUser.contact_id) return null;
      if (!this.selectedDoc.reviews) return null;
      const mine = this.selectedDoc.reviews.filter(r =>
        r.reviewer_contact_id === this.currentUser.contact_id && r.status === 'PENDING'
      );
      if (mine.length === 0) return null;
      if (mine.length === 1) return mine[0];
      const combinedRoles = mine.map(r => r.reviewer_role).filter(Boolean).join(' / ');
      return { ...mine[0], reviewer_role: combinedRoles };
    },

    canLaunch() {
      if (!this.selectedDoc || !['NOT_STARTED','IN_PROGRESS'].includes(this.selectedDoc.status)) return false;
      if (this.isProjectOwnerOrAdmin) return true;
      const cid = this.currentUser && this.currentUser.contact_id;
      if (!cid) return false;
      const pkg = this.packages.find(p => p.id === this.selectedDoc.package_id);
      if (!pkg) return false;
      if (pkg.package_owner_id === cid) return true;
      return pkg.contact_ids && pkg.contact_ids.includes(cid);
    },

    canOverride() {
      if (!this.selectedDoc || !['IN_REVIEW', 'REJECTED'].includes(this.selectedDoc.status)) return false;
      if (this.isProjectOwnerOrAdmin) return true;
      const cid = this.currentUser && this.currentUser.contact_id;
      return cid && this.selectedDoc.package_owner_id === cid;
    },

    canNewVersion() {
      if (!this.selectedDoc || ['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW'].includes(this.selectedDoc.status)) return false;
      if (this.isProjectOwnerOrAdmin) return true;
      return this.canWriteDoc(this.selectedDoc.package_id);
    },

    canEditSelected() {
      if (!this.selectedDoc || this.selectedDoc.status === 'IN_REVIEW') return false;
      return this.canWriteDoc(this.selectedDoc.package_id);
    },

    canDeleteSelected() {
      if (!this.selectedDoc) return false;
      if (this.isProjectOwnerOrAdmin) return true;
      return this.selectedDoc.package_owner_id === (this.currentUser && this.currentUser.contact_id);
    },

    canViewApprovals() {
      if (this.isProjectOwnerOrAdmin) return true;
      // Package owners also get the approvals tab
      if (this.myOwnedPackageIds.size > 0) return true;
      // Assigned reviewers on any package or subservice also get the approvals tab
      const cid = this.currentUser && this.currentUser.contact_id;
      if (cid) {
        const isPackageReviewer = this.packages.some(p =>
          p.pmc_technical_reviewer_id === cid ||
          p.client_technical_reviewer_id === cid ||
          p.pmc_commercial_reviewer_id === cid ||
          p.client_commercial_reviewer_id === cid
        );
        if (isPackageReviewer) return true;
        const isSubserviceReviewer = this.subservices.some(s =>
          s.pmc_reviewer_id === cid || s.client_reviewer_id === cid
        );
        if (isSubserviceReviewer) return true;
      }
      return false;
    },
  },

  // When the component is unmounted (user leaves the Documents module),
  // destroy chart instances so they don't sit in Chart.js's global
  // registry with detached canvases — those ghosts throw on later
  // animation frames and can blank dashboards the user navigates to next.
  beforeUnmount() {
    this._destroyAllDashCharts();
  },

  watch: {
    selectedDoc(val) {
      // Detail modal — comment-log modal takes precedence when both are open.
      if (this.commentLogDoc) return;
      this.$emit('record-change', val ? { type: 'document', id: val.id } : null);
    },
    commentLogDoc(val) {
      this.$emit('record-change', val ? { type: 'document_comment_log', id: val.id } : null);
    },
    // When loadDashboard flips dashLoading to true the template unmounts
    // the v-else block that hosts the canvases. If the previous charts
    // are still alive in Chart.js's registry when that happens, the next
    // animation frame fires on a detached canvas and throws
    // "Cannot read properties of null (reading 'save')" — which blanks
    // the new charts that are about to be drawn. Destroy the old charts
    // synchronously here (default flush: 'pre' runs before the DOM patch).
    dashLoading(v) {
      if (v) this._destroyAllDashCharts();
    },
  },

  async mounted() {
    if (this.initialTab) {
      this.activeTab = this.initialTab;
    }
    await this.loadLookups();
    await this.loadDocuments();
    await this.loadSetupSettings();
    this.checkPendingOpen();
    // Preload the approvals list so the tab badge count shows immediately,
    // even when the user hasn't opened the Approvals tab yet.
    if (this.canViewApprovals) await this.loadApprovalOverview();
    if (this.activeTab === 'dashboard') await this.loadDashboard();
  },

  methods: {
    checkPendingOpen() {
      if (!this.pendingOpen || this.pendingOpen.record_type !== 'document') return;
      // If My Action Points told us which tab to land on (approvals for reviews,
      // receipts for acknowledgements), switch to that tab and don't pop the
      // edit form. Only fall back to the edit form for a plain deep-link
      // without a tab hint.
      const knownTabs = ['documents', 'approvals', 'receipts', 'dashboard', 'comment-log', 'setup'];
      if (this.initialTab && knownTabs.includes(this.initialTab)) {
        this.switchTab(this.initialTab);
        return;
      }
      const doc = this.documents.find(x => x.id === this.pendingOpen.record_id);
      if (doc) this.openEditForm(doc);
    },

    async loadLookups() {
      const [pkgs, subs, areas, units] = await Promise.all([
        API.getPackages().catch(() => []),
        API.getSubservices().catch(() => []),
        API.getAreas().catch(() => []),
        API.getUnits().catch(() => []),
      ]);
      this.packages = pkgs;
      this.subservices = subs;
      this.areas = areas;
      this.units = units;
    },

    async loadDocuments() {
      this.loading = true;
      try {
        this.documents = await API.getDocuments();
      } catch (e) {
        console.error(e);
      } finally {
        this.loading = false;
      }
    },

    canWriteDoc(packageId) {
      if (this.isProjectOwnerOrAdmin) return true;
      if (this.myOwnedPackageIds.has(packageId)) return true;
      const role = this.currentUser && this.currentUser.role;
      if (['PROJECT_TEAM', 'CLIENT', 'VENDOR'].includes(role)) {
        return this.myLinkedPackageIds.has(packageId);
      }
      return false;
    },

    _contactName(cid) {
      // Look for a matching contact name across reviewer fields in packages/subservices
      for (const pkg of this.packages) {
        const map = {
          [pkg.pmc_technical_reviewer_id]: pkg.pmc_technical_reviewer_name,
          [pkg.pmc_commercial_reviewer_id]: pkg.pmc_commercial_reviewer_name,
          [pkg.client_technical_reviewer_id]: pkg.client_technical_reviewer_name,
          [pkg.client_commercial_reviewer_id]: pkg.client_commercial_reviewer_name,
          [pkg.package_owner_id]: pkg.package_owner_name,
        };
        if (map[cid]) return map[cid];
      }
      for (const ss of this.subservices) {
        if (ss.pmc_reviewer_id === cid) return ss.pmc_reviewer_name;
        if (ss.client_reviewer_id === cid) return ss.client_reviewer_name;
      }
      for (const a of this.areas) {
        if (a.owner_id === cid) return a.owner_name;
      }
      for (const u of this.units) {
        if (u.owner_id === cid) return u.owner_name;
      }
      return `Contact #${cid}`;
    },

    async switchTab(tab) {
      this.activeTab = tab;
      this.$emit('subtab-change', tab);
      if (tab === 'approvals' && this.approvalDocs.length === 0) {
        await this.loadApprovalOverview();
      }
      if (tab === 'dashboard') {
        await this.loadSetupSettings();
        await this.loadDashboard();
      }
      if (tab === 'setup') {
        await this.loadSetupSettings();
      }
      if (tab === 'comment-log') {
        await this.loadAllComments();
      }
      if (tab === 'receipts') {
        await this.loadPendingReceipts();
      }
    },

    async loadSetupSettings() {
      try {
        const s = await API.getSettings();
        this.setupSettings = {
          doc_progress_started:      parseFloat(s.doc_progress_started      ?? 15),
          doc_progress_first_issued: parseFloat(s.doc_progress_first_issued ?? 65),
          doc_progress_awc:          parseFloat(s.doc_progress_awc          ?? 80),
        };
      } catch (e) {
        console.error('Failed to load doc progress settings', e);
      }
    },

    async saveSetupSettings() {
      this.setupSaving = true;
      this.setupError = '';
      this.setupSuccess = false;
      try {
        await Promise.all([
          API.updateSetting('doc_progress_started',      String(this.setupSettings.doc_progress_started)),
          API.updateSetting('doc_progress_first_issued', String(this.setupSettings.doc_progress_first_issued)),
          API.updateSetting('doc_progress_awc',          String(this.setupSettings.doc_progress_awc)),
        ]);
        this.setupSuccess = true;
        setTimeout(() => { this.setupSuccess = false; }, 3000);
      } catch (e) {
        this.setupError = e.message || 'Save failed.';
      } finally {
        this.setupSaving = false;
      }
    },

    async loadAllComments() {
      this.allCommentsLoading = true;
      try {
        const params = {};
        if (this.allCommentsStatusFilter) params.status = this.allCommentsStatusFilter;
        this.allComments = await API.getAllDocumentComments(params);
      } catch (e) {
        console.error('Load all comments failed:', e);
      } finally {
        this.allCommentsLoading = false;
      }
    },

    openCommentDetail(c) {
      this.selectedComment = c;
      this.commentNoteText = '';
    },

    closeCommentDetail() {
      this.selectedComment = null;
      this.commentNoteText = '';
    },

    canChangeCommentStatus(c) {
      if (!c || !this.currentUser) return false;
      if (['ADMIN', 'PROJECT_OWNER', 'PROJECT_TEAM', 'CLIENT'].includes(this.currentUser.role)) return true;
      if (this.currentUser.id === c.author_id) return true;
      return false;
    },

    async addCommentDetailNote() {
      if (!this.selectedComment || !this.commentNoteText.trim()) return;
      this.commentNoteSaving = true;
      try {
        await API.addDocumentCommentNote(
          this.selectedComment.document_id,
          this.selectedComment.id,
          { content: this.commentNoteText.trim() }
        );
        this.commentNoteText = '';
        // refresh the list and re-select the same comment so notes update
        await this.loadAllComments();
        const fresh = this.allComments.find(x => x.id === this.selectedComment.id);
        if (fresh) this.selectedComment = fresh;
      } catch (e) {
        alert(e.message || 'Failed to add note');
      } finally {
        this.commentNoteSaving = false;
      }
    },

    async updateCommentDetailStatus(newStatus) {
      if (!this.selectedComment) return;
      this.commentStatusSaving = true;
      try {
        await API.updateDocumentComment(
          this.selectedComment.document_id,
          this.selectedComment.id,
          { status: newStatus, updated_at: this.selectedComment.updated_at }
        );
        await this.loadAllComments();
        const fresh = this.allComments.find(x => x.id === this.selectedComment.id);
        if (fresh) this.selectedComment = fresh;
        else this.selectedComment = null;
      } catch (e) {
        alert(e.message || 'Failed to update status');
      } finally {
        this.commentStatusSaving = false;
      }
    },

    async openCommentLog(doc) {
      this.commentLogDoc = doc;
      this.commentLogDocId = doc.id;
      this.pdfViewerPage = 1;
      this.pdfViewerCollapsed = false;
      this.viewerUrl = null;
      this.viewerName = '';
      this.viewerIsImage = false;
      this.viewerIsPdf = false;
      this.commentLogSelectedVersion = null;
      this.commentLogVersions = [];
      this.showCommentLogModal = true;
      try {
        this.commentLogVersions = await API.getDocumentHistory(doc.id);
        // Default to latest version
        if (this.commentLogVersions.length > 0) {
          this.commentLogSelectedVersion = this.commentLogVersions[0].id;
        }
      } catch (e) { console.error('Failed to load versions:', e); }
    },

    navigateToPage(page) {
      const p = Math.max(1, parseInt(page) || 1);
      this.pdfViewerPage = p;
      this.viewerKey++;
    },

    onSplitterDown(e) {
      this.splitterDragging = true;
      const container = e.target.closest('[data-splitter-container]');
      const onMove = (ev) => {
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const x = (ev.clientX || (ev.touches && ev.touches[0].clientX) || 0) - rect.left;
        this.splitterPct = Math.max(20, Math.min(80, (x / rect.width) * 100));
      };
      const onUp = () => {
        this.splitterDragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove);
      document.addEventListener('touchend', onUp);
    },

    async onViewFile(att) {
      this.pdfViewerCollapsed = false;
      this.viewerLoading = true;
      this.viewerName = att.original_filename;
      this.viewerIsImage = (att.content_type || '').startsWith('image/');
      this.viewerIsPdf = (att.content_type || '') === 'application/pdf';
      this.pdfViewerPage = 1;
      try {
        if (this.viewerUrl) URL.revokeObjectURL(this.viewerUrl);
        const blob = await API.fetchAttachmentBlob(att.id, true);
        this.viewerUrl = URL.createObjectURL(blob);
      } catch (e) {
        alert('Could not load file: ' + e.message);
        this.viewerUrl = null;
      } finally {
        this.viewerLoading = false;
      }
    },

    async loadDashboard() {
      this.dashLoading = true;
      try {
        const params = {};
        if (this.dashFilterPkg)  params.package_id    = this.dashFilterPkg;
        if (this.dashFilterSS)   params.subservice_id = this.dashFilterSS;
        if (this.dashFilterArea) params.area_id       = this.dashFilterArea;
        if (this.dashFilterUnit) params.unit_id       = this.dashFilterUnit;
        this.dashData = await API.getDocumentDashboard(params);
      } catch (e) {
        console.error(e);
      } finally {
        this.dashLoading = false;
      }
      // Render AFTER loading flips off — same pattern as the procurement
      // dashboard, which works reliably. await $nextTick() lets Vue patch
      // the DOM before Chart.js measures the canvas. Each render is wrapped
      // so one failing doesn't skip the others.
      if (this.dashData) {
        await this.$nextTick();
        try { this.renderSCurve(); }            catch (e) { console.error('[doc] renderSCurve failed:', e); }
        try { this.renderOpenCommentsChart(); } catch (e) { console.error('[doc] renderOpenCommentsChart failed:', e); }
        try { this.renderCommentsTrendChart(); } catch (e) { console.error('[doc] renderCommentsTrendChart failed:', e); }
      }
    },

    resetDashFilters() {
      this.dashFilterPkg  = null;
      this.dashFilterSS   = null;
      this.dashFilterArea = null;
      this.dashFilterUnit = null;
      this.loadDashboard();
    },

    canStartDoc(doc) {
      if (doc.status !== 'NOT_STARTED') return false;
      if (this.isProjectOwnerOrAdmin) return true;
      const cid = this.currentUser && this.currentUser.contact_id;
      if (!cid) return false;
      const pkg = this.packages.find(p => p.id === doc.package_id);
      if (!pkg) return false;
      if (pkg.package_owner_id === cid) return true;
      return pkg.contact_ids && pkg.contact_ids.includes(cid);
    },

    async startDoc(doc) {
      try {
        const updated = await API.startDocument(doc.id);
        const idx = this.documents.findIndex(d => d.id === doc.id);
        if (idx !== -1) this.documents.splice(idx, 1, updated);
      } catch (e) {
        alert(e.message || 'Could not record start date.');
      }
    },

    // Chart.js crashes with "Cannot read properties of null (reading 'save')"
    // if .destroy() runs after Vue has already unmounted the chart's canvas
    // (e.g. dashLoading flipped the template to the spinner). Swallow that
    // specific failure — the instance is already effectively gone.
    _safeDestroyChart(chart) {
      if (!chart) return;
      try { chart.destroy(); } catch (e) { /* canvas already gone; drop the orphan */ }
    },

    _destroyAllDashCharts() {
      this._safeDestroyChart(this.dashChartInstance);          this.dashChartInstance = null;
      this._safeDestroyChart(this.openCommentsChartInstance);  this.openCommentsChartInstance = null;
      this._safeDestroyChart(this.commentsTrendChartInstance); this.commentsTrendChartInstance = null;
    },

    renderSCurve() {
      const canvas = this.$el.querySelector('#docSCurveChart');
      if (!canvas || !this.dashData) return;
      this._safeDestroyChart(this.dashChartInstance);
      this.dashChartInstance = null;

      const docs = this.dashData.scurve_docs || [];
      const totalWeight = docs.reduce((s, d) => s + (d.weight || 8), 0);
      if (totalWeight === 0) return;

      // Collect all relevant dates
      const dateSet = new Set();
      docs.forEach(d => {
        ['start_date','first_issue_date','approval_due_date',
         'actual_start_date','actual_first_issue_date','actual_approval_date'].forEach(k => {
          if (d[k]) dateSet.add(d[k]);
        });
      });
      if (dateSet.size === 0) return;

      const allDates = Array.from(dateSet).sort();
      const today = new Date().toISOString().slice(0,10);

      // Progress weights from setup settings (0–100 scale, normalised to 0–1)
      const pStart  = (this.setupSettings.doc_progress_started      || 15) / 100;
      const pIssue  = (this.setupSettings.doc_progress_first_issued || 65) / 100;
      const pAWC    = (this.setupSettings.doc_progress_awc          || 80) / 100;

      // Build cumulative forecast
      const forecast = allDates.map(date => {
        let cum = 0;
        docs.forEach(d => {
          const w = d.weight || 8;
          if (d.approval_due_date && date >= d.approval_due_date) cum += w * 1.0;
          else if (d.first_issue_date && date >= d.first_issue_date) cum += w * pIssue;
          else if (d.start_date && date >= d.start_date) cum += w * pStart;
        });
        return (cum / totalWeight) * 100;
      });

      // Build cumulative actuals — null for future dates so Chart.js aligns with labels
      const actual = allDates.map(date => {
        if (date > today) return null;
        let cum = 0;
        docs.forEach(d => {
          const w = d.weight || 8;
          if (d.actual_approval_date && date >= d.actual_approval_date) cum += w * 1.0;
          else if (d.actual_awc_date && date >= d.actual_awc_date) cum += w * pAWC;
          else if (d.actual_first_issue_date && date >= d.actual_first_issue_date) cum += w * pIssue;
          else if (d.actual_start_date && date >= d.actual_start_date) cum += w * pStart;
        });
        return (cum / totalWeight) * 100;
      });

      // Adaptive point spacing — thin out markers when the timeline has
      // many dates so points don't visually pile up. The line itself still
      // renders every data point; only the visible dots are sparser.
      const nPts = allDates.length;
      const stride = Math.max(1, Math.ceil(nPts / 20));
      const pointRadiusFn = (baseSize) => (ctx) => {
        const i = ctx.dataIndex;
        if (i === 0 || i === nPts - 1) return baseSize + 1; // emphasise endpoints
        return i % stride === 0 ? baseSize : 0;
      };

      this.dashChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels: allDates,
          datasets: [
            {
              label: 'Forecast',
              data: forecast,
              borderColor: '#2563eb',
              backgroundColor: 'rgba(37,99,235,0.08)',
              fill: true,
              tension: 0.3,
              pointRadius: pointRadiusFn(3),
              pointHoverRadius: 5,
              borderWidth: 2,
            },
            {
              label: 'Actual',
              data: actual,
              borderColor: '#16a34a',
              backgroundColor: 'rgba(22,163,74,0.08)',
              fill: false,
              tension: 0.3,
              pointRadius: pointRadiusFn(4),
              pointHoverRadius: 6,
              borderWidth: 2,
              spanGaps: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: { ticks: { maxTicksLimit: 12, font: { size: 11 } } },
            y: {
              min: 0, max: 100,
              ticks: { callback: v => v + '%', font: { size: 11 } },
              title: { display: true, text: 'Weighted Progress (%)', font: { size: 11 } },
            },
          },
          plugins: {
            legend: { position: 'top' },
            tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%' } },
          },
        },
      });
    },

    renderOpenCommentsChart() {
      // Re-query the DOM every render (like renderSCurve) — a stored
      // Vue $refs value goes stale after the dashLoading spinner cycle
      // unmounts and remounts the v-else block.
      const canvas = this.$el.querySelector('#docOpenCommentsChart');
      this._safeDestroyChart(this.openCommentsChartInstance);
      this.openCommentsChartInstance = null;
      if (!canvas || !this.dashData) return;
      const rows = (this.dashData.by_package || [])
        .filter(p => (p.open_comments || 0) > 0)
        .sort((a, b) => (b.open_comments || 0) - (a.open_comments || 0));
      if (rows.length === 0) return;
      const labels = rows.map(r => r.tag);
      const data = rows.map(r => r.open_comments || 0);
      const maxVal = Math.max(...data);
      this.openCommentsChartInstance = new Chart(canvas, {
        type: 'bar',
        plugins: (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [],
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: '#F59E0B',
            borderRadius: 4,
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
                  const r = rows[items[0].dataIndex];
                  return r ? (r.tag + (r.name ? ' — ' + r.name : '')) : '';
                },
                label: ctx => ctx.raw + ' open comment' + (ctx.raw === 1 ? '' : 's'),
              },
            },
            datalabels: {
              anchor: 'end',
              align: 'end',
              clamp: true,
              color: '#374151',
              font: { size: 11, weight: '600' },
              formatter: v => v,
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: {
              beginAtZero: true,
              suggestedMax: Math.max(1, maxVal + 1),
              ticks: { stepSize: 1, precision: 0, font: { size: 10 } },
              grid: { color: '#F3F4F6' },
            },
          },
          layout: { padding: { top: 20 } },
        },
      });
    },

    renderCommentsTrendChart() {
      // Use querySelector for the same reason as renderOpenCommentsChart.
      const canvas = this.$el.querySelector('#docCommentsTrendChart');
      this._safeDestroyChart(this.commentsTrendChartInstance);
      this.commentsTrendChartInstance = null;
      if (!canvas || !this.dashData) return;
      const points = this.dashData.open_comments_timeline || [];
      if (points.length === 0) return;
      const labels = points.map(p => {
        // Display as "DD MMM yy" for readability
        const d = new Date(p.week + 'T00:00:00');
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
      });
      const series = points.map(p => p.open || 0);
      const maxVal = Math.max(1, ...series);
      this.commentsTrendChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Open comments',
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
                  if (p.closed) parts.push('-' + p.closed + ' closed/resolved');
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
    },

    async loadApprovalOverview() {
      this.approvalLoading = true;
      try {
        this.approvalDocs = await API.getDocApprovalOverview();
      } catch (e) {
        console.error(e);
      } finally {
        this.approvalLoading = false;
      }
    },

    canLaunchDoc(doc) {
      if (!['NOT_STARTED','IN_PROGRESS'].includes(doc.status)) return false;
      if (this.isProjectOwnerOrAdmin) return true;
      const cid = this.currentUser && this.currentUser.contact_id;
      if (!cid) return false;
      const pkg = this.packages.find(p => p.id === doc.package_id);
      if (!pkg) return false;
      if (pkg.package_owner_id === cid) return true;
      return pkg.contact_ids && pkg.contact_ids.includes(cid);
    },

    canOverrideDoc(doc) {
      if (!['IN_REVIEW', 'REJECTED'].includes(doc.status)) return false;
      if (this.isProjectOwnerOrAdmin) return true;
      const cid = this.currentUser && this.currentUser.contact_id;
      return cid && doc.package_owner_id === cid;
    },

    overrideDoc(doc) {
      this.openOverrideModal(doc);
    },

    async launchDoc(doc) {
      if (!confirm(`Launch approval workflow for ${doc.doc_number}?`)) return;
      this.actionLoading = true;
      this.actionError = '';
      try {
        await API.launchDocumentApproval(doc.id);
        await this.loadDocuments();
        if (this.selectedDoc && this.selectedDoc.id === doc.id) {
          this.selectedDoc = await API.getDocument(doc.id);
        }
      } catch (e) {
        alert(e.message || 'Launch failed.');
      } finally {
        this.actionLoading = false;
      }
    },

    async openLog(doc) {
      await this.openDetail(doc);
      await this.loadHistory();
    },

    // ── Form (Create / Edit) ──────────────────────────────────────────────────
    openCreateForm() {
      this.editingDoc = null;
      this.docForm = {
        package_id: null, subservice_id: null,
        document_type: 'TECHNICAL', description: '',
        area_id: null, unit_id: null,
        // Default to true so the checkbox is pre-checked the moment a user
        // picks an Area / Unit (the labels are v-if-gated so they only show
        // once a selection is made).
        require_area_review: true, require_unit_review: true,
        start_date: '', first_issue_date: '', approval_due_date: '',
        distribution_package_ids: [],
        weight: 8,
      };
      this.docError = '';
      this.showForm = true;
    },

    // When the user picks an Area / Unit, default the corresponding "Require
    // … Owner review" checkbox to ON. They can still uncheck it manually.
    onAreaSelected() {
      if (this.docForm.area_id) this.docForm.require_area_review = true;
    },
    onUnitSelected() {
      if (this.docForm.unit_id) this.docForm.require_unit_review = true;
    },

    openEditForm(doc) {
      this.selectedDoc = null;
      this.editingDoc = doc;
      this.docForm = {
        package_id: doc.package_id,
        subservice_id: doc.subservice_id,
        document_type: doc.document_type,
        description: doc.description,
        area_id: doc.area_id || null,
        unit_id: doc.unit_id || null,
        require_area_review: doc.require_area_review,
        require_unit_review: doc.require_unit_review,
        start_date: doc.start_date || '',
        first_issue_date: doc.first_issue_date || '',
        approval_due_date: doc.approval_due_date || '',
        distribution_package_ids: [...(doc.distribution_package_ids || [])],
        weight: doc.weight != null ? doc.weight : 8,
        updated_at: doc.updated_at || null,
      };
      this.docError = '';
      this.showForm = true;
    },

    async saveDoc() {
      if (!this.docForm.package_id) { this.docError = 'Package is required.'; return; }
      if (!this.docForm.subservice_id) { this.docError = 'Sub-service is required.'; return; }
      if (!this.docForm.description.trim()) { this.docError = 'Description is required.'; return; }
      this.savingDoc = true;
      this.docError = '';
      try {
        const payload = {
          ...this.docForm,
          description: this.docForm.description.trim(),
          start_date: this.docForm.start_date || null,
          first_issue_date: this.docForm.first_issue_date || null,
          approval_due_date: this.docForm.approval_due_date || null,
        };
        if (this.editingDoc) {
          await API.updateDocument(this.editingDoc.id, payload);
          await this.loadDocuments();
          this.showForm = false;
          if (this.selectedDoc && this.selectedDoc.id === this.editingDoc.id) {
            this.selectedDoc = this.documents.find(d => d.id === this.editingDoc.id) || null;
          }
        } else {
          this.editingDoc = { ...await API.createDocument(payload), _justCreated: true };
          await this.loadDocuments();
        }
      } catch (e) {
        this.docError = e.message || 'Save failed.';
      } finally {
        this.savingDoc = false;
      }
    },

    // ── Detail view ───────────────────────────────────────────────────────────
    async openDetail(doc) {
      this.detailLoading = true;
      this.showHistory = false;
      this.history = [];
      this.actionError = '';
      this.showReviewForm = false;
      try {
        this.selectedDoc = await API.getDocument(doc.id);
        await this.loadHistory();
      } catch (e) {
        console.error(e);
      } finally {
        this.detailLoading = false;
      }
    },

    async loadHistory() {
      if (!this.selectedDoc) return;
      this.historyLoading = true;
      try {
        this.history = await API.getDocumentHistory(this.selectedDoc.id);
        this.showHistory = true;
      } finally {
        this.historyLoading = false;
      }
    },

    // ── Actions ───────────────────────────────────────────────────────────────
    async launchApproval() {
      if (!confirm(`Launch approval workflow for ${this.selectedDoc.doc_number}?`)) return;
      this.actionLoading = true;
      this.actionError = '';
      try {
        this.selectedDoc = await API.launchDocumentApproval(this.selectedDoc.id);
        await this.loadDocuments();
      } catch (e) {
        this.actionError = e.message || 'Launch failed.';
      } finally {
        this.actionLoading = false;
      }
    },

    openOverrideModal(doc) {
      this.overrideTarget = doc;
      this.overrideForm = { decision: 'APPROVED', comment: '' };
      this.overrideError = '';
      this.overrideSaving = false;
      this.showOverrideModal = true;
    },

    async submitOverride() {
      this.overrideSaving = true;
      this.overrideError = '';
      try {
        const result = await API.overrideDocumentApproval(this.overrideTarget.id, {
          override_status: this.overrideForm.decision,
          comment: this.overrideForm.comment.trim(),
        });
        this.showOverrideModal = false;
        this.overrideTarget = null;
        await this.loadDocuments();
        if (this.activeTab === 'approvals') await this.loadApprovalOverview();
        if (this.selectedDoc && this.selectedDoc.id === result.id) {
          this.selectedDoc = result;
        }
      } catch (e) {
        this.overrideError = e.message || 'Override failed.';
      } finally {
        this.overrideSaving = false;
      }
    },

    async overrideApproval() {
      this.openOverrideModal(this.selectedDoc);
    },

    async createNewVersion() {
      if (!confirm(`Create a new version of ${this.selectedDoc.doc_number}? The document will return to Not Started status.`)) return;
      this.actionLoading = true;
      this.actionError = '';
      try {
        this.selectedDoc = await API.newDocumentVersion(this.selectedDoc.id);
        await this.loadDocuments();
      } catch (e) {
        this.actionError = e.message || 'Failed to create new version.';
      } finally {
        this.actionLoading = false;
      }
    },

    async deleteDoc(doc) {
      if (!confirm(`Delete ${doc.doc_number} — "${doc.description}"? This cannot be undone.`)) return;
      try {
        await API.deleteDocument(doc.id);
        if (this.selectedDoc && this.selectedDoc.id === doc.id) this.selectedDoc = null;
        await this.loadDocuments();
      } catch (e) {
        alert(e.message || 'Delete failed.');
      }
    },

    async loadPendingReceipts() {
      this.receiptsLoading = true;
      try {
        this.pendingReceipts = await API.getPendingDocumentReceipts();
      } catch (e) {
        console.error('Failed to load pending receipts:', e);
      } finally {
        this.receiptsLoading = false;
      }
    },

    async acknowledgeReceiptFromList(rc) {
      try {
        await API.acknowledgeDocumentReceipt(rc.document_id, rc.package_id);
        await this.loadPendingReceipts();
      } catch (e) {
        alert(e.message || 'Acknowledgment failed.');
      }
    },

    async openDocFromReceipt(rc) {
      await this.openDetail({ id: rc.document_id });
    },

    priorApprPair(statusKey) {
      const m = this.dashData && this.dashData.prior_approval_counts && this.dashData.prior_approval_counts[statusKey];
      return {
        appr: (m && m.APPROVED) || 0,
        awc:  (m && m.APPROVED_WITH_COMMENTS) || 0,
      };
    },

    receiptsForVersion(ver) {
      // selectedDoc.receipts only carries the latest-approved version's
      // receipts today; show them attached to that version's history row
      // and leave older versions without a receipts block.
      if (!this.selectedDoc || !this.selectedDoc.receipts) return [];
      if (!ver || ver.version !== this.selectedDoc.last_approved_version) return [];
      return this.selectedDoc.receipts;
    },

    canAcknowledgeReceipt(rc) {
      if (rc.acknowledged) return false;
      if (!this.currentUser) return false;
      // Admin and Project Owner can acknowledge for any package
      if (['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role)) return true;
      // Package owner or linked contact can acknowledge
      if (!this.currentUser.contact_id) return false;
      const pkg = this.packages.find(p => p.id === rc.package_id);
      if (!pkg) return false;
      if (pkg.package_owner_id === this.currentUser.contact_id) return true;
      if (pkg.contact_ids && pkg.contact_ids.includes(this.currentUser.contact_id)) return true;
      return false;
    },

    async acknowledgeReceipt(rc) {
      try {
        await API.acknowledgeDocumentReceipt(this.selectedDoc.id, rc.package_id);
        // Reload the document to refresh receipts
        this.selectedDoc = await API.getDocument(this.selectedDoc.id);
      } catch (e) {
        alert(e.message || 'Acknowledgment failed.');
      }
    },

    async submitReview() {
      if (!this.reviewForm.comment.trim()) { this.reviewError = 'A comment is required.'; return; }
      this.reviewSaving = true;
      this.reviewError = '';
      try {
        this.selectedDoc = await API.submitDocumentReview(this.selectedDoc.id, {
          review_status: this.reviewForm.review_status,
          comment: this.reviewForm.comment.trim(),
        });
        await this.loadDocuments();
        if (this.activeTab === 'approvals') await this.loadApprovalOverview();
        this.showReviewForm = false;
        this.reviewForm = { review_status: 'APPROVED', comment: '' };
      } catch (e) {
        this.reviewError = e.message || 'Review failed.';
      } finally {
        this.reviewSaving = false;
      }
    },

    // ── Helpers ───────────────────────────────────────────────────────────────
    statusBadge(status) {
      const m = {
        NOT_STARTED: 'bg-gray-100 text-gray-600',
        IN_PROGRESS: 'bg-amber-100 text-amber-700',
        IN_REVIEW: 'bg-blue-100 text-blue-700',
        APPROVED: 'bg-green-100 text-green-700',
        APPROVED_WITH_COMMENTS: 'bg-orange-100 text-orange-700',
        REJECTED: 'bg-red-100 text-red-700',
      };
      return m[status] || 'bg-gray-100 text-gray-500';
    },

    statusLabel(status) {
      const m = {
        NOT_STARTED: 'Not Started',
        IN_PROGRESS: 'In Progress',
        IN_REVIEW: 'In Review',
        APPROVED: 'Approved',
        APPROVED_WITH_COMMENTS: 'Approved with Comments',
        REJECTED: 'Rejected',
      };
      return m[status] || status;
    },

    docStatusLabel(doc) {
      return this.statusLabel(doc.status);
    },

    docStatusBadge(doc) {
      return this.statusBadge(doc.status);
    },

    docProgress(doc) {
      const pStart = this.setupSettings.doc_progress_started      || 15;
      const pIssue = this.setupSettings.doc_progress_first_issued || 65;
      const pAWC   = this.setupSettings.doc_progress_awc          || 80;
      const m = {
        NOT_STARTED: 0,
        STARTED:     pStart,
        FIRST_ISSUED: pIssue,
        APPROVED_WITH_COMMENTS: pAWC,
        APPROVED: 100,
      };
      return m[doc.best_milestone] ?? 0;
    },

    docProgressColor(doc) {
      const m = {
        NOT_STARTED: 'bg-gray-300',
        STARTED:     'bg-amber-400',
        FIRST_ISSUED: 'bg-blue-500',
        APPROVED_WITH_COMMENTS: 'bg-orange-500',
        APPROVED: 'bg-green-500',
      };
      return m[doc.best_milestone] || 'bg-gray-300';
    },

    reviewBadge(status) {
      const m = {
        PENDING: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
        APPROVED: 'bg-green-50 text-green-700 border border-green-200',
        APPROVED_WITH_COMMENTS: 'bg-orange-50 text-orange-700 border border-orange-200',
        REJECTED: 'bg-red-50 text-red-700 border border-red-200',
      };
      return m[status] || '';
    },

    typeBadge(t) {
      return t === 'TECHNICAL' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700';
    },

    fmtDate(d) { return d ? d.slice(0, 10) : '—'; },

    fmtDateTime(iso) {
      if (!iso) return '';
      const tz = (window.AppSettings && window.AppSettings.timezone) || undefined;
      const d = new Date(iso);
      const opts = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
      if (tz) opts.timeZone = tz;
      return d.toLocaleString('en-GB', opts);
    },

    // ── Export / Import ───────────────────────────────────────────────────────
    async exportExcelReport() {
      this.exportingExcel = true;
      try {
        const params = new URLSearchParams();
        if (this.filterPackage)  params.set('package_id',     this.filterPackage);
        if (this.filterType)     params.set('document_type',  this.filterType);
        if (this.filterStatus)   params.set('status',         this.filterStatus);
        const qs = params.toString() ? '?' + params.toString() : '';
        const date = new Date().toISOString().split('T')[0];
        await API.download(`/api/documents/export/excel${qs}`, `documents_${date}.xlsx`);
      } catch (e) {
        alert('Export failed: ' + e.message);
      } finally { this.exportingExcel = false; }
    },

    async exportDocs() {
      try { await API.exportDocuments(); }
      catch (e) { alert(e.message || 'Export failed'); }
    },
    openImportModal() {
      this.showImportModal = true;
      this.importFile = null;
      this.importPreview = null;
      this.importError = '';
      this.importResult = null;
    },
    resetImport() {
      if (this.importPreview) {
        this.importPreview = null;
        this.importError = '';
      } else {
        this.showImportModal = false;
      }
    },
    onImportFileChange(e) {
      this.importFile = e.target.files[0] || null;
      this.importError = '';
    },
    async runImportPreview() {
      if (!this.importFile) return;
      this.importLoading = true;
      this.importError = '';
      try {
        this.importPreview = await API.previewDocumentsImport(this.importFile);
      } catch (e) {
        this.importError = e.message || 'Preview failed';
      } finally {
        this.importLoading = false;
      }
    },
    async applyImport() {
      if (!this.importPreview) return;
      this.importApplying = true;
      this.importError = '';
      try {
        this.importResult = await API.applyDocumentsImport({ rows: this.importPreview.rows });
      } catch (e) {
        this.importError = e.message || 'Import failed';
      } finally {
        this.importApplying = false;
      }
    },
  },

  template: `
<div>
  <!-- ── Tab Bar ── -->
  <div class="sub-tab-bar">
    <button @click="switchTab('documents')" :class="['sub-tab', activeTab === 'documents' ? 'active' : '']">Documents</button>
    <button v-if="canViewApprovals" @click="switchTab('approvals')" :class="['sub-tab', activeTab === 'approvals' ? 'active' : '']">
      Approvals
      <span v-if="approvalDocs.length > 0" class="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{{ approvalDocs.length }}</span>
    </button>
    <button @click="switchTab('receipts')" :class="['sub-tab', activeTab === 'receipts' ? 'active' : '']">
      Receipts
      <span v-if="pendingReceipts.length > 0" class="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">{{ pendingReceipts.length }}</span>
    </button>
    <button @click="switchTab('dashboard')" :class="['sub-tab', activeTab === 'dashboard' ? 'active' : '']">Dashboard</button>
    <button v-if="canViewCommentLog" @click="switchTab('comment-log')" :class="['sub-tab', activeTab === 'comment-log' ? 'active' : '']">Comment Log</button>
    <button v-if="isProjectOwnerOrAdmin" @click="switchTab('setup')" :class="['sub-tab', activeTab === 'setup' ? 'active' : '']">Setup</button>
  </div>

  <!-- ════════════════ DOCUMENTS TAB ════════════════ -->
  <template v-if="activeTab === 'documents'">

  <!-- ── Toolbar ── -->
  <div class="flex flex-wrap items-center gap-2 mb-4">
    <select v-model="filterPackage" class="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
      <option :value="null">All packages</option>
      <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }} {{ p.name }}</option>
    </select>
    <select v-model="filterSubservice" class="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
      <option :value="null">All sub-services</option>
      <option v-for="s in subservices" :key="s.id" :value="s.id">{{ s.code }} — {{ s.description }}</option>
    </select>
    <select v-model="filterArea" class="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
      <option :value="null">All areas</option>
      <option v-for="a in areas" :key="a.id" :value="a.id">{{ a.tag }}<span v-if="a.description"> — {{ a.description }}</span></option>
    </select>
    <select v-model="filterUnit" class="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
      <option :value="null">All units</option>
      <option v-for="u in units" :key="u.id" :value="u.id">{{ u.tag }}<span v-if="u.description"> — {{ u.description }}</span></option>
    </select>
    <select v-model="filterStatus" class="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
      <option value="">All statuses</option>
      <option value="NOT_STARTED">Not Started</option>
      <option value="IN_PROGRESS">In Progress</option>
      <option value="IN_REVIEW">In Review</option>
      <option value="APPROVED">Approved</option>
      <option value="APPROVED_WITH_COMMENTS">Approved with Comments</option>
      <option value="REJECTED">Rejected</option>
    </select>
    <select v-model="filterType" class="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
      <option value="">All types</option>
      <option value="TECHNICAL">Technical</option>
      <option value="COMMERCIAL">Commercial</option>
    </select>
    <input v-model="filterSearch" type="text" placeholder="Search ID, description…"
           class="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white" style="width:200px"/>
    <button @click="loadDocuments" class="btn-secondary text-sm">Refresh</button>
    <div class="flex items-center gap-2 ml-auto">
      <button @click="exportExcelReport" :disabled="exportingExcel" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        {{ exportingExcel ? 'Exporting...' : 'Export Excel' }}
      </button>
      <button v-if="isProjectOwnerOrAdmin" @click="openImportModal" class="btn-secondary text-sm flex items-center gap-1">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 4v12m0-4l-3 3m3-3l3 3"/></svg>
        Import
      </button>
      <button @click="openCreateForm" class="btn-primary flex items-center">
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        New Document
      </button>
    </div>
  </div>

  <!-- ── Document List ── -->
  <div v-if="loading" class="text-center py-10 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
  <div v-else-if="filteredDocs.length === 0" class="card text-center py-10 text-gray-400">No documents found.</div>
  <div v-else class="card p-0 overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <th class="text-left px-4 py-3 w-28">ID</th>
          <th class="text-left px-4 py-3 w-48">Package</th>
          <th class="text-left px-4 py-3 w-48">Sub-service</th>
          <th class="text-left px-4 py-3 w-28">Type</th>
          <th class="text-left px-4 py-3">Description</th>
          <th class="text-left px-4 py-3 w-52">Status</th>
          <th class="text-center px-3 py-3 w-16">Ver.</th>
          <th class="text-left px-4 py-3 w-28">Progress</th>
          <th class="text-left px-4 py-3 w-28">Due Date</th>
          <th class="px-4 py-3 w-20"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100">
        <tr v-for="doc in filteredDocs" :key="doc.id"
          class="hover:bg-gray-50 cursor-pointer"
          @click="openDetail(doc)">
          <td class="px-4 py-3 font-mono text-xs text-gray-500">{{ doc.doc_number }}</td>
          <td class="px-4 py-3">
            <span class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ doc.package_tag }}</span>
            <div v-if="doc.package_name" class="text-xs text-gray-500 mt-0.5 truncate max-w-[11rem]" :title="doc.package_name">{{ doc.package_name }}</div>
          </td>
          <td class="px-4 py-3 text-xs text-gray-600">
            <span class="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{{ doc.subservice_code }}</span>
            <div v-if="doc.subservice_name" class="text-gray-500 mt-0.5 truncate max-w-[11rem]" :title="doc.subservice_name">{{ doc.subservice_name }}</div>
          </td>
          <td class="px-4 py-3">
            <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', typeBadge(doc.document_type)]">
              {{ doc.document_type === 'TECHNICAL' ? 'Technical' : 'Commercial' }}
            </span>
          </td>
          <td class="px-4 py-3 max-w-xs truncate text-gray-800" :title="doc.description">{{ doc.description }}</td>
          <td class="px-4 py-3">
            <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', docStatusBadge(doc)]">{{ docStatusLabel(doc) }}</span>
          </td>
          <td class="px-3 py-3 text-center text-xs text-gray-500 font-mono">v{{ doc.current_version }}</td>
          <td class="px-4 py-3 w-28">
            <div class="flex items-center gap-1.5">
              <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div :class="['h-full rounded-full transition-all', docProgressColor(doc)]"
                  :style="{ width: docProgress(doc) + '%' }"></div>
              </div>
              <span class="text-xs text-gray-500 w-8 text-right">{{ docProgress(doc) }}%</span>
            </div>
          </td>
          <td class="px-4 py-3 text-xs text-gray-500">{{ fmtDate(doc.approval_due_date) }}</td>
          <td class="px-4 py-3 text-right" @click.stop>
            <div class="flex items-center justify-end gap-1">
              <!-- Start document -->
              <button v-if="canStartDoc(doc)" @click.stop="startDoc(doc)"
                class="btn-icon text-gray-400 hover:text-amber-600" title="Mark as Started">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l14 9-14 9V3z"/>
                </svg>
              </button>
              <!-- Already started indicator -->
              <span v-else-if="doc.status === 'IN_PROGRESS'"
                class="text-amber-500" :title="'Started ' + fmtDate(doc.actual_start_date)">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 3l14 9-14 9V3z"/>
                </svg>
              </span>
              <!-- Launch Approval -->
              <button v-if="canLaunchDoc(doc)" @click="launchDoc(doc)" :disabled="actionLoading"
                class="btn-icon text-gray-400 hover:text-green-600 disabled:opacity-40" title="Launch Approval">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </button>
              <!-- Comments -->
              <button @click.stop="openCommentLog(doc)"
                class="btn-icon relative text-gray-400 hover:text-amber-600"
                :title="doc.open_comments_count > 0 ? doc.open_comments_count + ' open comment' + (doc.open_comments_count === 1 ? '' : 's') : 'Comment Log'">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/>
                </svg>
                <span v-if="doc.open_comments_count > 0"
                  class="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                  {{ doc.open_comments_count }}
                </span>
              </button>
              <!-- Log -->
              <button @click="openLog(doc)"
                class="btn-icon text-gray-400 hover:text-ips-blue" title="Version Log">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </button>
              <!-- Edit -->
              <button v-if="canWriteDoc(doc.package_id) && (doc.status !== 'IN_REVIEW' || isProjectOwnerOrAdmin)"
                @click="openEditForm(doc)"
                class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  </template><!-- end documents tab -->

  <!-- ════════════════ APPROVALS TAB ════════════════ -->
  <template v-if="activeTab === 'approvals'">
    <div class="flex items-center gap-3 mb-4">
      <p class="text-sm text-gray-500">Documents currently in review. Click <strong>Review</strong> to open the document and submit your decision.</p>
      <button @click="loadApprovalOverview" class="btn-secondary text-sm ml-auto">Refresh</button>
    </div>
    <div v-if="approvalLoading" class="text-center py-10 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="approvalDocs.length === 0" class="card text-center py-10 text-gray-400">No documents currently in review.</div>
    <div v-else class="space-y-4">
      <div v-for="doc in approvalDocs" :key="doc.id" class="card p-0 overflow-hidden">
        <!-- Doc header -->
        <div class="flex items-center gap-3 px-4 py-3 bg-blue-50 border-b border-blue-100">
          <span class="font-mono text-xs text-gray-400">{{ doc.doc_number }}</span>
          <span class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ doc.package_tag }}</span>
          <span class="text-xs text-gray-500">{{ doc.package_name }}</span>
          <span class="mx-1 text-gray-300">·</span>
          <span class="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{{ doc.subservice_code }}</span>
          <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full ml-1', typeBadge(doc.document_type)]">{{ doc.document_type === 'TECHNICAL' ? 'Technical' : 'Commercial' }}</span>
          <span class="font-medium text-gray-800 ml-1">{{ doc.description }}</span>
          <span class="ml-auto text-xs text-gray-400">v{{ doc.current_version }}</span>
          <button @click="openDetail(doc)" class="btn-secondary text-xs py-1 px-2">Open</button>
          <button v-if="canOverrideDoc(doc)" @click="overrideDoc(doc)" :disabled="actionLoading"
            class="text-xs font-semibold px-2 py-1 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50">
            Override Decision
          </button>
        </div>
        <!-- Reviewers -->
        <table class="w-full text-sm">
          <tbody class="divide-y divide-gray-50">
            <tr v-for="r in doc.reviews" :key="r.id" :class="['transition-colors', r.status === 'APPROVED' ? 'bg-green-50' : r.status === 'REJECTED' ? 'bg-red-50' : 'hover:bg-gray-50']">
              <td class="px-4 py-2.5 w-48">
                <span class="font-semibold text-gray-800 text-xs">{{ r.reviewer_name }}</span>
              </td>
              <td class="px-4 py-2.5 w-56">
                <span class="text-xs text-gray-500">{{ r.reviewer_role }}</span>
              </td>
              <td class="px-4 py-2.5 w-52 whitespace-nowrap">
                <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', reviewBadge(r.status)]">{{ statusLabel(r.status) }}</span>
              </td>
              <td class="px-4 py-2.5 text-xs text-gray-500 italic">{{ r.comment || '' }}</td>
              <td class="px-4 py-2.5 text-xs text-gray-400">{{ r.reviewed_at ? fmtDate(r.reviewed_at) : '' }}</td>
              <td class="px-4 py-2.5 text-right">
                <button v-if="r.status === 'PENDING' && currentUser && r.reviewer_contact_id === currentUser.contact_id"
                  @click="openDetail(doc)"
                  class="px-3 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors">
                  Review
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </template><!-- end approvals tab -->

  <!-- ════════════════ RECEIPTS TAB ════════════════ -->
  <template v-if="activeTab === 'receipts'">
    <div class="card mb-4">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-base font-semibold text-gray-800">Pending Receipt Acknowledgments</h3>
          <p class="text-sm text-gray-500 mt-0.5">Documents approved and distributed to packages awaiting receipt confirmation.</p>
        </div>
        <button @click="loadPendingReceipts" :disabled="receiptsLoading" class="btn-secondary text-sm">
          <svg :class="['w-3.5 h-3.5 mr-1.5', receiptsLoading ? 'animate-spin' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Refresh
        </button>
      </div>

      <div v-if="receiptsLoading" class="text-center py-8"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
      <div v-else-if="pendingReceipts.length === 0" class="text-center py-8 text-gray-400">All receipts have been acknowledged.</div>
      <div v-else class="overflow-hidden rounded-lg border border-gray-200">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Document</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Origin</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Version</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Awaiting Package</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="rc in pendingReceipts" :key="rc.id" class="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer" @click="openDocFromReceipt(rc)">
              <td class="px-4 py-3 font-medium text-ips-blue hover:underline">{{ rc.doc_number }}</td>
              <td class="px-4 py-3 text-gray-600 max-w-xs truncate">{{ rc.doc_description || '—' }}</td>
              <td class="px-4 py-3">
                <span v-if="rc.origin_package_tag" class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ rc.origin_package_tag }}</span>
              </td>
              <td class="px-4 py-3 text-gray-500">V{{ String(rc.version).padStart(2,'0') }}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#D97706">{{ rc.package_tag }}</span>
                <span class="text-gray-600 ml-1">{{ rc.package_name }}</span>
              </td>
              <td class="px-4 py-3 text-right" @click.stop>
                <button @click="acknowledgeReceiptFromList(rc)" class="px-3 py-1 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors">
                  Acknowledge
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="pendingReceipts.length > 0" class="mt-2 text-xs text-gray-400">{{ pendingReceipts.length }} pending acknowledgment(s)</div>
    </div>
  </template><!-- end receipts tab -->

  <!-- ════════════════ DASHBOARD TAB ════════════════ -->
  <template v-if="activeTab === 'dashboard'">
    <div v-if="dashLoading" class="text-center py-10 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="!dashData" class="card text-center py-10 text-gray-400">No data available.</div>
    <div v-else class="space-y-4">

      <!-- ── Filter bar ───────────────────────────────────────────────────── -->
      <div class="card px-4 py-3 flex items-center gap-3 flex-wrap">
        <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">Filter</span>

        <select v-model="dashFilterPkg" @change="loadDashboard()"
          class="input-field text-sm py-1.5 min-w-0 w-44">
          <option :value="null">All Packages</option>
          <option v-for="p in (dashData.filter_options.packages || [])" :key="p.id" :value="p.id">
            {{ p.tag }}{{ p.name ? ' — ' + p.name : '' }}
          </option>
        </select>

        <select v-model="dashFilterSS" @change="loadDashboard()"
          class="input-field text-sm py-1.5 min-w-0 w-48">
          <option :value="null">All Sub-services</option>
          <option v-for="s in (dashData.filter_options.subservices || [])" :key="s.id" :value="s.id">
            {{ s.code }}{{ s.name ? ' — ' + s.name : '' }}
          </option>
        </select>

        <select v-model="dashFilterArea" @change="loadDashboard()"
          class="input-field text-sm py-1.5 min-w-0 w-40"
          :disabled="!(dashData.filter_options.areas || []).length">
          <option :value="null">All Areas</option>
          <option v-for="a in (dashData.filter_options.areas || [])" :key="a.id" :value="a.id">
            {{ a.tag }}
          </option>
        </select>

        <select v-model="dashFilterUnit" @change="loadDashboard()"
          class="input-field text-sm py-1.5 min-w-0 w-40"
          :disabled="!(dashData.filter_options.units || []).length">
          <option :value="null">All Units</option>
          <option v-for="u in (dashData.filter_options.units || [])" :key="u.id" :value="u.id">
            {{ u.tag }}
          </option>
        </select>

        <button v-if="dashFilterPkg || dashFilterSS || dashFilterArea || dashFilterUnit"
          @click="resetDashFilters()" class="btn-secondary text-xs py-1 px-2 ml-1">
          Clear filters
        </button>

        <button @click="loadDashboard" :disabled="dashLoading" class="btn-secondary text-sm flex items-center gap-1.5 ml-auto disabled:opacity-50" title="Re-fetch data and re-render all charts">
          <svg :class="['w-3.5 h-3.5', dashLoading ? 'animate-spin' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          {{ dashLoading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>

      <!-- ── Totals row (always visible) ─────────────────────────────────── -->
      <p class="text-[11px] text-gray-400 italic -mb-1">
        S-curve progress is locked to each document's <strong>first approval</strong>; later re-reviews don't move the curve.
        Cards below show how many docs in each status were already approved at least once before.
      </p>
      <div class="flex flex-wrap gap-3">
        <div class="card p-4 flex-1 flex items-center gap-3 min-w-[110px]">
          <div class="text-3xl font-bold text-gray-700">{{ dashData.totals.NOT_STARTED || 0 }}</div>
          <div class="text-xs text-gray-500 leading-tight">
            Not Started
            <div v-if="priorApprPair('NOT_STARTED').appr || priorApprPair('NOT_STARTED').awc" class="text-[10px] text-gray-400 mt-1 leading-tight font-normal">
              <div v-if="priorApprPair('NOT_STARTED').appr">prev. Approved: <strong>{{ priorApprPair('NOT_STARTED').appr }}</strong></div>
              <div v-if="priorApprPair('NOT_STARTED').awc">prev. Appr. w/ Comm.: <strong>{{ priorApprPair('NOT_STARTED').awc }}</strong></div>
            </div>
          </div>
        </div>
        <div class="card p-4 flex-1 flex items-center gap-3 min-w-[110px] border-l-4 border-amber-400">
          <div class="text-3xl font-bold text-amber-700">{{ dashData.totals.IN_PROGRESS || 0 }}</div>
          <div class="text-xs text-amber-500 leading-tight">
            In Progress
            <div v-if="priorApprPair('IN_PROGRESS').appr || priorApprPair('IN_PROGRESS').awc" class="text-[10px] text-amber-400 mt-1 leading-tight font-normal">
              <div v-if="priorApprPair('IN_PROGRESS').appr">prev. Approved: <strong>{{ priorApprPair('IN_PROGRESS').appr }}</strong></div>
              <div v-if="priorApprPair('IN_PROGRESS').awc">prev. Appr. w/ Comm.: <strong>{{ priorApprPair('IN_PROGRESS').awc }}</strong></div>
            </div>
          </div>
        </div>
        <div class="card p-4 flex-1 flex items-center gap-3 min-w-[110px] border-l-4 border-blue-400">
          <div class="text-3xl font-bold text-blue-700">{{ dashData.totals.IN_REVIEW || 0 }}</div>
          <div class="text-xs text-blue-500 leading-tight">
            In Review
            <div v-if="priorApprPair('IN_REVIEW').appr || priorApprPair('IN_REVIEW').awc" class="text-[10px] text-blue-400 mt-1 leading-tight font-normal">
              <div v-if="priorApprPair('IN_REVIEW').appr">prev. Approved: <strong>{{ priorApprPair('IN_REVIEW').appr }}</strong></div>
              <div v-if="priorApprPair('IN_REVIEW').awc">prev. Appr. w/ Comm.: <strong>{{ priorApprPair('IN_REVIEW').awc }}</strong></div>
            </div>
          </div>
        </div>
        <div class="card p-4 flex-1 flex items-center gap-3 min-w-[110px] border-l-4 border-green-400">
          <div class="text-3xl font-bold text-green-700">{{ dashData.totals.APPROVED || 0 }}</div>
          <div class="text-xs text-green-500 leading-tight">Approved</div>
        </div>
        <div class="card p-4 flex-1 flex items-center gap-3 min-w-[110px] border-l-4 border-orange-400">
          <div class="text-3xl font-bold text-orange-700">{{ dashData.totals.APPROVED_WITH_COMMENTS || 0 }}</div>
          <div class="text-xs text-orange-500 leading-tight">Appr. w/ Comments</div>
        </div>
        <div class="card p-4 flex-1 flex items-center gap-3 min-w-[110px] border-l-4 border-red-400">
          <div class="text-3xl font-bold text-red-700">{{ dashData.totals.REJECTED || 0 }}</div>
          <div class="text-xs text-red-500 leading-tight">
            Rejected
            <div v-if="priorApprPair('REJECTED').appr || priorApprPair('REJECTED').awc" class="text-[10px] text-red-400 mt-1 leading-tight font-normal">
              <div v-if="priorApprPair('REJECTED').appr">prev. Approved: <strong>{{ priorApprPair('REJECTED').appr }}</strong></div>
              <div v-if="priorApprPair('REJECTED').awc">prev. Appr. w/ Comm.: <strong>{{ priorApprPair('REJECTED').awc }}</strong></div>
            </div>
          </div>
        </div>
        <div class="card p-4 flex-1 flex items-center gap-3 min-w-[110px] border-l-4 border-gray-400">
          <div class="text-3xl font-bold text-gray-800">{{ (dashData.totals.NOT_STARTED||0)+(dashData.totals.IN_PROGRESS||0)+(dashData.totals.IN_REVIEW||0)+(dashData.totals.APPROVED||0)+(dashData.totals.APPROVED_WITH_COMMENTS||0)+(dashData.totals.REJECTED||0) }}</div>
          <div class="text-xs text-gray-500 leading-tight">Total</div>
        </div>
      </div>

      <!-- ── Status counts card ───────────────────────────────────────────── -->
      <div class="card p-0 overflow-hidden">
        <div class="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-4 flex-wrap">
          <h4 class="text-sm font-semibold text-gray-700">Document Status Counts</h4>
          <div class="flex gap-1 ml-auto flex-wrap">
            <button @click="dashView = 'package'"    :class="['px-3 py-1 text-xs font-medium rounded transition-all', dashView === 'package'    ? 'bg-ips-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200']">By Package</button>
            <button @click="dashView = 'subservice'" :class="['px-3 py-1 text-xs font-medium rounded transition-all', dashView === 'subservice' ? 'bg-ips-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200']">By Sub-service</button>
            <button @click="dashView = 'area'"       :class="['px-3 py-1 text-xs font-medium rounded transition-all', dashView === 'area'       ? 'bg-ips-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200']">By Area</button>
            <button @click="dashView = 'unit'"       :class="['px-3 py-1 text-xs font-medium rounded transition-all', dashView === 'unit'       ? 'bg-ips-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200']">By Unit</button>
          </div>
        </div>

        <div class="overflow-x-auto">
        <!-- shared table structure via reusable template -->
        <!-- By Package -->
        <table v-if="dashView === 'package'" class="w-full text-sm min-w-[960px]">
          <thead class="bg-gray-50 border-b border-gray-100">
            <tr class="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-2">Package</th>
              <th class="text-center px-3 py-2 w-20">Not Started</th>
              <th class="text-center px-3 py-2 w-20">In Progress</th>
              <th class="text-center px-3 py-2 w-20">In Review</th>
              <th class="text-center px-3 py-2 w-20">Approved</th>
              <th class="text-center px-3 py-2 w-20">Rejected</th>
              <th class="text-center px-3 py-2 w-20">Total</th>
              <th class="text-center px-3 py-2 w-24 border-l-4 border-gray-200">Late start</th>
              <th class="text-center px-3 py-2 w-24">Late 1st issue</th>
              <th class="text-center px-3 py-2 w-24">Late approval</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-if="!dashData.by_package.length"><td colspan="10" class="px-4 py-6 text-center text-gray-400 text-sm">No data for current filters.</td></tr>
            <tr v-for="row in dashData.by_package" :key="row.id" class="hover:bg-gray-50">
              <td class="px-4 py-2.5">
                <span class="px-2 py-0.5 rounded text-xs font-bold text-white mr-1.5" style="background:#1B4F8C">{{ row.tag }}</span>
                <span class="text-xs text-gray-500">{{ row.name }}</span>
              </td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-medium text-gray-600">{{ row.NOT_STARTED || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{{ row.IN_PROGRESS || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{{ row.IN_REVIEW || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{{ row.APPROVED || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{{ row.REJECTED || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center font-semibold text-gray-700 text-xs">{{ (row.NOT_STARTED||0)+(row.IN_PROGRESS||0)+(row.IN_REVIEW||0)+(row.APPROVED||0)+(row.APPROVED_WITH_COMMENTS||0)+(row.REJECTED||0) }}</td>
              <td class="px-3 py-2.5 text-center border-l-4 border-gray-100"><span v-if="row.late_start" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{{ row.late_start }}</span><span v-else class="text-xs text-gray-300">0</span></td>
              <td class="px-3 py-2.5 text-center"><span v-if="row.late_first_issue" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{{ row.late_first_issue }}</span><span v-else class="text-xs text-gray-300">0</span></td>
              <td class="px-3 py-2.5 text-center"><span v-if="row.late_approval" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{{ row.late_approval }}</span><span v-else class="text-xs text-gray-300">0</span></td>
            </tr>
          </tbody>
        </table>

        <!-- By Sub-service -->
        <table v-else-if="dashView === 'subservice'" class="w-full text-sm min-w-[960px]">
          <thead class="bg-gray-50 border-b border-gray-100">
            <tr class="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-2">Sub-service</th>
              <th class="text-center px-3 py-2 w-20">Not Started</th>
              <th class="text-center px-3 py-2 w-20">In Progress</th>
              <th class="text-center px-3 py-2 w-20">In Review</th>
              <th class="text-center px-3 py-2 w-20">Approved</th>
              <th class="text-center px-3 py-2 w-20">Rejected</th>
              <th class="text-center px-3 py-2 w-20">Total</th>
              <th class="text-center px-3 py-2 w-24 border-l-4 border-gray-200">Late start</th>
              <th class="text-center px-3 py-2 w-24">Late 1st issue</th>
              <th class="text-center px-3 py-2 w-24">Late approval</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-if="!dashData.by_subservice.length"><td colspan="10" class="px-4 py-6 text-center text-gray-400 text-sm">No data for current filters.</td></tr>
            <tr v-for="row in dashData.by_subservice" :key="row.id" class="hover:bg-gray-50">
              <td class="px-4 py-2.5">
                <span class="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded mr-1.5">{{ row.code }}</span>
                <span class="text-xs text-gray-500">{{ row.name }}</span>
              </td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-medium text-gray-600">{{ row.NOT_STARTED || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{{ row.IN_PROGRESS || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{{ row.IN_REVIEW || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{{ row.APPROVED || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{{ row.REJECTED || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center font-semibold text-gray-700 text-xs">{{ (row.NOT_STARTED||0)+(row.IN_PROGRESS||0)+(row.IN_REVIEW||0)+(row.APPROVED||0)+(row.APPROVED_WITH_COMMENTS||0)+(row.REJECTED||0) }}</td>
              <td class="px-3 py-2.5 text-center border-l-4 border-gray-100"><span v-if="row.late_start" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{{ row.late_start }}</span><span v-else class="text-xs text-gray-300">0</span></td>
              <td class="px-3 py-2.5 text-center"><span v-if="row.late_first_issue" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{{ row.late_first_issue }}</span><span v-else class="text-xs text-gray-300">0</span></td>
              <td class="px-3 py-2.5 text-center"><span v-if="row.late_approval" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{{ row.late_approval }}</span><span v-else class="text-xs text-gray-300">0</span></td>
            </tr>
          </tbody>
        </table>

        <!-- By Area -->
        <table v-else-if="dashView === 'area'" class="w-full text-sm min-w-[960px]">
          <thead class="bg-gray-50 border-b border-gray-100">
            <tr class="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-2">Area</th>
              <th class="text-center px-3 py-2 w-20">Not Started</th>
              <th class="text-center px-3 py-2 w-20">In Progress</th>
              <th class="text-center px-3 py-2 w-20">In Review</th>
              <th class="text-center px-3 py-2 w-20">Approved</th>
              <th class="text-center px-3 py-2 w-20">Rejected</th>
              <th class="text-center px-3 py-2 w-20">Total</th>
              <th class="text-center px-3 py-2 w-24 border-l-4 border-gray-200">Late start</th>
              <th class="text-center px-3 py-2 w-24">Late 1st issue</th>
              <th class="text-center px-3 py-2 w-24">Late approval</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-if="!dashData.by_area.length">
              <td colspan="10" class="px-4 py-6 text-center text-gray-400 text-sm">No documents with an area assigned{{ dashFilterPkg || dashFilterSS || dashFilterArea || dashFilterUnit ? ' for current filters' : '' }}.</td>
            </tr>
            <tr v-for="row in dashData.by_area" :key="row.id" class="hover:bg-gray-50">
              <td class="px-4 py-2.5">
                <span class="font-mono text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{{ row.tag }}</span>
              </td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-medium text-gray-600">{{ row.NOT_STARTED || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{{ row.IN_PROGRESS || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{{ row.IN_REVIEW || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{{ row.APPROVED || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{{ row.REJECTED || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center font-semibold text-gray-700 text-xs">{{ (row.NOT_STARTED||0)+(row.IN_PROGRESS||0)+(row.IN_REVIEW||0)+(row.APPROVED||0)+(row.APPROVED_WITH_COMMENTS||0)+(row.REJECTED||0) }}</td>
              <td class="px-3 py-2.5 text-center border-l-4 border-gray-100"><span v-if="row.late_start" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{{ row.late_start }}</span><span v-else class="text-xs text-gray-300">0</span></td>
              <td class="px-3 py-2.5 text-center"><span v-if="row.late_first_issue" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{{ row.late_first_issue }}</span><span v-else class="text-xs text-gray-300">0</span></td>
              <td class="px-3 py-2.5 text-center"><span v-if="row.late_approval" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{{ row.late_approval }}</span><span v-else class="text-xs text-gray-300">0</span></td>
            </tr>
          </tbody>
        </table>

        <!-- By Unit -->
        <table v-else-if="dashView === 'unit'" class="w-full text-sm min-w-[960px]">
          <thead class="bg-gray-50 border-b border-gray-100">
            <tr class="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th class="text-left px-4 py-2">Unit</th>
              <th class="text-center px-3 py-2 w-20">Not Started</th>
              <th class="text-center px-3 py-2 w-20">In Progress</th>
              <th class="text-center px-3 py-2 w-20">In Review</th>
              <th class="text-center px-3 py-2 w-20">Approved</th>
              <th class="text-center px-3 py-2 w-20">Rejected</th>
              <th class="text-center px-3 py-2 w-20">Total</th>
              <th class="text-center px-3 py-2 w-24 border-l-4 border-gray-200">Late start</th>
              <th class="text-center px-3 py-2 w-24">Late 1st issue</th>
              <th class="text-center px-3 py-2 w-24">Late approval</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-if="!dashData.by_unit.length">
              <td colspan="10" class="px-4 py-6 text-center text-gray-400 text-sm">No documents with a unit assigned{{ dashFilterPkg || dashFilterSS || dashFilterArea || dashFilterUnit ? ' for current filters' : '' }}.</td>
            </tr>
            <tr v-for="row in dashData.by_unit" :key="row.id" class="hover:bg-gray-50">
              <td class="px-4 py-2.5">
                <span class="font-mono text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{{ row.tag }}</span>
              </td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-medium text-gray-600">{{ row.NOT_STARTED || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{{ row.IN_PROGRESS || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{{ row.IN_REVIEW || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{{ row.APPROVED || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center"><span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{{ row.REJECTED || 0 }}</span></td>
              <td class="px-3 py-2.5 text-center font-semibold text-gray-700 text-xs">{{ (row.NOT_STARTED||0)+(row.IN_PROGRESS||0)+(row.IN_REVIEW||0)+(row.APPROVED||0)+(row.APPROVED_WITH_COMMENTS||0)+(row.REJECTED||0) }}</td>
              <td class="px-3 py-2.5 text-center border-l-4 border-gray-100"><span v-if="row.late_start" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{{ row.late_start }}</span><span v-else class="text-xs text-gray-300">0</span></td>
              <td class="px-3 py-2.5 text-center"><span v-if="row.late_first_issue" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{{ row.late_first_issue }}</span><span v-else class="text-xs text-gray-300">0</span></td>
              <td class="px-3 py-2.5 text-center"><span v-if="row.late_approval" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{{ row.late_approval }}</span><span v-else class="text-xs text-gray-300">0</span></td>
            </tr>
          </tbody>
        </table>
        </div><!-- /.overflow-x-auto -->
      </div>

      <!-- S-Curve card -->
      <div class="card p-0 overflow-hidden">
        <div class="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
          <h4 class="text-sm font-semibold text-gray-700">Document Delivery S-Curve</h4>
          <span class="text-xs text-gray-400">Forecast vs. Actual — weighted by document weight</span>
          <span class="text-[11px] text-gray-400 italic ml-auto">Actual progress is anchored on each document's <strong>first approval</strong>; later re-reviews don't shift the curve.</span>
        </div>
        <div class="px-4 py-3 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 flex gap-6 flex-wrap">
          <span><strong>Milestones:</strong> In Progress = {{ setupSettings.doc_progress_started }}% · First Issue = {{ setupSettings.doc_progress_first_issued }}% · Appr. w/ Comments = {{ setupSettings.doc_progress_awc }}% · Approval = 100%</span>
          <span class="text-blue-400">Weights are set per document (default: 8)</span>
        </div>
        <div v-if="(dashData.scurve_docs || []).filter(d => d.start_date || d.approval_due_date).length === 0"
          class="text-center py-10 text-gray-400 text-sm">
          No documents have schedule dates set. Add Start Date and Approval Due Date to documents to populate this chart.
        </div>
        <div v-else class="p-4" style="height:380px">
          <canvas id="docSCurveChart"></canvas>
        </div>
      </div>

      <!-- Open Comments per Package chart -->
      <div class="card p-0 overflow-hidden">
        <div class="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
          <h4 class="text-sm font-semibold text-gray-700">Open Comments per Package</h4>
          <span class="text-xs text-gray-400">Comments in OPEN status across the current filter</span>
        </div>
        <div v-if="(dashData.by_package || []).filter(p => (p.open_comments || 0) > 0).length === 0"
          class="text-center py-10 text-gray-400 text-sm">
          No open comments for the current filters.
        </div>
        <div v-else class="p-4" style="height:320px">
          <canvas id="docOpenCommentsChart"></canvas>
        </div>
      </div>

      <!-- Open Comments Trend (weekly) -->
      <div class="card p-0 overflow-hidden">
        <div class="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
          <h4 class="text-sm font-semibold text-gray-700">Open Comments Trend</h4>
          <span class="text-xs text-gray-400">Running total of open comments at end of each week (+1 on creation, −1 on close/resolve)</span>
        </div>
        <div v-if="!(dashData.open_comments_timeline || []).length"
          class="text-center py-10 text-gray-400 text-sm">
          No comment history for the current filters.
        </div>
        <div v-else class="p-4" style="height:320px">
          <canvas id="docCommentsTrendChart"></canvas>
        </div>
      </div>

    </div>
  </template><!-- end dashboard tab -->

  <!-- ════════════════ COMMENT LOG TAB ════════════════ -->
  <template v-if="activeTab === 'comment-log' && canViewCommentLog">
    <div class="flex items-center gap-3 mb-4">
      <select v-model="allCommentsStatusFilter" @change="loadAllComments" class="input-field w-36">
        <option value="">All Statuses</option>
        <option value="OPEN">Open</option>
        <option value="CLOSED">Closed</option>
        <option value="RESOLVED">Resolved</option>
      </select>
      <span class="text-xs text-gray-400">{{ allComments.length }} comments</span>
      <button @click="loadAllComments" class="btn-secondary text-sm ml-auto">Refresh</button>
    </div>
    <div v-if="allCommentsLoading" class="text-center py-8 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="allComments.length === 0" class="card text-center py-10 text-gray-400">No comments found.</div>
    <div v-else class="card overflow-hidden p-0">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
            <th class="text-left px-4 py-2 font-semibold">Document</th>
            <th class="text-left px-4 py-2 font-semibold">Comment</th>
            <th class="text-left px-4 py-2 font-semibold">Author</th>
            <th class="text-center px-4 py-2 font-semibold">Version</th>
            <th class="text-center px-4 py-2 font-semibold">Page</th>
            <th class="text-center px-4 py-2 font-semibold">Status</th>
            <th class="text-left px-4 py-2 font-semibold">Date</th>
            <th class="text-center px-4 py-2 font-semibold">Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in allComments" :key="c.id" @click="openCommentDetail(c)"
              class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
            <td class="px-4 py-2">
              <span class="text-xs font-mono text-gray-500">{{ c.doc_number }}</span>
              <span class="block text-xs text-gray-400 truncate max-w-xs">{{ c.doc_description }}</span>
            </td>
            <td class="px-4 py-2 max-w-sm">
              <span class="text-xs text-gray-700 line-clamp-2">{{ c.text }}</span>
            </td>
            <td class="px-4 py-2 text-xs text-gray-600">{{ c.author_name }}</td>
            <td class="px-4 py-2 text-center text-xs text-gray-500">v{{ c.version }}</td>
            <td class="px-4 py-2 text-center text-xs text-gray-500">{{ c.page_number || '—' }}</td>
            <td class="px-4 py-2 text-center">
              <span :class="['text-xs font-medium px-1.5 py-0.5 rounded-full',
                c.status === 'OPEN' ? 'bg-amber-100 text-amber-700' :
                c.status === 'RESOLVED' ? 'bg-green-100 text-green-700' :
                'bg-gray-200 text-gray-600']">{{ c.status }}</span>
            </td>
            <td class="px-4 py-2 text-xs text-gray-400">{{ fmtDate(c.created_at) }}</td>
            <td class="px-4 py-2 text-center text-xs text-gray-500">{{ (c.notes || []).length }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>

  <!-- ════════════════ COMMENT DETAIL MODAL ════════════════ -->
  <div v-if="selectedComment" class="modal-overlay" @click.self="closeCommentDetail" style="z-index:130">
    <div class="modal-box" style="width:600px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <div>
          <p class="text-xs font-mono text-gray-400">{{ selectedComment.doc_number }}</p>
          <h3 class="text-lg font-semibold text-gray-800">Comment Detail</h3>
        </div>
        <button @click="closeCommentDetail" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="p-4 overflow-y-auto flex-1 space-y-4">
        <!-- Document info -->
        <div class="border-b border-gray-100 pb-3">
          <p class="text-xs text-gray-500 uppercase font-semibold mb-1">Document</p>
          <p class="text-sm text-gray-700">{{ selectedComment.doc_description }}</p>
        </div>

        <!-- Comment body -->
        <div class="border-b border-gray-100 pb-3">
          <div class="flex items-center gap-2 mb-2 flex-wrap">
            <span class="text-sm font-semibold text-gray-700">{{ selectedComment.author_name }}</span>
            <span class="text-xs text-gray-400">v{{ selectedComment.version }}</span>
            <span v-if="selectedComment.page_number" class="text-xs text-blue-600">p.{{ selectedComment.page_number }}</span>
            <span :class="['text-xs font-medium px-1.5 py-0.5 rounded-full',
              selectedComment.status === 'OPEN' ? 'bg-amber-100 text-amber-700' :
              selectedComment.status === 'RESOLVED' ? 'bg-green-100 text-green-700' :
              'bg-gray-200 text-gray-600']">{{ selectedComment.status }}</span>
            <span class="text-xs text-gray-400 ml-auto">{{ fmtDateTime(selectedComment.created_at) }}</span>
          </div>
          <p class="text-sm text-gray-800 whitespace-pre-wrap">{{ selectedComment.text }}</p>

          <!-- Status actions -->
          <div v-if="canChangeCommentStatus(selectedComment)" class="flex items-center gap-2 mt-3">
            <button v-if="selectedComment.status === 'OPEN'" @click="updateCommentDetailStatus('RESOLVED')"
              :disabled="commentStatusSaving"
              class="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">Resolve</button>
            <button v-if="selectedComment.status === 'OPEN'" @click="updateCommentDetailStatus('CLOSED')"
              :disabled="commentStatusSaving"
              class="text-xs px-2 py-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-50">Close</button>
            <button v-if="selectedComment.status !== 'OPEN'" @click="updateCommentDetailStatus('OPEN')"
              :disabled="commentStatusSaving"
              class="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50">Re-open</button>
          </div>
        </div>

        <!-- Notes -->
        <div>
          <p class="text-xs text-gray-500 uppercase font-semibold mb-2">Notes</p>
          <div v-if="!selectedComment.notes || selectedComment.notes.length === 0" class="text-xs text-gray-400 mb-2">No notes yet.</div>
          <div v-else class="space-y-2 mb-3">
            <div v-for="n in selectedComment.notes" :key="n.id" class="text-xs flex gap-2 border-l-2 border-gray-200 pl-2">
              <span class="font-semibold text-gray-600 shrink-0">{{ n.author_name }}:</span>
              <span class="text-gray-600 flex-1 whitespace-pre-wrap">{{ n.content }}</span>
              <span class="text-gray-400 shrink-0">{{ fmtDateTime(n.created_at) }}</span>
            </div>
          </div>

          <!-- Add note -->
          <div class="flex gap-2">
            <input v-model="commentNoteText" type="text" class="input-field text-xs py-1 flex-1"
              placeholder="Add a note..." @keyup.enter="addCommentDetailNote"/>
            <button @click="addCommentDetailNote" :disabled="!commentNoteText.trim() || commentNoteSaving"
              class="px-3 py-1 text-xs rounded bg-ips-blue text-white hover:bg-ips-dark disabled:opacity-50">
              {{ commentNoteSaving ? '...' : 'Reply' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ════════════════ COMMENT LOG MODAL ════════════════ -->
  <div v-if="showCommentLogModal && commentLogDoc" class="modal-overlay" @click.self="showCommentLogModal = false" style="z-index:120">
    <div class="modal-box" style="width:98vw;max-width:98vw;height:95vh;max-height:95vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <div>
          <p class="text-xs font-mono text-gray-400">{{ commentLogDoc.doc_number }} · v{{ commentLogDoc.current_version }}</p>
          <h3 class="text-lg font-semibold text-gray-800">Comment Log</h3>
        </div>
        <button @click="showCommentLogModal = false" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div data-splitter-container style="flex:1;display:flex;overflow:hidden;min-height:0" :class="splitterDragging ? 'select-none' : ''">
        <!-- Left: PDF viewer (collapsible) -->
        <div :style="{ width: pdfViewerCollapsed ? '40px' : splitterPct + '%', position: 'relative' }" class="flex flex-col bg-gray-100 shrink-0">
          <div class="px-2 py-1.5 bg-gray-200 flex items-center gap-2 text-xs">
            <button @click="pdfViewerCollapsed = !pdfViewerCollapsed" class="text-gray-500 hover:text-gray-700" :title="pdfViewerCollapsed ? 'Expand viewer' : 'Collapse viewer'">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path v-if="pdfViewerCollapsed" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
                <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7M19 19l-7-7 7-7"/>
              </svg>
            </button>
            <template v-if="!pdfViewerCollapsed">
              <span class="text-gray-500 font-medium">Document Viewer</span>
              <div v-if="viewerUrl && viewerIsPdf" class="flex items-center gap-1 ml-auto">
                <button @click="navigateToPage(pdfViewerPage - 1)" :disabled="pdfViewerPage <= 1"
                  class="px-1 py-0.5 rounded hover:bg-gray-300 disabled:opacity-30 text-gray-600">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <span class="text-gray-500">Page</span>
                <input type="number" :value="pdfViewerPage" min="1"
                  @change="navigateToPage(parseInt($event.target.value) || 1)"
                  @keyup.enter="navigateToPage(parseInt($event.target.value) || 1)"
                  class="w-10 text-center text-xs py-0.5 border border-gray-300 rounded"/>
                <button @click="navigateToPage(pdfViewerPage + 1)"
                  class="px-1 py-0.5 rounded hover:bg-gray-300 text-gray-600">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
              <span v-else class="text-gray-400 ml-auto">Page {{ pdfViewerPage }}</span>
            </template>
          </div>
          <div v-if="!pdfViewerCollapsed" class="flex-1 overflow-auto">
            <div v-if="viewerLoading" class="flex items-center justify-center h-full"><img src="/static/assets/impulse-loader.svg" class="h-8" alt="Loading"/></div>
            <div v-else-if="viewerUrl && viewerIsPdf" class="h-full">
              <iframe :key="'pdf-' + viewerKey" :src="viewerUrl + '#page=' + pdfViewerPage + '&toolbar=0&navpanes=0&scrollbar=1&view=FitH'" class="w-full h-full border-0"></iframe>
            </div>
            <div v-else-if="viewerUrl && viewerIsImage" class="h-full flex items-center justify-center p-2">
              <img :src="viewerUrl" :alt="viewerName" class="max-w-full max-h-full object-contain"/>
            </div>
            <div v-else-if="viewerUrl" class="flex flex-col items-center justify-center h-full text-gray-400 text-xs gap-2">
              <p>This file type cannot be previewed inline.</p>
              <a :href="viewerUrl" :download="viewerName" class="text-ips-blue hover:underline">Download {{ viewerName }}</a>
            </div>
            <div v-else class="flex items-center justify-center h-full text-gray-400 text-xs p-4 text-center">
              Click "View" on an attachment to open it here.<br>
              PDF and image files can be viewed inline.
            </div>
          </div>
          <!-- iframe pointer blocker while dragging -->
          <div v-if="splitterDragging && !pdfViewerCollapsed" style="position:absolute;inset:0;z-index:10"></div>
        </div>

        <!-- Draggable splitter handle -->
        <div v-if="!pdfViewerCollapsed" @mousedown.prevent="onSplitterDown" @touchstart.prevent="onSplitterDown"
          class="w-1.5 cursor-col-resize bg-gray-200 hover:bg-ips-blue transition-colors shrink-0 relative"
          style="z-index:5">
          <div class="absolute inset-y-0 -left-1 -right-1"></div>
        </div>

        <!-- Right: Attachments + Comments -->
        <div style="flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden">
          <!-- Attachments section -->
          <div class="border-b border-gray-200 p-3" style="max-height:220px;overflow-y:auto">
            <div class="flex items-center gap-2 mb-2">
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Attachments</p>
              <select v-model="commentLogSelectedVersion" class="input-field text-xs py-0.5 w-36 ml-auto">
                <option v-for="v in commentLogVersions" :key="v.id" :value="v.id">
                  Version {{ v.version }}{{ v.version === (commentLogDoc && commentLogDoc.current_version) ? ' (latest)' : '' }}
                </option>
              </select>
            </div>
            <file-attachments v-if="commentLogSelectedVersion"
              record-type="document_version"
              :record-id="commentLogSelectedVersion"
              :can-edit="commentLogSelectedVersion === (commentLogVersions.length > 0 ? commentLogVersions[0].id : null)"
              :external-viewer="true"
              :hide-camera="true"
              @view-file="onViewFile"></file-attachments>
          </div>

          <!-- Comments section -->
          <div class="flex-1 overflow-hidden p-3 flex flex-col" style="min-height:0">
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Comments</p>
            <document-comment-log
              :doc-id="commentLogDocId"
              :current-version="commentLogDoc ? commentLogDoc.current_version : 0"
              :current-user="currentUser"
              :initial-page="pdfViewerPage"
              :viewer-filename="viewerName"
              @navigate-page="navigateToPage($event)"
            ></document-comment-log>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ════════════════ SETUP TAB ════════════════ -->
  <template v-if="activeTab === 'setup'">
    <div class="space-y-6 max-w-xl">
      <div class="card p-6">
        <h3 class="text-base font-semibold text-gray-800 mb-1">Document Progress Percentages</h3>
        <p class="text-xs text-gray-500 mb-5">
          Configure the weighted progress contribution for each document status milestone.
          These values are used in the S-curve forecast and actual progress calculations.
        </p>

        <div class="space-y-4">
          <!-- NOT_STARTED — fixed at 0% -->
          <div class="flex items-center gap-4">
            <label class="w-48 text-sm font-medium text-gray-700">Not Started</label>
            <div class="flex-1 flex items-center gap-2">
              <input type="number" value="0" disabled class="input-field w-24 bg-gray-100 text-gray-400 cursor-not-allowed" />
              <span class="text-sm text-gray-400">% (fixed)</span>
            </div>
          </div>

          <!-- IN PROGRESS -->
          <div class="flex items-center gap-4">
            <label class="w-48 text-sm font-medium text-gray-700">In Progress</label>
            <div class="flex-1 flex items-center gap-2">
              <input type="number" v-model.number="setupSettings.doc_progress_started"
                min="1" max="99" class="input-field w-24" />
              <span class="text-sm text-gray-500">%</span>
            </div>
          </div>

          <!-- FIRST ISSUED (IN_REVIEW) -->
          <div class="flex items-center gap-4">
            <label class="w-48 text-sm font-medium text-gray-700">First Issued (In Review)</label>
            <div class="flex-1 flex items-center gap-2">
              <input type="number" v-model.number="setupSettings.doc_progress_first_issued"
                min="1" max="99" class="input-field w-24" />
              <span class="text-sm text-gray-500">%</span>
            </div>
          </div>

          <!-- APPROVED WITH COMMENTS -->
          <div class="flex items-center gap-4">
            <label class="w-48 text-sm font-medium text-gray-700">Approved with Comments</label>
            <div class="flex-1 flex items-center gap-2">
              <input type="number" v-model.number="setupSettings.doc_progress_awc"
                min="1" max="99" class="input-field w-24" />
              <span class="text-sm text-gray-500">%</span>
            </div>
          </div>

          <!-- APPROVED — fixed at 100% -->
          <div class="flex items-center gap-4">
            <label class="w-48 text-sm font-medium text-gray-700">Approved</label>
            <div class="flex-1 flex items-center gap-2">
              <input type="number" value="100" disabled class="input-field w-24 bg-gray-100 text-gray-400 cursor-not-allowed" />
              <span class="text-sm text-gray-400">% (fixed)</span>
            </div>
          </div>
        </div>

        <div class="mt-6 flex items-center gap-3">
          <button @click="saveSetupSettings" :disabled="setupSaving" class="btn-primary disabled:opacity-50">
            {{ setupSaving ? 'Saving…' : 'Save Settings' }}
          </button>
          <span v-if="setupSuccess" class="text-sm text-green-600 font-medium">Saved successfully.</span>
          <span v-if="setupError" class="text-sm text-red-600">{{ setupError }}</span>
        </div>
      </div>
    </div>
  </template><!-- end setup tab -->

  <!-- ═══════════════════════════════════════════════════════
       CREATE / EDIT MODAL
  ════════════════════════════════════════════════════════ -->
  <div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
    <div class="modal-box modal-2xl">
      <div class="modal-header">
        <h3 class="text-lg font-semibold text-gray-800">{{ editingDoc ? 'Edit Document' : 'New Document' }}</h3>
        <button @click="showForm = false" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body" style="padding:0;display:flex;overflow:hidden">
      <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
      <div class="space-y-5">

        <!-- Mandatory fields -->
        <div>
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Document Identity</p>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label">Package *</label>
              <select v-model="docForm.package_id" class="input-field">
                <option :value="null">— Select package —</option>
                <option v-for="p in selectablePackagesForForm" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
              </select>
            </div>
            <div>
              <label class="form-label">Sub-service *</label>
              <select v-model="docForm.subservice_id" class="input-field">
                <option :value="null">— Select sub-service —</option>
                <option v-for="s in subservices" :key="s.id" :value="s.id">{{ s.subservice_code }} — {{ s.subservice_name }}</option>
              </select>
            </div>
            <div>
              <label class="form-label">Document Type *</label>
              <select v-model="docForm.document_type" class="input-field">
                <option value="TECHNICAL">Technical</option>
                <option value="COMMERCIAL">Commercial</option>
              </select>
            </div>
            <div>
              <label class="form-label">Description *</label>
              <input v-model="docForm.description" type="text" class="input-field" placeholder="Document description"/>
            </div>
          </div>
        </div>

        <!-- Optional location -->
        <div>
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Area and Unit</p>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label">Area</label>
              <select v-model="docForm.area_id" @change="onAreaSelected" class="input-field">
                <option :value="null">— None —</option>
                <option v-for="a in areas" :key="a.id" :value="a.id">{{ a.tag }} — {{ a.description }}</option>
              </select>
              <label v-if="docForm.area_id" class="flex items-center gap-2 mt-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" v-model="docForm.require_area_review" class="w-4 h-4" style="accent-color:#00AEEF"/>
                Require Area Owner review
              </label>
            </div>
            <div>
              <label class="form-label">Unit</label>
              <select v-model="docForm.unit_id" @change="onUnitSelected" class="input-field">
                <option :value="null">— None —</option>
                <option v-for="u in units" :key="u.id" :value="u.id">{{ u.tag }} — {{ u.description }}</option>
              </select>
              <label v-if="docForm.unit_id" class="flex items-center gap-2 mt-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" v-model="docForm.require_unit_review" class="w-4 h-4" style="accent-color:#00AEEF"/>
                Require Unit Owner review
              </label>
            </div>
          </div>
        </div>

        <!-- Schedule -->
        <div>
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Schedule &amp; Weight (optional)</p>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="form-label">Start Date</label>
              <input v-model="docForm.start_date" type="date" class="input-field"/>
            </div>
            <div>
              <label class="form-label">First Issue Date</label>
              <input v-model="docForm.first_issue_date" type="date" class="input-field"/>
            </div>
            <div>
              <label class="form-label">Approval Due Date</label>
              <input v-model="docForm.approval_due_date" type="date" class="input-field"/>
            </div>
          </div>
          <div class="mt-3 flex items-center gap-3">
            <div class="w-36">
              <label class="form-label">S-Curve Weight</label>
              <input v-model.number="docForm.weight" type="number" min="1" class="input-field" placeholder="8"/>
            </div>
            <p class="text-xs text-gray-400 mt-4">Relative weight used in the document delivery S-curve. Default is 8.</p>
          </div>
        </div>

        <!-- Distribution -->
        <div>
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Distribution</p>
          <p class="text-xs text-gray-400 mb-2">Packages that receive read-only access when this document is approved.</p>
          <div class="border border-gray-200 rounded-lg max-h-36 overflow-y-auto">
            <label v-for="p in packages" :key="p.id"
              class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 text-sm">
              <input type="checkbox" :value="p.id" v-model="docForm.distribution_package_ids" class="w-4 h-4" style="accent-color:#00AEEF"/>
              <span class="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded mr-1">{{ p.tag_number }}</span>
              {{ p.name }}
            </label>
          </div>
        </div>

        <!-- Reviewer preview -->
        <div v-if="formReviewerPreview.length > 0">
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Reviewer Preview</p>
          <div class="bg-blue-50 rounded-lg p-3 space-y-1">
            <div v-for="r in formReviewerPreview" :key="r.contact_id" class="flex items-center gap-2 text-sm">
              <span class="text-blue-700 font-medium">{{ r.name }}</span>
              <span class="text-blue-400 text-xs">— {{ r.role }}</span>
            </div>
          </div>
        </div>
        <div v-else-if="docForm.package_id && docForm.subservice_id" class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          No reviewers found for this combination. Assign reviewers to the package and sub-service in Project Organization.
        </div>

        <p v-if="docError" class="text-red-500 text-sm">{{ docError }}</p>
      </div><!-- end space-y-5 -->
      </div><!-- end left column -->
      <div class="w-[28rem] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
        <file-attachments v-if="editingDoc && editingDoc.current_version_id" record-type="document_version" :record-id="editingDoc.current_version_id" :can-edit="true" :hide-camera="true"></file-attachments>
      </div>
      </div><!-- end modal-body -->
      <div class="modal-footer">
        <button @click="showForm = false" class="btn-secondary">Cancel</button>
        <button v-if="!editingDoc" @click="saveDoc" :disabled="savingDoc" class="btn-primary">
          {{ savingDoc ? 'Saving…' : 'Save' }}
        </button>
        <button v-else-if="editingDoc._justCreated" @click="showForm = false" class="btn-primary">
          Create Document
        </button>
        <button v-else @click="saveDoc" :disabled="savingDoc" class="btn-primary">
          {{ savingDoc ? 'Saving…' : 'Save Changes' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       DETAIL MODAL
  ════════════════════════════════════════════════════════ -->
  <div v-if="selectedDoc" class="modal-overlay" @click.self="selectedDoc = null">
    <div class="modal-box modal-xl" style="max-height:90vh;overflow-y:auto">
      <div class="modal-header" style="display:flex;align-items:center;gap:12px">
        <div class="flex-1 min-w-0">
          <p class="text-xs font-mono text-gray-400">{{ selectedDoc.doc_number }} · v{{ selectedDoc.current_version }}</p>
          <h3 class="text-lg font-semibold text-gray-800 truncate">{{ selectedDoc.description }}</h3>
        </div>

        <!-- CENTER: prominent Open Comment Log button with open-comment counter -->
        <button @click="openCommentLog(selectedDoc)"
          class="relative flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 shadow transition-colors flex-shrink-0">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg>
          <span>OPEN COMMENT LOG</span>
          <span v-if="selectedDoc.open_comments_count > 0"
            class="ml-1 min-w-[22px] h-5 px-1.5 rounded-full bg-white text-amber-700 text-xs font-bold flex items-center justify-center leading-none">
            {{ selectedDoc.open_comments_count }}
          </span>
        </button>

        <div class="flex items-center gap-2 flex-1 justify-end">
          <span :class="['text-xs font-semibold px-2 py-1 rounded-full', typeBadge(selectedDoc.document_type)]">{{ selectedDoc.document_type }}</span>
          <span :class="['text-xs font-semibold px-2 py-1 rounded-full', docStatusBadge(selectedDoc)]">{{ docStatusLabel(selectedDoc) }}</span>
          <button @click="showVersionHistoryModal = true"
            class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded"
            title="Show version history">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            History
          </button>
          <button @click="selectedDoc = null" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="modal-body" style="padding:0;display:flex;overflow:hidden">
      <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
      <div class="space-y-5">

        <!-- Metadata grid -->
        <div class="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-4">
          <div><span class="text-gray-500">Package:</span>
            <span class="ml-1 font-semibold">{{ selectedDoc.package_tag }}</span>
            <span class="ml-1 text-gray-600">{{ selectedDoc.package_name }}</span>
          </div>
          <div><span class="text-gray-500">Sub-service:</span>
            <span class="ml-1 font-mono text-xs bg-gray-200 px-1.5 py-0.5 rounded">{{ selectedDoc.subservice_code }}</span>
            <span class="ml-1 text-gray-600">{{ selectedDoc.subservice_name }}</span>
          </div>
          <div v-if="selectedDoc.area_tag"><span class="text-gray-500">Area:</span> <span class="ml-1">{{ selectedDoc.area_tag }}</span>
            <span v-if="selectedDoc.require_area_review" class="ml-1 text-xs text-blue-600">(review required)</span>
          </div>
          <div v-if="selectedDoc.unit_tag"><span class="text-gray-500">Unit:</span> <span class="ml-1">{{ selectedDoc.unit_tag }}</span>
            <span v-if="selectedDoc.require_unit_review" class="ml-1 text-xs text-blue-600">(review required)</span>
          </div>
          <div v-if="selectedDoc.start_date"><span class="text-gray-500">Start:</span> <span class="ml-1">{{ fmtDate(selectedDoc.start_date) }}</span></div>
          <div v-if="selectedDoc.first_issue_date"><span class="text-gray-500">First Issue:</span> <span class="ml-1">{{ fmtDate(selectedDoc.first_issue_date) }}</span></div>
          <div v-if="selectedDoc.approval_due_date"><span class="text-gray-500">Approval Due:</span> <span class="ml-1 font-medium">{{ fmtDate(selectedDoc.approval_due_date) }}</span></div>
          <div><span class="text-gray-500">Created by:</span> <span class="ml-1">{{ selectedDoc.created_by_name }}</span></div>
          <div v-if="selectedDoc.distribution_package_ids && selectedDoc.distribution_package_ids.length > 0">
            <span class="text-gray-500">Distribution:</span>
            <span v-for="pid in selectedDoc.distribution_package_ids" :key="pid" class="ml-1 px-1.5 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">
              {{ (packages.find(p=>p.id===pid)||{}).tag_number || pid }}
            </span>
          </div>
        </div>

        <!-- Latest Version block — attachments, compact reviews, compact receipts. -->
        <div class="rounded-lg border border-gray-200 overflow-hidden">
          <div class="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Version {{ selectedDoc.current_version }}</span>
              <span class="text-[11px] text-gray-400">latest</span>
            </div>
          </div>
          <div class="p-4 space-y-4">
            <!-- Attachments (current version) -->
            <div v-if="currentVersionRow && currentVersionRow.id">
              <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Attachments</p>
              <file-attachments record-type="document_version" :record-id="currentVersionRow.id"
                :can-edit="canWriteDoc(selectedDoc.package_id) && !selectedDoc.distribution_view"
                :hide-camera="true">
              </file-attachments>
            </div>

            <!-- Compact reviews — one chip per reviewer, click to expand comment/date -->
            <div v-if="selectedDoc.reviews && selectedDoc.reviews.length > 0">
              <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Approval Status</p>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="r in selectedDoc.reviews" :key="r.id"
                  @click="expandedReviewId = expandedReviewId === r.id ? null : r.id"
                  :class="['inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                            reviewBadge(r.status), 'hover:brightness-95']"
                  :title="r.reviewer_role + ' — ' + r.status">
                  <span class="font-semibold">{{ r.reviewer_name }}</span>
                  <span class="opacity-60">·</span>
                  <span class="opacity-80">{{ r.status }}</span>
                </button>
              </div>
              <!-- Inline expansion of the active reviewer chip -->
              <template v-for="r in selectedDoc.reviews" :key="'exp-' + r.id">
                <div v-if="expandedReviewId === r.id"
                  :class="['mt-2 rounded-lg p-3 text-xs border', reviewBadge(r.status)]">
                  <div class="flex items-center justify-between">
                    <div>
                      <span class="font-semibold">{{ r.reviewer_name }}</span>
                      <span class="ml-2 opacity-70">{{ r.reviewer_role }}</span>
                    </div>
                    <span class="font-semibold">{{ r.status }}</span>
                  </div>
                  <p v-if="r.comment" class="mt-1 italic opacity-80">{{ r.comment }}</p>
                  <p v-if="r.reviewed_at" class="mt-0.5 opacity-60">{{ fmtDate(r.reviewed_at) }}<span v-if="r.reviewed_by_name"> by {{ r.reviewed_by_name }}</span></p>
                </div>
              </template>
            </div>

            <!-- Compact receipts — one row per package -->
            <div v-if="selectedDoc.receipts && selectedDoc.receipts.length > 0">
              <p class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Receipt Acknowledgments
                <span v-if="selectedDoc.last_approved_version" class="text-gray-300 font-normal normal-case ml-1">
                  (V{{ selectedDoc.last_approved_version }})
                </span>
              </p>
              <div class="border border-gray-100 rounded-lg divide-y divide-gray-50 text-sm">
                <div v-for="rc in selectedDoc.receipts" :key="rc.id"
                  class="flex items-center gap-2 px-3 py-1.5">
                  <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style="background:#1B4F8C">{{ rc.package_tag }}</span>
                  <span class="flex-1 text-xs text-gray-600 truncate" :title="rc.package_name">{{ rc.package_name }}</span>
                  <template v-if="rc.acknowledged">
                    <span class="text-[11px] text-green-700 font-semibold flex items-center gap-1">
                      <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                      {{ fmtDate(rc.acknowledged_at) }}
                    </span>
                  </template>
                  <template v-else>
                    <span class="text-[11px] text-gray-400">Pending</span>
                    <button v-if="canAcknowledgeReceipt(rc)" @click="acknowledgeReceipt(rc)"
                      class="px-2 py-0.5 rounded text-[11px] font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors">
                      Acknowledge
                    </button>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- My review form -->
        <div v-if="myPendingReview && !showReviewForm" class="border border-blue-200 bg-blue-50 rounded-lg p-4">
          <p class="text-sm font-semibold text-blue-800 mb-2">You have a pending review ({{ myPendingReview.reviewer_role }})</p>
          <button @click="showReviewForm = true" class="btn-primary text-sm">Submit My Review</button>
        </div>
        <div v-if="showReviewForm" class="border-t pt-4">
          <h4 class="font-semibold text-gray-800 mb-3">Submit Review — {{ myPendingReview && myPendingReview.reviewer_role }}</h4>
          <div class="flex gap-3 mb-3">
            <button @click="reviewForm.review_status = 'APPROVED'"
              :class="['flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all',
                reviewForm.review_status === 'APPROVED' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500']">
              ✓ Approve
            </button>
            <button @click="reviewForm.review_status = 'APPROVED_WITH_COMMENTS'"
              :class="['flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all',
                reviewForm.review_status === 'APPROVED_WITH_COMMENTS' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-500']">
              ~ Approved with Comments
            </button>
            <button @click="reviewForm.review_status = 'REJECTED'"
              :class="['flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all',
                reviewForm.review_status === 'REJECTED' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500']">
              ✗ Reject
            </button>
          </div>
          <textarea v-model="reviewForm.comment" class="input-field mb-2" rows="3"
            :placeholder="reviewForm.review_status === 'REJECTED' ? 'Reason for rejection…' : 'Comments…'"></textarea>
          <p v-if="reviewError" class="text-red-500 text-sm mb-2">{{ reviewError }}</p>
          <div class="flex gap-2">
            <button @click="showReviewForm = false; reviewError = ''" class="btn-secondary">Cancel</button>
            <button @click="submitReview" :disabled="reviewSaving"
              :class="['px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50',
                reviewForm.review_status === 'APPROVED' ? 'bg-green-600 text-white hover:bg-green-700' :
                reviewForm.review_status === 'APPROVED_WITH_COMMENTS' ? 'bg-orange-500 text-white hover:bg-orange-600' :
                'bg-red-600 text-white hover:bg-red-700']">
              {{ reviewSaving ? 'Submitting…' : (reviewForm.review_status === 'APPROVED' ? 'Approve' : reviewForm.review_status === 'APPROVED_WITH_COMMENTS' ? 'Approve with Comments' : 'Reject') }}
            </button>
          </div>
        </div>

        <p v-if="actionError" class="text-red-500 text-sm">{{ actionError }}</p>
      </div><!-- end space-y-5 -->
      </div><!-- end left column -->
      </div><!-- end modal-body -->

      <!-- Footer actions -->
      <div class="modal-footer flex-wrap gap-2">
        <button v-if="canOverride" @click="overrideApproval" :disabled="actionLoading"
          class="px-3 py-1.5 text-sm font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">
          Override Decision
        </button>
        <button v-if="canNewVersion" @click="createNewVersion" :disabled="actionLoading" class="btn-secondary">
          New Version
        </button>
        <button v-if="canEditSelected" @click="openEditForm(selectedDoc)" class="btn-secondary">Edit</button>
        <button v-if="canDeleteSelected" @click="deleteDoc(selectedDoc)" class="text-sm font-semibold text-red-500 hover:text-red-700 px-2">Delete</button>
        <button @click="selectedDoc = null" class="btn-secondary ml-auto">Close</button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       VERSION HISTORY MODAL — standalone, opened from the detail
       form's "View History" link. Holds the full per-version
       breakdown so the detail form itself can stay compact.
  ════════════════════════════════════════════════════════ -->
  <div v-if="showVersionHistoryModal && selectedDoc" class="modal-overlay" @click.self="showVersionHistoryModal = false" style="z-index:130">
    <div class="modal-box modal-xl" style="max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <div>
          <p class="text-xs font-mono text-gray-400">{{ selectedDoc.doc_number }}</p>
          <h3 class="text-lg font-semibold text-gray-800">Version History</h3>
        </div>
        <div class="flex items-center gap-2">
          <button @click="loadHistory" class="text-xs text-ips-blue hover:underline">Refresh</button>
          <button @click="showVersionHistoryModal = false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <div class="modal-body space-y-3">
        <div v-if="historyLoading" class="text-center py-6"><img src="/static/assets/impulse-loader.svg" class="h-6 mx-auto" alt="Loading"/></div>
        <div v-else-if="!history || history.length === 0" class="text-center py-6 text-gray-400 text-sm">No version history yet.</div>
        <div v-else>
          <div v-for="ver in history" :key="ver.version" class="border border-gray-200 rounded-lg overflow-hidden mb-3">
            <div class="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 flex-wrap gap-2">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-sm">Version {{ ver.version }}</span>
                <span v-if="ver.version === selectedDoc.current_version" class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">latest</span>
                <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', statusBadge(ver.status)]">{{ statusLabel(ver.status) }}</span>
              </div>
              <span class="text-xs text-gray-400">
                <template v-if="ver.launched_at">Launched {{ fmtDate(ver.launched_at) }} by {{ ver.launched_by_name }}</template>
                <template v-else>Draft — not yet launched</template>
                <template v-if="ver.completed_at"> · Completed {{ fmtDate(ver.completed_at) }}</template>
              </span>
            </div>
            <div v-if="ver.id" class="px-4 py-2 border-b border-gray-100 bg-white">
              <p class="text-xs text-gray-400 font-semibold uppercase mb-1">Attachments — V{{ String(ver.version).padStart(2,'0') }}</p>
              <file-attachments record-type="document_version" :record-id="ver.id"
                :can-edit="ver.version === selectedDoc.current_version && canWriteDoc(selectedDoc.package_id) && !selectedDoc.distribution_view"
                :hide-camera="true">
              </file-attachments>
            </div>
            <div v-if="ver.reviews && ver.reviews.length > 0" class="divide-y divide-gray-50">
              <div v-for="r in ver.reviews" :key="r.id" :class="['px-4 py-2 text-xs flex items-start gap-3 flex-wrap', reviewBadge(r.status)]">
                <div class="flex-1 min-w-[160px]">
                  <span class="font-semibold">{{ r.reviewer_name }}</span>
                  <span class="ml-1 opacity-60">{{ r.reviewer_role }}</span>
                </div>
                <div class="text-right shrink-0">
                  <span class="font-semibold">{{ r.status }}</span>
                  <span v-if="r.reviewed_at" class="ml-1 opacity-60">{{ fmtDate(r.reviewed_at) }}</span>
                </div>
                <div v-if="r.comment" class="w-full italic opacity-70 mt-0.5">{{ r.comment }}</div>
              </div>
            </div>
            <div v-else class="px-4 py-2 text-xs text-gray-400">No reviews recorded.</div>
            <!-- Per-version receipt acknowledgments — only the receipts that
                 belong to this approved version are shown here. -->
            <div v-if="receiptsForVersion(ver).length > 0" class="border-t border-gray-100 bg-white px-4 py-2">
              <p class="text-xs text-gray-400 font-semibold uppercase mb-1">Receipt Acknowledgments</p>
              <div class="text-sm divide-y divide-gray-50">
                <div v-for="rc in receiptsForVersion(ver)" :key="rc.id" class="flex items-center gap-2 py-1.5">
                  <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style="background:#1B4F8C">{{ rc.package_tag }}</span>
                  <span class="flex-1 text-xs text-gray-600 truncate" :title="rc.package_name">{{ rc.package_name }}</span>
                  <span v-if="rc.acknowledged" class="text-[11px] text-green-700 font-semibold">{{ fmtDate(rc.acknowledged_at) }}</span>
                  <span v-else class="text-[11px] text-gray-400">Pending</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button @click="showVersionHistoryModal = false" class="btn-secondary">Close</button>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════
       OVERRIDE MODAL
  ════════════════════════════════════════════════════════ -->
  <div v-if="showOverrideModal" class="modal-overlay" @click.self="showOverrideModal = false">
    <div class="modal-box" style="max-width:480px">
      <div class="modal-header">
        <div>
          <h3 class="text-lg font-semibold text-gray-800">Override Decision</h3>
          <p class="text-xs text-gray-400 mt-0.5">{{ overrideTarget && overrideTarget.doc_number }}</p>
        </div>
        <button @click="showOverrideModal = false" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body space-y-4">
        <p class="text-sm text-gray-600">This will immediately close the review and set the document status. All pending reviewer decisions will be overridden.</p>
        <div class="flex gap-3">
          <button @click="overrideForm.decision = 'APPROVED'"
            :class="['flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all',
              overrideForm.decision === 'APPROVED' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-gray-300']">
            ✓ Approve
          </button>
          <button @click="overrideForm.decision = 'APPROVED_WITH_COMMENTS'"
            :class="['flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all',
              overrideForm.decision === 'APPROVED_WITH_COMMENTS' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-500 hover:border-gray-300']">
            ~ Approve with Comments
          </button>
          <button @click="overrideForm.decision = 'REJECTED'"
            :class="['flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all',
              overrideForm.decision === 'REJECTED' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500 hover:border-gray-300']">
            ✗ Reject
          </button>
        </div>
        <div>
          <label class="form-label">Comment <span class="text-gray-400 font-normal">(optional)</span></label>
          <textarea v-model="overrideForm.comment" class="input-field" rows="3"
            :placeholder="overrideForm.decision === 'REJECTED' ? 'Reason for rejecting…' : overrideForm.decision === 'APPROVED_WITH_COMMENTS' ? 'Comments on the approval…' : 'Reason for approving…'"></textarea>
        </div>
        <p v-if="overrideError" class="text-red-500 text-sm">{{ overrideError }}</p>
      </div>
      <div class="modal-footer">
        <button @click="showOverrideModal = false" class="btn-secondary">Cancel</button>
        <button @click="submitOverride" :disabled="overrideSaving"
          :class="['px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50',
            overrideForm.decision === 'APPROVED' ? 'bg-green-600 text-white hover:bg-green-700' :
            overrideForm.decision === 'APPROVED_WITH_COMMENTS' ? 'bg-orange-500 text-white hover:bg-orange-600' :
            'bg-red-600 text-white hover:bg-red-700']">
          {{ overrideSaving ? 'Saving…' : overrideForm.decision === 'APPROVED' ? 'Approve Document' : overrideForm.decision === 'APPROVED_WITH_COMMENTS' ? 'Approve with Comments' : 'Reject Document' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Import Modal ──────────────────────────────────────────────────────── -->
  <div v-if="showImportModal" class="modal-overlay" @click.self="showImportModal = false">
    <div class="modal-box" style="max-width:860px">
      <div class="modal-header">
        <h3 class="modal-title">Import Documents from Excel</h3>
        <button @click="showImportModal = false" class="modal-close">&times;</button>
      </div>
      <div class="modal-body space-y-4">

        <!-- Result state -->
        <div v-if="importResult" class="rounded-lg p-4 bg-green-50 border border-green-200 text-sm text-green-800 space-y-1">
          <p class="font-semibold">Import completed successfully.</p>
          <p>Created: <strong>{{ importResult.created }}</strong> &nbsp; Updated: <strong>{{ importResult.updated }}</strong> &nbsp; Skipped: <strong>{{ importResult.skipped }}</strong></p>
        </div>

        <!-- File picker + template download -->
        <div v-if="!importPreview && !importResult" class="space-y-3">
          <p class="text-sm text-gray-600">Upload an Excel file (.xlsx) to import documents. Use the template to see the required format and available lookup values.</p>
          <div class="flex items-center gap-3 flex-wrap">
            <button @click="exportDocs" class="btn-secondary text-sm flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 8l-3-3m3 3l3-3"/></svg>
              Export / Download Template
            </button>
            <label class="btn-secondary text-sm cursor-pointer flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
              Choose File
              <input type="file" accept=".xlsx" class="hidden" @change="onImportFileChange" />
            </label>
            <span v-if="importFile" class="text-sm text-gray-600">{{ importFile.name }}</span>
          </div>
          <p v-if="importError" class="text-red-500 text-sm">{{ importError }}</p>
          <p class="text-xs text-gray-400">Unique key: <strong>ID</strong> column. Leave blank to create new records; fill in an existing ID to update. The export file already contains the Lookups sheet with valid reference values.</p>
        </div>

        <!-- Preview table -->
        <div v-if="importPreview && !importResult" class="space-y-3">
          <div class="flex items-center gap-4 text-sm flex-wrap">
            <span class="px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium">{{ importPreview.summary.creates }} to create</span>
            <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">{{ importPreview.summary.updates }} to update</span>
            <span v-if="importPreview.summary.errors > 0" class="px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium">{{ importPreview.summary.errors }} error(s)</span>
          </div>
          <p v-if="importError" class="text-red-500 text-sm">{{ importError }}</p>
          <div class="overflow-x-auto max-h-96 border rounded">
            <table class="w-full text-xs">
              <thead class="bg-gray-100 sticky top-0">
                <tr>
                  <th class="px-2 py-1 text-left">Row</th>
                  <th class="px-2 py-1 text-left">Action</th>
                  <th class="px-2 py-1 text-left">ID</th>
                  <th class="px-2 py-1 text-left">Package</th>
                  <th class="px-2 py-1 text-left">Subservice</th>
                  <th class="px-2 py-1 text-left">Type</th>
                  <th class="px-2 py-1 text-left">Description</th>
                  <th class="px-2 py-1 text-left">Errors / Warnings</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in importPreview.rows" :key="r.row_num"
                  :class="r.errors.length ? 'bg-red-50' : r.warnings.length ? 'bg-yellow-50' : ''">
                  <td class="px-2 py-1 text-gray-500">{{ r.row_num }}</td>
                  <td class="px-2 py-1">
                    <span :class="r.action==='CREATE' ? 'text-green-700 font-semibold' : 'text-blue-700 font-semibold'">{{ r.action }}</span>
                  </td>
                  <td class="px-2 py-1 text-gray-500">{{ r.id || '—' }}</td>
                  <td class="px-2 py-1">{{ r.package_tag }}</td>
                  <td class="px-2 py-1">{{ r.subservice_code }}</td>
                  <td class="px-2 py-1">{{ r.document_type }}</td>
                  <td class="px-2 py-1 max-w-xs truncate" :title="r.description">{{ r.description }}</td>
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
        <button v-if="!importResult" @click="resetImport" class="btn-secondary">{{ importPreview ? 'Back' : 'Cancel' }}</button>
        <button v-if="importResult" @click="showImportModal = false; loadDocuments()" class="btn-primary">Close &amp; Refresh</button>
        <button v-if="!importPreview && !importResult && importFile" @click="runImportPreview"
          :disabled="importLoading" class="btn-primary">
          {{ importLoading ? 'Analysing…' : 'Preview Import' }}
        </button>
        <button v-if="importPreview && !importResult && importPreview.summary.errors === 0" @click="applyImport"
          :disabled="importApplying" class="btn-primary">
          {{ importApplying ? 'Applying…' : 'Confirm &amp; Apply' }}
        </button>
      </div>
    </div>
  </div>

</div>
  `,
});
