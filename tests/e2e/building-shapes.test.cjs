// WLD-06/07: building shapes in the real city. Every ordinary building's stages nest inside each other and inside the lot, every stage keeps
// the lift / stair core, the levels Building.plan makes are contiguous (podium, each tower stage, roof) and sit on the slab below, each
// stage's facade instance has the stage's size and place, and the shape mix is reported (single-stage, stepped, wing, crown count).
const { run, freeze, result } = require('../lib.cjs');
run('building-shapes', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, w = g.world, THREE = window.__THREE, o = { bad: [], hist: {} };
    g.eng.render = () => {};
    const lots = w.lots.filter((l) => !l.far && !l.model && l.stages);
    const m4 = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), arr = w.facade.instanceMatrix.array;
    const inside = (a, b) => a.x0 >= b.x0 - 1e-6 && a.z0 >= b.z0 - 1e-6 && a.x1 <= b.x1 + 1e-6 && a.z1 <= b.z1 + 1e-6;
    let wing = 0, stepped = 0, crowns2 = 0;
    for (const l of lots) {
      const st = l.stages, towers = st.filter((s) => s.kind === 'tower'), crowns = st.filter((s) => s.kind === 'crown');
      const key = `${towers.length}T${crowns.length}C`; o.hist[key] = (o.hist[key] || 0) + 1;
      if (towers.length > 1) { stepped++; if ((towers[0].y1 - towers[0].y0) < 0.4 * (towers[towers.length - 1].y1 - towers[0].y0)) wing++; }
      if (crowns.length > 1) crowns2++;
      if (st[0].kind !== 'podium' || towers.length < 1) { o.bad.push(['kinds', l.id]); continue; }
      for (let k = 1; k < st.length; k++) {
        const a = st[k - 1], b = st[k];
        if (Math.abs(b.y0 - a.y1) > 1e-6) o.bad.push(['gap', l.id, k]);
        if (!inside(b, st[0]) || (b.kind === 'tower' && !inside(b, a))) o.bad.push(['nest', l.id, k]);
      }
      const t0 = towers[0], core = { x0: t0.x0 + 0.5, z0: t0.z0 + 0.5, x1: t0.x0 + 0.5 + 6.6, z1: t0.z0 + 0.5 + 6.0 };
      for (const t of towers) { if (!inside(core, t)) o.bad.push(['core', l.id]); if (t.x1 - t.x0 < Math.min(14, t0.x1 - t0.x0) - 1e-6 || t.z1 - t.z0 < Math.min(14, t0.z1 - t0.z0) - 1e-6) o.bad.push(['side', l.id]); }
      for (const s of st) {
        if (s.inst == null) { o.bad.push(['inst', l.id]); continue; }
        m4.fromArray(arr, s.inst * 16).decompose(P, Q, S);
        if (Math.abs(S.x - (s.x1 - s.x0)) > 1e-3 || Math.abs(S.z - (s.z1 - s.z0)) > 1e-3 || Math.abs(S.y - (s.y1 - s.y0)) > 1e-3 || Math.abs(P.y - s.y0) > 1e-3 || Math.abs(P.x - (s.x0 + s.x1) / 2) > 1e-3) o.bad.push(['instance', l.id, s.kind]);
      }
      // the levels Building.plan makes
      const b = g.buildings.byLot.get(l);
      if (!b) { o.bad.push(['nobuilding', l.id]); continue; }
      b.plan();
      const L = b.levels;
      for (let k = 1; k < L.length; k++) if (Math.abs(L[k].y - (L[k - 1].y + L[k - 1].h)) > 1e-6) { o.bad.push(['levels', l.id, k]); break; }
      for (const lv of L) if (lv.slab && !inside(lv.rect, lv.slab) && lv.tier !== 'roof') { o.bad.push(['slab', l.id, lv.k]); break; }
      if (Math.abs(b.roofY - towers[towers.length - 1].y1) > 1e-6) o.bad.push(['roof', l.id]);
    }
    o.lots = lots.length; o.stepped = stepped; o.wing = wing; o.crowns2 = crowns2;
    o.tall = lots.filter((l) => l.h > 60).length; o.tallStepped = lots.filter((l) => l.h > 60 && l.stages.filter((s) => s.kind === 'tower').length > 1).length;
    o.bad = o.bad.slice(0, 6);
    return o;
  });
  const pass = o.lots > 300 && o.bad.length === 0 && o.tallStepped / Math.max(1, o.tall) >= 0.3 && o.wing > 0 && o.crowns2 > 0;
  result('building-shapes', pass, o);
});
