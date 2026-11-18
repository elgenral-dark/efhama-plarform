const { launch, login, api, ok, report, BASE } = require('./helper');
const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
(async () => {
  const b = await launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await login(page, 'admin', 'test-pass-1234'); await page.waitForSelector('.ov-grid'); await page.waitForTimeout(600);

  // identity
  const css = await page.evaluate(() => ({ brand: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(), side: getComputedStyle(document.querySelector('.side')).backgroundColor, bg: getComputedStyle(document.body).backgroundColor }));
  ok('primary colour is #3C4AE8', css.brand.toLowerCase() === '#3c4ae8', css.brand);
  ok('sidebar uses the brand blue', css.side === 'rgb(60, 74, 232)', css.side);
  const fs = require('fs'); const src = ['css/styles.css', 'js/app.js', 'js/pages-system.js', 'js/charts.js', 'index.html'].map(f => fs.readFileSync(require('path').join(__dirname, '..', f), 'utf8')).join('\n');
  ok('no leftover old brand colour (#1E6BFF) in UI files', !/1E6BFF|30,\s*107,\s*255/i.test(src));
  ok('logo + favicon unchanged', (await page.$eval('.brand-mark img', i => i.getAttribute('src'))).includes('favicon.png') && (await page.$('link[rel=icon]')) !== null);
  ok('RTL document', (await page.evaluate(() => document.documentElement.dir)) === 'rtl');
  ok('sidebar on the right edge in RTL', (await page.evaluate(() => Math.round(document.querySelector('.side').getBoundingClientRect().right) === innerWidth)));

  // layout like reference: 2-layer sidebar, active tab bridge, header, cards
  ok('two-layer sidebar (rail icons + labels)', (await page.$$('.nav a .nav-ico')).length >= 14 && (await page.$$('.nav a .nav-label')).length >= 14);
  const tab = await page.evaluate(() => { const a = document.querySelector('.nav a[aria-current=page] .nav-label'); const cs = getComputedStyle(a); const pb = getComputedStyle(document.body).backgroundColor; return { bg: cs.backgroundColor, pb, r: cs.borderStartStartRadius, pseudo: getComputedStyle(a, '::before').backgroundImage.includes('radial-gradient') }; });
  ok('active item = tab merged with content bg + rounded + inverted corners', tab.bg === tab.pb && parseInt(tab.r) >= 16 && tab.pseudo, JSON.stringify(tab));
  ok('header: search + theme + notifications + profile', !!(await page.$('#gsearch')) && !!(await page.$('#theme-btn')) && !!(await page.$('#bell-btn')) && !!(await page.$('#profile-btn')));
  ok('no language switcher invented (none existed)', (await page.$('[data-lang], #lang-btn')) === null);
  const cards = await page.evaluate(() => { const c = document.querySelector('.ov-card'); const cs = getComputedStyle(c); return { r: parseInt(cs.borderRadius), sh: cs.boxShadow !== 'none', bg: cs.backgroundColor }; });
  ok('cards: white, large radius, soft shadow', cards.r >= 16 && cards.sh && cards.bg === 'rgb(255, 255, 255)', JSON.stringify(cards));
  // honesty: numbers come from real data
  const data = (await api(page, 'GET', '/api/data')).body;
  const nums = await page.$$eval('.stat-card .n', e => e.map(x => x.textContent.replace(/,/g, '')));
  ok('stat cards equal real data counts (no fake numbers)', nums[0] == data.paths.length && nums[1] == data.modules.length && nums[2] == data.lessons.length && nums[4] == data.quizzes.length && nums[5] == data.projects.length && nums[6] == data.questions.length, nums.join());
  const usage = (data.usage.completions.length + data.usage.quizResults.length + data.usage.achievements.length) > 0;
  ok('usage charts: honest empty states when no usage, real charts when usage exists', usage ? (await page.$$('.ov-analytics .bars, .ov-analytics svg.line-chart')).length >= 3 : (await page.$$('.ov-analytics .empty-chart')).length >= 4);
  ok('no quick-action/shortcut buttons added to overview', (await page.$$('.hero .btn, .ov-grid [data-act], .ov-grid .quick')).length === 0);

  // collapse / expand + persistence
  await page.click('#menu-btn'); await page.waitForTimeout(400);
  const w1 = await page.evaluate(() => Math.round(document.querySelector('.side').getBoundingClientRect().width));
  ok('sidebar collapses to icon rail', w1 <= 80, 'w=' + w1);
  ok('collapsed links keep tooltips + labels for AT', (await page.$eval('.nav a[data-page=lessons]', a => a.getAttribute('title') && a.getAttribute('aria-label'))) === 'الدروس');
  await page.reload(); await page.waitForSelector('.ov-grid');
  ok('collapse state persists after reload', (await page.evaluate(() => Math.round(document.querySelector('.side').getBoundingClientRect().width))) <= 80);
  await page.click('#menu-btn'); await page.waitForTimeout(400);
  ok('sidebar expands again', (await page.evaluate(() => Math.round(document.querySelector('.side').getBoundingClientRect().width))) > 250);
  await page.click('.nav a[data-page=paths]'); await page.waitForSelector('.tbl');
  ok('navigation marks the active tab', (await page.$eval('.nav a[aria-current=page]', a => a.dataset.page)) === 'paths');

  // popovers
  await page.click('#bell-btn'); await page.waitForSelector('#bell-pop:not([hidden])');
  ok('notifications popover lists real content alerts', (await page.textContent('#bell-pop')).includes('الإشعارات') && (await page.$$('#bell-pop .pop-item')).length >= 1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150); ok('Escape closes popover', await page.$eval('#bell-pop', e => e.hidden));
  await page.click('#profile-btn'); await page.waitForSelector('#profile-pop:not([hidden])');
  ok('profile menu: name, role, logout', (await page.textContent('#profile-pop')).includes('admin') && (await page.textContent('#profile-pop')).includes('Super Admin') && !!(await page.$('#profile-pop [data-logout]')));
  await page.mouse.click(600, 500); await page.waitForTimeout(150); ok('outside click closes popover', await page.$eval('#profile-pop', e => e.hidden));

  // dark mode: contrast, surfaces, no inverted images
  await page.goto(BASE + '/#/overview'); await page.waitForSelector('.ov-grid'); await page.click('#theme-btn'); await page.waitForTimeout(300);
  const dk = await page.evaluate(() => { const g = s => getComputedStyle(document.querySelector(s)); const imgs = [...document.querySelectorAll('.main img, .side img')].map(i => getComputedStyle(i).filter); return { th: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor, card: g('.ov-card').backgroundColor, text: g('.ov-card').color, muted: g('.perf-cap, .ov-note, .qi-row span').color, filters: imgs }; });
  ok('dark mode active; cards differ from background', dk.th === 'dark' && dk.bg !== dk.card, JSON.stringify(dk));
  ok('dark: text contrast ≥ 4.5 (body) and ≥ 4.5 (muted)', contrast(dk.text, dk.card) >= 4.5 && contrast(dk.muted, dk.card) >= 4.5, contrast(dk.text, dk.card).toFixed(1) + ' / ' + contrast(dk.muted, dk.card).toFixed(1));
  ok('dark: no colour-inverting filters on images/icons', dk.filters.every(f => f === 'none'), dk.filters.join());
  await page.click('#theme-btn'); await page.waitForTimeout(300);
  const lt = await page.evaluate(() => { const g = s => getComputedStyle(document.querySelector(s)); return { text: g('.ov-card').color, card: g('.ov-card').backgroundColor, muted: g('.perf-cap, .qi-row span').color, btn: getComputedStyle(document.querySelector('.hero-link')).color }; });
  ok('light: text contrast ≥ 4.5', contrast(lt.text, lt.card) >= 4.5 && contrast(lt.muted, lt.card) >= 4.5, contrast(lt.muted, lt.card).toFixed(1));
  ok('white on brand blue ≥ 4.5 (buttons/sidebar)', contrast('rgb(255,255,255)', 'rgb(60,74,232)') >= 4.5, contrast('rgb(255,255,255)', 'rgb(60,74,232)').toFixed(2));

  // states: loading skeleton + error + empty on the activity card
  const p2 = await ctx.newPage(); let release;
  await p2.route('**/api/logs?page=1*', async route => { await new Promise(r => { release = r; }); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], total: 0, page: 1, pages: 1, actions: [], sections: [], sectionLabels: {} }) }); });
  await p2.goto(BASE + '/#/overview'); await p2.waitForSelector('[data-recent] .skel');
  ok('loading state (skeleton) while activity loads', true); release(); await p2.waitForSelector('[data-recent] .ov-empty');
  ok('empty state when no activity', (await p2.textContent('[data-recent]')).includes('لا توجد عمليات'));
  await p2.unroute('**/api/logs?page=1*'); await p2.route('**/api/logs?page=1*', r => r.abort());
  await p2.reload(); await p2.waitForSelector('[data-recent] .ov-empty'); ok('error state when activity fails', (await p2.textContent('[data-recent]')).includes('تعذر'));
  await p2.close();

  // roles on the overview
  const mk = async (u, role) => api(page, 'POST', '/api/users', { username: u, displayName: 'مستخدم ' + u, role, password: 'Passw0rd-' + u });
  await mk('anal', 'analyst'); await mk('supp', 'support');
  async function asUser(u) { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const pg = await c.newPage(); await login(pg, u, 'Passw0rd-' + u); await pg.waitForSelector('.ov-grid'); await pg.waitForTimeout(700); return pg; }
  const an = await asUser('anal'); const anTitles = await an.$$eval('.ov-rail .sec-head h2', e => e.map(x => x.textContent));
  ok('Analyst overview: no activity/students blocks (no permission)', !anTitles.includes('آخر العمليات') && !anTitles.includes('آخر الطلاب') && anTitles.includes('معلومات سريعة'), anTitles.join());
  const su = await asUser('supp'); const suTitles = await su.$$eval('.ov-rail .sec-head h2', e => e.map(x => x.textContent));
  ok('Support overview: students block yes, activity log no', suTitles.includes('آخر الطلاب') && !suTitles.includes('آخر العمليات'), suTitles.join());
  await an.context().close(); await su.context().close();

  // logout
  await page.click('#logout-btn'); await page.waitForSelector('.login');
  ok('sidebar logout works', true);
  ok('JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  report(); await b.close();
})().catch(e => { require('./helper').report(); console.error('CRASH', e.message.split('\n').slice(0, 6).join('\n')); process.exit(1); });
