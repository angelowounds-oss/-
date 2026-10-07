import * as THREE from 'three';
import { A } from './assets.js';
import { GR, grp } from './physics.js';
import { clamp } from './util.js';
import { addRipple } from './world.js';

// Ragdolls (see docs/ragdoll-design.md): 12 capsule/ball bodies joined by impulse joints, driven back onto the Mixamo skeleton.
//   - hinges (elbow, knee) use Rapier's revolute joint with limits
//   - ball joints (spine, neck, shoulder, hip) are Rapier spherical joints plus a swing/twist limit solved here every physics step
//   - states: SIM (physics runs) -> SETTLED -> BAKED (bodies removed, pose frozen) ; knocked-down living people go GETUP -> back to animation
export const RAG_TUNE = {
  linDampAir: 0.05, linDampGround: 0.7, angDampAir: 0.9, angDampGround: 3.2,
  friction: 0.85, restitution: 0.0,
  limitBeta: 0.25, limitMaxW: 9,
  jointTone: 0.6,                           // relative angular damping at the joints (limp body)
  knockK: 26, knockD: 3.2,                  // muscle PD while alive (knock-down)
  settleV: 0.18, settleW: 0.5, settleT: 0.6, maxSimT: 6, maxSimTWater: 18, maxSimTLive: 3.4,
  maxSegV: 30,
  bulletJ: 0.9, bulletJMax: 60, meleeJ: 45, blastK: 14, carK: 0.9, carLift: 2.5, shoveJ: 35,
  buoyancy: 1.05, waterDrag: 4,
  getUpFront: 0.9, getUpBack: 1.1,
  selfCollideDelay: 0.3,
};

const D2R = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

// segment table. bone = the skeleton bone this body drives; a/b = limb endpoints (bones); ext = extra length beyond b; par = parent segment
// joint: 'sph' (ball, with limits) or 'hinge'; dir 'out' = lateral, 'up' = vertical, for the second swing axis; limits in degrees
const L = (side) => (side === 'L' ? 'Left' : 'Right');
const SEGS = [
  { id: 'pelvis', kind: 'pelvis', bone: 'Hips', r: 0.12, mass: 11 },
  { id: 'abdomen', bone: 'Spine', a: 'Spine', b: 'Spine2', r: 0.12, mass: 10, par: 'pelvis', ja: 'Spine', j: { t: 'sph', dir: 'out', fF: 40, fB: 20, sP: 25, sN: 25, tw: 20 } },
  { id: 'chest', bone: 'Spine2', a: 'Spine2', b: 'Neck', ext: 0.05, r: 0.14, mass: 16, par: 'abdomen', ja: 'Spine2', j: { t: 'sph', dir: 'out', fF: 30, fB: 15, sP: 20, sN: 20, tw: 25 } },
  { id: 'head', kind: 'head', bone: 'Head', r: 0.11, mass: 5.5, par: 'chest', ja: 'Head', j: { t: 'sph', dir: 'out', fF: 50, fB: 40, sP: 35, sN: 35, tw: 60 } },
];
for (const s of ['L', 'R']) {
  const S = L(s), lower = s.toLowerCase();
  SEGS.push(
    { id: 'uArm' + s, bone: S + 'Arm', a: S + 'Arm', b: S + 'ForeArm', r: 0.055, mass: 2.1, par: 'chest', ja: S + 'Arm', side: s, j: { t: 'sph', dir: 'up', fF: 100, fB: 60, sP: 100, sN: 115, tw: 70 } },
    { id: 'fArm' + s, bone: S + 'ForeArm', a: S + 'ForeArm', b: S + 'Hand', ext: 0.08, r: 0.045, mass: 1.6, par: 'uArm' + s, ja: S + 'ForeArm', side: s, hinge: true, j: { t: 'hinge', tip: +1, max: 145 } },
    { id: 'thigh' + s, bone: S + 'UpLeg', a: S + 'UpLeg', b: S + 'Leg', r: 0.075, mass: 7.5, par: 'pelvis', ja: S + 'UpLeg', side: s, j: { t: 'sph', dir: 'out', fF: 120, fB: 20, sP: 45, sN: 15, tw: 30 } },
    { id: 'shin' + s, bone: S + 'Leg', a: S + 'Leg', b: S + 'Foot', r: 0.055, mass: 4.6, par: 'thigh' + s, ja: S + 'Leg', side: s, hinge: true, j: { t: 'hinge', tip: -1, max: 150 } },
  );
}
const SEG_BY_ID = Object.fromEntries(SEGS.map((s, i) => [s.id, Object.assign(s, { i })]));
// bones the physics writes, parents first. spine1/neck are blended from their neighbours
const DRIVE = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'];

const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion(), q4 = new THREE.Quaternion(), q5 = new THREE.Quaternion(), q6 = new THREE.Quaternion();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const m4 = new THREE.Matrix4();

