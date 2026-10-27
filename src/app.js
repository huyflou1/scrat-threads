'use strict';

/**
 * Dựng ứng dụng: kho dữ liệu, trình duyệt, hàng đợi, lịch, hàng đợi đăng và API Express.
 * server.js chỉ gọi createApp() rồi listen — test có thể dựng app riêng với file dữ liệu tạm.
 */

const path = require('path');
const express = require('express');
const { Store } = require('./store');
const { Outbox } = require('./outbox');
const { publishViaBrowser } = require('./browser-poster');
const { Scraper } = require('./scraper');
const { JobManager } = require('./jobs');
const { Scheduler } = require('./schedules');
const { scheduleNotification } = require('./notify');
const { createAuth } = require('./auth');

const ROUTES = ['stats', 'jobs', 'library', 'compose', 'system'];

function createApp({ dataFile, password = '', trustProxy = '' } = {}) {
  const store = new Store(dataFile);
  if (store.recovered) {
    store.addNotification({ kind: 'error', title: 'File dữ liệu bị hỏng nên app bắt đầu với kho trống', body: `File cũ được giữ lại tại ${store.recovered}. Nếu có bản sao lưu, vào Cài đặt → Khôi phục.`, link: '#/settings' });
  }

  /* ---------- Sự kiện thời gian thực (SSE) ---------- */
  const clients = new Set();
  const broadcast = (event, data) => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(msg);
  };

  const scraper = new Scraper();
  const jobs = new JobManager(store, scraper);
  const scheduler = new Scheduler(store, jobs);
  const outbox = new Outbox(store, {
    browser: (settings, opts) => publishViaBrowser(scraper, settings, opts),
    onChange: (p) => broadcast('outbox', p),
    onNotify: (n) => broadcast('notify', store.addNotification(n)),
  });

  jobs.on('job', (j) => broadcast('job', j));
  jobs.on('schedule', (s) => broadcast('schedule', s));
  jobs.on('finished', (job) => {
    const n = scheduleNotification(job, job.schedule_id && scheduler.get(job.schedule_id), (id) => store.data.posts[id]);
    if (n) broadcast('notify', store.addNotification(n));
  });
  let dataTimer = null;
  jobs.on('data', () => {
    if (dataTimer) return;
    dataTimer = setTimeout(() => {
      dataTimer = null;
      broadcast('data', { t: Date.now() });
    }, 800);
  });
  const ping = setInterval(() => broadcast('ping', {}), 25000);
  ping.unref();

  const app = express();
  // Chạy sau reverse proxy HTTPS (Caddy, Nginx, Cloudflare Tunnel…): đặt TRUST_PROXY=1
  // để app nhận ra kết nối là HTTPS và gắn cờ Secure cho cookie đăng nhập
  if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  const auth = createAuth(password);
  // Bản khôi phục có thể lớn; các API khác giới hạn 2MB
  const jsonSmall = express.json({ limit: '2mb' });
  app.use((req, res, next) => (req.path === '/api/restore' ? next() : jsonSmall(req, res, next)));
  app.use(auth.middleware);
  auth.routes(app);
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

  const ctx = { store, scraper, jobs, scheduler, outbox, broadcast };
  for (const r of ROUTES) require(`./routes/${r}`)(app, ctx);

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

  app.use('/api', (req, res) => res.status(404).json({ error: 'Không tìm thấy API' }));
  // Lỗi đọc body (JSON hỏng, quá lớn…) trả về JSON thay vì trang HTML mặc định
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const msg = err.type === 'entity.too.large' ? 'File quá lớn' : err.type === 'entity.parse.failed' ? 'File JSON bị hỏng' : 'Lỗi máy chủ';
    res.status(err.status || 500).json({ error: msg });
  });

  /** Dừng mọi bộ hẹn giờ, đóng trình duyệt, ghi dữ liệu lần cuối. */
  async function close() {
    clearInterval(ping);
    clearTimeout(dataTimer);
    clearInterval(scheduler.timer);
    clearInterval(outbox.timer);
    for (const c of clients) c.end();
    await scraper.close();
    store.close();
  }

  return { app, auth, ...ctx, close };
}

module.exports = { createApp };
