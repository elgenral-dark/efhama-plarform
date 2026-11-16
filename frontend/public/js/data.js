/* بيانات المنهج تُحمَّل من data/curriculum.json —
   عدّل ملف JSON فقط لإضافة فصول أو دروس أو تعديل المحتوى دون لمس التصميم.
   ملاحظة: التحميل عبر fetch يتطلب تشغيل المشروع عبر خادم محلي (انظر README). */
var CHAPTERS = [];
var TOTAL_LESSONS = 0;

function loadData() {
  if (loadData._cache) return Promise.resolve(loadData._cache);
  return fetch("data/curriculum.json")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      CHAPTERS = data.chapters;
      TOTAL_LESSONS = data.totalLessons;
      loadData._cache = data;
      return data;
    });
}

/* تحميل محتوى درس محدد من data/lessons/lesson-<id>.json */
var LESSON_CACHE = {};
function loadLesson(id) {
  if (LESSON_CACHE[id]) return Promise.resolve(LESSON_CACHE[id]);
  return fetch("data/lessons/lesson-" + id + ".json")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      LESSON_CACHE[id] = data;
      return data;
    });
}
