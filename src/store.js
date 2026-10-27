'use strict';

/**
 * Kho dữ liệu SQLite (node:sqlite có sẵn trong Node ≥ 22.13, không cần module native).
 * - Dữ liệu được giữ trong bộ nhớ ở `store.data` để đọc/lọc nhanh như trước.
 * - Mỗi lần lưu (ghi trễ 300ms) chỉ ghi các bài viết / hồ sơ ĐÃ ĐỔI trong một transaction,
 *   không ghi lại toàn bộ như file JSON. SQLite (chế độ WAL) bảo đảm không hỏng file khi tắt đột ngột.
 * - Lần đầu chạy, dữ liệu cũ trong db.json được chuyển sang và file cũ đổi tên thành db.json.migrated.
 */

const fs = require('fs');
const path = require('path');

let DatabaseSync;
function loadSqlite() {
  if (DatabaseSync) return DatabaseSync;
  // Node 22 in cảnh báo "SQLite is an experimental feature" — tính năng đã ổn định cho nhu cầu này
  const emit = process.emitWarning;
  process.emitWarning = (w, ...a) => (String(w && w.message ? w.message : w).includes('SQLite') ? undefined : emit.call(process, w, ...a));
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch {
    throw new Error(`Cần Node.js 22.13 trở lên để lưu dữ liệu bằng SQLite (máy đang có ${process.version}). Tải bản LTS mới tại https://nodejs.org`);
  } finally {
    process.emitWarning = emit;
  }
  return DatabaseSync;
}

