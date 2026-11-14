import { drivetrain, torqueShare } from './carspecs.js';
import { tyreForces, SURF_MU, SURF_CRR } from './tyres.js';
import { installOrigin, followOrigin, localPoints } from './physorigin.js';
// Rapier-backed physics: fixed-step world, static city colliders, raycast-suspension rigid-body vehicles.
// RAPIER is injected so the same module can be unit-tested under Node.
export const PHYS = {
  dt: 1 / 60, gravity: -9.81, vehGravScale: 1, maxSub: 4,
  mass: 1300, rest: 0.34, radius: 0.35, connY: -0.12, bodyY: 0.78,
  // the drive train and the air (driveVehicle): wheel power over engine power, air density (kg/m^3), what the brakes reach of the tyres' grip
  // (ABS keeps a wheel just short of locking), the engine's drag with the throttle shut (m/s^2)
  eta: 0.85, rho: 1.2, absK: 0.97, engineBrake: 0.35,
  // a tyre's grip along its rolling direction peaks about 8 % above its side grip (the braking and traction curves of road tests: 1.0-1.1 g
  // under ABS where the same tyre corners at 0.9-1.0 g)
  longK: 1.08,
  // the springs per unit of the car's mass (createVehicle)
  springK: 15.1,
  // the tyres' side forces from their slip angles (tyres.js, EV-11); false gives back Rapier's own side friction
  tyres: true,
  // the driving aids (EV-11): steering held at the tyres' peak (see driveVehicle); the settings can turn them off
  assist: true,
  // the surface under a point (EV-13): set by the game to surface.js surfaceAt (x, z, y) -> index into surfMu / surfCrr; unset (the Node labs)
  // everything is asphalt unless a vehicle has testSurface
  surfaceAt: null, surfMu: SURF_MU, surfCrr: SURF_CRR,
};

export const GR = { STATIC: 1, VEH: 2, CHAR: 4, PROP: 8, OBJ: 16, GLASS: 32, RAG: 64, RAGL: 128 };
export const RAY_DEFAULT = 1 | 16 | 8 | 32;
export const grp = (mem, filt) => ((mem << 16) | filt) >>> 0;
const ALL = 0xffff;

