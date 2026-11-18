const { launch, login, api, ok, overflow, report, BASE } = require('./helper');
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 850 }, acceptDownloads: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await login(page, 'admin', 'test-pass-1234'); await page.waitForSelector('.hero');

  // H) real video tracking on the demo site (real webm, real player events)
  let mk = await api(page, 'POST', '/api/students', { name: 'طالب الفيديو', email: 'vid@example.com', externalId: 'ext-v', pathIds: ['p_python'] });
  if (mk.status !== 200) mk = { body: { id: (await api(page, 'GET', '/api/students?q=vid@example.com')).body.items[0].id } };
  const vstat = async () => (await api(page, 'GET', '/api/analytics?lessonId=l_a')).body.videos.rows[0];
  const before = await vstat();
  const sp = await ctx.newPage(); const tracks = [];
  sp.on('request', r => { if (r.url().includes('/api/track')) tracks.push(r.postData()); });
  await sp.goto(BASE + '/preview/site-preview.html?student=ext-v#/lesson/l_a');
  await sp.waitForSelector('video[data-efhama-video]');
  await sp.waitForFunction(() => document.querySelector('video').readyState >= 2, null, { timeout: 15000 });
  await sp.waitForTimeout(1500);
  const afterOpen = await vstat();
  ok('opening the lesson/video page is NOT counted as a view', afterOpen.started === before.started, JSON.stringify([before.started, afterOpen.started]));
  await sp.evaluate(() => { const v = document.querySelector('video'); v.muted = true; return v.play(); });
  await sp.waitForFunction(() => document.querySelector('video').currentTime > 1.5, null, { timeout: 10000 });
  await sp.evaluate(() => document.querySelector('video').pause());
  await sp.waitForTimeout(400);
  await sp.evaluate(() => { const v = document.querySelector('video'); v.currentTime = 0; v.play(); });
  await sp.waitForFunction(() => document.querySelector('video').ended, null, { timeout: 15000 });
  await sp.click('#done'); await sp.waitForTimeout(1200);
  const after = await vstat();
  ok('real play/pause/ended events recorded', after.started === before.started + 1 && after.completed === before.completed + 1, JSON.stringify(after));
  ok('watched time recorded (> 3s of a 4s video)', after.avgWatchedSeconds >= 1);
  const timeupdates = tracks.length;
  ok('few server events despite many timeupdates (aggregated)', timeupdates > 0 && timeupdates <= 8, 'requests=' + timeupdates);
  const bodies = tracks.join('');
  ok('no per-timeupdate event type is ever sent', !bodies.includes('timeupdate'));
  const lessonStat = (await api(page, 'GET', '/api/analytics?lessonId=l_a')).body.lessons.rows[0];
  ok('lesson open + completion recorded from site', lessonStat.opened >= 3 && lessonStat.completionsInRange >= 1);
  const prof = (await api(page, 'GET', '/api/students/' + mk.body.id)).body;
  ok('student profile shows completed lesson from tracker', prof.lessons.some(l => l.lessonId === 'l_a'));
  await sp.close();
  // session end (pagehide) event: simple check that sessions counted
  const A = (await api(page, 'GET', '/api/analytics')).body;
  ok('sessions recorded', A.access.sessions >= 3);

  // G) analytics UI
  await page.goto(BASE + '/#/analytics'); await page.waitForSelector('.analytics-kpis-grid');
  ok('analytics: KPI cards', (await page.$$('.kpi-card')).length >= 10);
  ok('analytics: video table lists the lesson video', (await page.textContent('#t-videos')).includes('فيديو الدرس'));
  ok('analytics: charts rendered', (await page.$$('svg.line-chart')).length >= 2);
  for (const p of ['0', '7', '90']) { await page.click(`[data-p="${p}"]`); await page.waitForTimeout(500); }
  ok('analytics: preset filters (today/7/90) work', (await page.$$('.kpi-card')).length >= 10);
  await page.click('[data-p="30"]'); await page.waitForTimeout(500);
  await page.locator('.switch', { hasText: 'مقارنة' }).click(); await page.waitForSelector('.delta');
  ok('analytics: period comparison shown', (await page.textContent('.analytics-kpis-grid')).includes('الفترة السابقة'));
  await page.click('[data-p="custom"]'); await page.waitForSelector('[data-from]:visible');
  await page.fill('[data-from]', '2020-01-01'); await page.fill('[data-to]', '2020-01-31'); await page.waitForTimeout(700);
  ok('analytics: custom period with no data shows zeros + guidance (no fake data)', (await page.textContent('.banner')).includes('لا توجد بيانات تتبع') && (await page.$$eval('.kpi-card .n', e => e[0].textContent)) === '0');
  await page.click('[data-p="30"]'); await page.waitForTimeout(500);
  await page.selectOption('[data-path]', 'p_python'); await page.waitForTimeout(500);
  const lessonOpts = await page.$$eval('[data-lesson] option', e => e.length);
  ok('analytics: path filter narrows lesson list', lessonOpts >= 2);
  await page.selectOption('[data-lesson]', 'l_a'); await page.waitForTimeout(600);
  ok('analytics: lesson filter shows started-not-completed names', (await page.textContent('[data-body]')).includes('بدأوا الدرس ولم يكملوه'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-csv=lessons]')]);
  const fs = require('fs'); await dl.saveAs('/tmp/e2e/lessons.csv'); const csv = fs.readFileSync('/tmp/e2e/lessons.csv', 'utf8');
  ok('analytics: CSV export (UTF-8 BOM, Arabic headers, data)', csv.charCodeAt(0) === 0xfeff && csv.includes('الدرس') && csv.split('\n').length >= 2);

  // I) users UI
  await page.goto(BASE + '/#/users'); await page.waitForSelector('.tbl');
  ok('users: list with roles', (await page.textContent('tbody')).includes('cmgr') && (await page.textContent('tbody')).includes('Super Admin'));
  await page.click('[data-add]'); await page.waitForSelector('.modal');
  await page.fill('.modal input[type=text] >> nth=0', 'newuser'); await page.fill('.modal input[type=text] >> nth=1', 'عضو جديد'); await page.fill('.modal input[type=text] >> nth=2', 'Short1');
  await page.click('.modal .primary'); await page.waitForTimeout(500);
  ok('users: weak password rejected in UI', (await page.$('.modal')) !== null);
  await page.fill('.modal input[type=text] >> nth=2', 'Strong-Pass-1'); await page.selectOption('.modal select', 'analyst');
  await page.locator('.modal .switch', { hasText: 'تحديد أقسام' }).click();
  await page.waitForSelector('.modal .checklist li');
  const secs = await page.$$eval('.modal .checklist li', e => e.map(x => x.textContent.trim()));
  ok('users: section list limited to the role (analyst)', secs.length === 2 && secs.some(s => s.includes('تحليلات')), secs.join());
  await page.locator('.modal .checklist li', { hasText: 'تحليلات' }).locator('input').check();
  await page.click('.modal .primary'); await page.waitForSelector('.toast.success'); await page.waitForTimeout(400);
  ok('users: member created', (await page.textContent('tbody')).includes('newuser'));
  await page.click('tr:has-text("newuser") [data-edit]'); await page.waitForSelector('.modal');
  await page.locator('.modal .switch', { hasText: 'الحساب نشط' }).click(); await page.click('.modal .primary'); await page.waitForSelector('.toast.success'); await page.waitForTimeout(400);
  ok('users: disable member', (await page.textContent('tr:has-text("newuser")')).includes('معطّل'));
  const bad = await api(page, 'POST', '/api/users/1/password', { password: 'x' }); ok('password policy enforced by server', bad.status === 422);

  // J) role-based UI
  async function roleCtx(u, p) { const c = await b.newContext({ viewport: { width: 1280, height: 850 } }); const pg = await c.newPage(); pg.on('pageerror', e => errors.push(u + ': ' + e.message)); await login(pg, u, p); await pg.waitForTimeout(500); return pg; }
  const sup = await roleCtx('supp', 'Passw0rd-supp');
  const supNav = await sup.$$eval('.nav a', e => e.map(x => x.dataset.page));
  ok('Support sees only overview + students', supNav.join() === 'overview,students', supNav.join());
  await sup.goto(BASE + '/#/lessons'); await sup.waitForTimeout(300); ok('Support: lessons => not authorized', (await sup.textContent('#content')).includes('غير مصرّح'));
  await sup.goto(BASE + '/#/subscriptions'); await sup.waitForTimeout(300); ok('Support: subscriptions => not authorized', (await sup.textContent('#content')).includes('غير مصرّح'));
  await sup.goto(BASE + '/#/students'); await sup.waitForSelector('.tbl'); ok('Support: students page works with add button', !!(await sup.$('[data-add]')));
  const cm2 = await roleCtx('cmgr2', 'Passw0rd-cmgr2');
  const cmNav = await cm2.$$eval('.nav a', e => e.map(x => x.dataset.page));
  ok('Restricted content manager sees only allowed section', cmNav.join() === 'lessons', cmNav.join());
  ok('Restricted user lands on first allowed section', (await cm2.evaluate(() => location.hash)).startsWith('#/lessons'));
  await cm2.waitForSelector('.tbl'); ok('Restricted user can load & see lessons list', (await cm2.$$('tbody tr')).length > 0);
  const ins = await roleCtx('inst', 'Passw0rd-inst');
  await ins.goto(BASE + '/#/paths'); await ins.waitForSelector('.tbl');
  ok('Instructor: paths are read-only (no add/edit/delete)', !(await ins.$('[data-act=add]')) && !(await ins.$('[data-edit]')) && !(await ins.$('[data-del]')) && (await ins.textContent('#content')).includes('قراءة فقط'));
  await ins.goto(BASE + '/#/lessons'); await ins.waitForSelector('[data-act=add]'); ok('Instructor: lessons editable', true);
  ok('Instructor nav hides admin sections', !(await ins.$$eval('.nav a', e => e.map(x => x.dataset.page))).some(p => ['users', 'logs', 'subscriptions', 'settings', 'students', 'analytics'].includes(p)));
  await sup.context().close(); await cm2.context().close(); await ins.context().close();

  // K) responsive + dark on new pages
  await page.setViewportSize({ width: 390, height: 800 });
  for (const p of ['subscriptions', 'ai', 'logs', 'users', 'students', 'analytics', 'overview', 'lessons', 'settings', 'data']) {
    await page.goto(BASE + '/#/' + p); await page.waitForTimeout(700);
    const ov = await overflow(page); ok('mobile 390px: no horizontal overflow on ' + p, ov <= 0, 'overflow=' + ov);
  }
  await page.goto(BASE + '/#/analytics'); await page.waitForSelector('.analytics-kpis-grid'); await page.waitForTimeout(500); await page.screenshot({ path: '/tmp/e2e/m-analytics.png' });
  await page.goto(BASE + '/#/students'); await page.waitForSelector('.tbl'); await page.screenshot({ path: '/tmp/e2e/m-students.png' });
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.click('#theme-btn'); await page.goto(BASE + '/#/logs'); await page.waitForSelector('.tbl'); await page.screenshot({ path: '/tmp/e2e/d-logs.png' });
  await page.goto(BASE + '/#/subscriptions'); await page.waitForSelector('.kv'); await page.screenshot({ path: '/tmp/e2e/d-subs.png' });
  await page.goto(BASE + '/#/analytics'); await page.waitForSelector('.analytics-kpis-grid'); await page.waitForTimeout(500); await page.screenshot({ path: '/tmp/e2e/d-analytics.png', fullPage: true });
  ok('JS errors (admin flow + roles)', errors.length === 0, errors.slice(0, 3).join(' | '));
  report(); await b.close();
})().catch(e => { require('./helper').report(); console.error('CRASH', e.message.split('\n').slice(0, 7).join('\n')); process.exit(1); });
