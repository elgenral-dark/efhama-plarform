(function () {
  'use strict';
  var E = window.Efhamha, esc = E.esc, Store = E.Store;
  var rid = function () { return 'b_' + Math.random().toString(36).slice(2, 9); };

  function buildDraft(r, form, original) {
    var res = r.result;
    var blocks = res.blocks.map(function (b) { var c = Object.assign({ id: rid() }, b); if (b.type === 'heading') c.level = String(b.level); return c; });
    res.diagrams.slice().sort(function (a, b) { return b.afterBlock - a.afterBlock; }).forEach(function (d) {
      blocks.splice(Math.min(d.afterBlock + 1, blocks.length), 0, { id: rid(), type: 'diagram', image: '', alt: d.title, caption: d.title + (d.description ? ' — ' + d.description : ''), ai: true });
    });
    if (res.summary.length) blocks.push({ id: rid(), type: 'summary', items: res.summary });
    return {
      lesson: { title: form.title, moduleId: form.moduleId, summary: '', level: form.level, duration: form.duration || 10, status: 'draft', objectives: res.objectives, prerequisites: [], blocks: blocks, terms: [],
        aiMeta: { generated: true, reviewed: false, provider: r.provider, model: r.model, at: new Date().toISOString() } },
      original: original, form: form, position: form.position || 'end',
      ai: { terms: res.terms, review: res.review, notes: res.notes, fidelity: r.fidelity }
    };
  }

  E.page('ai', {
    title: 'AI Lesson Creator',
    render: function (c) {
      c.innerHTML = '<div class="page-head"><div><h1>AI Lesson Creator</h1><p class="sub">ألصق محتوى الدرس الخام وسيُنظَّم لك كمسودة. لا يُنشر أي درس إلا بعد مراجعتك وموافقتك الصريحة.</p></div></div><div data-body><div class="skel" style="height:260px"></div></div>';
      if (Store.mode !== 'server') { E.needServer(c, 'التنظيم بالذكاء الاصطناعي (الاتصال بالمزوّد يتم من الخادم فقط، ولا تُوضع مفاتيح API في المتصفح)'); return; }
      var body = E.$('[data-body]', c);
      Store.api('GET', '/ai/settings').then(function (cfg) { draw(cfg); }).catch(function (e) { body.innerHTML = '<div class="empty">' + E.icon('alert') + '<h3>' + esc(e.message) + '</h3></div>'; });

      function draw(cfg) {
        var ready = cfg.keyConfigured && !!cfg.model;
        body.innerHTML = '<div class="tabs" role="tablist"><button role="tab" data-t="create" aria-selected="true">إنشاء درس</button>' + (cfg.canEdit ? '<button role="tab" data-t="tech" aria-selected="false">الإعدادات التقنية</button>' : '') + '</div><div data-tab></div>';
        var tab = E.$('[data-tab]', body);
        function show(k) { E.$$('[role=tab]', body).forEach(function (b) { b.setAttribute('aria-selected', b.dataset.t === k); }); tab.innerHTML = ''; (k === 'create' ? create : tech)(tab); }
        E.$('.tabs', body).addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) show(b.dataset.t); });

        function create(box) {
          var redo = null; try { redo = JSON.parse(sessionStorage.getItem('efhamha:ai-redo') || 'null'); } catch (e) { redo = null; }
          sessionStorage.removeItem('efhamha:ai-redo');
          var vals = redo || { level: 'beginner', duration: 10, position: 'end' };
          var modsOf = function (v) { return E.moduleOptions(v.pathId); };
          var form = E.buildForm([
            { key: 'text', label: 'محتوى الدرس الخام', type: 'textarea', rows: 14, wide: true, required: true, placeholder: 'ألصق هنا نص الدرس كاملًا…' },
            { key: 'pathId', label: 'المسار التعليمي', type: 'select', required: true, empty: 'اختر المسار', options: E.pathOptions },
            { key: 'moduleId', label: 'الوحدة', type: 'select', required: true, empty: 'اختر الوحدة', dependsOn: ['pathId'], options: modsOf },
            { key: 'title', label: 'عنوان الدرس', type: 'text', required: true, wide: true },
            { key: 'level', label: 'مستوى الصعوبة', type: 'select', options: E.levelOptions },
            { key: 'duration', label: 'المدة التقريبية (دقيقة)', type: 'number', min: 1, max: 600 },
            { key: 'position', label: 'مكان الدرس داخل الوحدة', type: 'select', wide: true, dependsOn: ['moduleId'], options: function (v) {
              var ls = Store.list('lessons').filter(function (l) { return l.moduleId === v.moduleId; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
              return [{ v: 'end', l: 'في نهاية الوحدة' }, { v: 'start', l: 'في بداية الوحدة' }].concat(ls.map(function (l) { return { v: 'after:' + l.id, l: 'بعد: ' + l.title }; }));
            } }
          ], vals, { onChange: function (v) { counter(v.text); } });
          box.innerHTML = '<div class="panel panel-pad stack" data-card></div>';
          var card = E.$('[data-card]', box);
          if (!ready) {
            card.insertAdjacentHTML('beforeend', '<div class="banner" style="margin:0">' + E.icon('alert') + '<div><b>الميزة غير مفعّلة بعد على الخادم:</b><ul style="margin:6px 0 0"><li>مفتاح API: ' + (cfg.keyConfigured ? '✓ مضبوط' : '✗ عيّن متغير البيئة <code dir="ltr">AI_API_KEY</code> على الخادم ثم أعد تشغيله') + '</li><li>النموذج: ' + (cfg.model ? '✓ ' + esc(cfg.model) : '✗ حدّد اسم النموذج من «الإعدادات التقنية»') + '</li></ul><p style="margin:6px 0 0">لا يوجد وضع محاكاة: لن يعمل زر التنظيم حتى يكتمل الإعداد.</p></div></div>');
          }
          card.appendChild(form.el);
          card.insertAdjacentHTML('beforeend', '<div class="hint" data-count></div><div><button class="btn primary" data-go ' + (ready ? '' : 'disabled') + '>' + E.icon('sparkle') + ' تنظيم الدرس بالذكاء الاصطناعي</button> <span class="hint" data-msg></span></div>' +
            '<p class="hint">القواعد المطبّقة: لا اختراع معلومات، لا تغيير المعنى، لا حذف، شرح بالعامية المصرية المبسطة، المصطلحات التقنية بالإنجليزية. كل ما يضيفه الذكاء الاصطناعي (أمثلة/توضيحات) يُعلَّم ويجب مراجعته.</p>');
          function counter(t) { E.$('[data-count]', box).textContent = E.num((t || '').length) + ' / ' + E.num(cfg.maxChars) + ' حرف'; }
          counter(vals.text);
          E.Router.guard = { dirty: function () { return form.isDirty() && !!(form.values.text || '').trim(); } };
          var go = E.$('[data-go]', box), msg = E.$('[data-msg]', box);
          go.onclick = function () {
            if (!form.validate()) { E.toast('أكمل الحقول المطلوبة', { type: 'error' }); return; }
            var v = form.values;
            if (v.text.length > cfg.maxChars) { E.toast('النص أطول من الحد (' + E.num(cfg.maxChars) + ' حرف)', { type: 'error' }); return; }
            go.disabled = true; go.innerHTML = '<span class="spin"></span> جارٍ التنظيم…'; msg.textContent = 'قد يستغرق ذلك حتى دقيقتين.';
            var p = Store.data.paths.filter(function (x) { return x.id === v.pathId; })[0], m = Store.byId('modules', v.moduleId);
            Store.api('POST', '/ai/organize', { text: v.text, meta: { pathName: p && p.name, moduleTitle: m && m.title, title: v.title, level: v.level, duration: v.duration } }).then(function (r) {
              sessionStorage.setItem('efhamha:ai-draft', JSON.stringify(buildDraft(r, v, v.text)));
              E.Router.guard = null;
              E.Router.go('#/lessons/new?ai=1');
            }).catch(function (e) {
              go.disabled = false; go.innerHTML = E.icon('sparkle') + ' تنظيم الدرس بالذكاء الاصطناعي'; msg.textContent = '';
              E.toast(e.message, { type: 'error', timeout: 9000 });
            });
          };
        }

        function tech(box) {
          var f = E.buildForm([
            { key: 'provider', label: 'مزوّد الذكاء الاصطناعي', type: 'select', options: cfg.providers.map(function (p) { return { v: p, l: p === 'anthropic' ? 'Anthropic (Messages API)' : 'OpenAI أو أي خدمة متوافقة (Chat Completions)' }; }) },
            { key: 'model', label: 'اسم النموذج', type: 'text', required: true, hint: 'اكتبه كما يعرّفه المزوّد. لا نفترض نموذجًا افتراضيًا.' },
            { key: 'baseUrl', label: 'رابط الخدمة (اختياري)', type: 'text', wide: true, hint: 'اتركه فارغًا للرابط الرسمي. يجب أن يبدأ بـ https:// (أو http://localhost للتجربة).' },
            { key: 'maxChars', label: 'أقصى طول للنص (حرف)', type: 'number', min: 2000, max: 100000 },
            { key: 'note', type: 'note', text: 'مفتاح API لا يُدخل من هذه الواجهة ولا يُخزَّن في قاعدة البيانات: يُقرأ من متغير البيئة AI_API_KEY على الخادم فقط. الحالة الحالية: ' + (cfg.keyConfigured ? 'مضبوط ✓' : 'غير مضبوط ✗') }
          ], cfg);
          box.innerHTML = '<div class="panel panel-pad stack" data-card></div>'; var card = E.$('[data-card]', box);
          card.appendChild(f.el); card.insertAdjacentHTML('beforeend', '<div><button class="btn primary" data-save>حفظ الإعدادات التقنية</button></div>');
          E.Router.guard = { dirty: function () { return f.isDirty(); } };
          E.$('[data-save]', card).onclick = function () {
            if (!f.validate()) return;
            Store.api('PUT', '/ai/settings', { provider: f.values.provider, model: f.values.model, baseUrl: f.values.baseUrl, maxChars: f.values.maxChars }).then(function () {
              E.toast('تم حفظ الإعدادات التقنية', { type: 'success' }); E.Router.guard = null; E.Router.refresh();
            }).catch(function (e) { E.toast(e.fields ? Object.keys(e.fields).map(function (k) { return e.fields[k]; }).join(' — ') : e.message, { type: 'error' }); });
          };
        }
        show('create');
      }
    }
  });
})();
