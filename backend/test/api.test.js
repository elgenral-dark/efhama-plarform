const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
process.env.AUTH_RATE_LIMIT = "1000";
process.env.JWT_SECRET = "test-secret";
process.env.ADMIN_EMAIL = "admin@test.com";
process.env.ADMIN_PASSWORD = "AdminPass123";

const { openDatabase } = require("../src/database");
const { createApp } = require("../src/index");
const { seedContent, ensureAdmin } = require("../src/seed");
const { create: createGamification } = require("../../frontend/public/programming-paths/gamification.js");

let server, base;
let db;
const q = {
  get: (sql, params) => db.get(sql, params),
  all: (sql, params) => db.all(sql, params),
  run: (sql, params) => db.run(sql, params),
};

test.before(async () => {
  // TEST_DATABASE_URL يشغّل الاختبارات على Postgres (قاعدة اختبار منفصلة فقط!).
  // بدونه تعمل على SQLite في الذاكرة.
  const pgUrl = process.env.TEST_DATABASE_URL || "";
  if (pgUrl) {
    const { Client } = require("pg");
    const c = new Client({
      connectionString: pgUrl,
      ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: true },
    });
    await c.connect();
    await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await c.end();
  }
  db = await openDatabase({ sqliteFile: ":memory:", databaseUrl: pgUrl });
  await seedContent(db, { log: () => {} });
  await ensureAdmin(db, { log: () => {} });
  server = createApp(db).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  await require("../src/passwords").close();
  if (typeof db?.close === "function") await db.close();
});

const TEST_PROOF = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4QAAAABJRU5ErkJggg==";

