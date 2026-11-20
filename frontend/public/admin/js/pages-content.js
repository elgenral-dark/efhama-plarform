(function () {
  'use strict';
  var E = window.Efhamha, esc = E.esc, Store = E.Store, ED = window.EfhamhaData, C = E.cell;

  var DIFF = [{ v: 'easy', l: 'سهل' }, { v: 'medium', l: 'متوسط' }, { v: 'hard', l: 'صعب' }];
  var QT = Object.keys(ED.QTYPES).map(function (k) { return { v: k, l: ED.QTYPES[k] }; });
  E.DIFF = DIFF;

  function countModules(pid) { return Store.list('modules').filter(function (m) { return m.pathId === pid; }).length; }
  function countLessons(pid) {
    var ms = Store.list('modules').filter(function (m) { return m.pathId === pid; }).map(function (m) { return m.id; });
    return Store.list('lessons').filter(function (l) { return ms.indexOf(l.moduleId) !== -1; }).length;
  }
  function icoCell(p) {
    var u = p.image ? E.assetSrc(p.image) : '';
    return '<span class="ico-cell">' + (u ? '<img alt="" src="' + esc(u) + '">' : esc(p.icon || '📘')) + '</span>';
  }
  function dupName(list, key, val, selfId) {
    val = String(val || '').trim().toLowerCase();
    return list.some(function (x) { return x.id !== selfId && String(x[key] || '').trim().toLowerCase() === val; });
  }

  /* ---------------- المسارات ---------------- */
  E.page('paths', E.crudPage({
    coll: 'paths', prefix: 'p', title: 'المسارات التعليمية', subtitle: 'أضف المسارات ورتّبها وتحكم في ظهورها للطلاب.', singular: 'مسار', icon: 'route',
    nameOf: function (x) { return x.name; }, order: { groupBy: null },
    search: function (x) { return x.name + ' ' + (x.description || ''); },
    filters: [{ key: 'level', label: 'كل المستويات', options: function () { return E.levelOptions; } },
      { key: 'visible', label: 'كل الحالات', options: function () { return [{ v: 'yes', l: 'ظاهر' }, { v: 'no', l: 'مخفي' }]; }, match: function (x, v) { return (x.visible !== false) === (v === 'yes'); } }],
    columns: [
      { key: 'order', label: 'الترتيب' },
      { key: 'name', label: 'المسار', sort: function (x) { return x.name; }, render: function (x) { return '<span class="path-table-name">' + icoCell(x) + '<span class="path-table-text">' + C.name(x.name, x.description) + '</span></span>'; } },
      { key: 'level', label: 'المستوى', render: function (x) { return C.level(x.level); } },
      { key: 'mods', label: 'الوحدات', render: function (x) { return E.num(countModules(x.id)); } },
      { key: 'less', label: 'الدروس', render: function (x) { return E.num(countLessons(x.id)); } },
      { key: 'visible', label: 'الظهور', render: function (x) { return x.visible !== false ? C.badge('ظاهر', 'ok') : C.badge('مخفي', 'warn'); } }
    ],
    fields: [
      { key: 'name', label: 'اسم المسار', type: 'text', required: true, wide: true },
      { key: 'description', label: 'الوصف', type: 'textarea', wide: true },
      { key: 'icon', label: 'أيقونة (إيموجي)', type: 'text', hint: 'تُستخدم إن لم تُرفع صورة.' },
      { key: 'level', label: 'مستوى المسار', type: 'select', options: E.levelOptions, default: 'beginner' },
      { key: 'image', label: 'صورة المسار', type: 'image', category: 'paths', wide: true },
      { key: 'order', label: 'ترتيب الظهور', type: 'number', min: 1 },
      { key: 'visible', label: 'المسار ظاهر للطلاب', type: 'toggle', default: true },
      { key: 'completion.lessonsPct', label: 'شرط الشهادة: نسبة الدروس المكتملة (%)', type: 'number', min: 1, max: 100, default: 100, hint: 'تُصدر الشهادة فقط بعد تحقق هذا الشرط (يُتحقق منه على الخادم).' },
      { key: 'completion.requireQuizzes', label: 'شرط الشهادة: اجتياز كل اختبارات المسار المنشورة', type: 'toggle', default: false, wide: true }
    ],
    newValues: function () { return { icon: '📘', level: 'beginner', visible: true, completion: { lessonsPct: 100, requireQuizzes: false } }; },
    validate: function (v, isNew, item) {
      if (dupName(Store.list('paths'), 'name', v.name, item && item.id)) return { name: 'يوجد مسار بنفس الاسم' };
    },
    deleteInfo: function (x) {
      var m = countModules(x.id), l = countLessons(x.id);
      return m || l ? 'سيُحذف معه ' + m + ' وحدة و' + l + ' درس. يمكنك التراجع بعد الحذف مباشرة.' : '';
    }
  }));

  /* ---------------- الوحدات ---------------- */
  E.page('modules', E.crudPage({
    coll: 'modules', prefix: 'm', title: 'الوحدات', subtitle: 'قسّم كل مسار إلى وحدات مرتبة.', singular: 'وحدة', icon: 'layers',
    nameOf: function (x) { return x.title; }, order: { groupBy: 'pathId' }, titleKey: 'title', duplicate: true,
    search: function (x) { return x.title + ' ' + (x.description || '') + ' ' + E.pathName(x.pathId); },
    filters: [{ key: 'pathId', label: 'كل المسارات', options: E.pathOptions }],
    columns: [
      { key: 'order', label: 'الترتيب' },
      { key: 'title', label: 'الوحدة', sort: function (x) { return x.title; }, render: function (x) { return C.name(x.title, x.description); } },
      { key: 'pathId', label: 'المسار', sort: function (x) { return E.pathName(x.pathId); }, render: function (x) { return esc(E.pathName(x.pathId)) || C.badge('بدون مسار', 'err'); } },
      { key: 'less', label: 'الدروس', render: function (x) { return E.num(Store.list('lessons').filter(function (l) { return l.moduleId === x.id; }).length); } }
    ],
    fields: [
      { key: 'pathId', label: 'المسار', type: 'select', required: true, empty: 'اختر المسار', options: E.pathOptions },
      { key: 'title', label: 'عنوان الوحدة', type: 'text', required: true },
      { key: 'description', label: 'وصف مختصر', type: 'textarea', wide: true },
      { key: 'order', label: 'الترتيب داخل المسار', type: 'number', min: 1 }
    ],
    newValues: function (st) { return { pathId: st.filters.pathId || (E.pathOptions()[0] || {}).v || '' }; },
    deleteInfo: function (x) {
      var n = Store.list('lessons').filter(function (l) { return l.moduleId === x.id; }).length;
      return n ? 'سيُحذف معها ' + n + ' درس.' : '';
    }
  }));

  /* ---------------- الأسئلة ---------------- */
  var codeTypes = ['mcq', 'predict_output', 'find_error', 'complete_code', 'write_code', 'debugging'];
  var answerHint = {
    predict_output: 'اكتب الناتج المتوقع بالضبط.', find_error: 'صف الخطأ وسطره وكيف يُصلح.', complete_code: 'اكتب الكود الذي يملأ الفراغات (___).',
    write_code: 'اكتب الحل النموذجي.', practical: 'اكتب الإجابة النموذجية أو معايير التصحيح.', debugging: 'اكتب الكود بعد التصحيح مع سبب المشكلة.'
  };
  E.page('questions', E.crudPage({
    coll: 'questions', prefix: 'q', title: 'بنك الأسئلة', subtitle: 'أسئلة مركزية تُستخدم في الدروس والاختبارات.', singular: 'سؤال', icon: 'help', titleKey: 'text', duplicate: true, formSize: 'lg',
    nameOf: function (x) { return x.text.length > 50 ? x.text.slice(0, 50) + '…' : x.text; },
    search: function (x) { return x.text + ' ' + (x.code || '') + ' ' + (x.explanation || '') + ' ' + E.pathName(x.pathId); },
    filters: [
      { key: 'pathId', label: 'كل المسارات', options: E.pathOptions },
      { key: 'type', label: 'كل الأنواع', options: function () { return QT; } },
      { key: 'difficulty', label: 'كل المستويات', options: function () { return DIFF; } }
    ],
    columns: [
      { key: 'text', label: 'السؤال', sort: function (x) { return x.text; }, render: function (x) { return '<div class="clip t-main" dir="auto">' + esc(x.text) + '</div>'; } },
      { key: 'type', label: 'النوع', sort: function (x) { return x.type; }, render: function (x) { return C.badge(ED.QTYPES[x.type] || x.type, 'brand'); } },
      { key: 'difficulty', label: 'الصعوبة', sort: function (x) { return x.difficulty; }, render: function (x) { return C.badge(E.optLabel(DIFF, x.difficulty)); } },
      { key: 'points', label: 'النقاط', sort: function (x) { return x.points || 0; }, render: function (x) { return E.num(x.points); } },
      { key: 'pathId', label: 'المسار', render: function (x) { return esc(E.pathName(x.pathId)); } }
    ],
    fields: [
      { key: 'type', label: 'نوع السؤال', type: 'select', options: QT, default: 'mcq' },
      { key: 'difficulty', label: 'مستوى الصعوبة', type: 'select', options: DIFF, default: 'easy' },
      { key: 'text', label: 'نص السؤال', type: 'textarea', required: true, wide: true },
      { key: 'code', label: 'الكود (اختياري)', type: 'code', rows: 6, wide: true, showIf: function (v) { return codeTypes.indexOf(v.type) !== -1; }, hint: 'للأسئلة التي تعرض كودًا.' },
      { key: 'options', label: 'الخيارات (كل خيار في سطر)', type: 'lines', wide: true, showIf: function (v) { return v.type === 'mcq'; }, hint: 'اكتب خيارين على الأقل.' },
      { key: '_aMcq', label: 'رقم الخيار الصحيح', type: 'number', min: 1, showIf: function (v) { return v.type === 'mcq'; }, required: true },
      { key: '_aTf', label: 'الإجابة الصحيحة', type: 'select', empty: 'اختر', options: [{ v: 'true', l: 'صح' }, { v: 'false', l: 'خطأ' }], showIf: function (v) { return v.type === 'tf'; }, required: true },
      { key: '_aText', label: 'الإجابة النموذجية', type: 'textarea', wide: true, required: true, showIf: function (v) { return v.type !== 'mcq' && v.type !== 'tf'; }, hint: '' },
      { key: 'explanation', label: 'شرح الإجابة', type: 'textarea', wide: true },
      { key: 'hints', label: 'تلميحات (كل تلميح في سطر)', type: 'lines', wide: true },
      { key: 'points', label: 'عدد النقاط', type: 'number', min: 0, default: 1 },
      { key: 'pathId', label: 'المسار', type: 'select', empty: 'غير مرتبط', options: E.pathOptions },
      { key: 'moduleId', label: 'الوحدة', type: 'select', empty: 'غير مرتبط', dependsOn: ['pathId'], options: function (v) { return E.moduleOptions(v.pathId); } },
      { key: 'lessonId', label: 'الدرس', type: 'select', empty: 'غير مرتبط', dependsOn: ['moduleId'], options: function (v) { return E.lessonOptions(v.moduleId); } }
    ],
    newValues: function (st) { return { type: 'mcq', difficulty: 'easy', points: 1, options: ['', ''].filter(Boolean), hints: [], pathId: st.filters.pathId || '' }; },
    prepare: function (v) {
      v._aMcq = v.type === 'mcq' ? Number(v.answer) || null : null;
      v._aTf = v.type === 'tf' ? String(v.answer || '') : '';
      v._aText = v.type !== 'mcq' && v.type !== 'tf' ? String(v.answer || '') : '';
      return v;
    },
    validate: function (v) {
      if (v.type === 'mcq') {
        var n = (v.options || []).length;
        if (n < 2) return { options: 'أضف خيارين على الأقل' };
        if (!(v._aMcq >= 1 && v._aMcq <= n)) return { _aMcq: 'اختر رقمًا بين 1 و' + n };
      }
    },
    beforeSave: function (v) {
      v.answer = v.type === 'mcq' ? v._aMcq : v.type === 'tf' ? v._aTf : v._aText;
      delete v._aMcq; delete v._aTf; delete v._aText;
      if (v.type !== 'mcq') v.options = [];
      if (v.type === 'tf') v.code = '';
    },
    deleteInfo: function (x) {
      var n = Store.list('quizzes').filter(function (z) { return (z.questionIds || []).indexOf(x.id) !== -1; }).length;
      return n ? 'سيُزال من ' + n + ' اختبار.' : '';
    }
  }));
  E.QT = QT;

  /* ---------------- الاختبارات ---------------- */
  function quizPicker(slot, values, changed) {
    var q = '', fp = '', ft = '';
    function draw() {
      var sel = values.questionIds || [];
      var all = Store.list('questions');
      var avail = all.filter(function (x) {
        if (sel.indexOf(x.id) !== -1) return false;
        if (fp && x.pathId !== fp) return false; if (ft && x.type !== ft) return false;
        return !q || (x.text + ' ' + (x.code || '')).toLowerCase().indexOf(q) !== -1;
      });
      slot.innerHTML = '<div class="picker"><div class="col"><h4>بنك الأسئلة (' + avail.length + ')</h4><div class="filters"><input type="search" data-pq placeholder="بحث…" value="' + esc(q) + '">' +
        '<select data-pp><option value="">كل المسارات</option>' + E.pathOptions().map(function (o) { return '<option value="' + o.v + '"' + (fp === o.v ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select>' +
        '<select data-pt><option value="">كل الأنواع</option>' + QT.map(function (o) { return '<option value="' + o.v + '"' + (ft === o.v ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select></div><ul>' +
        (avail.length ? avail.map(function (x) { return '<li><span class="t" title="' + esc(x.text) + '">' + esc(x.text) + '</span><button type="button" class="icon-btn sm" data-add="' + x.id + '" aria-label="إضافة">' + E.icon('plus') + '</button></li>'; }).join('') : '<li class="t-sub">' + (all.length ? 'لا توجد أسئلة مطابقة' : 'أضف أسئلة في بنك الأسئلة أولًا') + '</li>') +
        '</ul></div><div class="col"><h4>أسئلة الاختبار (' + sel.length + ')</h4><ul>' +
        (sel.length ? sel.map(function (id, i) {
          var x = Store.byId('questions', id); if (!x) return '';
          return '<li><span class="t" title="' + esc(x.text) + '">' + (i + 1) + '. ' + esc(x.text) + '</span>' +
            '<button type="button" class="icon-btn sm" data-mv="' + i + '" data-d="-1" aria-label="أعلى"' + (i === 0 ? ' disabled' : '') + '>' + E.icon('up') + '</button>' +
            '<button type="button" class="icon-btn sm" data-mv="' + i + '" data-d="1" aria-label="أسفل"' + (i === sel.length - 1 ? ' disabled' : '') + '>' + E.icon('down') + '</button>' +
            '<button type="button" class="icon-btn sm danger" data-rm="' + id + '" aria-label="إزالة">' + E.icon('x') + '</button></li>';
        }).join('') : '<li class="t-sub">لم تُختر أسئلة بعد</li>') + '</ul></div></div>';
      var qi = E.$('[data-pq]', slot);
      qi.addEventListener('input', function () { q = qi.value.trim().toLowerCase(); var pos = qi.selectionStart; draw(); var n = E.$('[data-pq]', slot); n.focus(); n.setSelectionRange(pos, pos); });
      E.$('[data-pp]', slot).addEventListener('change', function (e) { fp = e.target.value; draw(); });
      E.$('[data-pt]', slot).addEventListener('change', function (e) { ft = e.target.value; draw(); });
    }
    slot.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var sel = (values.questionIds = values.questionIds || []);
      if (b.dataset.add) sel.push(b.dataset.add);
      else if (b.dataset.rm) sel.splice(sel.indexOf(b.dataset.rm), 1);
      else if (b.dataset.mv) { var i = +b.dataset.mv, j = i + +b.dataset.d; var t = sel[i]; sel[i] = sel[j]; sel[j] = t; }
      else return;
      changed(); draw();
    });
    draw();
  }
  function previewQuiz(v) {
    var qs = (v.questionIds || []).map(function (id) { return Store.byId('questions', id); }).filter(Boolean);
    var body = E.el('<div class="preview-pane"><div class="efhamha-meta"><span>' + (v.duration ? v.duration + ' دقيقة' : 'بدون مدة') + '</span><span>النجاح من ' + (v.passScore || 0) + '%</span><span>' + (v.attempts ? v.attempts + ' محاولات' : 'محاولات غير محدودة') + '</span><span>' + (v.shuffle === 'random' ? 'ترتيب عشوائي' : 'ترتيب ثابت') + '</span></div>' +
      '<label class="switch"><input type="checkbox" data-ans><span class="track"></span><span>إظهار الإجابات الصحيحة</span></label><div class="efhamha-lesson" data-qs></div></div>');
    function draw() {
      var show = E.$('[data-ans]', body).checked;
      E.$('[data-qs]', body).innerHTML = qs.length ? qs.map(function (q, i) { return '<h3>سؤال ' + (i + 1) + '</h3>' + ED.renderQuestion(Store.data, q, { showAnswer: show, showHints: true }); }).join('') : '<div class="empty-chart">لا توجد أسئلة في هذا الاختبار.</div>';
    }
    E.$('[data-ans]', body).addEventListener('change', draw); draw();
    E.modal({ title: 'معاينة: ' + (v.title || 'اختبار'), size: 'lg', body: body, footer: [{ label: 'إغلاق' }] });
  }
  E.page('quizzes', E.crudPage({
    coll: 'quizzes', prefix: 'z', title: 'الاختبارات', subtitle: 'ابنِ اختبارات من أسئلة البنك وحدّد مدتها ودرجة النجاح.', singular: 'اختبار', icon: 'clipboard', formSize: 'lg', duplicate: true,
    nameOf: function (x) { return x.title; },
    search: function (x) { return x.title + ' ' + E.pathName(x.pathId); },
    filters: [{ key: 'pathId', label: 'كل المسارات', options: E.pathOptions }, { key: 'status', label: 'كل الحالات', options: function () { return E.statusOptions; } }],
    columns: [
      { key: 'title', label: 'الاختبار', sort: function (x) { return x.title; }, render: function (x) { return C.name(x.title, E.pathName(x.pathId) + (x.moduleId ? ' › ' + E.moduleName(x.moduleId) : '')); } },
      { key: 'qs', label: 'الأسئلة', render: function (x) { return E.num((x.questionIds || []).length); } },
      { key: 'passScore', label: 'درجة النجاح', render: function (x) { return (x.passScore || 0) + '%'; } },
      { key: 'attempts', label: 'المحاولات', render: function (x) { return x.attempts ? E.num(x.attempts) : 'غير محدودة'; } },
      { key: 'status', label: 'الحالة', sort: function (x) { return x.status; }, render: function (x) { return C.status(x.status); } }
    ],
    rowActions: [{ icon: 'eye', label: 'معاينة', onClick: function (x) { previewQuiz(x); } }],
    formButtons: [{ label: E.icon('eye') + ' معاينة', push: true, onClick: previewQuiz }],
    fields: [
      { key: 'title', label: 'اسم الاختبار', type: 'text', required: true, wide: true },
      { key: 'pathId', label: 'المسار', type: 'select', empty: 'غير مرتبط', options: E.pathOptions },
      { key: 'moduleId', label: 'الوحدة', type: 'select', empty: 'غير مرتبط', dependsOn: ['pathId'], options: function (v) { return E.moduleOptions(v.pathId); } },
      { key: 'duration', label: 'مدة الاختبار بالدقائق (0 = بدون مدة)', type: 'number', min: 0, default: 0 },
      { key: 'passScore', label: 'درجة النجاح (%)', type: 'number', min: 0, max: 100, default: 60, required: true },
      { key: 'attempts', label: 'عدد المحاولات (0 = غير محدود)', type: 'number', min: 0, default: 3 },
      { key: 'shuffle', label: 'ترتيب الأسئلة', type: 'select', options: [{ v: 'fixed', l: 'ثابت كما اخترته' }, { v: 'random', l: 'عشوائي لكل محاولة' }], default: 'fixed' },
      { key: 'status', label: 'الحالة', type: 'select', options: E.statusOptions, default: 'draft' },
      { key: 'questionIds', label: 'الأسئلة', type: 'custom', wide: true, render: quizPicker }
    ],
    newValues: function (st) { return { status: 'draft', questionIds: [], passScore: 60, attempts: 3, duration: 0, shuffle: 'fixed', pathId: st.filters.pathId || '' }; },
    validate: function (v) { if (v.status === 'published' && !(v.questionIds || []).length) return { questionIds: 'أضف سؤالًا واحدًا على الأقل قبل النشر' }; }
  }));

  /* ---------------- المشروعات ---------------- */
  E.page('projects', E.crudPage({
    coll: 'projects', prefix: 'j', title: 'المشروعات', subtitle: 'مشروعات تطبيقية يبنيها الطلاب.', singular: 'مشروع', icon: 'briefcase', formSize: 'lg', duplicate: true,
    nameOf: function (x) { return x.title; },
    search: function (x) { return x.title + ' ' + (x.description || '') + ' ' + (x.tools || []).join(' ') + ' ' + (x.skills || []).join(' '); },
    filters: [{ key: 'pathId', label: 'كل المسارات', options: E.pathOptions }, { key: 'difficulty', label: 'كل المستويات', options: function () { return DIFF; } }, { key: 'status', label: 'كل الحالات', options: function () { return E.statusOptions; } }],
    columns: [
      { key: 'title', label: 'المشروع', sort: function (x) { return x.title; }, render: function (x) { return C.name(x.title, x.description); } },
      { key: 'pathId', label: 'المسار', render: function (x) { return esc(E.pathName(x.pathId)); } },
      { key: 'difficulty', label: 'الصعوبة', render: function (x) { return C.badge(E.optLabel(DIFF, x.difficulty)); } },
      { key: 'status', label: 'الحالة', sort: function (x) { return x.status; }, render: function (x) { return C.status(x.status); } }
    ],
    fields: [
      { key: 'title', label: 'اسم المشروع', type: 'text', required: true, wide: true },
      { key: 'pathId', label: 'المسار', type: 'select', required: true, empty: 'اختر المسار', options: E.pathOptions },
      { key: 'difficulty', label: 'مستوى الصعوبة', type: 'select', options: DIFF, default: 'easy' },
      { key: 'description', label: 'وصف المشروع', type: 'textarea', wide: true },
      { key: 'image', label: 'صورة المشروع', type: 'image', category: 'projects', wide: true },
      { key: 'tools', label: 'الأدوات المستخدمة (افصل بفاصلة)', type: 'tags', wide: true },
      { key: 'steps', label: 'خطوات التنفيذ (خطوة في كل سطر)', type: 'lines', wide: true },
      { key: 'requirements', label: 'متطلبات المشروع (سطر لكل متطلب)', type: 'lines', wide: true },
      { key: 'criteria', label: 'معايير التقييم (سطر لكل معيار)', type: 'lines', wide: true },
      { key: 'skills', label: 'المهارات المستهدفة (افصل بفاصلة)', type: 'tags', wide: true },
      { key: 'status', label: 'الحالة', type: 'select', options: E.statusOptions, default: 'draft' }
    ],
    newValues: function (st) { return { status: 'draft', difficulty: 'easy', pathId: st.filters.pathId || '' }; }
  }));

  /* ---------------- المصطلحات ---------------- */
  E.page('glossary', E.crudPage({
    coll: 'glossary', prefix: 't', title: 'القاموس التقني', subtitle: 'مصطلحات تظهر للطلاب مع تعريف ومثال.', singular: 'مصطلح', icon: 'glossary', titleKey: 'ar',
    nameOf: function (x) { return x.ar; },
    search: function (x) { return x.ar + ' ' + x.en + ' ' + (x.definition || ''); },
    filters: [{ key: 'pathId', label: 'كل المسارات', options: E.pathOptions }],
    columns: [
      { key: 'ar', label: 'المصطلح', sort: function (x) { return x.ar; }, render: function (x) { return C.name(x.ar, x.definition); } },
      { key: 'en', label: 'بالإنجليزية', sort: function (x) { return x.en.toLowerCase(); }, render: function (x) { return '<span dir="ltr">' + esc(x.en) + '</span>'; } },
      { key: 'pathId', label: 'المسار', render: function (x) { return esc(E.pathName(x.pathId)); } },
      { key: 'ls', label: 'الدروس', render: function (x) { return E.num((x.lessonIds || []).length); } }
    ],
    fields: [
      { key: 'ar', label: 'المصطلح بالعربية', type: 'text', required: true },
      { key: 'en', label: 'المصطلح بالإنجليزية', type: 'text', required: true },
      { key: 'definition', label: 'تعريف مبسط', type: 'textarea', required: true, wide: true },
      { key: 'example', label: 'مثال عملي', type: 'textarea', wide: true },
      { key: 'pathId', label: 'المسار المرتبط', type: 'select', empty: 'غير مرتبط', options: E.pathOptions, wide: true },
      { key: 'lessonIds', label: 'الدروس التي يظهر فيها', type: 'refs', wide: true, emptyText: 'لا توجد دروس بعد', options: function () { return Store.list('lessons').map(function (l) { return { v: l.id, l: l.title }; }); } }
    ],
    newValues: function (st) { return { pathId: st.filters.pathId || '', lessonIds: [] }; },
    validate: function (v, isNew, item) {
      if (dupName(Store.list('glossary'), 'en', v.en, item && item.id)) return { en: 'هذا المصطلح موجود بالفعل' };
    }
  }));
})();
