// ─────────────────────────────────────────────────────────────────────────────
// My Action Points — aggregated action list with navigation to source modules
// ─────────────────────────────────────────────────────────────────────────────
app.component('my-action-points', {
  props: ['currentUser'],
  emits: ['open-record', 'navigate', 'navigate-tab', 'startup-task-open'],
  template: `
    <div>
      <!-- Filter bar -->
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div class="flex items-center gap-2">
          <select v-model="moduleFilter" class="input-field w-56">
            <option value="">All modules</option>
            <option v-for="m in availableModules" :key="m.key" :value="m.key">{{ m.label }} ({{ moduleCounts[m.key] || 0 }})</option>
          </select>
          <span class="text-sm text-gray-500">{{ filteredItems.length }} action{{ filteredItems.length !== 1 ? 's' : '' }}</span>
        </div>
        <button @click="load" :disabled="loading" class="btn-secondary text-sm">
          <svg :class="['w-3.5 h-3.5 mr-1.5', loading ? 'animate-spin' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Refresh
        </button>
      </div>

      <!-- Project Start-up checklist — top group, only visible to project owners -->
      <div v-if="startupTasks.length > 0" class="card p-0 overflow-hidden mb-4 border border-amber-200">
        <div class="px-4 py-3 border-b border-amber-200 flex items-center justify-between" style="background:#FFF7ED">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="#9A3412" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            <span class="font-semibold text-sm" style="color:#9A3412">Project Start-up</span>
            <span class="px-1.5 py-0.5 rounded-full text-xs font-bold" style="background:#9A3412;color:#fff">{{ startupTasks.length }}</span>
          </div>
          <span class="text-[11px] text-amber-700 italic">Set the project up step-by-step</span>
        </div>
        <table class="w-full text-sm">
          <tbody>
            <tr v-for="t in startupTasks" :key="t.id"
                class="border-b border-amber-50 last:border-0 hover:bg-amber-50/50 transition-colors cursor-pointer"
                @click="openStartupTask(t)">
              <td class="px-4 py-2.5 w-28">
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Set up</span>
              </td>
              <td class="px-4 py-2.5 text-gray-800 font-medium">{{ t.title }}</td>
              <td class="px-4 py-2.5 text-gray-500 text-xs max-w-md">
                <span class="line-clamp-1" :title="t.body">{{ t.body }}</span>
              </td>
              <td class="px-4 py-2.5 w-8 text-amber-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Loading -->
      <div v-if="loading && items.length === 0" class="text-center py-12">
        <img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/>
      </div>

      <!-- Empty state -->
      <div v-else-if="filteredItems.length === 0 && startupTasks.length === 0" class="card text-center py-12 text-gray-400">
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p>No pending actions.</p>
      </div>

      <!-- Grouped items -->
      <div v-else-if="filteredItems.length > 0" class="space-y-4">
        <div v-for="group in groupedItems" :key="group.key" class="card p-0 overflow-hidden">
          <!-- Module header -->
          <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between" :style="'background:' + group.bgColor">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-sm" :style="'color:' + group.textColor">{{ group.label }}</span>
              <span class="px-1.5 py-0.5 rounded-full text-xs font-bold" :style="'background:' + group.textColor + ';color:#fff'">{{ group.items.length }}</span>
            </div>
          </div>
          <!-- Items -->
          <table class="w-full text-sm">
            <tbody>
              <!-- Sub-grouped rendering (documents / quality) -->
              <template v-if="group.subgroups && group.subgroups.length > 0">
                <template v-for="sg in group.subgroups" :key="sg.key">
                  <tr class="bg-gray-50 border-b border-gray-100">
                    <td colspan="6" class="px-4 py-1.5">
                      <div class="flex items-center gap-2">
                        <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">{{ sg.label }}</span>
                        <span class="px-1.5 py-0.5 rounded-full text-xs font-bold bg-gray-200 text-gray-600">{{ sg.items.length }}</span>
                      </div>
                    </td>
                  </tr>
                  <tr v-for="item in sg.items" :key="item._key"
                    class="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                    @click="openItem(item)">
                    <td class="px-4 py-2.5 w-28">
                      <span class="px-2 py-0.5 rounded-full text-xs font-semibold" :class="actionBadge(item.action)">{{ item.action }}</span>
                    </td>
                    <td class="px-4 py-2.5 w-56">
                      <div v-if="item.package_tag" class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded text-xs font-bold text-white shrink-0" style="background:#1B4F8C">{{ item.package_tag }}</span>
                        <span v-if="item.package_name" class="text-xs text-gray-500 truncate" :title="item.package_name">{{ item.package_name }}</span>
                      </div>
                      <span v-else class="text-gray-300 text-xs">—</span>
                    </td>
                    <td class="px-4 py-2.5 text-gray-800 font-medium">{{ item.title }}</td>
                    <td class="px-4 py-2.5 text-gray-500 text-xs max-w-xs truncate">{{ item.detail }}</td>
                    <td class="px-4 py-2.5 text-right text-xs text-gray-400 whitespace-nowrap">{{ item.extra }}</td>
                    <td class="px-4 py-2.5 w-8 text-gray-300">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                    </td>
                  </tr>
                </template>
              </template>
              <!-- Flat rendering (other modules) -->
              <tr v-else v-for="item in group.items" :key="item._key"
                class="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                @click="openItem(item)">
                <td class="px-4 py-2.5 w-28">
                  <span class="px-2 py-0.5 rounded-full text-xs font-semibold" :class="actionBadge(item.action)">{{ item.action }}</span>
                </td>
                <td class="px-4 py-2.5 w-56">
                  <div v-if="item.package_tag" class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded text-xs font-bold text-white shrink-0" style="background:#1B4F8C">{{ item.package_tag }}</span>
                    <span v-if="item.package_name" class="text-xs text-gray-500 truncate" :title="item.package_name">{{ item.package_name }}</span>
                  </div>
                  <span v-else class="text-gray-300 text-xs">—</span>
                </td>
                <td class="px-4 py-2.5 text-gray-800 font-medium">{{ item.title }}</td>
                <td class="px-4 py-2.5 text-gray-500 text-xs max-w-xs truncate">{{ item.detail }}</td>
                <td class="px-4 py-2.5 text-right text-xs text-gray-400 whitespace-nowrap">{{ item.extra }}</td>
                <td class="px-4 py-2.5 w-8 text-gray-300">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `,

  data() {
    return {
      loading: false,
      items: [],
      moduleFilter: '',
      // Project start-up checklist (PROJECT_OWNER / ADMIN only). The slide-
      // over panel itself lives at the root app level — this component just
      // owns the rows in the list.
      startupTasks: [],
    };
  },

  computed: {
    availableModules() {
      return [
        { key: 'meetings',     label: 'Meetings' },
        { key: 'risks',        label: 'Risk Register' },
        { key: 'schedule',     label: 'Schedule' },
        { key: 'budget',       label: 'Budget Management' },
        { key: 'procurement',  label: 'Procurement' },
        { key: 'scope',        label: 'Scope Changes' },
        { key: 'documents',    label: 'Document Management' },
        { key: 'quality',      label: 'Quality Control' },
        { key: 'construction', label: 'Construction' },
        { key: 'safety',       label: 'Safety' },
      ];
    },

    moduleCounts() {
      const counts = {};
      this.items.forEach(i => { counts[i.module] = (counts[i.module] || 0) + 1; });
      return counts;
    },

    filteredItems() {
      if (!this.moduleFilter) return this.items;
      return this.items.filter(i => i.module === this.moduleFilter);
    },

    groupedItems() {
      const moduleConfig = {
        meetings:  { label: 'Meetings',            bgColor: '#FEF3C7', textColor: '#92400E' },
        risks:     { label: 'Risk Register',        bgColor: '#FEE2E2', textColor: '#991B1B' },
        schedule:  { label: 'Schedule',             bgColor: '#CCFBF1', textColor: '#115E59' },
        budget:    { label: 'Budget Management',    bgColor: '#DBEAFE', textColor: '#1E40AF' },
        procurement:{ label: 'Procurement',         bgColor: '#FFEDD5', textColor: '#9A3412' },
        scope:     { label: 'Scope Changes',        bgColor: '#F3E8FF', textColor: '#6B21A8' },
        documents: { label: 'Document Management',  bgColor: '#E0E7FF', textColor: '#3730A3' },
        quality:   { label: 'Quality Control',      bgColor: '#FEF9C3', textColor: '#854D0E' },
        construction:{ label: 'Construction',       bgColor: '#FFE4D2', textColor: '#9A3412' },
        safety:    { label: 'Safety',               bgColor: '#DCFCE7', textColor: '#166534' },
      };
      // Sub-group labels + display order within a module. The "secondary"
      // sub-group (Receipts / Punch List) is always rendered last.
      const subgroupConfig = {
        documents: {
          order: ['documents', 'receipts'],
          labels: { documents: 'Documents', receipts: 'Receipts' },
        },
        construction: {
          order: ['worker_declaration', 'daily_report', 'loto', 'workpermits'],
          labels: { worker_declaration: 'Worker declaration',
                    daily_report: 'Daily reports',
                    loto: 'LOTO',
                    workpermits: 'Work permits' },
        },
        quality: {
          order: ['itp', 'punch'],
          labels: { itp: 'ITP Records', punch: 'Punch List' },
        },
        safety: {
          order: ['observations', 'incidents', 'toolboxes'],
          labels: { observations: 'Observations', incidents: 'Incidents', toolboxes: 'Toolbox Talks' },
        },
      };
      const groups = {};
      this.filteredItems.forEach(item => {
        if (!groups[item.module]) {
          const cfg = moduleConfig[item.module] || { label: item.module, bgColor: '#F3F4F6', textColor: '#374151' };
          groups[item.module] = { key: item.module, ...cfg, items: [], subgroups: [] };
        }
        groups[item.module].items.push(item);
      });
      // Build sub-groups per module, preserving per-module ordering.
      Object.values(groups).forEach(g => {
        const cfg = subgroupConfig[g.key];
        if (!cfg) { g.subgroups = []; return; }
        const byKey = {};
        g.items.forEach(it => {
          const k = it.subgroup || 'other';
          (byKey[k] = byKey[k] || []).push(it);
        });
        g.subgroups = cfg.order
          .filter(k => byKey[k] && byKey[k].length > 0)
          .map(k => ({ key: k, label: cfg.labels[k] || k, items: byKey[k] }));
      });
      // Return modules in canonical order
      const order = ['meetings', 'risks', 'schedule', 'budget', 'procurement', 'scope', 'documents', 'quality', 'construction', 'safety'];
      return order.filter(k => groups[k]).map(k => groups[k]);
    },
  },

  async mounted() {
    await this.load();
  },

  methods: {
    async load() {
      this.loading = true;
      // Project start-up tasks load in parallel; the API returns [] for non-
      // owner roles so we don't gate the call on role here.
      API.getStartupTasks().then(rows => { this.startupTasks = rows || []; })
        .catch(() => { this.startupTasks = []; });
      try {
        const results = await Promise.allSettled([
          API.getMeetingPoints({ responsible_id: this.currentUser.contact_id }),
          API.getMyOpenRisks(),
          API.getPendingPrReviews(),
          API.getMyRejectedPrs(),
          API.getPendingInvoiceReviews(),
          API.getMyRejectedInvoices(),
          API.getPendingScReviews(),
          API.getMyRejectedScs(),
          API.getMyPendingDocReviews(),
          API.getPendingDocumentReceipts(),
          API.getMyPendingITPReviews(),
          API.getMyRejectedITPs(),
          API.getMyOpenPunches(),
          API.getMyReviewPunches(),
          API.getMyRejectedDocs(),
          API.getWorkersPendingApproval({ for_action_points: true }),
          API.getMyRejectedWorkers(),
          API.getPendingDailyReports(),
          API.getLotosPendingApproval({ for_action_points: true }),
          API.getMyRefusedLotos(),
          API.getWorkPermitsPendingApproval({ for_action_points: true }),
          API.getMyRejectedWorkPermits(),
          API.getApprovedDueWorkPermits(),
          API.getPendingReleaseLotos({ for_action_points: true }),
          API.getMyPendingSafetyObservations(),
          API.getMyPendingSafetyIncidents(),
          API.getMyPendingSafetyToolboxes(),
          API.getMyPendingSubmittals(),
        ]);
        const val = i => results[i].status === 'fulfilled' ? results[i].value : [];
        const items = [];
        let key = 0;

        // ── Meetings: open action points ──
        (val(0) || []).forEach(p => {
          if (p.status === 'CLOSED') return;
          items.push({
            _key: 'mp-' + (key++),
            module: 'meetings',
            action: p.status === 'URGENT' ? 'Urgent' : 'Open',
            title: p.topic,
            detail: p.type + (p.responsible_name ? ' · ' + p.responsible_name : ''),
            extra: p.due_date || '',
            record_type: 'meeting_point', record_id: p.id,
          });
        });

        // ── Risks: open risks assigned to user ──
        (val(1) || []).forEach(r => {
          items.push({
            _key: 'risk-' + (key++),
            module: 'risks',
            action: 'Open',
            title: (r.seq_id ? 'R-' + String(r.seq_id).padStart(3,'0') + ' ' : '') + r.title,
            detail: (r.category_name || '') + (r.action_status ? ' · Action: ' + r.action_status : ''),
            extra: r.action_due_date || '',
            record_type: 'risk', record_id: r.id,
          });
        });

        // ── Schedule: PR reviews ──
        (val(2) || []).forEach(pr => {
          items.push({
            _key: 'pr-rev-' + (key++),
            module: 'schedule',
            action: 'Review',
            title: 'Progress Report',
            detail: (pr.entries || []).length + ' task(s) · ' + (pr.reviewer_role || ''),
            extra: '',
            package_tag: pr.package_tag, package_name: pr.package_name,
            record_type: 'progress_report', record_id: pr.id, subtab: 'approvals',
          });
        });

        // ── Schedule: rejected PRs ──
        (val(3) || []).forEach(pr => {
          items.push({
            _key: 'pr-rej-' + (key++),
            module: 'schedule',
            action: 'Rejected',
            title: 'Progress Report',
            detail: 'Resubmit or revise',
            extra: '',
            package_tag: pr.package_tag, package_name: pr.package_name,
            record_type: 'progress_report', record_id: pr.id, subtab: 'progress',
          });
        });

        // ── Budget: invoice reviews ──
        (val(4) || []).forEach(inv => {
          items.push({
            _key: 'inv-rev-' + (key++),
            module: 'budget',
            action: 'Review',
            title: inv.invoice_number,
            detail: (inv.my_role || '') + ' · ' + (inv.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2}),
            extra: inv.invoice_date || '',
            package_tag: inv.package_tag, package_name: inv.package_name,
            record_type: 'invoice', record_id: inv.id, subtab: 'approvals',
          });
        });

        // ── Budget: rejected invoices ──
        (val(5) || []).forEach(inv => {
          items.push({
            _key: 'inv-rej-' + (key++),
            module: 'budget',
            action: 'Rejected',
            title: inv.invoice_number,
            detail: 'Resubmit, edit or cancel · ' + (inv.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2}),
            extra: inv.invoice_date || '',
            package_tag: inv.package_tag, package_name: inv.package_name,
            record_type: 'invoice', record_id: inv.id, subtab: 'invoices',
          });
        });

        // ── Scope Changes: pending reviews ──
        (val(6) || []).forEach(sc => {
          items.push({
            _key: 'sc-rev-' + (key++),
            module: 'scope',
            action: 'Review',
            title: (sc.seq_id ? 'SC-' + String(sc.seq_id).padStart(3,'0') + ' ' : '') + sc.description,
            detail: (sc.reviewer_role || '') + ' · ' + (sc.cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2}),
            extra: '',
            package_tag: sc.package_tag, package_name: sc.package_name,
            record_type: 'scope_change', record_id: sc.id,
          });
        });

        // ── Scope Changes: rejected ──
        (val(7) || []).forEach(sc => {
          items.push({
            _key: 'sc-rej-' + (key++),
            module: 'scope',
            action: 'Rejected',
            title: (sc.seq_id ? 'SC-' + String(sc.seq_id).padStart(3,'0') + ' ' : '') + sc.description,
            detail: 'Resubmit or cancel · ' + (sc.cost || 0).toLocaleString(undefined, {minimumFractionDigits: 2}),
            extra: '',
            package_tag: sc.package_tag, package_name: sc.package_name,
            record_type: 'scope_change', record_id: sc.id,
          });
        });

        // ── Documents: pending reviews ──
        (val(8) || []).forEach(d => {
          items.push({
            _key: 'doc-rev-' + (key++),
            module: 'documents', subgroup: 'documents',
            action: 'Review',
            title: d.doc_number + ' — ' + (d.description || ''),
            detail: (d.reviewer_role || '') + ' · V' + (d.version || 0),
            extra: d.subservice_code || '',
            package_tag: d.package_tag, package_name: d.package_name,
            record_type: 'document', record_id: d.document_id, subtab: 'approvals',
          });
        });

        // ── Documents: pending receipts ──
        (val(9) || []).forEach(rc => {
          items.push({
            _key: 'doc-rcpt-' + (key++),
            module: 'documents', subgroup: 'receipts',
            action: 'Receipt',
            title: rc.doc_number + ' — ' + (rc.doc_description || ''),
            detail: 'Acknowledge receipt' + (rc.origin_package_tag ? ' — from ' + rc.origin_package_tag : ''),
            extra: '',
            package_tag: rc.package_tag, package_name: rc.package_name,
            record_type: 'document', record_id: rc.document_id, subtab: 'receipts',
          });
        });

        // ── Quality Control: ITP reviews ──
        (val(10) || []).forEach(itp => {
          items.push({
            _key: 'itp-rev-' + (key++),
            module: 'quality', subgroup: 'itp',
            action: 'Review',
            title: itp.test,
            detail: (itp.my_reviewer_role || '') + ' · ' + (itp.test_type_name || ''),
            extra: itp.planned_date || '',
            package_tag: itp.package_tag, package_name: itp.package_name,
            record_type: 'itp', record_id: itp.id, subtab: 'approvals',
          });
        });

        // ── Quality Control: rejected ITPs ──
        (val(11) || []).forEach(itp => {
          items.push({
            _key: 'itp-rej-' + (key++),
            module: 'quality', subgroup: 'itp',
            action: 'Rejected',
            title: itp.test,
            detail: 'Resubmit · ' + (itp.test_type_name || ''),
            extra: itp.planned_date || '',
            package_tag: itp.package_tag, package_name: itp.package_name,
            record_type: 'itp', record_id: itp.id, subtab: 'register',
          });
        });

        // ── Quality Control: open punch items ──
        (val(12) || []).forEach(p => {
          items.push({
            _key: 'punch-open-' + (key++),
            module: 'quality', subgroup: 'punch',
            action: 'Respond',
            title: p.topic,
            detail: (p.obligation_time_name || '') + (p.itp_test ? ' · ' + p.itp_test : ''),
            extra: p.area_tag || '',
            package_tag: p.package_tag, package_name: p.package_name,
            record_type: 'punch', record_id: p.id, subtab: 'punchlist',
          });
        });

        // ── Quality Control: punch items to review ──
        (val(13) || []).forEach(p => {
          items.push({
            _key: 'punch-rev-' + (key++),
            module: 'quality', subgroup: 'punch',
            action: 'Review',
            title: p.topic,
            detail: 'Close or reopen · ' + (p.obligation_time_name || ''),
            extra: p.area_tag || '',
            package_tag: p.package_tag, package_name: p.package_name,
            record_type: 'punch', record_id: p.id, subtab: 'punchlist',
          });
        });

        // ── Construction: workers pending approval (site supervisors) ──
        // Group by package so a supervisor sees ONE "Workers to review"
        // action per package; clicking lands on the Approvals tab filtered
        // on that package.
        {
          const byPkg = {};
          (val(15) || []).forEach(w => {
            const pid = w.package_id;
            if (!byPkg[pid]) {
              byPkg[pid] = { package_id: pid, package_tag: w.package_tag,
                             package_name: w.package_name, count: 0 };
            }
            byPkg[pid].count += 1;
          });
          Object.values(byPkg).forEach(g => {
            items.push({
              _key: 'wk-app-' + (key++),
              module: 'construction', subgroup: 'worker_declaration',
              action: 'Review',
              title: 'Workers to review',
              detail: g.count + ' worker' + (g.count === 1 ? '' : 's') + ' pending approval',
              extra: '',
              package_tag: g.package_tag, package_name: g.package_name,
              record_type: 'worker_batch', record_id: g.package_id, subtab: 'approvals',
            });
          });
        }

        // ── Construction: daily reports still to submit (per package × day) ──
        (val(17) || []).forEach(p => {
          items.push({
            _key: 'dr-pending-' + (key++),
            module: 'construction', subgroup: 'daily_report',
            action: 'Submit',
            title: 'Daily report · ' + p.report_date,
            detail: 'Declare activities (or no work) for this day',
            extra: p.report_date,
            package_tag: p.package_tag, package_name: p.package_name,
            record_type: 'daily_report_pending',
            record_id: p.package_id,
            subtab: 'daily',
            meta: { package_id: p.package_id, report_date: p.report_date },
          });
        });

        // ── Construction: workers rejected (vendor-side to resubmit/cancel) ──
        (val(16) || []).forEach(w => {
          items.push({
            _key: 'wk-rej-' + (key++),
            module: 'construction', subgroup: 'worker_declaration',
            action: 'Rejected',
            title: w.display_id + ' — ' + w.name,
            detail: 'Resubmit or cancel · ' + (w.rejection_comment || '—'),
            extra: '',
            package_tag: w.package_tag, package_name: w.package_name,
            record_type: 'worker', record_id: w.id, subtab: 'people',
          });
        });

        // ── Construction: LOTOs pending confirmation (site-supervisor side) ──
        {
          const byPermit = {};
          (val(18) || []).forEach(l => {
            const pid = l.work_permit_id;
            if (!byPermit[pid]) {
              byPermit[pid] = {
                work_permit_id: pid,
                work_permit_display_id: l.work_permit_display_id,
                work_permit_title: l.work_permit_title,
                package_id: l.package_id,
                package_tag: l.package_tag,
                package_name: l.package_name,
                count: 0,
              };
            }
            byPermit[pid].count += 1;
          });
          Object.values(byPermit).forEach(g => {
            items.push({
              _key: 'loto-app-' + (key++),
              module: 'construction', subgroup: 'loto',
              action: 'Review',
              title: 'LOTOs to review',
              detail: g.count + ' LOTO' + (g.count === 1 ? '' : 's') + ' on permit '
                + (g.work_permit_display_id || '')
                + (g.work_permit_title ? ' — ' + g.work_permit_title : ''),
              extra: '',
              package_tag: g.package_tag, package_name: g.package_name,
              record_type: 'loto_batch',
              record_id: g.work_permit_id,
              subtab: 'loto',
            });
          });
        }

        // ── Construction: LOTOs refused — grouped by work permit ──
        // Vendor resubmits/cancels from within the parent work permit, because
        // LOTO definitions are always managed from the permit.
        {
          const byPermit = {};
          (val(19) || []).forEach(l => {
            const pid = l.work_permit_id;
            if (!byPermit[pid]) {
              byPermit[pid] = {
                work_permit_id: pid,
                work_permit_display_id: l.work_permit_display_id,
                work_permit_title: l.work_permit_title,
                package_id: l.package_id,
                package_tag: l.package_tag,
                package_name: l.package_name,
                count: 0,
              };
            }
            byPermit[pid].count += 1;
          });
          Object.values(byPermit).forEach(g => {
            items.push({
              _key: 'loto-ref-' + (key++),
              module: 'construction', subgroup: 'loto',
              action: 'Refused',
              title: 'Refused LOTOs on ' + (g.work_permit_display_id || 'permit')
                + (g.work_permit_title ? ' — ' + g.work_permit_title : ''),
              detail: g.count + ' refused LOTO' + (g.count === 1 ? '' : 's')
                + ' · open permit to update & resubmit',
              extra: '',
              package_tag: g.package_tag, package_name: g.package_name,
              record_type: 'loto_refused_batch',
              record_id: g.work_permit_id,
              subtab: 'permits',
            });
          });
        }

        // ── Construction: work permits pending approval (site-supervisor) ──
        (val(20) || []).forEach(p => {
          const my = (p.area_approvals || []).filter(ap => ap.status === 'PENDING');
          const tags = my.map(ap => ap.area_tag).filter(Boolean);
          const isExt = (p.pending_kind === 'EXTEND');
          items.push({
            _key: 'wp-app-' + (key++),
            module: 'construction', subgroup: 'workpermits',
            action: 'Review',
            title: (isExt ? 'Extension request — ' : '')
              + 'Work permit ' + (p.display_id || '')
              + (p.title ? ' — ' + p.title : ''),
            detail: (isExt ? 'Extended finish date · ' : '')
              + 'Approve / reject your area'
              + (tags.length ? ' (' + tags.join(', ') + ')' : ''),
            extra: '',
            package_tag: p.package_tag, package_name: p.package_name,
            record_type: 'work_permit_approval',
            record_id: p.id,
            subtab: 'permits',
          });
        });

        // ── Construction: work permits rejected (vendor-side edit & resubmit) ──
        (val(21) || []).forEach(p => {
          const firstComment = ((p.area_approvals || [])
            .find(ap => ap.status === 'REJECTED' && (ap.rejection_comment || '').trim()) || {}).rejection_comment;
          items.push({
            _key: 'wp-rej-' + (key++),
            module: 'construction', subgroup: 'workpermits',
            action: 'Rejected',
            title: 'Work permit ' + (p.display_id || '')
              + (p.title ? ' — ' + p.title : ''),
            detail: firstComment
              ? 'Rejected · ' + firstComment
              : 'Edit the permit and resubmit for approval',
            extra: '',
            package_tag: p.package_tag, package_name: p.package_name,
            record_type: 'work_permit_rejected',
            record_id: p.id,
            subtab: 'permits',
          });
        });

        // ── Construction: approved permits whose finish date has arrived ──
        (val(22) || []).forEach(p => {
          items.push({
            _key: 'wp-due-' + (key++),
            module: 'construction', subgroup: 'workpermits',
            action: 'Urgent',
            title: 'Close permit or Extend — ' + (p.display_id || '')
              + (p.title ? ' — ' + p.title : ''),
            detail: 'Finish date ' + (p.end_date || '—')
              + ' reached · close or request an extension',
            extra: '',
            package_tag: p.package_tag, package_name: p.package_name,
            record_type: 'work_permit_close_extend',
            record_id: p.id,
            subtab: 'permits',
          });
        });

        // ── Construction: LOTOs awaiting release (site-supervisor) ──
        (val(23) || []).forEach(l => {
          items.push({
            _key: 'loto-rel-' + (key++),
            module: 'construction', subgroup: 'loto',
            action: 'Release',
            title: (l.display_id || '') + ' — ' + (l.tag_number || ''),
            detail: 'Confirm release on site'
              + (l.work_permit_display_id ? ' · permit ' + l.work_permit_display_id : ''),
            extra: '',
            package_tag: l.package_tag, package_name: l.package_name,
            record_type: 'loto_release',
            record_id: l.id,
            subtab: 'loto',
          });
        });

        // ── Safety: observations awaiting acknowledge (package contact) + review (site supervisor) ──
        const safetyBundle = val(24) || { to_acknowledge: [], to_review: [] };
        (safetyBundle.to_acknowledge || []).forEach(o => {
          items.push({
            _key: 'so-ack-' + (key++),
            module: 'safety', subgroup: 'observations',
            action: 'Acknowledge',
            title: (o.display_id || '') + ' — ' + (o.category_name || '') + (o.details ? ' · ' + (o.details.length > 80 ? o.details.slice(0, 80) + '…' : o.details) : ''),
            detail: 'Confirm receipt'
              + (o.area_tag ? ' · area ' + o.area_tag : '')
              + (o.created_by_name ? ' · by ' + o.created_by_name : ''),
            extra: '',
            package_tag: o.package_tag, package_name: o.package_name,
            record_type: 'safety_observation',
            record_id: o.id,
            subtab: 'observations',
          });
        });
        (safetyBundle.to_review || []).forEach(o => {
          items.push({
            _key: 'so-rev-' + (key++),
            module: 'safety', subgroup: 'observations',
            action: 'Review response',
            title: (o.display_id || '') + ' — ' + (o.category_name || '') + (o.details ? ' · ' + (o.details.length > 80 ? o.details.slice(0, 80) + '…' : o.details) : ''),
            detail: 'Close or re-open'
              + (o.acknowledged_by_name ? ' · ack\'d by ' + o.acknowledged_by_name : '')
              + (o.area_tag ? ' · area ' + o.area_tag : ''),
            extra: '',
            package_tag: o.package_tag, package_name: o.package_name,
            record_type: 'safety_observation',
            record_id: o.id,
            subtab: 'observations',
          });
        });

        // ── Safety: incidents (investigate / action / review) ──
        const incidentBundle = val(25) || { to_investigate: [], to_action: [], to_review: [] };
        const incShortDetails = d => d ? (d.length > 80 ? d.slice(0, 80) + '…' : d) : '';
        (incidentBundle.to_investigate || []).forEach(i => {
          items.push({
            _key: 'inc-inv-' + (key++),
            module: 'safety', subgroup: 'incidents',
            action: 'Review',
            title: (i.display_id || '') + ' — ' + (i.severity_class_name || '') + (i.details ? ' · ' + incShortDetails(i.details) : ''),
            detail: 'Investigate & approve actions'
              + (i.area_tag ? ' · area ' + i.area_tag : '')
              + (i.created_by_name ? ' · by ' + i.created_by_name : ''),
            extra: i.incident_date || '',
            package_tag: i.package_tag, package_name: i.package_name,
            record_type: 'safety_incident',
            record_id: i.id,
            subtab: 'incidents',
          });
        });
        (incidentBundle.to_action || []).forEach(i => {
          items.push({
            _key: 'inc-act-' + (key++),
            module: 'safety', subgroup: 'incidents',
            action: 'Respond',
            title: (i.display_id || '') + ' — ' + (i.severity_class_name || '') + (i.details ? ' · ' + incShortDetails(i.details) : ''),
            detail: 'Carry out the action and confirm done'
              + (i.area_tag ? ' · area ' + i.area_tag : ''),
            extra: i.incident_date || '',
            package_tag: i.package_tag, package_name: i.package_name,
            record_type: 'safety_incident',
            record_id: i.id,
            subtab: 'incidents',
          });
        });
        (incidentBundle.to_review || []).forEach(i => {
          items.push({
            _key: 'inc-rev-' + (key++),
            module: 'safety', subgroup: 'incidents',
            action: 'Review response',
            title: (i.display_id || '') + ' — ' + (i.severity_class_name || '') + (i.details ? ' · ' + incShortDetails(i.details) : ''),
            detail: 'Close or re-open'
              + (i.action_completed_by_name ? ' · done by ' + i.action_completed_by_name : '')
              + (i.area_tag ? ' · area ' + i.area_tag : ''),
            extra: '',
            package_tag: i.package_tag, package_name: i.package_name,
            record_type: 'safety_incident',
            record_id: i.id,
            subtab: 'incidents',
          });
        });

        // ── Safety: toolboxes awaiting site-supervisor acknowledgement ──
        (val(26) || []).forEach(t => {
          const cat = (t.category_name || '') + (t.category_is_default && t.other_category_text ? ' — ' + t.other_category_text : '');
          items.push({
            _key: 'tbx-ack-' + (key++),
            module: 'safety', subgroup: 'toolboxes',
            action: 'Acknowledge',
            title: (t.display_id || '') + ' — ' + cat,
            detail: 'Acknowledge receipt or re-open'
              + (t.given_by_name ? ' · by ' + t.given_by_name : '')
              + (t.talk_date ? ' · ' + t.talk_date : ''),
            extra: '',
            package_tag: (t.packages && t.packages[0] ? t.packages[0].tag_number : ''),
            package_name: (t.packages && t.packages[0] ? t.packages[0].name : ''),
            record_type: 'safety_toolbox',
            record_id: t.id,
            subtab: 'toolbox',
          });
        });

        // ── Documents: rejected ──
        (val(14) || []).forEach(d => {
          items.push({
            _key: 'doc-rej-' + (key++),
            module: 'documents', subgroup: 'documents',
            action: 'Rejected',
            title: d.doc_number + ' — ' + (d.description || ''),
            detail: 'Revise and resubmit · V' + (d.current_version || 0),
            extra: d.subservice_code || '',
            package_tag: d.package_tag, package_name: d.package_name,
            record_type: 'document', record_id: d.id, subtab: 'documents',
          });
        });

        // ── Procurement: bidder submittals to review ──
        // val(27) is the new getMyPendingSubmittals; index = pos in the
        // Promise.allSettled list (last entry).
        (val(27) || []).forEach(s => {
          items.push({
            _key: 'sub-' + (key++),
            module: 'procurement',
            action: 'Review',
            title: s.company_name + ' — ' + (s.package_tag || '') + (s.package_name ? ' · ' + s.package_name : ''),
            detail: 'Submittal at ' + (s.step_name || 'current step') + (s.your_roles && s.your_roles.length ? ' · You are ' + s.your_roles.join(' + ') : ''),
            extra: s.submitted_at ? new Date(s.submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '',
            package_tag: s.package_tag, package_name: s.package_name,
            record_type: 'procurement_entry', record_id: s.entry_id,
            // Meta carries the submittal id so handleOpenRecord can both
            // acknowledge it AND tell procurement to open the read-only View
            // modal instead of the editor.
            meta: { open_view: true, submittal_id: s.submittal_id },
          });
        });

        this.items = items;
      } catch (e) {
        console.error('Failed to load action points:', e);
      } finally {
        this.loading = false;
      }
    },

    openItem(item) {
      this.$emit('open-record', {
        record_type: item.record_type,
        record_id: item.record_id,
        subtab: item.subtab || null,
        meta: item.meta || null,
      });
    },

    // ── Project start-up checklist ─────────────────────────────────────
    // Both the navigation AND the slide-over panel are owned by the root
    // app — this component is unmounted as soon as activeModule changes,
    // so a panel rendered here would disappear instantly. We just hand
    // the task up; the parent does the rest.
    openStartupTask(task) {
      this.$emit('startup-task-open', task);
    },

    actionBadge(action) {
      const map = {
        'Open':     'bg-blue-100 text-blue-700',
        'Urgent':   'bg-red-100 text-red-700',
        'Review':   'bg-amber-100 text-amber-700',
        'Rejected': 'bg-red-100 text-red-700',
        'Refused':  'bg-red-100 text-red-700',
        'Release':  'bg-orange-100 text-orange-700',
        'Receipt':  'bg-green-100 text-green-700',
        'Respond':  'bg-blue-100 text-blue-700',
        'Create':   'bg-gray-100 text-gray-600',
        'Acknowledge':    'bg-indigo-100 text-indigo-700',
        'Review response':'bg-amber-100 text-amber-700',
      };
      return map[action] || 'bg-gray-100 text-gray-600';
    },
  },
});
