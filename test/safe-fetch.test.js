'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { safeFetch, readLimited, isPrivateIp } = require('../src/safe-fetch');

test('nhận diện IP nội bộ', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0']) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ['8.8.8.8', '157.240.1.1', '2a03:2880::1', '172.32.0.1']) assert.ok(!isPrivateIp(ip), ip);
});

test('chặn http, IP nội bộ và tên miền ngoài danh sách', async () => {
  await assert.rejects(safeFetch('http://example.com/a.jpg'), /https/);
  await assert.rejects(safeFetch('https://127.0.0.1/a.jpg'), /nội bộ/);
  await assert.rejects(safeFetch('https://[::1]/a.jpg'), /nội bộ/);
  await assert.rejects(safeFetch('https://evil.example/a.jpg', { allowHost: (h) => h.endsWith('fbcdn.net') }), /không được phép/);
});

test('đọc dạng stream và dừng khi vượt giới hạn', async () => {
  const body = (n) => new Blob([Buffer.alloc(n)]).stream();
  assert.equal((await readLimited(body(1000), 1024)).length, 1000);
  await assert.rejects(readLimited(body(4096), 1024), (e) => e.tooLarge);
});
