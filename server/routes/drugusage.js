const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const search = (req.query.q || '').trim();
  if (search.length < 1) {
    return res.json({ ok: true, items: [] });
  }
  try {
    const rows = await db.query(
      `SELECT drugusage, shortlist FROM drugusage
       WHERE status = 'Y' AND LOWER(shortlist) LIKE LOWER(?)
       ORDER BY shortlist
       LIMIT 50`,
      [`%${search}%`]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'ค้นหาวิธีใช้ยาไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