export class Physics {
  constructor(R) {
    this.R = R; installOrigin(R);   // positions in and out of Rapier are world positions, the world itself kept near the player (EV-04)
    this.world = new R.World({ x: 0, y: PHYS.gravity, z: 0 });
    this.world.timestep = PHYS.dt;
    // rapier-compat's World.step() ends with mapNewSoftBodies(), which walks EVERY body and collider (thousands of JS callbacks, a fresh array
    // of all collider objects, a wasm call per collider) after each step - about a third of a MB of garbage and ~1.5 ms per step here. Everything this
    // game creates or removes goes through createCollider / createRigidBody / removeCollider / removeRigidBody, which keep the JS-side maps up to
    // date themselves, so the scan finds nothing: the step runs the physics pipeline only.
    const W = this.world, pipelineStep = W.step.bind(W);
    W.stepFull = pipelineStep;
    W.step = function (eventQueue, hooks) {
      this.physicsPipeline.step(this.gravity, this.integrationParameters, this.islands, this.broadPhase, this.narrowPhase, this.bodies, this.colliders, this.softBodies, this.impulseJoints, this.multibodyJoints, this.ccdSolver, eventQueue, hooks);
    };
    this.acc = 0;
    // render interpolation: steps run at a fixed 60 Hz, screens at 50..240 Hz. Moving bodies are drawn between their pose before and after the
    // last step (alpha = how far the clock is into the next one), so they glide instead of moving 0, 1 or 2 steps per displayed frame.
    this.stepNo = 0; this.alpha = 0;
    this.bodies = new Map();
    this.colRef = new Map();
    this.events = new R.EventQueue(true);
    this.onGlassHit = null;
  }
  // ground: tiles (very large single cuboids break the character shape-cast) with lake basins carved out
  initGround(waters = []) {
    const R = this.R, w = this.world, g = grp(GR.STATIC, ALL);
    const slab = (x0, z0, x1, z1) => { if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return; w.createCollider(R.ColliderDesc.cuboid((x1 - x0) / 2, 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, -2, (z0 + z1) / 2).setFriction(1.0).setRestitution(0).setCollisionGroups(g)); };
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const tx0 = i * 600 - 300, tx1 = tx0 + 600, tz0 = j * 600 - 300, tz1 = tz0 + 600;
      const lk = waters.find((L) => L.x0 >= tx0 && L.x1 <= tx1 && L.z0 >= tz0 && L.z1 <= tz1);
      if (!lk) { slab(tx0, tz0, tx1, tz1); continue; }
      slab(tx0, tz0, lk.x0, tz1); slab(lk.x1, tz0, tx1, tz1); slab(lk.x0, tz0, lk.x1, lk.z0); slab(lk.x0, lk.z1, lk.x1, tz1);
      const fy = lk.floor, sl = lk.slope, cx = (lk.x0 + lk.x1) / 2, cz = (lk.z0 + lk.z1) / 2;
      w.createCollider(R.ColliderDesc.cuboid((lk.x1 - lk.x0) / 2, 1, (lk.z1 - lk.z0) / 2).setTranslation(cx, fy - 1, cz).setFriction(1).setCollisionGroups(g));
      // four shore slopes (surface runs from ground level at the rim down to the basin floor)
      this.addRamp(cx, 0 + fy / 2 + 0.0, lk.z0 + sl / 2, (lk.x1 - lk.x0) / 2, 0.08, Math.hypot(sl, fy) / 2, fy, sl);
      this.addRamp(cx, fy / 2, lk.z1 - sl / 2, (lk.x1 - lk.x0) / 2, 0.08, Math.hypot(sl, fy) / 2, fy, -sl);
      this.addRamp(lk.x0 + sl / 2, fy / 2, cz, (lk.z1 - lk.z0) / 2, 0.08, Math.hypot(sl, fy) / 2, fy, sl, true);
      this.addRamp(lk.x1 - sl / 2, fy / 2, cz, (lk.z1 - lk.z0) / 2, 0.08, Math.hypot(sl, fy) / 2, fy, -sl, true);
    }
  }
  addBox(b) {
    const R = this.R, w = this.world;
    const y0 = b.y0 || 0, hh = (Math.min(b.h, 1100) - y0) / 2;
    if (hh <= 0) return;
    b.col = w.createCollider(R.ColliderDesc.cuboid((b.x1 - b.x0) / 2, hh, (b.z1 - b.z0) / 2).setTranslation((b.x0 + b.x1) / 2, y0 + hh, (b.z0 + b.z1) / 2).setFriction(0.4).setRestitution(0.15).setCollisionGroups(grp(b.tag === 'glass' ? GR.GLASS : b.tag === 'elev' ? GR.OBJ : GR.STATIC, ALL)).setActiveEvents(b.tag === 'glass' ? R.ActiveEvents.COLLISION_EVENTS : 0));
    this.colRef.set(b.col.handle, b);
  }
  // a static box turned about the vertical axis (the procedural buildings, WLD-24b); `ref` is what a ray that hits it reads back
  addYawBox(cx, cy, cz, hx, hy, hz, yaw, ref) {
    const R = this.R, col = this.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }).setFriction(0.4).setRestitution(0.15).setCollisionGroups(grp(GR.STATIC, ALL)));
    ref.col = col; this.colRef.set(col.handle, ref); return ref;
  }
  // a static convex solid from its corner points (x, y, z flat): one piece of a real building's outline (WLD-24h); null when the points are degenerate
  addHull(pts, ref) {
    const R = this.R, L = localPoints(pts), d = R.ColliderDesc.convexHull(L.P); if (!d) return null;   // about the hull's own centre (EV-04)
    const col = this.world.createCollider(d.setTranslation(L.x, 0, L.z).setFriction(0.4).setRestitution(0.15).setCollisionGroups(grp(GR.STATIC, ALL)));
    ref.col = col; this.colRef.set(col.handle, ref); return ref;
  }
  // static inclined slab (stairs). dz,dy: run/rise vector of the surface
  addRamp(cx, cy, cz, hx, hy, hz, dy, dz, alongX) {
    const al = Math.atan2(-dy, dz);
    let q = { x: Math.sin(al / 2), y: 0, z: 0, w: Math.cos(al / 2) };
    if (alongX) { // slope descending along +x: rotate the whole thing 90deg about Y
      const c = Math.SQRT1_2, qy = { x: 0, y: c, z: 0, w: c };
      q = { x: qy.w * q.x + qy.x * q.w + qy.y * q.z - qy.z * q.y, y: qy.w * q.y - qy.x * q.z + qy.y * q.w + qy.z * q.x, z: qy.w * q.z + qy.x * q.y - qy.y * q.x + qy.z * q.w, w: qy.w * q.w - qy.x * q.x - qy.y * q.y - qy.z * q.z };
    }
    const R = this.R;
    return this.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy - hy, cz).setRotation(q).setFriction(0.8).setCollisionGroups(grp(GR.STATIC, ALL)));
  }
  // a stair flight of n steps along z, from (za, ya) to (zb, yb), x0..x1 wide: walked as a ramp (the character glides up it), while the
  // collider keeps the steps so footY puts feet on the treads it is drawn with
  addStairs(x0, x1, za, zb, ya, yb, n) {
    const col = this.addRamp((x0 + x1) / 2, (ya + yb) / 2, (za + zb) / 2, (x1 - x0) / 2, 0.08, Math.hypot(zb - za, yb - ya) / 2, yb - ya, zb - za);
    col.steps = { za, zb, ya, yb, n };
    return col;
  }
  // CHR-06c: height of what a foot stands on at (x, z), looking down from y as far as `reach` (NaN over nothing); the surface normal is
  // left in this.footN (straight up on a stair's tread). The stair's steps, not its ramp; people, ragdolls and loose props are not ground
  footY(x, y, z, reach) {
    const h = this.world.castRayAndGetNormal(this._rayOf(x, y, z, 0, -1, 0), reach, true, undefined, grp(0xffff, GR.STATIC | GR.VEH | GR.OBJ | GR.GLASS));
    const n = this.footN || (this.footN = { x: 0, y: 1, z: 0 });
    if (!h) return NaN;
    const s = h.collider.steps;
    if (s) { const i = Math.min(s.n - 1, Math.max(0, Math.floor(((z - s.za) / (s.zb - s.za)) * s.n))); n.x = 0; n.y = 1; n.z = 0; return s.ya + ((s.yb - s.ya) * (i + 1)) / s.n; }
    n.x = h.normal.x; n.y = h.normal.y; n.z = h.normal.z;
    return y - h.timeOfImpact;
  }
  drainEvents() {
    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started || !this.onGlassHit) return;
      for (const [a, b] of [[h1, h2], [h2, h1]]) {
        const ref = this.colRef.get(a); if (!ref || ref.tag !== 'glass') continue;
        const col = this.world.getCollider(b), body = col && col.parent(); if (!body || body.isFixed()) continue;
        const v = body.linvel();
        this.onGlassHit(ref, Math.hypot(v.x, v.y, v.z), body);
      }
    });
  }
  removeBox(b) { if (b.col) { this.colRef.delete(b.col.handle); this.world.removeCollider(b.col, false); b.col = null; } }
  // Ray against the Rapier world. mask: GR bits to hit. Returns {t, ref, nx,ny,nz} or null
  // one Ray object reused for every query (it is only read during the call)
  _rayOf(ox, oy, oz, dx, dy, dz) {
    const r = this._ray || (this._ray = new this.R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })), o = r.origin, d = r.dir;
    o.x = ox; o.y = oy; o.z = oz; d.x = dx; d.y = dy; d.z = dz; return r;
  }
  // distance to the first hit or -1, without the normal or a result object (line-of-sight checks)
  rayT(ox, oy, oz, dx, dy, dz, max, mask = RAY_DEFAULT) {
    const h = this.world.castRay(this._rayOf(ox, oy, oz, dx, dy, dz), max, true, undefined, grp(0xffff, mask));
    return h ? h.timeOfImpact : -1;
  }
  ray(ox, oy, oz, dx, dy, dz, max, mask = RAY_DEFAULT) {
    const r = this._rayOf(ox, oy, oz, dx, dy, dz);
    const h = this.world.castRayAndGetNormal(r, max, true, undefined, grp(0xffff, mask));
    if (!h) return null;
    return { t: h.timeOfImpact, ref: this.colRef.get(h.collider.handle) || null, collider: h.collider, nx: h.normal.x, ny: h.normal.y, nz: h.normal.z };
  }
  addStatic(colliders) {
    const R = this.R, w = this.world;
    for (const b of colliders.boxes) this.addBox(b);
    colliders.sink = this;
    for (const c of colliders.circles) {
      const hh = Math.min(c.h, 12) / 2;
      w.createCollider(R.ColliderDesc.cylinder(hh, c.r).setTranslation(c.x, hh, c.z).setFriction(0.4).setRestitution(0.1).setCollisionGroups(grp(GR.STATIC, ALL)));
    }
  }
  // the physics world's origin kept near (x, z), the player or what the player drives (physorigin.js): called before the steps of a frame
  followOrigin(x, z) { return followOrigin(this.world, x, z); }
  // Fixed-step; calls pre(dt) before each step so callers can set wheel forces
  step(dt, pre, list = this.vehicles || []) {
    this.acc = Math.min(this.acc + dt, PHYS.dt * PHYS.maxSub);
    let n = 0;
    while (this.acc >= PHYS.dt) {
      for (const v of list) keepPose(v, this.stepNo + 1);
      pre?.(PHYS.dt);
      for (const v of list) v.ctrl?.updateVehicle(PHYS.dt, undefined, grp(GR.VEH, GR.STATIC | GR.PROP | GR.OBJ));
      this.world.step(this.events);
      this.stepNo++;
      this.drainEvents();
      for (const v of list) stabilize(v);
      this.acc -= PHYS.dt; n++;
    }
    this.alpha = this.acc / PHYS.dt;
    return n;
  }
  // Knockable street props (instanced bins): dynamic bodies synced to an InstancedMesh
  addProps(mesh, list, r = 0.32, hh = 0.45, mass = 28) {
    const R = this.R, w = this.world;
    this.props = { mesh, bodies: list.map((b) => {
      const body = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(b.x, hh + 0.01, b.z).setLinearDamping(0.3).setAngularDamping(0.6).setCcdEnabled(true));
      w.createCollider(R.ColliderDesc.cylinder(hh, r).setMass(mass).setFriction(0.6).setRestitution(0.35).setCollisionGroups(grp(GR.PROP, ALL)), body);
      body.sleep();
      return { body, hh, moved: false };
    }) };
  }
  syncProps(THREE) {
    const P = this.props; if (!P) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), off = new THREE.Vector3();
    let dirty = false;
    P.bodies.forEach((e, i) => {
      if (e.body.isSleeping() && !e.dirty) return;
      const t = e.body.translation(), r = e.body.rotation();
      q.set(r.x, r.y, r.z, r.w); off.set(0, -e.hh, 0).applyQuaternion(q); p.set(t.x + off.x, t.y + off.y, t.z + off.z);
      m.compose(p, q, one); P.mesh.setMatrixAt(i, m); dirty = true; e.dirty = !e.body.isSleeping();
    });
    if (dirty) P.mesh.instanceMatrix.needsUpdate = true;
  }
  createVehicle(spec, x, z, heading) {
    const R = this.R, w = this.world;
    const mass = PHYS.mass * spec.mass;
    const hx = spec.W / 2, hy = 0.42, hz = spec.L / 2;
    const q = { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
    const body = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, PHYS.bodyY, z).setRotation(q)
      .setLinearDamping(0).setAngularDamping(1.2).setCanSleep(true).setCcdEnabled(true).setGravityScale(PHYS.vehGravScale));   // the air's drag is driveVehicle's
    const col = w.createCollider(R.ColliderDesc.cuboid(hx * 0.98, hy, hz * 0.98).setTranslation(0, 0.12, 0).setMass(0.001).setFriction(0.25).setRestitution(0.18).setCollisionGroups(grp(GR.VEH, GR.STATIC | GR.VEH | GR.PROP | GR.OBJ | GR.GLASS | GR.RAG | GR.RAGL)), body);
    // low centre of mass + realistic inertia
    const ix = (mass / 12) * (4 * hy * hy + 4 * hz * hz) * 0.55, iy = (mass / 12) * (4 * hx * hx + 4 * hz * hz) * 0.7, iz = (mass / 12) * (4 * hx * hx + 4 * hy * hy) * 0.55;
    body.setAdditionalMassProperties(mass, { x: 0, y: -0.42, z: 0 }, { x: ix, y: iy, z: iz }, { x: 0, y: 0, z: 0, w: 1 });
    // Rapier sums the mass only at the next step: a car woken with a speed before it (the traffic start() puts back on its lanes) was driven by its
    // wheels against the collider's 1 g, flung at 400 m/s and wrecked on the first frame of every game
    body.recomputeMassPropertiesFromColliders();
    const ctrl = w.createVehicleController(body);
    const wb = spec.wb, tr = spec.W / 2 - 0.2;
    const pts = [[-tr, wb], [tr, wb], [-tr, -wb], [tr, -wb]]; // FL FR RL RR (x is chassis-right negative = left)
    pts.forEach(([px, pz]) => ctrl.addWheel({ x: px, y: PHYS.connY, z: pz }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, PHYS.rest, PHYS.radius));
    // springs per unit of the car's mass (Rapier multiplies by it): 4 x 15.1 gives the body a 1.24 Hz bounce, as on a road car, and the 16 cm of sag
    // the models are drawn with (it was 34 under a gravity of 22 m/s^2: the same sag, a 1.9 Hz bounce); the dampers about half of critical
    for (let i = 0; i < 4; i++) {
      ctrl.setWheelSuspensionStiffness(i, PHYS.springK);
      ctrl.setWheelSuspensionCompression(i, 1.75);
      ctrl.setWheelSuspensionRelaxation(i, 2.2);
      ctrl.setWheelMaxSuspensionTravel(i, 0.3);
      ctrl.setWheelMaxSuspensionForce(i, mass * 14);
      ctrl.setWheelFrictionSlip(i, spec.grip);
      ctrl.setWheelSideFrictionStiffness(i, PHYS.tyres && spec.peakDeg ? 0 : 1.0);   // the side force is tyres.js's (EV-11): Rapier's would hold the wheels on rails
    }
    const v = { body, col, ctrl, mass, spec };
    (this.vehicles || (this.vehicles = [])).push(v);
    this.bodies.set(body.handle, v);
    return v;
  }
  removeVehicle(v) {
    const i = (this.vehicles || []).indexOf(v); if (i >= 0) this.vehicles.splice(i, 1);
    this.bodies.delete(v.body.handle);
    if (v.ctrl) this.world.removeVehicleController?.(v.ctrl);
    this.world.removeRigidBody(v.body);
  }
}

