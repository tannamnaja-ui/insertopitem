const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// กลุ่มสิทธิทั้งหมดที่มีอยู่จริงในตาราง pttype (จัดกลุ่มด้วย hipdata_code)
// ไม่มีตารางชื่อกลุ่มแยกใน HOSxP จึงส่งรหัส จำนวนสิทธิในกลุ่ม และตัวอย่างชื่อสิทธิไปให้เลือก
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT hipdata_code, COUNT(*) AS pttype_count, MIN(name) AS sample_name
         FROM pttype
        WHERE hipdata_code IS NOT NULL AND hipdata_code <> ''
        GROUP BY hipdata_code
        ORDER BY hipdata_code`
    );
    res.json({
      ok: true,
      items: rows.map((r) => ({
        code: r.hipdata_code,
        pttypeCount: Number(r.pttype_count) || 0,
        sampleName: r.sample_name || '',
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดกลุ่มสิทธิไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
