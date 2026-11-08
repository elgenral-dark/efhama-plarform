/* مكونات مشتركة: حارس الدخول، البحث العام بالاقتراحات، زر الخروج، حالة الاتصال */
(function () {
  "use strict";

  /* ---- حارس الدخول (الصفحات العامة المفتوحة للجميع دون تسجيل) ---- */
  var pageName = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var publicPages = [
    "",
    "index.html",
    "chapters.html",
    "glossary.html",
    "login.html",
    "register.html",
    "offline.html"
  ];
  var isPublicPage = publicPages.indexOf(pageName) > -1;

  if (typeof Auth !== "undefined" && !isPublicPage) {
    Auth.check().then(function (user) {
      if (!user) {
        var target = encodeURIComponent(pageName + location.search);
        window.location.replace("login.html?next=" + target);
      }
    }).catch(function (error) {
      console.error("Unable to verify the current account:", error);
    });
  }

  /* تهريب HTML + إبراز الكلمات المطابقة */
  window.__esc = function (s) {
    return (s || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };
  window.__hl = function (s, words) {
    var out = window.__esc(s);
    (words || []).forEach(function (w) {
      if (!w) return;
      var safe = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      try { out = out.replace(new RegExp("(" + safe + ")", "gi"), "<mark>$1</mark>"); } catch (e) {}
    });
    return out;
  };

  /* ---------- مؤثرات صوتية خفيفة (Web Audio — بدون ملفات) ---------- */
  window.Sound = {
    ctx: null,
    tone: function (freq, dur, type, vol, delay) {
      if (localStorage.getItem("efhama_sound") === "off") return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        var ctx = this.ctx || (this.ctx = new AC());
        if (ctx.state === "suspended") ctx.resume();
        var t0 = ctx.currentTime + (delay || 0);
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type || "sine";
        o.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(vol || 0.1, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0); o.stop(t0 + dur);
      } catch (e) {}
    },
    correct: function () { this.tone(660, 0.12, "sine", 0.1); this.tone(880, 0.16, "sine", 0.09, 0.09); },
    wrong: function () { this.tone(220, 0.2, "triangle", 0.07); }
  };

  var SPK_ON = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
  var SPK_OFF = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  function applySoundBtn(b) {
    var off = localStorage.getItem("efhama_sound") === "off";
    b.innerHTML = off ? SPK_OFF : SPK_ON;
    b.classList.toggle("muted", off);
    b.setAttribute("aria-label", off ? "تشغيل الأصوات" : "كتم الأصوات");
    b.title = off ? "تشغيل الأصوات" : "كتم الأصوات";
  }

  function norm(s) {
    return (s || "").toString().toLowerCase()
      .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/[ً-ْ]/g, "").trim();
  }

  /* ---- تحديث حالة زر الهيدر (دخول / خروج) ---- */
  function mountHeader(user) {
    var btn = document.querySelector(".btn-start");
    if (!btn || typeof Auth === "undefined") return;
    if (user) {
      btn.textContent = "خروج";
      btn.href = "#";
      btn.title = "تسجيل الخروج من الحساب";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        Auth.logout();
      });
    } else {
      btn.textContent = "دخول";
      btn.href = "login.html";
      btn.title = "تسجيل الدخول إلى حسابك";
    }
  }
  Auth.check().then(mountHeader).catch(function (error) {
    console.error("Unable to load the account for the header:", error);
    mountHeader(null);
  });

  /* ---- البحث العام مع اقتراحات ---- */
  var INDEX_CACHE = null;
  function loadIndex() {
    if (INDEX_CACHE) return Promise.resolve(INDEX_CACHE);
    return fetch("data/search-index.json")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) { INDEX_CACHE = d; return d; });
  }

  function bindGlobalSearch() {
    var input = document.getElementById("globalSearch");
    var results = document.getElementById("globalSearchResults");
    var t;

    function go(url) { window.location.href = url; }

    input.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var q = norm(input.value);
        if (q.length < 2) { results.hidden = true; return; }
        loadIndex().then(function (idx) {
          var words = q.split(/\s+/);
          var hits = { lessons: [], terms: [], questions: [] };
          idx.lessons.forEach(function (l) {
            var hay = norm(l.title + " " + l.desc + " " + l.headings.join(" "));
            var score = words.reduce(function (n, w) { return n + (hay.indexOf(w) > -1 ? 1 : 0); }, 0);
            if (score) hits.lessons.push({ title: l.title, sub: "درس " + l.id, url: "lesson.html?id=" + l.id, score: score });
          });
          idx.terms.forEach(function (tm) {
            var hay = norm(tm.term + " " + tm.definition);
            var score = words.reduce(function (n, w) { return n + (hay.indexOf(w) > -1 ? 1 : 0); }, 0);
            if (score) hits.terms.push({ title: tm.term, sub: "مصطلح — درس " + tm.lesson, url: "glossary.html?lesson=" + tm.lesson, score: score });
          });
          idx.questions.forEach(function (qs) {
            var hay = norm(qs.q);
            var score = words.reduce(function (n, w) { return n + (hay.indexOf(w) > -1 ? 1 : 0); }, 0);
            if (score) hits.questions.push({ title: qs.q, sub: "سؤال — درس " + qs.lesson, url: "lesson.html?id=" + qs.lesson, score: score });
          });
          var all = hits.lessons.concat(hits.terms, hits.questions)
            .sort(function (a, b) { return b.score - a.score; }).slice(0, 6);
          if (!all.length) {
            results.innerHTML = '<div class="gs-item muted">لا نتائج — جرّب البحث المتقدم في <a href="search.html">صفحة البحث</a></div>';
          } else {
            results.innerHTML = all.map(function (r) {
              return '<a class="gs-item" href="' + r.url + '"><span class="gs-title">' + window.__hl(r.title, words) + '</span><span class="gs-sub">' + window.__esc(r.sub) + "</span></a>";
            }).join("");
          }
          results.hidden = false;
        });
      }, 180);
    });

    document.addEventListener("click", function (e) {
      if (!e.target.closest(".gsearch")) results.hidden = true;
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); go("search.html?q=" + encodeURIComponent(input.value)); }
    });
  }

  /* ---- مؤشر حالة الاتصال ---- */
  function mountOnlineIndicator() {
    var dot = document.createElement("div");
    dot.className = "net-indicator";
    dot.id = "netIndicator";
    function update() {
      var on = navigator.onLine;
      dot.classList.toggle("offline", !on);
      dot.textContent = on ? "متصل" : "غير متصل — الوضع دون إنترنت";
      dot.style.display = on ? "none" : "block";
    }
    document.body.appendChild(dot);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { mountHeader(); mountOnlineIndicator(); });
  } else {
    mountHeader(); mountOnlineIndicator();
  }
})();

