import * as THREE from 'three';
import { buildCar, CAR_SPECS, idMark, disposeOwned } from './models.js';
import { N, P, R, LANE, HALF, roadC, roadIdx, hasEdge } from './world.js';
import { clamp, lerp, damp, angDiff, rand, TAU, stopSpeed } from './util.js';
import { driveVehicle, PHYS } from './physics.js';
import { physHeight } from './landfn.js';
import { buildCustom, CRAFT_SPECS, createCraftBody, driveCraft, motoAssist } from './craft.js';

// The static floor under (x, z) looking down from 3 m above y (a bridge deck, a road over the terrain, a floor), or NaN over nothing within 60 m.
// Starting near y, not high up, keeps a car under a bridge on the ground; cars and people are not floors (GPL-15).
export function floorBelow(phys, x, y, z) { const h = phys.ray(x, y + 3, z, 0, -1, 0, 60, 1 | 16); return h ? y + 3 - h.t : NaN; }
const QB = new THREE.Quaternion();

export const CAR_COLORS = [0x1a2433, 0x7a1020, 0xc9ced8, 0x0d3b66, 0x2b2f38, 0xe0b020, 0x14654b, 0x5a1f7a, 0xd8d8d0, 0x111418, 0x8a2a10, 0x1c6fa8];
const GLOWS = [[0.2, 0.9, 1], [1, 0.2, 0.8], [0.6, 0.3, 1], [0.2, 1, 0.5], [1, 0.5, 0.15], [1, 0.15, 0.2]];
const tmpV = new THREE.Vector3();
let uid = 0;
// a vertex normal of length 0 (the vertices of triangles with no area, which the model has: they are never seen) becomes NaN in the shader's normalize the moment a dent
// moves the vertex and the triangle shows; it points up instead. Read and written as the attribute holds them (the wheels' are 16-bit integers)
function fixZeroNormals(geo) {
  const nor = geo.attributes.normal; if (!nor) return 0; let n = 0;
  for (let i = 0; i < nor.count; i++) { const x = nor.getX(i), y = nor.getY(i), z = nor.getZ(i); if (!(x * x + y * y + z * z > 1e-6)) { nor.setXYZ(i, 0, 1, 0); n++; } }
  if (n) nor.needsUpdate = true; return n;
}
// how far (km) a full tank takes a road vehicle, or how long (hours) it keeps an aircraft or boat going
const FUEL = { sedan: { km: 650 }, sport: { km: 480 }, suv: { km: 600 }, truck: { km: 800 }, roadster: { km: 400 }, moto: { km: 350 }, bus: { km: 700 }, boat: { hours: 4 }, heli: { hours: 2.5 }, gunship: { hours: 2.2 }, tank: { hours: 8 }, jet: { hours: 1.3 }, darkstar: { hours: 1.3 } };

