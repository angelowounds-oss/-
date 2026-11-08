// gameplay away from the capital, where the 1:1 ground is not at 0 (a region road 4+ km out whose ground is 30-400 m up). Much of the game assumed
// y = 0: shots passed over cars, guards saw and shot through walls (their sight line ran under the ground), a driver stood at 0, tanks never came
// (grid only) and the ones that did ran underground, shells flew at 70 m/s without gravity, scorch marks and wrecks lay at 0, and there was no police
// car, no mission place and no GPS route off the capital's grid. Each of those is checked here at elevation.
const { run, freeze, result } = require('../lib.cjs');
run('elevation-play', { q: 1 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, RG = window.__region, pl = g.player, M = g.military, o = {}; g.eng.render = () => {};
    let hurt = 0; g.hurtPlayer = () => { hurt++; };
    const step = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 2) await new Promise((f) => setTimeout(f, 4)); } };
    const put = (x, y, z) => { pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
    // the place: seeded, the same every run
    const roads = RG.regionRoads().filter((r) => r.x.length > 60); let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let P = null;
    for (let k = 0; k < 8000 && !P; k++) { const r = roads[Math.floor(rnd() * roads.length)], i = 5 + Math.floor(rnd() * (r.x.length - 20)); if (RG.regionWeight(r.x[i], r.z[i]) < 1 || r.cls[i] === 2 || Math.hypot(r.x[i], r.z[i]) < 4000 || r.y[i] < 30 || r.y[i] > 400) continue; P = { x: r.x[i], y: r.y[i], z: r.z[i] }; }
    if (!P) return o;
    o.place = { x: Math.round(P.x), y: +P.y.toFixed(1), z: Math.round(P.z) }; o.track = [];   // where the player is after each part (a fall through the ground shows here)
    put(P.x, P.y + 0.5, P.z); g.highways?.ensureNear?.(P.x, P.z); await step(120);
    const gnd = (x, z, y = pl.y) => g.groundY(x, z, y + 1);
    o.feet = +(pl.y - gnd(pl.x, pl.z)).toFixed(2);
    const V = g.vehicles[0].constructor;
    const car = (dx) => { const v = new V(g, 'sedan', 0x333333, 'parked', {}); v.x = pl.x + dx; v.z = pl.z; v.h = 0; v.awake = true; v.fuel = 1e9; g.addVehicle(v); return v; };

    // a parked car 12 m east: a level shot at its door hits the car (it passed over: the car's box was taken at 0..1.5 m)
    const c = car(12); await step(40);
    o.carBase = +(c.baseY() - gnd(c.x, c.z)).toFixed(2);
    { const ey = pl.y + 1.6, ty = c.baseY() + 0.9, d = Math.hypot(c.x - pl.x, ty - ey), r = g.hitscan(pl.x, ey, pl.z, (c.x - pl.x) / d, (ty - ey) / d, 0, 60, null, 0); o.shotCar = r.kind; }
    // the driver stands where the car is (pl.y was 0 in a car)
    g.enterVehicle(c); await step(10); o.driverY = +(pl.y - c.baseY()).toFixed(2); g.exitVehicle(true); await step(10); g.removeVehicle(c); o.track.push(['car', Math.round(Math.hypot(pl.x - P.x, pl.z - P.z)), +(pl.y - P.y).toFixed(1), g.errors.length]);

    // a wall between a guard and the player: no shot gets through (the guard's sight line was at an absolute height: under the ground up here)
    put(P.x, P.y + 0.5, P.z); await step(20);
    const y0 = gnd(pl.x + 8, pl.z) - 2, wall = g.world.colliders.addBox(pl.x + 7.5, pl.z - 60, pl.x + 8.5, pl.z + 60, y0 + 9, 'building', y0);
    const Hm = pl.constructor;   // the player is a Human too
    const guard = new Hm(g, 'gang', { hp: 1e6, weapon: 2, look: { top: 0x3a0c18, pants: 0x151015, trim: [1, 0.2, 0.25], hair: 0x111111 } });
    guard.x = pl.x + 18; guard.z = pl.z; guard.y = guard.floorY = gnd(guard.x, guard.z); guard.ground = true; guard.static = true; guard.state = 'attack'; guard.detect = 60; g.humans.push(guard); g.scene.add(guard.group);
    await step(2);   // a collider added now joins Rapier's ray queries at the next physics step
    o.losWall = g.hasLOS(guard.x, guard.y + 1.5, guard.z, pl.x, pl.y + 1.3, pl.z);
    // the guard's shots always hit what they can hit (Math.random fixed low inside the shot): only cover decides, so the open case is not left to a
    // ~32 % roll, and the wall case is the stronger for it
    hurt = 0; let shots = 0; const es = g.enemyShoot.bind(g); g.enemyShoot = (h, t) => { if (h === guard) shots++; const r = Math.random; Math.random = () => 0.01; try { return es(h, t); } finally { Math.random = r; } };
    for (let k = 0; k < 6; k++) { guard.x = pl.x + 18; guard.z = pl.z; await step(30); }
    o.throughWall = { shots, hurt };
    g.world.colliders.removeBox(wall);
    hurt = 0; shots = 0; for (let k = 0; k < 10 && !hurt; k++) { guard.x = pl.x + 18; guard.z = pl.z; await step(30); }
    o.inTheOpen = { shots, hurt, los: g.hasLOS(guard.x, guard.y + 1.5, guard.z, pl.x, pl.y + 1.3, pl.z) };
    g.enemyShoot = es; guard.remove = true; await step(5); o.track.push(['guard', Math.round(Math.hypot(pl.x - P.x, pl.z - P.z)), +(pl.y - P.y).toFixed(1), g.errors.length]);

    // a walker on a slope walks slower uphill (Tobler's hiking function; it kept the flat pace): find the steepest way up within 300 m, walk it
    { let best = null; for (let k = 0; k < 400; k++) { const a = rnd() * 6.283, d = rnd() * 300, x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d, y = gnd(x, z, P.y + 200);
        for (let j = 0; j < 8; j++) { const b = j * 0.785, y2 = gnd(x + Math.cos(b) * 20, z + Math.sin(b) * 20, y + 30), s = (y2 - y) / 20; if (s > 0.12 && s < 0.4 && (!best || s > best.s)) best = { x, z, y, b, s }; } }
      o.slopeWalk = null;
      if (best) {
        const walk = async (dir) => { const w = new Hm(g, 'gang', { hp: 1e6, weapon: undefined, look: { top: 0x333333, pants: 0x222222, trim: [1, 1, 1], hair: 0x111111 } });
          w.x = best.x; w.z = best.z; w.y = w.floorY = best.y; w.ground = true; w.updateCombat = function () { this.cmdX = Math.cos(best.b) * dir; this.cmdZ = Math.sin(best.b) * dir; this.cmdSpeed = 1.4; this.faceAngle = 0; };
          g.humans.push(w); g.scene.add(w.group); await step(20); const x0 = w.x, z0 = w.z, y0 = w.y; await step(240); const r = { v: +(Math.hypot(w.x - x0, w.z - z0) / 4).toFixed(2), grade: +((w.y - y0) / Math.max(0.01, Math.hypot(w.x - x0, w.z - z0))).toFixed(2) }; w.remove = true; await step(3); return r; };
        o.slopeWalk = { slope: +best.s.toFixed(2), up: await walk(1), down: await walk(-1) }; o.track.push(['slope', Math.round(Math.hypot(pl.x - P.x, pl.z - P.z)), +(pl.y - P.y).toFixed(1), g.errors.length]);
      }
    }

    // a tank shell: 1,100 m/s and falling at g (it flew at 70 m/s in a straight line); it bursts at the ground where it lands
    { const n0 = M.shells.length; M.launch(pl.x + 400, pl.y + 3, pl.z + 400, pl, 'shell', 7, 0); const s = M.shells[M.shells.length - 1]; const v0 = s.v.length(), vy0 = s.v.y; window.__upd(1 / 60); o.shell = { v0: Math.round(v0), dvy: +((s.v.y - vy0) * 60).toFixed(2), added: M.shells.length - n0 }; for (const q of M.shells) { q.life = 0; } window.__upd(1 / 60); } o.track.push(['shell', Math.round(Math.hypot(pl.x - P.x, pl.z - P.z)), +(pl.y - P.y).toFixed(1), g.errors.length]);
    // a blast at the ground leaves its scorch mark on the ground (it was drawn at 0)
    { const x = pl.x + 25, z = pl.z + 5, y = gnd(x, z); g.explosion(x, y + 0.3, z, 4, 0, null); await step(2); const s = g.memory.st.scorch[g.memory.st.scorch.length - 1]; o.scorchAbove = s ? +(s[3] - y).toFixed(2) : null; } o.track.push(['scorch', Math.round(Math.hypot(pl.x - P.x, pl.z - P.z)), +(pl.y - P.y).toFixed(1), g.errors.length]);

    // wanted 3: police cars come on the real roads; their officers stand on the ground
    // the player resists (no arrest): standing unarmed beside an officer for 3 s is a BUSTED, which ends the chase at the capital's station
    const law = g.society.updateLaw; g.society.updateLaw = () => {};
    g.sandbox.on = false; g.wanted = 3; g.heat = 60; await step(900);
    const cops = g.vehicles.filter((v) => v.police && !v.dead && v.driver === 'ai');   // not the parked cars of a road-side checkpoint
    o.police = { cars: cops.length, nearest: cops.length ? Math.round(Math.min(...cops.map((v) => Math.hypot(v.x - pl.x, v.z - pl.z)))) : null, carAGL: cops.map((v) => +(v.baseY() - gnd(v.x, v.z, v.baseY())).toFixed(1)) };
    const officers = g.humans.filter((h) => h.team === 'cop' && !h.dead && Math.hypot(h.x - pl.x, h.z - pl.z) < 150);
    o.police.officerAGL = officers.map((h) => +((h.y || 0) - gnd(h.x, h.z, h.y)).toFixed(1));
    o.police.all = g.vehicles.filter((v) => v.police).map((v) => [v.driver, !!v.dead, Math.round(Math.hypot(v.x - pl.x, v.z - pl.z))]); o.police.wanted = g.wanted; o.police.pl = [Math.round(pl.x - P.x), Math.round(pl.z - P.z), +(pl.y - P.y).toFixed(1)];
    // wanted 5: a tank comes off the grid and drives on the ground (it ran at y = 0)
    g.wanted = 5; g.heat = 200; M.tankT = 0; await step(600);
    const ts = M.tank.filter((e) => !e.dead);
    o.tanks = ts.map((e) => ({ d: Math.round(Math.hypot(e.x - pl.x, e.z - pl.z)), agl: +(e.y - gnd(e.x, e.z, e.y)).toFixed(1) }));
    g.society.updateLaw = law; g.clearWanted(); for (const v of [...g.vehicles]) if (v.police) g.removeVehicle(v); for (const h of g.humans) if (h.team === 'cop') h.remove = true; await step(20);

    // a mission place near the player (it fell back to a corner of the capital) and a GPS route over the real roads
    { const s = g.pickSpot(120, 300); o.missionSpot = { d: Math.round(Math.hypot(s.x - pl.x, s.z - pl.z)), road: !!s.road, agl: s.y != null ? +(s.y - gnd(s.x, s.z, s.y)).toFixed(1) : null }; }
    { g.setWaypoint(pl.x + 3000, pl.z + 2000); const p = g.gpsPath; o.gps = { pts: p ? (p.pts || p).length : 0, world: !!(p && p.world) }; g.hideBeacon?.(); g.gpsPath = null; }
    return o;
  });
  const T = o.tanks || [], PO = o.police || {};
  const pass = !!o.place && Math.abs(o.feet) < 0.4 && Math.abs(o.carBase) < 0.6 && o.shotCar === 'vehicle' && Math.abs(o.driverY) < 0.3
    && o.losWall === false && o.throughWall.hurt === 0 && o.inTheOpen.los === true && o.inTheOpen.hurt > 0
    && o.shell.v0 > 1050 && o.shell.v0 < 1150 && Math.abs(o.shell.dvy + 9.81) < 0.2 && o.scorchAbove != null && Math.abs(o.scorchAbove) < 0.5
    && PO.cars > 0 && PO.nearest < 400 && PO.carAGL.every((a) => Math.abs(a) < 1.5) && PO.officerAGL.every((a) => Math.abs(a) < 1)
    && T.length > 0 && T.every((t) => Math.abs(t.agl) < 1.5)
    && o.missionSpot.d < 500 && o.missionSpot.road && Math.abs(o.missionSpot.agl) < 1
    && o.gps.pts > 10 && o.gps.world
    && (!o.slopeWalk || (o.slopeWalk.up.grade > 0.08 && o.slopeWalk.up.v < 1.4 * Math.max(0.3, Math.exp(-3.5 * (Math.abs(o.slopeWalk.up.grade + 0.05) - 0.05))) * 1.25 && o.slopeWalk.down.v > o.slopeWalk.up.v));
  result('elevation-play', pass, o);
});
