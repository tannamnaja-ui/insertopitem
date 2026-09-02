const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { getOpiAutoState, saveOpiAutoState } = require('../dataStore');
const opiAutoJob = require('../opiAutoJob');

const router = express.Router();

router.get('/status', requireAuth, (req, res) => {
  res.json({ ok: true, state: getOpiAutoState() });
});

router.post('/toggle', requireAuth, (req, res) => {
  const enabled = Boolean(req.body && req.body.enabled);
  const state = getOpiAutoState();
  state.enabled = enabled;
  saveOpiAutoState(state);
  res.json({ ok: true, state });
});

router.post('/run-now', requireAuth, async (req, res) => {
  try {
    const { dateFrom, dateTo, depcode } = req.body || {};
    const summary = await opiAutoJob.runOnce({ dateFrom, dateTo, depcode });
    res.json({ ok: true, summary });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'รันไม่สำเร็จ: ' + err.message });
  }
});

// ห้องตรวจทั้งหมดที่ถูกผูกไว้ใน template ค่าบริการ (ใช้เป็นตัวเลือกให้หน้าเว็บ)
router.get('/departments', requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT ad.depcode, MAX(k.department) AS department, COUNT(DISTINCT ad.icode) AS item_count
         FROM app_opiauto_item_department ad
         LEFT JOIN kskdepartment k ON k.depcode = ad.depcode
         GROUP BY ad.depcode
         ORDER BY MAX(k.department), ad.depcode`
    );
    res.json({
      ok: true,
      items: rows.map((r) => ({
        depcode: r.depcode,
        department: r.department || r.depcode,
        itemCount: Number(r.item_count) || 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดรายชื่อห้องตรวจไม่สำเร็จ: ' + err.message });
  }
});

router.get('/registry', requireAuth, async (req, res) => {
  try {
    const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
    let from = isDate(req.query.dateFrom) ? req.query.dateFrom : null;
    let to = isDate(req.query.dateTo) ? req.query.dateTo : from;
    if (from && to && from > to) [from, to] = [to, from];
    const useRange = Boolean(from && to);
    const dep = typeof req.query.depcode === 'string' && req.query.depcode.trim() ? req.query.depcode.trim() : null;

    const conditions = [useRange ? 'o.vstdate BETWEEN ? AND ?' : 'o.vstdate = CURRENT_DATE'];
    const dateParams = useRange ? [from, to] : [];
    if (dep) conditions.push('o.main_dep = ?');
    const whereParams = dep ? [...dateParams, dep] : dateParams;

    const rows = await db.query(
      `SELECT o.vn, o.hn, TO_CHAR(o.vstdate, 'YYYY-MM-DD') AS vstdate, p.pname, p.fname, p.lname, o.main_dep, dep.department,
           STRING_AGG(DISTINCT idep.name, ', ') AS item_names,
           COUNT(DISTINCT idep.icode) AS item_count,
           COUNT(DISTINCT opi.icode) AS logged_count
       FROM ovst o
       JOIN patient p ON p.hn = o.hn
       JOIN app_opiauto_item_department idep ON idep.depcode = o.main_dep
       LEFT JOIN kskdepartment dep ON dep.depcode = o.main_dep
       LEFT JOIN opitemrece opi ON opi.vn = o.vn AND opi.icode = idep.icode
       WHERE ${conditions.join(' AND ')}
       GROUP BY o.vn, o.hn, o.vstdate, p.pname, p.fname, p.lname, o.main_dep, dep.department
       ORDER BY o.vstdate, o.vn`,
      whereParams
    );

    const items = rows.map((r) => {
      const loggedCount = Number(r.logged_count) || 0;
      const itemCount = Number(r.item_count) || 0;
      return {
        vn: r.vn,
        hn: r.hn,
        vstdate: r.vstdate,
        name: [r.pname, r.fname, r.lname].filter(Boolean).join(' '),
        depcode: r.main_dep,
        department: r.department,
        itemNames: r.item_names,
        itemCount,
        loggedCount,
        status: itemCount > 0 && loggedCount >= itemCount ? 'done' : 'pending',
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
