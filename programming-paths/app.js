const STORAGE_KEY = 'efhama_programming_paths';

const readState = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (error) {
    return {};
  }
};

const renderSymbolSvg = (shape, label) => {
  const text = escapeHtml(label || '');
  const common = `fill="var(--surface)" stroke="var(--primary)" stroke-width="3"`;
  if (shape === 'terminator') return `<ellipse cx="90" cy="50" rx="68" ry="28" ${common}/><text x="90" y="55" text-anchor="middle">${text}</text>`;
  if (shape === 'process') return `<rect x="25" y="22" width="130" height="56" rx="4" ${common}/><text x="90" y="55" text-anchor="middle">${text}</text>`;
  if (shape === 'input-output') return `<polygon points="42,22 160,22 138,78 20,78" ${common}/><text x="90" y="55" text-anchor="middle">${text}</text>`;
  if (shape === 'decision') return `<polygon points="90,12 158,50 90,88 22,50" ${common}/><text x="90" y="55" text-anchor="middle">${text}</text>`;
  if (shape === 'flow-line') return `<defs><marker id="symbol-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="var(--primary)"/></marker></defs><path d="M25 50 H150" stroke="var(--primary)" stroke-width="4" marker-end="url(#symbol-arrow)"/><text x="90" y="38" text-anchor="middle">${text}</text>`;
  if (shape === 'connector') return `<circle cx="90" cy="50" r="30" ${common}/><text x="90" y="56" text-anchor="middle">${text}</text>`;
  if (shape === 'predefined') return `<rect x="25" y="22" width="130" height="56" ${common}/><path d="M38 22 V78 M142 22 V78" stroke="var(--primary)" stroke-width="3"/><text x="90" y="55" text-anchor="middle">${text}</text>`;
  return `<path d="M25 22 H155 V65 Q140 82 125 65 Q110 82 95 65 Q80 82 65 65 Q50 82 25 65 Z" ${common}/><text x="90" y="48" text-anchor="middle">${text}</text>`;
};

const writeState = (value) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
};

const getPathState = (slug) => {
  const state = readState();
  if (!state[slug]) {
    state[slug] = { lastLesson: '', completed: [] };
    writeState(state);
  }
  const pathState = state[slug];
  if (slug === 'logic') {
    let migrated = false;
    const legacyLessonIds = { 'logic-20': '74192', '74193': '39521', '83520': '46281', '46282': '71539', '71540': '39417', '71541': '58326', '58327': '73821', '58328': '82537', '58329': '64182', '58330': '92571', '58331': '82635' };
    if (legacyLessonIds[pathState.lastLesson]) {
      pathState.lastLesson = legacyLessonIds[pathState.lastLesson];
      migrated = true;
    }
    if ((pathState.completed || []).some((id) => legacyLessonIds[id])) {
      pathState.completed = [...new Set(pathState.completed.map((id) => legacyLessonIds[id] || id))];
      migrated = true;
    }
    if (migrated) writeState(state);
  }
  return pathState;
};

const savePathState = (slug, nextState) => {
  const state = readState();
  state[slug] = nextState;
  writeState(state);
};

const getProgressPercent = (completed, total) => {
  if (!total) return 0;
  return Math.min(100, Math.max(0, Math.round((completed / total) * 100)));
};

const getAllLessons = (path) => {
  if ((path.levels || []).length) {
    return (path.levels || []).flatMap((level) => level.lessons || []);
  }
  return [];
};

const hasLessonLearningContent = (lesson) => (
  (lesson.content || []).some((block) => block.type !== 'diagram' && block.type !== 'visual')
  || ['examples', 'applications', 'exercises', 'challenges', 'projects']
    .some((key) => Array.isArray(lesson[key]) && lesson[key].length > 0)
);

const normalizePathData = (path) => {
  if (!path || typeof path.slug !== 'string' || !Array.isArray(path.levels)) {
    throw new Error('Invalid learning path structure');
  }

  const unitIds = new Set();
  const lessonIds = new Set();
  const lessonsInOrder = [];
  const levels = path.levels.map((level, unitIndex) => {
    const unitId = level.id || `${path.slug}-unit-${String(unitIndex + 1).padStart(2, '0')}`;
    if (unitIds.has(unitId)) throw new Error(`Duplicate unit id: ${unitId}`);
    unitIds.add(unitId);

    const lessons = (level.lessons || []).map((lesson, lessonIndex) => {
      if (!lesson || typeof lesson.id !== 'string' || !lesson.id) {
        throw new Error(`A lesson in ${unitId} is missing its id`);
      }
      if (lessonIds.has(lesson.id)) throw new Error(`Duplicate lesson id: ${lesson.id}`);
      lessonIds.add(lesson.id);

      const durationMatch = String(lesson.duration || '').match(/\d+/);
      const estimatedMinutes = Number(lesson.estimatedMinutes) > 0
        ? Number(lesson.estimatedMinutes)
        : durationMatch ? Number(durationMatch[0]) : null;
      const learningObjectives = Array.isArray(lesson.learningObjectives)
        ? lesson.learningObjectives
        : Array.isArray(lesson.objectives)
          ? lesson.objectives
          : lesson.summary ? [lesson.summary] : [];
      const hasAuthoredObjectives = Array.isArray(lesson.learningObjectives) || Array.isArray(lesson.objectives);
      const hasStandaloneDetail = (path.lessonDetailFiles || []).includes(lesson.id);
      const normalizedLesson = {
        ...lesson,
        unitId,
        unitName: level.name,
        unitOrder: unitIndex + 1,
        order: lessonIndex + 1,
        courseOrder: lessonsInOrder.length + 1,
        difficulty: lesson.difficulty || path.difficulty || path.level || 'مبتدئ',
        estimatedMinutes,
        learningObjectives,
        hasAuthoredObjectives,
        prerequisites: Array.isArray(lesson.prerequisites)
          ? lesson.prerequisites
          : Array.isArray(lesson.prerequisiteIds) ? lesson.prerequisiteIds : [],
        contentStatus: lesson.contentStatus || (hasStandaloneDetail || hasLessonLearningContent(lesson) ? 'complete' : 'outline')
      };
      lessonsInOrder.push(normalizedLesson);
      return normalizedLesson;
    });

    return {
      ...level,
      id: unitId,
      order: unitIndex + 1,
      lessons
    };
  });

  lessonsInOrder.forEach((lesson, index) => {
    lesson.previousLessonId = lessonsInOrder[index - 1]?.id || null;
    lesson.nextLessonId = lessonsInOrder[index + 1]?.id || null;
  });

  return { ...path, levels };
};

const getPathProgress = (path) => {
  const allLessons = getAllLessons(path);
  const state = getPathState(path.slug);
  const completedCount = allLessons.filter((lesson) => (state.completed || []).includes(lesson.id)).length;
  return {
    completedCount,
    total: allLessons.length,
    percent: getProgressPercent(completedCount, allLessons.length),
    lastLesson: state.lastLesson || (allLessons[0] ? allLessons[0].id : '')
  };
};

const getPathTitle = (path) => path.titleAr || path.title;

const formatLessonCount = (count) => `${count} ${count === 1 ? 'درس' : 'دروس'}`;

const getLevelCode = (path, difficulty) => path.levelCode || ({
  'مبتدئ': 'Beginner',
  'متوسط': 'Intermediate',
  'متقدم': 'Advanced'
}[difficulty] || 'Beginner');

const updatePathOverviewStats = (paths) => {
  const totalLessons = paths.reduce((sum, item) => sum + item.lessons.length, 0);
  const completedLessons = paths.reduce((sum, item) => sum + item.progress.completedCount, 0);
  const activePaths = paths.filter((item) => {
    const state = getPathState(item.path.slug);
    return state.lastLesson || (state.completed || []).length > 0;
  }).length;
  const stats = {
    '[data-path-count]': paths.length,
    '[data-lesson-count]': totalLessons,
    '[data-average-progress]': getProgressPercent(completedLessons, totalLessons) + '%',
    '[data-active-paths]': activePaths
  };

  Object.entries(stats).forEach(([selector, value]) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  });
};

const setLessonCompletion = (slug, lessonId, markComplete) => {
  const state = getPathState(slug);
  const completed = new Set(state.completed || []);
  if (markComplete) completed.add(lessonId);
  else completed.delete(lessonId);
  state.completed = [...completed];
  if (lessonId) state.lastLesson = lessonId;
  savePathState(slug, state);
};

const openLesson = (slug, lessonId) => {
  const state = getPathState(slug);
  state.lastLesson = lessonId;
  savePathState(slug, state);
  window.location.href = `lesson.html?slug=${slug}&lesson=${encodeURIComponent(lessonId)}`;
};

const loadSummaryPaths = async () => {
  const response = await fetch('../data/programming-paths.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load path list');
  return response.json();
};

