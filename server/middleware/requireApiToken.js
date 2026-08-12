const { getApiTokenConfig } = require('../dataStore');

// ป้องกันการ copy URL ไปยิงตรงผ่าน Postman โดยไม่ผ่านหน้าเว็บ: ทุก request ต้องแนบ token
// ที่ตั้งค่าไว้ในหน้า "ตั้งค่าการเชื่อมต่อ" มาด้วย (header x-api-token)
// ถ้ายังไม่เคย gen token ไว้เลย (ติดตั้งใหม่) จะยังไม่บังคับ เพื่อไม่ให้ระบบเดิมใช้งานไม่ได้ทันที
function requireApiToken(req, res, next) {
  const { token } = getApiTokenConfig();
  if (!token) return next();

  const provided = req.get('x-api-token');
  if (provided !== token) {
    return res.status(401).json({ ok: false, message: 'กรุณาระบุ Token ให้ถูกต้องก่อนเรียกใช้งาน API นี้' });
  }
  next();
}

module.exports = requireApiToken;
