// ─────────────────────────────────────────────────────────────────────────────
// Project Organization: Contact List + Packages tabs
// ─────────────────────────────────────────────────────────────────────────────
app.component('contacts-module', {
  props: ['currentUser', 'currentProject', 'initialTab',
          'canExportFullDb', 'exportingFullDb'],
  emits: ['subtab-change', 'export-full-db'],
  template: `
    <div>
      <!-- Tab bar -->
      <div class="flex items-center gap-0 border-b border-gray-200 mb-6">
        <button @click="tab='contacts'" :class="['sub-tab', tab==='contacts' ? 'active' : '']">
          Contact List
        </button>
        <button @click="tab='org-chart'" :class="['sub-tab', tab==='org-chart' ? 'active' : '']">
          Organization Chart
        </button>
        <button @click="tab='packages'" :class="['sub-tab', tab==='packages' ? 'active' : '']">
          Packages
        </button>
        <button @click="tab='subservices'" :class="['sub-tab', tab==='subservices' ? 'active' : '']">
          Subservices
        </button>
        <button @click="tab='areas'" :class="['sub-tab', tab==='areas' ? 'active' : '']">
          Areas
        </button>
        <button @click="tab='units'" :class="['sub-tab', tab==='units' ? 'active' : '']">
          Units
        </button>
        <!-- Right-side: Full Database Export (ADMIN / PROJECT_OWNER only) -->
        <button v-if="canExportFullDb"
          @click="$emit('export-full-db')"
          :disabled="exportingFullDb"
          class="ml-auto mb-1 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50"
          title="Download an Excel workbook with every module of this project on a separate sheet">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          {{ exportingFullDb ? 'Exporting...' : 'Full Database Export' }}
        </button>
      </div>

      <!-- Contact List Tab -->
      <div v-if="tab==='contacts'">
        <p v-if="canManage" class="text-xs text-gray-400 italic mb-3">Tip: click a role badge in the Project Access column to change it inline.</p>
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <div class="relative w-72">
              <svg class="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
              </svg>
              <input v-model="search" type="text" placeholder="Search contacts..." class="input-field pl-9"/>
            </div>
            <select v-model="filterPackageId" class="input-field w-56" :class="filterPackageId ? 'border-ips-blue text-ips-dark font-medium' : ''">
              <option :value="null">All packages</option>
              <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
            </select>
            <button v-if="filterPackageId" @click="filterPackageId = null" class="text-xs text-gray-500 hover:text-gray-700 underline">Clear</button>
          </div>
          <div class="flex gap-2">
            <button v-if="canManage" @click="openAddUserModal()" class="btn-secondary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
              </svg>
              Add Existing User
            </button>
            <button @click="exportExcel" :disabled="exporting" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              {{ exporting ? 'Exporting...' : 'Export Excel' }}
            </button>
            <button v-if="canManage" @click="openImportModal('contacts')" class="btn-secondary text-sm flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0l-3 3m3-3l3 3"/></svg>
              Import
            </button>
            <button v-if="canManage" @click="openContactModal()" class="btn-primary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              Add Contact
            </button>
          </div>
        </div>

        <div class="card overflow-hidden p-0">
          <table class="w-full">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Function</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Package(s)</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Project Access</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredContacts.length === 0">
                <td colspan="6" class="px-4 py-8 text-center text-gray-400">No contacts found</td>
              </tr>
              <tr v-for="c in filteredContacts" :key="c.id" class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0" style="background:#00AEEF">
                      {{ initials(c.name) }}
                    </div>
                    <div>
                      <span class="font-medium text-gray-800">{{ c.name }}</span>
                      <span v-if="c.company" class="block text-xs text-gray-400">{{ c.company }}</span>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3 text-gray-600 text-sm">{{ c.function || '—' }}</td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1">
                    <span v-for="pkg in contactPackages(c.id)" :key="pkg.id"
                      class="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-ips-dark">
                      {{ pkg.tag_number }}
                    </span>
                    <span v-if="contactPackages(c.id).length === 0" class="text-gray-400 text-xs">—</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <a v-if="c.email" :href="'mailto:' + c.email" class="text-sm hover:underline block" style="color:#00AEEF">{{ c.email }}</a>
                  <span v-else class="text-gray-400 text-sm block">—</span>
                  <a v-if="c.phone" :href="'tel:' + c.phone" class="text-xs text-gray-500 hover:text-gray-700 block mt-0.5">{{ c.phone }}</a>
                </td>
                <td class="px-4 py-3">
                  <!-- Has linked user -->
                  <div v-if="c.linked_user_id">
                    <!-- Inline role editor -->
                    <div v-if="canManage && editingRoleContactId === c.id" class="flex items-center gap-1">
                      <select v-model="editingRoleValue" class="text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ips-blue">
                        <option value="">— Select role —</option>
                        <option v-for="r in roleOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
                      </select>
                      <button @click="saveRole(c)" class="text-xs text-green-600 hover:text-green-800 font-medium px-1">Save</button>
                      <button @click="editingRoleContactId = null" class="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
                    </div>
                    <!-- Has role - show badge -->
                    <span v-else-if="c.project_role"
                      :class="['px-2 py-0.5 rounded-full text-xs font-semibold', canManage ? 'cursor-pointer' : '', roleBadgeClass(c.project_role)]"
                      :title="canManage ? 'Click to change role' : ''"
                      @click="canManage ? startEditRole(c) : null">
                      {{ roleLabel(c.project_role) }}
                    </span>
                    <!-- No role yet - show Assign Role for managers -->
                    <button v-else-if="canManage" @click="startEditRole(c)"
                      class="text-xs text-ips-blue hover:text-ips-dark font-medium flex items-center gap-1">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                      </svg>
                      Assign Role
                    </button>
                    <span v-else class="text-xs text-gray-400 italic">No project role</span>
                  </div>
                  <!-- No linked user - show Set Up Access if owner -->
                  <button v-else-if="canManage && c.email" @click="openCreateAccountModal(c)"
                    class="text-xs text-ips-blue hover:text-ips-dark font-medium flex items-center gap-1">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                    </svg>
                    Set Up Access
                  </button>
                  <span v-else class="text-xs text-gray-300">—</span>
                </td>
                <td v-if="canManage" class="px-4 py-3">
                  <div class="flex items-center gap-1 justify-end">
                    <button @click="openContactModal(c)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                    </button>
                    <button @click="deleteContact(c)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </td>
                <td v-else class="px-4 py-3"></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="mt-2 text-xs text-gray-400">{{ filteredContacts.length }} of {{ contacts.length }} contacts</div>
      </div>

      <!-- Packages Tab -->
      <packages-module
        v-else-if="tab==='packages'"
        :contacts="contacts"
        :current-user="currentUser"
        v-on:packages-changed="loadPackages">
      </packages-module>

      <!-- Subservices Tab -->
      <subservices-module
        v-else-if="tab==='subservices'"
        :contacts="contacts"
        :current-user="currentUser">
      </subservices-module>

      <!-- ── Areas Tab ── -->
      <div v-else-if="tab==='areas'">
        <div class="flex gap-2 mb-4">
          <button :class="['btn-secondary', areasSubTab === 'list' ? 'font-semibold' : '']" @click="areasSubTab = 'list'">Area List</button>
          <button :class="['btn-secondary', areasSubTab === 'floorplans' ? 'font-semibold' : '']" @click="onAreasSubTabFloorplans">Floor Plans</button>
        </div>

      <div v-if="areasSubTab === 'list'">
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-500">Project areas used as location references across modules</p>
          <div class="flex gap-2">
            <button v-if="canManage" @click="openImportModal('areas')" class="btn-secondary text-sm flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0l-3 3m3-3l3 3"/></svg>
              Import
            </button>
            <button v-if="canManage" @click="openAreaModal()" class="btn-primary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              New Area
            </button>
          </div>
        </div>
        <div v-if="areasLoading" class="text-center py-8 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
        <div v-else-if="areas.length === 0" class="card text-center py-10 text-gray-400">
          No areas defined yet.
        </div>
        <div v-else class="card overflow-hidden p-0">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Tag</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Area Owner</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Site Supervisors</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-56">Floorplan</th>
                <th v-if="canManage" class="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in areas" :key="a.id" class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3">
                  <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ a.tag }}</span>
                </td>
                <td class="px-4 py-3 font-medium text-gray-800">{{ a.description }}</td>
                <td class="px-4 py-3 text-gray-500 max-w-xs truncate" :title="a.details">{{ a.details || '—' }}</td>
                <td class="px-4 py-3 text-gray-600">{{ a.owner_name || '—' }}</td>
                <td class="px-4 py-3 text-gray-600">
                  <div v-if="(a.site_supervisors || []).length === 0" class="text-gray-300">—</div>
                  <div v-else class="flex flex-wrap gap-1">
                    <span v-for="s in a.site_supervisors" :key="s.id"
                      class="inline-block px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200"
                      :title="s.company || ''">{{ s.name }}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-gray-600">
                  <select v-if="canManage"
                          :value="a.floorplan_id || ''"
                          @change="onAreaFloorplanChange(a, $event.target.value)"
                          class="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-ips-blue w-full">
                    <option value="">— None —</option>
                    <option v-for="fp in floorplans" :key="fp.id" :value="fp.id">{{ fp.name }}</option>
                  </select>
                  <span v-else>{{ a.floorplan_name || '—' }}</span>
                </td>
                <td v-if="canManage" class="px-4 py-3">
                  <div class="flex gap-1 justify-end">
                    <button @click="openAreaModal(a)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button @click="deleteArea(a)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="areasSubTab === 'floorplans'">
        <floorplans-module
          :current-user="currentUser"
          :areas="areas"
          @areas-changed="onAreasChangedFromFloorplans">
        </floorplans-module>
      </div>

      </div>

      <!-- ── Units Tab ── -->
      <div v-else-if="tab==='units'">
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-500">Project units used as references across modules</p>
          <div class="flex gap-2">
            <button v-if="canManage" @click="openImportModal('units')" class="btn-secondary text-sm flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0l-3 3m3-3l3 3"/></svg>
              Import
            </button>
            <button v-if="canManage" @click="openUnitModal()" class="btn-primary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              New Unit
            </button>
          </div>
        </div>
        <div v-if="unitsLoading" class="text-center py-8 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
        <div v-else-if="units.length === 0" class="card text-center py-10 text-gray-400">
          No units defined yet.
        </div>
        <div v-else class="card overflow-hidden p-0">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Tag</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-48">Description</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Unit Owner</th>
                <th v-if="canManage" class="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in units" :key="u.id" class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3">
                  <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ u.tag }}</span>
                </td>
                <td class="px-4 py-3 font-medium text-gray-800">{{ u.description }}</td>
                <td class="px-4 py-3 text-gray-500 truncate" :title="u.details">{{ u.details || '—' }}</td>
                <td class="px-4 py-3 text-gray-600">{{ u.owner_name || '—' }}</td>
                <td v-if="canManage" class="px-4 py-3">
                  <div class="flex gap-1 justify-end">
                    <button @click="openUnitModal(u)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button @click="deleteUnit(u)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Area Modal ── -->
      <div v-if="showAreaModal" class="modal-overlay" @click.self="showAreaModal = false">
        <div class="modal-box">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ editingArea ? 'Edit Area' : 'New Area' }}</h3>
            <button @click="showAreaModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="form-label">Tag <span class="text-red-500">*</span></label>
                <input v-model="areaForm.tag" type="text" class="input-field" placeholder="e.g. AREA-01"/>
              </div>
              <div>
                <label class="form-label">Area Owner</label>
                <select v-model="areaForm.owner_id" class="input-field">
                  <option :value="null">— None —</option>
                  <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
            </div>
            <div>
              <label class="form-label">Description <span class="text-red-500">*</span></label>
              <input v-model="areaForm.description" type="text" class="input-field" placeholder="Short description"/>
            </div>
            <div>
              <label class="form-label">Details <span class="text-gray-400 font-normal">(optional)</span></label>
              <textarea v-model="areaForm.details" class="input-field" rows="3" placeholder="Additional information…"></textarea>
            </div>
            <div>
              <label class="form-label">
                Site Supervisors
                <span class="text-gray-400 font-normal">(multiple · only Project Owner, Project Team or Client contacts)</span>
              </label>
              <div class="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                <div v-if="eligibleSupervisors.length === 0" class="px-3 py-4 text-xs text-gray-400 text-center">
                  No eligible contacts — add Project Owners, Project Team members or Client contacts first.
                </div>
                <label v-for="s in eligibleSupervisors" :key="s.id"
                  class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                  <input type="checkbox" :value="s.id" v-model="areaForm.site_supervisor_ids" class="rounded"/>
                  <span class="text-gray-800">{{ s.name }}</span>
                  <span v-if="s.company" class="text-xs text-gray-400">· {{ s.company }}</span>
                  <span class="ml-auto text-[10px] uppercase tracking-wider text-gray-400">{{ s.role }}</span>
                </label>
              </div>
            </div>
            <p v-if="areaError" class="text-red-500 text-sm">{{ areaError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showAreaModal = false" class="btn-secondary">Cancel</button>
            <button @click="saveArea" :disabled="savingArea" class="btn-primary">
              {{ savingArea ? 'Saving…' : (editingArea ? 'Save Changes' : 'Create Area') }}
            </button>
          </div>
        </div>
      </div>

      <!-- ── Unit Modal ── -->
      <div v-if="showUnitModal" class="modal-overlay" @click.self="showUnitModal = false">
        <div class="modal-box">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ editingUnit ? 'Edit Unit' : 'New Unit' }}</h3>
            <button @click="showUnitModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="form-label">Tag <span class="text-red-500">*</span></label>
                <input v-model="unitForm.tag" type="text" class="input-field" placeholder="e.g. UNIT-01"/>
              </div>
              <div>
                <label class="form-label">Unit Owner</label>
                <select v-model="unitForm.owner_id" class="input-field">
                  <option :value="null">— None —</option>
                  <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
            </div>
            <div>
              <label class="form-label">Description <span class="text-red-500">*</span></label>
              <input v-model="unitForm.description" type="text" class="input-field" placeholder="Short description"/>
            </div>
            <div>
              <label class="form-label">Details <span class="text-gray-400 font-normal">(optional)</span></label>
              <textarea v-model="unitForm.details" class="input-field" rows="3" placeholder="Additional information…"></textarea>
            </div>
            <p v-if="unitError" class="text-red-500 text-sm">{{ unitError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showUnitModal = false" class="btn-secondary">Cancel</button>
            <button @click="saveUnit" :disabled="savingUnit" class="btn-primary">
              {{ savingUnit ? 'Saving…' : (editingUnit ? 'Save Changes' : 'Create Unit') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Contact Modal -->
      <div v-if="showContactModal" class="modal-overlay" @click.self="showContactModal = false">
        <div class="modal-box">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ editingContact ? 'Edit Contact' : 'New Contact' }}</h3>
            <button @click="showContactModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div v-if="isLinkedUserLocked" class="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Name and phone are managed by <strong>{{ editingContact && editingContact.linked_user_name }}</strong> in their personal profile and can't be edited here.
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2">
                <label class="form-label">Full Name *</label>
                <input v-model="contactForm.name" :disabled="isLinkedUserLocked" type="text" class="input-field" :class="isLinkedUserLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''" placeholder="John Doe"/>
              </div>
              <div>
                <label class="form-label">Company</label>
                <input v-model="contactForm.company" type="text" class="input-field" placeholder="Company name"/>
              </div>
              <div>
                <label class="form-label">Function / Role <span class="text-red-500">*</span></label>
                <input v-model="contactForm.function" type="text" class="input-field" placeholder="Project Manager"/>
              </div>
              <div class="col-span-2">
                <label class="form-label">Email Address</label>
                <input v-model="contactForm.email" type="email" class="input-field" placeholder="john@company.com"/>
                <p v-if="contactForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactForm.email.trim())"
                  class="text-red-500 text-xs mt-1">Please enter a valid email address.</p>
              </div>
              <div class="col-span-2">
                <label class="form-label">Phone</label>
                <input v-model="contactForm.phone" :disabled="isLinkedUserLocked" type="text" class="input-field" :class="isLinkedUserLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''" placeholder="+32 ..."/>
              </div>
            </div>
            <p v-if="contactError" class="text-red-500 text-sm mt-3">{{ contactError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showContactModal = false" class="btn-secondary">Cancel</button>
            <button @click="saveContact" :disabled="savingContact" class="btn-primary">
              {{ savingContact ? 'Saving...' : (editingContact ? 'Save Changes' : 'Add Contact') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Add Existing User Modal -->
      <div v-if="showAddUserModal" class="modal-overlay" @click.self="showAddUserModal = false">
        <div class="modal-box" style="max-width:440px">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">Add Existing User to Project</h3>
            <button @click="showAddUserModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="space-y-4">
              <div>
                <label class="form-label">User *</label>
                <select v-model="addUserForm.user_id" class="input-field">
                  <option :value="null">— Select user —</option>
                  <option v-for="u in availableUsers" :key="u.id" :value="u.id">{{ u.name }} ({{ u.email }})</option>
                </select>
                <p v-if="availableUsers.length === 0" class="text-xs text-gray-400 mt-1">All platform users are already in this project.</p>
              </div>
              <div>
                <label class="form-label">Project Role *</label>
                <select v-model="addUserForm.role" class="input-field">
                  <option value="">— Select role —</option>
                  <option v-for="r in roleOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
                </select>
              </div>
              <p v-if="addUserError" class="text-red-500 text-sm">{{ addUserError }}</p>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="showAddUserModal = false" class="btn-secondary">Cancel</button>
            <button @click="saveAddUser" :disabled="savingAddUser" class="btn-primary">
              {{ savingAddUser ? 'Adding...' : 'Add to Project' }}
            </button>
          </div>
        </div>
      </div>

      <!-- ── Organization Chart Tab ── -->
      <div v-else-if="tab==='org-chart'">
        <org-chart-module :current-user="currentUser" :contacts="contacts" :current-project="currentProject" @open-contact="handleOpenContactFromChart"></org-chart-module>
      </div>

      <!-- Create Account Modal -->
      <div v-if="showCreateAccountModal" class="modal-overlay" @click.self="showCreateAccountModal = false">
        <div class="modal-box" style="max-width:440px">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">Set Up Project Access for {{ createAccountContact && createAccountContact.name }}</h3>
            <button @click="showCreateAccountModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <!-- Result state -->
            <div v-if="createAccountResult" class="space-y-3">
              <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                <p class="text-green-800 font-medium text-sm">
                  {{ createAccountResult.linked_existing ? 'Existing account linked successfully!' : 'Account created successfully!' }}
                </p>
                <p class="text-green-700 text-sm mt-1">{{ createAccountResult.name }} can now log in with <strong>{{ createAccountResult.email }}</strong>.</p>
                <div v-if="createAccountResult.temp_password" class="mt-3 bg-white border border-green-300 rounded p-3">
                  <p class="text-xs text-gray-500 mb-1">Temporary password (share securely):</p>
                  <p class="font-mono text-sm font-bold text-gray-800">{{ createAccountResult.temp_password }}</p>
                  <p class="text-xs text-gray-400 mt-1">User will be prompted to set a new password on first login.</p>
                </div>
              </div>
            </div>
            <!-- Form state -->
            <div v-else class="space-y-4">
              <div class="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
                Project access will be set up for <strong>{{ createAccountContact && createAccountContact.name }}</strong>
                using email <strong>{{ createAccountContact && createAccountContact.email }}</strong>.
                If an account with this email already exists it will be linked automatically.
              </div>
              <div>
                <label class="form-label">Project Role *</label>
                <select v-model="createAccountForm.role" class="input-field">
                  <option value="">— Select role —</option>
                  <option v-for="r in roleOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
                </select>
              </div>
              <div>
                <label class="form-label">Initial Password (optional)</label>
                <input v-model="createAccountForm.password" type="password" class="input-field" placeholder="Leave blank to generate a temporary password" autocomplete="off" readonly @focus="$event.target.removeAttribute('readonly')"/>
                <p class="text-xs text-gray-400 mt-1">If left blank, a temporary password is generated and the user must set a new one on first login.</p>
              </div>
              <p v-if="createAccountError" class="text-red-500 text-sm">{{ createAccountError }}</p>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="showCreateAccountModal = false" class="btn-secondary">{{ createAccountResult ? 'Close' : 'Cancel' }}</button>
            <button v-if="!createAccountResult" @click="saveCreateAccount" :disabled="savingCreateAccount" class="btn-primary">
              {{ savingCreateAccount ? 'Saving...' : 'Set Up Access' }}
            </button>
          </div>
        </div>
      </div>

      <!-- ── Org Import Modal (contacts / areas / units) ── -->
      <div v-if="orgImport.show" class="modal-overlay" @click.self="orgImport.show = false">
        <div class="modal-box" style="max-width:880px">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">Import {{ orgImportTitle }} from Excel</h3>
            <button @click="orgImport.show = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body space-y-4">
            <div v-if="orgImport.result" class="rounded-lg p-4 bg-green-50 border border-green-200 text-sm text-green-800 space-y-1">
              <p class="font-semibold">Import completed successfully.</p>
              <p>Created: <strong>{{ orgImport.result.created }}</strong> &nbsp; Updated: <strong>{{ orgImport.result.updated }}</strong> &nbsp; Skipped: <strong>{{ orgImport.result.skipped }}</strong></p>
            </div>
            <div v-if="!orgImport.preview && !orgImport.result" class="space-y-3">
              <p class="text-sm text-gray-600">Upload an Excel file (.xlsx) to import {{ orgImportTitle.toLowerCase() }}. Download the template first to see the expected format and lookup values.</p>
              <div class="flex items-center gap-3 flex-wrap">
                <button @click="downloadOrgTemplate" class="btn-secondary text-sm flex items-center gap-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 8l-3-3m3 3l3-3"/></svg>
                  Download Template
                </button>
                <label class="btn-secondary text-sm cursor-pointer flex items-center gap-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                  Choose File
                  <input type="file" accept=".xlsx" class="hidden" @change="onOrgImportFileChange" />
                </label>
                <span v-if="orgImport.file" class="text-sm text-gray-600">{{ orgImport.file.name }}</span>
              </div>
              <p v-if="orgImport.error" class="text-red-500 text-sm">{{ orgImport.error }}</p>
              <p class="text-xs text-gray-400">Unique key: <strong>ID</strong> column. Leave blank to create new records; fill in an existing ID to update.</p>
            </div>
            <div v-if="orgImport.preview && !orgImport.result" class="space-y-3">
              <div class="flex items-center gap-4 text-sm flex-wrap">
                <span class="px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium">{{ orgImport.preview.summary.creates }} to create</span>
                <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">{{ orgImport.preview.summary.updates }} to update</span>
                <span v-if="orgImport.preview.summary.errors > 0" class="px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium">{{ orgImport.preview.summary.errors }} error(s)</span>
              </div>
              <p v-if="orgImport.error" class="text-red-500 text-sm">{{ orgImport.error }}</p>
              <div class="overflow-x-auto max-h-96 border rounded">
                <table class="w-full text-xs">
                  <thead class="bg-gray-100 sticky top-0">
                    <tr>
                      <th class="px-2 py-1 text-left">Row</th>
                      <th class="px-2 py-1 text-left">Action</th>
                      <th class="px-2 py-1 text-left">ID</th>
                      <th v-for="col in orgImportPreviewColumns" :key="col.key" class="px-2 py-1 text-left">{{ col.label }}</th>
                      <th class="px-2 py-1 text-left">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in orgImport.preview.rows" :key="r.row_num"
                      :class="r.errors.length ? 'bg-red-50' : (r.warnings && r.warnings.length ? 'bg-yellow-50' : '')">
                      <td class="px-2 py-1 text-gray-500">{{ r.row_num }}</td>
                      <td class="px-2 py-1"><span :class="r.action==='CREATE' ? 'text-green-700 font-semibold' : 'text-blue-700 font-semibold'">{{ r.action }}</span></td>
                      <td class="px-2 py-1 text-gray-500">{{ r.id || '—' }}</td>
                      <td v-for="col in orgImportPreviewColumns" :key="col.key" class="px-2 py-1 max-w-xs truncate" :title="r[col.key]">{{ r[col.key] || '—' }}</td>
                      <td class="px-2 py-1">
                        <span v-for="e in r.errors" :key="e" class="block text-red-600">{{ e }}</span>
                        <span v-for="w in (r.warnings || [])" :key="w" class="block text-yellow-700">{{ w }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button v-if="!orgImport.result" @click="resetOrgImport" class="btn-secondary">{{ orgImport.preview ? 'Back' : 'Cancel' }}</button>
            <button v-if="orgImport.result" @click="closeOrgImportAndRefresh" class="btn-primary">Close &amp; Refresh</button>
            <button v-if="!orgImport.preview && !orgImport.result && orgImport.file" @click="runOrgImportPreview"
              :disabled="orgImport.loading" class="btn-primary">
              {{ orgImport.loading ? 'Analysing...' : 'Preview Import' }}
            </button>
            <button v-if="orgImport.preview && !orgImport.result && orgImport.preview.summary.errors === 0"
              @click="applyOrgImport" :disabled="orgImport.applying" class="btn-primary">
              {{ orgImport.applying ? 'Applying...' : 'Confirm &amp; Apply' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,

  data() {
    return {
      tab: 'contacts',
      exporting: false,
      contacts: [],
      packages: [],
      search: '',
      filterPackageId: null,
      // Project-organization import (shared modal for contacts / areas / units)
      orgImport: {
        show: false,
        kind: 'contacts',
        file: null,
        preview: null,
        result: null,
        loading: false,
        applying: false,
        error: '',
      },
      showContactModal: false,
      editingContact: null,
      contactForm: { name: '', email: '', company: '', phone: '', function: '' },
      savingContact: false,
      contactError: '',
      // Inline role editing
      editingRoleContactId: null,
      editingRoleValue: '',
      // Add existing user modal
      showAddUserModal: false,
      allUsers: [],
      projectUserIds: [],
      addUserForm: { user_id: null, role: '' },
      addUserError: '',
      savingAddUser: false,
      // Create account modal
      showCreateAccountModal: false,
      createAccountContact: null,
      createAccountForm: { role: '', password: '' },
      createAccountError: '',
      savingCreateAccount: false,
      createAccountResult: null,
      // Areas
      areas: [],
      areasLoading: false,
      areasSubTab: 'list',
      showAreaModal: false,
      editingArea: null,
      areaForm: { tag: '', description: '', details: '', owner_id: null, site_supervisor_ids: [] },
      eligibleSupervisors: [],
      areaError: '',
      savingArea: false,
      // Floorplans (loaded so the Areas list can show the inline select)
      floorplans: [],
      // Units
      units: [],
      unitsLoading: false,
      showUnitModal: false,
      editingUnit: null,
      unitForm: { tag: '', description: '', details: '', owner_id: null },
      unitError: '',
      savingUnit: false,
    };
  },

  computed: {
    filteredContacts() {
      const s = this.search.toLowerCase();
      const pkgId = this.filterPackageId;
      let pkgContactIds = null;
      if (pkgId) {
        const pkg = this.packages.find(p => p.id === pkgId);
        pkgContactIds = new Set(Array.isArray(pkg && pkg.contact_ids) ? pkg.contact_ids : []);
      }
      return this.contacts.filter(c => {
        if (pkgContactIds && !pkgContactIds.has(c.id)) return false;
        if (s && ![c.name, c.company, c.function, c.email].some(v => v && v.toLowerCase().includes(s))) return false;
        return true;
      });
    },

    canManage() {
      return this.currentUser && (
        this.currentUser.role === 'ADMIN' || this.currentUser.role === 'PROJECT_OWNER'
      );
    },

    availableUsers() {
      return this.allUsers.filter(u => !this.projectUserIds.includes(u.id));
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

    isLinkedUserLocked() {
      // Name/phone on a linked user's contact are managed through that user's
      // personal profile — editors who aren't the user themself (or ADMIN)
      // must see those fields as read-only here.
      const c = this.editingContact;
      if (!c || !c.linked_user_id) return false;
      if (!this.currentUser) return true;
      if (this.currentUser.role === 'ADMIN') return false;
      return this.currentUser.id !== c.linked_user_id;
    },

    orgImportTitle() {
      const map = { contacts: 'Contacts', areas: 'Areas', units: 'Units' };
      return map[this.orgImport.kind] || '';
    },

    orgImportPreviewColumns() {
      switch (this.orgImport.kind) {
        case 'contacts':
          return [
            { key: 'name',     label: 'Name' },
            { key: 'company',  label: 'Company' },
            { key: 'email',    label: 'Email' },
          ];
        case 'areas':
          return [
            { key: 'tag',         label: 'Tag' },
            { key: 'description', label: 'Description' },
            { key: 'owner_name',  label: 'Owner' },
          ];
        case 'units':
          return [
            { key: 'tag',         label: 'Tag' },
            { key: 'description', label: 'Description' },
            { key: 'owner_name',  label: 'Owner' },
          ];
        default:
          return [];
      }
    },
  },

  async mounted() {
    if (this.initialTab) this.tab = this.initialTab;
    await this.loadContacts();
    try { await this.loadPackages(); } catch (e) { console.warn('Packages load failed:', e); }
  },

  watch: {
    async tab(val) {
      this.$emit('subtab-change', val);
      if (val === 'areas') {
        if (this.areas.length === 0) await this.loadAreas();
        // Floorplans are needed so the inline select on the area list is populated.
        if (this.floorplans.length === 0) await this.loadFloorplans();
      }
      if (val === 'units' && this.units.length === 0) await this.loadUnits();
    },
  },

  methods: {
    async exportExcel() {
      this.exporting = true;
      try {
        const date = new Date().toISOString().split('T')[0];
        await API.download('/api/contacts/export/excel', `contacts_${date}.xlsx`);
      } catch (e) {
        alert('Export failed: ' + e.message);
      } finally { this.exporting = false; }
    },

    // ── Project-organization import (contacts / areas / units) ──
    openImportModal(kind) {
      this.orgImport = {
        show: true, kind,
        file: null, preview: null, result: null,
        loading: false, applying: false, error: '',
      };
    },
    resetOrgImport() {
      if (this.orgImport.preview) {
        this.orgImport.preview = null;
        this.orgImport.error = '';
      } else {
        this.orgImport.show = false;
      }
    },
    onOrgImportFileChange(e) {
      this.orgImport.file = e.target.files[0] || null;
      this.orgImport.error = '';
    },
    async downloadOrgTemplate() {
      try {
        if (this.orgImport.kind === 'contacts') await API.exportContactsTemplate();
        else if (this.orgImport.kind === 'areas') await API.exportAreasTemplate();
        else if (this.orgImport.kind === 'units') await API.exportUnitsTemplate();
      } catch (e) { alert(e.message || 'Download failed'); }
    },
    async runOrgImportPreview() {
      if (!this.orgImport.file) return;
      this.orgImport.loading = true;
      this.orgImport.error = '';
      try {
        const fn = this.orgImport.kind === 'contacts' ? API.previewContactsImport
                 : this.orgImport.kind === 'areas'    ? API.previewAreasImport
                 :                                      API.previewUnitsImport;
        this.orgImport.preview = await fn(this.orgImport.file);
      } catch (e) {
        this.orgImport.error = e.message || 'Preview failed';
      } finally {
        this.orgImport.loading = false;
      }
    },
    async applyOrgImport() {
      if (!this.orgImport.preview) return;
      this.orgImport.applying = true;
      this.orgImport.error = '';
      try {
        const fn = this.orgImport.kind === 'contacts' ? API.applyContactsImport
                 : this.orgImport.kind === 'areas'    ? API.applyAreasImport
                 :                                      API.applyUnitsImport;
        this.orgImport.result = await fn({ rows: this.orgImport.preview.rows });
      } catch (e) {
        this.orgImport.error = e.message || 'Import failed';
      } finally {
        this.orgImport.applying = false;
      }
    },
    async closeOrgImportAndRefresh() {
      const kind = this.orgImport.kind;
      this.orgImport.show = false;
      if (kind === 'contacts')   await this.loadContacts();
      else if (kind === 'areas') await this.loadAreas();
      else if (kind === 'units') await this.loadUnits();
    },

    async loadContacts() {
      this.contacts = await API.getContacts();
    },

    async loadPackages() {
      const result = await API.getPackages();
      this.packages = Array.isArray(result) ? result : [];
    },

    contactPackages(contactId) {
      if (!Array.isArray(this.packages)) return [];
      return this.packages.filter(p => p.contact_ids && p.contact_ids.includes(contactId));
    },

    initials(name) {
      return (name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    },

    roleLabel(role) {
      const map = {
        PROJECT_OWNER: 'Project Owner',
        PROJECT_TEAM: 'Project Team',
        CLIENT: 'Client',
        VENDOR: 'Vendor',
        BIDDER: 'Bidder',
      };
      return map[role] || role;
    },

    roleBadgeClass(role) {
      const map = {
        PROJECT_OWNER: 'bg-purple-100 text-purple-700',
        PROJECT_TEAM:  'bg-blue-100 text-blue-700',
        CLIENT:        'bg-green-100 text-green-700',
        VENDOR:        'bg-red-100 text-red-700',
        BIDDER:        'bg-amber-100 text-amber-700',
      };
      return map[role] || 'bg-gray-100 text-gray-600';
    },

    startEditRole(c) {
      this.editingRoleContactId = c.id;
      this.editingRoleValue = c.project_role || '';
    },

    async saveRole(c) {
      if (!this.editingRoleValue) return;
      try {
        await API.addProjectUser(API.getProjectId(), { user_id: c.linked_user_id, role: this.editingRoleValue });
        await this.loadContacts();
        this.editingRoleContactId = null;
      } catch (e) {
        alert(e.message);
      }
    },

    openContactModal(c = null) {
      this.editingContact = c;
      this.contactForm = c
        ? { name: c.name, email: c.email || '', company: c.company || '', phone: c.phone || '', function: c.function || '', updated_at: c.updated_at || null }
        : { name: '', email: '', company: '', phone: '', function: '', updated_at: null };
      this.contactError = '';
      this.showContactModal = true;
    },

    handleOpenContactFromChart(contactId) {
      const c = (this.contacts || []).find(x => x.id === contactId);
      if (c) this.openContactModal(c);
    },

    async saveContact() {
      if (!this.contactForm.name.trim()) { this.contactError = 'Name is required.'; return; }
      if (!this.contactForm.function || !this.contactForm.function.trim()) { this.contactError = 'Function / Role is required.'; return; }
      if (this.contactForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.contactForm.email.trim())) {
        this.contactError = 'Please enter a valid email address.'; return;
      }
      this.savingContact = true;
      this.contactError = '';
      try {
        if (this.editingContact) {
          await API.updateContact(this.editingContact.id, this.contactForm);
        } else {
          await API.createContact(this.contactForm);
        }
        await this.loadContacts();
        this.showContactModal = false;
      } catch (e) {
        this.contactError = e.status === 409
          ? 'This contact was modified by another user. Please close and reopen to get the latest version.'
          : e.message;
      } finally {
        this.savingContact = false;
      }
    },

    async deleteContact(c) {
      if (!confirm(`Delete contact "${c.name}"? This cannot be undone.`)) return;
      try {
        await API.deleteContact(c.id);
        await this.loadContacts();
      } catch (e) {
        alert(e.message);
      }
    },

    async openAddUserModal() {
      this.addUserForm = { user_id: null, role: '' };
      this.addUserError = '';
      const projectId = API.getProjectId();
      const [users, projectUsers] = await Promise.all([
        API.getUsers(),
        API.getProjectUsers(projectId),
      ]);
      this.allUsers = users;
      this.projectUserIds = projectUsers.map(u => u.user_id);
      this.showAddUserModal = true;
    },

    async saveAddUser() {
      if (!this.addUserForm.user_id) { this.addUserError = 'Please select a user.'; return; }
      if (!this.addUserForm.role) { this.addUserError = 'Please select a role.'; return; }
      this.savingAddUser = true;
      this.addUserError = '';
      try {
        await API.addProjectUser(API.getProjectId(), { user_id: this.addUserForm.user_id, role: this.addUserForm.role });
        await this.loadContacts();
        this.showAddUserModal = false;
      } catch (e) {
        this.addUserError = e.message;
      } finally {
        this.savingAddUser = false;
      }
    },

    openCreateAccountModal(c) {
      this.createAccountContact = c;
      this.createAccountForm = { role: '', password: '' };
      this.createAccountError = '';
      this.createAccountResult = null;
      this.showCreateAccountModal = true;
    },

    async saveCreateAccount() {
      if (!this.createAccountForm.role) { this.createAccountError = 'Please select a project role.'; return; }
      this.savingCreateAccount = true;
      this.createAccountError = '';
      try {
        const result = await API.createAccountFromContact(this.createAccountContact.id, {
          role: this.createAccountForm.role,
          password: this.createAccountForm.password || null,
        });
        this.createAccountResult = result;
        await this.loadContacts();
      } catch (e) {
        this.createAccountError = e.message;
      } finally {
        this.savingCreateAccount = false;
      }
    },

    // ── Areas ──────────────────────────────────────────────────────────────────
    async loadAreas() {
      this.areasLoading = true;
      try { this.areas = await API.getAreas(); }
      catch (e) { console.error('Areas load failed:', e); }
      finally { this.areasLoading = false; }
    },

    openAreaModal(area = null) {
      this.editingArea = area;
      this.areaForm = area
        ? {
            tag: area.tag,
            description: area.description,
            details: area.details || '',
            owner_id: area.owner_id,
            site_supervisor_ids: [...(area.site_supervisor_ids || [])],
          }
        : { tag: '', description: '', details: '', owner_id: null, site_supervisor_ids: [] };
      this.areaError = '';
      this.showAreaModal = true;
      // Load (or refresh) the eligible-supervisor list each time the modal
      // opens so newly-added team members / clients appear without a reload.
      this.loadEligibleSupervisors();
    },

    async loadEligibleSupervisors() {
      try { this.eligibleSupervisors = await API.getEligibleAreaSupervisors(); }
      catch (e) { console.error('Load eligible supervisors failed:', e); }
    },

    async saveArea() {
      if (!this.areaForm.tag.trim()) { this.areaError = 'Tag is required.'; return; }
      if (!this.areaForm.description.trim()) { this.areaError = 'Description is required.'; return; }
      this.savingArea = true;
      this.areaError = '';
      try {
        const body = {
          tag: this.areaForm.tag.trim(),
          description: this.areaForm.description.trim(),
          details: this.areaForm.details || null,
          owner_id: this.areaForm.owner_id || null,
          site_supervisor_ids: Array.isArray(this.areaForm.site_supervisor_ids)
            ? this.areaForm.site_supervisor_ids.map(Number) : [],
        };
        if (this.editingArea) {
          await API.updateArea(this.editingArea.id, body);
        } else {
          await API.createArea(body);
        }
        this.showAreaModal = false;
        await this.loadAreas();
      } catch (e) {
        this.areaError = e.message;
      } finally {
        this.savingArea = false;
      }
    },

    async deleteArea(area) {
      if (!confirm(`Delete area "${area.tag} — ${area.description}"?`)) return;
      try {
        await API.deleteArea(area.id);
        await this.loadAreas();
      } catch (e) {
        alert(e.message);
      }
    },

    // ── Floorplans (only the bits needed by the Areas tab) ────────────────────
    async loadFloorplans() {
      try { this.floorplans = await API.getFloorplans(); }
      catch (e) { console.error('Floorplans load failed:', e); }
    },

    async onAreasSubTabFloorplans() {
      this.areasSubTab = 'floorplans';
      // The floorplans component receives areas as a prop, so ensure they're loaded.
      if (this.areas.length === 0) await this.loadAreas();
    },

    async onAreaFloorplanChange(area, newValue) {
      const id = newValue ? Number(newValue) : null;
      if ((area.floorplan_id || null) === id) return;
      try {
        const updated = await API.setAreaFloorplan(area.id, id);
        // Patch the local row in place so we don't refetch the whole list
        Object.assign(area, updated);
      } catch (e) {
        alert(e.message || 'Could not update floorplan');
        await this.loadAreas();
      }
    },

    async onAreasChangedFromFloorplans() {
      // The floorplans component changed area->floorplan links; refresh both lists.
      await Promise.all([this.loadAreas(), this.loadFloorplans()]);
    },

    // ── Units ──────────────────────────────────────────────────────────────────
    async loadUnits() {
      this.unitsLoading = true;
      try { this.units = await API.getUnits(); }
      catch (e) { console.error('Units load failed:', e); }
      finally { this.unitsLoading = false; }
    },

    openUnitModal(unit = null) {
      this.editingUnit = unit;
      this.unitForm = unit
        ? { tag: unit.tag, description: unit.description, details: unit.details || '', owner_id: unit.owner_id }
        : { tag: '', description: '', details: '', owner_id: null };
      this.unitError = '';
      this.showUnitModal = true;
    },

    async saveUnit() {
      if (!this.unitForm.tag.trim()) { this.unitError = 'Tag is required.'; return; }
      if (!this.unitForm.description.trim()) { this.unitError = 'Description is required.'; return; }
      this.savingUnit = true;
      this.unitError = '';
      try {
        const body = {
          tag: this.unitForm.tag.trim(),
          description: this.unitForm.description.trim(),
          details: this.unitForm.details || null,
          owner_id: this.unitForm.owner_id || null,
        };
        if (this.editingUnit) {
          await API.updateUnit(this.editingUnit.id, body);
        } else {
          await API.createUnit(body);
        }
        this.showUnitModal = false;
        await this.loadUnits();
      } catch (e) {
        this.unitError = e.message;
      } finally {
        this.savingUnit = false;
      }
    },

    async deleteUnit(unit) {
      if (!confirm(`Delete unit "${unit.tag} — ${unit.description}"?`)) return;
      try {
        await API.deleteUnit(unit.id);
        await this.loadUnits();
      } catch (e) {
        alert(e.message);
      }
    },
  },
});
