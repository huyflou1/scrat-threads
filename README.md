# 🌰 Scrat Threads

Ứng dụng cào dữ liệu **Threads** (threads.com) chạy trên máy của bạn. Giao diện dạng block, bộ icon duotone tự vẽ, có chế độ sáng/tối và dùng tốt trên điện thoại.

## Tính năng

| Menu | Chức năng |
| --- | --- |
| **Tổng quan** | Ô *cào nhanh* tự nhận diện @tên / link / từ khóa, thống kê, biểu đồ 14 ngày, tác giả và hashtag nổi bật, bài hot nhất |
| **Cào dữ liệu** | 4 chế độ: **Hồ sơ**, **Bài viết** (kèm trả lời), **Từ khóa**, **Hàng loạt** (trộn tài khoản và link) |
| **Tác vụ** | Hàng đợi chạy song song có giới hạn, tiến độ và nhật ký cập nhật trực tiếp (SSE), dừng / chạy lại |
| **Kho dữ liệu** | Bài viết và hồ sơ; tìm kiếm không dấu, lọc theo tác giả / media / lượt thích / ngày, dạng thẻ hoặc bảng, chọn nhiều để xuất hoặc xóa, xuất **CSV** (mở được bằng Excel) và **JSON** |
| **Cài đặt** | Chạy ẩn trình duyệt, độ trễ, số lần cuộn, proxy, User-Agent, cookie đăng nhập, giao diện, dữ liệu mẫu |

Phím tắt: `Ctrl/⌘ K` mở bảng lệnh (dán link vào là cào luôn) · `/` tìm trong kho · `Ctrl Enter` chạy cào · `Esc` đóng.

## Cài đặt & chạy

Cần **Node.js 18 trở lên**.

```bash
npm install
npm run setup      # tải Chromium cho Playwright (chỉ cần chạy một lần)
npm start          # mở http://127.0.0.1:3000
```

Biến môi trường: `PORT` (mặc định 3000), `HOST` (mặc định 127.0.0.1), `DATA_FILE` (mặc định `data/db.json`).

Kiểm thử: `npm test`.

## Cách hoạt động

- Playwright mở Threads bằng Chromium (chặn ảnh và font để chạy nhanh hơn).
- Dữ liệu được đọc từ JSON ẩn trong trang (`script[type="application/json"]`) và từ các phản hồi `/graphql` khi cuộn trang. Bộ trích xuất (`src/extract.js`) duyệt toàn bộ cây JSON và nhận diện object có dạng bài viết hoặc hồ sơ, nên vẫn chạy được khi Threads đổi cấu trúc.
- Kết quả được lưu vào `data/db.json` ngay trong lúc cào. Ảnh từ CDN của Meta được tải qua `/api/img` vì CDN chặn tải từ trang khác.

## Lưu ý

- Khi **chưa đăng nhập**, Threads chỉ hiện khoảng 10–25 bài mới nhất của mỗi hồ sơ, và **tìm kiếm không dùng được**. Để lấy nhiều hơn: đăng nhập threads.com trên trình duyệt, xuất cookie bằng extension (ví dụ Cookie-Editor), rồi dán vào **Cài đặt → Đăng nhập**.
- Đặt độ trễ hợp lý và chỉ chạy 1–2 tác vụ cùng lúc để tránh bị chặn.
- Chỉ thu thập dữ liệu công khai và tuân thủ điều khoản sử dụng của Threads cũng như quy định về dữ liệu cá nhân.

## Cấu trúc

```
server.js          API Express + SSE + proxy ảnh
src/extract.js     Trích xuất & chuẩn hóa bài viết / hồ sơ (thuần, có test)
src/scraper.js     Điều khiển trình duyệt Playwright
src/jobs.js        Hàng đợi tác vụ, tiến độ, nhật ký
src/store.js       Lưu trữ bằng file JSON (ghi nguyên tử)
src/query.js       Lọc, sắp xếp, xuất CSV/JSON
public/            Giao diện (HTML/CSS/JS thuần, không cần build)
```
