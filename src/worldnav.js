import { net } from './roadnet.js';
import { cities } from './worldmap.js';

const LANE_W = 3.75;   // highway lane width (hwtraffic.js LANE)

// Route planning over the highway network and an autopilot for the player's car (ADR-0012 phase 5).
// The graph is the road samples (30 m apart) of every highway, ring and connector: consecutive samples are joined, and samples of different roads
// that lie within LINK m of each other are joined too (an interchange). A route is: street leg out of the start, A* over the graph, street leg into
// the destination. Street legs inside a city follow its street lines (Manhattan), elsewhere they are straight. Pure (no three.js).
const LINK = 90;

export class RoadGraph {
  constructor() {
    const N = net(), roads = N.roads.filter((r) => r.kind !== 'ramp');
    this.roads = roads; this.off = []; let n = 0;
    for (const r of roads) { this.off.push(n); n += r.pts.length; }
    this.n = n; this.x = new Float32Array(n); this.z = new Float32Array(n); this.rd = new Int32Array(n); this.ix = new Int32Array(n);
    roads.forEach((r, k) => r.pts.forEach((p, i) => { const id = this.off[k] + i; this.x[id] = p[0]; this.z[id] = p[1]; this.rd[id] = k; this.ix[id] = i; }));
    this.adj = Array.from({ length: n }, () => []);
    roads.forEach((r, k) => {
      const m = r.pts.length;
      for (let i = 0; i < m - 1 + (r.closed ? 1 : 0); i++) { const a = this.off[k] + i, b = this.off[k] + (i + 1) % m; this.adj[a].push(b); this.adj[b].push(a); }
    });
    // interchange links: nearest sample of another road within LINK m (grid hash of 120 m)
    const CS = 120, grid = new Map(), key = (x, z) => Math.floor(x / CS) * 100003 + Math.floor(z / CS);
    for (let i = 0; i < n; i++) { const k = key(this.x[i], this.z[i]); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i); }
    this.grid = grid; this.CS = CS;
    for (let i = 0; i < n; i += 2) {
      const cx = Math.floor(this.x[i] / CS), cz = Math.floor(this.z[i] / CS);
      let best = -1, bd = LINK * LINK;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const a = grid.get((cx + dx) * 100003 + cz + dz); if (!a) continue; for (const j of a) { if (this.rd[j] === this.rd[i]) continue; const d = (this.x[i] - this.x[j]) ** 2 + (this.z[i] - this.z[j]) ** 2; if (d < bd) { bd = d; best = j; } } }
      if (best >= 0) { this.adj[i].push(best); this.adj[best].push(i); }
    }
  }
  nearest(x, z, max = 8000) {
    const CS = this.CS, R = Math.ceil(max / CS); let best = -1, bd = max * max; const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    for (let r = 0; r <= R && best < 0; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const a = this.grid.get((cx + dx) * 100003 + cz + dz); if (!a) continue;
        for (const j of a) { const d = (this.x[j] - x) ** 2 + (this.z[j] - z) ** 2; if (d < bd) { bd = d; best = j; } }
      }
    }
    return best;
  }
  // A* from node s to node t; returns the node list or null
  path(s, t) {
    const n = this.n, g = new Float32Array(n).fill(1e18), from = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    const heap = [[0, s]]; g[s] = 0;
    const push = (it) => { heap.push(it); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    while (heap.length) {
      const [, u] = pop(); if (done[u]) continue; done[u] = 1;
      if (u === t) { const out = []; for (let c = u; c >= 0; c = from[c]) out.push(c); return out.reverse(); }
      for (const v of this.adj[u]) {
        const d = Math.hypot(this.x[u] - this.x[v], this.z[u] - this.z[v]), ng = g[u] + d * (this.rd[u] === this.rd[v] ? 1 : 1.4);
        if (ng < g[v]) { g[v] = ng; from[v] = u; push([ng + Math.hypot(this.x[v] - this.x[t], this.z[v] - this.z[t]), v]); }
      }
    }
    return null;
  }
}

let GRAPH = null;
export const graph = () => GRAPH || (GRAPH = new RoadGraph());

