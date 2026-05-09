/**
 * routes/grades.js — إدارة الدرجات
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/connection');
const { authenticate, authorize } = require('../middleware/auth');

function letterGrade(t) {
  if (t >= 90) return 'A+'; if (t >= 85) return 'A';
  if (t >= 80) return 'B+'; if (t >= 75) return 'B';
  if (t >= 70) return 'C+'; if (t >= 65) return 'C';
  if (t >= 60) return 'D+'; if (t >= 50) return 'D'; return 'F';
}

// ── GET /api/grades/class/:subjectId — درجات شعبة كاملة
router.get('/class/:subjectId', authenticate, authorize('teacher','admin'), (req, res) => {
  const db = getDb();
  const { semester_id } = req.query;
  const sem = semester_id || db.prepare("SELECT id FROM semesters WHERE is_active=1").get()?.id;
  const rows = db.prepare(`
    SELECT s.id AS student_id, s.fname||' '||s.mname||' '||s.lname AS full_name,
           s.student_no, e.id AS enrollment_id,
           COALESCE(g.midterm,0) AS midterm,
           COALESCE(g.practical,0) AS practical,
           COALESCE(g.final,0) AS final,
           COALESCE(g.total,0) AS total
    FROM enrollments e
    JOIN students s ON e.student_id=s.id
    LEFT JOIN grades g ON g.enrollment_id=e.id
    WHERE e.subject_id=? AND e.semester_id=?
    ORDER BY COALESCE(g.total,0) DESC
  `).all(req.params.subjectId, sem);

  const withGrade = rows.map(r => ({ ...r, letter: letterGrade(r.total), pass: r.total >= 50 }));
  res.json({ success: true, data: withGrade });
});

// ── PUT /api/grades/:enrollmentId — تعديل درجة واحدة
router.put('/:enrollmentId', authenticate, authorize('teacher','admin'), (req, res) => {
  const db = getDb();
  const { midterm, practical, final } = req.body;

  const enr = db.prepare('SELECT * FROM enrollments WHERE id=?').get(req.params.enrollmentId);
  if (!enr) return res.status(404).json({ success: false, message: 'التسجيل غير موجود' });

  // التحقق أن الأستاذ يدرّس هذه المادة
  if (req.user.role === 'teacher') {
    const sub = db.prepare('SELECT teacher_id FROM subjects WHERE id=?').get(enr.subject_id);
    const tea = db.prepare('SELECT id FROM teachers WHERE id=? AND id=?').get(sub?.teacher_id, req.user.entity_id);
    if (!tea) return res.status(403).json({ success: false, message: 'ليس لديك صلاحية لتعديل هذه الدرجات' });
  }

  // إنشاء أو تحديث
  const existing = db.prepare('SELECT id FROM grades WHERE enrollment_id=?').get(req.params.enrollmentId);
  if (existing) {
    db.prepare(`UPDATE grades SET midterm=?,practical=?,final=?,updated_at=datetime('now'),updated_by=? WHERE enrollment_id=?`)
      .run(midterm ?? 0, practical ?? 0, final ?? 0, req.user.id, req.params.enrollmentId);
  } else {
    db.prepare('INSERT INTO grades(enrollment_id,midterm,practical,final,updated_by) VALUES(?,?,?,?,?)')
      .run(req.params.enrollmentId, midterm ?? 0, practical ?? 0, final ?? 0, req.user.id);
  }

  // تحديث GPA الطالب
  updateStudentGPA(db, enr.student_id);

  const grade = db.prepare('SELECT * FROM grades WHERE enrollment_id=?').get(req.params.enrollmentId);
  db.prepare("INSERT INTO activity_log(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)").run(req.user.id,'update_grade','enrollment',req.params.enrollmentId,`تحديث درجة`);
  res.json({ success: true, message: 'تم حفظ الدرجة', data: { ...grade, letter: letterGrade(grade.total), pass: grade.total >= 50 } });
});

// ── POST /api/grades/batch — حفظ جماعي للدرجات
router.post('/batch', authenticate, authorize('teacher','admin'), (req, res) => {
  const db = getDb();
  const { grades } = req.body; // [{ enrollment_id, midterm, practical, final }]
  if (!Array.isArray(grades) || !grades.length) {
    return res.status(400).json({ success: false, message: 'يجب إرسال مصفوفة من الدرجات' });
  }

  const upsert = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO grades(enrollment_id,midterm,practical,final,updated_by)
      VALUES(?,?,?,?,?)
      ON CONFLICT(enrollment_id) DO UPDATE SET
        midterm=excluded.midterm, practical=excluded.practical,
        final=excluded.final, updated_at=datetime('now'), updated_by=excluded.updated_by
    `);
    grades.forEach(g => {
      stmt.run(g.enrollment_id, g.midterm ?? 0, g.practical ?? 0, g.final ?? 0, req.user.id);
    });
  });

  upsert();

  // تحديث GPA لجميع الطلاب المعنيين
  const studentIds = [...new Set(grades.map(g => {
    const enr = db.prepare('SELECT student_id FROM enrollments WHERE id=?').get(g.enrollment_id);
    return enr?.student_id;
  }).filter(Boolean))];
  studentIds.forEach(sid => updateStudentGPA(db, sid));

  db.prepare("INSERT INTO activity_log(user_id,action,entity,details) VALUES(?,?,?,?)").run(req.user.id,'batch_update_grades','grades',`تحديث جماعي لـ ${grades.length} درجة`);
  res.json({ success: true, message: `تم حفظ ${grades.length} درجة بنجاح` });
});

// ── GET /api/grades/stats/:subjectId — إحصاءات مادة
router.get('/stats/:subjectId', authenticate, authorize('teacher','admin'), (req, res) => {
  const db = getDb();
  const { semester_id } = req.query;
  const sem = semester_id || db.prepare("SELECT id FROM semesters WHERE is_active=1").get()?.id;

  const rows = db.prepare(`
    SELECT COALESCE(g.total,0) AS total, COALESCE(g.midterm,0) AS midterm,
           COALESCE(g.practical,0) AS practical, COALESCE(g.final,0) AS final
    FROM enrollments e LEFT JOIN grades g ON g.enrollment_id=e.id
    WHERE e.subject_id=? AND e.semester_id=?
  `).all(req.params.subjectId, sem);

  if (!rows.length) return res.json({ success: true, data: null });

  const totals = rows.map(r => r.total);
  const avg = t => (rows.reduce((a,r) => a + r[t], 0) / rows.length).toFixed(1);
  const std = vals => {
    const mean = vals.reduce((a,b) => a+b,0) / vals.length;
    return Math.sqrt(vals.reduce((a,v) => a+(v-mean)**2, 0) / vals.length).toFixed(1);
  };
  const dist = { A:0, B:0, C:0, D:0, F:0 };
  totals.forEach(t => { const g = letterGrade(t)[0]; dist[g] = (dist[g]||0)+1; });

  res.json({
    success: true, data: {
      count: rows.length,
      avg: avg('total'), midAvg: avg('midterm'), pracAvg: avg('practical'), finAvg: avg('final'),
      max: Math.max(...totals), min: Math.min(...totals),
      std: std(totals),
      passing: totals.filter(t => t >= 50).length,
      dist,
    }
  });
});

function updateStudentGPA(db, studentId) {
  const grades = db.prepare(`
    SELECT g.total, sub.credit_hours
    FROM grades g
    JOIN enrollments e ON g.enrollment_id=e.id
    JOIN subjects sub ON e.subject_id=sub.id
    WHERE e.student_id=?
  `).all(studentId);

  if (!grades.length) return;
  let totalPoints = 0, totalHours = 0;
  grades.forEach(g => {
    const gpa = g.total >= 90 ? 4.0 : g.total >= 85 ? 3.75 : g.total >= 80 ? 3.5 :
                g.total >= 75 ? 3.0 : g.total >= 70 ? 2.5 : g.total >= 65 ? 2.0 :
                g.total >= 60 ? 1.5 : g.total >= 50 ? 1.0 : 0;
    totalPoints += gpa * g.credit_hours;
    totalHours  += g.credit_hours;
  });
  const gpa = totalHours ? (totalPoints / totalHours).toFixed(2) : 0;
  db.prepare("UPDATE students SET gpa=?,updated_at=datetime('now') WHERE id=?").run(gpa, studentId);
}

module.exports = router;
