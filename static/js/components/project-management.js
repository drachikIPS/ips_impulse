// ─────────────────────────────────────────────────────────────────────────────
// Project Management Component (ADMIN only)
// ─────────────────────────────────────────────────────────────────────────────
app.component('project-management-module', {
  props: ['currentUser'],

  data() {
    return {
      tab: 'projects',   // projects | users

      // Projects list
      projects: [],
      loading: false,
      projectSearch: '',
      projectStatusFilter: 'ACTIVE',  // ACTIVE | ON_HOLD | CLOSED | ALL

      // Project form (add/edit)
      showProjectForm: false,
      editingProject: null,
      projectForm: {
        project_number: '',
        description: '',
        client: '',
        client_reference: '',
        general_description: '',
        start_date: '',
        end_date: '',
        status: 'ACTIVE',
        location: '',
      },
      projectError: '',
      savingProject: false,

      // Selected project for user management
      selectedProject: null,
      projectUsers: [],
      allUsers: [],
      usersLoading: false,

      // Add user to project
      showAddUser: false,
      addUserForm: { user_id: '', role: 'PROJECT_TEAM' },
      addUserError: '',
      addingUser: false,

      // Confirm delete
      confirmDeleteProject: null,
      deletingProject: false,
    };
  },

  computed: {
    statusOptions() {
      return ['ACTIVE', 'ON_HOLD', 'CLOSED'];
    },
    roleOptions() {
      return [
        { value: 'PROJECT_OWNER', label: 'Project Owner' },
        { value: 'PROJECT_TEAM',  label: 'Project Team' },
        { value: 'CLIENT',        label: 'Client' },
        { value: 'VENDOR',        label: 'Vendor' },
        { value: 'BIDDER',        label: 'Bidder' },
      ];
    },
    availableUsers() {
      const assigned = new Set(this.projectUsers.map(u => u.user_id));
      return this.allUsers.filter(u => !assigned.has(u.id) && u.role !== 'ADMIN');
    },
    statusCounts() {
      const c = { ACTIVE: 0, ON_HOLD: 0, CLOSED: 0 };
      for (const p of this.projects) if (p.status in c) c[p.status]++;
      c.ALL = this.projects.length;
      return c;
    },
    filteredProjects() {
      const q = (this.projectSearch || '').trim().toLowerCase();
      return this.projects.filter(p => {
        if (this.projectStatusFilter !== 'ALL' && p.status !== this.projectStatusFilter) return false;
        if (!q) return true;
        const hay = [p.project_number, p.description, p.client, p.client_reference, p.location, p.general_description]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    },
  },

  async mounted() {
    await this.loadProjects();
    this.allUsers = await API.getUsers().catch(() => []);
  },

  methods: {
    // ── Projects ──────────────────────────────────────────────────────────────
    async loadProjects() {
      this.loading = true;
      try {
        this.projects = await API.getProjects();
      } finally {
        this.loading = false;
      }
    },

    openAddProject() {
      this.editingProject = null;
      this.projectForm = {
        project_number: '', description: '', client: '', client_reference: '',
        general_description: '', start_date: '', end_date: '', status: 'ACTIVE', location: '',
      };
      this.projectError = '';
      this.showProjectForm = true;
    },

    openEditProject(p) {
      this.editingProject = p;
      this.projectForm = {
        project_number: p.project_number || '',
        description: p.description || '',
        client: p.client || '',
        client_reference: p.client_reference || '',
        general_description: p.general_description || '',
        start_date: p.start_date || '',
        end_date: p.end_date || '',
        status: p.status || 'ACTIVE',
        location: p.location || '',
      };
      this.projectError = '';
      this.showProjectForm = true;
    },

    async saveProject() {
      // Required fields (all visible form inputs except Status, which has a default).
      const required = [
        ['project_number',     'Project Number'],
        ['description',        'Description'],
        ['client',             'Client'],
        ['client_reference',   'Client Reference'],
        ['location',           'Location'],
        ['start_date',         'Start Date'],
        ['end_date',           'End Date'],
        ['general_description','General Description'],
      ];
      for (const [k, label] of required) {
        const v = (this.projectForm[k] || '').toString().trim();
        if (!v) { this.projectError = `${label} is required.`; return; }
      }
      if (this.projectForm.project_number.trim().length > 15) {
        this.projectError = 'Project Number must be 15 characters or fewer.';
        return;
      }
      this.savingProject = true;
      this.projectError = '';
      try {
        const data = { ...this.projectForm };
        if (this.editingProject) {
          await API.updateProject(this.editingProject.id, data);
        } else {
          await API.createProject(data);
        }
        this.showProjectForm = false;
        await this.loadProjects();
      } catch (e) {
        this.projectError = e.message || 'Save failed.';
      } finally {
        this.savingProject = false;
      }
    },

    async deleteProject() {
      if (!this.confirmDeleteProject) return;
      this.deletingProject = true;
      try {
        await API.deleteProject(this.confirmDeleteProject.id);
        this.confirmDeleteProject = null;
        if (this.selectedProject && this.selectedProject.id === this.confirmDeleteProject?.id) {
          this.selectedProject = null;
          this.projectUsers = [];
        }
        await this.loadProjects();
      } catch (e) {
        alert(e.message || 'Delete failed.');
      } finally {
        this.deletingProject = false;
      }
    },

    statusBadge(status) {
      const map = {
        ACTIVE: 'bg-green-100 text-green-800',
        ON_HOLD: 'bg-yellow-100 text-yellow-800',
        CLOSED: 'bg-red-100 text-red-800',
      };
      return map[status] || 'bg-gray-100 text-gray-600';
    },

    // ── User management ───────────────────────────────────────────────────────
    async openProjectUsers(p) {
      this.selectedProject = p;
      this.tab = 'users';
      await this.loadProjectUsers();
    },

    async loadProjectUsers() {
      if (!this.selectedProject) return;
      this.usersLoading = true;
      try {
        this.projectUsers = await API.getProjectUsers(this.selectedProject.id);
      } finally {
        this.usersLoading = false;
      }
    },

    async changeUserRole(u, newRole) {
      try {
        await API.addProjectUser(this.selectedProject.id, { user_id: u.user_id, role: newRole });
        u.role = newRole;
      } catch (e) {
        alert(e.message || 'Failed to update role.');
      }
    },

    async removeUser(u) {
      if (!confirm(`Remove ${u.name} from this project?`)) return;
      try {
        await API.removeProjectUser(this.selectedProject.id, u.user_id);
        this.projectUsers = this.projectUsers.filter(x => x.user_id !== u.user_id);
      } catch (e) {
        alert(e.message || 'Failed to remove user.');
      }
    },

    openAddUser() {
      this.addUserForm = { user_id: '', role: 'PROJECT_TEAM' };
      this.addUserError = '';
      this.showAddUser = true;
    },

    async addUser() {
      if (!this.addUserForm.user_id) {
        this.addUserError = 'Please select a user.';
        return;
      }
      this.addingUser = true;
      this.addUserError = '';
      try {
        await API.addProjectUser(this.selectedProject.id, {
          user_id: parseInt(this.addUserForm.user_id),
          role: this.addUserForm.role,
        });
        this.showAddUser = false;
        await this.loadProjectUsers();
      } catch (e) {
        this.addUserError = e.message || 'Failed to add user.';
      } finally {
        this.addingUser = false;
      }
    },

    roleBadge(role) {
      return {
        PROJECT_OWNER: 'bg-purple-100 text-purple-800',
        PROJECT_TEAM:  'bg-blue-100 text-blue-800',
        CLIENT:        'bg-teal-100 text-teal-800',
        VENDOR:        'bg-orange-100 text-orange-800',
        BIDDER:        'bg-amber-100 text-amber-800',
      }[role] || 'bg-gray-100 text-gray-600';
    },

    roleLabel(role) {
      return {
        PROJECT_OWNER: 'Project Owner',
        PROJECT_TEAM:  'Project Team',
        CLIENT:        'Client',
        VENDOR:        'Vendor',
        BIDDER:        'Bidder',
      }[role] || role;
    },
  },

  template: `
<div>
  <!-- Tabs -->
  <div class="sub-tab-bar">
    <button @click="tab='projects'; selectedProject=null" :class="['sub-tab', tab==='projects'?'active':'']">
      All Projects
    </button>
    <button v-if="selectedProject" :class="['sub-tab', tab==='users'?'active':'']" @click="tab='users'">
      Users — {{ selectedProject.project_number }}
    </button>
  </div>

  <!-- ══ Projects Tab ══ -->
  <div v-if="tab==='projects'" class="content-area">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-gray-800">Projects</h2>
      <button @click="openAddProject" class="btn-primary">
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        New Project
      </button>
    </div>

    <div v-if="loading" class="text-center py-10 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="projects.length===0" class="card text-center py-10 text-gray-400">No projects yet.</div>

    <template v-else>
      <!-- Search + status toggle -->
      <div class="flex flex-wrap items-center gap-3 mb-3">
        <div class="relative flex-1 min-w-[240px] max-w-sm">
          <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
               fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"/>
          </svg>
          <input v-model="projectSearch" type="search"
                 placeholder="Search by number, description, client, location…"
                 class="input-field pl-9 w-full"/>
        </div>
        <div class="inline-flex rounded-md border border-gray-200 bg-white overflow-hidden text-xs">
          <button v-for="opt in [
                    {key:'ACTIVE',  label:'Active'},
                    {key:'ON_HOLD', label:'On Hold'},
                    {key:'CLOSED',  label:'Closed'},
                    {key:'ALL',     label:'All'}]"
                  :key="opt.key"
                  @click="projectStatusFilter = opt.key"
                  :class="['px-3 py-1.5 font-medium border-r border-gray-200 last:border-r-0',
                           projectStatusFilter === opt.key
                             ? 'bg-ips-blue text-white'
                             : 'text-gray-600 hover:bg-gray-50']">
            {{ opt.label }}
            <span :class="['ml-1 px-1.5 rounded text-[10px]',
                           projectStatusFilter === opt.key
                             ? 'bg-white/20'
                             : 'bg-gray-100 text-gray-500']">
              {{ statusCounts[opt.key] || 0 }}
            </span>
          </button>
        </div>
        <div class="ml-auto text-xs text-gray-400">
          {{ filteredProjects.length }} of {{ projects.length }}
        </div>
      </div>

      <div v-if="filteredProjects.length === 0"
           class="card text-center py-10 text-gray-400">No projects match the current filter.</div>
      <div v-else class="space-y-3">
        <div v-for="p in filteredProjects" :key="p.id" class="card">
        <div class="flex items-start gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-bold text-gray-900 text-base">{{ p.project_number }}</span>
              <span :class="['text-xs font-medium px-2 py-0.5 rounded-full', statusBadge(p.status)]">
                {{ p.status }}
              </span>
            </div>
            <p v-if="p.description" class="text-sm text-gray-600 mb-1">{{ p.description }}</p>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span v-if="p.client"><span class="font-medium">Client:</span> {{ p.client }}</span>
              <span v-if="p.client_reference"><span class="font-medium">Ref:</span> {{ p.client_reference }}</span>
              <span v-if="p.location"><span class="font-medium">Location:</span> {{ p.location }}</span>
              <span v-if="p.start_date"><span class="font-medium">Start:</span> {{ p.start_date }}</span>
              <span v-if="p.end_date"><span class="font-medium">End:</span> {{ p.end_date }}</span>
            </div>
            <p v-if="p.general_description" class="text-xs text-gray-500 mt-1">{{ p.general_description }}</p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button @click="openProjectUsers(p)" class="btn-secondary text-xs">
              <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              Users
            </button>
            <button @click="openEditProject(p)" class="btn-secondary text-xs">Edit</button>
            <button @click="confirmDeleteProject=p" class="text-red-500 hover:text-red-700 p-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
        </div>
      </div>
    </template>

    <!-- Project Form Modal -->
    <div v-if="showProjectForm" class="modal-overlay" @click.self="showProjectForm=false">
      <div class="modal-box modal-xl">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">{{ editingProject ? 'Edit Project' : 'New Project' }}</h3>
          <button @click="showProjectForm=false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2 sm:col-span-1">
            <label class="form-label">Project Number <span class="text-red-500">*</span></label>
            <input v-model="projectForm.project_number" class="input-field"
                   maxlength="15" placeholder="e.g. PRJ-2024-001"/>
            <p class="text-xs text-gray-400 mt-0.5">Max 15 characters · used in folder paths.</p>
          </div>
          <div class="col-span-2 sm:col-span-1">
            <label class="form-label">Status</label>
            <select v-model="projectForm.status" class="input-field">
              <option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="col-span-2">
            <label class="form-label">Description <span class="text-red-500">*</span></label>
            <input v-model="projectForm.description" class="input-field" placeholder="Short description"/>
          </div>
          <div>
            <label class="form-label">Client <span class="text-red-500">*</span></label>
            <input v-model="projectForm.client" class="input-field" placeholder="Client name"/>
          </div>
          <div>
            <label class="form-label">Client Reference <span class="text-red-500">*</span></label>
            <input v-model="projectForm.client_reference" class="input-field" placeholder="Client ref. number"/>
          </div>
          <div>
            <label class="form-label">Location <span class="text-red-500">*</span></label>
            <input v-model="projectForm.location" class="input-field" placeholder="City, Country"/>
          </div>
          <div>
            <label class="form-label">Start Date <span class="text-red-500">*</span></label>
            <input v-model="projectForm.start_date" type="date" class="input-field"/>
          </div>
          <div>
            <label class="form-label">End Date <span class="text-red-500">*</span></label>
            <input v-model="projectForm.end_date" type="date" class="input-field"/>
          </div>
          <div class="col-span-2">
            <label class="form-label">General Description <span class="text-red-500">*</span></label>
            <textarea v-model="projectForm.general_description" class="input-field" rows="3"
              placeholder="Detailed description of the project..."></textarea>
          </div>
        </div>
        <p v-if="projectError" class="text-red-500 text-sm mt-2">{{ projectError }}</p>
        </div><!-- end modal-body -->
        <div class="modal-footer">
          <button @click="showProjectForm=false" class="btn-secondary">Cancel</button>
          <button @click="saveProject" :disabled="savingProject" class="btn-primary">
            {{ savingProject ? 'Saving...' : 'Save Project' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirm Modal -->
    <div v-if="confirmDeleteProject" class="modal-overlay" @click.self="confirmDeleteProject=null">
      <div class="modal-box">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-red-600">Delete Project</h3>
        </div>
        <div class="modal-body">
          <p class="text-sm text-gray-600">
            Delete <strong>{{ confirmDeleteProject.project_number }}</strong>? This will delete
            all project data (contacts, meetings, budget, risks). This cannot be undone.
          </p>
        </div>
        <div class="modal-footer">
          <button @click="confirmDeleteProject=null" class="btn-secondary">Cancel</button>
          <button @click="deleteProject" :disabled="deletingProject"
            class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
            {{ deletingProject ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ══ Users Tab ══ -->
  <div v-if="tab==='users' && selectedProject" class="content-area">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold text-gray-800">
          Team — {{ selectedProject.project_number }}
        </h2>
        <p class="text-sm text-gray-500">{{ selectedProject.description }}</p>
      </div>
      <button @click="openAddUser" class="btn-primary">
        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Add User
      </button>
    </div>

    <div v-if="usersLoading" class="text-center py-10 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="projectUsers.length===0" class="card text-center py-8 text-gray-400">
      No users assigned to this project yet.
    </div>
    <div v-else class="card p-0 overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-gray-50 border-b border-gray-200">
            <th class="text-left px-4 py-3 font-medium text-gray-600">Name</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Email</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Role</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="u in projectUsers" :key="u.user_id" class="hover:bg-gray-50">
            <td class="px-4 py-3 font-medium text-gray-800">{{ u.name }}</td>
            <td class="px-4 py-3 text-gray-500">{{ u.email }}</td>
            <td class="px-4 py-3">
              <select :value="u.role" @change="changeUserRole(u, $event.target.value)"
                :class="['text-xs border border-gray-200 rounded px-2 py-1 bg-white font-medium', roleBadge(u.role)]">
                <option v-for="r in roleOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
              </select>
            </td>
            <td class="px-4 py-3 text-right">
              <button @click="removeUser(u)" class="text-red-400 hover:text-red-600 p-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add User Modal -->
    <div v-if="showAddUser" class="modal-overlay" @click.self="showAddUser=false">
      <div class="modal-box modal-lg">
        <div class="modal-header">
          <h3 class="text-lg font-semibold text-gray-800">Add User to Project</h3>
          <button @click="showAddUser=false" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body space-y-3">
          <div>
            <label class="form-label">User</label>
            <select v-model="addUserForm.user_id" class="input-field">
              <option value="">\u2014 Select user \u2014</option>
              <option v-for="u in availableUsers" :key="u.id" :value="u.id">
                {{ u.name }} ({{ u.email }})
              </option>
            </select>
          </div>
          <div>
            <label class="form-label">Role in this project</label>
            <select v-model="addUserForm.role" class="input-field">
              <option v-for="r in roleOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
            </select>
          </div>
          <p v-if="addUserError" class="text-red-500 text-sm">{{ addUserError }}</p>
        </div>
        <div class="modal-footer">
          <button @click="showAddUser=false" class="btn-secondary">Cancel</button>
          <button @click="addUser" :disabled="addingUser" class="btn-primary">
            {{ addingUser ? 'Adding...' : 'Add User' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
  `,
});
