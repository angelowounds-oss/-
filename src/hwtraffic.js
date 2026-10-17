import { net, HALF_W, BROKEN } from './roadnet.js';
import { Vehicle, CAR_COLORS } from './vehicle.js';
import { Human } from './human.js';
import { clamp, rand } from './util.js';

// Life on the highways: AI traffic that follows the lanes (a pool around the player, recycled when it falls behind), attendants at toll plazas and
// service areas, and road-side events (an accident, road works, a police checkpoint) at fixed places along the roads (a hash of road and
// position, so they are the same every time). Everything exists only within ~1.5 km of the player.
const LANE = 3.75, MED = 3.2, CAP = 16, NEAR = 1500, FAR = 2100;
const hash = (a, b) => { let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13; return ((h >>> 0) % 100000) / 100000; };
const KINDS = ['sedan', 'sedan', 'sedan', 'suv', 'sport', 'truck', 'truck', 'suv'];

export class HighwayTraffic {
  constructor(G) { this.G = G; this.N = net(); this.cars = []; this.events = new Map(); this.npcs = new Map(); this.t = 0; this.roadIdx = new Map(this.N.roads.map((r) => [r.id, r])); }

  // a point on a lane of road r at sample i: dir +1 = travelling toward increasing i. Right-hand traffic: the right of travel is -(rx, rz)
  lane(r, i, dir, laneNo) {
    const n = r.pts.length, a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(n - 1, i + 1)], p = r.pts[i];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const off = -dir * (MED / 2 + LANE * (laneNo + 0.5)), rx = tz, rz = -tx;
    return { x: p[0] + rx * off, z: p[1] + rz * off, y: r.y[i], h: Math.atan2(tx * dir, tz * dir) };
  }
  nearestSample(x, z, max = 2500) {
    const N = this.N, CS = N.CS, c0 = Math.floor((x - max) / CS), c1 = Math.floor((x + max) / CS), d0 = Math.floor((z - max) / CS), d1 = Math.floor((z + max) / CS);
    let best = null, bd = max * max;
    for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) { const cell = N.grid.get(cx * 100003 + cz); if (!cell) continue; for (let q = 0; q < cell.length; q += 2) { const r = N.roads[cell[q]]; if (r.kind === 'ramp') continue; const i = cell[q + 1], p = r.pts[i], d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; best = { r, i, d: Math.sqrt(d) }; } } }
    return best;
  }

  spawnCar(r, i, dir, lane) {
    const G = this.G, P = this.lane(r, i, dir, lane), type = KINDS[Math.floor(Math.random() * KINDS.length)];
    const v = new Vehicle(G, type, CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], 'traffic');
    v.kind = 'traffic'; v.driver = 'ai'; v.hw = { r, i, dir, lane }; v.ai.speed = rand(27, 40) * (type === 'truck' ? 0.72 : 1) * (lane === 0 ? 1.15 : lane === 2 ? 0.88 : 1);
    v.x = P.x; v.z = P.z; v.h = P.h; v.vx = Math.sin(P.h) * 20; v.vz = Math.cos(P.h) * 20; v.startY = undefined;
    v.planAhead = () => this.plan(v);
    G.addVehicle(v); v.pv.body.setTranslation({ x: P.x, y: P.y + 1.2, z: P.z }, true); v.pv.body.setLinvel({ x: v.vx, y: 0, z: v.vz }, true);
    this.cars.push(v); return v;
  }
  // waypoints for Vehicle.driveAI: the next few lane points ahead (a loop road wraps around; an open road ends: the car is recycled there)
  plan(v) {
    const h = v.hw, r = h.r, n = r.pts.length, ai = v.ai;
    while (ai.wp.length < 5) {
      let i = h.i + h.dir; if (r.closed) i = (i + n) % n; else if (i < 1 || i > n - 2) { v.hwDone = true; return; }
      if (BROKEN.has(r.id + ':' + Math.min(i, h.i))) { v.hwDone = true; return; }   // a blown-up bridge: no cars across
      h.i = i; const P = this.lane(r, i, h.dir, h.lane); ai.wp.push({ x: P.x, z: P.z, speed: 1 });
    }
  }

  update(dt) {
    const G = this.G, pl = G.vehicle || G.player; this.t -= dt; if (this.t > 0) return; this.t = 0.5;
    const near = this.nearestSample(pl.x, pl.z, NEAR);
    // recycle: far from the player, or at the end of the road, or wrecked
    for (let k = this.cars.length - 1; k >= 0; k--) {
      const v = this.cars[k]; const d = Math.hypot(v.x - pl.x, v.z - pl.z);
      if (!G.vehicles.includes(v)) { this.cars.splice(k, 1); continue; }
      if (v === G.vehicle) { v.hw = null; this.cars.splice(k, 1); continue; }
      if (d > FAR || v.hwDone || (v.dead && v.age > 30)) { G.removeVehicle(v); this.cars.splice(k, 1); }
    }
    if (near && this.cars.length < CAP && (pl.y || 0) < 120) {
      // a few cars ahead of and behind the player on the nearest road, in both directions
      for (let tries = 0; tries < 3 && this.cars.length < CAP; tries++) {
        const r = near.r, dir = Math.random() < 0.5 ? 1 : -1, lane = Math.floor(Math.random() * 3), back = rand(-1, 1) * 24, i = clamp(near.i + Math.round(back * (Math.random() < 0.5 ? 1 : -1) * 3 + (Math.random() < 0.5 ? 1 : -1) * 12), 3, r.pts.length - 4);
        const P = this.lane(r, i, dir, lane), dd = Math.hypot(P.x - pl.x, P.z - pl.z);
        if (dd < 140 || dd > NEAR) continue;
        if (this.cars.some((o) => Math.hypot(o.x - P.x, o.z - P.z) < 30)) continue;
        this.spawnCar(r, i, dir, lane);
      }
    }
    this.sync(pl);
  }

  // events and attendants appear when the player comes within 900 m of their place and go when he is 1.6 km away
  sync(pl) {
    const G = this.G, N = this.N;
    // road events: one candidate per 2.4 km of road
    if (this.nearestSample(pl.x, pl.z, 1100)) for (const r of N.roads) {
      if (r.kind === 'ramp') continue;
      for (let i = 40; i < r.pts.length - 40; i += 80) {
        const p = r.pts[i]; if (Math.abs(p[0] - pl.x) > 900 || Math.abs(p[1] - pl.z) > 900) continue;
        const key = r.id + ':' + i, hv = hash(r.id.length * 977 + i, r.id.charCodeAt(r.id.length - 1) * 31 + i);
        if (hv > 0.5 || this.events.has(key) || r.cls[i] !== 0 || Math.hypot(p[0] - pl.x, p[1] - pl.z) > 800) continue;
        this.events.set(key, this.makeEvent(r, i, hv < 0.2 ? 'accident' : hv < 0.35 ? 'roadwork' : 'checkpoint'));
      }
    }
    for (const [k, e] of this.events) {
      const d = Math.hypot(e.x - pl.x, e.z - pl.z);
      if (d > 1600) { for (const v of e.vehicles) if (G.vehicles.includes(v)) G.removeVehicle(v); for (const h of e.humans) { h.remove = true; } for (const m of e.meshes) m.parent?.remove(m); this.events.delete(k); }
    }
    // attendants
    const want = [];
    for (const t of N.tolls) { const r = this.roadIdx.get(t.road), p = r.pts[Math.max(0, Math.min(r.pts.length - 1, t.idx))]; if (Math.hypot(p[0] - pl.x, p[1] - pl.z) < 400) want.push({ key: 'toll:' + t.road + ':' + t.idx, x: p[0] + 5.6, z: p[1], y: r.y[t.idx], look: { top: 0x2b4d7a, pants: 0x1c2a40, cap: 0x2b4d7a, trim: [0.9, 0.9, 0.9], hair: 0x111111 } }); }
    for (const s of N.services) if (Math.hypot(s.x - pl.x, s.z - pl.z) < 400) { const tx = Math.sin(s.heading), tz = Math.cos(s.heading); for (const o of [-1, 1]) want.push({ key: 'svc:' + s.road + ':' + s.idx + ':' + o, x: s.x + tz * (s.side * 16) + tx * (22 + o * 6) , z: s.z - tx * (s.side * 16) + tz * (22 + o * 6), y: s.y + 0.3, look: { top: 0xd24b2a, pants: 0x222222, cap: 0xd24b2a, trim: [1, 0.8, 0.3], hair: 0x111111 } }); }
    // travellers walking about the service areas (they stretch their legs between the pumps and the cars)
    for (const s of N.services) if (Math.hypot(s.x - pl.x, s.z - pl.z) < 400) for (let k = 0; k < 3; k++) { const key = 'trav:' + s.road + ':' + s.idx + ':' + k; if (!this.npcs.has(key) || this.npcs.get(key).remove) want.push({ key, x: s.x + (k - 1) * 9, z: s.z + 12, y: s.y + 0.3, walker: true, look: { top: [0x4a6a9a, 0x9a4a4a, 0x4a9a6a][k], pants: 0x23262e, cap: null, trim: null, hair: 0x222222 } }); }
    for (const w of want) { const have = this.npcs.get(w.key); if (have && !have.remove && G.humans.includes(have)) continue; const h = new Human(G, 'civ', { hp: 40, weapon: undefined, look: w.look }); h.x = w.x; h.z = w.z; h.y = w.y; h.floorY = w.y; h.static = !w.walker; h.lookAtPlayer = !w.walker; h.state = w.walker ? 'walk' : 'stand'; h.home = { x: w.x, z: w.z }; h.hwNpc = w.key; h.cash = 60; h.noVisit = true;
      if (w.walker) h.steerFn = (hh, dt) => { hh.wt = (hh.wt || 0) - dt; if (hh.wt <= 0 || !hh.wp) { hh.wt = 3 + Math.random() * 5; hh.wp = { x: hh.home.x + (Math.random() - 0.5) * 24, z: hh.home.z + (Math.random() - 0.5) * 14 }; } const dx = hh.wp.x - hh.x, dz = hh.wp.z - hh.z, d = Math.hypot(dx, dz); return d < 1 ? { x: 0, z: 0, s: 0, face: null } : { x: dx / d, z: dz / d, s: 1.2, face: null }; }; G.humans.push(h); G.scene.add(h.group); this.npcs.set(w.key, h); }
    for (const [k, h] of this.npcs) if (h.dead || h.remove || !G.humans.includes(h)) this.npcs.delete(k);
  }

  makeEvent(r, i, type) {
    const G = this.G, f = this.lane(r, i, 1, 0), tx = Math.sin(f.h), tz = Math.cos(f.h), e = { type, x: f.x, z: f.z, vehicles: [], humans: [], meshes: [] };
    const addCar = (kind, off, along, ry, dead) => { const v = new Vehicle(G, kind, CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], dead ? 'parked' : 'police', dead ? {} : { glow: [0.2, 0.4, 1] }); const x = f.x + tz * off + tx * along, z = f.z - tx * off + tz * along; v.x = x; v.z = z; v.h = f.h + ry; v.startY = undefined; v.awake = false; if (!dead) { v.police = true; v.siren = true; } G.addVehicle(v); v.pv.body.setTranslation({ x, y: f.y + 1.2, z }, true); v.pv.body.setRotation({ x: 0, y: Math.sin(v.h / 2), z: 0, w: Math.cos(v.h / 2) }, true); v.pv.body.sleep(); if (dead) { v.hp = 0; v.destroy(null); v.exploded = true; v.burn = 1; v.explodeT = 0; } e.vehicles.push(v); return v; };
    const addCop = (off, along) => { const h = new Human(G, 'cop', { hp: 70, weapon: 1, look: { top: 0x101a38, pants: 0x0b1020, cap: 0x0b1020, trim: [0.3, 0.4, 1], hair: 0x111111 } }); h.x = f.x + tz * off + tx * along; h.z = f.z - tx * off + tz * along; h.y = f.y; h.floorY = f.y; h.static = true; h.lookAtPlayer = true; h.state = 'stand'; h.home = { x: h.x, z: h.z }; G.humans.push(h); G.scene.add(h.group); e.humans.push(h); };
    if (type === 'accident') { addCar('sedan', 0, 0, 0.6, true); addCar('suv', 3.4, 7, -0.4, true); addCar('sedan', -HALF_W + 3, -14, 0, false); addCop(-HALF_W + 5.5, -12); addCop(-HALF_W + 6.5, -16); }
    else if (type === 'checkpoint') { addCar('sedan', -HALF_W + 4, 0, 0, false); addCar('sedan', -HALF_W + 4, 14, 0, false); addCop(-6.2, 6); addCop(-6.2, 8); addCop(-HALF_W + 7, 6); }
    else addCar('truck', -HALF_W + 3.4, 0, 0.1, true);
    return e;
  }
}
