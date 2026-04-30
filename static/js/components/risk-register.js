// ─────────────────────────────────────────────────────────────────────────────
// Risk Register Module
// ─────────────────────────────────────────────────────────────────────────────
app.component('risk-register-module', {
  props: ['currentUser', 'contacts', 'pendingOpen', 'initialTab'],
  emits: ['subtab-change', 'record-change'],
  template: `
    <div>
      <!-- Tab bar -->
      <div class="sub-tab-bar" style="margin-bottom:0">
        <button @click="tab='setup'" :class="['sub-tab', tab==='setup' ? 'active' : '']" v-if="canViewSetup">
          Setup
        </button>
        <button @click="tab='register'" :class="['sub-tab', tab==='register' ? 'active' : '']">
          Risk Register
        </button>
        <button @click="tab='dashboard'" :class="['sub-tab', tab==='dashboard' ? 'active' : '']" v-if="!isVendor">
          Dashboard
        </button>
      </div>

      <div class="content-area">

        <!-- ══ TAB: SETUP ══ -->
        <div v-if="tab==='setup' && canViewSetup">

          <!-- Score Setup -->
          <div class="card mb-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-base font-semibold text-gray-800">Risk Score Setup</h3>
              <button v-if="canEditSetup && !editingScores" @click="startEditScores" class="btn-secondary text-xs">
                Edit Scores
              </button>
              <div v-if="editingScores" class="flex gap-2">
                <button @click="cancelEditScores" class="btn-secondary text-xs">Cancel</button>
                <button @click="saveScores" :disabled="savingScores" class="btn-primary text-xs">
                  {{ savingScores ? 'Saving...' : 'Save' }}
                </button>
              </div>
            </div>
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-gray-50 border-b border-gray-200">
                  <th class="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Score</th>
                  <th class="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Probability %</th>
                  <th class="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">CAPEX Impact %</th>
                  <th class="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Schedule Impact %</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in scoreSetup" :key="s.score" class="border-b border-gray-100">
                  <td class="px-4 py-2 font-medium">{{ s.score }}</td>
                  <td class="px-4 py-2">
                    <span v-if="!editingScores">{{ s.probability_pct }}%</span>
                    <input v-else v-model.number="scoreEdits[s.score].probability_pct" type="number" min="0" max="100" step="0.1" class="input-field w-24 py-1 text-sm"/>
                  </td>
                  <td class="px-4 py-2">
                    <span v-if="!editingScores">{{ s.capex_impact_pct }}%</span>
                    <input v-else v-model.number="scoreEdits[s.score].capex_impact_pct" type="number" min="0" max="100" step="0.1" class="input-field w-24 py-1 text-sm"/>
                  </td>
                  <td class="px-4 py-2">
                    <span v-if="!editingScores">{{ s.schedule_impact_pct }}%</span>
                    <input v-else v-model.number="scoreEdits[s.score].schedule_impact_pct" type="number" min="0" max="100" step="0.1" class="input-field w-24 py-1 text-sm"/>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Risk Matrix -->
          <div class="card mb-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-base font-semibold text-gray-800">Risk Matrix (Probability × Impact)</h3>
              <div v-if="editingMatrix && canEditSetup" class="flex gap-2">
                <button @click="editingMatrix=false" class="btn-secondary text-xs">Done</button>
              </div>
              <button v-else-if="canEditSetup" @click="editingMatrix=true" class="btn-secondary text-xs">Edit Matrix</button>
            </div>
            <div class="overflow-auto">
              <table class="text-sm border-collapse">
                <thead>
                  <tr>
                    <th class="px-3 py-2 text-xs text-gray-500 font-semibold text-right">Prob ↓ / Impact →</th>
                    <th v-for="i in 5" :key="i" class="px-3 py-2 text-xs text-gray-500 font-semibold text-center">{{ i }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in 5" :key="p">
                    <td class="px-3 py-2 text-xs font-semibold text-gray-500 text-right">{{ p }}</td>
                    <td v-for="i in 5" :key="i" class="px-1 py-1">
                      <div v-if="!editingMatrix"
                        class="w-16 h-10 rounded flex items-center justify-center text-xs font-semibold"
                        :style="matrixCellStyle(p, i)">
                        {{ matrixCellLabel(p, i) }}
                      </div>
                      <select v-else
                        :value="matrixCell(p, i)"
                        @change="updateCell(p, i, $event.target.value)"
                        class="w-16 h-10 rounded text-xs font-semibold text-center border-0 cursor-pointer"
                        :style="matrixCellStyle(p, i)">
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MED</option>
                        <option value="HIGH">HIGH</option>
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="flex gap-4 mt-3 text-xs text-gray-500">
              <span><span class="inline-block w-3 h-3 rounded mr-1" style="background:#16a34a"></span>LOW</span>
              <span><span class="inline-block w-3 h-3 rounded mr-1" style="background:#d97706"></span>MEDIUM</span>
              <span><span class="inline-block w-3 h-3 rounded mr-1" style="background:#dc2626"></span>HIGH</span>
            </div>
          </div>

          <!-- Categories and Phases side by side -->
          <div class="grid grid-cols-2 gap-6">
            <!-- Categories -->
            <div class="card">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-base font-semibold text-gray-800">Categories</h3>
                <button v-if="canEditSetup" @click="openCatModal()" class="btn-primary text-xs py-1">+ Add</button>
              </div>
              <div class="space-y-1">
                <div v-if="categories.length===0" class="text-gray-400 text-sm py-4 text-center">No categories</div>
                <div v-for="c in categories" :key="c.id" class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
                  <span class="text-sm text-gray-700">{{ c.name }}</span>
                  <div v-if="canEditSetup" class="flex gap-1">
                    <button @click="openCatModal(c)" class="btn-icon text-gray-400 hover:text-ips-blue">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                    </button>
                    <button @click="deleteCategory(c)" class="btn-icon text-gray-400 hover:text-red-500">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Phases -->
            <div class="card">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-base font-semibold text-gray-800">Project Phases</h3>
                <button v-if="canEditSetup" @click="openPhaseModal()" class="btn-primary text-xs py-1">+ Add</button>
              </div>
              <div class="space-y-1">
                <div v-if="phases.length===0" class="text-gray-400 text-sm py-4 text-center">No phases</div>
                <div v-for="p in phases" :key="p.id" class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
                  <span class="text-sm text-gray-700">{{ p.name }}</span>
                  <div v-if="canEditSetup" class="flex gap-1">
                    <button @click="openPhaseModal(p)" class="btn-icon text-gray-400 hover:text-ips-blue">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                    </button>
                    <button @click="deletePhase(p)" class="btn-icon text-gray-400 hover:text-red-500">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ══ TAB: RISK REGISTER ══ -->
        <div v-if="tab==='register'">
          <!-- Filters + Add -->
          <div class="flex items-center gap-3 mb-4 flex-wrap">
            <div class="relative flex-1 min-w-48">
              <svg class="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
              </svg>
              <input v-model="rSearch" type="text" placeholder="Search risks..." class="input-field pl-9"/>
            </div>
            <select v-model="rStatusFilter" class="input-field w-36">
              <option value="">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="MONITORING">Monitoring</option>
              <option value="CLOSED">Closed</option>
            </select>
            <select v-model="rCatFilter" class="input-field w-36">
              <option value="">All Categories</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <select v-model="rPhaseFilter" class="input-field w-36">
              <option value="">All Phases</option>
              <option v-for="p in phases" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <button @click="exportExcel" :disabled="exporting" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              {{ exporting ? 'Exporting...' : 'Export Excel' }}
            </button>
            <button v-if="!isVendor" @click="openRiskImportModal" class="btn-secondary text-sm flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 8l-3-3m3 3l3-3"/></svg>
              Import
            </button>
            <button v-if="!isVendor" @click="openRiskModal()" class="btn-primary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              Add Risk
            </button>
          </div>

          <!-- Risk Table -->
          <div class="card overflow-hidden p-0">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-gray-50 border-b border-gray-200">
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">ID</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Title</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th class="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Risk Before</th>
                  <th class="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Risk After</th>
                  <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer select-none" @click="toggleSort('budgetBefore')">
                    Budget Impact<br><span class="font-normal normal-case text-gray-400">before / after</span>
                    <span class="ml-0.5 text-gray-400">{{ sortIcon('budgetBefore') }}</span>
                  </th>
                  <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase cursor-pointer select-none" @click="toggleSort('scheduleBefore')">
                    Schedule Impact<br><span class="font-normal normal-case text-gray-400">before / after</span>
                    <span class="ml-0.5 text-gray-400">{{ sortIcon('scheduleBefore') }}</span>
                  </th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Owner</th>
                  <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Action Status</th>
                  <th class="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="filteredRisks.length===0">
                  <td colspan="10" class="px-4 py-8 text-center text-gray-400">No risks found</td>
                </tr>
                <tr v-for="r in filteredRisks" :key="r.id"
                  class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  @click="openRiskDetail(r)">
                  <td class="px-4 py-3 text-gray-500 font-mono text-xs">RI-{{ String(r.seq_id || r.id).padStart(6,'0') }}</td>
                  <td class="px-4 py-3">
                    <span class="font-medium text-gray-800 cursor-default" :title="r.description || ''">{{ r.title }}</span>
                  </td>
                  <td class="px-4 py-3">
                    <span :class="['px-2 py-0.5 rounded-full text-xs font-medium', statusBadgeClass(r.status)]">
                      {{ r.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span v-if="r.prob_score_before" :class="['px-2 py-0.5 rounded text-xs font-bold', riskLevelClass(r.prob_score_before, Math.max(r.capex_score_before||0, r.schedule_score_before||0))]">
                      {{ r.prob_score_before * Math.max(r.capex_score_before||0, r.schedule_score_before||0) }}
                    </span>
                    <span v-else class="text-gray-400">—</span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span v-if="r.prob_score_after" :class="['px-2 py-0.5 rounded text-xs font-bold', riskLevelClass(r.prob_score_after, Math.max(r.capex_score_after||0, r.schedule_score_after||0))]">
                      {{ r.prob_score_after * Math.max(r.capex_score_after||0, r.schedule_score_after||0) }}
                    </span>
                    <span v-else class="text-gray-400">—</span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <span v-if="riskBudgetBefore(r)" class="text-gray-800 font-medium">{{ fmtEur(riskBudgetBefore(r)) }}</span>
                    <span v-else class="text-gray-400">—</span>
                    <div v-if="riskBudgetAfter(r)" class="text-xs text-green-600 mt-0.5">{{ fmtEur(riskBudgetAfter(r)) }}</div>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <span v-if="riskScheduleBefore(r)" class="text-gray-800 font-medium">{{ riskScheduleBefore(r).toFixed(1) }} mo</span>
                    <span v-else class="text-gray-400">—</span>
                    <div v-if="riskScheduleAfter(r)" class="text-xs text-green-600 mt-0.5">{{ riskScheduleAfter(r).toFixed(1) }} mo</div>
                  </td>
                  <td class="px-4 py-3 text-gray-600 text-sm">{{ r.owner_name || '—' }}</td>
                  <td class="px-4 py-3">
                    <span :class="['px-2 py-0.5 rounded text-xs font-medium', actionStatusClass(r.action_status)]">
                      {{ formatActionStatus(r.action_status) }}
                    </span>
                  </td>
                  <td class="px-4 py-3" @click.stop>
                    <div class="flex gap-1 justify-end">
                      <button v-if="!isVendor" @click="openRiskModal(r)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                      </button>
                      <button v-if="!isVendor && r.status !== 'CLOSED'" @click="closeRisk(r)" class="btn-icon text-gray-400 hover:text-green-600" title="Close risk">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                        </svg>
                      </button>
                      <button v-if="canDeleteRisk" @click="deleteRisk(r)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
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
          <div class="mt-2 text-xs text-gray-400">{{ filteredRisks.length }} of {{ risks.length }} risks</div>
        </div>

        <!-- ══ TAB: DASHBOARD ══ -->
        <div v-if="tab==='dashboard' && !isVendor">

          <!-- Dashboard Filters -->
          <div class="flex items-center gap-3 mb-4">
            <select v-model="dashCatFilter" class="input-field w-40">
              <option value="">All Categories</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <select v-model="dashPhaseFilter" class="input-field w-40">
              <option value="">All Phases</option>
              <option v-for="p in phases" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <span v-if="dashCatFilter || dashPhaseFilter" class="text-xs text-gray-400 italic">Filtered: {{ dashFilteredRisks.length }} risks</span>
            <button @click="scheduleDashCharts" class="btn-secondary text-sm flex items-center gap-1.5 ml-auto" title="Re-render dashboard charts">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              Refresh
            </button>
          </div>

          <!-- KPI Cards -->
          <div class="grid grid-cols-5 gap-2 mb-5">
            <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#DC2626,#B91C1C)">
              <p class="text-xs opacity-80">Open Risks</p>
              <p class="text-xl font-bold mt-1 leading-tight">{{ dashOpenRisks.length }}</p>
              <p class="text-xs opacity-60 mt-1">of {{ dashFilteredRisks.length }} total</p>
            </div>
            <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#F59E0B,#D97706)">
              <p class="text-xs opacity-80">Open Exposure — Before Mitigation</p>
              <p class="text-xl font-bold mt-1 leading-tight">{{ totalExposureBeforeOpen }}</p>
              <p class="text-xs opacity-60 mt-1">open risks</p>
            </div>
            <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#10B981,#059669)">
              <p class="text-xs opacity-80">Open Exposure — After Mitigation</p>
              <p class="text-xl font-bold mt-1 leading-tight">{{ totalExposureAfterOpen }}</p>
              <p class="text-xs opacity-60 mt-1">open risks</p>
            </div>
            <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#D97706,#B45309)">
              <p class="text-xs opacity-80">Total Exposure — Before Mitigation</p>
              <p class="text-xl font-bold mt-1 leading-tight">{{ totalExposureBeforeAll }}</p>
              <p class="text-xs opacity-60 mt-1">all risks</p>
            </div>
            <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#059669,#047857)">
              <p class="text-xs opacity-80">Total Exposure — After Mitigation</p>
              <p class="text-xl font-bold mt-1 leading-tight">{{ totalExposureAfterAll }}</p>
              <p class="text-xs opacity-60 mt-1">all risks</p>
            </div>
          </div>

          <!-- ── Budget & Schedule at Risk Overview ── -->
          <div class="grid grid-cols-2 gap-4 mb-6">

            <!-- Budget at Risk -->
            <div class="card p-0 overflow-hidden">
              <div class="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
                <svg class="w-4 h-4 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span class="text-sm font-semibold text-orange-700">Budget at Risk (Expected CAPEX Impact)</span>
              </div>
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-xs text-gray-400 uppercase border-b border-gray-100">
                    <th class="px-4 py-2 text-left font-semibold"></th>
                    <th class="px-4 py-2 text-right font-semibold">Open Risks</th>
                    <th class="px-4 py-2 text-right font-semibold">All Risks</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="border-b border-gray-50">
                    <td class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Before Mitigation</td>
                    <td class="px-4 py-3 text-right">
                      <span class="text-base font-bold text-orange-600">{{ fmtEur(budgetAtRiskBeforeOpen) }}</span>
                    </td>
                    <td class="px-4 py-3 text-right">
                      <span class="text-base font-bold text-orange-500">{{ fmtEur(budgetAtRiskBeforeAll) }}</span>
                    </td>
                  </tr>
                  <tr>
                    <td class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">After Mitigation</td>
                    <td class="px-4 py-3 text-right">
                      <span class="text-base font-bold text-green-600">{{ fmtEur(budgetAtRiskAfterOpen) }}</span>
                      <span v-if="budgetAtRiskBeforeOpen > 0" class="block text-xs text-green-500 mt-0.5">
                        -{{ ((1 - budgetAtRiskAfterOpen / budgetAtRiskBeforeOpen) * 100).toFixed(0) }}% reduction
                      </span>
                    </td>
                    <td class="px-4 py-3 text-right">
                      <span class="text-base font-bold text-green-500">{{ fmtEur(budgetAtRiskAfterAll) }}</span>
                      <span v-if="budgetAtRiskBeforeAll > 0" class="block text-xs text-green-400 mt-0.5">
                        -{{ ((1 - budgetAtRiskAfterAll / budgetAtRiskBeforeAll) * 100).toFixed(0) }}% reduction
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Schedule at Risk -->
            <div class="card p-0 overflow-hidden">
              <div class="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
                <svg class="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span class="text-sm font-semibold text-blue-700">Schedule at Risk (Expected Delay)</span>
              </div>
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-xs text-gray-400 uppercase border-b border-gray-100">
                    <th class="px-4 py-2 text-left font-semibold"></th>
                    <th class="px-4 py-2 text-right font-semibold">Open Risks</th>
                    <th class="px-4 py-2 text-right font-semibold">All Risks</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="border-b border-gray-50">
                    <td class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Before Mitigation</td>
                    <td class="px-4 py-3 text-right">
                      <span class="text-base font-bold text-orange-600">{{ scheduleAtRiskBeforeOpen.toFixed(1) }} <span class="text-xs font-normal text-gray-400">months</span></span>
                    </td>
                    <td class="px-4 py-3 text-right">
                      <span class="text-base font-bold text-orange-500">{{ scheduleAtRiskBeforeAll.toFixed(1) }} <span class="text-xs font-normal text-gray-400">months</span></span>
                    </td>
                  </tr>
                  <tr>
                    <td class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">After Mitigation</td>
                    <td class="px-4 py-3 text-right">
                      <span class="text-base font-bold text-green-600">{{ scheduleAtRiskAfterOpen.toFixed(1) }} <span class="text-xs font-normal text-gray-400">months</span></span>
                      <span v-if="scheduleAtRiskBeforeOpen > 0" class="block text-xs text-green-500 mt-0.5">
                        -{{ ((1 - scheduleAtRiskAfterOpen / scheduleAtRiskBeforeOpen) * 100).toFixed(0) }}% reduction
                      </span>
                    </td>
                    <td class="px-4 py-3 text-right">
                      <span class="text-base font-bold text-green-500">{{ scheduleAtRiskAfterAll.toFixed(1) }} <span class="text-xs font-normal text-gray-400">months</span></span>
                      <span v-if="scheduleAtRiskBeforeAll > 0" class="block text-xs text-green-400 mt-0.5">
                        -{{ ((1 - scheduleAtRiskAfterAll / scheduleAtRiskBeforeAll) * 100).toFixed(0) }}% reduction
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

          </div>

          <!-- Top 10 Open Risks by Impact -->
          <div class="mb-6">
            <div class="grid grid-cols-2 gap-4">
              <!-- Top 10 Budget Impact -->
              <div class="card p-0 overflow-hidden">
                <div class="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
                  <svg class="w-4 h-4 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span class="text-sm font-semibold text-orange-700">Top 10 Open Risks — Budget Impact</span>
                </div>
                <div v-if="top10BudgetImpact.length === 0" class="px-4 py-6 text-center text-gray-400 text-sm">No open risks with budget impact</div>
                <table v-else class="w-full text-sm">
                  <thead>
                    <tr class="text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th class="px-4 py-2 text-left font-semibold w-8">#</th>
                      <th class="px-4 py-2 text-left font-semibold">Risk</th>
                      <th class="px-4 py-2 text-right font-semibold">Before</th>
                      <th class="px-4 py-2 text-right font-semibold">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, idx) in top10BudgetImpact" :key="r.id" class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td class="px-4 py-2 text-xs font-bold text-gray-400">{{ idx + 1 }}</td>
                      <td class="px-4 py-2 font-medium text-gray-800 max-w-xs">
                        <div class="truncate cursor-default" :title="r.description || r.title">{{ r.title }}</div>
                      </td>
                      <td class="px-4 py-2 text-right text-xs font-semibold text-orange-600">{{ fmtEur(riskBudgetBefore(r)) }}</td>
                      <td class="px-4 py-2 text-right text-xs font-semibold text-green-600">{{ fmtEur(riskBudgetAfter(r)) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Top 10 Schedule Impact -->
              <div class="card p-0 overflow-hidden">
                <div class="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
                  <svg class="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  <span class="text-sm font-semibold text-blue-700">Top 10 Open Risks — Schedule Impact</span>
                </div>
                <div v-if="top10ScheduleImpact.length === 0" class="px-4 py-6 text-center text-gray-400 text-sm">No open risks with schedule impact</div>
                <table v-else class="w-full text-sm">
                  <thead>
                    <tr class="text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th class="px-4 py-2 text-left font-semibold w-8">#</th>
                      <th class="px-4 py-2 text-left font-semibold">Risk</th>
                      <th class="px-4 py-2 text-right font-semibold">Before</th>
                      <th class="px-4 py-2 text-right font-semibold">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, idx) in top10ScheduleImpact" :key="r.id" class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td class="px-4 py-2 text-xs font-bold text-gray-400">{{ idx + 1 }}</td>
                      <td class="px-4 py-2 font-medium text-gray-800 max-w-xs">
                        <div class="truncate cursor-default" :title="r.description || r.title">{{ r.title }}</div>
                      </td>
                      <td class="px-4 py-2 text-right text-xs font-semibold text-orange-600">{{ riskScheduleBefore(r).toFixed(1) }} mo</td>
                      <td class="px-4 py-2 text-right text-xs font-semibold text-green-600">{{ riskScheduleAfter(r).toFixed(1) }} mo</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Open Risks Analysis -->
          <div class="mb-6">
            <h3 class="text-base font-semibold text-gray-800 mb-3">Open Risks Analysis</h3>
            <div class="grid grid-cols-3 gap-4">
              <!-- Before Mitigation matrix -->
              <div class="card">
                <p class="text-xs font-semibold text-gray-500 uppercase mb-3">Before Mitigation</p>
                <div class="overflow-auto">
                  <table class="text-xs border-collapse">
                    <thead>
                      <tr>
                        <th class="px-2 py-1 text-gray-400 font-semibold text-right">P↓ / I→</th>
                        <th v-for="i in 5" :key="i" class="px-2 py-1 text-gray-400 font-semibold text-center">{{ i }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="p in 5" :key="p">
                        <td class="px-2 py-1 text-gray-400 font-semibold text-right">{{ p }}</td>
                        <td v-for="i in 5" :key="i" class="px-0.5 py-0.5">
                          <div class="w-10 h-8 rounded flex items-center justify-center font-bold"
                            :style="matrixCellStyle(p, i)">
                            {{ risksInCell(dashOpenRisks, p, i, 'before') || '' }}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <!-- After Mitigation matrix -->
              <div class="card">
                <p class="text-xs font-semibold text-gray-500 uppercase mb-3">After Mitigation</p>
                <div class="overflow-auto">
                  <table class="text-xs border-collapse">
                    <thead>
                      <tr>
                        <th class="px-2 py-1 text-gray-400 font-semibold text-right">P↓ / I→</th>
                        <th v-for="i in 5" :key="i" class="px-2 py-1 text-gray-400 font-semibold text-center">{{ i }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="p in 5" :key="p">
                        <td class="px-2 py-1 text-gray-400 font-semibold text-right">{{ p }}</td>
                        <td v-for="i in 5" :key="i" class="px-0.5 py-0.5">
                          <div class="w-10 h-8 rounded flex items-center justify-center font-bold"
                            :style="matrixCellStyle(p, i)">
                            {{ risksInCell(dashOpenRisks, p, i, 'after') || '' }}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <!-- Level chart -->
              <div class="card">
                <p class="text-xs font-semibold text-gray-500 uppercase mb-3">Risk Level Distribution</p>
                <canvas ref="openLevelChart" height="160"></canvas>
              </div>
            </div>
          </div>

          <!-- All Risks Analysis -->
          <div class="mb-6">
            <h3 class="text-base font-semibold text-gray-800 mb-3">All Risks Analysis</h3>
            <div class="grid grid-cols-3 gap-4">
              <!-- Before Mitigation matrix -->
              <div class="card">
                <p class="text-xs font-semibold text-gray-500 uppercase mb-3">Before Mitigation</p>
                <div class="overflow-auto">
                  <table class="text-xs border-collapse">
                    <thead>
                      <tr>
                        <th class="px-2 py-1 text-gray-400 font-semibold text-right">P↓ / I→</th>
                        <th v-for="i in 5" :key="i" class="px-2 py-1 text-gray-400 font-semibold text-center">{{ i }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="p in 5" :key="p">
                        <td class="px-2 py-1 text-gray-400 font-semibold text-right">{{ p }}</td>
                        <td v-for="i in 5" :key="i" class="px-0.5 py-0.5">
                          <div class="w-10 h-8 rounded flex items-center justify-center font-bold"
                            :style="matrixCellStyle(p, i)">
                            {{ risksInCell(dashFilteredRisks, p, i, 'before') || '' }}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <!-- After Mitigation matrix -->
              <div class="card">
                <p class="text-xs font-semibold text-gray-500 uppercase mb-3">After Mitigation</p>
                <div class="overflow-auto">
                  <table class="text-xs border-collapse">
                    <thead>
                      <tr>
                        <th class="px-2 py-1 text-gray-400 font-semibold text-right">P↓ / I→</th>
                        <th v-for="i in 5" :key="i" class="px-2 py-1 text-gray-400 font-semibold text-center">{{ i }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="p in 5" :key="p">
                        <td class="px-2 py-1 text-gray-400 font-semibold text-right">{{ p }}</td>
                        <td v-for="i in 5" :key="i" class="px-0.5 py-0.5">
                          <div class="w-10 h-8 rounded flex items-center justify-center font-bold"
                            :style="matrixCellStyle(p, i)">
                            {{ risksInCell(dashFilteredRisks, p, i, 'after') || '' }}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <!-- Level chart -->
              <div class="card">
                <p class="text-xs font-semibold text-gray-500 uppercase mb-3">Risk Level Distribution</p>
                <canvas ref="allLevelChart" height="160"></canvas>
              </div>
            </div>
          </div>

          <!-- Action Status by Owner -->
          <div class="card mb-6">
            <p class="text-sm font-semibold text-gray-700 mb-3">Action Status by Owner</p>
            <div v-if="Object.keys(actionStatusByOwner).length === 0" class="text-gray-400 text-sm py-4 text-center">
              No risks with owners assigned
            </div>
            <div v-else :style="{ height: Math.max(80, Object.keys(actionStatusByOwner).length * 40 + 30) + 'px', position: 'relative' }">
              <canvas ref="ownerChart"></canvas>
            </div>
          </div>

          <!-- Exposure Trend Line -->
          <div class="card mb-6">
            <p class="text-sm font-semibold text-gray-700 mb-3">Exposure Trend Over Time</p>
            <div style="height:280px;position:relative">
              <canvas ref="exposureTrendChart"></canvas>
            </div>
            <p class="text-xs text-gray-400 mt-2">Open risks contribute their "before mitigation" exposure from date opened. Closed risks switch to "after mitigation" exposure from date closed onward.</p>
          </div>

        </div><!-- /dashboard -->

      </div><!-- /content-area -->

      <!-- ══ CATEGORY MODAL ══ -->
      <div v-if="showCatModal" class="modal-overlay" @click.self="showCatModal=false">
        <div class="modal-box" style="max-width:400px">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ editingCat ? 'Edit Category' : 'New Category' }}</h3>
            <button @click="showCatModal=false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <label class="form-label">Name *</label>
            <input v-model="catForm.name" type="text" class="input-field" placeholder="Category name"/>
            <p v-if="catError" class="text-red-500 text-sm mt-2">{{ catError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showCatModal=false" class="btn-secondary">Cancel</button>
            <button @click="saveCat" :disabled="savingCat" class="btn-primary">
              {{ savingCat ? 'Saving...' : (editingCat ? 'Save' : 'Add') }}
            </button>
          </div>
        </div>
      </div>

      <!-- ══ PHASE MODAL ══ -->
      <div v-if="showPhaseModal" class="modal-overlay" @click.self="showPhaseModal=false">
        <div class="modal-box" style="max-width:400px">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ editingPhase ? 'Edit Phase' : 'New Phase' }}</h3>
            <button @click="showPhaseModal=false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <label class="form-label">Name *</label>
            <input v-model="phaseForm.name" type="text" class="input-field" placeholder="Phase name"/>
            <p v-if="phaseError" class="text-red-500 text-sm mt-2">{{ phaseError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showPhaseModal=false" class="btn-secondary">Cancel</button>
            <button @click="savePhase" :disabled="savingPhase" class="btn-primary">
              {{ savingPhase ? 'Saving...' : (editingPhase ? 'Save' : 'Add') }}
            </button>
          </div>
        </div>
      </div>

      <!-- ══ RISK EDIT MODAL ══ -->
      <div v-if="showRiskModal" class="modal-overlay" @click.self="showRiskModal=false">
        <div class="modal-box" style="max-width:800px">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ editingRisk ? 'Edit Risk' : 'New Risk' }}</h3>
            <button @click="showRiskModal=false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body space-y-4">
            <!-- Basic Info -->
            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2">
                <label class="form-label">Title *</label>
                <input v-model="riskForm.title" type="text" class="input-field" placeholder="Risk title"/>
              </div>
              <div class="col-span-2">
                <label class="form-label">Description *</label>
                <textarea v-model="riskForm.description" class="input-field" rows="2" placeholder="Describe the risk..."></textarea>
              </div>
              <div>
                <label class="form-label">Category *</label>
                <select v-model="riskForm.category_id" class="input-field">
                  <option :value="null">— Select —</option>
                  <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
              <div>
                <label class="form-label">Phase *</label>
                <select v-model="riskForm.phase_id" class="input-field">
                  <option :value="null">— Select —</option>
                  <option v-for="p in phases" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
              <div>
                <label class="form-label">Status</label>
                <select v-model="riskForm.status" class="input-field">
                  <option value="OPEN">Open</option>
                  <option value="MONITORING">Monitoring</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
              <div>
                <label class="form-label">Risk Owner</label>
                <select v-model="riskForm.owner_id" class="input-field">
                  <option :value="null">— None —</option>
                  <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
              <div>
                <label class="form-label">Date Opened</label>
                <input v-model="riskForm.date_opened" type="date" class="input-field"/>
              </div>
              <div>
                <label class="form-label">Date Closed</label>
                <input v-model="riskForm.date_closed" type="date" class="input-field"/>
              </div>
            </div>

            <hr class="border-gray-200"/>

            <!-- Before Mitigation -->
            <div>
              <h4 class="text-sm font-semibold text-gray-700 mb-2">Risk Before Mitigation</h4>
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="form-label">Probability Score</label>
                  <select v-model="riskForm.prob_score_before" class="input-field">
                    <option :value="null">—</option>
                    <option v-for="s in scoreSetup" :key="s.score" :value="s.score">{{ scoreLabel(s, 'probability') }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">CAPEX Impact Score</label>
                  <select v-model="riskForm.capex_score_before" class="input-field">
                    <option :value="null">—</option>
                    <option v-for="s in scoreSetup" :key="s.score" :value="s.score">{{ scoreLabel(s, 'capex') }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Schedule Impact Score</label>
                  <select v-model="riskForm.schedule_score_before" class="input-field">
                    <option :value="null">—</option>
                    <option v-for="s in scoreSetup" :key="s.score" :value="s.score">{{ scoreLabel(s, 'schedule') }}</option>
                  </select>
                </div>
              </div>
              <div v-if="riskForm.prob_score_before && (riskForm.capex_score_before || riskForm.schedule_score_before)" class="mt-2 text-xs bg-gray-50 rounded p-2 flex items-center gap-3">
                <span class="text-gray-500">Risk Score:</span>
                <span :class="['px-2 py-1 rounded font-bold text-sm', riskLevelClass(riskForm.prob_score_before, Math.max(riskForm.capex_score_before||0, riskForm.schedule_score_before||0))]">
                  {{ riskForm.prob_score_before * Math.max(riskForm.capex_score_before||0, riskForm.schedule_score_before||0) }}
                </span>
                <span class="text-gray-400">{{ matrixCell(riskForm.prob_score_before, Math.max(riskForm.capex_score_before||0, riskForm.schedule_score_before||0)) }}</span>
              </div>
            </div>

            <!-- Mitigation -->
            <div>
              <h4 class="text-sm font-semibold text-gray-700 mb-2">Mitigation</h4>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="form-label">Mitigation Type</label>
                  <select v-model="riskForm.mitigation_type" class="input-field">
                    <option :value="null">— None —</option>
                    <option value="AVOID">Avoid</option>
                    <option value="REDUCE">Reduce</option>
                    <option value="TRANSFER">Transfer</option>
                    <option value="ACCEPT">Accept</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Action Status</label>
                  <select v-model="riskForm.action_status" class="input-field">
                    <option value="NOT_STARTED">Not Started</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="CLOSED">Closed</option>
                    <option value="ON_HOLD">On Hold</option>
                  </select>
                </div>
                <div class="col-span-2">
                  <label class="form-label">Mitigation Action / Description</label>
                  <textarea v-model="riskForm.mitigation_action" class="input-field" rows="2" placeholder="Describe the mitigation action..."></textarea>
                </div>
                <div>
                  <label class="form-label">Action Due Date</label>
                  <input v-model="riskForm.action_due_date" type="date" class="input-field"/>
                </div>
              </div>
            </div>

            <!-- After Mitigation -->
            <div>
              <h4 class="text-sm font-semibold text-gray-700 mb-2">Risk After Mitigation</h4>
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="form-label">Probability Score</label>
                  <select v-model="riskForm.prob_score_after" class="input-field">
                    <option :value="null">—</option>
                    <option v-for="s in scoreSetup" :key="s.score" :value="s.score">{{ scoreLabel(s, 'probability') }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">CAPEX Impact Score</label>
                  <select v-model="riskForm.capex_score_after" class="input-field">
                    <option :value="null">—</option>
                    <option v-for="s in scoreSetup" :key="s.score" :value="s.score">{{ scoreLabel(s, 'capex') }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Schedule Impact Score</label>
                  <select v-model="riskForm.schedule_score_after" class="input-field">
                    <option :value="null">—</option>
                    <option v-for="s in scoreSetup" :key="s.score" :value="s.score">{{ scoreLabel(s, 'schedule') }}</option>
                  </select>
                </div>
              </div>
              <div v-if="riskForm.prob_score_after && (riskForm.capex_score_after || riskForm.schedule_score_after)" class="mt-2 text-xs bg-gray-50 rounded p-2 flex items-center gap-3">
                <span class="text-gray-500">Risk Score:</span>
                <span :class="['px-2 py-1 rounded font-bold text-sm', riskLevelClass(riskForm.prob_score_after, Math.max(riskForm.capex_score_after||0, riskForm.schedule_score_after||0))]">
                  {{ riskForm.prob_score_after * Math.max(riskForm.capex_score_after||0, riskForm.schedule_score_after||0) }}
                </span>
                <span class="text-gray-400">{{ matrixCell(riskForm.prob_score_after, Math.max(riskForm.capex_score_after||0, riskForm.schedule_score_after||0)) }}</span>
              </div>
            </div>

            <!-- Sensitivity Analysis -->
            <div>
              <h4 class="text-sm font-semibold text-gray-700 mb-2">Sensitivity Analysis</h4>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="form-label">CAPEX at Risk (EUR)</label>
                  <input v-model.number="riskForm.capex_value" type="number" min="0" class="input-field" placeholder="0"/>
                </div>
                <div>
                  <label class="form-label">Schedule at Risk (months)</label>
                  <input v-model.number="riskForm.schedule_value" type="number" min="0" step="0.5" class="input-field" placeholder="0"/>
                </div>
              </div>
              <div v-if="riskForm.capex_value || riskForm.schedule_value" class="mt-2 text-xs text-gray-500 bg-gray-50 rounded p-2 space-y-1">
                <div v-if="riskForm.prob_score_before && riskForm.capex_value">
                  <span class="font-medium">Before mitigation:</span>
                  CAPEX: <strong>{{ fmtEur(calcCapexImpact) }}</strong>
                  <span v-if="riskForm.schedule_value"> | Schedule: <strong>{{ calcScheduleImpact.toFixed(1) }} months</strong></span>
                </div>
                <div v-if="riskForm.prob_score_after && riskForm.capex_value">
                  <span class="font-medium">After mitigation:</span>
                  CAPEX: <strong>{{ fmtEur(calcCapexImpactAfter) }}</strong>
                  <span v-if="riskForm.schedule_value"> | Schedule: <strong>{{ calcScheduleImpactAfter.toFixed(1) }} months</strong></span>
                </div>
              </div>
              <div class="mt-3">
                <label class="form-label">Secondary Effects</label>
                <textarea v-model="riskForm.secondary_effects" class="input-field" rows="2" placeholder="Any secondary effects or notes..."></textarea>
              </div>
            </div>

            <p v-if="riskError" class="text-red-500 text-sm">{{ riskError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showRiskModal=false" class="btn-secondary">Cancel</button>
            <button @click="saveRisk" :disabled="savingRisk" class="btn-primary">
              {{ savingRisk ? 'Saving...' : (editingRisk ? 'Save Changes' : 'Add Risk') }}
            </button>
          </div>
        </div>
      </div>

      <!-- ══ RISK IMPORT MODAL ══ -->
      <div v-if="showRiskImportModal" class="modal-overlay" @click.self="showRiskImportModal = false">
        <div class="modal-box" style="max-width:820px">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">Import Risks from Excel</h3>
            <button @click="showRiskImportModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body space-y-4">
            <div v-if="riskImportResult" class="rounded-lg p-4 bg-green-50 border border-green-200 text-sm text-green-800 space-y-1">
              <p class="font-semibold">Import completed successfully.</p>
              <p>Created: <strong>{{ riskImportResult.created }}</strong> &nbsp; Updated: <strong>{{ riskImportResult.updated }}</strong> &nbsp; Skipped: <strong>{{ riskImportResult.skipped }}</strong></p>
            </div>
            <div v-if="!riskImportPreview && !riskImportResult" class="space-y-3">
              <p class="text-sm text-gray-600">Upload an Excel file (.xlsx) to import risks. Download the template first to see the expected format and lookup values.</p>
              <div class="flex items-center gap-3 flex-wrap">
                <button @click="exportRisksXlsx" class="btn-secondary text-sm flex items-center gap-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 8l-3-3m3 3l3-3"/></svg>
                  Export / Download Template
                </button>
                <label class="btn-secondary text-sm cursor-pointer flex items-center gap-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                  Choose File
                  <input type="file" accept=".xlsx" class="hidden" @change="onRiskImportFileChange" />
                </label>
                <span v-if="riskImportFile" class="text-sm text-gray-600">{{ riskImportFile.name }}</span>
              </div>
              <p v-if="riskImportError" class="text-red-500 text-sm">{{ riskImportError }}</p>
              <p class="text-xs text-gray-400">Unique key: <strong>ID</strong> column. Leave blank to create new risks; fill in an existing ID to update. The Lookups sheet contains valid categories, phases, owners, and allowed values.</p>
            </div>
            <div v-if="riskImportPreview && !riskImportResult" class="space-y-3">
              <div class="flex items-center gap-4 text-sm flex-wrap">
                <span class="px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium">{{ riskImportPreview.summary.creates }} to create</span>
                <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">{{ riskImportPreview.summary.updates }} to update</span>
                <span v-if="riskImportPreview.summary.errors > 0" class="px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium">{{ riskImportPreview.summary.errors }} error(s)</span>
              </div>
              <p v-if="riskImportError" class="text-red-500 text-sm">{{ riskImportError }}</p>
              <div class="overflow-x-auto max-h-96 border rounded">
                <table class="w-full text-xs">
                  <thead class="bg-gray-100 sticky top-0">
                    <tr>
                      <th class="px-2 py-1 text-left">Row</th>
                      <th class="px-2 py-1 text-left">Action</th>
                      <th class="px-2 py-1 text-left">ID</th>
                      <th class="px-2 py-1 text-left">Title</th>
                      <th class="px-2 py-1 text-left">Category</th>
                      <th class="px-2 py-1 text-left">Phase</th>
                      <th class="px-2 py-1 text-left">Status</th>
                      <th class="px-2 py-1 text-left">Errors / Warnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in riskImportPreview.rows" :key="r.row_num"
                      :class="r.errors.length ? 'bg-red-50' : r.warnings.length ? 'bg-yellow-50' : ''">
                      <td class="px-2 py-1 text-gray-500">{{ r.row_num }}</td>
                      <td class="px-2 py-1"><span :class="r.action==='CREATE' ? 'text-green-700 font-semibold' : 'text-blue-700 font-semibold'">{{ r.action }}</span></td>
                      <td class="px-2 py-1 text-gray-500">{{ r.id || '—' }}</td>
                      <td class="px-2 py-1 max-w-xs truncate" :title="r.title">{{ r.title }}</td>
                      <td class="px-2 py-1">{{ r.category_name || '—' }}</td>
                      <td class="px-2 py-1">{{ r.phase_name || '—' }}</td>
                      <td class="px-2 py-1">{{ r.status }}</td>
                      <td class="px-2 py-1">
                        <span v-for="e in r.errors" :key="e" class="block text-red-600">{{ e }}</span>
                        <span v-for="w in r.warnings" :key="w" class="block text-yellow-700">{{ w }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button v-if="!riskImportResult" @click="resetRiskImport" class="btn-secondary">{{ riskImportPreview ? 'Back' : 'Cancel' }}</button>
            <button v-if="riskImportResult" @click="showRiskImportModal = false; load()" class="btn-primary">Close &amp; Refresh</button>
            <button v-if="!riskImportPreview && !riskImportResult && riskImportFile" @click="runRiskImportPreview"
              :disabled="riskImportLoading" class="btn-primary">
              {{ riskImportLoading ? 'Analysing...' : 'Preview Import' }}
            </button>
            <button v-if="riskImportPreview && !riskImportResult && riskImportPreview.summary.errors === 0"
              @click="applyRiskImport" :disabled="riskImportApplying" class="btn-primary">
              {{ riskImportApplying ? 'Applying...' : 'Confirm &amp; Apply' }}
            </button>
          </div>
        </div>
      </div>

      <!-- ══ RISK DETAIL PANEL ══ -->
      <div v-if="detailRisk" class="modal-overlay" @click.self="detailRisk=null">
        <div class="modal-box" style="max-width:700px;max-height:90vh;overflow-y:auto">
          <div class="modal-header">
            <div>
              <span class="text-xs font-mono text-gray-400">RI-{{ String(detailRisk.seq_id || detailRisk.id).padStart(6,'0') }}</span>
              <h3 class="text-lg font-semibold text-gray-800">{{ detailRisk.title }}</h3>
            </div>
            <button @click="detailRisk=null" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body space-y-4 text-sm">
            <!-- Info grid -->
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div><span class="text-gray-500">Status:</span> <span :class="['ml-1 px-2 py-0.5 rounded-full text-xs font-medium', statusBadgeClass(detailRisk.status)]">{{ detailRisk.status }}</span></div>
              <div><span class="text-gray-500">Category:</span> <span class="ml-1 font-medium">{{ detailRisk.category_name || '—' }}</span></div>
              <div><span class="text-gray-500">Phase:</span> <span class="ml-1 font-medium">{{ detailRisk.phase_name || '—' }}</span></div>
              <div><span class="text-gray-500">Owner:</span> <span class="ml-1 font-medium">{{ detailRisk.owner_name || '—' }}</span></div>
              <div><span class="text-gray-500">Date Opened:</span> <span class="ml-1">{{ detailRisk.date_opened || '—' }}</span></div>
              <div><span class="text-gray-500">Date Closed:</span> <span class="ml-1">{{ detailRisk.date_closed || '—' }}</span></div>
            </div>
            <div v-if="detailRisk.description">
              <p class="text-gray-500 text-xs uppercase font-semibold mb-1">Description</p>
              <p class="text-gray-700">{{ detailRisk.description }}</p>
            </div>

            <!-- Scores -->
            <div class="bg-gray-50 rounded-lg p-3">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Before Mitigation</p>
                  <div class="space-y-1 text-xs">
                    <div>Probability: <strong>{{ detailRisk.prob_score_before || '—' }}</strong></div>
                    <div>CAPEX Impact: <strong>{{ detailRisk.capex_score_before || '—' }}</strong></div>
                    <div>Schedule Impact: <strong>{{ detailRisk.schedule_score_before || '—' }}</strong></div>
                    <div v-if="detailRisk.prob_score_before" class="mt-1 flex items-center gap-2">
                      Risk Score:
                      <span :class="['px-2 py-0.5 rounded font-bold', riskLevelClass(detailRisk.prob_score_before, Math.max(detailRisk.capex_score_before||0, detailRisk.schedule_score_before||0))]">
                        {{ detailRisk.prob_score_before * Math.max(detailRisk.capex_score_before||0, detailRisk.schedule_score_before||0) }}
                      </span>
                      <span class="text-gray-500">{{ matrixCell(detailRisk.prob_score_before, Math.max(detailRisk.capex_score_before||0, detailRisk.schedule_score_before||0)) }}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <p class="text-xs font-semibold text-gray-500 uppercase mb-2">After Mitigation</p>
                  <div class="space-y-1 text-xs">
                    <div>Probability: <strong>{{ detailRisk.prob_score_after || '—' }}</strong></div>
                    <div>CAPEX Impact: <strong>{{ detailRisk.capex_score_after || '—' }}</strong></div>
                    <div>Schedule Impact: <strong>{{ detailRisk.schedule_score_after || '—' }}</strong></div>
                    <div v-if="detailRisk.prob_score_after" class="mt-1 flex items-center gap-2">
                      Risk Score:
                      <span :class="['px-2 py-0.5 rounded font-bold', riskLevelClass(detailRisk.prob_score_after, Math.max(detailRisk.capex_score_after||0, detailRisk.schedule_score_after||0))]">
                        {{ detailRisk.prob_score_after * Math.max(detailRisk.capex_score_after||0, detailRisk.schedule_score_after||0) }}
                      </span>
                      <span class="text-gray-500">{{ matrixCell(detailRisk.prob_score_after, Math.max(detailRisk.capex_score_after||0, detailRisk.schedule_score_after||0)) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Mitigation -->
            <div v-if="detailRisk.mitigation_type || detailRisk.mitigation_action">
              <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Mitigation</p>
              <div class="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-2">
                <div v-if="detailRisk.mitigation_type">Type: <strong>{{ detailRisk.mitigation_type }}</strong></div>
                <div v-if="detailRisk.action_due_date">Due: <strong>{{ detailRisk.action_due_date }}</strong></div>
                <div>Action Status: <span :class="['px-1.5 py-0.5 rounded font-medium', actionStatusClass(detailRisk.action_status)]">{{ formatActionStatus(detailRisk.action_status) }}</span></div>
              </div>
              <p v-if="detailRisk.mitigation_action" class="text-gray-700">{{ detailRisk.mitigation_action }}</p>
            </div>

            <!-- Sensitivity Analysis -->
            <div v-if="detailRisk.capex_value || detailRisk.schedule_value || detailRisk.secondary_effects" class="bg-gray-50 rounded-lg p-3">
              <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Sensitivity Analysis</p>
              <div v-if="detailRisk.capex_value || detailRisk.schedule_value" class="grid grid-cols-2 gap-2 text-xs mb-2">
                <div v-if="detailRisk.capex_value">CAPEX at Risk: <strong>{{ fmtEur(detailRisk.capex_value) }}</strong></div>
                <div v-if="detailRisk.schedule_value">Schedule at Risk: <strong>{{ detailRisk.schedule_value }} months</strong></div>
              </div>
              <div v-if="detailRisk.capex_value" class="space-y-1 text-xs text-gray-600 mb-2">
                <div v-if="detailRisk.prob_score_before">
                  <span class="font-medium text-gray-700">Before mitigation:</span>
                  CAPEX: <strong>{{ fmtEur(calcImpact(detailRisk.prob_score_before, detailRisk.capex_value, 'capex')) }}</strong>
                  <span v-if="detailRisk.schedule_value"> | Schedule: <strong>{{ calcImpact(detailRisk.prob_score_before, detailRisk.schedule_value, 'schedule').toFixed(1) }} months</strong></span>
                </div>
                <div v-if="detailRisk.prob_score_after">
                  <span class="font-medium text-gray-700">After mitigation:</span>
                  CAPEX: <strong>{{ fmtEur(calcImpact(detailRisk.prob_score_after, detailRisk.capex_value, 'capex')) }}</strong>
                  <span v-if="detailRisk.schedule_value"> | Schedule: <strong>{{ calcImpact(detailRisk.prob_score_after, detailRisk.schedule_value, 'schedule').toFixed(1) }} months</strong></span>
                </div>
              </div>
              <div v-if="detailRisk.secondary_effects" class="border-t border-gray-200 pt-2 mt-2">
                <p class="text-xs font-semibold text-gray-500 uppercase mb-1">Secondary Effects</p>
                <p class="text-gray-700 text-sm">{{ detailRisk.secondary_effects }}</p>
              </div>
            </div>

            <!-- Notes -->
            <div>
              <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Notes / Updates</p>
              <div class="space-y-2 mb-3">
                <div v-if="(detailRisk.notes||[]).length===0" class="text-gray-400 text-xs">No notes yet</div>
                <div v-for="n in detailRisk.notes" :key="n.id" class="bg-blue-50 rounded p-3 text-sm">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <p class="text-gray-800">{{ n.content }}</p>
                      <p class="text-xs text-gray-400 mt-1">{{ n.author_name || 'Unknown' }} · {{ fmtDate(n.created_at) }}</p>
                    </div>
                    <button v-if="canDeleteNote(n)" @click="deleteNote(n)" class="btn-icon text-gray-300 hover:text-red-400 ml-2 shrink-0">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <div class="flex gap-2">
                <input v-model="newNote" type="text" class="input-field flex-1" placeholder="Add a note..." @keyup.enter="addNote"/>
                <button @click="addNote" :disabled="!newNote.trim()" class="btn-primary">Add</button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="detailRisk=null" class="btn-secondary">Close</button>
            <button v-if="!isVendor" @click="openRiskModal(detailRisk); detailRisk=null" class="btn-primary">Edit Risk</button>
          </div>
        </div>
      </div>

    </div>
  `,

  data() {
    return {
      tab: 'register',
      exporting: false,
      // Setup
      scoreSetup: [],
      editingScores: false,
      scoreEdits: {},
      savingScores: false,
      matrixCells: [],
      editingMatrix: false,
      categories: [],
      phases: [],
      // Category modal
      showCatModal: false,
      editingCat: null,
      catForm: { name: '' },
      catError: '',
      savingCat: false,
      // Phase modal
      showPhaseModal: false,
      editingPhase: null,
      phaseForm: { name: '' },
      phaseError: '',
      savingPhase: false,
      // Risk list
      risks: [],
      rSearch: '',
      rStatusFilter: '',
      rCatFilter: '',
      rPhaseFilter: '',
      rSortField: null,
      rSortAsc: true,
      // Risk modal
      showRiskModal: false,
      editingRisk: null,
      riskForm: {
        title: '', description: '', status: 'OPEN',
        category_id: null, phase_id: null,
        date_opened: '', date_closed: '',
        owner_id: null,
        prob_score_before: null, capex_score_before: null, schedule_score_before: null,
        capex_value: null, schedule_value: null,
        mitigation_type: null, mitigation_action: '', action_due_date: '', action_status: 'NOT_STARTED',
        prob_score_after: null, capex_score_after: null, schedule_score_after: null,
        secondary_effects: '',
      },
      riskError: '',
      savingRisk: false,
      // Detail panel
      detailRisk: null,
      newNote: '',
      // Import
      showRiskImportModal: false,
      riskImportFile: null,
      riskImportPreview: null,
      riskImportLoading: false,
      riskImportApplying: false,
      riskImportError: '',
      riskImportResult: null,
      // Dashboard filters
      dashCatFilter: '',
      dashPhaseFilter: '',
      // Charts
      openLevelChartObj: null,
      allLevelChartObj: null,
      ownerChartObj: null,
      exposureTrendChartObj: null,
    };
  },

  computed: {
    isVendor() { return this.currentUser && this.currentUser.role === 'VENDOR'; },
    canViewSetup() { return !this.isVendor; },
    isRiskLead() {
      return !!(this.currentUser && (this.currentUser.lead_modules || []).includes('Risk Register'));
    },
    canEditSetup() {
      if (!this.currentUser) return false;
      return ['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role) || this.isRiskLead;
    },
    canDeleteRisk() {
      if (!this.currentUser) return false;
      return ['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role) || this.isRiskLead;
    },
    filteredRisks() {
      let list = this.risks;
      if (this.rStatusFilter) list = list.filter(r => r.status === this.rStatusFilter);
      if (this.rCatFilter) list = list.filter(r => r.category_id === this.rCatFilter);
      if (this.rPhaseFilter) list = list.filter(r => r.phase_id === this.rPhaseFilter);
      if (this.rSearch) {
        const s = this.rSearch.toLowerCase();
        list = list.filter(r =>
          [r.title, r.description, r.owner_name, r.category_name].some(v => v && v.toLowerCase().includes(s))
        );
      }
      if (this.rSortField) {
        const getVal = {
          budgetBefore: r => this.riskBudgetBefore(r),
          budgetAfter: r => this.riskBudgetAfter(r),
          scheduleBefore: r => this.riskScheduleBefore(r),
          scheduleAfter: r => this.riskScheduleAfter(r),
        }[this.rSortField];
        if (getVal) {
          list = [...list].sort((a, b) => this.rSortAsc ? getVal(a) - getVal(b) : getVal(b) - getVal(a));
        }
      }
      return list;
    },
    openRisks() {
      return this.risks.filter(r => r.status === 'OPEN' || r.status === 'MONITORING');
    },
    dashFilteredRisks() {
      let list = this.risks;
      if (this.dashCatFilter) list = list.filter(r => r.category_id === this.dashCatFilter);
      if (this.dashPhaseFilter) list = list.filter(r => r.phase_id === this.dashPhaseFilter);
      return list;
    },
    dashOpenRisks() {
      return this.dashFilteredRisks.filter(r => r.status === 'OPEN' || r.status === 'MONITORING');
    },
    top10OpenRisks() {
      return [...this.openRisks]
        .sort((a, b) => {
          const expA = (a.prob_score_before || 0) * Math.max(a.capex_score_before || 0, a.schedule_score_before || 0);
          const expB = (b.prob_score_before || 0) * Math.max(b.capex_score_before || 0, b.schedule_score_before || 0);
          return expB - expA;
        })
        .slice(0, 10);
    },
    top10BudgetImpact() {
      return [...this.dashOpenRisks]
        .filter(r => this.riskBudgetBefore(r) > 0)
        .sort((a, b) => this.riskBudgetBefore(b) - this.riskBudgetBefore(a))
        .slice(0, 10);
    },
    top10ScheduleImpact() {
      return [...this.dashOpenRisks]
        .filter(r => this.riskScheduleBefore(r) > 0)
        .sort((a, b) => this.riskScheduleBefore(b) - this.riskScheduleBefore(a))
        .slice(0, 10);
    },

    // ── KPI Exposures ──
    totalExposureBeforeOpen() {
      return this.dashOpenRisks.reduce((sum, r) => {
        if (!r.prob_score_before) return sum;
        return sum + r.prob_score_before * Math.max(r.capex_score_before || 0, r.schedule_score_before || 0);
      }, 0);
    },
    totalExposureAfterOpen() {
      return this.dashOpenRisks.reduce((sum, r) => {
        if (!r.prob_score_after) return sum;
        return sum + r.prob_score_after * Math.max(r.capex_score_after || 0, r.schedule_score_after || 0);
      }, 0);
    },
    totalExposureBeforeAll() {
      return this.dashFilteredRisks.reduce((sum, r) => {
        if (!r.prob_score_before) return sum;
        return sum + r.prob_score_before * Math.max(r.capex_score_before || 0, r.schedule_score_before || 0);
      }, 0);
    },
    totalExposureAfterAll() {
      return this.dashFilteredRisks.reduce((sum, r) => {
        if (!r.prob_score_after) return sum;
        return sum + r.prob_score_after * Math.max(r.capex_score_after || 0, r.schedule_score_after || 0);
      }, 0);
    },

    // ── Budget & Schedule at Risk ──
    budgetAtRiskBeforeOpen() {
      return this.dashOpenRisks.reduce((sum, r) => {
        if (!r.prob_score_before || !r.capex_value) return sum;
        const ps = this.scoreSetup.find(s => s.score === r.prob_score_before);
        const cs = this.scoreSetup.find(s => s.score === (r.capex_score_before || 1));
        if (!ps || !cs) return sum;
        return sum + r.capex_value * (ps.probability_pct / 100) * (cs.capex_impact_pct / 100);
      }, 0);
    },
    budgetAtRiskAfterOpen() {
      return this.dashOpenRisks.reduce((sum, r) => {
        if (!r.prob_score_after || !r.capex_value) return sum;
        const ps = this.scoreSetup.find(s => s.score === r.prob_score_after);
        const cs = this.scoreSetup.find(s => s.score === (r.capex_score_after || 1));
        if (!ps || !cs) return sum;
        return sum + r.capex_value * (ps.probability_pct / 100) * (cs.capex_impact_pct / 100);
      }, 0);
    },
    budgetAtRiskBeforeAll() {
      return this.dashFilteredRisks.reduce((sum, r) => {
        if (!r.prob_score_before || !r.capex_value) return sum;
        const ps = this.scoreSetup.find(s => s.score === r.prob_score_before);
        const cs = this.scoreSetup.find(s => s.score === (r.capex_score_before || 1));
        if (!ps || !cs) return sum;
        return sum + r.capex_value * (ps.probability_pct / 100) * (cs.capex_impact_pct / 100);
      }, 0);
    },
    budgetAtRiskAfterAll() {
      return this.dashFilteredRisks.reduce((sum, r) => {
        if (!r.prob_score_after || !r.capex_value) return sum;
        const ps = this.scoreSetup.find(s => s.score === r.prob_score_after);
        const cs = this.scoreSetup.find(s => s.score === (r.capex_score_after || 1));
        if (!ps || !cs) return sum;
        return sum + r.capex_value * (ps.probability_pct / 100) * (cs.capex_impact_pct / 100);
      }, 0);
    },
    scheduleAtRiskBeforeOpen() {
      return this.dashOpenRisks.reduce((sum, r) => {
        if (!r.prob_score_before || !r.schedule_value) return sum;
        const ps = this.scoreSetup.find(s => s.score === r.prob_score_before);
        const ss = this.scoreSetup.find(s => s.score === (r.schedule_score_before || 1));
        if (!ps || !ss) return sum;
        return sum + r.schedule_value * (ps.probability_pct / 100) * (ss.schedule_impact_pct / 100);
      }, 0);
    },
    scheduleAtRiskAfterOpen() {
      return this.dashOpenRisks.reduce((sum, r) => {
        if (!r.prob_score_after || !r.schedule_value) return sum;
        const ps = this.scoreSetup.find(s => s.score === r.prob_score_after);
        const ss = this.scoreSetup.find(s => s.score === (r.schedule_score_after || 1));
        if (!ps || !ss) return sum;
        return sum + r.schedule_value * (ps.probability_pct / 100) * (ss.schedule_impact_pct / 100);
      }, 0);
    },
    scheduleAtRiskBeforeAll() {
      return this.dashFilteredRisks.reduce((sum, r) => {
        if (!r.prob_score_before || !r.schedule_value) return sum;
        const ps = this.scoreSetup.find(s => s.score === r.prob_score_before);
        const ss = this.scoreSetup.find(s => s.score === (r.schedule_score_before || 1));
        if (!ps || !ss) return sum;
        return sum + r.schedule_value * (ps.probability_pct / 100) * (ss.schedule_impact_pct / 100);
      }, 0);
    },
    scheduleAtRiskAfterAll() {
      return this.dashFilteredRisks.reduce((sum, r) => {
        if (!r.prob_score_after || !r.schedule_value) return sum;
        const ps = this.scoreSetup.find(s => s.score === r.prob_score_after);
        const ss = this.scoreSetup.find(s => s.score === (r.schedule_score_after || 1));
        if (!ps || !ss) return sum;
        return sum + r.schedule_value * (ps.probability_pct / 100) * (ss.schedule_impact_pct / 100);
      }, 0);
    },

    // ── Action Status by Owner ──
    actionStatusByOwner() {
      const map = {};
      this.dashFilteredRisks.forEach(r => {
        if (!r.owner_name) return;
        if (!map[r.owner_name]) map[r.owner_name] = { NOT_STARTED: 0, IN_PROGRESS: 0, CLOSED: 0, ON_HOLD: 0 };
        map[r.owner_name][r.action_status || 'NOT_STARTED']++;
      });
      return map;
    },

    // ── Sensitivity in modal ──
    calcCapexImpact() {
      if (!this.riskForm.prob_score_before || !this.riskForm.capex_value) return 0;
      const setup = this.scoreSetup.find(s => s.score === this.riskForm.prob_score_before);
      const capexSetup = this.scoreSetup.find(s => s.score === (this.riskForm.capex_score_before || 1));
      if (!setup || !capexSetup) return 0;
      return this.riskForm.capex_value * (setup.probability_pct / 100) * (capexSetup.capex_impact_pct / 100);
    },
    calcScheduleImpact() {
      if (!this.riskForm.prob_score_before || !this.riskForm.schedule_value) return 0;
      const setup = this.scoreSetup.find(s => s.score === this.riskForm.prob_score_before);
      const schedSetup = this.scoreSetup.find(s => s.score === (this.riskForm.schedule_score_before || 1));
      if (!setup || !schedSetup) return 0;
      return this.riskForm.schedule_value * (setup.probability_pct / 100) * (schedSetup.schedule_impact_pct / 100);
    },
    calcCapexImpactAfter() {
      if (!this.riskForm.prob_score_after || !this.riskForm.capex_value) return 0;
      const setup = this.scoreSetup.find(s => s.score === this.riskForm.prob_score_after);
      const capexSetup = this.scoreSetup.find(s => s.score === (this.riskForm.capex_score_after || 1));
      if (!setup || !capexSetup) return 0;
      return this.riskForm.capex_value * (setup.probability_pct / 100) * (capexSetup.capex_impact_pct / 100);
    },
    calcScheduleImpactAfter() {
      if (!this.riskForm.prob_score_after || !this.riskForm.schedule_value) return 0;
      const setup = this.scoreSetup.find(s => s.score === this.riskForm.prob_score_after);
      const schedSetup = this.scoreSetup.find(s => s.score === (this.riskForm.schedule_score_after || 1));
      if (!setup || !schedSetup) return 0;
      return this.riskForm.schedule_value * (setup.probability_pct / 100) * (schedSetup.schedule_impact_pct / 100);
    },
  },

  watch: {
    tab(val) {
      if (val === 'dashboard') this.scheduleDashCharts();
      this.$emit('subtab-change', val);
    },
    risks() {
      if (this.tab === 'dashboard') this.scheduleDashCharts();
    },
    dashCatFilter() {
      if (this.tab === 'dashboard') this.scheduleDashCharts();
    },
    dashPhaseFilter() {
      if (this.tab === 'dashboard') this.scheduleDashCharts();
    },
    detailRisk(val) {
      this.$emit('record-change', val ? { type: 'risk', id: val.id } : null);
    },
  },

  async mounted() {
    if (this.initialTab) this.tab = this.initialTab;
    await this.load();
    this.checkPendingOpen();
  },

  // Destroy charts on unmount so they don't linger in Chart.js's global
  // registry with detached canvases and throw on later animation frames.
  beforeUnmount() {
    this._destroyAllDashCharts();
  },

  methods: {
    checkPendingOpen() {
      if (!this.pendingOpen || this.pendingOpen.record_type !== 'risk') return;
      const r = this.risks.find(x => x.id === this.pendingOpen.record_id);
      if (r) this.openRiskDetail(r);
    },
    async load() {
      const [setup, matrix, cats, phases, risks] = await Promise.all([
        API.getRiskScoreSetup(),
        API.getRiskMatrix(),
        API.getRiskCategories(),
        API.getRiskPhases(),
        API.getRisks(),
      ]);
      this.scoreSetup = setup;
      this.matrixCells = matrix;
      this.categories = cats;
      this.phases = phases;
      this.risks = risks;
    },

    // ── Score Setup ──
    startEditScores() {
      this.scoreEdits = {};
      this.scoreSetup.forEach(s => {
        this.scoreEdits[s.score] = {
          probability_pct: s.probability_pct,
          capex_impact_pct: s.capex_impact_pct,
          schedule_impact_pct: s.schedule_impact_pct,
        };
      });
      this.editingScores = true;
    },
    cancelEditScores() { this.editingScores = false; },
    async saveScores() {
      this.savingScores = true;
      try {
        for (const s of this.scoreSetup) {
          await API.updateRiskScore(s.score, this.scoreEdits[s.score]);
        }
        this.scoreSetup = await API.getRiskScoreSetup();
        this.editingScores = false;
      } catch (e) {
        alert(e.message);
      } finally {
        this.savingScores = false;
      }
    },

    // ── Matrix ──
    risksInCell(riskList, prob, impact, when) {
      return riskList.filter(r => {
        const p = when === 'before' ? r.prob_score_before : r.prob_score_after;
        const capex = when === 'before' ? r.capex_score_before : r.capex_score_after;
        const sched = when === 'before' ? r.schedule_score_before : r.schedule_score_after;
        if (!p) return false;
        return p === prob && Math.max(capex || 0, sched || 0) === impact;
      }).length;
    },
    matrixCell(prob, impact) {
      const cell = this.matrixCells.find(c => c.prob_score === prob && c.impact_score === impact);
      return cell ? cell.level : 'LOW';
    },
    matrixCellLabel(prob, impact) {
      const level = this.matrixCell(prob, impact);
      return level === 'MEDIUM' ? 'MED' : level;
    },
    matrixCellStyle(prob, impact) {
      const level = this.matrixCell(prob, impact);
      const colors = { LOW: '#16a34a', MEDIUM: '#d97706', HIGH: '#dc2626' };
      return `background:${colors[level] || '#999'};color:white;`;
    },
    async updateCell(prob, impact, level) {
      try {
        const updated = await API.updateMatrixCell(prob, impact, { level });
        const idx = this.matrixCells.findIndex(c => c.prob_score === prob && c.impact_score === impact);
        if (idx >= 0) this.matrixCells[idx] = updated;
      } catch (e) {
        alert(e.message);
      }
    },

    // ── Dashboard Matrix Counts ──
    matrixCountBeforeOpen(prob, impact) {
      return this.openRisks.filter(r =>
        r.prob_score_before === prob &&
        Math.max(r.capex_score_before || 0, r.schedule_score_before || 0) === impact
      ).length;
    },
    matrixCountAfterOpen(prob, impact) {
      return this.openRisks.filter(r =>
        r.prob_score_after === prob &&
        Math.max(r.capex_score_after || 0, r.schedule_score_after || 0) === impact
      ).length;
    },
    matrixCountBeforeAll(prob, impact) {
      return this.risks.filter(r =>
        r.prob_score_before === prob &&
        Math.max(r.capex_score_before || 0, r.schedule_score_before || 0) === impact
      ).length;
    },
    matrixCountAfterAll(prob, impact) {
      return this.risks.filter(r =>
        r.prob_score_after === prob &&
        Math.max(r.capex_score_after || 0, r.schedule_score_after || 0) === impact
      ).length;
    },

    // ── Level Counts for Charts ──
    levelCounts(riskList, when) {
      const counts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
      riskList.forEach(r => {
        const prob = when === 'before' ? r.prob_score_before : r.prob_score_after;
        const capex = when === 'before' ? r.capex_score_before : r.capex_score_after;
        const sched = when === 'before' ? r.schedule_score_before : r.schedule_score_after;
        if (!prob) return;
        const impact = Math.max(capex || 0, sched || 0);
        const level = this.matrixCell(prob, impact);
        counts[level]++;
      });
      return counts;
    },

    // Render after Vue patches the DOM. Same pattern as the procurement
    // dashboard, which renders reliably.
    scheduleDashCharts() {
      this.$nextTick(() => this.renderDashCharts());
    },

    // Chart.js crashes ("Cannot read properties of null (reading 'save')")
    // if .destroy() runs after Vue already unmounted the chart's canvas.
    // Swallow that — the instance is already effectively gone.
    _safeDestroyChart(chart) {
      if (!chart) return;
      try { chart.destroy(); } catch (e) { /* orphaned canvas */ }
    },

    _destroyAllDashCharts() {
      this._safeDestroyChart(this.openLevelChartObj);     this.openLevelChartObj = null;
      this._safeDestroyChart(this.allLevelChartObj);      this.allLevelChartObj = null;
      this._safeDestroyChart(this.ownerChartObj);         this.ownerChartObj = null;
      this._safeDestroyChart(this.exposureTrendChartObj); this.exposureTrendChartObj = null;
    },

    // ── Chart Rendering ──
    renderDashCharts() {
      // Open risks level chart
      this._safeDestroyChart(this.openLevelChartObj); this.openLevelChartObj = null;
      const openCtx = this.$refs.openLevelChart;
      if (openCtx) {
        const before = this.levelCounts(this.dashOpenRisks, 'before');
        const after = this.levelCounts(this.dashOpenRisks, 'after');
        this.openLevelChartObj = new Chart(openCtx, {
          type: 'bar',
          plugins: [ChartDataLabels],
          data: {
            labels: ['LOW', 'MEDIUM', 'HIGH'],
            datasets: [
              { label: 'Before Mitigation', data: [before.LOW, before.MEDIUM, before.HIGH], backgroundColor: ['rgba(22,163,74,0.75)', 'rgba(217,119,6,0.75)', 'rgba(220,38,38,0.75)'], borderRadius: 3 },
              { label: 'After Mitigation',  data: [after.LOW,  after.MEDIUM,  after.HIGH],  backgroundColor: ['rgba(22,163,74,0.3)',  'rgba(217,119,6,0.3)',  'rgba(220,38,38,0.3)'],  borderRadius: 3 },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: { position: 'top', labels: { font: { size: 10 }, boxWidth: 10 } },
              datalabels: { anchor: 'end', align: 'end', color: '#374151', font: { size: 10, weight: '700' }, formatter: v => v > 0 ? v : '' },
            },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            layout: { padding: { top: 10 } },
          },
        });
      }

      // All risks level chart
      this._safeDestroyChart(this.allLevelChartObj); this.allLevelChartObj = null;
      const allCtx = this.$refs.allLevelChart;
      if (allCtx) {
        const before = this.levelCounts(this.dashFilteredRisks, 'before');
        const after = this.levelCounts(this.dashFilteredRisks, 'after');
        this.allLevelChartObj = new Chart(allCtx, {
          type: 'bar',
          plugins: [ChartDataLabels],
          data: {
            labels: ['LOW', 'MEDIUM', 'HIGH'],
            datasets: [
              { label: 'Before Mitigation', data: [before.LOW, before.MEDIUM, before.HIGH], backgroundColor: ['rgba(22,163,74,0.75)', 'rgba(217,119,6,0.75)', 'rgba(220,38,38,0.75)'], borderRadius: 3 },
              { label: 'After Mitigation',  data: [after.LOW,  after.MEDIUM,  after.HIGH],  backgroundColor: ['rgba(22,163,74,0.3)',  'rgba(217,119,6,0.3)',  'rgba(220,38,38,0.3)'],  borderRadius: 3 },
            ],
          },
          options: {
            responsive: true,
            plugins: {
              legend: { position: 'top', labels: { font: { size: 10 }, boxWidth: 10 } },
              datalabels: { anchor: 'end', align: 'end', color: '#374151', font: { size: 10, weight: '700' }, formatter: v => v > 0 ? v : '' },
            },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            layout: { padding: { top: 10 } },
          },
        });
      }

      // Action status by owner (stacked bar)
      this._safeDestroyChart(this.ownerChartObj); this.ownerChartObj = null;
      const ownerCtx = this.$refs.ownerChart;
      if (ownerCtx) {
        const byOwner = this.actionStatusByOwner;
        const owners = Object.keys(byOwner);
        if (owners.length > 0) {
          const statusColors = {
            NOT_STARTED: 'rgba(156,163,175,0.85)',
            IN_PROGRESS:  'rgba(59,130,246,0.85)',
            CLOSED:       'rgba(22,163,74,0.85)',
            ON_HOLD:      'rgba(245,158,11,0.85)',
          };
          const statusLabels = { NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', CLOSED: 'Closed', ON_HOLD: 'On Hold' };
          this.ownerChartObj = new Chart(ownerCtx, {
            type: 'bar',
            plugins: [ChartDataLabels],
            data: {
              labels: owners,
              datasets: ['NOT_STARTED', 'IN_PROGRESS', 'CLOSED', 'ON_HOLD'].map(s => ({
                label: statusLabels[s],
                data: owners.map(o => byOwner[o][s] || 0),
                backgroundColor: statusColors[s],
                borderRadius: 3,
                barThickness: 20,
              })),
            },
            options: {
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'top' },
                datalabels: {
                  color: '#fff',
                  font: { size: 12, weight: '700' },
                  formatter: v => v > 0 ? v : '',
                },
              },
              scales: {
                x: { stacked: true, ticks: { stepSize: 1 } },
                y: { stacked: true, grid: { display: false }, ticks: { font: { size: 13, weight: '600' }, padding: 2 } },
              },
            },
          });
        }
      }

      // ── Exposure Trend Line ──
      this._safeDestroyChart(this.exposureTrendChartObj); this.exposureTrendChartObj = null;
      const trendCtx = this.$refs.exposureTrendChart;
      if (trendCtx) {
        const risks = this.dashFilteredRisks;
        if (risks.length > 0) {
          // Collect all event dates
          const today = new Date().toISOString().split('T')[0];
          const dateSet = new Set();
          let earliest = today;
          risks.forEach(r => {
            if (r.date_opened) {
              dateSet.add(r.date_opened);
              if (r.date_opened < earliest) earliest = r.date_opened;
            }
            if (r.date_closed) dateSet.add(r.date_closed);
          });
          dateSet.add(today);

          // Build monthly date points from earliest to today
          const points = [];
          const [ey, em] = earliest.split('-').map(Number);
          const [ty, tm] = today.split('-').map(Number);
          let cy = ey, cm = em;
          while (cy < ty || (cy === ty && cm <= tm)) {
            const d = `${cy}-${String(cm).padStart(2,'0')}-01`;
            points.push(d);
            cm++;
            if (cm > 12) { cm = 1; cy++; }
          }
          // Ensure today is the last point
          if (points[points.length - 1] !== today) points.push(today);

          // For each date point, compute total exposure
          const exposureData = points.map(dateStr => {
            let total = 0;
            risks.forEach(r => {
              const opened = r.date_opened || '9999-99-99';
              const closed = r.date_closed || null;
              if (dateStr < opened) return; // risk not yet opened
              // Determine which exposure to use
              const isClosed = closed && dateStr >= closed;
              const probScore = isClosed ? r.prob_score_after : r.prob_score_before;
              const impactScore = isClosed
                ? Math.max(r.capex_score_after || 0, r.schedule_score_after || 0)
                : Math.max(r.capex_score_before || 0, r.schedule_score_before || 0);
              if (probScore && impactScore) {
                total += probScore * impactScore;
              }
            });
            return total;
          });

          // Format labels as MMM YYYY
          const labels = points.map(d => {
            const [y, m] = d.split('-');
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            return months[parseInt(m) - 1] + ' ' + y;
          });

          this.exposureTrendChartObj = new Chart(trendCtx, {
            type: 'line',
            data: {
              labels: labels,
              datasets: [{
                label: 'Total Exposure',
                data: exposureData,
                borderColor: '#F59E0B',
                backgroundColor: 'rgba(245,158,11,0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 2,
                pointHoverRadius: 5,
                borderWidth: 2,
              }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                datalabels: { display: false },
              },
              scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 15 } },
                y: { beginAtZero: true, grid: { color: '#F3F4F6' }, ticks: { font: { size: 10 }, stepSize: 1 } },
              },
            },
          });
        }
      }
    },

    // ── Categories ──
    openCatModal(c = null) {
      this.editingCat = c;
      this.catForm = { name: c ? c.name : '' };
      this.catError = '';
      this.showCatModal = true;
    },
    async saveCat() {
      if (!this.catForm.name.trim()) { this.catError = 'Name is required'; return; }
      this.savingCat = true;
      try {
        if (this.editingCat) {
          await API.updateRiskCategory(this.editingCat.id, this.catForm);
        } else {
          await API.createRiskCategory(this.catForm);
        }
        this.categories = await API.getRiskCategories();
        this.showCatModal = false;
      } catch (e) {
        this.catError = e.message;
      } finally {
        this.savingCat = false;
      }
    },
    async deleteCategory(c) {
      if (!confirm(`Delete category "${c.name}"?`)) return;
      try {
        await API.deleteRiskCategory(c.id);
        this.categories = await API.getRiskCategories();
      } catch (e) { alert(e.message); }
    },

    // ── Phases ──
    openPhaseModal(p = null) {
      this.editingPhase = p;
      this.phaseForm = { name: p ? p.name : '' };
      this.phaseError = '';
      this.showPhaseModal = true;
    },
    async savePhase() {
      if (!this.phaseForm.name.trim()) { this.phaseError = 'Name is required'; return; }
      this.savingPhase = true;
      try {
        if (this.editingPhase) {
          await API.updateRiskPhase(this.editingPhase.id, this.phaseForm);
        } else {
          await API.createRiskPhase(this.phaseForm);
        }
        this.phases = await API.getRiskPhases();
        this.showPhaseModal = false;
      } catch (e) {
        this.phaseError = e.message;
      } finally {
        this.savingPhase = false;
      }
    },
    async deletePhase(p) {
      if (!confirm(`Delete phase "${p.name}"?`)) return;
      try {
        await API.deleteRiskPhase(p.id);
        this.phases = await API.getRiskPhases();
      } catch (e) { alert(e.message); }
    },

    // ── Risk CRUD ──
    openRiskModal(r = null) {
      this.editingRisk = r;
      this.riskForm = r ? {
        title: r.title, description: r.description || '',
        status: r.status || 'OPEN',
        category_id: r.category_id || null,
        phase_id: r.phase_id || null,
        date_opened: r.date_opened || '',
        date_closed: r.date_closed || '',
        owner_id: r.owner_id || null,
        prob_score_before: r.prob_score_before || null,
        capex_score_before: r.capex_score_before || null,
        schedule_score_before: r.schedule_score_before || null,
        capex_value: r.capex_value || null,
        schedule_value: r.schedule_value || null,
        mitigation_type: r.mitigation_type || null,
        mitigation_action: r.mitigation_action || '',
        action_due_date: r.action_due_date || '',
        action_status: r.action_status || 'NOT_STARTED',
        prob_score_after: r.prob_score_after || null,
        capex_score_after: r.capex_score_after || null,
        schedule_score_after: r.schedule_score_after || null,
        secondary_effects: r.secondary_effects || '',
        updated_at: r.updated_at || null,
      } : {
        title: '', description: '', status: 'OPEN',
        category_id: null, phase_id: null,
        date_opened: new Date().toISOString().slice(0, 10),
        date_closed: '',
        owner_id: null,
        prob_score_before: null, capex_score_before: null, schedule_score_before: null,
        capex_value: null, schedule_value: null,
        mitigation_type: null, mitigation_action: '', action_due_date: '', action_status: 'NOT_STARTED',
        prob_score_after: null, capex_score_after: null, schedule_score_after: null,
        secondary_effects: '',
      };
      this.riskError = '';
      this.showRiskModal = true;
    },
    async saveRisk() {
      if (!this.riskForm.title.trim()) { this.riskError = 'Title is required'; return; }
      if (!this.riskForm.description || !this.riskForm.description.trim()) { this.riskError = 'Description is required'; return; }
      if (!this.riskForm.category_id) { this.riskError = 'Category is required'; return; }
      if (!this.riskForm.phase_id) { this.riskError = 'Phase is required'; return; }
      this.savingRisk = true;
      this.riskError = '';
      try {
        const body = { ...this.riskForm };
        ['date_opened', 'date_closed', 'action_due_date', 'mitigation_action', 'secondary_effects', 'description'].forEach(k => {
          if (body[k] === '') body[k] = null;
        });
        if (this.editingRisk) {
          await API.updateRisk(this.editingRisk.id, body);
        } else {
          await API.createRisk(body);
        }
        this.risks = await API.getRisks();
        this.showRiskModal = false;
      } catch (e) {
        this.riskError = e.status === 409
          ? 'This risk was modified by another user. Please close and reopen to get the latest version.'
          : e.message;
      } finally {
        this.savingRisk = false;
      }
    },
    toggleSort(field) {
      if (this.rSortField === field) {
        if (!this.rSortAsc) { this.rSortField = null; this.rSortAsc = true; }
        else { this.rSortAsc = false; }
      } else {
        this.rSortField = field;
        this.rSortAsc = false;
      }
    },
    sortIcon(field) {
      if (this.rSortField !== field) return '↕';
      return this.rSortAsc ? '↑' : '↓';
    },
    async deleteRisk(r) {
      if (!confirm(`Delete risk "${r.title}"? This cannot be undone.`)) return;
      try {
        await API.deleteRisk(r.id);
        this.risks = await API.getRisks();
      } catch (e) { alert(e.message); }
    },
    async closeRisk(r) {
      if (!confirm(`Close risk "${r.title}"?\n\nThis will set the status to CLOSED, action status to CLOSED, and date closed to today.`)) return;
      try {
        const today = new Date().toISOString().split('T')[0];
        await API.updateRisk(r.id, {
          title: r.title,
          status: 'CLOSED',
          action_status: 'CLOSED',
          date_closed: today,
          updated_at: r.updated_at,
        });
        this.risks = await API.getRisks();
      } catch (e) { alert(e.message); }
    },

    // ── Risk Import ──
    async exportRisksXlsx() {
      try { await API.exportRisks(); }
      catch (e) { alert(e.message || 'Export failed'); }
    },
    openRiskImportModal() {
      this.showRiskImportModal = true;
      this.riskImportFile = null;
      this.riskImportPreview = null;
      this.riskImportError = '';
      this.riskImportResult = null;
    },
    resetRiskImport() {
      if (this.riskImportPreview) {
        this.riskImportPreview = null;
        this.riskImportError = '';
      } else {
        this.showRiskImportModal = false;
      }
    },
    onRiskImportFileChange(e) {
      this.riskImportFile = e.target.files[0] || null;
      this.riskImportError = '';
    },
    async runRiskImportPreview() {
      if (!this.riskImportFile) return;
      this.riskImportLoading = true;
      this.riskImportError = '';
      try {
        this.riskImportPreview = await API.previewRisksImport(this.riskImportFile);
      } catch (e) {
        this.riskImportError = e.message || 'Preview failed';
      } finally {
        this.riskImportLoading = false;
      }
    },
    async applyRiskImport() {
      if (!this.riskImportPreview) return;
      this.riskImportApplying = true;
      this.riskImportError = '';
      try {
        this.riskImportResult = await API.applyRisksImport({ rows: this.riskImportPreview.rows });
      } catch (e) {
        this.riskImportError = e.message || 'Import failed';
      } finally {
        this.riskImportApplying = false;
      }
    },

    // ── Risk Detail ──
    async openRiskDetail(r) {
      this.detailRisk = await API.getRisk(r.id);
      this.newNote = '';
    },
    async addNote() {
      if (!this.newNote.trim() || !this.detailRisk) return;
      try {
        await API.addRiskNote(this.detailRisk.id, { content: this.newNote });
        this.newNote = '';
        this.detailRisk = await API.getRisk(this.detailRisk.id);
      } catch (e) { alert(e.message); }
    },
    async deleteNote(n) {
      if (!confirm('Delete this note?')) return;
      try {
        await API.deleteRiskNote(this.detailRisk.id, n.id);
        this.detailRisk = await API.getRisk(this.detailRisk.id);
      } catch (e) { alert(e.message); }
    },
    canDeleteNote(n) {
      if (!this.currentUser) return false;
      if (['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role)) return true;
      return n.created_by_id === this.currentUser.id;
    },

    // ── Helpers ──
    scoreLabel(s, type) {
      if (!s) return '';
      const pct = type === 'probability' ? s.probability_pct
                : type === 'capex'       ? s.capex_impact_pct
                :                          s.schedule_impact_pct;
      return pct != null ? `${s.score} — ${pct}%` : String(s.score);
    },

    riskLevelClass(prob, impact) {
      if (!prob || !impact) return 'bg-gray-100 text-gray-600';
      const level = this.matrixCell(prob, impact);
      if (level === 'HIGH') return 'bg-red-100 text-red-700';
      if (level === 'MEDIUM') return 'bg-orange-100 text-orange-700';
      return 'bg-green-100 text-green-700';
    },
    riskLevelBadge(r) {
      const level = this.dashRiskLevel(r);
      if (level === 'HIGH') return 'bg-red-100 text-red-700';
      if (level === 'MEDIUM') return 'bg-orange-100 text-orange-700';
      return 'bg-green-100 text-green-700';
    },
    dashRiskLevel(r) {
      if (!r.prob_score_before) return 'LOW';
      const impact = Math.max(r.capex_score_before || 0, r.schedule_score_before || 0);
      return this.matrixCell(r.prob_score_before, impact);
    },
    dashRiskColor(r) {
      const level = this.dashRiskLevel(r);
      if (level === 'HIGH') return 'bg-red-500';
      if (level === 'MEDIUM') return 'bg-orange-400';
      return 'bg-green-500';
    },
    statusBadgeClass(status) {
      if (status === 'OPEN') return 'bg-red-100 text-red-700';
      if (status === 'MONITORING') return 'bg-yellow-100 text-yellow-700';
      if (status === 'CLOSED') return 'bg-green-100 text-green-700';
      return 'bg-gray-100 text-gray-600';
    },
    actionStatusClass(status) {
      if (status === 'IN_PROGRESS') return 'bg-blue-100 text-blue-700';
      if (status === 'CLOSED') return 'bg-green-100 text-green-700';
      if (status === 'ON_HOLD') return 'bg-yellow-100 text-yellow-700';
      return 'bg-gray-100 text-gray-600';
    },
    formatActionStatus(s) {
      const map = { NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', CLOSED: 'Closed', ON_HOLD: 'On Hold' };
      return map[s] || s || '—';
    },
    calcImpact(probScore, value, type) {
      const pSetup = this.scoreSetup.find(s => s.score === probScore);
      if (!pSetup) return 0;
      const pct = type === 'capex' ? pSetup.capex_impact_pct : pSetup.schedule_impact_pct;
      return value * (pSetup.probability_pct / 100) * (pct / 100);
    },
    fmtEur(v) {
      if (v === null || v === undefined) return '—';
      return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
    },
    fmtDate(iso) { return fmtTimestamp(iso); },

    riskBudgetBefore(r) {
      if (!r.prob_score_before || !r.capex_value) return 0;
      const ps = this.scoreSetup.find(s => s.score === r.prob_score_before);
      const cs = this.scoreSetup.find(s => s.score === (r.capex_score_before || 1));
      if (!ps || !cs) return 0;
      return r.capex_value * (ps.probability_pct / 100) * (cs.capex_impact_pct / 100);
    },
    riskScheduleBefore(r) {
      if (!r.prob_score_before || !r.schedule_value) return 0;
      const ps = this.scoreSetup.find(s => s.score === r.prob_score_before);
      const ss = this.scoreSetup.find(s => s.score === (r.schedule_score_before || 1));
      if (!ps || !ss) return 0;
      return r.schedule_value * (ps.probability_pct / 100) * (ss.schedule_impact_pct / 100);
    },
    riskBudgetAfter(r) {
      if (!r.prob_score_after || !r.capex_value) return 0;
      const ps = this.scoreSetup.find(s => s.score === r.prob_score_after);
      const cs = this.scoreSetup.find(s => s.score === (r.capex_score_after || 1));
      if (!ps || !cs) return 0;
      return r.capex_value * (ps.probability_pct / 100) * (cs.capex_impact_pct / 100);
    },
    riskScheduleAfter(r) {
      if (!r.prob_score_after || !r.schedule_value) return 0;
      const ps = this.scoreSetup.find(s => s.score === r.prob_score_after);
      const ss = this.scoreSetup.find(s => s.score === (r.schedule_score_after || 1));
      if (!ps || !ss) return 0;
      return r.schedule_value * (ps.probability_pct / 100) * (ss.schedule_impact_pct / 100);
    },

    async exportExcel() {
      this.exporting = true;
      try {
        const params = new URLSearchParams();
        if (this.rStatusFilter) params.set('status', this.rStatusFilter);
        if (this.rCatFilter)    params.set('category_id', this.rCatFilter);
        if (this.rPhaseFilter)  params.set('phase_id', this.rPhaseFilter);
        const qs = params.toString() ? '?' + params.toString() : '';
        const date = new Date().toISOString().split('T')[0];
        await API.download(`/api/risks/export/excel${qs}`, `risk_register_${date}.xlsx`);
      } catch (e) {
        alert('Export failed: ' + e.message);
      } finally {
        this.exporting = false;
      }
    },
  },
});
