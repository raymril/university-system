/**
 * api.js — عميل الـ API للفرونت اند
 * ضعه في نفس مجلد index.html
 */

const API_BASE = window.API_BASE || 'http://localhost:3001/api';

// ══ TOKEN MANAGEMENT ══
const Auth = {
  getToken:    ()      => localStorage.getItem('hdu_token'),
  setToken:    (t)     => localStorage.setItem('hdu_token', t),
  removeToken: ()      => localStorage.removeItem('hdu_token'),
  getUser:     ()      => JSON.parse(localStorage.getItem('hdu_user') || 'null'),
  setUser:     (u)     => localStorage.setItem('hdu_user', JSON.stringify(u)),
  removeUser:  ()      => localStorage.removeItem('hdu_user'),
  clear:       ()      => { Auth.removeToken(); Auth.removeUser(); },
  isLoggedIn:  ()      => !!Auth.getToken(),
};

// ══ HTTP HELPER ══
async function api(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = Auth.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.message || 'خطأ في الخادم');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const GET    = (path)         => api('GET',    path);
const POST   = (path, body)   => api('POST',   path, body);
const PUT    = (path, body)   => api('PUT',    path, body);
const DELETE = (path)         => api('DELETE', path);

// ══ API METHODS ══
window.API = {
  Auth,

  // ── المصادقة
  login:          (username, password) => POST('/auth/login', { username, password }),
  me:             ()                   => GET('/auth/me'),
  changePassword: (old_, new_)         => POST('/auth/change-password', { oldPassword: old_, newPassword: new_ }),

  // ── الطلاب
  getStudents:    (params = {})        => GET('/students?' + new URLSearchParams(params)),
  getStudent:     (id)                 => GET(`/students/${id}`),
  createStudent:  (data)               => POST('/students', data),
  updateStudent:  (id, data)           => PUT(`/students/${id}`, data),
  deleteStudent:  (id)                 => DELETE(`/students/${id}`),
  getStudentGrades: (id, params = {})  => GET(`/students/${id}/grades?` + new URLSearchParams(params)),

  // ── الأساتذة
  getTeachers:    (params = {})        => GET('/teachers?' + new URLSearchParams(params)),
  getTeacher:     (id)                 => GET(`/teachers/${id}`),
  createTeacher:  (data)               => POST('/teachers', data),
  updateTeacher:  (id, data)           => PUT(`/teachers/${id}`, data),
  deleteTeacher:  (id)                 => DELETE(`/teachers/${id}`),
  getTeacherClass:(id, params = {})    => GET(`/teachers/${id}/class?` + new URLSearchParams(params)),

  // ── المواد
  getSubjects:    (params = {})        => GET('/subjects?' + new URLSearchParams(params)),
  createSubject:  (data)               => POST('/subjects', data),
  updateSubject:  (id, data)           => PUT(`/subjects/${id}`, data),
  deleteSubject:  (id)                 => DELETE(`/subjects/${id}`),

  // ── الدرجات
  getClassGrades: (subjectId, params = {}) => GET(`/grades/class/${subjectId}?` + new URLSearchParams(params)),
  updateGrade:    (enrollmentId, data)     => PUT(`/grades/${enrollmentId}`, data),
  batchGrades:    (grades)                 => POST('/grades/batch', { grades }),
  getGradeStats:  (subjectId, params = {}) => GET(`/grades/stats/${subjectId}?` + new URLSearchParams(params)),

  // ── الإدارة
  getDashboard:   ()                   => GET('/admin/dashboard'),
  getDepartments: ()                   => GET('/admin/departments'),
  createDept:     (name)               => POST('/admin/departments', { name }),
  deleteDept:     (id)                 => DELETE(`/admin/departments/${id}`),
  getSemesters:   ()                   => GET('/admin/semesters'),
  activateSem:    (id)                 => PUT(`/admin/semesters/${id}/activate`),
  getAdmissions:  ()                   => GET('/admin/admissions'),
  updateAdmission:(id, data)           => PUT(`/admin/admissions/${id}`, data),
  getSettings:    ()                   => GET('/admin/settings'),
  updateSettings: (data)               => PUT('/admin/settings', data),
  getActivity:    ()                   => GET('/admin/activity'),
};

console.log('✅ API Client جاهز — Base:', API_BASE);
