#!/usr/bin/env bash
# Khởi chạy Scrat Threads: tự cài thư viện lần đầu rồi mở trình duyệt.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Chưa có Node.js. Tải bản LTS tại https://nodejs.org rồi chạy lại."
  read -r -p "Nhấn Enter để đóng…" _; exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "❌ Cần Node.js 18 trở lên (máy đang có $(node -v))."
  read -r -p "Nhấn Enter để đóng…" _; exit 1
fi

if [ ! -f node_modules/.scrat-ready ]; then
  echo "🌰 Lần đầu chạy: đang cài thư viện và trình duyệt Chromium (vài phút)…"
  npm install && npx playwright install chromium && touch node_modules/.scrat-ready || {
    echo "❌ Cài đặt thất bại — kiểm tra kết nối mạng rồi chạy lại."
    read -r -p "Nhấn Enter để đóng…" _; exit 1
  }
fi

OPEN_BROWSER=1 node server.js
