'use strict';

/**
 * Đăng bài qua Threads API chính thức của Meta (graph.threads.com).
 * Cần access token có quyền threads_basic + threads_content_publish
 * (và threads_manage_replies để đăng chuỗi thread nhiều phần).
 */

const BASE = process.env.THREADS_API_BASE || 'https://graph.threads.com/v1.0';
const LIMIT = 500;

/**
 * Độ dài theo cách Threads tính: emoji tính bằng số byte UTF-8 của nó,
 * ký tự khác tính là 1. (public/compose.js dùng bản sao của hàm này.)
 */
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[‍️⃣]|[\u{1F3FB}-\u{1F3FF}]/u;
function threadsLength(text) {
  let n = 0;
  for (const ch of String(text || '')) n += EMOJI.test(ch) ? Buffer.byteLength(ch, 'utf8') : 1;
  return n;
}

class ThreadsError extends Error {
  constructor(message, { status, code, transient } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    // Lỗi tạm thời (mạng, 5xx, giới hạn tốc độ) thì nên thử lại sau
    this.transient = !!transient;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(token, path, { method = 'GET', params = {} } = {}) {
  if (!token) throw new ThreadsError('Chưa có Threads access token — thêm trong Cài đặt → AI & Đăng bài');
  const body = new URLSearchParams({ ...params, access_token: token });
  const url = method === 'GET' ? `${BASE}${path}?${body}` : `${BASE}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      body: method === 'GET' ? undefined : body,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    throw new ThreadsError(`Không kết nối được tới Threads: ${e.message}`, { transient: true });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err = data.error || {};
    const code = err.code;
    // 4, 17, 32, 613: giới hạn tốc độ của Graph API; 190: token hết hạn / không hợp lệ
    const rate = [4, 17, 32, 613].includes(code) || res.status === 429;
    const msg = code === 190 ? 'Threads access token đã hết hạn hoặc không hợp lệ — tạo token mới'
      : rate ? 'Threads đang giới hạn tốc độ đăng — sẽ thử lại sau'
        : err.message || `Threads trả lỗi ${res.status}`;
    throw new ThreadsError(msg, { status: res.status, code, transient: rate || res.status >= 500 });
  }
  return data;
}

/** Thông tin tài khoản gắn với token. */
function me(token) {
  return call(token, '/me', { params: { fields: 'id,username,name,threads_profile_picture_url' } });
}

/** Hạn mức đăng còn lại trong 24 giờ. */
async function quota(token) {
  const d = await call(token, '/me/threads_publishing_limit', { params: { fields: 'quota_usage,config' } });
  const row = (d.data && d.data[0]) || {};
  return { used: row.quota_usage || 0, total: (row.config && row.config.quota_total) || 250 };
}

/** Chờ container xử lý xong (FINISHED) trước khi publish. */
async function waitReady(token, id, { hasMedia, wait = sleep }) {
  const interval = hasMedia ? 10000 : 3000;
  const deadline = Date.now() + (hasMedia ? 5 * 60000 : 60000);
  await wait(hasMedia ? 5000 : 1500);
  while (true) {
    const s = await call(token, `/${id}`, { params: { fields: 'status,error_message' } });
    if (s.status === 'FINISHED' || !s.status) return;
    if (s.status === 'ERROR' || s.status === 'EXPIRED') {
      throw new ThreadsError(`Threads không xử lý được bài: ${s.error_message || s.status}`);
    }
    if (s.status === 'PUBLISHED') return;
    if (Date.now() > deadline) throw new ThreadsError('Threads xử lý bài quá lâu', { transient: true });
    await wait(interval);
  }
}

/**
 * Đăng một bài (hoặc chuỗi thread). Có thể tiếp tục từ phần đã đăng dở:
 * truyền `done` là danh sách media id đã đăng; mỗi phần đăng xong gọi onPart(ids).
 * Trả về { ids, permalink }.
 */
async function publish(token, { parts, imageUrl, done = [], onPart, wait = sleep }) {
  const list = (parts || []).map((p) => String(p || '').trim()).filter(Boolean);
  if (!list.length) throw new ThreadsError('Bài viết đang trống');
  list.forEach((p, i) => {
    const n = threadsLength(p);
    if (n > LIMIT) throw new ThreadsError(`Phần ${i + 1} dài ${n}/${LIMIT} ký tự — Threads không cho đăng`);
  });

  const ids = [...done];
  for (let i = ids.length; i < list.length; i++) {
    const withImage = i === 0 && !!imageUrl;
    const params = { media_type: withImage ? 'IMAGE' : 'TEXT', text: list[i] };
    if (withImage) params.image_url = imageUrl;
    if (i > 0) params.reply_to_id = ids[i - 1];
    const container = await call(token, '/me/threads', { method: 'POST', params });
    await waitReady(token, container.id, { hasMedia: withImage, wait });
    const pub = await call(token, '/me/threads_publish', { method: 'POST', params: { creation_id: container.id } });
    ids.push(pub.id);
    if (onPart) onPart([...ids]);
  }

  let permalink = null;
  try {
    permalink = (await call(token, `/${ids[0]}`, { params: { fields: 'permalink' } })).permalink || null;
  } catch { /* bài đã đăng, chỉ thiếu link */ }
  return { ids, permalink };
}

module.exports = { BASE, LIMIT, threadsLength, ThreadsError, me, quota, publish, call };
