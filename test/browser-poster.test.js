'use strict';

/**
 * Kiểm tra đăng bài bằng trình duyệt với một trang Threads giả lập:
 * /intent/post mở khung soạn (role=dialog), bấm "Đăng" gọi /api/graphql rồi đóng khung.
 * Cần Chromium của Playwright (CI cài bằng `npx playwright install chromium`).
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

async function fakeThreads({ mode = 'ok' } = {}) {
  const posted = [];
  let n = 0;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/intent/post') {
      if (mode === 'login') { res.writeHead(302, { location: '/login' }); return res.end(); }
      const text = u.searchParams.get('text') || '';
      const reply = u.searchParams.get('reply_post_shortcode') || '';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><meta charset="utf-8"><body>
        <div role="dialog" id="d"><div contenteditable="true" id="box"></div><input type="file">
          <div role="button" id="post">Đăng</div></div>
        <script>
          document.getElementById('box').textContent = ${JSON.stringify(text)};
          document.getElementById('post').onclick = async () => {
            const r = await fetch('/api/graphql', { method: 'POST', body: JSON.stringify({ text: document.getElementById('box').innerText, reply: ${JSON.stringify(reply)} }) });
            const j = await r.json();
            if (j.fail) return;
            document.getElementById('d').remove();
            if (j.toast) { const a = document.createElement('a'); a.href = '/@huyflou/post/' + j.toast; a.textContent = 'Xem'; document.body.append(a); }
          };
        </script></body>`);
    }
    if (u.pathname === '/login') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<p>Đăng nhập</p>'); }
    if (u.pathname === '/api/graphql') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const b = JSON.parse(raw);
        posted.push(b);
        const code = `CODE${++n}`;
        res.writeHead(200, { 'content-type': 'application/json' });
        if (mode === 'stuck') return res.end(JSON.stringify({ fail: true }));
        // Phần 1: mã bài nằm trong phản hồi; phần 2: chỉ có link "Xem" trên thông báo
        if (n === 1) {
          return res.end(JSON.stringify({ data: { media: { pk: `9${n}`, code, taken_at: 1, caption: { text: b.text }, user: { username: 'huyflou' }, text_post_app_info: {} } } }));
        }
        return res.end(JSON.stringify({ ok: true, toast: code }));
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, posted, close: () => server.close() };
}

async function setup(t, mode) {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
    const b = await chromium.launch();
    await b.close();
  } catch {
    t.skip('Chưa cài Chromium cho Playwright (chạy: npx playwright install chromium)');
    return null;
  }
  const fake = await fakeThreads({ mode });
  process.env.THREADS_WEB_BASE = fake.base;
  for (const m of ['../src/scraper', '../src/browser-poster']) delete require.cache[require.resolve(m)];
  const { Scraper } = require('../src/scraper');
  const poster = require('../src/browser-poster');
  const scraper = new Scraper();
  const settings = { headless: true, proxy: '', userAgent: '', cookies: 'sessionid=abc; csrftoken=x', timeout: 20000 };
  return { fake, scraper, poster, settings, done: async () => { await scraper.close(); fake.close(); delete process.env.THREADS_WEB_BASE; } };
}

test('đăng chuỗi thread qua trình duyệt: intent → bấm Đăng → nối phần sau bằng reply_post_shortcode', async (t) => {
  const s = await setup(t, 'ok');
  if (!s) return;
  try {
    const parts = [];
    const r = await s.poster.publishViaBrowser(s.scraper, s.settings, { parts: ['Phần một ☕', 'Phần hai'], onPart: (ids) => parts.push(ids.length) });
    assert.deepEqual(r.ids, ['CODE1', 'CODE2'], 'lấy mã từ phản hồi mạng, rồi từ link "Xem"');
    assert.equal(r.permalink, `${s.fake.base}/@huyflou/post/CODE1`);
    assert.deepEqual(parts, [1, 2]);
    assert.equal(s.fake.posted[0].text, 'Phần một ☕');
    assert.equal(s.fake.posted[0].reply, '');
    assert.equal(s.fake.posted[1].reply, 'CODE1', 'phần 2 trả lời phần 1');
  } finally {
    await s.done();
  }
});

test('trình duyệt: phiên hết hạn và khung soạn không đóng đều báo lỗi không tự thử lại', async (t) => {
  for (const [mode, re] of [['login', /hết hạn/], ['stuck', /Threads không đăng bài/]]) {
    const s = await setup(t, mode);
    if (!s) return;
    try {
      await assert.rejects(s.poster.publishViaBrowser(s.scraper, s.settings, { parts: ['abc'] }), (e) => re.test(e.message) && !e.transient && /ảnh chụp màn hình/.test(e.message));
    } finally {
      await s.done();
    }
  }
});

test('chọn cách đăng: tự động ưu tiên token, rồi đến phiên đăng nhập', () => {
  const { pickMethod } = require('../src/browser-poster');
  assert.equal(pickMethod({ postMethod: 'auto', threadsToken: 't', cookies: 'sessionid=1' }), 'api');
  assert.equal(pickMethod({ postMethod: 'auto', threadsToken: '', cookies: 'sessionid=1' }), 'browser');
  assert.equal(pickMethod({ postMethod: 'auto', threadsToken: '', cookies: 'csrftoken=1' }), null, 'cookie không có sessionid');
  assert.equal(pickMethod({ postMethod: 'browser', threadsToken: 't', cookies: 'sessionid=1' }), 'browser');
  assert.equal(pickMethod({ postMethod: 'api', threadsToken: '', cookies: 'sessionid=1' }), null);
});
