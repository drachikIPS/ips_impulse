// ─────────────────────────────────────────────────────────────────────────────
// Organization Chart — isolated component (uses Mermaid.js CDN)
// To remove: delete this file, its <script> tag in index.html, and the tab
// button in contacts.js.
// ─────────────────────────────────────────────────────────────────────────────
app.component('org-chart-module', {
  props: ['currentUser', 'contacts', 'currentProject'],
  emits: ['open-contact'],
  template: `
    <div>
      <!-- Toolbar -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <select v-model="layoutDir" class="input-field w-40" @change="renderChart">
            <option value="TD">Top → Down</option>
            <option value="LR">Left → Right</option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <button v-if="links.length > 0" @click="exportImage" :disabled="exporting" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            {{ exporting ? 'Exporting...' : 'Export Image' }}
          </button>
          <button v-if="links.length > 0" @click="exportPdf" :disabled="exportingPdf" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            {{ exportingPdf ? 'Exporting...' : 'Export PDF' }}
          </button>
          <button v-if="canManage" @click="showAddModal = true" class="btn-primary text-sm">
            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Add Link
          </button>
        </div>
      </div>

      <!-- Chart -->
      <div class="card p-4">
        <div v-if="loading" class="text-center py-8"><img src="/static/assets/impulse-loader.svg" class="h-8 mx-auto" alt="Loading"/></div>
        <div v-else-if="links.length === 0" class="text-center py-12 text-gray-400">
          <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          <p>No organization links defined yet.</p>
          <p class="text-sm mt-1">Add links to build the organization chart.</p>
        </div>
        <div v-else>
          <div ref="mermaidContainer" class="mermaid-chart"></div>
        </div>
      </div>

      <!-- Legend -->
      <div v-if="links.length > 0" class="card p-4 mt-4">
        <div class="flex flex-wrap gap-x-8 gap-y-3">
          <!-- Role colors -->
          <div>
            <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Roles</p>
            <div class="flex flex-wrap gap-2">
              <span class="inline-flex items-center gap-1.5 text-xs">
                <span class="w-3 h-3 rounded" style="background:#F3E8FF;border:1.5px solid #7C3AED"></span> Project Owner
              </span>
              <span class="inline-flex items-center gap-1.5 text-xs">
                <span class="w-3 h-3 rounded" style="background:#DBEAFE;border:1.5px solid #2563EB"></span> Project Team
              </span>
              <span class="inline-flex items-center gap-1.5 text-xs">
                <span class="w-3 h-3 rounded" style="background:#DCFCE7;border:1.5px solid #16A34A"></span> Client
              </span>
              <span class="inline-flex items-center gap-1.5 text-xs">
                <span class="w-3 h-3 rounded" style="background:#FEE2E2;border:1.5px solid #DC2626"></span> Vendor
              </span>
              <span class="inline-flex items-center gap-1.5 text-xs">
                <span class="w-3 h-3 rounded" style="background:#F3F4F6;border:1.5px solid #6B7280"></span> No role
              </span>
            </div>
            <div class="flex gap-4 mt-2 text-xs text-gray-500">
              <span class="inline-flex items-center gap-1.5"><span style="display:inline-block;width:20px;height:2px;background:#1B4F8C"></span> Line</span>
              <span class="inline-flex items-center gap-1.5"><span style="display:inline-block;width:20px;height:0;border-top:2px dashed #1B4F8C"></span> Staff</span>
            </div>
          </div>
          <!-- Packages -->
          <div v-if="packages.length > 0">
            <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Packages</p>
            <div class="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
              <div v-for="pkg in packages" :key="pkg.id" class="flex items-baseline gap-1.5">
                <span class="font-bold text-gray-700 shrink-0">{{ pkg.tag_number }}</span>
                <span class="text-gray-500 truncate">{{ pkg.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Links table -->
      <div v-if="links.length > 0" class="card p-0 overflow-hidden mt-4">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Person</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Function</th>
              <th class="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Relation</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reports To</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Function</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in links" :key="l.id" class="border-b border-gray-100 hover:bg-gray-50">
              <td class="px-4 py-3 font-medium text-gray-800">{{ l.contact_name }}</td>
              <td class="px-4 py-3 text-gray-500">{{ l.contact_function || '—' }}</td>
              <td class="px-4 py-3 text-center">
                <span v-if="canManage" @click="toggleRelation(l)" class="cursor-pointer">
                  <span v-if="l.relation_type === 'LINE'" class="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Line</span>
                  <span v-else class="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">Staff</span>
                </span>
                <span v-else>
                  <span v-if="l.relation_type === 'LINE'" class="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Line</span>
                  <span v-else class="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">Staff</span>
                </span>
              </td>
              <td class="px-4 py-3 font-medium text-gray-800">{{ l.reports_to_name }}</td>
              <td class="px-4 py-3 text-gray-500">{{ l.reports_to_function || '—' }}</td>
              <td class="px-4 py-3 text-right">
                <button v-if="canManage" @click="deleteLink(l)" class="btn-icon text-gray-400 hover:text-red-500" title="Delete">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Add Link Modal -->
      <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
        <div class="modal-box">
          <div class="modal-header">
            <h3 class="text-lg font-semibold text-gray-800">Add Organization Link</h3>
            <button @click="showAddModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="modal-body space-y-4">
            <div>
              <label class="form-label">Person <span class="text-red-500">*</span></label>
              <select v-model="form.contact_id" class="input-field">
                <option :value="null">Select contact...</option>
                <option v-for="c in sortedContacts" :key="c.id" :value="c.id">{{ c.name }} — {{ c.function || c.company || '' }}</option>
              </select>
            </div>
            <div>
              <label class="form-label">Reports To <span class="text-red-500">*</span></label>
              <select v-model="form.reports_to_id" class="input-field">
                <option :value="null">Select contact...</option>
                <option v-for="c in sortedContacts" :key="c.id" :value="c.id" :disabled="c.id === form.contact_id">{{ c.name }} — {{ c.function || c.company || '' }}</option>
              </select>
            </div>
            <div>
              <label class="form-label">Relation Type</label>
              <div class="flex gap-3 mt-1">
                <button @click="form.relation_type = 'LINE'"
                  :class="['flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all',
                    form.relation_type === 'LINE' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500']">
                  Line (direct authority)
                </button>
                <button @click="form.relation_type = 'STAFF'"
                  :class="['flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all',
                    form.relation_type === 'STAFF' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500']">
                  Staff (advisory)
                </button>
              </div>
            </div>
            <p v-if="formError" class="text-red-500 text-sm">{{ formError }}</p>
          </div>
          <div class="modal-footer">
            <button @click="showAddModal = false" class="btn-secondary">Cancel</button>
            <button @click="saveLink" :disabled="saving" class="btn-primary">
              {{ saving ? 'Saving...' : 'Add Link' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,

  data() {
    return {
      links: [],
      packages: [],
      loading: false,
      layoutDir: 'TD',
      showAddModal: false,
      form: { contact_id: null, reports_to_id: null, relation_type: 'LINE' },
      formError: '',
      saving: false,
      exporting: false,
      exportingPdf: false,
    };
  },

  computed: {
    canManage() {
      return this.currentUser && ['ADMIN', 'PROJECT_OWNER'].includes(this.currentUser.role);
    },
    sortedContacts() {
      return [...(this.contacts || [])].sort((a, b) => a.name.localeCompare(b.name));
    },
    // Build lookup: contact_id -> { role, packages: [{tag, company}] }
    contactInfo() {
      const info = {};
      // Role from contacts prop
      (this.contacts || []).forEach(c => {
        info[c.id] = { role: c.project_role || null, packages: [] };
      });
      // Package links
      (this.packages || []).forEach(pkg => {
        const addPkg = (cid) => {
          if (!cid || !info[cid]) return;
          info[cid].packages.push({ tag: pkg.tag_number, company: pkg.company || '' });
        };
        addPkg(pkg.package_owner_id);
        (pkg.contact_ids || []).forEach(cid => addPkg(cid));
      });
      return info;
    },
  },

  async mounted() {
    await this.loadLinks();
  },

  methods: {
    async loadLinks() {
      this.loading = true;
      try {
        const [links, packages] = await Promise.all([
          API.getOrgChartLinks(),
          API.getPackages(),
        ]);
        this.links = links;
        this.packages = packages;
        this.$nextTick(() => this.renderChart());
      } catch (e) {
        console.error('Failed to load org chart data:', e);
      } finally {
        this.loading = false;
      }
    },

    _escLabel(s) {
      return (s || '').replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');
    },

    buildMermaidCode() {
      const lines = [`graph ${this.layoutDir}`];

      // Role -> Mermaid style (background color matching role badges)
      const roleStyles = {
        PROJECT_OWNER: { fill: '#F3E8FF', stroke: '#7C3AED', color: '#6B21A8' },
        PROJECT_TEAM:  { fill: '#DBEAFE', stroke: '#2563EB', color: '#1E40AF' },
        CLIENT:        { fill: '#DCFCE7', stroke: '#16A34A', color: '#166534' },
        VENDOR:        { fill: '#FEE2E2', stroke: '#DC2626', color: '#991B1B' },
        BIDDER:        { fill: '#FEF3C7', stroke: '#D97706', color: '#92400E' },
      };
      const defaultStyle = { fill: '#F3F4F6', stroke: '#6B7280', color: '#374151' };

      // Collect all unique contacts involved
      const contactIds = new Set();
      this.links.forEach(l => { contactIds.add(l.contact_id); contactIds.add(l.reports_to_id); });

      // Node definitions with role color + package info
      const styleClasses = [];
      contactIds.forEach(cid => {
        const link = this.links.find(l => l.contact_id === cid) || this.links.find(l => l.reports_to_id === cid);
        let name, func;
        if (link.contact_id === cid) {
          name = link.contact_name; func = link.contact_function;
        } else {
          name = link.reports_to_name; func = link.reports_to_function;
        }

        const ci = this.contactInfo[cid] || { role: null, packages: [] };
        const esc = this._escLabel;

        // Build label: name, function, then packages (tag + company on separate lines)
        const trunc = (s, n) => s && s.length > n ? s.substring(0, n) + '…' : s;
        let label = `<b>${esc(name)}</b>`;
        if (func) label += `<br/><small>${esc(trunc(func, 30))}</small>`;
        // Show unique packages — tag and company each on own line
        const uniquePkgs = [];
        const seen = new Set();
        ci.packages.forEach(p => {
          if (!seen.has(p.tag)) { seen.add(p.tag); uniquePkgs.push(p); }
        });
        if (uniquePkgs.length > 0) {
          uniquePkgs.forEach(p => {
            label += `<br/><small><b>${esc(p.tag)}</b></small>`;
            if (p.company) label += `<br/><small>${esc(trunc(p.company, 25))}</small>`;
          });
        }

        lines.push('  c' + cid + '["' + label + '"]');

        // Assign style class per role
        const rs = roleStyles[ci.role] || defaultStyle;
        styleClasses.push(`style c${cid} fill:${rs.fill},stroke:${rs.stroke},color:${rs.color}`);
      });

      // Edges
      this.links.forEach(l => {
        if (l.relation_type === 'STAFF') {
          lines.push(`  c${l.reports_to_id} -.-o c${l.contact_id}`);
        } else {
          lines.push(`  c${l.reports_to_id} --> c${l.contact_id}`);
        }
      });

      // Append style directives
      styleClasses.forEach(s => lines.push('  ' + s));

      // NOTE: We used to emit Mermaid `click ... call orgChartOpenContact(...)`
      // directives here, but those fire through Mermaid's internal handler and
      // are eaten by the foreignObject HTML content (the bold name, <small>
      // function, etc) before they reach the Mermaid listener — so clicks
      // never triggered the modal. We now attach a delegated DOM listener in
      // renderChart() after the SVG is injected. It survives any foreignObject
      // label and also works when the user clicks the package tag, the name,
      // or the surrounding node shape.

      return lines.join('\n');
    },

    async renderChart() {
      if (!this.links.length) return;
      const container = this.$refs.mermaidContainer;
      if (!container) return;
      if (typeof mermaid === 'undefined') {
        container.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">Mermaid library not loaded.</p>';
        return;
      }
      const code = this.buildMermaidCode();
      try {
        const { svg } = await mermaid.render('orgchart-' + Date.now(), code);
        container.innerHTML = svg;
        // Make the SVG responsive
        const svgEl = container.querySelector('svg');
        if (svgEl) {
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
        }
        // Delegated click — reliably opens the contact modal regardless of
        // whether the click lands on the SVG shape or the foreignObject HTML.
        // Mermaid tags every node group with an id like
        // "flowchart-c<contact_id>-<N>" (our buildMermaidCode uses c<cid>).
        // Parse the contact id out of that, emit `open-contact`.
        this._attachOrgClicks(container);
      } catch (e) {
        console.error('Mermaid render error:', e);
        container.innerHTML = '<p class="text-red-400 text-sm text-center py-4">Failed to render chart. Check console for details.</p>';
      }
    },

    _attachOrgClicks(container) {
      // Tag every Mermaid node <g> with data-contact-id = its numeric id.
      // Mermaid writes our node name ("c123") into the group's id and/or
      // class. Pulling the id from there lets us bind regardless of the
      // exact Mermaid version / id template.
      container.querySelectorAll('g.node').forEach(g => {
        let cid = null;
        const idStr   = g.id || '';
        const classes = g.getAttribute('class') || '';
        let m = /c(\d+)/.exec(idStr) || /c(\d+)/.exec(classes);
        if (!m) {
          const inner = g.querySelector('[id^="flowchart-c"], [class*="c"]');
          if (inner) m = /c(\d+)/.exec(inner.id || inner.getAttribute('class') || '');
        }
        if (m) {
          cid = Number(m[1]);
          g.setAttribute('data-contact-id', String(cid));
          g.style.cursor = 'pointer';
        }
      });

      // Delegated click: any click inside a tagged node group opens the contact.
      if (this._orgClickHandler) {
        container.removeEventListener('click', this._orgClickHandler, true);
      }
      this._orgClickHandler = (ev) => {
        let el = ev.target;
        while (el && el !== container) {
          if (el.getAttribute && el.getAttribute('data-contact-id')) break;
          el = el.parentElement || el.parentNode;
        }
        if (!el || el === container) return;
        const cid = Number(el.getAttribute('data-contact-id'));
        if (!cid) return;
        ev.preventDefault();
        ev.stopPropagation();
        this.$emit('open-contact', cid);
      };
      container.addEventListener('click', this._orgClickHandler, true);
    },

    async saveLink() {
      if (!this.form.contact_id || !this.form.reports_to_id) {
        this.formError = 'Both fields are required.';
        return;
      }
      this.saving = true;
      this.formError = '';
      try {
        await API.createOrgChartLink(this.form);
        this.showAddModal = false;
        this.form = { contact_id: null, reports_to_id: null, relation_type: 'LINE' };
        await this.loadLinks();
      } catch (e) {
        this.formError = e.message || 'Failed to create link.';
      } finally {
        this.saving = false;
      }
    },

    async toggleRelation(l) {
      const newType = l.relation_type === 'LINE' ? 'STAFF' : 'LINE';
      try {
        await API.updateOrgChartLink(l.id, { relation_type: newType });
        await this.loadLinks();
      } catch (e) {
        alert(e.message || 'Failed to update.');
      }
    },

    // Rasterize the Mermaid SVG directly via the browser's native SVG
    // renderer. Mermaid uses <foreignObject> with HTML in labels — html2canvas
    // does not render foreignObject reliably and tends to truncate text
    // because it measures the HTML layout at a different scale than the SVG.
    // Serializing the SVG + loading into an <img> bypasses that issue, and
    // captures the chart at its intrinsic size (so frames match what's on
    // screen regardless of CSS max-width: 100%).
    async _captureChartCanvas() {
      const container = this.$refs.mermaidContainer;
      if (!container) return null;
      const svg = container.querySelector('svg');
      if (!svg) return null;

      // Intrinsic size: prefer viewBox, fall back to bounding box.
      let w, h;
      const vb = svg.viewBox && svg.viewBox.baseVal;
      if (vb && vb.width && vb.height) {
        w = vb.width;
        h = vb.height;
      } else {
        const bbox = svg.getBoundingClientRect();
        w = bbox.width;
        h = bbox.height;
      }
      w = Math.ceil(w);
      h = Math.ceil(h);

      // Clone so we can force explicit width/height without mutating the
      // live DOM (and with xmlns attributes needed for blob rendering).
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      clone.style.maxWidth = 'none';
      clone.style.width = w + 'px';
      clone.style.height = h + 'px';

      // Strip external references (@import, url()) from any <style> blocks.
      clone.querySelectorAll('style').forEach(styleEl => {
        let css = styleEl.textContent || '';
        css = css.replace(/@import[^;]+;/g, '');
        css = css.replace(/url\([^)]*\)/g, 'none');
        styleEl.textContent = css;
      });
      clone.querySelectorAll('link').forEach(l => l.remove());

      // Replace every <foreignObject> with native SVG <text>. Chromium
      // unconditionally taints any canvas rasterized from an SVG that
      // contains foreignObject, which breaks toDataURL() regardless of
      // content origin. Mermaid renders node labels this way — so to keep
      // the chart exportable, we serialize each label into plain SVG text
      // lines (preserving <br/> breaks and bold/small styling as best we can).
      const SVG_NS = 'http://www.w3.org/2000/svg';
      clone.querySelectorAll('foreignObject').forEach(fo => {
        const foW = parseFloat(fo.getAttribute('width'))  || 0;
        const foH = parseFloat(fo.getAttribute('height')) || 0;
        const foX = parseFloat(fo.getAttribute('x'))      || 0;
        const foY = parseFloat(fo.getAttribute('y'))      || 0;

        // Walk the HTML content and build a list of { text, bold, small } lines.
        const lines = [{ text: '', bold: false, small: false }];
        const walk = (node, bold, small) => {
          if (node.nodeType === 3) { // text
            const t = node.nodeValue.replace(/\s+/g, ' ');
            if (t) {
              const cur = lines[lines.length - 1];
              cur.text += t;
              cur.bold = cur.bold || bold;
              cur.small = cur.small || small;
            }
            return;
          }
          if (node.nodeType !== 1) return;
          const tag = node.tagName.toLowerCase();
          if (tag === 'br') { lines.push({ text: '', bold: false, small: false }); return; }
          const b = bold  || tag === 'b' || tag === 'strong';
          const s = small || tag === 'small';
          // Block-level elements force a line break before and after
          const block = ['div', 'p'].includes(tag);
          if (block && lines[lines.length - 1].text) {
            lines.push({ text: '', bold: false, small: false });
          }
          for (const c of node.childNodes) walk(c, b, s);
          if (block) lines.push({ text: '', bold: false, small: false });
        };
        for (const c of fo.childNodes) walk(c, false, false);

        const clean = lines
          .map(l => ({ ...l, text: l.text.trim() }))
          .filter(l => l.text);
        if (clean.length === 0) { fo.remove(); return; }

        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
        text.setAttribute('font-size', '13');
        text.setAttribute('fill', '#1F2937');

        const cx = foX + foW / 2;
        const lineH = 14;
        // Centre the block vertically inside the foreignObject's rect
        const totalH = clean.length * lineH;
        const startY = foY + foH / 2 - totalH / 2 + lineH / 2;

        clean.forEach((ln, i) => {
          const tspan = document.createElementNS(SVG_NS, 'tspan');
          tspan.setAttribute('x', cx);
          tspan.setAttribute('y', startY + i * lineH);
          if (ln.bold) tspan.setAttribute('font-weight', '700');
          if (ln.small) tspan.setAttribute('font-size', '10');
          tspan.textContent = ln.text;
          text.appendChild(tspan);
        });

        fo.parentNode.insertBefore(text, fo);
        fo.parentNode.removeChild(fo);
      });

      const svgString = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      try {
        const img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = url;
        });
        const scale = 2; // high-DPI for crisp text
        const canvas = document.createElement('canvas');
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas;
      } finally {
        URL.revokeObjectURL(url);
      }
    },

    async exportImage() {
      const container = this.$refs.mermaidContainer;
      if (!container) return;
      this.exporting = true;
      try {
        const canvas = await this._captureChartCanvas();
        if (!canvas) throw new Error('Chart not available');
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = 'organization_chart.png';
        a.click();
      } catch (e) {
        alert(e.message || 'Export failed');
      } finally {
        this.exporting = false;
      }
    },

    _loadImageDataUrl(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve({ dataUrl: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = reject;
        img.src = src;
      });
    },

    async exportPdf() {
      const container = this.$refs.mermaidContainer;
      if (!container) return;
      if (typeof window.jspdf === 'undefined') { alert('jsPDF library not loaded.'); return; }
      this.exportingPdf = true;
      try {
        // Same starting point as exportImage: rasterize the chart SVG directly
        const chartCanvas = await this._captureChartCanvas();
        if (!chartCanvas) throw new Error('Chart not available');
        const chartDataUrl = chartCanvas.toDataURL('image/png');

        // A1 landscape: 841 x 594 mm
        const { jsPDF } = window.jspdf;
        const pageW = 841, pageH = 594;
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a1' });

        // Fit chart proportionally to the page with a small inner margin, so
        // the pyramid-shape chart leaves space at top-left and top-right for
        // the title block and legend overlays.
        const margin = 10;
        const availW = pageW - margin * 2;
        const availH = pageH - margin * 2;
        const chartRatio = chartCanvas.width / chartCanvas.height;
        const pageRatio = availW / availH;
        let drawW, drawH;
        if (chartRatio >= pageRatio) { drawW = availW; drawH = availW / chartRatio; }
        else                          { drawH = availH; drawW = availH * chartRatio; }
        const drawX = (pageW - drawW) / 2;
        const drawY = (pageH - drawH) / 2;
        pdf.addImage(chartDataUrl, 'PNG', drawX, drawY, drawW, drawH);

        // ── Top-left overlay: logo + client + project ─────────────────────
        const topLeftX = margin + 5;
        const topLeftY = margin + 5;
        try {
          const logo = await this._loadImageDataUrl('/static/assets/impulse-logo-light.png');
          const logoW = 75; // +50% vs original 50mm
          const logoH = logoW * (logo.h / logo.w);
          pdf.addImage(logo.dataUrl, 'PNG', topLeftX, topLeftY, logoW, logoH);
          var textY = topLeftY + logoH + 9;
        } catch (e) {
          var textY = topLeftY + 9;
        }
        const proj = this.currentProject || {};
        pdf.setTextColor(27, 79, 140); // ips-blue
        pdf.setFontSize(24); // +50% vs 16
        pdf.setFont('helvetica', 'bold');
        pdf.text(proj.client || '—', topLeftX, textY);
        textY += 11;
        pdf.setFontSize(18); // +50% vs 12
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(55, 65, 81);
        if (proj.project_number) {
          pdf.text(proj.project_number, topLeftX, textY);
          textY += 9;
        }
        if (proj.description) {
          const descLines = pdf.splitTextToSize(proj.description, 135); // +50% wrap width
          pdf.text(descLines, topLeftX, textY);
          textY += 9 * descLines.length;
        } else {
          textY += 4;
        }
        // Print date (just below the description)
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(14);
        pdf.setTextColor(107, 114, 128);
        const printDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        pdf.text('Printed: ' + printDate, topLeftX, textY);

        // ── Top-right overlay: legend (left column) + packages (right column)
        // Dimensions scaled +30% vs baseline.
        const legendColW = 78;
        const packagesColW = 117;
        const gap = 10;
        const blockW = legendColW + gap + packagesColW;
        const legendX = pageW - margin - blockW - 5;
        const packagesX = legendX + legendColW + gap;
        const topY = margin + 5;

        // Legend column
        let legendY = topY;
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(107, 114, 128);
        pdf.text('LEGEND', legendX, legendY);
        legendY += 8;

        const roles = [
          { label: 'Project Owner', fill: [243, 232, 255], stroke: [124, 58, 237] },
          { label: 'Project Team',  fill: [219, 234, 254], stroke: [37, 99, 235]  },
          { label: 'Client',        fill: [220, 252, 231], stroke: [22, 163, 74]  },
          { label: 'Vendor',        fill: [254, 226, 226], stroke: [220, 38, 38]  },
          { label: 'No role',       fill: [243, 244, 246], stroke: [107, 114, 128]},
        ];
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(13);
        pdf.setTextColor(55, 65, 81);
        roles.forEach(r => {
          pdf.setFillColor(r.fill[0], r.fill[1], r.fill[2]);
          pdf.setDrawColor(r.stroke[0], r.stroke[1], r.stroke[2]);
          pdf.setLineWidth(0.5);
          pdf.rect(legendX, legendY - 4.5, 6.5, 5.2, 'FD');
          pdf.text(r.label, legendX + 10, legendY);
          legendY += 8;
        });

        // Line vs Staff
        legendY += 2;
        pdf.setDrawColor(27, 79, 140);
        pdf.setLineWidth(0.8);
        pdf.line(legendX, legendY - 2, legendX + 13, legendY - 2);
        pdf.text('Line', legendX + 17, legendY);
        legendY += 8;
        pdf.setLineDashPattern([1.6, 1.6], 0);
        pdf.line(legendX, legendY - 2, legendX + 13, legendY - 2);
        pdf.setLineDashPattern([], 0);
        pdf.text('Staff', legendX + 17, legendY);

        // Packages column (sits to the right of the legend)
        if (this.packages && this.packages.length > 0) {
          let pkgY = topY;
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.setTextColor(107, 114, 128);
          pdf.text('PACKAGES', packagesX, pkgY);
          pkgY += 8;
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(12);
          pdf.setTextColor(55, 65, 81);
          this.packages.forEach(p => {
            if (pkgY > pageH - margin - 10) return;
            const tagW = 23;
            pdf.setFont('helvetica', 'bold');
            pdf.text(p.tag_number || '', packagesX, pkgY);
            pdf.setFont('helvetica', 'normal');
            const nameLines = pdf.splitTextToSize(p.name || '', packagesColW - tagW);
            pdf.text(nameLines, packagesX + tagW, pkgY);
            pkgY += 5 * Math.max(1, nameLines.length);
          });
        }

        const name = (proj.project_number || 'organization_chart') + '.pdf';
        pdf.save(name);
      } catch (e) {
        console.error(e);
        alert(e.message || 'PDF export failed');
      } finally {
        this.exportingPdf = false;
      }
    },

    async deleteLink(l) {
      if (!confirm(`Remove link: ${l.contact_name} → ${l.reports_to_name}?`)) return;
      try {
        await API.deleteOrgChartLink(l.id);
        await this.loadLinks();
      } catch (e) {
        alert(e.message || 'Failed to delete.');
      }
    },
  },
});
