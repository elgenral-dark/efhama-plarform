/* ================= أدوات تفاعلية (playground) ================= */
function pgBuild(sec) {
  var mode = sec.mode, c = sec.config || {};
  if (mode === "json") {
    var ex = JSON.stringify(c.example || { city: "Cairo", temperature: 31 }, null, 2);
    return '<p class="pg-hint">' + (c.hint || "عدّل النص ثم جرّب الأزرار — لا يُرسل شيء لأي خادم.") + "</p>" +
      '<textarea class="pg-input" dir="ltr" spellcheck="false">' + ex + "</textarea>" +
      '<div class="pg-actions"><button type="button" class="btn btn-sm pg-run">تحليل وعرض منسّق</button>' +
      '<button type="button" class="btn btn-ghost btn-sm pg-keys">عرض المفاتيح والقيم</button></div>' +
      '<pre class="pg-out" dir="ltr" hidden></pre>';
  }
  if (mode === "web") {
    return '<p class="pg-hint">' + (c.hint || "عدّل الكود ثم اضغط «تشغيل» لمشاهدة النتيجة — بيئة آمنة تمامًا.") + "</p>" +
      '<div class="pg-tabs">' + (c.panes || []).map(function (pn, i) {
        return '<div class="pg-pane"><div class="pg-pane-title">' + pn.title + "</div>" +
               '<textarea class="pg-input" dir="ltr" spellcheck="false" data-pane="' + pn.lang + '">' + pn.code + "</textarea></div>";
      }).join("") + "</div>" +
      '<div class="pg-actions"><button type="button" class="btn btn-sm pg-run">تشغيل</button>' +
      '<button type="button" class="btn btn-ghost btn-sm pg-reset">استعادة المثال</button></div>' +
      '<iframe class="pg-frame" sandbox="allow-scripts" title="معاينة حية"></iframe>';
  }
  if (mode === "analytics") {
    return '<p class="pg-hint">' + (c.hint || "حرّك المؤشرات وشاهد تأثيرها فورًا.") + "</p>" +
      (c.inputs || []).map(function (inp) {
        return '<div class="pg-slider-row"><label>' + inp.label + ' <b class="pg-slider-val" data-for="' + inp.id + '">' + inp.value + "</b></label>" +
          '<input type="range" class="pg-slider" dir="ltr" id="' + inp.id + '" min="' + inp.min + '" max="' + inp.max + '" value="' + inp.value + '"></div>';
      }).join("") +
      '<div class="pg-analytics-out"></div>';
  }
  if (mode === "abtest") {
    return '<p class="pg-hint">' + (c.hint || "أدخل أرقام التجربة واضغط «قارن».") + "</p>" +
      '<div class="pg-ab-grid">' +
      ["a", "b"].map(function (v) {
        return '<div class="pg-ab-col"><h4>النسخة ' + v.toUpperCase() + '</h4>' +
          (c.fields || []).map(function (f) {
            return '<label>' + f.label + '</label><input type="number" class="pg-ab-input" dir="ltr" data-v="' + v + '" data-f="' + f.id + '" value="' + f.value + '" min="0">';
          }).join("") + "</div>";
      }).join("") + "</div>" +
      '<div class="pg-actions"><button type="button" class="btn btn-sm pg-run">قارن النتائج</button></div>' +
      '<div class="pg-ab-out"></div>';
  }
  if (mode === "persona") {
    return '<p class="pg-hint">' + (c.hint || "املأ الحقول لبناء شخصية مستخدم تخيلية.") + "</p>" +
      '<div class="pg-persona-grid"><div class="pg-persona-form">' +
      (c.fields || []).map(function (f) {
        return '<label>' + f.label + '</label><input type="text" class="pg-persona-input" data-f="' + f.id + '" placeholder="' + (f.placeholder || "") + '">';
      }).join("") + "</div>" +
      '<div class="pg-persona-card"><h4>شخصية المستخدم</h4><div class="pg-persona-out">' +
      (c.fields || []).map(function (f) {
        return '<p><b>' + f.label + ':</b> <span class="pg-persona-' + f.id + '">—</span></p>';
      }).join("") + "</div></div></div>";
  }
  return '<p class="muted">وضع غير معروف</p>';
}

