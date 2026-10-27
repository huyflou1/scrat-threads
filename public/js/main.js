/* Scrat Thread by HuyFlou — Sự kiện thời gian thực & khởi động. */
import { PAGE_SIZE } from './config.js';
import { S } from './state.js';
import { $, debounce } from './utils.js';
import { toast } from './ui.js';
import { route } from './shell.js';
import { renderHome } from './pages/home.js';
import { drawScrapeJobs, renderScrape } from './pages/scrape.js';
import { drawJobs, loadJobs, renderJobs, upsertJob, upsertSchedule } from './pages/jobs.js';
import { drawPosts, loadPosts, loadProfiles, renderLibrary } from './pages/library.js';
import { C, renderCompose, upsertOutbox } from './pages/compose.js';
import { renderSettings } from './pages/settings.js';
import { drawThemeBtn } from './theme.js';
import { drawBell, drawNotifPop, loadNotifs } from './notifs.js';
import { ACTIONS } from './actions.js';

/* =====================================================
   Sự kiện thời gian thực
   ===================================================== */
const refreshOnData = debounce(() => {
  const id = S.route.id;
  if (id === 'home') renderHome();
  else if (id === 'library') {
    const L = S.lib;
    const pristine = !L.selected.size && L.items.length <= PAGE_SIZE && scrollY < 200 && !$('#drawer').classList.contains('on');
    if (L.tab === 'profiles') loadProfiles();
    else if (pristine) loadPosts(true);
    else { L.stale = true; drawPosts(); }
  }
}, 600);

function connectEvents() {
  const es = new EventSource('/api/events');
  es.addEventListener('job', (e) => {
    const j = JSON.parse(e.data);
    const prev = S.jobs.find((x) => x.id === j.id);
    upsertJob(j);
    const sch = j.schedule_id && S.schedules.find((x) => x.id === j.schedule_id);
    if (sch && sch.last_job_id === j.id) upsertSchedule({ ...sch, last_status: j.status, last_posts: j.stats.posts });
    if (prev && prev.status === 'running' && j.status !== 'running') {
      if (j.status === 'done') toast(`Xong “${j.label}”: ${j.stats.posts} bài viết`, 'party', { label: 'Xem dữ liệu', run: () => ACTIONS['job-data']({ dataset: { id: j.id } }) });
      else if (j.status === 'failed') toast(`“${j.label}” lỗi: ${j.error}`, 'err');
    }
  });
  es.addEventListener('data', refreshOnData);
  es.addEventListener('schedule', (e) => upsertSchedule(JSON.parse(e.data)));
  es.addEventListener('outbox', (e) => upsertOutbox(JSON.parse(e.data)));
  es.addEventListener('notify', (e) => {
    const n = JSON.parse(e.data);
    S.notifs.unshift(n);
    drawBell();
    if ($('#notif-pop').classList.contains('on')) drawNotifPop();
    // Bài vừa đăng tay đã có thông báo riêng; chuông vẫn lưu lại
    if ((n.kind === 'posted' || n.kind === 'error') && n.link === '#/compose?tab=queue' && C.manual > 0) return;
    toast(n.title, n.kind === 'error' ? 'err' : 'party', n.link ? { label: 'Xem', run: () => ACTIONS['notif-open']({ dataset: { id: n.id } }) } : null);
    // Báo ra hệ điều hành khi đang ở tab khác
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      const sys = new Notification(n.title, { body: n.body || '', tag: n.id });
      sys.onclick = () => { window.focus(); ACTIONS['notif-open']({ dataset: { id: n.id } }); };
    }
  });
  es.onopen = () => { if (S.jobsLoaded) loadJobs().then(() => S.route.id === 'jobs' && drawJobs()); };
}

const PAGE_RENDER = { home: renderHome, scrape: renderScrape, compose: renderCompose, jobs: renderJobs, library: renderLibrary, settings: renderSettings };

/* ---------- Khởi động ---------- */
drawThemeBtn();
loadNotifs();
loadJobs().then(() => { if (S.route.id === 'scrape') drawScrapeJobs(); });
route();
connectEvents();

export { refreshOnData, connectEvents, PAGE_RENDER };
