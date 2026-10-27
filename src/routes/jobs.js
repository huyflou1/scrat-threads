'use strict';

/** API — Tác vụ cào và lịch tự động. */

const { publicJob } = require('../jobs');
const { wrap } = require('./util');

module.exports = function register(app, { store, jobs, scheduler }) {
  /* ---------- Tác vụ ---------- */
  app.get('/api/jobs', wrap((req) => {
    let list = store.data.jobs;
    if (req.query.status) list = list.filter((j) => j.status === req.query.status);
    return list.map(publicJob);
  }));

  app.get('/api/jobs/:id', wrap((req, res) => {
    const j = store.getJob(req.params.id);
    if (!j) return res.status(404).json({ error: 'Không tìm thấy tác vụ' });
    return publicJob(j);
  }));

  app.post('/api/jobs', wrap((req) => publicJob(jobs.create(req.body.type, req.body))));

  app.post('/api/jobs/:id/cancel', wrap((req) => {
    const j = jobs.cancel(req.params.id);
    if (!j) throw new Error('Không tìm thấy tác vụ');
    return publicJob(j);
  }));

  app.post('/api/jobs/:id/retry', wrap((req) => {
    const j = jobs.retry(req.params.id);
    if (!j) throw new Error('Không tìm thấy tác vụ');
    return publicJob(j);
  }));

  app.delete('/api/jobs', wrap(() => ({
    removed: store.removeJobs((j) => j.status !== 'running' && j.status !== 'queued'),
  })));


  /* ---------- Lịch tự động ---------- */
  app.get('/api/schedules', wrap(() => scheduler.list().map((s) => {
    const j = s.last_job_id && store.getJob(s.last_job_id);
    return { ...s, last_status: j ? j.status : null, last_posts: j ? j.stats.posts : null };
  })));
  app.post('/api/schedules', wrap((req) => {
    const { schedule, job } = scheduler.create(req.body.type, req.body, req.body.every);
    return { schedule, job: publicJob(job) };
  }));
  app.patch('/api/schedules/:id', wrap((req, res) => scheduler.update(req.params.id, req.body || {}) || res.status(404).json({ error: 'Không tìm thấy lịch' })));
  app.delete('/api/schedules/:id', wrap((req) => ({ removed: scheduler.remove(req.params.id) })));
  app.post('/api/schedules/:id/run', wrap((req, res) => {
    const r = scheduler.run(req.params.id);
    if (!r) return res.status(404).json({ error: 'Không tìm thấy lịch' });
    return { schedule: r.schedule, job: publicJob(r.job), skipped: !!r.skipped };
  }));
};
