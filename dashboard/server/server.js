#!/usr/bin/env node
/*
 * Efhama Dashboard server — بدون مكتبات خارجية (يحتاج Node 22.13+ لقاعدة SQLite المدمجة).
 *
 * التشغيل الأول:
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD='كلمة-مرور-10-أحرف-أو-أكثر' node server/server.js
 * (تُستخدم هذه المتغيرات لإنشاء أول Super Admin فقط عندما تكون قاعدة المستخدمين فارغة.)
 *
 * متغيرات اختيارية: PORT, HOST, DATA_DIR, COOKIE_SECURE=1, PUBLIC_BASE_URL, TRUST_PROXY=1,
 *   SITE_ORIGINS (نطاقات الموقع المسموح لها بإرسال أحداث التتبع، مفصولة بفاصلة),
 *   SITE_API_KEY (مفتاح خادم-لخادم لمزامنة الطلاب والمدفوعات), AI_API_KEY (مفتاح مزوّد الذكاء الاصطناعي)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EfhamaData = require('../integration/efhama-data.js');
const { open, tx } = require('./db');
const A = require('./auth');
const AUD = require('./audit');
const ST = require('./students');
const AN = require('./analytics');
const TR = require('./track');
const AI = require('./ai');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const DATA_FILE = path.join(DATA_DIR, 'efhama-data.json');
const PUBLIC_DIR = path.join(DATA_DIR, 'public');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_DATA = 8 * 1024 * 1024;
const MAX_UPLOAD = 100 * 1024 * 1024;
const SITE_ORIGINS = (process.env.SITE_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

if (!fs.existsSync(DATA_FILE)) { fs.mkdirSync(DATA_DIR, { recursive: true }); console.error('ملف البيانات الأولي غير موجود: ' + DATA_FILE); process.exit(1); }
const db = open(DATA_DIR);

/* ---------- إنشاء أول مدير ---------- */
(function bootstrap() {
  const n = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  const pw = process.env.ADMIN_PASSWORD, hashEnv = process.env.ADMIN_PASSWORD_HASH;
  if (n > 0) { if (pw) console.log('ملاحظة: المستخدمون موجودون، تم تجاهل ADMIN_PASSWORD.'); return; }
  const username = (process.env.ADMIN_USERNAME || 'admin').trim();
  let salt, hash;
  if (hashEnv && hashEnv.includes(':')) { const [s, k] = hashEnv.split(':'); salt = Buffer.from(s, 'hex'); hash = Buffer.from(k, 'hex'); }
  else {
    const p = A.pwProblem(pw);
    if (p) { console.error('\n✖ لا يوجد مستخدمون. عيّن ADMIN_PASSWORD (10 أحرف على الأقل) لإنشاء أول Super Admin.\n  مثال: ADMIN_USERNAME=admin ADMIN_PASSWORD="غيّرني-كلمة-قوية" node server/server.js\n'); process.exit(1); }
    ({ salt, hash } = A.makePw(pw));
  }
  db.prepare('INSERT INTO users(username,display_name,role,pw_salt,pw_hash,created_at) VALUES (?,?,?,?,?,?)').run(username, username, 'super_admin', salt, hash, new Date().toISOString());
  AUD.log(db, null, { action: 'create', section: 'users', targetType: 'مستخدم', targetId: username, targetName: username, details: 'إنشاء أول Super Admin عند تشغيل الخادم' });
  console.log('تم إنشاء المستخدم الأول: ' + username);
})();

/* ---------- بذور تجريبية لطلبات الاشتراك ---------- */
(function seedSubscriptionRequests() {
  try {
    const n = db.prepare('SELECT COUNT(*) n FROM subscription_requests').get().n;
    if (n === 0) {
      db.prepare(`INSERT INTO subscription_requests(student_name, student_email, student_phone, amount, currency, method, reference, plan_duration_months, status, created_at, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'كريم عادل محمد', 'kareem.adel@example.com', '01098765432', 199.5, 'EGP', 'فودافون كاش', 'VF-9482710', 12, 'pending',
        new Date(Date.now() - 3600000 * 3).toISOString(), 'تم التحويل من محفظة فودافون كاش 01098765432 إلى رقم المنصة'
      );
      db.prepare(`INSERT INTO subscription_requests(student_name, student_email, student_phone, amount, currency, method, reference, plan_duration_months, status, created_at, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'سارة محمود علي', 'sara.mahmoud@example.com', '01123456789', 199.5, 'EGP', 'إنستاباي InstaPay', 'INSTA-883019', 12, 'pending',
        new Date(Date.now() - 3600000 * 7).toISOString(), 'إيصال تحويل إنستاباي - كود العملية INSTA-883019'
      );
    }
  } catch (e) { /* ignore */ }
})();

/* ---------- أدوات ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.webm': 'video/webm', '.mp4': 'video/mp4' };
const CSP = "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' https: blob:; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://drive.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const CSP_SELF_FRAME = CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'");

function send(res, code, body, headers) {
  const h = Object.assign({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'no-store' }, headers || {});
  if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) { body = JSON.stringify(body); h['Content-Type'] = 'application/json; charset=utf-8'; }
  res.writeHead(code, h); res.end(body);
}
const err = (res, code, msg, extra) => send(res, code, Object.assign({ error: msg }, extra || {}));
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('الحجم أكبر من المسموح'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function readJson(req, limit) {
  const t = await readBody(req, limit);
  try { return JSON.parse(t || '{}'); } catch (e) { throw Object.assign(new Error('JSON غير صالح'), { status: 400 }); }
}
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, content); fs.renameSync(tmp, file);
}
function cookies(req) {
  const o = {};
  (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return o;
}
function clientIp(req) {
  if (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || 'x';
}
const buckets = new Map();
function limited(key, limit, windowMs) {
  const now = Date.now(); let b = buckets.get(key);
  if (!b || b.until < now) b = { n: 0, until: now + windowMs };
  b.n++; buckets.set(key, b);
  return b.n > limit;
}
setInterval(() => { const n = Date.now(); buckets.forEach((v, k) => { if (v.until < n) buckets.delete(k); }); db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(n); }, 60000).unref();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function addMonths(startStr, months) {
  const d = new Date(startStr || Date.now());
  d.setMonth(d.getMonth() + (Number(months) || 12));
  return d.toISOString().slice(0, 10);
}

/* ---------- بيانات المحتوى ---------- */
function readData() { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function subscriptionCfg() {
  const r = db.prepare("SELECT value FROM settings_kv WHERE key='subscription'").get();
  let v = {}; try { v = r ? JSON.parse(r.value) : {}; } catch (e) { v = {}; }
  return { price: v.price == null ? null : v.price, currencyLabel: v.currencyLabel || '', cashNumber: v.cashNumber || '', whatsapp: v.whatsapp || '' };
}
function publish() {
  const view = EfhamaData.publicView(readData());
  view.subscription = subscriptionCfg(); // مصدر الإعدادات المركزي الوحيد لصفحات الاشتراك والدفع
  atomicWrite(path.join(PUBLIC_DIR, 'efhama-data.json'), JSON.stringify(view));
}
function backup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, 'efhama-data-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'));
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort();
  files.slice(0, Math.max(0, files.length - 30)).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
}
function validData(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'البيانات يجب أن تكون كائنًا';
  for (const k of ['paths', 'modules', 'lessons', 'questions', 'quizzes', 'projects', 'assets', 'glossary']) if (d[k] !== undefined && !Array.isArray(d[k])) return 'الحقل ' + k + ' يجب أن يكون قائمة';
  for (const k of ['lessons', 'modules', 'questions']) {
    const seen = new Set();
    for (const x of d[k] || []) {
      if (!x || typeof x.id !== 'string') return 'عنصر بدون معرّف في ' + k;
      if (seen.has(x.id)) return 'معرّف مكرر في ' + k + ': ' + x.id;
      seen.add(x.id);
    }
  }
  for (const l of d.lessons || []) {
    if (l.status === 'published' && l.aiMeta && l.aiMeta.generated && !l.aiMeta.reviewed) return 'لا يمكن نشر درس مولَّد بالذكاء الاصطناعي دون مراجعة بشرية وموافقة صريحة: ' + (l.title || l.id);
  }
  return '';
}

