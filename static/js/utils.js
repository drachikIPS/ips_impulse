// ─────────────────────────────────────────────────────────────────────────────
// Global formatting utilities — read per-project settings from window.AppSettings
// ─────────────────────────────────────────────────────────────────────────────

window.AppSettings = { dateFormat: 'DD/MM/YYYY', timezone: 'Europe/Brussels', currency: 'EUR' };

/**
 * Format a YYYY-MM-DD date string according to the project's date_format setting.
 */
function formatDate(d) {
  if (!d) return '';
  const str = String(d).slice(0, 10);
  const parts = str.split('-');
  if (parts.length !== 3) return str;
  const [y, m, day] = parts;
  const fmt = (window.AppSettings && window.AppSettings.dateFormat) || 'DD/MM/YYYY';
  if (fmt === 'MM/DD/YYYY') return `${m}/${day}/${y}`;
  if (fmt === 'YYYY-MM-DD') return `${y}-${m}-${day}`;
  return `${day}/${m}/${y}`;
}

/**
 * Format an ISO datetime string, converting to the project's timezone and
 * formatting the date part according to the project's date_format setting.
 * Returns "DD/MM/YYYY HH:MM" (or whichever format is configured).
 */
function formatDateTime(iso) {
  if (!iso) return '';
  try {
    const tz  = (window.AppSettings && window.AppSettings.timezone)   || 'Europe/Brussels';
    const dt  = new Date(String(iso).replace(' ', 'T'));
    // en-CA locale reliably returns YYYY-MM-DD
    const datePart = dt.toLocaleDateString('en-CA', { timeZone: tz });
    const timePart = dt.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
    return formatDate(datePart) + ' ' + timePart;
  } catch {
    return String(iso).replace('T', ' ').slice(0, 16);
  }
}

/**
 * Format an ISO datetime as a short human-readable timestamp, e.g. "11 Apr 2026".
 * Used for creation/update timestamps in tables. Respects the project timezone.
 */
function fmtTimestamp(iso) {
  if (!iso) return '—';
  try {
    const tz = (window.AppSettings && window.AppSettings.timezone) || 'Europe/Brussels';
    return new Date(String(iso).replace(' ', 'T'))
      .toLocaleDateString('en-GB', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(iso).slice(0, 10);
  }
}

/**
 * Disable Chart.js animations globally.
 *
 * Chart.js schedules a requestAnimationFrame the moment a chart is constructed.
 * If the chart is destroyed or its canvas is unmounted before that frame fires
 * (common in Vue v-if/v-else dashboards or rapid tab switches), the frame still
 * runs and calls ctx.save() on a nulled context — throwing an uncaught
 * "Cannot read properties of null (reading 'save')" inside helpers.canvas.ts
 * that halts the shared global animator and blanks every chart that mounts
 * afterwards. Turning animations off removes the RAF schedule entirely so
 * nothing can fire on a dead canvas. Charts simply paint on creation.
 */
if (typeof Chart !== 'undefined' && Chart.defaults) {
  Chart.defaults.animation = false;
  Chart.defaults.animations = { colors: false, numbers: false };
}

/**
 * Self-correct Chart.js sizing after initial creation.
 *
 * Chart.js measures the canvas's parent at construction time. If CSS layout
 * hasn't finished (e.g. the chart sits inside a v-if/v-else that just flipped,
 * or inside a tab that just became visible), the first paint can come out
 * tiny or mis-proportioned. Two deferred resize() calls — one on the next
 * animation frame, one ~250ms later — let the chart catch up once layout
 * settles, without the user having to switch tabs or hit refresh.
 */
function scheduleChartResize(chart) {
  if (!chart || typeof chart.resize !== 'function') return;
  const safeResize = () => { try { chart.resize(); } catch (e) { /* canvas gone */ } };
  requestAnimationFrame(safeResize);
  setTimeout(safeResize, 250);
}
