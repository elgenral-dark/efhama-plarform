'use strict';
const crypto = require('crypto');

/* الأقسام وصلاحيات الأدوار — تُطبَّق على الخادم في كل طلب */
const SECTIONS = ['overview', 'paths', 'modules', 'lessons', 'questions', 'quizzes', 'projects', 'assets', 'glossary',
  'gamification', 'settings', 'data', 'subscriptions', 'ai', 'logs', 'students', 'analytics', 'users'];
const SECTION_LABELS = {
  overview: 'نظرة عامة', paths: 'المسارات', modules: 'الوحدات', lessons: 'الدروس', questions: 'بنك الأسئلة', quizzes: 'الاختبارات', projects: 'المشروعات',
  assets: 'مكتبة الرسومات', glossary: 'القاموس التقني', gamification: 'الإنجازات والتحفيز', settings: 'الإعدادات', data: 'البيانات والنسخ',
  subscriptions: 'الاشتراكات', ai: 'AI Lesson Creator', logs: 'سجل العمليات', students: 'الطلاب', analytics: 'تحليلات الطلاب', users: 'المستخدمون'
};
const E = 'edit', V = 'view';
const ROLES = {
  super_admin: { label: 'Super Admin (مدير المنصة)', sections: null, flags: ['students.suspend', 'certificates.issue', 'certificates.revoke', 'ai.settings', 'students.contact'] },
  instructor: {
    label: 'Instructor (مدرس)', flags: ['ai.use'],
    sections: { overview: V, paths: V, modules: V, lessons: E, questions: E, quizzes: E, projects: E, assets: E, glossary: E, gamification: E, ai: E }
  },
  content_manager: {
    label: 'Content Manager (مدير محتوى)', flags: ['ai.use'],
    sections: { overview: V, paths: E, modules: E, lessons: E, questions: E, quizzes: E, projects: E, assets: E, glossary: E, gamification: E, ai: E }
  },
  analyst: { label: 'Analyst (محلل بيانات)', flags: [], sections: { overview: V, analytics: V } },
  support: {
    label: 'Support (دعم فني)', flags: ['students.suspend', 'certificates.issue', 'students.contact'],
    sections: { overview: V, students: E }
  }
};

function permsFor(user) {
  const role = ROLES[user.role];
  if (!role) return { sections: {}, flags: [] };
  let sections = {};
  if (role.sections === null) SECTIONS.forEach(s => { sections[s] = E; });
  else sections = Object.assign({}, role.sections);
  let flags = role.flags.slice();
  if (Array.isArray(user.sectionsList)) {
    const allow = new Set(user.sectionsList);
    Object.keys(sections).forEach(s => { if (!allow.has(s)) delete sections[s]; });
    if (!sections.students) flags = flags.filter(f => !f.startsWith('students.') && !f.startsWith('certificates.'));
    if (!sections.ai) flags = flags.filter(f => !f.startsWith('ai.'));
  }
  return { sections, flags };
}
function can(perms, section, level) {
  const l = perms.sections[section];
  if (!l) return false;
  return level === E ? l === E : true;
}

/* ---------- كلمات المرور ---------- */
function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 64); }
function makePw(pw) { const salt = crypto.randomBytes(16); return { salt, hash: hashPw(pw, salt) }; }
function checkPw(pw, salt, hash) {
  if (typeof pw !== 'string' || pw.length > 256) return false;
  const k = hashPw(pw, salt);
  return k.length === hash.length && crypto.timingSafeEqual(k, hash);
}
function pwProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'كلمة المرور يجب ألا تقل عن 10 أحرف';
  if (pw.length > 128) return 'كلمة المرور طويلة جدًا';
  return '';
}

/* ---------- الجلسات (في قاعدة البيانات) ---------- */
const SESSION_MS = 8 * 60 * 60 * 1000;
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(sha(token), userId, Date.now() + SESSION_MS, Date.now());
  return token;
}
function userFromToken(db, token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(sha(token));
  if (!row) return null;
  if (row.expires_at < Date.now() || !row.active) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token)); return null; }
  return publicUser(row);
}
function destroySession(db, token) { if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token)); }
function destroyUserSessions(db, userId) { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId); }
function publicUser(r) {
  let list = null;
  try { list = r.sections ? JSON.parse(r.sections) : null; } catch (e) { list = null; }
  return { id: r.id, username: r.username, displayName: r.display_name, role: r.role, roleLabel: (ROLES[r.role] || {}).label || r.role, active: !!r.active, sectionsList: list, createdAt: r.created_at, lastLogin: r.last_login };
}

module.exports = { SECTIONS, SECTION_LABELS, ROLES, permsFor, can, makePw, checkPw, pwProblem, createSession, userFromToken, destroySession, destroyUserSessions, publicUser, SESSION_MS };
