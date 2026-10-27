'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createAuth } = require('../src/auth');

test('phiên đăng nhập: hợp lệ, hết hạn, bị sửa, đổi mật khẩu', () => {
  let t = 1_000_000;
  const a = createAuth('bi-mat', { now: () => t });
  const tok = a.issue();
  assert.equal(a.verify(tok), true);
  assert.equal(a.verify(tok.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))), false, 'chữ ký bị sửa');
  const [exp, sig] = tok.split('.');
  assert.equal(a.verify(`${Number(exp) + 1}.${sig}`), false, 'kéo dài hạn');
  assert.equal(a.verify(''), false);
  assert.equal(createAuth('mat-khau-moi', { now: () => t }).verify(tok), false, 'đổi mật khẩu');
  t += 31 * 864e5;
  assert.equal(a.verify(tok), false, 'hết hạn sau 30 ngày');
});

test('kiểm tra mật khẩu và giới hạn số lần thử', () => {
  const a = createAuth('bi-mat');
  assert.equal(a.checkPassword('bi-mat'), true);
  assert.equal(a.checkPassword('sai'), false);
  assert.equal(a.checkPassword(undefined), false);
  for (let i = 0; i < 8; i++) assert.equal(a.throttle('1.2.3.4'), 0);
  assert.ok(a.throttle('1.2.3.4') > 0);
  assert.equal(a.throttle('5.6.7.8'), 0, 'IP khác không bị ảnh hưởng');
});

test('tắt mật khẩu thì mọi request đều qua', () => {
  const a = createAuth('');
  assert.equal(a.enabled, false);
  let passed = false;
  a.middleware({ path: '/api/posts', headers: {} }, {}, () => { passed = true; });
  assert.equal(passed, true);
});
