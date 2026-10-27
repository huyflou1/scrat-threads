/* Scrat Thread by HuyFlou — Popover & thông báo. */
import { S } from './state.js';
import { $, $$, ago, api, empty, esc, tile } from './utils.js';

/* =====================================================
   Popover & thông báo
   ===================================================== */
function closePops(except) {
  $$('.pop.on').forEach((p) => {
    if (p === except) return;
    p.classList.remove('on');
    const b = p.previousElementSibling;
    if (b) b.setAttribute('aria-expanded', 'false');
  });
}
function togglePop(pop, btn) {
  const on = !pop.classList.contains('on');
  closePops(pop);
  pop.classList.toggle('on', on);
  btn.setAttribute('aria-expanded', on);
  return on;
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.pop-wrap')) closePops();
}, true);

async function loadNotifs() {
  try { S.notifs = await api('/notifications'); } catch { /* bỏ qua */ }
  drawBell();
}

function drawBell() {
  const n = S.notifs.filter((x) => !x.read).length;
  $('#bell-count').textContent = n ? (n > 9 ? '9+' : n) : '';
  $('#bell-btn').setAttribute('aria-label', n ? `Thông báo (${n} chưa đọc)` : 'Thông báo');
}

function drawNotifPop() {
  const pop = $('#notif-pop');
  const unread = S.notifs.some((x) => !x.read);
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  pop.innerHTML = `
    <div class="pop-head"><b>Thông báo</b>
      ${unread ? `<button class="btn sm ghost" data-act="notif-read-all">${ic('check', 'sm')}Đã đọc hết</button>` : ''}
      ${S.notifs.length ? `<button class="btn sm ghost icon" data-act="notif-clear" aria-label="Xóa tất cả" title="Xóa tất cả">${ic('trash', 'sm')}</button>` : ''}
    </div>
    <div class="pop-body">${S.notifs.length ? S.notifs.map((n) => `
      <button class="notif ${n.read ? '' : 'unread'}" data-act="notif-open" data-id="${n.id}">
        ${tile(n.kind === 'error' ? 'warn' : 'bell', n.kind === 'error' ? 'pink' : 'peach', 'sm')}
        <span class="grow"><b>${esc(n.title)}</b>${n.body ? `<span>${esc(n.body)}</span>` : ''}<small>${ago(n.t)}</small></span>
      </button>`).join('')
      : empty('Chưa có thông báo', 'Khi hồ sơ bạn theo dõi bằng lịch tự động có bài mới, Scrat sẽ báo ở đây.', '', true)}</div>
    ${perm === 'default' ? `<div class="pop-foot"><button class="btn sm soft" data-act="notif-browser">${ic('bell', 'sm')}Bật thông báo trên máy tính</button></div>` : ''}`;
}

function openNotifs() {
  const pop = $('#notif-pop');
  drawNotifPop();
  if (!pop.classList.contains('on')) togglePop(pop, $('#bell-btn'));
}
$('#bell-btn').onclick = () => {
  drawNotifPop();
  togglePop($('#notif-pop'), $('#bell-btn'));
};

export { closePops, togglePop, loadNotifs, drawBell, drawNotifPop, openNotifs };
