// ─────────────────────────────────────────────────────────────────────────────
// <m-fab @click="openNew()" /> — floating "+" action button.
// Slot lets a screen swap the icon if needed.
// ─────────────────────────────────────────────────────────────────────────────
window.__mComponents = window.__mComponents || [];
window.__mComponents.push(['m-fab', {
  emits: ['click'],
  template: `
    <button class="m-fab" @click="$emit('click')" aria-label="Add">
      <slot>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </slot>
    </button>
  `,
}]);
