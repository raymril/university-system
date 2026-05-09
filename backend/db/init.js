/**
 * init.js — إنشاء وتهيئة قاعدة البيانات
 * يُشغَّل مرة واحدة: node db/init.js
 */

require('dotenv').config({ path: '../.env' });
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './university.db';
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);

// ── تفعيل المفاتيح الخارجية
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

console.log('🏗  إنشاء الجداول...');

db.exec(`
/* ══ جداول المستخدمين والصلاحيات ══ */
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT    UNIQUE NOT NULL,
  password    TEXT    NOT NULL,
  role        TEXT    NOT NULL CHECK(role IN ('student','teacher','admin')),
  entity_id   INTEGER,          -- رابط مع جدول الطالب أو الأستاذ
  created_at  TEXT    DEFAULT (datetime('now')),
  last_login  TEXT
);

/* ══ الأقسام ══ */
CREATE TABLE IF NOT EXISTS departments (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT UNIQUE NOT NULL
);

/* ══ الطلاب ══ */
CREATE TABLE IF NOT EXISTS students (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  fname      TEXT NOT NULL,
  mname      TEXT,
  lname      TEXT NOT NULL,
  student_no TEXT UNIQUE NOT NULL,
  dept_id    INTEGER REFERENCES departments(id),
  study_year TEXT NOT NULL DEFAULT 'الأولى',
  gpa        REAL DEFAULT 0.0,
  email      TEXT UNIQUE,
  phone      TEXT,
  status     TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','graduated')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

/* ══ الأساتذة ══ */
CREATE TABLE IF NOT EXISTS teachers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  speciality   TEXT,
  dept_id      INTEGER REFERENCES departments(id),
  academic_rank TEXT DEFAULT 'مدرّس',
  email        TEXT UNIQUE,
  phone        TEXT,
  status       TEXT DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

/* ══ المواد الدراسية ══ */
CREATE TABLE IF NOT EXISTS subjects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  code        TEXT UNIQUE NOT NULL,
  credit_hours INTEGER DEFAULT 3,
  dept_id     INTEGER REFERENCES departments(id),
  teacher_id  INTEGER REFERENCES teachers(id),
  status      TEXT DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at  TEXT DEFAULT (datetime('now'))
);

/* ══ الفصول الدراسية ══ */
CREATE TABLE IF NOT EXISTS semesters (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  year      TEXT NOT NULL,
  is_active INTEGER DEFAULT 0
);

/* ══ تسجيل الطلاب في المواد ══ */
CREATE TABLE IF NOT EXISTS enrollments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id  INTEGER NOT NULL REFERENCES subjects(id),
  semester_id INTEGER NOT NULL REFERENCES semesters(id),
  UNIQUE(student_id, subject_id, semester_id)
);

/* ══ الدرجات ══ */
CREATE TABLE IF NOT EXISTS grades (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id INTEGER UNIQUE NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  midterm       REAL DEFAULT 0 CHECK(midterm BETWEEN 0 AND 40),
  practical     REAL DEFAULT 0 CHECK(practical BETWEEN 0 AND 20),
  final         REAL DEFAULT 0 CHECK(final BETWEEN 0 AND 40),
  total         REAL GENERATED ALWAYS AS (midterm + practical + final) STORED,
  updated_at    TEXT DEFAULT (datetime('now')),
  updated_by    INTEGER REFERENCES users(id)
);

/* ══ طلبات القبول ══ */
CREATE TABLE IF NOT EXISTS admission_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT NOT NULL,
  secondary_score TEXT,
  desired_dept  INTEGER REFERENCES departments(id),
  apply_date    TEXT DEFAULT (date('now')),
  status        TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
  notes         TEXT
);

/* ══ سجل العمليات ══ */
CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id),
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  details    TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

/* ══ إعدادات النظام ══ */
CREATE TABLE IF NOT EXISTS system_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`);

console.log('✅ تم إنشاء الجداول');

