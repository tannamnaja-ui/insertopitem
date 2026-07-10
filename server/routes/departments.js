const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT depcode, department FROM kskdepartment WHERE depcode_active = 'Y' ORDER BY department`
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดรายชื่อห้องที่สั่งไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
