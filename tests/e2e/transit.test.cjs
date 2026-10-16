// gameplay (ADR-0012 phase 5b): fast travel and the aircraft of the world. Stations in every city (the capital's subway entrances included), rail
// lines beside the highways with ambient trains, a kiosk that offers the right rides, and the four rides themselves (metro, rail, air, taxi):
// the player ends at the destination, alive, with the ground back under him, and no frame of a ride is a long one. Airliners fly their timetable.
// RIDESHOTS=1 writes a frame from each ride to tests/results/.
const fs = require('node:fs');
const { run, freeze, result } = require('../lib.cjs');
run('transit', { q: 1, width: 640, height: 360 }, async ({ page }) => {
  await freeze(page);
  const shots = !!process.env.RIDESHOTS;
  const o = await page.evaluate(async (shots) => {
    const g = window.__game, T = g.transit, pl = g.player, o = { shots: {}, rides: {} }; g.hurtPlayer = () => {};
    const realRender = g.eng.render; g.eng.render = () => {};
    const snap = () => { g.eng.render = realRender; g.renderFrame(0, true); const u = g.eng.renderer.domElement.toDataURL('image/png'); g.eng.render = () => {}; return u; };
    const step = (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); };
    o.has = !!T && !!g.aviation; if (!o.has) return o;
    o.stations = T.stations.length; o.kinds = [0, 1, 2].map((k) => T.stations.filter((s) => s.kind === k).length); o.lines = T.lines.length; o.lineKm = Math.round(T.lines.reduce((s, l) => s + l.len, 0) / 1000);
    o.railTris = Math.round(T.railGroup.children.reduce((s, m) => s + m.geometry.index.count / 3, 0));
    const city = (id) => T.stations.find((s) => s.city === id && s.kind === 1), air = T.stations.find((s) => s.kind === 2);
    const park = (x, z) => { pl.body3.teleport(x, 1, z); pl.x = x; pl.y = 1; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
    // ambient trains: stand near a line, find a moving train
    { const L = T.lines[0], m = L.pts[Math.floor(L.pts.length / 2)]; park(m[0] + 40, m[2]); step(30); let vis = 0; for (let k = 0; k < 40 && !vis; k++) { g.time = k * 9; T.trainsUpdate(g.time); const A = T.carMesh.instanceMatrix.array; for (let i = 0; i < T.rideBase; i++) if (A[i * 16] !== 0) vis++; } o.trainsVisible = vis; }
    // the kiosk offers rides: open at the capital's rail station
    { const s = city('neon'); park(s.x, s.z + 2); step(30); const near = g.interact.query(pl); o.kioskNear = !!near; { const b = g.world.colliders.near(s.x, s.z, 6).filter((q) => q.y0 >= 4.3 && q.h > 4.6).length, walk = g.world.colliders.resolve(s.x, s.z, 0.4, 0); o.hall = { roof: b, free: !walk.hit }; } T.open(s); o.ui = T.box.querySelectorAll('.tr-row').length; T.close(); g.setPaused(false); }
    const runRide = (name, plan, cash, started) => {
      const to = plan.to; if (!started) { g.cash = cash; T.start(plan); } let n = 0, worst = 0, minY = 1e9, seenMesh = false;
      while (T.riding && n < 5200) { const a = performance.now(); window.__upd(1 / 60); const d = performance.now() - a; if (n > 5 && d > worst) worst = d; n++; if (T.ride?.pose) minY = Math.min(minY, T.ride.pose.y); if (T.ride?.mesh?.visible) seenMesh = true; if (shots && n === 600) o.shots[name] = snap(); if (!T.ride && !T.riding) break; }
      step(90); const dd = Math.hypot(pl.x - to.x, pl.z - to.z);
      o.rides[name] = { frames: n, worstMs: +worst.toFixed(0), arrived: dd < 12, dd: Math.round(dd), y: +pl.y.toFixed(1), alive: !pl.dead, done: !T.riding, ground: !!g.farland.ground.col || Math.abs(pl.x) < 1500, len: Math.round(plan.len), seenMesh };
    };
    // metro within the capital
    { const a = T.stations.find((s) => s.city === 'neon' && s.kind === 0), b = T.stations.filter((s) => s.city === 'neon' && s.kind === 0)[2]; park(a.x, a.z + 3); step(10); runRide('metro', T.planMetro(a, b), 100); }
    // rail from the capital to the harbour (a highway line joins them or goes via the airport city)
    { const a = city('neon'), b = city('harbor'), plan = T.planRail(a, b); o.railPlan = !!plan; if (plan) { park(a.x, a.z + 3); step(10); g.cash = 500; T.open(a); const row = [...T.box.querySelectorAll('.tr-row')].find((r) => r.textContent.includes('HARBOR')); const btn = row && row.querySelector('button'); o.railUi = !!btn; if (btn) btn.click(); g.setPaused(false); o.cashAfterBuy = Math.round(g.cash); o.rideStarted = T.riding; runRide('rail', plan, 0, true); o.rides.rail.cashLeft = Math.round(g.cash); } }
    // an airliner flight from Skyport to the capital
    { const plan = T.planAir(air, city('neon')); park(air.x, air.z + 3); step(60); runRide('air', plan, 500); }
    // a taxi to a waypoint 5 km away along the road
    { const s = city('mid3'); park(s.x, s.z + 3); step(60); const hw = T.lines[1], m = hw.pts[Math.floor(hw.pts.length / 2)]; g.waypoint = { x: m[0] + 60, z: m[2], name: '시험 목적지' }; const plan = T.planTaxi(g.waypoint); runRide('taxi', plan, 5000); o.rides.taxi.km = Math.round(plan.len / 1000); }
    // the timetable flies: look at a time when an airliner is up
    { const A = g.aviation; let vis = 0; for (let k = 0; k < 120 && !vis; k++) { g.time = 200 + k * 7; g.camera.position.set(A.flights[0].P[0][0] + 20000, 100, A.flights[0].P[0][2]); A.update(0.016); vis = A.flights.filter((f) => f.mesh.visible).length; } o.airliners = vis; }
    g.eng.render = realRender; return o;
  }, shots);
  if (shots) for (const [k, v] of Object.entries(o.shots || {})) fs.writeFileSync(`tests/results/ride-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
  delete o.shots;
  const R = o.rides || {}, ok = (r) => r && r.arrived && r.alive && r.done && r.worstMs < 450;
  const pass = o.has && o.stations >= 25 && o.kinds[1] >= 7 && o.kinds[2] === 1 && o.lines >= 6 && o.trainsVisible > 0 && o.kioskNear && o.hall.roof >= 1 && o.hall.free && o.ui >= 4 && ok(R.metro) && ok(R.rail) && ok(R.air) && ok(R.taxi) && R.rail.seenMesh !== undefined && o.airliners >= 1 && o.railUi && o.cashAfterBuy < 500 && o.rideStarted;
  result('transit', pass, o);
});
