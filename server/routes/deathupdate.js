const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { getDeathUpdateState, saveDeathUpdateState } = require('../dataStore');
const { dateToStr } = require('../sqlDialect');
const deathUpdateJob = require('../deathUpdateJob');
const { clinicPendingSql, personPendingSql } = deathUpdateJob;

const router = express.Router();

// จำนวนแถวสูงสุดที่ส่งไปแสดงบนหน้าเว็บ ยอดรวมจริงส่งแยกเป็นตัวเลขต่างหาก
const PREVIEW_LIMIT = 300;

router.get('/status', requireAuth, (req, res) => {
  res.json({ ok: true, state: getDeathUpdateState() });
});

router.post('/toggle', requireAuth, (req, res) => {
  const enabled = Boolean(req.body && req.body.enabled);
  const state = getDeathUpdateState();
  state.enabled = enabled;
  saveDeathUpdateState(state);
  res.json({ ok: true, state });
});

router.post('/run-now', requireAuth, async (req, res) => {
  try {
    const summary = await deathUpdateJob.runOnce();
    res.json({ ok: true, summary });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'รันไม่สำเร็จ: ' + err.message });
  }
});

// รายชื่อที่รออัปเดต แยกตามตารางปลายทาง ใช้คิวรี่ชุดเดียวกับตอนรันจริง
// เติมชื่อ-สกุลจาก patient เพื่อให้เจ้าหน้าที่ตรวจสอบก่อนกดรันได้
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const target = req.query.target === 'person' ? 'person' : 'clinicmember';

    const baseSql = target === 'person'
      ? personPendingSql(', p.person_discharge_id AS flag_value')
      : clinicPendingSql(', c.clinic_member_status_id AS flag_value, c.discharge');

    const [{ pending_count: pendingCount } = { pending_count: 0 }] = await db.query(
      `SELECT COUNT(*) AS pending_count FROM (${baseSql}) t`
    );

    const rows = await db.query(
      `SELECT t.*, ${dateToStr('t.death_date')} AS death_date_str,
              pt.pname, pt.fname, pt.lname
         FROM (${baseSql}) t
         LEFT JOIN patient pt ON pt.hn = t.hn
        ORDER BY t.death_date DESC, t.hn
        LIMIT ${PREVIEW_LIMIT}`
    );

    res.json({
      ok: true,
      target,
      total: Number(pendingCount) || 0,
      shown: rows.length,
      previewLimit: PREVIEW_LIMIT,
      items: rows.map((r) => ({
        hn: r.hn,
        name: [r.pname, r.fname, r.lname].filter(Boolean).join(' '),
        deathDate: r.death_date_str,
        flagValue: r.flag_value === null || r.flag_value === undefined ? null : String(r.flag_value),
        discharge: r.discharge === undefined ? null : r.discharge,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดรายการที่รออัปเดตไม่สำเร็จ: ' + err.message });
  }
});

// ประวัติการอัปเดตล่าสุดจากตาราง log ของแอปเอง
router.get('/log', requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT l.hn, l.target_table, ${dateToStr('l.death_date')} AS death_date_str, l.updated_at,
              p.pname, p.fname, p.lname
         FROM app_death_update_log l
         LEFT JOIN patient p ON p.hn = l.hn
        ORDER BY l.app_death_update_log_id DESC
        LIMIT ${PREVIEW_LIMIT}`
    );

    res.json({
      ok: true,
      items: rows.map((r) => ({
        hn: r.hn,
        name: [r.pname, r.fname, r.lname].filter(Boolean).join(' '),
        targetTable: r.target_table,
        deathDate: r.death_date_str,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดประวัติไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
