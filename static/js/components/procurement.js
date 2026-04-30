// ─────────────────────────────────────────────────────────────────────────────
// Procurement Module
// ─────────────────────────────────────────────────────────────────────────────
app.component('procurement-module', {
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
    </button>
  </div>

  <!-- ── Dashboard Tab ────────────────────────────────────────────────────── -->
  <div v-if="activeTab === 'dashboard'">
    <!-- Package filter bar (shown as soon as we have at least one load) -->
    <div v-if="dashboardData" class="flex items-center gap-3 mb-4">
      <label class="text-sm font-medium text-gray-600 shrink-0">Filter by package:</label>
      <select v-model="dashPackageId" @change="onDashPackageChange" class="input-field max-w-xs text-sm">
        <option :value="null">All packages</option>
        <option v-for="p in dashboardData.all_packages" :key="p.id" :value="p.id">{{ p.tag }}<template v-if="p.name"> \u2014 {{ p.name }}</template></option>
      </select>
      <span v-if="dashPackageId" class="text-xs text-ips-blue font-semibold">Filtered view</span>
    </div>
    <div v-if="dashboardLoading" class="text-center py-8 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="!dashboardData" class="card p-10 text-center text-gray-400">No data available.</div>
    <div v-else class="space-y-6 pb-8">

      <!-- KPI row + Budget weight donut -->
      <div class="grid grid-cols-3 gap-4">
        <!-- Left: 4 KPI cards in 2x2 -->
        <div class="col-span-2 grid grid-cols-2 gap-4">
          <div class="card p-4">
            <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Overall Progress</div>
            <div class="text-3xl font-bold text-ips-blue">{{ dashKpis.overallProgress.toFixed(0) }}%</div>
            <div class="w-full bg-gray-100 rounded-full h-1.5 mt-2">
              <div class="h-1.5 rounded-full bg-ips-blue" :style="'width:' + Math.min(dashKpis.overallProgress, 100) + '%'"></div>
            </div>
          </div>
          <div class="card p-4">
            <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Packages</div>
            <div class="text-3xl font-bold text-gray-800">{{ dashKpis.pkgsWithPlan }}<span class="text-lg text-gray-400 font-normal"> / {{ dashKpis.totalPkgs }}</span></div>
            <div class="text-xs text-gray-400 mt-1">with procurement plan</div>
          </div>
          <div class="card p-4">
            <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Bidding Companies</div>
            <div class="text-3xl font-bold text-gray-800">{{ dashKpis.totalBidders }}</div>
            <div class="text-xs text-gray-400 mt-1">
              <span class="text-emerald-600 font-semibold">{{ dashKpis.awardedCount }} awarded</span>
            </div>
          </div>
          <div class="card p-4" :class="dashKpis.lateStepsCount > 0 ? 'border border-red-200 bg-red-50' : ''">
            <div class="text-xs font-semibold uppercase tracking-wide mb-1" :class="dashKpis.lateStepsCount > 0 ? 'text-red-600' : 'text-gray-500'">Late Steps</div>
            <div class="text-3xl font-bold" :class="dashKpis.lateStepsCount > 0 ? 'text-red-600' : 'text-gray-800'">{{ dashKpis.lateStepsCount }}</div>
            <div class="text-xs mt-1" :class="dashKpis.lateStepsCount > 0 ? 'text-red-400' : 'text-gray-400'">steps past due date</div>
          </div>
        </div>
        <!-- Right: Financial weight donut -->
        <div class="card p-4 flex flex-col">
          <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Financial Weight per Package</div>
          <div class="text-[10px] text-gray-400 mb-2">Applicable packages only</div>
          <div class="relative flex-1 min-h-0" style="min-height:180px">
            <canvas ref="budgetWeightDonut"></canvas>
          </div>
        </div>
      </div>

      <!-- Package progress grid -->
      <div class="card overflow-hidden p-0">
        <div class="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h3 class="font-semibold text-gray-800">Progress by Package</h3>
          <span class="text-xs text-gray-400">Active bidders avg \u00b7 budget-weighted</span>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-xs text-gray-400 uppercase border-b border-gray-100 bg-gray-50">
              <th class="text-left px-4 py-2 font-semibold w-44">Package</th>
              <th class="text-left px-4 py-2 font-semibold w-44">Proc. Progress</th>
              <th class="text-right px-4 py-2 font-semibold w-24">Budget wt.</th>
              <th class="text-right px-4 py-2 font-semibold w-32">Avg Bid</th>
              <th class="text-right px-4 py-2 font-semibold w-24">vs Budget</th>
              <th class="text-left px-4 py-2 font-semibold w-40">Bidders</th>
              <th class="text-left px-4 py-2 font-semibold w-24">Late steps</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-for="pkg in dashboardData.pkg_stats" :key="pkg.package_id"
              class="hover:bg-gray-50 transition-colors">
              <!-- Package identity -->
              <td class="px-4 py-3 w-44">
                <div class="flex items-center gap-2">
                  <div class="w-7 h-7 rounded bg-ips-dark flex items-center justify-center shrink-0">
                    <span class="text-white text-xs font-bold leading-none">{{ (pkg.package_tag || '').substring(0,3) }}</span>
                  </div>
                  <div class="min-w-0">
                    <div class="font-semibold text-gray-800 text-xs whitespace-nowrap">{{ pkg.package_tag }}</div>
                    <div v-if="pkg.package_name" class="text-xs text-gray-400 max-w-[8rem]" :title="pkg.package_name" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">{{ pkg.package_name }}</div>
                  </div>
                </div>
              </td>
              <!-- Progress bar + % -->
              <td class="px-4 py-3">
                <div class="flex items-center gap-1.5">
                  <div class="w-24 bg-gray-100 rounded-full h-1.5 shrink-0">
                    <div class="h-1.5 rounded-full transition-all"
                      :class="pkg.procurement_progress >= 100 ? 'bg-emerald-500' : pkg.late_steps.length > 0 ? 'bg-amber-500' : 'bg-ips-blue'"
                      :style="'width:' + Math.min(pkg.procurement_progress, 100) + '%'"></div>
                  </div>
                  <span class="text-xs font-bold text-gray-700 w-9 text-right">{{ pkg.procurement_progress.toFixed(0) }}%</span>
                </div>
              </td>
              <!-- Budget weight -->
              <td class="px-4 py-3 text-right">
                <span class="text-sm font-bold text-gray-700">{{ pkg.financial_weight_pct.toFixed(1) }}%</span>
              </td>
              <!-- Avg bid value -->
              <td class="px-4 py-3 text-right">
                <span v-if="pkg.avg_bid_value != null" class="text-xs font-semibold text-gray-700">
                  {{ (pkg.avg_bid_value / 1e6).toFixed(2) }}M
                </span>
                <span v-else class="text-xs text-gray-300">\u2014</span>
              </td>
              <!-- vs Budget -->
              <td class="px-4 py-3 text-right">
                <span v-if="pkg.avg_bid_value != null && pkg.forecast > 0"
                  :class="pkg.avg_bid_value <= pkg.forecast ? 'text-emerald-600' : 'text-red-600'"
                  class="text-xs font-bold">
                  {{ ((pkg.avg_bid_value / pkg.forecast) * 100).toFixed(0) }}%
                </span>
                <span v-else class="text-xs text-gray-300">\u2014</span>
              </td>
              <!-- Bidder status badges -->
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1">
                  <span v-if="pkg.company_statuses.COMPETING > 0"
                    class="px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">
                    {{ pkg.company_statuses.COMPETING }}C
                  </span>
                  <span v-if="pkg.company_statuses.AWARDED > 0"
                    class="px-1.5 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">
                    {{ pkg.company_statuses.AWARDED }}A
                  </span>
                  <span v-if="pkg.company_statuses.EXCLUDED > 0"
                    class="px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-500">
                    {{ pkg.company_statuses.EXCLUDED }}X
                  </span>
                  <span v-if="pkg.company_statuses.AWAITING > 0"
                    class="px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700">
                    {{ pkg.company_statuses.AWAITING }}W
                  </span>
                  <span v-if="!pkg.has_plan" class="text-xs text-gray-300">No plan</span>
                  <span v-else-if="!pkg.has_entries" class="text-xs text-gray-300">No bidders</span>
                </div>
              </td>
              <!-- Late steps -->
              <td class="px-4 py-3">
                <span v-if="pkg.late_steps.length > 0"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                  {{ pkg.late_steps.length }} late
                </span>
                <span v-else class="text-xs text-gray-300">\u2014</span>
              </td>
            </tr>
          </tbody>
        </table>
        <!-- Legend -->
        <div class="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 flex gap-4">
          <span><b>C</b> = Competing</span>
          <span><b>A</b> = Awarded</span>
          <span><b>X</b> = Excluded</span>
          <span><b>W</b> = Awaiting</span>
          <span class="ml-auto">Avg Bid &amp; vs Budget based on non-excluded entries with bid values</span>
        </div>
      </div>

      <!-- S-Curve chart -->
      <div class="card p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-800">Procurement S-Curve</h3>
          <div class="text-xs text-gray-400">{{ dashPackageId ? 'Package progress (0\u2013100%)' : 'Budget-weighted overall progress (0\u2013100%)' }} \u2014 Forecast vs Actual</div>
        </div>
        <div v-if="dashboardData.forecast_series.length === 0 && dashboardData.actual_series.length === 0"
          class="text-center py-10 text-gray-400 text-sm">No step dates or events recorded yet. Add due dates in the Procurement Plan and advance steps in the Register to see the S-curve.</div>
        <canvas v-else ref="procChart" height="80"></canvas>
      </div>

      <!-- Compliance + Bid charts (auto-adjust to dashPackageId) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="card p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-gray-800">Technical Compliance</h3>
            <div class="text-xs text-gray-400">{{ dashPackageId ? 'Selected package' : 'All packages' }} \u2014 non-excluded bidders</div>
          </div>
          <div v-if="complianceTotals.technical.total === 0" class="text-center py-8 text-gray-400 text-sm">
            No compliance data recorded yet.
          </div>
          <div v-else style="position:relative;height:260px">
            <canvas ref="techComplianceChart"></canvas>
          </div>
        </div>
        <div class="card p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-gray-800">Commercial Compliance</h3>
            <div class="text-xs text-gray-400">{{ dashPackageId ? 'Selected package' : 'All packages' }} \u2014 non-excluded bidders</div>
          </div>
          <div v-if="complianceTotals.commercial.total === 0" class="text-center py-8 text-gray-400 text-sm">
            No compliance data recorded yet.
          </div>
          <div v-else style="position:relative;height:260px">
            <canvas ref="commComplianceChart"></canvas>
          </div>
        </div>
      </div>

      <div class="card p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-gray-800">Bid vs Budget</h3>
          <div class="text-xs text-gray-400">{{ dashPackageId ? 'Bid range against package actual budget' : 'Average bid vs actual budget per package' }}</div>
        </div>
        <div v-if="!hasBidVsBudgetData" class="text-center py-8 text-gray-400 text-sm">
          No bid values captured yet. Bidders submit bids via the bidder portal; project users can also enter bid values from the Register.
        </div>
        <div v-else style="position:relative;height:320px">
          <canvas ref="bidVsBudgetChart"></canvas>
        </div>
      </div>

      <!-- Late steps table -->
      <div v-if="dashKpis.lateStepsCount > 0" class="card overflow-hidden p-0">
        <div class="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
          <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <h3 class="font-semibold text-red-700">Late Steps</h3>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <th class="text-left px-4 py-2 font-semibold">Package</th>
              <th class="text-left px-4 py-2 font-semibold">Step</th>
              <th class="text-left px-4 py-2 font-semibold">Due Date</th>
              <th class="text-left px-4 py-2 font-semibold">Days Late</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="pkg in dashboardData.pkg_stats" :key="pkg.package_id">
              <tr v-for="ls in pkg.late_steps" :key="pkg.package_id + '_' + ls.step_name"
                class="border-b border-gray-100 last:border-0">
                <td class="px-4 py-2 font-semibold text-gray-800">{{ pkg.package_tag }}</td>
                <td class="px-4 py-2 text-gray-700">{{ ls.step_name }}</td>
                <td class="px-4 py-2 text-gray-600">{{ ls.due_date }}</td>
                <td class="px-4 py-2">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                    {{ ls.days_late }}d late
                  </span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

    </div>
  </div>

  <!-- ── Bidder Portal Tab ─────────────────────────────────────────────────── -->
  <div v-if="activeTab === 'bidder-portal'">
    <div v-if="bidderLoading" class="text-center py-12 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="!bidderData || !bidderData.company" class="card p-10 text-center text-gray-400">
      Your user is not linked to any bidding company for this project. Contact the project administrator.
    </div>
    <div v-else class="space-y-6 pb-8">

      <!-- Company header -->
      <div class="card p-5 flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-ips-dark flex items-center justify-center shrink-0">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
        </div>
        <div>
          <div class="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-0.5">Bidding Company</div>
          <div class="text-xl font-bold text-gray-800">{{ bidderData.company.name }}</div>
        </div>
        <div class="ml-auto text-xs text-gray-400">{{ bidderData.entries.length }} package{{ bidderData.entries.length !== 1 ? 's' : '' }}</div>
      </div>

      <!-- No entries -->
      <div v-if="bidderData.entries.length === 0" class="card p-10 text-center text-gray-400">
        No procurement entries found for your company in this project.
      </div>

      <!-- Per-package tab bar — one tab per [package] the bidder is competing on -->
      <div v-if="bidderData.entries.length > 1" class="flex flex-wrap gap-1 border-b border-gray-200">
        <button v-for="e in bidderData.entries" :key="e.entry_id"
          @click="bidderActiveEntryId = e.entry_id"
          :class="['px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
                   bidderActiveEntryId === e.entry_id
                     ? 'border-ips-blue text-ips-dark'
                     : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300']">
          <span class="font-semibold">{{ e.package_tag }}</span>
          <span class="text-xs text-gray-400 truncate max-w-[160px]" :title="e.package_name">{{ e.package_name }}</span>
          <span :class="{
              'bg-blue-100 text-blue-700': e.status === 'COMPETING',
              'bg-emerald-100 text-emerald-700': e.status === 'AWARDED',
              'bg-gray-100 text-gray-500': e.status === 'EXCLUDED',
              'bg-amber-100 text-amber-700': e.status === 'AWAITING',
            }" class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">{{ e.status }}</span>
        </button>
      </div>

      <!-- Entry for the selected package -->
      <div v-for="entry in (activeBidderEntry ? [activeBidderEntry] : [])" :key="entry.entry_id" class="card overflow-hidden">

        <!-- Package header -->
        <div class="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div class="w-9 h-9 rounded-lg bg-ips-dark flex items-center justify-center shrink-0">
            <span class="text-white text-xs font-bold">{{ (entry.package_tag || '').substring(0,3) }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-gray-800">{{ entry.package_tag }}</div>
            <div v-if="entry.package_name" class="text-xs text-gray-500 truncate">{{ entry.package_name }}</div>
          </div>
          <span :class="{
            'bg-blue-100 text-blue-700': entry.status === 'COMPETING',
            'bg-emerald-100 text-emerald-700': entry.status === 'AWARDED',
            'bg-gray-100 text-gray-500': entry.status === 'EXCLUDED',
            'bg-amber-100 text-amber-700': entry.status === 'AWAITING',
          }" class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">{{ entry.status }}</span>
        </div>

        <div class="p-5 space-y-5">

          <!-- Exclusion notice -->
          <div v-if="entry.status === 'EXCLUDED'" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <div class="text-sm font-semibold text-red-700 mb-1">Your company has been excluded from this package</div>
            <div v-if="entry.exclusion_reason" class="text-sm text-red-600">{{ entry.exclusion_reason }}</div>
          </div>

          <!-- Progress + current step -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Overall Progress</div>
              <div class="flex items-center gap-3">
                <div class="flex-1 bg-gray-100 rounded-full h-2">
                  <div class="h-2 rounded-full transition-all"
                    :class="entry.status === 'AWARDED' ? 'bg-emerald-500' : entry.status === 'EXCLUDED' ? 'bg-gray-300' : 'bg-ips-blue'"
                    :style="'width:' + Math.min(entry.progress, 100) + '%'"></div>
                </div>
                <span class="text-sm font-bold text-gray-700 w-10 text-right">{{ entry.progress.toFixed(0) }}%</span>
              </div>
              <div class="text-xs text-gray-400 mt-1">Step {{ entry.step_index }} of {{ entry.step_count }}</div>
            </div>
            <div v-if="entry.current_step_name">
              <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Current Step</div>
              <div class="font-semibold text-gray-800">{{ entry.current_step_name }}</div>
              <div v-if="entry.current_step_description" class="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-3">{{ entry.current_step_description }}</div>
            </div>
          </div>

          <!-- Compliance -->
          <div v-if="entry.technical_compliance || entry.commercial_compliance" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div v-if="entry.technical_compliance && entry.technical_compliance !== 'NA'" class="rounded-lg border px-4 py-3"
              :class="complianceCardBorder(entry.technical_compliance)">
              <div class="text-xs font-semibold uppercase tracking-wide mb-1"
                :class="complianceCardHeader(entry.technical_compliance)">Technical Compliance</div>
              <div class="font-bold text-sm" :class="complianceCardValue(entry.technical_compliance)">{{ complianceLabel(entry.technical_compliance) }}</div>
              <div v-if="entry.technical_compliance_note" class="text-xs mt-1 text-gray-600">{{ entry.technical_compliance_note }}</div>
            </div>
            <div v-if="entry.commercial_compliance && entry.commercial_compliance !== 'NA'" class="rounded-lg border px-4 py-3"
              :class="complianceCardBorder(entry.commercial_compliance)">
              <div class="text-xs font-semibold uppercase tracking-wide mb-1"
                :class="complianceCardHeader(entry.commercial_compliance)">Commercial Compliance</div>
              <div class="font-bold text-sm" :class="complianceCardValue(entry.commercial_compliance)">{{ complianceLabel(entry.commercial_compliance) }}</div>
              <div v-if="entry.commercial_compliance_note" class="text-xs mt-1 text-gray-600">{{ entry.commercial_compliance_note }}</div>
            </div>
          </div>

          <!-- Step schedule -->
          <div>
            <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Procurement Schedule</div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-xs text-gray-400 border-b border-gray-100">
                    <th class="text-left py-1.5 pr-3 font-semibold w-6">#</th>
                    <th class="text-left py-1.5 pr-3 font-semibold">Step</th>
                    <th class="text-left py-1.5 pr-3 font-semibold w-16">Weight</th>
                    <th class="text-left py-1.5 font-semibold w-28">Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(s, idx) in entry.schedule" :key="s.step_id"
                    class="border-b border-gray-50 last:border-0"
                    :class="s.status === 'current' ? 'bg-blue-50' : ''">
                    <td class="py-2 pr-3">
                      <span class="inline-block w-2 h-2 rounded-full" :class="bidderStepDotClass(s.status)"></span>
                    </td>
                    <td class="py-2 pr-3">
                      <div :class="bidderStepStatusClass(s.status)">{{ s.step_name }}</div>
                      <div v-if="s.status === 'current' && s.description" class="text-xs text-gray-500 mt-0.5 leading-relaxed max-w-lg">{{ s.description }}</div>
                    </td>
                    <td class="py-2 pr-3 text-xs text-gray-400">{{ s.weight_pct }}%</td>
                    <td class="py-2 text-xs" :class="s.due_date ? 'text-gray-600' : 'text-gray-300'">{{ s.due_date || '\u2014' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Attachments — split into Project documents (left) and My uploads (right) -->
          <div>
            <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Attachments</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <!-- LEFT: Project-uploaded documents -->
              <div class="rounded-lg border border-gray-200 bg-white">
                <div class="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                  <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5"/></svg>
                  <span class="text-xs font-semibold text-gray-700">Project documents</span>
                  <span class="ml-auto text-[10px] text-gray-400">{{ projectAttachments(entry.entry_id).length }}</span>
                </div>
                <div v-if="bidderAttLoading[entry.entry_id]" class="p-4 text-center text-gray-400">
                  <img src="/static/assets/impulse-loader.svg" class="h-5 mx-auto" alt="Loading"/>
                </div>
                <div v-else-if="projectAttachments(entry.entry_id).length === 0" class="p-3 text-xs text-gray-400 italic">
                  No documents uploaded by the project yet.
                </div>
                <div v-else class="divide-y divide-gray-100">
                  <div v-for="g in groupByStep(projectAttachments(entry.entry_id))" :key="'p-'+entry.entry_id+'-'+(g.step_id || 'none')" class="px-3 py-2">
                    <div class="flex items-center justify-between mb-1">
                      <button @click="toggleStep('bidder-project-'+entry.entry_id, g)"
                              class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800">
                        <svg :class="['w-3 h-3 transition-transform', isStepExpanded('bidder-project-'+entry.entry_id, g) ? 'rotate-90' : '']"
                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                        </svg>
                        <span>{{ g.step_name || 'No step' }}</span>
                        <span class="ml-1 text-[10px] text-gray-400 normal-case font-normal">({{ g.files.length }})</span>
                      </button>
                      <button v-if="g.files.length > 1" @click.stop="downloadStepZip(g, 'project', entry.package_tag)"
                              class="text-[10px] text-ips-blue hover:underline" title="Download all files in this step">
                        Download all ({{ g.files.length }})
                      </button>
                    </div>
                    <div v-show="isStepExpanded('bidder-project-'+entry.entry_id, g)" class="space-y-1">
                      <div v-for="att in g.files" :key="att.id" class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 text-sm">
                        <span class="text-base shrink-0">{{ bidderFileIcon(att) }}</span>
                        <span class="flex-1 truncate text-xs font-medium text-gray-800" :title="att.original_filename">{{ att.original_filename }}</span>
                        <span class="text-[10px] text-gray-400 shrink-0">{{ bidderFmtDate(att.uploaded_at) }}</span>
                        <button @click="bidderViewFile(att)" class="text-gray-400 hover:text-ips-blue" title="View"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></button>
                        <button @click="bidderDownloadFile(att)" class="text-gray-400 hover:text-ips-blue" title="Download"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg></button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- RIGHT: Bidder's own uploads + upload control -->
              <div class="rounded-lg border border-gray-200 bg-white">
                <div class="px-3 py-2 border-b border-gray-100 bg-amber-50 flex items-center gap-2">
                  <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                  <span class="text-xs font-semibold text-amber-800">My uploads</span>
                  <span class="ml-auto text-[10px] text-amber-600">{{ myAttachments(entry.entry_id).length }}</span>
                </div>
                <div v-if="bidderAttLoading[entry.entry_id]" class="p-4 text-center text-gray-400">
                  <img src="/static/assets/impulse-loader.svg" class="h-5 mx-auto" alt="Loading"/>
                </div>
                <div v-else-if="myAttachments(entry.entry_id).length === 0" class="p-3 text-xs text-gray-400 italic">
                  You haven't uploaded any documents yet.
                </div>
                <div v-else class="divide-y divide-gray-100">
                  <div v-for="g in groupByStep(myAttachments(entry.entry_id))" :key="'m-'+entry.entry_id+'-'+(g.step_id || 'none')" class="px-3 py-2">
                    <div class="flex items-center justify-between mb-1">
                      <button @click="toggleStep('bidder-mine-'+entry.entry_id, g)"
                              class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 hover:text-amber-900">
                        <svg :class="['w-3 h-3 transition-transform', isStepExpanded('bidder-mine-'+entry.entry_id, g) ? 'rotate-90' : '']"
                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                        </svg>
                        <span>{{ g.step_name || 'No step' }}</span>
                        <span class="ml-1 text-[10px] text-amber-600 normal-case font-normal">({{ g.files.length }})</span>
                      </button>
                      <button v-if="g.files.length > 1" @click.stop="downloadStepZip(g, 'bidder', entry.package_tag)"
                              class="text-[10px] text-amber-700 hover:underline" title="Download all files in this step">
                        Download all ({{ g.files.length }})
                      </button>
                    </div>
                    <div v-show="isStepExpanded('bidder-mine-'+entry.entry_id, g)" class="space-y-1">
                      <div v-for="att in g.files" :key="att.id" class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 text-sm">
                        <span class="text-base shrink-0">{{ bidderFileIcon(att) }}</span>
                        <span class="flex-1 truncate text-xs font-medium text-gray-800" :title="att.original_filename">{{ att.original_filename }}</span>
                        <span class="text-[10px] text-gray-400 shrink-0">{{ bidderFmtDate(att.uploaded_at) }}</span>
                        <button @click="bidderViewFile(att)" class="text-gray-400 hover:text-ips-blue" title="View"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></button>
                        <button @click="bidderDownloadFile(att)" class="text-gray-400 hover:text-ips-blue" title="Download"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg></button>
                        <button v-if="!entry.has_current_step_submittal || att.step_id !== entry.current_step_id"
                                @click="bidderDeleteFile(entry.entry_id, att)" class="text-gray-300 hover:text-red-500" title="Delete"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="entry.status !== 'EXCLUDED'" class="px-3 py-2 border-t border-gray-100">
                  <!-- Locked: bidder already submitted at this step -->
                  <div v-if="entry.has_current_step_submittal"
                       class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                    <svg class="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m0-10a4 4 0 00-4 4v3h8v-3a4 4 0 00-4-4z"/><rect x="5" y="11" width="14" height="10" rx="2" ry="2" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
                    <span>Uploads locked — you've already submitted at <strong>{{ entry.current_step_name || 'this step' }}</strong>.</span>
                  </div>
                  <template v-else>
                    <input :ref="'bidderUploadInput-'+entry.entry_id" type="file" multiple class="hidden"
                           @change="bidderUploadFiles(entry, $event)"/>
                    <div
                      @dragover.prevent="bidderDragOverId = entry.entry_id"
                      @dragleave.prevent="bidderDragOverId = null"
                      @drop.prevent="bidderDropFiles(entry, $event)"
                      @click="$refs['bidderUploadInput-'+entry.entry_id][0].click()"
                      :class="['border-2 border-dashed rounded-lg px-3 py-3 text-center cursor-pointer transition-colors text-xs',
                               bidderDragOverId === entry.entry_id ? 'border-amber-500 bg-amber-100 text-amber-700' : 'border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100']">
                      <span v-if="bidderUploading[entry.entry_id]">
                        <svg class="w-4 h-4 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        Uploading…
                      </span>
                      <span v-else class="font-semibold inline-flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12m0-12l-3 3m3-3l3 3"/></svg>
                        Drop files here or click to upload
                      </span>
                    </div>
                    <p class="text-[10px] text-gray-400 mt-1">Will be tagged to <strong>{{ entry.current_step_name || 'the current step' }}</strong>.</p>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <!-- Bid submission form (only if not excluded) -->
          <div v-if="entry.status !== 'EXCLUDED'" class="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide">Submit Bid / Comment</div>

            <!-- Locked banner: bidder already submitted for the current step -->
            <div v-if="entry.has_current_step_submittal"
                 class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
              <svg class="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m0-10a4 4 0 00-4 4v3h8v-3a4 4 0 00-4-4z"/><rect x="5" y="11" width="14" height="10" rx="2" ry="2" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
              <span>
                You have already submitted at <strong>{{ entry.current_step_name || 'the current step' }}</strong>.
                Wait for the project team to advance the step before submitting again.
              </span>
            </div>

            <div class="flex items-end gap-3 flex-wrap">
              <div class="flex-1 min-w-36">
                <label class="block text-xs text-gray-500 mb-1">Bid Value</label>
                <input type="number" v-model="bidderForms[entry.entry_id].bid_value" class="input-field text-sm" placeholder="e.g. 1250000" step="1000" :disabled="entry.has_current_step_submittal"/>
              </div>
              <div class="w-24">
                <label class="block text-xs text-gray-500 mb-1">Currency</label>
                <select v-model="bidderForms[entry.entry_id].bid_currency" class="input-field text-sm" :disabled="entry.has_current_step_submittal">
                  <option>EUR</option><option>USD</option><option>GBP</option><option>NOK</option><option>DKK</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Comment / Question</label>
              <textarea v-model="bidderForms[entry.entry_id].comment" class="input-field text-sm w-full" rows="2" placeholder="Add a comment or question for the project team\u2026" :disabled="entry.has_current_step_submittal"></textarea>
            </div>
            <div class="flex items-center gap-3">
              <button @click="bidderSubmitGuarded(entry)"
                :disabled="bidderForms[entry.entry_id].saving || entry.has_current_step_submittal"
                class="btn-primary text-sm px-4 py-1.5 disabled:opacity-50">
                {{ bidderForms[entry.entry_id].saving ? 'Saving\u2026' : 'Submit' }}
              </button>
              <span v-if="bidderForms[entry.entry_id].error" class="text-xs text-red-500">{{ bidderForms[entry.entry_id].error }}</span>
            </div>
          </div>

          <!-- Submittal history (kept above the Activity Log per user feedback) -->
          <div v-if="entry.submittals && entry.submittals.length > 0">
            <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">My Submittals</div>
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-gray-400 border-b border-gray-100">
                    <th class="text-left py-1.5 pr-3 font-semibold">#</th>
                    <th class="text-left py-1.5 pr-3 font-semibold">Step</th>
                    <th class="text-left py-1.5 pr-3 font-semibold">Bid Value</th>
                    <th class="text-left py-1.5 pr-3 font-semibold">Comment</th>
                    <th class="text-left py-1.5 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(sub, idx) in entry.submittals" :key="sub.id"
                    class="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td class="py-2 pr-3 text-gray-400 font-mono">{{ entry.submittals.length - idx }}</td>
                    <td class="py-2 pr-3">
                      <span v-if="sub.step_name" class="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">{{ sub.step_name }}</span>
                      <span v-else class="text-gray-300">\u2014</span>
                    </td>
                    <td class="py-2 pr-3 font-semibold text-gray-800">
                      <span v-if="sub.bid_value != null">{{ sub.bid_value.toLocaleString() }} {{ sub.bid_currency }}</span>
                      <span v-else class="text-gray-300 font-normal">\u2014</span>
                    </td>
                    <td class="py-2 pr-3 text-gray-600 max-w-xs truncate" :title="sub.comment">{{ sub.comment || '\u2014' }}</td>
                    <td class="py-2 text-gray-400 whitespace-nowrap">{{ sub.submitted_at ? sub.submitted_at.substring(0,10) : '' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Activity log (bidder-visible events) -->
          <div v-if="entry.events.length > 0">
            <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Activity Log</div>
            <div class="space-y-2">
              <div v-for="ev in entry.events" :key="ev.created_at"
                class="flex gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50 text-sm">
                <span :class="eventTypeClass(ev.event_type)" class="inline-block w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"></span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-gray-700 text-xs">{{ eventTypeLabel(ev.event_type) }}</span>
                    <span v-if="ev.step_name" class="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-100">{{ ev.step_name }}</span>
                    <span class="text-xs text-gray-400 ml-auto">{{ ev.created_at ? ev.created_at.substring(0,10) : '' }}</span>
                  </div>
                  <div v-if="ev.comment" class="mt-1 text-gray-600 text-xs">{{ ev.comment }}</div>
                  <div v-if="ev.created_by_name" class="text-xs text-gray-400 mt-0.5">{{ ev.created_by_name }}</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>

  <!-- ── Setup Tab ─────────────────────────────────────────────────────────── -->
  <div v-if="activeTab === 'setup'">
    <div v-if="loading" class="text-center py-8 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else class="space-y-8">

      <!-- ── Procurement Sequence ─────────────────────────────────────────── -->
      <div class="card">
        <div class="flex items-center justify-between p-4 border-b border-gray-100">
          <div>
            <h3 class="text-base font-semibold text-gray-800">Procurement Sequence</h3>
            <p class="text-xs text-gray-500 mt-0.5">The steps of the procurement process and their weight contribution to package progress.</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap justify-end">
            <!-- Total weight indicator -->
            <div :class="['flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold',
              Math.abs(totalWeight - 100) < 0.01
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-600']">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  v-if="Math.abs(totalWeight - 100) < 0.01"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  v-else
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              Total: {{ totalWeight.toFixed(1) }}%
            </div>
            <!-- Validated badge + unvalidate -->
            <template v-if="sequenceValidated">
              <span class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-50 text-emerald-700">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Validated
                <span v-if="sequenceValidatedBy" class="font-normal text-emerald-500 text-xs ml-1">by {{ sequenceValidatedBy }}</span>
              </span>
              <button v-if="canEdit" @click="unvalidateSequence"
                class="btn btn-secondary text-xs">Unvalidate</button>
            </template>
            <!-- Validate button -->
            <button v-if="canEdit && !sequenceValidated && sequenceComplete"
              @click="validateSequence"
              class="btn text-sm font-semibold px-4 py-1.5 rounded-lg text-white"
              style="background:#059669">
              <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
              Validate Sequence
            </button>
            <button v-if="canEditSteps && steps.length > 0" @click="deleteAllSteps"
              class="btn text-sm font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors">Remove All</button>
            <button v-if="canEditSteps" @click="openStepForm(null)"
              class="btn btn-primary text-sm">+ Add Step</button>
          </div>
        </div>

        <div v-if="steps.length === 0" class="p-8 text-center text-gray-400 text-sm">
          No procurement steps defined yet.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                <th class="text-left px-4 py-2 font-semibold w-8">#</th>
                <th class="text-left px-4 py-2 font-semibold w-56">Step</th>
                <th class="text-right px-4 py-2 font-semibold w-24">Weight</th>
                <th class="text-left px-4 py-2 font-semibold">Description</th>
                <th class="px-4 py-2 w-20" v-if="canEditSteps"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(step, idx) in steps" :key="step.id"
                class="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3 text-gray-400 text-xs font-mono">{{ idx + 1 }}</td>
                <td class="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{{ step.step_id }}</td>
                <td class="px-4 py-3 text-right">
                  <span class="inline-flex items-center gap-1">
                    <span class="font-semibold text-gray-800">{{ (step.weight * 100).toFixed(1) }}%</span>
                  </span>
                  <div class="w-full bg-gray-100 rounded-full h-1 mt-1">
                    <div class="h-1 rounded-full bg-blue-400"
                      :style="'width:' + Math.min(step.weight * 100, 100) + '%'"></div>
                  </div>
                </td>
                <td class="px-4 py-3 text-gray-600 max-w-lg">
                  <span class="line-clamp-2 text-sm">{{ step.description || '—' }}</span>
                </td>
                <td class="px-4 py-3" v-if="canEditSteps">
                  <div class="flex gap-1 justify-end">
                    <button @click="openStepForm(step)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                    </button>
                    <button @click="deleteStep(step)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="bg-gray-50 border-t border-gray-200">
                <td colspan="3" class="px-4 py-2 text-xs font-semibold text-gray-500 uppercase text-right">Total</td>
                <td class="px-4 py-2 text-right">
                  <span :class="['font-bold text-sm', Math.abs(totalWeight - 100) < 0.01 ? 'text-green-600' : 'text-red-600']">
                    {{ totalWeight.toFixed(1) }}%
                  </span>
                </td>
                <td v-if="canEditSteps"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div v-if="Math.abs(totalWeight - 100) >= 0.01 && steps.length > 0"
          class="mx-4 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
          <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <span>The total weight must equal <strong>100%</strong>. Current total: <strong>{{ totalWeight.toFixed(1) }}%</strong>. Please adjust the step weights.</span>
        </div>
      </div>

      <!-- ── Contract Types ───────────────────────────────────────────────── -->
      <div class="card">
        <div class="flex items-center justify-between p-4 border-b border-gray-100">
          <div>
            <h3 class="text-base font-semibold text-gray-800">Contract Types</h3>
            <p class="text-xs text-gray-500 mt-0.5">Available contract types for procurement packages.</p>
          </div>
          <div class="flex items-center gap-2">
            <button v-if="canEdit && contractTypes.length > 0" @click="deleteAllContractTypes"
              class="btn text-sm font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors">Remove All</button>
            <button v-if="canEdit" @click="openCtForm(null)"
              class="btn btn-primary text-sm">+ Add Contract Type</button>
          </div>
        </div>

        <div v-if="contractTypes.length === 0" class="p-8 text-center text-gray-400 text-sm">
          No contract types defined yet.
        </div>
        <div v-else class="divide-y divide-gray-50">
          <div v-for="ct in contractTypes" :key="ct.id"
            class="px-4 py-3 hover:bg-gray-50 transition-colors group">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-gray-800 text-sm">{{ ct.name }}</span>
                </div>
                <p v-if="ct.description" class="text-xs text-gray-500 mt-1 line-clamp-2">{{ ct.description }}</p>
              </div>
              <div v-if="canEdit" class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button @click="openCtForm(ct)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </button>
                <button @click="deleteCt(ct)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- ── Bidding Companies Tab ────────────────────────────────────────────── -->
  <div v-if="activeTab === 'companies'">
    <div v-if="planLoading" class="text-center py-8 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else>
      <div class="flex items-center justify-between mb-3">
        <div>
          <h3 class="text-base font-semibold text-gray-800">Bidding Companies</h3>
          <p class="text-xs text-gray-500 mt-0.5">Potential bidders for this project (pre-award). Edit any cell directly; click Save when done.</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-400">{{ biddingCompanies.length }} compan{{ biddingCompanies.length === 1 ? 'y' : 'ies' }}</span>
          <button v-if="canManageCompanies" @click="addNewCompanyRow" class="btn btn-primary text-sm">+ Add Company</button>
        </div>
      </div>

      <div class="card overflow-hidden p-0">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              <th class="text-left px-3 py-2 w-56">Name</th>
              <th class="text-left px-3 py-2 w-56">Website</th>
              <th class="text-left px-3 py-2 w-72">Contacts</th>
              <th class="text-left px-3 py-2 w-72">Linked packages</th>
              <th class="text-right px-3 py-2 w-44"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="companyRows.length === 0">
              <td colspan="5" class="text-center text-gray-400 py-8 text-sm">No bidding companies yet. Click <strong>+ Add Company</strong> to get started.</td>
            </tr>
            <tr v-for="row in companyRows" :key="row.localKey" class="border-b border-gray-100 align-top hover:bg-gray-50/30">
              <!-- Name -->
              <td class="px-3 py-2">
                <input v-if="canManageCompanies" v-model="row.name" type="text" placeholder="e.g. Acme Construction Ltd."
                       class="w-full px-2 py-1 text-sm border border-transparent rounded hover:border-gray-200 focus:border-ips-blue focus:outline-none bg-transparent font-semibold text-gray-800"/>
                <span v-else class="font-semibold text-gray-800 text-sm">{{ row.name }}</span>
              </td>
              <!-- Website -->
              <td class="px-3 py-2">
                <input v-if="canManageCompanies" v-model="row.website" type="url" placeholder="https://…"
                       class="w-full px-2 py-1 text-xs border border-transparent rounded hover:border-gray-200 focus:border-ips-blue focus:outline-none bg-transparent"/>
                <a v-else-if="row.website" :href="row.website" target="_blank" class="text-xs text-ips-blue hover:underline">{{ row.website }}</a>
                <span v-else class="text-xs text-gray-300">—</span>
              </td>
              <!-- Contacts -->
              <td class="px-3 py-2">
                <div v-if="!row.id" class="text-xs text-gray-400 italic">Save the company first to assign contacts.</div>
                <div v-else class="flex flex-wrap items-center gap-1">
                  <span v-if="row.contacts.length === 0" class="text-xs text-gray-300">None</span>
                  <span v-for="c in row.contacts" :key="c.user_id"
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-100">
                    {{ c.name }}
                    <button v-if="canEdit" type="button" @click="removeCompanyContact(row.id, c.user_id)"
                            class="hover:text-red-500 font-bold leading-none" title="Remove contact">×</button>
                  </span>
                  <template v-if="canEdit">
                    <template v-if="addContactCompanyId === row.id">
                      <select v-model="addContactUserId"
                              class="text-xs px-1.5 py-0.5 border border-gray-200 rounded focus:outline-none focus:border-ips-blue">
                        <option :value="null">Select user…</option>
                        <option v-for="u in availableBidderUsersFor(row)" :key="u.id" :value="u.id">
                          {{ u.name }}
                        </option>
                      </select>
                      <button @click="addCompanyContact(row.id)" :disabled="!addContactUserId"
                              class="text-[10px] px-2 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40">Add</button>
                      <button @click="addContactCompanyId = null; addContactUserId = null"
                              class="text-[10px] text-gray-400 hover:text-gray-600">×</button>
                    </template>
                    <button v-else-if="availableBidderUsersFor(row).length > 0"
                            @click="addContactCompanyId = row.id; addContactUserId = null"
                            class="text-xs text-ips-blue hover:underline">+ Add</button>
                  </template>
                </div>
              </td>
              <!-- Linked Packages (inline picker) -->
              <td class="px-3 py-2">
                <div v-if="!row.id" class="text-xs text-gray-400 italic">Save the company first to link packages.</div>
                <template v-else-if="pkgPickerOpenForRow === row.localKey">
                  <div class="border border-gray-200 rounded-lg bg-white p-2">
                    <div class="max-h-44 overflow-y-auto pr-1">
                      <label v-for="p in plans" :key="p.package_id"
                             class="flex items-center gap-2 px-1 py-1 hover:bg-gray-50 rounded cursor-pointer">
                        <input type="checkbox" :checked="row.package_ids.indexOf(p.package_id) !== -1"
                               @change="togglePackageForRow(row, p.package_id)"
                               class="rounded border-gray-300"/>
                        <span class="text-xs"><strong>{{ p.package_tag }}</strong> <span class="text-gray-400">— {{ p.package_name }}</span></span>
                      </label>
                      <div v-if="plans.length === 0" class="text-xs text-gray-400 px-1 py-2">No packages available.</div>
                    </div>
                    <div class="flex justify-end gap-1.5 pt-1.5 mt-1.5 border-t border-gray-100">
                      <button @click="cancelPackagePicker(row)" class="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                      <button @click="saveCompanyPackages(row)" :disabled="companyRowSaving[row.localKey]"
                              class="text-xs px-2 py-0.5 rounded bg-ips-blue text-white hover:opacity-90 disabled:opacity-40">
                        {{ companyRowSaving[row.localKey] ? 'Saving…' : 'Save links' }}
                      </button>
                    </div>
                  </div>
                </template>
                <div v-else class="flex flex-wrap items-center gap-1">
                  <span v-if="row.package_ids.length === 0" class="text-xs text-gray-300">None</span>
                  <span v-for="pid in row.package_ids" :key="pid"
                        class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style="background:#1B4F8C">{{ packageDisplay(pid) }}</span>
                  <button v-if="canManageCompanies" @click="pkgPickerOpenForRow = row.localKey"
                          class="text-xs text-ips-blue hover:underline ml-1">{{ row.package_ids.length === 0 ? '+ Link' : 'Edit' }}</button>
                </div>
              </td>
              <!-- Actions -->
              <td class="px-3 py-2 text-right whitespace-nowrap">
                <div class="flex justify-end items-center gap-1">
                  <span v-if="companyRowError[row.localKey]" class="text-xs text-red-500 mr-1" :title="companyRowError[row.localKey]">!</span>
                  <button v-if="canManageCompanies && isCompanyRowDirty(row)"
                          @click="saveCompanyRow(row)" :disabled="companyRowSaving[row.localKey]"
                          class="text-xs px-2 py-1 rounded bg-ips-blue text-white hover:opacity-90 disabled:opacity-40 font-semibold">
                    {{ companyRowSaving[row.localKey] ? 'Saving…' : 'Save' }}
                  </button>
                  <button v-if="canManageCompanies && isCompanyRowDirty(row)"
                          @click="discardCompanyRow(row)"
                          class="text-xs px-2 py-1 rounded text-gray-500 hover:text-gray-700">
                    Discard
                  </button>
                  <button v-if="canEdit"
                          @click="deleteCompanyRow(row)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
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
    </div>
  </div>

  <!-- ── Procurement Plan Tab ─────────────────────────────────────────────── -->
  <div v-if="activeTab === 'plan'">
    <div v-if="planLoading" class="text-center py-8 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>

    <!-- Sequence not validated -->
    <div v-else-if="!sequenceValidated"
      class="card p-10 text-center max-w-lg mx-auto mt-8">
      <svg class="w-12 h-12 text-amber-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
      </svg>
      <h3 class="text-lg font-semibold text-gray-800 mb-2">Procurement Sequence Not Yet Validated</h3>
      <p class="text-gray-500 text-sm mb-5">
        The Procurement Sequence must be finalised and validated before the Procurement Plan can be developed.
        Changes to the sequence after planning would require all package plans to be redone.
      </p>
      <button @click="activeTab = 'setup'" class="btn btn-primary text-sm">
        Go to Setup &rarr; Validate Sequence
      </button>
    </div>

    <div v-else class="space-y-4 pb-8">

    <!-- Package plan table header with export/import -->
    <div v-if="canEdit" class="flex items-center justify-end gap-2 mb-2">
      <button @click="exportPlanExcel" :disabled="planExporting" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        {{ planExporting ? 'Exporting...' : 'Export Excel' }}
      </button>
      <button @click="openProcImportModal" class="btn-secondary text-sm flex items-center gap-1">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 4v12m0-4l-3 3m3-3l3 3"/></svg>
        Import Plan
      </button>
    </div>

    <!-- Package plan table -->
    <div v-if="plans.length === 0" class="empty-state">
      <p class="text-gray-500">No packages found. Add packages in the Budget module first.</p>
    </div>
    <div v-else class="card overflow-hidden p-0">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <th class="text-left px-4 py-3 font-semibold whitespace-nowrap">Package</th>
              <th class="text-left px-4 py-3 font-semibold whitespace-nowrap">Owner</th>
              <th class="text-left px-4 py-3 font-semibold whitespace-nowrap">Contract Type</th>
              <th class="text-right px-4 py-3 font-semibold whitespace-nowrap">Budget</th>
              <th class="text-right px-4 py-3 font-semibold whitespace-nowrap">Weight</th>
              <th class="text-left px-4 py-3 font-semibold whitespace-nowrap">Bidding Companies</th>
              <th class="text-left px-4 py-3 font-semibold whitespace-nowrap">Due Dates</th>
              <th class="text-left px-4 py-3 font-semibold whitespace-nowrap">Proc. Progress</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="plan in plans" :key="plan.package_id">
              <!-- Main row (click to open edit modal) -->
              <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  :class="[canEditPlan(plan) ? 'cursor-pointer' : '', plan.not_applicable ? 'bg-gray-50 text-gray-400 italic' : '']"
                  @click="canEditPlan(plan) ? openPlanEdit(plan) : null">
                <!-- Package -->
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                         :class="plan.not_applicable ? 'bg-gray-300' : 'bg-ips-dark'">
                      <span class="text-white text-xs font-bold">{{ (plan.package_tag || '').substring(0, 3) }}</span>
                    </div>
                    <div>
                      <div class="font-semibold whitespace-nowrap"
                           :class="plan.not_applicable ? 'text-gray-400' : 'text-gray-800'">
                        {{ plan.package_tag }}
                        <span v-if="plan.not_applicable" class="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-200 text-gray-600 not-italic">N/A</span>
                      </div>
                      <div v-if="plan.package_name" class="text-xs truncate max-w-[130px]"
                           :class="plan.not_applicable ? 'text-gray-300' : 'text-gray-400'">{{ plan.package_name }}</div>
                    </div>
                  </div>
                </td>
                <!-- Owner -->
                <td class="px-4 py-3 text-gray-600 whitespace-nowrap">{{ plan.package_owner_name || '—' }}</td>
                <!-- Contract Type -->
                <td class="px-4 py-3 text-gray-600 whitespace-nowrap">{{ plan.contract_type_name || '—' }}</td>
                <!-- Budget -->
                <td class="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{{ fmtCurrency(plan.forecast, plan.currency) }}</td>
                <!-- Financial Weight -->
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <span class="font-semibold text-ips-blue">{{ plan.financial_weight_pct.toFixed(1) }}%</span>
                  <div class="w-14 bg-gray-100 rounded-full h-1 mt-1 ml-auto">
                    <div class="h-1 rounded-full bg-ips-blue"
                      :style="'width:' + Math.min(plan.financial_weight_pct, 100) + '%'"></div>
                  </div>
                </td>
                <!-- Bidding Companies -->
                <td class="px-4 py-3 max-w-[180px]">
                  <div v-if="!plan.bidding_company_ids || plan.bidding_company_ids.length === 0"
                    class="text-gray-300 text-xs">—</div>
                  <div v-else class="flex flex-wrap gap-1">
                    <span v-for="cid in plan.bidding_company_ids" :key="cid"
                      class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100 whitespace-nowrap">
                      {{ companyDisplay(cid) }}
                    </span>
                  </div>
                </td>
                <!-- Due dates (all steps in one cell) -->
                <td class="px-4 py-3">
                  <template v-for="step in steps" :key="step.id">
                    <div v-if="plan.step_dates && plan.step_dates[String(step.id)]"
                      class="flex items-center gap-1.5 text-xs">
                      <span class="text-gray-500 font-medium">{{ step.step_id }}:</span>
                      <span class="text-blue-700 font-semibold">{{ plan.step_dates[String(step.id)] }}</span>
                    </div>
                  </template>
                  <span v-if="!planHasDates(plan)" class="text-gray-300 text-xs">—</span>
                </td>
                <!-- Procurement Progress -->
                <td class="px-4 py-3">
                  <div v-if="plan.procurement_progress > 0 || plan.bidding_company_ids.length > 0">
                    <div class="flex items-center gap-1.5">
                      <div class="w-16 bg-gray-100 rounded-full h-1.5">
                        <div class="h-1.5 rounded-full bg-ips-blue"
                          :style="'width:' + Math.min(plan.procurement_progress, 100) + '%'"></div>
                      </div>
                      <span class="text-xs font-semibold text-gray-700">{{ plan.procurement_progress.toFixed(0) }}%</span>
                    </div>
                  </div>
                  <span v-else class="text-gray-300 text-xs">—</span>
                </td>
                <!-- Actions -->
                <td class="px-4 py-3 text-right" @click.stop>
                  <button v-if="canEditPlan(plan)"
                          @click="openPlanEdit(plan)"
                          class="btn btn-secondary text-xs whitespace-nowrap">Edit</button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
    </div>
  </div>

  <!-- ── Procurement Register Tab ────────────────────────────────────────── -->
  <div v-if="activeTab === 'register'">
    <div class="flex items-center justify-end gap-2 mb-3">
      <button v-if="register.length > 0" @click="toggleAllRegisterCollapse"
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                :d="allRegisterCollapsed() ? 'M19 9l-7 7-7-7' : 'M5 15l7-7 7 7'"/>
        </svg>
        {{ allRegisterCollapsed() ? 'Expand all' : 'Collapse all' }}
      </button>
      <button @click="exportExcel" :disabled="exporting" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
        </svg>
        {{ exporting ? 'Exporting...' : 'Export Excel' }}
      </button>
    </div>
    <div v-if="registerLoading" class="text-center py-8 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
    <div v-else-if="register.length === 0" class="card p-10 text-center">
      <p class="text-gray-500 mb-1">No packages with bidding companies in the register yet.</p>
      <p class="text-sm text-gray-400">Assign bidding companies to packages in the Procurement Plan tab first.</p>
    </div>
    <div v-else class="space-y-6 pb-8">
      <!-- Overall procurement progress -->
      <div class="card p-4 flex items-center gap-5">
        <div class="shrink-0">
          <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Overall Procurement Progress</div>
          <div class="flex items-end gap-2">
            <span class="text-3xl font-bold text-ips-blue">{{ registerOverallProgress.toFixed(0) }}%</span>
            <span class="text-xs text-gray-400 mb-1">budget-weighted avg of active companies</span>
          </div>
        </div>
        <div class="flex-1">
          <div class="w-full bg-gray-100 rounded-full h-3">
            <div class="h-3 rounded-full bg-ips-blue transition-all"
              :style="'width:' + Math.min(registerOverallProgress, 100) + '%'"></div>
          </div>
        </div>
      </div>
      <div v-for="pkg in register" :key="pkg.package_id" class="card overflow-hidden p-0">
        <!-- Package header (click to collapse/expand) -->
        <div class="flex items-center justify-between px-5 py-3 bg-ips-dark cursor-pointer select-none hover:bg-ips-dark/90"
             @click="togglePackageCollapse(pkg.package_id)">
          <div class="flex items-center gap-3">
            <svg class="w-4 h-4 text-white/60 transition-transform shrink-0"
                 :class="isPackageCollapsed(pkg.package_id) ? '' : 'rotate-90'"
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
            <div class="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <span class="text-white text-xs font-bold">{{ (pkg.package_tag || '').substring(0, 3) }}</span>
            </div>
            <div>
              <div class="font-semibold text-white">{{ pkg.package_tag }}<span v-if="pkg.package_name" class="font-normal text-white/70 ml-2 text-sm">{{ pkg.package_name }}</span></div>
              <div class="text-xs text-white/60">Budget: {{ fmtCurrency(pkg.forecast, pkg.currency) }}</div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div v-if="pkg.bid_value != null" class="text-right border-r border-white/15 pr-3">
              <div class="text-xs text-white/60 mb-0.5">Bid Value</div>
              <div class="text-sm font-bold text-white">{{ fmtCurrency(pkg.bid_value, pkg.currency) }}</div>
              <div class="text-xs mt-0.5" :class="pkg.bid_status === 'AWARDED' ? 'text-emerald-300' : 'text-sky-300'">
                {{ pkg.bid_status === 'AWARDED' ? 'Awarded' : 'In Progress' }}
              </div>
            </div>
            <div class="text-right">
              <div class="text-xs text-white/60 mb-0.5">Package Progress</div>
              <div class="text-sm font-bold text-white">{{ pkg.package_progress.toFixed(0) }}%</div>
            </div>
            <div class="w-24 bg-white/20 rounded-full h-2">
              <div class="h-2 rounded-full bg-white transition-all"
                :style="'width:' + Math.min(pkg.package_progress, 100) + '%'"></div>
            </div>
          </div>
          <span class="text-xs text-white/50">{{ pkg.entries.length }} compan{{ pkg.entries.length === 1 ? 'y' : 'ies' }}</span>
        </div>
        <!-- Company table -->
        <div v-if="!isPackageCollapsed(pkg.package_id)" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                <th class="text-left px-4 py-2 font-semibold">Company</th>
                <th class="text-left px-4 py-2 font-semibold">Current Step</th>
                <th class="text-left px-4 py-2 font-semibold w-36">Progress</th>
                <th class="text-left px-4 py-2 font-semibold">Status</th>
                <th class="text-center px-4 py-2 font-semibold">Technical</th>
                <th class="text-center px-4 py-2 font-semibold">Commercial</th>
                <th class="text-right px-4 py-2 font-semibold">Bid Value</th>
                <th class="text-right px-4 py-2 font-semibold">vs Budget</th>
                <th class="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in pkg.entries" :key="entry.id"
                @click="openEntryView(entry, pkg)"
                class="border-b border-gray-100 last:border-0 transition-colors cursor-pointer"
                :class="entry.status === 'EXCLUDED' ? 'bg-gray-50 opacity-60' : entry.status === 'AWARDED' ? 'bg-emerald-50' : 'hover:bg-gray-50'">
                <!-- Company -->
                <td class="px-4 py-3 font-medium text-gray-800">
                  {{ entry.company_name }}
                  <span v-if="entry.has_current_step_submittal"
                    class="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100"
                    title="Bidder submitted in current step">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    Submitted
                  </span>
                </td>
                <!-- Current Step -->
                <td class="px-4 py-3">
                  <div class="flex items-center gap-1">
                    <button v-if="canEditEntry(entry, pkg) && entry.prev_step_id && entry.status !== 'EXCLUDED' && entry.status !== 'AWARDED'"
                      @click.stop="openStepAction(entry, pkg, 'revert')"
                      class="p-0.5 rounded text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                      title="Revert to previous step">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                    </button>
                    <span v-if="entry.current_step_name" class="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">{{ entry.current_step_name }}</span>
                    <span v-else class="text-gray-300 text-xs">\u2014</span>
                    <button v-if="canEditEntry(entry, pkg) && entry.next_step_id && entry.status !== 'EXCLUDED' && entry.status !== 'AWARDED'"
                      @click.stop="openStepAction(entry, pkg, 'advance')"
                      class="p-0.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Advance to next step">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                    </button>
                  </div>
                </td>
                <!-- Progress -->
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <div class="flex-1 bg-gray-100 rounded-full h-2 min-w-[60px]">
                      <div class="h-2 rounded-full transition-all"
                        :class="entry.status === 'AWARDED' ? 'bg-emerald-500' : entry.status === 'EXCLUDED' ? 'bg-gray-400' : 'bg-ips-blue'"
                        :style="'width:' + Math.min(entry.progress_pct, 100) + '%'"></div>
                    </div>
                    <span class="text-xs text-gray-500 whitespace-nowrap">{{ entry.progress_pct.toFixed(0) }}%</span>
                  </div>
                </td>
                <!-- Status -->
                <td class="px-4 py-3">
                  <span :class="statusBadgeClass(entry.status)"
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold">
                    {{ statusLabel(entry.status) }}
                  </span>
                  <div v-if="entry.status === 'EXCLUDED' && entry.exclusion_reason"
                    class="text-xs text-red-500 mt-0.5 max-w-[140px] truncate" :title="entry.exclusion_reason">
                    {{ entry.exclusion_reason }}
                  </div>
                </td>
                <!-- Technical compliance -->
                <td class="px-4 py-3 text-center">
                  <span :class="complianceBadgeClass(entry.technical_compliance)"
                    class="inline-block px-2 py-0.5 rounded text-xs font-semibold">
                    {{ complianceLabel(entry.technical_compliance) }}
                  </span>
                  <div v-if="entry.technical_compliance_note" class="text-xs text-gray-400 mt-0.5 max-w-[100px] truncate" :title="entry.technical_compliance_note">{{ entry.technical_compliance_note }}</div>
                </td>
                <!-- Commercial compliance -->
                <td class="px-4 py-3 text-center">
                  <span :class="complianceBadgeClass(entry.commercial_compliance)"
                    class="inline-block px-2 py-0.5 rounded text-xs font-semibold">
                    {{ complianceLabel(entry.commercial_compliance) }}
                  </span>
                  <div v-if="entry.commercial_compliance_note" class="text-xs text-gray-400 mt-0.5 max-w-[100px] truncate" :title="entry.commercial_compliance_note">{{ entry.commercial_compliance_note }}</div>
                </td>
                <!-- Bid value -->
                <td class="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                  <span v-if="entry.bid_value != null">{{ fmtCurrency(entry.bid_value, entry.bid_currency) }}</span>
                  <span v-else class="text-gray-300 text-xs font-normal">\u2014</span>
                </td>
                <!-- vs Budget -->
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <template v-if="entry.bid_value != null && pkg.forecast > 0">
                    <div :class="bidVsBudgetClass(entry.bid_value, pkg.forecast)" class="text-xs font-semibold">
                      {{ (entry.bid_value / pkg.forecast * 100).toFixed(1) }}%
                    </div>
                    <div class="text-xs text-gray-400">of budget</div>
                  </template>
                  <span v-else class="text-gray-300 text-xs">\u2014</span>
                </td>
                <!-- Actions -->
                <td class="px-4 py-3">
                  <div class="flex gap-1 justify-end">
                    <button v-if="canEditEntry(entry, pkg)"
                      @click.stop="openRegisterEdit(entry, pkg)"
                      class="btn btn-secondary text-xs whitespace-nowrap">Edit</button>
                    <button @click.stop="openEvents(entry)"
                      class="btn btn-secondary text-xs whitespace-nowrap">Log</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Register Edit Modal ───────────────────────────────────────────────── -->
  <div v-if="editingEntry" class="modal-overlay" @click.self="editingEntry = null">
    <div class="modal-box modal-xl" style="max-width:min(1100px,95vw) !important">
      <div class="modal-header">
        <div>
          <h3 class="text-lg font-semibold text-gray-800">{{ editingEntry.company_name }}</h3>
          <p class="text-sm text-gray-500">{{ editingEntryPkg ? editingEntryPkg.package_tag + (editingEntryPkg.package_name ? ' \u2014 ' + editingEntryPkg.package_name : '') : '' }}</p>
        </div>
        <button @click="editingEntry = null" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body" style="padding:0;display:flex;overflow:hidden">
      <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
      <div class="space-y-4">
        <div>
          <label class="form-label">Status</label>
          <select v-model="registerForm.status" class="input-field">
            <option value="COMPETING">Competing</option>
            <option value="AWAITING">Awaiting Feedback</option>
            <option value="EXCLUDED">Excluded</option>
          </select>
          <p class="text-xs text-gray-400 mt-1">Use the step arrow buttons on the register table to advance or revert the procurement step.</p>
        </div>
        <!-- Exclusion reason (required when status = EXCLUDED) -->
        <div v-if="registerForm.status === 'EXCLUDED'" class="p-3 rounded-lg bg-red-50 border border-red-200">
          <label class="form-label text-red-700">Exclusion Reason <span class="text-red-500">*</span></label>
          <textarea v-model="registerForm.exclusion_reason" class="input-field border-red-200 focus:border-red-400" rows="2"
            placeholder="Required: explain why this company is being excluded\u2026"></textarea>
        </div>
        <!-- Technical compliance -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Technical Compliance</label>
            <select v-model="registerForm.technical_compliance" class="input-field">
              <option :value="null">\u2014 Not set \u2014</option>
              <option value="PENDING">Pending</option>
              <option value="PASS">Pass</option>
              <option value="FAIL">Fail</option>
              <option value="NA">N/A</option>
            </select>
            <textarea v-if="registerForm.technical_compliance && registerForm.technical_compliance !== 'NA'"
              v-model="registerForm.technical_compliance_note" class="input-field mt-1 text-sm" rows="2"
              placeholder="Details (optional)\u2026"></textarea>
          </div>
          <div>
            <label class="form-label">Commercial Compliance</label>
            <select v-model="registerForm.commercial_compliance" class="input-field">
              <option :value="null">\u2014 Not set \u2014</option>
              <option value="PENDING">Pending</option>
              <option value="PASS">Pass</option>
              <option value="FAIL">Fail</option>
              <option value="NA">N/A</option>
            </select>
            <textarea v-if="registerForm.commercial_compliance && registerForm.commercial_compliance !== 'NA'"
              v-model="registerForm.commercial_compliance_note" class="input-field mt-1 text-sm" rows="2"
              placeholder="Details (optional)\u2026"></textarea>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Bid Value</label>
            <input v-model.number="registerForm.bid_value" type="number" step="0.01" class="input-field" placeholder="0.00"/>
          </div>
          <div>
            <label class="form-label">Bid Currency</label>
            <select v-model="registerForm.bid_currency" class="input-field">
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
        </div>
        <div>
          <label class="form-label">Comment <span class="text-gray-400 font-normal">(optional, added to event log)</span></label>
          <textarea v-model="registerForm.comment" class="input-field" rows="2" placeholder="Add a note about this update\u2026"></textarea>
        </div>
        <p v-if="registerError" class="text-red-500 text-sm">{{ registerError }}</p>
        <!-- Award section -->
        <!-- Create order from award -->
        <div v-if="editingEntry.status === 'AWARDED'" class="pt-2 border-t border-gray-100">
          <button @click="openCreateOrderModal(editingEntry)"
            class="btn text-sm font-semibold px-4 py-1.5 rounded-lg text-white flex items-center gap-1.5"
            style="background:#2563eb">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Create Budget Order
          </button>
          <p class="text-xs text-gray-400 mt-1">Create a committed order in Budget Management for this awarded company.</p>
        </div>
        <div v-if="editingEntry.status !== 'AWARDED'" class="pt-2 border-t border-gray-100">
          <div v-if="!awardingEntry">
            <button @click="awardingEntry = editingEntry"
              class="btn text-sm font-semibold px-4 py-1.5 rounded-lg text-white"
              style="background:#059669">
              <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Award Contract
            </button>
            <p class="text-xs text-gray-400 mt-1">This will mark this company as awarded and exclude all other competing companies for this package.</p>
          </div>
          <div v-else class="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <p class="text-sm font-semibold text-emerald-800 mb-2">Confirm award to {{ editingEntry.company_name }}?</p>
            <textarea v-model="awardComment" class="input-field text-sm mb-2" rows="2" placeholder="Award comment (optional)\u2026"></textarea>
            <div class="flex gap-2">
              <button @click="confirmAward" class="btn text-sm px-4 py-1.5 rounded-lg text-white font-semibold" style="background:#059669">Confirm Award</button>
              <button @click="awardingEntry = null; awardComment = ''" class="btn btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        </div>
      </div><!-- end space-y-4 -->
      </div><!-- end left column -->
      <div class="w-[39rem] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>

        <!-- Tab strip — Project documents / Bidder documents -->
        <div class="flex gap-0 mb-3 border-b border-gray-200">
          <button @click="registerAttTab = 'project'"
                  :class="['px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                            registerAttTab === 'project'
                              ? 'border-ips-blue text-ips-dark'
                              : 'border-transparent text-gray-500 hover:text-gray-700']">
            Project documents
            <span class="ml-1 text-[10px] text-gray-400">{{ projectAttachments(editingEntry.id).length }}</span>
          </button>
          <button @click="registerAttTab = 'bidder'"
                  :class="['px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                            registerAttTab === 'bidder'
                              ? 'border-amber-500 text-amber-700'
                              : 'border-transparent text-gray-500 hover:text-gray-700']">
            Bidder documents
            <span class="ml-1 text-[10px] text-gray-400">{{ myAttachments(editingEntry.id).length }}</span>
          </button>
        </div>

        <div v-if="bidderAttLoading[editingEntry.id]" class="py-3 text-center text-gray-400">
          <img src="/static/assets/impulse-loader.svg" class="h-5 mx-auto" alt="Loading"/>
        </div>

        <!-- Project documents tab -->
        <div v-else-if="registerAttTab === 'project'">
          <div v-if="projectAttachments(editingEntry.id).length === 0" class="text-xs text-gray-400 italic mb-3 px-1">No project documents yet.</div>
          <div v-else class="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100 mb-3">
            <div v-for="g in groupByStep(projectAttachments(editingEntry.id))" :key="'rp-'+(g.step_id || 'none')" class="px-3 py-2">
              <div class="flex items-center justify-between mb-1">
                <button @click="toggleStep('register-project', g)"
                        class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800">
                  <svg :class="['w-3 h-3 transition-transform', isStepExpanded('register-project', g) ? 'rotate-90' : '']"
                       fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                  </svg>
                  <span>{{ g.step_name || 'No step' }}</span>
                  <span class="ml-1 text-[10px] text-gray-400 normal-case font-normal">({{ g.files.length }})</span>
                </button>
                <button v-if="g.files.length > 1" @click.stop="downloadStepZip(g, 'project', editingEntryPkg ? editingEntryPkg.package_tag : '')"
                        class="text-[10px] text-ips-blue hover:underline" title="Download all files in this step">
                  Download all ({{ g.files.length }})
                </button>
              </div>
              <div v-show="isStepExpanded('register-project', g)" class="space-y-1">
                <div v-for="att in g.files" :key="att.id" class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 text-sm">
                  <span class="text-base shrink-0">{{ bidderFileIcon(att) }}</span>
                  <span class="flex-1 truncate text-xs font-medium text-gray-800" :title="att.original_filename">{{ att.original_filename }}</span>
                  <span class="text-[10px] text-gray-400 shrink-0">{{ bidderFmtDate(att.uploaded_at) }}</span>
                  <button @click="bidderViewFile(att)" class="text-gray-400 hover:text-ips-blue" title="View"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></button>
                  <button @click="bidderDownloadFile(att)" class="text-gray-400 hover:text-ips-blue" title="Download"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg></button>
                  <button @click="registerDeleteFile(editingEntry.id, att)" class="text-gray-300 hover:text-red-500" title="Delete"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                </div>
              </div>
            </div>
          </div>

          <!-- Project upload zone -->
          <input ref="registerUploadInput" type="file" multiple class="hidden" @change="registerUploadFiles($event)"/>
          <div
            @dragover.prevent="registerDragOver = true"
            @dragleave.prevent="registerDragOver = false"
            @drop.prevent="registerDropFiles($event)"
            @click="$refs.registerUploadInput.click()"
            :class="['border-2 border-dashed rounded-lg px-3 py-3 text-center cursor-pointer transition-colors text-xs',
                     registerDragOver ? 'border-ips-blue bg-blue-50 text-ips-blue' : 'border-gray-200 text-gray-500 hover:border-gray-300']">
            <span v-if="registerUploading">
              <svg class="w-4 h-4 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Uploading…
            </span>
            <span v-else class="font-semibold inline-flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12m0-12l-3 3m3-3l3 3"/></svg>
              Drop files here or click to upload
            </span>
          </div>
          <p class="text-[10px] text-gray-400 mt-1">Will be tagged to <strong>{{ editingEntry.current_step_name || 'the current step' }}</strong>.</p>
        </div>

        <!-- Bidder documents tab — read-only listing for project users -->
        <div v-else>
          <div v-if="myAttachments(editingEntry.id).length === 0" class="text-xs text-gray-400 italic px-1">No bidder documents uploaded yet.</div>
          <div v-else class="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            <div v-for="g in groupByStep(myAttachments(editingEntry.id))" :key="'rb-'+(g.step_id || 'none')" class="px-3 py-2">
              <div class="flex items-center justify-between mb-1">
                <button @click="toggleStep('register-bidder', g)"
                        class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 hover:text-amber-900">
                  <svg :class="['w-3 h-3 transition-transform', isStepExpanded('register-bidder', g) ? 'rotate-90' : '']"
                       fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                  </svg>
                  <span>{{ g.step_name || 'No step' }}</span>
                  <span class="ml-1 text-[10px] text-amber-600 normal-case font-normal">({{ g.files.length }})</span>
                </button>
                <button v-if="g.files.length > 1" @click.stop="downloadStepZip(g, 'bidder', editingEntryPkg ? editingEntryPkg.package_tag : '')"
                        class="text-[10px] text-amber-700 hover:underline" title="Download all files in this step">
                  Download all ({{ g.files.length }})
                </button>
              </div>
              <div v-show="isStepExpanded('register-bidder', g)" class="space-y-1">
                <div v-for="att in g.files" :key="att.id" class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 text-sm">
                  <span class="text-base shrink-0">{{ bidderFileIcon(att) }}</span>
                  <span class="flex-1 truncate text-xs font-medium text-gray-800" :title="att.original_filename">{{ att.original_filename }}</span>
                  <span class="text-[10px] text-gray-400 shrink-0">{{ bidderFmtDate(att.uploaded_at) }}</span>
                  <button @click="bidderViewFile(att)" class="text-gray-400 hover:text-ips-blue" title="View"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></button>
                  <button @click="bidderDownloadFile(att)" class="text-gray-400 hover:text-ips-blue" title="Download"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div><!-- end modal-body -->
      <div class="modal-footer">
        <button @click="editingEntry = null" class="btn-secondary">Cancel</button>
        <button @click="saveRegisterEntry" :disabled="registerSaving" class="btn-primary">
          {{ registerSaving ? 'Saving\u2026' : 'Save Changes' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Create Budget Order from Award Modal ──────────────────────────── -->
  <div v-if="showCreateOrderModal && createOrderEntry" class="modal-overlay" @click.self="handleCreateOrderOverlayClick">
    <div class="modal-box" style="max-width:500px">
      <div class="modal-header">
        <div>
          <h3 class="text-base font-semibold text-gray-800">Create Budget Order</h3>
          <p class="text-sm text-gray-500">{{ createOrderEntry.company_name }}</p>
        </div>
        <button v-if="!createOrderForced || createOrderDone" @click="closeCreateOrderModal" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body space-y-4">
        <!-- Success state -->
        <div v-if="createOrderDone" class="flex flex-col items-center py-6 gap-3 text-center">
          <svg class="w-12 h-12 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <p class="text-base font-semibold text-gray-800">Order created successfully</p>
          <p class="text-sm text-gray-500">The order has been added to Budget Management.</p>
          <button @click="closeCreateOrderModal" class="btn btn-secondary mt-2">Close</button>
        </div>
        <template v-else>
          <div v-if="createOrderForced" class="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <span class="font-semibold">Award confirmed.</span> Create the corresponding budget order to complete the procurement flow. You can adjust the amount before confirming.
          </div>
          <div class="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800 space-y-1">
            <div class="font-semibold">{{ createOrderEntry.company_name }}</div>
            <div class="text-blue-600 text-xs">Package: {{ createOrderEntryPkgLabel }}</div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="form-label">Vendor Name</label>
              <input type="text" :value="createOrderEntry.company_name" disabled class="input-field bg-gray-50 text-gray-500 cursor-not-allowed">
            </div>
            <div>
              <label class="form-label">PO Number <span class="text-red-500">*</span></label>
              <input type="text" v-model="createOrderForm.po_number" class="input-field" placeholder="e.g. PO-2026-001">
            </div>
          </div>
          <div>
            <label class="form-label">Description</label>
            <textarea v-model="createOrderForm.description" class="input-field" rows="2"></textarea>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div class="col-span-2">
              <label class="form-label">Amount</label>
              <input type="number" v-model.number="createOrderForm.amount" class="input-field" min="0" step="0.01">
            </div>
            <div>
              <label class="form-label">Currency</label>
              <input :value="projectCurrency" class="input-field bg-gray-50" readonly>
            </div>
          </div>
          <div>
            <label class="form-label">Order Date</label>
            <input type="date" v-model="createOrderForm.order_date" class="input-field">
          </div>
          <div class="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
            <input type="checkbox" v-model="createOrderForm.assign_vendor_role" id="assignVendorRole" class="mt-0.5 w-4 h-4 rounded accent-ips-blue shrink-0">
            <div>
              <label for="assignVendorRole" class="text-sm font-medium text-gray-800 cursor-pointer">Assign Vendor role to company contacts</label>
              <p class="text-xs text-gray-500 mt-0.5">Updates the project role of all contacts linked to this bidding company to "Vendor" and adds them as linked contacts to the package.</p>
            </div>
          </div>
          <p v-if="createOrderError" class="text-red-500 text-sm">{{ createOrderError }}</p>
        </template>
      </div>
      <div v-if="!createOrderDone" class="modal-footer">
        <button v-if="!createOrderForced" @click="closeCreateOrderModal" class="btn-secondary">Cancel</button>
        <button @click="submitCreateOrder" :disabled="createOrderSaving" class="btn-primary">
          {{ createOrderSaving ? 'Creating…' : 'Confirm &amp; Create Order' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Step Action Modal ────────────────────────────────────────────────── -->
  <div v-if="stepActionEntry" class="modal-overlay" @click.self="stepActionEntry = null">
    <div class="modal-box" style="max-width:460px">
      <div class="modal-header">
        <div>
          <h3 class="text-base font-semibold text-gray-800">{{ stepActionDir === 'advance' ? 'Advance to next step' : 'Revert to previous step' }}</h3>
          <p class="text-sm text-gray-500">{{ stepActionEntry.company_name }}</p>
        </div>
        <button @click="stepActionEntry = null" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body space-y-4">
        <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100 text-sm">
          <span class="text-gray-500 shrink-0">From</span>
          <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">{{ stepActionEntry.current_step_name || '\u2014' }}</span>
          <svg class="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          <span class="text-gray-500 shrink-0">To</span>
          <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
            {{ stepActionDir === 'advance' ? stepActionEntry.next_step_name : stepActionEntry.prev_step_name }}
          </span>
        </div>
        <div>
          <label class="form-label">Comment <span class="text-gray-400 font-normal">(optional \u2014 recorded in event log with your name and date)</span></label>
          <textarea v-model="stepActionComment" class="input-field" rows="2" placeholder="Add a note about this step transition\u2026"></textarea>
        </div>
        <p v-if="stepActionError" class="text-red-500 text-sm">{{ stepActionError }}</p>
      </div>
      <div class="modal-footer">
        <button @click="stepActionEntry = null" class="btn-secondary">Cancel</button>
        <button @click="confirmStepAction" :disabled="stepActionSaving"
          :class="stepActionDir === 'revert' ? 'btn text-sm font-semibold px-4 py-1.5 rounded-lg text-white bg-orange-500 hover:bg-orange-600' : 'btn-primary'">
          {{ stepActionSaving ? 'Saving\u2026' : (stepActionDir === 'advance' ? 'Advance Step' : 'Revert Step') }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Event Log Modal ───────────────────────────────────────────────────── -->
  <div v-if="showEventsEntry" class="modal-overlay" @click.self="showEventsEntry = null">
    <div class="modal-box modal-lg">
      <div class="modal-header">
        <div>
          <h3 class="text-lg font-semibold text-gray-800">Event Log</h3>
          <p class="text-sm text-gray-500">{{ showEventsEntry.company_name }}</p>
        </div>
        <button @click="showEventsEntry = null" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div v-if="eventsLoading" class="text-center py-6 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
        <div v-else-if="entryEvents.length === 0" class="text-center py-6 text-gray-400">No events recorded yet.</div>
        <div v-else class="space-y-2">
          <div v-for="ev in entryEvents" :key="ev.id"
            class="flex gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50 text-sm">
            <div class="mt-0.5 shrink-0">
              <span :class="eventTypeClass(ev.event_type)" class="inline-block w-2.5 h-2.5 rounded-full mt-1"></span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-gray-700">{{ eventTypeLabel(ev.event_type) }}</span>
                <template v-if="(ev.event_type === 'STEP_ADVANCE' || ev.event_type === 'STEP_REVERT') && ev.step_name">
                  <span class="text-gray-400">\u2192</span>
                  <span :class="ev.event_type === 'STEP_REVERT' ? 'px-1.5 py-0.5 rounded text-xs bg-orange-50 text-orange-700 border border-orange-100' : 'px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-100'">{{ ev.step_name }}</span>
                </template>
                <template v-if="(ev.event_type === 'STATUS_CHANGE' || ev.event_type === 'AWARD') && ev.new_status">
                  <span class="text-gray-400">\u2192</span>
                  <span :class="statusBadgeClass(ev.new_status)" class="px-2 py-0.5 rounded-full text-xs font-semibold">{{ statusLabel(ev.new_status) }}</span>
                </template>
              </div>
              <p v-if="ev.comment" class="text-gray-600 mt-0.5">{{ ev.comment }}</p>
              <p class="text-xs text-gray-400 mt-0.5">{{ ev.created_by_name || '\u2014' }} \u00b7 {{ fmtDateTime(ev.created_at) }}</p>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button @click="showEventsEntry = null" class="btn-secondary">Close</button>
      </div>
    </div>
  </div>

  <!-- ── Procurement Plan Edit Modal ─────────────────────────────────────── -->
  <div v-if="showPlanModal && editingPlan()" class="modal-overlay" @click.self="cancelPlanEdit">
    <div class="modal-box modal-xl" style="max-width:min(1100px,95vw) !important;max-height:95vh;display:flex;flex-direction:column;overflow:hidden">
      <div class="modal-header">
        <div class="flex items-center gap-3">
          <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ editingPlan().package_tag }}</span>
          <h3 class="text-lg font-semibold text-gray-800">Edit Procurement Plan</h3>
          <span class="text-xs text-gray-500">{{ editingPlan().package_name }}</span>
        </div>
        <button @click="cancelPlanEdit" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body" style="overflow-y:auto;flex:1">
        <div class="space-y-5">
          <!-- Not applicable toggle — excludes the package from Register + Dashboard -->
          <label class="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50 cursor-pointer hover:bg-gray-100">
            <input type="checkbox" v-model="planForm.not_applicable" class="mt-0.5 rounded border-gray-300"/>
            <div class="flex-1">
              <div class="text-sm font-semibold text-gray-800">Procurement not applicable for this package</div>
              <div class="text-xs text-gray-500 mt-0.5">When ticked, the package is excluded from the Procurement Register tab and the Dashboard. The plan row stays visible (greyed out) so you can flip the flag back on later.</div>
            </div>
          </label>

          <!-- Contract Type + Notes -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="form-label">Contract Type</label>
              <select v-model="planForm.contract_type_id" class="input-field">
                <option :value="null">— Select —</option>
                <option v-for="ct in contractTypes" :key="ct.id" :value="ct.id">{{ ct.name }}</option>
              </select>
            </div>
            <div>
              <label class="form-label">Notes</label>
              <textarea v-model="planForm.notes" class="input-field" rows="2" placeholder="Optional notes…"></textarea>
            </div>
          </div>

          <!-- Bidding Companies (left) + Step due dates (right) -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- LEFT: Bidding Company selection -->
            <div>
              <label class="form-label">Bidding Companies</label>
              <div v-if="biddingCompanies.length === 0"
                   class="p-4 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-700">
                No bidding companies yet. Add them in the <button type="button" @click="cancelPlanEdit(); activeTab = 'companies'" class="font-semibold underline hover:text-amber-900">Bidding Companies</button> tab first.
              </div>
              <div v-else class="border border-gray-200 rounded-lg overflow-hidden">
                <div class="p-2 border-b border-gray-100 bg-gray-50">
                  <input v-model="companySearch" type="text"
                         class="w-full text-sm px-2 py-1.5 rounded border border-gray-200 focus:outline-none focus:border-ips-blue"
                         placeholder="Search companies…"/>
                </div>
                <div class="max-h-72 overflow-y-auto divide-y divide-gray-50">
                  <label v-for="co in filteredBiddingCompanies" :key="co.id"
                         class="flex items-start gap-2.5 px-3 py-2.5 hover:bg-amber-50 cursor-pointer">
                    <input type="checkbox" :value="co.id" v-model="planForm.bidder_ids"
                           class="rounded border-gray-300 mt-0.5"/>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-semibold text-gray-800">{{ co.name }}</div>
                      <div v-if="co.contacts.length > 0" class="text-xs text-gray-400 mt-0.5">
                        {{ co.contacts.map(c => c.name).join(', ') }}
                      </div>
                      <div v-else class="text-xs text-gray-300 mt-0.5">No contacts assigned</div>
                    </div>
                  </label>
                  <div v-if="filteredBiddingCompanies.length === 0"
                       class="px-3 py-4 text-sm text-gray-400 text-center">No companies match your search</div>
                </div>
                <div v-if="planForm.bidder_ids.length > 0"
                     class="p-2 bg-amber-50 border-t border-amber-100 flex flex-wrap gap-1.5">
                  <span v-for="cid in planForm.bidder_ids" :key="cid"
                        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">
                    {{ companyDisplay(cid) }}
                    <button type="button"
                            @click="planForm.bidder_ids = planForm.bidder_ids.filter(id => id !== cid)"
                            class="hover:text-red-600 leading-none font-bold">×</button>
                  </span>
                </div>
              </div>
            </div>

            <!-- RIGHT: Step due dates (stacked one per row) -->
            <div>
              <label class="form-label">Due Dates per Procurement Step</label>
              <div class="space-y-2">
                <div v-for="step in steps" :key="step.id"
                     class="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 bg-white">
                  <div class="flex-1 min-w-0">
                    <div class="text-xs font-semibold text-gray-700 truncate">{{ step.step_id }}</div>
                    <div class="text-xs text-gray-400">{{ (step.weight * 100).toFixed(0) }}% weight</div>
                  </div>
                  <input type="date" v-model="planForm.step_dates[String(step.id)]"
                         class="text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-ips-blue bg-white w-36"/>
                </div>
              </div>
            </div>
          </div>

          <p v-if="planError" class="text-red-500 text-sm">{{ planError }}</p>
        </div>
      </div>
      <div class="modal-footer">
        <button @click="cancelPlanEdit" class="btn btn-secondary text-sm">Cancel</button>
        <button @click="savePlan()" :disabled="planSaving" class="btn btn-primary text-sm">
          {{ planSaving ? 'Saving…' : 'Save Plan' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Bidding Company Form Modal ───────────────────────────────────────── -->
  <div v-if="showCompanyForm" class="modal-overlay" @click.self="showCompanyForm = false">
    <div class="modal-box modal-lg">
      <div class="modal-header">
        <h3 class="text-lg font-semibold text-gray-800">{{ editingCompany ? 'Edit Bidding Company' : 'New Bidding Company' }}</h3>
        <button @click="showCompanyForm = false" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body space-y-4">
        <div>
          <label class="form-label">Company Name <span class="text-red-500">*</span></label>
          <input v-model="companyForm.name" type="text" class="input-field" placeholder="e.g. Acme Construction Ltd."/>
        </div>
        <div>
          <label class="form-label">Description</label>
          <textarea v-model="companyForm.description" class="input-field" rows="3"
            placeholder="Brief description of the company or their scope of work…"></textarea>
        </div>
        <div>
          <label class="form-label">Website</label>
          <input v-model="companyForm.website" type="url" class="input-field" placeholder="https://…"/>
        </div>
        <p v-if="companyError" class="text-red-500 text-sm">{{ companyError }}</p>
      </div>
      <div class="modal-footer">
        <button @click="showCompanyForm = false" class="btn-secondary">Cancel</button>
        <button @click="saveCompany" :disabled="companySaving" class="btn-primary">
          {{ companySaving ? 'Saving…' : (editingCompany ? 'Save Changes' : 'Add Company') }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Step Form Modal ──────────────────────────────────────────────────── -->
  <div v-if="showStepForm" class="modal-overlay" @click.self="showStepForm = false">
    <div class="modal-box modal-lg">
      <div class="modal-header">
        <h3 class="text-lg font-semibold text-gray-800">{{ editingStep ? 'Edit Step' : 'New Procurement Step' }}</h3>
        <button @click="showStepForm = false" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body space-y-4">
        <div>
          <label class="form-label">Step Name / ID <span class="text-red-500">*</span></label>
          <input v-model="stepForm.step_id" type="text" class="input-field" placeholder="e.g. RFQ, BAFO, Contract Awarding"/>
        </div>
        <div>
          <label class="form-label">Description</label>
          <textarea v-model="stepForm.description" class="input-field" rows="4"
            placeholder="Describe what this step entails…"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Weight (%) <span class="text-red-500">*</span></label>
            <input v-model.number="stepForm.weightPct" type="number" class="input-field"
              placeholder="0" step="0.1" min="0" max="100"/>
            <p class="text-xs text-gray-400 mt-1">Current total after change: <strong :class="previewTotal === 100 ? 'text-green-600' : 'text-orange-500'">{{ previewTotal.toFixed(1) }}%</strong></p>
          </div>
          <div>
            <label class="form-label">Sort Order</label>
            <input v-model.number="stepForm.sort_order" type="number" class="input-field" placeholder="0" min="0"/>
          </div>
        </div>
        <p v-if="stepError" class="text-red-500 text-sm">{{ stepError }}</p>
      </div>
      <div class="modal-footer">
        <button @click="showStepForm = false" class="btn-secondary">Cancel</button>
        <button @click="saveStep" :disabled="stepSaving" class="btn-primary">
          {{ stepSaving ? 'Saving…' : (editingStep ? 'Save Changes' : 'Add Step') }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Contract Type Form Modal ─────────────────────────────────────────── -->
  <div v-if="showCtForm" class="modal-overlay" @click.self="showCtForm = false">
    <div class="modal-box modal-lg">
      <div class="modal-header">
        <h3 class="text-lg font-semibold text-gray-800">{{ editingCt ? 'Edit Contract Type' : 'New Contract Type' }}</h3>
        <button @click="showCtForm = false" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body space-y-4">
        <div>
          <label class="form-label">Name <span class="text-red-500">*</span></label>
          <input v-model="ctForm.name" type="text" class="input-field" placeholder="e.g. Lump-Sum, Cost-Plus"/>
        </div>
        <div>
          <label class="form-label">Description</label>
          <textarea v-model="ctForm.description" class="input-field" rows="4"
            placeholder="Describe this contract type…"></textarea>
        </div>
        <div>
          <label class="form-label">Sort Order</label>
          <input v-model.number="ctForm.sort_order" type="number" class="input-field" placeholder="0" min="0"/>
        </div>
        <p v-if="ctError" class="text-red-500 text-sm">{{ ctError }}</p>
      </div>
      <div class="modal-footer">
        <button @click="showCtForm = false" class="btn-secondary">Cancel</button>
        <button @click="saveCt" :disabled="ctSaving" class="btn-primary">
          {{ ctSaving ? 'Saving…' : (editingCt ? 'Save Changes' : 'Add Contract Type') }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Procurement Plan Import Modal ──────────────────────────────────────── -->
  <div v-if="showProcImportModal" class="modal-overlay" @click.self="showProcImportModal = false">
    <div class="modal-box" style="max-width:860px">
      <div class="modal-header">
        <h3 class="modal-title">Import Procurement Plan from Excel</h3>
        <button @click="showProcImportModal = false" class="modal-close">&times;</button>
      </div>
      <div class="modal-body space-y-4">
        <div v-if="procImportResult" class="rounded-lg p-4 bg-green-50 border border-green-200 text-sm text-green-800 space-y-1">
          <p class="font-semibold">Import completed successfully.</p>
          <p>Created: <strong>{{ procImportResult.created }}</strong> &nbsp; Updated: <strong>{{ procImportResult.updated }}</strong> &nbsp; Skipped: <strong>{{ procImportResult.skipped }}</strong></p>
        </div>
        <div v-if="!procImportPreview && !procImportResult" class="space-y-3">
          <p class="text-sm text-gray-600">Upload an Excel file (.xlsx) to import procurement plans. Download the template first to see required columns, step names, and available lookup values.</p>
          <div class="flex items-center gap-3 flex-wrap">
            <button @click="exportProcPlan" class="btn-secondary text-sm flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 8l-3-3m3 3l3-3"/></svg>
              Export / Download Template
            </button>
            <label class="btn-secondary text-sm cursor-pointer flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
              Choose File
              <input type="file" accept=".xlsx" class="hidden" @change="onProcImportFileChange" />
            </label>
            <span v-if="procImportFile" class="text-sm text-gray-600">{{ procImportFile.name }}</span>
          </div>
          <p v-if="procImportError" class="text-red-500 text-sm">{{ procImportError }}</p>
          <p class="text-xs text-gray-400">Unique key: <strong>Package Tag</strong>. Existing plans are updated; packages without a plan will have one created. The export file already contains the Lookups sheet with valid reference values and step column names.</p>
        </div>
        <div v-if="procImportPreview && !procImportResult" class="space-y-3">
          <div class="flex items-center gap-4 text-sm flex-wrap">
            <span class="px-2 py-0.5 rounded bg-green-100 text-green-800 font-medium">{{ procImportPreview.summary.creates }} to create</span>
            <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">{{ procImportPreview.summary.updates }} to update</span>
            <span v-if="procImportPreview.summary.errors > 0" class="px-2 py-0.5 rounded bg-red-100 text-red-800 font-medium">{{ procImportPreview.summary.errors }} error(s)</span>
          </div>
          <p v-if="procImportError" class="text-red-500 text-sm">{{ procImportError }}</p>
          <div class="overflow-x-auto max-h-96 border rounded">
            <table class="w-full text-xs">
              <thead class="bg-gray-100 sticky top-0">
                <tr>
                  <th class="px-2 py-1 text-left">Row</th>
                  <th class="px-2 py-1 text-left">Action</th>
                  <th class="px-2 py-1 text-left">Package Tag</th>
                  <th class="px-2 py-1 text-left">Contract Type</th>
                  <th class="px-2 py-1 text-left">Bidding Companies</th>
                  <th class="px-2 py-1 text-left">Errors / Warnings</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in procImportPreview.rows" :key="r.row_num"
                  :class="r.errors.length ? 'bg-red-50' : r.warnings.length ? 'bg-yellow-50' : ''">
                  <td class="px-2 py-1 text-gray-500">{{ r.row_num }}</td>
                  <td class="px-2 py-1"><span :class="r.action==='CREATE' ? 'text-green-700 font-semibold' : 'text-blue-700 font-semibold'">{{ r.action }}</span></td>
                  <td class="px-2 py-1 font-medium">{{ r.package_tag }}</td>
                  <td class="px-2 py-1 text-gray-600">{{ r.contract_type_name || '—' }}</td>
                  <td class="px-2 py-1 text-gray-600 max-w-xs truncate" :title="(r.bidder_names||[]).join(', ')">{{ (r.bidder_names||[]).join(', ') || '—' }}</td>
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
        <button v-if="!procImportResult" @click="resetProcImport" class="btn-secondary">{{ procImportPreview ? 'Back' : 'Cancel' }}</button>
        <button v-if="procImportResult" @click="showProcImportModal = false; loadPlans()" class="btn-primary">Close &amp; Refresh</button>
        <button v-if="!procImportPreview && !procImportResult && procImportFile" @click="runProcImportPreview"
          :disabled="procImportLoading" class="btn-primary">
          {{ procImportLoading ? 'Analysing…' : 'Preview Import' }}
        </button>
        <button v-if="procImportPreview && !procImportResult && (procImportPreview.summary.creates + procImportPreview.summary.updates) > 0"
          @click="applyProcImport" :disabled="procImportApplying" class="btn-primary">
          {{ procImportApplying
              ? 'Applying…'
              : (procImportPreview.summary.errors > 0
                  ? ('Apply ' + (procImportPreview.summary.creates + procImportPreview.summary.updates) + ' clean row(s) — skip ' + procImportPreview.summary.errors + ' error(s)')
                  : 'Confirm &amp; Apply') }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Read-only View modal (row click in the register tab) ─────────────── -->
  <div v-if="viewingEntry" class="modal-overlay" @click.self="closeEntryView">
    <div class="modal-box modal-xl" style="max-width:min(1100px,95vw) !important">
      <div class="modal-header">
        <div>
          <h3 class="text-lg font-semibold text-gray-800">{{ viewingEntry.company_name }}</h3>
          <p class="text-sm text-gray-500">{{ viewingEntryPkg ? viewingEntryPkg.package_tag + (viewingEntryPkg.package_name ? ' — ' + viewingEntryPkg.package_name : '') : '' }}</p>
        </div>
        <button @click="closeEntryView" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body" style="padding:0;display:flex;overflow:hidden">
        <!-- LEFT: read-only data summary -->
        <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
          <div class="space-y-4 text-sm">
            <!-- Status + step row -->
            <div class="flex items-center gap-3 flex-wrap">
              <span :class="statusBadgeClass(viewingEntry.status)" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold">
                {{ statusLabel(viewingEntry.status) }}
              </span>
              <span v-if="viewingEntry.current_step_name" class="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                {{ viewingEntry.current_step_name }}
              </span>
              <span v-if="viewingEntry.has_current_step_submittal"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100"
                title="Bidder submitted in current step">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Submitted
              </span>
            </div>

            <!-- Progress bar -->
            <div>
              <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Overall Progress</div>
              <div class="flex items-center gap-2">
                <div class="flex-1 bg-gray-100 rounded-full h-2">
                  <div class="h-2 rounded-full transition-all"
                       :class="viewingEntry.status === 'AWARDED' ? 'bg-emerald-500' : viewingEntry.status === 'EXCLUDED' ? 'bg-gray-400' : 'bg-ips-blue'"
                       :style="'width:' + Math.min(viewingEntry.progress_pct, 100) + '%'"></div>
                </div>
                <span class="text-xs text-gray-600 w-10 text-right">{{ viewingEntry.progress_pct.toFixed(0) }}%</span>
              </div>
            </div>

            <!-- Bid value + budget comparison -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Bid Value</div>
                <div class="font-semibold text-gray-800">
                  <span v-if="viewingEntry.bid_value != null">{{ fmtCurrency(viewingEntry.bid_value, viewingEntry.bid_currency) }}</span>
                  <span v-else class="text-gray-300 font-normal">—</span>
                </div>
              </div>
              <div v-if="viewingEntry.bid_value != null && viewingEntryPkg && viewingEntryPkg.forecast > 0">
                <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">vs Budget</div>
                <div :class="bidVsBudgetClass(viewingEntry.bid_value, viewingEntryPkg.forecast)" class="font-semibold">
                  {{ (viewingEntry.bid_value / viewingEntryPkg.forecast * 100).toFixed(1) }}%
                </div>
              </div>
            </div>

            <!-- Compliance -->
            <div v-if="viewingEntry.technical_compliance || viewingEntry.commercial_compliance" class="grid grid-cols-2 gap-3">
              <div v-if="viewingEntry.technical_compliance && viewingEntry.technical_compliance !== 'NA'" class="rounded-lg border px-3 py-2"
                   :class="complianceCardBorder(viewingEntry.technical_compliance)">
                <div class="text-xs font-semibold uppercase tracking-wide mb-0.5"
                     :class="complianceCardHeader(viewingEntry.technical_compliance)">Technical Compliance</div>
                <div class="font-bold text-sm" :class="complianceCardValue(viewingEntry.technical_compliance)">{{ complianceLabel(viewingEntry.technical_compliance) }}</div>
                <div v-if="viewingEntry.technical_compliance_note" class="text-xs mt-1 text-gray-600">{{ viewingEntry.technical_compliance_note }}</div>
              </div>
              <div v-if="viewingEntry.commercial_compliance && viewingEntry.commercial_compliance !== 'NA'" class="rounded-lg border px-3 py-2"
                   :class="complianceCardBorder(viewingEntry.commercial_compliance)">
                <div class="text-xs font-semibold uppercase tracking-wide mb-0.5"
                     :class="complianceCardHeader(viewingEntry.commercial_compliance)">Commercial Compliance</div>
                <div class="font-bold text-sm" :class="complianceCardValue(viewingEntry.commercial_compliance)">{{ complianceLabel(viewingEntry.commercial_compliance) }}</div>
                <div v-if="viewingEntry.commercial_compliance_note" class="text-xs mt-1 text-gray-600">{{ viewingEntry.commercial_compliance_note }}</div>
              </div>
            </div>

            <!-- Exclusion reason -->
            <div v-if="viewingEntry.status === 'EXCLUDED' && viewingEntry.exclusion_reason"
                 class="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <div class="text-xs font-semibold text-red-700 uppercase tracking-wide mb-0.5">Excluded</div>
              <div class="text-sm text-red-700">{{ viewingEntry.exclusion_reason }}</div>
            </div>
          </div>
        </div>

        <!-- RIGHT: attachments (read-only, with collapsible step groups) -->
        <div class="w-[39rem] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>

          <div class="flex gap-0 mb-3 border-b border-gray-200">
            <button @click="viewAttTab = 'project'"
                    :class="['px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                              viewAttTab === 'project' ? 'border-ips-blue text-ips-dark' : 'border-transparent text-gray-500 hover:text-gray-700']">
              Project documents
              <span class="ml-1 text-[10px] text-gray-400">{{ projectAttachments(viewingEntry.id).length }}</span>
            </button>
            <button @click="viewAttTab = 'bidder'"
                    :class="['px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                              viewAttTab === 'bidder' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700']">
              Bidder documents
              <span class="ml-1 text-[10px] text-gray-400">{{ myAttachments(viewingEntry.id).length }}</span>
            </button>
          </div>

          <div v-if="bidderAttLoading[viewingEntry.id]" class="py-3 text-center text-gray-400">
            <img src="/static/assets/impulse-loader.svg" class="h-5 mx-auto" alt="Loading"/>
          </div>

          <!-- Project documents -->
          <div v-else-if="viewAttTab === 'project'">
            <div v-if="projectAttachments(viewingEntry.id).length === 0" class="text-xs text-gray-400 italic px-1">No project documents.</div>
            <div v-else class="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
              <div v-for="g in groupByStep(projectAttachments(viewingEntry.id))" :key="'vp-'+(g.step_id || 'none')" class="px-3 py-2">
                <div class="flex items-center justify-between mb-1">
                  <button @click="toggleStep('view-project', g)"
                          class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800">
                    <svg :class="['w-3 h-3 transition-transform', isStepExpanded('view-project', g) ? 'rotate-90' : '']"
                         fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                    </svg>
                    <span>{{ g.step_name || 'No step' }}</span>
                    <span class="ml-1 text-[10px] text-gray-400 normal-case font-normal">({{ g.files.length }})</span>
                  </button>
                  <button v-if="g.files.length > 1" @click.stop="downloadStepZip(g, 'project', viewingEntryPkg ? viewingEntryPkg.package_tag : '')"
                          class="text-[10px] text-ips-blue hover:underline" title="Download all files in this step">
                    Download all ({{ g.files.length }})
                  </button>
                </div>
                <div v-show="isStepExpanded('view-project', g)" class="space-y-1">
                  <div v-for="att in g.files" :key="att.id" class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 text-sm">
                    <span class="text-base shrink-0">{{ bidderFileIcon(att) }}</span>
                    <span class="flex-1 truncate text-xs font-medium text-gray-800" :title="att.original_filename">{{ att.original_filename }}</span>
                    <span class="text-[10px] text-gray-400 shrink-0">{{ bidderFmtDate(att.uploaded_at) }}</span>
                    <button @click="bidderViewFile(att)" class="text-gray-400 hover:text-ips-blue" title="View"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></button>
                    <button @click="bidderDownloadFile(att)" class="text-gray-400 hover:text-ips-blue" title="Download"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg></button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Bidder documents -->
          <div v-else>
            <div v-if="myAttachments(viewingEntry.id).length === 0" class="text-xs text-gray-400 italic px-1">No bidder documents.</div>
            <div v-else class="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
              <div v-for="g in groupByStep(myAttachments(viewingEntry.id))" :key="'vb-'+(g.step_id || 'none')" class="px-3 py-2">
                <div class="flex items-center justify-between mb-1">
                  <button @click="toggleStep('view-bidder', g)"
                          class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 hover:text-amber-900">
                    <svg :class="['w-3 h-3 transition-transform', isStepExpanded('view-bidder', g) ? 'rotate-90' : '']"
                         fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                    </svg>
                    <span>{{ g.step_name || 'No step' }}</span>
                    <span class="ml-1 text-[10px] text-amber-600 normal-case font-normal">({{ g.files.length }})</span>
                  </button>
                  <button v-if="g.files.length > 1" @click.stop="downloadStepZip(g, 'bidder', viewingEntryPkg ? viewingEntryPkg.package_tag : '')"
                          class="text-[10px] text-amber-700 hover:underline" title="Download all files in this step">
                    Download all ({{ g.files.length }})
                  </button>
                </div>
                <div v-show="isStepExpanded('view-bidder', g)" class="space-y-1">
                  <div v-for="att in g.files" :key="att.id" class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 text-sm">
                    <span class="text-base shrink-0">{{ bidderFileIcon(att) }}</span>
                    <span class="flex-1 truncate text-xs font-medium text-gray-800" :title="att.original_filename">{{ att.original_filename }}</span>
                    <span class="text-[10px] text-gray-400 shrink-0">{{ bidderFmtDate(att.uploaded_at) }}</span>
                    <button @click="bidderViewFile(att)" class="text-gray-400 hover:text-ips-blue" title="View"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></button>
                    <button @click="bidderDownloadFile(att)" class="text-gray-400 hover:text-ips-blue" title="Download"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button @click="closeEntryView" class="btn-secondary">Close</button>
        <button v-if="canEditEntry(viewingEntry, viewingEntryPkg)"
                @click="editFromView" class="btn-primary">
          Edit
        </button>
      </div>
    </div>
  </div>

  <!-- ── Full-screen in-app file viewer (replaces window.open) ────────────── -->
  <div v-if="fileViewer.open" class="modal-overlay" style="z-index:9999" @click.self="closeFileViewer">
    <div class="modal-box" style="max-width:96vw;width:96vw;max-height:96vh;height:96vh;display:flex;flex-direction:column;padding:0">
      <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-200 shrink-0">
        <span class="font-medium text-gray-800 truncate flex-1 text-sm">{{ fileViewer.name }}</span>
        <button @click="closeFileViewer" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="flex-1 overflow-hidden bg-gray-100 flex items-center justify-center">
        <div v-if="fileViewer.loading"><img src="/static/assets/impulse-loader.svg" class="h-6" alt="Loading"/></div>
        <img v-else-if="fileViewer.url && fileViewer.isImage" :src="fileViewer.url"
             class="max-w-full max-h-full object-contain" :alt="fileViewer.name"/>
        <iframe v-else-if="fileViewer.url" :src="fileViewer.url"
                class="w-full h-full border-0" :title="fileViewer.name"></iframe>
      </div>
    </div>
  </div>

</div>
  `,

  data() {
    return {
      activeTab: 'plan',

      loading: false,

      // Dashboard
      dashboardData: null,
      dashboardLoading: false,
      dashPackageId: null,
      procChartObj: null,
      techComplianceChartObj: null,
      commComplianceChartObj: null,
      bidVsBudgetChartObj: null,
      budgetWeightDonutObj: null,

      // Bidder portal
      bidderData: null,
      // Currently selected package tab in the bidder portal — the bidder
      // portal now shows one [package] tab at a time instead of a long
      // scrollable list of every entry.
      bidderActiveEntryId: null,
      // Per-entry attachment cache for the split panes (project vs my uploads)
      bidderAttachments: {},   // entry_id -> array of attachment rows
      bidderAttLoading: {},    // entry_id -> bool
      bidderUploading: {},     // entry_id -> bool
      bidderDragOverId: null,  // entry_id of the drop target with hover styling
      // Register modal (project side) — attachments tab + drag/drop state
      registerAttTab: 'project',
      registerUploading: false,
      registerDragOver: false,
      // Per-step expanded state for every attachment pane that groups by step
      // (register modal + bidder portal + view modal). Default = collapsed
      // (key absent or false). Key format: `${scope}-${step_id || 'none'}`.
      stepExpanded: {},
      // Full-screen in-app file viewer (procurement-wide). Replaces the old
      // window.open call so PDFs / images stay inside the app shell.
      fileViewer: { open: false, loading: false, name: '', url: null, isImage: false },
      bidderLoading: false,
      bidderForms: {},     // entry_id -> { bid_value, bid_currency, comment, saving, error }

      // Procurement steps
      steps: [],
      showStepForm: false,
      editingStep: null,
      stepForm: { step_id: '', description: '', weightPct: 0, sort_order: 0, updated_at: null },
      stepError: '',
      stepSaving: false,

      // Contract types
      contractTypes: [],
      showCtForm: false,
      editingCt: null,
      ctForm: { name: '', description: '', sort_order: 0, updated_at: null },
      ctError: '',
      ctSaving: false,

      // Sequence validation
      sequenceValidated: false,
      sequenceValidatedAt: null,
      sequenceValidatedBy: null,

      // Procurement Plan tab
      plans: [],
      biddingCompanies: [],
      bidderUsers: [],        // BIDDER-role users for contact assignment
      planLoading: false,
      planExporting: false,
      showCompanyPanel: false,
      editingPlanPackageId: null,
      planForm: { contract_type_id: null, notes: '', bidder_ids: [], step_dates: {}, not_applicable: false, updated_at: null },
      planError: '',
      planSaving: false,
      companySearch: '',

      // Bidding company form (legacy modal — kept for delete confirmations)
      showCompanyForm: false,
      editingCompany: null,
      companyForm: { name: '', description: '', website: '', updated_at: null },
      companyError: '',
      companySaving: false,

      // ── Bidding Companies tab — inline-editable table state ────────────
      companyRows: [],                  // mirror of biddingCompanies for inline edit
      companyRowSaving: {},             // { [companyId]: true } during save
      companyRowError: {},              // { [companyId]: errorMessage }
      pkgPickerOpenForRow: null,        // row.localKey when package picker open

      // Procurement Plan modal (replaces collapsed inline edit)
      showPlanModal: false,

      // Add contact to company
      addContactCompanyId: null,
      addContactUserId: null,

      // Procurement Register
      register: [],
      registerLoading: false,
      exporting: false,
      registerCollapsed: {},          // { [packageId]: true } — collapsed packages
      editingEntry: null,
      editingEntryPkg: null,
      // Read-only view modal — opened by row click for users without edit
      // privileges (and for any user who just wants a quick read of the
      // bidder data + uploaded documents).
      viewingEntry: null,
      viewingEntryPkg: null,
      viewAttTab: 'project',
      registerForm: { status: null, technical_compliance: null, commercial_compliance: null, bid_value: null, bid_currency: 'EUR', comment: '', updated_at: null },
      registerError: '',
      registerSaving: false,
      awardingEntry: null,
      awardComment: '',
      showCreateOrderModal: false,
      createOrderEntry: null,
      createOrderForm: { po_number: '', description: '', amount: 0, currency: 'EUR', order_date: '', assign_vendor_role: true },
      createOrderSaving: false,
      createOrderError: '',
      createOrderDone: false,
      createOrderForced: false,

      // Import / Export
      showProcImportModal: false,
      procImportFile: null,
      procImportPreview: null,
      procImportLoading: false,
      procImportApplying: false,
      procImportError: '',
      procImportResult: null,

      showEventsEntry: null,
      entryEvents: [],
      eventsLoading: false,
      registerOverallProgress: 0,
      stepActionEntry: null,
      stepActionPkg: null,
      stepActionDir: null,
      stepActionComment: '',
      stepActionSaving: false,
      stepActionError: '',
    };
  },

  computed: {
    projectCurrency() {
      return (window.AppSettings && window.AppSettings.currency) || 'EUR';
    },

    isBidder() {
      return this.currentUser?.role === 'BIDDER';
    },

    activeBidderEntry() {
      const entries = (this.bidderData && this.bidderData.entries) || [];
      return entries.find(e => e.entry_id === this.bidderActiveEntryId) || null;
    },

    // KPI cards derived from pkg_stats (already filtered by dashPackageId)
    dashKpis() {
      const stats = this.dashboardData ? this.dashboardData.pkg_stats : [];
      const totalForecast = stats.reduce((s, p) => s + (p.forecast || 0), 0);
      const overallProgress = totalForecast > 0
        ? stats.reduce((s, p) => s + (p.procurement_progress * (p.forecast || 0)), 0) / totalForecast
        : 0;
      const totalPkgs = stats.length;
      const pkgsWithPlan = stats.filter(p => p.has_plan).length;
      const totalBidders = stats.reduce((s, p) => {
        const cs = p.company_statuses || {};
        return s + (cs.COMPETING || 0) + (cs.AWARDED || 0) + (cs.EXCLUDED || 0) + (cs.AWAITING || 0);
      }, 0);
      const awardedCount = stats.reduce((s, p) => s + ((p.company_statuses || {}).AWARDED || 0), 0);
      const lateStepsCount = stats.reduce((s, p) => s + (p.late_steps ? p.late_steps.length : 0), 0);
      return { overallProgress, totalPkgs, pkgsWithPlan, totalBidders, awardedCount, lateStepsCount };
    },

    complianceTotals() {
      // Sum of YES/NO/PENDING across the visible pkg_stats (which the backend
      // already filters by dashPackageId, so this also auto-adjusts).
      const stats = this.dashboardData ? this.dashboardData.pkg_stats : [];
      const acc = { technical: { YES: 0, NO: 0, PENDING: 0, total: 0 },
                    commercial:{ YES: 0, NO: 0, PENDING: 0, total: 0 } };
      for (const p of stats) {
        const c = p.compliance || { technical: {}, commercial: {} };
        for (const k of ['YES', 'NO', 'PENDING']) {
          acc.technical[k]  += (c.technical  || {})[k] || 0;
          acc.commercial[k] += (c.commercial || {})[k] || 0;
        }
      }
      acc.technical.total  = acc.technical.YES  + acc.technical.NO  + acc.technical.PENDING;
      acc.commercial.total = acc.commercial.YES + acc.commercial.NO + acc.commercial.PENDING;
      return acc;
    },

    hasBidVsBudgetData() {
      const stats = this.dashboardData ? this.dashboardData.pkg_stats : [];
      return stats.some(p => p.avg_bid_value != null && p.forecast > 0);
    },

    createOrderEntryPkgLabel() {
      if (!this.createOrderEntry) return '';
      const pkgGroup = (this.register || []).find(p => p.package_id === this.createOrderEntry.package_id);
      if (!pkgGroup) return '';
      return pkgGroup.package_tag + (pkgGroup.package_name ? ' — ' + pkgGroup.package_name : '');
    },

    visibleTabs() {
      if (this.isBidder) return [{ id: 'bidder-portal', label: 'My Procurement Status' }];
      return [
        { id: 'setup',         label: 'Setup' },
        { id: 'companies',     label: 'Bidding Companies' },
        { id: 'plan',          label: 'Procurement Plan' },
        { id: 'register',      label: 'Procurement Register' },
        { id: 'dashboard',     label: 'Dashboard' },
      ];
    },

    canEdit() {
      if (!this.currentUser) return false;
      if (['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role)) return true;
      // Procurement Manager (Procurement Module Lead) gets the same UI gates.
      return (this.currentUser.lead_modules || []).includes('Procurement');
    },

    // Bidding-company management is also open to PROJECT_TEAM and CLIENT —
    // they create companies and link them to packages without needing the
    // Project Owner. Backend mirrors this in _can_manage_companies().
    canManageCompanies() {
      if (this.canEdit) return true;
      const r = this.currentUser && this.currentUser.role;
      return r === 'PROJECT_TEAM' || r === 'CLIENT';
    },

    // Steps are only editable when the sequence is NOT yet validated
    canEditSteps() {
      return this.canEdit && !this.sequenceValidated;
    },

    sequenceComplete() {
      return this.steps.length > 0 && Math.abs(this.totalWeight - 100) < 0.01;
    },

    totalWeight() {
      return this.steps.reduce((sum, s) => sum + (s.weight * 100), 0);
    },

    previewTotal() {
      const weightPct = Number(this.stepForm.weightPct) || 0;
      if (this.editingStep) {
        const others = this.steps
          .filter(s => s.id !== this.editingStep.id)
          .reduce((sum, s) => sum + s.weight * 100, 0);
        return others + weightPct;
      }
      return this.totalWeight + weightPct;
    },

    filteredBiddingCompanies() {
      const q = (this.companySearch || '').toLowerCase();
      return this.biddingCompanies.filter(co =>
        !q || co.name.toLowerCase().includes(q)
      );
    },
  },

  async mounted() {
    if (this.isBidder) {
      this.activeTab = 'bidder-portal';
    }
    if (this.initialTab) {
      this.activeTab = this.initialTab;
    }
    if (this.activeTab === 'bidder-portal') {
      await this.loadBidderPortal();
    } else {
      // Flag the "plan" tab's loader up front so the empty-state message
      // never flashes before the first fetch resolves. The activeTab watcher
      // only fires on change, not on the initial value, so we need to kick
      // off the right loader here based on the active tab.
      if (this.activeTab === 'plan')      this.planLoading      = true;
      if (this.activeTab === 'companies') this.planLoading      = true;
      if (this.activeTab === 'register')  this.registerLoading  = true;
      if (this.activeTab === 'dashboard') this.dashboardLoading = true;

      await this.load();

      if (this.activeTab === 'plan')      await this.loadPlans();
      if (this.activeTab === 'companies') await this.loadPlans();
      if (this.activeTab === 'register')  await this.loadRegister();
      if (this.activeTab === 'dashboard') await this.loadProcDashboard();

      await this.checkPendingOpen();
    }
  },

  // Destroy the chart on unmount so it doesn't linger in Chart.js's
  // global registry with a detached canvas and throw on later frames.
  beforeUnmount() {
    for (const k of ['procChartObj', 'techComplianceChartObj', 'commComplianceChartObj', 'bidVsBudgetChartObj', 'budgetWeightDonutObj']) {
      if (this[k]) { try { this[k].destroy(); } catch (e) {} this[k] = null; }
    }
  },

  watch: {
    activeTab(val) {
      this.$emit('subtab-change', val);
      if (val === 'dashboard') this.loadProcDashboard();
      if (val === 'plan') this.loadPlans();
      if (val === 'companies') this.loadPlans();   // re-uses the plan loader (companies + bidder users)
      if (val === 'register') this.loadRegister();
      if (val === 'bidder-portal') this.loadBidderPortal();
    },
    // Edit modal (project side, register tab)
    editingEntry(val) {
      this.$emit('record-change', val ? { type: 'procurement_entry', id: val.id } : null);
    },
    // Read-only View modal (also register tab — distinguished by record type)
    viewingEntry(val) {
      this.$emit('record-change', val ? { type: 'procurement_entry_view', id: val.id } : null);
    },
    // Lazy-load per-entry attachments only when its tab becomes active.
    bidderActiveEntryId(val) {
      if (val) this.loadBidderAttachments(val);
    },
  },

  methods: {
    async checkPendingOpen() {
      if (!this.pendingOpen) return;
      const rt = this.pendingOpen.record_type;
      if (rt !== 'procurement_entry' && rt !== 'procurement_entry_view') return;
      const id = this.pendingOpen.record_id;
      // Hash-format `procurement_entry_view` always opens the read-only View
      // modal; the legacy `procurement_entry` route opens edit unless the
      // accompanying meta.open_view flag asks for view (e.g. coming from a
      // bidder-submittal action point).
      const openView = rt === 'procurement_entry_view'
        || (this.pendingOpen.meta && this.pendingOpen.meta.open_view);
      if (!this.register || this.register.length === 0) await this.loadRegister();
      for (const pkg of (this.register || [])) {
        const entry = (pkg.entries || []).find(e => e.id === id);
        if (entry) {
          this.activeTab = 'register';
          if (openView) this.openEntryView(entry, pkg);
          else this.openRegisterEdit(entry, pkg);
          return;
        }
      }
    },

    async load() {
      this.loading = true;
      try {
        const [steps, cts, status] = await Promise.all([
          API.getProcurementSteps(),
          API.getContractTypes(),
          API.getSequenceStatus(),
        ]);
        this.steps = steps;
        this.contractTypes = cts;
        this.sequenceValidated = status.sequence_validated;
        this.sequenceValidatedAt = status.validated_at;
        this.sequenceValidatedBy = status.validated_by;
      } catch (e) {
        console.error('Failed to load procurement data', e);
      } finally {
        this.loading = false;
      }
    },

    async loadProcDashboard() {
      this.dashboardLoading = true;
      try {
        this.dashboardData = await API.getProcurementDashboard(this.dashPackageId);
      } catch (e) {
        console.error('Failed to load procurement dashboard', e);
      } finally {
        this.dashboardLoading = false;
      }
      if (this.dashboardData) {
        await this.$nextTick();
        this.renderProcChart();
        this.renderComplianceCharts();
        this.renderBidVsBudgetChart();
        this.renderBudgetWeightDonut();
      }
    },

    renderBudgetWeightDonut() {
      if (typeof Chart === 'undefined' || !this.$refs.budgetWeightDonut) return;
      if (this.budgetWeightDonutObj) {
        try { this.budgetWeightDonutObj.destroy(); } catch (e) {}
        this.budgetWeightDonutObj = null;
      }
      const pkgs = ((this.dashboardData && this.dashboardData.all_packages) || [])
        .filter(p => (p.forecast || 0) > 0);
      if (pkgs.length === 0) return;

      const palette = ['#00AEEF', '#1B4F8C', '#0EA5E9', '#0369A1', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#EC4899', '#F43F5E', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#10B981', '#14B8A6', '#06B6D4'];
      const colors = pkgs.map((_, i) => palette[i % palette.length]);

      this.budgetWeightDonutObj = new Chart(this.$refs.budgetWeightDonut, {
        type: 'doughnut',
        data: {
          labels: pkgs.map(p => p.tag),
          datasets: [{
            data: pkgs.map(p => p.forecast),
            backgroundColor: colors,
            borderWidth: 1,
            borderColor: '#ffffff',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '55%',
          layout: { padding: 4 },
          plugins: {
            legend: {
              position: 'right',
              labels: { font: { size: 11 }, boxWidth: 12, padding: 6 },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const pkg = pkgs[ctx.dataIndex];
                  const m = (pkg.forecast / 1e6).toFixed(2);
                  return ` ${pkg.tag}: ${pkg.financial_weight_pct.toFixed(1)}% (${m}M)`;
                },
              },
            },
            datalabels: {
              color: '#ffffff',
              font: { size: 10, weight: '700' },
              textStrokeColor: 'rgba(0,0,0,0.45)',
              textStrokeWidth: 2,
              formatter: (_v, ctx) => {
                const pkg = pkgs[ctx.dataIndex];
                if (!pkg) return '';
                const pct = pkg.financial_weight_pct || 0;
                if (pct < 4) return '';  // hide on thin slices
                return `${pkg.tag}\n${pct.toFixed(1)}%`;
              },
              textAlign: 'center',
            },
          },
        },
        plugins: (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [],
      });
    },

    onDashPackageChange() {
      this.loadProcDashboard();
    },

    renderComplianceCharts() {
      if (typeof Chart === 'undefined') return;
      const totals = this.complianceTotals;
      if (this.techComplianceChartObj) { try { this.techComplianceChartObj.destroy(); } catch(e){} this.techComplianceChartObj = null; }
      if (this.commComplianceChartObj) { try { this.commComplianceChartObj.destroy(); } catch(e){} this.commComplianceChartObj = null; }

      const buildBar = (canvas, t) => {
        if (!canvas || t.total === 0) return null;
        const total = t.total || 1;
        return new Chart(canvas, {
          type: 'bar',
          data: {
            labels: ['Compliant', 'Not compliant', 'Pending'],
            datasets: [{
              label: 'Bidders',
              data: [t.YES, t.NO, t.PENDING],
              backgroundColor: ['#10B981', '#EF4444', '#9CA3AF'],
              borderWidth: 0,
              borderRadius: 4,
            }],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const v = ctx.parsed.x;
                    const pct = (v / total * 100).toFixed(0);
                    return `${ctx.label}: ${v} (${pct}%)`;
                  },
                },
              },
            },
            scales: {
              x: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } }, grid: { display: true, color: 'rgba(0,0,0,0.04)' } },
              y: { ticks: { font: { size: 12 } }, grid: { display: false } },
            },
          },
        });
      };
      this.techComplianceChartObj = buildBar(this.$refs.techComplianceChart, totals.technical);
      this.commComplianceChartObj = buildBar(this.$refs.commComplianceChart, totals.commercial);
    },

    renderBidVsBudgetChart() {
      if (typeof Chart === 'undefined' || !this.$refs.bidVsBudgetChart) return;
      if (this.bidVsBudgetChartObj) { try { this.bidVsBudgetChartObj.destroy(); } catch(e){} this.bidVsBudgetChartObj = null; }

      const stats = (this.dashboardData ? this.dashboardData.pkg_stats : [])
        .filter(p => p.avg_bid_value != null && p.forecast > 0);
      if (!stats.length) return;

      const labels = stats.map(p => p.package_tag);
      const forecast = stats.map(p => p.forecast);
      const avgBid = stats.map(p => p.avg_bid_value);
      // Render min/max as a "range" bar by drawing min as one dataset and
      // (max - min) stacked on top with a thin bar; simpler: show three bars
      // (Forecast / Avg Bid / Spread) per package using a grouped bar chart.
      const minBid = stats.map(p => p.min_bid_value != null ? p.min_bid_value : p.avg_bid_value);
      const maxBid = stats.map(p => p.max_bid_value != null ? p.max_bid_value : p.avg_bid_value);

      this.bidVsBudgetChartObj = new Chart(this.$refs.bidVsBudgetChart, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Actual budget',
              data: forecast,
              backgroundColor: 'rgba(0,174,239,0.65)',
              borderColor: '#00AEEF',
              borderWidth: 1,
            },
            {
              label: 'Avg bid',
              data: avgBid,
              backgroundColor: 'rgba(16,185,129,0.85)',
              borderColor: '#10B981',
              borderWidth: 1,
            },
            {
              label: 'Min bid',
              data: minBid,
              backgroundColor: 'rgba(245,158,11,0.5)',
              borderColor: '#F59E0B',
              borderWidth: 1,
            },
            {
              label: 'Max bid',
              data: maxBid,
              backgroundColor: 'rgba(239,68,68,0.5)',
              borderColor: '#EF4444',
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const v = ctx.parsed.y;
                  const idx = ctx.dataIndex;
                  const cur = (stats[idx] && stats[idx].currency) || '';
                  const fmt = (typeof v === 'number') ? v.toLocaleString() : v;
                  return `${ctx.dataset.label}: ${fmt} ${cur}`;
                },
                afterBody: (items) => {
                  const i = items[0].dataIndex;
                  const p = stats[i];
                  if (!p || !p.forecast) return '';
                  const pct = (p.avg_bid_value / p.forecast * 100).toFixed(1);
                  return `Avg bid is ${pct}% of actual budget`;
                },
              },
            },
          },
          scales: {
            x: { ticks: { font: { size: 11 } } },
            y: {
              beginAtZero: true,
              ticks: {
                font: { size: 11 },
                callback: (v) => Number(v).toLocaleString(),
              },
            },
          },
        },
      });
    },

    // ── Bidder portal — split attachments helpers ──────────────────────────
    async loadBidderAttachments(entryId) {
      if (!entryId) return;
      this.bidderAttLoading = { ...this.bidderAttLoading, [entryId]: true };
      try {
        const list = await API.getAttachments('procurement_entry', entryId);
        this.bidderAttachments = { ...this.bidderAttachments, [entryId]: list };
      } catch (e) {
        console.error('Failed to load attachments', e);
      } finally {
        this.bidderAttLoading = { ...this.bidderAttLoading, [entryId]: false };
      }
    },
    projectAttachments(entryId) {
      const all = this.bidderAttachments[entryId] || [];
      return all.filter(a => a.uploaded_by_role !== 'BIDDER');
    },
    myAttachments(entryId) {
      const all = this.bidderAttachments[entryId] || [];
      return all.filter(a => a.uploaded_by_role === 'BIDDER');
    },
    groupByStep(files) {
      const map = new Map();
      for (const f of files) {
        const key = f.step_id || 0;
        if (!map.has(key)) map.set(key, { step_id: f.step_id, step_name: f.step_name, files: [] });
        map.get(key).files.push(f);
      }
      // Stable order: by step name asc, "No step" last
      return [...map.values()].sort((a, b) => {
        if (!a.step_id && !b.step_id) return 0;
        if (!a.step_id) return 1;
        if (!b.step_id) return -1;
        return (a.step_name || '').localeCompare(b.step_name || '');
      });
    },
    async bidderUploadFiles(entry, ev) {
      const files = Array.from(ev.target.files || []);
      ev.target.value = '';
      await this._bidderUploadList(entry, files);
    },
    async bidderDropFiles(entry, ev) {
      this.bidderDragOverId = null;
      if (entry.has_current_step_submittal) return;
      const files = Array.from(ev.dataTransfer && ev.dataTransfer.files || []);
      await this._bidderUploadList(entry, files);
    },
    async _bidderUploadList(entry, files) {
      if (!files.length) return;
      this.bidderUploading = { ...this.bidderUploading, [entry.entry_id]: true };
      try {
        for (const f of files) {
          await API.uploadAttachment('procurement_entry', entry.entry_id, f);
        }
        await this.loadBidderAttachments(entry.entry_id);
      } catch (e) {
        alert('Upload failed: ' + (e.message || e));
      } finally {
        this.bidderUploading = { ...this.bidderUploading, [entry.entry_id]: false };
      }
    },

    async registerUploadFiles(ev) {
      const files = Array.from(ev.target.files || []);
      ev.target.value = '';
      await this._registerUploadList(files);
    },
    async registerDropFiles(ev) {
      this.registerDragOver = false;
      const files = Array.from(ev.dataTransfer && ev.dataTransfer.files || []);
      await this._registerUploadList(files);
    },
    async _registerUploadList(files) {
      if (!files.length || !this.editingEntry) return;
      const id = this.editingEntry.id;
      this.registerUploading = true;
      try {
        for (const f of files) {
          await API.uploadAttachment('procurement_entry', id, f);
        }
        await this.loadBidderAttachments(id);
      } catch (e) {
        alert('Upload failed: ' + (e.message || e));
      } finally {
        this.registerUploading = false;
      }
    },
    async registerDeleteFile(entryId, att) {
      if (!confirm(`Delete "${att.original_filename}"? This cannot be undone.`)) return;
      try {
        await API.deleteAttachment(att.id);
        await this.loadBidderAttachments(entryId);
      } catch (e) { alert(e.message || 'Delete failed'); }
    },

    _stepKey(scope, group) { return `${scope}-${group.step_id || 'none'}`; },
    isStepExpanded(scope, group) {
      return !!this.stepExpanded[this._stepKey(scope, group)];
    },
    toggleStep(scope, group) {
      const k = this._stepKey(scope, group);
      this.stepExpanded = { ...this.stepExpanded, [k]: !this.stepExpanded[k] };
    },

    async downloadStepZip(group, side, packageTag) {
      const ids = (group.files || []).map(f => f.id);
      if (!ids.length) return;
      const stepLabel = (group.step_name || 'no-step').replace(/\s+/g, '_');
      const fname = `${packageTag || 'package'}_${stepLabel}_${side}.zip`;
      try {
        await API.downloadAttachmentZip(ids, fname);
      } catch (e) {
        alert('Download failed: ' + (e.message || e));
      }
    },

    async bidderSubmitGuarded(entry) {
      // Pre-flight warning: once submitted, the bidder is locked at this step
      // until the project team advances it.
      const ok = confirm(
        `Submitting will lock your bid and uploads at "${entry.current_step_name || 'the current step'}".\n` +
        `You will not be able to change anything else until the project team advances to the next step.\n\n` +
        `Do you want to proceed?`
      );
      if (!ok) return;
      await this.bidderSubmit(entry.entry_id);
      // Refresh the portal so has_current_step_submittal flips on and the UI
      // reflects the locked state without a manual reload.
      await this.loadBidderPortal();
    },
    async bidderViewFile(att) {
      // Open in an in-app full-screen viewer instead of a new browser tab.
      this.fileViewer = {
        open: true, loading: true, name: att.original_filename || 'File',
        url: null, isImage: (att.content_type || '').startsWith('image/'),
      };
      try {
        const blob = await API.fetchAttachmentBlob(att.id, true);
        if (this.fileViewer.url) URL.revokeObjectURL(this.fileViewer.url);
        this.fileViewer.url = URL.createObjectURL(blob);
      } catch (e) {
        this.fileViewer.open = false;
        alert('Could not open file: ' + e.message);
      } finally {
        this.fileViewer.loading = false;
      }
    },
    closeFileViewer() {
      if (this.fileViewer.url) {
        try { URL.revokeObjectURL(this.fileViewer.url); } catch {}
      }
      this.fileViewer = { open: false, loading: false, name: '', url: null, isImage: false };
    },
    async bidderDownloadFile(att) {
      try {
        const blob = await API.fetchAttachmentBlob(att.id, false);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = att.original_filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      } catch (e) { alert('Download failed: ' + e.message); }
    },
    async bidderDeleteFile(entryId, att) {
      if (!confirm(`Delete "${att.original_filename}"? This cannot be undone.`)) return;
      try {
        await API.deleteAttachment(att.id);
        await this.loadBidderAttachments(entryId);
      } catch (e) { alert(e.message || 'Delete failed'); }
    },
    bidderFileIcon(att) {
      const ct = att.content_type || '';
      if (ct === 'application/pdf') return '📄';
      if (ct.startsWith('image/')) return '🖼';
      if (ct.includes('word') || ct.includes('document')) return '📝';
      if (ct.includes('sheet') || ct.includes('excel')) return '📊';
      if (ct.startsWith('text/')) return '📃';
      return '📎';
    },
    bidderFmtDate(iso) {
      if (!iso) return '';
      try {
        return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      } catch { return ''; }
    },

    async loadBidderPortal() {
      this.bidderLoading = true;
      try {
        this.bidderData = await API.getMyProcurementEntries();
        // init form state per entry
        if (this.bidderData && this.bidderData.entries) {
          this.bidderData.entries.forEach(e => {
            if (!this.bidderForms[e.entry_id]) {
              this.bidderForms[e.entry_id] = {
                bid_value: e.bid_value != null ? e.bid_value : '',
                bid_currency: e.bid_currency || 'EUR',
                comment: '',
                saving: false,
                error: '',
              };
            }
          });
          // Pick a default active package: keep the previous selection if
          // it still exists in the new data, else fall back to the first.
          const ids = this.bidderData.entries.map(e => e.entry_id);
          if (!this.bidderActiveEntryId || !ids.includes(this.bidderActiveEntryId)) {
            this.bidderActiveEntryId = ids[0] || null;
          }
          // Load attachments for the (re-)active package even if the watcher
          // didn't fire (id was unchanged).
          if (this.bidderActiveEntryId) {
            this.loadBidderAttachments(this.bidderActiveEntryId);
          }
        } else {
          this.bidderActiveEntryId = null;
        }
      } catch(err) {
        console.error('Failed to load bidder portal', err);
      } finally {
        this.bidderLoading = false;
      }
    },

    async bidderSubmit(entryId) {
      const form = this.bidderForms[entryId];
      if (!form) return;
      form.saving = true;
      form.error = '';
      try {
        const payload = { comment: form.comment || null };
        if (form.bid_value !== '' && form.bid_value != null) {
          payload.bid_value = parseFloat(form.bid_value);
          payload.bid_currency = form.bid_currency;
        }
        await API.bidderUpdateEntry(entryId, payload);
        form.comment = '';
        await this.loadBidderPortal();
      } catch(err) {
        form.error = err.message || 'Failed to save';
      } finally {
        form.saving = false;
      }
    },

    bidderStepStatusClass(status) {
      return { completed: 'text-emerald-600', current: 'text-blue-600 font-semibold', upcoming: 'text-gray-400' }[status] || 'text-gray-400';
    },

    bidderStepDotClass(status) {
      return { completed: 'bg-emerald-500', current: 'bg-blue-500 ring-2 ring-blue-200', upcoming: 'bg-gray-200' }[status] || 'bg-gray-200';
    },

    renderProcChart() {
      if (typeof Chart === 'undefined' || !this.dashboardData) return;
      if (this.procChartObj) { this.procChartObj.destroy(); this.procChartObj = null; }
      if (!this.$refs.procChart) return;

      const forecast = this.dashboardData.forecast_series;
      const actual = this.dashboardData.actual_series;

      const allDates = [...new Set([
        ...forecast.map(p => p.date),
        ...actual.map(p => p.date),
      ])].sort();

      if (allDates.length === 0) return;

      const earliest = new Date(allDates[0]);
      earliest.setDate(earliest.getDate() - 7);
      const zeroDate = earliest.toISOString().slice(0, 10);
      const labels = [zeroDate, ...allDates];

      const fMap = Object.fromEntries(forecast.map(p => [p.date, p.progress]));
      const aMap = Object.fromEntries(actual.map(p => [p.date, p.progress]));

      const _tomorrow = new Date();
      _tomorrow.setDate(_tomorrow.getDate() + 1);
      const cutoffStr = _tomorrow.getFullYear() + '-' +
        String(_tomorrow.getMonth() + 1).padStart(2, '0') + '-' +
        String(_tomorrow.getDate()).padStart(2, '0');

      const fValues = [0];
      const aValues = [0];
      let lastF = 0, lastA = 0;
      for (const d of allDates) {
        if (fMap[d] !== undefined) lastF = fMap[d];
        if (aMap[d] !== undefined) lastA = aMap[d];
        fValues.push(lastF);
        aValues.push(d < cutoffStr ? lastA : null);
      }

      // Adaptive point spacing — thin markers out when the timeline has
      // many dates so points don't visually pile up. The line itself still
      // passes through every data point; only the dots are sparser.
      const nPts = labels.length;
      const stride = Math.max(1, Math.ceil(nPts / 20));
      const pointRadiusFn = (baseSize) => (ctx) => {
        const i = ctx.dataIndex;
        if (i === 0 || i === nPts - 1) return baseSize + 1;
        return i % stride === 0 ? baseSize : 0;
      };

      this.procChartObj = new Chart(this.$refs.procChart, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Forecast',
              data: fValues,
              borderColor: '#00AEEF',
              backgroundColor: 'rgba(0,174,239,0.08)',
              borderDash: [6, 3],
              borderWidth: 2,
              pointRadius: pointRadiusFn(3),
              pointHoverRadius: 5,
              fill: false,
              tension: 0.1,
            },
            {
              label: 'Actual',
              data: aValues,
              borderColor: '#10B981',
              backgroundColor: 'rgba(16,185,129,0.08)',
              borderWidth: 2,
              pointRadius: pointRadiusFn(3),
              pointHoverRadius: 5,
              fill: false,
              tension: 0.1,
            },
          ],
        },
        options: {
          responsive: true,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 14 } },
            tooltip: {
              callbacks: {
                label: ctx => ctx.dataset.label + ': ' + (ctx.parsed.y != null ? ctx.parsed.y.toFixed(1) + '%' : '\u2014'),
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
            y: {
              min: 0, max: 100,
              grid: { color: '#F3F4F6' },
              ticks: { font: { size: 10 }, callback: v => v + '%' },
            },
          },
        },
      });
    },

    async loadPlans() {
      this.planLoading = true;
      try {
        const [data, companies, bidderUsers] = await Promise.all([
          API.getProcurementPlans(),
          API.getBiddingCompanies(),
          API.getBidderUsers(),
        ]);
        this.sequenceValidated = data.sequence_validated;
        this.plans = data.plans || [];
        this.biddingCompanies = companies || [];
        this.bidderUsers = bidderUsers || [];
        this.refreshCompanyRows();
      } catch (e) {
        console.error('Failed to load procurement plans', e);
      } finally {
        this.planLoading = false;
      }
    },

    // ── Steps ──────────────────────────────────────────────────────────────
    openStepForm(step) {
      this.editingStep = step;
      if (step) {
        this.stepForm = {
          step_id: step.step_id,
          description: step.description || '',
          weightPct: parseFloat((step.weight * 100).toFixed(2)),
          sort_order: step.sort_order,
          updated_at: step.updated_at || null,
        };
      } else {
        const nextOrder = this.steps.length;
        this.stepForm = { step_id: '', description: '', weightPct: 0, sort_order: nextOrder, updated_at: null };
      }
      this.stepError = '';
      this.showStepForm = true;
    },

    async saveStep() {
      if (!this.stepForm.step_id.trim()) { this.stepError = 'Step name is required.'; return; }
      const w = Number(this.stepForm.weightPct);
      if (isNaN(w) || w < 0 || w > 100) { this.stepError = 'Weight must be between 0 and 100.'; return; }
      this.stepSaving = true;
      this.stepError = '';
      try {
        const body = {
          step_id: this.stepForm.step_id.trim(),
          description: this.stepForm.description || null,
          weight: w / 100,
          sort_order: this.stepForm.sort_order || 0,
          updated_at: this.stepForm.updated_at || null,
        };
        if (this.editingStep) {
          await API.updateProcurementStep(this.editingStep.id, body);
        } else {
          await API.createProcurementStep(body);
        }
        this.showStepForm = false;
        await this.load();
      } catch (e) {
        this.stepError = e.status === 409
          ? 'This step was modified by another user. Please close and reopen to get the latest version.'
          : e.message;
      } finally {
        this.stepSaving = false;
      }
    },

    async deleteStep(step) {
      if (!confirm(`Delete step "${step.step_id}"? This cannot be undone.`)) return;
      try {
        await API.deleteProcurementStep(step.id);
        await this.load();
      } catch (e) {
        alert(e.message);
      }
    },

    // ── Contract Types ──────────────────────────────────────────────────────
    openCtForm(ct) {
      this.editingCt = ct;
      if (ct) {
        this.ctForm = {
          name: ct.name,
          description: ct.description || '',
          sort_order: ct.sort_order,
          updated_at: ct.updated_at || null,
        };
      } else {
        this.ctForm = { name: '', description: '', sort_order: this.contractTypes.length, updated_at: null };
      }
      this.ctError = '';
      this.showCtForm = true;
    },

    async saveCt() {
      if (!this.ctForm.name.trim()) { this.ctError = 'Name is required.'; return; }
      this.ctSaving = true;
      this.ctError = '';
      try {
        const body = {
          name: this.ctForm.name.trim(),
          description: this.ctForm.description || null,
          sort_order: this.ctForm.sort_order || 0,
          updated_at: this.ctForm.updated_at || null,
        };
        if (this.editingCt) {
          await API.updateContractType(this.editingCt.id, body);
        } else {
          await API.createContractType(body);
        }
        this.showCtForm = false;
        await this.load();
      } catch (e) {
        this.ctError = e.status === 409
          ? 'This contract type was modified by another user. Please close and reopen to get the latest version.'
          : e.message;
      } finally {
        this.ctSaving = false;
      }
    },

    async deleteCt(ct) {
      if (!confirm(`Delete contract type "${ct.name}"? This cannot be undone.`)) return;
      try {
        await API.deleteContractType(ct.id);
        await this.load();
      } catch (e) {
        alert(e.message);
      }
    },

    async deleteAllSteps() {
      if (!confirm(`Remove all ${this.steps.length} procurement step(s)? This cannot be undone.`)) return;
      try {
        for (const step of [...this.steps]) {
          await API.deleteProcurementStep(step.id);
        }
        await this.load();
      } catch (e) {
        alert(e.message);
      }
    },

    async deleteAllContractTypes() {
      if (!confirm(`Remove all ${this.contractTypes.length} contract type(s)? This cannot be undone.`)) return;
      try {
        for (const ct of [...this.contractTypes]) {
          await API.deleteContractType(ct.id);
        }
        await this.load();
      } catch (e) {
        alert(e.message);
      }
    },

    // ── Sequence validation ─────────────────────────────────────────────────
    async validateSequence() {
      if (!confirm('Validate the Procurement Sequence? Steps will be locked from editing until unvalidated.')) return;
      try {
        await API.validateSequence();
        await this.load();
      } catch (e) {
        alert(e.message);
      }
    },

    async unvalidateSequence() {
      if (!confirm('Unvalidate the sequence? Steps can be edited again, but existing Procurement Plans should be reviewed for consistency.')) return;
      try {
        await API.unvalidateSequence();
        await this.load();
      } catch (e) {
        alert(e.message);
      }
    },

    // ── Plan editing ────────────────────────────────────────────────────────
    planHasDates(plan) {
      return this.steps.some(s => plan.step_dates && plan.step_dates[String(s.id)]);
    },

    // ── Register ────────────────────────────────────────────────────────────
    async loadRegister() {
      this.registerLoading = true;
      try {
        const data = await API.getRegister();
        this.register = data.packages;
        this.registerOverallProgress = data.overall_progress;
      } catch (e) {
        console.error('Failed to load register', e);
      } finally {
        this.registerLoading = false;
      }
    },

    isPackageCollapsed(pkgId) {
      return !!this.registerCollapsed[pkgId];
    },
    togglePackageCollapse(pkgId) {
      const next = { ...this.registerCollapsed };
      if (next[pkgId]) delete next[pkgId];
      else next[pkgId] = true;
      this.registerCollapsed = next;
    },
    allRegisterCollapsed() {
      // True when every package in the register is currently collapsed.
      const ids = (this.register || []).map(p => p.package_id);
      if (!ids.length) return false;
      return ids.every(id => this.registerCollapsed[id]);
    },
    toggleAllRegisterCollapse() {
      const ids = (this.register || []).map(p => p.package_id);
      if (this.allRegisterCollapsed()) {
        // Expand all
        this.registerCollapsed = {};
      } else {
        // Collapse all
        const next = {};
        for (const id of ids) next[id] = true;
        this.registerCollapsed = next;
      }
    },

    canEditEntry(entry, pkg) {
      const role = this.currentUser?.role;
      if (['ADMIN', 'PROJECT_OWNER'].includes(role)) return true;
      if (role === 'PROJECT_TEAM') {
        return this.currentUser?.contact_id != null &&
               pkg.package_owner_contact_id === this.currentUser.contact_id;
      }
      return false;
    },

    openEntryView(entry, pkg) {
      this.viewingEntry = entry;
      this.viewingEntryPkg = pkg;
      this.viewAttTab = 'project';
      this.loadBidderAttachments(entry.id);
    },
    closeEntryView() {
      this.viewingEntry = null;
      this.viewingEntryPkg = null;
    },
    editFromView() {
      const entry = this.viewingEntry;
      const pkg = this.viewingEntryPkg;
      if (!entry) return;
      this.closeEntryView();
      this.openRegisterEdit(entry, pkg);
    },

    openRegisterEdit(entry, pkg) {
      this.editingEntry = entry;
      this.editingEntryPkg = pkg;
      this.registerAttTab = 'project';
      this.registerDragOver = false;
      // Load attachments so the new tabs render straight away.
      this.loadBidderAttachments(entry.id);
      this.registerForm = {
        status: entry.status,
        exclusion_reason: entry.exclusion_reason || '',
        technical_compliance: entry.technical_compliance || null,
        technical_compliance_note: entry.technical_compliance_note || '',
        commercial_compliance: entry.commercial_compliance || null,
        commercial_compliance_note: entry.commercial_compliance_note || '',
        bid_value: entry.bid_value,
        bid_currency: entry.bid_currency || 'EUR',
        comment: '',
        updated_at: entry.updated_at || null,
      };
      this.registerError = '';
      this.awardingEntry = null;
      this.awardComment = '';
    },

    async saveRegisterEntry() {
      this.registerSaving = true;
      this.registerError = '';
      try {
        if (this.registerForm.status === 'EXCLUDED' && !this.registerForm.exclusion_reason.trim()) {
          this.registerError = 'Exclusion reason is required when excluding a company.';
          this.registerSaving = false;
          return;
        }
        await API.updateRegisterEntry(this.editingEntry.id, {
          status: this.registerForm.status,
          exclusion_reason: this.registerForm.exclusion_reason || null,
          technical_compliance: this.registerForm.technical_compliance,
          technical_compliance_note: this.registerForm.technical_compliance_note || null,
          commercial_compliance: this.registerForm.commercial_compliance,
          commercial_compliance_note: this.registerForm.commercial_compliance_note || null,
          bid_value: this.registerForm.bid_value,
          bid_currency: this.registerForm.bid_currency,
          comment: this.registerForm.comment || null,
          updated_at: this.registerForm.updated_at,
        });
        this.editingEntry = null;
        await this.loadRegister();
      } catch (e) {
        this.registerError = e.status === 409
          ? 'This entry was modified by another user. Please cancel and reopen.'
          : e.message;
      } finally {
        this.registerSaving = false;
      }
    },

    async confirmAward() {
      const entry = this.editingEntry;
      try {
        await API.awardEntry(entry.id, { comment: this.awardComment || null });
        this.editingEntry = null;
        this.awardingEntry = null;
        this.awardComment = '';
        await this.loadRegister();
        this.openCreateOrderModal(entry, true);
      } catch (e) {
        this.registerError = e.message;
      }
    },

    openCreateOrderModal(entry, forced = false) {
      this.createOrderEntry = entry;
      const today = new Date().toISOString().slice(0, 10);
      this.createOrderForced = forced;
      const pkgTag = this.createOrderEntryPkgLabel;
      this.createOrderForm = {
        po_number: '',
        description: `Order resulting from procurement process — ${entry.company_name}${pkgTag ? ' / ' + pkgTag : ''}`,
        amount: entry.bid_value || 0,
        currency: this.projectCurrency,
        order_date: today,
        assign_vendor_role: true,
      };
      this.createOrderError = '';
      this.createOrderDone = false;
      this.showCreateOrderModal = true;
    },

    closeCreateOrderModal() {
      this.showCreateOrderModal = false;
      this.createOrderForced = false;
    },

    handleCreateOrderOverlayClick() {
      if (this.createOrderForced && !this.createOrderDone) return;
      this.closeCreateOrderModal();
    },

    async submitCreateOrder() {
      this.createOrderError = '';
      if (!this.createOrderForm.po_number.trim()) {
        this.createOrderError = 'PO Number is required.';
        return;
      }
      this.createOrderSaving = true;
      try {
        await API.createOrderFromAward(this.createOrderEntry.id, {
          po_number: this.createOrderForm.po_number.trim(),
          description: this.createOrderForm.description || null,
          amount: this.createOrderForm.amount || 0,
          currency: this.projectCurrency,
          order_date: this.createOrderForm.order_date || null,
          assign_vendor_role: this.createOrderForm.assign_vendor_role,
        });
        this.createOrderDone = true;
      } catch (e) {
        this.createOrderError = e.message || 'Failed to create order.';
      } finally {
        this.createOrderSaving = false;
      }
    },

    openStepAction(entry, pkg, dir) {
      this.stepActionEntry = entry;
      this.stepActionPkg = pkg;
      this.stepActionDir = dir;
      this.stepActionComment = '';
      this.stepActionError = '';
    },

    async confirmStepAction() {
      this.stepActionSaving = true;
      this.stepActionError = '';
      try {
        const body = { comment: this.stepActionComment || null };
        if (this.stepActionDir === 'advance') {
          await API.advanceStep(this.stepActionEntry.id, body);
        } else {
          await API.revertStep(this.stepActionEntry.id, body);
        }
        this.stepActionEntry = null;
        await this.loadRegister();
      } catch (e) {
        this.stepActionError = e.message;
      } finally {
        this.stepActionSaving = false;
      }
    },

    async openEvents(entry) {
      this.showEventsEntry = entry;
      this.eventsLoading = true;
      this.entryEvents = [];
      try {
        this.entryEvents = await API.getEntryEvents(entry.id);
      } catch (e) {
        console.error(e);
      } finally {
        this.eventsLoading = false;
      }
    },

    statusLabel(s) {
      return { COMPETING: 'Competing', EXCLUDED: 'Excluded', AWAITING: 'Awaiting', AWARDED: 'Awarded' }[s] || s;
    },

    statusBadgeClass(s) {
      return {
        COMPETING: 'bg-blue-100 text-blue-700',
        EXCLUDED: 'bg-red-100 text-red-600',
        AWAITING: 'bg-amber-100 text-amber-700',
        AWARDED: 'bg-emerald-100 text-emerald-700',
      }[s] || 'bg-gray-100 text-gray-600';
    },

    complianceLabel(v) {
      return { PASS: 'Pass', FAIL: 'Fail', PENDING: 'Pending', NA: 'N/A', null: '\u2014', undefined: '\u2014' }[v] || '\u2014';
    },

    complianceBadgeClass(v) {
      return {
        PASS: 'bg-emerald-50 text-emerald-700',
        FAIL: 'bg-red-50 text-red-600',
        PENDING: 'bg-amber-50 text-amber-700',
        NA: 'bg-gray-100 text-gray-500',
      }[v] || 'bg-transparent text-gray-300';
    },

    // Bordered-card colour helpers used by the bidder portal and the View
    // modal. Stored values are PASS / FAIL / PENDING / NA \u2014 the previous
    // hardcoded `=== 'YES'` check was stale and rendered everything red.
    complianceCardBorder(v) {
      if (v === 'PASS')    return 'border-emerald-200 bg-emerald-50';
      if (v === 'FAIL')    return 'border-red-200 bg-red-50';
      if (v === 'PENDING') return 'border-amber-200 bg-amber-50';
      return 'border-gray-200 bg-gray-50';
    },
    complianceCardHeader(v) {
      if (v === 'PASS')    return 'text-emerald-600';
      if (v === 'FAIL')    return 'text-red-600';
      if (v === 'PENDING') return 'text-amber-600';
      return 'text-gray-500';
    },
    complianceCardValue(v) {
      if (v === 'PASS')    return 'text-emerald-700';
      if (v === 'FAIL')    return 'text-red-700';
      if (v === 'PENDING') return 'text-amber-700';
      return 'text-gray-700';
    },

    bidVsBudgetClass(bid, budget) {
      const pct = bid / budget * 100;
      if (pct <= 100) return 'text-emerald-600';
      if (pct <= 110) return 'text-amber-600';
      return 'text-red-600';
    },

    eventTypeLabel(t) {
      return { COMMENT: 'Comment', BIDDER_COMMENT: 'Bidder comment', BIDDER_SUBMITTAL: 'Bidder submittal', STEP_ADVANCE: 'Step advanced', STEP_REVERT: 'Step reverted', STATUS_CHANGE: 'Status changed', AWARD: 'Contract awarded', EVALUATION: 'Evaluation updated', ORDER_CREATED: 'Budget order created' }[t] || t;
    },

    eventTypeClass(t) {
      return { COMMENT: 'bg-gray-400', BIDDER_COMMENT: 'bg-indigo-400', BIDDER_SUBMITTAL: 'bg-indigo-600', STEP_ADVANCE: 'bg-blue-500', STEP_REVERT: 'bg-orange-400', STATUS_CHANGE: 'bg-amber-500', AWARD: 'bg-emerald-500', EVALUATION: 'bg-purple-500', ORDER_CREATED: 'bg-blue-700' }[t] || 'bg-gray-400';
    },

    fmtDateTime(iso) {
      if (!iso) return '\u2014';
      const d = new Date(iso);
      const tz = (window.AppSettings && window.AppSettings.timezone) || undefined;
      return d.toLocaleDateString([], { timeZone: tz }) + ' ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz });
    },

    canEditPlan(plan) {
      const role = this.currentUser?.role;
      if (['ADMIN', 'PROJECT_OWNER'].includes(role)) return true;
      if (role === 'PROJECT_TEAM') {
        return this.currentUser?.contact_id != null &&
               plan.package_owner_contact_id === this.currentUser.contact_id;
      }
      return false;
    },

    openPlanEdit(plan) {
      if (!this.canEditPlan(plan)) return;
      const stepDates = {};
      for (const s of this.steps) {
        stepDates[String(s.id)] = (plan.step_dates && plan.step_dates[String(s.id)]) || '';
      }
      this.planForm = {
        contract_type_id: plan.contract_type_id || null,
        notes: plan.notes || '',
        bidder_ids: [...(plan.bidding_company_ids || [])],
        step_dates: stepDates,
        not_applicable: !!plan.not_applicable,
        updated_at: plan.updated_at || null,
      };
      this.editingPlanPackageId = plan.package_id;
      this.planError = '';
      this.bidderSearch = '';
      this.showPlanModal = true;
    },

    cancelPlanEdit() {
      this.editingPlanPackageId = null;
      this.planError = '';
      this.showPlanModal = false;
    },

    editingPlan() {
      // Helper for the modal — find the plan record currently being edited.
      if (!this.editingPlanPackageId) return null;
      return this.plans.find(p => p.package_id === this.editingPlanPackageId) || null;
    },

    async savePlan(plan) {
      // Allow calling with no arg from the modal (uses editingPlan())
      const target = plan || this.editingPlan();
      if (!target) return;
      this.planSaving = true;
      this.planError = '';
      try {
        // Filter out empty step dates before sending
        const stepDates = {};
        for (const [k, v] of Object.entries(this.planForm.step_dates)) {
          if (v) stepDates[k] = v;
        }
        await API.upsertPackagePlan(target.package_id, {
          contract_type_id: this.planForm.contract_type_id,
          notes: this.planForm.notes || null,
          bidder_ids: this.planForm.bidder_ids,
          step_dates: stepDates,
          not_applicable: !!this.planForm.not_applicable,
          updated_at: this.planForm.updated_at,
        });
        this.editingPlanPackageId = null;
        this.showPlanModal = false;
        await this.loadPlans();
      } catch (e) {
        this.planError = e.status === 409
          ? 'This plan was modified by another user. Please cancel and reopen to get the latest version.'
          : e.message;
      } finally {
        this.planSaving = false;
      }
    },

    // ── Bidding Company management ───────────────────────────────────────────
    openCompanyForm(co) {
      this.editingCompany = co;
      this.companyForm = co
        ? { name: co.name, description: co.description || '', website: co.website || '', updated_at: co.updated_at || null }
        : { name: '', description: '', website: '', updated_at: null };
      this.companyError = '';
      this.showCompanyForm = true;
    },

    async saveCompany() {
      if (!this.companyForm.name.trim()) { this.companyError = 'Company name is required.'; return; }
      this.companySaving = true;
      this.companyError = '';
      try {
        const body = {
          name: this.companyForm.name.trim(),
          description: this.companyForm.description || null,
          website: this.companyForm.website || null,
          updated_at: this.companyForm.updated_at || null,
        };
        if (this.editingCompany) {
          await API.updateBiddingCompany(this.editingCompany.id, body);
        } else {
          await API.createBiddingCompany(body);
        }
        this.showCompanyForm = false;
        await this.loadPlans();
      } catch (e) {
        this.companyError = e.message;
      } finally {
        this.companySaving = false;
      }
    },

    async deleteCompany(co) {
      if (!confirm(`Delete bidding company "${co.name}"? This will also remove it from all package plans.`)) return;
      try {
        await API.deleteBiddingCompany(co.id);
        await this.loadPlans();
      } catch (e) { alert(e.message); }
    },

    async addCompanyContact(companyId) {
      if (!this.addContactUserId) return;
      try {
        await API.addBiddingCompanyContact(companyId, this.addContactUserId);
        this.addContactCompanyId = null;
        this.addContactUserId = null;
        await this.loadPlans();
      } catch (e) { alert(e.message); }
    },

    async removeCompanyContact(companyId, userId) {
      try {
        await API.removeBiddingCompanyContact(companyId, userId);
        await this.loadPlans();
      } catch (e) { alert(e.message); }
    },

    availableBidderUsersFor(co) {
      const linked = new Set((co.contacts || []).map(c => c.user_id));
      return this.bidderUsers.filter(u => !linked.has(u.id));
    },

    // ── Bidding Companies inline-editable table ─────────────────────────
    refreshCompanyRows() {
      // Preserve the in-flight "new row" if any (no id yet, dirty by default).
      const newDraft = this.companyRows.find(r => r.id === null);
      const next = (this.biddingCompanies || []).map(co => this.companyRowFromRecord(co));
      if (newDraft) next.push(newDraft);
      this.companyRows = next;
    },
    companyRowFromRecord(co) {
      return {
        id: co.id,
        localKey: 'co-' + co.id,
        name: co.name || '',
        description: co.description || '',
        website: co.website || '',
        contacts: co.contacts || [],
        package_ids: [...(co.package_ids || [])],
        updated_at: co.updated_at || null,
        _orig: {
          name: co.name || '',
          description: co.description || '',
          website: co.website || '',
        },
      };
    },
    isCompanyRowDirty(row) {
      if (!row.id) return true;            // new row
      return row.name !== row._orig.name
          || row.description !== row._orig.description
          || row.website !== row._orig.website;
    },
    addNewCompanyRow() {
      // Avoid stacking multiple drafts
      if (this.companyRows.some(r => r.id === null)) return;
      this.companyRows.push({
        id: null,
        localKey: 'co-new-' + Date.now(),
        name: '',
        description: '',
        website: '',
        contacts: [],
        package_ids: [],
        updated_at: null,
        _orig: { name: '', description: '', website: '' },
      });
    },
    discardCompanyRow(row) {
      if (!row.id) {
        // Drop the new draft
        this.companyRows = this.companyRows.filter(r => r !== row);
        return;
      }
      // Restore from server copy
      const orig = this.biddingCompanies.find(c => c.id === row.id);
      if (orig) {
        const idx = this.companyRows.indexOf(row);
        if (idx !== -1) this.companyRows.splice(idx, 1, this.companyRowFromRecord(orig));
      }
    },
    async saveCompanyRow(row) {
      if (!row.name.trim()) {
        this.companyRowError = { ...this.companyRowError, [row.localKey]: 'Name is required.' };
        return;
      }
      const k = row.localKey;
      this.companyRowSaving = { ...this.companyRowSaving, [k]: true };
      this.companyRowError = { ...this.companyRowError, [k]: null };
      try {
        const body = {
          name: row.name.trim(),
          description: row.description.trim() || null,
          website: row.website.trim() || null,
          updated_at: row.updated_at || null,
        };
        if (row.id) {
          await API.updateBiddingCompany(row.id, body);
        } else {
          await API.createBiddingCompany(body);
        }
        // Drop any lingering new draft, reload
        this.companyRows = this.companyRows.filter(r => r.id !== null);
        await this.loadPlans();
      } catch (e) {
        this.companyRowError = { ...this.companyRowError, [k]: e.message || 'Save failed' };
      } finally {
        const next = { ...this.companyRowSaving };
        delete next[k];
        this.companyRowSaving = next;
      }
    },
    async deleteCompanyRow(row) {
      if (!row.id) {
        this.discardCompanyRow(row);
        return;
      }
      if (!confirm(`Delete bidding company "${row.name}"? This will also remove it from all package plans.`)) return;
      try {
        await API.deleteBiddingCompany(row.id);
        await this.loadPlans();
      } catch (e) { alert(e.message); }
    },
    togglePackageForRow(row, packageId) {
      const idx = row.package_ids.indexOf(packageId);
      if (idx === -1) row.package_ids.push(packageId);
      else row.package_ids.splice(idx, 1);
    },
    async saveCompanyPackages(row) {
      if (!row.id) return;
      const k = row.localKey;
      this.companyRowSaving = { ...this.companyRowSaving, [k]: true };
      try {
        await API.setBiddingCompanyPackages(row.id, row.package_ids);
        this.pkgPickerOpenForRow = null;
        await this.loadPlans();
      } catch (e) {
        alert(e.message || 'Failed to update linked packages');
        // Restore the original list
        const orig = this.biddingCompanies.find(c => c.id === row.id);
        if (orig) row.package_ids = [...(orig.package_ids || [])];
      } finally {
        const next = { ...this.companyRowSaving };
        delete next[k];
        this.companyRowSaving = next;
      }
    },
    cancelPackagePicker(row) {
      const orig = this.biddingCompanies.find(c => c.id === row.id);
      if (orig) row.package_ids = [...(orig.package_ids || [])];
      this.pkgPickerOpenForRow = null;
    },
    packageDisplay(packageId) {
      const p = this.plans.find(x => x.package_id === packageId);
      return p ? p.package_tag : `#${packageId}`;
    },

    companyDisplay(companyId) {
      const co = this.biddingCompanies.find(x => x.id === companyId);
      return co ? co.name : `Company #${companyId}`;
    },

    fmtCurrency(amount, currency) {
      if (!amount && amount !== 0) return '—';
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0,
      }).format(amount);
    },

    // ── Export / Import ───────────────────────────────────────────────────────
    async exportPlanExcel() {
      this.planExporting = true;
      try {
        const date = new Date().toISOString().split('T')[0];
        await API.download('/api/procurement/plan/export/excel', `procurement_plan_${date}.xlsx`);
      } catch (e) {
        alert('Export failed: ' + e.message);
      } finally { this.planExporting = false; }
    },

    async exportProcPlan() {
      try { await API.exportProcurementPlans(); }
      catch (e) { alert(e.message || 'Export failed'); }
    },
    openProcImportModal() {
      this.showProcImportModal = true;
      this.procImportFile = null;
      this.procImportPreview = null;
      this.procImportError = '';
      this.procImportResult = null;
    },
    resetProcImport() {
      if (this.procImportPreview) {
        this.procImportPreview = null;
        this.procImportError = '';
      } else {
        this.showProcImportModal = false;
      }
    },
    onProcImportFileChange(e) {
      this.procImportFile = e.target.files[0] || null;
      this.procImportError = '';
    },
    async runProcImportPreview() {
      if (!this.procImportFile) return;
      this.procImportLoading = true;
      this.procImportError = '';
      try {
        this.procImportPreview = await API.previewProcurementImport(this.procImportFile);
      } catch (e) {
        this.procImportError = e.message || 'Preview failed';
      } finally {
        this.procImportLoading = false;
      }
    },
    async applyProcImport() {
      if (!this.procImportPreview) return;
      const summary = this.procImportPreview.summary || {};
      // If some rows have errors, ask for explicit confirmation before
      // importing the clean ones. The backend already skips error rows.
      if (summary.errors > 0) {
        const ok = confirm(
          `${summary.errors} row(s) have errors and will be skipped.\n` +
          `Continue and import the ${summary.creates + summary.updates} clean row(s)?`
        );
        if (!ok) return;
      }
      this.procImportApplying = true;
      this.procImportError = '';
      try {
        this.procImportResult = await API.applyProcurementImport({ rows: this.procImportPreview.rows });
      } catch (e) {
        this.procImportError = e.message || 'Import failed';
      } finally {
        this.procImportApplying = false;
      }
    },

    async exportExcel() {
      this.exporting = true;
      try {
        const date = new Date().toISOString().split('T')[0];
        await API.download(`/api/procurement/register/export/excel`, `procurement_register_${date}.xlsx`);
      } catch (e) {
        alert('Export failed: ' + e.message);
      } finally {
        this.exporting = false;
      }
    },
  },
});
