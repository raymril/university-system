/**
 * routes/students.js — إدارة الطلاب
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

// ── GET /api/students — قائمة الطلاب
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { dept, status, search, page = 1, limit = 50 } = req.query;
  let sql = `
    SELECT s.*, d.name AS dept_name
    FROM students s
    LEFT JOIN departments d ON s.dept_id = d.id
    WHERE 1=1
  `;
  const params = [];
  if (dept)   { sql += ' AND d.name = ?';                              params.push(dept); }
  if (status) { sql += ' AND s.status = ?';                            params.push(status); }
  if (search) { sql += ' AND (s.fname||" "||s.mname||" "||s.lname LIKE ? OR s.student_no LIKE ? OR s.email LIKE ?)';
                params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  sql += ' ORDER BY s.id DESC';
  sql += ` LIMIT ? OFFSET ?`;
  params.push(+limit, (+page - 1) * +limit);

  const students = db.prepare(sql).all(...params);
  const total = db.prepare(`SELECT COUNT(*) AS cnt FROM students s LEFT JOIN departments d ON s.dept_id=d.id WHERE 1=1${dept?' AND d.name=?':''}${status?' AND s.status=?':''}${search?' AND (s.fname||" "||s.mname||" "||s.lname LIKE ? OR s.student_no LIKE ? OR s.email LIKE ?)':''}`).get(...params.slice(0, -2))?.cnt || 0;

  res.json({ success: true, data: students, total, page: +page, limit: +limit });
});

// ── GET /api/students/:id
router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const student = db.prepare(`
    SELECT s.*, d.name AS dept_name
    FROM students s LEFT JOIN departments d ON s.dept_id=d.id
    WHERE s.id=?
  `).get(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: 'الطالب غير موجود' });
  res.json({ success: true, data: student });
});

// ── POST /api/students — إضافة طالب
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { fname, mname, lname, student_no, dept_id, study_year, email, phone, status } = req.body;
  if (!fname || !lname || !student_no) {
    return res.status(400).json({ success: false, message: 'الاسم والرقم الجامعي مطلوبان' });
  }
  const db = getDb();
  try {
    const r = db.prepare(`
      INSERT INTO students(fname,mname,lname,student_no,dept_id,study_year,gpa,email,phone,status)
      VALUES(?,?,?,?,?,?,0,?,?,?)
    `).run(fname, mname||'', lname, student_no, dept_id||null, study_year||'الأولى', email||null, phone||null, status||'active');

    db.prepare("INSERT INTO activity_log(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)").run(req.user.id,'create','student',r.lastInsertRowid,`إضافة طالب: ${fname} ${lname}`);
    const student = db.prepare('SELECT s.*,d.name AS dept_name FROM students s LEFT JOIN departments d ON s.dept_id=d.id WHERE s.id=?').get(r.lastInsertRowid);
    res.status(201).json({ success: true, message: 'تم إضافة الطالب بنجاح', data: student });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ success: false, message: 'الرقم الجامعي أو البريد الإلكتروني مستخدم مسبقاً' });
    throw e;
  }
});

// ── PUT /api/students/:id — تعديل طالب
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM students WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'الطالب غير موجود' });

  const { fname, mname, lname, student_no, dept_id, study_year, gpa, email, phone, status } = req.body;
  db.prepare(`
    UPDATE students SET fname=?,mname=?,lname=?,student_no=?,dept_id=?,study_year=?,
    gpa=COALESCE(?,gpa),email=?,phone=?,status=?,updated_at=datetime('now') WHERE id=?
  `).run(fname, mname||'', lname, student_no, dept_id||null, study_year, gpa||null, email||null, phone||null, status||'active', req.params.id);

  db.prepare("INSERT INTO activity_log(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)").run(req.user.id,'update','student',req.params.id,`تعديل طالب: ${fname} ${lname}`);
  const student = db.prepare('SELECT s.*,d.name AS dept_name FROM students s LEFT JOIN departments d ON s.dept_id=d.id WHERE s.id=?').get(req.params.id);
  res.json({ success: true, message: 'تم تحديث بيانات الطالب', data: student });
});

// ── DELETE /api/students/:id
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const student = db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: 'الطالب غير موجود' });

  db.prepare('DELETE FROM students WHERE id=?').run(req.params.id);
  db.prepare("INSERT INTO activity_log(user_id,action,entity,details) VALUES(?,?,?,?)").run(req.user.id,'delete','student',`حذف طالب: ${student.fname} ${student.lname}`);
  res.json({ success: true, message: 'تم حذف الطالب بنجاح' });
});

// ── GET /api/students/:id/grades — درجات طالب
router.get('/:id/grades', authenticate, (req, res) => {
  // الطالب يرى درجاته فقط
  if (req.user.role === 'student' && req.user.entity_id != req.params.id) {
    return res.status(403).json({ success: false, message: 'لا يمكنك الاطلاع على درجات طالب آخر' });
  }
  const db = getDb();
  const { semester_id } = req.query;
  let sql = `
    SELECT g.*, sub.name AS subject_name, sub.code, sub.credit_hours,
           sem.name AS semester_name, sem.year AS semester_year
    FROM grades g
    JOIN enrollments e ON g.enrollment_id = e.id
    JOIN subjects sub ON e.subject_id = sub.id
    JOIN semesters sem ON e.semester_id = sem.id
    WHERE e.student_id = ?
  `;
  const params = [req.params.id];
  if (semester_id) { sql += ' AND e.semester_id = ?'; params.push(semester_id); }
  sql += ' ORDER BY sub.name';
  const grades = db.prepare(sql).all(...params);
  res.json({ success: true, data: grades });
});

module.exports = router;