const loadPathDetail = async (slug) => {
  const response = await fetch(`../data/paths/${slug}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load path details');
  return normalizePathData(await response.json());
};

const renderCards = async () => {
  const paths = await loadSummaryPaths();
  const root = document.querySelector('[data-path-root]');
  if (!root) return;

  const pathDetails = await Promise.all(paths.map(async (path) => {
    const detail = await loadPathDetail(path.slug);
    const lessons = getAllLessons(detail);
    const progress = getPathProgress({ ...detail, slug: path.slug });
    return { path, detail, lessons, progress };
  }));
  updatePathOverviewStats(pathDetails);

  root.innerHTML = pathDetails.map(({ path, detail, lessons, progress }) => {
    const difficulty = detail.difficulty || detail.level || path.difficulty || path.level || 'مبتدئ';
    const levelCode = getLevelCode(detail, difficulty);
    const accent = /^#[\da-f]{6}$/i.test(path.accentColor || '') ? path.accentColor : '#3C4AE8';
    const title = getPathTitle(path);
    const englishTitle = path.titleEn || detail.titleEn || '';
    return `
      <article class="path-card" style="--path-accent:${accent}">
        <div class="card-top">
          <div class="path-icon" aria-hidden="true">${escapeHtml(path.icon || detail.icon || '')}</div>
          <span class="card-tag">${escapeHtml(path.tag || path.title)}</span>
        </div>
        <h3>${escapeHtml(title)}${englishTitle ? `<span class="path-title-en" dir="ltr">${escapeHtml(englishTitle)}</span>` : ''}</h3>
        <p>${escapeHtml(path.description || detail.description || '')}</p>
        <div class="path-meta">
          <span>المستوى: ${escapeHtml(difficulty)} <bdi dir="ltr">(${levelCode})</bdi></span>
          <span>${detail.levels.length} وحدات • ${formatLessonCount(lessons.length)}</span>
        </div>
        <div class="path-progress" aria-label="التقدم">
          <span style="width:${progress.percent}%"></span>
        </div>
        <div class="progress-label">
          <span>التقدم</span>
          <span>${progress.percent ? `${progress.percent}%` : 'لم يبدأ بعد'}</span>
        </div>
        <div class="card-actions">
          <button class="link-btn" type="button" data-open-path="${escapeHtml(path.slug)}">ابدأ التعلم</button>
          <button class="ghost-btn" type="button" data-preview-path="${escapeHtml(path.slug)}" aria-label="معاينة المسار">⟶</button>
        </div>
      </article>
    `;
  }).join('');

  root.querySelectorAll('[data-open-path]').forEach((button) => {
    button.addEventListener('click', () => {
      window.location.href = `path.html?slug=${button.dataset.openPath}`;
    });
  });

  root.querySelectorAll('[data-preview-path]').forEach((button) => {
    button.addEventListener('click', () => {
      window.location.href = `path.html?slug=${button.dataset.previewPath}`;
    });
  });
};

const getLessonStatus = (slug, lessonId, flatLessons) => {
  const state = getPathState(slug);
  const completed = new Set(state.completed || []);
  const lastLesson = state.lastLesson || (flatLessons[0] ? flatLessons[0].id : '');
  const idx = flatLessons.findIndex((item) => item.id === lessonId);
  const lastIdx = flatLessons.findIndex((item) => item.id === lastLesson);

  if (completed.has(lessonId)) return 'مكتمل';
  if (lastLesson && (lessonId === lastLesson || (lastIdx >= 0 && idx <= lastIdx))) return 'قيد الدراسة';
  return 'لم يبدأ';
};

const renderPathDetail = async () => {
  const slug = new URLSearchParams(window.location.search).get('slug') || 'logic';
  const detail = await loadPathDetail(slug);
  const state = getPathState(slug);
  const flatLessons = getAllLessons(detail);
  const progress = getPathProgress(detail);
  const title = getPathTitle(detail);

  document.title = `${title} — افهمها | efhamha`;

  const titleNode = document.querySelector('[data-path-title]');
  const descNode = document.querySelector('[data-path-description]');
  const badgeNode = document.querySelector('[data-path-badge]');
  const summaryNode = document.querySelector('[data-path-summary]');
  const levelRoot = document.querySelector('[data-levels-root]');
  const continueBtn = document.querySelector('[data-continue-btn]');
  const difficulty = detail.difficulty || detail.level || 'مبتدئ';
  const totalLessons = flatLessons.length;
  const levelCode = getLevelCode(detail, difficulty);
  const detailedLessons = flatLessons.filter((lesson) => lesson.contentStatus === 'complete').length;

  if (titleNode) titleNode.textContent = title;
  if (descNode) descNode.textContent = detail.description;
  if (badgeNode) badgeNode.textContent = `${difficulty} (${levelCode}) • ${detail.levels.length} وحدات • ${formatLessonCount(totalLessons)}`;

  if (summaryNode) {
    summaryNode.innerHTML = `
      <div class="summary-pill"><strong>${escapeHtml(detail.icon || '◎')}</strong> ${escapeHtml(title)}${detail.titleEn ? ` <span dir="ltr">${escapeHtml(detail.titleEn)}</span>` : ''}</div>
      <div class="summary-pill">المستوى: ${escapeHtml(difficulty)} <bdi dir="ltr">(${levelCode})</bdi></div>
      <div class="summary-pill">الوحدات: ${detail.levels.length}</div>
      <div class="summary-pill">إجمالي الدروس: ${formatLessonCount(totalLessons)}</div>
      <div class="summary-pill">الشرح التفصيلي: ${detailedLessons} من ${totalLessons}</div>
      <div class="summary-pill">التقدم: ${progress.percent}%</div>
    `;
  }

  if (continueBtn) {
    const lessonId = state.lastLesson || (flatLessons[0] ? flatLessons[0].id : '');
    continueBtn.innerHTML = lessonId ? 'استكمال التعلم' : 'ابدأ التعلم';
    continueBtn.onclick = () => {
      if (lessonId) {
        openLesson(slug, lessonId);
      } else if (flatLessons[0]) {
        openLesson(slug, flatLessons[0].id);
      }
    };
  }

  if (!levelRoot) return;

  const finalAssessmentHref = `assessment.html?slug=${encodeURIComponent(slug)}&assessment=${encodeURIComponent(`${slug}:path:final`)}`;
  levelRoot.innerHTML = `<section class="path-final-assessment">
      <div><span class="assessment-kind">تقييم شامل للمسار</span><h2>اختبر مهاراتك في ${escapeHtml(title)}</h2>
      <p>اختبار ختامي من أسئلة الدروس والتطبيقات، مع نتيجة تفصيلية وتوصيات للمراجعة.</p></div>
      <a class="primary-btn" href="${finalAssessmentHref}">عرض الاختبار الشامل</a>
    </section>` + (detail.levels || []).map((level) => {
    const levelLessons = level.lessons || [];
    const levelCompleted = levelLessons.filter((lesson) => (state.completed || []).includes(lesson.id)).length;
    const levelPercent = getProgressPercent(levelCompleted, levelLessons.length);

    return `
      <section class="level-card" data-unit-id="${escapeHtml(level.id)}">
        <div class="level-header">
          <div>
            <p class="level-label">الوحدة ${String(level.order).padStart(2, '0')}</p>
            <h3>${escapeHtml(level.name)}</h3>
          </div>
          <div class="level-score">${levelPercent}%</div>
        </div>
          <p class="level-description">${escapeHtml(level.description)}</p>
        <div class="level-meta">
            <span>${formatLessonCount(levelLessons.length)}</span>
          <span>إنجاز ${levelPercent}%</span>
        </div>
        <div class="level-progress"><span style="width:${levelPercent}%"></span></div>
        <div class="unit-assessment-link">
          <a class="secondary-btn" href="assessment.html?slug=${encodeURIComponent(slug)}&assessment=${encodeURIComponent(`${slug}:unit:${level.id}`)}">اختبار الوحدة • ${levelLessons.length} درس</a>
        </div>
        <div class="lesson-stack">
          ${levelLessons.map((lesson) => {
            const status = getLessonStatus(slug, lesson.id, flatLessons);
            const isComplete = status === 'مكتمل';
            const isInProgress = status === 'قيد الدراسة';
            const objective = lesson.learningObjectives[0] || lesson.summary || '';
            return `
              <article class="lesson-card ${isComplete ? 'completed' : ''} ${isInProgress ? 'in-progress' : ''}" data-course-lesson-id="${escapeHtml(lesson.id)}" data-lesson-order="${lesson.courseOrder}">
                <div class="lesson-card-header">
                  <div class="lesson-index">${String(lesson.order).padStart(2, '0')}</div>
                  <div class="lesson-copy">
                    <h4>${escapeHtml(lesson.title)}</h4>
                    <p><strong class="lesson-outcome-label">هدف التعلم:</strong> ${escapeHtml(objective)}</p>
                  </div>
                </div>
                <div class="lesson-meta-row">
                  <span>${escapeHtml(lesson.duration || '')}${lesson.difficulty ? ` • ${escapeHtml(lesson.difficulty)}` : ''}</span>
                  <span class="status-badge ${isComplete ? 'success' : isInProgress ? 'warning' : 'neutral'}">${status}</span>
                </div>
                <div class="lesson-actions">
                  <button type="button" class="open-lesson" data-lesson-id="${escapeHtml(lesson.id)}">فتح الدرس</button>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }).join('');

  levelRoot.querySelectorAll('[data-lesson-id]').forEach((button) => {
    button.addEventListener('click', () => {
      openLesson(slug, button.dataset.lessonId);
    });
  });
  await window.EfhamaChallengeSystem.render(slug, detail);
};

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const { render: renderCodeBlock, highlight: highlightCode } = window.EfhamaCodeBlocks;

const lessonVisualTypes = {
  concept: 'Concept Illustration — رسم مفاهيمي',
  'educational-illustration': 'Educational Illustration — رسم تعليمي',
  flowchart: 'Flowchart — مخطط انسيابي',
  diagram: 'Diagram — مخطط توضيحي',
  'mind-map': 'Mind Map — خريطة ذهنية',
  'process-diagram': 'Process Diagram — مخطط عمليات',
  'comparison-diagram': 'Comparison Diagram — مخطط مقارنة',
  'step-by-step': 'Step-by-Step Illustration — رسم خطوة بخطوة',
  'architecture-diagram': 'Architecture Diagram — مخطط معماري',
  'interactive-diagram': 'Interactive Diagram — مخطط تفاعلي',
  infographic: 'Infographic — إنفوجرافيك',
  'code-visualization': 'Code Visualization — تصور مرئي للكود'
};

const lessonVisualTypeAliases = {
  'concept-illustration': 'concept',
  'educational-illustrations': 'educational-illustration',
  'mindmap': 'mind-map',
  'step-by-step-diagram': 'step-by-step',
  'architecture': 'architecture-diagram',
  interactive: 'interactive-diagram'
};

const normalizeLessonVisualType = (type) => {
  const normalized = String(type || '').toLowerCase();
  const alias = lessonVisualTypeAliases[normalized] || normalized;
  return lessonVisualTypes[alias] ? alias : 'diagram';
};

const isSafeLessonVisualPath = (image) => (
  typeof image === 'string'
  && /^assets\/images\/lessons\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:svg|png|jpe?g|webp)$/i.test(image)
  && !image.split(/[\\/]/).some((segment) => segment === '.' || segment === '..')
);

const darkLessonVisuals = new Map();
let lessonVisualThemeRevision = 0;

const createDarkLessonVisual = async (imagePath) => {
  const response = await fetch(imagePath);
  if (!response.ok) throw new Error(`Unable to load lesson visual (${response.status}): ${imagePath}`);

  const source = await response.text();
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = parsed.documentElement;
  const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
  if (svg.localName !== 'svg' || parsed.querySelector('parsererror') || viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid lesson SVG: ${imagePath}`);
  }

  const [viewX, viewY, viewWidth, viewHeight] = viewBox;
  let backgroundUpdated = false;
  svg.querySelectorAll('rect').forEach((rect) => {
    const fill = (rect.getAttribute('fill') || '').toLowerCase();
    const x = Number(rect.getAttribute('x') || 0);
    const y = Number(rect.getAttribute('y') || 0);
    const width = Number(rect.getAttribute('width'));
    const height = Number(rect.getAttribute('height'));
    if (x === viewX && y === viewY && width >= viewWidth && height >= viewHeight && ['#fff', '#ffffff', 'white'].includes(fill)) {
      rect.setAttribute('fill', '#171b24');
      backgroundUpdated = true;
    }
  });
  if (!backgroundUpdated) throw new Error(`Lesson SVG has no recognized canvas background: ${imagePath}`);

  const darkTextColors = new Map([
    ['#26324a', '#e5e7eb'],
    ['#27324a', '#e5e7eb'],
    ['#172033', '#e5e7eb'],
    ['#0f172a', '#e5e7eb'],
    ['#6b7280', '#a8b1c3'],
    ['#5f6b85', '#a8b1c3']
  ]);
  svg.querySelectorAll('text[fill]').forEach((text) => {
    const fill = text.getAttribute('fill').toLowerCase();
    if (darkTextColors.has(fill)) text.setAttribute('fill', darkTextColors.get(fill));
  });

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
};

const updateLessonVisualTheme = (root) => {
  if (!root) return;
  const revision = ++lessonVisualThemeRevision;
  const dark = document.body.getAttribute('data-theme') === 'dark';
  const images = root.querySelectorAll('[data-lesson-visual-image], [data-visual-lightbox-image]');
  images.forEach((image) => {
    const originalPath = image.dataset.originalSrc;
    if (!originalPath) return;
    if (!dark) {
      image.src = originalPath;
      return;
    }
    if (!darkLessonVisuals.has(originalPath)) {
      darkLessonVisuals.set(originalPath, createDarkLessonVisual(originalPath));
    }
    darkLessonVisuals.get(originalPath).then((darkSource) => {
      if (revision === lessonVisualThemeRevision && document.body.getAttribute('data-theme') === 'dark' && image.dataset.originalSrc === originalPath) {
        image.src = darkSource;
      }
    }).catch((error) => {
      console.error('Unable to adapt lesson visual for dark mode:', error);
    });
  });
};
window.updateLessonVisualTheme = updateLessonVisualTheme;

const renderLessonVisualBlock = (block, lesson) => {
  if (!isSafeLessonVisualPath(block.image)) {
    return `<section class="lesson-visual-error" role="alert">تعذر عرض الرسم التعليمي: مسار الصورة غير صالح.</section>`;
  }
  const visualType = normalizeLessonVisualType(block.visualType || block.type);
  const visualTitle = block.title || 'رسم توضيحي';
  const imagePath = `../${block.image}`;
  const downloadName = block.downloadName || `${lesson.id}-${visualTitle}`;
  return `<figure class="lesson-visual-card">
    <figcaption class="lesson-visual-caption">
      <span class="lesson-visual-type" data-lesson-visual-type="${visualType}">${lessonVisualTypes[visualType]}</span>
      <h4>${escapeHtml(visualTitle)}</h4>
      ${block.description ? `<p>${escapeHtml(block.description)}</p>` : ''}
    </figcaption>
    <button class="lesson-visual-open" type="button" data-visual-open data-visual-image="${escapeHtml(imagePath)}" data-visual-alt="${escapeHtml(block.alt || visualTitle)}" data-visual-description="${escapeHtml(block.description || '')}" data-visual-title="${escapeHtml(visualTitle)}" aria-label="تكبير الرسمة: ${escapeHtml(visualTitle)}">
      <img src="${escapeHtml(imagePath)}" data-original-src="${escapeHtml(imagePath)}" alt="${escapeHtml(block.alt || visualTitle)}" loading="lazy" decoding="async" data-lesson-visual-image>
      <span class="lesson-visual-zoom-hint" aria-hidden="true">اضغط للتكبير</span>
    </button>
    <div class="lesson-visual-download-row">
      <button class="lesson-visual-download" type="button" data-visual-download data-visual-image="${escapeHtml(imagePath)}" data-visual-filename="${escapeHtml(downloadName)}">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M12 3.75v10.5m0 0 4.25-4.25M12 14.25 7.75 10M4.5 16v3.25h15V16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>تحميل الصورة</span>
      </button>
      <p class="lesson-visual-download-status" data-visual-download-status role="status" aria-live="polite"></p>
    </div>
    <p class="lesson-visual-error-text" role="status" hidden>تعذر تحميل هذا الرسم. تحقق من مسار الصورة.</p>
  </figure>`;
};

const highlightTechnicalTerms = (value) => escapeHtml(value)
  .replace(/\b(Python|JavaScript|HTML|CSS|SQL|Pseudocode|Flowchart|Algorithm|Variable|Function|Parameter|Argument|Return|Input|Output|Processing|DOM|API|Database|Query)\b/gi, '<span class="technical-term" dir="ltr">$1</span>');

const renderLessonContent = (lesson, fallbackLanguage = 'pseudocode', pathSlug = 'logic') => {
  const contentNode = document.querySelector('[data-lesson-content]');
  if (!contentNode) return;

  const content = [
    ...(Array.isArray(lesson.content) ? lesson.content : []),
    ...(Array.isArray(lesson.visuals) ? lesson.visuals.map((item) => ({ ...item, type: 'visual', visualType: item.visualType || item.type })) : []),
    ...(Array.isArray(lesson.infographics) ? lesson.infographics.map((item) => ({ ...item, type: 'visual', visualType: 'infographic' })) : []),
    ...(Array.isArray(lesson.examples) ? lesson.examples.map((item) => ({ type: 'example', ...item })) : []),
    ...(Array.isArray(lesson.applications) ? lesson.applications.map((item) => ({ type: 'application', ...item })) : []),
    ...(Array.isArray(lesson.exercises) ? lesson.exercises.map((item) => ({ type: 'exercise', ...item })) : []),
    ...(Array.isArray(lesson.challenges) ? lesson.challenges.map((item) => ({ type: 'challenge', ...item })) : []),
    ...(Array.isArray(lesson.projects) ? lesson.projects.map((item) => ({ type: 'project', ...item })) : [])
  ];
  const objectiveList = lesson.hasAuthoredObjectives && (lesson.learningObjectives || []).length
    ? `<section class="lesson-objectives"><h3>أهداف التعلم</h3><ul>${lesson.learningObjectives.map((objective) => `<li>${escapeHtml(objective)}</li>`).join('')}</ul></section>`
    : '';
  const outlineNotice = lesson.contentStatus === 'outline'
    ? '<p class="lesson-outline-notice">هذا الدرس متاح حاليًا كملخص وخريطة تعلم؛ الشرح التفصيلي قيد الإعداد.</p>'
    : '';

  contentNode.innerHTML = `${objectiveList}${outlineNotice}${content.map((block) => {
    switch (block.type) {
      case 'heading':
        return `<h3 style="margin: 28px 0 12px; font-size: 1.3rem;">${escapeHtml(block.text)}</h3>`;
      case 'paragraph':
        return `<p style="margin: 0 0 16px; line-height: 2; color: var(--text);">${highlightTechnicalTerms(block.text)}</p>`;
      case 'list':
        return `<ul style="margin: 0 0 18px; padding-inline-start: 22px; line-height: 2; color: var(--text);">${(block.items || []).map((item) => `<li>${highlightTechnicalTerms(item)}</li>`).join('')}</ul>`;
      case 'steps':
        return `<ol style="margin: 0 0 18px; padding-inline-start: 22px; line-height: 2; color: var(--text);">${(block.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
      case 'example':
      case 'application':
      case 'exercise':
      case 'challenge':
      case 'project': {
        const titles = {
          example: 'مثال تطبيقي',
          application: 'تطبيق عملي',
          exercise: 'تدريب',
          challenge: 'تحدٍ برمجي',
          project: 'مشروع'
        };
        const details = [block.requirements, block.steps, block.items].find(Array.isArray) || [];
        return `<section class="lesson-resource lesson-resource-${block.type}">
          <h4>${escapeHtml(block.title || titles[block.type])}</h4>
          ${block.description || block.prompt ? `<p>${escapeHtml(block.description || block.prompt)}</p>` : ''}
          ${details.length ? `<ol>${details.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>` : ''}
          ${block.code ? renderCodeBlock(block.code, block.codeTitle || 'مثال تطبيقي', block.language, fallbackLanguage, block) : ''}
          ${block.expectedOutput ? `<p><strong>الناتج المتوقع:</strong> ${escapeHtml(block.expectedOutput)}</p>` : ''}
          ${block.hint ? `<details><summary>تلميح</summary><p>${escapeHtml(block.hint)}</p></details>` : ''}
        </section>`;
      }
      case 'code':
        return renderCodeBlock(block.code, block.title, block.language, fallbackLanguage, block);
      case 'html-css-playground':
        return window.EfhamaHtmlCssPlayground.render(block);
      case 'javascript-playground':
        return window.EfhamaJavaScriptPlayground.render(block);
      case 'python-playground':
        return window.EfhamaPythonPlayground.render(block);
      case 'diagram':
      case 'visual':
      case 'concept':
      case 'infographic':
      case 'code-visualization':
      case 'educational-illustration':
      case 'educational-illustrations':
      case 'concept-illustration':
      case 'mind-map':
      case 'mindmap':
      case 'process-diagram':
      case 'comparison-diagram':
      case 'step-by-step':
      case 'step-by-step-diagram':
      case 'architecture':
      case 'architecture-diagram':
      case 'interactive-diagram':
      case 'interactive': {
        return renderLessonVisualBlock(block, lesson);
      }
      case 'code-comparison':
        return `<section class="code-comparison"><h4>${escapeHtml(block.title || '')}</h4><div class="code-comparison-grid">${(block.items || []).map((item) => renderCodeBlock(item.code, item.title, item.language || block.language, fallbackLanguage, { ...block, ...item })).join('')}</div>${block.note ? `<p class="lesson-code-description">${escapeHtml(block.note)}</p>` : ''}${block.commonError ? `<p class="lesson-code-error-note"><strong>خطأ شائع:</strong> ${escapeHtml(block.commonError)}</p>` : ''}</section>`;
      case 'before-after-code':
        return `<section class="code-comparison before-after-code"><h4>${escapeHtml(block.title || 'قبل وبعد')}</h4><div class="code-comparison-grid">${[
          { title: block.beforeTitle || 'قبل التعديل', code: block.before },
          { title: block.afterTitle || 'بعد التعديل', code: block.after }
        ].filter((item) => typeof item.code === 'string').map((item) => renderCodeBlock(item.code, item.title, block.language, fallbackLanguage, { ...block, ...item })).join('')}</div>${block.note ? `<p class="lesson-code-description">${escapeHtml(block.note)}</p>` : ''}</section>`;
      case 'callout':
        return `<div style="margin: 18px 0; background: var(--primary-soft); border: 1px solid var(--border); border-radius: 14px; padding: 16px; font-weight: 700; color: var(--text);">${escapeHtml(block.text)}</div>`;
      case 'cards':
        return `<section class="content-cards-section"><h4>${escapeHtml(block.title || '')}</h4><div class="content-cards">${(block.items || []).map((item) => `
          <article class="content-card"><h5>${escapeHtml(item.title || '')}</h5>${item.text ? `<p>${escapeHtml(item.text)}</p>` : ''}${item.items ? `<ul>${item.items.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>` : ''}</article>
        `).join('')}</div></section>`;
      case 'function-call-simulator':
        return `<section class="function-call-simulator" data-function-call-simulator data-function-name="${escapeHtml(block.functionName || 'say_hello')}" data-function-output="${escapeHtml(block.output || 'Hello!')}">
          <h4>${escapeHtml(block.title || '')}</h4><p>${escapeHtml(block.description || '')}</p>
          <div class="function-demo-flow" aria-label="تعريف الدالة يسبق استدعاءها">
            <article class="function-demo-definition"><span>1</span><strong>Definition</strong><code>def ${escapeHtml(block.functionName || 'say_hello')}():</code><small>تجهيز الدالة فقط — لا يوجد ناتج بعد</small></article>
            <b aria-hidden="true">→</b>
            <article class="function-demo-call"><span>2</span><strong>Call</strong><code>${escapeHtml(block.functionName || 'say_hello')}()</code><small>تشغيل جسم الدالة</small></article>
          </div>
          <div class="function-demo-actions"><button type="button" class="check-answer" data-define-function>تعريف الدالة</button><button type="button" class="resume-button" data-call-function disabled>استدعاء الدالة</button></div>
          <p class="function-demo-status" data-function-demo-status aria-live="polite">الدالة غير معرّفة بعد.</p>
          <pre class="function-demo-output" data-function-demo-output aria-live="polite"></pre>
        </section>`;
      case 'function-arguments-simulator':
        return `<section class="function-arguments-simulator" data-function-arguments-simulator data-default-name="${escapeHtml(block.defaultName || 'Guest')}">
          <h4>${escapeHtml(block.title || '')}</h4><p>${escapeHtml(block.description || '')}</p>
          <div class="simulator-fields">
            <label>طريقة تمرير القيم<select data-arguments-mode><option value="positional">Positional Arguments — حسب الترتيب</option><option value="keyword">Keyword Arguments — حسب الاسم</option><option value="default">Default Parameter — القيمة الافتراضية</option></select></label>
            <label>اسم الطالب<input type="text" value="${escapeHtml(block.nameValue || '')}" data-argument-name></label>
            <label>العمر<input type="number" min="0" max="120" step="1" value="${Number(block.ageValue) || 0}" data-argument-age></label>
          </div>
          <button type="button" class="check-answer" data-run-arguments>استدعِ الدالة</button>
          <div class="argument-mapping" data-argument-mapping aria-live="polite"></div>
          <p class="decision-result" data-arguments-result aria-live="polite"></p>
        </section>`;
      case 'print-return-simulator':
        return `<section class="print-return-simulator" data-print-return-simulator>
          <h4>${escapeHtml(block.title || '')}</h4><p>${escapeHtml(block.description || '')}</p>
          <div class="simulator-fields">
            <label>الرقم الأول<input type="number" step="any" value="${Number(block.firstValue) || 0}" data-print-return-first></label>
            <label>الرقم الثاني<input type="number" step="any" value="${Number(block.secondValue) || 0}" data-print-return-second></label>
            <label>سلوك الدالة<select data-print-return-mode><option value="print">print — تطبع فقط</option><option value="return">return — ترجع القيمة</option></select></label>
          </div>
          <button type="button" class="check-answer" data-run-print-return>شغّل الدالة</button>
          <div class="print-return-output" aria-live="polite">
            <p><strong>ما يظهر على الشاشة:</strong> <output data-print-return-screen>لم تُشغّل الدالة بعد.</output></p>
            <p><strong>القيمة المخزنة في result:</strong> <output data-print-return-value>—</output></p>
            <p><strong>result + 2:</strong> <output data-print-return-total>—</output></p>
          </div>
        </section>`;
      case 'flowchart':
        if (block.image) return renderLessonVisualBlock({ ...block, visualType: block.visualType || 'flowchart' }, lesson);
        return `<section class="lesson-flowchart" data-flowchart>
          <div class="flowchart-heading"><div><h4>${escapeHtml(block.title || 'Flowchart')}</h4><p>${escapeHtml(block.description || '')}</p></div><button class="resume-button" type="button" data-flowchart-play>تشغيل المخطط</button></div>
          <div class="flowchart-canvas" role="img" aria-label="مخطط انسياب لحساب مجموع رقمين">
            ${(block.nodes || []).map((node, index) => `${index ? '<span class="flowchart-arrow" aria-hidden="true">↓</span>' : ''}<button type="button" class="flowchart-node flowchart-${escapeHtml(node.shape || 'process')}" data-flowchart-node="${index}" aria-label="${escapeHtml(node.label)}"><span>${escapeHtml(node.label)}</span></button>`).join('')}
          </div>
          <p class="flowchart-status" data-flowchart-status aria-live="polite">اضغط «تشغيل المخطط» أو اختر أي خطوة لعرض وظيفتها.</p>
        </section>`;
      case 'decision-simulator':
        return `<section class="decision-simulator" data-decision-simulator data-kind="${escapeHtml(block.kind)}"><h4>${escapeHtml(block.title || '')}</h4><p>${escapeHtml(block.description || '')}</p>
          <div class="simulator-fields">${(block.fields || []).map((field) => `<label>${escapeHtml(field.label)}<input type="number" step="any" name="${escapeHtml(field.name)}" value="${Number(field.value) || 0}"></label>`).join('')}</div>
          <button type="button" class="check-answer" data-run-decision>تشغيل المسار</button>
          <div class="decision-track" data-decision-track aria-live="polite"></div><p class="decision-result" data-decision-result></p>
        </section>`;
      case 'loop-simulator':
        return `<section class="decision-simulator loop-simulator" data-loop-simulator data-kind="${escapeHtml(block.kind)}"><h4>${escapeHtml(block.title || '')}</h4><p>${escapeHtml(block.description || '')}</p>
          <div class="simulator-fields">${(block.fields || []).map((field) => `<label>${escapeHtml(field.label)}<input type="number" min="1" step="1" name="${escapeHtml(field.name)}" value="${Number(field.value) || 1}"></label>`).join('')}</div>
          <button type="button" class="check-answer" data-run-loop>تشغيل الحلقة</button>
          <div class="decision-track" data-loop-track aria-live="polite"></div><p class="decision-result" data-loop-result></p>
        </section>`;
      case 'range-simulator': {
        const presets = block.presets || [];
        const firstPreset = presets[0] || { start: 0, stop: 5, step: 1 };
        return `<section class="decision-simulator range-simulator" data-range-simulator><h4>${escapeHtml(block.title || '')}</h4><p>${escapeHtml(block.description || '')}</p>
          <label class="range-preset-label">أمثلة جاهزة<select data-range-preset>${presets.map((preset, index) => `<option value="${index}" data-start="${Number(preset.start)}" data-stop="${Number(preset.stop)}" data-step="${Number(preset.step)}">${escapeHtml(preset.label || '')}</option>`).join('')}<option value="custom">إعداد يدوي</option></select></label>
          <div class="simulator-fields range-fields">
            <label>البداية<input type="number" name="start" value="${Number(firstPreset.start)}"></label>
            <label>التوقف (غير شامل)<input type="number" name="stop" value="${Number(firstPreset.stop)}"></label>
            <label>الخطوة<input type="number" name="step" value="${Number(firstPreset.step)}"></label>
          </div>
          <button type="button" class="check-answer" data-run-range>اعرض القيم</button>
          <div class="range-track" data-range-track aria-live="polite"></div><p class="decision-result" data-range-result></p>
        </section>`;
      }
      case 'nested-loops-simulator':
        return `<section class="decision-simulator nested-loops-simulator" data-nested-loops-simulator><h4>${escapeHtml(block.title || '')}</h4><p>${escapeHtml(block.description || '')}</p>
          <div class="simulator-fields">
            <label>${escapeHtml(block.outerLabel || 'دورات الحلقة الخارجية')}<input type="number" min="1" max="10" step="1" name="outer-count" value="${Math.min(10, Math.max(1, Number(block.outerValue) || 1))}"></label>
            <label>${escapeHtml(block.innerLabel || 'دورات الحلقة الداخلية')}<input type="number" min="1" max="10" step="1" name="inner-count" value="${Math.min(10, Math.max(1, Number(block.innerValue) || 1))}"></label>
          </div>
          <div class="nested-loop-visual" aria-label="الحلقة الداخلية متداخلة داخل جسم الحلقة الخارجية">
            <article class="nested-loop-outer"><span>Outer Loop</span><strong data-outer-current>لم تبدأ</strong>
              <article class="nested-loop-inner"><span>Inner Loop</span><strong data-inner-current>تنتظر الحلقة الخارجية</strong></article>
            </article>
          </div>
          <div class="nested-loop-actions">
            <button type="button" class="check-answer" data-start-nested-loops>ابدأ / أعد التتبع</button>
            <button type="button" class="resume-button" data-next-nested-step disabled>الخطوة التالية</button>
          </div>
          <div class="nested-loop-track" data-nested-loop-track aria-live="polite"></div><p class="decision-result" data-nested-loop-result aria-live="polite">ابدأ المحاكاة لمشاهدة خطوات التنفيذ بالترتيب.</p>
        </section>`;
      case 'loop-control-simulator':
        return `<section class="decision-simulator loop-control-simulator" data-loop-control-simulator><h4>${escapeHtml(block.title || '')}</h4><p>${escapeHtml(block.description || '')}</p>
          <div class="simulator-fields">
            <label>نوع التحكم<select data-loop-control-mode><option value="break">Break: إنهاء الحلقة</option><option value="continue">Continue: تخطي دورة</option><option value="nested-break">Break داخل Nested Loops</option></select></label>
            <label>الرقم المستهدف / قيمة j<input type="number" min="1" max="10" step="1" value="${Math.min(10, Math.max(1, Number(block.targetValue) || 5))}" data-loop-control-target></label>
          </div>
          <button type="button" class="check-answer" data-run-loop-control>شغّل المحاكاة</button>
          <div class="loop-control-track" data-loop-control-track aria-live="polite"></div>
          <p class="decision-result" data-loop-control-result aria-live="polite"></p>
        </section>`;
      case 'infinite-loop-simulator':
        return `<section class="infinite-loop-simulator" data-infinite-loop-simulator data-iterations="${Math.min(10, Math.max(1, Number(block.iterations) || 5))}"><h4>${escapeHtml(block.title || '')}</h4><p>${escapeHtml(block.description || '')}</p>
          <button type="button" class="check-answer" data-run-infinite-loop-simulation>شغّل المحاكاة المحدودة</button>
          <div class="decision-track" data-infinite-loop-track aria-live="polite"></div><p class="decision-result" data-infinite-loop-result></p>
        </section>`;
      case 'truth-table':
        return `<section class="truth-table-widget" data-truth-table data-truth-operator="${escapeHtml(block.operator || 'all')}"><h4>${escapeHtml(block.title || '')}</h4><p>${escapeHtml(block.description || '')}</p>
          <div class="truth-controls">${(block.inputs || []).map((input) => `<label>${escapeHtml(input.label)}<select name="${escapeHtml(input.name)}"><option value="true">True</option><option value="false">False</option></select></label>`).join('')}</div>
          <button type="button" class="check-answer" data-evaluate-truth>تقييم المنطق</button><div class="truth-results" data-truth-results></div>
        </section>`;
      case 'comparison-simulator':
        return `<section class="comparison-simulator" data-comparison-simulator><h4>${escapeHtml(block.title || '')}</h4><p>${escapeHtml(block.description || '')}</p>
          <div class="comparison-controls"><label>القيمة الأولى<input type="number" step="any" value="${Number(block.left) || 0}" data-comparison-left></label>
            <label>معامل المقارنة<select data-comparison-operator><option value="&gt;">&gt; أكبر من</option><option value="&lt;">&lt; أصغر من</option><option value="&gt;=">&gt;= أكبر من أو يساوي</option><option value="&lt;=">&lt;= أصغر من أو يساوي</option><option value="==">== يساوي</option><option value="!=">!= لا يساوي</option></select></label>
            <label>القيمة الثانية<input type="number" step="any" value="${Number(block.right) || 0}" data-comparison-right></label></div>
          <button type="button" class="check-answer" data-evaluate-comparison>اعرض النتيجة</button><p class="comparison-result" data-comparison-result aria-live="polite"></p>
        </section>`;
      case 'equals-visual':
        return `<section class="equals-visual-section"><h4>${escapeHtml(block.title || '')}</h4><div class="equals-visual-grid">${(block.items || []).map((item) => `
          <article class="equals-visual-card ${item.kind === 'assignment' ? 'assignment' : 'comparison'}"><span class="equals-visual-label">${escapeHtml(item.label || '')}</span><strong class="equals-visual-operator" aria-hidden="true">${escapeHtml(item.operator || '')}</strong><code>${highlightCode(item.code || '', fallbackLanguage)}</code><p>${escapeHtml(item.meaning || '')}</p></article>
        `).join('')}</div></section>`;
      case 'validation-simulator':
        return `<section class="validation-simulator" data-validation-simulator><h4>${escapeHtml(block.title || '')}</h4><p>${escapeHtml(block.description || '')}</p>
          <div class="validation-controls"><label>قاعدة التحقق<select data-validation-rule>${(block.rules || []).map((rule) => `<option value="${escapeHtml(rule.value)}"${rule.value === block.initialRule ? ' selected' : ''}>${escapeHtml(rule.label)}</option>`).join('')}</select></label>
            <label>القيمة المراد التحقق منها<input type="text" data-validation-value placeholder="اكتب قيمة للتجربة"></label></div>
          <button type="button" class="check-answer" data-run-validation>تحقق من القيمة</button><p class="validation-result" data-validation-result aria-live="polite"></p>
        </section>`;
      case 'symbol-gallery':
        return `<section class="symbol-gallery" data-symbol-gallery><h4>${escapeHtml(block.title || '')}</h4><p>${escapeHtml(block.description || '')}</p><div class="symbol-gallery-grid">${(block.items || []).map((item, index) => `
          <button type="button" class="symbol-card${index === 0 ? ' active' : ''}" data-symbol-index="${index}" aria-pressed="${index === 0}">
            <svg class="symbol-preview" viewBox="0 0 180 100" role="img" aria-label="${escapeHtml(item.name)}">${renderSymbolSvg(item.shape, item.label)}</svg>
            <strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.function)}</span><em>${escapeHtml(item.example)}</em>
          </button>`).join('')}</div><p class="symbol-gallery-status" data-symbol-status aria-live="polite"></p></section>`;
      case 'flowchart-diagram':
        return `<section class="full-flowchart" data-full-flowchart><h4>${escapeHtml(block.title || '')}</h4><p>${escapeHtml(block.description || '')}</p>
          <div class="full-flowchart-scroll"><svg viewBox="0 0 920 760" role="img" aria-label="${escapeHtml(block.ariaLabel || 'مخطط انسياب')}" class="full-flowchart-svg">
            <defs><marker id="flow-arrow-${escapeHtml(block.id || 'main')}" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="currentColor"/></marker></defs>
            <g class="diagram-lines" marker-end="url(#flow-arrow-${escapeHtml(block.id || 'main')})">
              <path d="M460 76 V120"/><path d="M460 190 V238"/><path d="M460 314 V370"/><path d="M460 446 V500 H220 V548"/><path d="M460 446 V500 H700 V548"/><path d="M220 618 V676 H460 V710"/><path d="M700 618 V676 H460 V710"/>
            </g>
            <g class="diagram-labels"><text x="275" y="492">Yes / نعم</text><text x="630" y="492">No / لا</text></g>
            <g class="diagram-node diagram-terminator" data-diagram-node="0" tabindex="0"><ellipse cx="460" cy="48" rx="96" ry="28"/><text x="460" y="54">Start / بداية</text></g>
            <g class="diagram-node diagram-input" data-diagram-node="1" tabindex="0"><polygon points="365,120 555,120 535,190 345,190"/><text x="450" y="162">إدخال 3 درجات</text></g>
            <g class="diagram-node diagram-process" data-diagram-node="2" tabindex="0"><rect x="345" y="238" width="210" height="76" rx="5"/><text x="450" y="282">حساب المتوسط</text></g>
            <g class="diagram-node diagram-decision" data-diagram-node="3" tabindex="0"><polygon points="460,370 565,408 460,446 355,408"/><text x="460" y="413">المتوسط ≥ 50؟</text></g>
            <g class="diagram-node diagram-output" data-diagram-node="4" tabindex="0"><polygon points="125,548 315,548 295,618 105,618"/><text x="210" y="590">ناجح / Pass</text></g>
            <g class="diagram-node diagram-output" data-diagram-node="5" tabindex="0"><polygon points="605,548 795,548 775,618 585,618"/><text x="690" y="590">راسب / Fail</text></g>
            <g class="diagram-node diagram-terminator" data-diagram-node="6" tabindex="0"><ellipse cx="460" cy="710" rx="96" ry="28"/><text x="460" y="716">End / نهاية</text></g>
          </svg></div><p class="flowchart-status" data-diagram-status aria-live="polite">اضغط على أي رمز لرؤية وظيفته.</p></section>`;
      case 'interactive-cards':
        return `<section class="interactive-cards"><h4>${escapeHtml(block.title || '')}</h4><p class="interactive-cards-intro">${escapeHtml(block.description || '')}</p><div class="interactive-card-grid">${(block.items || []).map((item, index) => `<button type="button" class="interactive-info-card${index === 0 ? ' active' : ''}" data-info-card="${index}" aria-pressed="${index === 0}"><span class="info-card-icon">${escapeHtml(item.icon || '◎')}</span><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.short || '')}</span><em>${escapeHtml(item.detail || '')}</em></button>`).join('')}</div></section>`;
      case 'ipo-diagram':
        return `<section class="ipo-diagram" aria-label="${escapeHtml(block.title || 'مخطط المدخلات والمعالجة والمخرجات')}">
          <h4>${escapeHtml(block.title || '')}</h4>
          <div class="ipo-flow" role="group" aria-label="مراحل معالجة البيانات">
            ${(block.steps || []).map((step, index) => `${index ? '<span class="ipo-arrow" aria-hidden="true">↓</span>' : ''}<button class="ipo-step${index === 0 ? ' active' : ''}" type="button" data-ipo-step="${escapeHtml(step.key)}" data-description="${escapeHtml(step.description)}" aria-pressed="${index === 0}"><span class="ipo-step-number">0${index + 1}</span><strong>${escapeHtml(step.label)}</strong><span>${escapeHtml(step.translation)}</span></button>`).join('')}
          </div>
          <p class="ipo-description" data-ipo-description aria-live="polite">${escapeHtml(block.steps?.[0]?.description || '')}</p>
          <p class="ipo-note">${escapeHtml(block.note || '')}</p>
        </section>`;
      case 'requirements-comparison':
        return `<section class="requirements-section"><h4>${escapeHtml(block.title || '')}</h4><div class="requirements-comparison">
          ${[block.functional, block.nonFunctional].map((item) => `<article class="requirement-card"><p class="requirement-kind">${escapeHtml(item.translation)}</p><h5>${escapeHtml(item.title)}</h5><p class="requirement-question">${escapeHtml(item.question)}</p><ul>${(item.items || []).map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul></article>`).join('')}
        </div></section>`;
      case 'glossary':
        return `<section class="glossary-section"><h4>${escapeHtml(block.title || '')}</h4><dl class="glossary-grid">${(block.items || block.rows || []).map((item) => { const term = item.term ?? item[0]; const meaning = item.meaning ?? item[1]; return `<div class="glossary-item"><dt><a href="../glossary.html" target="_blank" rel="noopener">${escapeHtml(term)}</a></dt><dd>${escapeHtml(meaning)}</dd></div>`; }).join('')}</dl></section>`;
      case 'average-calculator':
        return `<section class="interactive-calculator"><h4>${escapeHtml(block.title || '')}</h4><form data-average-calculator data-min="${Number(block.min) || 0}" data-max="${Number(block.max) || 100}">
          <div class="calculator-fields">${(block.fields || []).map((field) => `<label>${escapeHtml(field.label)}<input type="number" name="${escapeHtml(field.name)}" value="${Number(field.value)}" min="${Number(block.min) || 0}" max="${Number(block.max) || 100}" step="any" required></label>`).join('')}</div>
          <button class="check-answer" type="submit">${escapeHtml(block.buttonLabel || 'احسب')}</button><p class="calculator-hint">${escapeHtml(block.hint || '')}</p><p class="calculator-result" data-calculator-result aria-live="polite"></p>
        </form></section>`;
      case 'division-demo':
        return `<section class="interactive-calculator"><h4>${escapeHtml(block.title || '')}</h4><form data-division-demo>
          <div class="calculator-fields"><label>المقسوم<input type="number" name="numerator" value="${Number(block.numerator) || 0}" step="any" required></label><label>المقسوم عليه<input type="number" name="denominator" value="${Number(block.denominator) || 0}" step="any" required></label></div>
          <button class="check-answer" type="submit">${escapeHtml(block.buttonLabel || 'احسب')}</button><p class="calculator-hint">${escapeHtml(block.hint || '')}</p><p class="calculator-result" data-calculator-result aria-live="polite"></p>
        </form></section>`;
      case 'test-cases':
        return `<section class="test-cases-section"><h4>${escapeHtml(block.title || '')}</h4><div class="test-cases-scroll"><table class="test-cases-table"><thead><tr>${(block.columns || []).map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${(block.rows || []).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
      case 'trace-simulator':
        return `<section class="trace-simulator" data-trace-simulator data-trace-steps="${escapeHtml(JSON.stringify(block.steps || []))}" data-trace-variables="${escapeHtml(JSON.stringify(block.variables || []))}" data-current-step="0">
          <h4>${escapeHtml(block.title || 'محاكاة التتبّع')}</h4><p class="trace-step-status" data-trace-status aria-live="polite"></p><p class="trace-step-description" data-trace-description aria-live="polite"></p>
          <div class="test-cases-scroll"><table class="trace-state-table"><thead><tr><th>المتغير</th><th>القيمة السابقة</th><th>القيمة الحالية</th></tr></thead><tbody data-trace-values></tbody></table></div>
          <div class="trace-simulator-controls"><button class="resume-button" type="button" data-trace-action="reset">من البداية</button><button class="resume-button" type="button" data-trace-action="previous">الخطوة السابقة</button><button class="toggle-complete" type="button" data-trace-action="next">الخطوة التالية</button></div>
        </section>`;
      case 'error-comparison':
        return `<section class="error-comparison-section"><h4>${escapeHtml(block.title || '')}</h4><div class="error-comparison-grid">${(block.items || []).map((item) => `
          <article class="error-type-card ${escapeHtml(item.kind)}"><p class="error-type-translation">${escapeHtml(item.translation)}</p><h5>${escapeHtml(item.title)}</h5><p><strong>متى يحدث؟</strong> ${escapeHtml(item.when)}</p><p><strong>مثال:</strong> ${escapeHtml(item.example)}</p><p><strong>النتيجة:</strong> ${escapeHtml(item.result)}</p></article>
        `).join('')}</div></section>`;
      case 'discount-calculator':
        return `<section class="interactive-calculator"><h4>${escapeHtml(block.title || '')}</h4><form data-discount-calculator>
          <div class="calculator-fields"><label>السعر<input type="number" name="price" value="${Number(block.price) || 0}" step="any" required></label><label>نسبة الخصم (%)<input type="number" name="percentage" value="${Number(block.percentage) || 0}" step="any" required></label></div>
          <button class="check-answer" type="submit">${escapeHtml(block.buttonLabel || 'احسب')}</button><p class="calculator-hint">${escapeHtml(block.hint || '')}</p><p class="calculator-result" data-calculator-result aria-live="polite"></p>
        </form></section>`;
      case 'testing-debugging':
        return `<details class="testing-debugging-card"><summary>${escapeHtml(block.title || 'اعرض الفرق')}</summary><div class="testing-debugging-grid"><article><h5>${escapeHtml(block.testing.title)}</h5><p>${escapeHtml(block.testing.description)}</p></article><article><h5>${escapeHtml(block.debugging.title)}</h5><p>${escapeHtml(block.debugging.description)}</p></article></div></details>`;
      case 'algorithm-flow':
        return `<section class="algorithm-flow-section"><h4>${escapeHtml(block.title || '')}</h4><div class="algorithm-flow" aria-label="${escapeHtml(block.title || 'تسلسل الخطوات')}">
          ${(block.steps || []).map((step, index) => `${index ? '<span class="algorithm-flow-arrow" aria-hidden="true">↓</span>' : ''}<details class="algorithm-flow-step"${index === 0 ? ' open' : ''}><summary><span class="algorithm-flow-index">${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(step.title)}</strong></summary><p>${escapeHtml(step.description)}</p></details>`).join('')}
        </div>${block.hint ? `<p class="algorithm-flow-hint">${escapeHtml(block.hint)}</p>` : ''}</section>`;
      case 'concept-comparison':
        return `<section class="concept-comparison-section"><h4>${escapeHtml(block.title || '')}</h4><div class="concept-comparison-grid">${(block.items || []).map((item) => `
          <article class="concept-card ${item.code ? 'program' : 'algorithm'}"><p class="concept-label">${escapeHtml(item.label || '')}</p><h5>${escapeHtml(item.title || '')}</h5><p>${escapeHtml(item.description || '')}</p>${item.points ? `<ol>${item.points.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ol>` : ''}${item.code ? renderCodeBlock(item.code, 'مثال برمجي', block.language, fallbackLanguage) : ''}</article>
        `).join('')}</div></section>`;
      case 'property-explorer':
        return `<section class="property-explorer-section"><h4>${escapeHtml(block.title || '')}</h4><div class="property-explorer">${(block.items || []).map((item) => `
          <details class="algorithm-property"><summary><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.summary)}</span></summary><p>${escapeHtml(item.detail)}</p></details>
        `).join('')}</div></section>`;
      case 'representation-comparison':
        return `<section class="representation-comparison-section"><h4>${escapeHtml(block.title || '')}</h4><div class="representation-comparison-grid">${(block.items || []).map((item) => `
          <article class="representation-card ${escapeHtml(item.kind)}"><p class="representation-translation">${escapeHtml(item.translation)}</p><h5>${escapeHtml(item.title)}</h5><p>${escapeHtml(item.description)}</p><div class="representation-tradeoff"><strong>الميزة</strong><span>${escapeHtml(item.advantage)}</span></div><div class="representation-tradeoff"><strong>ملاحظة</strong><span>${escapeHtml(item.limitation)}</span></div></article>
        `).join('')}</div></section>`;
      case 'flowchart-symbols':
        return `<section class="flowchart-symbols-section"><h4>${escapeHtml(block.title || '')}</h4><div class="flowchart-symbol-grid">${(block.items || []).map((item) => `
          <article class="flowchart-symbol-card"><div class="flowchart-symbol-shape ${escapeHtml(item.kind)}"><span>${escapeHtml(item.symbol)}</span></div><h5>${escapeHtml(item.name)}</h5><p>${escapeHtml(item.function)}</p></article>
        `).join('')}</div></section>`;
      case 'representation-example':
        return `<section class="representation-example-card"><p class="representation-translation">${escapeHtml(block.label || '')}</p><h5>${escapeHtml(block.title || '')}</h5>${block.items ? `<ol>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>` : ''}${block.code ? renderCodeBlock(block.code, block.title, block.language, fallbackLanguage, block) : ''}</section>`;
      case 'positive-number-flowchart':
        return `<section class="positive-flowchart-section"><h4>${escapeHtml(block.title || '')}</h4><div class="positive-flowchart" role="img" aria-label="مخطط قرار يحدد إن كان الرقم موجبًا">
          <div class="flowchart-node terminator">${escapeHtml(block.steps?.[0]?.label || 'Start')}</div><span class="positive-flow-arrow">↓</span>
          <div class="flowchart-node io">${escapeHtml(block.steps?.[1]?.label || '')}</div><span class="positive-flow-arrow">↓</span>
          <div class="flowchart-decision"><span>${escapeHtml(block.steps?.[2]?.label || '')}</span></div>
          <div class="flowchart-branches"><article><span class="branch-label">نعم</span><div class="flowchart-node output">${escapeHtml(block.steps?.[3]?.label || '')}</div></article><article><span class="branch-label">لا</span><div class="flowchart-node output">${escapeHtml(block.steps?.[4]?.label || '')}</div></article></div>
          <div class="flowchart-node terminator">${escapeHtml(block.steps?.[5]?.label || 'End')}</div>
        </div><p class="flowchart-caption">افحص الشرط أولًا، ثم اتبع المسار المناسب حتى النهاية.</p></section>`;
      default:
        if (block.image) return renderLessonVisualBlock(block, lesson);
        return ``;
    }
  }).join('')}` + `
    <dialog class="lesson-visual-lightbox" data-visual-lightbox aria-labelledby="visual-lightbox-title" aria-describedby="visual-lightbox-description">
      <div class="lesson-visual-lightbox-toolbar">
        <h2 id="visual-lightbox-title" data-visual-lightbox-title>عرض الرسم</h2>
        <div class="lesson-visual-lightbox-actions">
          <div class="lesson-visual-zoom-controls" aria-label="التحكم في تكبير الرسم">
            <button type="button" data-visual-zoom="out" aria-label="تصغير الرسم">−</button>
            <button type="button" data-visual-zoom="reset" aria-label="الحجم الأصلي">100%</button>
            <button type="button" data-visual-zoom="in" aria-label="تكبير الرسم">+</button>
          </div>
          <button class="lesson-visual-close" type="button" data-visual-close aria-label="إغلاق العرض المكبّر">إغلاق</button>
        </div>
      </div>
      <img data-visual-lightbox-image alt="" decoding="async">
      <p id="visual-lightbox-description" data-visual-lightbox-description></p>
    </dialog>
  `;
  updateLessonVisualTheme(contentNode);
  window.EfhamaHtmlCssPlayground.initialize(contentNode, pathSlug, lesson.id);
  window.EfhamaJavaScriptPlayground.initialize(contentNode, pathSlug, lesson.id);
  window.EfhamaPythonPlayground.initialize(contentNode, pathSlug, lesson.id);
  if (!contentNode.dataset.visualErrorBound) {
    contentNode.addEventListener('error', (event) => {
      if (!event.target.matches('[data-lesson-visual-image]')) return;
      const errorMessage = event.target.closest('.lesson-visual-card')?.querySelector('.lesson-visual-error-text');
      event.target.hidden = true;
      if (errorMessage) errorMessage.hidden = false;
    }, true);
    contentNode.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const dialog = contentNode.querySelector('[data-visual-lightbox]');
      if (dialog?.open) {
        event.preventDefault();
        dialog.close();
      }
    });
    contentNode.dataset.visualErrorBound = 'true';
  }

  const updateTraceSimulator = (simulator, index) => {
    const steps = JSON.parse(simulator.dataset.traceSteps || '[]');
    const variables = JSON.parse(simulator.dataset.traceVariables || '[]');
    const currentIndex = Math.max(0, Math.min(index, steps.length - 1));
    const current = steps[currentIndex];
    const previous = currentIndex > 0 ? steps[currentIndex - 1] : { values: {} };
    simulator.dataset.currentStep = String(currentIndex);
    simulator.querySelector('[data-trace-status]').textContent = `الخطوة ${currentIndex + 1} من ${steps.length}: ${current.label}`;
    simulator.querySelector('[data-trace-description]').textContent = current.description || '';
    simulator.querySelector('[data-trace-values]').innerHTML = variables.map((variable) => {
      const oldValue = previous.values?.[variable] ?? '-';
      const newValue = current.values?.[variable] ?? '-';
      const changed = String(oldValue) !== String(newValue);
      return `<tr class="${changed ? 'trace-value-changed' : ''}"><th scope="row">${escapeHtml(variable)}</th><td>${changed ? `<span class="trace-previous-value">${escapeHtml(oldValue)}</span>` : escapeHtml(oldValue)}</td><td>${changed ? `<span class="trace-new-value">${escapeHtml(newValue)}</span><span class="trace-change-label">جديدة</span>` : escapeHtml(newValue)}</td></tr>`;
    }).join('');
    simulator.querySelector('[data-trace-action="previous"]').disabled = currentIndex === 0;
    simulator.querySelector('[data-trace-action="next"]').disabled = currentIndex === steps.length - 1;
  };
  contentNode.querySelectorAll('[data-trace-simulator]').forEach((simulator) => updateTraceSimulator(simulator, 0));

  contentNode.onclick = async (event) => {
    const downloadButton = event.target.closest('[data-visual-download]');
    if (downloadButton) {
      const card = downloadButton.closest('.lesson-visual-card');
      const status = card.querySelector('[data-visual-download-status]');
      const imagePath = downloadButton.dataset.visualImage;
      const extension = imagePath.match(/\.(svg|png|jpe?g|webp)$/i)?.[1]?.toLowerCase();
      const filename = downloadButton.dataset.visualFilename
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}-]+/gu, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120) || 'efhama-lesson-image';
      if (!extension) {
        status.textContent = 'تعذر تحميل الصورة: صيغة الملف غير مدعومة.';
        return;
      }

      downloadButton.disabled = true;
      status.dataset.state = '';
      status.textContent = 'جارٍ تجهيز الصورة الأصلية...';
      try {
        const response = await fetch(imagePath);
        if (!response.ok) throw new Error(`Image request failed with status ${response.status}`);
        const imageBlob = await response.blob();
        if (!imageBlob.size) throw new Error('The image file is empty');

        const objectUrl = URL.createObjectURL(imageBlob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `${filename}.${extension}`;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        status.dataset.state = 'success';
        status.textContent = 'تم بدء تحميل الصورة الأصلية.';
      } catch (error) {
        console.error('Unable to download lesson visual:', error);
        status.dataset.state = 'error';
        status.textContent = 'تعذر تحميل الصورة. تحقق من اتصالك وحاول مرة أخرى.';
      } finally {
        downloadButton.disabled = false;
      }
      return;
    }

    const visualButton = event.target.closest('[data-visual-open]');
    if (visualButton) {
      const dialog = contentNode.querySelector('[data-visual-lightbox]');
      const image = dialog.querySelector('[data-visual-lightbox-image]');
      image.style.width = '100%';
      image.dataset.originalSrc = visualButton.dataset.visualImage;
      image.src = image.dataset.originalSrc;
      updateLessonVisualTheme(contentNode);
      image.alt = visualButton.dataset.visualAlt;
      dialog.querySelector('[data-visual-lightbox-title]').textContent = visualButton.dataset.visualTitle;
      dialog.querySelector('[data-visual-lightbox-description]').textContent = visualButton.dataset.visualDescription;
      dialog.querySelector('[data-visual-zoom="reset"]').textContent = '100%';
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      return;
    }
    const zoomButton = event.target.closest('[data-visual-zoom]');
    if (zoomButton) {
      const dialog = zoomButton.closest('[data-visual-lightbox]');
      const image = dialog.querySelector('[data-visual-lightbox-image]');
      const currentScale = Number.parseFloat(image.style.width) / 100 || 1;
      const nextScale = zoomButton.dataset.visualZoom === 'reset'
        ? 1
        : Math.min(3, Math.max(1, currentScale + (zoomButton.dataset.visualZoom === 'in' ? 0.5 : -0.5)));
      image.style.width = `${nextScale * 100}%`;
      dialog.querySelector('[data-visual-zoom="reset"]').textContent = `${Math.round(nextScale * 100)}%`;
      return;
    }
    const visualCloseButton = event.target.closest('[data-visual-close]');
    if (visualCloseButton) {
      const dialog = visualCloseButton.closest('[data-visual-lightbox]');
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      return;
    }
    const lightbox = event.target.closest('[data-visual-lightbox]');
    if (lightbox && event.target === lightbox) {
      if (typeof lightbox.close === 'function') lightbox.close();
      else lightbox.removeAttribute('open');
      return;
    }
    const copyButton = event.target.closest('[data-copy-code]');
    if (copyButton) {
      const code = copyButton.dataset.copyText || '';
      let copied = false;
      try {
        await navigator.clipboard.writeText(code);
        copied = true;
      } catch (error) {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.append(textarea);
        textarea.select();
        copied = document.execCommand('copy');
        textarea.remove();
      }
      copyButton.textContent = copied ? 'تم النسخ' : 'تعذر النسخ';
      copyButton.dataset.copyState = copied ? 'success' : 'error';
      window.setTimeout(() => {
        if (!copyButton.isConnected) return;
        copyButton.textContent = 'نسخ الكود';
        delete copyButton.dataset.copyState;
      }, 1800);
      return;
    }
    const traceButton = event.target.closest('[data-trace-action]');
    if (traceButton) {
      const simulator = traceButton.closest('[data-trace-simulator]');
      const currentIndex = Number(simulator.dataset.currentStep || 0);
      const nextIndex = traceButton.dataset.traceAction === 'reset' ? 0 : traceButton.dataset.traceAction === 'previous' ? currentIndex - 1 : currentIndex + 1;
      updateTraceSimulator(simulator, nextIndex);
      return;
    }
    const step = event.target.closest('[data-ipo-step]');
    if (!step || !contentNode.contains(step)) return;
    const diagram = step.closest('.ipo-diagram');
    diagram.querySelectorAll('[data-ipo-step]').forEach((button) => {
      const active = button === step;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    diagram.querySelector('[data-ipo-description]').textContent = step.dataset.description;
  };
  contentNode.onsubmit = (event) => {
    const form = event.target;
    const result = form.querySelector('[data-calculator-result]');
    if (!result) return;
    event.preventDefault();
    result.classList.remove('error');

    if (form.matches('[data-average-calculator]')) {
      const inputs = [...form.querySelectorAll('input[type="number"]')];
      const min = Number(form.dataset.min);
      const max = Number(form.dataset.max);
      const grades = inputs.map((input) => Number(input.value));
      if (inputs.some((input) => input.value.trim() === '' || !Number.isFinite(Number(input.value)) || Number(input.value) < min || Number(input.value) > max)) {
        result.textContent = `أدخل كل الدرجات بين ${min} و${max}.`;
        result.classList.add('error');
        return;
      }
      const total = grades.reduce((sum, grade) => sum + grade, 0);
      const average = Number((total / grades.length).toFixed(2));
      result.textContent = `المجموع ${total} ÷ ${grades.length} = المتوسط ${average}.`;
      return;
    }

    if (form.matches('[data-division-demo]')) {
      const numerator = Number(form.elements.numerator.value);
      const denominator = Number(form.elements.denominator.value);
      if (form.elements.denominator.value.trim() === '' || denominator === 0) {
        result.textContent = 'لا يمكن القسمة على صفر. تحقّق من المقسوم عليه قبل تنفيذ العملية.';
        result.classList.add('error');
        return;
      }
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
        result.textContent = 'أدخل قيمًا رقمية صالحة.';
        result.classList.add('error');
        return;
      }
      result.textContent = `${numerator} ÷ ${denominator} = ${Number((numerator / denominator).toFixed(4))}.`;
      return;
    }

    if (form.matches('[data-discount-calculator]')) {
      const priceValue = form.elements.price.value.trim();
      const percentageValue = form.elements.percentage.value.trim();
      const price = Number(priceValue);
      const percentage = Number(percentageValue);
      if (!priceValue || !percentageValue || !Number.isFinite(price) || !Number.isFinite(percentage) || price < 0 || percentage < 0 || percentage > 100) {
        result.textContent = 'أدخل سعرًا لا يقل عن صفر ونسبة خصم بين 0 و100.';
        result.classList.add('error');
        return;
      }
      const discount = price * percentage / 100;
      const finalPrice = price - discount;
      result.textContent = `قيمة الخصم ${Number(discount.toFixed(2))}، والسعر النهائي ${Number(finalPrice.toFixed(2))}.`;
    }
  };
};

