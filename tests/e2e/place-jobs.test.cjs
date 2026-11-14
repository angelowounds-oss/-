// Place jobs (EV-72): the place index loads after the boot, and in a compiled region a delivery and a taxi job send the player to a real place:
// a named or labelled shop, restaurant, hotel and so on of the index, set on the pavement of the street beside it (within 6 m of a compiled
// street's carriageway edge, on the ground within 2 m). Five deliveries and five taxi pick-ups near a primary road of the capital.
// Pass: the index has over 100,000 places, and every job's target is a place of the index on a pavement as above.
const { run, freeze, result } = require('../lib.cjs');
run('place-jobs', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, T = window.__test, RG = window.__region, P = window.__places; g.hurtPlayer = () => {}; g.eng.render = () => {};
    const yieldN = async (n) => { for (let k = 0; k < n; k++) { T.step(1); if (k % 2) await new Promise((f) => setTimeout(f, 0)); } };
    const I = await P.loadPlaces(); if (!I) return { error: 'no place index' };
    const C = RG.regions()[0]; let p = null;
    for (const r of RG.regionRoads()) { if (r.hw !== 'primary' || r.x.length < 40) continue; const i = r.x.length >> 1; if (RG.regionWeight(r.x[i], r.z[i]) >= 1 && r.x[i] > C.x0 + 3000 && r.z[i] > C.z0 + 3000) { p = [r.x[i], r.z[i], r.y[i]]; break; } }
    if (!p) return { error: 'no primary road' };
    await T.arrive(p[0] + 12, p[1], p[2] + 1); await yieldN(240);
    const J = g.jobs, H = g.hwtraffic, jobs = [];
    for (const type of ['delivery', 'delivery', 'delivery', 'delivery', 'delivery', 'taxi', 'taxi', 'taxi', 'taxi', 'taxi']) {
      J.start(type); const j = J.cur; if (!j) { jobs.push({ type, none: true }); continue; }
      const e = j.e, s = H.nearestSample(e.x, e.z, 40, true), edge = s ? s.d - T.carriageHalf(s.r) : null, gy = g.groundY(e.x, e.z);
      jobs.push({ type, name: e.name, place: !!e.place, kind: e.place?.kind, d: Math.round(Math.hypot(e.x - g.player.x, e.z - g.player.z)), edge: edge == null ? null : +edge.toFixed(1), groundDy: +(gy - (s ? s.r.y[s.i] : gy)).toFixed(1) });
      J.finish(false); await yieldN(4);
    }
    return { count: I.count, counts: I.counts(), jobs };
  });
  const ok = o.count > 100000 && o.jobs && o.jobs.every((j) => j.place && j.edge != null && j.edge > -0.5 && j.edge < 6 && Math.abs(j.groundDy) < 2);
  result('place-jobs', ok, o);
});
