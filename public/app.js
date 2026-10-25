/* Scrat Thread by HuyFlou — ứng dụng một trang, không cần build. */
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
        { id: 'compose', path: '/compose', label: 'Đăng bài', icon: 'send', color: 'lemon', sub: 'Viết bằng AI, hẹn giờ đăng Threads' },
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

  const REPEATS = [[0, 'Một lần'], [60, 'Mỗi giờ'], [360, 'Mỗi 6 giờ'], [1440, 'Hằng ngày'], [10080, 'Hằng tuần']];
  const everyLabel = (m) => (REPEATS.find(([v]) => v === m) || [0, `Mỗi ${m} phút`])[1];

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
    jobTab: 'queue',
    schedules: [],
    repeat: store.get('repeat', 0),
    postCache: new Map(),
    loginBusy: false,
    notifs: [],
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

  // Chỉ cho phép link http(s) — chặn javascript:, data:… trong dữ liệu cào về / file khôi phục
  const safeUrl = (u) => {
    try { const x = new URL(String(u || ''), location.href); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; }
  };

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
    if (res.status === 401 && data.auth) {
      // Phiên hết hạn: nhớ trang đang xem rồi chuyển tới trang đăng nhập
      try { sessionStorage.setItem('st-next', location.hash); } catch { /* bỏ qua */ }
      location.href = '/login.html';
    }
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

  /* =====================================================
     Trang: Tổng quan
     ===================================================== */
  async function renderHome() {
    const v = $('#view');
    if (!S.stats) v.innerHTML = `<div class="bento">${'<div class="skel span-3"></div>'.repeat(4)}<div class="skel span-8" style="min-height:260px"></div><div class="skel span-4"></div></div>`;
    try {
      S.stats = await api('/stats?tz=' + new Date().getTimezoneOffset());
      cachePosts(S.stats.topPosts);
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

        ${heatBlock(st.heat)}

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

  const DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const DAY_FULL = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
  const slot = (b) => `${String(b * 3).padStart(2, '0')}–${String(b * 3 + 3).padStart(2, '0')}h`;

  /** Bản đồ nhiệt: tương tác trung bình mỗi bài theo ngày trong tuần × khung giờ. */
  function heatBlock(heat) {
    const head = `<div class="block-head">${tile('calendar', 'peach', 'sm')}<div><h3>Giờ đăng hiệu quả</h3><p>Tương tác trung bình mỗi bài gốc, theo giờ máy bạn</p></div></div>`;
    const cells = heat.flatMap((row, d) => row.map((c, b) => ({ ...c, d, b })));
    const total = cells.reduce((a, c) => a + c.n, 0);
    if (total < 3) return `<section class="block span-12">${head}${empty('Chưa đủ dữ liệu', 'Cần ít nhất 3 bài viết có ngày đăng để tìm khung giờ tốt nhất.', '', true)}</section>`;
    const max = Math.max(1, ...cells.map((c) => c.avg));
    // Khung tốt nhất: ưu tiên ô có từ 2 bài để tránh một bài “ăn may”
    const pool = cells.filter((c) => c.n >= 2).length ? cells.filter((c) => c.n >= 2) : cells.filter((c) => c.n);
    const best = pool.reduce((a, c) => (c.avg > a.avg ? c : a));
    const busiest = cells.reduce((a, c) => (c.n > a.n ? c : a));
    return `<section class="block span-12">${head}
      <div class="heat-wrap">
        <div class="heat" role="table" aria-label="Bản đồ giờ đăng">
          <span></span>${Array.from({ length: 8 }, (_, b) => `<span class="heat-x">${b * 3}h</span>`).join('')}
          ${heat.map((row, d) => `<span class="heat-y">${DAYS[d]}</span>${row.map((c, b) => {
            const lvl = c.n ? 0.15 + 0.85 * (c.avg / max) : 0;
            return `<i class="${c.n ? '' : 'none'} ${best.d === d && best.b === b ? 'best' : ''}" style="--l:${lvl.toFixed(2)}" title="${DAY_FULL[d]}, ${slot(b)}: ${c.n} bài${c.n ? ` · TB ${num(c.avg)} tương tác` : ''}"></i>`;
          }).join('')}`).join('')}
        </div>
        <div class="heat-side">
          <div class="callout c-mint">${ic('party')}<div><b>Khung giờ vàng</b><br>${DAY_FULL[best.d]}, ${slot(best.b)}<br><span class="muted">TB ${num(best.avg)} tương tác · ${best.n} bài${best.n >= 2 ? ' · chỉ xét ô có từ 2 bài' : ''}</span></div></div>
          <div class="callout c-sky">${ic('chart')}<div><b>Đăng nhiều nhất</b><br>${DAY_FULL[busiest.d]}, ${slot(busiest.b)}<br><span class="muted">${busiest.n} bài</span></div></div>
          <div class="heat-legend"><span>Ít</span><i style="--l:.15"></i><i style="--l:.45"></i><i style="--l:.75"></i><i style="--l:1"></i><span>Nhiều</span></div>
        </div>
      </div>
    </section>`;
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
    const heat = S.stats && S.stats.heat;
    if (!heat) return null;
    const cells = heat.flatMap((row, d) => row.map((c, b) => ({ ...c, d, b }))).filter((c) => c.n >= 2);
    if (!cells.length) return null;
    const best = cells.reduce((a, c) => (c.avg > a.avg ? c : a));
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
        <span class="hint">Threads tự tải ảnh từ link này, nên link phải mở được công khai.</span>
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
    const numIn = (k, min, max, step = 1, suffix = '') => `<div style="position:relative"><input class="input" type="number" data-s="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}" />${suffix ? `<span class="muted" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:12px;font-weight:800">${suffix}</span>` : ''}</div>`;

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
          <div class="block-head">${tile('cookie', 'lemon')}<div><h3>Đăng nhập Threads</h3><p>Cần cho tìm kiếm & lấy nhiều bài hơn</p></div><div class="act" id="login-pill"></div></div>
          <div class="row" id="login-actions"></div>
          <details class="adv">
            <summary>${ic('chevron', 'sm')}Dán cookie thủ công</summary>
            <div class="field" style="margin-top:10px">
              <textarea class="textarea" data-s="cookies" placeholder='sessionid=...; csrftoken=...  hoặc JSON xuất từ extension Cookie-Editor' style="min-height:110px">${esc(s.cookies)}</textarea>
              <span class="hint">Dùng khi máy không mở được cửa sổ trình duyệt (vd: chạy trên server). Xuất cookie threads.com bằng extension như Cookie-Editor rồi dán vào đây. Cookie chỉ lưu trên máy bạn.</span>
            </div>
          </details>
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

        <section class="block span-12">
          <div class="block-head">${tile('sparkle', 'lemon')}<div><h3>AI & Đăng bài</h3><p>Khóa chỉ lưu trên máy bạn, không nằm trong file sao lưu</p></div></div>
          <div class="grid-2">
            <div class="field">
              <label for="s-ak">Anthropic API key (Claude)</label>
              <input class="input" id="s-ak" type="password" autocomplete="off" data-s="anthropicApiKey" placeholder="sk-ant-…" value="${esc(s.anthropicApiKey)}" />
              <span class="hint">Tạo tại console.anthropic.com → API Keys. Để trống thì dùng biến môi trường ANTHROPIC_API_KEY.</span>
            </div>
            <div class="field">
              <label for="s-tt">Threads access token</label>
              <input class="input" id="s-tt" type="password" autocomplete="off" data-s="threadsToken" placeholder="THAA…" value="${esc(s.threadsToken)}" />
              <div class="row" style="gap:8px"><button class="btn sm" data-act="threads-check">${ic('shield', 'sm')}Kiểm tra kết nối</button><span id="threads-me"></span></div>
            </div>
          </div>
          <details class="adv">
            <summary>${ic('chevron', 'sm')}Cách lấy Threads access token</summary>
            <ol class="steps" style="margin-top:12px">
              <li><span>Vào <b>developers.facebook.com</b> → Tạo ứng dụng → chọn trường hợp sử dụng <b>“Truy cập Threads API”</b>.</span></li>
              <li><span>Trong phần quyền, bật <b>threads_basic</b>, <b>threads_content_publish</b> và <b>threads_manage_replies</b> (cần để đăng chuỗi thread).</span></li>
              <li><span>Thêm tài khoản Threads của bạn làm <b>Threads Tester</b>, rồi chấp nhận lời mời trong ứng dụng Threads (Cài đặt → Tài khoản → Quyền truy cập website).</span></li>
              <li><span>Dùng <b>User Token Generator</b> trong trang ứng dụng để tạo token, đổi sang token dài hạn (60 ngày) rồi dán vào đây.</span></li>
            </ol>
          </details>
        </section>

        <section class="block span-6">
          <div class="block-head">${tile('box', 'mint')}<div><h3>Dữ liệu</h3><p>Lưu tại data/db.json</p></div></div>
          <div class="row">
            <button class="btn soft" data-act="demo">${ic('party')}Nạp dữ liệu mẫu</button>
            <button class="btn" data-act="backup">${ic('download')}Sao lưu toàn bộ</button>
            <button class="btn" data-act="restore">${ic('refresh')}Khôi phục</button>
            <input type="file" id="restore-file" accept=".json,application/json" hidden />
            <button class="btn danger" data-act="clear-all">${ic('trash')}Xóa toàn bộ</button>
          </div>
          <div class="set-row" style="margin-top:12px;border-top:1px dashed var(--line)" id="auth-row"></div>
        </section>
      </div>
      <div class="bulkbar" id="save-bar">
        <b>Có thay đổi chưa lưu</b>
        <button class="btn sm" data-act="reset-settings">Hoàn tác</button>
        <button class="btn sm" style="background:var(--primary);color:var(--primary-ink)" data-act="save-settings">${ic('check', 'sm')}Lưu cài đặt</button>
      </div>`;

    drawLogin();
    api('/auth').then((a) => {
      const row = $('#auth-row');
      if (!row) return;
      row.innerHTML = a.enabled
        ? `<div class="txt"><b>${ic('shield', 'sm')} Mật khẩu app đang bật</b><span>Đặt bằng biến môi trường APP_PASSWORD</span></div>
           <div class="ctl auto"><button class="btn sm" data-act="app-logout">${ic('x', 'sm')}Thoát</button></div>`
        : `<div class="txt"><b>${ic('shield', 'sm')} Chưa đặt mật khẩu app</b><span>Nếu mở app ra mạng, hãy chạy với <kbd>APP_PASSWORD=…</kbd> để chặn người lạ</span></div>`;
    }).catch(() => {});
    api('/login').then((st) => { S.login = st; drawLogin(); }).catch(() => {});

    $$('#view [data-s]').forEach((el) => {
      el.addEventListener('input', () => {
        S.settingsDirty = true;
        $('#save-bar').classList.add('on');
      });
    });
  }

  function drawLogin() {
    const pill = $('#login-pill');
    if (!pill) return;
    const st = S.login || {};
    pill.innerHTML = st.hasSession
      ? `<span class="status c-mint">Đã đăng nhập</span>`
      : `<span class="status c-slate">${st.cookieCount ? 'Cookie thiếu sessionid' : 'Chưa đăng nhập'}</span>`;
    $('#login-actions').innerHTML = S.loginBusy
      ? `<button class="btn primary" disabled><span class="spin"></span>Đang chờ bạn đăng nhập trong cửa sổ…</button>
         <button class="btn ghost" data-act="login-cancel">Hủy</button>`
      : `<button class="btn primary" data-act="login">${ic('external')}${st.hasSession ? 'Đăng nhập lại' : 'Đăng nhập bằng cửa sổ trình duyệt'}</button>
         ${st.hasSession ? `<button class="btn danger" data-act="logout">${ic('x')}Đăng xuất</button>` : ''}`;
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
     Popover & thông báo
     ===================================================== */
  function closePops(except) {
    $$('.pop.on').forEach((p) => {
      if (p === except) return;
      p.classList.remove('on');
      const b = p.previousElementSibling;
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }
  function togglePop(pop, btn) {
    const on = !pop.classList.contains('on');
    closePops(pop);
    pop.classList.toggle('on', on);
    btn.setAttribute('aria-expanded', on);
    return on;
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.pop-wrap')) closePops();
  }, true);

  async function loadNotifs() {
    try { S.notifs = await api('/notifications'); } catch { /* bỏ qua */ }
    drawBell();
  }

  function drawBell() {
    const n = S.notifs.filter((x) => !x.read).length;
    $('#bell-count').textContent = n ? (n > 9 ? '9+' : n) : '';
    $('#bell-btn').setAttribute('aria-label', n ? `Thông báo (${n} chưa đọc)` : 'Thông báo');
  }

  function drawNotifPop() {
    const pop = $('#notif-pop');
    const unread = S.notifs.some((x) => !x.read);
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    pop.innerHTML = `
      <div class="pop-head"><b>Thông báo</b>
        ${unread ? `<button class="btn sm ghost" data-act="notif-read-all">${ic('check', 'sm')}Đã đọc hết</button>` : ''}
        ${S.notifs.length ? `<button class="btn sm ghost icon" data-act="notif-clear" aria-label="Xóa tất cả" title="Xóa tất cả">${ic('trash', 'sm')}</button>` : ''}
      </div>
      <div class="pop-body">${S.notifs.length ? S.notifs.map((n) => `
        <button class="notif ${n.read ? '' : 'unread'}" data-act="notif-open" data-id="${n.id}">
          ${tile(n.kind === 'error' ? 'warn' : 'bell', n.kind === 'error' ? 'pink' : 'peach', 'sm')}
          <span class="grow"><b>${esc(n.title)}</b>${n.body ? `<span>${esc(n.body)}</span>` : ''}<small>${ago(n.t)}</small></span>
        </button>`).join('')
        : empty('Chưa có thông báo', 'Khi hồ sơ bạn theo dõi bằng lịch tự động có bài mới, Scrat sẽ báo ở đây.', '', true)}</div>
      ${perm === 'default' ? `<div class="pop-foot"><button class="btn sm soft" data-act="notif-browser">${ic('bell', 'sm')}Bật thông báo trên máy tính</button></div>` : ''}`;
  }

  function openNotifs() {
    const pop = $('#notif-pop');
    drawNotifPop();
    if (!pop.classList.contains('on')) togglePop(pop, $('#bell-btn'));
  }
  $('#bell-btn').onclick = () => {
    drawNotifPop();
    togglePop($('#notif-pop'), $('#bell-btn'));
  };

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
      toast('Đang tải bản sao lưu (không kèm cookie đăng nhập)', 'info');
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
        if (!(await confirmBox({ title: 'Khôi phục từ bản sao lưu?', text: `Dữ liệu trong “${esc(file.name)}” sẽ được gộp vào kho hiện tại, không xóa gì. Lịch tự động nhập vào sẽ ở trạng thái tắt.`, ok: 'Khôi phục', icon: 'refresh', color: 'sky' }))) return;
        try {
          const r = await api('/restore', { method: 'POST', body: data });
          toast(`Đã khôi phục ${num(r.posts)} bài, ${num(r.profiles)} hồ sơ, ${num(r.schedules)} lịch${r.skipped ? ` (bỏ qua ${r.skipped} mục lỗi)` : ''}`, 'party');
          loadSchedules();
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
    'ed-submit': async () => {
      if (C.editor.when === 'now' && !(await confirmBox({ title: 'Đăng ngay lên Threads?', text: 'Bài sẽ hiện công khai trên tài khoản Threads của bạn.', ok: 'Đăng ngay', icon: 'send', color: 'mint' }))) return;
      submitEditor(C.editor.when);
    },
    'ob-publish': async (el) => {
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
})();
