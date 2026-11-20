(function () {
  'use strict';
  var E = (window.Efhamha = window.Efhamha || {});
  var ED = window.EfhamhaData;

  /* ---------- helpers ---------- */
  E.esc = ED.esc;
  E.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  E.$ = function (s, r) { return (r || document).querySelector(s); };
  E.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  E.el = function (html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  E.getPath = function (o, p) { return String(p).split('.').reduce(function (a, k) { return a == null ? undefined : a[k]; }, o); };
  E.setPath = function (o, p, v) {
    var ks = String(p).split('.'), c = o;
    ks.slice(0, -1).forEach(function (k) { if (typeof c[k] !== 'object' || c[k] == null) c[k] = {}; c = c[k]; });
    c[ks[ks.length - 1]] = v;
  };
  E.num = function (n) { return Number(n || 0).toLocaleString('en-US'); };
  E.fmtDate = function (d) { try { return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return ''; } };
  E.fmtTime = function (d) { try { return new Date(d).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
  E.fmtSize = function (b) { if (!b) return ''; return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; };
  E.LEVELS = ED.LEVELS; E.QTYPES = ED.QTYPES;
  E.levelOptions = [{ v: 'beginner', l: 'مبتدئ' }, { v: 'intermediate', l: 'متوسط' }, { v: 'advanced', l: 'متقدم' }];
  E.statusOptions = [{ v: 'draft', l: 'مسودة' }, { v: 'published', l: 'منشور' }];
  E.optLabel = function (opts, v) { var o = opts.filter(function (x) { return x.v === v; })[0]; return o ? o.l : (v || ''); };

  /* ---------- icons ---------- */
  var P = {
    home: 'M3 11l9-8 9 8M5 10v10h14V10',
    route: 'M5 4h4v4H5zM15 16h4v4h-4zM7 8v4a4 4 0 004 4h4',
    layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
    book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13',
    help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 3.5M12 17h.01',
    clipboard: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M9 13l2 2 4-4',
    briefcase: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18',
    image: 'M3 5h18v14H3zM8 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM21 16l-5-5-9 8',
    glossary: 'M4 4h12a4 4 0 014 4v12H8a4 4 0 01-4-4V4zM9 9h6M9 13h4',
    trophy: 'M8 4h8v5a4 4 0 01-8 0V4zM8 6H4v1a3 3 0 003 3M16 6h4v1a3 3 0 01-3 3M12 13v4M8 20h8',
    gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14 3h-4l-.4 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2L10 21h4l.4-2.7a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
    database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
    plus: 'M12 5v14M5 12h14',
    edit: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
    menu: 'M4 6h16M4 12h16M4 18h16',
    x: 'M6 6l12 12M18 6L6 18',
    sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
    up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
    eyeOff: 'M17.94 17.94A10.07 10.07 0 0112 19c-7 0-10-7-10-7a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 5c7 0 10 7 10 7a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22',
    copy: 'M8 8h12v12H8zM4 16V4h12',
    download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
    upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
    check: 'M5 12l5 5 9-10',
    alert: 'M12 3l10 18H2L12 3zM12 10v5M12 18h.01',
    logout: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',
    arrow: 'M19 12H5M11 6l-6 6 6 6',
    link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
    wallet: 'M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 7l12-3v3M17 14h2',
    sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z',
    history: 'M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 3v5h5M12 7v5l3 2',
    users: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.9M16 4.2a3.5 3.5 0 010 6.6',
    chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
    lock: 'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zm-12 0V7a5 5 0 0110 0v4',
    user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
    clock: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm.5-13H11v6l5.2 3.1.8-1.3-4.5-2.7V7z',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4',
    cert: 'M5 4h14v12H5zM9 20l3-2 3 2v-4M8 8h8M8 11h5',
    bell: 'M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0'
  };
  E.icon = function (n, extra) {
    return '<svg class="i ' + (extra || '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (P[n] || P.alert) + '"/></svg>';
  };

  /* ---------- unsaved-changes registry ---------- */
  E.dirtyChecks = new Set();
  E.hasUnsaved = function () {
    var d = E.Store && E.Store.dirty;
    E.dirtyChecks.forEach(function (f) { try { if (f()) d = true; } catch (e) { /* ignore */ } });
    if (E.Router && E.Router.guard && E.Router.guard.dirty()) d = true;
    return d;
  };
  window.addEventListener('beforeunload', function (e) {
    if (E.hasUnsaved()) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- toast ---------- */
  E.toast = function (msg, o) {
    o = o || {};
    var box = E.$('#toasts');
    var t = E.el('<div class="toast ' + (o.type || '') + '" role="status"><span>' + E.esc(msg) + '</span></div>');
    if (o.action) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = o.action.label;
      b.onclick = function () { o.action.onClick(); t.remove(); };
      t.appendChild(b);
    }
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, o.timeout || (o.action ? 8000 : o.type === 'error' ? 7000 : 3500));
  };

  /* ---------- modal ---------- */
  var zBase = 1000, stack = [];
  E.modal = function (o) {
    var prevFocus = document.activeElement;
    var back = document.createElement('div');
    back.className = 'modal-back'; back.style.zIndex = ++zBase;
    var m = document.createElement('div');
    m.className = 'modal ' + (o.size || '');
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="modal-head"><h2></h2><button type="button" class="icon-btn" data-x aria-label="إغلاق">' + E.icon('x') + '</button></div><div class="modal-body"></div><div class="modal-foot"></div>';
    E.$('h2', m).textContent = o.title || '';
    var body = E.$('.modal-body', m), foot = E.$('.modal-foot', m);
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    var closed = false, resolveFn;
    var done = new Promise(function (r) { resolveFn = r; });
    var ctx = {
      el: m, body: body,
      close: function (force) {
        if (closed) return Promise.resolve();
        return Promise.resolve(!force && o.onBeforeClose ? o.onBeforeClose() : true).then(function (ok) {
          if (ok === false || closed) return;
          closed = true; back.remove();
          stack.splice(stack.indexOf(ctx), 1);
          if (!stack.length) document.body.classList.remove('lock');
          if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* ignore */ }
          resolveFn();
        });
      },
      setBusy: function (b) {
        E.$$('button', foot).forEach(function (x) { x.disabled = b; });
        var p = E.$('.primary', foot);
        if (p) { if (b) { p.dataset.l = p.innerHTML; p.innerHTML = '<span class="spin"></span> جارٍ الحفظ'; } else if (p.dataset.l) { p.innerHTML = p.dataset.l; } }
      },
      done: done
    };
    (o.footer || []).forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn ' + (f.cls || ''); b.innerHTML = f.label;
      if (f.push) b.classList.add('push');
      b.onclick = function () {
        Promise.resolve(f.onClick ? f.onClick(ctx) : undefined).then(function (r) {
          if (r !== false && f.close !== false) ctx.close(true);
        });
      };
      foot.appendChild(b);
    });
    if (!(o.footer || []).length) foot.remove();
    E.$('[data-x]', m).onclick = function () { ctx.close(); };
    back.addEventListener('mousedown', function (e) { if (e.target === back) ctx.close(); });
    back.appendChild(m); document.body.appendChild(back);
    document.body.classList.add('lock');
    stack.push(ctx);
    var first = E.$('input:not([type=hidden]):not([type=file]), textarea, select', body);
    setTimeout(function () { (first || E.$('[data-x]', m)).focus(); }, 30);
    return ctx;
  };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && stack.length) { stack[stack.length - 1].close(); }
    if (e.key === 'Tab' && stack.length) {
      var m = stack[stack.length - 1].el;
      var f = E.$$('button:not([disabled]), input:not([type=hidden]):not([disabled]), select, textarea, a[href]', m).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  E.confirm = function (o) {
    return new Promise(function (res) {
      var ok = false;
      var m = E.modal({
        title: o.title || 'تأكيد', size: 'sm',
        body: '<p>' + E.esc(o.message || '') + '</p>',
        footer: [
          { label: E.esc(o.confirmText || 'تأكيد'), cls: o.danger ? 'danger' : 'primary', onClick: function () { ok = true; } },
          { label: 'إلغاء' }
        ]
      });
      m.done.then(function () { res(ok); });
    });
  };
  E.prompt = function (o) {
    return new Promise(function (res) {
      var val = null;
      var body = E.el('<div class="field"><label>' + E.esc(o.label || '') + '</label><input type="text" dir="auto"></div>');
      var inp = E.$('input', body); inp.value = o.value || ''; inp.placeholder = o.placeholder || '';
      var m = E.modal({
        title: o.title || '', size: 'sm', body: body,
        footer: [{ label: 'تأكيد', cls: 'primary', onClick: function () { val = inp.value.trim(); } }, { label: 'إلغاء' }]
      });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { val = inp.value.trim(); m.close(true); } });
      m.done.then(function () { res(val); });
    });
  };

  /* ---------- store ---------- */
  var COLLECTIONS = ['paths', 'modules', 'lessons', 'questions', 'quizzes', 'projects', 'assets', 'glossary',
    'gamification.xpRules', 'gamification.levels', 'gamification.badges', 'gamification.encouragements', 'gamification.dailyChallenges'];
  E.COLLECTIONS = COLLECTIONS;
  var ASSET_SETTING_KEYS = ['logo', 'icon', 'pwa.icon192', 'pwa.icon512'];

  function migrate(d) {
    d = d && typeof d === 'object' ? d : {};
    d.schemaVersion = ED.SCHEMA_VERSION;
    d.settings = d.settings || {};
    COLLECTIONS.forEach(function (c) { if (!Array.isArray(E.getPath(d, c))) E.setPath(d, c, []); });
    d.gamification = d.gamification || {};
    d.gamification.rules = d.gamification.rules || {};
    d.usage = d.usage || {};
    ['completions', 'quizResults', 'achievements'].forEach(function (k) { if (!Array.isArray(d.usage[k])) d.usage[k] = []; });
    d.rev = Number(d.rev) || 0;
    d.lessons.forEach(function (l) {
      ['objectives', 'prerequisites', 'blocks'].forEach(function (k) { if (!Array.isArray(l[k])) l[k] = []; });
      l.blocks.forEach(function (b) { if (!b.id) b.id = 'b_' + Math.random().toString(36).slice(2, 9); });
    });
    d.glossary.forEach(function (t) { if (!Array.isArray(t.lessonIds)) t.lessonIds = []; });
    d.assets.forEach(function (a) { if (!Array.isArray(a.lessonIds)) a.lessonIds = []; });
    d.quizzes.forEach(function (q) { if (!Array.isArray(q.questionIds)) q.questionIds = []; });
    return d;
  }
  E.migrate = migrate;

  var Store = (E.Store = {
    data: null, mode: 'server', authRequired: true, authenticated: false,
    dirty: false, saving: false, lastSaved: null, error: null, _subs: [], _t: null, _ver: 0, _pending: false,
    on: function (fn) { this._subs.push(fn); },
    emit: function () { var s = this; this._subs.forEach(function (f) { try { f(s); } catch (e) { console.error(e); } }); },

    api: function (method, path, body) {
      var cfg = window.EFHAMHA_CONFIG || {};
      var opts = { method: method, credentials: 'same-origin', headers: { 'X-Requested-With': 'efhamha' } };
      if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
      return fetch((cfg.apiBase || '/api') + path, opts).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.status === 401) {
            Store.authenticated = false;
            if (path !== '/login' && E.showLogin) E.showLogin();
            throw new Error(j.error || (path === '/login' ? 'اسم المستخدم أو كلمة المرور غير صحيحة' : 'انتهت الجلسة، سجّل الدخول مرة أخرى'));
          }
          if (r.status === 403) {
            var err403 = new Error(j.message || 'ليست لديك الصلاحية المطلوبة');
            err403.status = 403;
            throw err403;
          }
          if (!r.ok) { var err = new Error(j.error || ('خطأ ' + r.status)); err.status = r.status; throw err; }
          return j;
        });
      });
    },

    init: function () {
      var s = this, cfg = window.EFHAMHA_CONFIG || {};
      s.mode = 'server';
      s.authRequired = true;
      return fetch((cfg.apiBase || '/api') + '/health', { credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) throw new Error('فشل التحقق من حالة الخادم (' + r.status + ')');
          return r.json();
        })
        .then(function (j) {
          if (!j || !j.efhamha) throw new Error('استجابة غير صالحة من خادم المنصة');
          s.authenticated = !!j.authenticated;
          if (!s.authenticated) return 'login';
          return s.loadMe().then(function () { return s.load(); }).then(function () { return 'ready'; });
        })
        .catch(function (err) {
          s.authenticated = false;
          throw err;
        });
    },
    loadMe: function () {
      var s = this;
      return s.api('GET', '/me').then(function (m) { E.me = m; });
    },
    load: function () {
      var s = this;
      return s.api('GET', '/data').then(function (d) { s.data = migrate(d); s.dirty = false; s.emit(); });
    },

    list: function (coll, d) {
      d = d || this.data;
      var v = E.getPath(d, coll);
      if (!Array.isArray(v)) { E.setPath(d, coll, []); v = E.getPath(d, coll); }
      return v;
    },
    byId: function (coll, id) { return this.list(coll).filter(function (x) { return x.id === id; })[0] || null; },
    newId: function (prefix) {
      var used = {}, s = this;
      COLLECTIONS.forEach(function (c) { s.list(c).forEach(function (x) { used[x.id] = 1; }); });
      var id;
      do { id = prefix + '_' + Math.random().toString(36).slice(2, 8); } while (used[id]);
      return id;
    },
    update: function (fn) {
      fn(this.data);
      this.data.updatedAt = new Date().toISOString();
      this._ver++; this.dirty = true; this.emit(); this.schedule();
    },
    schedule: function () { var s = this; clearTimeout(s._t); s._t = setTimeout(function () { s.save().catch(function () { /* toast shown */ }); }, 500); },
    save: function (throwErr) {
      var s = this;
      if (s.saving) { s._pending = true; return Promise.resolve(); }
      clearTimeout(s._t);
      s.saving = true; s.emit();
      var ver = s._ver;
      var op = s.api('PUT', '/data', s.data).then(function (r) { if (r && r.rev != null) s.data.rev = r.rev; });
      return op.then(function () {
        if (ver === s._ver) s.dirty = false;
        s.lastSaved = Date.now(); s.error = null;
      }).catch(function (e) {
        s.error = e.message || 'تعذر الحفظ';
        var msg = e.status === 409 ? 'تم تعديل البيانات من مكان آخر. أعد تحميل الصفحة لتجنب فقدان عمل الآخرين.' : 'تعذر الحفظ: ' + s.error;
        E.toast(msg, { type: 'error' });
        if (e.status === 403 || e.status === 422) { /* رفض من الخادم: نعيد البيانات الصحيحة بدل ترك نسخة محلية غير مقبولة */
          s.error = null; s.dirty = false;
          s.load().then(function () { if (E.Router) E.Router.refresh(); });
        }
        if (throwErr) throw e;
      }).then(function () {
        s.saving = false; s.emit();
        if (s._pending) { s._pending = false; return s.save(throwErr); }
      });
    },
    /* استبدال كامل وآمن: إن فشل الحفظ تعود البيانات القديمة */
    replaceAll: function (next) {
      var s = this, old = s.data, oldVer = s._ver;
      s.data = migrate(next); s._ver++; s.dirty = true;
      return s.save(true).then(function () {
        if (s.error) throw new Error(s.error);
        s.emit();
      }).catch(function (e) { s.data = old; s._ver = oldVer + 1; s.dirty = false; s.error = null; s.emit(); throw e; });
    },
    snapshot: function () { return E.clone(this.data); },
    restore: function (snap) {
      this.data = snap; this._ver++; this.dirty = true; this.emit(); this.schedule();
      if (E.Router) E.Router.refresh();
    },

    assetUsage: function (id) {
      var d = this.data, n = [];
      d.lessons.forEach(function (l) {
        (l.blocks || []).forEach(function (b) { if (b.image === id) n.push('درس: ' + l.title); });
      });
      d.projects.forEach(function (p) { if (p.image === id) n.push('مشروع: ' + p.title); });
      d.paths.forEach(function (p) { if (p.image === id) n.push('مسار: ' + p.name); });
      ASSET_SETTING_KEYS.forEach(function (k) { if (E.getPath(d.settings, k) === id) n.push('إعدادات المنصة'); });
      var a = d.assets.filter(function (x) { return x.id === id; })[0];
      if (a && (a.lessonIds || []).length) a.lessonIds.forEach(function (lid) {
        var l = d.lessons.filter(function (x) { return x.id === lid; })[0];
        if (l) n.push('مرتبط بدرس: ' + l.title);
      });
      return n;
    },

    remove: function (coll, id) {
      var s = this, removedAsset = null;
      this.update(function (d) {
        var L = function (c) { return s.list(c, d); };
        var rm = function (c, fn) { var a = L(c); for (var i = a.length - 1; i >= 0; i--) if (fn(a[i])) a.splice(i, 1); };
        var delLesson = function (lid) {
          rm('lessons', function (l) { return l.id === lid; });
          L('lessons').forEach(function (l) { l.prerequisites = (l.prerequisites || []).filter(function (x) { return x !== lid; }); });
          L('glossary').forEach(function (t) { t.lessonIds = (t.lessonIds || []).filter(function (x) { return x !== lid; }); });
          L('assets').forEach(function (a) { a.lessonIds = (a.lessonIds || []).filter(function (x) { return x !== lid; }); });
          L('questions').forEach(function (q) { if (q.lessonId === lid) q.lessonId = ''; });
        };
        var delModule = function (mid) {
          L('lessons').filter(function (l) { return l.moduleId === mid; }).map(function (l) { return l.id; }).forEach(delLesson);
          rm('modules', function (m) { return m.id === mid; });
          L('questions').forEach(function (q) { if (q.moduleId === mid) q.moduleId = ''; });
          L('quizzes').forEach(function (z) { if (z.moduleId === mid) z.moduleId = ''; });
        };
        switch (coll) {
          case 'paths':
            L('modules').filter(function (m) { return m.pathId === id; }).map(function (m) { return m.id; }).forEach(delModule);
            rm('paths', function (p) { return p.id === id; });
            ['questions', 'quizzes', 'projects', 'glossary'].forEach(function (c) { L(c).forEach(function (x) { if (x.pathId === id) x.pathId = ''; }); });
            break;
          case 'modules': delModule(id); break;
          case 'lessons': delLesson(id); break;
          case 'questions':
            rm('questions', function (q) { return q.id === id; });
            L('quizzes').forEach(function (z) { z.questionIds = (z.questionIds || []).filter(function (x) { return x !== id; }); });
            L('lessons').forEach(function (l) { l.blocks = (l.blocks || []).filter(function (b) { return !(b.type === 'question' && b.questionId === id); }); });
            break;
          case 'assets':
            removedAsset = L('assets').filter(function (a) { return a.id === id; })[0] || null;
            rm('assets', function (a) { return a.id === id; });
            L('lessons').forEach(function (l) { (l.blocks || []).forEach(function (b) { if (b.image === id) b.image = ''; }); });
            L('projects').forEach(function (p) { if (p.image === id) p.image = ''; });
            L('paths').forEach(function (p) { if (p.image === id) p.image = ''; });
            ASSET_SETTING_KEYS.forEach(function (k) { if (E.getPath(d.settings, k) === id) E.setPath(d.settings, k, ''); });
            break;
          default: rm(coll, function (x) { return x.id === id; });
        }
      });
      return removedAsset;
    }
  });

  E.assetSrc = function (v, theme) { return ED.imgUrl(Store.data, v, theme); };

  /* ---------- الصلاحيات (للواجهة فقط — الخادم هو المرجع الفعلي) ---------- */
  E.me = null;
  E.can = function (section, level) {
    if (!E.me || !E.me.perms) return false;
    var l = E.me.perms.sections[section];
    if (!l) return false;
    return level === 'edit' ? l === 'edit' : true;
  };
  E.flag = function (f) { return !!(E.me && E.me.perms && E.me.perms.flags.indexOf(f) !== -1); };
  E.needServer = function (c, what) {
    c.innerHTML = '<div class="empty panel">' + E.icon('database') + '<h3>يتطلب تشغيل الخادم</h3><p>' + E.esc(what) + ' يحتاج قاعدة بيانات مشتركة ومستخدمين وصلاحيات على الخادم، ولا يمكن تنفيذه في الوضع المحلي بشكل آمن. شغّل <code dir="ltr">node server/server.js</code> وسجّل الدخول (انظر README).</p></div>';
  };

  /* ---------- router ---------- */
  E.pages = {};
  E.page = function (name, def) { E.pages[name] = def; };
  var R = (E.Router = { current: '', guard: null, _skip: false });
  R.go = function (h) { location.hash = h; };
  R.refresh = function () { R.route(); };
  R.route = function () {
    var h = location.hash || '#/overview';
    var split = h.slice(2).split('?');
    var parts = split[0].split('/').filter(Boolean).map(decodeURIComponent);
    var name = parts[0] || 'overview';
    var page = E.pages[name];
    R.current = h; R.guard = null;
    var old = E.$('#content');
    var c = old.cloneNode(false); old.replaceWith(c); /* عنصر جديد يمنع تراكم المستمعات */
    E.$$('.nav a').forEach(function (a) { a.removeAttribute('aria-current'); if (a.dataset.page === name) a.setAttribute('aria-current', 'page'); });
    E.$('.side').classList.remove('open'); E.$('.scrim').classList.remove('show');
    c.innerHTML = '';
    window.scrollTo(0, 0);
    if (!page) { c.innerHTML = '<div class="empty panel">' + E.icon('alert') + '<h3>الصفحة غير موجودة</h3><a class="btn primary" href="#/overview">العودة للرئيسية</a></div>'; return; }
    if (!E.can(name, 'view')) { c.innerHTML = '<div class="empty panel">' + E.icon('alert') + '<h3>غير مصرّح</h3><p>ليست لديك صلاحية الدخول إلى هذا القسم.</p><a class="btn primary" href="#/overview">العودة للرئيسية</a></div>'; return; }
    document.title = page.title + ' · Efhamha Dashboard';
    try {
      page.render(c, { params: Object.fromEntries(new URLSearchParams(split[1] || '')), sub: parts.slice(1) });
    } catch (e) {
      console.error(e);
      c.innerHTML = '<div class="empty panel">' + E.icon('alert') + '<h3>حدث خطأ أثناء عرض الصفحة</h3><p>' + E.esc(e.message) + '</p></div>';
    }
  };
  window.addEventListener('hashchange', function () {
    if (R._skip) { R._skip = false; return; }
    var target = location.hash;
    if (R.guard && R.guard.dirty()) {
      R._skip = true; location.hash = R.current;
      E.confirm({ title: 'تعديلات غير محفوظة', message: 'لديك تعديلات لم تُحفظ بعد. إذا غادرت الآن ستفقدها.', confirmText: 'مغادرة بدون حفظ', danger: true }).then(function (ok) {
        if (!ok) return;
        if (R.guard && R.guard.discard) R.guard.discard();
        R.guard = null; location.hash = target;
      });
      return;
    }
    R.route();
  });

  /* ---------- theme ---------- */
  E.theme = {
    get: function () { return localStorage.getItem('efhamha:theme') || 'system'; },
    apply: function () {
      var t = this.get();
      var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      var b = E.$('#theme-btn');
      if (b) { b.innerHTML = E.icon(dark ? 'sun' : 'moon'); b.setAttribute('aria-label', dark ? 'الوضع الفاتح' : 'الوضع الداكن'); }
    },
    toggle: function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      localStorage.setItem('efhamha:theme', dark ? 'light' : 'dark'); this.apply();
    }
  };
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { E.theme.apply(); });
  E.theme.apply();

  /* ---------- download helper ---------- */
  E.download = function (name, obj) {
    var blob = new Blob([typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };

  /* ---------- search index ---------- */
  E.searchIndex = function (q) {
    q = q.trim().toLowerCase(); if (!q) return [];
    var d = Store.data, out = [];
    var add = function (type, page, id, label, sub) {
      if (String(label).toLowerCase().indexOf(q) !== -1 || String(sub || '').toLowerCase().indexOf(q) !== -1)
        out.push({ type: type, label: label, hash: page === 'lessons' ? '#/lessons/edit/' + id : '#/' + page + '?edit=' + id });
    };
    d.paths.forEach(function (x) { add('مسار', 'paths', x.id, x.name, x.description); });
    d.modules.forEach(function (x) { add('وحدة', 'modules', x.id, x.title, x.description); });
    d.lessons.forEach(function (x) { add('درس', 'lessons', x.id, x.title, x.summary); });
    d.questions.forEach(function (x) { add('سؤال', 'questions', x.id, x.text, ''); });
    d.quizzes.forEach(function (x) { add('اختبار', 'quizzes', x.id, x.title, ''); });
    d.projects.forEach(function (x) { add('مشروع', 'projects', x.id, x.title, x.description); });
    d.glossary.forEach(function (x) { add('مصطلح', 'glossary', x.id, x.ar, x.en); });
    d.assets.forEach(function (x) { add('رسم', 'assets', x.id, x.name, ''); });
    return out.slice(0, 9);
  };
})();
