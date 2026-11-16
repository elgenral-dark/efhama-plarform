/* نظام الاختبارات: درس / فصل شامل / تدريب / دفتر أخطاء / امتحان موقوت
   المحرك الجديد: تنقل بين الأسئلة، لوحة حالة، تأكيد إنهاء، نتيجة احترافية، طباعة */
(function () {
  "use strict";

  /* الوضع الليلي/النهاري موحد ويُدار مركزيًا من ui.js / navigation.js */

  var RESULTS_KEY = "efhama_quiz_results";
  var BEST_KEY = "efhama_quiz_best";
  var MISTAKES_KEY = "efhama_mistakes";
  var EXAM_SECONDS = 600;

  function readJSON(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function writeJSON(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  function shuffle(arr) {
    return arr.map(function (v) { return [Math.random(), v]; })
      .sort(function (a, b) { return a[0] - b[0]; }).map(function (x) { return x[1]; });
  }
  function esc(s) {
    return (s || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function fmtTime(s) {
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? "0" + m : m) + ":" + (r < 10 ? "0" + r : r);
  }

  function readMistakes() { return readJSON(MISTAKES_KEY, []); }
  function addMistake(raw) {
    var list = readMistakes();
    var uid = (raw.lesson || "") + "::" + raw.q;
    if (list.some(function (m) { return m.uid === uid; })) return;
    list.push({ uid: uid, q: raw.q, options: raw.options, answer: raw.answer,
                explanation: raw.explanation || "", lesson: raw.lesson || "" });
    writeJSON(MISTAKES_KEY, list);
  }
  function removeMistake(raw) {
    var uid = (raw.lesson || "") + "::" + raw.q;
    writeJSON(MISTAKES_KEY, readMistakes().filter(function (m) { return m.uid !== uid; }));
  }

  function normalizeQuestion(raw, lessonId) {
    var opts = raw.options.map(function (text, i) { return { text: text, correct: i === raw.answer }; });
    var shuffled = shuffle(opts);
    return {
      q: raw.q,
      options: shuffled.map(function (o) { return o.text; }),
      answer: shuffled.findIndex(function (o) { return o.correct; }),
      explanation: raw.explanation || "",
      lesson: raw.lesson || lessonId || "",
      raw: raw
    };
  }

  function saveResult(key, score, total) {
    var results = readJSON(RESULTS_KEY, {});
    results[key] = { score: score, total: total, at: Date.now() };
    writeJSON(RESULTS_KEY, results);
    var best = readJSON(BEST_KEY, {});
    if (!best[key] || score > best[key].score) { best[key] = { score: score, total: total }; writeJSON(BEST_KEY, best); }
  }
  function getBest(key) { return readJSON(BEST_KEY, {})[key] || null; }

  var root = document.getElementById("quizRoot");

  /* ============ نافذة تأكيد الإنهاء ============ */
  function confirmFinish(answeredCount, total, onYes) {
    var ov = document.createElement("div");
    ov.className = "confirm-ov";
    ov.innerHTML = '<div class="confirm-box" role="alertdialog" aria-modal="true" aria-label="تأكيد إنهاء الامتحان">' +
      "<h3>إنهاء الامتحان؟</h3>" +
      '<p class="muted">أجبت على <b>' + answeredCount + "</b> من " + total +
      (answeredCount < total ? " — هناك أسئلة بلا إجابة ستُحسب خاطئة." : " — كل الأسئلة مُجابة.") + "</p>" +
      '<div class="confirm-actions">' +
      '<button type="button" class="btn" id="cfYes">إنهاء وتصحيح</button>' +
      '<button type="button" class="btn btn-outline" id="cfNo">متابعة الامتحان</button>' +
      "</div></div>";
    document.body.appendChild(ov);
    document.getElementById("cfYes").addEventListener("click", function () { ov.remove(); onYes(); });
    document.getElementById("cfNo").addEventListener("click", function () { ov.remove(); });
  }

  /* ============ الطباعة ============ */
  function ensurePrintArea() {
    var area = document.getElementById("printArea");
    if (!area) {
      area = document.createElement("div");
      area.id = "printArea";
      document.body.appendChild(area);
    }
    return area;
  }

  function buildPrint(title, qs, answers, withAnswers, score, total) {
    var date = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    var h = '<div class="pr-head">' +
      '<div class="pr-brand">افهمها | efhamha</div>' +
      '<div class="pr-title">' + esc(title) + "</div>" +
      '<div class="pr-meta">التاريخ: ' + date;
    if (withAnswers) {
      var pct = total ? Math.round(score / total * 100) : 0;
      h += ' — الدرجة: <b>' + score + " / " + total + " (" + pct + "%)</b>";
    } else {
      h += " — نموذج تدريب (بدون إجابات)";
    }
    h += "</div></div>";

    h += qs.map(function (q, i) {
      var row = '<div class="pr-q"><div class="pr-qt">' + (i + 1) + ". " + esc(q.q) + '</div><ol class="pr-opts">';
      row += q.options.map(function (o, oi) {
        var cls = "";
        var mark = "";
        if (withAnswers) {
          if (oi === q.answer) { cls = " correct"; mark = " ✓"; }
          if (answers && answers[i] === oi && oi !== q.answer) { cls = " wrong"; mark = " ✗ (إجابتك)"; }
          if (answers && answers[i] === oi && oi === q.answer) { mark = " ✓ (إجابتك)"; }
        }
        return '<li class="pr-opt' + cls + '">' + esc(o) + mark + "</li>";
      }).join("");
      row += "</ol></div>";
      return row;
    }).join("");

    if (withAnswers) {
      h += '<div class="pr-foot">الدرجة النهائية: ' + score + " من " + total +
           " — افهمها | efhamha — مش هنحفظك المنهج.. هنفهمهولك.</div>";
    }
    return h;
  }

  function doPrint(title, qs, answers, withAnswers, score, total) {
    var area = ensurePrintArea();
    area.innerHTML = buildPrint(title, qs, answers, withAnswers, score, total);
    window.print();
  }

  /* ============ النتيجة ============ */
  function resultMessage(pct) {
    if (pct >= 90) return "ممتاز! أداء رائع يدل على فهم قوي للمنهج.";
    if (pct >= 75) return "جيد جدًا! راجع الأخطاء البسيطة وستصل للتمام.";
    if (pct >= 50) return "جيد — راجع الأسئلة الخاطئة في دفتر الأخطاء وأعد المحاولة.";
    if (pct >= 35) return "مقبول، لكن تحتاج مراجعة الدرس قبل إعادة المحاولة.";
    return "تحتاج مراجعة شاملة للدرس ثم إعادة الامتحان — ستتحسن بالتدريب.";
  }

  function renderResult(o) {
    /* o: {title, score, total, correct, wrong, skipped, qs, answers, storageKey, backLink, retryFn, exam} */
    var pct = o.total ? Math.round(o.score / o.total * 100) : 0;
    var best = getBest(o.storageKey);
    var reviewRows = o.qs.map(function (q, i) {
      var mine = o.answers[i];
      var ok = mine === q.answer;
      var skipped = mine === null || mine === undefined;
      return '<div class="rv-row ' + (skipped ? "skip" : ok ? "ok" : "bad") + '">' +
        '<div class="rv-qhead"><span class="rv-num">' + (i + 1) + "</span>" +
        '<span class="rv-state">' + (skipped ? "بدون إجابة" : ok ? "صحيحة" : "خاطئة") + "</span></div>" +
        '<div class="rv-q">' + esc(q.q) + "</div>" +
        '<div class="rv-answer">إجابتك: <b>' + (skipped ? "—" : esc(q.options[mine])) + "</b>" +
        (!ok ? ' — الصحيحة: <b class="ok-t">' + esc(q.options[q.answer]) + "</b>" : "") + "</div>" +
        (q.explanation && !ok ? '<div class="rv-exp">' + esc(q.explanation) + "</div>" : "") +
        "</div>";
    }).join("");

    root.innerHTML =
      '<div class="quiz-card quiz-result result-pro">' +
        '<div class="rp-badge">' + pct + '%</div>' +
        "<h2>" + esc(o.title) + "</h2>" +
        '<div class="rp-msg">' + resultMessage(pct) + "</div>" +
        '<div class="rp-stats">' +
          '<div class="rp-st"><b>' + o.correct + '</b><span>صحيحة</span></div>' +
          '<div class="rp-st bad"><b>' + o.wrong + '</b><span>خاطئة</span></div>' +
          '<div class="rp-st skip"><b>' + o.skipped + '</b><span>بدون إجابة</span></div>' +
          '<div class="rp-st"><b>' + o.score + "/" + o.total + '</b><span>الدرجة</span></div>' +
        "</div>" +
        (best ? '<p class="muted small">أفضل نتيجة لك: ' + Math.round(best.score / best.total * 100) + "% (" + best.score + "/" + best.total + ")</p>" : "") +
        '<div class="rp-actions">' +
          '<button class="btn" id="retryBtn">إعادة الاختبار</button>' +
          (o.exam ? '<button class="btn btn-outline" id="printWith">طباعة النتيجة</button>' : "") +
          (o.exam ? '<button class="btn btn-outline" id="printBlank">طباعة نموذج (بدون إجابات)</button>' : "") +
          '<a class="btn btn-ghost" href="' + (o.backLink || "chapters.html") + '">رجوع</a>' +
        "</div>" +
        '<div class="rv-wrap"><h3>مراجعة الإجابات</h3>' + reviewRows + "</div>" +
      "</div>";

    document.getElementById("retryBtn").addEventListener("click", o.retryFn);
    if (o.exam) {
      document.getElementById("printWith").addEventListener("click", function () {
        doPrint(o.title, o.qs, o.answers, true, o.score, o.total);
      });
      document.getElementById("printBlank").addEventListener("click", function () {
        doPrint(o.title, o.qs, null, false, 0, o.total);
      });
    }
  }

  /* ============ محرك الأسئلة ============ */
  function runQuiz(title, questions, storageKey, backLink, opts) {
    opts = opts || {};
    var exam = !!opts.exam;
    var qs = shuffle(questions.map(function (q) { return normalizeQuestion(q); }));
    var total = qs.length;
    var current = 0;
    var answers = new Array(total).fill(null);
    var feedback = new Array(total).fill(null); /* null أو {pick} بعد التصحيح الفوري */
    var timeLeft = EXAM_SECONDS, timerId = null;

    function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

    function answeredCount() { return answers.filter(function (a) { return a !== null; }).length; }

    function palette() {
      if (!exam) return "";
      var cells = qs.map(function (q, i) {
        var st = (i === current ? "cur " : "") + (answers[i] !== null ? "done" : "todo");
        st = st.trim();
        return '<button type="button" class="pal-cell ' + st + '" data-go="' + i + '" aria-label="السؤال ' + (i + 1) + '">' + (i + 1) + "</button>";
      }).join("");
      return '<div class="pal-wrap"><p class="pal-title">خريطة الأسئلة</p><div class="pal-grid">' + cells + "</div></div>";
    }

    function meta() {
      var clockHtml = '<div class="exam-clock' + (timeLeft <= 120 ? " warn" : "") + '" id="examClock" role="timer" aria-label="الوقت المتبقي">' +
        '<svg width="58" height="58" viewBox="0 0 62 62" aria-hidden="true">' +
        '<circle class="clock-bg" cx="31" cy="31" r="26"/>' +
        '<circle class="clock-ring" id="examRing" cx="31" cy="31" r="26"/></svg>' +
        '<div class="clock-text" id="examTimer">' + fmtTime(timeLeft) + "</div></div>";
      var h = '<div class="quiz-meta">' +
        '<div class="quiz-meta-start">' +
        '<span class="badge q-count">السؤال ' + (current + 1) + " من " + total + "</span>" +
        '<span class="badge">أجبت على ' + answeredCount() + "</span>" +
        "</div>" +
        (exam ? clockHtml : "") +
        '<a class="btn btn-ghost btn-sm" href="' + backLink + '">خروج</a></div>' +
        '<div class="q-progress" aria-hidden="true"><span style="width:' + (answeredCount() / total * 100) + '%"></span></div>';
      return h;
    }

    var CLOCK_C = 2 * Math.PI * 26;
    function updateTimer() {
      var t = document.getElementById("examTimer");
      var ring = document.getElementById("examRing");
      var clock = document.getElementById("examClock");
      var frac = Math.max(0, timeLeft) / EXAM_SECONDS;
      if (t) t.textContent = fmtTime(Math.max(0, timeLeft));
      if (ring) {
        ring.style.strokeDasharray = CLOCK_C;
        ring.style.strokeDashoffset = CLOCK_C * (1 - frac);
      }
      if (clock) clock.classList.toggle("warn", timeLeft <= 120);
    }

    function startTimer() {
      stopTimer();
      timerId = setInterval(function () {
        timeLeft--;
        updateTimer();
        if (timeLeft <= 0) finish(true);
      }, 1000);
    }

    var OPT_LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"];
    function optionHtml(q, i) {
      var fb = feedback[i];
      return q.options.map(function (o, oi) {
        var cls = "quiz-option";
        var mark = "";
        if (fb) {
          if (oi === q.answer) cls += " correct";
          else if (fb.pick === oi) cls += " wrong";
          if (oi === q.answer) mark = ' <span class="opt-mark">✓</span>';
          else if (fb.pick === oi) mark = ' <span class="opt-mark">✗</span>';
        } else if (exam && answers[i] === oi) {
          cls += " picked";
        }
        var letter = '<span class="opt-letter">' + (OPT_LETTERS[oi] || (oi + 1)) + "</span>";
        return '<button type="button" class="' + cls + '" data-i="' + oi + '"' + (fb ? " disabled" : "") + ">" +
               '<span class="opt-content">' + letter + '<span class="opt-text">' + esc(o) + "</span></span>" +
               mark + "</button>";
      }).join("");
    }

    function draw() {
      var q = qs[current];
      var fb = feedback[current];
      var isLast = current === total - 1;
      root.innerHTML = '<div class="quiz-shell">' +
        '<h2 class="quiz-run-title">' + esc(title) + "</h2>" +
        meta() +
        '<div class="quiz-card">' +
          '<div class="quiz-question">' + esc(q.q) + "</div>" +
          '<div class="quiz-options">' + optionHtml(q, current) + "</div>" +
          '<div id="explainSlot"></div>' +
          '<div class="quiz-nav-row">' +
            '<button type="button" class="btn btn-ghost btn-sm" id="prevQ"' + (current === 0 ? " disabled" : "") + ">→ السابق</button>" +
            (exam
              ? '<button type="button" class="btn btn-sm" id="finishQ">إنهاء الامتحان</button>'
              : "") +
            (!exam
              ? '<button type="button" class="btn btn-sm" id="nextQ"' + (isLast || !fb ? " disabled" : "") + ">" +
                (isLast ? "عرض النتيجة النهائية" : "السؤال التالي ←") + "</button>"
              : '<button type="button" class="btn btn-outline btn-sm" id="nextQ2"' + (isLast ? " disabled" : "") + ">التالي ←</button>") +
          "</div>" +
        "</div>" +
        palette() +
      "</div>";

      /* اختيار إجابة */
      root.querySelectorAll(".quiz-option").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var pick = Number(btn.dataset.i);
          if (exam) {
            answers[current] = answers[current] === pick ? null : pick;
            draw();
            return;
          }
          if (feedback[current]) return;
          feedback[current] = { pick: pick };
          answers[current] = pick;
          var ok = pick === q.answer;
          root.querySelectorAll(".quiz-option").forEach(function (b) {
            b.disabled = true;
            var bi = Number(b.dataset.i);
            if (bi === q.answer) {
              b.classList.add("correct");
              if (!b.querySelector(".opt-mark")) {
                b.insertAdjacentHTML("beforeend", ' <span class="opt-mark">✓</span>');
              }
            } else if (bi === pick) {
              b.classList.add("wrong");
              if (!b.querySelector(".opt-mark")) {
                b.insertAdjacentHTML("beforeend", ' <span class="opt-mark">✗</span>');
              }
            }
          });
          if (ok) { if (window.Sound) Sound.correct(); if (storageKey === "mistakes") removeMistake(q.raw); }
          else { if (window.Sound) Sound.wrong(); addMistake(q.raw); }
          document.getElementById("explainSlot").innerHTML =
            '<div class="quiz-explain ' + (ok ? "" : "bad") + '"><strong>' +
            (ok ? "إجابة صحيحة!" : "إجابة خاطئة.") + "</strong>" +
            (q.explanation ? " — " + esc(q.explanation) : "") + "</div>";
          var badges = root.querySelectorAll(".quiz-meta .badge");
          if (badges.length >= 2) {
            badges[1].textContent = "أجبت على " + answeredCount();
          }
          var progSpan = root.querySelector(".q-progress > span");
          if (progSpan) {
            progSpan.style.width = (answeredCount() / total * 100) + "%";
          }
          var nextQ = document.getElementById("nextQ");
          if (nextQ) nextQ.disabled = false;
        });
      });

      /* تنقل */
      var prev = document.getElementById("prevQ");
      if (prev) prev.addEventListener("click", function () { if (current > 0) { current--; draw(); } });
      var next2 = document.getElementById("nextQ2");
      if (next2) next2.addEventListener("click", function () { if (current < total - 1) { current++; draw(); } });
      var next = document.getElementById("nextQ");
      if (next) next.addEventListener("click", function () {
        if (current === total - 1) { finish(false); return; }
        current++; draw();
      });
      var fin = document.getElementById("finishQ");
      if (fin) fin.addEventListener("click", function () {
        confirmFinish(answeredCount(), total, function () { finish(false); });
      });

      /* لوحة الامتحان */
      root.querySelectorAll(".pal-cell").forEach(function (c) {
        c.addEventListener("click", function () {
          current = Number(c.dataset.go);
          draw();
        });
      });

      if (exam) startTimer();
    }

    function finish(auto) {
      stopTimer();
      var correct = 0, wrong = 0, skipped = 0;
      qs.forEach(function (q, i) {
        if (answers[i] === null || answers[i] === undefined) skipped++;
        else if (answers[i] === q.answer) correct++;
        else wrong++;
      });
      var score = correct;
      saveResult(storageKey, score, total);
      if (window.Sound) { (score / total >= 0.5 ? Sound.correct() : Sound.wrong()); }
      renderResult({
        title: title + (auto ? " (انتهى الوقت)" : ""),
        score: score, total: total,
        correct: correct, wrong: wrong, skipped: skipped,
        qs: qs, answers: answers,
        storageKey: storageKey, backLink: backLink,
        exam: exam,
        retryFn: opts.retry || function () { runQuiz(title, questions, storageKey, backLink, opts); }
      });
    }

    draw();
  }

  function loadLessonQuestions(lid) {
    return loadLesson(lid).then(function (d) {
      var qs = [];
      d.sections.forEach(function (s) {
        if (s.type === "review") s.items.forEach(function (it) { if (it.options) qs.push(it); });
      });
      return qs;
    });
  }

  function loadAllQuestions() {
    return loadData().then(function (data) {
      var all = [];
      var chain = Promise.resolve();
      data.chapters.forEach(function (ch) {
        ch.lessons.forEach(function (lesson) {
          chain = chain.then(function () {
            return loadLessonQuestions(lesson.id).then(function (qs) {
              qs.forEach(function (q) { q.lesson = lesson.id; });
              all = all.concat(qs);
            });
          });
        });
      });
      return chain.then(function () { return all; });
    });
  }

  /* ============ التهيئة حسب النمط ============ */
  var params = new URLSearchParams(location.search);

  if (params.get("mode") === "exam") {
    document.title = "وضع الامتحان — افهمها";
    root.innerHTML = '<p class="muted">جارٍ تجهيز الامتحان…</p>';
    loadAllQuestions().then(function (all) {
      var picked = shuffle(all).slice(0, 10);
      if (picked.length < 10) throw new Error("empty");
      runQuiz("وضع الامتحان (10 أسئلة × 10 دقائق)", picked, "exam", "quiz.html", { exam: true });
    }).catch(function () { root.innerHTML = '<p class="muted">تعذر تحميل بنك الأسئلة.</p>'; });
    return;
  }

  if (params.get("mode") === "mistakes") {
    document.title = "مراجعة أخطائي — افهمها";
    var mlist = readMistakes();
    if (!mlist.length) {
      root.innerHTML = '<div class="lesson-error"><h2>لا توجد أخطاء مسجلة</h2>' +
        '<p class="muted">عند الإجابة خطأ في أي اختبار، تُحفظ الأسئلة هنا تلقائيًا لمراجعتها لاحقًا.</p>' +
        '<p style="margin-top:1rem"><a class="btn" href="quiz.html">العودة إلى الاختبارات</a></p></div>';
      return;
    }
    runQuiz("مراجعة أخطائي (" + mlist.length + " سؤالًا)", mlist, "mistakes", "quiz.html");
    return;
  }

  if (params.get("mode") === "practice") {
    document.title = "تدريب عشوائي — افهمها";
    loadAllQuestions().then(function (all) {
      var picked = shuffle(all).slice(0, 10);
      if (!picked.length) throw new Error("empty");
      runQuiz("تدريب عشوائي من بنك الأسئلة", picked, "practice", "chapters.html");
    }).catch(function () { root.innerHTML = '<p class="muted">تعذر تحميل بنك الأسئلة.</p>'; });
    return;
  }

  var lessonId = params.get("lesson");
  var chapterId = params.get("chapter");

  if (lessonId) {
    loadLesson(lessonId).then(function (d) {
      document.title = "اختبار: " + d.title + " — افهمها";
      var qs = [];
      d.sections.forEach(function (s) {
        if (s.type === "review") s.items.forEach(function (it) { if (it.options) { it.lesson = lessonId; qs.push(it); } });
      });
      if (!qs.length) throw new Error("no questions");
      runQuiz("اختبار درس: " + d.title, qs, "lesson-" + lessonId, "lesson.html?id=" + lessonId);
    }).catch(function () {
      root.innerHTML = '<div class="lesson-error"><h2>تعذر تحميل الاختبار</h2><p class="muted">الدرس غير موجود أو لا يحتوي أسئلة.</p><p style="margin-top:1rem"><a class="btn" href="chapters.html">العودة</a></p></div>';
    });
    return;
  }

  if (chapterId) {
    fetch("data/quizzes/chapter-" + chapterId + "-quiz.json")
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (d) {
        document.title = "الاختبار الشامل: الفصل " + chapterId + " — افهمها";
        runQuiz("الاختبار الشامل — الفصل " + chapterId, d.questions, "chapter-" + chapterId, "chapter.html?id=" + chapterId);
      })
      .catch(function () {
        root.innerHTML = '<div class="lesson-error"><h2>تعذر تحميل الاختبار</h2><p style="margin-top:1rem"><a class="btn" href="chapters.html">العودة</a></p></div>';
      });
    return;
  }

  /* قائمة الاختبارات */
  loadData().then(function (data) {
    document.title = "الاختبارات — افهمها";
    var html = '<h1 style="font-size:1.7rem;margin-bottom:.4rem">الاختبارات</h1>' +
      '<p class="muted" style="margin-bottom:1.4rem">اختبر نفسك في أي درس، أو جرّب تدريبًا عشوائيًا، أو ادخل وضع الامتحان.</p>' +
      '<div class="cards-grid">';
    data.chapters.forEach(function (ch) {
      html += '<article class="chapter-card">' +
        '<div class="card-top"><div class="chapter-num">' + ch.id + "</div></div>" +
        "<h3>" + esc(ch.title) + "</h3>" +
        '<p class="muted small">' + ch.lessons.length + ' دروس</p>' +
        '<div class="card-footer" style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem">' +
          '<a class="btn btn-sm" href="quiz.html?chapter=' + ch.id + '">اختبار الفصل الشامل</a>' +
        "</div>" +
        '<div style="display:flex;flex-direction:column;gap:.4rem;margin-top:.8rem">';
      ch.lessons.forEach(function (lesson) {
        html += '<a class="btn btn-outline btn-sm" href="quiz.html?lesson=' + lesson.id + '">اختبار: ' + esc(lesson.title) + "</a>";
      });
      html += "</div></article>";
    });
    html += "</div>" +
      '<div style="margin-top:1.4rem;display:flex;gap:.8rem;flex-wrap:wrap">' +
      '<a class="btn" href="quiz.html?mode=exam">وضع الامتحان (10 أسئلة × 10 دقائق)</a>' +
      '<a class="btn btn-outline" href="quiz.html?mode=practice">تدريب عشوائي من كل الأسئلة</a>' +
      '<a class="btn ' + (readMistakes().length ? "" : "btn-ghost") + '" href="quiz.html?mode=mistakes">مراجعة أخطائي' +
      (readMistakes().length ? " (" + readMistakes().length + ")" : "") + "</a>" +
      "</div>";
    root.innerHTML = html;
  }).catch(function () {
    root.innerHTML = '<p class="muted">تعذر تحميل بيانات المنهج.</p>';
  });
})();
