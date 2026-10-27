'use strict';

/** Bọc handler đồng bộ: trả JSON, lỗi thành 400 kèm thông báo. */
const wrap = (fn) => (req, res) => {
  try {
    const out = fn(req, res);
    if (out !== undefined) res.json(out);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

module.exports = { wrap };
