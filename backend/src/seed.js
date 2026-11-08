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
  const email = (config.adminEmail || "admin@efhama.local").toLowerCase();
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

module.exports = { seedContent, ensureAdmin };

if (require.main === module) {
  const { openDatabase } = require("./database");
  (async () => {
    const db = await openDatabase({ sqliteFile: config.dbPath });
    await seedContent(db, { force: process.argv.includes("--force") });
    await ensureAdmin(db);
    await db.close?.();
  })().catch((e) => { console.error(e); process.exitCode = 1; });
}
