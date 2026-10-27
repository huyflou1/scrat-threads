'use strict';

/**
 * Hàng đợi đăng bài: nháp, hẹn giờ, tự đăng khi đến giờ, thử lại khi lỗi tạm thời.
 * Lưu trong store.data.outbox, kiểm tra mỗi 20 giây.
 */

const crypto = require('crypto');
const threads = require('./threads-api');
const { pickMethod } = require('./browser-poster');

const MAX_ATTEMPTS = 3;
const STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed'];

class Outbox {
  constructor(store, { api = threads, browser = null, onChange = () => {}, onNotify = () => {} } = {}) {
    this.store = store;
    this.api = api;
    // browser(settings, opts): đăng bằng trình duyệt với phiên đăng nhập (src/browser-poster.js)
    this.browser = browser;
    this.onChange = onChange;
    this.onNotify = onNotify;
    if (!Array.isArray(store.data.outbox)) store.data.outbox = [];
    // Tắt app khi đang đăng: không biết bài đã lên chưa, không tự đăng lại để tránh trùng
    for (const p of this.list()) {
      if (p.status === 'publishing') {
        p.status = 'failed';
        p.error = 'Ứng dụng tắt khi đang đăng — kiểm tra trên Threads trước khi thử lại để tránh đăng trùng';
      }
    }
    this.busy = false;
    this.timer = setInterval(() => this.tick(), 20000);
    this.timer.unref();
  }

  list() {
    return this.store.data.outbox;
  }

  get(id) {
    return this.list().find((p) => p.id === id);
  }

  /** Chuẩn hóa & kiểm tra nội dung từ giao diện. */
  clean(raw, prev = {}) {
    const parts = (Array.isArray(raw.parts) ? raw.parts : prev.parts || [])
      .map((t) => String(t || '').trim()).filter(Boolean).slice(0, 20);
    if (!parts.length) throw new Error('Bài viết đang trống');
    parts.forEach((t, i) => {
      const n = threads.threadsLength(t);
      if (n > threads.LIMIT) throw new Error(`Phần ${i + 1} dài ${n}/${threads.LIMIT} ký tự — hãy rút gọn`);
    });
    let imageUrl = raw.image_url !== undefined ? String(raw.image_url || '').trim() : prev.image_url || '';
    if (imageUrl && !/^https:\/\/\S+$/i.test(imageUrl)) throw new Error('Link ảnh phải là địa chỉ https công khai');
    let at = raw.scheduled_at !== undefined ? raw.scheduled_at : prev.scheduled_at;
    if (at) {
      const t = Date.parse(at);
      if (!Number.isFinite(t)) throw new Error('Thời gian hẹn không hợp lệ');
      if (t < Date.now() - 60000) throw new Error('Thời gian hẹn đã qua');
      at = new Date(t).toISOString();
    }
    return { parts, image_url: imageUrl || null, scheduled_at: at || null };
  }

  create(raw) {
    const c = this.clean(raw);
    const post = {
      id: crypto.randomBytes(6).toString('hex'),
      ...c,
      status: c.scheduled_at ? 'scheduled' : 'draft',
      model: raw.model ? String(raw.model) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: null,
      media_ids: [],
      permalink: null,
      error: null,
      attempts: 0,
    };
    this.list().unshift(post);
    this.save(post);
    return post;
  }

  update(id, raw) {
    const post = this.get(id);
    if (!post) return null;
    if (post.status === 'publishing') throw new Error('Bài đang được đăng, chờ một chút');
    if (post.status === 'published') throw new Error('Bài đã đăng, không sửa được nữa');
    if ((post.media_ids.length || post.pending) && raw.parts) throw new Error('Bài có thể đã lên Threads một phần — chỉ có thể thử lại phần còn lại');
    Object.assign(post, this.clean(raw, post));
    if ('scheduled_at' in raw) post.status = post.scheduled_at ? 'scheduled' : 'draft';
    post.error = null;
    post.attempts = 0;
    post.updated_at = new Date().toISOString();
    this.save(post);
    return post;
  }

