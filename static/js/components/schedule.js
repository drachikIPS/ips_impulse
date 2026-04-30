// ─────────────────────────────────────────────────────────────────────────────
// Schedule Management Component
// ─────────────────────────────────────────────────────────────────────────────
app.component('schedule-module', {
  props: ['currentUser', 'contacts', 'pendingOpen', 'initialTab'],
  emits: ['subtab-change', 'record-change'],
  template: `
<div>
  <!-- Tab bar -->
  <div class="sub-tab-bar">
    <button v-for="t in visibleTabs" :key="t.id"
      @click="activeTab = t.id"
      :class="['sub-tab', activeTab === t.id ? 'active' : '']">
      {{ t.label }}
      <span v-if="t.id === 'approvals' && pendingPrApprovals.length > 0"
        class="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{{ pendingPrApprovals.length }}</span>
    </button>
  </div>

  <!-- ── Tasks Tab ─────────────────────────────────────────────────────────── -->
  <div v-if="activeTab === 'tasks'">
    <!-- Toolbar -->
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Group view selector -->
        <div class="flex items-center bg-gray-100 rounded-lg p-1 h-9">
          <button @click="taskGroupView='package'" :class="['px-3 h-7 text-sm font-medium rounded-md transition-colors', taskGroupView==='package' ? 'bg-white shadow-sm text-ips-blue' : 'text-gray-600 hover:text-gray-800']">Package</button>
          <button @click="taskGroupView='area'"    :class="['px-3 h-7 text-sm font-medium rounded-md transition-colors', taskGroupView==='area'    ? 'bg-white shadow-sm text-ips-blue' : 'text-gray-600 hover:text-gray-800']">Area</button>
          <button @click="taskGroupView='unit'"    :class="['px-3 h-7 text-sm font-medium rounded-md transition-colors', taskGroupView==='unit'    ? 'bg-white shadow-sm text-ips-blue' : 'text-gray-600 hover:text-gray-800']">Unit</button>
          <button @click="taskGroupView='list'"    :class="['px-3 h-7 text-sm font-medium rounded-md transition-colors', taskGroupView==='list'    ? 'bg-white shadow-sm text-ips-blue' : 'text-gray-600 hover:text-gray-800']">All Tasks</button>
        </div>
        <!-- Status filter -->
        <select v-model="taskStatusFilter" class="h-9 text-sm font-medium border border-gray-300 rounded-lg px-3 bg-white text-gray-700">
          <option value="">All statuses</option>
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="review">Under Review</option>
          <option value="draft">Draft PR</option>
          <option value="late">Late</option>
          <option value="complete">Complete</option>
        </select>
      </div>
      <div class="flex items-center gap-2">
        <button v-if="taskGroupView !== 'list'" @click="toggleAllGroups"
          class="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path v-if="allGroupsExpanded" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
            <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
          {{ allGroupsExpanded ? 'Collapse All' : 'Expand All' }}
        </button>
        <button v-if="canManage" @click="openTaskImportModal" class="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 4v12m0-4l-3 3m3-3l3 3"/></svg>
          Import
        </button>
        <button @click="exportTasksReport" :disabled="tasksExporting" class="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          {{ tasksExporting ? 'Exporting...' : 'Export Excel' }}
        </button>
        <button v-if="canManage || accountManagerPackageIds.length > 0" @click="openTaskForm(null)" class="inline-flex items-center h-9 px-4 text-sm font-medium rounded-lg bg-ips-blue text-white hover:opacity-90 transition-colors">+ Add Task</button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-8 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="filteredTasks.length === 0" class="empty-state">
      <p class="text-gray-500">{{ tasks.length === 0 ? 'No tasks defined yet.' : 'No tasks match the selected filter.' }}</p>
    </div>

    <div v-else>

      <!-- ── Grouped by Package ── -->
      <div v-if="taskGroupView === 'package'" class="space-y-4 pb-16">
        <div v-for="group in tasksGroupedByPackage" :key="group.package_id" class="card">
          <div class="flex items-center justify-between cursor-pointer p-4" @click="togglePackage(group.package_id)">
            <div class="flex items-center gap-3">
              <svg class="w-4 h-4 text-gray-400 transition-transform shrink-0" :class="expandedPackages.includes(group.package_id) ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
              <div>
                <span class="font-semibold text-gray-800">{{ group.package_tag }}</span>
                <span v-if="group.package_name" class="text-gray-500 ml-2">{{ group.package_name }}</span>
              </div>
            </div>
            <div class="flex items-center gap-3 text-sm text-gray-500">
              <span>{{ group.tasks.length }} task{{ group.tasks.length !== 1 ? 's' : '' }}</span>
              <span v-if="group.financialWeight > 0">Weight: <strong>{{ fmt(group.financialWeight) }}</strong></span>
            </div>
          </div>
          <div v-if="expandedPackages.includes(group.package_id)" class="border-t border-gray-100 overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <th class="text-left px-4 py-2 font-semibold w-24 whitespace-nowrap">ID</th>
                  <th class="text-left px-4 py-2 font-semibold">Task</th>
                  <th class="text-left px-4 py-2 font-semibold">Area</th>
                  <th class="text-left px-4 py-2 font-semibold">Unit</th>
                  <th class="text-left px-4 py-2 font-semibold whitespace-nowrap">Start</th>
                  <th class="text-left px-4 py-2 font-semibold whitespace-nowrap">Finish</th>
                  <th class="text-right px-4 py-2 font-semibold">Weight</th>
                  <th class="px-4 py-2 font-semibold w-36">Progress</th>
                  <th class="text-left px-4 py-2 font-semibold">Status</th>
                  <th class="text-left px-4 py-2 font-semibold w-14">PMC</th>
                  <th class="text-left px-4 py-2 font-semibold w-16">Client</th>
                  <th v-if="canManagePackage(group.package_id)" class="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="task in group.tasks" :key="task.id" class="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-2 text-xs text-gray-400 font-mono whitespace-nowrap">{{ task.seq_id ? 'T-' + String(task.seq_id).padStart(6,'0') : '' }}</td>
                  <td class="px-4 py-2 font-medium text-gray-800">{{ task.description }}</td>
                  <td class="px-4 py-2 text-gray-500 text-xs whitespace-nowrap" :title="task.area_description || ''">{{ task.area_tag || '—' }}</td>
                  <td class="px-4 py-2 text-gray-500 text-xs whitespace-nowrap" :title="task.unit_description || ''">{{ task.unit_tag || '—' }}</td>
                  <td class="px-4 py-2 text-gray-500 whitespace-nowrap">{{ formatDate(task.start_date) || '—' }}</td>
                  <td class="px-4 py-2 text-gray-500 whitespace-nowrap">{{ formatDate(task.finish_date) || '—' }}</td>
                  <td class="px-4 py-2 text-right text-gray-600">{{ task.financial_weight != null ? fmt(task.financial_weight) : '—' }}</td>
                  <td class="px-4 py-2">
                    <div class="flex items-center gap-2">
                      <div class="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div class="h-1.5 rounded-full transition-all" :class="task.is_late ? 'bg-red-500' : task.current_progress >= 100 ? 'bg-green-500' : 'bg-blue-500'" :style="'width:' + Math.min(task.current_progress, 100) + '%'"></div>
                      </div>
                      <span class="text-xs font-medium text-gray-600 w-8 text-right shrink-0">{{ Math.round(task.current_progress) }}%</span>
                    </div>
                  </td>
                  <td class="px-4 py-2">
                    <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', taskStatusBadge(task).cls]">{{ taskStatusBadge(task).label }}</span>
                  </td>
                  <td class="px-4 py-2" :title="task.active_pr_id ? 'PMC: ' + (task.active_pr_entry_pmc_approved === true ? 'Approved' : task.active_pr_entry_pmc_approved === false ? 'Rejected' : 'Pending') : ''">
                    <svg v-if="task.active_pr_id && task.active_pr_entry_pmc_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    <svg v-else-if="task.active_pr_id && task.active_pr_entry_pmc_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    <svg v-else-if="task.active_pr_id" class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                    <span v-else class="text-gray-300 text-xs">—</span>
                  </td>
                  <td class="px-4 py-2" :title="task.active_pr_id ? 'Client: ' + (task.active_pr_entry_client_approved === true ? 'Approved' : task.active_pr_entry_client_approved === false ? 'Rejected' : 'Pending') : ''">
                    <svg v-if="task.active_pr_id && task.active_pr_entry_client_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    <svg v-else-if="task.active_pr_id && task.active_pr_entry_client_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    <svg v-else-if="task.active_pr_id" class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                    <span v-else class="text-gray-300 text-xs">—</span>
                  </td>
                  <td v-if="canManagePackage(task.package_id)" class="px-4 py-2">
                    <div class="flex gap-1 justify-end">
                      <button @click="openTaskForm(task)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                      <button @click="confirmDeleteTask(task)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <!-- Unassigned -->
        <div v-if="unassignedTasks.length > 0" class="card">
          <div class="flex items-center justify-between cursor-pointer p-4" @click="togglePackage('unassigned')">
            <div class="flex items-center gap-3">
              <svg class="w-4 h-4 text-gray-400 transition-transform shrink-0" :class="expandedPackages.includes('unassigned') ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
              <span class="font-semibold text-gray-500 italic">No Package Assigned</span>
            </div>
            <span class="text-sm text-gray-400">{{ unassignedTasks.length }} task(s)</span>
          </div>
          <div v-if="expandedPackages.includes('unassigned')" class="border-t border-gray-100 overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <th class="text-left px-4 py-2 font-semibold">Task</th>
                  <th class="text-left px-4 py-2 font-semibold">Area</th>
                  <th class="text-left px-4 py-2 font-semibold">Unit</th>
                  <th class="text-left px-4 py-2 font-semibold">Start</th>
                  <th class="text-left px-4 py-2 font-semibold">Finish</th>
                  <th class="text-right px-4 py-2 font-semibold">Weight</th>
                  <th class="px-4 py-2 font-semibold w-36">Progress</th>
                  <th class="text-left px-4 py-2 font-semibold">Status</th>
                  <th class="text-left px-4 py-2 font-semibold w-14">PMC</th>
                  <th class="text-left px-4 py-2 font-semibold w-16">Client</th>
                  <th v-if="canManage" class="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="task in unassignedTasks" :key="task.id" class="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-2 font-medium text-gray-800">{{ task.description }}</td>
                  <td class="px-4 py-2 text-gray-500 text-xs whitespace-nowrap" :title="task.area_description || ''">{{ task.area_tag || '—' }}</td>
                  <td class="px-4 py-2 text-gray-500 text-xs whitespace-nowrap" :title="task.unit_description || ''">{{ task.unit_tag || '—' }}</td>
                  <td class="px-4 py-2 text-gray-500 whitespace-nowrap">{{ formatDate(task.start_date) || '—' }}</td>
                  <td class="px-4 py-2 text-gray-500 whitespace-nowrap">{{ formatDate(task.finish_date) || '—' }}</td>
                  <td class="px-4 py-2 text-right text-gray-600">{{ task.financial_weight != null ? fmt(task.financial_weight) : '—' }}</td>
                  <td class="px-4 py-2">
                    <div class="flex items-center gap-2">
                      <div class="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div class="h-1.5 rounded-full bg-blue-500" :style="'width:' + Math.min(task.current_progress, 100) + '%'"></div>
                      </div>
                      <span class="text-xs text-gray-500 w-8 text-right shrink-0">{{ Math.round(task.current_progress) }}%</span>
                    </div>
                  </td>
                  <td class="px-4 py-2">
                    <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', taskStatusBadge(task).cls]">{{ taskStatusBadge(task).label }}</span>
                  </td>
                  <td class="px-4 py-2" :title="task.active_pr_id ? 'PMC: ' + (task.active_pr_entry_pmc_approved === true ? 'Approved' : task.active_pr_entry_pmc_approved === false ? 'Rejected' : 'Pending') : ''">
                    <svg v-if="task.active_pr_id && task.active_pr_entry_pmc_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    <svg v-else-if="task.active_pr_id && task.active_pr_entry_pmc_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    <svg v-else-if="task.active_pr_id" class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                    <span v-else class="text-gray-300 text-xs">—</span>
                  </td>
                  <td class="px-4 py-2" :title="task.active_pr_id ? 'Client: ' + (task.active_pr_entry_client_approved === true ? 'Approved' : task.active_pr_entry_client_approved === false ? 'Rejected' : 'Pending') : ''">
                    <svg v-if="task.active_pr_id && task.active_pr_entry_client_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    <svg v-else-if="task.active_pr_id && task.active_pr_entry_client_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    <svg v-else-if="task.active_pr_id" class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                    <span v-else class="text-gray-300 text-xs">—</span>
                  </td>
                  <td v-if="canManage" class="px-4 py-2">
                    <div class="flex gap-1 justify-end">
                      <button @click="openTaskForm(task)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                      <button @click="confirmDeleteTask(task)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ── Grouped by Area ── -->
      <div v-else-if="taskGroupView === 'area'" class="space-y-4 pb-16">
        <div v-for="group in tasksGroupedByArea" :key="group.area_id || '__none__'" class="card">
          <div class="flex items-center justify-between cursor-pointer p-4" @click="toggleArea(group.area_id || '__none__')">
            <div class="flex items-center gap-3">
              <svg class="w-4 h-4 text-gray-400 transition-transform shrink-0" :class="expandedAreas.includes(group.area_id || '__none__') ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
              <span :class="group.area_id ? 'font-semibold text-gray-800' : 'font-semibold text-gray-500 italic'">{{ group.area_label }}</span>
            </div>
            <span class="text-sm text-gray-500">{{ group.tasks.length }} task{{ group.tasks.length !== 1 ? 's' : '' }}</span>
          </div>
          <div v-if="expandedAreas.includes(group.area_id || '__none__')" class="border-t border-gray-100 overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <th class="text-left px-4 py-2 font-semibold">Task</th>
                  <th class="text-left px-4 py-2 font-semibold">Package</th>
                  <th class="text-left px-4 py-2 font-semibold">Unit</th>
                  <th class="text-left px-4 py-2 font-semibold whitespace-nowrap">Start</th>
                  <th class="text-left px-4 py-2 font-semibold whitespace-nowrap">Finish</th>
                  <th class="text-right px-4 py-2 font-semibold">Weight</th>
                  <th class="px-4 py-2 font-semibold w-36">Progress</th>
                  <th class="text-left px-4 py-2 font-semibold">Status</th>
                  <th class="text-left px-4 py-2 font-semibold w-14">PMC</th>
                  <th class="text-left px-4 py-2 font-semibold w-16">Client</th>
                  <th v-if="canManage" class="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="task in group.tasks" :key="task.id" class="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-2 font-medium text-gray-800">{{ task.description }}</td>
                  <td class="px-4 py-2 text-gray-500 text-xs whitespace-nowrap" :title="task.package_name || ''">{{ task.package_tag || '—' }}</td>
                  <td class="px-4 py-2 text-gray-500 text-xs whitespace-nowrap" :title="task.unit_description || ''">{{ task.unit_tag || '—' }}</td>
                  <td class="px-4 py-2 text-gray-500 whitespace-nowrap">{{ formatDate(task.start_date) || '—' }}</td>
                  <td class="px-4 py-2 text-gray-500 whitespace-nowrap">{{ formatDate(task.finish_date) || '—' }}</td>
                  <td class="px-4 py-2 text-right text-gray-600">{{ task.financial_weight != null ? fmt(task.financial_weight) : '—' }}</td>
                  <td class="px-4 py-2">
                    <div class="flex items-center gap-2">
                      <div class="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div class="h-1.5 rounded-full transition-all" :class="task.is_late ? 'bg-red-500' : task.current_progress >= 100 ? 'bg-green-500' : 'bg-blue-500'" :style="'width:' + Math.min(task.current_progress, 100) + '%'"></div>
                      </div>
                      <span class="text-xs font-medium text-gray-600 w-8 text-right shrink-0">{{ Math.round(task.current_progress) }}%</span>
                    </div>
                  </td>
                  <td class="px-4 py-2">
                    <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', taskStatusBadge(task).cls]">{{ taskStatusBadge(task).label }}</span>
                  </td>
                  <td class="px-4 py-2" :title="task.active_pr_id ? 'PMC: ' + (task.active_pr_entry_pmc_approved === true ? 'Approved' : task.active_pr_entry_pmc_approved === false ? 'Rejected' : 'Pending') : ''">
                    <svg v-if="task.active_pr_id && task.active_pr_entry_pmc_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    <svg v-else-if="task.active_pr_id && task.active_pr_entry_pmc_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    <svg v-else-if="task.active_pr_id" class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                    <span v-else class="text-gray-300 text-xs">—</span>
                  </td>
                  <td class="px-4 py-2" :title="task.active_pr_id ? 'Client: ' + (task.active_pr_entry_client_approved === true ? 'Approved' : task.active_pr_entry_client_approved === false ? 'Rejected' : 'Pending') : ''">
                    <svg v-if="task.active_pr_id && task.active_pr_entry_client_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    <svg v-else-if="task.active_pr_id && task.active_pr_entry_client_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    <svg v-else-if="task.active_pr_id" class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                    <span v-else class="text-gray-300 text-xs">—</span>
                  </td>
                  <td v-if="canManagePackage(task.package_id)" class="px-4 py-2">
                    <div class="flex gap-1 justify-end">
                      <button @click="openTaskForm(task)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                      <button @click="confirmDeleteTask(task)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ── Grouped by Unit ── -->
      <div v-else-if="taskGroupView === 'unit'" class="space-y-4 pb-16">
        <div v-for="group in tasksGroupedByUnit" :key="group.unit_id || '__none__'" class="card">
          <div class="flex items-center justify-between cursor-pointer p-4" @click="toggleUnit(group.unit_id || '__none__')">
            <div class="flex items-center gap-3">
              <svg class="w-4 h-4 text-gray-400 transition-transform shrink-0" :class="expandedUnits.includes(group.unit_id || '__none__') ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
              <span :class="group.unit_id ? 'font-semibold text-gray-800' : 'font-semibold text-gray-500 italic'">{{ group.unit_label }}</span>
            </div>
            <span class="text-sm text-gray-500">{{ group.tasks.length }} task{{ group.tasks.length !== 1 ? 's' : '' }}</span>
          </div>
          <div v-if="expandedUnits.includes(group.unit_id || '__none__')" class="border-t border-gray-100 overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <th class="text-left px-4 py-2 font-semibold">Task</th>
                  <th class="text-left px-4 py-2 font-semibold">Package</th>
                  <th class="text-left px-4 py-2 font-semibold">Area</th>
                  <th class="text-left px-4 py-2 font-semibold whitespace-nowrap">Start</th>
                  <th class="text-left px-4 py-2 font-semibold whitespace-nowrap">Finish</th>
                  <th class="text-right px-4 py-2 font-semibold">Weight</th>
                  <th class="px-4 py-2 font-semibold w-36">Progress</th>
                  <th class="text-left px-4 py-2 font-semibold">Status</th>
                  <th class="text-left px-4 py-2 font-semibold w-14">PMC</th>
                  <th class="text-left px-4 py-2 font-semibold w-16">Client</th>
                  <th v-if="canManage" class="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="task in group.tasks" :key="task.id" class="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-2 font-medium text-gray-800">{{ task.description }}</td>
                  <td class="px-4 py-2 text-gray-500 text-xs whitespace-nowrap" :title="task.package_name || ''">{{ task.package_tag || '—' }}</td>
                  <td class="px-4 py-2 text-gray-500 text-xs whitespace-nowrap" :title="task.area_description || ''">{{ task.area_tag || '—' }}</td>
                  <td class="px-4 py-2 text-gray-500 whitespace-nowrap">{{ formatDate(task.start_date) || '—' }}</td>
                  <td class="px-4 py-2 text-gray-500 whitespace-nowrap">{{ formatDate(task.finish_date) || '—' }}</td>
                  <td class="px-4 py-2 text-right text-gray-600">{{ task.financial_weight != null ? fmt(task.financial_weight) : '—' }}</td>
                  <td class="px-4 py-2">
                    <div class="flex items-center gap-2">
                      <div class="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div class="h-1.5 rounded-full transition-all" :class="task.is_late ? 'bg-red-500' : task.current_progress >= 100 ? 'bg-green-500' : 'bg-blue-500'" :style="'width:' + Math.min(task.current_progress, 100) + '%'"></div>
                      </div>
                      <span class="text-xs font-medium text-gray-600 w-8 text-right shrink-0">{{ Math.round(task.current_progress) }}%</span>
                    </div>
                  </td>
                  <td class="px-4 py-2">
                    <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', taskStatusBadge(task).cls]">{{ taskStatusBadge(task).label }}</span>
                  </td>
                  <td class="px-4 py-2" :title="task.active_pr_id ? 'PMC: ' + (task.active_pr_entry_pmc_approved === true ? 'Approved' : task.active_pr_entry_pmc_approved === false ? 'Rejected' : 'Pending') : ''">
                    <svg v-if="task.active_pr_id && task.active_pr_entry_pmc_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    <svg v-else-if="task.active_pr_id && task.active_pr_entry_pmc_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    <svg v-else-if="task.active_pr_id" class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                    <span v-else class="text-gray-300 text-xs">—</span>
                  </td>
                  <td class="px-4 py-2" :title="task.active_pr_id ? 'Client: ' + (task.active_pr_entry_client_approved === true ? 'Approved' : task.active_pr_entry_client_approved === false ? 'Rejected' : 'Pending') : ''">
                    <svg v-if="task.active_pr_id && task.active_pr_entry_client_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    <svg v-else-if="task.active_pr_id && task.active_pr_entry_client_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    <svg v-else-if="task.active_pr_id" class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                    <span v-else class="text-gray-300 text-xs">—</span>
                  </td>
                  <td v-if="canManagePackage(task.package_id)" class="px-4 py-2">
                    <div class="flex gap-1 justify-end">
                      <button @click="openTaskForm(task)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                      <button @click="confirmDeleteTask(task)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ── Flat list (All Tasks) ── -->
      <div v-else class="card p-0 overflow-hidden pb-16">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <th class="text-left px-4 py-3 font-semibold">Task</th>
              <th class="text-left px-4 py-3 font-semibold">Package</th>
              <th class="text-left px-4 py-3 font-semibold">Area</th>
              <th class="text-left px-4 py-3 font-semibold">Unit</th>
              <th class="text-left px-4 py-3 font-semibold whitespace-nowrap">Start</th>
              <th class="text-left px-4 py-3 font-semibold whitespace-nowrap">Finish</th>
              <th class="text-right px-4 py-3 font-semibold">Weight</th>
              <th class="px-4 py-3 font-semibold w-36">Progress</th>
              <th class="text-left px-4 py-3 font-semibold">Status</th>
              <th class="text-left px-4 py-3 font-semibold w-14">PMC</th>
              <th class="text-left px-4 py-3 font-semibold w-16">Client</th>
              <th v-if="canManage" class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-for="task in filteredTasks" :key="task.id" class="hover:bg-gray-50 transition-colors">
              <td class="px-4 py-2 font-medium text-gray-800">{{ task.description }}</td>
              <td class="px-4 py-2 text-gray-500 text-xs whitespace-nowrap" :title="task.package_name || ''">{{ task.package_tag || '—' }}</td>
              <td class="px-4 py-2 text-gray-500 text-xs whitespace-nowrap" :title="task.area_description || ''">{{ task.area_tag || '—' }}</td>
              <td class="px-4 py-2 text-gray-500 text-xs whitespace-nowrap" :title="task.unit_description || ''">{{ task.unit_tag || '—' }}</td>
              <td class="px-4 py-2 text-gray-500 whitespace-nowrap">{{ formatDate(task.start_date) || '—' }}</td>
              <td class="px-4 py-2 text-gray-500 whitespace-nowrap">{{ formatDate(task.finish_date) || '—' }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ task.financial_weight != null ? fmt(task.financial_weight) : '—' }}</td>
              <td class="px-4 py-2">
                <div class="flex items-center gap-2">
                  <div class="flex-1 bg-gray-200 rounded-full h-1.5">
                    <div class="h-1.5 rounded-full transition-all" :class="task.is_late ? 'bg-red-500' : task.current_progress >= 100 ? 'bg-green-500' : 'bg-blue-500'" :style="'width:' + Math.min(task.current_progress, 100) + '%'"></div>
                  </div>
                  <span class="text-xs font-medium text-gray-600 w-8 text-right shrink-0">{{ Math.round(task.current_progress) }}%</span>
                </div>
              </td>
              <td class="px-4 py-2">
                <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', taskStatusBadge(task).cls]">{{ taskStatusBadge(task).label }}</span>
              </td>
              <td class="px-4 py-2" :title="task.active_pr_id ? 'PMC: ' + (task.active_pr_entry_pmc_approved === true ? 'Approved' : task.active_pr_entry_pmc_approved === false ? 'Rejected' : 'Pending') : ''">
                <svg v-if="task.active_pr_id && task.active_pr_entry_pmc_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <svg v-else-if="task.active_pr_id && task.active_pr_entry_pmc_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                <svg v-else-if="task.active_pr_id" class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                <span v-else class="text-gray-300 text-xs">—</span>
              </td>
              <td class="px-4 py-2" :title="task.active_pr_id ? 'Client: ' + (task.active_pr_entry_client_approved === true ? 'Approved' : task.active_pr_entry_client_approved === false ? 'Rejected' : 'Pending') : ''">
                <svg v-if="task.active_pr_id && task.active_pr_entry_client_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                <svg v-else-if="task.active_pr_id && task.active_pr_entry_client_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                <svg v-else-if="task.active_pr_id" class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                <span v-else class="text-gray-300 text-xs">—</span>
              </td>
              <td v-if="canManagePackage(task.package_id)" class="px-4 py-2">
                <div class="flex gap-1 justify-end">
                  <button @click="openTaskForm(task)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                  <button @click="confirmDeleteTask(task)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>

    <!-- Sticky totals bar -->
    <div v-if="filteredTasks.length > 0"
      class="sticky bottom-0 z-20 bg-white border-t-2 border-gray-200 shadow-md px-4 py-3 flex items-center justify-between flex-wrap gap-3 text-sm">
      <span class="font-semibold text-gray-700">{{ taskStatusFilter ? 'Filtered' : 'Total' }}</span>
      <div class="flex items-center gap-6 text-gray-600 flex-wrap">
        <span>Tasks: <strong class="text-gray-800">{{ taskTotals.count }}</strong></span>
        <span>Total Weight: <strong class="text-gray-800">{{ fmt(taskTotals.weight) }}</strong></span>
        <span>Completed: <strong class="text-green-600">{{ taskTotals.completed }}</strong></span>
        <span>Late: <strong class="text-red-600">{{ taskTotals.late }}</strong></span>
      </div>
    </div>
  </div>

  <!-- ── Progress Reporting Tab ─────────────────────────────────────────────── -->
  <div v-if="activeTab === 'progress'">
    <div v-if="loading" class="text-center py-8 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else>
      <!-- Package cards -->
      <div v-if="tasksGroupedByPackage.length === 0" class="empty-state mb-4">
        <p class="text-gray-500">No tasks defined yet.</p>
      </div>
      <div v-else class="space-y-4 mb-6">
        <div v-for="group in tasksGroupedByPackage" :key="group.package_id" class="card p-4">
          <!-- Package header -->
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <span class="font-semibold text-gray-800">{{ group.package_tag }}</span>
              <span v-if="group.package_name" class="text-gray-500 ml-2 text-sm">{{ group.package_name }}</span>
              <div class="text-xs text-gray-400 mt-0.5">{{ group.tasks.length }} task(s)</div>
            </div>
            <div class="flex items-center gap-3">
              <!-- Approvals (PMC / Client) — always shown when a PR exists -->
              <div v-if="group.activePrId" class="space-y-0.5">
                <div class="flex items-center gap-1.5 text-xs">
                  <svg v-if="group.activePrPmcReviewed && group.activePrPmcApproved" class="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  <svg v-else-if="group.activePrPmcReviewed" class="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                  <svg v-else class="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                  <span :class="group.activePrPmcReviewed && group.activePrPmcApproved ? 'text-green-700' : (group.activePrPmcReviewed ? 'text-red-600' : 'text-gray-400')">
                    PMC: {{ group.activePrPmcReviewerName || '—' }}
                  </span>
                </div>
                <div class="flex items-center gap-1.5 text-xs">
                  <svg v-if="group.activePrClientReviewed && group.activePrClientApproved" class="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  <svg v-else-if="group.activePrClientReviewed" class="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                  <svg v-else class="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                  <span :class="group.activePrClientReviewed && group.activePrClientApproved ? 'text-green-700' : (group.activePrClientReviewed ? 'text-red-600' : 'text-gray-400')">
                    Client: {{ group.activePrClientReviewerName || '—' }}
                  </span>
                </div>
              </div>
              <!-- PR status badge (package-level) -->
              <span v-if="group.activePrStatus === 'SUBMITTED'"
                class="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Under Review</span>
              <span v-else-if="group.activePrStatus === 'REJECTED'"
                class="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Rejected — Action Required</span>
              <span v-else-if="group.activePrStatus === 'APPROVED'"
                class="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Approved</span>
              <span v-else-if="group.activePrStatus === 'DRAFT'"
                class="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Draft</span>
              <!-- History button (only if PR exists) -->
              <button v-if="group.activePrId" @click="openPrHistory({ id: group.activePrId, package_tag: group.package_tag, package_name: group.package_name })"
                class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded"
                title="Show review history">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                History
              </button>
              <!-- Attachment button (only if PR exists) -->
              <button v-if="group.activePrId" @click="openPrAttachModal(group.activePrId, group.package_tag)"
                class="btn-icon text-gray-400 hover:text-ips-blue" title="Attachments">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                </svg>
              </button>
              <!-- Action button -->
              <button v-if="canSubmitPrForGroup(group) && group.activePrStatus !== 'SUBMITTED'"
                @click="openBulkPrModal(group)"
                :class="group.activePrStatus === 'REJECTED'
                  ? 'inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors'
                  : 'btn-primary text-sm'">
                {{ group.activePrStatus === 'DRAFT' ? 'Edit Draft' : group.activePrStatus === 'REJECTED' ? 'Revise & Resubmit' : 'Report Progress' }}
              </button>
            </div>
          </div>
          <!-- Reviewer feedback (shown when REJECTED) -->
          <div v-if="group.activePrStatus === 'REJECTED'" class="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs space-y-1">
            <p v-if="group.activePrPmcComment" class="text-red-700"><span class="font-semibold">PMC:</span> {{ group.activePrPmcComment }}</p>
            <p v-if="group.activePrClientComment" class="text-red-700"><span class="font-semibold">Client:</span> {{ group.activePrClientComment }}</p>
          </div>
          <!-- Task rows -->
          <div class="space-y-1.5">
            <div v-for="task in group.tasks" :key="task.id" class="flex items-center gap-2 text-sm">
              <span class="text-gray-400 text-xs font-mono shrink-0 w-20 whitespace-nowrap">{{ task.seq_id ? 'T-' + String(task.seq_id).padStart(6,'0') : '' }}</span>
              <span class="text-gray-600 flex-1 truncate min-w-0" :title="task.description">{{ task.description }}</span>
              <span v-if="task.current_progress >= 100" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">Done</span>
              <span v-else-if="task.is_late" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">Late</span>
              <div class="w-24 bg-gray-200 rounded-full h-1.5 shrink-0">
                <div class="h-1.5 rounded-full"
                  :class="task.is_late ? 'bg-red-400' : task.current_progress >= 100 ? 'bg-green-400' : 'bg-blue-400'"
                  :style="'width:' + Math.min(task.current_progress, 100) + '%'"></div>
              </div>
              <span class="text-gray-500 w-8 text-right shrink-0">{{ Math.round(task.current_progress) }}%</span>
              <!-- Per-task approval status (PMC + Client) — rightmost columns,
                   fixed-width slots so they line up across every task row -->
              <span class="flex items-center gap-1 shrink-0 w-14 justify-start" :title="group.activePrId ? 'PMC: ' + (task.active_pr_entry_pmc_approved === true ? 'Approved' : task.active_pr_entry_pmc_approved === false ? 'Rejected' : 'Pending') : ''">
                <template v-if="group.activePrId">
                  <svg v-if="task.active_pr_entry_pmc_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  <svg v-else-if="task.active_pr_entry_pmc_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                  <svg v-else class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                  <span class="text-[10px] uppercase tracking-wide text-gray-400">PMC</span>
                </template>
              </span>
              <span class="flex items-center gap-1 shrink-0 w-16 justify-start" :title="group.activePrId ? 'Client: ' + (task.active_pr_entry_client_approved === true ? 'Approved' : task.active_pr_entry_client_approved === false ? 'Rejected' : 'Pending') : ''">
                <template v-if="group.activePrId">
                  <svg v-if="task.active_pr_entry_client_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  <svg v-else-if="task.active_pr_entry_client_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                  <svg v-else class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                  <span class="text-[10px] uppercase tracking-wide text-gray-400">Client</span>
                </template>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Gantt Tab ──────────────────────────────────────────────────────────── -->
  <div v-if="activeTab === 'gantt'">
    <div class="flex items-center justify-between mt-4 mb-3 flex-wrap gap-2">
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Group view selector -->
        <div class="flex items-center bg-gray-100 rounded-lg p-0.5">
          <button @click="ganttGroupView='package'" :class="['px-3 py-1 text-xs font-medium rounded-md transition-colors', ganttGroupView==='package' ? 'bg-white shadow-sm text-ips-blue' : 'text-gray-500 hover:text-gray-700']">Package</button>
          <button @click="ganttGroupView='area'"    :class="['px-3 py-1 text-xs font-medium rounded-md transition-colors', ganttGroupView==='area'    ? 'bg-white shadow-sm text-ips-blue' : 'text-gray-500 hover:text-gray-700']">Area</button>
          <button @click="ganttGroupView='unit'"    :class="['px-3 py-1 text-xs font-medium rounded-md transition-colors', ganttGroupView==='unit'    ? 'bg-white shadow-sm text-ips-blue' : 'text-gray-500 hover:text-gray-700']">Unit</button>
          <button @click="ganttGroupView='list'"    :class="['px-3 py-1 text-xs font-medium rounded-md transition-colors', ganttGroupView==='list'    ? 'bg-white shadow-sm text-ips-blue' : 'text-gray-500 hover:text-gray-700']">All Tasks</button>
        </div>
        <!-- Status filter -->
        <select v-model="taskStatusFilter" class="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">All statuses</option>
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="review">Under Review</option>
          <option value="draft">Draft PR</option>
          <option value="late">Late</option>
          <option value="complete">Complete</option>
        </select>
      </div>
      <div class="flex items-center gap-4 flex-wrap">
        <!-- Zoom control -->
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-500 font-medium">Zoom</span>
          <button @click="ganttZoom = Math.max(0.4, +(ganttZoom - 0.2).toFixed(1))"
            class="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold flex items-center justify-center leading-none">−</button>
          <input type="range" min="0.4" max="4" step="0.1" v-model.number="ganttZoom"
            class="w-28 accent-ips-blue" style="height:4px"/>
          <button @click="ganttZoom = Math.min(4, +(ganttZoom + 0.2).toFixed(1))"
            class="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-bold flex items-center justify-center leading-none">+</button>
          <span class="text-xs text-gray-400 w-9 text-right">{{ Math.round(ganttZoom * 100) }}%</span>
        </div>
        <!-- Legend -->
        <div class="flex items-center gap-3 text-xs text-gray-500">
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-green-500 inline-block"></span>Complete</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-blue-500 inline-block"></span>In Progress</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-red-500 inline-block"></span>Late</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-gray-400 inline-block"></span>Not Started</span>
        </div>
      </div>
    </div>
    <div v-if="loading" class="text-center py-8 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="ganttGroups.length === 0 || (ganttGroups.length === 1 && ganttGroups[0].tasks.length === 0)" class="empty-state">
      <p class="text-gray-500">No tasks with start and finish dates defined.</p>
    </div>
    <div v-else class="overflow-x-auto border border-gray-200 rounded-lg"
      :class="ganttResizing ? 'select-none cursor-col-resize' : ''">
      <div :style="'min-width:' + Math.round((ganttLabelWidth + 600) * ganttZoom) + 'px'">
        <!-- Month header row -->
        <div class="flex border-b border-gray-200 bg-gray-50">
          <!-- Label column with resize handle -->
          <div class="shrink-0 border-r border-gray-200 bg-gray-50 relative"
            :style="'width:' + ganttLabelWidth + 'px'">
            <!-- Drag handle -->
            <div @mousedown.prevent="startGanttResize"
              class="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize z-20 flex items-center justify-center group"
              style="margin-right:-1px">
              <div class="w-0.5 h-4 rounded bg-gray-300 group-hover:bg-ips-blue transition-colors"></div>
            </div>
          </div>
          <div class="flex flex-1">
            <div v-for="m in ganttMonths" :key="m.label"
              class="text-center text-xs font-medium text-gray-500 py-2 border-r border-gray-100 shrink-0 overflow-hidden"
              :style="'width:' + m.widthPct + '%'">
              {{ m.label }}
            </div>
          </div>
        </div>

        <!-- Groups -->
        <template v-for="group in ganttGroups" :key="group.id">
          <!-- Group header row (hidden for flat/list view) -->
          <div v-if="!group.isFlat" class="flex items-center border-b border-gray-200"
            :class="ganttGroupView === 'area' ? 'bg-green-50' : ganttGroupView === 'unit' ? 'bg-purple-50' : 'bg-blue-50'">
            <div class="shrink-0 px-3 py-1.5 font-semibold text-sm border-r border-gray-200 truncate"
              :class="ganttGroupView === 'area' ? 'text-green-800' : ganttGroupView === 'unit' ? 'text-purple-800' : 'text-blue-800'"
              :style="'width:' + ganttLabelWidth + 'px'"
              :title="group.label + (group.sublabel ? ' ' + group.sublabel : '')">
              {{ group.label }}
              <span v-if="group.sublabel" class="font-normal text-xs ml-1 opacity-70">{{ group.sublabel }}</span>
            </div>
            <div class="flex-1 relative py-1.5">
              <div v-if="ganttTodayPct >= 0 && ganttTodayPct <= 100"
                class="absolute top-0 bottom-0 w-px bg-red-400 opacity-40"
                :style="'left:' + ganttTodayPct + '%'"></div>
            </div>
          </div>

          <!-- Task rows -->
          <div v-for="task in group.tasks" :key="task.id"
            class="flex items-center border-b border-gray-100 hover:bg-gray-50"
            style="height: 40px;">
            <div class="shrink-0 px-3 text-xs text-gray-600 truncate border-r border-gray-200"
              :style="'width:' + ganttLabelWidth + 'px'"
              :title="task.description + (task.details ? ': ' + task.details : '')">
              {{ task.description }}
            </div>
            <!-- Bar area -->
            <div class="flex-1 relative" style="height: 40px;">
              <div v-if="ganttTodayPct >= 0 && ganttTodayPct <= 100"
                class="absolute top-0 bottom-0 w-px bg-red-400 z-10 opacity-60"
                :style="'left:' + ganttTodayPct + '%'"></div>
              <!-- Milestone diamond (start_date === finish_date) -->
              <template v-if="task.isMilestone && task.barLeft !== null">
                <div class="absolute shadow-sm"
                  :class="ganttBarClass(task)"
                  :style="'left:' + (task.barLeft + task.barWidth/2) + '%;top:50%;width:14px;height:14px;transform:translate(-50%, -50%) rotate(45deg)'"
                  :title="task.description + ' | ' + task.start_date + ' (milestone) | ' + Math.round(task.current_progress) + '%'"></div>
                <span class="absolute text-gray-600 whitespace-nowrap leading-none"
                  :style="'font-size:10px;left:calc(' + (task.barLeft + task.barWidth/2) + '% + 12px);top:50%;transform:translateY(-50%)'">
                  {{ formatDate(task.start_date) }}
                </span>
              </template>
              <!-- Regular bar -->
              <div v-else-if="task.barLeft !== null"
                class="absolute rounded text-white text-xs flex items-center shadow-sm"
                style="overflow: visible;"
                :class="ganttBarClass(task)"
                :style="'left:' + task.barLeft + '%;width:' + task.barWidth + '%;top:6px;bottom:6px;min-width:4px'"
                :title="task.description + ' | ' + task.start_date + ' → ' + task.finish_date + ' | ' + Math.round(task.current_progress) + '%'">
                <div class="absolute left-0 top-0 bottom-0 bg-black bg-opacity-20 rounded-l"
                  :style="'width:' + Math.min(task.current_progress, 100) + '%'"></div>
                <span class="relative z-10 ml-auto px-1 font-bold shrink-0 whitespace-nowrap" style="font-size:10px">{{ Math.round(task.current_progress) }}%</span>
                <!-- Start date outside the bar, to the left -->
                <span class="absolute text-gray-600 whitespace-nowrap leading-none"
                  style="font-size:10px;right:calc(100% + 4px);top:50%;transform:translateY(-50%);">
                  {{ formatDate(task.start_date) }}
                </span>
                <!-- Finish date outside the bar, to the right -->
                <span class="absolute text-gray-600 whitespace-nowrap leading-none"
                  style="font-size:10px;left:calc(100% + 4px);top:50%;transform:translateY(-50%);">
                  {{ formatDate(task.finish_date) }}
                </span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
    <!-- Today marker legend -->
    <div class="mt-2 flex items-center gap-1 text-xs text-gray-400">
      <div class="w-4 h-px bg-red-400 inline-block"></div>
      <span>Today</span>
    </div>
  </div>

  <!-- ── Dashboard Tab ──────────────────────────────────────────────────────── -->
  <div v-if="activeTab === 'dashboard'">
    <div class="flex items-center justify-between mt-4 mb-4 flex-wrap gap-3">
      <div class="flex items-center gap-2 flex-wrap">
        <select v-model="dashPackageFilter" @change="loadDashboard()"
          class="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">All Packages</option>
          <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }}{{ p.name ? ' — ' + p.name : '' }}</option>
        </select>
        <select v-model="dashAreaFilter" @change="loadDashboard()"
          class="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">All Areas</option>
          <option v-for="a in areas" :key="a.id" :value="a.id">{{ a.tag }}{{ a.description ? ' — ' + a.description : '' }}</option>
        </select>
        <select v-model="dashUnitFilter" @change="loadDashboard()"
          class="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">All Units</option>
          <option v-for="u in units" :key="u.id" :value="u.id">{{ u.tag }}{{ u.description ? ' — ' + u.description : '' }}</option>
        </select>
        <button v-if="dashPackageFilter || dashAreaFilter || dashUnitFilter"
          @click="dashPackageFilter=''; dashAreaFilter=''; dashUnitFilter=''; loadDashboard()"
          class="text-xs text-gray-400 hover:text-red-500 transition-colors px-1">✕ Clear</button>
      </div>
    </div>

    <div v-if="dashLoading" class="text-center py-8 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="dash">

      <!-- Actual Progress hero -->
      <div class="card p-5 mb-4">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Actual Progress</div>
            <div class="text-4xl font-bold mt-1" :style="progressColor(dash.actual_progress)">
              {{ dash.actual_progress }}%
            </div>
            <div class="text-xs text-gray-400 mt-0.5">
              {{ dashFilterLabel }} · weighted average
            </div>
          </div>
          <div class="flex items-center gap-6 text-sm text-gray-600 flex-wrap">
            <div class="text-center">
              <div class="text-2xl font-bold text-gray-800">{{ dash.total }}</div>
              <div class="text-xs text-gray-400 mt-0.5">Tasks</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-green-600">{{ dash.completed }}</div>
              <div class="text-xs text-gray-400 mt-0.5">Completed</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-blue-600">{{ dash.on_schedule }}</div>
              <div class="text-xs text-gray-400 mt-0.5">On Schedule</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold text-red-600">{{ dash.late }}</div>
              <div class="text-xs text-gray-400 mt-0.5">Late</div>
            </div>
          </div>
        </div>
        <!-- Progress bar -->
        <div class="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div class="h-3 rounded-full transition-all duration-500"
            :style="'width:' + Math.min(dash.actual_progress, 100) + '%;background:' + progressColorRaw(dash.actual_progress)">
          </div>
        </div>
        <div class="flex justify-between text-xs text-gray-400 mt-1">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      <!-- Per-package breakdown -->
      <div v-if="dash.pkg_breakdown && dash.pkg_breakdown.length > 0" class="card overflow-hidden mb-4">
        <div class="px-4 py-3 border-b border-gray-100 font-medium text-sm text-gray-700">Package Overview</div>
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Package</th>
              <th class="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Tasks</th>
              <th class="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Completed</th>
              <th class="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">On Schedule</th>
              <th class="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Late</th>
              <th class="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Progress</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in dash.pkg_breakdown" :key="row.package_id"
              class="border-t border-gray-50 hover:bg-gray-50 transition-colors">
              <td class="px-4 py-2.5">
                <span class="font-semibold text-gray-800">{{ row.package_tag }}</span>
                <span class="text-gray-400 text-xs ml-2">{{ row.package_name }}</span>
              </td>
              <td class="px-4 py-2.5 text-right text-gray-700 font-medium">{{ row.total }}</td>
              <td class="px-4 py-2.5 text-right">
                <span class="font-semibold text-green-600">{{ row.completed }}</span>
              </td>
              <td class="px-4 py-2.5 text-right">
                <span class="font-semibold text-blue-600">{{ row.on_schedule }}</span>
              </td>
              <td class="px-4 py-2.5 text-right">
                <span class="font-semibold" :class="row.late > 0 ? 'text-red-600' : 'text-gray-400'">{{ row.late }}</span>
              </td>
              <td class="px-4 py-2.5">
                <div class="flex items-center gap-2">
                  <div class="flex-1 bg-gray-100 rounded-full h-1.5 min-w-16">
                    <div class="h-1.5 rounded-full transition-all"
                      :style="'width:' + Math.min(row.actual_progress, 100) + '%;background:' + progressColorRaw(row.actual_progress)">
                    </div>
                  </div>
                  <span class="text-xs font-semibold w-10 text-right shrink-0"
                    :style="'color:' + progressColorRaw(row.actual_progress)">
                    {{ row.actual_progress }}%
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- EV Cumulative Line Chart -->
      <div class="card p-4 mb-4">
        <div class="flex items-center justify-between mb-3">
          <div class="font-medium text-sm text-gray-700">Earned Value — Cumulative (Forecast vs Actual)</div>
          <label class="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
            <input type="checkbox" v-model="showInvoiceSpend" class="rounded border-gray-300 text-ips-blue focus:ring-ips-blue"/>
            Show Cumulative Invoice Spend
          </label>
        </div>
        <div v-if="!dash.ev_monthly || !dash.ev_monthly.length"
          class="text-center text-gray-400 text-sm py-6">
          No tasks with financial weights and dates to compute EV.
        </div>
        <canvas v-else ref="evLineChart" height="100"></canvas>
      </div>

      <!-- EV Monthly Bar Chart -->
      <div class="card p-4 mb-6">
        <div class="font-medium text-sm text-gray-700 mb-3">Earned Value — Monthly Non-Cumulative</div>
        <div v-if="!dash.ev_monthly || !dash.ev_monthly.length"
          class="text-center text-gray-400 text-sm py-6">
          No monthly data available.
        </div>
        <canvas v-else ref="evBarChart" height="100"></canvas>
      </div>

      <!-- Package weight vs forecast -->
      <div v-if="dash.pkg_comparisons && dash.pkg_comparisons.length > 0" class="card overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-100 font-medium text-sm text-gray-700">Financial Weight vs Budget Forecast</div>
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="text-left px-4 py-2 text-gray-500 font-medium">Package</th>
              <th class="text-right px-4 py-2 text-gray-500 font-medium">Task Weight</th>
              <th class="text-right px-4 py-2 text-gray-500 font-medium">Budget Forecast</th>
              <th class="text-right px-4 py-2 text-gray-500 font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in dash.pkg_comparisons" :key="row.package_id"
              class="border-t border-gray-50 hover:bg-gray-50">
              <td class="px-4 py-2 font-medium">{{ row.package_tag }}
                <span class="text-gray-400 font-normal text-xs ml-1">{{ row.package_name }}</span>
              </td>
              <td class="px-4 py-2 text-right">{{ fmt(row.financial_weight) }}</td>
              <td class="px-4 py-2 text-right">{{ fmt(row.forecast) }}</td>
              <td class="px-4 py-2 text-right font-semibold"
                :class="row.gap > 0.01 ? 'text-red-600' : row.gap < -0.01 ? 'text-yellow-600' : 'text-green-600'">
                {{ row.gap > 0 ? '+' : '' }}{{ fmt(row.gap) }}
              </td>
            </tr>
          </tbody>
          <tfoot v-if="dash.pkg_comparisons.length > 1">
            <tr class="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <td class="px-4 py-2 text-gray-700">Total</td>
              <td class="px-4 py-2 text-right text-gray-800">{{ fmt(dash.pkg_comparisons.reduce((s,r) => s + (r.financial_weight||0), 0)) }}</td>
              <td class="px-4 py-2 text-right text-gray-800">{{ fmt(dash.pkg_comparisons.reduce((s,r) => s + (r.forecast||0), 0)) }}</td>
              <td class="px-4 py-2 text-right"
                :class="dash.pkg_comparisons.reduce((s,r) => s + (r.gap||0), 0) > 0.01 ? 'text-red-600' : dash.pkg_comparisons.reduce((s,r) => s + (r.gap||0), 0) < -0.01 ? 'text-yellow-600' : 'text-green-600'">
                {{ dash.pkg_comparisons.reduce((s,r) => s + (r.gap||0), 0) > 0 ? '+' : '' }}{{ fmt(dash.pkg_comparisons.reduce((s,r) => s + (r.gap||0), 0)) }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>

  <!-- ── All Progress Reports Tab ─────────────────────────────────────────── -->
  <div v-if="activeTab === 'all-prs'">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Package filter -->
        <select v-model="allPrsPackageFilter" class="input-field text-sm py-1 w-40">
          <option value="">All Packages</option>
          <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.tag_number }}</option>
        </select>
        <!-- Status filter -->
        <select v-model="allPrsStatusFilter" class="input-field text-sm py-1 w-36">
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
    </div>

    <div v-if="allPrsLoading" class="text-center py-8 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="filteredAllPrs.length === 0" class="empty-state">
      <p class="text-gray-500">No progress reports found.</p>
    </div>
    <div v-else class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr class="text-xs text-gray-500 uppercase">
            <th class="px-4 py-2 w-6"></th>
            <th class="text-left px-4 py-2 font-semibold">Package</th>
            <th class="text-left px-4 py-2 font-semibold">Tasks</th>
            <th class="text-left px-4 py-2 font-semibold">Submitted by</th>
            <th class="text-left px-4 py-2 font-semibold">Date</th>
            <th class="text-left px-4 py-2 font-semibold">Status</th>
            <th class="text-left px-4 py-2 font-semibold">Reviews</th>
            <th class="px-4 py-2 w-10"></th>
            <th v-if="canManage" class="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="pr in filteredAllPrs" :key="pr.id">
            <!-- PR summary row -->
            <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
              @click="togglePr(pr.id)">
              <td class="px-4 py-2.5 text-center">
                <svg class="w-3.5 h-3.5 text-gray-400 inline transition-transform"
                  :class="expandedPrs.includes(pr.id) ? 'rotate-90' : ''"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </td>
              <td class="px-4 py-2.5 font-medium text-gray-700 whitespace-nowrap">{{ pr.package_tag || '—' }}
                <span v-if="pr.package_name" class="text-gray-400 font-normal text-xs ml-1">{{ pr.package_name }}</span>
              </td>
              <td class="px-4 py-2.5 text-gray-500">{{ pr.entries ? pr.entries.length : 0 }} task(s)</td>
              <td class="px-4 py-2.5 text-gray-500">{{ pr.created_by_name || '—' }}</td>
              <td class="px-4 py-2.5 text-gray-500 whitespace-nowrap">{{ formatDate(pr.submitted_at || pr.created_at) }}</td>
              <td class="px-4 py-2.5">
                <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', prStatusClass(pr.status)]">{{ pr.status }}</span>
              </td>
              <td class="px-4 py-2.5">
                <div class="space-y-1">
                  <div class="flex items-center gap-1.5 text-xs cursor-default"
                    :title="'PMC' + (pr.pmc_reviewer_name ? ': ' + pr.pmc_reviewer_name : '') + (pr.pmc_comment ? ' — ' + pr.pmc_comment : '')">
                    <svg v-if="pr.pmc_reviewed && pr.pmc_approved" class="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    <svg v-else-if="pr.pmc_reviewed && !pr.pmc_approved" class="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    <svg v-else class="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                    <span :class="pr.pmc_reviewed ? (pr.pmc_approved ? 'text-green-700' : 'text-red-600') : 'text-gray-400'">
                      PMC<span v-if="pr.pmc_reviewer_name" class="font-medium">: {{ pr.pmc_reviewer_name }}</span>
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5 text-xs cursor-default"
                    :title="'Client' + (pr.client_reviewer_name ? ': ' + pr.client_reviewer_name : '') + (pr.client_comment ? ' — ' + pr.client_comment : '')">
                    <svg v-if="pr.client_reviewed && pr.client_approved" class="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    <svg v-else-if="pr.client_reviewed && !pr.client_approved" class="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    <svg v-else class="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                    <span :class="pr.client_reviewed ? (pr.client_approved ? 'text-green-700' : 'text-red-600') : 'text-gray-400'">
                      Client<span v-if="pr.client_reviewer_name" class="font-medium">: {{ pr.client_reviewer_name }}</span>
                    </span>
                  </div>
                </div>
              </td>
              <td class="px-4 py-2.5 text-center" @click.stop>
                <div class="flex items-center gap-1 justify-center">
                  <button @click="openPrHistory(pr)"
                    class="btn-icon text-gray-400 hover:text-ips-blue" title="Review history">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </button>
                  <button @click="openPrAttachModal(pr.id, pr.package_tag)"
                    class="btn-icon text-gray-400 hover:text-ips-blue" title="Attachments">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                    </svg>
                  </button>
                </div>
              </td>
              <td v-if="canManage" class="px-4 py-2.5" @click.stop>
                <button v-if="pr.status === 'DRAFT' || pr.status === 'SUBMITTED' || pr.status === 'REJECTED'"
                  @click="allPrsCancel(pr)"
                  class="btn btn-sm text-xs px-2 py-1 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded">
                  Cancel
                </button>
              </td>
            </tr>
            <!-- Expandable entries -->
            <tr v-if="expandedPrs.includes(pr.id)" :key="'entries-' + pr.id">
              <td :colspan="canManage ? 9 : 8" class="px-0 py-0 bg-gray-50 border-b border-gray-200">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="text-gray-400 uppercase">
                      <th class="text-left px-8 py-1.5 font-semibold">Task</th>
                      <th class="text-right px-4 py-1.5 font-semibold">Progress</th>
                      <th class="text-left px-4 py-1.5 font-semibold">Note</th>
                      <th class="text-left px-4 py-1.5 font-semibold">PMC</th>
                      <th class="text-left px-4 py-1.5 font-semibold">Client</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="entry in pr.entries" :key="entry.id"
                      class="border-t border-gray-100">
                      <td class="px-8 py-1.5 text-gray-700 font-medium">{{ entry.task_description }}</td>
                      <td class="px-4 py-1.5 text-right">
                        <div class="flex items-center gap-1.5 justify-end">
                          <div class="w-12 bg-gray-200 rounded-full h-1">
                            <div class="h-1 rounded-full bg-blue-400" :style="'width:'+Math.min(entry.percentage,100)+'%'"></div>
                          </div>
                          <span class="font-semibold text-gray-700 w-8 text-right">{{ Math.round(entry.percentage) }}%</span>
                        </div>
                      </td>
                      <td class="px-4 py-1.5 text-gray-500 italic max-w-[12rem] truncate" :title="entry.note">{{ entry.note || '—' }}</td>
                      <td class="px-4 py-1.5">
                        <svg v-if="entry.pmc_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                        <svg v-else-if="entry.pmc_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        <svg v-else class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                      </td>
                      <td class="px-4 py-1.5">
                        <svg v-if="entry.client_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                        <svg v-else-if="entry.client_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                        <svg v-else class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

  </div>

  <!-- ── Approvals Tab ─────────────────────────────────────────────────────── -->
  <div v-if="activeTab === 'approvals' && canSeeApprovals">
    <div class="flex items-center justify-between mb-4">
      <p class="text-sm text-gray-500">Progress reports awaiting approval</p>
      <button @click="loadAllPrs" class="btn-secondary text-sm">Refresh</button>
    </div>
    <div v-if="allPrsLoading" class="text-center py-8 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="pendingPrApprovals.length === 0" class="card text-center py-10 text-gray-400">No progress reports currently awaiting approval.</div>
    <div v-else class="space-y-4">
      <div v-for="pr in pendingPrApprovals" :key="pr.id" class="card p-0 overflow-hidden">
        <!-- Header -->
        <div class="flex items-center gap-3 px-4 py-3 bg-blue-50 border-b border-blue-100 flex-wrap">
          <span class="font-mono text-xs font-bold text-gray-700">PR #{{ pr.id }}</span>
          <span v-if="pr.package_tag" class="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700">{{ pr.package_tag }}</span>
          <span class="font-semibold text-gray-800 truncate flex-1">{{ pr.package_name || '—' }}</span>
          <span class="text-xs text-gray-500">{{ (pr.entries || []).length }} task{{ (pr.entries || []).length !== 1 ? 's' : '' }}</span>
          <button @click="openPrHistory(pr)"
            class="ml-2 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600" title="Review history">History</button>
          <button @click="openPrAttachModal(pr.id, pr.package_tag)"
            class="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600">Attachments</button>
        </div>
        <!-- Task entries -->
        <div v-if="pr.entries && pr.entries.length" class="border-b border-gray-100">
          <table class="w-full text-xs">
            <thead>
              <tr class="text-gray-400 uppercase bg-gray-50">
                <th class="text-left px-4 py-1.5 font-semibold">Task</th>
                <th class="text-right px-4 py-1.5 font-semibold">Progress</th>
                <th class="text-left px-4 py-1.5 font-semibold">Note</th>
                <th class="text-left px-4 py-1.5 font-semibold">PMC</th>
                <th class="text-left px-4 py-1.5 font-semibold">Client</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in pr.entries" :key="entry.id" class="border-t border-gray-100">
                <td class="px-4 py-1.5 text-gray-700 font-medium">{{ entry.task_description }}</td>
                <td class="px-4 py-1.5 text-right">
                  <div class="flex items-center gap-1.5 justify-end">
                    <div class="w-12 bg-gray-200 rounded-full h-1">
                      <div class="h-1 rounded-full bg-blue-400" :style="'width:'+Math.min(entry.percentage,100)+'%'"></div>
                    </div>
                    <span class="font-semibold text-gray-700 w-8 text-right">{{ Math.round(entry.percentage) }}%</span>
                  </div>
                </td>
                <td class="px-4 py-1.5 text-gray-500 italic max-w-[12rem] truncate" :title="entry.note">{{ entry.note || '—' }}</td>
                <td class="px-4 py-1.5">
                  <svg v-if="entry.pmc_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  <svg v-else-if="entry.pmc_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  <svg v-else class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                </td>
                <td class="px-4 py-1.5">
                  <svg v-if="entry.client_approved === true" class="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  <svg v-else-if="entry.client_approved === false" class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  <svg v-else class="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Reviewer rows -->
        <div class="divide-y divide-gray-100">
          <!-- PMC row -->
          <div class="flex items-center gap-3 px-4 py-3 flex-wrap">
            <div class="w-32 shrink-0">
              <p class="text-xs font-semibold text-gray-500">PMC</p>
              <p class="text-xs text-gray-700">{{ pr.pmc_reviewer_name || 'Not assigned' }}</p>
            </div>
            <div class="flex-1 flex items-center gap-2 flex-wrap">
              <span v-if="!pr.pmc_reviewed" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>
              <span v-else-if="pr.pmc_approved" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Approved</span>
              <span v-else class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Rejected</span>
              <span v-if="pr.pmc_comment" class="text-xs text-gray-500 italic">{{ pr.pmc_comment }}</span>
            </div>
            <div v-if="canReviewAsPmc(pr)" class="shrink-0">
              <button @click="openPrReview(pr, 'pmc')" class="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Submit Review</button>
            </div>
          </div>
          <!-- Client row -->
          <div class="flex items-center gap-3 px-4 py-3 flex-wrap">
            <div class="w-32 shrink-0">
              <p class="text-xs font-semibold text-gray-500">Client</p>
              <p class="text-xs text-gray-700">{{ pr.client_reviewer_name || 'Not assigned' }}</p>
            </div>
            <div class="flex-1 flex items-center gap-2 flex-wrap">
              <span v-if="!pr.client_reviewed" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>
              <span v-else-if="pr.client_approved" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Approved</span>
              <span v-else class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Rejected</span>
              <span v-if="pr.client_comment" class="text-xs text-gray-500 italic">{{ pr.client_comment }}</span>
            </div>
            <div v-if="canReviewAsClient(pr)" class="shrink-0">
              <button @click="openPrReview(pr, 'client')" class="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Submit Review</button>
            </div>
          </div>
          <!-- Override row (admin / project owner / schedule lead / package owner) -->
          <div v-if="canOverridePr(pr)" class="flex items-center gap-2 px-4 py-2 bg-gray-50 flex-wrap">
            <span class="text-xs text-gray-400 mr-2">Override:</span>
            <button @click="openPrOverride(pr, true)"
              class="px-3 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded hover:bg-green-200">Approve All</button>
            <button @click="openPrOverride(pr, false)"
              class="px-3 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded hover:bg-red-200">Reject All</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- PR Override confirmation modal -->
  <div v-if="showPrOverrideModal" class="modal-overlay" @click.self="showPrOverrideModal=false">
    <div class="modal-box" style="max-width:480px">
      <div class="modal-header">
        <h3 class="text-lg font-semibold text-gray-800">
          {{ overridePrApproved ? 'Approve' : 'Reject' }} PR #{{ overridePrRec ? overridePrRec.id : '' }}
        </h3>
        <button @click="showPrOverrideModal=false" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body space-y-3">
        <p class="text-sm text-gray-600">Override all reviewer decisions. This will set the progress report to <strong>{{ overridePrApproved ? 'APPROVED' : 'REJECTED' }}</strong>.</p>
        <div>
          <label class="form-label">Comment (optional)</label>
          <textarea v-model="overridePrComment" class="input-field" rows="3" placeholder="Reason for override..."></textarea>
        </div>
        <p v-if="overridePrError" class="text-red-500 text-sm">{{ overridePrError }}</p>
      </div>
      <div class="modal-footer">
        <button @click="showPrOverrideModal=false" class="btn-secondary">Cancel</button>
        <button @click="submitPrOverride" :disabled="overridePrSaving"
          :class="['px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 text-white', overridePrApproved ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700']">
          {{ overridePrSaving ? 'Saving...' : (overridePrApproved ? 'Confirm Approve' : 'Confirm Reject') }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── PR Review Modal ────────────────────────────────────────────────────── -->
  <div v-if="showPrReviewModal" class="modal-overlay" @click.self="showPrReviewModal=false">
    <div class="modal-box modal-xl" style="max-height:90vh;display:flex;flex-direction:column">
      <div class="modal-header">
        <h3 class="text-lg font-semibold text-gray-800">
          Review Progress Report — {{ prReviewRec && prReviewRec.package_tag }}
          <span class="text-sm font-normal text-gray-500 ml-2">{{ prReviewRole === 'pmc' ? 'PMC Commercial' : 'Client Commercial' }}</span>
        </h3>
        <button @click="showPrReviewModal=false" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body" style="overflow-y:auto;flex:1">
        <p class="text-sm text-gray-600 mb-3">Select the tasks you approve. Uncheck tasks to reject them. A comment is required.</p>
        <div class="flex items-center gap-2 mb-3">
          <button @click="Object.keys(prReviewTaskApprovals).forEach(k => prReviewTaskApprovals[k] = true)" class="text-xs text-blue-600 hover:underline">Select All</button>
          <button @click="Object.keys(prReviewTaskApprovals).forEach(k => prReviewTaskApprovals[k] = false)" class="text-xs text-blue-600 hover:underline">Deselect All</button>
        </div>
        <table class="w-full text-sm mb-4">
          <thead>
            <tr class="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th class="px-3 py-2 w-10 text-center">OK</th>
              <th class="text-left px-3 py-2">Task</th>
              <th class="text-right px-3 py-2">Progress</th>
              <th class="text-left px-3 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in (prReviewRec && prReviewRec.entries || [])" :key="entry.id" class="border-b border-gray-100">
              <td class="px-3 py-2 text-center">
                <input type="checkbox" v-model="prReviewTaskApprovals[entry.id]" class="rounded border-gray-300 text-green-600 focus:ring-green-500"/>
              </td>
              <td class="px-3 py-2 text-gray-800 font-medium">{{ entry.task_description }}</td>
              <td class="px-3 py-2 text-right">
                <div class="flex items-center gap-1.5 justify-end">
                  <div class="w-16 bg-gray-200 rounded-full h-1.5">
                    <div class="h-1.5 rounded-full bg-blue-400" :style="'width:' + Math.min(entry.percentage, 100) + '%'"></div>
                  </div>
                  <span class="text-xs font-semibold text-gray-700 w-8 text-right">{{ Math.round(entry.percentage) }}%</span>
                </div>
              </td>
              <td class="px-3 py-2 text-gray-500 text-xs italic max-w-xs truncate" :title="entry.note">{{ entry.note || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <div>
          <label class="form-label">Comment <span class="text-red-500">*</span></label>
          <textarea v-model="prReviewComment" rows="3" class="input-field" placeholder="Add your review comment..."></textarea>
        </div>
        <p v-if="prReviewError" class="text-red-500 text-sm mt-2">{{ prReviewError }}</p>
      </div>
      <div class="modal-footer">
        <button @click="showPrReviewModal=false" class="btn-secondary">Cancel</button>
        <button @click="submitPrReview" :disabled="prReviewSaving" class="btn-primary">
          {{ prReviewSaving ? 'Submitting...' : 'Submit Review' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Task Form Modal ────────────────────────────────────────────────────── -->
  <div v-if="showTaskForm" class="modal-overlay" @click.self="showTaskForm = false">
    <div class="modal-box modal-xl">
      <div class="modal-header">
        <h3 class="text-lg font-semibold text-gray-800">{{ editingTask ? 'Edit Task' : 'New Task' }}</h3>
        <button @click="showTaskForm = false" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body" style="padding:0;display:flex;overflow:hidden">
        <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
          <div class="space-y-4">
            <div>
              <label class="form-label">Description <span class="text-red-500">*</span></label>
              <input v-model="taskForm.description" type="text" class="input-field" placeholder="Brief task description"/>
            </div>
            <div>
              <label class="form-label">Details <span class="text-gray-400 font-normal">(optional)</span></label>
              <textarea v-model="taskForm.details" class="input-field" rows="3"
                placeholder="Additional details, milestones, notes…"></textarea>
            </div>
            <div>
              <label class="form-label">Package</label>
              <select v-model="taskForm.package_id" class="input-field">
                <option :value="null">— No package —</option>
                <option v-for="p in allowedPackages()" :key="p.id" :value="p.id">{{ p.tag_number }} — {{ p.name }}</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="form-label">Start Date</label>
                <input type="date" v-model="taskForm.start_date" class="input-field"/>
              </div>
              <div>
                <label class="form-label">Finish Date</label>
                <input type="date" v-model="taskForm.finish_date" class="input-field"/>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="form-label">Area <span class="text-gray-400 font-normal">(optional)</span></label>
                <select v-model="taskForm.area_id" class="input-field">
                  <option :value="null">— None —</option>
                  <option v-for="a in areas" :key="a.id" :value="a.id">{{ a.tag }} — {{ a.description }}</option>
                </select>
              </div>
              <div>
                <label class="form-label">Unit <span class="text-gray-400 font-normal">(optional)</span></label>
                <select v-model="taskForm.unit_id" class="input-field">
                  <option :value="null">— None —</option>
                  <option v-for="u in units" :key="u.id" :value="u.id">{{ u.tag }} — {{ u.description }}</option>
                </select>
              </div>
            </div>
            <div>
              <label class="form-label">Financial Weight <span class="text-gray-400 font-normal">(optional — used for earned value)</span></label>
              <input type="number" v-model.number="taskForm.financial_weight" class="input-field"
                placeholder="0.00" step="0.01" min="0"/>
            </div>
            <p v-if="taskError" class="text-red-500 text-sm">{{ taskError }}</p>
          </div>
        </div>
        <div class="w-[28rem] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
          <file-attachments record-type="task" :record-id="editingTask ? editingTask.id : null" :can-edit="true"></file-attachments>
        </div>
      </div>
      <div class="modal-footer">
        <button @click="showTaskForm = false" class="btn-secondary">Cancel</button>
        <button v-if="!editingTask" @click="saveTask" :disabled="taskSaving" class="btn-primary">
          {{ taskSaving ? 'Saving…' : 'Save' }}
        </button>
        <button v-else-if="editingTask._justCreated" @click="showTaskForm = false" class="btn-primary">
          Create Task
        </button>
        <button v-else @click="saveTask" :disabled="taskSaving" class="btn-primary">
          {{ taskSaving ? 'Saving…' : 'Save Changes' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Delete Confirm ─────────────────────────────────────────────────────── -->
  <div v-if="deletingTask" class="modal-overlay" @click.self="deletingTask = null">
    <div class="modal-box" style="max-width:440px">
      <div class="modal-header">
        <h3 class="text-lg font-semibold text-gray-800">Delete Task</h3>
        <button @click="deletingTask = null" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <p class="text-gray-600">Are you sure you want to delete <span class="font-semibold text-gray-800">{{ deletingTask.description }}</span>?</p>
        <p class="text-sm text-red-500 mt-2">This will also delete all associated progress reports.</p>
      </div>
      <div class="modal-footer">
        <button @click="deletingTask = null" class="btn-secondary">Cancel</button>
        <button @click="doDeleteTask"
          class="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">
          Delete
        </button>
      </div>
    </div>
  </div>

  <!-- ── Bulk Progress Report Modal ────────────────────────────────────────── -->
  <div v-if="showBulkPrModal" class="modal-overlay" @click.self="showBulkPrModal = false">
    <div class="modal-box modal-xl" style="display:flex;flex-direction:column;max-height:90vh">
      <div class="modal-header shrink-0">
        <div>
          <h3 class="modal-title">
            Progress Report —
            {{ bulkPrGroup ? bulkPrGroup.package_tag : '' }}
            <span v-if="bulkPrGroup && bulkPrGroup.package_name" class="text-gray-400 font-normal text-sm ml-1">{{ bulkPrGroup.package_name }}</span>
          </h3>
          <div v-if="bulkPrSubmitted" class="text-xs text-yellow-600 mt-0.5">This report is currently under review and cannot be edited.</div>
        </div>
        <button class="modal-close" @click="showBulkPrModal = false">×</button>
      </div>
      <!-- Reviewer feedback banner (shown when REJECTED) -->
      <div v-if="bulkPrGroup && bulkPrGroup.activePrStatus === 'REJECTED'" class="shrink-0 bg-red-50 border-b border-red-200 px-5 py-3 space-y-1">
        <p class="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Rejection Feedback — please revise and resubmit</p>
        <p v-if="bulkPrGroup.activePrPmcComment" class="text-sm text-red-700">
          <span class="font-semibold">PMC:</span> {{ bulkPrGroup.activePrPmcComment }}
        </p>
        <p v-if="bulkPrGroup.activePrClientComment" class="text-sm text-red-700">
          <span class="font-semibold">Client:</span> {{ bulkPrGroup.activePrClientComment }}
        </p>
      </div>
      <!-- Two-pane layout: tasks left, attachments right -->
      <div class="flex flex-1 min-h-0">
        <!-- Left: task entries -->
        <div class="flex-1 overflow-y-auto p-5">
          <div v-if="bulkPrEntries.length === 0" class="text-gray-400 text-sm">No tasks for this package.</div>
          <div v-else class="space-y-4">
            <div v-for="entry in bulkPrEntries" :key="entry.task_id"
              class="p-4 rounded-lg border bg-white border-gray-200"
              :class="{ 'opacity-60': bulkPrSubmitted }">
              <div class="flex items-start justify-between gap-2 mb-3">
                <div class="flex-1">
                  <div class="font-medium text-gray-800">{{ entry.task_description }}</div>
                  <div v-if="entry.details" class="text-xs text-gray-500 mt-0.5">{{ entry.details }}</div>
                  <div class="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    <span v-if="entry.start_date">{{ entry.start_date }}</span>
                    <span v-if="entry.finish_date">→ {{ entry.finish_date }}</span>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <!-- Per-task review status (when REJECTED) -->
                  <span v-if="entry.pmc_approved === true" class="text-xs text-green-600 font-medium">PMC ✓</span>
                  <span v-else-if="entry.pmc_approved === false" class="text-xs text-red-600 font-medium">PMC ✗</span>
                  <span v-if="entry.client_approved === true" class="text-xs text-green-600 font-medium">Client ✓</span>
                  <span v-else-if="entry.client_approved === false" class="text-xs text-red-600 font-medium">Client ✗</span>
                  <span v-if="entry.is_late" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Late</span>
                  <span class="font-bold text-gray-800 text-lg w-12 text-right">{{ entry.percentage }}%</span>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs text-gray-400 w-4">0</span>
                <input type="range" v-model.number="entry.percentage"
                  :disabled="bulkPrSubmitted"
                  min="0" max="100" step="1"
                  class="flex-1 accent-blue-600" />
                <span class="text-xs text-gray-400 w-8">100</span>
              </div>
              <div class="flex items-center gap-3 mt-2">
                <span class="w-4 shrink-0"></span>
                <textarea v-model="entry.note" :disabled="bulkPrSubmitted"
                  class="form-control text-sm flex-1" rows="1"
                  placeholder="Note (optional)"></textarea>
                <span class="w-8 shrink-0"></span>
              </div>
            </div>
          </div>
          <div v-if="bulkPrError" class="text-red-500 text-sm mt-3">{{ bulkPrError }}</div>
        </div>
        <!-- Right: attachments (only visible once PR is saved/exists) -->
        <div class="w-72 shrink-0 border-l border-gray-200 bg-gray-50 overflow-y-auto p-4">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
          <div v-if="!bulkPrPrId" class="text-xs text-gray-400 italic">Save as draft first to enable attachments.</div>
          <file-attachments v-else record-type="progress_report" :record-id="bulkPrPrId" :can-edit="true"></file-attachments>
        </div>
      </div>
      <div class="modal-footer shrink-0">
        <button @click="showBulkPrModal = false" class="btn btn-secondary">Close</button>
        <button v-if="!bulkPrSubmitted" @click="saveBulkPr(false)" :disabled="bulkPrSaving" class="btn btn-secondary">
          {{ bulkPrSaving ? 'Saving…' : 'Save as Draft' }}
        </button>
        <button v-if="!bulkPrSubmitted" @click="saveBulkPr(true)" :disabled="bulkPrSaving" class="btn btn-primary">
          {{ bulkPrSaving ? 'Submitting…' : 'Submit for Review' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── PR Attachments Modal ───────────────────────────────────────────────── -->
  <div v-if="showPrAttachModal" class="modal-overlay" @click.self="showPrAttachModal = false">
    <div class="modal-box modal-lg">
      <div class="modal-header">
        <h3 class="modal-title">Attachments — {{ prAttachTitle }}</h3>
        <button class="modal-close" @click="showPrAttachModal = false">×</button>
      </div>
      <div class="modal-body">
        <file-attachments record-type="progress_report" :record-id="prAttachPrId" :can-edit="true"></file-attachments>
      </div>
    </div>
  </div>

  <!-- ── PR Review History Modal ───────────────────────────────────────────── -->
  <div v-if="historyPr" class="modal-overlay" @click.self="historyPr=null" style="z-index:120">
    <div class="modal-box" style="max-width:560px">
      <div class="modal-header">
        <div>
          <p class="text-xs font-mono text-gray-400">
            {{ historyPr.package_tag || '' }}<span v-if="historyPr.package_name"> — {{ historyPr.package_name }}</span>
          </p>
          <h3 class="text-lg font-semibold text-gray-800">Review History</h3>
        </div>
        <button @click="historyPr=null" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body" style="max-height:70vh;overflow-y:auto">
        <div v-if="prHistoryLoading" class="text-center py-6 text-gray-400">
          <img src="/static/assets/impulse-loader.svg" class="h-6 mx-auto" alt="Loading"/>
        </div>
        <div v-else-if="prHistoryError" class="text-red-500 text-sm">{{ prHistoryError }}</div>
        <div v-else-if="prHistoryEntries.length === 0" class="text-center py-6 text-gray-400 text-sm">No review events recorded yet.</div>
        <ol v-else class="relative border-l-2 border-gray-200 ml-3 space-y-4 pl-5">
          <li v-for="entry in prHistoryEntries" :key="entry.id" class="relative">
            <span class="absolute -left-[29px] top-1 w-3 h-3 rounded-full border-2 border-white"
              :class="entry.approved === true ? 'bg-green-500' : (entry.approved === false ? 'bg-red-500' : 'bg-blue-500')"></span>
            <div class="flex items-center gap-2 flex-wrap">
              <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', historyEventClassPr(entry)]">
                {{ historyEventLabelPr(entry) }}
              </span>
              <span class="text-xs text-gray-500">{{ fmtDateTime(entry.created_at) }}</span>
            </div>
            <p class="text-xs text-gray-600 mt-1">by <span class="font-medium">{{ entry.actor_name || '—' }}</span></p>
            <p v-if="entry.comment" class="text-sm text-gray-700 italic mt-1 bg-gray-50 rounded p-2 whitespace-pre-line">{{ entry.comment }}</p>
          </li>
        </ol>
      </div>
      <div class="modal-footer">
        <button @click="historyPr=null" class="btn-secondary">Close</button>
      </div>
    </div>
  </div>

  <!-- ── Task Import Modal ─────────────────────────────────────────────────── -->
  <div v-if="showTaskImportModal" class="modal-overlay" @click.self="showTaskImportModal = false">
    <div class="modal-box" style="max-width:780px">
      <div class="modal-header">
        <h3 class="modal-title">Import Tasks from Excel</h3>
        <button @click="showTaskImportModal = false" class="modal-close">&times;</button>
      </div>
      <div class="modal-body space-y-4">
        <div v-if="taskImportResult" class="rounded-lg p-4 bg-green-50 border border-green-200 text-sm text-green-800 space-y-1">
          <p class="font-semibold">Import completed successfully.</p>
          <p>Created: <strong>{{ taskImportResult.created }}</strong> &nbsp; Updated: <strong>{{ taskImportResult.updated }}</strong> &nbsp; Skipped: <strong>{{ taskImportResult.skipped }}</strong></p>
        </div>
        <div v-if="!taskImportPreview && !taskImportResult" class="space-y-3">
          <p class="text-sm text-gray-600">Upload an Excel file (.xlsx) to import tasks. Download the template first to see the expected format and available package lookup values.</p>
          <div class="flex items-center gap-3 flex-wrap">
            <button @click="exportTasksXlsx" class="btn-secondary text-sm flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 8l-3-3m3 3l3-3"/></svg>
              Export / Download Template
            </button>
            <label class="btn-secondary text-sm cursor-pointer flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
              Choose File
              <input type="file" accept=".xlsx" class="hidden" @change="onTaskImportFileChange" />
            </label>
            <span v-if="taskImportFile" class="text-sm text-gray-600">{{ taskImportFile.name }}</span>
          </div>
          <p v-if="taskImportError" class="text-red-500 text-sm">{{ taskImportError }}</p>
          <p class="text-xs text-gray-400">Unique key: <strong>ID</strong> column. Leave blank to create new tasks; fill in an existing ID to update. The export file already contains the Lookups sheet with valid reference values.</p>
        </div>
        <div v-if="taskImportPreview && !taskImportResult" class="space-y-3">
          <div class="flex items-center gap-4 text-sm flex-wrap">
            <span class="px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium">{{ taskImportPreview.summary.creates }} to create</span>
            <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">{{ taskImportPreview.summary.updates }} to update</span>
            <span v-if="taskImportPreview.summary.errors > 0" class="px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium">{{ taskImportPreview.summary.errors }} error(s)</span>
          </div>
          <p v-if="taskImportError" class="text-red-500 text-sm">{{ taskImportError }}</p>
          <div class="overflow-x-auto max-h-96 border rounded">
            <table class="w-full text-xs">
              <thead class="bg-gray-100 sticky top-0">
                <tr>
                  <th class="px-2 py-1 text-left">Row</th>
                  <th class="px-2 py-1 text-left">Action</th>
                  <th class="px-2 py-1 text-left">ID</th>
                  <th class="px-2 py-1 text-left">Package</th>
                  <th class="px-2 py-1 text-left">Description</th>
                  <th class="px-2 py-1 text-left">Start</th>
                  <th class="px-2 py-1 text-left">Finish</th>
                  <th class="px-2 py-1 text-left">Errors / Warnings</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in taskImportPreview.rows" :key="r.row_num"
                  :class="r.errors.length ? 'bg-red-50' : r.warnings.length ? 'bg-yellow-50' : ''">
                  <td class="px-2 py-1 text-gray-500">{{ r.row_num }}</td>
                  <td class="px-2 py-1"><span :class="r.action==='CREATE' ? 'text-green-700 font-semibold' : 'text-blue-700 font-semibold'">{{ r.action }}</span></td>
                  <td class="px-2 py-1 text-gray-500">{{ r.id || '—' }}</td>
                  <td class="px-2 py-1">{{ r.package_tag || '—' }}</td>
                  <td class="px-2 py-1 max-w-xs truncate" :title="r.description">{{ r.description }}</td>
                  <td class="px-2 py-1 text-gray-500">{{ r.start_date || '—' }}</td>
                  <td class="px-2 py-1 text-gray-500">{{ r.finish_date || '—' }}</td>
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
        <button v-if="!taskImportResult" @click="resetTaskImport" class="btn-secondary">{{ taskImportPreview ? 'Back' : 'Cancel' }}</button>
        <button v-if="taskImportResult" @click="showTaskImportModal = false; loadData()" class="btn-primary">Close &amp; Refresh</button>
        <button v-if="!taskImportPreview && !taskImportResult && taskImportFile" @click="runTaskImportPreview"
          :disabled="taskImportLoading" class="btn-primary">
          {{ taskImportLoading ? 'Analysing…' : 'Preview Import' }}
        </button>
        <button v-if="taskImportPreview && !taskImportResult && taskImportPreview.summary.errors === 0"
          @click="applyTaskImport" :disabled="taskImportApplying" class="btn-primary">
          {{ taskImportApplying ? 'Applying…' : 'Confirm &amp; Apply' }}
        </button>
      </div>
    </div>
  </div>

</div>
  `,

  data() {
    return {
      activeTab: 'tasks',
      // Package-level permissions (loaded on mount)
      accountManagerPackageIds: [],
      linkedContactPackageIds: [],
      // All Progress Reports tab
      allPrs: [],
      allPrsLoading: false,
      allPrsPackageFilter: '',
      allPrsStatusFilter: '',
      // PR review history modal
      historyPr: null,
      prHistoryEntries: [],
      prHistoryLoading: false,
      prHistoryError: '',
      loading: false,
      tasksExporting: false,
      tasks: [],
      // Full project task list used by the Overall Time Schedule Gantt only.
      // `tasks` is vendor-scoped (account-manager/linked packages); the Gantt
      // is meant to show every package to every project contact except bidders.
      allTasksForGantt: [],
      packages: [],
      myPrs: [],
      expandedPackages: [],
      expandedAreas: [],
      expandedUnits: [],
      taskGroupView: 'package',
      taskStatusFilter: '',

      // Task form
      showTaskForm: false,
      editingTask: null,
      taskForm: { description: '', details: '', package_id: null, start_date: '', finish_date: '', financial_weight: null, area_id: null, unit_id: null },
      areas: [],
      units: [],
      taskError: '',
      taskSaving: false,
      deletingTask: null,

      // Bulk PR (package-level)
      showBulkPrModal: false,
      bulkPrGroup: null,
      bulkPrPrId: null,       // ID of existing DRAFT/REJECTED PR (null = new)
      bulkPrSubmitted: false, // true if PR is SUBMITTED (all locked)
      bulkPrEntries: [],
      bulkPrError: '',
      bulkPrSaving: false,

      // Expandable rows in All PRs tab
      expandedPrs: [],

      // PR attachments
      prAttachPrId: null,
      showPrAttachModal: false,
      prAttachTitle: '',

      // Dashboard
      dashLoading: false,
      dash: null,
      dashPackageFilter: '',
      dashAreaFilter: '',
      dashUnitFilter: '',
      evChartInstance: null,
      evBarChartInstance: null,
      showInvoiceSpend: false,
      invoiceSpendData: null,
      invoiceSpendLoading: false,

      // Gantt UI
      ganttGroupView: 'package',
      ganttZoom: 1,
      ganttLabelWidth: 200,
      ganttResizing: false,
      ganttResizeX0: 0,
      ganttResizeW0: 0,

      // PR Review modal
      showPrReviewModal: false,
      prReviewRec: null,
      prReviewRole: '',
      prReviewComment: '',
      prReviewTaskApprovals: {},  // { entryId: true/false }
      prReviewSaving: false,
      prReviewError: '',

      // Override modal (admin/owner)
      showPrOverrideModal: false,
      overridePrRec: null,
      overridePrApproved: true,
      overridePrComment: '',
      overridePrSaving: false,
      overridePrError: '',

      // Import / Export
      showTaskImportModal: false,
      taskImportFile: null,
      taskImportPreview: null,
      taskImportLoading: false,
      taskImportApplying: false,
      taskImportError: '',
      taskImportResult: null,
    };
  },

  computed: {
    isAdminOrOwner() {
      if (!this.currentUser) return false;
      if (['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role)) return true;
      // Planning Manager (Schedule Module Lead) gets the same UI gates.
      return (this.currentUser.lead_modules || []).includes('Schedule');
    },

    pendingPrApprovals() {
      return this.allPrs.filter(pr => pr.status === 'SUBMITTED');
    },

    isPrReviewer() {
      if (!this.currentUser || !this.currentUser.contact_id) return false;
      const cid = this.currentUser.contact_id;
      return (this.packages || []).some(p =>
        p.pmc_commercial_reviewer_id === cid || p.client_commercial_reviewer_id === cid
      );
    },

    canSeeApprovals() {
      return this.isAdminOrOwner || this.isPrReviewer;
    },

    myPendingPrReviews() {
      if (!this.currentUser || !this.currentUser.contact_id) return [];
      const cid = this.currentUser.contact_id;
      return this.pendingPrApprovals.filter(pr => {
        const isPmc = (this.packages || []).some(p => p.id === pr.package_id && p.pmc_commercial_reviewer_id === cid) && !pr.pmc_reviewed;
        const isClient = (this.packages || []).some(p => p.id === pr.package_id && p.client_commercial_reviewer_id === cid) && !pr.client_reviewed;
        return isPmc || isClient;
      });
    },

    canManage() {
      return this.isAdminOrOwner;
    },

    canReadOnly() {
      return this.currentUser && ['PROJECT_TEAM', 'CLIENT'].includes(this.currentUser.role);
    },

    canSubmitAnyPr() {
      return this.canManage ||
        this.accountManagerPackageIds.length > 0 ||
        this.linkedContactPackageIds.length > 0;
    },

    visibleTabs() {
      const role = this.currentUser && this.currentUser.role;
      const tabs = [{ id: 'tasks', label: 'Tasks' }];
      if (this.canSubmitAnyPr) tabs.push({ id: 'progress', label: 'Progress Reporting' });
      tabs.push({ id: 'gantt', label: 'Overall Time Schedule' });
      // Dashboard visible only to PROJECT_OWNER, PROJECT_TEAM, CLIENT (and ADMIN)
      if (['ADMIN', 'PROJECT_OWNER', 'PROJECT_TEAM', 'CLIENT'].includes(role)) {
        tabs.push({ id: 'dashboard', label: 'Dashboard' });
      }
      // Vendors can also browse the historical PRs for packages they are
      // linked to (filtered client-side in filteredAllPrs).
      if (this.canManage || this.canReadOnly || this.canSubmitAnyPr) tabs.push({ id: 'all-prs', label: 'All Progress Reports' });
      if (this.canSeeApprovals) tabs.push({ id: 'approvals', label: 'Approvals' });
      return tabs;
    },

    filteredAllPrs() {
      let prs = this.allPrs;
      // Vendors only see PRs for packages they are linked to.
      if (this.currentUser && this.currentUser.role === 'VENDOR') {
        const allowed = new Set(this.linkedContactPackageIds);
        prs = prs.filter(pr => allowed.has(pr.package_id));
      }
      if (this.allPrsPackageFilter) prs = prs.filter(pr => pr.package_id === this.allPrsPackageFilter);
      if (this.allPrsStatusFilter) prs = prs.filter(pr => pr.status === this.allPrsStatusFilter);
      return prs;
    },

    filteredTasks() {
      const sorted = [...this.tasks].sort((a, b) => {
        if (!a.start_date && !b.start_date) return 0;
        if (!a.start_date) return 1;
        if (!b.start_date) return -1;
        return a.start_date.localeCompare(b.start_date);
      });
      if (!this.taskStatusFilter) return sorted;
      return sorted.filter(t => this.taskStatus(t) === this.taskStatusFilter);
    },

    allGroupsExpanded() {
      if (this.taskGroupView === 'package') {
        return this.tasksGroupedByPackage.every(g => this.expandedPackages.includes(g.package_id));
      }
      if (this.taskGroupView === 'area') {
        return this.tasksGroupedByArea.every(g => this.expandedAreas.includes(g.area_id || '__none__'));
      }
      if (this.taskGroupView === 'unit') {
        return this.tasksGroupedByUnit.every(g => this.expandedUnits.includes(g.unit_id || '__none__'));
      }
      return false;
    },

    tasksGroupedByPackage() {
      const groups = {};
      // Use all tasks (not filteredTasks) for Progress Reporting — show every task
      const allTasks = [...this.tasks].sort((a, b) => {
        if (!a.start_date && !b.start_date) return 0;
        if (!a.start_date) return 1;
        if (!b.start_date) return -1;
        return a.start_date.localeCompare(b.start_date);
      });
      for (const task of allTasks) {
        if (!task.package_id) continue;
        const key = task.package_id;
        if (!groups[key]) {
          groups[key] = {
            package_id: key,
            package_tag: task.package_tag || `Pkg ${key}`,
            package_name: task.package_name,
            tasks: [],
            financialWeight: 0,
            budgetGapLabel: null,
            budgetGapClass: '',
            // Package-level PR state (filled from first task that has it)
            activePrId: null,
            activePrStatus: null,
            activePrPmcComment: null,
            activePrClientComment: null,
            activePrPmcReviewed: false,
            activePrPmcApproved: null,
            activePrPmcReviewerName: null,
            activePrClientReviewed: false,
            activePrClientApproved: null,
            activePrClientReviewerName: null,
          };
        }
        groups[key].tasks.push(task);
        groups[key].financialWeight += (task.financial_weight || 0);
        // Populate PR state from any task in the package
        if (task.active_pr_id && !groups[key].activePrId) {
          const pr = this.myPrs.find(p => p.id === task.active_pr_id) ||
                     this.allPrs.find(p => p.id === task.active_pr_id);
          groups[key].activePrId = task.active_pr_id;
          groups[key].activePrStatus = task.active_pr_status;
          groups[key].activePrPmcComment = pr ? pr.pmc_comment : null;
          groups[key].activePrClientComment = pr ? pr.client_comment : null;
          if (pr) {
            groups[key].activePrPmcReviewed     = !!pr.pmc_reviewed;
            groups[key].activePrPmcApproved     = pr.pmc_approved;
            groups[key].activePrPmcReviewerName = pr.pmc_reviewer_name;
            groups[key].activePrClientReviewed     = !!pr.client_reviewed;
            groups[key].activePrClientApproved     = pr.client_approved;
            groups[key].activePrClientReviewerName = pr.client_reviewer_name;
          }
        }
      }
      return Object.values(groups).sort((a, b) =>
        String(a.package_tag).localeCompare(String(b.package_tag))
      );
    },

    tasksGroupedByArea() {
      const groups = {};
      for (const task of this.filteredTasks) {
        const key = task.area_id || '__none__';
        if (!groups[key]) {
          groups[key] = {
            area_id: task.area_id || null,
            area_label: task.area_tag ? `${task.area_tag} — ${task.area_description}` : '— No Area —',
            tasks: [],
          };
        }
        groups[key].tasks.push(task);
      }
      return Object.values(groups).sort((a, b) => {
        if (!a.area_id) return 1;
        if (!b.area_id) return -1;
        return a.area_label.localeCompare(b.area_label);
      });
    },

    tasksGroupedByUnit() {
      const groups = {};
      for (const task of this.filteredTasks) {
        const key = task.unit_id || '__none__';
        if (!groups[key]) {
          groups[key] = {
            unit_id: task.unit_id || null,
            unit_label: task.unit_tag ? `${task.unit_tag} — ${task.unit_description}` : '— No Unit —',
            tasks: [],
          };
        }
        groups[key].tasks.push(task);
      }
      return Object.values(groups).sort((a, b) => {
        if (!a.unit_id) return 1;
        if (!b.unit_id) return -1;
        return a.unit_label.localeCompare(b.unit_label);
      });
    },

    unassignedTasks() {
      return this.filteredTasks.filter(t => !t.package_id);
    },

    taskTotals() {
      return {
        count:     this.filteredTasks.length,
        weight:    this.filteredTasks.reduce((s, t) => s + (t.financial_weight || 0), 0),
        completed: this.filteredTasks.filter(t => t.current_progress >= 100).length,
        late:      this.filteredTasks.filter(t => t.is_late).length,
      };
    },

    selectedPackageName() {
      if (!this.dashPackageFilter) return 'All Packages';
      const pkg = this.packages.find(p => p.id === this.dashPackageFilter);
      return pkg ? `${pkg.tag_number} — ${pkg.name}` : '';
    },

    dashFilterLabel() {
      const parts = [];
      if (this.dashPackageFilter) {
        const pkg = this.packages.find(p => p.id === this.dashPackageFilter);
        if (pkg) parts.push(pkg.tag_number);
      }
      if (this.dashAreaFilter) {
        const area = this.areas.find(a => a.id === this.dashAreaFilter);
        if (area) parts.push(area.tag);
      }
      if (this.dashUnitFilter) {
        const unit = this.units.find(u => u.id === this.dashUnitFilter);
        if (unit) parts.push(unit.tag);
      }
      return parts.length ? parts.join(' · ') : 'All Tasks';
    },

    ganttSourceTasks() {
      // Overall Time Schedule shows every package; vendors and other contacts
      // get the full project list, not their vendor-scoped slice.
      return (this.allTasksForGantt && this.allTasksForGantt.length)
        ? this.allTasksForGantt
        : this.tasks;
    },

    ganttFilteredTasks() {
      const sorted = [...this.ganttSourceTasks].sort((a, b) => {
        if (!a.start_date && !b.start_date) return 0;
        if (!a.start_date) return 1;
        if (!b.start_date) return -1;
        return a.start_date.localeCompare(b.start_date);
      });
      if (!this.taskStatusFilter) return sorted;
      return sorted.filter(t => this.taskStatus(t) === this.taskStatusFilter);
    },

    ganttDateRange() {
      const dated = this.ganttSourceTasks.filter(t => t.start_date && t.finish_date);
      if (!dated.length) return null;
      const minStr = dated.map(t => t.start_date).reduce((a, b) => a < b ? a : b);
      const maxStr = dated.map(t => t.finish_date).reduce((a, b) => a > b ? a : b);
      const minD = new Date(minStr);
      const maxD = new Date(maxStr);
      const rangeStart = new Date(minD.getFullYear(), minD.getMonth(), 1);
      const rangeEnd   = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 0);
      return { rangeStart, rangeEnd };
    },

    ganttMonths() {
      if (!this.ganttDateRange) return [];
      const { rangeStart, rangeEnd } = this.ganttDateRange;
      const totalMs = rangeEnd - rangeStart + 86400000;
      const months = [];
      let cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      while (cur <= rangeEnd) {
        const mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
        const clampEnd = mEnd > rangeEnd ? rangeEnd : mEnd;
        const daysInSlice = (clampEnd - cur) / 86400000 + 1;
        months.push({
          label: cur.toLocaleString('default', { month: 'short', year: '2-digit' }),
          widthPct: (daysInSlice * 86400000 / totalMs) * 100,
        });
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      }
      return months;
    },

    ganttTodayPct() {
      if (!this.ganttDateRange) return -1;
      const { rangeStart, rangeEnd } = this.ganttDateRange;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const totalMs = rangeEnd - rangeStart + 86400000;
      if (totalMs <= 0) return -1;
      return ((today - rangeStart) / totalMs) * 100;
    },

    ganttGroups() {
      if (!this.ganttDateRange) return [];
      const { rangeStart, rangeEnd } = this.ganttDateRange;
      const totalMs = rangeEnd - rangeStart + 86400000;

      const calcBar = (task) => {
        const tStart = new Date(task.start_date);
        const tEnd   = new Date(task.finish_date);
        const leftPct  = Math.max(0, (tStart - rangeStart) / totalMs * 100);
        const widthPct = Math.max(0.5, Math.min(
          (tEnd - tStart + 86400000) / totalMs * 100,
          100 - leftPct
        ));
        const isMilestone = task.start_date === task.finish_date;
        return { ...task, barLeft: leftPct, barWidth: widthPct, isMilestone };
      };

      const dated = this.ganttFilteredTasks.filter(t => t.start_date && t.finish_date);

      if (this.ganttGroupView === 'list') {
        return [{ id: '__all__', label: 'All Tasks', sublabel: '', tasks: dated.map(calcBar), isFlat: true }];
      }

      const groups = {};
      for (const task of dated) {
        let key, label, sublabel;
        if (this.ganttGroupView === 'package') {
          key = task.package_id || 'unassigned';
          label = task.package_tag || (key === 'unassigned' ? 'No Package' : `Pkg ${key}`);
          sublabel = task.package_name || '';
        } else if (this.ganttGroupView === 'area') {
          key = task.area_id || 'unassigned';
          label = task.area_tag || 'No Area';
          sublabel = task.area_description || '';
        } else {
          key = task.unit_id || 'unassigned';
          label = task.unit_tag || 'No Unit';
          sublabel = task.unit_description || '';
        }
        if (!groups[key]) {
          groups[key] = { id: key, label, sublabel, tasks: [], isFlat: false };
        }
        groups[key].tasks.push(calcBar(task));
      }
      return Object.values(groups).sort((a, b) => String(a.label).localeCompare(String(b.label)));
    },
  },

  async mounted() {
    if (this.initialTab) {
      this.activeTab = this.initialTab;
    }
    this._ganttMouseMove = (e) => this.onGanttMouseMove(e);
    this._ganttMouseUp   = ()  => this.onGanttMouseUp();
    document.addEventListener('mousemove', this._ganttMouseMove);
    document.addEventListener('mouseup',   this._ganttMouseUp);
    await this.loadAll();
    // Preload progress reports so the Approvals tab badge count shows up
    // immediately, even when the user hasn't clicked into the tab yet.
    if (this.canSeeApprovals) await this.loadAllPrs();
    this.checkPendingOpen();
  },

  beforeUnmount() {
    document.removeEventListener('mousemove', this._ganttMouseMove);
    document.removeEventListener('mouseup',   this._ganttMouseUp);
    // Destroy charts so they don't outlive their canvases in Chart.js's
    // global registry and throw on the next animation frame.
    if (this.evChartInstance)    { try { this.evChartInstance.destroy(); }    catch (e) {} this.evChartInstance = null; }
    if (this.evBarChartInstance) { try { this.evBarChartInstance.destroy(); } catch (e) {} this.evBarChartInstance = null; }
  },

  watch: {
    activeTab(val) {
      this.$emit('subtab-change', val);
      if (val === 'dashboard') this.loadDashboard();
      if (val === 'all-prs') this.loadAllPrs();
      if (val === 'approvals') this.loadAllPrs();
    },
    editingTask(val) {
      this.$emit('record-change', val ? { type: 'task', id: val.id } : null);
    },
    showInvoiceSpend(val) {
      if (val && !this.invoiceSpendData) {
        this.loadInvoiceSpendData().then(() => this.renderEvLineChart());
      } else {
        this.renderEvLineChart();
      }
    },
  },

  methods: {
    tabClass(t) {
      return ['px-4 py-1.5 rounded text-sm font-medium transition-all', this.activeTab === t ? 'bg-white shadow text-ips-blue' : 'text-gray-500 hover:text-gray-700'];
    },

    canReviewAsPmc(pr) {
      if (pr.pmc_reviewed) return false;
      if (this.isAdminOrOwner) return true;
      if (!this.currentUser || !this.currentUser.contact_id) return false;
      const cid = this.currentUser.contact_id;
      return (this.packages || []).some(p => p.id === pr.package_id && p.pmc_commercial_reviewer_id === cid);
    },

    canReviewAsClient(pr) {
      if (pr.client_reviewed) return false;
      if (this.isAdminOrOwner) return true;
      if (!this.currentUser || !this.currentUser.contact_id) return false;
      const cid = this.currentUser.contact_id;
      return (this.packages || []).some(p => p.id === pr.package_id && p.client_commercial_reviewer_id === cid);
    },

    openPrReview(pr, role) {
      this.prReviewRec = pr;
      this.prReviewRole = role;
      this.prReviewComment = '';
      this.prReviewError = '';
      // Default: all tasks approved (checked)
      this.prReviewTaskApprovals = {};
      (pr.entries || []).forEach(e => { this.prReviewTaskApprovals[e.id] = true; });
      this.showPrReviewModal = true;
    },

    async submitPrReview() {
      if (!this.prReviewComment.trim()) {
        this.prReviewError = 'A comment is required.';
        return;
      }
      this.prReviewSaving = true;
      this.prReviewError = '';
      try {
        const allApproved = Object.values(this.prReviewTaskApprovals).every(v => v);
        const taskApprovals = Object.entries(this.prReviewTaskApprovals).map(([id, approved]) => ({ entry_id: parseInt(id), approved }));
        const data = { approved: allApproved, comment: this.prReviewComment, task_approvals: taskApprovals };
        if (this.prReviewRole === 'pmc') {
          await API.pmcReviewPr(this.prReviewRec.id, data);
        } else {
          await API.clientReviewPr(this.prReviewRec.id, data);
        }
        this.showPrReviewModal = false;
        await this.loadAllPrs();
      } catch (e) {
        this.prReviewError = e.message || 'Review failed';
      } finally {
        this.prReviewSaving = false;
      }
    },

    canOverridePr(pr) {
      // Mirrors backend gate at schedule.py override_pr:
      // ADMIN / PROJECT_OWNER / Schedule Module Lead / Package Owner of the PR's package.
      if (this.isAdminOrOwner) return true;
      if (!pr || !this.currentUser) return false;
      const pkg = (this.packages || []).find(p => p.id === pr.package_id);
      return !!(pkg && pkg.package_owner_id && pkg.package_owner_id === this.currentUser.contact_id);
    },

    openPrOverride(pr, approved) {
      this.overridePrRec = pr;
      this.overridePrApproved = approved;
      this.overridePrComment = '';
      this.overridePrError = '';
      this.showPrOverrideModal = true;
    },

    async submitPrOverride() {
      this.overridePrSaving = true;
      this.overridePrError = '';
      try {
        await API.overridePr(this.overridePrRec.id, { approved: this.overridePrApproved, comment: this.overridePrComment });
        await this.loadAllPrs();
        this.showPrOverrideModal = false;
        this.overridePrRec = null;
      } catch (e) {
        this.overridePrError = e.message || 'Override failed.';
      } finally {
        this.overridePrSaving = false;
      }
    },

    checkPendingOpen() {
      if (!this.pendingOpen) return;
      if (this.pendingOpen.record_type === 'progress_report') {
        // Respect a specific tab hint from My Action Points (e.g. 'progress'
        // for rejected PRs that the creator/linked contact needs to fix).
        // Fall back to 'approvals' for pending-review items.
        const known = ['tasks', 'progress', 'gantt', 'dashboard', 'all-prs', 'approvals'];
        if (!this.initialTab || !known.includes(this.initialTab)) {
          this.activeTab = 'approvals';
        }
        this.$nextTick(() => this.loadAllPrs());
      }
    },

    openPrAttachModal(prId, title) {
      this.prAttachPrId = prId;
      this.prAttachTitle = title || `PR #${prId}`;
      this.showPrAttachModal = true;
    },

    progressColorRaw(pct) {
      if (pct >= 80) return '#16a34a';   // green-600
      if (pct >= 40) return '#2563eb';   // blue-600
      return '#dc2626';                  // red-600
    },

    progressColor(pct) {
      return `color:${this.progressColorRaw(pct)}`;
    },

    fmt(v) {
      if (v == null || v === '') return '—';
      return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
    },

    async loadAll() {
      this.loading = true;
      try {
        const [tasks, allTasks, packages, prs, pkgPerms, areas, units] = await Promise.all([
          API.getTasks(),
          API.getAllTasksForGantt().catch(() => []),
          API.getPackages(),
          API.getProgressReports().catch(() => []),
          API.getMyPackagePermissions().catch(() => ({ account_manager_ids: [], linked_contact_ids: [] })),
          API.getAreas().catch(() => []),
          API.getUnits().catch(() => []),
        ]);
        this.tasks = tasks;
        this.allTasksForGantt = allTasks;
        this.packages = packages;
        this.areas = areas;
        this.units = units;
        this.myPrs = prs.filter(pr =>
          ['DRAFT', 'SUBMITTED', 'REJECTED'].includes(pr.status) &&
          pr.created_by_id === (this.currentUser && this.currentUser.id)
        );
        this.accountManagerPackageIds = pkgPerms.account_manager_ids || [];
        this.linkedContactPackageIds = pkgPerms.linked_contact_ids || [];
        // Auto-expand all groups
        const pkgIds = [...new Set(tasks.map(t => t.package_id).filter(Boolean))];
        this.expandedPackages = [...pkgIds, 'unassigned'];
        this.expandedAreas = [...new Set(tasks.map(t => t.area_id || '__none__'))];
        this.expandedUnits = [...new Set(tasks.map(t => t.unit_id || '__none__'))];
      } finally {
        this.loading = false;
      }
    },

    async reloadTasks() {
      const [tasks, allTasks, prs] = await Promise.all([
        API.getTasks(),
        API.getAllTasksForGantt().catch(() => []),
        API.getProgressReports().catch(() => []),
      ]);
      this.tasks = tasks;
      this.allTasksForGantt = allTasks;
      this.myPrs = prs.filter(pr =>
        ['DRAFT', 'SUBMITTED', 'REJECTED'].includes(pr.status) &&
        pr.created_by_id === (this.currentUser && this.currentUser.id)
      );
    },

    togglePackage(id) {
      const idx = this.expandedPackages.indexOf(id);
      if (idx >= 0) this.expandedPackages.splice(idx, 1);
      else this.expandedPackages.push(id);
    },

    // ── Task CRUD ──────────────────────────────────────────────────────────────
    openTaskForm(task) {
      this.editingTask = task || null;
      if (task) {
        this.taskForm = {
          description: task.description,
          details: task.details || '',
          package_id: task.package_id || null,
          start_date: task.start_date || '',
          finish_date: task.finish_date || '',
          financial_weight: task.financial_weight != null ? task.financial_weight : null,
          area_id: task.area_id || null,
          unit_id: task.unit_id || null,
          updated_at: task.updated_at || null,
        };
      } else {
        this.taskForm = { description: '', details: '', package_id: null, start_date: '', finish_date: '', financial_weight: null, area_id: null, unit_id: null, updated_at: null };
      }
      this.taskError = '';
      this.showTaskForm = true;
    },

    async saveTask() {
      if (!this.taskForm.description.trim()) {
        this.taskError = 'Description is required.';
        return;
      }
      this.taskSaving = true;
      this.taskError = '';
      try {
        const body = {
          description: this.taskForm.description.trim(),
          details: this.taskForm.details || null,
          package_id: this.taskForm.package_id || null,
          start_date: this.taskForm.start_date || null,
          finish_date: this.taskForm.finish_date || null,
          financial_weight: this.taskForm.financial_weight !== null && this.taskForm.financial_weight !== ''
            ? Number(this.taskForm.financial_weight) : null,
          area_id: this.taskForm.area_id || null,
          unit_id: this.taskForm.unit_id || null,
          updated_at: this.taskForm.updated_at || null,
        };
        if (this.editingTask) {
          await API.updateTask(this.editingTask.id, body);
          this.showTaskForm = false;
        } else {
          this.editingTask = { ...await API.createTask(body), _justCreated: true };
          this.taskForm.updated_at = this.editingTask.updated_at || null;
        }
        await this.reloadTasks();
      } catch (e) {
        this.taskError = e.status === 409
          ? 'This task was modified by another user. Please close and reopen to get the latest version.'
          : e.message;
      } finally {
        this.taskSaving = false;
      }
    },

    confirmDeleteTask(task) {
      this.deletingTask = task;
    },

    async doDeleteTask() {
      try {
        await API.deleteTask(this.deletingTask.id);
        this.deletingTask = null;
        await this.reloadTasks();
      } catch (e) {
        alert(e.message);
      }
    },

    // ── Bulk PR ─────────────────────────────────────────────────────────────────
    openBulkPrModal(group) {
      this.bulkPrGroup = group;
      this.bulkPrError = '';
      // Determine active PR for the package from task data
      const firstWithPr = group.tasks.find(t => t.active_pr_id);
      this.bulkPrPrId = firstWithPr ? firstWithPr.active_pr_id : null;
      const prStatus = firstWithPr ? firstWithPr.active_pr_status : null;
      this.bulkPrSubmitted = prStatus === 'SUBMITTED';
      this.bulkPrEntries = group.tasks.map(task => ({
        task_id: task.id,
        task_description: task.description,
        details: task.details || '',
        start_date: task.start_date,
        finish_date: task.finish_date,
        percentage: task.active_pr_percentage ?? task.current_progress ?? 0,
        note: task.active_pr_note || '',
        pmc_approved: task.active_pr_entry_pmc_approved,
        client_approved: task.active_pr_entry_client_approved,
        is_late: task.is_late,
      }));
      this.showBulkPrModal = true;
    },

    async saveBulkPr(submit) {
      if (this.bulkPrSubmitted) return;
      this.bulkPrSaving = true;
      this.bulkPrError = '';
      try {
        const result = await API.bulkProgressReport({
          package_id: this.bulkPrGroup.package_id,
          entries: this.bulkPrEntries.map(e => ({
            task_id: e.task_id,
            percentage: e.percentage,
            note: e.note || null,
          })),
          submit,
        });
        this.bulkPrPrId = result.id;
        if (!submit) {
          // Stay open so user can attach files
          this.bulkPrError = '';
        } else {
          this.showBulkPrModal = false;
        }
        await this.reloadTasks();
      } catch (e) {
        this.bulkPrError = e.message;
      } finally {
        this.bulkPrSaving = false;
      }
    },

    async cancelPr(pr) {
      if (!confirm('Cancel this progress report?')) return;
      try {
        await API.cancelProgressReport(pr.id);
        await this.reloadTasks();
      } catch (e) {
        alert(e.message);
      }
    },

    togglePr(prId) {
      const idx = this.expandedPrs.indexOf(prId);
      if (idx >= 0) this.expandedPrs.splice(idx, 1);
      else this.expandedPrs.push(prId);
    },

    prStatusClass(status) {
      // Budget-module style pills — same visual language across the app.
      const map = {
        DRAFT:     'bg-gray-100 text-gray-600',
        SUBMITTED: 'bg-blue-100 text-blue-700',
        APPROVED:  'bg-green-100 text-green-700',
        REJECTED:  'bg-red-100 text-red-700',
        CANCELLED: 'bg-gray-100 text-gray-400',
      };
      return map[status] || 'bg-gray-100 text-gray-500';
    },

    // ── Package permission helpers ───────────────────────────────────────────────
    canManagePackage(packageId) {
      if (this.canManage) return true;
      return packageId && this.accountManagerPackageIds.includes(packageId);
    },

    canSubmitPrForGroup(group) {
      if (this.canManage) return true;
      if (!group) return false;
      return this.accountManagerPackageIds.includes(group.package_id) ||
             this.linkedContactPackageIds.includes(group.package_id);
    },

    allowedPackages() {
      if (this.canManage) return this.packages;
      return this.packages.filter(p => this.accountManagerPackageIds.includes(p.id));
    },

    // ── All Progress Reports tab actions ─────────────────────────────────────────
    async allPrsCancel(pr) {
      if (!confirm('Cancel this progress report?')) return;
      try {
        await API.cancelProgressReport(pr.id);
        await this.loadAllPrs();
        await this.reloadTasks();
      } catch (e) {
        alert(e.message);
      }
    },

    // ── All Progress Reports tab ─────────────────────────────────────────────────
    async loadAllPrs() {
      this.allPrsLoading = true;
      try {
        this.allPrs = await API.getAllProgressReports();
      } catch (e) {
        console.error('Failed to load all PRs:', e);
      } finally {
        this.allPrsLoading = false;
      }
    },

    // ── PR review history ────────────────────────────────────────────────────
    async openPrHistory(pr) {
      this.historyPr = pr;
      this.prHistoryEntries = [];
      this.prHistoryError = '';
      this.prHistoryLoading = true;
      try {
        this.prHistoryEntries = await API.getProgressReportHistory(pr.id);
      } catch (e) {
        this.prHistoryError = e.message || 'Failed to load history.';
      } finally {
        this.prHistoryLoading = false;
      }
    },

    historyEventLabelPr(entry) {
      if (entry.event === 'SUBMIT') return 'Submitted for review';
      if (entry.event === 'OVERRIDE') return 'Override — ' + (entry.approved ? 'Approved' : 'Rejected');
      const who = entry.event === 'PMC' ? 'PMC Commercial' : 'Client Commercial';
      return who + (entry.approved ? ' — Approved' : ' — Rejected');
    },

    historyEventClassPr(entry) {
      if (entry.event === 'SUBMIT') return 'bg-blue-100 text-blue-700';
      if (entry.approved === true) return 'bg-green-100 text-green-700';
      if (entry.approved === false) return 'bg-red-100 text-red-700';
      return 'bg-gray-100 text-gray-600';
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

    formatDate(iso) { return iso ? formatDate(iso) : '—'; },

    // ── Gantt resize / zoom ──────────────────────────────────────────────────────
    startGanttResize(e) {
      this.ganttResizing = true;
      this.ganttResizeX0 = e.clientX;
      this.ganttResizeW0 = this.ganttLabelWidth;
    },
    onGanttMouseMove(e) {
      if (!this.ganttResizing) return;
      const delta = e.clientX - this.ganttResizeX0;
      this.ganttLabelWidth = Math.max(100, Math.min(500, this.ganttResizeW0 + delta));
    },
    onGanttMouseUp() {
      this.ganttResizing = false;
    },

    // ── Task status helper ───────────────────────────────────────────────────────
    taskStatus(task) {
      if (task.is_late) return 'late';
      if (task.current_progress >= 100) return 'complete';
      if (task.active_pr_status === 'SUBMITTED') return 'review';
      if (task.active_pr_status === 'DRAFT') return 'draft';
      if (task.active_pr_status === 'REJECTED') return 'rejected_pr';
      if (task.current_progress > 0) return 'in_progress';
      return 'not_started';
    },

    // Pill-style badge (matches budget module look) for a task's current state.
    taskStatusBadge(task) {
      const s = this.taskStatus(task);
      const map = {
        late:         { label: 'Late',         cls: 'bg-red-100 text-red-700' },
        complete:     { label: 'Complete',     cls: 'bg-green-100 text-green-700' },
        review:       { label: 'Under Review', cls: 'bg-yellow-100 text-yellow-700' },
        draft:        { label: 'Draft PR',     cls: 'bg-gray-100 text-gray-600' },
        rejected_pr:  { label: 'Rejected PR',  cls: 'bg-red-100 text-red-700' },
        in_progress:  { label: 'In Progress',  cls: 'bg-blue-100 text-blue-700' },
        not_started:  { label: 'Not Started',  cls: 'bg-gray-100 text-gray-500' },
      };
      return map[s] || map.not_started;
    },

    toggleArea(id) {
      const idx = this.expandedAreas.indexOf(id);
      if (idx >= 0) this.expandedAreas.splice(idx, 1);
      else this.expandedAreas.push(id);
    },

    toggleAllGroups() {
      if (this.allGroupsExpanded) {
        if (this.taskGroupView === 'package') this.expandedPackages = [];
        else if (this.taskGroupView === 'area') this.expandedAreas = [];
        else if (this.taskGroupView === 'unit') this.expandedUnits = [];
      } else {
        if (this.taskGroupView === 'package') {
          this.expandedPackages = this.tasksGroupedByPackage.map(g => g.package_id);
        } else if (this.taskGroupView === 'area') {
          this.expandedAreas = this.tasksGroupedByArea.map(g => g.area_id || '__none__');
        } else if (this.taskGroupView === 'unit') {
          this.expandedUnits = this.tasksGroupedByUnit.map(g => g.unit_id || '__none__');
        }
      }
    },

    toggleUnit(id) {
      const idx = this.expandedUnits.indexOf(id);
      if (idx >= 0) this.expandedUnits.splice(idx, 1);
      else this.expandedUnits.push(id);
    },

    // ── Gantt helpers ────────────────────────────────────────────────────────────
    ganttBarClass(task) {
      if (task.current_progress >= 100) return 'bg-green-500';
      if (task.is_late)                 return 'bg-red-500';
      if (task.current_progress > 0)    return 'bg-blue-500';
      return 'bg-gray-400';
    },

    // ── Dashboard ────────────────────────────────────────────────────────────────
    async loadDashboard() {
      this.dashLoading = true;
      this.dash = null;
      try {
        const params = {};
        if (this.dashPackageFilter) params.package_id = this.dashPackageFilter;
        if (this.dashAreaFilter)    params.area_id    = this.dashAreaFilter;
        if (this.dashUnitFilter)    params.unit_id    = this.dashUnitFilter;
        this.dash = await API.getScheduleDashboard(params);
        console.log('[EV] dashboard data:', JSON.stringify(this.dash?.ev_monthly?.slice(0,3)), 'ev_monthly length:', this.dash?.ev_monthly?.length);
      } catch (e) {
        console.error('Dashboard error:', e);
      } finally {
        this.dashLoading = false;
        // Reload invoice spend data if overlay is active
        if (this.showInvoiceSpend) {
          await this.loadInvoiceSpendData();
        }
        this.$nextTick(() => this.renderEvCharts());
      }
    },

    async loadInvoiceSpendData() {
      this.invoiceSpendLoading = true;
      try {
        const invoices = await API.getBudgetInvoices(this.dashPackageFilter || undefined);
        const filtered = invoices;
        // Group by month and build cumulative
        const byMonth = {};
        filtered.forEach(inv => {
          if (!inv.invoice_date) return;
          const month = inv.invoice_date.substring(0, 7);
          byMonth[month] = (byMonth[month] || 0) + (inv.amount || 0);
        });
        const months = Object.keys(byMonth).sort();
        let cumulative = 0;
        const data = months.map(m => {
          cumulative += byMonth[m];
          return { month: m, cumulative };
        });
        this.invoiceSpendData = data;
      } catch (e) {
        console.error('Failed to load invoice data:', e);
        this.invoiceSpendData = null;
      } finally {
        this.invoiceSpendLoading = false;
      }
    },

    renderEvCharts() {
      this.renderEvLineChart();
      this.renderEvBarChart();
    },

    renderEvLineChart() {
      const canvas = this.$refs.evLineChart;
      console.log('[EV] renderEvLineChart — canvas:', !!canvas, '| ev_monthly length:', this.dash?.ev_monthly?.length);
      if (!canvas || !this.dash || !this.dash.ev_monthly || !this.dash.ev_monthly.length) return;
      if (this.evChartInstance) { this.evChartInstance.destroy(); this.evChartInstance = null; }

      const labels   = this.dash.ev_monthly.map(d => d.month);
      const forecast = this.dash.ev_monthly.map(d => d.forecast_cum);
      const actual   = this.dash.ev_monthly.map(d => d.actual_cum);

      const datasets = [
        {
          label: 'Forecast (Cumulative PV)',
          data: forecast,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.07)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: 'Actual (Cumulative EV)',
          data: actual,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,0.07)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
          spanGaps: false,
        },
      ];

      // Add invoice spend overlay if enabled
      if (this.showInvoiceSpend && this.invoiceSpendData && this.invoiceSpendData.length) {
        // Map invoice cumulative data to match EV chart labels
        const invoiceMap = {};
        this.invoiceSpendData.forEach(d => { invoiceMap[d.month] = d.cumulative; });
        // Fill in cumulative values for each EV month label
        let lastVal = 0;
        const invoiceLine = labels.map(month => {
          if (invoiceMap[month] !== undefined) {
            lastVal = invoiceMap[month];
          }
          return invoiceMap[month] !== undefined ? invoiceMap[month] : (lastVal > 0 ? lastVal : null);
        });
        datasets.push({
          label: 'Cumulative Invoice Spend',
          data: invoiceLine,
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245,158,11,0.07)',
          fill: false,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2.5,
          borderDash: [6, 3],
          spanGaps: true,
        });
      }

      this.evChartInstance = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: {
                label: ctx => ctx.dataset.label + ': ' +
                  (ctx.raw != null
                    ? ctx.raw.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                    : 'N/A'),
              },
            },
          },
          scales: {
            x: { ticks: { maxRotation: 45 } },
            y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() } },
          },
        },
      });
    },

    renderEvBarChart() {
      const canvas = this.$refs.evBarChart;
      console.log('[EV] renderEvBarChart  — canvas:', !!canvas, '| ev_monthly length:', this.dash?.ev_monthly?.length);
      if (!canvas || !this.dash || !this.dash.ev_monthly || !this.dash.ev_monthly.length) return;
      if (this.evBarChartInstance) { this.evBarChartInstance.destroy(); this.evBarChartInstance = null; }

      const labels   = this.dash.ev_monthly.map(d => d.month);
      const forecast = this.dash.ev_monthly.map(d => d.forecast_nc);
      const actual   = this.dash.ev_monthly.map(d => d.actual_nc);

      this.evBarChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Forecast (Planned this Month)',
              data: forecast,
              backgroundColor: 'rgba(59,130,246,0.7)',
              borderColor: '#3b82f6',
              borderWidth: 1,
            },
            {
              label: 'Actual (Earned this Month)',
              data: actual,
              backgroundColor: 'rgba(16,185,129,0.7)',
              borderColor: '#10b981',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: {
                label: ctx => ctx.dataset.label + ': ' +
                  ctx.raw.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
              },
            },
            datalabels: {
              anchor: 'end',
              align: 'end',
              offset: 2,
              font: { size: 10, weight: '600' },
              color: ctx => ctx.datasetIndex === 0 ? '#3b82f6' : '#10b981',
              formatter: v => v > 0 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '',
            },
          },
          scales: {
            x: { ticks: { maxRotation: 45 } },
            y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() } },
          },
        },
        plugins: [ChartDataLabels],
      });
    },

    // ── Export / Import ───────────────────────────────────────────────────────
    async exportTasksReport() {
      this.tasksExporting = true;
      try {
        const date = new Date().toISOString().split('T')[0];
        await API.download('/api/tasks/export/excel', `tasks_${date}.xlsx`);
      } catch (e) {
        alert('Export failed: ' + e.message);
      } finally { this.tasksExporting = false; }
    },

    async exportTasksXlsx() {
      try { await API.exportTasks(); }
      catch (e) { alert(e.message || 'Export failed'); }
    },
    openTaskImportModal() {
      this.showTaskImportModal = true;
      this.taskImportFile = null;
      this.taskImportPreview = null;
      this.taskImportError = '';
      this.taskImportResult = null;
    },
    resetTaskImport() {
      if (this.taskImportPreview) {
        this.taskImportPreview = null;
        this.taskImportError = '';
      } else {
        this.showTaskImportModal = false;
      }
    },
    onTaskImportFileChange(e) {
      this.taskImportFile = e.target.files[0] || null;
      this.taskImportError = '';
    },
    async runTaskImportPreview() {
      if (!this.taskImportFile) return;
      this.taskImportLoading = true;
      this.taskImportError = '';
      try {
        this.taskImportPreview = await API.previewTasksImport(this.taskImportFile);
      } catch (e) {
        this.taskImportError = e.message || 'Preview failed';
      } finally {
        this.taskImportLoading = false;
      }
    },
    async applyTaskImport() {
      if (!this.taskImportPreview) return;
      this.taskImportApplying = true;
      this.taskImportError = '';
      try {
        this.taskImportResult = await API.applyTasksImport({ rows: this.taskImportPreview.rows });
      } catch (e) {
        this.taskImportError = e.message || 'Import failed';
      } finally {
        this.taskImportApplying = false;
      }
    },
  },
});
