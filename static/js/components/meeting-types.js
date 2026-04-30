// ─────────────────────────────────────────────────────────────────────────────
// Meeting Types Component
// ─────────────────────────────────────────────────────────────────────────────
app.component('meeting-types-module', {
  props: ['contacts', 'currentUser'],
  template: `
    <div>
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-lg font-semibold text-gray-800">Meeting Types</h3>
        <button v-if="canManage" @click="openModal()" class="btn-primary">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          New Meeting Type
        </button>
      </div>

      <div class="card overflow-hidden p-0">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Owning Package</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Frequency</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Schedule</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Time</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Duration</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Participants</th>
              <th class="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="types.length === 0">
              <td colspan="8" class="px-4 py-10 text-center text-gray-400">No meeting types defined yet.</td>
            </tr>
            <tr v-for="mt in types" :key="mt.id"
              class="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
              @click="openModal(mt)">
              <td class="px-4 py-3">
                <div class="font-medium text-gray-800">{{ mt.name }}</div>
                <div v-if="mt.description" class="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{{ mt.description }}</div>
              </td>
              <td class="px-4 py-3 text-xs">
                <div v-if="mt.owning_package_tag" class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded text-xs font-bold text-white shrink-0" style="background:#1B4F8C">{{ mt.owning_package_tag }}</span>
                  <span v-if="mt.owning_package_name" class="text-gray-500 truncate">{{ mt.owning_package_name }}</span>
                </div>
                <span v-else class="text-amber-500" title="Required for permissions">⚠ unset</span>
              </td>
              <td class="px-4 py-3">
                <span v-if="mt.is_recurrent" :class="recurrenceBadge(mt.recurrence)"
                  class="px-2 py-0.5 rounded-full text-xs font-semibold">
                  {{ recurrenceLabel(mt.recurrence) }}
                </span>
                <span v-else class="text-gray-400 text-xs">—</span>
              </td>
              <td class="px-4 py-3 text-gray-600 text-xs">
                <span v-if="mt.recurrence === 'MONTHLY' && mt.monthly_week_position != null && mt.day_of_week != null">
                  {{ positionLabel(mt.monthly_week_position) }} {{ dayName(mt.day_of_week) }}
                </span>
                <span v-else-if="mt.days_of_week && mt.days_of_week.length">
                  {{ mt.days_of_week.map(d => dayShort(d)).join(', ') }}
                </span>
                <span v-else class="text-gray-400">—</span>
              </td>
              <td class="px-4 py-3 text-gray-600 text-xs">
                {{ mt.recurrence_time || '—' }}
              </td>
              <td class="px-4 py-3 text-gray-600 text-xs">
                {{ mt.duration ? fmtDuration(mt.duration) : '—' }}
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1"
                  :title="mt.participant_ids.map(id => contactName(id)).join('\\n')">
                  <span v-for="cid in mt.participant_ids.slice(0, 3)" :key="cid"
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-ips-dark font-medium">
                    {{ contactName(cid) }}
                  </span>
                  <span v-if="mt.participant_ids.length > 3"
                    :title="mt.participant_ids.slice(3).map(id => contactName(id)).join('\\n')"
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 font-medium cursor-help">
                    +{{ mt.participant_ids.length - 3 }} more
                  </span>
                  <span v-if="mt.participant_ids.length === 0" class="text-xs text-gray-400">—</span>
                </div>
              </td>
              <td class="px-4 py-3" @click.stop>
                <div class="flex gap-1 justify-end">
                  <template v-if="canManage">
                    <button @click="deleteType(mt)" class="btn-icon text-gray-400 hover:text-red-500">
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

      <!-- ══ Modal ══ -->
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-box" style="max-width:600px">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ editing ? 'Edit Meeting Type' : 'New Meeting Type' }}</h3>
            <button @click="showModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body space-y-4">

            <div>
              <label class="form-label">Owning Package <span class="text-red-500">*</span></label>
              <select v-model.number="form.owning_package_id" class="input-field">
                <option :value="null">— Select package —</option>
                <option v-for="pkg in selectablePackages" :key="pkg.id" :value="pkg.id">{{ pkg.tag_number }}{{ pkg.name ? ' — ' + pkg.name : '' }}</option>
              </select>
              <p class="text-xs text-gray-400 mt-1">
                Linked contacts of this package have full edit on meeting points of this type.
                Other participants can give notes and declare points done.
              </p>
            </div>

            <!-- Name + Description -->
            <div>
              <label class="form-label">Type Name <span class="text-red-500">*</span></label>
              <input v-model="form.name" type="text" class="input-field" placeholder="e.g. Weekly Progress Meeting"/>
            </div>
            <div>
              <label class="form-label">Description</label>
              <textarea v-model="form.description" class="input-field" rows="2" placeholder="Optional description…"></textarea>
            </div>

            <!-- Recurrence toggle -->
            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <div class="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer"
                @click="form.is_recurrent = !form.is_recurrent">
                <input type="checkbox" :checked="form.is_recurrent" class="w-4 h-4 text-ips-blue rounded" @click.stop="form.is_recurrent = !form.is_recurrent"/>
                <span class="font-medium text-sm text-gray-700">Recurring meeting</span>
              </div>

              <div v-if="form.is_recurrent" class="p-4 space-y-4 border-t border-gray-200">

                <!-- Frequency selector -->
                <div>
                  <label class="form-label">Frequency <span class="text-red-500">*</span></label>
                  <div class="flex gap-2 flex-wrap">
                    <button v-for="opt in recurrenceOptions" :key="opt.value"
                      @click="setRecurrence(opt.value)"
                      :class="form.recurrence === opt.value
                        ? 'bg-ips-blue text-white border-ips-blue'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-ips-blue hover:text-ips-blue'"
                      class="px-4 py-1.5 rounded-lg text-sm font-medium border transition-all">
                      {{ opt.label }}
                    </button>
                  </div>
                </div>

                <!-- Day selection — multi-checkbox for DAILY/WEEKLY/BIWEEKLY -->
                <div v-if="form.recurrence !== 'MONTHLY'">
                  <label class="form-label">Day(s) <span class="text-red-500">*</span></label>
                  <div class="flex gap-1.5 flex-wrap">
                    <button v-for="(d, i) in weekDaysFull" :key="i"
                      @click="toggleDay(i)"
                      :class="form.days_of_week.includes(i)
                        ? 'bg-ips-blue text-white border-ips-blue'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-ips-blue'"
                      class="w-10 h-10 rounded-lg text-xs font-semibold border transition-all text-center leading-none flex items-center justify-center">
                      {{ d.slice(0,2) }}
                    </button>
                  </div>
                  <p v-if="form.recurrence === 'DAILY'" class="text-xs text-gray-400 mt-1">Default: Mon–Fri. Adjust as needed.</p>
                </div>

                <!-- Monthly: position + day -->
                <div v-if="form.recurrence === 'MONTHLY'" class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="form-label">Week <span class="text-red-500">*</span></label>
                    <select v-model.number="form.monthly_week_position" class="input-field">
                      <option :value="1">1st</option>
                      <option :value="2">2nd</option>
                      <option :value="3">3rd</option>
                      <option :value="4">4th</option>
                      <option :value="5">Last</option>
                    </select>
                  </div>
                  <div>
                    <label class="form-label">Day <span class="text-red-500">*</span></label>
                    <select v-model.number="form.day_of_week" class="input-field">
                      <option v-for="(d, i) in weekDaysFull" :key="i" :value="i">{{ d }}</option>
                    </select>
                  </div>
                </div>

                <!-- Time + Duration (always shown when recurrent) -->
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="form-label">Start Time <span class="text-red-500">*</span></label>
                    <input v-model="form.recurrence_time" type="time" class="input-field"/>
                  </div>
                  <div>
                    <label class="form-label">Duration <span class="text-red-500">*</span></label>
                    <div class="flex gap-2">
                      <select v-model.number="form.duration" class="input-field flex-1">
                        <option :value="15">15 min</option>
                        <option :value="30">30 min</option>
                        <option :value="45">45 min</option>
                        <option :value="60">1 h</option>
                        <option :value="90">1 h 30</option>
                        <option :value="120">2 h</option>
                        <option :value="150">2 h 30</option>
                        <option :value="180">3 h</option>
                        <option :value="240">4 h</option>
                        <option :value="0">Custom…</option>
                      </select>
                      <input v-if="form.duration === 0 || !durationPresets.includes(form.duration)"
                        v-model.number="form.duration"
                        type="number" min="5" step="5"
                        class="input-field w-24" placeholder="min"/>
                    </div>
                  </div>
                </div>

              </div><!-- end recurrence panel -->
            </div>

            <!-- Default Participants -->
            <div>
              <label class="form-label">Default Participants</label>
              <div class="border border-gray-200 rounded-lg max-h-[32rem] overflow-y-auto">
                <label v-for="c in contacts" :key="c.id"
                  class="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                  <input type="checkbox" :value="c.id" v-model="form.participant_ids" class="w-4 h-4 text-ips-blue"/>
                  <div>
                    <span class="font-medium text-sm text-gray-700">{{ c.name }}</span>
                    <span v-if="c.company" class="text-xs text-gray-400 ml-2">{{ c.company }}</span>
                  </div>
                </label>
                <div v-if="contacts.length === 0" class="px-3 py-4 text-sm text-gray-400 text-center">
                  No contacts yet. Add contacts first.
                </div>
              </div>
            </div>

            <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showModal = false" class="btn-secondary">Cancel</button>
            <button @click="save" :disabled="saving" class="btn-primary">
              {{ saving ? 'Saving…' : (editing ? 'Save Changes' : 'Create') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,

  data() {
    return {
      types: [],
      packages: [],
      showModal: false,
      editing: null,
      form: this._emptyForm(),
      saving: false,
      error: '',
      weekDaysFull: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      recurrenceOptions: [
        { value: 'DAILY',    label: 'Daily' },
        { value: 'WEEKLY',   label: 'Weekly' },
        { value: 'BIWEEKLY', label: 'Every 2 weeks' },
        { value: 'MONTHLY',  label: 'Monthly' },
      ],
      durationPresets: [15, 30, 45, 60, 90, 120, 150, 180, 240],
    };
  },

  computed: {
    canManage() {
      // Everyone except BIDDER can create/edit meeting types.
      return this.currentUser && this.currentUser.role !== 'BIDDER';
    },

    selectablePackages() {
      // ADMIN/PROJECT_OWNER pick any package; everyone else can only pick a
      // package they are a linked contact of.
      const role = this.currentUser && this.currentUser.role;
      if (role === 'ADMIN' || role === 'PROJECT_OWNER') return this.packages;
      const cid = this.currentUser && this.currentUser.contact_id;
      if (!cid) return [];
      return (this.packages || []).filter(p => (p.contact_ids || []).includes(cid));
    },
  },

  async mounted() {
    await Promise.all([this.load(), this.loadPackages()]);
  },

  methods: {
    _emptyForm() {
      return {
        name: '', description: '',
        is_recurrent: true,
        recurrence: 'WEEKLY',
        days_of_week: [0, 1, 2, 3, 4],   // Mon–Fri default
        day_of_week: 0,
        monthly_week_position: 1,
        recurrence_time: '',
        duration: 60,
        owning_package_id: null,
        participant_ids: [],
        updated_at: null,
      };
    },

    async load() {
      this.types = await API.getMeetingTypes();
    },

    async loadPackages() {
      try { this.packages = await API.getPackages(); }
      catch { this.packages = []; }
    },

    contactName(id) {
      const c = this.contacts.find(c => c.id === id);
      return c ? c.name : `#${id}`;
    },

    dayName(idx) { return this.weekDaysFull[idx] || '—'; },
    dayShort(idx) { return (this.weekDaysFull[idx] || '').slice(0, 3); },

    positionLabel(p) {
      return { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: 'Last' }[p] || `${p}th`;
    },

    recurrenceLabel(r) {
      return { DAILY: 'Daily', WEEKLY: 'Weekly', BIWEEKLY: 'Every 2 weeks', MONTHLY: 'Monthly' }[r] || r || '';
    },

    recurrenceBadge(r) {
      return {
        DAILY:    'bg-green-100 text-green-700',
        WEEKLY:   'bg-blue-100 text-blue-700',
        BIWEEKLY: 'bg-purple-100 text-purple-700',
        MONTHLY:  'bg-amber-100 text-amber-700',
      }[r] || 'bg-gray-100 text-gray-600';
    },

    fmtDuration(min) {
      if (!min) return '';
      if (min < 60) return `${min} min`;
      const h = Math.floor(min / 60), m = min % 60;
      return m ? `${h}h ${m}min` : `${h}h`;
    },

    setRecurrence(val) {
      this.form.recurrence = val;
      if (val === 'DAILY' && !this.form.days_of_week.length) {
        this.form.days_of_week = [0, 1, 2, 3, 4];
      }
    },

    toggleDay(idx) {
      const pos = this.form.days_of_week.indexOf(idx);
      if (pos === -1) this.form.days_of_week.push(idx);
      else this.form.days_of_week.splice(pos, 1);
    },

    openModal(mt = null) {
      this.editing = mt;
      if (mt) {
        this.form = {
          name: mt.name,
          description: mt.description || '',
          is_recurrent: mt.is_recurrent || false,
          recurrence: mt.recurrence || 'WEEKLY',
          days_of_week: mt.days_of_week ? [...mt.days_of_week] : [0,1,2,3,4],
          day_of_week: mt.day_of_week != null ? mt.day_of_week : 0,
          monthly_week_position: mt.monthly_week_position != null ? mt.monthly_week_position : 1,
          recurrence_time: mt.recurrence_time || '',
          duration: mt.duration || 60,
          owning_package_id: mt.owning_package_id != null ? mt.owning_package_id : null,
          participant_ids: [...mt.participant_ids],
          updated_at: mt.updated_at || null,
        };
      } else {
        this.form = this._emptyForm();
      }
      this.error = '';
      this.showModal = true;
    },

    async save() {
      if (!this.form.name.trim()) { this.error = 'Name is required.'; return; }
      if (!this.form.owning_package_id) { this.error = 'Owning Package is required.'; return; }
      if (this.form.is_recurrent) {
        if (!this.form.recurrence) { this.error = 'Please select a frequency.'; return; }
        if (!this.form.recurrence_time) { this.error = 'Start time is required for recurring meetings.'; return; }
        if (!this.form.duration || this.form.duration <= 0) { this.error = 'Duration is required for recurring meetings.'; return; }
        if (this.form.recurrence !== 'MONTHLY' && this.form.days_of_week.length === 0) {
          this.error = 'Please select at least one day.'; return;
        }
      }
      this.saving = true;
      this.error = '';
      try {
        const payload = {
          name: this.form.name,
          description: this.form.description,
          is_recurrent: this.form.is_recurrent,
          recurrence: this.form.is_recurrent ? this.form.recurrence : null,
          days_of_week: (this.form.is_recurrent && this.form.recurrence !== 'MONTHLY')
            ? [...this.form.days_of_week].sort()
            : null,
          day_of_week: (this.form.is_recurrent && this.form.recurrence === 'MONTHLY')
            ? this.form.day_of_week : null,
          monthly_week_position: (this.form.is_recurrent && this.form.recurrence === 'MONTHLY')
            ? this.form.monthly_week_position : null,
          recurrence_time: this.form.is_recurrent ? this.form.recurrence_time : null,
          duration: this.form.is_recurrent ? this.form.duration : null,
          owning_package_id: this.form.owning_package_id,
          participant_ids: this.form.participant_ids,
          updated_at: this.form.updated_at || null,
        };
        if (this.editing) {
          await API.updateMeetingType(this.editing.id, payload);
        } else {
          await API.createMeetingType(payload);
        }
        await this.load();
        this.showModal = false;
      } catch (e) {
        this.error = e.status === 409
          ? 'This meeting type was modified by another user. Please close and reopen to get the latest version.'
          : (e.message || 'Save failed.');
      } finally {
        this.saving = false;
      }
    },

    async deleteType(mt) {
      if (!confirm(`Delete meeting type "${mt.name}"?`)) return;
      try {
        await API.deleteMeetingType(mt.id);
        await this.load();
      } catch (e) {
        alert(e.message);
      }
    },
  },
});
