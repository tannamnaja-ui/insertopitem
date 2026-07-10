const express = require('express');
const { getDbConfig, saveDbConfig } = require('../dataStore');
const db = require('../db');
const schema = require('../schema');

const router = express.Router();

router.get('/', (req, res) => {
  const cfg = getDbConfig();
  res.json({ ok: true, config: { ...cfg, password: '' } });
});

router.post('/test', async (req, res) => {
  const cfg = req.body || {};
  if (!cfg.type || !cfg.host || !cfg.port || !cfg.database || !cfg.user) {
    return res.status(400).json({ ok: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  const result = await db.testConnection(cfg);
  if (result.ok) {
    return res.json({ ok: true, message: 'เชื่อมต่อฐานข้อมูลสำเร็จ' });
  }
  return res.status(400).json({ ok: false, message: 'เชื่อมต่อไม่สำเร็จ: ' + result.message });
});

router.post('/save', (req, res) => {
  const cfg = req.body || {};
  if (!cfg.type || !cfg.host || !cfg.port || !cfg.database || !cfg.user) {
    return res.status(400).json({ ok: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
  }
  saveDbConfig({
    type: cfg.type,
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password || '',
  });
  db.resetPool();
  res.json({ ok: true });
});

router.get('/table-status', async (req, res) => {
  try {
    const result = await schema.checkStatus();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'ตรวจสอบตารางไม่สำเร็จ: ' + err.message });
  }
});

router.post('/create-table', async (req, res) => {
  try {
    await schema.createTable();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'สร้างตารางไม่สำเร็จ: ' + err.message });
  }
});

router.post('/add-columns', async (req, res) => {
  try {
    await schema.addMissingColumns();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'เพิ่มฟิลด์ไม่สำเร็จ: ' + err.message });
  }
});

module.exports = router;
