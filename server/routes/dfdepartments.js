const express = require('express');
const db = require('../db');
const { getDbConfig } = require('../dataStore');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const TABLE_NAME = 'kskdepartment';
const COLUMN_NAME = 'df_auto';

async function ensureDfAutoColumn() {
  const cfg = getDbConfig();
  const rows = cfg.type === 'postgresql'
    ? await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
        [TABLE_NAME, COLUMN_NAME]
      )
    : await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [TABLE_NAME, COLUMN_NAME]
      );
  if (rows.length === 0) {
    await db.query(`ALTER TABLE ${TABLE_NAME} ADD COLUMN ${COLUMN_NAME} CHAR(1)`);
  }
}

router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureDfAutoColumn();
    const rows = await db.query(
      `SELECT depcode, department, df_auto FROM kskdepartment WHERE depcode_active = 'Y' ORDER BY department`
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดรายชื่อห้องไม่สำเร็จ: ' + err.message });
  }
});

router.post('/:depcode', requireAuth, async (req, res) => {
  try {
    const { depcode } = req.params;
    const dfAuto = req.body.df_auto === 'Y' ? 'Y' : 'N';
    await ensureDfAutoColumn();
    await db.query(`UPDATE kskdepartment SET df_auto = ? WHERE depcode = ?`, [dfAuto, depcode]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'บันทึกค่าไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
