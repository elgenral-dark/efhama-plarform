(function () {
  'use strict';
  var E = window.Efhama, esc = E.esc, Store = E.Store;

  function show(v, suffix) { return v === null || v === '' || v === undefined ? '<span class="t-sub">غير محدد</span>' : '<b dir="auto">' + esc(v) + (suffix ? ' ' + esc(suffix) : '') + '</b>'; }

  E.page('subscriptions', {
    title: 'الاشتراكات',
    render: function (c) {
      c.innerHTML = '<div class="page-head">' +
        '<div>' +
          '<h1>الاشتراكات</h1>' +
          '<p class="sub">مراجعة طلبات المشتركين الجدد وتأكيد الدفع، وإعدادات الاشتراك المركزية للمنصة.</p>' +
        '</div>' +
        '<div class="acts">' +
          '<button class="btn ghost sm" data-refresh-all>' + E.icon('history') + ' تحديث</button>' +
        '</div>' +
      '</div>' +
      '<div data-body><div class="skel" style="height:280px"></div></div>';

      if (Store.mode !== 'server') { E.needServer(c, 'إعدادات الاشتراك المركزية'); return; }
      var body = E.$('[data-body]', c), canEdit = E.can('subscriptions', 'edit');

      var reqState = { status: 'pending', q: '', page: 1 };
      var curSettings = null;

      function loadRequests(container) {
        container.innerHTML = '<div class="skel" style="height:160px;margin:16px"></div>';
        var params = new URLSearchParams();
        if (reqState.status) params.set('status', reqState.status);
        if (reqState.q) params.set('q', reqState.q);
        if (reqState.page > 1) params.set('page', reqState.page);

        Store.api('GET', '/subscription-requests?' + params.toString()).then(function (r) {
          updateStatsCards(r.counts);
          renderRequestsTable(container, r);
        }).catch(function (err) {
          container.innerHTML = '<div class="empty">' + E.icon('alert') + '<h3>تعذر تحميل طلبات الاشتراك</h3><p>' + esc(err.message) + '</p></div>';
        });
      }

      function updateStatsCards(counts) {
        if (!counts) return;
        var pEl = E.$('[data-stat-pending]', body);
        var aEl = E.$('[data-stat-approved]', body);
        var rEl = E.$('[data-stat-rejected]', body);
        var tEl = E.$('[data-stat-total]', body);
        if (pEl) pEl.textContent = E.num(counts.pending || 0);
        if (aEl) aEl.textContent = E.num(counts.approved || 0);
        if (rEl) rEl.textContent = E.num(counts.rejected || 0);
        if (tEl) tEl.textContent = E.num(counts.total || 0);

        var tbPending = E.$('[data-f-btn="pending"] .tab-count', body);
        var tbApproved = E.$('[data-f-btn="approved"] .tab-count', body);
        var tbRejected = E.$('[data-f-btn="rejected"] .tab-count', body);
        var tbAll = E.$('[data-f-btn=""] .tab-count', body);
        if (tbPending) tbPending.textContent = counts.pending ? '(' + counts.pending + ')' : '';
        if (tbApproved) tbApproved.textContent = counts.approved ? '(' + counts.approved + ')' : '';
        if (tbRejected) tbRejected.textContent = counts.rejected ? '(' + counts.rejected + ')' : '';
        if (tbAll) tbAll.textContent = counts.total ? '(' + counts.total + ')' : '';
      }

      function renderRequestsTable(container, data) {
        var items = data.items || [];
        if (!items.length) {
          container.innerHTML = '<div class="empty">' + E.icon('check') +
            '<h3>' + (reqState.status === 'pending' ? 'لا توجد طلبات اشتراك في الانتظار حاليًا' : 'لا توجد طلبات مطابقة') + '</h3>' +
            '<p class="sub">' + (reqState.status === 'pending' ? 'جميع المشتركين الذين سددوا الرسوم تمت مراجعتهم وتفعيل حساباتهم.' : 'جرب تغيير شروط البحث أو الفلتر.') + '</p>' +
          '</div>';
          return;
        }

        var html = '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
          '<th>الطالب</th>' +
          '<th>بيانات التحويل</th>' +
          '<th>المدة والطلب</th>' +
          '<th>إثبات الدفع</th>' +
          '<th>الحالة</th>' +
          '<th style="text-align:center">الإجراءات</th>' +
          '</tr></thead><tbody>';

        items.forEach(function (x) {
          var statusBadge = '';
          if (x.status === 'pending') {
            statusBadge = '<span class="badge warn" style="display:inline-flex;align-items:center;gap:4px">' + E.icon('clock', 'sm') + ' في انتظار المراجعة</span>';
          } else if (x.status === 'approved') {
            statusBadge = '<span class="badge ok" style="display:inline-flex;align-items:center;gap:4px">' + E.icon('check', 'sm') + ' تم القبول والتفعيل</span>' +
              (x.reviewedBy ? '<div class="t-sub" style="font-size:11.5px;margin-top:3px">بواسطة ' + esc(x.reviewedBy) + '</div>' : '');
          } else {
            statusBadge = '<span class="badge err" style="display:inline-flex;align-items:center;gap:4px" title="' + esc(x.rejectionReason || '') + '">' + E.icon('x', 'sm') + ' مرفوض</span>' +
              (x.rejectionReason ? '<div class="t-sub" style="font-size:11.5px;color:var(--danger);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(x.rejectionReason) + '">' + esc(x.rejectionReason) + '</div>' : '');
          }

          var proofCell = '';
          if (x.proofUrl) {
            proofCell = '<button class="btn ghost sm" data-view-proof="' + x.id + '" style="font-size:12.5px;padding:2px 8px">' + E.icon('eye') + ' معاينة الإيصال</button>';
          } else {
            proofCell = '<span class="t-sub" style="font-size:12px">تحويل كاش</span>';
          }

          var acts = '';
          if (x.status === 'pending') {
            if (canEdit) {
              acts = '<div style="display:flex;gap:6px;justify-content:center">' +
                '<button class="btn primary sm" data-act="approve" data-id="' + x.id + '" title="قبول وتفعيل اشتراك الطالب">' + E.icon('check') + ' قبول</button>' +
                '<button class="btn danger sm" data-act="reject" data-id="' + x.id + '" title="رفض الطلب">' + E.icon('x') + ' رفض</button>' +
                '<button class="btn ghost sm" data-act="details" data-id="' + x.id + '" title="عرض التفاصيل">' + E.icon('eye') + '</button>' +
              '</div>';
            } else {
              acts = '<button class="btn ghost sm" data-act="details" data-id="' + x.id + '">عرض التفاصيل</button>';
            }
          } else {
            acts = '<div style="display:flex;gap:6px;justify-content:center">' +
              '<button class="btn ghost sm" data-act="details" data-id="' + x.id + '">' + E.icon('eye') + ' التفاصيل</button>' +
            '</div>';
          }

          html += '<tr>' +
            '<td data-label="الطالب">' +
              '<div class="t-main"><b>' + esc(x.studentName) + '</b></div>' +
              '<div class="t-sub" dir="ltr" style="text-align:start">' + esc(x.studentEmail) + '</div>' +
              (x.studentPhone ? '<div class="t-sub" dir="ltr" style="text-align:start">' + esc(x.studentPhone) + '</div>' : '') +
            '</td>' +
            '<td data-label="بيانات التحويل">' +
              '<div style="font-weight:700;color:var(--brand-ink)">' + esc(x.amount) + ' ' + esc(x.currency) + '</div>' +
              '<div class="t-sub">' + esc(x.method) + '</div>' +
              (x.reference ? '<div class="t-sub" dir="ltr" style="text-align:start"><code dir="ltr" style="font-size:11px">' + esc(x.reference) + '</code></div>' : '') +
            '</td>' +
            '<td data-label="المدة والطلب">' +
              '<div><b>' + esc(x.planDurationMonths) + ' شهرًا</b></div>' +
              '<div class="t-sub">' + esc(E.fmtDate(x.createdAt)) + ' ' + esc(E.fmtTime(x.createdAt)) + '</div>' +
            '</td>' +
            '<td data-label="إثبات الدفع">' + proofCell + '</td>' +
            '<td data-label="الحالة">' + statusBadge + '</td>' +
            '<td data-label="الإجراءات" class="acts-cell" style="text-align:center">' + acts + '</td>' +
          '</tr>';
        });

        html += '</tbody></table></div>';

        if (data.pages > 1) {
          html += '<div class="pager" style="margin-top:12px">' +
            '<span>' + E.num(data.total) + ' طلب</span>' +
            '<div class="btns">' +
              '<button class="btn sm" data-pg="-1"' + (data.page <= 1 ? ' disabled' : '') + '>السابق</button>' +
              '<span>صفحة ' + data.page + ' / ' + data.pages + '</span>' +
              '<button class="btn sm" data-pg="1"' + (data.page >= data.pages ? ' disabled' : '') + '>التالي</button>' +
            '</div>' +
          '</div>';
        }

        container.innerHTML = html;
      }

      function draw(cur) {
        curSettings = cur;
        body.innerHTML = '' +
          // 1. Stats Row
          '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:14px;margin-bottom:20px">' +
            '<div class="stat-card" style="border-inline-start:4px solid #eab308">' +
              '<div class="stat-icon-wrap" style="background:rgba(234, 179, 8, 0.15);color:#ca8a04">' + E.icon('clock') + '</div>' +
              '<div class="stat-info">' +
                '<span class="n" data-stat-pending>0</span>' +
                '<span class="l">في انتظار الموافقة</span>' +
              '</div>' +
            '</div>' +
            '<div class="stat-card" style="border-inline-start:4px solid #10b981">' +
              '<div class="stat-icon-wrap" style="background:rgba(16, 185, 129, 0.15);color:#059669">' + E.icon('check') + '</div>' +
              '<div class="stat-info">' +
                '<span class="n" data-stat-approved>0</span>' +
                '<span class="l">اشتراكات مقبولة</span>' +
              '</div>' +
            '</div>' +
            '<div class="stat-card" style="border-inline-start:4px solid #ef4444">' +
              '<div class="stat-icon-wrap" style="background:rgba(239, 68, 68, 0.15);color:#dc2626">' + E.icon('x') + '</div>' +
              '<div class="stat-info">' +
                '<span class="n" data-stat-rejected>0</span>' +
                '<span class="l">طلبات مرفوضة</span>' +
              '</div>' +
            '</div>' +
            '<div class="stat-card" style="border-inline-start:4px solid var(--brand)">' +
              '<div class="stat-icon-wrap">' + E.icon('wallet') + '</div>' +
              '<div class="stat-info">' +
                '<span class="n" style="font-size:22px">' + (cur.price != null ? esc(cur.price) + ' <small style="font-size:13px">' + esc(cur.currencyLabel || 'جنيه') + '</small>' : 'غير محدد') + '</span>' +
                '<span class="l">سعر الاشتراك الحالي</span>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // 2. Pending Subscriptions Panel
          '<section class="panel" style="margin-bottom:24px">' +
            '<div class="panel-head" style="flex-wrap:wrap;gap:12px">' +
              '<div>' +
                '<h2>طلبات الاشتراك والموافقات</h2>' +
                '<p class="sub">مراجعة الطلاب الذين قاموا بالدفع والموافقة على تفعيل حساباتهم أو رفضها مع ذكر السبب.</p>' +
              '</div>' +
              '<div class="acts">' +
                (canEdit ? '<button class="btn primary sm" data-add-request>' + E.icon('plus') + ' تسجيل طلب اشتراك يدوي</button>' : '') +
              '</div>' +
            '</div>' +
            '<div style="padding:16px 22px 0">' +
              '<div class="toolbar" style="margin-bottom:12px">' +
                '<div class="search">' +
                  E.icon('search') +
                  '<input type="search" data-req-q placeholder="بحث بالاسم أو البريد أو الهاتف أو كود المعاملة…" aria-label="بحث في طلبات الاشتراك">' +
                '</div>' +
                '<div class="tabs" style="margin-bottom:0" role="tablist">' +
                  '<button type="button" data-f-btn="pending" aria-selected="true">في انتظار المراجعة <span class="tab-count"></span></button>' +
                  '<button type="button" data-f-btn="approved" aria-selected="false">المقبولة <span class="tab-count"></span></button>' +
                  '<button type="button" data-f-btn="rejected" aria-selected="false">المرفوضة <span class="tab-count"></span></button>' +
                  '<button type="button" data-f-btn="" aria-selected="false">كل الطلبات <span class="tab-count"></span></button>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div data-requests-list style="padding-bottom:16px">' +
              '<div class="skel" style="height:140px;margin:16px"></div>' +
            '</div>' +
          '</section>' +

          // 3. Subscription Settings Section (Kept exact for backwards compatibility & tests)
          '<div class="grid-2">' +
            '<section class="panel panel-pad">' +
              '<h2 style="margin-bottom:12px">القيم الحالية</h2>' +
              '<dl class="kv">' +
                '<dt>سعر الاشتراك</dt><dd>' + show(cur.price, cur.currencyLabel) + '</dd>' +
                '<dt>رقم الكاش لاستقبال المدفوعات</dt><dd dir="ltr" style="text-align:start">' + show(cur.cashNumber) + '</dd>' +
                '<dt>رقم WhatsApp للتواصل والاشتراكات</dt><dd dir="ltr" style="text-align:start">' + show(cur.whatsapp) + '</dd>' +
              '</dl>' +
              '<p class="hint" style="margin-top:12px">' + (cur.updatedAt ? 'آخر تعديل: ' + esc(E.fmtDate(cur.updatedAt)) + ' ' + esc(E.fmtTime(cur.updatedAt)) + ' بواسطة ' + esc(cur.updatedBy || '') : 'لم تُحفظ أي قيم بعد.') + '</p>' +
            '</section>' +
            '<section class="panel panel-pad">' +
              '<h2 style="margin-bottom:12px">' + (canEdit ? 'تعديل الإعدادات' : 'عرض فقط') + '</h2>' +
              '<div data-form></div>' +
              (canEdit ? '<div style="margin-top:16px"><button class="btn primary" data-save>' + E.icon('check') + ' حفظ التغييرات</button></div>' : '') +
            '</section>' +
          '</div>' +
          '<section class="panel panel-pad" style="margin-top:16px">' +
            '<h3>كيف تصل القيم للموقع؟</h3>' +
            '<p class="sub" style="margin-top:6px">تُحفظ في قاعدة البيانات (مصدر واحد) وتُنشر تلقائيًا في <code dir="ltr">/public/efhama-data.json</code> تحت المفتاح <code dir="ltr">subscription</code>. اقرأها في صفحات الاشتراك والدفع من هناك بدل كتابتها داخل الملفات.</p>' +
          '</section>';

        if (canEdit) {
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

        var reqContainer = E.$('[data-requests-list]', body);
        loadRequests(reqContainer);

        var tabBtns = E.$$('[data-f-btn]', body);
        tabBtns.forEach(function (btn) {
          btn.onclick = function () {
            tabBtns.forEach(function (b) { b.setAttribute('aria-selected', 'false'); });
            btn.setAttribute('aria-selected', 'true');
            reqState.status = btn.getAttribute('data-f-btn');
            reqState.page = 1;
            loadRequests(reqContainer);
          };
        });

        var qInput = E.$('[data-req-q]', body);
        var qTimer;
        if (qInput) {
          qInput.addEventListener('input', function (e) {
            clearTimeout(qTimer);
            qTimer = setTimeout(function () {
              reqState.q = e.target.value.trim();
              reqState.page = 1;
              loadRequests(reqContainer);
            }, 250);
          });
        }

        var addBtn = E.$('[data-add-request]', body);
        if (addBtn) {
          addBtn.onclick = function () {
            openAddRequestModal(cur.price, function () {
              loadRequests(reqContainer);
            });
          };
        }

        reqContainer.addEventListener('click', function (e) {
          var btn = e.target.closest('button');
          if (!btn) return;

          if (btn.dataset.pg) {
            reqState.page += Number(btn.dataset.pg);
            loadRequests(reqContainer);
            return;
          }

          var proofId = btn.dataset.viewProof;
          if (proofId) {
            fetchAndShowProof(proofId, function () { loadRequests(reqContainer); });
            return;
          }

          var act = btn.dataset.act, id = btn.dataset.id;
          if (!act || !id) return;

          fetchRequestDetails(id, function (item) {
            if (act === 'approve') {
              openApproveModal(item, function () { loadRequests(reqContainer); });
            } else if (act === 'reject') {
              openRejectModal(item, function () { loadRequests(reqContainer); });
            } else if (act === 'details') {
              openDetailsModal(item, function () { loadRequests(reqContainer); });
            }
          });
        });
      }

      function fetchRequestDetails(id, callback) {
        Store.api('GET', '/subscription-requests?q=' + encodeURIComponent(id)).then(function (r) {
          var it = (r.items || []).find(function (x) { return String(x.id) === String(id); });
          if (it) callback(it);
          else E.toast('تعذر العثور على بيانات الطلب', { type: 'warn' });
        }).catch(function (e) { E.toast(e.message, { type: 'error' }); });
      }

      function fetchAndShowProof(id, onRefresh) {
        fetchRequestDetails(id, function (item) {
          if (!item.proofUrl) {
            E.toast('لا يوجد إثبات مرفوع لهذا الطلب', { type: 'info' });
            return;
          }
          openDetailsModal(item, onRefresh);
        });
      }

      function openApproveModal(item, onDone) {
        var todayStr = new Date().toISOString().slice(0, 10);
        E.modal({
          title: 'قبول وتفعيل اشتراك: ' + esc(item.studentName),
          size: 'md',
          body: '<div>' +
            '<p style="font-size:15px;line-height:1.6">أنت على وشك <b>قبول طلب الاشتراك</b> وتفعيل حساب الطالب على المنصة.</p>' +
            '<div class="panel panel-pad" style="background:var(--surface-2);margin:14px 0">' +
              '<dl class="kv">' +
                '<dt>اسم الطالب</dt><dd><b>' + esc(item.studentName) + '</b></dd>' +
                '<dt>البريد الإلكتروني</dt><dd dir="ltr" style="text-align:start">' + esc(item.studentEmail) + '</dd>' +
                (item.studentPhone ? '<dt>رقم الهاتف</dt><dd dir="ltr" style="text-align:start">' + esc(item.studentPhone) + '</dd>' : '') +
                '<dt>المبلغ المدفوع</dt><dd><b style="color:var(--brand-ink)">' + esc(item.amount) + ' ' + esc(item.currency) + '</b> (' + esc(item.method) + ')</dd>' +
                (item.reference ? '<dt>رقم العملية / المرجع</dt><dd dir="ltr" style="text-align:start"><code dir="ltr">' + esc(item.reference) + '</code></dd>' : '') +
              '</dl>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px">' +
              '<div>' +
                '<label style="display:block;margin-bottom:6px;font-weight:600">مدة تفعيل الاشتراك</label>' +
                '<select data-approve-months style="width:100%">' +
                  '<option value="12" selected>سنة كاملة (12 شهرًا)</option>' +
                  '<option value="6">6 أشهر (نصف سنوي)</option>' +
                  '<option value="3">3 أشهر (فصل دراسي)</option>' +
                  '<option value="1">شهر واحد</option>' +
                  '<option value="24">سنتان (24 شهرًا)</option>' +
                '</select>' +
              '</div>' +
              '<div>' +
                '<label style="display:block;margin-bottom:6px;font-weight:600">تاريخ بدء الاشتراك</label>' +
                '<input type="date" data-approve-start value="' + todayStr + '" style="width:100%">' +
              '</div>' +
            '</div>' +
            '<p class="hint">عند التأكيد: سيتم تفعيل حساب الطالب كـ «نشط»، وحساب تاريخ الانتهاء تلقائيًا، وتسجيل الدفعة في السجلات والتحليلات المالية.</p>' +
          '</div>',
          footer: [
            {
              label: E.icon('check') + ' تأكيد وقبول الاشتراك',
              cls: 'primary',
              onClick: function (ctx) {
                ctx.setBusy(true);
                var dur = Number(E.$('[data-approve-months]', ctx.el).value) || 12;
                var st = E.$('[data-approve-start]', ctx.el).value || todayStr;
                return Store.api('POST', '/subscription-requests/' + item.id + '/approve', { durationMonths: dur, startDate: st })
                  .then(function () {
                    ctx.setBusy(false);
                    E.toast('تم قبول الطلب وتفعيل اشتراك الطالب بنجاح!', { type: 'success' });
                    onDone();
                  })
                  .catch(function (err) {
                    ctx.setBusy(false);
                    E.toast('فشل قبول الطلب: ' + err.message, { type: 'error' });
                    return false;
                  });
              }
            },
            { label: 'إلغاء' }
          ]
        });
      }

      function openRejectModal(item, onDone) {
        E.modal({
          title: 'رفض طلب اشتراك: ' + esc(item.studentName),
          size: 'md',
          body: '<div>' +
            '<p style="color:var(--danger);font-weight:600">سيتم رفض هذا الطلب ولن يتم تفعيل اشتراك الطالب.</p>' +
            '<p class="sub" style="margin-top:4px">الطالب: <b>' + esc(item.studentName) + '</b> (' + esc(item.amount) + ' ' + esc(item.currency) + ')</p>' +
            '<div style="margin:14px 0">' +
              '<label style="display:block;margin-bottom:6px;font-weight:600">سبب الرفض <span style="color:var(--danger)">*</span></label>' +
              '<textarea data-reject-reason rows="3" placeholder="اكتب سبب الرفض هنا ليتم توضيحه للطالب..." style="width:100%"></textarea>' +
              '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">' +
                '<span class="sub" style="font-size:12px;align-self:center">أسباب شائعة:</span>' +
                '<button type="button" class="btn ghost sm data-quick-reason" data-r="لم يتم استلام أي تحويل على رقم الكاش">لم يصل التحويل</button>' +
                '<button type="button" class="btn ghost sm data-quick-reason" data-r="صورة إثبات الدفع غير واضحة أو غير مكتملة">صورة غير واضحة</button>' +
                '<button type="button" class="btn ghost sm data-quick-reason" data-r="المبلغ المحول غير مطابق لقيمة الاشتراك">المبلغ غير مطابق</button>' +
                '<button type="button" class="btn ghost sm data-quick-reason" data-r="رقم العملية / كود التحويل غير صحيح">كود غير صحيح</button>' +
              '</div>' +
            '</div>' +
          '</div>',
          footer: [
            {
              label: E.icon('x') + ' تأكيد رفض الطلب',
              cls: 'danger',
              onClick: function (ctx) {
                var reason = (E.$('[data-reject-reason]', ctx.el).value || '').trim();
                if (reason.length < 2) {
                  E.toast('يرجى كتابة سبب الرفض أولاً', { type: 'warn' });
                  return false;
                }
                ctx.setBusy(true);
                return Store.api('POST', '/subscription-requests/' + item.id + '/reject', { reason: reason })
                  .then(function () {
                    ctx.setBusy(false);
                    E.toast('تم تسجيل رفض الطلب وحفظ السبب', { type: 'info' });
                    onDone();
                  })
                  .catch(function (err) {
                    ctx.setBusy(false);
                    E.toast('فشل رفض الطلب: ' + err.message, { type: 'error' });
                    return false;
                  });
              }
            },
            { label: 'إلغاء' }
          ]
        });

        setTimeout(function () {
          var modalOverlay = document.querySelectorAll('.modal-back');
          var lastModal = modalOverlay[modalOverlay.length - 1];
          if (!lastModal) return;
          lastModal.querySelectorAll('.data-quick-reason').forEach(function (btn) {
            btn.onclick = function () {
              var ta = lastModal.querySelector('[data-reject-reason]');
              if (ta) ta.value = btn.getAttribute('data-r');
            };
          });
        }, 50);
      }

      function openDetailsModal(item, onRefresh) {
        var isPending = item.status === 'pending';
        var statusBadge = item.status === 'approved' ? '<span class="badge ok">تم القبول والتفعيل</span>' : item.status === 'rejected' ? '<span class="badge err">مرفوض</span>' : '<span class="badge warn">قيد الانتظار</span>';
        var foot = [];
        if (canEdit && isPending) {
          foot.push({
            label: E.icon('check') + ' قبول الطلب', cls: 'primary',
            onClick: function (ctx) { ctx.close(); openApproveModal(item, onRefresh); return false; }
          });
          foot.push({
            label: E.icon('x') + ' رفض الطلب', cls: 'danger',
            onClick: function (ctx) { ctx.close(); openRejectModal(item, onRefresh); return false; }
          });
        }
        foot.push({ label: 'إغلاق' });

        E.modal({
          title: 'تفاصيل طلب الاشتراك #' + item.id,
          size: 'md',
          body: '<div>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
              '<h3>' + esc(item.studentName) + '</h3>' + statusBadge +
            '</div>' +
            '<div class="panel panel-pad" style="background:var(--surface-2);margin-bottom:14px">' +
              '<dl class="kv">' +
                '<dt>البريد الإلكتروني</dt><dd dir="ltr" style="text-align:start">' + esc(item.studentEmail) + '</dd>' +
                (item.studentPhone ? '<dt>رقم الهاتف</dt><dd dir="ltr" style="text-align:start">' + esc(item.studentPhone) + '</dd>' : '') +
                '<dt>المبلغ</dt><dd><b>' + esc(item.amount) + ' ' + esc(item.currency) + '</b></dd>' +
                '<dt>طريقة الدفع</dt><dd>' + esc(item.method) + '</dd>' +
                (item.reference ? '<dt>كود العملية / المرجع</dt><dd dir="ltr" style="text-align:start"><code dir="ltr">' + esc(item.reference) + '</code></dd>' : '') +
                '<dt>مدة الاشتراك</dt><dd>' + esc(item.planDurationMonths) + ' شهرًا</dd>' +
                '<dt>تاريخ التقديم</dt><dd>' + esc(E.fmtDate(item.createdAt)) + ' ' + esc(E.fmtTime(item.createdAt)) + '</dd>' +
                (item.reviewedAt ? '<dt>تاريخ المراجعة</dt><dd>' + esc(E.fmtDate(item.reviewedAt)) + ' ' + esc(E.fmtTime(item.reviewedAt)) + (item.reviewedBy ? ' بواسطة ' + esc(item.reviewedBy) : '') + '</dd>' : '') +
                (item.rejectionReason ? '<dt>سبب الرفض</dt><dd style="color:var(--danger)"><b>' + esc(item.rejectionReason) + '</b></dd>' : '') +
                (item.notes ? '<dt>ملاحظات</dt><dd>' + esc(item.notes) + '</dd>' : '') +
              '</dl>' +
            '</div>' +
            (item.proofUrl ? '<div style="margin-top:14px"><b>صورة إثبات الدفع / الإيصال:</b><div style="margin-top:8px;text-align:center"><img src="' + esc(item.proofUrl) + '" alt="إثبات الدفع" style="max-width:100%;max-height:360px;border-radius:10px;border:1px solid var(--border)"></div></div>' : '') +
            (item.studentId ? '<div style="margin-top:14px"><a class="btn ghost sm" href="#/students/' + item.studentId + '">' + E.icon('arrow') + ' الانتقال لملف الطالب في قسم الطلاب</a></div>' : '') +
          '</div>',
          footer: foot
        });
      }

      function openAddRequestModal(defaultPrice, onDone) {
        E.formModal({
          title: 'تسجيل طلب اشتراك جديد يدويًا',
          size: 'md',
          saveLabel: 'حفظ الطلب',
          values: {
            studentName: '',
            studentEmail: '',
            studentPhone: '',
            amount: defaultPrice || 0,
            currency: 'EGP',
            method: 'فودافون كاش',
            reference: '',
            planDurationMonths: 12,
            proofUrl: '',
            notes: ''
          },
          fields: [
            { key: 'studentName', label: 'اسم الطالب', type: 'text', required: true },
            { key: 'studentEmail', label: 'البريد الإلكتروني', type: 'text', required: true },
            { key: 'studentPhone', label: 'رقم الهاتف / رقم الكاش المحوّل منه', type: 'text', placeholder: '01xxxxxxxxx' },
            { key: 'amount', label: 'المبلغ المدفوع', type: 'number', min: 0, required: true },
            { key: 'currency', label: 'العملة', type: 'text' },
            { key: 'method', label: 'طريقة الدفع', type: 'select', options: [
              { v: 'فودافون كاش', l: 'فودافون كاش' },
              { v: 'إنستاباي InstaPay', l: 'إنستاباي InstaPay' },
              { v: 'محفظة إلكترونية أخرى', l: 'محفظة إلكترونية أخرى' },
              { v: 'تحويل بنكي', l: 'تحويل بنكي' },
              { v: 'دفع نقدي مباشر', l: 'دفع نقدي مباشر' }
            ]},
            { key: 'reference', label: 'رقم المعاملة / كود التحويل', type: 'text', placeholder: 'مثال: TRX-123456' },
            { key: 'planDurationMonths', label: 'مدة الاشتراك (بالأشهر)', type: 'number', min: 1, max: 60 },
            { key: 'proofUrl', label: 'رابط صورة إثبات الدفع (اختياري)', type: 'text', placeholder: 'https://... أو /uploads/...' },
            { key: 'notes', label: 'ملاحظات إضافية', type: 'textarea', wide: true }
          ],
          onSave: function (v) {
            return Store.api('POST', '/subscription-requests', {
              studentName: v.studentName,
              studentEmail: v.studentEmail,
              studentPhone: v.studentPhone,
              amount: Number(v.amount) || 0,
              currency: v.currency || 'EGP',
              method: v.method,
              reference: v.reference,
              planDurationMonths: Number(v.planDurationMonths) || 12,
              proofUrl: v.proofUrl,
              notes: v.notes
            }).then(function () {
              E.toast('تمت إضافة طلب الاشتراك بنجاح!', { type: 'success' });
              onDone();
            });
          }
        });
      }

      var refreshAllBtn = E.$('[data-refresh-all]', c);
      if (refreshAllBtn) {
        refreshAllBtn.onclick = function () {
          Store.api('GET', '/subscription').then(draw).catch(function (e) {
            body.innerHTML = '<div class="empty">' + E.icon('alert') + '<h3>تعذر تحديث البيانات</h3><p>' + esc(e.message) + '</p></div>';
          });
        };
      }

      Store.api('GET', '/subscription').then(draw).catch(function (e) {
        body.innerHTML = '<div class="empty">' + E.icon('alert') + '<h3>تعذر تحميل الإعدادات</h3><p>' + esc(e.message) + '</p></div>';
      });
    }
  });
})();
