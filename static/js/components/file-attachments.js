// ─────────────────────────────────────────────────────────────────────────────
// File Attachments — reusable panel component
// Usage: <file-attachments :record-type="'document'" :record-id="doc.id" :can-edit="true">
// ─────────────────────────────────────────────────────────────────────────────
app.component('file-attachments', {
  props: {
    recordType:  { type: String, required: true },
    recordId:    { type: Number, required: true },
    canEdit:     { type: Boolean, default: false },
    canUpload:   { type: Boolean, default: null },  // if null, falls back to canEdit
    externalViewer: { type: Boolean, default: false },  // emit 'view-file' instead of opening built-in viewer
    galleryMode: { type: Boolean, default: false },     // inline image gallery with prev/next
    hideCamera:  { type: Boolean, default: false },     // suppress the "Take Photo" button (e.g. Document Management)
  },
  emits: ['view-file'],

  data() {
    return {
      attachments: [],
      loading: false,
      uploading: false,
      uploadError: '',
      dragOver: false,
      // Viewer modal
      viewerOpen: false,
      viewerUrl: null,
      viewerName: '',
      viewerIsImage: false,
      viewerLoading: false,
      // Gallery mode
      galleryIndex: 0,
      galleryUrls: {},   // attachment.id -> blob url (cached)
    };
  },

  computed: {
    hasFiles() { return this.attachments.length > 0; },
    imageAttachments() {
      return (this.attachments || []).filter(a => (a.content_type || '').startsWith('image/'));
    },
    currentGalleryImage() {
      const arr = this.imageAttachments;
      if (!arr.length) return null;
      const idx = Math.max(0, Math.min(this.galleryIndex, arr.length - 1));
      return arr[idx];
    },
    currentGalleryUrl() {
      const a = this.currentGalleryImage;
      return a ? (this.galleryUrls[a.id] || null) : null;
    },
  },

  watch: {
    recordId(newVal) {
      if (newVal) this.load();
    },
    imageAttachments() {
      if (this.galleryIndex >= this.imageAttachments.length) this.galleryIndex = 0;
      this._loadGalleryImage();
    },
    galleryIndex() { this._loadGalleryImage(); },
  },

  async mounted() {
    if (this.recordId) await this.load();
  },

  beforeUnmount() {
    if (this.viewerUrl) URL.revokeObjectURL(this.viewerUrl);
    Object.values(this.galleryUrls || {}).forEach(u => { try { URL.revokeObjectURL(u); } catch(e){} });
  },

  methods: {
    async load() {
      this.loading = true;
      try {
        this.attachments = await API.getAttachments(this.recordType, this.recordId);
      } catch (e) {
        console.error('Failed to load attachments', e);
      } finally {
        this.loading = false;
      }
    },

    triggerPicker() {
      this.$refs.fileInput.click();
    },

    triggerCamera() {
      // Hits a separate hidden input that requests the device camera. On
      // iPad / Android tablets this opens the back camera directly; on
      // desktop with a webcam it opens the OS camera UI; otherwise the
      // browser falls back to the file picker.
      this.$refs.cameraInput && this.$refs.cameraInput.click();
    },

    async onFilePicked(e) {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      for (const f of files) await this.uploadFile(f);
    },

    onDrop(e) {
      this.dragOver = false;
      const files = Array.from(e.dataTransfer.files || []);
      files.forEach(f => this.uploadFile(f));
    },

    async uploadFile(file) {
      this.uploading = true;
      this.uploadError = '';
      try {
        await API.uploadAttachment(this.recordType, this.recordId, file);
        await this.load();
      } catch (err) {
        this.uploadError = err.message || 'Upload failed';
      } finally {
        this.uploading = false;
      }
    },

    async openViewer(att) {
      if (this.externalViewer) {
        this.$emit('view-file', att);
        return;
      }
      this.viewerLoading = true;
      this.viewerOpen = true;
      this.viewerName = att.original_filename;
      this.viewerUrl = null;
      this.viewerIsImage = (att.content_type || '').startsWith('image/');
      try {
        const blob = await API.fetchAttachmentBlob(att.id, true);
        if (this.viewerUrl) URL.revokeObjectURL(this.viewerUrl);
        this.viewerUrl = URL.createObjectURL(blob);
      } catch (e) {
        this.viewerOpen = false;
        alert('Could not load file: ' + e.message);
      } finally {
        this.viewerLoading = false;
      }
    },

    closeViewer() {
      this.viewerOpen = false;
      if (this.viewerUrl) { URL.revokeObjectURL(this.viewerUrl); this.viewerUrl = null; }
    },

    async download(att) {
      try {
        const blob = await API.fetchAttachmentBlob(att.id, false);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = att.original_filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      } catch (e) { alert('Download failed: ' + e.message); }
    },

    async remove(att) {
      if (!confirm(`Delete "${att.original_filename}"? This cannot be undone.`)) return;
      try {
        await API.deleteAttachment(att.id);
        await this.load();
      } catch (e) { alert(e.message || 'Delete failed'); }
    },

    async _loadGalleryImage() {
      if (!this.galleryMode) return;
      const a = this.currentGalleryImage;
      if (!a) return;
      if (this.galleryUrls[a.id]) return; // already cached
      try {
        const blob = await API.fetchAttachmentBlob(a.id, true);
        this.galleryUrls = { ...this.galleryUrls, [a.id]: URL.createObjectURL(blob) };
      } catch (e) { /* silent — fallback: file list still works */ }
    },

    prevGalleryImage() {
      if (!this.imageAttachments.length) return;
      this.galleryIndex = (this.galleryIndex - 1 + this.imageAttachments.length) % this.imageAttachments.length;
    },
    nextGalleryImage() {
      if (!this.imageAttachments.length) return;
      this.galleryIndex = (this.galleryIndex + 1) % this.imageAttachments.length;
    },

    canPreview(att) {
      const ct = att.content_type || '';
      return ct === 'application/pdf' || ct.startsWith('image/') || ct.startsWith('text/');
    },

    fileIcon(att) {
      const ct = att.content_type || '';
      if (ct === 'application/pdf') return '📄';
      if (ct.startsWith('image/')) return '🖼';
      if (ct.includes('word') || ct.includes('document')) return '📝';
      if (ct.includes('sheet') || ct.includes('excel')) return '📊';
      if (ct.startsWith('text/')) return '📃';
      return '📎';
    },

    fmtSize(bytes) {
      if (!bytes) return '—';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1048576).toFixed(1) + ' MB';
    },

    fmtDate(iso) {
      if (!iso) return '';
      return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    },
  },

  template: `
<div class="file-attachments-panel">

  <!-- Inline image gallery (punchlist-style) -->
  <div v-if="galleryMode && imageAttachments.length > 0" class="mb-3">
    <div class="relative bg-gray-100 rounded-lg overflow-hidden" style="height:min(65vh,640px)">
      <img v-if="currentGalleryUrl" :src="currentGalleryUrl"
        @click="openViewer(currentGalleryImage)"
        class="w-full h-full object-contain bg-white cursor-zoom-in"
        :alt="currentGalleryImage ? currentGalleryImage.original_filename : ''"/>
      <div v-else class="flex items-center justify-center h-full text-gray-400">
        <img src="/static/assets/impulse-loader.svg" class="h-6" alt="Loading"/>
      </div>
      <button v-if="imageAttachments.length > 1" @click="prevGalleryImage"
        class="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 hover:bg-white shadow flex items-center justify-center text-gray-700"
        title="Previous">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
      </button>
      <button v-if="imageAttachments.length > 1" @click="nextGalleryImage"
        class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 hover:bg-white shadow flex items-center justify-center text-gray-700"
        title="Next">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
      </button>
      <span v-if="imageAttachments.length > 1"
        class="absolute bottom-2 right-3 text-[11px] font-medium bg-black/50 text-white px-2 py-0.5 rounded">
        {{ galleryIndex + 1 }} / {{ imageAttachments.length }}
      </span>
      <span v-if="currentGalleryImage"
        class="absolute bottom-2 left-3 text-[11px] font-medium bg-black/50 text-white px-2 py-0.5 rounded truncate max-w-[60%]"
        :title="currentGalleryImage.original_filename">
        {{ currentGalleryImage.original_filename }}
      </span>
    </div>
  </div>

  <!-- No record yet -->
  <div v-if="!recordId" class="text-xs text-gray-400 italic py-2">Save this record first, then you can attach files.</div>

  <!-- File list -->
  <div v-else-if="loading" class="py-2"><img src="/static/assets/impulse-loader.svg" class="h-5" alt="Loading"/></div>
  <div v-else-if="hasFiles" class="space-y-1 mb-3">
    <div v-for="att in attachments" :key="att.id"
      @click="canPreview(att) && openViewer(att)"
      :class="['flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 group text-sm',
                canPreview(att) ? 'cursor-pointer' : '']">
      <span class="text-base shrink-0">{{ fileIcon(att) }}</span>
      <span class="flex-1 truncate text-gray-800 text-xs font-medium" :title="att.original_filename">
        {{ att.original_filename }}
      </span>
      <span class="text-gray-400 text-xs shrink-0">{{ fmtSize(att.file_size) }}</span>
      <span class="text-gray-300 text-xs shrink-0 hidden group-hover:inline">{{ fmtDate(att.uploaded_at) }}</span>
      <div class="flex items-center gap-1 shrink-0">
        <button v-if="canPreview(att)" @click.stop="openViewer(att)"
          class="text-gray-400 hover:text-ips-blue" title="View">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
          </svg>
        </button>
        <button @click.stop="download(att)" class="text-gray-400 hover:text-ips-blue" title="Download">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
        </button>
        <button v-if="canEdit" @click.stop="remove(att)" class="text-gray-300 hover:text-red-500" title="Delete">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
  <div v-else class="text-xs text-gray-400 italic mb-3">No attachments yet.</div>

  <!-- Upload zone: canUpload overrides canEdit when explicitly set -->
  <div v-if="(canUpload !== null ? canUpload : canEdit) && recordId">
    <button v-if="!hideCamera" @click="triggerCamera" :disabled="uploading"
            class="w-full mb-2 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-ips-blue text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
      </svg>
      Take Photo
    </button>
    <div
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
      @click="triggerPicker"
      :class="['border-2 border-dashed rounded-lg px-3 py-2 text-center cursor-pointer transition-colors text-xs',
        dragOver ? 'border-ips-blue bg-blue-50 text-ips-blue' : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500']">
      <span v-if="uploading">
        <svg class="w-4 h-4 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Uploading…
      </span>
      <span v-else>
        <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
        </svg>
        Drop files here or click to upload
      </span>
    </div>
    <p v-if="uploadError" class="text-red-500 text-xs mt-1">{{ uploadError }}</p>
    <input ref="fileInput" type="file" multiple class="hidden" @change="onFilePicked"/>
    <input ref="cameraInput" type="file" accept="image/*" capture="environment" multiple class="hidden" @change="onFilePicked"/>
  </div>

  <!-- ── Viewer Modal ── -->
  <div v-if="viewerOpen" class="modal-overlay" style="z-index:9999" @click.self="closeViewer">
    <div class="modal-box" style="max-width:90vw;width:90vw;max-height:92vh;height:92vh;display:flex;flex-direction:column;padding:0">
      <!-- Header -->
      <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-200 shrink-0">
        <span class="font-medium text-gray-800 truncate flex-1 text-sm">{{ viewerName }}</span>
        <button @click="closeViewer" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <!-- Body -->
      <div class="flex-1 overflow-hidden bg-gray-100 flex items-center justify-center">
        <div v-if="viewerLoading"><img src="/static/assets/impulse-loader.svg" class="h-6" alt="Loading"/></div>
        <img v-else-if="viewerUrl && viewerIsImage" :src="viewerUrl"
          class="max-w-full max-h-full object-contain" :alt="viewerName"/>
        <iframe v-else-if="viewerUrl" :src="viewerUrl"
          class="w-full h-full border-0" :title="viewerName"></iframe>
      </div>
    </div>
  </div>

</div>
  `,
});
