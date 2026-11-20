(function () {
  'use strict';
  var E = window.Efhamha, esc = E.esc, Store = E.Store, ED = window.EfhamhaData, C = E.cell, CH = E.charts;

  /* =============== نظرة عامة =============== */
  var NO_USAGE = 'لا توجد بيانات استخدام بعد. ستظهر هنا عندما يرسل الموقع تقدّم الطلاب (usage) أو عند استيراد ملف يحتوي عليها.';

  function weekStart(s) { var d = new Date(s); if (isNaN(d)) return null; var day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.toISOString().slice(0, 10); }

  /* فحوص اكتمال المحتوى (تُستخدم في «نظرة عامة» وفي جرس الإشعارات) */
  E.healthChecks = function () {
    var d = Store.data;
    var unusedAssets = d.assets.filter(function (a) { return !Store.assetUsage(a.id).length; }).length;
    return [
      ['مسارات ظاهرة بدون وحدات', d.paths.filter(function (p) { return p.visible !== false && !d.modules.some(function (m) { return m.pathId === p.id; }); }).length, '#/modules'],
      ['وحدات بدون دروس', d.modules.filter(function (m) { return !d.lessons.some(function (l) { return l.moduleId === m.id; }); }).length, '#/lessons'],
      ['دروس ما زالت مسودات', d.lessons.filter(function (l) { return l.status !== 'published'; }).length, '#/lessons?status=draft'],
      ['دروس منشورة بدون أهداف تعليمية', d.lessons.filter(function (l) { return l.status === 'published' && !(l.objectives || []).length; }).length, '#/lessons?status=published'],
      ['أسئلة غير مرتبطة بمسار', d.questions.filter(function (q) { return !q.pathId; }).length, '#/questions'],
      ['اختبارات بدون أسئلة', d.quizzes.filter(function (z) { return !(z.questionIds || []).length; }).length, '#/quizzes'],
      ['مصطلحات غير مرتبطة بدروس', d.glossary.filter(function (t) { return !(t.lessonIds || []).length; }).length, '#/glossary'],
      ['رسومات غير مستخدمة', unusedAssets, '#/assets']
    ].filter(function (x) { return x[1] > 0; });
  };

  /* رسم تعبيري هندسي بألوان الهوية (لا يحتوي بيانات) */
  function heroArt() {
    return '<svg class="hero-art" viewBox="0 0 260 170" aria-hidden="true" focusable="false">' +
      '<circle cx="226" cy="34" r="17" style="fill:var(--c3)" opacity=".75"/><circle cx="28" cy="124" r="10" style="fill:var(--c4)"/><circle cx="238" cy="132" r="6" style="fill:var(--c2)" opacity=".7"/>' +
      '<rect x="40" y="22" width="170" height="108" rx="16" style="fill:var(--c6)"/><rect x="54" y="38" width="142" height="76" rx="10" style="fill:var(--surface)"/>' +
      '<polyline points="66,70 92,56 114,64 140,46 178,52" fill="none" style="stroke:var(--c1)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<rect x="68" y="88" width="14" height="18" rx="4" style="fill:var(--c1)"/><rect x="92" y="80" width="14" height="26" rx="4" style="fill:var(--c3)"/>' +
      '<rect x="116" y="84" width="14" height="22" rx="4" style="fill:var(--c2)"/><rect x="140" y="74" width="14" height="32" rx="4" style="fill:var(--c1)"/><rect x="164" y="90" width="14" height="16" rx="4" style="fill:var(--c4)"/>' +
      '<rect x="112" y="130" width="26" height="10" style="fill:var(--c4)"/><rect x="88" y="140" width="74" height="9" rx="4.5" style="fill:var(--c3)"/>' +
      '<rect x="176" y="118" width="58" height="28" rx="7" style="fill:var(--c5)"/><rect x="184" y="126" width="30" height="4" rx="2" fill="#fff" opacity=".85"/><rect x="184" y="134" width="20" height="4" rx="2" fill="#fff" opacity=".5"/></svg>';
  }

  var SUB_AR = { none: 'بدون اشتراك', pending: 'معلّق', active: 'نشط', expired: 'منتهي' };
  var SUB_CLS = { none: '', pending: 'warn', active: 'ok', expired: 'err' };

  E.page('overview', {
    title: 'نظرة عامة',
    render: function (c) {
      var d = Store.data, s = d.settings || {};
      var server = Store.mode === 'server';
      var lessonPath = {};
      d.lessons.forEach(function (l) { var m = Store.byId('modules', l.moduleId); if (m) lessonPath[l.id] = m.pathId; });
      var exercises = d.questions.filter(function (q) { return q.type !== 'mcq' && q.type !== 'tf'; }).length;
      var stats = [
        ['المسارات التعليمية', d.paths.length, 'paths', 'route'],
        ['الوحدات', d.modules.length, 'modules', 'layers'],
        ['الدروس', d.lessons.length, 'lessons', 'book'],
        ['التمارين البرمجية والعملية', exercises, 'questions', 'sparkle'],
        ['الاختبارات', d.quizzes.length, 'quizzes', 'clipboard'],
        ['المشروعات', d.projects.length, 'projects', 'briefcase'],
        ['الأسئلة', d.questions.length, 'questions', 'help'],
        ['الإنجازات والشارات', Store.list('gamification.badges').length, 'gamification', 'trophy']
      ];
      var checks = E.healthChecks();

      var u = d.usage || {};
      var compByPath = {};
      (u.completions || []).forEach(function (x) { var p = lessonPath[x.lessonId]; if (p) compByPath[p] = (compByPath[p] || 0) + 1; });
      var actByPath = Object.assign({}, compByPath);
      var quizPath = {}; d.quizzes.forEach(function (z) { quizPath[z.id] = z.pathId; });
      (u.quizResults || []).forEach(function (x) { var p = quizPath[x.quizId]; if (p) actByPath[p] = (actByPath[p] || 0) + 1; });
      var pathBars = function (map) {
        return d.paths.map(function (p) { return { label: p.name, value: map[p.id] || 0 }; }).filter(function (x) { return x.value > 0; }).sort(function (a, b) { return b.value - a.value; });
      };
      var quizStats = {};
      (u.quizResults || []).forEach(function (x) { var q = Store.byId('quizzes', x.quizId); if (!q) return; var t = (quizStats[x.quizId] = quizStats[x.quizId] || { n: 0, sum: 0, pass: 0, title: q.title }); t.n++; t.sum += Number(x.score) || 0; if (x.passed) t.pass++; });
      var quizBars = Object.keys(quizStats).map(function (k) { var t = quizStats[k]; return { label: t.title + ' (' + t.n + ' محاولة، نجاح ' + Math.round(100 * t.pass / t.n) + '%)', value: Math.round(t.sum / t.n) }; });
      var ach = (u.achievements || []).map(function (x) { return x.date; }).filter(Boolean).sort();
      var line = [];
      if (ach.length) {
        var span = (new Date(ach[ach.length - 1]) - new Date(ach[0])) / 864e5, monthly = span > 84, b = {};
        ach.forEach(function (x) { var k = monthly ? String(x).slice(0, 7) : weekStart(x); if (k) b[k] = (b[k] || 0) + 1; });
        line = Object.keys(b).sort().map(function (k) { return { label: monthly ? k : k.slice(5), value: b[k] }; });
      }
      var distro = d.paths.map(function (p) { return { label: p.name, value: d.lessons.filter(function (l) { return lessonPath[l.id] === p.id; }).length }; }).filter(function (x) { return x.value > 0; });
      var doneTotal = (u.completions || []).length;

      /* من محتوى المنصة الفعلي: منشور مقابل مسودة لكل مسار */
      var perPath = d.paths.map(function (p) {
        var ls = d.lessons.filter(function (l) { return lessonPath[l.id] === p.id; });
        var pub = ls.filter(function (l) { return l.status === 'published'; }).length;
        return { id: p.id, label: p.name, pub: pub, draft: ls.length - pub, total: ls.length };
      });
      var totalLessons = d.lessons.length, pubLessons = d.lessons.filter(function (l) { return l.status === 'published'; }).length;
      var recent = d.lessons.slice().sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || ((a.order || 0) - (b.order || 0)); }).slice(0, 5);

      var me = E.me && E.me.user;
      var totalItems = checks.reduce(function (n, x) { return n + x[1]; }, 0);
      var welcomeText = checks.length
        ? 'إجمالي العناصر التي تحتاج مراجعة في محتوى المنصة: ' + E.num(totalItems) + ' — عدد البنود: ' + E.num(checks.length) + '.'
        : 'محتوى المنصة مكتمل حاليًا ولا توجد تنبيهات.';

      var canLogs = server && E.can('logs'), canStudents = server && E.can('students');
      var railHtml = '';
      function railBlock(title, link, attr, inner) {
        return '<div class="ov-block"><div class="sec-head"><h2>' + title + '</h2>' + (link ? '<a class="sec-link" href="' + link + '">عرض الكل</a>' : '') + '</div><div class="ov-card" ' + attr + '>' + inner + '</div></div>';
      }
      var skel = '<div class="skel" style="height:14px;margin-bottom:12px"></div><div class="skel" style="height:14px;width:80%;margin-bottom:12px"></div><div class="skel" style="height:14px;width:60%"></div>';
      var localMsg = '<div class="ov-empty">' + E.icon('database') + 'متاح عند تشغيل الخادم.</div>';
      if (canLogs) railHtml += railBlock('آخر العمليات', '#/logs', 'data-recent', skel);
      else if (!server) railHtml += railBlock('آخر العمليات', '', '', localMsg);
      if (canStudents) railHtml += railBlock('آخر الطلاب', '#/students', 'data-students', skel);
      else if (!server) railHtml += railBlock('آخر الطلاب', '', '', localMsg);
      var kv = [
        ['وضع الاتصال', server ? 'متصل بالخادم' : 'محلي (بدون حماية)'],
        ['الدور', me ? me.roleLabel : 'مسؤول محلي'],
        ['مسارات ظاهرة للطلاب', E.num(d.paths.filter(function (p) { return p.visible !== false; }).length) + ' من ' + E.num(d.paths.length)],
        ['الدروس المنشورة', E.num(pubLessons) + ' من ' + E.num(totalLessons)],
        ['آخر تعديل للمحتوى', d.updatedAt ? E.fmtDate(d.updatedAt) : 'لا يوجد']
      ];
      if (server) kv.push(['إصدار البيانات', 'rev ' + E.num(d.rev || 0)]);
      railHtml += railBlock('معلومات سريعة', '', '', '<div class="qi">' + kv.map(function (x) { return '<div class="qi-row"><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>');

      c.innerHTML =
        '<div class="ov-grid">' +
        '<section class="hero ov-welcome"><div><h1>مرحبًا' + (me ? ' ' + esc(me.displayName) : '') + '!</h1><p>' + esc(welcomeText) + '</p>' + (s.tagline ? '<small class="hero-tag" dir="auto">' + esc(s.tagline) + '</small>' : '') +
        (checks.length ? '<a class="hero-link" href="' + checks[0][2] + '">راجع الآن</a>' : '') + '</div>' + heroArt() + '</section>' +
        '<section class="ov-stats"><div class="stats-grid">' + stats.map(function (x) {
          return '<a class="stat-card" href="#/' + x[2] + '"><div class="stat-icon-wrap">' + E.icon(x[3]) + '</div><div class="stat-info"><span class="n">' + E.num(x[1]) + '</span><span class="l">' + esc(x[0]) + '</span></div></a>';
        }).join('') + '</div></section>' +

        '<div class="ov-block ov-perf"><div class="sec-head"><h2>الدروس حسب المسار</h2><span class="sec-pill">منشور / مسودة</span></div><div class="ov-card">' +
        (totalLessons ? '<div class="perf-top"><span class="perf-num">' + E.num(totalLessons) + '</span><span class="perf-cap">درسًا في المنصة · ' + E.num(pubLessons) + ' منشورًا</span>' +
          '<span class="perf-legend"><span><i style="background:var(--c1)"></i>منشور</span><span><i style="background:var(--c3)"></i>مسودة</span></span></div>' + CH.stackedColumns(perPath)
          : '<div class="ov-empty">' + E.icon('book') + 'لا توجد دروس بعد. ستظهر هنا أعمدة المنشور والمسودات لكل مسار.</div>') + '</div></div>' +

        '<div class="ov-block ov-visit"><div class="sec-head"><h2>اكتمال نشر المسارات</h2><span class="sec-pill">نسبة المنشور</span></div><div class="ov-card">' +
        (d.paths.length ? '<div class="rings">' + perPath.map(function (x) {
          var pct = x.total ? Math.round(100 * x.pub / x.total) : null;
          return '<div class="ring-item">' + CH.ring(pct, { label: x.label }) + '<span class="ring-name">' + esc(x.label) + (x.total ? '' : '<br><small>بدون دروس</small>') + '</span></div>';
        }).join('') + '</div>' : '<div class="ov-empty">' + E.icon('route') + 'لا توجد مسارات.</div>') + '</div></div>' +

        '<div class="ov-block ov-content"><div class="sec-head"><h2>نظرة على المحتوى</h2>' + (E.can('lessons') ? '<a class="sec-link" href="#/lessons">عرض الكل</a>' : '') + '</div><div class="ov-card flush">' +
        (recent.length ? '<ul class="mini-list">' + recent.map(function (l) {
          var m = Store.byId('modules', l.moduleId), p = m ? Store.byId('paths', m.pathId) : null;
          return '<li><a class="mini-item" href="#/lessons/edit/' + esc(l.id) + '"><span class="mi-ico">' + esc((p && p.icon) || '📘') + '</span><span class="mi-main"><b>' + esc(l.title) + '</b><small>' + esc((p ? p.name : '') + (m ? ' › ' + m.title : '')) + '</small></span>' +
            (l.status === 'published' ? '<span class="badge ok">منشور</span>' : '<span class="badge warn">مسودة</span>') + '</a></li>';
        }).join('') + '</ul>' : '<div class="ov-empty">' + E.icon('book') + 'لا توجد دروس بعد.</div>') + '</div></div>' +

        '<div class="ov-block ov-health"><div class="sec-head"><h2>ما ينقص المحتوى</h2></div><section class="panel"><ul class="health" data-health></ul></section></div>' +
        '<aside class="ov-rail">' + railHtml + '</aside></div>' +

        '<div class="ov-analytics"><div class="sec-head"><h2>التحليلات</h2></div><div class="charts">' +
        '<section class="panel"><div class="panel-head"><div><h2>توزيع الدروس على المسارات</h2></div></div><div class="chart-body">' + (distro.length ? CH.donut(distro) : CH.empty('لا توجد دروس بعد. أضف أول درس ليظهر التوزيع هنا.')) + '</div></section>' +
        '<section class="panel"><div class="panel-head"><div><h2>الدروس المكتملة</h2><div class="sub">' + (doneTotal ? E.num(doneTotal) + ' إكمال إجمالًا' : 'حسب المسار') + '</div></div></div><div class="chart-body">' + (pathBars(compByPath).length ? CH.bars(pathBars(compByPath)) : CH.empty(NO_USAGE)) + '</div></section>' +
        '<section class="panel"><div class="panel-head"><div><h2>نتائج الاختبارات</h2><div class="sub">متوسط الدرجات</div></div></div><div class="chart-body">' + (quizBars.length ? CH.bars(quizBars, { suffix: '%', max: 100 }) : CH.empty(NO_USAGE)) + '</div></section>' +
        '<section class="panel"><div class="panel-head"><div><h2>أكثر المسارات نشاطًا</h2><div class="sub">دروس مكتملة ومحاولات اختبار</div></div></div><div class="chart-body">' + (pathBars(actByPath).length ? CH.bars(pathBars(actByPath)) : CH.empty(NO_USAGE)) + '</div></section>' +
        '<section class="panel"><div class="panel-head"><div><h2>تطور إنجازات الطلاب</h2><div class="sub">عدد الإنجازات بمرور الوقت</div></div></div><div class="chart-body">' + (line.length ? CH.line(line) : CH.empty(NO_USAGE)) + '</div></section></div></div>';

      E.$('[data-health]', c).innerHTML = checks.length ? checks.map(function (x) {
        return '<li><a href="' + x[2] + '">' + E.icon('alert') + '<span>' + esc(x[0]) + '</span><span class="badge warn cnt">' + E.num(x[1]) + '</span></a></li>';
      }).join('') : '<li><div class="empty-chart">' + E.icon('check') + ' كل شيء مكتمل حاليًا.</div></li>';

      /* بيانات تأتي من الخادم (تظهر فقط لمن يملك الصلاحية) */
      var tz = -new Date().getTimezoneOffset();
      var failMsg = function (box) { return function () { if (box && box.isConnected) box.innerHTML = '<div class="ov-empty">' + E.icon('alert') + 'تعذر تحميل البيانات.</div>'; }; };
      var rb = E.$('[data-recent]', c);
      if (rb) Store.api('GET', '/logs?page=1&tz=' + tz).then(function (r) {
        if (!rb.isConnected) return;
        rb.innerHTML = r.rows.length ? '<ul class="tl">' + r.rows.slice(0, 6).map(function (x) {
          return '<li><span class="dot"></span><div><div class="tt">' + esc((x.display_name || x.username) + ' — ' + (E.actionLabel ? E.actionLabel(x.action) : x.action)) + (x.target_name && x.target_name !== x.username && x.target_name !== x.display_name ? ' · ' + esc(x.target_name.length > 40 ? x.target_name.slice(0, 40) + '…' : x.target_name) : '') + '</div><div class="ts">' + esc(E.fmtDate(x.ts) + ' ' + E.fmtTime(x.ts)) + '</div></div></li>';
        }).join('') + '</ul>' : '<div class="ov-empty">' + E.icon('history') + 'لا توجد عمليات مسجلة بعد.</div>';
      }).catch(failMsg(rb));
      var sb = E.$('[data-students]', c);
      if (sb) Store.api('GET', '/students?page=1').then(function (r) {
        if (!sb.isConnected) return;
        sb.innerHTML = r.items.length ? '<ul class="mini-list">' + r.items.slice(0, 5).map(function (x) {
          return '<li><a class="mini-item" href="#/students/' + x.id + '"><span class="mi-ico">' + esc((x.name || '?').trim().charAt(0)) + '</span><span class="mi-main"><b>' + esc(x.name) + '</b><small>تسجيل: ' + esc(E.fmtDate(x.createdAt)) + '</small></span><span class="badge ' + (SUB_CLS[x.subStatus] || '') + '">' + esc(SUB_AR[x.subStatus] || x.subStatus) + '</span></a></li>';
        }).join('') + '</ul>' : '<div class="ov-empty">' + E.icon('users') + 'لا يوجد طلاب بعد.</div>';
      }).catch(failMsg(sb));
    }
  });

  /* =============== الإنجازات والتحفيز =============== */
  var G_EVENTS = [{ v: 'lesson_complete', l: 'إكمال درس' }, { v: 'exercise_correct', l: 'إجابة تمرين صحيحة' }, { v: 'quiz_pass', l: 'اجتياز اختبار' },
    { v: 'project_submit', l: 'تسليم مشروع' }, { v: 'daily_challenge', l: 'إكمال تحدٍّ يومي' }, { v: 'streak_day', l: 'يوم متتابع' }];
  var xpCfg = E.crudPage({
    coll: 'gamification.xpRules', prefix: 'x', title: 'قواعد XP', singular: 'قاعدة', embedded: true, nameOf: function (x) { return x.name; },
    search: function (x) { return x.name; },
    columns: [
      { key: 'name', label: 'القاعدة', render: function (x) { return C.name(x.name, E.optLabel(G_EVENTS, x.event)); } },
      { key: 'xp', label: 'نقاط XP', render: function (x) { return E.num(x.xp); } },
      { key: 'once', label: 'الاحتساب', render: function () { return C.badge('مرة واحدة لكل عنصر', 'ok'); } }
    ],
    fields: [
      { key: 'name', label: 'اسم القاعدة', type: 'text', required: true, wide: true },
      { key: 'event', label: 'الحدث', type: 'select', options: G_EVENTS },
      { key: 'xp', label: 'نقاط XP', type: 'number', min: 0, required: true },
      { key: 'once', label: 'تُحتسب مرة واحدة لكل طالب ولكل عنصر', type: 'toggle', locked: true, default: true, wide: true, hint: 'مغلق دائمًا: يمنع تكرار احتساب المكافأة نفسها.' }
    ],
    newValues: function () { return { event: 'lesson_complete', once: true }; },
    validate: function (v, isNew, item) {
      if (Store.list('gamification.xpRules').some(function (r) { return r.id !== (item && item.id) && r.event === v.event; })) return { event: 'توجد قاعدة لهذا الحدث بالفعل — عدّلها بدل تكرارها' };
    }
  });
  var levelCfg = E.crudPage({
    coll: 'gamification.levels', prefix: 'v', title: 'المستويات', singular: 'مستوى', embedded: true, nameOf: function (x) { return x.name; },
    defaultSort: { key: 'minXp', dir: 1 }, search: function (x) { return x.name; },
    columns: [
      { key: 'name', label: 'المستوى', render: function (x) { return '<span class="ico-cell">' + esc(x.icon || '⭐') + '</span>' + esc(x.name); } },
      { key: 'minXp', label: 'يبدأ عند XP', sort: function (x) { return x.minXp; }, render: function (x) { return E.num(x.minXp); } }
    ],
    fields: [
      { key: 'name', label: 'اسم المستوى', type: 'text', required: true },
      { key: 'icon', label: 'أيقونة (إيموجي)', type: 'text' },
      { key: 'minXp', label: 'الحد الأدنى من XP', type: 'number', min: 0, required: true, hint: 'يجب أن يكون مختلفًا عن بقية المستويات.' }
    ],
    newValues: function () { return { icon: '⭐' }; },
    validate: function (v, isNew, item) {
      if (Store.list('gamification.levels').some(function (r) { return r.id !== (item && item.id) && r.minXp === v.minXp; })) return { minXp: 'يوجد مستوى بنفس الحد الأدنى' };
    }
  });
  var COND = [{ v: 'lessons_completed', l: 'عدد الدروس المكتملة' }, { v: 'quizzes_passed', l: 'عدد الاختبارات المجتازة' }, { v: 'xp_reached', l: 'الوصول إلى XP معيّن' },
    { v: 'streak_days', l: 'أيام متتابعة' }, { v: 'path_completed', l: 'إكمال مسار كامل' }, { v: 'projects_done', l: 'عدد المشروعات المسلّمة' }];
  var badgeCfg = E.crudPage({
    coll: 'gamification.badges', prefix: 'g', title: 'الشارات', singular: 'شارة', embedded: true, nameOf: function (x) { return x.name; },
    search: function (x) { return x.name + ' ' + (x.description || ''); },
    columns: [
      { key: 'name', label: 'الشارة', render: function (x) { return '<span class="ico-cell">' + esc(x.icon || '🏅') + '</span><span style="display:inline-block;vertical-align:middle">' + C.name(x.name, x.description) + '</span>'; } },
      { key: 'cond', label: 'شرط الحصول', render: function (x) { return esc(E.optLabel(COND, x.conditionType)) + (x.conditionType === 'path_completed' ? ': ' + esc(E.pathName(x.pathId)) : ' ≥ ' + E.num(x.conditionValue)); } },
      { key: 'visible', label: 'الظهور', render: function (x) { return x.visible !== false ? C.badge('ظاهرة', 'ok') : C.badge('مخفية', 'warn'); } }
    ],
    fields: [
      { key: 'name', label: 'اسم الشارة', type: 'text', required: true },
      { key: 'icon', label: 'أيقونة (إيموجي)', type: 'text' },
      { key: 'description', label: 'وصف الشارة', type: 'textarea', wide: true },
      { key: 'conditionType', label: 'شرط الحصول عليها', type: 'select', options: COND, default: 'lessons_completed' },
      { key: 'conditionValue', label: 'القيمة المطلوبة', type: 'number', min: 1, showIf: function (v) { return v.conditionType !== 'path_completed'; }, required: true },
      { key: 'pathId', label: 'المسار', type: 'select', empty: 'اختر المسار', options: E.pathOptions, showIf: function (v) { return v.conditionType === 'path_completed'; }, required: true },
      { key: 'visible', label: 'الشارة ظاهرة للطلاب', type: 'toggle', default: true }
    ],
    newValues: function () { return { icon: '🏅', visible: true, conditionType: 'lessons_completed', conditionValue: 1 }; },
    validate: function (v, isNew, item) {
      if (Store.list('gamification.badges').some(function (r) { return r.id !== (item && item.id) && r.name.trim() === String(v.name).trim(); })) return { name: 'يوجد شارة بنفس الاسم' };
    }
  });
  var MSG_T = [{ v: 'success', l: 'إجابة صحيحة' }, { v: 'fail', l: 'إجابة خاطئة' }, { v: 'level_up', l: 'الوصول لمستوى جديد' }, { v: 'streak', l: 'استمرار الأيام المتتابعة' }, { v: 'comeback', l: 'عودة بعد غياب' }];
  var CH_T = [{ v: 'complete_lesson', l: 'إكمال دروس' }, { v: 'answer_questions', l: 'حل أسئلة' }, { v: 'pass_quiz', l: 'اجتياز اختبار' }, { v: 'practice_code', l: 'تمرين برمجي' }];
  var msgCfg = E.crudPage({
    coll: 'gamification.encouragements', prefix: 'e', title: 'رسائل التشجيع', singular: 'رسالة', embedded: true, nameOf: function (x) { return x.text; },
    search: function (x) { return x.text; },
    columns: [
      { key: 'text', label: 'الرسالة', render: function (x) { return '<div class="clip" dir="auto">' + esc(x.text) + '</div>'; } },
      { key: 'trigger', label: 'تظهر عند', render: function (x) { return C.badge(E.optLabel(MSG_T, x.trigger), 'brand'); } }
    ],
    fields: [
      { key: 'text', label: 'نص الرسالة', type: 'textarea', required: true, wide: true },
      { key: 'trigger', label: 'تظهر عند', type: 'select', options: MSG_T, default: 'success' }
    ],
    newValues: function () { return { trigger: 'success' }; }
  });
  var chCfg = E.crudPage({
    coll: 'gamification.dailyChallenges', prefix: 'd', title: 'التحديات اليومية', singular: 'تحدٍّ', embedded: true, nameOf: function (x) { return x.title; }, titleKey: 'title',
    search: function (x) { return x.title + ' ' + (x.description || ''); },
    columns: [
      { key: 'title', label: 'التحدي', render: function (x) { return C.name(x.title, x.description); } },
      { key: 'target', label: 'الهدف', render: function (x) { return E.num(x.target) + ' · ' + esc(E.optLabel(CH_T, x.type)); } },
      { key: 'xp', label: 'المكافأة', render: function (x) { return E.num(x.xp) + ' XP'; } },
      { key: 'active', label: 'الحالة', render: function (x) { return x.active !== false ? C.badge('مفعّل', 'ok') : C.badge('متوقف', 'warn'); } }
    ],
    fields: [
      { key: 'title', label: 'عنوان التحدي', type: 'text', required: true, wide: true },
      { key: 'description', label: 'الوصف', type: 'textarea', wide: true },
      { key: 'type', label: 'نوع التحدي', type: 'select', options: CH_T, default: 'complete_lesson' },
      { key: 'target', label: 'العدد المطلوب', type: 'number', min: 1, required: true },
      { key: 'xp', label: 'مكافأة XP', type: 'number', min: 0, required: true },
      { key: 'active', label: 'مفعّل', type: 'toggle', default: true }
    ],
    newValues: function () { return { type: 'complete_lesson', active: true, target: 1 }; }
  });

  function rulesTab(box) {
    var rules = Store.data.gamification.rules || {};
    var form = E.buildForm([
      { key: 'dailyXpCap', label: 'الحد الأقصى لـ XP اليومي لكل طالب', type: 'number', min: 0, hint: 'اتركه فارغًا لعدم وضع حد.', wide: true }
    ], rules, {});
    box.innerHTML = '<div class="panel panel-pad stack"><div class="note-static"><b>قواعد ثابتة لا يمكن تعطيلها</b><br>• تُحتسب كل مكافأة مرة واحدة لكل طالب ولكل عنصر (درس، سؤال، اختبار…).<br>• إعادة حل نفس التمرين أو إعادة فتح نفس الدرس لا تمنح XP مرة أخرى.<br>• كل شارة تُمنح مرة واحدة فقط لكل طالب.<br>• لتطبيق ذلك فعليًا يجب أن يسجّل الموقع كل مكافأة بمفتاح فريد (الطالب + القاعدة + العنصر) — انظر README.</div><div data-f></div><div><button class="btn primary" data-save>حفظ القواعد</button></div></div>';
    E.$('[data-f]', box).appendChild(form.el);
    E.$('[data-save]', box).onclick = function () {
      if (!form.validate()) return;
      Store.update(function (d) { d.gamification.rules = Object.assign({}, d.gamification.rules, { dailyXpCap: form.values.dailyXpCap == null ? null : form.values.dailyXpCap }); });
      form.reset(); E.toast('تم حفظ قواعد الاحتساب', { type: 'success' });
    };
  }

  E.page('gamification', {
    title: 'الإنجازات والتحفيز',
    render: function (c, ctx) {
      var tabs = [['xp', 'قواعد XP', xpCfg], ['levels', 'المستويات', levelCfg], ['badges', 'الشارات', badgeCfg], ['msgs', 'رسائل التشجيع', msgCfg], ['daily', 'التحديات اليومية', chCfg], ['rules', 'قواعد الاحتساب', null]];
      var cur = ctx.params.tab || 'xp';
      c.innerHTML = '<div class="page-head"><div><h1>الإنجازات والتحفيز</h1><p class="sub">XP والمستويات والشارات والتحديات — مع منع تكرار احتساب المكافآت.</p></div></div>' +
        '<div class="tabs" role="tablist">' + tabs.map(function (t) { return '<button role="tab" data-t="' + t[0] + '" aria-selected="' + (t[0] === cur) + '">' + t[1] + '</button>'; }).join('') + '</div><div data-tab></div>';
      var box = E.$('[data-tab]', c);
      function show(k) {
        cur = k; E.$$('[role=tab]', c).forEach(function (b) { b.setAttribute('aria-selected', b.dataset.t === k); });
        box.innerHTML = '';
        var sub = document.createElement('div'); box.appendChild(sub);
        var t = tabs.filter(function (x) { return x[0] === k; })[0];
        if (t[2]) t[2].render(sub, { params: {}, sub: [] }); else rulesTab(sub);
      }
      E.$('.tabs', c).addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) show(b.dataset.t); });
      show(cur);
    }
  });

  /* =============== الإعدادات =============== */
  var SECTIONS = [
    ['عامة', [
      { key: 'name', label: 'اسم المنصة', type: 'text', required: true },
      { key: 'tagline', label: 'الشعار النصي', type: 'text' },
      { key: 'description', label: 'وصف المنصة', type: 'textarea', wide: true },
      { key: 'logo', label: 'شعار المنصة', type: 'image', category: 'logos' },
      { key: 'icon', label: 'أيقونة الموقع (Favicon)', type: 'image', category: 'logos' }]],
    ['الألوان والثيم', [
      { key: 'colors.primary', label: 'اللون الأساسي', type: 'color' },
      { key: 'theme.default', label: 'الثيم الافتراضي للموقع', type: 'select', options: [{ v: 'system', l: 'حسب جهاز الزائر' }, { v: 'light', l: 'فاتح' }, { v: 'dark', l: 'داكن' }] },
      { key: 'theme.allowToggle', label: 'السماح للطالب بتبديل الثيم', type: 'toggle', wide: true },
      { key: 'colors.light.background', label: 'الوضع الفاتح — الخلفية', type: 'color' },
      { key: 'colors.light.surface', label: 'الوضع الفاتح — الأسطح', type: 'color' },
      { key: 'colors.light.text', label: 'الوضع الفاتح — النص', type: 'color' },
      { key: 'colors.dark.background', label: 'الوضع الداكن — الخلفية', type: 'color' },
      { key: 'colors.dark.surface', label: 'الوضع الداكن — الأسطح', type: 'color' },
      { key: 'colors.dark.text', label: 'الوضع الداكن — النص', type: 'color' }]],
    ['التواصل', [
      { key: 'contact.email', label: 'البريد الإلكتروني', type: 'text' }, { key: 'contact.phone', label: 'الهاتف', type: 'text' },
      { key: 'contact.address', label: 'العنوان', type: 'text', wide: true },
      { key: 'social.x', label: 'رابط X (تويتر)', type: 'url' }, { key: 'social.facebook', label: 'رابط فيسبوك', type: 'url' },
      { key: 'social.instagram', label: 'رابط إنستجرام', type: 'url' }, { key: 'social.youtube', label: 'رابط يوتيوب', type: 'url' },
      { key: 'social.linkedin', label: 'رابط لينكدإن', type: 'url' }, { key: 'social.github', label: 'رابط جيتهاب', type: 'url' },
      { key: 'social.telegram', label: 'رابط تيليجرام', type: 'url' }, { key: 'social.whatsapp', label: 'رابط واتساب', type: 'url' }]],
    ['الصفحة الرئيسية', [
      { key: 'home.heroTitle', label: 'عنوان الصفحة الرئيسية', type: 'text', wide: true },
      { key: 'home.heroSubtitle', label: 'عنوان فرعي', type: 'textarea', wide: true },
      { key: 'home.welcomeMessage', label: 'رسالة الترحيب', type: 'textarea', wide: true },
      { key: 'home.showPaths', label: 'إظهار قسم المسارات', type: 'toggle' }, { key: 'home.showProgress', label: 'إظهار التقدم', type: 'toggle' },
      { key: 'home.showAchievements', label: 'إظهار الإنجازات', type: 'toggle' }]],
    ['ظهور المسارات', [
      { key: 'pathsDisplay.layout', label: 'طريقة العرض', type: 'select', options: [{ v: 'grid', l: 'شبكة بطاقات' }, { v: 'list', l: 'قائمة' }] },
      { key: 'pathsDisplay.showLevel', label: 'إظهار مستوى المسار', type: 'toggle' }, { key: 'pathsDisplay.showCounts', label: 'إظهار عدد الوحدات والدروس', type: 'toggle' },
      { key: 'pathsDisplay.showOrderNumbers', label: 'إظهار أرقام الترتيب', type: 'toggle' },
      { key: 'note', type: 'note', text: 'إظهار أو إخفاء كل مسار على حدة يتم من صفحة «المسارات التعليمية».' }]],
    ['تطبيق الويب (PWA)', [
      { key: 'pwa.name', label: 'اسم التطبيق', type: 'text' }, { key: 'pwa.shortName', label: 'الاسم المختصر', type: 'text' },
      { key: 'pwa.themeColor', label: 'لون الثيم', type: 'color' }, { key: 'pwa.backgroundColor', label: 'لون الخلفية', type: 'color' },
      { key: 'pwa.display', label: 'طريقة العرض', type: 'select', options: [{ v: 'standalone', l: 'standalone' }, { v: 'fullscreen', l: 'fullscreen' }, { v: 'minimal-ui', l: 'minimal-ui' }, { v: 'browser', l: 'browser' }] },
      { key: 'pwa.startUrl', label: 'رابط البدء', type: 'text' },
      { key: 'pwa.icon192', label: 'أيقونة 192×192', type: 'image', category: 'logos' }, { key: 'pwa.icon512', label: 'أيقونة 512×512', type: 'image', category: 'logos' }]]
  ];

  function manifest(s) {
    var p = s.pwa || {}, icons = [];
    [['icon192', '192x192'], ['icon512', '512x512']].forEach(function (x) {
      var u = p[x[0]] ? E.assetSrc(p[x[0]]) : '';
      if (u) icons.push({ src: u, sizes: x[1], type: /\.svg(\?|$)/.test(u) ? 'image/svg+xml' : /\.webp/.test(u) ? 'image/webp' : /\.jpe?g/.test(u) ? 'image/jpeg' : 'image/png' });
    });
    return { name: p.name || s.name, short_name: p.shortName || s.name, start_url: p.startUrl || '/', display: p.display || 'standalone', theme_color: p.themeColor || '#3C4AE8', background_color: p.backgroundColor || '#FFFFFF', dir: 'rtl', lang: 'ar', icons: icons };
  }

  E.page('settings', {
    title: 'الإعدادات',
    render: function (c) {
      c.innerHTML = '<div class="page-head"><div><h1>إعدادات المنصة</h1><p class="sub">تعديل الإعدادات لا يمسّ المسارات أو الدروس أو أي بيانات أخرى.</p></div>' +
        '<div class="acts"><button class="btn" data-man>' + E.icon('download') + ' تنزيل manifest</button><button class="btn primary" data-save>' + E.icon('check') + ' حفظ الإعدادات</button></div></div><div class="stack" data-secs></div>';
      var host = E.$('[data-secs]', c), forms = [];
      SECTIONS.forEach(function (sec) {
        var f = E.buildForm(sec[1], Store.data.settings);
        forms.push({ form: f, fields: sec[1] });
        var p = E.el('<section class="panel panel-pad"><h2 style="margin-bottom:14px"></h2></section>');
        E.$('h2', p).textContent = sec[0]; p.appendChild(f.el); host.appendChild(p);
      });
      E.Router.guard = { dirty: function () { return forms.some(function (x) { return x.form.isDirty(); }); } };
      E.$('[data-save]', c).onclick = function () {
        var ok = forms.map(function (x) { return x.form.validate(); }).every(Boolean);
        if (!ok) { E.toast('راجع الحقول المظللة', { type: 'error' }); return; }
        Store.update(function (d) {
          forms.forEach(function (x) { x.fields.forEach(function (f) { if (f.key && f.type !== 'note') E.setPath(d.settings, f.key, E.getPath(x.form.values, f.key)); }); });
        });
        forms.forEach(function (x) { x.form.reset(); });
        E.toast('تم حفظ الإعدادات', { type: 'success' });
      };
      E.$('[data-man]', c).onclick = function () {
        var merged = E.clone(Store.data.settings);
        forms.forEach(function (x) { x.fields.forEach(function (f) { if (f.key && f.type !== 'note') E.setPath(merged, f.key, E.getPath(x.form.values, f.key)); }); });
        E.download('manifest.webmanifest', manifest(merged));
      };
    }
  });

  /* =============== البيانات والنسخ الاحتياطي =============== */
  var KNOWN = ['paths', 'modules', 'lessons', 'questions', 'quizzes', 'projects', 'assets', 'glossary'];
  var NAMES = { paths: 'مسارات', modules: 'وحدات', lessons: 'دروس', questions: 'أسئلة', quizzes: 'اختبارات', projects: 'مشروعات', assets: 'رسومات', glossary: 'مصطلحات',
    'gamification.xpRules': 'قواعد XP', 'gamification.levels': 'مستويات', 'gamification.badges': 'شارات', 'gamification.encouragements': 'رسائل', 'gamification.dailyChallenges': 'تحديات' };

  function checkUnique(d) {
    var errs = [], seen = {};
    E.COLLECTIONS.forEach(function (c) {
      var inCol = {};
      (E.getPath(d, c) || []).forEach(function (x) {
        if (inCol[x.id]) errs.push('معرّف مكرر في «' + (NAMES[c] || c) + '»: ' + x.id);
        inCol[x.id] = 1;
        if (['lessons', 'modules', 'questions'].indexOf(c) !== -1) {
          if (seen[x.id] && seen[x.id] !== c) errs.push('المعرّف ' + x.id + ' مستخدم في «' + NAMES[seen[x.id]] + '» و«' + NAMES[c] + '»');
          seen[x.id] = c;
        }
      });
    });
    return errs;
  }

  function validateImport(raw) {
    var errors = [], warnings = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['الملف ليس بيانات منصة صالحة (المتوقع كائن JSON).'], warnings: warnings };
    if (raw.schemaVersion != null && typeof raw.schemaVersion !== 'number') errors.push('رقم الإصدار schemaVersion غير صالح.');
    else if (raw.schemaVersion > ED.SCHEMA_VERSION) errors.push('الملف من إصدار أحدث (' + raw.schemaVersion + ') من إصدار لوحة التحكم (' + ED.SCHEMA_VERSION + ').');
    if (raw.schemaVersion == null) warnings.push('الملف بدون رقم إصدار — سيُعامل كنسخة قديمة وتُضاف له الحقول الناقصة دون حذف أي شيء.');
    E.COLLECTIONS.forEach(function (c) {
      var v = E.getPath(raw, c);
      if (v !== undefined && !Array.isArray(v)) errors.push('«' + (NAMES[c] || c) + '» يجب أن تكون قائمة.');
    });
    if (raw.settings != null && (typeof raw.settings !== 'object' || Array.isArray(raw.settings))) errors.push('الإعدادات يجب أن تكون كائنًا.');
    if (errors.length) return { errors: errors, warnings: warnings };
    var next = E.migrate(E.clone(raw)), missing = 0, used = {};
    E.COLLECTIONS.forEach(function (c) { E.getPath(next, c).forEach(function (x) { if (x && x.id) used[x.id] = 1; }); });
    E.COLLECTIONS.forEach(function (c) {
      var arr = E.getPath(next, c);
      for (var i = arr.length - 1; i >= 0; i--) if (!arr[i] || typeof arr[i] !== 'object' || Array.isArray(arr[i])) { errors.push('عنصر غير صالح في «' + (NAMES[c] || c) + '» رقم ' + (i + 1)); arr.splice(i, 1); }
      arr.forEach(function (x) {
        if (!x.id || typeof x.id !== 'string') { var id; do { id = c.split('.').pop().charAt(0) + '_' + Math.random().toString(36).slice(2, 8); } while (used[id]); x.id = id; used[id] = 1; missing++; }
      });
    });
    if (missing) warnings.push('تم إنشاء معرّفات جديدة لـ ' + missing + ' عنصر كانت بدون معرّف.');
    errors = errors.concat(checkUnique(next));
    var ids = function (c) { var o = {}; (E.getPath(next, c) || []).forEach(function (x) { o[x.id] = 1; }); return o; };
    var P = ids('paths'), M = ids('modules'), L = ids('lessons'), Q = ids('questions'), dang = 0;
    next.modules.forEach(function (m) { if (!P[m.pathId]) dang++; });
    next.lessons.forEach(function (l) { if (!M[l.moduleId]) dang++; });
    next.questions.forEach(function (q) { if (q.pathId && !P[q.pathId]) dang++; if (q.moduleId && !M[q.moduleId]) dang++; if (q.lessonId && !L[q.lessonId]) dang++; });
    next.quizzes.forEach(function (z) { (z.questionIds || []).forEach(function (id) { if (!Q[id]) dang++; }); });
    if (dang) warnings.push('يوجد ' + dang + ' ارتباط يشير إلى عناصر غير موجودة في الملف.');
    var stats = {}; E.COLLECTIONS.forEach(function (c) { var n = E.getPath(next, c).length; if (n) stats[c] = n; });
    return { errors: errors, warnings: warnings, stats: stats, next: next };
  }

  function merge(cur, inc) {
    var out = E.clone(cur), added = 0, skipped = 0;
    E.COLLECTIONS.forEach(function (c) {
      var arr = Store.list(c, out), ids = {};
      arr.forEach(function (x) { ids[x.id] = 1; });
      (E.getPath(inc, c) || []).forEach(function (x) { if (ids[x.id]) skipped++; else { arr.push(E.clone(x)); added++; } });
    });
    return { out: out, added: added, skipped: skipped };
  }

  function stamp() { var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); }
  function summary(stats) { return Object.keys(stats || {}).map(function (k) { return stats[k] + ' ' + (NAMES[k] || k); }).join(' · ') || 'لا محتوى'; }

  function makeBackup(label) {
    var key = 'backup:' + Date.now();
    return ED.idb.set(key, { at: Date.now(), label: label || '', data: Store.snapshot() }).then(function () {
      return ED.idb.keys().then(function (ks) {
        var old = ks.filter(function (k) { return String(k).indexOf('backup:') === 0; }).sort();
        return Promise.all(old.slice(0, Math.max(0, old.length - 8)).map(function (k) { return ED.idb.del(k); }));
      });
    });
  }

  function importFlow(raw, done) {
    var v = validateImport(raw);
    var body = E.el('<div class="stack"></div>');
    var mode = 'replace';
    if (v.errors.length) {
      body.innerHTML = '<div class="note-static" style="background:var(--danger-soft);color:var(--danger)"><b>لا يمكن استيراد الملف</b><ul>' + v.errors.slice(0, 12).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div><p>لم يتم تغيير أي بيانات.</p>';
      E.modal({ title: 'فشل التحقق من الملف', body: body, footer: [{ label: 'إغلاق' }] });
      return;
    }
    body.innerHTML = '<div class="note-static"><b>محتوى الملف:</b> ' + esc(summary(v.stats)) + '</div>' +
      (v.warnings.length ? '<div class="banner" style="margin:0"><div><b>ملاحظات</b><ul style="margin:6px 0 0">' + v.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div></div>' : '') +
      '<div class="field"><label>طريقة الاستيراد</label><select data-m><option value="replace">استبدال كل بيانات المنصة بمحتوى الملف</option><option value="merge">دمج: إضافة العناصر الجديدة فقط وتخطي المكررة</option></select></div>' +
      '<p class="hint">قبل أي تغيير تُحفظ نسخة احتياطية تلقائيًا. ولا تُستبدل البيانات الحالية إلا بعد نجاح الحفظ.</p>';
    var m = E.modal({
      title: 'تأكيد الاستيراد', body: body,
      footer: [{
        label: 'استيراد', cls: 'primary', onClick: function (ctx) {
          mode = E.$('[data-m]', body).value;
          var next;
          if (mode === 'merge') {
            var r = merge(Store.data, v.next);
            var errs = checkUnique(r.out);
            if (errs.length) { E.toast('تعذر الدمج: ' + errs[0], { type: 'error' }); return false; }
            next = r.out; next.__msg = 'تمت إضافة ' + r.added + ' عنصر وتخطي ' + r.skipped + ' مكرر';
          } else {
            next = v.next;
            var u = Store.data.usage;
            if (!(next.usage.completions.length || next.usage.quizResults.length || next.usage.achievements.length)) next.usage = u;
            next.__msg = 'تم استبدال البيانات';
          }
          var msg = next.__msg; delete next.__msg;
          next.rev = Store.data.rev;
          ctx.setBusy(true);
          return makeBackup('قبل الاستيراد').catch(function () { /* non-fatal */ }).then(function () { return Store.replaceAll(next); }).then(function () {
            ctx.setBusy(false); E.toast(msg, { type: 'success' }); done && done();
          }).catch(function (e) { ctx.setBusy(false); E.toast('فشل الاستيراد ولم تتغير بياناتك: ' + e.message, { type: 'error' }); return false; });
        }
      }, { label: 'إلغاء' }]
    });
    return m;
  }

  E.page('data', {
    title: 'البيانات والنسخ الاحتياطي',
    render: function (c) {
      var server = Store.mode === 'server';
      c.innerHTML = '<div class="page-head"><div><h1>البيانات والنسخ الاحتياطي</h1><p class="sub">تصدير واستيراد بيانات المنصة بصيغة JSON.</p></div></div>' +
        '<div class="stack"><section class="panel panel-pad"><h2>حدود المزامنة</h2><p style="margin-top:8px">' +
        (server ? 'أنت متصل بالخادم: كل تعديل يُحفظ في ملف <code dir="ltr">data/efhamha-data.json</code> على الخادم، ويُنشر للموقع في <code dir="ltr">/public/efhamha-data.json</code> (المنشور فقط، بدون المسودات). الخادم يحتفظ بآخر 30 نسخة تلقائيًا.' :
          'أنت في <b>الوضع المحلي</b>: البيانات محفوظة في هذا المتصفح فقط (IndexedDB) ولا تُزامَن بين الأجهزة، ولا تظهر في الموقع تلقائيًا. للنشر: نزّل «ملف الموقع» وضعه في مشروع Efhamha (انظر README)، أو شغّل الخادم المرفق لربط حقيقي ومحمي.') + '</p></section>' +
        '<section class="panel panel-pad"><h2>تصدير</h2><div class="acts" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">' +
        '<button class="btn primary" data-x="full">' + E.icon('download') + ' تنزيل نسخة احتياطية كاملة</button><button class="btn" data-x="site">' + E.icon('download') + ' تنزيل ملف الموقع (المنشور فقط)</button></div>' +
        '<p class="hint" style="margin-top:8px">النسخة الكاملة تشمل المسودات والإعدادات وبيانات الاستخدام. ملف الموقع هو ما يراه الطلاب.</p></section>' +
        '<section class="panel panel-pad"><h2>استيراد</h2><p style="margin:8px 0 12px">اختر ملف JSON. سيتم التحقق منه وعرض ملخص قبل أي تغيير.</p><button class="btn" data-x="imp">' + E.icon('upload') + ' اختيار ملف للاستيراد</button><input type="file" hidden accept="application/json,.json"></section>' +
        '<section class="panel"><div class="panel-head"><h2>نسخ محفوظة في هذا المتصفح</h2></div><div data-bk class="chart-body"></div></section></div>';
      var file = E.$('input[type=file]', c);

      function bk() {
        var box = E.$('[data-bk]', c);
        ED.idb.keys().catch(function () { return []; }).then(function (ks) {
          var list = ks.filter(function (k) { return String(k).indexOf('backup:') === 0; }).sort().reverse();
          return Promise.all(list.map(function (k) { return ED.idb.get(k).then(function (v) { return { key: k, v: v }; }); }));
        }).then(function (items) {
          items = items.filter(function (x) { return x.v && x.v.data; });
          if (!items.length) { box.innerHTML = CH.empty('لا توجد نسخ بعد. تُنشأ نسخة تلقائيًا قبل كل استيراد أو استعادة.'); return; }
          box.innerHTML = '<ul class="health" style="padding:0">' + items.map(function (x) {
            var st = {}; E.COLLECTIONS.forEach(function (cc) { var n = (E.getPath(x.v.data, cc) || []).length; if (n) st[cc] = n; });
            return '<li style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap"><div style="flex:1;min-width:180px"><b>' + esc(E.fmtDate(x.v.at)) + ' ' + esc(E.fmtTime(x.v.at)) + '</b> ' + (x.v.label ? '<span class="badge">' + esc(x.v.label) + '</span>' : '') + '<div class="t-sub">' + esc(summary(st)) + '</div></div>' +
              '<button class="btn sm" data-r="' + esc(x.key) + '">استعادة</button><button class="btn sm" data-d="' + esc(x.key) + '">' + E.icon('download') + ' تنزيل</button><button class="icon-btn sm danger" data-k="' + esc(x.key) + '" aria-label="حذف النسخة">' + E.icon('trash') + '</button></li>';
          }).join('') + '</ul>';
        });
      }
      c.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var dx = b.dataset;
        if (dx.x === 'full') { E.download('efhamha-backup-' + stamp() + '.json', Store.data); E.toast('تم تنزيل النسخة الاحتياطية', { type: 'success' }); }
        else if (dx.x === 'site') E.download('efhamha-data.json', ED.publicView(Store.data));
        else if (dx.x === 'imp') file.click();
        else if (dx.d) ED.idb.get(dx.d).then(function (v) { E.download('efhamha-backup-' + stamp() + '.json', v.data); });
        else if (dx.k) E.confirm({ title: 'حذف النسخة', message: 'سيتم حذف هذه النسخة المحفوظة نهائيًا.', confirmText: 'حذف', danger: true }).then(function (ok) { if (ok) ED.idb.del(dx.k).then(bk); });
        else if (dx.r) ED.idb.get(dx.r).then(function (v) {
          E.confirm({ title: 'استعادة النسخة', message: 'سيتم استبدال بيانات المنصة الحالية بهذه النسخة. تُحفظ نسخة من الوضع الحالي قبل ذلك.', confirmText: 'استعادة', danger: true }).then(function (ok) {
            if (!ok) return;
            var next = E.clone(v.data); next.rev = Store.data.rev;
            makeBackup('قبل الاستعادة').then(function () { return Store.replaceAll(next); }).then(function () { E.toast('تمت الاستعادة', { type: 'success' }); bk(); })
              .catch(function (er) { E.toast('فشلت الاستعادة ولم تتغير بياناتك: ' + er.message, { type: 'error' }); });
          });
        });
      });
      file.addEventListener('change', function () {
        var f = file.files[0]; file.value = ''; if (!f) return;
        if (f.size > 30 * 1024 * 1024) { E.toast('الملف كبير جدًا', { type: 'error' }); return; }
        f.text().then(function (t) {
          var raw; try { raw = JSON.parse(t); } catch (er) { E.toast('الملف ليس JSON صالحًا: ' + er.message, { type: 'error' }); return; }
          importFlow(raw, function () { E.Router.refresh(); });
        });
      });
      bk();
    }
  });
  E.validateImport = validateImport;
})();
