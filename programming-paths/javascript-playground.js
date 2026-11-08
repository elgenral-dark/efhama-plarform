(() => {
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

  function workerRuntime() {
    let nodeMap = new Map();
    let pendingQueries = new Map();
    let eventHandlers = new Map();
    let queryId = 0;
    let outputCount = 0;
    let apiMessageCount = 0;
    let apiLimitReported = false;
    let started = false;
    let userProgram;

    const send = (type, details = {}) => {
      if (['query', 'listen', 'mutate', 'create'].includes(type)) {
        if (apiMessageCount >= 500) {
          if (!apiLimitReported) {
            apiLimitReported = true;
            self.postMessage({ type: 'log', level: 'warn', text: 'تم تحديد تحديثات DOM لهذا التشغيل إلى 500 عملية.' });
          }
          return;
        }
        apiMessageCount += 1;
      }
      self.postMessage({ type, ...details });
    };
    const clip = (value) => String(value).slice(0, 1600);
    const format = (value) => {
      if (typeof value === 'string') return clip(value);
      if (typeof value === 'undefined') return 'undefined';
      if (typeof value === 'bigint') return `${value}n`;
      if (typeof value === 'function') return `[Function${value.name ? `: ${value.name}` : ''}]`;
      try {
        const json = JSON.stringify(value, (_, item) => typeof item === 'bigint' ? `${item}n` : item, 2);
        return clip(json === undefined ? String(value) : json);
      } catch {
        return '[تعذر عرض هذه القيمة]';
      }
    };
    const log = (level, values) => {
      if (outputCount >= 100) {
        if (outputCount === 100) send('limit', { message: 'تم إيقاف عرض النتائج بعد 100 سطر.' });
        outputCount += 1;
        return;
      }
      outputCount += 1;
      send('log', { level, text: values.map(format).join(' ') || '' });
    };

    function elementFrom(node) {
      if (!node) return null;
      const wrapper = {
        get textContent() { return node.textContent; },
        set textContent(value) {
          node.textContent = String(value);
          send('mutate', { id: node.id, operation: 'text', value: clip(value) });
        },
        get className() { return node.className || ''; },
        set className(value) {
          node.className = String(value);
          send('mutate', { id: node.id, operation: 'class', value: clip(value) });
        },
        addEventListener(name, callback) {
          if (typeof callback !== 'function' || !['click', 'input', 'change', 'submit', 'keydown'].includes(name)) return;
          const key = `${node.id}:${name}`;
          if (!eventHandlers.has(key) && eventHandlers.size < 100) {
            eventHandlers.set(key, []);
            send('listen', { id: node.id, eventName: name });
          }
          const handlers = eventHandlers.get(key);
          if (handlers && handlers.length < 20) handlers.push(callback);
        },
        appendChild(child) {
          if (child && child.__efhamaNode) {
            send('mutate', { id: node.id, operation: 'append', child: child.__efhamaNode });
          }
          return child;
        },
        setAttribute(name, value) {
          send('mutate', { id: node.id, operation: 'attribute', name: String(name), value: clip(value) });
        },
        getAttribute(name) {
          return node.attributes?.[String(name)] ?? null;
        }
      };

      const styleValues = Object.create(null);
      wrapper.style = new Proxy(styleValues, {
        get(target, property) {
          return target[property];
        },
        set(target, property, value) {
          target[property] = String(value);
          send('mutate', { id: node.id, operation: 'style', name: String(property), value: clip(value) });
          return true;
        }
      });
      wrapper.classList = Object.freeze({
        add: (...names) => send('mutate', { id: node.id, operation: 'classList', action: 'add', names: names.map(String).slice(0, 20) }),
        remove: (...names) => send('mutate', { id: node.id, operation: 'classList', action: 'remove', names: names.map(String).slice(0, 20) }),
        toggle: (name, force) => send('mutate', { id: node.id, operation: 'classList', action: 'toggle', name: String(name), force })
      });
      Object.defineProperty(wrapper, '__efhamaNode', { value: node.id });
      return wrapper;
    }

    const query = (selector, all) => new Promise((resolve, reject) => {
      const requestId = ++queryId;
      pendingQueries.set(requestId, (nodes, error) => {
        if (error) {
          const queryError = new Error(error);
          queryError.name = 'SyntaxError';
          reject(queryError);
          return;
        }
        resolve(all ? nodes.map(elementFrom) : elementFrom(nodes[0]));
      });
      send('query', { requestId, selector: String(selector).slice(0, 240), all });
    });

    const makeDocument = () => ({
      querySelector: (selector) => query(selector, false),
      querySelectorAll: (selector) => query(selector, true),
      getElementById: (id) => query(`#${String(id).replace(/[^\w-]/g, '')}`, false),
      createElement(tagName) {
        const id = `new-${Math.random().toString(36).slice(2, 12)}`;
        const node = { id, tagName: String(tagName).toLowerCase(), textContent: '', className: '', attributes: {} };
        nodeMap.set(id, node);
        send('create', { id, tagName: node.tagName });
        return elementFrom(node);
      },
      addEventListener(name, callback) {
        if (typeof callback !== 'function' || !['click', 'input', 'change', 'submit', 'keydown'].includes(name)) return;
        const key = `document:${name}`;
        if (!eventHandlers.has(key) && eventHandlers.size < 100) {
          eventHandlers.set(key, []);
          send('listen', { id: 'document', eventName: name });
        }
        const handlers = eventHandlers.get(key);
        if (handlers && handlers.length < 20) handlers.push(callback);
      }
    });

    const consoleApi = Object.freeze({
      log: (...values) => log('log', values),
      info: (...values) => log('info', values),
      warn: (...values) => log('warn', values),
      error: (...values) => log('error', values),
      table: (value) => log('info', [value]),
      clear: () => { outputCount = 0; send('clear'); }
    });

    const safeTimers = () => {
      const nativeSetTimeout = self.setTimeout.bind(self);
      const nativeSetInterval = self.setInterval.bind(self);
      const nativeClearTimeout = self.clearTimeout.bind(self);
      const nativeClearInterval = self.clearInterval.bind(self);
      const activeTimers = new Map();
      const clearTimer = (timer, clearNativeTimer) => {
        if (activeTimers.has(timer)) activeTimers.delete(timer);
        clearNativeTimer(timer);
      };
      const runTask = async (callback, args) => {
        send('task-start');
        try {
          if (typeof callback === 'function') await callback(...args);
          else send('log', { level: 'error', text: 'استخدم دالة callback مع المؤقت.' });
        } catch (error) {
          send('log', { level: 'error', text: error?.message || String(error) });
        } finally {
          send('task-end');
        }
      };
      self.setTimeout = (callback, delay = 0, ...args) => {
        if (activeTimers.size >= 20) return 0;
        let timer;
        timer = nativeSetTimeout(async (...values) => {
          activeTimers.delete(timer);
          await runTask(callback, values);
        }, Math.min(Math.max(Number(delay) || 0, 0), 10000), ...args);
        activeTimers.set(timer, 'timeout');
        return timer;
      };
      self.setInterval = (callback, delay = 0, ...args) => {
        if (activeTimers.size >= 20) return 0;
        const timer = nativeSetInterval(() => runTask(callback, args), Math.max(Number(delay) || 0, 100));
        activeTimers.set(timer, 'interval');
        return timer;
      };
      self.clearTimeout = (timer) => clearTimer(timer, nativeClearTimeout);
      self.clearInterval = (timer) => clearTimer(timer, nativeClearInterval);
    };

    const blockNestedCapabilities = () => {
      ['Worker', 'SharedWorker', 'WebSocket', 'EventSource', 'XMLHttpRequest', 'BroadcastChannel', 'importScripts', 'fetch'].forEach((name) => {
        try {
          Object.defineProperty(self, name, { configurable: false, value: undefined });
        } catch {
          try { self[name] = undefined; } catch { /* The isolated worker remains time-limited. */ }
        }
      });
    };

    const start = (nodes) => {
      if (started) return;
      started = true;
      nodeMap = new Map(nodes.map((node) => [node.id, node]));
      safeTimers();
      blockNestedCapabilities();
      const doc = makeDocument();
      const win = Object.freeze({
        document: doc,
        setTimeout: self.setTimeout,
        clearTimeout: self.clearTimeout,
        setInterval: self.setInterval,
        clearInterval: self.clearInterval
      });
      Promise.resolve()
        .then(() => userProgram(doc, win, consoleApi))
        .then(() => send('done'))
        .catch((error) => send('error', { message: error?.message || String(error), name: error?.name || 'Error' }));
    };

    userProgram = async function(document, window, console) {
      /*__STUDENT_CODE__*/
    };

    self.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type === 'init') {
        start(Array.isArray(data.nodes) ? data.nodes : []);
      } else if (data.type === 'query-result') {
        const resolve = pendingQueries.get(data.requestId);
        if (resolve) {
          pendingQueries.delete(data.requestId);
          const nodes = Array.isArray(data.nodes) ? data.nodes : [];
          nodes.forEach((node) => nodeMap.set(node.id, node));
          resolve(nodes, typeof data.error === 'string' ? data.error : '');
        }
      } else if (data.type === 'dom-event') {
      const handlers = eventHandlers.get(`${data.id}:${data.eventName}`) || [];
        const eventObject = Object.freeze({
          type: data.eventName,
          target: elementFrom(nodeMap.get(data.targetId || data.id)),
          preventDefault: () => send('log', { level: 'warn', text: 'منع السلوك الافتراضي غير متاح في واجهة DOM التعليمية المعزولة.' })
        });
        send('task-start');
        Promise.all(handlers.map((handler) => Promise.resolve().then(() => handler(eventObject))))
          .catch((error) => send('error', { message: error?.message || String(error), name: error?.name || 'Error' }))
          .finally(() => send('event-done'));
      }
    });
  }

  function iframeRunner(config, token, workerRuntimeSource) {
    const channel = 'efhama-js-playground';
    const elementMap = new Map();
    const listeners = new Set();
    let worker = null;
    let workerUrl = '';
    let runTimer = 0;
    let taskTimer = 0;
    let lifetimeTimer = 0;
    let outputLines = 0;
    let nodeCounter = 0;
    let runSequence = 0;

    const sendParent = (type, details = {}) => parent.postMessage({ channel, token, type, ...details }, '*');
    const allowedTags = new Set('a article aside b blockquote br button caption code dd details div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr i img input label li main nav ol option p pre section select small span strong summary table tbody td textarea th thead tr ul'.split(' '));
    const clean = (value, limit = 1600) => String(value ?? '').slice(0, limit);
    const terminate = (type, details = {}) => {
      clearTimeout(runTimer);
      clearTimeout(taskTimer);
      clearTimeout(lifetimeTimer);
      if (worker) {
        worker.terminate();
        worker = null;
      }
      if (workerUrl) {
        URL.revokeObjectURL(workerUrl);
        workerUrl = '';
      }
      sendParent(type, details);
    };
    const getNodes = () => {
      elementMap.clear();
      nodeCounter = 0;
      const elements = [document.body, ...document.body.querySelectorAll('*')].filter((element) => !['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(element.tagName));
      return elements.slice(0, 300).map((element) => {
        const id = `node-${++nodeCounter}`;
        element.setAttribute('data-efhama-node', id);
        elementMap.set(id, element);
        const attributes = {};
        ['id', 'class', 'type', 'value', 'aria-label'].forEach((name) => {
          if (element.hasAttribute(name)) attributes[name] = clean(element.getAttribute(name), 200);
        });
        return { id, tagName: element.tagName.toLowerCase(), textContent: clean(element.textContent, 1000), className: clean(element.className, 200), attributes };
      });
    };
    const applyMutation = (data) => {
      const target = elementMap.get(data.id);
      if (!target || target === document.body && data.operation === 'attribute') return;
      const value = clean(data.value, 1600);
      if (data.operation === 'text') target.textContent = value;
      else if (data.operation === 'class') target.className = value;
      else if (data.operation === 'style') {
        const property = String(data.name).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        if (/^[a-z-]{1,60}$/.test(property) && !/url\s*\(/i.test(value)) target.style.setProperty(property, value);
      } else if (data.operation === 'classList') {
        const names = (Array.isArray(data.names) ? data.names : [data.name]).map((name) => String(name).replace(/[^\w-]/g, '')).filter(Boolean).slice(0, 20);
        if (data.action === 'add') target.classList.add(...names);
        if (data.action === 'remove') target.classList.remove(...names);
        if (data.action === 'toggle' && names[0]) target.classList.toggle(names[0], typeof data.force === 'boolean' ? data.force : undefined);
      } else if (data.operation === 'attribute') {
        const name = String(data.name).toLowerCase();
        if (/^(id|class|title|role|type|value|placeholder|alt|width|height|aria-[\w-]+|data-[\w-]+)$/.test(name) && !/^on/i.test(name)) {
          target.setAttribute(name, value);
        }
      } else if (data.operation === 'append') {
        const child = elementMap.get(data.child);
        if (child && target !== child && !child.contains(target)) target.append(child);
      }
    };
    const startWorker = (code) => {
      terminate('stopped', { quiet: true });
      runSequence += 1;
      outputLines = 0;
      document.body.innerHTML = config.html;
      const nodes = getNodes();
      const source = `(${workerRuntimeSource})();`.replace('/*__STUDENT_CODE__*/', () => code);
      try {
        workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        worker = new Worker(workerUrl);
      } catch (error) {
        sendParent('error', { name: 'WorkerError', message: error?.message || 'تعذر بدء بيئة التنفيذ المعزولة.' });
        return;
      }
      const thisRun = runSequence;
      const frameWorker = worker;
      const timeout = (kind) => {
        if (thisRun !== runSequence || frameWorker !== worker) return;
        terminate(kind, { message: kind === 'timeout' ? 'انتهت مهلة التنفيذ وتم إيقاف الكود.' : 'تم إيقاف المهمة غير المتزامنة.' });
      };
      worker.onmessage = (event) => {
        const data = event.data || {};
        if (thisRun !== runSequence || frameWorker !== worker) return;
        if (data.type === 'log') {
          outputLines += 1;
          if (outputLines <= 100) sendParent('log', { level: ['log', 'info', 'warn', 'error'].includes(data.level) ? data.level : 'log', text: clean(data.text) });
        } else if (data.type === 'clear') {
          outputLines = 0;
          sendParent('clear');
        } else if (data.type === 'query') {
          let found = [];
          let queryError = '';
          try {
            const selector = String(data.selector).slice(0, 240);
            found = [
              ...(document.body.matches(selector) ? [document.body] : []),
              ...document.body.querySelectorAll(selector)
            ].slice(0, 100);
          } catch (error) {
            queryError = error?.message || 'محدد DOM غير صالح.';
          }
          const result = found.map((element) => {
            const id = element.getAttribute('data-efhama-node');
            return elementMap.has(id) ? {
              id,
              tagName: element.tagName.toLowerCase(),
              textContent: clean(element.textContent, 1000),
              className: clean(element.className, 200),
              attributes: Object.fromEntries(['id', 'class', 'type', 'value', 'aria-label'].filter((key) => element.hasAttribute(key)).map((key) => [key, clean(element.getAttribute(key), 200)]))
            } : null;
          }).filter(Boolean);
          worker.postMessage({
            type: 'query-result',
            requestId: data.requestId,
            nodes: data.all ? result : result.slice(0, 1),
            error: queryError
          });
        } else if (data.type === 'listen') {
          const key = `${data.id}:${data.eventName}`;
          if (!listeners.has(key) && ['click', 'input', 'change', 'submit', 'keydown'].includes(data.eventName)) {
            listeners.add(key);
            document.addEventListener(data.eventName, (domEvent) => {
              const target = domEvent.target?.closest?.('[data-efhama-node]');
              const targetId = target?.getAttribute('data-efhama-node');
              if (data.id !== 'document' && targetId !== data.id) return;
              if (data.eventName === 'submit' || target?.tagName === 'A') domEvent.preventDefault();
              clearTimeout(taskTimer);
              taskTimer = window.setTimeout(() => timeout('task-timeout'), 1800);
              worker?.postMessage({ type: 'dom-event', id: data.id, targetId, eventName: data.eventName });
            }, true);
          }
        } else if (data.type === 'mutate') {
          applyMutation(data);
        } else if (data.type === 'create') {
          const tagName = String(data.tagName).toLowerCase();
          const id = String(data.id).slice(0, 40);
          const element = document.createElement(allowedTags.has(tagName) ? tagName : 'div');
          element.setAttribute('data-efhama-node', id);
          elementMap.set(id, element);
        } else if (data.type === 'done') {
          clearTimeout(runTimer);
          if (config.keepAlive) sendParent('done');
          else terminate('done');
        } else if (data.type === 'task-start') {
          clearTimeout(taskTimer);
          taskTimer = window.setTimeout(() => timeout('task-timeout'), 1800);
        } else if (data.type === 'task-end' || data.type === 'event-done') {
          clearTimeout(taskTimer);
        } else if (data.type === 'limit') {
          sendParent('limit', { message: clean(data.message, 300) });
        } else if (data.type === 'error') {
          clearTimeout(runTimer);
          clearTimeout(taskTimer);
          sendParent('error', { name: clean(data.name, 80), message: clean(data.message) });
          terminate('stopped', { quiet: true });
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        if (thisRun === runSequence) sendParent('error', { name: 'SyntaxError', message: clean(event.message || 'تحقق من صياغة الكود.') });
        terminate('stopped', { quiet: true });
      };
      worker.postMessage({ type: 'init', nodes });
      runTimer = window.setTimeout(() => timeout('timeout'), 1800);
      lifetimeTimer = window.setTimeout(() => timeout('timeout'), 30000);
      sendParent('started');
    };

    const style = document.createElement('style');
    style.textContent = config.css;
    document.head.append(style);
    document.addEventListener('click', (event) => {
      if (event.target.closest('a')) event.preventDefault();
    }, true);
    document.addEventListener('submit', (event) => event.preventDefault(), true);
    window.addEventListener('message', (event) => {
      if (event.source !== parent || event.data?.channel !== channel || event.data?.token !== token) return;
      if (event.data.command === 'run') startWorker(clean(event.data.code, 20000));
      else if (event.data.command === 'stop') terminate('stopped', { message: 'تم إيقاف التنفيذ.' });
    });
    window.addEventListener('load', () => sendParent('ready'), { once: true });
  }

  const makeToken = () => {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  };

  const buildRunnerDocument = (block, token) => {
    const hasPreview = block.preview === true || typeof block.previewHtml === 'string';
    const config = {
      html: typeof block.previewHtml === 'string'
        ? block.previewHtml.slice(0, 20000)
        : hasPreview
          ? '<main><h2 id="message">مرحبًا بك</h2><button id="change-text" type="button">غيّر النص</button></main>'
          : '',
      css: typeof block.previewCss === 'string' ? block.previewCss.slice(0, 12000) : 'body { margin: 20px; font-family: Arial, sans-serif; }',
      keepAlive: hasPreview
    };
    const nonce = makeToken();
    const policy = [
      "default-src 'none'",
      `script-src 'nonce-${nonce}' blob:`,
      'worker-src blob:',
      "connect-src 'none'",
      'img-src data:',
      "style-src 'unsafe-inline'",
      "font-src 'none'",
      "media-src 'none'",
      "object-src 'none'",
      "frame-src 'none'",
      "form-action 'none'",
      "base-uri 'none'"
    ].join('; ');
    const runnerSource = `(${iframeRunner.toString()})(${escapeScriptData(config)},${escapeScriptData(token)},${escapeScriptData(workerRuntime.toString())});`;
    return `<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}"><meta name="viewport" content="width=device-width, initial-scale=1"><script nonce="${nonce}">${runnerSource}</script></head><body></body></html>`;
  };

  const render = (block) => {
    const hasPreview = block.preview === true || typeof block.previewHtml === 'string';
    return `<section class="html-css-playground javascript-playground" data-javascript-playground data-javascript-config="${escapeHtml(JSON.stringify(block))}">
      <header class="playground-heading">
        <div><span class="playground-kicker">JavaScript Lab</span><h4>${escapeHtml(block.title || 'مختبر JavaScript')}</h4>${block.description ? `<p>${escapeHtml(block.description)}</p>` : ''}</div>
        <span class="playground-security-note">تنفيذ معزول — مهلة وبدون اتصال بالشبكة</span>
      </header>
      ${block.instructions ? `<div class="playground-task"><strong>المهمة</strong><p>${escapeHtml(block.instructions)}</p></div>` : ''}
      ${hasPreview ? `<div class="playground-expected"><strong>ملاحظة عن DOM</strong><p>للعزل الآمن، استخدم await مع document.querySelector / querySelectorAll قبل تعديل العناصر.</p></div>` : ''}
      <div class="playground-workspace javascript-workspace">
        <div class="playground-editors">
          <div class="playground-editor-toolbar"><strong>JavaScript Editor</strong><button type="button" class="playground-copy-button" data-js-copy>نسخ JavaScript</button></div>
          <div class="playground-editor-stage" data-js-editor-stage>
            <div class="playground-gutter" aria-hidden="true" data-js-gutter></div>
            <pre class="playground-highlight" aria-hidden="true"><code data-js-highlight></code></pre>
            <textarea spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="محرر JavaScript" data-js-editor></textarea>
          </div>
          <div class="playground-editor-actions">
            <button type="button" class="playground-run-button" data-js-run>تشغيل الكود</button>
            <button type="button" class="playground-stop-button" data-js-stop disabled>إيقاف التنفيذ</button>
            <button type="button" class="playground-reset-button" data-js-reset>إعادة ضبط الكود</button>
          </div>
        </div>
        <section class="javascript-console-panel" aria-label="Console">
          <div class="playground-preview-toolbar"><strong>Console</strong><div><span role="status" aria-live="polite" data-js-status>جاهز للتشغيل</span><button type="button" class="javascript-clear-console" data-js-clear>مسح النتائج</button></div></div>
          <div class="javascript-console-output" role="log" aria-live="polite" aria-relevant="additions text" data-js-console><p class="javascript-console-empty">ستظهر النتائج ورسائل الأخطاء هنا.</p></div>
        </section>
        ${hasPreview
          ? `<section class="playground-preview-panel javascript-preview-panel" aria-label="معاينة HTML">
              <div class="playground-preview-toolbar"><strong>DOM Preview</strong><span>تفاعل مع عناصر المعاينة لتجربة Events</span></div>
              <iframe title="معاينة مستقلة لتجربة JavaScript" sandbox="allow-scripts" referrerpolicy="no-referrer" data-js-runner></iframe>
            </section>`
          : '<iframe class="javascript-hidden-runner" title="بيئة JavaScript معزولة" sandbox="allow-scripts" referrerpolicy="no-referrer" data-js-runner></iframe>'}
      </div>
      ${block.expectedOutput ? `<div class="playground-expected"><strong>النتيجة المتوقعة</strong><p>${escapeHtml(block.expectedOutput)}</p></div>` : ''}
      ${Array.isArray(block.checks) && block.checks.length ? `<div class="playground-challenge" data-js-challenge><button type="button" class="playground-check-button" data-js-check>تحقق من التحدي</button><button type="button" class="playground-retry-button" data-js-retry>إعادة المحاولة</button><p role="status" aria-live="polite" data-js-check-status></p></div>` : ''}
      ${block.solution && typeof block.solution.code === 'string' ? `<details class="playground-solution"><summary>عرض الحل النموذجي</summary><p>يمكنك تجربة الحل ثم إعادة المحاولة.</p><button type="button" class="playground-solution-button" data-js-solution>تحميل الحل في المحرر</button></details>` : ''}
      <span class="javascript-security-footnote">لا يملك الكود وصولًا إلى صفحة المنصة أو تخزينها. يُوقف التنفيذ النشط بعد 1.8 ثانية، وينتهي العامل بعد 30 ثانية كحد أقصى.</span>
    </section>`;
  };

  const initialize = (root, slug, lessonId) => {
    root.querySelectorAll('[data-javascript-playground]').forEach((playground) => {
      if (playground.dataset.initialized) return;
      playground.dataset.initialized = 'true';
      let config;
      try {
        config = JSON.parse(playground.dataset.javascriptConfig || '{}');
      } catch (error) {
        console.error('Unable to parse JavaScript playground data:', error);
        playground.textContent = 'تعذر تحميل بيانات محرر JavaScript لهذا النشاط.';
        return;
      }

      const editor = playground.querySelector('[data-js-editor]');
      const stage = playground.querySelector('[data-js-editor-stage]');
      const highlighted = playground.querySelector('[data-js-highlight]');
      const overlay = playground.querySelector('.playground-highlight');
      const gutter = playground.querySelector('[data-js-gutter]');
      const output = playground.querySelector('[data-js-console]');
      const status = playground.querySelector('[data-js-status]');
      const stopButton = playground.querySelector('[data-js-stop]');
      const runner = playground.querySelector('[data-js-runner]');
      const token = makeToken();
      const defaults = typeof config.code === 'string' ? config.code : '';
      const hasPreview = config.preview === true || typeof config.previewHtml === 'string';
      const key = `efhama_js_playground_${slug}_${lessonId}_${config.id || 'default'}`;
      let runnerReady = false;
      let pendingRun = false;

      const updateEditor = () => {
        highlighted.innerHTML = window.EfhamaCodeBlocks.highlight(editor.value, 'javascript') || '&#8203;';
        gutter.textContent = Array.from({ length: editor.value.split('\n').length }, (_, index) => index + 1).join('\n');
        stage.classList.toggle('has-long-lines', editor.value.split('\n').some((line) => line.length > 100));
      };
      const setStatus = (message, state = '') => {
        status.textContent = message;
        status.dataset.state = state;
      };
      const addOutput = (level, text) => {
        output.querySelector('.javascript-console-empty')?.remove();
        const line = document.createElement('div');
        line.className = `javascript-console-line is-${level}`;
        line.textContent = String(text).slice(0, 1600);
        output.append(line);
        while (output.children.length > 100) output.firstElementChild.remove();
      };
      const clearConsole = () => {
        output.replaceChildren();
        const empty = document.createElement('p');
        empty.className = 'javascript-console-empty';
        empty.textContent = 'ستظهر النتائج ورسائل الأخطاء هنا.';
        output.append(empty);
      };
      const persist = () => {
        try {
          localStorage.setItem(key, editor.value);
        } catch (error) {
          console.error('Unable to save JavaScript playground draft:', error);
          setStatus('تعذر حفظ المسودة على هذا الجهاز.', 'error');
        }
      };
      const sendToRunner = (command, details = {}) => {
        runner.contentWindow?.postMessage({ channel: 'efhama-js-playground', token, command, ...details }, '*');
      };
      const run = () => {
        if (editor.value.length > 20000) {
          setStatus('الكود أطول من الحد المسموح (20,000 حرف).', 'error');
          return;
        }
        clearConsole();
        if (!runnerReady) {
          pendingRun = true;
          setStatus('جارٍ تجهيز بيئة التنفيذ المعزولة...');
          return;
        }
        pendingRun = false;
        stopButton.disabled = false;
        setStatus('جارٍ تنفيذ الكود...', 'running');
        sendToRunner('run', { code: editor.value });
      };
      const setCode = (code) => {
        editor.value = code;
        updateEditor();
        persist();
      };

      try {
        const saved = localStorage.getItem(key);
        editor.value = typeof saved === 'string' ? saved : defaults;
      } catch (error) {
        console.error('Unable to restore JavaScript playground draft:', error);
        editor.value = defaults;
        setStatus('تعذر استعادة المسودة؛ تم تحميل الكود الأصلي.', 'error');
      }
      updateEditor();
      runner.srcdoc = buildRunnerDocument(config, token);

      runner.addEventListener('load', () => {
        runnerReady = true;
        setStatus('جاهز للتشغيل');
        if (pendingRun) {
          pendingRun = false;
          run();
        }
      });
      window.addEventListener('message', (event) => {
        if (event.source !== runner.contentWindow || event.data?.channel !== 'efhama-js-playground' || event.data?.token !== token) return;
        const data = event.data;
        if (data.type === 'ready') {
          runnerReady = true;
          if (pendingRun) {
            pendingRun = false;
            run();
          }
        } else if (data.type === 'started') {
          stopButton.disabled = false;
          setStatus('جارٍ التنفيذ — يمكنك إيقافه في أي وقت.', 'running');
        } else if (data.type === 'log') {
          addOutput(data.level, data.text);
        } else if (data.type === 'clear') {
          clearConsole();
        } else if (data.type === 'done') {
          stopButton.disabled = !hasPreview;
          setStatus(hasPreview ? 'اكتمل التنفيذ؛ يمكنك تجربة الأحداث أو إيقافها.' : 'اكتمل التنفيذ بنجاح.', 'success');
        } else if (data.type === 'error') {
          stopButton.disabled = true;
          addOutput('error', `${data.name || 'Error'}: ${data.message || 'حدث خطأ أثناء التنفيذ.'}`);
          setStatus('حدث خطأ أثناء التنفيذ.', 'error');
        } else if (data.type === 'timeout' || data.type === 'task-timeout') {
          stopButton.disabled = true;
          addOutput('error', data.message || 'انتهت مهلة التنفيذ وتم إيقاف الكود.');
          setStatus('تم إيقاف الكود لتجاوز المهلة.', 'error');
        } else if (data.type === 'stopped' && !data.quiet) {
          stopButton.disabled = true;
          setStatus(data.message || 'تم إيقاف التنفيذ.');
        } else if (data.type === 'limit') {
          addOutput('warn', data.message);
        }
      });

      playground.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.matches('[data-js-run]')) run();
        else if (button.matches('[data-js-stop]')) {
          pendingRun = false;
          sendToRunner('stop');
          stopButton.disabled = true;
          setStatus('تم طلب إيقاف التنفيذ.');
        } else if (button.matches('[data-js-reset]') || button.matches('[data-js-retry]')) {
          sendToRunner('stop');
          stopButton.disabled = true;
          setCode(defaults);
          clearConsole();
          playground.querySelector('[data-js-check-status]')?.replaceChildren();
          setStatus('تمت استعادة الكود الأصلي.');
          run();
        } else if (button.matches('[data-js-clear]')) {
          clearConsole();
          sendToRunner('clear');
        } else if (button.matches('[data-js-copy]')) {
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
              console.error('Unable to copy JavaScript playground code:', copyError);
            } finally {
              textarea?.remove();
            }
          }
          button.textContent = copied ? 'تم النسخ' : 'تعذر النسخ';
          window.setTimeout(() => { if (button.isConnected) button.textContent = 'نسخ JavaScript'; }, 1600);
        } else if (button.matches('[data-js-solution]')) {
          setCode(config.solution.code);
          run();
        } else if (button.matches('[data-js-check]')) {
          const source = editor.value.toLowerCase();
          const failures = (config.checks || []).filter((check) => {
            const found = source.includes(String(check.includes || '').toLowerCase());
            return check.notIncludes ? found : !found;
          });
          const message = failures.length
            ? `باقي خطوة تحتاج مراجعة: ${failures.map((item) => item.message || 'راجع التعليمات').join('، ')}.`
            : 'أحسنت! حققت متطلبات التحدي.';
          const checkStatus = playground.querySelector('[data-js-check-status]');
          checkStatus.textContent = message;
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
        editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  };

  window.EfhamaJavaScriptPlayground = Object.freeze({ render, initialize });
})();
