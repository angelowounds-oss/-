// Usage: node tests/fuzz.js http://localhost:8810/
// Pushes blank / zero / negative / huge / text values into each input of every page and flags visible NaN/Infinity/undefined or JS errors.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:8810/';
const skip = new Set(['index', 'about', 'terms', 'privacy']);
const BAD = /NaN|Infinity|undefined|\[object|-0원|-\$0\.00|null/;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 420, height: 900 } });
  const slugs = fs.readdirSync(__dirname + '/../site/' + (process.env.SUBDIR || '')).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5)).filter(s => !skip.has(s));
  const findings = [];
  for (const slug of slugs) {
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + slug + '.html');
    const inputs = await p.$$eval('main .card input, main .card textarea', els => els.map(e => ({ id: e.id, type: e.type, tag: e.tagName })).filter(x => x.id));
    const manual = await p.$('main .card button:not(.ghost):not(.sharebtn):not(.imgbtn):not(#spin):not(#reset):not(#showall):not(#newlad)');
    const modes = { blank: '', zero: '0', neg: '-5', huge: '1e15', text: 'abc' };
    for (const inp of inputs) {
      if (['checkbox', 'radio', 'search'].includes(inp.type)) continue;
      const orig = await p.$eval('#' + inp.id, e => e.value);
      for (const [mode, val] of Object.entries(modes)) {
        let v = val;
        if (inp.type === 'date' || inp.type === 'time') { if (mode === 'zero' || mode === 'neg' || mode === 'huge' || mode === 'text') continue; }
        if (inp.type === 'number' && mode === 'text') continue;
        await p.$eval('#' + inp.id, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
        if (manual) await manual.click().catch(() => {});
        const t = await p.evaluate(() => [...document.querySelectorAll('#res,#out,.result,#r')].map(e => e.innerText).join(' | '));
        if (BAD.test(t)) findings.push(`${slug}#${inp.id} ${mode}: ${t.replace(/\s+/g, ' ').slice(0, 110)}`);
      }
      await p.$eval('#' + inp.id, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, orig);
    }
    if (errs.length) findings.push(`${slug} JS ERROR: ${errs[0]}`);
    await p.close();
  }
  console.log(`pages fuzzed: ${slugs.length}, findings: ${findings.length}`);
  findings.forEach(f => console.log(' -', f));
  await b.close(); process.exit(findings.length ? 1 : 0);
})();
