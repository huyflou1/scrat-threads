/* Scrat Thread by HuyFlou — Trang: Tác vụ. */
import { MODES, REPEATS, STATUS, everyLabel } from '../config.js';
import { S } from '../state.js';
import { $, ago, api, empty, esc, num, tile } from '../utils.js';
import { toast } from '../ui.js';
import { renderNav } from '../shell.js';
import { homeJobs } from '../pages/home.js';
import { drawScrapeJobs } from '../pages/scrape.js';

/* =====================================================
   Trang: Tác vụ
   ===================================================== */
async function renderJobs() {
  S.jobTab = S.route.query.tab === 'schedules' ? 'schedules' : 'queue';
  if (S.jobTab === 'schedules') {
    await loadSchedules();
    if (S.route.id === 'jobs') drawSchedules();
    return;
  }
  if (!S.jobsLoaded) await loadJobs();
  drawJobs();
}

function jobTabs() {
  const on = S.schedules.filter((x) => x.enabled).length;
  return `<div class="toolbar"><div class="seg">
    <button class="${S.jobTab === 'queue' ? 'on' : ''}" data-go="/jobs">${ic('timer', 'sm')}Hàng đợi</button>
    <button class="${S.jobTab === 'schedules' ? 'on' : ''}" data-go="/jobs?tab=schedules">${ic('calendar', 'sm')}Lịch tự động${on ? `<span class="n">${on}</span>` : ''}</button>
  </div></div>`;
}

async function loadSchedules() {
  try { S.schedules = await api('/schedules'); } catch (e) { toast(e.message, 'err'); }
}

function drawSchedules() {
  $('#view').innerHTML = `${jobTabs()}
    <div class="toolbar">
      <span class="muted" style="font-weight:700;font-size:13px">${ic('info', 'sm')} Lịch chỉ chạy khi ứng dụng đang mở. Lượt trước chưa xong thì lượt mới được bỏ qua.</span>
      <div style="flex:1"></div>
      <a class="btn soft" href="#/scrape">${ic('plus')}Lịch mới</a>
    </div>
    <div class="jobs" id="sched-list">${S.schedules.length ? S.schedules.map(scheduleCard).join('')
      : `<div class="block">${empty('Chưa có lịch nào', 'Ở trang Cào dữ liệu, chọn “Lặp lại” (vd: Hằng ngày) để Scrat tự cào định kỳ — rất hợp để theo dõi người theo dõi tăng giảm.', `<a class="btn primary" href="#/scrape">${ic('calendar')}Tạo lịch</a>`)}</div>`}</div>`;
}

function scheduleCard(x) {
  const m = MODES[x.type];
  const st = x.last_status && STATUS[x.last_status];
  return `<article class="block job ${x.enabled ? '' : 'paused'}" id="sch-${x.id}">
    <div class="job-top">
      ${tile(m.icon, m.color)}
      <div class="job-title"><b>${esc(x.label)}</b><span>${m.label} · ${everyLabel(x.every)} · đã chạy ${num(x.runs)} lần</span></div>
      <label class="switch" title="${x.enabled ? 'Đang bật' : 'Đang tắt'}"><input type="checkbox" data-change="toggle-schedule" data-id="${x.id}" ${x.enabled ? 'checked' : ''} aria-label="Bật/tắt lịch"/><span></span></label>
    </div>
    <div class="job-meta">
      <span>${ic('calendar')}${x.enabled ? `Lượt tới: ${ago(x.next_run)}` : 'Đang tạm dừng'}</span>
      <span>${ic('timer')}Lần cuối: ${ago(x.last_run)}</span>
      ${st ? `<span class="status c-${st.color} ${x.last_status}">${st.label}${x.last_posts != null ? ` · ${num(x.last_posts)} bài` : ''}</span>` : ''}
      <span style="flex:1"></span>
      <span class="job-acts">
        <select class="select" style="width:auto;padding:5px 32px 5px 10px;font-size:13px" data-change="sched-every" data-id="${x.id}" aria-label="Chu kỳ">
          ${REPEATS.filter(([v]) => v).map(([v, l]) => `<option value="${v}" ${x.every === v ? 'selected' : ''}>${l}</option>`).join('')}
          ${REPEATS.some(([v]) => v === x.every) ? '' : `<option selected value="${x.every}">${everyLabel(x.every)}</option>`}
        </select>
        <button class="btn sm soft" data-act="run-schedule" data-id="${x.id}">${ic('play', 'sm')}Chạy ngay</button>
        <button class="btn sm ghost icon danger" data-act="delete-schedule" data-id="${x.id}" aria-label="Xóa lịch">${ic('trash', 'sm')}</button>
      </span>
    </div>
    ${x.error ? `<div class="callout c-pink" style="margin-top:12px">${ic('warn')}<div>Lịch đã tự tắt: ${esc(x.error)}</div></div>` : ''}
  </article>`;
}

function upsertSchedule(x) {
  const i = S.schedules.findIndex((y) => y.id === x.id);
  if (i >= 0) S.schedules[i] = { ...S.schedules[i], ...x };
  else S.schedules.unshift(x);
  if (S.route.id === 'jobs' && S.jobTab === 'schedules') {
    const el = $('#sch-' + x.id);
    if (el) el.outerHTML = scheduleCard(S.schedules.find((y) => y.id === x.id));
    else drawSchedules();
  }
}

