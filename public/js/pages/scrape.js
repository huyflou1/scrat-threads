/* Scrat Thread by HuyFlou — Trang: Cào dữ liệu. */
import { MODES, REPEATS, everyLabel } from '../config.js';
import { S, store } from '../state.js';
import { $, $$, api, detect, empty, esc, parsePostUrl, parseUsername, tile } from '../utils.js';
import { toast } from '../ui.js';
import { go } from '../shell.js';
import { jobCard, upsertJob, upsertSchedule } from '../pages/jobs.js';

/* =====================================================
   Trang: Cào dữ liệu
   ===================================================== */
function renderScrape() {
  if (S.route.query.mode && MODES[S.route.query.mode]) S.mode = S.route.query.mode;
  const m = S.mode;
  const d = S.draft[m];
  const limitMax = m === 'batch' ? 300 : 1000;

  let fields = '';
  if (m === 'profile') {
    fields = `<div class="field"><label for="f-main">Tài khoản Threads</label>
      <div class="input-ic">${ic('user')}<input class="input" id="f-main" data-draft="username" placeholder="@username hoặc link hồ sơ" value="${esc(d.username)}" autocomplete="off" /></div>
      <span class="hint">Lấy tiểu sử, số người theo dõi, liên kết và bài viết mới nhất.</span></div>`;
  } else if (m === 'post') {
    fields = `<div class="field"><label for="f-main">Link bài viết</label>
      <div class="input-ic">${ic('link')}<input class="input" id="f-main" data-draft="url" placeholder="https://www.threads.com/@user/post/ABC123" value="${esc(d.url)}" autocomplete="off" /></div>
      <span class="hint">Lấy bài gốc và các trả lời bên dưới (bật/tắt trong Cài đặt).</span></div>`;
  } else if (m === 'search') {
    fields = `<div class="field"><label for="f-main">Từ khóa hoặc hashtag</label>
      <div class="input-ic">${ic('search')}<input class="input" id="f-main" data-draft="query" placeholder="vd: cà phê, #javascript" value="${esc(d.query)}" autocomplete="off" /></div></div>
      <div class="field"><span class="label">Sắp xếp kết quả</span>
        <div class="seg" role="radiogroup">
          <button type="button" class="${d.mode !== 'recent' ? 'on' : ''}" data-act="draft-set" data-k="mode" data-v="top">${ic('party', 'sm')}Phổ biến</button>
          <button type="button" class="${d.mode === 'recent' ? 'on' : ''}" data-act="draft-set" data-k="mode" data-v="recent">${ic('timer', 'sm')}Mới nhất</button>
        </div></div>
      <div class="callout c-lemon">${ic('cookie')}<div><b>Cần đăng nhập.</b> Threads chỉ cho tìm kiếm khi có phiên đăng nhập — dán cookie trong <a href="#/settings" style="text-decoration:underline">Cài đặt</a>.</div></div>`;
  } else {
    fields = `<div class="field"><label for="f-main">Danh sách (mỗi dòng một mục)</label>
      <textarea class="textarea" id="f-main" data-draft="items" placeholder="@user1&#10;https://www.threads.com/@user2&#10;https://www.threads.com/@user3/post/ABC123">${esc(d.items)}</textarea>
      <span class="hint">Trộn lẫn tài khoản và link bài viết đều được. Tối đa 200 mục.</span></div>
      <div id="batch-detect"></div>`;
  }

  $('#view').innerHTML = `
    <div class="modes" role="tablist">
      ${Object.entries(MODES).map(([k, x]) => `
        <button class="mode c-${x.color} ${k === m ? 'on' : ''}" role="tab" aria-selected="${k === m}" data-act="mode" data-mode="${k}">
          <span class="tick">${ic('check')}</span>${tile(x.icon, x.color, 'lg')}<div><b>${x.label}</b><br><span>${x.desc}</span></div>
        </button>`).join('')}
    </div>
    <div class="bento">
      <form class="block span-7 stack" id="scrape-form">
        <div class="block-head" style="margin:0">${tile(MODES[m].icon, MODES[m].color)}<div><h2>Cào theo ${MODES[m].label.toLowerCase()}</h2><p>${MODES[m].desc}</p></div></div>
        ${fields}
        <div class="field">
          <label for="f-limit">${m === 'batch' ? 'Số bài tối đa mỗi mục' : m === 'post' ? 'Số trả lời tối đa' : 'Số bài viết tối đa'}: <span class="limit-val" id="limit-val">${d.limit}</span></label>
          <input type="range" id="f-limit" min="5" max="${limitMax}" step="5" value="${d.limit}" />
          <div class="presets">${[20, 50, 100, 200, 500].filter((n) => n <= limitMax).map((n) => `<button type="button" class="chip ${+d.limit === n ? 'on' : ''}" data-act="limit" data-v="${n}">${n}</button>`).join('')}</div>
        </div>
        <div class="field">
          <span class="label">Lặp lại</span>
          <div class="seg" role="radiogroup">${REPEATS.map(([v, l]) => `<button type="button" class="${S.repeat === v ? 'on' : ''}" data-act="repeat" data-v="${v}">${v ? ic('refresh', 'sm') : ''}${l}</button>`).join('')}</div>
          <span class="hint" id="repeat-hint">${repeatHint()}</span>
        </div>
        <div class="row" style="margin-top:4px">
          <button class="btn primary lg" type="submit" id="submit-btn">${submitLabel()}</button>
          <span class="muted" style="font-size:13px;font-weight:700">Nhấn <kbd>Ctrl</kbd> <kbd>Enter</kbd> để chạy nhanh</span>
        </div>
      </form>

      <div class="span-5 stack">
        <section class="block">
          <div class="block-head">${tile('timer', 'peach', 'sm')}<div><h3>Tác vụ vừa tạo</h3><p>Cập nhật trực tiếp</p></div>
            <div class="act"><a class="btn sm ghost" href="#/jobs">Tất cả ${ic('chevron', 'sm')}</a></div></div>
          <div class="jobs" id="scrape-jobs"></div>
        </section>
        <section class="block">
          <div class="block-head">${tile('info', 'sky', 'sm')}<div><h3>Cách hoạt động</h3></div></div>
          <ol class="steps">
            <li><span>Scrat mở trình duyệt ẩn (Chromium) và truy cập Threads như người dùng thật.</span></li>
            <li><span>Dữ liệu được đọc từ JSON ẩn của trang và các phản hồi khi cuộn — không cần API key.</span></li>
            <li><span>Kết quả lưu ngay vào <a href="#/library" style="text-decoration:underline">Kho dữ liệu</a>, xuất CSV/JSON bất cứ lúc nào.</span></li>
          </ol>
        </section>
      </div>
    </div>`;

  drawScrapeJobs();

  const main = $('#f-main');
  main.oninput = () => {
    S.draft[m][main.dataset.draft] = main.value;
    store.set('draft', S.draft);
    if (m === 'batch') drawBatchDetect();
  };
  main.onkeydown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#scrape-form').requestSubmit(); }
  };
  if (m === 'batch') drawBatchDetect();
  // Tự nhận diện khi dán sai chế độ
  main.onpaste = () => setTimeout(() => {
    if (m === 'batch') return;
    const det = detect(main.value);
    if (det && det.type !== m && det.type !== 'search') {
      toast(`Có vẻ đây là ${MODES[det.type].label.toLowerCase()} — chuyển chế độ giúp bạn`, 'info');
      S.draft[det.type] = { ...S.draft[det.type], ...det.body };
      main.value = S.draft[m][main.dataset.draft] = '';
      setMode(det.type);
    }
  }, 0);

  const lim = $('#f-limit');
  lim.oninput = () => setLimit(lim.value, false);

  $('#scrape-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = { ...S.draft[m] };
    const ok = S.repeat ? await createSchedule(m, body, S.repeat) : await startJob(m, body, { stay: true });
    if (ok) {
      S.draft[m][main.dataset.draft] = '';
      store.set('draft', S.draft);
      main.value = '';
      if (m === 'batch') drawBatchDetect();
    }
  };
  if (!matchMedia('(max-width: 640px)').matches) main.focus();
}

