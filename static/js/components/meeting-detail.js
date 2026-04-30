// ─────────────────────────────────────────────────────────────────────────────
// Meeting Detail Component (full meeting view with points)
// ─────────────────────────────────────────────────────────────────────────────
app.component('meeting-detail', {
  props: ['meetingId', 'contacts', 'currentUser'],
  emits: ['back'],
  template: `
    <div>
      <!-- Back button + export actions -->
      <div class="flex items-center justify-between mb-4">
        <button @click="$emit('back')" class="flex items-center gap-2 text-gray-500 hover:text-ips-blue text-sm font-medium">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
          Back to Meetings
        </button>
        <div class="flex items-center gap-2">
          <button @click="exportExcel" :disabled="exporting" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Excel
          </button>
          <button @click="exportPdf" :disabled="exporting" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
            PDF
          </button>
        </div>
      </div>

      <div v-if="!meeting" class="text-center py-10 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
      <div v-else>
        <!-- Meeting header card -->
        <div class="card mb-6">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <h2 class="text-2xl font-bold text-gray-800">{{ meeting.title }}</h2>
              <div class="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                <span v-if="meeting.date" class="flex items-center gap-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                  {{ formatDate(meeting.date) }} {{ meeting.time }}
                </span>
                <span v-if="meeting.location" class="flex items-center gap-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  {{ meeting.location }}
                </span>
                <span v-if="meeting.meeting_type_name" class="text-gray-400">{{ meeting.meeting_type_name }}</span>
                <!-- Inline status selector -->
                <select v-model="meeting.status" @change="saveMeetingStatus"
                  :class="statusSelectClass(meeting.status)"
                  class="text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ips-blue appearance-none">
                  <option value="PLANNED">Planned</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>
            <!-- Notes toggle -->
            <button v-if="meeting.notes" @click="notesExpanded = !notesExpanded"
              class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-ips-blue shrink-0 mt-1 transition-colors">
              <svg class="w-4 h-4 transition-transform" :class="notesExpanded ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
              {{ notesExpanded ? 'Hide notes' : 'Show notes' }}
            </button>
          </div>

          <!-- Collapsible notes -->
          <div v-if="notesExpanded && meeting.notes" class="mt-3 pt-3 border-t border-gray-100">
            <p class="text-sm text-gray-600 whitespace-pre-line">{{ meeting.notes }}</p>
          </div>

          <!-- Participants -->
          <div class="mt-4 pt-4 border-t border-gray-100">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-sm font-semibold text-gray-600">Participants</span>
              <span class="text-xs text-gray-400">(click to toggle attendance)</span>
              <button @click="toggleParticipantEditor"
                class="ml-auto flex items-center gap-1 text-xs text-ips-blue hover:text-ips-dark font-medium transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
                {{ showParticipantEditor ? 'Done' : 'Manage' }}
              </button>
            </div>

            <!-- Participant editor: all contacts as checkboxes -->
            <div v-if="showParticipantEditor" class="mb-3 border border-gray-200 rounded-lg max-h-[32rem] overflow-y-auto">
              <label v-for="c in contacts" :key="c.id"
                class="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                <input type="checkbox" :value="c.id" v-model="editParticipantIds" @change="saveParticipants" class="w-4 h-4 text-ips-blue"/>
                <span class="text-sm text-gray-700">{{ c.name }}</span>
                <span v-if="c.company" class="text-xs text-gray-400 ml-auto">{{ c.company }}</span>
              </label>
            </div>

            <div class="flex flex-wrap gap-2">
              <button v-for="p in meeting.participants" :key="p.contact_id"
                @click="togglePresent(p)"
                :class="p.present ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'"
                class="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors">
                <svg v-if="p.present" class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
                {{ p.name }}
              </button>
              <span v-if="meeting.participants.length === 0 && !showParticipantEditor" class="text-xs text-gray-400">No participants — click Manage to add</span>
            </div>
          </div>
        </div>

        <!-- Meeting Points Section -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <h3 class="text-lg font-semibold text-gray-800">Meeting Points</h3>
            <div class="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button @click="prepView = false" :class="!prepView ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'"
                class="px-3 py-1 rounded text-xs font-medium transition-all">All</button>
              <button @click="prepView = true" :class="prepView ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'"
                class="px-3 py-1 rounded text-xs font-medium transition-all">Selected</button>
            </div>
            <!-- Compact view toggle -->
            <label class="flex items-center gap-2 cursor-pointer select-none ml-2">
              <span class="text-xs text-gray-500">Hide details &amp; notes</span>
              <button type="button" @click="compactView = !compactView"
                :class="compactView ? 'bg-ips-blue' : 'bg-gray-200'"
                class="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none">
                <span :class="compactView ? 'translate-x-4' : 'translate-x-0.5'"
                  class="inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transform transition-transform duration-200"></span>
              </button>
            </label>
          </div>
          <button v-if="meeting && meeting.can_create_points" @click="openPointModal()" class="btn-primary">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            Add Point
          </button>
        </div>

        <!-- Points Filter -->
        <div class="flex gap-2 mb-4 flex-wrap">
          <button v-for="f in typeFilters" :key="f.value"
            @click="filterType = filterType === f.value ? '' : f.value"
            :class="filterType === f.value ? f.activeClass : 'bg-gray-100 text-gray-600'"
            class="px-3 py-1 rounded-full text-xs font-medium transition-colors">
            {{ f.label }}
          </button>
          <button v-for="f in statusFilters" :key="f.value"
            @click="filterStatus = filterStatus === f.value ? '' : f.value"
            :class="filterStatus === f.value ? f.activeClass : 'bg-gray-100 text-gray-600'"
            class="px-3 py-1 rounded-full text-xs font-medium transition-colors">
            {{ f.label }}
          </button>
        </div>

        <!-- Points List -->
        <div class="space-y-3">
          <div v-if="filteredPoints.length === 0" class="card text-center text-gray-400 py-8">
            No meeting points yet. Click "Add Point" to get started.
          </div>

          <div v-for="(p, idx) in filteredPoints" :key="p.id"
            :class="['card hover:shadow-md transition-shadow', isPrep(p) ? 'border-l-4 border-l-green-500' : '']">
            <div class="flex items-start gap-6">
              <!-- Number + Type indicator -->
              <div class="flex flex-col items-center gap-1 shrink-0">
                <span class="text-xs font-bold text-gray-400 font-mono">MP-{{ String(p.seq_id || p.id).padStart(6,'0') }}</span>
                <button @click="canFullEdit(p) && cyclePointType(p)" :class="typeClass(p.type)" class="type-badge cursor-pointer hover:opacity-80 transition-opacity" :title="canFullEdit(p) ? 'Type: ' + p.type + ' — click to change' : 'Type: ' + p.type">{{ p.type[0] }}</button>
                <span v-if="isPrep(p)" class="text-green-500" title="Selected for this meeting">
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                  </svg>
                </span>
              </div>

              <div class="flex-1 min-w-0">
                <!-- Top row: status + responsible + due date + attachment + actions -->
                <div class="flex items-center gap-6 flex-wrap mb-2">
                  <!-- Inline point status selector -->
                  <select v-if="canFullEdit(p)" v-model="p.status" @change="inlineSetPointStatus(p)"
                    :class="pointStatusSelectClass(p.status)"
                    class="text-xs font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ips-blue appearance-none shrink-0">
                    <option value="NOT_STARTED">Not Started</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="ON_HOLD">On Hold</option>
                    <option value="URGENT">Urgent</option>
                    <option value="DECLARED_DONE">Declared Done</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                  <span v-else :class="pointStatusBadgeClass(p.status)" class="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0">
                    {{ pointStatusLabel(p.status) }}
                  </span>
                  <!-- Responsible selector -->
                  <div class="flex items-center gap-1.5 shrink-0">
                    <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                    </svg>
                    <select v-model="p.responsible_id" @change="inlineSetPointResponsible(p)" :disabled="!canFullEdit(p)"
                      class="text-xs text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-0.5 hover:border-ips-blue focus:outline-none focus:border-ips-blue cursor-pointer appearance-none max-w-[160px] disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-default">
                      <option :value="null">— Not assigned —</option>
                      <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }}{{ c.company ? ' (' + c.company + ')' : '' }}</option>
                    </select>
                  </div>
                  <!-- Inline due date input -->
                  <div class="flex items-center gap-1.5 shrink-0">
                    <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    <input type="date" v-model="p.due_date" @change="inlineSetPointDueDate(p)" :disabled="!canFullEdit(p)"
                      :class="isOverdue(p) ? 'border-red-300 text-red-600 font-semibold' : 'border-gray-200 text-gray-600'"
                      class="text-xs bg-white border rounded-md px-2 py-0.5 hover:border-ips-blue focus:outline-none focus:border-ips-blue cursor-pointer disabled:bg-gray-50 disabled:cursor-default"/>
                  </div>
                  <!-- Attachment indicator -->
                  <span v-if="p.attachment_count > 0"
                    class="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 rounded-md px-2 py-0.5 shrink-0" title="Has attachments">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                    </svg>
                    {{ p.attachment_count }}
                  </span>
                  <!-- Closed info -->
                  <span v-if="p.closed_at" class="flex items-center gap-1 text-xs text-green-600 shrink-0">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    Closed: {{ formatDateTime(p.closed_at) }}
                  </span>
                  <!-- Spacer -->
                  <div class="flex-1"></div>
                  <!-- Owners: Close / Reopen -->
                  <template v-if="canFullEdit(p)">
                    <button v-if="p.status !== 'CLOSED'" @click="closePoint(p)"
                      class="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-colors shrink-0"
                      title="Close this point">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                      </svg>
                      Close
                    </button>
                    <button v-else @click="reopenPoint(p)"
                      class="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors shrink-0"
                      title="Reopen this point">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                      Reopen
                    </button>
                  </template>
                  <!-- Non-owners: Declare Done -->
                  <button v-else-if="canDeclareDone(p) && p.status !== 'DECLARED_DONE' && p.status !== 'CLOSED'"
                    @click="declareDonePoint(p)"
                    class="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors shrink-0"
                    title="Declare this point done">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    Declare Done
                  </button>
                  <button v-if="canFullEdit(p)" @click="togglePrep(p)" :class="isPrep(p) ? 'text-green-500' : 'text-gray-300 hover:text-green-400'"
                    :title="isPrep(p) ? 'Deselect — exclude from export' : 'Select — include in export'">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                    </svg>
                  </button>
                  <button v-if="canFullEdit(p)" @click="openPointModal(p)" class="btn-icon text-gray-400 hover:text-ips-blue">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                  </button>
                  <button v-if="canFullEdit(p)" @click="deletePoint(p)" class="btn-icon text-gray-400 hover:text-red-500">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </div>
                <!-- Topic + per-point expand toggle (only meaningful in compact mode) -->
                <div class="flex items-start gap-2">
                  <h4 class="font-semibold text-gray-800 flex-1 min-w-0">{{ p.topic }}</h4>
                  <button v-if="compactView" @click.stop="togglePointExpand(p)"
                    :title="isPointExpanded(p) ? 'Collapse' : 'Expand'"
                    class="btn-icon text-gray-400 hover:text-ips-blue shrink-0 -mt-1">
                    <svg :class="['w-4 h-4 transition-transform', isPointExpanded(p) ? 'rotate-180' : '']"
                         fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </button>
                </div>
                <p v-if="p.details && isPointExpanded(p)" class="text-sm text-gray-500 mt-1 whitespace-pre-line">{{ p.details }}</p>

                <!-- Notes -->
                <div v-if="p.notes && p.notes.length > 0 && isPointExpanded(p)" class="mt-3 border-t border-gray-100 pt-3 space-y-2">
                  <div v-for="note in p.notes" :key="note.id" class="flex items-start gap-2 group">
                    <div class="w-1.5 h-1.5 rounded-full bg-ips-blue mt-1.5 shrink-0"></div>
                    <div class="flex-1">
                      <p class="text-sm text-gray-600 whitespace-pre-line">{{ note.content }}</p>
                      <p class="text-xs text-gray-400 mt-0.5">
                        {{ note.author_name || 'Unknown' }} · {{ note.meeting_title || 'No meeting' }} · {{ formatDateTime(note.created_at) }}
                      </p>
                    </div>
                    <button @click="deleteNote(p, note)" class="opacity-0 group-hover:opacity-100 btn-icon text-gray-300 hover:text-red-400">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Add note (also hidden when this point is collapsed) -->
                <div v-if="isPointExpanded(p)" class="mt-3 flex gap-2">
                  <input v-model="noteInputs[p.id]" type="text" class="input-field text-sm py-1.5"
                    placeholder="Add a note for this meeting…"
                    @keyup.enter="addNote(p)"/>
                  <button @click="addNote(p)" class="btn-secondary text-xs px-3 py-1.5">Add</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Point Modal -->
      <div v-if="showPointModal" class="modal-overlay" @click.self="showPointModal = false">
        <div class="modal-box modal-xl">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ editingPoint ? 'Edit Meeting Point' : 'New Meeting Point' }}</h3>
            <button @click="showPointModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body" style="padding:0;display:flex;overflow:hidden">
            <div class="flex-1 min-w-0 overflow-y-auto" style="padding:20px 24px">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="form-label">Type</label>
                  <select v-model="pointForm.type" class="input-field">
                    <option value="ACTION">Action</option>
                    <option value="DECISION">Decision</option>
                    <option value="INFO">Information</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Status</label>
                  <select v-model="pointForm.status" class="input-field">
                    <option value="NOT_STARTED">Not Started</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="ON_HOLD">On Hold</option>
                    <option value="URGENT">Urgent</option>
                    <option value="DECLARED_DONE">Declared Done</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </div>
                <div class="col-span-2">
                  <label class="form-label">Topic *</label>
                  <input v-model="pointForm.topic" type="text" class="input-field" placeholder="Brief description of the point…"/>
                </div>
                <div class="col-span-2">
                  <label class="form-label">Details</label>
                  <textarea v-model="pointForm.details" class="input-field" rows="3" placeholder="Detailed description…"></textarea>
                </div>
                <div>
                  <label class="form-label">Responsible</label>
                  <select v-model="pointForm.responsible_id" class="input-field">
                    <option :value="null">— Not assigned —</option>
                    <option v-for="c in contacts" :key="c.id" :value="c.id">{{ c.name }} {{ c.company ? '(' + c.company + ')' : '' }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Due Date</label>
                  <input v-model="pointForm.due_date" type="date" class="input-field"/>
                </div>
                <div class="col-span-2 flex items-center gap-2">
                  <input type="checkbox" v-model="pointForm.for_preparation" id="prepCheck" class="w-4 h-4 text-ips-blue"/>
                  <label for="prepCheck" class="text-sm text-gray-700">Selected for this meeting (included in export)</label>
                </div>
              </div>
              <p v-if="pointError" class="text-red-500 text-sm mt-3">{{ pointError }}</p>
            </div>
            <div class="w-[28rem] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50" style="padding:20px 16px">
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Attachments</p>
              <file-attachments record-type="meeting_point" :record-id="editingPoint ? editingPoint.id : null" :can-edit="true"></file-attachments>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="showPointModal = false" class="btn-secondary">Cancel</button>
            <button v-if="!editingPoint" @click="savePoint" :disabled="savingPoint" class="btn-primary">
              {{ savingPoint ? 'Saving…' : 'Save' }}
            </button>
            <button v-else-if="editingPoint._justCreated" @click="showPointModal = false" class="btn-primary">
              Add Point
            </button>
            <button v-else @click="savePoint" :disabled="savingPoint" class="btn-primary">
              {{ savingPoint ? 'Saving…' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,

  data() {
    return {
      meeting: null,
      points: [],
      prepView: false,
      filterType: '',
      filterStatus: '',
      compactView: false,
      // Per-point expand state used only when compactView is on. A point is
      // considered "expanded" if its id is in this array, in which case its
      // details / notes / add-note input are shown even though compactView
      // is collapsing every other point.
      expandedPointIds: [],
      noteInputs: {},
      notesExpanded: false,
      showParticipantEditor: false,
      editParticipantIds: [],
      _prevPointStatuses: {},
      exporting: false,
      showPointModal: false,
      editingPoint: null,
      pointForm: this.emptyPointForm(),
      savingPoint: false,
      pointError: '',
      typeFilters: [
        { value: 'ACTION', label: 'Actions', activeClass: 'bg-purple-100 text-purple-700' },
        { value: 'DECISION', label: 'Decisions', activeClass: 'bg-blue-100 text-blue-700' },
        { value: 'INFO', label: 'Info', activeClass: 'bg-gray-200 text-gray-700' },
      ],
      statusFilters: [
        { value: 'URGENT', label: 'Urgent', activeClass: 'bg-red-100 text-red-700' },
        { value: 'IN_PROGRESS', label: 'In Progress', activeClass: 'bg-yellow-100 text-yellow-700' },
        { value: 'CLOSED', label: 'Closed', activeClass: 'bg-green-100 text-green-700' },
      ],
    };
  },

  computed: {

    filteredPoints() {
      let list = this.prepView
        ? this.points.filter(p => p.preparation_meeting_ids && p.preparation_meeting_ids.includes(this.meetingId))
        : [...this.points].sort((a, b) => {
            const aPrep = a.preparation_meeting_ids && a.preparation_meeting_ids.includes(this.meetingId) ? 0 : 1;
            const bPrep = b.preparation_meeting_ids && b.preparation_meeting_ids.includes(this.meetingId) ? 0 : 1;
            return aPrep - bPrep;
          });
      if (this.filterType) list = list.filter(p => p.type === this.filterType);
      if (this.filterStatus) list = list.filter(p => p.status === this.filterStatus);
      return list;
    },
  },

  async mounted() {
    await this.load();
  },

  watch: {
    meetingId() { this.load(); },
    // Reset per-point expansion whenever compact mode flips, so the toggle is
    // a clean "collapse everything" / "show everything" switch.
    compactView() { this.expandedPointIds = []; },
  },

  methods: {
    emptyPointForm() {
      return { type: 'ACTION', topic: '', details: '', responsible_id: null, due_date: '', status: 'NOT_STARTED', for_preparation: true };
    },

    isPointExpanded(p) {
      // When compact mode is off, every point is fully visible. When on, only
      // points the user has explicitly expanded show their details / notes.
      if (!this.compactView) return true;
      return this.expandedPointIds.includes(p.id);
    },

    togglePointExpand(p) {
      const idx = this.expandedPointIds.indexOf(p.id);
      if (idx === -1) this.expandedPointIds.push(p.id);
      else this.expandedPointIds.splice(idx, 1);
    },

    async load() {
      this.meeting = await API.getMeeting(this.meetingId);
      this.points = await API.getMeetingPoints({ meeting_type_id: this.meeting.meeting_type_id });
      // Snapshot current statuses so inline change handler knows the previous value
      this._prevPointStatuses = Object.fromEntries(this.points.map(p => [p.id, p.status]));
      if (this.showParticipantEditor) {
        this.editParticipantIds = this.meeting.participants.map(p => p.contact_id);
      }
    },

    formatDate(d)     { return formatDate(d); },
    formatDateTime(dt) { return formatDateTime(dt); },

    statusClass(s) {
      return { PLANNED: 'badge-blue', COMPLETED: 'badge-green', CANCELLED: 'badge-gray' }[s] || 'badge-gray';
    },

    statusSelectClass(s) {
      return { PLANNED: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-green-100 text-green-700', CANCELLED: 'bg-gray-100 text-gray-600' }[s] || 'bg-gray-100 text-gray-600';
    },

    pointStatusSelectClass(s) {
      return { NOT_STARTED: 'bg-gray-100 text-gray-600', IN_PROGRESS: 'bg-yellow-100 text-yellow-700', CLOSED: 'bg-green-100 text-green-700', ON_HOLD: 'bg-blue-100 text-blue-700', URGENT: 'bg-red-100 text-red-700', DECLARED_DONE: 'bg-purple-100 text-purple-700' }[s] || 'bg-gray-100 text-gray-600';
    },

    pointStatusBadgeClass(s) {
      return this.pointStatusSelectClass(s);
    },

    pointStatusLabel(s) {
      return { NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', CLOSED: 'Closed', ON_HOLD: 'On Hold', URGENT: 'Urgent', DECLARED_DONE: 'Declared Done' }[s] || s;
    },

    canFullEdit(p) { return !!(p && p._perms && p._perms.can_full_edit); },
    canDeclareDone(p) { return !!(p && p._perms && p._perms.can_declare_done); },

    async declareDonePoint(p) {
      try { await API.declareDonePoint(p.id); }
      catch (e) { alert(e.message || 'Failed to declare done.'); }
      await this.load();
    },

    statusLabel(s) {
      return { PLANNED: 'Planned', COMPLETED: 'Completed', CANCELLED: 'Cancelled' }[s] || s;
    },

    typeClass(t) {
      return { ACTION: 'type-action', DECISION: 'type-decision', INFO: 'type-info' }[t] || 'type-info';
    },

    pointStatusClass(s) {
      return { NOT_STARTED: 'badge-gray', IN_PROGRESS: 'badge-yellow', CLOSED: 'badge-green', ON_HOLD: 'badge-blue', URGENT: 'badge-red', DECLARED_DONE: 'badge-purple' }[s] || 'badge-gray';
    },

    statusLabel2(s) {
      return { NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', CLOSED: 'Closed', ON_HOLD: 'On Hold', URGENT: 'Urgent', DECLARED_DONE: 'Declared Done' }[s] || s;
    },

    isOverdue(p) {
      if (!p.due_date || p.status === 'CLOSED') return false;
      return p.due_date < new Date().toISOString().split('T')[0];
    },

    isPrep(p) {
      return p.preparation_meeting_ids && p.preparation_meeting_ids.includes(this.meetingId);
    },

    async togglePrep(p) {
      const current = this.isPrep(p);
      await API.togglePreparation(p.id, this.meetingId, !current);
      await this.load();
    },

    async togglePresent(p) {
      await API.togglePresent(this.meetingId, p.contact_id, !p.present);
      await this.load();
    },

    async saveMeetingStatus() {
      await API.updateMeeting(this.meeting.id, { status: this.meeting.status, updated_at: this.meeting.updated_at });
      this.meeting = await API.getMeeting(this.meetingId);
    },

    toggleParticipantEditor() {
      this.showParticipantEditor = !this.showParticipantEditor;
      if (this.showParticipantEditor) {
        this.editParticipantIds = this.meeting.participants.map(p => p.contact_id);
      }
    },

    async saveParticipants() {
      await API.updateMeeting(this.meeting.id, { participant_ids: this.editParticipantIds, updated_at: this.meeting.updated_at });
      this.meeting = await API.getMeeting(this.meetingId);
    },

    async inlineSetPointStatus(p) {
      const prevStatus = this._prevPointStatuses[p.id];
      if (p.status === 'CLOSED') {
        await API.closePoint(p.id);
      } else if (prevStatus === 'CLOSED') {
        // Reopen first (sets IN_PROGRESS), then patch to desired status if different
        await API.reopenPoint(p.id);
        if (p.status !== 'IN_PROGRESS') {
          await API.updateMeetingPoint(p.id, { status: p.status, updated_at: p.updated_at });
        }
      } else {
        await API.updateMeetingPoint(p.id, { status: p.status, updated_at: p.updated_at });
      }
      await this.load();
    },

    async inlineSetPointResponsible(p) {
      await API.updateMeetingPoint(p.id, { responsible_id: p.responsible_id, updated_at: p.updated_at });
      await this.load();
    },

    async inlineSetPointDueDate(p) {
      await API.updateMeetingPoint(p.id, { due_date: p.due_date || null, updated_at: p.updated_at });
      await this.load();
    },

    selectedCount() {
      return this.points.filter(p => this.isPrep(p)).length;
    },

    async exportExcel() {
      if (this.selectedCount() === 0 && !confirm('No meeting points are selected. Export all points?')) return;
      this.exporting = true;
      try {
        const title = this.meeting ? this.meeting.title.replace(/[^a-zA-Z0-9-_]/g, '_') : 'meeting';
        const date  = this.meeting ? (this.meeting.date || 'nodate') : 'nodate';
        const selectedOnly = this.selectedCount() > 0;
        await API.download(`/api/meetings/${this.meetingId}/export/excel?selected_only=${selectedOnly}`, `meeting_${title}_${date}.xlsx`);
      } catch (e) {
        alert('Excel export failed: ' + e.message);
      } finally {
        this.exporting = false;
      }
    },

    async exportPdf() {
      if (this.selectedCount() === 0 && !confirm('No meeting points are selected. Export all points?')) return;
      this.exporting = true;
      try {
        const title = this.meeting ? this.meeting.title.replace(/[^a-zA-Z0-9-_]/g, '_') : 'meeting';
        const date  = this.meeting ? (this.meeting.date || 'nodate') : 'nodate';
        const selectedOnly = this.selectedCount() > 0;
        await API.download(`/api/meetings/${this.meetingId}/export/pdf?selected_only=${selectedOnly}`, `meeting_${title}_${date}.pdf`);
      } catch (e) {
        alert('PDF export failed: ' + e.message);
      } finally {
        this.exporting = false;
      }
    },

    async cyclePointType(p) {
      const types = ['ACTION', 'DECISION', 'INFO'];
      const next = types[(types.indexOf(p.type) + 1) % types.length];
      await API.updateMeetingPoint(p.id, { type: next, updated_at: p.updated_at });
      await this.load();
    },

    openPointModal(p = null) {
      this.editingPoint = p;
      this.pointForm = p
        ? { type: p.type, topic: p.topic, details: p.details || '', responsible_id: p.responsible_id, due_date: p.due_date || '', status: p.status, for_preparation: this.isPrep(p), updated_at: p.updated_at || null }
        : this.emptyPointForm();
      this.pointError = '';
      this.showPointModal = true;
    },

    async savePoint() {
      if (!this.pointForm.topic.trim()) { this.pointError = 'Topic is required.'; return; }
      this.savingPoint = true;
      this.pointError = '';
      try {
        if (this.editingPoint) {
          await API.updateMeetingPoint(this.editingPoint.id, this.pointForm);
          if (this.isPrep(this.editingPoint) !== this.pointForm.for_preparation) {
            await API.togglePreparation(this.editingPoint.id, this.meetingId, this.pointForm.for_preparation);
          }
          await this.load();
          this.showPointModal = false;
        } else {
          this.editingPoint = { ...await API.createMeetingPoint({ ...this.pointForm, meeting_id: this.meetingId }), _justCreated: true };
          await this.load();
        }
      } catch (e) {
        this.pointError = e.status === 409
          ? 'This point was modified by another user. Please close and reopen to get the latest version.'
          : e.message;
      } finally {
        this.savingPoint = false;
      }
    },

    async closePoint(p) {
      await API.closePoint(p.id);
      await this.load();
    },

    async reopenPoint(p) {
      await API.reopenPoint(p.id);
      await this.load();
    },

    async deletePoint(p) {
      if (!confirm(`Delete point "${p.topic}"?`)) return;
      await API.deleteMeetingPoint(p.id);
      await this.load();
    },

    async addNote(p) {
      const content = (this.noteInputs[p.id] || '').trim();
      if (!content) return;
      await API.addNote(p.id, { content, meeting_id: this.meetingId });
      this.noteInputs[p.id] = '';
      await this.load();
    },

    async deleteNote(p, note) {
      if (!confirm('Delete this note?')) return;
      await API.deleteNote(p.id, note.id);
      await this.load();
    },
  },
});
