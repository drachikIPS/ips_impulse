// ─────────────────────────────────────────────────────────────────────────────
// <m-app-bar> — sticky top bar with optional back button + right-action slot.
// Use:  <m-app-bar title="My Projects" :back="false"></m-app-bar>
//       <m-app-bar title="Punch List" subtitle="KUT-PIS" @back="goBack()"></m-app-bar>
// ─────────────────────────────────────────────────────────────────────────────
window.__mComponents = window.__mComponents || [];
window.__mComponents.push(['m-app-bar', {
  props: {
    title:    { type: String, required: true },
    subtitle: { type: String, default: '' },
    back:     { type: Boolean, default: true },
  },
  emits: ['back'],
  template: `
    <div class="m-app-bar">
      <button v-if="back" class="m-app-bar-back" @click="$emit('back')" aria-label="Back">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <div v-else style="width:44px"></div>
      <div class="m-app-bar-title">
        <div>{{ title }}</div>
        <div v-if="subtitle" class="m-app-bar-subtitle">{{ subtitle }}</div>
      </div>
      <div class="m-app-bar-action">
        <slot name="action"></slot>
      </div>
    </div>
  `,
}]);
