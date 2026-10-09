// perf/gameplay: NPC path search (src/nav.js) on the live city colliders. 160 seeded start/goal pairs around the player, a fifth of them
// into building lots (often unreachable - the case that used to cost seconds). Every search must stay within a frame budget.
// The module source is evaluated in the page against the game's colliders (it is not exposed by the bundle).
const fs = require('fs');
const path = require('path');
const { ROOT, run, freeze, result } = require('../lib.cjs');
const SRC = fs.readFileSync(path.join(ROOT, 'src/nav.js'), 'utf8').replace(/export function/g, 'function') + '\nreturn navPath;';
run('nav-perf', { q: 0, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate((SRC) => {
    const g = window.__game, nav = new Function(SRC)(), pl = g.player;
    let seed = 12345; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const lots = [...g.buildings.list].map((b) => b.lot).filter(Boolean), cases = [];
    for (let i = 0; i < 160; i++) {
      const a = rnd() * Math.PI * 2, r = 3 + rnd() * 30, s = g.world.colliders.resolve(pl.x + Math.cos(a) * r, pl.z + Math.sin(a) * r, 0.4, 0);
      const sx = s.x, sz = s.z, a2 = rnd() * Math.PI * 2, r2 = 5 + rnd() * 40;
      let tx = sx + Math.cos(a2) * r2, tz = sz + Math.sin(a2) * r2;
      if (i % 5 === 0) { const L = lots[(i * 7) % lots.length]; tx = (L.x0 + L.x1) / 2; tz = (L.z0 + L.z1) / 2; }
      cases.push([sx, sz, tx, tz]);
    }
    for (const c of cases.slice(0, 20)) nav(g, 0, c[0], c[1], c[2], c[3], 50);   // warm up
    const ts = []; let found = 0;
    for (const c of cases) { const t = performance.now(); const p = nav(g, 0, c[0], c[1], c[2], c[3], 50); ts.push(performance.now() - t); if (p) found++; }
    ts.sort((a, b) => a - b);
    return { cases: cases.length, found, avgMs: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(2), p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(2), maxMs: +ts[ts.length - 1].toFixed(1) };
  }, SRC);
  result('nav-perf', o.avgMs < 3 && o.p95Ms < 10 && o.maxMs < 40 && o.found >= o.cases * 0.5, o);
});
