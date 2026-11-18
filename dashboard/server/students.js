'use strict';
const crypto = require('crypto');
const { tx } = require('./db');
const C = require('./content');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SUB = ['none', 'pending', 'active', 'expired'];
const today = () => new Date().toISOString().slice(0, 10);
const day = s => (s ? String(s).slice(0, 10) : null);

function effSub(s) { return s.sub_status === 'active' && s.sub_end && s.sub_end < today() ? 'expired' : s.sub_status; }

function validate(b, data, partial) {
  const e = {};
  const out = {};
  if (!partial || b.name !== undefined) { const n = String(b.name || '').trim(); if (n.length < 2 || n.length > 100) e.name = 'الاسم من 2 إلى 100 حرف'; out.name = n; }
  if (!partial || b.email !== undefined) { const m = String(b.email || '').trim().toLowerCase(); if (!EMAIL.test(m) || m.length > 150) e.email = 'بريد إلكتروني غير صالح'; out.email = m; }
  if (b.phone !== undefined) { const p = String(b.phone || '').trim(); if (p && !/^[+\d][\d\s-]{5,19}$/.test(p)) e.phone = 'رقم هاتف غير صالح'; out.phone = p || null; }
  if (b.status !== undefined) { if (!['active', 'suspended'].includes(b.status)) e.status = 'حالة غير صالحة'; out.status = b.status; }
  if (b.subStatus !== undefined) { if (!SUB.includes(b.subStatus)) e.subStatus = 'حالة اشتراك غير صالحة'; out.sub_status = b.subStatus; }
  for (const [k, col] of [['subStart', 'sub_start'], ['subEnd', 'sub_end']]) {
    if (b[k] !== undefined) { const v = b[k] ? String(b[k]).slice(0, 10) : null; if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) e[k] = 'تاريخ غير صالح'; out[col] = v; }
  }
  if (out.sub_start && out.sub_end && out.sub_end < out.sub_start) e.subEnd = 'تاريخ النهاية قبل البداية';
  if (b.notes !== undefined) out.notes = String(b.notes || '').slice(0, 1000) || null;
  if (b.externalId !== undefined) out.external_id = b.externalId ? String(b.externalId).slice(0, 80) : null;
  let paths;
  if (b.pathIds !== undefined) {
    const valid = new Set((data.paths || []).map(p => p.id));
    paths = Array.isArray(b.pathIds) ? [...new Set(b.pathIds.map(String))] : [];
    if (paths.some(p => !valid.has(p))) e.pathIds = 'مسار غير موجود';
  }
  return { errors: e, out, paths };
}

function progress(db, data, studentId) {
  const enrolled = db.prepare('SELECT path_id FROM student_paths WHERE student_id=?').all(studentId).map(r => r.path_id);
  const done = new Set(db.prepare('SELECT lesson_id FROM lesson_completions WHERE student_id=?').all(studentId).map(r => r.lesson_id));
  let tot = 0, dn = 0;
  const paths = enrolled.map(pid => {
    const ls = C.publishedLessonsOfPath(data, pid), d = ls.filter(l => done.has(l.id)).length;
    tot += ls.length; dn += d;
    return { pathId: pid, name: C.pathName(data, pid), total: ls.length, done: d, pct: ls.length ? Math.round(100 * d / ls.length) : 0 };
  });
  return { paths, total: tot, done: dn, pct: tot ? Math.round(100 * dn / tot) : 0 };
}