test("ترحيل قاعدة قديمة يضيف حالة الحساب دون فقد المستخدم الموجود", async () => {
  const file = path.join(os.tmpdir(), `efhama-legacy-${process.pid}-${Date.now()}.db`);
  const legacy = new DatabaseSync(file);
  legacy.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
      active INTEGER NOT NULL DEFAULT 1, token_version INTEGER NOT NULL DEFAULT 0,
      device_token_hash TEXT, device_enrolled_at INTEGER,
      device_enrollment_required INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, last_login_at INTEGER
    );
    INSERT INTO users (email, name, password_hash, device_token_hash, device_enrolled_at, created_at)
    VALUES ('legacy@example.test', 'Legacy User', 'preserved-hash', 'legacy-device-hash', 100, 123);
  `);
  legacy.close();

  let migrated;
  try {
    migrated = await openDatabase({ sqliteFile: file, databaseUrl: "" });
    const user = (await migrated.get("SELECT email, name, password_hash, account_status FROM users WHERE email = ?", ["legacy@example.test"]));
    assert.deepEqual({ ...user }, {
      email: "legacy@example.test",
      name: "Legacy User",
      password_hash: "preserved-hash",
      account_status: "active"
    });
    const retainedLegacyData = (await migrated.get("SELECT device_token_hash, device_enrolled_at FROM users WHERE email = ?", ["legacy@example.test"]));
    assert.deepEqual({ ...retainedLegacyData }, {
      device_token_hash: "legacy-device-hash",
      device_enrolled_at: 100
    });
    const migratedColumns = new Set((await migrated.all("PRAGMA table_info(users)", [])).map((column) => column.name));
    for (const column of ["approval_status"])
      assert.ok(migratedColumns.has(column), `legacy migration should add ${column}`);
    assert.ok((await migrated.get("SELECT name FROM sqlite_master WHERE type='table' AND name='user_sessions'", [])));
    assert.ok((await migrated.get("SELECT name FROM sqlite_master WHERE type='table' AND name='session_transfer_attempts'", [])));
  } finally {
    if (migrated) await migrated.close();
    [file, `${file}-wal`, `${file}-shm`].forEach((target) => {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    });
  }
});

// عميل اختبارات يحفظ الكوكيز منفصلة؛ اعتماد الاشتراك التلقائي يحافظ على تغطية واجهات المنصة.
const adminCookieJar = new Map();
const accountCookieJars = new Map();
function client({ autoActivate = true, isolatedDevice = false } = {}) {
  const cookies = new Map();
  let activeCookies = cookies;
  async function send(method, url, body, options = {}) {
    const cookieHeader = Array.from(activeCookies, ([name, value]) => `${name}=${value}`).join("; ");
    const res = await fetch(base + url, {
      method, redirect: "manual",
      headers: {
        "content-type": "application/json",
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...(options.headers || {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookies = typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie") || "").split(/, (?=[^;,]+=)/);
    for (const header of setCookies) {
      const pair = header.split(";")[0];
      const separator = pair.indexOf("=");
      if (separator < 0) continue;
      const name = pair.slice(0, separator), value = pair.slice(separator + 1);
      if (value) activeCookies.set(name, value);
      else activeCookies.delete(name);
    }
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text, headers: res.headers, cookie: Array.from(activeCookies, ([k, v]) => `${k}=${v}`).join("; ") };
  }
  return async (method, url, body, opts = {}) => {
    if (method === "POST" && url === "/api/auth/login" && body?.email === "admin@test.com")
      activeCookies = adminCookieJar;
    else if (method === "POST" && url === "/api/auth/login" && !isolatedDevice && body?.email) {
      const email = body.email.trim().toLowerCase();
      if (!accountCookieJars.has(email)) accountCookieJars.set(email, new Map());
      activeCookies = accountCookieJars.get(email);
    }
    if (method === "POST" && url === "/api/auth/register") {
      body = {
        name: "Test Student",
        confirmPassword: body && body.password,
        proof: TEST_PROOF,
        ...(body || {})
      };
    }
    const result = await send(method, url, body, opts);
    if (autoActivate && method === "POST" && url === "/api/auth/register" && result.status === 201 && result.json.user) {
      const now = Date.now();
      (await q.run("INSERT INTO subscriptions (user_id, starts_at, ends_at, status, updated_at) VALUES (?, ?, ?, 'active', ?)", [result.json.user.id, now, now + 365 * 86400000, now]));
      (await q.run("UPDATE users SET account_status = 'active', approval_status = 'approved' WHERE id = ?", [result.json.user.id]));
      if (!isolatedDevice) {
        const email = result.json.user.email.trim().toLowerCase();
        if (!accountCookieJars.has(email)) accountCookieJars.set(email, new Map());
        activeCookies = accountCookieJars.get(email);
      }
      await send("POST", "/api/auth/login", { email: result.json.user.email, password: body.password });
    }
    return result;
  };
}

test("المحتوى يتطلب تسجيل دخول وصفحات HTML تحوّل للدخول", async () => {
  const c = client();
  assert.equal((await c("GET", "/data/curriculum.json")).status, 401);
  assert.equal((await c("GET", "/api/lessons/1-1")).status, 401);
  assert.equal((await c("GET", "/api/auth/subscription")).json.user, null);
  assert.equal((await c("GET", "/data/curriculum.json")).status, 401);
});

test("تمارين المسارات مرتبطة بدروسها وتغطي أنواعها التسعة", () => {
  const bank = JSON.parse(fs.readFileSync(path.join(__dirname, "../content/challenges.json"), "utf8"));
  const expectedTypes = new Set([
    "multiple-choice", "true-false", "code-prediction", "find-error", "complete-code",
    "write-code", "code-output", "practical-challenge", "debugging-challenge"
  ]);
  const seenTypes = new Set();
  for (const [slug, challenges] of Object.entries(bank)) {
    const course = JSON.parse(fs.readFileSync(path.join(__dirname, `../content/paths/${slug}.json`), "utf8"));
    const lessonIds = new Set((course.levels || []).flatMap((unit) => unit.lessons || []).map((lesson) => lesson.id));
    assert.ok(challenges.length > 0, `${slug} should have linked challenges`);
    const ids = new Set();
    for (const challenge of challenges) {
      assert.match(challenge.id, /^[\w-]{1,60}$/);
      assert.ok(!ids.has(challenge.id), `duplicate challenge id ${challenge.id}`);
      ids.add(challenge.id);
      assert.ok(lessonIds.has(challenge.lessonId), `${challenge.id} should reference a lesson in ${slug}`);
      assert.ok(expectedTypes.has(challenge.type), `unsupported challenge type ${challenge.type}`);
      assert.ok(["easy", "medium", "hard"].includes(challenge.difficulty), `${challenge.id} needs a difficulty`);
      seenTypes.add(challenge.type);
    }
  }
  assert.deepEqual(seenTypes, expectedTypes);
});

test("كتالوج المشروعات يغطي المسارات والبيانات والمتطلبات السابقة", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "../content/projects.json"), "utf8"));
  const ids = new Set();
  const courseData = new Map();
  const lessonPath = (lessonId) => {
    if (lessonId.startsWith("python-")) return "python";
    if (lessonId.startsWith("html-")) return "html";
    if (lessonId.startsWith("css-")) return "css";
    if (lessonId.startsWith("js-")) return "javascript";
    return "logic";
  };
  assert.equal(catalog.version, 1);
  assert.deepEqual(new Set(catalog.tracks.map((track) => track.slug)), new Set(["python", "html", "css", "javascript", "web"]));
  for (const track of catalog.tracks) {
    assert.ok(track.projects.length > 0, `${track.slug} should have projects`);
    for (const project of track.projects) {
      assert.match(project.id, /^[\w-]{1,60}$/);
      assert.ok(!ids.has(project.id), `duplicate project id ${project.id}`);
      ids.add(project.id);
      assert.ok(["beginner", "intermediate", "advanced"].includes(project.level));
      assert.ok(project.minutes > 0);
      for (const key of ["skills", "prerequisites", "phases", "tests"]) {
        assert.ok(Array.isArray(project[key]) && project[key].length, `${project.id} needs ${key}`);
      }
      assert.ok(project.idea && project.goal && project.hint && project.starter && project.solution);
      for (const prerequisite of project.prerequisites) {
        const slug = lessonPath(prerequisite);
        if (!courseData.has(slug)) {
          courseData.set(slug, JSON.parse(fs.readFileSync(path.join(__dirname, `../content/paths/${slug}.json`), "utf8")));
        }
        const lessonIds = new Set(courseData.get(slug).levels.flatMap((unit) => unit.lessons.map((lesson) => lesson.id)));
        assert.ok(lessonIds.has(prerequisite), `${project.id} references missing prerequisite ${prerequisite}`);
      }
    }
  }
});

test("نظام Gamification يمنح XP والشارات مرة واحدة ولا يحتسب النشاط المكرر ضمن السلسلة", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  const notifications = [];
  const gamification = createGamification(storage, {
    xp: { lesson: 100, challenge: 25, assessment: 40, project: 60, unit: 25 },
    levels: [
      { id: "beginner", title: "Beginner", minimumXp: 0 },
      { id: "learner", title: "Learner", minimumXp: 100 },
      { id: "coder", title: "Coder", minimumXp: 250 }
    ],
    badges: [
      { id: "first-lesson", title: "First Lesson", description: "Complete one lesson." },
      { id: "first-challenge", title: "First Challenge", description: "Complete one challenge." },
      { id: "consistent-learner", title: "Consistent Learner", description: "Learn for seven days." }
    ]
  }, (message, kind) => notifications.push({ message, kind }));

  const firstDay = new Date(2026, 2, 8, 12).getTime();
  const secondDay = new Date(2026, 2, 9, 12).getTime();
  const first = gamification.recordActivity("lesson", "python:lesson-1", { timestamp: firstDay });
  const duplicate = gamification.recordActivity("lesson", "python:lesson-1", { timestamp: secondDay });
  assert.equal(first.awarded, true);
  assert.equal(first.level.title, "Learner");
  assert.equal(duplicate.awarded, false);
  assert.equal(duplicate.xp, 0);
  assert.equal(duplicate.streak.current, 1);
  assert.equal(gamification.snapshot(secondDay).xp, 100);
  assert.equal(gamification.snapshot(secondDay).badges["first-lesson"], firstDay);

  for (let day = 1; day < 7; day += 1) {
    const timestamp = new Date(2026, 2, 8 + day, 12).getTime();
    gamification.recordActivity("challenge", `python:challenge-${day}`, { timestamp });
  }
  const completed = gamification.snapshot(new Date(2026, 2, 14, 12).getTime());
  assert.equal(completed.xp, 250);
  assert.equal(completed.level.title, "Coder");
  assert.equal(completed.streak.current, 7);
  assert.equal(completed.streak.best, 7);
  assert.equal(completed.badges["first-challenge"], new Date(2026, 2, 9, 12).getTime());
  assert.equal(completed.badges["consistent-learner"], new Date(2026, 2, 14, 12).getTime());
  assert.equal(notifications.filter((item) => item.kind === "badge").length, 3);
  const restored = createGamification(storage, gamification.config);
  assert.equal(restored.snapshot(new Date(2026, 2, 14, 12).getTime()).xp, 250);
  assert.deepEqual(restored.snapshot(new Date(2026, 2, 14, 12).getTime()).badges, completed.badges);
  assert.equal(restored.recordActivity("challenge", "python:challenge-1", { timestamp: new Date(2026, 2, 15, 12).getTime() }).awarded, false);
  assert.equal(restored.snapshot(new Date(2026, 2, 15, 12).getTime()).streak.current, 7);
});

test("لا تُعاد مكافأة XP عندما يفشل حفظها في المتصفح", () => {
  const notifications = [];
  const gamification = createGamification({
    getItem: () => null,
    setItem: () => { throw new Error("storage full"); }
  }, {
    xp: { lesson: 10, challenge: 25, assessment: 40, project: 60, unit: 25 },
    levels: [{ id: "beginner", title: "Beginner", minimumXp: 0 }],
    badges: []
  }, (message, kind) => notifications.push({ message, kind }));

  const result = gamification.recordActivity("lesson", "python:lesson-1");
  assert.equal(result.awarded, false);
  assert.equal(result.saveFailed, true);
  assert.equal(gamification.snapshot().xp, 0);
  assert.ok(notifications.some((item) => item.kind === "warning"));
});

test("تقدم التحديات يتحقق منه ويُشتق إلى سجلات محاولات منفصلة", async () => {
  const c = client();
  const registration = await c("POST", "/api/auth/register", {
    name: "Challenge Test",
    email: "challenge-test@example.com",
    password: "password123"
  });
  assert.equal(registration.status, 201);
  const challengeKey = "efhama_challenge_py-functions";
  const invalid = await c("PUT", `/api/state/${challengeKey}`, { value: JSON.stringify({ attempts: 1 }) });
  assert.equal(invalid.status, 400);
  const now = Date.now();
  const state = {
    attempts: 2,
    bestScore: 100,
    completed: true,
    lastScore: 100,
    lastPassed: true,
    lastAttemptAt: now,
    updatedAt: now
  };
  const saved = await c("PUT", `/api/state/${challengeKey}`, { value: JSON.stringify(state) });
  assert.equal(saved.status, 200);
  assert.deepEqual({ ...(await q.get("SELECT attempts, best_score AS \"bestScore\", completed FROM challenge_progress WHERE user_id = ? AND challenge_id = ?", [registration.json.user.id, "py-functions"])) }, {
    attempts: 2, bestScore: 100, completed: 1
  });
  assert.equal((await q.get("SELECT COUNT(*) AS count FROM challenge_attempts WHERE user_id = ? AND challenge_id = ? AND passed = 1", [registration.json.user.id, "py-functions"])).count, 1);
});

test("تحديات SQL تنفذ استعلامات قراءة على مجموعات بيانات معزولة متعددة", async () => {
  const anonymous = await fetch(`${base}/api/challenges/sql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challengeId: "sql-filter-code", query: "SELECT name FROM students" })
  });
  assert.equal(anonymous.status, 401);

  const c = client();
  const registration = await c("POST", "/api/auth/register", {
    name: "SQL Challenge Test",
    email: "sql-challenge-test@example.com",
    password: "password123"
  });
  assert.equal(registration.status, 201);
  const correct = await c("POST", "/api/challenges/sql", {
    challengeId: "sql-filter-code",
    query: "SELECT name FROM students WHERE score >= 80 ORDER BY score DESC;"
  });
  assert.equal(correct.status, 200);
  assert.deepEqual(correct.json, {
    score: 100,
    passed: 2,
    total: 2,
    message: "أحسنت! نجح الاستعلام مع كل مجموعات البيانات."
  });
  const wrong = await c("POST", "/api/challenges/sql", {
    challengeId: "sql-filter-code",
    query: "SELECT name FROM students WHERE score >= 80"
  });
  assert.equal(wrong.json.score, 50);
  const write = await c("POST", "/api/challenges/sql", {
    challengeId: "sql-filter-code",
    query: "DELETE FROM students"
  });
  assert.equal(write.status, 400);
  const join = await c("POST", "/api/challenges/sql", {
    challengeId: "sql-relations",
    query: "SELECT students.name, courses.title FROM students JOIN courses ON students.course_id = courses.id"
  });
  assert.equal(join.json.score, 100);
  const systemTable = await c("POST", "/api/challenges/sql", {
    challengeId: "sql-filter-code",
    query: "SELECT name FROM sqlite_schema"
  });
  assert.equal(systemTable.json.score, 0);
  const joins = Array.from({ length: 24 }, (_value, index) => `students AS s${index}`).join(" CROSS JOIN ");
  const timeout = await c("POST", "/api/challenges/sql", {
    challengeId: "sql-filter-code",
    query: `SELECT COUNT(s0.id) AS total FROM ${joins}`
  });
  assert.match(timeout.json.message, /تجاوز مهلة التنفيذ/);
});

