// performance gate of the 100 km world (ADR-0012): JavaScript time per frame (rendering stubbed, as everywhere in this container: no GPU) at five places,
// and what one real frame would send to the GPU there (draw calls, triangles). Numbers go to docs/PERF-BASELINE.md; the limits below are the gate.
const { run, freeze, result } = require('../lib.cjs');
run('world-perf', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, S = g.citysites, pl = g.player, o = { at: {} }; g.hurtPlayer = () => {};
    const realRender = g.eng.render; g.eng.render = () => {};
    const step = (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); };
    const park = (x, z, y = 1) => { pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
    const stats = (a) => { a.sort((x, y) => x - y); return { med: +a[a.length >> 1].toFixed(2), p99: +a[Math.floor(a.length * 0.99)].toFixed(1), max: +a[a.length - 1].toFixed(0) }; };
    const gpu = () => { const info = g.eng.renderer.info; info.autoReset = false; info.reset(); g.eng.render = realRender; g.renderFrame(0, true); const r = info.render, out = { calls: r.calls, tris: r.triangles }; info.autoReset = true; g.eng.render = () => {}; return out; };
    const measure = (name, n = 360) => { const a = []; for (let i = 0; i < n; i++) { const t = performance.now(); window.__upd(1 / 60); a.push(performance.now() - t); } o.at[name] = { ...stats(a), ...gpu() }; };
    park(0, 0); step(120); measure('capital street');
    { const C = S.cities.find((q) => q.c.id === 'mid3'), c = C.c; park(c.x + 30, c.z + 30); step(240); measure('city street (street life)'); }
    { const C = S.cities.find((q) => q.c.id === 'harbor'), c = C.c; park(c.x + 30, c.z + 30); step(240); const cam = g.camera; measure('port city street'); o.harborTiles = { near: S.stats.near, mid: S.stats.mid, tris: Math.round(S.stats.tris) }; }
    { const N = g.hwtraffic.N, hw = N.roads.find((q) => q.kind === 'highway'), m = hw.pts[Math.floor(hw.pts.length / 2)]; park(m[0], m[1]); step(240); measure('highway'); }
    // the transition: walk 4 km across a city at 30 m/s (a car) and take the worst frame; tile creation is a frame at a time
    { const C = S.cities.find((q) => q.c.id === 'airfield'), c = C.c; park(c.x - 1800, c.z + 800); step(180); const a = []; for (let k = 0; k < 900; k++) { park(c.x - 1800 + k * 4, c.z + 800); const t = performance.now(); window.__upd(1 / 60); a.push(performance.now() - t); } o.crossing = stats(a); }
    g.eng.render = realRender; return o;
  });
  const A = o.at, ok = A['capital street'].med < 8 && A['city street (street life)'].med < 16 && A['port city street'].med < 16 && A.highway.med < 14 && o.crossing.p99 < 90 && A['port city street'].tris < 3.2e6 && A['port city street'].calls < 1100;
  result('world-perf', ok, o);
});
