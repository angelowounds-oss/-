import * as THREE from 'three';
import { clamp, dampAngle } from './util.js';

// Movement gear: grappling hook (fire at any wall / roof edge, the winch reels you in, swing on the rope, jump off) and
// a ram-air parachute (deploy while falling, steer with the camera, W/S to dive/flare, Z to cut away).
const RANGE = 60, REEL = 15, MAXV = 26, SHOOT_T = 0.14, ROPE_PTS = 14;
const WORLD = 1 | 16;                       // static world + objects

export class Mobility {
  constructor(G) {
    this.G = G; this.grap = null; this.chute = null; this.miss = null; this.drop = null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(ROPE_PTS * 3), 3));
    this.rope = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x15171c }));
    this.rope.frustumCulled = false; this.rope.visible = false; G.scene.add(this.rope);
    this.hook = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.85, roughness: 0.3 }));
    this.hook.visible = false; G.scene.add(this.hook);
    this.canopy = makeCanopy(); this.canopy.visible = false; G.scene.add(this.canopy);
    this.tmp = new THREE.Vector3(); this.hand = new THREE.Vector3();
  }
  // true while this module owns the player's movement (rope taut, canopy open)
  active() { return !!((this.grap && this.grap.t > SHOOT_T) || this.chute); }

  // ---------------------------------------------------------------- input (called every on-foot frame)
  input(dt, inp) {
    const G = this.G, pl = G.player, c3 = pl.body3, I = G.input;
    if (I.edge('grapple')) { if (this.grap) this.release(); else this.fire(); }
    if (this.grap && this.grap.t > SHOOT_T && I.edges.jump > 0) { I.edge('jump'); this.release(5.2); }   // jump off the rope, keeping the swing
    // parachute: Space while falling with enough height below
    const falling = !c3.grounded && !pl.swimming && !this.grap && !this.chute && (pl.vy || 0) < -2.5;
    if (falling && G.items.count('parachute') > 0) {
      if (I.edges.jump > 0) {
        I.edge('jump');
        const gnd = G.phys.ray(pl.x, pl.y + 0.3, pl.z, 0, -1, 0, 300, WORLD | 32), h = gnd ? gnd.t - 0.3 : 300;
        if (h > 6) this.deploy(); else G.toast('너무 낮다', '낙하산을 펼칠 높이가 아니다');
      } else if (c3.airT > 0.7 && (pl.vy || 0) < -9 && !this._hinted) { this._hinted = true; G.toast('낙하산', '<kbd>Space</kbd> 펼치기'); }
    }
    if (c3.grounded) this._hinted = false;
    if (this.chute && I.edges.jump > 0) I.edge('jump');          // Space does nothing under the canopy (and must not jump on landing)
  }

  // ---------------------------------------------------------------- grappling hook
  fire() {
    const G = this.G, pl = G.player;
    if (!G.items.count('grapple')) { G.toast('그래플링 훅이 없다', '철물점에서 판다'); return; }
    if (pl.swimming || G.vehicle || pl.hang || pl.mantle || pl.rag || pl.dead || this.chute) return;
    const cam = G.camera, d = this.tmp.set(0, 0, -1).applyQuaternion(cam.quaternion), o = cam.position;
    const hit = G.phys.ray(o.x, o.y, o.z, d.x, d.y, d.z, RANGE + 8, WORLD);
    G.audio.tone?.(1300, 0.06, 'square', 0.06, 500); G.audio.noiseShot?.(0.18, 'highpass', 2500, 0.18, 1);
    const ax = o.x + d.x * (hit ? hit.t : RANGE), ay = o.y + d.y * (hit ? hit.t : RANGE), az = o.z + d.z * (hit ? hit.t : RANGE);
    const dist = Math.hypot(ax - pl.x, ay - (pl.y + 1.3), az - pl.z);
    if (!hit || dist > RANGE || dist < 2.5 || (hit.ref && hit.ref.tag === 'glass')) { this.miss = { x: ax, y: ay, z: az, t: 0 }; return; }
    this.grap = { x: ax, y: ay, z: az, nx: hit.nx, ny: hit.ny, nz: hit.nz, L: dist, t: 0, stuck: 0 };
    G.noise?.(pl.x, pl.z, 8);
  }
  release(kick = 0) {
    const G = this.G, pl = G.player;
    if (!this.grap) return;
    this.grap = null;
    if (kick) { pl.body3.vy = Math.max(pl.body3.vy, 0) + kick; pl.body3.grounded = false; pl.vy = pl.body3.vy; }
    G.audio.tone?.(500, 0.05, 'square', 0.04, 260);
  }
  stepRope(dt, inp, dx, dz, mag) {
    const G = this.G, pl = G.player, c3 = pl.body3, g = this.grap;
    g.L = Math.max(g.hold ? g.L : 1.2, g.L - REEL * dt);
    let vx = pl.vx, vy = c3.vy, vz = pl.vz;
    vy -= 9.81 * dt;
    vx += dx * mag * 6 * dt; vz += dz * mag * 6 * dt;                     // pump the swing
    const px = pl.x, py = pl.y + 1.25, pz = pl.z;
    let rx = px - g.x, ry = py - g.y, rz = pz - g.z; const d = Math.hypot(rx, ry, rz) || 1; rx /= d; ry /= d; rz /= d;
    if (d > g.L - 0.05) {
      // taut rope: no outward speed, and the winch pulls in at up to REEL m/s
      const vr = vx * rx + vy * ry + vz * rz, want = -Math.min(REEL, (d - g.L) * 6 + (g.hold ? 0 : 3));
      if (vr > want) { vx += rx * (want - vr); vy += ry * (want - vr); vz += rz * (want - vr); }
    }
    if (c3.grounded && g.y > pl.y + 1.5) vy = Math.max(vy, 3.5);           // lift off the ground
    const s = Math.hypot(vx, vy, vz); if (s > MAXV) { vx *= MAXV / s; vy *= MAXV / s; vz *= MAXV / s; }
    const m = c3.moveVel(dt, vx, vy, vz);
    pl.vx = m.x; pl.vz = m.z; pl.vy = c3.vy;
    // stuck behind something: let go after a moment
    const nd = Math.hypot(pl.x - g.x, pl.y + 1.25 - g.y, pl.z - g.z);
    g.stuck = Math.hypot(m.x, m.y, m.z) < 1 && !g.hold ? g.stuck + dt : 0;
    if (g.stuck > 0.9 || (g.t > 10 && !g.hold)) { this.release(); return; }
    if (nd < 1.8 && !g.hold) this.arrive();
  }
  arrive() {
    const G = this.G, pl = G.player, g = this.grap, ph = G.phys;
    if (g.ny > 0.6) {                                                      // a floor / roof top: hop onto it
      this.release(4.2); pl.vx = (g.x - pl.x) * 2.5; pl.vz = (g.z - pl.z) * 2.5; return;
    }
    // a wall: grab the ledge above if there is one within reach, otherwise hang on the rope against the wall
    const lx = g.x - g.nx * 0.45, lz = g.z - g.nz * 0.45, top = ph.ray(lx, g.y + 2.6, lz, 0, -1, 0, 3.4, WORLD | 32);
    if (top) {
      const ty = g.y + 2.6 - top.t;
      if (ty > g.y - 0.3 && !ph.ray(lx, ty + 0.1, lz, 0, 1, 0, 1.75, WORLD | 32)) {
        const hx = g.x + g.nx * 0.32, hz = g.z + g.nz * 0.32;
        this.grap = null;
        pl.hang = { x: hx, y: ty - 1.85, z: hz, ty, px: lx, pz: lz, ry: Math.atan2(-g.nx, -g.nz), t: 0 }; pl.vx = pl.vz = 0;
        G.toast('매달렸다', 'W/Space: 올라가기 · S/Z: 놓기'); return;
      }
    }
    g.hold = true; g.L = 1.5;                                              // dangle: Space to let go, wheel-click to drop
    G.toast('줄에 매달렸다', '<kbd>Space</kbd> 뛰어내리기 · <kbd>휠클릭</kbd> 놓기');
  }

  // ---------------------------------------------------------------- parachute
  deploy() {
    const G = this.G, pl = G.player;
    if (!G.items.take('parachute')) return;
    this.chute = { t: 0, open: 0, yaw: G.cam.yaw };
    this.canopy.visible = true; this.canopy.traverse((o) => { if (o.material) o.material.opacity = 1; });
    G.audio.noiseShot?.(0.7, 'bandpass', 600, 0.5, 0.8, null, 0, 180); G.audio.tone?.(90, 0.3, 'sine', 0.25, 50, null, 0.15);
    G.shake?.(0.35); G.onItemChange?.();
  }
  cutAway(reason) {
    const G = this.G; if (!this.chute) return;
    this.chute = null;
    this.drop = { t: 0, x: this.canopy.position.x, y: this.canopy.position.y, z: this.canopy.position.z };
    if (reason !== 'land') G.toast('낙하산 분리');
  }
  stepChute(dt, inp) {
    const G = this.G, pl = G.player, c3 = pl.body3, ch = this.chute;
    ch.t += dt; ch.open = Math.min(1, ch.t / 0.9);
    ch.yaw = dampAngle(ch.yaw, G.cam.yaw, 1.4, dt);                        // the canopy turns toward where the camera looks
    const f = inp.my || 0, hs = 7 + f * 3.5, vyT = -(4.2 + Math.max(0, f) * 1.4 - Math.max(0, -f) * 1.2);
    const side = (inp.mx || 0) * 1.8;
    const tx = Math.sin(ch.yaw) * hs + Math.cos(ch.yaw) * -side, tz = Math.cos(ch.yaw) * hs - Math.sin(ch.yaw) * -side;
    const k = 1 - Math.exp(-dt * (0.5 + 2.8 * ch.open));
    let vx = pl.vx + (tx - pl.vx) * k, vz = pl.vz + (tz - pl.vz) * k, vy = c3.vy + (vyT - c3.vy) * k;
    const m = c3.moveVel(dt, vx, vy, vz);
    pl.vx = m.x; pl.vz = m.z; pl.vy = c3.vy;
    const w = G.waterAt(pl.x, pl.z);
    if (c3.grounded || (w && pl.y < w.y + 0.3)) { this.cutAway('land'); G.audio.footstep?.('soft', 0.8); if (!w) G.toast('착지'); }
  }

  // ---------------------------------------------------------------- movement step (replaces the walk step while active)
  move(dt, inp, dx, dz, mag) {
    const G = this.G, pl = G.player;
    if (pl.swimming || pl.dead || pl.rag || G.vehicle) { this.release(); if (this.chute) this.cutAway('land'); return; }
    if (this.grap) this.stepRope(dt, inp, dx, dz, mag);
    else if (this.chute) this.stepChute(dt, inp);
  }

  // ---------------------------------------------------------------- per-frame visuals
  update(dt) {
    const G = this.G, pl = G.player;
    if (this.grap) {
      const g = this.grap; g.t += dt;
      if (pl.dead || pl.rag || G.vehicle || pl.swimming || pl.hang || pl.mantle) this.release();
    }
    // rope from the right hand to the hook (or flying out / snapping back on a miss)
    const pos = this.rope.geometry.attributes.position;
    let tip = null, k = 1, slack = 0;
    if (this.grap) { tip = this.grap; k = Math.min(1, this.grap.t / SHOOT_T); }
    else if (this.miss) { this.miss.t += dt; tip = this.miss; const u = this.miss.t / 0.35; k = u < 0.5 ? u * 2 : 2 - u * 2; if (u >= 1) this.miss = null; slack = 0.6; }
    if (tip && !pl.dead) {
      pl.m.hand.getWorldPosition(this.hand);
      const ex = this.hand.x + (tip.x - this.hand.x) * k, ey = this.hand.y + (tip.y - this.hand.y) * k, ez = this.hand.z + (tip.z - this.hand.z) * k;
      const len = Math.hypot(ex - this.hand.x, ey - this.hand.y, ez - this.hand.z);
      const sag = this.grap ? Math.max(0, (this.grap.L - len) * 0.3) + (k < 1 ? 0 : 0) : slack;
      for (let i = 0; i < ROPE_PTS; i++) {
        const s = i / (ROPE_PTS - 1);
        pos.setXYZ(i, this.hand.x + (ex - this.hand.x) * s, this.hand.y + (ey - this.hand.y) * s - sag * 4 * s * (1 - s), this.hand.z + (ez - this.hand.z) * s);
      }
      pos.needsUpdate = true; this.rope.visible = true;
      this.hook.visible = true; this.hook.position.set(ex, ey, ez); this.hook.lookAt(ex + (ex - this.hand.x), ey + (ey - this.hand.y), ez + (ez - this.hand.z));
    } else { this.rope.visible = false; this.hook.visible = false; }
    // canopy above the player, unfolding over ~0.9 s
    if (this.chute) {
      const o = this.chute.open, e = o * o * (3 - 2 * o);
      this.canopy.position.set(pl.x, pl.y, pl.z); this.canopy.rotation.set(-0.12 * e, this.chute.yaw, 0);
      this.canopy.scale.set(0.12 + 0.88 * e, 0.35 + 0.65 * e, 0.5 + 0.5 * e);
    } else if (this.drop) {   // released canopy: drifts down, collapses and fades
      const d = this.drop; d.t += dt; const u = Math.min(1, d.t / 2.2);
      this.canopy.position.set(d.x, d.y - u * 3.2, d.z); this.canopy.scale.set(1 + u * 0.2, Math.max(0.05, 1 - u), 1);
      this.canopy.traverse((q) => { if (q.material) q.material.opacity = 1 - u; });
      if (u >= 1) { this.drop = null; this.canopy.visible = false; }
    }
  }
}

