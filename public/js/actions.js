/* Scrat Thread by HuyFlou — Hành động (event delegation). */
import { everyLabel } from './config.js';
import { S, store } from './state.js';
import { $, $$, api, esc, num, qs } from './utils.js';
import { closeDrawer, confirmBox, copy, download, overlayClose, toast } from './ui.js';
import { go, route } from './shell.js';
import { renderHome } from './pages/home.js';
import { createSchedule, repeatHint, setLimit, setMode, startJob, submitLabel } from './pages/scrape.js';
import { drawJobs, drawSchedules, jobCard, loadJobs, loadSchedules, upsertJob, upsertSchedule } from './pages/jobs.js';
import { drawPosts, drawPostsShell, findPost, loadPosts, loadProfiles, openPost, openProfile, renderLibrary, setLibFilter, toggleSel } from './pages/library.js';
import { C, drawEditor, needToken, saveForm, submitEditor, toLocalInput, updatePick, upsertOutbox, variantsHTML } from './pages/compose.js';
import { drawLogin, renderSettings, saveSettings } from './pages/settings.js';
import { applyTheme, drawThemeBtn, isDark } from './theme.js';
import { closePops, drawBell, drawNotifPop, togglePop } from './notifs.js';
import { closePalette, openPalette } from './palette.js';

/* =====================================================
   Hành động (event delegation)
   ===================================================== */
