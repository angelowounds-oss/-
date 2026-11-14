import * as THREE from 'three';
import { Human } from './human.js';
import { rand, hyp } from './util.js';
import { carriage } from './carriage.js';
import { regionWeight } from './region.js';
import { signalState } from './streetgeo.js';

// Pedestrians on the compiled regions' streets (EV-25). The capital's grid and the other cities' plans have their own walkers (citizens.js,
// citylife.js); the 1:1 streets of a compiled region had none. Here up to WALKERS civilians walk the pavements of the two-way compiled streets
// within NEAR m of the player: each keeps to one side of one street, a pavement's width out from the carriageway's edge, and turns back at the
// street's end. They are made two a tick (a skinned character costs a few ms) and moved back in front of the player when he leaves them behind.
// Motorways, trunk roads, their links and one-way carriageways (the halves of a divided road, with no pavement between them) get none.
const WALKERS = 24, NEAR = 170, FAR = 220, PAVE = 1.9;
const NO_WALK = { motorway: 1, trunk: 1, motorway_link: 1, trunk_link: 1, primary_link: 1, secondary_link: 1, tertiary_link: 1 };

export class StreetWalk {
  constructor(G) { this.G = G; this.walkers = []; this.t = 0; this.crossings = 0; this.onGreen = 0; this.planned = { straight: 0, turn: 0, back: 0 }; }   // counts for the tests

  update(dt) {
    this.t -= dt; if (this.t > 0) return; this.t = 0.5;
    const G = this.G, H = G.hwtraffic, f = G.focusPos();
    if (!H || (f.y || 0) > 80 || regionWeight(f.x, f.z) < 0.5) { if (this.walkers.length) this.release(); return; }
    for (let k = this.walkers.length - 1; k >= 0; k--) {
      const h = this.walkers[k]; if (h.dead || h.remove || !G.humans.includes(h)) { this.walkers.splice(k, 1); continue; }
      if (hyp(h.x - f.x, h.z - f.z) > FAR && !this.place(h, f)) { h.remove = true; this.walkers.splice(k, 1); }
    }
    for (let n = 0; n < 2 && this.walkers.length < WALKERS; n++) {
      const hue = () => new THREE.Color().setHSL(Math.random(), 0.45, 0.22).getHex();
      const h = new Human(G, 'civ', { hp: 40, look: { top: hue(), pants: new THREE.Color().setHSL(Math.random(), 0.2, 0.1).getHex(), trim: null, cap: Math.random() < 0.15 ? 0x1b1d26 : null } });
      if (!this.place(h, f)) { h.group.removeFromParent?.(); break; }
      h.remoteCiv = true; h.noVisit = true; h.streetWalk = true; h.steerFn = (hh) => this.steer(hh);
      G.humans.push(h); G.scene.add(h.group); this.walkers.push(h);
    }
  }

