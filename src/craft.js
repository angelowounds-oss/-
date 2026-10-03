import * as THREE from 'three';
import { glowSpriteMat } from './models.js';
import { GR, grp } from './physics.js';
import { clamp, lerp, damp, TAU, rand } from './util.js';

// Motorcycle, boat and helicopter: procedural models + physics drive models (Vehicle subclass-free hooks)
export const CRAFT_SPECS = {
  moto: { L: 2.1, W: 0.8, wb: 0.85, mass: 0.2, maxSpeed: 60, accel: 25, grip: 8.5, hp: 55, track: 0.3, cy: 0.5, fuelRate: 0.9, custom: 'moto' },
  boat: { L: 6.2, W: 2.4, mass: 0.9, maxSpeed: 26, accel: 11, grip: 3, hp: 120, cy: 0.5, fuelRate: 1.2, custom: 'boat', craft: 'boat' },
  heli: { L: 8.5, W: 2.6, mass: 0.9, maxSpeed: 48, accel: 16, grip: 3, hp: 130, cy: 0.9, fuelRate: 1.6, custom: 'heli', craft: 'heli' },
};

const std = (c, r = 0.5, m = 0.3, e) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: e || 0x000000, emissiveIntensity: e ? 1.6 : 0 });
const MAT = () => ({ dark: std(0x1b1e27, 0.4, 0.7), metal: std(0x8d94a2, 0.3, 0.9), glass: new THREE.MeshPhysicalMaterial({ color: 0x15283c, roughness: 0.05, transparent: true, opacity: 0.55, clearcoat: 1 }), rubber: std(0x0a0a0c, 0.9, 0) });
function base(type, color, opts) {
  const group = new THREE.Group(), ug = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ visible: false }));
  ug.material.uniforms = { uColor: { value: new THREE.Color(...(opts.glow || [0.2, 0.9, 1])) } };
  const brake = new THREE.Group(); group.add(brake); brake.visible = false;
  return { group, ug, head: new THREE.Object3D(), tail: new THREE.Object3D(), beams: new THREE.Object3D(), brake, headSprites: [], tailSprites: [], siren: null, wheelR: 0.33, dark: new THREE.Object3D(), front: new THREE.Object3D(), fa: new THREE.Object3D(), ra: new THREE.Object3D(), syncWheels() {}, paint: null };
}
const box = (mat, w, h, d, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = false; parent.add(m); return m; };
const cyl = (mat, r, h, x, y, z, parent, rot) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat); m.position.set(x, y, z); if (rot) m.rotation.set(...rot); parent.add(m); return m; };

