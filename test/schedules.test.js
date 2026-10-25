'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const { Scheduler } = require('../src/schedules');

function fakeEnv() {
  const data = { jobs: [], schedules: [] };
  const store = { data, save() {}, getJob: (id) => data.jobs.find((j) => j.id === id) };
  const jobs = new EventEmitter();
  let n = 0;
  jobs.create = (type, raw) => {
    if (!raw.username) throw new Error('Tên người dùng không hợp lệ');
    const j = { id: 'j' + ++n, type, label: '@' + raw.username, status: 'queued', stats: { posts: 0 } };
    data.jobs.unshift(j);
    return j;
  };
  const sch = new Scheduler(store, jobs);
  clearInterval(sch.timer);
  return { store, jobs, sch, data };
}

test('tạo lịch chạy ngay lượt đầu và đặt lượt kế tiếp', () => {
  const { sch, data } = fakeEnv();
  const { schedule, job } = sch.create('profile', { username: 'zuck', limit: 20, junk: 1 }, 60);
  assert.equal(job.schedule_id, schedule.id);
  assert.deepEqual(schedule.raw, { limit: 20, username: 'zuck' });
  assert.ok(Date.parse(schedule.next_run) - Date.now() > 59 * 60000);
  assert.equal(data.jobs.length, 1);
  assert.throws(() => sch.create('profile', { username: 'a' }, 5), /tối thiểu/);
});

test('tick chỉ chạy lịch đến hạn, bỏ qua khi lượt trước còn chạy', () => {
  const { sch, data } = fakeEnv();
  const { schedule } = sch.create('profile', { username: 'zuck' }, 60);
  sch.tick();
  assert.equal(data.jobs.length, 1, 'chưa đến hạn');

  schedule.next_run = new Date(Date.now() - 1000).toISOString();
  sch.tick();
  assert.equal(data.jobs.length, 1, 'lượt trước vẫn queued nên bỏ qua');

  data.jobs[0].status = 'done';
  schedule.next_run = new Date(Date.now() - 1000).toISOString();
  sch.tick();
  assert.equal(data.jobs.length, 2);
  assert.equal(schedule.runs, 2);

  sch.update(schedule.id, { enabled: false });
  data.jobs[0].status = 'done';
  schedule.next_run = new Date(Date.now() - 1000).toISOString();
  sch.tick();
  assert.equal(data.jobs.length, 2, 'lịch đã tắt');
});

test('lịch có đầu vào hỏng sẽ tự tắt', () => {
  const { sch } = fakeEnv();
  const { schedule } = sch.create('profile', { username: 'zuck' }, 60);
  schedule.raw = {};
  schedule.last_job_id = null;
  schedule.next_run = new Date(Date.now() - 1000).toISOString();
  sch.tick();
  assert.equal(schedule.enabled, false);
  assert.match(schedule.error, /không hợp lệ/);
});

test('thông báo: bỏ qua lượt đầu, báo bài mới từ lượt sau, báo lỗi', () => {
  const { scheduleNotification } = require('../src/notify');
  const posts = { a: { id: 'a', username: 'zuck', text: 'Bài cũ hơn', published_at: '2026-01-01' }, b: { id: 'b', username: 'zuck', text: 'Bài mới nhất', published_at: '2026-02-01' } };
  const job = { type: 'profile', input: { username: 'zuck' }, status: 'done', stats: { new_posts: 2 }, _newIds: ['a', 'b'] };
  const get = (id) => posts[id];
  assert.equal(scheduleNotification(job, { label: '@zuck', runs: 1 }, get), null);
  const n = scheduleNotification(job, { label: '@zuck', runs: 2 }, get);
  assert.equal(n.title, '@zuck có 2 bài mới');
  assert.equal(n.body, '@zuck: Bài mới nhất');
  assert.equal(n.link, '#/library?username=zuck');
  assert.equal(scheduleNotification({ ...job, stats: { new_posts: 0 } }, { label: '@zuck', runs: 5 }, get), null);
  assert.equal(scheduleNotification({ ...job, status: 'failed', error: 'x' }, { label: '@zuck', runs: 1 }, get).kind, 'error');
  assert.equal(scheduleNotification(job, null, get), null);
});

test('xlsx: zip hợp lệ và tên cột', () => {
  const { crc32, colName, toXLSX } = require('../src/xlsx');
  assert.equal(crc32(Buffer.from('hello')), 0x3610a686);
  assert.deepEqual([0, 25, 26, 701, 702].map(colName), ['A', 'Z', 'AA', 'ZZ', 'AAA']);
  const buf = toXLSX({ columns: [{ header: 'A' }], rows: [['x\u0001<'], [3]] });
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50);
});