const renderQuiz = (lesson) => {
  const quizNode = document.querySelector('[data-lesson-quiz]');
  if (!quizNode || !Array.isArray(lesson.quiz) || !lesson.quiz.length) return;

  quizNode.innerHTML = `<div class="quiz-heading"><h2>اختبر فهمك</h2><p data-quiz-score aria-live="polite">أجب عن الأسئلة ثم تحقق من اختيارك.</p></div>${lesson.quiz.map((question, index) => `
    <fieldset class="interactive-question" data-question-index="${index}" data-correct-index="${'ABCD'.indexOf(question.answer)}">
      <legend>${index + 1}. ${escapeHtml(question.question)}</legend>
      <div class="quiz-options">${question.options.map((option, optionIndex) => `
        <label class="quiz-option"><input type="radio" name="quiz-${index}" value="${optionIndex}"><span class="option-marker">${String.fromCharCode(65 + optionIndex)}</span><span>${escapeHtml(option)}</span></label>
      `).join('')}</div>
      <button class="check-answer" type="button" data-check-answer>تحقق من الإجابة</button>
      <button class="resume-button" type="button" data-reveal-answer>إظهار الإجابة</button>
      <p class="answer-feedback" data-answer-feedback aria-live="polite"></p>
    </fieldset>
  `).join('')}`;

  quizNode.onclick = (event) => {
    const checkButton = event.target.closest('[data-check-answer]');
    const revealButton = event.target.closest('[data-reveal-answer]');
    if (revealButton) {
      const questionNode = revealButton.closest('[data-question-index]');
      const question = lesson.quiz[Number(questionNode.dataset.questionIndex)];
      const correctIndex = Number(questionNode.dataset.correctIndex);
      const feedback = questionNode.querySelector('[data-answer-feedback]');
      const hidden = revealButton.dataset.revealed !== 'true';
      feedback.textContent = hidden ? `الإجابة الصحيحة: ${question.options[correctIndex]}. ${question.explanation}` : '';
      feedback.className = `answer-feedback ${hidden ? 'correct' : ''}`;
      revealButton.dataset.revealed = String(hidden);
      revealButton.textContent = hidden ? 'إخفاء الإجابة' : 'إظهار الإجابة';
      return;
    }
    if (!checkButton) return;
    const questionNode = checkButton.closest('[data-question-index]');
    const selected = questionNode.querySelector('input[type="radio"]:checked');
    const feedback = questionNode.querySelector('[data-answer-feedback]');
    if (!selected) {
      feedback.textContent = 'اختر إجابة أولًا.';
      feedback.className = 'answer-feedback unanswered';
      return;
    }

    const question = lesson.quiz[Number(questionNode.dataset.questionIndex)];
    const correctIndex = Number(questionNode.dataset.correctIndex);
    const isCorrect = Number(selected.value) === correctIndex;
    const correctOption = question.options[correctIndex];
    feedback.textContent = `${isCorrect ? 'إجابة صحيحة.' : `إجابة غير صحيحة. الإجابة الصحيحة: ${correctOption}.`} ${question.explanation}`;
    feedback.className = `answer-feedback ${isCorrect ? 'correct' : 'incorrect'}`;
    questionNode.dataset.answered = 'true';
    questionNode.dataset.isCorrect = String(isCorrect);
    const answered = [...quizNode.querySelectorAll('[data-question-index][data-answered="true"]')];
    const correctCount = answered.filter((item) => item.dataset.isCorrect === 'true').length;
    quizNode.querySelector('[data-quiz-score]').textContent = `أجبت عن ${answered.length} من ${lesson.quiz.length} أسئلة، منها ${correctCount} صحيحة.`;
  };
};

