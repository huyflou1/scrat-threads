'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

/** Máy chủ HTTP giả: handler(req, body) → [status, json]. Trả về { url, calls, close }. */
async function fakeServer(handler) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const call = { method: req.method, url: req.url, headers: req.headers, raw };
      try { call.body = JSON.parse(raw); } catch { call.body = Object.fromEntries(new URLSearchParams(raw)); }
      calls.push(call);
      const out = handler(call, calls.length);
      // 'DROP': máy chủ đã xử lý nhưng cắt kết nối trước khi trả lời
      if (out === 'DROP') return req.socket.destroy();
      const [status, json] = out;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => server.close() };
}

const message = (text, extra = {}) => ({
  id: 'msg_1', type: 'message', role: 'assistant', model: extra.model || 'claude-sonnet-5-5',
  content: [{ type: 'text', text }], stop_reason: extra.stop_reason || 'end_turn', stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 20 },
});

/* ---------- AI ---------- */

test('chọn mô hình tự động theo nội dung', () => {
  const { pickModel } = require('../src/ai');
  assert.equal(pickModel({ input: 'Cà phê sáng nay', length: 'short' }).id, 'claude-haiku-5-5');
  assert.equal(pickModel({ input: 'x'.repeat(500), length: 'medium' }).id, 'claude-sonnet-5-5');
  assert.equal(pickModel({ input: 'ngắn', length: 'thread' }).id, 'claude-opus-5-5');
  assert.equal(pickModel({ input: 'x'.repeat(2000), length: 'short' }).id, 'claude-opus-5-5');
  assert.equal(pickModel({ input: 'ngắn', length: 'short', styleExamples: 2 }).id, 'claude-opus-5-5');
  assert.match(pickModel({ input: 'ngắn', length: 'thread' }).reason, /chuỗi thread/);
});

test('generate: gửi đúng tham số, dùng fallback cho Opus/Sonnet, không cho Haiku', async () => {
  const variants = { variants: [{ angle: 'Kể chuyện', parts: ['Bài một'] }, { angle: 'Mẹo', parts: ['  ', 'Phần A', 'Phần B'] }] };
  const srv = await fakeServer(() => [200, message(JSON.stringify(variants))]);
  process.env.ANTHROPIC_BASE_URL = srv.url;
  const { generate } = require('../src/ai');
  try {
    const r = await generate({ apiKey: 'sk-test', input: 'Quán cà phê mới mở', tone: 'funny', length: 'medium', lang: 'vi', hashtags: true, emoji: false, model: 'auto' });
    assert.equal(r.auto, true);
    assert.equal(r.requested, 'claude-sonnet-5-5');
    assert.deepEqual(r.variants[1].parts, ['Phần A', 'Phần B'], 'bỏ phần rỗng');

    const c1 = srv.calls[0];
    // SDK 1.x gửi khóa qua Authorization: Bearer (bản cũ dùng x-api-key)
    assert.ok(c1.headers['x-api-key'] === 'sk-test' || c1.headers.authorization === 'Bearer sk-test');
    assert.match(c1.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
    assert.equal(c1.body.fallbacks, 'default');
    assert.equal(c1.body.model, 'claude-sonnet-5-5');
    assert.equal(c1.body.output_config.format.type, 'json_schema');
    assert.equal(c1.body.output_config.effort, 'medium');
    for (const k of ['temperature', 'top_p', 'top_k', 'thinking']) assert.equal(k in c1.body, false, `không gửi ${k}`);
    assert.match(c1.body.messages[0].content, /hài hước/);
    assert.match(c1.body.messages[0].content, /Quán cà phê mới mở/);

    await generate({ apiKey: 'sk-test', input: 'Ngắn', length: 'short', model: 'claude-haiku-5-5' });
    const c2 = srv.calls[1];
    assert.equal(c2.body.model, 'claude-haiku-5-5');
    assert.equal('fallbacks' in c2.body, false, 'Haiku không có fallback phía máy chủ');
    assert.equal(c2.headers['anthropic-beta'], undefined);
    assert.equal(c2.body.output_config.effort, 'low');
  } finally {
    srv.close();
  }
});

test('generate: xử lý từ chối, lỗi API key, JSON hỏng', async () => {
  let mode = 'refusal';
  const srv = await fakeServer(() => {
    if (mode === 'refusal') return [200, message('', { stop_reason: 'refusal' })];
    if (mode === 'auth') return [401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }];
    return [200, message('không phải json')];
  });
  process.env.ANTHROPIC_BASE_URL = srv.url;
  const { generate } = require('../src/ai');
  const opts = { apiKey: 'sk-test', input: 'abc', model: 'claude-opus-5-5' };
  try {
    await assert.rejects(generate(opts), /từ chối/);
    mode = 'auth';
    await assert.rejects(generate(opts), /API key của Anthropic không hợp lệ/);
    mode = 'bad';
    await assert.rejects(generate(opts), /không đọc được/);
    await assert.rejects(generate({ ...opts, input: '  ' }), /Hãy nhập nội dung/);
  } finally {
    srv.close();
  }
});

