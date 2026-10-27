/* Scrat Thread by HuyFlou — Trang: Đăng bài. */
import { S, store } from '../state.js';
import { $, $$, ago, api, debounce, empty, esc, fullDate, img, num, richText, safeUrl, tile } from '../utils.js';
import { confirmBox, toast } from '../ui.js';
import { go } from '../shell.js';
import { ACTIONS } from '../actions.js';

/* =====================================================
   Trang: Đăng bài (viết bằng AI + hẹn giờ đăng Threads)
   ===================================================== */
const TONE_OPTS = [['friendly', 'Thân thiện'], ['pro', 'Chuyên nghiệp'], ['funny', 'Hài hước'], ['inspire', 'Truyền cảm hứng'], ['sales', 'Bán hàng']];
const LEN_OPTS = [['short', 'Ngắn'], ['medium', 'Vừa'], ['thread', 'Chuỗi thread']];
const OUT_STATUS = {
  draft: { label: 'Nháp', color: 'slate' },
  scheduled: { label: 'Đã hẹn giờ', color: 'sky' },
  publishing: { label: 'Đang đăng', color: 'lemon' },
  published: { label: 'Đã đăng', color: 'mint' },
  failed: { label: 'Lỗi', color: 'pink' },
};
const POST_LIMIT = 500;

// Bản sao của threadsLength() ở src/threads-api.js: emoji tính theo số byte UTF-8
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[‍️⃣]|[\u{1F3FB}-\u{1F3FF}]/u;
const enc = new TextEncoder();
function tLen(text) {
  let n = 0;
  for (const ch of String(text || '')) n += EMOJI_RE.test(ch) ? enc.encode(ch).length : 1;
  return n;
}

const C = {
  tab: 'write',
  form: store.get('composeForm', { input: '', tone: 'friendly', length: 'medium', lang: 'vi', hashtags: true, emoji: true, model: 'auto', styleFrom: '' }),
  variants: [],
  meta: null,
  generating: false,
  editor: { parts: [''], image_url: '', when: 'now', at: '', editingId: null, model: null },
  outbox: [],
  models: [],
  hasKey: false,
  hasToken: false, // có cách đăng bài (token API hoặc phiên đăng nhập)
  postVia: null,
  profiles: [],
  pick: null,
  manual: 0, // số lần đăng tay đang chạy — để không hiện 2 thông báo trùng
};
const saveForm = () => store.set('composeForm', C.form);

async function renderCompose() {
  C.tab = S.route.query.tab === 'queue' ? 'queue' : 'write';
  try {
    const [m, ob, pr] = await Promise.all([api('/ai/models'), api('/outbox'), api('/profiles?sort=name')]);
    if (!S.stats) S.stats = await api('/stats?tz=' + new Date().getTimezoneOffset()).catch(() => null);
    C.models = m.models;
    C.hasKey = m.hasKey;
    C.postVia = m.postVia;
    C.hasToken = !!m.postVia;
    C.outbox = ob;
    C.profiles = pr.items;
  } catch (e) {
    toast(e.message, 'err');
  }
  if (S.route.id !== 'compose') return;
  drawCompose();
}

function composeTabs() {
  const waiting = C.outbox.filter((p) => p.status === 'scheduled').length;
  return `<div class="toolbar"><div class="seg">
    <button class="${C.tab === 'write' ? 'on' : ''}" data-go="/compose">${ic('sparkle', 'sm')}Soạn bài</button>
    <button class="${C.tab === 'queue' ? 'on' : ''}" data-go="/compose?tab=queue">${ic('calendar', 'sm')}Hàng đợi đăng${waiting ? `<span class="n">${waiting}</span>` : ''}</button>
  </div></div>`;
}