const renderLessonNavigation = (slug, lessons, lesson) => {
  const navigationNode = document.querySelector('[data-lesson-navigation]');
  if (!navigationNode) return;
  const currentIndex = lessons.findIndex((item) => item.id === lesson.id);
  const previous = lessons.find((item) => item.id === lesson.previousLessonId) || lessons[currentIndex - 1];
  const next = lessons.find((item) => item.id === lesson.nextLessonId) || lessons[currentIndex + 1];
  const linkFor = (item) => `lesson.html?slug=${encodeURIComponent(slug)}&lesson=${encodeURIComponent(item.id)}`;

  navigationNode.innerHTML = `
    ${previous ? `<a class="sequence-link" data-lesson-id="${escapeHtml(previous.id)}" href="${linkFor(previous)}"><span>الدرس السابق</span><strong>${escapeHtml(previous.title)}</strong></a>` : '<span></span>'}
    <a class="sequence-home" href="path.html?slug=${encodeURIComponent(slug)}">العودة إلى الوحدة والمسار</a>
    ${next ? `<a class="sequence-link next" data-lesson-id="${escapeHtml(next.id)}" href="${linkFor(next)}"><span>الدرس التالي</span><strong>${escapeHtml(next.title)}</strong></a>` : '<span class="sequence-end" aria-current="step">آخر درس متاح حاليًا</span>'}
  `;
  navigationNode.onclick = (event) => {
    const link = event.target.closest('[data-lesson-id]');
    if (!link) return;
    const state = getPathState(slug);
    state.lastLesson = link.dataset.lessonId;
    savePathState(slug, state);
  };
};

