(() => {
  if (typeof Auth !== "undefined" && !Auth.isLoggedIn()) {
    window.location.replace("../login.html?next=" + encodeURIComponent("programming-paths/achievements.html"));
    return;
  }
  const root = document.querySelector("[data-achievements-root]");
  const PATH_STATE_KEY = "efhama_programming_paths";
  const PROJECT_STATE_KEY = "efhama_projects_v1";
  const CHALLENGE_PREFIX = "efhama_challenge_";
  const TRACKS = [
    ["logic", "أساسيات البرمجة والمنطق"],
    ["python", "Python"],
    ["html", "HTML"],
    ["css", "CSS"],
    ["javascript", "JavaScript"],
    ["sql", "SQL وقواعد البيانات"]
  ];
  let latestRender = Promise.resolve();
  const themeButton = document.querySelector("[data-theme-toggle]");
  const applyTheme = (theme) => {
    document.body.dataset.theme = theme;
    if (themeButton) themeButton.textContent = theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن";
  };
  applyTheme(localStorage.getItem("efhama_theme") || "light");
  themeButton?.addEventListener("click", () => {
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("efhama_theme", next);
    applyTheme(next);
  });

  const escapeHtml = (value = "") => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  const readObject = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (error) {
      console.error(`تعذر قراءة ${key}:`, error);
      return {};
    }
  };

  const apiJson = async (url) => {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || `تعذر تحميل بيانات الإنجاز (${response.status}).`);
    return body;
  };

  const fetchCourse = async (slug) => {
    const response = await fetch(`../data/paths/${slug}.json`, { cache: "no-store" });
    if (!response.ok) throw new Error(`تعذر تحميل مسار ${slug} (${response.status}).`);
    return response.json();
  };

  const fetchAssessments = async (slug) => {
    try {
      const response = await apiJson(`/api/assessments?slug=${encodeURIComponent(slug)}`);
      return Array.isArray(response.assessments) ? response.assessments : [];
    } catch {
      return [];
    }
  };

  const unitsOf = (course) => (course.levels || []).map((unit, index) => ({
    id: unit.id || `${course.slug}-unit-${String(index + 1).padStart(2, "0")}`,
    lessons: unit.lessons || []
  }));

  const addReward = (type, id, timestamp) => window.EfhamaGamification.recordActivity(type, id, {
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    streak: false,
    silent: true
  });

  const render = async () => {
    try {
      const [courses, assessmentLists] = await Promise.all([
        Promise.all(TRACKS.map(async ([slug, title]) => {
          const course = await fetchCourse(slug);
          return { slug, title, course };
        })),
        Promise.all(TRACKS.map(([slug]) => fetchAssessments(slug).catch((error) => ({ error, slug }))))
      ]);
      const assessmentErrors = assessmentLists.filter((item) => !Array.isArray(item));
      const availableAssessments = assessmentLists.flatMap((item) => Array.isArray(item) ? item : []);
      const progress = readObject(PATH_STATE_KEY);
      const projects = readObject(PROJECT_STATE_KEY);
      const completedLessons = new Set();
      const completedChallenges = new Set();
      const completedProjects = [];
      const passedAssessments = [];
      const completedUnits = new Set();

      for (const { slug, course } of courses) {
        const done = new Set(Array.isArray(progress[slug]?.completed) ? progress[slug].completed : []);
        for (const lessonId of done) {
          completedLessons.add(`${slug}:${lessonId}`);
          addReward("lesson", `${slug}:${lessonId}`);
        }
        for (const unit of unitsOf(course)) {
          if (unit.lessons.length && unit.lessons.every((lesson) => done.has(lesson.id))) {
            const key = `${slug}:${unit.id}`;
            completedUnits.add(key);
            addReward("unit", key);
          }
        }
      }

      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && key.startsWith(CHALLENGE_PREFIX)) {
          try {
            const record = JSON.parse(localStorage.getItem(key) || "{}");
            if (record.completed === true) {
              const id = key.slice(CHALLENGE_PREFIX.length);
              completedChallenges.add(id);
              addReward("challenge", id, record.lastAttemptAt);
            }
          } catch (error) {
            console.error(`تعذر قراءة تقدم التحدي ${key}:`, error);
          }
        }
      }
      for (const [id, record] of Object.entries(projects)) {
        if (record && Number.isFinite(record.completedAt) && record.completedAt > 0) {
          completedProjects.push({ id, record });
          addReward("project", id, record.completedAt);
        }
      }
      for (const assessment of availableAssessments) {
        const passed = assessment.lastPassed === true
          || Number(assessment.bestScore) >= Number(assessment.passPercent)
          || (assessment.history || []).some((attempt) => attempt.passed === true);
        if (passed) {
          passedAssessments.push(assessment);
          addReward("assessment", assessment.id);
        }
      }

      const snapshot = window.EfhamaGamification.snapshot();
      if (completedLessons.size) window.EfhamaGamification.unlockBadge("first-lesson", Date.now(), true);
      if (completedChallenges.size) window.EfhamaGamification.unlockBadge("first-challenge", Date.now(), true);
      if (completedProjects.length) window.EfhamaGamification.unlockBadge("project-builder", Date.now(), true);
      if (snapshot.streak.best >= 7) window.EfhamaGamification.unlockBadge("consistent-learner", Date.now(), true);

      const foundationBadges = {
        python: "python-beginner",
        html: "web-explorer",
        css: "css-designer",
        javascript: "javascript-starter"
      };
      for (const [slug, badgeId] of Object.entries(foundationBadges)) {
        const course = courses.find((item) => item.slug === slug)?.course;
        const firstUnit = course && unitsOf(course)[0];
        if (firstUnit?.lessons.length && firstUnit.lessons.every((lesson) =>
          (progress[slug]?.completed || []).includes(lesson.id))) {
          window.EfhamaGamification.unlockBadge(badgeId, Date.now(), true);
        }
      }
      const updated = window.EfhamaGamification.snapshot();
      const earned = updated.badges;
      const allBadges = window.EfhamaGamification.config.badges;
      const badgeMarkup = allBadges.map((badge) => {
        const earnedAt = earned[badge.id];
        return `<article class="achievement-badge${earnedAt ? " is-earned" : " is-locked"}">
          <span class="achievement-icon" aria-hidden="true">${escapeHtml(badge.icon)}</span>
          <div><h3>${escapeHtml(badge.title)}</h3><p>${escapeHtml(badge.description)}</p>
          <small>شرط الحصول: ${escapeHtml(badge.requirement || badge.description)}</small>
          ${earnedAt ? `<small>تاريخ الحصول: ${new Date(earnedAt).toLocaleDateString("ar-EG")}</small>` : '<small>لم تُكتسب بعد</small>'}</div>
          <span class="achievement-badge-state">${earnedAt ? "مكتسبة" : "مقفلة"}</span>
        </article>`;
      }).join("");
      const maxStreak = Math.max(1, updated.streak.best);
      const trackMarkup = courses.map(({ slug, title, course }) => {
        const lessons = (course.levels || []).flatMap((unit) => unit.lessons || []);
        const completed = lessons.filter((lesson) => (progress[slug]?.completed || []).includes(lesson.id)).length;
        const percent = lessons.length ? Math.round(completed / lessons.length * 100) : 0;
        return `<article class="achievement-track">
          <div><h3>${escapeHtml(title)}</h3><strong>${percent}%</strong></div>
          <div class="achievement-track-bar" role="progressbar" aria-label="تقدم ${escapeHtml(title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>
          <small>${completed} من ${lessons.length} درس مكتمل</small>
        </article>`;
      }).join("");
      const encouragements = ["خطوة عملية اليوم تصنع فرقًا. اختر درسًا أو تحديًا وتابع تقدمك.", "التقدم الحقيقي يأتي من الفهم والتطبيق؛ واصل بوتيرتك.", "إنجازاتك تتراكم مع كل نشاط تعلم مكتمل."];
      const encouragement = encouragements[new Date().getDate() % encouragements.length];
      root.innerHTML = `<div class="gamification-dashboard">
        <p class="gamification-notice">المكافآت للتشجيع على التعلم والتطبيق؛ لا تُمنح عند فتح المحتوى. تُحفظ الإنجازات على هذا الجهاز والمتصفح، وقد تتغير عند مسح بياناته. النظام محلي من جهة المتصفح ولا يمنع التلاعب.</p>
        ${window.EfhamaGamification.getWarning() ? `<p class="gamification-data-warning" role="alert">${escapeHtml(window.EfhamaGamification.getWarning())}</p>` : ""}
        ${assessmentErrors.length ? `<p class="gamification-data-warning" role="status">تعذر تحميل بيانات الاختبارات لبعض المسارات (${assessmentErrors.map((item) => escapeHtml(item.slug)).join("، ")}). بقية الإحصاءات متاحة، وقد يكون عدد الاختبارات المجتازة غير مكتمل.</p>` : ""}
        <section class="achievement-hero" aria-label="ملخص المستوى">
          <div class="achievement-xp"><span>إجمالي XP</span><strong>${updated.xp.toLocaleString("ar-EG")}</strong></div>
          <div class="achievement-level"><span>مستواك الحالي</span><strong>${escapeHtml(updated.level.title)}</strong>
            ${updated.nextLevel ? `<div class="achievement-level-track" role="progressbar" aria-label="التقدم نحو المستوى التالي" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${updated.levelProgress}"><span style="width:${updated.levelProgress}%"></span></div><small>${Math.max(0, updated.nextLevel.minimumXp - updated.xp)} XP إلى ${escapeHtml(updated.nextLevel.title)}</small>` : "<small>وصلت إلى أعلى مستوى حاليًا.</small>"}
          </div>
          <div class="achievement-streak"><span aria-hidden="true">🔥</span><div><strong>${updated.streak.current}</strong><span>يوم متتالٍ</span><small>أفضل سلسلة: ${updated.streak.best} أيام</small></div></div>
        </section>
        <p class="gamification-encouragement">${encouragement}</p>
        <section class="achievement-stats" aria-label="إحصاءات التعلم">
          <article><strong>${completedLessons.size}</strong><span>درس مكتمل</span></article>
          <article><strong>${completedChallenges.size}</strong><span>تحدٍ محلول</span></article>
          <article><strong>${passedAssessments.length}${assessmentErrors.length ? "+" : ""}</strong><span>اختبار مجتاز</span></article>
          <article><strong>${completedProjects.length}</strong><span>مشروع مكتمل</span></article>
          <article><strong>${completedUnits.size}</strong><span>وحدة مكتملة</span></article>
        </section>
        <section class="achievement-section"><div class="section-head"><div><h2>الشارات</h2><p>${Object.keys(earned).length} من ${allBadges.length} شارة مكتسبة</p></div></div><div class="achievement-badges">${badgeMarkup}</div></section>
        <section class="achievement-section"><div class="section-head"><div><h2>تقدمك في المسارات</h2><p>يُحسب التقدم من الدروس التي حُددت مكتملة.</p></div></div><div class="achievement-tracks">${trackMarkup}</div></section>
        <details class="gamification-xp-settings"><summary>كيف تُحتسب النقاط؟</summary>
          <p>يمكن تعديل قيم النقاط وحدود المستويات في إعدادات النظام داخل <code>gamification-config.js</code>. القيمة الحالية لكل إنجاز تُسجل مرة واحدة، ولا تتغير بأثر رجعي عند تعديل الإعدادات.</p>
          <ul>${Object.entries(window.EfhamaGamification.config.xp).map(([type, value]) => `<li>${escapeHtml(type)}: ${value} XP</li>`).join("")}</ul>
        </details>
      </div>`;
    } catch (error) {
      console.error("Unable to load achievements dashboard:", error);
      root.innerHTML = `<p class="assessment-error" role="alert">تعذر تحميل لوحة الإنجازات. ${escapeHtml(error.message || "تحقق من اتصالك ثم أعد المحاولة.")} <button type="button" class="secondary-btn" data-achievements-retry>إعادة المحاولة</button></p>`;
      root.querySelector("[data-achievements-retry]").addEventListener("click", () => { latestRender = render(); });
    }
  };

  latestRender = render().then(() => {
    window.addEventListener("efhama-gamification-update", () => {
      if (document.visibilityState === "visible") latestRender = render();
    });
    window.addEventListener("storage", (event) => {
      if ([PATH_STATE_KEY, PROJECT_STATE_KEY, window.EfhamaGamification.STORAGE_KEY].includes(event.key)) {
        latestRender = render();
      }
    });
  });
})();