function pgBind(sec, wrap) {
  var mode = sec.mode, c = sec.config || {};
  var $ = function (s) { return wrap.querySelector(s); };
  if (mode === "json") {
    var input = $(".pg-input"), out = $(".pg-out");
    var show = function (txt, ok) {
      out.hidden = false;
      out.textContent = txt;
      out.classList.toggle("pg-err", !ok);
    };
    $(".pg-run").addEventListener("click", function () {
      try { show(JSON.stringify(JSON.parse(input.value), null, 2), true); }
      catch (e) { show("JSON غير صالح: " + e.message, false); }
    });
    $(".pg-keys").addEventListener("click", function () {
      try {
        var obj = JSON.parse(input.value);
        var lines = [];
        Object.keys(obj).forEach(function (k) {
          lines.push("المفتاح: " + k + "  ←  القيمة: " + JSON.stringify(obj[k]));
        });
        show(lines.length ? lines.join("\n") : "(كائن فارغ)", true);
      } catch (e) { show("JSON غير صالح: " + e.message, false); }
    });
  }
  if (mode === "web") {
    var areas = wrap.querySelectorAll(".pg-input");
    var frame = $(".pg-frame");
    var originals = [];
    areas.forEach(function (a) { originals.push(a.value); });
    var run = function () {
      var parts = { html: "", css: "", js: "" };
      areas.forEach(function (a) { parts[a.dataset.pane] = a.value; });
      var doc = parts.html + "<style>" + parts.css + "</style><script>" + parts.js + "<\/script>";
      frame.srcdoc = doc;
    };
    $(".pg-run").addEventListener("click", run);
    $(".pg-reset").addEventListener("click", function () { areas.forEach(function (a, i) { a.value = originals[i]; }); run(); });
    run();
  }
  if (mode === "analytics") {
    var out2 = $(".pg-analytics-out");
    var renderFn = typeof c.render === "string" ? new Function("return (" + c.render + ")")() : c.render;
    var recalc = function () {
      var vals = {};
      wrap.querySelectorAll(".pg-slider").forEach(function (s) {
        vals[s.id] = Number(s.value);
        wrap.querySelector('.pg-slider-val[data-for="' + s.id + '"]').textContent = s.value;
      });
      out2.innerHTML = (renderFn || function () { return ""; })(vals);
    };
    wrap.querySelectorAll(".pg-slider").forEach(function (s) { s.addEventListener("input", recalc); });
    recalc();
  }
  if (mode === "abtest") {
    var renderFn2 = typeof c.render === "string" ? new Function("return (" + c.render + ")")() : c.render;
    $(".pg-run").addEventListener("click", function () {
      var vals = { a: {}, b: {} };
      wrap.querySelectorAll(".pg-ab-input").forEach(function (i) { vals[i.dataset.v][i.dataset.f] = Number(i.value) || 0; });
      $(".pg-ab-out").innerHTML = (renderFn2 || function () { return ""; })(vals);
    });
  }
  if (mode === "persona") {
    wrap.querySelectorAll(".pg-persona-input").forEach(function (i) {
      i.addEventListener("input", function () {
        wrap.querySelector(".pg-persona-" + i.dataset.f).textContent = i.value || "—";
      });
    });
  }
}

