'use strict';

/** API — Viết bài bằng AI, hàng đợi đăng, Threads API. */

const ai = require('../ai');
const threadsApi = require('../threads-api');
const { pickMethod } = require('../browser-poster');
const { filterPosts, engagement } = require('../query');
const { wrap } = require('./util');

module.exports = function register(app, { store, outbox }) {
  /* ---------- Viết bài bằng AI ---------- */
  app.get('/api/ai/models', wrap(() => ({
    models: ai.MODELS.map(({ id, label, tag }) => ({ id, label, tag })),
    hasKey: !!(store.getSettings().anthropicApiKey || process.env.ANTHROPIC_API_KEY),
    hasThreadsToken: !!store.getSettings().threadsToken,
    postVia: pickMethod(store.getSettings()),
    limit: ai.LIMIT,
  })));

  app.post('/api/ai/check', async (req, res) => {
    try {
      res.json(await ai.checkModels(store.getSettings().anthropicApiKey));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/ai/pick', wrap((req) => ai.pickModel({
    input: req.body.input,
    length: req.body.length,
    styleExamples: req.body.styleFrom ? 1 : 0,
  })));

  /** Bài nổi bật của một tài khoản trong kho, dùng làm mẫu giọng văn. */
  function styleExamples(username) {
    if (!username) return [];
    const own = store.listPosts().filter((p) => p.username === username && !p.parent_code && p.text);
    return filterPosts(own, { sort: 'engagement' }).slice(0, 5).map((p) => p.text.slice(0, 600));
  }

  app.post('/api/ai/generate', async (req, res) => {
    try {
      const b = req.body || {};
      const examples = styleExamples(b.styleFrom);
      if (b.styleFrom && !examples.length) throw new Error(`Kho chưa có bài viết nào của @${b.styleFrom} để học giọng văn`);
      res.json(await ai.generate({
        apiKey: store.getSettings().anthropicApiKey,
        input: b.input,
        tone: b.tone,
        length: b.length,
        lang: b.lang,
        hashtags: !!b.hashtags,
        emoji: !!b.emoji,
        model: b.model,
        examples,
      }));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  /* ---------- Hàng đợi đăng bài ---------- */
  app.get('/api/outbox', wrap(() => outbox.list()));
  app.post('/api/outbox', wrap((req) => outbox.create(req.body || {})));
  app.patch('/api/outbox/:id', wrap((req, res) => outbox.update(req.params.id, req.body || {}) || res.status(404).json({ error: 'Không tìm thấy bài' })));
  app.delete('/api/outbox/:id', wrap((req) => ({ removed: outbox.remove(req.params.id) })));
  app.post('/api/outbox/:id/publish', async (req, res) => {
    try {
      res.json(await outbox.publishNow(req.params.id));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/threads/me', async (req, res) => {
    try {
      const token = store.getSettings().threadsToken;
      const [profile, q] = await Promise.all([threadsApi.me(token), threadsApi.quota(token).catch(() => null)]);
      res.json({ ...profile, quota: q });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
};
