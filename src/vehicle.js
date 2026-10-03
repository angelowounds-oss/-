import * as THREE from 'three';
import { buildCar, CAR_SPECS } from './models.js';
import { N, P, R, LANE, HALF, roadC } from './world.js';
import { clamp, lerp, damp, angDiff, rand, TAU } from './util.js';

export const CAR_COLORS = [0x1a2433, 0x7a1020, 0xc9ced8, 0x0d3b66, 0x2b2f38, 0xe0b020, 0x14654b, 0x5a1f7a, 0xd8d8d0, 0x111418, 0x8a2a10, 0x1c6fa8];
const GLOWS = [[0.2, 0.9, 1], [1, 0.2, 0.8], [0.6, 0.3, 1], [0.2, 1, 0.5], [1, 0.5, 0.15], [1, 0.15, 0.2]];
const tmpV = new THREE.Vector3();
let uid = 0;

export class Vehicle {
  constructor(G, type, color, kind = 'parked', opts = {}) {
    this.G = G; this.id = ++uid;
    this.type = type; this.kind = kind; // parked | traffic | police | player
    const police = kind === 'police', taxi = opts.taxi;
    this.model = buildCar(type, police ? 0x0c1220 : taxi ? 0xe8b820 : color, { police, taxi, glow: opts.glow || GLOWS[Math.floor(Math.random() * GLOWS.length)] });
    this.group = this.model.group;
    if (police) {
      // white doors stripe via a second paint mesh overlay is skipped; keep dark livery with light bar
    }
    this.spec = CAR_SPECS[type];
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
  setLights(on) {
    this.lightsOn = on;
    this.model.head.visible = on; this.model.beams.visible = on;
    this.model.headSprites.forEach((s) => (s.visible = on));
    this.model.tailSprites.forEach((s) => (s.visible = on || this.model.brake.visible));
    this.model.ug.visible = on && this.kind !== 'parked';
  }
  place(x, z, h) { this.x = x; this.z = z; this.h = h; this.vx = this.vz = 0; this.yaw = 0; this.syncMesh(); }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwdSpeed() { return this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h); }
  circles(out) {
    const s = Math.sin(this.h), c = Math.cos(this.h), r = this.W * 0.5 * 0.95, o = this.L * 0.3;
    out[0] = [this.x + s * o, this.z + c * o, r]; out[1] = [this.x, this.z, r]; out[2] = [this.x - s * o, this.z - c * o, r];
    return out;
  }
  syncMesh() {
    const g = this.group;
    g.position.set(this.x, 0, this.z);
    g.rotation.set(0, 0, 0);
    g.rotation.y = this.h;
    // body lean applied via inner rotation of children order: use quaternion composition
    if (this.pitch || this.roll) { g.rotateX(this.pitch); g.rotateZ(this.roll); }
    if (this.model.syncWheels) this.model.syncWheels(this.wheelSpin, -this.steerA);
    else { this.model.front.rotation.y = -this.steerA; this.model.fa.rotation.x = this.wheelSpin; this.model.ra.rotation.x = this.wheelSpin; }
  }
  damage(amount, src) {
    if (this.dead) return;
    this.hp -= amount;
    if (this.hp <= 0) this.destroy(src);
    else if (this.hp < this.maxHp * 0.3) this.burn = Math.max(this.burn, 0.5);
  }
  destroy(src) {
    if (this.dead) return;
    this.dead = true; this.burn = 1; this.explodeT = 1.2 + Math.random() * 1.2;
    this.throttle = 0; this.brake = 0; this.steer = 0;
    this.model.paint.material = this.model.paint.material.clone();
    this.model.paint.material.color.setHex(0x1a1512); this.model.paint.material.metalness = 0.1; this.model.paint.material.roughness = 0.9;
    this.setLights(false);
    this.G.onVehicleDestroyed?.(this, src);
  }
  explode() {
    this.G.explosion(this.x, 1.0, this.z, 9, 90, this);
    this.explodeT = 0; this.burn = 2;
    if (this.driver === 'player') this.G.playerVehicleExploded(this);
    this.vx += rand(-3, 3); this.vz += rand(-3, 3);
    this.exploded = true;
  }

