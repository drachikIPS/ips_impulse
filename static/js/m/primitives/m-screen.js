// ─────────────────────────────────────────────────────────────────────────────
// <m-screen> — full-height screen wrapper. Three named slots:
//   #appbar  → sticky top bar (usually <m-app-bar>)
//   default  → scrollable body
//   #bottom  → sticky bottom action bar (use .m-bottom-bar)
// ─────────────────────────────────────────────────────────────────────────────
window.__mComponents = window.__mComponents || [];
window.__mComponents.push(['m-screen', {
  template: `
    <div class="m-screen">
      <slot name="appbar"></slot>
      <div class="m-screen-body">
        <slot></slot>
      </div>
      <slot name="bottom"></slot>
    </div>
  `,
}]);