function repeatHint() {
  return S.repeat
    ? `Chạy ngay bây giờ, sau đó tự chạy lại ${everyLabel(S.repeat).toLowerCase()} khi app đang mở. Quản lý ở Tác vụ → Lịch tự động.`
    : 'Chạy một lần duy nhất.';
}
const submitLabel = () => (S.repeat ? `${ic('refresh')}Tạo lịch & chạy ngay` : `${ic('play')}Bắt đầu cào`);

async function createSchedule(type, body, every) {
  try {
    const r = await api('/schedules', { method: 'POST', body: { type, ...body, every } });
    upsertJob(r.job);
    upsertSchedule(r.schedule);
    toast(`Đã tạo lịch ${everyLabel(every).toLowerCase()}: ${r.schedule.label}`, 'party', { label: 'Xem lịch', run: () => go('/jobs?tab=schedules') });
    return r;
  } catch (e) {
    toast(e.message, 'err');
    return null;
  }
}

function setLimit(v, redraw = true) {
  S.draft[S.mode].limit = +v;
  store.set('draft', S.draft);
  $('#limit-val').textContent = v;
  $$('.presets .chip').forEach((c) => c.classList.toggle('on', +c.dataset.v === +v));
  if (redraw) $('#f-limit').value = v;
}

function setMode(mode) {
  S.mode = mode;
  store.set('mode', mode);
  if (S.route.query.mode) history.replaceState(null, '', '#/scrape');
  S.route.query = {};
  renderScrape();
}

