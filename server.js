'use strict';

const path = require('path');
const express = require('express');
const { Store } = require('./src/store');
const { Scraper } = require('./src/scraper');
const { JobManager, publicJob } = require('./src/jobs');
const { filterPosts, filterProfiles, toCSV, toJSON, engagement } = require('./src/query');
const { seedDemo } = require('./src/demo');
const { Scheduler } = require('./src/schedules');
const { parseCookies } = require('./src/scraper');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');

const store = new Store(DATA_FILE);
const scraper = new Scraper();
const jobs = new JobManager(store, scraper);
const scheduler = new Scheduler(store, jobs);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const wrap = (fn) => (req, res) => {
  try {
    const out = fn(req, res);
    if (out !== undefined) res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/* ---------- Tổng quan ---------- */
app.get('/api/stats', wrap(() => {
  const posts = store.listPosts();
  const profiles = store.listProfiles();
  const allJobs = store.data.jobs;

  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today - i * 864e5);
    days.push({ date: d.toISOString().slice(0, 10), count: 0, _t: d.getTime() });
  }
  const tags = new Map();
  const authors = new Map();
  let likes = 0;
  let replies = 0;
  for (const p of posts) {
    likes += p.like_count;
    replies += p.reply_count;
    if (p.published_at) {
      const t = new Date(p.published_at);
      t.setHours(0, 0, 0, 0);
      const slot = days.find((d) => d._t === t.getTime());
      if (slot) slot.count++;
    }
    for (const h of p.hashtags || []) tags.set(h, (tags.get(h) || 0) + 1);
    const a = authors.get(p.username) || { username: p.username, full_name: p.full_name, avatar: p.avatar, verified: p.verified, posts: 0, engagement: 0 };
    a.posts++;
    a.engagement += engagement(p);
    authors.set(p.username, a);
  }

  return {
    totals: {
      posts: posts.length,
      profiles: profiles.length,
      likes,
      replies,
      media: posts.filter((p) => p.media && p.media.length).length,
      jobs: allJobs.length,
      running: allJobs.filter((j) => j.status === 'running').length,
      queued: allJobs.filter((j) => j.status === 'queued').length,
      failed: allJobs.filter((j) => j.status === 'failed').length,
    },
    daily: days.map(({ _t, ...d }) => d),
    topAuthors: [...authors.values()].sort((a, b) => b.engagement - a.engagement).slice(0, 5),
    topTags: [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count })),
    topPosts: [...posts].sort((a, b) => engagement(b) - engagement(a)).slice(0, 3),
    recentJobs: allJobs.slice(0, 5).map(publicJob),
  };
}));

/* ---------- Tác vụ ---------- */
app.get('/api/jobs', wrap((req) => {
  let list = store.data.jobs;
  if (req.query.status) list = list.filter((j) => j.status === req.query.status);
  return list.map(publicJob);
}));

app.get('/api/jobs/:id', wrap((req, res) => {
  const j = store.getJob(req.params.id);
  if (!j) return res.status(404).json({ error: 'Không tìm thấy tác vụ' });
  return publicJob(j);
}));

app.post('/api/jobs', wrap((req) => publicJob(jobs.create(req.body.type, req.body))));

app.post('/api/jobs/:id/cancel', wrap((req) => {
  const j = jobs.cancel(req.params.id);
  if (!j) throw new Error('Không tìm thấy tác vụ');
  return publicJob(j);
}));

app.post('/api/jobs/:id/retry', wrap((req) => {
  const j = jobs.retry(req.params.id);
  if (!j) throw new Error('Không tìm thấy tác vụ');
  return publicJob(j);
}));

app.delete('/api/jobs', wrap(() => ({
  removed: store.removeJobs((j) => j.status !== 'running' && j.status !== 'queued'),
})));

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
  if (!['posts', 'profiles'].includes(kind) || !['csv', 'json'].includes(fmt)) {
    return res.status(400).json({ error: 'Định dạng không hỗ trợ' });
  }
  const rows = kind === 'posts'
    ? filterPosts(store.listPosts(), req.query)
    : filterProfiles(store.listProfiles(), req.query);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  res.setHeader('Content-Disposition', `attachment; filename="threads-${kind}-${stamp}.${fmt}"`);
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
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^(image|video)\//.test(type)) return res.status(r.ok ? 415 : r.status).end();
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.status(502).end();
  }
});

/* ---------- Lịch tự động ---------- */
app.get('/api/schedules', wrap(() => scheduler.list().map((s) => {
  const j = s.last_job_id && store.getJob(s.last_job_id);
  return { ...s, last_status: j ? j.status : null, last_posts: j ? j.stats.posts : null };
})));
app.post('/api/schedules', wrap((req) => {
  const { schedule, job } = scheduler.create(req.body.type, req.body, req.body.every);
  return { schedule, job: publicJob(job) };
}));
app.patch('/api/schedules/:id', wrap((req, res) => scheduler.update(req.params.id, req.body || {}) || res.status(404).json({ error: 'Không tìm thấy lịch' })));
app.delete('/api/schedules/:id', wrap((req) => ({ removed: scheduler.remove(req.params.id) })));
app.post('/api/schedules/:id/run', wrap((req, res) => {
  const r = scheduler.run(req.params.id);
  if (!r) return res.status(404).json({ error: 'Không tìm thấy lịch' });
  return { schedule: r.schedule, job: publicJob(r.job), skipped: !!r.skipped };
}));

/* ---------- Đăng nhập ---------- */
function loginState() {
  const cookies = parseCookies(store.getSettings().cookies);
  return {
    hasSession: cookies.some((c) => c.name === 'sessionid' && c.value),
    cookieCount: cookies.length,
    windowOpen: !!scraper.login,
  };
}
app.get('/api/login', wrap(() => loginState()));
app.post('/api/login', async (req, res) => {
  try {
    const cookies = await scraper.interactiveLogin(store.getSettings());
    store.updateSettings({ cookies: JSON.stringify(cookies) });
    res.json(loginState());
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post('/api/login/cancel', wrap(() => { scraper.cancelLogin(); return loginState(); }));
app.delete('/api/login', wrap(() => { store.updateSettings({ cookies: '' }); return loginState(); }));

/* ---------- Cài đặt ---------- */
app.get('/api/settings', wrap(() => store.getSettings()));
app.put('/api/settings', wrap((req) => {
  const s = store.updateSettings(req.body || {});
  jobs.pump();
  return s;
}));

app.post('/api/demo', wrap(() => {
  const r = seedDemo(store);
  jobs.emit('data');
  return r;
}));

app.post('/api/clear', wrap(() => {
  store.clearAll();
  jobs.emit('data');
  return { ok: true };
}));

/* ---------- Sự kiện thời gian thực (SSE) ---------- */
const clients = new Set();
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 3000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});
const broadcast = (event, data) => {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
};
jobs.on('job', (j) => broadcast('job', j));
jobs.on('schedule', (s) => broadcast('schedule', s));
let dataTimer = null;
jobs.on('data', () => {
  if (dataTimer) return;
  dataTimer = setTimeout(() => {
    dataTimer = null;
    broadcast('data', { t: Date.now() });
  }, 800);
});
setInterval(() => broadcast('ping', {}), 25000).unref();

app.use('/api', (req, res) => res.status(404).json({ error: 'Không tìm thấy API' }));

const server = app.listen(PORT, HOST, () => {
  console.log(`\n  🌰 Scrat Threads đang chạy tại http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n`);
});

async function shutdown() {
  store.flush();
  await scraper.close();
  server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { app };
