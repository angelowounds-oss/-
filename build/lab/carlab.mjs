// Vehicle dynamics lab: the game's own Physics and driveVehicle under Node on a flat slab, with the steering limit of Vehicle.control.
// Prints the measurements of tests/e2e/physics-reality for each car type: node build/lab/carlab.mjs [type...]
import RAPIER from '@dimforge/rapier3d-compat';
import { Physics, driveVehicle, PHYS } from '../../src/physics.js';
import { CAR_SPECS, DT } from '../../src/carspecs.js';
const SPECS = { ...CAR_SPECS, moto: { L: 2.1, W: 0.8, wb: 0.85, mass: 0.215, maxSpeed: 72, accel: 8.5, grip: 1.1, power: 80, cda: 0.4, crr: 0.015, dt: DT.moto }, bus: { L: 11, W: 2.55, wb: 3.8, mass: 10, maxSpeed: 25, accel: 1.4, grip: 0.7, power: 210, cda: 6.5, crr: 0.007, dt: DT.bus, peakDeg: 6.5 } };
await RAPIER.init();
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function lab(type) {
  const P = new Physics(RAPIER), w = P.world, R = RAPIER;
  w.createCollider(R.ColliderDesc.cuboid(4000, 1, 400).setTranslation(0, -1, 0).setFriction(1).setCollisionGroups(((1 << 16) | 0xffff) >>> 0));
  w.createCollider(R.ColliderDesc.cuboid(2, 3, 20).setTranslation(3900, 3, 0).setCollisionGroups(((1 << 16) | 0xffff) >>> 0));
  const spec = { ...SPECS[type] }, v = P.createVehicle(spec, -3900, 0, Math.PI / 2), b = v.body, C = { t: 0, b: 0, s: 0 };
  const fwd = () => { const q = b.rotation(), fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y), l = Math.hypot(fx, fz), lv = b.linvel(); return (lv.x * fx + lv.z * fz) / l; };
  const sp = () => { const lv = b.linvel(); return Math.hypot(lv.x, lv.z); };
  let steerA = 0;
  const step = (n = 1) => { for (let i = 0; i < n; i++) { const vf = fwd(), ms = lerp(0.52, 0.075, clamp(Math.abs(vf) / 34, 0, 1)); steerA += (C.s * ms - steerA) * (1 - Math.exp(-9 / 60)); P.step(1 / 60, () => driveVehicle(v, { wet: +(process.env.WET || 0), throttle: C.t, brake: C.b, steer: steerA / ms, maxSteer: ms, hand: false, speedFwd: fwd(), dead: false, parked: false }), [v]); } };
  const reset = (s, x = -3900) => { b.setTranslation({ x, y: PHYS.bodyY + 0.05, z: 0 }, true); b.setRotation({ x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true); b.setLinvel({ x: s, y: 0, z: 0 }, true); C.t = C.b = C.s = 0; steerA = 0; step(20); b.setLinvel({ x: s, y: b.linvel().y, z: 0 }, true); };
  const c = { mass: Math.round(v.mass) };
  reset(0); step(60); C.t = 1; let t = 0, top = 0, t100 = null;
  while (t < 60 && b.translation().x < 3000) { step(); t += 1 / 60; const k = fwd() * 3.6; top = Math.max(top, k); if (t100 === null && k >= 100) t100 = t; }
  c.t0to100 = t100 && +t100.toFixed(2); c.topKmh = Math.round(top);
  reset(100 / 3.6); let x0 = b.translation().x; C.b = 1; t = 0; while (t < 20 && sp() > 0.3) { step(); t += 1 / 60; } c.brake100m = +(b.translation().x - x0).toFixed(1);
  reset(100 / 3.6); let s0 = sp(); step(300); c.coastDecel = +((s0 - sp()) / 5).toFixed(2);
  reset(60 / 3.6); let lat = 0, n = 0, up = 1;
  for (let k = 0; k < 360; k++) { const kk = fwd() * 3.6; C.t = kk < 58 ? 1 : 0; C.b = kk > 64 ? 0.4 : 0; C.s = 1; step(); if (k > 240) { lat += Math.abs(sp() * b.angvel().y); n++; } up = Math.min(up, v.up ?? 1); }
  c.latG = +(lat / n / 9.81).toFixed(2); c.latKmh = Math.round(fwd() * 3.6); c.minUp = +up.toFixed(2);
  b.setTranslation({ x: 0, y: 60, z: 100 }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); step(1); const vy0 = b.linvel().y; step(60); c.fallAccel = +(vy0 - b.linvel().y).toFixed(2);
  return c;
}
for (const t of process.argv.slice(2).length ? process.argv.slice(2) : ['sedan', 'sport', 'suv', 'truck']) console.log(t.padEnd(6), JSON.stringify(lab(t)));