export function buildCustom(type, color, opts = {}) {
  const M = MAT(), m = base(type, color, opts), g = m.group, glow = opts.glow || [0.2, 0.9, 1];
  const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(...glow).multiplyScalar(2.6), toneMapped: false });
  const paint = std(color, 0.25, 0.6); m.paint = paint;
  const spr = (x, y, z, col, s) => { const t = new THREE.Sprite(glowSpriteMat(col, 1.2)); t.position.set(x, y, z); t.scale.setScalar(s); g.add(t); return t; };
  if (type === 'moto') {
    const frame = new THREE.Group(); g.add(frame); m.frame = frame;
    box(M.dark, 0.26, 0.22, 1.05, 0, 0.62, 0.0, frame);
    const tank = cyl(paint, 0.17, 0.5, 0, 0.84, 0.24, frame, [Math.PI / 2, 0, 0]); tank.scale.set(1, 1, 0.8);
    box(M.rubber, 0.24, 0.1, 0.62, 0, 0.83, -0.38, frame);
    box(neon, 0.3, 0.03, 0.9, 0, 0.5, 0, frame);
    const fork = new THREE.Group(); fork.position.set(0, 0.55, 0.78); frame.add(fork); m.fork = fork;
    box(M.metal, 0.05, 0.7, 0.05, -0.1, -0.05, 0.0, fork).rotation.x = 0.35; box(M.metal, 0.05, 0.7, 0.05, 0.1, -0.05, 0, fork).rotation.x = 0.35;
    box(M.dark, 0.7, 0.05, 0.05, 0, 0.32, -0.12, fork); // bars
    m.wf = new THREE.Group(); m.wf.position.set(0, -0.22, 0.12); fork.add(m.wf); cyl(M.rubber, 0.33, 0.14, 0, 0, 0, m.wf, [0, 0, Math.PI / 2]); cyl(neon, 0.2, 0.15, 0, 0, 0, m.wf, [0, 0, Math.PI / 2]);
    m.wr = new THREE.Group(); m.wr.position.set(0, 0.33, -0.85); frame.add(m.wr); cyl(M.rubber, 0.34, 0.2, 0, 0, 0, m.wr, [0, 0, Math.PI / 2]); cyl(neon, 0.2, 0.21, 0, 0, 0, m.wr, [0, 0, Math.PI / 2]);
    m.headSprites = [spr(0, 0.9, 1.05, 0xfff0cc, 1.1)]; m.tailSprites = [spr(0, 0.8, -1.0, 0xff1a10, 0.5)];
    m.syncWheels = (spin, steer) => { m.wf.rotation.x = spin; m.wr.rotation.x = spin; fork.rotation.y = steer * 0.9; };
    m.wheelR = 0.33; m.craftVisual = (v, dt) => { frame.rotation.z = damp(frame.rotation.z, -clamp(v.steer * v.speed * 0.03, -0.55, 0.55), 6, dt); };
  } else if (type === 'boat') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 6.0), paint); hull.position.y = 0.35; g.add(hull);
    const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.15, 1.6, 4, 1), paint); bow.rotation.set(Math.PI / 2, Math.PI / 4, 0); bow.scale.set(1, 1, 0.36); bow.position.set(0, 0.35, 3.7); g.add(bow);
    box(M.dark, 2.0, 0.08, 5.6, 0, 0.74, -0.1, g); box(neon, 2.34, 0.05, 6.04, 0, 0.55, 0, g);
    box(paint, 1.5, 0.7, 1.9, 0, 1.05, -0.5, g); box(M.glass, 1.4, 0.5, 0.06, 0, 1.22, 0.5, g).rotation.x = -0.35; box(M.dark, 1.5, 0.08, 2.0, 0, 1.45, -0.6, g);
    cyl(M.metal, 0.05, 0.9, 0.6, 1.3, 1.3, g); cyl(M.metal, 0.05, 0.9, -0.6, 1.3, 1.3, g);
    box(M.dark, 0.35, 0.5, 0.4, 0, 0.7, -3.1, g); // outboard
    m.headSprites = [spr(0, 0.95, 3.3, 0xffffff, 1.4)]; m.tailSprites = [spr(0, 1.0, -3.0, 0xff2010, 0.6)];
    m.craftVisual = (v, dt) => { g.rotation.z = Math.sin(v.G.time * 1.3 + v.id) * 0.03; };
  } else { // heli
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.3, 20, 14), paint); body.scale.set(1, 0.9, 1.7); body.position.y = 1.35; g.add(body);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 14, 0, TAU, 0, Math.PI * 0.55), M.glass); glass.scale.set(1, 0.85, 1.25); glass.position.set(0, 1.55, 0.8); g.add(glass);
    box(paint, 0.35, 0.4, 4.2, 0, 1.55, -3.2, g); box(neon, 0.38, 0.05, 4.2, 0, 1.75, -3.2, g);
    box(paint, 0.12, 1.1, 0.9, 0, 2.05, -5.1, g);
    m.tailRotor = new THREE.Group(); m.tailRotor.position.set(0.25, 2.1, -5.15); g.add(m.tailRotor); box(M.dark, 0.04, 1.3, 0.1, 0, 0, 0, m.tailRotor); box(M.dark, 0.04, 0.1, 1.3, 0, 0, 0, m.tailRotor);
    cyl(M.metal, 0.12, 0.5, 0, 2.55, 0.1, g);
    m.rotor = new THREE.Group(); m.rotor.position.y = 2.85; g.add(m.rotor);
    for (let i = 0; i < 4; i++) { const b = box(M.dark, 0.25, 0.04, 4.6, 0, 0, 2.3, new THREE.Group()); const pv = new THREE.Group(); pv.rotation.y = i * Math.PI / 2; pv.add(b); m.rotor.add(pv); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4.7, 28), new THREE.MeshBasicMaterial({ color: 0x9aa4b8, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide })); disc.rotation.x = -Math.PI / 2; m.rotor.add(disc); m.disc = disc;
    for (const s of [-1, 1]) { cyl(M.metal, 0.06, 3.0, s * 1.05, 0.12, 0.3, g, [Math.PI / 2, 0, 0]); box(M.metal, 0.06, 0.8, 0.06, s * 1.0, 0.55, 0.9, g); box(M.metal, 0.06, 0.8, 0.06, s * 1.0, 0.55, -0.3, g); }
    m.headSprites = [spr(0, 1.1, 2.3, 0xfff2d0, 1.6)]; m.tailSprites = [spr(0, 1.8, -5.0, 0xff1010, 0.8), spr(0, 3.0, 0, 0x30ff60, 0.6)];
    m.beacon = m.tailSprites[0];
    m.craftVisual = (v, dt) => {
      const sp = v.spool || 0; m.rotor.rotation.y += dt * (sp * 38); m.tailRotor.rotation.x += dt * sp * 50; m.disc.material.opacity = sp * 0.12;
      m.beacon.visible = Math.floor(v.G.time * 1.4) % 2 === 0;
      const tgt = v.tiltFwd || 0, roll = v.tiltRoll || 0;
      body.rotation.x = damp(body.rotation.x, tgt, 4, dt); body.rotation.z = damp(body.rotation.z, roll, 4, dt);
    };
  }
  m.spec = CRAFT_SPECS[type];
  return m;
}

