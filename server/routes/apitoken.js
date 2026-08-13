const express = require('express');
const crypto = require('crypto');
const { getApiTokenConfig, saveApiTokenConfig } = require('../dataStore');

const router = express.Router();

function generateDigits(count) {
  let digits = '';
  for (let i = 0; i < count; i++) {
    digits += crypto.randomInt(0, 10).toString();
  }
  return digits;
}

router.get('/', (req, res) => {
  res.json({ ok: true, config: getApiTokenConfig() });
});

router.post('/generate', (req, res) => {
  const hospitalCode = String((req.body && req.body.hospitalCode) || '').trim();
  if (!hospitalCode) {
    return res.status(400).json({ ok: false, message: 'กรุณาระบุรหัสสถานพยาบาล' });
  }
  const token = hospitalCode + generateDigits(10);
  saveApiTokenConfig({ hospitalCode, token });
  res.json({ ok: true, config: { hospitalCode, token } });
});

module.exports = router;
