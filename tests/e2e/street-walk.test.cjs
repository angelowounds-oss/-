// Street walkers (EV-25): on foot in the capital's compiled streets, pedestrians fill the pavements around the player. After 20 s near a primary
// road the test counts the street walkers within 200 m and, over a further 60 s sampled every half second, how often one stood on a carriageway
// off a crossing (closer to a compiled street's centre line than its half width, by streetgeo's carriage) and how far they walked. At signalled
// junctions walkers go straight over a crossing, turn into the crossing street or cross back: for up to 6 junctions a walker is put 30 m before
// one and followed, asked to go straight on at every other one and to turn at the rest (it does what the junction allows: straight on needs a
// marked crossing on its side and its street going on).
// Pass: at least 12 walkers, none on a carriageway off a crossing in more than 2 % of the samples, the median walker moved at least 15 m, a
// followed walker crossed at a signal and one turned, and no walker was still on a crossing when its cars got yellow or green.
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
    for (let k = 0; k < 120; k++) {
      await yieldN(30);
      for (const h of W) { if (h.walk && h.walk.crossing) continue; const s = H.nearestSample(h.x, h.z, 30, true); samples++; if (s && s.r.kind === 'arterial' && !s.r.alley && s.d < T.carriageHalf(s.r) - 0.3) onRoad++; }
    }
    const moved = [...start].filter(([h]) => W.includes(h)).map(([h, q]) => Math.hypot(h.x - q[0], h.z - q[1])).sort((a, b) => a - b);
    // at signalled junctions: a walker is put on a pavement 30 m before one, walking toward it, and followed for up to 60 s (signalled junctions
    // are a few hundred metres apart, so the walkers placed at random seldom reach one in a test's time). The player waits beside the junction.
    const SW = g.streetwalk, sig = (H.sig || []).slice().sort((a, b) => Math.hypot(a.x - p[0], a.z - p[1]) - Math.hypot(b.x - p[0], b.z - p[1])), J = [];
    for (const j of sig) {
      if (J.length >= 6) break;
      for (const a of j.arms) {
        const ax = Math.cos(a.ang), az = Math.sin(a.ang), near = H.nearestSample(j.x + ax * 30, j.z + az * 30, 10, true); if (!near) continue;
        const r = near.r; if (r.kind !== 'arterial' || r.oneway || r.x.length < 8 || /link|motorway|trunk/.test(r.hw) || !r.x.some((x, q) => Math.hypot(x - j.x, r.z[q] - j.z) < 12)) continue;
        const i = Math.max(2, Math.min(r.x.length - 3, near.i)), dir = Math.hypot(r.x[i + 1] - j.x, r.z[i + 1] - j.z) < Math.hypot(r.x[i - 1] - j.x, r.z[i - 1] - j.z) ? 1 : -1;
        J.push({ j, r, i, dir }); break;
      }
    }
    const trials = [];
    for (const [n, { j, r, i, dir }] of J.entries()) {
      SW.prefer = n % 2 ? 'turn' : 'straight';   // each way tried: the walker's choice is otherwise random
      const ax = j.x - p[0], az = j.z - p[1], al = Math.hypot(ax, az) || 1;
      await T.arrive(j.x - az / al * 30, j.z + ax / al * 30, g.groundY(j.x - az / al * 30, j.z + ax / al * 30, 1e9) + 1); await yieldN(240);
      const h = SW.walkers.find((q) => !q.dead && !q.remove); if (!h) continue;
      const s = Math.random() < 0.5 ? 1 : -1, P = SW.pave(r, i, s), y = g.groundY(P.x, P.z, r.y[i] + 3);
      h.x = P.x; h.z = P.z; h.y = y; h.floorY = y; h.vx = h.vz = 0; h.walk = { r, i, s, dir, pace: 1.4 }; h.group.position.set(P.x, y, P.z);
      const tr = { j: [Math.round(j.x), Math.round(j.z)], road: r.id, want: SW.prefer, plan: null, crossed: 0, d0: +Math.hypot(P.x - j.x, P.z - j.z).toFixed(1) };
      for (let k = 0; k < 120; k++) {
        await yieldN(30);
        tr.plan = h.walk.plan || null; tr.crossed = h.walk.crossed || 0;
        if (tr.crossed && (!h.walk.route || !h.walk.route.length)) break;
        if (tr.plan === 'turn' && k > 20) break;
        if (h.dead || h.remove) break;
      }
      tr.dEnd = +Math.hypot(h.x - j.x, h.z - j.z).toFixed(1); tr.state = h.state; tr.same = h.walk && h.walk.r === r; tr.moved = +Math.hypot(h.x - P.x, h.z - P.z).toFixed(1); tr.stop = Math.max(...j.arms.map((a) => a.stop));
      trials.push(tr);
    }
    SW.prefer = null;
    return { walkers: n, samples, onRoad, onRoadShare: samples ? +(onRoad / samples).toFixed(3) : null, medianMoved: moved.length ? +moved[moved.length >> 1].toFixed(1) : 0,
      trials, planned: g.streetwalk.planned, crossings: g.streetwalk.crossings, onGreen: g.streetwalk.onGreen };
  });
  result('street-walk', o.walkers >= 12 && o.onRoadShare !== null && o.onRoadShare <= 0.02 && o.medianMoved >= 15
    && o.trials.some((t) => t.crossed >= 1) && o.trials.some((t) => t.plan === 'turn') && o.onGreen === 0, o);
});
