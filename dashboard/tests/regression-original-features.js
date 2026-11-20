const { chromium } = require('playwright');
const fs = require('fs');
const results = [];
const ok = (n, c, extra='') => { results.push([c?'PASS':'FAIL', n, extra]); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type()==='error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:8787/');
  // login
  await page.waitForSelector('.login');
  await page.fill('#un', 'admin'); await page.fill('#pw', 'wrong-pass-xx'); await page.click('.login button[type=submit]');
  await page.waitForFunction(() => document.querySelector('.login .err').textContent.length>0);
  ok('wrong password rejected', true);
  await page.fill('#un', 'admin'); await page.fill('#pw', 'test-pass-1234'); await page.click('.login button[type=submit]');
  await page.waitForSelector('.hero');
  ok('login + overview', true);
  const stats = await page.$$eval('.stat-card .n', els => els.map(e=>e.textContent));
  ok('stats real (6 paths, rest 0)', stats[0]==='6' && stats.slice(1).every(x=>x==='0'), stats.join(','));
  const empties = await page.$$eval('.empty-chart', e=>e.length);
  ok('charts show empty states (no fake data)', empties>=4, 'count='+empties);
  // nav
  for (const p of ['paths','modules','lessons','questions','quizzes','projects','assets','glossary','gamification','settings','data','overview']) {
    await page.click(`.nav a[data-page=${p}]`); await page.waitForTimeout(150);
    const h = await page.$eval('#content', e=>e.textContent.length);
    ok('nav '+p, h>20);
  }
  // paths CRUD
  await page.click('.nav a[data-page=paths]');
  await page.click('[data-act=add]');
  await page.fill('.modal [dir=auto] >> nth=0', 'Test Path');
  await page.click('.modal .primary');
  await page.waitForSelector('tr:has-text("Test Path")');
  ok('path add', true);
  await page.click('tr:has-text("Test Path") [data-edit]');
  await page.fill('.modal input[type=text] >> nth=0', 'Test Path Renamed');
  await page.click('.modal .primary');
  await page.waitForSelector('tr:has-text("Test Path Renamed")');
  ok('path edit/rename', true);
  // dup name validation
  await page.click('[data-act=add]'); await page.fill('.modal input[type=text] >> nth=0', 'python'); await page.click('.modal .primary');
  ok('duplicate path name blocked', await page.$('.modal .field.invalid')!==null);
  await page.keyboard.press('Escape'); await page.waitForSelector('.modal', {state:'visible'}).catch(()=>{});
  // dirty guard on close -> confirm appears
  await page.waitForTimeout(200);
  const confirmShown = await page.$$eval('.modal', m=>m.length);
  ok('unsaved-changes guard on form close', confirmShown===2, 'modals='+confirmShown);
  await page.click('.modal.sm .danger'); await page.waitForTimeout(200);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok('forms closed', (await page.$$('.modal')).length===0);
  // delete with confirm + undo
  await page.click('tr:has-text("Test Path Renamed") [data-del]');
  await page.click('.modal .danger'); await page.waitForSelector('.toast button');
  await page.click('.toast button'); await page.waitForSelector('tr:has-text("Test Path Renamed")');
  ok('delete + undo', true);
  await page.click('tr:has-text("Test Path Renamed") [data-del]'); await page.click('.modal .danger');
  await page.waitForFunction(()=>!document.body.textContent.includes('Test Path Renamed')||document.querySelector('.toast'));
  // reorder
  const first = await page.$eval('tbody tr:first-child .t-main', e=>e.textContent);
  await page.click('tbody tr:nth-child(2) [data-up]'); await page.waitForTimeout(200);
  const first2 = await page.$eval('tbody tr:first-child .t-main', e=>e.textContent);
  ok('reorder path', first!==first2, first+' -> '+first2);
  await page.click('tbody tr:nth-child(2) [data-up]'); // restore
  // module
  await page.click('.nav a[data-page=modules]'); await page.click('[data-act=add]');
  await page.fill('.modal input[type=text] >> nth=0', 'Intro Module');
  await page.click('.modal .primary'); await page.waitForSelector('tr:has-text("Intro Module")');
  ok('module add', true);
  // glossary term
  await page.click('.nav a[data-page=glossary]'); await page.click('[data-act=add]');
  const gi = await page.$$('.modal input[type=text]');
  await gi[0].fill('متغير'); await gi[1].fill('Variable');
  await page.fill('.modal textarea >> nth=0', 'اسم يخزن قيمة');
  await page.click('.modal .primary'); await page.waitForSelector('tr:has-text("Variable")');
  ok('glossary add', true);
  // question MCQ
  await page.click('.nav a[data-page=questions]'); await page.click('[data-act=add]');
  await page.fill('.modal textarea >> nth=0', 'ما ناتج 1+1؟');
  await page.fill('.modal textarea >> nth=2', ['1','2','3'].join(String.fromCharCode(10)));
  await page.fill('.modal input[type=number] >> nth=0', '2');
  await page.click('.modal .primary'); await page.waitForSelector('tr:has-text("ناتج")');
  ok('question mcq add', true);
  // question validation: answer out of range
  await page.click('tr:has-text("ناتج") [data-edit]');
  await page.fill('.modal input[type=number] >> nth=0', '9'); await page.click('.modal .primary');
  ok('mcq answer range validated', await page.$('.modal .field.invalid')!==null);
  await page.keyboard.press('Escape'); await page.click('.modal.sm .danger');
  // lesson editor
  await page.click('.nav a[data-page=lessons]'); await page.click('[data-act=add]');
  await page.waitForSelector('.editor');
  await page.fill('.meta input[type=text] >> nth=0', 'درس المتغيرات');
  await page.selectOption('.meta select >> nth=0', { index: 1 });
  await page.click('[data-add=heading]'); await page.fill('.block input[type=text] >> nth=0', 'ما هو المتغير؟');
  await page.click('[data-add=paragraph]'); await page.fill('.block textarea >> nth=0', 'المتغير **صندوق** لتخزين `قيمة`.');
  await page.click('[data-add=code]'); await page.fill('.block textarea.code', 'x = 5\nprint(x)');
  await page.click('[data-add=note]'); await page.fill('.block:last-child textarea', 'تنبيه مهم');
  await page.click('[data-add=question]'); await page.selectOption('.block:last-child select', { index: 1 });
  await page.click('[data-add=table]'); await page.fill('.block:last-child textarea', 'النوع | مثال\nعدد | 5');
  await page.waitForSelector('[data-dirty]:not([hidden])');
  ok('lesson editor dirty indicator', true);
  // leave guard
  await page.click('.nav a[data-page=paths]'); await page.waitForTimeout(250);
  ok('navigation guard on unsaved lesson', (await page.$$('.modal.sm')).length===1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  // preview
  await page.click('[data-a=preview]'); await page.waitForSelector('.modal .efhamha-lesson');
  const pv = await page.$eval('.modal .efhamha-lesson', e=>e.innerHTML);
  ok('lesson preview renders blocks', pv.includes('<strong>صندوق</strong>') && pv.includes('print(x)') && pv.includes('efhamha-table') && pv.includes('efhamha-q'));
  await page.click('.modal-foot .btn');
  // save + publish
  await page.click('[data-a=publish]'); await page.waitForSelector('.toast.success');
  await page.waitForFunction(()=>location.hash.startsWith('#/lessons/edit/'));
  ok('lesson publish -> edit route', true);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('محفوظ'));
  // check public json
  const pub = await (await page.request.get('http://localhost:8787/public/efhamha-data.json')).json();
  ok('published lesson appears in public JSON', pub.lessons.length===1 && pub.lessons[0].title==='درس المتغيرات');
  ok('glossary linking only via published lesson', pub.glossary.length===1);
  // draft lesson hidden
  await page.click('.nav a[data-page=lessons]');
  await page.click('tr:has-text("درس المتغيرات") [data-dup]'); await page.waitForTimeout(800);
  const pub2 = await (await page.request.get('http://localhost:8787/public/efhamha-data.json')).json();
  ok('draft copy NOT in public JSON', pub2.lessons.length===1);
  // project
  await page.click('.nav a[data-page=projects]'); await page.click('[data-act=add]');
  await page.fill('.modal input[type=text] >> nth=0', 'مشروع الآلة الحاسبة');
  await page.selectOption('.modal select >> nth=0', { index: 1 });
  await page.selectOption('.modal select >> nth=2', 'published').catch(()=>{});
  await page.click('.modal .primary'); await page.waitForSelector('tr:has-text("الآلة")');
  ok('project add', true);
  // quiz with picker
  await page.click('.nav a[data-page=quizzes]'); await page.click('[data-act=add]');
  await page.fill('.modal input[type=text] >> nth=0', 'اختبار 1');
  await page.click('.modal [data-add]');
  await page.click('.modal-foot .push'); await page.waitForSelector('.modal .efhamha-q');
  ok('quiz preview', true);
  await page.locator('.modal-back').last().locator('.modal-foot .btn').first().click();
  await page.click('.modal .primary'); await page.waitForSelector('tr:has-text("اختبار 1")');
  ok('quiz add with picked question', true);
  // image upload (png) in assets
  await page.click('.nav a[data-page=assets]');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
  fs.writeFileSync('/tmp/e2e/a.png', png);
  await page.setInputFiles('#content input[type=file]', '/tmp/e2e/a.png');
  await page.waitForSelector('.asset');
  const src = await page.$eval('.asset img', i=>i.getAttribute('src'));
  ok('image upload to server', src.startsWith('/uploads/'), src);
  const r = await page.request.get('http://localhost:8787'+src); ok('uploaded file served', r.status()===200);
  fs.writeFileSync('/tmp/e2e/bad.png', 'not an image');
  await page.setInputFiles('#content input[type=file]', '/tmp/e2e/bad.png').catch(()=>{});
  await page.waitForTimeout(500);
  ok('fake image rejected by server', (await page.$$('.asset')).length===1);
  // settings
  await page.click('.nav a[data-page=settings]');
  await page.fill('[data-secs] section:first-child input[type=text] >> nth=0', 'Efhamha Edu');
  await page.click('[data-save]'); await page.waitForSelector('.toast.success');
  await page.waitForTimeout(800);
  const pub3 = await (await page.request.get('http://localhost:8787/public/efhamha-data.json')).json();
  ok('settings name change reflected in public JSON', pub3.settings.name==='Efhamha Edu' && pub3.paths.length===6);
  // theme
  await page.click('#theme-btn'); const th = await page.getAttribute('html','data-theme');
  ok('theme toggle', th==='dark', th);
  await page.screenshot({ path: '/tmp/e2e/dark-settings.png' });
  // data export / import
  await page.click('.nav a[data-page=data]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-x=full]')]);
  await dl.saveAs('/tmp/e2e/backup.json');
  const bk = JSON.parse(fs.readFileSync('/tmp/e2e/backup.json','utf8'));
  ok('export full JSON', bk.lessons.length===2 && bk.paths.length===6);
  // invalid import
  fs.writeFileSync('/tmp/e2e/bad.json', JSON.stringify({ lessons: [{id:'a'},{id:'a'}], schemaVersion:1 }));
  await page.setInputFiles('#content input[type=file]', '/tmp/e2e/bad.json'); await page.waitForSelector('.modal');
  const badTxt = await page.$eval('.modal', e=>e.textContent);
  ok('import validation rejects duplicate IDs', badTxt.includes('معرّف مكرر'));
  await page.click('.modal-foot .btn');
  // valid import (replace) with usage data
  bk.usage = { completions:[{lessonId:bk.lessons[0].id,date:'2026-10-01'}], quizResults:[{quizId:bk.quizzes[0].id,score:80,passed:true,date:'2026-10-02'}], achievements:[{date:'2026-10-03'},{date:'2026-10-20'}] };
  bk.lessons[0].title = 'عنوان معدّل';
  fs.writeFileSync('/tmp/e2e/good.json', JSON.stringify(bk));
  await page.setInputFiles('#content input[type=file]', '/tmp/e2e/good.json'); await page.waitForSelector('.modal .primary');
  await page.click('.modal .primary'); await page.waitForSelector('.toast.success');
  await page.waitForTimeout(800);
  const pub4 = await (await page.request.get('http://localhost:8787/public/efhamha-data.json')).json();
  ok('import replace -> title reflected publicly', pub4.lessons.some(l=>l.title==='عنوان معدّل'));
  await page.click('.nav a[data-page=overview]'); await page.waitForSelector('.hero');
  const bars = await page.$$eval('.bar-row', e=>e.length); const svgLine = await page.$$('svg.line-chart');
  ok('usage charts render with imported data', bars>=2 && svgLine.length===1, 'bars='+bars);
  await page.screenshot({ path: '/tmp/e2e/overview-dark.png', fullPage: true });
  // reload persistence
  await page.reload(); await page.waitForSelector('.hero');
  const st2 = await page.$$eval('.stat-card .n', els => els.map(e=>e.textContent));
  ok('persistence after reload', st2[0]==='6' && st2[2]==='2', st2.join(','));
  // mobile
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(300);
  const ov = await page.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('mobile: no horizontal overflow (overview)', ov<=0, 'overflow='+ov);
  await page.click('#menu-btn'); await page.waitForTimeout(300);
  ok('mobile: sidebar opens', await page.$eval('#side', e=>e.classList.contains('open')));
  await page.click('.nav a[data-page=lessons]'); await page.waitForSelector('.tbl');
  const ov2 = await page.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('mobile: no horizontal overflow (lessons cards)', ov2<=0, 'overflow='+ov2);
  await page.screenshot({ path: '/tmp/e2e/mobile-lessons.png' });
  await page.goto('http://localhost:8787/#/lessons/edit/'+bk.lessons[0].id); await page.waitForSelector('.editor');
  const ov3 = await page.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('mobile: no overflow (lesson editor)', ov3<=0, 'overflow='+ov3);
  // preview site
  const sp = await ctx.newPage();
  await sp.goto('http://localhost:8787/preview/site-preview.html'); await sp.waitForSelector('#paths');
  const paths = await sp.$$eval('[data-path]', e=>e.length);
  await sp.click('[data-path]:first-child'); await sp.waitForTimeout(200);
  ok('site preview lists published paths', paths===6);
  ok('JS errors', errors.length===0, errors.slice(0,3).join(' | '));
  console.log(results.map(r=>r.join(' | ')).join('\n'));
  console.log('FAILS:', results.filter(r=>r[0]==='FAIL').length);
  await b.close();
})().catch(e=>{ console.log(results.map(r=>r.join(' | ')).join('\n')); console.error('CRASH', e.message.split('\n').slice(0,6).join('\n')); process.exit(1); });
