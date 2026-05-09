/**
 * routes/admin.js — لوحة الإدارة، الأقسام، الفصول، طلبات القبول
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

// ══ DASHBOARD ══

// ── GET /api/admin/dashboard
router.get('/dashboard', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();

  const totalStudents  = db.prepare('SELECT COUNT(*) AS c FROM students').get().c;
  const totalTeachers  = db.prepare('SELECT COUNT(*) AS c FROM teachers').get().c;
  const totalSubjects  = db.prepare('SELECT COUNT(*) AS c FROM subjects').get().c;
  const totalDepts     = db.prepare('SELECT COUNT(*) AS c FROM departments').get().c;
  const activeStudents = db.prepare("SELECT COUNT(*) AS c FROM students WHERE status='active'").get().c;
  const activeTeachers = db.prepare("SELECT COUNT(*) AS c FROM teachers WHERE status='active'").get().c;
  const riskCount      = db.prepare('SELECT COUNT(*) AS c FROM students WHERE gpa < 2.0').get().c;
  const passRate       = totalStudents ? Math.round(db.prepare('SELECT COUNT(*) AS c FROM students WHERE gpa >= 2.0').get().c / totalStudents * 100) : 0;

  const deptDist = db.prepare(`
    SELECT d.name, COUNT(s.id) AS count
    FROM departments d LEFT JOIN students s ON s.dept_id=d.id
    GROUP BY d.id ORDER BY count DESC
  `).all();

  const topStudents = db.prepare(`
    SELECT id, fname||' '||mname||' '||lname AS full_name, gpa, student_no
    FROM students ORDER BY gpa DESC LIMIT 5
  `).all();

  const recentActivity = db.prepare(`
    SELECT l.*, u.username FROM activity_log l LEFT JOIN users u ON l.user_id=u.id
    ORDER BY l.id DESC LIMIT 10
  `).all();

  const admissionStats = {
    pending:  db.prepare("SELECT COUNT(*) AS c FROM admission_requests WHERE status='pending'").get().c,
    accepted: db.prepare("SELECT COUNT(*) AS c FROM admission_requests WHERE status='accepted'").get().c,
    rejected: db.prepare("SELECT COUNT(*) AS c FROM admission_requests WHERE status='rejected'").get().c,
  };

  res.json({ success: true, data: {
    totalStudents, totalTeachers, totalSubjects, totalDepts,
    activeStudents, activeTeachers, riskCount, passRate,
    deptDist, topStudents, recentActivity, admissionStats,
  }});
});

// ══ DEPARTMENTS ══

router.get('/departments', authenticate, (req, res) => {
  const db = getDb();
  const depts = db.prepare(`
    SELECT d.*, COUNT(DISTINCT s.id) AS student_count, COUNT(DISTINCT t.id) AS teacher_count
    FROM departments d
    LEFT JOIN students s ON s.dept_id=d.id
    LEFT JOIN teachers t ON t.dept_id=d.id
    GROUP BY d.id
  `).all();
  res.json({ success: true, data: depts });
});

router.post('/departments', authenticate, authorize('admin'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'اسم القسم مطلوب' });
  const db = getDb();
  try {
    const r = db.prepare('INSERT INTO departments(name) VALUES(?)').run(name);
    res.status(201).json({ success: true, data: { id: r.lastInsertRowid, name } });
  } catch (e) {
    res.status(409).json({ success: false, message: 'القسم موجود مسبقاً' });
  }
});

router.delete('/departments/:id', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM departments WHERE id=?').run(req.params.id);
  res.json({ success: true, message: 'تم حذف القسم' });
});

// ══ SEMESTERS ══

router.get('/semesters', authenticate, (req, res) => {
  const db = getDb();
  res.json({ success: true, data: db.prepare('SELECT * FROM semesters ORDER BY id DESC').all() });
});

router.put('/semesters/:id/activate', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE semesters SET is_active=0').run();
  db.prepare('UPDATE semesters SET is_active=1 WHERE id=?').run(req.params.id);
  res.json({ success: true, message: 'تم تفعيل الفصل الدراسي' });
});

// ══ ADMISSION REQUESTS ══

router.get('/admissions', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT r.*, d.name AS dept_name
    FROM admission_requests r
    LEFT JOIN departments d ON r.desired_dept=d.id
    ORDER BY r.id DESC
  `).all();
  res.json({ success: true, data: rows });
});

router.put('/admissions/:id', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const { status, notes } = req.body;
  if (!['accepted','rejected','pending'].includes(status)) {
    return res.status(400).json({ success: false, message: 'حالة غير صالحة' });
  }
  db.prepare('UPDATE admission_requests SET status=?,notes=? WHERE id=?').run(status, notes||null, req.params.id);
  db.prepare("INSERT INTO activity_log(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)").run(req.user.id,'update','admission',req.params.id,`تحديث طلب قبول: ${status}`);
  res.json({ success: true, message: 'تم تحديث حالة الطلب' });
});

// ══ SYSTEM SETTINGS ══

router.get('/settings', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM system_settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json({ success: true, data: settings });
});

router.put('/settings', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO system_settings(key,value) VALUES(?,?)');
  const save = db.transaction(() => {
    Object.entries(req.body).forEach(([k,v]) => stmt.run(k, v));
  });
  save();
  db.prepare("INSERT INTO activity_log(user_id,action,entity,details) VALUES(?,?,?,?)").run(req.user.id,'update','settings','تحديث إعدادات النظام');
  res.json({ success: true, message: 'تم حفظ الإعدادات' });
});

// ══ ACTIVITY LOG ══

router.get('/activity', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT l.*, u.username FROM activity_log l
    LEFT JOIN users u ON l.user_id=u.id
    ORDER BY l.id DESC LIMIT 50
  `).all();
  res.json({ success: true, data: rows });
});

module.exports = router;
