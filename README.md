# 🌰 Scrat Thread by HuyFlou

Ứng dụng cào dữ liệu **Threads** (threads.com) và **viết bài bằng AI, hẹn giờ đăng tự động**, chạy trên máy của bạn. Giao diện dạng block, bộ icon duotone tự vẽ, có chế độ sáng/tối và dùng tốt trên điện thoại.

## Tính năng

| Menu | Chức năng |
| --- | --- |
| **Tổng quan** | Ô *cào nhanh* tự nhận diện @tên / link / từ khóa, thống kê, biểu đồ 14 ngày, **bản đồ giờ đăng hiệu quả** (ngày × khung 3 giờ, chỉ ra khung giờ vàng), tác giả và hashtag nổi bật, bài hot nhất |
| **Cào dữ liệu** | 4 chế độ: **Hồ sơ**, **Bài viết** (kèm trả lời), **Từ khóa**, **Hàng loạt** (trộn tài khoản và link) |
| **Đăng bài** | Nhập ý tưởng → Claude viết **3 phương án** (chọn giọng văn, độ dài, bài đơn hoặc chuỗi thread, ngôn ngữ, hashtag/emoji, học giọng văn từ một tài khoản trong kho). Chọn mô hình **Opus 5.5 / Sonnet 5.5 / Haiku 5.5** hoặc **Tự động** theo nội dung. Sửa bản đăng với bộ đếm 500 ký tự (emoji tính theo byte như Threads), thêm ảnh, **đăng ngay** hoặc **hẹn giờ** (có gợi ý *giờ vàng* từ bản đồ giờ đăng). Tab **Hàng đợi đăng**: nháp, đã hẹn, đã đăng, lỗi; tự thử lại khi lỗi tạm thời |
| **Tác vụ** | Tab **Hàng đợi**: chạy song song có giới hạn, tiến độ và nhật ký cập nhật trực tiếp (SSE), dừng / chạy lại. Tab **Lịch tự động**: cào lại định kỳ (mỗi giờ, 6 giờ, hằng ngày, hằng tuần), bật/tắt, đổi chu kỳ, chạy ngay |
| **Kho dữ liệu** | Bài viết và hồ sơ; ngăn chi tiết hồ sơ có biểu đồ người theo dõi theo thời gian, lượt thích trung bình, tỉ lệ tương tác, bài nổi bật và nút *Theo dõi hằng ngày*; tìm kiếm không dấu, lọc theo tác giả / media / lượt thích / ngày, dạng thẻ hoặc bảng, chọn nhiều để xuất, xóa hoặc **cào trả lời hàng loạt** cho các bài đã chọn, menu **Xuất file**: **Excel (.xlsx)** có dòng tiêu đề cố định và bộ lọc, **CSV** (UTF-8 BOM), **JSON** |
| **Cài đặt** | **Đăng nhập bằng cửa sổ trình duyệt** (tự lấy cookie) hoặc dán cookie thủ công, chạy ẩn trình duyệt, độ trễ, số lần cuộn, proxy, User-Agent, giao diện, dữ liệu mẫu, **sao lưu / khôi phục toàn bộ** (gộp, không xóa dữ liệu hiện có; không kèm cookie) |

**Thông báo** (biểu tượng chuông): khi lịch tự động tìm thấy bài mới, khi bài hẹn giờ đã đăng hoặc đăng lỗi, Scrat báo trong app và — nếu bạn cho phép — báo ra máy tính khi đang ở tab khác.

Phím tắt: `Ctrl/⌘ K` mở bảng lệnh (dán link vào là cào luôn) · `/` tìm trong kho · `Ctrl Enter` chạy cào · `Esc` đóng.

## Cài đặt & chạy

