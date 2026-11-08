(() => {
  const PYODIDE_VERSION = '314.0.7';
  const EXECUTION_TIMEOUT = 5000;
  const MAX_CODE_LENGTH = 20000;

  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const escapeScriptData = (value) => JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  function workerRuntime(assetsUrl) {
    const root = JSON.stringify(assetsUrl);
    const moduleUrl = JSON.stringify(`${assetsUrl}pyodide.mjs`);
    return `import { loadPyodide } from ${moduleUrl};

let pyodide;

const blockNetworkAccess = () => {
  const disabled = () => Promise.reject(new Error("Network access is disabled in this Python playground."));
  const blocked = {
    fetch: disabled,
    XMLHttpRequest: undefined,
    WebSocket: undefined,
    EventSource: undefined,
    importScripts: undefined,
    Worker: undefined,
    SharedWorker: undefined,
    BroadcastChannel: undefined,
    indexedDB: undefined,
    caches: undefined
  };
  Object.entries(blocked).forEach(([name, value]) => {
    try {
      Object.defineProperty(self, name, { configurable: false, writable: false, value });
    } catch (error) {
      self.postMessage({ type: "error", phase: "runtime", message: "تعذر تعطيل واجهة الشبكة المطلوبة." });
      throw error;
    }
  });
};

self.addEventListener("message", async (event) => {
  const data = event.data || {};
  if (data.type === "init") {
    try {
      pyodide = await loadPyodide({ indexURL: ${root} });
      blockNetworkAccess();
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({
        type: "error",
        phase: "load",
        message: error && error.message ? error.message : String(error)
      });
    }
    return;
  }

  if (data.type !== "run" || !pyodide) return;
  let globals;
  let result;
  try {
    globals = pyodide.toPy({});
    globals.set("_efhama_source", String(data.code || ""));
    result = await pyodide.runPythonAsync([
      "import contextlib, io, traceback",
      "class _EfhamaWriter(io.StringIO):",
      "    def __init__(self):",
      "        super().__init__()",
      "        self.size = 0",
      "        self.truncated = False",
      "    def write(self, text):",
      "        text = str(text)",
      "        remaining = max(0, 40000 - self.size)",
      "        if remaining:",
      "            super().write(text[:remaining])",
      "            self.size += min(len(text), remaining)",
      "        if len(text) > remaining:",
      "            self.truncated = True",
      "        return len(text)",
      "_efhama_stdout = _EfhamaWriter()",
      "_efhama_stderr = _EfhamaWriter()",
      "_efhama_error = None",
      "try:",
      "    with contextlib.redirect_stdout(_efhama_stdout), contextlib.redirect_stderr(_efhama_stderr):",
      "        exec(compile(_efhama_source, '<student>', 'exec'), {})",
      "except BaseException as _efhama_exception:",
      "    _efhama_error = {",
      "        'name': type(_efhama_exception).__name__,",
      "        'message': ''.join(traceback.format_exception(_efhama_exception))[-12000:]",
      "    }",
      "{",
      "    'stdout': _efhama_stdout.getvalue(),",
      "    'stderr': _efhama_stderr.getvalue(),",
      "    'error': _efhama_error,",
      "    'truncated': _efhama_stdout.truncated or _efhama_stderr.truncated",
      "}"
    ].join("\\n"), { globals });
    const output = result.toJs({ dict_converter: Object.fromEntries });
    self.postMessage({ type: "result", output });
  } catch (error) {
    self.postMessage({
      type: "error",
      phase: "runtime",
      message: error && error.message ? error.message : String(error)
    });
  } finally {
    if (result && typeof result.destroy === "function") result.destroy();
    if (globals && typeof globals.destroy === "function") globals.destroy();
  }
});
`;
  }

  function iframeRunner(token, assetsUrl, workerRuntimeSource) {
    const channel = 'efhama-python-playground';
    let worker = null;
    let workerUrl = '';
    let executionTimer = 0;
    let loadingTimer = 0;
    let activeRun = 0;

    const sendParent = (type, details = {}) => parent.postMessage({ channel, token, type, ...details }, '*');
    const clearTimers = () => {
      clearTimeout(executionTimer);
      clearTimeout(loadingTimer);
      executionTimer = 0;
      loadingTimer = 0;
    };
    const terminateWorker = () => {
      clearTimers();
      if (worker) {
        worker.terminate();
        worker = null;
      }
      if (workerUrl) {
        URL.revokeObjectURL(workerUrl);
        workerUrl = '';
      }
    };
    const startWorker = () => {
      terminateWorker();
      sendParent('loading');
      try {
        const source = `(${workerRuntimeSource})(${JSON.stringify(assetsUrl)});`;
        workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        worker = new Worker(workerUrl, { type: 'module' });
      } catch (error) {
        sendParent('error', { phase: 'load', message: error?.message || 'المتصفح لا يدعم تشغيل Python المعزول.' });
        return;
      }

      const currentWorker = worker;
      worker.onmessage = (event) => {
        if (worker !== currentWorker) return;
        const data = event.data || {};
        if (data.type === 'ready') {
          clearTimeout(loadingTimer);
          loadingTimer = 0;
          sendParent('ready');
        } else if (data.type === 'result') {
          clearTimeout(executionTimer);
          executionTimer = 0;
          sendParent('result', data.output || {});
        } else if (data.type === 'error') {
          terminateWorker();
          sendParent('error', { phase: data.phase, message: data.message });
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        if (worker !== currentWorker) return;
        terminateWorker();
      sendParent('error', { phase: 'load', message: event.message || 'تعذر تحميل بيئة Python المحلية. تحقق من تثبيت ملفاتها ودعم المتصفح.' });
      };
      loadingTimer = window.setTimeout(() => {
        if (worker !== currentWorker) return;
        terminateWorker();
        sendParent('error', { phase: 'load', message: 'استغرق تجهيز بيئة Python وقتًا أطول من المتوقع.' });
      }, 90000);
      worker.postMessage({ type: 'init' });
    };

    window.addEventListener('message', (event) => {
      if (event.source !== parent || event.data?.channel !== channel || event.data?.token !== token) return;
      const data = event.data;
      if (data.command === 'run' && worker) {
        activeRun += 1;
        const thisRun = activeRun;
        worker.postMessage({ type: 'run', code: String(data.code || '').slice(0, 20000) });
        sendParent('started');
        executionTimer = window.setTimeout(() => {
          if (thisRun !== activeRun || !worker) return;
          terminateWorker();
          sendParent('timeout', { message: 'تم إيقاف الكود لتجاوز مهلة التنفيذ (5 ثوانٍ).' });
          startWorker();
        }, 5000);
      } else if (data.command === 'stop') {
        activeRun += 1;
        terminateWorker();
        sendParent('stopped');
        startWorker();
      } else if (data.command === 'restart') {
        activeRun += 1;
        startWorker();
      }
    });

    startWorker();
  }

  const makeToken = () => {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  };

  const buildRunnerDocument = (token) => {
    const nonce = makeToken();
    const assetsUrl = new URL(`/vendor/pyodide/v${PYODIDE_VERSION}/`, window.location.href).href;
    const assetsOrigin = new URL(assetsUrl).origin;
    const policy = [
      "default-src 'none'",
      `script-src 'nonce-${nonce}' ${assetsOrigin} blob: 'wasm-unsafe-eval'`,
      'worker-src blob:',
      `connect-src ${assetsOrigin}`,
      "img-src data:",
      "style-src 'unsafe-inline'",
      "font-src 'none'",
      "media-src 'none'",
      "object-src 'none'",
      "frame-src 'none'",
      "form-action 'none'",
      "base-uri 'none'"
    ].join('; ');
    const runnerSource = `(${iframeRunner.toString()})(${escapeScriptData(token)},${escapeScriptData(assetsUrl)},${escapeScriptData(workerRuntime.toString())});`;
    return `<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}"><meta name="viewport" content="width=device-width, initial-scale=1"><script nonce="${nonce}">${runnerSource}</script></head><body></body></html>`;
  };

  const render = (block) => `<section class="html-css-playground python-playground" data-python-playground data-python-config="${escapeHtml(JSON.stringify(block))}">
    <header class="playground-heading">
      <div><span class="playground-kicker">Python Lab</span><h4>${escapeHtml(block.title || 'مختبر Python')}</h4>${block.description ? `<p>${escapeHtml(block.description)}</p>` : ''}</div>
      <span class="playground-security-note">Python يعمل محليًا داخل Worker معزول</span>
    </header>
    ${block.instructions ? `<div class="playground-task"><strong>المهمة</strong><p>${escapeHtml(block.instructions)}</p></div>` : ''}
    <div class="playground-workspace python-workspace">
      <div class="playground-editors">
        <div class="playground-editor-toolbar"><strong>Python Code Editor</strong><button type="button" class="playground-copy-button" data-python-copy>نسخ Python</button></div>
        <div class="playground-editor-stage" data-python-stage>
          <div class="playground-gutter" aria-hidden="true" data-python-gutter></div>
          <pre class="playground-highlight" aria-hidden="true"><code data-python-highlight></code></pre>
          <textarea spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="محرر Python" data-python-editor></textarea>
        </div>
        <div class="playground-editor-actions">
          <button type="button" class="playground-run-button" data-python-run>تشغيل الكود</button>
          <button type="button" class="python-stop-button" data-python-stop disabled>إيقاف التنفيذ</button>
          <button type="button" class="playground-reset-button" data-python-reset>إعادة ضبط الكود</button>
        </div>
      </div>
      <section class="python-console-panel" aria-label="Python Output Console">
        <div class="playground-preview-toolbar"><strong>Output Console</strong><div><span role="status" aria-live="polite" data-python-status data-state="loading">جارٍ تجهيز بيئة Python...</span><button type="button" class="javascript-clear-console" data-python-clear>مسح النتائج</button></div></div>
        <div class="python-console-output" role="log" aria-live="polite" aria-relevant="additions text" data-python-output><p class="python-console-empty">جارٍ تحميل Pyodide. قد يستغرق التحميل الأول بعض الوقت.</p></div>
        <div class="python-error-output" role="alert" aria-live="assertive" data-python-errors hidden></div>
      </section>
      <iframe class="python-hidden-runner" title="بيئة Python معزولة" sandbox="allow-scripts" referrerpolicy="no-referrer" data-python-runner></iframe>
    </div>
    ${block.expectedOutput ? `<div class="playground-expected"><strong>الناتج المتوقع</strong><p>${escapeHtml(block.expectedOutput)}</p></div>` : ''}
    ${Array.isArray(block.checks) && block.checks.length ? `<div class="playground-challenge" data-python-challenge><button type="button" class="playground-check-button" data-python-check>تحقق من التحدي</button><button type="button" class="playground-retry-button" data-python-retry>إعادة المحاولة</button><p role="status" aria-live="polite" data-python-check-status></p></div>` : ''}
    ${block.solution && typeof block.solution.code === 'string' ? `<details class="playground-solution"><summary>عرض الحل النموذجي</summary><p>يمكنك تجربة الحل ثم إعادة المحاولة.</p><button type="button" class="playground-solution-button" data-python-solution>تحميل الحل في المحرر</button></details>` : ''}
    <div class="playground-expected python-runtime-note"><strong>عن بيئة التشغيل</strong><p>تعمل Python ${PYODIDE_VERSION} داخل متصفحك باستخدام Pyodide المستضاف مع المنصة؛ لا يُرسل كودك إلى خادم تشغيل. تتوفر مكتبات Python القياسية المضمنة فقط، والشبكة معطّلة. حد التنفيذ 5 ثوانٍ والكود 20,000 حرف. لا يوفّر المتصفح حدًا دقيقًا لذاكرة WebAssembly.</p><button type="button" class="playground-reset-button" data-python-runtime-retry hidden>إعادة محاولة تحميل Python</button></div>
  </section>`;

  const initialize = (root, slug, lessonId) => {
    root.querySelectorAll('[data-python-playground]').forEach((playground) => {
      if (playground.dataset.initialized) return;
      playground.dataset.initialized = 'true';
      let config;
      try {
        config = JSON.parse(playground.dataset.pythonConfig || '{}');
      } catch (error) {
        console.error('Unable to parse Python playground data:', error);
        playground.textContent = 'تعذر تحميل بيانات محرر Python لهذا النشاط.';
        return;
      }

      const editor = playground.querySelector('[data-python-editor]');
      const stage = playground.querySelector('[data-python-stage]');
      const highlighted = playground.querySelector('[data-python-highlight]');
      const overlay = playground.querySelector('.playground-highlight');
      const gutter = playground.querySelector('[data-python-gutter]');
      const output = playground.querySelector('[data-python-output]');
      const errors = playground.querySelector('[data-python-errors]');
      const status = playground.querySelector('[data-python-status]');
      const runner = playground.querySelector('[data-python-runner]');
      const stopButton = playground.querySelector('[data-python-stop]');
      const retryButton = playground.querySelector('[data-python-runtime-retry]');
      const token = makeToken();
      const defaults = typeof config.code === 'string' ? config.code : '';
      const key = `efhama_python_playground_${slug}_${lessonId}_${config.id || 'default'}`;
      let runnerReady = false;
      let pendingRun = false;
      let isRunning = false;

      const setStatus = (message, state = '') => {
        status.textContent = message;
        status.dataset.state = state;
      };
      const updateEditor = () => {
        highlighted.innerHTML = window.EfhamaCodeBlocks.highlight(editor.value, 'python') || '&#8203;';
        gutter.textContent = Array.from({ length: editor.value.split('\n').length }, (_, index) => index + 1).join('\n');
        stage.classList.toggle('has-long-lines', editor.value.split('\n').some((line) => line.length > 100));
      };
      const clearConsole = () => {
        output.replaceChildren();
        const empty = document.createElement('p');
        empty.className = 'python-console-empty';
        empty.textContent = 'لا توجد نتائج حتى الآن.';
        output.append(empty);
        errors.replaceChildren();
        errors.hidden = true;
      };
      const appendOutput = (text) => {
        const value = String(text || '').slice(0, 40000);
        if (!value) return;
        output.querySelector('.python-console-empty')?.remove();
        const line = document.createElement('pre');
        line.className = 'python-console-line';
        line.textContent = value;
        output.append(line);
      };
      const setCode = (code) => {
        editor.value = code;
        updateEditor();
        persist();
      };
      const persist = () => {
        try {
          localStorage.setItem(key, editor.value);
        } catch (error) {
          console.error('Unable to save Python playground draft:', error);
          setStatus('تعذر حفظ المسودة على هذا الجهاز.', 'error');
        }
      };
      const sendToRunner = (command, details = {}) => {
        runner.contentWindow?.postMessage({ channel: 'efhama-python-playground', token, command, ...details }, '*');
      };
      const run = () => {
        if (editor.value.length > MAX_CODE_LENGTH) {
          setStatus('الكود أطول من الحد المسموح (20,000 حرف).', 'error');
          return;
        }
        clearConsole();
        if (!runnerReady) {
          pendingRun = true;
          setStatus('جارٍ تجهيز Python؛ سيعمل الكود بعد اكتمال التحميل...', 'loading');
          return;
        }
        pendingRun = false;
        isRunning = true;
        stopButton.disabled = false;
        setStatus('جارٍ تنفيذ كود Python...', 'running');
        sendToRunner('run', { code: editor.value });
      };
      const copyCode = async (button) => {
        let copied = false;
        try {
          await navigator.clipboard.writeText(editor.value);
          copied = true;
        } catch (error) {
          let textarea;
          try {
            textarea = document.createElement('textarea');
            textarea.value = editor.value;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.append(textarea);
            textarea.select();
            copied = document.execCommand('copy');
          } catch (copyError) {
            console.error('Unable to copy Python playground code:', copyError);
          } finally {
            textarea?.remove();
          }
        }
        button.textContent = copied ? 'تم النسخ' : 'تعذر النسخ';
        window.setTimeout(() => { if (button.isConnected) button.textContent = 'نسخ Python'; }, 1600);
      };

      try {
        const saved = localStorage.getItem(key);
        editor.value = typeof saved === 'string' ? saved : defaults;
      } catch (error) {
        console.error('Unable to restore Python playground draft:', error);
        editor.value = defaults;
        setStatus('تعذر استعادة المسودة؛ تم تحميل الكود الأصلي.', 'error');
      }
      updateEditor();
      const runnerUrl = new URL('./python-runner.html', window.location.href);
      runnerUrl.hash = token;
      runner.src = runnerUrl.href;

      window.addEventListener('message', (event) => {
        if (event.source !== runner.contentWindow || event.data?.channel !== 'efhama-python-playground' || event.data?.token !== token) return;
        const data = event.data;
        if (data.type === 'loading') {
          runnerReady = false;
          stopButton.disabled = false;
          retryButton.hidden = true;
          setStatus('جارٍ تحميل بيئة Python إلى متصفحك. قد يستغرق التحميل الأول بعض الوقت.', 'loading');
        } else if (data.type === 'ready') {
          runnerReady = true;
          stopButton.disabled = true;
          retryButton.hidden = true;
          setStatus('Python جاهزة للتشغيل.', 'success');
          if (pendingRun) run();
        } else if (data.type === 'started') {
          isRunning = true;
          stopButton.disabled = false;
          setStatus('جارٍ التنفيذ — يمكنك إيقافه في أي وقت.', 'running');
        } else if (data.type === 'result') {
          isRunning = false;
          stopButton.disabled = true;
          appendOutput(data.stdout);
          if (data.stderr) {
            errors.hidden = false;
            errors.textContent = data.stderr;
          }
          if (data.truncated) appendOutput('\n[تم اقتطاع المخرجات عند 40,000 حرف.]');
          if (data.error) {
            errors.hidden = false;
            errors.textContent = `${data.error.name || 'Error'}:\n${String(data.error.message || '').slice(0, 12000)}`;
            setStatus(data.error.name === 'SyntaxError' ? 'يوجد خطأ نحوي في الكود.' : 'حدث خطأ أثناء تنفيذ الكود.', 'error');
          } else {
            setStatus('اكتمل التنفيذ بنجاح.', 'success');
          }
        } else if (data.type === 'timeout') {
          isRunning = false;
          runnerReady = false;
          stopButton.disabled = true;
          errors.hidden = false;
          errors.textContent = data.message;
          setStatus('تم إيقاف التنفيذ لتجاوز المهلة؛ جارٍ تجهيز البيئة مجددًا.', 'error');
        } else if (data.type === 'stopped') {
          isRunning = false;
          runnerReady = false;
          stopButton.disabled = true;
          setStatus('تم إيقاف التنفيذ. جارٍ تجهيز Python مجددًا.', 'loading');
        } else if (data.type === 'error') {
          isRunning = false;
          runnerReady = false;
          stopButton.disabled = true;
          errors.hidden = false;
          errors.textContent = data.message || 'تعذر تجهيز أو تشغيل بيئة Python.';
          setStatus(data.phase === 'load'
            ? 'تعذر تحميل Python؛ تحقق من الاتصال ودعم المتصفح.'
            : 'حدث خطأ في بيئة Python.', 'error');
          retryButton.hidden = false;
        }
      });

      playground.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.matches('[data-python-run]')) run();
        else if (button.matches('[data-python-stop]')) {
          pendingRun = false;
          isRunning = false;
          runnerReady = false;
          sendToRunner('stop');
          setStatus('تم طلب إيقاف التنفيذ.', 'loading');
        } else if (button.matches('[data-python-reset]') || button.matches('[data-python-retry]')) {
          pendingRun = false;
          if (isRunning) sendToRunner('stop');
          setCode(defaults);
          clearConsole();
          playground.querySelector('[data-python-check-status]')?.replaceChildren();
          setStatus(runnerReady ? 'تمت استعادة الكود الأصلي.' : 'تمت استعادة الكود؛ جارٍ تجهيز بيئة Python.', runnerReady ? 'success' : 'loading');
        } else if (button.matches('[data-python-clear]')) {
          clearConsole();
        } else if (button.matches('[data-python-copy]')) {
          await copyCode(button);
        } else if (button.matches('[data-python-solution]')) {
          setCode(config.solution.code);
          clearConsole();
          run();
        } else if (button.matches('[data-python-runtime-retry]')) {
          runnerReady = false;
          pendingRun = false;
          retryButton.hidden = true;
          setStatus('جارٍ إعادة تحميل بيئة Python...', 'loading');
          sendToRunner('restart');
        } else if (button.matches('[data-python-check]')) {
          const source = editor.value.toLowerCase();
          const failures = (config.checks || []).filter((check) => {
            const found = source.includes(String(check.includes || '').toLowerCase());
            return check.notIncludes ? found : !found;
          });
          const checkStatus = playground.querySelector('[data-python-check-status]');
          checkStatus.textContent = failures.length
            ? `باقي خطوة تحتاج مراجعة: ${failures.map((item) => item.message || 'راجع التعليمات').join('، ')}.`
            : 'أحسنت! حققت متطلبات التحدي.';
          checkStatus.dataset.state = failures.length ? 'error' : 'success';
        }
      });

      editor.addEventListener('input', () => {
        updateEditor();
        persist();
      });
      editor.addEventListener('scroll', () => {
        overlay.scrollTop = editor.scrollTop;
        overlay.scrollLeft = editor.scrollLeft;
        gutter.scrollTop = editor.scrollTop;
      });
      editor.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        event.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        if (event.shiftKey && start === end) {
          const lineStart = editor.value.lastIndexOf('\n', start - 1) + 1;
          const indent = editor.value.slice(lineStart, start).match(/^ {1,4}/)?.[0] || '';
          if (indent) editor.setRangeText('', lineStart, lineStart + indent.length, 'end');
        } else {
          editor.setRangeText('    ', start, end, 'end');
        }
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  };

  window.EfhamaPythonPlayground = Object.freeze({ render, initialize });
})();
