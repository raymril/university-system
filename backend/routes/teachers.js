/**
 * routes/teachers.js — إدارة الأساتذة
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

// ── GET /api/teachers
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { search, status } = req.query;
  let sql = `SELECT t.*, d.name AS dept_name FROM teachers t LEFT JOIN departments d ON t.dept_id=d.id WHERE 1=1`;
  const params = [];
  if (search) { sql += ' AND (t.name LIKE ? OR t.speciality LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (status) { sql += ' AND t.status=?'; params.push(status); }
  sql += ' ORDER BY t.id ASC';
  res.json({ success: true, data: db.prepare(sql).all(...params) });
});

// ── GET /api/teachers/:id
router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const teacher = db.prepare('SELECT t.*,d.name AS dept_name FROM teachers t LEFT JOIN departments d ON t.dept_id=d.id WHERE t.id=?').get(req.params.id);
  if (!teacher) return res.status(404).json({ success: false, message: 'الأستاذ غير موجود' });
  // المواد التي يدرّسها
  const subjects = db.prepare('SELECT * FROM subjects WHERE teacher_id=?').all(req.params.id);
  res.json({ success: true, data: { ...teacher, subjects } });
});

// ── POST /api/teachers
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { name, speciality, dept_id, academic_rank, email, phone, status } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'اسم الأستاذ مطلوب' });
  const db = getDb();
  try {
    const r = db.prepare(`
      INSERT INTO teachers(name,speciality,dept_id,academic_rank,email,phone,status)
      VALUES(?,?,?,?,?,?,?)
    `).run(name, speciality||'', dept_id||null, academic_rank||'مدرّس', email||null, phone||null, status||'active');
    db.prepare("INSERT INTO activity_log(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)").run(req.user.id,'create','teacher',r.lastInsertRowid,`إضافة أستاذ: ${name}`);
    res.status(201).json({ success: true, message: 'تم إضافة الأستاذ', data: db.prepare('SELECT t.*,d.name AS dept_name FROM teachers t LEFT JOIN departments d ON t.dept_id=d.id WHERE t.id=?').get(r.lastInsertRowid) });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ success: false, message: 'البريد الإلكتروني مستخدم مسبقاً' });
    throw e;
  }
});

// ── PUT /api/teachers/:id
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const { name, speciality, dept_id, academic_rank, email, phone, status } = req.body;
  const existing = db.prepare('SELECT id FROM teachers WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'الأستاذ غير موجود' });

  db.prepare(`UPDATE teachers SET name=?,speciality=?,dept_id=?,academic_rank=?,email=?,phone=?,status=?,updated_at=datetime('now') WHERE id=?`)
    .run(name, speciality||'', dept_id||null, academic_rank||'مدرّس', email||null, phone||null, status||'active', req.params.id);
  db.prepare("INSERT INTO activity_log(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)").run(req.user.id,'update','teacher',req.params.id,`تعديل أستاذ: ${name}`);
  res.json({ success: true, message: 'تم تحديث بيانات الأستاذ', data: db.prepare('SELECT t.*,d.name AS dept_name FROM teachers t LEFT JOIN departments d ON t.dept_id=d.id WHERE t.id=?').get(req.params.id) });
});

// ── DELETE /api/teachers/:id
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const t = db.prepare('SELECT * FROM teachers WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ success: false, message: 'الأستاذ غير موجود' });
  db.prepare('DELETE FROM teachers WHERE id=?').run(req.params.id);
  db.prepare("INSERT INTO activity_log(user_id,action,entity,details) VALUES(?,?,?,?)").run(req.user.id,'delete','teacher',`حذف أستاذ: ${t.name}`);
  res.json({ success: true, message: 'تم حذف الأستاذ' });
});

// ── GET /api/teachers/:id/class — طلاب الشعبة
router.get('/:id/class', authenticate, authorize('teacher','admin'), (req, res) => {
  const db = getDb();
  const { semester_id } = req.query;
  const sem = semester_id || db.prepare("SELECT id FROM semesters WHERE is_active=1").get()?.id;
  const data = db.prepare(`
    SELECT s.id, s.fname||' '||s.mname||' '||s.lname AS full_name, s.student_no,
           sub.name AS subject_name, sub.id AS subject_id,
           g.midterm, g.practical, g.final, g.total, e.id AS enrollment_id
    FROM subjects sub
    JOIN enrollments e ON e.subject_id=sub.id
    JOIN students s ON e.student_id=s.id
    LEFT JOIN grades g ON g.enrollment_id=e.id
    WHERE sub.teacher_id=? AND e.semester_id=?
    ORDER BY sub.name, g.total DESC
  `).all(req.params.id, sem);
  res.json({ success: true, data });
});

module.exports = router;
