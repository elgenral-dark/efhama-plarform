(function () {
  'use strict';
  var E = window.Efhama, esc = E.esc, Store = E.Store;
  var AL = { create: 'إضافة', update: 'تعديل', delete: 'حذف', reorder: 'إعادة ترتيب', publish: 'نشر', unpublish: 'إلغاء نشر', login: 'تسجيل دخول', logout: 'تسجيل خروج', login_failed: 'فشل تسجيل دخول',
    permissions: 'تغيير صلاحيات', suspend: 'إيقاف حساب', activate: 'تفعيل حساب', issue: 'إصدار شهادة', reissue: 'إعادة إصدار شهادة', revoke: 'إلغاء شهادة', upload: 'رفع ملف', ai_organize: 'تنظيم بالذكاء الاصطناعي' };
  var CLS = { delete: 'err', revoke: 'err', suspend: 'err', login_failed: 'err', create: 'ok', publish: 'ok', issue: 'ok', activate: 'ok', permissions: 'warn', unpublish: 'warn' };
  E.actionLabel = function (a) { return AL[a] || a; };

  function pretty(j) { if (!j) return null; try { return JSON.stringify(JSON.parse(j), null, 2); } catch (e) { return j; } }

  E.page('logs', {
    title: 'سجل العمليات',
    render: function (c) {
      if (Store.mode !== 'server') { c.innerHTML = '<div class="page-head"><div><h1>سجل العمليات</h1></div></div>'; E.needServer(E.$('#content'), 'سجل العمليات'); return; }
      var st = { q: '', action: '', section: '', from: '', to: '', page: 1 };
      c.innerHTML = '<div class="page-head"><div><h1>سجل العمليات</h1><p class="sub">كل عملية إدارية تُسجَّل من الخادم باسم المستخدم الفعلي. السجل للقراءة فقط ولا يمكن تعديله أو حذفه.</p></div><div class="acts"><button class="btn" data-verify>' + E.icon('shield') + ' التحقق من سلامة السجل</button></div></div>' +
        '<div class="toolbar"><div class="search">' + E.icon('search') + '<input type="search" data-q placeholder="بحث باسم الشخص أو العنصر…" aria-label="بحث"></div>' +
        '<select data-action aria-label="نوع العملية"><option value="">كل العمليات</option></select><select data-section aria-label="القسم"><option value="">كل الأقسام</option></select>' +
        '<label class="inline-date">من <input type="date" data-from></label><label class="inline-date">إلى <input type="date" data-to></label></div><div class="panel" data-res><div class="skel" style="height:200px;margin:16px"></div></div>';
      var res = E.$('[data-res]', c), loadedMeta = false;
      function tz() { return -new Date().getTimezoneOffset(); }
      function load() {
        var qs = new URLSearchParams({ q: st.q, action: st.action, section: st.section, from: st.from, to: st.to, page: st.page, tz: tz() });
        Store.api('GET', '/logs?' + qs).then(function (r) {
          if (!loadedMeta) {
            loadedMeta = true;
            E.$('[data-action]', c).insertAdjacentHTML('beforeend', r.actions.map(function (a) { return '<option value="' + esc(a) + '">' + esc(AL[a] || a) + '</option>'; }).join(''));
            E.$('[data-section]', c).insertAdjacentHTML('beforeend', r.sections.map(function (a) { return '<option value="' + esc(a) + '">' + esc(r.sectionLabels[a] || a) + '</option>'; }).join(''));
          }
          if (!r.rows.length) { res.innerHTML = '<div class="empty">' + E.icon('history') + '<h3>لا توجد عمليات مطابقة</h3></div>'; return; }
          res.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>التاريخ والوقت</th><th>المستخدم</th><th>العملية</th><th>القسم</th><th>العنصر</th><th>التفاصيل</th><th></th></tr></thead><tbody>' +
            r.rows.map(function (x) {
              return '<tr><td data-label="الوقت" style="white-space:nowrap">' + esc(E.fmtDate(x.ts)) + '<div class="t-sub">' + esc(E.fmtTime(x.ts)) + '</div></td>' +
                '<td data-label="المستخدم"><div class="t-main">' + esc(x.display_name || x.username) + '</div><div class="t-sub" dir="ltr" style="text-align:start">' + esc(x.username) + (x.user_id != null ? ' · #' + x.user_id : '') + '</div></td>' +
                '<td data-label="العملية"><span class="badge ' + (CLS[x.action] || 'brand') + '">' + esc(AL[x.action] || x.action) + '</span></td>' +
                '<td data-label="القسم">' + esc(r.sectionLabels[x.section] || x.section) + '</td>' +
                '<td data-label="العنصر"><div class="clip">' + esc((x.target_type ? x.target_type + ': ' : '') + (x.target_name || '')) + '</div></td>' +
                '<td data-label="التفاصيل"><div class="clip">' + esc(x.details || '') + '</div></td>' +
                '<td class="acts-cell" data-label=""><button class="btn sm" data-d="' + x.id + '">عرض</button></td></tr>';
            }).join('') + '</tbody></table></div><div class="pager"><span>' + E.num(r.total) + ' عملية</span>' + (r.pages > 1 ? '<div class="btns"><button class="btn sm" data-pg="-1"' + (r.page <= 1 ? ' disabled' : '') + '>السابق</button><span>صفحة ' + r.page + ' / ' + r.pages + '</span><button class="btn sm" data-pg="1"' + (r.page >= r.pages ? ' disabled' : '') + '>التالي</button></div>' : '') + '</div>';
        }).catch(function (e) { res.innerHTML = '<div class="empty">' + E.icon('alert') + '<h3>تعذر تحميل السجل</h3><p>' + esc(e.message) + '</p></div>'; });
      }
      function detail(id) {
        Store.api('GET', '/logs/' + id).then(function (x) {
          var b = pretty(x.before_json), a = pretty(x.after_json);
          E.modal({
            title: 'تفاصيل العملية #' + x.id, size: 'lg',
            body: '<dl class="kv"><dt>المستخدم</dt><dd>' + esc(x.display_name || x.username) + ' <span dir="ltr">(' + esc(x.username) + (x.user_id != null ? ' #' + x.user_id : '') + ')</span></dd><dt>العملية</dt><dd>' + esc(AL[x.action] || x.action) + '</dd>' +
              '<dt>القسم</dt><dd>' + esc((E.me && E.me.sectionLabels[x.section]) || x.section) + '</dd><dt>العنصر</dt><dd>' + esc((x.target_type || '') + ' ' + (x.target_name || '')) + ' <span class="t-sub" dir="ltr">' + esc(x.target_id || '') + '</span></dd>' +
              '<dt>التاريخ</dt><dd>' + esc(E.fmtDate(x.ts)) + ' ' + esc(E.fmtTime(x.ts)) + '</dd><dt>عنوان IP</dt><dd dir="ltr" style="text-align:start">' + esc(x.ip || '') + '</dd><dt>التفاصيل</dt><dd>' + esc(x.details || '') + '</dd></dl>' +
              (b || a ? '<div class="grid-2" style="margin-top:14px"><div><b>البيانات السابقة</b><pre class="json" dir="ltr">' + esc(b || '—') + '</pre></div><div><b>البيانات الجديدة</b><pre class="json" dir="ltr">' + esc(a || '—') + '</pre></div></div>' : ''),
            footer: [{ label: 'إغلاق' }]
          });
        }).catch(function (e) { E.toast(e.message, { type: 'error' }); });
      }
      var tm;
      E.$('[data-q]', c).addEventListener('input', function (e) { clearTimeout(tm); tm = setTimeout(function () { st.q = e.target.value.trim(); st.page = 1; load(); }, 250); });
      [['action', 'data-action'], ['section', 'data-section'], ['from', 'data-from'], ['to', 'data-to']].forEach(function (x) {
        E.$('[' + x[1] + ']', c).addEventListener('change', function (e) { st[x[0]] = e.target.value; st.page = 1; load(); });
      });
      c.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.d) detail(b.dataset.d);
        else if (b.dataset.pg) { st.page += +b.dataset.pg; load(); }
        else if (b.dataset.verify != null) Store.api('GET', '/logs/verify').then(function (r) {
          E.toast(r.ok ? 'سلسلة السجل سليمة (' + r.checked + ' سجل)' : 'تحذير: تم اكتشاف تلاعب عند السجل رقم ' + r.brokenAt, { type: r.ok ? 'success' : 'error', timeout: 8000 });
        });
      });
      load();
    }
  });
})();