/* ---------- Threads API ---------- */

test('đếm ký tự theo cách của Threads: emoji tính theo byte UTF-8', () => {
  const { threadsLength } = require('../src/threads-api');
  assert.equal(threadsLength('Xin chào'), 8, 'chữ có dấu tính 1');
  assert.equal(threadsLength('😀'), 4);
  assert.equal(threadsLength('a😀b'), 6);
  assert.equal(threadsLength('❤️'), 6, 'tim + variation selector');
  assert.equal(threadsLength(''), 0);
});

async function withThreads(handler, fn) {
  const srv = await fakeServer(handler);
  process.env.THREADS_API_BASE = srv.url;
  delete require.cache[require.resolve('../src/threads-api')];
  const api = require('../src/threads-api');
  try {
    await fn(api, srv);
  } finally {
    srv.close();
    delete process.env.THREADS_API_BASE;
    delete require.cache[require.resolve('../src/threads-api')];
  }
}

const noWait = () => Promise.resolve();

test('đăng chuỗi thread: container → chờ FINISHED → publish, phần sau trả lời phần trước', async () => {
  let n = 0;
  await withThreads((c) => {
    if (c.url === '/me/threads') return [200, { id: `c${++n}` }];
    if (c.url.startsWith('/c')) return [200, { status: 'FINISHED' }];
    if (c.url === '/me/threads_publish') return [200, { id: `m-${c.body.creation_id}` }];
    if (c.url.startsWith('/m-c1')) return [200, { permalink: 'https://www.threads.com/@me/post/ABC' }];
    return [404, { error: { message: 'không có' } }];
  }, async (api, srv) => {
    const seen = [];
    const r = await api.publish('tok', { parts: ['Phần 1', 'Phần 2'], imageUrl: 'https://cdn.example.com/a.jpg', onPart: (ids) => seen.push(ids.length), wait: noWait });
    assert.deepEqual(r.ids, ['m-c1', 'm-c2']);
    assert.equal(r.permalink, 'https://www.threads.com/@me/post/ABC');
    assert.deepEqual(seen, [1, 2]);
    const creates = srv.calls.filter((c) => c.url === '/me/threads');
    assert.equal(creates[0].body.media_type, 'IMAGE');
    assert.equal(creates[0].body.image_url, 'https://cdn.example.com/a.jpg');
    assert.equal(creates[0].body.access_token, 'tok');
    assert.equal(creates[1].body.media_type, 'TEXT');
    assert.equal(creates[1].body.reply_to_id, 'm-c1');
    assert.equal(creates[0].body.reply_to_id, undefined);
  });
});