// ---------- physics ----------
export function createCraftBody(phys, spec, x, y, z, heading) {
  const R = phys.R, w = phys.world, mass = 1300 * spec.mass;
  const q = { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
  let desc = R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(q).setLinearDamping(spec.craft === 'heli' ? 0.5 : 0.05).setAngularDamping(spec.craft === 'heli' ? 3 : 2.5).setCanSleep(spec.craft !== 'boat').setCcdEnabled(true);
  if (spec.craft === 'heli') desc = desc.enabledRotations(false, true, false);
  const body = w.createRigidBody(desc);
  const hx = spec.W / 2, hz = spec.L / 2, hy = spec.craft === 'heli' ? 0.9 : 0.4;
  const col = w.createCollider(R.ColliderDesc.cuboid(hx, hy, spec.craft === 'heli' ? 3.2 : hz).setTranslation(0, spec.craft === 'heli' ? 0.3 : 0.0, 0).setMass(mass).setFriction(0.3).setRestitution(0.12).setCollisionGroups(grp(GR.VEH, GR.STATIC | GR.VEH | GR.PROP | GR.OBJ | GR.GLASS)), body);
  const v = { body, col, ctrl: null, mass, spec };
  (phys.vehicles || (phys.vehicles = [])).push(v); phys.bodies.set(body.handle, v);
  return v;
}

export function driveCraft(veh, dt) {
  const { pv } = veh, b = pv.body, spec = pv.spec, G = veh.G, m = pv.mass;
  const hasDriver = veh.driver && !veh.dead;
  const t = b.translation(), lv = b.linvel(), q = b.rotation();
  const h = veh.h, fx = Math.sin(h), fz = Math.cos(h);
  const thr = hasDriver && veh.fuel > 0 ? veh.throttle : 0, brk = hasDriver ? veh.brake : 0, st = hasDriver ? veh.steer : 0;
  if (spec.craft === 'boat') {
    const wt = G.waterAt(t.x, t.z), wy = wt ? wt.y : -99;
    const inWater = wt && t.y < wy + 0.8;
    if (inWater) {
      const target = wy + 0.1, a = clamp((target - t.y) * 38 - lv.y * 7, -30, 40);
      const nvy = lv.y + (22 + a) * dt;
      const vf = lv.x * fx + lv.z * fz, vl = lv.x * fz - lv.z * fx;
      const acc = thr * spec.accel * (1 - Math.max(0, vf) / spec.maxSpeed) - brk * (vf > 0.5 ? 14 : spec.accel * 0.4 * Math.max(0, 1 + vf / 8));
      let nvx = lv.x + (fx * acc - fz * vl * 3.2) * dt, nvz = lv.z + (fz * acc + fx * vl * 3.2) * dt;
      nvx -= lv.x * 0.25 * dt; nvz -= lv.z * 0.25 * dt;
      b.setLinvel({ x: nvx, y: nvy, z: nvz }, true);
      const w = b.angvel(); b.setAngvel({ x: w.x * 0.5, y: lerp(w.y, -st * 1.15 * clamp(Math.abs(vf) / 4, 0, 1), 1 - Math.exp(-3 * dt)), z: w.z * 0.5 }, true);
      if (Math.abs(vf) > 4 && Math.random() < dt * 30) G.fx.tireSmoke(t.x - fx * 3 + rand(-0.8, 0.8), t.z - fz * 3 + rand(-0.8, 0.8));
    } else b.setLinvel({ x: lv.x * (1 - 2.5 * dt), y: lv.y, z: lv.z * (1 - 2.5 * dt) }, true);
    uprightAssist(b, 0.2);
  } else if (spec.craft === 'heli') {
    veh.spool = clamp((veh.spool || 0) + (hasDriver && veh.fuel > 0 ? 0.45 : -0.2) * dt, 0, 1);
    const sp = veh.spool, up = hasDriver ? (veh.hand ? 1 : 0) - (veh.down ? 1 : 0) : 0;
    const alt = t.y;
    // lift: hover at spool 1, collective changes climb rate
    const hover = sp > 0.85 ? 22 : sp * 18;
    let ay = hover + (sp > 0.85 ? up * 12 : 0);
    if (sp > 0.85 && !up) ay += clamp(-lv.y * 6, -12, 12);
    b.applyImpulse({ x: 0, y: m * ay * dt, z: 0 }, true);
    const f = thr - brk;
    const hv = Math.hypot(lv.x, lv.z), vf = lv.x * fx + lv.z * fz, vl = lv.x * fz - lv.z * fx;
    if (sp > 0.85) {
      const acc = f * spec.accel * (1 - clamp(vf / spec.maxSpeed, -1, 1) * Math.sign(f || 1));
      b.applyImpulse({ x: m * (fx * acc - lv.x * 0.15) * dt, y: 0, z: m * (fz * acc - lv.z * 0.15) * dt }, true);
    }
    const w = b.angvel(); b.setAngvel({ x: 0, y: lerp(w.y, -st * 1.5 * (sp > 0.85 ? 1 : 0.2), 1 - Math.exp(-4 * dt)), z: 0 }, true);
    veh.tiltFwd = damp(veh.tiltFwd || 0, f * 0.2, 3, dt); veh.tiltRoll = damp(veh.tiltRoll || 0, -st * 0.15, 3, dt);
  }
}
function uprightAssist(b, k) {
  const q = b.rotation(); const sy = 2 * Math.atan2(q.y, q.w);
  const qq = { x: 0, y: Math.sin(sy / 2), z: 0, w: Math.cos(sy / 2) };
  const l = (a, c) => a + (c - a) * k;
  const nq = { x: l(q.x, qq.x), y: l(q.y, qq.y), z: l(q.z, qq.z), w: l(q.w, qq.w) }; const n = Math.hypot(nq.x, nq.y, nq.z, nq.w) || 1;
  b.setRotation({ x: nq.x / n, y: nq.y / n, z: nq.z / n, w: nq.w / n }, true);
}
export function motoAssist(b) { uprightAssist(b, 0.12); const w = b.angvel(); b.setAngvel({ x: w.x * 0.3, y: w.y, z: w.z * 0.3 }, true); }
