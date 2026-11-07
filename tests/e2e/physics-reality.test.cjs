// How close the game's physics is to the real thing, measured on a flat test track 2 km up (static slabs built by the test, away from any
// city collider), with the game's own vehicles and player body. Each value is checked against a real reference with a tolerance:
//  cars (per type): 0-100 km/h, top speed, 100-0 km/h braking distance, the steady cornering grip, the free fall of the body (gravity), the
//  coast-down from 100 km/h, and a 50 km/h crash into a wall (the car is damaged, not destroyed);
//  the player: jump height, walk / run / sprint speeds, the fall speed after 2 s, and the damage of falls from 2, 4, 8 and 16 m.
// References: road tests of comparable cars (a 2.0 L family sedan, a 600 hp sports car, a mid-size SUV, a 5 t box truck), ISO 3888 skid
// pads, crash tests (a 56-64 km/h barrier test is survived), human biomechanics (standing jump 0.4-0.6 m, walk 1.4 m/s, run 3-5 m/s).
const { run, freeze, result } = require('../lib.cjs');
run('physics-reality', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, P = g.phys, R = P.R, o = { cars: {}, player: {} }; g.eng.render = () => {};
    let ticks = 0; const step = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (++ticks % 10 === 0) await new Promise((f) => setTimeout(f, 10)); } };
    // the track: slabs 500 m square, top at Y, from x -3000 to 3000 along z 0 (and a wall at its far end for the crash)
    const X0 = 40000, Z0 = 40000, Y = 2000, slabs = [];
    for (let i = -6; i < 6; i++) for (let j = -1; j < 1; j++) slabs.push(P.world.createCollider(R.ColliderDesc.cuboid(250, 1, 250).setTranslation(X0 + i * 500 + 250, Y - 1, Z0 + j * 500 + 250).setFriction(1).setCollisionGroups(((1 << 16) | 0xffff) >>> 0)));
    const wall = P.world.createCollider(R.ColliderDesc.cuboid(2, 3, 20).setTranslation(X0 + 2900, Y + 3, Z0).setFriction(0.4).setCollisionGroups(((1 << 16) | 0xffff) >>> 0));
    const put = (x, y, z) => { pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
    g.hurtPlayer = () => {};
    // the car's controls each frame come from here (the autopilot's hook in driveControl)
    const C = { t: 0, b: 0, s: 0 }, AN = g.autonav;
    const lab = { active: true, control: (v) => { v.throttle = C.t; v.brake = C.b; v.steer = C.s; v.hand = false; }, cancel() {}, start() { return true; } };
    const V = g.vehicles[0].constructor;
    // the car is stepped on its own (its controls, the physics world, its post-step), as the game's vehicle loop does (game.js), 60 steps a second
    let car = null; const cstep = async (n) => { for (let i = 0; i < n; i++) { car.throttle = C.t; car.brake = C.b; car.steer = C.s; car.hand = false; car.control(1 / 60); car.throttle = C.t; car.brake = C.b; car.steer = C.s; P.step(1 / 60, () => car.applyDrive(), [car.pv]); car.post(1 / 60); if (++ticks % 200 === 0) await new Promise((f) => setTimeout(f, 0)); } };
    const kmh = (v) => v.fwdSpeed * 3.6;
    for (const type of ['sedan', 'sport', 'suv', 'truck']) {
      const c = {}; o.cars[type] = c; let stage = 'spawn';
      const v = new V(g, type, 0x333333, 'parked', {});
      try {
      v.x = X0 - 2900; v.z = Z0; v.h = Math.PI / 2; v.spawnY = Y; v.awake = true; v.fuel = 1e9;
      put(v.x, Y + 1, v.z + 6); g.addVehicle(v); await step(30); const gi = g.vehicles.indexOf(v); if (gi >= 0) g.vehicles.splice(gi, 1); car = v; v.driver = 'lab'; v.kind = 'lab'; await cstep(30);
      c.mass = Math.round(v.pv.mass);
      // 0-100 km/h, then top speed (40 s of full throttle, or the end of the track)
      C.t = 1; C.b = 0; C.s = 0; let t = 0, t100 = null, top = 0;
      while (t < 60 && v.x < X0 + 2000) { await cstep(1); t += 1 / 60; const s = kmh(v); top = Math.max(top, s); if (t100 === null && s >= 100) t100 = t; }
      c.t0to100 = t100 === null ? null : +t100.toFixed(2); c.topKmh = Math.round(top); c.topAt = Math.round(t);
      stage = 'brake';
      // back to the start, 100 km/h, then full brakes
      const reset = async (sp) => { v.vx = sp; v.vz = 0; v.noImpact = 3; v.pv.body.setTranslation({ x: X0 - 2900, y: Y + 0.9, z: Z0 }, true); v.pv.body.setRotation({ x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) }, true); v.pv.body.setAngvel({ x: 0, y: 0, z: 0 }, true); v.pv.body.setLinvel({ x: sp, y: 0, z: 0 }, true); C.t = 0; C.b = 0; C.s = 0; await cstep(1); v.pv.body.setLinvel({ x: sp, y: v.pv.body.linvel().y, z: 0 }, true); };
      await reset(0); await cstep(60); await reset(100 / 3.6); C.t = 0.3; await cstep(30); v.pv.body.setLinvel({ x: 100 / 3.6, y: v.pv.body.linvel().y, z: 0 }, true); await cstep(1);
      const xb = v.x; C.t = 0; C.b = 1; t = 0; while (t < 20 && v.speed > 0.3) { await cstep(1); t += 1 / 60; }
      c.brake100m = +(v.x - xb).toFixed(1); c.brakeS = +t.toFixed(2); C.b = 0;
      stage = 'coast';
      // coast-down: 100 km/h, no input, 5 s
      await reset(100 / 3.6); C.t = 0.3; await cstep(30); v.pv.body.setLinvel({ x: 100 / 3.6, y: v.pv.body.linvel().y, z: 0 }, true); await cstep(1);
      C.t = 0; const s0 = v.speed; await cstep(300); c.coastDecel = +((s0 - v.speed) / 5).toFixed(2);
      stage = 'corner';
      // cornering: 60 km/h held, full steer for 6 s; the lateral acceleration is speed x yaw rate over the last 2 s
      await reset(60 / 3.6); let lat = 0, n = 0, spin = false;
      for (let k = 0; k < 360; k++) { const s = kmh(v); C.t = s < 58 ? 1 : 0; C.b = s > 64 ? 0.4 : 0; C.s = 1; await cstep(1); if (k > 240) { lat += Math.abs(v.speed * v.yaw); n++; } if ((v.up ?? 1) < 0.5) spin = true; }
      c.latG = +(lat / n / 9.81).toFixed(2); c.latKmh = Math.round(kmh(v)); c.rolled = spin; C.s = 0; C.t = 0;
      stage = 'fall';
      // free fall of the car's body from 30 m: the vertical speed after 1 s
      v.vx = v.vz = 0; v.noImpact = 3; v.pv.body.setTranslation({ x: X0 - 2900, y: Y + 40, z: Z0 + 200 }, true); v.pv.body.setLinvel({ x: 0, y: 0, z: 0 }, true); v.pv.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      await cstep(1); const vy0 = v.pv.body.linvel().y; await cstep(60); c.fallAccel = +((vy0 - v.pv.body.linvel().y)).toFixed(2); await cstep(240);
      stage = 'crash';
      // a 50 km/h crash into the wall (2,900 m along): set at 50 km/h 30 m before it, throttle held to keep the speed
      v.pv.body.setTranslation({ x: X0 + 2860, y: Y + 0.9, z: Z0 }, true); v.pv.body.setRotation({ x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) }, true); v.pv.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      v.vx = v.vz = 0; v.noImpact = 3; v.hp = v.maxHp; v.dead = false; await cstep(1); v.pv.body.setLinvel({ x: 50 / 3.6, y: 0, z: 0 }, true); v.vx = 50 / 3.6; v.noImpact = 3; C.t = 0.4;
      const hp0 = v.hp; for (let k = 0; k < 240; k++) { await cstep(1); if (v.x > X0 + 2890 || v.speed < 1) break; } C.t = 0; await cstep(60);
      c.crash50hpLeft = +(v.hp / v.maxHp).toFixed(2); c.crash50dead = v.dead; c.crash50loss = +((hp0 - v.hp) / v.maxHp).toFixed(2);
      } catch (e) { c.err = stage + ': ' + e.message; c.inList = g.vehicles.includes(v); c.dead = v.dead; c.x = Math.round(v.x - X0); c.y = Math.round(v.by - Y); }
      g.scene.remove(v.group); v.detachPhysics(); await step(10);
      console.log('## ' + type + ' ' + JSON.stringify(c));
    }
    // the player on foot
    const pp = o.player, c3 = pl.body3, hurt = []; g.hurtPlayer = (d, a, why) => { hurt.push([d, why]); };
    put(X0, Y, Z0 + 100); await step(60);
    // jump: the highest the feet get over the ground
    const inp = g.input; let top = 0; inp.edges.jump = 1; for (let k = 0; k < 90; k++) { await step(1); top = Math.max(top, pl.y - Y); } pp.jumpM = +top.toFixed(2);
    // speeds: walk (no key held = the base), sprint
    const speedOf = async (sprint) => { put(X0, Y, Z0 + 100); await step(20); const rd = inp.read; let best = 0;
      inp.read = function (dt) { return { ...rd.call(this, dt), mx: 0, my: 1, sprint }; };
      for (let k = 0; k < 120; k++) { await step(1); best = Math.max(best, Math.hypot(pl.vx, pl.vz)); }
      inp.read = rd; return +best.toFixed(2); };
    pp.runMs = await speedOf(false); pp.sprintMs = await speedOf(true);
    // free fall from 200 m: the speed after 2 s
    put(X0 + 600, Y + 200, Z0 + 100); await step(1); const vy0 = pl.vy; await step(120); pp.fall2sMs = +(vy0 - pl.vy).toFixed(2); await step(600);   // from the first frame (a body on the ground has vy -2)
    // falls from 2, 4, 8 and 16 m: the damage taken (100 is the player's full health)
    pp.fallDmg = {};
    for (const h of [2, 4, 8, 16]) { for (let k = 0; k < 900 && (pl.stunT > 0 || pl.ragdoll); k++) await step(1); put(X0 + 300, Y + h, Z0 + 100); hurt.length = 0; await step(240); /* each from a body back on its feet (a ragdoll from the last fall took the next) */ pp.fallDmg[h] = Math.round(hurt.filter((e) => e[1] === 'fall').reduce((a, e) => a + e[0], 0)); }
    pp.hpMax = pl.maxHp ?? pl.hpMax ?? 100;
    for (const s of slabs) P.world.removeCollider(s, false); P.world.removeCollider(wall, false);
    return o;
  });
  // real references: [low, high] per value
  const REF = {
    sedan: { t0to100: [7, 11], topKmh: [180, 230], brake100m: [34, 42], latG: [0.75, 0.95], coastDecel: [0.3, 0.8] },
    sport: { t0to100: [2.8, 4.5], topKmh: [290, 340], brake100m: [30, 36], latG: [0.95, 1.3], coastDecel: [0.4, 1.0] },
    suv: { t0to100: [7.5, 11], topKmh: [180, 220], brake100m: [36, 44], latG: [0.7, 0.9], coastDecel: [0.4, 0.9] },
    truck: { t0to100: [18, 40], topKmh: [95, 125], brake100m: [45, 70], latG: [0.45, 0.75], coastDecel: [0.4, 1.0] },
  };
  const bad = [];
  for (const [type, ref] of Object.entries(REF)) {
    const c = o.cars[type]; if (!c) { bad.push(type + ': not measured'); continue; }
    for (const [k, [lo, hi]] of Object.entries(ref)) if (!(c[k] >= lo && c[k] <= hi)) bad.push(`${type}.${k} ${c[k]} (real ${lo}-${hi})`);
    if (!(Math.abs(c.fallAccel - 9.81) < 0.5)) bad.push(`${type}.fallAccel ${c.fallAccel} (real 9.81)`);
    if (c.crash50dead || !(c.crash50loss > 0.15 && c.crash50loss < 0.7)) bad.push(`${type}.crash50 dead ${c.crash50dead} loss ${c.crash50loss} (real: damaged, not destroyed)`);
    if (c.rolled) bad.push(`${type} rolled on the skid pad`);
  }
  const p = o.player;
  if (!(p.jumpM >= 0.35 && p.jumpM <= 0.7)) bad.push(`player.jumpM ${p.jumpM} (real 0.4-0.6)`);
  if (!(p.fall2sMs >= 18 && p.fall2sMs <= 19.7)) bad.push(`player.fall2sMs ${p.fall2sMs} (real 19.1 with drag)`);
  if (!(p.sprintMs >= 6 && p.sprintMs <= 9.5)) bad.push(`player.sprintMs ${p.sprintMs} (real 6-9)`);
  if (p.fallDmg[2] !== 0 || !(p.fallDmg[16] >= 60)) bad.push(`player.fallDmg ${JSON.stringify(p.fallDmg)} (real: 2 m harmless, 16 m most often fatal)`);
  o.bad = bad;
  result('physics-reality', bad.length === 0, o);
});
