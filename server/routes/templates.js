const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

async function fetchGroupedTemplates() {
  const rows = await db.query(
    `SELECT template_opitem_id, template_name, icode, name, shortlist, drugusage, price, qty, sum_price, staff, income, cost
     FROM template_opitem
     ORDER BY template_opitem_id`
  );

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.template_name)) {
      map.set(row.template_name, {
        id: row.template_name,
        name: row.template_name,
        staff: row.staff,
        items: [],
      });
    }
    map.get(row.template_name).items.push({
      icode: row.icode,
      name: row.name,
      price: Number(row.price) || 0,
      qty: Number(row.qty) || 1,
      usage: row.shortlist || '',
      usageCode: row.drugusage || '',
      income: row.income || '',
      cost: Number(row.cost) || 0,
    });
  }
  return Array.from(map.values());
}

async function insertTemplateRows(name, items, staff) {
  for (const it of items) {
    const price = Number(it.price) || 0;
    const qty = Number(it.qty) || 1;
    await db.query(
      `INSERT INTO template_opitem (template_name, icode, name, shortlist, drugusage, price, qty, sum_price, staff, income, cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, it.icode, it.name, it.usage || '', it.usageCode || '', price, qty, price * qty, staff, it.income || '', Number(it.cost) || 0]
    );
  }
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const templates = await fetchGroupedTemplates();
    res.json({ ok: true, templates });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'โหลด Template ไม่สำเร็จ: ' + err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { name, items } = req.body || {};
  if (!name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: 'กรุณาใส่ชื่อ template และเลือกรายการอย่างน้อย 1 รายการ' });
  }

  try {
    const existing = await db.query(
      `SELECT DISTINCT template_name FROM template_opitem WHERE LOWER(TRIM(template_name)) = LOWER(TRIM(?))`,
      [name]
    );
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, message: 'ชื่อ Template นี้มีอยู่แล้ว กรุณาตั้งชื่ออื่น' });
    }

    await insertTemplateRows(name, items, req.session.officer.username);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'บันทึก Template ไม่สำเร็จ: ' + err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const { name, items } = req.body || {};
  if (!name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, message: 'กรุณาใส่ชื่อ template และเลือกรายการอย่างน้อย 1 รายการ' });
  }

  try {
    await db.query('DELETE FROM template_opitem WHERE template_name = ?', [req.params.id]);
    await insertTemplateRows(name, items, req.session.officer.username);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'บันทึกการแก้ไขไม่สำเร็จ: ' + err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM template_opitem WHERE template_name = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'ลบ Template ไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
