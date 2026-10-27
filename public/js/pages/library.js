/* Scrat Thread by HuyFlou — Trang: Kho dữ liệu. */
import { PAGE_SIZE, everyLabel } from '../config.js';
import { S } from '../state.js';
import { $, $$, ago, api, avatar, compact, debounce, empty, esc, fullDate, img, num, qs, richText, safeUrl, tile, verified } from '../utils.js';
import { closeDrawer, openDrawer, toast } from '../ui.js';
import { go } from '../shell.js';
import { P } from '../palette.js';

/* =====================================================
   Trang: Kho dữ liệu
   ===================================================== */
function renderLibrary() {
  const L = S.lib;
  const q = S.route.query;
  L.tab = q.tab === 'profiles' ? 'profiles' : 'posts';
  // Bộ lọc đến từ link (vd: bấm hashtag ở trang tổng quan)
  if (Object.keys(q).some((k) => k in L.f)) {
    L.f = { q: '', username: '', media: '', replies: '', minLikes: '', from: '', to: '', sort: 'new', source: '' };
    for (const k of Object.keys(L.f)) if (q[k]) L.f[k] = q[k];
  }
  L.selected.clear();

  $('#view').innerHTML = `
    <div class="toolbar">
      <div class="seg">
        <button class="${L.tab === 'posts' ? 'on' : ''}" data-go="/library">${ic('chat', 'sm')}Bài viết</button>
        <button class="${L.tab === 'profiles' ? 'on' : ''}" data-go="/library?tab=profiles">${ic('users', 'sm')}Hồ sơ</button>
      </div>
    </div>
    <div id="lib-body"></div>
    <div class="bulkbar" id="bulkbar"></div>`;
  if (L.tab === 'posts') drawPostsShell();
  else drawProfilesShell();
}

const FORMATS = [['xlsx', 'Excel (.xlsx)', 'sheet', 'mint', 'Mở ngay bằng Excel, Google Sheets'], ['csv', 'CSV', 'rows', 'sky', 'Bảng tính đơn giản, có BOM UTF-8'], ['json', 'JSON', 'code', 'grape', 'Cho lập trình viên & sao lưu']];

function exportMenu(kind) {
  return `<div class="pop-wrap">
    <button class="btn primary" data-act="menu" aria-haspopup="true" aria-expanded="false">${ic('download')}Xuất file${ic('down', 'sm')}</button>
    <div class="pop menu" role="menu">${FORMATS.map(([fmt, label, icon, color, hint]) => `
      <button class="menu-item" role="menuitem" data-act="export" data-kind="${kind}" data-fmt="${fmt}">${tile(icon, color, 'sm')}<span><b>${label}</b><small>${hint}</small></span></button>`).join('')}
    </div></div>`;
}

function activeFilters() {
  const f = S.lib.f;
  const out = [];
  if (f.username) out.push(['username', `@${f.username}`]);
  if (f.source) out.push(['source', `Nguồn: ${f.source}`]);
  if (f.media) out.push(['media', f.media === 'with' ? 'Có ảnh/video' : 'Chỉ chữ']);
  if (f.replies) out.push(['replies', f.replies === 'only' ? 'Chỉ trả lời' : 'Không gồm trả lời']);
  if (+f.minLikes > 0) out.push(['minLikes', `≥ ${num(f.minLikes)} thích`]);
  if (f.from) out.push(['from', `Từ ${f.from}`]);
  if (f.to) out.push(['to', `Đến ${f.to}`]);
  return out;
}