// ══ إدراج البيانات الأساسية ══
const insert = db.transaction(() => {

  // الأقسام
  const depts = ['علوم الحاسوب','هندسة البرمجيات','الذكاء الاصطناعي','نظم المعلومات'];
  const deptStmt = db.prepare('INSERT OR IGNORE INTO departments(name) VALUES(?)');
  depts.forEach(d => deptStmt.run(d));

  // الفصول الدراسية
  db.prepare('INSERT OR IGNORE INTO semesters(id,name,year,is_active) VALUES(?,?,?,?)').run(1,'الأول','2023/2024',0);
  db.prepare('INSERT OR IGNORE INTO semesters(id,name,year,is_active) VALUES(?,?,?,?)').run(2,'الثاني','2023/2024',0);
  db.prepare('INSERT OR IGNORE INTO semesters(id,name,year,is_active) VALUES(?,?,?,?)').run(3,'الأول','2024/2025',0);
  db.prepare('INSERT OR IGNORE INTO semesters(id,name,year,is_active) VALUES(?,?,?,?)').run(4,'الثاني','2024/2025',1);

  const deptId = name => db.prepare('SELECT id FROM departments WHERE name=?').get(name)?.id;

  // الأساتذة
  const teaStmt = db.prepare(`
    INSERT OR IGNORE INTO teachers(name,speciality,dept_id,academic_rank,email,phone,status)
    VALUES(?,?,?,?,?,?,?)
  `);
  const teachers = [
    ['د. أحمد الراوي',   'برمجة الحاسوب',       deptId('علوم الحاسوب'),       'أستاذ مساعد',  'a.rawi@hadba.edu.iq',   '07711234567','active'],
    ['د. سناء كريم',     'الدوائر الرقمية',      deptId('هندسة البرمجيات'),   'أستاذ',         's.karim@hadba.edu.iq',  '07711234568','active'],
    ['د. محمد العبيدي',  'معمارية الحاسوب',      deptId('علوم الحاسوب'),       'أستاذ',         'm.ubaidi@hadba.edu.iq', '07711234569','active'],
    ['د. هناء سالم',     'الإحصاء التطبيقي',     deptId('نظم المعلومات'),      'مدرّس',         'h.salem@hadba.edu.iq',  '07711234570','active'],
    ['د. كريم فاضل',     'هندسة البرمجيات',      deptId('هندسة البرمجيات'),   'أستاذ مساعد',  'k.fadhil@hadba.edu.iq', '07711234571','inactive'],
    ['د. ليلى حسن',      'قواعد البيانات',        deptId('علوم الحاسوب'),       'مدرّس مساعد',  'l.hassan@hadba.edu.iq', '07711234572','active'],
  ];
  teachers.forEach(t => teaStmt.run(...t));

  const teaId = name => db.prepare('SELECT id FROM teachers WHERE name=?').get(name)?.id;

  // المواد
  const subStmt = db.prepare(`
    INSERT OR IGNORE INTO subjects(name,code,credit_hours,dept_id,teacher_id,status)
    VALUES(?,?,?,?,?,?)
  `);
  const subjects = [
    ['برمجة C++',         'CS-201', 3, deptId('علوم الحاسوب'),       teaId('د. أحمد الراوي'),  'active'],
    ['التصميم المنطقي',   'CE-102', 3, deptId('هندسة البرمجيات'),   teaId('د. سناء كريم'),    'active'],
    ['تنظيم الحاسوب',    'CS-301', 4, deptId('علوم الحاسوب'),       teaId('د. محمد العبيدي'), 'active'],
    ['الإحصاء',           'IS-201', 2, deptId('نظم المعلومات'),      teaId('د. هناء سالم'),    'active'],
    ['تحليل النظم',       'SE-301', 3, deptId('هندسة البرمجيات'),   teaId('د. كريم فاضل'),    'inactive'],
    ['قواعد البيانات',    'CS-401', 4, deptId('علوم الحاسوب'),       teaId('د. ليلى حسن'),     'active'],
  ];
  subjects.forEach(s => subStmt.run(...s));

  // الطلاب
  const stuStmt = db.prepare(`
    INSERT OR IGNORE INTO students(fname,mname,lname,student_no,dept_id,study_year,gpa,email,phone,status)
    VALUES(?,?,?,?,?,?,?,?,?,?)
  `);
  const studentsData = [
    ['أيمن',  'محمد',  'الخزرجي',  'CS-2024-001', deptId('علوم الحاسوب'),       'الثالثة', 3.42, 'ayman@hadba.edu.iq',   '07701234567','active'],
    ['سارة',  'أحمد',  'العبيدي',  'CS-2024-002', deptId('علوم الحاسوب'),       'الثالثة', 3.85, 'sara@hadba.edu.iq',    '07701234568','active'],
    ['محمد',  'علي',   'الجبوري',  'CS-2024-003', deptId('هندسة البرمجيات'),   'الثانية', 2.60, 'mohammed@hadba.edu.iq','07701234569','active'],
    ['فاطمة', 'حسن',   'التميمي',  'CS-2024-004', deptId('علوم الحاسوب'),       'الثالثة', 3.15, 'fatima@hadba.edu.iq',  '07701234570','active'],
    ['علي',   'عمر',   'الشمري',   'CS-2024-005', deptId('الذكاء الاصطناعي'),  'الأولى',  1.90, 'ali@hadba.edu.iq',     '07701234571','inactive'],
    ['نور',   'خالد',  'الربيعي',  'CS-2024-006', deptId('نظم المعلومات'),      'الرابعة', 3.70, 'noor@hadba.edu.iq',    '07701234572','active'],
    ['عمر',   'صالح',  'الحسيني',  'CS-2024-007', deptId('علوم الحاسوب'),       'الثانية', 2.90, 'omar@hadba.edu.iq',    '07701234573','active'],
    ['هناء',  'يوسف',  'الزبيدي',  'CS-2024-008', deptId('هندسة البرمجيات'),   'الثالثة', 3.30, 'hanaa@hadba.edu.iq',   '07701234574','active'],
  ];
  studentsData.forEach(s => stuStmt.run(...s));

  // تسجيل الطالب الأول في كل المواد (الفصل الرابع = نشط)
  const stuId1 = db.prepare("SELECT id FROM students WHERE student_no='CS-2024-001'").get()?.id;
  const sem4 = 4;
  const subIds = db.prepare('SELECT id FROM subjects').all();

  if (stuId1) {
    const enrStmt = db.prepare('INSERT OR IGNORE INTO enrollments(student_id,subject_id,semester_id) VALUES(?,?,?)');
    const gradesInit = [
      { mid: 28, prac: 16, fin: 30 }, // تنظيم الحاسوب (CS-301)
      { mid: 32, prac: 18, fin: 38 }, // برمجة C++
      { mid: 24, prac: 14, fin: 38 }, // التصميم المنطقي
      { mid: 20, prac: 12, fin: 39 }, // تحليل النظم
      { mid: 14, prac:  8, fin: 26 }, // الإحصاء
      { mid: 26, prac: 15, fin: 38 }, // قواعد البيانات
    ];
    subIds.forEach((sub, i) => {
      const g = gradesInit[i] || { mid: 20, prac: 10, fin: 20 };
      const r = enrStmt.run(stuId1, sub.id, sem4);
      if (r.lastInsertRowid) {
        db.prepare('INSERT OR IGNORE INTO grades(enrollment_id,midterm,practical,final) VALUES(?,?,?,?)')
          .run(r.lastInsertRowid, g.mid, g.prac, g.fin);
      }
    });
  }

  // تسجيل طلاب الشعبة (لمادة تنظيم الحاسوب CS-301)
  const cs301 = db.prepare("SELECT id FROM subjects WHERE code='CS-301'").get()?.id;
  const classGrades = [
    { no:'CS-2024-001', mid:28,prac:16,fin:30 },
    { no:'CS-2024-002', mid:36,prac:19,fin:37 },
    { no:'CS-2024-003', mid:22,prac:14,fin:26 },
    { no:'CS-2024-004', mid:30,prac:17,fin:32 },
    { no:'CS-2024-005', mid:18,prac:12,fin:20 },
    { no:'CS-2024-006', mid:34,prac:18,fin:35 },
    { no:'CS-2024-007', mid:26,prac:15,fin:28 },
    { no:'CS-2024-008', mid:32,prac:17,fin:34 },
  ];
  if (cs301) {
    const enrStmt2 = db.prepare('INSERT OR IGNORE INTO enrollments(student_id,subject_id,semester_id) VALUES(?,?,?)');
    classGrades.forEach(cg => {
      const stu = db.prepare('SELECT id FROM students WHERE student_no=?').get(cg.no);
      if (!stu) return;
      const r = enrStmt2.run(stu.id, cs301, sem4);
      const enrId = r.lastInsertRowid || db.prepare('SELECT id FROM enrollments WHERE student_id=? AND subject_id=? AND semester_id=?').get(stu.id, cs301, sem4)?.id;
      if (enrId) {
        db.prepare('INSERT OR IGNORE INTO grades(enrollment_id,midterm,practical,final) VALUES(?,?,?,?)').run(enrId, cg.mid, cg.prac, cg.fin);
      }
    });
  }

  // طلبات القبول
  const admStmt = db.prepare('INSERT OR IGNORE INTO admission_requests(full_name,secondary_score,desired_dept,status) VALUES(?,?,?,?)');
  const requests = [
    ['رنا كريم الكعبي',     '96.5%', deptId('علوم الحاسوب'),       'pending'],
    ['أمير علي الهاشمي',    '88.0%', deptId('هندسة البرمجيات'),   'pending'],
    ['زينب محمد الموسوي',   '92.3%', deptId('الذكاء الاصطناعي'),  'accepted'],
    ['حسام ياسر الدليمي',   '74.5%', deptId('نظم المعلومات'),      'rejected'],
    ['مريم أحمد الشيباني',  '85.0%', deptId('علوم الحاسوب'),       'pending'],
    ['طارق عباس الجنابي',   '91.8%', deptId('هندسة البرمجيات'),   'pending'],
    ['سلمى حسين البغدادي',  '78.2%', deptId('نظم المعلومات'),      'pending'],
  ];
  requests.forEach(r => admStmt.run(...r));

  // إعدادات النظام
  const settings = [
    ['university_name',    'جامعة الحدباء'],
    ['current_semester',   'الثاني 2024/2025'],
    ['pass_score',         '50'],
    ['midterm_max',        '40'],
    ['practical_max',      '20'],
    ['final_max',          '40'],
    ['reg_start',          '2025-02-01'],
    ['semester_end',       '2025-06-30'],
  ];
  const setStmt = db.prepare('INSERT OR IGNORE INTO system_settings(key,value) VALUES(?,?)');
  settings.forEach(s => setStmt.run(...s));

  // حسابات المستخدمين
  const hash = pw => bcrypt.hashSync(pw, 10);
  const userStmt = db.prepare('INSERT OR IGNORE INTO users(username,password,role,entity_id) VALUES(?,?,?,?)');

  const stu1id = db.prepare("SELECT id FROM students WHERE student_no='CS-2024-001'").get()?.id;
  const tea3id = db.prepare("SELECT id FROM teachers WHERE email='m.ubaidi@hadba.edu.iq'").get()?.id;

  userStmt.run('student',  hash('student123'),  'student', stu1id);
  userStmt.run('teacher',  hash('teacher123'),  'teacher', tea3id);
  userStmt.run('admin',    hash('admin123'),    'admin',   null);

  // سجل نشاط أولي
  const logStmt = db.prepare('INSERT INTO activity_log(action,entity,details) VALUES(?,?,?)');
  logStmt.run('system_init', 'system', 'تم تهيئة قاعدة البيانات');
});

insert();
console.log('✅ تم إدراج البيانات الأساسية');
console.log('\n🔑 بيانات الدخول:');
console.log('   طالب   → username: student  | password: student123');
console.log('   مدرّس  → username: teacher  | password: teacher123');
console.log('   مدير   → username: admin    | password: admin123');
console.log('\n✨ قاعدة البيانات جاهزة:', DB_PATH);
db.close();
