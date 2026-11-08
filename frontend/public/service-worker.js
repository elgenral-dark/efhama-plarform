/* Service Worker — تخزين مؤقت: شبكة أولًا مع كاش احتياطي */
var CACHE = "efhama-v9";
/* الهيكل الثابت فقط. ملفات المحتوى (data/) تتطلب تسجيل الدخول فتُخزَّن عند أول طلب ناجح */
var CORE = [
  "login.html", "register.html", "offline.html",
  "css/styles.css", "css/login.css", "manifest.json",
  "assets/icons/icon-192.png", "assets/icons/icon-512.png",
  "css/register.css", "css/notifications.css", "js/auth.js", "js/ui.js", "js/data.js", "js/navigation.js", "js/notifications.js", "js/login.js", "js/payment-config.js", "js/register.js",
  "js/chapters.js", "js/chapter.js", "js/lesson.js",
  "js/quiz.js", "js/glossary.js", "js/search-page.js", "js/assistant.js"
];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    /* لا نُفشل التثبيت لو تعذّر ملف واحد */
    return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  /* لا نخزن صفحات أو بيانات مدفوعة؛ يجب أن يقرر الخادم صلاحية الاشتراك في كل طلب. */
  if (url.pathname.indexOf("/api/") === 0
    || url.pathname.indexOf("/data/") === 0
    || url.pathname.indexOf("/programming-paths/") === 0
    || (url.pathname.endsWith(".html") && !["/login.html", "/register.html", "/offline.html"].includes(url.pathname))
    || url.pathname === "/") return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      /* نخزّن الردود الناجحة فقط (لا 401 ولا تحويلات الدخول) */
      if (res.ok && !res.redirected) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      /* ignoreSearch: الروابط بمعاملات (?id=...) تطابق الملف المخبأ بدونها */
      return caches.match(e.request, { ignoreSearch: true })
        .then(function (hit) { return hit || caches.match("./offline.html"); });
    })
  );
});

self.addEventListener("message", function (e) {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});
