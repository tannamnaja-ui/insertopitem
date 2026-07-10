const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const search = (req.query.q || '').trim();
  if (search.length < 2) {
    return res.json({ ok: true, items: [] });
  }
  try {
    const rows = await db.query(
      `SELECT t.icode, t.name, t.price, t.income, t.cost FROM (
         SELECT
           s.icode,
           CONCAT(s.name, ' ', COALESCE(d.strength, ''), ' ', COALESCE(d.units, '')) AS name,
           COALESCE(d.unitprice, n.price) AS price,
           s.income,
           s.cost
         FROM s_drugitems s
         LEFT JOIN drugitems    d ON s.icode = d.icode
         LEFT JOIN nondrugitems n ON s.icode = n.icode
         WHERE s.istatus = 'Y'
       ) t
       WHERE LOWER(t.name) LIKE LOWER(?) OR LOWER(t.icode) LIKE LOWER(?)
       ORDER BY
         CASE
           WHEN LOWER(t.name) LIKE LOWER(?) THEN 0
           WHEN LOWER(t.icode) LIKE LOWER(?) THEN 1
           ELSE 2
         END,
         t.name
       LIMIT 150`,
      [`%${search}%`, `%${search}%`, `${search}%`, `${search}%`]
    );
    res.json({ ok: true, items: rows });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'ค้นหารายการไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
