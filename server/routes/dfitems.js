const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// รายการค่าธรรมเนียมทั้งหมด จัดกลุ่มตาม icode พร้อมห้องตรวจที่ผูกไว้
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT ad.app_df_item_department_id, ad.icode, ad.name, ad.depcode, k.department,
           COALESCE(d.unitprice, n.price) AS price
       FROM app_df_item_department ad
       LEFT JOIN kskdepartment k ON k.depcode = ad.depcode
       LEFT JOIN drugitems d ON d.icode = ad.icode
       LEFT JOIN nondrugitems n ON n.icode = ad.icode
       ORDER BY ad.name, k.department`
    );

    const byIcode = new Map();
    for (const row of rows) {
      if (!byIcode.has(row.icode)) {
        byIcode.set(row.icode, { icode: row.icode, name: row.name, price: row.price, departments: [] });
      }
      byIcode.get(row.icode).departments.push({
        id: row.app_df_item_department_id,
        depcode: row.depcode,
        department: row.department,
      });
    }

    res.json({ ok: true, items: Array.from(byIcode.values()) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดรายการ DF ไม่สำเร็จ: ' + err.message });
  }
});

// ผูก icode นี้เข้ากับห้องตรวจที่ระบุ (1 icode ผูกได้หลายห้อง, 1 ห้องผูกได้หลาย icode)
router.post('/', requireAuth, async (req, res) => {
  const { icode, name, depcode } = req.body || {};
  if (!icode || !name || !depcode) {
    return res.status(400).json({ ok: false, message: 'กรุณาเลือกรายการและห้องตรวจ' });
  }
  try {
    const existing = await db.query(
      `SELECT app_df_item_department_id FROM app_df_item_department WHERE icode = ? AND depcode = ?`,
      [icode, depcode]
    );
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, message: 'รายการนี้ถูกผูกกับห้องนี้อยู่แล้ว' });
    }
    await db.query(`INSERT INTO app_df_item_department (icode, name, depcode) VALUES (?, ?, ?)`, [icode, name, depcode]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'เพิ่มรายการไม่สำเร็จ: ' + err.message });
  }
});

// แก้ไขห้องตรวจของ binding ที่มีอยู่แล้ว (icode เดิมไม่เปลี่ยน)
router.put('/:id', requireAuth, async (req, res) => {
  const { depcode } = req.body || {};
  if (!depcode) {
    return res.status(400).json({ ok: false, message: 'กรุณาเลือกห้องตรวจ' });
  }
  try {
    const [current] = await db.query(
      `SELECT icode FROM app_df_item_department WHERE app_df_item_department_id = ?`,
      [req.params.id]
    );
    if (!current) {
      return res.status(404).json({ ok: false, message: 'ไม่พบรายการนี้' });
    }
    const existing = await db.query(
      `SELECT app_df_item_department_id FROM app_df_item_department WHERE icode = ? AND depcode = ? AND app_df_item_department_id <> ?`,
      [current.icode, depcode, req.params.id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, message: 'รายการนี้ถูกผูกกับห้องนี้อยู่แล้ว' });
    }
    await db.query(`UPDATE app_df_item_department SET depcode = ? WHERE app_df_item_department_id = ?`, [depcode, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'แก้ไขรายการไม่สำเร็จ: ' + err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query(`DELETE FROM app_df_item_department WHERE app_df_item_department_id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'ลบรายการไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
