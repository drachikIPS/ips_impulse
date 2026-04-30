// ─────────────────────────────────────────────────────────────────────────────
// Project Closure — two components:
//   <close-project-modal>     — overlay form, opened from the project pill
//                                (admin / PROJECT_OWNER); covers Lessons Learned
//                                12-area form, customer feedback letters, then
//                                a final user-removal step.
//   <lessons-learned-portal>  — full-page view rendered on the project picker
//                                screen via a "Lessons Learned Portal" button.
// ─────────────────────────────────────────────────────────────────────────────

const LESSON_AREAS = [
  { key: 'project_organization',   label: 'Project Organization' },
  { key: 'scope_clarity',          label: 'Scope clarity' },
  { key: 'schedule',               label: 'Schedule' },
  { key: 'budget_management',      label: 'Budget management' },
  { key: 'communication_customer', label: 'Communication with customer' },
  { key: 'internal_communication', label: 'Internal communication' },
  { key: 'engineering_quality',    label: 'Engineering quality' },
  { key: 'procurement_contractors',label: 'Procurement / Contractors' },
  { key: 'package_management',     label: 'Package Management' },
  { key: 'construction_execution', label: 'Construction / Site execution' },
  { key: 'hse_safety',             label: 'HSE / Safety' },
  { key: 'document_management',    label: 'Document management / handover' },
];

function _scoreBadgeClass(s) {
  if (s === 'GOOD') return 'bg-emerald-100 text-emerald-700';
  if (s === 'ACCEPTABLE') return 'bg-amber-100 text-amber-700';
  if (s === 'BAD') return 'bg-red-100 text-red-700';
  if (s === 'NA') return 'bg-gray-100 text-gray-500';
  return 'bg-gray-100 text-gray-400';
}

function _resultLabel(r) {
  return ({ SUCCESS: 'Success', PARTIAL_SUCCESS: 'Partial success', UNSUCCESSFUL: 'Unsuccessful' })[r] || '—';
}

function _resultBadgeClass(r) {
  if (r === 'SUCCESS') return 'bg-emerald-100 text-emerald-700';
  if (r === 'PARTIAL_SUCCESS') return 'bg-amber-100 text-amber-700';
  if (r === 'UNSUCCESSFUL') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-600';
}

// ── Close Project Modal ─────────────────────────────────────────────────────

