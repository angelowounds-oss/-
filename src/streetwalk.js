import * as THREE from 'three';
import { Human } from './human.js';
import { rand, hyp } from './util.js';
import { carriage } from './carriage.js';
import { regionWeight } from './region.js';

// Pedestrians on the compiled regions' streets (EV-25). The capital's grid and the other cities' plans have their own walkers (citizens.js,
// citylife.js); the 1:1 streets of a compiled region had none. Here up to WALKERS civilians walk the pavements of the two-way compiled streets
// within NEAR m of the player: each keeps to one side of one street, a pavement's width out from the carriageway's edge, and turns back at the
// street's end. They are made two a tick (a skinned character costs a few ms) and moved back in front of the player when he leaves them behind.
// Motorways, trunk roads, their links and one-way carriageways (the halves of a divided road, with no pavement between them) get none.
const WALKERS = 24, NEAR = 170, FAR = 220, PAVE = 1.9;
const NO_WALK = { motorway: 1, trunk: 1, motorway_link: 1, trunk_link: 1, primary_link: 1, secondary_link: 1, tertiary_link: 1 };

export class StreetWalk {
  constructor(G) { this.G = G; this.walkers = []; this.t = 0; }

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
  // along the pavement: toward the point a few samples ahead, turning back at the street's end
  steer(h) {
    const w = h.walk; if (!w) return null;
    const r = w.r, n = r.x.length;
    let P = this.pave(r, w.i, w.s);
    for (let g = 0; g < 4 && hyp(P.x - h.x, P.z - h.z) < 2.5; g++) {
      const ni = w.i + w.dir; if (ni < 1 || ni > n - 2) w.dir = -w.dir; else w.i = ni;
      P = this.pave(r, w.i, w.s);
    }
    const dx = P.x - h.x, dz = P.z - h.z, d = hyp(dx, dz) || 1;
    return { x: dx / d, z: dz / d, s: h.stateT > 0 ? 0 : w.pace, face: null };
  }

  release() { for (const h of this.walkers) h.remove = true; this.walkers = []; }
}