  remove(id) {
    const post = this.get(id);
    if (post && post.status === 'publishing') throw new Error('Bài đang được đăng, chờ một chút');
    this.store.data.outbox = this.list().filter((p) => p.id !== id);
    this.store.save();
    this.onChange({ id, removed: true });
    return !!post;
  }

  save(post) {
    this.store.save();
    this.onChange(post);
  }

  /** Đăng ngay một bài (bỏ qua giờ hẹn). */
  async publishNow(id) {
    const post = this.get(id);
    if (!post) throw new Error('Không tìm thấy bài');
    if (post.status === 'published') throw new Error('Bài đã đăng rồi');
    if (post.status === 'publishing') throw new Error('Bài đang được đăng');
    return this.publish(post);
  }

  async publish(post) {
    const settings = this.store.getSettings();
    post.status = 'publishing';
    post.error = null;
    post.attempts++;
    this.save(post);
    try {
      const method = pickMethod(settings);
      if (!method || (method === 'browser' && !this.browser)) {
        throw new threads.ThreadsError(settings.postMethod === 'api'
          ? 'Chưa có Threads access token — thêm trong Cài đặt → AI & Đăng bài'
          : 'Chưa có cách đăng bài: đăng nhập Threads trong Cài đặt (hoặc nhập Threads access token)');
      }
      // Đổi cách đăng giữa chừng thì mã bài cũ không dùng chung được
      if (post.method && post.method !== method && (post.media_ids.length || post.pending)) {
        throw new threads.ThreadsError('Bài đã đăng dở bằng cách khác — kiểm tra trên Threads rồi tạo bài mới cho phần còn lại');
      }
      post.method = method;
      const opts = {
        parts: post.parts,
        imageUrl: post.image_url,
        done: post.media_ids,
        pending: post.pending || null,
        onPart: (got) => { post.media_ids = got; this.save(post); },
        // Lưu ngay container sắp publish: lỗi mạng sau đó vẫn đối soát được, không đăng trùng
        onContainer: (c) => { post.pending = c; this.store.save(); this.store.flush(); },
      };
      const { ids, permalink } = method === 'browser'
        ? await this.browser(settings, opts)
        : await this.api.publish(settings.threadsToken, opts);
      post.media_ids = ids;
      post.permalink = permalink;
      post.status = 'published';
      post.published_at = new Date().toISOString();
      this.save(post);
      this.onNotify({
        kind: 'posted',
        title: post.parts.length > 1 ? `Đã đăng chuỗi ${post.parts.length} phần lên Threads` : 'Đã đăng bài lên Threads',
        body: post.parts[0].slice(0, 140),
        link: '#/compose?tab=queue',
      });
    } catch (e) {
      const retry = e.transient && post.attempts < MAX_ATTEMPTS;
      post.error = e.message;
      if (retry) {
        // Thử lại sau 2, 4… phút
        post.status = 'scheduled';
        post.scheduled_at = new Date(Date.now() + post.attempts * 2 * 60000).toISOString();
      } else {
        post.status = 'failed';
        this.onNotify({ kind: 'error', title: 'Đăng bài lên Threads thất bại', body: e.message, link: '#/compose?tab=queue' });
      }
      this.save(post);
    }
    return post;
  }

  /** Đăng lần lượt các bài đến hạn (mỗi lượt một bài để tránh dồn dập). */
  async tick(now = Date.now()) {
    if (this.busy) return;
    const due = this.list()
      .filter((p) => p.status === 'scheduled' && p.scheduled_at && Date.parse(p.scheduled_at) <= now)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
    if (!due) return;
    this.busy = true;
    try {
      await this.publish(due);
    } finally {
      this.busy = false;
    }
  }
}

module.exports = { Outbox, STATUSES, MAX_ATTEMPTS };
