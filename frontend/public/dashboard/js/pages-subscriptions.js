(function () {
  'use strict';
  var E = window.Efhamha, esc = E.esc, Store = E.Store;

  function show(v, suffix) { return v === null || v === '' || v === undefined ? '<span class="t-sub">غير محدد</span>' : '<b dir="auto">' + esc(v) + (suffix ? ' ' + esc(suffix) : '') + '</b>'; }

  E.page('subscriptions', {
    title: 'الاشتراكات',
    render: function (c) {
      c.innerHTML = '<div class="page-head"><div><h1>الاشتراكات</h1><p class="sub">إعدادات الاشتراك التي تظهر في صفحات الاشتراك والدفع بالموقع.</p></div></div><div data-body><div class="skel" style="height:180px"></div></div>';
      if (Store.mode !== 'server') { E.needServer(c, 'إعدادات الاشتراك المركزية'); return; }
      var body = E.$('[data-body]', c), canEdit = E.can('subscriptions', 'edit');

      function draw(cur) {
        body.innerHTML = '<div class="grid-2"><section class="panel panel-pad"><h2 style="margin-bottom:12px">القيم الحالية</h2><dl class="kv">' +
          '<dt>سعر الاشتراك</dt><dd>' + show(cur.price, cur.currencyLabel) + '</dd>' +
          '<dt>رقم الكاش لاستقبال المدفوعات</dt><dd dir="ltr" style="text-align:start">' + show(cur.cashNumber) + '</dd>' +
          '<dt>رقم WhatsApp للتواصل والاشتراكات</dt><dd dir="ltr" style="text-align:start">' + show(cur.whatsapp) + '</dd></dl>' +
          '<p class="hint" style="margin-top:12px">' + (cur.updatedAt ? 'آخر تعديل: ' + esc(E.fmtDate(cur.updatedAt)) + ' ' + esc(E.fmtTime(cur.updatedAt)) + ' بواسطة ' + esc(cur.updatedBy || '') : 'لم تُحفظ أي قيم بعد.') + '</p></section>' +
          '<section class="panel panel-pad"><h2 style="margin-bottom:12px">' + (canEdit ? 'تعديل الإعدادات' : 'عرض فقط') + '</h2><div data-form></div>' +
          (canEdit ? '<div style="margin-top:16px"><button class="btn primary" data-save>' + E.icon('check') + ' حفظ التغييرات</button></div>' : '') + '</section></div>' +
          '<section class="panel panel-pad" style="margin-top:16px"><h3>كيف تصل القيم للموقع؟</h3><p class="sub" style="margin-top:6px">تُحفظ في قاعدة البيانات (مصدر واحد) وتُنشر تلقائيًا في <code dir="ltr">/public/efhamha-data.json</code> تحت المفتاح <code dir="ltr">subscription</code>. اقرأها في صفحات الاشتراك والدفع من هناك بدل كتابتها داخل الملفات.</p></section>';
        if (!canEdit) return;
        var form = E.buildForm([
          { key: 'price', label: 'سعر الاشتراك', type: 'number', min: 0, hint: 'اتركه فارغًا إن لم يُحدَّد سعر بعد.' },
          { key: 'currencyLabel', label: 'وحدة السعر (مثال: جنيه / شهريًا)', type: 'text' },
          { key: 'cashNumber', label: 'رقم الكاش', type: 'text', placeholder: '01xxxxxxxxx' },
          { key: 'whatsapp', label: 'رقم WhatsApp', type: 'text', placeholder: '+20…', hint: 'بصيغة دولية مع رمز الدولة.' }
        ], { price: cur.price, currencyLabel: cur.currencyLabel, cashNumber: cur.cashNumber, whatsapp: cur.whatsapp });
        E.$('input[type=text]', form.el); form.el.classList.add('one-col');
        E.$('[data-form]', body).appendChild(form.el);
        E.Router.guard = { dirty: function () { return form.isDirty(); } };
        E.$('[data-save]', body).onclick = function () {
          if (!form.validate()) return;
          var v = form.values, L = { price: 'السعر', currencyLabel: 'وحدة السعر', cashNumber: 'رقم الكاش', whatsapp: 'رقم الواتساب' };
          var changes = Object.keys(L).filter(function (k) { return String(cur[k] == null ? '' : cur[k]) !== String(v[k] == null ? '' : v[k]); });
          if (!changes.length) { E.toast('لا توجد تغييرات للحفظ'); return; }
          var list = changes.map(function (k) { return '<li><b>' + L[k] + '</b>: <span class="t-sub">' + esc(cur[k] == null || cur[k] === '' ? 'غير محدد' : cur[k]) + '</span> ← <b dir="auto">' + esc(v[k] == null || v[k] === '' ? 'غير محدد' : v[k]) + '</b></li>'; }).join('');
          E.modal({
            title: 'تأكيد حفظ التغييرات', size: 'sm',
            body: '<p>ستنعكس هذه التغييرات على صفحات الاشتراك والدفع في الموقع فورًا:</p><ul>' + list + '</ul>',
            footer: [{
              label: 'تأكيد الحفظ', cls: 'primary', onClick: function (ctx) {
                ctx.setBusy(true);
                return Store.api('PUT', '/subscription', { confirmed: true, price: v.price, currencyLabel: v.currencyLabel, cashNumber: v.cashNumber, whatsapp: v.whatsapp }).then(function (r) {
                  ctx.setBusy(false); E.toast('تم تحديث إعدادات الاشتراك', { type: 'success' });
                  E.Router.guard = null; E.Router.refresh();
                }).catch(function (e) { ctx.setBusy(false); E.toast('فشل التحديث: ' + e.message, { type: 'error' }); return false; });
              }
            }, { label: 'إلغاء' }]
          });
        };
      }
      Store.api('GET', '/subscription').then(draw).catch(function (e) { body.innerHTML = '<div class="empty">' + E.icon('alert') + '<h3>تعذر تحميل الإعدادات</h3><p>' + esc(e.message) + '</p></div>'; });
    }
  });
})();
