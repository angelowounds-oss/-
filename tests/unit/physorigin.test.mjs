// The physics world's floating origin (EV-04, src/physorigin.js) on the game's Physics under Node, at Jeju's coordinates (x -45 km, z 452 km):
// a slow body keeps its motion (without the origin a 32-bit position 452 km out has a step of 3 cm and a body at 0.5 m/s does not move at all),
// bodies and colliders read back the same world positions across a move of the origin, a ray from a world point hits where it should, an
// impulse at a body's centre turns nothing, a resting box stays still, and a car driven straight 10 s goes the same way it does at the capital.
// ORIGIN is one per module (the game has one world): the cases without the origin run first, while it is still at 0.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Physics, driveVehicle, PHYS, GR, grp } from '../../src/physics.js';
import { ORIGIN, followOrigin, localPoints } from '../../src/physorigin.js';
import { CAR_SPECS } from '../../src/carspecs.js';

const req = createRequire(new URL('../../build/package.json', import.meta.url));
const RAPIER = (await import(pathToFileURL(req.resolve('@dimforge/rapier3d-compat')).href)).default;
await RAPIER.init();
const R = RAPIER, X = -45000, Z = 451766, STATIC = grp(GR.STATIC, 0xffff), bad = [], m = {};
const r3 = (v) => Math.round(v * 1000) / 1000;

// a world with a flat slab (top at y 0) of 2 hw x 2 hl metres centred on (cx, cz), frictionless when slick
function world(cx, cz, hw = 200, hl = 200, slick = false) {
  const P = new Physics(R);
  P.world.createCollider(R.ColliderDesc.cuboid(hw, 1, hl).setTranslation(cx, -1, cz).setFriction(slick ? 0 : 1).setCollisionGroups(STATIC));
  return P;
}
// a ball rolling-free (no friction anywhere) at 0.5 m/s along z for 2 s: how far it went
function slide(cx, cz, follow) {
  const P = world(cx, cz, 50, 50, true), b = P.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(cx, 0.3, cz).setLinvel(0, 0, 0.5).setCanSleep(false));
  P.world.createCollider(R.ColliderDesc.ball(0.3).setFriction(0).setCollisionGroups(grp(GR.OBJ, 0xffff)), b);
  const z0 = b.translation().z;
  for (let i = 0; i < 120; i++) { if (follow) P.followOrigin(cx, cz); P.step(PHYS.dt); }
  return b.translation().z - z0;
}
// a sedan full throttle, wheel straight, 10 s from (cx, cz) heading +z: the distance and how far it strayed sideways
function drive(cx, cz, follow) {
  const P = world(cx, cz + 450, 40, 500), v = P.createVehicle({ ...CAR_SPECS.sedan }, cx, cz, 0), b = v.body;
  let side = 0;
  for (let i = 0; i < 600; i++) {
    const t = b.translation(); if (follow) P.followOrigin(t.x, t.z);
    P.step(PHYS.dt, () => driveVehicle(v, { throttle: 1, brake: 0, steer: 0, maxSteer: 0.5, hand: false, speedFwd: b.linvel().z, dead: false, parked: false }), [v]);
    side = Math.max(side, Math.abs(b.translation().x - cx));
  }
  const t = b.translation();
  return { dist: r3(t.z - cz), side: r3(side), y: r3(t.y) };
}

// ---- without the origin (it is at 0): the capital's numbers, and what 452 km does to them
m.slideCapital = r3(slide(0, 0, false));
m.slideJejuRaw = r3(slide(X, Z, false));
m.driveCapital = drive(0, 0, false);
m.driveJejuRaw = drive(X, Z, false);
if (Math.abs(m.slideCapital - 1) > 0.02) bad.push(['slide at the capital', m.slideCapital]);
if (ORIGIN.x || ORIGIN.z) bad.push(['the origin moved without followOrigin', ORIGIN.x, ORIGIN.z]);

// ---- with it
m.slideJeju = r3(slide(X, Z, true));
if (Math.abs(m.slideJeju - m.slideCapital) > 0.02) bad.push(['slide at Jeju with the origin', m.slideJeju, 'capital', m.slideCapital]);
if (Math.abs(ORIGIN.x - X) > 4096 || Math.abs(ORIGIN.z - Z) > 4096) bad.push(['origin not near Jeju', ORIGIN.x, ORIGIN.z]);
m.driveJeju = drive(X, Z, true);
if (Math.abs(m.driveJeju.dist - m.driveCapital.dist) > Math.max(0.5, m.driveCapital.dist * 0.01)) bad.push(['drive distance Jeju vs capital', m.driveJeju.dist, m.driveCapital.dist]);
if (m.driveJeju.side > m.driveCapital.side + 0.05) bad.push(['drive strays sideways at Jeju', m.driveJeju.side, 'capital', m.driveCapital.side]);

