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
  anthropicApiKey: '',
  threadsToken: '',
  postMethod: 'auto',
};

const SECRET_KEYS = ['anthropicApiKey', 'threadsToken'];
// Không đưa vào file sao lưu, không ghi đè khi khôi phục
const NO_BACKUP = ['cookies', ...SECRET_KEYS];
const MASK = '••••';

/** Cài đặt gửi cho giao diện: che khóa bí mật, chỉ để lộ 4 ký tự cuối. */
function publicSettings(s) {
  const out = { ...s };
  for (const k of SECRET_KEYS) out[k] = s[k] ? MASK + s[k].slice(-4) : '';
  return out;
}

class Store {
  constructor(file) {
    this.file = file;
    this.timer = null;
    this.data = { posts: {}, profiles: {}, jobs: [], schedules: [], notifications: [], outbox: [], settings: { ...DEFAULT_SETTINGS } };
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
        outbox: raw.outbox || [],
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
      if (e.code === 'ENOENT') return;
      // File hỏng: đổi tên để giữ lại thay vì để lần ghi sau đè mất
      const bad = `${this.file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      try {
        fs.renameSync(this.file, bad);
        this.recovered = bad;
        console.warn(`[store] file dữ liệu bị hỏng (${e.message}) — đã giữ lại tại ${bad}, bắt đầu với kho trống`);
      } catch (e2) {
        // Không đổi tên được thì dừng hẳn, tuyệt đối không ghi đè
        throw new Error(`Không đọc được ${this.file} (${e.message}) và không sao lưu được file hỏng: ${e2.message}`);
      }
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
        const v = String(patch[k] ?? '');
        // Giao diện chỉ nhận bản che (••••abcd) của khóa bí mật; gửi lại bản che nghĩa là giữ nguyên
        if (SECRET_KEYS.includes(k) && v.startsWith(MASK)) continue;
        if (k === 'postMethod' && !['auto', 'api', 'browser'].includes(v)) continue;
        s[k] = v.trim();
      }
    }
    s.concurrency = Math.min(3, Math.max(1, Math.round(s.concurrency)));
    if (s.delayMax < s.delayMin) s.delayMax = s.delayMin;
    this.save();
    return s;
  }

  /* ---------- Sao lưu / khôi phục ---------- */
  /**
   * Toàn bộ dữ liệu: bài viết, hồ sơ, lịch, hàng đợi đăng, thông báo, lịch sử tác vụ, cài đặt.
   * KHÔNG kèm cookie đăng nhập và khóa bí mật (dữ liệu nhạy cảm).
   */
  exportAll() {
    const settings = { ...this.data.settings };
    for (const k of NO_BACKUP) delete settings[k];
    return {
      app: 'scrat-threads',
      version: 2,
      exported_at: new Date().toISOString(),
      posts: Object.values(this.data.posts),
      profiles: Object.values(this.data.profiles),
      schedules: this.data.schedules,
      outbox: this.data.outbox,
      notifications: this.data.notifications,
      jobs: this.data.jobs.filter((j) => j.status !== 'running' && j.status !== 'queued'),
      settings,
    };
  }

  /**
   * Gộp bản sao lưu vào dữ liệu hiện có (không xóa gì). Bản ghi không hợp lệ bị bỏ qua.
   * Lịch nhập vào được TẮT sẵn, bài hẹn giờ chưa đăng thành NHÁP — để không tự chạy/đăng
   * ngay sau khi khôi phục. Cài đặt (trừ cookie và khóa bí mật) được áp dụng.
   */
  importAll(raw) {
    if (!raw || raw.app !== 'scrat-threads' || !Array.isArray(raw.posts)) {
      throw new Error('File không phải bản sao lưu của Scrat Thread by HuyFlou');
    }
    const str = (v) => typeof v === 'string';
    const arr = (v) => (Array.isArray(v) ? v : []);
    const USER = /^[A-Za-z0-9._]{1,30}$/;
    const NUMS = ['like_count', 'reply_count', 'repost_count', 'quote_count', 'reshare_count', 'follower_count'];
    const clean = (o) => {
      for (const k of NUMS) if (k in o) o[k] = Number(o[k]) || 0;
      for (const k of ['media', 'hashtags', 'mentions', 'sources', 'links', 'history']) if (k in o && !Array.isArray(o[k])) o[k] = [];
      return o;
    };
    const out = { posts: 0, profiles: 0, schedules: 0, outbox: 0, notifications: 0, jobs: 0, settings: false, skipped: 0 };

    for (const p of raw.posts) {
      if (!p || !str(p.id) || !str(p.code) || !str(p.username) || !USER.test(p.username)) { out.skipped++; continue; }
      const prev = this.data.posts[p.id];
      // Giữ bản mới hơn nếu đã có
      if (prev && prev.scraped_at && p.scraped_at && prev.scraped_at > p.scraped_at) continue;
      this.data.posts[p.id] = clean({ ...prev, ...p });
      out.posts++;
    }
    for (const u of arr(raw.profiles)) {
      if (!u || !str(u.username) || !USER.test(u.username)) { out.skipped++; continue; }
      const prev = this.data.profiles[u.username];
      const keepPrev = prev && prev.scraped_at && u.scraped_at && prev.scraped_at > u.scraped_at;
      // Gộp lịch sử người theo dõi của cả hai bên (kể cả khi giữ bản hiện có)
      const history = [...((prev && prev.history) || []), ...arr(u.history)]
        .filter((h) => h && str(h.t) && Number.isFinite(Number(h.f)))
        .sort((a, b) => a.t.localeCompare(b.t))
        .filter((h, i, all) => i === 0 || h.t !== all[i - 1].t)
        .slice(-60);
      this.data.profiles[u.username] = clean(keepPrev ? { ...u, ...prev, history } : { ...prev, ...u, history });
      out.profiles++;
    }
    const have = new Set(this.data.schedules.map((x) => x.id));
    for (const x of arr(raw.schedules)) {
      if (!x || !str(x.id) || have.has(x.id) || !str(x.type) || !x.raw || !(Number(x.every) >= 15)) continue;
      have.add(x.id);
      this.data.schedules.push({ ...x, every: Number(x.every), enabled: false, last_job_id: null });
      out.schedules++;
    }

    const haveOut = new Set(this.data.outbox.map((x) => x.id));
    for (const x of arr(raw.outbox)) {
      const parts = arr(x && x.parts).filter(str);
      if (!x || !str(x.id) || haveOut.has(x.id) || !parts.length) { if (x && !haveOut.has(x.id)) out.skipped++; continue; }
      haveOut.add(x.id);
      const item = { ...x, parts, media_ids: arr(x.media_ids), attempts: 0 };
      if (item.status !== 'published') {
        // Đăng dở thì để Lỗi cho người dùng kiểm tra; còn lại thành nháp
        item.status = item.media_ids.length ? 'failed' : 'draft';
        item.scheduled_at = null;
      }
      this.data.outbox.push(item);
      out.outbox++;
    }
    this.data.outbox.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    const haveN = new Set(this.data.notifications.map((n) => n.id));
    for (const n of arr(raw.notifications)) {
      if (!n || !str(n.id) || haveN.has(n.id) || !str(n.title)) continue;
      haveN.add(n.id);
      this.data.notifications.push(n);
      out.notifications++;
    }
    this.data.notifications = this.data.notifications.sort((a, b) => String(b.t).localeCompare(String(a.t))).slice(0, 100);

    const haveJ = new Set(this.data.jobs.map((j) => j.id));
    for (const j of arr(raw.jobs)) {
      if (!j || !str(j.id) || haveJ.has(j.id) || !str(j.type) || j.status === 'running' || j.status === 'queued') continue;
      haveJ.add(j.id);
      this.data.jobs.push(j);
      out.jobs++;
    }
    this.data.jobs = this.data.jobs.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 300);

    if (raw.settings && typeof raw.settings === 'object') {
      const patch = { ...raw.settings };
      for (const k of NO_BACKUP) delete patch[k];
      this.updateSettings(patch);
      out.settings = true;
    }
    this.save();
    return out;
  }

  /**
   * Xóa theo phạm vi: library (bài viết + hồ sơ), jobs (lịch sử tác vụ đã xong),
   * schedules, outbox (trừ bài đang đăng), notifications. Cài đặt không bao giờ bị xóa ở đây.
   */
  clearAll(scopes = ['library', 'jobs']) {
    const out = {};
    const want = new Set(scopes);
    if (want.has('library')) {
      out.posts = Object.keys(this.data.posts).length;
      out.profiles = Object.keys(this.data.profiles).length;
      this.data.posts = {};
      this.data.profiles = {};
    }
    if (want.has('jobs')) {
      const before = this.data.jobs.length;
      this.data.jobs = this.data.jobs.filter((j) => j.status === 'running' || j.status === 'queued');
      out.jobs = before - this.data.jobs.length;
    }
    if (want.has('schedules')) {
      out.schedules = this.data.schedules.length;
      this.data.schedules.length = 0;
    }
    if (want.has('outbox')) {
      const before = this.data.outbox.length;
      this.data.outbox = this.data.outbox.filter((p) => p.status === 'publishing');
      out.outbox = before - this.data.outbox.length;
    }
    if (want.has('notifications')) {
      out.notifications = this.data.notifications.length;
      this.data.notifications = [];
    }
    this.save();
    return out;
  }
}

const CLEAR_SCOPES = ['library', 'jobs', 'schedules', 'outbox', 'notifications'];

module.exports = { Store, DEFAULT_SETTINGS, publicSettings, SECRET_KEYS, CLEAR_SCOPES };
