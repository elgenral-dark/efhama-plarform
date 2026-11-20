const { chromium } = require('playwright');
const BASE = 'http://localhost:8787';
const results = [];
const ok = (n, c, x = '') => results.push([c ? 'PASS' : 'FAIL', n, c ? '' : String(x)]);
async function launch() { return chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); }
async function login(page, u, p) {
  await page.goto(BASE + '/'); await page.waitForSelector('.login');
  await page.fill('#un', u); await page.fill('#pw', p); await page.click('.login button[type=submit]');
  await page.waitForSelector('.side');
}
const api = (page, method, path, body) => page.request.fetch(BASE + path, { method, headers: { 'X-Requested-With': 'efhamha', 'content-type': 'application/json' }, data: body === undefined ? undefined : JSON.stringify(body) }).then(async r => ({ status: r.status(), body: await r.json().catch(() => null) }));
async function overflow(page) { return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); }
function report() { console.log(results.map(r => r.join(' | ')).join('\n')); console.log('TOTAL', results.length, 'FAILS', results.filter(r => r[0] === 'FAIL').length); }
module.exports = { launch, login, api, ok, overflow, report, BASE, results };
