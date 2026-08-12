const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT a.app_df_auto_id, a.icode, a.name, COALESCE(d.unitprice, n.price) AS price
       FROM app_df_auto a
       LEFT JOIN drugitems d ON a.icode = d.icode
       LEFT JOIN nondrugitems n ON a.icode = n.icode
       ORDER BY a.name`
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดรายการ DF ไม่สำเร็จ: ' + err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { icode, name } = req.body || {};
  if (!icode || !name) {
    return res.status(400).json({ ok: false, message: 'กรุณาเลือกรายการก่อน' });
  }
  try {
    const existing = await db.query(`SELECT app_df_auto_id FROM app_df_auto WHERE icode = ?`, [icode]);
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, message: 'มีรายการนี้ในรายการ DF อัตโนมัติอยู่แล้ว' });
    }
    await db.query(`INSERT INTO app_df_auto (icode, name) VALUES (?, ?)`, [icode, name]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'เพิ่มรายการไม่สำเร็จ: ' + err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query(`DELETE FROM app_df_auto WHERE app_df_auto_id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'ลบรายการไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
