import * as THREE from 'three';
import { Builder } from './gfx.js';
import { Vehicle } from './vehicle.js';
import { Human } from './human.js';
import { heightAt } from './terrain.js';
import { clamp, damp, rand, TAU, angDiff } from './util.js';

// War machines the player can drive or fly: main battle tank, attack helicopter (gunship) and a VTOL fighter. They come from the army base
// (one block of the city, guarded) or from enemy units that were shot up until their crew bailed out (Military.abandon).
//
// Controls (the camera is the aim): LMB = primary weapon, RMB = secondary weapon, W/S throttle, A/D steer / yaw, Space = lift / vertical
// thrust, Shift = descend, F = leave. The tank turret and the gunship's gun slew toward the point under the crosshair; the fighter's nose
// follows the camera (mouse-aim flight). Ammo is finite: it is refilled, together with fuel and armour, on the base's supply pad.

// weapon kits: [primary, secondary]
const KITS = {
  tank: [
    { id: 'cannon', name: '120mm 주포', max: 24, rate: 2.2, dmg: 150, radius: 7.5, speed: 210, shell: 'shell' },
    { id: 'mg', name: '동축 기관총', max: 600, rate: 0.075, dmg: 11, range: 380, auto: true },
  ],
  gunship: [
    { id: 'gun', name: '30mm 기관포', max: 800, rate: 0.055, dmg: 10, range: 420, auto: true, cone: 0.75 },
    { id: 'rocket', name: '로켓 포드', max: 24, rate: 0.35, dmg: 85, radius: 6.5, speed: 150, shell: 'rocket', cone: 0.75, auto: true },
  ],
  jet: [
    { id: 'cannon', name: '20mm 기관포', max: 700, rate: 0.045, dmg: 13, range: 520, auto: true, cone: 0.1 },
    { id: 'missile', name: '공대지 미사일', max: 8, rate: 0.9, dmg: 165, radius: 9.5, speed: 170, shell: 'missile', cone: 0.1, homing: true },
  ],
};
const NAMES = { tank: '전차', gunship: '공격헬기', jet: '전투기' };
// base layout in the park block's frame (x east, z south), metres from its centre
const PADS = [
  { kind: 'tank', x: -24, z: 0, h: 0 },
  { kind: 'jet', x: 0, z: 10, h: 0 },
  { kind: 'gunship', x: 24, z: 10, h: Math.PI / 2 },
  { kind: 'darkstar', x: 13, z: -4, h: 0 },
];
const SUPPLY = { x: -9, z: -13, r: 7 };
const GUARDS = [[-31, -9, 1.57], [-31, 9, 1.57], [31, -9, -1.57], [31, 9, -1.57], [-24, -4, 0], [24, -4, 0], [0, -17, 3.14], [-6, 20, 3.14]];
const ARMY = { top: 0x39422b, pants: 0x2b3322, cap: 0x2b3322, trim: [0.5, 0.6, 0.3], hair: 0x111111 };

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const shellGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 6);

