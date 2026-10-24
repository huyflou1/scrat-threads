'use strict';

/**
 * Hàng đợi tác vụ cào dữ liệu: xếp hàng, chạy song song có giới hạn,
 * phát sự kiện tiến độ để giao diện cập nhật trực tiếp (SSE).
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');
const { parseUsername, parsePostUrl } = require('./extract');
const { CancelledError, BASE } = require('./scraper');

const TYPES = {
  profile: 'Hồ sơ',
  post: 'Bài viết',
  search: 'Từ khóa',
  batch: 'Hàng loạt',
};

class JobManager extends EventEmitter {
  constructor(store, scraper) {
    super();
    this.store = store;
    this.scraper = scraper;
    this.running = new Map(); // id -> signal
  }

  /** Kiểm tra & chuẩn hóa đầu vào, trả về job mới hoặc ném lỗi tiếng Việt. */
  create(type, raw = {}) {
    if (!TYPES[type]) throw new Error('Loại tác vụ không hợp lệ');
    const limit = clamp(parseInt(raw.limit, 10) || 30, 1, 1000);
    let input;
    let label;
    if (type === 'profile') {
      const username = parseUsername(raw.username);
      if (!username) throw new Error('Tên người dùng không hợp lệ');
      input = { username, limit };
      label = `@${username}`;
    } else if (type === 'post') {
      const p = parsePostUrl(raw.url);
      if (!p) throw new Error('Link bài viết không hợp lệ (dạng threads.com/@user/post/CODE)');
      input = { ...p, limit };
      label = `@${p.username}/${p.code}`;
    } else if (type === 'search') {
      const query = String(raw.query || '').trim();
      if (!query) throw new Error('Hãy nhập từ khóa');
      input = { query, mode: raw.mode === 'recent' ? 'recent' : 'top', limit };
      label = `“${query}”`;
    } else {
      const items = String(raw.items || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      const parsed = [];
      const bad = [];
      for (const it of items) {
        const post = parsePostUrl(it);
        const user = !post && parseUsername(it);
        if (post) parsed.push({ kind: 'post', ...post });
        else if (user) parsed.push({ kind: 'profile', username: user });
        else bad.push(it);
      }
      if (!parsed.length) throw new Error('Danh sách trống hoặc không hợp lệ');
      if (parsed.length > 200) throw new Error('Tối đa 200 mục mỗi lần');
      input = { items: parsed, limit, skipped: bad };
      label = `${parsed.length} mục`;
    }

    const job = this.store.addJob({
      id: crypto.randomBytes(6).toString('hex'),
      type,
      type_label: TYPES[type],
      label,
      input,
      status: 'queued',
      progress: { current: 0, total: type === 'batch' ? input.items.length : limit },
      stats: { posts: 0, profiles: 0, new_posts: 0 },
      logs: [],
      created_at: new Date().toISOString(),
      started_at: null,
      finished_at: null,
      error: null,
    });
    if (type === 'batch' && input.skipped.length) {
      this.log(job, `Bỏ qua ${input.skipped.length} dòng không hợp lệ: ${input.skipped.slice(0, 5).join(', ')}`, 'warn');
    }
    this.emitJob(job);
    this.pump();
    return job;
  }

  cancel(id) {
    const job = this.store.getJob(id);
    if (!job) return null;
    if (job.status === 'queued') {
      this.finish(job, 'cancelled');
    } else if (this.running.has(id)) {
      this.running.get(id).cancelled = true;
      this.log(job, 'Đang dừng…', 'warn');
    }
    return job;
  }

  retry(id) {
    const job = this.store.getJob(id);
    if (!job) return null;
    const raw = job.type === 'batch'
      ? { items: job.input.items.map((i) => (i.kind === 'post' ? i.url : i.username)).join('\n'), limit: job.input.limit }
      : { ...job.input, items: undefined };
    return this.create(job.type, raw);
  }

  pump() {
    const max = this.store.getSettings().concurrency || 1;
    const queued = this.store.data.jobs.filter((j) => j.status === 'queued').reverse(); // cũ nhất trước
    while (this.running.size < max && queued.length) {
      const job = queued.shift();
      this.run(job);
    }
  }

  log(job, msg, level = 'info') {
    job.logs.push({ t: new Date().toISOString(), level, msg });
    if (job.logs.length > 200) job.logs.splice(0, job.logs.length - 200);
    this.emitJob(job);
  }

  emitJob(job) {
    this.store.save();
    // Gộp sự kiện để không spam giao diện
    if (job._emitTimer) return;
    job._emitTimer = setTimeout(() => {
      job._emitTimer = null;
      this.emit('job', publicJob(job));
    }, 120);
  }

  finish(job, status, error = null) {
    job.status = status;
    job.error = error;
    job.finished_at = new Date().toISOString();
    this.running.delete(job.id);
    this.emitJob(job);
    this.emit('data');
    this.pump();
  }

  async run(job) {
    const signal = { cancelled: false };
    this.running.set(job.id, signal);
    job.status = 'running';
    job.started_at = new Date().toISOString();
    this.emitJob(job);

    const settings = { ...this.store.getSettings() };
    let session;
    try {
      session = await this.scraper.session({ settings, signal, log: (m, l) => this.log(job, m, l) });
      const runner = { profile: this.runProfile, post: this.runPost, search: this.runSearch, batch: this.runBatch }[job.type];
      await runner.call(this, job, session, settings);
      if (!job.stats.posts && !job.stats.profiles) {
        this.log(job, 'Không thu được dữ liệu. Có thể Threads yêu cầu đăng nhập hoặc nội dung không công khai.', 'warn');
      }
      this.log(job, `Hoàn tất: ${job.stats.posts} bài viết, ${job.stats.profiles} hồ sơ`, 'success');
      this.finish(job, 'done');
    } catch (e) {
      if (e instanceof CancelledError || signal.cancelled) {
        this.log(job, 'Đã hủy tác vụ', 'warn');
        this.finish(job, 'cancelled');
      } else {
        this.log(job, e.message, 'error');
        this.finish(job, 'failed', e.message);
      }
    } finally {
      if (session) await session.close();
    }
  }

  /** Lưu kết quả hiện có trong session vào kho. */
  persist(job, session, { filter, source, parentCode } = {}) {
    let posts = [...session.acc.posts.values()];
    if (filter) posts = posts.filter(filter);
    if (parentCode) {
      posts = posts.map((p) => (p.code !== parentCode ? { ...p, parent_code: parentCode } : p));
    }
    const added = this.store.upsertPosts(posts, { source });
    job.stats.new_posts += added;
    this.store.upsertProfiles([...session.acc.users.values()]);
    this.emit('data');
    return posts.length;
  }

  async runProfile(job, session, settings, sub) {
    const { username } = sub || job.input;
    const limit = job.input.limit;
    const mine = (p) => p.username === username && (settings.includeReplies || !p.is_reply);
    const count = () => [...session.acc.posts.values()].filter(mine).length;

    await session.open(`${BASE}/@${username}`);
    const user = session.acc.users.get(username);
    if (user) {
      this.log(job, `Hồ sơ @${username}: ${fmt(user.follower_count)} người theo dõi`);
      if (user.private) this.log(job, 'Tài khoản riêng tư — chỉ lấy được thông tin cơ bản', 'warn');
    } else {
      this.log(job, `Không tìm thấy thông tin hồ sơ @${username}`, 'warn');
    }

    const update = (n) => {
      if (!sub) job.progress.current = Math.min(n, limit);
      job.stats.posts = (sub ? job._base || 0 : 0) + Math.min(n, limit);
      this.persist(job, session, { filter: mine, source: `profile:${username}` });
      this.emitJob(job);
    };
    update(count());
    await session.scroll({ target: limit, count, onProgress: update });
    update(count());
    job.stats.profiles = sub ? job.stats.profiles + (user ? 1 : 0) : (user ? 1 : 0);
  }

  async runPost(job, session, settings, sub) {
    const { url, code } = sub || job.input;
    const limit = job.input.limit;
    const count = () => [...session.acc.posts.values()].filter((p) => p.code !== code).length;

    await session.open(url);
    const main = [...session.acc.posts.values()].find((p) => p.code === code);
    if (main) this.log(job, `Bài viết của @${main.username}: ${fmt(main.like_count)} lượt thích, ${fmt(main.reply_count)} trả lời`);
    else this.log(job, 'Không đọc được nội dung bài viết', 'warn');

    const update = (n) => {
      if (!sub) job.progress.current = Math.min(n, limit);
      job.stats.posts = (sub ? job._base || 0 : 0) + session.acc.posts.size;
      this.persist(job, session, { source: `post:${code}`, parentCode: code });
      this.emitJob(job);
    };
    update(count());
    if (settings.includeReplies && main && main.reply_count > 0) {
      await session.scroll({ target: limit, count, onProgress: update });
      update(count());
    }
  }

  async runSearch(job, session) {
    const { query, mode, limit } = job.input;
    const url = `${BASE}/search?q=${encodeURIComponent(query)}&serp_type=default${mode === 'recent' ? '&filter=recent' : ''}`;
    const count = () => session.acc.posts.size;
    await session.open(url);
    const update = (n) => {
      job.progress.current = Math.min(n, limit);
      job.stats.posts = n;
      this.persist(job, session, { source: `search:${query}` });
      this.emitJob(job);
    };
    update(count());
    await session.scroll({ target: limit, count, onProgress: update });
    update(count());
    job.stats.profiles = session.acc.users.size;
  }

  async runBatch(job, session, settings) {
    const items = job.input.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      this.log(job, `(${i + 1}/${items.length}) ${it.kind === 'post' ? it.url : '@' + it.username}`);
      job._base = job.stats.posts;
      session.acc.posts.clear();
      try {
        if (it.kind === 'post') await this.runPost(job, session, settings, it);
        else await this.runProfile(job, session, settings, it);
      } catch (e) {
        if (e instanceof CancelledError) throw e;
        this.log(job, `Lỗi với mục ${i + 1}: ${e.message}`, 'error');
      }
      job.progress.current = i + 1;
      this.emitJob(job);
      if (i < items.length - 1) await session.sleep(session.jitter());
    }
    delete job._base;
  }
}

function publicJob(j) {
  const { _emitTimer, _base, ...rest } = j;
  return rest;
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function fmt(n) {
  return new Intl.NumberFormat('vi-VN').format(n || 0);
}

module.exports = { JobManager, publicJob, TYPES };
