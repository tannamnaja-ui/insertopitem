const express = require('express');
const db = require('../db');
const { getDbConfig } = require('../dataStore');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.get('/search', requireAuth, async (req, res) => {
  const { dateFrom, dateTo, depcode } = req.query;
  if (!dateFrom || !dateTo) {
    return res.status(400).json({ ok: false, message: 'กรุณาระบุช่วงวันที่' });
  }

  const cfg = getDbConfig();
  const isPg = cfg.type === 'postgresql';
  const dateExpr = isPg ? `to_char(o.vstdate, 'YYYY-MM-DD')` : `DATE_FORMAT(o.vstdate, '%Y-%m-%d')`;

  const dateToExclusive = new Date(dateTo);
  dateToExclusive.setDate(dateToExclusive.getDate() + 1);
  const dateToParam = dateToExclusive.toISOString().slice(0, 10);

  const params = [dateFrom, dateToParam];
  let depFilter = '';
  if (depcode) {
    depFilter = ' AND o.main_dep = ?';
    params.push(depcode);
  }

  try {
    const rows = await db.query(
      `SELECT o.vn, o.hn, ${dateExpr} AS vstdate, p.pname, p.fname, p.lname, vs.pdx AS icd10, os.cc, pt.name AS pttype_name
       FROM ovst o
       JOIN patient p ON o.hn = p.hn
       LEFT JOIN vn_stat vs ON o.vn = vs.vn
       LEFT JOIN opdscreen os ON o.vn = os.vn
       LEFT JOIN pttype pt ON o.pttype = pt.pttype
       WHERE o.vstdate >= ? AND o.vstdate < ?${depFilter}
         AND (o.staff <> 'ADD_APP' OR o.staff IS NULL)
       ORDER BY o.vstdate, o.vn
       LIMIT 200`,
      params
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'ค้นหารายชื่อไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
