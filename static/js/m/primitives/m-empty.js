// ─────────────────────────────────────────────────────────────────────────────
// <m-empty title="No projects" subtitle="You aren't linked to any project yet">
// ─────────────────────────────────────────────────────────────────────────────
window.__mComponents = window.__mComponents || [];
window.__mComponents.push(['m-empty', {
  props: {
    title:    { type: String, default: 'Nothing to show' },
    subtitle: { type: String, default: '' },
  },
  template: `
    <div class="m-empty">
      <div class="m-empty-title">{{ title }}</div>
      <div v-if="subtitle" class="m-empty-sub">{{ subtitle }}</div>
      <div style="margin-top:14px"><slot></slot></div>
    </div>
  `,
}]);
