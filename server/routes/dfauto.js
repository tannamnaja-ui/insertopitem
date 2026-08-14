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
    const dateParam = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : null;

    const rows = await db.query(
      `SELECT o.vn, o.hn, p.pname, p.fname, p.lname, o.main_dep, dep.department,
           STRING_AGG(DISTINCT idep.name, ', ') AS item_names,
           COUNT(DISTINCT idep.icode) AS item_count,
           COUNT(DISTINCT s.doctor) AS signer_count,
           COUNT(DISTINCT log.doctor || '|' || log.icode) AS logged_count
       FROM ovst o
       JOIN patient p ON p.hn = o.hn
       JOIN app_df_item_department idep ON idep.depcode = o.main_dep
       LEFT JOIN kskdepartment dep ON dep.depcode = o.main_dep
       LEFT JOIN (
         SELECT DISTINCT ds.vn, ds.doctor
         FROM ovst_doctor_sign ds
         JOIN doctor doc ON doc.code = ds.doctor AND doc.position_id = 1
       ) s ON s.vn = o.vn
       LEFT JOIN app_df_auto_log log ON log.vn = o.vn AND log.doctor = s.doctor
       WHERE o.vstdate = ${dateParam ? '?' : 'CURRENT_DATE'}
       GROUP BY o.vn, o.hn, p.pname, p.fname, p.lname, o.main_dep, dep.department
       ORDER BY o.vn`,
      dateParam ? [dateParam] : []
    );

    const items = rows.map((r) => {
      const signerCount = Number(r.signer_count) || 0;
      const loggedCount = Number(r.logged_count) || 0;
      const itemCount = Number(r.item_count) || 0;
      const expectedCount = signerCount * itemCount;
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
        itemNames: r.item_names,
        signerCount,
        status,
      };
    });

    const { status } = req.query;
    const filtered = status && status !== 'all' ? items.filter((it) => it.status === status) : items;

    res.json({ ok: true, items: filtered });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดทะเบียนไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
