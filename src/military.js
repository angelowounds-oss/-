import * as THREE from 'three';
import { N, HALF, roadC, roadIdx } from './world.js';
import { clamp, rand, TAU, dampAngle, angDiff } from './util.js';
import { Vehicle } from './vehicle.js';
import { keys as binds } from './keys.js';

// Escalating response to a high wanted level:
//   4 stars: one attack helicopter (searchlight, machine gun) + heavier SWAT officers
//   5 stars: two helicopters (also fire rockets), a main battle tank (drives the road grid toward you, shells + coax gun), soldiers
// They are real targets: bullets hurt helicopters, tanks only really care about explosives (grenades, blasts, wrecks, breach charges).
// Wanted level dropping (or sandbox "ignore wanted") sends them away.
const std = (c, r = 0.55, m = 0.5) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const cyl = (r0, r1, l, mat, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, l, seg), mat);
const UP = new THREE.Vector3(0, 1, 0);

function buildHeli() {
  const g = new THREE.Group(), body = std(0x1a2028, 0.45, 0.6), dark = std(0x0c0e12, 0.6, 0.4), glass = new THREE.MeshStandardMaterial({ color: 0x0a1822, roughness: 0.05, metalness: 0.8 });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), body); hull.scale.set(1.15, 1.2, 3.1); g.add(hull);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), glass); canopy.scale.set(0.95, 0.8, 1.5); canopy.position.set(0, 0.35, 1.5); g.add(canopy);
  const tail = cyl(0.28, 0.12, 5.2, body, 8); tail.rotation.x = Math.PI / 2; tail.position.set(0, 0.2, -5); g.add(tail);
  g.add(box(0.08, 1.2, 0.8, body, 0, 0.8, -7.3));
  const mast = cyl(0.12, 0.12, 0.7, dark, 8); mast.position.y = 1.3; g.add(mast);
  const rotor = new THREE.Group(); rotor.position.y = 1.7;
  for (let k = 0; k < 4; k++) { const b = box(0.35, 0.04, 6.2, dark); b.position.z = 3.1; const p = new THREE.Group(); p.rotation.y = k * Math.PI / 2; p.add(b); rotor.add(p); }
  g.add(rotor);
  const tr = new THREE.Group(); tr.position.set(0.25, 0.8, -7.4); for (let k = 0; k < 2; k++) { const b = box(0.04, 1.5, 0.12, dark); b.rotation.x = k * Math.PI / 2; tr.add(b); } g.add(tr);
  for (const s of [-1, 1]) { const sk = box(0.1, 0.1, 3.6, dark, s * 1.15, -1.35, 0.2); g.add(sk); for (const z of [-0.8, 1.2]) g.add(box(0.08, 0.7, 0.08, dark, s * 1.1, -1.0, z)); }
  for (const s of [-1, 1]) { const pod = cyl(0.18, 0.18, 1.6, dark, 8); pod.rotation.x = Math.PI / 2; pod.position.set(s * 1.5, -0.4, 0.6); g.add(pod); }
  const gun = cyl(0.04, 0.04, 1, dark, 6); gun.rotation.x = Math.PI / 2; gun.position.set(0, -1.0, 2.2); g.add(gun);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 0.9).multiplyScalar(3), toneMapped: false })); lamp.position.set(0, -1.15, 1.6); g.add(lamp);
  const nav = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.1, 0.1).multiplyScalar(3), toneMapped: false })); nav.position.set(0, 1.0, -7.5); g.add(nav);
  // searchlight beam (additive cone, re-aimed every frame)
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  beam.frustumCulled = false; g.userData = { rotor, tr, beam, lamp, nav };
  return g;
}
function buildTank() {
  const g = new THREE.Group(), olive = std(0x3a4430, 0.7, 0.35), dark = std(0x14161a, 0.8, 0.3), track = std(0x1d1f22, 0.9, 0.2);
  const hull = box(3.3, 1.0, 7.0, olive, 0, 1.0, 0); g.add(hull);
  const front = box(3.1, 0.7, 1.8, olive, 0, 1.15, 3.7); front.rotation.x = -0.35; g.add(front);
  for (const s of [-1, 1]) { g.add(box(0.95, 1.1, 7.6, track, s * 1.85, 0.7, 0)); g.add(box(1.05, 0.12, 7.9, dark, s * 1.85, 1.3, 0)); for (let k = 0; k < 6; k++) { const w = cyl(0.45, 0.45, 0.25, dark, 10); w.rotation.z = Math.PI / 2; w.position.set(s * 1.85, 0.5, -3 + k * 1.2); g.add(w); } }
  const tur = new THREE.Group(); tur.position.set(0, 1.9, -0.3);
  tur.add(box(2.6, 0.9, 3.3, olive, 0, 0, 0));
  const gunPivot = new THREE.Group(); gunPivot.position.set(0, 0.1, 1.5);
  const barrel = cyl(0.13, 0.15, 5.4, dark, 10); barrel.rotation.x = Math.PI / 2; barrel.position.z = 2.7; gunPivot.add(barrel);
  const muzzle = new THREE.Object3D(); muzzle.position.z = 5.5; gunPivot.add(muzzle);
  tur.add(gunPivot);
  const hatch = cyl(0.4, 0.4, 0.2, dark, 10); hatch.position.set(-0.6, 0.55, -0.4); tur.add(hatch);
  tur.add(box(0.12, 0.12, 0.9, dark, 0.7, 0.65, -0.2));
  g.add(tur);
  g.userData = { tur, gunPivot, muzzle };
  return g;
}

