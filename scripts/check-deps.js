'use strict';

// Thoát mã 1 nếu thiếu bất kỳ thư viện nào trong package.json — file khởi chạy
// dùng để biết khi nào cần chạy lại npm install (vd: bản mới thêm thư viện).
const path = require('path');
const root = path.join(__dirname, '..');
const { dependencies = {} } = require(path.join(root, 'package.json'));
const missing = Object.keys(dependencies).filter((name) => {
  try {
    require.resolve(`${name}/package.json`, { paths: [root] });
    return false;
  } catch (e) {
    // Gói chặn đường dẫn package.json trong "exports" vẫn là đã cài
    return e.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED';
  }
});
if (missing.length) {
  console.log(`Thiếu thư viện: ${missing.join(', ')}`);
  process.exit(1);
}
