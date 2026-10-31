// WORLD=small builds skip the bake and generate the world in the page (ADR-0012 phase 3). Both builds must be the same world: the same terrain under the
// far-land clipmap, the same city layouts, the same highway network; only the start differs (the baked one decodes in a worker).
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const { openGame, result, ROOT, GAME } = require('../lib.cjs');
(async () => {
  const dist = path.join(os.tmpdir(), 'neon_city_small', 'Korea'), out = path.join(dist, 'game');
  const b = spawnSync('node', ['build/build.mjs'], { cwd: ROOT, env: { ...process.env, WORLD: 'small', DIST: dist, LAUNCHER: '0' }, encoding: 'utf8' });
  if (b.status !== 0) return result('world-small', false, { build: (b.stderr || b.stdout).slice(0, 300) });
  const probe = () => {
    const g = window.__game, F = g.farland, S = g.citysites, N = g.hwtraffic.N;
    const sum = (a) => { let s = 0; for (let i = 0; i < a.length; i += 7) s += a[i]; return Math.round(s * 100) / 100; };
    return { baked: !!globalThis.__BAKED, bakedMs: globalThis.__BAKED_MS || 0, h: [sum(F.levels[4].h), sum(F.levels[6].h)], buildings: S.cities.map((C) => C.L.bld.length / 12), roads: N.roads.length, pts: N.roads.reduce((s, r) => s + r.pts.length, 0), ramps: N.roads.filter((r) => r.kind === 'ramp').length, stations: g.transit.stations.length };
  };
  let A, B, errs = [];
  for (const [url, key] of [[GAME, 'A'], [out, 'B']]) {
    const ctx = await openGame({ q: 1, width: 320, height: 180, url });
    try { const r = await ctx.page.evaluate(probe); if (key === 'A') A = r; else B = r; errs.push(...ctx.errors); } finally { await ctx.browser.close(); }
  }
  const same = JSON.stringify([A.h, A.buildings, A.roads, A.pts, A.ramps, A.stations]) === JSON.stringify([B.h, B.buildings, B.roads, B.pts, B.ramps, B.stations]);
  result('world-small', A.baked && !B.baked && same && A.bakedMs < 2000 && !errs.length, { baked: A, small: B, same, errs: errs.slice(0, 3) });
})();
