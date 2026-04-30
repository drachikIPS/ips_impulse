// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Component
// ─────────────────────────────────────────────────────────────────────────────
app.component('dashboard-view', {
  props: ['currentUser', 'meetingTypes'],
  template: `
    <div>
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h3 class="text-lg font-semibold text-gray-800">Dashboard</h3>
        <div class="flex items-center gap-3">
          <!-- Meeting Type Filter -->
          <div class="flex items-center gap-2">
            <label class="text-xs font-semibold text-gray-500 whitespace-nowrap">Meeting Type</label>
            <select v-model="meetingTypeFilter" class="input-field py-1 text-sm w-44">
              <option value="">All Types</option>
              <option v-for="mt in (meetingTypes || [])" :key="mt.id" :value="mt.id">{{ mt.name }}</option>
            </select>
          </div>
          <button @click="load" class="btn-secondary text-sm">
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-4 gap-4 mb-5">
        <div class="card text-white" style="background:linear-gradient(135deg,#00AEEF,#0090cc)">
          <p class="text-sm opacity-80">Total Points</p>
          <p class="text-3xl font-bold mt-1">{{ summary.total_points || 0 }}</p>
          <p class="text-xs opacity-60 mt-1">all meeting points</p>
        </div>
        <div class="card text-white" style="background:linear-gradient(135deg,#EF4444,#DC2626)">
          <p class="text-sm opacity-80">Overdue</p>
          <p class="text-3xl font-bold mt-1">{{ summary.overdue || 0 }}</p>
          <p class="text-xs opacity-60 mt-1">past due date</p>
        </div>
        <div class="card text-white" style="background:linear-gradient(135deg,#F59E0B,#D97706)">
          <p class="text-sm opacity-80">Open Actions</p>
          <p class="text-3xl font-bold mt-1">{{ summary.open_actions || 0 }}</p>
          <p class="text-xs opacity-60 mt-1">not yet closed</p>
        </div>
        <div class="card text-white" style="background:linear-gradient(135deg,#10B981,#059669)">
          <p class="text-sm opacity-80">Due This Week</p>
          <p class="text-3xl font-bold mt-1">{{ summary.upcoming_7_days || 0 }}</p>
          <p class="text-xs opacity-60 mt-1">next 7 days</p>
        </div>
      </div>

      <!-- Charts row — 4 columns -->
      <div class="grid grid-cols-4 gap-4 mb-5">
        <!-- Status Bar Chart -->
        <div class="card py-3 px-4">
          <h4 class="font-semibold text-gray-700 text-sm mb-3">Points by Status</h4>
          <canvas ref="statusChart" height="130"></canvas>
        </div>

        <!-- Type Doughnut -->
        <div class="card py-3 px-4">
          <h4 class="font-semibold text-gray-700 text-sm mb-3">Points by Type</h4>
          <canvas ref="typeChart" height="130"></canvas>
          <div class="mt-2 space-y-1">
            <div v-for="(count, type) in summary.by_type" :key="type" class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-1.5">
                <div class="w-2.5 h-2.5 rounded-full" :style="{ background: typeColor(type) }"></div>
                <span class="text-gray-500">{{ typeLabel(type) }}</span>
              </div>
              <span class="font-semibold text-gray-600">{{ count }}</span>
            </div>
          </div>
        </div>

        <!-- Open Points by Person -->
        <div class="card py-3 px-4 col-span-2">
          <h4 class="font-semibold text-gray-700 text-sm mb-3">Open Points by Person</h4>
          <div class="grid grid-cols-2 gap-x-6 gap-y-2">
            <div v-if="byResponsible.length === 0" class="col-span-2 text-gray-400 text-xs text-center py-2">No data</div>
            <div v-for="r in byResponsible.slice(0, 8)" :key="r.name" class="flex items-center gap-2">
              <div class="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0" style="background:#00AEEF; font-size:9px; font-weight:700">
                {{ (r.name || '').split(' ').map(w => w[0] || '').join('').slice(0,2).toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex justify-between text-xs mb-0.5">
                  <span class="text-gray-600 font-medium truncate">{{ r.name }}</span>
                  <span class="text-gray-500 ml-1 shrink-0">{{ r.open_points }}</span>
                </div>
                <div class="h-1 bg-gray-100 rounded-full">
                  <div class="h-1 rounded-full" style="background:#00AEEF"
                    :style="{ width: maxResp > 0 ? (r.open_points / maxResp * 100) + '%' : '0%' }"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Second row: Meetings per Month -->
      <div class="grid grid-cols-1 gap-4 mb-5">
        <div class="card py-3 px-4">
          <h4 class="font-semibold text-gray-700 text-sm mb-3">Meetings per Month</h4>
          <div v-if="!meetingsPerMonth.length" class="flex items-center justify-center h-24 text-gray-300 text-xs">No data</div>
          <canvas v-else ref="meetingsMonthChart" height="80"></canvas>
        </div>
      </div>

      <!-- Third row: Cumulative Open vs Closed Points per Week -->
      <div class="grid grid-cols-1 gap-4 mb-5">
        <div class="card py-3 px-4">
          <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h4 class="font-semibold text-gray-700 text-sm">Open vs Closed Points (cumulative, per week)</h4>
            <div class="flex items-center gap-3 text-xs">
              <span class="inline-flex items-center gap-1.5 text-gray-600">
                <span class="inline-block w-3 h-3 rounded-sm" style="background:#F59E0B"></span>Still open
              </span>
              <span class="inline-flex items-center gap-1.5 text-gray-600">
                <span class="inline-block w-3 h-3 rounded-sm" style="background:#10B981"></span>Closed
              </span>
            </div>
          </div>
          <div v-if="!pointsPerWeek.length" class="flex items-center justify-center h-24 text-gray-300 text-xs">No data</div>
          <div v-else class="overflow-x-auto" ref="weeklyScroll" style="-webkit-overflow-scrolling:touch">
            <div :style="{ width: weeklyChartWidth + 'px', minWidth: '100%', height: '240px' }">
              <canvas ref="weeklyPointsChart"></canvas>
            </div>
          </div>
        </div>
      </div>

      <!-- Upcoming Deadlines -->
      <div class="card mb-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:#FEF3C7">
              <svg class="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <h4 class="font-semibold text-gray-800">Upcoming Deadlines</h4>
          </div>
          <select v-model="upcomingDays" @change="loadUpcoming" class="input-field w-28 text-sm py-1">
            <option :value="7">7 days</option>
            <option :value="14">14 days</option>
            <option :value="30">30 days</option>
          </select>
        </div>
        <div v-if="upcoming.length === 0" class="text-gray-400 text-sm text-center py-6">
          No upcoming deadlines in the next {{ upcomingDays }} days
        </div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400 border-b border-gray-100">
              <th class="pb-2 font-semibold">Topic</th>
              <th class="pb-2 font-semibold">Type</th>
              <th class="pb-2 font-semibold">Responsible</th>
              <th class="pb-2 font-semibold">Due Date</th>
              <th class="pb-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in upcoming" :key="p.id" class="border-b border-gray-50 hover:bg-gray-50">
              <td class="py-2.5 text-gray-800 font-medium">{{ p.topic }}</td>
              <td class="py-2.5"><span :class="typeClass(p.type)" class="type-badge">{{ p.type[0] }}</span></td>
              <td class="py-2.5 text-gray-600">
                {{ p.responsible_name || '—' }}
                <span v-if="p.responsible_company" class="block text-xs text-gray-400">{{ p.responsible_company }}</span>
              </td>
              <td class="py-2.5 font-semibold" :class="isNear(p.due_date) ? 'text-orange-500' : 'text-gray-700'">
                {{ formatDate(p.due_date) }}
                <span v-if="isNear(p.due_date)" class="block text-xs font-normal text-orange-400">Due soon!</span>
              </td>
              <td class="py-2.5"><span :class="statusClass(p.status)" class="status-badge text-xs">{{ statusLabel(p.status) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- My Open Action Points -->
      <div v-if="myPoints.length > 0" class="card">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:#E0F2FE">
            <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
          </div>
          <h4 class="font-semibold text-gray-800">My Open Action Points</h4>
          <span class="px-2 py-0.5 rounded-full text-xs font-semibold" style="background:#DBEAFE;color:#1D4ED8">{{ myPoints.length }}</span>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400 border-b border-gray-100">
              <th class="pb-2 font-semibold">Topic</th>
              <th class="pb-2 font-semibold">Type</th>
              <th class="pb-2 font-semibold">Due Date</th>
              <th class="pb-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in myPoints" :key="p.id"
              class="border-b border-gray-50 hover:bg-gray-50"
              :class="p.overdue ? 'bg-red-50' : ''">
              <td class="py-2.5 font-medium" :class="p.overdue ? 'text-red-700' : 'text-gray-800'">{{ p.topic }}</td>
              <td class="py-2.5"><span :class="typeClass(p.type)" class="type-badge">{{ p.type[0] }}</span></td>
              <td class="py-2.5 font-semibold" :class="p.overdue ? 'text-red-500' : 'text-gray-600'">
                {{ p.due_date ? formatDate(p.due_date) : '—' }}
                <span v-if="p.overdue" class="block text-xs font-normal text-red-400">Overdue!</span>
              </td>
              <td class="py-2.5"><span :class="statusClass(p.status)" class="status-badge text-xs">{{ statusLabel(p.status) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else-if="currentUser && !currentUser.contact_id" class="card text-center py-6 text-gray-400 text-sm">
        Link your account to a contact to see your personal action points here.
      </div>
    </div>
  `,

  data() {
    return {
      meetingTypeFilter: '',
      summary: {},
      byResponsible: [],
      upcoming: [],
      myPoints: [],
      meetingsPerMonth: [],
      pointsPerWeek: [],
      upcomingDays: 14,
      statusChartObj: null,
      typeChartObj: null,
      meetingsMonthChartObj: null,
      weeklyPointsChartObj: null,
    };
  },

  computed: {
    maxResp() {
      if (!this.byResponsible.length) return 1;
      return Math.max(...this.byResponsible.map(r => r.open_points));
    },
    weeklyChartWidth() {
      // Roughly 36 px per week; the visible-window container caps around
      // 26 weeks (≈ 940 px) and longer histories scroll horizontally.
      const perWeek = 36;
      return Math.max(this.pointsPerWeek.length, 1) * perWeek;
    },
  },

  async mounted() {
    await this.load();
  },

  // Destroy charts on unmount so they don't linger in Chart.js's global
  // registry with a detached canvas — a ghost instance throws on the
  // next animation frame and can blank dashboards that mount afterwards.
  beforeUnmount() {
    if (this.statusChartObj)         { try { this.statusChartObj.destroy(); }         catch (e) {} this.statusChartObj = null; }
    if (this.typeChartObj)           { try { this.typeChartObj.destroy(); }           catch (e) {} this.typeChartObj = null; }
    if (this.meetingsMonthChartObj)  { try { this.meetingsMonthChartObj.destroy(); }  catch (e) {} this.meetingsMonthChartObj = null; }
    if (this.weeklyPointsChartObj)   { try { this.weeklyPointsChartObj.destroy(); }   catch (e) {} this.weeklyPointsChartObj = null; }
  },

  watch: {
    meetingTypeFilter() {
      this.load();
    },
  },

  methods: {
    params() {
      return this.meetingTypeFilter ? { meeting_type_id: this.meetingTypeFilter } : {};
    },

    async load() {
      const p = this.params();
      [this.summary, this.byResponsible, this.myPoints, this.meetingsPerMonth, this.pointsPerWeek] = await Promise.all([
        API.getDashboardSummary(p),
        API.getByResponsible(p),
        API.getMyPoints(p),
        API.getMeetingsPerMonth(p),
        API.getPointsPerWeek(p),
      ]);
      await this.loadUpcoming();
      this.$nextTick(() => this.renderCharts());
    },

    async loadUpcoming() {
      this.upcoming = await API.getUpcoming(this.upcomingDays, this.params());
    },

    renderCharts() {
      if (typeof Chart === 'undefined') return;
      if (this.statusChartObj) { this.statusChartObj.destroy(); this.statusChartObj = null; }
      if (this.typeChartObj) { this.typeChartObj.destroy(); this.typeChartObj = null; }
      if (this.meetingsMonthChartObj) { this.meetingsMonthChartObj.destroy(); this.meetingsMonthChartObj = null; }

      const byStatus = this.summary.by_status || {};
      const byType = this.summary.by_type || {};

      // Status: horizontal bar chart. DECLARED_DONE is still considered open
      // (the point needs final closure by an owning-package contact) and is
      // shown between ON_HOLD and CLOSED.
      const statusOrder = ['NOT_STARTED', 'IN_PROGRESS', 'URGENT', 'ON_HOLD', 'DECLARED_DONE', 'CLOSED'];
      const sLabels = statusOrder.filter(s => byStatus[s] !== undefined).map(s => this.statusLabel(s));
      const sData = statusOrder.filter(s => byStatus[s] !== undefined).map(s => byStatus[s]);
      const sColors = statusOrder.filter(s => byStatus[s] !== undefined).map(s => this.statusColor(s));

      if (this.$refs.statusChart) {
        this.statusChartObj = new Chart(this.$refs.statusChart, {
          type: 'bar',
          data: {
            labels: sLabels,
            datasets: [{ data: sData, backgroundColor: sColors, borderRadius: 4, borderSkipped: false }],
          },
          options: {
            indexAxis: 'y',
            plugins: {
              legend: { display: false },
              datalabels: { display: false },
            },
            scales: {
              x: { grid: { display: false }, ticks: { font: { size: 10 } } },
              y: { grid: { display: false }, ticks: { font: { size: 10 } } },
            },
          },
        });
      }

      // Type: doughnut
      const tLabels = Object.keys(byType).map(t => this.typeLabel(t));
      const tData = Object.values(byType);
      const tColors = Object.keys(byType).map(t => this.typeColor(t));
      if (this.$refs.typeChart) {
        this.typeChartObj = new Chart(this.$refs.typeChart, {
          type: 'doughnut',
          data: { labels: tLabels, datasets: [{ data: tData, backgroundColor: tColors, borderWidth: 2 }] },
          options: {
            plugins: {
              legend: { display: false },
              datalabels: { display: false },
            },
            cutout: '60%',
          },
        });
      }

      // Meetings per month: vertical bar chart with datalabels
      if (this.$refs.meetingsMonthChart && this.meetingsPerMonth.length) {
        const mLabels = this.meetingsPerMonth.map(d => {
          const [y, m] = d.month.split('-');
          return new Date(+y, +m - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
        });
        const mData = this.meetingsPerMonth.map(d => d.count);

        this.meetingsMonthChartObj = new Chart(this.$refs.meetingsMonthChart, {
          type: 'bar',
          data: {
            labels: mLabels,
            datasets: [{
              data: mData,
              backgroundColor: '#00AEEF',
              borderRadius: 4,
              borderSkipped: false,
            }],
          },
          options: {
            plugins: {
              legend: { display: false },
              datalabels: {
                anchor: 'end',
                align: 'end',
                color: '#374151',
                font: { size: 10, weight: 'bold' },
                formatter: v => v > 0 ? v : '',
              },
            },
            scales: {
              x: { grid: { display: false }, ticks: { font: { size: 10 } } },
              y: {
                grid: { color: '#F3F4F6' },
                ticks: { font: { size: 10 }, stepSize: 1 },
                beginAtZero: true,
                // Add a little padding at the top for the datalabels
                suggestedMax: Math.max(...mData) + 1,
              },
            },
          },
          plugins: [ChartDataLabels],
        });
      }

      // Weekly cumulative open vs closed (stacked bar, horizontal scroll)
      if (this.weeklyPointsChartObj) { this.weeklyPointsChartObj.destroy(); this.weeklyPointsChartObj = null; }
      if (this.$refs.weeklyPointsChart && this.pointsPerWeek.length) {
        const labels = this.pointsPerWeek.map(d => d.label);
        const stillOpen = this.pointsPerWeek.map(d => d.still_open);
        const closed    = this.pointsPerWeek.map(d => d.closed_total);
        this.weeklyPointsChartObj = new Chart(this.$refs.weeklyPointsChart, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'Still open', data: stillOpen, backgroundColor: '#F59E0B', borderRadius: 0, borderSkipped: false, stack: 's' },
              { label: 'Closed',     data: closed,    backgroundColor: '#10B981', borderRadius: 0, borderSkipped: false, stack: 's' },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
              legend:    { display: false },
              datalabels: { display: false },
              tooltip: {
                callbacks: {
                  title: (items) => {
                    const idx = items[0].dataIndex;
                    const d = this.pointsPerWeek[idx];
                    return `Week of ${d.week_start}`;
                  },
                  footer: (items) => {
                    const idx = items[0].dataIndex;
                    const d = this.pointsPerWeek[idx];
                    return `Total opened so far: ${d.opened_total}`;
                  },
                },
              },
            },
            scales: {
              x: {
                stacked: true,
                grid: { display: false },
                ticks: { font: { size: 10 }, autoSkip: false, maxRotation: 0, minRotation: 0 },
              },
              y: {
                stacked: true,
                beginAtZero: true,
                grid: { color: '#F3F4F6' },
                ticks: { font: { size: 10 }, stepSize: 1, precision: 0 },
              },
            },
          },
        });

        // Default-scroll to the right so the most recent weeks are in view.
        this.$nextTick(() => {
          const wrap = this.$refs.weeklyScroll;
          if (wrap) wrap.scrollLeft = wrap.scrollWidth;
        });
      }
    },

    formatDate(d) { return formatDate(d); },

    isNear(d) {
      if (!d) return false;
      const diff = new Date(d) - new Date();
      return diff >= 0 && diff <= 3 * 86400000;
    },

    typeClass(t) {
      return { ACTION: 'type-action', DECISION: 'type-decision', INFO: 'type-info' }[t] || 'type-info';
    },

    statusClass(s) {
      return { NOT_STARTED: 'badge-gray', IN_PROGRESS: 'badge-yellow', CLOSED: 'badge-green', ON_HOLD: 'badge-blue', URGENT: 'badge-red', DECLARED_DONE: 'badge-purple' }[s] || 'badge-gray';
    },

    statusLabel(s) {
      return { NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', CLOSED: 'Closed', ON_HOLD: 'On Hold', URGENT: 'Urgent', DECLARED_DONE: 'Declared Done' }[s] || s;
    },

    typeLabel(t) {
      return { ACTION: 'Action', DECISION: 'Decision', INFO: 'Information' }[t] || t;
    },

    statusColor(s) {
      return { NOT_STARTED: '#9CA3AF', IN_PROGRESS: '#F59E0B', CLOSED: '#10B981', ON_HOLD: '#3B82F6', URGENT: '#EF4444', DECLARED_DONE: '#A855F7' }[s] || '#9CA3AF';
    },

    typeColor(t) {
      return { ACTION: '#8B5CF6', DECISION: '#00AEEF', INFO: '#6B7280' }[t] || '#6B7280';
    },
  },
});
