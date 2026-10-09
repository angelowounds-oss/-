// perf: JavaScript time of a game frame (update + render submission with rendering stubbed: SwiftShader GPU timings are meaningless) while
// walking a rectangle at 7 m/s and while driving, 1500 frames each. Thresholds are loose (shared CI machines are noisy); the numbers are
// the baseline to compare against - see docs/PERF-BASELINE.md.
const { run, freeze, result } = require('../lib.cjs');
run('frame-time', { q: 1, width: 480, height: 360 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, upd = window.__upd; g.eng.render = () => {}; g.sandbox.on = true; g.sandbox.god = true;
    const stat = (fr) => { const s = fr.slice().sort((a, b) => a - b), n = s.length; return { median: +s[n >> 1].toFixed(1), p99: +s[Math.floor(n * 0.99)].toFixed(1), max: +s[n - 1].toFixed(1), over16: s.filter((x) => x > 16.7).length, over33: s.filter((x) => x > 33).length }; };
    const fr = []; const wp = [[0, 1], [1, 0], [0, -1], [-1, 0]]; let dir = 0, x = pl.x, z = pl.z;
    for (let i = 0; i < 1500; i++) { if (i % 300 === 0) dir = (dir + 1) % 4; x += wp[dir][0] * 7 / 60; z += wp[dir][1] * 7 / 60; pl.body3.teleport(x, pl.y, z); pl.x = x; pl.z = z; const t = performance.now(); upd(1 / 60); fr.push(performance.now() - t); if (i % 250 === 0) await new Promise((r) => setTimeout(r, 0)); }
    const walk = stat(fr);
    const v = g.vehicles.filter((q) => !q.dead && !q.spec.craft).sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z))[0];
    pl.body3.teleport(v.x + 2.5, pl.y, v.z); pl.x = v.x + 2.5; pl.z = v.z; for (let i = 0; i < 5; i++) upd(1 / 60);
    g.enterVehicle(v); const fr2 = [];
    for (let i = 0; i < 1500; i++) { g.input.keys.add('KeyW'); if (i % 240 < 20) g.input.keys.add('KeyD'); else g.input.keys.delete('KeyD'); const t = performance.now(); upd(1 / 60); fr2.push(performance.now() - t); if (i % 250 === 0) await new Promise((r) => setTimeout(r, 0)); }
    g.input.keys.delete('KeyW'); g.input.keys.delete('KeyD');
    return { walk, drive: stat(fr2) };
  });
  const ok = (s) => s.median < 8 && s.p99 < 30 && s.over33 <= 8;
  result('frame-time', ok(o.walk) && ok(o.drive), o);
});
