/* صفحة قاموس المصطلحات — تجميع المصطلحات من كل ملفات الدروس */
(function () {
  "use strict";

  var grid = document.getElementById("glossaryGrid");
  var search = document.getElementById("glossarySearch");
  var chapterSel = document.getElementById("glossaryChapter");
  var countEl = document.getElementById("glossaryCount");
  var ALL = [];

  function norm(s) {
    return (s || "").toString().toLowerCase()
      .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/[ً-ْ]/g, "").trim();
  }

  /* تجميع المصطلحات من كل الدروس */
  function collect() {
    return loadData().then(function (data) {
      var terms = [];
      var chain = Promise.resolve();
      data.chapters.forEach(function (ch) {
        ch.lessons.forEach(function (lesson) {
          chain = chain.then(function () {
            return loadLesson(lesson.id).then(function (d) {
              (d.terms || []).forEach(function (t) {
                terms.push({
                  id: t.id,
                  term: t.term,
                  definition: t.definition,
                  lesson: lesson.id,
                  lessonTitle: lesson.title,
                  chapter: ch.id
                });
              });
            });
          });
        });
      });
      return chain.then(function () { return terms; });
    });
  }

  function render() {
    var q = norm(search.value);
    var ch = chapterSel.value;
    var seen = {};
    var shown = ALL.filter(function (t) {
      var key = t.term;
      if (seen[key]) return false;
      if (ch && String(t.chapter) !== ch) return false;
      if (q && norm(t.term + " " + t.definition).indexOf(q) === -1) return false;
      seen[key] = true;
      return true;
    });
    countEl.textContent = shown.length + " مصطلحًا";
    grid.innerHTML = shown.length ? "" : '<p class="muted">لا توجد مصطلحات مطابقة.</p>';
    shown.forEach(function (t) {
      var card = document.createElement("article");
      card.className = "card glossary-card";
      card.innerHTML =
        "<h3>" + t.term + '</h3><p class="small">' + t.definition + "</p>" +
        '<div class="card-footer"><a class="btn btn-outline btn-sm" href="lesson.html?id=' +
        t.lesson + '">درس ' + t.lesson + ": " + t.lessonTitle + "</a></div>";
      grid.appendChild(card);
    });
  }

  search.addEventListener("input", render);
  chapterSel.addEventListener("change", render);

  /* فتح من رابط ?lesson=X-Y (قادم من البحث العام) */
  var preselect = new URLSearchParams(location.search).get("lesson");
  if (preselect) chapterSel.value = String(preselect).split("-")[0];

  collect().then(function (terms) {
    ALL = terms;
    render();
  }).catch(function () {
    grid.innerHTML = '<p class="muted">تعذر تحميل المصطلحات. شغّل الموقع عبر خادم محلي (انظر README).</p>';
  });
})();
