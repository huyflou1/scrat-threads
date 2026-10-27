'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { Store } = require('../src/store');

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'scrat-sql-'));
const post = (i, extra = {}) => ({ id: String(i), code: `C${i}`, username: 'zuck', text: `bài ${i}`, like_count: i, ...extra });

test('SQLite: lưu rồi mở lại giữ nguyên bài, hồ sơ, hàng đợi, cài đặt; xóa cũng được lưu', () => {
  const file = path.join(dir(), 'scrat.db');
  const a = new Store(file);
  a.upsertPosts([post(1), post(2), post(3)]);
  a.upsertProfiles([{ username: 'zuck', follower_count: 10 }]);
  a.data.outbox.push({ id: 'o1', parts: ['xin chào'], status: 'draft' });
  a.updateSettings({ maxScrolls: 12 });
  a.deletePosts(['2']);
  a.close();

  const b = new Store(file);
  assert.deepEqual(Object.keys(b.data.posts).sort(), ['1', '3']);
  assert.equal(b.data.posts['3'].text, 'bài 3');
  assert.equal(b.data.profiles.zuck.follower_count, 10);
  assert.equal(b.data.outbox[0].parts[0], 'xin chào');
  assert.equal(b.getSettings().maxScrolls, 12);
  b.clearAll(['library']);
  b.close();
  const c = new Store(file);
  assert.equal(Object.keys(c.data.posts).length, 0, 'xóa toàn bộ được lưu');
  c.close();
});

test('SQLite: tự chuyển dữ liệu từ db.json cũ và giữ file cũ', () => {
  const d = dir();
  fs.writeFileSync(path.join(d, 'db.json'), JSON.stringify({
    posts: { 1: post(1) }, profiles: { zuck: { username: 'zuck' } },
    jobs: [{ id: 'j', status: 'running' }], settings: { delayMin: 999 },
  }));
  const s = new Store(path.join(d, 'scrat.db'));
  assert.equal(s.migrated, 1);
  assert.equal(s.data.jobs[0].status, 'failed', 'tác vụ đang chạy bị đánh dấu gián đoạn');
  s.close();
  assert.ok(fs.existsSync(path.join(d, 'db.json.migrated')));
  assert.ok(!fs.existsSync(path.join(d, 'db.json')));
  const again = new Store(path.join(d, 'scrat.db'));
  assert.equal(again.data.posts['1'].code, 'C1');
  assert.equal(again.getSettings().delayMin, 999);
  assert.equal(again.migrated, undefined, 'chỉ chuyển một lần');
  again.close();
});

test('SQLite: file hỏng được giữ lại, app chạy tiếp với kho trống', () => {
  const file = path.join(dir(), 'scrat.db');
  fs.writeFileSync(file, 'đây không phải SQLite'.repeat(200));
  const s = new Store(file);
  assert.ok(s.recovered && fs.existsSync(s.recovered));
  s.upsertPosts([post(1)]);
  s.close();
  assert.equal(new Store(file).data.posts['1'].code, 'C1');
});

test('SQLite: 50.000 bài — chỉ ghi phần đã đổi nên lần lưu sau rất nhanh', () => {
  const file = path.join(dir(), 'scrat.db');
  const s = new Store(file);
  const many = Array.from({ length: 50000 }, (_, i) => post(i, { media: [{ url: 'https://x/' + i }], hashtags: ['a', 'b'] }));
  let t = Date.now();
  s.upsertPosts(many);
  s.flush();
  const first = Date.now() - t;
  t = Date.now();
  s.upsertPosts([post(7, { like_count: 999 })]);
  s.flush();
  const small = Date.now() - t;
  s.close();
  t = Date.now();
  const r = new Store(file);
  const load = Date.now() - t;
  assert.equal(Object.keys(r.data.posts).length, 50000);
  assert.equal(r.data.posts['7'].like_count, 999);
  r.close();
  console.log(`  ghi lần đầu ${first}ms · ghi 1 bài ${small}ms · mở lại ${load}ms`);
  assert.ok(small < 100, `ghi 1 bài mất ${small}ms`);
});
