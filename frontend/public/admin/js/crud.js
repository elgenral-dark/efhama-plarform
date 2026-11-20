(function () {
  'use strict';
  var E = window.Efhamha, esc = E.esc, Store = E.Store;

  function normalizeOrder(arr, groupKey) {
    var groups = {};
    arr.forEach(function (x, i) { x.__i = i; var g = groupKey ? (x[groupKey] || '') : ''; (groups[g] = groups[g] || []).push(x); });
    Object.keys(groups).forEach(function (g) {
      groups[g].sort(function (a, b) { return ((a.order || 0) - (b.order || 0)) || (a.__i - b.__i); })
        .forEach(function (x, k) { x.order = k + 1; });
    });
    arr.forEach(function (x) { delete x.__i; });
  }
  E.normalizeOrder = normalizeOrder;

  /*
   * cfg: { coll, prefix, title, subtitle, singular, icon, nameOf(item), fields, columns, filters, search(item),
   *        order:{groupBy}, newValues(state), validate, beforeSave, afterSave, deleteInfo(item), duplicate:true,
   *        rowActions:[{icon,label,onClick(item)}], editRoute(id), formSize, formButtons, pageSize, embedded }
   */
  E.crudPage = function (cfg) {
    return {
      title: cfg.title,
      render: function (container, ctx) {
        ctx = ctx || {};
        var st = { q: '', filters: {}, sort: cfg.defaultSort || (cfg.order ? { key: 'order', dir: 1 } : { key: null, dir: 1 }), page: 1 };
        var size = cfg.pageSize || 10;
        var emb = cfg.embedded;
        var section = cfg.section || String(cfg.coll).split('.')[0];
        var ro = !E.can(section, 'edit'); /* قراءة فقط: إخفاء أزرار التعديل (الخادم يرفض أي تعديل على أي حال) */
        var filters = (cfg.filters || []);
        Object.keys(ctx.params || {}).forEach(function (k) {
          if (k === 'q') st.q = ctx.params.q;
          else if (filters.some(function (f) { return f.key === k; })) st.filters[k] = ctx.params[k];
        });

        container.innerHTML =
          (emb ? '' : '<div class="page-head"><div><h1>' + esc(cfg.title) + '</h1><p class="sub">' + esc(cfg.subtitle || '') + '</p></div>' +
            '<div class="acts">' + (ro ? '<span class="badge">قراءة فقط</span>' : '<button class="btn primary" data-act="add">' + E.icon('plus') + ' إضافة ' + esc(cfg.singular) + '</button>') + '</div></div>') +
          '<div class="toolbar">' +
          '<div class="search">' + E.icon('search') + '<input type="search" placeholder="بحث في ' + esc(cfg.title) + '…" aria-label="بحث" value="' + esc(st.q) + '"></div>' +
          filters.map(function (f) {
            var filterOptions = typeof f.options === 'function' ? f.options() : f.options;
            if (!Array.isArray(filterOptions)) filterOptions = [];
            return '<select data-f="' + f.key + '" aria-label="' + esc(f.label) + '"><option value="">' + esc(f.label) + '</option>' +
              filterOptions.map(function (o) { return '<option value="' + esc(o.v) + '"' + (st.filters[f.key] === o.v ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select>';
          }).join('') +
          (emb && !ro ? '<button class="btn primary" data-act="add" style="margin-inline-start:auto">' + E.icon('plus') + ' إضافة ' + esc(cfg.singular) + '</button>' : '') +
          '</div><div class="panel" data-res></div>';

        var res = E.$('[data-res]', container);

        function all() { return Store.list(cfg.coll); }
        function groupOf(item) { return cfg.order && cfg.order.groupBy ? all().filter(function (x) { return (x[cfg.order.groupBy] || '') === (item[cfg.order.groupBy] || ''); }) : all(); }
        function hay(x) { return (cfg.search ? cfg.search(x) : JSON.stringify(x)).toLowerCase(); }

        function filtered() {
          var q = st.q.trim().toLowerCase();
          var list = all().filter(function (x) {
            if (q && hay(x).indexOf(q) === -1) return false;
            return filters.every(function (f) {
              var v = st.filters[f.key]; if (!v) return true;
              return f.match ? f.match(x, v) : x[f.key] === v;
            });
          });
          var col = cfg.columns.filter(function (c) { return c.key === st.sort.key; })[0];
          if (st.sort.key === 'order') list = list.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
          else if (col && col.sort) {
            list = list.slice().sort(function (a, b) {
              var x = col.sort(a), y = col.sort(b);
              return (x > y ? 1 : x < y ? -1 : 0) * st.sort.dir;
            });
          }
          return list;
        }

        function draw() {
          var total = all().length, list = filtered();
          if (!total) {
            res.innerHTML = '<div class="empty">' + E.icon(cfg.icon || 'layers') + '<h3>' + esc(cfg.emptyTitle || ('لا توجد ' + cfg.title + ' بعد')) + '</h3><p>' +
              esc(cfg.emptyText || ('ابدأ بإضافة أول ' + cfg.singular + '.')) + '</p>' + (ro ? '' : '<button class="btn primary" data-act="add">' + E.icon('plus') + ' إضافة ' + esc(cfg.singular) + '</button>') + '</div>';
            return;
          }
          if (!list.length) {
            res.innerHTML = '<div class="empty">' + E.icon('search') + '<h3>لا توجد نتائج</h3><p>جرّب تغيير كلمات البحث أو إزالة الفلاتر.</p><button class="btn" data-act="clear">إزالة الفلاتر</button></div>';
            return;
          }
          var pages = Math.max(1, Math.ceil(list.length / size));
          if (st.page > pages) st.page = pages;
          var slice = Array.isArray(list) ? list.slice((st.page - 1) * size, st.page * size) : [];
          var byOrder = st.sort.key === 'order';
          var head = cfg.columns.map(function (c) {
            var on = st.sort.key === c.key;
            return '<th scope="col"' + (on ? ' aria-sort="' + (st.sort.dir > 0 ? 'ascending' : 'descending') + '"' : '') + '>' +
              (c.sort || c.key === 'order' ? '<button type="button" data-sort="' + c.key + '">' + esc(c.label) + (on ? E.icon(st.sort.dir > 0 ? 'up' : 'down') : '') + '</button>' : esc(c.label)) + '</th>';
          }).join('') + '<th scope="col" class="operations-head">العمليات</th>';
          var rows = slice.map(function (x) {
            var g = byOrder ? groupOf(x).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }) : [];
            var gi = g.findIndex(function (y) { return y.id === x.id; });
            var cells = cfg.columns.map(function (c) {
              var inner = c.key === 'order'
                ? '<span class="badge">' + (x.order || '') + '</span>' + (byOrder && cfg.order && !ro ? ' <button type="button" class="icon-btn sm" data-up="' + x.id + '" aria-label="تقديم"' + (gi <= 0 ? ' disabled' : '') + '>' + E.icon('up') + '</button><button type="button" class="icon-btn sm" data-down="' + x.id + '" aria-label="تأخير"' + (gi >= g.length - 1 ? ' disabled' : '') + '>' + E.icon('down') + '</button>' : '')
                : c.render(x);
              return '<td data-label="' + esc(c.label) + '">' + inner + '</td>';
            }).join('');
            var acts = (cfg.rowActions || []).map(function (a, i) { return '<button type="button" class="icon-btn" data-ra="' + i + '" data-id="' + x.id + '" aria-label="' + esc(a.label) + '" title="' + esc(a.label) + '">' + E.icon(a.icon) + '</button>'; }).join('') +
              (ro ? '' : (cfg.duplicate ? '<button type="button" class="icon-btn" data-dup="' + x.id + '" aria-label="تكرار" title="تكرار">' + E.icon('copy') + '</button>' : '') +
              '<button type="button" class="icon-btn" data-edit="' + x.id + '" aria-label="تعديل" title="تعديل">' + E.icon('edit') + '</button>' +
              '<button type="button" class="icon-btn danger" data-del="' + x.id + '" aria-label="حذف" title="حذف">' + E.icon('trash') + '</button>');
            return '<tr data-id="' + x.id + '">' + cells + '<td class="acts-cell" data-label=""><div class="acts">' + acts + '</div></td></tr>';
          }).join('');
          res.innerHTML = '<div class="tbl-wrap crud-table-wrap crud-table-' + esc(section) + '"><table class="tbl crud-table"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
            '<div class="pager"><span>' + E.num(list.length) + ' ' + esc(list.length === 1 ? cfg.singular : cfg.title) + (list.length !== total ? ' من ' + E.num(total) : '') + '</span>' +
            (pages > 1 ? '<div class="btns"><button class="btn sm" data-pg="-1"' + (st.page <= 1 ? ' disabled' : '') + '>السابق</button><span>صفحة ' + st.page + ' / ' + pages + '</span><button class="btn sm" data-pg="1"' + (st.page >= pages ? ' disabled' : '') + '>التالي</button></div>' : '') + '</div>';
        }

        function nextOrder(group) {
          var items = group ? all().filter(function (x) { return (x[cfg.order.groupBy] || '') === group; }) : all();
          return items.reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0) + 1;
        }

        function openForm(item) {
          if (cfg.editRoute) { E.Router.go(cfg.editRoute(item ? item.id : 'new', st)); return; }
          var isNew = !item;
          var values;
          if (isNew) {
            values = cfg.newValues ? cfg.newValues(st) : {};
            if (cfg.order && values.order == null) values.order = nextOrder(cfg.order.groupBy ? values[cfg.order.groupBy] : '');
          } else values = E.clone(item);
          if (cfg.prepare) values = cfg.prepare(values, isNew) || values;
          return E.formModal({
            title: (isNew ? 'إضافة ' : 'تعديل ') + cfg.singular, fields: cfg.fields, values: values, size: cfg.formSize,
            validate: cfg.validate ? function (v) { return cfg.validate(v, isNew, item); } : null,
            extraButtons: cfg.formButtons,
            onSave: function (v) {
              if (cfg.beforeSave && cfg.beforeSave(v, isNew) === false) return false;
              var id = isNew ? Store.newId(cfg.prefix) : item.id;
              Store.update(function (d) {
                var arr = Store.list(cfg.coll, d);
                if (isNew) { v.id = id; arr.push(v); }
                else { var i = arr.findIndex(function (x) { return x.id === id; }); arr[i] = Object.assign({}, arr[i], v); }
                if (cfg.order) normalizeOrder(arr, cfg.order.groupBy);
              });
              if (cfg.afterSave) cfg.afterSave(Object.assign({ id: id }, v), isNew);
              E.toast(isNew ? 'تمت الإضافة' : 'تم حفظ التعديلات', { type: 'success' });
              draw();
            }
          });
        }
        E.crudOpen = E.crudOpen || {}; E.crudOpen[cfg.coll] = openForm;

        function del(item) {
          var info = cfg.deleteInfo ? cfg.deleteInfo(item) : '';
          E.confirm({
            title: 'حذف ' + cfg.singular,
            message: 'سيتم حذف «' + cfg.nameOf(item) + '» نهائيًا. ' + info,
            confirmText: 'حذف', danger: true
          }).then(function (ok) {
            if (!ok) return;
            var snap = Store.snapshot();
            Store.remove(cfg.coll, item.id);
            if (cfg.order) Store.update(function (d) { normalizeOrder(Store.list(cfg.coll, d), cfg.order.groupBy); });
            E.toast('تم حذف ' + cfg.singular, { type: 'success', action: { label: 'تراجع', onClick: function () { Store.restore(snap); } } });
            draw();
          });
        }

        function move(id, dir) {
          var item = all().filter(function (x) { return x.id === id; })[0];
          Store.update(function (d) {
            var arr = Store.list(cfg.coll, d), me = arr.filter(function (x) { return x.id === id; })[0];
            var g = arr.filter(function (x) { return !cfg.order.groupBy || (x[cfg.order.groupBy] || '') === (me[cfg.order.groupBy] || ''); })
              .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
            var i = g.indexOf(me), j = i + dir;
            if (j < 0 || j >= g.length) return;
            g[i] = g[j]; g[j] = me;
            g.forEach(function (x, k) { x.order = k + 1; });
          });
          draw();
          return item;
        }

        function dup(item) {
          var c = E.clone(item);
          c.id = Store.newId(cfg.prefix);
          var tk = cfg.titleKey || 'title'; c[tk] = (c[tk] || '') + ' (نسخة)';
          if (cfg.coll === 'lessons') c.status = 'draft';
          Store.update(function (d) {
            var arr = Store.list(cfg.coll, d); arr.push(c);
            if (cfg.order) { c.order = 9999; normalizeOrder(arr, cfg.order.groupBy); }
          });
          E.toast('تم إنشاء نسخة', { type: 'success' }); draw();
        }

        container.addEventListener('click', function (e) {
          var t = e.target.closest('button, a'); if (!t || !container.contains(t)) return;
          var d = t.dataset;
          var byId = function (id) { return all().filter(function (x) { return x.id === id; })[0]; };
          if (d.act === 'add') openForm(null);
          else if (d.act === 'clear') { st.q = ''; st.filters = {}; E.$('input[type=search]', container).value = ''; E.$$('select[data-f]', container).forEach(function (s) { s.value = ''; }); draw(); }
          else if (d.edit) openForm(byId(d.edit));
          else if (d.del) del(byId(d.del));
          else if (d.dup) dup(byId(d.dup));
          else if (d.up) move(d.up, -1);
          else if (d.down) move(d.down, 1);
          else if (d.ra != null) cfg.rowActions[+d.ra].onClick(byId(d.id));
          else if (d.pg) { st.page += +d.pg; draw(); }
          else if (d.sort) {
            if (st.sort.key === d.sort) st.sort.dir *= -1; else st.sort = { key: d.sort, dir: 1 };
            draw();
          }
        });
        var qi = E.$('input[type=search]', container), tm;
        qi.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(function () { st.q = qi.value; st.page = 1; draw(); }, 150); });
        container.addEventListener('change', function (e) {
          var s = e.target.closest('select[data-f]'); if (!s) return;
          st.filters[s.dataset.f] = s.value; st.page = 1; draw();
        });
        draw();
        if (ctx.params && ctx.params.edit) { var it = all().filter(function (x) { return x.id === ctx.params.edit; })[0]; if (it) openForm(it); }
        if (ctx.params && ctx.params.new === '1') openForm(null);
      }
    };
  };

  /* خلايا جاهزة */
  E.cell = {
    name: function (title, sub) { return '<div class="t-main">' + esc(title) + '</div>' + (sub ? '<div class="t-sub clip">' + esc(sub) + '</div>' : ''); },
    badge: function (t, cls) { return '<span class="badge ' + (cls || '') + '">' + esc(t) + '</span>'; },
    status: function (s) { return s === 'published' ? '<span class="badge ok">منشور</span>' : '<span class="badge warn">مسودة</span>'; },
    level: function (l) { return l ? '<span class="badge brand">' + esc(E.LEVELS[l] || l) + '</span>' : ''; }
  };
  E.pathName = function (id) { var p = Store.byId('paths', id); return p ? p.name : ''; };
  E.moduleName = function (id) { var m = Store.byId('modules', id); return m ? m.title : ''; };
  E.pathOptions = function () { return Store.list('paths').slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); }).map(function (p) { return { v: p.id, l: p.name }; }); };
  E.moduleOptions = function (pathId) {
    return Store.list('modules').filter(function (m) { return !pathId || m.pathId === pathId; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
      .map(function (m) { return { v: m.id, l: (pathId ? '' : E.pathName(m.pathId) + ' › ') + m.title }; });
  };
  E.lessonOptions = function (moduleId, exceptId) {
    return Store.list('lessons').filter(function (l) { return (!moduleId || l.moduleId === moduleId) && l.id !== exceptId; })
      .map(function (l) { return { v: l.id, l: l.title }; });
  };
})();
