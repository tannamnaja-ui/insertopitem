const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, message: 'กรุณากรอก username และ password' });
  }

  try {
    const rows = await db.query(
      'SELECT officer_login_name, officer_login_password_md5, officer_name FROM officer WHERE officer_login_name = ?',
      [username]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({ ok: false, message: 'ไม่พบผู้ใช้งานนี้' });
    }

    const officer = rows[0];
    const inputHash = crypto.createHash('md5').update(password).digest('hex');
    const storedHash = String(officer.officer_login_password_md5 || '').trim().toLowerCase();

    if (inputHash.toLowerCase() !== storedHash) {
      return res.status(401).json({ ok: false, message: 'รหัสผ่านไม่ถูกต้อง' });
    }

    req.session.officer = {
      username: officer.officer_login_name,
      name: officer.officer_name || officer.officer_login_name,
    };

    return res.json({ ok: true, officer: req.session.officer });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ: ' + err.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (req.session && req.session.officer) {
    return res.json({ ok: true, officer: req.session.officer });
  }
  return res.status(401).json({ ok: false });
});

module.exports = router;
