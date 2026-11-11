// A compiled region of the world (ADR-0019, KOREA-PLAN v2 M3b): real terrain, water and arterial roads made by build/world/compile.mjs. Pure (no
// three.js). The page finds it in the baked core chunk (globalThis.__BAKED.region); the bake and the node tests install it as globalThis.__REGION.
// Inside the region it is the only source of the ground; the old layers of landfn.js only blend in across the bands at its border and around the
// capital's keep zone (the hand-made city keeps its own ground). All coordinates are the local frame.
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

import { REGIONS } from './regions/index.js';
import { CAPITAL, KOREA_SCALE, LEGACY_SCALE } from './koreamap.js';

// A region compiled at another map scale is in other metres and heights (WLD-23b): it is left out, with a warning, until it is compiled again.
let CUR = undefined, LIST = null;
const usable = (R) => {
  if (!R) return null;
  if ((R.scale ?? LEGACY_SCALE) === KOREA_SCALE) return R;
  console.warn(`compiled region "${R.name}" is at scale 1:${R.scale ?? LEGACY_SCALE}, the map is 1:${KOREA_SCALE}: ignored (compile it again: node build/world/compile.mjs)`);
  return null;
};
// the capital's region (the one with the keep zone around the hand-made city)
export function region() {
  if (CUR === undefined || (CUR === null && (globalThis.__BAKED?.region || globalThis.__REGION))) { CUR = usable(globalThis.__BAKED?.region || globalThis.__REGION || null); LIST = null; }
  return CUR;
}
// every compiled region (WLD-25b): the capital first, then the provinces (build/world/compile.mjs --region <id>, globalThis.__BAKED.regions or
// __REGIONS), each owning its own cells (R.own, emit.mjs ownership)
export function regions() {
  const c = region(), more = globalThis.__BAKED?.regions || globalThis.__REGIONS || [];
  if (LIST && LIST.src === more && LIST.c === c) return LIST.all;
  const all = [c, ...more.map(usable)].filter(Boolean);
  LIST = { src: more, c, all }; ROADS = null; PLACES = null; return all;
}

// how much one region decides the ground at (x, z). The capital: 1 inside, 0 outside it and in its keep zone, smooth across the two bands. A province:
// 1 on the cells it owns, fading out over its edge band where the cells around are nobody's
function weightOf(R, x, z) {
  const x1 = R.x0 + (R.nx - 1) * R.g, z1 = R.z0 + (R.nz - 1) * R.g, edge = Math.min(x - R.x0, x1 - x, z - R.z0, z1 - z);
  if (edge <= 0) return 0;
  let w;
  if (R.own) { const o = R.own[Math.round((z - R.z0) / R.g) * R.nx + Math.round((x - R.x0) / R.g)]; w = Math.min(o === 255 ? 1 : 1 - sstep(0, R.edge, o * R.g), sstep(0, R.g, edge)); }
  else w = Math.min(sstep(0, R.edge, edge), sstep(R.keep, R.keep + R.band, Math.max(Math.abs(x), Math.abs(z))));
  for (const h of holes()) if (w > 0) w = Math.min(w, sstep(h.r, h.r + HOLE_BAND, Math.hypot(x - h.x, z - h.z)));
  return w;
}
// the regions that speak at (x, z) and how much: the first at full weight alone (an owned cell, or the capital inside its bands); otherwise each in
// order over what the ones before it left
const WS = [];
function weights(x, z) {
  const L = regions(); WS.length = 0;
  let left = 1;
  for (const R of L) {
    const w = weightOf(R, x, z); if (w <= 0) continue;
    if (w >= 1) { WS.length = 0; WS.push(R, 1); return WS; }
    WS.push(R, w * left); left *= 1 - w;
  }
  return WS;
}
// how much the compiled regions decide the ground at (x, z): 1 inside one, 0 outside them all, smooth across their bands
export function regionWeight(x, z) {
  const L = regions(); if (!L.length) return 0;
  if (L.length === 1) return weightOf(L[0], x, z);
  const W = weights(x, z); let s = 0; for (let k = 1; k < W.length; k += 2) s += W[k]; return Math.min(1, s);
}
// Cities that keep their own flat ground where the raster reaches them (viaRegion: the airport city on Yeongjong, ADR-0037): the region gives way
// inside 1.15 r and returns over HOLE_BAND, which ends before the compiled roads begin (their ground is laid into the raster, not re-graded).
const HOLE_BAND = 220;
let HOLES = null;
const holes = () => HOLES || (HOLES = REGIONS.flatMap((r) => r.cities).filter((c) => c.def.viaRegion).map((c) => ({ x: c.def.x - CAPITAL.x, z: c.def.z - CAPITAL.z, r: c.def.r * 1.15 })));

