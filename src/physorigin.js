// The physics world's floating origin (EV-04). Rapier works in 32-bit floats: 450 km from the capital (Jeju) a position has a step of 3 cm, so a body
// moving under 1.9 m/s (a walk) loses whole steps of its motion and everything at rest shakes by centimetres. The physics world is therefore kept
// around ORIGIN, a point of a CELL grid near the player, and moved under the game when the player leaves it (rebase: every body and every collider
// without a body shifted by the same amount, once). The game never sees it: the Rapier calls that take or give a world position (a body's or a
// collider's translation, a desc's translation at creation, a ray's origin, a kinematic target) are wrapped once here to add or take the origin,
// so the game, its 17 physics modules and the tests keep world coordinates. Only y is never shifted (heights stay near the ground's own).
export const CELL = 4096, KEEP = 3072;   // the grid of origins; the player may go KEEP metres from the origin (per axis) before it moves
export const ORIGIN = { x: 0, z: 0, moves: 0 };
const V = { x: 0, y: 0, z: 0 };   // the shifted vector handed to Rapier (it reads x, y, z at once and keeps nothing)
const at = (t) => { V.x = t.x - ORIGIN.x; V.y = t.y; V.z = t.z - ORIGIN.z; return V; };
let raw = null;

// wraps the Rapier classes of module R (once): what goes in loses the origin, what comes out gets it back
export function installOrigin(R) {
  if (raw) return raw;
  const B = R.RigidBody.prototype, C = R.Collider.prototype, W = R.World.prototype;
  raw = { bTr: B.translation, bSet: B.setTranslation, bNext: B.setNextKinematicTranslation, cTr: C.translation, cSet: C.setTranslation, mkBody: W.createRigidBody, mkCol: W.createCollider, ray: W.castRay, rayN: W.castRayAndGetNormal, imp: B.applyImpulseAtPoint, frc: B.addForceAtPoint };
  // a translation read back: the world position
  B.translation = function () { const t = raw.bTr.call(this); t.x += ORIGIN.x; t.z += ORIGIN.z; return t; };
  C.translation = function () { const t = raw.cTr.call(this); t.x += ORIGIN.x; t.z += ORIGIN.z; return t; };
  // a translation set: from the world position
  B.setTranslation = function (t, wake) { return raw.bSet.call(this, at(t), wake); };
  B.setNextKinematicTranslation = function (t) { return raw.bNext.call(this, at(t)); };
  C.setTranslation = function (t) { return raw.cSet.call(this, at(t)); };
  // an impulse or a force at a world point (a ragdoll's hit): the point is shifted, the vector is not
  B.applyImpulseAtPoint = function (j, p, wake) { return raw.imp.call(this, j, at(p), wake); };
  B.addForceAtPoint = function (f, p, wake) { return raw.frc.call(this, f, at(p), wake); };
  // a body or a collider with no body made from a desc: its translation is a world position (a collider on a body is placed relative to it)
  const shifted = (d, f) => { const t = d.translation, x = t.x, z = t.z; t.x = x - ORIGIN.x; t.z = z - ORIGIN.z; try { return f(); } finally { t.x = x; t.z = z; } };
  W.createRigidBody = function (desc) { return shifted(desc, () => raw.mkBody.call(this, desc)); };
  W.createCollider = function (desc, parent) { return parent ? raw.mkCol.call(this, desc, parent) : shifted(desc, () => raw.mkCol.call(this, desc, parent)); };
  // a ray from a world position (the hit is given as a distance along it, which the shift does not change)
  const cast = (f) => function (ray, ...a) { const o = ray.origin, x = o.x, z = o.z; o.x = x - ORIGIN.x; o.z = z - ORIGIN.z; try { return f.call(this, ray, ...a); } finally { o.x = x; o.z = z; } };
  W.castRay = cast(raw.ray); W.castRayAndGetNormal = cast(raw.rayN);
  return raw;
}

// the origin moved to (ox, oz): every body and every collider without one shifted by the difference in the physics world (sleeping ones left asleep),
// so nothing moves in the world. Returns the number of bodies and colliders moved
export function rebase(world, ox, oz) {
  const dx = ox - ORIGIN.x, dz = oz - ORIGIN.z; if (!dx && !dz) return 0;
  let n = 0;
  const mv = (t) => { V.x = t.x - dx; V.y = t.y; V.z = t.z - dz; return V; };
  world.bodies.forEach((b) => { const t = raw.bTr.call(b), k = b.isKinematic(); raw.bSet.call(b, mv(t), false); if (k) raw.bNext.call(b, V); n++; });
  world.colliders.forEach((c) => { if (c.parent()) return; raw.cSet.call(c, mv(raw.cTr.call(c))); n++; });
  // the colliders on bodies follow their bodies only at the next step: moved now, so a ray or a read before it finds them where they are
  world.propagateModifiedBodyPositionsToColliders?.();
  ORIGIN.x = ox; ORIGIN.z = oz; ORIGIN.moves++;
  return n;
}

// keep the origin within KEEP metres of (x, z) on each axis: when it is not, it moves to the grid point nearest (x, z). Returns the bodies and
// colliders moved (0 when the origin stays)
export function followOrigin(world, x, z) {
  if (Math.abs(x - ORIGIN.x) <= KEEP && Math.abs(z - ORIGIN.z) <= KEEP) return 0;
  return rebase(world, Math.round(x / CELL) * CELL, Math.round(z / CELL) * CELL);
}

// a mesh's or a hull's points (x, y, z flat, world coordinates) about a centre of their own, for a collider placed at that centre: points 450 km
// out as 32-bit floats are 3 cm apart, about their centre they keep millimetres. Returns { P: Float32Array, x, z }
export function localPoints(W) {
  const n = W.length; if (!n) return { P: new Float32Array(0), x: 0, z: 0 };
  const x = Math.round(W[0]), z = Math.round(W[2]), P = new Float32Array(n);
  for (let i = 0; i < n; i += 3) { P[i] = W[i] - x; P[i + 1] = W[i + 1]; P[i + 2] = W[i + 2] - z; }
  return { P, x, z };
}