test("التسجيل والدخول والخروج", async () => {
  const c = client();
  assert.equal((await c("POST", "/api/auth/register", { email: "bad", password: "12345678" })).status, 400);
  assert.equal((await c("POST", "/api/auth/register", { email: "a@b.com", password: "short" })).status, 400);
  const reg = await c("POST", "/api/auth/register", { name: "أحمد", email: "Ahmed@Test.com", password: "password123" });
  assert.equal(reg.status, 201); assert.equal(reg.json.user.email, "ahmed@test.com"); assert.equal(reg.json.user.role, "student");
  assert.equal((await c("POST", "/api/auth/register", { email: "ahmed@test.com", password: "password123" })).status, 409);
  const spacedLogin = await c("POST", "/api/auth/login", { email: "  AHMED@test.com  ", password: "password123" });
  assert.equal(spacedLogin.status, 200);
  assert.equal((await c("GET", "/api/auth/me")).json.user.name, "أحمد");
  await c("POST", "/api/auth/logout");
  assert.equal((await c("GET", "/api/auth/me")).status, 401);
  const bad = await c("POST", "/api/auth/login", { email: "ahmed@test.com", password: "wrongwrong" });
  assert.equal(bad.status, 401);
  const ok = await c("POST", "/api/auth/login", { email: "AHMED@test.com", password: "password123", remember: true });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(ok.headers.get("set-cookie"), /Max-Age/i);
  const sess = client({ isolatedDevice: true });
  const s = await sess("POST", "/api/auth/login", { email: "ahmed@test.com", password: "password123", remember: false });
  assert.equal(s.status, 409);
  assert.equal(s.json.error, "active_session");
  assert.match(s.json.message, /مستخدم حاليًا على جهاز آخر/);
  const transfer = await sess("POST", "/api/auth/login/transfer", {
    email: "ahmed@test.com", password: "password123", remember: false, transferToken: s.json.transferToken
  });
  assert.equal(transfer.status, 200);
  assert.equal((await c("GET", "/api/auth/me")).status, 401);

  const spacedPassword = "  password123  ";
  const spacedReg = await c("POST", "/api/auth/register", { email: "spaces@test.com", password: spacedPassword });
  assert.equal(spacedReg.status, 201);
  assert.equal((await c("POST", "/api/auth/login", { email: "spaces@test.com", password: "password123" })).status, 401);
  assert.equal((await c("POST", "/api/auth/login", { email: "spaces@test.com", password: spacedPassword })).status, 200);
});

test("الإشعارات محمية لكل مستخدم، وتدعم القراءة والحذف والبث الإداري المتكرر بأمان", async () => {
  const anonymous = await fetch(`${base}/api/notifications`);
  assert.equal(anonymous.status, 401);
  const first = client();
  const second = client();
  const one = await first("POST", "/api/auth/register", {
    name: "Notifications One", email: "notifications-one@example.com", password: "password123"
  });
  const two = await second("POST", "/api/auth/register", {
    name: "Notifications Two", email: "notifications-two@example.com", password: "password123"
  });
  assert.equal(one.status, 201);
  assert.equal(two.status, 201);

  const firstList = await first("GET", "/api/notifications");
  assert.equal(firstList.status, 200);
  assert.equal(firstList.json.total, 1);
  assert.equal(firstList.json.notifications[0].type, "subscription");
  assert.equal(firstList.json.notifications[0].isRead, 0);
  assert.equal((await first("GET", "/api/notifications/unread-count")).json.count, 1);
  const firstNotificationId = firstList.json.notifications[0].id;
  const secondNotificationId = (await second("GET", "/api/notifications")).json.notifications[0].id;
  assert.notEqual(firstNotificationId, secondNotificationId);
  assert.equal((await first("PATCH", `/api/notifications/${secondNotificationId}/read`)).status, 404);
  assert.equal((await first("DELETE", `/api/notifications/${secondNotificationId}`)).status, 404);

  assert.equal((await first("PATCH", `/api/notifications/${firstNotificationId}/read`)).json.changed, true);
  assert.equal((await first("PATCH", `/api/notifications/${firstNotificationId}/read`)).json.changed, false);
  assert.ok((await q.get(
    "SELECT read_at FROM notifications WHERE id = ? AND user_id = ?",
    [firstNotificationId, one.json.user.id]
  )).read_at);
  assert.equal((await first("GET", "/api/notifications/unread-count")).json.count, 0);

  const studentAudienceCount = (await q.get(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'student' AND active = 1 AND approval_status = 'approved'"
  )).count;
  const admin = client();
  await admin("POST", "/api/auth/login", { email: "admin@test.com", password: "AdminPass123" });
  const message = {
    title: "تحديث مهم",
    message: "تم نشر تحديث جديد للمنصة.",
    type: "education",
    audience: "students",
    actionUrl: "/chapters.html",
  };
  const key = "notice-test-key-0001";
  const sent = await admin("POST", "/api/admin/notifications", message, { headers: { "Idempotency-Key": key } });
  assert.equal(sent.status, 201);
  assert.equal(sent.json.recipientCount, studentAudienceCount);
  const duplicateSend = await admin("POST", "/api/admin/notifications", message, { headers: { "Idempotency-Key": key } });
  assert.equal(duplicateSend.status, 200);
  assert.equal(duplicateSend.json.duplicate, true);
  assert.equal((await first("GET", "/api/notifications/unread-count")).json.count, 1);
  assert.equal((await first("PATCH", "/api/notifications/read-all")).json.updated, 1);
  assert.equal((await first("GET", "/api/notifications/unread-count")).json.count, 0);

  const sentHistory = await admin("GET", "/api/admin/notifications");
  assert.equal(sentHistory.status, 200);
  assert.equal(sentHistory.json.broadcasts[0].title, message.title);
  assert.equal((await first("POST", "/api/admin/notifications", message)).status, 403);
  assert.equal((await first("DELETE", "/api/notifications")).json.deleted, 2);
  assert.equal((await first("GET", "/api/notifications")).json.total, 0);
  assert.equal((await second("GET", "/api/notifications")).json.total, 2);

  const firstUserId = one.json.user.id;
  assert.equal((await admin("PATCH", `/api/admin/users/${firstUserId}`, { approvalStatus: "suspended" })).status, 200);
  assert.equal((await q.get(
    "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND title = 'تم إيقاف حسابك'",
    [firstUserId]
  )).count, 1);
  assert.equal((await admin("PATCH", `/api/admin/users/${firstUserId}`, { active: true })).status, 200);
  assert.equal((await q.get(
    "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND title = 'تمت إعادة تفعيل حسابك'",
    [firstUserId]
  )).count, 1);
});

