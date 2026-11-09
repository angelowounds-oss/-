// Physics that physics-reality does not measure, each against a real reference (2026-11-09 round):
//  fuel: a tank takes a sedan about 650 km;
//  a train car kills what stands on its rails and spares what is 5 m beside them;
//  a car at a quarter of its strength is slower;
//  falls: a car dropped from 2 / 10 / 20 / 40 m (a hop is nothing, a 10 m fall costs a fifth of the car, 40 m wrecks it);
//  occupant injury of a crash (belted: ~10 of 100 at 50 km/h, a third at 80, over half at 100 km/h);
//  a wet road: the 100-0 km/h braking distance grows by half in rain (wet asphalt gives 0.65-0.7 of the dry friction);
//  water: a car dropped into the capital's lake floats at a 0.3-0.5 m draft for ~20 s and then sinks, its engine floods;
//  a pedestrian hit at 50 km/h takes the same blow as an NPC; the same blast moves a bus far less than a car;
//  a helicopter out of fuel autorotates (about 9 m/s down, 2.5 m/s with the flare) instead of falling;
//  a sprint lasts about 18 s, then it is the run until the breath is back.
const { run, freeze, result } = require('../lib.cjs');
run('physics-extra', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, P = g.phys, R = P.R, o = { fall: {}, crash: {}, wet: {}, water: {}, run: {}, blast: {}, heli: {}, stam: {}, fuel: {}, train: {}, health: {} }; g.eng.render = () => {};
    g.state.weather = { type: 'clear', until: 1e12 }; g.daynight.wet = 0;   // the game starts in rain (state.weather): the road must be dry for the dry-road figures
    let ticks = 0; const step = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (++ticks % 10 === 0) await new Promise((f) => setTimeout(f, 10)); } };
    const X0 = 40000, Z0 = 40000, Y = 2000;
    for (let i = -6; i < 6; i++) for (let j = -2; j < 5; j++) P.world.createCollider(R.ColliderDesc.cuboid(250, 1, 250).setTranslation(X0 + i * 500 + 250, Y - 1, Z0 + j * 500 + 250).setFriction(1).setCollisionGroups(((1 << 16) | 0xffff) >>> 0));
    const put = (x, y, z) => { pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
    const hurt = []; g.hurtPlayer = (d, a, why) => { hurt.push([d, why]); };
    const C = { t: 0, b: 0, s: 0, hand: false };
    const V = g.vehicles[0].constructor; let car = null;
    const cstep = async (n) => { for (let i = 0; i < n; i++) { car.throttle = C.t; car.brake = C.b; car.steer = C.s; car.hand = C.hand; car.control(1 / 60); car.throttle = C.t; car.brake = C.b; car.steer = C.s; car.hand = C.hand; P.step(1 / 60, () => car.applyDrive(), [car.pv]); car.post(1 / 60); if (++ticks % 200 === 0) await new Promise((f) => setTimeout(f, 0)); } };
    // a car or craft of its own, stepped by the test as the game's loop would (the game's list does not hold it)
    const mk = async (type, x, y, z, h = Math.PI / 2, nearX = x, nearZ = z, nearY = y) => {
      const v = new V(g, type, 0x333333, 'parked', {}); v.x = x; v.z = z; v.h = h; v.spawnY = y; v.startY = y + (v.spec.cy || 0) + 0.3; v.awake = true; v.fuel = 1e9;
      put(nearX, nearY + 1, nearZ + 6); g.addVehicle(v); await step(30); const gi = g.vehicles.indexOf(v); if (gi >= 0) g.vehicles.splice(gi, 1); v.driver = 'lab'; v.kind = 'lab'; car = v; await cstep(30); return v;
    };
    const drop = (v, x, y, z, vx = 0) => { v.inWater = 0; v.flooded = false; v.floodT = 0; v.floatT = 0; v.vyW = null; v.vx = vx; v.vz = 0; v.noImpact = 3; v.hp = v.maxHp; v.dead = false; v.pv.body.setTranslation({ x, y, z }, true); v.pv.body.setRotation({ x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) }, true); v.pv.body.setLinvel({ x: vx, y: 0, z: 0 }, true); v.pv.body.setAngvel({ x: 0, y: 0, z: 0 }, true); v.pv.body.wakeUp(); };
    const rm = (v) => { g.scene.remove(v.group); v.detachPhysics(); };

    // ---- fuel: a sedan driven 100 km/h for a minute (1.67 km), by the player: a full tank is ~650 km, 0.15-0.2 % a kilometre
    try {
      const v = await mk('sedan', X0 - 2900, Y, Z0 + 300); v.driver = 'player'; v.fuel = 100; drop(v, X0 - 2900, Y + 0.9, Z0 + 300, 100 / 3.6); C.t = 0; await cstep(1); const x0 = v.x, f0 = v.fuel;
      for (let k = 0; k < 60 * 50 && v.x < X0 - 2900 + 1400; k++) { C.t = clampT(v.fwdSpeed); await cstep(1); }
      const km = (v.x - x0) / 1000; o.fuel = { km: +km.toFixed(2), perKm: +((f0 - v.fuel) / km).toFixed(3), rangeKm: +(100 / ((f0 - v.fuel) / km)).toFixed(0) }; v.driver = 'lab'; rm(v);
    } catch (e) { o.fuel.err = e.message; }
    function clampT(vf) { return Math.max(0, Math.min(1, 0.25 + (100 / 3.6 - vf) * 0.1)); }

    // ---- a wreck limps: 8 s of full throttle from rest, whole and at a quarter of its strength
    try {
      const v = await mk('sedan', X0 - 2900, Y, Z0 + 150); const run8 = async (hp) => { drop(v, X0 - 2900, Y + 0.9, Z0 + 150); v.hp = hp * v.maxHp; C.t = 0; await cstep(60); v.hp = hp * v.maxHp; C.t = 1; await cstep(60 * 8); const k = v.fwdSpeed * 3.6; C.t = 0; return +k.toFixed(0); };
      o.health.whole = await run8(1); o.health.wreck = await run8(0.25); rm(v);
    } catch (e) { o.health.err = e.message; }

    // ---- falls
    try {
      const v = await mk('sedan', X0 - 2900, Y, Z0);
      for (const h of [2, 10, 20, 40]) {
        drop(v, X0 - 2900, Y + 0.9 + h, Z0 + 8 * h); C.t = 0; C.b = 0; await cstep(1);
        const hp0 = v.hp; await cstep(60 * (h < 12 ? 3 : 5)); o.fall['m' + h] = { loss: +((hp0 - v.hp) / v.maxHp).toFixed(2), dead: v.dead };
      }
      rm(v);
    } catch (e) { o.fall.err = e.message; }

    // ---- occupant injury of a crash (Game.onPlayerCrash)
    try {
      const v = new V(g, 'sedan', 0x333333, 'parked', {}); const was = g.vehicle; g.vehicle = v; const prev = hurt.length;
      for (const kmh of [30, 50, 80, 100, 130]) { hurt.length = 0; g.onPlayerCrash(kmh / 3.6); o.crash['k' + kmh] = +(hurt.reduce((s, h) => s + h[0], 0)).toFixed(1); }
      g.vehicle = was; void prev;
    } catch (e) { o.crash.err = e.message; }

    // ---- a wet road: 100-0 km/h braking, dry and in rain (the track; wetness read by driveVehicle through daynight.wet)
    try {
      const v = await mk('sedan', X0 - 2900, Y, Z0 + 600);
      const brake100 = async (wet) => {
        g.daynight.wet = wet; drop(v, X0 - 2900, Y + 0.9, Z0 + 600); C.t = 0; C.b = 0; await cstep(60); drop(v, X0 - 2900, Y + 0.9, Z0 + 600, 100 / 3.6); C.t = 0.3; await cstep(30); v.pv.body.setLinvel({ x: 100 / 3.6, y: v.pv.body.linvel().y, z: 0 }, true); await cstep(1);
        const xb = v.x; C.t = 0; C.b = 1; let t = 0; while (t < 20 && v.speed > 0.3) { await cstep(1); t += 1 / 60; } C.b = 0; return +(v.x - xb).toFixed(1);
      };
      o.wet.dry = await brake100(0); o.wet.rain = await brake100(1); o.wet.storm = await brake100(1.4); g.daynight.wet = 0; o.wet.ratio = +(o.wet.rain / o.wet.dry).toFixed(2);
      rm(v);
    } catch (e) { o.wet.err = e.message; }

    // ---- water: dropped 3 m over the middle of the capital's first lake
    try {
      const L = g.world.waters[0], cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2; o.water.lake = { y: L.y, floor: L.floor };
      const v = await mk('sedan', cx, L.y + 3, cz, Math.PI / 2, cx, cz, L.y + 3);
      drop(v, cx, L.y + 3.9, cz); C.t = 0; C.b = 0; v.flooded = false; v.floodT = 0; v.floatT = 0; v.noImpact = 3; await cstep(1);
      const at = async (secs) => { await cstep(Math.round(secs * 60)); return { draft: +(L.y - (v.baseY())).toFixed(2), by: +v.by.toFixed(2), flooded: !!v.flooded, hp: +(v.hp / v.maxHp).toFixed(2) }; };
      o.water.t3 = await at(3); o.water.t12 = await at(9); o.water.t25 = await at(13); o.water.t50 = await at(25);
      // wading: in from the shore at 20 m/s on the drive's throttle
      v.flooded = false; v.floodT = 0; v.floatT = 0; v.hp = v.maxHp; v.dead = false; drop(v, L.x0 + 0.5, 0.9, cz, 20); C.t = 0.4; await cstep(1);
      let minSp = 99, maxSp = 0, xIn = null; const tr = []; for (let k = 0; k < 480; k++) { await cstep(1); if (xIn === null && v.inWater > 0.2) xIn = v.x; if (xIn !== null) { minSp = Math.min(minSp, v.speed); } maxSp = Math.max(maxSp, v.speed); if (k % 60 === 0) tr.push([Math.round(v.x - L.x0), +v.speed.toFixed(1), +(v.inWater || 0).toFixed(2), +v.by.toFixed(2)]); }
      o.water.wade = { enteredAt: xIn === null ? null : Math.round(xIn - L.x0), maxSp: +maxSp.toFixed(1), minSp: +minSp.toFixed(1), flooded: !!v.flooded, tr };
      C.t = 0; rm(v);
    } catch (e) { o.water.err = e.message; }

    // ---- a pedestrian (the player) hit at 50 km/h
    try {
      const v = await mk('sedan', X0 - 2900, Y, Z0 + 900); drop(v, X0 - 2900, Y + 0.9, Z0 + 900, 50 / 3.6); C.t = 0.4; await cstep(1);
      g.playerOnFoot = true; g.vehicle = null; put(X0 - 2880, Y, Z0 + 900); hurt.length = 0; g.lastRunOver = -9;
      v.group.visible = true; g.vehicles.push(v); for (let k = 0; k < 120 && !hurt.length; k++) { v.pv.body.setLinvel({ x: 50 / 3.6, y: v.pv.body.linvel().y, z: 0 }, true); await cstep(1); g.vehicleVsHumans(); } g.vehicles.splice(g.vehicles.indexOf(v), 1);
      o.run.player50 = hurt.length ? +hurt[0][0].toFixed(1) : null; C.t = 0; rm(v);
    } catch (e) { o.run.err = e.message; }

    // ---- the same blast moves a bus far less than a car
    try {
      const a = await mk('sedan', X0 - 2900, Y, Z0 + 1203), b = await mk('bus', X0 - 2900, Y, Z0 + 1217);
      const dv = {}; for (const [k, v] of [['sedan', a], ['bus', b]]) { drop(v, X0 - 2900, Y + 0.9 + (k === 'bus' ? 0.5 : 0), Z0 + (k === 'bus' ? 1217 : 1203)); }
      car = a; await cstep(30); car = b; await cstep(30);
      const lv0 = [a, b].map((v) => v.pv.body.linvel()); g.vehicles.push(a, b); g.explosion(X0 - 2900, Y + 0.6, Z0 + 1210, 8, 1, null); g.vehicles.splice(g.vehicles.indexOf(a), 1); g.vehicles.splice(g.vehicles.indexOf(b), 1);
      const lv1 = [a, b].map((v) => v.pv.body.linvel()); dv.sedan = +Math.hypot(lv1[0].x - lv0[0].x, lv1[0].z - lv0[0].z).toFixed(2); dv.bus = +Math.hypot(lv1[1].x - lv0[1].x, lv1[1].z - lv0[1].z).toFixed(2); o.blast = dv;
      rm(a); rm(b);
    } catch (e) { o.blast.err = e.message; }

    // ---- a train car (a synthetic one on the track) kills the player on the rails, spares one 5 m beside them, wrecks a car on them
    try {
      const T = g.transit, car0 = { x: X0 - 2000, z: Z0 + 1800, y: Y + 0.3, h: 0 }; g.playerOnFoot = true; g.vehicle = null; g.time = (g.time || 0) + 5;
      put(car0.x + 5, Y, car0.z); hurt.length = 0; T.lastHitT = -9; T.trainHit(car0, 70); o.train.beside = hurt.length;
      put(car0.x, Y, car0.z + 6); hurt.length = 0; T.lastHitT = -9; T.trainHit(car0, 70); o.train.onRails = hurt.length ? hurt[0] : null;
      put(car0.x + 40, Y, car0.z + 40);
      const v = await mk('sedan', car0.x, Y, car0.z - 4); v.hp = v.maxHp; v.dead = false; g.vehicles.push(v); T.trainHit(car0, 70); g.vehicles.splice(g.vehicles.indexOf(v), 1); o.train.carDead = v.dead; rm(v);
    } catch (e) { o.train.err = e.message; }

    // ---- a helicopter out of fuel, 120 m over the track: no flare, then the pilot's flare
    try {
      const realGY = g.groundY; g.groundY = () => Y;
      for (const flare of [false, true]) {
        const v = await mk('heli', X0 - 2900, Y + 120, Z0 + 1500 + (flare ? 40 : 0), 0, X0 - 2900, Y, Z0 + 1500); v.fuel = 0; v.hp = v.maxHp; v.dead = false; const imp = []; const oi = v.onImpact.bind(v); v.onImpact = (sp, x, z, ot) => { imp.push(+sp.toFixed(1)); return oi(sp, x, z, ot); };
        v.pv.body.setTranslation({ x: X0 - 2900, y: Y + 120, z: Z0 + 1500 + (flare ? 40 : 0) }, true); v.pv.body.setLinvel({ x: 0, y: 0, z: 0 }, true); v.noImpact = 3; v.spool = 1; C.t = 0; C.b = 0; C.hand = false;
        let vy9 = null, vyTouch = null; for (let k = 0; k < 60 * 40; k++) { const agl = v.by - Y; C.hand = flare && agl < 15; await cstep(1); if (k === 60 * 8) vy9 = +v.pv.body.linvel().y.toFixed(1); if (vyTouch === null && agl < 2.5) vyTouch = +v.pv.body.linvel().y.toFixed(1); if (v.by - Y < 1.4 && Math.abs(v.pv.body.linvel().y) < 0.5) break; }
        o.heli[flare ? 'flare' : 'noFlare'] = { imp, hp: Math.round(v.hp), vy8s: vy9, vyAtTouch: vyTouch, loss: +(1 - v.hp / v.maxHp).toFixed(2), dead: v.dead, autoRot: !!v.autoRot };
        C.hand = false; rm(v);
      }
      g.groundY = realGY;
    } catch (e) { o.heli.err = e.message; }

    // ---- sprint stamina: flat out for 30 s, then walking, then flat out again
    try {
      g.playerOnFoot = true; g.vehicle = null; put(X0, Y, Z0 + 1700); await step(60); g.sandbox && (g.sandbox.on = false);
      const inp = g.input, rd = inp.read; let mode = 'sprint';
      inp.read = function (dt) { return { ...rd.call(this, dt), mx: 0, my: 1, sprint: mode === 'sprint' }; };
      const spd = () => pl.speed; let tWinded = null, run1 = 0, n1 = 0; const t0 = g.time;
      for (let k = 0; k < 60 * 30; k++) { await step(1); if (k > 120 && k < 240) { run1 += spd(); n1++; } if (tWinded === null && pl.winded) tWinded = +(k / 60).toFixed(1); if (k === 60 * 21) o.stam.speedWinded = +spd().toFixed(1); }
      o.stam.sprintMs = +(run1 / n1).toFixed(1); o.stam.windedAt = tWinded; mode = 'walk'; let back = null;
      for (let k = 0; k < 60 * 20; k++) { await step(1); if (back === null && !pl.winded) back = +(k / 60).toFixed(1); } o.stam.recoveredAfter = back; mode = 'sprint';
      await step(60); o.stam.speedAgain = +spd().toFixed(1); inp.read = rd; void t0;
    } catch (e) { o.stam.err = e.message; }
    g.eng.render = () => {}; return o;
  });
  const bad = [], fu = o.fuel, f = o.fall, c = o.crash, w = o.wet, wa = o.water, hl = o.heli, st = o.stam, bl = o.blast;
  for (const [k, e] of Object.entries(o)) if (e && e.err) bad.push(`${k}: ${e.err}`);
  if (o.train.beside != null && !(o.train.beside === 0 && o.train.onRails && o.train.onRails[1] === 'train' && o.train.carDead)) bad.push(`train: beside ${o.train.beside}, on the rails ${JSON.stringify(o.train.onRails)}, car dead ${o.train.carDead}`);
  if (o.health.whole != null && !(o.health.wreck < o.health.whole * 0.9 && o.health.wreck > o.health.whole * 0.5)) bad.push(`wreck: ${o.health.wreck} km/h after 8 s against ${o.health.whole} whole`);
  if (fu.rangeKm != null && !(fu.rangeKm >= 400 && fu.rangeKm <= 900)) bad.push(`fuel: a tank lasts ${fu.rangeKm} km at 100 km/h (real 500-700)`);
  if (f.m2 && !(f.m2.loss < 0.08)) bad.push(`fall 2 m loss ${f.m2.loss} (a hop)`);
  if (f.m10 && !(f.m10.loss >= 0.1 && f.m10.loss <= 0.5)) bad.push(`fall 10 m loss ${f.m10.loss} (real: a fifth)`);
  if (f.m20 && !(f.m20.loss >= 0.35 || f.m20.dead)) bad.push(`fall 20 m loss ${f.m20.loss} (real: most of the car)`);
  if (f.m40 && !(f.m40.dead || f.m40.loss > 0.8)) bad.push(`fall 40 m loss ${f.m40.loss} (real: wrecked)`);
  if (c.k50 != null && !(c.k50 >= 6 && c.k50 <= 16)) bad.push(`crash 50 km/h injury ${c.k50} (real ~10)`);
  if (c.k100 != null && !(c.k100 >= 40 && c.k100 <= 70)) bad.push(`crash 100 km/h injury ${c.k100} (real ~55)`);
  if (w.ratio != null && !(w.ratio >= 1.25 && w.ratio <= 1.8)) bad.push(`wet braking ratio ${w.ratio} (real 1.3-1.6)`);
  if (wa.t3 && !(wa.t3.draft >= 0.15 && wa.t3.draft <= 0.8 && !wa.t3.flooded)) bad.push(`water: 3 s after the drop it should float: ${JSON.stringify(wa.t3)}`);
  if (wa.t50 && !(wa.t50.flooded && wa.t50.draft > 1.2)) bad.push(`water: after 50 s it should have sunk, flooded: ${JSON.stringify(wa.t50)}`);
  if (wa.wade && !(wa.wade.minSp < wa.wade.maxSp * 0.5)) bad.push(`water: wading should slow the car: ${JSON.stringify(wa.wade)}`);
  if (o.run.player50 != null && !(o.run.player50 >= 55 && o.run.player50 <= 80)) bad.push(`player hit at 50 km/h took ${o.run.player50} (NPC: ~69)`);
  if (bl.sedan != null && !(bl.bus < bl.sedan * 0.35)) bad.push(`blast: bus moved ${bl.bus} m/s, the car ${bl.sedan}`);
  if (hl.noFlare && !(hl.noFlare.vy8s <= -6 && hl.noFlare.vy8s >= -12 && !hl.noFlare.dead)) bad.push(`heli no flare: ${JSON.stringify(hl.noFlare)}`);
  if (hl.flare && !(hl.flare.vyAtTouch >= -4 && hl.flare.loss < 0.08)) bad.push(`heli flare: ${JSON.stringify(hl.flare)}`);
  if (st.windedAt != null && !(st.windedAt >= 15 && st.windedAt <= 21)) bad.push(`sprint winded at ${st.windedAt} s (real ~18)`);
  if (st.windedAt == null && !st.err) bad.push('sprint never ran out');
  if (st.speedAgain != null && !(st.speedAgain > st.speedWinded + 1.5)) bad.push(`sprint after the rest ${st.speedAgain} vs winded ${st.speedWinded}`);
  result('physics-extra', bad.length === 0, { ...o, bad });
});
