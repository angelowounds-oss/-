// The 100 x 100 km world as data: continent, mountains, rivers, biomes, the cities and the highways that join them. Pure functions of a
// seed (no three.js), so the browser, the build step (later: the bake) and the unit tests all get the same world. Coordinates are
// metres, x east / z south, the capital (Neon City) at the origin; heights are metres above the capital's ground plane (y = 0), the sea
// is at SEA.
//
// Layers:   coarse grid (CG x CG, ~390 m cells): base height, mountain-ness, biome, rivers      -> farHeight(x, z, cell)
//           fine detail noise on top, only the octaves a given level of detail can show         -> no shimmer between levels
//           cities (site search on the coarse grid), highways (A* on a coarser grid, smoothed) -> CITIES, HIGHWAYS
import { koreaMask, landAt } from './koreamap.js';

import { CAPITAL } from './koreamap.js';

export const WORLD_HALF = 50000, SEA = -4, CG = 256, CC = (2 * WORLD_HALF) / CG;

// ------------------------------------------------------------------ noise (integer hash: identical on every platform)
const SEED = 20261016;
function ih(ix, iz, s) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(s + SEED, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vn(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return (ih(ix, iz, s) * (1 - ux) + ih(ix + 1, iz, s) * ux) * (1 - uz) + (ih(ix, iz + 1, s) * (1 - ux) + ih(ix + 1, iz + 1, s) * ux) * uz;
}
export function fbm(x, z, oct, s) { let a = 0.5, f = 1, sum = 0, n = 0; for (let i = 0; i < oct; i++) { sum += a * vn(x * f, z * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; } return sum / n; }
function ridged(x, z, oct, s) { let a = 0.5, f = 1, sum = 0, n = 0; for (let i = 0; i < oct; i++) { const r = 1 - Math.abs(2 * vn(x * f, z * f, s + i * 31) - 1); sum += a * r * r; n += a; a *= 0.5; f *= 2.07; } return sum / n; }
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ the raw landscape (before cities are flattened)
export const VOLCANO = { x: -21000, z: 24000, r: 3200, h: 1900 };
// the Korea land mask (koreamap.js, WLD-20e): the share of land on a ring of radius r around (x, z); the coast is a slope over a kilometre, not a step
function koreaShare(x, z, r) {
  const M = koreaMask(); let sum = landAt(M, x, z);
  for (let a = 0; a < 8; a++) sum += landAt(M, x + Math.cos(a * 0.785398) * r, z + Math.sin(a * 0.785398) * r);
  return sum / 9;
}
function rawHeight(x, z) {
  const land = sstep(0.3, 0.7, koreaShare(x, z, 1000));
  const shelf = koreaShare(x, z, 4000);   // 0 far out at sea (deepest), 1 well inland
  const plains = 8 + 26 * fbm(x / 9000, z / 9000, 3, 2);
  const mm = sstep(0.50, 0.74, fbm(x / 30000 + 9, z / 30000 - 4, 3, 3));                    // where mountain ranges stand
  const mount = mm * (260 + 1450 * ridged(x / 7600, z / 7600, 5, 4));
  const hills = 130 * fbm(x / 5200, z / 5200, 4, 5) * (0.35 + 0.65 * sstep(0.35, 0.62, fbm(x / 21000 + 2, z / 21000, 3, 6)));
  const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  const cone = VOLCANO.h * Math.exp(-Math.pow(dv / VOLCANO.r, 2.0)) - 420 * Math.exp(-Math.pow(dv / (VOLCANO.r * 0.12), 2.0));   // cone with a crater
  const landH = plains + hills + mount + cone * land;
  const seaH = SEA - 3 - 130 * sstep(0, 1, 1 - shelf);
  return lerp(seaH, landH, land);
}

// ------------------------------------------------------------------ coarse grid
let COARSE = null;
function build() {
  if (COARSE) return COARSE;
  if (globalThis.__BAKED?.world) return (COARSE = globalThis.__BAKED.world);   // baked at build time (build/bake.mjs)
  const N1 = CG + 1, H = new Float32Array(N1 * N1), M = new Float32Array(N1 * N1);
  for (let j = 0; j <= CG; j++) for (let i = 0; i <= CG; i++) {
    const x = -WORLD_HALF + i * CC, z = -WORLD_HALF + j * CC;
    H[j * N1 + i] = rawHeight(x, z);
    M[j * N1 + i] = sstep(0.50, 0.74, fbm(x / 30000 + 9, z / 30000 - 4, 3, 3));
  }
  const W = { N1, H, M, rivers: [], riverMask: new Float32Array(N1 * N1), cities: [], highways: [], F: new Float32Array(N1 * N1), B: new Uint8Array(N1 * N1), COL: new Float32Array(N1 * N1 * 3) };
  COARSE = W;
  carveRivers(W);
  placeCities(W);
  flattenCities(W);
  surfaceGrids(W);
  routeHighways(W);
  return W;
}
const cellAt = (v) => (v + WORLD_HALF) / CC;
function sample(arr, N1, x, z) {
  const fx = Math.min(CG - 1e-6, Math.max(0, cellAt(x))), fz = Math.min(CG - 1e-6, Math.max(0, cellAt(z)));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * N1 + i;
  return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + N1] * (1 - u) + arr[k + N1 + 1] * u) * v;
}