const initializeLessonReadingExperience = (slug, lesson) => {
  const readingRoot = document.querySelector('[data-lesson-reading-root]');
  const toc = document.querySelector('[data-lesson-toc]');
  const progressTrack = document.querySelector('[data-reading-progress]');
  const progressLabel = document.querySelector('[data-reading-progress-label]');
  const resumeNode = document.querySelector('[data-resume-info]');
  if (!readingRoot) return;

  const headings = [...readingRoot.querySelectorAll('[data-lesson-content] h2, [data-lesson-content] h3, [data-lesson-content] h4, [data-lesson-quiz] h2, [data-lesson-quiz] h3, [data-lesson-quiz] h4')]
    .filter((heading) => !heading.closest('figure, dialog, [data-visual-lightbox]'));
  headings.forEach((heading, index) => {
    if (!heading.id) heading.id = `lesson-section-${index + 1}`;
  });
  if (toc) {
    const tocPanel = toc.closest('.lesson-toc-panel');
    if (tocPanel) tocPanel.hidden = headings.length === 0;
    toc.innerHTML = headings.map((heading) => `<a href="#${escapeHtml(heading.id)}" data-toc-link>${escapeHtml(heading.textContent.trim())}</a>`).join('');
    toc.onclick = (event) => {
      const link = event.target.closest('[data-toc-link]');
      if (!link) return;
      const details = toc.closest('details');
      if (details && window.matchMedia('(max-width: 760px)').matches) details.open = false;
    };
  }

  const storageKey = `efhama_reading_${slug}_${lesson.id}`;
  const savedProgress = Math.max(0, Math.min(100, Number(localStorage.getItem(storageKey)) || 0));
  const updateProgress = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? Math.round((window.scrollY / scrollable) * 100) : 100;
    const normalized = Math.max(0, Math.min(100, progress));
    if (progressTrack) {
      progressTrack.setAttribute('aria-valuenow', String(normalized));
      const bar = progressTrack.querySelector('span');
      if (bar) bar.style.width = `${normalized}%`;
    }
    if (progressLabel) progressLabel.textContent = `${normalized}%`;
    localStorage.setItem(storageKey, String(normalized));
    if (resumeNode) resumeNode.textContent = normalized ? `تقدم القراءة المحفوظ: ${normalized}%` : `آخر نقطة: ${lesson.id}`;
  };
  const initialProgress = savedProgress;
  if (progressTrack) {
    progressTrack.setAttribute('aria-valuenow', String(initialProgress));
    const bar = progressTrack.querySelector('span');
    if (bar) bar.style.width = `${initialProgress}%`;
  }
  if (progressLabel) progressLabel.textContent = `${initialProgress}%`;
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);

  const scaleKey = 'efhama_lesson_font_scale';
  const fontScale = () => Math.min(1.25, Math.max(0.85, Number(localStorage.getItem(scaleKey)) || 1));
  const updateFontScale = (scale) => {
    const normalized = Math.round(Math.min(1.25, Math.max(0.85, scale)) * 100) / 100;
    readingRoot.style.setProperty('--lesson-font-scale', String(normalized));
    localStorage.setItem(scaleKey, String(normalized));
  };
  updateFontScale(fontScale());
  document.querySelector('[data-font-smaller]')?.addEventListener('click', () => updateFontScale(fontScale() - 0.05));
  document.querySelector('[data-font-larger]')?.addEventListener('click', () => updateFontScale(fontScale() + 0.05));
  document.querySelector('[data-font-reset]')?.addEventListener('click', () => updateFontScale(1));
};

