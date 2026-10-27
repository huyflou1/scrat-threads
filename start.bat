@echo off
chcp 65001 >nul
rem Khởi chạy Scrat Thread by HuyFlou: tự cài thư viện lần đầu rồi mở trình duyệt.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Chưa có Node.js. Tải bản LTS tại https://nodejs.org rồi chạy lại.
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo Cần Node.js 22.13 trở lên. Tải bản LTS mới tại https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\.scrat-ready" (
  echo Lần đầu chạy: đang cài thư viện và trình duyệt Chromium, vui lòng chờ vài phút...
  call npm install || goto :fail
  call npx playwright install chromium || goto :fail
  type nul > "node_modules\.scrat-ready"
) else (
  rem Bản mới có thể thêm thư viện — cài phần còn thiếu
  node scripts\check-deps.js
  if errorlevel 1 (
    echo Đang cài thêm thư viện cho bản mới...
    call npm install || goto :fail
  )
)

set OPEN_BROWSER=1
node server.js
pause
exit /b 0

:fail
echo Cài đặt thất bại - kiểm tra kết nối mạng rồi chạy lại.
pause
exit /b 1
