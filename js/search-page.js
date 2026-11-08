/* صفحة البحث الشامل — نفس فهرس البحث العام مع نتائج مصنفة */
(function () {
  "use strict";

  var input = document.getElementById("searchBig");
  var results = document.getElementById("searchResults");
  var status = document.getElementById("searchStatus");

  function norm(s) {
    return (s || "").toString().toLowerCase()
      .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/[ً-ْ]/g, "").trim();
  }

  function flattenSearchText(value, key) {
    if (value == null || ["id", "order", "image"].indexOf(key) !== -1) return "";
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.map(function (item) { return flattenSearchText(item); }).join(" ");
    if (typeof value === "object") {
      return Object.keys(value).map(function (childKey) {
        return flattenSearchText(value[childKey], childKey);
      }).join(" ");
    }
    return "";
  }

  var INDEX = null;
  var PROGRAMMING_PATHS = null;
  var PROGRAMMING_PATHS_PROMISE = null;
  var programmingPathsError = null;
  function load() {
    if (INDEX) return Promise.resolve(INDEX);
    return fetch("data/search-index.json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (d) { INDEX = d; return d; });
  }

  function loadProgrammingPaths() {
    if (PROGRAMMING_PATHS) return Promise.resolve(PROGRAMMING_PATHS);
    if (PROGRAMMING_PATHS_PROMISE) return PROGRAMMING_PATHS_PROMISE;
    PROGRAMMING_PATHS_PROMISE = fetch("data/programming-paths.json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (paths) {
      return Promise.all(paths.map(function (path) {
        return fetch("data/paths/" + encodeURIComponent(path.slug) + ".json").then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        }).then(function (detail) {
          var title = path.titleAr || path.title || detail.title;
          var lessons = (detail.levels || []).reduce(function (all, level) {
            return all.concat(level.lessons || []);
          }, []);
          var items = [{
            title: title,
            courseTitle: title,
            courseTitleEn: path.titleEn || detail.titleEn || "",
            subtitle: "مسار برمجي" + (path.titleEn || detail.titleEn ? " • " + (path.titleEn || detail.titleEn) : ""),
            searchText: [title, path.title, path.titleEn, detail.title, detail.titleEn, path.description, detail.description].join(" "),
            url: "programming-paths/path.html?slug=" + encodeURIComponent(path.slug)
          }];
          lessons.forEach(function (lesson) {
            var unit = (detail.levels || []).find(function (level) {
              return (level.lessons || []).some(function (item) { return item.id === lesson.id; });
            });
            var lessonText = flattenSearchText(lesson);
            items.push({
              title: lesson.title,
              courseTitle: title,
              courseTitleEn: path.titleEn || detail.titleEn || "",
              subtitle: title + (lesson.summary ? " • " + lesson.summary : ""),
              searchText: [lessonText, unit && unit.name, title, path.titleEn, detail.titleEn].join(" "),
              url: "programming-paths/lesson.html?slug=" + encodeURIComponent(path.slug) + "&lesson=" + encodeURIComponent(lesson.id)
            });
          });
          return items;
        });
      }));
    }).then(function (groups) {
      PROGRAMMING_PATHS = groups.reduce(function (all, group) {
        return all.concat(group);
      }, []);
      return PROGRAMMING_PATHS;
    }).catch(function (error) {
      programmingPathsError = error;
      console.error("Unable to load programming path search data:", error);
      return [];
    });
    return PROGRAMMING_PATHS_PROMISE;
  }

  function run(q) {
    var nq = norm(q);
    results.innerHTML = "";
    if (nq.length < 2) {
      status.textContent = "اكتب كلمتين على الأقل للبحث.";
      return;
    }
    var indexError = null;
    Promise.all([
      load().catch(function (error) {
        indexError = error;
        console.error("Unable to load the curriculum search index:", error);
        return { lessons: [], terms: [], questions: [] };
      }),
      loadProgrammingPaths()
    ]).then(function (loaded) {
      var idx = loaded[0];
      var pathItems = loaded[1];
      var words = nq.split(/\s+/);
      var groups = [
        { key: "lessons", label: "الدروس", icon: "درس" },
        { key: "terms", label: "المصطلحات", icon: "مصطلح" },
        { key: "questions", label: "الأسئلة", icon: "سؤال" },
        { key: "programming", label: "مسارات البرمجة ودروسها", icon: "مسار", items: pathItems }
      ];
      var total = 0;
      groups.forEach(function (g) {
        var source = g.items || idx[g.key] || [];
        var hits = source.map(function (item) {
          var hay = norm(g.key === "programming" ? item.searchText
                     : g.key === "lessons" ? item.title + " " + item.desc + " " + item.headings.join(" ")
                     : g.key === "terms" ? item.term + " " + item.definition
                     : item.q);
          var titleHay = g.key === "programming"
            ? norm([item.title, item.courseTitle, item.courseTitleEn].join(" "))
            : "";
          var score = words.reduce(function (n, w) {
            if (!w) return n;
            return n + (hay.indexOf(w) > -1 ? 1 : 0) + (titleHay.indexOf(w) > -1 ? 3 : 0);
          }, 0);
          return { item: item, score: score };
        }).filter(function (h) { return h.score > 0; })
          .sort(function (a, b) { return b.score - a.score; }).slice(0, 12);

        if (!hits.length) return;
        total += hits.length;
        results.insertAdjacentHTML("beforeend",
          '<h2 class="section-title" style="margin-top:1.6rem">' + g.label + " (" + hits.length + ")</h2>");
        hits.forEach(function (h) {
          var it = h.item;
          var title = g.key === "programming" ? it.title
                    : g.key === "lessons" ? it.title : g.key === "terms" ? it.term : it.q;
          var sub = g.key === "programming" ? it.subtitle
                  : g.key === "lessons" ? "درس " + it.id
                  : g.key === "terms" ? it.definition.slice(0, 90) + "…"
                  : "سؤال من درس " + it.lesson;
          var url = g.key === "programming" ? it.url
                  : g.key === "terms" ? "glossary.html?lesson=" + it.lesson : "lesson.html?id=" + (it.id || it.lesson);
          results.insertAdjacentHTML("beforeend",
            '<a class="search-result" href="' + url + '">' +
            '<span class="badge">' + g.icon + "</span>" +
            "<div><strong>" + window.__hl(title, words) + '</strong><div class="muted small">' + window.__esc(sub) + "</div></div></a>");
        });
      });
      status.textContent = total ? total + " نتيجة لـ «" + q + "»" : "لا توجد نتائج مطابقة.";
      if (indexError) status.textContent += " فهرس المنهج العام غير متاح حاليًا.";
      if (programmingPathsError) status.textContent += " تعذر تحميل نتائج مسارات البرمجة.";
      if (!total) results.innerHTML = '<p class="muted">جرّب كلمات مختلفة.</p>';
    }).catch(function (error) {
      console.error("Unable to run search:", error);
      status.textContent = "تعذر تحميل فهرس البحث.";
    });
  }

  var t;
  input.addEventListener("input", function () {
    clearTimeout(t);
    t = setTimeout(function () { run(input.value); }, 220);
  });

  var q0 = new URLSearchParams(location.search).get("q");
  if (q0) { input.value = q0; run(q0); }
})();
