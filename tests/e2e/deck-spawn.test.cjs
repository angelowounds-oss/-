// A vehicle summoned on a bridge stands on its deck, and one summoned under the bridge stands on the ground (GPL-15). The point is a highway
// bridge sample more than 5 m over the ground with a deck collider (a ray down from 3 m above the road meets it); the sandbox's aim point is
// put on the road so the test does not depend on the camera.
const { run, freeze, result } = require('../lib.cjs');
run('deck-spawn', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, L = window.__landfn, S = g.sandbox, o = { tries: 0 }; g.hurtPlayer = () => {};
    g.eng.render = () => {};
    const step = (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); };
    const park = (x, y, z) => { pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
    const deckHit = (x, y, z) => { const h = g.phys.ray(x, y + 3, z, 0, -1, 0, 8, 1); return !!h && Math.abs(h.t - 3.25) < 0.6; };
    // candidates: the highest bridge samples of motorways first, one per 400 m
    const cand = [];
    for (const r of g.highways?.N?.roads || []) for (let i = 2; i < r.pts.length - 2; i += 12) {
      if (r.cls[i] !== 1) continue; const [x, z] = r.pts[i], gap = r.y[i] - L.physHeight(x, z, 8);
      if (gap > 5 && gap < 40) cand.push({ r, i, x, z, y: r.y[i], gap, motor: r.hw === 'motorway' || r.kind === 'highway' });
    }
    cand.sort((a, b) => (b.motor - a.motor) || (b.gap - a.gap));
    let at = null;
    for (const c of cand.filter((c, k) => cand.findIndex((d) => Math.hypot(d.x - c.x, d.z - c.z) < 400) === k).slice(0, 8)) {
      o.tries++; park(c.x, c.y + 1.5, c.z); step(120);
      // the deck colliders stream in around the player; after a jump of tens of kilometres (1:1) they take more frames, so wait for them, re-parking the falling player
      for (let w = 0; w < 5 && !deckHit(c.x, c.y, c.z); w++) { park(c.x, c.y + 1.5, c.z); step(120); }
      if (deckHit(c.x, c.y, c.z) && Math.abs(pl.y - c.y) < 1.5) { at = c; break; }
    }
    if (!at) return { ...o, candidates: cand.length, noDeck: true };
    const r = at.r, j = Math.min(r.pts.length - 1, at.i + 2), h = Math.atan2(r.pts[j][0] - at.x, r.pts[j][1] - at.z);
    // the aim point 10 m along the road
    const px = at.x + Math.sin(h) * 10, pz = at.z + Math.cos(h) * 10, deckY = r.y[Math.min(r.pts.length - 1, at.i + 1)], ground = L.physHeight(px, pz, 8);
    const orig = S.ahead.bind(S); S.ahead = (d) => ({ ...orig(d), x: px, z: pz, yaw: h });
    o.at = { road: r.id || r.kind, deck: +deckY.toFixed(1), ground: +ground.toFixed(1), playerY: +pl.y.toFixed(1) };
    const spawn = (fn) => { const n = g.vehicles.length; fn(); const v = g.vehicles[n]; step(90); const y = v.pv.body.translation().y; g.removeVehicle(v); return { overDeck: +(y - deckY).toFixed(2), overGround: +(y - ground).toFixed(2) }; };
    o.car = spawn(() => S.spawnCar()); o.roadster = spawn(() => S.spawnRoadster()); o.tank = spawn(() => S.spawnWar('tank'));
    // under the bridge: the ground, not the deck
    park(px, ground + 1.2, pz); step(90);
    const floor = pl.y; o.under = { playerY: +floor.toFixed(1), swimming: !!pl.swimming, ...spawn(() => S.spawnCar()) };
    o.under.overFloor = +(o.under.overGround + ground - floor).toFixed(2);   // over the ground the player stands on (the collider, not physHeight)
    S.ahead = orig;
    return o;
  });
  if (o.noDeck) return result('deck-spawn', false, o, 'no highway bridge with a deck collider found');
  const onDeck = (s) => s.overDeck > -0.3 && s.overDeck < 3;
  // under the bridge: off the deck, and on the player's ground unless that is water (the car sinks there)
  const under = o.under.overDeck < -4 && (o.under.swimming || (o.under.overFloor > -0.3 && o.under.overFloor < 3));
  const pass = onDeck(o.car) && onDeck(o.roadster) && onDeck(o.tank) && under;
  result('deck-spawn', pass, o);
});
