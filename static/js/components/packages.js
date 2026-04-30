// ─────────────────────────────────────────────────────────────────────────────
// Packages Module Component
// ─────────────────────────────────────────────────────────────────────────────
app.component('packages-module', {
  props: ['contacts', 'currentUser'],
  emits: ['packages-changed'],
  template: `
    <div>
      <div class="flex items-center justify-between mb-4">
        <p class="text-sm text-gray-500">Procurement packages and their assigned contacts</p>
        <button v-if="canEdit" @click="openModal()" class="btn-primary">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          New Package
        </button>
      </div>

      <div class="card overflow-hidden p-0">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Tag</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name / Company</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Package Owner</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Manager</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reviewers</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Linked Contacts</th>
              <th v-if="canEdit" class="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="packages.length === 0">
              <td colspan="7" class="px-4 py-10 text-center text-gray-400">No packages defined yet.</td>
            </tr>
            <tr v-for="pkg in packages" :key="pkg.id"
              class="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors align-top">
              <td class="px-4 py-3">
                <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white whitespace-nowrap" style="background:#1B4F8C">
                  {{ pkg.tag_number }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="font-medium text-gray-800">{{ pkg.name || '—' }}</div>
                <div v-if="pkg.company" class="text-xs text-gray-500 mt-0.5">{{ pkg.company }}</div>
                <div v-if="pkg.address" class="text-xs text-gray-400 mt-0.5">{{ pkg.address }}</div>
              </td>
              <td class="px-4 py-3 text-gray-700">{{ pkg.package_owner_name || '—' }}</td>
              <td class="px-4 py-3 text-gray-700">{{ pkg.account_manager_name || '—' }}</td>
              <td class="px-4 py-3">
                <div v-if="pkg.pmc_technical_reviewer_name || pkg.pmc_commercial_reviewer_name || pkg.client_technical_reviewer_name || pkg.client_commercial_reviewer_name"
                  class="space-y-1 text-xs">
                  <div v-if="pkg.pmc_technical_reviewer_name">
                    <span class="text-gray-400">PMC Tech:</span>
                    <span class="text-gray-700 ml-1">{{ pkg.pmc_technical_reviewer_name }}</span>
                  </div>
                  <div v-if="pkg.pmc_commercial_reviewer_name">
                    <span class="text-gray-400">PMC Comm:</span>
                    <span class="text-gray-700 ml-1">{{ pkg.pmc_commercial_reviewer_name }}</span>
                  </div>
                  <div v-if="pkg.client_technical_reviewer_name">
                    <span class="text-gray-400">Client Tech:</span>
                    <span class="text-gray-700 ml-1">{{ pkg.client_technical_reviewer_name }}</span>
                  </div>
                  <div v-if="pkg.client_commercial_reviewer_name">
                    <span class="text-gray-400">Client Comm:</span>
                    <span class="text-gray-700 ml-1">{{ pkg.client_commercial_reviewer_name }}</span>
                  </div>
                </div>
                <span v-else class="text-gray-400">—</span>
              </td>
              <td class="px-4 py-3">
                <div v-if="pkg.contact_ids && pkg.contact_ids.length > 0" class="flex flex-wrap gap-1">
                  <span v-for="cid in pkg.contact_ids" :key="cid"
                    class="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 whitespace-nowrap">
                    {{ contactName(cid) }}
                  </span>
                </div>
                <span v-else class="text-gray-400">—</span>
              </td>
              <td v-if="canEdit" class="px-4 py-3">
                <div class="flex gap-1 justify-end">
                  <button @click="openModal(pkg)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                  </button>
                  <button @click="deletePkg(pkg)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
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

      <!-- Modal -->
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-box modal-lg">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ editing ? 'Edit Package' : 'New Package' }}</h3>
            <button @click="showModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="form-label">Tag Number *</label>
                <input v-model="form.tag_number" type="text" class="input-field"
                       maxlength="8" placeholder="e.g. PKG-001"/>
                <p class="text-xs text-gray-400 mt-0.5">Max 8 characters.</p>
              </div>
              <div>
                <label class="form-label">Package Name / Description <span class="text-red-500">*</span></label>
                <input v-model="form.name" type="text" class="input-field" placeholder="e.g. Mechanical Equipment"/>
              </div>
              <div>
                <label class="form-label">Company / Supplier</label>
                <input v-model="form.company" type="text" class="input-field" placeholder="Supplier company name"/>
              </div>
              <div>
                <label class="form-label">Address</label>
                <input v-model="form.address" type="text" class="input-field" placeholder="Company address"/>
              </div>

              <!-- Linked contacts first (needed for account manager selection) -->
              <div class="col-span-2">
                <label class="form-label">Linked Contacts</label>
                <p class="text-xs text-gray-400 mb-2">Select the contacts associated with this package. The Account Manager must be one of these.</p>
                <div class="border border-gray-200 rounded-lg max-h-44 overflow-y-auto">
                  <label v-for="c in contacts" :key="c.id"
                    class="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                    <input type="checkbox" :value="c.id" v-model="form.contact_ids" class="w-4 h-4" style="accent-color:#00AEEF"/>
                    <div>
                      <span class="font-medium text-sm text-gray-700">{{ c.name }}</span>
                      <span v-if="c.company" class="text-xs text-gray-400 ml-2">{{ c.company }}</span>
                      <span v-if="c.function" class="text-xs text-gray-400 ml-2">— {{ c.function }}</span>
                    </div>
                  </label>
                  <div v-if="contacts.length === 0" class="px-3 py-4 text-sm text-gray-400 text-center">
                    No contacts available.
                  </div>
                </div>
              </div>

              <div>
                <label class="form-label">Account Manager</label>
                <p class="text-xs text-gray-400 mb-1">Must be a linked contact</p>
                <select v-model="form.account_manager_id" class="input-field">
                  <option :value="null">— Not assigned —</option>
                  <option v-for="cid in form.contact_ids" :key="cid" :value="cid">{{ contactName(cid) }}</option>
                </select>
              </div>

              <div>
                <label class="form-label">Package Owner</label>
                <p class="text-xs text-gray-500 mb-1 leading-snug">
                  Gets <span class="font-semibold">Project-Owner-equivalent permissions</span> on this package across all modules (except Meetings) — including override of reviews and workflow gates.
                  <br><span class="text-gray-400">Bidders and Vendors cannot be assigned.</span>
                </p>
                <select v-model="form.package_owner_id" class="input-field">
                  <option :value="null">— Not assigned —</option>
                  <option v-for="c in eligiblePackageOwners" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>

              <div class="col-span-2 grid grid-cols-2 gap-4">
                <div>
                  <label class="form-label">PMC Technical Review</label>
                  <select v-model="form.pmc_technical_reviewer_id" class="input-field">
                    <option :value="null">— Not assigned —</option>
                    <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">PMC Commercial Review</label>
                  <select v-model="form.pmc_commercial_reviewer_id" class="input-field">
                    <option :value="null">— Not assigned —</option>
                    <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Client Technical Review</label>
                  <select v-model="form.client_technical_reviewer_id" class="input-field">
                    <option :value="null">— Not assigned —</option>
                    <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Client Commercial Review</label>
                  <select v-model="form.client_commercial_reviewer_id" class="input-field">
                    <option :value="null">— Not assigned —</option>
                    <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
                  </select>
                </div>
              </div>
            </div>
            <p v-if="error" class="text-red-500 text-sm mt-3">{{ error }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showModal = false" class="btn-secondary">Cancel</button>
            <button @click="save" :disabled="saving" class="btn-primary">
              {{ saving ? 'Saving...' : (editing ? 'Save Changes' : 'Create Package') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,

  data() {
    return {
      packages: [],
      showModal: false,
      editing: null,
      form: { tag_number: '', name: '', company: '', address: '', account_manager_id: null, package_owner_id: null, pmc_technical_reviewer_id: null, pmc_commercial_reviewer_id: null, client_technical_reviewer_id: null, client_commercial_reviewer_id: null, contact_ids: [] },
      saving: false,
      error: '',
    };
  },

  computed: {
    canEdit() {
      if (!this.currentUser) return false;
      const role = this.currentUser.role;
      return role === 'ADMIN' || role === 'PROJECT_OWNER';
    },
    eligiblePackageOwners() {
      // Bidders and Vendors cannot be Package Owners — Package Owner grants
      // Project-Owner-equivalent rights on the package, which conflicts with
      // a competitive (Bidder) or supplier (Vendor) project role.
      // Legacy records keep their current value visible so it's editable.
      const currentId = this.form ? this.form.package_owner_id : null;
      return (this.contacts || []).filter(c => {
        if (c.id === currentId) return true;
        const r = c.project_role;
        return r !== 'BIDDER' && r !== 'VENDOR';
      });
    },
  },

  async mounted() {
    await this.load();
  },

  methods: {
    async load() {
      this.packages = await API.getPackages();
    },

    contactName(id) {
      const c = this.contacts.find(c => c.id === id);
      return c ? c.name : `#${id}`;
    },

    initials(name) {
      return (name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    },

    openModal(pkg = null) {
      this.editing = pkg;
      this.form = pkg
        ? {
            tag_number: pkg.tag_number,
            name: pkg.name || '',
            company: pkg.company || '',
            address: pkg.address || '',
            account_manager_id: pkg.account_manager_id,
            package_owner_id: pkg.package_owner_id,
            pmc_technical_reviewer_id: pkg.pmc_technical_reviewer_id || null,
            pmc_commercial_reviewer_id: pkg.pmc_commercial_reviewer_id || null,
            client_technical_reviewer_id: pkg.client_technical_reviewer_id || null,
            client_commercial_reviewer_id: pkg.client_commercial_reviewer_id || null,
            contact_ids: [...(pkg.contact_ids || [])],
            updated_at: pkg.updated_at || null,
          }
        : { tag_number: '', name: '', company: '', address: '', account_manager_id: null, package_owner_id: null, pmc_technical_reviewer_id: null, pmc_commercial_reviewer_id: null, client_technical_reviewer_id: null, client_commercial_reviewer_id: null, contact_ids: [], updated_at: null };
      this.error = '';
      this.showModal = true;
    },

    async save() {
      if (!this.form.tag_number.trim()) { this.error = 'Tag number is required.'; return; }
      if (this.form.tag_number.trim().length > 8) {
        this.error = 'Tag number must be 8 characters or fewer.';
        return;
      }
      if (!this.form.name || !this.form.name.trim()) { this.error = 'Package Name / Description is required.'; return; }
      // Validate: account manager must be a linked contact
      if (this.form.account_manager_id && !this.form.contact_ids.includes(this.form.account_manager_id)) {
        this.form.account_manager_id = null;
      }
      this.saving = true;
      this.error = '';
      try {
        if (this.editing) {
          await API.updatePackage(this.editing.id, this.form);
        } else {
          await API.createPackage(this.form);
        }
        await this.load();
        this.$emit('packages-changed');
        this.showModal = false;
      } catch (e) {
        this.error = e.status === 409
          ? 'This package was modified by another user. Please close and reopen to get the latest version.'
          : e.message;
      } finally {
        this.saving = false;
      }
    },

    async deletePkg(pkg) {
      if (!confirm(`Delete package "${pkg.tag_number}"?`)) return;
      await API.deletePackage(pkg.id);
      await this.load();
      this.$emit('packages-changed');
    },
  },
});
