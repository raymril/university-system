/**
 * routes/auth.js — تسجيل الدخول والخروج
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/connection');
const { authenticate } = require('../middleware/auth');

const SECRET  = process.env.JWT_SECRET   || 'hadba_secret';
const EXPIRES = process.env.JWT_EXPIRES_IN || '24h';

// ── POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'اسم المستخدم وكلمة المرور مطلوبان' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }

  // تحديث آخر دخول
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  const payload = { id: user.id, username: user.username, role: user.role, entity_id: user.entity_id };
  const token = jwt.sign(payload, SECRET, { expiresIn: EXPIRES });

  // جلب بيانات إضافية حسب الدور
  let profile = {};
  if (user.role === 'student' && user.entity_id) {
    const stu = db.prepare(`
      SELECT s.*, d.name as dept_name
      FROM students s LEFT JOIN departments d ON s.dept_id = d.id
      WHERE s.id = ?
    `).get(user.entity_id);
    if (stu) profile = { fullName: `${stu.fname} ${stu.mname} ${stu.lname}`, dept: stu.dept_name, gpa: stu.gpa };
  } else if (user.role === 'teacher' && user.entity_id) {
    const tea = db.prepare('SELECT * FROM teachers WHERE id = ?').get(user.entity_id);
    if (tea) profile = { fullName: tea.name, rank: tea.academic_rank };
  } else if (user.role === 'admin') {
    profile = { fullName: 'د. عمار الحسيني' };
  }

  // سجّل النشاط
  db.prepare("INSERT INTO activity_log(user_id,action,entity,details) VALUES(?,?,?,?)").run(user.id,'login','user',`تسجيل دخول: ${username}`);

  res.json({ success: true, token, user: { ...payload, ...profile } });
});

// ── GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id,username,role,entity_id,last_login FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
  res.json({ success: true, user });
});

// ── POST /api/auth/change-password
router.post('/change-password', authenticate, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(oldPassword, user.password)) {
    return res.status(400).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
  }
  db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
});

module.exports = router;