test('đăng tiếp từ phần dở dang; báo lỗi token hết hạn và lỗi tạm thời', async () => {
  let fail = null;
  await withThreads((c) => {
    if (fail === 'token') return [400, { error: { message: 'Error validating access token', code: 190 } }];
    if (fail === 'rate') return [400, { error: { message: 'Application request limit reached', code: 4 } }];
    if (c.url === '/me/threads') return [200, { id: 'c9' }];
    if (c.url.startsWith('/c9')) return [200, { status: 'FINISHED' }];
    if (c.url === '/me/threads_publish') return [200, { id: 'm9' }];
    return [200, {}];
  }, async (api, srv) => {
    const r = await api.publish('tok', { parts: ['P1', 'P2'], done: ['m1'], wait: noWait });
    assert.deepEqual(r.ids, ['m1', 'm9']);
    assert.equal(srv.calls.find((c) => c.url === '/me/threads').body.reply_to_id, 'm1', 'nối vào phần đã đăng');

    fail = 'token';
    await assert.rejects(api.publish('tok', { parts: ['x'], wait: noWait }), (e) => /hết hạn/.test(e.message) && !e.transient);
    fail = 'rate';
    await assert.rejects(api.publish('tok', { parts: ['x'], wait: noWait }), (e) => e.transient === true);
    await assert.rejects(api.publish('tok', { parts: ['😀'.repeat(130)], wait: noWait }), /520\/500/);
    await assert.rejects(api.publish('', { parts: ['x'], wait: noWait }), /Chưa có Threads access token/);
  });
});

test('mất phản hồi khi publish: lần thử lại đối soát container, không đăng trùng', async () => {
  // Threads giả: publish lần đầu thành công nhưng cắt kết nối
  const published = [];
  let n = 0;
  let drop = true;
  await withThreads((c) => {
    if (c.method === 'POST' && c.url === '/me/threads') return [200, { id: `c${++n}` }];
    if (c.url === '/me/threads_publish') {
      published.push(c.body.creation_id);
      if (drop) { drop = false; return 'DROP'; }
      return [200, { id: `m-${c.body.creation_id}` }];
    }
    const id = c.url.split('?')[0].slice(1);
    if (c.url.startsWith('/me/threads?')) return [200, { data: published.map((cid, i) => ({ id: `m-${cid}`, text: i === 0 ? 'Phần 1' : 'Phần 2', timestamp: new Date().toISOString() })) }];
    if (c.url.startsWith('/me/replies')) return [200, { data: [] }];
    if (/^c\d+$/.test(id)) return [200, { status: published.includes(id) ? 'PUBLISHED' : 'FINISHED' }];
    return [200, {}];
  }, async (api, srv) => {
    const { box, store } = outboxEnv(api);
    const p = box.create({ parts: ['Phần 1', 'Phần 2'] });
    await box.publishNow(p.id);
    assert.equal(p.status, 'scheduled', 'lỗi mạng: hẹn thử lại');
    assert.equal(p.pending.id, 'c1', 'đã lưu container trước khi publish');
    await box.publishNow(p.id);
    assert.equal(p.status, 'published');
    assert.deepEqual(p.media_ids, ['m-c1', 'm-c2'], 'tìm lại được mã bài phần 1');
    assert.deepEqual(published, ['c1', 'c2'], 'mỗi phần chỉ publish một lần');
    assert.equal(srv.calls.filter((c) => c.method === 'POST' && c.url === '/me/threads').length, 2, 'không tạo container mới cho phần 1');
    assert.equal(p.pending, null);
    assert.throws(() => box.update(p.id, { parts: ['sửa'] }), /đã đăng/);
    clearTimeout(store.timer);
  });
});

test('container còn FINISHED khi thử lại thì publish đúng container cũ; đã đăng mà không tìm thấy thì dừng', async () => {
  let status = 'FINISHED';
  await withThreads((c) => {
    if (c.method === 'POST' && c.url === '/me/threads') return [200, { id: 'cNEW' }];
    if (c.url === '/me/threads_publish') return [200, { id: `m-${c.body.creation_id}` }];
    if (c.url.startsWith('/cOLD')) return [200, { status }];
    if (c.url.startsWith('/me/')) return [200, { data: [] }];
    return [200, { status: 'FINISHED' }];
  }, async (api, srv) => {
    const pending = { index: 0, id: 'cOLD', text: 'abc', created_at: new Date().toISOString() };
    const r = await api.publish('tok', { parts: ['abc'], pending, wait: noWait });
    assert.deepEqual(r.ids, ['m-cOLD']);
    assert.equal(srv.calls.filter((c) => c.method === 'POST' && c.url === '/me/threads').length, 0);
    status = 'PUBLISHED';
    await assert.rejects(api.publish('tok', { parts: ['abc'], pending, wait: noWait }), (e) => /đừng đăng lại/.test(e.message) && !e.transient);
  });
});

