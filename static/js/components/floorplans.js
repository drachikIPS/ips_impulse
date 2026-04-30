// ─────────────────────────────────────────────────────────────────────────────
// Floorplans tab — uploaded JPG/PNG drawings linked to one or more Areas.
// Lives under Project Organization, alongside Areas / Units.
// ─────────────────────────────────────────────────────────────────────────────
app.component('floorplans-module', {
  props: ['currentUser', 'areas'],
  emits: ['areas-changed'],
  template: `
    <div>
      <div class="rounded-lg border border-blue-200 bg-blue-50 p-3 mb-4 text-sm text-blue-900 flex gap-2">
        <svg class="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div>
          <p class="font-medium">Why upload floorplans?</p>
          <p class="text-blue-800 mt-0.5">
            When teams record a <strong>safety observation</strong> or raise a <strong>punch list</strong> item from the field, they can drop a pin on the floorplan to mark exactly where the issue is. Without a floorplan linked to the area, the pinpoint feature stays disabled and reports lose their location context.
          </p>
        </div>
      </div>

      <div class="flex items-center justify-between mb-4">
        <p class="text-sm text-gray-500">
          Upload floorplan drawings (JPG or PNG) and link them to the project areas they cover.
        </p>
        <button v-if="canManage" @click="openUploadModal()" class="btn-primary">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Upload Floorplan
        </button>
      </div>

      <div v-if="loading" class="text-center py-8 text-gray-400">
        <img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/>
      </div>

      <div v-else-if="floorplans.length === 0" class="card text-center py-12 text-gray-400">
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM8 12l2 2 5-5"/>
        </svg>
        <p>No floorplans uploaded yet.</p>
        <p v-if="canManage" class="text-sm mt-1">Upload a JPG or PNG to get started.</p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div v-for="fp in floorplans" :key="fp.id" class="card p-0 overflow-hidden flex flex-col">
          <div class="bg-gray-100 cursor-pointer flex items-center justify-center text-gray-300 text-xs"
               style="aspect-ratio: 4/3; overflow: hidden;" @click="openPreview(fp)">
            <img v-if="fp.blob_url" :src="fp.blob_url" :alt="fp.name"
                 class="w-full h-full object-contain hover:opacity-90 transition-opacity"/>
            <span v-else>Loading drawing…</span>
          </div>
          <div class="p-4 flex-1 flex flex-col">
            <div class="flex items-start justify-between gap-2 mb-2">
              <h4 class="font-semibold text-gray-800 break-words">{{ fp.name }}</h4>
              <div v-if="canManage" class="flex gap-1 shrink-0">
                <button @click="openEditModal(fp)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Edit">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </button>
                <button @click="confirmDelete(fp)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
            </div>
            <p class="text-xs uppercase tracking-wider text-gray-500 mb-2">Linked areas</p>
            <div v-if="fp.areas && fp.areas.length" class="flex flex-wrap gap-1">
              <span v-for="a in fp.areas" :key="a.id"
                    class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C"
                    :title="a.description">{{ a.tag }}</span>
            </div>
            <p v-else class="text-xs text-gray-400 italic">No areas linked yet.</p>
            <div v-if="(fp.pin_count || 0) > 0"
                 class="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 self-start"
                 :title="'Linked records will lose their pin if this floorplan is deleted'">
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/>
              </svg>
              {{ fp.pin_count }} pin{{ fp.pin_count === 1 ? '' : 's' }} linked<span v-if="fp.safety_pin_count"> · {{ fp.safety_pin_count }} safety</span><span v-if="fp.punch_pin_count"> · {{ fp.punch_pin_count }} punch</span>
            </div>
            <p class="text-xs text-gray-400 mt-3">
              Uploaded {{ formatDate(fp.uploaded_at) }}{{ fp.uploaded_by_name ? ' by ' + fp.uploaded_by_name : '' }}
            </p>
          </div>
        </div>
      </div>

      <!-- Upload / Edit modal -->
      <div v-if="showModal" class="modal-overlay" @click.self="closeModal()">
        <div class="modal-box modal-lg">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">
              {{ editingFloorplan ? 'Edit Floorplan' : 'Upload Floorplan' }}
            </h3>
            <button @click="closeModal()" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body space-y-4">
            <div>
              <label class="form-label">Name <span class="text-red-500">*</span></label>
              <input v-model="form.name" type="text" class="input-field"
                     placeholder="e.g. Ground floor — Process area"/>
            </div>

            <div v-if="!editingFloorplan">
              <label class="form-label">Drawing file <span class="text-red-500">*</span> <span class="text-gray-400 font-normal">(JPG or PNG, max 25 MB)</span></label>
              <input ref="fileInput" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                     @change="onFileSelected" class="input-field"/>
              <p v-if="form.file" class="text-xs text-gray-500 mt-1">
                {{ form.file.name }} — {{ formatSize(form.file.size) }}
              </p>
              <div class="mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <svg class="w-4 h-4 shrink-0 mt-0.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>
                  <strong class="font-semibold">Tip:</strong> for the cleanest pin overlays in
                  Safety and Punch List PDF reports, upload a floorplan that is mostly
                  <strong>black-and-white or greyscale</strong>. Coloured drawings make the red pins
                  harder to spot on printed reports.
                </span>
              </div>
            </div>

            <div v-if="editingFloorplan && editingFloorplan.blob_url" class="text-center">
              <img :src="editingFloorplan.blob_url" :alt="editingFloorplan.name"
                   class="max-h-64 mx-auto rounded-lg border border-gray-200"/>
              <p class="text-xs text-gray-400 mt-1">To replace the image, delete this floorplan and upload a new one.</p>
            </div>

            <div>
              <label class="form-label">
                Linked areas
                <span class="text-gray-400 font-normal">(select every area that this drawing covers)</span>
              </label>
              <div class="border border-gray-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-100">
                <div v-if="!areas || areas.length === 0" class="px-3 py-4 text-xs text-gray-400 text-center">
                  No areas defined yet — create areas first in the Areas tab.
                </div>
                <label v-for="a in (areas || [])" :key="a.id"
                       class="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                  <input type="checkbox" :value="a.id" v-model="form.area_ids" class="rounded"/>
                  <span class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C">{{ a.tag }}</span>
                  <span class="text-gray-700">{{ a.description }}</span>
                  <span v-if="a.floorplan_id && (!editingFloorplan || a.floorplan_id !== editingFloorplan.id)"
                        class="ml-auto text-[10px] uppercase tracking-wider text-amber-600"
                        :title="'Currently linked to: ' + (a.floorplan_name || '')">Reassigning</span>
                </label>
              </div>
              <p class="text-xs text-gray-400 mt-1">
                Areas already linked to another floorplan will be moved to this one.
              </p>
            </div>

            <p v-if="error" class="text-red-500 text-sm">{{ error }}</p>
          </div>
          <div class="modal-footer">
            <button @click="closeModal()" class="btn-secondary">Cancel</button>
            <button @click="save" :disabled="saving" class="btn-primary">
              {{ saving ? 'Saving…' : (editingFloorplan ? 'Save Changes' : 'Upload') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Preview modal (full-size image) -->
      <div v-if="previewFp" class="modal-overlay" @click.self="previewFp = null">
        <div class="modal-box modal-2xl">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">{{ previewFp.name }}</h3>
            <button @click="previewFp = null" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="bg-gray-100 rounded-lg overflow-hidden">
              <img v-if="previewFp.blob_url" :src="previewFp.blob_url" :alt="previewFp.name" class="w-full h-auto"/>
              <div v-else class="text-center py-12 text-gray-400 text-sm">Loading drawing…</div>
            </div>
            <div v-if="previewFp.areas && previewFp.areas.length" class="mt-3 flex flex-wrap gap-1">
              <span v-for="a in previewFp.areas" :key="a.id"
                    class="inline-block px-2 py-0.5 rounded text-xs font-bold text-white" style="background:#1B4F8C"
                    :title="a.description">{{ a.tag }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  data() {
    return {
      floorplans: [],
      loading: false,
      showModal: false,
      editingFloorplan: null,
      form: { name: '', area_ids: [], file: null },
      saving: false,
      error: '',
      previewFp: null,
    };
  },

  computed: {
    canManage() {
      return this.currentUser && (
        this.currentUser.role === 'ADMIN' || this.currentUser.role === 'PROJECT_OWNER'
      );
    },
  },

  async mounted() {
    await this.load();
  },

  beforeUnmount() {
    this.revokeAllBlobUrls();
  },

  methods: {
    async load() {
      this.loading = true;
      try {
        const list = await API.getFloorplans();
        // Revoke any object URLs from a previous load before replacing.
        this.revokeAllBlobUrls();
        this.floorplans = list.map(fp => ({ ...fp, blob_url: null }));
      } catch (e) {
        console.error('Floorplans load failed:', e);
      } finally {
        this.loading = false;
      }
      // Fetch images with auth headers (an <img src> won't carry the JWT) and
      // hand each row its own object URL.
      this.floorplans.forEach((fp) => this.loadBlobFor(fp));
    },

    async loadBlobFor(fp) {
      if (!fp || fp.blob_url) return;
      try {
        const blob = await API.fetchFloorplanImageBlob(fp.id);
        fp.blob_url = URL.createObjectURL(blob);
      } catch (e) {
        console.error('Floorplan image load failed for #' + fp.id, e);
      }
    },

    revokeAllBlobUrls() {
      (this.floorplans || []).forEach(fp => {
        if (fp && fp.blob_url) {
          try { URL.revokeObjectURL(fp.blob_url); } catch (e) { /* ignore */ }
          fp.blob_url = null;
        }
      });
    },

    formatDate(iso) {
      if (!iso) return '—';
      try {
        const d = new Date(iso);
        return d.toLocaleDateString();
      } catch (e) { return iso; }
    },

    formatSize(bytes) {
      if (!bytes && bytes !== 0) return '';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    openUploadModal() {
      this.editingFloorplan = null;
      this.form = { name: '', area_ids: [], file: null };
      this.error = '';
      this.showModal = true;
      this.$nextTick(() => { if (this.$refs.fileInput) this.$refs.fileInput.value = ''; });
    },

    openEditModal(fp) {
      this.editingFloorplan = fp;
      this.form = {
        name: fp.name,
        area_ids: [...(fp.area_ids || [])],
        file: null,
      };
      this.error = '';
      this.showModal = true;
    },

    closeModal() {
      this.showModal = false;
      this.editingFloorplan = null;
      this.error = '';
    },

    onFileSelected(e) {
      const f = e.target.files && e.target.files[0];
      if (!f) { this.form.file = null; return; }
      const ok = /\.(jpe?g|png)$/i.test(f.name) &&
                 (f.type === 'image/jpeg' || f.type === 'image/png' || f.type === 'image/jpg');
      if (!ok) {
        this.error = 'Only JPG or PNG files are accepted.';
        this.form.file = null;
        e.target.value = '';
        return;
      }
      if (f.size > 25 * 1024 * 1024) {
        this.error = 'File exceeds 25 MB.';
        this.form.file = null;
        e.target.value = '';
        return;
      }
      this.error = '';
      this.form.file = f;
      // Suggest a name from the filename if the user hasn't typed one yet.
      if (!this.form.name.trim()) {
        this.form.name = f.name.replace(/\.(jpe?g|png)$/i, '').replace(/[_-]+/g, ' ').trim();
      }
    },

    async save() {
      if (!this.form.name.trim()) { this.error = 'Name is required.'; return; }
      if (!this.editingFloorplan && !this.form.file) { this.error = 'Please choose a JPG or PNG file.'; return; }
      this.saving = true;
      this.error = '';
      try {
        if (this.editingFloorplan) {
          await API.updateFloorplan(this.editingFloorplan.id, {
            name: this.form.name.trim(),
            area_ids: this.form.area_ids.map(Number),
          });
        } else {
          await API.uploadFloorplan(
            this.form.name.trim(),
            this.form.area_ids.map(Number),
            this.form.file,
          );
        }
        this.closeModal();
        await this.load();
        this.$emit('areas-changed');
      } catch (e) {
        this.error = e.message || 'Save failed';
      } finally {
        this.saving = false;
      }
    },

    async confirmDelete(fp) {
      const linkCount = (fp.areas || []).length;
      const pinCount  = fp.pin_count || 0;
      let extra = '';
      if (linkCount > 0) {
        extra += `\n\nLinked to ${linkCount} area${linkCount === 1 ? '' : 's'} — those areas will be unlinked.`;
      }
      if (pinCount > 0) {
        extra += `\n\n⚠ ${pinCount} record${pinCount === 1 ? '' : 's'} have a pin on this floorplan. Their pin location will be lost.`;
      }
      if (!confirm(`Delete floorplan "${fp.name}"?${extra}`)) return;
      try {
        await API.deleteFloorplan(fp.id);
        await this.load();
        this.$emit('areas-changed');
      } catch (e) {
        alert(e.message || 'Delete failed');
      }
    },

    openPreview(fp) {
      this.previewFp = fp;
    },
  },
});
