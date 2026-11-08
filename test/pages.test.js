/* اختبارات الواجهة: الصفحات، الحارس، التمرير للباك اند، ترويسات Pyodide.
   تشغّل الباك اند داخل العملية (قاعدة SQLite في الذاكرة) ثم تختبر تطبيق الواجهة فوقه. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, "..");
const backendRoot = path.resolve(frontendRoot, "..", "backend");
const require = createRequire(import.meta.url);

process.env.JWT_SECRET = "frontend-test-secret";
process.env.ADMIN_EMAIL = "admin@test.com";
process.env.ADMIN_PASSWORD = "AdminPass123";
process.env.AUTH_RATE_LIMIT = "1000";
process.env.TRUST_PROXY = "true"; // الواجهة تمرّر الطلبات كما يحدث على Render خلف Vercel

const { createFrontendApp } = await import("../lib/app.js");
const { decide } = await import("../lib/guard.js");

let backendServer, frontendServer, base;

before(async () => {
  const { openDatabase } = require(path.join(backendRoot, "src/database.js"));
  const { createApp } = require(path.join(backendRoot, "src/index.js"));
  const { seedContent, ensureAdmin } = require(path.join(backendRoot, "src/seed.js"));
  const db = await openDatabase({ sqliteFile: ":memory:", databaseUrl: "" });
  await seedContent(db, { log: () => {} });
  await ensureAdmin(db, { log: () => {} });

  backendServer = createApp(db).listen(0);
  const backendUrl = `http://127.0.0.1:${backendServer.address().port}`;
  const app = createFrontendApp({
    backendUrl,
    publicDir: path.join(frontendRoot, "public"),
    pyodideDir: path.join(frontendRoot, "node_modules", "pyodide"),
  });
  frontendServer = app.listen(0);
  base = `http://127.0.0.1:${frontendServer.address().port}`;
});

after(async () => {
  for (const server of [frontendServer, backendServer]) {
    if (!server) continue;
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  await require(path.join(backendRoot, "src/passwords.js")).close();
});

/* عميل بسيط يحتفظ بالكوكي ولا يتبع التحويلات تلقائيًا */
function client(cookie = "") {
  return async (method, url, body) => {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(base + url, {
      method, headers, redirect: "manual",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* ليس JSON */ }
    return { status: response.status, headers: response.headers, text, json };
  };
}

/* الحساب له جلسة واحدة نشطة، فنسجّل الدخول مرة واحدة ونعيد استخدام الكوكي */
let adminCookie = "";
async function loginAdmin() {
  if (adminCookie) return adminCookie;
  const response = await client()("POST", "/api/auth/login", { email: "admin@test.com", password: "AdminPass123" });
  assert.equal(response.status, 200);
  adminCookie = response.headers.get("set-cookie").split(";")[0];
  return adminCookie;
}

test("الصفحات المدفوعة تحوّل للدخول والصفحات العامة متاحة", async () => {
  const c = client();
  assert.equal((await c("GET", "/index.html")).headers.get("location"), "/login.html");
  assert.equal((await c("GET", "/")).headers.get("location"), "/register.html");
  assert.equal((await c("GET", "/login.html")).status, 200);
  assert.equal((await c("GET", "/register.html")).status, 200);
  assert.equal((await c("GET", "/notifications.html")).headers.get("location"), "/login.html");
  assert.equal((await c("GET", "/css/styles.css")).status, 200);
  assert.equal((await c("GET", "/data/curriculum.json")).status, 401);
  assert.equal((await c("GET", "/api/health")).status, 200);
});

test("سجل الإشعارات متاح للحساب المسجل حتى بعد انتهاء الاشتراك", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    user: { id: 8, role: "student", subscriptionStatus: "expired" }
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const notifications = await decide({ path: "/notifications.html", backendUrl: "http://backend.test" });
    const course = await decide({ path: "/index.html", backendUrl: "http://backend.test" });
    assert.deepEqual(notifications, { action: "next" });
    assert.deepEqual(course, { action: "redirect", location: "/register.html?subscription=required" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("المحتوى المدفوع للأدمن: الصفحة الرئيسية وصفحة الإدارة", async () => {
  const cookie = await loginAdmin();
  const c = client(cookie);
  const home = await c("GET", "/index.html");
  assert.equal(home.status, 200);
  assert.match(home.text, /<script src="js\/chapters\.js"><\/script>/);
  assert.doesNotMatch(home.text, /<script src="js\/app\.js"><\/script>/);
  assert.equal((await c("GET", "/admin-subscriptions.html")).status, 200);
  const notifications = await c("GET", "/notifications.html");
  assert.equal(notifications.status, 200);
  assert.match(notifications.text, /notificationsList/);
  assert.match(notifications.text, /markAllNotificationsRead/);
  assert.equal((await c("GET", "/js/notifications.js")).status, 200);
  assert.equal((await c("GET", "/css/notifications.css")).status, 200);
  assert.equal((await c("GET", "/data/curriculum.json")).status, 200);
  assert.equal((await c("GET", "/api/state")).status, 200);
});

test("صفحات البرمجة تحتاج اشتراكًا: بدون دخول 401 JSON", async () => {
  const anon = await client()("GET", "/programming-paths/app.js");
  assert.equal(anon.status, 401);
  assert.equal(anon.json.error, "unauthorized");
  const cookie = await loginAdmin();
  assert.equal((await client(cookie)("GET", "/programming-paths/app.js")).status, 200);
});

test("صفحة Python تعمل بسياسة عزل محددة، وملفات Pyodide متاحة بالترويسات الصحيحة", async () => {
  const cookie = await loginAdmin();
  const c = client(cookie);
  const runner = await c("GET", "/programming-paths/python-runner.html");
  assert.equal(runner.status, 200);
  const csp = runner.headers.get("content-security-policy");
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.equal(runner.headers.get("cross-origin-resource-policy"), "cross-origin");

  const pyodide = await c("GET", "/vendor/pyodide/v314.0.7/pyodide.js");
  assert.equal(pyodide.status, 200);
  assert.equal(pyodide.headers.get("access-control-allow-origin"), "*");
  assert.equal(pyodide.headers.get("cross-origin-resource-policy"), "cross-origin");
});

test("تسجيل الدخول والخروج يمرّان عبر الواجهة بنفس الكوكي", async () => {
  const cookie = await loginAdmin();
  const c = client(cookie);
  assert.equal((await c("GET", "/api/auth/me")).json.user.role, "admin");
  await c("POST", "/api/auth/logout");
  assert.equal((await c("GET", "/api/auth/me")).status, 401);
  assert.equal((await c("GET", "/index.html")).headers.get("location"), "/login.html");
});

test("الواجهة لا تنشئ هوية وهمية عند غياب الباك اند", async () => {
  const app = createFrontendApp({ publicDir: path.join(frontendRoot, "public") });
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const api = await fetch(`${baseUrl}/api/auth/me`);
    const page = await fetch(`${baseUrl}/`);
    assert.equal(api.status, 503);
    assert.equal(page.status, 503);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
