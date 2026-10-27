/* Scrat Thread by HuyFlou — Toast, modal, drawer. */
import { $, esc, tile } from './utils.js';

/* =====================================================
   Toast, modal, drawer
   ===================================================== */
function toast(msg, kind = 'ok', action) {
  const map = { ok: ['check', 'mint'], err: ['warn', 'pink'], info: ['info', 'sky'], party: ['party', 'grape'] };
  const [icon, color] = map[kind] || map.ok;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${tile(icon, color)}<span>${esc(msg)}</span>${action ? `<button class="btn sm soft">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { action.run(); close(); };
  $('#toasts').append(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  setTimeout(close, action ? 6000 : 3200);
}

function confirmBox({ title, text, ok = 'Đồng ý', danger = false, icon = 'warn', color = 'pink' }) {
  return new Promise((resolve) => {
    const m = $('#modal');
    m.innerHTML = `${tile(icon, color, 'lg')}<h3>${title}</h3><p>${text}</p>
      <div class="row"><button class="btn" data-r="0">Thôi</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-r="1">${ok}</button></div>`;
    const done = (v) => { m.classList.remove('on'); overlay(false); resolve(v); };
    m.onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); };
    overlay(true, () => done(false));
    m.classList.add('on');
    m.querySelector('[data-r="1"]').focus();
  });
}

let overlayClose = null;
function overlay(on, onClose) {
  $('#overlay').classList.toggle('on', on);
  overlayClose = on ? onClose : null;
}
$('#overlay').onclick = () => overlayClose && overlayClose();

function openDrawer(html) {
  const d = $('#drawer');
  d.innerHTML = html;
  d.classList.add('on');
  overlay(true, closeDrawer);
  setTimeout(() => { const b = d.querySelector('[data-act="close-drawer"]'); if (b) b.focus(); }, 50);
}
function closeDrawer() {
  $('#drawer').classList.remove('on');
  overlay(false);
}

function download(url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.append(a);
  a.click();
  a.remove();
}

async function copy(text, msg = 'Đã sao chép') {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast('Trình duyệt chặn sao chép', 'err');
  }
}

export { toast, confirmBox, overlayClose, overlay, openDrawer, closeDrawer, download, copy };
