/* Password reset backend. Interactive secure prompts are handled by reset-admin.ps1 on Windows. */
const bcrypt = require("bcryptjs");
const config = require("./config");
const { openDatabase } = require("./database");

async function main() {
  const email = String(process.env.EFHAMA_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.EFHAMA_ADMIN_PASSWORD || "");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("البريد الإلكتروني غير صحيح أو لم يصل من أداة الاستعادة.");
  }
  if (password.length < 12) throw new Error("كلمة المرور يجب أن تكون 12 حرفًا على الأقل.");

  console.log(`قاعدة البيانات: ${process.env.DATABASE_URL ? "Postgres (DATABASE_URL)" : config.dbPath}`);
  const db = await openDatabase({ sqliteFile: config.dbPath });
  try {
    let user = await db.get("SELECT id, email, role FROM users WHERE email = ?", [email]);
    const admin = await db.get("SELECT id, email, role FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
    if (user && user.role !== "admin") throw new Error("هذا البريد مستخدم لحساب طالب وليس مسؤولًا؛ لم يتم إجراء أي تغيير.");
    if (!user && admin) {
      throw new Error(`لم أجد مسؤولًا بالبريد المحدد. بريد المسؤول الموجود في قاعدة البيانات هو: ${admin.email}. أعيدي تشغيل الأمر واستخدمي هذا البريد.`);
    }
    const hash = bcrypt.hashSync(password, 12);
    if (!user && !admin) {
      // Fresh install: create the first admin so a clean ZIP works without copying an old database.
      const inserted = await db.insert(
        "INSERT INTO users (email, name, password_hash, role, active, token_version, created_at) VALUES (?, 'مسؤول المنصة', ?, 'admin', 1, 0, ?)",
        [email, hash, Date.now()]
      );
      user = { id: inserted.id, email, role: "admin" };
      console.log("تم إنشاء حساب المسؤول لأول مرة في قاعدة البيانات الجديدة.");
    } else {
      const result = await db.run(
        "UPDATE users SET password_hash = ?, active = 1, token_version = token_version + 1 WHERE id = ? AND role = 'admin'",
        [hash, user.id]
      );
      if (Number(result.changes) !== 1) throw new Error("لم يتم تحديث الحساب؛ لم يتغير أي سجل.");
    }
    const verified = await db.get("SELECT password_hash, active, role FROM users WHERE id = ?", [user.id]);
    if (!verified || verified.role !== "admin" || Number(verified.active) !== 1 || !bcrypt.compareSync(password, verified.password_hash)) {
      throw new Error("تعذّر التحقق من كلمة المرور بعد التحديث.");
    }
    console.log(`تم إعداد حساب المسؤول ${user.email} والتحقق من كلمة المرور بنجاح.`);
    console.log("أغلقي أي خادم قديم ثم شغّلي npm start من مجلد المشروع هذا.");
  } finally {
    await db.close?.();
  }
}

main().catch((error) => {
  console.error(`\nتعذّرت استعادة الحساب: ${error.message}`);
  process.exitCode = 1;
});
