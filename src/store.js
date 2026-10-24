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
    this.data = { posts: {}, profiles: {}, jobs: [], settings: { ...DEFAULT_SETTINGS } };
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = {
        posts: raw.posts || {},
        profiles: raw.profiles || {},
        jobs: raw.jobs || [],
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
      if (!prev) added++;
      this.data.posts[p.id] = {
        ...prev,
        ...p,
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

  clearAll() {
    this.data.posts = {};
    this.data.profiles = {};
    this.data.jobs = this.data.jobs.filter((j) => j.status === 'running' || j.status === 'queued');
    this.save();
  }
}

module.exports = { Store, DEFAULT_SETTINGS };
