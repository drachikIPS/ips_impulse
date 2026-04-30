// ─────────────────────────────────────────────────────────────────────────────
// <m-status-pill tone="amber" label="OPEN"></m-status-pill>
// Tones: blue, green, amber, red, gray, purple
// ─────────────────────────────────────────────────────────────────────────────
window.__mComponents = window.__mComponents || [];
window.__mComponents.push(['m-status-pill', {
  props: {
    label: { type: String, required: true },
    tone:  { type: String, default: 'gray' },
  },
  template: `<span :class="['m-pill', 'm-pill-' + tone]">{{ label }}</span>`,
}]);
