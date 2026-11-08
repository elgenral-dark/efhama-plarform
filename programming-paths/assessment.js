(() => {
  const root = document.querySelector("[data-assessment-root]");
  const params = new URLSearchParams(location.search);
  const slug = params.get("slug") || "python";
  const assessmentId = params.get("assessment") || "";
  const draftPrefix = `efhama_assessment_draft_${slug}_`;
  const typeNames = {
    lesson: "اختبار درس",
    unit: "اختبار وحدة",
    path: "اختبار شامل",
    "multiple-choice": "اختيار من متعدد",
    "true-false": "صح أو خطأ",
    "code-output": "توقع ناتج الكود",
    "code-completion": "إكمال الكود",
    "find-error": "اكتشاف الخطأ",
    "practical-coding": "تطبيق عملي"
  };
  let assessment;
  let session;
  let questions = [];
  let answers = {};
  let current = 0;
  let pendingSaves = new Set();
  let activeEditor;
  let saveTimer;
  let submitPending = false;
  let timerInterval;

  const escapeHtml = (value = "") => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const api = async (url, method = "GET", body) => {
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
    return data;
  };

  const pathUrl = `path.html?slug=${encodeURIComponent(slug)}`;
  document.querySelector("[data-path-link]").href = pathUrl;
  document.querySelector("[data-back-link]").href = pathUrl;

  const readDraft = () => {
    try { return JSON.parse(localStorage.getItem(`${draftPrefix}${session?.sessionId}`) || "{}"); }
    catch (error) {
      console.error("Unable to read assessment answer backup:", error);
      return {};
    }
  };

  const writeDraft = () => {
    try { localStorage.setItem(`${draftPrefix}${session.sessionId}`, JSON.stringify(answers)); }
    catch (error) {
      console.error("Unable to back up assessment answers locally:", error);
      setSaveStatus("تعذر حفظ نسخة احتياطية على هذا الجهاز.", "error");
    }
  };

  const setSaveStatus = (text, state = "") => {
    const status = root.querySelector("[data-save-status]");
    if (status) {
      status.textContent = text;
      status.dataset.state = state;
    }
  };

  const saveAnswer = (questionId, answer) => {
    if (!session || session.status !== "active") return Promise.resolve(false);
    answers[questionId] = answer;
    writeDraft();
    setSaveStatus("جارٍ حفظ الإجابة على الخادم...");
    const task = api(`/api/assessments/sessions/${encodeURIComponent(session.sessionId)}/answers`, "PUT", {
      questionId,
      answer
    }).then(() => {
      setSaveStatus("تم حفظ الإجابة تلقائيًا.", "success");
      return true;
    }).catch((error) => {
      console.error("Unable to save assessment answer:", error);
      setSaveStatus("تعذر الحفظ على الخادم؛ بقيت الإجابة محفوظة محليًا وستُعاد المحاولة عند عودة الاتصال.", "error");
      return false;
    }).finally(() => pendingSaves.delete(task));
    pendingSaves.add(task);
    return task;
  };

  const flushEditor = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (activeEditor) {
      const question = questions[current];
      if (question?.responseType === "code") return saveAnswer(question.id, activeEditor.value);
    }
    return Promise.resolve(true);
  };

  const retryPendingSaves = async () => {
    const pending = Object.entries(readDraft()).filter(([id, value]) => answers[id] === value);
    for (const [questionId, answer] of pending) {
      if (session?.status !== "active") break;
      await saveAnswer(questionId, answer);
    }
  };

  const renderDirectory = (assessments) => {
    const groups = [
      ["lesson", "اختبارات الدروس"],
      ["unit", "اختبارات الوحدات"],
      ["path", "الاختبار الشامل للمسار"]
    ];
    root.innerHTML = `
      <div class="assessment-directory">
        <p class="assessment-notice">تقييمات تعليمية لمساعدتك على تحديد ما أتقنته وما يحتاج إلى مراجعة. لا تمثل شهادة رسمية.</p>
        ${groups.map(([kind, title]) => {
          const items = assessments.filter((item) => item.kind === kind);
          if (!items.length) return "";
          return `<section class="assessment-group"><h2>${title}</h2><div class="assessment-grid">${items.map(renderAssessmentCard).join("")}</div></section>`;
        }).join("")}
      </div>`;
  };

  const renderAssessmentCard = (item) => {
    const href = `assessment.html?slug=${encodeURIComponent(slug)}&assessment=${encodeURIComponent(item.id)}`;
    const attempts = (item.history || []).map((attempt) =>
      `<li>${attempt.percent}% • ${new Date(attempt.completedAt).toLocaleDateString("ar-EG")}${attempt.passed ? " • ناجح" : ""}</li>`
    ).join("");
    const buttonText = item.activeSessionId ? "استكمال الاختبار المحفوظ" : "فتح الاختبار";
    return `<article class="assessment-card">
      <div class="assessment-card-meta"><span class="assessment-kind">${escapeHtml(typeNames[item.kind])}</span><span>${escapeHtml(item.difficulty)}</span></div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description)}</p>
      <div class="assessment-card-stats"><span>${item.questionCount} سؤال</span><span>${Math.ceil(item.timeLimitSeconds / 60)} دقائق</span><span>النجاح ${item.passPercent}%</span></div>
      <div class="assessment-card-best">${item.bestScore === 0 && !item.attempts ? "لم تبدأ بعد" : `أفضل نتيجة: ${item.bestScore}%`} • المحاولات: ${item.attempts}</div>
      ${attempts ? `<details><summary>النتائج السابقة</summary><ul>${attempts}</ul></details>` : ""}
      <a class="primary-btn" href="${href}">${buttonText}</a>
    </article>`;
  };

  const renderIntro = (item) => {
    root.innerHTML = `<article class="assessment-intro">
      <span class="assessment-kind">${escapeHtml(typeNames[item.kind])} • ${escapeHtml(item.difficulty)}</span>
      <h2>${escapeHtml(item.title)}</h2>
      <p>${escapeHtml(item.description)}</p>
      <ul class="assessment-facts">
        <li><strong>${item.questionCount}</strong><span>سؤال</span></li>
        <li><strong>${Math.ceil(item.timeLimitSeconds / 60)}</strong><span>دقائق</span></li>
        <li><strong>${item.passPercent}%</strong><span>درجة النجاح</span></li>
      </ul>
      <p class="assessment-instructions">${escapeHtml(item.instructions)}</p>
      <p class="assessment-notice">الأسئلة مرتبطة بدروس المسار. لا تظهر الإجابات الصحيحة أثناء الاختبار، وتُحفظ محاولاتك منفصلة. هذا تقييم تعليمي وليس شهادة رسمية.</p>
      <button class="primary-btn" type="button" data-start-assessment>${item.activeSessionId ? "استكمال الاختبار" : "بدء الاختبار"}</button>
      <a class="secondary-btn" href="${pathUrl}">العودة إلى المسار</a>
    </article>`;
    root.querySelector("[data-start-assessment]").addEventListener("click", async () => {
      try {
        if (item.activeSessionId) {
          const restored = await api(`/api/assessments/sessions/${encodeURIComponent(item.activeSessionId)}`);
          await openSession(restored);
        } else {
          await openSession(await api(`/api/assessments/${encodeURIComponent(item.id)}/start`, "POST", {}));
        }
      } catch (error) {
        console.error("Unable to start assessment:", error);
        root.innerHTML = `<p class="assessment-error" role="alert">${escapeHtml(error.message)} <button class="secondary-btn" data-retry>إعادة المحاولة</button></p>`;
        root.querySelector("[data-retry]").addEventListener("click", () => load());
      }
    });
  };

  const openSession = async (currentSession) => {
    session = currentSession;
    questions = currentSession.questions;
    answers = { ...(currentSession.answers || {}) };
    const localDraft = readDraft();
    for (const [questionId, answer] of Object.entries(localDraft)) {
      if (questions.some((question) => question.id === questionId)) answers[questionId] = answer;
    }
    current = Math.max(0, questions.findIndex((question) => !answers[question.id]));
    if (current < 0) current = 0;
    if (session.status === "submitted") {
      renderResult(session.result);
      return;
    }
    if (Date.now() >= session.assessment.expiresAt) {
      renderSession();
      await submit(true);
      return;
    }
    renderSession();
    await retryPendingSaves();
    startTimer();
  };

  const renderSession = () => {
    const question = questions[current];
    if (!question) throw new Error("لا يحتوي الاختبار على أسئلة.");
    const savedAnswer = answers[question.id];
    const input = question.responseType === "code"
      ? `<label class="assessment-code-label">${question.language === "html" ? "HTML" : question.language === "css" ? "CSS" : question.language.toUpperCase()}
          <textarea data-assessment-code dir="ltr" maxlength="6000" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off">${escapeHtml(savedAnswer ?? question.starterCode ?? "")}</textarea>
        </label><p class="assessment-code-note">يُقيّم الخادم الحل باختبارات مخفية، ولا تُنفّذ الشيفرة داخل صفحة الاختبار. الحد الأقصى 6000 حرف.</p>`
      : `<fieldset class="assessment-options"><legend class="sr-only">اختر الإجابة</legend>${question.options.map((option) => `
          <label class="assessment-option${savedAnswer === option.id ? " selected" : ""}">
            <input type="radio" name="assessment-answer" value="${escapeHtml(option.id)}" ${savedAnswer === option.id ? "checked" : ""}>
            <span class="assessment-option-marker"></span>
            <span class="${question.type === "code-completion" || question.type === "practical-coding" ? "assessment-option-code" : ""}">${escapeHtml(option.text)}</span>
          </label>`).join("")}</fieldset>`;

    root.innerHTML = `<section class="assessment-taking">
      <header class="assessment-taking-head">
        <div><span class="assessment-kind">${escapeHtml(typeNames[session.assessment.kind])}</span><h2>${escapeHtml(session.assessment.title)}</h2></div>
        <div class="assessment-timer" data-assessment-timer aria-live="polite"></div>
      </header>
      <div class="assessment-progress-label"><span>السؤال ${current + 1} من ${questions.length}</span><span>${Math.round(((current + 1) / questions.length) * 100)}%</span></div>
      <div class="assessment-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${questions.length}" aria-valuenow="${current + 1}"><span style="width:${((current + 1) / questions.length) * 100}%"></span></div>
      <nav class="assessment-question-nav" aria-label="التنقل بين الأسئلة">${questions.map((item, index) => `
        <button type="button" data-go-question="${index}" class="${index === current ? "current" : ""} ${answers[item.id] ? "answered" : ""}" aria-label="السؤال ${index + 1}${answers[item.id] ? " تمت الإجابة" : " بلا إجابة"}">${index + 1}</button>`).join("")}
      </nav>
      <article class="assessment-question">
        <div class="assessment-question-meta"><span>${escapeHtml(typeNames[question.type] || "سؤال")}</span><span>${escapeHtml(question.skill)}</span></div>
        <h3>${escapeHtml(question.prompt)}</h3>
        ${question.code ? `<pre class="assessment-code-block" dir="ltr"><code>${escapeHtml(question.code)}</code></pre>` : ""}
        ${input}
      </article>
      <div class="assessment-save-row"><span data-save-status role="status" aria-live="polite">إجاباتك محفوظة على الخادم تلقائيًا.</span><span>المسار التعليمي ليس شهادة رسمية.</span></div>
      <footer class="assessment-controls">
        <button type="button" class="secondary-btn" data-previous ${current === 0 ? "disabled" : ""}>السابق</button>
        <button type="button" class="secondary-btn" data-next ${current === questions.length - 1 ? "disabled" : ""}>التالي</button>
        <button type="button" class="primary-btn" data-submit-assessment>مراجعة وتسليم الاختبار</button>
      </footer>
    </section>`;

    activeEditor = root.querySelector("[data-assessment-code]");
    root.querySelectorAll("[data-go-question]").forEach((button) => {
      button.addEventListener("click", async () => {
        await flushEditor();
        current = Number(button.dataset.goQuestion);
        renderSession();
      });
    });
    root.querySelector("[data-previous]").addEventListener("click", async () => {
      await flushEditor();
      current = Math.max(0, current - 1);
      renderSession();
    });
    root.querySelector("[data-next]").addEventListener("click", async () => {
      await flushEditor();
      current = Math.min(questions.length - 1, current + 1);
      renderSession();
    });
    root.querySelector("[data-submit-assessment]").addEventListener("click", () => submit(false));
    root.querySelectorAll('input[name="assessment-answer"]').forEach((inputNode) => {
      inputNode.addEventListener("change", () => {
        const selected = root.querySelector('input[name="assessment-answer"]:checked');
        if (!selected) return;
        const questionNow = questions[current];
        saveAnswer(questionNow.id, selected.value);
        renderSession();
      });
    });
    if (activeEditor) activeEditor.addEventListener("input", () => {
      const editedQuestion = questions[current];
      answers[editedQuestion.id] = activeEditor.value;
      writeDraft();
      setSaveStatus("جارٍ حفظ التغييرات...");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveAnswer(editedQuestion.id, activeEditor.value), 400);
    });
    paintTimer();
  };

  const paintTimer = () => {
    const timer = root.querySelector("[data-assessment-timer]");
    if (!timer) return;
    const remaining = Math.max(0, Math.ceil((session.assessment.expiresAt - Date.now()) / 1000));
    timer.textContent = `الوقت المتبقي ${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
    timer.dataset.urgent = remaining <= 60 ? "true" : "false";
  };

  const startTimer = () => {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      paintTimer();
      if (Date.now() >= session.assessment.expiresAt) submit(true);
    }, 1000);
  };

  const submit = async (automatic) => {
    if (submitPending || session?.status !== "active") return;
    if (!automatic && !window.confirm("هل تريد تسليم الاختبار؟ ستُحسب الأسئلة غير المجابة ضمن النتيجة.")) return;
    submitPending = true;
    await flushEditor();
    await Promise.all([...pendingSaves]);
    setSaveStatus("جارٍ تصحيح الاختبار...");
    try {
      const response = await api(`/api/assessments/sessions/${encodeURIComponent(session.sessionId)}/submit`, "POST", {});
      clearInterval(timerInterval);
      session.status = "submitted";
      localStorage.removeItem(`${draftPrefix}${session.sessionId}`);
      if (response.result?.passed && window.EfhamaGamification) {
        window.EfhamaGamification.recordActivity("assessment", assessmentId);
      }
      renderResult(response.result, automatic);
    } catch (error) {
      console.error("Unable to submit assessment:", error);
      submitPending = false;
      setSaveStatus(`${error.message} بقيت الإجابات محفوظة؛ أعد المحاولة.`, "error");
    }
  };

  const renderResult = (result, automatic = false) => {
    if (!result) {
      root.innerHTML = `<p class="assessment-error" role="alert">تعذر تحميل نتيجة الاختبار. تحقق من اتصالك وأعد فتح الجلسة.</p>`;
      return;
    }
    const skillBars = result.skills.map((skill) => {
      const percent = skill.total ? Math.round((skill.correct / skill.total) * 100) : 0;
      return `<div class="assessment-skill-row">
        <div><span>${escapeHtml(skill.skill)}</span><strong>${percent}%</strong></div>
        <div class="assessment-skill-track"><span style="width:${percent}%"></span></div>
        <a href="${escapeHtml(skill.recommendation)}">${skill.mastered ? "راجع الدرس للتثبيت" : "مراجعة الدرس"}</a>
      </div>`;
    }).join("");
    const reviews = result.review.map((item, index) => `
      <details class="assessment-review-item ${item.passed ? "passed" : "missed"}">
        <summary><span>${index + 1}. ${escapeHtml(item.prompt)}</span><strong>${item.passed ? "صحيحة" : "تحتاج مراجعة"}</strong></summary>
        <p>إجابتك: ${escapeHtml(item.answer)}</p>
        ${item.correctAnswer ? `<p>الإجابة الصحيحة: <strong>${escapeHtml(item.correctAnswer)}</strong></p>` : ""}
        <p>${escapeHtml(item.explanation)}</p>
        <a href="${escapeHtml(item.recommendation)}">افتح درس ${escapeHtml(item.lessonTitle)}</a>
      </details>`).join("");
    root.innerHTML = `<section class="assessment-result">
      <div class="assessment-result-score" style="--score:${result.scorePercent}%"><strong>${result.scorePercent}%</strong><span>${result.passed ? "اجتزت الاختبار" : "حاول مرة أخرى بعد المراجعة"}</span></div>
      <p class="assessment-notice">${automatic ? "انتهى الوقت وسُلّمت إجاباتك المحفوظة تلقائيًا. " : ""}هذا تقييم تعليمي وليس شهادة رسمية.</p>
      <div class="assessment-result-stats">
        <div><strong>${result.score} / ${result.total}</strong><span>الدرجة</span></div>
        <div><strong>${result.correct}</strong><span>إجابات صحيحة</span></div>
        <div><strong>${result.wrong}</strong><span>تحتاج مراجعة</span></div>
      </div>
      <h2>المهارات</h2>
      <div class="assessment-skills">${skillBars}</div>
      <div class="assessment-skill-summary">
        <p><strong>مهارات أتقنتها:</strong> ${result.skillsMastered.length ? result.skillsMastered.map(escapeHtml).join("، ") : "واصل التدريب."}</p>
        <p><strong>مهارات للمراجعة:</strong> ${result.skillsToImprove.length ? result.skillsToImprove.map(escapeHtml).join("، ") : "لا توجد مهارات تحتاج مراجعة في هذه المحاولة."}</p>
      </div>
      ${result.recommendedLessons.length ? `<h2>دروس مقترحة للمراجعة</h2><ul class="assessment-recommendations">${result.recommendedLessons.map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a></li>`).join("")}</ul>` : ""}
      <details class="assessment-review"><summary>مراجعة الأسئلة بعد التسليم</summary>${reviews}</details>
      <div class="assessment-controls">
        <button type="button" class="primary-btn" data-retry-assessment>إعادة الاختبار</button>
        <a class="secondary-btn" href="${pathUrl}">العودة إلى المسار</a>
      </div>
    </section>`;
    root.querySelector("[data-retry-assessment]").addEventListener("click", async () => {
      try {
        const next = await api(`/api/assessments/${encodeURIComponent(assessmentId)}/start`, "POST", {});
        await openSession(next);
      } catch (error) {
        console.error("Unable to retry assessment:", error);
        root.insertAdjacentHTML("afterbegin", `<p class="assessment-error" role="alert">${escapeHtml(error.message)}</p>`);
      }
    });
  };

  const load = async () => {
    if (!["logic", "python", "html", "css", "javascript", "sql"].includes(slug)) {
      root.textContent = "المسار التعليمي غير صالح.";
      return;
    }
    try {
      const data = await api(`/api/assessments?slug=${encodeURIComponent(slug)}`);
      const assessments = data.assessments;
      if (!assessmentId) {
        renderDirectory(assessments);
        return;
      }
      assessment = assessments.find((item) => item.id === assessmentId);
      if (!assessment) {
        root.textContent = "الاختبار غير موجود في هذا المسار.";
        return;
      }
      document.title = `${assessment.title} — افهمها | efhamha`;
      if (assessment.activeSessionId) {
        await openSession(await api(`/api/assessments/sessions/${encodeURIComponent(assessment.activeSessionId)}`));
      } else {
        renderIntro(assessment);
      }
    } catch (error) {
      console.error("Unable to load assessments:", error);
      root.innerHTML = `<p class="assessment-error" role="alert">تعذر تحميل الاختبارات. ${escapeHtml(error.message)} <button class="secondary-btn" data-retry>إعادة المحاولة</button></p>`;
      root.querySelector("[data-retry]").addEventListener("click", load);
    }
  };

  window.addEventListener("online", retryPendingSaves);
  load();
})();