// ------------------------------------------------------------------ rivers: downhill walks from the high peaks to the sea, valleys carved into the coarse heights
function carveRivers(W) {
  const { N1, H } = W, peaks = [];
  for (let j = 4; j < CG - 4; j += 3) for (let i = 4; i < CG - 4; i += 3) { const h = H[j * N1 + i]; if (h > 650) peaks.push({ i, j, h, o: ih(i, j, 91) }); }
  peaks.sort((a, b) => b.o - a.o);
  const used = []; const flow = new Float32Array(N1 * N1);
  for (const p of peaks) {
    if (W.rivers.length >= 9) break;
    if (used.some((q) => Math.hypot(q.i - p.i, q.j - p.j) < 20)) continue;
    used.push(p);
    let i = p.i, j = p.j; const pts = [], seen = new Set();
    for (let step = 0; step < 900; step++) {
      pts.push([i, j]); seen.add(j * N1 + i); flow[j * N1 + i] += 1;
      if (H[j * N1 + i] < SEA + 1 || i <= 1 || j <= 1 || i >= CG - 1 || j >= CG - 1) break;
      let bi = -1, bj = -1, bh = 1e9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (seen.has(nj * N1 + ni)) continue;
        const h = H[nj * N1 + ni] + ih(ni, nj, 92) * 6 + (di && dj ? 4 : 0); if (h < bh) { bh = h; bi = ni; bj = nj; }
      }
      if (bi < 0) break; i = bi; j = bj;
    }
    if (pts.length > 25) W.rivers.push({ cells: pts });
  }
  for (const r of W.rivers) {
    r.pts = r.cells.map(([i, j], k) => [-WORLD_HALF + i * CC, -WORLD_HALF + j * CC, 14 + 70 * Math.sqrt(flow[j * N1 + i]) * Math.min(1, k / 30)]);
    r.cells.forEach(([i, j]) => { const k = j * N1 + i, f = Math.sqrt(flow[k]); W.riverMask[k] = Math.max(W.riverMask[k], Math.min(1, 0.4 + 0.2 * f)); if (H[k] > SEA + 2) H[k] -= Math.min(26, 5 + 6 * f); });
  }
}

