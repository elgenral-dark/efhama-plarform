(function () {
  'use strict';
  var E = window.Efhama, esc = E.esc, Store = E.Store, ED = window.EfhamaData, C = E.cell;

  var BT = {
    heading: ['عنوان', 'edit'], paragraph: ['فقرة', 'book'], list: ['قائمة', 'menu'], image: ['صورة', 'image'], diagram: ['رسم تعليمي', 'layers'],
    code: ['كود برمجي', 'clipboard'], video: ['فيديو', 'eye'], table: ['جدول', 'database'], note: ['ملاحظة', 'alert'], question: ['سؤال', 'help'], summary: ['ملخص', 'check']
  };
  var LANGS = ['html', 'css', 'javascript', 'python', 'sql', 'bash', 'text'].map(function (x) { return { v: x, l: x }; });

  function blockFields(type) {
    switch (type) {
      case 'heading': return [
        { key: 'level', label: 'حجم العنوان', type: 'select', options: [{ v: '2', l: 'رئيسي' }, { v: '3', l: 'فرعي' }, { v: '4', l: 'صغير' }], default: '2' },
        { key: 'text', label: 'نص العنوان', type: 'text', required: true, wide: true }];
      case 'paragraph': return [{ key: 'text', label: 'نص الفقرة', type: 'textarea', rows: 5, wide: true, hint: 'يمكنك استخدام **نص غامق** و `كود` داخل السطر. اترك سطرًا فارغًا لبدء فقرة جديدة.' }];
      case 'list': return [
        { key: 'ordered', label: 'قائمة مرقمة', type: 'toggle', default: false },
        { key: 'items', label: 'العناصر (عنصر في كل سطر)', type: 'lines', wide: true }];
      case 'image': case 'diagram': return [
        { key: 'image', label: type === 'diagram' ? 'الرسم التعليمي' : 'الصورة', type: 'image', category: type === 'diagram' ? 'diagrams' : 'images', wide: true },
        { key: 'alt', label: 'نص بديل (لقارئات الشاشة)', type: 'text' },
        { key: 'caption', label: 'تعليق تحت الصورة', type: 'text' }];
      case 'code': return [
        { key: 'lang', label: 'اللغة', type: 'select', options: LANGS, default: 'python' },
        { key: 'caption', label: 'عنوان الكود (اختياري)', type: 'text' },
        { key: 'code', label: 'الكود', type: 'code', rows: 8, wide: true }];
      case 'video': return [
        { key: 'title', label: 'عنوان الفيديو', type: 'text' },
        { key: 'src', label: 'رابط الفيديو (YouTube أو Google Drive)', type: 'video', wide: true, hint: 'الصق رابط الفيديو من YouTube أو رابط المشاركة من Google Drive.' }];
      case 'table': return [{ key: 'text', label: 'محتوى الجدول', type: 'textarea', rows: 5, wide: true, hint: 'اكتب كل صف في سطر وافصل الخلايا بالرمز |  — السطر الأول هو عناوين الأعمدة.' }];
      case 'note': return [
        { key: 'tone', label: 'نوع الملاحظة', type: 'select', options: [{ v: 'info', l: 'معلومة' }, { v: 'tip', l: 'نصيحة' }, { v: 'warning', l: 'تنبيه' }], default: 'info' },
        { key: 'title', label: 'العنوان (اختياري)', type: 'text' },
        { key: 'text', label: 'نص الملاحظة', type: 'textarea', wide: true }];
      case 'question': return [{ key: 'questionId', label: 'السؤال من بنك الأسئلة', type: 'select', empty: 'اختر سؤالًا', wide: true,
        options: function () { return Store.list('questions').map(function (q) { return { v: q.id, l: q.text.length > 80 ? q.text.slice(0, 80) + '…' : q.text }; }); } }];
      case 'summary': return [{ key: 'items', label: 'نقاط الملخص (نقطة في كل سطر)', type: 'lines', wide: true }];
    }
    return [];
  }
  function blockIssues(b) {
    if (b.type === 'heading' && !b.text) return 'العنوان فارغ';
    if (b.type === 'paragraph' && !b.text) return 'الفقرة فارغة';
    if ((b.type === 'image' || b.type === 'diagram') && !b.image) return 'لم تُحدد صورة';
    if (b.type === 'code' && !b.code) return 'الكود فارغ';
    if (b.type === 'question' && !b.questionId) return 'لم يُختر سؤال';
    if (b.type === 'list' && !(b.items || []).length) return 'القائمة فارغة';
    if (b.type === 'video') {
      var s = (b.src || '').trim();
      if (!s) return 'لم يُحدد رابط فيديو';
      var isYt = /(?:youtube\.com|youtu\.be)/i.test(s);
      var isGd = /drive\.google\.com/i.test(s);
      if (!isYt && !isGd && !/^(https?:\/\/|\/)/i.test(s)) return 'الرابط غير صالح — الصق رابط من YouTube أو Google Drive';
    }
    return '';
  }

  function previewLesson(lesson, terms) {
    var id = lesson.id || '__new';
    var dd = Object.assign({}, Store.data, {
      glossary: Store.data.glossary.map(function (t) {
        var c = E.clone(t), has = c.lessonIds.indexOf(id) !== -1, want = terms ? terms.indexOf(t.id) !== -1 : has;
        if (want && !has) c.lessonIds.push(id); if (!want && has) c.lessonIds = c.lessonIds.filter(function (x) { return x !== id; });
        return c;
      })
    });
    var l = Object.assign({}, lesson, { id: id });
    E.modal({ title: 'معاينة الدرس', size: 'lg', body: '<div class="preview-pane">' + ED.renderLesson(dd, l) + '</div>', footer: [{ label: 'إغلاق' }] });
  }

  /* ---------- قائمة الدروس ---------- */
  var list = E.crudPage({
    coll: 'lessons', prefix: 'l', title: 'الدروس', subtitle: 'اكتب الدروس ورتّبها داخل الوحدات وانشرها.', singular: 'درس', icon: 'book', duplicate: true,
    nameOf: function (x) { return x.title; }, order: { groupBy: 'moduleId' },
    editRoute: function (id, st) { return id === 'new' ? '#/lessons/new' + (st.filters.moduleId ? '?module=' + st.filters.moduleId : '') : '#/lessons/edit/' + id; },
    search: function (x) { return x.title + ' ' + (x.summary || '') + ' ' + E.moduleName(x.moduleId); },
    filters: [
      { key: 'pathId', label: 'كل المسارات', options: E.pathOptions, match: function (x, v) { var m = Store.byId('modules', x.moduleId); return !!m && m.pathId === v; } },
      { key: 'moduleId', label: 'كل الوحدات', options: function () { return E.moduleOptions(); } },
      { key: 'status', label: 'كل الحالات', options: function () { return E.statusOptions; } },
      { key: 'level', label: 'كل المستويات', options: function () { return E.levelOptions; } }
    ],
    columns: [
      { key: 'order', label: 'الترتيب' },
      { key: 'title', label: 'الدرس', sort: function (x) { return x.title; }, render: function (x) { return C.name(x.title, x.summary); } },
      { key: 'moduleId', label: 'الوحدة', render: function (x) { var m = Store.byId('modules', x.moduleId); return m ? esc(E.pathName(m.pathId) + ' › ' + m.title) : C.badge('بدون وحدة', 'err'); } },
      { key: 'level', label: 'المستوى', render: function (x) { return C.level(x.level); } },
      { key: 'duration', label: 'المدة', sort: function (x) { return x.duration || 0; }, render: function (x) { return x.duration ? x.duration + ' د' : ''; } },
      { key: 'status', label: 'الحالة', sort: function (x) { return x.status; }, render: function (x) { return C.status(x.status); } }
    ],
    rowActions: [{ icon: 'eye', label: 'معاينة', onClick: function (x) { previewLesson(x); } }]
  });

  /* ---------- المحرر ---------- */
  function editor(container, ctx) {
    var isNew = ctx.sub[0] === 'new';
    var id = ctx.sub[1];
    var src = isNew ? null : Store.byId('lessons', id);
    if (!isNew && !src) {
      container.innerHTML = '<div class="empty panel">' + E.icon('alert') + '<h3>الدرس غير موجود</h3><p>ربما تم حذفه.</p><a class="btn primary" href="#/lessons">العودة للدروس</a></div>';
      return;
    }
    if (isNew && !Store.list('modules').length) {
      container.innerHTML = '<div class="empty panel">' + E.icon('layers') + '<h3>أضف وحدة أولًا</h3><p>كل درس يتبع وحدة داخل مسار. أنشئ وحدة ثم عد لإضافة الدرس.</p><a class="btn primary" href="#/modules?new=1">إضافة وحدة</a></div>';
      return;
    }
    if (!E.can('lessons', 'edit')) {
      container.innerHTML = '<div class="empty panel">' + E.icon('alert') + '<h3>قراءة فقط</h3><p>ليست لديك صلاحية تعديل الدروس.</p><a class="btn primary" href="#/lessons">العودة</a></div>';
      return;
    }
    var key = 'efhama:draft:lesson:' + (isNew ? 'new' : id);
    var lesson = isNew
      ? { title: '', moduleId: ctx.params.module || '', summary: '', level: 'beginner', duration: 10, status: 'draft', objectives: [], prerequisites: [], blocks: [], terms: [] }
      : E.clone(src);
    if (!isNew) lesson.terms = Store.list('glossary').filter(function (t) { return (t.lessonIds || []).indexOf(id) !== -1; }).map(function (t) { return t.id; });
    var dirty = false, timer = null, metaForm, aiCtx = null;
    if (isNew && ctx.params.ai === '1') {
      try { aiCtx = JSON.parse(sessionStorage.getItem('efhama:ai-draft') || 'null'); } catch (e) { aiCtx = null; }
      if (aiCtx && aiCtx.lesson) { lesson = aiCtx.lesson; aiCtx.selTerms = (aiCtx.ai.terms || []).map(function (_, i) { return i; }); aiCtx.selReview = (aiCtx.ai.review || []).map(function (_, i) { return i; }); dirty = true; }
      else aiCtx = null;
    }

    container.innerHTML =
      '<div class="page-head"><div><a class="btn ghost sm" href="#/lessons">' + E.icon('arrow') + ' الدروس</a><h1 style="margin-top:6px">' + (isNew ? 'درس جديد' : 'تحرير الدرس') + '</h1></div>' +
      '<div class="acts"><span class="chip warn" data-dirty' + (dirty ? '' : ' hidden') + '>تعديلات غير محفوظة</span>' +
      '<button class="btn" data-a="preview">' + E.icon('eye') + ' معاينة</button><button class="btn" data-a="save">' + E.icon('check') + ' حفظ</button>' +
      '<button class="btn primary" data-a="publish">حفظ ونشر</button></div></div>' +
      '<div class="editor"><aside class="panel panel-pad meta"><div data-meta></div></aside><div><div data-ai></div><div data-blocks></div>' +
      '<div class="add-bar" role="group" aria-label="إضافة محتوى">' + Object.keys(BT).map(function (t) {
        return '<button type="button" class="btn sm" data-add="' + t + '">' + E.icon(BT[t][1]) + ' ' + BT[t][0] + '</button>';
      }).join('') + '</div></div></div>';

    function markDirty() {
      dirty = true; E.$('[data-dirty]', container).hidden = false;
      clearTimeout(timer);
      timer = setTimeout(function () { try { localStorage.setItem(key, JSON.stringify({ lesson: lesson, at: Date.now() })); } catch (e) { /* quota */ } }, 800);
    }
    E.Router.guard = { dirty: function () { return dirty; }, discard: function () { clearTimeout(timer); localStorage.removeItem(key); } };

    function buildMeta() {
      metaForm = E.buildForm([
        { key: 'title', label: 'عنوان الدرس', type: 'text', required: true },
        { key: 'moduleId', label: 'الوحدة', type: 'select', required: true, empty: 'اختر الوحدة', options: function () { return E.moduleOptions(); } },
        { key: 'status', label: 'حالة النشر', type: 'select', options: E.statusOptions, default: 'draft' },
        { key: 'level', label: 'مستوى الدرس', type: 'select', options: E.levelOptions, default: 'beginner' },
        { key: 'duration', label: 'مدة الدرس بالدقائق', type: 'number', min: 0 },
        { key: 'summary', label: 'ملخص قصير', type: 'textarea', rows: 3 },
        { key: 'objectives', label: 'الأهداف التعليمية (هدف في كل سطر)', type: 'lines' },
        { key: 'prerequisites', label: 'المتطلبات السابقة', type: 'refs', emptyText: 'لا توجد دروس أخرى', options: function () { return E.lessonOptions(null, id); } },
        { key: 'terms', label: 'المصطلحات المرتبطة', type: 'refs', emptyText: 'أضف مصطلحات في القاموس أولًا', options: function () { return Store.list('glossary').map(function (t) { return { v: t.id, l: t.ar + ' — ' + t.en }; }); } }
      ], lesson, { onChange: function (vals) { Object.assign(lesson, vals); markDirty(); } });
      E.$('[data-meta]', container).appendChild(metaForm.el);
    }

    function drawBlocks() {
      var box = E.$('[data-blocks]', container); box.innerHTML = '';
      if (!lesson.blocks.length) {
        box.innerHTML = '<div class="empty panel">' + E.icon('book') + '<h3>الدرس فارغ</h3><p>أضف عنوانًا أو فقرة من الأزرار بالأسفل لتبدأ.</p></div><div style="height:12px"></div>';
        return;
      }
      lesson.blocks.forEach(function (b, i) {
        var card = E.el('<section class="block" data-i="' + i + '"><div class="block-head"><b>' + (i + 1) + '. ' + BT[b.type][0] + '</b>' + (b.ai ? '<span class="badge warn">مضاف بالذكاء الاصطناعي — راجعه</span><button type="button" class="btn sm" data-bok>تمت المراجعة</button>' : '') +
          '<button type="button" class="icon-btn sm" data-bm="-1" aria-label="أعلى"' + (i === 0 ? ' disabled' : '') + '>' + E.icon('up') + '</button>' +
          '<button type="button" class="icon-btn sm" data-bm="1" aria-label="أسفل"' + (i === lesson.blocks.length - 1 ? ' disabled' : '') + '>' + E.icon('down') + '</button>' +
          '<button type="button" class="icon-btn sm" data-bd aria-label="تكرار">' + E.icon('copy') + '</button>' +
          '<button type="button" class="icon-btn sm danger" data-bx aria-label="حذف">' + E.icon('trash') + '</button></div><div class="block-body"></div></section>');
        var f = E.buildForm(blockFields(b.type), b, { onChange: function (vals) { Object.assign(b, vals); markDirty(); } });
        E.$('.block-body', card).appendChild(f.el);
        box.appendChild(card);
      });
    }

    function drawAI() {
      var box = E.$('[data-ai]', container); if (!box) return;
      if (!aiCtx) { box.innerHTML = ''; return; }
      var f = aiCtx.ai.fidelity || { warnings: [] };
      box.innerHTML = '<section class="panel panel-pad ai-panel"><h3>' + E.icon('sparkle') + ' مسودة مولَّدة بالذكاء الاصطناعي — لم تُنشر</h3>' +
        '<p class="hint">المزوّد: ' + esc(lesson.aiMeta.provider + ' / ' + lesson.aiMeta.model) + ' · تغطية كلمات الأصل: ' + f.coverage + '%. راجع كل الكتل، ولا يُنشر الدرس إلا بموافقتك الصريحة.</p>' +
        (f.warnings.length ? '<ul class="plain warn-list">' + f.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') +
        ((aiCtx.ai.notes || []).length ? '<b>ملاحظات الذكاء الاصطناعي على النص الأصلي:</b><ul class="plain">' + aiCtx.ai.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '') +
        '<div class="acts" style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button type="button" class="btn sm" data-ai-orig>عرض النص الأصلي</button><button type="button" class="btn sm" data-ai-redo>إعادة التنظيم</button></div>' +
        ((aiCtx.ai.terms || []).length ? '<details><summary>مصطلحات مقترحة للقاموس (' + aiCtx.ai.terms.length + ')</summary><ul class="plain">' + aiCtx.ai.terms.map(function (t, i) {
          return '<li><label><input type="checkbox" data-st="' + i + '"' + (aiCtx.selTerms.indexOf(i) !== -1 ? ' checked' : '') + '> <b>' + esc(t.ar) + '</b> <span dir="ltr">' + esc(t.en) + '</span> — ' + esc(t.definition) + '</label></li>'; }).join('') + '</ul></details>' : '') +
        ((aiCtx.ai.review || []).length ? '<details><summary>أسئلة مراجعة مقترحة (' + aiCtx.ai.review.length + ') — تُضاف لبنك الأسئلة وتُدرج في نهاية الدرس</summary><ul class="plain">' + aiCtx.ai.review.map(function (q, i) {
          return '<li><label><input type="checkbox" data-sr="' + i + '"' + (aiCtx.selReview.indexOf(i) !== -1 ? ' checked' : '') + '> ' + esc(q.text) + '</label></li>'; }).join('') + '</ul></details>' : '') + '</section>';
    }

    container.addEventListener('change', function (e) {
      var t = e.target; if (!aiCtx) return;
      var list = t.dataset.st != null ? aiCtx.selTerms : t.dataset.sr != null ? aiCtx.selReview : null; if (!list) return;
      var v = +(t.dataset.st != null ? t.dataset.st : t.dataset.sr), i = list.indexOf(v);
      if (t.checked && i === -1) list.push(v); else if (!t.checked && i !== -1) list.splice(i, 1);
      markDirty();
    });

    function approve() {
      return new Promise(function (res) {
        var n = lesson.blocks.filter(function (b) { return b.ai; }).length, ok = false;
        var body = E.el('<div class="stack"><p>هذا الدرس مولَّد بالذكاء الاصطناعي' + (n ? '، وما زالت فيه <b>' + n + '</b> كتلة مضافة لم تُعلَّم «تمت المراجعة»' : '') + '. النشر يتم فقط بعد مراجعتك الكاملة.</p><label class="switch"><input type="checkbox" data-ok><span class="track"></span><span>راجعت الدرس بالكامل وأوافق صراحةً على نشره للطلاب</span></label></div>');
        var m = E.modal({ title: 'موافقة على النشر', size: 'sm', body: body, footer: [{ label: 'موافقة ونشر', cls: 'primary', onClick: function () { if (!E.$('[data-ok]', body).checked) { E.toast('فعّل خيار الموافقة أولًا', { type: 'error' }); return false; } ok = true; } }, { label: 'إلغاء' }] });
        m.done.then(function () { res(ok); });
      });
    }

    container.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.dataset.aiOrig != null) { E.modal({ title: 'النص الأصلي', size: 'lg', body: '<pre class="json" dir="auto" style="white-space:pre-wrap;max-height:60vh;overflow:auto">' + esc(aiCtx.original) + '</pre>', footer: [{ label: 'إغلاق' }] }); return; }
      if (t.dataset.aiRedo != null) { sessionStorage.setItem('efhama:ai-redo', JSON.stringify(aiCtx.form)); E.Router.go('#/ai'); return; }
      var card = t.closest('.block'), i = card ? +card.dataset.i : -1;
      if (t.dataset.add) {
        var type = t.dataset.add, b = { id: 'b_' + Math.random().toString(36).slice(2, 9), type: type };
        blockFields(type).forEach(function (f) { if (f.default !== undefined) b[f.key] = f.default; });
        if (type === 'list' || type === 'summary') b.items = [];
        lesson.blocks.push(b); drawBlocks(); markDirty();
        var last = E.$$('.block', container).pop(); if (last) { last.scrollIntoView({ block: 'center' }); var inp = E.$('input:not([type=file]):not([type=checkbox]), textarea, select', last); if (inp) inp.focus(); }
      } else if (t.dataset.bm) {
        var j = i + +t.dataset.bm, x = lesson.blocks[i]; lesson.blocks[i] = lesson.blocks[j]; lesson.blocks[j] = x; drawBlocks(); markDirty();
      } else if (t.dataset.bd != null && card) {
        var c = E.clone(lesson.blocks[i]); c.id = 'b_' + Math.random().toString(36).slice(2, 9); lesson.blocks.splice(i + 1, 0, c); drawBlocks(); markDirty();
      } else if (t.dataset.bok != null && card) {
        lesson.blocks[i].ai = false; drawBlocks(); markDirty();
      } else if (t.dataset.bx != null && card) {
        lesson.blocks.splice(i, 1); drawBlocks(); markDirty();
      } else if (t.dataset.a === 'preview') {
        previewLesson(lesson, lesson.terms);
      } else if (t.dataset.a === 'save' || t.dataset.a === 'publish') {
        save(t.dataset.a === 'publish');
      }
    });

    function save(publish) {
      if (!metaForm.validate()) { E.toast('أكمل الحقول المطلوبة أولًا', { type: 'error' }); return; }
      if (publish) {
        if (!lesson.blocks.length) { E.toast('أضف محتوى للدرس قبل النشر', { type: 'error' }); return; }
        var bad = lesson.blocks.map(function (b, i) { var m = blockIssues(b); return m ? (i + 1) + ': ' + m : ''; }).filter(Boolean);
        if (bad.length) { E.toast('عدّل المحتوى قبل النشر — ' + bad[0], { type: 'error' }); return; }
        if (lesson.aiMeta && lesson.aiMeta.generated && !lesson.aiMeta.reviewed) {
          approve().then(function (ok) { if (ok) { lesson.aiMeta.reviewed = true; lesson.aiMeta.reviewedAt = new Date().toISOString(); save(true); } });
          return;
        }
        lesson.status = 'published';
      }
      var terms = lesson.terms || [];
      var obj = E.clone(lesson); delete obj.terms;
      var newId = isNew ? Store.newId('l') : id;
      obj.id = newId; obj.updatedAt = new Date().toISOString();
      obj.duration = Number(obj.duration) || 0;
      obj.blocks.forEach(function (b) { if (b.type === 'heading') b.level = Number(b.level) || 2; });
      var moduleChanged = !isNew && src.moduleId !== obj.moduleId;
      Store.update(function (d) {
        var arr = Store.list('lessons', d);
        if (isNew || moduleChanged) obj.order = 9999; else obj.order = src.order;
        if (isNew && aiCtx) {
          var pos = aiCtx.position || 'end';
          if (pos === 'start') obj.order = 0;
          else if (pos.indexOf('after:') === 0) { var ref = arr.filter(function (x) { return x.id === pos.slice(6) && x.moduleId === obj.moduleId; })[0]; if (ref) obj.order = (ref.order || 0) + 0.5; }
          var mod = Store.list('modules', d).filter(function (m) { return m.id === obj.moduleId; })[0], pid = mod ? mod.pathId : '';
          var qs = Store.list('questions', d);
          aiCtx.selReview.slice().sort().forEach(function (i) {
            var q = aiCtx.ai.review[i]; if (!q) return;
            var qid = Store.newId('q');
            qs.push({ id: qid, type: q.type, text: q.text, code: '', options: q.options, answer: q.answer, explanation: q.explanation, hints: [], difficulty: 'easy', points: 1, pathId: pid, moduleId: obj.moduleId, lessonId: newId });
            obj.blocks.push({ id: 'b_' + Math.random().toString(36).slice(2, 9), type: 'question', questionId: qid });
          });
          var gl = Store.list('glossary', d);
          aiCtx.selTerms.forEach(function (i) {
            var t = aiCtx.ai.terms[i]; if (!t) return;
            var ex = gl.filter(function (x) { return String(x.en).toLowerCase() === String(t.en).toLowerCase(); })[0];
            if (ex) { if (ex.lessonIds.indexOf(newId) === -1) ex.lessonIds.push(newId); if (terms.indexOf(ex.id) === -1) terms.push(ex.id); }
            else { var tid = Store.newId('t'); gl.push({ id: tid, ar: t.ar, en: t.en, definition: t.definition, example: t.example || '', pathId: pid, lessonIds: [newId] }); terms.push(tid); }
          });
        }
        if (isNew) arr.push(obj); else { var k = arr.findIndex(function (x) { return x.id === id; }); arr[k] = obj; }
        E.normalizeOrder(arr, 'moduleId');
        Store.list('glossary', d).forEach(function (t) {
          var has = t.lessonIds.indexOf(newId) !== -1, want = terms.indexOf(t.id) !== -1;
          if (want && !has) t.lessonIds.push(newId); else if (!want && has) t.lessonIds = t.lessonIds.filter(function (x) { return x !== newId; });
        });
      });
      clearTimeout(timer); localStorage.removeItem(key); dirty = false;
      if (aiCtx) sessionStorage.removeItem('efhama:ai-draft');
      E.toast(publish ? 'تم نشر الدرس' : 'تم حفظ الدرس', { type: 'success' });
      if (isNew) E.Router.go('#/lessons/edit/' + newId); else { E.$('[data-dirty]', container).hidden = true; if (publish) metaForm.values.status = 'published'; E.Router.refresh(); }
    }

    function start() { buildMeta(); drawBlocks(); drawAI(); }
    var draft = null;
    try { draft = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { draft = null; }
    var newer = !aiCtx && draft && draft.lesson && (isNew || !src.updatedAt || draft.at > Date.parse(src.updatedAt));
    if (newer) {
      var restore = false;
      var m = E.modal({
        title: 'مسودة غير محفوظة', size: 'sm',
        body: '<p>وجدنا نسخة غير محفوظة من هذا الدرس (' + E.fmtTime(draft.at) + '). هل تريد استعادتها؟</p>',
        footer: [{ label: 'استعادة المسودة', cls: 'primary', onClick: function () { restore = true; } }, { label: 'تجاهلها' }]
      });
      m.done.then(function () {
        if (restore) { lesson = Object.assign(lesson, draft.lesson); dirty = true; E.$('[data-dirty]', container).hidden = false; }
        else localStorage.removeItem(key);
        start();
      });
    } else start();
  }

  E.page('lessons', {
    title: 'الدروس',
    render: function (container, ctx) {
      if (ctx.sub[0] === 'new' || ctx.sub[0] === 'edit') editor(container, ctx);
      else list.render(container, ctx);
    }
  });
})();
