import * as THREE from 'three';
import { Vehicle, CAR_COLORS } from './vehicle.js';
import { Human } from './human.js';
import { rand } from './util.js';

// Street life in the other cities (the capital has its own, bound to its road grid): pedestrians that walk the pavements and cars that drive the
// streets while the player is inside a city's disc. Both exist only near the player. The streets are the city plan's axis-aligned lines
// (citylayout.js): a walker or a car follows one line and may turn into a crossing line at an intersection.
// Pedestrians are new civilians (the game's own population only exists around the capital's grid; the game removes civilians more than
// 240 m from the player, so they are made and lost as the player walks). Cars are made like the highway traffic (hwtraffic.js) and driven by Vehicle.driveAI through
// the waypoints `planAhead` hands out.
const WALKERS = 26, CARS = 14, NEAR = 170, FAR = 215, CAR_NEAR = 330, CAR_FAR = 480, STEP = 16;
const KINDS = ['sedan', 'sedan', 'sedan', 'suv', 'sport', 'truck', 'suv'];

export class CityLife {
  constructor(G) { this.G = G; this.city = null; this.walkers = []; this.cars = []; this.t = 0; }

  // the street lines of a city: vertical roads x = c and horizontal roads z = c with their width and extent (relative to the centre)
  linesOf(C) {
    if (C.lines) return C.lines;
    const R = C.L.roads, v = [], h = [];
    for (let i = 0; i < R.length; i += 5) {
      const x0 = R[i], z0 = R[i + 1], x1 = R[i + 2], z1 = R[i + 3], w = R[i + 4];
      if (x0 === x1) v.push({ c: x0, a: Math.min(z0, z1), b: Math.max(z0, z1), w }); else if (z0 === z1) h.push({ c: z0, a: Math.min(x0, x1), b: Math.max(x0, x1), w });
    }
    return (C.lines = { v, h });
  }

  update(dt) {
    this.t -= dt; if (this.t > 0) return; this.t = 0.5;
    const G = this.G, S = G.citysites, f = G.focusPos(); if (!S) return;
    let C = null;
    for (const c of S.cities) if (Math.hypot(f.x - c.c.x, f.z - c.c.z) < c.L.R * 1.02) { C = c; break; }
    if (C !== this.city) { this.release(); this.city = C; }
    if (!C) return;
    this.tickWalkers(C, f); this.tickCars(C, f);
  }