export class Military {
  constructor(G) {
    this.G = G; this.heli = []; this.tank = []; this.shells = []; this.wrecks = [];
    this.heliT = 0; this.tankT = 0; this.wasWanted = 0; this.thump = 0;
    this.v = new THREE.Vector3();
  }
  get count() { return this.heli.length + this.tank.length; }

  // ------------------------------------------------------------------ spawning
  update(dt) {
    const G = this.G, w = G.wanted;
    if (w !== this.wasWanted) {
      if (w >= 4 && this.wasWanted < 4) G.toast('<span style="color:#ff5a4a">군 병력 투입</span>', '공격 헬기가 접근 중');
      if (w >= 5 && this.wasWanted < 5) G.toast('<span style="color:#ff5a4a">전차 · 헬기 증원</span>', '전면전');
      this.wasWanted = w;
    }
    const want = { heli: w >= 5 ? 2 : w >= 4 ? 1 : 0, tank: w >= 5 ? 1 + (G.wanted >= 5 && G.time - (this.fiveSince ??= G.time) > 60 ? 1 : 0) : 0 };
    if (w < 5) this.fiveSince = null;
    this.heliT -= dt; this.tankT -= dt;
    const aliveH = this.heli.filter((e) => !e.leaving && !e.dead && !e.landing).length, aliveT = this.tank.filter((e) => !e.leaving && !e.dead).length;
    if (aliveH < want.heli && this.heliT <= 0) { this.spawnHeli(); this.heliT = aliveH ? 6 : 10; }
    if (aliveT < want.tank && this.tankT <= 0) { this.spawnTank(); this.tankT = 25; }
    if (aliveH > want.heli) { const e = this.heli.find((x) => !x.leaving && !x.dead); if (e) e.leaving = true; }
    if (aliveT > want.tank || (w < 5 && aliveT)) for (const e of this.tank) if (!e.leaving && !e.dead && w < 5) e.leaving = true;
    const real = G.vehicle || G.player;
    for (const e of this.heli) this.stepHeli(e, dt, real);
    for (const e of this.tank) this.stepTank(e, dt, real);
    // a unit shot up badly lets its crew bail out and the machine can be taken (Military.abandon)
    for (const e of this.tank) if (!e.dead && !e.gone && !e.leaving && e.hp < e.maxHp * 0.35) this.abandon(e);
    for (const e of this.heli) if (!e.dead && !e.gone && !e.leaving && !e.landing && e.hp < e.maxHp * 0.3) { e.landing = true; this.G.toast('<span style="color:#47ffa8">헬기 비상 착륙</span>', '착륙하면 탈취할 수 있다'); }
    this.stepShells(dt);
    for (const wr of this.wrecks) { wr.t += dt; if (wr.t % 0.25 < dt) G.smokeP.emit(wr.x + rand(-1, 1), wr.y + 1, wr.z + rand(-1, 1), rand(-0.4, 0.4), rand(2, 4), rand(-0.4, 0.4), rand(2, 4), rand(1.5, 3), 0.04, 0.04, 0.045, 0.8, 0.2, 0.4); if (wr.t > 40) { G.scene.remove(wr.g); wr.gone = true; } }
    this.wrecks = this.wrecks.filter((x) => !x.gone);
    this.heli = this.heli.filter((e) => !e.gone); this.tank = this.tank.filter((e) => !e.gone);
  }
  spawnHeli() {
    const G = this.G, pl = G.player, a = rand(0, TAU), g = buildHeli(), x = pl.x + Math.sin(a) * 260, z = pl.z + Math.cos(a) * 260;
    const e = { kind: 'heli', g, x, z, y: Math.max(pl.y + 60, G.groundY(x, z) + 50),   // over the hill it comes from, too
      vx: 0, vz: 0, vy: 0, hp: 380, maxHp: 380, ang: a, dir: Math.random() < 0.5 ? 1 : -1, hy: 0, fireCd: rand(2, 4), burst: 0, rocketCd: rand(5, 9), R: 3.2, rocket: G.wanted >= 5, searchT: 0, lastSeen: null, dead: false, leaving: false };
    G.scene.add(g); this.heli.push(e);
  }
  // a tank in the capital comes along its road grid; anywhere else (the 1:1 country has no grid, and none used to come) it starts on open, dry,
  // gentle ground 150-230 m away and drives across country toward the player (tracks need no road)
  spawnTank() {
    const G = this.G, pl = G.player, real = G.vehicle || pl, onGrid = Math.abs(real.x) < HALF && Math.abs(real.z) < HALF;
    let at = null;
    if (onGrid) {
      let best = null;
      for (let t = 0; t < 16; t++) { const i = Math.floor(rand(0, N + 1)), j = Math.floor(rand(0, N + 1)), d = Math.hypot(roadC(i) - pl.x, roadC(j) - pl.z); if (d > 130 && d < 320 && (!best || Math.abs(d - 190) < Math.abs(best.d - 190))) best = { i, j, d }; }
      if (best) at = { x: roadC(best.i), z: roadC(best.j), i: best.i, j: best.j };
    } else for (let t = 0; t < 30 && !at; t++) { const a = rand(0, TAU), d = rand(150, 230), x = real.x + Math.sin(a) * d, z = real.z + Math.cos(a) * d; if (this.openGround(x, z)) at = { x, z }; }
    if (!at) return;
    const g = buildTank(), y = G.groundY(at.x, at.z);
    const e = { kind: 'tank', g, x: at.x, z: at.z, y, pitch: 0, h: Math.atan2(real.x - at.x, real.z - at.z), free: !onGrid, ci: at.i ?? 0, cj: at.j ?? 0, ti: at.i ?? 0, tj: at.j ?? 0, hp: 900, maxHp: 900, R: 3.4, speed: 0, fireCd: rand(3, 5), mgCd: 0, burst: 0, tur: 0, dead: false, leaving: false, stuckT: 0 };
    g.position.set(e.x, y, e.z); g.rotation.y = e.h; G.scene.add(g); this.tank.push(e);
    G.toast('<span style="color:#ff5a4a">전차 접근</span>', onGrid ? '도로를 따라 다가온다' : '들판을 가로질러 다가온다');
  }
  // ground a tank can stand on: dry, under ~20 degrees, with no roof over it (not inside a building)
  openGround(x, z) {
    const G = this.G, y = G.groundY(x, z);
    if (G.waterAt(x, z)) return false;
    if (Math.abs(G.groundY(x + 4, z) - G.groundY(x - 4, z)) > 3 || Math.abs(G.groundY(x, z + 4) - G.groundY(x, z - 4)) > 3) return false;
    const r = G.phys?.ray(x, y + 60, z, 0, -1, 0, 61, 1); return !(r && 60 - r.t > 1.2);
  }
  // the way ahead of a tank on a bearing is clear: no wall at hull height over the next 14 m, no climb or drop over ~25 degrees, no water
  clearAhead(e, a) {
    const G = this.G, x = e.x + Math.sin(a) * 14, z = e.z + Math.cos(a) * 14, y = G.groundY(x, z, e.y + 6);
    if (Math.abs(y - e.y) > 6.5 || G.waterAt(x, z)) return false;
    return G.hasLOS(e.x, e.y + 1.6, e.z, x, y + 1.6, z);
  }