  // the pavement point of street r at sample i on side s (+1 left of the samples' direction, -1 right)
  pave(r, i, s) {
    const n = r.x.length, a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let tx = r.x[b] - r.x[a], tz = r.z[b] - r.z[a]; const l = hyp(tx, tz) || 1; tx /= l; tz /= l;
    const off = s * (carriage(r).half + PAVE);
    return { x: r.x[i] - tz * off, z: r.z[i] + tx * off };
  }
  // put a walker on a pavement 35..NEAR m from the player; false if no street there takes one
  place(h, f) {
    const G = this.G, H = G.hwtraffic;
    for (let tr = 0; tr < 10; tr++) {
      const ang = Math.random() * Math.PI * 2, rr = rand(35, NEAR), near = H.nearestSample(f.x + Math.sin(ang) * rr, f.z + Math.cos(ang) * rr, 40, true);
      if (!near) continue;
      const r = near.r; if (r.kind !== 'arterial' || r.oneway || NO_WALK[r.hw] || r.x.length < 6) continue;
      const i = Math.max(2, Math.min(r.x.length - 3, near.i)), s = Math.random() < 0.5 ? 1 : -1, P = this.pave(r, i, s), d = hyp(P.x - f.x, P.z - f.z);
      if (d < 35 || d > NEAR) continue;
      const gy = G.groundY(P.x, P.z, r.y[i] + 3); if (!(Math.abs(gy - r.y[i]) < 1.5)) continue;   // a street on a viaduct or in a cutting: no pavement at its side
      h.ground = true; h.x = P.x; h.z = P.z; h.y = gy; h.floorY = gy; h.vx = h.vz = 0; h.knock = 0; h.state = 'walk';
      h.walk = { r, i, s, dir: Math.random() < 0.5 ? 1 : -1, pace: rand(1.15, 1.6) };
      h.group.position.set(P.x, gy, P.z); h.group.visible = true; return true;
    }
    return false;
  }
  // along the pavement: toward the point a few samples ahead, turning back at the street's end. At a signalled junction a walker goes straight on
  // over the crossing on its side, turns into the crossing street, or crosses its own street and walks back (junction); a crossing is waited for
  // at the kerb until the cars it passes in front of have red, with 8 s of it left
  steer(h) {
    const w = h.walk; if (!w) return null;
    if (w.route && w.route.length) {
      const q = w.route[0], dx = q.x - h.x, dz = q.z - h.z, d = hyp(dx, dz) || 1;
      if (d < 0.8) {
        if (q.wait && !this.walkOn(q.wait)) return { x: q.wait.fx, z: q.wait.fz, s: 0, face: null };
        if (q.wait) { this.crossings++; w.crossed = (w.crossed || 0) + 1; }
        if (q.end && signalState(q.end.a.g, this.G.streetscape.t, q.end.j.phase) !== 0) this.onGreen++;   // still on the crossing when its cars got yellow or green
        w.route.shift(); if (!w.route.length) w.crossing = false; return this.steer(h);
      }
      return { x: dx / d, z: dz / d, s: h.stateT > 0 ? 0 : w.pace, face: null };
    }
    const r = w.r, n = r.x.length;
    let P = this.pave(r, w.i, w.s);
    for (let g = 0; g < 4 && hyp(P.x - h.x, P.z - h.z) < 2.5; g++) {
      const ni = w.i + w.dir, P0 = P;
      // at the street's end: a street that ends at a junction has its last sample on it, so the step to that end is checked before turning back
      if (ni < 1 || ni > n - 2) { if (this.junction(h, w, P0, this.pave(r, Math.max(0, Math.min(n - 1, ni)), w.s))) return this.steer(h); w.dir = -w.dir; } else w.i = ni;
      P = this.pave(r, w.i, w.s);
      if (ni === w.i && this.junction(h, w, P0, P)) return this.steer(h);
    }
    const dx = P.x - h.x, dz = P.z - h.z, d = hyp(dx, dz) || 1;
    return { x: dx / d, z: dz / d, s: h.stateT > 0 ? 0 : w.pace, face: null };
  }

  // may a walker waiting at a crossing step onto it: the cars of the arm it crosses have red now and still in 8 s
  walkOn(c) { const t = this.G.streetscape?.t ?? 0; return signalState(c.a.g, t, c.j.phase) === 0 && signalState(c.a.g, t + 8, c.j.phase) === 0; }