  // ---- pedestrians
  tickWalkers(C, f) {
    const G = this.G;
    for (let k = this.walkers.length - 1; k >= 0; k--) {
      const h = this.walkers[k]; if (h.dead || !G.humans.includes(h)) { this.walkers.splice(k, 1); continue; }
      if (Math.hypot(h.x - f.x, h.z - f.z) > FAR) this.place(C, h, f);
    }
    for (let n = 0; n < 2 && this.walkers.length < WALKERS; n++) {   // two a tick: making a skinned character costs a few ms
      const hue = () => new THREE.Color().setHSL(Math.random(), 0.5, 0.2).getHex();
      const h = new Human(G, 'civ', { hp: 40, look: { top: hue(), pants: new THREE.Color().setHSL(Math.random(), 0.2, 0.1).getHex(), trim: Math.random() < 0.35 ? [[1, 0.2, 0.8], [0.2, 0.9, 1], [1, 0.6, 0.2]][Math.floor(Math.random() * 3)] : null, cap: Math.random() < 0.2 ? 0x1b1d26 : null } });
      if (!this.place(C, h, f)) { h.group.removeFromParent?.(); break; }
      h.remoteCiv = true; h.noVisit = true; h.steerFn = (hh, dt) => this.steer(C, hh, dt); G.humans.push(h); G.scene.add(h.group); this.walkers.push(h);
    }
  }
  // put a walker on a pavement 35..NEAR m from the player, walking along a street
  place(C, h, f) {
    const L = this.linesOf(C), c = C.c;
    for (let tr = 0; tr < 12; tr++) {
      const vert = Math.random() < 0.5, set = (vert ? L.v : L.h).filter((q) => Math.abs(q.c - (vert ? f.x - c.x : f.z - c.z)) < NEAR); if (!set.length) continue;
      const ln = set[Math.floor(Math.random() * set.length)], side = Math.random() < 0.5 ? 1 : -1, pc = vert ? f.z - c.z : f.x - c.x, t = Math.max(ln.a + 10, Math.min(ln.b - 10, pc + rand(-NEAR, NEAR))), off = side * (ln.w / 2 + 2.2);
      const x = c.x + (vert ? ln.c + off : t), z = c.z + (vert ? t : ln.c + off), d = Math.hypot(x - f.x, z - f.z);
      if (d < 35 || d > NEAR) continue;
      h.x = x; h.z = z; h.y = 0; h.floorY = 0; h.vx = h.vz = 0; h.knock = 0; h.state = 'walk'; h.walk = { vert, ln, side, dir: Math.random() < 0.5 ? 1 : -1, cool: 0 };
      h.group.position.set(x, 0, z); h.group.visible = true; return true;
    }
    return false;
  }
  steer(C, h, dt) {
    const w = h.walk, c = C.c; if (!w) return null;
    const vert = w.vert, pos = vert ? h.z - c.z : h.x - c.x, lat = vert ? h.x - c.x : h.z - c.z;
    // at an intersection (a crossing line just ahead) sometimes turn into it
    if ((w.cool -= dt) <= 0) {
      w.cool = 0.5;
      const L = this.linesOf(C), cross = vert ? L.h : L.v;
      for (const q of cross) {
        if ((q.c - pos) * w.dir < 2 || (q.c - pos) * w.dir > 6 || lat < q.a + 10 || lat > q.b - 10 || Math.random() > 0.3) continue;
        h.walk = { vert: !vert, ln: q, side: Math.random() < 0.5 ? 1 : -1, dir: lat < (q.a + q.b) / 2 ? 1 : -1, cool: 4 }; return null;
      }
    }
    const ln = w.ln; if (pos < ln.a + 6) w.dir = 1; else if (pos > ln.b - 6) w.dir = -1;
    const off = w.side * (ln.w / 2 + 2.2), ahead = pos + w.dir * 7, tx = vert ? c.x + ln.c + off : c.x + ahead, tz = vert ? c.z + ahead : c.z + ln.c + off;
    const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, z: dz / d, s: h.stateT > 0 ? 0 : 1.45, face: null };
  }

  // ---- cars
  tickCars(C, f) {
    const G = this.G, L = this.linesOf(C);
    for (let k = this.cars.length - 1; k >= 0; k--) {
      const v = this.cars[k];
      if (!G.vehicles.includes(v)) { this.cars.splice(k, 1); continue; }
      if (v === G.vehicle) { v.cl = null; v.planAhead = null; this.cars.splice(k, 1); continue; }
      if (Math.hypot(v.x - f.x, v.z - f.z) > CAR_FAR || (v.dead && v.age > 30)) { G.removeVehicle(v); this.cars.splice(k, 1); }
    }
    if (this.cars.length >= CARS || (f.y || 0) > 60) return;
    for (let tr = 0; tr < 3 && this.cars.length < CARS; tr++) {
      const vert = Math.random() < 0.5, set = (vert ? L.v : L.h).filter((q) => Math.abs(q.c - (vert ? f.x - C.c.x : f.z - C.c.z)) < CAR_NEAR); if (!set.length) continue;
      const ln = set[Math.floor(Math.random() * set.length)], dir = Math.random() < 0.5 ? 1 : -1, pc = vert ? f.z - C.c.z : f.x - C.c.x, t = Math.max(ln.a + 20, Math.min(ln.b - 20, pc + rand(-CAR_NEAR, CAR_NEAR)));
      const P = this.lanePoint(C, vert, ln, t, dir), d = Math.hypot(P.x - f.x, P.z - f.z);
      if (d < 90 || d > CAR_NEAR) continue;
      if (this.cars.some((o) => Math.hypot(o.x - P.x, o.z - P.z) < 25)) continue;
      this.spawnCar(C, { vert, ln, t, dir });
    }
  }
  // a point on the right-hand lane of a street line travelling in `dir` (+1: toward larger t); heading = atan2(dx, dz)
  lanePoint(C, vert, ln, t, dir) {
    const hx = vert ? 0 : dir, hz = vert ? dir : 0, o = ln.w * 0.25, c = C.c;   // right of travel is (hz, -hx): the same convention as hwtraffic.js
    return { x: c.x + (vert ? ln.c : t) + hz * o, z: c.z + (vert ? t : ln.c) - hx * o, h: Math.atan2(hx, hz) };
  }
  spawnCar(C, cur) {
    const G = this.G, P = this.lanePoint(C, cur.vert, cur.ln, cur.t, cur.dir), type = KINDS[Math.floor(Math.random() * KINDS.length)];
    const v = new Vehicle(G, type, CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], 'traffic');
    v.kind = 'traffic'; v.driver = 'ai'; v.cl = cur; v.ai.speed = rand(9, 15) * (type === 'truck' ? 0.8 : 1);
    v.x = P.x; v.z = P.z; v.h = P.h; v.vx = Math.sin(P.h) * 8; v.vz = Math.cos(P.h) * 8; v.startY = undefined;
    v.planAhead = () => this.plan(C, v);
    G.addVehicle(v); v.pv.body.setTranslation({ x: P.x, y: 0.9, z: P.z }, true); v.pv.body.setLinvel({ x: v.vx, y: 0, z: v.vz }, true);
    this.cars.push(v); return v;
  }
  // the next waypoints: STEP m along the line; where a crossing line lies in that step, straight on or a turn into it; U-turn at a line's end
  plan(C, v) {
    const ai = v.ai; let s = v.cl; if (!s) return;
    const L = this.linesOf(C);
    while (ai.wp.length < 4) {
      const nt = s.t + s.dir * STEP;
      if (nt > s.ln.b - 8 || nt < s.ln.a + 8) { s.dir = -s.dir; const P = this.lanePoint(C, s.vert, s.ln, s.t, s.dir); ai.wp.push({ x: P.x, z: P.z, speed: 0.5 }); continue; }
      const cross = (s.vert ? L.h : L.v).find((q) => (q.c - s.t) * s.dir > 1 && (q.c - nt) * s.dir <= 0 && s.ln.c > q.a + 14 && s.ln.c < q.b - 14);
      if (cross && Math.random() < 0.4) {
        const nd = Math.random() < 0.5 ? 1 : -1; s = v.cl = { vert: !s.vert, ln: cross, t: s.ln.c, dir: nd };
        const P = this.lanePoint(C, s.vert, s.ln, s.t + nd * 7, nd); ai.wp.push({ x: P.x, z: P.z, speed: 0.55 }); s.t += nd * 7; continue;
      }
      s.t = nt; const P = this.lanePoint(C, s.vert, s.ln, nt, s.dir); ai.wp.push({ x: P.x, z: P.z, speed: 1 });
    }
  }

  release() {
    const G = this.G;
    for (const h of this.walkers) h.remove = true;   // the game's own clean-up takes them out of the world
    this.walkers = [];
    for (const v of this.cars) if (G.vehicles.includes(v)) G.removeVehicle(v);
    this.cars = [];
  }
}
