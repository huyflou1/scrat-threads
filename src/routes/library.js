'use strict';

/** API — Kho dữ liệu: bài viết, hồ sơ, xuất file, proxy ảnh. */

const { filterPosts, filterProfiles, toCSV, toJSON, toXLSXFile, engagement } = require('../query');
const { safeFetch } = require('../safe-fetch');
const { wrap } = require('./util');

module.exports = function register(app, { store, scheduler }) {
  /* ---------- Dữ liệu ---------- */
  app.get('/api/posts', wrap((req) => {
    const all = filterPosts(store.listPosts(), req.query);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 40));
    return { total: all.length, items: all.slice(offset, offset + limit) };
  }));

  app.post('/api/posts/delete', wrap((req) => ({ removed: store.deletePosts(req.body.ids || []) })));

  app.get('/api/profiles', wrap((req) => {
    const items = filterProfiles(store.listProfiles(), req.query);
    const counts = new Map();
    for (const p of store.listPosts()) counts.set(p.username, (counts.get(p.username) || 0) + 1);
    return { total: items.length, items: items.map((u) => ({ ...u, post_count: counts.get(u.username) || 0 })) };
  }));

  app.get('/api/profiles/:username', wrap((req, res) => {
    const u = store.data.profiles[req.params.username];
    const posts = store.listPosts().filter((p) => p.username === req.params.username);
    if (!u && !posts.length) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
    const own = posts.filter((p) => !p.parent_code);
    const sum = (k) => own.reduce((a, p) => a + (p[k] || 0), 0);
    const n = own.length || 1;
    const avgEng = own.reduce((a, p) => a + engagement(p), 0) / n;
    const followers = u ? u.follower_count : 0;
    return {
      profile: u || { username: req.params.username, full_name: posts[0].full_name, avatar: posts[0].avatar, verified: posts[0].verified, follower_count: 0, history: [] },
      summary: {
        posts: own.length,
        replies: posts.length - own.length,
        avg_likes: Math.round(sum('like_count') / n),
        avg_replies: Math.round(sum('reply_count') / n),
        // Tỉ lệ tương tác: tương tác trung bình mỗi bài / số người theo dõi
        engagement_rate: followers ? avgEng / followers : null,
        media_ratio: own.filter((p) => p.media && p.media.length).length / n,
      },
      topPosts: filterPosts(own, { sort: 'engagement' }).slice(0, 5),
      schedules: scheduler.list().filter((s) => s.type === 'profile' && s.raw.username === req.params.username),
    };
  }));

  app.post('/api/profiles/delete', wrap((req) => ({ removed: store.deleteProfiles(req.body.usernames || []) })));

  app.get('/api/export/:kind.:fmt', (req, res) => {
    const { kind, fmt } = req.params;
    if (!['posts', 'profiles'].includes(kind) || !['csv', 'json', 'xlsx'].includes(fmt)) {
      return res.status(400).json({ error: 'Định dạng không hỗ trợ' });
    }
    const rows = kind === 'posts'
      ? filterPosts(store.listPosts(), req.query)
      : filterProfiles(store.listProfiles(), req.query);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    res.setHeader('Content-Disposition', `attachment; filename="threads-${kind}-${stamp}.${fmt}"`);
    if (fmt === 'xlsx') {
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(toXLSXFile(rows, kind));
    }
    res.type(fmt === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
    res.send(fmt === 'csv' ? toCSV(rows, kind) : toJSON(rows));
  });

  /* ---------- Proxy ảnh ----------
   * CDN của Meta chặn tải chéo nguồn (CORP), nên ảnh đại diện / media
   * được tải qua máy chủ. Chỉ cho phép các tên miền CDN của Meta. */
  const IMG_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;
  app.get('/api/img', async (req, res) => {
    let url;
    try {
      url = new URL(String(req.query.u || ''));
    } catch {
      return res.status(400).end();
    }
    if (url.protocol !== 'https:' || !IMG_HOSTS.test(url.hostname)) return res.status(403).end();
    try {
      // Theo chuyển hướng nhưng kiểm tra lại tên miền ở mỗi bước; tối đa 25 MB
      const MAX = 25 * 1024 * 1024;
      const { res: r, type } = await safeFetch(url.href, { maxBytes: MAX, timeout: 15000, allowHost: (h) => IMG_HOSTS.test(h), headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok || !/^(image|video)\//.test(type)) return res.status(r.ok ? 415 : r.status).end();
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      if (r.headers.get('content-length')) res.setHeader('Content-Length', r.headers.get('content-length'));
      // Chuyển thẳng dữ liệu cho trình duyệt, không giữ cả file trong RAM
      let n = 0;
      const gone = () => res.destroyed || res.writableEnded;
      for await (const c of r.body) {
        if (gone()) break; // người xem đã đóng trang
        if ((n += c.length) > MAX) return res.destroy();
        if (!res.write(c)) await new Promise((ok) => { res.once('drain', ok); res.once('close', ok); });
      }
      if (!gone()) res.end();
    } catch (e) {
      if (res.headersSent) return res.destroy();
      res.status(e.tooLarge ? 413 : 502).end();
    }
  });
};
