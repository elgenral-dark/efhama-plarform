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
    return out.map(function (n) {
      return n === '-' ? '<hr>' : '<a href="#/' + n[0] + '" data-page="' + n[0] + '" title="' + esc(n[1]) + '" aria-label="' + esc(n[1]) + '"><span class="nav-ico">' + E.icon(n[2]) + '</span><span class="nav-label"><span class="nav-text">' + esc(n[1]) + '</span></span></a>';
    }).join('');
  }

  var SIDEBAR_KEY = 'efhamha:sidebar';
  function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }

  function doLogout() {
    if (E.hasUnsaved()) { E.toast('انتظر اكتمال الحفظ قبل الخروج', { type: 'error' }); return; }
    Store.api('POST', '/logout', {}).finally(function () { location.hash = '#/overview'; location.reload(); });
  }

  function shell() {
    var s = Store.data.settings || {};
    var logo = s.logo ? E.assetSrc(s.logo) : '/assets/icons/favicon.svg';
    var server = Store.mode === 'server' && E.me;
    var uname = server ? E.me.user.displayName : 'مسؤول محلي';
    var initial = esc((uname || '?').trim().charAt(0));
    var collapsed = false; try { collapsed = localStorage.getItem(SIDEBAR_KEY) === 'collapsed'; } catch (e) { /* ignore */ }
    document.getElementById('root').innerHTML =
      '<div class="app' + (collapsed ? ' is-collapsed' : '') + '" id="app"><aside class="side" id="side" aria-label="القائمة الرئيسية">' +
      '<div class="side-top"><a class="brand" href="#/overview"><span class="brand-mark"><img alt="efhamha" src="' + esc(logo) + '"></span><span class="brand-text"><b>' + esc(s.name || 'efhamha') + '</b><small>لوحة التحكم</small></span></a></div>' +
      '<nav class="nav" aria-label="الأقسام">' + navHtml() + '</nav>' +
      '<div class="side-user">' +
      (server ? '<button class="side-logout" id="logout-btn" type="button" aria-label="تسجيل الخروج" title="تسجيل الخروج"><span class="nav-ico">' + E.icon('logout') + '</span><span class="nav-label"><span class="nav-text">تسجيل الخروج</span></span></button>'
        : '<div class="side-logout is-static" title="وضع محلي: بدون حساب أو حماية"><span class="nav-ico">' + E.icon('database') + '</span><span class="nav-label"><span class="nav-text">وضع محلي</span></span></div><button id="logout-btn" hidden></button>') +
      '</div></aside>' +
      '<div class="scrim"></div>' +
      '<div class="main"><header class="top">' +
      '<button class="top-btn" id="menu-btn" type="button" aria-label="القائمة" aria-controls="side" aria-expanded="' + (!collapsed) + '">' + E.icon('menu') + '</button>' +
      '<div class="search-box">' + E.icon('search') + '<input type="search" id="gsearch" placeholder="بحث…" aria-label="بحث سريع" autocomplete="off"><div class="search-results" id="gres" hidden></div></div>' +
      '<span class="grow"></span><span id="status"></span>' +
      '<button class="chip hide-s" id="mode-chip" type="button"></button>' +
      '<div class="top-actions"><span class="top-sep hide-s"></span>' +
      '<button class="top-btn" id="theme-btn" type="button" aria-label="تبديل الثيم"></button>' +
      '<div class="pop-wrap"><button class="top-btn" id="bell-btn" type="button" aria-label="الإشعارات" aria-haspopup="true" aria-expanded="false">' + E.icon('bell') + '<span class="dot" id="bell-dot" hidden></span></button><div class="pop" id="bell-pop" role="menu" hidden></div></div>' +
      '<div class="pop-wrap"><button class="profile-btn" id="profile-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="الحساب"><span class="avatar" aria-hidden="true">' + initial + '</span><span class="pname">' + esc(uname) + '</span>' + E.icon('down', 'chev') + '</button><div class="pop" id="profile-pop" role="menu" hidden></div></div>' +
      '</div></header><main class="content" id="content"></main></div></div>';
    E.theme.apply();
    var appEl = E.$('#app'), side = E.$('#side'), scrim = E.$('.scrim'), menu = E.$('#menu-btn');
    menu.onclick = function () {
      if (isMobile()) { side.classList.add('open'); scrim.classList.add('show'); return; }
      var c = appEl.classList.toggle('is-collapsed');
      menu.setAttribute('aria-expanded', String(!c));
      try { localStorage.setItem(SIDEBAR_KEY, c ? 'collapsed' : 'expanded'); } catch (e) { /* ignore */ }
    };
    scrim.onclick = function () { side.classList.remove('open'); scrim.classList.remove('show'); };
    E.$('#theme-btn').onclick = function () { E.theme.toggle(); };
    var lo = E.$('#logout-btn');
    if (server) lo.onclick = doLogout;
    initPops(uname, server);
    status();
    initSearch();
  }

  /* القوائم المنبثقة: الإشعارات والحساب */
  var popsReady = false;
  function closePops() {
    E.$$('.pop').forEach(function (p) { p.hidden = true; });
    E.$$('#bell-btn, #profile-btn').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }
  function bellHtml() {
    var checks = []; try { checks = E.healthChecks(); } catch (e) { checks = []; }
    var h = '<h4>الإشعارات</h4>';
    if (Store.error) h += '<button class="pop-item" type="button" data-retry>' + E.icon('alert') + '<span>فشل الحفظ — اضغط لإعادة المحاولة</span></button>';
    h += checks.length ? checks.map(function (x) { return '<a class="pop-item" href="' + x[2] + '">' + E.icon('alert') + '<span>' + esc(x[0]) + '</span><span class="badge warn cnt">' + E.num(x[1]) + '</span></a>'; }).join('')
      : (Store.error ? '' : '<div class="pop-empty">لا توجد تنبيهات. محتوى المنصة مكتمل.</div>');
    return h;
  }
  function initPops(uname, server) {
    var bell = E.$('#bell-btn'), bp = E.$('#bell-pop'), pb = E.$('#profile-btn'), pp = E.$('#profile-pop');
    function open(btn, pop, fill) { var was = !pop.hidden; closePops(); if (was) return; if (fill) fill(); pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
    bell.onclick = function (e) { e.stopPropagation(); open(bell, bp, function () { bp.innerHTML = bellHtml(); var r = E.$('[data-retry]', bp); if (r) r.onclick = function () { closePops(); Store.save(); }; }); };
    pb.onclick = function (e) {
      e.stopPropagation();
      open(pb, pp, function () {
        pp.innerHTML = '<div class="pop-who"><span class="avatar" aria-hidden="true">' + esc((uname || '?').trim().charAt(0)) + '</span><div><b>' + esc(uname) + '</b><small>' + esc(server ? E.me.user.roleLabel : 'وضع محلي — بدون حساب') + '</small></div></div>' +
          (server ? '<button class="pop-item" type="button" data-logout>' + E.icon('logout') + '<span>تسجيل الخروج</span></button>' : '<div class="pop-empty">لا يوجد تسجيل دخول في الوضع المحلي.</div>');
        var l = E.$('[data-logout]', pp); if (l) l.onclick = function () { closePops(); doLogout(); };
      });
    };
    bp.addEventListener('click', function (e) { if (e.target.closest('a')) closePops(); });
    if (!popsReady) {
      popsReady = true;
      document.addEventListener('click', function (e) { if (!e.target.closest('.pop-wrap')) closePops(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePops(); });
    }
  }

  var bellTimer = null;
  function updateBell() {
    clearTimeout(bellTimer);
    bellTimer = setTimeout(function () {
      var dot = E.$('#bell-dot'); if (!dot) return;
      var n = 0; try { n = E.healthChecks().length; } catch (e) { n = 0; }
      dot.hidden = !(n || Store.error);
    }, 300);
  }

  function status() {
    var el = E.$('#status'), mc = E.$('#mode-chip');
    if (!el) return;
    var h;
    if (Store.saving) h = '<span class="chip" title="جارٍ الحفظ"><span class="spin"></span><span class="chip-t">جارٍ الحفظ</span></span>';
    else if (Store.error) h = '<button class="chip err" type="button" id="retry" title="فشل الحفظ — أعد المحاولة">' + E.icon('alert') + '<span class="chip-t">فشل الحفظ — أعد المحاولة</span></button>';
    else if (Store.dirty) h = '<span class="chip warn" title="تعديلات قيد الحفظ"><span class="chip-t">تعديلات قيد الحفظ</span></span>';
    else h = '<span class="chip ok" title="محفوظ">' + E.icon('check') + '<span class="chip-t">محفوظ' + (Store.lastSaved ? ' ' + esc(E.fmtTime(Store.lastSaved)) : '') + '</span></span>';
    el.innerHTML = h;
    var r = E.$('#retry'); if (r) r.onclick = function () { Store.save(); };
    mc.className = 'chip hide-s ' + (Store.mode === 'server' ? 'ok' : 'warn');
    mc.textContent = Store.mode === 'server' ? 'متصل بالخادم' : 'وضع محلي';
    mc.onclick = function () { E.Router.go('#/data'); };
    updateBell();
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
    if (E.$('.login')) return;
    var d = E.el(
      '<div class="login">' +
        '<div class="login-backdrop-glow"></div>' +
        '<div class="login-box">' +
          '<div class="login-brand">' +
            '<div class="login-logo-wrap">' +
              '<img src="/assets/icons/favicon.svg" alt="efhamha" class="login-logo">' +
            '</div>' +
            '<h1 class="login-title">efhamha</h1>' +
            '<span class="login-badge">لوحة الإدارة</span>' +
            '<p class="login-desc">سجّل الدخول للوصول إلى أدوات التحكم وإدارة المحتوى والطلاب</p>' +
          '</div>' +
          '<form class="login-form">' +
            '<div class="field login-field">' +
              '<label for="un">اسم المستخدم</label>' +
              '<div class="input-wrap">' +
                E.icon('user') +
                '<input type="text" id="un" autocomplete="username" placeholder="admin" required>' +
              '</div>' +
            '</div>' +
            '<div class="field login-field">' +
              '<label for="pw">كلمة المرور</label>' +
              '<div class="input-wrap has-toggle">' +
                E.icon('lock') +
                '<input type="password" id="pw" autocomplete="current-password" placeholder="••••••••••••" required>' +
                '<button type="button" class="pw-toggle-btn" id="pw-toggle" aria-label="إظهار كلمة المرور" tabindex="-1">' +
                  E.icon('eye') +
                '</button>' +
              '</div>' +
            '</div>' +
            '<div class="err login-err" role="alert"></div>' +
            '<button class="btn primary login-submit-btn" type="submit">' +
              '<span>تسجيل الدخول</span>' +
              '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
            '</button>' +
          '</form>' +
          '<div class="login-foot">' +
            '<span>Learn to code, stage by stage</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    document.body.appendChild(d);
    var f = E.$('form', d), pw = E.$('#pw', d), err = E.$('.err', d), toggle = E.$('#pw-toggle', d);
    E.$('#un', d).focus();
    if (toggle && pw) {
      toggle.addEventListener('click', function () {
        var isText = pw.type === 'text';
        pw.type = isText ? 'password' : 'text';
        toggle.setAttribute('aria-label', isText ? 'إظهار كلمة المرور' : 'إخفاء كلمة المرور');
        toggle.innerHTML = E.icon(isText ? 'eye' : 'eyeOff');
        pw.focus();
      });
    }
    f.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = '';
      var b = E.$('button[type="submit"]', f); b.disabled = true;
      b.classList.add('loading');
      var uname = E.$('#un', d).value.trim();
      var pwval = pw.value;
      Store.api('POST', '/login', { username: uname, password: pwval }).then(function (resp) {
        Store.authenticated = true; d.remove();
        // في حال كان المستخدم ليس من فريق العمل (admin/instructor/etc) → أعد عرض رسالة
        return Store.loadMe().then(function () {
          return Store.load();
        }).then(function () {
          boot(true);
        });
      }).catch(function (er) {
        err.textContent = er.message || 'تعذر تسجيل الدخول';
        pw.value = '';
        pw.focus();
      }).finally(function () {
        b.disabled = false;
        b.classList.remove('loading');
      });
    });
  };

  var started = false;
  function boot(force) {
    shell();
    if (!started) {
      started = true;
      Store.on(function () { status(); });
    }
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
      root.innerHTML = '<div class="login"><div class="login-backdrop-glow"></div><div class="login-box" style="text-align:center;padding:40px 32px">' +
        '<div class="login-logo-wrap" style="margin:0 auto 16px"><img src="/assets/icons/favicon.svg" class="login-logo" alt="efhamha"></div>' +
        '<h2 style="margin:0 0 8px">تعذر الاتصال</h2>' +
        '<p style="color:var(--muted);font-size:14px;margin:0 0 20px">تعذر الاتصال بخادم المنصة. تأكد من تشغيل الخادم وحاول مجدداً.</p>' +
        '<p style="font-size:12px;color:var(--muted);direction:ltr;text-align:left;background:var(--surface-2);padding:10px;border-radius:8px;margin:0 0 20px">' + esc(e.message) + '</p>' +
        '<button class="btn primary" style="width:100%" onclick="location.reload()">إعادة المحاولة</button>' +
        '</div></div>';
    });
  });
  function ED_inject() { window.EfhamhaData.injectStyles(); }
})();
