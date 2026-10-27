'use strict';

/**
 * Bộ trích xuất thuần (không phụ thuộc trình duyệt).
 * Threads nhúng dữ liệu vào các thẻ <script type="application/json" data-sjs>
 * và trả về JSON qua các request /graphql khi cuộn trang. Cấu trúc thay đổi
 * thường xuyên, nên thay vì bám vào đường dẫn cố định, ta duyệt toàn bộ cây
 * JSON và nhận diện object "trông giống" bài viết / hồ sơ.
 */

const MAX_DEPTH = 60;

/** Parse chuỗi JSON an toàn, chấp nhận tiền tố chống-XSSI kiểu `for (;;);`. */
function safeParse(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim();
  if (s.startsWith('for (;;);')) s = s.slice(9);
  if (!s || (s[0] !== '{' && s[0] !== '[')) return null;
  try {
    return JSON.parse(s);
  } catch {
    // Một số response trả nhiều dòng JSON liên tiếp
    const out = [];
    for (const line of s.split('\n')) {
      try { out.push(JSON.parse(line)); } catch { /* bỏ qua */ }
    }
    return out.length ? out : null;
  }
}

function isPostLike(o) {
  return o && typeof o === 'object' && !Array.isArray(o)
    && (o.pk || o.id) && typeof o.code === 'string'
    && o.user && typeof o.user === 'object' && o.user.username
    && ('caption' in o || 'text_post_app_info' in o || 'taken_at' in o);
}

function isUserLike(o) {
  return o && typeof o === 'object' && !Array.isArray(o)
    && typeof o.username === 'string'
    && ('follower_count' in o || 'biography' in o);
}

function pickImage(versions) {
  const c = versions && Array.isArray(versions.candidates) ? versions.candidates : [];
  if (!c.length) return null;
  // Ảnh lớn nhất
  return c.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a)).url || null;
}

function collectMedia(p) {
  const media = [];
  const push = (m) => {
    if (!m) return;
    const video = Array.isArray(m.video_versions) && m.video_versions[0] ? m.video_versions[0].url : null;
    const image = pickImage(m.image_versions2);
    if (video) media.push({ type: 'video', url: video, thumb: image });
    else if (image) media.push({ type: 'image', url: image, thumb: image });
  };
  if (Array.isArray(p.carousel_media) && p.carousel_media.length) p.carousel_media.forEach(push);
  else push(p);
  return media;
}

const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;
const MENTION_RE = /@([A-Za-z0-9._]+)/g;

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

/** Chuẩn hóa một object bài viết thô của Threads về dạng phẳng. */
function normalizePost(p) {
  const info = p.text_post_app_info || {};
  const text = (p.caption && p.caption.text) || '';
  const username = p.user.username;
  const tags = uniq([
    ...[...text.matchAll(HASHTAG_RE)].map((m) => m[1].toLowerCase()),
    info.tag_header && info.tag_header.display_name ? String(info.tag_header.display_name).toLowerCase() : null,
  ]);
  const mentions = uniq([...text.matchAll(MENTION_RE)].map((m) => m[1].toLowerCase()));
  const link = info.link_preview_attachment && info.link_preview_attachment.url;
  const quoted = info.share_info && info.share_info.quoted_post;
  const replyTo = info.reply_to_author && info.reply_to_author.username;
  const id = String(p.pk || p.id).split('_')[0];

  return {
    id,
    code: p.code,
    url: `https://www.threads.com/@${username}/post/${p.code}`,
    username,
    full_name: p.user.full_name || '',
    avatar: p.user.profile_pic_url || null,
    verified: !!p.user.is_verified,
    text,
    published_at: p.taken_at ? new Date(p.taken_at * 1000).toISOString() : null,
    like_count: num(p.like_count),
    reply_count: num(info.direct_reply_count ?? p.reply_count),
    repost_count: num(info.repost_count ?? p.repost_count),
    quote_count: num(info.quote_count ?? p.quote_count),
    reshare_count: num(info.reshare_count ?? p.reshare_count),
    media: collectMedia(p),
    link: link || null,
    hashtags: tags,
    mentions,
    reply_to: replyTo || null,
    quoted_code: quoted && quoted.code ? quoted.code : null,
    is_reply: !!replyTo,
  };
}

/** Chuẩn hóa một object hồ sơ. */
function normalizeUser(u) {
  const bioLinks = Array.isArray(u.bio_links) ? u.bio_links.map((l) => l.url).filter(Boolean) : [];
  const hd = u.hd_profile_pic_versions && u.hd_profile_pic_versions.length
    ? u.hd_profile_pic_versions[u.hd_profile_pic_versions.length - 1].url : null;
  return {
    id: String(u.pk || u.id || u.username),
    username: u.username,
    full_name: u.full_name || '',
    bio: u.biography || '',
    avatar: hd || u.profile_pic_url || null,
    verified: !!u.is_verified,
    private: !!u.text_post_app_is_private || !!u.is_private,
    follower_count: num(u.follower_count),
    following_count: u.following_count == null ? null : num(u.following_count),
    links: bioLinks,
    url: `https://www.threads.com/@${u.username}`,
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Gộp trường của hồ sơ: giữ giá trị "giàu" hơn khi nguồn sau thiếu dữ liệu. */
function mergeUser(a, b) {
  if (!a) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (k === 'follower_count' && v === 0 && a.follower_count) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Duyệt cây JSON, trả về { posts: Map<id, post>, users: Map<username, user> }.
 * Có thể truyền `acc` để gộp nhiều nguồn.
 */
function harvest(root, acc = { posts: new Map(), users: new Map() }) {
  const seen = new Set();
  const stack = [[root, 0]];
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH || seen.has(node)) continue;
    seen.add(node);

    if (isPostLike(node)) {
      try {
        const post = normalizePost(node);
        const prev = acc.posts.get(post.id);
        acc.posts.set(post.id, prev ? { ...prev, ...post } : post);
      } catch { /* object không chuẩn, bỏ qua */ }
    } else if (isUserLike(node)) {
      const user = normalizeUser(node);
      acc.users.set(user.username, mergeUser(acc.users.get(user.username), user));
    }

    const children = Array.isArray(node) ? node : Object.values(node);
    for (const child of children) {
      if (child && typeof child === 'object') stack.push([child, depth + 1]);
    }
  }
  return acc;
}

/** Chuẩn hóa đầu vào người dùng thành username. */
function parseUsername(input) {
  if (!input) return null;
  let s = String(input).trim();
  const m = s.match(/threads\.(?:net|com)\/@([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s.toLowerCase() : null;
}

/** Chuẩn hóa link bài viết, trả về { username, code, url } hoặc null. */
function parsePostUrl(input) {
  if (!input) return null;
  const m = String(input).trim().match(/threads\.(?:net|com)\/@([^/?#\s]+)\/post\/([A-Za-z0-9_-]+)/i);
  if (!m) return null;
  return { username: m[1].toLowerCase(), code: m[2], url: `https://www.threads.com/@${m[1]}/post/${m[2]}` };
}

module.exports = {
  safeParse,
  harvest,
  normalizePost,
  normalizeUser,
  mergeUser,
  parseUsername,
  parsePostUrl,
  isPostLike,
  isUserLike,
};
