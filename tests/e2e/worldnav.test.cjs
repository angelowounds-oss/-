// gameplay (ADR-0012, phase 5a): street life in the other cities, the world map, the waypoint and the autopilot. Pedestrians and cars appear on the
// streets of a city the player stands in and go when he leaves; the map draws at all four zoom levels and sets a waypoint (pillar + HUD); a route
// over the highway graph is found between two cities; the autopilot drives the player's car along a highway toward the waypoint and hands it back
// on a brake. MAPSHOTS=1 writes the map at each level to tests/results/.
const fs = require('node:fs');
const { run, freeze, result } = require('../lib.cjs');
run('worldnav', { q: 1, width: 640, height: 360 }, async ({ page }) => {
  await freeze(page);
  const shots = !!process.env.MAPSHOTS;
  const o = await page.evaluate(async (shots) => {
    const g = window.__game, S = g.citysites, L = g.citylife, pl = g.player, o = { shots: {} }; g.hurtPlayer = () => {};
    const realRender = g.eng.render; g.eng.render = () => {};
    const step = (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); };
    o.has = !!L && !!g.wmap && !!g.autonav; if (!o.has) return o;
    // street life: stand in the fourth city
    { const C = S.cities[3], c = C.c; pl.body3.teleport(c.x + 30, 1, c.z + 30); pl.x = c.x + 30; pl.y = 1; pl.z = c.z + 30; step(60);
      const t0 = performance.now(); step(480); o.lifeMs = +((performance.now() - t0) / 480).toFixed(2);
      o.walkers = L.walkers.length; o.cars = L.cars.length; o.carsMoving = L.cars.filter((v) => v.speed > 3).length;
      const w0 = L.walkers.map((h) => [h.x, h.z]); step(180); o.walked = L.walkers.filter((h, i) => Math.hypot(h.x - w0[i][0], h.z - w0[i][1]) > 2).length;
      o.inCity = L.walkers.every((h) => Math.hypot(h.x - c.x, h.z - c.z) < C.L.R * 1.1);
      pl.body3.teleport(0, 1, 0); pl.x = 0; pl.y = 1; pl.z = 0; step(120); o.released = L.walkers.length === 0 && L.cars.length === 0; }
    // the map
    const M = g.wmap; M.toggle(true); o.map = {};
    for (let lv = 0; lv < 4; lv++) { M.level = lv; M.draw(); if (shots) { o.shots['map' + lv] = M.cv.toDataURL('image/png'); } }
    M.level = 1; M.cx = S.cities[0].c.x; M.cz = S.cities[0].c.z; M.draw();
    M.pick(S.cities[2].c.x + 5, S.cities[2].c.z); o.map.wp = g.waypoint && g.waypoint.name; o.map.pillar = M.pillar.visible; M.updateHud(0, true); o.map.hud = M.hud.textContent;
    M.toggle(false); g.setPaused(false); o.map.closed = !g.uiModal;
    // a route between two cities over the highways
    const R = g.autonav.router, a = S.cities[0].c, b = S.cities[1].c, r = R.route(a.x + 60, a.z, b.x, b.z); o.route = { straight: r.straight, km: Math.round(r.length / 1000), pts: r.pts.length, hw: r.pts.filter((p) => p[2] === 1).length };
    // autopilot: a car on a highway, a waypoint 3 km along it
    const N = g.hwtraffic.N, hw = N.roads.find((q) => q.kind === 'highway'), mid = Math.floor(hw.pts.length / 2), f = g.highways.frame(hw, mid), P = g.hwtraffic.lane(hw, mid, 1, 1), tgt = hw.pts[Math.min(hw.pts.length - 1, mid + 100)];
    pl.body3.teleport(P.x, P.y + 1, P.z + 4); pl.x = P.x; pl.y = P.y + 1; pl.z = P.z + 4; pl.vy = 0; step(90);   // the ground under the car first
    const V = g.vehicles[0].constructor, v = new V(g, 'sport', 0x333333, 'parked', {}); v.x = P.x; v.z = P.z; v.h = P.h; v.startY = undefined; v.awake = true; g.addVehicle(v); v.pv.body.setTranslation({ x: P.x, y: P.y + 1.2, z: P.z }, true);
    step(30); g.enterVehicle(v); void f;
    M.setWaypoint(tgt[0], tgt[1], '시험 목적지'); const ok = g.autonav.start(tgt[0], tgt[1]); o.auto = { started: ok, active: g.autonav.active };
    const x0 = v.x, z0 = v.z; let top = 0; for (let k = 0; k < 4200 && g.autonav.active; k++) { step(1); top = Math.max(top, v.speed); }
    o.auto.driven = Math.round(Math.hypot(v.x - x0, v.z - z0)); o.auto.left = Math.round(Math.hypot(tgt[0] - v.x, tgt[1] - v.z)); o.auto.topKmh = Math.round(top * 3.6); o.auto.alive = !v.dead; o.auto.stillActive = g.autonav.active;
    // manual brake hands the car back
    g.autonav.start(tgt[0], tgt[1]); step(60); const real = g.input.read.bind(g.input); g.input.read = (dt) => ({ ...real(dt), brake: 1 }); step(60); g.input.read = real; o.auto.cancelled = !g.autonav.active;
    g.eng.render = realRender; void realRender; return o;
  }, shots);
  if (shots) for (const [k, v] of Object.entries(o.shots || {})) fs.writeFileSync(`tests/results/${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
  delete o.shots;
  const pass = o.has && o.walkers >= 8 && o.cars >= 3 && o.carsMoving >= 2 && o.walked >= 3 && o.inCity && o.released && o.map.wp && o.map.pillar && /km|m/.test(o.map.hud) && o.map.closed && !o.route.straight && o.route.hw > 20 && o.auto.started && o.auto.driven > 1500 && o.auto.alive && o.auto.cancelled;
  result('worldnav', pass, o);
});