app.component('close-project-modal', {
  props: ['currentUser', 'project'],
  emits: ['closed', 'cancel'],
  template: `
<div class="modal-overlay" @click.self="cancel">
  <div class="modal-box" style="max-width:1080px;width:96vw;max-height:92vh;overflow:hidden;display:flex;flex-direction:column">
    <div class="modal-header">
      <h3 class="text-lg font-semibold text-gray-800">
        <template v-if="step === 'form'">Close Project — {{ project && project.project_number }}</template>
        <template v-else-if="step === 'cleanup'">Clean up users tied only to this project</template>
        <template v-else>Project closed ✓</template>
      </h3>
      <button @click="cancel" class="text-gray-400 hover:text-gray-600">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- ─── Step 1: closure form ─── -->
    <div v-if="step === 'form'" class="modal-body" style="overflow-y:auto;flex:1">
      <div class="card mb-4" style="background:#F0F9FF;border-left:4px solid #00AEEF">
        <p class="text-sm text-gray-700">Score each of the 12 areas. A <strong>BAD</strong> score requires a comment. The overall result is computed automatically from the scores. You can also attach customer feedback letter(s) below.</p>
        <div class="text-xs mt-2 text-gray-500">Computed overall result: <span :class="resultBadgeClass(computedResult)" class="px-2 py-0.5 rounded text-xs font-semibold">{{ resultLabel(computedResult) }}</span></div>
      </div>

      <!-- 12-area form -->
      <div class="card overflow-hidden p-0 mb-4">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th class="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Area</th>
              <th class="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">Score</th>
              <th class="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Comment</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in areas" :key="a.key" class="border-b border-gray-100 last:border-0">
              <td class="px-4 py-3 font-medium text-gray-800 align-top">{{ a.label }}</td>
              <td class="px-4 py-3 align-top">
                <select v-model="form.scores[a.key].score" class="input-field text-sm">
                  <option value="">— pick —</option>
                  <option value="GOOD">Good</option>
                  <option value="ACCEPTABLE">Acceptable</option>
                  <option value="BAD">Bad</option>
                  <option value="NA">N / A</option>
                </select>
              </td>
              <td class="px-4 py-3 align-top">
                <textarea v-model="form.scores[a.key].comment" rows="2"
                  :placeholder="form.scores[a.key].score === 'BAD' ? 'Required — explain what went wrong and what to improve' : 'Optional comment'"
                  :class="['input-field text-sm', form.scores[a.key].score === 'BAD' && !form.scores[a.key].comment.trim() ? 'border-red-400' : '']"></textarea>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Closure metadata -->
      <div class="card mb-4">
        <h4 class="font-semibold text-gray-700 mb-3">Closure metadata</h4>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">Closure date *</label>
            <input v-model="form.closure_date" type="date" class="input-field"/>
          </div>
          <div></div>
          <div class="col-span-2">
            <label class="form-label">Closure summary <span class="text-gray-400">(optional)</span></label>
            <textarea v-model="form.lessons_summary" rows="3" class="input-field"
              placeholder="Optional overall narrative."></textarea>
          </div>
        </div>
      </div>

      <!-- Customer Feedback letters -->
      <div class="card mb-4">
        <h4 class="font-semibold text-gray-700 mb-3">Customer Feedback Letters <span class="text-xs text-gray-400 font-normal">— stored in /uploads/Customer Feedbacks/</span></h4>
        <ul v-if="pendingLetters.length > 0" class="divide-y divide-gray-100 mb-3">
          <li v-for="(l, idx) in pendingLetters" :key="idx" class="py-2 flex items-center gap-2 flex-wrap">
            <span :class="l.polarity === 'POSITIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'"
              class="px-2 py-0.5 rounded text-xs font-semibold">
              {{ l.polarity === 'POSITIVE' ? '+ Positive' : '− Negative' }}
            </span>
            <span class="text-sm text-gray-700">{{ l.file.name }}</span>
            <span class="text-xs text-gray-500">{{ l.received_date }}</span>
            <span v-if="l.notes" class="text-xs text-gray-400 italic flex-1 truncate">{{ l.notes }}</span>
            <button @click="pendingLetters.splice(idx, 1)" class="text-xs text-red-500 hover:text-red-600 ml-auto">Remove</button>
          </li>
        </ul>
        <div class="flex items-center gap-2 flex-wrap">
          <select v-model="newLetter.polarity" class="input-field text-sm" style="width:auto">
            <option value="POSITIVE">+ Positive</option>
            <option value="NEGATIVE">− Negative</option>
          </select>
          <input v-model="newLetter.received_date" type="date" class="input-field text-sm" style="width:auto"/>
          <input v-model="newLetter.notes" type="text" placeholder="Notes (optional)" class="input-field text-sm flex-1 min-w-[200px]"/>
          <input ref="letterFile" type="file" class="input-field text-sm" style="width:auto" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"/>
          <button @click="addLetter" class="btn-secondary text-sm">+ Add</button>
        </div>
      </div>

      <p v-if="error" class="text-red-500 text-sm mb-2">{{ error }}</p>
    </div>

    <div v-if="step === 'form'" class="modal-footer">
      <button @click="cancel" class="btn-secondary">Cancel</button>
      <button @click="submitClose" :disabled="saving" class="btn-primary"
        style="background:#DC2626;border-color:#DC2626">
        {{ saving ? 'Closing project…' : 'Close Project' }}
      </button>
    </div>

    <!-- ─── Step 2: user cleanup ─── -->
    <div v-if="step === 'cleanup'" class="modal-body" style="overflow-y:auto;flex:1">
      <div class="card mb-4" style="background:#FEF3C7;border-left:4px solid #D97706">
        <p class="text-sm text-amber-800"><strong>Project closed.</strong> The users below were active <em>only</em> on this project — no other active project links. Select the ones you want to remove from the platform entirely. Skipping this step is fine; you can always remove users later from User Management.</p>
      </div>
      <div v-if="candidatesLoading" class="text-center py-8 text-gray-400">Loading candidates…</div>
      <div v-else-if="candidates.length === 0" class="text-center py-8 text-gray-400 italic">
        No users are linked only to this project. Nothing to clean up.
      </div>
      <div v-else class="card overflow-hidden p-0">
        <div class="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
          <input type="checkbox"
            :checked="selectedRemovalIds.length === candidates.length && candidates.length > 0"
            @change="toggleSelectAllRemoval"
            class="w-4 h-4 cursor-pointer" style="accent-color:#00AEEF"/>
          <span class="text-xs text-gray-600">Select all ({{ selectedRemovalIds.length }} of {{ candidates.length }} selected)</span>
        </div>
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-white border-b border-gray-200">
              <th class="px-3 py-2 w-10"></th>
              <th class="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th class="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
              <th class="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last login</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in candidates" :key="u.id" class="border-b border-gray-100 hover:bg-gray-50">
              <td class="px-3 py-2.5">
                <input type="checkbox" :value="u.id" v-model="selectedRemovalIds"
                  class="w-4 h-4 cursor-pointer" style="accent-color:#00AEEF"/>
              </td>
              <td class="px-4 py-2.5 font-medium text-gray-800">{{ u.name }}</td>
              <td class="px-4 py-2.5 text-gray-600">{{ u.email }}</td>
              <td class="px-4 py-2.5 text-xs text-gray-500">{{ u.last_login_at ? fmtDate(u.last_login_at) : 'never' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="cleanupError" class="text-red-500 text-sm mt-3">{{ cleanupError }}</p>
    </div>
    <div v-if="step === 'cleanup'" class="modal-footer">
      <button @click="finish" class="btn-secondary">Skip — done</button>
      <button v-if="candidates.length > 0" @click="removeSelected" :disabled="selectedRemovalIds.length === 0 || cleanupSaving"
        class="btn-primary" style="background:#DC2626;border-color:#DC2626">
        {{ cleanupSaving ? 'Removing…' : 'Remove ' + selectedRemovalIds.length + ' user' + (selectedRemovalIds.length === 1 ? '' : 's') }}
      </button>
    </div>
  </div>
</div>
  `,

  data() {
    return {
      step: 'form',
      areas: LESSON_AREAS,
      form: this.makeEmptyForm(),
      saving: false,
      error: '',
      // Customer feedback queue (uploaded after the close call succeeds)
      pendingLetters: [],
      newLetter: { polarity: 'POSITIVE', received_date: new Date().toISOString().slice(0,10), notes: '' },
      // Cleanup step
      candidates: [],
      candidatesLoading: false,
      selectedRemovalIds: [],
      cleanupSaving: false,
      cleanupError: '',
    };
  },

  computed: {
    computedResult() {
      const counted = LESSON_AREAS
        .map(a => this.form.scores[a.key].score)
        .filter(s => s === 'GOOD' || s === 'ACCEPTABLE' || s === 'BAD');
      const n = counted.length || 1;
      const good = counted.filter(s => s === 'GOOD').length;
      const bad = counted.filter(s => s === 'BAD').length;
      if (bad >= 2 || (good + (n - good - bad)) < n / 2) return 'UNSUCCESSFUL';
      if (good / n >= 0.7 && bad === 0) return 'SUCCESS';
      return 'PARTIAL_SUCCESS';
    },
  },

  methods: {
    makeEmptyForm() {
      const scores = {};
      LESSON_AREAS.forEach(a => { scores[a.key] = { score: '', comment: '' }; });
      return {
        closure_date: new Date().toISOString().slice(0, 10),
        lessons_summary: '',
        scores,
      };
    },

    resultLabel: _resultLabel,
    resultBadgeClass: _resultBadgeClass,

    cancel() {
      // Soft cancel — only at the form step. After closure, "cancel" exits.
      this.$emit('cancel');
    },

    addLetter() {
      const f = this.$refs.letterFile && this.$refs.letterFile.files[0];
      if (!f) { alert('Pick a file before adding.'); return; }
      this.pendingLetters.push({
        polarity: this.newLetter.polarity,
        received_date: this.newLetter.received_date,
        notes: this.newLetter.notes || '',
        file: f,
      });
      this.newLetter = { polarity: 'POSITIVE', received_date: new Date().toISOString().slice(0,10), notes: '' };
      if (this.$refs.letterFile) this.$refs.letterFile.value = '';
    },

    async submitClose() {
      this.error = '';
      if (!this.form.closure_date) { this.error = 'Closure date is required.'; return; }
      const missing = [];
      const badNoComment = [];
      for (const a of LESSON_AREAS) {
        const row = this.form.scores[a.key];
        if (!row.score) { missing.push(a.label); continue; }
        if (row.score === 'BAD' && !(row.comment || '').trim()) badNoComment.push(a.label);
      }
      if (missing.length > 0) { this.error = 'Score every area. Missing: ' + missing.join(', '); return; }
      if (badNoComment.length > 0) { this.error = 'A BAD score requires a comment. Missing: ' + badNoComment.join(', '); return; }
      if (!confirm('Closing the project is a major action. Continue?')) return;
      this.saving = true;
      try {
        await API.closeProject(this.project.id, {
          closure_date: this.form.closure_date,
          lessons_summary: this.form.lessons_summary || '',
          area_scores: LESSON_AREAS.map(a => ({
            area_key: a.key,
            score: this.form.scores[a.key].score,
            comment: this.form.scores[a.key].comment || '',
          })),
        });
        // Upload pending feedback letters one by one
        for (const l of this.pendingLetters) {
          try {
            await API.uploadCustomerFeedback(this.project.id, {
              polarity: l.polarity, received_date: l.received_date, notes: l.notes, file: l.file,
            });
          } catch (e) {
            console.warn('Letter upload failed:', e);
          }
        }
        // Move to cleanup step
        await this.loadCandidates();
        this.step = 'cleanup';
      } catch (e) {
        this.error = e.message || 'Failed to close project.';
      } finally {
        this.saving = false;
      }
    },

    async loadCandidates() {
      this.candidatesLoading = true;
      try {
        const r = await API.getProjectClosureCandidates(this.project.id);
        this.candidates = r.candidates || [];
        this.selectedRemovalIds = this.candidates.map(c => c.id); // pre-select all
      } catch (e) {
        this.candidates = [];
      } finally {
        this.candidatesLoading = false;
      }
    },

    toggleSelectAllRemoval(e) {
      this.selectedRemovalIds = e.target.checked ? this.candidates.map(c => c.id) : [];
    },

    async removeSelected() {
      if (this.selectedRemovalIds.length === 0) return;
      const n = this.selectedRemovalIds.length;
      if (!confirm(`Remove ${n} user${n === 1 ? '' : 's'} from the platform? This cannot be undone.`)) return;
      this.cleanupSaving = true;
      this.cleanupError = '';
      try {
        await API.bulkDeleteUsers({ ids: this.selectedRemovalIds });
        this.finish();
      } catch (e) {
        this.cleanupError = e.message || 'Removal failed.';
      } finally {
        this.cleanupSaving = false;
      }
    },

    finish() {
      this.$emit('closed');
    },

    fmtDate(iso) {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      } catch { return ''; }
    },
  },
});