// what is left of the tyres' grip on a wet road (wet: 0 dry, 1 rain, 1.4 storm; v: speed m/s): wet asphalt gives about 0.65-0.7 of the dry friction (braking
// distances grow by half in rain), and above ~80 km/h a film of water lifts the tread (aquaplaning) and takes up to a fifth more
export function wetGrip(wet, v) { const w = Math.max(0, Math.min(1.4, wet || 0)), rain = Math.min(1, w); return Math.max(0.4, 1 - 0.28 * rain - 0.12 * Math.max(0, w - 1) / 0.4 - rain * 0.2 * Math.max(0, Math.min(1, (v - 22) / 40))); }

// Apply driver inputs to a vehicle physics handle, with the forces of a real car (spec: power kW, accel = the launch limit m/s^2, maxSpeed = the
// governor m/s, grip = the tyres' friction coefficient, cda = drag area m^2, crr = rolling resistance). Rapier's engine force is a force (N) and its
// brake the largest rolling-friction impulse a wheel takes in one step (N s), so the brakes are written as impulses
export function driveVehicle(v, { throttle, brake, steer, hand, speedFwd, maxSteer, dead, parked, wet = 0, health = 1 }) {
  const { ctrl, mass, spec, body } = v, dt = PHYS.dt, g = -PHYS.gravity, wg0 = wet > 0 ? wetGrip(wet, Math.abs(speedFwd)) : 1;   // wg0: the wet road's share of the tyres' grip
  const sf = surfaces(v), wg = wg0 * Math.min(sf[0], sf[1], sf[2], sf[3]);   // the surface under the worst wheel limits the launch, the brakes' ABS and the steering assist
  const hk = health < 0.5 ? 0.5 + health : 1;   // a wreck limps: under half its strength the engine gives up to half its power and speed (a hit engine, a bent frame)
  const aF = Math.abs(speedFwd), P = (spec.power ?? 120) * 1000 * PHYS.eta * hk;
  // the engine: the launch limit up to the speed where the power takes over, then power over speed; nothing past the governor
  const pull = (lim) => Math.min(mass * Math.min(spec.accel * hk, spec.grip * wg * g), P / Math.max(aF, 1)) * (aF < lim * hk ? 1 : 0) / 4;   // the tyres carry no more than their grip: a wet road limits the launch
  const brakeImp = mass * g * spec.grip * PHYS.longK * wg * PHYS.absK * dt / 4;   // per wheel: the tyre's grip, which the brakes reach with ABS
  let engine = 0, brk = 0;
  const D = drivetrain(spec, PHYS.radius), grip4 = mass * spec.grip * wg * g * 0.96 / 4;   // grip4: what one tyre carries forward (a quarter of the weight, a little short of the peak: a launch spins the tyres past it)
  if (D) gearbox(v, D, speedFwd, dead ? 0 : throttle, dt);
  const ax = D ? (D.drive === 'A' ? 1 : 2) : 1;   // the driven wheels share the engine: two of them take twice a quarter each
  if (!dead) {
    if (throttle > 0) {
      if (speedFwd < -1.5) brk = brakeImp * throttle;
      else engine = (D ? Math.min(grip4, wheelForce(v, D, throttle) * ax * hk) * (aF < spec.maxSpeed * hk ? 1 : 0) : pull(spec.maxSpeed)) * (D ? 1 : throttle);
    }
    if (brake > 0) {
      if (speedFwd > 0.8) brk += brakeImp * brake;
      else engine = D ? -Math.min(grip4, D.peak * torqueShare(D.curve, D.launch) * D.gears[0] * D.final * PHYS.eta / D.r / 4 * ax) * 0.5 * brake * (aF < 9 ? 1 : 0) : -pull(9) * 0.5 * brake;   // reverse: first gear's ratio, up to 32 km/h
      if (D && speedFwd <= 0.8) v.gear = -1;
    }
  } else brk = brakeImp * (parked ? 1 : 0.25);
  // throttle shut: the engine drags the car down (and holds it at a standstill)
  if (!throttle && !brake && !dead) brk += mass * PHYS.engineBrake * dt / 4 * (aF > 0.2 ? 1 : 12);
  // the air and the tyres' rolling resistance, against the motion
  if (body) {
    const lv = body.linvel(), sp = Math.hypot(lv.x, lv.z);
    if (sp > 0.05) { const F = 0.5 * PHYS.rho * (spec.cda ?? 0.7) * sp * sp + (spec.crr ?? 0.011) * (v.crrK || 1) * mass * g, k = Math.min(F * dt, mass * sp * 0.5) / sp; body.applyImpulse({ x: -lv.x * k, y: 0, z: -lv.z * k }, true); }
  }
  // the steering assist (EV-11, PHYS.assist): past the angle that turns the car at its grip with the front tyres at their peak slip, more lock only
  // scrubs the front tyres (the plough of an understeering car), so the wheel stops there; off, the driver has the whole rack
  const lim = PHYS.assist && PHYS.tyres && spec.peakDeg ? (spec.wb * 2) * spec.grip * wg * g / Math.max(aF * aF, 1) + (spec.peakDeg || 7) * 0.0175 * 1.15 : Infinity;
  const steerAng = Math.max(-lim, Math.min(lim, steer * maxSteer));
  for (let i = 0; i < 4; i++) {
    const driven = !D || D.drive === 'A' || (D.drive === 'F') === (i < 2);   // front-, rear- or all-wheel drive (EV-12)
    ctrl.setWheelEngineForce(i, driven ? engine : 0);
    ctrl.setWheelBrake(i, i >= 2 && hand ? brakeImp * 1.4 + brk * 0.3 : brk);
    ctrl.setWheelSteering(i, i < 2 ? -steerAng : 0);
    // handbrake lets the rear break traction -> drift
    ctrl.setWheelFrictionSlip(i, spec.grip * PHYS.longK * wg0 * sf[i] * (i >= 2 && hand ? (PHYS.handSlip ?? 0.5) : 1));
    MU[i] = spec.grip * wg0 * sf[i] * (i >= 2 && hand ? (PHYS.handSlip ?? 0.5) : 1);
    FX[i] = (driven ? Math.abs(engine) : 0) + (i >= 2 && hand ? brakeImp * 1.4 + brk * 0.3 : brk) / dt;   // what the drive and the brakes take of the tyre's grip
  }
  if (PHYS.tyres && spec.peakDeg && body) tyreForces(v, dt, MU, FX, -0.42);
}
const MU = new Float64Array(4), FX = new Float64Array(4), ONE = new Float64Array([1, 1, 1, 1]);
// each wheel's share of dry asphalt's grip from the surface under it (EV-13), looked up four times a second (or at once when testSurface is set);
// sets v.surf (the surface indices) and v.crrK (the mean rolling resistance multiple)
function surfaces(v) {
  const S = PHYS.surfaceAt, ts = v.testSurface ?? v.spec.testSurface;
  if (ts == null && !S) return ONE;
  const f = v.surfK || (v.surfK = new Float64Array([1, 1, 1, 1])), su = v.surf || (v.surf = new Int8Array(4));
  if (ts != null) { su.fill(ts); f.fill(PHYS.surfMu[ts] ?? 1); v.crrK = PHYS.surfCrr[ts] ?? 1; return f; }
  if ((v.surfT = (v.surfT || 0) - PHYS.dt) > 0) return f;
  v.surfT = 0.25;
  const t = v.body.translation(), q = v.body.rotation(), fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y), l = Math.hypot(fx, fz) || 1, hx = fx / l, hz = fz / l;
  const wb = v.spec.wb ?? 1.4, tr = (v.spec.W ?? 1.8) / 2 - 0.2, y = t.y - 0.6;
  let crr = 0;
  for (let i = 0; i < 4; i++) {
    const a = i < 2 ? wb : -wb, s = i % 2 ? tr : -tr, x = t.x + hx * a - hz * s, z = t.z + hz * a + hx * s;
    su[i] = S(x, z, y); f[i] = PHYS.surfMu[su[i]] ?? 1; crr += (PHYS.surfCrr[su[i]] ?? 1) / 4;
  }
  v.crrK = crr; return f;
}