/* منطق صفحة شرح الدرس (?id=X-Y) — قالب واحد لكل دروس المنهج */
(function () {
  "use strict";

  /* ================= أيقونات SVG ================= */
  var CHECK_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  var TARGET_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>';
  var BULB_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/><path d="M9 21h6M10 17.5h4"/></svg>';
  var ALERT_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
  var FLAG_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4c3-1.5 6 1.5 9 0l1 7c-3 1.5-6-1.5-9 0"/></svg>';
  var QUIZ_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.7.3-0.9 1-0.9 1.7"/><path d="M12 17h.01"/></svg>';
  var TABLE_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10M15 10v10"/></svg>';
  var COMPARE_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18"/><rect x="3" y="7" width="6" height="10" rx="1.5"/><rect x="15" y="7" width="6" height="10" rx="1.5"/></svg>';
  var CODE_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 6-6 6 6 6M16 6l6 6-6 6"/></svg>';
  var SORT_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M7 4 4 7M7 4l3 3"/><path d="M17 20V4M17 20l-3-3M17 20l3-3"/></svg>';
  var LAYERS_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>';
  var CHAT_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12z"/></svg>';
  var CHEVRON_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var ARROW_PREV = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
  var ARROW_NEXT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>';

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

  /* ================= مفاتيح التخزين (موحدة مع الصفحات السابقة) ================= */
  var COMPLETED_KEY = "efhama_completed";
  var STARTED_KEY = "efhama_started";
  var POS_PREFIX = "efhama_pos_";
  var FONT_KEY = "efhama_fontsize";

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

  /* ================= حجم الخط ================= */
  var FONT_SIZES = [15, 17, 19, 21];
  var fontIdx = parseInt(localStorage.getItem(FONT_KEY), 10);
  if (isNaN(fontIdx) || fontIdx < 0 || fontIdx >= FONT_SIZES.length) fontIdx = 1;
  function applyFont() {
    var size = FONT_SIZES[fontIdx];
    document.querySelector(".lesson-body").style.setProperty("--lesson-font-size", size + "px");
    document.getElementById("fontVal").textContent = Math.round(size / 17 * 100) + "%";
  }
  document.getElementById("fontMinus").addEventListener("click", function () {
    if (fontIdx > 0) { fontIdx--; localStorage.setItem(FONT_KEY, fontIdx); applyFont(); }
  });
  document.getElementById("fontPlus").addEventListener("click", function () {
    if (fontIdx < FONT_SIZES.length - 1) { fontIdx++; localStorage.setItem(FONT_KEY, fontIdx); applyFont(); }
  });

  /* ================= نافذة المصطلح ================= */
  var termModal = document.getElementById("termModal");
  var termBody = document.getElementById("termBody");
  var lastFocused = null;
  function openTerm(term, definition) {
    lastFocused = document.activeElement;
    termBody.innerHTML = "<h3>" + term + "</h3><p>" + definition + "</p>";
    termModal.hidden = false;
    document.getElementById("termClose").focus();
  }
  function closeTerm() {
    termModal.hidden = true;
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }
  /* Escape للإغلاق + حصر التركيز (Tab) داخل النافذة */
  document.addEventListener("keydown", function (e) {
    if (termModal.hidden) return;
    if (e.key === "Escape") { closeTerm(); return; }
    if (e.key === "Tab") {
      var items = termModal.querySelectorAll("button, a[href]");
      if (!items.length) return;
      var first = items[0], lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    }
  });
  document.getElementById("termClose").addEventListener("click", closeTerm);
  termModal.addEventListener("click", function (e) { if (e.target === termModal) closeTerm(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeTerm(); });

  /* ================= بناء أقسام الدرس ================= */
  function linkTerms(text, terms) {
    return text.replace(/\[\[(.+?)\]\]/g, function (match, id) {
      var t = terms.filter(function (x) { return x.id === id; })[0];
      if (!t) return match;
      return '<button class="term" data-term="' + t.id + '">' + t.term + "</button>";
    });
  }

  function secIcon(type) {
    var icons = {
      intro: FLAG_SVG, objectives: TARGET_SVG, text: BULB_SVG,
      example: BULB_SVG, diagram: TARGET_SVG, timeline: FLAG_SVG,
      notes: ALERT_SVG, summary: CHECK_SVG, review: QUIZ_SVG,
      callout: ALERT_SVG, compare: COMPARE_SVG, table: TABLE_SVG, scenario: CHAT_SVG,
      stack: LAYERS_SVG, matrix: TABLE_SVG,
      playground: CODE_SVG, sorter: SORT_SVG
    };
    return icons[type] || CHECK_SVG;
  }

  function renderSection(sec, idx, terms) {
    var anchor = "sec-" + idx;
    var head = '<section class="ls-sec" id="' + anchor + '"><h2><span class="h2-icon">' +
               secIcon(sec.type) + "</span>" + sec.heading + "</h2>";
    var body = "";

    if (sec.type === "intro" || sec.type === "text") {
      body = '<div class="ls-card"><div class="ls-text">' + linkTerms(sec.body, terms) + "</div></div>";
    } else if (sec.type === "objectives") {
      body = '<ul class="objectives-list">' + sec.items.map(function (it) {
        return '<li><span class="li-icon">' + CHECK_SVG + "</span><span>" + it + "</span></li>";
      }).join("") + "</ul>";
    } else if (sec.type === "example") {
      body = sec.items.map(function (it) {
        return '<div class="example-item"><h4>' + it.title + "</h4><p>" + it.body + "</p></div>";
      }).join("");
    } else if (sec.type === "diagram") {
      body = '<figure class="diagram-box"><figcaption>' + sec.title + "</figcaption>" + sec.svg + "</figure>";
    } else if (sec.type === "callout") {
      var v = sec.variant || "info";
      var cIcon = v === "warning" ? ALERT_SVG : v === "success" ? CHECK_SVG : BULB_SVG;
      body = '<div class="callout callout-' + v + '"><div class="callout-title">' + cIcon +
             "<span>" + sec.heading + '</span></div><div class="callout-body">' +
             linkTerms(sec.body, terms) + "</div></div>";
    } else if (sec.type === "compare") {
      var cmpCol = function (c, cls) {
        return '<div class="cmp-col ' + cls + '"><h4>' + c.title + "</h4><ul>" +
               c.items.map(function (i) { return "<li>" + i + "</li>"; }).join("") + "</ul></div>";
      };
      body = '<div class="cmp-wrap">' + cmpCol(sec.a, "cmp-a") + cmpCol(sec.b, "cmp-b") + "</div>";
    } else if (sec.type === "table") {
      body = '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
        sec.columns.map(function (c) { return "<th>" + c + "</th>"; }).join("") +
        "</tr></thead><tbody>" +
        sec.rows.map(function (row) {
          return "<tr>" + row.map(function (cell) { return "<td>" + cell + "</td>"; }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
    } else if (sec.type === "scenario") {
      body = sec.items.map(function (it) {
        return '<div class="scenario-item"><p class="scenario-situation">' + it.situation + "</p>" +
          '<div class="rev-opts">' + it.options.map(function (o) {
            return '<button type="button" class="rev-opt"' + (o.correct ? ' data-correct="1"' : "") + ">" + o.text + "</button>";
          }).join("") + "</div>" +
          '<div class="scenario-feedback" hidden></div></div>';
      }).join("");
    } else if (sec.type === "stack") {
      body = '<div class="stk-wrap">' + sec.layers.map(function (l, li) {
        return '<button type="button" class="stk-node' + (li === 0 ? " active" : "") + '" data-i="' + li + '">' +
               '<span class="stk-title">' + l.title + "</span>" +
               (l.tag ? '<span class="stk-tag">' + l.tag + "</span>" : "") + "</button>";
      }).join("") +
      '<div class="stk-detail"><h4>' + sec.layers[0].title + "</h4><p>" +
      linkTerms(sec.layers[0].desc, terms) + "</p></div></div>";
    } else if (sec.type === "matrix") {
      var mxClass = function (r, c) {
        var s = (2 - r) + (2 - c);
        return s >= 4 ? "mx-high" : s === 3 ? "mx-mhigh" : s === 2 ? "mx-med" : "mx-low";
      };
      body = '<div class="ls-card"><div class="mx-wrap"><p class="mx-hint">اضغط على أي خانة لعرض تفاصيلها</p>' +
        '<div class="mx-scroll"><table class="mx-tbl"><thead><tr><th></th>' +
        sec.x.levels.map(function (l) { return "<th>" + l + "</th>"; }).join("") +
        "</tr></thead><tbody>" +
        sec.cells.map(function (row, r) {
          return '<tr><th scope="row">' + sec.y.levels[r] + "</th>" + row.map(function (cell, c) {
            return '<td><button type="button" class="mx-cell ' + mxClass(r, c) + '" data-r="' + r + '" data-c="' + c + '">' + cell + "</button></td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>" +
        '<p class="mx-caption"><b>' + sec.x.label + " × " + sec.y.label + "</b>" +
        (sec.note ? " — " + sec.note : "") + "</p>" +
        '<div class="mx-detail" hidden></div></div></div>';
    } else if (sec.type === "playground") {
      body = '<div class="pg-wrap"></div>';
    } else if (sec.type === "sorter") {
      var srtItems = (sec.shuffle === false ? sec.items.slice() : sec.items.map(function (v) { return [Math.random(), v]; }).sort(function (a, b) { return a[0] - b[0]; }).map(function (x) { return x[1]; }));
      body = '<div class="sorter" data-done="0" data-solution=' + "'" + JSON.stringify(sec.solution) + "'" + '><p class="sorter-hint">' + (sec.hint || "اسحب العناصر لترتيبها بالشكل الصحيح") + "</p>" +
        '<ul class="sorter-list">' + srtItems.map(function (it) { return '<li draggable="true">' + it + "</li>"; }).join("") + "</ul>" +
        '<div class="sorter-actions"><button type="button" class="btn btn-sm sorter-check">تحقق من الترتيب</button>' +
        '<button type="button" class="btn btn-ghost btn-sm sorter-reset">إعادة الترتيب</button></div>' +
        '<div class="sorter-feedback" hidden></div></div>';
    } else if (sec.type === "timeline") {
      body = '<div class="ls-card"><div class="tl-wrap">' +
        '<div class="tl-track" role="tablist">' + sec.stages.map(function (st, si) {
          return '<button type="button" class="tl-node' + (si === 0 ? " active" : "") +
                 '" data-i="' + si + '" role="tab" aria-selected="' + (si === 0) + '">' +
                 '<span class="tl-dot"></span><span class="tl-label">' + st.label + "</span></button>";
        }).join("") + "</div>" +
        '<div class="tl-detail" role="tabpanel"><h4>' + sec.stages[0].title + "</h4><p>" +
        linkTerms(sec.stages[0].desc, terms) + "</p></div>" +
        "</div></div>";
    } else if (sec.type === "notes") {
      body = '<div class="notes-wrap"><div class="notes-head"><h3>' + ALERT_SVG +
             '<span>' + sec.heading + '</span></h3><button class="btn btn-ghost btn-sm notes-toggle">إخفاء الملاحظات</button></div>' +
             '<ul class="notes-list">' + sec.items.map(function (it) {
               return '<li><span class="li-icon">' + ALERT_SVG + "</span><span>" + it + "</span></li>";
             }).join("") + "</ul></div>";
    } else if (sec.type === "summary") {
      body = '<div class="summary-box"><ul>' + sec.items.map(function (it) { return "<li>" + it + "</li>"; }).join("") + "</ul></div>";
    } else if (sec.type === "review") {
      var letters = ["أ", "ب", "ج", "د", "هـ", "و"];
      body = sec.items.map(function (it) {
        var inner;
        if (it.options && it.options.length) {
          inner = '<div class="review-a"><div class="rev-opts">' +
            it.options.map(function (o, oi) {
              return '<button type="button" class="rev-opt"' +
                     (it.answer === oi ? ' data-correct="1"' : "") + ">" +
                     (letters[oi] || "") + ") " + o + "</button>";
            }).join("") + "</div>" +
            (it.explanation ? '<div class="rev-explain" hidden>' + it.explanation + "</div>" : "") +
            "</div>";
        } else {
          inner = '<div class="review-a">' + it.a + "</div>";
        }
        return '<div class="review-item"><button class="review-q"><span>' + it.q +
               '</span><span class="rq-icon">' + CHEVRON_SVG + "</span></button>" + inner + "</div>";
      }).join("");
    }
    return head + body + "</section>";
  }

  /* ================= شريط تقدم القراءة + حفظ الموضع ================= */
  var readBar = document.getElementById("readBar");
  var readPct = document.getElementById("readPct");
  var saveTimer;
  function onScroll(lessonId) {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    var fraction = max > 0 ? h.scrollTop / max : 0;
    var pct = Math.round(fraction * 100);
    readBar.style.width = pct + "%";
    readPct.textContent = pct + "%";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      localStorage.setItem(POS_PREFIX + lessonId, String(fraction));
    }, 300);
  }
  function restorePosition(lessonId) {
    var saved = parseFloat(localStorage.getItem(POS_PREFIX + lessonId));
    if (isNaN(saved) || saved <= 0.01) return;
    setTimeout(function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      window.scrollTo(0, Math.round(saved * max));
    }, 120);
  }

  /* ================= التهيئة ================= */
  var lessonId = new URLSearchParams(location.search).get("id") || "1-1";

  Promise.all([loadData(), loadLesson(lessonId)]).then(function (results) {
    var data = results[0];
    var lesson = results[1];

    var ch = data.chapters.filter(function (c) { return c.id === lesson.chapter; })[0] || data.chapters[0];

    /* الترويسة والـ Breadcrumbs */
    document.title = lesson.title + " — افهمها";
    document.getElementById("lessonQuizBtn").href = "quiz.html?lesson=" + lessonId;
    document.getElementById("crumbChapter").textContent = ch.title;
    document.getElementById("crumbChapter").setAttribute("href", "chapter.html?id=" + ch.id);
    document.getElementById("crumbLesson").textContent = lesson.title;
    var chLink = document.getElementById("chapterLink");
    chLink.textContent = "الفصل " + ch.id + ": " + ch.title;
    chLink.setAttribute("href", "chapter.html?id=" + ch.id);
    document.getElementById("lessonTitle").textContent = lesson.title;
    document.getElementById("lessonDesc").textContent = lesson.desc;
    if (lesson.demo) document.getElementById("demoNote").hidden = false;

    /* حفظ «آخر درس» لمتابعة التعلم من الرئيسية */
    localStorage.setItem("efhama_last_lesson", JSON.stringify({ id: lessonId, at: Date.now() }));

    /* فتح الدرس = تسجيله كـ«قيد الدراسة» */
    if (!inList(COMPLETED_KEY, lessonId)) addToList(STARTED_KEY, lessonId);

    /* بناء الأقسام + قائمة الأجزاء */
    var tocList = document.getElementById("tocList");
    var body = document.getElementById("lessonBody");
    var terms = lesson.terms || [];
    var tlData = [];
    var scData = [];
    var mxData = [];
    var stkData = [];
    var pgData = [];
    lesson.sections.forEach(function (sec, i) {
      if (!sec.heading) return;
      if (sec.type === "timeline") tlData.push(sec.stages);
      if (sec.type === "scenario") sec.items.forEach(function (it2) { scData.push(it2); });
      if (sec.type === "matrix") mxData.push(sec);
      if (sec.type === "stack") stkData.push(sec.layers);
      if (sec.type === "playground") pgData.push(sec);
      tocList.insertAdjacentHTML("beforeend",
        '<a href="#sec-' + i + '" data-sec="sec-' + i + '">' + sec.heading + "</a>");
      body.insertAdjacentHTML("beforeend", renderSection(sec, i, terms));
    });

    /* ربط المصطلحات */
    body.querySelectorAll(".term").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var t = terms.filter(function (x) { return x.id === btn.dataset.term; })[0];
        if (t) openTerm(t.term, t.definition);
      });
    });

    /* الملاحظات: إظهار/إخفاء */
    body.querySelectorAll(".notes-wrap").forEach(function (box) {
      var btn = box.querySelector(".notes-toggle");
      var list = box.querySelector(".notes-list");
      btn.addEventListener("click", function () {
        var hidden = list.classList.toggle("hidden");
        btn.textContent = hidden ? "إظهار الملاحظات" : "إخفاء الملاحظات";
      });
    });

    /* أسئلة المراجعة: إظهار/إخفاء الإجابة */
    body.querySelectorAll(".review-item").forEach(function (item) {
      item.querySelector(".review-q").addEventListener("click", function () {
        item.classList.toggle("open");
      });
    });

    /* أسئلة الاختيار من متعدد: تصحيح فوري مع التفسير */
    body.querySelectorAll(".rev-opt").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var item = btn.closest(".review-item");
        if (!item) return; // أزرار السيناريو لها معالجها الخاص بالأسفل
        if (item.dataset.done) return;
        item.dataset.done = "1";
        item.querySelectorAll(".rev-opt").forEach(function (b) {
          b.disabled = true;
          if (b.dataset.correct === "1") b.classList.add("correct");
        });
        if (btn.dataset.correct === "1") { if (window.Sound) Sound.correct(); }
        else { btn.classList.add("wrong"); if (window.Sound) Sound.wrong(); }
        var ex = item.querySelector(".rev-explain");
        if (ex) ex.hidden = false;
      });
    });

    /* المخطط الزمني التفاعلي */
    body.querySelectorAll(".tl-wrap").forEach(function (wrap, k) {
      var stages = tlData[k];
      var detail = wrap.querySelector(".tl-detail");
      wrap.querySelectorAll(".tl-node").forEach(function (node) {
        node.addEventListener("click", function () {
          wrap.querySelectorAll(".tl-node").forEach(function (n) {
            n.classList.remove("active");
            n.setAttribute("aria-selected", "false");
          });
          node.classList.add("active");
          node.setAttribute("aria-selected", "true");
          var st = stages[Number(node.dataset.i)];
          detail.innerHTML = "<h4>" + st.title + "</h4><p>" + linkTerms(st.desc, terms) + "</p>";
        });
      });
    });

    /* الجداول: تمييز الصف بالنقر */
    body.querySelectorAll(".tbl tbody tr").forEach(function (tr) {
      tr.addEventListener("click", function () { tr.classList.toggle("selected"); });
    });

    /* السيناريوهات التفاعلية: اختيار المبدأ المناسب */
    body.querySelectorAll(".scenario-item").forEach(function (sc, k) {
      var it = scData[k];
      sc.querySelectorAll(".rev-opt").forEach(function (btn, oi) {
        btn.addEventListener("click", function () {
          if (sc.dataset.done) return;
          sc.dataset.done = "1";
          sc.querySelectorAll(".rev-opt").forEach(function (b) {
            b.disabled = true;
            if (b.dataset.correct === "1") b.classList.add("correct");
          });
          if (btn.dataset.correct !== "1") btn.classList.add("wrong");
          var fb = sc.querySelector(".scenario-feedback");
          fb.textContent = it.options[oi].feedback || "";
          fb.hidden = false;
        });
      });
    });

    /* أدوات الـ playground التفاعلية */
    body.querySelectorAll(".pg-wrap").forEach(function (wrap, k) {
      var sec = pgData[k];
      try {
        wrap.innerHTML = pgBuild(sec);
        pgBind(sec, wrap);
      } catch (e) {
        console.warn("تعذر تشغيل الأداة التفاعلية:", e);
        wrap.innerHTML = '<p class="muted small">تعذر تشغيل هذه الأداة التفاعلية مؤقتًا.</p>';
      }
    });

    /* أداة الترتيب (sorter) — سحب + لوحة مفاتيح */
    body.querySelectorAll(".sorter").forEach(function (box) {
      var list = box.querySelector(".sorter-list");
      var feedback = box.querySelector(".sorter-feedback");
      feedback.setAttribute("aria-live", "polite");
      var dragged = null;
      list.querySelectorAll("li").forEach(function (li) {
        li.setAttribute("tabindex", "0");
        li.addEventListener("keydown", function (e) {
          if (e.key === "ArrowUp" && li.previousElementSibling) {
            e.preventDefault();
            list.insertBefore(li, li.previousElementSibling);
            li.focus();
          } else if (e.key === "ArrowDown" && li.nextElementSibling) {
            e.preventDefault();
            list.insertBefore(li.nextElementSibling, li);
            li.focus();
          }
        });
        li.addEventListener("dragstart", function () { dragged = li; li.classList.add("dragging"); });
        li.addEventListener("dragend", function () { li.classList.remove("dragging"); });
        li.addEventListener("dragover", function (e) {
          e.preventDefault();
          if (dragged && dragged !== li) {
            var r = li.getBoundingClientRect();
            if (e.clientY < r.top + r.height / 2) list.insertBefore(dragged, li);
            else list.insertBefore(dragged, li.nextSibling);
          }
        });
      });
      box.querySelector(".sorter-check").addEventListener("click", function () {
        var order = Array.prototype.map.call(list.querySelectorAll("li"), function (li) { return li.textContent; });
        var correct = box.dataset.solution ? JSON.parse(box.dataset.solution) : [];
        var ok = order.length === correct.length && order.every(function (t, i) { return t === correct[i]; });
        feedback.hidden = false;
        feedback.className = "sorter-feedback " + (ok ? "pg-ok" : "pg-bad");
        feedback.textContent = ok ? "ترتيب صحيح — أحسنت!" : "الترتيب غير صحيح — حاول مرة أخرى.";
        if (ok) box.dataset.done = "1";
      });
      box.querySelector(".sorter-reset").addEventListener("click", function () {
        var items = Array.prototype.slice.call(list.querySelectorAll("li"));
        items.sort(function () { return Math.random() - 0.5; });
        items.forEach(function (li) { list.appendChild(li); });
        feedback.hidden = true;
      });
    });

    /* الطبقات المتراصة التفاعلية */
    body.querySelectorAll(".stk-wrap").forEach(function (wrap, k) {
      var layers = stkData[k];
      var detail = wrap.querySelector(".stk-detail");
      wrap.querySelectorAll(".stk-node").forEach(function (node) {
        node.addEventListener("click", function () {
          wrap.querySelectorAll(".stk-node").forEach(function (n) { n.classList.remove("active"); });
          node.classList.add("active");
          var l = layers[Number(node.dataset.i)];
          detail.innerHTML = "<h4>" + l.title + "</h4><p>" + linkTerms(l.desc, terms) + "</p>";
        });
      });
    });

    /* مصفوفة تقييم المخاطر التفاعلية */
    body.querySelectorAll(".mx-wrap").forEach(function (wrap, k) {
      var mx = mxData[k];
      var detail = wrap.querySelector(".mx-detail");
      wrap.querySelectorAll(".mx-cell").forEach(function (cell) {
        cell.addEventListener("click", function () {
          wrap.querySelectorAll(".mx-cell").forEach(function (c) { c.classList.remove("active"); });
          cell.classList.add("active");
          var r = Number(cell.dataset.r), c = Number(cell.dataset.c);
          detail.innerHTML = "<b>" + mx.x.levels[c] + " × " + mx.y.levels[r] + ":</b> " + mx.cells[r][c];
          detail.hidden = false;
        });
      });
    });

    /* تمييز الجزء الحالي أثناء القراءة */
    var tocLinks = Array.prototype.slice.call(tocList.querySelectorAll("a"));
    var secEls = tocLinks.map(function (a) { return document.getElementById(a.dataset.sec); });
    if ("IntersectionObserver" in window) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            tocLinks.forEach(function (a) {
              a.classList.toggle("active", a.dataset.sec === en.target.id);
            });
          }
        });
      }, { rootMargin: "-90px 0px -68% 0px" });
      secEls.forEach(function (el) { if (el) spy.observe(el); });
    }

    /* قائمة الموبايل */
    document.getElementById("tocToggle").addEventListener("click", function () {
      document.getElementById("lessonToc").classList.toggle("open");
    });

    /* زر الإكمال */
    var completeBtn = document.getElementById("completeBtn");
    function refreshComplete() {
      var done = inList(COMPLETED_KEY, lessonId);
      completeBtn.classList.toggle("done", done);
      completeBtn.innerHTML = done ? CHECK_SVG + " مكتمل — اضغط للتراجع" : "تحديد الدرس كمكتمل";
    }
    completeBtn.addEventListener("click", function () {
      if (inList(COMPLETED_KEY, lessonId)) {
        removeFromList(COMPLETED_KEY, lessonId);
      } else {
        addToList(COMPLETED_KEY, lessonId);
        removeFromList(STARTED_KEY, lessonId);
      }

      refreshComplete();
    });
    refreshComplete();

    /* مشاركة الدرس — نسخ الرابط إلى الحافظة */
    (function () {
      var shareBtn = document.getElementById("shareBtn");
      if (!shareBtn) return;
      var url = location.origin + location.pathname + "?id=" + lessonId;
      function done() {
        var old2 = shareBtn.textContent;
        shareBtn.textContent = "تم نسخ الرابط ✓";
        setTimeout(function () { shareBtn.textContent = old2; }, 2200);
      }
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); }
        catch (e) { shareBtn.textContent = "تعذر النسخ"; setTimeout(function(){ shareBtn.textContent = "مشاركة الدرس"; }, 2200); }
        document.body.removeChild(ta);
      }
      shareBtn.addEventListener("click", function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, fallback);
        } else fallback();
      });
    })();

    /* السابق والتالي */
    var flat = [];
    data.chapters.forEach(function (c) {
      c.lessons.forEach(function (l) { flat.push(l.id); });
    });
    var idx = flat.indexOf(lessonId);
    var nav = document.getElementById("lessonNav");
    var prevHtml = idx > 0
      ? '<a class="nav-link" href="lesson.html?id=' + flat[idx - 1] + '">' + ARROW_PREV + " الدرس السابق</a>"
      : '<span class="nav-link disabled">' + ARROW_PREV + " لا يوجد درس سابق</span>";
    var nextHtml = idx > -1 && idx < flat.length - 1
      ? '<a class="nav-link next" href="lesson.html?id=' + flat[idx + 1] + '">الدرس التالي ' + ARROW_NEXT + "</a>"
      : '<span class="nav-link disabled">لا يوجد درس تالي ' + ARROW_NEXT + "</span>";
    nav.innerHTML = prevHtml + nextHtml;

    /* البحث في الهيدر: تصفية قائمة الأجزاء والانتقال للمطابقة */
    var headerSearch = document.getElementById("headerSearch");
    var norm = function (s) {
      return (s || "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();
    };
    if (headerSearch) {
      headerSearch.addEventListener("input", function () {
        var q = norm(headerSearch.value);
        var firstMatch = null;
        tocLinks.forEach(function (a) {
          var el = document.getElementById(a.dataset.sec);
          var hay = norm(a.textContent + " " + (el ? el.textContent : ""));
          var match = !q || hay.indexOf(q) > -1;
          a.style.display = match ? "" : "none";
          if (q && match && !firstMatch) firstMatch = el;
        });
        if (firstMatch) firstMatch.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    /* تقدم القراءة + حفظ الموضع */
    window.addEventListener("scroll", function () { onScroll(lessonId); }, { passive: true });
    onScroll(lessonId);
    restorePosition(lessonId);

    /* تقييم الدرس — محفوظ محليًا */
    (function () {
      var box = document.getElementById("rateStars");
      if (!box) return;
      var msg = document.getElementById("rateMsg");
      var KEY = "efhama_rating_" + lessonId;
      function paint(n) {
        box.querySelectorAll(".rate-star").forEach(function (b) {
          b.classList.toggle("on", Number(b.dataset.v) <= n);
        });
      }
      var saved = 0;
      try { saved = (JSON.parse(localStorage.getItem(KEY)) || {}).stars || 0; } catch (e) {}
      if (saved) { paint(saved); msg.textContent = "تقييمك المحفوظ: " + saved + " من 5 — اضغط لتغييره."; }
      box.querySelectorAll(".rate-star").forEach(function (b) {
        b.addEventListener("mouseenter", function () { paint(Number(b.dataset.v)); });
        b.addEventListener("focus", function () { paint(Number(b.dataset.v)); });
        b.addEventListener("click", function () {
          var v = Number(b.dataset.v);
          localStorage.setItem(KEY, JSON.stringify({ stars: v, at: Date.now() }));
          paint(v);
          msg.textContent = "شكرًا! حُفظ تقييمك (" + v + " من 5) على هذا الجهاز.";
        });
      });
      box.addEventListener("mouseleave", function () {
        paint(saved || ((JSON.parse(localStorage.getItem(KEY)) || {}).stars || 0));
      });
    })();

    applyFont();
  }).catch(function () {
    document.getElementById("main").innerHTML =
      '<div class="container"><div class="lesson-error">' +
      "<h2>تعذر تحميل الدرس</h2>" +
      '<p class="muted">الدرس غير موجود أو تعذر تحميل بياناته. شغّل المشروع عبر خادم محلي (انظر README.md) ثم أعد المحاولة.</p>' +
      '<p style="margin-top:1rem"><a class="btn" href="chapters.html">العودة إلى الفصول</a></p>' +
      "</div></div>";
  });
})();
