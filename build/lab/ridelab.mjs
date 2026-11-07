// Ride height at rest, a 100 km/h double lane change (ISO 3888: 3.5 m over 25 m and back), a 2 m drop, and a 90 km/h drive off a 5 m ledge: node build/lab/ridelab.mjs
import RAPIER from '@dimforge/rapier3d-compat';
import { Physics, driveVehicle, PHYS } from '../../src/physics.js';
import { CAR_SPECS } from '../../src/carspecs.js';
await RAPIER.init();
for (const type of ['sedan', 'sport', 'suv', 'truck']) {
  const P = new Physics(RAPIER), R = RAPIER; P.world.createCollider(R.ColliderDesc.cuboid(4000, 1, 400).setTranslation(0, -1, 0).setFriction(1).setCollisionGroups(((1 << 16) | 0xffff) >>> 0));
  const v = P.createVehicle({ ...CAR_SPECS[type] }, 0, 0, Math.PI / 2), b = v.body, o = {};
  const fwd = () => { const q = b.rotation(), fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y), l = Math.hypot(fx, fz), lv = b.linvel(); return (lv.x * fx + lv.z * fz) / l; };
  const step = (C, n = 1) => { for (let i = 0; i < n; i++) P.step(1 / 60, () => driveVehicle(v, { throttle: C.t || 0, brake: C.b || 0, steer: C.s || 0, maxSteer: 0.2, hand: false, speedFwd: fwd(), dead: false, parked: false }), [v]); };
  step({}, 180); o.restY = +b.translation().y.toFixed(3);
  // lane change at 100 km/h: steer by a pure pursuit on the ISO path
  b.setTranslation({ x: -1000, y: o.restY, z: 0 }, true); b.setLinvel({ x: 27.8, y: 0, z: 0 }, true); let minUp = 1, maxRoll = 0;
  for (let k = 0; k < 300; k++) { const t = b.translation(), x = t.x + 1000, zt = x < 15 ? 0 : x < 45 ? 3.5 * Math.sin(Math.min(1, (x - 15) / 25) * Math.PI / 2) : x < 70 ? 3.5 : x < 95 ? 3.5 * Math.cos(((x - 70) / 25) * Math.PI / 2) : 0;
    const q = b.rotation(), h = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y)), want = Math.atan2(zt + 0 - t.z, 12) , dh = Math.atan2(Math.sin(Math.PI / 2 - want - h), Math.cos(Math.PI / 2 - want - h));
    step({ t: fwd() < 27.8 ? 0.6 : 0, s: Math.max(-1, Math.min(1, dh * 3)) }); const up = 1 - 2 * (q.x * q.x + q.z * q.z); minUp = Math.min(minUp, up); }
  o.laneMinUp = +minUp.toFixed(3);
  // 2 m drop
  b.setTranslation({ x: 500, y: o.restY + 2, z: 0 }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setRotation({ x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) }, true); let minY = 9;
  for (let k = 0; k < 180; k++) { step({}); minY = Math.min(minY, b.translation().y); }
  o.dropMinY = +minY.toFixed(3); o.dropEndY = +b.translation().y.toFixed(3);
  // off a 5 m ledge at 90 km/h: the nose dips as the front wheels leave the edge (a real car lands nose-first, 10-25 deg down), then it must land on its wheels
  P.world.createCollider(R.ColliderDesc.cuboid(150, 2.5, 20).setTranslation(1850, 2.5, 200).setFriction(1).setCollisionGroups(((1 << 16) | 0xffff) >>> 0));
  b.setTranslation({ x: 1950, y: 5 + o.restY, z: 200 }, true); b.setRotation({ x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true); b.setLinvel({ x: 25, y: 0, z: 0 }, true);
  let pitch = 0, landUp = 1, air = 0;
  for (let k = 0; k < 400; k++) { if (process.env.DBG && k % 20 === 0) { const t = b.translation(); console.log(k, t.x.toFixed(1), t.y.toFixed(2), fwd().toFixed(1)); } step({ t: fwd() < 25 && b.translation().x < 2000 ? 0.5 : 0 }); const q = b.rotation(), t = b.translation(); const fy = 2 * (q.y * q.z - q.w * q.x); if (t.x > 2000 && t.x < 2060) { pitch = Math.max(pitch, Math.asin(Math.max(-1, Math.min(1, -fy))) * 57.3); if (t.y > o.restY + 0.4) air++; } if (t.x > 2060) landUp = Math.min(landUp, 1 - 2 * (q.x * q.x + q.z * q.z)); }
  o.ledgePitchDeg = Math.round(pitch); o.ledgeAirS = +(air / 60).toFixed(2); o.ledgeLandUp = +landUp.toFixed(2); o.ledgeEndUp = +(1 - 2 * (b.rotation().x ** 2 + b.rotation().z ** 2)).toFixed(2);
  console.log(type.padEnd(6), JSON.stringify(o));
}
