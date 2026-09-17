const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { getMenuVisibility, saveMenuVisibility } = require('../dataStore');

const router = express.Router();

// รายการกล่องที่ซ่อนอยู่ หน้าเมนูเรียกตัวนี้ก่อนแสดงผลทุกครั้ง
router.get('/visibility', requireAuth, (req, res) => {
  res.json({ ok: true, ...getMenuVisibility() });
});

// บันทึกรายการกล่องที่สั่งซ่อน
// key ของกล่องมาจาก data-menu-key ในหน้าเมนู ฝั่งเซิร์ฟเวอร์ไม่ต้องรู้จักว่ามีกล่องอะไรบ้าง
// เก็บเป็นรายชื่อเฉย ๆ เวลาเพิ่มกล่องใหม่ในอนาคตจึงไม่ต้องแก้ไฟล์นี้
// กรองให้เหลือเฉพาะสตริงสั้น ๆ ที่ไม่ซ้ำกัน กัน payload แปลกปลอมทำให้ไฟล์ตั้งค่าบวม
router.post('/visibility', requireAuth, (req, res) => {
  const raw = (req.body && req.body.hidden) || [];
  if (!Array.isArray(raw)) {
    return res.status(400).json({ ok: false, message: 'รูปแบบข้อมูลไม่ถูกต้อง' });
  }
  const hidden = [...new Set(
    raw.filter((k) => typeof k === 'string' && k.length > 0 && k.length <= 40)
  )].slice(0, 100);

  saveMenuVisibility({ hidden });
  res.json({ ok: true, hidden });
});

module.exports = router;
