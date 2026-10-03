// Rapier-backed physics: fixed-step world, static city colliders, raycast-suspension rigid-body vehicles.
// RAPIER is injected so the same module can be unit-tested under Node.
export const PHYS = {
  dt: 1 / 60, gravity: -22, maxSub: 4,
  mass: 1300, rest: 0.34, radius: 0.35, connY: -0.12, bodyY: 0.78,
};

export class Physics {
  constructor(R) {
    this.R = R;
    this.world = new R.World({ x: 0, y: PHYS.gravity, z: 0 });
    this.world.timestep = PHYS.dt;
    this.acc = 0;
    this.bodies = new Map();
    const g = this.world.createCollider(R.ColliderDesc.cuboid(2000, 2, 2000).setTranslation(0, -2, 0).setFriction(1.0).setRestitution(0));
    this.ground = g;
  }
  addStatic(colliders) {
    const R = this.R, w = this.world;
    for (const b of colliders.boxes) {
      const hx = (b.x1 - b.x0) / 2, hz = (b.z1 - b.z0) / 2, hh = Math.min(b.h, 400) / 2;
      w.createCollider(R.ColliderDesc.cuboid(hx, hh, hz).setTranslation((b.x0 + b.x1) / 2, hh, (b.z0 + b.z1) / 2).setFriction(0.4).setRestitution(0.15));
    }
    for (const c of colliders.circles) {
      const hh = Math.min(c.h, 12) / 2;
      w.createCollider(R.ColliderDesc.cylinder(hh, c.r).setTranslation(c.x, hh, c.z).setFriction(0.4).setRestitution(0.1));
    }
  }
  // Fixed-step; calls pre(dt) before each step so callers can set wheel forces
  step(dt, pre, list = this.vehicles || []) {
    this.acc = Math.min(this.acc + dt, PHYS.dt * PHYS.maxSub);
    let n = 0;
    while (this.acc >= PHYS.dt) {
      pre?.(PHYS.dt);
      for (const v of list) v.ctrl.updateVehicle(PHYS.dt);
      this.world.step();
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
      w.createCollider(R.ColliderDesc.cylinder(hh, r).setMass(mass).setFriction(0.6).setRestitution(0.35), body);
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
      .setLinearDamping(0.04).setAngularDamping(1.2).setCanSleep(true).setCcdEnabled(true));
    const col = w.createCollider(R.ColliderDesc.cuboid(hx * 0.98, hy, hz * 0.98).setTranslation(0, 0.12, 0).setMass(0.001).setFriction(0.25).setRestitution(0.18), body);
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
    this.world.removeVehicleController?.(v.ctrl);
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
  const b = v.body, q = b.rotation(), w = b.angvel();
  const fx = 2 * (q.x * q.z + q.w * q.y), fy = 2 * (q.y * q.z - q.w * q.x), fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  const ux = 2 * (q.x * q.y - q.w * q.z), uy = 1 - 2 * (q.x * q.x + q.z * q.z), uz = 2 * (q.y * q.z + q.w * q.x);
  const wy = w.x * ux + w.y * uy + w.z * uz; // yaw component (about chassis up)
  const k = uy > 0.5 ? 0.82 : 0.97; // strong damping while mostly upright
  b.setAngvel({ x: ux * wy + (w.x - ux * wy) * k, y: uy * wy + (w.y - uy * wy) * k, z: uz * wy + (w.z - uz * wy) * k }, true);
  v.up = uy;
}
