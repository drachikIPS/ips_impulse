// ─────────────────────────────────────────────────────────────────────────────
// Reusable floorplan pin picker.
// Full-screen modal that loads a floorplan image, lets the user place a single
// pin (tap/click), pan (drag), pinch-zoom on tablet, and zoom via mouse wheel
// or +/− buttons on desktop. Emits normalized 0..1 coordinates.
//
// Usage:
//   <floorplan-pin-picker
//      :floorplan-id="123"
//      :floorplan-name="'Ground floor'"
//      :initial-x="0.42" :initial-y="0.71"
//      @save="onPinSave" @clear="onPinClear" @cancel="onPinCancel"/>
//
//   onPinSave({ x, y })     — normalized 0..1 each
//   onPinClear()            — user wiped the pin
//   onPinCancel()           — user dismissed without changes
// ─────────────────────────────────────────────────────────────────────────────
app.component('floorplan-pin-picker', {
  props: {
    floorplanId:   { type: Number, required: true },
    floorplanName: { type: String, default: '' },
    initialX:      { type: Number, default: null },
    initialY:      { type: Number, default: null },
  },
  emits: ['save', 'clear', 'cancel'],

  data() {
    return {
      blobUrl: null,
      loading: true,
      loadError: '',

      imgW: 0,
      imgH: 0,
      vpW: 0,
      vpH: 0,

      // View transform: image is drawn at (tx,ty) scaled by `scale`.
      scale: 1,
      tx: 0,
      ty: 0,

      // Pin in normalized image coords (0..1). null = no pin.
      pinX: null,
      pinY: null,

      // Pointer / gesture tracking
      pointers: new Map(),    // id → {x,y}
      mode: 'idle',           // 'idle' | 'pan' | 'pinch'
      panStart: null,         // {x,y,tx0,ty0}
      pinchStart: null,       // {dist, scale0, mid:{x,y}, ipx,ipy}
      tapStart: null,         // {x,y,t} for distinguishing tap vs pan

      // Once true, save is enabled (the user has placed/moved a pin).
      dirty: false,
    };
  },

  computed: {
    hasPin() { return this.pinX != null && this.pinY != null; },
    imgStyle() {
      return {
        transform: `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`,
        transformOrigin: '0 0',
        userSelect: 'none',
        pointerEvents: 'none',
        position: 'absolute',
        top: 0, left: 0,
        // Tailwind preflight applies `max-width: 100%; height: auto` to every
        // <img>; without overriding it the IMG element gets pre-shrunk to the
        // viewport width before our transform scales it, and tap-to-image
        // coordinates drift proportionally with distance from the top-left.
        maxWidth: 'none',
        maxHeight: 'none',
      };
    },
    pinStyle() {
      if (!this.hasPin || !this.imgW) return { display: 'none' };
      const sx = this.tx + this.pinX * this.imgW * this.scale;
      const sy = this.ty + this.pinY * this.imgH * this.scale;
      return {
        position: 'absolute',
        left: sx + 'px',
        top:  sy + 'px',
        transform: 'translate(-50%, -100%)',
        pointerEvents: 'none',
      };
    },
  },

  async mounted() {
    this.pinX = (typeof this.initialX === 'number') ? this.initialX : null;
    this.pinY = (typeof this.initialY === 'number') ? this.initialY : null;
    await this.loadImage();
    window.addEventListener('resize', this.onResize);
  },

  beforeUnmount() {
    window.removeEventListener('resize', this.onResize);
    if (this.blobUrl) {
      try { URL.revokeObjectURL(this.blobUrl); } catch (e) { /* ignore */ }
    }
  },

  methods: {
    async loadImage() {
      this.loading = true;
      this.loadError = '';
      try {
        const blob = await API.fetchFloorplanImageBlob(this.floorplanId);
        this.blobUrl = URL.createObjectURL(blob);
      } catch (e) {
        console.error('Pin-picker image fetch failed', e);
        this.loadError = 'Could not load floorplan image.';
      } finally {
        this.loading = false;
      }
    },

    onImgLoad(e) {
      this.imgW = e.target.naturalWidth;
      this.imgH = e.target.naturalHeight;
      this.$nextTick(() => this.fitToViewport());
    },

    onResize() { this.fitToViewport(true); },

    fitToViewport(preservePin = false) {
      const vp = this.$refs.viewport;
      if (!vp || !this.imgW || !this.imgH) return;
      this.vpW = vp.clientWidth;
      this.vpH = vp.clientHeight;
      const fit = Math.min(this.vpW / this.imgW, this.vpH / this.imgH);
      this.scale = fit;
      this.tx = (this.vpW - this.imgW * fit) / 2;
      this.ty = (this.vpH - this.imgH * fit) / 2;
    },

    // ── Pointer handling ───────────────────────────────────────────────────
    onPointerDown(e) {
      const vp = this.$refs.viewport;
      if (!vp) return;
      vp.setPointerCapture(e.pointerId);
      const r = vp.getBoundingClientRect();
      this.pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });

      if (this.pointers.size === 1) {
        const p = [...this.pointers.values()][0];
        this.mode = 'pan';
        this.panStart = { x: p.x, y: p.y, tx0: this.tx, ty0: this.ty };
        this.tapStart = { x: p.x, y: p.y, t: Date.now() };
      } else if (this.pointers.size === 2) {
        const [p1, p2] = [...this.pointers.values()];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const mid  = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const ip   = this.viewportToImage(mid.x, mid.y);
        this.mode = 'pinch';
        this.pinchStart = { dist, scale0: this.scale, mid, ipx: ip.x, ipy: ip.y };
        this.tapStart = null; // pinch invalidates the tap intent
      }
    },

    onPointerMove(e) {
      if (!this.pointers.has(e.pointerId)) return;
      const vp = this.$refs.viewport;
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      this.pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });

      if (this.mode === 'pan' && this.pointers.size === 1) {
        const p = [...this.pointers.values()][0];
        const dx = p.x - this.panStart.x;
        const dy = p.y - this.panStart.y;
        this.tx = this.panStart.tx0 + dx;
        this.ty = this.panStart.ty0 + dy;
        // If they've moved more than ~6px, this isn't a tap any more.
        if (this.tapStart && Math.hypot(dx, dy) > 6) this.tapStart = null;
      } else if (this.mode === 'pinch' && this.pointers.size >= 2) {
        const [p1, p2] = [...this.pointers.values()];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const mid  = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const ratio = dist / Math.max(1, this.pinchStart.dist);
        const newScale = this.clampScale(this.pinchStart.scale0 * ratio);
        // Keep the original image-point under the *current* midpoint.
        this.tx = mid.x - this.pinchStart.ipx * newScale;
        this.ty = mid.y - this.pinchStart.ipy * newScale;
        this.scale = newScale;
      }
    },

    onPointerUp(e) {
      const wasTap = this.tapStart && this.pointers.size === 1 && this.mode === 'pan';
      this.pointers.delete(e.pointerId);
      try { this.$refs.viewport && this.$refs.viewport.releasePointerCapture(e.pointerId); }
      catch (err) { /* ignore */ }

      if (wasTap) {
        // Treat this as a click → drop/move pin
        const r = this.$refs.viewport.getBoundingClientRect();
        const sx = e.clientX - r.left;
        const sy = e.clientY - r.top;
        const ip = this.viewportToImage(sx, sy);
        if (ip.x >= 0 && ip.x <= this.imgW && ip.y >= 0 && ip.y <= this.imgH) {
          this.pinX = ip.x / this.imgW;
          this.pinY = ip.y / this.imgH;
          this.dirty = true;
        }
      }

      if (this.pointers.size === 0) {
        this.mode = 'idle';
        this.panStart = null;
        this.pinchStart = null;
        this.tapStart = null;
      } else if (this.pointers.size === 1 && this.mode === 'pinch') {
        // Re-arm pan from the remaining pointer
        const p = [...this.pointers.values()][0];
        this.mode = 'pan';
        this.panStart = { x: p.x, y: p.y, tx0: this.tx, ty0: this.ty };
        this.tapStart = null;
      }
    },

    onWheel(e) {
      e.preventDefault();
      const r = this.$refs.viewport.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const ip = this.viewportToImage(sx, sy);
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newScale = this.clampScale(this.scale * factor);
      this.tx = sx - ip.x * newScale;
      this.ty = sy - ip.y * newScale;
      this.scale = newScale;
    },

    zoomBy(factor) {
      // Anchor zoom on viewport center
      const cx = this.vpW / 2;
      const cy = this.vpH / 2;
      const ip = this.viewportToImage(cx, cy);
      const newScale = this.clampScale(this.scale * factor);
      this.tx = cx - ip.x * newScale;
      this.ty = cy - ip.y * newScale;
      this.scale = newScale;
    },

    clampScale(s) {
      // Min: half the fit-to-viewport scale; Max: 8×.
      if (!this.imgW || !this.imgH || !this.vpW || !this.vpH) return s;
      const fit = Math.min(this.vpW / this.imgW, this.vpH / this.imgH);
      return Math.max(fit * 0.5, Math.min(s, fit * 8));
    },

    viewportToImage(sx, sy) {
      return {
        x: (sx - this.tx) / this.scale,
        y: (sy - this.ty) / this.scale,
      };
    },

    // ── Actions ────────────────────────────────────────────────────────────
    clearPin() {
      this.pinX = null;
      this.pinY = null;
      this.dirty = true;
    },

    save() {
      if (this.hasPin) {
        this.$emit('save', { x: this.pinX, y: this.pinY });
      } else {
        this.$emit('clear');
      }
    },

    cancel() { this.$emit('cancel'); },
  },

  template: `
    <div class="modal-overlay" style="z-index:200" @click.self="cancel">
      <div class="modal-box" style="max-width:min(1280px,98vw);width:98vw;height:96vh;display:flex;flex-direction:column;overflow:hidden">
        <div class="modal-header">
          <div class="min-w-0">
            <p class="text-xs font-mono text-gray-400 truncate">Pin location</p>
            <h3 class="text-lg font-semibold text-gray-800 truncate">{{ floorplanName || 'Floorplan' }}</h3>
          </div>
          <button @click="cancel" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="modal-body" style="padding:0;flex:1;overflow:hidden;position:relative;background:#111">
          <div v-if="loading" class="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            <img src="/static/assets/impulse-loader.svg" class="h-8" alt="Loading"/>
          </div>
          <div v-else-if="loadError" class="absolute inset-0 flex items-center justify-center text-red-300 text-sm">
            {{ loadError }}
          </div>

          <div ref="viewport"
               class="absolute inset-0 select-none"
               style="touch-action:none;cursor:crosshair;overflow:hidden"
               @pointerdown="onPointerDown"
               @pointermove="onPointerMove"
               @pointerup="onPointerUp"
               @pointercancel="onPointerUp"
               @wheel.prevent="onWheel">
            <img v-if="blobUrl" :src="blobUrl" :alt="floorplanName"
                 :style="imgStyle"
                 @load="onImgLoad"
                 draggable="false"/>

            <!-- The pin itself (rendered in viewport coordinates) -->
            <div v-if="hasPin" :style="pinStyle">
              <svg width="32" height="40" viewBox="0 0 24 30" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.45))">
                <path d="M12 0C6.48 0 2 4.48 2 10c0 7.5 10 20 10 20s10-12.5 10-20C22 4.48 17.52 0 12 0z"
                      fill="#dc2626" stroke="white" stroke-width="2"/>
                <circle cx="12" cy="10" r="3.6" fill="white"/>
              </svg>
            </div>
          </div>

          <!-- Zoom controls overlay -->
          <div v-if="!loading && !loadError"
               class="absolute right-4 bottom-4 flex flex-col gap-2 bg-white/95 border border-gray-200 rounded-lg shadow-md p-1">
            <button @click="zoomBy(1.25)" class="w-9 h-9 flex items-center justify-center text-gray-600 hover:text-ips-blue hover:bg-gray-50 rounded" title="Zoom in">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            </button>
            <button @click="zoomBy(1/1.25)" class="w-9 h-9 flex items-center justify-center text-gray-600 hover:text-ips-blue hover:bg-gray-50 rounded" title="Zoom out">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
            </button>
            <button @click="fitToViewport()" class="w-9 h-9 flex items-center justify-center text-gray-600 hover:text-ips-blue hover:bg-gray-50 rounded" title="Fit to view">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V6a2 2 0 012-2h2M4 16v2a2 2 0 002 2h2m8-16h2a2 2 0 012 2v2m-4 12h2a2 2 0 002-2v-2"/></svg>
            </button>
          </div>

          <!-- Helper hint -->
          <div v-if="!loading && !loadError && !hasPin"
               class="absolute left-4 top-4 bg-white/95 border border-gray-200 rounded-lg shadow-sm px-3 py-2 text-xs text-gray-600">
            Tap or click on the floorplan to place a pin.
          </div>
        </div>

        <div class="modal-footer">
          <button @click="cancel" class="btn-secondary">Cancel</button>
          <button v-if="hasPin" @click="clearPin" class="px-3 py-1.5 text-sm font-semibold rounded-lg border border-red-300 text-red-700 bg-white hover:bg-red-50">
            Clear pin
          </button>
          <button @click="save" :disabled="!dirty && !hasPin" class="btn-primary">
            {{ hasPin ? 'Save pin' : 'Save (no pin)' }}
          </button>
        </div>
      </div>
    </div>
  `,
});
