/* اختبارات الواجهة: الصفحات، الحارس، التمرير للباك اند، ترويسات Pyodide.
   تشغّل الباك اند داخل العملية (قاعدة SQLite في الذاكرة) ثم تختبر تطبيق الواجهة فوقه. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
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

after(() => {
  frontendServer?.close();
  backendServer?.close();
});

test("معاينة لوحة التحكم محصورة على المسؤولين", async () => {
  const result = await decide({
    path: "/dashboard/preview/site-preview.html",
    backendUrl: "http://backend.test",
    fetchImpl: async () => new Response(JSON.stringify({ user: { role: "student" } }), { status: 200 }),
  });
  assert.equal(result.action, "forbidden");
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
  assert.equal((await c("GET", "/")).headers.get("location"), "/explore/");
  assert.equal((await c("GET", "/login.html")).status, 200);
  assert.equal((await c("GET", "/register.html")).status, 200);
  for (const route of [
    "/explore/",
    "/explore/chapters.html",
    "/explore/paths.html",
    "/explore/projects.html",
  ]) {
    const page = await c("GET", route);
    assert.equal(page.status, 200, `${route} should be public`);
    assert.match(page.text, /class="brand" href="\/explore\/"[^>]*data-copy-aria="brandHome"/);
    assert.match(page.text, /<img\b(?=[^>]*\bclass="brand-logo")(?=[^>]*\bsrc="\/assets\/icons\/favicon\.svg")[^>]*>/);
  }
  const homePage = await c("GET", "/explore/");
  assert.match(homePage.text, /id="qrImageLink"/);
  assert.match(homePage.text, /id="qrCopyButton"/);
  assert.match(homePage.text, /id="qrShareButton"/);
  assert.match(homePage.text, /id="qrDownloadButton"/);
  assert.match(homePage.text, /src="\/site-config\.js"/);
  assert.equal((await c("GET", "/assets/icons/favicon.svg")).status, 200);
  const supportScript = await c("GET", "/js/whatsapp-support.js");
  assert.equal(supportScript.status, 200);
  assert.match(supportScript.text, /https:\/\/wa\.me\/201287288506/);
  assert.match(supportScript.text, /مرحباً، أحتاج إلى المساعدة بخصوص منصة افهمها بسهولة\./);
  assert.equal((await c("GET", "/css/whatsapp-support.css")).status, 200);
  assert.match((await c("GET", "/js/auth.js")).text, /whatsapp-support\.js/);
  for (const route of [
    "/explore/",
    "/explore/chapters.html",
    "/explore/paths.html",
    "/explore/projects.html",
    "/offline.html",
  ]) {
    assert.match((await c("GET", route)).text, /whatsapp-support\.js/, `${route} should load support`);
  }
  const qrLibrary = await c("GET", "/vendor/qrcode.js");
  assert.equal(qrLibrary.status, 200);
  assert.match(qrLibrary.text, /var qrcode = function/);
  assert.equal((await c("GET", "/site-config.js")).status, 200);
  assert.equal((await c("GET", "/explore/marketing.js")).status, 200);
  assert.equal((await c("GET", "/explore/marketing.css")).status, 200);
  assert.equal((await c("GET", "/lesson.html")).headers.get("location"), "/login.html");
  assert.equal((await c("GET", "/css/styles.css")).status, 200);
  assert.equal((await c("GET", "/data/curriculum.json")).status, 401);
  assert.equal((await c("GET", "/api/health")).status, 200);
});

test("المحتوى المدفوع للأدمن: الصفحة الرئيسية وصفحة الإدارة", async () => {
  const cookie = await loginAdmin();
  const c = client(cookie);
  const home = await c("GET", "/index.html");
  assert.equal(home.status, 200);
  assert.match(home.text, /<script src="js\/chapters\.js"><\/script>/);
  assert.doesNotMatch(home.text, /<script src="js\/app\.js"><\/script>/);
  const legacyAdminPage = await c("GET", "/admin-subscriptions.html");
  assert.equal(legacyAdminPage.status, 302);
  assert.equal(legacyAdminPage.headers.get("location"), "/admin-dashboard.html");
  const adminDashboard = await c("GET", "/admin-dashboard.html");
  assert.equal(adminDashboard.status, 200);
  assert.match(adminDashboard.text, /dashboard\/js\/pages-content\.js/);
  assert.match(adminDashboard.text, /dashboard\/js\/bridge\.js/);
  assert.equal((await c("GET", "/dashboard/js/pages-content.js")).status, 200);
  assert.equal((await c("GET", "/dashboard/js/bridge.js")).status, 200);
  assert.equal((await c("GET", "/dashboard/")).status, 404);
  assert.equal((await c("GET", "/dashboard/data/efhamha.db")).status, 404);
  const dashboardStats = await c("GET", "/api/admin/stats");
  assert.equal(dashboardStats.status, 200);
  assert.equal(typeof dashboardStats.json.students, "number");
  assert.equal(typeof dashboardStats.json.admins, "number");
  assert.equal(typeof dashboardStats.json.activeSubscriptions, "number");
  assert.equal(typeof dashboardStats.json.pendingRequests, "number");
  const notifications = await c("GET", "/notifications.html");
  assert.equal(notifications.status, 200);
  assert.match(notifications.text, /notificationFilters/);
  assert.match(notifications.text, /js\/notifications-page\.js/);
  assert.equal((await c("GET", "/js/notifications-page.js")).status, 200);
  assert.equal((await c("GET", "/data/curriculum.json")).status, 200);
  assert.equal((await c("GET", "/api/state")).status, 200);
  const announcement = await c("POST", "/api/notifications", {
    roles: ["admin"],
    title: "اختبار الربط",
    message: "تمرير الإشعار عبر واجهة الموقع.",
    category: "system"
  });
  assert.equal(announcement.status, 201);
  assert.equal(announcement.json.delivered, 1);
  assert.ok((await c("GET", "/api/notifications/unread-count")).json.unreadCount >= 1);
  assert.equal((await c("GET", "/api/notifications?category=system")).status, 200);
});

test("التصدير العام يضم أسئلة المحتوى المنشور دون مفاتيح الإجابة", () => {
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(frontendRoot, "public", "dashboard", "integration", "efhamha-data.js"), "utf8");
    vm.runInNewContext(source, { module, self: {} });
    const data = module.exports.publicView({
      paths: [{ id: "p1", visible: true }, { id: "hidden", visible: false }],
      modules: [{ id: "m1", pathId: "p1" }, { id: "mh", pathId: "hidden" }],
      lessons: [
        { id: "published", moduleId: "m1", status: "published", blocks: [{ type: "question", questionId: "lesson-q" }] },
        { id: "draft", moduleId: "m1", status: "draft", blocks: [{ type: "question", questionId: "draft-q" }] },
        { id: "hidden", moduleId: "mh", status: "published", blocks: [{ type: "question", questionId: "hidden-q" }] }
      ],
      questions: [
        { id: "lesson-q", type: "mcq", text: "Prompt", code: "", options: ["Option A", "Option B"], answer: 2, explanation: "Private explanation", hints: ["Private hint"], acceptedAnswers: ["secret"], internal: "private" },
        { id: "quiz-q", type: "tf", text: "Quiz prompt", options: [], answer: true, explanation: "Quiz answer" },
        { id: "draft-q", type: "mcq", text: "Draft prompt", options: ["A", "B"], answer: 1 },
        { id: "hidden-q", type: "mcq", text: "Hidden prompt", options: ["A", "B"], answer: 1 },
        { id: "unused-q", type: "mcq", text: "Unused prompt", options: ["A", "B"], answer: 1 }
      ],
      quizzes: [
        { id: "published-quiz", status: "published", questionIds: ["quiz-q"] },
        { id: "draft-quiz", status: "draft", questionIds: ["draft-quiz-q"] }
      ]
    });
    assert.deepEqual(Array.from(data.questions, (q) => q.id), ["lesson-q", "quiz-q"]);
    const lessonQuestion = data.questions[0];
    assert.equal(lessonQuestion.text, "Prompt");
    assert.deepEqual(Array.from(lessonQuestion.options), ["Option A", "Option B"]);
    for (const key of ["answer", "explanation", "hints", "acceptedAnswers", "internal"])
      assert.equal(Object.hasOwn(lessonQuestion, key), false, `${key} must not appear in public question data`);
    assert.match(module.exports.renderLesson(data, data.lessons[0]), /Prompt/);
    assert.match(module.exports.renderLesson(data, data.lessons[0]), /Option A/);
    assert.doesNotMatch(module.exports.renderLesson(data, data.lessons[0]), /Private explanation|Private hint/);
  });

test("قاموس المصطلحات يحمّل الدروس بالتوازي ويعرض ما نجح تحميله", async () => {
    const elements = {
      glossaryGrid: { innerHTML: "", children: [], appendChild(child) { this.children.push(child); } },
      glossarySearch: { value: "", addEventListener() {} },
      glossaryChapter: { value: "", addEventListener() {} },
      glossaryCount: { textContent: "" }
    };
    const requests = [];
    const context = {
      document: {
        getElementById(id) { return elements[id]; },
        createElement() { return { className: "", innerHTML: "" }; }
      },
      location: { search: "" },
      URLSearchParams,
      loadData: () => Promise.resolve({ chapters: [{ id: 1, lessons: [
        { id: "1-1", title: "First" }, { id: "1-2", title: "Second" }
      ] }] }),
      loadLesson(id) {
        requests.push(id);
        return id === "1-1"
          ? Promise.reject(new Error("unavailable"))
          : Promise.resolve({ terms: [{ id: "term", term: "Available", definition: "Definition" }] });
      }
    };
    vm.runInNewContext(fs.readFileSync(path.join(frontendRoot, "public", "js", "glossary.js"), "utf8"), context);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(requests, ["1-1", "1-2"]);
    assert.equal(elements.glossaryCount.textContent, "1 مصطلحًا");
    assert.equal(elements.glossaryGrid.children.length, 1);
    assert.match(elements.glossaryGrid.children[0].innerHTML, /Available/);
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
  assert.match(runner.text, /whatsapp-support\.js/);
  const csp = runner.headers.get("content-security-policy");
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /style-src 'self'/);
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
  assert.equal((await c("GET", "/notifications.html")).headers.get("location"), "/login.html");
});

test("الواجهة لا تنشئ هوية وهمية وتغلق الصفحات المحمية عند غياب الباك اند", async () => {
  const app = createFrontendApp({
    publicDir: path.join(frontendRoot, "public"),
    pyodideDir: path.join(frontendRoot, "node_modules", "pyodide"),
  });
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const api = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(api.status, 503);
    assert.equal((await api.json()).error, "backend_unavailable");
    assert.equal((await fetch(`${baseUrl}/index.html`)).status, 503);
    assert.equal((await fetch(`${baseUrl}/`, { redirect: "manual" })).headers.get("location"), "/explore/");
    assert.equal((await fetch(`${baseUrl}/explore/chapters.html`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/login.html`)).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