function drawCompose() {
  if (C.tab === 'queue') return drawQueue();
  const f = C.form;
  const modelCards = [{ id: 'auto', label: 'Tự động', tag: 'Chọn theo nội dung bạn nhập' }, ...C.models];
  const segBtns = (key, opts) => opts.map(([v, l]) => `<button type="button" class="${f[key] === v ? 'on' : ''}" data-act="cf-set" data-k="${key}" data-v="${v}">${l}</button>`).join('');
  $('#view').innerHTML = `${composeTabs()}
    <div class="bento">
      <section class="block span-7 stack" id="ai-block">
        <div class="block-head" style="margin:0">${tile('sparkle', 'lemon')}<div><h2>Viết bài với AI</h2><p>Nhập ý tưởng, Claude viết 3 phương án để bạn chọn</p></div></div>
        ${C.hasKey ? '' : `<div class="callout c-lemon">${ic('info')}<div><b>Chưa có API key của Anthropic.</b> Thêm trong <a href="#/settings" style="text-decoration:underline">Cài đặt → AI & Đăng bài</a>. Bạn vẫn có thể tự viết ở khung bên phải.</div></div>`}
        <div class="field">
          <label for="cf-input">Ý tưởng / nội dung gốc</label>
          <textarea class="textarea plain" id="cf-input" placeholder="vd: Khai trương quán cà phê muối ở Quận 3, giảm 20% tuần đầu, không gian có mèo…" style="min-height:130px">${esc(f.input)}</textarea>
          <span class="hint" id="cf-count">${num(f.input.length)} ký tự · dán cả bài báo, ghi chú hay dàn ý cũng được</span>
        </div>
        <div class="grid-2">
          <div class="field"><span class="label">Giọng văn</span><div class="seg">${segBtns('tone', TONE_OPTS)}</div></div>
          <div class="field"><span class="label">Độ dài</span><div class="seg">${segBtns('length', LEN_OPTS)}</div></div>
        </div>
        <div class="row">
          <div class="seg">${segBtns('lang', [['vi', 'Tiếng Việt'], ['en', 'English']])}</div>
          <label class="row" style="gap:8px;font-weight:800;font-size:13px"><span class="switch"><input type="checkbox" data-cf-bool="hashtags" ${f.hashtags ? 'checked' : ''}/><span></span></span>Hashtag</label>
          <label class="row" style="gap:8px;font-weight:800;font-size:13px"><span class="switch"><input type="checkbox" data-cf-bool="emoji" ${f.emoji ? 'checked' : ''}/><span></span></span>Emoji</label>
        </div>
        <div class="field">
          <label for="cf-style">Học giọng văn từ tài khoản trong kho <span class="muted">(không bắt buộc)</span></label>
          <select class="select" id="cf-style"><option value="">Không dùng</option>${C.profiles.map((u) => `<option value="${esc(u.username)}" ${f.styleFrom === u.username ? 'selected' : ''}>@${esc(u.username)} · ${num(u.post_count)} bài</option>`).join('')}</select>
        </div>
        <div class="field">
          <span class="label">Mô hình AI</span>
          <div class="model-grid">${modelCards.map((m) => `
            <button type="button" class="model-card ${f.model === m.id ? 'on' : ''}" data-act="cf-set" data-k="model" data-v="${m.id}">
              <b>${m.id === 'auto' ? ic('bolt', 'sm') : ''}${esc(m.label)}</b><span>${esc(m.tag)}</span>
            </button>`).join('')}</div>
          <span class="hint" id="cf-pick"></span>
        </div>
        <div class="row">
          <button class="btn primary lg" data-act="cf-generate" ${C.generating ? 'disabled' : ''}>${C.generating ? '<span class="spin"></span>Đang viết…' : `${ic('sparkle')}Tạo bài viết`}</button>
          <span class="muted" style="font-size:13px;font-weight:700"><kbd>Ctrl</kbd> <kbd>Enter</kbd></span>
        </div>
        <div id="cf-variants">${variantsHTML()}</div>
      </section>
      <section class="block span-5 stack editor-block" id="editor-block">${editorHTML()}</section>
    </div>`;

  const input = $('#cf-input');
  input.oninput = () => {
    f.input = input.value;
    saveForm();
    $('#cf-count').textContent = `${num(f.input.length)} ký tự · dán cả bài báo, ghi chú hay dàn ý cũng được`;
    updatePick();
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ACTIONS['cf-generate'](); }
  };
  $('#cf-style').onchange = (e) => { f.styleFrom = e.target.value; saveForm(); updatePick(); };
  $$('[data-cf-bool]').forEach((el) => { el.onchange = () => { f[el.dataset.cfBool] = el.checked; saveForm(); }; });
  bindEditor();
  updatePick();
}

