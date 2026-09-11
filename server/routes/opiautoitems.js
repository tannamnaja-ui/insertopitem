const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { itemDisplayName } = require('../sqlDialect');

const router = express.Router();

// รายการค่าบริการทั้งหมด จัดกลุ่มตาม icode พร้อมห้องตรวจที่ผูกไว้
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT ad.app_opiauto_item_department_id, ad.icode,
           ${itemDisplayName({ stored: 'ad.name', dg: 'd' })} AS name,
           ad.hipdata_code,
           ad.depcode, k.department,
           COALESCE(d.unitprice, n.price) AS price
       FROM app_opiauto_item_department ad
       LEFT JOIN kskdepartment k ON k.depcode = ad.depcode
       LEFT JOIN drugitems d ON d.icode = ad.icode
       LEFT JOIN nondrugitems n ON n.icode = ad.icode
       LEFT JOIN s_drugitems sd ON sd.icode = ad.icode
       ORDER BY ${itemDisplayName({ stored: 'ad.name', dg: 'd' })}, k.department`
    );

    const byIcode = new Map();
    for (const row of rows) {
      if (!byIcode.has(row.icode)) {
        // กลุ่มสิทธิเป็นค่าของทั้ง template (ทุกแถวของ icode เดียวกันเก็บค่าเดียวกัน)
        // ว่าง = ไม่จำกัด ดีดให้ทุกกลุ่มสิทธิ
        byIcode.set(row.icode, {
          icode: row.icode,
          name: row.name,
          price: row.price,
          hipdataCodes: (row.hipdata_code || '').split(',').map((c) => c.trim()).filter(Boolean),
          departments: [],
        });
      }
      byIcode.get(row.icode).departments.push({
        id: row.app_opiauto_item_department_id,
        depcode: row.depcode,
        department: row.department,
      });
    }

    res.json({ ok: true, items: Array.from(byIcode.values()) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดรายการค่าบริการไม่สำเร็จ: ' + err.message });
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
      `SELECT app_opiauto_item_department_id FROM app_opiauto_item_department WHERE icode = ? AND depcode = ?`,
      [icode, depcode]
    );
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, message: 'รายการนี้ถูกผูกกับห้องนี้อยู่แล้ว' });
    }
    // ถ้า icode นี้เคยตั้งกลุ่มสิทธิไว้แล้ว ให้แถวใหม่ใช้ค่าเดียวกัน จะได้ไม่หลุดจากกันภายใน template
    const [cfg] = await db.query(
      `SELECT hipdata_code FROM app_opiauto_item_department WHERE icode = ? LIMIT 1`,
      [icode]
    );
    await db.query(
      `INSERT INTO app_opiauto_item_department (icode, name, depcode, hipdata_code) VALUES (?, ?, ?, ?)`,
      [icode, name, depcode, (cfg && cfg.hipdata_code) || null]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'เพิ่มรายการไม่สำเร็จ: ' + err.message });
  }
});

// ตั้งกลุ่มสิทธิของทั้ง template (ทุกแถวที่เป็น icode นี้)
// ส่ง codes เป็นอาร์เรย์ของ pttype.hipdata_code — ส่งอาร์เรย์ว่างมาคือไม่จำกัด ดีดให้ทุกกลุ่มสิทธิ
router.put('/pttype/:icode', requireAuth, async (req, res) => {
  const codes = Array.isArray(req.body && req.body.codes) ? req.body.codes : [];
  const cleaned = [...new Set(
    codes.map((c) => String(c || '').trim()).filter((c) => c && !c.includes(','))
  )];

  try {
    const existing = await db.query(
      `SELECT app_opiauto_item_department_id FROM app_opiauto_item_department WHERE icode = ?`,
      [req.params.icode]
    );
    if (existing.length === 0) {
      return res.status(404).json({ ok: false, message: 'ไม่พบ template ของรายการนี้' });
    }
    await db.query(
      `UPDATE app_opiauto_item_department SET hipdata_code = ? WHERE icode = ?`,
      [cleaned.length ? cleaned.join(',') : null, req.params.icode]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'บันทึกกลุ่มสิทธิไม่สำเร็จ: ' + err.message });
  }
});

// ลบทั้ง template ของค่าบริการรายการนี้ (ลบห้องตรวจที่ผูกไว้ทั้งหมดในคราวเดียว)
router.delete('/template/:icode', requireAuth, async (req, res) => {
  try {
    await db.query(`DELETE FROM app_opiauto_item_department WHERE icode = ?`, [req.params.icode]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'ลบ template ไม่สำเร็จ: ' + err.message });
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
      `SELECT icode FROM app_opiauto_item_department WHERE app_opiauto_item_department_id = ?`,
      [req.params.id]
    );
    if (!current) {
      return res.status(404).json({ ok: false, message: 'ไม่พบรายการนี้' });
    }
    const existing = await db.query(
      `SELECT app_opiauto_item_department_id FROM app_opiauto_item_department WHERE icode = ? AND depcode = ? AND app_opiauto_item_department_id <> ?`,
      [current.icode, depcode, req.params.id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, message: 'รายการนี้ถูกผูกกับห้องนี้อยู่แล้ว' });
    }
    await db.query(`UPDATE app_opiauto_item_department SET depcode = ? WHERE app_opiauto_item_department_id = ?`, [depcode, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'แก้ไขรายการไม่สำเร็จ: ' + err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query(`DELETE FROM app_opiauto_item_department WHERE app_opiauto_item_department_id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'ลบรายการไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
