const { launch, login, api, ok, overflow, report, BASE } = require('./helper');
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await login(page, 'admin', 'test-pass-1234');
  await page.waitForSelector('.hero');

  // A) shortcuts removed, nav intact + new sections
  ok('no keyboard-shortcuts button', (await page.$('#kbd-btn')) === null);
  ok('hero quick-add shortcut removed', (await page.$('.hero .btn')) === null);
  await page.keyboard.press('g'); await page.keyboard.press('p'); await page.waitForTimeout(250);
  ok('g+p keyboard shortcut no longer navigates', (await page.evaluate(() => location.hash)) === '#/overview');
  await page.keyboard.press('/'); ok('"/" no longer focuses search', (await page.evaluate(() => document.activeElement.id)) !== 'gsearch');
  const navText = await page.$$eval('.nav a span', e => e.map(x => x.textContent));
  ok('original 14 sections still in sidebar', ['نظرة عامة', 'المسارات', 'الوحدات', 'الدروس', 'بنك الأسئلة', 'الاختبارات', 'المشروعات', 'مكتبة الرسومات', 'القاموس التقني', 'الإنجازات والتحفيز', 'الإعدادات', 'البيانات والنسخ'].every(t => navText.includes(t)), navText.join());
  ok('new sections in sidebar', ['الاشتراكات', 'AI Lesson Creator', 'سجل العمليات', 'الطلاب', 'تحليلات الطلاب', 'المستخدمون'].every(t => navText.includes(t)));
  ok('user name shown in sidebar', (await page.textContent('.profile-btn')).includes('admin'));
  ok('global search box kept', !!(await page.$('#gsearch')));
  ok('stat cards (existing) still render', (await page.$$('.stat-card')).length === 8);

  // B) subscriptions
  await page.click('.nav a[data-page=subscriptions]'); await page.waitForSelector('.kv');
  const kv = await page.textContent('.kv');
  ok('subscription: current values displayed', kv.includes('199.5') && kv.includes('01011112222') && kv.includes('+201009998888'), kv);
  await page.fill('[data-form] input[type=number]', '250');
  await page.click('[data-save]'); await page.waitForSelector('.modal');
  ok('subscription: confirmation modal shows diff', (await page.textContent('.modal')).includes('250') && (await page.textContent('.modal')).includes('199.5'));
  await page.click('.modal .primary'); await page.waitForSelector('.toast.success');
  await page.waitForTimeout(300);
  ok('subscription: shows new value after save', (await page.textContent('.kv')).includes('250'));
  let pub = await (await page.request.get(BASE + '/public/efhama-data.json')).json();
  ok('subscription reflected in public JSON', pub.subscription.price === 250);
  // failure message
  const inputs = await page.$$('[data-form] input[type=text]');
  await inputs[2].fill('abc'); await page.click('[data-save]'); await page.waitForSelector('.modal'); await page.click('.modal .primary');
  await page.waitForSelector('.toast.error'); ok('subscription: server validation error toast', (await page.textContent('.toast.error')).includes('فشل'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const confirmDiscard = await page.$$('.modal'); if (confirmDiscard.length) { await page.keyboard.press('Escape'); }
  // restore whatsapp to valid and navigate away
  await page.goto(BASE + '/#/overview'); await page.waitForTimeout(300);
  const dlg = await page.$('.modal.sm .danger'); if (dlg) await dlg.click();
  // site preview shows price
  const sp = await ctx.newPage(); await sp.goto(BASE + '/preview/site-preview.html'); await sp.waitForSelector('#sub-price');
  ok('main-site preview shows price from central source', (await sp.textContent('#sub-price')) === '250' && (await sp.textContent('#sub-wa')) === '+201009998888');
  await sp.close();

  // D) AI creator
  await page.goto(BASE + '/#/ai'); await page.waitForSelector('[data-card] textarea');
  const raw = 'المتغير هو اسم يخزن قيمة في الذاكرة.\n```python\nx = 5\nprint(x)\n```\nيمكنك تغيير القيمة لاحقًا في البرنامج. هذا نص كافٍ لتجاوز الحد الأدنى للطول المطلوب.';
  ok('AI page: technical settings tab visible to Super Admin', (await page.$$eval('[role=tab]', e => e.map(x => x.textContent))).includes('الإعدادات التقنية'));
  async function fillAndGo() {
    await page.fill('[data-card] textarea', raw);
    const sels = await page.$$('[data-card] select');
    await sels[0].selectOption('p_python'); await sels[1].selectOption('m_t');
    await page.fill('[data-card] input[type=text]', 'درس المتغيرات (AI)');
    const pos = await page.$$('[data-card] select'); await pos[3].selectOption('after:l_a');
    await page.click('[data-go]');
    await page.waitForSelector('.ai-panel', { timeout: 20000 });
  }
  await fillAndGo();
  ok('AI draft opens in editor, marked unpublished', (await page.textContent('.ai-panel')).includes('لم تُنشر'));
  ok('AI-added blocks flagged for review', (await page.$$('.block .badge.warn')).length >= 2);
  await page.click('[data-ai-orig]'); await page.waitForSelector('.modal pre');
  ok('"original text" viewable', (await page.textContent('.modal pre')).includes('المتغير هو اسم يخزن قيمة'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.click('[data-ai-redo]'); await page.waitForSelector('.modal.sm');
  ok('redo asks before discarding unsaved draft', (await page.textContent('.modal.sm')).includes('تعديلات غير محفوظة'));
  await page.click('.modal.sm .danger'); await page.waitForSelector('[data-card] textarea');
  ok('redo returns to AI page with original text preserved', (await page.inputValue('[data-card] textarea')).includes('المتغير هو اسم يخزن قيمة'));
  await page.click('[data-go]'); await page.waitForSelector('.ai-panel', { timeout: 20000 });
  // publish blocked: unfinished diagram placeholder
  await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await page.click('[data-a=publish]'); await page.waitForSelector('.toast.error');
  ok('cannot publish with unfinished diagram placeholder', (await page.textContent('.toast.error')).includes('قبل النشر'));
  const diagramBlock = page.locator('.block', { hasText: 'رسم تعليمي' }).first();
  await diagramBlock.locator('[data-bx]').click();
  await page.locator('.block', { hasText: 'مضاف بالذكاء' }).first().locator('[data-bok]').click(); // mark one reviewed
  await page.click('[data-a=publish]'); await page.waitForSelector('.modal.sm');
  ok('explicit approval modal required for AI lessons', (await page.textContent('.modal.sm')).includes('أوافق صراحةً'));
  await page.click('.modal.sm .primary'); await page.waitForTimeout(200);
  ok('approval without ticking the box is refused', (await page.$('.modal.sm')) !== null);
  await page.click('.modal.sm .btn:not(.primary)'); await page.waitForTimeout(200);
  let d = (await api(page, 'GET', '/api/data')).body;
  ok('nothing published/saved automatically', !d.lessons.some(l => l.title === 'درس المتغيرات (AI)'));
  await page.click('[data-a=save]'); await page.waitForSelector('.toast.success'); await page.waitForFunction(() => location.hash.startsWith('#/lessons/edit/'));
  await page.waitForTimeout(900);
  d = (await api(page, 'GET', '/api/data')).body;
  const les = d.lessons.find(l => l.title === 'درس المتغيرات (AI)');
  ok('saved as draft with AI metadata (unreviewed)', les && les.status === 'draft' && les.aiMeta.generated && !les.aiMeta.reviewed);
  const mod = d.lessons.filter(l => l.moduleId === 'm_t').sort((a, b) => a.order - b.order).map(l => l.id);
  ok('lesson placed after chosen lesson inside the module', mod.indexOf(les.id) === mod.indexOf('l_a') + 1, mod.join());
  ok('AI terms added to glossary & linked', d.glossary.some(t => t.en === 'variable' && t.lessonIds.includes(les.id)));
  ok('AI review questions added to bank (valid only)', d.questions.filter(q => q.lessonId === les.id).length === 2);
  ok('AI code block preserved', les.blocks.some(b => b.type === 'code' && b.code.includes('x = 5')));
  pub = await (await page.request.get(BASE + '/public/efhama-data.json')).json();
  ok('draft AI lesson NOT in public JSON', !pub.lessons.some(l => l.id === les.id));
  await page.click('[data-a=publish]'); await page.waitForSelector('.modal.sm');
  await page.locator('.modal.sm .switch').click(); await page.click('.modal.sm .primary');
  await page.waitForSelector('.toast.success'); await page.waitForTimeout(900);
  pub = await (await page.request.get(BASE + '/public/efhama-data.json')).json();
  ok('published after explicit approval -> in public JSON', pub.lessons.some(l => l.id === les.id));
  d = (await api(page, 'GET', '/api/data')).body;
  ok('approval recorded (reviewed=true)', d.lessons.find(l => l.id === les.id).aiMeta.reviewed === true);
  // preview of AI lesson
  await page.click('[data-a=preview]'); await page.waitForSelector('.modal .efhama-lesson');
  ok('lesson preview renders AI lesson', (await page.textContent('.modal .efhama-lesson')).includes('x = 5'));
  await page.keyboard.press('Escape');

  // E) logs
  await page.goto(BASE + '/#/logs'); await page.waitForSelector('.tbl');
  ok('logs: table rows', (await page.$$('tbody tr')).length >= 10);
  await page.fill('[data-q]', 'cmgr'); await page.waitForTimeout(700);
  const rowsTxt = await page.$$eval('tbody tr', r => r.map(x => x.textContent));
  ok('logs: search by person name', rowsTxt.length > 0 && rowsTxt.every(t => t.includes('cmgr')), rowsTxt.length);
  await page.fill('[data-q]', ''); await page.waitForTimeout(500);
  await page.selectOption('[data-action]', 'update'); await page.waitForTimeout(500);
  ok('logs: filter by action', (await page.$$eval('tbody tr .badge', e => e.map(x => x.textContent))).every(t => t === 'تعديل'));
  await page.selectOption('[data-action]', ''); await page.selectOption('[data-section]', 'subscriptions'); await page.waitForTimeout(500);
  ok('logs: filter by section', (await page.$$('tbody tr')).length >= 3);
  await page.click('tbody tr [data-d]'); await page.waitForSelector('.modal pre.json, .modal dl');
  ok('logs: details modal (who/when/before/after)', (await page.textContent('.modal')).includes('المستخدم') && (await page.textContent('.modal')).includes('البيانات السابقة'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.fill('[data-from]', '2099-01-01'); await page.waitForTimeout(500);
  ok('logs: date filter empty state', (await page.textContent('[data-res]')).includes('لا توجد عمليات'));
  await page.click('[data-verify]'); await page.waitForSelector('.toast.success'); ok('logs: chain verification', (await page.textContent('.toast.success')).includes('سليمة'));
  ok('logs page has no edit/delete controls', (await page.$$('[data-del],[data-edit]')).length === 0);

  // F) students
  await page.goto(BASE + '/#/students'); await page.waitForSelector('.tbl');
  ok('students: table columns', (await page.$$eval('thead th', e => e.map(x => x.textContent))).join().includes('الاشتراك') && (await page.$$eval('thead th', e => e.map(x => x.textContent))).join().includes('آخر نشاط'));
  ok('students: names listed', (await page.textContent('tbody')).includes('أحمد علي محمد'));
  await page.fill('[data-q]', 'أحمد'); await page.waitForTimeout(600);
  ok('students: search', (await page.$$('tbody tr')).length === 1);
  await page.click('tbody tr a.btn'); await page.waitForSelector('[data-certs] table');
  const certTxt = await page.textContent('[data-certs]');
  ok('profile: all certificates incl. replaced & revoked statuses', certTxt.includes('مستبدلة') && certTxt.includes('ملغاة'));
  await page.click('[data-prev]'); await page.waitForSelector('iframe.cert-frame');
  const fr = page.frameLocator('iframe.cert-frame');
  await fr.locator('.cert').waitFor();
  const ct = await fr.locator('.cert').textContent();
  ok('certificate preview: name, path, platform, number', ct.includes('أحمد علي محمد') && ct.includes('Python') && ct.includes('Efham') && /EFH-\d{4}-/.test(ct));
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.click('.modal .primary')]);
  await pop.waitForLoadState(); ok('download PDF opens printable certificate (print=1)', pop.url().includes('print=1') && (await pop.textContent('.cert')).includes('أحمد'));
  await pop.close(); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.click('[data-edit]'); await page.waitForSelector('.modal input[type=text]');
  await page.fill('.modal input[type=text] >> nth=0', 'أحمد علي محمد حسن'); await page.click('.modal .primary'); await page.waitForSelector('.toast.success');
  await page.waitForTimeout(500); ok('profile edit saves', (await page.textContent('h1')).includes('حسن'));
  await page.click('[data-toggle]'); await page.waitForSelector('.modal.sm'); await page.click('.modal.sm .danger'); await page.waitForTimeout(700);
  ok('suspend account', (await page.textContent('h1')).includes('موقوف'));
  await page.click('[data-toggle]'); await page.waitForSelector('.modal.sm'); await page.click('.modal.sm .primary'); await page.waitForTimeout(700);
  ok('reactivate account', !(await page.textContent('h1')).includes('موقوف'));
  // add student via UI
  await page.goto(BASE + '/#/students'); await page.waitForSelector('[data-add]'); await page.click('[data-add]');
  await page.fill('.modal input[type=text] >> nth=0', 'طالب من الواجهة'); await page.fill('.modal input[type=text] >> nth=1', 'ui-student@example.com');
  await page.click('.modal .primary'); await page.waitForSelector('[data-certs]'); ok('add student via UI -> profile', (await page.textContent('h1')).includes('طالب من الواجهة'));
  await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); await page.click('[data-issue]'); await page.waitForSelector('.toast.error'); ok('issue certificate: student w/o path explains', (await page.textContent('.toast.error')).includes('غير مسجّل'));
  // student with unmet conditions
  await page.goto(BASE + '/#/students'); await page.waitForSelector('.tbl'); await page.fill('[data-q]', 'سارة'); await page.waitForTimeout(600);
  await page.click('tbody tr a.btn'); await page.waitForSelector('[data-issue]'); await page.click('[data-issue]'); await page.waitForSelector('.modal');
  ok('issue certificate blocked with reasons shown', (await page.textContent('.modal')).includes('لا يمكن إصدار الشهادة'));
  await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); await page.click('.modal .primary'); await page.waitForSelector('.toast.error'); ok('server refuses unmet conditions (UI)', (await page.textContent('.toast.error')).includes('شروط'));
  await page.keyboard.press('Escape');

  ok('JS errors (admin flow)', errors.length === 0, errors.slice(0, 3).join(' | '));
  report(); await b.close();
})().catch(e => { require('./helper').report(); console.error('CRASH', e.message.split('\n').slice(0, 7).join('\n')); process.exit(1); });
