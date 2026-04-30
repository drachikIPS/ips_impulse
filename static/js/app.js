// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────
const { createApp } = Vue;

const app = createApp({
  data() {
    return {
      // Auth
      isLoggedIn: false,
      currentUser: null,
      loginForm: { email: '', password: '' },
      loginError: '',
      loginLoading: false,
      mustChangePassword: false,
      changePasswordForm: { new_password: '', confirm_password: '' },
      changePasswordError: '',
      changingPassword: false,

      // Projects
      userProjects: [],
      currentProject: null,
      showProjectSelector: false,
      projectsLoading: false,
      pickerSearch: '',
      pickerStatusFilter: 'ACTIVE',  // ACTIVE | ON_HOLD | CLOSED | ALL
      welcomeView: null,  // null | 'users' | 'project-setup'
      // Close project modal
      closingProject: null,
      // Close-project modal (Lessons Learned form). When opened from a row in
      // the project list, closeModalProject holds that project; when opened
      // from the top-header pill, it falls back to currentProject.
      closeModalProject: null,
      // Demo seed launcher (admin only)
      seedingDemo: false,
      seedDemoMessage: '',

      // Navigation
      sidebarCollapsed: false,
      activeModule: 'contacts',
      activeSubtab: null,
      meetingSubTab: 'types',
      openMeetingId: null,
      pendingOpen: null,
      // Currently URL-addressable record (drives the deepest hash segments).
      // Modules emit @record-change to keep this in sync with whichever
      // open-record modal is showing.
      currentRecord: null, // { type, id, meta } | null

      // Impersonation
      impersonating: null,        // the project-user object currently being impersonated
      realAdmin: null,            // saved currentUser before impersonation started
      impersonatableUsers: [],    // users in this project (loaded on project select for admin)
      showImpersonateModal: false,

      // Module visibility (PROJECT_OWNER / ADMIN configures; stored in localStorage per project)
      moduleVisibility: {},
      moduleConfigs: [
        { key: 'contacts',       label: 'Project Organization' },
        { key: 'my-points',      label: 'My Action Points' },
        { key: 'meetings',       label: 'Meeting Management' },
        { key: 'schedule',       label: 'Schedule' },
        { key: 'budget',         label: 'Budget Management' },
        { key: 'risks',          label: 'Risk Register' },
        { key: 'procurement',    label: 'Procurement' },
        { key: 'scope-changes',  label: 'Scope Changes' },
        { key: 'documents',      label: 'Document Management' },
        { key: 'quality-control',label: 'Quality Control' },
        { key: 'construction',   label: 'Construction' },
        { key: 'safety',         label: 'Safety' },
        { key: 'files',          label: 'Project Files' },
      ],

      // Global shared data (project-scoped)
      contacts: [],
      meetingTypes: [],
      meetings: [],
      subservices: [],

      // Full project DB export (top-header button)
      exportingFullDb: false,

      // Project start-up slide-over panel (lives at the root level so it
      // survives the navigation triggered when the user clicks a startup
      // action — `<my-action-points>` itself unmounts as soon as we leave
      // the My Action Points module).
      activeStartupTask: null,
      closingStartupTask: false,

      // Personal profile
      showProfileModal: false,
      profileForm: { name: '', phone: '' },
      profileError: '',
      profileSaved: false,
      savingProfile: false,
      // Change-password section in the profile modal
      passwordForm: { new_password: '', confirm_password: '' },
      passwordError: '',
      passwordSaved: false,
      savingPassword: false,
    };
  },

  computed: {
    isAdmin() {
      return this.currentUser && this.currentUser.role === 'ADMIN';
    },
    isRealAdmin() {
      // True when the actual logged-in account is admin, even during impersonation
      return this.realAdmin !== null || this.isAdmin;
    },
    isVendor() {
      return this.currentUser && this.currentUser.role === 'VENDOR';
    },
    isBidder() {
      return this.currentUser && this.currentUser.role === 'BIDDER';
    },
    canManageUsers() {
      return this.currentUser && (this.currentUser.role === 'ADMIN' || this.currentUser.role === 'PROJECT_OWNER');
    },
    canCloseCurrentProject() {
      // Admin can close any project; PROJECT_OWNER can close their own.
      if (!this.currentUser || !this.currentProject) return false;
      if (this.currentUser.role === 'ADMIN') return true;
      return this.currentProject.my_role === 'PROJECT_OWNER';
    },
    isRestricted() {
      return this.currentUser && (this.currentUser.role === 'CLIENT' || this.currentUser.role === 'VENDOR');
    },

    pageTitle() {
      const map = {
        contacts:         'Project Organization',
        meetings:         'Meetings',
        'my-points':      'My Action Points',
        schedule:         'Schedule',
        budget:           'Budget Management',
        risks:            'Risk Register',
        procurement:      'Procurement',
        'scope-changes':  'Scope Changes',
        documents:        'Document Management',
        'quality-control':'Quality Control',
        construction:     'Construction',
        safety:           'Safety',
        files:            'Project Files',
        users:            'User Management',
        settings:         'Platform Settings',
        projects:         'Project Management',
      };
      return map[this.activeModule] || '';
    },

    currentDate() {
      return new Date().toLocaleDateString('en-GB', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
    },

    projectStatusColor() {
      if (!this.currentProject) return 'bg-gray-400';
      const colors = { ACTIVE: 'bg-green-500', ON_HOLD: 'bg-yellow-500', CLOSED: 'bg-red-500' };
      return colors[this.currentProject.status] || 'bg-gray-400';
    },

    pickerStatusCounts() {
      const c = { ACTIVE: 0, ON_HOLD: 0, CLOSED: 0 };
      for (const p of this.userProjects) if (p.status in c) c[p.status]++;
      c.ALL = this.userProjects.length;
      return c;
    },

    filteredUserProjects() {
      const q = (this.pickerSearch || '').trim().toLowerCase();
      return this.userProjects.filter(p => {
        if (this.pickerStatusFilter !== 'ALL' && p.status !== this.pickerStatusFilter) return false;
        if (!q) return true;
        const hay = [p.project_number, p.description, p.client, p.client_reference, p.location, p.my_role]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    },
  },

  async mounted() {
    window.addEventListener('hashchange', () => this._applyHash());
    const token = API.getToken();
    if (token) {
      try {
        this.currentUser = await API.getMe();
        this.isLoggedIn = true;
        if (this.currentUser.must_change_password) {
          this.mustChangePassword = true;
        } else {
          await this.loadProjects();
        }
      } catch {
        API.clearToken();
      }
    }
  },

  methods: {
    // ── Auth ──────────────────────────────────────────────────────────────────
    async login() {
      if (!this.loginForm.email || !this.loginForm.password) {
        this.loginError = 'Please enter email and password.';
        return;
      }
      this.loginLoading = true;
      this.loginError = '';
      try {
        const res = await API.login(this.loginForm.email, this.loginForm.password);
        API.setToken(res.access_token);
        this.currentUser = res.user;
        this.isLoggedIn = true;
        if (res.user.must_change_password) {
          this.mustChangePassword = true;
        } else {
          await this.loadProjects();
        }
      } catch (e) {
        this.loginError = e.message || 'Login failed.';
      } finally {
        this.loginLoading = false;
      }
    },

    logout() {
      API.clearToken();
      this.isLoggedIn = false;
      this.currentUser = null;
      this.currentProject = null;
      this.userProjects = [];
      this.showProjectSelector = false;
      this.mustChangePassword = false;
      this.changePasswordForm = { new_password: '', confirm_password: '' };
      this.loginForm = { email: '', password: '' };
    },

    async submitChangePassword() {
      if (!this.changePasswordForm.new_password || this.changePasswordForm.new_password.length < 6) {
        this.changePasswordError = 'Password must be at least 6 characters.';
        return;
      }
      if (this.changePasswordForm.new_password !== this.changePasswordForm.confirm_password) {
        this.changePasswordError = 'Passwords do not match.';
        return;
      }
      this.changingPassword = true;
      this.changePasswordError = '';
      try {
        await API.changePassword({ new_password: this.changePasswordForm.new_password });
        this.currentUser = { ...this.currentUser, must_change_password: false };
        this.mustChangePassword = false;
        this.changePasswordForm = { new_password: '', confirm_password: '' };
        await this.loadProjects();
      } catch (e) {
        this.changePasswordError = e.message || 'Failed to change password.';
      } finally {
        this.changingPassword = false;
      }
    },

    // ── Projects ──────────────────────────────────────────────────────────────
    async onProjectClosed() {
      // After a project is closed, refresh the project list and the
      // currentProject reference so the new CLOSED status flows through the UI.
      try {
        await this.loadProjects();
        if (this.currentProject && this.userProjects) {
          const refreshed = this.userProjects.find(p => p.id === this.currentProject.id);
          if (refreshed) this.currentProject = refreshed;
        }
      } catch (_) { /* silent */ }
    },

    async onProjectClosedFromModal() {
      // Close the modal then bounce back to the project picker so the user
      // can pick another project (the just-closed one shows a CLOSED status).
      this.showCloseModal = false;
      try {
        await this.loadProjects();
        if (this.currentProject && this.userProjects) {
          const refreshed = this.userProjects.find(p => p.id === this.currentProject.id);
          if (refreshed) this.currentProject = refreshed;
        }
      } catch (_) {}
      // Drop back to the project selector
      this.switchProject();
    },

    async loadProjects() {
      this.projectsLoading = true;
      try {
        this.userProjects = await API.getProjects();
        // Hash takes priority over localStorage for project selection
        const parsed = this._parseHash();
        const hashId = parsed ? parsed.projectId : null;
        const savedId = hashId || API.getProjectId();
        const found = savedId
          ? this.userProjects.find(p => String(p.id) === String(savedId))
          : null;

        if (found) {
          await this.selectProject(found, false);
          // Restore module/subtab — hash wins, then per-project lastView from localStorage.
          let module = parsed && parsed.module ? parsed.module : null;
          let subtab = parsed && parsed.module ? (parsed.subtab || null) : null;
          if (!module) {
            const lv = API.getLastView(found.id);
            if (lv && lv.module) {
              module = lv.module;
              subtab = lv.subtab || null;
            }
          }
          if (module) {
            this.activeModule = module;
            if (module === 'meetings' && subtab) {
              this.meetingSubTab = subtab;
            } else {
              this.activeSubtab = subtab;
            }
            this._writeHash();
          }
        } else {
          // No valid project saved — show selector
          API.clearProjectId();
          this.currentProject = null;
          this.showProjectSelector = true;
        }
      } catch {
        this.showProjectSelector = true;
      } finally {
        this.projectsLoading = false;
      }
    },

    async selectProject(project, showMain = true) {
      API.setProjectId(project.id);
      this.currentProject = project;

      // Set the effective role from the project
      if (project.my_role && this.currentUser.role !== 'ADMIN') {
        this.currentUser = { ...this.currentUser, role: project.my_role };
      }

      this.showProjectSelector = false;
      this.activeModule = 'contacts';
      this.activeSubtab = null;
      this.impersonating = null;
      this.realAdmin = null;

      // Load project-scoped global data and module visibility in parallel
      await Promise.all([
        this.loadGlobalData(),
        this.loadModuleVisibility(),
      ]);

      // Pull this user's Module Lead overrides for the current project so
      // frontend components can ungate buttons. Stored on currentUser so it
      // flows through every component that already reads currentUser.role.
      try {
        const me = await API.getMyLeadModules();
        this.currentUser = { ...this.currentUser, lead_modules: me.lead_modules || [] };
      } catch {
        this.currentUser = { ...this.currentUser, lead_modules: [] };
      }

      // Load impersonatable users for admins
      if (this.currentUser.role === 'ADMIN') {
        this.impersonatableUsers = await API.getProjectUsers(project.id).catch(() => []);
      }

      // Write initial hash for this project
      this._writeHash();
    },

    switchProject() {
      this.showProjectSelector = true;
      this.currentProject = null;
      this.welcomeView = null;
      this.activeSubtab = null;
      API.clearProjectId();
      history.replaceState(null, '', '#/');
    },

    openCloseProject(project) {
      // Open the new Lessons-Learned closure modal targeted at the row's project.
      this.closeModalProject = project;
    },

    async onCloseModalDone() {
      this.closeModalProject = null;
      try { await this.loadProjects(); } catch (_) {}
    },

    async runDemoSeed() {
      if (!this.isAdmin) return;
      if (!confirm('Create the full demo project DEMO-FULL-2026 with thousands of records across every module?')) return;
      this.seedingDemo = true;
      this.seedDemoMessage = '';
      try {
        const r = await API.runDemoSeed();
        this.seedDemoMessage = r.message || 'Demo project created.';
        await this.loadProjects();
      } catch (e) {
        this.seedDemoMessage = 'Failed: ' + (e.message || 'unknown error');
      } finally {
        this.seedingDemo = false;
        // Auto-clear the message after a few seconds so the toolbar isn't permanently nagging
        setTimeout(() => { this.seedDemoMessage = ''; }, 6000);
      }
    },

    // ── Global data ───────────────────────────────────────────────────────────
    async loadGlobalData() {
      [this.contacts, this.meetingTypes, this.meetings] = await Promise.all([
        API.getContacts(),
        API.getMeetingTypes(),
        API.getMeetings(),
      ]);
    },

    // ── Navigation ────────────────────────────────────────────────────────────
    openHelpSection(section) {
      // Stash the requested section so the help-center reads it on mount.
      // setModule() rewrites the URL hash, so we can't pass it via the URL.
      window._pendingHelpSection = section || null;
      this.setModule('help');
    },

    setModule(module) {
      // Vendors are blocked from procurement entirely (sidebar hides it; this
      // catches direct URL-hash navigation like #/N/procurement).
      if (module === 'procurement' && this.isVendor) {
        module = 'meetings';
      }
      this.activeModule = module;
      this.activeSubtab = null;
      this.openMeetingId = null;
      this.pendingOpen = null;
      this.currentRecord = null;
      this._writeHash();
      if (module === 'meetings') {
        this.loadGlobalData();
      }
    },

    // ── Full project database export ─────────────────────────────────────
    canExportFullDb() {
      // ADMIN always; otherwise PROJECT_OWNER on the current project. The
      // backend re-checks; this just hides the button for everyone else.
      if (!this.currentUser) return false;
      if (this.currentUser.role === 'ADMIN') return true;
      return this.currentProject && this.currentProject.my_role === 'PROJECT_OWNER';
    },

    async exportFullProjectDb() {
      if (!this.currentProject) return;
      this.exportingFullDb = true;
      try {
        await API.exportFullProjectDatabaseXlsx(this.currentProject.project_number);
      } catch (e) {
        alert('Full database export failed: ' + (e.message || ''));
      } finally {
        this.exportingFullDb = false;
      }
    },

    // ── Project start-up checklist ────────────────────────────────────────
    onStartupTaskOpen(task) {
      // Navigate FIRST so the user lands on the right tab, then slide the
      // form in over it as on-screen guidance. Defer the slide by one tick
      // so the destination has time to render.
      this.navigateToTab({ module: task.target_module, subtab: task.target_subtab });
      this.$nextTick(() => { this.activeStartupTask = task; });
    },

    closeStartupPanel() {
      this.activeStartupTask = null;
    },

    keepOpenStartup() {
      // "Keep open" just dismisses the panel — the row stays in the action list.
      this.activeStartupTask = null;
    },

    async closeStartupAndStay() {
      const t = this.activeStartupTask;
      if (!t) return;
      this.closingStartupTask = true;
      try {
        await API.closeStartupTask(t.id);
        // Tell my-action-points (next time it loads) and clear the panel
        this.activeStartupTask = null;
      } catch (e) {
        alert(e.message || 'Failed to close the start-up task.');
      } finally {
        this.closingStartupTask = false;
      }
    },

    navigateToTab({ module, subtab }) {
      // Used by the Project Start-up checklist to drop the user into a
      // specific module + tab (no record). The module parameter must match
      // a key registered in moduleVisibility / moduleConfigs.
      if (!module) return;
      this.setModule(module);
      // setModule clears activeSubtab; re-apply if the target requested one.
      // Meetings has its own subtab variable.
      if (module === 'meetings') {
        if (subtab) this.meetingSubTab = subtab;
      } else if (subtab) {
        this.activeSubtab = subtab;
      }
      this._writeHash();
    },

    handleOpenRecord({ record_type, record_id, subtab, meta }) {
      // Procurement bidder-submittal action point: acknowledge first so the
      // item drops out of the user's My Action Points list, then open the
      // procurement view modal. Best-effort — failure to ack shouldn't block
      // navigation.
      if (record_type === 'procurement_entry' && meta && meta.submittal_id) {
        API.acknowledgeSubmittal(meta.submittal_id).catch(() => {});
      }
      const moduleMap = {
        order: 'budget',
        invoice: 'budget',
        scope_change: 'scope-changes',
        progress_report: 'schedule',
        document: 'documents',
        document_receipt: 'documents',
        procurement_entry: 'procurement',
        meeting_point: 'meetings',
        risk: 'risks',
        itp: 'quality-control',
        punch: 'quality-control',
        worker: 'construction',
        worker_batch: 'construction',
        daily_report_pending: 'construction',
        loto: 'construction',
        loto_batch: 'construction',
        loto_refused_batch: 'construction',
        work_permit_approval: 'construction',
        work_permit_rejected: 'construction',
        work_permit_close_extend: 'construction',
        loto_release: 'construction',
        safety_observation: 'safety',
        safety_incident: 'safety',
        safety_toolbox: 'safety',
      };
      const mod = moduleMap[record_type] || 'files';
      this.setModule(mod);
      this.pendingOpen = { record_type, record_id, meta: meta || null };
      if (mod === 'meetings') {
        // Meetings module uses its own subtab variable (`meetingSubTab`).
        if (record_type === 'meeting_point') this.meetingSubTab = 'points';
        else if (subtab) this.meetingSubTab = subtab;
      } else if (subtab) {
        this.activeSubtab = subtab;
      }
      // Record the deep-link target on the URL too — most modules will
      // respond to pendingOpen by opening the modal, which will emit
      // record-change and confirm the URL. We pre-set it here so refresh
      // before the module finishes loading still works.
      this.currentRecord = { type: record_type, id: record_id, meta: meta || null };
      this._writeHash();
    },

    setMeetingSubTab(tab) {
      this.meetingSubTab = tab;
      this.openMeetingId = null;
      this._writeHash();
      this.loadGlobalData();
    },

    openMeeting(id) {
      this.openMeetingId = id;
      this._writeHash();
    },

    backFromMeeting() {
      this.openMeetingId = null;
      this._writeHash();
      this.loadGlobalData();
    },

    setSubtab(tab) {
      this.activeSubtab = tab;
      // A subtab change implies leaving any deep-linked record from the
      // previous subtab; clear so the URL stays clean.
      this.currentRecord = null;
      this._writeHash();
    },

    initials(name) {
      return (name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    },

    // ── Personal profile ─────────────────────────────────────────────────────
    openProfileModal() {
      this.profileForm = {
        name: (this.currentUser && this.currentUser.name) || '',
        phone: (this.currentUser && this.currentUser.phone) || '',
      };
      this.profileError = '';
      this.profileSaved = false;
      this.passwordForm = { new_password: '', confirm_password: '' };
      this.passwordError = '';
      this.passwordSaved = false;
      this.showProfileModal = true;
    },

    async saveNewPassword() {
      const np = (this.passwordForm.new_password || '').trim();
      const cp = (this.passwordForm.confirm_password || '').trim();
      if (np.length < 6) {
        this.passwordError = 'Password must be at least 6 characters.';
        return;
      }
      if (np !== cp) {
        this.passwordError = 'Passwords do not match.';
        return;
      }
      this.savingPassword = true;
      this.passwordError = '';
      this.passwordSaved = false;
      try {
        await API.changePassword({ new_password: np });
        this.passwordSaved = true;
        this.passwordForm = { new_password: '', confirm_password: '' };
        // Clear any lingering must_change_password flag on the cached user
        if (this.currentUser) {
          this.currentUser = { ...this.currentUser, must_change_password: false };
        }
        setTimeout(() => { this.passwordSaved = false; }, 2500);
      } catch (e) {
        this.passwordError = e.message || 'Failed to change password.';
      } finally {
        this.savingPassword = false;
      }
    },

    async saveProfile() {
      if (!this.profileForm.name.trim()) {
        this.profileError = 'Name is required.';
        return;
      }
      this.savingProfile = true;
      this.profileError = '';
      this.profileSaved = false;
      try {
        const updated = await API.updateMe({
          name: this.profileForm.name.trim(),
          phone: this.profileForm.phone.trim() || null,
        });
        // Preserve the effective project role (which may differ from the base role)
        this.currentUser = {
          ...this.currentUser,
          name: updated.name,
          phone: updated.phone,
        };
        this.profileSaved = true;
        // Refresh contact list if currently open so the cascaded change is visible
        if (this.currentProject) {
          try { this.contacts = await API.getContacts(); } catch {}
        }
        setTimeout(() => { this.profileSaved = false; }, 2500);
      } catch (e) {
        this.profileError = e.message || 'Failed to save profile.';
      } finally {
        this.savingProfile = false;
      }
    },

    // ── Impersonation ─────────────────────────────────────────────────────────
    async startImpersonation(projectUser) {
      this.realAdmin = { ...this.currentUser };
      this.impersonating = projectUser;
      this.currentUser = {
        id: projectUser.user_id,
        name: projectUser.name,
        email: projectUser.email,
        role: projectUser.role,
        contact_id: projectUser.contact_id,
        must_change_password: false,
      };
      // Tell the API layer to send X-Impersonate-User-ID on every request
      API.setImpersonatedUserId(projectUser.user_id);
      this.showImpersonateModal = false;
      this.activeModule = 'contacts';
      await this.loadModuleVisibility();
    },

    async stopImpersonation() {
      this.currentUser = { ...this.realAdmin };
      this.realAdmin = null;
      this.impersonating = null;
      // Remove the impersonation header so requests revert to the real admin
      API.clearImpersonatedUserId();
      this.activeModule = 'contacts';
      await this.loadModuleVisibility();
    },

    // ── Module visibility ────────────────────────────────────────────────────
    moduleVisible(key) {
      // ADMIN always sees everything (platform-level oversight).
      // PROJECT_OWNER respects the visibility toggles they configured — they can
      // still edit them in Settings to bring a hidden module back.
      if (this.currentUser && this.currentUser.role === 'ADMIN') return true;
      return this.moduleVisibility[key] !== false;
    },

    async loadModuleVisibility() {
      try {
        const settings = await API.getSettings();
        this.moduleVisibility = settings.module_visibility
          ? JSON.parse(settings.module_visibility)
          : {};
        // Populate global date/timezone settings used by formatDate() / formatDateTime()
        window.AppSettings = {
          dateFormat: settings.date_format || 'DD/MM/YYYY',
          timezone:   settings.timezone   || 'Europe/Brussels',
          currency:   settings.currency   || 'EUR',
        };
      } catch {
        this.moduleVisibility = {};
      }
    },

    async saveModuleVisibility() {
      try {
        await API.updateSetting('module_visibility', JSON.stringify(this.moduleVisibility));
      } catch { /* silent — visibility is best-effort */ }
    },

    async toggleModuleVisibility(key) {
      // Prevent hiding the last visible module
      const currentlyVisible = this.moduleConfigs.filter(m => this.moduleVisibility[m.key] !== false);
      if (this.moduleVisibility[key] !== false && currentlyVisible.length <= 1) return;
      this.moduleVisibility = { ...this.moduleVisibility, [key]: this.moduleVisibility[key] === false ? true : false };
      await this.saveModuleVisibility();
      // If the active module was just hidden, navigate to the first visible one
      if (this.moduleVisibility[this.activeModule] === false) {
        const first = this.moduleConfigs.find(m => this.moduleVisibility[m.key] !== false);
        if (first) this.setModule(first.key);
      }
    },

    // ── Hash routing ─────────────────────────────────────────────────────────
    _parseHash() {
      // Hash format: #/{projectId}/{module}/{subtab?}/{recordType?}/{recordId?}
      // Meetings keeps its legacy form: #/{p}/meetings/{subTab}/{meetingId?}.
      const hash = window.location.hash;
      if (!hash || hash.length < 2) return null;
      const parts = hash.slice(1).replace(/^\//, '').split('/');
      const projectId = parts[0] ? parseInt(parts[0], 10) : null;
      if (!projectId || isNaN(projectId)) return null;
      const module = parts[1] || null;
      const subtab = parts[2] || null;
      const recordType = parts[3] || null;
      const recordIdRaw = parts[4] || null;
      const recordId = recordIdRaw && /^\d+$/.test(recordIdRaw) ? parseInt(recordIdRaw, 10) : null;
      return { projectId, module, subtab, recordType, recordId };
    },

    _writeHash() {
      if (!this.currentProject) return;
      let hash = `#/${this.currentProject.id}/${this.activeModule}`;
      if (this.activeModule === 'meetings') {
        hash += `/${this.meetingSubTab}`;
        if (this.openMeetingId) hash += `/${this.openMeetingId}`;
      } else {
        if (this.activeSubtab) hash += `/${this.activeSubtab}`;
        // Record segments come after the subtab. If there's no subtab but a
        // record is open, we still emit a placeholder slot so positions stay
        // stable: #/p/module/-/recordType/recordId.
        if (this.currentRecord && this.currentRecord.type && this.currentRecord.id != null) {
          if (!this.activeSubtab) hash += '/-';
          hash += `/${this.currentRecord.type}/${this.currentRecord.id}`;
        }
      }
      history.replaceState(null, '', hash);
      API.setLastView(this.currentProject.id, {
        module: this.activeModule,
        subtab: this.activeModule === 'meetings' ? this.meetingSubTab : this.activeSubtab,
      });
    },

    _applyHash() {
      // Called on hashchange — only re-navigate if project matches.
      const parsed = this._parseHash();
      if (!parsed || !this.currentProject) return;
      if (parsed.projectId !== this.currentProject.id) return;
      if (parsed.module && parsed.module !== this.activeModule) {
        this.activeModule = parsed.module;
        this.openMeetingId = null;
      }
      if (this.activeModule === 'meetings' && parsed.subtab) {
        this.meetingSubTab = parsed.subtab;
        const mid = parsed.recordType && /^\d+$/.test(parsed.recordType) ? parseInt(parsed.recordType, 10) : null;
        // Legacy meeting hashes encoded the meeting id at the recordType slot.
        if (mid) this.openMeetingId = mid;
      } else {
        this.activeSubtab = (parsed.subtab && parsed.subtab !== '-') ? parsed.subtab : null;
        if (parsed.recordType && parsed.recordId != null) {
          this.currentRecord = { type: parsed.recordType, id: parsed.recordId, meta: null };
          this.pendingOpen = { record_type: parsed.recordType, record_id: parsed.recordId, meta: null };
        } else {
          this.currentRecord = null;
        }
      }
    },

    onRecordChange(payload) {
      // Modules call $emit('record-change', { type, id, meta }) when a
      // modal opens, and emit null when it closes. We mirror that to the URL
      // so refreshes and shared links land on the same record.
      if (payload && payload.type && payload.id != null) {
        this.currentRecord = { type: payload.type, id: payload.id, meta: payload.meta || null };
      } else {
        this.currentRecord = null;
      }
      this._writeHash();
    },
  },
});
