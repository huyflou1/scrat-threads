'use strict';

/**
 * Đăng bài bằng trình duyệt, dùng phiên đăng nhập (cookie) đã có trong Cài đặt —
 * không cần Threads API token. Mở web intent chính thức của Threads
 * (https://www.threads.com/intent/post?text=…) rồi bấm nút Đăng như người dùng.
 * Chuỗi thread: mỗi phần sau mở intent với reply_post_shortcode của phần trước.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseCookies, BASE } = require('./scraper');
const { harvest, safeParse } = require('./extract');
const { ThreadsError } = require('./threads-api');
const { safeFetch } = require('./safe-fetch');

const DEBUG_DIR = process.env.DEBUG_DIR || path.join(path.dirname(process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json')), 'debug');
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const POST_BUTTON = /^(Post|Đăng|Đăng bài|Reply|Trả lời)$/i;
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Có cookie sessionid thì coi như đã đăng nhập. */
function hasSession(settings) {
  return parseCookies(settings.cookies).some((c) => c.name === 'sessionid' && c.value);
}

/**
 * Chọn cách đăng theo cài đặt postMethod: 'api' (Threads API, cần token),
 * 'browser' (phiên đăng nhập) hoặc 'auto' (có token thì dùng API, không thì trình duyệt).
 * Trả về null nếu chưa có cách nào dùng được.
 */
function pickMethod(settings) {
  const api = !!settings.threadsToken;
  const browser = hasSession(settings);
  if (settings.postMethod === 'api') return api ? 'api' : null;
  if (settings.postMethod === 'browser') return browser ? 'browser' : null;
  return api ? 'api' : browser ? 'browser' : null;
}