function drawPostsShell() {
  const L = S.lib;
  const f = L.f;
  const af = activeFilters();
  $('#lib-body').innerHTML = `
    <div class="toolbar">
      <div class="input-ic">${ic('search')}<input class="input" id="lib-q" placeholder="Tìm trong nội dung, tác giả, #hashtag…  (phím /)" value="${esc(f.q)}" /></div>
      <select class="select" id="lib-sort" style="width:auto" aria-label="Sắp xếp">
        ${[['new', 'Mới nhất'], ['old', 'Cũ nhất'], ['likes', 'Nhiều thích'], ['replies', 'Nhiều trả lời'], ['reposts', 'Nhiều chia sẻ'], ['engagement', 'Tương tác cao']].map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <button class="btn ${L.showFilters || af.length ? 'soft' : ''}" data-act="toggle-filters">${ic('filter')}Bộ lọc${af.length ? ` (${af.length})` : ''}</button>
      <div class="seg">
        <button class="${L.view === 'grid' ? 'on' : ''}" data-act="lib-view" data-v="grid" aria-label="Dạng thẻ">${ic('grid', 'sm')}</button>
        <button class="${L.view === 'table' ? 'on' : ''}" data-act="lib-view" data-v="table" aria-label="Dạng bảng">${ic('rows', 'sm')}</button>
      </div>
      ${exportMenu('posts')}
    </div>
    <div class="block flat filter-panel ${L.showFilters ? '' : 'hide'}" id="filter-panel">
      <div class="field"><label>Tác giả</label><select class="select" data-f="username" id="f-author"><option value="">Tất cả</option></select></div>
      <div class="field"><label>Media</label><select class="select" data-f="media"><option value="">Tất cả</option><option value="with" ${f.media === 'with' ? 'selected' : ''}>Có ảnh/video</option><option value="without" ${f.media === 'without' ? 'selected' : ''}>Chỉ chữ</option></select></div>
      <div class="field"><label>Loại bài</label><select class="select" data-f="replies"><option value="">Tất cả</option><option value="exclude" ${f.replies === 'exclude' ? 'selected' : ''}>Bài gốc</option><option value="only" ${f.replies === 'only' ? 'selected' : ''}>Chỉ trả lời</option></select></div>
      <div class="field"><label>Thích tối thiểu</label><input class="input" type="number" min="0" data-f="minLikes" value="${esc(f.minLikes)}" placeholder="0" /></div>
      <div class="field"><label>Từ ngày</label><input class="input" type="date" data-f="from" value="${esc(f.from)}" /></div>
      <div class="field"><label>Đến ngày</label><input class="input" type="date" data-f="to" value="${esc(f.to)}" /></div>
    </div>
    ${af.length ? `<div class="chips" style="margin-bottom:12px">${af.map(([k, l]) => `<button class="chip on" data-act="rm-filter" data-k="${k}">${esc(l)} <span class="x">${ic('x', 'sm')}</span></button>`).join('')}<button class="chip" data-act="rm-filter" data-k="*">Xóa tất cả</button></div>` : ''}
    <div class="result-info" id="result-info"></div>
    <div id="post-list"><div class="posts">${'<div class="skel"></div>'.repeat(6)}</div></div>
    <div id="more" style="height:1px"></div>`;

  const qIn = $('#lib-q');
  qIn.oninput = debounce(() => { L.f.q = qIn.value.trim(); loadPosts(true); }, 250);
  $('#lib-sort').onchange = (e) => { L.f.sort = e.target.value; loadPosts(true); };
  $$('#filter-panel [data-f]').forEach((el) => {
    el.onchange = () => { L.f[el.dataset.f] = el.value; drawPostsShell(); };
  });
  fillAuthors();
  loadPosts(true);

  // Cuộn vô hạn
  const io = new IntersectionObserver((ents) => {
    if (ents[0].isIntersecting && !L.loading && L.items.length < L.total) loadPosts(false);
  }, { rootMargin: '600px' });
  io.observe($('#more'));
}

async function fillAuthors() {
  try {
    const { items } = await api('/profiles?sort=name');
    const sel = $('#f-author');
    if (!sel) return;
    const names = new Set(items.map((u) => u.username));
    if (S.lib.f.username) names.add(S.lib.f.username);
    sel.innerHTML = '<option value="">Tất cả</option>' + [...names].sort().map((n) => `<option ${S.lib.f.username === n ? 'selected' : ''} value="${esc(n)}">@${esc(n)}</option>`).join('');
  } catch { /* bỏ qua */ }
}

