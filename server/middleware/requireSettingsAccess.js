const { hasTaskAccess } = require('../permissions');

const SETTINGS_ACCESS_TASK_ID = '77';

async function requireSettingsAccess(req, res, next) {
  if (!req.session || !req.session.officer) {
    return res.status(401).json({ ok: false, message: 'กรุณาเข้าสู่ระบบก่อน' });
  }
  try {
    const allowed = await hasTaskAccess(req.session.officer.username, SETTINGS_ACCESS_TASK_ID);
    if (!allowed) {
      return res.status(403).json({ ok: false, message: 'ไม่มีสิทธิ์เข้าถึงหน้านี้ กรุณาติดต่อ Admin ผู้ดูแลระบบ' });
    }
    next();
  } catch (err) {
    res.status(500).json({ ok: false, message: 'ตรวจสอบสิทธิ์ไม่สำเร็จ: ' + err.message });
  }
}

module.exports = requireSettingsAccess;
