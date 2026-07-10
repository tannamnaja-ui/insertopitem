const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db.query('SELECT code, name FROM doctor ORDER BY name');
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดรายชื่อแพทย์ไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