// ------------------------------------------------------------------ cities: wished position -> nearest suitable site (flat land; the port at a coast)
export const CITY_DEFS = [
  { id: 'neon', name: 'NEON CITY', type: 'metropolis', x: CAPITAL.x, z: CAPITAL.z, r: 4200, fixed: true },   // at Seoul (ADR-0017)
  { id: 'harbor', name: 'HARBOR GATE', type: 'port', x: -31000, z: 9000, r: 3000, coast: true },
  { id: 'airfield', name: 'SKYPORT', type: 'airport', x: 29000, z: -15000, r: 3400 },
  { id: 'mid1', name: 'REDWOOD', type: 'town', x: -12000, z: -32000, r: 1900 },
  { id: 'mid2', name: 'AMBER FLATS', type: 'town', x: 22000, z: 33000, r: 1800 },
  { id: 'mid3', name: 'SILVERFJORD', type: 'town', x: -6000, z: 38000, r: 1700 },
  { id: 'mid4', name: 'CINDER BAY', type: 'town', x: -40000, z: -27000, r: 1600 },
];
const slopeAt = (W, x, z) => { const e = CC; return Math.hypot(sample(W.H, W.N1, x + e, z) - sample(W.H, W.N1, x - e, z), sample(W.H, W.N1, x, z + e) - sample(W.H, W.N1, x, z - e)) / (2 * e); };
const nearSea = (W, x, z, within) => { for (let a = 0; a < 16; a++) for (let d = within * 0.4; d <= within; d += within * 0.3) if (sample(W.H, W.N1, x + Math.cos(a / 16 * 6.2832) * d, z + Math.sin(a / 16 * 6.2832) * d) < SEA) return true; return false; };
function placeCities(W) {
  const placed = [];
  for (const def of CITY_DEFS) {
    let best = null;
    if (def.fixed) best = { x: def.x, z: def.z };
    else {
      let bs = 1e18;
      for (let r = 0; r <= 30000; r += 500) for (let a = 0; a < (r ? 24 : 1); a++) {
        const x = def.x + Math.cos(a / 24 * 6.2832 + r) * r, z = def.z + Math.sin(a / 24 * 6.2832 + r) * r;
        if (Math.abs(x) > WORLD_HALF - 6000 || Math.abs(z) > WORLD_HALF - 6000) continue;
        const h = sample(W.H, W.N1, x, z); if (h < 2 || h > 60) continue;
        const sl = slopeAt(W, x, z); if (sl > 0.05) continue;
        if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 15000)) continue;
        if (def.coast && !nearSea(W, x, z, 3200)) continue;
        if (!def.coast && nearSea(W, x, z, 1200)) continue;
        const sc = r + sl * 40000; if (sc < bs) { bs = sc; best = { x, z }; }
      }
      if (!best) best = { x: def.x, z: def.z };
    }
    const c = { ...def, x: best.x, z: best.z, y: 0 };   // every city stands on y = 0, like the capital: the building generator, floors and lifts all assume a ground plane at 0
    if (def.coast) {   // the port lies low and opens to the nearest sea through a harbour basin cut into the flat ground (flattenCities)
      let bd = 1e18, ba = 0;
      for (let a = 0; a < 48; a++) for (let d = 1000; d <= 14000; d += 500) { if (sample(W.H, W.N1, c.x + Math.cos(a / 48 * 6.2832) * d, c.z + Math.sin(a / 48 * 6.2832) * d) < SEA) { if (d < bd) { bd = d; ba = a / 48 * 6.2832; } break; } }
      c.seaDir = { x: Math.cos(ba), z: Math.sin(ba) };
    }
    placed.push(c); W.cities.push(c);
  }
}
// the ground under a city is flat out to 1.15 r and blends back to the landscape by 2.4 r (the capital stays at y = 0)
function cityFlat(c, x, z) { const d = Math.hypot(x - c.x, z - c.z); return 1 - sstep(c.r * 1.15, c.r * 2.4, d); }
function flattenCities(W) {
  const { N1, H } = W;
  for (let j = 0; j <= CG; j++) for (let i = 0; i <= CG; i++) {
    const x = -WORLD_HALF + i * CC, z = -WORLD_HALF + j * CC;
    for (const c of W.cities) { const f = cityFlat(c, x, z); if (f > 0) H[j * N1 + i] = lerp(H[j * N1 + i], c.y, f); }
    for (const c of W.cities) if (c.seaDir) {   // harbour basin: an ellipse of water on the sea side, 0.74 R from the centre outwards
      const ox = x - c.x - c.seaDir.x * c.r * 1.15, oz = z - c.z - c.seaDir.z * c.r * 1.15, al = ox * c.seaDir.x + oz * c.seaDir.z, pe = -ox * c.seaDir.z + oz * c.seaDir.x;
      const w = 1 - sstep(0.75, 1.0, Math.hypot(al / (c.r * 0.4), pe / (c.r * 0.7))); if (w > 0) H[j * N1 + i] = lerp(H[j * N1 + i], SEA - 10, w);
    }
  }
}

