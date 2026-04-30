// ─────────────────────────────────────────────────────────────────────────────
// Mobile root + hash router. Reads/writes #/m/... only — never collides with
// the desktop bundle (which uses #/<projectNum>/<module>).
//
// Route shapes (v1 shell):
//   #/m/login                                 → login screen
//   #/m/projects                              → project picker
//   #/m/{projectNumber}/home                  → module hub
//   #/m/{projectNumber}/{module}              → screens added in later slices
//
// On 401 from any API call, api.js calls window.location.reload(); on the
// next boot we land on /m again, see no token, and show the login screen.
// ─────────────────────────────────────────────────────────────────────────────

const { createApp } = Vue;

// Simple route parser — returns { name, params } or null for unknown paths.
function parseHash() {
  const raw = (window.location.hash || '').replace(/^#\/?/, '');   // strip "#/" or "#"
  // Split off any query later — none used in v1.
  const parts = raw.split('/').filter(Boolean);
  if (parts.length === 0 || parts[0] !== 'm') return null;

  // /m
  if (parts.length === 1) return { name: 'projects', params: {} };
  // /m/login
  if (parts[1] === 'login')    return { name: 'login',    params: {} };
  // /m/projects
  if (parts[1] === 'projects') return { name: 'projects', params: {} };

  // /m/{projectNumber}/...
  const projectNumber = parts[1];
  if (parts.length === 2 || parts[2] === 'home') {
    return { name: 'home', params: { projectNumber } };
  }
  // Stub for module screens — render the hub for now and remember intent.
  return { name: 'home', params: { projectNumber, pendingModule: parts[2] || null } };
}

function writeHash(path) {
  // Avoid triggering an infinite hashchange loop.
  if (window.location.hash === path) return;
  window.location.hash = path;
}

const Root = {
  data() {
    return {
      route: { name: 'login', params: {} },   // resolved on mount
      projectsCache: [],                       // small cache so home knows the project object after refresh
      currentProject: null,
    };
  },

  computed: {
    isAuthed() { return !!API.getToken(); },

    currentScreen() {
      if (!this.isAuthed)             return 'm-screen-login';
      if (this.route.name === 'login')    return 'm-screen-login';
      if (this.route.name === 'projects') return 'm-screen-projects';
      if (this.route.name === 'home')     return 'm-screen-home';
      return 'm-screen-projects';
    },

    screenProps() {
      if (this.currentScreen === 'm-screen-home') {
        return { project: this.currentProject || { project_number: this.route.params.projectNumber } };
      }
      return {};
    },
  },

  async mounted() {
    window.addEventListener('hashchange', () => this.resolveRoute());
    await this.resolveRoute(true);
  },

  methods: {
    async resolveRoute(initial = false) {
      // Default landing for authed users with no hash → /m/projects
      if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
        writeHash(this.isAuthed ? '#/m/projects' : '#/m/login');
        return;   // hashchange will re-fire
      }
      const parsed = parseHash();
      if (!parsed) {
        writeHash(this.isAuthed ? '#/m/projects' : '#/m/login');
        return;
      }

      // Auth gate
      if (!this.isAuthed && parsed.name !== 'login') {
        writeHash('#/m/login');
        return;
      }
      if (this.isAuthed && parsed.name === 'login') {
        writeHash('#/m/projects');
        return;
      }

      this.route = parsed;

      // If we land on /home but don't have the project object cached
      // (e.g. user refreshed), fetch the list once so we can hydrate it.
      if (parsed.name === 'home') {
        const pn = parsed.params.projectNumber;
        if (!this.currentProject || this.currentProject.project_number !== pn) {
          await this.hydrateProject(pn);
        }
      }
    },

    async hydrateProject(projectNumber) {
      try {
        if (!this.projectsCache.length) {
          this.projectsCache = await API.getProjects();
        }
        const found = this.projectsCache.find(p => p.project_number === projectNumber);
        this.currentProject = found || { project_number: projectNumber };
        if (found && found.id) API.setProjectId(found.id);
      } catch (e) {
        // Network/perm error — keep a placeholder so the home screen still renders.
        this.currentProject = { project_number: projectNumber };
      }
    },

    // ── Screen event handlers ──────────────────────────────────────────────
    onLoggedIn() {
      writeHash('#/m/projects');
    },

    onLogout() {
      this.currentProject = null;
      this.projectsCache = [];
      API.clearProjectId();
      writeHash('#/m/login');
    },

    onOpenProject(project) {
      this.currentProject = project;
      if (project && project.id) API.setProjectId(project.id);
      writeHash('#/m/' + encodeURIComponent(project.project_number) + '/home');
    },

    onBackFromHome() {
      writeHash('#/m/projects');
    },

    onOpenModule(moduleKey) {
      // Module screens land in Slice 1's later files. Until they exist, we
      // show a friendly toast-style alert so the wiring is obvious.
      alert('"' + moduleKey.toUpperCase() + '" module: coming in the next iteration.');
    },
  },

  template: `
    <component
      :is="currentScreen"
      v-bind="screenProps"
      @logged-in="onLoggedIn"
      @logout="onLogout"
      @open-project="onOpenProject"
      @back="onBackFromHome"
      @open-module="onOpenModule"
    ></component>
  `,
};

const mApp = createApp(Root);

// Register every primitive + screen pushed onto window.__mComponents
for (const [name, def] of (window.__mComponents || [])) {
  mApp.component(name, def);
}

mApp.mount('#m-app');
