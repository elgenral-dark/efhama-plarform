(function () {
  'use strict';
  var E = window.Efhamha, esc = E.esc, Store = E.Store;

  var NAV = [
    ['overview', 'نظرة عامة', 'home'], '-',
    ['paths', 'المسارات', 'route'], ['modules', 'الوحدات', 'layers'], ['lessons', 'الدروس', 'book'], '-',
    ['questions', 'بنك الأسئلة', 'help'], ['quizzes', 'الاختبارات', 'clipboard'], ['projects', 'المشروعات', 'briefcase'], '-',
    ['assets', 'مكتبة الرسومات', 'image'], ['glossary', 'القاموس التقني', 'glossary'], ['gamification', 'الإنجازات والتحفيز', 'trophy'], '-',
    ['ai', 'AI Lesson Creator', 'sparkle'], ['students', 'الطلاب', 'users'], ['analytics', 'تحليلات الطلاب', 'chart'], ['subscriptions', 'الاشتراكات', 'wallet'], '-',
    ['users', 'المستخدمون', 'shield'], ['logs', 'سجل العمليات', 'history'], '-',
    ['settings', 'الإعدادات', 'gear'], ['data', 'البيانات والنسخ', 'database']
  ];
  function navHtml() {
    var items = NAV.filter(function (n) { return n === '-' || E.can(n[0], 'view'); });
    // إزالة الفواصل المتتالية/الطرفية
    var out = [];
    items.forEach(function (n) { if (n === '-' && (!out.length || out[out.length - 1] === '-')) return; out.push(n); });
    if (out[out.length - 1] === '-') out.pop();
    return out.map(function (n) { return n === '-' ? '<hr>' : '<a href="#/' + n[0] + '" data-page="' + n[0] + '">' + E.icon(n[2]) + '<span>' + n[1] + '</span></a>'; }).join('');
  }

  function shell() {
    var s = Store.data.settings || {};
    var logo = s.logo ? E.assetSrc(s.logo) : '';
    document.getElementById('root').innerHTML =
      '<div class="app"><aside class="side" id="side" aria-label="القائمة الرئيسية">' +
      '<a class="brand" href="#/overview"><span class="brand-mark">' + (logo ? '<img alt="" src="' + esc(logo) + '">' : '<img alt="" src="/dashboard/favicon.png" style="width:100%;height:100%;object-fit:contain;">') + '</span><span><b>' + esc(s.name || 'Efhamha') + '</b><small>Dashboard</small></span></a>' +
      '<nav class="nav">' + navHtml() + '</nav>' +
      '<div class="side-foot">' + esc(s.tagline || 'مش هنحفظك المنهج.. هنفهمهولك.') + (E.me ? '<div style="margin-top:8px;opacity:.9"><b>' + esc(E.me.user.displayName) + '</b><br><small>' + esc(E.me.user.roleLabel) + '</small></div>' : '') + '</div></aside>' +
      '<div class="scrim"></div>' +
      '<div class="main"><header class="top">' +
      '<button class="icon-btn menu-btn" id="menu-btn" aria-label="فتح القائمة" aria-controls="side">' + E.icon('menu') + '</button>' +
      '<div class="search-box">' + E.icon('search') + '<input type="search" id="gsearch" placeholder="بحث سريع… (اضغط /)" aria-label="بحث سريع" autocomplete="off"><div class="search-results" id="gres" hidden></div></div>' +
      '<span class="grow"></span><span id="status"></span>' +
      '<button class="chip hide-s" id="mode-chip" type="button"></button>' +
      '<button class="icon-btn" id="theme-btn" aria-label="تبديل الثيم"></button>' +
      '<button class="icon-btn" id="logout-btn" aria-label="تسجيل الخروج" hidden>' + E.icon('logout') + '</button>' +
      '</header><main class="content" id="content"></main></div></div>';
    E.theme.apply();
    var side = E.$('#side'), scrim = E.$('.scrim');
    E.$('#menu-btn').onclick = function () { side.classList.add('open'); scrim.classList.add('show'); };
    scrim.onclick = function () { side.classList.remove('open'); scrim.classList.remove('show'); };
    E.$('#theme-btn').onclick = function () { E.theme.toggle(); };
    var lo = E.$('#logout-btn');
    if (Store.mode === 'server') {
      lo.hidden = false; if (E.me) lo.setAttribute('aria-label', 'تسجيل الخروج (' + E.me.user.displayName + ')');
      lo.onclick = function () {
        if (E.hasUnsaved()) { E.toast('انتظر اكتمال الحفظ قبل الخروج', { type: 'error' }); return; }
        Store.api('POST', '/logout', {}).finally(function () { location.replace('/login.html'); });
      };
    }
    status();
    initSearch();
  }

  function status() {
    var el = E.$('#status'), mc = E.$('#mode-chip');
    if (!el) return;
    var h;
    if (Store.saving) h = '<span class="chip"><span class="spin"></span> جارٍ الحفظ</span>';
    else if (Store.error) h = '<button class="chip err" type="button" id="retry">' + E.icon('alert') + ' فشل الحفظ — أعد المحاولة</button>';
    else if (Store.dirty) h = '<span class="chip warn">تعديلات قيد الحفظ</span>';
    else h = '<span class="chip ok">' + E.icon('check') + ' محفوظ' + (Store.lastSaved ? ' ' + esc(E.fmtTime(Store.lastSaved)) : '') + '</span>';
    el.innerHTML = h;
    var r = E.$('#retry'); if (r) r.onclick = function () { Store.save(); };
    mc.className = 'chip hide-s ' + (Store.mode === 'server' ? 'ok' : 'warn');
    mc.textContent = Store.mode === 'server' ? 'متصل بالخادم' : 'وضع محلي';
    mc.onclick = function () { E.Router.go('#/data'); };
  }

  function localBanner() {
    if (Store.mode === 'server' || sessionStorage.getItem('efhamha:hide-banner')) return;
    var c = E.$('#content');
    var b = E.el('<div class="banner" role="note">' + E.icon('alert') + '<div><b>الوضع المحلي — غير محمي</b><br>البيانات محفوظة في هذا المتصفح فقط، ولا يوجد تسجيل دخول أو حماية حقيقية، ولا تظهر التعديلات في الموقع إلا بعد تصدير الملف أو تشغيل الخادم المرفق. لا تنشر هذه الواجهة للعامة بهذا الشكل.</div><button class="btn sm" type="button">إخفاء</button></div>');
    E.$('button', b).onclick = function () { sessionStorage.setItem('efhamha:hide-banner', '1'); b.remove(); };
    c.parentNode.insertBefore(b, c);
  }

  function initSearch() {
    var inp = E.$('#gsearch'), box = E.$('#gres'), idx = -1, items = [];
    function close() { box.hidden = true; idx = -1; }
    inp.addEventListener('input', function () {
      items = E.searchIndex(inp.value);
      if (!inp.value.trim()) { close(); return; }
      box.hidden = false;
      box.innerHTML = items.length ? items.map(function (x, i) { return '<a href="' + esc(x.hash) + '" data-i="' + i + '"><span>' + esc(x.label.length > 60 ? x.label.slice(0, 60) + '…' : x.label) + '</span><small>' + esc(x.type) + '</small></a>'; }).join('') : '<div class="empty-chart">لا توجد نتائج</div>';
    });
    inp.addEventListener('keydown', function (e) {
      var as = E.$$('a', box);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!as.length) return; idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + as.length) % as.length; as.forEach(function (a, i) { a.classList.toggle('on', i === idx); }); }
      else if (e.key === 'Enter' && as.length) { e.preventDefault(); (as[idx >= 0 ? idx : 0]).click(); }
      else if (e.key === 'Escape') { inp.value = ''; close(); inp.blur(); }
    });
    box.addEventListener('click', function () { setTimeout(function () { inp.value = ''; close(); }, 0); });
    document.addEventListener('click', function (e) { if (!e.target.closest('.search-box')) close(); });
  }

  /* ---------- login (وضع الخادم) ---------- */
  E.showLogin = function () {
    location.replace('/login.html?next=' + encodeURIComponent(location.pathname + location.search));
  };

  var started = false;
  function boot(force) {
    shell();
    if (!started) {
      started = true;
      Store.on(function () { status(); });
    }
    localBanner();
    if (!location.hash) {
      var first = NAV.filter(function (n) { return n !== '-' && E.can(n[0], 'view'); })[0];
      E.Router._skip = true; location.hash = '#/' + (first ? first[0] : 'overview');
    }
    E.Router.route();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('root');
    root.innerHTML = '<div class="boot" aria-busy="true"><div class="skel" style="height:56px"></div><div class="skel" style="height:140px"></div><div class="skel" style="height:260px"></div></div>';
    ED_inject();
    Store.init().then(function (r) {
      if (r === 'login') { root.innerHTML = ''; E.showLogin(); } else boot();
    }).catch(function (e) {
      root.innerHTML = '<div class="empty">' + E.icon('alert') + '<h3>تعذر تشغيل لوحة التحكم</h3><p>' + esc(e.message) + '</p><button class="btn primary" onclick="location.reload()">إعادة المحاولة</button></div>';
    });
  });
  function ED_inject() { window.EfhamhaData.injectStyles(); }
})();