/** Gợi ý mô hình khi để "Tự động" — hỏi máy chủ để dùng chung một quy tắc. */
const updatePick = debounce(async () => {
  const el = $('#cf-pick');
  if (!el) return;
  const f = C.form;
  if (f.model !== 'auto') { el.textContent = ''; return; }
  if (!f.input.trim()) { el.innerHTML = `${ic('info', 'sm')} Nhập nội dung để Scrat chọn mô hình phù hợp`; return; }
  try {
    const p = await api('/ai/pick', { method: 'POST', body: { input: f.input, length: f.length, styleFrom: f.styleFrom } });
    if ($('#cf-pick')) $('#cf-pick').innerHTML = `${ic('bolt', 'sm')} Sẽ dùng ${esc(p.reason)}`;
  } catch { /* bỏ qua */ }
}, 250);

function variantsHTML() {
  if (!C.variants.length) return '';
  const m = C.meta;
  const name = (C.models.find((x) => x.id === m.model) || {}).label || m.model;
  const fell = m.model !== m.requested;
  return `<div class="block-head" style="margin:6px 0 10px">${tile('party', 'grape', 'sm')}<div><h3>3 phương án</h3>
      <p>Viết bởi ${esc(name)}${fell ? ' (mô hình dự phòng)' : ''}${m.reason ? ` · ${esc(m.reason)}` : ''}</p></div></div>
    <div class="variants">${C.variants.map((v, i) => `
      <article class="variant">
        <div class="row" style="justify-content:space-between"><span class="metric c-grape">${esc(v.angle || `Phương án ${i + 1}`)}</span>
          ${v.parts.length > 1 ? `<span class="muted" style="font-size:12px;font-weight:800">${v.parts.length} phần</span>` : ''}</div>
        ${v.parts.map((p, j) => `<p class="variant-part">${v.parts.length > 1 ? `<b>${j + 1}/${v.parts.length}</b> ` : ''}${richText(p)}
          ${tLen(p) > POST_LIMIT ? `<span class="over">${tLen(p)}/${POST_LIMIT}</span>` : ''}</p>`).join('')}
        <button class="btn sm soft" data-act="cf-use" data-i="${i}">${ic('check', 'sm')}Dùng bản này</button>
      </article>`).join('')}</div>`;
}

/** Lần kế tiếp của khung giờ vàng (ngày d: 0 = Thứ Hai, khung b: 3 giờ). */
function nextGolden() {
  const best = S.stats && S.stats.best;
  if (!best) return null;
  const t = new Date();
  t.setSeconds(0, 0);
  for (let i = 0; i < 8; i++) {
    const day = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i, best.b * 3 + 1, 0);
    if ((day.getDay() + 6) % 7 === best.d && day > t) return day;
  }
  return null;
}