// The automatic gearbox (EV-12): picks the gear from the revs and the throttle (up near the redline at full throttle, early when cruising; down
// when the revs sag or the driver floors it), cuts the drive for the shift time, and keeps the engine's revs (v.rpm, for the sound and the HUD)
function gearbox(v, D, vf, throttle, dt) {
  if (v.gear == null || v.gear < 1) { v.gear = 1; v.shiftT = 0; v.held = 1; v.rpm = v.rpm || D.idle; }
  const n = D.gears.length, w = Math.abs(vf) / D.r, k = D.final * 30 / Math.PI, at = (gi) => w * D.gears[gi - 1] * k;
  v.held += dt; if (v.shiftT > 0) v.shiftT -= dt;
  else if (v.held > 0.45) {
    if (v.gear < n && at(v.gear) > D.redline * (0.42 + 0.53 * throttle)) { v.gear++; v.shiftT = D.shift; v.held = 0; }
    else if (v.gear > 1 && at(v.gear) < D.redline * (0.22 + 0.3 * throttle) && at(v.gear - 1) < D.redline * 0.9) { v.gear--; v.shiftT = D.shift * 0.6; v.held = 0; }
  }
  // the clutch slips in first gear: the engine holds its launch revs until the wheels catch up
  const wheel = at(v.gear), launch = v.gear === 1 ? D.idle + (D.launch * D.redline - D.idle) * throttle : D.idle;
  v.rpmT = Math.max(wheel, launch); v.rpm += (v.rpmT - v.rpm) * Math.min(1, dt * (v.shiftT > 0 ? 9 : 14)); v.rpmN = v.rpm / D.redline;
}
// the force at one wheel (N) from the engine's torque at its revs through the gear, the final drive and the drive train's losses; nothing while
// the gearbox shifts or past the rev limiter
function wheelForce(v, D, throttle) {
  if (v.shiftT > 0 || v.rpmT >= D.redline) return 0;
  return D.peak * torqueShare(D.curve, v.rpmT / D.redline) * throttle * D.gears[v.gear - 1] * D.final * PHYS.eta / D.r / 4;
}