export class Vehicle {
  constructor(G, type, color, kind = 'parked', opts = {}) {
    this.G = G; this.id = ++uid;
    this.type = type; this.kind = kind; // parked | traffic | police | player
    const police = kind === 'police', taxi = opts.taxi;
    const base = CAR_SPECS[type] || CRAFT_SPECS[type];
    const mo = { police, taxi, hero: kind === 'player' || !!opts.glow, glow: opts.glow || GLOWS[Math.floor(Math.random() * GLOWS.length)] };
    this.idMark = idMark();
    this.model = base.custom ? buildCustom(type, color, mo) : buildCar(type, police ? 0x0c1220 : taxi ? 0xe8b820 : color, mo);
    this.group = this.model.group;
    if (police) {
      // white doors stripe via a second paint mesh overlay is skipped; keep dark livery with light bar
    }
    this.spec = { ...base }; this.fuel = 100; this.mods = { engine: 0, tires: 0, armor: 0 };
    this.L = this.spec.L; this.W = this.spec.W;
    this.x = 0; this.z = 0; this.h = 0; this.vx = 0; this.vz = 0; this.yaw = 0;
    this.pitch = 0; this.roll = 0; this.steerA = 0; this.wheelSpin = 0;
    this.hp = this.spec.hp; this.maxHp = this.spec.hp; this.dead = false; this.burn = 0; this.explodeT = 0;
    this.throttle = 0; this.brake = 0; this.steer = 0; this.hand = false;
    this.driver = null; // 'player' | 'ai' | null
    this.lightsOn = true; this.slip = 0; this.age = 0; this.stuck = 0;
    this.ai = { speed: rand(11, 16), wp: [], node: null, dir: null, wait: 0, honk: 0 };
    this.police = police;
    this.group.userData.vehicle = this;
    this.mass = this.spec.mass;
    this.lastSpeed = 0; this.impactCd = 0;
    this.sleep = false;
    this.fadeIn = 0;
    this.siren = police;
    this.group.visible = false;
    this.underColor = this.model.ug.material.uniforms.uColor.value;
    this.setLights(kind !== 'parked' || Math.random() < 0.25);
  }
  // free the GPU buffers and materials this car made for itself once it has left the world (traffic recycles cars all the time)
  dispose() { disposeOwned(this.group, this.idMark); }
  setLights(on) {
    this.lightsOn = on;
    this.model.head.visible = on; this.model.beams.visible = on;
    this.model.headSprites.forEach((s) => (s.visible = on));
    this.model.tailSprites.forEach((s) => (s.visible = on || this.model.brake.visible));
    this.model.ug.visible = on && this.kind !== 'parked';
  }
  // crumple the body mesh around a world-space impact point (geometry is cloned lazily so shared models stay intact)
  dent(wx, wz, amt) {
    if ((this.dentTotal = (this.dentTotal || 0) + amt) > 14) return;
    const g = this.model.group; g.updateMatrixWorld(true);
    const lp = g.worldToLocal(new THREE.Vector3(wx, 0.7, wz)), v = new THREE.Vector3(), r = 1.5;
    g.traverse((m) => {
      if (!m.isMesh || m === this.doorMesh || m.userData.noDent) return;
      // the original positions as the attribute reads them (the wheels' positions are stored as 16-bit integers: the raw array is another scale)
      if (!m.userData.dentGeo) { m.geometry = m.geometry.clone(); m.userData.dentGeo = true; const a0 = m.geometry.attributes; if (a0.position) { const pa = a0.position, f = new Float32Array(pa.count * 3); for (let i = 0; i < pa.count; i++) { f[i * 3] = pa.getX(i); f[i * 3 + 1] = pa.getY(i); f[i * 3 + 2] = pa.getZ(i); } m.userData.dentPos = f; } fixZeroNormals(m.geometry); }
      const pos = m.geometry.attributes.position; if (!pos) return;
      m.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(g.matrixWorld).invert().multiply(m.matrixWorld);
      const back = new THREE.Matrix4().copy(inv).invert(); let ch = false;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(inv);
        const dx = v.x - lp.x, dz = v.z - lp.z, d = Math.hypot(dx, dz); if (d > r || v.y < 0.25) continue;
        const f = (1 - d / r) * amt;   // by where the vertex is, never by its number: vertices that share a place (the body is not indexed) moved by different amounts and tore it into shards
        const l = Math.hypot(v.x, v.z) || 1; v.x -= v.x / l * f; v.z -= v.z / l * f; v.y -= f * 0.15;
        v.applyMatrix4(back);
        // the crumple has a depth: a vertex is never more than 0.5 m from where it was drawn (an 878 km/h crash dented it 25 times and the vertices went through the
        // axis and onto each other: triangles of no area, vertex normals of length 0, and a NaN pixel for each in the lighting)
        const o0 = m.userData.dentPos, ox = o0[i * 3], oy = o0[i * 3 + 1], oz = o0[i * 3 + 2], ex = v.x - ox, ey = v.y - oy, ez = v.z - oz, el = Math.hypot(ex, ey, ez);
        if (el > 0.5) { const k = 0.5 / el; v.x = ox + ex * k; v.y = oy + ey * k; v.z = oz + ez * k; }
        if (pos.normalized) { v.x = Math.max(-1, Math.min(1, v.x)); v.y = Math.max(-1, Math.min(1, v.y)); v.z = Math.max(-1, Math.min(1, v.z)); }   // a 16-bit position past its range wraps to the other side of the part
        pos.setXYZ(i, v.x, v.y, v.z); ch = true;
      }
      if (ch) {
        pos.needsUpdate = true;
        // a body whose vertices are not shared keeps the normals it was drawn with: recomputed, every triangle got its own and the car turned into facets
        if (m.geometry.index) m.geometry.computeVertexNormals();
        fixZeroNormals(m.geometry);   // recomputed normals of vertices whose triangles have no area are of length 0 as well
      }
    });
  }
  doorFx() { if (this.spec.craft || this.type === 'moto' || this.type === 'bus') return; this.doorT = 1.3; this.model.group.updateMatrixWorld(); if (!this.doorMesh) { const pv = new THREE.Group(); pv.position.set(this.W / 2, 0.8, 0.55); const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 1.1), new THREE.MeshStandardMaterial({ color: 0x2c3448, roughness: 0.3, metalness: 0.7 })); m.position.set(0.02, 0, -0.55); pv.add(m); this.group.add(pv); this.doorMesh = pv; } this.G.audio.door?.(); }
  animDoor(dt) { if (!this.doorMesh) return; if (this.doorT > 0) { this.doorT -= dt; const k = Math.sin(Math.min(1, (1.3 - this.doorT) / 0.35) * Math.PI / 2) * (this.doorT > 0.35 ? 1 : this.doorT / 0.35); this.doorMesh.rotation.y = k * 1.15; this.doorMesh.visible = true; } else this.doorMesh.visible = false; }
  place(x, z, h) { this.x = x; this.z = z; this.h = h; this.vx = this.vz = 0; this.yaw = 0; if (this.pv) { this.syncToBody(); this.readBody(0); } this.syncMesh(); }
  get speed() { return this.spec.craft === 'jet' && this.jetS != null ? this.jetS : Math.hypot(this.vx, this.vz); }
  get fwdSpeed() { return this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h); }
  circles(out) {
    const s = Math.sin(this.h), c = Math.cos(this.h), r = this.W * 0.5 * 0.95, o = this.L * 0.3;
    out[0] = [this.x + s * o, this.z + c * o, r]; out[1] = [this.x, this.z, r]; out[2] = [this.x - s * o, this.z - c * o, r];
    return out;
  }
  // the model is drawn between the body's pose before and after the last physics step (see Physics.alpha): x / z / h stay the simulated
  // state for the game logic, rx / rz / rh / rby are where the car is on screen this frame (camera, headlights, a rider on the roof)
  syncMesh() {
    const g = this.group, pv = this.pv;
    if (pv && this.q) {
      const q = this.q, cy = this.spec.cy ?? PHYS.bodyY;
      if (pv.prevNo === this.phys.stepNo) {
        const a = this.phys.alpha, p = pv.prev;
        g.position.set(p[0] + (this.x - p[0]) * a, p[1] + (this.by - p[1]) * a - cy, p[2] + (this.z - p[2]) * a);
        g.quaternion.set(p[3], p[4], p[5], p[6]).slerp(QB.set(q.x, q.y, q.z, q.w), a);
      } else {
        g.position.set(this.x, this.by - cy, this.z);
        g.quaternion.set(q.x, q.y, q.z, q.w);
      }
      const r = g.quaternion;
      this.rx = g.position.x; this.rz = g.position.z; this.rby = g.position.y + cy;
      this.rh = Math.atan2(2 * (r.x * r.z + r.w * r.y), 1 - 2 * (r.x * r.x + r.y * r.y));
    } else { g.position.set(this.x, this.baseY(), this.z); g.rotation.set(0, this.h, 0); this.rx = this.x; this.rz = this.z; this.rh = this.h; this.rby = this.by; }   // before its body is read: on the ground under it (not at 0)
    if (this.model.syncWheels) this.model.syncWheels(this.wheelSpin, -this.steerA);
    else { this.model.front.rotation.y = -this.steerA; this.model.fa.rotation.x = this.wheelSpin; this.model.ra.rotation.x = this.wheelSpin; }
  }
  damage(amount, src) {
    if (this.dead) return;
    if (this.spec.armored) amount *= 1 - this.spec.armored;   // war machines: plating takes part of every hit
    this.hp -= amount;
    if (this.hp <= 0) this.destroy(src);
    else if (this.hp < this.maxHp * 0.3) this.burn = Math.max(this.burn, 0.5);
  }
  destroy(src) {
    if (this.dead) return;
    this.dead = true; this.burn = 1; this.explodeT = 1.2 + Math.random() * 1.2;
    this.throttle = 0; this.brake = 0; this.steer = 0;
    let mt = this.model.paint; if (mt && mt.isMesh) { mt.material = mt.material.clone(); mt = mt.material; }
    if (mt) { mt.color.setHex(0x1a1512); mt.metalness = 0.1; mt.roughness = 0.9; }
    this.setLights(false);
    this.G.onVehicleDestroyed?.(this, src);
  }
  explode() {
    this.G.explosion(this.x, this.baseY() + 1.0, this.z, 9, 90, this);   // at the car, on the ground it stands on (the 1:1 ground is not at 0)
    this.explodeT = 0; this.burn = 2;
    if (this.driver === 'player') this.G.playerVehicleExploded(this);
    if (this.pv) this.addImpulse(rand(-3, 3), 6 + rand(0, 3), rand(-3, 3));
    this.exploded = true;
  }

  // ---------- Physics (Rapier rigid body + raycast suspension) ----------
  attachPhysics(phys) {
    this.phys = phys;
    this.pv = this.spec.craft ? createCraftBody(phys, this.spec, this.x, this.startY ?? this.craftStartY(), this.z, this.h) : phys.createVehicle(this.spec, this.x, this.z, this.h);
    this.pv.owner = this;
    this.syncToBody(true);
    this.spawnY = null;   // used once: a later teleport finds its own ground
    this.readBody(0);
  }
  detachPhysics() { if (this.pv) { this.phys.removeVehicle(this.pv); this.pv = null; } }
  // a car put down on raised ground starts on it, not at the flat city's height (it would be inside the hill and never get out)
  // A spawner that knows the floor (a bridge deck: physHeight is the ground under it, GPL-15) sets spawnY.
  groundRise() { if (this.spawnY != null) return this.spawnY; const h = physHeight(this.x, this.z, 8); return h > 0 ? h : 0; }
  // the height the car stands at (its body centre less the body's height over the ground); before the body was read: the ground under it
  baseY() { return this.by != null && this.by === this.by ? this.by - (this.spec.cy ?? PHYS.bodyY) : this.groundRise(); }
  // where a craft's body starts when the spawner gave no height: its own height over the ground (or road deck) under it (the ground is not at 0 in the 1:1 world)
  craftStartY() { return (this.G.groundY ? this.G.groundY(this.x, this.z) : 0) + this.spec.cy + 0.25; }
  // Teleport body to current x,z,h and velocity fields
  syncToBody(sleep = false) {
    const b = this.pv.body;
    b.setTranslation({ x: this.x, y: this.spec.craft ? (this.startY ?? this.craftStartY()) : PHYS.bodyY + 0.05 + this.groundRise(), z: this.z }, true);
    b.setRotation({ x: 0, y: Math.sin(this.h / 2), z: 0, w: Math.cos(this.h / 2) }, true);
    b.setLinvel({ x: this.vx, y: 0, z: this.vz }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (sleep) b.sleep();
    this.flipT = 0; this.pv.prevNo = -1;   // teleported: drawn where it is, not swept from the old place
  }
  setVel(vx, vz) { const lv = this.pv.body.linvel(); this.pv.body.setLinvel({ x: vx, y: lv.y, z: vz }, true); this.vx = vx; this.vz = vz; }
  addImpulse(ix, iy, iz) { this.pv.body.applyImpulse({ x: ix * this.pv.mass, y: iy * this.pv.mass, z: iz * this.pv.mass }, true); }
  readBody(dt) {
    const b = this.pv.body, t = b.translation(), q = b.rotation(), lv = b.linvel();
    this.x = t.x; this.z = t.z; this.by = t.y;
    const fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    this.h = Math.atan2(fx, fz);
    this.vx = lv.x; this.vz = lv.z; this.vy = lv.y;
    if (this.hv) { this.vx = this.hv.x; this.vy = this.hv.y; this.vz = this.hv.z; }   // hypersonic craft are moved by hand, the body's own velocity is 0
    this.yaw = b.angvel().y;
    this.q = q;
  }
  // Pre-step: AI + driver intent + visual-only state
  control(dt) {
    this.age += dt;
    if (this.impactCd > 0) this.impactCd -= dt;
    const G = this.G;
    if (this.dead) {
      this.throttle = 0; this.brake = 0.3; this.steer = 0;
      if (this.explodeT > 0 && (this.explodeT -= dt) <= 0) this.explode();
      if (this.burn > 0.2 && Math.random() < dt * 24) G.fx.fire(this.x + rand(-1, 1), this.baseY() + 0.8 + Math.random(), this.z + rand(-1, 1));   // flames on the wreck, not at sea level under it
    } else if (this.burn > 0 && this.hp < this.maxHp * 0.3) {
      const yb = this.baseY();   // smoke and flames from the engine where the car is (the ground is not at 0)
      if (Math.random() < dt * 8) G.fx.smoke(this.x + Math.sin(this.h) * this.L * 0.35, yb + 1.0, this.z + Math.cos(this.h) * this.L * 0.35);
      if (this.hp < this.maxHp * 0.12) { this.hp -= dt * 2; if (this.hp <= 0) this.destroy(null); if (Math.random() < dt * 14) G.fx.fire(this.x + rand(-.6, .6), yb + 1, this.z + rand(-.6, .6)); }
    }
    if (this.driver === 'ai' && !this.dead) this.driveAI(dt);
    if (this.fuel <= 0 && this.driver === 'player') this.throttle = 0;
    const aVf = Math.abs(this.fwdSpeed);
    const maxSteer = lerp(0.52, 0.075, clamp(aVf / 34, 0, 1)) * (this.hand ? 1.25 : 1) * (this.spec.boost ? clamp(55 / Math.max(aVf, 55), 0.07, 1) : 1);   // the roadster's wheels hardly turn at 1,000 km/h
    this.steerA = damp(this.steerA, this.steer * maxSteer, 9, dt);
    this.maxSteerNow = maxSteer;
  }
  // Called before every physics sub-step
  applyDrive() {
    if (this.spec.craft) return driveCraft(this, 1 / 60);
    const hasDriver = this.driver && !this.dead;
    if (this.spec.boost) this.boostStep(hasDriver, 1 / 60);
    driveVehicle(this.pv, {
      throttle: hasDriver && !this.flooded ? this.throttle : 0, brake: hasDriver ? this.brake : (this.dead ? 0.4 : 0.15),
      steer: this.maxSteerNow ? this.steerA / this.maxSteerNow : 0, maxSteer: this.maxSteerNow || 0.3,
      hand: hasDriver && this.hand, speedFwd: this.fwdSpeed, dead: this.dead || !hasDriver, parked: !this.dead && this.kind === 'parked', wet: this.G.daynight?.wet || 0, health: this.hp / this.maxHp,
    });
    if (this.type === 'moto') motoAssist(this.pv.body);
  }
  // roadster: Shift fires the rocket booster (2.6x thrust, top speed +45%) while its tank lasts (7 s, refills in 20 s); aerodynamic downforce
  // grows with speed squared so it stays on the road
  boostStep(hasDriver, dt) {
    const sp = this.spec, pvs = this.pv.spec; this.b0 = this.b0 || { a: sp.accel, m: sp.maxSpeed };
    if (this.boostFuel == null) this.boostFuel = 100;
    const on = hasDriver && !!this.down && this.boostFuel > 0;
    if (on && !this.boosting) { this.G.audio.tone?.(70, 0.8, 'sawtooth', 0.35, 400); this.G.shake(0.5); }
    this.boosting = on; this.boostFuel = clamp(this.boostFuel + (on ? -14 : 5) * dt, 0, 100);
    pvs.maxSpeed = this.b0.m * (on ? 1.45 : 1);
    // the rocket pushes the body through its centre of mass (1.6x the launch limit on top of the wheels: 2.6x in all); put through the rear tyres'
    // contact patches that thrust reared the car up onto its tail under real gravity
    const v = this.speed;
    if (on && this.fwdSpeed < pvs.maxSpeed) { const J = this.pv.mass * this.b0.a * 1.6 * dt; this.pv.body.applyImpulse({ x: Math.sin(this.h) * J, y: 0, z: Math.cos(this.h) * J }, true); }
    // downforce as on a high-downforce car (2.4 g at 500 km/h, held at 2.5 g): under real gravity the old 0.7 g let a 3 cm seam at 450 km/h lift the
    // nose and spin the car round on its rear wheels. Active suspension stiffens the springs with it, so the car keeps its 16 cm of sag instead of
    // bottoming out and dragging its floor into the road
    const down = v > 25 ? Math.min(0.0012 * v * v, 2.5 * 9.81) : 0;
    if (down) this.pv.body.applyImpulse({ x: 0, y: -this.pv.mass * down * dt, z: 0 }, true);
    const c = this.pv.ctrl, kS = PHYS.springK * (1 + down / 9.81); if (c && Math.abs(c.wheelSuspensionStiffness(0) - kS) > 0.05) for (let i = 0; i < 4; i++) c.setWheelSuspensionStiffness(i, kS);
    // on-rails grip: sideways speed is bled off so it follows its nose even when the wheels spin (the handbrake loosens it for drifting)
    const b = this.pv.body, lv = b.linvel(), fx = Math.sin(this.h), fz = Math.cos(this.h), vl = lv.x * fz - lv.z * fx, k = Math.min(1, (this.hand ? 1.2 : 7) * dt);
    b.setLinvel({ x: lv.x - fz * vl * k, y: lv.y, z: lv.z + fx * vl * k }, true);
    if (hasDriver && Math.abs(this.steer) < 0.05) { const w = b.angvel(); b.setAngvel({ x: w.x, y: w.y * (1 - Math.min(1, 5 * dt)), z: w.z }, true); }
  }
  // After the physics step(s): sync fields, impact detection, visuals
  post(dt) {
    const G = this.G;
    const pvx = this.vx, pvz = this.vz;
    this.readBody(dt);
    this.waterStep(dt);
    const sH = Math.sin(this.h), cH = Math.cos(this.h);
    const vf = this.vx * sH + this.vz * cH, vl = this.vx * -cH + this.vz * sH;
    // impact = sudden planar velocity loss that engines/brakes cannot explain
    const isJet = this.spec.craft === 'jet', jet = isJet && this.cmdV, dv = jet ? Math.hypot(this.vx - this.cmdV.x, this.vz - this.cmdV.z, (this.vy || 0) - this.cmdV.y) : isJet ? 0 : Math.hypot(this.vx - pvx, this.vz - pvz);   // aircraft: an impact is what the world took from the commanded velocity (hypersonic ones are swept by ray in stepJet)
    // a teleport (recovery, a test's reset) sets the velocity outright: that speed change is no crash for the next two frames (noImpact)
    if (this.noImpact > 0) this.noImpact--;
    else if (dt > 0 && dv > (jet ? 8 : 2.6 + this.spec.accel * dt * 0.6)) {
      const ix = this.x + sH * this.L * 0.5 * Math.sign(vf || 1), iz = this.z + cH * this.L * 0.5 * Math.sign(vf || 1);
      this.onImpact(dv, ix, iz, null); this.vyW = null;
    } else if (dt > 0) this.fallImpact();
    this.slip = clamp((Math.abs(vl) - 2.2) / 6, 0, 1) * clamp(Math.abs(vf) / 8, 0, 1);
    // flipped & stuck -> right the car
    if (this.q) {
      const q = this.q, up = 1 - 2 * (q.x * q.x + q.z * q.z);
      if (up < 0.35 && this.speed < 2.5) { this.flipT = (this.flipT || 0) + dt; if (this.flipT > 2.2) { this.pv.body.setRotation({ x: 0, y: Math.sin(this.h / 2), z: 0, w: Math.cos(this.h / 2) }, true); const f = floorBelow(this.phys, this.x, this.by ?? 0, this.z); this.pv.body.setTranslation({ x: this.x, y: (f === f ? f : this.groundRise()) + 1.4, z: this.z }, true); this.pv.body.setAngvel({ x: 0, y: 0, z: 0 }, true); this.flipT = 0; this.pv.prevNo = -1; this.noImpact = 2; } } else this.flipT = 0;
    }
    // fell through the ground (a deck that was not built yet, a hole): back to the last height it stood at once it has been under the ground for half a second
    if (!this.spec.craft && this.by != null) {
      const gh = physHeight(this.x, this.z, 8);
      if (this.by >= gh - 1) this.goodY = this.by;
      else if (this.by < gh - 5 && this.goodY != null) {
        this.lostT = (this.lostT || 0) + dt;
        if (this.lostT > 0.5) { this.G?.highways?.ensureNear?.(this.x, this.z); this.pv.body.setTranslation({ x: this.x, y: this.goodY + 1.4, z: this.z }, true); this.pv.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.pv.body.setAngvel({ x: 0, y: 0, z: 0 }, true); this.lostT = 0; this.pv.prevNo = -1; this.noImpact = 2; }
      } else this.lostT = 0;
    }
    this.wheelSpin += (vf * dt) / this.model.wheelR;
    const hasDriver = this.driver && !this.dead;
    const braking = hasDriver && (this.brake > 0.1 && vf > 0.5 || this.throttle > 0 && vf < -0.5);
    if (this.model.brake.visible !== braking) { this.model.brake.visible = braking; if (!this.lightsOn) this.model.tailSprites.forEach((s) => (s.visible = braking)); }
    if (this.slip > 0.4 && Math.random() < dt * 30) G.fx.tireSmoke(this.x - sH * this.L * 0.3, this.z - cH * this.L * 0.3, this.baseY());
    if (this.model.siren) {
      const ph = Math.floor(G.time * 6) % 2 === 0;
      this.model.siren.rs.visible = ph; this.model.siren.bs.visible = !ph;
    }
    this.lastSpeed = this.speed;
    if (this.driver === 'player' && !this.dead) {
      // the tank empties by the distance driven (a full one is the car's range: 650 km for a sedan, as a 50 L tank at 7.5 L/100 km), 0.55 at a steady
      // cruise up to 1.45 at full throttle, and 0.0005 %/s at idle (0.8 L/h); an aircraft or boat by the hour (its endurance). It was 3.4 % a kilometre
      // for a sedan at 90 km/h (a tank was gone in 30 km, 20 times what the car really drinks) in a country that is 400 km from end to end
      const k = FUEL[this.type] || FUEL.sedan, th = Math.abs(this.throttle);
      this.fuel = Math.max(0, this.fuel - (k.hours ? dt * 100 / (k.hours * 3600) * (0.6 + 0.8 * th) : Math.abs(vf) * dt / 1000 * (100 / k.km) * (0.55 + 0.9 * th) + dt * 0.0005));
    }
    this.model.craftVisual?.(this, dt); this.animDoor(dt);
    // the boost flame leaves the tail at its height over the car's own ground (the 1:1 ground is not at 0)
    if (this.boosting) { const fx = Math.sin(this.h), fz = Math.cos(this.h), yb = this.baseY(); for (let k = 0; k < 3; k++) G.fireP.emit(this.x - fx * 2.4 + rand(-0.4, 0.4), yb + 0.55 + rand(0, 0.2), this.z - fz * 2.4 + rand(-0.4, 0.4), -fx * 10, 0.3, -fz * 10, rand(0.2, 0.45), rand(0.9, 1.7), 1.2, 2.2, 3.5, 1, -1, 1.2); }
    if (this.kind === 'parked' && !this.driver && !this.dead && this.speed < 0.15) { this.idleT = (this.idleT || 0) + dt; if (this.idleT > 1) { this.pv.body.sleep(); this.idleT = 0; } } else this.idleT = 0;
    this.syncMesh();
  }

  // a fall is a sudden loss of downward speed (a car off a bridge, a tank off a cliff, a helicopter dropped): the planar speed change in post() never
  // saw it, so a car that landed from 20 m was whole. The loss counts 1.3 times (nothing in a body crumples vertically as it does head on), and the
  // springs' first 2 m/s are taken out and onImpact's own threshold takes 4 more: a 2 m hop costs 5 %, a 10 m fall a third of a car, 20 m over half, 40 m wrecks it
  fallImpact() {
    if (this.spec.craft === 'jet' || this.spec.craft === 'boat' || this.dead) return;
    const w = this.vyW || (this.vyW = []), t = this.age, vy = this.vy || 0;
    w.push(t, vy); while (w.length > 2 && t - w[0] > 0.3) w.splice(0, 2);
    if (this.noImpact > 0) { w.length = 0; return; }
    let pk = 0; for (let i = 1; i < w.length; i += 2) pk = Math.min(pk, w[i]);
    if (pk < -4.5 && vy - pk > 4) { w.length = 0; this.onImpact(Math.max(0, -pk - 2) * 1.3 * (this.inWater ? 0.4 : 1), this.x, this.z, null); }   // 2 m/s of it is the springs'; water takes most of a landing
  }
  // a road vehicle in water (checked every 0.1 s): the wading drag of the water it pushes aside, then at 0.55 m (the air intake) the engine floods and
  // stays dead; a car with a closed cabin floats on its hull for a while and sinks as it fills (25-45 s), a bike does not float; a driver whose head
  // is under for 5 s drowns. Under a roof (a tunnel under a river) or on a deck above the water this does not apply
  waterStep(dt) {
    if (this.spec.craft || !this.pv) return;
    this.wT = (this.wT || 0) + dt; if (this.wT < 0.1) return; dt = this.wT; this.wT = 0;
    const G = this.G, w = this.by != null ? G.waterAt(this.x, this.z) : null, base = this.baseY(), sub = w ? w.y - base : 0;
    if (!w || sub < 0.15 || this.by == null) { this.inWater = 0; this.floatT = Math.max(0, (this.floatT || 0) - dt * 0.5); this.floodT = Math.max(0, (this.floodT || 0) - dt * 0.2); this.drownT = 0; return; }
    if (this.phys.rayT(this.x, this.by + 1, this.z, 0, 1, 0, 12, 1) >= 0) { this.inWater = 0; return; }   // covered: not open water
    this.inWater = sub;
    const b = this.pv.body, lv = b.linvel(), m = this.pv.mass, sp = Math.hypot(lv.x, lv.z);
    // the bow wave of a vehicle driven through water: 0.5 rho Cd A v^2 on the immersed front (water 1000 kg/m^3)
    if (sp > 0.3) { const F = 0.5 * 1000 * 0.35 * this.W * Math.min(sub, 0.9) * sp * sp, k = Math.min(F * dt / m, sp * 0.8) / sp; b.applyImpulse({ x: -lv.x * k * m, y: 0, z: -lv.z * k * m }, true); }
    if (sub > 0.55) this.floodT = (this.floodT || 0) + dt; else this.floodT = Math.max(0, (this.floodT || 0) - dt * 0.2);
    if (this.floodT > 1.2 && !this.flooded) {
      this.flooded = true; this.throttle = 0; this.setLights(false);
      if (this.driver === 'player') G.toast?.('엔진이 물에 잠겼다', '시동이 꺼졌습니다');
    }
    if (this.type !== 'moto' && sub > 0.25) {
      this.floatT = (this.floatT || 0) + dt;
      const leak = this.floatT < 25 ? 1 : Math.max(0, 1 - (this.floatT - 25) / 20);   // the cabin fills: the hull's lift goes
      const fill = 0.5 * this.L * this.W * Math.min(sub, 1.0), Fb = 1000 * 9.81 * fill * leak, om = Math.sqrt(1000 * 9.81 * 0.5 * this.L * this.W / m);
      const J = (Fb - 0.8 * m * om * lv.y) * Math.min(dt, 0.12);   // the lift less a damper at 0.4 of critical, so the hull settles on its waterline
      b.applyImpulse({ x: 0, y: J, z: 0 }, true);
      const wv = b.angvel(); b.setAngvel({ x: wv.x * (1 - Math.min(1, 3 * dt)), y: wv.y, z: wv.z * (1 - Math.min(1, 3 * dt)) }, true);
      if (leak > 0 && sp > 0.3) { const k = Math.min(1, 0.6 * dt); b.applyImpulse({ x: -lv.x * m * k, y: 0, z: -lv.z * m * k }, true); }   // afloat, a car is dragged along by the water
    }
    if (this.driver === 'player' && sub > 1.5) { this.drownT = (this.drownT || 0) + dt; if (this.drownT > 5) G.hurtPlayer?.(14 * dt, null, 'drown'); } else this.drownT = 0;
  }
  onImpact(speed, x, z, other) {
    if (speed < 2.2 || this.impactCd > 0) return;
    this.impactCd = 0.25;
    const G = this.G;
    if (speed > 6 && !this.spec.craft) this.dent(x, z, Math.min(0.55, speed * 0.03));
    // a road vehicle loses a share of its strength by the speed change (a rigid wall at 50 km/h costs ~30%, at 130 km/h it is wrecked), whatever
    // its weight (a car hit by a truck takes the bigger speed change itself); craft and war machines keep their armour by mass
    const dmg = this.dead ? 0 : this.spec.craft ? Math.max(0, speed - 4) * 3.2 / (this.mass * 0.8 + 0.2) : Math.max(0, speed - 4) * 0.03 * this.maxHp;
    if (dmg > 0) this.damage(dmg, other);
    G.fx.sparks(x, this.baseY() + 0.6, z, Math.min(speed * 0.8, 24), [1, 0.7, 0.3]);   // at the bumpers' height over the car's own ground
    G.audio.crash(clamp(speed / 20, 0.2, 1.2), 0);
    if (this.driver === 'player') G.shake(clamp(speed / 14, 0.1, 1.2)), G.onPlayerCrash?.(speed);
  }

  // ---------- AI: traffic + police ----------
  nodeIJ(x, z) { return [roadIdx(x), roadIdx(z)]; }
  setRoute(i, j, di, dj, startAlong = 0.5) {
    // place car on lane between node (i,j) and (i+di, j+dj)... car starts at fraction along edge
    const ai = this.ai;
    const a = [roadC(i), roadC(j)], b = [roadC(i + di), roadC(j + dj)];
    const rx = -dj, rz = di; // right vector for dir (di,dj) in (x,z): right=(-dz,dx)
    this.x = lerp(a[0], b[0], startAlong) + rx * LANE;
    this.z = lerp(a[1], b[1], startAlong) + rz * LANE;
    this.h = Math.atan2(di, dj);
    ai.node = [i + di, j + dj]; ai.dir = [di, dj]; ai.wp = [];
    this.vx = Math.sin(this.h) * 8; this.vz = Math.cos(this.h) * 8;
    if (this.pv) { this.syncToBody(); this.readBody(0); this.syncMesh(); }
    this.planAhead();
  }
  planAhead() {
    const ai = this.ai; const G = this.G;
    let [ni, nj] = ai.node; let [di, dj] = ai.dir;
    let guard = 0;
    while (ai.wp.length < 4 && guard++ < 4) {
      // choose next direction at node
      const opts = [];
      const cand = [[di, dj, 0.62], [-dj, di, 0.19], [dj, -di, 0.19]]; // straight, right?, left?
      for (const [cdi, cdj, w] of cand) {
        const ti = ni + cdi, tj = nj + cdj;
        if (ti < 0 || ti > N || tj < 0 || tj > N || !hasEdge(ni, nj, cdi, cdj)) continue;
        opts.push([cdi, cdj, w]);
      }
      if (!opts.length) opts.push([-di, -dj, 1]);
      let pick = opts[0];
      const goal = this.police ? this.chaseTarget : this.dest;
      if (goal) {
        const tx = goal.x, tz = goal.z; let best = 1e9;
        for (const o of opts) { const d = Math.hypot(roadC(ni + o[0]) - tx, roadC(nj + o[1]) - tz) + (o[0] === -di && o[1] === -dj ? 200 : 0) - (o[0] === di && o[1] === dj ? 3 : 0); if (d < best) { best = d; pick = o; } }
      } else {
        let t = Math.random() * opts.reduce((s, o) => s + o[2], 0);
        for (const o of opts) { t -= o[2]; if (t <= 0) { pick = o; break; } }
      }
      const [pdi, pdj] = pick;
      const X = roadC(ni), Z = roadC(nj);
      const r1 = [-dj, di], r2 = [-pdj, pdi];
      if (pdi === di && pdj === dj) {
        ai.wp.push({ x: X + r1[0] * LANE, z: Z + r1[1] * LANE, node: [ni, nj], speed: 1 });
      } else if (pdi === -di && pdj === -dj) {
        // u-turn: go around
        ai.wp.push({ x: X + r1[0] * LANE, z: Z + r1[1] * LANE, speed: 0.4 });
        ai.wp.push({ x: X + r2[0] * LANE, z: Z + r2[1] * LANE, speed: 0.4 });
      } else {
        const Cx = X + r1[0] * LANE + r2[0] * LANE, Cz = Z + r1[1] * LANE + r2[1] * LANE;
        const turnRight = (di * pdj - dj * pdi) > 0;
        const d0 = turnRight ? 7 : 12;
        const P0 = [Cx - di * d0, Cz - dj * d0], P2 = [Cx + pdi * d0, Cz + pdj * d0];
        for (let k = 0; k <= 4; k++) {
          const t = k / 4, u = 1 - t;
          ai.wp.push({ x: u * u * P0[0] + 2 * u * t * Cx + t * t * P2[0], z: u * u * P0[1] + 2 * u * t * Cz + t * t * P2[1], speed: 0.45 });
        }
      }
      ni += pdi; nj += pdj; di = pdi; dj = pdj;
      // approach point before next node
      const r3 = [-dj, di];
      ai.wp.push({ x: roadC(ni) - di * (R / 2 + 3) + r3[0] * LANE, z: roadC(nj) - dj * (R / 2 + 3) + r3[1] * LANE, speed: 1, stopFor: [ni, nj], axis: di !== 0 ? 'x' : 'z' });
    }
    ai.node = [ni, nj]; ai.dir = [di, dj];
  }
  driveAI(dt) {
    const G = this.G, ai = this.ai;
    const sH = Math.sin(this.h), cH = Math.cos(this.h);
    const vf = this.vx * sH + this.vz * cH;
    let target = ai.speed * (this.police ? 1 : 1 - 0.12 * Math.min(1, G.daynight?.wet || 0));   // drivers take it 12 % easier on a wet road (the police do not)
    // direct chase for police near target
    let tx, tz;
    if (this.dest && !this.police) {
      const dd = Math.hypot(this.dest.x - this.x, this.dest.z - this.z);
      if (dd < 22 && G.hasLOS(this.x, this.by ?? 1.2, this.z, this.dest.x, (this.by ?? 1.2) + 0.2, this.dest.z)) this.directDest = true;
      if (this.directDest) { tx = this.dest.x; tz = this.dest.z; target = Math.min(ai.speed, stopSpeed(dd - 6, 3.5)); if (dd < 8) { this.arrived = true; target = 0; } }
    }
    if (tx === undefined && this.police && this.chaseTarget && this.direct) {
      tx = this.chaseTarget.x; tz = this.chaseTarget.z;
      target = 24;
    } else if (tx === undefined) {
      if (!ai.wp.length) this.planAhead();
      let wp = ai.wp[0];
      // passed waypoints are dropped, at most 64 a frame (a planner that keeps handing out points next to the car must not hang the frame)
      for (let g = 0; wp && g < 64 && Math.hypot(wp.x - this.x, wp.z - this.z) < 5.5; g++) { ai.wp.shift(); wp = ai.wp[0]; if (ai.wp.length < 3) this.planAhead(); }
      if (!wp) { this.planAhead(); wp = ai.wp[0]; }
      if (!wp) wp = { x: this.x + sH * 20, z: this.z + cH * 20, speed: 0 };   // a planner with nothing to give (the end of a highway): stand still until it is recycled
      // look ahead further for smoother lane following
      const wp2 = ai.wp[1] || wp;
      const d1 = Math.hypot(wp.x - this.x, wp.z - this.z);
      const k = clamp(1 - d1 / 14, 0, 0.6);
      tx = lerp(wp.x, wp2.x, k); tz = lerp(wp.z, wp2.z, k);
      target *= wp.speed;
      // traffic light
      if (wp.stopFor && !this.police) {
        const st = G.world.lightState(wp.axis, G.time);
        const dist = d1;
        // blacked-out signals: treat the junction as all-way, roll through slowly
        if (G.power && G.power.offAt(roadC(wp.stopFor[0]), roadC(wp.stopFor[1]))) { if (dist < 26) target = Math.min(target, 5.5); }
        else if (st !== 'G' && dist < 12 + vf * vf / 6 && !(st === 'Y' && dist < vf * 1.4)) target = Math.min(target, stopSpeed(dist - 3, 3.5));   // stopping at the line at a driver's 3.5 m/s^2
      }
      if (this.police) target = Math.max(target, 18 * wp.speed);
    }
    // obstacle ahead
    const look = 10 + Math.max(vf, 0) * 0.9 + vf * vf / 10;   // as far as it takes to stop (5 m/s^2)
    const vl = G.vehicles;
    for (let vi = 0; vi < vl.length; vi++) {
      const o = vl[vi];
      if (o === this || !o.group.visible) continue;
      const dx = o.x - this.x, dz = o.z - this.z;
      const along = dx * sH + dz * cH;
      if (along < 1 || along > look + o.L * 0.5) continue;
      const lat = Math.abs(dx * cH - dz * sH);
      if (lat < (this.W + o.W) * 0.5 + 0.5) { const gap = along - o.L * 0.5 - this.L * 0.5 - 2.5; target = Math.min(target, gap > 0 ? stopSpeed(gap, 5, o.speed) : Math.min(o.speed * 0.5, 1)); /* slows to the car ahead's speed within the gap */ if (along < 6 && ai.honk <= 0 && Math.random() < 0.01) { ai.honk = 4; G.audio.horn?.(); } }
    }
    const hl = G.humans;
    for (let hi = 0; hi < hl.length; hi++) {
      const h = hl[hi];
      if (h.dead || h.hidden) continue;
      const dx = h.x - this.x, dz = h.z - this.z;
      const along = dx * sH + dz * cH;
      if (along < 0.5 || along > look * 0.9) continue;
      const lat = Math.abs(dx * cH - dz * sH);
      if (lat < this.W * 0.5 + 0.9) target = Math.min(target, stopSpeed(along - 4, 6));
    }
    if (G.playerOnFoot && G.player) {
      const dx = G.player.x - this.x, dz = G.player.z - this.z; const along = dx * sH + dz * cH;
      if (along > 0.5 && along < look * 0.9 && Math.abs(dx * cH - dz * sH) < this.W * 0.5 + 1) target = Math.min(target, stopSpeed(along - 4, 6));
    }
    if (ai.honk > 0) ai.honk -= dt;
    // steering: pure pursuit
    const dx = tx - this.x, dz = tz - this.z;
    const desired = Math.atan2(dx, dz);
    const err = angDiff(this.h, desired);
    this.steer = clamp(-err * 1.8, -1, 1);
    // speed control
    const dv = target - vf;
    if (dv > 0.5) { this.throttle = clamp(dv * 0.35, 0, 1); this.brake = 0; }
    else if (dv < -0.5) { this.throttle = 0; this.brake = clamp(-dv * 0.3, 0, 1); }
    else { this.throttle = 0.12; this.brake = 0; }
    this.hand = this.police && this.direct && Math.abs(err) > 0.9 && vf > 12;
    // stuck detection -> reverse
    if (this.speed < 0.6 && target > 3) { this.stuck += dt; } else this.stuck = Math.max(0, this.stuck - dt);
    if (this.stuck > 3.5) {
      this.reverse = 1.4; this.stuck = 0;
    }
    if (this.reverse > 0) { this.reverse -= dt; this.throttle = 0; this.brake = 1; this.steer *= -1; if (vf < 0.2) { this.throttle = 0; this.brake = 1; } }
  }
}