test("طلب الاشتراك يحجب المحتوى حتى موافقة الأدمن ثم يوقفه عند الانتهاء", async () => {
  const student = client({ autoActivate: false });
  const invalid = await student("POST", "/api/auth/register", {
    name: "Pending Student", email: "pending@example.com", password: "password123",
    confirmPassword: "password123", proof: "data:image/svg+xml;base64,PHN2Zz4="
  });
  assert.equal(invalid.status, 400);
  assert.equal((await q.get("SELECT COUNT(*) AS count FROM users WHERE email = ?", ["pending@example.com"])).count, 0);

  const registration = await student("POST", "/api/auth/register", {
    name: "Pending Student", email: "pending@example.com", password: "password123"
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.json.user.subscriptionStatus, "pending");
  assert.equal(registration.json.user.accountStatus, "pending");
  assert.equal((await q.get("SELECT account_status FROM users WHERE id = ?", [registration.json.user.id])).account_status, "pending");
  assert.equal((await student("GET", "/api/auth/me")).status, 401);
  assert.equal((await student("POST", "/api/auth/subscription-status", {
    email: "pending@example.com", password: "wrongpassword"
  })).status, 401);
  const pendingStatus = await student("POST", "/api/auth/subscription-status", {
    email: "pending@example.com", password: "password123"
  });
  assert.equal(pendingStatus.status, 200);
  assert.equal(pendingStatus.json.status, "pending");
  assert.equal(pendingStatus.headers.get("cache-control"), "no-store");
  const pendingLogin = await student("POST", "/api/auth/login", { email: "pending@example.com", password: "password123" });
  assert.equal(pendingLogin.status, 403);
  assert.equal(pendingLogin.json.error, "approval_pending");
  assert.equal((await student("POST", "/api/auth/register", {
    name: "Duplicate Student", email: "pending@example.com", password: "password123"
  })).status, 409);

  assert.equal((await student("GET", "/api/lessons/1-1")).status, 401);
  assert.equal((await student("GET", "/data/paths/python.json")).status, 401);
  assert.equal((await student("GET", "/api/state")).status, 401);

  const admin = client();
  await admin("POST", "/api/auth/login", { email: "admin@test.com", password: "AdminPass123" });
  const requestId = (await q.get("SELECT id FROM subscription_requests WHERE user_id = ?", [registration.json.user.id])).id;
  assert.equal((await student("GET", `/api/admin/subscription-requests/${requestId}/proof`)).status, 401);
  const proof = await admin("GET", `/api/admin/subscription-requests/${requestId}/proof`);
  assert.equal(proof.status, 200);
  assert.equal(proof.headers.get("content-type"), "image/png");
  assert.equal((await admin("POST", `/api/admin/subscription-requests/${requestId}/reject`, { reason: "إثبات التحويل غير واضح" })).status, 200);
  assert.equal((await q.get(
    "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND event_key = ?",
    [registration.json.user.id, `subscription-rejected-request:${requestId}`]
  )).count, 1);
  const rejectionNotice = await q.get(
    "SELECT message FROM notifications WHERE user_id = ? AND event_key = ?",
    [registration.json.user.id, `account-rejected-request:${requestId}`]
  );
  assert.match(rejectionNotice.message, /إثبات التحويل غير واضح/);
  const rejectedStatus = await student("POST", "/api/auth/subscription-status", {
    email: "pending@example.com", password: "password123"
  });
  assert.equal(rejectedStatus.json.status, "rejected");
  assert.equal(rejectedStatus.json.request.rejection_reason, "إثبات التحويل غير واضح");

  const rejectedLogin = await student("POST", "/api/auth/login", { email: "pending@example.com", password: "password123" });
  assert.equal(rejectedLogin.status, 403);
  assert.equal(rejectedLogin.json.error, "account_rejected");
  const resubmitted = await student("POST", "/api/auth/register", {
    name: "Pending Student", email: "pending@example.com", password: "password123"
  });
  assert.equal(resubmitted.status, 201);
  assert.equal((await student("POST", "/api/auth/login", { email: "pending@example.com", password: "password123" })).json.error, "approval_pending");

  const nextId = (await q.get("SELECT id FROM subscription_requests WHERE user_id = ? AND status = 'pending'", [registration.json.user.id])).id;
  const approved = await admin("POST", `/api/admin/subscription-requests/${nextId}/approve`, {});
  assert.equal(approved.status, 200);
  assert.equal((await q.get(
    "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND event_key = ?",
    [registration.json.user.id, `subscription-approved-request:${nextId}`]
  )).count, 1);
  assert.equal(approved.json.endsAt, new Date(approved.json.startsAt).setUTCFullYear(new Date(approved.json.startsAt).getUTCFullYear() + 1));
  const approvedUser = (await admin("GET", "/api/admin/users")).json.users.find((user) => user.id === registration.json.user.id);
  assert.equal(approvedUser.approvalStatus, "approved");
  assert.equal(approvedUser.accountStatus, "active");
  assert.equal((await admin("POST", `/api/admin/subscription-requests/${nextId}/approve`, {})).status, 409);
  const studentLogin = await student("POST", "/api/auth/login", { email: "pending@example.com", password: "password123" });
  assert.equal(studentLogin.status, 200);
  assert.equal((await student("GET", "/api/auth/me")).json.user.subscriptionStatus, "active");
  assert.equal((await student("GET", "/api/auth/me")).json.user.accountStatus, "active");
  assert.equal((await student("GET", "/api/lessons/1-1")).status, 200);
  assert.equal((await student("GET", "/data/paths/python.json")).status, 200);
  assert.equal((await student("POST", "/api/auth/subscription-request", { proof: TEST_PROOF })).status, 409);

  (await q.run("UPDATE subscriptions SET ends_at = ? WHERE user_id = ?", [Date.now() - 1, registration.json.user.id]));
  assert.equal((await student("GET", "/api/auth/me")).json.user.subscriptionStatus, "expired");
  assert.equal((await student("GET", "/api/notifications")).status, 200);
  assert.equal((await student("GET", "/api/lessons/1-1")).status, 403);
});

test("اعتماد الحساب ونقل الجلسة بين جهازين مع إبطال الجلسة القديمة", async () => {
  const registration = await client({ autoActivate: false })("POST", "/api/auth/register", {
    name: "Device Bound", email: "device-bound@example.com", password: "password123"
  });
  assert.equal(registration.status, 201);
  const userId = registration.json.user.id;

  const firstDevice = client({ autoActivate: false, isolatedDevice: true });
  const pending = await firstDevice("POST", "/api/auth/login", { email: "device-bound@example.com", password: "password123" });
  assert.equal(pending.status, 403);
  assert.equal(pending.json.error, "approval_pending");

  const admin = client();
  await admin("POST", "/api/auth/login", { email: "admin@test.com", password: "AdminPass123" });
  const requestId = (await q.get("SELECT id FROM subscription_requests WHERE user_id = ?", [userId])).id;
  assert.equal((await admin("POST", `/api/admin/subscription-requests/${requestId}/approve`, {})).status, 200);

  const firstLogin = await firstDevice("POST", "/api/auth/login", { email: "device-bound@example.com", password: "password123" });
  assert.equal(firstLogin.status, 200);
  assert.match(firstLogin.headers.get("set-cookie"), /HttpOnly/i);
  const sessionCookie = firstLogin.cookie.split("; ").find((cookie) => cookie.startsWith("efhama_token="));
  assert.ok(sessionCookie);
  assert.equal(firstLogin.headers.get("set-cookie").includes("efhama_device_"), false);

  await firstDevice("POST", "/api/auth/logout");
  assert.equal((await firstDevice("GET", "/api/auth/me")).status, 401);
  assert.equal((await firstDevice("POST", "/api/auth/login", { email: "device-bound@example.com", password: "password123" })).status, 200);

  const secondDevice = client({ autoActivate: false, isolatedDevice: true });
  const confirmation = await secondDevice("POST", "/api/auth/login", { email: "device-bound@example.com", password: "password123" });
  assert.equal(confirmation.status, 409);
  assert.equal(confirmation.json.error, "active_session");
  assert.match(confirmation.json.message, /مستخدم حاليًا على جهاز آخر/);
  assert.equal((await secondDevice("GET", "/api/auth/me")).status, 401);
  assert.equal((await firstDevice("GET", "/api/auth/me")).status, 200);
  assert.equal((await secondDevice("POST", "/api/auth/login/transfer", {
    email: "device-bound@example.com", password: "wrong-password",
    transferToken: confirmation.json.transferToken
  })).status, 401);
  assert.equal((await firstDevice("GET", "/api/auth/me")).status, 200);

  assert.equal((await secondDevice("POST", "/api/auth/login/cancel-transfer", {
    transferToken: confirmation.json.transferToken
  })).status, 200);
  assert.equal((await firstDevice("GET", "/api/auth/me")).status, 200);
  const cancelledHistory = await admin("GET", "/api/admin/session-transfers");
  assert.equal(cancelledHistory.status, 200);
  assert.equal(cancelledHistory.json.attempts[0].status, "cancelled");

  const expiringRequest = await secondDevice("POST", "/api/auth/login", { email: "device-bound@example.com", password: "password123" });
  const pendingTransferId = (await q.get("SELECT id FROM session_transfer_attempts WHERE user_id = ? AND status = 'confirmation_required' ORDER BY id DESC LIMIT 1", [userId])).id;
  (await q.run("UPDATE session_transfer_attempts SET expires_at = ? WHERE id = ?", [Date.now() - 1, pendingTransferId]));
  const expiredTransfer = await secondDevice("POST", "/api/auth/login/transfer", {
    email: "device-bound@example.com", password: "password123",
    transferToken: expiringRequest.json.transferToken
  });
  assert.equal(expiredTransfer.status, 409);
  assert.equal(expiredTransfer.json.error, "transfer_expired");
  assert.equal((await firstDevice("GET", "/api/auth/me")).status, 200);
  assert.equal((await admin("GET", "/api/admin/session-transfers")).json.attempts[0].status, "expired");

  const transferRequest = await secondDevice("POST", "/api/auth/login", { email: "device-bound@example.com", password: "password123" });
  assert.equal(transferRequest.status, 409);
  const transfer = await secondDevice("POST", "/api/auth/login/transfer", {
    email: "device-bound@example.com", password: "password123",
    transferToken: transferRequest.json.transferToken
  });
  assert.equal(transfer.status, 200);
  assert.equal((await firstDevice("GET", "/api/auth/me")).status, 401);
  assert.equal((await firstDevice("GET", "/api/lessons/1-1")).status, 401);
  assert.equal((await secondDevice("GET", "/api/auth/me")).status, 200);
  await firstDevice("POST", "/api/auth/logout");
  assert.equal((await secondDevice("GET", "/api/auth/me")).status, 200);
  const attempts = await admin("GET", "/api/admin/session-transfers");
  assert.equal(attempts.status, 200);
  assert.equal(attempts.json.attempts[0].status, "transferred");
  assert.ok(attempts.json.attempts.some((attempt) => attempt.status === "cancelled"));

  const users = await admin("GET", "/api/admin/users?q=device-bound");
  assert.equal(users.json.users[0].approvalStatus, "approved");
  assert.ok(users.json.users[0].sessionStartedAt);

  const oldSession = await fetch(`${base}/api/auth/me`, {
    headers: { cookie: sessionCookie }
  });
  assert.equal(oldSession.status, 401);
});

test("محاولات الدخول ونقل الجلسة المتزامنة لا تنشئ أكثر من جلسة نشطة", async () => {
  const registrationClient = client({ autoActivate: false });
  const registration = await registrationClient("POST", "/api/auth/register", {
    name: "Concurrent Transfer", email: "concurrent-transfer@example.com", password: "password123"
  });
  const userId = registration.json.user.id;
  const now = Date.now();
  (await q.run("UPDATE users SET approval_status = 'approved', account_status = 'active' WHERE id = ?", [userId]));
  (await q.run("INSERT INTO subscriptions (user_id, starts_at, ends_at, status, updated_at) VALUES (?, ?, ?, 'active', ?)", [userId, now, now + 365 * 86400000, now]));

  const deviceA = client({ autoActivate: false, isolatedDevice: true });
  const deviceB = client({ autoActivate: false, isolatedDevice: true });
  const [loginA, loginB] = await Promise.all([
    deviceA("POST", "/api/auth/login", { email: "concurrent-transfer@example.com", password: "password123" }),
    deviceB("POST", "/api/auth/login", { email: "concurrent-transfer@example.com", password: "password123" })
  ]);
  assert.deepEqual([loginA.status, loginB.status].sort(), [200, 409]);
  const currentDevice = loginA.status === 200 ? deviceA : deviceB;
  const requestingDevice = loginA.status === 409 ? deviceA : deviceB;
  const conflict = loginA.status === 409 ? loginA : loginB;
  const transferToken = conflict.json.transferToken;

  const contenderA = client({ autoActivate: false, isolatedDevice: true });
  const contenderB = client({ autoActivate: false, isolatedDevice: true });
  const confirmationBody = {
    email: "concurrent-transfer@example.com",
    password: "password123",
    transferToken
  };
  const confirmations = await Promise.all([
    contenderA("POST", "/api/auth/login/transfer", confirmationBody),
    contenderB("POST", "/api/auth/login/transfer", confirmationBody)
  ]);
  assert.deepEqual(confirmations.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await currentDevice("GET", "/api/auth/me")).status, 401);
  const winner = confirmations[0].status === 200 ? contenderA : contenderB;
  assert.equal((await winner("GET", "/api/auth/me")).status, 200);
  assert.equal((await q.get("SELECT COUNT(*) AS count FROM user_sessions WHERE user_id = ?", [userId])).count, 1);
  assert.equal((await q.get("SELECT COUNT(*) AS count FROM session_transfer_attempts WHERE user_id = ? AND status = 'transferred'", [userId])).count, 1);
  assert.equal((await requestingDevice("GET", "/api/auth/me")).status, 401);
});

