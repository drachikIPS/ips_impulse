// ─────────────────────────────────────────────────────────────────────────────
// Document Comment Log Component
// ─────────────────────────────────────────────────────────────────────────────
app.component('document-comment-log', {
  props: ['docId', 'currentVersion', 'currentUser', 'initialPage', 'viewerFilename'],
  emits: ['navigate-page'],
  template: `
    <div class="flex flex-col h-full">
      <!-- Filters -->
      <div class="flex items-center gap-2 mb-3 flex-wrap">
        <select v-model="filterVersion" class="input-field text-xs py-1 w-28" @change="loadComments">
          <option :value="null">All versions</option>
          <option v-for="v in versionOptions" :key="v" :value="v">Version {{ v }}</option>
        </select>
        <select v-model="filterStatus" class="input-field text-xs py-1 w-24" @change="loadComments">
          <option value="">All</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <span class="text-xs text-gray-400 ml-auto">{{ comments.length }} comments</span>
      </div>

      <!-- Add Comment Form -->
      <div class="mb-3 border border-gray-200 rounded-lg p-2 bg-gray-50">
        <textarea v-model="newCommentText" rows="2" class="input-field text-xs mb-1.5" placeholder="Add a comment..."></textarea>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1 text-xs text-gray-500">
            Page:
            <input type="number" v-model.number="commentPage" min="1" class="w-12 text-center text-xs py-0.5 border border-gray-300 rounded"/>
          </label>
          <button @click="addComment" :disabled="!newCommentText.trim() || commentSaving"
            class="ml-auto px-3 py-1 text-xs font-medium rounded bg-ips-blue text-white hover:bg-ips-dark transition-colors disabled:opacity-50">
            {{ commentSaving ? 'Saving...' : 'Add Comment' }}
          </button>
        </div>
        <p v-if="commentError" class="text-red-500 text-xs mt-1">{{ commentError }}</p>
      </div>

      <!-- Comment list -->
      <div class="flex-1 overflow-y-auto space-y-2">
        <div v-if="loading" class="text-center py-6"><img src="/static/assets/impulse-loader.svg" class="h-6 mx-auto" alt="Loading"/></div>
        <div v-else-if="comments.length === 0" class="text-center py-6 text-gray-400 text-xs">No comments yet</div>

        <div v-for="c in comments" :key="c.id"
          class="border rounded-lg overflow-hidden"
          :class="c.status === 'OPEN' ? 'border-amber-200 bg-amber-50' : c.status === 'RESOLVED' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'">

          <!-- Comment header -->
          <div class="px-3 py-2 flex items-start gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-xs font-semibold text-gray-700">{{ c.author_name }}</span>
                <span class="text-xs text-gray-400">v{{ c.version }}</span>
                <span v-if="c.page_number" class="text-xs text-blue-500 cursor-pointer hover:underline" @click="$emit('navigate-page', c.page_number)">p.{{ c.page_number }}</span>
                <span :class="['text-xs font-medium px-1.5 py-0.5 rounded-full',
                  c.status === 'OPEN' ? 'bg-amber-100 text-amber-700' :
                  c.status === 'RESOLVED' ? 'bg-green-100 text-green-700' :
                  'bg-gray-200 text-gray-600']">{{ c.status }}</span>
                <!-- Version links -->
                <span v-for="vl in c.version_links" :key="vl.version"
                  class="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">+v{{ vl.version }}</span>
              </div>
              <p class="text-xs text-gray-700 mt-1 whitespace-pre-wrap">{{ c.text }}</p>
              <p class="text-xs text-gray-400 mt-0.5">{{ fmtTime(c.created_at) }}</p>
            </div>

            <!-- Actions dropdown -->
            <div class="flex items-center gap-1 shrink-0">
              <button v-if="c.status === 'OPEN' && canChangeStatus(c)" @click="updateStatus(c, 'RESOLVED')"
                class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200" title="Resolve">Resolve</button>
              <button v-if="c.status === 'OPEN' && canChangeStatus(c)" @click="updateStatus(c, 'CLOSED')"
                class="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300" title="Close">Close</button>
              <button v-if="c.status !== 'OPEN' && canChangeStatus(c)" @click="updateStatus(c, 'OPEN')"
                class="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200" title="Re-open">Re-open</button>
              <button v-if="c.version < currentVersion && !isLinkedToVersion(c, currentVersion)"
                @click="linkVersion(c)"
                class="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 hover:bg-blue-200" title="Still applicable">Still applicable</button>
            </div>
          </div>

          <!-- Notes -->
          <div v-if="c.notes && c.notes.length > 0" class="border-t border-gray-200 px-3 py-1.5 space-y-1">
            <div v-for="n in c.notes" :key="n.id" class="flex gap-2 text-xs">
              <span class="font-semibold text-gray-600 shrink-0">{{ n.author_name }}:</span>
              <span class="text-gray-600 flex-1">{{ n.content }}</span>
              <span class="text-gray-400 shrink-0">{{ fmtTime(n.created_at) }}</span>
            </div>
          </div>

          <!-- Add note -->
          <div class="border-t border-gray-200 px-3 py-1.5 flex gap-1.5">
            <input v-model="noteTexts[c.id]" type="text" class="input-field text-xs py-1 flex-1" placeholder="Add a note..."
              @keyup.enter="addNote(c)"/>
            <button @click="addNote(c)" :disabled="!noteTexts[c.id] || noteSaving[c.id]"
              class="px-2 py-1 text-xs rounded bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-50">
              {{ noteSaving[c.id] ? '...' : 'Reply' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,

  data() {
    return {
      comments: [],
      loading: false,
      filterVersion: null,
      filterStatus: '',
      newCommentText: '',
      commentPage: null,
      commentSaving: false,
      commentError: '',
      noteTexts: {},
      noteSaving: {},
    };
  },

  computed: {
    versionOptions() {
      const versions = [];
      for (let v = 0; v <= (this.currentVersion || 0); v++) versions.push(v);
      return versions;
    },
  },

  watch: {
    docId() { this.loadComments(); },
    initialPage(val) { if (val) this.commentPage = val; },
  },

  mounted() {
    this.commentPage = this.initialPage || 1;
    this.loadComments();
  },

  methods: {
    async loadComments() {
      if (!this.docId) return;
      this.loading = true;
      try {
        const params = {};
        if (this.filterVersion !== null) params.version = this.filterVersion;
        if (this.filterStatus) params.status = this.filterStatus;
        this.comments = await API.getDocumentComments(this.docId, params);
      } catch (e) {
        console.error('Load comments failed:', e);
      } finally {
        this.loading = false;
      }
    },

    async addComment() {
      if (!this.newCommentText.trim()) return;
      this.commentSaving = true;
      this.commentError = '';
      try {
        // Prepend the currently-open file's name if one is being viewed, so
        // reviewers know which attachment the comment refers to. When no file
        // is open, the comment goes in as-is.
        const body = this.viewerFilename
          ? `[${this.viewerFilename}]\n${this.newCommentText.trim()}`
          : this.newCommentText.trim();
        await API.createDocumentComment(this.docId, {
          text: body,
          page_number: this.commentPage || null,
          version: this.currentVersion,
        });
        this.newCommentText = '';
        await this.loadComments();
      } catch (e) {
        this.commentError = e.message || 'Failed to add comment';
      } finally {
        this.commentSaving = false;
      }
    },

    async updateStatus(comment, newStatus) {
      try {
        await API.updateDocumentComment(this.docId, comment.id, {
          status: newStatus,
          updated_at: comment.updated_at,
        });
        await this.loadComments();
      } catch (e) {
        alert(e.message || 'Failed to update status');
      }
    },

    async addNote(comment) {
      const text = this.noteTexts[comment.id];
      if (!text || !text.trim()) return;
      this.noteSaving = { ...this.noteSaving, [comment.id]: true };
      try {
        await API.addDocumentCommentNote(this.docId, comment.id, { content: text.trim() });
        this.noteTexts = { ...this.noteTexts, [comment.id]: '' };
        await this.loadComments();
      } catch (e) {
        alert(e.message || 'Failed to add note');
      } finally {
        this.noteSaving = { ...this.noteSaving, [comment.id]: false };
      }
    },

    async linkVersion(comment) {
      try {
        await API.linkCommentVersion(this.docId, comment.id, { version: this.currentVersion });
        await this.loadComments();
      } catch (e) {
        alert(e.message || 'Failed to link version');
      }
    },

    canChangeStatus(comment) {
      if (!this.currentUser) return false;
      if (['ADMIN', 'PROJECT_OWNER', 'PROJECT_TEAM', 'CLIENT'].includes(this.currentUser.role)) return true;
      if (this.currentUser.id === comment.author_id) return true;
      return false;
    },

    isLinkedToVersion(comment, version) {
      return comment.version === version || (comment.version_links || []).some(vl => vl.version === version);
    },

    fmtTime(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    },
  },
});
