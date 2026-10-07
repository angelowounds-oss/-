import { GR, grp } from './physics.js';

// Capsule character on Rapier's kinematic controller: real 3D walking (stairs, ramps, rooftops, car roofs).
export class Character {
  constructor(phys, x, y, z, { radius = 0.36, height = 1.78 } = {}) {
    const R = phys.R, w = phys.world;
    this.phys = phys; this.r = radius; this.h = height;
    this.body = w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + 0.06 + height / 2, z));
    const half = (height - radius * 2) / 2;
    this.col = w.createCollider(R.ColliderDesc.capsule(half, radius).setFriction(0).setCollisionGroups(grp(GR.CHAR, GR.STATIC | GR.PROP | GR.OBJ | GR.GLASS)), this.body);
    const c = this.ctrl = w.createCharacterController(0.03);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setSlideEnabled(true);
    c.enableAutostep(0.42, 0.18, true);
        c.setMaxSlopeClimbAngle(52 * Math.PI / 180);
    c.setMinSlopeSlideAngle(62 * Math.PI / 180);
    c.setApplyImpulsesToDynamicBodies(true);
    c.setCharacterMass(75);
    y += 0.06; this.x = x; this.y = y; this.z = z; this.vy = 0; this.grounded = true; this.fallSpeed = 0; this.airT = 0; this.peakVy = 0;
    this.query = grp(GR.CHAR, GR.STATIC | GR.PROP | GR.OBJ | GR.GLASS | GR.VEH);
    this.pred = (col) => {
      const p = col.parent(); if (!p) return true;
      const v = phys.bodies.get(p.handle);
      if (!v) return true;
      const lv = p.linvel(); return Math.hypot(lv.x, lv.z) < 3;
    };
    this.platformDy = 0;
  }
  teleport(x, y, z) {
    y += 0.06; this.x = x; this.y = y; this.z = z; this.vy = 0; this.airT = 0; this.peakVy = 0;
    this.body.setTranslation({ x, y: y + this.h / 2, z }, true);
  }
  // returns landing impact speed (>0) on the frame we land
  // gravity 9.81 m/s^2 with quadratic air drag: a falling body tops out near 55 m/s (human terminal velocity)
  move(dt, vx, vz, jump = 0, gravity = 9.81) {
    if (jump && this.grounded) { this.vy = jump; this.grounded = false; }
    if (!this.grounded) { this.vy -= gravity * dt; this.vy -= Math.sign(this.vy) * this.vy * this.vy * (gravity / (55 * 55)) * dt; this.airT += dt; this.peakVy = Math.min(this.peakVy, this.vy); }
    else { this.vy = -2; this.airT = 0; this.peakVy = 0; }
    const prevVy = this.vy;
    const dx = vx * dt, dy = this.vy * dt, dz = vz * dt;
    this.ctrl.computeColliderMovement(this.col, { x: dx, y: dy, z: dz }, undefined, this.query, this.pred);
    const m = this.ctrl.computedMovement();
    this.x += m.x; this.y += m.y; this.z += m.z;
    const was = this.grounded;
    this.grounded = this.ctrl.computedGrounded();
    let impact = 0;
    if (this.grounded && !was && prevVy < -1) impact = -prevVy;
    if (this.grounded) this.vy = -2;
    else if (dy > 0 && m.y < dy - 0.001) this.vy = Math.min(this.vy, 0); // bumped head
    this.body.setTranslation({ x: this.x, y: this.y + this.h / 2, z: this.z }, true);
    return impact;
  }
  // free 3D velocity (rope swing, canopy): moves with collisions and returns the velocity actually achieved
  moveVel(dt, vx, vy, vz) {
    this.ctrl.computeColliderMovement(this.col, { x: vx * dt, y: vy * dt, z: vz * dt }, undefined, this.query, this.pred);
    const m = this.ctrl.computedMovement();
    this.x += m.x; this.y += m.y; this.z += m.z;
    this.grounded = this.ctrl.computedGrounded();
    const out = { x: m.x / dt, y: m.y / dt, z: m.z / dt };
    this.vy = this.grounded ? -2 : out.y;
    if (!this.grounded) { this.airT += dt; this.peakVy = Math.min(this.peakVy, this.vy); } else { this.airT = 0; this.peakVy = 0; }
    this.body.setTranslation({ x: this.x, y: this.y + this.h / 2, z: this.z }, true);
    return out;
  }
  // floating at the water surface: targetY is the desired feet height
  swim(dt, vx, vz, targetY) {
    const dy = Math.max(-3, Math.min(3, (targetY - this.y) * 5)) * dt;
    this.ctrl.computeColliderMovement(this.col, { x: vx * dt, y: dy, z: vz * dt }, undefined, this.query, this.pred);
    const m = this.ctrl.computedMovement();
    this.x += m.x; this.y += m.y; this.z += m.z; this.grounded = false; this.vy = 0; this.airT = 0; this.peakVy = 0;
    this.body.setTranslation({ x: this.x, y: this.y + this.h / 2, z: this.z }, true);
  }
  // externally displace (platform riding, pushes) without collision
  shift(dx, dy, dz) {
    this.x += dx; this.y += dy; this.z += dz;
    this.body.setTranslation({ x: this.x, y: this.y + this.h / 2, z: this.z }, true);
  }
  destroy() { this.phys.world.removeCollider(this.col, false); this.phys.world.removeRigidBody(this.body); this.phys.world.removeCharacterController(this.ctrl); }
}