test("المحتوى مطابق لملفات المنهج الأصلية", async () => {
  const c = client();
  await c("POST", "/api/auth/login", { email: "admin@test.com", password: "AdminPass123" });
  const seed = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "seed", f), "utf8"));
  assert.deepEqual((await c("GET", "/data/curriculum.json")).json, seed("curriculum.json"));
  assert.deepEqual((await c("GET", "/data/lessons/lesson-3-2.json")).json, seed("lessons/lesson-3-2.json"));
  assert.deepEqual((await c("GET", "/api/lessons/3-2")).json, seed("lessons/lesson-3-2.json"));
  assert.deepEqual((await c("GET", "/data/quizzes/chapter-4-quiz.json")).json, seed("quizzes/chapter-4-quiz.json"));
  assert.deepEqual((await c("GET", "/api/quizzes/4")).json, seed("quizzes/chapter-4-quiz.json"));
  // فهرس البحث المُعاد بناؤه من المحتوى = الملف الأصلي
  assert.deepEqual((await c("GET", "/data/search-index.json")).json, seed("search-index.json"));
  assert.equal((await c("GET", "/data/lessons/lesson-9-9.json")).status, 404);
  assert.equal((await c("GET", "/data/lessons/lesson-..%2f..%2fx.json")).status, 404);
});

