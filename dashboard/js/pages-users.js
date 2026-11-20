(function () {
  'use strict';
  var E = window.Efhamha, esc = E.esc, Store = E.Store;

  function fieldErr(e) { return e.fields ? Object.keys(e.fields).map(function (k) { return e.fields[k]; }).join(' — ') : e.message; }

  E.page('users', {
    title: 'المستخدمون',
    render: function (c) {
      c.innerHTML = '<div class="page-head"><div><h1>المستخدمون والصلاحيات</h1><p class="sub">أعضاء فريق الإدارة وأدوارهم. تُطبَّق الصلاحيات على الخادم في كل طلب.</p></div><div class="acts"><button class="btn primary" data-add>' + E.icon('plus') + ' إضافة عضو</button></div></div><div class="panel" data-res><div class="skel" style="height:160px;margin:16px"></div></div>';
      if (Store.mode !== 'server') { E.needServer(c, 'إدارة المستخدمين والصلاحيات'); return; }
      var info = null, canEdit = E.can('users', 'edit');
      if (!canEdit) E.$('[data-add]', c).remove();
      var res = E.$('[data-res]', c);

      function secsOf(u) { var r = info.roles.filter(function (x) { return x.id === u.role; })[0]; return u.sectionsList ? u.sectionsList.filter(function (s) { return r.sections.indexOf(s) !== -1; }) : r.sections; }
      function draw() {
        res.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>العضو</th><th>الدور</th><th>الأقسام المسموحة</th><th>الحالة</th><th>آخر دخول</th><th></th></tr></thead><tbody>' + info.users.map(function (u) {
          var ss = secsOf(u);
          return '<tr><td data-label="العضو"><div class="t-main">' + esc(u.displayName) + '</div><div class="t-sub" dir="ltr" style="text-align:start">' + esc(u.username) + '</div></td>' +
            '<td data-label="الدور"><span class="badge brand">' + esc(u.roleLabel) + '</span></td>' +
            '<td data-label="الأقسام"><div class="clip" style="white-space:normal">' + esc(ss.map(function (s) { return info.labels[s]; }).join('، ')) + (u.sectionsList ? ' <span class="badge warn">مخصص</span>' : '') + '</div></td>' +
            '<td data-label="الحالة">' + (u.active ? '<span class="badge ok">نشط</span>' : '<span class="badge err">معطّل</span>') + '</td>' +
            '<td data-label="آخر دخول">' + (u.lastLogin ? esc(E.fmtDate(u.lastLogin)) + ' ' + esc(E.fmtTime(u.lastLogin)) : '—') + '</td>' +
            '<td class="acts-cell" data-label="">' + (canEdit ? '<div class="acts"><button class="icon-btn" data-edit="' + u.id + '" aria-label="تعديل">' + E.icon('edit') + '</button></div>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
          '<div class="panel-pad" style="border-top:1px solid var(--border)"><h3 style="margin-bottom:8px">ماذا يستطيع كل دور؟</h3><ul class="plain">' + info.roles.map(function (r) {
            return '<li><b>' + esc(r.label) + ':</b> ' + esc(r.sections.map(function (s) { return info.labels[s]; }).join('، ')) + '</li>';
          }).join('') + '</ul></div>';
      }
      function load() { return Store.api('GET', '/users').then(function (r) { info = r; draw(); }).catch(function (e) { res.innerHTML = '<div class="empty">' + E.icon('alert') + '<h3>' + esc(e.message) + '</h3></div>'; }); }

      function userForm(u) {
        var isNew = !u;
        var vals = isNew ? { role: 'instructor', restrict: false, sections: [], active: true } : { displayName: u.displayName, role: u.role, active: u.active, restrict: !!u.sectionsList, sections: u.sectionsList || [] };
        var roleSecs = function (v) { var r = info.roles.filter(function (x) { return x.id === v.role; })[0]; return r ? r.sections : []; };
        var fields = [
          isNew ? { key: 'username', label: 'اسم المستخدم (للدخول)', type: 'text', required: true, hint: 'حروف إنجليزية وأرقام فقط.' } : { key: 'note', type: 'note', text: 'اسم المستخدم: ' + u.username },
          { key: 'displayName', label: 'الاسم الظاهر', type: 'text', required: true },
          { key: 'role', label: 'الدور والصلاحيات', type: 'select', options: info.roles.map(function (r) { return { v: r.id, l: r.label }; }), hint: 'المدرس (Instructor): للدروس والاختبارات والأسئلة | الأدمن: كامل الصلاحيات.' },
          isNew ? { key: 'password', label: 'كلمة المرور (10 أحرف على الأقل)', type: 'text', required: true } : { key: 'active', label: 'الحساب نشط', type: 'toggle', default: true },
          { key: 'restrict', label: 'تحديد أقسام معينة بدل الأقسام الافتراضية للدور', type: 'toggle', wide: true },
          { key: 'sections', label: 'الأقسام المسموح بها', type: 'refs', wide: true, dependsOn: ['role'], showIf: function (v) { return v.restrict; }, options: function (v) { return roleSecs(v).map(function (s) { return { v: s, l: info.labels[s] }; }); }, hint: 'لا يمكن منح قسم خارج صلاحيات الدور.' }
        ];
        return E.formModal({
          title: isNew ? 'إضافة عضو' : 'تعديل: ' + u.displayName, values: vals, fields: fields, size: 'md',
          validate: function (v) { if (v.restrict && !(v.sections || []).length) return { sections: 'اختر قسمًا واحدًا على الأقل' }; },
          extraButtons: isNew ? [] : [{ label: 'إعادة تعيين كلمة المرور', push: true, onClick: function () {
            E.prompt({ title: 'كلمة مرور جديدة', label: 'كلمة المرور (10 أحرف على الأقل) — سيُسجَّل خروج العضو من كل الأجهزة' }).then(function (pw) {
              if (!pw) return;
              Store.api('POST', '/users/' + u.id + '/password', { password: pw }).then(function () { E.toast('تم تغيير كلمة المرور', { type: 'success' }); }).catch(function (e) { E.toast(fieldErr(e), { type: 'error' }); });
            });
          } }],
          onSave: function (v) {
            var body = { displayName: v.displayName, role: v.role, sections: v.restrict ? v.sections : null };
            if (isNew) { body.username = v.username; body.password = v.password; } else body.active = v.active;
            return (isNew ? Store.api('POST', '/users', body) : Store.api('PUT', '/users/' + u.id, body)).then(function () { E.toast(isNew ? 'تمت إضافة العضو' : 'تم حفظ التعديلات', { type: 'success' }); return load(); })
              .catch(function (e) { throw new Error(fieldErr(e)); });
          }
        });
      }
      c.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || !info) return;
        if (b.dataset.add != null) userForm(null);
        else if (b.dataset.edit) userForm(info.users.filter(function (x) { return x.id === +b.dataset.edit; })[0]);
      });
      load();
    }
  });
})();
