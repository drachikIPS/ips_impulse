// ─────────────────────────────────────────────────────────────────────────────
// User Management Component (Admin only)
// ─────────────────────────────────────────────────────────────────────────────
app.component('users-module', {
  props: [],
  template: `
    <div>
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 class="text-2xl font-bold text-gray-800">User Management</h2>
          <p class="text-gray-500 mt-1">Manage platform accounts. Assign users to projects and set their project role in Project Setup.</p>
        </div>
        <div class="flex items-center gap-2">
          <button @click="openInactiveModal" class="btn-secondary" title="Bulk-delete users that haven't logged in since a chosen date">
            <svg class="w-4 h-4 mr-1.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Purge inactive…
          </button>
          <button @click="openModal()" class="btn-primary">
            <svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            Add User
          </button>
        </div>
      </div>

      <!-- Search + bulk actions toolbar -->
      <div class="flex items-center gap-3 mb-3 flex-wrap">
        <div class="relative flex-1 min-w-[260px] max-w-md">
          <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input v-model="search" type="text" placeholder="Search by name, email, project…"
            class="input-field pl-9 w-full"/>
        </div>
        <div class="text-xs text-gray-500">{{ filteredUsers.length }} of {{ users.length }} user{{ users.length === 1 ? '' : 's' }}</div>
        <button v-if="selectedIds.length > 0" @click="bulkDeleteSelected"
          class="btn-secondary flex items-center gap-1.5" style="border-color:#DC2626;color:#DC2626">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          Delete selected ({{ selectedIds.length }})
        </button>
      </div>

      <div class="card overflow-hidden p-0">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th class="px-3 py-3 w-10">
                <input type="checkbox"
                  :checked="filteredUsers.length > 0 && filteredUsers.every(u => selectedIds.includes(u.id))"
                  @change="toggleSelectAll"
                  class="w-4 h-4 cursor-pointer" style="accent-color:#00AEEF"/>
              </th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer" @click="setSort('name')">
                Name <span class="text-gray-400">{{ sortIcon('name') }}</span>
              </th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer" @click="setSort('email')">
                Email <span class="text-gray-400">{{ sortIcon('email') }}</span>
              </th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Platform Access</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer" @click="setSort('last_login_at')" :title="'Click to sort — oldest sign-ins on top is the default'">
                Last Sign-in <span class="text-gray-400">{{ sortIcon('last_login_at') }}</span>
              </th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Active in Projects</th>
              <th class="px-4 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredUsers.length === 0">
              <td colspan="7" class="px-4 py-8 text-center text-gray-400">No users match the current filter.</td>
            </tr>
            <tr v-for="u in filteredUsers" :key="u.id" class="border-b border-gray-100 hover:bg-gray-50">
              <td class="px-3 py-3">
                <input type="checkbox" :value="u.id" v-model="selectedIds"
                  class="w-4 h-4 cursor-pointer" style="accent-color:#00AEEF"/>
              </td>
              <td class="px-4 py-3 font-medium text-gray-800">{{ u.name }}</td>
              <td class="px-4 py-3 text-gray-600">{{ u.email }}</td>
              <td class="px-4 py-3">
                <span v-if="u.role === 'ADMIN'"
                  class="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                  Platform Admin
                </span>
                <span v-else class="text-xs text-gray-400">User</span>
              </td>
              <td class="px-4 py-3 text-xs">
                <span v-if="u.last_login_at" :class="lastLoginClass(u.last_login_at)" class="font-medium">
                  {{ fmtRelative(u.last_login_at) }}
                </span>
                <span v-else class="text-amber-600 font-medium" title="No login recorded">never</span>
                <div v-if="u.last_login_at" class="text-[11px] text-gray-400">{{ fmtAbsolute(u.last_login_at) }}</div>
              </td>
              <td class="px-4 py-3 text-xs">
                <div v-if="!u.projects || u.projects.length === 0" class="text-gray-400">—</div>
                <div v-else class="flex flex-wrap gap-1">
                  <span v-for="p in u.projects.slice(0, 5)" :key="p.id"
                    class="inline-block px-2 py-0.5 rounded text-[11px] font-bold"
                    :style="projectChipStyle(p.status)"
                    :title="(p.description ? p.description + ' — ' : '') + projectStatusLabel(p.status)">
                    {{ p.project_number }}
                  </span>
                  <span v-if="u.projects.length > 5" class="text-[11px] text-gray-500" :title="u.projects.slice(5).map(p => p.project_number + ' (' + projectStatusLabel(p.status) + ')').join(', ')">
                    +{{ u.projects.length - 5 }} more
                  </span>
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="flex gap-2 justify-end">
                  <button @click="openModal(u)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                  </button>
                  <button @click="deleteUser(u)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
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

      <!-- Edit / Create modal -->
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-box">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ editing ? 'Edit User' : 'New User' }}</h3>
            <button @click="showModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="space-y-4">
              <div>
                <label class="form-label">Full Name *</label>
                <input v-model="form.name" type="text" class="input-field"/>
              </div>
              <div>
                <label class="form-label">Email *</label>
                <input v-model="form.email" type="email" class="input-field"/>
              </div>
              <div>
                <label class="form-label">{{ editing ? 'New Password (leave blank to keep)' : 'Password *' }}</label>
                <input v-model="form.password" type="password" class="input-field" :placeholder="editing ? 'Leave blank to keep current' : 'Minimum 6 characters'"/>
              </div>
              <div class="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <input id="is_admin_toggle" type="checkbox" v-model="form.is_admin" class="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"/>
                <div>
                  <label for="is_admin_toggle" class="text-sm font-medium text-gray-800 cursor-pointer">Platform Administrator</label>
                  <p class="text-xs text-gray-500 mt-0.5">Grants full access to all projects and system configuration. Project-specific roles are assigned in Project Setup.</p>
                </div>
              </div>
            </div>
            <p v-if="error" class="text-red-500 text-sm mt-3">{{ error }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showModal = false" class="btn-secondary">Cancel</button>
            <button @click="save" :disabled="saving" class="btn-primary">
              {{ saving ? 'Saving…' : (editing ? 'Save Changes' : 'Create User') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Purge inactive modal -->
      <div v-if="showInactiveModal" class="modal-overlay" @click.self="showInactiveModal = false">
        <div class="modal-box" style="max-width:520px">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">Delete inactive users</h3>
            <button @click="showInactiveModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body space-y-4">
            <p class="text-sm text-gray-600">Select users that have <strong>not signed in since</strong> the chosen date. Users that have never logged in are included by default.</p>
            <div>
              <label class="form-label">Cut-off date *</label>
              <input v-model="inactiveCutoff" type="date" class="input-field"/>
              <p class="text-xs text-gray-400 mt-1">Tip: pick a date e.g. 12 months ago to remove inactive accounts.</p>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <input id="includeNever" type="checkbox" v-model="includeNeverLogged" class="h-4 w-4 rounded" style="accent-color:#00AEEF"/>
              <label for="includeNever" class="cursor-pointer text-gray-700">Include users that have <em>never</em> logged in</label>
            </div>
            <div v-if="inactiveCandidates.length > 0" class="border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
              <p class="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600 border-b border-gray-200">{{ inactiveCandidates.length }} user{{ inactiveCandidates.length === 1 ? '' : 's' }} match — review before deleting:</p>
              <ul class="text-sm">
                <li v-for="u in inactiveCandidates" :key="u.id" class="px-3 py-1.5 border-b border-gray-100 last:border-0 flex items-center justify-between">
                  <span class="text-gray-700">{{ u.name }} <span class="text-gray-400 text-xs">— {{ u.email }}</span></span>
                  <span class="text-xs text-gray-400">{{ u.last_login_at ? fmtAbsolute(u.last_login_at) : 'never' }}</span>
                </li>
              </ul>
            </div>
            <div v-else-if="inactiveCutoff" class="text-sm text-gray-500 italic">No users match this cut-off.</div>
          </div>
          <div class="modal-footer">
            <button @click="showInactiveModal = false" class="btn-secondary">Cancel</button>
            <button @click="bulkDeleteInactive" :disabled="inactiveCandidates.length === 0 || saving"
              class="btn-primary" style="background:#DC2626;border-color:#DC2626">
              {{ saving ? 'Deleting…' : 'Delete ' + inactiveCandidates.length + ' user' + (inactiveCandidates.length === 1 ? '' : 's') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,

  data() {
    return {
      users: [],
      showModal: false,
      editing: null,
      form: { name: '', email: '', password: '', is_admin: false },
      saving: false,
      error: '',
      // Search / sort / select
      search: '',
      sortKey: 'last_login_at',
      sortDir: 'asc', // ascending = oldest first by default per user request
      selectedIds: [],
      // Purge-inactive modal
      showInactiveModal: false,
      inactiveCutoff: '',
      includeNeverLogged: true,
    };
  },

  computed: {
    filteredUsers() {
      const q = (this.search || '').trim().toLowerCase();
      let list = this.users.slice();
      if (q) {
        list = list.filter(u => {
          if ((u.name || '').toLowerCase().includes(q)) return true;
          if ((u.email || '').toLowerCase().includes(q)) return true;
          if (Array.isArray(u.projects) && u.projects.some(p =>
            (p.project_number || '').toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q)
          )) return true;
          return false;
        });
      }
      const k = this.sortKey, dir = this.sortDir === 'desc' ? -1 : 1;
      list.sort((a, b) => {
        let av = a[k], bv = b[k];
        // Treat null last_login_at as "very old" so they sort to the top in asc mode
        if (k === 'last_login_at') {
          av = av ? new Date(av).getTime() : 0;
          bv = bv ? new Date(bv).getTime() : 0;
        } else {
          av = (av || '').toString().toLowerCase();
          bv = (bv || '').toString().toLowerCase();
        }
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
      return list;
    },

    inactiveCandidates() {
      if (!this.inactiveCutoff) return [];
      const cutoff = new Date(this.inactiveCutoff + 'T00:00:00').getTime();
      return this.users.filter(u => {
        if (!u.last_login_at) return this.includeNeverLogged;
        return new Date(u.last_login_at).getTime() < cutoff;
      });
    },
  },

  async mounted() {
    await this.load();
  },

  methods: {
    async load() {
      this.users = await API.getUsers();
      // Drop selections that no longer exist after a reload
      const valid = new Set(this.users.map(u => u.id));
      this.selectedIds = this.selectedIds.filter(id => valid.has(id));
    },

    setSort(key) {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortKey = key;
        this.sortDir = key === 'last_login_at' ? 'asc' : 'asc';
      }
    },

    sortIcon(key) {
      if (this.sortKey !== key) return '↕';
      return this.sortDir === 'asc' ? '▲' : '▼';
    },

    toggleSelectAll(e) {
      if (e.target.checked) {
        const ids = new Set(this.selectedIds);
        for (const u of this.filteredUsers) ids.add(u.id);
        this.selectedIds = Array.from(ids);
      } else {
        const filterIds = new Set(this.filteredUsers.map(u => u.id));
        this.selectedIds = this.selectedIds.filter(id => !filterIds.has(id));
      }
    },

    fmtAbsolute(iso) {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      } catch { return ''; }
    },

    fmtRelative(iso) {
      if (!iso) return '';
      const ms = Date.now() - new Date(iso).getTime();
      const days = Math.floor(ms / (1000 * 60 * 60 * 24));
      if (days < 1) return 'today';
      if (days === 1) return 'yesterday';
      if (days < 30) return days + ' days ago';
      const months = Math.floor(days / 30);
      if (months < 12) return months + ' month' + (months === 1 ? '' : 's') + ' ago';
      const years = Math.floor(days / 365);
      return years + ' year' + (years === 1 ? '' : 's') + ' ago';
    },

    projectChipStyle(status) {
      // Color code by Project.status: ACTIVE (open) — navy, ON_HOLD — amber, CLOSED — gray.
      const s = (status || 'ACTIVE').toUpperCase();
      if (s === 'CLOSED') return 'background:#9CA3AF;color:#fff';        // gray-400
      if (s === 'ON_HOLD') return 'background:#D97706;color:#fff';        // amber-600
      return 'background:#1B4F8C;color:#fff';                              // active = navy
    },

    projectStatusLabel(status) {
      const s = (status || 'ACTIVE').toUpperCase();
      if (s === 'CLOSED') return 'Closed';
      if (s === 'ON_HOLD') return 'On hold';
      return 'Active';
    },

    lastLoginClass(iso) {
      if (!iso) return 'text-amber-600';
      const ms = Date.now() - new Date(iso).getTime();
      const days = Math.floor(ms / (1000 * 60 * 60 * 24));
      if (days > 365) return 'text-red-600';
      if (days > 180) return 'text-amber-600';
      if (days > 30) return 'text-gray-600';
      return 'text-emerald-700';
    },

    openModal(u = null) {
      this.editing = u;
      this.form = u
        ? { name: u.name, email: u.email, password: '', is_admin: u.role === 'ADMIN' }
        : { name: '', email: '', password: '', is_admin: false };
      this.error = '';
      this.showModal = true;
    },

    async save() {
      if (!this.form.name || !this.form.email) { this.error = 'Name and email are required.'; return; }
      if (!this.editing && !this.form.password) { this.error = 'Password is required for new users.'; return; }
      this.saving = true;
      this.error = '';
      try {
        const data = {
          name: this.form.name,
          email: this.form.email,
          is_admin: this.form.is_admin,
        };
        if (this.form.password) data.password = this.form.password;
        if (this.editing) {
          await API.updateUser(this.editing.id, data);
        } else {
          await API.createUser(data);
        }
        await this.load();
        this.showModal = false;
      } catch (e) {
        this.error = e.message;
      } finally {
        this.saving = false;
      }
    },

    async deleteUser(u) {
      if (!confirm(`Delete user "${u.name}"?`)) return;
      await API.deleteUser(u.id);
      await this.load();
    },

    async bulkDeleteSelected() {
      const n = this.selectedIds.length;
      if (n === 0) return;
      if (!confirm(`Delete ${n} selected user${n === 1 ? '' : 's'}? This cannot be undone.`)) return;
      this.saving = true;
      try {
        const result = await API.bulkDeleteUsers({ ids: this.selectedIds });
        if (result.skipped_self) {
          alert(`Note: your own account was skipped (cannot delete yourself).`);
        }
        this.selectedIds = [];
        await this.load();
      } catch (e) {
        alert(e.message || 'Bulk delete failed.');
      } finally {
        this.saving = false;
      }
    },

    openInactiveModal() {
      // Default cut-off: 12 months ago
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      this.inactiveCutoff = d.toISOString().slice(0, 10);
      this.includeNeverLogged = true;
      this.showInactiveModal = true;
    },

    async bulkDeleteInactive() {
      const candidates = this.inactiveCandidates;
      if (candidates.length === 0) return;
      if (!confirm(`Delete ${candidates.length} inactive user${candidates.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
      this.saving = true;
      try {
        const ids = candidates.map(u => u.id);
        const result = await API.bulkDeleteUsers({ ids });
        if (result.skipped_self) {
          alert(`Note: your own account was skipped (cannot delete yourself).`);
        }
        this.showInactiveModal = false;
        await this.load();
      } catch (e) {
        alert(e.message || 'Bulk delete failed.');
      } finally {
        this.saving = false;
      }
    },
  },
});
