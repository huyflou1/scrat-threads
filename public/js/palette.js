/* Scrat Thread by HuyFlou — Bảng lệnh (Ctrl+K). */
import { MODES, PAGES } from './config.js';
import { S } from './state.js';
import { $, $$, detect, esc, tile } from './utils.js';
import { download, overlay } from './ui.js';
import { go } from './shell.js';
import { startJob } from './pages/scrape.js';
import { applyTheme, isDark } from './theme.js';
import { openNotifs } from './notifs.js';
import { ACTIONS } from './actions.js';

/* =====================================================
   Bảng lệnh (Ctrl+K)
   ===================================================== */
const P = { items: [], idx: 0 };

function paletteItems(q) {
  const items = [];
  const d = detect(q);
  if (d && q.trim().length > 1) {
    items.push({ sec: 'Cào ngay', icon: MODES[d.type].icon, color: MODES[d.type].color, label: `Cào ${d.text}`, hint: 'Enter', run: () => startJob(d.type, { ...d.body, limit: 50 }) });
  }
  const all = [
    ...PAGES.map((p) => ({ sec: 'Đi tới', icon: p.icon, color: p.color, label: p.label, run: () => go(p.path) })),
    { sec: 'Đi tới', icon: 'calendar', color: 'lemon', label: 'Hàng đợi đăng bài', run: () => go('/compose?tab=queue') },
    { sec: 'Đi tới', icon: 'calendar', color: 'peach', label: 'Lịch tự động', run: () => go('/jobs?tab=schedules') },
    ...Object.entries(MODES).map(([k, m]) => ({ sec: 'Tác vụ mới', icon: m.icon, color: m.color, label: `Cào theo ${m.label.toLowerCase()}`, run: () => { S.mode = k; go('/scrape?mode=' + k); } })),
    { sec: 'Lệnh', icon: 'sheet', color: 'mint', label: 'Xuất toàn bộ bài viết (Excel)', run: () => download('/api/export/posts.xlsx') },
    { sec: 'Lệnh', icon: 'sheet', color: 'mint', label: 'Xuất toàn bộ hồ sơ (Excel)', run: () => download('/api/export/profiles.xlsx') },
    { sec: 'Lệnh', icon: 'download', color: 'sky', label: 'Xuất toàn bộ bài viết (CSV)', run: () => download('/api/export/posts.csv') },
    { sec: 'Lệnh', icon: 'bell', color: 'peach', label: 'Mở thông báo', run: () => openNotifs() },
    { sec: 'Lệnh', icon: isDark() ? 'sun' : 'moon', color: 'lemon', label: isDark() ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối', run: () => applyTheme(isDark() ? 'light' : 'dark') },
    { sec: 'Lệnh', icon: 'party', color: 'pink', label: 'Nạp dữ liệu mẫu', run: () => ACTIONS.demo() },
  ];
  const t = q.trim().toLowerCase();
  return items.concat(t ? all.filter((i) => i.label.toLowerCase().includes(t)) : all);
}

function drawPalette() {
  const q = $('#palette-input').value;
  P.items = paletteItems(q);
  P.idx = Math.min(P.idx, Math.max(0, P.items.length - 1));
  let sec = '';
  $('#palette-list').innerHTML = P.items.map((it, i) => {
    const head = it.sec !== sec ? `<div class="palette-sec">${(sec = it.sec)}</div>` : '';
    return `${head}<div class="palette-item ${i === P.idx ? 'on' : ''}" data-i="${i}">${tile(it.icon, it.color)}<span>${esc(it.label)}</span>${it.hint ? `<small>${it.hint}</small>` : ''}</div>`;
  }).join('') || `<div class="empty sm"><b>Không có lệnh phù hợp</b></div>`;
  const on = $('#palette-list .on');
  if (on) on.scrollIntoView({ block: 'nearest' });
}

function openPalette() {
  const p = $('#palette');
  p.classList.add('on');
  overlay(true, closePalette);
  const inp = $('#palette-input');
  inp.value = '';
  P.idx = 0;
  drawPalette();
  setTimeout(() => inp.focus(), 30);
}
function closePalette() {
  $('#palette').classList.remove('on');
  overlay(false);
}
function runPalette(i) {
  const it = P.items[i];
  if (!it) return;
  closePalette();
  it.run();
}

$('#palette-input').addEventListener('input', () => { P.idx = 0; drawPalette(); });
$('#palette-input').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); P.idx = (P.idx + 1) % Math.max(1, P.items.length); drawPalette(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); P.idx = (P.idx - 1 + P.items.length) % Math.max(1, P.items.length); drawPalette(); }
  else if (e.key === 'Enter') { e.preventDefault(); runPalette(P.idx); }
});
$('#palette-list').addEventListener('click', (e) => {
  const it = e.target.closest('[data-i]');
  if (it) runPalette(+it.dataset.i);
});
$('#palette-list').addEventListener('mousemove', (e) => {
  const it = e.target.closest('[data-i]');
  if (it && +it.dataset.i !== P.idx) {
    P.idx = +it.dataset.i;
    $$('#palette-list .palette-item').forEach((el) => el.classList.toggle('on', +el.dataset.i === P.idx));
  }
});

export { P, paletteItems, drawPalette, openPalette, closePalette, runPalette };