const SMALL = ['jobs', 'schedules', 'outbox', 'notifications', 'settings'];
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const strip = (v) => JSON.stringify(v, (k, x) => (k[0] === '_' ? undefined : x));

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
  /**
   * `file`: đường dẫn file SQLite (vd: data/scrat.db). Nếu là đường dẫn .json (kiểu cũ),
   * dữ liệu lưu ở file .sqlite cùng tên và file .json được chuyển sang khi chưa có.
   */
  constructor(file) {
    const json = /\.json$/i.test(file);
    this.file = json ? file.replace(/\.json$/i, '.sqlite') : file;
    this.legacyFile = json ? file : path.join(path.dirname(file), 'db.json');
    this.timer = null;
    this.dirty = { posts: new Set(), profiles: new Set() };
    this.replaced = { posts: false, profiles: false };
    this.written = {};
    this.data = this.makeData({}, {});
    this.open();
    this.load();
  }

  /** store.data giống hệt kiểu cũ; posts/profiles được theo dõi để chỉ ghi phần đã đổi. */
  makeData(posts, profiles) {
    const self = this;
    const track = (table, obj) => new Proxy(obj, {
      set(t, k, v) { t[k] = v; self.dirty[table].add(k); return true; },
      deleteProperty(t, k) { if (k in t) { delete t[k]; self.dirty[table].add(k); } return true; },
    });
    let p = track('posts', posts);
    let u = track('profiles', profiles);
    return {
      get posts() { return p; },
      set posts(v) { self.replaced.posts = true; self.dirty.posts.clear(); p = track('posts', { ...v }); for (const k of Object.keys(v)) self.dirty.posts.add(k); },
      get profiles() { return u; },
      set profiles(v) { self.replaced.profiles = true; self.dirty.profiles.clear(); u = track('profiles', { ...v }); for (const k of Object.keys(v)) self.dirty.profiles.add(k); },
      jobs: [], schedules: [], outbox: [], notifications: [],
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  open() {
    const Db = loadSqlite();
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const fresh = !fs.existsSync(this.file);
    try {
      this.db = new Db(this.file);
      if (!fresh) {
        const r = this.db.prepare('PRAGMA quick_check').get();
        if (!r || Object.values(r)[0] !== 'ok') throw new Error('kiểm tra toàn vẹn thất bại');
      }
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS profiles (username TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, data TEXT NOT NULL);
      `);
    } catch (e) {
      // File SQLite hỏng: giữ lại để cứu dữ liệu, tạo file mới
      try { this.db && this.db.close(); } catch { /* đã đóng */ }
      const bad = `${this.file}.corrupt-${stamp()}`;
      for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(this.file + ext)) fs.renameSync(this.file + ext, bad + ext);
      this.recovered = bad;
      console.warn(`[store] file dữ liệu bị hỏng (${e.message}) — đã giữ lại tại ${bad}, bắt đầu với kho trống`);
      return this.open();
    }
    const q = (sql) => this.db.prepare(sql);
    this.sql = {
      putPost: q('INSERT OR REPLACE INTO posts (id, data) VALUES (?, ?)'),
      delPost: q('DELETE FROM posts WHERE id = ?'),
      putProfile: q('INSERT OR REPLACE INTO profiles (username, data) VALUES (?, ?)'),
      delProfile: q('DELETE FROM profiles WHERE username = ?'),
      putKv: q('INSERT OR REPLACE INTO kv (key, data) VALUES (?, ?)'),
    };
  }

  load() {
    const empty = !this.db.prepare('SELECT 1 FROM kv LIMIT 1').get() && !this.db.prepare('SELECT 1 FROM posts LIMIT 1').get();
    if (empty && fs.existsSync(this.legacyFile)) return this.migrate();
    const posts = {};
    for (const r of this.db.prepare('SELECT id, data FROM posts').iterate()) posts[r.id] = JSON.parse(r.data);
    const profiles = {};
    for (const r of this.db.prepare('SELECT username, data FROM profiles').iterate()) profiles[r.username] = JSON.parse(r.data);
    const kv = {};
    for (const r of this.db.prepare('SELECT key, data FROM kv').iterate()) { kv[r.key] = JSON.parse(r.data); this.written[r.key] = r.data; }
    this.fill({ posts, profiles, ...kv });
    this.dirty.posts.clear();
    this.dirty.profiles.clear();
  }

  /** Nạp dữ liệu thô vào bộ nhớ (dùng chung cho SQLite và file JSON cũ). */
  fill(raw) {
    this.data = this.makeData(raw.posts || {}, raw.profiles || {});
    for (const k of ['jobs', 'schedules', 'outbox', 'notifications']) this.data[k] = Array.isArray(raw[k]) ? raw[k] : [];
    this.data.settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
    // Tác vụ đang chạy khi tắt app thì coi như bị gián đoạn
    for (const j of this.data.jobs) {
      if (j.status === 'running' || j.status === 'queued') {
        j.status = 'failed';
        j.error = 'Ứng dụng đã khởi động lại khi tác vụ đang chạy';
        j.finished_at = j.finished_at || new Date().toISOString();
      }
    }
  }

  /** Chuyển dữ liệu từ db.json (phiên bản cũ) sang SQLite. */
  migrate() {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(this.legacyFile, 'utf8'));
    } catch (e) {
      // File hỏng: đổi tên để giữ lại thay vì để lần ghi sau đè mất
      const bad = `${this.legacyFile}.corrupt-${stamp()}`;
      fs.renameSync(this.legacyFile, bad);
      this.recovered = bad;
      console.warn(`[store] file dữ liệu bị hỏng (${e.message}) — đã giữ lại tại ${bad}, bắt đầu với kho trống`);
      return;
    }
    this.fill(raw);
    for (const t of ['posts', 'profiles']) for (const k of Object.keys(this.data[t])) this.dirty[t].add(k);
    this.flush();
    fs.renameSync(this.legacyFile, this.legacyFile + '.migrated');
    this.migrated = Object.keys(raw.posts || {}).length;
    console.log(`[store] đã chuyển ${this.migrated} bài viết từ ${path.basename(this.legacyFile)} sang SQLite (${path.basename(this.file)})`);
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  /** Ghi mọi thay đổi trong một transaction: bài viết/hồ sơ đã đổi + các danh sách nhỏ nếu khác lần trước. */
  flush() {
    clearTimeout(this.timer);
    if (!this.db) return;
    const tables = [['posts', 'putPost', 'delPost'], ['profiles', 'putProfile', 'delProfile']];
    const small = {};
    this.db.exec('BEGIN');
    try {
      for (const [t, put, del] of tables) {
        if (this.replaced[t]) this.db.exec(`DELETE FROM ${t}`);
        const obj = this.data[t];
        for (const k of this.dirty[t]) {
          if (k in obj) this.sql[put].run(k, strip(obj[k]));
          else if (!this.replaced[t]) this.sql[del].run(k);
        }
      }
      for (const k of SMALL) {
        const v = (small[k] = strip(this.data[k]));
        if (this.written[k] !== v) this.sql.putKv.run(k, v);
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    Object.assign(this.written, small);
    for (const t of ['posts', 'profiles']) { this.dirty[t].clear(); this.replaced[t] = false; }
  }

  close() {
    if (!this.db) return;
    this.flush();
    this.db.close();
    this.db = null;
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
