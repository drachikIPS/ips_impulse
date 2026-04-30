// ─────────────────────────────────────────────────────────────────────────────
// Module hub for a single project. Three tiles: QC · Construction · Safety.
// Tapping a tile emits 'open-module' with the module key. (Module screens
// land in subsequent slices — for now those tiles can warn "coming soon".)
// ─────────────────────────────────────────────────────────────────────────────
window.__mComponents = window.__mComponents || [];
window.__mComponents.push(['m-screen-home', {
  props: {
    project: { type: Object, required: true },
  },
  emits: ['back', 'open-module'],
  data() {
    return {
      modules: [
        { key: 'qc',  title: 'Quality Control', sub: 'Punch + ITP',     bg: '#10B981', icon: 'check' },
        { key: 'con', title: 'Construction',    sub: 'Daily + Permits', bg: '#0EA5E9', icon: 'hard-hat' },
        { key: 'saf', title: 'Safety',          sub: 'Obs · Incidents · Toolbox', bg: '#F97316', icon: 'shield' },
      ],
    };
  },
  template: `
    <m-screen>
      <template #appbar>
        <m-app-bar :title="project.project_number"
                   :subtitle="project.description || project.client || ''"
                   @back="$emit('back')"></m-app-bar>
      </template>

      <div style="padding:18px 16px 6px">
        <div style="font-size:11px; font-weight:700; color:#6B7280; text-transform:uppercase; letter-spacing:0.06em">Site Modules</div>
        <div style="font-size:13px; color:#6B7280; margin-top:2px">Pick the area you're working on right now.</div>
      </div>

      <div class="m-tile-grid">
        <div v-for="m in modules" :key="m.key" class="m-tile" @click="$emit('open-module', m.key)">
          <div class="m-tile-icon" :style="{ background: m.bg }">
            <!-- one common icon — keeps the bundle tiny -->
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path v-if="m.icon === 'check'"   d="M5 13l4 4L19 7"/>
              <path v-else-if="m.icon === 'hard-hat'" d="M3 17h18M5 17v-3a7 7 0 0114 0v3M9 11V8a3 3 0 016 0v3"/>
              <path v-else-if="m.icon === 'shield'"   d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z"/>
              <path v-else                            d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <div class="m-tile-title">{{ m.title }}</div>
          <div class="m-tile-sub">{{ m.sub }}</div>
        </div>
      </div>

      <div style="padding:18px 16px 6px">
        <div style="font-size:11px; font-weight:700; color:#6B7280; text-transform:uppercase; letter-spacing:0.06em">Account</div>
      </div>
      <div class="m-list">
        <m-list-row title="Switch project" subtitle="Pick a different project"
                    @click="$emit('back')"></m-list-row>
      </div>
    </m-screen>
  `,
}]);
