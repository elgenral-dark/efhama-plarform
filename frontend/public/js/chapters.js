/* منطق صفحة الفصول — نفس مفاتيح التخزين المستخدمة في الصفحة الرئيسية */
(function () {
  "use strict";

  var CHECK_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  var CHEVRON_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var ARROW_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>';

  /* الوضع الليلي/النهاري موحد ويُدار مركزيًا من ui.js / navigation.js */

  /* ================= قائمة الموبايل ================= */
  var navToggle = document.getElementById("navToggle");
  var mainNav = document.getElementById("mainNav");
  if (navToggle && mainNav) {
    navToggle.addEventListener("click", function () {
      var open = mainNav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(open));
    });
    mainNav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        mainNav.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ================= تقدم الطالب (نفس مفتاح الرئيسية) ================= */
  var progressKey = "efhama_completed";
  function getCompleted() {
    try { return JSON.parse(localStorage.getItem(progressKey)) || []; }
    catch (e) { return []; }
  }
  function setCompleted(list) { localStorage.setItem(progressKey, JSON.stringify(list)); }
  function isDone(id) { return getCompleted().indexOf(id) > -1; }
  function toggleLesson(id) {
    var list = getCompleted();
    var i = list.indexOf(id);
    if (i > -1) list.splice(i, 1); else list.push(id);
    setCompleted(list);
  }

  /* ================= أدوات مساعدة ================= */
  function norm(s) {
    return (s || "").toString().toLowerCase()
      .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function chapterProgress(ch) {
    var done = ch.lessons.filter(function (l) { return isDone(l.id); }).length;
    return { done: done, pct: Math.round(done / ch.lessons.length * 100) };
  }
  function stateBadge(pct) {
    if (pct === 100) return '<span class="chapter-state done">مكتمل ' + CHECK_SVG + "</span>";
    if (pct > 0) return '<span class="chapter-state doing">قيد الدراسة</span>';
    return '<span class="chapter-state">لم يبدأ</span>';
  }

  /* ================= شريط الملخص العلوي ================= */
  function renderSummary() {
    var started = 0, done = 0;
    CHAPTERS.forEach(function (ch) {
      var p = chapterProgress(ch);
      if (p.done > 0) started++;
      done += p.done;
    });
    var pct = TOTAL_LESSONS ? Math.round(done / TOTAL_LESSONS * 100) : 0;
    var setText = function (id, value) {
      var node = document.getElementById(id);
      if (node) node.textContent = value;
    };
    setText("sumChapters", started);
    setText("sumDone", done);
    setText("sumPct", pct + "%");
    setText("overallPct", pct + "%");
    setText("statDone", done);
    setText("statRemaining", Math.max(0, TOTAL_LESSONS - done));

    var ring = document.getElementById("ringVal");
    if (ring) {
      var circumference = 2 * Math.PI * 62;
      ring.style.strokeDasharray = circumference;
      ring.style.strokeDashoffset = circumference * (1 - pct / 100);
      ring.setAttribute("aria-label", "نسبة التقدم الكلية: " + pct + "%");
    }

    var progressChapters = document.getElementById("progressChapters");
    if (progressChapters) {
      progressChapters.replaceChildren();
      CHAPTERS.forEach(function (ch) {
        var progress = chapterProgress(ch);
        var row = document.createElement("div");
        row.className = "pch-row";
        var title = document.createElement("a");
        title.href = "chapter.html?id=" + encodeURIComponent(ch.id);
        title.textContent = ch.title;
        var track = document.createElement("div");
        track.className = "progress-bar";
        var fill = document.createElement("span");
        fill.style.width = progress.pct + "%";
        track.appendChild(fill);
        var percent = document.createElement("b");
        percent.textContent = progress.pct + "%";
        row.append(title, track, percent);
        progressChapters.appendChild(row);

        var badge = document.getElementById("badge-" + ch.id);
        if (badge) {
          badge.classList.toggle("locked", progress.pct < 100);
          badge.classList.toggle("earned", progress.pct === 100);
          badge.setAttribute("aria-label", ch.title + (progress.pct === 100 ? " — مكتمل" : " — لم يكتمل"));
        }
      });
    }

    var continueBox = document.getElementById("continueBox");
    if (continueBox) {
      var next = null;
      for (var chapterIndex = 0; chapterIndex < CHAPTERS.length && !next; chapterIndex++) {
        var chapter = CHAPTERS[chapterIndex];
        var lesson = chapter.lessons.find(function (item) { return !isDone(item.id); });
        if (lesson) next = { chapter: chapter, lesson: lesson };
      }
      continueBox.replaceChildren();
      if (next) {
        var icon = document.createElement("span");
        icon.className = "cb-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "▶";
        var info = document.createElement("span");
        info.className = "cb-info";
        var heading = document.createElement("strong");
        heading.textContent = "خطوتك التعليمية التالية";
        var description = document.createElement("span");
        description.textContent = next.chapter.title + " · " + next.lesson.title;
        info.append(heading, description);
        var link = document.createElement("a");
        link.className = "btn";
        link.href = "lesson.html?id=" + encodeURIComponent(next.lesson.id);
        link.textContent = "ابدأ الدرس";
        continueBox.append(icon, info, link);
        continueBox.hidden = false;
      } else {
        continueBox.hidden = true;
      }
    }
  }

  /* ================= بطاقات الفصول ================= */
  var grid = document.getElementById("chaptersGrid");
  function renderCards(filter) {
    var q = norm(filter || "");
    var visible = 0;
    grid.innerHTML = "";
    CHAPTERS.forEach(function (ch) {
      var matchedLessons = ch.lessons.filter(function (l) { return !q || norm(l.title).indexOf(q) > -1; });
      var chapterMatches = !q || norm(ch.title + " " + ch.desc).indexOf(q) > -1;
      if (!chapterMatches && matchedLessons.length === 0) return;
      visible++;
      var p = chapterProgress(ch);
      var card = document.createElement("article");
      card.className = "chapter-card";
      card.innerHTML =
        '<div class="card-top"><div class="chapter-num">' + escapeHtml(ch.id) + "</div>" + stateBadge(p.pct) + "</div>" +
        "<h3>" + escapeHtml(ch.title) + "</h3><p>" + escapeHtml(ch.desc) + "</p>" +
        '<div class="card-meta"><span class="lessons-count">' + ch.lessons.length + ' دروس</span>' +
        '<span class="card-progress-label">' + p.pct + "%</span></div>" +
        '<div class="progress-bar"><span style="width:' + p.pct + '%"></span></div>' +
        '<div class="done-line">' + CHECK_SVG + "<b>" + p.done + "</b> من " + ch.lessons.length + " دروس مكتملة</div>" +
        '<button class="card-toggle" aria-expanded="false"><span>عرض الدروس</span>' + CHEVRON_SVG + "</button>" +
        '<ul class="lesson-list">' +
        matchedLessons.map(function (l) {
          var done = isDone(l.id);
          return '<li class="lesson-item ' + (done ? "completed" : "") + '" data-lesson="' + escapeHtml(l.id) + '">' +
            '<button type="button" class="lesson-check" aria-label="تعليم درس ' + escapeHtml(l.title) + ' كمكتمل" title="' + (done ? "إلغاء الإكمال" : "تعليم كمكتمل") + '">' + CHECK_SVG + "</button>" +
            '<a class="lesson-title" href="lesson.html?id=' + encodeURIComponent(l.id) + '">' + escapeHtml(l.title) + "</a>" +
            '<span class="lesson-id">' + escapeHtml(l.id) + "</span></li>";
        }).join("") + "</ul>" +
        '<a class="go-chapter" href="chapter.html?id=' + encodeURIComponent(ch.id) + '">فتح صفحة الفصل ' + ARROW_SVG + "</a>";
      grid.appendChild(card);

      var toggleBtn = card.querySelector(".card-toggle");
      var list = card.querySelector(".lesson-list");
      toggleBtn.addEventListener("click", function () {
        var isOpen = list.classList.contains("open");
        
        // إغلاق أي كارت مفتوح آخر لمنع تداخل القوائم وللحفاظ على التنسيق النظيف
        grid.querySelectorAll(".chapter-card").forEach(function (otherCard) {
          if (otherCard !== card) {
            var otherList = otherCard.querySelector(".lesson-list");
            var otherBtn = otherCard.querySelector(".card-toggle");
            if (otherList && otherList.classList.contains("open")) {
              otherList.classList.remove("open");
              if (otherBtn) {
                otherBtn.setAttribute("aria-expanded", "false");
                var s = otherBtn.querySelector("span");
                if (s) s.textContent = "عرض الدروس";
              }
            }
          }
        });

        var open = !isOpen;
        list.classList.toggle("open", open);
        toggleBtn.setAttribute("aria-expanded", String(open));
        toggleBtn.querySelector("span").textContent = open ? "إخفاء الدروس" : "عرض الدروس";
      });

      card.querySelectorAll(".lesson-item").forEach(function (item) {
        var lessonId = item.dataset.lesson;
        var checkBtn = item.querySelector(".lesson-check");
        if (checkBtn) {
          checkBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleLesson(lessonId);
            var done = isDone(lessonId);
            item.classList.toggle("completed", done);
            checkBtn.setAttribute("title", done ? "إلغاء الإكمال" : "تعليم كمكتمل");

            // تحديث بطاقة الفصل ونسبة الإنجاز فورياً دون إغلاق القائمة
            var p = chapterProgress(ch);
            var topState = card.querySelector(".card-top .chapter-state");
            if (topState) topState.outerHTML = stateBadge(p.pct);
            var progLabel = card.querySelector(".card-progress-label");
            if (progLabel) progLabel.textContent = p.pct + "%";
            var barSpan = card.querySelector(".progress-bar > span");
            if (barSpan) barSpan.style.width = p.pct + "%";
            var doneLine = card.querySelector(".done-line");
            if (doneLine) doneLine.innerHTML = CHECK_SVG + "<b>" + p.done + "</b> من " + ch.lessons.length + " دروس مكتملة";

            renderSummary();
          });
        }
      });
    });
    document.getElementById("noResults").classList.toggle("hidden", visible > 0);
    document.getElementById("searchStatus").textContent = q ? visible + " فصل مطابق" : "";
  }

  /* ================= البحث الفوري ================= */
  var searchInput = document.getElementById("searchInput");
  var debounce;
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () { renderCards(searchInput.value); }, 180);
    });
  }

  var resetProgress = document.getElementById("resetProgress");
  if (resetProgress) {
    resetProgress.addEventListener("click", function () {
      if (!window.confirm("هل تريد تصفير الدروس المكتملة وقيد الدراسة؟ لن تُحذف نتائج الاختبارات.")) return;
      localStorage.setItem("efhama_completed", "[]");
      localStorage.setItem("efhama_started", "[]");
      renderCards(searchInput ? searchInput.value : "");
      renderSummary();
    });
  }

  /* تحميل البيانات ثم التهيئة */
  loadData().then(function () {
    renderCards("");
    renderSummary();
  }).catch(function () {
    document.getElementById("chaptersGrid").innerHTML =
      '<p class="muted">تعذر تحميل بيانات المنهج. شغّل المشروع عبر خادم محلي (انظر README.md) ثم أعد تحميل الصفحة.</p>';
  });
})();
