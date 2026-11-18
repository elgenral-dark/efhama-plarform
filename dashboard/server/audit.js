'use strict';
/*
 * سجل العمليات — يُكتب من الخادم فقط، ولا يوجد أي مسار API لتعديله أو حذفه.
 * في قاعدة البيانات: triggers تمنع UPDATE/DELETE + سلسلة تجزئة (hash chain) لكشف أي تلاعب مباشر في الملف.
 */
const crypto = require('crypto');
const { tx } = require('./db');

const SECRET_KEY = /(pass(word)?|secret|token|api[_-]?key|salt|hash|authorization)/i;
const MAX = 20000;

function redact(v) {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = SECRET_KEY.test(k) ? '[مخفي]' : redact(v[k]);
    return o;
  }
  return v;
}
function mask(s) { s = String(s || ''); return s.length <= 4 ? '••••' : '••••' + s.slice(-3); }
function pack(o) {
  if (o === undefined || o === null) return null;
  let s = JSON.stringify(redact(o));
  if (s.length > MAX) s = JSON.stringify({ _truncated: true, preview: s.slice(0, MAX - 200) });
  return s;
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function log(db, actor, e) {
  const a = actor || { id: null, username: 'system', displayName: 'النظام' };
  const row = {
    ts: new Date().toISOString(), user_id: a.id == null ? null : a.id, username: a.username, display_name: a.displayName || null,
    action: e.action, section: e.section, target_type: e.targetType || null, target_id: e.targetId == null ? null : String(e.targetId),
    target_name: e.targetName ? String(e.targetName).slice(0, 200) : null, before_json: pack(e.before), after_json: pack(e.after),
    details: e.details ? String(e.details).slice(0, 1000) : null, ip: e.ip || null
  };
  const run = () => {
    const last = db.prepare('SELECT row_hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
    const prev = last ? last.row_hash : '0'.repeat(64);
    const rowHash = sha(prev + JSON.stringify(row));
    db.prepare(`INSERT INTO audit_log(ts,user_id,username,display_name,action,section,target_type,target_id,target_name,before_json,after_json,details,ip,prev_hash,row_hash)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(row.ts, row.user_id, row.username, row.display_name, row.action, row.section, row.target_type, row.target_id,
      row.target_name, row.before_json, row.after_json, row.details, row.ip, prev, rowHash);
  };
  if (db.isTransaction) run(); else tx(db, run);
}

function verifyChain(db) {
  let prev = '0'.repeat(64), n = 0;
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id').all();
  for (const r of rows) {
    const row = {
      ts: r.ts, user_id: r.user_id, username: r.username, display_name: r.display_name, action: r.action, section: r.section, target_type: r.target_type,
      target_id: r.target_id, target_name: r.target_name, before_json: r.before_json, after_json: r.after_json, details: r.details, ip: r.ip
    };
    if (r.prev_hash !== prev || sha(prev + JSON.stringify(row)) !== r.row_hash) return { ok: false, brokenAt: r.id, checked: n };
    prev = r.row_hash; n++;
  }
  return { ok: true, checked: n };
}

/* ---------- مقارنة نسختين من بيانات المحتوى ---------- */
const COLLS = {
  paths: 'paths', modules: 'modules', lessons: 'lessons', questions: 'questions', quizzes: 'quizzes', projects: 'projects', assets: 'assets', glossary: 'glossary',
  'gamification.xpRules': 'gamification', 'gamification.levels': 'gamification', 'gamification.badges': 'gamification',
  'gamification.encouragements': 'gamification', 'gamification.dailyChallenges': 'gamification'
};
const TYPE_AR = { paths: 'مسار', modules: 'وحدة', lessons: 'درس', questions: 'سؤال', quizzes: 'اختبار', projects: 'مشروع', assets: 'رسم', glossary: 'مصطلح',
  'gamification.xpRules': 'قاعدة XP', 'gamification.levels': 'مستوى', 'gamification.badges': 'شارة', 'gamification.encouragements': 'رسالة تشجيع', 'gamification.dailyChallenges': 'تحدٍّ يومي' };
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const nameOf = x => String(x.name || x.title || x.ar || x.text || x.id || '').slice(0, 120);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function strip(o, keys) { const c = Object.assign({}, o); keys.forEach(k => delete c[k]); return c; }

function flatten(o, prefix, out) {
  out = out || {};
  if (o && typeof o === 'object' && !Array.isArray(o)) for (const k of Object.keys(o)) flatten(o[k], prefix ? prefix + '.' + k : k, out);
  else out[prefix] = o;
  return out;
}

function diffContent(oldD, newD) {
  const changes = [];
  for (const coll of Object.keys(COLLS)) {
    const section = COLLS[coll], type = TYPE_AR[coll];
    const A = new Map((getPath(oldD, coll) || []).map(x => [x.id, x]));
    const B = new Map((getPath(newD, coll) || []).map(x => [x.id, x]));
    let reorders = 0;
    for (const [id, b] of B) {
      if (!A.has(id)) { changes.push({ section, coll, action: 'create', type, id, name: nameOf(b), after: b, details: 'إضافة ' + type }); continue; }
      const a = A.get(id);
      if (same(a, b)) continue;
      const ignore = ['order', 'updatedAt'];
      if (same(strip(a, ignore), strip(b, ignore))) { reorders++; continue; }
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => k !== 'updatedAt' && !same(a[k], b[k]));
      let action = 'update', details = 'تعديل الحقول: ' + keys.join('، ');
      if (a.status !== b.status && (b.status === 'published' || a.status === 'published') && keys.every(k => ['status', 'order', 'ai', 'aiMeta'].includes(k) || k === 'status')) {
        action = b.status === 'published' ? 'publish' : 'unpublish'; details = (b.status === 'published' ? 'نشر ' : 'إلغاء نشر ') + type;
      } else if (a.status !== b.status && b.status === 'published') { details += ' (مع النشر)'; }
      changes.push({ section, coll, action, type, id, name: nameOf(b), before: a, after: b, details });
    }
    for (const [id, a] of A) if (!B.has(id)) changes.push({ section, coll, action: 'delete', type, id, name: nameOf(a), before: a, details: 'حذف ' + type });
    if (reorders) changes.push({ section, coll, action: 'reorder', type, id: coll, name: type, details: 'إعادة ترتيب ' + reorders + ' عنصر', reorderOnly: true });
  }
  const sa = flatten(oldD.settings || {}, ''), sb = flatten(newD.settings || {}, '');
  const keys = [...new Set([...Object.keys(sa), ...Object.keys(sb)])].filter(k => !same(sa[k], sb[k]));
  if (keys.length) {
    const before = {}, after = {}; keys.forEach(k => { before[k] = sa[k]; after[k] = sb[k]; });
    changes.push({ section: 'settings', coll: 'settings', action: 'update', type: 'إعدادات المنصة', id: 'settings', name: 'إعدادات المنصة', before, after, details: 'تعديل: ' + keys.join('، ') });
  }
  if (!same((oldD.gamification || {}).rules, (newD.gamification || {}).rules)) {
    changes.push({ section: 'gamification', coll: 'gamification.rules', action: 'update', type: 'قواعد الاحتساب', id: 'rules', name: 'قواعد الاحتساب', before: (oldD.gamification || {}).rules, after: (newD.gamification || {}).rules, details: 'تعديل قواعد الاحتساب' });
  }
  if (!same(oldD.usage, newD.usage)) changes.push({ section: 'data', coll: 'usage', action: 'update', type: 'بيانات الاستخدام', id: 'usage', name: 'usage', details: 'تعديل بيانات الاستخدام (استيراد)' });
  return changes;
}

module.exports = { log, verifyChain, diffContent, redact, mask, COLLS };
