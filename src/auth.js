'use strict';

/**
 * Bảo vệ app bằng mật khẩu (bật khi đặt biến môi trường APP_PASSWORD).
 * Phiên đăng nhập là cookie ký HMAC "hạn.chữ-ký" nên vẫn còn hiệu lực sau
 * khi khởi động lại; đổi mật khẩu thì mọi phiên cũ mất hiệu lực.
 */

const crypto = require('crypto');

const COOKIE = 'st_auth';
const MAX_AGE = 30 * 864e5; // 30 ngày
const PUBLIC = new Set(['/login.html', '/styles.css', '/icons.js', '/api/auth', '/api/auth/login']);

function createAuth(password, { now = () => Date.now() } = {}) {
  const enabled = !!password;
  const key = enabled ? crypto.createHash('sha256').update('scrat:' + password).digest() : null;
  const attempts = new Map(); // ip -> { n, reset }

  const sign = (exp) => crypto.createHmac('sha256', key).update(String(exp)).digest('base64url');

  function issue() {
    const exp = now() + MAX_AGE;
    return `${exp}.${sign(exp)}`;
  }

  function verify(token) {
    if (!enabled) return true;
    const [exp, sig] = String(token || '').split('.');
    if (!exp || !sig || Number(exp) < now()) return false;
    const good = Buffer.from(sign(exp));
    const got = Buffer.from(sig);
    return good.length === got.length && crypto.timingSafeEqual(good, got);
  }

  function checkPassword(input) {
    const a = crypto.createHash('sha256').update(String(input || '')).digest();
    const b = crypto.createHash('sha256').update(password).digest();
    return crypto.timingSafeEqual(a, b);
  }

  /** Giới hạn 8 lần thử / 5 phút mỗi IP. Trả về số giây phải chờ, 0 nếu được thử. */
  function throttle(ip) {
    const t = now();
    const a = attempts.get(ip);
    if (!a || a.reset < t) {
      attempts.set(ip, { n: 1, reset: t + 5 * 60000 });
      return 0;
    }
    a.n++;
    return a.n > 8 ? Math.ceil((a.reset - t) / 1000) : 0;
  }

  const readCookie = (req) => {
    const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
    return m ? decodeURIComponent(m[1]) : '';
  };
  const isAuthed = (req) => verify(readCookie(req));

  function middleware(req, res, next) {
    if (!enabled || PUBLIC.has(req.path) || isAuthed(req)) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Cần đăng nhập', auth: true });
    return res.redirect(302, '/login.html');
  }

  function cookieHeader(value, maxAge, secure) {
    return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${secure ? '; Secure' : ''}`;
  }

  function routes(app) {
    app.get('/api/auth', (req, res) => res.json({ enabled, authed: isAuthed(req) }));
    app.post('/api/auth/login', (req, res) => {
      if (!enabled) return res.json({ ok: true });
      const wait = throttle(req.ip);
      if (wait) return res.status(429).json({ error: `Thử quá nhiều lần, chờ ${wait} giây nhé` });
      if (!checkPassword(req.body && req.body.password)) return res.status(401).json({ error: 'Sai mật khẩu rồi' });
      attempts.delete(req.ip);
      res.setHeader('Set-Cookie', cookieHeader(issue(), MAX_AGE, req.secure));
      res.json({ ok: true });
    });
    app.post('/api/auth/logout', (req, res) => {
      res.setHeader('Set-Cookie', cookieHeader('', 0, req.secure));
      res.json({ ok: true });
    });
  }

  return { enabled, middleware, routes, issue, verify, checkPassword, throttle };
}

module.exports = { createAuth, COOKIE };
