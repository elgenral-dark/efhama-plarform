(() => {
  const VERSION = '314.0.7';
  const CHANNEL = 'efhama-python-playground';
  const token = window.location.hash.slice(1);
  const assetsUrl = new URL(`/vendor/pyodide/v${VERSION}/`, window.location.href).href;
  let worker = null;
  let workerUrl = '';
  let executionTimer = 0;
  let loadingTimer = 0;
  let activeRun = 0;

  const sendParent = (type, details = {}) => parent.postMessage({ channel: CHANNEL, token, type, ...details }, '*');
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
  const workerSource = () => {
    const root = JSON.stringify(assetsUrl);
    const scriptUrl = JSON.stringify(`${assetsUrl}pyodide.js`);
    return `importScripts(${scriptUrl});
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
  };
  const startWorker = () => {
    terminateWorker();
    sendParent('loading');
    try {
      workerUrl = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
      worker = new Worker(workerUrl);
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
      const details = [event.message, event.filename, event.lineno].filter(Boolean).join(' ');
      terminateWorker();
      sendParent('error', { phase: 'load', message: details || 'تعذر تحميل ملفات بيئة Python المحلية.' });
    };
    loadingTimer = window.setTimeout(() => {
      if (worker !== currentWorker) return;
      terminateWorker();
      sendParent('error', { phase: 'load', message: 'استغرق تجهيز بيئة Python وقتًا أطول من المتوقع.' });
    }, 90000);
    worker.postMessage({ type: 'init' });
  };

  window.addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.channel !== CHANNEL || event.data?.token !== token) return;
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
})();
