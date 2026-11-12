// Vehicle lab in the page (EV-10): the scenarios of tests/lib/vlab.js run on the game's own Vehicle (its control(), applyDrive(), post()) on
// a flat test track 2 km up, as physics-reality steps it. Phase 0 records the values (tests/results/vehicle-lab.json); the pass bar is only
// that every scenario produced finite numbers. The targets the values are judged against are in docs/design/vehicle-targets.md.
const fs = require('fs');
const path = require('path');
const { run, freeze, result } = require('../lib.cjs');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'lib', 'vlab.js'), 'utf8');
run('vehicle-lab', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  await page.addScriptTag({ content: SRC });
  const o = await page.evaluate(async () => {
    const g = window.__game, P = g.phys, R = P.R, out = {}; g.eng.render = () => {};
    g.state.weather = { type: 'clear', until: 1e12 }; g.daynight.wet = 0; g.hurtPlayer = () => {};
    const X0 = 40000, Z0 = 40000, Y = 2000, GROUP = ((1 << 16) | 0xffff) >>> 0, pl = g.player;
    for (let i = -8; i < 8; i++) for (let j = -1; j < 1; j++) P.world.createCollider(R.ColliderDesc.cuboid(250, 1, 250).setTranslation(X0 + i * 500 + 250, Y - 1, Z0 + j * 500 + 250).setFriction(1).setCollisionGroups(GROUP));
    pl.body3.teleport(X0, Y + 1, Z0 + 300); pl.x = X0; pl.y = Y + 1; pl.z = Z0 + 300; pl.vx = pl.vz = pl.vy = 0;
    for (let i = 0; i < 30; i++) window.__upd(1 / 60);
    const V = g.vehicles[0].constructor, lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    // one adapter of vlab.js per car type over the game's Vehicle, in lab coordinates (the track's origin at X0, Y, Z0)
    const adapter = (type) => {
      const v = new V(g, type, 0x333333, 'parked', {}); v.x = X0; v.z = Z0; v.h = Math.PI / 2; v.spawnY = Y; v.awake = true; v.fuel = 1e9;
      g.addVehicle(v); window.__upd(1 / 60); const gi = g.vehicles.indexOf(v); if (gi >= 0) g.vehicles.splice(gi, 1); v.driver = 'lab'; v.kind = 'lab';
      const b = v.pv.body, C = { t: 0, b: 0, s: 0, hand: false };
      const axes = () => { const q = b.rotation(); return { f: [2 * (q.x * q.z + q.w * q.y), 2 * (q.y * q.z - q.w * q.x), 1 - 2 * (q.x * q.x + q.y * q.y)], r: [1 - 2 * (q.y * q.y + q.z * q.z), 2 * (q.x * q.y + q.w * q.z), 2 * (q.x * q.z - q.w * q.y)], u: [2 * (q.x * q.y - q.w * q.z), 1 - 2 * (q.x * q.x + q.z * q.z), 2 * (q.y * q.z + q.w * q.x)] }; };
      const set = () => { v.throttle = C.t; v.brake = C.b; v.steer = C.s; v.hand = C.hand; };
      return {
        Y: 0, wb: v.spec.wb * 2, W: v.spec.W, v,
        maxSteer: (s) => lerp(0.52, 0.075, clamp(Math.abs(s) / 34, 0, 1)),   // Vehicle.control without the handbrake or boost terms
        wet(w) { g.daynight.wet = w; },
        place(x, z, h, speed, y, quat) {
          const q = quat || { x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) }, yy = y === undefined ? 0.9 : y;
          b.setTranslation({ x: X0 + x, y: Y + yy, z: Z0 + z }, true); b.setRotation(q, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
          b.setLinvel({ x: Math.sin(h) * speed, y: 0, z: Math.cos(h) * speed }, true); v.vx = Math.sin(h) * speed; v.vz = Math.cos(h) * speed; v.steerA = 0; v.noImpact = 3; v.hp = v.maxHp; v.dead = false;
        },
        step(c) { C.t = c.t; C.b = c.b; C.s = c.s; C.hand = !!c.hand; set(); v.control(1 / 60); set(); P.step(1 / 60, () => v.applyDrive(), [v.pv]); v.post(1 / 60); },
        state() {
          const t = b.translation(), lv = b.linvel(), av = b.angvel(), { f, r, u } = axes(), l = Math.hypot(f[0], f[2]) || 1;
          return { x: t.x - X0, y: t.y - Y, z: t.z - Z0, vx: lv.x, vy: lv.y, vz: lv.z, fwd: (lv.x * f[0] + lv.z * f[2]) / l, h: Math.atan2(f[0], f[2]), yaw: av.y, roll: Math.asin(clamp(r[1], -1, 1)), pitch: Math.asin(clamp(f[1], -1, 1)), up: u[1] };
        },
        box(cx, cy, cz, hx, hy, hz, q) { const d = R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(X0 + cx, Y + cy, Z0 + cz).setFriction(1).setCollisionGroups(GROUP); if (q) d.setRotation(q); P.world.createCollider(d); },
        yield: () => new Promise((f) => setTimeout(f, 0)),
      };
    };
    for (const type of ['sedan', 'sport', 'suv', 'truck']) {
      const t0 = performance.now();
      try { const A = adapter(type); out[type] = await window.vehicleLab(A, null); out[type].ms = Math.round(performance.now() - t0); g.daynight.wet = 0; A.v.dispose && A.v.dispose(); }
      catch (e) { out[type] = { error: String(e && e.stack || e).slice(0, 400) }; }
    }
    return out;
  });
  fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'results', 'vehicle-lab.json'), JSON.stringify(o, null, 1));
  // finite numbers everywhere is the Phase 0 bar; a null climb (could not climb 20 %) is a recorded value, not a failure
  const bad = [];
  const walk = (x, p) => { if (typeof x === 'number' && !Number.isFinite(x)) bad.push(p); else if (x && typeof x === 'object') for (const k of Object.keys(x)) walk(x[k], p + '.' + k); };
  for (const [t, r] of Object.entries(o)) { if (r.error) bad.push(t + ': ' + r.error); else walk(r, t); }
  result('vehicle-lab', bad.length === 0, { ...o, bad: bad.slice(0, 6) });
});
