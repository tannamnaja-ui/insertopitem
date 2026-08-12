const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { getDfAutoState, saveDfAutoState } = require('../dataStore');
const dfAutoJob = require('../dfAutoJob');

const router = express.Router();

router.get('/status', requireAuth, (req, res) => {
  res.json({ ok: true, state: getDfAutoState() });
});

router.post('/toggle', requireAuth, (req, res) => {
  const enabled = Boolean(req.body && req.body.enabled);
  const state = getDfAutoState();
  state.enabled = enabled;
  saveDfAutoState(state);
  res.json({ ok: true, state });
});

router.post('/run-now', requireAuth, async (req, res) => {
  try {
    const summary = await dfAutoJob.runOnce();
    res.json({ ok: true, summary });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'รันไม่สำเร็จ: ' + err.message });
  }
});

router.get('/registry', requireAuth, async (req, res) => {
  try {
    const deps = await db.query(`SELECT depcode FROM kskdepartment WHERE df_auto = 'Y' AND depcode_active = 'Y'`);
    const depcodes = deps.map((d) => d.depcode);
    if (!depcodes.length) {
      return res.json({ ok: true, items: [], itemCount: 0 });
    }
    const [{ item_count: itemCount } = { item_count: 0 }] = await db.query(
      `SELECT COUNT(*) AS item_count FROM app_df_auto`
    );
    const depPlaceholders = depcodes.map(() => '?').join(',');

    const rows = await db.query(
      `SELECT o.vn, o.hn, p.pname, p.fname, p.lname, o.main_dep, dep.department,
           COUNT(DISTINCT s.doctor) AS signer_count,
           COUNT(DISTINCT log.doctor || '|' || log.icode) AS logged_count
       FROM ovst o
       JOIN patient p ON p.hn = o.hn
       LEFT JOIN kskdepartment dep ON dep.depcode = o.main_dep
       LEFT JOIN (
         SELECT DISTINCT o2.vn, o2.doctor
         FROM opitemrece o2
         JOIN doctor doc ON doc.code = o2.doctor
         WHERE o2.vstdate = CURRENT_DATE
           AND o2.doctor IS NOT NULL AND o2.doctor <> ''
           AND (o2.idr IS NULL OR o2.idr <> 'DF_AUTO')
       ) s ON s.vn = o.vn
       LEFT JOIN app_df_auto_log log ON log.vn = o.vn AND log.doctor = s.doctor
       WHERE o.vstdate = CURRENT_DATE
         AND o.main_dep IN (${depPlaceholders})
       GROUP BY o.vn, o.hn, p.pname, p.fname, p.lname, o.main_dep, dep.department
       ORDER BY o.vn`,
      [...depcodes]
    );

    const items = rows.map((r) => {
      const signerCount = Number(r.signer_count) || 0;
      const loggedCount = Number(r.logged_count) || 0;
      const expectedCount = signerCount * Number(itemCount || 0);
      let status = 'no_signer';
      if (signerCount > 0) {
        status = expectedCount > 0 && loggedCount >= expectedCount ? 'done' : 'pending';
      }
      return {
        vn: r.vn,
        hn: r.hn,
        name: [r.pname, r.fname, r.lname].filter(Boolean).join(' '),
        depcode: r.main_dep,
        department: r.department,
        signerCount,
        status,
      };
    });

    const { status } = req.query;
    const filtered = status && status !== 'all' ? items.filter((it) => it.status === status) : items;

    res.json({ ok: true, items: filtered, itemCount: Number(itemCount || 0) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดทะเบียนไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
