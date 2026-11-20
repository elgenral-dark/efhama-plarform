(function () {
  'use strict';
  var E = window.Efhamha, esc = E.esc, Store = E.Store, CH = E.charts;
  var DAY = 86400000;
  var iso = function (d) { return new Date(d).toISOString().slice(0, 10); };
  var mins = function (s) { return s == null ? '—' : s >= 3600 ? (s / 3600).toFixed(1) + ' ساعة' : s >= 60 ? Math.round(s / 60) + ' دقيقة' : s + ' ثانية'; };
  var pct = function (n) { return n == null ? '—' : n + '%'; };

  function csv(name, cols, rows) {
    var q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var txt = '\ufeff' + [cols.map(function (c) { return q(c[1]); }).join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return q(r[c[0]]); }).join(','); })).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = name + '.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  function delta(cur, prev) {
    if (prev == null) return '';
    var d = cur - prev, p = prev ? Math.round(100 * d / prev) : null;
    return '<span class="delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : '') + '">' + (d > 0 ? '▲' : d < 0 ? '▼' : '=') + ' ' + (d > 0 ? '+' : '') + E.num(d) + (p != null ? ' (' + p + '%)' : '') + ' عن الفترة السابقة</span>';
  }
  function table(id, cols, rows, empty) {
    if (!rows.length) return '<div class="empty-chart">' + esc(empty || 'لا توجد بيانات في هذه الفترة.') + '</div>';
    return '<div class="tbl-wrap"><table class="tbl" id="' + id + '"><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c[1]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td data-label="' + esc(c[1]) + '">' + (c[2] ? c[2](r) : esc(r[c[0]] == null ? '—' : r[c[0]])) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function head(title, sub, exp) { return '<div class="panel-head"><div><h2>' + esc(title) + '</h2>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>' + (exp ? '<button class="btn sm" data-csv="' + exp + '">' + E.icon('download') + ' CSV</button>' : '') + '</div>'; }

  E.page('analytics', {
    title: 'تحليلات الطلاب',
    render: function (c) {
      c.innerHTML = '<div class="page-head"><div><h1>تحليلات الطلاب</h1><p class="sub">من بيانات فعلية أرسلها الموقع. لا توجد أرقام افتراضية.</p></div></div>';
      if (Store.mode !== 'server') { E.needServer(c, 'التحليلات'); return; }
      var today = iso(Date.now());
      var st = { preset: '30', from: iso(Date.now() - 29 * DAY), to: today, compare: false, pathId: '', lessonId: '', inactiveDays: 14 };
      var data = null;
      c.insertAdjacentHTML('beforeend',
        '<div class="panel filter-panel" style="margin-bottom:20px">' +
          '<div class="filter-top-bar">' +
            '<div class="seg" role="group" aria-label="الفترة">' +
              [['0', 'اليوم'], ['7', 'آخر 7 أيام'], ['30', 'آخر 30 يومًا'], ['90', 'آخر 90 يومًا'], ['custom', 'فترة مخصصة']].map(function (x) { return '<button type="button" data-p="' + x[0] + '" aria-pressed="' + (st.preset === x[0]) + '">' + x[1] + '</button>'; }).join('') +
            '</div>' +
            '<label class="switch modern-switch"><input type="checkbox" data-cmp><span class="track"></span><span class="switch-label">مقارنة بالفترة السابقة</span></label>' +
          '</div>' +
          '<div class="toolbar modern-filter-toolbar">' +
            '<label class="inline-date" data-cust hidden>من <input type="date" data-from></label><label class="inline-date" data-cust hidden>إلى <input type="date" data-to></label>' +
            '<div class="filter-select-wrap">' + E.icon('route') + '<select data-path aria-label="المسار"><option value="">كل المسارات</option></select></div>' +
            '<div class="filter-select-wrap">' + E.icon('book') + '<select data-lesson aria-label="الدرس"><option value="">كل الدروس</option></select></div>' +
            '<div class="filter-field-inline"><span class="lbl-dim">غادر بعد:</span><input type="number" min="1" max="365" value="14" data-inact style="width:70px"><span class="lbl-dim">يوم بلا نشاط</span></div>' +
          '</div>' +
        '</div>' +
        '<div data-body><div class="skel" style="height:240px"></div></div>');
      var body = E.$('[data-body]', c);

      function range() {
        if (st.preset === 'custom') return { from: st.from, to: st.to };
        var n = +st.preset; return { from: iso(Date.now() - n * DAY), to: today };
      }
      function load() {
        var r = range();
        if (r.from > r.to) { E.toast('تاريخ البداية بعد النهاية', { type: 'error' }); return; }
        var qs = new URLSearchParams({ from: r.from, to: r.to, tz: -new Date().getTimezoneOffset(), pathId: st.pathId, lessonId: st.lessonId, compare: st.compare ? '1' : '0', inactiveDays: st.inactiveDays });
        body.setAttribute('aria-busy', 'true');
        Store.api('GET', '/analytics?' + qs).then(function (d) { data = d; fillMeta(); draw(); }).catch(function (e) { body.innerHTML = '<div class="empty">' + E.icon('alert') + '<h3>' + esc(e.message) + '</h3></div>'; });
      }
      function fillMeta() {
        var ps = E.$('[data-path]', c), ls = E.$('[data-lesson]', c);
        if (ps.options.length === 1) ps.insertAdjacentHTML('beforeend', data.meta.paths.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join(''));
        ps.value = st.pathId;
        ls.innerHTML = '<option value="">كل الدروس</option>' + data.meta.lessons.filter(function (l) { return !st.pathId || l.pathId === st.pathId; }).map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.title) + '</option>'; }).join('');
        ls.value = st.lessonId;
      }
      function draw() {
        var d = data, a = d.access, pv = d.previous ? d.previous.cards : {}, noData = !a.entered && !a.sessions && !d.lessons.rows.some(function (l) { return l.opened; }) && !d.quizzes.attempts;
        var cards = [
          ['طلاب دخلوا المنصة', a.entered, delta(a.entered, pv.entered), 'users', 'students'],
          ['نشطون اليوم (DAU)', a.dau, '', 'sparkle', 'active-day'],
          ['نشطون أسبوعيًا (WAU)', a.wau, '', 'chart', 'active-week'],
          ['نشطون شهريًا (MAU)', a.mau, '', 'history', 'active-month'],
          ['عدد الجلسات', a.sessions, delta(a.sessions, pv.sessions), 'database', 'sessions'],
          ['متوسط مدة الجلسة', mins(a.avgSessionSeconds), d.previous ? '<span class="delta">السابقة: ' + mins(d.previous.avgSessionSeconds) + '</span>' : '', 'clock', 'duration'],
          ['غادروا المنصة (بلا نشاط ' + d.filters.inactiveDays + ' يومًا)', a.left, '', 'arrow', 'left'],
          ['دروس مكتملة', d.cards.completions, delta(d.cards.completions, pv.completions), 'book', 'lessons-done'],
          ['محاولات اختبار', d.cards.attempts, delta(d.cards.attempts, pv.attempts), 'clipboard', 'quizzes-done'],
          ['اشتراكات جديدة', d.cards.newSubs, delta(d.cards.newSubs, pv.newSubs), 'wallet', 'subs-done']
        ];
        var h = '';
        if (noData) h += '<div class="banner modern-banner" role="note"><div class="banner-icon">' + E.icon('alert') + '</div><div><b>لا توجد بيانات تتبع في هذه الفترة حتى الآن</b><p class="banner-desc">تظهر الإحصائيات الحية عندما يتفاعل الطلاب مع الموقع ويتم إرسال الأحداث عبر <code dir="ltr">efhamha-tracker.js</code>. (إجمالي الطلاب المسجلين بالمنصة: ' + E.num(a.totalStudents) + ' طالب).</p></div></div>';
        if (d.previous) h += '<div class="notice-pill">' + E.icon('history') + ' مقارنة بالفترة السابقة: ' + esc(d.previous.range.from) + ' ← ' + esc(d.previous.range.to) + '</div>';
        
        h += '<div class="section-title"><h3>المؤشرات الرئيسية للأداء</h3></div>';
        h += '<div class="analytics-kpis-grid">' + cards.map(function (x) {
          return '<div class="stat-card kpi-card" data-metric="' + x[4] + '">' +
            '<div class="stat-icon-wrap">' + E.icon(x[3] || 'chart') + '</div>' +
            '<div class="stat-info">' +
              '<span class="n">' + (typeof x[1] === 'number' ? E.num(x[1]) : esc(x[1])) + '</span>' +
              '<span class="l">' + esc(x[0]) + '</span>' +
              (x[2] ? '<div class="kpi-delta-box">' + x[2] + '</div>' : '') +
            '</div>' +
          '</div>';
        }).join('') + '</div>';

        h += '<div class="section-title"><h3>حركة ونشاط الطلاب</h3></div>';
        h += '<div class="charts modern-charts-grid">' +
          '<section class="panel chart-panel">' + head('الطلاب النشطون يوميًا', 'عدد الطلاب المميزين في كل يوم', 'daily') + '<div class="chart-body">' + (a.daily.length ? CH.line(a.daily.map(function (x) { return { label: x.day.slice(5), value: x.n }; })) : CH.empty('لا توجد جلسات مسجلة.')) + '</div></section>' +
          '<section class="panel chart-panel">' + head('أوقات النشاط الأكثر شيوعًا', 'عدد الجلسات حسب ساعة اليوم (بتوقيتك المحلي)') + '<div class="chart-body">' + (a.sessions ? CH.columns(a.hours, a.hours.map(function (_, i) { return String(i); }), { every: 3, label: 'الجلسات حسب الساعة' }) : CH.empty('لا توجد جلسات مسجلة.')) + '</div></section>' +
        '</div>';

        var L = d.lessons;
        h += '<section class="panel analytics-section" style="margin-top:24px">' + head('تحليلات الدروس', 'متوسط وقت التعلم الكلي: ' + mins(L.avgLearningSeconds), 'lessons') + '<div class="chart-body">' +
          table('t-lessons', [['title', 'الدرس'], ['pathName', 'المسار'], ['opened', 'فتحه'], ['completedByOpeners', 'أكمله'], ['completionRate', 'نسبة الإكمال', function (r) { return pct(r.completionRate); }], ['startedNotCompleted', 'بدأ ولم يكمل'], ['avgSeconds', 'متوسط الوقت', function (r) { return mins(r.avgSeconds); }]], L.rows.filter(function (r) { return r.opened > 0; }).sort(function (x, y) { return y.opened - x.opened; }), 'لا توجد مشاهدات دروس في هذه الفترة.') +
          (L.rows.length ? '<div class="grid-2" style="margin-top:20px"><div><h4 class="sub-heading">الأكثر مشاهدة</h4>' + (L.mostViewed.length ? CH.bars(L.mostViewed.map(function (x) { return { label: x.title, value: x.opened }; })) : CH.empty('—')) + '</div><div><h4 class="sub-heading">الأقل مشاهدة</h4>' + CH.bars(L.leastViewed.map(function (x) { return { label: x.title, value: x.opened }; })) + '</div></div>' : '') +
          (L.startedNotCompletedStudents ? '<h4 style="margin-top:18px">طلاب بدأوا الدرس ولم يكملوه</h4>' + (L.startedNotCompletedStudents.length ? '<ul class="plain user-list">' + L.startedNotCompletedStudents.map(function (s) { return '<li><a href="#/students/' + s.id + '">' + esc(s.name) + '</a></li>'; }).join('') + '</ul>' : '<div class="empty-chart">لا يوجد.</div>') : (st.lessonId ? '' : '<p class="hint" style="margin-top:12px">اختر درسًا محددًا لعرض أسماء من بدأ ولم يكمل.</p>')) + '</div></section>';

        h += '<section class="panel analytics-section" style="margin-top:24px">' + head('تفاعل ومشاهدات الفيديوهات', 'تُحتسب المشاهدة من أحداث تشغيل فعلية فقط', 'videos') + '<div class="chart-body">' + (d.videos.rows.length ? table('t-videos', [['title', 'الفيديو'], ['lessonTitle', 'الدرس'], ['started', 'بدأ المشاهدة'], ['completed', 'شاهد حتى النهاية'], ['watchPct', 'نسبة المشاهدة', function (r) { return pct(r.watchPct); }], ['avgWatchedSeconds', 'متوسط وقت المشاهدة', function (r) { return mins(r.avgWatchedSeconds); }],
          ['commonStop', 'أكثر نقطة توقف', function (r) { return r.commonStop ? r.commonStop.from + '–' + r.commonStop.to + '% من الفيديو' : '—'; }], ['notStarted', 'مسجلون لم يبدأوا']], d.videos.rows) +
          d.videos.rows.filter(function (v) { return v.stopBuckets.some(Boolean); }).map(function (v) { return '<div style="margin-top:16px"><b>نقاط التوقف: ' + esc(v.title) + '</b>' + CH.columns(v.stopBuckets, v.stopBuckets.map(function (_, i) { return i * 10 + '%'; }), { label: 'نقاط التوقف' }) + '</div>'; }).join('')
          : CH.empty('لا توجد فيديوهات منشورة في الدروس (أضف كتلة «فيديو» في محرر الدرس).')) + '</div></section>';

        var Q = d.quizzes;
        h += '<section class="panel analytics-section" style="margin-top:24px">' + head('نتائج ومحاولات الاختبارات', Q.attempts ? E.num(Q.attempts) + ' محاولة · متوسط ' + pct(Q.avg) + ' · أعلى ' + pct(Q.max) + ' · أقل ' + pct(Q.min) + ' · نجاح ' + pct(Q.passRate) : 'لا توجد محاولات', 'quizzes') + '<div class="chart-body">' +
          table('t-quizzes', [['title', 'الاختبار'], ['attempts', 'المحاولات'], ['avg', 'المتوسط', function (r) { return pct(r.avg); }], ['max', 'الأعلى', function (r) { return pct(r.max); }], ['min', 'الأقل', function (r) { return pct(r.min); }], ['passRate', 'نسبة النجاح', function (r) { return pct(r.passRate); }]], Q.perQuiz, 'لا توجد محاولات اختبار في هذه الفترة.') +
          (Q.mostMissed.length ? '<h4 style="margin-top:18px">أكثر الأسئلة التي يخطئ فيها الطلاب</h4>' + table('t-missed', [['text', 'السؤال', function (r) { return '<div class="clip" dir="auto">' + esc(r.text) + '</div>'; }], ['wrong', 'أخطأ'], ['total', 'من'], ['wrongPct', 'نسبة الخطأ', function (r) { return r.wrongPct + '%'; }]], Q.mostMissed) : '') +
          (Q.attempts ? '<h4 style="margin-top:18px">طلاب لم يجتازوا (' + E.num(Q.failedCount) + ')</h4>' + (Q.failedStudents ? (Q.failedStudents.length ? '<ul class="plain user-list">' + Q.failedStudents.map(function (s) { return '<li><a href="#/students/' + s.id + '">' + esc(s.name) + '</a> — ' + esc(s.quiz) + ' <span class="t-sub">أفضل نتيجة ' + s.best + '%</span></li>'; }).join('') + '</ul>' : '') : '<p class="hint">الأسماء متاحة للأدوار التي لها صلاحية الطلاب.</p>') : '') + '</div></section>';

        h += '<section class="panel analytics-section" style="margin-top:24px">' + head('أداء المسارات التعليمية', '', 'paths') + '<div class="chart-body">' + table('t-paths', [['name', 'المسار'], ['enrolled', 'عدد الطلاب'], ['avgProgress', 'متوسط التقدم', function (r) { return pct(r.avgProgress); }], ['completedStudents', 'أتموا المسار'], ['completionRate', 'نسبة الإكمال', function (r) { return pct(r.completionRate); }],
          ['avgDaysToComplete', 'متوسط أيام الإكمال', function (r) { return r.avgDaysToComplete == null ? '—' : r.avgDaysToComplete + ' يوم'; }], ['activity', 'النشاط في الفترة']], d.paths.rows, 'لا توجد مسارات.') +
          '<div class="grid-2" style="margin-top:20px"><div><h4 class="sub-heading">الأكثر دراسة</h4>' + (d.paths.mostStudied.length ? CH.bars(d.paths.mostStudied.map(function (x) { return { label: x.name, value: x.activity }; })) : CH.empty('لا نشاط.')) + '</div><div><h4 class="sub-heading">الأقل نشاطًا</h4>' + CH.bars(d.paths.leastActive.map(function (x) { return { label: x.name, value: x.activity }; })) + '</div></div></div></section>';

        var S = d.subscriptions;
        var subKpis = [
          ['إجمالي الاشتراكات', S.total, 'wallet'],
          ['نشطة', S.active, 'check'],
          ['معلقة', S.pending, 'history'],
          ['منتهية', S.expired, 'x'],
          ['جديدة في الفترة', S.newInPeriod, 'sparkle']
        ];
        h += '<section class="panel analytics-section" style="margin-top:24px">' + head('حالة الاشتراكات والمدفوعات') + '<div class="chart-body">' +
          '<div class="subs-kpis-grid">' + subKpis.map(function (x) {
            return '<div class="stat-card kpi-card">' +
              '<div class="stat-icon-wrap">' + E.icon(x[2]) + '</div>' +
              '<div class="stat-info"><span class="n">' + E.num(x[1]) + '</span><span class="l">' + x[0] + '</span></div>' +
            '</div>';
          }).join('') + '</div>' +
          '<div class="revenue-box ' + (S.revenue && S.revenue.length ? 'has-rev' : '') + '">' + E.icon('wallet') + ' <span>' + (S.revenue === null ? 'لا توجد بيانات مدفوعات موثقة، لذلك لا تُعرض إيرادات.' : S.revenue.length ? 'إيرادات موثقة في الفترة: <b>' + S.revenue.map(function (r) { return E.num(r.total) + ' ' + esc(r.currency) + ' (' + r.payments + ' دفعة)'; }).join('، ') + '</b>' : 'لا توجد مدفوعات موثقة في هذه الفترة.') + '</span></div></div></section>';
        body.innerHTML = h; body.removeAttribute('aria-busy');
      }

      var exp = {
        daily: function () { csv('daily-active', [['day', 'اليوم'], ['n', 'طلاب نشطون']], data.access.daily); },
        lessons: function () { csv('lessons', [['title', 'الدرس'], ['pathName', 'المسار'], ['opened', 'فتحه'], ['completedByOpeners', 'أكمله'], ['completionRate', 'نسبة الإكمال %'], ['startedNotCompleted', 'بدأ ولم يكمل'], ['avgSeconds', 'متوسط الوقت (ثانية)']], data.lessons.rows); },
        videos: function () { csv('videos', [['title', 'الفيديو'], ['lessonTitle', 'الدرس'], ['started', 'بدأ'], ['completed', 'أنهى'], ['watchPct', 'نسبة المشاهدة %'], ['avgWatchedSeconds', 'متوسط المشاهدة (ثانية)'], ['notStarted', 'لم يبدأ']], data.videos.rows); },
        quizzes: function () { csv('quizzes', [['title', 'الاختبار'], ['attempts', 'المحاولات'], ['avg', 'المتوسط'], ['max', 'الأعلى'], ['min', 'الأقل'], ['passRate', 'النجاح %']], data.quizzes.perQuiz); },
        paths: function () { csv('paths', [['name', 'المسار'], ['enrolled', 'الطلاب'], ['avgProgress', 'متوسط التقدم %'], ['completedStudents', 'أتموا'], ['completionRate', 'نسبة الإكمال %'], ['avgDaysToComplete', 'متوسط الأيام'], ['activity', 'النشاط']], data.paths.rows); }
      };
      c.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.p) {
          st.preset = b.dataset.p; E.$$('[data-p]', c).forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
          E.$$('[data-cust]', c).forEach(function (x) { x.hidden = st.preset !== 'custom'; });
          if (st.preset !== 'custom') load();
        } else if (b.dataset.csv) { if (data) exp[b.dataset.csv](); }
      });
      c.addEventListener('change', function (e) {
        var t = e.target;
        if (t.matches('[data-from]')) { st.from = t.value || st.from; load(); }
        else if (t.matches('[data-to]')) { st.to = t.value || st.to; load(); }
        else if (t.matches('[data-path]')) { st.pathId = t.value; st.lessonId = ''; load(); }
        else if (t.matches('[data-lesson]')) { st.lessonId = t.value; load(); }
        else if (t.matches('[data-cmp]')) { st.compare = t.checked; load(); }
        else if (t.matches('[data-inact]')) { st.inactiveDays = Math.max(1, Math.min(365, +t.value || 14)); load(); }
      });
      E.$('[data-from]', c).value = st.from; E.$('[data-to]', c).value = st.to;
      load();
    }
  });
})();