const ACTIONS = {
  mode: (el) => setMode(el.dataset.mode),
  limit: (el) => setLimit(el.dataset.v),
  'draft-set': (el) => {
    S.draft[S.mode][el.dataset.k] = el.dataset.v;
    store.set('draft', S.draft);
    $$(`[data-act="draft-set"][data-k="${el.dataset.k}"]`).forEach((b) => b.classList.toggle('on', b === el));
  },
  'job-filter': (el) => { S.jobFilter = el.dataset.v; drawJobs(); },
  'toggle-logs': (el) => {
    const id = el.dataset.id;
    if (S.openLogs.has(id)) S.openLogs.delete(id); else S.openLogs.add(id);
    const j = S.jobs.find((x) => x.id === id);
    $('#job-' + id).outerHTML = jobCard(j);
    const l = $('#job-' + id + ' .logs');
    if (l) l.scrollTop = l.scrollHeight;
  },
  'cancel-job': async (el) => {
    try { upsertJob(await api(`/jobs/${el.dataset.id}/cancel`, { method: 'POST' })); } catch (e) { toast(e.message, 'err'); }
  },
  'retry-job': async (el) => {
    try { upsertJob(await api(`/jobs/${el.dataset.id}/retry`, { method: 'POST' })); toast('Đã chạy lại tác vụ', 'party'); } catch (e) { toast(e.message, 'err'); }
  },
  'job-data': (el) => {
    const j = S.jobs.find((x) => x.id === el.dataset.id);
    if (!j) return;
    const src = j.type === 'profile' ? { username: j.input.username }
      : j.type === 'post' ? { source: `post:${j.input.code}` }
      : j.type === 'search' ? { source: `search:${j.input.query}` } : {};
    go('/library?' + qs(src));
  },
  'clear-jobs': async () => {
    if (!(await confirmBox({ title: 'Dọn lịch sử tác vụ?', text: 'Các tác vụ đã xong / lỗi sẽ bị xóa khỏi danh sách. Dữ liệu đã cào vẫn được giữ.', ok: 'Dọn dẹp', icon: 'trash' }))) return;
    const r = await api('/jobs', { method: 'DELETE' });
    await loadJobs();
    drawJobs();
    toast(`Đã dọn ${r.removed} tác vụ`);
  },

  'open-post': (el) => {
    if (S.lib.selected.size && el.closest('#post-list')) return toggleSel(el.dataset.id);
    openPost(el.dataset.id);
  },
  'toggle-sel': (el) => toggleSel(el.dataset.id),
  'sel-all': () => {
    const all = S.lib.items.every((p) => S.lib.selected.has(p.id));
    S.lib.items.forEach((p) => (all ? S.lib.selected.delete(p.id) : S.lib.selected.add(p.id)));
    drawPosts();
  },
  'clear-sel': () => { S.lib.selected.clear(); drawPosts(); },
  'export-sel': (el) => download(`/api/export/posts.${el.dataset.fmt}?ids=${encodeURIComponent([...S.lib.selected].join(','))}`),
  'scrape-replies-sel': async () => {
    const posts = [...S.lib.selected].map(findPost).filter(Boolean);
    if (!posts.length) return;
    if (posts.length > 200) return toast('Tối đa 200 bài mỗi lần', 'err');
    const job = await startJob('batch', { items: posts.map((p) => p.url).join('\n'), limit: 50 });
    if (job) { S.lib.selected.clear(); drawPosts(); }
  },
  backup: () => {
    download('/api/backup');
    toast('Đang tải bản sao lưu (không kèm cookie đăng nhập và khóa bí mật)', 'info');
  },
  restore: () => {
    const input = $('#restore-file');
    input.value = '';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch {
        return toast('File JSON bị hỏng', 'err');
      }
      if (!(await confirmBox({ title: 'Khôi phục từ bản sao lưu?', text: `Dữ liệu trong “${esc(file.name)}” sẽ được gộp vào kho hiện tại, không xóa gì. Cài đặt (trừ cookie và khóa bí mật) được áp dụng theo bản sao lưu. Lịch tự động nhập vào ở trạng thái tắt, bài hẹn giờ chưa đăng thành nháp.`, ok: 'Khôi phục', icon: 'refresh', color: 'sky' }))) return;
      try {
        const r = await api('/restore', { method: 'POST', body: data });
        toast(`Đã khôi phục ${num(r.posts)} bài, ${num(r.profiles)} hồ sơ, ${num(r.schedules)} lịch, ${num(r.outbox || 0)} bài trong hàng đợi đăng${r.skipped ? ` (bỏ qua ${r.skipped} mục lỗi)` : ''}`, 'party');
        setTimeout(() => location.reload(), 1200);
      } catch (e) {
        toast(e.message, 'err');
      }
    };
    input.click();
  },
  'cf-set': (el) => {
    const { k, v } = el.dataset;
    C.form[k] = v;
    saveForm();
    $$(`[data-act="cf-set"][data-k="${k}"]`).forEach((b) => b.classList.toggle('on', b === el));
    if (k === 'model' || k === 'length') updatePick();
  },
  'cf-generate': async () => {
    const f = C.form;
    if (!f.input.trim()) { toast('Hãy nhập ý tưởng hoặc nội dung trước', 'err'); return $('#cf-input').focus(); }
    if (C.generating) return;
    const btn = () => $('[data-act="cf-generate"]');
    C.generating = true;
    if (btn()) { btn().disabled = true; btn().innerHTML = '<span class="spin"></span>Đang viết…'; }
    try {
      const r = await api('/ai/generate', { method: 'POST', body: f });
      C.variants = r.variants;
      C.meta = r;
      const box = $('#cf-variants');
      if (box) { box.innerHTML = variantsHTML(); box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      C.generating = false;
      if (btn()) { btn().disabled = false; btn().innerHTML = `${ic('sparkle')}Tạo bài viết`; }
    }
  },
  'cf-use': (el) => {
    const v = C.variants[+el.dataset.i];
    C.editor.parts = [...v.parts];
    C.editor.model = C.meta && C.meta.model;
    drawEditor();
    $('#editor-block').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Đã đưa vào bản đăng — sửa thêm nếu muốn');
  },
  'ed-add': () => { C.editor.parts.push(''); drawEditor(); $(`#ed-p${C.editor.parts.length - 1}`).focus(); },
  'ed-del': (el) => { C.editor.parts.splice(+el.dataset.i, 1); drawEditor(); },
  'ed-when': (el) => { C.editor.when = el.dataset.v; drawEditor(); },
  'ed-quick': (el) => { C.editor.at = el.dataset.at; drawEditor(); },
  'ed-new': () => { C.editor = { parts: [''], image_url: '', when: 'now', at: '', editingId: null, model: null }; drawEditor(); },
  'ed-draft': () => submitEditor('draft'),
  'go-token': () => go('/settings?focus=threads'),
  'ed-submit': async () => {
    if (!C.hasToken && !(await needToken())) return;
    if (C.editor.when === 'now' && !(await confirmBox({ title: 'Đăng ngay lên Threads?', text: 'Bài sẽ hiện công khai trên tài khoản Threads của bạn.', ok: 'Đăng ngay', icon: 'send', color: 'mint' }))) return;
    submitEditor(C.editor.when);
  },
  'ob-publish': async (el) => {
    if (!C.hasToken && !(await needToken())) return;
    if (!(await confirmBox({ title: 'Đăng bài này ngay?', text: 'Bài sẽ hiện công khai trên tài khoản Threads của bạn.', ok: 'Đăng ngay', icon: 'send', color: 'mint' }))) return;
    toast('Đang đăng lên Threads…', 'info');
    try {
      C.manual++;
      let p;
      try { p = await api(`/outbox/${el.dataset.id}/publish`, { method: 'POST' }); } finally { setTimeout(() => C.manual--, 1500); }
      upsertOutbox(p);
      toast(p.status === 'published' ? 'Đã đăng lên Threads!' : p.error || 'Chưa đăng được', p.status === 'published' ? 'party' : 'err');
    } catch (e) { toast(e.message, 'err'); }
  },
  'ob-edit': (el) => {
    const p = C.outbox.find((x) => x.id === el.dataset.id);
    if (!p) return;
    C.editor = { parts: [...p.parts], image_url: p.image_url || '', when: p.scheduled_at ? 'later' : 'now', at: p.scheduled_at ? toLocalInput(new Date(p.scheduled_at)) : '', editingId: p.id, model: p.model };
    go('/compose');
  },
  'ob-unschedule': async (el) => {
    upsertOutbox(await api('/outbox/' + el.dataset.id, { method: 'PATCH', body: { scheduled_at: null } }));
    toast('Đã hủy hẹn giờ — bài chuyển về nháp');
  },
  'ob-delete': async (el) => {
    if (!(await confirmBox({ title: 'Xóa bài này khỏi hàng đợi?', text: 'Bài đã đăng trên Threads (nếu có) vẫn giữ nguyên.', ok: 'Xóa', danger: true, icon: 'trash' }))) return;
    await api('/outbox/' + el.dataset.id, { method: 'DELETE' });
    upsertOutbox({ id: el.dataset.id, removed: true });
  },
  'ai-check': async () => {
    const out = $('#ai-check-out');
    if (S.settingsDirty) return toast('Lưu cài đặt trước rồi kiểm tra', 'info');
    out.innerHTML = '<span class="spin"></span> Đang kiểm tra…';
    try {
      const r = await api('/ai/check', { method: 'POST' });
      out.innerHTML = r.map((m) => `<span class="status ${m.ok ? 'c-mint' : 'c-pink'}" title="${esc(m.ok ? m.id : m.error)}">${esc(m.label.replace('Claude ', ''))} ${m.ok ? '✓' : '✗'}</span>`).join('')
        + (r.every((m) => !m.ok) ? ` <span class="muted" style="font-size:12.5px;font-weight:700">${esc(r[0].error)}</span>` : '');
    } catch (e) {
      out.innerHTML = `<span class="status c-pink">${esc(e.message)}</span>`;
    }
  },
  'threads-check': async () => {
    const out = $('#threads-me');
    out.innerHTML = '<span class="spin"></span> Đang kiểm tra…';
    try {
      const r = await api('/threads/me');
      out.innerHTML = `<span class="status c-mint">Kết nối @${esc(r.username)}</span>${r.quota ? ` <span class="muted" style="font-size:12.5px;font-weight:700">Đã đăng ${r.quota.used}/${r.quota.total} bài trong 24 giờ</span>` : ''}`;
    } catch (e) {
      out.innerHTML = `<span class="status c-pink">${esc(e.message)}</span>`;
    }
  },
  'app-logout': async () => {
    await api('/auth/logout', { method: 'POST' });
    location.href = '/login.html';
  },
  'delete-sel': async () => {
    const n = S.lib.selected.size;
    if (!(await confirmBox({ title: `Xóa ${n} bài viết?`, text: 'Thao tác này không thể hoàn tác.', ok: 'Xóa', danger: true, icon: 'trash' }))) return;
    await api('/posts/delete', { method: 'POST', body: { ids: [...S.lib.selected] } });
    S.lib.selected.clear();
    toast(`Đã xóa ${n} bài viết`);
    loadPosts(true);
  },
  'delete-one': async (el) => {
    if (!(await confirmBox({ title: 'Xóa bài viết này?', text: 'Bài sẽ bị xóa khỏi kho dữ liệu.', ok: 'Xóa', danger: true, icon: 'trash' }))) return;
    await api('/posts/delete', { method: 'POST', body: { ids: [el.dataset.id] } });
    closeDrawer();
    toast('Đã xóa bài viết');
    if (S.route.id === 'library') loadPosts(true); else renderHome();
  },
  'lib-view': (el) => { S.lib.view = el.dataset.v; store.set('libView', S.lib.view); drawPostsShell(); },
  'toggle-filters': () => { S.lib.showFilters = !S.lib.showFilters; $('#filter-panel').classList.toggle('hide', !S.lib.showFilters); },
  'rm-filter': (el) => {
    const k = el.dataset.k;
    if (k === '*') { S.lib.f = { ...S.lib.f, q: '', username: '', media: '', replies: '', minLikes: '', from: '', to: '', source: '' }; }
    else S.lib.f[k] = '';
    if (location.hash.includes('?') && !location.hash.includes('tab=')) history.replaceState(null, '', '#/library');
    drawPostsShell();
  },
  'reload-lib': () => (S.lib.tab === 'posts' ? loadPosts(true) : loadProfiles()),
  menu: (el) => togglePop(el.nextElementSibling, el),
  export: (el) => {
    closePops();
    const kind = el.dataset.kind;
    const q = kind === 'posts' && S.route.id === 'library' ? qs(S.lib.f) : kind === 'profiles' ? qs({ q: S.lib.pq, sort: S.lib.psort }) : '';
    download(`/api/export/${kind}.${el.dataset.fmt}${q ? '?' + q : ''}`);
    toast('Đang tải file xuống…', 'info');
  },
  'filter-tag': (el) => setLibFilter({ q: '#' + el.dataset.v }),
  'filter-author': (el) => setLibFilter({ username: el.dataset.v, q: '' }),
  'scrape-replies': (el) => { closeDrawer(); startJob('post', { url: el.dataset.url, limit: 100 }); },
  'copy-text': (el) => copy(findPost(el.dataset.id).text || '', 'Đã chép nội dung'),
  'copy-json': (el) => copy(JSON.stringify(findPost(el.dataset.id), null, 2), 'Đã chép JSON'),
  rescrape: (el) => startJob('profile', { username: el.dataset.v, limit: S.draft.profile.limit || 50 }),
  'delete-profile': async (el) => {
    if (!(await confirmBox({ title: `Xóa hồ sơ @${el.dataset.v}?`, text: 'Chỉ xóa thông tin hồ sơ, bài viết vẫn được giữ.', ok: 'Xóa', danger: true, icon: 'trash' }))) return;
    await api('/profiles/delete', { method: 'POST', body: { usernames: [el.dataset.v] } });
    toast('Đã xóa hồ sơ');
    loadProfiles();
  },
  'close-drawer': closeDrawer,
  'notif-open': async (el) => {
    const n = S.notifs.find((x) => x.id === el.dataset.id);
    closePops();
    if (!n) return;
    if (!n.read) {
      n.read = true;
      drawBell();
      api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }).catch(() => {});
    }
    if (n.link) go(n.link.replace(/^#/, ''));
  },
  'notif-read-all': async () => {
    await api('/notifications/read', { method: 'POST', body: {} });
    S.notifs.forEach((n) => (n.read = true));
    drawBell();
    drawNotifPop();
  },
  'notif-clear': async () => {
    await api('/notifications', { method: 'DELETE' });
    S.notifs = [];
    drawBell();
    drawNotifPop();
  },
  'notif-browser': async () => {
    if (!('Notification' in window)) return toast('Trình duyệt không hỗ trợ thông báo', 'err');
    const r = await Notification.requestPermission();
    toast(r === 'granted' ? 'Đã bật thông báo trình duyệt' : 'Bạn chưa cho phép thông báo', r === 'granted' ? 'ok' : 'info');
    drawNotifPop();
  },
  'open-profile': (el) => openProfile(el.dataset.v),
  'follow-daily': async (el) => {
    const r = await createSchedule('profile', { username: el.dataset.v, limit: 30 }, 1440);
    if (r) openProfile(el.dataset.v);
  },
  repeat: (el) => {
    S.repeat = +el.dataset.v;
    store.set('repeat', S.repeat);
    $$('[data-act="repeat"]').forEach((b) => b.classList.toggle('on', b === el));
    $('#repeat-hint').textContent = repeatHint();
    $('#submit-btn').innerHTML = submitLabel();
  },
  'run-schedule': async (el) => {
    const r = await api(`/schedules/${el.dataset.id}/run`, { method: 'POST' });
    upsertJob(r.job);
    upsertSchedule(r.schedule);
    toast(r.skipped ? 'Lượt trước vẫn đang chạy' : `Đã chạy: ${r.schedule.label}`, r.skipped ? 'info' : 'party');
  },
  'delete-schedule': async (el) => {
    const x = S.schedules.find((y) => y.id === el.dataset.id);
    if (!(await confirmBox({ title: 'Xóa lịch này?', text: `Scrat sẽ ngừng tự cào ${esc(x ? x.label : '')}. Dữ liệu đã cào vẫn được giữ.`, ok: 'Xóa lịch', danger: true, icon: 'calendar' }))) return;
    await api('/schedules/' + el.dataset.id, { method: 'DELETE' });
    S.schedules = S.schedules.filter((y) => y.id !== el.dataset.id);
    drawSchedules();
    toast('Đã xóa lịch');
  },
  login: async () => {
    S.loginBusy = true;
    drawLogin();
    toast('Đăng nhập Threads trong cửa sổ vừa mở, Scrat sẽ tự nhận cookie', 'info');
    try {
      S.login = await api('/login', { method: 'POST' });
      toast('Đăng nhập thành công!', 'party');
      const st = await api('/settings');
      const ta = $('#view [data-s="cookies"]');
      if (ta) ta.value = st.cookies;
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      S.loginBusy = false;
      drawLogin();
    }
  },
  'login-cancel': async () => { await api('/login/cancel', { method: 'POST' }); },
  logout: async () => {
    if (!(await confirmBox({ title: 'Đăng xuất?', text: 'Cookie đăng nhập sẽ bị xóa khỏi Scrat.', ok: 'Đăng xuất', danger: true, icon: 'cookie', color: 'lemon' }))) return;
    S.login = await api('/login', { method: 'DELETE' });
    const ta = $('#view [data-s="cookies"]');
    if (ta) ta.value = '';
    drawLogin();
    toast('Đã đăng xuất');
  },

  theme: (el) => { applyTheme(el.dataset.v); $$('[data-act="theme"]').forEach((b) => b.classList.toggle('on', b === el)); },
  'save-settings': saveSettings,
  'reset-settings': () => { S.settingsDirty = false; renderSettings(); },
  demo: async () => {
    const r = await api('/demo', { method: 'POST' });
    toast(`Đã nạp ${r.posts} bài viết & ${r.profiles} hồ sơ mẫu`, 'party', { label: 'Xem kho', run: () => go('/library') });
    if (S.route.id === 'library') renderLibrary();
    if (S.route.id === 'home') renderHome();
  },
  'clear-all': async () => {
    const opts = [
      ['library', 'Bài viết & hồ sơ trong kho', true],
      ['jobs', 'Lịch sử tác vụ đã xong', true],
      ['schedules', 'Lịch cào tự động', false],
      ['outbox', 'Hàng đợi đăng bài (nháp, đã hẹn, đã đăng)', false],
      ['notifications', 'Thông báo', false],
    ];
    const text = `Chọn dữ liệu muốn xóa vĩnh viễn. Cài đặt và phiên đăng nhập được giữ nguyên.
      <span style="display:inline-flex;flex-direction:column;align-items:flex-start;gap:8px;margin-top:12px">${opts.map(([v, l, on]) => `<label class="row" style="gap:8px;font-weight:700;color:var(--ink)"><input type="checkbox" style="accent-color:var(--pink, #f43f5e)" name="clear-scope" value="${v}" ${on ? 'checked' : ''}/>${l}</label>`).join('')}</span>`;
    if (!(await confirmBox({ title: 'Xóa dữ liệu?', text, ok: 'Xóa', danger: true, icon: 'trash' }))) return;
    const scopes = [...document.querySelectorAll('#modal input[name="clear-scope"]:checked')].map((x) => x.value);
    if (!scopes.length) return toast('Chưa chọn mục nào để xóa', 'info');
    try {
      await api('/clear', { method: 'POST', body: { scopes } });
    } catch (e) {
      return toast(e.message, 'err');
    }
    await loadJobs();
    if (scopes.includes('schedules')) loadSchedules();
    if (scopes.includes('outbox') || scopes.includes('notifications')) location.reload();
    toast('Đã xóa dữ liệu đã chọn');
  },
};

