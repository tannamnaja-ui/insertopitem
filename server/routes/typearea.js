const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { getTypeAreaState, saveTypeAreaState } = require('../dataStore');
const typeAreaJob = require('../typeAreaJob');
const { pendingSql, countPending, TARGETS } = typeAreaJob;

const router = express.Router();

// แสดงทุกคนแบบแบ่งหน้า หน้าละ PAGE_SIZE แถว (ส่งทั้งตารางทีเดียวอาจเป็นแสนแถว)
const PAGE_SIZE = 500;
const LOG_LIMIT = 300;

router.get('/status', requireAuth, (req, res) => {
  res.json({
    ok: true,
    state: getTypeAreaState(),
    running: typeAreaJob.isRunning(),
    progress: typeAreaJob.getProgress(),
  });
});

router.post('/toggle', requireAuth, (req, res) => {
  const enabled = Boolean(req.body && req.body.enabled);
  const state = getTypeAreaState();
  state.enabled = enabled;
  saveTypeAreaState(state);
  res.json({ ok: true, state });
});

// อัพเดททุกคนที่ยังไม่เป็น 4 ทั้งตาราง ไม่เกี่ยวกับหน้าที่เปิดดูอยู่
// คนไข้หลักแสนใช้เวลาหลายนาที จึงสั่งเริ่มแล้วตอบกลับทันที หน้าเว็บดึงความคืบหน้าจาก /status เอา
router.post('/run-now', requireAuth, (req, res) => {
  if (typeAreaJob.isRunning()) {
    return res.json({ ok: true, started: false, alreadyRunning: true });
  }
  typeAreaJob.runOnce().catch(() => {});
  res.json({ ok: true, started: true });
});

// รายชื่อที่ยังไม่เป็น 4 ใช้เงื่อนไขชุดเดียวกับตอนรันจริง
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const target = req.query.target === 'person' ? 'person' : 'patient';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const total = await countPending(target);
    const rows = await db.query(
      `${pendingSql(target, ', p.pname, p.fname, p.lname')}
        ORDER BY p.${TARGETS[target].key}
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`
    );

    res.json({
      ok: true,
      target,
      total,
      page,
      pageSize: PAGE_SIZE,
      items: rows.map((r) => ({
        hn: r.hn,
        rowKey: r.row_key,
        name: [r.pname, r.fname, r.lname].filter(Boolean).join(' '),
        oldValue: r.old_value == null ? null : String(r.old_value),
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
      `SELECT l.hn, l.target_table, l.old_value, l.updated_at,
              pt.pname, pt.fname, pt.lname
         FROM app_type_area_log l
         LEFT JOIN patient pt ON pt.hn = l.hn
        ORDER BY l.app_type_area_log_id DESC
        LIMIT ${LOG_LIMIT}`
    );

    res.json({
      ok: true,
      items: rows.map((r) => ({
        hn: r.hn,
        name: [r.pname, r.fname, r.lname].filter(Boolean).join(' '),
        targetTable: r.target_table,
        oldValue: r.old_value,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดประวัติไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