// ── Lessons Learned Portal ─────────────────────────────────────────────────

app.component('lessons-learned-portal', {
  props: ['currentUser'],
  emits: ['back'],
  template: `
<div>
  <!-- Note: the "Back to Projects" button lives in the project-picker page
       header (index.html, around line 153) and is shown whenever welcomeView
       is set. We don't repeat it here so the user only sees one back arrow. -->
  <div class="mb-5">
    <p class="text-sm text-gray-500">Aggregate scoring across all closed projects you can access.</p>
  </div>

  <div v-if="loading" class="card text-center py-10 text-gray-400">Loading…</div>
  <div v-else-if="!data || data.projects.length === 0" class="card text-center py-10 text-gray-400">
    No closed projects to show yet.
  </div>
  <div v-else>
    <!-- KPIs -->
    <div class="grid grid-cols-4 gap-3 mb-5">
      <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#1B4F8C,#0d3a6e)">
        <p class="text-xs opacity-80">Closed projects</p>
        <p class="text-xl font-bold mt-1 leading-tight">{{ data.projects.length }}</p>
      </div>
      <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#059669,#047857)">
        <p class="text-xs opacity-80">Successful</p>
        <p class="text-xl font-bold mt-1 leading-tight">{{ countResult('SUCCESS') }}</p>
      </div>
      <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#F59E0B,#D97706)">
        <p class="text-xs opacity-80">Partial success</p>
        <p class="text-xl font-bold mt-1 leading-tight">{{ countResult('PARTIAL_SUCCESS') }}</p>
      </div>
      <div class="card text-white py-3 px-3" style="background:linear-gradient(135deg,#DC2626,#991B1B)">
        <p class="text-xs opacity-80">Unsuccessful</p>
        <p class="text-xl font-bold mt-1 leading-tight">{{ countResult('UNSUCCESSFUL') }}</p>
      </div>
    </div>

    <!-- Aggregate distribution per area -->
    <div class="card mb-5">
      <h3 class="font-semibold text-gray-700 mb-3">Score distribution per area</h3>
      <div class="space-y-1.5">
        <div v-for="a in data.areas" :key="a.key" class="flex items-center gap-3">
          <div class="w-56 text-sm text-gray-700 truncate" :title="a.label">{{ a.label }}</div>
          <div class="flex-1 flex h-5 rounded overflow-hidden border border-gray-200" v-if="distTotal(a.key) > 0">
            <div v-for="s in ['GOOD','ACCEPTABLE','BAD','NA']" :key="s"
              :style="distSegmentStyle(a.key, s)" :title="s + ': ' + (data.area_distribution[a.key][s] || 0)"></div>
          </div>
          <div v-else class="flex-1 text-xs text-gray-400 italic">no data</div>
          <div class="w-32 text-xs text-gray-500 text-right">
            <span class="text-emerald-600 font-semibold">{{ data.area_distribution[a.key].GOOD }}</span> /
            <span class="text-amber-600 font-semibold">{{ data.area_distribution[a.key].ACCEPTABLE }}</span> /
            <span class="text-red-600 font-semibold">{{ data.area_distribution[a.key].BAD }}</span>
          </div>
        </div>
      </div>
      <div class="mt-3 text-xs text-gray-400 flex gap-3">
        <span><span class="inline-block w-3 h-3 rounded-sm align-middle" style="background:#10B981"></span> Good</span>
        <span><span class="inline-block w-3 h-3 rounded-sm align-middle" style="background:#F59E0B"></span> Acceptable</span>
        <span><span class="inline-block w-3 h-3 rounded-sm align-middle" style="background:#DC2626"></span> Bad</span>
        <span><span class="inline-block w-3 h-3 rounded-sm align-middle" style="background:#9CA3AF"></span> N/A</span>
      </div>
    </div>

    <!-- Per-project list -->
    <div class="card overflow-hidden p-0">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-gray-50 border-b border-gray-200">
            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Project</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Closed</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-40">Result</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">Customer letters</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="p in data.projects" :key="p.id">
            <tr class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" @click="toggleExpand(p.id)">
              <td class="px-4 py-3 font-medium text-gray-800">
                <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white mr-2" style="background:#1B4F8C">{{ p.project_number }}</span>
                <span class="text-gray-600 text-sm">{{ p.description || '—' }}</span>
              </td>
              <td class="px-4 py-3 text-gray-600 text-sm">{{ p.client || '—' }}</td>
              <td class="px-4 py-3 text-xs text-gray-500">{{ p.closure_date || '—' }}</td>
              <td class="px-4 py-3">
                <span :class="resultBadgeClass(p.overall_result)" class="px-2 py-0.5 rounded text-xs font-semibold">{{ resultLabel(p.overall_result) }}</span>
              </td>
              <td class="px-4 py-3 text-xs">
                <span v-if="p.feedback_counts.POSITIVE > 0" class="px-1.5 py-0.5 rounded text-emerald-700 bg-emerald-100 mr-1">+{{ p.feedback_counts.POSITIVE }}</span>
                <span v-if="p.feedback_counts.NEGATIVE > 0" class="px-1.5 py-0.5 rounded text-red-700 bg-red-100">−{{ p.feedback_counts.NEGATIVE }}</span>
                <span v-if="p.feedback_counts.POSITIVE === 0 && p.feedback_counts.NEGATIVE === 0" class="text-gray-400">—</span>
              </td>
              <td class="px-4 py-3 text-right text-xs text-gray-400">{{ expanded[p.id] ? '▼' : '▶' }}</td>
            </tr>
            <tr v-if="expanded[p.id]" class="bg-gray-50">
              <td colspan="6" class="px-4 py-3">
                <div class="grid grid-cols-2 gap-2 text-xs">
                  <div v-for="a in data.areas" :key="a.key"
                    class="rounded-lg border border-gray-200 p-2 bg-white">
                    <div class="flex items-center gap-2 mb-1">
                      <span :class="scoreBadgeClass((p.scores[a.key] || {}).score)" class="px-2 py-0.5 rounded font-semibold">
                        {{ ((p.scores[a.key] || {}).score) || '—' }}
                      </span>
                      <span class="font-medium text-gray-700">{{ a.label }}</span>
                    </div>
                    <p v-if="(p.scores[a.key] || {}).comment" class="text-gray-600 italic">{{ p.scores[a.key].comment }}</p>
                  </div>
                </div>
                <div v-if="p.lessons_summary" class="mt-3 p-3 bg-white rounded-lg border border-gray-200">
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Closure summary</p>
                  <p class="text-sm text-gray-700 whitespace-pre-line">{{ p.lessons_summary }}</p>
                </div>
                <div class="mt-3">
                  <button @click.stop="loadFeedback(p.id)" class="text-xs text-ips-blue hover:underline">View customer letters →</button>
                  <div v-if="feedbackByProject[p.id]" class="mt-2 space-y-1">
                    <div v-for="f in feedbackByProject[p.id]" :key="f.id" class="flex items-center gap-2 text-xs bg-white border border-gray-200 rounded px-2 py-1">
                      <span :class="f.polarity === 'POSITIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'"
                        class="px-1.5 py-0.5 rounded font-semibold">
                        {{ f.polarity === 'POSITIVE' ? '+' : '−' }}
                      </span>
                      <span class="text-gray-700 font-medium">{{ f.file_name }}</span>
                      <span class="text-gray-400">received {{ f.received_date }}</span>
                      <a :href="downloadUrl(f.id)" target="_blank" class="ml-auto text-ips-blue hover:underline">Download</a>
                    </div>
                    <div v-if="feedbackByProject[p.id].length === 0" class="text-gray-400 italic">No letters.</div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</div>
  `,

  data() {
    return {
      loading: false,
      data: null,
      expanded: {},
      feedbackByProject: {},
    };
  },

  async mounted() {
    this.loading = true;
    try {
      this.data = await API.getLessonsLearnedPortal();
    } catch (e) {
      this.data = null;
    } finally {
      this.loading = false;
    }
  },

  methods: {
    toggleExpand(pid) {
      this.expanded = { ...this.expanded, [pid]: !this.expanded[pid] };
    },
    countResult(r) {
      if (!this.data) return 0;
      return this.data.projects.filter(p => p.overall_result === r).length;
    },
    distTotal(key) {
      const d = this.data && this.data.area_distribution && this.data.area_distribution[key];
      if (!d) return 0;
      return (d.GOOD || 0) + (d.ACCEPTABLE || 0) + (d.BAD || 0) + (d.NA || 0);
    },
    distSegmentStyle(key, score) {
      const d = this.data.area_distribution[key] || {};
      const total = this.distTotal(key);
      if (total === 0) return 'width:0';
      const pct = ((d[score] || 0) / total) * 100;
      const bg = ({ GOOD: '#10B981', ACCEPTABLE: '#F59E0B', BAD: '#DC2626', NA: '#9CA3AF' })[score] || '#999';
      return `width:${pct}%;background:${bg}`;
    },
    resultLabel: _resultLabel,
    resultBadgeClass: _resultBadgeClass,
    scoreBadgeClass: _scoreBadgeClass,
    async loadFeedback(pid) {
      try {
        this.feedbackByProject = { ...this.feedbackByProject, [pid]: await API.listCustomerFeedbacks(pid) };
      } catch (e) {
        this.feedbackByProject = { ...this.feedbackByProject, [pid]: [] };
      }
    },
    downloadUrl(id) { return API.customerFeedbackDownloadUrl(id); },
  },
});
