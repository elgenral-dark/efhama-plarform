const { launch, login, api, ok, report, BASE } = require('./helper');
const WIDTHS = (process.argv[2] || '320,360,375,390,414,430').split(',').map(Number);
const THEMES = (process.argv[3] || 'light').split(',');
(async () => {
  const b = await launch();
  const errors = [];
  for (const theme of THEMES) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(t => { try { localStorage.setItem('efhamha:theme', t); } catch (e) {} }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(theme + ': ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(theme + ': ' + m.text()); });
    await login(page, 'admin', 'test-pass-1234'); await page.waitForSelector('.side');
    const data = (await api(page, 'GET', '/api/data')).body; const lid = (data.lessons[0] || {}).id;
    const stu = (await api(page, 'GET', '/api/students')).body.items[0];
    const pages = ['overview', 'paths', 'modules', 'lessons', 'questions', 'quizzes', 'projects', 'assets', 'glossary', 'gamification', 'ai', 'students', 'analytics', 'subscriptions', 'users', 'logs', 'settings', 'data']
      .concat(lid ? ['lessons/edit/' + lid] : []).concat(stu ? ['students/' + stu.id] : []);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: w < 768 ? 800 : 900 });
      const bad = [];
      for (const p of pages) {
        await page.goto(BASE + '/#/' + p); await page.waitForTimeout(450);
        const m = await page.evaluate(() => {
          const de = document.documentElement; const side = document.querySelector('.side'); const sr = side.getBoundingClientRect();
          const wide = []; document.querySelectorAll('#content *').forEach(el => { const r = el.getBoundingClientRect(); if (r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !el.closest('.tbl-wrap, .tabs, .seg, pre, .nav, .modal, .assets-grid, svg') && getComputedStyle(el).position !== 'fixed') wide.push(el.className || el.tagName); });
          return { overflow: de.scrollWidth - de.clientWidth, sideRight: Math.round(sr.right), sideLeft: Math.round(sr.left), iw: innerWidth, dir: de.dir, wide: wide.slice(0, 3) };
        });
        if (m.overflow > 0) bad.push(p + ' overflow=' + m.overflow);
        if (m.wide.length) bad.push(p + ' wide=' + m.wide.join('/'));
        if (w > 900 && m.sideRight !== m.iw) bad.push(p + ' sidebar not at right edge (RTL)');
        if (w <= 900 && m.sideLeft < m.iw - 2) bad.push(p + ' drawer not hidden');
      }
      ok(theme + ' @' + w + 'px: ' + pages.length + ' pages — no horizontal overflow / RTL layout ok', bad.length === 0, bad.slice(0, 4).join(' ; '));
    }
    await ctx.close();
  }
  ok('no JS errors during matrix', errors.length === 0, errors.slice(0, 3).join(' | '));
  report(); await b.close();
})().catch(e => { console.error('CRASH', e.message.split('\n').slice(0, 5).join('\n')); process.exit(1); });
