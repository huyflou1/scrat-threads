/* Scrat Thread by HuyFlou — Tiện ích. */
import { AV_COLORS } from './config.js';

/* =====================================================
   Tiện ích
   ===================================================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('vi-VN');
const cf = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });
const num = (n) => nf.format(n || 0);
const compact = (n) => ((n || 0) < 10000 ? nf.format(n || 0) : cf.format(n));
const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });

function ago(iso) {
  if (!iso) return '—';
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 45) return 'vừa xong';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(iso).toLocaleDateString('vi-VN');
}
const fullDate = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function hashColor(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AV_COLORS[Math.abs(h) % AV_COLORS.length];
}

function avatar(u, size = '') {
  const name = u.username || '?';
  const fb = `<span class="avatar ${size}" style="background:${hashColor(name)}">${esc((u.full_name || name).trim()[0] || '?').toUpperCase()}</span>`;
  if (!u.avatar) return fb;
  return `<img class="avatar ${size}" src="${esc(img(u.avatar))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fb="${esc(fb)}" onerror="this.outerHTML=this.dataset.fb">`;
}

// Chỉ cho phép link http(s) — chặn javascript:, data:… trong dữ liệu cào về / file khôi phục
const safeUrl = (u) => {
  try { const x = new URL(String(u || ''), location.href); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; }
};

// Ảnh từ CDN của Meta phải đi qua proxy của máy chủ
const img = (u) => (u ? '/api/img?u=' + encodeURIComponent(u) : '');

const verified = (v) => (v ? `<svg class="ic verified" aria-label="Đã xác minh"><use href="#i-badge"/></svg>` : '');

function richText(t) {
  return esc(t).replace(/(^|\s)([#@][\p{L}\p{N}_.]+)/gu, '$1<span class="tag">$2</span>');
}

function tile(icon, color, size = '') {
  return `<span class="tile ${size} c-${color}">${ic(icon)}</span>`;
}

function empty(title, text, action = '', small = false) {
  return `<div class="empty ${small ? 'sm' : ''}"><svg class="mascot"><use href="#i-acorn"/></svg><b>${title}</b><p>${text}</p>${action}</div>`;
}

function parseUsername(s) {
  if (!s) return null;
  s = String(s).trim();
  const m = s.match(/threads\.(?:net|com)\/@([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s.toLowerCase() : null;
}
const parsePostUrl = (s) => {
  const m = String(s || '').trim().match(/threads\.(?:net|com)\/@([^/?#\s]+)\/post\/([A-Za-z0-9_-]+)/i);
  return m ? { username: m[1].toLowerCase(), code: m[2] } : null;
};

/** Đoán loại tác vụ từ chuỗi người dùng nhập/dán. */
function detect(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const lines = s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  if (lines.length > 1) return { type: 'batch', body: { items: s }, text: `${lines.length} mục hàng loạt` };
  const post = parsePostUrl(s);
  if (post) return { type: 'post', body: { url: s }, text: `bài viết ${post.code} của @${post.username}` };
  if (/threads\.(net|com)\/@/i.test(s) || /^@[A-Za-z0-9._]+$/.test(s)) {
    const u = parseUsername(s);
    if (u) return { type: 'profile', body: { username: u }, text: `hồ sơ @${u}` };
  }
  return { type: 'search', body: { query: s }, text: `từ khóa “${s}”` };
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.auth) {
    // Phiên hết hạn: nhớ trang đang xem rồi chuyển tới trang đăng nhập
    try { sessionStorage.setItem('st-next', location.hash); } catch { /* bỏ qua */ }
    location.href = '/login.html';
  }
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== '' && v != null) p.set(k, v);
  return p.toString();
};

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export { $, $$, esc, nf, cf, num, compact, rtf, ago, fullDate, hashColor, avatar, safeUrl, img, verified, richText, tile, empty, parseUsername, parsePostUrl, detect, api, qs, debounce };
