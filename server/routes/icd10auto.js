const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { getIcd10AutoState, saveIcd10AutoState } = require('../dataStore');
const { groupConcatDistinct, dateToStr, concat, itemDisplayName } = require('../sqlDialect');
const icd10AutoJob = require('../icd10AutoJob');

const router = express.Router();

router.get('/status', requireAuth, (req, res) => {
  res.json({ ok: true, state: getIcd10AutoState() });
});

router.post('/toggle', requireAuth, (req, res) => {
  const enabled = Boolean(req.body && req.body.enabled);
  const state = getIcd10AutoState();
  state.enabled = enabled;
  saveIcd10AutoState(state);
  res.json({ ok: true, state });
});

router.post('/run-now', requireAuth, async (req, res) => {
  try {
    const { dateFrom, dateTo, icode } = req.body || {};
    const summary = await icd10AutoJob.runOnce({ dateFrom, dateTo, icode });
    res.json({ ok: true, summary });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'รันไม่สำเร็จ: ' + err.message });
  }
});

// รายการค่าบริการทั้งหมดที่ถูกผูก ICD10 ไว้ (ใช้เป็นตัวเลือกให้หน้าเว็บ)
router.get('/items', requireAuth, async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT m.icode, MAX(${itemDisplayName({ stored: 'm.name' })}) AS name,
              COUNT(DISTINCT m.icd10) AS icd10_count
         FROM app_icd10_opi_item m
         LEFT JOIN s_drugitems sd ON sd.icode = m.icode
         LEFT JOIN drugitems dg ON dg.icode = m.icode
        GROUP BY m.icode
        ORDER BY MAX(${itemDisplayName({ stored: 'm.name' })}), m.icode`
    );
    res.json({
      ok: true,
      items: rows.map((r) => ({
        icode: r.icode,
        name: r.name || r.icode,
        icd10Count: Number(r.icd10_count) || 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลดรายการค่าบริการไม่สำเร็จ: ' + err.message });
  }
});

router.get('/registry', requireAuth, async (req, res) => {
  try {
    const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
    let from = isDate(req.query.dateFrom) ? req.query.dateFrom : null;
    let to = isDate(req.query.dateTo) ? req.query.dateTo : from;
    if (from && to && from > to) [from, to] = [to, from];
    const useRange = Boolean(from && to);
    const item = typeof req.query.icode === 'string' && req.query.icode.trim() ? req.query.icode.trim() : null;

    const conditions = [useRange ? 'o.vstdate BETWEEN ? AND ?' : 'o.vstdate = CURRENT_DATE'];
    const dateParams = useRange ? [from, to] : [];
    if (item) conditions.push('m.icode = ?');
    const whereParams = item ? [...dateParams, item] : dateParams;

    const rows = await db.query(
      `SELECT o.vn, o.hn, ${dateToStr('o.vstdate')} AS vstdate, p.pname, p.fname, p.lname,
           o.main_dep, dep.department,
           ${groupConcatDistinct(concat('m.icode', "' -> '", 'm.icd10'))} AS pair_names,
           COUNT(DISTINCT m.icd10) AS item_count,
           COUNT(DISTINCT d.icd10) AS logged_count
       FROM ovst o
       JOIN patient p ON p.hn = o.hn
       JOIN opitemrece opi ON opi.vn = o.vn
       JOIN app_icd10_opi_item m ON m.icode = opi.icode
       LEFT JOIN kskdepartment dep ON dep.depcode = o.main_dep
       LEFT JOIN ovstdiag d ON d.vn = o.vn AND d.icd10 = m.icd10
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
        itemNames: r.pair_names,
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