/* ---------- الرفع ---------- */
function sniff(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  // MP4: ftyp box
  if (buf.length > 12 && buf.toString('latin1', 4, 8) === 'ftyp') return 'mp4';
  // WebM: EBML header 1A 45 DF A3
  if (buf.length > 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  const head = buf.toString('utf8', 0, Math.min(buf.length, 600)).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    if (/<script|javascript:|\son\w+\s*=|<foreignobject|<iframe/.test(buf.toString('utf8').toLowerCase())) return 'unsafe-svg';
    return 'svg';
  }
  return null;
}

/* ---------- API ---------- */
const WRITE_ACTIONS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
function logA(ctx, e) { AUD.log(db, ctx.user, Object.assign({ ip: ctx.ip }, e)); }
const can = (ctx, section, level) => A.can(ctx.perms, section, level || 'view');
const flag = (ctx, f) => ctx.perms.flags.includes(f);
function deny(res, what) { return err(res, 403, 'ليست لديك صلاحية' + (what ? ': ' + what : '')); }

function siteKeyOk(req) {
  const k = process.env.SITE_API_KEY, h = req.headers['x-site-key'];
  if (!k || typeof h !== 'string') return false;
  const a = crypto.createHash('sha256').update(k).digest(), b = crypto.createHash('sha256').update(h).digest();
  return crypto.timingSafeEqual(a, b);
}
function corsFor(req) {
  const o = req.headers.origin;
  if (o && SITE_ORIGINS.includes(o)) return { 'Access-Control-Allow-Origin': o, Vary: 'Origin', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  return {};
}

async function api(req, res, url) {
  const m = req.method, p = url.pathname, ip = clientIp(req);

  /* --- واجهات الموقع العامة (بدون جلسة إدارة) --- */
  if (p === '/api/track') {
    const cors = corsFor(req);
    if (m === 'OPTIONS') return send(res, 204, '', cors);
    if (m !== 'POST') return err(res, 405, 'method');
    const o = req.headers.origin;
    if (o && new URL(o).host !== req.headers.host && !SITE_ORIGINS.includes(o)) return err(res, 403, 'مصدر غير مسموح');
    if (limited('track:' + ip, 300, 60000)) return send(res, 429, { error: 'كثير' }, cors);
    let body; try { body = await readJson(req, 64 * 1024); } catch (e) { return send(res, e.status || 400, { error: e.message }, cors); }
    return send(res, 200, TR.ingest(db, readData(), body), cors);
  }
  if (p.startsWith('/api/site/')) {
    if (!process.env.SITE_API_KEY) return err(res, 503, 'واجهة المزامنة غير مفعّلة (SITE_API_KEY غير مضبوط)');
    if (!siteKeyOk(req)) return err(res, 401, 'مفتاح غير صحيح');
    const sys = { id: null, username: 'site', displayName: 'الموقع (API)' };
    let b; try { b = await readJson(req, 256 * 1024); } catch (e) { return err(res, e.status || 400, e.message); }
    if (p === '/api/site/students/upsert' && m === 'POST') {
      const ext = String(b.externalId || '').trim();
      if (!ext) return err(res, 422, 'externalId مطلوب');
      const ex = db.prepare('SELECT id FROM students WHERE external_id=? OR email=?').get(ext, String(b.email || '').toLowerCase());
      const r = ex ? ST.update(db, readData(), ex.id, Object.assign({}, b, { externalId: ext })) : ST.create(db, readData(), Object.assign({}, b, { externalId: ext }));
      if (r.errors) return err(res, 422, 'بيانات غير صالحة', { fields: r.errors });
      AUD.log(db, sys, { action: ex ? 'update' : 'create', section: 'students', targetType: 'طالب', targetId: ex ? ex.id : r.id, targetName: String(b.name || ''), details: 'مزامنة من الموقع', ip });
      if (b.subStatus === 'pending') {
        const studentId = ex ? ex.id : r.id;
        const stuEmail = String(b.email || '').toLowerCase();
        const hasReq = db.prepare("SELECT id FROM subscription_requests WHERE student_email=? AND status='pending'").get(stuEmail);
        if (!hasReq) {
          db.prepare(`INSERT INTO subscription_requests(student_id, student_name, student_email, student_phone, amount, currency, method, reference, plan_duration_months, status, created_at, notes)
            VALUES (?, ?, ?, ?, ?, 'EGP', 'تسجيل الموقع', NULL, 12, 'pending', ?, 'طالب في انتظار تفعيل الاشتراك من الموقع')`)
            .run(studentId, String(b.name || ''), stuEmail, b.phone || null, subscriptionCfg().price || 0, new Date().toISOString());
        }
      }
      return send(res, 200, { ok: true, id: ex ? ex.id : r.id });
    }
    if (p === '/api/site/payments' && m === 'POST') {
      const amount = Number(b.amount), ref = String(b.reference || '').slice(0, 100);
      if (!(amount >= 0) || !ref) return err(res, 422, 'amount و reference مطلوبان');
      const stu = b.studentExternalId ? db.prepare('SELECT id FROM students WHERE external_id=?').get(String(b.studentExternalId)) : null;
      try { db.prepare('INSERT INTO payments(student_id,amount,currency,reference,paid_at,verified) VALUES (?,?,?,?,?,?)').run(stu ? stu.id : null, amount, String(b.currency || '').slice(0, 10), ref, new Date(b.paidAt || Date.now()).toISOString(), b.verified ? 1 : 0); }
      catch (e) { return err(res, /UNIQUE/.test(e.message) ? 409 : 400, /UNIQUE/.test(e.message) ? 'مرجع الدفع مسجل مسبقًا' : 'بيانات غير صالحة'); }
      AUD.log(db, sys, { action: 'create', section: 'subscriptions', targetType: 'دفعة', targetId: ref, targetName: ref, details: 'تسجيل دفعة من الموقع (المبلغ غير مسجل في السجل)', ip });
      return send(res, 200, { ok: true });
    }
    if (p === '/api/site/subscription-requests' && m === 'POST') {
      const name = String(b.studentName || b.name || '').trim();
      const email = String(b.studentEmail || b.email || '').trim().toLowerCase();
      if (!name || !email) return err(res, 422, 'studentName و studentEmail مطلوبان');
      const amount = Number(b.amount) >= 0 ? Number(b.amount) : (subscriptionCfg().price || 0);
      const currency = String(b.currency || 'EGP').slice(0, 10);
      const ref = String(b.reference || b.requestCode || '').slice(0, 100);
      const stu = b.studentExternalId ? db.prepare('SELECT id FROM students WHERE external_id=?').get(String(b.studentExternalId)) : db.prepare('SELECT id FROM students WHERE email=?').get(email);
      const r = db.prepare(`INSERT INTO subscription_requests(student_id, student_name, student_email, student_phone, amount, currency, method, reference, proof_url, plan_duration_months, status, created_at, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
        .run(stu ? stu.id : null, name, email, b.phone || b.studentPhone || null, amount, currency, b.method || 'فودافون كاش', ref || null, b.proofUrl || null, Number(b.planDurationMonths) || 12, new Date().toISOString(), b.notes || null);
      const reqId = Number(r.lastInsertRowid);
      AUD.log(db, sys, { action: 'create', section: 'subscriptions', targetType: 'طلب اشتراك', targetId: reqId, targetName: name, details: 'طلب اشتراك وارد من الموقع', ip });
      return send(res, 200, { ok: true, id: reqId });
    }
    return err(res, 404, 'غير موجود');
  }
  if (p.startsWith('/api/verify/') && m === 'GET') {
    if (limited('verify:' + ip, 60, 60000)) return err(res, 429, 'محاولات كثيرة');
    return send(res, 200, verifyPayload(decodeURIComponent(p.slice(12)).toUpperCase()));
  }

  /* --- حماية CSRF لكل ما يكتب --- */
  if (WRITE_ACTIONS.has(m)) {
    if (req.headers['x-requested-with'] !== 'efhama') return err(res, 403, 'طلب مرفوض');
    const o = req.headers.origin;
    if (o && new URL(o).host !== req.headers.host) return err(res, 403, 'مصدر الطلب غير مسموح');
  }

  const token = cookies(req).efhama_sid;
  const user = A.userFromToken(db, token);
  if (p === '/api/health' && m === 'GET') return send(res, 200, { efhama: true, authRequired: true, authenticated: !!user, multiUser: true });

  if (p === '/api/login' && m === 'POST') {
    let b; try { b = await readJson(req, 4096); } catch (e) { return err(res, 400, 'طلب غير صالح'); }
    const uname = String(b.username || '').trim().slice(0, 64);
    const key = 'login:' + ip + ':' + uname.toLowerCase();
    if (limited(key, 5, 15 * 60000) || limited('loginip:' + ip, 30, 15 * 60000)) return err(res, 429, 'محاولات كثيرة. حاول بعد قليل.');
    const row = uname ? db.prepare('SELECT * FROM users WHERE username=?').get(uname) : null;
    const ok = row ? A.checkPw(String(b.password || ''), row.pw_salt, row.pw_hash) : (A.checkPw(String(b.password || ''), Buffer.alloc(16), Buffer.alloc(64)), false);
    if (!ok || !row.active) {
      await new Promise(r => setTimeout(r, 400));
      AUD.log(db, { id: row ? row.id : null, username: uname || '(فارغ)', displayName: row ? row.display_name : null }, { action: 'login_failed', section: 'users', details: row && !row.active ? 'حساب معطّل' : 'بيانات دخول غير صحيحة', ip });
      return err(res, 401, 'اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    buckets.delete(key);
    db.prepare('UPDATE users SET last_login=? WHERE id=?').run(new Date().toISOString(), row.id);
    const t = A.createSession(db, row.id), u = A.publicUser(row);
    AUD.log(db, u, { action: 'login', section: 'users', targetType: 'مستخدم', targetId: u.id, targetName: u.username, details: 'تسجيل دخول', ip });
    const secure = process.env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'efhama_sid=' + t + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + A.SESSION_MS / 1000 + (secure ? '; Secure' : '') });
  }
  if (p === '/api/logout' && m === 'POST') {
    if (user) AUD.log(db, user, { action: 'logout', section: 'users', targetType: 'مستخدم', targetId: user.id, targetName: user.username, details: 'تسجيل خروج', ip });
    A.destroySession(db, token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'efhama_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (!user) return err(res, 401, 'غير مصرّح. سجّل الدخول.');
  const ctx = { user, perms: A.permsFor(user), ip };

  if (p === '/api/me' && m === 'GET') {
    return send(res, 200, { user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, roleLabel: user.roleLabel }, perms: ctx.perms,
      sectionLabels: A.SECTION_LABELS, roles: Object.keys(A.ROLES).map(k => ({ id: k, label: A.ROLES[k].label })), aiKeyConfigured: !!process.env.AI_API_KEY });
  }

  /* ----- المحتوى ----- */
  if (p === '/api/data' && m === 'GET') {
    if (!Object.keys(ctx.perms.sections).some(k => !['users', 'logs', 'subscriptions'].includes(k))) return deny(res);
    try { return send(res, 200, readData()); } catch (e) { return err(res, 500, e.message); }
  }
  if (p === '/api/data' && m === 'PUT') {
    let d; try { d = await readJson(req, MAX_DATA); } catch (e) { return err(res, e.status || 400, e.message); }
    const bad = validData(d); if (bad) return err(res, 422, bad);
    const cur = readData(), curRev = Number(cur.rev) || 0;
    if ((Number(d.rev) || 0) !== curRev) return err(res, 409, 'تم تعديل البيانات من مكان آخر. أعد التحميل.');
    const changes = AUD.diffContent(cur, d);
    const denied = [...new Set(changes.filter(c => !can(ctx, c.section, 'edit')).map(c => A.SECTION_LABELS[c.section] || c.section))];
    if (denied.length) return deny(res, 'لا يمكنك تعديل: ' + denied.join('، '));
    d.rev = curRev + 1;
    try {
      tx(db, () => {
        for (const c of changes) logA(ctx, { action: c.action, section: c.section, targetType: c.type, targetId: c.id, targetName: c.name, before: c.before, after: c.after, details: c.details });
        backup(); atomicWrite(DATA_FILE, JSON.stringify(d, null, 2));
      });
      publish();
    } catch (e) { return err(res, 500, 'تعذر الحفظ على الخادم: ' + e.message); }
    return send(res, 200, { ok: true, rev: d.rev, savedAt: new Date().toISOString(), logged: changes.length });
  }
  if (p === '/api/upload' && m === 'POST') {
    if (!can(ctx, 'assets', 'edit')) return deny(res, 'رفع الملفات');
    let b; try { b = await readJson(req, MAX_UPLOAD * 1.4); } catch (e) { return err(res, e.status || 400, e.message); }
    const mm = /^data:(?:image\/(?:png|jpeg|webp|svg\+xml)|video\/(?:mp4|webm));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dataUrl || ''));
    if (!mm) return err(res, 400, 'الصيغة غير مدعومة');
    const buf = Buffer.from(mm[1], 'base64');
    if (buf.length > MAX_UPLOAD) return err(res, 413, 'الملف أكبر من 100MB');
    const kind = sniff(buf);
    if (!kind) return err(res, 400, 'محتوى الملف ليس صورة أو فيديو صالح');
    if (kind === 'unsafe-svg') return err(res, 400, 'ملف SVG يحتوي على عناصر غير آمنة (سكربت)');
    const file = Date.now().toString(36) + '-' + crypto.randomBytes(5).toString('hex') + '.' + kind;
    atomicWrite(path.join(UPLOAD_DIR, file), buf);
    logA(ctx, { action: 'upload', section: 'assets', targetType: 'ملف', targetId: file, targetName: String(b.name || file).slice(0, 100), details: 'رفع ملف ' + kind + ' (' + buf.length + ' بايت)' });
    return send(res, 200, { ok: true, url: '/uploads/' + file, size: buf.length });
  }
  if (p === '/api/upload' && m === 'DELETE') {
    if (!can(ctx, 'assets', 'edit')) return deny(res, 'حذف الملفات');
    const f = path.basename(url.searchParams.get('file') || ''), full = path.join(UPLOAD_DIR, f);
    if (f && full.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(full)) { fs.unlinkSync(full); logA(ctx, { action: 'delete', section: 'assets', targetType: 'ملف', targetId: f, targetName: f, details: 'حذف ملف مرفوع' }); }
    return send(res, 200, { ok: true });
  }

  /* ----- الاشتراكات (إعدادات مركزية) ----- */
  if (p === '/api/subscription' && m === 'GET') {
    if (!can(ctx, 'subscriptions')) return deny(res);
    const r = db.prepare("SELECT updated_at, updated_by FROM settings_kv WHERE key='subscription'").get() || {};
    return send(res, 200, Object.assign(subscriptionCfg(), { updatedAt: r.updated_at || null, updatedBy: r.updated_by || null }));
  }
  if (p === '/api/subscription' && m === 'PUT') {
    if (!can(ctx, 'subscriptions', 'edit')) return deny(res, 'تعديل إعدادات الاشتراك');
    let b; try { b = await readJson(req, 4096); } catch (e) { return err(res, 400, e.message); }
    if (b.confirmed !== true) return err(res, 422, 'يجب تأكيد الحفظ صراحةً');
    const e = {}, v = {};
    if (b.price === null || b.price === '' || b.price === undefined) v.price = null;
    else { const n = Number(b.price); if (!Number.isFinite(n) || n < 0 || n > 10000000) e.price = 'سعر غير صالح'; else v.price = Math.round(n * 100) / 100; }
    v.currencyLabel = String(b.currencyLabel || '').trim().slice(0, 20);
    const cash = String(b.cashNumber || '').trim();
    if (cash && !/^[+\d][\d\s-]{5,19}$/.test(cash)) e.cashNumber = 'رقم كاش غير صالح'; v.cashNumber = cash;
    const wa = String(b.whatsapp || '').replace(/[\s-]/g, '');
    if (wa && !/^\+?\d{8,15}$/.test(wa)) e.whatsapp = 'رقم واتساب غير صالح (أرقام فقط مع + اختياري)'; v.whatsapp = wa;
    if (Object.keys(e).length) return err(res, 422, 'بيانات غير صالحة', { fields: e });
    const before = subscriptionCfg();
    const ch = ['price', 'currencyLabel', 'cashNumber', 'whatsapp'].filter(k => String(before[k] == null ? '' : before[k]) !== String(v[k] == null ? '' : v[k]));
    try {
      tx(db, () => {
        db.prepare("INSERT INTO settings_kv(key,value,updated_at,updated_by) VALUES ('subscription',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by")
          .run(JSON.stringify(v), new Date().toISOString(), ctx.user.username);
        const L = { price: 'تغيير سعر الاشتراك', cashNumber: 'تغيير رقم الكاش', whatsapp: 'تغيير رقم الواتساب', currencyLabel: 'تغيير وحدة السعر' };
        const mk = o => ({ price: o.price, currencyLabel: o.currencyLabel, cashNumber: o.cashNumber ? AUD.mask(o.cashNumber) : '', whatsapp: o.whatsapp });
        ch.forEach(k => logA(ctx, { action: 'update', section: 'subscriptions', targetType: 'إعدادات الاشتراك', targetId: k, targetName: L[k], before: { [k]: mk(before)[k] }, after: { [k]: mk(v)[k] }, details: L[k] + (k === 'cashNumber' ? ' (القيمة مخفية جزئيًا)' : '') }));
      });
      publish();
    } catch (x) { return err(res, 500, 'تعذر الحفظ: ' + x.message); }
    return send(res, 200, Object.assign({ ok: true, changed: ch }, subscriptionCfg()));
  }

  /* ----- طلبات الاشتراك ومراجعة المدفوعات المعلقة ----- */
  if (p === '/api/subscription-requests' && m === 'GET') {
    if (!can(ctx, 'subscriptions')) return deny(res);
    const status = String(url.searchParams.get('status') || '').trim();
    const q = String(url.searchParams.get('q') || '').trim();
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 25));

    const where = [];
    const args = [];
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      where.push('sr.status = ?');
      args.push(status);
    }
    if (q) {
      where.push('(sr.student_name LIKE ? OR sr.student_email LIKE ? OR IFNULL(sr.student_phone,\'\') LIKE ? OR IFNULL(sr.reference,\'\') LIKE ?)');
      const l = '%' + q.replace(/[%_]/g, '') + '%';
      args.push(l, l, l, l);
    }

    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = db.prepare(`SELECT COUNT(*) n FROM subscription_requests sr ${w}`).get(...args).n;
    const offset = (page - 1) * limit;
    const rows = db.prepare(`SELECT sr.*, s.status AS student_account_status, s.sub_status AS student_sub_status
      FROM subscription_requests sr
      LEFT JOIN students s ON s.id = sr.student_id
      ${w}
      ORDER BY CASE sr.status WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, sr.created_at DESC, sr.id DESC
      LIMIT ? OFFSET ?`).all(...args, limit, offset);

    const counts = {
      pending: db.prepare("SELECT COUNT(*) n FROM subscription_requests WHERE status='pending'").get().n,
      approved: db.prepare("SELECT COUNT(*) n FROM subscription_requests WHERE status='approved'").get().n,
      rejected: db.prepare("SELECT COUNT(*) n FROM subscription_requests WHERE status='rejected'").get().n,
      total: db.prepare("SELECT COUNT(*) n FROM subscription_requests").get().n
    };

    const items = rows.map(r => ({
      id: r.id,
      studentId: r.student_id,
      studentName: r.student_name,
      studentEmail: r.student_email,
      studentPhone: r.student_phone || '',
      amount: r.amount,
      currency: r.currency || 'EGP',
      method: r.method || 'فودافون كاش',
      reference: r.reference || '',
      proofUrl: r.proof_url || '',
      planDurationMonths: r.plan_duration_months || 12,
      status: r.status,
      rejectionReason: r.rejection_reason || '',
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
      reviewedBy: r.reviewed_by,
      notes: r.notes || '',
      studentAccountStatus: r.student_account_status,
      studentSubStatus: r.student_sub_status
    }));

    return send(res, 200, {
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      counts
    });
  }

  if (p === '/api/subscription-requests' && m === 'POST') {
    if (!can(ctx, 'subscriptions', 'edit')) return deny(res, 'إضافة طلب اشتراك');
    let b; try { b = await readJson(req, 16384); } catch (e) { return err(res, 400, e.message); }
    const name = String(b.studentName || '').trim();
    const email = String(b.studentEmail || '').trim().toLowerCase();
    if (!name || name.length < 2) return err(res, 422, 'اسم الطالب مطلوب (حرفان على الأقل)');
    if (!email || !EMAIL_REGEX.test(email)) return err(res, 422, 'بريد إلكتروني صالح مطلوب');
    const amount = Number(b.amount) >= 0 ? Number(b.amount) : 0;
    const currency = String(b.currency || 'EGP').slice(0, 10);
    const method = String(b.method || 'فودافون كاش').slice(0, 50);
    const reference = String(b.reference || '').slice(0, 100);
    const proofUrl = String(b.proofUrl || '').slice(0, 2000);
    const planDuration = Math.max(1, Math.min(60, Number(b.planDurationMonths) || 12));
    const notes = String(b.notes || '').slice(0, 1000);

    const existingStu = db.prepare('SELECT id FROM students WHERE email=?').get(email);
    const stuId = existingStu ? existingStu.id : (b.studentId ? Number(b.studentId) : null);

    const r = db.prepare(`INSERT INTO subscription_requests(student_id, student_name, student_email, student_phone, amount, currency, method, reference, proof_url, plan_duration_months, status, created_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .run(stuId, name, email, b.studentPhone || null, amount, currency, method, reference || null, proofUrl || null, planDuration, new Date().toISOString(), notes || null);

    const newId = Number(r.lastInsertRowid);
    logA(ctx, { action: 'create', section: 'subscriptions', targetType: 'طلب اشتراك', targetId: newId, targetName: name, details: `تسجيل طلب اشتراك جديد للطالب (${name}) بمبلغ ${amount} ${currency}` });
    return send(res, 201, { ok: true, id: newId });
  }

  let mmSub = /^\/api\/subscription-requests\/(\d+)\/approve$/.exec(p);
  if (mmSub && m === 'POST') {
    if (!can(ctx, 'subscriptions', 'edit')) return deny(res, 'قبول طلب الاشتراك');
    const reqId = Number(mmSub[1]);
    let b = {}; try { b = await readJson(req, 4096); } catch (e) { /* empty */ }
    const reqRow = db.prepare('SELECT * FROM subscription_requests WHERE id=?').get(reqId);
    if (!reqRow) return err(res, 404, 'طلب الاشتراك غير موجود');
    if (reqRow.status === 'approved') return err(res, 409, 'تمت الموافقة على هذا الطلب مسبقًا');

    const durationMonths = Math.max(1, Math.min(60, Number(b.durationMonths) || reqRow.plan_duration_months || 12));
    const startDate = (b.startDate && /^\d{4}-\d{2}-\d{2}$/.test(b.startDate)) ? b.startDate : new Date().toISOString().slice(0, 10);
    const endDate = addMonths(startDate, durationMonths);

    let stu = reqRow.student_id ? db.prepare('SELECT * FROM students WHERE id=?').get(reqRow.student_id) : null;
    if (!stu) stu = db.prepare('SELECT * FROM students WHERE email=?').get(reqRow.student_email.toLowerCase());

    try {
      tx(db, () => {
        let studentId;
        if (stu) {
          studentId = stu.id;
          db.prepare("UPDATE students SET sub_status='active', sub_start=?, sub_end=?, status='active' WHERE id=?")
            .run(startDate, endDate, studentId);
        } else {
          const r = db.prepare("INSERT INTO students(name, email, phone, status, sub_status, sub_start, sub_end, created_at) VALUES (?, ?, ?, 'active', 'active', ?, ?, ?)")
            .run(reqRow.student_name, reqRow.student_email.toLowerCase(), reqRow.student_phone || null, startDate, endDate, new Date().toISOString());
          studentId = Number(r.lastInsertRowid);
        }

        const payRef = reqRow.reference ? reqRow.reference : ('REQ-' + reqId + '-' + Date.now().toString(36).toUpperCase());
        const existingPay = db.prepare('SELECT id FROM payments WHERE reference=?').get(payRef);
        if (!existingPay) {
          try {
            db.prepare('INSERT INTO payments(student_id, amount, currency, reference, paid_at, verified) VALUES (?, ?, ?, ?, ?, 1)')
              .run(studentId, reqRow.amount || 0, reqRow.currency || 'EGP', payRef, reqRow.created_at || new Date().toISOString());
          } catch (pe) {
            const fallbackRef = payRef + '-' + Date.now().toString(36).slice(-4);
            db.prepare('INSERT INTO payments(student_id, amount, currency, reference, paid_at, verified) VALUES (?, ?, ?, ?, ?, 1)')
              .run(studentId, reqRow.amount || 0, reqRow.currency || 'EGP', fallbackRef, reqRow.created_at || new Date().toISOString());
          }
        } else {
          db.prepare('UPDATE payments SET verified=1, student_id=? WHERE id=?').run(studentId, existingPay.id);
        }

        db.prepare("UPDATE subscription_requests SET status='approved', reviewed_at=?, reviewed_by=?, student_id=?, rejection_reason=NULL WHERE id=?")
          .run(new Date().toISOString(), ctx.user.username, studentId, reqId);

        logA(ctx, {
          action: 'approve',
          section: 'subscriptions',
          targetType: 'طلب اشتراك',
          targetId: reqId,
          targetName: reqRow.student_name,
          details: `الموافقة على اشتراك الطالب (${reqRow.student_name}) وتفعيله حتى ${endDate} (${durationMonths} شهرًا)`
        });
      });
    } catch (e) {
      return err(res, 500, 'فشل تنفيذ الموافقة: ' + e.message);
    }
    return send(res, 200, { ok: true, studentId: stu ? stu.id : null, startDate, endDate });
  }

  mmSub = /^\/api\/subscription-requests\/(\d+)\/reject$/.exec(p);
  if (mmSub && m === 'POST') {
    if (!can(ctx, 'subscriptions', 'edit')) return deny(res, 'رفض طلب الاشتراك');
    const reqId = Number(mmSub[1]);
    let b = {}; try { b = await readJson(req, 4096); } catch (e) { return err(res, 400, e.message); }
    const reason = String(b.reason || '').trim();
    if (reason.length < 2) return err(res, 422, 'يرجى كتابة سبب الرفض (حرفان على الأقل)');
    const reqRow = db.prepare('SELECT * FROM subscription_requests WHERE id=?').get(reqId);
    if (!reqRow) return err(res, 404, 'طلب الاشتراك غير موجود');

    try {
      tx(db, () => {
        db.prepare("UPDATE subscription_requests SET status='rejected', rejection_reason=?, reviewed_at=?, reviewed_by=? WHERE id=?")
          .run(reason, new Date().toISOString(), ctx.user.username, reqId);

        if (reqRow.student_id) {
          const st = db.prepare('SELECT sub_status FROM students WHERE id=?').get(reqRow.student_id);
          if (st && st.sub_status === 'pending') {
            db.prepare("UPDATE students SET sub_status='none' WHERE id=?").run(reqRow.student_id);
          }
        }

        logA(ctx, {
          action: 'reject',
          section: 'subscriptions',
          targetType: 'طلب اشتراك',
          targetId: reqId,
          targetName: reqRow.student_name,
          details: `رفض طلب اشتراك الطالب (${reqRow.student_name}) — السبب: ${reason}`
        });
      });
    } catch (e) {
      return err(res, 500, 'فشل تسجيل الرفض: ' + e.message);
    }
    return send(res, 200, { ok: true, reason });
  }

  mmSub = /^\/api\/subscription-requests\/(\d+)$/.exec(p);
  if (mmSub && m === 'DELETE') {
    if (!can(ctx, 'subscriptions', 'edit')) return deny(res, 'حذف طلب الاشتراك');
    const reqId = Number(mmSub[1]);
    const reqRow = db.prepare('SELECT * FROM subscription_requests WHERE id=?').get(reqId);
    if (!reqRow) return err(res, 404, 'غير موجود');
    db.prepare('DELETE FROM subscription_requests WHERE id=?').run(reqId);
    logA(ctx, { action: 'delete', section: 'subscriptions', targetType: 'طلب اشتراك', targetId: reqId, targetName: reqRow.student_name, details: 'حذف سجل طلب اشتراك' });
    return send(res, 200, { ok: true });
  }

  /* ----- المستخدمون والصلاحيات ----- */
  if (p === '/api/users' && m === 'GET') {
    if (!can(ctx, 'users')) return deny(res);
    return send(res, 200, { users: db.prepare('SELECT * FROM users ORDER BY id').all().map(A.publicUser), sections: A.SECTIONS, labels: A.SECTION_LABELS,
      roles: Object.keys(A.ROLES).map(k => ({ id: k, label: A.ROLES[k].label, sections: A.ROLES[k].sections === null ? A.SECTIONS : Object.keys(A.ROLES[k].sections) })) });
  }
  if (p === '/api/users' && m === 'POST') {
    if (!can(ctx, 'users', 'edit')) return deny(res);
    let b; try { b = await readJson(req, 4096); } catch (e) { return err(res, 400, e.message); }
    const f = {};
    const un = String(b.username || '').trim();
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(un)) f.username = 'اسم المستخدم: 3-32 حرفًا إنجليزيًا/أرقام/._-';
    const dn = String(b.displayName || '').trim(); if (dn.length < 2 || dn.length > 80) f.displayName = 'الاسم من 2 إلى 80 حرفًا';
    if (!A.ROLES[b.role]) f.role = 'دور غير صالح';
    const pp = A.pwProblem(b.password); if (pp) f.password = pp;
    let secs = null;
    if (Array.isArray(b.sections)) { if (b.sections.some(s => !A.SECTIONS.includes(s))) f.sections = 'قسم غير صالح'; else secs = JSON.stringify(b.sections); }
    if (Object.keys(f).length) return err(res, 422, 'بيانات غير صالحة', { fields: f });
    const { salt, hash } = A.makePw(b.password);
    try {
      tx(db, () => {
        const r = db.prepare('INSERT INTO users(username,display_name,role,sections,pw_salt,pw_hash,created_at) VALUES (?,?,?,?,?,?,?)').run(un, dn, b.role, secs, salt, hash, new Date().toISOString());
        logA(ctx, { action: 'create', section: 'users', targetType: 'مستخدم', targetId: Number(r.lastInsertRowid), targetName: un, after: { username: un, displayName: dn, role: b.role, sections: secs ? JSON.parse(secs) : null }, details: 'إضافة عضو جديد بدور ' + b.role });
      });
    } catch (x) { if (/UNIQUE/.test(x.message)) return err(res, 422, 'بيانات غير صالحة', { fields: { username: 'اسم المستخدم مستخدم بالفعل' } }); throw x; }
    return send(res, 200, { ok: true });
  }
  let mm = /^\/api\/users\/(\d+)(\/password)?$/.exec(p);
  if (mm && (m === 'PUT' || m === 'POST')) {
    if (!can(ctx, 'users', 'edit')) return deny(res);
    const id = +mm[1], row = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!row) return err(res, 404, 'المستخدم غير موجود');
    let b; try { b = await readJson(req, 4096); } catch (e) { return err(res, 400, e.message); }
    if (mm[2]) {
      const pp = A.pwProblem(b.password); if (pp) return err(res, 422, pp, { fields: { password: pp } });
      const { salt, hash } = A.makePw(b.password);
      tx(db, () => { db.prepare('UPDATE users SET pw_salt=?, pw_hash=? WHERE id=?').run(salt, hash, id); A.destroyUserSessions(db, id); logA(ctx, { action: 'update', section: 'users', targetType: 'مستخدم', targetId: id, targetName: row.username, details: 'إعادة تعيين كلمة المرور (غير مسجلة)' }); });
      return send(res, 200, { ok: true });
    }
    const f = {}, nu = {};
    if (b.displayName !== undefined) { const dn = String(b.displayName).trim(); if (dn.length < 2 || dn.length > 80) f.displayName = 'الاسم من 2 إلى 80 حرفًا'; nu.display_name = dn; }
    if (b.role !== undefined) { if (!A.ROLES[b.role]) f.role = 'دور غير صالح'; nu.role = b.role; }
    if (b.sections !== undefined) {
      if (b.sections === null) nu.sections = null;
      else if (Array.isArray(b.sections) && b.sections.every(s => A.SECTIONS.includes(s))) nu.sections = JSON.stringify(b.sections); else f.sections = 'قسم غير صالح';
    }
    if (b.active !== undefined) nu.active = b.active ? 1 : 0;
    if (Object.keys(f).length) return err(res, 422, 'بيانات غير صالحة', { fields: f });
    const futureRole = nu.role || row.role, futureActive = nu.active === undefined ? row.active : nu.active;
    if (row.role === 'super_admin' && (futureRole !== 'super_admin' || !futureActive)) {
      const others = db.prepare("SELECT COUNT(*) n FROM users WHERE role='super_admin' AND active=1 AND id<>?").get(id).n;
      if (!others) return err(res, 422, 'يجب أن يبقى Super Admin نشط واحد على الأقل');
    }
    if (id === user.id && nu.active === 0) return err(res, 422, 'لا يمكنك تعطيل حسابك بنفسك');
    const keys = Object.keys(nu);
    const before = A.publicUser(row);
    tx(db, () => {
      if (keys.length) db.prepare(`UPDATE users SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).run(...keys.map(k => nu[k]), id);
      if (nu.active === 0 || nu.role || nu.sections !== undefined) A.destroyUserSessions(db, id);
      const after = A.publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id));
      const pick = u => ({ displayName: u.displayName, role: u.role, active: u.active, sections: u.sectionsList });
      const permsChanged = nu.role !== undefined || nu.sections !== undefined || nu.active !== undefined;
      logA(ctx, { action: permsChanged ? 'permissions' : 'update', section: 'users', targetType: 'مستخدم', targetId: id, targetName: row.username, before: pick(before), after: pick(after),
        details: nu.active === 0 ? 'تعطيل الحساب' : nu.active === 1 && !row.active ? 'تفعيل الحساب' : permsChanged ? 'تعديل الصلاحيات/الدور' : 'تعديل البيانات' });
    });
    return send(res, 200, { ok: true });
  }

  /* ----- سجل العمليات (قراءة فقط) ----- */
  if (p === '/api/logs' && m === 'GET') {
    if (!can(ctx, 'logs')) return deny(res);
    const q = url.searchParams, where = [], args = [];
    if (q.get('q')) { const l = '%' + q.get('q').replace(/[%_]/g, '') + '%'; where.push('(username LIKE ? OR display_name LIKE ? OR target_name LIKE ?)'); args.push(l, l, l); }
    if (q.get('action')) { where.push('action=?'); args.push(q.get('action')); }
    if (q.get('section')) { where.push('section=?'); args.push(q.get('section')); }
    const tz = Math.max(-840, Math.min(840, parseInt(q.get('tz'), 10) || 0));
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.get('from') || '')) { where.push('ts>=?'); args.push(new Date(Date.parse(q.get('from') + 'T00:00:00Z') - tz * 60000).toISOString()); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.get('to') || '')) { where.push('ts<?'); args.push(new Date(Date.parse(q.get('to') + 'T00:00:00Z') + 86400000 - tz * 60000).toISOString()); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const page = Math.max(1, parseInt(q.get('page'), 10) || 1), size = 25;
    const total = db.prepare(`SELECT COUNT(*) n FROM audit_log ${w}`).get(...args).n;
    const rows = db.prepare(`SELECT id,ts,user_id,username,display_name,action,section,target_type,target_id,target_name,details,ip FROM audit_log ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, size, (page - 1) * size);
    return send(res, 200, { rows, total, page, pages: Math.max(1, Math.ceil(total / size)), actions: db.prepare('SELECT DISTINCT action FROM audit_log ORDER BY action').all().map(r => r.action),
      sections: db.prepare('SELECT DISTINCT section FROM audit_log ORDER BY section').all().map(r => r.section), sectionLabels: A.SECTION_LABELS });
  }
  if (p === '/api/logs/verify' && m === 'GET') { if (!can(ctx, 'logs')) return deny(res); return send(res, 200, AUD.verifyChain(db)); }
  mm = /^\/api\/logs\/(\d+)$/.exec(p);
  if (mm && m === 'GET') {
    if (!can(ctx, 'logs')) return deny(res);
    const r = db.prepare('SELECT * FROM audit_log WHERE id=?').get(+mm[1]); if (!r) return err(res, 404, 'غير موجود');
    delete r.prev_hash; delete r.row_hash;
    return send(res, 200, r);
  }

  /* ----- الطلاب والشهادات ----- */
  if (p === '/api/students' && m === 'GET') {
    if (!can(ctx, 'students')) return deny(res);
    const d = readData();
    return send(res, 200, Object.assign(ST.list(db, d, Object.fromEntries(url.searchParams), ctx.perms.flags), { paths: (d.paths || []).map(x => ({ id: x.id, name: x.name })) }));
  }
  if (p === '/api/students' && m === 'POST') {
    if (!can(ctx, 'students', 'edit')) return deny(res);
    let b; try { b = await readJson(req, 8192); } catch (e) { return err(res, 400, e.message); }
    const r = ST.create(db, readData(), b);
    if (r.errors) return err(res, 422, 'بيانات غير صالحة', { fields: r.errors });
    logA(ctx, { action: 'create', section: 'students', targetType: 'طالب', targetId: r.id, targetName: String(b.name), after: { name: b.name, email: b.email, subStatus: b.subStatus || 'none' }, details: 'إضافة طالب' });
    return send(res, 200, { ok: true, id: r.id });
  }
  mm = /^\/api\/students\/(\d+)$/.exec(p);
  if (mm && m === 'GET') {
    if (!can(ctx, 'students')) return deny(res);
    const pr = ST.profile(db, readData(), +mm[1], ctx.perms.flags);
    return pr ? send(res, 200, pr) : err(res, 404, 'الطالب غير موجود');
  }
  if (mm && m === 'PUT') {
    if (!can(ctx, 'students', 'edit')) return deny(res);
    const id = +mm[1], cur = db.prepare('SELECT * FROM students WHERE id=?').get(id);
    if (!cur) return err(res, 404, 'الطالب غير موجود');
    let b; try { b = await readJson(req, 8192); } catch (e) { return err(res, 400, e.message); }
    if (b.status !== undefined && b.status !== cur.status && !flag(ctx, 'students.suspend')) return deny(res, 'إيقاف/تفعيل الحساب');
    const r = ST.update(db, readData(), id, b);
    if (r.errors) return err(res, 422, 'بيانات غير صالحة', { fields: r.errors });
    const after = db.prepare('SELECT * FROM students WHERE id=?').get(id);
    const pick = s => ({ name: s.name, email: s.email, phone: s.phone, status: s.status, subStatus: s.sub_status, subStart: s.sub_start, subEnd: s.sub_end, notes: s.notes });
    const sc = after.status !== cur.status;
    logA(ctx, { action: sc ? (after.status === 'suspended' ? 'suspend' : 'activate') : 'update', section: 'students', targetType: 'طالب', targetId: id, targetName: after.name, before: pick(cur), after: pick(after),
      details: sc ? (after.status === 'suspended' ? 'إيقاف حساب الطالب' : 'تفعيل حساب الطالب') : 'تعديل بيانات الطالب' });
    return send(res, 200, { ok: true });
  }
  mm = /^\/api\/students\/(\d+)\/certificates$/.exec(p);
  if (mm && m === 'POST') {
    if (!can(ctx, 'students') || !flag(ctx, 'certificates.issue')) return deny(res, 'إصدار الشهادات');
    let b; try { b = await readJson(req, 2048); } catch (e) { return err(res, 400, e.message); }
    const r = ST.issue(db, readData(), +mm[1], String(b.pathId || ''), ctx.user, null);
    if (r.error) return err(res, r.status, r.error, { reasons: r.reasons });
    logA(ctx, { action: 'issue', section: 'students', targetType: 'شهادة', targetId: r.number, targetName: r.studentName + ' — ' + r.pathName, details: 'إصدار شهادة إتمام' });
    return send(res, 200, { ok: true, number: r.number });
  }
  mm = /^\/api\/certificates\/([A-Za-z0-9-]+)\/(reissue|revoke)$/.exec(p);
  if (mm && m === 'POST') {
    const c = db.prepare('SELECT * FROM certificates WHERE number=?').get(mm[1].toUpperCase());
    if (!c) return err(res, 404, 'الشهادة غير موجودة');
    let b; try { b = await readJson(req, 2048); } catch (e) { return err(res, 400, e.message); }
    const reason = String(b.reason || '').trim().slice(0, 300);
    if (!reason) return err(res, 422, 'سبب العملية مطلوب', { fields: { reason: 'مطلوب' } });
    if (mm[2] === 'revoke') {
      if (!can(ctx, 'students') || !flag(ctx, 'certificates.revoke')) return deny(res, 'إلغاء الشهادات');
      if (c.status !== 'valid') return err(res, 409, 'الشهادة ليست سارية');
      db.prepare("UPDATE certificates SET status='revoked', revoked_at=?, revoked_by=?, revoke_reason=? WHERE number=?").run(new Date().toISOString(), ctx.user.username, reason, c.number);
      logA(ctx, { action: 'revoke', section: 'students', targetType: 'شهادة', targetId: c.number, targetName: c.student_name + ' — ' + c.path_name, before: { status: 'valid' }, after: { status: 'revoked' }, details: 'إلغاء شهادة: ' + reason });
      return send(res, 200, { ok: true });
    }
    if (!can(ctx, 'students') || !flag(ctx, 'certificates.issue')) return deny(res, 'إعادة إصدار الشهادات');
    if (c.status === 'revoked') return err(res, 409, 'الشهادة ملغاة. أصدر شهادة جديدة بعد معالجة السبب.');
    const r = ST.issue(db, readData(), c.student_id, c.path_id, ctx.user, c.number);
    if (r.error) return err(res, r.status, r.error, { reasons: r.reasons });
    logA(ctx, { action: 'reissue', section: 'students', targetType: 'شهادة', targetId: r.number, targetName: r.studentName + ' — ' + r.pathName, before: { number: c.number }, after: { number: r.number }, details: 'إعادة إصدار شهادة: ' + reason });
    return send(res, 200, { ok: true, number: r.number });
  }

  /* ----- التحليلات ----- */
  if (p === '/api/analytics' && m === 'GET') {
    if (!can(ctx, 'analytics')) return deny(res);
    return send(res, 200, AN.compute(db, readData(), Object.fromEntries(url.searchParams), ctx.perms));
  }

  /* ----- الذكاء الاصطناعي ----- */
  if (p === '/api/ai/settings' && m === 'GET') {
    if (!can(ctx, 'ai')) return deny(res);
    return send(res, 200, Object.assign(AI.getCfg(db), { keyConfigured: !!process.env.AI_API_KEY, providers: Object.keys(AI.PROVIDERS), canEdit: flag(ctx, 'ai.settings') }));
  }
  if (p === '/api/ai/settings' && m === 'PUT') {
    if (!can(ctx, 'ai', 'edit') || !flag(ctx, 'ai.settings')) return deny(res, 'الإعدادات التقنية للذكاء الاصطناعي');
    let b; try { b = await readJson(req, 4096); } catch (e) { return err(res, 400, e.message); }
    const v = AI.validateCfg(b);
    if (Object.keys(v.errors).length) return err(res, 422, 'بيانات غير صالحة', { fields: v.errors });
    const before = AI.getCfg(db);
    tx(db, () => {
      db.prepare("INSERT INTO settings_kv(key,value,updated_at,updated_by) VALUES ('ai',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by").run(JSON.stringify(v.value), new Date().toISOString(), ctx.user.username);
      logA(ctx, { action: 'update', section: 'ai', targetType: 'إعدادات AI', targetId: 'ai', targetName: 'إعدادات مزوّد الذكاء الاصطناعي', before, after: v.value, details: 'تعديل مزوّد/نموذج الذكاء الاصطناعي' });
    });
    return send(res, 200, { ok: true });
  }
  if (p === '/api/ai/organize' && m === 'POST') {
    if (!can(ctx, 'ai', 'edit') || !(flag(ctx, 'ai.use') || flag(ctx, 'ai.settings'))) return deny(res, 'استخدام AI Lesson Creator');
    if (limited('ai:' + user.id, 10, 60000)) return err(res, 429, 'طلبات كثيرة. انتظر دقيقة.');
    let b; try { b = await readJson(req, 300 * 1024); } catch (e) { return err(res, e.status || 400, e.message); }
    try {
      const r = await AI.organize(db, b);
      logA(ctx, { action: 'ai_organize', section: 'ai', targetType: 'درس', targetId: String((b.meta && b.meta.title) || '').slice(0, 80), targetName: String((b.meta && b.meta.title) || '(بدون عنوان)').slice(0, 120),
        details: `تنظيم درس بالذكاء الاصطناعي — ${r.provider}/${r.model} — ${String(b.text).length} حرف (النص غير محفوظ في السجل)` });
      return send(res, 200, r);
    } catch (e) { return err(res, e.status || 500, e.message, { code: e.code }); }
  }

  return err(res, 404, 'غير موجود');
}

/* ---------- الشهادات العامة ---------- */
function verifyPayload(num) {
  const c = /^[A-Z0-9-]{8,40}$/.test(num) ? db.prepare('SELECT * FROM certificates WHERE number=?').get(num) : null;
  if (!c) return { found: false };
  const base = { found: true, number: c.number, status: c.status, pathName: c.path_name, issuedAt: c.issued_at.slice(0, 10), platform: (readData().settings || {}).name || 'Efhama' };
  if (c.status === 'valid') return Object.assign(base, { studentName: c.student_name, completedAt: c.completed_at.slice(0, 10) });
  if (c.status === 'replaced') return Object.assign(base, { replacedBy: c.replaced_by });
  return base; // الملغاة: لا نكشف اسم الطالب
}
const SHELL = (title, body) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"><link rel="stylesheet" href="/integration/certificate.css"></head><body>${body}<script src="/integration/certificate.js"></script></body></html>`;
function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return iso; } }
function baseUrl(req) { return (process.env.PUBLIC_BASE_URL || ((req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === '1' ? 'https' : 'http') + '://' + req.headers.host)).replace(/\/$/, ''); }
function verifyPage(num) {
  const v = verifyPayload(num);
  let inner;
  if (!v.found) inner = `<div class="vcard bad"><div class="mark">✕</div><h1>شهادة غير موجودة</h1><p>لم نعثر على شهادة بهذا الرقم. تأكد من الرقم وحاول مرة أخرى.</p></div>`;
  else if (v.status === 'valid') inner = `<div class="vcard ok"><div class="mark">✓</div><h1>شهادة صحيحة</h1><dl><dt>اسم الحاصل على الشهادة</dt><dd>${esc(v.studentName)}</dd><dt>المسار</dt><dd>${esc(v.pathName)}</dd><dt>تاريخ الإتمام</dt><dd>${esc(fmtDate(v.completedAt))}</dd><dt>تاريخ الإصدار</dt><dd>${esc(fmtDate(v.issuedAt))}</dd><dt>رقم الشهادة</dt><dd dir="ltr">${esc(v.number)}</dd><dt>الجهة المصدِرة</dt><dd>${esc(v.platform)}</dd></dl><p><a href="/certificate/${esc(v.number)}">عرض الشهادة</a></p></div>`;
  else if (v.status === 'replaced') inner = `<div class="vcard warn"><div class="mark">!</div><h1>شهادة مستبدلة</h1><p>تم استبدال هذه الشهادة بشهادة أحدث: <a dir="ltr" href="/verify/${esc(v.replacedBy)}">${esc(v.replacedBy)}</a></p></div>`;
  else inner = `<div class="vcard bad"><div class="mark">✕</div><h1>شهادة ملغاة</h1><p>هذه الشهادة (رقم <span dir="ltr">${esc(v.number)}</span>) لم تعد سارية.</p></div>`;
  return SHELL('التحقق من الشهادة', `<main class="vwrap">${inner}</main>`);
}
function certificatePage(req, num) {
  const c = db.prepare('SELECT * FROM certificates WHERE number=?').get(num);
  if (!c) return null;
  const d = readData(), s = d.settings || {};
  const asset = (d.assets || []).find(a => a.id === s.logo);
  const logo = asset ? asset.src : (s.logo || '');
  const logoOk = /^(\/uploads\/|https:\/\/)/.test(logo) ? logo : '';
  const url = baseUrl(req) + '/verify/' + c.number;
  const banner = c.status === 'revoked' ? '<div class="cbanner bad">هذه الشهادة ملغاة ولم تعد سارية</div>' : c.status === 'replaced' ? `<div class="cbanner warn">تم استبدال هذه الشهادة بالشهادة <span dir="ltr">${esc(c.replaced_by)}</span></div>` : '';
  const body = `<div class="noprint bar"><button data-print type="button">حفظ كملف PDF / طباعة</button></div>${banner}
<section class="cert"><div class="frame">
${logoOk ? `<img class="logo" src="${esc(logoOk)}" alt="${esc(s.name || 'Efhama')}">` : `<div class="logo-text">${esc(s.name || 'Efhama')}</div>`}
<h1>شهادة إتمام</h1><p class="lead">تشهد منصة <b>${esc(s.name || 'Efhama')}</b> بأن</p>
<h2 class="student">${esc(c.student_name)}</h2><p class="lead">قد أتمّ بنجاح مسار</p><h3 class="path">${esc(c.path_name)}</h3>
<p class="lead">بتاريخ ${esc(fmtDate(c.completed_at))}</p>
<div class="meta"><div><small>رقم الشهادة</small><b dir="ltr">${esc(c.number)}</b></div><div><small>تاريخ الإصدار</small><b>${esc(fmtDate(c.issued_at))}</b></div></div>
<p class="verify">للتحقق من صحة الشهادة: <span dir="ltr">${esc(url)}</span></p></div></section>`;
  return SHELL('شهادة ' + c.number, body);
}

/* ---------- ملفات ثابتة ---------- */
function serveFile(res, file, extra, req) {
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    const ext = path.extname(file).toLowerCase();
    const h = Object.assign({ 'Content-Type': MIME[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'no-cache' }, extra || {});
    if (ext === '.html') { h['Content-Security-Policy'] = CSP; h['X-Frame-Options'] = 'DENY'; }
    if (ext === '.svg') h['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
    const range = req && req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range && st.size) { // دعم Range لتشغيل الفيديو
      let a = range[1] === '' ? st.size - parseInt(range[2], 10) : parseInt(range[1], 10), b = range[1] !== '' && range[2] !== '' ? parseInt(range[2], 10) : st.size - 1;
      if (isNaN(a) || isNaN(b) || a > b || a >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      b = Math.min(b, st.size - 1);
      h['Content-Range'] = 'bytes ' + a + '-' + b + '/' + st.size; h['Content-Length'] = b - a + 1; h['Accept-Ranges'] = 'bytes';
      res.writeHead(206, h); return fs.createReadStream(file, { start: a, end: b }).pipe(res);
    }
    h['Content-Length'] = st.size; h['Accept-Ranges'] = 'bytes';
    res.writeHead(200, h); fs.createReadStream(file).pipe(res);
  });
}
const BLOCKED = new Set(['server', 'data', 'node_modules']);
function within(base, rel) { const full = path.normalize(path.join(base, rel)); return full === base || full.startsWith(base + path.sep) ? full : null; }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let p; try { p = decodeURIComponent(url.pathname); } catch (e) { return send(res, 400, 'Bad request'); }
    if (p.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    let mm = /^\/verify\/([A-Za-z0-9-]{1,40})$/.exec(p);
    if (mm) { if (limited('vp:' + clientIp(req), 60, 60000)) return send(res, 429, 'Too many requests'); return send(res, 200, verifyPage(mm[1].toUpperCase()), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP, 'X-Frame-Options': 'DENY' }); }
    mm = /^\/certificate\/([A-Za-z0-9-]{1,40})$/.exec(p);
    if (mm) {
      if (limited('cp:' + clientIp(req), 60, 60000)) return send(res, 429, 'Too many requests');
      const html = certificatePage(req, mm[1].toUpperCase());
      return html ? send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP_SELF_FRAME, 'X-Frame-Options': 'SAMEORIGIN' }) : send(res, 404, 'الشهادة غير موجودة', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    if (p === '/public/efhama-data.json') return serveFile(res, path.join(PUBLIC_DIR, 'efhama-data.json'), (process.env.PUBLIC_CORS_ORIGIN ? { 'Access-Control-Allow-Origin': process.env.PUBLIC_CORS_ORIGIN } : {}), req);
    if (p.startsWith('/uploads/')) { const f = within(UPLOAD_DIR, p.slice(9)); return f ? serveFile(res, f, { 'Cache-Control': 'public, max-age=3600' }, req) : send(res, 403, 'Forbidden'); }
    if (p === '/') p = '/index.html';
    const top = p.split('/')[1];
    if (BLOCKED.has(top) || p.split('/').some(s => s.startsWith('.'))) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    const f = within(ROOT, p.slice(1));
    return f ? serveFile(res, f, null, req) : send(res, 403, 'Forbidden');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: 'خطأ في الخادم' });
  }
});

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
try { publish(); } catch (e) { console.error('تعذر توليد الملف العام:', e.message); }
server.listen(PORT, HOST, () => {
  console.log('Efhama Dashboard: http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT + '/');
  console.log('بيانات الموقع العامة:   /public/efhama-data.json');
});
