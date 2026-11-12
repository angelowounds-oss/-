// Vehicle lab in Node (EV-10): the scenarios of tests/lib/vlab.js on the game's Physics and driveVehicle, with the steering limit and lag of
// Vehicle.control. Usage: node build/lab/vehicle-lab.mjs [type...] [--only skidpad,slalom]   (prints one JSON line per type)
import { createRequire } from 'node:module';
import RAPIER from '@dimforge/rapier3d-compat';
import { Physics, driveVehicle, PHYS } from '../../src/physics.js';
import { CAR_SPECS } from '../../src/carspecs.js';
const { vehicleLab } = createRequire(import.meta.url)('../../tests/lib/vlab.js');
// the lab's bike and bus as carlab.mjs has them (in the game they are crafts with their own models)
export const SPECS = { ...CAR_SPECS, moto: { L: 2.1, W: 0.8, wb: 0.85, mass: 0.215, maxSpeed: 72, accel: 8.5, grip: 1.1, power: 80, cda: 0.4, crr: 0.015 }, bus: { L: 11, W: 2.55, wb: 3.8, mass: 10, maxSpeed: 25, accel: 1.4, grip: 0.7, power: 210, cda: 6.5, crr: 0.007 } };
await RAPIER.init();
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GROUP = ((1 << 16) | 0xffff) >>> 0;

// the adapter of vlab.js over one car on a flat slab 8 km x 1 km (top at y 0)
export function nodeAdapter(type) {
  const P = new Physics(RAPIER), w = P.world, R = RAPIER;
  w.createCollider(R.ColliderDesc.cuboid(4000, 1, 500).setTranslation(0, -1, 0).setFriction(1).setCollisionGroups(GROUP));
  const spec = { ...SPECS[type] }, v = P.createVehicle(spec, 0, 0, Math.PI / 2), b = v.body;
  let steerA = 0, wet = 0;
  const maxSteer = (s) => lerp(0.52, 0.075, clamp(Math.abs(s) / 34, 0, 1));   // Vehicle.control
  const axes = () => { const q = b.rotation(); return { f: [2 * (q.x * q.z + q.w * q.y), 2 * (q.y * q.z - q.w * q.x), 1 - 2 * (q.x * q.x + q.y * q.y)], r: [1 - 2 * (q.y * q.y + q.z * q.z), 2 * (q.x * q.y + q.w * q.z), 2 * (q.x * q.z - q.w * q.y)], u: [2 * (q.x * q.y - q.w * q.z), 1 - 2 * (q.x * q.x + q.z * q.z), 2 * (q.y * q.z + q.w * q.x)] }; };
  const fwd = () => { const { f } = axes(), lv = b.linvel(), l = Math.hypot(f[0], f[2]) || 1; return (lv.x * f[0] + lv.z * f[2]) / l; };
  return {
    Y: 0, wb: spec.wb * 2, W: spec.W,
    maxSteer,
    wet(x) { wet = x; },
    place(x, z, h, speed, y = PHYS.bodyY + 0.05, quat = null) {
      const q = quat || { x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) };
      b.setTranslation({ x, y, z }, true); b.setRotation(q, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true); b.setLinvel({ x: Math.sin(h) * speed, y: 0, z: Math.cos(h) * speed }, true); steerA = 0;
    },
    step(c) {
      const vf = fwd(), ms = maxSteer(vf); steerA += (c.s * ms - steerA) * (1 - Math.exp(-9 / 60));
      P.step(1 / 60, () => driveVehicle(v, { wet, throttle: c.t, brake: c.b, steer: steerA / ms, maxSteer: ms, hand: !!c.hand, speedFwd: fwd(), dead: false, parked: false }), [v]);
    },
    state() {
      const t = b.translation(), lv = b.linvel(), av = b.angvel(), { f, r, u } = axes();
      return { x: t.x, y: t.y, z: t.z, vx: lv.x, vy: lv.y, vz: lv.z, fwd: fwd(), h: Math.atan2(f[0], f[2]), yaw: av.y, roll: Math.asin(clamp(r[1], -1, 1)), pitch: Math.asin(clamp(f[1], -1, 1)), up: u[1] };
    },
    box(cx, cy, cz, hx, hy, hz, q) { const d = R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setFriction(1).setCollisionGroups(GROUP); if (q) d.setRotation(q); w.createCollider(d); },
  };
}

if (process.argv[1] && process.argv[1].endsWith('vehicle-lab.mjs')) {
  const args = process.argv.slice(2), oi = args.indexOf('--only'), only = oi >= 0 ? args.splice(oi, 2)[1].split(',') : null;
  for (const t of args.length ? args : ['sedan', 'sport', 'suv', 'truck', 'moto', 'bus']) console.log(t.padEnd(6), JSON.stringify(await vehicleLab(nodeAdapter(t), only)));
}
