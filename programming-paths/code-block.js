(() => {
  const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const languageNames = {
    python: 'Python',
    javascript: 'JavaScript',
    html: 'HTML',
    css: 'CSS',
    sql: 'SQL',
    json: 'JSON',
    bash: 'Bash',
    pseudocode: 'Pseudocode',
    text: 'نص'
  };

  const resolveLanguage = (code, language, fallback = 'pseudocode') => {
    const requested = String(language || '').toLowerCase();
    const aliases = { py: 'python', js: 'javascript', ts: 'javascript', htm: 'html', sh: 'bash', shell: 'bash', yml: 'text', plaintext: 'text', plain: 'text' };
    const normalized = aliases[requested] || requested;
    if (languageNames[normalized]) return normalized;

    const sample = String(code || '');
    if (/<\/?[a-z][\s\S]*?>/i.test(sample)) return 'html';
    if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|WITH)\b/im.test(sample)) return 'sql';
    if (/^\s*[{[]/.test(sample)) {
      try {
        JSON.parse(sample);
        return 'json';
      } catch {
        // Continue checking other languages when the sample is not valid JSON.
      }
    }
    if (/^\s*#!.*\b(?:bash|sh)\b/m.test(sample) || /^\s*(?:echo|printf|export|read|source)\s+/m.test(sample)) return 'bash';
    if (/^\s*(def |print\(|elif\b|None\b|True\b|False\b|import |from )/m.test(sample)) return 'python';
    if (/^\s*(const |let |var |function |console\.|document\.|=>)/m.test(sample)) return 'javascript';
    if (/^\s*[.#][\w-]+\s*\{[\s\S]*:/m.test(sample)) return 'css';
    return languageNames[fallback] ? fallback : 'pseudocode';
  };

  const highlightPseudocode = (value) => escapeHtml(value)
    .replace(/\b(INPUT)\b/g, '<mark class="pseudocode-input">$1</mark>')
    .replace(/\b(OUTPUT)\b/g, '<mark class="pseudocode-output">$1</mark>')
    .replace(/\b(SET)\b/g, '<mark class="pseudocode-set">$1</mark>');

  const highlightCode = (code, language, state = {}) => {
    if (language === 'pseudocode') return highlightPseudocode(code);

    let source = String(code || '');
    const output = [];
    if (state.mode) {
      const delimiter = state.mode === 'html-comment' ? '-->' : state.mode === 'block-comment' ? '*/' : state.mode;
      const commentMode = state.mode === 'html-comment' || state.mode === 'block-comment';
      const closeIndex = source.indexOf(delimiter);
      const endIndex = closeIndex < 0 ? source.length : closeIndex + delimiter.length;
      output.push(`<span class="${commentMode ? 'token-comment' : 'token-string'}">${escapeHtml(source.slice(0, endIndex))}</span>`);
      source = source.slice(endIndex);
      state.mode = closeIndex < 0 ? state.mode : '';
      if (closeIndex < 0) return output.join('');
    }

    const keywords = {
      python: new Set('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None'.split(' ')),
      javascript: new Set('async await break case catch class const continue debugger default delete do else export extends false finally for from function if import in instanceof let new null of return super switch this throw true try typeof var void while with yield'.split(' ')),
      sql: new Set('ADD ALL ALTER AND AS ASC BETWEEN BY CASE CHECK COLUMN CONSTRAINT CREATE DATABASE DEFAULT DELETE DESC DISTINCT DROP ELSE END EXISTS FOREIGN FROM FULL GROUP HAVING IN INDEX INNER INSERT INTO IS JOIN KEY LEFT LIKE LIMIT NOT NULL OFFSET ON OR ORDER OUTER PRIMARY REFERENCES RIGHT SELECT SET TABLE THEN UNION UNIQUE UPDATE VALUES WHEN WHERE'.split(' ')),
      bash: new Set('if then else elif fi for while do done case esac in function local export readonly return exit break continue select source alias unalias declare typeset set unset shift eval exec trap'.split(' '))
    };
    const commentPattern = {
      python: '#[^\\n]*',
      sql: '--[^\\n]*|/\\*[\\s\\S]*?\\*/',
      html: '<!--[\\s\\S]*?-->',
      javascript: '\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*',
      css: '\\/\\*[\\s\\S]*?\\*\\/',
      bash: '#[^\\n]*'
    }[language] || '(?!)';
    const tokenPattern = new RegExp(
      `${commentPattern}|"""[\\s\\S]*?"""|'''[\\s\\S]*?'''|<!--|"""|'''|\\/\\*|"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`|<\\/?[A-Za-z][^>]*>|\\$\\{?[A-Za-z_][\\w]*\\}?|\\b\\d+(?:\\.\\d+)?\\b|[A-Za-z_$][\\w$-]*|\\s+|.`,
      'g'
    );
    const tokens = [];
    const isComment = (token) => new RegExp(`^(?:${commentPattern})$`).test(token);
    const isString = (token) => /^(["'`]|"""|''')/.test(token);
    const span = (token, tokenClass) => `<span class="${tokenClass}">${escapeHtml(token)}</span>`;
    let match;
    while ((match = tokenPattern.exec(source)) !== null) {
      const token = match[0];
      const remaining = source.slice(tokenPattern.lastIndex);
      let tokenClass = '';
      if (isComment(token)) tokenClass = 'token-comment';
      else if (language === 'python' && (token === '"""' || token === "'''")) {
        const closeIndex = source.indexOf(token, tokenPattern.lastIndex);
        if (closeIndex >= 0) {
          const endIndex = closeIndex + token.length;
          tokens.push(`<span class="token-string">${escapeHtml(source.slice(match.index, endIndex))}</span>`);
          tokenPattern.lastIndex = endIndex;
        } else {
          state.mode = token;
          tokens.push(`<span class="token-string">${escapeHtml(source.slice(match.index))}</span>`);
          tokenPattern.lastIndex = source.length;
        }
        continue;
      } else if (['javascript', 'css', 'sql'].includes(language) && token === '/*') {
        const closeIndex = source.indexOf('*/', tokenPattern.lastIndex);
        if (closeIndex >= 0) {
          const endIndex = closeIndex + 2;
          tokens.push(`<span class="token-comment">${escapeHtml(source.slice(match.index, endIndex))}</span>`);
          tokenPattern.lastIndex = endIndex;
        } else {
          state.mode = 'block-comment';
          tokens.push(`<span class="token-comment">${escapeHtml(source.slice(match.index))}</span>`);
          tokenPattern.lastIndex = source.length;
        }
        continue;
      } else if (language === 'html' && token === '<!--') {
        const closeIndex = source.indexOf('-->', tokenPattern.lastIndex);
        if (closeIndex >= 0) {
          const endIndex = closeIndex + 3;
          tokens.push(`<span class="token-comment">${escapeHtml(source.slice(match.index, endIndex))}</span>`);
          tokenPattern.lastIndex = endIndex;
        } else {
          state.mode = 'html-comment';
          tokens.push(`<span class="token-comment">${escapeHtml(source.slice(match.index))}</span>`);
          tokenPattern.lastIndex = source.length;
        }
        continue;
      }
      else if (language === 'html' && /^<\/?[A-Za-z]/.test(token)) {
        const tagMatch = token.match(/^(<\/?)([A-Za-z][\w:-]*)/);
        if (tagMatch) {
          const remainder = token.slice(tagMatch[0].length).replace(/\/?>$/, '');
          const attributes = remainder.replace(/([A-Za-z_:][-A-Za-z0-9_:]*)(\s*=\s*)("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')/g, (whole, name, equals, value) => `${span(name, 'token-attribute')}${escapeHtml(equals)}${span(value, 'token-string')}`);
          tokens.push(`${escapeHtml(tagMatch[1])}${span(tagMatch[2], 'token-tag')}${attributes}${escapeHtml(token.endsWith('/>') ? '/>' : '>')}`);
          continue;
        }
        tokenClass = 'token-tag';
      } else if (language === 'json' && isString(token)) {
        tokenClass = /^\s*:/.test(remaining) ? 'token-property' : 'token-string';
      } else if (isString(token)) tokenClass = 'token-string';
      else if (/^\d/.test(token)) tokenClass = 'token-number';
      else if (language === 'bash' && /^\$/.test(token)) tokenClass = 'token-variable';
      else if (language === 'css' && /^@[A-Za-z-]+$/.test(token)) tokenClass = 'token-keyword';
      else if (language === 'css' && /^[A-Za-z-]+$/.test(token) && /^\s*:/.test(remaining)) tokenClass = 'token-property';
      else if (/^[A-Za-z_$]/.test(token)) {
        if ((keywords[language] || new Set()).has(token)) tokenClass = 'token-keyword';
        else if (language === 'python' && 'print len range str int float list dict set tuple sum min max abs input'.split(' ').includes(token)) tokenClass = 'token-builtin';
        else if (language === 'javascript' && 'console document window Math Array String Number JSON'.split(' ').includes(token)) tokenClass = 'token-builtin';
        else if (language === 'bash' && 'echo printf cd pwd ls cat grep mkdir rm cp mv touch chmod chown find xargs curl wget head tail read test'.split(' ').includes(token)) tokenClass = 'token-builtin';
        else if (language === 'json' && /^(true|false|null)$/.test(token)) tokenClass = 'token-keyword';
        else tokenClass = 'token-identifier';
      }
      tokens.push(tokenClass ? span(token, tokenClass) : escapeHtml(token));
    }
    return output.join('') + tokens.join('');
  };

  const render = (code, title, language, fallbackLanguage, options = {}) => {
    const source = String(code ?? '');
    const resolvedLanguage = resolveLanguage(source, language, fallbackLanguage);
    const languageName = languageNames[resolvedLanguage] || languageNames.text;
    const annotations = Array.isArray(options.annotations) ? options.annotations.filter((item) => item && Number.isInteger(Number(item.line)) && item.text) : [];
    const lineNumbers = options.lineNumbers === true || annotations.length > 0;
    const highlightedLines = new Set([
      ...(Array.isArray(options.highlightLines) ? options.highlightLines : []),
      ...annotations.map((item) => item.line)
    ].map(Number).filter((line) => Number.isInteger(line) && line > 0));
    const lines = source.split('\n');
    if (source.endsWith('\n') && lines.length > 1) lines.pop();
    const codeHtml = lineNumbers || highlightedLines.size
      ? (() => {
        const state = {};
        return lines.map((line, index) => {
        const lineNumber = index + 1;
        const lineHtml = highlightCode(line, resolvedLanguage, state);
        const lineBreak = index < lines.length - 1 || source.endsWith('\n') ? '\n' : '';
        return `<span class="code-line${highlightedLines.has(lineNumber) ? ' is-highlighted' : ''}"${lineNumbers ? ` data-line-number="${lineNumber}"` : ''}>${lineHtml}${lineBreak}</span>`;
        }).join('');
      })()
      : highlightCode(source, resolvedLanguage);
    const notes = [
      options.note,
      ...(Array.isArray(options.notes) ? options.notes : []),
      ...annotations.map((item) => `السطر ${item.line}: ${item.text}`)
    ].filter((note) => typeof note === 'string' && note.trim());
    const noteHtml = notes.length
      ? `<div class="lesson-code-notes" dir="rtl">${notes.map((note) => `<p>${escapeHtml(note)}</p>`).join('')}</div>`
      : '';
    const toolbar = `<div class="lesson-code-toolbar">
      <strong>${escapeHtml(title || 'مثال برمجي')}</strong>
      <div class="lesson-code-toolbar-actions">
        <span class="code-language">${escapeHtml(languageName)}</span>
        ${options.copyButton !== false ? `<button class="copy-code-button" type="button" data-copy-code data-copy-text="${escapeHtml(source)}" aria-label="نسخ كود ${escapeHtml(languageName)}" aria-live="polite">نسخ الكود</button>` : ''}
      </div>
    </div>`;
    return `<div class="lesson-code-example">${options.description ? `<p class="lesson-code-description">${escapeHtml(options.description)}</p>` : ''}<div class="lesson-code-block">${toolbar}<pre${lineNumbers ? ' class="has-line-numbers"' : ''} tabindex="0" dir="ltr"><code class="language-${resolvedLanguage}">${codeHtml}</code></pre></div>${noteHtml}${options.commonError ? `<p class="lesson-code-error-note"><strong>خطأ شائع:</strong> ${escapeHtml(options.commonError)}</p>` : ''}</div>`;
  };

  window.EfhamaCodeBlocks = Object.freeze({ render, highlight: highlightCode, resolveLanguage });
})();