const renderLessonPage = async () => {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug') || 'logic';
  const requestedLessonId = params.get('lesson') || '';
  const legacyLessonIds = { 'logic-20': '74192', '74193': '39521', '83520': '46281', '46282': '71539', '71540': '39417', '71541': '58326', '58327': '73821', '58328': '82537', '58329': '64182', '58330': '92571', '58331': '82635' };
  const lessonId = slug === 'logic' ? legacyLessonIds[requestedLessonId] || requestedLessonId : requestedLessonId;
  const detail = await loadPathDetail(slug);
  const flatLessons = getAllLessons(detail);
  const listedLesson = flatLessons.find((item) => item.id === lessonId) || flatLessons[0];
  if (!listedLesson) throw new Error(`Lesson not found in path ${slug}`);
  let lesson = listedLesson;
  if ((detail.lessonDetailFiles || []).includes(listedLesson.id)) {
    const response = await fetch(`../data/paths/${listedLesson.id}.json`, { cache: 'no-store' });
    if (response.ok) {
      const standaloneLesson = await response.json();
      lesson = {
        ...listedLesson,
        ...standaloneLesson,
        unitId: listedLesson.unitId,
        unitName: listedLesson.unitName,
        unitOrder: listedLesson.unitOrder,
        order: listedLesson.order,
        courseOrder: listedLesson.courseOrder,
        previousLessonId: listedLesson.previousLessonId,
        nextLessonId: listedLesson.nextLessonId,
        difficulty: standaloneLesson.difficulty || listedLesson.difficulty,
        estimatedMinutes: standaloneLesson.estimatedMinutes || listedLesson.estimatedMinutes,
        learningObjectives: standaloneLesson.learningObjectives || listedLesson.learningObjectives,
        hasAuthoredObjectives: Array.isArray(standaloneLesson.learningObjectives) || listedLesson.hasAuthoredObjectives,
        prerequisites: standaloneLesson.prerequisites || standaloneLesson.prerequisiteIds || listedLesson.prerequisites,
        contentStatus: standaloneLesson.contentStatus || (hasLessonLearningContent(standaloneLesson) ? 'complete' : 'outline')
      };
    } else if (response.status !== 404) {
      throw new Error(`Unable to load lesson content: HTTP ${response.status}`);
    }
  }
  const state = getPathState(slug);
  let isCompleted = (state.completed || []).includes(lesson.id);
  state.lastLesson = lesson.id;
  savePathState(slug, state);

  const titleNode = document.querySelector('[data-lesson-title]');
  const pathName = document.querySelector('[data-lesson-pathname]');
  const pathLink = document.querySelector('[data-lesson-path-link]');
  const unitNode = document.querySelector('[data-lesson-unit]');
  const summaryNode = document.querySelector('[data-lesson-summary]');
  const summaryLabelNode = document.querySelector('[data-lesson-summary-label]');
  const metaNode = document.querySelector('[data-lesson-meta]');
  const toggleBtn = document.querySelector('[data-toggle-complete]');
  const resumeNode = document.querySelector('[data-resume-info]');

  if (titleNode) titleNode.textContent = lesson.title;
  if (pathName) pathName.textContent = getPathTitle(detail);
  if (pathLink) pathLink.href = `path.html?slug=${encodeURIComponent(slug)}`;
  if (unitNode) unitNode.textContent = lesson.unitName || 'محتوى المسار';
  document.title = `${lesson.title} | ${getPathTitle(detail)} — افهمها | efhamha`;
  if (summaryNode) summaryNode.textContent = lesson.summary || 'لا يتوفر ملخص لهذا الدرس بعد.';
  if (summaryLabelNode) summaryLabelNode.textContent = lesson.hasAuthoredObjectives ? 'ملخص الدرس:' : 'هدف الدرس وملخصه:';
  if (metaNode) {
    const prerequisites = (lesson.prerequisites || []).map((prerequisite) => {
      const prerequisiteId = typeof prerequisite === 'string' ? prerequisite : prerequisite.id;
      const prerequisiteLesson = flatLessons.find((item) => item.id === prerequisiteId);
      if (!prerequisiteLesson) return '';
      return `<a class="lesson-prerequisite" href="lesson.html?slug=${encodeURIComponent(slug)}&lesson=${encodeURIComponent(prerequisiteLesson.id)}">${escapeHtml(prerequisiteLesson.title)}</a>`;
    }).filter(Boolean);
    metaNode.innerHTML = `
      <span>المدة: ${escapeHtml(lesson.duration || (lesson.estimatedMinutes ? `${lesson.estimatedMinutes} دقيقة` : 'غير محددة'))}</span>
      <span>المستوى: ${escapeHtml(lesson.difficulty || detail.difficulty || 'غير محدد')}</span>
      <span>الوحدة: ${escapeHtml(lesson.unitName || 'غير محددة')}</span>
      <span>المسار: ${escapeHtml(getPathTitle(detail))}</span>
      ${prerequisites.length ? `<span class="lesson-prerequisites"><strong>المتطلبات السابقة:</strong> ${prerequisites.join('، ')}</span>` : ''}
    `;
  }
  const codeLanguage = { python: 'python', html: 'html', css: 'css', javascript: 'javascript', sql: 'sql' }[slug] || 'pseudocode';
  renderLessonContent(lesson, codeLanguage, slug);
  document.querySelectorAll('[data-flowchart]').forEach((chart) => {
    const status = chart.querySelector('[data-flowchart-status]');
    const nodes = [...chart.querySelectorAll('[data-flowchart-node]')];
    const selectNode = (index) => {
      nodes.forEach((node, nodeIndex) => node.classList.toggle('is-current', nodeIndex === index));
      if (status) status.textContent = `الخطوة ${index + 1}: ${nodes[index] ? nodes[index].textContent.trim() : ''}`;
    };
    nodes.forEach((node, index) => node.addEventListener('click', () => selectNode(index)));
    const play = chart.querySelector('[data-flowchart-play]');
    if (play) play.addEventListener('click', () => {
      let index = 0;
      selectNode(index);
      const timer = window.setInterval(() => {
        index += 1;
        if (index >= nodes.length) { window.clearInterval(timer); return; }
        selectNode(index);
      }, 650);
    });
  });
  document.querySelectorAll('[data-function-call-simulator]').forEach((simulator) => {
    const defineButton = simulator.querySelector('[data-define-function]');
    const callButton = simulator.querySelector('[data-call-function]');
    const status = simulator.querySelector('[data-function-demo-status]');
    const output = simulator.querySelector('[data-function-demo-output]');
    const functionName = simulator.dataset.functionName;
    let isDefined = false;
    let calls = 0;
    defineButton.addEventListener('click', () => {
      isDefined = true;
      calls = 0;
      callButton.disabled = false;
      output.textContent = '';
      status.textContent = `تم تعريف ${functionName}(). لم تُنفّذ الدالة بعد؛ استدعها لرؤية الناتج.`;
    });
    callButton.addEventListener('click', () => {
      if (!isDefined) return;
      calls += 1;
      output.textContent += `${output.textContent ? '\n' : ''}${simulator.dataset.functionOutput}`;
      status.textContent = `تم استدعاء ${functionName}() ${calls} ${calls === 1 ? 'مرة' : 'مرات'}.`;
    });
  });
  document.querySelectorAll('[data-function-arguments-simulator]').forEach((simulator) => {
    const mode = simulator.querySelector('[data-arguments-mode]');
    const nameInput = simulator.querySelector('[data-argument-name]');
    const ageInput = simulator.querySelector('[data-argument-age]');
    const mapping = simulator.querySelector('[data-argument-mapping]');
    const result = simulator.querySelector('[data-arguments-result]');
    simulator.querySelector('[data-run-arguments]').addEventListener('click', () => {
      const name = nameInput.value.trim();
      const age = Number(ageInput.value);
      if (mode.value !== 'default' && (!name || !ageInput.value.trim() || !Number.isInteger(age) || age < 0 || age > 120)) {
        mapping.replaceChildren();
        result.textContent = 'أدخل اسمًا وعمرًا صحيحًا من 0 إلى 120.';
        return;
      }
      if (mode.value === 'default') {
        const selectedName = name || simulator.dataset.defaultName;
        mapping.innerHTML = `<span>Default Parameter: name="${escapeHtml(simulator.dataset.defaultName)}"</span><span>Argument: ${name ? escapeHtml(name) : 'لم تُرسل قيمة للاسم'}</span>`;
        result.textContent = `Welcome ${selectedName}`;
      } else if (mode.value === 'keyword') {
        mapping.innerHTML = `<span>name ← ${escapeHtml(name)} (بالاسم)</span><span>age ← ${age} (بالاسم)</span>`;
        result.textContent = `Name: ${name} | Age: ${age}`;
      } else {
        mapping.innerHTML = `<span>name ← ${escapeHtml(name)} (أول قيمة)</span><span>age ← ${age} (ثاني قيمة)</span>`;
        result.textContent = `Name: ${name} | Age: ${age}`;
      }
    });
  });
  document.querySelectorAll('[data-print-return-simulator]').forEach((simulator) => {
    const firstInput = simulator.querySelector('[data-print-return-first]');
    const secondInput = simulator.querySelector('[data-print-return-second]');
    const mode = simulator.querySelector('[data-print-return-mode]');
    const screen = simulator.querySelector('[data-print-return-screen]');
    const returnedValue = simulator.querySelector('[data-print-return-value]');
    const total = simulator.querySelector('[data-print-return-total]');
    simulator.querySelector('[data-run-print-return]').addEventListener('click', () => {
      if (!firstInput.value.trim() || !secondInput.value.trim()) {
        screen.textContent = 'أدخل رقمين صحيحين أولًا.';
        returnedValue.textContent = '—';
        total.textContent = '—';
        return;
      }
      const result = Number(firstInput.value) + Number(secondInput.value);
      if (!Number.isFinite(result)) {
        screen.textContent = 'أدخل رقمين صحيحين أولًا.';
        returnedValue.textContent = '—';
        total.textContent = '—';
        return;
      }
      if (mode.value === 'print') {
        screen.textContent = String(result);
        returnedValue.textContent = 'None (الدالة لم تستخدم return)';
        total.textContent = 'لا يمكن إجراء العملية على None';
      } else {
        screen.textContent = 'لا شيء؛ return لا تطبع النتيجة تلقائيًا.';
        returnedValue.textContent = String(result);
        total.textContent = String(result + 2);
      }
    });
  });
  document.querySelectorAll('.interactive-cards').forEach((group) => {
    group.querySelectorAll('[data-info-card]').forEach((card) => card.addEventListener('click', () => {
      group.querySelectorAll('[data-info-card]').forEach((item) => {
        const active = item === card;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
    }));
  });
  document.querySelectorAll('[data-symbol-gallery]').forEach((gallery) => {
    const cards = [...gallery.querySelectorAll('[data-symbol-index]')];
    const status = gallery.querySelector('[data-symbol-status]');
    const activate = (card) => {
      cards.forEach((item) => {
        const active = item === card;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      if (status) status.textContent = card ? `${card.querySelector('strong').textContent}: ${card.querySelector('em').textContent}` : '';
    };
    cards.forEach((card) => card.addEventListener('click', () => activate(card)));
    activate(cards[0]);
  });
  document.querySelectorAll('[data-full-flowchart]').forEach((diagram) => {
    const nodes = [...diagram.querySelectorAll('[data-diagram-node]')];
    const status = diagram.querySelector('[data-diagram-status]');
    const descriptions = [
      'Terminator: بداية تنفيذ خوارزمية حساب المتوسط.',
      'Input / Output: إدخال درجات الطالب الثلاث.',
      'Process: حساب مجموع الدرجات ثم المتوسط.',
      'Decision: اختبار هل المتوسط أكبر من أو يساوي 50؟',
      'Output: عرض رسالة ناجح عند تحقق الشرط.',
      'Output: عرض رسالة راسب عند عدم تحقق الشرط.',
      'Terminator: نهاية تنفيذ الخوارزمية.'
    ];
    const activate = (node) => {
      nodes.forEach((item) => item.classList.toggle('active', item === node));
      if (status) status.textContent = descriptions[Number(node?.dataset.diagramNode)] || '';
    };
    nodes.forEach((node) => {
      node.addEventListener('click', () => activate(node));
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(node); }
      });
    });
  });
  document.querySelectorAll('[data-decision-simulator]').forEach((simulator) => {
    const track = simulator.querySelector('[data-decision-track]');
    const result = simulator.querySelector('[data-decision-result]');
    const renderTrack = (labels, active) => {
      track.innerHTML = labels.map((label, index) => `<span class="${index <= active ? 'active' : ''}">${escapeHtml(label)}</span>${index < labels.length - 1 ? '<b>↓</b>' : ''}`).join('');
    };
    simulator.querySelector('[data-run-decision]').addEventListener('click', () => {
      const kind = simulator.dataset.kind;
      const values = Object.fromEntries([...simulator.querySelectorAll('input')].map((input) => [input.name, Number(input.value)]));
      let labels;
      let message;
      if (kind === 'pass-fail') {
        const passed = values.grade >= 50;
        labels = ['Start', 'Input Grade', 'Grade >= 50?', passed ? 'True → Pass' : 'False → Fail', 'End'];
        message = passed ? 'النتيجة: ناجح (Pass).' : 'النتيجة: راسب (Fail).';
      } else if (kind === 'sign') {
        const positive = values.number > 0;
        const negative = values.number < 0;
        labels = ['Start', 'Input Number', 'Number > 0?', positive ? 'True → Positive' : 'False', ...(positive ? [] : ['Number < 0?', negative ? 'True → Negative' : 'False → Zero']), 'End'];
        message = positive ? 'النتيجة: الرقم موجب.' : negative ? 'النتيجة: الرقم سالب.' : 'النتيجة: الرقم يساوي صفر.';
      } else {
        const discounted = values.total >= 1000;
        const discount = discounted ? values.total * 0.1 : 0;
        labels = ['Start', 'Input Total', 'Total >= 1000?', discounted ? 'True → Discount = 10%' : 'False → Discount = 0', 'FinalPrice = Total - Discount', 'End'];
        message = `السعر النهائي: ${(values.total - discount).toFixed(2)} (الخصم: ${discount.toFixed(2)}).`;
      }
      renderTrack(labels, labels.length - 1);
      result.textContent = message;
    });
  });
  document.querySelectorAll('[data-truth-table]').forEach((widget) => {
    const results = widget.querySelector('[data-truth-results]');
    widget.querySelector('[data-evaluate-truth]').addEventListener('click', () => {
      const values = Object.fromEntries([...widget.querySelectorAll('select')].map((select) => [select.name, select.value === 'true']));
      const operator = widget.dataset.truthOperator;
      const outputs = operator === 'and'
        ? [['AND', values.first && values.second]]
        : operator === 'or'
          ? [['OR', values.first || values.second]]
          : operator === 'not'
            ? [['NOT', !values.first]]
            : [['AND', values.first && values.second], ['OR', values.first || values.second], ['NOT (الأول)', !values.first]];
      results.innerHTML = outputs.map(([name, value]) => `<span>${name}: <strong>${value}</strong></span>`).join('');
    });
  });
  document.querySelectorAll('[data-comparison-simulator]').forEach((simulator) => {
    const result = simulator.querySelector('[data-comparison-result]');
    simulator.querySelector('[data-evaluate-comparison]').addEventListener('click', () => {
      const left = simulator.querySelector('[data-comparison-left]').valueAsNumber;
      const right = simulator.querySelector('[data-comparison-right]').valueAsNumber;
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        result.textContent = 'أدخل قيمتين رقميتين صالحَتين أولًا.';
        result.dataset.valid = 'false';
        return;
      }
      const operator = simulator.querySelector('[data-comparison-operator]').value;
      const comparisons = {
        '>': left > right,
        '<': left < right,
        '>=': left >= right,
        '<=': left <= right,
        '==': left === right,
        '!=': left !== right
      };
      const value = comparisons[operator];
      result.textContent = `${left} ${operator} ${right} → ${value ? 'TRUE' : 'FALSE'}`;
      result.dataset.valid = 'true';
      result.dataset.result = String(value);
    });
  });
  document.querySelectorAll('[data-validation-simulator]').forEach((simulator) => {
    const result = simulator.querySelector('[data-validation-result]');
    simulator.querySelector('[data-run-validation]').addEventListener('click', () => {
      const value = simulator.querySelector('[data-validation-value]').value;
      const rule = simulator.querySelector('[data-validation-rule]').value;
      const numericValue = Number(value);
      let valid = false;
      let message = '';
      if (rule === 'required') {
        valid = value.trim().length > 0;
        message = valid ? 'القيمة مقبولة: الحقل غير فارغ.' : 'مدخل غير صحيح: هذا الحقل مطلوب.';
      } else if (rule === 'number') {
        valid = value.trim().length > 0 && Number.isFinite(numericValue);
        message = valid ? 'القيمة مقبولة: تم إدخال رقم صالح.' : 'مدخل غير صحيح: أدخل رقمًا صالحًا.';
      } else if (rule === 'grade' || rule === 'age') {
        const maximum = rule === 'grade' ? 100 : 120;
        const name = rule === 'grade' ? 'الدرجة' : 'العمر';
        valid = value.trim().length > 0 && Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= maximum;
        message = valid
          ? `القيمة مقبولة: ${name} داخل النطاق من 0 إلى ${maximum}.`
          : `مدخل غير صحيح: أدخل ${name} رقمًا من 0 إلى ${maximum}.`;
      }
      result.textContent = message;
      result.dataset.valid = String(valid);
    });
  });
  document.querySelectorAll('[data-loop-simulator]').forEach((simulator) => {
    const track = simulator.querySelector('[data-loop-track]');
    const result = simulator.querySelector('[data-loop-result]');
    simulator.querySelector('[data-run-loop]').addEventListener('click', () => {
      const limit = Math.max(1, Math.min(50, Number(simulator.querySelector('input[name="limit"]').value) || 1));
      const values = Array.from({ length: limit }, (_, index) => index + 1);
      const kind = simulator.dataset.kind;
      let total = 0;
      const labels = values.map((value) => {
        if (kind === 'sum-range') total += value;
        return kind === 'sum-range' ? `counter=${value}, sum=${total}` : `counter=${value}: اطبع ${value}`;
      });
      labels.push(`counter=${limit + 1}: الشرط False → End`);
      track.innerHTML = labels.map((label, index) => `<span class="${index === labels.length - 1 ? '' : 'active'}">${escapeHtml(label)}</span>${index < labels.length - 1 ? '<b>↓</b>' : ''}`).join('');
      result.textContent = kind === 'sum-range' ? `انتهت الحلقة. المجموع = ${total}.` : `انتهت الحلقة. الناتج: ${values.join('، ')}.`;
    });
  });
  document.querySelectorAll('[data-nested-loops-simulator]').forEach((simulator) => {
    const outerInput = simulator.querySelector('input[name="outer-count"]');
    const innerInput = simulator.querySelector('input[name="inner-count"]');
    const track = simulator.querySelector('[data-nested-loop-track]');
    const result = simulator.querySelector('[data-nested-loop-result]');
    const outerCurrent = simulator.querySelector('[data-outer-current]');
    const innerCurrent = simulator.querySelector('[data-inner-current]');
    const startButton = simulator.querySelector('[data-start-nested-loops]');
    const nextButton = simulator.querySelector('[data-next-nested-step]');
    let pairs = [];
    let currentStep = -1;
    startButton.addEventListener('click', () => {
      const outerCount = Number(outerInput.value);
      const innerCount = Number(innerInput.value);
      if (![outerCount, innerCount].every((value) => Number.isInteger(value) && value >= 1 && value <= 10)) {
        track.replaceChildren();
        pairs = [];
        currentStep = -1;
        nextButton.disabled = true;
        outerCurrent.textContent = 'لم تبدأ';
        innerCurrent.textContent = 'تنتظر الحلقة الخارجية';
        result.textContent = 'أدخل عددًا صحيحًا من 1 إلى 10 لكل حلقة.';
        return;
      }
      pairs = [];
      currentStep = -1;
      for (let outer = 1; outer <= outerCount; outer += 1) {
        for (let inner = 1; inner <= innerCount; inner += 1) pairs.push(`i=${outer}, j=${inner}`);
      }
      track.innerHTML = pairs.map((pair, index) => `<span data-nested-step="${index}">${escapeHtml(pair)}</span>`).join('');
      outerCurrent.textContent = `${outerCount} دورة`;
      innerCurrent.textContent = `${innerCount} دورة في كل مرة`;
      nextButton.disabled = false;
      result.textContent = `تم تجهيز ${pairs.length} خطوة. اضغط «الخطوة التالية» لمتابعة التنفيذ.`;
    });
    nextButton.addEventListener('click', () => {
      if (currentStep + 1 >= pairs.length) return;
      currentStep += 1;
      const step = pairs[currentStep];
      track.querySelectorAll('[data-nested-step]').forEach((node, index) => {
        node.classList.toggle('completed', index < currentStep);
        node.classList.toggle('active', index === currentStep);
      });
      const [outerValue, innerValue] = step.match(/\d+/g).map(Number);
      outerCurrent.textContent = `الدورة ${outerValue}`;
      innerCurrent.textContent = `الدورة ${innerValue}`;
      const innerCount = Number(innerInput.value);
      result.textContent = currentStep === pairs.length - 1
        ? `انتهى التتبع: الحلقة الداخلية نفذت ${innerCount} مرات في كل دورة خارجية؛ الإجمالي ${pairs.length} مرة.`
        : `الخطوة ${currentStep + 1} من ${pairs.length}: الحلقة الخارجية عند ${outerValue}، والداخلية عند ${innerValue}.`;
      nextButton.disabled = currentStep === pairs.length - 1;
    });
  });
  document.querySelectorAll('[data-loop-control-simulator]').forEach((simulator) => {
    const mode = simulator.querySelector('[data-loop-control-mode]');
    const targetInput = simulator.querySelector('[data-loop-control-target]');
    const track = simulator.querySelector('[data-loop-control-track]');
    const result = simulator.querySelector('[data-loop-control-result]');
    simulator.querySelector('[data-run-loop-control]').addEventListener('click', () => {
      const target = Number(targetInput.value);
      if (!Number.isInteger(target) || target < 1 || target > 10) {
        track.replaceChildren();
        result.textContent = 'أدخل رقمًا صحيحًا من 1 إلى 10.';
        return;
      }

      const events = [];
      let explanation = '';
      if (mode.value === 'nested-break') {
        if (target > 3) {
          track.replaceChildren();
          result.textContent = 'في مثال الحلقات المتداخلة، اختر قيمة j من 1 إلى 3.';
          return;
        }
        for (let outer = 1; outer <= 3; outer += 1) {
          for (let inner = 1; inner <= 3; inner += 1) {
            if (inner === target) {
              events.push({ label: `i=${outer}, j=${inner}: break تنهي الحلقة الداخلية`, type: 'stop' });
              break;
            }
            events.push({ label: `i=${outer}, j=${inner}: اطبع`, type: 'output' });
          }
        }
        explanation = `انتهت الحلقة الداخلية عند j=${target} في كل دورة، لكن الحلقة الخارجية استمرت حتى i=3.`;
      } else {
        for (let value = 1; value <= 10; value += 1) {
          if (value === target && mode.value === 'break') {
            events.push({ label: `${value}: break → انتهت الحلقة`, type: 'stop' });
            break;
          }
          if (value === target && mode.value === 'continue') {
            events.push({ label: `${value}: continue → تخطَّ هذه الدورة`, type: 'skip' });
            continue;
          }
          events.push({ label: `${value}: اطبع`, type: 'output' });
        }
        explanation = mode.value === 'break'
          ? `توقفت الحلقة عند ${target}؛ لم تُنفّذ التكرارات التي بعده.`
          : `تم تخطي ${target} فقط، ثم استمرت الحلقة حتى نهاية النطاق.`;
      }

      track.innerHTML = events.map((event) => `<span class="${event.type}">${escapeHtml(event.label)}</span>`).join('');
      result.textContent = explanation;
    });
  });
  document.querySelectorAll('[data-range-simulator]').forEach((simulator) => {
    const preset = simulator.querySelector('[data-range-preset]');
    const inputs = ['start', 'stop', 'step'].map((name) => simulator.querySelector(`input[name="${name}"]`));
    const track = simulator.querySelector('[data-range-track]');
    const result = simulator.querySelector('[data-range-result]');
    preset.addEventListener('change', () => {
      const option = preset.selectedOptions[0];
      if (option.value === 'custom') return;
      inputs[0].value = option.dataset.start;
      inputs[1].value = option.dataset.stop;
      inputs[2].value = option.dataset.step;
    });
    simulator.querySelector('[data-run-range]').addEventListener('click', () => {
      const [start, stop, step] = inputs.map((input) => Number(input.value));
      if (!inputs.every((input) => input.value.trim() !== '' && Number.isInteger(Number(input.value))) || step === 0) {
        track.replaceChildren();
        result.textContent = 'أدخل أعدادًا صحيحة وتأكد أن الخطوة لا تساوي صفرًا.';
        return;
      }
      const values = [];
      for (let value = start; step > 0 ? value < stop : value > stop; value += step) {
        if (values.length === 30) break;
        values.push(value);
      }
      const slots = values.map((value) => `<span class="range-value">${value}</span>`);
      slots.push(`<span class="range-stop">التوقف ${stop} (غير شامل)</span>`);
      track.innerHTML = slots.join('<b aria-hidden="true">→</b>');
      result.textContent = values.length
        ? `range(${start}, ${stop}, ${step}) تنتج: ${values.join('، ')}${values.length === 30 ? ' (عُرضت أول 30 قيمة كحد أقصى).' : ''}`
        : 'لا توجد قيم في هذا النطاق؛ اتجاه الخطوة لا يصل إلى قيمة التوقف.';
    });
  });
  document.querySelectorAll('[data-infinite-loop-simulator]').forEach((simulator) => {
    const track = simulator.querySelector('[data-infinite-loop-track]');
    const result = simulator.querySelector('[data-infinite-loop-result]');
    simulator.querySelector('[data-run-infinite-loop-simulation]').addEventListener('click', () => {
      const maxIterations = Math.min(10, Math.max(1, Number(simulator.dataset.iterations) || 5));
      const steps = Array.from({ length: maxIterations }, (_, index) => `الدورة ${index + 1}: number = 1، الشرط True`);
      track.innerHTML = steps.map((step) => `<span class="active">${escapeHtml(step)}</span>`).join('');
      result.textContent = `أُوقفت المحاكاة بعد ${maxIterations} دورات لحماية الصفحة. في البرنامج الحقيقي سيستمر الشرط لأن number لا تتغير.`;
    });
  });
  renderQuiz(lesson);
  const lessonQuizNode = document.querySelector('[data-lesson-quiz]');
  if (lessonQuizNode) {
    lessonQuizNode.insertAdjacentHTML('beforeend', `
      <section class="lesson-assessment-cta">
        <div><strong>اختبار قصير للدرس</strong><span>أسئلة مرتبطة بهدف هذا الدرس • تُحفظ نتيجتك في سجل المحاولات</span></div>
        <a class="primary-btn" href="assessment.html?slug=${encodeURIComponent(slug)}&assessment=${encodeURIComponent(`${slug}:lesson:${lesson.id}`)}">ابدأ الاختبار</a>
      </section>`);
  }
  renderLessonNavigation(slug, flatLessons, lesson);
  initializeLessonReadingExperience(slug, lesson);
  if (toggleBtn) {
    toggleBtn.textContent = isCompleted ? 'إلغاء الإكمال' : 'تحديد كمكتمل';
    toggleBtn.onclick = () => {
      const next = !isCompleted;
      setLessonCompletion(slug, lesson.id, next);
      const refreshed = getPathState(slug);
      const nextCompleted = (refreshed.completed || []).includes(lesson.id);
      isCompleted = nextCompleted;
      toggleBtn.textContent = nextCompleted ? 'إلغاء الإكمال' : 'تحديد كمكتمل';
      if (resumeNode) resumeNode.textContent = nextCompleted ? 'تم حفظ هذا الدرس كـ مكتمل.' : 'تم تحديث آخر نقطة دراسية.';
      if (next && nextCompleted && window.EfhamaGamification) {
        window.EfhamaGamification.recordActivity('lesson', `${slug}:${lesson.id}`);
        const unitLessons = flatLessons.filter((item) => item.unitId === lesson.unitId);
        const completedLessons = new Set(refreshed.completed || []);
        if (unitLessons.length && unitLessons.every((item) => completedLessons.has(item.id))) {
          window.EfhamaGamification.recordActivity('unit', `${slug}:${lesson.unitId}`);
          if (lesson.unitOrder === 1) {
            const badgeByPath = {
              python: 'python-beginner',
              html: 'web-explorer',
              css: 'css-designer',
              javascript: 'javascript-starter'
            };
            if (badgeByPath[slug]) window.EfhamaGamification.unlockBadge(badgeByPath[slug]);
          }
        }
      }
    };
  }
  if (resumeNode) {
    const readingProgress = Math.max(0, Math.min(100, Number(localStorage.getItem(`efhama_reading_${slug}_${lesson.id}`)) || 0));
    resumeNode.textContent = readingProgress ? `تقدم القراءة المحفوظ: ${readingProgress}%` : `آخر نقطة: ${state.lastLesson || lesson.id}`;
  }
};