/** Tải ảnh về file tạm để gắn vào khung soạn bài (tối đa 10 MB, giới hạn của Threads là 8 MB). */
async function downloadImage(url) {
  let got;
  try {
    got = await safeFetch(url, { maxBytes: 10 * 1024 * 1024 });
    if (!got.res.ok || !/^image\//.test(got.type)) throw new Error(`máy chủ trả mã ${got.res.status} ${got.type}`.trim());
    const buf = await got.read();
    const ext = got.type.includes('png') ? '.png' : got.type.includes('webp') ? '.webp' : '.jpg';
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scrat-img-')), 'image' + ext);
    fs.writeFileSync(file, buf);
    return file;
  } catch (e) {
    throw new ThreadsError(`Không tải được ảnh từ link: ${e.message}`);
  }
}

/**
 * Đăng một phần, trả về mã bài (shortcode) vừa đăng.
 * Tìm mã theo 3 cách: phản hồi mạng lúc đăng → link "Xem" trên thông báo → trang hồ sơ.
 */
async function postOne(page, { text, replyTo, image, log }) {
  const url = `${BASE}/intent/post?text=${encodeURIComponent(text)}${replyTo ? `&reply_post_shortcode=${replyTo}` : ''}`;
  const seen = { posts: new Map(), users: new Map() };
  const onRes = async (res) => {
    try {
      if (!/\/(graphql|api)\//.test(res.url())) return;
      const d = safeParse(await res.text());
      if (d) harvest(d, seen);
    } catch { /* phản hồi bị hủy */ }
  };

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (/\/(login|accounts\/login)/.test(page.url())) {
    throw new ThreadsError('Phiên đăng nhập Threads đã hết hạn — vào Cài đặt → Đăng nhập Threads để đăng nhập lại');
  }
  const dialog = page.getByRole('dialog').last();
  await dialog.waitFor({ timeout: 30000 });
  const box = dialog.locator('[contenteditable="true"]').first();
  await box.waitFor({ timeout: 15000 });
  // Intent đã điền sẵn chữ; nếu chưa (giao diện đổi) thì tự gõ vào
  if (!norm(await box.innerText()).length) {
    await box.click();
    await page.keyboard.insertText(text);
  }
  if (image) {
    await dialog.locator('input[type="file"]').first().setInputFiles(image);
    await page.waitForTimeout(3000);
  }

  const button = dialog.getByRole('button', { name: POST_BUTTON }).last();
  await button.waitFor({ timeout: 15000 });
  page.on('response', onRes);
  await button.click();
  log('Đã bấm Đăng, chờ Threads xác nhận…');

  // Khung soạn đóng lại = đã đăng; vẫn mở sau 60 giây là lỗi
  const closed = await dialog.waitFor({ state: 'detached', timeout: 60000 }).then(() => true).catch(() => false);
  if (!closed) {
    const err = await dialog.innerText().catch(() => '');
    throw Object.assign(new ThreadsError(`Threads không đăng bài: ${norm(err).slice(0, 160) || 'khung soạn bài vẫn mở'}`), { clicked: true });
  }

  const want = norm(text).slice(0, 60);
  const match = () => [...seen.posts.values()].find((p) => norm(p.text).startsWith(want));
  let code = null;
  for (let i = 0; i < 10 && !code; i++) {
    const m = match();
    if (m) code = m.code;
    else await page.waitForTimeout(500);
  }
  if (!code) {
    const link = page.locator('a[href*="/post/"]').filter({ hasText: /View|Xem/i }).first();
    const href = await link.getAttribute('href', { timeout: 8000 }).catch(() => null);
    const m = href && href.match(/\/post\/([A-Za-z0-9_-]+)/);
    if (m) code = m[1];
  }
  page.off('response', onRes);
  return { code, username: (match() || {}).username || null };
}

/**
 * Đăng bài / chuỗi thread bằng trình duyệt. Trả về { ids, permalink } giống threads-api.publish.
 * `done` là các mã bài đã đăng ở lần trước (để đăng tiếp phần còn thiếu).
 */
async function publishViaBrowser(scraper, settings, { parts, imageUrl, done = [], onPart, log = () => {} }) {
  if (!hasSession(settings)) {
    throw new ThreadsError('Chưa đăng nhập Threads — vào Cài đặt → Đăng nhập Threads (hoặc nhập Threads access token)');
  }
  const image = imageUrl && !done.length ? await downloadImage(imageUrl) : null;
  const browser = await scraper.getBrowser(settings);
  const context = await browser.newContext({ userAgent: settings.userAgent || DEFAULT_UA, locale: 'vi-VN', viewport: { width: 1280, height: 900 } });
  await context.addCookies(parseCookies(settings.cookies));
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  const ids = [...done];
  let username = null;
  try {
    for (let i = ids.length; i < parts.length; i++) {
      log(`Đăng phần ${i + 1}/${parts.length} bằng trình duyệt`);
      const r = await postOne(page, { text: parts[i], replyTo: ids[i - 1], image: i === 0 ? image : null, log });
      username = r.username || username;
      if (!r.code) {
        if (i < parts.length - 1) {
          throw Object.assign(new ThreadsError(`Đã đăng phần ${i + 1} nhưng không lấy được mã bài để nối phần tiếp theo — kiểm tra trên Threads`), { clicked: true });
        }
        ids.push(null);
      } else {
        ids.push(r.code);
      }
      if (onPart) onPart([...ids]);
      if (i < parts.length - 1) await page.waitForTimeout(2500 + Math.random() * 2000);
    }
    const first = ids[0];
    const permalink = !first ? null : username ? `${BASE}/@${username}/post/${first}` : `${BASE}/t/${first}`;
    return { ids, permalink };
  } catch (e) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const shot = path.join(DEBUG_DIR, `dang-bai-${Date.now()}.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    if (e instanceof ThreadsError) {
      e.message += ` (ảnh chụp màn hình: ${shot})`;
      throw e;
    }
    // Lỗi khi chưa bấm Đăng (không thấy khung soạn, mạng…) thì thử lại an toàn
    throw new ThreadsError(`Không đăng được bằng trình duyệt: ${String(e.message).split('\n')[0]} (ảnh chụp màn hình: ${shot})`, { transient: !e.clicked });
  } finally {
    await context.close().catch(() => {});
    if (image) fs.rmSync(path.dirname(image), { recursive: true, force: true });
  }
}

module.exports = { publishViaBrowser, hasSession, pickMethod, POST_BUTTON };
