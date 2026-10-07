// Usage: node tests/qa.js http://localhost:8800/   (run `python3 tests/cases.py` first)
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:8800/';
const cases = JSON.parse(fs.readFileSync(__dirname + '/' + (process.env.CASES || 'cases.json'), 'utf8'));
const norm = s => s.replace(/\s+/g, ' ').trim();
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ locale: process.env.LOCALE || 'ko-KR', timezoneId: process.env.TZ_ID || 'Asia/Seoul', viewport: { width: 420, height: 900 } });
  let fail = 0, pass = 0;
  for (const c of cases) {
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.clock.install({ time: new Date(process.env.NOW || '2026-10-07T12:00:00+09:00') });
    await p.goto(BASE + c.slug + '.html');
    for (const [id, v] of Object.entries(c.inputs)) {
      const el = p.locator('#' + id);
      const tag = await el.evaluate(e => e.tagName);
      if (tag === 'SELECT') await el.selectOption(v);
      else { await el.fill(v); await el.dispatchEvent('input'); }
    }
    if (c.click) await p.locator('main .card ' + c.click).first().click();
    await new Promise(r => setTimeout(r, 40));
    let text = await p.evaluate(() => {
      const r = document.getElementById('res') || document.getElementById('r') || document.getElementById('out');
      if (r) return r.innerText;
      const rs = [...document.querySelectorAll('.result')];
      if (rs.length) return rs.map(e => e.innerText).join(' ');
      return [...document.querySelectorAll('main input')].map(e => e.value).join(' ');
    });
    text = norm(text);
    const miss = c.expect.filter(e => e && !text.includes(norm(e)));
    if (miss.length || errs.length) { fail++; console.log('FAIL', c.name, '\n   missing:', JSON.stringify(miss), errs.length ? ' errors: ' + errs.join('|') : '', '\n   actual :', text.slice(0, 220)); }
    else pass++;
    await p.close();
  }
  console.log(`\n${pass} passed, ${fail} failed, ${cases.length} total`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
