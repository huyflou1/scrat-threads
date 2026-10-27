'use strict';

/**
 * Lịch cào tự động: tạo lại tác vụ theo chu kỳ (vd: theo dõi hồ sơ mỗi ngày).
 * Lưu trong store.data.schedules, kiểm tra mỗi 30 giây.
 */

const crypto = require('crypto');

const MIN_EVERY = 15; // phút

class Scheduler {
  constructor(store, jobs) {
    this.store = store;
    this.jobs = jobs;
    if (!Array.isArray(store.data.schedules)) store.data.schedules = [];
    this.timer = setInterval(() => this.tick(), 30000);
    this.timer.unref();
  }

  list() {
    return this.store.data.schedules;
  }

  get(id) {
    return this.list().find((s) => s.id === id);
  }

  /** Tạo lịch; kiểm tra đầu vào bằng cách tạo luôn tác vụ đầu tiên. */
  create(type, raw, every) {
    every = Math.round(Number(every));
    if (!Number.isFinite(every) || every < MIN_EVERY) throw new Error(`Chu kỳ tối thiểu ${MIN_EVERY} phút`);
    const job = this.jobs.create(type, raw);
    const now = Date.now();
    const s = {
      id: crypto.randomBytes(6).toString('hex'),
      type,
      label: job.label,
      raw: stripRaw(type, raw),
      every,
      enabled: true,
      created_at: new Date(now).toISOString(),
      last_run: new Date(now).toISOString(),
      next_run: new Date(now + every * 60000).toISOString(),
      last_job_id: job.id,
      runs: 1,
    };
    job.schedule_id = s.id;
    this.list().unshift(s);
    this.store.save();
    this.jobs.emit('schedule', s);
    return { schedule: s, job };
  }

  update(id, patch) {
    const s = this.get(id);
    if (!s) return null;
    if ('every' in patch) {
      const every = Math.round(Number(patch.every));
      if (!Number.isFinite(every) || every < MIN_EVERY) throw new Error(`Chu kỳ tối thiểu ${MIN_EVERY} phút`);
      s.every = every;
      s.next_run = new Date(Date.parse(s.last_run || s.created_at) + every * 60000).toISOString();
    }
    if ('enabled' in patch) {
      s.enabled = !!patch.enabled;
      // Bật lại sau thời gian dài thì không chạy dồn, chỉ chạy một lần ở lượt kiểm tra tới
      if (s.enabled && Date.parse(s.next_run) < Date.now()) s.next_run = new Date().toISOString();
    }
    this.store.save();
    this.jobs.emit('schedule', s);
    return s;
  }

  remove(id) {
    const before = this.list().length;
    this.store.data.schedules = this.list().filter((s) => s.id !== id);
    this.store.save();
    return before !== this.list().length;
  }

  /** Chạy ngay một lịch. Bỏ qua nếu lượt trước vẫn đang chạy. */
  run(id) {
    const s = this.get(id);
    if (!s) return null;
    const prev = s.last_job_id && this.store.getJob(s.last_job_id);
    if (prev && (prev.status === 'running' || prev.status === 'queued')) return { schedule: s, job: prev, skipped: true };
    const job = this.jobs.create(s.type, s.raw);
    job.schedule_id = s.id;
    const now = Date.now();
    s.last_run = new Date(now).toISOString();
    s.next_run = new Date(now + s.every * 60000).toISOString();
    s.last_job_id = job.id;
    s.runs = (s.runs || 0) + 1;
    this.store.save();
    this.jobs.emit('schedule', s);
    return { schedule: s, job };
  }

  tick() {
    const now = Date.now();
    for (const s of this.list()) {
      if (!s.enabled || Date.parse(s.next_run) > now) continue;
      try {
        this.run(s.id);
      } catch (e) {
        // Đầu vào không còn hợp lệ: tắt lịch để không lặp lỗi
        s.enabled = false;
        s.error = e.message;
        this.store.save();
        this.jobs.emit('schedule', s);
      }
    }
  }
}

function stripRaw(type, raw) {
  const keep = { profile: ['username'], post: ['url'], search: ['query', 'mode'], batch: ['items'] }[type] || [];
  const out = { limit: raw.limit };
  for (const k of keep) if (raw[k] != null) out[k] = raw[k];
  return out;
}

module.exports = { Scheduler, MIN_EVERY };
