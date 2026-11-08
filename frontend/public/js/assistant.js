/* المساعد التعليمي — محرك محلي: فهرس البحث + أسئلة شائعة. لا يخترع إجابات. */
(function () {
  "use strict";

  function norm(s) {
    return (s || "").toString().toLowerCase()
      .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/[ً-ْ]/g, "").trim();
  }

  var FAQ = [
    {"q": "كيف أبدأ التعلم؟", "a": "ابدأ من صفحة الفصول، افتح الفصل الأول وابدأ أول درس، واقرأ الأقسام بالترتيب ثم اختبر نفسك في نهاية الدرس."},
    {"q": "كيف يُحفظ تقدمي؟", "a": "تقدمك يُحفظ تلقائيًا في متصفحك على هذا الجهاز فقط (الدروس المكتملة، نتائج الاختبارات وأفضل نتيجة)."},
    {"q": "ما الفرق بين الاختبار الثابت والتدريب العشوائي؟", "a": "الاختبار الثابت يسأل عن درس محدد أو فصل محدد، أما التدريب العشوائي فيختار أسئلة متنوعة من كل الدروس."},
    {"q": "كيف أعمل الاختبارات؟", "a": "من صفحة الاختبارات اختر: اختبار درس محدد، أو اختبار الفصل الشامل، أو تدريب عشوائي. تظهر النتيجة فورًا مع شرح كل إجابة."},
    {"q": "هل يعمل الموقع بدون إنترنت؟", "a": "بعد زيارة الصفحات أول مرة باتصال، تُخزَّن في ذاكرة المتصفح ويمكن فتحها لاحقًا دون اتصال (PWA)."},
    {"q": "أين أجد معجم المصطلحات؟", "a": "من رابط «القاموس» في الأعلى — تجد كل مصطلحات المنهج مع تعريفها ورابط الدرس."},
    {"q": "ما رمز الخطأ 404؟", "a": "يعني أن المورد المطلوب غير موجود بالعنوان المحدد — راجع الدرس 3-2 (طرق الاتصال في تطبيقات الويب).", "lesson": "3-2"},
    {"q": "ما الفرق بين التشفير المتماثل وبالمفتاح العام؟", "a": "المتماثل يستخدم نفس المفتاح للتشفير وفك التشفير وسريع، والمفتاح العام يستخدم زوجًا: عام وخاص — راجع الدرس 2-1.", "lesson": "2-1"}
  ];

  var box = document.getElementById("answerBox");
  var list = document.getElementById("faqList");
  var input = document.getElementById("askInput");

  FAQ.forEach(function (f) {
    var d = document.createElement("details");
    d.className = "faq-item";
    d.innerHTML = "<summary>" + f.q + '</summary><div class="faq-answer">' + f.a +
      (f.lesson ? ' <a href="lesson.html?id=' + f.lesson + '">افتح الدرس</a>' : "") + "</div>";
    list.appendChild(d);
  });

  var SUGGESTIONS = ["كيف أبدأ التعلم؟", "كيف يُحفظ تقدمي؟", "ما الفرق بين الاختبار الثابت والتدريب العشوائي؟", "ما رمز الخطأ 404؟"];
  document.getElementById("suggestRow").innerHTML = SUGGESTIONS.map(function (s) {
    return '<button class="filter-chip">' + s + "</button>";
  }).join("");
  document.querySelectorAll("#suggestRow .filter-chip").forEach(function (b) {
    b.addEventListener("click", function () { input.value = b.textContent; ask(); });
  });

  var INDEX = null;
  function loadIndex() {
    if (INDEX) return Promise.resolve(INDEX);
    return fetch("data/search-index.json").then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (d) { INDEX = d; return d; });
  }

  function bestMatch(q) {
    var nq = norm(q), words = nq.split(/\s+/).filter(function (w) { return w.length > 1; });
    var faqBest = null, faqScore = 0;
    FAQ.forEach(function (f) {
      var hay = norm(f.q + " " + f.a);
      var s = words.reduce(function (n, w) { return n + (hay.indexOf(w) > -1 ? 1 : 0); }, 0);
      if (s > faqScore) { faqScore = s; faqBest = f; }
    });
    if (faqBest && faqScore >= Math.min(2, words.length)) {
      return Promise.resolve({
        type: "faq",
        html: "<p><strong>" + faqBest.q + "</strong></p><p>" + faqBest.a + "</p>" +
              (faqBest.lesson ? ' <a class="btn btn-sm" href="lesson.html?id=' + faqBest.lesson + '">افتح الدرس المرتبط</a>' : "")
      });
    }
    return loadIndex().then(function (idx) {
      var hits = [];
      idx.lessons.forEach(function (l) {
        var hay = norm(l.title + " " + l.desc + " " + l.headings.join(" "));
        var s = words.reduce(function (n, w) { return n + (hay.indexOf(w) > -1 ? 1 : 0); }, 0);
        if (s) hits.push({ kind: "lesson", item: l, score: s });
      });
      idx.terms.forEach(function (t) {
        var hay = norm(t.term + " " + t.definition);
        var s = words.reduce(function (n, w) { return n + (hay.indexOf(w) > -1 ? 1 : 0); }, 0);
        if (s) hits.push({ kind: "term", item: t, score: s + 0.5 });
      });
      if (!hits.length) return { type: "none" };
      hits.sort(function (a, b) { return b.score - a.score; });
      var top = hits.slice(0, 3);
      var html = "<p>وجدت ما قد يفيدك:</p><ul style='padding-inline-start:1.2rem'>";
      top.forEach(function (h) {
        if (h.kind === "lesson") {
          html += '<li><a href="lesson.html?id=' + h.item.id + '">' + h.item.title + '</a> <span class="muted small">(درس ' + h.item.id + ")</span></li>";
        } else {
          html += "<li><strong>" + h.item.term + "</strong>: " + h.item.definition.slice(0, 100) +
                  '… <a href="lesson.html?id=' + h.item.lesson + '">الدرس</a></li>';
        }
      });
      html += "</ul>";
      return { type: "hits", html: html };
    }).catch(function () { return { type: "none" }; });
  }

  function ask() {
    var q = input.value.trim();
    if (!q) { box.innerHTML = ""; return; }
    box.innerHTML = '<p class="muted">جارٍ البحث في قاعدة المعرفة المحلية…</p>';
    bestMatch(q).then(function (res) {
      if (res.type === "none") {
        box.innerHTML = '<div class="callout callout-warning"><div class="callout-title">لم أجد إجابة</div>' +
          '<div class="callout-body">لم أجد إجابة في قاعدة المعرفة المحلية. جرّب <a href="search.html">البحث الشامل</a> أو تصفح <a href="chapters.html">الفصول</a>.' +
          '<p class="muted small" style="margin-top:.4rem">أنا مساعد محلي يعتمد على محتوى المنصة فقط — لست نموذج ذكاء اصطناعي متصلًا بخارج، فلن أخترع إجابة.</p></div></div>';
      } else {
        box.innerHTML = '<div class="callout callout-info"><div class="callout-title">إجابة المساعد</div><div class="callout-body">' + res.html + "</div></div>";
      }
    });
  }

  document.getElementById("askBtn").addEventListener("click", ask);
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") ask(); });
})();
