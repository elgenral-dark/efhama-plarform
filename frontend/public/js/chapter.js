/* منطق صفحة دروس الفصل (?id=N) — الحالات الثلاث محفوظة في Local Storage */
(function () {
  "use strict";

  var CHECK_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  var CLOCK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
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

  /* ================= مفاتيح التخزين (موحدة مع باقي الصفحات) ================= */
  var COMPLETED_KEY = "efhama_completed";
  var STARTED_KEY = "efhama_started";

  function readList(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch (e) { return []; }
  }
  function writeList(key, list) { localStorage.setItem(key, JSON.stringify(list)); }
  function inList(key, id) { return readList(key).indexOf(id) > -1; }
  function addToList(key, id) {
    var list = readList(key);
    if (list.indexOf(id) === -1) { list.push(id); writeList(key, list); }
  }
  function removeFromList(key, id) {
    writeList(key, readList(key).filter(function (x) { return x !== id; }));
  }
  function toggleCompleted(id) {
    if (inList(COMPLETED_KEY, id)) removeFromList(COMPLETED_KEY, id);
    else { addToList(COMPLETED_KEY, id); removeFromList(STARTED_KEY, id); }
  }
  /* حالة الدرس: مكتمل > قيد الدراسة > لم يبدأ */
  function lessonState(id) {
    if (inList(COMPLETED_KEY, id)) return "done";
    if (inList(STARTED_KEY, id)) return "doing";
    return "new";
  }

  /* ================= قراءة الفصل المطلوب ================= */
  var chapterId = parseInt(new URLSearchParams(location.search).get("id"), 10);
  if (!chapterId) chapterId = 1;

  /* ================= أدوات مساعدة ================= */
  function norm(s) {
    return (s || "").toString().toLowerCase()
      .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();
  }
  function stateBadge(state) {
    if (state === "done") return '<span class="chapter-state done">مكتمل ' + CHECK_SVG + "</span>";
    if (state === "doing") return '<span class="chapter-state doing">قيد الدراسة</span>';
    return '<span class="chapter-state">لم يبدأ</span>';
  }

  /* ================= عرض الصفحة ================= */
  var listEl = document.getElementById("lessonsList");
  var currentChapter = null;

  function renderHeader(ch) {
    document.title = ch.title + " — افهمها";
    document.getElementById("crumbChapter").textContent = ch.title;
    document.getElementById("chapterTitle").textContent = "الفصل " + ch.id + ": " + ch.title;
    document.getElementById("chapterDesc").textContent = ch.desc;
    document.getElementById("totalCount").textContent = ch.lessons.length;
    document.getElementById("chapterQuizBtn").href = "quiz.html?chapter=" + ch.id;
    updateHeader(ch);
  }

  function updateHeader(ch) {
    var done = ch.lessons.filter(function (l) { return lessonState(l.id) === "done"; }).length;
    var pct = Math.round(done / ch.lessons.length * 100);
    document.getElementById("doneCount").textContent = done;
    document.getElementById("chapterPct").textContent = pct + "%";
    document.getElementById("chapterBar").style.width = pct + "%";
  }

  function renderLessons(ch, filter) {
    var q = norm(filter || "");
    var visible = 0;
    listEl.innerHTML = "";
    ch.lessons.forEach(function (lesson, index) {
      if (q && norm(lesson.title + " " + lesson.id).indexOf(q) === -1) return;
      visible++;
      var state = lessonState(lesson.id);
      var card = document.createElement("article");
      card.className = "lesson-card " + (state === "done" ? "done" : "");
      card.innerHTML =
        '<div class="lesson-num">' + lesson.id + "</div>" +
        '<div class="lesson-info">' +
          "<h3>" + lesson.title + "</h3>" +
          "<p>" + lesson.desc + "</p>" +
          '<div class="lesson-meta">' +
            '<span class="duration">' + CLOCK_SVG + "تقديريًا " + lesson.duration + " دقيقة</span>" +
            stateBadge(state) +
          "</div>" +
        "</div>" +
        '<div class="lesson-actions">' +
          '<button class="lesson-check" aria-label="تعليم درس ' + lesson.id + ' كمكتمل">' + CHECK_SVG + "</button>" +
          '<a class="btn btn-sm open-lesson" href="lesson.html?id=' + lesson.id + '">' +
            (state === "new" ? "ابدأ الدرس " : "استكمل التعلم ") + ARROW_SVG +
          "</a>" +
        "</div>";
      listEl.appendChild(card);

      /* تعليم مكتمل يدويًا */
      card.querySelector(".lesson-check").addEventListener("click", function () {
        toggleCompleted(lesson.id);
        renderLessons(ch, searchEl.value);
        updateHeader(ch);
      });
      /* فتح الدرس = تسجيله كـ«قيد الدراسة» قبل الانتقال */
      card.querySelector(".open-lesson").addEventListener("click", function () {
        if (lessonState(lesson.id) === "new") addToList(STARTED_KEY, lesson.id);
      });
    });
    document.getElementById("noLessonResults").classList.toggle("hidden", visible > 0);
    document.getElementById("lessonSearchStatus").textContent =
      q ? (visible ? visible + " درس مطابق" : "") : "";
  }

  function showError() {
    document.getElementById("main").innerHTML =
      '<div class="container"><div class="chapter-error">' +
      "<h2>الفصل المطلوب غير موجود</h2>" +
      '<p class="muted">ربما تم حذف هذا الفصل أو أن الرابط غير صحيح.</p>' +
      '<p style="margin-top:1rem"><a class="btn" href="chapters.html">العودة إلى قائمة الفصول</a></p>' +
      "</div></div>";
  }

  /* ================= البحث (داخل الصفحة + في الهيدر) ================= */
  var searchEl = document.getElementById("lessonSearch");
  var headerSearch = document.getElementById("headerSearch");
  var debounce;
  function onSearch(value) {
    clearTimeout(debounce);
    debounce = setTimeout(function () {
      if (currentChapter) renderLessons(currentChapter, value);
    }, 160);
  }
  if (searchEl) {
    searchEl.addEventListener("input", function () {
      if (headerSearch && headerSearch.value !== searchEl.value) headerSearch.value = searchEl.value;
      onSearch(searchEl.value);
    });
  }
  if (headerSearch) {
    headerSearch.addEventListener("input", function () {
      if (searchEl && searchEl.value !== headerSearch.value) searchEl.value = headerSearch.value;
      onSearch(headerSearch.value);
    });
  }

  /* ================= التهيئة ================= */
  loadData().then(function (data) {
    var ch = data.chapters.filter(function (c) { return c.id === chapterId; })[0];
    if (!ch) { showError(); return; }
    currentChapter = ch;
    renderHeader(ch);
    renderLessons(ch, "");
    /* توسيط قسم الدروس عند وجود بحث قادم من رابط */
    var q0 = new URLSearchParams(location.search).get("q");
    if (q0) {
      if (searchEl) searchEl.value = q0;
      if (headerSearch) headerSearch.value = q0;
      renderLessons(ch, q0);
    }
  }).catch(function () {
    document.getElementById("lessonsList").innerHTML =
      '<p class="muted">تعذر تحميل بيانات المنهج. شغّل المشروع عبر خادم محلي (انظر README.md) ثم أعد تحميل الصفحة.</p>';
  });
})();
