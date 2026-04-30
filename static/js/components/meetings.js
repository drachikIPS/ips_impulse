// ─────────────────────────────────────────────────────────────────────────────
// Meetings Component
// ─────────────────────────────────────────────────────────────────────────────
app.component('meetings-module', {
  props: ['contacts', 'meetingTypes', 'currentUser'],
  emits: ['open-meeting'],
  template: `
    <div>
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-lg font-semibold text-gray-800">Meetings</h3>
        <div class="flex items-center gap-2">
          <button v-if="recurrentCreatableMeetingTypes.length > 0" @click="openBulkModal()" class="btn-secondary">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Generate Recurring
          </button>
          <button v-if="creatableMeetingTypes.length > 0" @click="openModal()" class="btn-primary">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            New Meeting
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="card mb-4">
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="form-label">Filter by Type</label>
            <select v-model="filterType" class="input-field">
              <option value="">All Types</option>
              <option v-for="mt in meetingTypes" :key="mt.id" :value="mt.id">{{ mt.name }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">Filter by Status</label>
            <select v-model="filterStatus" class="input-field">
              <option value="">All Statuses</option>
              <option value="PLANNED">Planned</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div>
            <label class="form-label">Search</label>
            <input v-model="search" type="text" class="input-field" placeholder="Search meetings…"/>
          </div>
        </div>
      </div>

      <!-- Table -->
      <div class="card overflow-hidden p-0">
        <table class="w-full">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Participants</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Points</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filtered.length === 0">
              <td colspan="7" class="px-4 py-8 text-center text-gray-400">No meetings found</td>
            </tr>
            <tr v-for="m in filtered" :key="m.id" class="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
              @click="$emit('open-meeting', m.id)">
              <td class="px-4 py-3 font-medium text-gray-800">{{ m.title }}</td>
              <td class="px-4 py-3 text-gray-600">
                <span v-if="m.date">{{ formatDate(m.date) }}</span>
                <span v-else class="text-gray-400">—</span>
                <span v-if="m.time" class="text-gray-400 text-xs ml-1">{{ m.time }}</span>
              </td>
              <td class="px-4 py-3 text-gray-600">{{ m.meeting_type_name || '—' }}</td>
              <td class="px-4 py-3">
                <span :class="statusClass(m.status)" class="status-badge">{{ statusLabel(m.status) }}</span>
              </td>
              <td class="px-4 py-3 text-gray-600">{{ m.participant_count }}</td>
              <td class="px-4 py-3 text-gray-600">{{ m.point_count }}</td>
              <td class="px-4 py-3">
                <div class="flex gap-2 justify-end" @click.stop>
                  <template v-if="canManage">
                    <button @click="openModal(m)" class="btn-icon text-gray-400 hover:text-ips-blue">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                    </button>
                    <button @click="deleteMeeting(m)" class="btn-icon text-gray-400 hover:text-red-500">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Modal -->
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-box modal-lg">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ editing ? 'Edit Meeting' : 'New Meeting' }}</h3>
            <button @click="showModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="form-label">Meeting Type <span class="text-red-500">*</span></label>
                <select v-model="form.meeting_type_id" @change="onTypeChange" class="input-field">
                  <option :value="null">— Select type —</option>
                  <option v-for="mt in creatableMeetingTypes" :key="mt.id" :value="mt.id">{{ mt.name }}</option>
                </select>
              </div>
              <div>
                <label class="form-label">Date</label>
                <input v-model="form.date" type="date" class="input-field" @change="onDateChange"/>
              </div>
              <div class="col-span-2">
                <label class="form-label">Meeting Title *</label>
                <input v-model="form.title" type="text" class="input-field" placeholder="e.g. Weekly Progress Meeting #12"
                  @input="titleAutoSet = false"/>
              </div>
              <div>
                <label class="form-label">Status</label>
                <select v-model="form.status" class="input-field">
                  <option value="PLANNED">Planned</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
              <div>
                <label class="form-label">Time</label>
                <input v-model="form.time" type="time" class="input-field"/>
              </div>
              <div class="col-span-2">
                <label class="form-label">Location</label>
                <input v-model="form.location" type="text" class="input-field" placeholder="Room / Online link…"/>
              </div>
              <div class="col-span-2">
                <label class="form-label">Notes</label>
                <textarea v-model="form.notes" class="input-field" rows="2" placeholder="General meeting notes…"></textarea>
              </div>
              <div class="col-span-2">
                <label class="form-label">Participants</label>
                <div class="border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                  <label v-for="c in contacts" :key="c.id"
                    class="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                    <input type="checkbox" :value="c.id" v-model="form.participant_ids" class="w-4 h-4 text-ips-blue"/>
                    <div>
                      <span class="font-medium text-sm text-gray-700">{{ c.name }}</span>
                      <span v-if="c.company" class="text-xs text-gray-400 ml-2">{{ c.company }}</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
            <p v-if="error" class="text-red-500 text-sm mt-3">{{ error }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showModal = false" class="btn-secondary">Cancel</button>
            <button @click="save" :disabled="saving" class="btn-primary">
              {{ saving ? 'Saving…' : (editing ? 'Save Changes' : 'Create Meeting') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Bulk-recurring modal -->
      <div v-if="showBulkModal" class="modal-overlay" @click.self="showBulkModal = false">
        <div class="modal-box">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">Generate Recurring Meetings</h3>
            <button @click="showBulkModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body space-y-4">
            <div>
              <label class="form-label">Meeting Type <span class="text-red-500">*</span></label>
              <select v-model="bulkForm.meeting_type_id" @change="refreshBulkPreview" class="input-field">
                <option :value="null">— Select recurrent type —</option>
                <option v-for="mt in recurrentCreatableMeetingTypes" :key="mt.id" :value="mt.id">
                  {{ mt.name }} ({{ recurrenceLabel(mt.recurrence) }})
                </option>
              </select>
              <p v-if="selectedBulkType" class="text-xs text-gray-500 mt-1">
                {{ recurrenceSummary(selectedBulkType) }}
              </p>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="form-label">Start Date <span class="text-red-500">*</span></label>
                <input v-model="bulkForm.start_date" type="date" class="input-field" @change="refreshBulkPreview"/>
              </div>
              <div>
                <label class="form-label">Finish Date <span class="text-red-500">*</span></label>
                <input v-model="bulkForm.finish_date" type="date" class="input-field" @change="refreshBulkPreview"/>
              </div>
            </div>
            <div class="rounded-lg p-4"
              :class="bulkPreviewCount > 0 ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-200'">
              <div v-if="bulkPreviewLoading" class="text-sm text-gray-500">Calculating…</div>
              <div v-else-if="bulkPreviewError" class="text-sm text-red-600">{{ bulkPreviewError }}</div>
              <div v-else-if="!bulkForm.meeting_type_id || !bulkForm.start_date || !bulkForm.finish_date"
                class="text-sm text-gray-500">
                Select a recurrent meeting type and a date range to see how many meetings will be created.
              </div>
              <div v-else>
                <div class="text-sm text-gray-700">
                  <span class="font-semibold text-blue-700">{{ bulkPreviewCount }}</span>
                  meeting{{ bulkPreviewCount === 1 ? '' : 's' }} will be created.
                </div>
                <div v-if="bulkPreviewDates.length > 0" class="mt-2 max-h-40 overflow-y-auto text-xs text-gray-600">
                  <span v-for="(d, i) in bulkPreviewDates" :key="d"
                    class="inline-block bg-white border border-gray-200 rounded px-2 py-0.5 mr-1 mb-1">
                    {{ formatDate(d) }}
                  </span>
                </div>
                <p class="text-xs text-gray-500 mt-2">
                  Status will be <strong>Planned</strong>; titles default to <code>YYYYMMDD_{{ selectedBulkType ? selectedBulkType.name : 'type' }}</code>; participants copied from the meeting type.
                </p>
              </div>
            </div>
            <p v-if="bulkError" class="text-red-500 text-sm">{{ bulkError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showBulkModal = false" class="btn-secondary">Cancel</button>
            <button @click="confirmBulk" :disabled="bulkSaving || bulkPreviewCount === 0 || bulkPreviewLoading"
              class="btn-primary">
              {{ bulkSaving ? 'Creating…' : ('Create ' + (bulkPreviewCount || 0) + ' Meeting' + (bulkPreviewCount === 1 ? '' : 's')) }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,

  data() {
    return {
      meetings: [],
      filterType: '',
      filterStatus: '',
      search: '',
      showModal: false,
      editing: null,
      form: this.emptyForm(),
      saving: false,
      error: '',
      titleAutoSet: false,
      // Bulk-recurring modal
      showBulkModal: false,
      bulkForm: { meeting_type_id: null, start_date: '', finish_date: '' },
      bulkPreviewCount: 0,
      bulkPreviewDates: [],
      bulkPreviewLoading: false,
      bulkPreviewError: '',
      bulkPreviewToken: 0,
      bulkSaving: false,
      bulkError: '',
      weekDayShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    };
  },

  computed: {
    canManage() {
      return this.currentUser && ['ADMIN', 'PROJECT_OWNER', 'PROJECT_TEAM'].includes(this.currentUser.role);
    },

    creatableMeetingTypes() {
      // Per the meeting permission rule, a non-admin/owner user can only create
      // meetings of types where they are BOTH a contact of the owning package
      // AND a default participant. ADMIN and PROJECT_OWNER can create any type.
      const types = this.meetingTypes || [];
      const role = this.currentUser && this.currentUser.role;
      if (role === 'ADMIN' || role === 'PROJECT_OWNER') return types;
      const cid = this.currentUser && this.currentUser.contact_id;
      if (!cid) return [];
      return types.filter(mt =>
        (mt.owning_package_contact_ids || []).includes(cid)
        && (mt.participant_ids || []).includes(cid)
      );
    },

    recurrentCreatableMeetingTypes() {
      return this.creatableMeetingTypes.filter(mt => mt.is_recurrent);
    },

    selectedBulkType() {
      return this.recurrentCreatableMeetingTypes.find(mt => mt.id === this.bulkForm.meeting_type_id) || null;
    },

    filtered() {
      let list = this.meetings;
      if (this.filterType) list = list.filter(m => m.meeting_type_id == this.filterType);
      if (this.filterStatus) list = list.filter(m => m.status === this.filterStatus);
      if (this.search) {
        const s = this.search.toLowerCase();
        list = list.filter(m => m.title.toLowerCase().includes(s));
      }
      return list;
    },
  },

  async mounted() {
    await this.load();
  },

  methods: {
    emptyForm() {
      const today = new Date().toISOString().slice(0, 10);
      return { title: '', date: today, time: '', location: '', meeting_type_id: null, status: 'PLANNED', notes: '', participant_ids: [] };
    },

    async load() {
      this.meetings = await API.getMeetings();
    },

    formatDate(d) { return formatDate(d); },

    statusClass(s) {
      const map = { PLANNED: 'badge-blue', COMPLETED: 'badge-green', CANCELLED: 'badge-gray' };
      return map[s] || 'badge-gray';
    },

    statusLabel(s) {
      const map = { PLANNED: 'Planned', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
      return map[s] || s;
    },

    generateTitle() {
      if (!this.form.meeting_type_id || !this.form.date) return;
      const mt = this.meetingTypes.find(t => t.id === this.form.meeting_type_id);
      if (!mt) return;
      const datePart = this.form.date.replace(/-/g, '');
      this.form.title = `${datePart}_${mt.name}`;
      this.titleAutoSet = true;
    },

    onTypeChange() {
      if (this.form.meeting_type_id) {
        const mt = this.meetingTypes.find(t => t.id === this.form.meeting_type_id);
        if (mt && mt.participant_ids.length > 0) {
          this.form.participant_ids = [...mt.participant_ids];
        }
        if (this.titleAutoSet || !this.form.title.trim()) {
          this.generateTitle();
        }
      }
    },

    onDateChange() {
      if (this.titleAutoSet) {
        this.generateTitle();
      }
    },

    openModal(m = null) {
      this.editing = m;
      this.titleAutoSet = false;
      this.form = m
        ? { title: m.title, date: m.date || '', time: m.time || '', location: m.location || '', meeting_type_id: m.meeting_type_id, status: m.status, notes: m.notes || '', participant_ids: [...(m.participant_ids || [])], updated_at: m.updated_at || null }
        : this.emptyForm();
      this.error = '';
      this.showModal = true;
    },

    async save() {
      if (!this.form.title.trim()) { this.error = 'Title is required.'; return; }
      if (!this.form.meeting_type_id) { this.error = 'Meeting type is required.'; return; }
      this.saving = true;
      this.error = '';
      try {
        if (this.editing) {
          await API.updateMeeting(this.editing.id, this.form);
        } else {
          await API.createMeeting(this.form);
        }
        await this.load();
        this.showModal = false;
      } catch (e) {
        this.error = e.status === 409
          ? 'This meeting was modified by another user. Please close and reopen to get the latest version.'
          : e.message;
      } finally {
        this.saving = false;
      }
    },

    async deleteMeeting(m) {
      if (!confirm(`Delete meeting "${m.title}"?`)) return;
      try {
        await API.deleteMeeting(m.id);
        await this.load();
      } catch (e) {
        alert(e.message);
      }
    },

    // ── Bulk-recurring generation ──────────────────────────────────────────
    recurrenceLabel(r) {
      return { DAILY: 'Daily', WEEKLY: 'Weekly', BIWEEKLY: 'Every 2 weeks', MONTHLY: 'Monthly' }[r] || r || '';
    },

    recurrenceSummary(mt) {
      if (!mt) return '';
      if (mt.recurrence === 'MONTHLY') {
        const pos = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: 'Last' }[mt.monthly_week_position] || `${mt.monthly_week_position}th`;
        const day = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][mt.day_of_week] || '';
        return `Monthly · ${pos} ${day}${mt.recurrence_time ? ' at ' + mt.recurrence_time : ''}`;
      }
      const days = (mt.days_of_week || []).map(d => this.weekDayShort[d]).join(', ');
      return `${this.recurrenceLabel(mt.recurrence)} · ${days || '—'}${mt.recurrence_time ? ' at ' + mt.recurrence_time : ''}`;
    },

    openBulkModal() {
      const today = new Date();
      const inThreeMonths = new Date();
      inThreeMonths.setMonth(today.getMonth() + 3);
      const fmt = d => d.toISOString().slice(0, 10);
      this.bulkForm = {
        meeting_type_id: this.recurrentCreatableMeetingTypes.length === 1 ? this.recurrentCreatableMeetingTypes[0].id : null,
        start_date: fmt(today),
        finish_date: fmt(inThreeMonths),
      };
      this.bulkPreviewCount = 0;
      this.bulkPreviewDates = [];
      this.bulkPreviewError = '';
      this.bulkError = '';
      this.showBulkModal = true;
      if (this.bulkForm.meeting_type_id) this.refreshBulkPreview();
    },

    async refreshBulkPreview() {
      this.bulkError = '';
      this.bulkPreviewError = '';
      if (!this.bulkForm.meeting_type_id || !this.bulkForm.start_date || !this.bulkForm.finish_date) {
        this.bulkPreviewCount = 0;
        this.bulkPreviewDates = [];
        return;
      }
      if (this.bulkForm.start_date > this.bulkForm.finish_date) {
        this.bulkPreviewError = 'Start date must be on or before finish date.';
        this.bulkPreviewCount = 0;
        this.bulkPreviewDates = [];
        return;
      }
      const token = ++this.bulkPreviewToken;
      this.bulkPreviewLoading = true;
      try {
        const res = await API.bulkCreateRecurringMeetings({
          meeting_type_id: this.bulkForm.meeting_type_id,
          start_date: this.bulkForm.start_date,
          finish_date: this.bulkForm.finish_date,
          dry_run: true,
        });
        if (token !== this.bulkPreviewToken) return;
        this.bulkPreviewCount = res.count || 0;
        this.bulkPreviewDates = res.dates || [];
      } catch (e) {
        if (token !== this.bulkPreviewToken) return;
        this.bulkPreviewError = e.message || 'Preview failed';
        this.bulkPreviewCount = 0;
        this.bulkPreviewDates = [];
      } finally {
        if (token === this.bulkPreviewToken) this.bulkPreviewLoading = false;
      }
    },

    async confirmBulk() {
      if (!this.bulkForm.meeting_type_id) { this.bulkError = 'Meeting type is required.'; return; }
      if (!this.bulkForm.start_date || !this.bulkForm.finish_date) { this.bulkError = 'Start and finish date are required.'; return; }
      if (this.bulkPreviewCount === 0) { this.bulkError = 'Nothing to create for the selected range.'; return; }
      if (!confirm(`Create ${this.bulkPreviewCount} meeting${this.bulkPreviewCount === 1 ? '' : 's'}?`)) return;
      this.bulkSaving = true;
      this.bulkError = '';
      try {
        const res = await API.bulkCreateRecurringMeetings({
          meeting_type_id: this.bulkForm.meeting_type_id,
          start_date: this.bulkForm.start_date,
          finish_date: this.bulkForm.finish_date,
          dry_run: false,
        });
        await this.load();
        this.showBulkModal = false;
        alert(`${res.count} meeting${res.count === 1 ? '' : 's'} created.`);
      } catch (e) {
        this.bulkError = e.message || 'Failed to create meetings.';
      } finally {
        this.bulkSaving = false;
      }
    },
  },
});
