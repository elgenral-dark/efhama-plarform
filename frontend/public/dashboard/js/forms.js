(function () {
  'use strict';
  var E = window.Efhama, esc = E.esc;

  function isEmpty(v) { return v == null || v === '' || (Array.isArray(v) && !v.length); }
  function opts(f, values) { return typeof f.options === 'function' ? f.options(values) : (f.options || []); }

  /*
   * fields: [{key, label, type, required, wide, hint, options, dependsOn:[keys], showIf(values), validate(value, values)}]
   * types: text textarea number select toggle lines tags refs image color url code note custom
   */
  E.buildForm = function (fields, initial, o) {
    o = o || {};
    var values = E.clone(initial || {});
    var root = document.createElement('div');
    root.className = 'form-grid';
    var items = [], dirty = false;

    function changed(key) {
      dirty = true;
      if (o.onDirty) o.onDirty();
      items.forEach(function (it) {
        if (it.f.dependsOn && it.f.dependsOn.indexOf(key) !== -1 && it.refresh) it.refresh();
        it.vis();
      });
      if (o.onChange) o.onChange(values, key);
    }

    fields.forEach(function (f) {
      var wrap = document.createElement('div');
      wrap.className = 'field' + (f.wide ? ' wide' : '');
      var id = 'f_' + Math.random().toString(36).slice(2, 8);
      var label = f.label && f.type !== 'toggle' ? '<label for="' + id + '">' + esc(f.label) + (f.required ? '<span class="req" aria-hidden="true">*</span>' : '') + '</label>' : '';
      var hint = f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '';
      var err = '<div class="err" role="alert"></div>';
      var it = { f: f, wrap: wrap };
      var cur = E.getPath(values, f.key);
      if (cur === undefined && f.default !== undefined && f.key) { E.setPath(values, f.key, E.clone(f.default)); cur = f.default; }
      var set = function (v) { E.setPath(values, f.key, v); changed(f.key); };

      if (f.type === 'note') {
        wrap.className = 'field wide';
        wrap.innerHTML = '<div class="note-static">' + esc(f.text) + '</div>';
      } else if (f.type === 'select') {
        wrap.innerHTML = label + '<select id="' + id + '"></select>' + hint + err;
        var sel = E.$('select', wrap);
        it.refresh = function () {
          var list = opts(f, values), v = E.getPath(values, f.key);
          sel.innerHTML = (f.empty ? '<option value="">' + esc(typeof f.empty === 'string' ? f.empty : '— اختر —') + '</option>' : '') +
            list.map(function (x) { return '<option value="' + esc(x.v) + '">' + esc(x.l) + '</option>'; }).join('');
          var ok = list.some(function (x) { return x.v === v; });
          if (ok) sel.value = v;
          else { sel.value = f.empty ? '' : (list[0] ? list[0].v : ''); if ((v || '') !== sel.value) E.setPath(values, f.key, sel.value); }
        };
        it.refresh();
        if (cur === undefined && !f.empty) E.setPath(values, f.key, sel.value);
        sel.addEventListener('change', function () { set(sel.value); });
      } else if (f.type === 'toggle') {
        wrap.innerHTML = '<label class="switch"><input type="checkbox" id="' + id + '"><span class="track"></span><span>' + esc(f.label) + '</span></label>' + hint + err;
        var cb = E.$('input', wrap);
        cb.checked = cur === undefined ? !!f.default : !!cur;
        if (f.locked) { cb.checked = true; cb.disabled = true; E.setPath(values, f.key, true); }
        cb.addEventListener('change', function () { set(cb.checked); });
      } else if (f.type === 'lines' || f.type === 'tags') {
        var multi = f.type === 'lines';
        wrap.innerHTML = label + (multi ? '<textarea id="' + id + '" dir="auto"></textarea>' : '<input type="text" id="' + id + '" dir="auto">') + hint + err;
        var ta = E.$('[id="' + id + '"]', wrap);
        if (f.placeholder) ta.placeholder = f.placeholder;
        ta.value = Array.isArray(cur) ? cur.join(multi ? '\n' : '، ') : '';
        ta.addEventListener('input', function () {
          set(ta.value.split(multi ? /\n/ : /[,،\n]/).map(function (x) { return x.trim(); }).filter(Boolean));
        });
      } else if (f.type === 'refs') {
        wrap.innerHTML = label + '<div class="checklist"><input type="search" class="cl-filter" placeholder="بحث…" aria-label="بحث"><ul></ul></div>' + hint + err;
        var ul = E.$('ul', wrap), flt = E.$('.cl-filter', wrap);
        var draw = function () {
          var list = opts(f, values), sel2 = E.getPath(values, f.key) || [], q = flt.value.trim().toLowerCase();
          var shown = list.filter(function (x) { return !q || String(x.l).toLowerCase().indexOf(q) !== -1; });
          ul.innerHTML = shown.length ? shown.map(function (x) {
            return '<li><label><input type="checkbox" value="' + esc(x.v) + '"' + (sel2.indexOf(x.v) !== -1 ? ' checked' : '') + '><span>' + esc(x.l) + '</span></label></li>';
          }).join('') : '<li class="cl-empty">' + esc(f.emptyText || 'لا توجد عناصر') + '</li>';
        };
        it.refresh = function () {
          var valid = opts(f, values).map(function (x) { return x.v; });
          var cs = (E.getPath(values, f.key) || []).filter(function (v) { return valid.indexOf(v) !== -1; });
          E.setPath(values, f.key, cs); draw();
        };
        if (!Array.isArray(cur)) E.setPath(values, f.key, []);
        draw();
        flt.addEventListener('input', draw);
        ul.addEventListener('change', function (e) {
          var v = e.target.value, s = (E.getPath(values, f.key) || []).slice();
          var i = s.indexOf(v);
          if (e.target.checked && i === -1) s.push(v); else if (!e.target.checked && i !== -1) s.splice(i, 1);
          set(s);
        });
      } else if (f.type === 'image') {
        wrap.innerHTML = label + '<div class="imgfield"><div class="pv"></div><div class="acts">' +
          '<button type="button" class="btn sm" data-a="up">' + E.icon('upload') + ' رفع</button>' +
          '<button type="button" class="btn sm" data-a="pick">' + E.icon('image') + ' من المكتبة</button>' +
          '<button type="button" class="btn sm ghost" data-a="url">' + E.icon('link') + ' رابط</button>' +
          '<button type="button" class="btn sm ghost" data-a="clr">إزالة</button>' +
          '<input type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml"></div></div>' + hint + err;
        var pv = E.$('.pv', wrap), file = E.$('input[type=file]', wrap);
        var paint = function () {
          var v = E.getPath(values, f.key), u = v ? E.assetSrc(v) : '';
          pv.innerHTML = u ? '<img alt="">' : 'لا توجد صورة';
          if (u) E.$('img', pv).src = u;
          E.$('[data-a=clr]', wrap).hidden = !v;
        };
        paint();
        wrap.addEventListener('click', function (e) {
          var b = e.target.closest('[data-a]'); if (!b) return;
          var a = b.dataset.a;
          if (a === 'up') file.click();
          if (a === 'clr') { set(''); paint(); }
          if (a === 'pick') E.pickAsset().then(function (id) { if (id) { set(id); paint(); } });
          if (a === 'url') E.prompt({ title: 'رابط الصورة', label: 'الصق رابط الصورة', placeholder: 'https://…' }).then(function (u) {
            if (u == null || u === '') return;
            if (!E.safeImageUrl(u)) { E.toast('الرابط غير صالح. استخدم رابطًا يبدأ بـ https://', { type: 'error' }); return; }
            set(u); paint();
          });
        });
        file.addEventListener('change', function () {
          var fl = file.files[0]; file.value = '';
          if (!fl) return;
          E.uploadAsset(fl, { category: f.category || 'general' }).then(function (a) { set(a.id); paint(); }).catch(function (er) { E.toast(er.message, { type: 'error' }); });
        });
        it.refresh = paint;
      } else if (f.type === 'video') {
        wrap.innerHTML = label +
          '<div class="videofield">' +
            '<div class="videofield-input-wrap">' +
              '<input type="text" id="' + id + '" dir="ltr" placeholder="الصق رابط YouTube أو Google Drive هنا...">' +
            '</div>' +
            '<div class="videofield-actions">' +
              '<button type="button" class="btn sm ghost" data-a="clr-video">مسح الرابط</button>' +
            '</div>' +
            '<div class="videofield-preview" hidden></div>' +
          '</div>' + hint + err;
        var inp = E.$('#' + id, wrap), pvBox = E.$('.videofield-preview', wrap);
        inp.value = cur || '';

        var updatePreview = function () {
          var val = (inp.value || '').trim();
          if (!val) { pvBox.hidden = true; pvBox.innerHTML = ''; return; }
          var yt = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i.exec(val);
          var gd = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i.exec(val);
          pvBox.hidden = false;
          if (yt) {
            pvBox.innerHTML = '<span class="v-tag yt">YouTube</span><iframe src="https://www.youtube.com/embed/' + E.esc(yt[1]) + '" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>';
          } else if (gd) {
            pvBox.innerHTML = '<span class="v-tag gd">Google Drive</span><iframe src="https://drive.google.com/file/d/' + E.esc(gd[1]) + '/preview" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
          } else {
            pvBox.innerHTML = '<span class="v-tag direct">فيديو مباشر</span><video controls src="' + E.esc(val) + '" preload="metadata"></video>';
          }
        };
        updatePreview();

        inp.addEventListener('input', function () {
          set(inp.value.trim());
          updatePreview();
        });

        wrap.addEventListener('click', function (e) {
          var b = e.target.closest('[data-a]'); if (!b) return;
          var a = b.dataset.a;
          if (a === 'clr-video') { inp.value = ''; set(''); updatePreview(); }
        });

        it.refresh = function () { inp.value = E.getPath(values, f.key) || ''; updatePreview(); };
      } else if (f.type === 'custom') {
        wrap.innerHTML = label + '<div data-slot></div>' + hint + err;
        var r = f.render(E.$('[data-slot]', wrap), values, function () { changed(f.key); });
        if (r && r.refresh) it.refresh = r.refresh;
      } else {
        var tag = f.type === 'textarea' || f.type === 'code' ? 'textarea' : 'input';
        var type = f.type === 'number' ? 'number' : f.type === 'color' ? 'color' : f.type === 'url' ? 'url' : 'text';
        wrap.innerHTML = label + '<' + tag + (tag === 'input' ? ' type="' + type + '"' : '') + ' id="' + id + '"' +
          (f.type === 'code' ? ' class="code" spellcheck="false"' : ' dir="auto"') + '>' + (tag === 'textarea' ? '</textarea>' : '') + hint + err;
        var inp = E.$('[id="' + id + '"]', wrap);
        if (f.rows) inp.rows = f.rows;
        if (f.placeholder) inp.placeholder = f.placeholder;
        if (f.min != null) inp.min = f.min; if (f.max != null) inp.max = f.max;
        inp.value = cur == null ? (f.type === 'color' ? '#3C4AE8' : '') : cur;
        inp.addEventListener('input', function () {
          var v = inp.value;
          if (f.type === 'number') v = v === '' ? null : Number(v);
          set(v);
        });
      }
      it.vis = function () { wrap.hidden = !!(f.showIf && !f.showIf(values)); };
      it.vis();
      items.push(it); root.appendChild(wrap);
    });

    function setErr(it, msg) {
      it.wrap.classList.toggle('invalid', !!msg);
      var e = E.$('.err', it.wrap); if (e) e.textContent = msg || '';
    }
    return {
      el: root, values: values,
      isDirty: function () { return dirty; },
      reset: function () { dirty = false; },
      validate: function () {
        var first = null, ok = true;
        items.forEach(function (it) {
          var f = it.f; setErr(it, '');
          if (!f.key || it.wrap.hidden || f.type === 'note') return;
          var v = E.getPath(values, f.key), msg = '';
          if (f.required && isEmpty(v)) msg = 'هذا الحقل مطلوب';
          else if (f.type === 'number' && v != null && v !== '') {
            if (isNaN(v)) msg = 'أدخل رقمًا صحيحًا';
            else if (f.min != null && v < f.min) msg = 'القيمة يجب ألا تقل عن ' + f.min;
            else if (f.max != null && v > f.max) msg = 'القيمة يجب ألا تزيد عن ' + f.max;
          }
          if (!msg && f.validate) msg = f.validate(v, values) || '';
          if (msg) { setErr(it, msg); ok = false; if (!first) first = it; }
        });
        if (o.validate) {
          var r = o.validate(values);
          if (r) {
            ok = false;
            if (typeof r === 'string') E.toast(r, { type: 'error' });
            else Object.keys(r).forEach(function (k) {
              var it2 = items.filter(function (x) { return x.f.key === k; })[0];
              if (it2) { setErr(it2, r[k]); if (!first) first = it2; } else E.toast(r[k], { type: 'error' });
            });
          }
        }
        if (first) { var c = E.$('input, select, textarea, button', first.wrap); if (c) c.focus(); first.wrap.scrollIntoView({ block: 'center' }); }
        return ok;
      }
    };
  };

  E.safeImageUrl = function (u) { return !!window.EfhamaData.safeUrl(u) && /^(https?:\/\/|\/)/i.test(u); };

  E.formModal = function (o) {
    return new Promise(function (resolve) {
      var form = E.buildForm(typeof o.fields === 'function' ? o.fields() : o.fields, o.values, { validate: o.validate });
      var saved = false;
      var chk = function () { return form.isDirty() && !saved; };
      E.dirtyChecks.add(chk);
      var footer = [{
        label: E.esc(o.saveLabel || 'حفظ'), cls: 'primary',
        onClick: function (ctx) {
          if (!form.validate()) return false;
          ctx.setBusy(true);
          return Promise.resolve(o.onSave(form.values)).then(function (r) {
            ctx.setBusy(false);
            if (r === false) return false;
            saved = true;
          }).catch(function (e) { ctx.setBusy(false); E.toast(e.message || 'تعذر الحفظ', { type: 'error' }); return false; });
        }
      }, { label: 'إلغاء' }];
      (o.extraButtons || []).forEach(function (b) {
        footer.push({ label: b.label, push: b.push, close: false, onClick: function (ctx) { b.onClick(form.values, ctx); return false; } });
      });
      var m = E.modal({
        title: o.title, size: o.size, body: form.el, footer: footer,
        onBeforeClose: function () {
          if (!chk()) return true;
          return E.confirm({ title: 'تجاهل التعديلات؟', message: 'لديك تعديلات لم تُحفظ. هل تريد إغلاق النافذة وفقدانها؟', confirmText: 'تجاهل التعديلات', danger: true });
        }
      });
      m.done.then(function () { E.dirtyChecks.delete(chk); resolve(saved); });
    });
  };
})();
