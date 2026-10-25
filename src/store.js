'use strict';

/**
 * Kho dữ liệu dạng file JSON, ghi trễ (debounce) và ghi nguyên tử.
 * Đủ nhanh cho vài chục nghìn bài viết, không cần module native.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  headless: true,
  delayMin: 800,
  delayMax: 1800,
  maxScrolls: 30,
  timeout: 45000,
  concurrency: 1,
  proxy: '',
  userAgent: '',
  cookies: '',
  includeReplies: true,
};

class Store {
  constructor(file) {
    this.file = file;
    this.timer = null;
    this.data = { posts: {}, profiles: {}, jobs: [], schedules: [], notifications: [], settings: { ...DEFAULT_SETTINGS } };
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = {
        posts: raw.posts || {},
        profiles: raw.profiles || {},
        jobs: raw.jobs || [],
        schedules: raw.schedules || [],
        notifications: raw.notifications || [],
        settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
      };
      // Tác vụ đang chạy khi tắt app thì coi như bị gián đoạn
      for (const j of this.data.jobs) {
        if (j.status === 'running' || j.status === 'queued') {
          j.status = 'failed';
          j.error = 'Ứng dụng đã khởi động lại khi tác vụ đang chạy';
          j.finished_at = j.finished_at || new Date().toISOString();
        }
      }
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn('[store] không đọc được dữ liệu, tạo mới:', e.message);
    }
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.timer);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    // Bỏ các trường nội bộ (bắt đầu bằng "_") như timer của tác vụ
    fs.writeFileSync(tmp, JSON.stringify(this.data, (k, v) => (k[0] === '_' ? undefined : v)));
    fs.renameSync(tmp, this.file);
  }

  /* ---------- Bài viết ---------- */
  upsertPosts(posts, meta = {}) {
    let added = 0;
    const now = new Date().toISOString();
    for (const p of posts) {
      const prev = this.data.posts[p.id];
      if (!prev) {
        added++;
        if (meta.addedIds) meta.addedIds.push(p.id);
      }
      // Nguồn sau có thể thiếu trường (vd: trang bài viết không có tên hiển thị) —
      // không ghi đè giá trị đã biết bằng chuỗi rỗng / null
      const fresh = {};
      for (const [k, v] of Object.entries(p)) {
        if ((v === '' || v == null) && prev && prev[k]) continue;
        fresh[k] = v;
      }
      this.data.posts[p.id] = {
        ...prev,
        ...fresh,
        // Giữ nguyên mối quan hệ/nguồn gốc đã biết
        parent_code: p.parent_code || (prev && prev.parent_code) || null,
        sources: [...new Set([...((prev && prev.sources) || []), ...(meta.source ? [meta.source] : [])])],
        scraped_at: now,
        first_seen: (prev && prev.first_seen) || now,
      };
    }
    this.save();
    return added;
  }

  listPosts() {
    return Object.values(this.data.posts);
  }

  deletePosts(ids) {
    let n = 0;
    for (const id of ids) if (delete this.data.posts[id]) n++;
    this.save();
    return n;
  }

  /* ---------- Hồ sơ ---------- */
  upsertProfiles(users) {
    let added = 0;
    const now = new Date().toISOString();
    for (const u of users) {
      const prev = this.data.profiles[u.username];
      if (!prev) added++;
      const history = (prev && prev.history) || [];
      if (u.follower_count && (!history.length || history[history.length - 1].f !== u.follower_count)) {
        history.push({ t: now, f: u.follower_count });
      }
      this.data.profiles[u.username] = {
        ...prev,
        ...u,
        history: history.slice(-60),
        scraped_at: now,
        first_seen: (prev && prev.first_seen) || now,
      };
    }
    this.save();
    return added;
  }

  listProfiles() {
    return Object.values(this.data.profiles);
  }

  deleteProfiles(usernames) {
    let n = 0;
    for (const u of usernames) if (delete this.data.profiles[u]) n++;
    this.save();
    return n;
  }

  /* ---------- Tác vụ ---------- */
  addJob(job) {
    this.data.jobs.unshift(job);
    this.data.jobs = this.data.jobs.slice(0, 300);
    this.save();
    return job;
  }

  getJob(id) {
    return this.data.jobs.find((j) => j.id === id);
  }

  updateJob(id, patch) {
    const j = this.getJob(id);
    if (j) Object.assign(j, patch);
    this.save();
    return j;
  }

  removeJobs(predicate) {
    const before = this.data.jobs.length;
    this.data.jobs = this.data.jobs.filter((j) => !predicate(j));
    this.save();
    return before - this.data.jobs.length;
  }

  /* ---------- Thông báo ---------- */
  addNotification(n) {
    const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: new Date().toISOString(), read: false, ...n };
    this.data.notifications.unshift(item);
    this.data.notifications = this.data.notifications.slice(0, 100);
    this.save();
    return item;
  }

  markNotificationsRead(ids) {
    const set = ids ? new Set(ids) : null;
    for (const n of this.data.notifications) if (!set || set.has(n.id)) n.read = true;
    this.save();
  }

  /* ---------- Cài đặt ---------- */
  getSettings() {
    return this.data.settings;
  }

  updateSettings(patch) {
    const s = this.data.settings;
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (!(k in patch)) continue;
      const def = DEFAULT_SETTINGS[k];
      if (typeof def === 'number') {
        const n = Number(patch[k]);
        if (Number.isFinite(n) && n >= 0) s[k] = n;
      } else if (typeof def === 'boolean') {
        s[k] = !!patch[k];
      } else {
        s[k] = String(patch[k] ?? '');
      }
    }
    s.concurrency = Math.min(3, Math.max(1, Math.round(s.concurrency)));
    if (s.delayMax < s.delayMin) s.delayMax = s.delayMin;
    this.save();
    return s;
  }

  /* ---------- Sao lưu / khôi phục ---------- */
  /** Toàn bộ dữ liệu, KHÔNG kèm cookie đăng nhập (dữ liệu nhạy cảm). */
  exportAll() {
    const { cookies, ...settings } = this.data.settings;
    return {
      app: 'scrat-threads',
      version: 1,
      exported_at: new Date().toISOString(),
      posts: Object.values(this.data.posts),
      profiles: Object.values(this.data.profiles),
      schedules: this.data.schedules,
      settings,
    };
  }

  /**
   * Gộp bản sao lưu vào dữ liệu hiện có (không xóa gì). Bản ghi không hợp lệ bị bỏ qua.
   * Lịch nhập vào được TẮT sẵn để không chạy dồn ngay sau khi khôi phục.
   */
  importAll(raw) {
    if (!raw || raw.app !== 'scrat-threads' || !Array.isArray(raw.posts)) {
      throw new Error('File không phải bản sao lưu của Scrat Thread by HuyFlou');
    }
    const str = (v) => typeof v === 'string';
    const USER = /^[A-Za-z0-9._]{1,30}$/;
    const NUMS = ['like_count', 'reply_count', 'repost_count', 'quote_count', 'reshare_count', 'follower_count'];
    const clean = (o) => {
      for (const k of NUMS) if (k in o) o[k] = Number(o[k]) || 0;
      for (const k of ['media', 'hashtags', 'mentions', 'sources', 'links', 'history']) if (k in o && !Array.isArray(o[k])) o[k] = [];
      return o;
    };
    const out = { posts: 0, profiles: 0, schedules: 0, skipped: 0 };

    for (const p of raw.posts) {
      if (!p || !str(p.id) || !str(p.code) || !str(p.username) || !USER.test(p.username)) { out.skipped++; continue; }
      const prev = this.data.posts[p.id];
      // Giữ bản mới hơn nếu đã có
      if (prev && prev.scraped_at && p.scraped_at && prev.scraped_at > p.scraped_at) continue;
      this.data.posts[p.id] = clean({ ...prev, ...p });
      out.posts++;
    }
    for (const u of Array.isArray(raw.profiles) ? raw.profiles : []) {
      if (!u || !str(u.username) || !USER.test(u.username)) { out.skipped++; continue; }
      const prev = this.data.profiles[u.username];
      const keepPrev = prev && prev.scraped_at && u.scraped_at && prev.scraped_at > u.scraped_at;
      // Gộp lịch sử người theo dõi của cả hai bên (kể cả khi giữ bản hiện có)
      const history = [...((prev && prev.history) || []), ...(Array.isArray(u.history) ? u.history : [])]
        .filter((h) => h && str(h.t) && Number.isFinite(Number(h.f)))
        .sort((a, b) => a.t.localeCompare(b.t))
        .filter((h, i, arr) => i === 0 || h.t !== arr[i - 1].t)
        .slice(-60);
      this.data.profiles[u.username] = clean(keepPrev ? { ...u, ...prev, history } : { ...prev, ...u, history });
      out.profiles++;
    }
    const have = new Set(this.data.schedules.map((x) => x.id));
    for (const x of Array.isArray(raw.schedules) ? raw.schedules : []) {
      if (!x || !str(x.id) || have.has(x.id) || !str(x.type) || !x.raw || !(Number(x.every) >= 15)) continue;
      this.data.schedules.push({ ...x, every: Number(x.every), enabled: false, last_job_id: null });
      out.schedules++;
    }
    this.save();
    return out;
  }

  clearAll() {
    this.data.posts = {};
    this.data.profiles = {};
    this.data.jobs = this.data.jobs.filter((j) => j.status === 'running' || j.status === 'queued');
    this.save();
  }
}

module.exports = { Store, DEFAULT_SETTINGS };