// ram-air canopy: an arched cylindrical shell (span left-right, chord along the flight direction) with suspension lines
function makeCanopy() {
  const grp = new THREE.Group(), R = 3.6, arc = 1.9, chord = 2.5, top = 4.8;
  const geo = new THREE.CylinderGeometry(R, R, chord, 24, 1, true, -arc / 2, arc);
  geo.rotateX(-Math.PI / 2); geo.translate(0, top - R, 0);
  const pos = geo.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) { const cell = Math.floor((pos.getX(i) + R) / (2 * R) * 7); const c = cell % 2 ? [1, 0.35, 0.12] : [0.12, 0.13, 0.16]; col.push(...c); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75, transparent: true, flatShading: true });
  grp.add(new THREE.Mesh(geo, mat));
  // suspension lines: from the canopy's lower edge to the shoulders
  const pts = [];
  for (const sx of [-1, 1]) for (const a of [0.35, 0.7, 0.95]) for (const z of [-chord / 2, chord / 2]) {
    const th = a * arc / 2 * sx, ex = R * Math.sin(th), ey = top - R + R * Math.cos(th);
    pts.push(ex, ey, z * 0.95, sx * 0.22, 1.45, 0);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  grp.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2a2c33, transparent: true })));
  grp.traverse((o) => { o.frustumCulled = false; });
  return grp;
}
