'use strict';

/** Lọc / sắp xếp / xuất dữ liệu — dùng chung cho danh sách và xuất file. */

const SORTS = {
  new: (a, b) => cmpDate(b.published_at, a.published_at),
  old: (a, b) => cmpDate(a.published_at, b.published_at),
  likes: (a, b) => b.like_count - a.like_count,
  replies: (a, b) => b.reply_count - a.reply_count,
  reposts: (a, b) => (b.repost_count + b.quote_count) - (a.repost_count + a.quote_count),
  engagement: (a, b) => engagement(b) - engagement(a),
};

function cmpDate(a, b) {
  return (a ? Date.parse(a) : 0) - (b ? Date.parse(b) : 0);
}

function engagement(p) {
  return p.like_count + p.reply_count * 2 + (p.repost_count + p.quote_count) * 3;
}

function strip(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

function filterPosts(posts, q = {}) {
  let out = posts;
  if (q.ids) {
    const ids = new Set(String(q.ids).split(','));
    out = out.filter((p) => ids.has(p.id));
  }
  if (q.q) {
    const terms = strip(q.q).split(/\s+/).filter(Boolean);
    out = out.filter((p) => {
      const hay = strip(`${p.text} ${p.username} ${p.full_name} ${(p.hashtags || []).join(' ')}`);
      return terms.every((t) => hay.includes(t));
    });
  }
  if (q.username) out = out.filter((p) => p.username === q.username);
  if (q.source) out = out.filter((p) => (p.sources || []).includes(q.source));
  if (q.media === 'with') out = out.filter((p) => p.media && p.media.length);
  if (q.media === 'without') out = out.filter((p) => !p.media || !p.media.length);
  if (q.replies === 'only') out = out.filter((p) => p.is_reply || p.parent_code);
  if (q.replies === 'exclude') out = out.filter((p) => !p.is_reply && !p.parent_code);
  const minLikes = Number(q.minLikes);
  if (minLikes > 0) out = out.filter((p) => p.like_count >= minLikes);
  if (q.from) out = out.filter((p) => p.published_at && p.published_at >= q.from);
  if (q.to) out = out.filter((p) => p.published_at && p.published_at <= `${q.to}T23:59:59.999Z`);
  return [...out].sort(SORTS[q.sort] || SORTS.new);
}

function filterProfiles(profiles, q = {}) {
  let out = profiles;
  if (q.q) {
    const t = strip(q.q);
    out = out.filter((u) => strip(`${u.username} ${u.full_name} ${u.bio}`).includes(t));
  }
  const sort = q.sort === 'name'
    ? (a, b) => a.username.localeCompare(b.username)
    : q.sort === 'recent'
      ? (a, b) => cmpDate(b.scraped_at, a.scraped_at)
      : (a, b) => b.follower_count - a.follower_count;
  return [...out].sort(sort);
}

/* ---------- Xuất file ---------- */

const POST_COLUMNS = [
  ['id', 'ID'], ['code', 'Mã'], ['url', 'Link'], ['username', 'Tài khoản'], ['full_name', 'Tên'],
  ['verified', 'Xác minh'], ['text', 'Nội dung'], ['published_at', 'Ngày đăng'],
  ['like_count', 'Thích'], ['reply_count', 'Trả lời'], ['repost_count', 'Đăng lại'], ['quote_count', 'Trích dẫn'],
  ['hashtags', 'Hashtag'], ['mentions', 'Nhắc tên'], ['media', 'Media'], ['link', 'Liên kết'],
  ['parent_code', 'Trả lời bài'], ['scraped_at', 'Thời điểm cào'],
];

const PROFILE_COLUMNS = [
  ['username', 'Tài khoản'], ['full_name', 'Tên'], ['verified', 'Xác minh'], ['private', 'Riêng tư'],
  ['follower_count', 'Người theo dõi'], ['bio', 'Tiểu sử'], ['links', 'Liên kết'], ['url', 'Link'],
  ['scraped_at', 'Thời điểm cào'],
];

function cell(v) {
  if (v == null) return '';
  if (Array.isArray(v)) v = v.map((x) => (typeof x === 'object' ? x.url : x)).join(' | ');
  else if (typeof v === 'boolean') v = v ? 'có' : 'không';
  let s = String(v);
  // Chặn CSV injection: ô bắt đầu bằng = + - @ (hoặc tab/CR) bị Excel hiểu thành công thức
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(rows, kind) {
  const cols = kind === 'profiles' ? PROFILE_COLUMNS : POST_COLUMNS;
  const lines = [cols.map((c) => c[1]).join(',')];
  for (const r of rows) lines.push(cols.map(([k]) => cell(r[k])).join(','));
  // BOM để Excel đọc đúng tiếng Việt
  return '﻿' + lines.join('\r\n');
}

// Độ rộng cột trong Excel (đơn vị ký tự)
const WIDTHS = { text: 70, bio: 50, url: 42, media: 40, link: 30, full_name: 22, username: 18, published_at: 19, scraped_at: 19, hashtags: 24, mentions: 20, links: 30 };
const DATE_KEYS = new Set(['published_at', 'scraped_at']);

function xlsxValue(k, v) {
  if (v == null) return null;
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? x.url : x)).join(' | ');
  if (typeof v === 'boolean') return v ? 'có' : 'không';
  // Ngày giờ dạng "2026-10-12 16:57:09" — dễ đọc và sắp xếp đúng
  if (DATE_KEYS.has(k)) return new Date(v).toLocaleString('sv-SE');
  return v;
}

