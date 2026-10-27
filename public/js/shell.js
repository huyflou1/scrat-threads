/* Scrat Thread by HuyFlou — Khung: menu, router, tiêu đề. */
import { NAV, PAGES } from './config.js';
import { S } from './state.js';
import { $, tile } from './utils.js';
import { closeDrawer, toast } from './ui.js';
import { PAGE_RENDER } from './main.js';

/* =====================================================
   Khung: menu, router, tiêu đề
   ===================================================== */
function renderNav() {
  const running = S.jobs.filter((j) => j.status === 'running' || j.status === 'queued').length;
  $('#nav').innerHTML = NAV.map((g) => `
    <div class="nav-group">
      <div class="nav-label">${g.group}</div>
      ${g.items.map((it) => `
        <a class="nav-item ${S.route.id === it.id ? 'active' : ''}" href="#${it.path}" ${S.route.id === it.id ? 'aria-current="page"' : ''}>
          ${tile(it.icon, it.color)}<span>${it.label}</span>${it.badge ? `<span class="count">${running || ''}</span>` : ''}
        </a>`).join('')}
    </div>`).join('');
  $('#tabbar').innerHTML = PAGES.map((it) => `
    <button class="${S.route.id === it.id ? 'active' : ''} c-${it.color}" data-go="${it.path}" aria-label="${it.label}">
      <span class="tile c-${it.color}">${ic(it.icon)}</span>${it.label.replace(' dữ liệu', '')}
      ${it.badge ? `<span class="count">${running || ''}</span>` : ''}
    </button>`).join('');
  const pill = $('#live-pill');
  pill.classList.toggle('on', running > 0);
  pill.querySelector('span').textContent = `${running} tác vụ đang chạy`;
}

function parseRoute() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, q = ''] = h.split('?');
  const page = PAGES.find((p) => p.path === path) || PAGES[0];
  return { id: page.id, page, query: Object.fromEntries(new URLSearchParams(q)) };
}

function go(path) {
  if (location.hash === '#' + path) route();
  else location.hash = path;
}

async function route() {
  if (S.route.id === 'settings' && S.settingsDirty) {
    // Cảnh báo nhẹ khi rời trang cài đặt chưa lưu
    toast('Cài đặt chưa được lưu', 'info');
    S.settingsDirty = false;
  }
  S.route = parseRoute();
  const { page } = S.route;
  $('#page-title').innerHTML = `${page.label}`;
  $('#page-sub').textContent = page.sub;
  document.title = `${page.label} · Scrat Thread by HuyFlou`;
  renderNav();
  closeDrawer();
  const v = $('#view');
  v.style.animation = 'none';
  void v.offsetHeight;
  v.style.animation = '';
  await PAGE_RENDER[page.id]();
  window.scrollTo({ top: 0 });
}

export { renderNav, parseRoute, go, route };
