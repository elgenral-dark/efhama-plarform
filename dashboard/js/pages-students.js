(function () {
  'use strict';
  var E = window.Efhama, esc = E.esc, Store = E.Store;
  var SUB = [{ v: 'none', l: 'بدون اشتراك' }, { v: 'pending', l: 'معلّق' }, { v: 'active', l: 'نشط' }, { v: 'expired', l: 'منتهي' }];
  var SUBCLS = { none: '', pending: 'warn', active: 'ok', expired: 'err' };
  var CERT = { valid: ['سارية', 'ok'], revoked: ['ملغاة', 'err'], replaced: ['مستبدلة', 'warn'] };
  var fe = function (e) { return e.fields ? Object.keys(e.fields).map(function (k) { return e.fields[k]; }).join(' — ') : e.message; };
  var subBadge = function (s) { return '<span class="badge ' + SUBCLS[s] + '">' + esc(E.optLabel(SUB, s)) + '</span>'; };
  var ago = function (t) { return t ? esc(E.fmtDate(t)) + ' ' + esc(E.fmtTime(t)) : '<span class="t-sub">لا نشاط</span>'; };

  function studentForm(s, paths, done) {
    var isNew = !s;
    var vals = isNew ? { subStatus: 'none', pathIds: [] } : { name: s.name, email: s.email, phone: s.phone || '', subStatus: s.subStatus === 'expired' ? 'active' : s.subStatus, subStart: s.subStart || '', subEnd: s.subEnd || '', notes: s.notes || '', pathIds: s.pathIds || [] };
    return E.formModal({
      title: isNew ? 'إضافة طالب' : 'تعديل بيانات الطالب', values: vals, size: 'md',
      fields: [
        { key: 'name', label: 'اسم الطالب', type: 'text', required: true },
        { key: 'email', label: 'البريد الإلكتروني', type: 'text', required: true },
        { key: 'phone', label: 'رقم الهاتف (اختياري)', type: 'text' },
        { key: 'subStatus', label: 'حالة الاشتراك', type: 'select', options: SUB.filter(function (x) { return x.v !== 'expired'; }), hint: 'تتحول «نشط» تلقائيًا إلى «منتهي» بعد تاريخ النهاية.' },
        { key: 'subStart', label: 'بداية الاشتراك', type: 'text', placeholder: 'YYYY-MM-DD' },
        { key: 'subEnd', label: 'نهاية الاشتراك', type: 'text', placeholder: 'YYYY-MM-DD' },
        { key: 'pathIds', label: 'المسارات المسجّل بها', type: 'refs', wide: true, options: function () { return paths.map(function (p) { return { v: p.id, l: p.name }; }); } },
        { key: 'notes', label: 'ملاحظات داخلية', type: 'textarea', wide: true }
      ],
      onSave: function (v) {
        var body = { name: v.name, email: v.email, phone: v.phone, subStatus: v.subStatus, subStart: v.subStart || null, subEnd: v.subEnd || null, notes: v.notes, pathIds: v.pathIds };
        return (isNew ? Store.api('POST', '/students', body) : Store.api('PUT', '/students/' + s.id, body)).then(function (r) { E.toast(isNew ? 'تمت إضافة الطالب' : 'تم حفظ بيانات الطالب', { type: 'success' }); done(r); })
          .catch(function (e) { throw new Error(fe(e)); });
      }
    });
  }

  /* ---------- قائمة الطلاب ---------- */
  function list(c, ctx) {
    var st = { q: '', status: '', sub: '', pathId: '', page: 1 }, paths = [];
    var canEdit = E.can('students', 'edit');
    c.innerHTML = '<div class="page-head"><div><h1>الطلاب</h1><p class="sub">بيانات الطلاب وتقدمهم واشتراكاتهم وشهاداتهم.</p></div><div class="acts">' + (canEdit ? '<button class="btn primary" data-add>' + E.icon('plus') + ' إضافة طالب</button>' : '') + '</div></div>' +
      '<div class="toolbar"><div class="search">' + E.icon('search') + '<input type="search" data-q placeholder="بحث بالاسم أو البريد أو الهاتف…" aria-label="بحث"></div>' +
      '<select data-f="status" aria-label="حالة الحساب"><option value="">كل الحسابات</option><option value="active">نشط</option><option value="suspended">موقوف</option></select>' +
      '<select data-f="sub" aria-label="الاشتراك"><option value="">كل الاشتراكات</option>' + SUB.map(function (o) { return '<option value="' + o.v + '">' + o.l + '</option>'; }).join('') + '</select>' +
      '<select data-f="pathId" aria-label="المسار"><option value="">كل المسارات</option></select></div><div class="panel" data-res><div class="skel" style="height:200px;margin:16px"></div></div>';
    var res = E.$('[data-res]', c);
    function load() {
      Store.api('GET', '/students?' + new URLSearchParams(st)).then(function (r) {
        if (!paths.length) { paths = r.paths; E.$('[data-f=pathId]', c).insertAdjacentHTML('beforeend', paths.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('')); }
        if (!r.items.length) { res.innerHTML = '<div class="empty">' + E.icon('users') + '<h3>' + (st.q || st.status || st.sub || st.pathId ? 'لا توجد نتائج' : 'لا يوجد طلاب بعد') + '</h3><p>' + (canEdit && !st.q ? 'أضف طالبًا، أو اربط الموقع لمزامنة الطلاب تلقائيًا (انظر README).' : '') + '</p></div>'; return; }
        res.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الطالب</th><th>الاشتراك</th><th>المسارات</th><th>التقدم</th><th>الدروس</th><th>الاختبارات</th><th>آخر نشاط</th><th></th></tr></thead><tbody>' + r.items.map(function (x) {
          return '<tr><td data-label="الطالب"><div class="t-main">' + esc(x.name) + (x.status === 'suspended' ? ' <span class="badge err">موقوف</span>' : '') + '</div><div class="t-sub" dir="ltr" style="text-align:start">' + esc(x.email) + '</div>' +
            (x.phone ? '<div class="t-sub" dir="ltr" style="text-align:start">' + esc(x.phone) + '</div>' : '') + '<div class="t-sub">تسجيل: ' + esc(E.fmtDate(x.createdAt)) + '</div></td>' +
            '<td data-label="الاشتراك">' + subBadge(x.subStatus) + '</td>' +
            '<td data-label="المسارات">' + (x.paths.length ? esc(x.paths.map(function (p) { return p.name; }).join('، ')) : '<span class="t-sub">—</span>') + '</td>' +
            '<td data-label="التقدم"><div class="mini-bar" title="' + x.progressPct + '%"><span style="width:' + x.progressPct + '%"></span></div><span class="t-sub">' + x.progressPct + '%</span></td>' +
            '<td data-label="الدروس">' + E.num(x.completedLessons) + '</td><td data-label="الاختبارات">' + E.num(x.quizzes) + '</td><td data-label="آخر نشاط">' + ago(x.lastActive) + '</td>' +
            '<td class="acts-cell" data-label=""><a class="btn sm" href="#/students/' + x.id + '">الملف</a></td></tr>';
        }).join('') + '</tbody></table></div><div class="pager"><span>' + E.num(r.total) + ' طالب</span>' + (r.pages > 1 ? '<div class="btns"><button class="btn sm" data-pg="-1"' + (r.page <= 1 ? ' disabled' : '') + '>السابق</button><span>صفحة ' + r.page + ' / ' + r.pages + '</span><button class="btn sm" data-pg="1"' + (r.page >= r.pages ? ' disabled' : '') + '>التالي</button></div>' : '') + '</div>';
      }).catch(function (e) { res.innerHTML = '<div class="empty">' + E.icon('alert') + '<h3>' + esc(e.message) + '</h3></div>'; });
    }
    var tm; E.$('[data-q]', c).addEventListener('input', function (e) { clearTimeout(tm); tm = setTimeout(function () { st.q = e.target.value.trim(); st.page = 1; load(); }, 250); });
    c.addEventListener('change', function (e) { var f = e.target.dataset.f; if (f) { st[f] = e.target.value; st.page = 1; load(); } });
    c.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.add != null) studentForm(null, paths, function (r) { E.Router.go('#/students/' + r.id); });
      else if (b.dataset.pg) { st.page += +b.dataset.pg; load(); }
    });
    load();
  }

  /* ---------- ملف الطالب ---------- */
  function certModal(num) {
    E.modal({ title: 'معاينة الشهادة ' + num, size: 'lg', body: '<iframe class="cert-frame" src="/certificate/' + encodeURIComponent(num) + '" title="الشهادة"></iframe>',
      footer: [{ label: E.icon('download') + ' تنزيل PDF', cls: 'primary', close: false, onClick: function () { window.open('/certificate/' + encodeURIComponent(num) + '?print=1', '_blank', 'noopener'); return false; } }, { label: 'إغلاق' }] });
  }
  function profile(c, id) {
    c.innerHTML = '<div class="skel" style="height:220px"></div>';
    var canEdit = E.can('students', 'edit');
    Store.api('GET', '/students/' + id).then(function (d) {
      var s = d.student, paths = Store.data ? Store.data.paths.map(function (p) { return { id: p.id, name: p.name }; }) : [];
      s.pathIds = d.progress.paths.map(function (p) { return p.pathId; });
      var canIssue = E.flag('certificates.issue'), canRevoke = E.flag('certificates.revoke'), canSusp = E.flag('students.suspend');
      c.innerHTML = '<div class="page-head"><div><a class="btn ghost sm" href="#/students">' + E.icon('arrow') + ' الطلاب</a><h1 style="margin-top:6px">' + esc(s.name) + (s.status === 'suspended' ? ' <span class="badge err">الحساب موقوف</span>' : '') + '</h1><p class="sub" dir="ltr" style="text-align:start">' + esc(s.email) + '</p></div>' +
        '<div class="acts">' + (canEdit ? '<button class="btn" data-edit>' + E.icon('edit') + ' تعديل</button>' : '') +
        (canEdit && canSusp ? '<button class="btn ' + (s.status === 'active' ? '' : 'primary') + '" data-toggle>' + (s.status === 'active' ? 'إيقاف الحساب' : 'تفعيل الحساب') + '</button>' : '') +
        (canIssue ? '<button class="btn primary" data-issue>' + E.icon('cert') + ' إصدار شهادة</button>' : '') + '</div></div>' +
        '<div class="grid-2"><section class="panel panel-pad"><h2 style="margin-bottom:10px">البيانات</h2><dl class="kv"><dt>حالة الاشتراك</dt><dd>' + subBadge(s.subStatus) + (s.subEnd ? ' <span class="t-sub">حتى ' + esc(s.subEnd) + '</span>' : '') + '</dd>' +
        (s.phone !== undefined ? '<dt>الهاتف</dt><dd dir="ltr" style="text-align:start">' + esc(s.phone || '—') + '</dd>' : '') +
        '<dt>تاريخ التسجيل</dt><dd>' + esc(E.fmtDate(s.createdAt)) + '</dd><dt>آخر نشاط</dt><dd>' + ago(s.lastActive) + '</dd><dt>الجلسات</dt><dd>' + E.num(d.sessions.count) + ' · ' + Math.round(d.sessions.seconds / 60) + ' دقيقة نشطة</dd>' +
        (s.notes ? '<dt>ملاحظات</dt><dd>' + esc(s.notes) + '</dd>' : '') + '</dl></section>' +
        '<section class="panel panel-pad"><h2 style="margin-bottom:10px">التقدم التعليمي</h2>' + (d.progress.paths.length ? d.progress.paths.map(function (p) {
          return '<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between"><b>' + esc(p.name) + '</b><span class="t-sub">' + p.done + ' / ' + p.total + ' درس · ' + p.pct + '%</span></div><div class="bar-track"><div class="bar-fill" style="width:' + p.pct + '%"></div></div></div>';
        }).join('') : '<div class="empty-chart">الطالب غير مسجّل في أي مسار.</div>') + '</section></div>' +
        '<section class="panel" style="margin-top:16px"><div class="panel-head"><h2>الشهادات</h2></div><div data-certs class="chart-body"></div></section>' +
        '<div class="grid-2" style="margin-top:16px"><section class="panel"><div class="panel-head"><h2>الدروس المكتملة</h2></div><div class="chart-body">' + (d.lessons.length ? '<ul class="plain">' + d.lessons.slice(0, 30).map(function (l) { return '<li>' + esc(l.title) + ' <span class="t-sub">' + esc(E.fmtDate(l.completedAt)) + '</span></li>'; }).join('') + '</ul>' : '<div class="empty-chart">لا توجد دروس مكتملة.</div>') + '</div></section>' +
        '<section class="panel"><div class="panel-head"><h2>محاولات الاختبارات</h2></div><div class="chart-body">' + (d.attempts.length ? '<ul class="plain">' + d.attempts.map(function (a) { return '<li>' + esc(a.title) + ' — <b>' + a.score + '%</b> ' + (a.passed ? '<span class="badge ok">نجاح</span>' : '<span class="badge err">لم يجتز</span>') + ' <span class="t-sub">' + esc(E.fmtDate(a.at)) + '</span></li>'; }).join('') + '</ul>' : '<div class="empty-chart">لا توجد محاولات.</div>') + '</div></section></div>';

      var cb = E.$('[data-certs]', c);
      cb.innerHTML = d.certificates.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الرقم</th><th>المسار</th><th>الإصدار</th><th>الحالة</th><th></th></tr></thead><tbody>' + d.certificates.map(function (x) {
        return '<tr><td data-label="الرقم" dir="ltr" style="text-align:start"><b>' + esc(x.number) + '</b></td><td data-label="المسار">' + esc(x.pathName) + '</td><td data-label="الإصدار">' + esc(E.fmtDate(x.issuedAt)) + '<div class="t-sub">' + esc(x.issuedBy || '') + '</div></td>' +
          '<td data-label="الحالة"><span class="badge ' + CERT[x.status][1] + '">' + CERT[x.status][0] + '</span>' + (x.revokeReason ? '<div class="t-sub">' + esc(x.revokeReason) + '</div>' : '') + '</td>' +
          '<td class="acts-cell" data-label=""><div class="acts"><button class="icon-btn" data-prev="' + esc(x.number) + '" aria-label="معاينة" title="معاينة">' + E.icon('eye') + '</button><button class="icon-btn" data-pdf="' + esc(x.number) + '" aria-label="تنزيل PDF" title="تنزيل PDF">' + E.icon('download') + '</button>' +
          (x.status === 'valid' && canIssue ? '<button class="btn sm" data-re="' + esc(x.number) + '">إعادة إصدار</button>' : '') + (x.status === 'valid' && canRevoke ? '<button class="btn sm danger" data-rv="' + esc(x.number) + '">إلغاء</button>' : '') + '</div></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty-chart">لم تُصدر شهادات لهذا الطالب بعد.</div>';

      function reasonThen(title, run) {
        E.prompt({ title: title, label: 'السبب (مطلوب — يُسجَّل في سجل العمليات)' }).then(function (reason) {
          if (!reason) return;
          run(reason).then(function () { E.toast('تمت العملية', { type: 'success' }); profile(c, id); }).catch(function (e) { E.toast(fe(e), { type: 'error' }); });
        });
      }
      c.onclick = function (e) {
        var b = e.target.closest('button'); if (!b) return; var x = b.dataset;
        if (x.edit != null) studentForm(s, paths, function () { profile(c, id); });
        else if (x.toggle != null) {
          var to = s.status === 'active' ? 'suspended' : 'active';
          E.confirm({ title: to === 'suspended' ? 'إيقاف الحساب' : 'تفعيل الحساب', message: 'هل تريد ' + (to === 'suspended' ? 'إيقاف' : 'تفعيل') + ' حساب «' + s.name + '»؟', confirmText: 'تأكيد', danger: to === 'suspended' }).then(function (ok) {
            if (ok) Store.api('PUT', '/students/' + id, { status: to }).then(function () { E.toast('تم تحديث حالة الحساب', { type: 'success' }); profile(c, id); }).catch(function (er) { E.toast(fe(er), { type: 'error' }); });
          });
        }
        else if (x.prev) certModal(x.prev);
        else if (x.pdf) window.open('/certificate/' + encodeURIComponent(x.pdf) + '?print=1', '_blank', 'noopener');
        else if (x.re) reasonThen('إعادة إصدار الشهادة', function (r) { return Store.api('POST', '/certificates/' + x.re + '/reissue', { reason: r }); });
        else if (x.rv) reasonThen('إلغاء الشهادة', function (r) { return Store.api('POST', '/certificates/' + x.rv + '/revoke', { reason: r }); });
        else if (x.issue != null) {
          var opts = d.eligibility;
          if (!opts.length) { E.toast('الطالب غير مسجّل في أي مسار', { type: 'error' }); return; }
          var sel = opts[0], body = E.el('<div class="stack"><div class="field"><label>المسار</label><select>' + opts.map(function (o, i) { return '<option value="' + i + '">' + esc(o.name) + '</option>'; }).join('') + '</select></div><div data-el></div></div>');
          function paint() {
            var o = opts[+E.$('select', body).value]; sel = o;
            E.$('[data-el]', body).innerHTML = o.eligible ? '<div class="note-static" style="background:var(--success-soft)">شروط الإنجاز محققة (' + o.progress.done + ' من ' + o.progress.total + ' دروس). يمكن إصدار الشهادة.</div>'
              : '<div class="note-static" style="background:var(--danger-soft)"><b>لا يمكن إصدار الشهادة الآن:</b><ul>' + o.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div>';
          }
          E.$('select', body).addEventListener('change', paint); paint();
          E.modal({ title: 'إصدار شهادة إتمام', body: body, size: 'sm', footer: [{ label: 'إصدار الشهادة', cls: 'primary', onClick: function (ctx) {
            if (!sel.eligible) { E.toast('شروط الإنجاز غير مكتملة', { type: 'error' }); return false; }
            ctx.setBusy(true);
            return Store.api('POST', '/students/' + id + '/certificates', { pathId: sel.pathId }).then(function (r) { ctx.setBusy(false); E.toast('تم إصدار الشهادة ' + r.number, { type: 'success' }); profile(c, id); })
              .catch(function (er) { ctx.setBusy(false); E.toast(fe(er) + (er.reasons ? ': ' + er.reasons.join('، ') : ''), { type: 'error' }); return false; });
          } }, { label: 'إلغاء' }] });
        }
      };
      c.querySelector('[data-issue]') && (c.querySelector('[data-issue]').dataset.issue = '1');
    }).catch(function (e) { c.innerHTML = '<div class="empty panel">' + E.icon('alert') + '<h3>' + esc(e.message) + '</h3><a class="btn primary" href="#/students">العودة</a></div>'; });
  }

  E.page('students', {
    title: 'الطلاب',
    render: function (c, ctx) {
      if (Store.mode !== 'server') { E.needServer(c, 'إدارة الطلاب والشهادات'); return; }
      if (ctx.sub[0]) profile(c, +ctx.sub[0]); else list(c, ctx);
    }
  });
})();