async function loadPosts(reset) {
  const L = S.lib;
  if (reset) { L.items = []; L.stale = false; }
  L.loading = true;
  const token = (L.token = Symbol());
  try {
    const r = await api('/posts?' + qs({ ...L.f, offset: L.items.length, limit: PAGE_SIZE }));
    if (token !== L.token) return;
    L.total = r.total;
    cachePosts(r.items);
    L.items = reset ? r.items : L.items.concat(r.items);
    drawPosts();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (token === L.token) L.loading = false;
  }
}

function drawPosts() {
  const L = S.lib;
  const el = $('#post-list');
  if (!el) return;
  $('#result-info').innerHTML = `${ic('eye', 'sm')} Hiển thị ${num(L.items.length)} / ${num(L.total)} bài viết
    ${L.stale ? `<button class="chip on" data-act="reload-lib">${ic('refresh', 'sm')}Có dữ liệu mới — tải lại</button>` : ''}`;
  if (!L.items.length) {
    const has = activeFilters().length || L.f.q;
    el.innerHTML = `<div class="block">${has
      ? empty('Không tìm thấy bài nào', 'Thử bỏ bớt bộ lọc hoặc đổi từ khóa xem sao.', '<button class="btn" data-act="rm-filter" data-k="*">Xóa bộ lọc</button>')
      : empty('Kho đang trống', 'Hãy cào một hồ sơ hoặc bài viết đầu tiên — hoặc nạp dữ liệu mẫu để xem thử.', `<div class="row" style="justify-content:center"><a class="btn primary" href="#/scrape">${ic('wand')}Cào dữ liệu</a><button class="btn" data-act="demo">${ic('party')}Nạp dữ liệu mẫu</button></div>`)}</div>`;
    updateBulk();
    return;
  }
  el.innerHTML = L.view === 'table' ? postTable(L.items) : `<div class="posts ${L.selected.size ? 'selecting' : ''}">${L.items.map(postCard).join('')}</div>`;
  updateBulk();
}

function metricChips(p) {
  return `<div class="metrics">
    <span class="metric c-pink" title="Thích">${ic('heart')}${compact(p.like_count)}</span>
    <span class="metric c-sky" title="Trả lời">${ic('reply')}${compact(p.reply_count)}</span>
    <span class="metric c-mint" title="Đăng lại + trích dẫn">${ic('repost')}${compact(p.repost_count + p.quote_count)}</span>
  </div>`;
}

function mediaThumbs(p) {
  if (!p.media || !p.media.length) return '';
  return `<div class="post-media">${p.media.slice(0, 4).map((m) => `<div class="m" style="background-image:url('${esc(img(m.thumb))}')">${m.type === 'video' ? ic('video') : !m.thumb ? ic('image') : ''}</div>`).join('')}</div>`;
}

function postCard(p) {
  const sel = S.lib.selected.has(p.id);
  return `<article class="post ${sel ? 'sel' : ''}" data-act="open-post" data-id="${esc(p.id)}" tabindex="0">
    <span class="check" data-act="toggle-sel" data-id="${esc(p.id)}" role="checkbox" aria-checked="${sel}" aria-label="Chọn">${ic('check')}</span>
    <div class="post-head">${avatar(p)}
      <div class="who"><b>${esc(p.full_name || p.username)}${verified(p.verified)}</b><span>@${esc(p.username)} · ${ago(p.published_at)}</span></div>
    </div>
    ${p.is_reply || p.parent_code ? `<div><span class="badge-reply">↳ Trả lời${p.reply_to ? ' @' + esc(p.reply_to) : ''}</span></div>` : ''}
    ${p.text ? `<p class="post-text">${richText(p.text)}</p>` : ''}
    ${mediaThumbs(p)}
    ${metricChips(p)}
  </article>`;
}

