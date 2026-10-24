'use strict';

/**
 * Lớp điều khiển trình duyệt. Mỗi tác vụ mở một context riêng, nghe mọi
 * response JSON + đọc dataset ẩn trong HTML, rồi cuộn trang để tải thêm.
 */

const { harvest, safeParse } = require('./extract');

const BASE = 'https://www.threads.com';
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

class CancelledError extends Error {
  constructor() {
    super('Đã hủy tác vụ');
    this.cancelled = true;
  }
}

/** Nhận cookie dạng JSON (xuất từ extension) hoặc chuỗi "a=1; b=2". */
function parseCookies(raw) {
  if (!raw || !raw.trim()) return [];
  const s = raw.trim();
  if (s.startsWith('[')) {
    try {
      return JSON.parse(s)
        .filter((c) => c.name && c.value != null)
        .map((c) => ({
          name: c.name,
          value: String(c.value),
          domain: c.domain || '.threads.com',
          path: c.path || '/',
          secure: true,
          httpOnly: !!c.httpOnly,
          sameSite: 'Lax',
        }));
    } catch {
      return [];
    }
  }
  return s.split(';').map((kv) => kv.trim()).filter(Boolean).map((kv) => {
    const i = kv.indexOf('=');
    return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: '.threads.com', path: '/', secure: true, sameSite: 'Lax' };
  }).filter((c) => c.name);
}

function parseProxy(raw) {
  if (!raw || !raw.trim()) return undefined;
  try {
    const u = new URL(raw.includes('://') ? raw : `http://${raw}`);
    return {
      server: `${u.protocol}//${u.host}`,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
    };
  } catch {
    return { server: raw.trim() };
  }
}

class Scraper {
  constructor() {
    this.browser = null;
    this.browserKey = '';
    this.launching = null;
  }

  async getBrowser(settings) {
    const key = JSON.stringify([settings.headless, settings.proxy]);
    if (this.browser && this.browserKey === key && this.browser.isConnected()) return this.browser;
    if (this.launching) return this.launching;
    this.launching = (async () => {
      if (this.browser) await this.browser.close().catch(() => {});
      let chromium;
      try {
        ({ chromium } = require('playwright'));
      } catch {
        throw new Error('Chưa cài Playwright. Chạy: npm install && npm run setup');
      }
      try {
        this.browser = await chromium.launch({
          headless: settings.headless,
          proxy: parseProxy(settings.proxy),
          args: ['--disable-blink-features=AutomationControlled'],
        });
      } catch (e) {
        if (/Executable doesn't exist/i.test(e.message)) {
          throw new Error('Chưa tải trình duyệt Chromium. Chạy: npm run setup');
        }
        throw e;
      }
      this.browserKey = key;
      return this.browser;
    })();
    try {
      return await this.launching;
    } finally {
      this.launching = null;
    }
  }

  async close() {
    if (this.browser) await this.browser.close().catch(() => {});
    this.browser = null;
  }

  /**
   * Mở một phiên làm việc. Trả về { page, acc, collect, scroll, close }.
   * `ctx` gồm settings, signal (kiểm tra hủy), log(msg).
   */
  async session(ctx) {
    const { settings } = ctx;
    const browser = await this.getBrowser(settings);
    const context = await browser.newContext({
      userAgent: settings.userAgent || DEFAULT_UA,
      locale: 'vi-VN',
      viewport: { width: 1280, height: 900 },
    });
    const cookies = parseCookies(settings.cookies);
    if (cookies.length) {
      await context.addCookies(cookies).catch((e) => ctx.log(`Cookie không hợp lệ: ${e.message}`, 'warn'));
    }
    // Chặn tài nguyên nặng để tăng tốc
    await context.route('**/*', (route) => {
      const t = route.request().resourceType();
      if (t === 'image' || t === 'media' || t === 'font') return route.abort();
      return route.continue();
    });

    const page = await context.newPage();
    page.setDefaultTimeout(settings.timeout);
    const acc = { posts: new Map(), users: new Map() };
    let netHits = 0;

    page.on('response', async (res) => {
      try {
        const url = res.url();
        if (!/\/(graphql|api)\//.test(url)) return;
        const ct = res.headers()['content-type'] || '';
        if (!/json|javascript|text/.test(ct)) return;
        const data = safeParse(await res.text());
        if (data) {
          harvest(data, acc);
          netHits++;
        }
      } catch { /* response đã bị hủy */ }
    });

    const checkCancel = () => {
      if (ctx.signal && ctx.signal.cancelled) throw new CancelledError();
    };

    const sleep = async (ms) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        checkCancel();
        await new Promise((r) => setTimeout(r, Math.min(200, end - Date.now())));
      }
    };

    const jitter = () => {
      const { delayMin, delayMax } = settings;
      return delayMin + Math.random() * Math.max(0, delayMax - delayMin);
    };

    /** Đọc các dataset JSON ẩn trong HTML. */
    const collect = async () => {
      const blobs = await page.$$eval('script[type="application/json"]', (els) =>
        els.map((e) => e.textContent).filter((t) => t && (t.includes('thread_items') || t.includes('follower_count') || t.includes('"caption"'))),
      ).catch(() => []);
      for (const b of blobs) {
        const data = safeParse(b);
        if (data) harvest(data, acc);
      }
      return acc;
    };

    const open = async (url) => {
      checkCancel();
      ctx.log(`Mở ${url}`);
      const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (res && res.status() >= 400) ctx.log(`Máy chủ trả mã ${res.status()}`, 'warn');
      await page.waitForSelector('[data-pressable-container], main', { timeout: Math.min(settings.timeout, 20000) }).catch(() => {});
      await sleep(jitter());
      if (/\/login/.test(page.url())) {
        ctx.log('Threads chuyển hướng tới trang đăng nhập — hãy thêm cookie trong Cài đặt', 'warn');
      }
      await collect();
    };

    /**
     * Cuộn trang cho tới khi `count()` đạt `target` hoặc không còn dữ liệu mới.
     * Gọi onProgress(count) sau mỗi lượt.
     */
    const scroll = async ({ target, count, onProgress }) => {
      let stale = 0;
      let last = count();
      for (let i = 0; i < settings.maxScrolls && count() < target; i++) {
        checkCancel();
        await page.mouse.wheel(0, 2400 + Math.random() * 1200);
        await sleep(jitter());
        await collect();
        const now = count();
        onProgress && onProgress(now);
        if (now === last) {
          if (++stale >= 3) {
            ctx.log('Không còn dữ liệu mới để tải');
            break;
          }
        } else {
          stale = 0;
          last = now;
        }
      }
    };

    const close = async () => {
      await context.close().catch(() => {});
    };

    return { page, acc, open, collect, scroll, close, sleep, jitter, netHits: () => netHits };
  }
}

module.exports = { Scraper, CancelledError, parseCookies, parseProxy, BASE };
