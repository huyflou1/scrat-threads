'use strict';

/** Dựng toàn bộ app bằng createApp() với file dữ liệu tạm và gọi thử các API chính. */

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../src/app');

test('createApp: các nhóm API hoạt động và dữ liệu còn sau khi mở lại', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scrat-app-')), 'scrat.db');
  const start = async () => {
    const s = createApp({ dataFile: file });
    const server = await new Promise((r) => { const x = s.app.listen(0, '127.0.0.1', () => r(x)); });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (p, opts = {}) => {
      const res = await fetch(base + p, { ...opts, headers: { 'content-type': 'application/json' }, body: opts.body && JSON.stringify(opts.body) });
      return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
    };
    return { call, stop: async () => { server.close(); await s.close(); } };
  };

  let a = await start();
  assert.equal((await a.call('/demo', { method: 'POST' })).body.posts > 0, true);
  for (const p of ['/stats', '/posts?limit=5', '/profiles', '/jobs', '/schedules', '/outbox', '/notifications', '/settings', '/ai/models', '/login']) {
    assert.equal((await a.call(p)).status, 200, p);
  }
  const st = (await a.call('/stats')).body;
  assert.equal(st.heat.length, 7);
  assert.ok('best' in st);
  assert.equal((await a.call('/outbox', { method: 'POST', body: { parts: ['xin chào'] } })).status, 200);
  assert.equal((await a.call('/không-có')).status, 404);
  assert.equal((await a.call('/img?u=https://evil.example/a.jpg')).status, 403);
  const total = st.totals.posts;
  await a.stop();

  a = await start();
  assert.equal((await a.call('/stats')).body.totals.posts, total, 'dữ liệu còn sau khi khởi động lại');
  assert.equal((await a.call('/outbox')).body[0].parts[0], 'xin chào');
  await a.stop();
});
