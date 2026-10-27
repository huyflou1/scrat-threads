'use strict';

const path = require('path');
const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'scrat.db');

const scrat = createApp({ dataFile: DATA_FILE, password: process.env.APP_PASSWORD || '', trustProxy: process.env.TRUST_PROXY || '' });

const server = scrat.app.listen(PORT, HOST, () => {
  console.log(`\n  🌰 Scrat Thread by HuyFlou đang chạy tại http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(scrat.auth.enabled ? '  🔒 Đã bật mật khẩu (APP_PASSWORD)\n' : '');
  if (process.env.OPEN_BROWSER) openBrowser(`http://${['0.0.0.0', '::'].includes(HOST) ? 'localhost' : HOST}:${PORT}`);
  if (!scrat.auth.enabled && !['127.0.0.1', 'localhost', '::1'].includes(HOST)) {
    console.warn('  ⚠️  App đang mở ra mạng mà KHÔNG có mật khẩu. Đặt APP_PASSWORD để bảo vệ dữ liệu và cookie đăng nhập.\n');
  }
});

/** Mở trình duyệt mặc định (dùng cho file khởi chạy bằng nhấp đúp). */
function openBrowser(url) {
  const { spawn } = require('child_process');
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch { /* không có trình duyệt — người dùng tự mở */ }
}

async function shutdown() {
  server.close();
  await scrat.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