// ------------------------------------------------------------------ highways: A* over a coarse grid (no sea, slopes cost), then smoothed
const HG = 128, HC = (2 * WORLD_HALF) / HG;
function routeHighways(W) {
  const cost = new Float32Array((HG + 1) * (HG + 1));
  for (let j = 0; j <= HG; j++) for (let i = 0; i <= HG; i++) {
    const x = -WORLD_HALF + i * HC, z = -WORLD_HALF + j * HC, h = sample(W.H, W.N1, x, z);
    const sl = slopeAt(W, x, z), rv = sample(W.riverMask, W.N1, x, z);
    const shore = Math.min(sample(W.H, W.N1, x + HC, z), sample(W.H, W.N1, x - HC, z), sample(W.H, W.N1, x, z + HC), sample(W.H, W.N1, x, z - HC)) < SEA + 4;   // keep a cell off the water
    cost[j * (HG + 1) + i] = h < SEA + 3 ? 1e9 : 1 + 14 * Math.min(1, sl / 0.18) + (h > 500 ? (h - 500) / 120 : 0) + rv * 2.5 + (shore ? 9 : 0);
  }
  const edges = [], n = W.cities.length, linked = new Set();
  const dist = (a, b) => Math.hypot(W.cities[a].x - W.cities[b].x, W.cities[a].z - W.cities[b].z);
  const key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
  const inTree = new Set([0]);
  while (inTree.size < n) {   // minimum spanning tree (Prim), then one extra link per city to its nearest unlinked neighbour
    let ba = -1, bb = -1, bd = 1e18;
    for (const a of inTree) for (let b = 0; b < n; b++) if (!inTree.has(b) && dist(a, b) < bd) { bd = dist(a, b); ba = a; bb = b; }
    edges.push([ba, bb]); linked.add(key(ba, bb)); inTree.add(bb);
  }
  for (let a = 0; a < n; a++) {
    const cand = []; for (let b = 0; b < n; b++) if (b !== a && !linked.has(key(a, b))) cand.push(b);
    cand.sort((p, q) => dist(a, p) - dist(a, q));
    if (cand.length && dist(a, cand[0]) < 36000) { edges.push([a, cand[0]]); linked.add(key(a, cand[0])); }
  }
  edges.forEach(([a, b], id) => {
    const path = astar(cost, W.cities[a], W.cities[b]);
    if (!path) { W.failed = (W.failed || []).concat([[W.cities[a].id, W.cities[b].id]]); return; }
    let pts = path.map(([i, j]) => [-WORLD_HALF + i * HC, -WORLD_HALF + j * HC]);
    pts[0] = [W.cities[a].x, W.cities[a].z]; pts[pts.length - 1] = [W.cities[b].x, W.cities[b].z];
    // corner cutting must not put the road into the sea: smooth as much as keeps every point (and every midpoint) on land
    const wet = (P) => { for (let k = 0; k < P.length; k++) { if (sample(W.H, W.N1, P[k][0], P[k][1]) < SEA + 2.5) return true; if (k && sample(W.H, W.N1, (P[k][0] + P[k - 1][0]) / 2, (P[k][1] + P[k - 1][1]) / 2) < SEA + 2.5) return true; } return false; };
    let best = pts; const chaikin = (P) => { const o = [P[0]]; for (let k = 0; k < P.length - 1; k++) { const p = P[k], q = P[k + 1]; o.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]); } o.push(P[P.length - 1]); return o; };
    let cur = pts; for (let it = 0; it < 3; it++) { cur = chaikin(cur); if (!wet(cur)) best = cur; else break; }
    pts = best;
    const res = [pts[0]]; let acc = 0;
    for (let k = 1; k < pts.length; k++) { acc += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); if (acc >= 300 || k === pts.length - 1) { res.push(pts[k]); acc = 0; } }
    let len = 0; for (let k = 1; k < res.length; k++) len += Math.hypot(res[k][0] - res[k - 1][0], res[k][1] - res[k - 1][1]);
    W.highways.push({ id, a: W.cities[a].id, b: W.cities[b].id, pts: res, length: len });
  });
}
function astar(cost, ca, cb) {
  const N1 = HG + 1, idx = (i, j) => j * N1 + i, si = Math.round((ca.x + WORLD_HALF) / HC), sj = Math.round((ca.z + WORLD_HALF) / HC), ti = Math.round((cb.x + WORLD_HALF) / HC), tj = Math.round((cb.z + WORLD_HALF) / HC);
  const g = new Float32Array(N1 * N1).fill(1e18), from = new Int32Array(N1 * N1).fill(-1), done = new Uint8Array(N1 * N1);
  const heap = [[0, si, sj]]; g[idx(si, sj)] = 0;
  const push = (it) => { heap.push(it); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  while (heap.length) {
    const [, i, j] = pop(), k = idx(i, j); if (done[k]) continue; done[k] = 1;
    if (i === ti && j === tj) { const out = []; for (let c = k; c >= 0; c = from[c]) out.push([c % N1, Math.floor(c / N1)]); return out.reverse(); }
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni > HG || nj > HG) continue;
      const nk = idx(ni, nj), c = cost[nk]; if (c > 1e8 && !(ni === ti && nj === tj)) continue;
      const ng = g[k] + (di && dj ? 1.414 : 1) * 0.5 * (cost[k] + Math.min(c, 40)); if (ng < g[nk]) { g[nk] = ng; from[nk] = k; push([ng + Math.hypot(ti - ni, tj - nj) * 1.0, ni, nj]); }
    }
  }
  return null;
}

