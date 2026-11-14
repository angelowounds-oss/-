// The tyres' side forces (EV-11). Rapier's ray-cast vehicle resolves each wheel's sideways speed to zero up to its friction limit: the car runs on
// rails, then lets go at once. Here its side friction is off (physics.js createVehicle) and each wheel in contact gets a side force from its slip
// angle through a simple Pacejka curve (B, C, E per vehicle; D = the tyre's grip x its load), applied at the contact patch, so the body slips,
// rolls on its springs and loads its outer wheels. The load is the suspension's force; the friction circle leaves the side force what the drive or
// the brakes do not use.

// the magic formula's shape: C the curve's form (past the peak the force falls to sin(C pi / 2) = 0.97 of it), E its curvature; B is set per
// vehicle from the slip angle of the peak. A tyre's grip falls a little as its load grows (load sensitivity): a 12 kN truck wheel has about
// 0.9 of a 4 kN car wheel's
const C = 1.15, E = 0;
// slip angle (deg) at the peak side force per vehicle kind (road tests: 6-10 deg for road tyres, less for sports tyres, more for truck tyres)
export const PEAK_DEG = { sedan: 7, sport: 6, suv: 8, truck: 9, bus: 10, moto: 6 };
// B from the peak's slip angle: the curve peaks where B x alpha - E (B x alpha - atan(B x alpha)) = tan(pi / 2C)
function stiffFor(peakDeg) {
  const target = Math.tan(Math.PI / (2 * C)), a = peakDeg * Math.PI / 180;
  let lo = 0.1, hi = 200;
  for (let k = 0; k < 50; k++) { const B = (lo + hi) / 2, x = B * a, y = x - E * (x - Math.atan(x)); if (y < target) lo = B; else hi = B; }
  return (lo + hi) / 2;
}
const B_CACHE = new Map();
// the share of the peak side force at slip angle a (rad), signed like a
export function sideShare(a, B) { const x = B * a; return Math.sin(C * Math.atan(x - E * (x - Math.atan(x)))); }
export function stiffness(peakDeg) { let B = B_CACHE.get(peakDeg); if (B === undefined) B_CACHE.set(peakDeg, (B = stiffFor(peakDeg))); return B; }

// The surfaces (EV-13, surface.js finds them in the world): each one's share of dry asphalt's grip and its multiple of the tyres' rolling
// resistance, from published friction tables (dry asphalt and concrete 0.9-1.0, gravel 0.6-0.7, grass 0.45-0.6, packed snow 0.3-0.4, ice about 0.1)
export const SURF = { ASPHALT: 0, PAVEMENT: 1, GRASS: 2, DIRT: 3, GRAVEL: 4, SAND: 5, SNOW: 6, ICE: 7, MUD: 8 };
export const SURF_NAME = ['asphalt', 'pavement', 'grass', 'dirt', 'gravel', 'sand', 'snow', 'ice', 'mud'];
export const SURF_MU = [1, 1, 0.55, 0.65, 0.7, 0.55, 0.35, 0.12, 0.4];
export const SURF_CRR = [1, 1.1, 5, 4, 2.5, 9, 3, 1, 10];

const Q = { x: 0, y: 0, z: 0, w: 1 };
// rotate the chassis-space vector (x, y, z) by the body's rotation q into out
function rot(q, x, y, z, out) {
  const ix = q.w * x + q.y * z - q.z * y, iy = q.w * y + q.z * x - q.x * z, iz = q.w * z + q.x * y - q.y * x, iw = -q.x * x - q.y * y - q.z * z;
  out.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y; out.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z; out.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
  return out;
}
const P = { x: 0, y: 0, z: 0 }, A = { x: 0, y: 0, z: 0 }, F = { x: 0, y: 0, z: 0 }, CM = { x: 0, y: 0, z: 0 }, J = { x: 0, y: 0, z: 0 };

// Push each wheel in contact sideways by its tyre's force for one step (dt s). mu: the tyres' friction (grip x the wet road's share) per wheel
// as mu[i]; fx[i]: the force (N) the drive or the brakes take of that tyre's grip; cg: the centre of mass in chassis space (y)
export function tyreForces(v, dt, mu, fx, cgY) {
  const { ctrl, body, spec } = v; if (!ctrl) return;
  const B = stiffness(spec.peakDeg || 7), q = body.rotation(); Q.x = q.x; Q.y = q.y; Q.z = q.z; Q.w = q.w;
  const t = body.translation(), lv = body.linvel(), w = body.angvel(), m4 = v.mass / 4;
  rot(Q, 0, cgY, 0, CM); CM.x += t.x; CM.y += t.y; CM.z += t.z;
  const sp = Math.hypot(lv.x, lv.z);
  let slipSum = 0, nOn = 0;
  for (let i = 0; i < 4; i++) {
    if (!ctrl.wheelIsInContact(i)) continue;
    const Fz = ctrl.wheelSuspensionForce(i) || 0; if (Fz <= 0) continue;
    // the contact patch: the hard point, down the suspension and the wheel's radius
    const cp = ctrl.wheelChassisConnectionPointCs(i), len = (ctrl.wheelSuspensionLength(i) ?? 0) + (ctrl.wheelRadius(i) ?? 0.35);
    rot(Q, cp.x, cp.y - len, cp.z, P); P.x += t.x; P.y += t.y; P.z += t.z;
    // the wheel's axle: chassis -x turned by its steering about the chassis up (Rapier turns the axle the same way)
    const st = ctrl.wheelSteering(i) || 0, cs = Math.cos(st), sn = Math.sin(st);
    rot(Q, -cs, 0, sn, A);
    // the patch's speed and its parts along the axle (side) and along the wheel (rolling)
    const rx = P.x - CM.x, ry = P.y - CM.y, rz = P.z - CM.z;
    const vx = lv.x + w.y * rz - w.z * ry, vy = lv.y + w.z * rx - w.x * rz, vz = lv.z + w.x * ry - w.y * rx;
    rot(Q, sn, 0, cs, F);
    const vLat = vx * A.x + vy * A.y + vz * A.z, vLong = vx * F.x + vy * F.y + vz * F.z;
    // the slip angle, its rolling speed floored so a crawling car does not see huge angles; below walking pace the tyre simply holds (static
    // friction): the force that stops the sideways creep in one step, within the grip
    // ABS and traction control keep a tyre short of its peak slip, so at most 90 % of its grip goes along it and some 44 % is left across (a full
    // brake asked more than the tyre had, above all at the unloaded rear, and left the car no grip to steer with)
    const muI = mu[i] * Math.min(1.08, Math.max(0.75, (Fz / 4000) ** -0.1)), alpha = Math.atan2(vLat, Math.max(Math.abs(vLong), 3)), fxi = Math.min(fx[i], muI * Fz * 0.9), cap = Math.sqrt(Math.max(0, (muI * Fz) ** 2 - fxi * fxi));
    let fy = -cap * sideShare(alpha, B);
    const hold = Math.max(0, 1 - sp / 2.5);
    if (hold > 0) { const st0 = Math.max(-cap, Math.min(cap, -vLat * m4 / dt * 0.5)); fy = fy * (1 - hold) + st0 * hold; }
    J.x = A.x * fy * dt; J.y = A.y * fy * dt; J.z = A.z * fy * dt;
    body.applyImpulseAtPoint(J, P, true);
    if (sp > 3) { slipSum += Math.abs(alpha); nOn++; }
  }
  v.tyreSlip = nOn ? slipSum / nOn : 0;   // mean slip angle of the wheels on the ground (rad), for the sound and the smoke
}
