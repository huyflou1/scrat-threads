'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { Store } = require('../src/store');
const { JobManager } = require('../src/jobs');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scrat-')), 'db.json');

test('upsert không xóa tên hiển thị khi nguồn mới thiếu', () => {
  const s = new Store(tmp());
  s.upsertPosts([{ id: '1', code: 'A', username: 'zuck', full_name: 'Mark Zuckerberg', avatar: 'x', like_count: 5 }]);
  s.upsertPosts([{ id: '1', code: 'A', username: 'zuck', full_name: '', avatar: null, like_count: 9 }]);
  const p = s.data.posts['1'];
  assert.equal(p.full_name, 'Mark Zuckerberg');
  assert.equal(p.avatar, 'x');
  assert.equal(p.like_count, 9, 'số liệu mới vẫn được cập nhật');
  clearTimeout(s.timer);
});

test('chỉ gắn parent_code cho trả lời đăng sau bài chính', () => {
  const s = new Store(tmp());
  const jm = new JobManager(s, {});
  const job = { stats: { new_posts: 0 } };
  const posts = new Map([
    ['0', { id: '0', code: 'ROOT', is_reply: false, published_at: '2026-01-01T00:00:00Z' }],
    ['1', { id: '1', code: 'PREV', is_reply: true, published_at: '2026-01-01T00:01:00Z' }],
    ['2', { id: '2', code: 'MAIN', is_reply: true, published_at: '2026-01-01T00:02:00Z' }],
    ['3', { id: '3', code: 'R1', is_reply: true, published_at: '2026-01-02T00:00:00Z' }],
  ]);
  jm.persist(job, { acc: { posts, users: new Map() } }, { parentCode: 'MAIN', source: 'post:MAIN' });
  const pc = (id) => s.data.posts[id].parent_code;
  assert.equal(pc('0'), null, 'bài gốc của thread');
  assert.equal(pc('1'), null, 'bài phía trên trong chuỗi');
  assert.equal(pc('2'), null, 'chính nó');
  assert.equal(pc('3'), 'MAIN', 'trả lời thật');
  clearTimeout(s.timer);
});