function toXLSXFile(rows, kind) {
  const { toXLSX } = require('./xlsx');
  const cols = kind === 'profiles' ? PROFILE_COLUMNS : POST_COLUMNS;
  return toXLSX({
    sheetName: kind === 'profiles' ? 'Hồ sơ' : 'Bài viết',
    columns: cols.map(([k, header]) => ({ header, width: WIDTHS[k] || 12 })),
    rows: rows.map((r) => cols.map(([k]) => xlsxValue(k, r[k]))),
  });
}

function toJSON(rows) {
  return JSON.stringify(rows.map(({ sources, history, ...r }) => r), null, 2);
}

/**
 * Bản đồ giờ đăng & khung giờ vàng.
 * - So mỗi bài với mức thường của chính tác giả (trung vị), để tài khoản lớn không lấn át.
 * - Mỗi ô lấy trung vị (không bị một bài viral kéo lệch), rồi "co" về mức trung bình 1×
 *   khi ít bài: ô 2 bài phải nổi bật hơn hẳn mới thắng ô 10 bài.
 */
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const MAX_LIFT = 5;
function goldenHours(roots, K = 3) {
  const byUser = new Map();
  for (const r of roots) byUser.set(r.user, [...(byUser.get(r.user) || []), r.e]);
  const userMed = new Map([...byUser].map(([u, es]) => [u, median(es)]));
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 8 }, () => ({ es: [], rs: [] })));
  for (const r of roots) {
    const c = cells[r.d][r.b];
    c.es.push(r.e);
    // Tác giả chỉ có 1 bài thì không so được, coi như mức thường (1×).
    // Mỗi bài tính tối đa 5×: một bài viral không tự biến cả khung giờ thành "vàng"
    c.rs.push(byUser.get(r.user).length > 1 ? Math.min(MAX_LIFT, (r.e + 1) / (userMed.get(r.user) + 1)) : 1);
  }
  const heat = cells.map((row) => row.map(({ es, rs }) => {
    const n = es.length;
    const lift = n ? median(rs) : 0;
    return {
      n,
      avg: n ? Math.round(es.reduce((a, b) => a + b, 0) / n) : 0,
      med: Math.round(median(es)),
      lift: Math.round(lift * 100) / 100,
      score: n ? Math.round(((n * lift + K) / (n + K)) * 1000) / 1000 : 0,
    };
  }));
  const flat = heat.flatMap((row, d) => row.map((c, b) => ({ ...c, d, b })));
  const pool = flat.filter((c) => c.n >= 2);
  const best = pool.length && roots.length >= 3
    ? pool.reduce((a, c) => (c.score > a.score || (c.score === a.score && c.n > a.n) ? c : a))
    : null;
  if (best) best.confidence = best.n >= 8 && roots.length >= 30 ? 'high' : best.n >= 4 ? 'medium' : 'low';
  return { heat, best };
}

module.exports = { goldenHours, median, filterPosts, filterProfiles, toCSV, toJSON, toXLSXFile, engagement };
