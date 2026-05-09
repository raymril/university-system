/**
 * server.js — نقطة البداية الرئيسية للباك اند
 * جامعة الحدباء — نظام الإدارة الأكاديمية
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const path     = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ══ MIDDLEWARE ══

app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow curl / postman
    if (!allowedOrigins.length || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ══ STATIC FILES (Frontend) ══
// ضع ملفات الفرونت اند في مجلد "public"
app.use(express.static(path.join(__dirname, 'public')));

// ══ ROUTES ══
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/teachers', require('./routes/teachers'));
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/grades',   require('./routes/grades'));
app.use('/api/admin',    require('./routes/admin'));

// ══ HEALTH CHECK ══
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'running', time: new Date().toISOString(), version: '1.0.0' });
});

// ══ ROOT → Frontend ══
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  const fs = require('fs');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ success: true, message: 'جامعة الحدباء API تعمل بنجاح 🎓', docs: '/api/health' });
  }
});

// ══ GLOBAL ERROR HANDLER ══
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.message);
  if (process.env.NODE_ENV === 'development') console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'خطأ في الخادم',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ══ START ══
app.listen(PORT, () => {
  console.log(`\n🚀 الخادم يعمل على: http://localhost:${PORT}`);
  console.log(`📡 API Base: http://localhost:${PORT}/api`);
  console.log(`🏥 Health:   http://localhost:${PORT}/api/health`);
  console.log(`🌍 Env: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
