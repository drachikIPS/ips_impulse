// ─────────────────────────────────────────────────────────────────────────────
// Projects screen — accessible projects for the signed-in user.
// Tapping a row navigates to #/m/{project_number}/home.
// ─────────────────────────────────────────────────────────────────────────────
window.__mComponents = window.__mComponents || [];
window.__mComponents.push(['m-screen-projects', {
  emits: ['open-project', 'logout'],
  data() {
    return {
      projects: [],
      loading: true,
      error: '',
      query: '',
    };
  },
  computed: {
    filtered() {
      const q = (this.query || '').trim().toLowerCase();
      if (!q) return this.projects;
      return this.projects.filter(p =>
        (p.project_number || '').toLowerCase().includes(q) ||
        (p.description    || '').toLowerCase().includes(q) ||
        (p.client         || '').toLowerCase().includes(q)
      );
    },
  },
  async mounted() { await this.load(); },
  methods: {
    async load() {
      this.loading = true; this.error = '';
      try {
        // /api/projects already filters server-side to the projects this
        // user can see (linked contact, owner, or admin).
        this.projects = await API.getProjects();
      } catch (e) {
        this.error = e.message || 'Failed to load projects';
      } finally {
        this.loading = false;
      }
    },
    onLogout() {
      API.clearToken();
      this.$emit('logout');
    },
  },
  template: `
    <m-screen>
      <template #appbar>
        <m-app-bar title="My Projects" :back="false">
          <template #action>
            <button class="m-app-bar-action" @click="onLogout" aria-label="Sign out">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </button>
          </template>
        </m-app-bar>
      </template>

      <div style="padding:12px 16px 4px">
        <input v-model="query" type="search" inputmode="search" enterkeyhint="search"
               class="m-input" placeholder="Search projects…"/>
      </div>

      <div v-if="loading" style="padding:24px; text-align:center; color:#6B7280; font-size:13px">
        Loading projects…
      </div>

      <p v-else-if="error" style="margin:12px 16px; color:#B91C1C; background:#FEF2F2; padding:10px 12px; border-radius:8px; font-size:13px">
        {{ error }}
      </p>

      <m-empty v-else-if="filtered.length === 0"
        :title="query ? 'No matches' : 'No projects yet'"
        :subtitle="query ? 'Try a different search.' : 'You aren\\'t linked to any project on this server.'"></m-empty>

      <div v-else class="m-list" style="margin-top:6px">
        <m-list-row v-for="p in filtered" :key="p.id"
          :title="p.project_number"
          :subtitle="(p.client ? p.client + ' · ' : '') + (p.description || '')"
          @click="$emit('open-project', p)"></m-list-row>
      </div>
    </m-screen>
  `,
}]);
