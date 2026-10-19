// The compiled region (KOREA-PLAN v2 M3b): the autopilot drives a car 3 km along a compiled one-way motorway without leaving the road, falling or
// going against the direction of the line.
const { run, freeze, result } = require('../lib.cjs');
run('region-drive', { q: 1, width: 640, height: 360 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, RG = window.__region, o = {}; g.hurtPlayer = () => {};
    g.eng.render = () => {};
    const step = (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); };
    if (!RG || !RG.regionRoads().length) return { noRegion: true };
    // a motorway line well inside the region with 3 km of road after the start
    const roads = RG.regionRoads(), want = Math.ceil(3000 / 8);
    let line = null, i0 = 0;
    for (const r of roads) { if ((r.hw !== 'motorway' && r.hw !== 'trunk') || r.x.length < want + 40) continue; for (let i = 20; i + want < r.x.length; i += 40) { if (RG.regionWeight(r.x[i], r.z[i]) < 1 || RG.regionWeight(r.x[i + want], r.z[i + want]) < 1) continue; line = r; i0 = i; break; } if (line) break; }
    if (!line) return { noLine: true };
    const x0 = line.x[i0], z0 = line.z[i0], tx = line.x[i0 + 1] - x0, tz = line.z[i0 + 1] - z0, h = Math.atan2(tx, tz), y0 = line.y[i0];
    o.oneway = line.oneway; o.line = line.id;
    pl.body3.teleport(x0, y0 + 1, z0); pl.x = x0; pl.y = y0 + 1; pl.z = z0; pl.vy = 0; step(120);
    const V = g.vehicles[0].constructor, v = new V(g, 'sport', 0x333333, 'parked', {}); v.x = x0; v.z = z0; v.h = h; v.awake = true; g.addVehicle(v); step(60);
    o.startAbove = +(v.pv.body.translation().y - y0).toFixed(2); g.enterVehicle(v);
    const ex = line.x[i0 + want], ez = line.z[i0 + want]; const rt = g.autonav.router.route(x0, z0, ex, ez); o.route = { straight: rt.straight, km: Math.round(rt.length), pts: rt.pts.length, first: rt.pts.filter((_, k) => k % 60 === 0).map((q) => q.map((n) => Math.round(n))), start: [Math.round(x0), Math.round(z0)], end: [Math.round(ex), Math.round(ez)] };
    o.auto = { started: g.autonav.start(ex, ez) };
    let top = 0, minAbove = 9, maxAbove = -9, back = 0; const x1 = v.x, z1 = v.z;
    for (let k = 0; k < 5400 && g.autonav.active; k++) {
      step(1); top = Math.max(top, v.speed); const t = v.pv.body.translation(), gy = window.__landfn ? window.__landfn.physHeight(v.x, v.z, 8) : 0;
      minAbove = Math.min(minAbove, t.y - gy); maxAbove = Math.max(maxAbove, t.y - gy);
      if (v.speed > 5 && Math.sin(v.h) * tx + Math.cos(v.h) * tz < 0 && !(v.reverse)) back++;
    }
    o.auto.driven = Math.round(Math.hypot(v.x - x1, v.z - z1)); o.auto.left = Math.round(Math.hypot(ex - v.x, ez - v.z)); o.auto.topKmh = Math.round(top * 3.6); o.auto.alive = !v.dead; o.auto.minAbove = +minAbove.toFixed(2); o.auto.maxAbove = +maxAbove.toFixed(2); o.auto.against = back;
    g.autonav.cancel && g.autonav.cancel(); g.exitVehicle(true); step(30);
    // the wall: shut across its middle, open at each corner (60 m gates, where the connectors leave along the diagonals)
    const walk = (x, z, dx, dz) => { const b = pl.body3; b.teleport(x, 3, z); pl.x = x; pl.y = 3; pl.z = z; pl.vy = 0; step(90); for (let k = 0; k < 450; k++) { for (let q = 0; q < 4; q++) b.move(1 / 60, dx * 6, dz * 6, 0); step(1); } const t = b.body.translation(); return Math.round(Math.max(Math.abs(t.x), Math.abs(t.z))); };
    o.wallMid = walk(0, 1400, 0, 1);
    // the gates: a ray along each corner diagonal passes the wall (a ray at its middle does not)
    o.gateRays = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => g.world.colliders.raycast(sx * 1400, 2, sz * 1400, sx * 0.7071, 0, sz * 0.7071, 300));
    // the connectors' tunnelled and bridged stretch inside the capital square has a deck: a ray down from 3 m above the road meets it
    let deck = 0, deckHit = 0;
    for (const r of g.highways.N.roads) if (r.kind === 'connector' && r.joinB) for (let i = 0; i < r.pts.length; i++) {
      const [x, z] = r.pts[i]; if (!r.cls[i] || Math.max(Math.abs(x), Math.abs(z)) > 1490) continue;
      deck++; const h = g.phys.world.castRay(new g.phys.R.Ray({ x, y: r.y[i] + 3, z }, { x: 0, y: -1, z: 0 }), 8, true, undefined, 1 << 0); if (h && Math.abs(h.timeOfImpact - 3.25) < 0.6) deckHit++;
    }
    o.deck = deck; o.deckHit = deckHit;
    return o;
  });
  if (o.noRegion) return result('region-drive', true, o, 'no compiled region in this build');
  const pass = !o.noLine && o.auto && o.auto.started && o.auto.alive && o.auto.driven > 2000 && o.auto.minAbove > -0.5 && o.auto.maxAbove < 6 && o.auto.against === 0 && o.startAbove > 0 && o.wallMid < 1480 && o.deck > 20 && o.deckHit === o.deck && o.gateRays.every((t) => !(t >= 0 && t < 300));
  result('region-drive', pass, o);
});
