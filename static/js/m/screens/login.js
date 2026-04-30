// ─────────────────────────────────────────────────────────────────────────────
// Mobile login screen. Reuses the same /api/auth/login endpoint and stores
// the JWT exactly like the desktop shell (api.setToken).
// On success, emits 'logged-in' so the router moves to #/m/projects.
// ─────────────────────────────────────────────────────────────────────────────
window.__mComponents = window.__mComponents || [];
window.__mComponents.push(['m-screen-login', {
  emits: ['logged-in'],
  data() {
    return {
      email: '',
      password: '',
      loading: false,
      error: '',
    };
  },
  methods: {
    async submit() {
      if (!this.email || !this.password) {
        this.error = 'Email and password are required';
        return;
      }
      this.loading = true;
      this.error = '';
      try {
        const res = await API.login(this.email.trim(), this.password);
        if (!res || !res.access_token) throw new Error('Invalid response from server');
        API.setToken(res.access_token);
        try { localStorage.setItem('ips_user', JSON.stringify(res.user || {})); } catch {}
        // Bidders are blocked from the mobile shell on purpose — their flow
        // is desktop-shaped (procurement portal). Sign them straight back out.
        if (res.user && res.user.role === 'BIDDER') {
          API.clearToken();
          this.error = 'Bidder accounts use the desktop portal. Please sign in on a laptop.';
          this.loading = false;
          return;
        }
        this.$emit('logged-in', res.user || null);
      } catch (e) {
        this.error = e.message || 'Sign in failed';
      } finally {
        this.loading = false;
      }
    },
  },
  template: `
    <div class="m-login-wrap">
      <div class="m-login-card">
        <div style="text-align:center; margin-bottom:18px">
          <div style="font-size:22px; font-weight:800; color:#1B4F8C; letter-spacing:-0.01em">ImPulse Suite</div>
          <div style="font-size:12px; color:#6B7280; margin-top:2px">Mobile · Site access</div>
        </div>
        <form @submit.prevent="submit" style="display:flex; flex-direction:column; gap:12px">
          <div>
            <label class="m-label">Email</label>
            <input v-model="email" type="email" inputmode="email" autocomplete="email"
                   class="m-input" placeholder="you@company.com" autofocus/>
          </div>
          <div>
            <label class="m-label">Password</label>
            <input v-model="password" type="password" autocomplete="current-password"
                   class="m-input" placeholder="••••••••"/>
          </div>
          <p v-if="error" style="color:#B91C1C; background:#FEF2F2; padding:8px 12px; border-radius:8px; font-size:13px; margin:0">
            {{ error }}
          </p>
          <button type="submit" :disabled="loading" class="m-btn m-btn-primary m-btn-block">
            {{ loading ? 'Signing in…' : 'Sign In' }}
          </button>
        </form>
        <p style="text-align:center; font-size:11px; color:#9CA3AF; margin-top:18px">
          Group IPS &copy; {{ new Date().getFullYear() }}
        </p>
      </div>
    </div>
  `,
}]);
