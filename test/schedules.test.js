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
