(() => {
  const root = document.querySelector("[data-projects-root]");
  const STATE_KEY = "efhama_projects_v1";
  const PATH_STATE_KEY = "efhama_programming_paths";
  const RUBRIC_KEYS = new Set(["correctness", "requirements", "organization", "quality", "edgeCases"]);
  const levelNames = { beginner: "مبتدئ", intermediate: "متوسط", advanced: "متقدم" };
  const pathNames = {
    python: "Python",
    html: "HTML",
    css: "CSS",
    javascript: "JavaScript",
    web: "HTML + CSS + JavaScript"
  };
  let tracks = [];
  let projects = [];
  let pathData = {};
  let state = {};
  let selectedPath = "all";
  let selectedLevel = "all";
  let selectedStatus = "all";

  const escapeHtml = (value = "") => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  const readState = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
      return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch (error) {
      console.error("Unable to read project progress:", error);
      return {};
    }
  };

  const writeState = () => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
      const status = root.querySelector("[data-project-save-status]");
      if (status) {
        status.textContent = "تم حفظ تقدمك وكودك محليًا على هذا الجهاز.";
        status.dataset.state = "success";
      }
      return true;
    } catch (error) {
      console.error("Unable to save project progress:", error);
      const status = root.querySelector("[data-project-save-status]");
      if (status) {
        status.textContent = "تعذر الحفظ المحلي؛ تحقق من مساحة التخزين في المتصفح.";
        status.dataset.state = "error";
      }
      return false;
    }
  };

  const getProjectState = (project) => {
    const saved = state[project.id] && typeof state[project.id] === "object" ? state[project.id] : {};
    const rubric = saved.rubric && typeof saved.rubric === "object" && !Array.isArray(saved.rubric) ? saved.rubric : {};
    const normalized = {
      startedAt: Number.isFinite(saved.startedAt) && saved.startedAt > 0 ? saved.startedAt : null,
      phases: Array.isArray(saved.phases) ? saved.phases.slice(0, project.phases.length).map((value) => value === true) : [],
      tests: Array.isArray(saved.tests) ? saved.tests.slice(0, project.tests.length).map((value) => value === true) : [],
      rubric: Object.fromEntries(Object.entries(rubric).filter(([key, value]) => RUBRIC_KEYS.has(key) && Number.isInteger(value) && value >= 1 && value <= 4)),
      attempts: Number.isInteger(saved.attempts) && saved.attempts >= 0 ? saved.attempts : 0,
      score: Number.isFinite(saved.score) && saved.score >= 0 && saved.score <= 100 ? saved.score : null,
      completedAt: Number.isFinite(saved.completedAt) && saved.completedAt > 0 ? saved.completedAt : null,
      solutionUnlocked: saved.solutionUnlocked === true
    };
    state[project.id] = normalized;
    return normalized;
  };

  const statusOf = (project) => {
    const saved = getProjectState(project);
    if (saved.completedAt) return "completed";
    if (saved.startedAt) return "in-progress";
    return "not-started";
  };

  const statusText = (status) => ({
    "not-started": "لم يبدأ",
    "in-progress": "قيد التنفيذ",
    completed: "مكتمل"
  }[status]);

  const scoreOf = (project, saved = getProjectState(project)) => {
    const phaseScore = (saved.phases || []).filter(Boolean).length / project.phases.length;
    const testScore = (saved.tests || []).filter(Boolean).length / project.tests.length;
    const rubricValues = Object.values(saved.rubric || {}).filter((value) => Number.isInteger(value) && value >= 1 && value <= 4);
    const rubricScore = rubricValues.reduce((sum, value) => sum + value, 0) / (5 * 4);
    return Math.round((phaseScore * 30 + testScore * 30 + rubricScore * 40));
  };

  const progressOf = (project) => {
    if (statusOf(project) === "completed") return 100;
    const saved = getProjectState(project);
    const donePhases = (saved.phases || []).filter(Boolean).length;
    const doneTests = (saved.tests || []).filter(Boolean).length;
    const doneRubric = Object.keys(saved.rubric || {}).length;
    return Math.round(
      donePhases / project.phases.length * 30
      + doneTests / project.tests.length * 30
      + doneRubric / 5 * 40
    );
  };

  const lessonPath = (lessonId) => {
    if (lessonId.startsWith("python-")) return "python";
    if (lessonId.startsWith("html-")) return "html";
    if (lessonId.startsWith("css-")) return "css";
    if (lessonId.startsWith("js-")) return "javascript";
    if (lessonId.startsWith("logic-")) return "logic";
    return "logic";
  };

  const prerequisiteInfo = (lessonId) => {
    const slug = lessonPath(lessonId);
    const lesson = pathData[slug]?.levels?.flatMap((unit) => unit.lessons || []).find((item) => item.id === lessonId);
    let completed = false;
    try {
      const progress = JSON.parse(localStorage.getItem(PATH_STATE_KEY) || "{}");
      completed = (progress[slug]?.completed || []).includes(lessonId);
    } catch (error) {
      console.error("Unable to inspect lesson prerequisites:", error);
    }
    return { slug, lessonId, title: lesson?.title || lessonId, completed };
  };

  const formatDate = (timestamp) => new Date(timestamp).toLocaleDateString("ar-EG", {
    year: "numeric", month: "short", day: "numeric"
  });

  const cardMarkup = (project) => {
    const status = statusOf(project);
    const progress = progressOf(project);
    return `<article class="project-card">
      <div class="project-card-top"><span class="project-track">${escapeHtml(pathNames[project.track])}</span><span class="project-level level-${project.level}">${escapeHtml(levelNames[project.level])}</span></div>
      <h3>${escapeHtml(project.title)}</h3>
      <p>${escapeHtml(project.idea)}</p>
      <div class="project-card-meta"><span>${project.minutes} دقيقة</span><span>${project.skills.length} مهارات</span></div>
      <div class="project-card-status"><span class="project-status status-${status}">${statusText(status)}</span><strong>${progress}%</strong></div>
      <div class="project-progress" role="progressbar" aria-label="إنجاز ${escapeHtml(project.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
      <a class="primary-btn" href="projects.html?project=${encodeURIComponent(project.id)}">${status === "not-started" ? "عرض المشروع" : status === "completed" ? "استعراض الإنجاز" : "متابعة المشروع"}</a>
    </article>`;
  };

  const visibleProjects = () => projects.filter((project) =>
    (selectedPath === "all" || project.track === selectedPath)
    && (selectedLevel === "all" || project.level === selectedLevel)
    && (selectedStatus === "all" || statusOf(project) === selectedStatus)
  );

  const renderDirectory = () => {
    const visible = visibleProjects();
    const completed = projects.filter((project) => statusOf(project) === "completed");
    const earned = completed.length;
    root.innerHTML = `<section class="projects-directory">
      <div class="project-summary">
        <article><strong>${projects.length}</strong><span>مشروع متاح</span></article>
        <article><strong>${earned}</strong><span>إنجاز في معرضك</span></article>
        <article><strong>${projects.filter((project) => statusOf(project) === "in-progress").length}</strong><span>مشروع قيد التنفيذ</span></article>
      </div>
      <p class="project-guidance">اختر مشروعًا مناسبًا لمهاراتك. المتطلبات السابقة موضحة في صفحة كل مشروع، وحفظ الكود والتقدم محلي على هذا الجهاز.</p>
      <div class="project-filters" aria-label="تصفية المشروعات">
        <label>المسار<select data-filter-path><option value="all">كل المسارات</option>${tracks.map((track) => `<option value="${escapeHtml(track.slug)}" ${selectedPath === track.slug ? "selected" : ""}>${escapeHtml(track.title)}</option>`).join("")}</select></label>
        <label>المستوى<select data-filter-level><option value="all">كل المستويات</option>${Object.entries(levelNames).map(([level, title]) => `<option value="${level}" ${selectedLevel === level ? "selected" : ""}>${title}</option>`).join("")}</select></label>
        <label>الحالة<select data-filter-status><option value="all">كل الحالات</option><option value="not-started" ${selectedStatus === "not-started" ? "selected" : ""}>لم يبدأ</option><option value="in-progress" ${selectedStatus === "in-progress" ? "selected" : ""}>قيد التنفيذ</option><option value="completed" ${selectedStatus === "completed" ? "selected" : ""}>مكتمل</option></select></label>
      </div>
      ${visible.length ? `<div class="project-grid">${visible.map(cardMarkup).join("")}</div>` : '<p class="empty">لا توجد مشروعات تطابق عوامل التصفية.</p>'}
      <section class="project-portfolio" aria-labelledby="project-portfolio-title">
        <div class="section-head"><div><h2 id="project-portfolio-title">معرض إنجازاتك</h2><p>لا يظهر هنا إلا ما أنهيته وأكدت اختبار متطلباته وتقييمه.</p></div></div>
        ${completed.length ? `<div class="project-grid">${completed.map((project) => `<article class="project-card portfolio-card"><span class="project-status status-completed">مكتمل</span><h3>${escapeHtml(project.title)}</h3><p>${escapeHtml(pathNames[project.track])} • ${escapeHtml(levelNames[project.level])}</p><p>تاريخ الإنجاز: ${formatDate(getProjectState(project).completedAt)}</p><p>المهارات: ${project.skills.map(escapeHtml).join("، ")}</p><a class="secondary-btn" href="projects.html?project=${encodeURIComponent(project.id)}">عرض المشروع</a></article>`).join("")}</div>` : '<p class="empty">أنجز أول مشروع ليظهر هنا في معرضك.</p>'}
      </section>
    </section>`;
    root.querySelector("[data-filter-path]").addEventListener("change", (event) => { selectedPath = event.target.value; renderDirectory(); });
    root.querySelector("[data-filter-level]").addEventListener("change", (event) => { selectedLevel = event.target.value; renderDirectory(); });
    root.querySelector("[data-filter-status]").addEventListener("change", (event) => { selectedStatus = event.target.value; renderDirectory(); });
  };

  const editorMarkup = (project) => {
    const htmlCss = project.track === "html" || project.track === "css" || project.track === "web";
    const js = project.track === "javascript" || project.track === "web";
    const python = project.track === "python";
    const sections = [];
    if (python) {
      sections.push(window.EfhamaPythonPlayground.render({
        id: project.id, code: project.starter, title: project.title,
        instructions: project.goal, expectedOutput: project.tests.join(" • "),
        solution: { code: project.solution }
      }));
    }
    if (htmlCss) {
      const starter = typeof project.starter === "string" ? { html: project.starter, css: "" } : project.starter;
      const solution = typeof project.solution === "string" ? { html: project.solution, css: "" } : project.solution;
      sections.push(window.EfhamaHtmlCssPlayground.render({
        id: project.id, title: project.title, instructions: project.goal,
        html: starter.html || "", css: starter.css || "",
        expectedOutput: project.tests.join(" • "),
        solution: { html: solution.html || "", css: solution.css || "" }
      }));
    }
    if (js) {
      const starterCode = project.track === "web" ? project.starter.js : project.starter;
      const solutionCode = project.track === "web" ? project.solution.js : project.solution;
      sections.push(window.EfhamaJavaScriptPlayground.render({
        id: `${project.id}-javascript`, title: `${project.title} — JavaScript`,
        instructions: project.goal, code: starterCode || "",
        previewHtml: project.previewHtml || (project.track === "web" ? project.starter.html : ""),
        previewCss: project.previewCss || (project.track === "web" ? project.starter.css : ""),
        expectedOutput: project.tests.join(" • "),
        solution: { code: solutionCode || "" }
      }));
    }
    return `<section class="project-workspace"><h2>مساحة العمل</h2>
      ${project.track === "web" ? '<p class="project-guidance">محررا HTML/CSS وJavaScript يعرضان معاينتين معزولتين منفصلتين؛ انسخ البنية نفسها إلى معاينة JavaScript لاختبار DOM. لا يستطيع أي محرر الوصول إلى صفحة المنصة.</p>' : ""}
      ${sections.join("")}
      <p class="project-save-status" data-project-save-status role="status" aria-live="polite">يُحفظ تقدم المشروع محليًا على هذا الجهاز. الأكواد محفوظة بواسطة المحررات.</p>
    </section>`;
  };

  const renderDetail = (project) => {
    const saved = getProjectState(project);
    if (!saved.startedAt) {
      saved.startedAt = Date.now();
      state[project.id] = saved;
      writeState();
    }
    const prerequisites = project.prerequisites.map(prerequisiteInfo);
    const missing = prerequisites.filter((item) => !item.completed);
    root.innerHTML = `<article class="project-detail">
      <div class="project-detail-heading">
        <div><span class="project-track">${escapeHtml(pathNames[project.track])} • ${escapeHtml(levelNames[project.level])}</span><h2>${escapeHtml(project.title)}</h2><p>${escapeHtml(project.idea)}</p></div>
        <div class="project-detail-actions"><span class="project-status status-${statusOf(project)}">${statusText(statusOf(project))}</span><a class="secondary-btn" href="projects.html">كل المشروعات</a></div>
      </div>
      <div class="project-summary">
        <article><strong>${project.minutes}</strong><span>دقيقة متوقعة</span></article>
        <article><strong>${project.phases.length}</strong><span>مراحل التنفيذ</span></article>
        <article><strong>${progressOf(project)}%</strong><span>نسبة الإنجاز</span></article>
      </div>
      <section class="project-detail-card"><h3>الهدف التعليمي</h3><p>${escapeHtml(project.goal)}</p><h4>المهارات المستخدمة</h4><div class="project-skill-list">${project.skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join("")}</div></section>
      <section class="project-detail-card"><h3>المتطلبات السابقة</h3>
        ${prerequisites.length ? `<ul class="project-prerequisites">${prerequisites.map((item) => `<li><a href="lesson.html?slug=${encodeURIComponent(item.slug)}&lesson=${encodeURIComponent(item.lessonId)}">${escapeHtml(item.title)}</a><span class="project-prereq-state ${item.completed ? "done" : ""}">${item.completed ? "مكتمل" : "موصى به"}</span></li>`).join("")}</ul>` : "<p>لا توجد متطلبات سابقة لهذا المشروع.</p>"}
        ${missing.length ? `<p class="project-prerequisite-note">يمكنك البدء الآن، لكن يُنصح بمراجعة المتطلبات غير المكتملة أولًا.</p>` : ""}
      </section>
      <section class="project-detail-card"><h3>النتيجة المتوقعة</h3><p>${escapeHtml(project.expected || `${project.idea} ${project.goal}`)}</p><h4>خطوات التنفيذ والمطلوب</h4><ol class="project-phase-list">${project.phases.map((phase, index) => `<li><label><input type="checkbox" data-project-phase="${index}" ${saved.phases[index] ? "checked" : ""}><span><strong>المرحلة ${index + 1}</strong>${escapeHtml(phase)}</span></label></li>`).join("")}</ol>
        <h4>اختبارات عملية قبل التقييم</h4><p>شغّل الكود في المحرر أو عاين الصفحة، ثم أكد الحالات التي جرّبتها بنفسك.</p>
        <div class="project-test-list">${project.tests.map((test, index) => `<label><input type="checkbox" data-project-test="${index}" ${saved.tests[index] ? "checked" : ""}><span>${escapeHtml(test)}</span></label>`).join("")}</div>
      </section>
      ${editorMarkup(project)}
      <section class="project-detail-card project-rubric"><h3>تقييم المشروع</h3><p>تقييم ذاتي تعليمي، وليس تصحيحًا آليًا للكود. قيّم كل معيار بعد مراجعة التنفيذ والحالات التجريبية.</p>
        ${[
          ["correctness", "صحة التنفيذ", "هل يعمل السلوك الأساسي كما توقعت؟"],
          ["requirements", "تحقيق المتطلبات", "هل أكملت الوظائف المطلوبة في المراحل؟"],
          ["organization", "تنظيم الكود والمفاهيم", "هل الكود مقروء ويستخدم المفاهيم المناسبة؟"],
          ["quality", "جودة النتيجة", "هل النتيجة واضحة وسهلة الاستخدام؟"],
          ["edgeCases", "الحالات المختلفة", "هل جرّبت المدخلات والحالات غير المعتادة؟"]
        ].map(([key, title, description]) => `<label class="project-rubric-row"><span><strong>${title}</strong><small>${description}</small></span><select data-rubric="${key}" aria-label="تقييم ${title}"><option value="">قيّم من 1 إلى 4</option>${[1, 2, 3, 4].map((value) => `<option value="${value}" ${Number(saved.rubric[key]) === value ? "selected" : ""}>${value} من 4</option>`).join("")}</select></label>`).join("")}
        <div class="project-evaluation-row"><span>النتيجة الحالية: <strong data-project-score>${scoreOf(project, saved)}%</strong></span><span>المحاولات: <strong data-project-attempts>${saved.attempts || 0}</strong></span></div>
        <p data-project-feedback role="status" aria-live="polite"></p>
        <button type="button" class="primary-btn" data-evaluate-project>تقييم تقدمي</button>
      </section>
      <details class="project-hint"><summary>تلميح عند الحاجة</summary><p>${escapeHtml(project.hint)}</p></details>
      ${saved.solutionUnlocked ? `<details class="project-solution"><summary>عرض الحل النموذجي بعد المحاولة</summary><p>استخدمه للمقارنة والتعلم، ثم أعد بناء الحل بنفسك.</p><pre dir="ltr"><code>${escapeHtml(typeof project.solution === "string" ? project.solution : JSON.stringify(project.solution, null, 2))}</code></pre></details>` : '<p class="project-solution-locked">يظهر الحل النموذجي بعد أول محاولة تقييم، حتى تحصل على فرصة للتجربة.</p>'}
      <a class="secondary-btn project-back-link" href="projects.html">العودة إلى قائمة المشروعات</a>
    </article>`;

    window.EfhamaHtmlCssPlayground.initialize(root, "projects", project.id);
    window.EfhamaJavaScriptPlayground.initialize(root, "projects", project.id);
    window.EfhamaPythonPlayground.initialize(root, "projects", project.id);

    root.querySelectorAll("[data-project-phase], [data-project-test], [data-rubric]").forEach((input) => {
      input.addEventListener("change", () => {
        const current = getProjectState(project);
        if (input.hasAttribute("data-project-phase")) current.phases[Number(input.dataset.projectPhase)] = input.checked;
        if (input.hasAttribute("data-project-test")) current.tests[Number(input.dataset.projectTest)] = input.checked;
        if (input.hasAttribute("data-rubric")) {
          if (input.value) current.rubric[input.dataset.rubric] = Number(input.value);
          else delete current.rubric[input.dataset.rubric];
        }
        state[project.id] = current;
        root.querySelector("[data-project-score]").textContent = `${scoreOf(project, current)}%`;
        const progress = root.querySelector(".project-summary article:last-child strong");
        if (progress) progress.textContent = `${progressOf(project)}%`;
        writeState();
      });
    });

    root.querySelector("[data-evaluate-project]").addEventListener("click", () => {
      const current = getProjectState(project);
      current.attempts = (current.attempts || 0) + 1;
      current.solutionUnlocked = true;
      const allPhases = project.phases.every((_, index) => current.phases[index]);
      const allTests = project.tests.every((_, index) => current.tests[index]);
      const rubricComplete = ["correctness", "requirements", "organization", "quality", "edgeCases"]
        .every((key) => Number.isInteger(current.rubric[key]) && current.rubric[key] >= 1 && current.rubric[key] <= 4);
      const score = scoreOf(project, current);
      current.score = score;
      const feedback = root.querySelector("[data-project-feedback]");
      let firstCompletion = false;
      const previousCompletedAt = current.completedAt;
      if (!allPhases || !allTests || !rubricComplete || score < 70) {
        feedback.textContent = `أكمل المراحل والحالات التجريبية والتقييم الذاتي أولًا. نتيجتك الحالية ${score}%، والحد المطلوب 70%.`;
        feedback.dataset.state = "warning";
      } else {
        firstCompletion = !current.completedAt;
        current.completedAt = current.completedAt || Date.now();
        feedback.textContent = `أحسنت! أكملت المشروع بعد تجربة الحالات المطلوبة. نتيجتك الذاتية ${score}%.`;
        feedback.dataset.state = "success";
      }
      state[project.id] = current;
      const saved = writeState();
      if (!saved && firstCompletion) {
        current.completedAt = previousCompletedAt;
        state[project.id] = current;
      }
      if (saved && firstCompletion) {
        if (window.EfhamaGamification) {
          window.EfhamaGamification.recordActivity("project", project.id);
          window.EfhamaGamification.unlockBadge("project-builder");
        }
      }
      root.querySelector("[data-project-attempts]").textContent = current.attempts;
      const statusBadge = root.querySelector(".project-detail-actions .project-status");
      statusBadge.className = `project-status status-${statusOf(project)}`;
      statusBadge.textContent = statusText(statusOf(project));
      const progress = root.querySelector(".project-summary article:last-child strong");
      if (progress) progress.textContent = `${progressOf(project)}%`;
      if (current.solutionUnlocked) {
        const locked = root.querySelector(".project-solution-locked");
        if (locked) locked.outerHTML = `<details class="project-solution"><summary>عرض الحل النموذجي بعد المحاولة</summary><p>استخدمه للمقارنة والتعلم، ثم أعد بناء الحل بنفسك.</p><pre dir="ltr"><code>${escapeHtml(typeof project.solution === "string" ? project.solution : JSON.stringify(project.solution, null, 2))}</code></pre></details>`;
      }
    });
  };

  const load = async () => {
    try {
      const response = await fetch("../data/projects.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`تعذر تحميل كتالوج المشروعات (${response.status}).`);
      const catalog = await response.json();
      if (catalog.version !== 1 || !Array.isArray(catalog.tracks)) throw new Error("تنسيق كتالوج المشروعات غير صالح.");
      tracks = catalog.tracks;
      projects = tracks.flatMap((track) => track.projects.map((project) => ({ ...project, track: track.slug })));
      const pathResults = await Promise.all(tracks
        .filter((track) => track.slug !== "web")
        .map(async (track) => {
          const pathResponse = await fetch(`../data/paths/${track.slug}.json`, { cache: "no-store" });
          if (!pathResponse.ok) throw new Error(`تعذر تحميل متطلبات مسار ${track.slug}.`);
          return [track.slug, await pathResponse.json()];
        }));
      pathData = Object.fromEntries(pathResults);
      const logicResponse = await fetch("../data/paths/logic.json", { cache: "no-store" });
      if (logicResponse.ok) pathData.logic = await logicResponse.json();
      state = readState();
      const projectId = new URLSearchParams(location.search).get("project");
      const selectedProject = projects.find((project) => project.id === projectId);
      if (projectId && !selectedProject) {
        root.innerHTML = '<p class="assessment-error" role="alert">المشروع المطلوب غير موجود في الكتالوج.</p><a class="secondary-btn" href="projects.html">عرض كل المشروعات</a>';
        return;
      }
      const theme = localStorage.getItem("efhama_theme") || "light";
      document.body.dataset.theme = theme;
      const themeButton = document.querySelector("[data-theme-toggle]");
      if (themeButton) {
        themeButton.textContent = theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن";
        themeButton.addEventListener("click", () => {
          const next = document.body.dataset.theme === "dark" ? "light" : "dark";
          document.body.dataset.theme = next;
          localStorage.setItem("efhama_theme", next);
          themeButton.textContent = next === "dark" ? "الوضع الفاتح" : "الوضع الداكن";
        });
      }
      if (selectedProject) {
        document.title = `${selectedProject.title} — مشروعات افهمها | efhamha`;
        renderDetail(selectedProject);
      } else {
        renderDirectory();
      }
    } catch (error) {
      console.error("Unable to load projects:", error);
      root.innerHTML = `<p class="assessment-error" role="alert">${escapeHtml(error.message || "تعذر تحميل المشروعات.")}</p>`;
    }
  };

  load();
})();