// ---------------------------------------------------------------------------------------------------------------------------
// Bind data: segment frames, offsets, anchors and limit axes in body-local coordinates (computed once from the T-pose clip)
let BIND = null;
function computeBind(m) {
  const bones = m.bones, names = Object.keys(bones);
  const saved = names.map((n) => [bones[n], bones[n].position.clone(), bones[n].quaternion.clone()]);
  const clip = A.soldier.animations.find((c) => c.name === 'TPose');
  if (clip) for (const tr of clip.tracks) {
    const k = tr.name.lastIndexOf('.'), bn = tr.name.slice(0, k).replace(/^mixamorig:?/, ''), prop = tr.name.slice(k + 1), b = bones[bn];
    if (!b) continue;
    if (prop === 'quaternion') b.quaternion.fromArray(tr.values, 0); else if (prop === 'position') b.position.fromArray(tr.values, 0);
  }
  m.body.updateMatrixWorld(true);
  const P = {}, Q = {};
  for (const n of names) { P[n] = bones[n].getWorldPosition(new THREE.Vector3()); Q[n] = bones[n].getWorldQuaternion(new THREE.Quaternion()); }
  for (const [b, p, q] of saved) { b.position.copy(p); b.quaternion.copy(q); }   // back to the live pose
  m.body.updateMatrixWorld(true);

  const fwd = P.LeftToeBase.clone().sub(P.LeftFoot); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); fwd.normalize();
  const left = P.LeftUpLeg.clone().sub(P.RightUpLeg); left.y = 0; left.normalize();
  const geo = {};
  for (const s of SEGS) {
    const g = { r: s.r, mass: s.mass };
    let C, D, len;
    if (s.kind === 'pelvis') {
      const a = P.RightUpLeg, b = P.LeftUpLeg; D = b.clone().sub(a); len = D.length() + 0.04; D.normalize(); C = a.clone().add(b).multiplyScalar(0.5).addScaledVector(UP, 0.03);
      g.qBody = Q.Hips.clone();
    } else if (s.kind === 'head') {
      D = UP.clone().applyQuaternion(Q.Head); len = 0; C = P.Head.clone().addScaledVector(D, 0.1); g.qBody = Q.Head.clone(); g.ball = true;
    } else {
      const a = P[s.a], b = P[s.b]; D = b.clone().sub(a); len = D.length() + (s.ext || 0); D.normalize(); C = a.clone().addScaledVector(D, len / 2);
      g.qBody = s.hinge ? geo[s.par].qBody.clone() : Q[s.bone].clone();
    }
    const qi = g.qBody.clone().invert();
    g.C = C; g.D = D; g.len = len; g.half = Math.max(0.01, len / 2 - s.r);
    g.pOff = P[s.bone].clone().sub(C).applyQuaternion(qi);            // bone origin in body frame
    g.qOff = qi.clone().multiply(Q[s.bone]);                           // bone orientation in body frame
    g.colRot = new THREE.Quaternion().setFromUnitVectors(UP, D.clone().applyQuaternion(qi).normalize());
    geo[s.id] = g;
  }
  const joints = [];
  for (const s of SEGS) {
    if (!s.par) continue;
    const gp = geo[s.par], gc = geo[s.id], pp = SEG_BY_ID[s.par];
    const anchor = P[s.ja], qpi = gp.qBody.clone().invert(), qci = gc.qBody.clone().invert();
    const J = { seg: s.id, par: s.par, type: s.j.t, a1: anchor.clone().sub(gp.C).applyQuaternion(qpi), a2: anchor.clone().sub(gc.C).applyQuaternion(qci), qRel0: qpi.clone().multiply(gc.qBody) };
    const t = gc.D.clone();                                            // limb direction = twist axis
    J.tLoc = t.clone().applyQuaternion(qpi);
    if (s.j.t === 'hinge') {
      const a = new THREE.Vector3().crossVectors(t, fwd.clone().multiplyScalar(s.j.tip)).normalize();
      J.axis = a.applyQuaternion(qpi); J.max = s.j.max * D2R;
    } else {
      const flex = new THREE.Vector3().crossVectors(t, fwd).normalize();
      let o = s.j.dir === 'up' ? UP.clone() : (s.side === 'R' ? left.clone().negate() : left.clone());
      const side = new THREE.Vector3().crossVectors(t, o).normalize();
      J.flex = flex.applyQuaternion(qpi); J.sideAx = side.applyQuaternion(qpi);
      J.fF = s.j.fF * D2R; J.fB = s.j.fB * D2R; J.sP = s.j.sP * D2R; J.sN = s.j.sN * D2R; J.tw = s.j.tw * D2R;
    }
    J.pi = pp.i; J.ci = s.i; J.mP = pp.mass; J.mC = s.mass;
    joints.push(J);
  }
  return { geo, joints, fwd, left };
}

