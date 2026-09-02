const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// ค้นหารหัสวินิจฉัย ICD10 จากตาราง icd101 (ค้นได้ทั้งรหัสและชื่อโรค)
router.get('/', requireAuth, async (req, res) => {
  const search = (req.query.q || '').trim();
  if (search.length < 2) {
    return res.json({ ok: true, items: [] });
  }
  try {
    const rows = await db.query(
      `SELECT code, name
         FROM icd101
        WHERE LOWER(code) LIKE LOWER(?) OR LOWER(name) LIKE LOWER(?)
        ORDER BY
          CASE
            WHEN LOWER(code) LIKE LOWER(?) THEN 0
            WHEN LOWER(name) LIKE LOWER(?) THEN 1
            ELSE 2
          END,
          code
        LIMIT 150`,
      [`%${search}%`, `%${search}%`, `${search}%`, `${search}%`]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'ค้นหารหัส ICD10 ไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
