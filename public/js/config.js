/* Scrat Thread by HuyFlou — Cấu hình menu & hằng số. */

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

export { NAV, PAGES, MODES, STATUS, REPEATS, everyLabel, AV_COLORS, PAGE_SIZE };