export class War {
  constructor(G) {
    this.G = G; this.proj = []; this.base = null; this.slots = []; this.guardT = 0; this.supplyT = 0; this.warned = false;
    this.pip = new THREE.Vector3(); this.aim = new THREE.Vector3(); this.lock = null; this.lockT = 0;
    this.shellMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.6, 0.2).multiplyScalar(3), toneMapped: false });
  }

  // ------------------------------------------------------------------ per-vehicle state
  kit(v) {
    if (!v.spec.war) return null;
    if (!v.war) v.war = { w: KITS[v.spec.war].map((k) => ({ ...k, ammo: k.max, cd: 0 })), sel: 0 };
    return v.war;
  }
  get active() { const v = this.G.vehicle; return v && v.spec.war && v.driver === 'player' ? v : null; }

  // ------------------------------------------------------------------ the base
  buildBase() {
    const G = this.G, r = G.world.baseRect; if (!r) return;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, hx = (r.x1 - r.x0) / 2, hz = (r.z1 - r.z0) / 2;
    this.base = { cx, cz, hx, hz };
    const B = new Builder(), col = G.world.colliders;
    const W = (x0, z0, x1, z1, h, c, tag = 'base') => { B.ext('decor', cx + x0, 0, cz + z0, cx + x1, h, cz + z1, c); col.addBox(cx + x0, cz + z0, cx + x1, cz + z1, h, tag); };
    // concrete apron + painted pads
    B.ext('decor', cx - hx, 0, cz - hz, cx + hx, 0.03, cz + hz, 0x4a4d52);
    for (const p of PADS) { const s = p.kind === 'jet' ? 8.6 : p.kind === 'darkstar' ? 8.4 : p.kind === 'tank' ? 6.2 : 7.2; B.ext('decor', cx + p.x - s, 0.03, cz + p.z - s, cx + p.x + s, 0.05, cz + p.z + s, 0x2e3136); B.ext('emit', cx + p.x - s, 0.05, cz + p.z - s, cx + p.x + s, 0.07, cz + p.z - s + 0.25, new THREE.Color(1, 0.8, 0.2), 1.2); B.ext('emit', cx + p.x - s, 0.05, cz + p.z + s - 0.25, cx + p.x + s, 0.07, cz + p.z + s, new THREE.Color(1, 0.8, 0.2), 1.2); }
    B.ext('decor', cx + SUPPLY.x - SUPPLY.r, 0.03, cz + SUPPLY.z - SUPPLY.r, cx + SUPPLY.x + SUPPLY.r, 0.06, cz + SUPPLY.z + SUPPLY.r, 0x1f5a3c);
    B.ext('emit', cx + SUPPLY.x - 0.2, 0.06, cz + SUPPLY.z - 3.2, cx + SUPPLY.x + 0.2, 0.08, cz + SUPPLY.z + 3.2, new THREE.Color(0.2, 1, 0.5), 1.6);
    B.ext('emit', cx + SUPPLY.x - 3.2, 0.06, cz + SUPPLY.z - 0.2, cx + SUPPLY.x + 3.2, 0.08, cz + SUPPLY.z + 0.2, new THREE.Color(0.2, 1, 0.5), 1.6);
    // perimeter wall with a 16 m gate in the west and east sides
    const t = 0.5, gate = 8;
    W(-hx, -hz, hx, -hz + t, 2.6, 0x5b6068); W(-hx, hz - t, hx, hz, 2.6, 0x5b6068);
    for (const s of [-1, 1]) { const x0 = s < 0 ? -hx : hx - t, x1 = s < 0 ? -hx + t : hx; W(x0, -hz + t, x1, -gate, 2.6, 0x5b6068); W(x0, gate, x1, hz - t, 2.6, 0x5b6068); B.ext('emit', cx + x0, 2.6, cz - hz + t, cx + x1, 2.75, cz - gate, new THREE.Color(1, 0.2, 0.15), 1.4); B.ext('emit', cx + x0, 2.6, cz + gate, cx + x1, 2.75, cz + hz - t, new THREE.Color(1, 0.2, 0.15), 1.4); }
    // gate posts with striped barrier arms (decor only: vehicles drive through, guards decide the rest)
    for (const s of [-1, 1]) for (const zz of [-gate, gate]) { B.ext('decor', cx + s * (hx - 1) - 0.6, 0, cz + zz - 0.6, cx + s * (hx - 1) + 0.6, 3.2, cz + zz + 0.6, 0x34383e); B.ext('emit', cx + s * (hx - 1) - 0.65, 3.2, cz + zz - 0.65, cx + s * (hx - 1) + 0.65, 3.35, cz + zz + 0.65, new THREE.Color(1, 0.15, 0.1), 2); }
    // watch towers on the corners, a command bunker, container stack and a fuel tank
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const x = sx * (hx - 3), z = sz * (hz - 3); W(x - 1.6, z - 1.6, x + 1.6, z + 1.6, 7, 0x4a5236); B.ext('decor', cx + x - 2.4, 7, cz + z - 2.4, cx + x + 2.4, 7.4, cz + z + 2.4, 0x23271c); B.ext('emit', cx + x - 2.2, 7.4, cz + z - 0.2, cx + x + 2.2, 7.6, cz + z + 0.2, new THREE.Color(1, 0.95, 0.75), 2.2); }
    W(8, -20, 28, -12, 4.2, 0x5a6246); B.ext('decor', cx + 7.6, 4.2, cz - 20.4, cx + 28.4, 4.5, cz - 11.6, 0x2b3322); B.ext('emit', cx + 12, 2.6, cz - 11.9, cx + 14, 3.4, cz - 11.8, new THREE.Color(1, 0.8, 0.3), 1.6);
    W(-34, 14, -30, 18.5, 2.7, 0x7a3a22); W(-34, 19, -30, 21.5, 2.7, 0x2d5a78);
    B.cyl('decor', cx + 30, 0, cz - 4, 2.4, 4.5, 0x6e7440, 16); col.addCircle(cx + 30, cz - 4, 2.4, 4.5, 'base');
    // crates on the supply pad
    for (const [x, z] of [[-14.5, -18.5], [-13, -17.2], [-4, -18.5]]) W(x - 0.8, z - 0.8, x + 0.8, z + 0.8, 1.5, 0x5b4a2a);
    B.finish(G.scene);
    G.world.fakeLights.push({ x: cx, y: 5, z: cz, c: [1, 0.9, 0.7], rad: 36 }, { x: cx - hx + 2, y: 4, z: cz, c: [1, 0.25, 0.2], rad: 14 }, { x: cx + hx - 2, y: 4, z: cz, c: [1, 0.25, 0.2], rad: 14 });
    for (const p of PADS) this.slots.push({ ...p, v: null, t: 999, home: { x: cx + p.x, z: cz + p.z } });
    for (const s of this.slots) this.stock(s);
    this.guards(true);
  }
  stock(s) {
    const G = this.G, v = new Vehicle(G, s.kind, s.kind === 'darkstar' ? 0x0b0d12 : s.kind === 'jet' ? 0x59606c : 0x4a5236, 'parked', { glow: [1, 0.3, 0.2] });
    v.x = s.home.x; v.z = s.home.z; v.h = s.kind === 'gunship' ? 1.57 : s.kind === 'jet' || s.kind === 'darkstar' ? 0 : -1.57; v.startY = v.spec.cy + 0.25; v.awake = false; v.base = true;
    G.addVehicle(v); s.v = v; s.t = 0; this.kit(v);
  }
  guards(first) {
    const G = this.G, b = this.base; if (!b) return;
    this.crew = (this.crew || []).filter((h) => !h.dead && G.humans.includes(h));
    for (let k = this.crew.length; k < GUARDS.length; k++) {
      const [lx, lz, ry] = GUARDS[k];
      const h = new Human(G, 'gang', { hp: 120, weapon: k % 3 === 0 ? 3 : 2, look: ARMY });
      h.x = b.cx + lx; h.z = b.cz + lz; h.ry = ry; h.home = { x: h.x, z: h.z }; h.patrol = false; h.state = 'idle'; h.detect = 38; h.guard = true; h.static = true; h.lookAtPlayer = false; h.cash = Math.floor(rand(40, 120)); h.base = true;
      G.humans.push(h); G.scene.add(h.group); this.crew.push(h); if (!first) h.group.visible = false;
    }
  }
  inBase(x, z, m = 0) { const b = this.base; return !!b && Math.abs(x - b.cx) < b.hx + m && Math.abs(z - b.cz) < b.hz + m; }

  // ------------------------------------------------------------------ frame update
  update(dt) {
    const G = this.G;
    if (this.base) {
      const pl = G.vehicle || G.player;
      if (!this.warned && this.inBase(pl.x, pl.z, 22)) { this.warned = true; G.toast('<span style="color:#ff5a4a">군 기지 · 접근 금지</span>', '무단 침입 시 발포'); }
      if (!this.inBase(pl.x, pl.z, 80)) this.warned = false;
      // restock the pads (and the guards) while nobody is around
      this.guardT -= dt;
      if (this.guardT <= 0) {
        this.guardT = 4;
        const far = Math.hypot(pl.x - this.base.cx, pl.z - this.base.cz) > 130;
        for (const s of this.slots) {
          if (s.v && (s.v.dead || !G.vehicles.includes(s.v) || Math.hypot(s.v.x - s.home.x, s.v.z - s.home.z) > 14)) { s.v = null; s.t = 0; }
          if (!s.v) { s.t += 4; if (s.t > 240 && far) this.stock(s); }
        }
        if (far && this.crew.length < GUARDS.length) { this.crewT = (this.crewT || 0) + 4; if (this.crewT > 180) { this.crewT = 0; this.guards(false); } }
      }
    }
    // supply pad
    const v = this.active;
    if (v && this.base) this.supply(v, dt);
    if (v) { this.drive(v, dt); } else { this.lock = null; }
    this.stepProj(dt);
  }
  supply(v, dt) {
    const G = this.G, b = this.base, dx = v.x - (b.cx + SUPPLY.x), dz = v.z - (b.cz + SUPPLY.z);
    if (Math.hypot(dx, dz) > SUPPLY.r || v.speed > 3 || (v.by || 0) > 5) { this.supplyT = 0; return; }
    const kit = this.kit(v); let did = false;
    for (const w of kit.w) if (w.ammo < w.max) { w.ammo = Math.min(w.max, w.ammo + w.max * 0.25 * dt); did = true; }
    if (v.fuel < 100) { v.fuel = Math.min(100, v.fuel + 25 * dt); did = true; }
    if (v.hp < v.maxHp) { v.hp = Math.min(v.maxHp, v.hp + v.maxHp * 0.1 * dt); if (v.dead) v.dead = false; v.burn = v.hp < v.maxHp * 0.3 ? v.burn : 0; did = true; }
    if (did) { this.supplyT += dt; if (this.supplyT > 0.01 && !this.supplyMsg) { this.supplyMsg = true; G.toast('<span style="color:#47ffa8">보급 중</span>', '탄약 · 연료 · 장갑'); } } else if (this.supplyMsg) { this.supplyMsg = false; G.toast('보급 완료'); }
  }

  // ------------------------------------------------------------------ driving: aim, turret, fire
  // world position and direction the camera looks along; the aim point is where that ray meets the city or the ground
  aimPoint(out) {
    const G = this.G, c = G.camera; c.getWorldDirection(tmpA);
    const o = c.position, d = tmpA; let t = G.world.colliders.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 700); if (t < 0) t = 700;
    if (d.y < -1e-4) { const tg = -(o.y - 0) / d.y; if (tg > 0 && tg < t) t = tg; }
    return out.set(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
  }
  muzzle(v, pos, dir) {
    const m = v.model.muzzle; if (!m) { pos.set(v.x, v.by + 1, v.z); dir.set(Math.sin(v.h), 0, Math.cos(v.h)); return; }
    v.group.updateMatrixWorld(true); m.getWorldPosition(pos); m.getWorldQuaternion(tmpQ); dir.set(0, 0, 1).applyQuaternion(tmpQ);
  }
  drive(v, dt) {
    const G = this.G, kit = this.kit(v), inp = G.inp || {}, war = v.spec.war;
    this.aimPoint(this.aim);
    v.aimYaw = G.cam.yaw; v.aimPitch = clamp(G.cam.pitch, -1, 1);
    // turret / gun slew
    if (war === 'tank') {
      const hull = v.h, dx = this.aim.x - v.x, dz = this.aim.z - v.z, dist = Math.max(8, Math.hypot(dx, dz));
      const want = Math.atan2(dx, dz) - hull; v.turYaw = (v.turYaw || 0) + clamp(angDiff(v.turYaw || 0, want), -1.15 * dt, 1.15 * dt);
      const wp = clamp(Math.atan2(this.aim.y - (v.by + 1.0), dist), -0.14, 0.55); v.turPitch = (v.turPitch || 0) + clamp(wp - (v.turPitch || 0), -0.7 * dt, 0.7 * dt);
    }
    for (const w of kit.w) w.cd = Math.max(0, w.cd - dt);
    // pipper: where the muzzle points
    this.muzzle(v, tmpB, tmpC); this.fireDir(v, kit.w[0], tmpB, tmpC);
    this.pip.copy(tmpB).addScaledVector(tmpC, 160);
    this.target(v, tmpB, tmpC, dt);
    if (G.frozen?.() || G.player.dead) return;
    if (inp.fire) this.shoot(v, kit.w[0], dt);
    if (inp.aim) this.shoot(v, kit.w[1], dt);
    // tracks crush what they roll over
    if (war === 'tank' && v.speed > 1.5) this.crush(v, dt);
    if (war === 'jet') { v.group.userData.bank = v.bank; this.airEffects(v, dt); }
  }
  // supersonic show: a boom as it crosses Mach 1, vapour at the wing tips, a fire and plasma trail that grows with speed, shake
  airEffects(v, dt) {
    const G = this.G, m = v.speed / 343, pm = v.pm ?? 0; v.pm = m;
    const fx = Math.sin(v.h), fz = Math.cos(v.h), cp = Math.cos(v.pitchA || 0), sp = Math.sin(v.pitchA || 0), L = v.spec.L / 2;
    const px = v.x, py = v.by, pz = v.z;
    if (m >= 1 && pm < 1) {
      G.audio.tone?.(46, 0.9, 'sine', 0.55, 20); G.audio.explosion?.(0.35, 0); G.shake(0.9); G.toast?.('<span style="color:#9fe8ff">MACH 1</span>', '음속 돌파');
      for (let k = 0; k < 28; k++) { const a = k / 28 * TAU; G.smokeP.emit(px + fx * L, py, pz + fz * L, Math.cos(a) * 14 * fz - Math.sin(a) * 0, Math.sin(a) * 14, -Math.cos(a) * 14 * fx, rand(0.6, 1.1), rand(3, 5), 0.9, 0.95, 1, 0.7, 0.2, 0.4); }
    }
    if (v.speed > 150) {
      const thr = v.thrLvl || 0, n = 2 + Math.round(thr * 3 + Math.min(3, m * 0.5));
      for (let k = 0; k < n; k++) G.fireP.emit(px - fx * cp * L + rand(-0.4, 0.4), py - sp * L + rand(-0.3, 0.3), pz - fz * cp * L + rand(-0.4, 0.4), -fx * 12, 0, -fz * 12, rand(0.25, 0.6), rand(1.2, 2.4) * (1 + Math.min(1.5, m * 0.2)), 1.2, 2.2, 3.5, 1, -1, 1.2);
      if (m >= 1) { v.vapT = (v.vapT || 0) - dt; if (v.vapT <= 0) { v.vapT = 0.04; for (const sx of [-1, 1]) G.smokeP.emit(px - fx * 2 + fz * sx * 3.2, py, pz - fz * 2 - fx * sx * 3.2, -fx * 4, 0.4, -fz * 4, rand(0.7, 1.4), rand(1.5, 3), 0.9, 0.95, 1, 0.45, 0.2, 0.4); } }
      if (m >= 3 && v.pPrev) G.tracers.add(tmpB.set(v.pPrev[0], v.pPrev[1], v.pPrev[2]), tmpC.set(px - fx * L, py, pz - fz * L), m > 6 ? [1, 0.95, 0.85] : [0.5, 0.85, 1]);
      G.shake(clamp(m * 0.004, 0, 0.07));
    }
    v.pPrev = [px - fx * L, py, pz - fz * L];
    const fxEl = G.ui.machFx; if (fxEl) { const o = clamp((m - 0.8) / 7, 0, 0.95); if (Math.abs((v._fxo ?? -1) - o) > 0.01) { v._fxo = o; fxEl.style.opacity = o; } }
  }
  // direction the weapon actually fires: the barrel for the tank; for the others the line to the aim point, limited to the gimbal cone
  fireDir(v, w, pos, dir) {
    if (v.spec.war === 'tank' || !w.cone) return dir;
    tmpA.copy(this.aim).sub(pos).normalize();
    const ang = tmpA.angleTo(dir);
    if (ang > w.cone) { tmpA.lerpVectors(dir, tmpA, w.cone / ang).normalize(); }
    return dir.copy(tmpA);
  }
  shoot(v, w, dt) {
    const G = this.G;
    if (w.cd > 0) return;
    if (w.ammo < 1) { if (!w.dry) { w.dry = true; G.audio.tone?.(180, 0.06, 'square', 0.1); G.toast('탄약 부족', '기지의 보급 구역으로'); setTimeout(() => (w.dry = false), 1500); } return; }
    w.ammo--; w.cd = w.rate;
    const pos = tmpB, dir = tmpC;
    if (v.spec.war === 'gunship' && w.id === 'rocket') {
      const side = (w.ammo & 1) ? v.model.rocketL : v.model.rocketR; v.group.updateMatrixWorld(true); side.getWorldPosition(pos); v.model.muzzle.getWorldQuaternion(tmpQ); dir.set(0, 0, 1).applyQuaternion(tmpQ);
    } else if (v.spec.war === 'tank' && w.id === 'mg') {
      v.group.updateMatrixWorld(true); v.model.mgMuzzle.getWorldPosition(pos); v.model.muzzle.getWorldQuaternion(tmpQ); dir.set(0, 0, 1).applyQuaternion(tmpQ);
    } else this.muzzle(v, pos, dir);
    this.fireDir(v, w, pos, dir);
    G.noise?.(v.x, v.z, w.shell ? 140 : 90); G.addHeatIfWitnessed?.(w.shell ? 1.5 : 0.25);
    if (w.shell) {
      const sp = w.speed, vel = dir.clone().multiplyScalar(sp);
      if (w.id === 'rocket') { vel.x += rand(-1.5, 1.5); vel.y += rand(-1.5, 1.5); vel.z += rand(-1.5, 1.5); }
      vel.x += v.vx * 0.5; vel.z += v.vz * 0.5;
      const m = new THREE.Mesh(shellGeo, this.shellMat); m.scale.set(1, w.shell === 'shell' ? 0.9 : 1.2, 1); m.position.copy(pos); m.quaternion.setFromUnitVectors(tmpA.set(0, 1, 0), vel.clone().normalize()); G.scene.add(m);
      const p = { m, p: pos.clone(), v: vel, w, src: v, life: w.shell === 'shell' ? 4 : 7, target: w.homing ? this.lock : null, trail: 0 };
      this.proj.push(p);
      G.fx.muzzle(pos, dir, false); G.audio.explosion?.(w.shell === 'shell' ? 0.6 : 0.3, 0); if (w.shell === 'shell') { G.shake(0.7); if (v.spec.war === 'tank') v.addImpulse(-dir.x * 0.5, 0, -dir.z * 0.5); }
      if (w.shell === 'rocket' || w.shell === 'missile') G.audio.tone?.(w.shell === 'missile' ? 520 : 420, 0.35, 'sawtooth', 0.12, 80);
    } else {
      // machine gun / autocannon: a hitscan with a little spread
      const sp = 0.012; tmpA.set(dir.x + rand(-sp, sp), dir.y + rand(-sp, sp), dir.z + rand(-sp, sp)).normalize();
      const r = G.hitscan(pos.x, pos.y, pos.z, tmpA.x, tmpA.y, tmpA.z, w.range, G.player, w.dmg, 1.5);
      const end = tmpC.copy(pos).addScaledVector(tmpA, r.t);
      G.tracers.add(pos, end, v.spec.war === 'jet' ? [1, 0.9, 0.5] : [1, 0.7, 0.3]);
      if (!(w.ammo % 2)) { G.fx.muzzle(pos, tmpA, false); }
      G.audio.gun(w.id === 'mg' ? 'rifle' : 'smg', 0.7, 0, false);
      if (r.kind === 'human' || r.kind === 'vehicle' || r.kind === 'military') G.markHit(false);
      if (r.kind === 'ground' || r.kind === 'world') { if (w.dmg >= 10 && Math.random() < 0.15) G.explosion(end.x, end.y, end.z, 2.4, 14, v); }
    }
  }
  // missile lock: the nearest hostile or vehicle inside a 10 degree cone in front of the muzzle, kept for 0.6 s before it counts
  target(v, pos, dir, dt) {
    const G = this.G; let best = null, bd = 0.18;
    if (v.spec.war !== 'jet') { this.lock = null; return; }
    const consider = (o, x, y, z) => {
      tmpA.set(x - pos.x, y - pos.y, z - pos.z); const d = tmpA.length(); if (d < 30 || d > 650) return;
      const a = tmpA.normalize().angleTo(dir); if (a < bd) { bd = a; best = o; }
    };
    for (const e of [...G.military.heli, ...G.military.tank]) if (!e.dead) consider(e, e.x, e.kind === 'heli' ? e.y : 1.7, e.z);
    for (const o of G.vehicles) if (o !== v && !o.dead && o.group.visible && (o.police || o.kind === 'traffic' || o.kind === 'parked')) consider(o, o.x, (o.by || 1) + 0.6, o.z);
    if (best !== (this.lock && this.lock.o)) { this.lock = best ? { o: best, t: 0 } : null; } else if (this.lock) this.lock.t += dt;
  }
  crush(v, dt) {
    const G = this.G;
    for (const h of G.humans) { if (h.dead || h.rag) continue; if (Math.hypot(h.x - v.x, h.z - v.z) < 2.9 && Math.abs((h.y || 0) - (v.by - v.spec.cy)) < 2) h.hurt(999, G.player, false, G.player); }
    for (const o of G.vehicles) { if (o === v || o.dead || !o.pv || o.spec.war) continue; const d = Math.hypot(o.x - v.x, o.z - v.z); if (d < 5.2) { o.damage(300 * dt, v); o.awake = true; o.pv.body.wakeUp(); o.addImpulse((o.x - v.x) / (d || 1) * 5, 1.2, (o.z - v.z) / (d || 1) * 5); } }
  }

  // ------------------------------------------------------------------ projectiles
  stepProj(dt) {
    const G = this.G;
    for (const s of this.proj) {
      const prev = tmpA.copy(s.p);
      // missiles steer toward their target
      if (s.w.homing && s.target && !(s.target.o.dead)) {
        const o = s.target.o, ty = o.kind === 'heli' ? o.y : o.kind === 'tank' ? 1.7 : (o.by || 1) + 0.6;
        tmpB.set(o.x - s.p.x, ty - s.p.y, o.z - s.p.z).normalize(); const sp = s.v.length(); const cur = tmpC.copy(s.v).normalize();
        const a = cur.angleTo(tmpB), k = Math.min(1, 1.9 * dt / Math.max(a, 0.001)); cur.lerp(tmpB, k).normalize(); s.v.copy(cur).multiplyScalar(sp);
      }
      if (s.w.shell === 'shell') s.v.y -= 22 * 0.35 * dt;
      s.p.addScaledVector(s.v, dt); s.life -= dt; s.m.position.copy(s.p); s.m.quaternion.setFromUnitVectors(tmpB.set(0, 1, 0), tmpC.copy(s.v).normalize());
      s.trail -= dt; if (s.trail <= 0) { s.trail = 0.03; G.smokeP.emit(s.p.x, s.p.y, s.p.z, rand(-0.2, 0.2), rand(-0.2, 0.2), rand(-0.2, 0.2), rand(1.4, 2.2), rand(0.5, 0.9), 0.75, 0.75, 0.75, 0.5, 0.1, 0.3); }
      let boom = s.life <= 0 || s.p.y <= heightAt(s.p.x, s.p.z) + 0.12 || !G.hasLOS(prev.x, prev.y, prev.z, s.p.x, s.p.y, s.p.z);
      if (!boom) {
        const dir = tmpB.copy(s.v).normalize(), len = s.v.length() * dt + 1.2, mh = G.military?.rayHit(prev.x, prev.y, prev.z, dir.x, dir.y, dir.z, len);
        if (mh) { G.military.damage(mh.e, s.w.dmg * 0.8, s.src, false); boom = true; }
      }
      if (!boom) {
        for (const o of G.vehicles) { if (o === s.src || o.dead || !o.group.visible) continue; if (Math.abs(o.x - s.p.x) < o.W / 2 + 1 && Math.abs(o.z - s.p.z) < o.L / 2 + 1 && Math.abs(s.p.y - ((o.by || 0))) < 3) { boom = true; break; } }
        if (!boom) for (const h of G.humans) { if (h.dead || h.hidden || !h.group.visible) continue; if (Math.abs(h.x - s.p.x) < 0.9 && Math.abs(h.z - s.p.z) < 0.9 && s.p.y - h.y > 0 && s.p.y - h.y < 2) { boom = true; break; } }
      }
      if (boom) { G.scene.remove(s.m); s.dead = true; G.explosion(s.p.x, Math.max(0.4, s.p.y), s.p.z, s.w.radius, s.w.dmg, s.src); G.markHit?.(false); }
    }
    if (this.proj.some((s) => s.dead)) this.proj = this.proj.filter((s) => !s.dead);
  }

  // ------------------------------------------------------------------ camera (called from Game.updateCamera)
  camera(v, dt) {
    const G = this.G, cam = G.cam, c = G.camera, war = v.spec.war;
    cam.pitch = clamp(cam.pitch, war === 'tank' ? -0.3 : -1.25, war === 'tank' ? 0.65 : 1.2);
    const mode = cam.mode, big = war === 'jet' ? 21 : war === 'gunship' ? 17 : 13;
    const ax = v.rx ?? v.x, az = v.rz ?? v.z, ay0 = (v.rby ?? v.by ?? 1) + (war === 'tank' ? 1.2 : 1.0);
    const cp = Math.cos(cam.pitch), L = G.tmpV.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    if (mode === 2) {
      // gunner sight / cockpit: from the muzzle (tank) or the nose (aircraft)
      this.muzzle(v, tmpB, tmpC);
      const base = war === 'tank' ? tmpB.set(ax, ay0 + 1.4, az).addScaledVector(L, 1.5) : tmpB.set(ax, ay0 + 0.9, az).addScaledVector(tmpC.set(Math.sin(v.rh ?? v.h), 0, Math.cos(v.rh ?? v.h)), war === 'jet' ? 2.6 : 2.2);
      c.position.copy(base); c.lookAt(base.x + L.x * 30, base.y + L.y * 30, base.z + L.z * 30);
      cam.fov = damp(cam.fov, war === 'tank' ? 34 : 70, 6, dt);
    } else {
      const dist = (mode === 0 ? big : big * 1.6) + (war === 'jet' ? Math.min(34, v.speed * 0.05) : v.speed * 0.02);
      let tx = ax - L.x * dist, ty = ay0 - L.y * dist + (war === 'jet' ? 2.5 : 3.2), tz = az - L.z * dist;
      const dx = tx - ax, dy = ty - ay0, dz = tz - az, d = Math.hypot(dx, dy, dz);
      const hit = G.world.colliders.raycast(ax, ay0, az, dx / d, dy / d, dz / d, d);
      let k = 1; if (hit >= 0) k = Math.max(0.2, (hit - 0.5) / d);
      tx = ax + dx * k; ty = Math.max(0.6, ay0 + dy * k); tz = az + dz * k;
      cam.smoothPos.lerp(tmpB.set(tx, ty, tz), 1 - Math.exp(-(war === 'jet' ? (v.speed > 120 ? 260 : 18) : 12) * dt));
      if (cam.smoothPos.lengthSq() < 1) cam.smoothPos.set(tx, ty, tz);
      c.position.copy(cam.smoothPos);
      c.lookAt(ax + L.x * 30, ay0 + L.y * 30 + 1.5, az + L.z * 30);
      cam.fov = damp(cam.fov, 62 + (war === 'jet' ? clamp(v.speed * 0.12, 0, 18) + clamp(v.speed / 343 - 1.5, 0, 8.5) * 4.5 : 0), 4, dt);
    }
  }

  // ------------------------------------------------------------------ HUD
  hud(ui) {
    const v = this.active, el = ui.war; if (!el) return;
    const on = !!v; if (this._on !== on) { this._on = on; el.classList.toggle('on', on); }
    if (!on) { if (ui.machFx && ui.machFx.style.opacity !== '0') ui.machFx.style.opacity = 0; return; }
    const kit = this.kit(v), war = v.spec.war, nm = v.spec.title || NAMES[war];
    const rows = kit.w.map((w, i) => `<div class="wr"><b>${i ? 'RMB' : 'LMB'}</b> ${w.name}<span>${w.id === 'cannon' && w.cd > 0 ? '장전 중' : Math.floor(w.ammo)}</span></div>`).join('');
    const alt = Math.max(0, Math.round((v.by ?? 0) - v.spec.cy));
    const info = `${nm} · HP ${Math.max(0, Math.round(v.hp / v.maxHp * 100))}% · 연료 ${Math.round(v.fuel)}%` + (war === 'tank' ? '' : ` · 고도 ${alt}m`) + (war === 'jet' ? ` · 스로틀 ${Math.round((v.thrLvl || 0) * 100)}%` + (v.speed > 100 ? ` · MACH ${(v.speed / 343).toFixed(1)}` : '') + (v.returning ? ' · 경계 이탈: 자동 선회' : '') : '');
    const key = rows + info; if (key !== this._key) { this._key = key; ui.warRows.innerHTML = rows; ui.warInfo.textContent = info; }
    // pipper
    const cam = this.G.camera, p = this.pip.clone().project(cam), ok = p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2;
    ui.warPip.style.display = ok ? 'block' : 'none'; if (ok) { ui.warPip.style.left = (p.x * 0.5 + 0.5) * 100 + '%'; ui.warPip.style.top = (-p.y * 0.5 + 0.5) * 100 + '%'; }
    const lk = this.lock;
    if (lk) { const o = lk.o, q = tmpB.set(o.x, o.kind === 'heli' ? o.y : (o.by || 1) + 0.8, o.z).project(cam), okl = q.z < 1; ui.warLock.style.display = okl ? 'block' : 'none'; if (okl) { ui.warLock.style.left = (q.x * 0.5 + 0.5) * 100 + '%'; ui.warLock.style.top = (-q.y * 0.5 + 0.5) * 100 + '%'; } ui.warLock.classList.toggle('lk', lk.t > 0.6); } else ui.warLock.style.display = 'none';
  }
  // the base bumps the wanted level when a war machine is taken out from under the guards
  onBoard(v) {
    const G = this.G; this.kit(v);
    if (v.base && this.inBase(v.x, v.z, 6)) {
      const armed = (this.crew || []).some((h) => !h.dead);
      v.base = false; G.addHeat?.(armed ? 120 : 70); G.feed?.('군 장비 탈취', '#ff4560'); G.toast('<span style="color:#ff5a4a">군 장비 탈취</span>', '군이 추적을 시작합니다');
    }
    G.toast(`<span style="color:#47ffa8">${v.spec.title || NAMES[v.spec.war]} 탑승</span>`, v.spec.war === 'tank' ? '좌클릭 주포 · 우클릭 기관총 · C 시점' : v.spec.war === 'gunship' ? '좌클릭 기관포 · 우클릭 로켓 · Space 상승' : '좌클릭 기관포 · 우클릭 미사일 · Space 수직 추력');
  }
}
export { NAMES as WAR_NAMES, KITS as WAR_KITS };
void TAU;
