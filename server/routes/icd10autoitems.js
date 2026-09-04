const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { itemDisplayName } = require('../sqlDialect');

const router = express.Router();

// รายการค่าบริการทั้งหมด จัดกลุ่มตาม icode พร้อม ICD10 ที่ผูกไว้
router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT m.app_icd10_opi_item_id, m.icode, ${itemDisplayName({ stored: 'm.name' })} AS name,
              m.icd10, m.diagtype,
              m.doctor_mode, m.doctor, doc.name AS doctor_name,
              i.name AS icd10_name
         FROM app_icd10_opi_item m
         LEFT JOIN icd101 i ON i.code = m.icd10
         LEFT JOIN doctor doc ON doc.code = m.doctor
         LEFT JOIN s_drugitems sd ON sd.icode = m.icode
         LEFT JOIN drugitems dg ON dg.icode = m.icode
        ORDER BY ${itemDisplayName({ stored: 'm.name' })}, m.icd10`
    );

    const byIcode = new Map();
    for (const row of rows) {
      if (!byIcode.has(row.icode)) {
        // การตั้งค่าแพทย์เป็นของทั้ง template (ทุกแถวของ icode เดียวกันเก็บค่าเดียวกัน)
        byIcode.set(row.icode, {
          icode: row.icode,
          name: row.name,
          doctorMode: row.doctor_mode === 'fixed' ? 'fixed' : 'order',
          doctor: row.doctor || '',
          doctorName: row.doctor_name || '',
          diagnoses: [],
        });
      }
      byIcode.get(row.icode).diagnoses.push({
        id: row.app_icd10_opi_item_id,
        icd10: row.icd10,
        icd10Name: row.icd10_name,
        diagtype: row.diagtype,
      });
    }

    res.json({ ok: true, items: Array.from(byIcode.values()) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดรายการ ICD10 ไม่สำเร็จ: ' + err.message });
  }
});

// ผูก icode ค่าบริการเข้ากับรหัส ICD10 (1 icode ผูกได้หลาย ICD10, 1 ICD10 ผูกได้หลาย icode)
router.post('/', requireAuth, async (req, res) => {
  const { icode, name, icd10, diagtype } = req.body || {};
  if (!icode || !name || !icd10) {
    return res.status(400).json({ ok: false, message: 'กรุณาเลือกรายการค่าบริการและรหัส ICD10' });
  }
  try {
    const existing = await db.query(
      `SELECT app_icd10_opi_item_id FROM app_icd10_opi_item WHERE icode = ? AND icd10 = ?`,
      [icode, icd10]
    );
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, message: 'รายการนี้ถูกผูกกับรหัส ICD10 นี้อยู่แล้ว' });
    }
    // ถ้า icode นี้เคยตั้งค่าแพทย์ไว้แล้ว ให้แถวใหม่ใช้ค่าเดียวกัน จะได้ไม่หลุดจากกันภายใน template
    const [cfg] = await db.query(
      `SELECT doctor_mode, doctor FROM app_icd10_opi_item WHERE icode = ? LIMIT 1`,
      [icode]
    );
    await db.query(
      `INSERT INTO app_icd10_opi_item (icode, name, icd10, diagtype, doctor_mode, doctor) VALUES (?, ?, ?, ?, ?, ?)`,
      [icode, name, icd10, diagtype || '4', (cfg && cfg.doctor_mode) || 'order', (cfg && cfg.doctor) || null]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'เพิ่มรายการไม่สำเร็จ: ' + err.message });
  }
});

// ตั้งค่าแพทย์ผู้วินิจฉัยของทั้ง template (ทุกแถวที่เป็น icode นี้)
//   fixed = ฟิกชื่อแพทย์ที่เลือกไว้
//   order = ใช้แพทย์จากการสั่งยา/สั่งค่าบริการรายการนั้น (opitemrece.doctor)
router.put('/doctor/:icode', requireAuth, async (req, res) => {
  const { doctorMode, doctor } = req.body || {};
  const mode = doctorMode === 'fixed' ? 'fixed' : 'order';
  if (mode === 'fixed' && !doctor) {
    return res.status(400).json({ ok: false, message: 'กรุณาเลือกชื่อแพทย์ที่ต้องการฟิก' });
  }
  try {
    const existing = await db.query(
      `SELECT app_icd10_opi_item_id FROM app_icd10_opi_item WHERE icode = ?`,
      [req.params.icode]
    );
    if (existing.length === 0) {
      return res.status(404).json({ ok: false, message: 'ไม่พบ template ของรายการนี้' });
    }
    await db.query(
      `UPDATE app_icd10_opi_item SET doctor_mode = ?, doctor = ? WHERE icode = ?`,
      [mode, mode === 'fixed' ? doctor : null, req.params.icode]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'บันทึกการตั้งค่าแพทย์ไม่สำเร็จ: ' + err.message });
  }
});

// ลบทั้ง template ของค่าบริการรายการนี้ (ลบรหัส ICD10 ที่ผูกไว้ทั้งหมดในคราวเดียว)
router.delete('/template/:icode', requireAuth, async (req, res) => {
  try {
    await db.query(`DELETE FROM app_icd10_opi_item WHERE icode = ?`, [req.params.icode]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'ลบ template ไม่สำเร็จ: ' + err.message });
  }
});

// แก้ไขรหัส ICD10 ของ binding ที่มีอยู่แล้ว (icode เดิมไม่เปลี่ยน)
router.put('/:id', requireAuth, async (req, res) => {
  const { icd10 } = req.body || {};
  if (!icd10) {
    return res.status(400).json({ ok: false, message: 'กรุณาเลือกรหัส ICD10' });
  }
  try {
    const [current] = await db.query(
      `SELECT icode FROM app_icd10_opi_item WHERE app_icd10_opi_item_id = ?`,
      [req.params.id]
    );
    if (!current) {
      return res.status(404).json({ ok: false, message: 'ไม่พบรายการนี้' });
    }
    const existing = await db.query(
      `SELECT app_icd10_opi_item_id FROM app_icd10_opi_item WHERE icode = ? AND icd10 = ? AND app_icd10_opi_item_id <> ?`,
      [current.icode, icd10, req.params.id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, message: 'รายการนี้ถูกผูกกับรหัส ICD10 นี้อยู่แล้ว' });
    }
    await db.query(`UPDATE app_icd10_opi_item SET icd10 = ? WHERE app_icd10_opi_item_id = ?`, [icd10, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'แก้ไขรายการไม่สำเร็จ: ' + err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query(`DELETE FROM app_icd10_opi_item WHERE app_icd10_opi_item_id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'ลบรายการไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
