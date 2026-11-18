/*
 * Efhama data layer — مصدر الحقيقة الوحيد لشكل البيانات وطريقة عرضها.
 * يُستخدم في 3 أماكن بنفس الكود:
 *   1) لوحة التحكم (المعاينة)
 *   2) الموقع التعليمي (قراءة الملف المنشور وعرضه)
 *   3) الخادم (لتوليد ملف النشر العام بدون المسودات)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EfhamaData = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCHEMA_VERSION = 1;

  var LEVELS = { beginner: 'مبتدئ', intermediate: 'متوسط', advanced: 'متقدم' };
  var QTYPES = {
    mcq: 'اختيار من متعدد',
    tf: 'صح / خطأ',
    predict_output: 'توقّع الناتج',
    find_error: 'اكتشف الخطأ',
    complete_code: 'أكمل الكود',
    write_code: 'اكتب الكود',
    practical: 'سؤال عملي',
    debugging: 'تصحيح الأخطاء'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u) && u.indexOf('//') !== 0) return u; // relative
    if (/^https?:\/\//i.test(u) || u.indexOf('//') === 0) return u;
    if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(u)) return u;
    return '';
  }

  function inline(t) {
    return esc(t)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function byOrder(a, b) { return (a.order || 0) - (b.order || 0); }

  function assetOf(data, v) {
    var list = (data && data.assets) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === v) return list[i];
    return null;
  }

  /* يحوّل قيمة صورة (معرّف أصل أو رابط) إلى رابط جاهز */
  function imgUrl(data, v, theme) {
    var a = assetOf(data, v);
    if (a) return safeUrl(theme === 'dark' && a.darkSrc ? a.darkSrc : a.src);
    return safeUrl(v);
  }

  function imgTag(data, v, alt, cls) {
    var a = assetOf(data, v);
    var light = safeUrl(a ? a.src : v);
    if (!light) return '';
    var text = alt || (a && (a.alt || a.name)) || '';
    var dark = a && a.darkSrc ? safeUrl(a.darkSrc) : '';
    var c = cls || '';
    var out = '<img class="' + esc(c) + (dark ? ' efhama-img-light' : '') + '" src="' + esc(light) +
      '" alt="' + esc(text) + '" loading="lazy">';
    if (dark) out += '<img class="' + esc(c) + ' efhama-img-dark" src="' + esc(dark) + '" alt="' + esc(text) + '" loading="lazy">';
    return out;
  }

  function parseTable(text) {
    var rows = String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean)
      .map(function (l) { return l.split('|').map(function (c) { return c.trim(); }); });
    return rows;
  }

  function renderQuestion(data, q, opts) {
    opts = opts || {};
    if (!q) return '';
    var showAns = opts.showAnswer !== false;
    var h = '<div class="efhama-q" data-type="' + esc(q.type) + '">';
    h += '<div class="efhama-q-head">';
    h += '<div class="efhama-q-meta"><span class="efhama-q-type-badge">' + esc(QTYPES[q.type] || q.type) + '</span>';
    if (q.points) h += '<span class="efhama-q-pts"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> ' + esc(q.points) + ' نقطة</span>';
    h += '</div>';
    h += '</div>';
    h += '<p class="efhama-q-text">' + inline(q.text) + '</p>';
    if (q.code) h += '<pre class="efhama-code" dir="ltr"><code>' + esc(q.code) + '</code></pre>';
    if (q.type === 'mcq') {
      h += '<ol class="efhama-q-options">';
      (q.options || []).forEach(function (o, i) {
        var ok = showAns && Number(q.answer) === i + 1;
        var letter = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'][i] || (i + 1);
        h += '<li' + (ok ? ' class="is-correct"' : '') + '><span class="opt-idx">' + letter + '</span><span class="opt-text">' + inline(o) + '</span>' + (ok ? ' <span class="efhama-tick">✓ إجابة صحيحة</span>' : '') + '</li>';
      });
      h += '</ol>';
    } else if (q.type === 'tf') {
      var ans = String(q.answer);
      h += '<ul class="efhama-q-options is-tf"><li' + (showAns && ans === 'true' ? ' class="is-correct"' : '') + '><span class="opt-text">صح</span>' + (showAns && ans === 'true' ? ' <span class="efhama-tick">✓</span>' : '') + '</li><li' +
        (showAns && ans === 'false' ? ' class="is-correct"' : '') + '><span class="opt-text">خطأ</span>' + (showAns && ans === 'false' ? ' <span class="efhama-tick">✓</span>' : '') + '</li></ul>';
    } else if (showAns && q.answer) {
      h += '<div class="efhama-q-answer"><strong>الإجابة النموذجية:</strong><pre dir="auto">' + esc(q.answer) + '</pre></div>';
    }
    if (showAns && q.explanation) h += '<div class="efhama-q-explain"><strong>الشرح والتوضيح:</strong><p>' + inline(q.explanation) + '</p></div>';
    if (opts.showHints && q.hints && q.hints.length) {
      h += '<details class="efhama-q-hints"><summary>💡 تلميحات الحل</summary><ul>' +
        q.hints.map(function (x) { return '<li>' + inline(x) + '</li>'; }).join('') + '</ul></details>';
    }
    return h + '</div>';
  }

  function renderBlock(data, b) {
    switch (b.type) {
      case 'heading': {
        var lv = Math.min(4, Math.max(2, Number(b.level) || 2));
        return '<h' + lv + ' class="efhama-heading">' + inline(b.text) + '</h' + lv + '>';
      }
      case 'paragraph':
        return String(b.text || '').split(/\n{2,}/).map(function (p) { return '<p>' + inline(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
      case 'list': {
        var tag = b.ordered ? 'ol' : 'ul';
        return '<' + tag + '>' + (b.items || []).map(function (i) { return '<li>' + inline(i) + '</li>'; }).join('') + '</' + tag + '>';
      }
      case 'image':
      case 'diagram': {
        var img = imgTag(data, b.image, b.alt, 'efhama-img');
        if (!img) return '';
        return '<figure class="efhama-figure' + (b.type === 'diagram' ? ' is-diagram' : '') + '">' +
          (b.type === 'diagram' ? '<div class="efhama-fig-badge">📊 رسم توضيحي</div>' : '') +
          img +
          (b.caption ? '<figcaption>' + inline(b.caption) + '</figcaption>' : '') + '</figure>';
      }
      case 'code': {
        var lang = esc(b.lang || 'code');
        return '<figure class="efhama-codeblock">' +
          '<div class="efhama-code-head">' +
            '<div class="efhama-code-dots"><span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span></div>' +
            '<span class="efhama-code-lang">' + lang + '</span>' +
            '<button type="button" class="efhama-code-copy" onclick="var c=this.closest(\'.efhama-codeblock\').querySelector(\'code\');if(c&&navigator.clipboard){navigator.clipboard.writeText(c.innerText);this.classList.add(\'copied\');var s=this;setTimeout(function(){s.classList.remove(\'copied\');},2000);}" title="نسخ الكود">' +
              '<span class="copy-lbl">نسخ الكود</span><span class="copied-lbl">تم النسخ ✓</span>' +
            '</button>' +
          '</div>' +
          '<pre dir="ltr" data-lang="' + lang + '"><code>' + esc(b.code) + '</code></pre>' +
          (b.caption ? '<figcaption>' + inline(b.caption) + '</figcaption>' : '') +
        '</figure>';
      }
      case 'table': {
        var rows = parseTable(b.text);
        if (!rows.length) return '';
        var head = rows[0], body = rows.slice(1);
        return '<div class="efhama-table-wrap"><table class="efhama-table"><thead><tr>' +
          head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          body.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>'; }).join('') +
          '</tbody></table></div>';
      }
      case 'note': {
        var tone = esc(b.tone || 'info');
        var icons = {
          info: '<svg class="efhama-note-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
          tip: '<svg class="efhama-note-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
          warning: '<svg class="efhama-note-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/></svg>'
        };
        var toneLabels = { info: 'ملاحظة', tip: 'فكرة مفيدة', warning: 'تنبيه' };
        var ico = icons[tone] || icons.info;
        var ttl = b.title ? inline(b.title) : (toneLabels[tone] || 'ملاحظة');
        return '<aside class="efhama-note is-' + tone + '">' +
          '<div class="efhama-note-head">' + ico + '<strong>' + ttl + '</strong></div>' +
          '<div class="efhama-note-content"><p>' + inline(b.text) + '</p></div>' +
        '</aside>';
      }
      case 'video': {
        var vs = safeUrl(b.src);
        if (!vs) return '';
        var vHtml = '';
        var ytMatch = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i.exec(vs);
        var gdriveMatch = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i.exec(vs);
        if (ytMatch) {
          vHtml = '<div class="efhama-iframe-wrap"><iframe src="https://www.youtube.com/embed/' + esc(ytMatch[1]) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="' + esc(b.title || 'فيديو يوتيوب') + '"></iframe></div>';
        } else if (gdriveMatch) {
          vHtml = '<div class="efhama-iframe-wrap"><iframe src="https://drive.google.com/file/d/' + esc(gdriveMatch[1]) + '/preview" allow="autoplay" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="' + esc(b.title || 'فيديو جوجل درايف') + '"></iframe></div>';
        } else {
          vHtml = '<video controls preload="metadata" playsinline data-efhama-video="' + esc(b.id) + '" data-efhama-lesson="' + esc(b.lessonId || '') + '" src="' + esc(vs) + '"></video>';
        }
        return '<figure class="efhama-video">' + vHtml +
          (b.title ? '<figcaption>' + inline(b.title) + '</figcaption>' : '') + '</figure>';
      }
      case 'question': {
        var qs = (data.questions || []).filter(function (x) { return x.id === b.questionId; })[0];
        return qs ? renderQuestion(data, qs, { showAnswer: true, showHints: true }) : '';
      }
      case 'summary':
        return '<section class="efhama-summary">' +
          '<div class="efhama-sec-head">' +
            '<span class="efhama-sec-badge efhama-badge-summary">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
            '</span>' +
            '<h3>خلاصة الدرس وأهم النقاط</h3>' +
          '</div>' +
          '<ul class="efhama-summary-list">' +
            (b.items || []).map(function (i) {
              return '<li><span class="efhama-summary-star">✦</span><span>' + inline(i) + '</span></li>';
            }).join('') +
          '</ul>' +
        '</section>';
      default: return '';
    }
  }

  function renderLesson(data, lesson) {
    if (!lesson) return '';
    var mod = lesson.moduleId && (data.modules || []).filter(function (m) { return m.id === lesson.moduleId; })[0];
    var path = mod && mod.pathId && (data.paths || []).filter(function (p) { return p.id === mod.pathId; })[0];

    var h = '<article class="efhama-lesson">';
    h += '<header class="efhama-header">';
    if (path || mod) {
      h += '<nav class="efhama-breadcrumb" aria-label="مسار الدرس">';
      if (path) h += '<span class="efhama-crumb"><span class="efhama-crumb-ico">🧭</span> ' + esc(path.name) + '</span>';
      if (path && mod) h += '<span class="efhama-crumb-sep">›</span>';
      if (mod) h += '<span class="efhama-crumb"><span class="efhama-crumb-ico">📦</span> ' + esc(mod.title) + '</span>';
      h += '</nav>';
    }
    h += '<h1 class="efhama-title">' + esc(lesson.title) + '</h1>';
    h += '<div class="efhama-meta">';
    if (lesson.level) {
      h += '<span class="efhama-chip efhama-chip-level is-' + esc(lesson.level) + '"><span class="efhama-chip-dot"></span>' + esc(LEVELS[lesson.level] || lesson.level) + '</span>';
    }
    if (lesson.duration) {
      h += '<span class="efhama-chip efhama-chip-duration"><svg class="efhama-chip-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ' + esc(lesson.duration) + ' دقيقة</span>';
    }
    if (lesson.status) {
      var isPub = lesson.status === 'published';
      h += '<span class="efhama-chip efhama-chip-status is-' + (isPub ? 'published' : 'draft') + '">' + (isPub ? '● منشور' : '○ مسودة') + '</span>';
    }
    var blockCount = (lesson.blocks || []).length;
    if (blockCount) {
      h += '<span class="efhama-chip efhama-chip-count"><svg class="efhama-chip-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> ' + blockCount + ' عناصر محتوى</span>';
    }
    h += '</div>';
    if (lesson.summary) h += '<p class="efhama-lead">' + inline(lesson.summary) + '</p>';
    h += '</header>';

    if ((lesson.objectives || []).length) {
      h += '<section class="efhama-objectives">' +
        '<div class="efhama-sec-head">' +
          '<span class="efhama-sec-badge efhama-badge-goals">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>' +
          '</span>' +
          '<h3>أهداف الدرس وما ستتعلمه</h3>' +
        '</div>' +
        '<ul class="efhama-goals-list">' +
          lesson.objectives.map(function (o) {
            return '<li><span class="efhama-check-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span><span>' + inline(o) + '</span></li>';
          }).join('') +
        '</ul>' +
      '</section>';
    }
    if ((lesson.prerequisites || []).length) {
      var names = lesson.prerequisites.map(function (id) {
        var l = (data.lessons || []).filter(function (x) { return x.id === id; })[0];
        return l ? l.title : null;
      }).filter(Boolean);
      if (names.length) {
        h += '<section class="efhama-prereq">' +
          '<div class="efhama-sec-head">' +
            '<span class="efhama-sec-badge efhama-badge-prereq">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>' +
            '</span>' +
            '<h3>قبل أن تبدأ (المتطلبات السابقة)</h3>' +
          '</div>' +
          '<ul class="efhama-prereq-list">' +
            names.map(function (n) {
              return '<li><span class="efhama-prereq-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> ' + esc(n) + '</span></li>';
            }).join('') +
          '</ul>' +
        '</section>';
      }
    }
    h += '<div class="efhama-body">' + (lesson.blocks || []).map(function (b) { return renderBlock(data, b.type === 'video' ? Object.assign({}, b, { lessonId: lesson.id }) : b); }).join('') + '</div>';
    var terms = (data.glossary || []).filter(function (t) { return (t.lessonIds || []).indexOf(lesson.id) !== -1; });
    if (terms.length) {
      h += '<section class="efhama-terms">' +
        '<div class="efhama-sec-head">' +
          '<span class="efhama-sec-badge efhama-badge-terms">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' +
          '</span>' +
          '<h3>مصطلحات الدرس (القاموس التقني)</h3>' +
        '</div>' +
        '<dl class="efhama-terms-grid">' + terms.map(function (t) {
          return '<div class="efhama-term-card">' +
            '<dt><span class="term-ar">' + esc(t.ar) + '</span> <span class="term-en" dir="ltr">' + esc(t.en) + '</span></dt>' +
            '<dd>' + inline(t.definition) + '</dd>' +
          '</div>';
        }).join('') + '</dl>' +
      '</section>';
    }
    return h + '</article>';
  }

  /* ما يراه الطلاب فقط: بدون مسودات، بدون مسارات مخفية، بدون بيانات الاستخدام */
  function publicView(d) {
    d = d || {};
    var paths = (d.paths || []).filter(function (p) { return p.visible !== false; }).sort(byOrder);
    var pid = {}; paths.forEach(function (p) { pid[p.id] = 1; });
    var modules = (d.modules || []).filter(function (m) { return pid[m.pathId]; }).sort(byOrder);
    var mid = {}; modules.forEach(function (m) { mid[m.id] = 1; });
    var lessons = (d.lessons || []).filter(function (l) { return l.status === 'published' && mid[l.moduleId]; }).sort(byOrder);
    var lid = {}; lessons.forEach(function (l) { lid[l.id] = 1; });
    lessons = lessons.map(function (l) {
      var c = JSON.parse(JSON.stringify(l));
      c.prerequisites = (c.prerequisites || []).filter(function (x) { return lid[x]; });
      return c;
    });
    var g = d.gamification || {};
    return {
      schemaVersion: d.schemaVersion || SCHEMA_VERSION,
      updatedAt: d.updatedAt || null,
      settings: d.settings || {},
      paths: paths,
      modules: modules,
      lessons: lessons,
      questions: d.questions || [],
      quizzes: (d.quizzes || []).filter(function (q) { return q.status === 'published'; }),
      projects: (d.projects || []).filter(function (p) { return p.status === 'published'; }),
      assets: d.assets || [],
      glossary: (d.glossary || []).map(function (t) {
        var c = JSON.parse(JSON.stringify(t));
        c.lessonIds = (c.lessonIds || []).filter(function (x) { return lid[x]; });
        return c;
      }),
      gamification: {
        xpRules: g.xpRules || [],
        levels: (g.levels || []).slice().sort(function (a, b) { return a.minXp - b.minXp; }),
        badges: (g.badges || []).filter(function (b) { return b.visible !== false; }),
        encouragements: g.encouragements || [],
        dailyChallenges: (g.dailyChallenges || []).filter(function (c) { return c.active !== false; }),
        rules: g.rules || {}
      }
    };
  }

  var STYLE_ID = 'efhama-data-styles';
  function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.efhama-img-dark{display:none}' +
      '[data-theme="dark"] .efhama-img-dark,.dark .efhama-img-dark{display:inline-block}' +
      '[data-theme="dark"] .efhama-img-light,.dark .efhama-img-light{display:none}' +
      '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]):not(.light) .efhama-img-dark{display:inline-block}' +
      ':root:not([data-theme="light"]):not(.light) .efhama-img-light{display:none}}';
    document.head.appendChild(s);
  }

  /* ---------- تخزين محلي (IndexedDB) — للوضع المحلي فقط ---------- */
  var idb = {
    _db: null,
    open: function () {
      var self = this;
      if (self._db) return Promise.resolve(self._db);
      return new Promise(function (res, rej) {
        if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB غير متاح'));
        var r = indexedDB.open('efhama-dashboard', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () { self._db = r.result; res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    },
    _tx: function (mode, fn) {
      return this.open().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction('kv', mode), st = tx.objectStore('kv'), out = fn(st);
          tx.oncomplete = function () { res(out && 'result' in out ? out.result : undefined); };
          tx.onerror = function () { rej(tx.error); };
          tx.onabort = function () { rej(tx.error || new Error('فشلت العملية')); };
        });
      });
    },
    get: function (k) { return this._tx('readonly', function (s) { return s.get(k); }); },
    set: function (k, v) { return this._tx('readwrite', function (s) { return s.put(v, k); }); },
    del: function (k) { return this._tx('readwrite', function (s) { return s.delete(k); }); },
    keys: function () { return this._tx('readonly', function (s) { return s.getAllKeys(); }); }
  };

  function load(url) {
    return fetch(url || '/public/efhama-data.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('تعذر تحميل بيانات المنصة (' + r.status + ')');
      return r.json();
    });
  }

  /* للتطوير فقط: قراءة النسخة العاملة المحفوظة من لوحة التحكم في نفس المتصفح */
  function loadLocalDraft() {
    return idb.get('data').then(function (d) {
      if (!d) throw new Error('لا توجد بيانات محلية');
      return publicView(d);
    });
  }

  function applySettings(settings) {
    if (typeof document === 'undefined' || !settings) return;
    var c = settings.colors || {};
    var rs = document.documentElement.style;
    if (c.primary) rs.setProperty('--efhama-primary', c.primary);
    if (settings.name) document.title = settings.name;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    LEVELS: LEVELS,
    QTYPES: QTYPES,
    esc: esc,
    safeUrl: safeUrl,
    inline: inline,
    imgUrl: imgUrl,
    imgTag: imgTag,
    assetOf: assetOf,
    renderBlock: renderBlock,
    renderQuestion: renderQuestion,
    renderLesson: renderLesson,
    publicView: publicView,
    injectStyles: injectStyles,
    idb: idb,
    load: load,
    loadLocalDraft: loadLocalDraft,
    applySettings: applySettings
  };
});
