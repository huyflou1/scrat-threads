'use strict';

/**
 * Tải file từ link bên ngoài một cách an toàn:
 * tự theo chuyển hướng nhưng kiểm tra lại từng bước (giao thức, tên miền, IP nội bộ),
 * đọc dạng stream và dừng ngay khi vượt giới hạn dung lượng.
 */

const dns = require('dns').promises;
const net = require('net');

/** IP nội bộ / loopback / link-local — không cho tải để tránh dò mạng nội bộ (SSRF). */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || a >= 224;
  }
  const s = ip.toLowerCase();
  if (s.startsWith('::ffff:')) return isPrivateIp(s.slice(7));
  return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s);
}

async function checkUrl(url, { allowHost, allowPrivate }) {
  if (url.protocol !== 'https:') throw new Error('Chỉ hỗ trợ link https');
  if (allowHost && !allowHost(url.hostname)) throw new Error('Tên miền không được phép');
  if (allowPrivate) return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (ips.some(isPrivateIp)) throw new Error('Không tải từ địa chỉ mạng nội bộ');
}

/**
 * Trả về { res, type, read() } — read() đọc toàn bộ thân (giới hạn maxBytes).
 * Gọi res.body trực tiếp nếu muốn stream thẳng ra ngoài (vẫn phải tự giới hạn).
 */
async function safeFetch(raw, { maxBytes = 25 * 1024 * 1024, maxRedirects = 3, timeout = 30000, allowHost = null, allowPrivate = false, headers = {} } = {}) {
  let url = new URL(raw);
  const signal = AbortSignal.timeout(timeout);
  for (let hop = 0; ; hop++) {
    await checkUrl(url, { allowHost, allowPrivate });
    const res = await fetch(url, { redirect: 'manual', signal, headers });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      await res.body?.cancel().catch(() => {});
      if (hop >= maxRedirects) throw new Error('Chuyển hướng quá nhiều lần');
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    const len = Number(res.headers.get('content-length'));
    if (len > maxBytes) await res.body?.cancel().catch(() => {});
    if (len > maxBytes) throw Object.assign(new Error(`File quá lớn (tối đa ${Math.round(maxBytes / 1048576)} MB)`), { tooLarge: true });
    return {
      res,
      type: res.headers.get('content-type') || '',
      read: () => readLimited(res.body, maxBytes),
    };
  }
}

async function readLimited(body, maxBytes) {
  const chunks = [];
  let n = 0;
  if (!body) return Buffer.alloc(0);
  for await (const c of body) {
    n += c.length;
    if (n > maxBytes) throw Object.assign(new Error(`File quá lớn (tối đa ${Math.round(maxBytes / 1048576)} MB)`), { tooLarge: true });
    chunks.push(c);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

module.exports = { safeFetch, readLimited, isPrivateIp };
