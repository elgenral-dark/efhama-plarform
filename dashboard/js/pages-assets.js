(function () {
  'use strict';
  var E = window.Efhama, esc = E.esc, Store = E.Store;

  var TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
  var MAX = 10 * 1024 * 1024;
  var CATS = [{ v: 'general', l: 'عام' }, { v: 'diagrams', l: 'رسومات تعليمية' }, { v: 'images', l: 'صور' }, { v: 'paths', l: 'مسارات' }, { v: 'projects', l: 'مشروعات' }, { v: 'logos', l: 'شعارات وأيقونات' }];

  function readFile(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(new Error('تعذر قراءة الملف')); };
      r.readAsDataURL(file);
    });
  }
  function dims(url) {
    return new Promise(function (res) {
      var i = new Image();
      i.onload = function () { res({ width: i.naturalWidth, height: i.naturalHeight }); };
      i.onerror = function () { res({ width: 0, height: 0 }); };
      i.src = url;
    });
  }
  function checkFile(file) {
    if (!TYPES[file.type]) throw new Error('الصيغة غير مدعومة (' + file.name + '). المسموح: SVG وPNG وJPG وWebP.');
    if (file.size > MAX) throw new Error('الملف أكبر من 10MB (' + file.name + ').');
  }
  /* يحفظ الملف كما هو دون ضغط أو تغيير للجودة */
  function store(file) {
    checkFile(file);
    return readFile(file).then(function (dataUrl) {
      return dims(dataUrl).then(function (d) {
        if (Store.mode === 'server') {
          return Store.api('POST', '/upload', { name: file.name, dataUrl: dataUrl }).then(function (r) { return { src: r.url, d: d }; });
        }
        return { src: dataUrl, d: d };
      });
    });
  }
  function dropServerFile(url) {
    if (Store.mode !== 'server' || !url || url.indexOf('/uploads/') !== 0) return;
    Store.api('DELETE', '/upload?file=' + encodeURIComponent(url.split('/').pop())).catch(function () { /* best effort */ });
  }

  E.uploadAsset = function (file, o) {
    o = o || {};
    return store(file).then(function (r) {
      var a = {
        id: Store.newId('a'), name: file.name.replace(/\.[^.]+$/, ''), category: o.category || 'general', src: r.src, darkSrc: '',
        type: TYPES[file.type], size: file.size, width: r.d.width, height: r.d.height, alt: '', lessonIds: [], createdAt: new Date().toISOString()
      };
      Store.update(function (d) { Store.list('assets', d).push(a); });
      return a;
    });
  };

  E.pickAsset = function () {
    return new Promise(function (resolve) {
      var chosen = null;
      var body = E.el('<div><div class="toolbar"><div class="search">' + E.icon('search') + '<input type="search" placeholder="بحث في المكتبة…"></div>' +
        '<button type="button" class="btn" data-up>' + E.icon('upload') + ' رفع صورة جديدة</button><input type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml"></div><div data-grid></div></div>');
      var m;
      function draw() {
        var q = E.$('input[type=search]', body).value.trim().toLowerCase();
        var list = Store.list('assets').filter(function (a) { return !q || a.name.toLowerCase().indexOf(q) !== -1; });
        E.$('[data-grid]', body).innerHTML = list.length ? '<div class="assets-grid" style="padding:0">' + list.map(function (a) {
          return '<button type="button" class="asset" data-id="' + a.id + '"><div class="th"><img alt="" src="' + esc(E.assetSrc(a.id)) + '"></div><div class="in"><b>' + esc(a.name) + '</b></div></button>';
        }).join('') + '</div>' : '<div class="empty">' + E.icon('image') + '<h3>المكتبة فارغة</h3><p>ارفع أول صورة لتظهر هنا.</p></div>';
      }
      body.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.up != null) E.$('input[type=file]', body).click();
        if (b.dataset.id) { chosen = b.dataset.id; m.close(true); }
      });
      E.$('input[type=search]', body).addEventListener('input', draw);
      E.$('input[type=file]', body).addEventListener('change', function (e) {
        var f = e.target.files[0]; e.target.value = ''; if (!f) return;
        E.uploadAsset(f, {}).then(function (a) { chosen = a.id; m.close(true); }).catch(function (er) { E.toast(er.message, { type: 'error' }); });
      });
      m = E.modal({ title: 'اختيار من المكتبة', size: 'lg', body: body, footer: [{ label: 'إلغاء' }] });
      draw();
      m.done.then(function () { resolve(chosen); });
    });
  };

  function editAsset(a) {
    var usage = Store.assetUsage(a.id);
    return E.formModal({
      title: 'تعديل الرسم', size: 'lg', values: E.clone(a),
      fields: [
        { key: 'name', label: 'اسم الرسم', type: 'text', required: true },
        { key: 'category', label: 'التصنيف', type: 'select', options: CATS },
        { key: 'alt', label: 'نص بديل', type: 'text', wide: true, hint: 'يصف الصورة لقارئات الشاشة.' },
        { key: 'lessonIds', label: 'الدروس المرتبطة', type: 'refs', wide: true, emptyText: 'لا توجد دروس بعد', options: function () { return Store.list('lessons').map(function (l) { return { v: l.id, l: l.title }; }); } },
        {
          key: 'src', label: 'الملفات', type: 'custom', wide: true,
          render: function (slot, values, changed) {
            function draw() {
              slot.innerHTML = '<div class="grid-2"><div class="stack"><b>النسخة الفاتحة</b><div class="imgfield"><div class="pv"><img alt="" src="' + esc(values.src) + '"></div><div class="acts"><button type="button" class="btn sm" data-r="src">' + E.icon('upload') + ' استبدال الصورة</button></div></div>' +
                '<span class="hint">' + esc((values.type || '').toUpperCase()) + (values.width ? ' · ' + values.width + '×' + values.height : '') + (values.size ? ' · ' + E.fmtSize(values.size) : '') + '</span></div>' +
                '<div class="stack"><b>النسخة الداكنة (اختيارية)</b><div class="imgfield"><div class="pv">' + (values.darkSrc ? '<img alt="" src="' + esc(values.darkSrc) + '">' : 'غير مضافة') + '</div><div class="acts"><button type="button" class="btn sm" data-r="darkSrc">' + E.icon('upload') + ' ' + (values.darkSrc ? 'استبدال' : 'رفع نسخة داكنة') + '</button>' +
                (values.darkSrc ? '<button type="button" class="btn sm ghost" data-r="clear">إزالة</button>' : '') + '</div></div><span class="hint">تُعرض تلقائيًا عندما يكون الموقع في الوضع الداكن.</span></div></div>' +
                '<input type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml">' +
                (usage.length ? '<p class="hint" style="margin-top:10px">مستخدمة في: ' + esc(usage.slice(0, 6).join('، ')) + (usage.length > 6 ? '…' : '') + '</p>' : '<p class="hint" style="margin-top:10px">غير مستخدمة في أي مكان حاليًا.</p>');
            }
            var which = null;
            slot.addEventListener('click', function (e) {
              var b = e.target.closest('[data-r]'); if (!b) return;
              if (b.dataset.r === 'clear') { dropServerFile(values.darkSrc); values.darkSrc = ''; changed(); draw(); return; }
              which = b.dataset.r; E.$('input[type=file]', slot).click();
            });
            slot.addEventListener('change', function (e) {
              if (e.target.type !== 'file') return;
              var f = e.target.files[0]; e.target.value = ''; if (!f) return;
              store(f).then(function (r) {
                var old = values[which];
                values[which] = r.src;
                if (which === 'src') { values.type = TYPES[f.type]; values.size = f.size; values.width = r.d.width; values.height = r.d.height; }
                if (old && old !== r.src) dropServerFile(old);
                changed(); draw();
              }).catch(function (er) { E.toast(er.message, { type: 'error' }); });
            });
            draw();
          }
        }
      ],
      extraButtons: [{
        label: E.icon('trash') + ' حذف', push: true,
        onClick: function (vals, ctx) {
          var msg = usage.length ? 'هذه الصورة مستخدمة في: ' + usage.slice(0, 4).join('، ') + (usage.length > 4 ? '…' : '') + '. سيتم إزالتها من هذه الأماكن.' : '';
          E.confirm({ title: 'حذف الرسم', message: 'سيتم حذف «' + a.name + '». ' + msg, confirmText: 'حذف', danger: true }).then(function (ok) {
            if (!ok) return;
            var snap = Store.snapshot();
            var removed = Store.remove('assets', a.id);
            if (removed) { dropServerFile(removed.src); dropServerFile(removed.darkSrc); }
            ctx.close(true);
            E.toast('تم حذف الرسم', { type: 'success', action: { label: 'تراجع', onClick: function () { Store.restore(snap); } } });
            E.Router.refresh();
          });
        }
      }],
      onSave: function (v) {
        Store.update(function (d) {
          var arr = Store.list('assets', d), i = arr.findIndex(function (x) { return x.id === a.id; });
          arr[i] = Object.assign({}, arr[i], v);
        });
        E.toast('تم حفظ بيانات الرسم', { type: 'success' });
        E.Router.refresh();
      }
    });
  }

  E.page('assets', {
    title: 'مكتبة الرسومات',
    render: function (container, ctx) {
      var st = { q: '', cat: '', unused: false };
      container.innerHTML = '<div class="page-head"><div><h1>مكتبة الرسومات</h1><p class="sub">ارفع الرسومات والإنفوجرافيك وارتبط بها من الدروس. تُحفظ الصور بجودتها الأصلية.</p></div>' +
        '<div class="acts"><button class="btn" data-clean>' + E.icon('trash') + ' حذف غير المستخدم</button><button class="btn primary" data-up>' + E.icon('upload') + ' رفع رسومات</button></div></div>' +
        '<input type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/svg+xml">' +
        '<div class="toolbar"><div class="search">' + E.icon('search') + '<input type="search" placeholder="بحث في الرسومات…" aria-label="بحث"></div>' +
        '<select data-cat aria-label="التصنيف"><option value="">كل التصنيفات</option>' + CATS.map(function (c) { return '<option value="' + c.v + '">' + c.l + '</option>'; }).join('') + '</select>' +
        '<label class="switch"><input type="checkbox" data-unused><span class="track"></span><span>غير المستخدمة فقط</span></label></div>' +
        '<div class="panel"><div class="dropzone" data-drop>اسحب الصور وأفلتها هنا (SVG · PNG · JPG · WebP، حتى 10MB للملف)</div><div data-grid></div></div>';
      var grid = E.$('[data-grid]', container), fileIn = E.$('input[type=file]', container);

      function draw() {
        var all = Store.list('assets');
        var list = all.filter(function (a) {
          if (st.q && (a.name + ' ' + (a.alt || '')).toLowerCase().indexOf(st.q) === -1) return false;
          if (st.cat && a.category !== st.cat) return false;
          if (st.unused && Store.assetUsage(a.id).length) return false;
          return true;
        });
        if (!all.length) { grid.innerHTML = '<div class="empty">' + E.icon('image') + '<h3>المكتبة فارغة</h3><p>ارفع أول رسم تعليمي لتستخدمه في الدروس.</p><button class="btn primary" data-up>' + E.icon('upload') + ' رفع رسومات</button></div>'; return; }
        if (!list.length) { grid.innerHTML = '<div class="empty">' + E.icon('search') + '<h3>لا توجد نتائج</h3><p>غيّر البحث أو الفلاتر.</p></div>'; return; }
        grid.innerHTML = '<div class="assets-grid">' + list.map(function (a) {
          var n = Store.assetUsage(a.id).length;
          return '<button type="button" class="asset" data-id="' + a.id + '"><div class="th"><img alt="" src="' + esc(E.assetSrc(a.id)) + '"></div><div class="in"><b title="' + esc(a.name) + '">' + esc(a.name) + '</b>' +
            '<span class="t-sub">' + esc((a.type || '').toUpperCase()) + (a.size ? ' · ' + E.fmtSize(a.size) : '') + '</span>' +
            '<span>' + (n ? '<span class="badge ok">مستخدمة (' + n + ')</span>' : '<span class="badge warn">غير مستخدمة</span>') + (a.darkSrc ? ' <span class="badge brand">داكن</span>' : '') + '</span></div></button>';
        }).join('') + '</div>';
      }

      function upload(files) {
        files = Array.prototype.slice.call(files); if (!files.length) return;
        var ok = 0;
        grid.insertAdjacentHTML('afterbegin', '<div class="chip" data-busy style="margin:16px"><span class="spin"></span> جارٍ رفع ' + files.length + ' ملف…</div>');
        files.reduce(function (p, f) {
          return p.then(function () { return E.uploadAsset(f, { category: st.cat || 'general' }).then(function () { ok++; }).catch(function (er) { E.toast(er.message, { type: 'error' }); }); });
        }, Promise.resolve()).then(function () {
          if (ok) E.toast('تم رفع ' + ok + ' ملف', { type: 'success' });
          draw();
        });
      }

      container.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.up != null) fileIn.click();
        else if (b.dataset.id) editAsset(Store.byId('assets', b.dataset.id));
        else if (b.dataset.clean != null) {
          var un = Store.list('assets').filter(function (a) { return !Store.assetUsage(a.id).length; });
          if (!un.length) { E.toast('لا توجد صور غير مستخدمة'); return; }
          E.confirm({ title: 'حذف الصور غير المستخدمة', message: 'سيتم حذف ' + un.length + ' صورة غير مستخدمة في أي درس أو مشروع أو إعداد: ' + un.slice(0, 5).map(function (a) { return a.name; }).join('، ') + (un.length > 5 ? '…' : ''), confirmText: 'حذف ' + un.length, danger: true }).then(function (ok) {
            if (!ok) return;
            var snap = Store.snapshot();
            un.forEach(function (a) { var r = Store.remove('assets', a.id); if (r) { dropServerFile(r.src); dropServerFile(r.darkSrc); } });
            E.toast('تم حذف ' + un.length + ' صورة', { type: 'success', action: { label: 'تراجع', onClick: function () { Store.restore(snap); } } });
            draw();
          });
        }
      });
      fileIn.addEventListener('change', function () { var f = fileIn.files; upload(f); fileIn.value = ''; });
      var dz = E.$('[data-drop]', container);
      ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
      dz.addEventListener('drop', function (e) { upload(e.dataTransfer.files); });
      E.$('input[type=search]', container).addEventListener('input', function (e) { st.q = e.target.value.trim().toLowerCase(); draw(); });
      E.$('[data-cat]', container).addEventListener('change', function (e) { st.cat = e.target.value; draw(); });
      E.$('[data-unused]', container).addEventListener('change', function (e) { st.unused = e.target.checked; draw(); });
      draw();
      if (ctx.params.edit) { var a = Store.byId('assets', ctx.params.edit); if (a) editAsset(a); }
    }
  });
})();