/* تسجيل Service Worker (PWA) + تنبيه عند توفر تحديث */
function showUpdateBanner() {
  if (document.getElementById("updateBanner")) return;
  var b = document.createElement("div");
  b.id = "updateBanner";
  b.setAttribute("role", "status");
  b.innerHTML = "<span>تحديث جديد متاح للمنصة.</span>" +
    '<button type="button" id="updateNow">تحديث الآن</button>';
  document.body.appendChild(b);
  document.getElementById("updateNow").addEventListener("click", function () {
    var reg = showUpdateBanner._reg;
    if (reg && reg.waiting) { reg.waiting.postMessage("SKIP_WAITING"); }
    else { location.reload(); }
  });
}
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("service-worker.js").then(function (reg) {
      showUpdateBanner._reg = reg;
      reg.addEventListener("updatefound", function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", function () {
          if (nw.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner();
        });
      });
    }).catch(function () {});
    /* تحديث التبويب فور تولي عامل جديد السيطرة */
    var refreshed = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (refreshed) return;
      refreshed = true;
      location.reload();
    });
  });
}

/* تذييل موحد مع الدعاء — يظهر في كل الصفحات */
(function () {
  function mount() {
    var f = document.querySelector(".site-footer .container");
    if (!f || document.getElementById("duaLine")) return;
    var d = document.createElement("div");
    d.id = "duaLine";
    d.innerHTML = '<p class="dua">اللهم انفع بهذا العمل، واجعله علمًا يُنتفع به، واغفر ليوسف ولوالديه.</p>' +
      '<p class="rights">© افهمها | efhamha — جميع الحقوق محفوظة</p>';
    f.appendChild(d);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();

/* ================= الوضع الليلي / النهاري الموحد لكافة الصفحات ================= */
(function () {
  function initTheme() {
    var themeKey = "efhama_theme";
    function applyTheme(t) {
      document.documentElement.setAttribute("data-theme", t);
      if (document.body) {
        document.body.setAttribute("data-theme", t);
        document.body.dataset.theme = t;
      }
      var iconMoon = document.querySelector("#themeToggle .icon-moon, .theme-toggle .icon-moon");
      var iconSun = document.querySelector("#themeToggle .icon-sun, .theme-toggle .icon-sun");
      if (iconMoon) iconMoon.classList.toggle("hidden", t === "dark");
      if (iconSun) iconSun.classList.toggle("hidden", t !== "dark");
    }
    window.applySiteTheme = applyTheme;
    var current = localStorage.getItem(themeKey) ||
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(current);

    var themeToggle = document.getElementById("themeToggle") || document.querySelector(".theme-toggle, [data-theme-toggle]");
    if (themeToggle && !themeToggle._themeBound) {
      themeToggle._themeBound = true;
      themeToggle.addEventListener("click", function (e) {
        e.preventDefault();
        var curr = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
        var next = curr === "dark" ? "light" : "dark";
        localStorage.setItem(themeKey, next);
        applyTheme(next);
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initTheme);
  else initTheme();
})();
