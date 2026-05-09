# 🎓 جامعة الحدباء — نظام الإدارة الأكاديمية

## هيكل المشروع

```
hadba-university/
├── backend/           ← الباك اند (Node.js + Express)
│   ├── server.js      ← نقطة البداية الرئيسية
│   ├── .env           ← إعدادات البيئة
│   ├── package.json
│   ├── db/
│   │   ├── init.js        ← تهيئة قاعدة البيانات
│   │   └── connection.js  ← اتصال SQLite
│   ├── middleware/
│   │   └── auth.js        ← JWT والصلاحيات
│   └── routes/
│       ├── auth.js        ← تسجيل الدخول
│       ├── students.js    ← الطلاب
│       ├── teachers.js    ← الأساتذة
│       ├── subjects.js    ← المواد
│       ├── grades.js      ← الدرجات
│       └── admin.js       ← الإدارة
└── frontend/
    ├── index.html     ← الواجهة الأمامية
    └── api.js         ← عميل الـ API
```

---

## ⚡ التشغيل السريع

### 1. تثبيت المتطلبات

```bash
cd backend
npm install
```

### 2. تهيئة قاعدة البيانات

```bash
node db/init.js
```

### 3. تشغيل الخادم

```bash
# للتطوير (مع إعادة التشغيل التلقائي)
npm run dev

# للإنتاج
npm start
```

الخادم سيعمل على: **http://localhost:3001**

---

## 🔑 بيانات الدخول الافتراضية

| الدور       | اسم المستخدم | كلمة المرور |
|-------------|-------------|-------------|
| 🎓 طالب    | `student`   | `student123` |
| 📋 مدرّس   | `teacher`   | `teacher123` |
| 🛡️ مدير   | `admin`     | `admin123`  |

---

## 📡 API Endpoints

### المصادقة
```
POST /api/auth/login          ← تسجيل الدخول
GET  /api/auth/me             ← بيانات المستخدم الحالي
POST /api/auth/change-password ← تغيير كلمة المرور
```

### الطلاب
```
GET    /api/students           ← قائمة الطلاب (دعم: search, dept, status, page, limit)
GET    /api/students/:id       ← بيانات طالب
POST   /api/students           ← إضافة طالب [admin]
PUT    /api/students/:id       ← تعديل طالب [admin]
DELETE /api/students/:id       ← حذف طالب [admin]
GET    /api/students/:id/grades ← درجات طالب
```

### الأساتذة
```
GET    /api/teachers            ← قائمة الأساتذة
GET    /api/teachers/:id        ← بيانات أستاذ
POST   /api/teachers            ← إضافة أستاذ [admin]
PUT    /api/teachers/:id        ← تعديل أستاذ [admin]
DELETE /api/teachers/:id        ← حذف أستاذ [admin]
GET    /api/teachers/:id/class  ← طلاب الشعبة
```

### المواد
```
GET    /api/subjects            ← قائمة المواد
POST   /api/subjects            ← إضافة مادة [admin]
PUT    /api/subjects/:id        ← تعديل مادة [admin]
DELETE /api/subjects/:id        ← حذف مادة [admin]
```

### الدرجات
```
GET  /api/grades/class/:subjectId ← درجات شعبة كاملة
PUT  /api/grades/:enrollmentId    ← تعديل درجة [teacher/admin]
POST /api/grades/batch            ← حفظ جماعي [teacher/admin]
GET  /api/grades/stats/:subjectId ← إحصاءات مادة
```

### الإدارة
```
GET /api/admin/dashboard         ← لوحة التحكم
GET /api/admin/departments       ← الأقسام
GET /api/admin/semesters         ← الفصول الدراسية
GET /api/admin/admissions        ← طلبات القبول
PUT /api/admin/admissions/:id    ← تحديث طلب قبول
GET /api/admin/settings          ← إعدادات النظام
PUT /api/admin/settings          ← تحديث الإعدادات
GET /api/admin/activity          ← سجل النشاط
```

---

## 🔗 ربط الفرونت اند بالباك اند

### الطريقة 1: خدمة من نفس الخادم
انسخ ملفات الفرونت اند إلى مجلد `backend/public/`:
```bash
cp frontend/* backend/public/
```

### الطريقة 2: خادمان منفصلان
أضف في بداية `index.html` قبل script الـ api.js:
```html
<script>window.API_BASE = 'http://localhost:3001/api';</script>
<script src="api.js"></script>
```
ثم في أول `login()`:
```javascript
async function login(r) {
  try {
    const res = await API.login(
      r === 'student' ? 'student' : r === 'teacher' ? 'teacher' : 'admin',
      r === 'student' ? 'student123' : r === 'teacher' ? 'teacher123' : 'admin123'
    );
    API.Auth.setToken(res.token);
    API.Auth.setUser(res.user);
    // ... باقي منطق تسجيل الدخول
  } catch (e) {
    alert('خطأ في تسجيل الدخول: ' + e.message);
  }
}
```

---

## 🐳 Docker (اختياري)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN node db/init.js
EXPOSE 3001
CMD ["node", "server.js"]
```

```bash
docker build -t hadba-uni .
docker run -p 3001:3001 -v $(pwd)/db:/app/db hadba-uni
```

---

## ⚙️ متطلبات النظام

- **Node.js** >= 18.0
- **npm** >= 9.0
- مساحة تخزين: ~50MB

---

## 🔒 الأمان في الإنتاج

1. غيّر `JWT_SECRET` في `.env` إلى قيمة عشوائية طويلة
2. استخدم HTTPS
3. ضيّق `ALLOWED_ORIGINS` لنطاقك فقط
4. غيّر كلمات المرور الافتراضية فور التشغيل
