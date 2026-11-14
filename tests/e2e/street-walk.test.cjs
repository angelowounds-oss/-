// Street walkers (EV-25): on foot in the capital's compiled streets, pedestrians fill the pavements around the player. After 20 s near a primary
// road the test counts the street walkers within 200 m and, over a further 20 s sampled every half second, how often one stood on a carriageway
// (closer to a compiled street's centre line than its half width, by streetgeo's carriage) and how far they walked.
// Pass: at least 12 walkers, none on a carriageway in more than 2 % of the samples, and the median walker moved at least 15 m.
const { run, freeze, result } = require('../lib.cjs');
run('street-walk', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, T = window.__test, RG = window.__region; g.hurtPlayer = () => {}; g.eng.render = () => {};
    const yieldN = async (n) => { for (let k = 0; k < n; k++) { T.step(1); if (k % 2) await new Promise((f) => setTimeout(f, 0)); } };
    if (!g.streetwalk) return { error: 'no street walkers' };
    const C = RG.regions()[0]; let p = null;
    for (const r of RG.regionRoads()) { if (r.hw !== 'primary' || r.x.length < 40) continue; const i = r.x.length >> 1; if (RG.regionWeight(r.x[i], r.z[i]) >= 1 && r.x[i] > C.x0 + 3000 && r.z[i] > C.z0 + 3000) { p = [r.x[i], r.z[i], r.y[i]]; break; } }
    if (!p) return { error: 'no primary road' };
    await T.arrive(p[0] + 12, p[1], p[2] + 1); await yieldN(20 * 60);
    const W = g.streetwalk.walkers, pl = g.player, n = W.filter((h) => Math.hypot(h.x - pl.x, h.z - pl.z) < 200).length;
    const start = new Map(W.map((h) => [h, [h.x, h.z]])), H = g.hwtraffic;
    let samples = 0, onRoad = 0;
    for (let k = 0; k < 40; k++) {
      await yieldN(30);
      for (const h of W) { const s = H.nearestSample(h.x, h.z, 30, true); samples++; if (s && s.r.kind === 'arterial' && !s.r.alley && s.d < T.carriageHalf(s.r) - 0.3) onRoad++; }
    }
    const moved = [...start].filter(([h]) => W.includes(h)).map(([h, q]) => Math.hypot(h.x - q[0], h.z - q[1])).sort((a, b) => a - b);
    return { walkers: n, samples, onRoad, onRoadShare: samples ? +(onRoad / samples).toFixed(3) : null, medianMoved: moved.length ? +moved[moved.length >> 1].toFixed(1) : 0 };
  });
  result('street-walk', o.walkers >= 12 && o.onRoadShare !== null && o.onRoadShare <= 0.02 && o.medianMoved >= 15, o);
});
