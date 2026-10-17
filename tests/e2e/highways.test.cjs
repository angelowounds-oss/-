// gameplay (ADR-0012, phase 2): the highway network. Meshes exist and stay under the triangle budget; a car put on a highway drives along it
// (stays on the carved ground, does not fall through a bridge or a tunnel); AI traffic spawns on the lanes near the player and keeps moving;
// toll and service attendants appear; the interchange ramps, tolls and services exist in the data the world was built from.
const { run, freeze, result } = require('../lib.cjs');
run('highways', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, H = g.highways, T = g.hwtraffic, pl = g.player, o = {}; g.eng.render = () => {}; g.hurtPlayer = () => {};
    const step = (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); };
    o.has = !!H && !!T; if (!o.has) return o;
    o.chunks = H.stats.chunks; o.tris = H.stats.tris; const N = H.N; o.roads = N.roads.length; o.ramps = N.roads.filter((r) => r.kind === 'ramp').length; o.tolls = N.tolls.length; o.services = N.services.length;
    // a long straight stretch of the first highway, away from the city
    const hw = N.roads.find((r) => r.kind === 'highway'), mid = Math.floor(hw.pts.length / 2), f = H.frame(hw, mid), L = T.lane(hw, mid, 1, 1);
    pl.body3.teleport(L.x, L.y + 1, L.z + 6); pl.x = L.x; pl.z = L.z + 6; pl.y = L.y + 1; pl.vy = 0; step(120);
    o.groundTile = !!g.farland.ground.col;
    // traffic
    for (let i = 0; i < 12; i++) step(40); o.cars = T.cars.length; o.carsMoving = T.cars.filter((v) => v.speed > 8).length;
    // a car driven by the player along the highway
    const { Vehicle, CAR_COLORS } = { Vehicle: g.vehicles[0].constructor, CAR_COLORS: [0x111111] };
    const v = new Vehicle(g, 'sport', 0x333333, 'parked', {}); v.x = L.x; v.z = L.z; v.h = L.h; v.startY = undefined; v.awake = true; g.addVehicle(v); v.pv.body.setTranslation({ x: L.x, y: L.y + 1.2, z: L.z }, true);
    pl.body3.teleport(L.x, L.y + 1, L.z + 4); pl.x = L.x; pl.z = L.z + 4; step(10); g.enterVehicle(v);
    const real = g.input.read.bind(g.input); g.input.read = (dt) => ({ ...real(dt), gas: 1, my: 1 });
    // follow the road: steer toward the lane point 40 m ahead
    let i = mid, off = 0, maxDy = 0, travelled = 0; const x0 = v.x, z0 = v.z;
    for (let k = 0; k < 600; k++) {
      while (i < hw.pts.length - 3 && Math.hypot(hw.pts[i][0] - v.x, hw.pts[i][1] - v.z) < 40) i++;
      const P = T.lane(hw, i, 1, 1), want = Math.atan2(P.x - v.x, P.z - v.z), dh = Math.atan2(Math.sin(want - v.h), Math.cos(want - v.h));
      g.input.read = (dt) => ({ ...real(dt), gas: 1, my: 1, mx: Math.max(-1, Math.min(1, -dh * 3)), steer: Math.max(-1, Math.min(1, -dh * 3)) });
      step(1); const gy = hw.y[Math.min(hw.pts.length - 1, i)]; maxDy = Math.max(maxDy, Math.abs(v.by - gy - 0.8));
    }
    travelled = Math.hypot(v.x - x0, v.z - z0); o.driven = Math.round(travelled); o.maxDy = +maxDy.toFixed(1); o.speed = Math.round(v.speed * 3.6); o.alive = !v.dead;
    g.exitVehicle(true);
    // attendants at the nearest toll plaza and an event somewhere
    const t = N.tolls[0], r = N.roads.find((q) => q.id === t.road), tp = r.pts[Math.max(0, Math.min(r.pts.length - 1, t.idx))];
    pl.body3.teleport(tp[0], r.y[t.idx] + 1, tp[1] + 8); pl.x = tp[0]; pl.z = tp[1] + 8; pl.y = r.y[t.idx] + 1; step(240); o.tollNpcs = [...T.npcs.keys()].filter((k) => k.startsWith('toll')).length;
    const sv = N.services[0]; pl.body3.teleport(sv.x, sv.y + 1, sv.z + 20); pl.x = sv.x; pl.z = sv.z + 20; pl.y = sv.y + 1; step(240); o.serviceNpcs = [...T.npcs.keys()].filter((k) => k.startsWith('svc')).length; { const w0 = [...T.npcs.entries()].filter(([k]) => k.startsWith('trav')).map(([, h]) => [h.x, h.z]); step(300); const w1 = [...T.npcs.entries()].filter(([k]) => k.startsWith('trav')).map(([, h]) => [h.x, h.z]); o.travellers = w1.length; o.travellersMoved = w1.filter((p, i) => w0[i] && Math.hypot(p[0] - w0[i][0], p[1] - w0[i][1]) > 1).length; }
    o.events = T.events.size;
    return o;
  });
  const pass = o.has && o.chunks > 50 && o.tris < 480000 && o.ramps >= 18 && o.tolls >= 10 && o.services >= 4 && o.groundTile && o.cars >= 3 && o.carsMoving >= 2 && o.driven > 250 && o.maxDy < 3.5 && o.alive && o.tollNpcs >= 1 && o.serviceNpcs >= 1 && o.travellers >= 3 && o.travellersMoved >= 1;
  result('highways', pass, o);
});