// ---------------------------------------------------------------------------------------------------------------------------
export class Ragdoll {
  constructor(sys, h, opt) {
    this.sys = sys; this.h = h; this.G = sys.G; this.R = sys.G.RAPIER; this.world = sys.G.phys.world;
    this.state = 'SIM'; this.t = 0; this.alive = !!opt.alive; this.still = 0; this.tone = opt.alive ? 1 : 0; this.pelvisY = 0; this.waterT = 0; this.cause = opt.cause;
    this.bodies = []; this.cols = []; this.joints = []; this.ij = [];
    const m = h.m, bones = m.bones; this.m = m;
    if (!BIND) BIND = computeBind(m);
    const R = this.R, world = this.world;
    h.group.updateMatrixWorld(true);
    m.body.updateMatrixWorld(true);
    // current bone transforms -> body transforms
    this.hipsParent = bones.Hips.parent; this.hipsParent.updateWorldMatrix(true, false);
    this.parentInv = new THREE.Matrix4().copy(this.hipsParent.matrixWorld).invert();
    this.rootQ = this.hipsParent.getWorldQuaternion(new THREE.Quaternion());
    const baseFilter = GR.STATIC | GR.VEH | GR.PROP | GR.OBJ | GR.GLASS;
    this.baseFilter = baseFilter;
    for (const s of SEGS) {
      const g = BIND.geo[s.id], bone = bones[s.bone];
      const qb = bone.getWorldQuaternion(new THREE.Quaternion()).multiply(g.qOff.clone().invert());
      const pb = bone.getWorldPosition(new THREE.Vector3()).sub(g.pOff.clone().applyQuaternion(qb));
      const key = s.id === 'pelvis' || s.id === 'chest' || s.id === 'head';
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pb.x, pb.y, pb.z).setRotation({ x: qb.x, y: qb.y, z: qb.z, w: qb.w })
        .setLinearDamping(RAG_TUNE.linDampAir).setAngularDamping(RAG_TUNE.angDampAir).setCcdEnabled(key).setCanSleep(true));
      const cd = g.ball ? R.ColliderDesc.ball(g.r) : R.ColliderDesc.capsule(g.half, g.r).setRotation({ x: g.colRot.x, y: g.colRot.y, z: g.colRot.z, w: g.colRot.w });
      const torso = !!(s.id === 'pelvis' || s.id === 'abdomen' || s.id === 'chest' || s.id === 'head');
      const col = world.createCollider(cd.setMass(g.mass).setFriction(RAG_TUNE.friction).setRestitution(s.id === 'head' ? 0.05 : RAG_TUNE.restitution)
        .setCollisionGroups(grp(torso ? GR.RAG : GR.RAGL, baseFilter)), body);   // limb / torso contacts switch on after selfCollideDelay
      body._torso = torso; body._seg = s.id; body._mass = g.mass;
      this.bodies.push(body); this.cols.push(col);
    }
    for (const J of BIND.joints) {
      const pb = this.bodies[J.pi], cb = this.bodies[J.ci];
      let jd;
      if (J.type === 'hinge') { jd = R.JointData.revolute({ x: J.a1.x, y: J.a1.y, z: J.a1.z }, { x: J.a2.x, y: J.a2.y, z: J.a2.z }, { x: J.axis.x, y: J.axis.y, z: J.axis.z }); jd.limitsEnabled = true; jd.limits = [0, J.max]; }
      else jd = R.JointData.spherical({ x: J.a1.x, y: J.a1.y, z: J.a1.z }, { x: J.a2.x, y: J.a2.y, z: J.a2.z });
      const j = world.createImpulseJoint(jd, pb, cb, true); j.setContactsEnabled(false);
      this.ij.push(j);
      // muscle target for knock-downs: the relative rotation at the moment of the hit
      const qp = this.bq(pb, q1), qc = this.bq(cb, q2);
      this.joints.push({ J, wc: J.mP / (J.mP + J.mC), target: q1.clone().invert().multiply(q2).clone() });
      void qp; void qc;
    }
    this.bodies[0].setAdditionalSolverIterations?.(2); this.bodies[2].setAdditionalSolverIterations?.(2);
    // pose snapshot to blend from when getting up, and to keep fingers / feet / shoulders as they were
    this.localQ = {};
    for (const n of Object.keys(bones)) this.localQ[n] = bones[n].quaternion.clone();
    this.hipsPos0 = bones.Hips.position.clone();
    this.frozenGroup = { x: h.group.position.x, y: h.group.position.y, z: h.group.position.z, ry: h.group.rotation.y };
    this.sleepT = 0; this.collOn = false;
    this.setVelocity(opt.vel || { x: 0, y: 0, z: 0 });
    h.rag = this;
  }
  bq(body, out) { const r = body.rotation(); return out.set(r.x, r.y, r.z, r.w); }
  setVelocity(v) { for (const b of this.bodies) b.setLinvel({ x: v.x, y: v.y, z: v.z }, true); }
  addVelocity(v, k = 1) { for (const b of this.bodies) { const l = b.linvel(); b.setLinvel({ x: l.x + v.x * k, y: l.y + v.y * k, z: l.z + v.z * k }, true); } }
  // impulse in N*s at a world point on a segment (index) or at the chest
  impulse(segId, J, point) {
    const body = this.bodies[SEG_BY_ID[segId]?.i ?? 2], t = body.translation();
    body.applyImpulseAtPoint({ x: J.x, y: J.y, z: J.z }, point ? { x: point.x, y: point.y, z: point.z } : t, true);
    this.clampSpeeds();
  }
  clampSpeeds() { for (const b of this.bodies) { const l = b.linvel(), s = Math.hypot(l.x, l.y, l.z); if (s > RAG_TUNE.maxSegV) { const k = RAG_TUNE.maxSegV / s; b.setLinvel({ x: l.x * k, y: l.y * k, z: l.z * k }, true); } } }

  // before every physics step: joint limits, muscles, buoyancy
  preStep(dt) {
    if (this.state === 'BAKED' || this.state === 'GETUP') return;
    this.t += dt;
    if (!this.collOn && this.t > RAG_TUNE.selfCollideDelay) {   // limbs and torso start colliding with each other
      this.collOn = true;
      this.cols.forEach((c, i) => { const torso = this.bodies[i]._torso; c.setCollisionGroups(grp(torso ? GR.RAG : GR.RAGL, this.baseFilter | (torso ? GR.RAGL : GR.RAG))); });
    }
    const tone = this.alive && this.state === 'SIM' ? this.tone : 0;
    for (const jt of this.joints) {
      const J = jt.J;
      if (J.type !== 'sph') { if (tone > 0) this.hingeTone(jt, tone, dt); else this.damp(jt, dt); continue; }
      this.limit(jt, dt);
      if (tone > 0) this.sphTone(jt, tone, dt);
      else this.damp(jt, dt);
    }
    this.floatStep(dt);
  }
  // limp joint friction: removes the relative spin at a fixed rate
  damp(jt, dt) {
    const J = jt.J, pb = this.bodies[J.pi], cb = this.bodies[J.ci], wp = pb.angvel(), wc = cb.angvel();
    const k = Math.min(1, RAG_TUNE.jointTone * dt * 6);
    const rx = (wc.x - wp.x) * k, ry = (wc.y - wp.y) * k, rz = (wc.z - wp.z) * k;
    cb.setAngvel({ x: wc.x - rx * jt.wc, y: wc.y - ry * jt.wc, z: wc.z - rz * jt.wc }, true);
    pb.setAngvel({ x: wp.x + rx * (1 - jt.wc), y: wp.y + ry * (1 - jt.wc), z: wp.z + rz * (1 - jt.wc) }, true);
  }
  // swing / twist limit for a ball joint
  limit(jt, dt) {
    const J = jt.J, pb = this.bodies[J.pi], cb = this.bodies[J.ci];
    const qp = this.bq(pb, q5), qc = this.bq(cb, q6);
    const qd = q3.copy(qp).invert().multiply(qc).multiply(q4.copy(J.qRel0).invert());
    if (qd.w < 0) { qd.x = -qd.x; qd.y = -qd.y; qd.z = -qd.z; qd.w = -qd.w; }
    const t = J.tLoc, dotv = qd.x * t.x + qd.y * t.y + qd.z * t.z;
    // twist = projection onto the limb axis, swing = the rest
    const tw = q4.set(t.x * dotv, t.y * dotv, t.z * dotv, qd.w), tl = tw.length();
    if (tl < 1e-6) tw.set(0, 0, 0, 1); else tw.set(tw.x / tl, tw.y / tl, tw.z / tl, tw.w / tl);
    const twAng = 2 * Math.atan2(tw.x * t.x + tw.y * t.y + tw.z * t.z, tw.w);
    const sw = q1.copy(qd).multiply(q2.copy(tw).invert());
    if (sw.w < 0) { sw.x = -sw.x; sw.y = -sw.y; sw.z = -sw.z; sw.w = -sw.w; }
    const sAng = 2 * Math.acos(clamp(sw.w, -1, 1)), sn = Math.sqrt(Math.max(1e-12, 1 - sw.w * sw.w));
    v1.set(sw.x / sn * sAng, sw.y / sn * sAng, sw.z / sn * sAng);   // swing rotation vector (parent frame)
    const cF = v1.dot(J.flex), cA = v1.dot(J.sideAx);
    const u = Math.abs(cF) / (cF >= 0 ? J.fF : J.fB), w = Math.abs(cA) / (cA >= 0 ? J.sP : J.sN), n = Math.hypot(u, w);
    let ex = 0; v2.set(0, 0, 0);
    if (n > 1 && sAng > 1e-4) { ex = (1 - 1 / n) * sAng; v2.copy(v1).normalize(); }
    let exT = 0, twDir = 0;
    if (Math.abs(twAng) > J.tw) { exT = Math.abs(twAng) - J.tw; twDir = Math.sign(twAng); }
    if (ex === 0 && exT === 0) return;
    const wp = pb.angvel(), wc = cb.angvel();
    const apply = (axisP, e) => {
      v3.copy(axisP).applyQuaternion(qp);                         // axis in the world
      const rel = (wc.x - wp.x) * v3.x + (wc.y - wp.y) * v3.y + (wc.z - wp.z) * v3.z;
      const d = clamp(Math.max(0, rel) + RAG_TUNE.limitBeta * e / dt, 0, RAG_TUNE.limitMaxW);
      wc.x -= v3.x * d * jt.wc; wc.y -= v3.y * d * jt.wc; wc.z -= v3.z * d * jt.wc;
      wp.x += v3.x * d * (1 - jt.wc); wp.y += v3.y * d * (1 - jt.wc); wp.z += v3.z * d * (1 - jt.wc);
    };
    if (ex > 0) apply(v2, ex);
    if (exT > 0) apply(v4.copy(t).multiplyScalar(twDir), exT);
    cb.setAngvel({ x: wc.x, y: wc.y, z: wc.z }, true); pb.setAngvel({ x: wp.x, y: wp.y, z: wp.z }, true);
  }
  // muscles while alive: spring the relative rotation back to the pose the person had when hit
  sphTone(jt, tone, dt) {
    const J = jt.J, pb = this.bodies[J.pi], cb = this.bodies[J.ci];
    const qp = this.bq(pb, q1), qc = this.bq(cb, q2);
    const rel = q3.copy(qp).invert().multiply(qc), err = q4.copy(jt.target).multiply(rel.invert());   // rotation that takes the current relative rotation to the target, in the parent frame
    if (err.w < 0) { err.x = -err.x; err.y = -err.y; err.z = -err.z; err.w = -err.w; }
    const ang = 2 * Math.acos(clamp(err.w, -1, 1)), sn = Math.sqrt(Math.max(1e-12, 1 - err.w * err.w));
    v1.set(err.x / sn, err.y / sn, err.z / sn).multiplyScalar(ang).applyQuaternion(qp);     // world-frame error vector
    const wp = pb.angvel(), wc = cb.angvel();
    const k = RAG_TUNE.knockK * tone, d = RAG_TUNE.knockD * tone;
    const ax = k * v1.x - d * (wc.x - wp.x), ay = k * v1.y - d * (wc.y - wp.y), az = k * v1.z - d * (wc.z - wp.z);
    cb.setAngvel({ x: wc.x + ax * dt * jt.wc, y: wc.y + ay * dt * jt.wc, z: wc.z + az * dt * jt.wc }, true);
    pb.setAngvel({ x: wp.x - ax * dt * (1 - jt.wc), y: wp.y - ay * dt * (1 - jt.wc), z: wp.z - az * dt * (1 - jt.wc) }, true);
  }
  hingeTone(jt, tone, dt) { this.sphTone(jt, tone * 0.7, dt); }
  // buoyancy and water drag
  floatStep(dt) {
    const wat = this.sys.waterAt(this.bodies[0].translation());
    if (!wat) { this.inWater = false; return; }
    this.inWater = true;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i], p = b.translation(), g = BIND.geo[SEGS[i].id];
      const r = g.r, s = clamp((wat.y - (p.y - r)) / (2 * r), 0, 1);
      if (s <= 0) continue;
      const vol = g.ball ? 4 / 3 * Math.PI * r * r * r : Math.PI * r * r * (g.half * 2 + 4 / 3 * r);
      const l = b.linvel(), buoy = 1000 * 9.81 * vol * s * RAG_TUNE.buoyancy * 0.55 * dt / g.mass;      // a person is a little denser than water: 0.55 of the nominal volume
      const drag = Math.max(0, 1 - RAG_TUNE.waterDrag * s * dt);
      b.setLinvel({ x: l.x * drag, y: l.y * drag + buoy, z: l.z * drag }, true);
      const w = b.angvel(), ad = Math.max(0, 1 - 2 * s * dt); b.setAngvel({ x: w.x * ad, y: w.y * ad, z: w.z * ad }, true);
      if (!this._splashed && p.y - r < wat.y) { this._splashed = true; const vy = Math.abs(l.y); addRipple(p.x, p.z, clamp(vy / 4, 1, 3)); this.G.audio.splash?.(clamp(vy / 8, 0.4, 1.2)); }
    }
  }

  // after the step: ground contact damping, settling
  postStep(dt) {
    if (this.state === 'BAKED' || this.state === 'GETUP') return;
    let vmax = 0, wmax = 0, low = true;
    for (const b of this.bodies) {
      const l = b.linvel(), w = b.angvel();
      vmax = Math.max(vmax, Math.hypot(l.x, l.y, l.z)); wmax = Math.max(wmax, Math.hypot(w.x, w.y, w.z));
    }
    const limit = this.inWater ? RAG_TUNE.maxSimTWater : (this.alive ? RAG_TUNE.maxSimTLive : RAG_TUNE.maxSimT);
    if (this.t > 1 && !this.damped) { this.damped = true; for (const b of this.bodies) { b.setLinearDamping(RAG_TUNE.linDampGround); b.setAngularDamping(RAG_TUNE.angDampGround); } }
    if (vmax < RAG_TUNE.settleV && wmax < RAG_TUNE.settleW && this.t > 0.5) this.still += dt; else this.still = 0;
    if (this.state === 'SIM' && (this.still > RAG_TUNE.settleT || this.t > limit)) { this.state = 'SETTLED'; this.settledT = 0; }
    else if (this.state === 'SETTLED') {
      this.settledT += dt;
      if (this.settledT > 0.3) { if (this.alive) this.startGetUp(); else this.bake(); }
    }
  }

  // bodies -> skeleton
  sync() {
    if (this.state === 'BAKED' || this.state === 'GETUP') return;
    const m = this.m, B = m.bones, geo = BIND.geo;
    const wq = (i, out) => { const r = this.bodies[i].rotation(); return out.set(r.x, r.y, r.z, r.w); };
    const boneW = (id, out) => wq(SEG_BY_ID[id].i, out).multiply(geo[id].qOff);
    const qPelvis = boneW('pelvis', new THREE.Quaternion()), qAbd = boneW('abdomen', new THREE.Quaternion()), qChest = boneW('chest', new THREE.Quaternion()), qHead = boneW('head', new THREE.Quaternion());
    const qSp1 = new THREE.Quaternion().copy(qAbd).slerp(qChest, 0.5), qNeck = new THREE.Quaternion().copy(qChest).slerp(qHead, 0.5);
    const set = (name, qWorld, qParentW) => { const b = B[name]; q1.copy(qParentW).invert().multiply(qWorld); b.quaternion.copy(q1); };
    // hips: position from the pelvis body
    const pb = this.bodies[0], pt = pb.translation(), pq = pb.rotation();
    v1.copy(geo.pelvis.pOff).applyQuaternion(q2.set(pq.x, pq.y, pq.z, pq.w)).add(v2.set(pt.x, pt.y, pt.z));
    B.Hips.position.copy(v1).applyMatrix4(this.parentInv);
    set('Hips', qPelvis, this.rootQ);
    set('Spine', qAbd, qPelvis);
    set('Spine1', qSp1, qAbd);
    set('Spine2', qChest, qSp1);
    set('Neck', qNeck, qChest);
    set('Head', qHead, qNeck);
    for (const s of ['Left', 'Right']) {
      const S = s[0];
      const qSh = new THREE.Quaternion().copy(qChest).multiply(B[s + 'Shoulder'].quaternion);
      const qUA = boneW('uArm' + S, new THREE.Quaternion()), qFA = boneW('fArm' + S, new THREE.Quaternion());
      set(s + 'Arm', qUA, qSh); set(s + 'ForeArm', qFA, qUA);
      const qTh = boneW('thigh' + S, new THREE.Quaternion()), qSh2 = boneW('shin' + S, new THREE.Quaternion());
      set(s + 'UpLeg', qTh, qPelvis); set(s + 'Leg', qSh2, qTh);
    }
    // everyone else (shoulders, hands, fingers, feet) keeps its last local pose and follows its parent
    const h = this.h; this.pelvisY = pt.y;
    h.x = pt.x; h.z = pt.z; h.y = Math.max(h.floorY || 0, pt.y - 0.2);
  }

  worldBoneQuat(name) { return this.m.bones[name].getWorldQuaternion(new THREE.Quaternion()); }

  // freeze the pose and drop the physics
  bake() {
    if (this.state === 'BAKED') return;
    this.sync(); this.release(); this.state = 'BAKED';
  }
  release() {
    for (const j of this.ij) this.world.removeImpulseJoint(j, true);
    for (const b of this.bodies) this.world.removeRigidBody(b);
    this.ij.length = 0; this.bodies.length = 0; this.cols.length = 0; this.joints.length = 0;
  }
  destroy() { if (this.state !== 'BAKED') this.release(); this.state = 'BAKED'; if (this.h.rag === this) this.h.rag = null; }

  // ---- getting back up (knock-downs that did not kill) ----
  startGetUp() {
    const h = this.h, m = this.m, B = m.bones;
    this.sync();
    const lying = this.bodies[0].translation();
    // facing: the pelvis forward (+Z of the hips bone) in the world
    const fq = this.worldBoneQuat('Hips'), fw = new THREE.Vector3(0, 0, 1).applyQuaternion(fq);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(fq);
    // the hip bone's forward may differ from the character's facing; use the head-to-pelvis direction on the ground plane as the facing when lying on the belly
    this.getUpFront = fw.y < 0;       // heuristic: placeholder, refined by the facing of the chest
    const chestFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.worldBoneQuat('Spine2'));
    const chestUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.worldBoneQuat('Spine2'));
    void up; void chestUp;
    const face = this.facingYaw();
    // pose to blend from: world quaternions of every bone
    this.poseW = {}; for (const n of Object.keys(B)) this.poseW[n] = this.worldBoneQuat(n);
    this.hipsW = B.Hips.getWorldPosition(new THREE.Vector3());
    this.release();
    // move the group to where the body lies
    const g = h.group; h.x = lying.x; h.z = lying.z; h.ry = face;
    g.position.set(h.x, h.y, h.z); g.rotation.y = face; m.body.position.set(0, 0, 0); m.body.rotation.set(0, 0, 0);
    g.updateMatrixWorld(true);
    for (const k in m.act) m.act[k].weight = 0; m.act.Idle.weight = 1; m.act.Idle.time = 0;
    this.state = 'GETUP'; this.gt = 0; this.gtDur = this.chestDown ? RAG_TUNE.getUpFront : RAG_TUNE.getUpBack;
    if (h.isPlayer && h.stunT !== undefined) h.stunT = Math.max(h.stunT || 0, this.gtDur);
  }
  facingYaw() {
    const c = this.worldBoneQuat('Spine2'), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(c);
    const hd = this.m.bones.Head.getWorldPosition(new THREE.Vector3()), hp = this.m.bones.Hips.getWorldPosition(new THREE.Vector3());
    this.chestDown = fwd.y < -0.2;                       // on the belly: push up facing where the head points; on the back: sit up facing where the feet point
    const dx = hd.x - hp.x, dz = hd.z - hp.z;
    if (Math.hypot(dx, dz) > 0.35) return Math.atan2(dx, dz) + (this.chestDown ? 0 : Math.PI);
    return Math.atan2(fwd.x, fwd.z);
  }
  // returns true while the blend is running
  getUpTick(dt) {
    if (this.state !== 'GETUP') return false;
    const h = this.h, m = this.m, B = m.bones;
    this.gt += dt; const k = clamp(this.gt / this.gtDur, 0, 1), e = k * k * (3 - 2 * k);
    m.mixer.update(dt);                                  // the standing animation writes its pose into the bones...
    h.group.updateMatrixWorld(true);
    // ...which we blend against the pose the body was lying in, parents first
    const order = Object.keys(B);
    for (const n of order) {
      const b = B[n], par = b.parent; if (!par) continue;
      const qPar = par.getWorldQuaternion(q2);
      const target = q1.copy(qPar).invert().multiply(this.poseW[n]);          // lying pose, relative to the (already blended) parent
      b.quaternion.slerpQuaternions(target, b.quaternion.clone(), e);
      b.updateWorldMatrix(false, false);
    }
    // hips height: from the lying hips up to the standing animation height
    const hipsAnim = B.Hips.position.clone();
    v1.copy(this.hipsW); B.Hips.parent.updateWorldMatrix(true, false); this.parentInvNow = this.parentInvNow || new THREE.Matrix4(); this.parentInvNow.copy(B.Hips.parent.matrixWorld).invert();
    v1.applyMatrix4(this.parentInvNow);
    B.Hips.position.lerpVectors(v1, hipsAnim, e);
    if (k >= 1) { this.state = 'BAKED'; if (h.rag === this) h.rag = null; this.G.ragdolls.afterGetUp(h); }
    return true;
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
export class RagdollSystem {
  constructor(G) {
    this.G = G; this.list = []; this.stats = { spawned: 0, legacy: 0, forced: 0, simMs: 0, simN: 0 }; window.__ragStats = this.stats;
  }
  get cap() { return this.G.eng.q.ragdolls ?? 6; }
  get dist() { return this.G.eng.q.ragDist ?? 55; }
  waterAt(p) { return this.G.waterAt(p.x, p.z) && p.y < this.G.waterAt(p.x, p.z).y + 0.3 ? this.G.waterAt(p.x, p.z) : null; }
  usable(h) {
    if (!h.m || !h.m.skinned || !h.m.bones || !h.m.bones.Hips || !A.soldier) return false;
    if (h.group.scale.x < 0.99 || h.group.scale.x > 1.01) return false;
    if (h.inVehicle || (h.m.sit || 0) > 0.3 || h.m.rideOn) return false;
    return true;
  }
  count() { let n = 0; for (const r of this.list) if (r.state !== 'BAKED') n++; return n; }
  makeRoom() {
    if (this.count() < this.cap) return true;
    // settled first, then the oldest simulation older than 1.5 s
    let best = null;
    for (const r of this.list) { if (r.state === 'SETTLED' && r.alive === false) { r.bake(); return true; } }
    for (const r of this.list) if (r.state === 'SIM' && r.t > 1.5 && (!best || r.t > best.t)) best = r;
    if (best) { if (best.alive) best.state = 'SETTLED', best.settledT = 0.31; else best.bake(); this.stats.forced++; return this.count() < this.cap; }
    return false;
  }
  // opt: { cause, alive, vel:{x,y,z}, hit:{seg, point, dir, j}, blast, carVel }
  spawn(h, opt = {}) {
    const G = this.G;
    if (h.rag) { this.apply(h.rag, opt); return h.rag; }
    if (!this.usable(h) || !this.G.phys) { this.stats.legacy++; return null; }
    const cd = Math.hypot(h.x - G.camera.position.x, h.z - G.camera.position.z);
    if (cd > this.dist || !h.group.visible) { this.stats.legacy++; return null; }
    if (!this.makeRoom()) { this.stats.legacy++; return null; }
    // current velocity from the walking speed
    if (!opt.vel) { const sp = h.speed || 0; opt.vel = { x: Math.sin(h.ry || 0) * sp * 0.8, y: 0, z: Math.cos(h.ry || 0) * sp * 0.8 }; }
    let r;
    try { r = new Ragdoll(this, h, opt); } catch (e) { console.warn('ragdoll spawn failed', e); this.stats.legacy++; return null; }
    this.list.push(r); this.stats.spawned++;
    h.m.stopOnce?.(); for (const k in h.m.act) h.m.act[k].weight = 0;
    this.apply(r, opt);
    r.sync();
    return r;
  }
  // impulses by cause
  apply(r, opt) {
    const T = RAG_TUNE;
    if (opt.hit) {
      const hv = opt.hit, d = hv.dir; r.impulse(hv.seg || 'chest', { x: d.x * hv.j, y: d.y * hv.j + hv.j * 0.1, z: d.z * hv.j }, hv.point);
    }
    if (opt.shove) { const s = opt.shove; r.addVelocity({ x: s.x, y: s.up, z: s.z }, 1); r.impulse('chest', { x: s.x * 20, y: 0, z: s.z * 20 }); }
    r.clampSpeeds();
  }
  knock(h, vx, vz, up, alive = true) {
    if (h.rag) { h.rag.addVelocity({ x: vx, y: up, z: vz }, 1); h.rag.clampSpeeds(); return true; }
    return !!this.spawn(h, { cause: 'shove', alive: alive && !h.dead, vel: { x: vx * 0.6, y: up * 0.6, z: vz * 0.6 }, shove: { x: vx * 0.4, z: vz * 0.4, up: up * 0.4 } });
  }
  destroy(h) { const r = h.rag; if (!r) return; r.destroy(); const i = this.list.indexOf(r); if (i >= 0) this.list.splice(i, 1); }
  // back on their feet: hand control back to the AI / the player
  afterGetUp(h) {
    const G = this.G; h.rag = null; h.knock = 0;
    h.m.body.rotation.set(0, 0, 0); h.m.body.position.y = 0;
    if (h === G.player) { h.stunT = 0; h.body3.teleport(h.x, h.y, h.z); h.y = h.body3.y; h.vx = h.vz = 0; h.reactT = 0; }
    else { h.state = 'flee'; h.fleeT = 5; }
  }
  // physics step hooks
  preStep(dt) { for (const r of this.list) r.preStep(dt); }
  postStep(dt) {
    for (const r of this.list) r.postStep(dt);
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].state === 'BAKED' && !this.list[i].h.rag) this.list.splice(i, 1);
  }
  syncBones() {
    const t0 = performance.now();
    for (const r of this.list) { r.sync(); const p = r.bodies[0] && r.bodies[0].translation(); if (p && (p.y < -40 || !Number.isFinite(p.x + p.y + p.z))) { r.bake(); } }
    this.stats.simMs = this.stats.simMs * 0.95 + (performance.now() - t0) * 0.05; this.stats.simN = this.count();
  }
  // floors that are about to disappear: freeze everything lying in the box
  bakeInBox(x0, z0, x1, z1, y0, y1) {
    for (const r of this.list) { if (r.state === 'BAKED' || r.state === 'GETUP' || !r.bodies[0]) continue; const p = r.bodies[0].translation(); if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 && p.y > y0 - 1 && p.y < y1 + 1) r.bake(); }
  }
  bakeAll() { for (const r of this.list) if (r.state !== 'BAKED' && r.state !== 'GETUP') r.bake(); }
}
