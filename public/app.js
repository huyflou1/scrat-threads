/* Scrat Threads — ứng dụng một trang, không cần build. */
(() => {
  'use strict';

  /* =====================================================
     Cấu hình menu & hằng số
     ===================================================== */
  const NAV = [
    {
      group: 'Làm việc',
      items: [
        { id: 'home', path: '/', label: 'Tổng quan', icon: 'home', color: 'grape', sub: 'Bức tranh toàn cảnh dữ liệu của bạn' },
        { id: 'scrape', path: '/scrape', label: 'Cào dữ liệu', icon: 'wand', color: 'pink', sub: 'Chọn nguồn, bấm một nút là xong' },
        { id: 'jobs', path: '/jobs', label: 'Tác vụ', icon: 'timer', color: 'peach', sub: 'Theo dõi tiến độ theo thời gian thực', badge: true },
      ],
    },
    {
      group: 'Quản lý',
      items: [
        { id: 'library', path: '/library', label: 'Kho dữ liệu', icon: 'box', color: 'mint', sub: 'Lọc, xem chi tiết và xuất file' },
        { id: 'settings', path: '/settings', label: 'Cài đặt', icon: 'sliders', color: 'sky', sub: 'Trình duyệt, tốc độ, đăng nhập' },
      ],
    },
  ];
  const PAGES = NAV.flatMap((g) => g.items);

  const MODES = {
    profile: { label: 'Hồ sơ', icon: 'user', color: 'grape', desc: 'Thông tin và bài viết của một tài khoản' },
    post: { label: 'Bài viết', icon: 'chat', color: 'sky', desc: 'Một bài viết kèm các bình luận trả lời' },
    search: { label: 'Từ khóa', icon: 'search', color: 'peach', desc: 'Bài viết theo từ khóa, hashtag' },
    batch: { label: 'Hàng loạt', icon: 'stack', color: 'mint', desc: 'Nhiều tài khoản và link cùng lúc' },
  };

  const STATUS = {
    queued: { label: 'Đang chờ', color: 'slate' },
    running: { label: 'Đang chạy', color: 'sky' },
    done: { label: 'Hoàn tất', color: 'mint' },
    failed: { label: 'Lỗi', color: 'pink' },
    cancelled: { label: 'Đã hủy', color: 'lemon' },
  };

  const AV_COLORS = ['#7c5cff', '#ff7a45', '#12a87a', '#2f8cff', '#e0a100', '#f0487f', '#8b5cf6', '#0ea5a4'];
  const PAGE_SIZE = 48;

  /* =====================================================
     Trạng thái
     ===================================================== */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('st-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('st-' + k, JSON.stringify(v)); } catch { /* chế độ riêng tư */ } },
  };

  const S = {
    route: { id: 'home', query: {} },
    jobs: [],
    jobsLoaded: false,
    jobFilter: 'all',
    openLogs: new Set(),
    settings: null,
    settingsDirty: false,
    mode: store.get('mode', 'profile'),
    draft: store.get('draft', { profile: { username: '', limit: 50 }, post: { url: '', limit: 50 }, search: { query: '', mode: 'top', limit: 50 }, batch: { items: '', limit: 30 } }),
    lib: {
      tab: 'posts',
      view: store.get('libView', 'grid'),
      showFilters: false,
      f: { q: '', username: '', media: '', replies: '', minLikes: '', from: '', to: '', sort: 'new', source: '' },
      items: [],
      total: 0,
      loading: false,
      selected: new Set(),
      stale: false,
      pq: '',
      psort: 'followers',
      profiles: [],
    },
    stats: null,
  };

  /* =====================================================
     Tiện ích
     ===================================================== */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('vi-VN');
  const cf = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });
  const num = (n) => nf.format(n || 0);
  const compact = (n) => ((n || 0) < 10000 ? nf.format(n || 0) : cf.format(n));
  const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });

  function ago(iso) {
    if (!iso) return '—';
    const s = (Date.parse(iso) - Date.now()) / 1000;
    const a = Math.abs(s);
    if (a < 45) return 'vừa xong';
    if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), 'day');
    return new Date(iso).toLocaleDateString('vi-VN');
  }
  const fullDate = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  function hashColor(s) {
    let h = 0;
    for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return AV_COLORS[Math.abs(h) % AV_COLORS.length];
  }

  function avatar(u, size = '') {
    const name = u.username || '?';
    const fb = `<span class="avatar ${size}" style="background:${hashColor(name)}">${esc((u.full_name || name).trim()[0] || '?').toUpperCase()}</span>`;
    if (!u.avatar) return fb;
    return `<img class="avatar ${size}" src="${esc(img(u.avatar))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fb="${esc(fb)}" onerror="this.outerHTML=this.dataset.fb">`;
  }

  // Ảnh từ CDN của Meta phải đi qua proxy của máy chủ
  const img = (u) => (u ? '/api/img?u=' + encodeURIComponent(u) : '');

  const verified = (v) => (v ? `<svg class="ic verified" aria-label="Đã xác minh"><use href="#i-badge"/></svg>` : '');

  function richText(t) {
    return esc(t).replace(/(^|\s)([#@][\p{L}\p{N}_.]+)/gu, '$1<span class="tag">$2</span>');
  }

  function tile(icon, color, size = '') {
    return `<span class="tile ${size} c-${color}">${ic(icon)}</span>`;
  }

  function empty(title, text, action = '', small = false) {
    return `<div class="empty ${small ? 'sm' : ''}"><svg class="mascot"><use href="#i-acorn"/></svg><b>${title}</b><p>${text}</p>${action}</div>`;
  }

  function parseUsername(s) {
    if (!s) return null;
    s = String(s).trim();
    const m = s.match(/threads\.(?:net|com)\/@([^/?#\s]+)/i);
    if (m) s = m[1];
    s = s.replace(/^@/, '');
    return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s.toLowerCase() : null;
  }
  const parsePostUrl = (s) => {
    const m = String(s || '').trim().match(/threads\.(?:net|com)\/@([^/?#\s]+)\/post\/([A-Za-z0-9_-]+)/i);
    return m ? { username: m[1].toLowerCase(), code: m[2] } : null;
  };

  /** Đoán loại tác vụ từ chuỗi người dùng nhập/dán. */
  function detect(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const lines = s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
    if (lines.length > 1) return { type: 'batch', body: { items: s }, text: `${lines.length} mục hàng loạt` };
    const post = parsePostUrl(s);
    if (post) return { type: 'post', body: { url: s }, text: `bài viết ${post.code} của @${post.username}` };
    if (/threads\.(net|com)\/@/i.test(s) || /^@[A-Za-z0-9._]+$/.test(s)) {
      const u = parseUsername(s);
      if (u) return { type: 'profile', body: { username: u }, text: `hồ sơ @${u}` };
    }
    return { type: 'search', body: { query: s }, text: `từ khóa “${s}”` };
  }

  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
      ...opts,
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
    return data;
  }

  const qs = (o) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v !== '' && v != null) p.set(k, v);
    return p.toString();
  };

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  /* =====================================================
     Toast, modal, drawer
     ===================================================== */
  function toast(msg, kind = 'ok', action) {
    const map = { ok: ['check', 'mint'], err: ['warn', 'pink'], info: ['info', 'sky'], party: ['party', 'grape'] };
    const [icon, color] = map[kind] || map.ok;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${tile(icon, color)}<span>${esc(msg)}</span>${action ? `<button class="btn sm soft">${esc(action.label)}</button>` : ''}`;
    if (action) el.querySelector('button').onclick = () => { action.run(); close(); };
    $('#toasts').append(el);
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
    setTimeout(close, action ? 6000 : 3200);
  }

  function confirmBox({ title, text, ok = 'Đồng ý', danger = false, icon = 'warn', color = 'pink' }) {
    return new Promise((resolve) => {
      const m = $('#modal');
      m.innerHTML = `${tile(icon, color, 'lg')}<h3>${title}</h3><p>${text}</p>
        <div class="row"><button class="btn" data-r="0">Thôi</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-r="1">${ok}</button></div>`;
      const done = (v) => { m.classList.remove('on'); overlay(false); resolve(v); };
      m.onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); };
      overlay(true, () => done(false));
      m.classList.add('on');
      m.querySelector('[data-r="1"]').focus();
    });
  }

  let overlayClose = null;
  function overlay(on, onClose) {
    $('#overlay').classList.toggle('on', on);
    overlayClose = on ? onClose : null;
  }
  $('#overlay').onclick = () => overlayClose && overlayClose();

  function openDrawer(html) {
    const d = $('#drawer');
    d.innerHTML = html;
    d.classList.add('on');
    overlay(true, closeDrawer);
    setTimeout(() => { const b = d.querySelector('[data-act="close-drawer"]'); if (b) b.focus(); }, 50);
  }
  function closeDrawer() {
    $('#drawer').classList.remove('on');
    overlay(false);
  }

  function download(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.append(a);
    a.click();
    a.remove();
  }

  async function copy(text, msg = 'Đã sao chép') {
    try {
      await navigator.clipboard.writeText(text);
      toast(msg);
    } catch {
      toast('Trình duyệt chặn sao chép', 'err');
    }
  }

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
    document.title = `${page.label} · Scrat Threads`;
    renderNav();
    closeDrawer();
    const v = $('#view');
    v.style.animation = 'none';
    void v.offsetHeight;
    v.style.animation = '';
    await PAGE_RENDER[page.id]();
    window.scrollTo({ top: 0 });
  }

  /* =====================================================
     Trang: Tổng quan
     ===================================================== */
  async function renderHome() {
    const v = $('#view');
    if (!S.stats) v.innerHTML = `<div class="bento">${'<div class="skel span-3"></div>'.repeat(4)}<div class="skel span-8" style="min-height:260px"></div><div class="skel span-4"></div></div>`;
    try {
      S.stats = await api('/stats');
    } catch (e) {
      v.innerHTML = empty('Không kết nối được máy chủ', esc(e.message));
      return;
    }
    if (S.route.id !== 'home') return;
    drawHome();
  }

  function drawHome() {
    const st = S.stats;
    const t = st.totals;
    const max = Math.max(1, ...st.daily.map((d) => d.count));
    const hour = new Date().getHours();
    const hello = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
    const quickVal = $('#quick-in') ? $('#quick-in').value : '';

    $('#view').innerHTML = `
      <div class="bento">
        <section class="block hero span-12">
          <svg class="mascot" aria-hidden="true"><use href="#i-acorn"/></svg>
          <div class="hero-body">
            <h2>${hello}! Hôm nay mình cào gì nào?</h2>
            <p>Dán <b>@tên</b>, <b>link hồ sơ / bài viết</b> hoặc gõ <b>từ khóa</b> — Scrat tự nhận diện giúp bạn.</p>
            <form class="quick" id="quick-form">
              <input id="quick-in" placeholder="vd: @zuck, https://www.threads.com/@user/post/…, cà phê muối" autocomplete="off" value="${esc(quickVal)}" />
              <button class="btn primary" type="submit">${ic('bolt')}Cào ngay</button>
            </form>
            <div class="quick-hint" id="quick-hint"></div>
          </div>
        </section>

        ${statBlock('chat', 'grape', num(t.posts), 'Bài viết đã lưu', '#/library')}
        ${statBlock('users', 'sky', num(t.profiles), 'Hồ sơ', '#/library?tab=profiles')}
        ${statBlock('heart', 'pink', compact(t.likes), 'Tổng lượt thích', '#/library?sort=likes')}
        ${statBlock('timer', 'peach', `${t.running + t.queued}<small style="font-size:15px;color:var(--muted)"> / ${num(t.jobs)}</small>`, 'Tác vụ đang chạy / tổng', '#/jobs')}

        <section class="block span-8">
          <div class="block-head">${tile('chart', 'grape', 'sm')}<div><h3>Bài viết theo ngày đăng</h3><p>14 ngày gần nhất</p></div></div>
          ${st.daily.some((d) => d.count) ? `<div class="bars">${st.daily.map((d, i) => `
            <div class="bar ${i === st.daily.length - 1 ? 'today' : ''}" title="${d.date}: ${d.count} bài">
              <i style="height:${Math.max(3, (d.count / max) * 100)}%" data-v="${d.count}"></i>
              <span>${d.date.slice(8)}/${d.date.slice(5, 7)}</span>
            </div>`).join('')}</div>` : empty('Chưa có dữ liệu', 'Cào vài hồ sơ để thấy biểu đồ hoạt động nhé.', '', true)}
        </section>

        <section class="block span-4">
          <div class="block-head">${tile('timer', 'peach', 'sm')}<div><h3>Tác vụ gần đây</h3></div>
            <div class="act"><a class="btn sm ghost" href="#/jobs">Tất cả ${ic('chevron', 'sm')}</a></div></div>
          <div class="list" id="home-jobs">${homeJobs(st.recentJobs)}</div>
        </section>

        <section class="block span-4">
          <div class="block-head">${tile('users', 'sky', 'sm')}<div><h3>Tác giả nổi bật</h3><p>Theo tương tác</p></div></div>
          <div class="list">${st.topAuthors.length ? st.topAuthors.map((a, i) => `
            <a class="list-item" href="#/library?username=${encodeURIComponent(a.username)}">
              <span class="rank r${i + 1}">${i + 1}</span>${avatar(a, 'sm')}
              <div class="grow"><b>${esc(a.full_name || a.username)}${verified(a.verified)}</b><span>@${esc(a.username)} · ${a.posts} bài</span></div>
              <span class="end">${compact(a.engagement)}</span>
            </a>`).join('') : empty('Trống trơn', 'Chưa có tác giả nào.', '', true)}</div>
        </section>

        <section class="block span-4">
          <div class="block-head">${tile('hash', 'mint', 'sm')}<div><h3>Hashtag nổi bật</h3><p>Bấm để lọc</p></div></div>
          ${st.topTags.length ? `<div class="chips">${st.topTags.map((t) => `<a class="chip" href="#/library?q=${encodeURIComponent('#' + t.tag)}">#${esc(t.tag)} <b>${t.count}</b></a>`).join('')}</div>` : empty('Chưa có hashtag', 'Hashtag trong bài viết sẽ hiện ở đây.', '', true)}
        </section>

        <section class="block span-4">
          <div class="block-head">${tile('party', 'lemon', 'sm')}<div><h3>Bài viết hot nhất</h3></div></div>
          <div class="list">${st.topPosts.length ? st.topPosts.map((p) => `
            <div class="list-item" data-act="open-post" data-id="${esc(p.id)}" data-src="stats">
              ${avatar(p, 'sm')}
              <div class="grow"><b>@${esc(p.username)}</b><span>${esc(p.text || '(không có chữ)')}</span></div>
              <span class="metric c-pink">${ic('heart')}${compact(p.like_count)}</span>
            </div>`).join('') : empty('Chưa có bài viết', 'Bài nhiều tương tác nhất sẽ ở đây.', '', true)}</div>
        </section>
      </div>`;

    const input = $('#quick-in');
    const hint = () => {
      const d = detect(input.value);
      $('#quick-hint').innerHTML = d ? `${ic(MODES[d.type].icon, 'sm')} Sẽ cào ${esc(d.text)}` : '';
    };
    input.oninput = hint;
    hint();
    $('#quick-form').onsubmit = async (e) => {
      e.preventDefault();
      const d = detect(input.value);
      if (!d) return input.focus();
      if (await startJob(d.type, { ...d.body, limit: 50 })) input.value = '';
      hint();
    };
  }

  function statBlock(icon, color, val, label, href) {
    return `<a class="block stat span-3 c-${color}" href="${href}"><span class="blob"></span>${tile(icon, color)}<div><div class="val">${val}</div><div class="lbl">${label}</div></div></a>`;
  }

  function homeJobs(list) {
    if (!list.length) return empty('Chưa có tác vụ', 'Bắt đầu bằng ô cào nhanh phía trên.', '', true);
    return list.map((j) => {
      const m = MODES[j.type];
      const s = STATUS[j.status];
      return `<a class="list-item" href="#/jobs">${tile(m.icon, m.color, 'sm')}
        <div class="grow"><b>${esc(j.label)}</b><span>${m.label} · ${j.stats.posts} bài · ${ago(j.created_at)}</span></div>
        <span class="status c-${s.color} ${j.status}">${s.label}</span></a>`;
    }).join('');
  }

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
          <div class="row" style="margin-top:4px">
            <button class="btn primary lg" type="submit">${ic('play')}Bắt đầu cào</button>
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
      const ok = await startJob(m, body, { stay: true });
      if (ok) {
        S.draft[m][main.dataset.draft] = '';
        store.set('draft', S.draft);
        main.value = '';
        if (m === 'batch') drawBatchDetect();
      }
    };
    if (!matchMedia('(max-width: 640px)').matches) main.focus();
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

  /* =====================================================
     Trang: Tác vụ
     ===================================================== */
  async function renderJobs() {
    if (!S.jobsLoaded) await loadJobs();
    drawJobs();
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
    $('#view').innerHTML = `
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
    if (id === 'jobs') {
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
        <button class="btn primary" data-act="export" data-kind="posts" data-fmt="csv">${ic('download')}CSV</button>
        <button class="btn" data-act="export" data-kind="posts" data-fmt="json">${ic('download')}JSON</button>
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
      <button class="btn sm" data-act="export-sel" data-fmt="csv">${ic('download', 'sm')}CSV</button>
      <button class="btn sm" data-act="export-sel" data-fmt="json">${ic('download', 'sm')}JSON</button>
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

  function findPost(id) {
    return S.lib.items.find((p) => p.id === id) || (S.stats && S.stats.topPosts.find((p) => p.id === id));
  }

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
        ${p.media && p.media.length ? `<div class="detail-media">${p.media.map((m) => `<a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer" style="background-image:url('${esc(img(m.thumb))}')">${m.type === 'video' ? ic('video', 'lg') : ''}</a>`).join('')}</div>` : ''}
        ${p.link ? `<a class="callout c-mint" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer">${ic('link')}<div style="word-break:break-all">${esc(p.link)}</div></a>` : ''}
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
        <a class="btn primary" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${ic('external')}Mở Threads</a>
        <button class="btn" data-act="scrape-replies" data-url="${esc(p.url)}">${ic('reply')}Cào trả lời</button>
        <button class="btn" data-act="copy-text" data-id="${esc(p.id)}">${ic('copy')}Chép chữ</button>
        <button class="btn" data-act="copy-json" data-id="${esc(p.id)}">${ic('copy')}JSON</button>
        <button class="btn" data-act="filter-author" data-v="${esc(p.username)}">${ic('user')}Bài của tác giả</button>
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
        <button class="btn primary" data-act="export" data-kind="profiles" data-fmt="csv">${ic('download')}CSV</button>
        <button class="btn" data-act="export" data-kind="profiles" data-fmt="json">${ic('download')}JSON</button>
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
      <div class="profile-top">${avatar(u, 'lg')}
        <div class="who"><b>${esc(u.full_name || u.username)}${verified(u.verified)}</b><span>@${esc(u.username)}${u.private ? ' · 🔒 Riêng tư' : ''}</span></div>
      </div>
      <p class="bio">${esc(u.bio) || '<span class="muted">Chưa có tiểu sử</span>'}</p>
      <div class="profile-stats">
        <div class="c-grape"><b>${compact(u.follower_count)}</b><span>Theo dõi${delta ? ` ${delta > 0 ? '▲' : '▼'}${compact(Math.abs(delta))}` : ''}</span></div>
        <div class="c-sky"><b>${num(u.post_count)}</b><span>Bài đã lưu</span></div>
        <div class="c-mint"><b>${ago(u.scraped_at).replace('trước', '').trim()}</b><span>Cập nhật</span></div>
      </div>
      <div class="row">
        <button class="btn sm soft" data-act="filter-author" data-v="${esc(u.username)}">${ic('chat', 'sm')}Xem bài</button>
        <button class="btn sm" data-act="rescrape" data-v="${esc(u.username)}">${ic('refresh', 'sm')}Cào lại</button>
        <a class="btn sm ghost icon" href="${esc(u.url)}" target="_blank" rel="noopener noreferrer" aria-label="Mở trên Threads">${ic('external', 'sm')}</a>
        <button class="btn sm ghost icon danger" data-act="delete-profile" data-v="${esc(u.username)}" aria-label="Xóa hồ sơ">${ic('trash', 'sm')}</button>
      </div>
    </article>`;
  }

  /* =====================================================
     Trang: Cài đặt
     ===================================================== */
  async function renderSettings() {
    try {
      S.settings = await api('/settings');
    } catch (e) {
      $('#view').innerHTML = empty('Không tải được cài đặt', esc(e.message));
      return;
    }
    const s = S.settings;
    const theme = store.get('theme', 'auto');
    const sw = (k) => `<label class="switch"><input type="checkbox" data-s="${k}" ${s[k] ? 'checked' : ''}/><span></span></label>`;
    const numIn = (k, min, max, step = 1, suffix = '') => `<div class="input-ic"><input class="input" type="number" data-s="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}" />${suffix ? `<span class="muted" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:12px;font-weight:800">${suffix}</span>` : ''}</div>`;

    $('#view').innerHTML = `
      <div class="bento">
        <section class="block span-6">
          <div class="block-head">${tile('globe', 'grape')}<div><h3>Trình duyệt</h3><p>Cách Scrat mở Threads</p></div></div>
          <div class="set-row"><div class="txt"><b>Chạy ẩn (headless)</b><span>Tắt để xem trình duyệt thao tác trực tiếp</span></div><div class="ctl auto">${sw('headless')}</div></div>
          <div class="set-row"><div class="txt"><b>Thời gian chờ tối đa</b><span>Mỗi lần tải trang</span></div><div class="ctl">${numIn('timeout', 5000, 180000, 1000, 'ms')}</div></div>
          <div class="set-row"><div class="txt"><b>Lấy cả trả lời</b><span>Thu thập bình luận khi cào bài viết / hồ sơ</span></div><div class="ctl auto">${sw('includeReplies')}</div></div>
        </section>

        <section class="block span-6">
          <div class="block-head">${tile('gauge', 'peach')}<div><h3>Tốc độ & giới hạn</h3><p>Chậm mà chắc, tránh bị chặn</p></div></div>
          <div class="set-row"><div class="txt"><b>Độ trễ tối thiểu</b><span>Giữa các lần cuộn</span></div><div class="ctl">${numIn('delayMin', 0, 30000, 100, 'ms')}</div></div>
          <div class="set-row"><div class="txt"><b>Độ trễ tối đa</b><span>Ngẫu nhiên trong khoảng</span></div><div class="ctl">${numIn('delayMax', 0, 60000, 100, 'ms')}</div></div>
          <div class="set-row"><div class="txt"><b>Số lần cuộn tối đa</b><span>Mỗi trang</span></div><div class="ctl">${numIn('maxScrolls', 1, 500)}</div></div>
          <div class="set-row"><div class="txt"><b>Tác vụ chạy song song</b><span>1–3, càng nhiều càng dễ bị chặn</span></div><div class="ctl">${numIn('concurrency', 1, 3)}</div></div>
        </section>

        <section class="block span-6">
          <div class="block-head">${tile('cookie', 'lemon')}<div><h3>Đăng nhập (cookie)</h3><p>Cần cho tìm kiếm & nội dung giới hạn</p></div></div>
          <div class="field">
            <textarea class="textarea" data-s="cookies" placeholder='sessionid=...; csrftoken=...  hoặc JSON xuất từ extension Cookie-Editor' style="min-height:110px">${esc(s.cookies)}</textarea>
            <span class="hint">Đăng nhập threads.com trên trình duyệt → xuất cookie bằng extension (vd: Cookie-Editor) → dán vào đây. Cookie chỉ lưu trên máy bạn.</span>
          </div>
        </section>

        <section class="block span-6">
          <div class="block-head">${tile('shield', 'sky')}<div><h3>Kết nối</h3><p>Proxy & danh tính trình duyệt</p></div></div>
          <div class="stack">
            <div class="field"><label>Proxy</label><input class="input" data-s="proxy" placeholder="http://user:pass@host:port" value="${esc(s.proxy)}" /></div>
            <div class="field"><label>User-Agent tùy chỉnh</label><input class="input" data-s="userAgent" placeholder="Để trống để dùng mặc định" value="${esc(s.userAgent)}" /></div>
          </div>
        </section>

        <section class="block span-6">
          <div class="block-head">${tile('sun', 'pink')}<div><h3>Giao diện</h3><p>Lưu trên trình duyệt này</p></div></div>
          <div class="seg">
            ${[['auto', 'Tự động', 'command'], ['light', 'Sáng', 'sun'], ['dark', 'Tối', 'moon']].map(([k, l, i]) => `<button class="${theme === k ? 'on' : ''}" data-act="theme" data-v="${k}">${ic(i, 'sm')}${l}</button>`).join('')}
          </div>
          <div class="set-row" style="margin-top:10px"><div class="txt"><b>Phím tắt</b><span><kbd>Ctrl K</kbd> bảng lệnh · <kbd>/</kbd> tìm trong kho · <kbd>Esc</kbd> đóng · <kbd>Ctrl Enter</kbd> chạy cào</span></div></div>
        </section>

        <section class="block span-6">
          <div class="block-head">${tile('box', 'mint')}<div><h3>Dữ liệu</h3><p>Lưu tại data/db.json</p></div></div>
          <div class="row">
            <button class="btn soft" data-act="demo">${ic('party')}Nạp dữ liệu mẫu</button>
            <button class="btn" data-act="export" data-kind="posts" data-fmt="json">${ic('download')}Sao lưu JSON</button>
            <button class="btn danger" data-act="clear-all">${ic('trash')}Xóa toàn bộ</button>
          </div>
        </section>
      </div>
      <div class="bulkbar" id="save-bar">
        <b>Có thay đổi chưa lưu</b>
        <button class="btn sm" data-act="reset-settings">Hoàn tác</button>
        <button class="btn sm" style="background:var(--primary);color:var(--primary-ink)" data-act="save-settings">${ic('check', 'sm')}Lưu cài đặt</button>
      </div>`;

    $$('#view [data-s]').forEach((el) => {
      el.addEventListener('input', () => {
        S.settingsDirty = true;
        $('#save-bar').classList.add('on');
      });
    });
  }

  async function saveSettings() {
    const patch = {};
    $$('#view [data-s]').forEach((el) => {
      patch[el.dataset.s] = el.type === 'checkbox' ? el.checked : el.value;
    });
    try {
      S.settings = await api('/settings', { method: 'PUT', body: patch });
      S.settingsDirty = false;
      $('#save-bar').classList.remove('on');
      toast('Đã lưu cài đặt');
      // Đồng bộ lại giá trị đã chuẩn hóa từ máy chủ
      $$('#view [data-s]').forEach((el) => {
        const v = S.settings[el.dataset.s];
        if (el.type === 'checkbox') el.checked = !!v;
        else el.value = v;
      });
    } catch (e) {
      toast(e.message, 'err');
    }
  }

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
      ...Object.entries(MODES).map(([k, m]) => ({ sec: 'Tác vụ mới', icon: m.icon, color: m.color, label: `Cào theo ${m.label.toLowerCase()}`, run: () => { S.mode = k; go('/scrape?mode=' + k); } })),
      { sec: 'Lệnh', icon: 'download', color: 'mint', label: 'Xuất toàn bộ bài viết (CSV)', run: () => download('/api/export/posts.csv') },
      { sec: 'Lệnh', icon: 'download', color: 'mint', label: 'Xuất toàn bộ hồ sơ (CSV)', run: () => download('/api/export/profiles.csv') },
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
    export: (el) => {
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
      if (!(await confirmBox({ title: 'Xóa toàn bộ dữ liệu?', text: 'Tất cả bài viết, hồ sơ và lịch sử tác vụ sẽ bị xóa vĩnh viễn.', ok: 'Xóa hết', danger: true, icon: 'trash' }))) return;
      await api('/clear', { method: 'POST' });
      await loadJobs();
      toast('Đã xóa toàn bộ dữ liệu');
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

  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#palette').classList.contains('on') ? closePalette() : openPalette();
    } else if (e.key === 'Escape') {
      if ($('#palette').classList.contains('on')) closePalette();
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
      if (prev && prev.status === 'running' && j.status !== 'running') {
        if (j.status === 'done') toast(`Xong “${j.label}”: ${j.stats.posts} bài viết`, 'party', { label: 'Xem dữ liệu', run: () => ACTIONS['job-data']({ dataset: { id: j.id } }) });
        else if (j.status === 'failed') toast(`“${j.label}” lỗi: ${j.error}`, 'err');
      }
    });
    es.addEventListener('data', refreshOnData);
    es.onopen = () => { if (S.jobsLoaded) loadJobs().then(() => S.route.id === 'jobs' && drawJobs()); };
  }

  const PAGE_RENDER = { home: renderHome, scrape: renderScrape, jobs: renderJobs, library: renderLibrary, settings: renderSettings };

  /* ---------- Khởi động ---------- */
  drawThemeBtn();
  loadJobs().then(() => { if (S.route.id === 'scrape') drawScrapeJobs(); });
  route();
  connectEvents();
})();