test("مزامنة الحالة + الجداول المشتقة", async () => {
  const c = client();
  await c("POST", "/api/auth/register", { email: "s1@test.com", password: "password123" });
  assert.equal((await c("PUT", "/api/state/efhama_completed", { value: JSON.stringify(["1-1", "1-2"]) })).status, 200);
  assert.equal((await c("PUT", "/api/state/efhama_started", { value: JSON.stringify(["1-2", "2-1"]) })).status, 200);
  assert.equal((await c("PUT", "/api/state/efhama_pos_2-1", { value: "0.42" })).status, 200);
  assert.equal((await c("PUT", "/api/state/efhama_rating_1-1", { value: JSON.stringify({ stars: 5, at: 1 }) })).status, 200);
  assert.equal((await c("PUT", "/api/state/efhama_quiz_results", { value: JSON.stringify({ "chapter-1": { score: 7, total: 10, at: 1700000000000 } }) })).status, 200);
  // رفض القيم/المفاتيح غير الصالحة
  assert.equal((await c("PUT", "/api/state/efhama_auth", { value: "1" })).status, 400);
  assert.equal((await c("PUT", "/api/state/efhama_pos_1-1", { value: "5" })).status, 400);
  assert.equal((await c("PUT", "/api/state/efhama_rating_1-1", { value: JSON.stringify({ stars: 9 }) })).status, 400);
  assert.equal((await c("PUT", "/api/state/efhama_completed", { value: "not json" })).status, 400);
  assert.equal((await c("PUT", "/api/state/efhama_completed", { value: 5 })).status, 400);

  const st = (await c("GET", "/api/state")).json.state;
  assert.equal(st.efhama_pos_2_1 ?? st["efhama_pos_2-1"], "0.42");
  assert.deepEqual(JSON.parse(st.efhama_completed), ["1-1", "1-2"]);

  const u = (await q.get("SELECT id FROM users WHERE email='s1@test.com'", [])).id;
  const rows = (await q.all("SELECT lesson_id, status FROM lesson_progress WHERE user_id=? ORDER BY lesson_id", [u]));
  assert.deepEqual(rows.map((r) => ({ ...r })), [{ lesson_id: "1-1", status: "completed" }, { lesson_id: "1-2", status: "completed" }, { lesson_id: "2-1", status: "started" }]);
  assert.equal((await q.get("SELECT stars FROM ratings WHERE user_id=?", [u])).stars, 5);
  assert.equal((await q.get("SELECT COUNT(*) c FROM quiz_attempts WHERE user_id=?", [u])).c, 1);
  // إعادة إرسال نفس النتيجة لا تكرر المحاولة
  await c("PUT", "/api/state/efhama_quiz_results", { value: JSON.stringify({ "chapter-1": { score: 7, total: 10, at: 1700000000000 } }) });
  assert.equal((await q.get("SELECT COUNT(*) c FROM quiz_attempts WHERE user_id=?", [u])).c, 1);

  const bulk = await c("PUT", "/api/state", { items: { efhama_theme: "dark", efhama_fontsize: "2", bogus_key: "x" } });
  assert.equal(bulk.json.saved, 2); assert.ok(bulk.json.rejected.bogus_key);

  // عزل المستخدمين
  const other = client();
  await other("POST", "/api/auth/register", { email: "s2@test.com", password: "password123" });
  assert.deepEqual((await other("GET", "/api/state")).json.state, {});
});

test("لوحة الإدارة: صلاحيات وإحصاءات وإدارة المستخدمين", async () => {
  const student = client();
  await student("POST", "/api/auth/login", { email: "s1@test.com", password: "password123" });
  assert.equal((await student("GET", "/api/admin/stats")).status, 403);
  assert.equal((await client()("GET", "/api/admin/stats")).status, 401);

  const a = client();
  await a("POST", "/api/auth/login", { email: "admin@test.com", password: "AdminPass123" });
  const stats = (await a("GET", "/api/admin/stats")).json;
  assert.ok(stats.users >= 3);
  assert.ok(stats.lessons.find((l) => l.id === "1-1" && l.completed === 1 && l.avgRating === 5));
  assert.equal(stats.quizzes[0].avgPercent, 70);

  const list = (await a("GET", "/api/admin/users?q=s1@")).json;
  assert.equal(list.total, 1);
  const id = list.users[0].id;
  assert.equal((await a("PATCH", `/api/admin/users/${id}`, { active: false })).status, 200);
  assert.equal((await student("GET", "/api/auth/me")).status, 401);          // الجلسة أُنهيت
  assert.equal((await client()("POST", "/api/auth/login", { email: "s1@test.com", password: "password123" })).status, 403);
  assert.equal((await a("POST", `/api/admin/users/${id}/reset-password`, { password: "newpassword9" })).status, 200);
  await a("PATCH", `/api/admin/users/${id}`, { active: true });
  assert.equal((await client()("POST", "/api/auth/login", { email: "s1@test.com", password: "newpassword9" })).status, 200);
  // لا يمكن للمسؤول إقفال نفسه
  const me = (await a("GET", "/api/auth/me")).json.user.id;
  assert.equal((await a("PATCH", `/api/admin/users/${me}`, { role: "student" })).status, 400);
  assert.equal((await a("DELETE", `/api/admin/users/${me}`)).status, 400);
});