const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function editorHTML() {
  const e = C.editor;
  const total = e.parts.length;
  const golden = nextGolden();
  const quick = [
    ['1h', 'Sau 1 giờ', new Date(Date.now() + 3600e3)],
    ['tonight', 'Tối nay 20:00', (() => { const d = new Date(); d.setHours(20, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d; })()],
    ['morning', 'Sáng mai 8:00', (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d; })()],
    ...(golden ? [['golden', `⭐ Giờ vàng (${golden.toLocaleDateString('vi-VN', { weekday: 'short' })} ${golden.getHours()}:00)`, golden]] : []),
  ];
  return `
    <div class="block-head" style="margin:0">${tile('send', 'mint')}<div><h2>${e.editingId ? 'Sửa bài' : 'Bản đăng'}</h2><p>${total > 1 ? `Chuỗi ${total} phần — mỗi phần trả lời phần trước` : 'Tối đa 500 ký tự mỗi phần (emoji tính theo byte)'}</p></div>
      ${e.editingId ? `<div class="act"><button class="btn sm ghost" data-act="ed-new">${ic('plus', 'sm')}Bài mới</button></div>` : ''}</div>
    ${C.hasToken
      ? `<div class="muted" style="font-size:12.5px;font-weight:750">${ic(C.postVia === 'api' ? 'shield' : 'globe', 'sm')} Đăng bằng ${C.postVia === 'api' ? 'Threads API (token)' : 'phiên đăng nhập Threads của bạn'} · đổi trong Cài đặt</div>`
      : `<div class="callout c-lemon">${ic('info')}<div><b>Chưa kết nối tài khoản Threads.</b> Đăng nhập Threads trong Cài đặt là đăng được ngay (dùng chung phiên với việc cào), hoặc nhập Threads access token.
      <div style="margin-top:8px"><button class="btn sm soft" data-act="go-token">${ic('sliders', 'sm')}Mở Cài đặt</button></div></div></div>`}
    <div class="stack" id="ed-parts">${e.parts.map((p, i) => `
      <div class="field part">
        <div class="row" style="justify-content:space-between">
          <label for="ed-p${i}">${total > 1 ? `Phần ${i + 1}` : 'Nội dung'}</label>
          <span class="row" style="gap:6px"><span class="counter ${tLen(p) > POST_LIMIT ? 'over' : ''}" id="ed-c${i}">${tLen(p)}/${POST_LIMIT}</span>
          ${total > 1 ? `<button class="btn sm ghost icon" data-act="ed-del" data-i="${i}" aria-label="Xóa phần ${i + 1}">${ic('x', 'sm')}</button>` : ''}</span>
        </div>
        <textarea class="textarea plain" id="ed-p${i}" data-part="${i}" placeholder="Viết gì đó thật hay…">${esc(p)}</textarea>
      </div>`).join('')}</div>
    <button class="btn sm ghost" data-act="ed-add" style="align-self:flex-start">${ic('plus', 'sm')}Thêm phần (chuỗi thread)</button>
    <div class="field">
      <label for="ed-img">Ảnh đính kèm phần đầu <span class="muted">(không bắt buộc)</span></label>
      <div class="input-ic">${ic('image')}<input class="input" id="ed-img" placeholder="https://… (link ảnh công khai, JPEG/PNG)" value="${esc(e.image_url)}" /></div>
      <span class="hint">Link phải mở được công khai (https), vì ảnh được tải từ link này.</span>
    </div>
    <div class="field">
      <span class="label">Thời điểm đăng</span>
      <div class="seg"><button type="button" class="${e.when === 'now' ? 'on' : ''}" data-act="ed-when" data-v="now">${ic('send', 'sm')}Đăng ngay</button><button type="button" class="${e.when === 'later' ? 'on' : ''}" data-act="ed-when" data-v="later">${ic('calendar', 'sm')}Hẹn giờ</button></div>
      <div class="${e.when === 'later' ? '' : 'hide'} stack" style="gap:8px;margin-top:6px">
        <input class="input" type="datetime-local" id="ed-at" value="${esc(e.at)}" min="${toLocalInput(new Date())}" />
        <div class="chips">${quick.map(([k, l, d]) => `<button type="button" class="chip" data-act="ed-quick" data-at="${toLocalInput(d)}">${esc(l)}</button>`).join('')}</div>
      </div>
    </div>
    <div class="row">
      <button class="btn primary lg" data-act="ed-submit">${e.when === 'later' ? `${ic('calendar')}Hẹn giờ đăng` : `${ic('send')}Đăng lên Threads`}</button>
      <button class="btn" data-act="ed-draft">${ic('box')}Lưu nháp</button>
    </div>`;
}

function drawEditor() {
  const el = $('#editor-block');
  if (!el) return;
  el.innerHTML = editorHTML();
  bindEditor();
}