function postTable(items) {
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr><th style="width:44px"><span class="check" data-act="sel-all" role="checkbox" aria-label="Chọn tất cả">${ic('check')}</span></th>
      <th>Tác giả</th><th>Nội dung</th><th class="num">Thích</th><th class="num">Trả lời</th><th class="num">Chia sẻ</th><th>Ngày đăng</th></tr></thead>
    <tbody>${items.map((p) => {
      const sel = S.lib.selected.has(p.id);
      return `<tr class="${sel ? 'sel' : ''}" data-act="open-post" data-id="${esc(p.id)}">
        <td><span class="check" data-act="toggle-sel" data-id="${esc(p.id)}" role="checkbox" aria-checked="${sel}">${ic('check')}</span></td>
        <td><div class="row" style="flex-wrap:nowrap;gap:8px">${avatar(p, 'sm')}<b>@${esc(p.username)}</b>${verified(p.verified)}</div></td>
        <td class="txt">${p.media && p.media.length ? ic('image', 'sm') + ' ' : ''}${esc(p.text || '—')}</td>
        <td class="num">${num(p.like_count)}</td><td class="num">${num(p.reply_count)}</td><td class="num">${num(p.repost_count + p.quote_count)}</td>
        <td style="white-space:nowrap">${p.published_at ? new Date(p.published_at).toLocaleDateString('vi-VN') : '—'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function updateBulk() {
  const bar = $('#bulkbar');
  if (!bar) return;
  const n = S.lib.selected.size;
  bar.classList.toggle('on', n > 0);
  $$('.posts').forEach((el) => el.classList.toggle('selecting', n > 0));
  if (!n) return;
  bar.innerHTML = `<b>Đã chọn ${n}</b>
    <button class="btn sm" data-act="sel-all">${ic('check', 'sm')}<span class="lbl">Chọn hết trang</span></button>
    <button class="btn sm" data-act="export-sel" data-fmt="xlsx">${ic('sheet', 'sm')}Excel</button>
    <button class="btn sm" data-act="export-sel" data-fmt="csv">${ic('download', 'sm')}CSV</button>
    <button class="btn sm" data-act="export-sel" data-fmt="json">${ic('download', 'sm')}JSON</button>
    <button class="btn sm" data-act="scrape-replies-sel" title="Cào bình luận trả lời cho các bài đã chọn">${ic('reply', 'sm')}<span class="lbl">Cào trả lời</span></button>
    <button class="btn sm danger" data-act="delete-sel">${ic('trash', 'sm')}<span class="lbl">Xóa</span></button>
    <button class="btn sm icon" data-act="clear-sel" aria-label="Bỏ chọn">${ic('x', 'sm')}</button>`;
}

function toggleSel(id) {
  const s = S.lib.selected;
  if (s.has(id)) s.delete(id);
  else s.add(id);
  const sel = s.has(id);
  $$(`[data-id="${CSS.escape(id)}"].post, tr[data-id="${CSS.escape(id)}"]`).forEach((el) => {
    el.classList.toggle('sel', sel);
    const c = el.querySelector('.check');
    if (c) c.setAttribute('aria-checked', sel);
  });
  updateBulk();
}

function cachePosts(list) {
  for (const p of list) S.postCache.set(p.id, p);
  return list;
}
const findPost = (id) => S.postCache.get(id);

function openPost(id) {
  const p = findPost(id);
  if (!p) return;
  openDrawer(`
    <div class="drawer-head">${avatar(p)}
      <h3 id="drawer-title">${esc(p.full_name || p.username)}${verified(p.verified)}<br><small class="muted" style="font-size:13px">@${esc(p.username)} · ${fullDate(p.published_at)}</small></h3>
      <button class="btn icon ghost" data-act="close-drawer" aria-label="Đóng">${ic('x')}</button>
    </div>
    <div class="drawer-body">
      ${p.parent_code ? `<div class="callout c-sky">${ic('reply')}<div>Trả lời cho bài viết <b>${esc(p.parent_code)}</b>${p.reply_to ? ` của @${esc(p.reply_to)}` : ''}</div></div>` : ''}
      <p class="detail-text">${richText(p.text) || '<span class="muted">(Bài viết không có chữ)</span>'}</p>
      ${p.media && p.media.length ? `<div class="detail-media">${p.media.map((m) => `<a href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener noreferrer" style="background-image:url('${esc(img(m.thumb))}')">${m.type === 'video' ? ic('video', 'lg') : ''}</a>`).join('')}</div>` : ''}
      ${p.link ? `<a class="callout c-mint" href="${esc(safeUrl(p.link))}" target="_blank" rel="noopener noreferrer">${ic('link')}<div style="word-break:break-all">${esc(p.link)}</div></a>` : ''}
      <div class="metric-grid">
        <div class="c-pink">${ic('heart')}<b>${compact(p.like_count)}</b><span>Thích</span></div>
        <div class="c-sky">${ic('reply')}<b>${compact(p.reply_count)}</b><span>Trả lời</span></div>
        <div class="c-mint">${ic('repost')}<b>${compact(p.repost_count)}</b><span>Đăng lại</span></div>
        <div class="c-lemon">${ic('quote')}<b>${compact(p.quote_count)}</b><span>Trích dẫn</span></div>
      </div>
      ${(p.hashtags || []).length ? `<div class="chips">${p.hashtags.map((h) => `<button class="chip" data-act="filter-tag" data-v="${esc(h)}">#${esc(h)}</button>`).join('')}</div>` : ''}
      <dl class="kv">
        <dt>Mã bài</dt><dd>${esc(p.code)}</dd>
        <dt>ID</dt><dd>${esc(p.id)}</dd>
        <dt>Nguồn</dt><dd>${esc((p.sources || []).join(', ') || '—')}</dd>
        <dt>Cào lúc</dt><dd>${fullDate(p.scraped_at)}</dd>
      </dl>
    </div>
    <div class="drawer-foot">
      <a class="btn primary" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer">${ic('external')}Mở Threads</a>
      <button class="btn" data-act="scrape-replies" data-url="${esc(p.url)}">${ic('reply')}Cào trả lời</button>
      <button class="btn" data-act="copy-text" data-id="${esc(p.id)}">${ic('copy')}Chép chữ</button>
      <button class="btn" data-act="copy-json" data-id="${esc(p.id)}">${ic('copy')}JSON</button>
      <button class="btn" data-act="open-profile" data-v="${esc(p.username)}">${ic('user')}Hồ sơ tác giả</button>
      <button class="btn danger" data-act="delete-one" data-id="${esc(p.id)}">${ic('trash')}Xóa</button>
    </div>`);
}

function setLibFilter(patch) {
  Object.assign(S.lib.f, patch);
  if (S.route.id === 'library' && S.lib.tab === 'posts' && !location.hash.includes('?')) {
    closeDrawer();
    drawPostsShell();
  } else {
    go('/library?' + qs(S.lib.f));
  }
}

/* ---------- Hồ sơ ---------- */
function drawProfilesShell() {
  const L = S.lib;
  $('#lib-body').innerHTML = `
    <div class="toolbar">
      <div class="input-ic">${ic('search')}<input class="input" id="lib-q" placeholder="Tìm theo tên, @tài khoản, tiểu sử…  (phím /)" value="${esc(L.pq)}" /></div>
      <select class="select" id="p-sort" style="width:auto" aria-label="Sắp xếp">
        ${[['followers', 'Nhiều người theo dõi'], ['recent', 'Cào gần đây'], ['name', 'Tên A→Z']].map(([k, l]) => `<option value="${k}" ${L.psort === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      ${exportMenu('profiles')}
    </div>
    <div class="result-info" id="result-info"></div>
    <div id="profile-list"><div class="profiles">${'<div class="skel"></div>'.repeat(6)}</div></div>`;
  const qIn = $('#lib-q');
  qIn.oninput = debounce(() => { L.pq = qIn.value.trim(); loadProfiles(); }, 250);
  $('#p-sort').onchange = (e) => { L.psort = e.target.value; loadProfiles(); };
  loadProfiles();
}

async function loadProfiles() {
  const L = S.lib;
  try {
    const r = await api('/profiles?' + qs({ q: L.pq, sort: L.psort }));
    L.profiles = r.items;
    L.stale = false;
    if (!$('#profile-list')) return;
    $('#result-info').innerHTML = `${ic('eye', 'sm')} ${num(r.total)} hồ sơ`;
    $('#profile-list').innerHTML = r.items.length
      ? `<div class="profiles">${r.items.map(profileCard).join('')}</div>`
      : `<div class="block">${empty(L.pq ? 'Không tìm thấy hồ sơ' : 'Chưa có hồ sơ nào', L.pq ? 'Thử từ khóa khác nhé.' : 'Cào một tài khoản để xem thông tin ở đây.', L.pq ? '' : `<a class="btn primary" href="#/scrape?mode=profile">${ic('user')}Cào hồ sơ</a>`)}</div>`;
  } catch (e) {
    toast(e.message, 'err');
  }
}

function profileCard(u) {
  const h = u.history || [];
  const delta = h.length > 1 ? h[h.length - 1].f - h[h.length - 2].f : 0;
  return `<article class="block profile">
    <div class="profile-top" data-act="open-profile" data-v="${esc(u.username)}" style="cursor:pointer" title="Xem chi tiết">${avatar(u, 'lg')}
      <div class="who"><b>${esc(u.full_name || u.username)}${verified(u.verified)}</b><span>@${esc(u.username)}${u.private ? ' · 🔒 Riêng tư' : ''}</span></div>
    </div>
    <p class="bio">${esc(u.bio) || '<span class="muted">Chưa có tiểu sử</span>'}</p>
    <div class="profile-stats">
      <div class="c-grape"><b>${compact(u.follower_count)}</b><span>Theo dõi${delta ? ` ${delta > 0 ? '▲' : '▼'}${compact(Math.abs(delta))}` : ''}</span></div>
      <div class="c-sky"><b>${num(u.post_count)}</b><span>Bài đã lưu</span></div>
      <div class="c-mint"><b>${ago(u.scraped_at).replace('trước', '').trim()}</b><span>Cập nhật</span></div>
    </div>
    <div class="row">
      <button class="btn sm soft" data-act="open-profile" data-v="${esc(u.username)}">${ic('chart', 'sm')}Chi tiết</button>
      <button class="btn sm" data-act="filter-author" data-v="${esc(u.username)}">${ic('chat', 'sm')}Xem bài</button>
      <button class="btn sm" data-act="rescrape" data-v="${esc(u.username)}">${ic('refresh', 'sm')}Cào lại</button>
      <a class="btn sm ghost icon" href="${esc(safeUrl(u.url))}" target="_blank" rel="noopener noreferrer" aria-label="Mở trên Threads">${ic('external', 'sm')}</a>
      <button class="btn sm ghost icon danger" data-act="delete-profile" data-v="${esc(u.username)}" aria-label="Xóa hồ sơ">${ic('trash', 'sm')}</button>
    </div>
  </article>`;
}

/** Biểu đồ đường nhỏ cho lịch sử người theo dõi. */
function sparkline(history) {
  if (!history || history.length < 2) {
    return `<div class="muted" style="font-size:13px;font-weight:700">${ic('info', 'sm')} Cần ít nhất 2 lần cào để vẽ biểu đồ. Bật “Theo dõi hằng ngày” để Scrat tự ghi lại.</div>`;
  }
  const W = 460, H = 90, P = 6;
  const vals = history.map((h) => h.f);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const pts = history.map((h, i) => [P + (i / (history.length - 1)) * (W - 2 * P), H - P - ((h.f - min) / span) * (H - 2 * P)]);
  const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  const last = pts[pts.length - 1];
  const diff = vals[vals.length - 1] - vals[0];
  return `<div class="spark">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Lịch sử người theo dõi">
      <polygon points="${P},${H} ${line} ${W - P},${H}" class="spark-area"/>
      <polyline points="${line}" class="spark-line"/>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4.5" class="spark-dot"/>
    </svg>
    <div class="spark-foot"><span>${new Date(history[0].t).toLocaleDateString('vi-VN')}</span>
      <b class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲' : '▼'} ${num(Math.abs(diff))} (${history.length} lần đo)</b>
      <span>${new Date(history[history.length - 1].t).toLocaleDateString('vi-VN')}</span></div>
  </div>`;
}

async function openProfile(username) {
  let r;
  try {
    r = await api('/profiles/' + encodeURIComponent(username));
  } catch (e) {
    return toast(e.message, 'err');
  }
  const u = r.profile;
  const sm = r.summary;
  cachePosts(r.topPosts);
  const sched = r.schedules[0];
  openDrawer(`
    <div class="drawer-head">${avatar(u)}
      <h3 id="drawer-title">${esc(u.full_name || u.username)}${verified(u.verified)}<br><small class="muted" style="font-size:13px">@${esc(u.username)}${u.private ? ' · 🔒 Riêng tư' : ''}</small></h3>
      <button class="btn icon ghost" data-act="close-drawer" aria-label="Đóng">${ic('x')}</button>
    </div>
    <div class="drawer-body">
      ${u.bio ? `<p class="detail-text" style="font-size:14.5px">${richText(u.bio)}</p>` : ''}
      ${(u.links || []).length ? `<div class="chips">${u.links.map((l) => `<a class="chip" href="${esc(safeUrl(l))}" target="_blank" rel="noopener noreferrer">${ic('link', 'sm')}${esc(l.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))}</a>`).join('')}</div>` : ''}
      <div class="metric-grid">
        <div class="c-grape">${ic('users')}<b>${compact(u.follower_count)}</b><span>Theo dõi</span></div>
        <div class="c-sky">${ic('chat')}<b>${num(sm.posts)}</b><span>Bài đã lưu</span></div>
        <div class="c-pink">${ic('heart')}<b>${compact(sm.avg_likes)}</b><span>TB thích/bài</span></div>
        <div class="c-mint">${ic('bolt')}<b>${sm.engagement_rate == null ? '—' : (sm.engagement_rate * 100).toFixed(2) + '%'}</b><span>Tỉ lệ tương tác</span></div>
      </div>
      <section>
        <div class="block-head" style="margin-bottom:8px">${tile('chart', 'grape', 'sm')}<div><h3>Người theo dõi theo thời gian</h3></div></div>
        ${sparkline(u.history)}
      </section>
      <section>
        <div class="block-head" style="margin-bottom:8px">${tile('party', 'lemon', 'sm')}<div><h3>Bài nổi bật</h3><p>Theo tương tác</p></div></div>
        <div class="list">${r.topPosts.length ? r.topPosts.map((p) => `
          <div class="list-item" data-act="open-post" data-id="${esc(p.id)}">
            <div class="grow"><b style="font-weight:700">${esc(p.text || '(không có chữ)')}</b><span>${ago(p.published_at)} · ${compact(p.reply_count)} trả lời</span></div>
            <span class="metric c-pink">${ic('heart')}${compact(p.like_count)}</span>
          </div>`).join('') : empty('Chưa có bài viết', 'Cào lại hồ sơ để lấy bài viết.', '', true)}</div>
      </section>
    </div>
    <div class="drawer-foot">
      <button class="btn primary" data-act="filter-author" data-v="${esc(u.username)}">${ic('chat')}Tất cả bài</button>
      <button class="btn" data-act="rescrape" data-v="${esc(u.username)}">${ic('refresh')}Cào lại</button>
      ${sched
        ? `<a class="btn soft" href="#/jobs?tab=schedules">${ic('calendar')}Đang theo dõi · ${everyLabel(sched.every).toLowerCase()}</a>`
        : `<button class="btn soft" data-act="follow-daily" data-v="${esc(u.username)}">${ic('calendar')}Theo dõi hằng ngày</button>`}
      <a class="btn ghost" href="${esc(safeUrl(u.url || 'https://www.threads.com/@' + u.username))}" target="_blank" rel="noopener noreferrer">${ic('external')}Threads</a>
    </div>`);
}

export { renderLibrary, FORMATS, exportMenu, activeFilters, drawPostsShell, fillAuthors, loadPosts, drawPosts, metricChips, mediaThumbs, postCard, postTable, updateBulk, toggleSel, cachePosts, findPost, openPost, setLibFilter, drawProfilesShell, loadProfiles, profileCard, sparkline, openProfile };
