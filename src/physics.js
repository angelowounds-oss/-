// Rapier-backed physics: fixed-step world, static city colliders, raycast-suspension rigid-body vehicles.
// RAPIER is injected so the same module can be unit-tested under Node.
export const PHYS = {
  dt: 1 / 60, gravity: -9.81, vehGravScale: 22 / 9.81, maxSub: 4,
  mass: 1300, rest: 0.34, radius: 0.35, connY: -0.12, bodyY: 0.78,
};

export const GR = { STATIC: 1, VEH: 2, CHAR: 4, PROP: 8, OBJ: 16, GLASS: 32 };
export const RAY_DEFAULT = 1 | 16 | 8 | 32;
export const grp = (mem, filt) => ((mem << 16) | filt) >>> 0;
const ALL = 0xffff;

export class Physics {
  constructor(R) {
    this.R = R;
    this.world = new R.World({ x: 0, y: PHYS.gravity, z: 0 });
    this.world.timestep = PHYS.dt;
    this.acc = 0;
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
    const y0 = b.y0 || 0, hh = (Math.min(b.h, 400) - y0) / 2;
    if (hh <= 0) return;
    b.col = w.createCollider(R.ColliderDesc.cuboid((b.x1 - b.x0) / 2, hh, (b.z1 - b.z0) / 2).setTranslation((b.x0 + b.x1) / 2, y0 + hh, (b.z0 + b.z1) / 2).setFriction(0.4).setRestitution(0.15).setCollisionGroups(grp(b.tag === 'glass' ? GR.GLASS : b.tag === 'elev' ? GR.OBJ : GR.STATIC, ALL)).setActiveEvents(b.tag === 'glass' ? R.ActiveEvents.COLLISION_EVENTS : 0));
    this.colRef.set(b.col.handle, b);
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
  ray(ox, oy, oz, dx, dy, dz, max, mask = RAY_DEFAULT) {
    const r = new this.R.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
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
  // Fixed-step; calls pre(dt) before each step so callers can set wheel forces
  step(dt, pre, list = this.vehicles || []) {
    this.acc = Math.min(this.acc + dt, PHYS.dt * PHYS.maxSub);
    let n = 0;
    while (this.acc >= PHYS.dt) {
      pre?.(PHYS.dt);
      for (const v of list) v.ctrl?.updateVehicle(PHYS.dt, undefined, grp(GR.VEH, GR.STATIC | GR.PROP | GR.OBJ));
      this.world.step(this.events);
      this.drainEvents();
      for (const v of list) stabilize(v);
      this.acc -= PHYS.dt; n++;
    }
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
      .setLinearDamping(0.04).setAngularDamping(1.2).setCanSleep(true).setCcdEnabled(true).setGravityScale(PHYS.vehGravScale));
    const col = w.createCollider(R.ColliderDesc.cuboid(hx * 0.98, hy, hz * 0.98).setTranslation(0, 0.12, 0).setMass(0.001).setFriction(0.25).setRestitution(0.18).setCollisionGroups(grp(GR.VEH, GR.STATIC | GR.VEH | GR.PROP | GR.OBJ | GR.GLASS)), body);
    // low centre of mass + realistic inertia
    const ix = (mass / 12) * (4 * hy * hy + 4 * hz * hz) * 0.55, iy = (mass / 12) * (4 * hx * hx + 4 * hz * hz) * 0.7, iz = (mass / 12) * (4 * hx * hx + 4 * hy * hy) * 0.55;
    body.setAdditionalMassProperties(mass, { x: 0, y: -0.42, z: 0 }, { x: ix, y: iy, z: iz }, { x: 0, y: 0, z: 0, w: 1 });
    const ctrl = w.createVehicleController(body);
    const wb = spec.wb, tr = spec.W / 2 - 0.2;
    const pts = [[-tr, wb], [tr, wb], [-tr, -wb], [tr, -wb]]; // FL FR RL RR (x is chassis-right negative = left)
    pts.forEach(([px, pz]) => ctrl.addWheel({ x: px, y: PHYS.connY, z: pz }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, PHYS.rest, PHYS.radius));
    for (let i = 0; i < 4; i++) {
      ctrl.setWheelSuspensionStiffness(i, 34);
      ctrl.setWheelSuspensionCompression(i, 2.4);
      ctrl.setWheelSuspensionRelaxation(i, 3.0);
      ctrl.setWheelMaxSuspensionTravel(i, 0.3);
      ctrl.setWheelMaxSuspensionForce(i, mass * 14);
      ctrl.setWheelFrictionSlip(i, spec.grip * 0.75);
      ctrl.setWheelSideFrictionStiffness(i, 1.0);
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

// Apply driver inputs to a vehicle physics handle
export function driveVehicle(v, { throttle, brake, steer, hand, speedFwd, maxSteer, dead, parked }) {
  const { ctrl, mass, spec } = v;
  const aF = Math.abs(speedFwd);
  // engine: forward torque falls off toward top speed
  let engine = 0, brk = 0;
  const wheelsDriven = 4;
  if (!dead) {
    if (throttle > 0) {
      if (speedFwd < -1.5) brk = mass * 0.4 / 4 * throttle;
      else engine = (mass * spec.accel * throttle * Math.max(0, 1 - Math.max(speedFwd, 0) / spec.maxSpeed)) / wheelsDriven;
    }
    if (brake > 0) {
      if (speedFwd > 0.8) brk += mass * (PHYS.brakeK ?? 0.4) / 4 * brake;
      else engine = -(mass * spec.accel * 0.55 * brake * Math.max(0, 1 - Math.max(-speedFwd, 0) / (spec.maxSpeed * 0.28))) / wheelsDriven;
    }
  } else brk = mass * (parked ? 1.2 : 0.3);
  
  if (!throttle && !brake && !dead) brk += mass * 0.012 / 4 * (aF > 0.2 ? 1 : 12);
  const steerAng = steer * maxSteer;
  for (let i = 0; i < 4; i++) {
    ctrl.setWheelEngineForce(i, engine);
    ctrl.setWheelBrake(i, i >= 2 && hand ? mass * 0.3 / 4 + brk * 0.3 : brk);
    ctrl.setWheelSteering(i, i < 2 ? -steerAng : 0);
    // handbrake lets the rear break traction -> drift
    ctrl.setWheelFrictionSlip(i, spec.grip * 0.75 * (i >= 2 && hand ? (PHYS.handSlip ?? 0.5) : 1));
  }
}

// Arcade stabiliser: bleed roll/pitch angular velocity so cars tip over only after violent hits
function stabilize(v) {
  if (v.spec.craft) return;
  const b = v.body, q = b.rotation(), w = b.angvel();
  const fx = 2 * (q.x * q.z + q.w * q.y), fy = 2 * (q.y * q.z - q.w * q.x), fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  const ux = 2 * (q.x * q.y - q.w * q.z), uy = 1 - 2 * (q.x * q.x + q.z * q.z), uz = 2 * (q.y * q.z + q.w * q.x);
  const wy = w.x * ux + w.y * uy + w.z * uz; // yaw component (about chassis up)
  const k = uy > 0.5 ? 0.82 : 0.97; // strong damping while mostly upright
  b.setAngvel({ x: ux * wy + (w.x - ux * wy) * k, y: uy * wy + (w.y - uy * wy) * k, z: uz * wy + (w.z - uz * wy) * k }, true);
  v.up = uy;
}
