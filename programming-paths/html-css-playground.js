(() => {
  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const render = (block) => `<section class="html-css-playground" data-html-css-playground data-playground-config="${escapeHtml(JSON.stringify(block))}">
    <header class="playground-heading">
      <div>
        <span class="playground-kicker">HTML + CSS</span>
        <h4>${escapeHtml(block.title || 'مختبر HTML وCSS')}</h4>
        ${block.description ? `<p>${escapeHtml(block.description)}</p>` : ''}
      </div>
      <span class="playground-security-note">معاينة معزولة — JavaScript والملفات الخارجية معطّلة</span>
    </header>
    ${block.instructions ? `<div class="playground-task"><strong>المهمة</strong><p>${escapeHtml(block.instructions)}</p></div>` : ''}
    <div class="playground-workspace">
      <div class="playground-editors">
        <div class="playground-tabs" role="tablist" aria-label="اختيار محرر الكود">
          <button type="button" class="playground-tab is-active" role="tab" aria-selected="true" data-editor-tab="html">HTML</button>
          <button type="button" class="playground-tab" role="tab" aria-selected="false" data-editor-tab="css">CSS</button>
        </div>
        ${['html', 'css'].map((language) => `<section class="playground-editor-panel${language === 'html' ? ' is-active' : ''}" role="tabpanel" data-editor-panel="${language}">
          <div class="playground-editor-toolbar">
            <strong>${language.toUpperCase()} Editor</strong>
            <button type="button" class="playground-copy-button" data-playground-copy="${language}">نسخ ${language.toUpperCase()}</button>
          </div>
          <div class="playground-editor-stage" data-editor-stage="${language}">
            <div class="playground-gutter" aria-hidden="true"></div>
            <pre class="playground-highlight" aria-hidden="true"><code></code></pre>
            <textarea spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="محرر ${language.toUpperCase()}" data-editor-input="${language}"></textarea>
          </div>
        </section>`).join('')}
        <div class="playground-editor-actions">
          <button type="button" class="playground-run-button" data-playground-run>تحديث المعاينة</button>
          <button type="button" class="playground-reset-button" data-playground-reset>إعادة ضبط الأكواد</button>
          <span class="playground-save-status" role="status" aria-live="polite" data-playground-save-status></span>
        </div>
      </div>
      <section class="playground-preview-panel" aria-label="معاينة الصفحة">
        <div class="playground-preview-toolbar">
          <strong>Live Preview</strong>
          <span data-playground-preview-status role="status" aria-live="polite">المعاينة معزولة وآمنة</span>
        </div>
        <iframe title="معاينة HTML وCSS" sandbox="" referrerpolicy="no-referrer" data-playground-preview></iframe>
      </section>
    </div>
    ${block.expectedOutput ? `<div class="playground-expected"><strong>النتيجة المتوقعة</strong><p>${escapeHtml(block.expectedOutput)}</p></div>` : ''}
    ${Array.isArray(block.checks) && block.checks.length ? `<div class="playground-challenge" data-playground-challenge>
      <button type="button" class="playground-check-button" data-playground-check>تحقق من التحدي</button>
      <button type="button" class="playground-retry-button" data-playground-retry>إعادة المحاولة</button>
      <p role="status" aria-live="polite" data-playground-check-status></p>
    </div>` : ''}
    ${block.solution && typeof block.solution.html === 'string' && typeof block.solution.css === 'string' ? `<details class="playground-solution">
      <summary>عرض الحل النموذجي</summary>
      <p>يمكنك مقارنة الحل بأكوادك ثم إعادة المحاولة.</p>
      <button type="button" class="playground-solution-button" data-playground-solution>تحميل الحل في المحررات</button>
    </details>` : ''}
  </section>`;

  const previewDocument = (html, css) => {
    const policy = [
      "default-src 'none'",
      "script-src 'none'",
      "connect-src 'none'",
      "img-src data: blob:",
      "style-src 'unsafe-inline'",
      "font-src data:",
      "media-src 'none'",
      "object-src 'none'",
      "frame-src 'none'",
      "form-action 'none'",
      "base-uri 'none'"
    ].join('; ');
    const safeCss = String(css).replace(/<\/style/gi, '<\\/style');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>*,*::before,*::after{box-sizing:border-box}body{margin:16px;font-family:Arial,sans-serif;overflow-wrap:anywhere}img,video,iframe{max-width:100%}${safeCss}</style></head><body>${html}</body></html>`;
  };

  const initialize = (root, slug, lessonId) => {
    root.querySelectorAll('[data-html-css-playground]').forEach((playground) => {
      if (playground.dataset.initialized) return;
      playground.dataset.initialized = 'true';
      let config;
      try {
        config = JSON.parse(playground.dataset.playgroundConfig || '{}');
      } catch (error) {
        console.error('Unable to parse HTML/CSS playground data:', error);
        playground.textContent = 'تعذر تحميل بيانات المحرر لهذا النشاط.';
        return;
      }

      const editors = Object.fromEntries(['html', 'css'].map((language) => [
        language,
        playground.querySelector(`[data-editor-input="${language}"]`)
      ]));
      const defaults = {
        html: typeof config.html === 'string' ? config.html : '',
        css: typeof config.css === 'string' ? config.css : ''
      };
      const key = `efhama_playground_${slug}_${lessonId}_${config.id || 'default'}`;
      const preview = playground.querySelector('[data-playground-preview]');
      const previewStatus = playground.querySelector('[data-playground-preview-status]');
      const saveStatus = playground.querySelector('[data-playground-save-status]');
      const checkStatus = playground.querySelector('[data-playground-check-status]');
      const frameWindow = () => preview.contentWindow;
      let updateTimer;

      const updateEditorDisplay = (language) => {
        const editor = editors[language];
        const stage = playground.querySelector(`[data-editor-stage="${language}"]`);
        const highlighted = stage.querySelector('.playground-highlight code');
        const gutter = stage.querySelector('.playground-gutter');
        const lines = editor.value.split('\n');
        const source = window.EfhamaCodeBlocks.highlight(editor.value, language);
        highlighted.innerHTML = source || '&#8203;';
        gutter.textContent = Array.from({ length: lines.length }, (_, index) => index + 1).join('\n');
        stage.style.setProperty('--editor-line-count', String(lines.length));
        stage.classList.toggle('has-long-lines', lines.some((line) => line.length > 100));
      };

      const persist = () => {
        try {
          localStorage.setItem(key, JSON.stringify({
            html: editors.html.value,
            css: editors.css.value
          }));
          saveStatus.textContent = 'تم حفظ تجربتك على هذا الجهاز.';
          saveStatus.dataset.state = 'success';
        } catch (error) {
          console.error('Unable to save playground draft:', error);
          saveStatus.textContent = 'تعذر حفظ التجربة محليًا؛ يمكنك متابعة التعديل الآن.';
          saveStatus.dataset.state = 'error';
        }
      };

      const runPreview = () => {
        previewStatus.textContent = 'جارٍ تحديث المعاينة...';
        try {
          preview.srcdoc = previewDocument(editors.html.value, editors.css.value);
          preview.onload = () => {
            previewStatus.textContent = 'تم تحديث المعاينة. JavaScript والاتصال الخارجي غير متاحين.';
          };
        } catch (error) {
          console.error('Unable to update HTML/CSS preview:', error);
          previewStatus.textContent = 'تعذر تحديث المعاينة. راجع الكود وحاول مرة أخرى.';
        }
      };

      const setEditorValues = (values) => {
        ['html', 'css'].forEach((language) => {
          editors[language].value = typeof values[language] === 'string' ? values[language] : defaults[language];
          updateEditorDisplay(language);
        });
      };

      let restored = false;
      try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (saved && typeof saved.html === 'string' && typeof saved.css === 'string') {
          setEditorValues(saved);
          restored = true;
        }
      } catch (error) {
        console.error('Unable to restore playground draft:', error);
        saveStatus.textContent = 'تعذر استعادة النسخة المحفوظة؛ تم تحميل الأكواد الأصلية.';
        saveStatus.dataset.state = 'error';
      }
      if (!restored) setEditorValues(defaults);
      if (restored) {
        saveStatus.textContent = 'تم استعادة آخر تجربة محفوظة.';
        saveStatus.dataset.state = 'success';
      }
      runPreview();

      playground.addEventListener('click', async (event) => {
        const tab = event.target.closest('[data-editor-tab]');
        if (tab) {
          playground.querySelectorAll('[data-editor-tab]').forEach((button) => {
            const active = button === tab;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
          });
          playground.querySelectorAll('[data-editor-panel]').forEach((panel) => {
            panel.classList.toggle('is-active', panel.dataset.editorPanel === tab.dataset.editorTab);
          });
          return;
        }

        const copyButton = event.target.closest('[data-playground-copy]');
        if (copyButton) {
          const value = editors[copyButton.dataset.playgroundCopy].value;
          let copied = false;
          try {
            await navigator.clipboard.writeText(value);
            copied = true;
          } catch (error) {
            let textarea;
            try {
              textarea = document.createElement('textarea');
              textarea.value = value;
              textarea.style.position = 'fixed';
              textarea.style.opacity = '0';
              document.body.append(textarea);
              textarea.select();
              copied = document.execCommand('copy');
            } catch (fallbackError) {
              console.error('Unable to copy playground code:', fallbackError);
            } finally {
              textarea?.remove();
            }
          }
          copyButton.textContent = copied ? 'تم النسخ' : 'تعذر النسخ';
          window.setTimeout(() => {
            if (copyButton.isConnected) copyButton.textContent = `نسخ ${copyButton.dataset.playgroundCopy.toUpperCase()}`;
          }, 1600);
          return;
        }

        if (event.target.closest('[data-playground-run]')) {
          runPreview();
          return;
        }
        if (event.target.closest('[data-playground-reset]') || event.target.closest('[data-playground-retry]')) {
          setEditorValues(defaults);
          persist();
          if (checkStatus) checkStatus.textContent = '';
          runPreview();
          return;
        }
        if (event.target.closest('[data-playground-solution]')) {
          setEditorValues(config.solution);
          persist();
          runPreview();
          return;
        }
        if (event.target.closest('[data-playground-check]')) {
          const failures = (config.checks || []).filter((check) => {
            const editor = editors[check.editor === 'css' ? 'css' : 'html'];
            const source = editor.value.toLowerCase();
            const expected = String(check.includes || '').toLowerCase();
            const found = source.includes(expected);
            const matches = check.notIncludes ? !found : found;
            return !matches;
          });
          if (checkStatus) {
            checkStatus.textContent = failures.length
              ? `لسه في خطوة محتاجة مراجعة: ${failures.map((item) => item.message || 'راجع التعليمات').join('، ')}.`
              : 'أحسنت! حققت متطلبات التحدي.';
            checkStatus.dataset.state = failures.length ? 'error' : 'success';
          }
        }
      });

      ['html', 'css'].forEach((language) => {
        const editor = editors[language];
        const stage = playground.querySelector(`[data-editor-stage="${language}"]`);
        const highlighted = stage.querySelector('.playground-highlight');
        const gutter = stage.querySelector('.playground-gutter');
        editor.addEventListener('input', () => {
          updateEditorDisplay(language);
          persist();
          clearTimeout(updateTimer);
          updateTimer = window.setTimeout(runPreview, 300);
        });
        editor.addEventListener('scroll', () => {
          highlighted.scrollTop = editor.scrollTop;
          highlighted.scrollLeft = editor.scrollLeft;
          gutter.scrollTop = editor.scrollTop;
        });
        editor.addEventListener('keydown', (event) => {
          if (event.key !== 'Tab') return;
          event.preventDefault();
          const start = editor.selectionStart;
          const end = editor.selectionEnd;
          editor.setRangeText('  ', start, end, 'end');
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });

      preview.addEventListener('load', () => {
        if (frameWindow()) previewStatus.textContent = 'تم تحديث المعاينة. JavaScript والاتصال الخارجي غير متاحين.';
      });
    });
  };

  window.EfhamaHtmlCssPlayground = Object.freeze({ render, initialize });
})();
