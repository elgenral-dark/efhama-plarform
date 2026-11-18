const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const out = [];
  await page.goto('http://localhost:8790/index.html'); await page.waitForSelector('.ov-grid');
  out.push(['local overview uses the new layout', !!(await page.$('.ov-welcome')) && (await page.$$('.stat-card')).length === 8]);
  out.push(['local: activity/students cards explain server requirement', (await page.$$eval('.ov-rail .ov-empty', e => e.map(x => x.textContent).join())).includes('الخادم')]);
  out.push(['local: sidebar shows local mode, no logout', (await page.textContent('.side-user')).includes('وضع محلي') && (await page.$eval('#logout-btn', e => e.hidden))]);
  out.push(['local: profile menu explains no login', await (async () => { await page.click('#profile-btn'); return (await page.textContent('#profile-pop')).includes('وضع محلي'); })()]);
  await page.keyboard.press('Escape');
  for (const p of ['subscriptions', 'ai', 'logs', 'users', 'students', 'analytics']) { await page.click(`.nav a[data-page=${p}]`); await page.waitForTimeout(200); out.push(['local: ' + p + ' => requires server (no fake data)', (await page.textContent('#content')).includes('يتطلب تشغيل الخادم')]); }
  await page.click('.nav a[data-page=paths]'); await page.waitForSelector('.tbl'); out.push(['local: existing sections work (paths)', true]);
  await page.click('[data-act=add]'); await page.fill('.modal input[type=text] >> nth=0', 'مسار محلي'); await page.click('.modal .primary'); await page.waitForSelector('text=مسار محلي'); out.push(['local: add path works', true]);
  await page.setViewportSize({ width: 390, height: 800 }); await page.goto('http://localhost:8790/index.html#/overview'); await page.waitForSelector('.ov-grid');
  out.push(['local @390: no horizontal overflow', (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0]);
  out.push(['no JS errors', errs.length === 0]);
  console.log(out.map(r => (r[1] ? 'PASS' : 'FAIL') + ' | ' + r[0]).join('\n')); await b.close();
})();