test("إدارة المحتوى مع التحقق وإعادة بناء فهرس البحث", async () => {
  const a = client();
  await a("POST", "/api/auth/login", { email: "admin@test.com", password: "AdminPass123" });
  const lesson = (await a("GET", "/api/lessons/1-1")).json;
  assert.equal((await a("PUT", "/api/admin/lessons/1-1", { ...lesson, sections: [] })).status, 422);
  assert.equal((await a("PUT", "/api/admin/lessons/9-9", lesson)).status, 404);
  lesson.title = "عنوان معدّل";
  assert.equal((await a("PUT", "/api/admin/lessons/1-1", lesson)).status, 200);
  assert.equal((await a("GET", "/api/lessons/1-1")).json.title, "عنوان معدّل");
  assert.equal((await a("GET", "/api/search-index")).json.lessons[0].title, "عنوان معدّل");

  const quiz = (await a("GET", "/api/quizzes/1")).json;
  const bad = { questions: [{ q: "س", options: ["أ", "ب"], answer: 5 }] };
  assert.equal((await a("PUT", "/api/admin/quizzes/1", bad)).status, 422);
  assert.equal((await a("PUT", "/api/admin/quizzes/1", quiz)).status, 200);

  const cur = (await a("GET", "/api/curriculum")).json;
  cur.chapters[0].lessons.push({ id: "1-5", title: "درس جديد", desc: "", duration: 10 });
  const r = await a("PUT", "/api/admin/curriculum", cur);
  assert.equal(r.json.totalLessons, 15);
  cur.chapters[0].lessons.push({ id: "1-5", title: "مكرر" });
  assert.equal((await a("PUT", "/api/admin/curriculum", cur)).status, 422);
});

test("تغيير كلمة المرور يُبطل الجلسات الأخرى", async () => {
  const c1 = client(), c2 = client({ isolatedDevice: true });
  await c1("POST", "/api/auth/register", { email: "cp@test.com", password: "password123" });
  await c2("POST", "/api/auth/login", { email: "cp@test.com", password: "password123" });
  assert.equal((await c1("POST", "/api/auth/change-password", { currentPassword: "x", newPassword: "newpassword1" })).status, 401);
  assert.equal((await c1("POST", "/api/auth/change-password", { currentPassword: "password123", newPassword: "newpassword1" })).status, 200);
  assert.equal((await c1("GET", "/api/auth/me")).status, 200);
  assert.equal((await c2("GET", "/api/auth/me")).status, 401);
});

test("الاختبارات تحفظ الإجابات وتصّحح Python وSQL دون كشف المفاتيح", async () => {
  const c = client();
  assert.equal((await c("POST", "/api/auth/register", {
    name: "Assessment Test",
    email: "assessment-test@example.com",
    password: "password123"
  })).status, 201);

  const pythonDirectory = await c("GET", "/api/assessments?slug=python");
  assert.equal(pythonDirectory.status, 200);
  const pythonAssessment = pythonDirectory.json.assessments.find((item) => item.id === "python:lesson:python-6");
  assert.ok(pythonAssessment);
  const pythonSession = await c("POST", `/api/assessments/${encodeURIComponent(pythonAssessment.id)}/start`, {});
  assert.equal(pythonSession.status, 201);
  const pythonQuestion = pythonSession.json.questions.find((item) => item.id === "python-practical-sum");
  assert.equal(pythonQuestion.responseType, "code");
  assert.equal("correctOption" in pythonQuestion, false);
  assert.equal("tests" in pythonQuestion, false);
  assert.equal("explanation" in pythonQuestion, false);

  const pythonAnswer = "def sum_positive(values):\n    return sum(value for value in values if value > 0)";
  const savedPython = await c("PUT", `/api/assessments/sessions/${pythonSession.json.sessionId}/answers`, {
    questionId: pythonQuestion.id,
    answer: pythonAnswer
  });
  assert.equal(savedPython.status, 200);
  const resumedPython = await c("GET", `/api/assessments/sessions/${pythonSession.json.sessionId}`);
  assert.equal(resumedPython.json.answers[pythonQuestion.id], pythonAnswer);
  const pythonResult = await c("POST", `/api/assessments/sessions/${pythonSession.json.sessionId}/submit`, {});
  assert.equal(pythonResult.status, 200);
  assert.equal(pythonResult.json.result.review.find((item) => item.questionId === pythonQuestion.id).passed, true);
  const repeatedSubmit = await c("POST", `/api/assessments/sessions/${pythonSession.json.sessionId}/submit`, {});
  assert.equal(repeatedSubmit.json.alreadySubmitted, true);
  const pythonHistory = (await c("GET", "/api/assessments?slug=python")).json.assessments
    .find((item) => item.id === pythonAssessment.id);
  assert.equal(pythonHistory.attempts, 1);
  assert.equal(pythonHistory.history.length, 1);

  const isolatedPython = await c("POST", `/api/assessments/${encodeURIComponent(pythonAssessment.id)}/start`, {});
  const isolatedQuestion = isolatedPython.json.questions.find((item) => item.id === "python-practical-sum");
  await c("PUT", `/api/assessments/sessions/${isolatedPython.json.sessionId}/answers`, {
    questionId: isolatedQuestion.id,
    answer: "import js\ndef sum_positive(values):\n    return 6"
  });
  const isolatedResult = await c("POST", `/api/assessments/sessions/${isolatedPython.json.sessionId}/submit`, {});
  assert.equal(isolatedResult.json.result.review.find((item) => item.questionId === isolatedQuestion.id).passed, false);

  const sqlAssessment = (await c("GET", "/api/assessments?slug=sql")).json.assessments
    .find((item) => item.id === "sql:lesson:sql-5");
  const sqlSession = await c("POST", `/api/assessments/${encodeURIComponent(sqlAssessment.id)}/start`, {});
  const sqlQuestion = sqlSession.json.questions.find((item) => item.id === "sql-practical-write");
  assert.equal(sqlQuestion.responseType, "code");
  const sqlAnswer = "SELECT name FROM students WHERE score >= 80 ORDER BY score DESC";
  assert.equal((await c("PUT", `/api/assessments/sessions/${sqlSession.json.sessionId}/answers`, {
    questionId: sqlQuestion.id,
    answer: sqlAnswer
  })).status, 200);
  const sqlResult = await c("POST", `/api/assessments/sessions/${sqlSession.json.sessionId}/submit`, {});
  assert.equal(sqlResult.status, 200);
  assert.equal(sqlResult.json.result.review.find((item) => item.questionId === sqlQuestion.id).passed, true);

  const jsAssessment = (await c("GET", "/api/assessments?slug=javascript")).json.assessments
    .find((item) => item.id === "javascript:lesson:js-3");
  const jsSession = await c("POST", `/api/assessments/${encodeURIComponent(jsAssessment.id)}/start`, {});
  const jsQuestion = jsSession.json.questions.find((item) => item.id === "javascript-practical-even");
  assert.equal((await c("PUT", `/api/assessments/sessions/${jsSession.json.sessionId}/answers`, {
    questionId: jsQuestion.id,
    answer: "function isEven(n) { return n % 2 === 0; }"
  })).status, 200);
  const jsResult = await c("POST", `/api/assessments/sessions/${jsSession.json.sessionId}/submit`, {});
  assert.equal(jsResult.json.result.review.find((item) => item.questionId === jsQuestion.id).passed, true);

  const timeoutSession = await c("POST", `/api/assessments/${encodeURIComponent(jsAssessment.id)}/start`, {});
  const timeoutQuestion = timeoutSession.json.questions.find((item) => item.id === "javascript-practical-even");
  await c("PUT", `/api/assessments/sessions/${timeoutSession.json.sessionId}/answers`, {
    questionId: timeoutQuestion.id,
    answer: "function isEven(n) { while (true) {} }"
  });
  const timeoutResult = await c("POST", `/api/assessments/sessions/${timeoutSession.json.sessionId}/submit`, {});
  assert.equal(timeoutResult.json.result.review.find((item) => item.questionId === timeoutQuestion.id).passed, false);

  const htmlAssessment = (await c("GET", "/api/assessments?slug=html")).json.assessments
    .find((item) => item.id === "html:lesson:html-5");
  const htmlSession = await c("POST", `/api/assessments/${encodeURIComponent(htmlAssessment.id)}/start`, {});
  const htmlQuestion = htmlSession.json.questions.find((item) => item.id === "html-practical-form");
  await c("PUT", `/api/assessments/sessions/${htmlSession.json.sessionId}/answers`, {
    questionId: htmlQuestion.id,
    answer: '<form><label for="email">Email</label><input id="email" type="email"><button type="submit">Send</button></form>'
  });
  const htmlResult = await c("POST", `/api/assessments/sessions/${htmlSession.json.sessionId}/submit`, {});
  assert.equal(htmlResult.json.result.review.find((item) => item.questionId === htmlQuestion.id).passed, true);

  const cssAssessment = (await c("GET", "/api/assessments?slug=css")).json.assessments
    .find((item) => item.id === "css:lesson:css-5");
  const cssSession = await c("POST", `/api/assessments/${encodeURIComponent(cssAssessment.id)}/start`, {});
  const cssQuestion = cssSession.json.questions.find((item) => item.id === "css-practical-layout");
  await c("PUT", `/api/assessments/sessions/${cssSession.json.sessionId}/answers`, {
    questionId: cssQuestion.id,
    answer: ".gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }"
  });
  const cssResult = await c("POST", `/api/assessments/sessions/${cssSession.json.sessionId}/submit`, {});
  assert.equal(cssResult.json.result.review.find((item) => item.questionId === cssQuestion.id).passed, true);

  const logicAssessment = (await c("GET", "/api/assessments?slug=logic")).json.assessments
    .find((item) => item.id === "logic:lesson:logic-7");
  const logicSession = await c("POST", `/api/assessments/${encodeURIComponent(logicAssessment.id)}/start`, {});
  const logicQuestion = logicSession.json.questions.find((item) => item.id === "logic-practical-pseudocode");
  await c("PUT", `/api/assessments/sessions/${logicSession.json.sessionId}/answers`, {
    questionId: logicQuestion.id,
    answer: "total <- 0\nfor number in [2, 4, 6]\n    total <- total + number\nprint(total)"
  });
  const logicResult = await c("POST", `/api/assessments/sessions/${logicSession.json.sessionId}/submit`, {});
  assert.equal(logicResult.json.result.review.find((item) => item.questionId === logicQuestion.id).passed, true);
});