function drawBatchDetect() {
  const el = $('#batch-detect');
  if (!el) return;
  const lines = S.draft.batch.items.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) { el.innerHTML = ''; return; }
  let p = 0, u = 0, bad = 0;
  const rows = lines.map((l) => {
    const post = parsePostUrl(l);
    const user = !post && parseUsername(l);
    if (post) { p++; return `<div class="detect-item">${ic('chat', 'sm')}Bài viết ${esc(post.code)} · @${esc(post.username)}</div>`; }
    if (user) { u++; return `<div class="detect-item">${ic('user', 'sm')}@${esc(user)}</div>`; }
    bad++;
    return `<div class="detect-item bad">${ic('warn', 'sm')}${esc(l)} — không hợp lệ</div>`;
  });
  el.innerHTML = `<div class="row" style="margin-bottom:8px">
      <span class="metric c-grape">${ic('user')}${u} hồ sơ</span>
      <span class="metric c-sky">${ic('chat')}${p} bài viết</span>
      ${bad ? `<span class="metric c-pink">${ic('warn')}${bad} lỗi</span>` : ''}
    </div><div class="detect">${rows.slice(0, 50).join('')}${rows.length > 50 ? `<div class="muted" style="font-size:12px">…và ${rows.length - 50} mục nữa</div>` : ''}</div>`;
}

function drawScrapeJobs() {
  const el = $('#scrape-jobs');
  if (!el) return;
  const list = S.jobs.slice(0, 3);
  el.innerHTML = list.length ? list.map((j) => jobCard(j, true)).join('') : empty('Chưa có tác vụ', 'Tác vụ bạn tạo sẽ hiện ở đây kèm tiến độ.', '', true);
}

async function startJob(type, body, { stay = false } = {}) {
  try {
    const job = await api('/jobs', { method: 'POST', body: { type, ...body } });
    upsertJob(job);
    toast(`Đã xếp hàng: ${job.label}`, 'party', stay ? { label: 'Xem tiến độ', run: () => go('/jobs') } : { label: 'Xem', run: () => go('/jobs') });
    return job;
  } catch (e) {
    toast(e.message, 'err');
    return null;
  }
}

export { renderScrape, repeatHint, submitLabel, createSchedule, setLimit, setMode, drawBatchDetect, drawScrapeJobs, startJob };