function bindEditor() {
  const e = C.editor;
  $$('[data-part]').forEach((ta) => {
    ta.oninput = () => {
      const i = +ta.dataset.part;
      e.parts[i] = ta.value;
      const n = tLen(ta.value);
      const c = $('#ed-c' + i);
      c.textContent = `${n}/${POST_LIMIT}`;
      c.classList.toggle('over', n > POST_LIMIT);
    };
  });
  const img = $('#ed-img');
  if (img) img.oninput = () => { e.image_url = img.value.trim(); };
  const at = $('#ed-at');
  if (at) at.oninput = () => { e.at = at.value; };
}

/** Chưa có token Threads: kiểm tra lại, rồi đưa người dùng tới ô nhập token. Trả về true nếu đã có. */
async function needToken() {
  try { C.postVia = (await api('/ai/models')).postVia; C.hasToken = !!C.postVia; } catch { /* bỏ qua */ }
  if (C.hasToken) return true;
  const go2 = await confirmBox({
    title: 'Chưa kết nối tài khoản Threads',
    text: 'Hãy đăng nhập Threads trong Cài đặt (dùng chung cho cào và đăng bài), hoặc nhập Threads access token. Bạn có thể lưu nháp trước.',
    ok: 'Mở Cài đặt', icon: 'cookie', color: 'lemon',
  });
  if (go2) go('/settings?focus=threads');
  return false;
}

async function submitEditor(mode) {
  const e = C.editor;
  const parts = e.parts.map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return toast('Bài viết đang trống', 'err');
  const over = parts.findIndex((p) => tLen(p) > POST_LIMIT);
  if (over >= 0) return toast(`Phần ${over + 1} vượt ${POST_LIMIT} ký tự — hãy rút gọn`, 'err');
  let scheduled_at = null;
  if (mode === 'later') {
    if (!e.at) return toast('Hãy chọn thời điểm đăng', 'err');
    scheduled_at = new Date(e.at).toISOString();
  }
  const body = { parts, image_url: e.image_url, scheduled_at, model: e.model };
  try {
    let post = e.editingId
      ? await api('/outbox/' + e.editingId, { method: 'PATCH', body })
      : await api('/outbox', { method: 'POST', body });
    upsertOutbox(post);
    if (mode === 'now') {
      toast('Đang đăng lên Threads… (mỗi phần mất khoảng vài giây)', 'info');
      C.manual++;
      try { post = await api(`/outbox/${post.id}/publish`, { method: 'POST' }); } finally { setTimeout(() => C.manual--, 1500); }
      upsertOutbox(post);
      if (post.status === 'published') toast('Đã đăng lên Threads!', 'party', post.permalink ? { label: 'Xem bài', run: () => window.open(post.permalink, '_blank', 'noopener') } : null);
      else toast(post.error || 'Đăng chưa thành công', post.status === 'scheduled' ? 'info' : 'err', { label: 'Xem hàng đợi', run: () => go('/compose?tab=queue') });
    } else {
      toast(mode === 'later' ? `Đã hẹn đăng lúc ${fullDate(scheduled_at)}` : 'Đã lưu nháp', 'party', { label: 'Xem hàng đợi', run: () => go('/compose?tab=queue') });
    }
    if (post.status !== 'failed') C.editor = { parts: [''], image_url: '', when: e.when, at: '', editingId: null, model: null };
    drawEditor();
  } catch (err) {
    toast(err.message, 'err');
  }
}

