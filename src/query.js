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
  const s = String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCSV(rows, kind) {
  const cols = kind === 'profiles' ? PROFILE_COLUMNS : POST_COLUMNS;
  const lines = [cols.map((c) => c[1]).join(',')];
  for (const r of rows) lines.push(cols.map(([k]) => cell(r[k])).join(','));
  // BOM để Excel đọc đúng tiếng Việt
  return '﻿' + lines.join('\r\n');
}

function toJSON(rows) {
  return JSON.stringify(rows.map(({ sources, history, ...r }) => r), null, 2);
}

module.exports = { filterPosts, filterProfiles, toCSV, toJSON, engagement };
