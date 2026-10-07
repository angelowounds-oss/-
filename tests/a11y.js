// Usage: node tests/a11y.js http://localhost:8810/ <path-to-axe.min.js>
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:8810/';
const axeSrc = fs.readFileSync(process.argv[3], 'utf8');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const slugs = fs.readdirSync(__dirname + '/../site').filter(f => f.endsWith('.html')).map(f => f.slice(0, -5));
  const agg = {}; const over = [];
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, colorScheme: scheme }); const p = await ctx.newPage();
    for (const s of slugs) {
      await p.goto(BASE + s + '.html'); await p.evaluate(axeSrc);
      const r = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'] })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, t: v.nodes[0].target.join(' ').slice(0, 60) })));
      r.forEach(v => { const k = scheme + ':' + v.id; (agg[k] = agg[k] || { impact: v.impact, pages: [], n: 0, t: v.t }); agg[k].pages.push(s); agg[k].n += v.n; });
    }
    await ctx.close();
  }
  for (const w of [320, 768, 1280]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 } }); const p = await ctx.newPage();
    for (const s of slugs) { await p.goto(BASE + s + '.html'); if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) over.push(w + 'px ' + s); }
    await ctx.close();
  }
  console.log('AXE violations (grouped):'); Object.entries(agg).forEach(([k, v]) => console.log(' ', v.impact, k, 'nodes', v.n, 'pages', v.pages.length, v.pages.slice(0, 4).join(','), '| e.g.', v.t));
  if (!Object.keys(agg).length) console.log('  none');
  console.log('overflow pages:', over.length ? over.slice(0, 20) : 'none');
  // keyboard focus visibility
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 } }); const p = await ctx.newPage(); await p.goto(BASE + 'index.html');
  const bad = []; for (let i = 0; i < 22; i++) {
    await p.keyboard.press('Tab');
    const f = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const c = getComputedStyle(e); return { tag: e.tagName + (e.className ? '.' + String(e.className).split(' ')[0] : ''), outline: c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0, shadow: c.boxShadow !== 'none' }; });
    if (f && !f.outline && !f.shadow) bad.push(f.tag);
  }
  console.log('tab stops without visible focus indicator (first 22):', bad.length ? bad : 'none');
  // image card extremes
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  for (const [slug, id, val] of [['textcase', 't', 'ㅋ'.repeat(600)], ['textcase', 't', 'a'.repeat(400) + ' ' + 'b'.repeat(300)], ['housing-clock', 'name', '가'.repeat(120)], ['tripsplit', 't', Array.from({ length: 40 }, (_, i) => '사람' + i + ' ' + (i + 1) * 1000).join('\n')]]) {
    await p.goto(BASE + slug + '.html'); await p.fill('#' + id, val); await p.dispatchEvent('#' + id, 'input'); await p.click('.imgbtn');
    await p.waitForSelector('.overlay img'); const h = await p.$eval('.overlay img', e => new Promise(r => { if (e.complete) r([e.naturalWidth, e.naturalHeight]); else e.onload = () => r([e.naturalWidth, e.naturalHeight]); }));
    console.log('image card', slug, 'size', h.join('x'), h[1] > 600 && h[1] < 3000 ? 'ok' : 'CHECK'); await p.click('.overlay button');
  }
  console.log('js errors:', errs.length ? errs : 'none');
  await b.close();
})();