function drawQueue() {
  const order = { publishing: 0, scheduled: 1, failed: 2, draft: 3, published: 4 };
  const list = [...C.outbox].sort((a, b) => order[a.status] - order[b.status]
    || (a.status === 'scheduled' ? a.scheduled_at.localeCompare(b.scheduled_at) : (b.published_at || b.updated_at).localeCompare(a.published_at || a.updated_at)));
  $('#view').innerHTML = `${composeTabs()}
    <div class="toolbar"><span class="muted" style="font-weight:700;font-size:13px">${ic('info', 'sm')} Bài hẹn giờ chỉ được đăng khi app đang chạy. Threads cho tối đa 250 bài mỗi 24 giờ.</span>
      <div style="flex:1"></div><a class="btn soft" href="#/compose">${ic('plus')}Viết bài mới</a></div>
    <div class="jobs" id="ob-list">${list.length ? list.map(outboxCard).join('')
      : `<div class="block">${empty('Hàng đợi trống', 'Soạn một bài, bấm “Hẹn giờ đăng” — Scrat sẽ tự đăng đúng giờ.', `<a class="btn primary" href="#/compose">${ic('sparkle')}Soạn bài</a>`)}</div>`}</div>`;
}

function outboxCard(p) {
  const st = OUT_STATUS[p.status];
  const when = p.status === 'published' ? `Đã đăng ${ago(p.published_at)}`
    : p.status === 'scheduled' ? `Đăng ${ago(p.scheduled_at)} · ${fullDate(p.scheduled_at)}`
      : `Sửa ${ago(p.updated_at)}`;
  const partial = p.media_ids.length && p.status !== 'published' ? ` · đã đăng ${p.media_ids.length}/${p.parts.length} phần` : '';
  return `<article class="block job ob ${p.status}" id="ob-${p.id}">
    <div class="job-top">
      ${tile(p.status === 'published' ? 'check' : p.status === 'scheduled' ? 'calendar' : p.status === 'failed' ? 'warn' : 'send', st.color)}
      <div class="job-title"><b>${esc(p.parts[0])}</b><span>${when}${p.parts.length > 1 ? ` · chuỗi ${p.parts.length} phần` : ''}${p.image_url ? ' · có ảnh' : ''}${partial}</span></div>
      <span class="status c-${st.color} ${p.status === 'publishing' ? 'running' : ''}">${st.label}</span>
    </div>
    ${p.error ? `<div class="callout c-pink" style="margin-top:12px">${ic('warn')}<div>${esc(p.error)}</div></div>` : ''}
    <div class="job-meta"><span style="flex:1"></span><span class="job-acts">
      ${p.permalink ? `<a class="btn sm soft" href="${esc(safeUrl(p.permalink))}" target="_blank" rel="noopener noreferrer">${ic('external', 'sm')}Xem trên Threads</a>` : ''}
      ${['draft', 'scheduled', 'failed'].includes(p.status) ? `<button class="btn sm soft" data-act="ob-publish" data-id="${p.id}">${ic('send', 'sm')}${p.status === 'failed' ? 'Thử lại' : 'Đăng ngay'}</button>` : ''}
      ${['draft', 'scheduled', 'failed'].includes(p.status) && !p.media_ids.length ? `<button class="btn sm" data-act="ob-edit" data-id="${p.id}">${ic('wand', 'sm')}Sửa</button>` : ''}
      ${p.status === 'scheduled' ? `<button class="btn sm" data-act="ob-unschedule" data-id="${p.id}">${ic('stop', 'sm')}Hủy hẹn</button>` : ''}
      ${p.status !== 'publishing' ? `<button class="btn sm ghost icon danger" data-act="ob-delete" data-id="${p.id}" aria-label="Xóa">${ic('trash', 'sm')}</button>` : ''}
    </span></div>
  </article>`;
}

function upsertOutbox(p) {
  if (p.removed) C.outbox = C.outbox.filter((x) => x.id !== p.id);
  else {
    const i = C.outbox.findIndex((x) => x.id === p.id);
    if (i >= 0) C.outbox[i] = p; else C.outbox.unshift(p);
  }
  if (S.route.id === 'compose' && C.tab === 'queue') drawQueue();
}

export { TONE_OPTS, LEN_OPTS, OUT_STATUS, POST_LIMIT, EMOJI_RE, enc, tLen, C, saveForm, renderCompose, composeTabs, drawCompose, updatePick, variantsHTML, nextGolden, toLocalInput, editorHTML, drawEditor, bindEditor, needToken, submitEditor, drawQueue, outboxCard, upsertOutbox };
