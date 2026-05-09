/**
 * middleware/auth.js — التحقق من JWT والصلاحيات
 */
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'hadba_secret';

/**
 * التحقق من التوكن
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول أولاً' });
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'التوكن غير صالح أو منتهي الصلاحية' });
  }
}

/**
 * التحقق من الصلاحية (roles: array of allowed roles)
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'غير مصرح' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'ليس لديك صلاحية للوصول' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
