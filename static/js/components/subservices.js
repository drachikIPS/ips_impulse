// ─────────────────────────────────────────────────────────────────────────────
// Subservices Component
// ─────────────────────────────────────────────────────────────────────────────
app.component('subservices-module', {
  props: ['contacts', 'currentUser'],
  template: `
    <div>
      <div class="flex items-center justify-between mb-4">
        <p class="text-sm text-gray-500">Project subservices grouped by service, with assigned reviewers</p>
        <div class="flex gap-2">
          <button v-if="canManage && selectedIds.length > 0" @click="bulkDelete"
            :disabled="bulkDeleting"
            class="btn-secondary text-sm flex items-center gap-1 border-red-300 text-red-700 bg-red-50 hover:bg-red-100">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            {{ bulkDeleting ? 'Deleting...' : ('Delete Selected (' + selectedIds.length + ')') }}
          </button>
          <button v-if="canManage" @click="openImportModal" class="btn-secondary text-sm flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0l-3 3m3-3l3 3"/></svg>
            Import
          </button>
          <button v-if="canManage" @click="openModal()" class="btn-primary">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            New Subservice
          </button>
        </div>
      </div>

      <div class="card overflow-hidden p-0">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th v-if="canManage" class="px-3 py-3 w-8">
                <input type="checkbox" :checked="allSelected" :indeterminate.prop="someSelected && !allSelected"
                  @change="toggleSelectAll($event.target.checked)"
                  class="h-4 w-4 text-ips-blue border-gray-300 rounded focus:ring-ips-blue"/>
              </th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Code</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Subservice</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">PMC Reviewer</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Client Reviewer</th>
              <th v-if="canEdit" class="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            <template v-if="subservices.length === 0">
              <tr>
                <td :colspan="canManage ? 6 : 5" class="px-4 py-8 text-center text-gray-400">
                  No subservices defined yet.
                  <span v-if="canManage"> Click <strong>New Subservice</strong> to add one.</span>
                </td>
              </tr>
            </template>
            <template v-else v-for="(group, serviceName) in grouped" :key="serviceName">
              <!-- Service group header -->
              <tr class="bg-blue-50 border-b border-blue-100">
                <td :colspan="canManage ? 6 : 5" class="px-4 py-2">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold uppercase tracking-wider text-ips-dark">
                      {{ group[0].service_code }} — {{ group[0].service_name }}
                    </span>
                    <span class="text-xs text-gray-400">{{ group.length }} subservice{{ group.length !== 1 ? 's' : '' }}</span>
                  </div>
                </td>
              </tr>
              <!-- Subservice rows -->
              <tr v-for="s in group" :key="s.id" class="border-b border-gray-100 hover:bg-gray-50">
                <td v-if="canManage" class="px-3 py-2.5">
                  <input type="checkbox" :checked="selectedIds.includes(s.id)" @change="toggleSelect(s.id, $event.target.checked)"
                    class="h-4 w-4 text-ips-blue border-gray-300 rounded focus:ring-ips-blue"/>
                </td>
                <td class="px-4 py-2.5">
                  <span class="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{{ s.subservice_code }}</span>
                </td>
                <td class="px-4 py-2.5 font-medium text-gray-800">{{ s.subservice_name }}</td>
                <td class="px-4 py-2.5">
                  <span v-if="s.pmc_reviewer_name" class="text-gray-700">{{ s.pmc_reviewer_name }}</span>
                  <span v-else class="text-gray-400 text-xs">—</span>
                </td>
                <td class="px-4 py-2.5">
                  <span v-if="s.client_reviewer_name" class="text-gray-700">{{ s.client_reviewer_name }}</span>
                  <span v-else class="text-gray-400 text-xs">—</span>
                </td>
                <td v-if="canEdit" class="px-4 py-2.5">
                  <div class="flex gap-1 justify-end">
                    <button @click="openModal(s)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                    </button>
                    <button v-if="canManage" @click="deleteSubservice(s)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <div class="mt-2 text-xs text-gray-400">{{ subservices.length }} subservice{{ subservices.length !== 1 ? 's' : '' }}</div>

      <!-- Create / Edit Modal -->
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-box modal-lg">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ editing ? 'Edit Subservice' : 'New Subservice' }}</h3>
            <button @click="showModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body space-y-4">

            <!-- Service section -->
            <div>
              <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Service</p>
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="form-label">Service Code *</label>
                  <input v-model="form.service_code" type="text" class="input-field" placeholder="e.g. CIVIL"/>
                  <p v-if="serviceNameSuggestion && form.service_code && !form.service_name" class="text-xs text-blue-500 mt-1 cursor-pointer" @click="form.service_name = serviceNameSuggestion">
                    Use "{{ serviceNameSuggestion }}"?
                  </p>
                </div>
                <div class="col-span-2">
                  <label class="form-label">Service Name *</label>
                  <input v-model="form.service_name" type="text" class="input-field" placeholder="e.g. Civil Engineering"/>
                </div>
              </div>
            </div>

            <!-- Subservice section -->
            <div>
              <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Subservice</p>
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="form-label">Subservice Code *</label>
                  <input v-model="form.subservice_code" type="text" class="input-field" placeholder="e.g. CIVIL-01"/>
                </div>
                <div class="col-span-2">
                  <label class="form-label">Subservice Name *</label>
                  <input v-model="form.subservice_name" type="text" class="input-field" placeholder="e.g. Site Preparation"/>
                </div>
              </div>
            </div>

            <!-- Reviewers -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label">PMC Reviewer</label>
                <select v-model="form.pmc_reviewer_id" class="input-field">
                  <option :value="0">— None —</option>
                  <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
              <div>
                <label class="form-label">Client Reviewer</label>
                <select v-model="form.client_reviewer_id" class="input-field">
                  <option :value="0">— None —</option>
                  <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
            </div>

            <p v-if="formError" class="text-red-500 text-sm">{{ formError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showModal = false" class="btn-secondary">Cancel</button>
            <button @click="save" :disabled="saving" class="btn-primary">
              {{ saving ? 'Saving...' : (editing ? 'Save Changes' : 'Create Subservice') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Import Modal -->
      <div v-if="importState.show" class="modal-overlay" @click.self="importState.show = false">
        <div class="modal-box" style="max-width:880px">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">Import Subservices from Excel</h3>
            <button @click="importState.show = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body space-y-4">
            <div v-if="importState.result" class="rounded-lg p-4 bg-green-50 border border-green-200 text-sm text-green-800 space-y-1">
              <p class="font-semibold">Import completed successfully.</p>
              <p>Created: <strong>{{ importState.result.created }}</strong> &nbsp; Updated: <strong>{{ importState.result.updated }}</strong> &nbsp; Skipped: <strong>{{ importState.result.skipped }}</strong></p>
            </div>
            <div v-if="!importState.preview && !importState.result" class="space-y-3">
              <p class="text-sm text-gray-600">Upload an Excel file (.xlsx) to import subservices. Download the template first to see the expected format and lookup values.</p>
              <div class="flex items-center gap-3 flex-wrap">
                <button @click="downloadTemplate" class="btn-secondary text-sm flex items-center gap-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 8l-3-3m3 3l3-3"/></svg>
                  Download Template
                </button>
                <label class="btn-secondary text-sm cursor-pointer flex items-center gap-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                  Choose File
                  <input type="file" accept=".xlsx" class="hidden" @change="onImportFileChange" />
                </label>
                <span v-if="importState.file" class="text-sm text-gray-600">{{ importState.file.name }}</span>
              </div>
              <p v-if="importState.error" class="text-red-500 text-sm">{{ importState.error }}</p>
              <p class="text-xs text-gray-400">Unique key: <strong>ID</strong> column. Leave blank to create new subservices; fill in an existing ID to update. Reviewer columns must match a contact name from the Lookups sheet.</p>
            </div>
            <div v-if="importState.preview && !importState.result" class="space-y-3">
              <div class="flex items-center gap-4 text-sm flex-wrap">
                <span class="px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium">{{ importState.preview.summary.creates }} to create</span>
                <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">{{ importState.preview.summary.updates }} to update</span>
                <span v-if="importState.preview.summary.errors > 0" class="px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium">{{ importState.preview.summary.errors }} error(s)</span>
              </div>
              <p v-if="importState.error" class="text-red-500 text-sm">{{ importState.error }}</p>
              <div class="overflow-x-auto max-h-96 border rounded">
                <table class="w-full text-xs">
                  <thead class="bg-gray-100 sticky top-0">
                    <tr>
                      <th class="px-2 py-1 text-left">Row</th>
                      <th class="px-2 py-1 text-left">Action</th>
                      <th class="px-2 py-1 text-left">ID</th>
                      <th class="px-2 py-1 text-left">Service</th>
                      <th class="px-2 py-1 text-left">Subservice</th>
                      <th class="px-2 py-1 text-left">PMC Reviewer</th>
                      <th class="px-2 py-1 text-left">Client Reviewer</th>
                      <th class="px-2 py-1 text-left">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in importState.preview.rows" :key="r.row_num"
                      :class="r.errors.length ? 'bg-red-50' : ''">
                      <td class="px-2 py-1 text-gray-500">{{ r.row_num }}</td>
                      <td class="px-2 py-1"><span :class="r.action==='CREATE' ? 'text-green-700 font-semibold' : 'text-blue-700 font-semibold'">{{ r.action }}</span></td>
                      <td class="px-2 py-1 text-gray-500">{{ r.id || '—' }}</td>
                      <td class="px-2 py-1">{{ r.service_code }} — {{ r.service_name }}</td>
                      <td class="px-2 py-1">{{ r.subservice_code }} — {{ r.subservice_name }}</td>
                      <td class="px-2 py-1">{{ r.pmc_reviewer_name || '—' }}</td>
                      <td class="px-2 py-1">{{ r.client_reviewer_name || '—' }}</td>
                      <td class="px-2 py-1">
                        <span v-for="e in r.errors" :key="e" class="block text-red-600">{{ e }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button v-if="!importState.result" @click="resetImport" class="btn-secondary">{{ importState.preview ? 'Back' : 'Cancel' }}</button>
            <button v-if="importState.result" @click="closeImportAndRefresh" class="btn-primary">Close &amp; Refresh</button>
            <button v-if="!importState.preview && !importState.result && importState.file" @click="runImportPreview"
              :disabled="importState.loading" class="btn-primary">
              {{ importState.loading ? 'Analysing...' : 'Preview Import' }}
            </button>
            <button v-if="importState.preview && !importState.result && importState.preview.summary.errors === 0"
              @click="applyImport" :disabled="importState.applying" class="btn-primary">
              {{ importState.applying ? 'Applying...' : 'Confirm &amp; Apply' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,

  data() {
    return {
      subservices: [],
      selectedIds: [],
      bulkDeleting: false,
      importState: {
        show: false, file: null, preview: null, result: null,
        loading: false, applying: false, error: '',
      },
      showModal: false,
      editing: null,
      form: { service_code: '', service_name: '', subservice_code: '', subservice_name: '', pmc_reviewer_id: 0, client_reviewer_id: 0 },
      formError: '',
      saving: false,
    };
  },

  computed: {
    canManage() {
      return this.currentUser && (this.currentUser.role === 'ADMIN' || this.currentUser.role === 'PROJECT_OWNER');
    },
    canEdit() {
      if (!this.currentUser) return false;
      const role = this.currentUser.role;
      return role === 'ADMIN' || role === 'PROJECT_OWNER';
    },
    grouped() {
      const groups = {};
      for (const s of this.subservices) {
        if (!groups[s.service_name]) groups[s.service_name] = [];
        groups[s.service_name].push(s);
      }
      return groups;
    },
    allSelected() {
      return this.subservices.length > 0 && this.selectedIds.length === this.subservices.length;
    },
    someSelected() {
      return this.selectedIds.length > 0;
    },
    // When typing a service code that already exists, suggest the service name
    serviceNameSuggestion() {
      if (!this.form.service_code) return null;
      const code = this.form.service_code.trim().toUpperCase();
      const match = this.subservices.find(s => s.service_code.toUpperCase() === code && (!this.editing || s.id !== this.editing.id));
      return match ? match.service_name : null;
    },
  },

  async mounted() {
    await this.load();
  },

  methods: {
    async load() {
      this.subservices = await API.getSubservices();
    },

    openModal(s = null) {
      this.editing = s;
      this.form = s ? {
        service_code: s.service_code,
        service_name: s.service_name,
        subservice_code: s.subservice_code,
        subservice_name: s.subservice_name,
        pmc_reviewer_id: s.pmc_reviewer_id || 0,
        client_reviewer_id: s.client_reviewer_id || 0,
      } : { service_code: '', service_name: '', subservice_code: '', subservice_name: '', pmc_reviewer_id: 0, client_reviewer_id: 0 };
      this.formError = '';
      this.showModal = true;
    },

    async save() {
      if (!this.form.service_code.trim()) { this.formError = 'Service code is required.'; return; }
      if (!this.form.service_name.trim()) { this.formError = 'Service name is required.'; return; }
      if (!this.form.subservice_code.trim()) { this.formError = 'Subservice code is required.'; return; }
      if (!this.form.subservice_name.trim()) { this.formError = 'Subservice name is required.'; return; }
      this.saving = true;
      this.formError = '';
      try {
        const payload = {
          service_code: this.form.service_code.trim(),
          service_name: this.form.service_name.trim(),
          subservice_code: this.form.subservice_code.trim(),
          subservice_name: this.form.subservice_name.trim(),
          pmc_reviewer_id: this.form.pmc_reviewer_id || 0,
          client_reviewer_id: this.form.client_reviewer_id || 0,
        };
        if (this.editing) {
          await API.updateSubservice(this.editing.id, payload);
        } else {
          await API.createSubservice(payload);
        }
        await this.load();
        this.showModal = false;
      } catch (e) {
        this.formError = e.message || 'Save failed.';
      } finally {
        this.saving = false;
      }
    },

    async deleteSubservice(s) {
      if (!confirm(`Delete subservice "${s.subservice_code} — ${s.subservice_name}"?`)) return;
      try {
        await API.deleteSubservice(s.id);
        await this.load();
      } catch (e) {
        alert(e.message || 'Delete failed.');
      }
    },

    toggleSelect(id, checked) {
      const idx = this.selectedIds.indexOf(id);
      if (checked && idx === -1) this.selectedIds.push(id);
      else if (!checked && idx >= 0) this.selectedIds.splice(idx, 1);
    },
    toggleSelectAll(checked) {
      this.selectedIds = checked ? this.subservices.map(s => s.id) : [];
    },
    async bulkDelete() {
      const n = this.selectedIds.length;
      if (!n) return;
      if (!confirm(`Delete ${n} selected subservice${n === 1 ? '' : 's'}? This cannot be undone.`)) return;
      this.bulkDeleting = true;
      try {
        await API.bulkDeleteSubservices(this.selectedIds);
        this.selectedIds = [];
        await this.load();
      } catch (e) {
        alert(e.message || 'Bulk delete failed.');
      } finally {
        this.bulkDeleting = false;
      }
    },

    // ── Import ──
    openImportModal() {
      this.importState = { show: true, file: null, preview: null, result: null, loading: false, applying: false, error: '' };
    },
    resetImport() {
      if (this.importState.preview) {
        this.importState.preview = null;
        this.importState.error = '';
      } else {
        this.importState.show = false;
      }
    },
    onImportFileChange(e) {
      this.importState.file = e.target.files[0] || null;
      this.importState.error = '';
    },
    async downloadTemplate() {
      try { await API.exportSubservicesTemplate(); }
      catch (e) { alert(e.message || 'Download failed'); }
    },
    async runImportPreview() {
      if (!this.importState.file) return;
      this.importState.loading = true;
      this.importState.error = '';
      try {
        this.importState.preview = await API.previewSubservicesImport(this.importState.file);
      } catch (e) {
        this.importState.error = e.message || 'Preview failed';
      } finally {
        this.importState.loading = false;
      }
    },
    async applyImport() {
      if (!this.importState.preview) return;
      this.importState.applying = true;
      this.importState.error = '';
      try {
        this.importState.result = await API.applySubservicesImport({ rows: this.importState.preview.rows });
      } catch (e) {
        this.importState.error = e.message || 'Import failed';
      } finally {
        this.importState.applying = false;
      }
    },
    async closeImportAndRefresh() {
      this.importState.show = false;
      await this.load();
    },
  },
});
