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
 * Tìm bài vừa đăng trong danh sách bài / trả lời gần đây của tài khoản (khớp nội dung,
 * đăng sau thời điểm tạo container). Dùng khi publish đã gửi nhưng mất phản hồi.
 */
async function findPublished(token, text, since) {
  const after = Date.parse(since || 0) - 5 * 60000;
  for (const edge of ['/me/threads', '/me/replies']) {
    let d;
    try {
      d = await call(token, edge, { params: { fields: 'id,text,timestamp', limit: 25 } });
    } catch (e) {
      if (e.transient) throw e;
      continue; // thiếu quyền đọc trả lời thì bỏ qua
    }
    const hit = (d.data || []).find((m) => String(m.text || '').trim() === text.trim() && (!m.timestamp || Date.parse(m.timestamp) >= after));
    if (hit) return hit.id;
  }
  return null;
}

/**
 * Đăng một bài (hoặc chuỗi thread). Có thể tiếp tục từ phần đã đăng dở:
 * truyền `done` là danh sách media id đã đăng; mỗi phần đăng xong gọi onPart(ids).
 *
 * Chống đăng trùng: trước khi publish, container của phần đang đăng được báo qua
 * onContainer({ index, id, text, created_at }) để bên gọi lưu lại (`pending`). Lần thử lại
 * sau lỗi mạng sẽ hỏi trạng thái container đó trước: đã PUBLISHED thì tìm id bài thay vì
 * đăng lại; còn FINISHED thì publish đúng container cũ.
 * Trả về { ids, permalink }.
 */
async function publish(token, { parts, imageUrl, done = [], pending = null, onPart, onContainer = () => {}, wait = sleep }) {
  const list = (parts || []).map((p) => String(p || '').trim()).filter(Boolean);
  if (!list.length) throw new ThreadsError('Bài viết đang trống');
  list.forEach((p, i) => {
    const n = threadsLength(p);
    if (n > LIMIT) throw new ThreadsError(`Phần ${i + 1} dài ${n}/${LIMIT} ký tự — Threads không cho đăng`);
  });

  const ids = [...done];
  for (let i = ids.length; i < list.length; i++) {
    const withImage = i === 0 && !!imageUrl;
    let cid = null;

    if (pending && pending.index === i && pending.id) {
      const st = await call(token, `/${pending.id}`, { params: { fields: 'status' } })
        .catch((e) => { if (e.transient) throw e; return { status: 'EXPIRED' }; });
      if (st.status === 'PUBLISHED') {
        const found = await findPublished(token, pending.text || list[i], pending.created_at);
        if (!found) {
          throw new ThreadsError(`Phần ${i + 1} đã lên Threads nhưng không lấy được mã bài — kiểm tra trên Threads, đừng đăng lại để tránh trùng`);
        }
        ids.push(found);
        onContainer(null);
        if (onPart) onPart([...ids]);
        continue;
      }
      // Container còn dùng được thì publish lại đúng nó, không tạo bài mới
      if (st.status !== 'ERROR' && st.status !== 'EXPIRED') cid = pending.id;
    }

    if (!cid) {
      const params = { media_type: withImage ? 'IMAGE' : 'TEXT', text: list[i] };
      if (withImage) params.image_url = imageUrl;
      if (i > 0) params.reply_to_id = ids[i - 1];
      cid = (await call(token, '/me/threads', { method: 'POST', params })).id;
      onContainer({ index: i, id: cid, text: list[i], created_at: new Date().toISOString() });
    }
    await waitReady(token, cid, { hasMedia: withImage, wait });
    const pub = await call(token, '/me/threads_publish', { method: 'POST', params: { creation_id: cid } });
    ids.push(pub.id);
    onContainer(null);
    if (onPart) onPart([...ids]);
  }

  let permalink = null;
  try {
    permalink = (await call(token, `/${ids[0]}`, { params: { fields: 'permalink' } })).permalink || null;
  } catch { /* bài đã đăng, chỉ thiếu link */ }
  return { ids, permalink };
}

module.exports = { BASE, LIMIT, threadsLength, ThreadsError, me, quota, publish, call };