Cần **Node.js 18 trở lên** ([tải bản LTS](https://nodejs.org)).

**Cách nhanh nhất:** nhấp đúp vào `start.bat` (Windows) hoặc `start.command` (macOS). Lần đầu file sẽ tự cài thư viện và Chromium, sau đó tự mở trình duyệt. Trên Linux thì chạy `./start.sh`.

Hoặc chạy bằng lệnh:

```bash
npm install
npm run setup      # tải Chromium cho Playwright (chỉ cần chạy một lần)
npm start          # mở http://127.0.0.1:3000
```

Biến môi trường: `PORT` (mặc định 3000), `HOST` (mặc định 127.0.0.1), `DATA_FILE` (mặc định `data/db.json`), `APP_PASSWORD` (bật mật khẩu cho app).

### Mở app cho người khác dùng qua mạng

Mặc định app chỉ nghe ở `127.0.0.1`, tức chỉ máy của bạn vào được. Nếu muốn mở ra mạng nội bộ hoặc Internet, **hãy đặt mật khẩu**, vì app chứa cookie đăng nhập Threads của bạn:

```bash
HOST=0.0.0.0 APP_PASSWORD='mật-khẩu-của-bạn' npm start
```

- Người vào app sẽ phải nhập mật khẩu ở trang đăng nhập. Phiên đăng nhập kéo dài 30 ngày và vẫn còn sau khi khởi động lại app. Đổi mật khẩu thì mọi phiên cũ bị đăng xuất.
- Mỗi IP được thử sai tối đa 8 lần trong 5 phút.
- Khi chạy qua Internet, nên đặt app sau HTTPS (ví dụ Caddy, Nginx hoặc Cloudflare Tunnel).

### Viết bài bằng AI & đăng lên Threads

Vào **Cài đặt → AI & Đăng bài** và nhập 2 khóa. Cả hai chỉ lưu trên máy bạn, giao diện chỉ thấy 4 ký tự cuối, và không có trong file sao lưu.

1. **Anthropic API key** để Claude viết bài: tạo tại [console.anthropic.com](https://console.anthropic.com). Bạn cũng có thể đặt biến môi trường `ANTHROPIC_API_KEY` thay vì nhập ở đây.
2. **Threads access token** để đăng bài qua [Threads API chính thức](https://developers.facebook.com/docs/threads):
   - Tạo app trên developers.facebook.com, chọn *Truy cập Threads API*.
   - Bật quyền `threads_basic`, `threads_content_publish`, và `threads_manage_replies` (quyền này cần để đăng chuỗi thread).
   - Thêm tài khoản của bạn làm *Threads Tester*.
   - Tạo token, rồi đổi sang token dài hạn (60 ngày).

   Bấm **Kiểm tra kết nối** để xem token đã dùng được chưa và hạn mức còn lại (250 bài / 24 giờ).

**Chế độ Tự động chọn mô hình như sau:**
- Ý tưởng ngắn, cần bài ngắn: **Haiku 5.5**, nhanh và rẻ.
- Nội dung vừa phải: **Sonnet 5.5**.
- Chuỗi thread, nội dung dài trên 1.500 ký tự, hoặc học giọng văn từ bài mẫu: **Opus 5.5**.

Với Opus và Sonnet, nếu bộ lọc an toàn từ chối nhầm, Anthropic tự chạy lại yêu cầu trên mô hình dự phòng (`fallbacks: "default"`).

**Đăng bài:**
- Bài hẹn giờ chỉ được đăng khi app đang chạy.
- Lỗi tạm thời (mạng chập chờn, bị giới hạn tốc độ) được thử lại tối đa 3 lần.
- Nếu app tắt giữa lúc đang đăng, bài chuyển sang trạng thái *Lỗi* để bạn kiểm tra trước khi thử lại, tránh đăng trùng.
- Chuỗi thread bị lỗi giữa chừng sẽ đăng tiếp từ phần còn thiếu.
- Ảnh đính kèm phải là link `https` công khai, vì Threads tự tải ảnh từ link đó.

Kiểm thử: `npm test`.

## Cách hoạt động

- Playwright mở Threads bằng Chromium (chặn ảnh và font để chạy nhanh hơn).
- Dữ liệu được đọc từ JSON ẩn trong trang (`script[type="application/json"]`) và từ các phản hồi `/graphql` khi cuộn trang. Bộ trích xuất (`src/extract.js`) duyệt toàn bộ cây JSON và nhận diện object có dạng bài viết hoặc hồ sơ, nên vẫn chạy được khi Threads đổi cấu trúc.
- Kết quả được lưu vào `data/db.json` ngay trong lúc cào. Ảnh từ CDN của Meta được tải qua `/api/img` vì CDN chặn tải từ trang khác.

## Lưu ý

- Khi **chưa đăng nhập**, Threads chỉ hiện khoảng 10–25 bài mới nhất của mỗi hồ sơ, và **tìm kiếm không dùng được**. Để lấy nhiều hơn, vào **Cài đặt → Đăng nhập Threads** và bấm *Đăng nhập bằng cửa sổ trình duyệt*: một cửa sổ Chromium mở ra, bạn đăng nhập như bình thường và Scrat tự lưu cookie. Nếu app chạy trên server không có màn hình, hãy xuất cookie bằng extension (ví dụ Cookie-Editor) rồi dán vào ô *Dán cookie thủ công*.
- **Lịch tự động** chỉ chạy khi app đang mở. Nếu lượt trước chưa xong thì lượt mới bị bỏ qua. Mỗi lần cào hồ sơ, số người theo dõi được ghi lại để vẽ biểu đồ.
- Đặt độ trễ hợp lý và chỉ chạy 1–2 tác vụ cùng lúc để tránh bị chặn.
- Chỉ thu thập dữ liệu công khai và tuân thủ điều khoản sử dụng của Threads cũng như quy định về dữ liệu cá nhân.

## Cấu trúc

```
server.js          API Express + SSE + proxy ảnh
src/extract.js     Trích xuất & chuẩn hóa bài viết / hồ sơ (thuần, có test)
src/scraper.js     Điều khiển trình duyệt Playwright
src/jobs.js        Hàng đợi tác vụ, tiến độ, nhật ký
src/schedules.js   Lịch cào tự động theo chu kỳ
src/notify.js      Quy tắc tạo thông báo khi lịch có bài mới / lỗi
src/xlsx.js        Ghi file Excel .xlsx không cần thư viện ngoài
src/ai.js          Viết bài bằng Claude, chọn mô hình theo nội dung
src/threads-api.js Đăng bài / chuỗi thread qua Threads API, đếm ký tự kiểu Threads
src/outbox.js      Hàng đợi đăng bài, hẹn giờ, thử lại
src/auth.js        Mật khẩu app (cookie ký HMAC, giới hạn số lần thử)
src/store.js       Lưu trữ bằng file JSON (ghi nguyên tử)
src/query.js       Lọc, sắp xếp, xuất CSV/JSON/Excel
public/            Giao diện (HTML/CSS/JS thuần, không cần build)
```