  // ---------- Physics ----------
  update(dt) {
    const G = this.G;
    this.age += dt;
    if (this.impactCd > 0) this.impactCd -= dt;
    if (this.dead) {
      this.throttle = 0; this.brake = 0.3; this.steer = 0;
      if (this.explodeT > 0 && (this.explodeT -= dt) <= 0) this.explode();
      if (this.burn > 0.2 && Math.random() < dt * 24) G.fx.fire(this.x + rand(-1, 1), 0.8 + Math.random(), this.z + rand(-1, 1));
    } else if (this.burn > 0 && this.hp < this.maxHp * 0.3) {
      if (Math.random() < dt * 8) G.fx.smoke(this.x + Math.sin(this.h) * this.L * 0.35, 1.0, this.z + Math.cos(this.h) * this.L * 0.35);
      if (this.hp < this.maxHp * 0.12) { this.hp -= dt * 2; if (this.hp <= 0) this.destroy(null); if (Math.random() < dt * 14) G.fx.fire(this.x + rand(-.6, .6), 1, this.z + rand(-.6, .6)); }
    }
    if (this.driver === 'ai' && !this.dead) this.driveAI(dt);

    const sp = this.spec;
    const sH = Math.sin(this.h), cH = Math.cos(this.h);
    let vf = this.vx * sH + this.vz * cH;
    let vl = this.vx * -cH + this.vz * sH;
    const aVf = Math.abs(vf);
    const hasDriver = this.driver && !this.dead;
    // steering
    const maxSteer = lerp(0.6, 0.1, clamp(aVf / 38, 0, 1)) * (this.hand ? 1.3 : 1);
    const targetSteer = this.steer * maxSteer;
    this.steerA = damp(this.steerA, targetSteer, 10, dt);
    // longitudinal
    let acc = 0;
    if (hasDriver) {
      if (this.throttle > 0) acc += sp.accel * this.throttle * clamp(1 - Math.max(vf, 0) / sp.maxSpeed, 0, 1) * (vf < -1 ? 2.5 : 1);
      if (this.brake > 0) {
        if (vf > 0.6) acc -= 36 * this.brake;
        else acc -= sp.accel * 0.6 * this.brake * clamp(1 + vf / (sp.maxSpeed * 0.28), 0, 1);
      }
    } else {
      acc -= Math.sign(vf) * Math.min(aVf * 4, 20) * (this.dead ? 1.2 : 0.8) * (this.brake || 0.1);
    }
    acc -= vf * aVf * (sp.accel / (sp.maxSpeed * sp.maxSpeed)) * 0.9;
    acc -= Math.sign(vf) * Math.min(aVf * 3, 1.4);
    if (this.hand && hasDriver) acc -= Math.sign(vf) * Math.min(aVf * 3, 8);
    vf += acc * dt;
    // yaw (bicycle model)
    const wb = sp.wb * 2;
    let yawT = -vf / wb * Math.tan(this.steerA);
    if (this.hand && aVf > 4) yawT *= 1.5;
    this.yaw = damp(this.yaw, yawT, this.hand ? 6 : 11, dt);
    this.h += this.yaw * dt;
    // lateral grip
    const grip = sp.grip * (this.hand ? 0.14 : 1) * (this.dead ? 0.5 : 1);
    vl *= Math.exp(-grip * dt);
    // after heading change recompute velocity in world
    const s2 = Math.sin(this.h), c2 = Math.cos(this.h);
    this.vx = vf * s2 - vl * c2; this.vz = vf * c2 + vl * s2;
    this.slip = clamp((Math.abs(vl) - 2.2) / 6, 0, 1) * clamp(aVf / 8, 0, 1);
    // integrate
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.collide(dt);
    // visuals
    const lat = this.yaw * vf;
    this.pitch = damp(this.pitch, clamp(-acc * 0.004, -0.06, 0.06), 8, dt);
    this.roll = damp(this.roll, clamp(-lat * 0.0045, -0.09, 0.09), 8, dt);
    this.wheelSpin += (vf * dt) / this.model.wheelR;
    const braking = hasDriver && this.brake > 0.1 && vf > 0.5 || (hasDriver && this.throttle > 0 && vf < -0.5);
    if (this.model.brake.visible !== braking) { this.model.brake.visible = braking; if (!this.lightsOn) this.model.tailSprites.forEach((s) => (s.visible = braking)); }
    if (this.slip > 0.4 && Math.random() < dt * 30) G.fx.tireSmoke(this.x - sH * this.L * 0.3, this.z - cH * this.L * 0.3);
    if (this.model.siren) {
      const ph = Math.floor(G.time * 6) % 2 === 0;
      this.model.siren.rs.visible = ph; this.model.siren.bs.visible = !ph;
    }
    this.lastSpeed = Math.hypot(this.vx, this.vz);
    this.syncMesh();
  }

