// Plays the compiled region at random places, as a tester would: (a) a walker is put down on the drawn ground at 60 places (outside buildings)
// and walks 6 s in a straight line; it must stay on or over the ground (not under it), not be stuck inside something; (b) the autopilot drives a
// car 300 m along 12 random roads (motorway to residential); it must not die, fall under the ground, stop for good or leave the road by more
// than 12 m. Every bad place is logged with what happened, for the backlog.
// One page.evaluate per place (a single 20-minute evaluate lost every result when the renderer died), each logging the JS heap so growth shows.
const { run, freeze, result } = require('../lib.cjs');
// WALKS / DRIVES override the counts (a full run takes over an hour on the software GPU; e.g. WALKS=0 probes only the roads)
const WALKS = +(process.env.WALKS ?? 60), DRIVES = +(process.env.DRIVES ?? 12);
run('world-probe', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const setup = await page.evaluate(() => {
    const g = window.__game, RG = window.__region; g.eng.render = () => {}; g.hurtPlayer = () => {};
    if (!RG || !RG.regionRoads().length) return { noRegion: true };
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const P = (window.__probe = { rnd, ticks: 0 });
    // a turn of the event loop every other update: the workers' streamed tiles are delivered as tasks, and with the page busy for 10 updates at a
    // time (seconds on the software GPU) their messages queued up in the renderer by the gigabyte until it was killed
    P.step = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (++P.ticks % 2 === 0) await new Promise((f) => setTimeout(f, 4)); } };
    P.put = (x, y, z) => { const pl = g.player; pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
    P.heap = () => Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576);
    return {};
  });
  if (setup.noRegion) return result('world-probe', true, setup, 'no compiled region in this build');
  const o = { walk: [], drive: [] };
  // (a) walkers
  for (let tries = 0; o.walk.length < WALKS && tries < WALKS * 7; tries++) {
    const w = await page.evaluate(async () => {
      const g = window.__game, pl = g.player, RG = window.__region, L = window.__landfn, P = window.__probe, inp = g.input, rd = inp.read;
      const x = -9000 + P.rnd() * 18000, z = -9000 + P.rnd() * 16000; if (RG.regionWeight(x, z) < 1) return null;
      const land = L.landHeight(x, z, 8); if (window.__waterfn?.waterAt?.(x, z)) return null;
      // outside buildings: nothing static over the spot within 40 m (asked after 60 updates: a building's collider streams in some 35 updates
      // after a jump, and a walker checked at 20 was put inside one)
      P.put(x, land + 1.5, z); g.highways.ensureNear(x, z); await P.step(60);
      if (g.phys.rayT(x, land + 0.6, z, 0, 1, 0, 40, 1) >= 0) return null;
      const a = P.rnd() * Math.PI * 2, w = { at: [Math.round(x), Math.round(z)] }; P.put(x, land + 0.3, z); await P.step(30);
      g.cam.yaw = a; inp.read = function (dt) { return { ...rd.call(this, dt), mx: 0, my: 1, sprint: false }; };
      let under = 0, moved = 0, px = pl.x, pz = pl.z, minUnder = 9;
      try {
        for (let k = 0; k < 360; k++) { await P.step(1); const gy = L.landHeight(pl.x, pl.z, 8), fy = L.physHeight(pl.x, pl.z, 8); const u = pl.y - Math.min(gy, fy); minUnder = Math.min(minUnder, u); if (u < -2.5) under++; moved += Math.hypot(pl.x - px, pl.z - pz); px = pl.x; pz = pl.z; }
        // a walker that met a wall at once turns round for 2 s: only one that cannot go back either is stuck
        if (moved < 3) { g.cam.yaw = a + Math.PI; let back = 0; for (let k = 0; k < 120; k++) { await P.step(1); back += Math.hypot(pl.x - px, pl.z - pz); px = pl.x; pz = pl.z; } w.wall = true; w.back = Math.round(back); if (back >= 3) moved = back; }
      } finally { inp.read = rd; }
      w.moved = Math.round(moved); w.minAbove = +minUnder.toFixed(2); w.under = under; w.end = [Math.round(pl.x), Math.round(pl.y), Math.round(pl.z)]; w.heap = P.heap();
      w.bad = under > 30 ? 'under the ground' : moved < 3 ? 'stuck' : null;
      return w;
    });
    if (w) { o.walk.push(w); console.log('walk ' + JSON.stringify(w)); }
  }
  // (b) drives
  const n = await page.evaluate((D) => {
    const RG = window.__region, P = window.__probe, roads = RG.regionRoads().filter((r) => r.x.length > 60), picked = [];
    for (let k = 0; picked.length < D && k < 4000; k++) { const r = roads[Math.floor(P.rnd() * roads.length)]; const i = 2 + Math.floor(P.rnd() * (r.x.length - 45)); if (RG.regionWeight(r.x[i], r.z[i]) < 1 || r.cls[i] === 2) continue; if (picked.some((p) => Math.hypot(p.r.x[p.i] - r.x[i], p.r.z[p.i] - r.z[i]) < 1500)) continue; picked.push({ r, i }); }
    P.picked = picked; return picked.map((p) => [p.r.id, Math.round(p.r.x[p.i]), Math.round(p.r.z[p.i])]);
  }, DRIVES);
  // the places are printed first, so a run the renderer dies in still says where it was
  console.log('places ' + JSON.stringify(n));
  for (let q = 0; q < n.length; q++) {
    const d = await page.evaluate(async (q) => {
      const g = window.__game, P = window.__probe, { r, i } = P.picked[q], V = g.vehicles[0].constructor;
      const x0 = r.x[i], z0 = r.z[i], e = Math.min(r.x.length - 1, i + 38), d = { road: r.id, hw: r.hw, name: r.name || '', at: [Math.round(x0), Math.round(z0)] };
      P.put(x0, r.y[i] + 2, z0); g.highways.ensureNear(x0, z0); await P.step(30);
      const v = new V(g, 'sedan', 0x333333, 'parked', {}); v.x = x0; v.z = z0; v.h = Math.atan2(r.x[i + 1] - x0, r.z[i + 1] - z0); v.spawnY = r.y[i]; v.awake = true; v.fuel = 1e9; g.addVehicle(v); await P.step(30);
      g.enterVehicle(v); d.started = g.autonav.start(r.x[e], r.z[e]);
      let off = 0, under = 0, still = 0, j = i;
      for (let k = 0; k < 2400 && g.autonav.active && !v.dead; k++) {
        await P.step(1); let bd = 1e9; for (let s = Math.max(0, j - 10); s < Math.min(r.x.length, j + 20); s++) { const dd = Math.hypot(r.x[s] - v.x, r.z[s] - v.z); if (dd < bd) { bd = dd; j = s; } }
        off = Math.max(off, bd); const t = v.pv.body.translation(); if (t.y < r.y[j] - 3) under++; still = v.speed < 0.5 ? still + 1 : 0; if (still > 600) break;
      }
      d.left = Math.round(Math.hypot(r.x[e] - v.x, r.z[e] - v.z)); d.off = Math.round(off); d.under = under; d.dead = v.dead; d.stuck = still > 600; d.hp = +(v.hp / v.maxHp).toFixed(2); d.heap = P.heap();
      d.bad = v.dead ? 'destroyed' : under > 30 ? 'under the road' : d.stuck ? 'stuck' : off > 12 ? 'left the road' : d.left > 40 ? 'did not arrive' : null;
      g.autonav.cancel && g.autonav.cancel(); g.exitVehicle(true); await P.step(10); g.removeVehicle(v);
      return d;
    }, q);
    o.drive.push(d); console.log('drive ' + JSON.stringify(d));
  }
  o.badWalk = o.walk.filter((w) => w.bad); o.badDrive = o.drive.filter((d) => d.bad);
  result('world-probe', o.walk.length >= WALKS * 0.66 && o.drive.length >= DRIVES * 0.66 && !o.badWalk.length && !o.badDrive.length, { walks: o.walk.length, drives: o.drive.length, badWalk: o.badWalk, badDrive: o.badDrive, drive: o.drive });
});