// Arcade stabiliser: bleed roll/pitch angular velocity so cars tip over only after violent hits
// pose of a body before the step numbered `no` (pv.prev: x y z qx qy qz qw); drawPose blends it with the current one
function keepPose(pv, no) {
  const t = pv.body.translation(), r = pv.body.rotation(), p = pv.prev || (pv.prev = new Float64Array(7));
  p[0] = t.x; p[1] = t.y; p[2] = t.z; p[3] = r.x; p[4] = r.y; p[5] = r.z; p[6] = r.w; pv.prevNo = no;
}
export { keepPose };
function stabilize(v) {
  if (v.spec.craft) return;
  const b = v.body, q = b.rotation(), w = b.angvel();
  const ux = 2 * (q.x * q.y - q.w * q.z), uy = 1 - 2 * (q.x * q.x + q.z * q.z), uz = 2 * (q.y * q.z + q.w * q.x);
  const wy = w.x * ux + w.y * uy + w.z * uz; // yaw component (about chassis up)
  let on = 0; const c = v.ctrl; if (c) for (let i = 0; i < c.numWheels(); i++) if (c.wheelIsInContact(i)) on++;
  const k = on < 2 ? 0.995 : uy > 0.5 ? 0.82 : 0.97; // the tyres and dampers settle roll and pitch on the ground; in the air nothing does (a car off a ramp or a cliff tips and tumbles)
  b.setAngvel({ x: ux * wy + (w.x - ux * wy) * k, y: uy * wy + (w.y - uy * wy) * k, z: uz * wy + (w.z - uz * wy) * k }, true);
  v.up = uy;
}
