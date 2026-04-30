// ─────────────────────────────────────────────────────────────────────────────
// Meeting Weekly Schedule Component — "typical week" view of recurring meetings
// ─────────────────────────────────────────────────────────────────────────────
app.component('meeting-weekly-schedule', {
  props: ['meetingTypes', 'contacts'],
  // Note: the `meetingTypes` prop is participant-filtered server-side. To give
  // every project contact (except BIDDER) full visibility on recurring meetings,
  // we fetch the unfiltered list from /api/meeting-types/all-recurring on mount.
  // `contacts` is needed to resolve participant_ids → names for the hover card.
  template: `
    <div>
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 class="text-lg font-semibold text-gray-800">Typical Week — Recurring Meetings</h3>
        <!-- Legend -->
        <div class="flex gap-4 text-xs flex-wrap">
          <span class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full inline-block bg-green-500"></span> Daily
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full inline-block bg-blue-500"></span> Weekly
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full inline-block bg-purple-500"></span> Every 2 weeks
          </span>
          <span class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full inline-block bg-amber-500"></span> Monthly
          </span>
        </div>
      </div>

      <div v-if="recurrentTypes.length === 0" class="card text-center py-12 text-gray-400">
        <svg class="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        No recurring meeting types defined yet.<br>
        <span class="text-sm">Enable recurrence in Meeting Types to see them here.</span>
      </div>

      <div v-else class="card overflow-visible p-0">
        <!-- Day header row -->
        <div class="grid grid-cols-7">
          <div v-for="(day, idx) in weekDays" :key="idx"
            :class="idx < 5 ? 'bg-gray-50' : 'bg-gray-100'"
            class="px-3 py-2.5 text-center border-r border-gray-200 last:border-r-0">
            <div class="text-xs font-bold text-gray-600 uppercase tracking-wide">{{ day.short }}</div>
            <div class="text-xs text-gray-400 font-normal">{{ day.full }}</div>
          </div>
        </div>

        <!-- Cells -->
        <div class="grid grid-cols-7 border-t border-gray-200" style="min-height:200px">
          <div v-for="(day, idx) in weekDays" :key="idx"
            :class="idx < 5 ? '' : 'bg-gray-50'"
            class="border-r border-gray-100 last:border-r-0 p-2 space-y-1.5 align-top">

            <!-- Cards for each meeting that falls on this day -->
            <template v-for="entry in entriesForDay(idx)" :key="entry.mt.id + '-' + entry.label">
              <div class="relative group">
                <div :class="cardClass(entry.mt.recurrence)"
                  class="rounded-lg px-2.5 py-2 text-xs leading-snug select-none cursor-default">
                  <div class="font-semibold truncate">{{ entry.mt.name }}</div>
                  <div v-if="entry.mt.recurrence_time" class="flex items-center gap-1 mt-0.5 opacity-80">
                    <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    {{ entry.mt.recurrence_time }}
                    <span v-if="entry.mt.duration" class="opacity-70">· {{ fmtDuration(entry.mt.duration) }}</span>
                  </div>
                  <div class="mt-0.5 opacity-60 text-[10px] font-medium">{{ entry.label }}</div>
                </div>

                <!-- Hover popover: default participants -->
                <div class="hidden group-hover:block absolute z-30 left-0 top-full mt-1 w-64 max-w-[260px]
                            bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-gray-700">
                  <div class="font-semibold text-gray-800 text-sm leading-snug">{{ entry.mt.name }}</div>
                  <div v-if="entry.mt.description" class="text-xs text-gray-500 mt-1">{{ entry.mt.description }}</div>
                  <div v-if="entry.mt.owning_package_tag" class="text-[11px] text-gray-400 mt-1">
                    Package: <span class="font-medium text-gray-500">{{ entry.mt.owning_package_tag }}</span>
                  </div>
                  <div class="mt-2 pt-2 border-t border-gray-100">
                    <div class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Default participants</div>
                    <ul v-if="participantNames(entry.mt).length" class="space-y-0.5 max-h-40 overflow-y-auto">
                      <li v-for="(p, i) in participantNames(entry.mt)" :key="i"
                          class="text-xs text-gray-700 flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0"></span>
                        <span class="truncate" :title="p">{{ p }}</span>
                      </li>
                    </ul>
                    <div v-else class="text-xs text-gray-400 italic">No default participants set.</div>
                  </div>
                </div>
              </div>
            </template>

          </div>
        </div>
      </div>

      <!-- Summary table below the grid -->
      <div v-if="recurrentTypes.length > 0" class="mt-4 card overflow-hidden p-0">
        <div class="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <h4 class="text-sm font-semibold text-gray-700">Recurring Meeting Summary</h4>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-xs text-gray-400 uppercase border-b border-gray-100">
              <th class="text-left px-4 py-2 font-semibold">Meeting Type</th>
              <th class="text-left px-4 py-2 font-semibold">Frequency</th>
              <th class="text-left px-4 py-2 font-semibold">Schedule</th>
              <th class="text-right px-4 py-2 font-semibold">Time</th>
              <th class="text-right px-4 py-2 font-semibold">Duration</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-for="mt in recurrentTypes" :key="mt.id" class="hover:bg-gray-50 transition-colors">
              <td class="px-4 py-2.5">
                <div class="flex items-center gap-2">
                  <span :class="dotClass(mt.recurrence)" class="w-2 h-2 rounded-full shrink-0"></span>
                  <span class="font-medium text-gray-800">{{ mt.name }}</span>
                </div>
                <p v-if="mt.description" class="text-xs text-gray-400 mt-0.5 ml-4">{{ mt.description }}</p>
              </td>
              <td class="px-4 py-2.5">
                <span :class="badgeClass(mt.recurrence)" class="px-2 py-0.5 rounded-full text-xs font-semibold">
                  {{ recurrenceLabel(mt.recurrence) }}
                </span>
              </td>
              <td class="px-4 py-2.5 text-gray-600 text-xs">
                <span v-if="mt.recurrence === 'MONTHLY'">
                  {{ positionLabel(mt.monthly_week_position) }} {{ dayName(mt.day_of_week) }}
                </span>
                <span v-else-if="effectiveDays(mt) && effectiveDays(mt).length">
                  {{ effectiveDays(mt).sort((a,b)=>a-b).map(d => dayShort(d)).join(', ') }}
                </span>
                <span v-else class="text-gray-300">—</span>
              </td>
              <td class="px-4 py-2.5 text-right text-gray-700 font-medium">{{ mt.recurrence_time || '—' }}</td>
              <td class="px-4 py-2.5 text-right text-gray-500">{{ mt.duration ? fmtDuration(mt.duration) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,

  data() {
    return {
      weekDays: [
        { short: 'Mon', full: 'Monday' },
        { short: 'Tue', full: 'Tuesday' },
        { short: 'Wed', full: 'Wednesday' },
        { short: 'Thu', full: 'Thursday' },
        { short: 'Fri', full: 'Friday' },
        { short: 'Sat', full: 'Saturday' },
        { short: 'Sun', full: 'Sunday' },
      ],
      allRecurringTypes: null,
    };
  },

  async mounted() {
    try {
      this.allRecurringTypes = await API.getAllRecurringMeetingTypes();
    } catch (e) {
      // If forbidden (e.g. BIDDER) or any error, fall back to the prop list.
      this.allRecurringTypes = null;
    }
  },

  computed: {
    recurrentTypes() {
      const source = this.allRecurringTypes !== null
        ? this.allRecurringTypes
        : (this.meetingTypes || []);
      return source.filter(mt => mt.is_recurrent);
    },
    contactById() {
      const m = {};
      for (const c of (this.contacts || [])) m[c.id] = c;
      return m;
    },
  },

  methods: {
    dayName(idx) { return this.weekDays[idx]?.full || '—'; },
    dayShort(idx) { return this.weekDays[idx]?.short || '—'; },

    // Resolve the meeting type's default participant_ids → display strings.
    // Falls back to "Contact #ID" if a contact isn't in the loaded list
    // (can happen for restricted users or stale caches).
    participantNames(mt) {
      const ids = mt && mt.participant_ids ? mt.participant_ids : [];
      const out = [];
      for (const cid of ids) {
        const c = this.contactById[cid];
        if (c) {
          const role = c.function || c.role || '';
          out.push(role ? `${c.name} — ${role}` : c.name);
        } else {
          out.push(`Contact #${cid}`);
        }
      }
      return out;
    },

    positionLabel(p) {
      return { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: 'Last' }[p] || `${p}th`;
    },

    recurrenceLabel(r) {
      return { DAILY: 'Daily', WEEKLY: 'Weekly', BIWEEKLY: 'Every 2 wks', MONTHLY: 'Monthly' }[r] || r || '';
    },

    fmtDuration(min) {
      if (!min) return '';
      if (min < 60) return `${min} min`;
      const h = Math.floor(min / 60), m = min % 60;
      return m ? `${h}h ${m}min` : `${h}h`;
    },

    // Resolve the effective day list for a meeting type
    effectiveDays(mt) {
      if (mt.recurrence === 'MONTHLY') return null; // handled separately
      // Use days_of_week if present and non-empty
      if (mt.days_of_week && mt.days_of_week.length > 0) return mt.days_of_week;
      // Legacy: single day_of_week field
      if (mt.day_of_week != null) return [mt.day_of_week];
      // DAILY fallback: all 7 days
      if (mt.recurrence === 'DAILY') return [0, 1, 2, 3, 4, 5, 6];
      return [];
    },

    // Returns entries for the given dayIndex (0=Mon…6=Sun)
    entriesForDay(dayIdx) {
      const entries = [];
      for (const mt of this.recurrentTypes) {
        if (mt.recurrence === 'MONTHLY') {
          if (mt.day_of_week === dayIdx) {
            entries.push({ mt, label: `${this.positionLabel(mt.monthly_week_position)} of month` });
          }
        } else {
          const days = this.effectiveDays(mt);
          if (days && days.includes(dayIdx)) {
            entries.push({ mt, label: mt.recurrence === 'BIWEEKLY' ? 'every 2 weeks' : '' });
          }
        }
      }
      // Sort by time
      entries.sort((a, b) => (a.mt.recurrence_time || '').localeCompare(b.mt.recurrence_time || ''));
      return entries;
    },

    cardClass(r) {
      return {
        DAILY:    'bg-green-50 border border-green-200 text-green-900',
        WEEKLY:   'bg-blue-50 border border-blue-200 text-blue-900',
        BIWEEKLY: 'bg-purple-50 border border-purple-200 text-purple-900',
        MONTHLY:  'bg-amber-50 border border-amber-200 text-amber-900',
      }[r] || 'bg-gray-50 border border-gray-200 text-gray-800';
    },

    badgeClass(r) {
      return {
        DAILY:    'bg-green-100 text-green-700',
        WEEKLY:   'bg-blue-100 text-blue-700',
        BIWEEKLY: 'bg-purple-100 text-purple-700',
        MONTHLY:  'bg-amber-100 text-amber-700',
      }[r] || 'bg-gray-100 text-gray-600';
    },

    dotClass(r) {
      return {
        DAILY:    'bg-green-500',
        WEEKLY:   'bg-blue-500',
        BIWEEKLY: 'bg-purple-500',
        MONTHLY:  'bg-amber-500',
      }[r] || 'bg-gray-400';
    },
  },
});
