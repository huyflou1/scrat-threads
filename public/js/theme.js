/* Scrat Thread by HuyFlou — Giao diện sáng/tối. */
import { store } from './state.js';
import { $ } from './utils.js';

/* =====================================================
   Giao diện sáng/tối
   ===================================================== */
function applyTheme(t) {
  store.set('theme', t);
  try { localStorage.setItem('st-theme', t); } catch { /* bỏ qua */ }
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  drawThemeBtn();
}
function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function drawThemeBtn() {
  $('#theme-btn').innerHTML = ic(isDark() ? 'sun' : 'moon');
}

export { applyTheme, isDark, drawThemeBtn };