// ---- positions across moves of the origin: a dynamic body, a kinematic one, a collider on its own, one on a body
{
  const P = world(X, Z), w = P.world;
  const A = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(X + 10.5, 5, Z + 3.25).setGravityScale(0)); w.createCollider(R.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(0, 0, 1), A);
  const K = w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(X + 1.5, 2, Z + 1.5));
  const C = w.createCollider(R.ColliderDesc.cuboid(1, 1, 1).setTranslation(X - 20.5, 1, Z + 7.75).setCollisionGroups(STATIC));
  const want = () => [A.translation(), K.translation(), C.translation(), A.collider(0).translation()].map((t) => [t.x, t.y, t.z]);
  const before = want(), err = (now) => Math.max(...now.flatMap((p, i) => p.map((v, k) => Math.abs(v - before[i][k]))));
  let worst = 0;
  for (const [ox, oz] of [[X + 9000, Z - 7000], [X - 50000, Z + 3000], [X, Z]]) {
    P.followOrigin(ox, oz); worst = Math.max(worst, err(want()));
    // the kinematic body's target follows the shift too: a step leaves it where it was
    P.step(PHYS.dt); worst = Math.max(worst, err(want()));
  }
  m.moves = ORIGIN.moves; m.posErr = worst;
  if (worst > 0.002) bad.push(['positions change across moves of the origin', worst]);
  // a ray from a world point down onto the slab and onto the lone collider (top at y 2)
  const ray = new R.Ray({ x: X + 5, y: 10, z: Z + 5 }, { x: 0, y: -1, z: 0 }), h = w.castRay(ray, 50, true, undefined, STATIC);
  const ray2 = new R.Ray({ x: X - 20.5, y: 10, z: Z + 7.75 }, { x: 0, y: -1, z: 0 }), h2 = w.castRayAndGetNormal(ray2, 50, true, undefined, STATIC);
  m.rayT = h ? r3(h.timeOfImpact) : null; m.rayT2 = h2 ? r3(h2.timeOfImpact) : null;
  if (!h || Math.abs(h.timeOfImpact - 10) > 0.002) bad.push(['ray onto the slab', m.rayT]);
  if (!h2 || Math.abs(h2.timeOfImpact - 8) > 0.002 || h2.normal.y < 0.99) bad.push(['ray onto the lone collider', m.rayT2]);
  if (ray.origin.x !== X + 5 || ray.origin.z !== Z + 5) bad.push(['the ray was left shifted']);
  // an impulse at the body's own centre of mass turns nothing (a point left in world coordinates would be 450 km off and spin it)
  const c = A.worldCom(); A.applyImpulseAtPoint({ x: 0, y: 0, z: 10 }, { x: c.x + ORIGIN.x, y: c.y, z: c.z + ORIGIN.z }, true);
  const av = A.angvel(); m.spin = r3(Math.hypot(av.x, av.y, av.z));
  if (m.spin > 0.01) bad.push(['impulse at the centre spins the body', m.spin]);
}

// ---- a box at rest on the slab at Jeju for 3 s: how far it creeps
{
  const P = world(X, Z), b = P.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(X + 0.5, 0.5, Z + 0.5));
  P.world.createCollider(R.ColliderDesc.cuboid(0.5, 0.5, 0.5).setCollisionGroups(grp(GR.OBJ, 0xffff)), b);
  for (let i = 0; i < 60; i++) { P.followOrigin(X, Z); P.step(PHYS.dt); }
  const t0 = b.translation(); let creep = 0;
  for (let i = 0; i < 180; i++) { P.followOrigin(X, Z); P.step(PHYS.dt); const t = b.translation(); creep = Math.max(creep, Math.hypot(t.x - t0.x, t.y - t0.y, t.z - t0.z)); }
  m.restCreep = r3(creep);
  if (creep > 0.002) bad.push(['a resting box creeps', creep]);
}

// ---- localPoints: points about their own centre, exact to f32 there
{
  const W = new Float64Array([X + 0.123, 1.5, Z + 0.456, X + 30.789, 2.25, Z - 12.001]), L = localPoints(W);
  const e = Math.max(...[0, 3].map((i) => Math.max(Math.abs(L.P[i] + L.x - W[i]), Math.abs(L.P[i + 2] + L.z - W[i + 2]))));
  m.localErr = e;
  if (e > 1e-5 || L.P[1] !== 1.5) bad.push(['localPoints', e]);
  if (localPoints([]).P.length) bad.push(['localPoints of nothing']);
}
// the origin's grid: followOrigin does nothing within KEEP of the origin
if (followOrigin({ bodies: { forEach() { bad.push(['moved within KEEP']); } }, colliders: { forEach() {} } }, ORIGIN.x + 3000, ORIGIN.z - 3000) !== 0) bad.push(['followOrigin moved within KEEP']);

console.log('RESULT ' + JSON.stringify({ test: 'physorigin', pass: !bad.length, metrics: m, note: bad.slice(0, 6).map((b) => b.join(' ')).join(' | ') }));
process.exit(bad.length ? 1 : 0);
