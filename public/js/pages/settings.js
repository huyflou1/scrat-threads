/* Scrat Thread by HuyFlou — Trang: Cài đặt. */
import { S, store } from '../state.js';
import { $, $$, api, empty, esc, tile } from '../utils.js';
import { toast } from '../ui.js';

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
            <div class="row" style="gap:8px"><button class="btn sm" data-act="ai-check">${ic('shield', 'sm')}Kiểm tra key & mô hình</button><span id="ai-check-out" class="row" style="gap:6px"></span></div>
          </div>
          <div class="field">
            <label for="s-tt">Threads access token <span class="muted">(không bắt buộc nếu đã đăng nhập Threads)</span></label>
            <input class="input" id="s-tt" type="password" autocomplete="off" data-s="threadsToken" placeholder="THAA…" value="${esc(s.threadsToken)}" />
            <div class="row" style="gap:8px"><button class="btn sm" data-act="threads-check">${ic('shield', 'sm')}Kiểm tra kết nối</button><span id="threads-me"></span></div>
          </div>
        </div>
        <div class="set-row" style="margin-top:12px;border-top:1px dashed var(--line)">
          <div class="txt"><b>Cách đăng bài</b><span>Tự động: có token thì dùng Threads API, không thì dùng phiên đăng nhập Threads ở trên</span></div>
          <div class="ctl" style="width:240px"><select class="select" data-s="postMethod">
            ${[['auto', 'Tự động'], ['browser', 'Phiên đăng nhập (trình duyệt)'], ['api', 'Threads API (token)']].map(([v, l]) => `<option value="${v}" ${s.postMethod === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
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
        <div class="block-head">${tile('box', 'mint')}<div><h3>Dữ liệu</h3><p>Lưu tại data/scrat.db (SQLite)</p></div></div>
        <div class="row">
          <button class="btn soft" data-act="demo">${ic('party')}Nạp dữ liệu mẫu</button>
          <button class="btn" data-act="backup">${ic('download')}Sao lưu toàn bộ</button>
          <button class="btn" data-act="restore">${ic('refresh')}Khôi phục</button>
          <input type="file" id="restore-file" accept=".json,application/json" hidden />
          <button class="btn danger" data-act="clear-all">${ic('trash')}Xóa dữ liệu…</button>
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
  if (S.route.query.focus === 'threads') {
    // Chạy sau route() (route cuộn về đầu trang khi render xong)
    setTimeout(() => {
      const login = $('#login-actions');
      const sec = login && login.closest('section');
      if (!sec) return;
      sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
      sec.classList.add('flash');
    }, 80);
  }
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

export { renderSettings, drawLogin, saveSettings };