  // ------------------------------------------------------------------ helicopter
  stepHeli(e, dt, real) {
    const G = this.G, pl = G.player, U = e.g.userData;
    if (e.dead) return this.crashStep(e, dt);
    // goal: orbit the player at 38 m height; leave when the heat is off
    let gx, gz, gy, sp = 28;
    const dx = real.x - e.x, dz = real.z - e.z, dist = Math.hypot(dx, dz);
    if (e.leaving) { gx = e.x - dx * 4; gz = e.z - dz * 4; gy = e.y + 40; sp = 36; if (dist > 330) { G.scene.remove(e.g); G.scene.remove(U.beam); e.gone = true; return; } }
    else {
      e.ang += e.dir * dt * (0.32 + (e.rocket ? 0.05 : 0));
      const r = e.sees === false && e.lastSeen ? 20 : 48;
      const cx = e.sees === false && e.lastSeen ? e.lastSeen.x : real.x, cz = e.sees === false && e.lastSeen ? e.lastSeen.z : real.z;
      gx = cx + Math.sin(e.ang) * r; gz = cz + Math.cos(e.ang) * r; gy = G.bodyY(real) + 40;   // 40 m over the target (a car's height is its body's, not 0)
      // never into a tall building: climb over what is below
      gy = Math.max(gy, this.groundTop(e.x, e.z) + 14);
    }
    if (e.landing) { gx = e.x; gz = e.z; gy = this.groundTop(e.x, e.z) + 1.3; sp = 0; }
    const ax = gx - e.x, az = gz - e.z, al = Math.hypot(ax, az) || 1, want = Math.min(sp, al * 0.9);
    const k = 1 - Math.exp(-1.6 * dt);
    const nvx = ax / al * want, nvz = az / al * want;
    const accx = (nvx - e.vx) * k, accz = (nvz - e.vz) * k; e.vx += accx; e.vz += accz;
    e.vy += ((gy - e.y) * 0.6 - e.vy) * (1 - Math.exp(-1.3 * dt));
    e.x += e.vx * dt; e.z += e.vz * dt; e.y += e.vy * dt;
    // face the player, lean into acceleration
    const face = Math.atan2(dx, dz); e.hy = dampAngle(e.hy, e.leaving ? Math.atan2(e.vx, e.vz) : face, 2.5, dt);
    const lean = clamp((e.vx * Math.sin(e.hy) + e.vz * Math.cos(e.hy)) / 40, -0.3, 0.3), roll = clamp(((e.vx * Math.cos(e.hy) - e.vz * Math.sin(e.hy)) / 40), -0.3, 0.3);
    e.g.position.set(e.x, e.y, e.z); e.g.rotation.set(lean, e.hy, -roll, 'YXZ');
    U.rotor.rotation.y += dt * 38; U.tr.rotation.z += dt * 55;
    U.nav.visible = Math.floor(G.time * 2) % 2 === 0;
    // rotor thump, louder when near
    const cd = Math.hypot(e.x - G.camera.position.x, e.z - G.camera.position.z);
    if (cd < 220) { this.thump -= dt; if (this.thump <= 0) { this.thump = 0.09; G.audio.tone?.(58 + Math.random() * 6, 0.07, 'sine', clamp(1 - cd / 220, 0, 1) * 0.22, 40); } }
    // sight to the target
    e.sightT = (e.sightT || 0) - dt;
    if (e.sightT <= 0) {
      e.sightT = 0.2; const ty = G.bodyY(real);
      e.sees = !e.leaving && dist < 130 && G.hasLOS(e.x, e.y - 1, e.z, real.x, ty, real.z);
      if (e.sees) e.lastSeen = { x: real.x, z: real.z };
    }
    // searchlight
    const sx = e.x + Math.sin(e.hy) * 20 + Math.sin(G.time * 0.7) * 10, sz = e.z + Math.cos(e.hy) * 20 + Math.cos(G.time * 0.5) * 10;
    const spot = e.sees ? new THREE.Vector3(real.x, G.bodyY(real) - 1.2, real.z) : new THREE.Vector3(sx, G.groundY(sx, sz), sz);   // the beam ends on the ground, wherever that is
    const from = new THREE.Vector3(e.x, e.y - 1.15, e.z), dir = spot.clone().sub(from), len = dir.length();
    if (!U.beam.parent) G.scene.add(U.beam);
    U.beam.visible = !e.leaving;
    if (U.beam.visible) {
      const w = Math.max(2.5, len * 0.07);
      U.beam.position.copy(from).addScaledVector(dir, 0.5); U.beam.scale.set(w, len, w);
      U.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize().negate());
      if (e.sees) G.lights.flash(real.x, G.bodyY(real) + 1.2, real.z, 0xdfeaff, 12, 22, 0.1);
    }
    if (e.landing && e.y <= gy + 0.4) { this.abandon(e); return; }
    if (e.leaving || e.landing || !e.sees) return;
    // machine gun
    e.fireCd -= dt;
    if (e.fireCd <= 0 && dist < 100) {
      if (e.burst <= 0) { e.burst = 7 + Math.floor(Math.random() * 6); }
      e.fireCd = 0.085; e.burst--; if (e.burst <= 0) e.fireCd = rand(2.2, 3.6);
      this.fireAt(e, real, 0.2 - clamp(((G.vehicle ? G.vehicle.speed : pl.speed) || 0) * 0.012, 0, 0.12), 4.5, 'heli');
    }
    // rockets (5 stars)
    if (e.rocket) { e.rocketCd -= dt; if (e.rocketCd <= 0 && dist > 18) { e.rocketCd = rand(6, 10); this.launch(e.x, e.y - 1, e.z, real, 'rocket', 6, 48); } }
  }
  // the highest thing under a helicopter: the ground (not 0: the 1:1 country has hills), the capital's boxes around it, and whatever static body a ray
  // straight down meets first (the 1:1 buildings are physics bodies only)
  groundTop(x, z) {
    const G = this.G; let h = G.groundY(x, z);
    try { const c = G.world.colliders.near(x, z, 12, []); for (const b of c) if (b.x1 > x - 6 && b.x0 < x + 6 && b.z1 > z - 6 && b.z0 < z + 6) h = Math.max(h, b.h || 0); } catch { /* ignore */ }
    const r = G.phys?.ray(x, h + 700, z, 0, -1, 0, 700, 1); if (r) h = Math.max(h, h + 700 - r.t);
    return h;
  }
  crashStep(e, dt) {
    const G = this.G;
    e.vy -= 9.81 * dt; e.vx *= 1 - dt * 0.2; e.vz *= 1 - dt * 0.2; e.x += e.vx * dt; e.z += e.vz * dt; e.y += e.vy * dt; e.hy += dt * 5; e.spin = (e.spin || 0) + dt * 2;   // it falls at g (it fell at 18 m/s^2)
    e.g.position.set(e.x, e.y, e.z); e.g.rotation.set(0.4, e.hy, Math.sin(e.spin) * 0.6, 'YXZ'); e.g.userData.rotor.rotation.y += dt * 12;
    G.smokeP.emit(e.x, e.y, e.z, rand(-1, 1), rand(0, 1), rand(-1, 1), rand(2, 4), rand(2, 3), 0.04, 0.04, 0.05, 0.9, 0.2, 0.4);
    G.fireP.emit(e.x, e.y, e.z, rand(-1, 1), rand(0, 2), rand(-1, 1), rand(0.4, 0.8), rand(1, 2), 3.5, rand(0.8, 1.4), 0.25, 1, -1, 1.2);
    const top = this.groundTop(e.x, e.z);
    if (e.y <= top + 1.5) {   // on the ground or a roof wherever it is (it used to fall to 1.5 m over 0, inside a hill)
      G.explosion(e.x, e.y, e.z, 14, 90, e);
      this.wrecks.push({ g: e.g, x: e.x, y: top + 0.5, z: e.z, t: 0 });
      G.scene.remove(e.g.userData.beam); e.g.rotation.set(0.15, e.hy, 0.7); e.g.position.y = top + 0.8;
      for (const m of [e.g]) m.traverse((o) => { if (o.material && o.material.color && !o.material.isMeshBasicMaterial) o.material = o.material.clone(), o.material.color.multiplyScalar(0.25); });
      e.gone = true;
    }
  }

  // ------------------------------------------------------------------ tank
  stepTank(e, dt, real) {
    const G = this.G, pl = G.player, U = e.g.userData;
    if (e.dead) return;
    const dx = real.x - e.x, dz = real.z - e.z, dist = Math.hypot(dx, dz);
    let tx, tz;
    if (e.free) {
      // across country: toward the player (away when leaving), turning to the first clear bearing when the way ahead is a wall, a cliff or water
      e.avoidT = (e.avoidT || 0) - dt;
      if (e.avoidT <= 0) {
        e.avoidT = 0.5; const want = e.leaving ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz); e.steer = want;
        if (!this.clearAhead(e, want)) for (const o of [0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.1, -2.1, Math.PI]) if (this.clearAhead(e, want + o)) { e.steer = want + o; break; }
      }
      tx = e.x + Math.sin(e.steer) * 30; tz = e.z + Math.cos(e.steer) * 30;
    }
    // road routing: head for the intersection that brings us closer to the player along the grid
    const px = roadIdx(real.x), pz = roadIdx(real.z);
    if (!e.free && Math.hypot(roadC(e.ti) - e.x, roadC(e.tj) - e.z) < 2.2) {
      e.ci = e.ti; e.cj = e.tj;
      const di = px - e.ci, dj = pz - e.cj;
      let ni = e.ci, nj = e.cj;
      if (e.leaving) { ni = clamp(e.ci + (di > 0 ? -1 : 1), 0, N); if (ni === e.ci) nj = clamp(e.cj + (dj > 0 ? -1 : 1), 0, N); }
      else if (Math.abs(di) >= Math.abs(dj) && di) ni += Math.sign(di); else if (dj) nj += Math.sign(dj); else if (di) ni += Math.sign(di);
      e.ti = ni; e.tj = nj;
    }
    if (!e.free) { tx = roadC(e.ti); tz = roadC(e.tj); }
    const hold = !e.leaving && dist < 52 && e.sees;
    const wantSp = e.leaving ? 11 : hold ? 0 : dist < 26 ? 0 : 10;
    e.speed += (wantSp - e.speed) * (1 - Math.exp(-1.2 * dt));
    const hd = Math.atan2(tx - e.x, tz - e.z);
    if (e.speed > 0.3) e.h = dampAngle(e.h, hd, 1.4, dt);
    const dhd = Math.abs(((hd - e.h + Math.PI * 3) % TAU) - Math.PI);
    const fwd = e.speed * (dhd > 0.8 ? 0.35 : 1);
    e.x += Math.sin(e.h) * fwd * dt; e.z += Math.cos(e.h) * fwd * dt;
    // on the ground under the hull (terrain or a road deck; it was 0), pitched to the slope between the front and the back of the tracks
    e.y = G.groundY(e.x, e.z, e.y + 1);
    const gf = G.groundY(e.x + Math.sin(e.h) * 3, e.z + Math.cos(e.h) * 3, e.y + 2), gb = G.groundY(e.x - Math.sin(e.h) * 3, e.z - Math.cos(e.h) * 3, e.y + 2);
    e.pitch = Math.atan2(gf - gb, 6);
    e.g.position.set(e.x, e.y, e.z); e.g.rotation.set(-e.pitch, e.h, 0, 'YXZ');
    if (e.leaving && dist > 260) { G.scene.remove(e.g); e.gone = true; return; }
    // turret turns toward the target
    const want = Math.atan2(dx, dz) - e.h; e.tur = dampAngle(e.tur, want, 1.6, dt); U.tur.rotation.y = e.tur;
    const elev = clamp(Math.atan2(G.bodyY(real) - (e.y + 2.2), dist), -0.1, 0.5); U.gunPivot.rotation.x = -elev;
    // sight
    e.sightT = (e.sightT || 0) - dt;
    if (e.sightT <= 0) { e.sightT = 0.25; e.sees = !e.leaving && dist < 110 && G.hasLOS(e.x, e.y + 2.4, e.z, real.x, G.bodyY(real), real.z); }
    // crush what is in the way
    for (const v of G.vehicles) { if (v.dead || !v.pv) continue; const d = Math.hypot(v.x - e.x, v.z - e.z); if (d < 4.6 && e.speed > 1 && Math.abs(v.baseY() - e.y) < 2.5) { v.damage(260 * dt, e); v.awake = true; v.pv.body.wakeUp(); v.addImpulse((v.x - e.x) / (d || 1) * 6, 1.5, (v.z - e.z) / (d || 1) * 6); } }
    for (const h of G.humans) { if (h.dead || h.rag) continue; if (Math.hypot(h.x - e.x, h.z - e.z) < 2.6 && e.speed > 1.5 && Math.abs((h.y || 0) - e.y) < 2) { h.hurt(999, e, false, null); } }
    if (!pl.dead && !G.vehicle && Math.hypot(pl.x - e.x, pl.z - e.z) < 2.6 && e.speed > 1.5 && Math.abs(pl.y - e.y) < 2) G.hurtPlayer(35 * dt * 10, e, 'crush');
    // dust and engine noise
    const cd = Math.hypot(e.x - G.camera.position.x, e.z - G.camera.position.z);
    if (e.speed > 2 && cd < 160) { e.dustT = (e.dustT || 0) - dt; if (e.dustT <= 0) { e.dustT = 0.15; G.smokeP.emit(e.x - Math.sin(e.h) * 3.5, e.y + 0.4, e.z - Math.cos(e.h) * 3.5, rand(-1, 1), rand(0.3, 1), rand(-1, 1), rand(1.2, 2.2), rand(1.5, 2.5), 0.3, 0.28, 0.24, 0.35, 0.1, 0.3); } }
    if (cd < 150) { e.rumT = (e.rumT || 0) - dt; if (e.rumT <= 0) { e.rumT = 0.16; G.audio.tone?.(38 + e.speed * 2 + Math.random() * 4, 0.12, 'sawtooth', clamp(1 - cd / 150, 0, 1) * 0.10, 30); } }
    if (!e.sees || e.leaving) return;
    // main gun
    e.fireCd -= dt;
    if (e.fireCd <= 0 && dist > 14 && Math.abs(angDiff(want, e.tur)) < 0.2) {
      e.fireCd = rand(4.5, 6.5);
      const m = new THREE.Vector3(); U.muzzle.getWorldPosition(m);
      this.launch(m.x, m.y, m.z, real, 'shell', 7, 70); G.fx.muzzle(m, new THREE.Vector3(Math.sin(e.h + e.tur), 0, Math.cos(e.h + e.tur)));
      G.audio.explosion?.(0.5, clamp((e.x - G.camera.position.x) * 0.01, -1, 1)); G.shake?.(clamp(1 - cd / 90, 0, 0.8));
    }
    // coax machine gun
    e.mgCd -= dt;
    if (e.mgCd <= 0 && dist < 70) { if (e.burst <= 0) e.burst = 6 + Math.floor(Math.random() * 6); e.mgCd = 0.1; e.burst--; if (e.burst <= 0) e.mgCd = rand(1.5, 3); this.fireAt(e, real, 0.2, 3.5, 'tank'); }
  }

  // ------------------------------------------------------------------ shooting
  fireAt(e, real, hitChance, dmg, src) {
    const G = this.G, from = new THREE.Vector3(e.x, e.kind === 'heli' ? e.y - 1.1 : e.y + 2.6, e.z);
    const tx = real.x, ty = G.bodyY(real), tz = real.z, hit = Math.random() < hitChance && G.hasLOS(from.x, from.y, from.z, tx, ty, tz);
    const end = new THREE.Vector3(tx + (hit ? 0 : rand(-3, 3)), ty + (hit ? 0 : rand(-1.5, 0.5)), tz + (hit ? 0 : rand(-3, 3)));
    G.tracers.add(from, end, [1, 0.75, 0.3]);
    const cd = Math.hypot(e.x - G.camera.position.x, e.z - G.camera.position.z);
    G.audio.gun('rifle', 0.5 * clamp(1 - cd / 200, 0.15, 1), clamp((e.x - G.camera.position.x) * 0.01, -1, 1));
    if (hit) {
      if (G.vehicle) { G.vehicle.damage(dmg * 0.7, e); G.fx.sparks(end.x, end.y, end.z, 4, [1, 0.8, 0.4], 4); }
      G.hurtPlayer(dmg, e, 'bullet');
    } else if (end.y - G.groundY(end.x, end.z, end.y) < 4) G.fx.sparks(end.x, end.y, end.z, 3, [1, 0.8, 0.5], 3);
  }
  // an unguided shell (tank) or rocket (helicopter) aimed where the target will be. A 120 mm HE round leaves the gun at 1,100 m/s; a 70 mm rocket
  // leaves its pod at ~40 m/s and its motor takes it to ~600 m/s in about a second (they flew at 95 and 52 m/s). Both fall under gravity: the aim
  // lifts them by the drop over the flight time, and a gunner's lay is good to about a mil, a rocket's to about six (it is an area weapon)
  launch(x, y, z, real, kind, radius, dmg) {
    const G = this.G, tgt = G.vehicle || G.player, ty = G.bodyY(tgt), vx = tgt.vx || 0, vz = tgt.vz || 0, shell = kind === 'shell';
    const v0 = shell ? 1100 : 40, acc = shell ? 0 : 500, vmax = shell ? 1100 : 600;
    const tof = (d) => { if (!acc) return d / v0; const tb = (vmax - v0) / acc, db = v0 * tb + acc * tb * tb / 2; return d <= db ? (Math.sqrt(v0 * v0 + 2 * acc * d) - v0) / acc : tb + (d - db) / vmax; };
    let t = tof(Math.hypot(real.x - x, ty - y, real.z - z));
    for (let k = 0; k < 2; k++) t = tof(Math.hypot(real.x + vx * t - x, ty - y, real.z + vz * t - z));
    const tx = real.x + vx * t, tz = real.z + vz * t, err = shell ? 0.0015 : 0.006;
    const dir = new THREE.Vector3(tx - x, ty + 4.9 * t * t - y, tz - z).normalize();
    dir.x += rand(-err, err); dir.y += rand(-err, err); dir.z += rand(-err, err); dir.normalize();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, shell ? 0.9 : 1.2, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.6, 0.2).multiplyScalar(3), toneMapped: false }));
    m.quaternion.setFromUnitVectors(UP, dir); m.position.set(x, y, z); G.scene.add(m);
    this.shells.push({ m, p: new THREE.Vector3(x, y, z), v: dir.clone().multiplyScalar(v0), dir, acc, vmax, radius, dmg, kind, life: shell ? 3 : 6 });
    G.audio.tone?.(shell ? 120 : 380, 0.4, 'sawtooth', 0.12, 60);
  }
  // a round's path over one frame is up to 18 m: the world, the terrain, the target and the cars are tested along it, not only at its end
  stepShells(dt) {
    const G = this.G, tgt = G.vehicle || G.player, ty = G.bodyY(tgt);
    for (const s of this.shells) {
      const prev = s.p.clone();
      if (s.acc) { const sp = s.v.length(); if (sp < s.vmax) s.v.addScaledVector(s.dir, Math.min(s.acc * dt, s.vmax - sp)); }   // the rocket motor
      s.v.y -= 9.81 * dt; s.p.addScaledVector(s.v, dt); s.life -= dt; s.m.position.copy(s.p); s.m.quaternion.setFromUnitVectors(UP, this.v.copy(s.v).normalize());
      G.smokeP.emit(s.p.x, s.p.y, s.p.z, rand(-0.2, 0.2), rand(-0.2, 0.2), rand(-0.2, 0.2), rand(1.2, 2), rand(0.4, 0.8), 0.7, 0.7, 0.7, 0.5, 0.1, 0.3);
      const len = prev.distanceTo(s.p) || 1e-6, dx = (s.p.x - prev.x) / len, dy = (s.p.y - prev.y) / len, dz = (s.p.z - prev.z) / len;
      let hit = G.world.colliders.raycastT(prev.x, prev.y, prev.z, dx, dy, dz, len), at = hit >= 0 ? hit : len;
      const tg = G.groundHit(prev.x, prev.y, prev.z, dx, dy, dz, at); if (tg >= 0) { hit = tg; at = tg; }
      // the target: the path's closest approach to its chest, within 1.5 m
      { const tc = clamp((tgt.x - prev.x) * dx + (ty - prev.y) * dy + (tgt.z - prev.z) * dz, 0, at); if (Math.hypot(prev.x + dx * tc - tgt.x, prev.y + dy * tc - ty, prev.z + dz * tc - tgt.z) < 1.5) { hit = tc; at = tc; } }
      for (const v of G.vehicles) { if (v.dead || !v.group.visible || Math.abs(v.x - prev.x) > len + 8 || Math.abs(v.z - prev.z) > len + 8) continue; const t = G.rayVehicle(v, prev.x, prev.y, prev.z, dx, dy, dz, at); if (t >= 0) { hit = t; at = t; } }
      if (hit >= 0 || s.life <= 0) {
        const px = hit >= 0 ? prev.x + dx * hit : s.p.x, py = hit >= 0 ? prev.y + dy * hit : s.p.y, pz = hit >= 0 ? prev.z + dz * hit : s.p.z;
        G.scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); s.dead = true; G.explosion(px, py, pz, s.radius, s.dmg, null);
      }
    }
    this.shells = this.shells.filter((s) => !s.dead);
  }

  // ------------------------------------------------------------------ being shot
  rayHit(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null;
    for (const e of [...this.heli, ...this.tank]) {
      if (e.dead) continue;
      const cy = e.kind === 'heli' ? e.y : e.y + 1.7, cx = e.x - ox, cyy = cy - oy, cz = e.z - oz, t = cx * dx + cyy * dy + cz * dz;
      if (t < 0 || t > maxT) continue;
      const px = ox + dx * t - e.x, py = oy + dy * t - cy, pz = oz + dz * t - e.z, d2 = px * px + py * py + pz * pz, R = e.kind === 'heli' ? e.R : e.R * 0.9;
      if (d2 > R * R) continue;
      const tt = t - Math.sqrt(R * R - d2);
      if (!best || tt < best.t) best = { t: Math.max(0, tt), e };
    }
    return best;
  }
  damage(e, dmg, src, bullet) {
    if (e.dead) return;
    e.hp -= dmg * (bullet && e.kind === 'tank' ? 0.04 : 1);
    if (bullet && e.kind === 'tank') { this.G.audio.impact?.(0.5, 0); }
    if (e.hp <= 0) this.kill(e, src);
  }
  blast(x, y, z, radius, dmg, src) {
    for (const e of [...this.heli, ...this.tank]) {
      if (e.dead || e === src) continue;
      const d = Math.hypot(e.x - x, (e.kind === 'heli' ? e.y : e.y + 1.5) - y, e.z - z); if (d > radius * 1.5) continue;
      this.damage(e, dmg * (1 - d / (radius * 1.5)) * 1.4, src, false);
    }
  }
  kill(e, src) {
    const G = this.G; e.dead = true;
    G.addHeat?.(12);
    if (src === G.player || src?.driver === 'player') { G.cash += e.kind === 'tank' ? 2500 : 1200; G.feed?.(e.kind === 'tank' ? '전차 파괴 +$2500' : '헬기 격추 +$1200', '#47ffa8'); }
    if (e.kind === 'heli') { e.vy = -2; return; }
    // tank: blast, burn for a while
    G.explosion(e.x, e.y + 1.5, e.z, 12, 80, e);
    e.g.traverse((o) => { if (o.material && o.material.color && !o.material.isMeshBasicMaterial) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.25); } });
    e.g.userData.tur.rotation.y += rand(-0.5, 0.5); e.g.userData.tur.position.y += 0.15; e.g.userData.tur.rotation.z = 0.12;
    this.wrecks.push({ g: e.g, x: e.x, y: e.y + 1, z: e.z, t: 0 }); e.gone = true;
  }
  // the crew gets out and the machine stays behind, parked and boardable (a Vehicle of the war kind)
  abandon(e) {
    const G = this.G, tank = e.kind === 'tank'; if (e.gone) return;
    const v = new Vehicle(G, tank ? 'tank' : 'gunship', 0x4a5236, 'parked', { glow: [1, 0.3, 0.2] });
    v.x = e.x; v.z = e.z; v.h = tank ? e.h : e.hy; v.startY = tank ? e.y + v.spec.cy + 0.25 : Math.max(G.groundY(e.x, e.z, e.y) + v.spec.cy + 0.25, e.y); v.awake = false; v.captured = true;   // on the ground where it stopped (not over 0)
    v.hp = Math.max(v.maxHp * 0.35, v.maxHp * (e.hp / e.maxHp)); v.fuel = 55;
    G.addVehicle(v); if (tank) v.turYaw = e.tur || 0;
    G.scene.remove(e.g); if (e.g.userData.beam) G.scene.remove(e.g.userData.beam); e.gone = true;
    for (let k = 0; k < 2; k++) G.spawnCop(e.x + (k ? 3.5 : -3.5), e.z + 2, tank ? e.y : G.groundY(e.x, e.z, e.y));
    G.toast('<span style="color:#47ffa8">승무원 탈출</span>', (tank ? '전차' : '헬기') + `를 ${binds.label('use')}로 탈취할 수 있다`);
  }
  // one of each unit, for compiling their shaders during loading (see Game.prewarmShaders)
  warmModels() {
    const h = buildHeli(), t = buildTank();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.6, 0.2).multiplyScalar(3), toneMapped: false }));
    return [h, h.userData.beam, t, shell];
  }
  clear() { for (const e of [...this.heli, ...this.tank]) e.leaving = true; }
}
