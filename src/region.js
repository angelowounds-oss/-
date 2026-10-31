// A compiled region of the world (ADR-0019, KOREA-PLAN v2 M3b): real terrain, water and arterial roads made by build/world/compile.mjs. Pure (no
// three.js). The page finds it in the baked core chunk (globalThis.__BAKED.region); the bake and the node tests install it as globalThis.__REGION.
// Inside the region it is the only source of the ground; the old layers of landfn.js only blend in across the bands at its border and around the
// capital's keep zone (the hand-made city keeps its own ground). All coordinates are the local frame.
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

import { REGIONS } from './regions/index.js';
import { CAPITAL } from './koreamap.js';

let CUR = undefined;
export function region() {
  if (CUR === undefined || (CUR === null && (globalThis.__BAKED?.region || globalThis.__REGION))) CUR = globalThis.__BAKED?.region || globalThis.__REGION || null;
  return CUR;
}

// how much the region decides the ground at (x, z): 1 inside, 0 outside it and in the capital's keep zone, smooth across the two bands
export function regionWeight(x, z) {
  const R = region(); if (!R) return 0;
  const x1 = R.x0 + (R.nx - 1) * R.g, z1 = R.z0 + (R.nz - 1) * R.g, edge = Math.min(x - R.x0, x1 - x, z - R.z0, z1 - z);
  if (edge <= 0) return 0;
  let w = Math.min(sstep(0, R.edge, edge), sstep(R.keep, R.keep + R.band, Math.max(Math.abs(x), Math.abs(z))));
  for (const h of holes()) if (w > 0) w = Math.min(w, sstep(h.r, h.r + HOLE_BAND, Math.hypot(x - h.x, z - h.z)));
  return w;
}
// Cities that keep their own flat ground where the raster reaches them (viaRegion: the airport city on Yeongjong, ADR-0037): the region gives way
// inside 1.15 r and returns over HOLE_BAND, which ends before the compiled roads begin (their ground is laid into the raster, not re-graded).
const HOLE_BAND = 220;
let HOLES = null;
const holes = () => HOLES || (HOLES = REGIONS.flatMap((r) => r.cities).filter((c) => c.def.viaRegion).map((c) => ({ x: c.def.x - CAPITAL.x, z: c.def.z - CAPITAL.z, r: c.def.r * 1.15 })));

// the compiled ground (game metres, bilinear), NaN outside the region's raster
export function regionHeight(x, z) {
  const R = region(); if (!R) return NaN;
  const fx = (x - R.x0) / R.g, fz = (z - R.z0) / R.g;
  if (!(fx >= 0 && fz >= 0 && fx <= R.nx - 1 && fz <= R.nz - 1)) return NaN;
  const i = Math.min(R.nx - 2, Math.floor(fx)), j = Math.min(R.nz - 2, Math.floor(fz)), u = fx - i, v = fz - j, k = j * R.nx + i, h = R.h;
  return ((h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + R.nx] * (1 - u) + h[k + R.nx + 1] * u) * v) / 10;
}

// the real settlements the compiler found: { id, name, kind, pop, x, z, y, r } (y in game metres, r the flat pad)
export const regionPlaces = () => region()?.places || [];

// the water of the nearest cell: { cls: 0 land, 1 sea, 2 inland, level (game metres) }, or null outside the region
export function regionWater(x, z) {
  const R = region(); if (!R) return null;
  const i = Math.round((x - R.x0) / R.g), j = Math.round((z - R.z0) / R.g);
  if (i < 0 || j < 0 || i >= R.nx || j >= R.nz) return null;
  const k = j * R.nx + i;
  return { cls: R.water[k], level: R.level[k] / 10 };
}

// the arterial road lines: { id, hw, oneway, lanes, half, ref, name, ds, x, z, y, cls, next, prev }
export const regionRoads = () => region()?.roads || [];

// the physics ground: the compiled ground, filled up (or down) to the road surface on bridges and in tunnels, where the drawn ground is left alone
let STRUCT = null;
function structures() {
  if (STRUCT) return STRUCT;
  const grid = new Map(), CS = 64, key = (x, z) => Math.floor(x / CS) * 100003 + Math.floor(z / CS);
  for (const r of regionRoads()) for (let i = 0; i + 1 < r.x.length; i++) {
    if (!r.cls[i] && !r.cls[i + 1]) continue;
    const pad = r.half + 1;
    for (let a = Math.floor((Math.min(r.x[i], r.x[i + 1]) - pad) / CS); a <= Math.floor((Math.max(r.x[i], r.x[i + 1]) + pad) / CS); a++)
      for (let b = Math.floor((Math.min(r.z[i], r.z[i + 1]) - pad) / CS); b <= Math.floor((Math.max(r.z[i], r.z[i + 1]) + pad) / CS); b++) { const q = a * 100003 + b; let l = grid.get(q); if (!l) grid.set(q, (l = [])); l.push(r, i); }
  }
  return (STRUCT = { grid, key });
}
export function regionPhysHeight(x, z) {
  const h = regionHeight(x, z); if (h !== h) return h;
  const S = structures(), l = S.grid.get(S.key(x, z)); if (!l) return h;
  let best = Infinity, y = h;
  for (let q = 0; q < l.length; q += 2) {
    const r = l[q], i = l[q + 1], ax = r.x[i], az = r.z[i], dx = r.x[i + 1] - ax, dz = r.z[i + 1] - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d <= r.half + 1 && d < best) { best = d; y = r.y[i] + (r.y[i + 1] - r.y[i]) * t - 0.25; }
  }
  return y;
}

if (typeof window !== 'undefined') window.__region = { regionPlaces, regionWeight, regionHeight, regionWater, regionRoads, regionPhysHeight };   // test hook
