function requireAuth(req, res, next) {
  if (req.session && req.session.officer) {
    return next();
  }
  return res.status(401).json({ ok: false, message: 'กรุณาเข้าสู่ระบบก่อน' });
}

module.exports = requireAuth;