// the city whose disc contains (x, z) (margin m beyond it), or null
export function cityAt(x, z, margin = 0) { for (const c of cities()) if (Math.hypot(x - c.x, z - c.z) < c.r + margin) return c; return null; }

// street lines of a city (relative to its centre), from the layout: the capital's grid is added by the caller (it has its own road grid)
function manhattan(lines, c, x0, z0, x1, z1) {
  // from (x0, z0) to (x1, z1) through the city's street lines: onto the nearest line, along it, over a crossing line, to the target
  if (!lines || !lines.v.length) return [[x1, z1]];
  const lx0 = x0 - c.x, lz0 = z0 - c.z, lx1 = x1 - c.x, lz1 = z1 - c.z, near = (set, v) => set.reduce((b, l) => (Math.abs(l.c - v) < Math.abs(b.c - v) ? l : b), set[0]);
  const vA = near(lines.v, lx0), hB = near(lines.h, lz1), out = [];
  out.push([c.x + vA.c, z0]);                 // onto a vertical street
  out.push([c.x + vA.c, c.z + hB.c]);         // along it to the horizontal street next to the target
  const vB = near(lines.v, lx1);
  out.push([c.x + vB.c, c.z + hB.c]);         // along that to the vertical street next to the target
  out.push([c.x + vB.c, z1]); out.push([x1, z1]);
  void lz0; void lx1;
  return out;
}

export class Router {
  constructor(lineOf) { this.G = graph(); this.lineOf = lineOf; }
  // → { pts: [[x, z, speedClass]], length } ; speedClass 0 = street, 1 = highway
  route(x0, z0, x1, z1) {
    const G = this.G, a = G.nearest(x0, z0), b = G.nearest(x1, z1);
    if (a < 0 || b < 0) return { pts: [[x0, z0, 0], [x1, z1, 0]], length: Math.hypot(x1 - x0, z1 - z0), straight: true };
    const nodes = a === b ? [a] : G.path(a, b);
    if (!nodes) return { pts: [[x0, z0, 0], [x1, z1, 0]], length: Math.hypot(x1 - x0, z1 - z0), straight: true };
    const pts = [];
    const leg = (xa, za, xb, zb) => {
      const c = cityAt(xa, za, 0) || cityAt(xb, zb, 0), L = c && this.lineOf(c);
      const seq = c && L ? manhattan(L, c, xa, za, xb, zb) : [[xb, zb]]; let px = xa, pz = za;
      pts.push([xa, za, 0]); for (const q of seq) { pts.push([q[0], q[1], 0]); px = q[0]; pz = q[1]; } void px; void pz;
    };
    leg(x0, z0, G.x[nodes[0]], G.z[nodes[0]]);
    // the right-hand lane of the direction of travel (the median sits on the road's centre line): 7.2 m = the middle of the second lane
    for (let k = 0; k < nodes.length; k++) {
      const id = nodes[k], p0 = nodes[Math.max(0, k - 2)], p1 = nodes[Math.min(nodes.length - 1, k + 2)];
      let tx = G.x[p1] - G.x[p0], tz = G.z[p1] - G.z[p0]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      pts.push([G.x[id] - tz * 7.2, G.z[id] + tx * 7.2, 1]);
    }
    const last = nodes[nodes.length - 1]; pts.push([x1, z1, 0]);
    // the way in: street leg from the graph end to the destination (reversed use of the same helper)
    const tail = []; const c2 = cityAt(x1, z1, 400), L2 = c2 && this.lineOf(c2);
    if (c2 && L2) { const m = manhattan(L2, c2, G.x[last], G.z[last], x1, z1); pts.pop(); for (const q of m) pts.push([q[0], q[1], 0]); }
    void tail;
    // resample to ~25 m and measure
    const out = []; let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1], d = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.ceil(d / 25));
      for (let k = 0; k < n; k++) out.push([A[0] + (B[0] - A[0]) * k / n, A[1] + (B[1] - A[1]) * k / n, A[2]]);
      len += d;
    }
    out.push(pts[pts.length - 1]);
    return { pts: out, length: len, straight: false };
  }
}