document.addEventListener('click', (e) => {
  const goEl = e.target.closest('[data-go]');
  if (goEl) { go(goEl.dataset.go); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) {
    e.preventDefault();
    Promise.resolve(fn(el, e)).catch((err) => toast(err.message, 'err'));
  }
});

const CHANGES = {
  'toggle-schedule': async (el) => {
    try {
      upsertSchedule(await api('/schedules/' + el.dataset.id, { method: 'PATCH', body: { enabled: el.checked } }));
      toast(el.checked ? 'Đã bật lịch' : 'Đã tạm dừng lịch');
    } catch (e) { el.checked = !el.checked; toast(e.message, 'err'); }
  },
  'sched-every': async (el) => {
    try {
      upsertSchedule(await api('/schedules/' + el.dataset.id, { method: 'PATCH', body: { every: +el.value } }));
      toast(`Đã đổi chu kỳ: ${everyLabel(+el.value).toLowerCase()}`);
    } catch (e) { toast(e.message, 'err'); }
  },
};
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el);
});

document.addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    $('#palette').classList.contains('on') ? closePalette() : openPalette();
  } else if (e.key === 'Escape') {
    if ($$('.pop.on').length) closePops();
    else if ($('#palette').classList.contains('on')) closePalette();
    else if ($('#modal').classList.contains('on')) overlayClose && overlayClose();
    else if ($('#drawer').classList.contains('on')) closeDrawer();
    else if (S.lib.selected.size && S.route.id === 'library') ACTIONS['clear-sel']();
  } else if (e.key === '/' && !typing && S.route.id === 'library') {
    e.preventDefault();
    const q = $('#lib-q');
    if (q) q.focus();
  } else if (e.key === 'Enter' && !typing && document.activeElement.matches('.post')) {
    openPost(document.activeElement.dataset.id);
  }
});

$('#cmd-btn').onclick = openPalette;
$('#live-pill').onclick = () => go('/jobs');
$('#theme-btn').onclick = () => applyTheme(isDark() ? 'light' : 'dark');
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawThemeBtn);
window.addEventListener('scroll', () => $('#topbar').classList.toggle('scrolled', scrollY > 4), { passive: true });
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (e) => { if (S.settingsDirty) e.preventDefault(); });

export { ACTIONS, CHANGES };
