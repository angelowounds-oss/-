import { stopSpeed } from './util.js';
import { carriage } from './carriage.js';
import { net } from './roadnet.js';
import { cities } from './worldmap.js';

const LANE_W = 3.75;   // highway lane width (hwtraffic.js LANE)

// Route planning over the highway network and an autopilot for the player's car (ADR-0012 phase 5).
// The graph is the road samples (30 m apart) of every highway, ring and connector: consecutive samples are joined, and samples of different roads
// that lie within LINK m of each other are joined too (an interchange). A route is: street leg out of the start, A* over the graph, street leg into
// the destination. Street legs inside a city follow its street lines (Manhattan), elsewhere they are straight. Pure (no three.js).
const LINK = 90;
const NB = new Int32Array(4096);   // the neighbours of the sample A* expands (reused)

export class RoadGraph {
  // The graph is kept small (AAA-1 heap): a sample's links to the samples before and after it on its road are implied by the road (not stored),
  // only the other links (compiled joins, interchanges, region seams) are stored, for the few samples that have them; the 120 m grid is a CSR over
  // an open-addressed cell table; the connected part is per road (a road's samples are always joined). 243 MB on the capital build before.
  constructor() {
    const N = net(), roads = N.roads.filter((r) => r.kind !== 'ramp' && !r.alley);   // an alley (build/world/fit.mjs) is paved for walkers only
    const nr = roads.length; this.roads = roads; this.off = new Int32Array(nr + 1); let n = 0;
    for (let k = 0; k < nr; k++) { this.off[k] = n; n += roads[k].x.length; } this.off[nr] = n;
    this.n = n; this.x = new Float32Array(n); this.z = new Float32Array(n); this.rd = new Int32Array(n);
    // per road: 1 one-way (links only forward), 2 closed (the last sample links to the first)
    this.rf = Uint8Array.from(roads, (r) => (r.kind === 'arterial' && r.oneway ? 1 : 0) | (r.closed ? 2 : 0));
    roads.forEach((r, k) => { const o = this.off[k]; for (let i = 0; i < r.x.length; i++) { this.x[o + i] = r.x[i]; this.z[o + i] = r.z[i]; this.rd[o + i] = k; } });
    // the stored links as (from, to) pairs, packed into a sparse CSR below
    let E = new Int32Array(1 << 16), ne = 0; const link = (a, b) => { if (ne * 2 === E.length) { const F = new Int32Array(E.length * 2); F.set(E); E = F; } E[ne * 2] = a; E[ne * 2 + 1] = b; ne++; };
    // compiled lines meet where the compiler joined them (a line's end to the point of the next line, a line's start from the point before it), and a
    // highway that stops at the region meets the line it was joined to
    const idx = new Map(roads.map((r, k) => [r.id, k])), node = (id, i) => (idx.has(id) ? this.off[idx.get(id)] + Math.min(i, roads[idx.get(id)].x.length - 1) : -1);
    roads.forEach((r, k) => {
      const end = this.off[k] + r.x.length - 1, start = this.off[k];
      for (const t of r.next || []) { const b = node(t.road, t.i); if (b >= 0) { link(end, b); if (!r.oneway) link(b, end); } }
      for (const t of r.prev || []) { const b = node(t.road, t.i); if (b >= 0) { link(b, start); if (!r.oneway) link(start, b); } }
      for (const [j, at] of [[r.joinA, start], [r.joinB, end]]) if (j) { const b = node(j.road, j.i); if (b >= 0) { link(at, b); link(b, at); } }
    });
    this.art = Uint8Array.from(roads, (r) => (r.kind === 'arterial' ? 1 : 0));
    // interchange links: nearest sample of another road within LINK m (grid of 120 m)
    const CS = 120; this.CS = CS; this.buildGrid(); const cell = (cx, cz) => this.cell(cx, cz), gi = this.gi;
    for (let i = 0; i < n; i += 2) {
      if (this.art[this.rd[i]]) continue;   // compiled lines have their own junctions
      const cx = Math.floor(this.x[i] / CS), cz = Math.floor(this.z[i] / CS);
      let best = -1, bd = LINK * LINK;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const c = cell(cx + dx, cz + dz); if (c < 0) continue; for (let q = this.go[c]; q < this.go[c + 1]; q++) { const j = gi[q]; if (this.rd[j] === this.rd[i] || this.art[this.rd[j]]) continue; const d = (this.x[i] - this.x[j]) ** 2 + (this.z[i] - this.z[j]) ** 2; if (d < bd) { bd = d; best = j; } } }
      if (best >= 0) { link(i, best); link(best, i); }
    }
    // region seams (ADR-0044): each region's compiler joined only its own lines, so a line that ends where the next region begins is joined to nothing
    // and the regions were separate graphs (the capital's routes could not reach the highways joined to Gyeonggi). An open line end meets the
    // nearest sample of another region's line within SEAM m; lines of the same region keep the compiler's junctions only.
    const SEAM = 60, regOf = (r) => (r.id.startsWith('osm:') ? '' : r.id.slice(0, r.id.indexOf(':')));
    const reg = roads.map((r) => (r.kind === 'arterial' ? regOf(r) : null));
    roads.forEach((r, k) => {
      if (reg[k] === null) return;
      for (const [open, at, out] of [[!(r.prev && r.prev.length), this.off[k], false], [!(r.next && r.next.length), this.off[k] + r.x.length - 1, true]]) {
        if (!open) continue;
        const cx = Math.floor(this.x[at] / CS), cz = Math.floor(this.z[at] / CS); let best = -1, bd = SEAM * SEAM;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const c = cell(cx + dx, cz + dz); if (c < 0) continue; for (let q = this.go[c]; q < this.go[c + 1]; q++) { const j = gi[q], rj = reg[this.rd[j]]; if (rj === null || rj === reg[k]) continue; const d = (this.x[at] - this.x[j]) ** 2 + (this.z[at] - this.z[j]) ** 2; if (d < bd) { bd = d; best = j; } } }
        if (best < 0) continue;
        if (!r.oneway) { link(at, best); link(best, at); } else if (out) link(at, best); else link(best, at);
      }
    });
    // sparse CSR of the stored links: xu = the samples that have any (ascending), their links xn[xa[q]] .. xn[xa[q + 1] - 1] in the order they were
    // linked (after the implied road links, as when every link was stored: routes are unchanged); has = a bit per sample for a quick no
    const cnt = new Map(); for (let e = 0; e < ne; e++) cnt.set(E[e * 2], (cnt.get(E[e * 2]) || 0) + 1);
    this.xu = Int32Array.from([...cnt.keys()].sort((a, b) => a - b)); this.xa = new Int32Array(this.xu.length + 1); this.has = new Uint8Array((n >> 3) + 1);
    const slot = new Map(); this.xu.forEach((u, q) => { slot.set(u, q); this.xa[q + 1] = this.xa[q] + cnt.get(u); this.has[u >> 3] |= 1 << (u & 7); });
    this.xn = new Int32Array(ne); const fill = this.xa.slice(0, this.xu.length); for (let e = 0; e < ne; e++) this.xn[fill[slot.get(E[e * 2])]++] = E[e * 2 + 1];
    // connected parts (union-find over roads: a road's samples are joined by its own links, so the stored links decide it), direction ignored: the
    // region's OSM extract has pieces joined to nothing, and a route that began on one found no path and was drawn as a straight line across the country
    const par = new Int32Array(nr); for (let k = 0; k < nr; k++) par[k] = k;
    const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let e = 0; e < ne; e++) { const a = find(this.rd[E[e * 2]]), b = find(this.rd[E[e * 2 + 1]]); if (a !== b) par[a] = b; }
    const size = new Float64Array(nr); for (let k = 0; k < nr; k++) { par[k] = find(k); size[par[k]] += this.off[k + 1] - this.off[k]; }
    let main = 0; for (let k = 0; k < nr; k++) if (size[k] > size[main]) main = k;
    this.rcomp = par; this.mainComp = main; this.mainShare = n ? size[main] / n : 0;
  }
  // the 120 m grid: gi holds the samples cell by cell (ascending within a cell), cell c's are gi[go[c]] .. gi[go[c + 1] - 1]; cells are found
  // through an open-addressed table of their keys (gk) to their numbers (gv)
  buildGrid() {
    const n = this.n, CS = this.CS, key = new Float64Array(n);
    for (let i = 0; i < n; i++) key[i] = Math.floor(this.x[i] / CS) * 100003 + Math.floor(this.z[i] / CS);
    let cap = 1 << 16; const cells = new Set(key).size; while (cap < cells * 2) cap <<= 1;
    this.gm = cap - 1; this.gk = new Float64Array(cap).fill(NaN); this.gv = new Int32Array(cap); let nc = 0;
    const cid = new Int32Array(n);
    for (let i = 0; i < n; i++) { const k = key[i]; let h = this.hash(k); while (this.gk[h] === this.gk[h] && this.gk[h] !== k) h = (h + 1) & this.gm; if (this.gk[h] !== k) { this.gk[h] = k; this.gv[h] = nc++; } cid[i] = this.gv[h]; }
    this.go = new Int32Array(nc + 1); for (let i = 0; i < n; i++) this.go[cid[i] + 1]++; for (let c = 0; c < nc; c++) this.go[c + 1] += this.go[c];
    this.gi = new Int32Array(n); const fill = this.go.slice(0, nc); for (let i = 0; i < n; i++) this.gi[fill[cid[i]]++] = i;
  }
  hash(k) { const a = Math.imul(k | 0, 0x9e3779b1) ^ Math.imul((k / 4294967296) | 0, 0x85ebca6b); return (a ^ (a >>> 15)) & this.gm; }
  // the number of grid cell (cx, cz), -1 when it holds no sample
  cell(cx, cz) { const k = cx * 100003 + cz; let h = this.hash(k); for (;;) { const v = this.gk[h]; if (v !== v) return -1; if (v === k) return this.gv[h]; h = (h + 1) & this.gm; } }
  // the index of sample u along its road
  ixOf(u) { return u - this.off[this.rd[u]]; }
  // the connected part of sample u (a road's number: the root of its part)
  compOf(u) { return this.rcomp[this.rd[u]]; }
  // the neighbours of u into out (a reused array), in the order they were linked: the road's own (before, after; the first sample of a closed road
  // after, then before; the last of a closed road wraps to the first), then the stored ones; returns the count
  nbInto(u, out) {
    const k = this.rd[u], o = this.off[k], m = this.off[k + 1] - o, i = u - o, f = this.rf[k], one = f & 1, closed = f & 2; let c = 0;
    if (closed && i === 0) { out[c++] = o + (m > 1 ? 1 : 0); if (!one) out[c++] = o + m - 1; }
    else { if (i > 0 && !one) out[c++] = u - 1; if (i < m - 1) out[c++] = u + 1; if (closed && i === m - 1) out[c++] = o; }
    if (this.has[u >> 3] & (1 << (u & 7))) { let lo = 0, hi = this.xu.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (this.xu[mid] < u) lo = mid + 1; else hi = mid; } for (let q = this.xa[lo]; q < this.xa[lo + 1]; q++) out[c++] = this.xn[q]; }
    return c;
  }
  // the neighbours of u as a new array (tests, tools)
  nbOf(u) { const a = new Int32Array(64), c = this.nbInto(u, a); return Array.from(a.subarray(0, c)); }
  // the nearest sample to (x, z) within max m; with comp, only one in that connected part
  nearest(x, z, max = 8000, comp = -1) {
    const CS = this.CS, R = Math.ceil(max / CS); let best = -1, bd = max * max; const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    for (let r = 0; r <= R && best < 0; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const c = this.cell(cx + dx, cz + dz); if (c < 0) continue;
        for (let q = this.go[c]; q < this.go[c + 1]; q++) { const j = this.gi[q]; if (comp >= 0 && this.compOf(j) !== comp) continue; const d = (this.x[j] - x) ** 2 + (this.z[j] - z) ** 2; if (d < bd) { bd = d; best = j; } }
      }
    }
    return best;
  }
  // A* from node s to node t; returns the node list or null
  // A* from node s to node t; returns the node list or null. The arrays live across calls (a stamp per search marks what this one touched) and the
  // open list is a typed heap: on the 1:1 graph (3.7 M samples) the fresh arrays and a heap of [f, v] pairs took 2.4 s for a cross-country route,
  // a hitch on every waypoint. The heuristic is weighted (1.5): a route at most half again as long as the best (in the tests no longer at all), found from far fewer samples
  path(s, t) {
    const n = this.n; if (!this._g) { this._g = new Float32Array(n); this._from = new Int32Array(n); this._stamp = new Uint32Array(n); this._run = 0; this._hk = new Float64Array(1 << 16); this._hv = new Int32Array(1 << 16); }
    if (this._run > 2e9) { this._stamp.fill(0); this._run = 0; }   // the stamps would wrap
    // stamp 2 run: reached by this search, 2 run + 1: settled by it
    const g = this._g, from = this._from, stamp = this._stamp, run = (this._run += 2), done = run + 1, X = this.x, Z = this.z, tx = X[t], tz = Z[t], W = 1.5;
    let hk = this._hk, hv = this._hv, hn = 0;
    const push = (f, v) => {
      if (hn === hk.length) { const k2 = new Float64Array(hn * 2), v2 = new Int32Array(hn * 2); k2.set(hk); v2.set(hv); this._hk = hk = k2; this._hv = hv = v2; }
      let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (hk[p] <= f) break; hk[k] = hk[p]; hv[k] = hv[p]; k = p; } hk[k] = f; hv[k] = v;
    };
    const pop = () => {
      const top = hv[0], f = hk[--hn], v = hv[hn]; let k = 0;
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = l; if (l >= hn) break; if (r < hn && hk[r] < hk[l]) m = r; if (hk[m] >= f) break; hk[k] = hk[m]; hv[k] = hv[m]; k = m; }
      if (hn) { hk[k] = f; hv[k] = v; } return top;
    };
    stamp[s] = run; g[s] = 0; from[s] = -1; push(0, s);
    while (hn) {
      const u = pop(); if (stamp[u] === done) continue; stamp[u] = done;
      if (u === t) { const out = []; for (let c = u; c >= 0; c = from[c]) out.push(c); return out.reverse(); }
      const gu = g[u], xu = X[u], zu = Z[u], ru = this.rd[u], nn = this.nbInto(u, NB);
      for (let q = 0; q < nn; q++) {
        const v = NB[q]; if (stamp[v] === done) continue;
        const ng = gu + Math.hypot(xu - X[v], zu - Z[v]) * (ru === this.rd[v] ? 1 : 1.4);
        if (stamp[v] !== run || ng < g[v]) { stamp[v] = run; g[v] = ng; from[v] = u; push(ng + W * Math.hypot(X[v] - tx, Z[v] - tz), v); }
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
    const G = this.G; let a = G.nearest(x0, z0), b = G.nearest(x1, z1);
    // ends on two unjoined pieces (a stub of the OSM extract): both ends go onto the main network instead, the street legs bridge the gap
    if (a >= 0 && b >= 0 && G.compOf(a) !== G.compOf(b)) { const m = G.mainComp; if (G.compOf(a) !== m) a = G.nearest(x0, z0, 8000, m); if (G.compOf(b) !== m) b = G.nearest(x1, z1, 8000, m); }
    if (a < 0 || b < 0) return { pts: [[x0, z0, 0], [x1, z1, 0]], length: Math.hypot(x1 - x0, z1 - z0), straight: true };
    const nodes = a === b ? [a] : G.path(a, b);
    if (!nodes) return { pts: [[x0, z0, 0], [x1, z1, 0]], length: Math.hypot(x1 - x0, z1 - z0), straight: true };
    const pts = [];
    const leg = (xa, za, xb, zb) => {
      const c = cityAt(xa, za, 0) || cityAt(xb, zb, 0), L = c && this.lineOf(c);
      const seq = c && L && Math.hypot(xb - xa, zb - za) > 40 ? manhattan(L, c, xa, za, xb, zb) : [[xb, zb]]; let px = xa, pz = za;
      pts.push([xa, za, 0]); for (const q of seq) { pts.push([q[0], q[1], 0]); px = q[0]; pz = q[1]; } void px; void pz;
    };
    leg(x0, z0, G.x[nodes[0]], G.z[nodes[0]]);
    // the right-hand lane of the direction of travel (the median sits on the road's centre line): 7.2 m = the middle of the second lane
    for (let k = 0; k < nodes.length; k++) {
      const id = nodes[k], p0 = nodes[Math.max(0, k - 2)], p1 = nodes[Math.min(nodes.length - 1, k + 2)];
      let tx = G.x[p1] - G.x[p0], tz = G.z[p1] - G.z[p0]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const r = G.roads[G.rd[id]], art = r.kind === 'arterial';
      // the right-hand lane: on a highway 7.2 m right of the median line; on a compiled one-way line its outer lane, on a two-way line the first lane right of the centre
      // a fitted street (src/carriage.js) keeps its narrower lanes: the car runs in the middle of the lane that is drawn
      const C = art ? carriage(r) : null, off = !art ? 7.2 : r.fit ? (C.two ? 0.12 + C.lane / 2 : C.half - C.edge - C.lane / 2) : r.oneway ? C.half - 2.4 - LANE_W / 2 : 0.12 + LANE_W / 2;
      // [5]: the room for lanes outside the route's lane (an overtake to the outer side stays on the carriageway): a compiled one-way line's route
      // runs in its outer lane, and the outer overtake put the car on the 2.4 m shoulder, into the edge barrier at 107 km/h (서울외곽순환선, region-drive)
      const outer = !art ? LANE_W : C.two ? (C.n - 1) * (r.fit ? C.lane : LANE_W) : 0;
      pts.push([G.x[id] - tz * off, G.z[id] + tx * off, art && r.hw !== 'motorway' && r.hw !== 'trunk' ? 0 : 1, r.y ? r.y[G.ixOf(id)] : undefined, !!(r.cls && r.cls[G.ixOf(id)] === 2), outer]);   // [3]: the road's surface height (a ride follows it over viaducts and through cuttings); [4]: in a tunnel
    }
    const last = nodes[nodes.length - 1]; pts.push([x1, z1, 0]);
    // the way in: street leg from the graph end to the destination (reversed use of the same helper)
    const tail = []; const c2 = cityAt(x1, z1, 400), L2 = c2 && this.lineOf(c2);
    if (c2 && L2 && Math.hypot(x1 - G.x[last], z1 - G.z[last]) > 40) { const m = manhattan(L2, c2, G.x[last], G.z[last], x1, z1); pts.pop(); for (const q of m) pts.push([q[0], q[1], 0]); }
    void tail;
    // resample to ~25 m and measure
    const out = []; let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1], d = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.ceil(d / 25));
      const yAB = A[3] != null && B[3] != null;   // a height only between two road samples (a street leg has none: the ground there)
      for (let k = 0; k < n; k++) out.push([A[0] + (B[0] - A[0]) * k / n, A[1] + (B[1] - A[1]) * k / n, A[2], yAB ? A[3] + (B[3] - A[3]) * k / n : k === 0 ? A[3] : undefined, !!A[4] && (k === 0 || !!B[4]), Math.min(A[5] ?? 0, B[5] ?? 0)]);   // [5]: the narrower room of the two ends
      len += d;
    }
    const e = pts[pts.length - 1]; out.push([e[0], e[1], e[2], e[3], !!e[4], e[5] ?? 0]);   // the end as the others: [5] set (no room: a street end)
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
      // the outer side only as far as there are lanes there (route point [5]): beyond them lie the shoulder and the barrier
      const room = Math.min(P[this.i][5] ?? 0, P[Math.min(P.length - 1, this.i + 6)][5] ?? 0);
      const opts = blocked ? [want + LANE_W, want - LANE_W].filter((q) => Math.abs(q) <= LANE_W + 0.01 && q >= -room - 0.01) : want ? [0] : [];
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
    let cls = P[Math.min(P.length - 1, this.i + 2)][2], target = cls ? 30 : 13;   // a Korean expressway's 100-110 km/h limit (it was 130 km/h), a city street's 50
    // corners ahead, as far as it takes to slow down: at each bend the speed that keeps the sideways pull at 3.5 m/s^2 (radius from the turn over
    // the two segments), from which the car brakes at 4 m/s^2 over the distance to it (a sharp turn had a fixed 11 m/s within 8 points)
    let s = Math.hypot(P[this.i][0] - v.x, P[this.i][1] - v.z); const reach = 40 + spd * spd / 8;
    for (let k = this.i; k < P.length - 2 && s < reach; k++) {
      const l1 = Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]), l2 = Math.hypot(P[k + 2][0] - P[k + 1][0], P[k + 2][1] - P[k + 1][1]);
      const a1 = Math.atan2(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]), a2 = Math.atan2(P[k + 2][0] - P[k + 1][0], P[k + 2][1] - P[k + 1][1]), tw = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
      s += l1; if (tw > 0.02) target = Math.min(target, stopSpeed(s - l1 * 0.5, 4, Math.max(5, Math.sqrt(3.5 * ((l1 + l2) * 0.5) / tw))));
    }
    if (Math.abs(dh) > 0.5) target = Math.min(target, 8);
    // obstacles: other vehicles and people ahead in the lane
    const lookO = 12 + Math.max(spd, 0) * 1.3 + spd * spd / 10;   // as far as it takes to stop (5 m/s^2)
    // while moving over, a car counts as in the way if it is in the lane being entered, or so close in the current lane that the move cannot clear it
    const free = target, shift = (this.latT || 0) - this.carLat(v, P);
    for (const o of G.vehicles) {
      if (o === v || !o.group.visible) continue; const dx = o.x - v.x, dz = o.z - v.z, along = dx * sH + dz * cH;
      if (along < 1 || along > lookO + o.L * 0.5) continue;
      const side = dx * cH - dz * sH, w = (v.W + o.W) * 0.5 + 0.6, gap = along - o.L * 0.5 - v.L * 0.5;
      if (Math.abs(side - shift) < w || (Math.abs(side) < w && gap < 4 + spd * 0.35)) target = Math.min(target, gap > 3 ? stopSpeed(gap - 3, 5, o.speed) : Math.min(o.speed * 0.5, 1));   // slows to the car ahead's speed within the gap
    }
    this.lanes(v, P, cls, target < free - 4, lookO, dt);
    for (const h of G.humans) {
      if (h.dead || h.hidden) continue; const dx = h.x - v.x, dz = h.z - v.z, along = dx * sH + dz * cH;
      if (along < 0.5 || along > lookO * 0.8) continue; if (Math.abs(dx * cH - dz * sH) < v.W * 0.5 + 1.2) target = Math.min(target, stopSpeed(along - 4, 6));
    }
    const err = target - spd;
    v.throttle = err > 0 ? Math.min(1, err * 0.35) : 0; v.brake = err < -1 ? Math.min(1, -err * 0.25) : 0; v.hand = false;
    // wedged behind a stopped car: back off for a moment (brake at a standstill reverses) with the wheels turned the other way
    if (spd < 1 && target < 1 && free > 3) { this.wedged = (this.wedged || 0) + dt; if (this.wedged > 3) { this.wedged = 0; this.backT = 1.6; } } else this.wedged = 0;
    if (this.backT > 0) { this.backT -= dt; v.throttle = 0; v.brake = 1; v.steer = -v.steer; return; }
    if (spd < 1.5 && target > 3) { this.stuck = (this.stuck || 0) + dt; if (this.stuck > 6) { this.stuck = 0; this.i = Math.min(P.length - 1, this.i + 3); } } else this.stuck = 0;
  }
}