// one region's ground (game metres, bilinear), NaN outside its raster
function heightOf(R, x, z) {
  const fx = (x - R.x0) / R.g, fz = (z - R.z0) / R.g;
  if (!(fx >= 0 && fz >= 0 && fx <= R.nx - 1 && fz <= R.nz - 1)) return NaN;
  const i = Math.min(R.nx - 2, Math.floor(fx)), j = Math.min(R.nz - 2, Math.floor(fz)), u = fx - i, v = fz - j, k = j * R.nx + i, h = R.h;
  return ((h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + R.nx] * (1 - u) + h[k + R.nx + 1] * u) * v) / 10;
}
// the compiled ground (game metres), NaN outside every region's raster: the regions that speak there, by their weights; where none does (the keep
// zone, past the edge bands) the first raster that holds the point
export function regionHeight(x, z) {
  const L = regions(); if (!L.length) return NaN;
  if (L.length === 1) return heightOf(L[0], x, z);
  const W = weights(x, z); let s = 0, ws = 0;
  for (let k = 0; k < W.length; k += 2) { const h = heightOf(W[k], x, z); if (h === h) { s += h * W[k + 1]; ws += W[k + 1]; } }
  if (ws > 0) return s / ws;
  for (const R of L) { const h = heightOf(R, x, z); if (h === h) return h; }
  return NaN;
}

// the real settlements the compiler found: { id, name, kind, pop, x, z, y, r } (y in game metres, r the flat pad), of every region
let PLACES = null;
export const regionPlaces = () => { const L = regions(); return L.length <= 1 ? L[0]?.places || [] : PLACES || (PLACES = L.flatMap((R) => R.places || [])); };

// the water of the nearest cell: { cls: 0 land, 1 sea, 2 inland, level (game metres) }, or null outside every region; from the region that speaks
// most there
function waterOf(R, x, z) {
  const i = Math.round((x - R.x0) / R.g), j = Math.round((z - R.z0) / R.g);
  if (i < 0 || j < 0 || i >= R.nx || j >= R.nz) return null;
  const k = j * R.nx + i;
  return { cls: R.water[k], level: R.level[k] / 10 };
}
export function regionWater(x, z) {
  const L = regions(); if (!L.length) return null;
  if (L.length === 1) return waterOf(L[0], x, z);
  const W = weights(x, z); let best = null, bw = 0;
  for (let k = 0; k < W.length; k += 2) if (W[k + 1] > bw) { bw = W[k + 1]; best = W[k]; }
  if (best) return waterOf(best, x, z);
  for (const R of L) { const w = waterOf(R, x, z); if (w) return w; }
  return null;
}

// the arterial road lines of every region: { id, hw, oneway, lanes, half, ref, name, ds, x, z, y, cls, next, prev } (next and prev: [line, sample]
// pairs, renumbered into the joined list)
let ROADS = null;
export const regionRoads = () => {
  const L = regions(); if (L.length <= 1) return L[0]?.roads || [];
  if (ROADS) return ROADS;
  ROADS = [];
  for (const R of L) {
    const off = ROADS.length, re = (a) => a.map(([ri, i]) => [ri + off, i]);
    for (const r of R.roads || []) ROADS.push(off ? { ...r, next: re(r.next || []), prev: re(r.prev || []) } : r);
  }
  return ROADS;
};