test("الطلبات المتزامنة للاختبار تعيد الجلسة نفسها وتحفظ الإجابات وتُسجل تسليمًا واحدًا", async () => {
  const c = client();
  const registration = await c("POST", "/api/auth/register", {
    name: "Concurrent Assessment",
    email: "concurrent-assessment@example.com",
    password: "password123"
  });
  assert.equal(registration.status, 201);

  const directory = await c("GET", "/api/assessments?slug=logic");
  const assessment = directory.json.assessments.find((item) => item.questionCount >= 2);
  assert.ok(assessment);
  const starts = await Promise.all(Array.from({ length: 2 }, () =>
    c("POST", `/api/assessments/${assessment.id}/start`, {})
  ));
  assert.equal(starts.filter((response) => response.status === 201).length, 1);
  assert.equal(starts.filter((response) => response.status === 200).length, 1);
  const sessionIds = new Set(starts.map((response) => response.json.sessionId));
  assert.equal(sessionIds.size, 1);

  const sessionId = starts[0].json.sessionId;
  const questions = starts[0].json.questions.slice(0, 2);
  assert.equal(questions.length, 2);
  const saves = await Promise.all(questions.map((question, index) =>
    c("PUT", `/api/assessments/sessions/${sessionId}/answers`, {
      questionId: question.id,
      answer: question.options?.length ? "option-0" : `concurrent answer ${index}`
    })
  ));
  assert.ok(saves.every((response) => response.status === 200));

  const savedSession = await c("GET", `/api/assessments/sessions/${sessionId}`);
  assert.ok(questions.every((question) => savedSession.json.answers[question.id]));
  const submissions = await Promise.all([
    c("POST", `/api/assessments/sessions/${sessionId}/submit`, {}),
    c("POST", `/api/assessments/sessions/${sessionId}/submit`, {}),
  ]);
  assert.ok(submissions.every((response) => response.status === 200));
  assert.deepEqual(submissions.map((response) => response.json.alreadySubmitted).sort(), [false, true]);
  const attempts = await q.get("SELECT COUNT(*) AS count FROM assessment_attempts WHERE session_id = ?", [sessionId]);
  assert.equal(Number(attempts.count), 1);
});

test("معالجة الأخطاء", async () => {
  const c = client();
  const res = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{bad" });
  assert.equal(res.status, 400);
  assert.equal((await c("GET", "/api/nope")).status, 404);
  assert.equal((await c("GET", "/api/health")).json.ok, true);
});

test("إشعارات قرب انتهاء الاشتراك وانتهائه ونشر المحتوى تنشأ مرة واحدة بعد نجاح الحدث", async () => {
  const { runSubscriptionNotificationSweep } = require("../src/notifications");
  const student = client();
  const registration = await student("POST", "/api/auth/register", {
    name: "Notification Events", email: "notification-events@example.com", password: "password123"
  });
  assert.equal(registration.status, 201);
  const userId = registration.json.user.id;
  const now = Date.now();
  const reminderEnd = now + 6 * 86400000;
  await q.run(
    "UPDATE subscriptions SET starts_at = ?, ends_at = ?, status = 'active' WHERE user_id = ?",
    [now - 1000, reminderEnd, userId]
  );
  await runSubscriptionNotificationSweep(db, now);
  await runSubscriptionNotificationSweep(db, now);
  assert.equal((await q.get(
    "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND event_key = ?",
    [userId, `subscription-expiring:${reminderEnd}`]
  )).count, 1);

  const expiredAt = now - 1;
  await q.run("UPDATE subscriptions SET ends_at = ?, status = 'active' WHERE user_id = ?", [expiredAt, userId]);
  await runSubscriptionNotificationSweep(db, now);
  assert.equal((await q.get(
    "SELECT status FROM subscriptions WHERE user_id = ?", [userId]
  )).status, "expired");
  assert.equal((await q.get(
    "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND event_key = ?",
    [userId, `subscription-expired:${expiredAt}`]
  )).count, 1);

  await q.run(
    "UPDATE subscriptions SET starts_at = ?, ends_at = ?, status = 'active' WHERE user_id = ?",
    [now - 1000, now + 86400000, userId]
  );
  const admin = client();
  await admin("POST", "/api/auth/login", { email: "admin@test.com", password: "AdminPass123" });
  const original = JSON.parse((await q.get(
    "SELECT json FROM content WHERE kind = 'lesson' AND id = '1-1'"
  )).json);
  const updated = { ...original, title: `${original.title} — تحديث إشعار الاختبار` };
  assert.equal((await admin("PUT", "/api/admin/lessons/1-1", updated)).status, 200);
  const firstPublishCount = (await q.get(
    "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND event_key LIKE 'lesson-content:1-1:%'",
    [userId]
  )).count;
  assert.equal(firstPublishCount, 1);
  assert.equal((await admin("PUT", "/api/admin/lessons/1-1", updated)).status, 200);
  assert.equal((await q.get(
    "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND event_key LIKE 'lesson-content:1-1:%'",
    [userId]
  )).count, 1);
});