/* ---------- Hàng đợi ---------- */

function outboxEnv(api) {
  const { Store } = require('../src/store');
  const { Outbox } = require('../src/outbox');
  const store = new Store(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scrat-')), 'db.json'));
  store.updateSettings({ threadsToken: 'tok' });
  const notes = [];
  const box = new Outbox(store, { api, onNotify: (n) => notes.push(n) });
  clearInterval(box.timer);
  return { store, box, notes };
}

test('hàng đợi: hẹn giờ, chỉ đăng khi đến hạn, báo khi xong', async () => {
  const api = { publish: async (tok, { parts }) => ({ ids: parts.map((_, i) => `m${i}`), permalink: 'https://www.threads.com/@a/post/X' }) };
  const { box, notes, store } = outboxEnv(api);
  const later = new Date(Date.now() + 3600e3).toISOString();
  const p = box.create({ parts: ['Xin chào Threads'], scheduled_at: later });
  assert.equal(p.status, 'scheduled');
  assert.equal(box.create({ parts: ['Nháp'] }).status, 'draft');

  await box.tick(Date.now());
  assert.equal(p.status, 'scheduled', 'chưa đến giờ');
  await box.tick(Date.parse(later) + 1000);
  assert.equal(p.status, 'published');
  assert.equal(p.permalink, 'https://www.threads.com/@a/post/X');
  assert.equal(notes[0].kind, 'posted');

  assert.throws(() => box.create({ parts: ['😀'.repeat(126)] }), /504\/500/);
  assert.throws(() => box.create({ parts: [' '] }), /trống/);
  assert.throws(() => box.create({ parts: ['a'], scheduled_at: '2020-01-01T00:00:00Z' }), /đã qua/);
  assert.throws(() => box.create({ parts: ['a'], image_url: 'javascript:alert(1)' }), /https/);
  assert.throws(() => box.update(p.id, { parts: ['sửa'] }), /đã đăng/);
  clearTimeout(store.timer);
});

test('hàng đợi: lỗi tạm thời thì hẹn thử lại, lỗi hẳn thì báo; khởi động lại không đăng trùng', async () => {
  const { ThreadsError } = require('../src/threads-api');
  let err = new ThreadsError('mạng chập chờn', { transient: true });
  const api = { publish: async () => { throw err; } };
  const { box, notes, store } = outboxEnv(api);
  const p = box.create({ parts: ['abc'] });
  await box.publishNow(p.id);
  assert.equal(p.status, 'scheduled', 'tự hẹn thử lại');
  assert.ok(Date.parse(p.scheduled_at) > Date.now());
  assert.equal(notes.length, 0);

  err = new ThreadsError('token hết hạn');
  await box.publishNow(p.id);
  assert.equal(p.status, 'failed');
  assert.equal(notes[0].kind, 'error');

  p.status = 'publishing';
  const { Outbox } = require('../src/outbox');
  const again = new Outbox(store, { api });
  clearInterval(again.timer);
  assert.equal(p.status, 'failed');
  assert.match(p.error, /tránh đăng trùng/);
  clearTimeout(store.timer);
});

test('cài đặt: khóa bí mật được che khi gửi ra, gửi lại bản che không ghi đè, sao lưu không chứa khóa', () => {
  const { Store, publicSettings } = require('../src/store');
  const store = new Store(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scrat-')), 'db.json'));
  store.updateSettings({ anthropicApiKey: 'sk-ant-bi-mat-1234', threadsToken: 'THQ-token-9999' });
  const pub = publicSettings(store.getSettings());
  assert.equal(pub.anthropicApiKey, '••••1234');
  assert.equal(pub.threadsToken, '••••9999');
  store.updateSettings(pub);
  assert.equal(store.getSettings().anthropicApiKey, 'sk-ant-bi-mat-1234', 'bản che không ghi đè');
  const dump = JSON.stringify(store.exportAll());
  assert.equal(dump.includes('bi-mat'), false);
  assert.equal(dump.includes('THQ-token'), false);
  store.updateSettings({ threadsToken: '' });
  assert.equal(store.getSettings().threadsToken, '', 'xóa được khóa');
  clearTimeout(store.timer);
});
