const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { getPhoneCleanState, savePhoneCleanState } = require('../dataStore');
const phoneCleanJob = require('../phoneCleanJob');
const { digitsOnly, pendingWhere, MAX_ROWS_PER_RUN, MAX_PHONE_DIGITS } = phoneCleanJob;

const router = express.Router();

// จำนวนแถวสูงสุดที่ส่งไปแสดงบนหน้าเว็บ ยอดรวมจริงส่งแยกเป็นตัวเลขต่างหาก
const PREVIEW_LIMIT = 300;

router.get('/status', requireAuth, (req, res) => {
  res.json({
    ok: true,
    state: getPhoneCleanState(),
    maxRowsPerRun: MAX_ROWS_PER_RUN,
    maxPhoneDigits: MAX_PHONE_DIGITS,
    running: phoneCleanJob.isRunning(),
    progress: phoneCleanJob.getProgress(),
  });
});

router.post('/toggle', requireAuth, (req, res) => {
  const enabled = Boolean(req.body && req.body.enabled);
  const state = getPhoneCleanState();
  state.enabled = enabled;
  savePhoneCleanState(state);
  res.json({ ok: true, state });
});

// กดเอง: วนตัดจนไม่เหลือ (ไม่ติดเพดาน 2000 แถวแบบรอบอัตโนมัติ)
// หลายหมื่นแถวใช้เวลานาน จึงสั่งเริ่มแล้วตอบกลับทันที หน้าเว็บดึงความคืบหน้าจาก /status เอา
router.post('/run-now', requireAuth, (req, res) => {
  if (phoneCleanJob.isRunning()) {
    return res.json({ ok: true, started: false, alreadyRunning: true });
  }
  phoneCleanJob.runOnce({ untilDone: true }).catch(() => {});
  res.json({ ok: true, started: true });
});

// รายชื่อที่รอตัด พร้อมค่าที่จะได้หลังตัด (คำนวณด้วยตรรกะเดียวกับตอนรันจริง)
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const [{ pending_count: pendingCount } = { pending_count: 0 }] = await db.query(
      `SELECT COUNT(*) AS pending_count FROM patient p WHERE ${pendingWhere()}`
    );

    const rows = await db.query(
      `SELECT p.hn, p.pname, p.fname, p.lname, p.mobile_phone_number
         FROM patient p
        WHERE ${pendingWhere()}
        ORDER BY p.hn
        LIMIT ${PREVIEW_LIMIT}`
    );

    res.json({
      ok: true,
      total: Number(pendingCount) || 0,
      shown: rows.length,
      previewLimit: PREVIEW_LIMIT,
      items: rows.map((r) => ({
        hn: r.hn,
        name: [r.pname, r.fname, r.lname].filter(Boolean).join(' '),
        oldValue: String(r.mobile_phone_number || ''),
        newValue: digitsOnly(r.mobile_phone_number),
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดรายการที่รอตัดไม่สำเร็จ: ' + err.message });
  }
});

// ประวัติการตัดล่าสุด อ่านจากตาราง log ของแอปเอง ใช้ย้อนดูว่าเบอร์เดิมเป็นอะไร
router.get('/log', requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT l.hn, l.old_value, l.new_value, l.cleaned_at,
              p.pname, p.fname, p.lname
         FROM app_phone_clean_log l
         LEFT JOIN patient p ON p.hn = l.hn
        ORDER BY l.app_phone_clean_log_id DESC
        LIMIT ${PREVIEW_LIMIT}`
    );

    res.json({
      ok: true,
      items: rows.map((r) => ({
        hn: r.hn,
        name: [r.pname, r.fname, r.lname].filter(Boolean).join(' '),
        oldValue: r.old_value,
        newValue: r.new_value,
        cleanedAt: r.cleaned_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดประวัติไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
