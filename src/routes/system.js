'use strict';

/** API — Thông báo, đăng nhập Threads, cài đặt, sao lưu. */

const { publicSettings, CLEAR_SCOPES } = require('../store');
const { seedDemo } = require('../demo');
const { parseCookies } = require('../scraper');
const express = require('express');
const { wrap } = require('./util');

module.exports = function register(app, { store, scraper, jobs }) {
  /* ---------- Thông báo ---------- */
  app.get('/api/notifications', wrap(() => store.data.notifications));
  app.post('/api/notifications/read', wrap((req) => {
    store.markNotificationsRead(Array.isArray(req.body.ids) ? req.body.ids : null);
    return { ok: true };
  }));
  app.delete('/api/notifications', wrap(() => {
    store.data.notifications = [];
    store.save();
    return { ok: true };
  }));

  /* ---------- Đăng nhập ---------- */
  function loginState() {
    const cookies = parseCookies(store.getSettings().cookies);
    return {
      hasSession: cookies.some((c) => c.name === 'sessionid' && c.value),
      cookieCount: cookies.length,
      windowOpen: !!scraper.login,
    };
  }
  app.get('/api/login', wrap(() => loginState()));
  app.post('/api/login', async (req, res) => {
    try {
      const cookies = await scraper.interactiveLogin(store.getSettings());
      store.updateSettings({ cookies: JSON.stringify(cookies) });
      res.json(loginState());
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post('/api/login/cancel', wrap(() => { scraper.cancelLogin(); return loginState(); }));
  app.delete('/api/login', wrap(() => { store.updateSettings({ cookies: '' }); return loginState(); }));

  /* ---------- Cài đặt ---------- */
  app.get('/api/settings', wrap(() => publicSettings(store.getSettings())));
  app.put('/api/settings', wrap((req) => {
    const s = store.updateSettings(req.body || {});
    jobs.pump();
    return publicSettings(s);
  }));

  app.get('/api/backup', (req, res) => {
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="scrat-threads-backup-${stamp}.json"`);
    res.type('application/json; charset=utf-8').send(JSON.stringify(store.exportAll()));
  });

  app.post('/api/restore', express.json({ limit: '200mb' }), wrap((req) => {
    const r = store.importAll(req.body);
    jobs.emit('data');
    return r;
  }));

  app.post('/api/demo', wrap(() => {
    const r = seedDemo(store);
    jobs.emit('data');
    return r;
  }));

  app.post('/api/clear', wrap((req) => {
    const scopes = Array.isArray(req.body && req.body.scopes) ? req.body.scopes.filter((x) => CLEAR_SCOPES.includes(x)) : undefined;
    if (scopes && !scopes.length) throw new Error('Chưa chọn mục nào để xóa');
    const r = store.clearAll(scopes);
    jobs.emit('data');
    return r;
  }));
};