const applyTheme = () => {
  const savedTheme = localStorage.getItem('efhama_theme') || 'light';
  document.body.setAttribute('data-theme', savedTheme);
  const button = document.querySelector('[data-theme-toggle]');
  if (button) {
    button.textContent = savedTheme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن';
  }
  updateLessonVisualTheme(document.querySelector('[data-lesson-content]'));
};

const toggleTheme = () => {
  const current = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('efhama_theme', current);
  applyTheme();
};

window.addEventListener('DOMContentLoaded', async () => {
  applyTheme();

  const themeButton = document.querySelector('[data-theme-toggle]');
  if (themeButton) {
    themeButton.addEventListener('click', toggleTheme);
  }

  const page = document.body.dataset.page;
  if (page === 'paths') renderCards().catch((error) => {
    console.error('Unable to render programming paths:', error);
    const root = document.querySelector('[data-path-root]');
    if (root) root.textContent = 'تعذر تحميل المسارات التعليمية. حاول تحديث الصفحة.';
  });
  if (page === 'path-detail') renderPathDetail().catch((error) => {
    console.error('Unable to render learning path:', error);
    const root = document.querySelector('[data-levels-root]');
    if (root) root.textContent = 'تعذر تحميل بيانات المسار. حاول تحديث الصفحة.';
  });
  if (page === 'lesson-detail') renderLessonPage().catch((error) => {
    console.error('Unable to render lesson:', error);
    const title = document.querySelector('[data-lesson-title]');
    const content = document.querySelector('[data-lesson-content]');
    if (title) title.textContent = 'تعذر تحميل الدرس';
    if (content) content.textContent = 'تعذر تحميل محتوى هذا الدرس. تحقق من المسار وحاول مرة أخرى.';
  });
});
