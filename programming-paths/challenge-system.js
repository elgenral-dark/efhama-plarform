(() => {
  const STATE_PREFIX = 'efhama_challenge_';
  const PYTHON_CHANNEL = 'efhama-python-playground';
  const CODE_TYPES = new Set(['complete-code', 'write-code', 'practical-challenge', 'debugging-challenge']);
  const difficultyLabels = { easy: 'سهل', medium: 'متوسط', hard: 'متقدم' };
  const typeLabels = {
    'multiple-choice': 'اختيار من متعدد',
    'true-false': 'صح أو خطأ',
    'code-prediction': 'توقع ناتج الكود',
    'find-error': 'اكتشاف الخطأ',
    'complete-code': 'إكمال الكود',
    'write-code': 'كتابة الحل',
    'code-output': 'تحديد الناتج',
    'practical-challenge': 'تحدٍ عملي',
    'debugging-challenge': 'تحدي تصحيح الأخطاء'
  };
  let pythonFrame;
  let pythonToken = '';
  let pythonReady = false;
  let pendingPython = null;
  let activeWorker = null;
  let busy = false;

  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const safeJson = (value) => JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  const getRecord = (id) => {
    try {
      const record = JSON.parse(localStorage.getItem(`${STATE_PREFIX}${id}`) || 'null');
      if (!record || typeof record !== 'object') return { attempts: 0, bestScore: 0, completed: false, lastScore: 0, lastPassed: false, lastAttemptAt: 0, updatedAt: 0 };
      return {
        attempts: Number.isInteger(record.attempts) && record.attempts >= 0 ? record.attempts : 0,
        bestScore: Number.isInteger(record.bestScore) ? Math.min(100, Math.max(0, record.bestScore)) : 0,
        completed: record.completed === true,
        lastScore: Number.isInteger(record.lastScore) ? Math.min(100, Math.max(0, record.lastScore)) : 0,
        lastPassed: record.lastPassed === true,
        lastAttemptAt: Number.isSafeInteger(record.lastAttemptAt) ? record.lastAttemptAt : 0,
        updatedAt: Number.isSafeInteger(record.updatedAt) ? record.updatedAt : 0
      };
    } catch (error) {
      console.error('Unable to restore challenge progress:', error);
      return { attempts: 0, bestScore: 0, completed: false, lastScore: 0, lastPassed: false, lastAttemptAt: 0, updatedAt: 0 };
    }
  };

  const saveAttempt = (challenge, score) => {
    const previous = getRecord(challenge.id);
    const now = Date.now();
    let persisted = true;
    const record = {
      attempts: previous.attempts + 1,
      bestScore: Math.max(previous.bestScore, score),
      completed: previous.completed || score === 100,
      lastScore: score,
      lastPassed: score === 100,
      lastAttemptAt: now,
      updatedAt: now
    };
    try {
      localStorage.setItem(`${STATE_PREFIX}${challenge.id}`, JSON.stringify(record));
    } catch (error) {
      console.error('Unable to save challenge progress:', error);
      persisted = false;
    }
    return persisted ? { ...record, persisted: true } : { ...previous, persisted: false };
  };

  const renderChoices = (challenge) => `<fieldset class="challenge-options" aria-label="اختر إجابتك">
    ${(challenge.options || []).map((option) => `<label class="challenge-option">
      <input type="radio" name="answer-${escapeHtml(challenge.id)}" value="${escapeHtml(option.id)}">
      <span>${escapeHtml(option.text)}</span>
    </label>`).join('')}
  </fieldset>`;

  const renderCodeInput = (challenge) => {
    const language = challenge.language || 'javascript';
    const fields = language === 'html-css'
      ? `<label>HTML<textarea data-challenge-html spellcheck="false">${escapeHtml(challenge.html || '')}</textarea></label>
         <label>CSS<textarea data-challenge-css spellcheck="false">${escapeHtml(challenge.css || '')}</textarea></label>`
      : `<label>${escapeHtml(language.toUpperCase())}<textarea data-challenge-code spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off">${escapeHtml(challenge.starterCode || '')}</textarea></label>`;
    return `<div class="challenge-code-input" dir="ltr">${fields}</div>`;
  };

  const getHints = (challenge) => (Array.isArray(challenge.hints)
    ? challenge.hints
    : [challenge.hint1, challenge.hint2]).filter((hint) => typeof hint === 'string' && hint.trim());

  const renderCard = (challenge, lesson) => {
    const record = getRecord(challenge.id);
    const isCode = CODE_TYPES.has(challenge.type);
    const showCode = !!challenge.code;
    const title = escapeHtml(challenge.title || 'تحدٍ');
    const hints = getHints(challenge).slice(0, 2);
    const answerInput = isCode
      ? renderCodeInput(challenge)
      : challenge.options ? renderChoices(challenge)
        : `<label class="challenge-answer-label">إجابتك<textarea data-challenge-answer rows="3" maxlength="3000"></textarea></label>`;
    return `<article class="challenge-card${record.completed ? ' is-complete' : ''}" data-challenge-card="${escapeHtml(challenge.id)}">
      <header class="challenge-card-head">
        <div><span class="challenge-type">${escapeHtml(typeLabels[challenge.type] || 'تدريب')}</span><h3>${title}</h3></div>
        <span class="challenge-difficulty difficulty-${escapeHtml(challenge.difficulty)}">${escapeHtml(difficultyLabels[challenge.difficulty] || 'متوسط')}</span>
      </header>
      <p class="challenge-skill"><strong>المهارة:</strong> ${escapeHtml(challenge.skill)} <span>•</span> <a href="lesson.html?slug=${encodeURIComponent(challenge.pathSlug || '')}&lesson=${encodeURIComponent(challenge.lessonId)}">درس مرتبط: ${escapeHtml(lesson?.title || challenge.lessonId)}</a></p>
      <p class="challenge-description">${escapeHtml(challenge.description)}</p>
      <p class="challenge-instructions"><strong>المطلوب:</strong> ${escapeHtml(challenge.instructions)}</p>
      ${showCode ? `<pre class="challenge-example" dir="ltr"><code>${escapeHtml(challenge.code)}</code></pre>` : ''}
      ${answerInput}
      <div class="challenge-actions">
        <button type="button" class="primary-btn" data-challenge-check>${isCode ? 'اختبر الحل' : 'تحقق من الإجابة'}</button>
        <button type="button" class="secondary-btn" data-challenge-hint="0" ${hints.length < 1 ? 'disabled' : ''}>تلميح أول</button>
        <button type="button" class="secondary-btn" data-challenge-hint="1" ${hints.length < 2 ? 'disabled' : ''}>تلميح إضافي</button>
        <button type="button" class="secondary-btn" data-challenge-explanation>شرح الفكرة</button>
        <button type="button" class="secondary-btn" data-challenge-solution ${record.attempts < 2 ? 'disabled' : ''}>${record.attempts < 2 ? 'الحل بعد محاولتين' : 'إظهار الحل النموذجي'}</button>
      </div>
      <p class="challenge-feedback" role="status" aria-live="polite" data-challenge-feedback></p>
      <div class="challenge-help" data-challenge-help></div>
      <footer class="challenge-progress" data-challenge-progress>
        ${record.completed ? '<strong>مكتمل ✓</strong>' : '<span>لم يُحل بعد</span>'}
        <span>أفضل نتيجة: ${record.bestScore}%</span><span>المحاولات: ${record.attempts}</span>
      </footer>
    </article>`;
  };

  const ensurePythonRunner = (root, challenges) => {
    if (pythonFrame || !challenges.some((challenge) => challenge.language === 'python')) return;
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    pythonToken = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    pythonFrame = document.createElement('iframe');
    pythonFrame.className = 'challenge-python-runner';
    pythonFrame.title = 'مشغل اختبارات Python المعزول';
    pythonFrame.setAttribute('sandbox', 'allow-scripts');
    pythonFrame.setAttribute('referrerpolicy', 'no-referrer');
    const url = new URL('./python-runner.html', location.href);
    url.hash = pythonToken;
    pythonFrame.src = url.href;
    root.append(pythonFrame);
  };

  const pythonLiteral = (value) => {
    if (value === null) return 'None';
    if (value === true) return 'True';
    if (value === false) return 'False';
    if (typeof value === 'string') return safeJson(value);
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (Array.isArray(value)) return `[${value.map(pythonLiteral).join(', ')}]`;
    if (value && typeof value === 'object') return `{${Object.entries(value).map(([key, item]) => `${pythonLiteral(key)}: ${pythonLiteral(item)}`).join(', ')}}`;
    throw new Error('Unsupported Python test value');
  };

  const setBusy = (card, value) => {
    busy = value;
    card.querySelector('[data-challenge-check]').disabled = value;
    card.querySelector('[data-challenge-feedback]').textContent = value ? 'جارٍ تشغيل الاختبارات المعزولة...' : '';
  };

  const completeAttempt = (card, challenge, score, message, passedCount, totalCount) => {
    const record = saveAttempt(challenge, score);
    if (score === 100 && record.persisted && window.EfhamaGamification) {
      window.EfhamaGamification.recordActivity('challenge', challenge.id);
      if (Object.keys(window.EfhamaGamification.getState().rewards).some((key) => key.startsWith('challenge:'))) {
        window.EfhamaGamification.unlockBadge('first-challenge');
      }
    }
    setBusy(card, false);
    const feedback = card.querySelector('[data-challenge-feedback]');
    feedback.dataset.state = score === 100 && record.persisted ? 'success' : 'error';
    feedback.textContent = record.persisted
      ? message
      : `${message} تعذر حفظ تقدم التحدي؛ لم تُحتسب المكافأة. تحقق من مساحة التخزين ثم أعد المحاولة.`;
    const progress = card.querySelector('[data-challenge-progress]');
    progress.innerHTML = `${record.completed ? '<strong>مكتمل ✓</strong>' : '<span>لم يُحل بعد</span>'}
      <span>أفضل نتيجة: ${record.bestScore}%</span><span>المحاولات: ${record.attempts}</span>`;
    card.classList.toggle('is-complete', record.completed);
    const solutionButton = card.querySelector('[data-challenge-solution]');
    if (record.attempts >= 2) {
      solutionButton.disabled = false;
      solutionButton.textContent = 'إظهار الحل النموذجي';
    }
    if (passedCount !== undefined && totalCount) {
      feedback.textContent += ` اجتزت ${passedCount} من ${totalCount} حالات اختبار.`;
    }
    updateSummary();
  };

  const runJavaScriptTests = (challenge, code, callback) => {
    if (activeWorker) activeWorker.terminate();
    const functionName = String(challenge.functionName || '');
    if (!/^[A-Za-z_$][\w$]*$/.test(functionName) || code.length > 12000 || !challenge.tests?.length || challenge.tests.length > 20) {
      callback({ score: 0, message: 'تعذر التحقق: إعدادات الاختبار غير صالحة أو تجاوز الكود الحد المسموح.' });
      return;
    }
    const prefix = `
      const __efhamaDeny = () => { throw new Error("الاتصال بالشبكة غير متاح في هذا التحدي."); };
      for (const __name of ["fetch","XMLHttpRequest","WebSocket","EventSource","importScripts","Worker","SharedWorker","BroadcastChannel","indexedDB","caches","WebTransport","RTCPeerConnection","WebSocketStream"]) {
        try {
          Object.defineProperty(self, __name, { configurable: false, writable: false, value: __name === "fetch" ? __efhamaDeny : undefined });
        } catch (__efhamaSecurityError) {
          throw new Error("تعذر تعطيل واجهة اتصال غير لازمة: " + __name);
        }
      }
      let __efhamaOutput = "";
      Object.defineProperty(self, "console", { configurable: false, writable: false, value: Object.freeze({ log: (...items) => { __efhamaOutput = (__efhamaOutput + items.map(String).join(" ") + "\\\\n").slice(0, 4000); }, warn: () => {}, error: () => {} }) });
    `;
    const testHarness = `
      ;(() => {
        const __efhamaCases = ${safeJson(challenge.tests)};
        const __efhamaTarget = typeof ${functionName} === "function" ? ${functionName} : null;
      const __efhamaNormalize = (value) => {
        if (Array.isArray(value)) return value.map(__efhamaNormalize);
        if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, __efhamaNormalize(value[key])]));
        return value;
      };
      let __efhamaPassed = 0;
      let __efhamaError = "";
      for (let __efhamaIndex = 0; __efhamaIndex < __efhamaCases.length; __efhamaIndex += 1) {
        try {
          if (!__efhamaTarget) throw new Error("اكتب دالة ${functionName}.");
          const __efhamaActual = __efhamaTarget(...__efhamaCases[__efhamaIndex].input);
          if (JSON.stringify(__efhamaNormalize(__efhamaActual)) !== JSON.stringify(__efhamaNormalize(__efhamaCases[__efhamaIndex].expected))) throw new Error("قيمة غير متوقعة");
            __efhamaPassed += 1;
          } catch (__efhamaTestError) { __efhamaError = String(__efhamaTestError && __efhamaTestError.message || __efhamaTestError); }
        }
        self.postMessage({ type: "tests", passed: __efhamaPassed, total: __efhamaCases.length, error: __efhamaError, output: __efhamaOutput });
      })();
    `;
    const workerSource = `${prefix}\n${code}\n${testHarness}`;
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    try {
      activeWorker = new Worker(workerUrl);
    } catch (error) {
      URL.revokeObjectURL(workerUrl);
      callback({ score: 0, message: 'تعذر بدء عامل الاختبار المعزول في هذا المتصفح.' });
      return;
    }
    const worker = activeWorker;
    const finish = (result) => {
      if (activeWorker !== worker) return;
      worker.terminate();
      activeWorker = null;
      URL.revokeObjectURL(workerUrl);
      callback(result);
    };
    const timer = setTimeout(() => finish({ score: 0, message: 'أُوقف الحل لتجاوز مهلة التنفيذ (3 ثوانٍ).' }), 3000);
    const finishWithTimer = (result) => {
      clearTimeout(timer);
      finish(result);
    };
    worker.onmessage = (event) => {
      const data = event.data || {};
      if (data.type !== 'tests') return;
      const score = data.total ? Math.round((data.passed / data.total) * 100) : 0;
      finishWithTimer({
        score,
        passedCount: data.passed,
        totalCount: data.total,
        message: score === 100 ? 'أحسنت! اجتزت كل حالات الاختبار.' : `لم ينجح الحل في كل الحالات.${data.error ? ` راجع الدالة والمدخل رقم ${Math.min(data.passed + 1, data.total)}.` : ''}`
      });
    };
    worker.onerror = (event) => finishWithTimer({ score: 0, message: `حدث خطأ أثناء تحليل الحل: ${event.message || 'تحقق من صياغة JavaScript.'}` });
  };

  const runPythonTests = (challenge, code, card, callback) => {
    if (!pythonReady || !pythonFrame?.contentWindow) {
      callback({ score: 0, message: 'بيئة Python لم تجهز بعد. انتظر رسالة الجاهزية ثم أعد المحاولة.' }, false);
      return;
    }
    const functionName = String(challenge.functionName || '');
    if (!/^[A-Za-z_]\w*$/.test(functionName) || code.length > 20000 || !challenge.tests?.length || challenge.tests.length > 20) {
      callback({ score: 0, message: 'تعذر التحقق: إعدادات الاختبار غير صالحة أو تجاوز الكود الحد المسموح.' });
      return;
    }
    let harness;
    try {
      harness = `
__efhama_cases = ${pythonLiteral(challenge.tests)}
__efhama_function = globals().get(${pythonLiteral(functionName)})
__efhama_passed = 0
__efhama_error = ""
if callable(__efhama_function):
    for __efhama_case in __efhama_cases:
        try:
            if __efhama_function(*__efhama_case["input"]) == __efhama_case["expected"]:
                __efhama_passed += 1
            else:
                __efhama_error = "راجع نتيجة الدالة لإحدى حالات الاختبار."
        except Exception as __efhama_exception:
            __efhama_error = type(__efhama_exception).__name__
print("__EFHAMA_SCORE__" + str(__efhama_passed) + "/" + str(len(__efhama_cases)))
`;
    } catch (error) {
      callback({ score: 0, message: 'تعذر تجهيز بيانات الاختبار.' });
      return;
    }
    pendingPython = { challenge, callback };
    setBusy(card, true);
    pythonFrame.contentWindow.postMessage({
      channel: PYTHON_CHANNEL,
      token: pythonToken,
      command: 'run',
      code: `${code}\n${harness}`
    }, '*');
  };

  const evaluateMarkup = (challenge, card) => {
    const language = challenge.language;
    const source = language === 'html' ? card.querySelector('[data-challenge-code]').value : '';
    const css = language === 'css' ? card.querySelector('[data-challenge-code]').value : '';
    const html = language === 'html-css' ? card.querySelector('[data-challenge-html]').value : source;
    const stylesheet = language === 'html-css' ? card.querySelector('[data-challenge-css]').value : css;
    if (`${html}${stylesheet}`.trim().length === 0 || html.length + stylesheet.length > 12000) {
      return { score: 0, message: 'أضف حلًا قبل التحقق، وبحد أقصى 12,000 حرف.' };
    }
    let doc;
    try { doc = new DOMParser().parseFromString(html, 'text/html'); }
    catch (error) { return { score: 0, message: 'تعذر تحليل HTML. تحقق من بنية العناصر.' }; }
    let rules = [];
    if (stylesheet.trim()) {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(stylesheet);
        rules = [...sheet.cssRules];
      } catch (error) {
        return { score: 0, message: `تعذر تحليل CSS: ${error.message}` };
      }
    }
    const findRule = (selector, property, mediaCondition = '') => {
      const scan = (items) => {
        for (const rule of items) {
          if (rule instanceof CSSStyleRule && rule.selectorText.split(',').some((item) => item.trim() === selector)
            && rule.style.getPropertyValue(property).trim()) return rule;
          if (rule instanceof CSSMediaRule && (!mediaCondition || rule.conditionText.includes(mediaCondition))) {
            const found = scan(rule.cssRules);
            if (found) return found;
          }
        }
        return null;
      };
      return scan(rules);
    };
    let passed = 0;
    const assertions = challenge.assertions || [];
    for (const assertion of assertions) {
      try {
        let valid = false;
        if (assertion.kind === 'selector') valid = !!doc.querySelector(assertion.selector);
        else if (assertion.kind === 'text') valid = (doc.querySelector(assertion.selector)?.textContent || '').includes(assertion.contains || '');
        else if (assertion.kind === 'attribute') {
          const value = doc.querySelector(assertion.selector)?.getAttribute(assertion.name) || '';
          valid = assertion.nonEmpty ? !!value.trim() : value.includes(assertion.contains || '');
        } else if (assertion.kind === 'count') valid = doc.querySelectorAll(assertion.selector).length >= assertion.minimum;
        else if (assertion.kind === 'label-for-input') {
          const label = doc.querySelector('form label[for]');
          valid = !!label && !!doc.getElementById(label.htmlFor) && doc.querySelector('form input[type="email"]')?.id === label.htmlFor;
        } else if (assertion.kind === 'css-property' || assertion.kind === 'media-property') {
          const rule = findRule(assertion.selector, assertion.property, assertion.condition || '');
          const value = rule?.style.getPropertyValue(assertion.property).trim() || '';
          valid = assertion.contains ? value.toLowerCase().includes(assertion.contains.toLowerCase())
            : assertion.nonEmpty ? !!value : value.toLowerCase() === assertion.value.toLowerCase();
        } else if (assertion.kind === 'media') {
          valid = rules.some((rule) => rule instanceof CSSMediaRule && rule.conditionText.includes(assertion.condition));
        }
        if (valid) passed += 1;
      } catch (error) {
        return { score: Math.round((passed / Math.max(1, assertions.length)) * 100), passedCount: passed, totalCount: assertions.length, message: 'تعذر فحص أحد العناصر أو المحددات. راجع الصياغة.' };
      }
    }
    const score = assertions.length ? Math.round((passed / assertions.length) * 100) : 0;
    return {
      score,
      passedCount: passed,
      totalCount: assertions.length,
      message: score === 100 ? 'أحسنت! بنية الحل تحقق المطلوب.' : 'بعض المتطلبات لم تتحقق بعد. راجع التعليمات والتلميحات.'
    };
  };

  const evaluateRubric = (challenge, code) => {
    const cleaned = code.toLowerCase().replace(/#.*$/gm, '').replace(/--.*$/gm, '').trim();
    if (!cleaned) return { score: 0, message: 'اكتب خطوات الحل قبل التحقق.' };
    const terms = (challenge.requiredTerms || []).map((term) => String(term).toLowerCase());
    let found = 0;
    let lastIndex = -1;
    for (const term of terms) {
      const index = cleaned.indexOf(term);
      if (index >= lastIndex && index >= 0) {
        found += 1;
        lastIndex = index + term.length;
      }
    }
    const score = terms.length ? Math.round((found / terms.length) * 100) : 0;
    return {
      score,
      passedCount: found,
      totalCount: terms.length,
      message: score === 100 ? 'أحسنت! جميع الخطوات الأساسية موجودة بالترتيب.' : 'راجع الخطوات المطلوبة وترتيبها؛ يمكنك طلب تلميح عند الحاجة.'
    };
  };

  const runSqlTests = async (challenge, code, callback) => {
    if (!code.trim()) {
      callback({ score: 0, message: 'اكتب استعلامًا قبل التحقق.' });
      return;
    }
    try {
      const response = await fetch('/api/challenges/sql', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: challenge.id, query: code })
      });
      const result = await response.json();
      if (!response.ok) {
        callback({ score: 0, message: result.message || 'تعذر التحقق من استعلام SQL.' });
        return;
      }
      callback({
        score: result.score,
        passedCount: result.passed,
        totalCount: result.total,
        message: result.message
      });
    } catch (error) {
      console.error('Unable to verify isolated SQL challenge:', error);
      callback({ score: 0, message: 'تعذر الاتصال بمشغل SQL المعزول. تحقق من الاتصال وأعد المحاولة.' });
    }
  };

  const updateSummary = () => {
    const root = document.querySelector('[data-challenge-root]');
    if (!root) return;
    const cards = [...root.querySelectorAll('[data-challenge-card]')];
    const completed = cards.filter((card) => getRecord(card.dataset.challengeCard).completed).length;
    const summary = root.querySelector('[data-challenge-summary]');
    if (summary) summary.textContent = `أكملت ${completed} من ${cards.length} تحديًا. التحديات غير المحلولة ما زالت محفوظة للعودة إليها.`;
  };

  const evaluateAnswer = (challenge, card) => {
    if (CODE_TYPES.has(challenge.type)) {
      if (challenge.language === 'python') {
        const code = card.querySelector('[data-challenge-code]').value;
        if (!code.trim()) return { message: 'اكتب حلًا قبل التحقق.', countAttempt: false };
        if (!pythonReady) return { message: 'جار تجهيز Python. انتظر رسالة الجاهزية ثم أعد المحاولة.', countAttempt: false };
        return { run: (done) => runPythonTests(challenge, code, card, done) };
      }
      if (challenge.language === 'javascript') {
        const code = card.querySelector('[data-challenge-code]').value;
        if (!code.trim()) return { message: 'اكتب حلًا قبل التحقق.', countAttempt: false };
        return { run: (done) => runJavaScriptTests(challenge, code, done) };
      }
      if (['html', 'css', 'html-css'].includes(challenge.language)) {
        const result = evaluateMarkup(challenge, card);
        return { result };
      }
      if (challenge.language === 'sql') {
        const code = card.querySelector('[data-challenge-code]').value;
        if (!code.trim()) return { message: 'اكتب استعلامًا قبل التحقق.', countAttempt: false };
        return { run: (done) => runSqlTests(challenge, code, done) };
      }
      return { result: evaluateRubric(challenge, card.querySelector('[data-challenge-code]').value) };
    }
    const selection = card.querySelector('input[type="radio"]:checked');
    const written = card.querySelector('[data-challenge-answer]')?.value.trim();
    if (!selection && !written) return { message: 'أدخل إجابتك أولًا.', countAttempt: false };
    const answer = selection ? selection.value : written.toLowerCase().replace(/\s+/g, ' ');
    const expected = String(challenge.answer ?? '').toLowerCase().replace(/\s+/g, ' ');
    const correct = answer === expected;
    return {
      result: {
        score: correct ? 100 : 0,
        message: correct ? `إجابة صحيحة! ${challenge.explanation || ''}` : `الإجابة تحتاج مراجعة. ${challenge.explanation || ''}`
      }
    };
  };

  const showHint = (card, challenge, index) => {
    const hints = getHints(challenge);
    if (hints[index]) card.querySelector('[data-challenge-help]').textContent = hints[index];
  };

  const bindCards = (root, challenges) => {
    const byId = new Map(challenges.map((challenge) => [challenge.id, challenge]));
    root.onclick = (event) => {
      const card = event.target.closest('[data-challenge-card]');
      if (!card || !root.contains(card)) return;
      const challenge = byId.get(card.dataset.challengeCard);
      if (!challenge) return;
      const hintButton = event.target.closest('[data-challenge-hint]');
      if (hintButton) {
        showHint(card, challenge, Number(hintButton.dataset.challengeHint));
        return;
      }
      if (event.target.closest('[data-challenge-explanation]')) {
        card.querySelector('[data-challenge-help]').textContent = challenge.explanation || 'راجع خطوات الحل ثم جرّب مرة أخرى.';
        return;
      }
      if (event.target.closest('[data-challenge-solution]')) {
        const record = getRecord(challenge.id);
        const feedback = card.querySelector('[data-challenge-feedback]');
        if (record.attempts < 2) {
          feedback.textContent = 'جرّب الحل مرة أخرى واستخدم التلميحات قبل كشف الحل النموذجي.';
          feedback.dataset.state = 'error';
          return;
        }
        card.querySelector('[data-challenge-help]').textContent = challenge.solution || 'لا يتوفر حل نموذجي لهذا التحدي.';
        return;
      }
      if (!event.target.closest('[data-challenge-check]') || busy) return;
      const feedback = card.querySelector('[data-challenge-feedback]');
      const submission = evaluateAnswer(challenge, card);
      if (submission.message) {
        feedback.textContent = submission.message;
        feedback.dataset.state = submission.countAttempt === false ? '' : 'error';
        return;
      }
      if (submission.run) {
        setBusy(card, true);
        submission.run((result, countAttempt = true) => {
          if (!countAttempt) {
            setBusy(card, false);
            feedback.textContent = result.message;
            feedback.dataset.state = 'error';
            return;
          }
          completeAttempt(card, challenge, result.score, result.message, result.passedCount, result.totalCount);
        });
        return;
      }
      completeAttempt(card, challenge, submission.result.score, submission.result.message, submission.result.passedCount, submission.result.totalCount);
    };
  };

  const render = async (slug, path) => {
    const root = document.querySelector('[data-challenge-root]');
    if (!root) return;
    const response = await fetch('../data/challenges.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to load challenges: HTTP ${response.status}`);
    const bank = await response.json();
    const lessons = new Map((path.levels || []).flatMap((level) => level.lessons || []).map((lesson) => [lesson.id, lesson]));
    const challenges = (bank[slug] || []).filter((challenge) => lessons.has(challenge.lessonId)).map((challenge) => ({ ...challenge, pathSlug: slug }));
    if (!challenges.length) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    root.innerHTML = `<header class="challenge-hub-header">
      <div><span class="kicker">Practice Lab</span><h2 id="challenge-hub-title">تمارين وتحديات المسار</h2>
        <p>تدريبات مرتبطة بمهارات الدروس، مع مستويات متدرجة واختبارات متعددة للحلول البرمجية.</p></div>
      <p class="challenge-summary" data-challenge-summary></p>
    </header>
    <div class="challenge-grid">${challenges.map((challenge) => renderCard(challenge, lessons.get(challenge.lessonId))).join('')}</div>
    <p class="challenge-security-note">تشغيل JavaScript يتم داخل Web Worker معزول بلا وصول إلى DOM أو تخزين المنصة، وتشغيل Python داخل بيئة Pyodide المعزولة، واختبارات SQL في عملية منفصلة على قاعدة مؤقتة للقراءة فقط. HTML/CSS تُحلل دون تشغيل JavaScript.</p>`;
    bindCards(root, challenges);
    updateSummary();
    ensurePythonRunner(root, challenges);
    window.addEventListener('message', (event) => {
      if (!pythonFrame || event.source !== pythonFrame.contentWindow || event.data?.channel !== PYTHON_CHANNEL || event.data?.token !== pythonToken) return;
      const data = event.data;
      if (data.type === 'loading') {
        pythonReady = false;
        root.querySelectorAll('[data-challenge-card]').forEach((card) => {
          if (byLanguage(card, 'python')) card.querySelector('[data-challenge-feedback]').textContent = 'جار تجهيز Python محليًا داخل بيئة معزولة...';
        });
      } else if (data.type === 'ready') {
        pythonReady = true;
        root.querySelectorAll('[data-challenge-card]').forEach((card) => {
          if (card.querySelector('[data-challenge-code]')?.closest('.challenge-code-input') && byLanguage(card, 'python')) {
            card.querySelector('[data-challenge-feedback]').textContent = 'بيئة Python جاهزة للتشغيل.';
          }
        });
      } else if (data.type === 'error') {
        pythonReady = false;
        const pending = pendingPython;
        pendingPython = null;
        if (pending) pending.callback({ score: 0, message: data.message || 'تعذر تشغيل اختبارات Python.' });
      } else if (data.type === 'result' && pendingPython) {
        const pending = pendingPython;
        pendingPython = null;
        const output = String(data.stdout || '');
        const match = output.match(/__EFHAMA_SCORE__(\d+)\/(\d+)/);
        if (!match) {
          pending.callback({ score: 0, message: data.error?.message || 'لم تكتمل حالات الاختبار. راجع الكود وحاول مجددًا.' });
          return;
        }
        const passedCount = Number(match[1]);
        const totalCount = Number(match[2]);
        const score = totalCount ? Math.round((passedCount / totalCount) * 100) : 0;
        pending.callback({
          score,
          passedCount,
          totalCount,
          message: score === 100 ? 'أحسنت! اجتزت كل حالات الاختبار.' : 'بعض حالات الاختبار لم تنجح. راجع الدالة والمدخلات المختلفة.'
        });
      } else if ((data.type === 'timeout' || data.type === 'stopped') && pendingPython) {
        const pending = pendingPython;
        pendingPython = null;
        pending.callback({ score: 0, message: data.message || 'تم إيقاف التنفيذ.' });
      }
    });
  };

  const byLanguage = (card, language) => {
    const input = card.querySelector('[data-challenge-code]');
    return !!input && input.closest('.challenge-code-input')?.textContent.toLowerCase().includes(language);
  };

  window.EfhamaChallengeSystem = Object.freeze({ render });
})();