  // a signalled junction on the pavement's step from P0 to P (samples lie up to tens of metres apart): plan the walker's way over it (w.route),
  // once per junction; true when planned
  junction(h, w, P0, P) {
    const L = this.G.hwtraffic?.sig; if (!L) return false;
    const ex = P.x - P0.x, ez = P.z - P0.z, el = hyp(ex, ez) || 1, tx = ex / el, tz = ez / el;   // the direction of travel
    let j = null;
    for (const c of L) { const u = Math.max(0, Math.min(el, (c.x - P0.x) * tx + (c.z - P0.z) * tz)); if (hyp(P0.x + tx * u - c.x, P0.z + tz * u - c.z) < Math.max(...c.arms.map((a) => a.stop)) + 6) { j = c; break; } }
    if (!j) return false;
    const key = Math.round(j.x) * 1e6 + Math.round(j.z); if (w.lastJ === key) return false; w.lastJ = key;
    const r = w.r, c = { x: r.x[w.i], z: r.z[w.i] }, lx = P.x - c.x, lz = P.z - c.z, ll = hyp(lx, lz) || 1;   // the walker's side of its street
    let side = -1, own = -1, bs = 0.6, bo = 0.6;
    j.arms.forEach((a, k) => { const ax = Math.cos(a.ang), az = Math.sin(a.ang), ds = (ax * lx + az * lz) / ll, dj = -(ax * tx + az * tz); if (ds > bs) { bs = ds; side = k; } if (dj > bo) { bo = dj; own = k; } });
    P = P0;   // the corner the walker arrives at: kerbs and the turning pavement are picked nearest to where it came from
    // the two kerb ends of an arm's crossing, the near one (to P) first
    const kerbs = (k) => { const a = j.arms[k], sc = a.s0 + a.len / 2, ax = Math.cos(a.ang), az = Math.sin(a.ang), o = a.half + 0.8;
      const A = { x: j.x + ax * sc - az * o, z: j.z + az * sc + ax * o }, B = { x: j.x + ax * sc + az * o, z: j.z + az * sc - ax * o };
      return hyp(A.x - P.x, A.z - P.z) < hyp(B.x - P.x, B.z - P.z) ? [A, B] : [B, A]; };
    const cross = (k) => { const [A, B] = kerbs(k), fx = B.x - A.x, fz = B.z - A.z, fl = hyp(fx, fz) || 1; const c = { j, a: j.arms[k], fx: fx / fl, fz: fz / fl }; return [{ x: A.x, z: A.z, wait: c }, { x: B.x, z: B.z, end: c }]; };
    // where the walker's own street goes on past the junction, on the same side
    let past = -1; for (let q = w.i, m = 0; m < 40; m++, q += w.dir) { if (q < 1 || q > r.x.length - 2) break; const Q = this.pave(r, q, w.s); if ((Q.x - j.x) * tx + (Q.z - j.z) * tz > 0 && hyp(Q.x - j.x, Q.z - j.z) > 14) { past = q; break; } }
    const turn = side >= 0 ? this.streetFrom(j, j.arms[side], P) : null, roll = this.prefer === 'straight' ? 0 : this.prefer === 'turn' ? 0.7 : Math.random();   // prefer: a test's choice
    if (side >= 0 && j.arms[side].cross && past >= 0 && (roll < 0.55 || (!turn && own < 0))) {
      w.route = cross(side); w.i = past; w.crossing = true; w.plan = 'straight'; this.planned.straight++; return true;
    }
    if (turn && (roll < 0.85 || own < 0 || !j.arms[own].cross)) { w.r = turn.r; w.i = turn.i; w.s = turn.s; w.dir = turn.dir; w.plan = 'turn'; this.planned.turn++; return true; }
    if (own >= 0 && j.arms[own].cross) { w.route = cross(own); w.s = -w.s; w.dir = -w.dir; w.crossing = true; w.plan = 'back'; this.planned.back++; return true; }   // w.plan, w.crossed: the last plan and crossings walked (tests)
    return false;
  }

  // the pavement of the street leaving junction j along arm a on the corner nearest P: { r, i, s, dir } walking away from the junction, or null
  streetFrom(j, a, P) {
    const H = this.G.hwtraffic, ax = Math.cos(a.ang), az = Math.sin(a.ang), near = H.nearestSample(j.x + ax * 25, j.z + az * 25, 12, true);
    if (!near) return null;
    const r = near.r; if (r.kind !== 'arterial' || r.oneway || NO_WALK[r.hw] || r.x.length < 6) return null;
    const i = Math.max(2, Math.min(r.x.length - 3, near.i)), d1 = hyp(r.x[i + 1] - j.x, r.z[i + 1] - j.z), d0 = hyp(r.x[i - 1] - j.x, r.z[i - 1] - j.z), dir = d1 > d0 ? 1 : -1;
    const L = this.pave(r, i, 1), R = this.pave(r, i, -1), s = hyp(L.x - P.x, L.z - P.z) < hyp(R.x - P.x, R.z - P.z) ? 1 : -1;
    return { r, i, s, dir };
  }

  release() { for (const h of this.walkers) h.remove = true; this.walkers = []; }
}
