/* Scrat Thread by HuyFlou — Trạng thái. */

/* =====================================================
   Trạng thái
   ===================================================== */
const store = {
  get(k, d) { try { const v = localStorage.getItem('st-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('st-' + k, JSON.stringify(v)); } catch { /* chế độ riêng tư */ } },
};

const S = {
  route: { id: 'home', query: {} },
  jobs: [],
  jobsLoaded: false,
  jobFilter: 'all',
  jobTab: 'queue',
  schedules: [],
  repeat: store.get('repeat', 0),
  postCache: new Map(),
  loginBusy: false,
  notifs: [],
  openLogs: new Set(),
  settings: null,
  settingsDirty: false,
  mode: store.get('mode', 'profile'),
  draft: store.get('draft', { profile: { username: '', limit: 50 }, post: { url: '', limit: 50 }, search: { query: '', mode: 'top', limit: 50 }, batch: { items: '', limit: 30 } }),
  lib: {
    tab: 'posts',
    view: store.get('libView', 'grid'),
    showFilters: false,
    f: { q: '', username: '', media: '', replies: '', minLikes: '', from: '', to: '', sort: 'new', source: '' },
    items: [],
    total: 0,
    loading: false,
    selected: new Set(),
    stale: false,
    pq: '',
    psort: 'followers',
    profiles: [],
  },
  stats: null,
};

export { store, S };
