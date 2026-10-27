/* Scrat Thread by HuyFlou — Trang: Tổng quan. */
import { MODES, STATUS } from '../config.js';
import { S } from '../state.js';
import { $, ago, api, avatar, compact, detect, empty, esc, num, tile, verified } from '../utils.js';
import { startJob } from '../pages/scrape.js';
import { cachePosts } from '../pages/library.js';

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

      ${heatBlock(st.heat, st.best)}

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
function heatBlock(heat, best) {
  const head = `<div class="block-head">${tile('calendar', 'peach', 'sm')}<div><h3>Giờ đăng hiệu quả</h3><p>Bài gốc so với mức tương tác thường của chính tác giả, theo giờ máy bạn</p></div></div>`;
  const cells = heat.flatMap((row, d) => row.map((c, b) => ({ ...c, d, b })));
  const total = cells.reduce((a, c) => a + c.n, 0);
  if (total < 3) return `<section class="block span-12">${head}${empty('Chưa đủ dữ liệu', 'Cần ít nhất 3 bài viết có ngày đăng để tìm khung giờ tốt nhất.', '', true)}</section>`;
  const lo = Math.min(...cells.filter((c) => c.n).map((c) => c.score));
  const hi = Math.max(...cells.map((c) => c.score));
  const busiest = cells.reduce((a, c) => (c.n > a.n ? c : a));
  const CONF = { high: ['c-mint', 'Độ tin cậy cao'], medium: ['c-lemon', 'Độ tin cậy vừa'], low: ['c-pink', 'Ít dữ liệu, chỉ để tham khảo'] };
  const lift = (x) => `${x.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}×`;
  const bestBox = best
    ? `<div class="callout c-mint">${ic('party')}<div><b>Khung giờ vàng</b><br>${DAY_FULL[best.d]}, ${slot(best.b)}<br><span class="muted">Gấp ${lift(best.lift)} mức thường · trung vị ${num(best.med)} tương tác · ${best.n} bài</span><br><span class="status ${CONF[best.confidence][0]}" style="margin-top:6px">${CONF[best.confidence][1]}</span></div></div>`
    : `<div class="callout c-lemon">${ic('info')}<div><b>Chưa tìm được giờ vàng</b><br><span class="muted">Cần ít nhất một khung giờ có từ 2 bài. Hãy cào thêm bài.</span></div></div>`;
  return `<section class="block span-12">${head}
    <div class="heat-wrap">
      <div class="heat" role="table" aria-label="Bản đồ giờ đăng">
        <span></span>${Array.from({ length: 8 }, (_, b) => `<span class="heat-x">${b * 3}h</span>`).join('')}
        ${heat.map((row, d) => `<span class="heat-y">${DAYS[d]}</span>${row.map((c, b) => {
          const lvl = c.n ? 0.15 + 0.85 * (hi > lo ? (c.score - lo) / (hi - lo) : 1) : 0;
          return `<i class="${c.n ? '' : 'none'} ${best && best.d === d && best.b === b ? 'best' : ''}" style="--l:${lvl.toFixed(2)}" title="${DAY_FULL[d]}, ${slot(b)}: ${c.n} bài${c.n ? ` · gấp ${lift(c.lift)} mức thường · trung vị ${num(c.med)} tương tác` : ''}"></i>`;
        }).join('')}`).join('')}
      </div>
      <div class="heat-side">
        ${bestBox}
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

export { renderHome, drawHome, DAYS, DAY_FULL, slot, heatBlock, statBlock, homeJobs };
