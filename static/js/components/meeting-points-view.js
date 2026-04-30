// ─────────────────────────────────────────────────────────────────────────────
// Meeting Points Global View Component
// ─────────────────────────────────────────────────────────────────────────────
app.component('meeting-points-view', {
  props: ['contacts', 'meetings', 'initialResponsible', 'currentUser', 'pendingOpen'],
  template: `
    <div>
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-lg font-semibold text-gray-800">All Meeting Points</h3>
        <div class="flex gap-2">
          <button v-if="currentUser && currentUser.contact_id" @click="toggleMyPoints"
            :class="[isMyPointsActive
              ? 'bg-ips-blue text-white border-ips-blue hover:opacity-90'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors']">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            My Points
          </button>
          <button @click="exportExcel" :disabled="exporting" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            {{ exporting ? 'Exporting...' : 'Export Excel' }}
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="card mb-4">
        <div class="grid grid-cols-4 gap-4">
          <div>
            <label class="form-label">Type</label>
            <select v-model="filters.type" class="input-field">
              <option value="">All Types</option>
              <option value="ACTION">Action</option>
              <option value="DECISION">Decision</option>
              <option value="INFO">Information</option>
            </select>
          </div>
          <div>
            <label class="form-label">Status</label>
            <select v-model="filters.status" class="input-field">
              <option value="">All Statuses</option>
              <option value="NOT_STARTED">Not Started</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="URGENT">Urgent</option>
              <option value="DECLARED_DONE">Declared Done</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div>
            <label class="form-label">Responsible</label>
            <select v-model="filters.responsible" class="input-field">
              <option value="">All</option>
              <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Search</label>
            <input v-model="filters.search" type="text" class="input-field" placeholder="Search topics..."/>
          </div>
        </div>
        <div class="mt-3 flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" v-model="filters.overdueOnly" class="w-4 h-4" style="accent-color:#00AEEF"/>
            Overdue only
          </label>
          <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" v-model="filters.hideClosedStatus" class="w-4 h-4" style="accent-color:#00AEEF"/>
            Hide closed
          </label>
          <button @click="resetFilters" class="text-xs text-gray-400 hover:text-gray-600 ml-auto">Reset filters</button>
        </div>
      </div>

      <!-- Table -->
      <div class="card overflow-hidden p-0">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th class="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-8">#</th>
              <th class="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-8">T</th>
              <th class="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Topic</th>
              <th class="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Responsible</th>
              <th class="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Date</th>
              <th class="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Closed</th>
              <th class="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filtered.length === 0">
              <td colspan="8" class="px-4 py-8 text-center text-gray-400">No meeting points found</td>
            </tr>
            <tr v-for="(p, idx) in filtered" :key="p.id"
              class="border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer"
              :class="p.status === 'CLOSED' ? 'opacity-60' : ''"
              @click="openPoint(p)">
              <td class="px-3 py-3 text-gray-400 text-xs font-mono">MP-{{ String(p.seq_id || p.id).padStart(6,'0') }}</td>
              <td class="px-3 py-3">
                <span :class="typeClass(p.type)" class="type-badge">{{ p.type[0] }}</span>
              </td>
              <td class="px-3 py-3">
                <span class="font-medium text-gray-800" :class="p.status === 'CLOSED' ? 'line-through text-gray-400' : ''">{{ p.topic }}</span>
                <span v-if="p.notes && p.notes.length" class="ml-2 text-xs text-gray-400">({{ p.notes.length }} notes)</span>
              </td>
              <td class="px-3 py-3 text-gray-600">
                {{ p.responsible_name || '—' }}
                <span v-if="p.responsible_company" class="text-xs text-gray-400 block">{{ p.responsible_company }}</span>
              </td>
              <td class="px-3 py-3" :class="isOverdue(p) ? 'text-red-500 font-semibold' : 'text-gray-600'">
                {{ p.due_date ? formatDate(p.due_date) : '—' }}
              </td>
              <td class="px-3 py-3 text-gray-500 text-xs">
                {{ p.closed_at ? formatDate(p.closed_at.slice(0,10)) : '—' }}
              </td>
              <td class="px-3 py-3">
                <span :class="[statusBadgeClass(p.status), 'inline-block px-2 py-0.5 rounded text-xs font-medium']">
                  {{ statusLabel(p.status) }}
                </span>
              </td>
              <td class="px-3 py-3" @click.stop>
                <div class="flex items-center gap-1 justify-end">
                  <button @click="openPoint(p)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Open point">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                    </svg>
                  </button>
                  <!-- Owners: Close / Reopen -->
                  <template v-if="canFullEdit(p)">
                    <button v-if="p.status !== 'CLOSED'" @click="closePoint(p)"
                      class="btn-icon text-gray-400 hover:text-green-600" title="Close point">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                      </svg>
                    </button>
                    <button v-else @click="reopenPoint(p)"
                      class="btn-icon text-gray-400 hover:text-yellow-600" title="Reopen point">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                    </button>
                    <button @click="deletePoint(p)" class="btn-icon text-gray-300 hover:text-red-500" title="Delete">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </template>
                  <!-- Non-owners: Declare Done -->
                  <button v-else-if="canDeclareDone(p) && p.status !== 'DECLARED_DONE' && p.status !== 'CLOSED'"
                    @click="declareDone(p)" title="Declare done"
                    class="btn-icon text-gray-400 hover:text-purple-600">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-2 text-xs text-gray-400">{{ filtered.length }} points</div>

      <!-- ── Point Detail / Edit Modal ────────────────────────────────────── -->
      <div v-if="selectedPoint" class="modal-overlay" @click.self="closeDetail">
        <div class="modal-box modal-xl">
          <div class="modal-header">
            <div class="flex items-center gap-3 flex-wrap">
              <span :class="typeClass(selectedPoint.type)" class="type-badge">{{ selectedPoint.type[0] }}</span>
              <h3 class="text-base font-semibold text-gray-800">{{ selectedPoint.topic }}</h3>
              <span :class="statusClass(selectedPoint.status)" class="status-badge text-xs">{{ statusLabel(selectedPoint.status) }}</span>
            </div>
            <button @click="closeDetail" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body" style="padding:0;display:flex;overflow:hidden">
            <div class="flex-1 min-w-0 overflow-y-auto space-y-4" style="padding:20px 24px">

              <!-- Edit form -->
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="form-label">Type</label>
                  <select v-model="editForm.type" :disabled="!selectedCanFullEdit" class="input-field">
                    <option value="ACTION">Action</option>
                    <option value="DECISION">Decision</option>
                    <option value="INFO">Information</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Status</label>
                  <select v-model="editForm.status" :disabled="!selectedCanFullEdit" class="input-field">
                    <option value="NOT_STARTED">Not Started</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="ON_HOLD">On Hold</option>
                    <option value="URGENT">Urgent</option>
                    <option value="DECLARED_DONE">Declared Done</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </div>
                <div class="col-span-2">
                  <label class="form-label">Topic <span class="text-red-500">*</span></label>
                  <input v-model="editForm.topic" type="text" :disabled="!selectedCanFullEdit" class="input-field" placeholder="Brief description of the point…"/>
                </div>
                <div class="col-span-2">
                  <label class="form-label">Details</label>
                  <textarea v-model="editForm.details" :disabled="!selectedCanFullEdit" class="input-field" rows="3" placeholder="Detailed description…"></textarea>
                </div>
                <div>
                  <label class="form-label">Responsible</label>
                  <select v-model="editForm.responsible_id" :disabled="!selectedCanFullEdit" class="input-field">
                    <option :value="null">— Not assigned —</option>
                    <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}{{ c.company ? ' (' + c.company + ')' : '' }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Due Date</label>
                  <input v-model="editForm.due_date" type="date" :disabled="!selectedCanFullEdit" class="input-field"/>
                </div>
              </div>
              <p v-if="!selectedCanFullEdit" class="text-xs text-amber-600">
                You can read this point and add notes. Only owning-package contacts can edit fields. You can declare it done.
              </p>

              <p v-if="editError" class="text-red-500 text-sm">{{ editError }}</p>

              <!-- Closure date (read-only) -->
              <div v-if="selectedPoint.closed_at" class="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Closed on {{ formatDateTime(selectedPoint.closed_at) }}
              </div>

              <!-- Linked meetings -->
              <div v-if="selectedPoint.meeting_ids && selectedPoint.meeting_ids.length">
                <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Linked Meetings</p>
                <div class="flex flex-wrap gap-2">
                  <span v-for="mid in selectedPoint.meeting_ids" :key="mid"
                    class="px-2 py-1 rounded text-xs bg-blue-50 text-blue-700 font-medium">
                    {{ meetingTitle(mid) }}
                  </span>
                </div>
              </div>

              <!-- Notes -->
              <div class="border-t border-gray-100 pt-4">
                <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Notes ({{ selectedPoint.notes ? selectedPoint.notes.length : 0 }})
                </p>
                <div v-if="selectedPoint.notes && selectedPoint.notes.length" class="space-y-2 mb-3">
                  <div v-for="note in selectedPoint.notes" :key="note.id"
                    class="flex items-start gap-2 group p-3 bg-gray-50 rounded-lg">
                    <div class="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style="background:#00AEEF"></div>
                    <div class="flex-1">
                      <p class="text-sm text-gray-700 whitespace-pre-line">{{ note.content }}</p>
                      <p class="text-xs text-gray-400 mt-0.5">
                        {{ note.author_name || 'Unknown' }}<span v-if="note.meeting_title"> · {{ note.meeting_title }}</span> · {{ formatDateTime(note.created_at) }}
                      </p>
                    </div>
                    <button @click="deleteNoteFromDetail(note)" class="opacity-0 group-hover:opacity-100 btn-icon text-gray-300 hover:text-red-400">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="flex gap-2">
                  <input v-model="detailNoteContent" type="text" class="input-field text-sm py-1.5 flex-1"
                    placeholder="Add a note…" @keyup.enter="addNoteFromDetail"/>
                  <select v-model="detailNoteMeeting" class="input-field text-sm py-1.5 w-44">
                    <option :value="null">No meeting</option>
                    <option v-for="m in meetings" :key="m.id" :value="m.id">{{ m.title }}</option>
                  </select>
                  <button @click="addNoteFromDetail" class="btn-secondary text-xs px-3">Add</button>
                </div>
              </div>
            </div>
            <div class="w-[28rem] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
              <file-attachments record-type="meeting_point" :record-id="selectedPoint.id" :can-edit="selectedCanFullEdit"></file-attachments>
            </div>
          </div>

          <div class="modal-footer">
            <!-- Owning-package contacts: full Close / Reopen -->
            <template v-if="selectedCanFullEdit">
              <button v-if="selectedPoint.status !== 'CLOSED'" @click="closeFromDetail"
                class="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                Close Point
              </button>
              <button v-else @click="reopenFromDetail"
                class="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                Reopen
              </button>
            </template>
            <!-- Non-owners: Declare Done -->
            <button v-else-if="selectedCanDeclareDone && selectedPoint.status !== 'DECLARED_DONE' && selectedPoint.status !== 'CLOSED'"
              @click="declareDoneFromDetail"
              class="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Declare Done
            </button>
            <div class="flex-1"></div>
            <button @click="closeDetail" class="btn-secondary">{{ selectedCanFullEdit ? 'Cancel' : 'Close' }}</button>
            <button v-if="selectedCanFullEdit" @click="saveDetail" :disabled="savingDetail" class="btn-primary">
              {{ savingDetail ? 'Saving…' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,

  data() {
    return {
      points: [],
      selectedPoint: null,
      editForm: {},
      editError: '',
      savingDetail: false,
      exporting: false,
      detailNoteContent: '',
      detailNoteMeeting: null,
      filters: {
        type: '',
        status: '',
        responsible: '',
        search: '',
        overdueOnly: false,
        hideClosedStatus: true,
      },
    };
  },

  computed: {
    selectedCanFullEdit() {
      return !!(this.selectedPoint && this.selectedPoint._perms && this.selectedPoint._perms.can_full_edit);
    },
    selectedCanDeclareDone() {
      return !!(this.selectedPoint && this.selectedPoint._perms && this.selectedPoint._perms.can_declare_done);
    },

    isMyPointsActive() {
      const cid = this.currentUser && this.currentUser.contact_id;
      return !!cid
        && this.filters.responsible === cid
        && this.filters.hideClosedStatus === true;
    },

    filtered() {
      const today = new Date().toISOString().split('T')[0];
      return this.points.filter(p => {
        if (this.filters.type && p.type !== this.filters.type) return false;
        if (this.filters.status && p.status !== this.filters.status) return false;
        if (this.filters.responsible && p.responsible_id !== this.filters.responsible) return false;
        if (this.filters.hideClosedStatus && p.status === 'CLOSED') return false;
        if (this.filters.overdueOnly && (!p.due_date || p.due_date >= today || p.status === 'CLOSED')) return false;
        if (this.filters.search) {
          const s = this.filters.search.toLowerCase();
          if (!p.topic.toLowerCase().includes(s)) return false;
        }
        return true;
      });
    },
  },

  async mounted() {
    if (this.initialResponsible) {
      this.filters.responsible = this.initialResponsible;
    }
    await this.load();
    this._consumePendingOpen();
  },

  watch: {
    pendingOpen() { this._consumePendingOpen(); },
  },

  methods: {
    async load() {
      this.points = await API.getMeetingPoints();
      // Refresh selected point if open
      if (this.selectedPoint) {
        const fresh = this.points.find(p => p.id === this.selectedPoint.id);
        if (fresh) this.selectedPoint = fresh;
      }
    },

    _consumePendingOpen() {
      const po = this.pendingOpen;
      if (!po || po.record_type !== 'meeting_point') return;
      const target = this.points.find(p => p.id === po.record_id);
      if (target) this.openPoint(target);
    },

    toggleMyPoints() {
      if (this.isMyPointsActive) {
        this.filters.responsible = '';
      } else {
        this.filters.responsible = this.currentUser.contact_id;
        this.filters.hideClosedStatus = true;
      }
    },

    openPoint(p) {
      this.selectedPoint = { ...p };
      this.editForm = {
        type: p.type,
        status: p.status,
        topic: p.topic,
        details: p.details || '',
        responsible_id: p.responsible_id || null,
        due_date: p.due_date || '',
        updated_at: p.updated_at || null,
      };
      this.editError = '';
      this.savingDetail = false;
      this.detailNoteContent = '';
      this.detailNoteMeeting = null;
    },

    closeDetail() {
      this.selectedPoint = null;
    },

    async saveDetail() {
      if (!this.editForm.topic.trim()) { this.editError = 'Topic is required.'; return; }
      this.editError = '';
      this.savingDetail = true;
      try {
        await API.updateMeetingPoint(this.selectedPoint.id, {
          type: this.editForm.type,
          status: this.editForm.status,
          topic: this.editForm.topic.trim(),
          details: this.editForm.details || null,
          responsible_id: this.editForm.responsible_id || null,
          due_date: this.editForm.due_date || null,
          updated_at: this.editForm.updated_at || null,
        });
        await this.load();
        this.closeDetail();
      } catch (e) {
        this.editError = e.status === 409
          ? 'This point was modified by another user. Please close and reopen to get the latest version.'
          : e.message;
      } finally {
        this.savingDetail = false;
      }
    },

    meetingTitle(id) {
      const m = this.meetings && this.meetings.find(m => m.id === id);
      return m ? m.title : `Meeting #${id}`;
    },

    formatDate(d)      { return formatDate(d); },
    formatDateTime(dt) { return formatDateTime(dt); },

    isOverdue(p) {
      if (!p.due_date || p.status === 'CLOSED') return false;
      return p.due_date < new Date().toISOString().split('T')[0];
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

    statusSelectClass(s) {
      return { NOT_STARTED: 'bg-gray-50', IN_PROGRESS: 'bg-yellow-50', CLOSED: 'bg-green-50', ON_HOLD: 'bg-blue-50', URGENT: 'bg-red-50', DECLARED_DONE: 'bg-purple-50' }[s] || '';
    },

    statusBadgeClass(s) {
      return {
        NOT_STARTED: 'bg-gray-100 text-gray-700',
        IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
        ON_HOLD: 'bg-blue-100 text-blue-700',
        URGENT: 'bg-red-100 text-red-700',
        DECLARED_DONE: 'bg-purple-100 text-purple-700',
        CLOSED: 'bg-green-100 text-green-700',
      }[s] || 'bg-gray-100 text-gray-700';
    },

    canFullEdit(p) { return !!(p && p._perms && p._perms.can_full_edit); },
    canDeclareDone(p) { return !!(p && p._perms && p._perms.can_declare_done); },

    async declareDone(p) {
      try { await API.declareDonePoint(p.id); }
      catch (e) { alert(e.message || 'Failed to declare done.'); }
      await this.load();
    },

    async declareDoneFromDetail() {
      try { await API.declareDonePoint(this.selectedPoint.id); }
      catch (e) { alert(e.message || 'Failed to declare done.'); return; }
      await this.load();
      this.editForm.status = 'DECLARED_DONE';
    },

    resetFilters() {
      this.filters = { type: '', status: '', responsible: this.initialResponsible || '', search: '', overdueOnly: false, hideClosedStatus: true };
    },

    async updateStatus(p) {
      const updated = await API.updateMeetingPoint(p.id, { status: p.status });
      // If closed via dropdown, also set closed_at
      if (p.status === 'CLOSED' && !updated.closed_at) {
        await API.closePoint(p.id);
      }
      await this.load();
    },

    async closePoint(p) {
      await API.closePoint(p.id);
      await this.load();
    },

    async reopenPoint(p) {
      await API.reopenPoint(p.id);
      await this.load();
    },

    async closeFromDetail() {
      await API.closePoint(this.selectedPoint.id);
      await this.load();
      this.editForm.status = 'CLOSED';
    },

    async reopenFromDetail() {
      await API.reopenPoint(this.selectedPoint.id);
      await this.load();
      this.editForm.status = 'IN_PROGRESS';
    },

    async deletePoint(p) {
      if (!confirm(`Delete point "${p.topic}"?`)) return;
      await API.deleteMeetingPoint(p.id);
      if (this.selectedPoint && this.selectedPoint.id === p.id) this.selectedPoint = null;
      await this.load();
    },

    async addNoteFromDetail() {
      const content = this.detailNoteContent.trim();
      if (!content || !this.selectedPoint) return;
      await API.addNote(this.selectedPoint.id, { content, meeting_id: this.detailNoteMeeting });
      this.detailNoteContent = '';
      await this.load();
    },

    async deleteNoteFromDetail(note) {
      if (!confirm('Delete this note?')) return;
      await API.deleteNote(this.selectedPoint.id, note.id);
      await this.load();
    },

    async exportExcel() {
      this.exporting = true;
      try {
        const params = new URLSearchParams();
        if (this.filters.status)      params.set('status', this.filters.status);
        if (this.filters.type)        params.set('point_type', this.filters.type);
        if (this.filters.responsible) params.set('responsible_id', this.filters.responsible);
        const qs = params.toString() ? '?' + params.toString() : '';
        const date = new Date().toISOString().split('T')[0];
        await API.download(`/api/meeting-points/export/excel${qs}`, `meeting_points_${date}.xlsx`);
      } catch (e) {
        alert('Export failed: ' + e.message);
      } finally {
        this.exporting = false;
      }
    },
  },
});
