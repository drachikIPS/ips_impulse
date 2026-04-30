// ─────────────────────────────────────────────────────────────────────────────
// Admin Settings Component
// ─────────────────────────────────────────────────────────────────────────────
app.component('settings-module', {
  props: ['currentUser', 'moduleConfigs', 'moduleVisibility'],
  emits: ['toggle-module', 'open-help'],
  template: `
    <div>
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-800">Project Settings</h2>
        <p class="text-gray-500 mt-1">Configure settings and review the permission model for this project</p>
      </div>

      <!-- Tab bar -->
      <div class="flex gap-0 border-b border-gray-200 mb-6">
        <button @click="activeTab='datetime'" :class="['sub-tab', activeTab==='datetime' ? 'active' : '']">Regional</button>
        <button v-if="isAdminOrOwner" @click="activeTab='files'" :class="['sub-tab', activeTab==='files' ? 'active' : '']">Files</button>
        <button v-if="isAdminOrOwner" @click="activeTab='navigation'" :class="['sub-tab', activeTab==='navigation' ? 'active' : '']">Navigation</button>
        <button v-if="isAdminOrOwner" @click="onSelectLeadsTab" :class="['sub-tab', activeTab==='leads' ? 'active' : '']">Module Leads</button>
        <button v-if="isAdminOrOwner" @click="activeTab='permissions'" :class="['sub-tab', activeTab==='permissions' ? 'active' : '']">Permissions Overview</button>
      </div>

      <!-- Regional tab -->
      <div class="grid gap-6 max-w-2xl" v-if="activeTab === 'datetime'">
        <div class="card">
          <h3 class="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Regional Settings
          </h3>
          <div class="space-y-4">
            <div>
              <label class="form-label">Timezone</label>
              <p class="text-xs text-gray-400 mb-1">Used for displaying and recording timestamps in Meeting Management</p>
              <select v-model="form.timezone" class="input-field">
                <optgroup label="Europe">
                  <option value="Europe/Brussels">Europe/Brussels (CET/CEST)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                  <option value="Europe/Berlin">Europe/Berlin (CET/CEST)</option>
                  <option value="Europe/Amsterdam">Europe/Amsterdam (CET/CEST)</option>
                  <option value="Europe/Madrid">Europe/Madrid (CET/CEST)</option>
                  <option value="Europe/Rome">Europe/Rome (CET/CEST)</option>
                  <option value="Europe/Warsaw">Europe/Warsaw (CET/CEST)</option>
                  <option value="Europe/Athens">Europe/Athens (EET/EEST)</option>
                  <option value="Europe/Helsinki">Europe/Helsinki (EET/EEST)</option>
                  <option value="Europe/Lisbon">Europe/Lisbon (WET/WEST)</option>
                </optgroup>
                <optgroup label="Middle East / Africa">
                  <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  <option value="Asia/Riyadh">Asia/Riyadh (AST)</option>
                  <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
                  <option value="Africa/Johannesburg">Africa/Johannesburg (SAST)</option>
                </optgroup>
                <optgroup label="Americas">
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                  <option value="America/Chicago">America/Chicago (CST/CDT)</option>
                  <option value="America/Denver">America/Denver (MST/MDT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                  <option value="America/Sao_Paulo">America/Sao_Paulo (BRT)</option>
                </optgroup>
                <optgroup label="Asia / Pacific">
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</option>
                </optgroup>
              </select>
              <p v-if="form.timezone" class="text-xs text-gray-400 mt-1">
                Current time in {{ form.timezone }}: <strong>{{ localTime }}</strong>
              </p>
            </div>
            <div>
              <label class="form-label">Date Format</label>
              <select v-model="form.date_format" class="input-field">
                <option value="DD/MM/YYYY">DD/MM/YYYY (European)</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
              </select>
            </div>
            <div>
              <label class="form-label">Currency</label>
              <p class="text-xs text-gray-400 mb-1">Used as the default currency in Budget, Procurement and Scope Changes</p>
              <input v-model="form.currency" list="currency-list" class="input-field" placeholder="e.g. EUR" maxlength="10" style="text-transform:uppercase" @input="form.currency = form.currency.toUpperCase()"/>
              <datalist id="currency-list">
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — US Dollar</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="AED">AED — UAE Dirham</option>
                <option value="SAR">SAR — Saudi Riyal</option>
                <option value="QAR">QAR — Qatari Riyal</option>
                <option value="KWD">KWD — Kuwaiti Dinar</option>
                <option value="BHD">BHD — Bahraini Dinar</option>
                <option value="OMR">OMR — Omani Rial</option>
                <option value="CHF">CHF — Swiss Franc</option>
                <option value="JPY">JPY — Japanese Yen</option>
                <option value="CAD">CAD — Canadian Dollar</option>
                <option value="AUD">AUD — Australian Dollar</option>
                <option value="NOK">NOK — Norwegian Krone</option>
                <option value="SEK">SEK — Swedish Krona</option>
                <option value="DKK">DKK — Danish Krone</option>
                <option value="SGD">SGD — Singapore Dollar</option>
                <option value="BRL">BRL — Brazilian Real</option>
                <option value="ZAR">ZAR — South African Rand</option>
              </datalist>
            </div>
          </div>
        </div>

        <!-- Save -->
        <div class="flex items-center gap-3">
          <button @click="save" :disabled="saving" class="btn-primary">
            {{ saving ? 'Saving...' : 'Save Settings' }}
          </button>
          <span v-if="saved" class="text-green-600 text-sm font-medium">Settings saved!</span>
        </div>
      </div>

      <!-- Files tab -->
      <div v-if="activeTab === 'files'" class="max-w-2xl">
        <div class="card">
          <h3 class="font-semibold text-gray-700 mb-1 flex items-center gap-2">
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12m0-12l-3 3m3-3l3 3"/>
            </svg>
            File Uploads
          </h3>
          <p class="text-xs text-gray-400 mb-4">Controls the size limit applied when users attach files anywhere in the project.</p>
          <div class="space-y-3">
            <div>
              <label class="form-label">Maximum upload size (MB)</label>
              <p class="text-xs text-gray-400 mb-1">Per-file cap for attachments uploaded anywhere in the project. Allowed range: 1–500 MB. Floorplans keep their own 25 MB cap.</p>
              <input v-model.number="form.max_upload_mb" type="number" min="1" max="500" step="1" class="input-field w-32"/>
              <p v-if="maxUploadError" class="text-red-500 text-xs mt-1">{{ maxUploadError }}</p>
            </div>
          </div>
          <div class="flex items-center gap-3 mt-4">
            <button @click="save" :disabled="saving" class="btn-primary">
              {{ saving ? 'Saving...' : 'Save Settings' }}
            </button>
            <span v-if="saved" class="text-green-600 text-sm font-medium">Settings saved!</span>
          </div>
        </div>
      </div>

      <!-- Navigation tab -->
      <div v-if="activeTab === 'navigation'" class="max-w-2xl">
        <div class="card">
          <h3 class="font-semibold text-gray-700 mb-1 flex items-center gap-2">
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h7"/>
            </svg>
            Navigation Modules
          </h3>
          <p class="text-xs text-gray-400 mb-4">Choose which modules are visible across the project. Admins always see every module; project owners follow these toggles too — turn one back on here whenever you need it.</p>
          <div class="space-y-2">
            <label v-for="m in moduleConfigs" :key="m.key"
              class="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer border border-gray-100">
              <span class="text-sm font-medium text-gray-700">{{ m.label }}</span>
              <button @click="$emit('toggle-module', m.key)"
                :class="['relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                  moduleVisibility[m.key] !== false ? 'bg-ips-blue' : 'bg-gray-200']"
                type="button" role="switch">
                <span :class="['pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200',
                  moduleVisibility[m.key] !== false ? 'translate-x-4' : 'translate-x-0']"></span>
              </button>
            </label>
          </div>
        </div>
      </div>

      <!-- Module Leads tab -->
      <div v-if="activeTab === 'leads'" class="max-w-4xl space-y-4">
        <div class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p class="font-semibold mb-1">Module Leads</p>
          <p>A Module Lead has the same access as a Project Owner, but only inside that one module. Use this for roles like Risk Manager, Cost Controller, HSE Manager, etc. The contact's base role elsewhere is unchanged. Bidders are not eligible.</p>
        </div>

        <div v-if="leadsLoading" class="text-center py-8 text-gray-400">
          <img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/>
        </div>

        <div v-else>
          <div v-for="m in leadModuleConfigs" :key="m.key" class="card mb-3">
            <div class="flex items-center justify-between mb-2">
              <div>
                <h3 class="font-semibold text-gray-700">{{ m.label }}</h3>
                <p class="text-xs text-gray-400">{{ m.role }} — {{ m.scope }}</p>
              </div>
              <button @click="openLeadPicker(m.key)" class="btn-secondary text-sm flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                Add Lead
              </button>
            </div>
            <div v-if="leadsByModule[m.key] && leadsByModule[m.key].length > 0" class="flex flex-wrap gap-2">
              <span v-for="c in leadsByModule[m.key]" :key="c.contact_id"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">
                <span>{{ c.contact_name }}</span>
                <span v-if="c.contact_company" class="text-blue-400">({{ c.contact_company }})</span>
                <button @click="removeLead(m.key, c.contact_id)" class="text-blue-500 hover:text-red-600 ml-1" title="Remove">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </span>
            </div>
            <p v-else class="text-xs text-gray-400 italic">No Lead assigned. Project Owners and Admins remain in charge.</p>
          </div>
        </div>

        <!-- Picker modal: search the eligible-contact list, capped at 50 -->
        <div v-if="leadPicker.show" class="modal-overlay" @click.self="leadPicker.show = false">
          <div class="modal-box" style="max-width:560px">
            <div class="modal-header">
              <h3 class="text-lg font-semibold text-gray-800">Add {{ leadPickerLabel }} Lead</h3>
              <button @click="leadPicker.show = false" class="text-gray-400 hover:text-gray-600">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="modal-body space-y-3">
              <input v-model="leadPicker.search" type="text" placeholder="Search contacts..." class="input-field"/>
              <div class="border rounded max-h-80 overflow-y-auto">
                <button v-for="c in leadPickerCandidates" :key="c.id" @click="addLead(leadPicker.module, c.id)"
                  class="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-0 flex items-center justify-between">
                  <span>
                    <span class="font-medium text-gray-800">{{ c.name }}</span>
                    <span v-if="c.company" class="text-xs text-gray-400 ml-2">{{ c.company }}</span>
                  </span>
                  <span class="text-xs text-gray-400">{{ c.role }}</span>
                </button>
                <p v-if="leadPickerCandidates.length === 0" class="text-center text-gray-400 text-sm py-4">No matching contacts.</p>
              </div>
              <p class="text-xs text-gray-400">Showing first 50 matches. Refine your search to narrow down.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Permissions Overview tab -->
      <div v-if="activeTab === 'permissions'" class="max-w-4xl space-y-4">
        <div class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 flex items-start gap-3">
          <svg class="w-5 h-5 mt-0.5 shrink-0 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="flex-1">
            <p class="font-semibold mb-1">Full permissions documentation lives in the Help Center.</p>
            <p>The complete reference — including all role descriptions, the Module Leads system, the Package Owner role, every approval flow (PMC + Client review, Subservice ITP, Work Permit + LOTO, Safety Incidents, Toolbox Acknowledge, Procurement Award) with flowcharts — is published in the Help Center.</p>
            <button @click="$emit('open-help', 'permissions')" class="btn-primary mt-3">
              Open Help → Permissions &amp; Roles
            </button>
          </div>
        </div>

        <div class="card">
          <h3 class="font-semibold text-gray-700 mb-3">Quick role reference</h3>
          <ul class="text-sm text-gray-700 space-y-1.5 list-disc pl-5">
            <li><strong>Admin</strong> — full access to every module across every project; impersonation, project management, user management.</li>
            <li><strong>Project Owner</strong> — full access within the assigned project; can edit anything, can override every workflow gate.</li>
            <li><strong>Module Lead</strong> — Project-Owner-equivalent rights for one specific module (9 supported); configured under Project Setup → Module Leads. Bidders cannot be Leads.</li>
            <li><strong>Package Owner</strong> — Project-Owner-equivalent rights for actions on one specific package, in every module except Meetings (Risk Register also excluded). Bidders and Vendors cannot be Package Owners.</li>
            <li><strong>Project Team / Client</strong> — author records and review where assigned; cannot override unless they are also a Module Lead or Package Owner.</li>
            <li><strong>Vendor</strong> — scoped to packages they are linked to; submits work permits, daily reports, ITP records and observations on those packages.</li>
            <li><strong>Bidder</strong> — sees only the bidder portal for invited packages.</li>
          </ul>
          <p class="text-xs text-gray-400 mt-3">Open the Help Center for the per-module gate map, all approval flowcharts, and the full who-can-override matrix.</p>
        </div>
      </div>
    </div>
  `,

  data() {
    return {
      activeTab: 'datetime',
      form: {
        timezone: 'Europe/Brussels',
        date_format: 'DD/MM/YYYY',
        currency: 'EUR',
        max_upload_mb: 100,
      },
      maxUploadError: '',
      saving: false,
      saved: false,
      // Module Leads tab
      leadsLoading: false,
      leadsLoaded: false,
      leadsByModule: {},
      eligibleContacts: [],
      leadPicker: { show: false, module: null, search: '' },
      leadModuleConfigs: [
        { key: 'Schedule',            label: 'Schedule',            role: 'Planning Manager',     scope: 'Manage tasks, baselines and Progress Reports across all packages.' },
        { key: 'Budget',              label: 'Budget Management',   role: 'Cost Controller',      scope: 'Manage baselines, transfers, orders and invoices; approve any invoice; run imports and exports.' },
        { key: 'Risk Register',       label: 'Risk Register',       role: 'Risk Manager',         scope: 'Create / edit / close risks; manage categories, phases, score setup and matrix.' },
        { key: 'Procurement',         label: 'Procurement',         role: 'Procurement Manager',  scope: 'Manage steps, contract types, bidding companies, plans, register and awards.' },
        { key: 'Scope Changes',       label: 'Scope Changes',       role: 'Change Manager',       scope: 'Create / edit / approve any scope change.' },
        { key: 'Document Management', label: 'Document Management', role: 'Document Controller',  scope: 'Upload / edit / delete any document and approve any review.' },
        { key: 'Quality Control',     label: 'Quality Control',     role: 'QA/QC Manager',        scope: 'Manage ITP test types and witness levels; create / edit / close any ITP record and punch item.' },
        { key: 'Construction',        label: 'Construction',        role: 'Construction Manager', scope: 'Manage work permits, LOTOs, daily reports, workers, subcontractors and certificates.' },
        { key: 'Safety',              label: 'Safety',              role: 'HSE Manager',          scope: 'Manage severity classes, incident causes, toolbox categories; create / edit / close any observation, incident and toolbox.' },
      ],
      moduleRules: [
        { title: 'Project Organization (Contacts, Packages, Subservices, Areas, Units, Floorplans)',
          detail: 'Project Owner / Admin only for create / edit / delete and for imports. Other roles read-only. Site supervisor list on an Area accepts only contacts whose linked user is Project Owner / Project Team / Client.' },
        { title: 'Meetings',
          detail: 'No matrix. A user can author/manage a meeting type only when they are listed as a default participant on the meeting type AND a contact in the owning package. Action points are restricted to assignees, package contacts and Project Owner / Admin.' },
        { title: 'Schedule',
          detail: 'Project Owner / Admin manage tasks. Account managers and linked contacts of a package can submit Progress Reports for their package. The Overall Time Schedule (Gantt) is visible to every project contact except Bidders.' },
        { title: 'Budget',
          detail: 'Project Owner / Admin only for baselines, transfers and orders. Vendors can submit invoices on packages where they are an account manager / linked contact. Imports (incl. forecast) are Project Owner / Admin only.' },
        { title: 'Risk Register',
          detail: 'Hidden from Vendors and Bidders entirely. Project Owner / Admin manage risks; Project Team / Client can read and add notes. Import is Project Owner / Admin only.' },
        { title: 'Procurement',
          detail: 'Hidden from Vendors and Bidders in the main navigation; backend rejects vendor calls. Bidders see only their own My Bids view. Project Team / Client read-only.' },
        { title: 'Scope Changes',
          detail: 'Project Owner / Admin can create and approve. Reviewers (PMC + Client commercial reviewers configured on the package) decide approvals. Vendors can submit on their packages.' },
        { title: 'Documents',
          detail: 'Write access driven by package-level ownership and per-document review chains, not by role alone. Project Owner / Admin always full access.' },
        { title: 'Quality Control (ITP + Punch List)',
          detail: 'Project Owner / Admin and assigned witness reviewers can manage ITP records. Punch items can be raised by anyone with package access; closure follows the witness/owner chain.' },
        { title: 'Construction (Work Permits, LOTOs, Daily Reports, Workers, Subcontractors)',
          detail: 'Project Owner / Admin and area site supervisors approve / reject workflow steps. Daily reports authored by package contacts. Workers and subcontractors are managed by Project Owner / Admin.' },
        { title: 'Safety (Observations, Incidents, Toolboxes)',
          detail: 'Anyone in the project can record an observation. Incident workflow goes through the area site supervisor and package contact for approval; Project Owner / Admin can override. Toolbox attendees acknowledge from their My Action Points.' },
        { title: 'Files',
          detail: 'Project Owner / Admin manage. Other roles see files attached to records they can already access.' },
        { title: 'Settings (Regional, Navigation, this Permissions Overview)',
          detail: 'Project Owner / Admin only.' },
      ],
    };
  },

  computed: {
    isAdmin() {
      return this.currentUser && this.currentUser.role === 'ADMIN';
    },
    isAdminOrOwner() {
      return this.currentUser && ['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role);
    },
    localTime() {
      try {
        return new Date().toLocaleTimeString('en-GB', { timeZone: this.form.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch {
        return '—';
      }
    },
    leadPickerLabel() {
      const cfg = this.leadModuleConfigs.find(m => m.key === this.leadPicker.module);
      return cfg ? cfg.label : '';
    },
    leadPickerCandidates() {
      // Already-assigned contacts for this module are excluded.
      const taken = new Set((this.leadsByModule[this.leadPicker.module] || []).map(l => l.contact_id));
      const q = (this.leadPicker.search || '').toLowerCase().trim();
      const matches = this.eligibleContacts.filter(c => {
        if (taken.has(c.id)) return false;
        if (!q) return true;
        return (c.name || '').toLowerCase().includes(q)
          || (c.company || '').toLowerCase().includes(q);
      });
      return matches.slice(0, 50);
    },
  },

  async mounted() {
    const s = await API.getSettings();
    this.form.timezone = s.timezone || 'Europe/Brussels';
    this.form.date_format = s.date_format || 'DD/MM/YYYY';
    this.form.currency = s.currency || 'EUR';
    const mb = parseInt(s.max_upload_mb, 10);
    this.form.max_upload_mb = (mb && mb > 0) ? mb : 100;
  },

  methods: {
    // ── Module Leads ──
    async onSelectLeadsTab() {
      this.activeTab = 'leads';
      if (!this.leadsLoaded) await this.loadLeads();
    },
    async loadLeads() {
      this.leadsLoading = true;
      try {
        const [state, contacts] = await Promise.all([
          API.getModuleLeads(),
          API.getModuleLeadEligibleContacts(),
        ]);
        const grouped = {};
        for (const r of (state.leads || [])) {
          if (!grouped[r.module]) grouped[r.module] = [];
          grouped[r.module].push(r);
        }
        this.leadsByModule = grouped;
        this.eligibleContacts = contacts || [];
        this.leadsLoaded = true;
      } catch (e) {
        alert('Could not load Module Leads: ' + (e.message || e));
      } finally {
        this.leadsLoading = false;
      }
    },
    openLeadPicker(module) {
      this.leadPicker = { show: true, module, search: '' };
    },
    async addLead(module, contactId) {
      const current = (this.leadsByModule[module] || []).map(l => l.contact_id);
      const next = [...new Set([...current, contactId])];
      try {
        await API.setModuleLeads(module, next);
        this.leadPicker.show = false;
        await this.loadLeads();
      } catch (e) {
        alert('Failed to add Lead: ' + (e.message || e));
      }
    },
    async removeLead(module, contactId) {
      const current = (this.leadsByModule[module] || []).map(l => l.contact_id);
      const next = current.filter(id => id !== contactId);
      try {
        await API.setModuleLeads(module, next);
        await this.loadLeads();
      } catch (e) {
        alert('Failed to remove Lead: ' + (e.message || e));
      }
    },

    async save() {
      this.maxUploadError = '';
      const mb = parseInt(this.form.max_upload_mb, 10);
      if (!mb || mb < 1 || mb > 500) {
        this.maxUploadError = 'Max upload size must be between 1 and 500 MB.';
        return;
      }
      this.saving = true;
      this.saved = false;
      try {
        await Promise.all([
          API.updateSetting('timezone', this.form.timezone),
          API.updateSetting('date_format', this.form.date_format),
          API.updateSetting('currency', this.form.currency),
          API.updateSetting('max_upload_mb', String(mb)),
        ]);
        // Update global settings immediately — no page reload needed
        window.AppSettings = {
          dateFormat: this.form.date_format,
          timezone:   this.form.timezone,
          currency:   this.form.currency,
        };
        this.saved = true;
        setTimeout(() => { this.saved = false; }, 3000);
      } catch (e) {
        alert(e.message);
      } finally {
        this.saving = false;
      }
    },
  },
});