// ------------------------------------------------------------------ public sampling
// The game reads the world in its local frame (ADR-0017: the capital is the origin); generation and the baked container stay in map coordinates.
const LOCAL = new WeakMap();
const localView = (W) => LOCAL.get(W) || LOCAL.set(W, {
  cities: W.cities.map((c) => ({ ...c, x: c.x - CAPITAL.x, z: c.z - CAPITAL.z })),
  highways: W.highways.map((h) => ({ ...h, pts: h.pts.map((p) => [p[0] - CAPITAL.x, p[1] - CAPITAL.z]) })),
  rivers: W.rivers.map((r) => ({ ...r, pts: r.pts.map((p) => [p[0] - CAPITAL.x, p[1] - CAPITAL.z, p[2]]) })),
}).get(W);
export const world = () => build();   // map coordinates: the baked container and the bake only
export const cities = () => localView(build()).cities;
export const highways = () => localView(build()).highways;
export const rivers = () => localView(build()).rivers;

// terrain height at (x, z); `cell` = size of the smallest feature the caller can show (m): finer noise octaves are left out
export function farHeight(x, z, cell = 0) { return farHeightMap(x + CAPITAL.x, z + CAPITAL.z, cell); }
function farHeightMap(x, z, cell) {
  const W = build(); let h = sample(W.H, W.N1, x, z);
  const rug = sample(W.M, W.N1, x, z), land = h > SEA ? 1 : 0;
  if (land) {
    let amp = 6 + 90 * rug + 18 * sstep(120, 600, h), wl = 1400, s = 0;
    for (let o = 0; o < 7 && wl >= Math.max(2 * cell, 6); o++, wl *= 0.5, amp *= 0.5) s += amp * (vn(x / wl, z / wl, 200 + o * 13) - 0.5) * 2;
    h += s * (1 - sample(W.F, W.N1, x, z)) * sstep(SEA, SEA + 6, h);
  }
  return h;
}
// per coarse vertex: how flat the cities make the ground there, the biome and the colour (bilinear between vertices when sampled)
function surfaceGrids(W) {
  const { N1, H } = W, tmp = [0, 0, 0];
  for (let j = 0; j <= CG; j++) for (let i = 0; i <= CG; i++) {
    const x = -WORLD_HALF + i * CC, z = -WORLD_HALF + j * CC, k = j * N1 + i; let f = 0;
    for (const c of W.cities) f = Math.max(f, cityFlat(c, x, z));
    W.F[k] = f;
    const b = biomeMap(x, z, H[k] + (H[k] > SEA ? 0 : 0)), c = PAL[b]; W.B[k] = b;
    let r = c[0], g = c[1], bl = c[2];
    if (b === 3) { const s = vn(x / 1800, z / 1800, 12) > 0.5 ? 1.12 : 0.9; r *= s; g *= s; }
    const rv = W.riverMask[k]; if (rv > 0.3 && H[k] > SEA) { const t = Math.min(1, (rv - 0.3) * 1.6); r = lerp(r, 0.04, t); g = lerp(g, 0.16, t); bl = lerp(bl, 0.26, t); }
    W.COL[k * 3] = r; W.COL[k * 3 + 1] = g; W.COL[k * 3 + 2] = bl; void tmp;
  }
}
// 0 sea, 1 beach, 2 plains, 3 farmland, 4 forest, 5 hills, 6 mountain, 7 snow, 8 desert, 9 volcanic
export function biomeAt(x, z, h) { return biomeMap(x + CAPITAL.x, z + CAPITAL.z, h); }
function biomeMap(x, z, h) {
  if (h < SEA) return 0;
  const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z); if (dv < VOLCANO.r * 1.5 && h > 80) return 9;
  const T = 0.55 + (z / WORLD_HALF) * 0.32 + (fbm(x / 26000 + 3, z / 26000 + 8, 3, 6) - 0.5) * 0.5 - Math.max(0, h) / 2600;   // north (-z) is cold
  const M = fbm(x / 18000 + 5, z / 18000 - 2, 3, 7);
  if (h < SEA + 3.5) return 1;
  if (T < 0.20 || h > 1250) return 7;
  if (h > 640) return 6;
  if (T > 0.60 && M < 0.52) return 8;
  if (h > 170) return 5;
  if (M > 0.56) return 4;
  return vn(x / 1800, z / 1800, 11) > 0.5 ? 3 : 2;
}
export const PAL = [
  [0.02, 0.07, 0.12], [0.55, 0.50, 0.36], [0.20, 0.30, 0.13], [0.30, 0.34, 0.14], [0.07, 0.17, 0.08], [0.24, 0.24, 0.17], [0.30, 0.28, 0.26], [0.82, 0.86, 0.92], [0.62, 0.50, 0.30], [0.10, 0.07, 0.07],
];
// vertex colour (dusk-ish: the lighting does the rest); out is a [r, g, b] array
export function surfaceColor(x, z, h, out) { return surfaceMap(x + CAPITAL.x, z + CAPITAL.z, h, out); }
function surfaceMap(x, z, h, out) {
  const W = build(), fx = Math.min(CG - 1e-6, Math.max(0, cellAt(x))), fz = Math.min(CG - 1e-6, Math.max(0, cellAt(z))), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = (j * W.N1 + i) * 3, K = W.N1 * 3, C = W.COL;
  const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
  const n = 0.84 + 0.32 * vn(x / 70, z / 70, 301);
  out[0] = (C[k] * w00 + C[k + 3] * w10 + C[k + K] * w01 + C[k + K + 3] * w11) * n; out[1] = (C[k + 1] * w00 + C[k + 4] * w10 + C[k + K + 1] * w01 + C[k + K + 4] * w11) * n; out[2] = (C[k + 2] * w00 + C[k + 5] * w10 + C[k + K + 2] * w01 + C[k + K + 5] * w11) * n;
  return W.B[(u > 0.5 ? j + (v > 0.5) : j + (v > 0.5)) * W.N1 + i + (u > 0.5)];
}