function drawJobs() {
  const counts = { all: S.jobs.length };
  for (const j of S.jobs) {
    const k = j.status === 'queued' ? 'running' : j.status === 'cancelled' ? 'failed' : j.status;
    counts[k] = (counts[k] || 0) + 1;
  }
  const filters = [['all', 'Tất cả'], ['running', 'Đang chạy'], ['done', 'Hoàn tất'], ['failed', 'Lỗi / hủy']];
  const list = S.jobs.filter((j) => {
    if (S.jobFilter === 'all') return true;
    if (S.jobFilter === 'running') return j.status === 'running' || j.status === 'queued';
    if (S.jobFilter === 'failed') return j.status === 'failed' || j.status === 'cancelled';
    return j.status === S.jobFilter;
  });
  $('#view').innerHTML = `${jobTabs()}
    <div class="toolbar">
      <div class="seg">${filters.map(([k, l]) => `<button class="${S.jobFilter === k ? 'on' : ''}" data-act="job-filter" data-v="${k}">${l}<span class="n">${counts[k] || 0}</span></button>`).join('')}</div>
      <div class="spacer" style="flex:1"></div>
      <a class="btn soft" href="#/scrape">${ic('plus')}Tác vụ mới</a>
      <button class="btn ghost" data-act="clear-jobs" ${S.jobs.some((j) => !['running', 'queued'].includes(j.status)) ? '' : 'disabled'}>${ic('trash')}Dọn lịch sử</button>
    </div>
    <div class="jobs" id="job-list">${list.length ? list.map((j) => jobCard(j)).join('') : `<div class="block">${empty('Không có tác vụ nào', 'Tạo một tác vụ cào mới để bắt đầu thu thập dữ liệu.', '<a class="btn primary" href="#/scrape">' + ic('wand') + 'Cào dữ liệu</a>')}</div>`}</div>`;
}

function jobCard(j, mini = false) {
  const m = MODES[j.type];
  const s = STATUS[j.status];
  const pct = j.progress.total ? Math.min(100, Math.round((j.progress.current / j.progress.total) * 100)) : 0;
  const active = j.status === 'running' || j.status === 'queued';
  const open = S.openLogs.has(j.id);
  const lastLog = j.logs[j.logs.length - 1];
  return `<article class="block job ${j.status}" id="job-${j.id}">
    <div class="job-top">
      ${tile(m.icon, m.color)}
      <div class="job-title"><b>${esc(j.label)}</b><span>${m.label} · ${ago(j.created_at)}</span></div>
      <span class="status c-${s.color} ${j.status}">${s.label}</span>
    </div>
    <div class="progress c-${s.color}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${j.status === 'done' ? 100 : pct}%"></i></div>
    <div class="job-meta">
      <span>${ic('chat')}${num(j.stats.posts)} bài</span>
      ${j.stats.new_posts ? `<span>${ic('plus')}${num(j.stats.new_posts)} mới</span>` : ''}
      ${j.stats.profiles ? `<span>${ic('user')}${num(j.stats.profiles)} hồ sơ</span>` : ''}
      <span>${ic('gauge')}${j.progress.current}/${j.progress.total}</span>
      ${!mini && j.finished_at && j.started_at ? `<span>${ic('timer')}${Math.max(1, Math.round((Date.parse(j.finished_at) - Date.parse(j.started_at)) / 1000))} giây</span>` : ''}
      <span style="flex:1"></span>
      <span class="job-acts">
        ${active ? `<button class="btn sm danger" data-act="cancel-job" data-id="${j.id}">${ic('stop', 'sm')}Dừng</button>` : ''}
        ${!active && j.stats.posts ? `<button class="btn sm soft" data-act="job-data" data-id="${j.id}">${ic('box', 'sm')}Xem dữ liệu</button>` : ''}
        ${!active && !mini ? `<button class="btn sm" data-act="retry-job" data-id="${j.id}">${ic('refresh', 'sm')}Chạy lại</button>` : ''}
        ${!mini ? `<button class="btn sm ghost icon" data-act="toggle-logs" data-id="${j.id}" aria-label="Nhật ký" aria-expanded="${open}">${ic(open ? 'down' : 'chevron', 'sm')}</button>` : ''}
      </span>
    </div>
    ${mini && lastLog ? `<div class="muted" style="font-size:12.5px;margin-top:8px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(lastLog.msg)}</div>` : ''}
    ${!mini && open ? `<div class="logs">${j.logs.map((l) => `<div class="${l.level}"><time>${new Date(l.t).toLocaleTimeString('vi-VN')}</time><span>${esc(l.msg)}</span></div>`).join('') || '<div class="muted">Chưa có nhật ký</div>'}</div>` : ''}
  </article>`;
}

async function loadJobs() {
  try {
    S.jobs = await api('/jobs');
    S.jobsLoaded = true;
    renderNav();
  } catch { /* bỏ qua */ }
}

function upsertJob(j) {
  const i = S.jobs.findIndex((x) => x.id === j.id);
  if (i >= 0) S.jobs[i] = j;
  else S.jobs.unshift(j);
  renderNav();
  // Vá DOM tại chỗ để không mất vị trí cuộn
  const id = S.route.id;
  if (id === 'jobs' && S.jobTab === 'queue') {
    const el = $('#job-' + j.id);
    if (el && $('#job-list')) {
      const logs = el.querySelector('.logs');
      const atBottom = logs && logs.scrollTop + logs.clientHeight >= logs.scrollHeight - 8;
      el.outerHTML = jobCard(j);
      const nl = $('#job-' + j.id + ' .logs');
      if (nl && atBottom) nl.scrollTop = nl.scrollHeight;
    } else drawJobs();
  } else if (id === 'scrape') drawScrapeJobs();
  else if (id === 'home' && $('#home-jobs')) $('#home-jobs').innerHTML = homeJobs(S.jobs.slice(0, 5));
}

export { renderJobs, jobTabs, loadSchedules, drawSchedules, scheduleCard, upsertSchedule, drawJobs, jobCard, loadJobs, upsertJob };
