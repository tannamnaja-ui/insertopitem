const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { hasTaskAccess } = require('../permissions');
const { getApiTokenConfig } = require('../dataStore');

const router = express.Router();

const SETTINGS_ACCESS_TASK_ID = '77';

async function verifyCredentials(username, password) {
  const rows = await db.query(
    'SELECT officer_id, officer_login_name, officer_login_password_md5, officer_name FROM officer WHERE officer_login_name = ?',
    [username]
  );
  if (!rows || rows.length === 0) {
    return { ok: false, message: 'ไม่พบผู้ใช้งานนี้' };
  }

  const officer = rows[0];
  const inputHash = crypto.createHash('md5').update(password).digest('hex');
  const storedHash = String(officer.officer_login_password_md5 || '').trim().toLowerCase();

  if (inputHash.toLowerCase() !== storedHash) {
    return { ok: false, message: 'รหัสผ่านไม่ถูกต้อง' };
  }

  return { ok: true, officer };
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, message: 'กรุณากรอก username และ password' });
  }

  try {
    const result = await verifyCredentials(username, password);
    if (!result.ok) {
      return res.status(401).json({ ok: false, message: result.message });
    }

    req.session.officer = {
      username: result.officer.officer_login_name,
      name: result.officer.officer_name || result.officer.officer_login_name,
    };

    return res.json({ ok: true, officer: req.session.officer });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ: ' + err.message });
  }
});

router.post('/check-settings-access', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, message: 'กรุณากรอก username และ password' });
  }

  try {
    const result = await verifyCredentials(username, password);
    if (!result.ok) {
      return res.status(401).json({ ok: false, message: result.message });
    }

    const allowed = await hasTaskAccess(result.officer.officer_login_name, SETTINGS_ACCESS_TASK_ID);

    if (!allowed) {
      return res.json({ ok: true, allowed: false, message: 'ไม่มีสิทธิ์เข้าถึงหน้านี้ กรุณาติดต่อ Admin ผู้ดูแลระบบ' });
    }

    req.session.officer = {
      username: result.officer.officer_login_name,
      name: result.officer.officer_name || result.officer.officer_login_name,
    };

    return res.json({ ok: true, allowed: true });
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
    const { token } = getApiTokenConfig();
    return res.json({ ok: true, officer: req.session.officer, apiToken: token || null });
  }
  return res.status(401).json({ ok: false });
});

module.exports = router;
