/* موقع تجريبي مصغّر يقرأ ملف النشر فقط — يوضح كيف يربط موقع Efhamha بالبيانات */
(function () {
  var ED = window.EfhamhaData, data, app = document.getElementById('app');
  var studentId = new URLSearchParams(location.search).get('student'), tracking = !!(studentId && window.EfhamhaTracker);
  if (tracking) EfhamhaTracker.init({ endpoint: '/api/track', studentId: studentId });
  function esc(s) { return ED.esc(s); }
  function counts(pid) {
    var ms = data.modules.filter(function (m) { return m.pathId === pid; });
    var ids = ms.map(function (m) { return m.id; });
    return { m: ms.length, l: data.lessons.filter(function (l) { return ids.indexOf(l.moduleId) !== -1; }).length };
  }
  function header(route) {
    var s = data.settings, logo = s.logo ? ED.imgTag(data, s.logo, s.name, '') : '';
    document.getElementById('hdr').innerHTML = logo + '<div><b>' + esc(s.name) + '</b><small>' + esc(s.tagline) + '</small></div><nav>' +
      [['#/', 'المسارات'], ['#/projects', 'المشروعات'], ['#/glossary', 'القاموس']].map(function (x) { return '<a href="' + x[0] + '"' + (route === x[0] ? ' class="on"' : '') + '>' + x[1] + '</a>'; }).join('') + '</nav>';
  }
  function home() {
    var s = data.settings, pd = s.pathsDisplay || {};
    app.innerHTML = '<h1>' + esc((s.home && s.home.heroTitle) || s.name) + '</h1>' + (s.home && s.home.heroSubtitle ? '<p>' + esc(s.home.heroSubtitle) + '</p>' : '') +
      (data.paths.length ? '<div class="cards" id="paths">' + data.paths.map(function (p, i) {
        var c = counts(p.id), img = p.image ? ED.imgTag(data, p.image, p.name, '') : '';
        return '<a class="card" data-path="' + esc(p.id) + '" href="#/path/' + encodeURIComponent(p.id) + '"><div class="ic">' + (img || esc(p.icon || '📘')) + '</div><h3>' + (pd.showOrderNumbers ? (i + 1) + '. ' : '') + esc(p.name) + '</h3><p>' + esc(p.description) + '</p>' +
          '<div style="margin-top:8px">' + (pd.showLevel !== false ? '<span class="pill">' + esc(ED.LEVELS[p.level] || '') + '</span>' : '') + (pd.showCounts !== false ? '<span class="pill">' + c.m + ' وحدة</span><span class="pill">' + c.l + ' درس</span>' : '') + '</div></a>';
      }).join('') + '</div>' : '<div class="empty">لا توجد مسارات ظاهرة.</div>') + subscription();
  }
  function subscription() {
    var s = data.subscription; if (!s || (s.price == null && !s.cashNumber && !s.whatsapp)) return '';
    return '<section id="subscribe" class="card" style="margin-top:20px"><h3>الاشتراك</h3>' + (s.price != null ? '<p>السعر: <b id="sub-price">' + esc(s.price) + '</b> ' + esc(s.currencyLabel) + '</p>' : '') +
      (s.cashNumber ? '<p>رقم الكاش: <b id="sub-cash" dir="ltr">' + esc(s.cashNumber) + '</b></p>' : '') + (s.whatsapp ? '<p>واتساب: <b id="sub-wa" dir="ltr">' + esc(s.whatsapp) + '</b></p>' : '') + '</section>';
  }
  function path(id) {
    var p = data.paths.filter(function (x) { return x.id === id; })[0];
    if (!p) { app.innerHTML = '<div class="empty">المسار غير موجود أو مخفي.</div>'; return; }
    var ms = data.modules.filter(function (m) { return m.pathId === id; });
    app.innerHTML = '<a class="back" href="#/">← كل المسارات</a><h1>' + esc(p.name) + '</h1><p>' + esc(p.description) + '</p>' +
      (ms.length ? ms.map(function (m) {
        var ls = data.lessons.filter(function (l) { return l.moduleId === m.id; });
        return '<section data-module="' + esc(m.id) + '"><h2>' + esc(m.title) + '</h2>' + (ls.length ? '<ul class="lessons">' + ls.map(function (l) { return '<li><a href="#/lesson/' + encodeURIComponent(l.id) + '">' + esc(l.title) + '</a></li>'; }).join('') + '</ul>' : '<div class="empty">لا توجد دروس منشورة بعد.</div>') + '</section>';
      }).join('') : '<div class="empty">لا توجد وحدات بعد.</div>');
  }
  function lesson(id) {
    var l = data.lessons.filter(function (x) { return x.id === id; })[0];
    if (!l) { app.innerHTML = '<div class="empty">الدرس غير موجود أو غير منشور.</div>'; return; }
    var m = data.modules.filter(function (x) { return x.id === l.moduleId; })[0];
    app.innerHTML = '<a class="back" href="#/path/' + encodeURIComponent(m ? m.pathId : '') + '">← رجوع</a>' + ED.renderLesson(data, l) +
      (tracking ? '<p><button id="done" type="button">أكملت الدرس</button></p>' : '');
    if (tracking) {
      EfhamhaTracker.lessonOpen(l.id);
      EfhamhaTracker.bindVideos(app);
      document.getElementById('done').onclick = function () { EfhamhaTracker.lessonComplete(l.id); EfhamhaTracker.flush(); this.textContent = 'تم تسجيل الإكمال'; };
    }
  }
  function projects() {
    app.innerHTML = '<h1>المشروعات</h1>' + (data.projects.length ? '<div class="cards">' + data.projects.map(function (p) {
      return '<div class="card"><h3>' + esc(p.title) + '</h3><p>' + esc(p.description) + '</p></div>';
    }).join('') + '</div>' : '<div class="empty">لا توجد مشروعات منشورة.</div>');
  }
  function glossary() {
    app.innerHTML = '<h1>القاموس التقني</h1>' + (data.glossary.length ? '<dl>' + data.glossary.map(function (t) {
      return '<dt><b>' + esc(t.ar) + '</b> <span dir="ltr">' + esc(t.en) + '</span></dt><dd>' + esc(t.definition) + '</dd>';
    }).join('') + '</dl>' : '<div class="empty">لا توجد مصطلحات.</div>');
  }
  function route() {
    var h = location.hash || '#/', parts = h.slice(2).split('/'), name = parts[0], arg = decodeURIComponent(parts[1] || '');
    header(name === 'projects' ? '#/projects' : name === 'glossary' ? '#/glossary' : '#/');
    if (name === 'path') path(arg); else if (name === 'lesson') lesson(arg); else if (name === 'projects') projects(); else if (name === 'glossary') glossary(); else home();
  }
  function start(src) {
    document.getElementById('ribbon').textContent = src;
    ED.injectStyles(); ED.applySettings(data.settings);
    window.addEventListener('hashchange', route); route();
  }
  ED.load('/public/efhamha-data.json').then(function (d) { data = d; start('يقرأ من /public/efhamha-data.json (المنشور فقط)'); })
    .catch(function () {
      return ED.loadLocalDraft().then(function (d) { data = d; start('وضع التطوير: يقرأ النسخة المحلية المحفوظة من لوحة التحكم في هذا المتصفح (المنشور فقط)'); });
    }).catch(function () { app.innerHTML = '<div class="empty">لا توجد بيانات. شغّل الخادم أو افتح لوحة التحكم أولًا من نفس العنوان.</div>'; });
})();
