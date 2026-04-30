// ─────────────────────────────────────────────────────────────────────────────
// Budget Management Component
// ─────────────────────────────────────────────────────────────────────────────
app.component('budget-module', {
  props: ['currentUser', 'pendingOpen', 'initialTab'],
  emits: ['subtab-change', 'record-change'],
  template: `
    <div>
      <!-- Tab bar -->
      <div class="sub-tab-bar mb-5">
        <button v-if="canViewBudgetOverview" @click="tab='overview'" :class="['sub-tab', tab==='overview' ? 'active' : '']">Budget Overview</button>
        <button @click="tab='orders'" :class="['sub-tab', tab==='orders' ? 'active' : '']">Orders (POs)</button>
        <button v-if="canViewBudgetOverview" @click="tab='transfers'" :class="['sub-tab', tab==='transfers' ? 'active' : '']">Transfers &amp; Injections</button>
        <button @click="tab='invoices'" :class="['sub-tab', tab==='invoices' ? 'active' : '']">Invoices</button>
        <button v-if="canSeeDashboard" @click="tab='dashboard'" :class="['sub-tab', tab==='dashboard' ? 'active' : '']">Dashboard</button>
        <button v-if="canSeeApprovals" @click="tab='approvals'" :class="['sub-tab', tab==='approvals' ? 'active' : '']">
          Invoice Approvals
          <span v-if="pendingInvoiceCards.length > 0" class="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{{ pendingInvoiceCards.length }}</span>
        </button>
      </div>

      <!-- ═══ TAB 1: BUDGET OVERVIEW ═══ -->
      <div v-if="tab==='overview'">
        <div class="flex justify-end mb-2">
          <button @click="exportOverviewToExcel" :disabled="xlsxExportingOverview"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            {{ xlsxExportingOverview ? 'Exporting...' : 'Export Excel' }}
          </button>
        </div>
        <div class="card overflow-hidden p-0">
          <table class="w-full text-sm" style="table-layout: fixed">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th style="width: 10%" class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Package</th>
                <th style="width: 10%" class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Baseline<br><span class="font-normal normal-case text-gray-400">initial budget</span></th>
                <th style="width: 10%" class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actual Budget<br><span class="font-normal normal-case text-gray-400">baseline + transfers</span></th>
                <th style="width: 10%" class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bid Value<br><span class="font-normal normal-case text-gray-400">Average from Procurement</span></th>
                <th style="width: 10%" class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Committed<br><span class="font-normal normal-case text-gray-400">Orders + Appr./Not ordered SC</span></th>
                <th style="width: 10%" class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Remaining<br><span class="font-normal normal-case text-gray-400">Actual Budget &minus; Committed/Bid</span></th>
                <th style="width: 10%" class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending SC<br><span class="font-normal normal-case text-gray-400">draft &amp; submitted</span></th>
                <th style="width: 10%" class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Remaining<br><span class="font-normal normal-case text-gray-400">incl. pending SC</span></th>
                <th style="width: 10%" class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Spend<br><span class="font-normal normal-case text-gray-400">approved invoices</span></th>
                <th style="width: 10%" class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="overview.length === 0">
                <td colspan="10" class="px-4 py-8 text-center text-gray-400">No packages defined yet</td>
              </tr>
              <template v-for="row in overview" :key="row.package_id">
                <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 align-top">
                    <div class="flex flex-col gap-1">
                      <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white self-start" style="background:#1B4F8C">{{ row.tag_number }}</span>
                      <span class="text-xs text-gray-600 leading-snug break-words" :title="row.name">{{ row.name || '' }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <span v-if="editingBaseline !== row.package_id" :class="isAdminOrOwner ? 'cursor-pointer hover:text-ips-blue' : ''" class="text-gray-700 font-medium" @click="isAdminOrOwner && startEditBaseline(row)">
                      {{ fmt(row.baseline) }} <span class="text-xs text-gray-400">{{ row.currency }}</span>
                    </span>
                    <div v-else class="flex items-center gap-1 justify-end">
                      <input v-model.number="baselineForm.amount" type="number" step="0.01"
                        class="input-field text-right w-32 py-1 text-sm"
                        @keyup.enter="saveBaseline(row.package_id)"
                        @keyup.escape="editingBaseline=null"/>
                      <span class="input-field py-1 text-sm w-20 text-center bg-gray-50 text-gray-500">{{ projectCurrency }}</span>
                      <button @click="saveBaseline(row.package_id)" class="btn-icon text-green-600 hover:text-green-700">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                      </button>
                      <button @click="editingBaseline=null" class="btn-icon text-gray-400 hover:text-gray-600">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <div class="text-gray-700 font-medium">{{ fmt(row.baseline + row.transfer_net) }}</div>
                    <div v-if="row.transfer_net !== 0" class="text-xs mt-0.5" :class="row.transfer_net > 0 ? 'text-green-600' : 'text-red-500'">
                      {{ row.transfer_net > 0 ? '+' : '' }}{{ fmt(row.transfer_net) }}
                    </div>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <div v-if="row.bid_value != null" class="font-semibold" :class="row.bid_value > actualBudget(row) ? 'text-red-600' : 'text-gray-800'">{{ fmt(row.bid_value) }}</div>
                    <div v-else class="text-gray-400 font-medium">—</div>
                    <div v-if="row.bid_status === 'AWARDED'" class="text-xs text-emerald-600 font-medium mt-0.5">Awarded</div>
                    <div v-else-if="row.bid_status === 'IN_PROGRESS'" class="text-xs text-blue-600 mt-0.5">In Progress</div>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <div class="font-medium" :class="committedTotal(row) > actualBudget(row) ? 'text-red-600' : 'text-gray-800'">{{ fmt(committedTotal(row)) }}</div>
                    <div v-if="(row.approved_sc_no_po || 0) > 0" class="text-xs font-normal text-gray-500 mt-0.5">SC = {{ fmt(row.approved_sc_no_po) }}</div>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <div class="font-semibold" :class="remainingDetail(row).value < 0 ? 'text-red-600' : 'text-gray-800'">{{ fmt(remainingDetail(row).value) }}</div>
                    <div v-if="remainingDetail(row).label" class="text-xs font-normal text-gray-500 mt-0.5">{{ remainingDetail(row).label }}</div>
                  </td>
                  <td class="px-4 py-3 text-right text-gray-800 font-medium">{{ row.pending_sc_cost > 0 ? fmt(row.pending_sc_cost) : '—' }}</td>
                  <td class="px-4 py-3 text-right font-semibold" :class="remainingInclPending(row) < 0 ? 'text-red-600' : 'text-gray-800'">{{ fmt(remainingInclPending(row)) }}</td>
                  <td class="px-4 py-3 text-right text-gray-600">{{ fmt(row.spend) }}</td>
                  <td class="px-4 py-3 text-center">
                    <button v-if="isAdminOrOwner && editingBaseline !== row.package_id"
                      @click="startEditBaseline(row)"
                      class="btn-icon text-gray-300 hover:text-ips-blue" title="Edit baseline">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                  </td>
                </tr>
              </template>
              <!-- Totals row -->
              <tr v-if="overview.length > 0" class="bg-gray-50 border-t-2 border-gray-300 font-semibold text-gray-700">
                <td class="px-4 py-3 text-xs uppercase tracking-wider">TOTAL</td>
                <td class="px-4 py-3 text-right">{{ fmt(totals.baseline) }}</td>
                <td class="px-4 py-3 text-right">
                  <div>{{ fmt(totals.baseline + totals.transfer_net) }}</div>
                  <div v-if="totals.transfer_net !== 0" class="text-xs font-normal mt-0.5" :class="totals.transfer_net > 0 ? 'text-green-600' : 'text-red-500'">
                    {{ totals.transfer_net > 0 ? '+' : '' }}{{ fmt(totals.transfer_net) }}
                  </div>
                </td>
                <td class="px-4 py-3 text-right">
                  <div :class="totals.bid_value > 0 && totals.bid_value > (totals.baseline + totals.transfer_net) ? 'text-red-600' : ''">{{ totals.bid_value > 0 ? fmt(totals.bid_value) : '—' }}</div>
                  <div v-if="totals.awarded_count + totals.in_progress_count > 0" class="text-xs font-normal text-gray-500 mt-0.5">
                    <span v-if="totals.awarded_count > 0" class="text-emerald-600">{{ totals.awarded_count }} awarded</span>
                    <span v-if="totals.awarded_count > 0 && totals.in_progress_count > 0"> · </span>
                    <span v-if="totals.in_progress_count > 0" class="text-blue-600">{{ totals.in_progress_count }} in progress</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-right">
                  <div :class="(totals.committed + totals.approved_sc_no_po) > (totals.baseline + totals.transfer_net) ? 'text-red-600' : ''">{{ fmt(totals.committed + totals.approved_sc_no_po) }}</div>
                  <div v-if="totals.approved_sc_no_po > 0" class="text-xs font-normal text-gray-500 mt-0.5">SC = {{ fmt(totals.approved_sc_no_po) }}</div>
                </td>
                <td class="px-4 py-3 text-right">
                  <div :class="remainingDetail(totals).value < 0 ? 'text-red-600' : ''">{{ fmt(remainingDetail(totals).value) }}</div>
                  <div v-if="remainingDetail(totals).label" class="text-xs font-normal text-gray-500 mt-0.5">{{ remainingDetail(totals).label }}</div>
                </td>
                <td class="px-4 py-3 text-right text-gray-800">{{ totals.pending_sc_cost > 0 ? fmt(totals.pending_sc_cost) : '—' }}</td>
                <td class="px-4 py-3 text-right" :class="remainingInclPending(totals) < 0 ? 'text-red-600' : 'text-gray-800'">{{ fmt(remainingInclPending(totals)) }}</td>
                <td class="px-4 py-3 text-right">{{ fmt(totals.spend) }}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-xs text-gray-400 mt-2">
          Click a baseline value to edit it (if authorized).
          <strong>Actual Budget</strong> = Baseline + Transfers &amp; Injections (delta vs. Baseline shown below).
          <strong>Bid Value</strong> = average of non-excluded bids from Procurement, or the awarded bid once a package is awarded — turns red when above Actual Budget; the badge shows "In Progress" or "Awarded".
          <strong>Committed</strong> = confirmed Orders + approved scope changes not yet linked to an order (SC contribution shown below) — turns red when above Actual Budget.
          <strong>Remaining</strong> = Actual Budget − Committed when Committed has value, otherwise Actual Budget − Bid Value — turns red when negative.
          <strong>Pending SC</strong> = cost of scope changes in Draft or Submitted status.
          <strong>Remaining (incl. pending SC)</strong> = Remaining − Pending SC — turns red when negative.
          <strong>Spend</strong> = approved invoices.
        </p>
      </div>

      <!-- ═══ TAB 2: ORDERS ═══ -->
      <div v-if="tab==='orders'">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <select v-model="orderFilter" class="input-field w-52">
              <option value="">All packages</option>
              <option v-for="row in visibleOverview" :key="row.package_id" :value="row.package_id">
                {{ row.tag_number }} — {{ row.name || '' }}
              </option>
            </select>
            <select v-model="orderStatusFilter" class="input-field w-40">
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="COMMITTED">Committed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <button @click="exportOrders" :disabled="exporting" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              {{ exporting ? 'Exporting...' : 'Export Excel' }}
            </button>
            <button v-if="canCreateOrder" @click="openOrderModal()" class="btn-primary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              New Order
            </button>
          </div>
        </div>

        <div class="card overflow-hidden p-0">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">PO Number</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Package</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vendor</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider" style="min-width:180px">Approved Invoicing</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredOrders.length === 0">
                <td colspan="9" class="px-4 py-8 text-center text-gray-400">No orders found</td>
              </tr>
              <tr v-for="o in filteredOrders" :key="o.id" class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3 font-medium text-gray-800">{{ o.po_number }}</td>
                <td class="px-4 py-3">
                  <span class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ o.package_tag }}</span>
                </td>
                <td class="px-4 py-3 text-gray-600">{{ o.vendor_name || '—' }}</td>
                <td class="px-4 py-3 text-gray-500 max-w-xs truncate">{{ o.description || '—' }}</td>
                <td class="px-4 py-3 text-gray-500">{{ fmtDate(o.order_date) }}</td>
                <td class="px-4 py-3 text-right font-semibold text-gray-800">{{ fmt(o.amount) }} <span class="text-xs font-normal text-gray-400">{{ o.currency }}</span></td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <div class="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div class="h-2 rounded-full transition-all" :style="{ width: o.amount > 0 ? Math.min((approvedByOrder[o.id] || 0) / o.amount * 100, 100) + '%' : '0%', background: (approvedByOrder[o.id] || 0) > o.amount ? '#EF4444' : '#10B981' }"></div>
                    </div>
                    <span class="text-xs text-gray-500 shrink-0 w-9 text-right">{{ o.amount > 0 ? Math.round((approvedByOrder[o.id] || 0) / o.amount * 100) : 0 }}%</span>
                    <span class="text-xs text-gray-400 shrink-0 w-20 text-right">{{ fmt(approvedByOrder[o.id] || 0) }}</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span :class="orderStatusClass(o.status)" class="status-badge text-xs">{{ o.status }}</span>
                </td>
                <td class="px-4 py-3">
                  <div v-if="canEditOrdersInvoices(o.package_id)" class="flex items-center gap-1 justify-end">
                    <button @click="openOrderModal(o)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button @click="deleteOrder(o)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="mt-2 text-xs text-gray-400">{{ filteredOrders.length }} orders · Total committed: {{ fmt(filteredOrders.filter(o=>o.status!=='CANCELLED').reduce((s,o)=>s+o.amount,0)) }}</div>
      </div>

      <!-- ═══ TAB 3: TRANSFERS & INJECTIONS ═══ -->
      <div v-if="tab==='transfers'">
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-500">Budget transfers between packages and external injections</p>
          <div v-if="isAdminOrOwner" class="flex gap-2">
            <button @click="openTransferModal('RISK_INTEGRATION')" class="btn-secondary" style="border-color:#D97706;color:#D97706">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
              Risk Integration
            </button>
            <button @click="openTransferModal('INJECTION')" class="btn-secondary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              Add Injection
            </button>
            <button @click="openTransferModal('TRANSFER')" class="btn-primary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
              Add Transfer
            </button>
          </div>
        </div>

        <div class="card overflow-hidden p-0">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">From</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">To</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="transfers.length === 0">
                <td colspan="7" class="px-4 py-8 text-center text-gray-400">No transfers or injections yet</td>
              </tr>
              <tr v-for="t in transfers" :key="t.id" class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td class="px-4 py-3">
                  <span :class="t.type === 'INJECTION' ? 'badge-green' : t.type === 'RISK_INTEGRATION' ? 'badge-yellow' : 'badge-blue'" class="status-badge text-xs">
                    {{ t.type === 'RISK_INTEGRATION' ? 'RISK INTEG.' : t.type }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span v-if="t.from_package_tag" class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ t.from_package_tag }}</span>
                  <span v-else-if="t.type === 'RISK_INTEGRATION'" class="text-xs text-amber-600 font-medium">Risk Integration</span>
                  <span v-else class="text-xs text-green-600 font-medium">External</span>
                </td>
                <td class="px-4 py-3">
                  <span class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ t.to_package_tag }}</span>
                </td>
                <td class="px-4 py-3 text-gray-500 max-w-xs truncate">{{ t.description || '—' }}</td>
                <td class="px-4 py-3 text-gray-500">{{ fmtDate(t.transfer_date) }}</td>
                <td class="px-4 py-3 text-right font-semibold text-green-700">+{{ fmt(t.amount) }} <span class="text-xs font-normal text-gray-400">{{ t.currency }}</span></td>
                <td class="px-4 py-3">
                  <button v-if="isAdminOrOwner" @click="deleteTransfer(t)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ═══ TAB 4: INVOICES ═══ -->
      <div v-if="tab==='invoices'">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <select v-model="invoiceFilter" class="input-field w-52">
              <option value="">All packages</option>
              <option v-for="row in visibleOverview" :key="row.package_id" :value="row.package_id">
                {{ row.tag_number }} — {{ row.name || '' }}
              </option>
            </select>
            <select v-model="invoiceStatusFilter" class="input-field w-40">
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <button @click="exportInvoices" :disabled="exporting" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              {{ exporting ? 'Exporting...' : 'Export Excel' }}
            </button>
            <button v-if="isAdminOrOwner" @click="openInvoiceImportModal" class="btn-secondary text-sm flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0l-3 3m3-3l3 3"/>
              </svg>
              <span class="flex flex-col items-start leading-tight">
                <span>Import Invoices</span>
                <span class="text-[10px] font-normal text-gray-500">(incl. Forecast)</span>
              </span>
            </button>
            <button v-if="canSubmitInvoiceAny" @click="openInvoiceModal()" class="btn-primary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              Create Invoice
            </button>
          </div>
        </div>

        <div class="card overflow-hidden p-0">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Invoice #</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">PO</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Package</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Approvals</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredInvoices.length === 0">
                <td colspan="9" class="px-4 py-8 text-center text-gray-400">No invoices found</td>
              </tr>
              <tr v-for="inv in filteredInvoices" :key="inv.id"
                class="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                @click="openInvoiceDetail(inv)">
                <td class="px-4 py-3 font-medium text-gray-800">{{ inv.invoice_number }}</td>
                <td class="px-4 py-3 text-gray-600 text-xs font-mono">{{ inv.po_number || '—' }}</td>
                <td class="px-4 py-3">
                  <span class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ inv.package_tag }}</span>
                </td>
                <td class="px-4 py-3 text-gray-500 max-w-xs truncate">{{ inv.description || '—' }}</td>
                <td class="px-4 py-3 text-gray-500">{{ fmtDate(inv.invoice_date) }}</td>
                <td class="px-4 py-3 text-right font-semibold text-gray-800">{{ fmt(inv.amount) }} <span class="text-xs font-normal text-gray-400">{{ inv.currency }}</span></td>
                <td class="px-4 py-3">
                  <div class="space-y-1">
                    <div class="flex items-center gap-1.5 text-xs">
                      <svg v-if="inv.pmc_reviewed && inv.pmc_approved" class="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                      <svg v-else-if="inv.pmc_reviewed" class="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                      <svg v-else class="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                      <span :class="inv.pmc_reviewed && inv.pmc_approved ? 'text-green-700' : (inv.pmc_reviewed ? 'text-red-600' : 'text-gray-400')">
                        PMC: {{ inv.pmc_reviewer_name || inv.pmc_commercial_reviewer_name || '—' }}
                      </span>
                    </div>
                    <div class="flex items-center gap-1.5 text-xs">
                      <svg v-if="inv.client_reviewed && inv.client_approved" class="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                      <svg v-else-if="inv.client_reviewed" class="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                      <svg v-else class="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>
                      <span :class="inv.client_reviewed && inv.client_approved ? 'text-green-700' : (inv.client_reviewed ? 'text-red-600' : 'text-gray-400')">
                        Client: {{ inv.client_reviewer_name || inv.client_commercial_reviewer_name || '—' }}
                      </span>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', invoiceStatusBadge(inv.status)]">{{ inv.status }}</span>
                </td>
                <td class="px-4 py-3 text-right" @click.stop>
                  <div class="flex items-center gap-1 justify-end">
                    <button v-if="isPmcReviewerInv(inv)" @click="openInvReview(inv,'pmc')"
                      class="px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded hover:bg-blue-200">PMC Review</button>
                    <button v-if="isClientReviewerInv(inv)" @click="openInvReview(inv,'client')"
                      class="px-2 py-1 text-xs font-semibold bg-purple-100 text-purple-700 rounded hover:bg-purple-200">Client Review</button>
                    <button v-if="canEditInv(inv)" @click="openInvoiceModal(inv)"
                      class="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded hover:bg-gray-200">Edit</button>
                    <button v-if="canSubmitInv(inv)" @click="submitInv(inv)"
                      class="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200">{{ inv.status === 'DRAFT' ? 'Submit' : 'Resubmit' }}</button>
                    <button v-if="canCancelInv(inv)" @click="cancelInv(inv)"
                      class="p-1 text-red-300 hover:text-red-500" title="Cancel">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="mt-2 text-xs text-gray-400">{{ filteredInvoices.length }} invoices · Approved spend: {{ fmt(filteredInvoices.filter(i=>i.status==='APPROVED').reduce((s,i)=>s+i.amount,0)) }}</div>
      </div>

      <!-- ═══ TAB 5: DASHBOARD ═══ -->
      <div v-if="tab==='dashboard'">
        <!-- Filters -->
        <div class="card mb-5">
          <div class="flex flex-wrap items-center gap-4">
            <div>
              <label class="form-label mb-1">Package</label>
              <select v-model="dashPkgFilter" class="input-field w-52">
                <option value="">All packages</option>
                <option v-for="row in overview" :key="row.package_id" :value="row.package_id">
                  {{ row.tag_number }} — {{ row.name || '' }}
                </option>
              </select>
            </div>
            <button @click="loadAll" class="btn-secondary mt-4">
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              Refresh
            </button>
          </div>
        </div>

        <!-- KPI Cards — single row mirroring the Overview columns -->
        <div class="grid grid-cols-8 gap-2 mb-5">
          <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#1B4F8C,#0d3a6e)">
            <p class="text-xs opacity-80">Baseline</p>
            <p class="text-xl font-bold mt-1 leading-tight">{{ fmt(dashTotals.baseline) }}</p>
            <p class="text-xs opacity-60 mt-1">initial budget</p>
          </div>
          <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#00AEEF,#0090cc)">
            <p class="text-xs opacity-80">Actual Budget</p>
            <p class="text-xl font-bold mt-1 leading-tight">{{ fmt(actualBudget(dashTotals)) }}</p>
            <p class="text-xs opacity-60 mt-1">
              <span v-if="dashTotals.transfer_net !== 0">{{ dashTotals.transfer_net > 0 ? '+' : '' }}{{ fmt(dashTotals.transfer_net) }} transfers</span>
              <span v-else>baseline + transfers</span>
            </p>
          </div>
          <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#0EA5E9,#0369A1)">
            <p class="text-xs opacity-80">Bid Value</p>
            <p class="text-xl font-bold mt-1 leading-tight" :class="dashTotals.bid_value > actualBudget(dashTotals) ? 'text-red-200' : ''">{{ dashTotals.bid_value > 0 ? fmt(dashTotals.bid_value) : '—' }}</p>
            <p class="text-xs opacity-60 mt-1">
              <template v-if="dashTotals.awarded_count + dashTotals.in_progress_count > 0">
                <span v-if="dashTotals.awarded_count > 0">{{ dashTotals.awarded_count }} awarded</span>
                <span v-if="dashTotals.awarded_count > 0 && dashTotals.in_progress_count > 0"> · </span>
                <span v-if="dashTotals.in_progress_count > 0">{{ dashTotals.in_progress_count }} in progress</span>
              </template>
              <span v-else>average from procurement</span>
            </p>
          </div>
          <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#F59E0B,#D97706)">
            <p class="text-xs opacity-80">Committed</p>
            <p class="text-xl font-bold mt-1 leading-tight" :class="committedTotal(dashTotals) > actualBudget(dashTotals) ? 'text-red-200' : ''">{{ fmt(committedTotal(dashTotals)) }}</p>
            <p class="text-xs opacity-60 mt-1">
              <span v-if="dashTotals.approved_sc_no_po > 0">SC = {{ fmt(dashTotals.approved_sc_no_po) }}</span>
              <span v-else>Orders + Appr./Not ordered SC</span>
            </p>
          </div>
          <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#059669,#047857)">
            <p class="text-xs opacity-80">Remaining</p>
            <p class="text-xl font-bold mt-1 leading-tight" :class="remainingDetail(dashTotals).value < 0 ? 'text-red-200' : ''">{{ fmt(remainingDetail(dashTotals).value) }}</p>
            <p class="text-xs opacity-60 mt-1">{{ remainingDetail(dashTotals).label || 'Actual Budget − Committed/Bid' }}</p>
          </div>
          <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#475569,#334155)">
            <p class="text-xs opacity-80">Pending SC</p>
            <p class="text-xl font-bold mt-1 leading-tight">{{ dashTotals.pending_sc_cost > 0 ? fmt(dashTotals.pending_sc_cost) : '—' }}</p>
            <p class="text-xs opacity-60 mt-1">draft &amp; submitted</p>
          </div>
          <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#7C3AED,#6D28D9)">
            <p class="text-xs opacity-80">Remaining incl. Pending SC</p>
            <p class="text-xl font-bold mt-1 leading-tight" :class="remainingInclPending(dashTotals) < 0 ? 'text-red-200' : ''">{{ fmt(remainingInclPending(dashTotals)) }}</p>
            <p class="text-xs opacity-60 mt-1">remaining − pending SC</p>
          </div>
          <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#10B981,#059669)">
            <p class="text-xs opacity-80">Spend</p>
            <p class="text-xl font-bold mt-1 leading-tight">{{ fmt(dashTotals.spend) }}</p>
            <p class="text-xs opacity-60 mt-1">approved invoices</p>
          </div>
        </div>

        <!-- Charts row -->
        <div class="grid grid-cols-3 gap-4 mb-5">
          <div class="card col-span-2 py-3 px-4">
            <h4 class="font-semibold text-gray-700 text-sm mb-3">Budget status</h4>
            <canvas ref="budgetBarChart" height="120"></canvas>
          </div>
          <div class="card py-3 px-4">
            <h4 class="font-semibold text-gray-700 text-sm mb-4">Risk Budget Impact</h4>
            <div class="space-y-3">
              <div class="rounded-lg p-3" style="background:linear-gradient(135deg,#FEF3C7,#FDE68A)">
                <p class="text-xs font-medium text-amber-800">Open Risks — Before Mitigation</p>
                <p class="text-2xl font-bold text-amber-900 mt-1">{{ fmt(riskImpact.open_before_mitigation) }}</p>
                <p class="text-xs text-amber-700 mt-0.5">expected budget impact</p>
                <div v-if="riskImpact.open_deducted > 0" class="text-xs text-amber-600 mt-1 border-t border-amber-300 pt-1">
                  initial: {{ fmt(riskImpact.initial_open_before) }} · integrated: &minus;{{ fmt(riskImpact.open_deducted) }}
                </div>
              </div>
              <div class="rounded-lg p-3" style="background:linear-gradient(135deg,#DBEAFE,#BFDBFE)">
                <p class="text-xs font-medium text-blue-800">Open Risks — After Mitigation</p>
                <p class="text-2xl font-bold text-blue-900 mt-1">{{ fmt(riskImpact.open_after_mitigation) }}</p>
                <p class="text-xs text-blue-700 mt-0.5">residual budget impact</p>
                <div v-if="riskImpact.open_deducted > 0" class="text-xs text-blue-600 mt-1 border-t border-blue-300 pt-1">
                  initial: {{ fmt(riskImpact.initial_open_after) }} · integrated: &minus;{{ fmt(riskImpact.open_deducted) }}
                </div>
              </div>
              <div class="rounded-lg p-3" style="background:linear-gradient(135deg,#D1FAE5,#A7F3D0)">
                <p class="text-xs font-medium text-green-800">Closed Risks — After Mitigation</p>
                <p class="text-2xl font-bold text-green-900 mt-1">{{ fmt(riskImpact.closed_after_mitigation) }}</p>
                <p class="text-xs text-green-700 mt-0.5">realized budget impact</p>
                <div v-if="riskImpact.closed_deducted > 0" class="text-xs text-green-600 mt-1 border-t border-green-300 pt-1">
                  initial: {{ fmt(riskImpact.initial_closed_after) }} · integrated: &minus;{{ fmt(riskImpact.closed_deducted) }}
                </div>
              </div>
            </div>
            <p class="text-xs text-gray-400 italic mt-3">Risk impact is project-wide — not filtered by package, as risks are not linked systematically to packages.</p>
          </div>
        </div>

        <!-- Per-package budget table — mirrors the Overview layout -->
        <div class="card overflow-hidden p-0">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Package</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Baseline</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actual Budget</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bid Value</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Committed</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Remaining</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending SC</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Remaining<br><span class="font-normal normal-case text-gray-400">incl. pending SC</span></th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Spend</th>
                <th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Utilization</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in dashOverview" :key="row.package_id" class="border-b border-gray-100 hover:bg-gray-50">
                <td class="px-4 py-3">
                  <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white mr-2" style="background:#1B4F8C">{{ row.tag_number }}</span>
                  <span class="text-gray-700 text-sm">{{ row.name || '' }}</span>
                </td>
                <td class="px-4 py-3 text-right text-gray-600">{{ fmt(row.baseline) }}</td>
                <td class="px-4 py-3 text-right">
                  <div class="text-gray-700 font-medium">{{ fmt(actualBudget(row)) }}</div>
                  <div v-if="row.transfer_net !== 0" class="text-xs mt-0.5" :class="row.transfer_net > 0 ? 'text-green-600' : 'text-red-500'">
                    {{ row.transfer_net > 0 ? '+' : '' }}{{ fmt(row.transfer_net) }}
                  </div>
                </td>
                <td class="px-4 py-3 text-right">
                  <div v-if="row.bid_value != null" class="font-semibold" :class="row.bid_value > actualBudget(row) ? 'text-red-600' : 'text-gray-800'">{{ fmt(row.bid_value) }}</div>
                  <div v-else class="text-gray-400 font-medium">—</div>
                  <div v-if="row.bid_status === 'AWARDED'" class="text-xs text-emerald-600 font-medium mt-0.5">Awarded</div>
                  <div v-else-if="row.bid_status === 'IN_PROGRESS'" class="text-xs text-blue-600 mt-0.5">In Progress</div>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="font-medium" :class="committedTotal(row) > actualBudget(row) ? 'text-red-600' : 'text-gray-800'">{{ fmt(committedTotal(row)) }}</div>
                  <div v-if="(row.approved_sc_no_po || 0) > 0" class="text-xs font-normal text-gray-500 mt-0.5">SC = {{ fmt(row.approved_sc_no_po) }}</div>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="font-semibold" :class="remainingDetail(row).value < 0 ? 'text-red-600' : 'text-gray-800'">{{ fmt(remainingDetail(row).value) }}</div>
                  <div v-if="remainingDetail(row).label" class="text-xs font-normal text-gray-500 mt-0.5">{{ remainingDetail(row).label }}</div>
                </td>
                <td class="px-4 py-3 text-right text-gray-800 font-medium">{{ row.pending_sc_cost > 0 ? fmt(row.pending_sc_cost) : '—' }}</td>
                <td class="px-4 py-3 text-right font-semibold" :class="remainingInclPending(row) < 0 ? 'text-red-600' : 'text-gray-800'">{{ fmt(remainingInclPending(row)) }}</td>
                <td class="px-4 py-3 text-right text-gray-600">{{ fmt(row.spend) }}</td>
                <td class="px-4 py-3 w-32">
                  <div class="flex items-center gap-2">
                    <div class="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div class="h-2 rounded-full transition-all"
                        :style="{ width: actualBudget(row) > 0 ? Math.min(committedTotal(row) / actualBudget(row) * 100, 100) + '%' : '0%', background: committedTotal(row) > actualBudget(row) ? '#EF4444' : '#00AEEF' }">
                      </div>
                    </div>
                    <span class="text-xs text-gray-500 shrink-0">{{ actualBudget(row) > 0 ? Math.round(committedTotal(row) / actualBudget(row) * 100) : 0 }}%</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Monthly Invoicing Chart -->
        <div class="card p-4 mt-5">
          <div class="font-medium text-sm text-gray-700 mb-3">Monthly Invoicing</div>
          <div v-if="monthlyInvoiceLabels.length === 0" class="text-center text-gray-400 text-sm py-6">
            No invoices with dates to display.
          </div>
          <canvas v-else ref="invoiceMonthlyChart" height="90"></canvas>
        </div>

        <!-- Cumulative Invoices Chart -->
        <div class="card p-4 mt-5">
          <div class="font-medium text-sm text-gray-700 mb-3">Cumulative Invoices</div>
          <div v-if="monthlyInvoiceLabels.length === 0" class="text-center text-gray-400 text-sm py-6">
            No invoices with dates to display.
          </div>
          <canvas v-else ref="cumulativeSpendChart" height="90"></canvas>
        </div>
      </div>

      <!-- ═══ TAB 6: INVOICE APPROVALS ═══ -->
      <div v-if="tab==='approvals'">
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-500">Invoices awaiting approval</p>
          <button @click="loadAll" class="btn-secondary text-sm">Refresh</button>
        </div>
        <div v-if="pendingInvoiceCards.length === 0" class="card text-center py-10 text-gray-400">No invoices currently awaiting approval.</div>
        <div v-else class="space-y-4">
          <div v-for="inv in pendingInvoiceCards" :key="inv.id" class="card p-0 overflow-hidden">
            <!-- Header -->
            <div class="flex items-center gap-3 px-4 py-3 bg-blue-50 border-b border-blue-100 flex-wrap">
              <span class="font-mono text-xs font-bold text-gray-700">{{ inv.invoice_number }}</span>
              <span v-if="inv.package_tag" class="px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ inv.package_tag }}</span>
              <span v-if="inv.po_number" class="text-xs text-gray-500">PO: {{ inv.po_number }}</span>
              <span class="font-semibold text-gray-800 truncate flex-1">{{ inv.description || '—' }}</span>
              <span class="text-xs font-semibold text-blue-700">{{ fmt(inv.amount) }} {{ inv.currency }}</span>
              <span class="text-xs text-gray-500">{{ inv.invoice_date || '' }}</span>
              <button @click="openInvoiceHistory(inv)" class="ml-2 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600" title="Review history">History</button>
              <button @click="openInvoiceDetail(inv)" class="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600">Open</button>
            </div>
            <!-- Reviewer rows -->
            <div class="divide-y divide-gray-100">
              <!-- PMC row -->
              <div class="flex items-center gap-3 px-4 py-3 flex-wrap">
                <div class="w-32 shrink-0">
                  <p class="text-xs font-semibold text-gray-500">PMC Commercial</p>
                  <p class="text-xs text-gray-700">{{ (inv.pmc_reviewer_name || inv.pmc_commercial_reviewer_name) || 'Not assigned' }}</p>
                </div>
                <div class="flex-1 flex items-center gap-2 flex-wrap">
                  <span v-if="!inv.pmc_reviewed" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>
                  <span v-else-if="inv.pmc_approved" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Approved</span>
                  <span v-else class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Rejected</span>
                  <span v-if="inv.pmc_comment" class="text-xs text-gray-500 italic">{{ inv.pmc_comment }}</span>
                </div>
                <div v-if="canReviewInvAsPmc(inv)" class="shrink-0">
                  <button @click="reviewInvFromTab(inv, 'pmc')" class="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Submit Review</button>
                </div>
              </div>
              <!-- Client row -->
              <div class="flex items-center gap-3 px-4 py-3 flex-wrap">
                <div class="w-32 shrink-0">
                  <p class="text-xs font-semibold text-gray-500">Client Commercial</p>
                  <p class="text-xs text-gray-700">{{ (inv.client_reviewer_name || inv.client_commercial_reviewer_name) || 'Not assigned' }}</p>
                </div>
                <div class="flex-1 flex items-center gap-2 flex-wrap">
                  <span v-if="!inv.client_reviewed" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>
                  <span v-else-if="inv.client_approved" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Approved</span>
                  <span v-else class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Rejected</span>
                  <span v-if="inv.client_comment" class="text-xs text-gray-500 italic">{{ inv.client_comment }}</span>
                </div>
                <div v-if="canReviewInvAsClient(inv)" class="shrink-0">
                  <button @click="reviewInvFromTab(inv, 'client')" class="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Submit Review</button>
                </div>
              </div>
              <!-- Override row (admin / project owner / budget lead / package owner) -->
              <div v-if="canOverrideInvoice(inv)" class="flex items-center gap-2 px-4 py-2 bg-gray-50 flex-wrap">
                <span class="text-xs text-gray-400 mr-2">Override:</span>
                <button @click="openInvoiceOverride(inv, true)"
                  class="px-3 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded hover:bg-green-200">Approve</button>
                <button @click="openInvoiceOverride(inv, false)"
                  class="px-3 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded hover:bg-red-200">Reject</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ ORDER MODAL ═══ -->
      <div v-if="showOrderModal" class="modal-overlay" @click.self="showOrderModal=false">
        <div class="modal-box modal-xl">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ editingOrder ? 'Edit Order' : 'New Order (PO)' }}</h3>
            <button @click="showOrderModal=false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body" style="padding:0;display:flex;overflow:hidden">
            <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="form-label">PO Number *</label>
                  <input v-model="orderForm.po_number" type="text" class="input-field" placeholder="PO-2024-001"/>
                </div>
                <div>
                  <label class="form-label">Package *</label>
                  <select v-model="orderForm.package_id" @change="onOrderPackageChange" class="input-field">
                    <option :value="null">— Select package —</option>
                    <option v-for="row in editablePackages" :key="row.package_id" :value="row.package_id">
                      {{ row.tag_number }} — {{ row.name || '' }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Vendor Name</label>
                  <input v-model="orderForm.vendor_name" type="text" class="input-field" placeholder="Supplier name"/>
                </div>
                <div>
                  <label class="form-label">Order Date</label>
                  <input v-model="orderForm.order_date" type="date" class="input-field"/>
                </div>
                <div class="col-span-2">
                  <label class="form-label">Description</label>
                  <input v-model="orderForm.description" type="text" class="input-field" placeholder="Brief description"/>
                </div>
                <div>
                  <label class="form-label">Amount</label>
                  <input v-model.number="orderForm.amount" type="number" step="0.01" class="input-field" placeholder="0.00"/>
                </div>
                <div>
                  <label class="form-label">Currency</label>
                  <input :value="projectCurrency" class="input-field bg-gray-50" readonly/>
                </div>
                <div class="col-span-2">
                  <label class="form-label">Status</label>
                  <select v-model="orderForm.status" class="input-field">
                    <option value="DRAFT">Draft</option>
                    <option value="COMMITTED">Committed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
              </div>
              <p v-if="modalError" class="text-red-500 text-sm mt-3">{{ modalError }}</p>
            </div>
            <div class="w-[28rem] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
              <file-attachments record-type="order" :record-id="editingOrder ? editingOrder.id : null" :can-edit="true"></file-attachments>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="showOrderModal=false" class="btn-secondary">Cancel</button>
            <button v-if="!editingOrder" @click="saveOrder" :disabled="savingModal" class="btn-primary">
              {{ savingModal ? 'Saving...' : 'Save' }}
            </button>
            <button v-else-if="editingOrder._justCreated" @click="showOrderModal=false" class="btn-primary">
              Create Order
            </button>
            <button v-else @click="saveOrder" :disabled="savingModal" class="btn-primary">
              {{ savingModal ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>

      <!-- ═══ TRANSFER MODAL ═══ -->
      <div v-if="showTransferModal" class="modal-overlay" @click.self="showTransferModal=false">
        <div class="modal-box">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ transferForm.type === 'INJECTION' ? 'New Budget Injection' : transferForm.type === 'RISK_INTEGRATION' ? 'New Risk Integration' : 'New Budget Transfer' }}</h3>
            <button @click="showTransferModal=false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="grid grid-cols-2 gap-4">
              <div v-if="transferForm.type === 'TRANSFER'">
                <label class="form-label">From Package *</label>
                <select v-model="transferForm.from_package_id" class="input-field">
                  <option :value="null">— Select package —</option>
                  <option v-for="row in overview" :key="row.package_id" :value="row.package_id"
                    :disabled="row.package_id === transferForm.to_package_id">
                    {{ row.tag_number }} — {{ row.name || '' }}
                  </option>
                </select>
              </div>
              <div v-else>
                <label class="form-label">Source</label>
                <input type="text" :value="transferForm.type === 'RISK_INTEGRATION' ? 'Risk Integration' : 'External (Injection)'" class="input-field bg-gray-50" disabled/>
              </div>
              <div>
                <label class="form-label">To Package *</label>
                <select v-model="transferForm.to_package_id" class="input-field">
                  <option :value="null">— Select package —</option>
                  <option v-for="row in overview" :key="row.package_id" :value="row.package_id"
                    :disabled="row.package_id === transferForm.from_package_id">
                    {{ row.tag_number }} — {{ row.name || '' }}
                  </option>
                </select>
              </div>
              <div>
                <label class="form-label">Amount *</label>
                <input v-model.number="transferForm.amount" type="number" step="0.01" class="input-field" placeholder="0.00"/>
              </div>
              <div>
                <label class="form-label">Currency</label>
                <input :value="projectCurrency" class="input-field bg-gray-50" readonly/>
              </div>
              <div>
                <label class="form-label">Date</label>
                <input v-model="transferForm.transfer_date" type="date" class="input-field"/>
              </div>
              <div class="col-span-2">
                <label class="form-label">Description</label>
                <input v-model="transferForm.description" type="text" class="input-field" placeholder="Reason for transfer"/>
              </div>
            </div>
            <p v-if="modalError" class="text-red-500 text-sm mt-3">{{ modalError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showTransferModal=false" class="btn-secondary">Cancel</button>
            <button @click="saveTransfer" :disabled="savingModal" class="btn-primary">
              {{ savingModal ? 'Saving...' : 'Confirm' }}
            </button>
          </div>
        </div>
      </div>

      <!-- ═══ INVOICE MODAL ═══ -->
      <div v-if="showInvoiceModal" class="modal-overlay" @click.self="showInvoiceModal=false">
        <div class="modal-box modal-xl">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ editingInvoice ? 'Edit Invoice' : 'Create Invoice' }}</h3>
            <button @click="showInvoiceModal=false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body" style="padding:0;display:flex;overflow:hidden">
            <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="form-label">Invoice Number *</label>
                  <input v-model="invoiceForm.invoice_number" type="text" class="input-field" placeholder="INV-2024-001"/>
                </div>
                <div>
                  <label class="form-label">Linked Order (PO) *</label>
                  <select v-model="invoiceForm.order_id" class="input-field">
                    <option :value="null">— Select order —</option>
                    <option v-for="o in selectableOrders" :key="o.id" :value="o.id">
                      {{ o.po_number }} ({{ o.package_tag }})
                    </option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Invoice Date <span class="text-red-500">*</span></label>
                  <input v-model="invoiceForm.invoice_date" type="date" class="input-field" required/>
                </div>
                <div>
                  <label class="form-label">Amount</label>
                  <input v-model.number="invoiceForm.amount" type="number" step="0.01" class="input-field" placeholder="0.00"/>
                </div>
                <div>
                  <label class="form-label">Currency</label>
                  <input :value="projectCurrency" class="input-field bg-gray-50" readonly/>
                </div>
                <div class="col-span-2">
                  <label class="form-label">Description</label>
                  <input v-model="invoiceForm.description" type="text" class="input-field" placeholder="Invoice description"/>
                </div>
              </div>
              <p v-if="modalError" class="text-red-500 text-sm mt-3">{{ modalError }}</p>
            </div>
            <div class="w-[28rem] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
              <file-attachments record-type="invoice" :record-id="editingInvoice ? editingInvoice.id : null" :can-edit="true"></file-attachments>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="showInvoiceModal=false" class="btn-secondary">Cancel</button>
            <button v-if="!editingInvoice" @click="saveInvoice" :disabled="savingModal" class="btn-primary">
              {{ savingModal ? 'Saving...' : 'Save' }}
            </button>
            <button v-else-if="editingInvoice._justCreated" @click="showInvoiceModal=false" class="btn-primary">
              Done
            </button>
            <button v-else @click="saveInvoice" :disabled="savingModal" class="btn-primary">
              {{ savingModal ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>

      <!-- ═══ INVOICE DETAIL / REVIEW MODAL (available from any tab) ═══ -->
      <div v-if="selectedInvoice" class="modal-overlay" @click.self="selectedInvoice=null">
        <div class="modal-box modal-xl">
          <div class="modal-header">
            <div>
              <p class="text-xs font-mono text-gray-400">Invoice {{ selectedInvoice.invoice_number }}</p>
              <h3 class="text-lg font-semibold text-gray-800">{{ selectedInvoice.description || '—' }}</h3>
            </div>
            <div class="flex items-center gap-2">
              <span :class="['text-xs font-semibold px-2 py-1 rounded-full', invoiceStatusBadge(selectedInvoice.status)]">{{ selectedInvoice.status }}</span>
              <button @click="openInvoiceHistory(selectedInvoice)"
                class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded"
                title="Show review history">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                History
              </button>
              <button @click="selectedInvoice=null" class="text-gray-400 hover:text-gray-600">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
          <div class="modal-body" style="padding:0;display:flex;overflow:hidden">
            <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
              <div class="space-y-4">

                <!-- Info grid -->
                <div class="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-4 text-sm">
                  <div><span class="text-gray-500">Package:</span>
                    <span class="ml-1 font-medium">{{ selectedInvoice.package_tag || '—' }} {{ selectedInvoice.package_name || '' }}</span>
                  </div>
                  <div><span class="text-gray-500">PO:</span>
                    <span class="ml-1 font-medium">{{ selectedInvoice.po_number || '—' }}</span>
                  </div>
                  <div><span class="text-gray-500">Amount:</span>
                    <span class="ml-1 font-semibold text-gray-800">{{ fmt(selectedInvoice.amount) }} {{ selectedInvoice.currency }}</span>
                  </div>
                  <div><span class="text-gray-500">Invoice date:</span>
                    <span class="ml-1 font-medium">{{ fmtDate(selectedInvoice.invoice_date) }}</span>
                  </div>
                  <div><span class="text-gray-500">Created by:</span>
                    <span class="ml-1 font-medium">{{ selectedInvoice.created_by_name || '—' }}</span>
                  </div>
                  <div v-if="selectedInvoice.submitted_at"><span class="text-gray-500">Submitted:</span>
                    <span class="ml-1">{{ fmtDateTime(selectedInvoice.submitted_at) }}</span>
                  </div>
                </div>

                <div v-if="selectedInvoice.description" class="mb-4">
                  <p class="text-xs font-semibold text-gray-400 uppercase mb-1">Description</p>
                  <p class="text-sm text-gray-700 whitespace-pre-line bg-gray-50 rounded-lg p-3">{{ selectedInvoice.description }}</p>
                </div>

                <!-- Review status -->
                <div class="mb-4">
                  <p class="text-xs font-semibold text-gray-400 uppercase mb-2">Reviews</p>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="rounded-lg p-3 border" :class="invoiceReviewerStatus(selectedInvoice.pmc_reviewed, selectedInvoice.pmc_approved).cls">
                      <p class="text-xs font-semibold mb-1">PMC Commercial — {{ selectedInvoice.pmc_reviewer_name || selectedInvoice.pmc_commercial_reviewer_name || 'Not assigned' }}</p>
                      <p class="text-xs font-medium">{{ invoiceReviewerStatus(selectedInvoice.pmc_reviewed, selectedInvoice.pmc_approved).label }}</p>
                      <p v-if="selectedInvoice.pmc_comment" class="text-xs mt-1 italic">{{ selectedInvoice.pmc_comment }}</p>
                    </div>
                    <div class="rounded-lg p-3 border" :class="invoiceReviewerStatus(selectedInvoice.client_reviewed, selectedInvoice.client_approved).cls">
                      <p class="text-xs font-semibold mb-1">Client Commercial — {{ selectedInvoice.client_reviewer_name || selectedInvoice.client_commercial_reviewer_name || 'Not assigned' }}</p>
                      <p class="text-xs font-medium">{{ invoiceReviewerStatus(selectedInvoice.client_reviewed, selectedInvoice.client_approved).label }}</p>
                      <p v-if="selectedInvoice.client_comment" class="text-xs mt-1 italic">{{ selectedInvoice.client_comment }}</p>
                    </div>
                  </div>
                </div>

                <!-- Review form (shown if user clicked PMC/Client Review) -->
                <div v-if="reviewRole" class="border-t pt-4">
                  <h4 class="font-semibold text-gray-800 mb-3">
                    Submit {{ reviewRole === 'pmc' ? 'PMC Commercial' : 'Client Commercial' }} Review
                  </h4>
                  <div class="flex gap-3 mb-3">
                    <button @click="reviewForm.approved=true"
                      :class="['flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all',
                        reviewForm.approved ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500']">
                      ✓ Approve
                    </button>
                    <button @click="reviewForm.approved=false"
                      :class="['flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all',
                        !reviewForm.approved ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500']">
                      ✗ Reject
                    </button>
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Comment (required)</label>
                    <textarea v-model="reviewForm.comment" class="input-field" rows="3"
                      :placeholder="reviewForm.approved ? 'Approval comment...' : 'Reason for rejection...'"></textarea>
                  </div>
                  <p v-if="reviewError" class="text-red-500 text-sm mb-2">{{ reviewError }}</p>
                  <div class="flex justify-end gap-2 mt-3">
                    <button @click="reviewRole=''" class="btn-secondary">Cancel</button>
                    <button @click="submitInvoiceReview" :disabled="reviewSaving"
                      :class="['px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50',
                        reviewForm.approved ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-600 text-white hover:bg-red-700']">
                      {{ reviewSaving ? 'Submitting...' : (reviewForm.approved ? 'Approve' : 'Reject') }}
                    </button>
                  </div>
                </div>

              </div>
            </div>
            <div class="w-[28rem] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
              <file-attachments record-type="invoice" :record-id="selectedInvoice.id" :can-edit="true"></file-attachments>
            </div>
          </div>
          <!-- Actions footer -->
          <div v-if="!reviewRole" class="modal-footer justify-start">
            <button v-if="isPmcReviewerInv(selectedInvoice)" @click="reviewRole='pmc'"
              class="px-3 py-1.5 text-sm font-semibold bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">
              PMC Review
            </button>
            <button v-if="isClientReviewerInv(selectedInvoice)" @click="reviewRole='client'"
              class="px-3 py-1.5 text-sm font-semibold bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200">
              Client Review
            </button>
            <button v-if="canEditInv(selectedInvoice)" @click="openInvoiceModal(selectedInvoice); selectedInvoice=null"
              class="btn-secondary">Edit</button>
            <button v-if="canSubmitInv(selectedInvoice)" @click="submitInv(selectedInvoice)"
              class="btn-primary">{{ selectedInvoice.status === 'DRAFT' ? 'Submit for Review' : 'Resubmit for Review' }}</button>
            <button v-if="canCancelInv(selectedInvoice)" @click="cancelInv(selectedInvoice)"
              class="px-3 py-1.5 text-sm font-semibold text-red-600 hover:text-red-700">Cancel Invoice</button>
            <button v-if="canReopenInv(selectedInvoice)" @click="reopenInv(selectedInvoice)"
              class="px-3 py-1.5 text-sm font-semibold bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200">Re-open</button>
            <button @click="selectedInvoice=null" class="btn-secondary ml-auto">Close</button>
          </div>
        </div>
      </div>

      <!-- ═══ INVOICE OVERRIDE MODAL (admin/owner) ═══ -->
      <div v-if="showInvoiceOverrideModal" class="modal-overlay" @click.self="showInvoiceOverrideModal=false">
        <div class="modal-box" style="max-width:480px">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">
              {{ invoiceOverrideApproved ? 'Approve' : 'Reject' }} Invoice {{ invoiceOverrideInv ? invoiceOverrideInv.invoice_number : '' }}
            </h3>
            <button @click="showInvoiceOverrideModal=false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body space-y-3">
            <p class="text-sm text-gray-600">Override all reviewer decisions. This will set the invoice to <strong>{{ invoiceOverrideApproved ? 'APPROVED' : 'REJECTED' }}</strong>.</p>
            <div>
              <label class="form-label">Comment (optional)</label>
              <textarea v-model="invoiceOverrideComment" class="input-field" rows="3" placeholder="Reason for override..."></textarea>
            </div>
            <p v-if="invoiceOverrideError" class="text-red-500 text-sm">{{ invoiceOverrideError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showInvoiceOverrideModal=false" class="btn-secondary">Cancel</button>
            <button @click="submitInvoiceOverride" :disabled="invoiceOverrideSaving"
              :class="['px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 text-white', invoiceOverrideApproved ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700']">
              {{ invoiceOverrideSaving ? 'Saving...' : (invoiceOverrideApproved ? 'Confirm Approve' : 'Confirm Reject') }}
            </button>
          </div>
        </div>
      </div>

      <!-- ═══ INVOICE REVIEW HISTORY MODAL ═══ -->
      <div v-if="historyInvoice" class="modal-overlay" @click.self="historyInvoice=null" style="z-index:120">
        <div class="modal-box" style="max-width:560px">
          <div class="modal-header">
            <div>
              <p class="text-xs font-mono text-gray-400">Invoice {{ historyInvoice.invoice_number }}</p>
              <h3 class="text-lg font-semibold text-gray-800">Review History</h3>
            </div>
            <button @click="historyInvoice=null" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body" style="max-height:70vh;overflow-y:auto">
            <div v-if="invoiceHistoryLoading" class="text-center py-6 text-gray-400">
              <img src="/static/assets/impulse-loader.svg" class="h-6 mx-auto" alt="Loading"/>
            </div>
            <div v-else-if="invoiceHistoryError" class="text-red-500 text-sm">{{ invoiceHistoryError }}</div>
            <div v-else-if="invoiceHistoryEntries.length === 0" class="text-center py-6 text-gray-400 text-sm">No review events recorded yet.</div>
            <ol v-else class="relative border-l-2 border-gray-200 ml-3 space-y-4 pl-5">
              <li v-for="entry in invoiceHistoryEntries" :key="entry.id" class="relative">
                <span class="absolute -left-[29px] top-1 w-3 h-3 rounded-full border-2 border-white"
                  :class="entry.approved === true ? 'bg-green-500' : (entry.approved === false ? 'bg-red-500' : 'bg-blue-500')"></span>
                <div class="flex items-center gap-2 flex-wrap">
                  <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', historyEventClassInv(entry)]">
                    {{ historyEventLabelInv(entry) }}
                  </span>
                  <span class="text-xs text-gray-500">{{ fmtDateTime(entry.created_at) }}</span>
                </div>
                <p class="text-xs text-gray-600 mt-1">by <span class="font-medium">{{ entry.actor_name || '—' }}</span></p>
                <p v-if="entry.comment" class="text-sm text-gray-700 italic mt-1 bg-gray-50 rounded p-2 whitespace-pre-line">{{ entry.comment }}</p>
              </li>
            </ol>
          </div>
          <div class="modal-footer">
            <button @click="historyInvoice=null" class="btn-secondary">Close</button>
          </div>
        </div>
      </div>

      <!-- ═══ INVOICE IMPORT MODAL ═══ -->
      <div v-if="showInvoiceImportModal" class="modal-overlay" @click.self="showInvoiceImportModal=false">
        <div class="modal-box modal-xl" style="max-height:90vh;display:flex;flex-direction:column">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">Import Invoices from Excel</h3>
            <button @click="showInvoiceImportModal=false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body" style="overflow-y:auto;flex:1">

            <!-- Success message -->
            <div v-if="invoiceImportResult" class="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
              Import complete — <strong>{{ invoiceImportResult.created }}</strong> created,
              <strong>{{ invoiceImportResult.updated }}</strong> updated,
              <strong>{{ invoiceImportResult.skipped }}</strong> skipped.
            </div>

            <!-- Upload section (shown when no preview yet and no result) -->
            <div v-if="!invoiceImportPreview && !invoiceImportResult">
              <p class="text-sm text-gray-600 mb-4">
                Upload an Excel file (.xlsx) to import invoices. Download the template first to see the expected format and available orders (lookup values).
              </p>
              <div class="flex items-center gap-3 mb-4">
                <button @click="exportInvoiceTemplate" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                  Export / Download Template
                </button>
              </div>
              <div class="flex items-center gap-3 mb-3">
                <label class="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 cursor-pointer transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m4-8l-4-4m0 0L16 8m4-4v12"/>
                  </svg>
                  Choose File
                  <input type="file" accept=".xlsx" class="hidden" @change="onInvoiceImportFileChange"/>
                </label>
                <span v-if="invoiceImportFile" class="text-xs text-gray-500">{{ invoiceImportFile.name }}</span>
              </div>
              <p v-if="invoiceImportError" class="text-red-500 text-sm mb-3">{{ invoiceImportError }}</p>
              <p class="text-xs text-gray-400">
                Unique key: <strong>ID</strong> column. Leave blank to create new invoices; fill in an existing ID to update.
                The Lookups sheet contains valid PO numbers. Status is not imported — new invoices start as DRAFT.
              </p>
            </div>

            <!-- Preview section -->
            <div v-if="invoiceImportPreview && !invoiceImportResult">
              <div class="flex items-center gap-3 mb-4">
                <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">{{ invoiceImportPreview.summary.creates }} to create</span>
                <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{{ invoiceImportPreview.summary.updates }} to update</span>
                <span v-if="invoiceImportPreview.summary.errors" class="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">{{ invoiceImportPreview.summary.errors }} error(s)</span>
              </div>
              <p v-if="invoiceImportError" class="text-red-500 text-sm mb-3">{{ invoiceImportError }}</p>
              <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="bg-gray-50 border-b">
                      <th class="px-2 py-2 text-left font-semibold text-gray-500">Row</th>
                      <th class="px-2 py-2 text-left font-semibold text-gray-500">Action</th>
                      <th class="px-2 py-2 text-left font-semibold text-gray-500">ID</th>
                      <th class="px-2 py-2 text-left font-semibold text-gray-500">Invoice #</th>
                      <th class="px-2 py-2 text-left font-semibold text-gray-500">PO Number</th>
                      <th class="px-2 py-2 text-left font-semibold text-gray-500">Package</th>
                      <th class="px-2 py-2 text-right font-semibold text-gray-500">Amount</th>
                      <th class="px-2 py-2 text-left font-semibold text-gray-500">Errors / Warnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in invoiceImportPreview.rows" :key="r.row_num" :class="r.errors.length ? 'bg-red-50' : ''">
                      <td class="px-2 py-1.5 text-gray-400">{{ r.row_num }}</td>
                      <td class="px-2 py-1.5">
                        <span :class="r.action === 'CREATE' ? 'text-green-700 bg-green-100' : 'text-blue-700 bg-blue-100'" class="px-1.5 py-0.5 rounded text-xs font-bold">{{ r.action }}</span>
                      </td>
                      <td class="px-2 py-1.5 text-gray-500">{{ r.id || '—' }}</td>
                      <td class="px-2 py-1.5 font-medium">{{ r.invoice_number }}</td>
                      <td class="px-2 py-1.5 text-gray-600 font-mono">{{ r.po_number }}</td>
                      <td class="px-2 py-1.5">
                        <span v-if="r.package_tag" class="px-1.5 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ r.package_tag }}</span>
                      </td>
                      <td class="px-2 py-1.5 text-right font-semibold">{{ r.amount ? r.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00' }}</td>
                      <td class="px-2 py-1.5">
                        <span v-for="e in r.errors" class="block text-red-600 text-xs">{{ e }}</span>
                        <span v-for="w in r.warnings" class="block text-yellow-600 text-xs">{{ w }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button @click="invoiceImportPreview ? resetInvoiceImport() : (showInvoiceImportModal=false)" class="btn-secondary">
              {{ invoiceImportPreview && !invoiceImportResult ? 'Back' : 'Cancel' }}
            </button>

            <button v-if="!invoiceImportPreview && !invoiceImportResult && invoiceImportFile" @click="runInvoiceImportPreview"
              :disabled="invoiceImportLoading" class="btn-primary">
              {{ invoiceImportLoading ? 'Analysing…' : 'Preview Import' }}
            </button>

            <button v-if="invoiceImportPreview && !invoiceImportResult && invoiceImportPreview.summary.errors === 0"
              @click="applyInvoiceImport" :disabled="invoiceImportApplying" class="btn-primary">
              {{ invoiceImportApplying ? 'Importing…' : 'Confirm & Apply' }}
            </button>

            <button v-if="invoiceImportResult" @click="showInvoiceImportModal=false; loadAll()" class="btn-primary">
              Close & Refresh
            </button>
          </div>
        </div>
      </div>

    </div>
  `,

  data() {
    return {
      tab: 'overview',
      overview: [],
      orders: [],
      transfers: [],
      invoices: [],
      pkgList: [],
      riskImpact: { open_before_mitigation: 0, open_after_mitigation: 0, closed_after_mitigation: 0, initial_open_before: 0, initial_open_after: 0, initial_closed_after: 0, total_integrated: 0, closed_deducted: 0, open_deducted: 0 },

      // Overview inline editing
      editingBaseline: null,
      baselineForm: { amount: 0, currency: 'EUR' },

      // Filters
      exporting: false,
      xlsxExportingOverview: false,
      orderFilter: '',
      orderStatusFilter: '',
      invoiceFilter: '',
      invoiceStatusFilter: '',

      // Order modal
      showOrderModal: false,
      editingOrder: null,
      orderForm: { package_id: null, po_number: '', description: '', vendor_name: '', amount: 0, currency: 'EUR', order_date: '', status: 'COMMITTED' },

      // Transfer modal
      showTransferModal: false,
      transferForm: { type: 'TRANSFER', from_package_id: null, to_package_id: null, amount: 0, currency: 'EUR', description: '', transfer_date: '' },

      // Invoice modal
      showInvoiceModal: false,
      editingInvoice: null,
      invoiceForm: { order_id: null, invoice_number: '', description: '', amount: 0, currency: 'EUR', invoice_date: '' },

      savingModal: false,
      modalError: '',

      // Dashboard
      dashPkgFilter: '',

      // Invoice detail / review modal
      selectedInvoice: null,
      reviewRole: '',   // 'pmc' | 'client'
      reviewForm: { approved: true, comment: '' },
      reviewError: '',
      reviewSaving: false,

      // Invoice override modal (admin/owner)
      showInvoiceOverrideModal: false,
      invoiceOverrideInv: null,
      invoiceOverrideApproved: true,
      invoiceOverrideComment: '',
      invoiceOverrideSaving: false,
      invoiceOverrideError: '',

      // Invoice review history modal
      historyInvoice: null,
      invoiceHistoryEntries: [],
      invoiceHistoryLoading: false,
      invoiceHistoryError: '',

      // Invoice import
      showInvoiceImportModal: false,
      invoiceImportFile: null,
      invoiceImportPreview: null,
      invoiceImportLoading: false,
      invoiceImportApplying: false,
      invoiceImportError: '',
      invoiceImportResult: null,

      // Chart instances
      budgetBarChartObj: null,
      invoiceDonutChartObj: null,
      invoiceMonthlyChartObj: null,
      cumulativeSpendChartObj: null,
    };
  },

  computed: {
    projectCurrency() {
      return (window.AppSettings && window.AppSettings.currency) || 'EUR';
    },

    isAdminOrOwner() {
      if (!this.currentUser) return false;
      if (this.currentUser.role === 'ADMIN' || this.currentUser.role === 'PROJECT_OWNER') return true;
      // A Cost Controller (Budget Module Lead) gets the same UI gates.
      return (this.currentUser.lead_modules || []).includes('Budget');
    },

    canViewBudgetOverview() {
      return this.currentUser && ['ADMIN', 'PROJECT_OWNER', 'PROJECT_TEAM', 'CLIENT'].includes(this.currentUser.role);
    },

    canCreateOrder() {
      if (!this.currentUser) return false;
      if (this.currentUser.role === 'VENDOR') return false;
      if (['ADMIN', 'PROJECT_OWNER', 'CLIENT'].includes(this.currentUser.role)) return true;
      if (!this.currentUser.contact_id) return false;
      return this.pkgList.some(p => p.package_owner_id === this.currentUser.contact_id);
    },

    isCommercialReviewer() {
      if (!this.currentUser || !this.currentUser.contact_id) return false;
      return this.pkgList.some(p =>
        p.pmc_commercial_reviewer_id === this.currentUser.contact_id ||
        p.client_commercial_reviewer_id === this.currentUser.contact_id
      );
    },

    canSeeApprovals() {
      return this.isAdminOrOwner || this.isCommercialReviewer;
    },

    canSubmitInvoiceAny() {
      if (!this.currentUser) return false;
      if (['ADMIN', 'PROJECT_OWNER', 'CLIENT'].includes(this.currentUser.role)) return true;
      if (!this.currentUser.contact_id) return false;
      if (this.pkgList.some(p => p.package_owner_id === this.currentUser.contact_id)) return true;
      if (this.currentUser.role === 'VENDOR') {
        return this.pkgList.some(p => p.contact_ids && p.contact_ids.includes(this.currentUser.contact_id));
      }
      return false;
    },

    // Package IDs the current user can see in orders/invoices (null = all)
    visiblePackageIds() {
      if (!this.currentUser) return new Set();
      if (['ADMIN', 'PROJECT_OWNER', 'PROJECT_TEAM', 'CLIENT'].includes(this.currentUser.role)) return null;
      const ids = new Set();
      if (this.currentUser.contact_id) {
        this.pkgList.forEach(p => {
          if (p.package_owner_id === this.currentUser.contact_id) ids.add(p.id);
          if (p.contact_ids && p.contact_ids.includes(this.currentUser.contact_id)) ids.add(p.id);
        });
      }
      return ids;
    },

    visibleOverview() {
      const vis = this.visiblePackageIds;
      if (vis === null) return this.overview;
      return this.overview.filter(row => vis.has(row.package_id));
    },

    editablePackages() {
      return this.overview.filter(row => this.canEditOrdersInvoices(row.package_id));
    },

    filteredOrders() {
      const vis = this.visiblePackageIds;
      return this.orders.filter(o => {
        if (vis !== null && !vis.has(o.package_id)) return false;
        if (this.orderFilter && o.package_id !== this.orderFilter) return false;
        if (this.orderStatusFilter && o.status !== this.orderStatusFilter) return false;
        return true;
      });
    },

    filteredInvoices() {
      const vis = this.visiblePackageIds;
      return this.invoices.filter(inv => {
        if (vis !== null && !vis.has(inv.package_id)) return false;
        if (this.invoiceFilter && inv.package_id !== this.invoiceFilter) return false;
        if (this.invoiceStatusFilter && inv.status !== this.invoiceStatusFilter) return false;
        return true;
      });
    },

    totals() {
      return this.overview.reduce((acc, row) => ({
        baseline: acc.baseline + (row.baseline || 0),
        transfer_net: acc.transfer_net + (row.transfer_net || 0),
        forecast: acc.forecast + (row.forecast || 0),
        committed: acc.committed + (row.committed || 0),
        approved_sc_no_po: acc.approved_sc_no_po + (row.approved_sc_no_po || 0),
        remaining: acc.remaining + (row.remaining || 0),
        spend: acc.spend + (row.spend || 0),
        pending_sc_cost: acc.pending_sc_cost + (row.pending_sc_cost || 0),
        remaining_incl_pending: acc.remaining_incl_pending + (row.remaining_incl_pending || 0),
        bid_value: acc.bid_value + (row.bid_value || 0),
        awarded_count: acc.awarded_count + (row.bid_status === 'AWARDED' ? 1 : 0),
        in_progress_count: acc.in_progress_count + (row.bid_status === 'IN_PROGRESS' ? 1 : 0),
      }), { baseline: 0, transfer_net: 0, forecast: 0, committed: 0, approved_sc_no_po: 0, remaining: 0, spend: 0, pending_sc_cost: 0, remaining_incl_pending: 0, bid_value: 0, awarded_count: 0, in_progress_count: 0 });
    },

    selectableOrders() {
      return this.orders.filter(o => o.status !== 'CANCELLED' && this.canSubmitInvoice(o.package_id));
    },

    isVendor() {
      return this.currentUser && this.currentUser.role === 'VENDOR';
    },

    canSeeDashboard() {
      if (!this.currentUser) return false;
      return ['ADMIN', 'PROJECT_OWNER', 'PROJECT_TEAM', 'CLIENT'].includes(this.currentUser.role);
    },

    dashOverview() {
      if (!this.dashPkgFilter) return this.overview;
      return this.overview.filter(r => r.package_id === this.dashPkgFilter);
    },

    dashTotals() {
      return this.dashOverview.reduce((acc, row) => ({
        baseline: acc.baseline + (row.baseline || 0),
        transfer_net: acc.transfer_net + (row.transfer_net || 0),
        forecast: acc.forecast + (row.forecast || 0),
        committed: acc.committed + (row.committed || 0),
        approved_sc_no_po: acc.approved_sc_no_po + (row.approved_sc_no_po || 0),
        spend: acc.spend + (row.spend || 0),
        pending_sc_cost: acc.pending_sc_cost + (row.pending_sc_cost || 0),
        bid_value: acc.bid_value + (row.bid_value || 0),
        awarded_count: acc.awarded_count + (row.bid_status === 'AWARDED' ? 1 : 0),
        in_progress_count: acc.in_progress_count + (row.bid_status === 'IN_PROGRESS' ? 1 : 0),
      }), { baseline: 0, transfer_net: 0, forecast: 0, committed: 0, approved_sc_no_po: 0, spend: 0, pending_sc_cost: 0, bid_value: 0, awarded_count: 0, in_progress_count: 0 });
    },

    invoiceStatusCounts() {
      const filtered = this.dashPkgFilter
        ? this.invoices.filter(i => i.package_id === this.dashPkgFilter)
        : this.invoices;
      return filtered.reduce((acc, inv) => {
        acc[inv.status] = (acc[inv.status] || 0) + 1;
        return acc;
      }, {});
    },

    pendingInvoices() {
      return this.invoices.filter(inv => inv.status === 'PENDING');
    },

    pendingInvoiceCards() {
      // PENDING invoices the current user should see on the Approvals tab —
      // reviewers + admins/owners (matches the scope-changes "Approvals" model).
      const pending = this.pendingInvoices;
      if (this.isAdminOrOwner) return pending;
      if (!this.currentUser || !this.currentUser.contact_id) return [];
      const cid = this.currentUser.contact_id;
      return pending.filter(inv => {
        const pmcId = inv.pmc_reviewer_contact_id ?? inv.pmc_commercial_reviewer_id;
        const cliId = inv.client_reviewer_contact_id ?? inv.client_commercial_reviewer_id;
        return pmcId === cid || cliId === cid;
      });
    },

    approvedByOrder() {
      const map = {};
      this.invoices.forEach(inv => {
        if (inv.status === 'APPROVED') {
          map[inv.order_id] = (map[inv.order_id] || 0) + (inv.amount || 0);
        }
      });
      return map;
    },

    // Monthly invoice data for dashboard chart (respects dashPkgFilter)
    monthlyInvoiceData() {
      const vis = this.dashPkgFilter;
      const filtered = vis ? this.invoices.filter(i => i.package_id === vis) : this.invoices;

      // Group by month and status
      const knownStatuses = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
      const byMonth = {};
      filtered.forEach(inv => {
        if (!inv.invoice_date) return;
        const month = inv.invoice_date.substring(0, 7); // "YYYY-MM"
        if (!byMonth[month]) {
          byMonth[month] = {};
          knownStatuses.forEach(s => { byMonth[month][s] = 0; });
        }
        // Map any unknown status to PENDING as fallback
        const status = knownStatuses.includes(inv.status) ? inv.status : 'PENDING';
        byMonth[month][status] += inv.amount || 0;
      });

      // Sort months chronologically
      const months = Object.keys(byMonth).sort();
      return { months, byMonth };
    },

    monthlyInvoiceLabels() {
      return this.monthlyInvoiceData.months;
    },
  },

  watch: {
    tab(val) {
      this.$emit('subtab-change', val);
      if (val === 'dashboard') {
        this.$nextTick(() => this.renderDashCharts());
      }
    },
    editingOrder(val) {
      this.$emit('record-change', val ? { type: 'order', id: val.id } : null);
    },
    editingInvoice(val) {
      this.$emit('record-change', val ? { type: 'invoice', id: val.id } : null);
    },
    selectedInvoice(val) {
      // The view-detail modal for an invoice (separate from the editor).
      if (this.editingInvoice) return;     // editor takes precedence
      this.$emit('record-change', val ? { type: 'invoice_view', id: val.id } : null);
    },
    dashPkgFilter() {
      if (this.tab === 'dashboard') {
        this.$nextTick(() => this.renderDashCharts());
      }
    },
    overview() {
      if (this.tab === 'dashboard') {
        this.$nextTick(() => this.renderDashCharts());
      }
    },
    invoices() {
      if (this.tab === 'dashboard') {
        this.$nextTick(() => this.renderDashCharts());
      }
    },
  },

  async mounted() {
    if (!this.canViewBudgetOverview) {
      this.tab = 'orders';
    }
    if (this.initialTab) {
      this.tab = this.initialTab;
    }
    await this.loadAll();
    this.checkPendingOpen();
    if (this.tab === 'dashboard') {
      this.$nextTick(() => this.renderDashCharts());
    }
  },

  // Destroy charts on unmount so they don't linger in Chart.js's global
  // registry with detached canvases and throw on later animation frames.
  beforeUnmount() {
    if (this.budgetBarChartObj)       { try { this.budgetBarChartObj.destroy(); }       catch (e) {} this.budgetBarChartObj = null; }
    if (this.invoiceDonutChartObj)    { try { this.invoiceDonutChartObj.destroy(); }    catch (e) {} this.invoiceDonutChartObj = null; }
    if (this.invoiceMonthlyChartObj)  { try { this.invoiceMonthlyChartObj.destroy(); }  catch (e) {} this.invoiceMonthlyChartObj = null; }
    if (this.cumulativeSpendChartObj) { try { this.cumulativeSpendChartObj.destroy(); } catch (e) {} this.cumulativeSpendChartObj = null; }
  },

  methods: {
    tabClass(t) {
      return ['px-4 py-1.5 rounded text-sm font-medium transition-all', this.tab === t ? 'bg-white shadow text-ips-blue' : 'text-gray-500 hover:text-gray-700'];
    },

    async loadAll() {
      try {
        [this.overview, this.orders, this.transfers, this.invoices, this.pkgList, this.riskImpact] = await Promise.all([
          API.getBudgetOverview(),
          API.getBudgetOrders(),
          API.getBudgetTransfers(),
          API.getBudgetInvoices(),
          API.getPackages(),
          API.getBudgetRiskImpact(),
        ]);
      } catch (e) {
        console.error('Budget load error:', e);
      }
    },

    canEditPackage(packageId) {
      if (!this.currentUser) return false;
      if (this.isAdminOrOwner) return true;
      if (this.currentUser.role === 'PROJECT_TEAM') {
        const pkg = this.pkgList.find(p => p.id === packageId);
        return pkg && pkg.package_owner_id !== null && pkg.package_owner_id === this.currentUser.contact_id;
      }
      return false;
    },

    canEditOrdersInvoices(packageId) {
      if (!this.currentUser) return false;
      if (['ADMIN', 'PROJECT_OWNER', 'CLIENT'].includes(this.currentUser.role)) return true;
      if (!this.currentUser.contact_id) return false;
      const pkg = this.pkgList.find(p => p.id === packageId);
      return pkg && pkg.package_owner_id === this.currentUser.contact_id;
    },

    canSubmitInvoice(packageId) {
      if (!this.currentUser) return false;
      if (['ADMIN', 'PROJECT_OWNER', 'CLIENT'].includes(this.currentUser.role)) return true;
      if (!this.currentUser.contact_id) return false;
      const pkg = this.pkgList.find(p => p.id === packageId);
      if (!pkg) return false;
      if (pkg.package_owner_id === this.currentUser.contact_id) return true;
      if (this.currentUser.role === 'VENDOR' && pkg.contact_ids && pkg.contact_ids.includes(this.currentUser.contact_id)) return true;
      return false;
    },

    fmt(n) {
      if (n === null || n === undefined) return '—';
      return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    },

    actualBudget(row) {
      return (row.baseline || 0) + (row.transfer_net || 0);
    },

    committedTotal(row) {
      return (row.committed || 0) + (row.approved_sc_no_po || 0);
    },

    remainingDetail(src) {
      const ab = (src.baseline || 0) + (src.transfer_net || 0);
      const ct = (src.committed || 0) + (src.approved_sc_no_po || 0);
      if (ct > 0) return { value: ab - ct, label: '(Order+Appr.SC)' };
      if ((src.bid_value || 0) > 0) return { value: ab - src.bid_value, label: 'Procurement' };
      return { value: ab, label: '' };
    },

    remainingInclPending(src) {
      return this.remainingDetail(src).value - (src.pending_sc_cost || 0);
    },

    fmtDate(d) {
      if (!d) return '—';
      const [y, m, day] = d.split('-');
      return `${day}/${m}/${y}`;
    },

    orderStatusClass(s) {
      return { DRAFT: 'badge-gray', COMMITTED: 'badge-blue', CANCELLED: 'badge-red' }[s] || 'badge-gray';
    },

    // Baseline editing
    startEditBaseline(row) {
      if (!this.canEditPackage(row.package_id)) return;
      this.editingBaseline = row.package_id;
      this.baselineForm = { amount: row.baseline, currency: this.projectCurrency };
    },

    async saveBaseline(packageId) {
      try {
        await API.upsertBaseline(packageId, this.baselineForm);
        this.editingBaseline = null;
        const idx = this.overview.findIndex(r => r.package_id === packageId);
        if (idx !== -1) {
          const net = this.overview[idx].transfer_net;
          this.overview[idx].baseline = this.baselineForm.amount;
          this.overview[idx].currency = this.baselineForm.currency;
          const approvedSc = this.overview[idx].approved_sc_no_po || 0;
          this.overview[idx].forecast = this.baselineForm.amount + net + approvedSc;
          this.overview[idx].remaining = this.overview[idx].forecast - this.overview[idx].committed;
          this.overview[idx].remaining_incl_pending = this.overview[idx].remaining - (this.overview[idx].pending_sc_cost || 0);
        }
      } catch (e) {
        alert(e.message);
      }
    },

    checkPendingOpen() {
      if (!this.pendingOpen) return;
      const { record_type, record_id } = this.pendingOpen;
      if (record_type === 'order') {
        const o = this.orders.find(x => x.id === record_id);
        if (o) { this.tab = 'orders'; this.openOrderModal(o); }
      } else if (record_type === 'invoice') {
        const i = this.invoices.find(x => x.id === record_id);
        if (i) {
          // Default tab if caller didn't specify one — rejected goes to the
          // invoice list (so the creator can resubmit), pending goes to Approvals.
          if (!this.initialTab) {
            this.tab = i.status === 'REJECTED' ? 'invoices' : 'approvals';
          }
          this.openInvoiceDetail(i);
        }
      }
    },

    // Orders
    openOrderModal(o = null) {
      this.editingOrder = o;
      if (o) {
        this.orderForm = { package_id: o.package_id, po_number: o.po_number, description: o.description || '', vendor_name: o.vendor_name || '', amount: o.amount, currency: o.currency, order_date: o.order_date || '', status: o.status, updated_at: o.updated_at || null };
      } else {
        const defaultPackageId = this.editablePackages.length === 1 ? this.editablePackages[0].package_id : null;
        const defaultVendor = defaultPackageId ? (this.packageCompany(defaultPackageId) || '') : '';
        this.orderForm = { package_id: defaultPackageId, po_number: '', description: '', vendor_name: defaultVendor, amount: 0, currency: this.projectCurrency, order_date: '', status: 'COMMITTED', updated_at: null };
      }
      this.modalError = '';
      this.showOrderModal = true;
    },

    packageCompany(packageId) {
      const pkg = this.pkgList.find(p => p.id === packageId);
      return pkg ? (pkg.company || pkg.name || '') : '';
    },

    onOrderPackageChange() {
      const company = this.packageCompany(this.orderForm.package_id);
      if (!company) return;
      this.orderForm.vendor_name = company;
    },

    async saveOrder() {
      if (!this.orderForm.po_number.trim()) { this.modalError = 'PO Number is required.'; return; }
      if (!this.orderForm.package_id) { this.modalError = 'Package is required.'; return; }
      this.savingModal = true;
      this.modalError = '';
      try {
        if (this.editingOrder) {
          await API.updateOrder(this.editingOrder.id, this.orderForm);
          this.showOrderModal = false;
        } else {
          this.editingOrder = { ...await API.createOrder(this.orderForm), _justCreated: true };
        }
        await this.loadAll();
      } catch (e) {
        this.modalError = e.status === 409
          ? 'This order was modified by another user. Please close and reopen to get the latest version.'
          : e.message;
      } finally {
        this.savingModal = false;
      }
    },

    async deleteOrder(o) {
      if (!confirm(`Delete order "${o.po_number}"?`)) return;
      try {
        await API.deleteOrder(o.id);
        await this.loadAll();
      } catch (e) {
        alert(e.message);
      }
    },

    // Transfers
    openTransferModal(type) {
      this.transferForm = { type, from_package_id: null, to_package_id: null, amount: 0, currency: this.projectCurrency, description: '', transfer_date: '' };
      this.modalError = '';
      this.showTransferModal = true;
    },

    async saveTransfer() {
      if (!this.transferForm.to_package_id) { this.modalError = 'Target package is required.'; return; }
      if (this.transferForm.type === 'TRANSFER' && !this.transferForm.from_package_id) { this.modalError = 'Source package is required for a transfer.'; return; }
      if (!this.transferForm.amount || this.transferForm.amount <= 0) { this.modalError = 'Amount must be greater than zero.'; return; }
      this.savingModal = true;
      this.modalError = '';
      try {
        await API.createTransfer(this.transferForm);
        this.showTransferModal = false;
        await this.loadAll();
      } catch (e) {
        this.modalError = e.message;
      } finally {
        this.savingModal = false;
      }
    },

    async deleteTransfer(t) {
      if (!confirm('Delete this transfer/injection?')) return;
      try {
        await API.deleteTransfer(t.id);
        await this.loadAll();
      } catch (e) {
        alert(e.message);
      }
    },

    // Invoices
    openInvoiceModal(inv = null) {
      this.editingInvoice = inv;
      const today = new Date().toISOString().split('T')[0];
      this.invoiceForm = inv
        ? { order_id: inv.order_id, invoice_number: inv.invoice_number, description: inv.description || '', amount: inv.amount, currency: inv.currency, invoice_date: inv.invoice_date || today, updated_at: inv.updated_at || null }
        : { order_id: null, invoice_number: '', description: '', amount: 0, currency: this.projectCurrency, invoice_date: today, updated_at: null };
      this.modalError = '';
      this.showInvoiceModal = true;
    },

    async saveInvoice() {
      if (!this.invoiceForm.invoice_number.trim()) { this.modalError = 'Invoice number is required.'; return; }
      if (!this.invoiceForm.order_id) { this.modalError = 'Linked order is required.'; return; }
      if (!this.invoiceForm.invoice_date) { this.modalError = 'Invoice date is required.'; return; }
      this.savingModal = true;
      this.modalError = '';
      try {
        if (this.editingInvoice) {
          await API.updateInvoice(this.editingInvoice.id, this.invoiceForm);
          this.showInvoiceModal = false;
        } else {
          this.editingInvoice = { ...await API.createInvoice(this.invoiceForm), _justCreated: true };
        }
        await this.loadAll();
      } catch (e) {
        this.modalError = e.status === 409
          ? 'This invoice was modified by another user. Please close and reopen to get the latest version.'
          : e.message;
      } finally {
        this.savingModal = false;
      }
    },

    // ── Invoice approval helpers (mirror the scope-change flow) ──────────────
    isPmcReviewerInv(inv) {
      if (!this.currentUser || !this.currentUser.contact_id) return false;
      if (inv.status !== 'PENDING') return false;
      const cid = this.currentUser.contact_id;
      const pmcId = inv.pmc_reviewer_contact_id ?? inv.pmc_commercial_reviewer_id;
      return pmcId === cid && !inv.pmc_reviewed;
    },

    isClientReviewerInv(inv) {
      if (!this.currentUser || !this.currentUser.contact_id) return false;
      if (inv.status !== 'PENDING') return false;
      const cid = this.currentUser.contact_id;
      const cliId = inv.client_reviewer_contact_id ?? inv.client_commercial_reviewer_id;
      return cliId === cid && !inv.client_reviewed;
    },

    canReviewInvAsPmc(inv) {
      if (!this.currentUser || !this.currentUser.contact_id) return false;
      if (inv.pmc_reviewed) return false;
      const cid = this.currentUser.contact_id;
      const pmcId = inv.pmc_reviewer_contact_id ?? inv.pmc_commercial_reviewer_id;
      return pmcId === cid;
    },

    canReviewInvAsClient(inv) {
      if (!this.currentUser || !this.currentUser.contact_id) return false;
      if (inv.client_reviewed) return false;
      const cid = this.currentUser.contact_id;
      const cliId = inv.client_reviewer_contact_id ?? inv.client_commercial_reviewer_id;
      return cliId === cid;
    },

    isPackageMemberInv(inv) {
      if (!this.currentUser || !this.currentUser.contact_id || !inv.package_id) return false;
      const pkg = this.pkgList.find(p => p.id === inv.package_id);
      if (!pkg) return false;
      const cid = this.currentUser.contact_id;
      if (pkg.package_owner_id === cid) return true;
      if (pkg.account_manager_id === cid) return true;
      return Array.isArray(pkg.contact_ids) && pkg.contact_ids.includes(cid);
    },

    canManageInv(inv) {
      if (!this.currentUser) return false;
      if (['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role)) return true;
      if (inv.created_by_id === this.currentUser.id) return true;
      return this.isPackageMemberInv(inv);
    },

    hasInvRejection(inv) {
      // One reviewer has already rejected — invoice is effectively doomed,
      // so the creator/package contact can fix & resubmit without waiting.
      return (inv.pmc_reviewed && inv.pmc_approved === false) ||
             (inv.client_reviewed && inv.client_approved === false);
    },

    isInvEditable(inv) {
      return ['DRAFT', 'REJECTED'].includes(inv.status) ||
        (inv.status === 'PENDING' && this.hasInvRejection(inv));
    },

    canEditInv(inv) {
      return this.isInvEditable(inv) && this.canManageInv(inv);
    },

    canSubmitInv(inv) {
      return this.isInvEditable(inv) && this.canManageInv(inv);
    },

    canCancelInv(inv) {
      return !['APPROVED', 'CANCELLED'].includes(inv.status) && this.canManageInv(inv);
    },

    canReopenInv(inv) {
      return inv.status === 'CANCELLED' && this.canManageInv(inv);
    },

    invoiceReviewerStatus(reviewed, approved) {
      if (!reviewed) return { cls: 'bg-yellow-50 text-yellow-600', label: 'Pending' };
      return approved
        ? { cls: 'bg-green-50 text-green-700', label: 'Approved' }
        : { cls: 'bg-red-50 text-red-700', label: 'Rejected' };
    },

    // ── Invoice detail / review modal ────────────────────────────────────────
    openInvoiceDetail(inv) {
      this.selectedInvoice = inv;
      this.reviewRole = '';
      this.reviewForm = { approved: true, comment: '' };
      this.reviewError = '';
    },

    openInvReview(inv, role) {
      this.selectedInvoice = inv;
      this.reviewRole = role;
      this.reviewForm = { approved: true, comment: '' };
      this.reviewError = '';
    },

    reviewInvFromTab(inv, role) {
      this.openInvoiceDetail(inv);
      this.$nextTick(() => { this.reviewRole = role; });
    },

    async submitInvoiceReview() {
      if (!this.reviewForm.comment.trim()) { this.reviewError = 'Comment is required.'; return; }
      this.reviewSaving = true;
      this.reviewError = '';
      try {
        const data = { approved: this.reviewForm.approved, comment: this.reviewForm.comment };
        if (this.reviewRole === 'pmc') {
          await API.pmcReviewInvoice(this.selectedInvoice.id, data);
        } else {
          await API.clientReviewInvoice(this.selectedInvoice.id, data);
        }
        await this.loadAll();
        this.selectedInvoice = this.invoices.find(i => i.id === this.selectedInvoice.id) || null;
        this.reviewRole = '';
      } catch (e) {
        this.reviewError = e.message || 'Review failed.';
      } finally {
        this.reviewSaving = false;
      }
    },

    // ── Invoice submit / cancel / reopen ─────────────────────────────────────
    async submitInv(inv) {
      const label = inv.status === 'DRAFT' ? 'Submit' : 'Resubmit';
      if (!confirm(`${label} invoice "${inv.invoice_number}" for review?`)) return;
      try {
        await API.submitInvoice(inv.id);
        await this.loadAll();
        if (this.selectedInvoice && this.selectedInvoice.id === inv.id) {
          this.selectedInvoice = this.invoices.find(i => i.id === inv.id) || null;
        }
      } catch (e) {
        alert(e.message || 'Submit failed.');
      }
    },

    async cancelInv(inv) {
      if (!confirm(`Cancel invoice "${inv.invoice_number}"? This cannot be undone.`)) return;
      try {
        await API.cancelInvoice(inv.id);
        await this.loadAll();
        if (this.selectedInvoice && this.selectedInvoice.id === inv.id) this.selectedInvoice = null;
      } catch (e) {
        alert(e.message || 'Cancel failed.');
      }
    },

    async reopenInv(inv) {
      try {
        await API.reopenInvoice(inv.id);
        await this.loadAll();
        if (this.selectedInvoice && this.selectedInvoice.id === inv.id) {
          this.selectedInvoice = this.invoices.find(i => i.id === inv.id) || null;
        }
      } catch (e) {
        alert(e.message || 'Re-open failed.');
      }
    },

    canOverrideInvoice(inv) {
      // Mirrors backend gate at budget.py override_invoice:
      // ADMIN / PROJECT_OWNER / Budget Module Lead / Package Owner of the invoice's package.
      if (this.isAdminOrOwner) return true;
      if (!inv || !this.currentUser) return false;
      const pkg = (this.overview || []).find(p => p.package_id === inv.package_id);
      return !!(pkg && pkg.package_owner_id && pkg.package_owner_id === this.currentUser.contact_id);
    },

    // ── Invoice override (admin / owner / lead / package owner) ──────────────
    openInvoiceOverride(inv, approved) {
      this.invoiceOverrideInv = inv;
      this.invoiceOverrideApproved = approved;
      this.invoiceOverrideComment = '';
      this.invoiceOverrideError = '';
      this.showInvoiceOverrideModal = true;
    },

    async submitInvoiceOverride() {
      this.invoiceOverrideSaving = true;
      this.invoiceOverrideError = '';
      try {
        await API.overrideInvoice(this.invoiceOverrideInv.id, {
          approved: this.invoiceOverrideApproved,
          comment: this.invoiceOverrideComment,
        });
        await this.loadAll();
        this.showInvoiceOverrideModal = false;
        this.invoiceOverrideInv = null;
      } catch (e) {
        this.invoiceOverrideError = e.message || 'Override failed.';
      } finally {
        this.invoiceOverrideSaving = false;
      }
    },

    // ── Invoice review history ───────────────────────────────────────────────
    async openInvoiceHistory(inv) {
      this.historyInvoice = inv;
      this.invoiceHistoryEntries = [];
      this.invoiceHistoryError = '';
      this.invoiceHistoryLoading = true;
      try {
        this.invoiceHistoryEntries = await API.getInvoiceHistory(inv.id);
      } catch (e) {
        this.invoiceHistoryError = e.message || 'Failed to load history.';
      } finally {
        this.invoiceHistoryLoading = false;
      }
    },

    historyEventLabelInv(entry) {
      if (entry.event === 'SUBMIT') return 'Submitted for review';
      if (entry.event === 'OVERRIDE') return 'Override — ' + (entry.approved ? 'Approved' : 'Rejected');
      const who = entry.event === 'PMC' ? 'PMC Commercial' : 'Client Commercial';
      return who + (entry.approved ? ' — Approved' : ' — Rejected');
    },

    historyEventClassInv(entry) {
      if (entry.event === 'SUBMIT') return 'bg-blue-100 text-blue-700';
      if (entry.approved === true) return 'bg-green-100 text-green-700';
      if (entry.approved === false) return 'bg-red-100 text-red-700';
      return 'bg-gray-100 text-gray-600';
    },

    invoiceStatusBadge(s) {
      return {
        DRAFT:     'bg-gray-100 text-gray-600',
        PENDING:   'bg-blue-100 text-blue-700',
        APPROVED:  'bg-green-100 text-green-700',
        REJECTED:  'bg-red-100 text-red-700',
        CANCELLED: 'bg-gray-100 text-gray-400',
      }[s] || 'bg-gray-100 text-gray-500';
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

    invoiceStatusColor(s) {
      return { DRAFT: '#6B7280', PENDING: '#F59E0B', APPROVED: '#10B981', REJECTED: '#EF4444', CANCELLED: '#9CA3AF' }[s] || '#9CA3AF';
    },

    async exportOverviewToExcel() {
      this.xlsxExportingOverview = true;
      try { await API.exportBudgetOverviewXlsx(); }
      catch (e) { alert('Export failed: ' + (e.message || '')); }
      finally { this.xlsxExportingOverview = false; }
    },

    async exportOrders() {
      this.exporting = true;
      try {
        const params = new URLSearchParams();
        if (this.orderFilter)       params.set('package_id', this.orderFilter);
        if (this.orderStatusFilter) params.set('status', this.orderStatusFilter);
        const qs = params.toString() ? '?' + params.toString() : '';
        const date = new Date().toISOString().split('T')[0];
        await API.download(`/api/budget/orders/export/excel${qs}`, `orders_${date}.xlsx`);
      } catch (e) {
        alert('Export failed: ' + e.message);
      } finally {
        this.exporting = false;
      }
    },

    async exportInvoices() {
      this.exporting = true;
      try {
        const params = new URLSearchParams();
        if (this.invoiceFilter)       params.set('package_id', this.invoiceFilter);
        if (this.invoiceStatusFilter) params.set('status', this.invoiceStatusFilter);
        const qs = params.toString() ? '?' + params.toString() : '';
        const date = new Date().toISOString().split('T')[0];
        await API.download(`/api/budget/invoices/export/excel${qs}`, `invoices_${date}.xlsx`);
      } catch (e) {
        alert('Export failed: ' + e.message);
      } finally {
        this.exporting = false;
      }
    },

    // ── Invoice import methods ──────────────────────────────────────────────
    openInvoiceImportModal() {
      this.showInvoiceImportModal = true;
      this.invoiceImportFile = null;
      this.invoiceImportPreview = null;
      this.invoiceImportLoading = false;
      this.invoiceImportApplying = false;
      this.invoiceImportError = '';
      this.invoiceImportResult = null;
    },

    resetInvoiceImport() {
      if (this.invoiceImportResult) {
        this.showInvoiceImportModal = false;
      } else {
        this.invoiceImportPreview = null;
        this.invoiceImportError = '';
      }
    },

    async exportInvoiceTemplate() {
      try { await API.exportInvoicesTemplate(); }
      catch (e) { alert(e.message || 'Export failed'); }
    },

    onInvoiceImportFileChange(e) {
      this.invoiceImportFile = e.target.files[0] || null;
      this.invoiceImportError = '';
    },

    async runInvoiceImportPreview() {
      if (!this.invoiceImportFile) return;
      this.invoiceImportLoading = true;
      this.invoiceImportError = '';
      try {
        this.invoiceImportPreview = await API.previewInvoicesImport(this.invoiceImportFile);
      } catch (e) {
        this.invoiceImportError = e.message || 'Preview failed';
      } finally {
        this.invoiceImportLoading = false;
      }
    },

    async applyInvoiceImport() {
      if (!this.invoiceImportPreview) return;
      this.invoiceImportApplying = true;
      this.invoiceImportError = '';
      try {
        this.invoiceImportResult = await API.applyInvoicesImport({ rows: this.invoiceImportPreview.rows });
      } catch (e) {
        this.invoiceImportError = e.message || 'Import failed';
      } finally {
        this.invoiceImportApplying = false;
      }
    },

    renderDashCharts() {
      if (typeof Chart === 'undefined') return;
      this.renderBudgetBarChart();
      this.renderInvoiceMonthlyChart();
      this.renderCumulativeSpendChart();
    },

    _invoiceStatuses() {
      // Cancelled and Rejected invoices are not counted in the Monthly /
      // Cumulative invoicing dashboards — they don't reflect committed spend.
      return [
        { key: 'DRAFT',     label: 'Draft',     color: '#6B7280' },
        { key: 'PENDING',   label: 'Pending',   color: '#F59E0B' },
        { key: 'APPROVED',  label: 'Approved',  color: '#10B981' },
      ];
    },

    _monthLabels(months) {
      return months.map(m => {
        const [y, mo] = m.split('-');
        const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return names[parseInt(mo) - 1] + ' ' + y;
      });
    },

    _fmtK(v) {
      if (!v) return '0';
      if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (Math.abs(v) >= 1000) return (v / 1000).toFixed(0) + 'K';
      return String(Math.round(v));
    },

    renderInvoiceMonthlyChart() {
      const canvas = this.$refs.invoiceMonthlyChart;
      if (this.invoiceMonthlyChartObj) { this.invoiceMonthlyChartObj.destroy(); this.invoiceMonthlyChartObj = null; }
      if (!canvas || this.monthlyInvoiceLabels.length === 0) return;

      const { months, byMonth } = this.monthlyInvoiceData;
      const statuses = this._invoiceStatuses();
      const fmtK = this._fmtK;
      const currency = this.projectCurrency;
      const fmtAmount = v => (v == null ? '0' : v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }));

      const barDatasets = statuses.map(s => ({
        label: s.label,
        data: months.map(m => byMonth[m][s.key] || 0),
        backgroundColor: s.color,
        stack: 'invoices',
      }));

      this.invoiceMonthlyChartObj = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: this._monthLabels(months),
          datasets: barDatasets,
        },
        options: {
          responsive: true,
          interaction: { mode: 'index', intersect: false, axis: 'x' },
          hover: { mode: 'index', intersect: false, axis: 'x' },
          plugins: {
            legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
            tooltip: {
              mode: 'index',
              intersect: false,
              position: 'nearest',
              padding: 10,
              callbacks: {
                label: ctx => {
                  const v = ctx.raw;
                  if (!v) return null;
                  return ctx.dataset.label + ': ' + fmtAmount(v) + ' ' + currency;
                },
                footer: items => {
                  const monthIdx = items[0] ? items[0].dataIndex : -1;
                  if (monthIdx < 0) return '';
                  const monthTotal = statuses.reduce((sum, s) => sum + (byMonth[months[monthIdx]][s.key] || 0), 0);
                  return 'Monthly total: ' + fmtAmount(monthTotal) + ' ' + currency;
                },
              },
            },
            datalabels: { display: false },
          },
          scales: {
            x: { stacked: true, ticks: { maxRotation: 45, font: { size: 11 } } },
            y: {
              stacked: true,
              beginAtZero: true,
              title: { display: true, text: 'Monthly Amount', font: { size: 11 } },
              ticks: { callback: v => fmtK(v) },
            },
          },
        },
      });
    },

    renderCumulativeSpendChart() {
      const canvas = this.$refs.cumulativeSpendChart;
      if (this.cumulativeSpendChartObj) { this.cumulativeSpendChartObj.destroy(); this.cumulativeSpendChartObj = null; }
      if (!canvas || this.monthlyInvoiceLabels.length === 0) return;

      const { months, byMonth } = this.monthlyInvoiceData;
      const statuses = this._invoiceStatuses();
      const fmtK = this._fmtK;
      const currency = this.projectCurrency;
      const fmtAmount = v => (v == null ? '0' : v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }));

      let cumulative = 0;
      const cumulativeData = months.map(m => {
        const total = statuses.reduce((sum, s) => sum + (byMonth[m][s.key] || 0), 0);
        cumulative += total;
        return cumulative;
      });

      this.cumulativeSpendChartObj = new Chart(canvas, {
        type: 'line',
        data: {
          labels: this._monthLabels(months),
          datasets: [{
            label: 'Cumulative Invoices',
            data: cumulativeData,
            borderColor: '#1B4F8C',
            backgroundColor: 'rgba(27,79,140,0.12)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2.5,
          }],
        },
        options: {
          responsive: true,
          interaction: { mode: 'index', intersect: false, axis: 'x' },
          hover: { mode: 'index', intersect: false, axis: 'x' },
          plugins: {
            legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
            tooltip: {
              mode: 'index',
              intersect: false,
              position: 'nearest',
              padding: 10,
              callbacks: {
                label: ctx => ctx.dataset.label + ': ' + fmtAmount(ctx.raw) + ' ' + currency,
              },
            },
            datalabels: { display: false },
          },
          scales: {
            x: { ticks: { maxRotation: 45, font: { size: 11 } } },
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Cumulative Invoices', font: { size: 11 } },
              ticks: { callback: v => fmtK(v) },
            },
          },
        },
      });
    },

    renderBudgetBarChart() {
      if (this.budgetBarChartObj) this.budgetBarChartObj.destroy();

      // When no package filter, show a single "Total" bar; otherwise per-package bars (up to 10)
      let chartRows;
      if (this.dashPkgFilter) {
        chartRows = this.dashOverview.slice(0, 10);
      } else {
        chartRows = [{
          tag_number: 'Total',
          forecast: this.dashTotals.forecast,
          committed: this.dashTotals.committed,
          spend: this.dashTotals.spend,
          pending_sc_cost: this.dashTotals.pending_sc_cost,
        }];
      }

      const fmtK = v => {
        if (!v) return '0';
        if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (Math.abs(v) >= 1000) return (v / 1000).toFixed(0) + 'K';
        return String(Math.round(v));
      };

      if (this.$refs.budgetBarChart && chartRows.length > 0) {
        // Build one horizontal bar per metric, in same order as the KPI cards
        const t = this.dashTotals;
        const src = this.dashPkgFilter ? chartRows[0] : t;
        const remDetail = this.remainingDetail(src);
        const barLabels = ['Baseline', 'Actual Budget', 'Bid Value', 'Committed', 'Remaining', 'Pending SC', 'Remaining incl. Pending SC', 'Spend'];
        const barValues = [
          src.baseline || 0,
          this.actualBudget(src),
          src.bid_value || 0,
          this.committedTotal(src),
          remDetail.value,
          src.pending_sc_cost || 0,
          this.remainingInclPending(src),
          src.spend || 0,
        ];
        const barColors = ['#1B4F8C', '#00AEEF', '#0EA5E9', '#F59E0B', '#059669', '#475569', '#7C3AED', '#10B981'];

        this.budgetBarChartObj = new Chart(this.$refs.budgetBarChart, {
          type: 'bar',
          plugins: [ChartDataLabels],
          data: {
            labels: barLabels,
            datasets: [{
              data: barValues,
              backgroundColor: barColors,
              borderRadius: 3,
            }],
          },
          options: {
            indexAxis: 'y',
            plugins: {
              legend: { display: false },
              datalabels: {
                anchor: 'end',
                align: 'end',
                color: '#374151',
                font: { size: 11, weight: '600' },
                formatter: v => v ? fmtK(v) : '0',
              },
            },
            scales: {
              x: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 10 }, callback: v => fmtK(v) } },
              y: { grid: { display: false }, ticks: { font: { size: 12, weight: '600' } } },
            },
            layout: { padding: { right: 40 } },
          },
        });
      }

    },

    async deleteInvoice(inv) {
      if (!confirm(`Delete invoice "${inv.invoice_number}"?`)) return;
      try {
        await API.deleteInvoice(inv.id);
        await this.loadAll();
      } catch (e) {
        alert(e.message);
      }
    },
  },
});
