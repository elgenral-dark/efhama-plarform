/* تحميل محتوى المنهج من server/seed/*.json إلى قاعدة البيانات.
   الاستخدام:  npm run seed            (يضيف الناقص فقط)
               npm run seed -- --force (يستبدل المحتوى الموجود بملفات seed) */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const config = require("./config");
const { makeContent } = require("./content");

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

async function seedContent(db, { force = false, dir = config.seedDir, log = console.log } = {}) {
  const cur = readJson(path.join(dir, "curriculum.json"));
  let n = 0;
  await db.tx(async (t) => {
    const content = makeContent(t);
    const put = async (kind, id, obj) => {
      if (force || !(await content.exists(kind, id))) { await content.set(kind, id, obj); n++; }
    };
    await put("curriculum", "main", cur);
    for (const ch of cur.chapters) {
      for (const l of ch.lessons) {
        const f = path.join(dir, "lessons", `lesson-${l.id}.json`);
        if (fs.existsSync(f)) await put("lesson", l.id, readJson(f));
        else log(`تحذير: ملف الدرس ${l.id} غير موجود`);
      }
      const qf = path.join(dir, "quizzes", `chapter-${ch.id}-quiz.json`);
      if (fs.existsSync(qf)) await put("quiz", ch.id, readJson(qf));
    }
    if (force || !(await content.exists("search_index", "main"))) { await content.rebuildSearchIndex(); n++; }
  });
  log(`المحتوى: تمت كتابة ${n} عنصر.`);
  return n;
}

/* ينشئ مسؤولًا إن لم يوجد أي مسؤول. كلمة المرور من ADMIN_PASSWORD أو تُولَّد عشوائيًا وتُطبع مرة واحدة */
async function ensureAdmin(db, { log = console.log } = {}) {
  const exists = await db.get("SELECT 1 AS x FROM users WHERE role = 'admin' LIMIT 1");
  if (exists) return null;
  const email = (config.adminEmail || "admin@efhamha.local").toLowerCase();
  const generated = !config.adminPassword;
  const password = config.adminPassword || require("crypto").randomBytes(9).toString("base64url");
  const hash = bcrypt.hashSync(password, 12);
  await db.run(
    "INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, 'مسؤول المنصة', ?, 'admin', ?)",
    [email, hash, Date.now()]
  );
  log("──────────────────────────────────────────────");
  log(` تم إنشاء حساب المسؤول: ${email}`);
  if (generated) log(` كلمة المرور (تظهر مرة واحدة فقط): ${password}`);
  log("──────────────────────────────────────────────");
  return { email, password };
}

async function ensureDemoAccounts(db, { log = console.log } = {}) {
  const accounts = [
    {
      name: config.demoAdminName,
      email: config.demoAdminEmail,
      password: config.demoAdminPassword,
      role: "admin",
      subscription: false,
    },
    {
      name: config.demoInstructorName,
      email: config.demoInstructorEmail,
      password: config.demoInstructorPassword,
      role: "instructor",
      subscription: false,
    },
    {
      name: config.demoStudentName,
      email: config.demoStudentEmail,
      password: config.demoStudentPassword,
      role: "student",
      subscription: true,
    },
  ];

  for (const account of accounts) {
    const email = String(account.email).trim().toLowerCase();
    const name = String(account.name).trim();
    const password = String(account.password);
    if (!email || !name || password.length < 8) throw new Error(`بيانات حساب ${account.role} غير صالحة.`);

    let user = await db.get(
      "SELECT id FROM users WHERE email = ? OR name = ? COLLATE NOCASE LIMIT 1",
      [email, name]
    );
    const hash = bcrypt.hashSync(password, 12);
    const now = Date.now();
    if (!user) {
      const inserted = await db.insert(
        `INSERT INTO users
          (email, name, password_hash, role, active, account_status, approval_status, token_version, created_at)
         VALUES (?, ?, ?, ?, 1, 'active', 'approved', 0, ?)`,
        [email, name, hash, account.role, now]
      );
      user = { id: inserted.id };
    } else {
      await db.run(
        `UPDATE users SET email = ?, name = ?, password_hash = ?, role = ?, active = 1,
          account_status = 'active', approval_status = 'approved', token_version = token_version + 1
         WHERE id = ?`,
        [email, name, hash, account.role, user.id]
      );
    }

    if (account.subscription) {
      await db.run(
        `INSERT INTO subscriptions (user_id, starts_at, ends_at, status, updated_at)
         VALUES (?, ?, ?, 'active', ?)
         ON CONFLICT(user_id) DO UPDATE SET starts_at = excluded.starts_at,
           ends_at = excluded.ends_at, status = 'active', updated_at = excluded.updated_at`,
        [user.id, now - 86400000, now + 365 * 86400000, now]
      );
    }
  }
  log("تم تجهيز حسابات الأدمن والمدرس والطالب في قاعدة البيانات.");
}

module.exports = { seedContent, ensureAdmin, ensureDemoAccounts };

if (require.main === module) {
  const { openDatabase } = require("./database");
  (async () => {
    const db = await openDatabase({ sqliteFile: config.dbPath });
    await seedContent(db, { force: process.argv.includes("--force") });
    await ensureAdmin(db);
    await ensureDemoAccounts(db);
    await db.close?.();
  })().catch((e) => { console.error(e); process.exitCode = 1; });
}
