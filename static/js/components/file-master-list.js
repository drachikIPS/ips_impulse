// ─────────────────────────────────────────────────────────────────────────────
// File Master List — project-level attachment library
// ─────────────────────────────────────────────────────────────────────────────
app.component('file-master-list-module', {
  props: ['currentUser'],
  emits: ['open-record'],

  data() {
    return {
      attachments: [],
      loading: false,
      filterType: '',
      filterPackage: '',
      filterMeetingType: '',
      filterUploader: '',
      // Viewer
      viewerOpen: false,
      viewerUrl: null,
      viewerName: '',
      viewerIsImage: false,
      viewerLoading: false,
      // Excel export
      xlsxExporting: false,
    };
  },

  computed: {
    isAdminOrOwner() {
      return this.currentUser && ['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role);
    },

    recordTypes() {
      return [
        { value: '',                  label: 'All types' },
        { value: 'meeting_point',     label: 'Meeting Points' },
        { value: 'order',             label: 'Orders' },
        { value: 'invoice',           label: 'Invoices' },
        { value: 'scope_change',      label: 'Scope Changes' },
        { value: 'progress_report',   label: 'Progress Reports' },
        { value: 'task',              label: 'Tasks' },
        { value: 'document',          label: 'Documents' },
        { value: 'procurement_entry', label: 'Procurement' },
        { value: 'itp',               label: 'ITP Records' },
        { value: 'punch',             label: 'Punch Items' },
        { value: 'safety_observation', label: 'Safety Observations' },
        { value: 'incident',          label: 'Safety Incidents' },
        { value: 'safety_toolbox',    label: 'Toolbox Talks' },
        { value: 'daily_report',      label: 'Daily Reports' },
        { value: 'worker',            label: 'Workers' },
        { value: 'floorplan',         label: 'Floorplans' },
        { value: 'report',            label: 'Generated Reports' },
      ];
    },

    packageOptions() {
      const seen = new Set();
      const rest = [];
      for (const a of this.attachments) {
        const pkg = this._pkgFromPath(a.stored_path);
        if (pkg && !seen.has(pkg)) { seen.add(pkg); rest.push({ value: pkg, label: pkg }); }
      }
      rest.sort((a, b) => a.label.localeCompare(b.label));
      return [{ value: '', label: 'All packages' }, ...rest];
    },

    meetingTypeOptions() {
      const seen = new Set();
      const rest = [];
      for (const a of this.attachments) {
        if (a.record_type !== 'meeting_point') continue;
        const mt = this._mtFromPath(a.stored_path);
        if (mt && !seen.has(mt)) { seen.add(mt); rest.push({ value: mt, label: mt }); }
      }
      rest.sort((a, b) => a.label.localeCompare(b.label));
      return [{ value: '', label: 'All meeting types' }, ...rest];
    },

    uploaderOptions() {
      const seen = new Set();
      const rest = [];
      for (const a of this.attachments) {
        const u = a.uploaded_by_name;
        if (u && !seen.has(u)) { seen.add(u); rest.push({ value: u, label: u }); }
      }
      rest.sort((a, b) => a.label.localeCompare(b.label));
      return [{ value: '', label: 'All uploaders' }, ...rest];
    },

    filtered() {
      return this.attachments.filter(a => {
        if (this.filterType && a.record_type !== this.filterType) return false;
        if (this.filterPackage) {
          if (this._pkgFromPath(a.stored_path) !== this.filterPackage) return false;
        }
        if (this.filterMeetingType) {
          if (a.record_type !== 'meeting_point') return false;
          if (this._mtFromPath(a.stored_path) !== this.filterMeetingType) return false;
        }
        if (this.filterUploader && a.uploaded_by_name !== this.filterUploader) return false;
        return true;
      });
    },

    totalSize() {
      return this.filtered.reduce((s, a) => s + (a.file_size || 0), 0);
    },
  },

  async mounted() {
    await this.load();
  },

  beforeUnmount() {
    if (this.viewerUrl) URL.revokeObjectURL(this.viewerUrl);
  },

  methods: {
    _pkgFromPath(stored_path) {
      // stored_path: "ProjectNum/PackageTag/..." or "ProjectNum/Meetings/..." or "ProjectNum/Procurement/..."
      const parts = (stored_path || '').split('/');
      const seg = parts[1] || '';
      if (seg === 'Meetings' || seg === 'Procurement') return '';
      return seg;
    },

    _mtFromPath(stored_path) {
      // "ProjectNum/Meetings/TypeName/..."
      const parts = (stored_path || '').split('/');
      if (parts[1] === 'Meetings') return parts[2] || '';
      return '';
    },

    async load() {
      this.loading = true;
      try {
        this.attachments = await API.getAllAttachments();
      } catch (e) {
        console.error(e);
      } finally {
        this.loading = false;
      }
    },

    async remove(att) {
      if (!confirm(`Delete "${att.original_filename}"? This cannot be undone.`)) return;
      try {
        if (att.source === 'floorplan') {
          await API.deleteFloorplan(att.id);
        } else if (att.source === 'report') {
          await API.deleteReport(att.id);
        } else {
          await API.deleteAttachment(att.id);
        }
        this.attachments = this.attachments.filter(a => a.key !== att.key);
      } catch (e) { alert(e.message || 'Delete failed'); }
    },

    canPreview(att) {
      // Reports are downloaded only — they often skip inline preview because
      // some browsers can't render very large generated PDFs reliably.
      if (att.source === 'report') return false;
      const ct = att.content_type || '';
      return ct === 'application/pdf' || ct.startsWith('image/') || ct.startsWith('text/');
    },

    canDelete(att) {
      // Floorplans must be deleted from the Areas → Floorplans tab so that
      // dependent pin overlays and area links are cleaned up consistently.
      return this.isAdminOrOwner && att.source !== 'floorplan';
    },

    async openViewer(att) {
      this.viewerLoading = true;
      this.viewerOpen = true;
      this.viewerName = att.original_filename;
      this.viewerUrl = null;
      this.viewerIsImage = (att.content_type || '').startsWith('image/');
      try {
        const blob = await API.fetchFileRowBlob(att, true);
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
        const blob = await API.fetchFileRowBlob(att, false);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = att.original_filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      } catch (e) { alert('Download failed: ' + e.message); }
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

    fmtDate(iso) { return fmtTimestamp(iso); },

    typeBadgeClass(rt) {
      const m = {
        meeting_point:     'bg-blue-100 text-blue-700',
        order:             'bg-indigo-100 text-indigo-700',
        invoice:           'bg-orange-100 text-orange-700',
        scope_change:      'bg-purple-100 text-purple-700',
        progress_report:   'bg-teal-100 text-teal-700',
        task:              'bg-cyan-100 text-cyan-700',
        document:          'bg-green-100 text-green-700',
        procurement_entry: 'bg-yellow-100 text-yellow-700',
        itp:               'bg-emerald-100 text-emerald-700',
        punch:             'bg-amber-100 text-amber-700',
        safety_observation:'bg-pink-100 text-pink-700',
        incident:          'bg-red-100 text-red-700',
        safety_toolbox:    'bg-rose-100 text-rose-700',
        daily_report:      'bg-lime-100 text-lime-700',
        worker:            'bg-slate-100 text-slate-700',
        floorplan:         'bg-sky-100 text-sky-700',
        report:            'bg-stone-200 text-stone-700',
      };
      return m[rt] || 'bg-gray-100 text-gray-600';
    },

    openRecord(att) {
      this.$emit('open-record', { record_type: att.record_type, record_id: att.record_id });
    },

    async exportFilesToExcel() {
      this.xlsxExporting = true;
      try { await API.exportAllFilesXlsx(this.filterType || ''); }
      catch (e) { alert('Export failed: ' + (e.message || '')); }
      finally { this.xlsxExporting = false; }
    },
  },

  template: `
<div>
  <!-- Filters toolbar -->
  <div class="flex flex-wrap items-center gap-2 mb-4">
    <select v-model="filterType" class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
      <option v-for="t in recordTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
    </select>
    <select v-model="filterPackage" class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
      <option v-for="p in packageOptions" :key="p.value" :value="p.value">{{ p.label }}</option>
    </select>
    <select v-if="!filterType || filterType === 'meeting_point'" v-model="filterMeetingType"
      class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
      <option v-for="m in meetingTypeOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
    </select>
    <select v-model="filterUploader" class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
      <option v-for="u in uploaderOptions" :key="u.value" :value="u.value">{{ u.label }}</option>
    </select>
    <button @click="load" class="btn-secondary text-sm">Refresh</button>
    <button @click="exportFilesToExcel" :disabled="xlsxExporting"
      class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
      </svg>
      {{ xlsxExporting ? 'Exporting...' : 'Export Excel' }}
    </button>
    <span class="ml-auto text-xs text-gray-400">
      {{ filtered.length }} file{{ filtered.length !== 1 ? 's' : '' }} · {{ fmtSize(totalSize) }} total
    </span>
  </div>

  <!-- Table -->
  <div v-if="loading" class="text-center py-10 text-gray-400"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
  <div v-else-if="filtered.length === 0" class="card text-center py-10 text-gray-400">
    No files found.
  </div>
  <div v-else class="card p-0 overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <th class="text-left px-4 py-3 w-64">File</th>
          <th class="text-left px-4 py-3 w-40">Type</th>
          <th class="text-left px-4 py-3 w-40">Linked Record</th>
          <th class="text-left px-4 py-3 w-52">Path</th>
          <th class="text-left px-4 py-3 w-20">Size</th>
          <th class="text-left px-4 py-3 w-32">Uploaded</th>
          <th class="text-left px-4 py-3 w-28">By</th>
          <th class="px-4 py-3 w-24"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100">
        <tr v-for="att in filtered" :key="att.key || att.id"
          class="hover:bg-gray-50 transition-colors cursor-pointer"
          @click.self="openRecord(att)">
          <td class="px-4 py-2.5 w-64" @click="openRecord(att)">
            <div class="flex items-center gap-2">
              <span class="text-base shrink-0">{{ fileIcon(att) }}</span>
              <span class="font-medium text-gray-800 truncate max-w-[220px]" :title="att.original_filename">
                {{ att.original_filename }}
              </span>
            </div>
          </td>
          <td class="px-4 py-2.5 w-40" @click="openRecord(att)">
            <span :class="['text-xs font-semibold px-2 py-0.5 rounded-full', typeBadgeClass(att.record_type)]">
              {{ att.record_type_label }}
            </span>
          </td>
          <td class="px-4 py-2.5 w-40 text-xs text-gray-600 truncate" :title="att.record_ref" @click="openRecord(att)">
            {{ att.record_ref }}
          </td>
          <td class="px-4 py-2.5 w-52 text-xs text-gray-400 font-mono truncate max-w-[13rem]" :title="att.stored_path" @click="openRecord(att)">
            {{ att.stored_path }}
          </td>
          <td class="px-4 py-2.5 text-xs text-gray-500" @click="openRecord(att)">{{ fmtSize(att.file_size) }}</td>
          <td class="px-4 py-2.5 text-xs text-gray-500" @click="openRecord(att)">{{ fmtDate(att.uploaded_at) }}</td>
          <td class="px-4 py-2.5 text-xs text-gray-500" @click="openRecord(att)">{{ att.uploaded_by_name || '—' }}</td>
          <td class="px-4 py-2.5 text-right">
            <div class="flex items-center gap-1 justify-end">
              <button v-if="canPreview(att)" @click.stop="openViewer(att)"
                class="btn-icon text-gray-400 hover:text-ips-blue" title="View">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
              </button>
              <button @click.stop="download(att)" class="btn-icon text-gray-400 hover:text-ips-blue" title="Download">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
              </button>
              <button v-if="canDelete(att)" @click.stop="remove(att)"
                class="btn-icon text-gray-300 hover:text-red-500" title="Delete">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Viewer Modal -->
  <div v-if="viewerOpen" class="modal-overlay" style="z-index:9999" @click.self="closeViewer">
    <div class="modal-box" style="max-width:90vw;width:90vw;max-height:92vh;height:92vh;display:flex;flex-direction:column;padding:0">
      <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-200 shrink-0">
        <span class="font-medium text-gray-800 truncate flex-1 text-sm">{{ viewerName }}</span>
        <button @click="closeViewer" class="text-gray-400 hover:text-gray-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
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