// the physics ground: the compiled ground, filled down to the road surface in tunnels, where the drawn ground is left alone. A bridge is not filled:
// its deck is a collider of its own (highways.js), and the ground under it stays the drawn one, so roads, cars and people can pass beneath it.
// The fill reaches TUNNEL_FILL past the road's edge: the physics height field reads the baked 16 m tiles (the 8 m ones only where the high pack has
// streamed in), and a corner of a 16 m cell the road crosses can lie 22.6 m from it; filled only to 1 m past the edge, a narrow road's tunnel had
// the hill's height at such corners and the field rose through a third of the tunnel segments (up to 92 m over the road), so no car got through.
// The ground over the tunnel is a mesh of its own (highways.js, GPL-18)
export const TUNNEL_FILL = 24;
let STRUCT = null;
function structures() {
  if (STRUCT) return STRUCT;
  const grid = new Map(), CS = 64, key = (x, z) => Math.floor(x / CS) * 100003 + Math.floor(z / CS);
  for (const r of regionRoads()) for (let i = 0; i + 1 < r.x.length; i++) {
    if (r.cls[i] !== 2 && r.cls[i + 1] !== 2) continue;
    const pad = r.half + TUNNEL_FILL;
    for (let a = Math.floor((Math.min(r.x[i], r.x[i + 1]) - pad) / CS); a <= Math.floor((Math.max(r.x[i], r.x[i + 1]) + pad) / CS); a++)
      for (let b = Math.floor((Math.min(r.z[i], r.z[i + 1]) - pad) / CS); b <= Math.floor((Math.max(r.z[i], r.z[i + 1]) + pad) / CS); b++) { const q = a * 100003 + b; let l = grid.get(q); if (!l) grid.set(q, (l = [])); l.push(r, i); }
  }
  return (STRUCT = { grid, key });
}
export function regionPhysHeight(x, z) {
  const h0 = regionHeight(x, z); if (h0 !== h0) return h0;
  const h = carve(x, z, h0), S = structures(), l = S.grid.get(S.key(x, z)); if (!l) return h;
  // each tunnel in reach fills to its nearest segment, and the lowest tunnel wins: where a shallow one passes over a deep one, the deep one stays open
  // and the shallow one stands on its own deck (highways.js makes one where the ground is not at the road)
  const near = new Map();
  for (let q = 0; q < l.length; q += 2) {
    const r = l[q], i = l[q + 1], ax = r.x[i], az = r.z[i], dx = r.x[i + 1] - ax, dz = r.z[i + 1] - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d > r.half + TUNNEL_FILL) continue;
    const b = near.get(r); if (!b || d < b.d) near.set(r, { d, y: r.y[i] + (r.y[i + 1] - r.y[i]) * t - 0.25 });
  }
  if (!near.size) return h;
  let y = Infinity; for (const b of near.values()) if (b.y < y) y = b.y;
  return Math.min(h, y);   // it only cuts: past a portal the land under a bridge next to it stays the drawn land (GPL-17)
}