  collide(dt) {
    const G = this.G, col = G.world.colliders;
    const cs = this._cs || (this._cs = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    this.circles(cs);
    let hit = false, nx = 0, nz = 0, depth = 0, cx = 0, cz = 0;
    let ax = 0, az = 0;
    for (const c of cs) {
      const r = col.resolve(c[0], c[1], c[2], 0.5);
      if (r.hit) {
        ax += r.x - c[0]; az += r.z - c[1];
        nx += r.nx; nz += r.nz; hit = true; depth = Math.max(depth, r.depth); cx = c[0]; cz = c[1];
      }
    }
    // world bounds
    const lim = HALF + R / 2 + 4;
    if (hit) {
      this.x += ax * 0.9 / 1; this.z += az * 0.9 / 1;
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const vn = this.vx * nx + this.vz * nz;
      if (vn < 0) {
        const e = 0.28;
        this.vx -= (1 + e) * vn * nx; this.vz -= (1 + e) * vn * nz;
        this.vx *= 0.97; this.vz *= 0.97;
        this.yaw += (nx * Math.cos(this.h) - nz * Math.sin(this.h)) * vn * 0.02;
        this.onImpact(-vn, cx, cz, null);
      }
    }
    this.x = clamp(this.x, -lim, lim); this.z = clamp(this.z, -lim, lim);
  }
  onImpact(speed, x, z, other) {
    if (speed < 2.2 || this.impactCd > 0) return;
    this.impactCd = 0.25;
    const G = this.G;
    const dmg = Math.max(0, speed - 4) * (this.dead ? 0 : 3.2) / (this.mass * 0.8 + 0.2);
    if (dmg > 0) this.damage(dmg, other);
    G.fx.sparks(x, 0.6, z, Math.min(speed * 0.8, 24), [1, 0.7, 0.3]);
    G.audio.crash(clamp(speed / 20, 0.2, 1.2), 0);
    if (this.driver === 'player') G.shake(clamp(speed / 14, 0.1, 1.2)), G.onPlayerCrash?.(speed);
  }

  // ---------- AI: traffic + police ----------
  nodeIJ(x, z) { return [clamp(Math.round((x + HALF) / P), 0, N), clamp(Math.round((z + HALF) / P), 0, N)]; }
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
        if (ti < 0 || ti > N || tj < 0 || tj > N) continue;
        opts.push([cdi, cdj, w]);
      }
      if (!opts.length) opts.push([-di, -dj, 1]);
      let pick = opts[0];
      if (this.police && this.chaseTarget) {
        const tx = this.chaseTarget.x, tz = this.chaseTarget.z; let best = 1e9;
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
    let target = ai.speed;
    // direct chase for police near target
    let tx, tz;
    if (this.police && this.chaseTarget && this.direct) {
      tx = this.chaseTarget.x; tz = this.chaseTarget.z;
      target = 24;
    } else {
      if (!ai.wp.length) this.planAhead();
      let wp = ai.wp[0];
      while (wp && Math.hypot(wp.x - this.x, wp.z - this.z) < 5.5) { ai.wp.shift(); wp = ai.wp[0]; if (ai.wp.length < 3) this.planAhead(); }
      if (!wp) { this.planAhead(); wp = ai.wp[0]; }
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
        if (st !== 'G' && dist < 30 && !(st === 'Y' && dist < vf * 1.4)) target = Math.min(target, Math.max(0, (dist - 3) * 1.2));
      }
      if (this.police) target = Math.max(target, 18 * wp.speed);
    }
    // obstacle ahead
    const look = 10 + Math.max(vf, 0) * 0.9;
    for (const o of G.vehicles) {
      if (o === this || !o.group.visible) continue;
      const dx = o.x - this.x, dz = o.z - this.z;
      const along = dx * sH + dz * cH;
      if (along < 1 || along > look + o.L * 0.5) continue;
      const lat = Math.abs(dx * cH - dz * sH);
      if (lat < (this.W + o.W) * 0.5 + 0.5) { target = Math.min(target, Math.max(0, (along - o.L * 0.5 - this.L * 0.5 - 2.5) * 1.1, o.speed * 0.7)); if (along < 6 && ai.honk <= 0 && Math.random() < 0.01) { ai.honk = 4; G.audio.horn?.(); } }
    }
    for (const h of G.humans) {
      if (h.dead || h.hidden) continue;
      const dx = h.x - this.x, dz = h.z - this.z;
      const along = dx * sH + dz * cH;
      if (along < 0.5 || along > look * 0.9) continue;
      const lat = Math.abs(dx * cH - dz * sH);
      if (lat < this.W * 0.5 + 0.9) target = Math.min(target, Math.max(0, (along - 4) * 1.3));
    }
    if (G.playerOnFoot && G.player) {
      const dx = G.player.x - this.x, dz = G.player.z - this.z; const along = dx * sH + dz * cH;
      if (along > 0.5 && along < look * 0.9 && Math.abs(dx * cH - dz * sH) < this.W * 0.5 + 1) target = Math.min(target, Math.max(0, (along - 4) * 1.3));
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
    else if (dv < -0.5) { this.throttle = 0; this.brake = clamp(-dv * 0.25, 0, 1); }
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