function list(db, data, q, flags) {
  const where = [], args = [];
  if (q.q) { where.push('(s.name LIKE ? OR s.email LIKE ? OR IFNULL(s.phone,\'\') LIKE ?)'); const l = '%' + String(q.q).replace(/[%_]/g, '') + '%'; args.push(l, l, l); }
  if (q.status) { where.push('s.status = ?'); args.push(q.status); }
  if (q.pathId) { where.push('EXISTS (SELECT 1 FROM student_paths sp WHERE sp.student_id=s.id AND sp.path_id=?)'); args.push(q.pathId); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  let rows = db.prepare(`SELECT s.*,
      (SELECT COUNT(*) FROM lesson_completions lc WHERE lc.student_id=s.id) completed,
      (SELECT COUNT(DISTINCT quiz_id) FROM quiz_attempts qa WHERE qa.student_id=s.id) quizzes
    FROM students s ${w} ORDER BY s.created_at DESC, s.id DESC`).all(...args);
  if (q.sub) rows = rows.filter(r => effSub(r) === q.sub);
  const total = rows.length, page = Math.max(1, +q.page || 1), size = 25;
  rows = rows.slice((page - 1) * size, page * size);
  const items = rows.map(r => {
    const pr = progress(db, data, r.id);
    return {
      id: r.id, name: r.name, email: r.email, phone: flags.includes('students.contact') ? r.phone : undefined, status: r.status, subStatus: effSub(r),
      subStart: r.sub_start, subEnd: r.sub_end, createdAt: r.created_at, lastActive: r.last_active, completedLessons: r.completed, quizzes: r.quizzes,
      paths: pr.paths.map(p => ({ pathId: p.pathId, name: p.name })), progressPct: pr.pct
    };
  });
  return { items, total, page, pages: Math.max(1, Math.ceil(total / size)) };
}

function create(db, data, b) {
  const v = validate(b, data, false);
  if (Object.keys(v.errors).length) return { errors: v.errors };
  const o = Object.assign({ status: 'active', sub_status: 'none' }, v.out);
  try {
    return tx(db, () => {
      const r = db.prepare(`INSERT INTO students(external_id,name,email,phone,status,sub_status,sub_start,sub_end,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(o.external_id || null, o.name, o.email, o.phone || null, o.status, o.sub_status, o.sub_start || null, o.sub_end || null, o.notes || null, new Date().toISOString());
      const id = Number(r.lastInsertRowid);
      (v.paths || []).forEach(p => db.prepare('INSERT OR IGNORE INTO student_paths VALUES (?,?,?)').run(id, p, new Date().toISOString()));
      return { id };
    });
  } catch (e) {
    if (/UNIQUE/.test(e.message)) return { errors: { email: 'هذا البريد أو المعرّف مسجل لطالب آخر' } };
    throw e;
  }
}

function update(db, data, id, b) {
  const v = validate(b, data, true);
  if (Object.keys(v.errors).length) return { errors: v.errors };
  try {
    tx(db, () => {
      const keys = Object.keys(v.out);
      if (keys.length) db.prepare(`UPDATE students SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).run(...keys.map(k => v.out[k]), id);
      if (v.paths) {
        db.prepare('DELETE FROM student_paths WHERE student_id=?').run(id);
        v.paths.forEach(p => db.prepare('INSERT OR IGNORE INTO student_paths VALUES (?,?,?)').run(id, p, new Date().toISOString()));
      }
    });
  } catch (e) {
    if (/UNIQUE/.test(e.message)) return { errors: { email: 'هذا البريد أو المعرّف مسجل لطالب آخر' } };
    throw e;
  }
  return { ok: true };
}

/* ---------- الشهادات ---------- */
function eligibility(db, data, studentId, pathId) {
  const path = (data.paths || []).find(p => p.id === pathId);
  if (!path) return { eligible: false, reasons: ['المسار غير موجود'] };
  const rule = Object.assign({ lessonsPct: 100, requireQuizzes: false }, path.completion || {});
  const reasons = [];
  const ls = C.publishedLessonsOfPath(data, pathId);
  const done = new Set(db.prepare('SELECT lesson_id FROM lesson_completions WHERE student_id=?').all(studentId).map(r => r.lesson_id));
  const d = ls.filter(l => done.has(l.id)).length, pct = ls.length ? 100 * d / ls.length : 0;
  if (!ls.length) reasons.push('لا توجد دروس منشورة في هذا المسار');
  else if (pct < rule.lessonsPct) reasons.push(`المطلوب إكمال ${rule.lessonsPct}% من الدروس والمكتمل ${Math.floor(pct)}% (${d} من ${ls.length})`);
  if (rule.requireQuizzes) {
    const qs = (data.quizzes || []).filter(q => q.status === 'published' && q.pathId === pathId);
    const passed = new Set(db.prepare('SELECT DISTINCT quiz_id FROM quiz_attempts WHERE student_id=? AND passed=1').all(studentId).map(r => r.quiz_id));
    const miss = qs.filter(q => !passed.has(q.id));
    if (miss.length) reasons.push('اختبارات لم تُجتز: ' + miss.map(q => q.title).join('، '));
  }
  const st = db.prepare('SELECT status FROM students WHERE id=?').get(studentId);
  if (st && st.status !== 'active') reasons.push('حساب الطالب موقوف');
  let completedAt = db.prepare('SELECT MAX(completed_at) m FROM lesson_completions WHERE student_id=? AND path_id=?').get(studentId, pathId).m;
  return { eligible: reasons.length === 0, reasons, rule, progress: { done: d, total: ls.length, pct: Math.floor(pct) }, completedAt: completedAt || new Date().toISOString() };
}

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function newNumber(db) {
  for (;;) {
    const b = crypto.randomBytes(10); let s = '';
    for (let i = 0; i < 10; i++) s += B32[b[i] % 32];
    const n = 'EFH-' + new Date().getUTCFullYear() + '-' + s.slice(0, 5) + '-' + s.slice(5);
    if (!db.prepare('SELECT 1 FROM certificates WHERE number=?').get(n)) return n;
  }
}

function issue(db, data, studentId, pathId, actor, reissueOf) {
  const st = db.prepare('SELECT * FROM students WHERE id=?').get(studentId);
  if (!st) return { status: 404, error: 'الطالب غير موجود' };
  const el = eligibility(db, data, studentId, pathId);
  if (!el.eligible) return { status: 422, error: 'شروط الإنجاز غير مكتملة', reasons: el.reasons };
  const exist = db.prepare(`SELECT number FROM certificates WHERE student_id=? AND path_id=? AND status='valid'`).get(studentId, pathId);
  if (exist && !reissueOf) return { status: 409, error: 'يوجد شهادة سارية لهذا المسار: ' + exist.number };
  const number = newNumber(db);
  return tx(db, () => {
    db.prepare(`INSERT INTO certificates(number,student_id,student_name,path_id,path_name,completed_at,issued_at,issued_by,reissued_from) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(number, studentId, st.name, pathId, C.pathName(data, pathId), el.completedAt, new Date().toISOString(), actor.username, reissueOf || null);
    if (reissueOf) db.prepare(`UPDATE certificates SET status='replaced', replaced_by=? WHERE number=?`).run(number, reissueOf);
    return { number, studentName: st.name, pathName: C.pathName(data, pathId) };
  });
}

const certRow = r => ({ number: r.number, studentId: r.student_id, studentName: r.student_name, pathId: r.path_id, pathName: r.path_name, completedAt: r.completed_at, issuedAt: r.issued_at, issuedBy: r.issued_by, status: r.status, revokedAt: r.revoked_at, revokeReason: r.revoke_reason, replacedBy: r.replaced_by, reissuedFrom: r.reissued_from });

function profile(db, data, id, flags) {
  const s = db.prepare('SELECT * FROM students WHERE id=?').get(id);
  if (!s) return null;
  const pr = progress(db, data, id);
  const lessons = db.prepare('SELECT lesson_id, completed_at FROM lesson_completions WHERE student_id=? ORDER BY completed_at DESC LIMIT 100').all(id)
    .map(r => ({ lessonId: r.lesson_id, title: ((data.lessons || []).find(l => l.id === r.lesson_id) || {}).title || '(محذوف)', completedAt: r.completed_at }));
  const attempts = db.prepare('SELECT quiz_id, score, passed, created_at FROM quiz_attempts WHERE student_id=? ORDER BY id DESC LIMIT 30').all(id)
    .map(r => ({ quizId: r.quiz_id, title: ((data.quizzes || []).find(q => q.id === r.quiz_id) || {}).title || '(محذوف)', score: r.score, passed: !!r.passed, at: r.created_at }));
  const certs = db.prepare('SELECT * FROM certificates WHERE student_id=? ORDER BY id DESC').all(id).map(certRow);
  const sessions = db.prepare('SELECT COUNT(*) n, IFNULL(SUM(active_seconds),0) sec FROM web_sessions WHERE student_id=?').get(id);
  const elig = pr.paths.map(p => Object.assign({ pathId: p.pathId, name: p.name }, eligibility(db, data, id, p.pathId)));
  return {
    student: { id: s.id, externalId: s.external_id, name: s.name, email: s.email, phone: flags.includes('students.contact') ? s.phone : undefined, status: s.status, subStatus: effSub(s), subStart: s.sub_start, subEnd: s.sub_end, notes: s.notes, createdAt: s.created_at, lastActive: s.last_active },
    progress: pr, lessons, attempts, certificates: certs, sessions: { count: sessions.n, seconds: sessions.sec }, eligibility: elig
  };
}

module.exports = { list, create, update, profile, eligibility, issue, certRow, progress, effSub, day };