// the physics ground under the open roads: within CARVE_IN of the edge of the nearest road on the ground, never over that road's surface; farther out, a
// 1:1 bank up from the edge of each road. The 16 m raster carries no cutting narrower than a cell (the ramp down to an underpass, a road between
// retaining walls, a junction with a road at another level): with the 8 m field read from it, 17,000 samples of open roads (0.55 %) had the physics
// ground 0.5-9 m over them, and a car drove into the rise 23 m before a portal (GPL-20, 2026-11-06). The nearest road decides near the roads, as in
// build/world/grade.mjs: cut by every road in reach, the ground of a road beside a lower one fell to that one's level. It only cuts: a road over the
// ground keeps its deck (highways.js)
export const CARVE_IN = 4, CARVE_BANK = 8;
let OPEN = null;
function openRoads() {
  if (OPEN) return OPEN;
  // a cell index of the open segments (both ends on the ground): CSR, road and segment as pairs
  const roads = regionRoads(), CS = 128, cells = new Map(), key = (a, b) => a * 100003 + b, each = (fn) => roads.forEach((r, ri) => { for (let i = 0; i + 1 < r.x.length; i++) {
    if (r.cls[i] || r.cls[i + 1]) continue; const pad = r.half + CARVE_IN + CARVE_BANK;
    for (let a = Math.floor((Math.min(r.x[i], r.x[i + 1]) - pad) / CS); a <= Math.floor((Math.max(r.x[i], r.x[i + 1]) + pad) / CS); a++)
      for (let b = Math.floor((Math.min(r.z[i], r.z[i + 1]) - pad) / CS); b <= Math.floor((Math.max(r.z[i], r.z[i + 1]) + pad) / CS); b++) fn(key(a, b), ri, i);
  } });
  each((k) => cells.set(k, (cells.get(k) || 0) + 1));
  let n = 0; const start = new Map(); for (const [k, c] of cells) { start.set(k, [n, n]); n += c; }
  const P = new Int32Array(n * 2); each((k, ri, i) => { const s = start.get(k); P[s[1] * 2] = ri; P[s[1] * 2 + 1] = i; s[1]++; });
  return (OPEN = { roads, P, start, CS, key });
}
// what one segment says at (x, z), into out = [the nearest edge distance, that road's surface there, the lowest bank]
function bounds(O, ri, i, x, z, out) {
  const r = O.roads[ri], ax = r.x[i], az = r.z[i], dx = r.x[i + 1] - ax, dz = r.z[i + 1] - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), e = Math.hypot(x - ax - dx * t, z - az - dz * t) - r.half;
  if (e > CARVE_IN + CARVE_BANK) return;
  const y = r.y[i] + (r.y[i + 1] - r.y[i]) * t - 0.05, c = y + Math.max(0, e - CARVE_IN);
  if (e < out[0]) { out[0] = e; out[1] = y; } if (c < out[2]) out[2] = c;
}
// the points of an 8 m lattice (the physics height field's, on whole multiples of 8 m; the baked tiles', 8 m from their origin) come from a block of the
// cell they lie in, made once by laying the cell's segments onto its 16 x 16 points (a field of 129 x 129 took 100 ms point by point; 2-40 ms with the
// blocks made, 5 ms once they are); any other point is computed alone
const LAT = 8, BLOCKS = new Map(), BLOCK_MAX = 4096;
function block(O, a, b, c, px, pz) {
  const k = O.key(a, b) * 64 + px * 8 + pz; let B = BLOCKS.get(k); if (B) return B;
  const n = O.CS / LAT, E = new Float32Array(n * n).fill(Infinity), Y = new Float32Array(n * n), C = new Float32Array(n * n).fill(Infinity), out = [0, 0, 0], x0 = a * O.CS + px, z0 = b * O.CS + pz;
  for (let q = c[0]; q < c[1]; q++) {
    const ri = O.P[q * 2], i = O.P[q * 2 + 1], r = O.roads[ri], pad = r.half + CARVE_IN + CARVE_BANK;
    const i0 = Math.max(0, Math.ceil((Math.min(r.x[i], r.x[i + 1]) - pad - x0) / LAT)), i1 = Math.min(n - 1, Math.floor((Math.max(r.x[i], r.x[i + 1]) + pad - x0) / LAT));   // n - 1: the points of the cell itself
    const j0 = Math.max(0, Math.ceil((Math.min(r.z[i], r.z[i + 1]) - pad - z0) / LAT)), j1 = Math.min(n - 1, Math.floor((Math.max(r.z[i], r.z[i + 1]) + pad - z0) / LAT));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
      const p = j * n + ii; out[0] = E[p]; out[1] = Y[p]; out[2] = C[p]; bounds(O, ri, i, x0 + ii * LAT, z0 + j * LAT, out); E[p] = out[0]; Y[p] = out[1]; C[p] = out[2];
    }
  }
  if (BLOCKS.size >= BLOCK_MAX) BLOCKS.delete(BLOCKS.keys().next().value);
  BLOCKS.set(k, (B = { E, Y, C, n })); return B;
}
export function carve(x, z, h) {   // exported for the ground over tunnels (highways.js coverMesh), which is cut the same way
  const O = openRoads(), a = Math.floor(x / O.CS), b = Math.floor(z / O.CS), c = O.start.get(O.key(a, b)); if (!c) return h;
  let e, y, cut;
  const px = ((x % LAT) + LAT) % LAT, pz = ((z % LAT) + LAT) % LAT;
  if (Number.isInteger(x) && Number.isInteger(z) && x - px >= a * O.CS && z - pz >= b * O.CS) { const B = block(O, a, b, c, px, pz), p = ((z - pz - b * O.CS) / LAT) * B.n + (x - px - a * O.CS) / LAT; e = B.E[p]; y = B.Y[p]; cut = B.C[p]; }
  else { const out = [Infinity, 0, Infinity]; for (let q = c[0]; q < c[1]; q++) bounds(O, O.P[q * 2], O.P[q * 2 + 1], x, z, out); [e, y, cut] = out; }
  return Math.min(h, e <= CARVE_IN ? y : cut);
}

if (typeof window !== 'undefined') window.__region = { regions, regionPlaces, regionWeight, regionHeight, regionWater, regionRoads, regionPhysHeight };   // test hook
