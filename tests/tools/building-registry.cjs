// The building list (ADR-0030): every building of the game with its number, made in the browser because the capital's lots are only built there.
//   node tests/tools/building-registry.cjs            writes docs/buildings/registry.csv and the counts in docs/buildings/README.md
//   node tests/tools/building-registry.cjs --check    compares with the committed list: added, removed and moved (> 1 m) buildings; exit 1 on a difference
const fs = require('fs');
const path = require('path');
const { openGame, ROOT } = require('../lib.cjs');
const CSV = path.join(ROOT, 'docs/buildings/registry.csv'), README = path.join(ROOT, 'docs/buildings/README.md');
const HEAD = 'uid,area,kind,x,z,w,d,h,floors,name,enter,src';
const line = (r) => [r.uid, JSON.stringify(r.area), r.kind, r.x, r.z, r.w, r.d, r.h, r.floors, JSON.stringify(r.name || ''), r.enter ? 1 : 0, r.src].join(',');
const parse = (text) => new Map(text.trim().split('\n').slice(1).map((l) => { const f = l.match(/("(?:[^"\\]|\\.)*"|[^,]*)(,|$)/g).map((s) => s.replace(/,$/, '')); return [f[0], { x: +f[3], z: +f[4], line: l }]; }));
(async () => {
  const check = process.argv.includes('--check');
  const { browser, page, errors } = await openGame({ q: 0, width: 320, height: 180 });
  const rows = await page.evaluate(() => window.__bld.list());
  await browser.close();
  const dup = rows.length - new Set(rows.map((r) => r.uid)).size;
  const text = [HEAD, ...rows.map(line)].join('\n') + '\n';
  // the counts by group: the capital, each other city, the villages (generated and real), farms, industry, service areas
  const group = (r) => (r.src === 'world.js' ? 'NEON' : r.src === 'citylayout.js' || r.kind === 'landmark' ? r.area : r.uid.startsWith('V') ? '마을' : r.uid.startsWith('F') ? '농장' : r.kind === 'service-area' ? '휴게소' : '산업·통신');
  const counts = {}; for (const r of rows) { const g = group(r); counts[g] = (counts[g] || 0) + 1; }
  if (check) {
    const old = fs.existsSync(CSV) ? parse(fs.readFileSync(CSV, 'utf8')) : new Map(), now = parse(text), added = [], removed = [], moved = [];
    for (const [k, v] of now) { const o = old.get(k); if (!o) added.push(k); else if (Math.hypot(o.x - v.x, o.z - v.z) > 1) moved.push(k); }
    for (const k of old.keys()) if (!now.has(k)) removed.push(k);
    console.log(JSON.stringify({ total: rows.length, dup, added: added.length, removed: removed.length, moved: moved.length, examples: { added: added.slice(0, 5), removed: removed.slice(0, 5), moved: moved.slice(0, 5) }, errors: errors.length }));
    process.exitCode = dup || added.length || removed.length || moved.length || errors.length ? 1 : 0;
    return;
  }
  fs.mkdirSync(path.dirname(CSV), { recursive: true }); fs.writeFileSync(CSV, text);
  const table = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([g, n]) => `| ${g} | ${n} |`).join('\n');
  const doc = fs.existsSync(README) ? fs.readFileSync(README, 'utf8') : '';
  const block = `<!-- AUTO:counts (tests/tools/building-registry.cjs) -->\n| 묶음 | 건물 수 |\n|---|---|\n${table}\n| **합계** | **${rows.length}** |\n<!-- /AUTO:counts -->`;
  fs.writeFileSync(README, /<!-- AUTO:counts[\s\S]*\/AUTO:counts -->/.test(doc) ? doc.replace(/<!-- AUTO:counts[\s\S]*\/AUTO:counts -->/, block) : doc + '\n' + block + '\n');
  console.log(JSON.stringify({ total: rows.length, dup, counts, errors: errors.slice(0, 2) }));
})().catch((e) => { console.error(String(e.stack || e).slice(0, 600)); process.exit(1); });
