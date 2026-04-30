// ─────────────────────────────────────────────────────────────────────────────
// <m-list-row> — one tappable row with title + optional subtitle + chevron.
// Use:  <m-list-row title="KUT-PIS" subtitle="Acme client" @click="open()">
//         <template #leading><div class="badge">QC</div></template>
//         <template #trailing><m-status-pill ...></m-status-pill></template>
//       </m-list-row>
// ─────────────────────────────────────────────────────────────────────────────
window.__mComponents = window.__mComponents || [];
window.__mComponents.push(['m-list-row', {
  props: {
    title:    { type: String, required: true },
    subtitle: { type: String, default: '' },
    chevron:  { type: Boolean, default: true },
  },
  emits: ['click'],
  template: `
    <div class="m-list-row" @click="$emit('click', $event)">
      <slot name="leading"></slot>
      <div class="m-list-row-body">
        <div class="m-list-row-title">{{ title }}</div>
        <div v-if="subtitle || $slots.subtitle" class="m-list-row-sub">
          <slot name="subtitle">{{ subtitle }}</slot>
        </div>
      </div>
      <slot name="trailing"></slot>
      <svg v-if="chevron" class="m-list-row-chevron" width="18" height="18" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </div>
  `,
}]);