// ----------------------------------------------------------------------------------------------------------------- autopilot
// Drives the player's ground vehicle along a route: pure pursuit on the polyline, speed by road class, braking for what is in the way and for
// corners. Any steering/brake input from the player hands the car back.
export class AutoNav {
  constructor(G) { this.G = G; this.route = null; this.i = 0; this.active = false; this.goal = null; this.cancelT = 0; this.router = new Router((c) => { if (c.id === 'neon') return G.capitalLines(); const C = G.citysites?.cities.find((q) => q.c.id === c.id); return C && G.citylife.linesOf(C); }); }
  start(x, z) {
    const G = this.G, v = G.vehicle; if (!v || v.spec.craft) { G.toast('자동 주행 불가', '자동차에 타고 있어야 한다'); return false; }
    const f = G.focusPos(); this.route = this.router.route(f.x, f.z, x, z); this.goal = { x, z }; this.i = this.closest(f.x, f.z); this.active = true; this.cancelT = 0.6; this.lat = this.latT = this.laneT = this.backT = this.wedged = 0;
    G.toast('자동 주행 시작', `${Math.round(this.route.length / 1000 * 10) / 10} km${this.route.straight ? ' · 도로 없음(직선)' : ''}`); return true;
  }
  stop(msg) { if (this.active && msg) this.G.toast(msg); this.active = false; this.route = null; const v = this.G.vehicle; if (v) { v.throttle = 0; v.steer = 0; } }
  closest(x, z) { const P = this.route.pts; let bi = 0, bd = 1e18; for (let i = 0; i < P.length; i++) { const d = (P[i][0] - x) ** 2 + (P[i][1] - z) ** 2; if (d < bd) { bd = d; bi = i; } } return bi; }
  // Highway overtaking: a slower car ahead moves the steering point one lane over (the median side first, else the outer lane) when that
  // lane is clear; once the road ahead is free again the car goes back to the route's middle lane. Off the highway, and before an exit,
  // the offset returns to zero.
  lanes(v, P, cls, blocked, lookO, dt) {
    this.laneT = Math.max(0, (this.laneT || 0) - dt);
    const exitAhead = !P[Math.min(P.length - 1, this.i + 10)][2];
    let want = this.latT || 0;
    if (!cls || exitAhead) want = 0;
    else if (this.laneT <= 0) {
      const opts = blocked ? [want + LANE_W, want - LANE_W].filter((q) => Math.abs(q) <= LANE_W + 0.01) : want ? [0] : [];
      for (const q of opts) if (this.laneClear(v, q - (this.lat || 0), lookO)) { want = q; this.laneT = 3; break; }
    }
    this.latT = want;
    const d = want - (this.lat || 0); this.lat = (this.lat || 0) + Math.sign(d) * Math.min(Math.abs(d), 2.5 * dt);
  }
  // the car's sideways distance from the route line (positive = toward the median)
  carLat(v, P) {
    const a = P[Math.max(0, this.i - 1)], b = P[Math.min(P.length - 1, Math.max(this.i, 1))], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return ((v.x - a[0]) * (b[1] - a[1]) - (v.z - a[1]) * (b[0] - a[0])) / l;
  }
  // no vehicle beside or ahead in the lane `side` metres to the left (negative: right) of the car
  laneClear(v, side, lookO) {
    const sH = Math.sin(v.h), cH = Math.cos(v.h);
    for (const o of this.G.vehicles) {
      if (o === v || !o.group.visible) continue; const dx = o.x - v.x, dz = o.z - v.z, along = dx * sH + dz * cH;
      if (along < -v.L - 6 || along > lookO + 12) continue; if (Math.abs(dx * cH - dz * sH - side) < (v.W + o.W) * 0.5 + 0.8) return false;
    }
    return true;
  }
  // called each frame with the vehicle the player drives and the raw input
  control(v, inp, dt) {
    if (!this.active || !this.route) return;
    const G = this.G; this.cancelT -= dt;
    if (this.cancelT <= 0 && (inp.brake > 0.3 || Math.abs(inp.steer) > 0.6 || inp.hand)) { this.stop('자동 주행 해제'); return; }
    const P = this.route.pts, sH = Math.sin(v.h), cH = Math.cos(v.h);
    while (this.i < P.length - 1 && Math.hypot(P[this.i][0] - v.x, P[this.i][1] - v.z) < 14) this.i++;
    const goalD = Math.hypot(this.goal.x - v.x, this.goal.z - v.z);
    if (goalD < 16 && this.i >= P.length - 2) { this.stop('목적지 도착'); v.brake = 1; return; }
    const spd = v.speed, look = 12 + spd * 0.9;
    let j = this.i; while (j < P.length - 1 && Math.hypot(P[j][0] - v.x, P[j][1] - v.z) < look) j++;
    // the steering point sits on the route, moved sideways by the lane offset (positive = toward the median) while overtaking
    const pj = P[Math.max(0, j - 1)], fl = Math.hypot(P[j][0] - pj[0], P[j][1] - pj[1]) || 1, lat = this.lat || 0;
    const tx = P[j][0] + ((P[j][1] - pj[1]) / fl) * lat, tz = P[j][1] - ((P[j][0] - pj[0]) / fl) * lat, want = Math.atan2(tx - v.x, tz - v.z), dh = Math.atan2(Math.sin(want - v.h), Math.cos(want - v.h));
    v.steer = Math.max(-1, Math.min(1, -dh * 2.4 * (spd > 25 ? 0.6 : 1)));
    // speed: by road class, less for a sharp turn ahead
    let cls = P[Math.min(P.length - 1, this.i + 2)][2], target = cls ? 36 : 13;
    let turn = 0; for (let k = this.i; k < Math.min(P.length - 2, this.i + 8); k++) { const a1 = Math.atan2(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]), a2 = Math.atan2(P[k + 2][0] - P[k + 1][0], P[k + 2][1] - P[k + 1][1]); turn = Math.max(turn, Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)))); }
    if (turn > 0.5) target = Math.min(target, 11); else if (turn > 0.25) target = Math.min(target, cls ? 28 : 11);
    if (Math.abs(dh) > 0.5) target = Math.min(target, 8);
    // obstacles: other vehicles and people ahead in the lane
    const lookO = 12 + Math.max(spd, 0) * 1.3;
    // while moving over, a car counts as in the way if it is in the lane being entered, or so close in the current lane that the move cannot clear it
    const free = target, shift = (this.latT || 0) - this.carLat(v, P);
    for (const o of G.vehicles) {
      if (o === v || !o.group.visible) continue; const dx = o.x - v.x, dz = o.z - v.z, along = dx * sH + dz * cH;
      if (along < 1 || along > lookO + o.L * 0.5) continue;
      const side = dx * cH - dz * sH, w = (v.W + o.W) * 0.5 + 0.6, gap = along - o.L * 0.5 - v.L * 0.5;
      if (Math.abs(side - shift) < w || (Math.abs(side) < w && gap < 4 + spd * 0.35)) target = Math.min(target, Math.max(0, (gap - 3) * 0.9, o.speed * 0.8));
    }
    this.lanes(v, P, cls, target < free - 4, lookO, dt);
    for (const h of G.humans) {
      if (h.dead || h.hidden) continue; const dx = h.x - v.x, dz = h.z - v.z, along = dx * sH + dz * cH;
      if (along < 0.5 || along > lookO * 0.8) continue; if (Math.abs(dx * cH - dz * sH) < v.W * 0.5 + 1.2) target = Math.min(target, Math.max(0, (along - 4) * 0.8));
    }
    const err = target - spd;
    v.throttle = err > 0 ? Math.min(1, err * 0.35) : 0; v.brake = err < -2 ? Math.min(1, -err * 0.12) : 0; v.hand = false;
    // wedged behind a stopped car: back off for a moment (brake at a standstill reverses) with the wheels turned the other way
    if (spd < 1 && target < 1 && free > 3) { this.wedged = (this.wedged || 0) + dt; if (this.wedged > 3) { this.wedged = 0; this.backT = 1.6; } } else this.wedged = 0;
    if (this.backT > 0) { this.backT -= dt; v.throttle = 0; v.brake = 1; v.steer = -v.steer; return; }
    if (spd < 1.5 && target > 3) { this.stuck = (this.stuck || 0) + dt; if (this.stuck > 6) { this.stuck = 0; this.i = Math.min(P.length - 1, this.i + 3); } } else this.stuck = 0;
  }
}
