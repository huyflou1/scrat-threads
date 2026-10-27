'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { goldenHours } = require('../src/query');

const at = (d, b, e, user = 'a') => ({ d, b, e, user });

test('giờ vàng: so với mức thường của tác giả, tài khoản lớn không lấn át', () => {
  const roots = [
    // Tài khoản lớn đăng Thứ Hai 9h, tương tác cao nhưng chỉ ở mức thường của họ
    ...[1000, 1100, 900, 1000].map((e) => at(0, 3, e, 'big')),
    ...[1000, 1000].map((e) => at(2, 3, e, 'big')),
    // Tài khoản nhỏ: Thứ Sáu 18h gấp ~3 lần mức thường
    ...[30, 33, 27].map((e) => at(4, 6, e, 'small')),
    ...[10, 10, 9, 11].map((e) => at(1, 2, e, 'small')),
  ];
  const { heat, best } = goldenHours(roots);
  assert.equal(heat.length, 7);
  assert.deepEqual([best.d, best.b], [4, 6]);
  assert.ok(best.lift > 2);
  assert.equal(heat[0][3].avg, 1000, 'vẫn giữ trung bình thô để hiện');
});

test('giờ vàng: một bài viral không thắng nhờ may mắn, ít bài thì độ tin cậy thấp', () => {
  const roots = [
    at(0, 0, 10), at(0, 0, 10000), // 1 bài viral trong ô 2 bài
    ...Array.from({ length: 8 }, () => at(3, 4, 40)),
    ...Array.from({ length: 12 }, () => at(5, 5, 10)),
  ];
  const { best } = goldenHours(roots);
  assert.deepEqual([best.d, best.b], [3, 4], 'trung vị + co về 1× khi ít bài');
  assert.equal(best.confidence, 'medium');
  assert.equal(goldenHours([at(0, 0, 1), at(1, 1, 2), at(2, 2, 3)]).best, null, 'không ô nào có từ 2 bài');
});
