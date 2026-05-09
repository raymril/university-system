/**
 * routes/subjects.js — المواد الدراسية
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

// ── GET /api/subjects
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { search, dept, status } = req.query;
  let sql = `
    SELECT sub.*, d.name AS dept_name, t.name AS teacher_name
    FROM subjects sub
    LEFT JOIN departments d ON sub.dept_id=d.id
    LEFT JOIN teachers t ON sub.teacher_id=t.id
    WHERE 1=1
  `;
  const params = [];
  if (search) { sql += ' AND (sub.name LIKE ? OR sub.code LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (dept)   { sql += ' AND d.name=?'; params.push(dept); }
  if (status) { sql += ' AND sub.status=?'; params.push(status); }
  sql += ' ORDER BY sub.id ASC';
  res.json({ success: true, data: db.prepare(sql).all(...params) });
});

// ── POST /api/subjects
router.post('/', authenticate, authorize('admin'), (req, res) => {
  const { name, code, credit_hours, dept_id, teacher_id, status } = req.body;
  if (!name || !code) return res.status(400).json({ success: false, message: 'اسم المادة والكود مطلوبان' });
  const db = getDb();
  try {
    const r = db.prepare(`INSERT INTO subjects(name,code,credit_hours,dept_id,teacher_id,status) VALUES(?,?,?,?,?,?)`).run(name, code, credit_hours||3, dept_id||null, teacher_id||null, status||'active');
    db.prepare("INSERT INTO activity_log(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)").run(req.user.id,'create','subject',r.lastInsertRowid,`إضافة مادة: ${name}`);
    res.status(201).json({ success: true, message: 'تم إضافة المادة', data: db.prepare('SELECT sub.*,d.name AS dept_name,t.name AS teacher_name FROM subjects sub LEFT JOIN departments d ON sub.dept_id=d.id LEFT JOIN teachers t ON sub.teacher_id=t.id WHERE sub.id=?').get(r.lastInsertRowid) });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ success: false, message: 'كود المادة مستخدم مسبقاً' });
    throw e;
  }
});

// ── PUT /api/subjects/:id
router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const { name, code, credit_hours, dept_id, teacher_id, status } = req.body;
  if (!db.prepare('SELECT id FROM subjects WHERE id=?').get(req.params.id)) return res.status(404).json({ success: false, message: 'المادة غير موجودة' });
  db.prepare('UPDATE subjects SET name=?,code=?,credit_hours=?,dept_id=?,teacher_id=?,status=? WHERE id=?').run(name, code, credit_hours||3, dept_id||null, teacher_id||null, status||'active', req.params.id);
  db.prepare("INSERT INTO activity_log(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)").run(req.user.id,'update','subject',req.params.id,`تعديل مادة: ${name}`);
  res.json({ success: true, message: 'تم تحديث المادة', data: db.prepare('SELECT sub.*,d.name AS dept_name,t.name AS teacher_name FROM subjects sub LEFT JOIN departments d ON sub.dept_id=d.id LEFT JOIN teachers t ON sub.teacher_id=t.id WHERE sub.id=?').get(req.params.id) });
});

// ── DELETE /api/subjects/:id
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const sub = db.prepare('SELECT * FROM subjects WHERE id=?').get(req.params.id);
  if (!sub) return res.status(404).json({ success: false, message: 'المادة غير موجودة' });
  db.prepare('DELETE FROM subjects WHERE id=?').run(req.params.id);
  db.prepare("INSERT INTO activity_log(user_id,action,entity,details) VALUES(?,?,?,?)").run(req.user.id,'delete','subject',`حذف مادة: ${sub.name}`);
  res.json({ success: true, message: 'تم حذف المادة' });
});

module.exports = router;
