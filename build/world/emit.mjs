// What the game reads of a compiled region (ADR-0019, KOREA-PLAN v2 M3b): heights and water on the game's datum, and the arterial road lines with
// their attributes and junctions, in the local frame. Written as one bakefmt chunk (deflated) to build/baked/world/<region>/region.bin; the bake puts
// it into the core chunk as `region`, and src/region.js samples it.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { CAPITAL, KOREA_SCALE } from '../../src/koreamap.js';
import { SEA } from '../../src/worldmap.js';
import { encodeChunk, decodeChunk } from '../../src/bakefmt.js';
import { lanesOf, halfOf } from './roads.mjs';
import { REGIONS, regionOf } from '../../src/regions/index.js';
import { distanceTo } from './water.mjs';
import { unproject } from './geo.mjs';

// the capital's own ground stays the city's (|x|, |z| below KEEP, local metres); the compiled data starts beyond KEEP + BAND, where the two blend
export const KEEP = 1500, BAND = 600, EDGE = 1000;   // EDGE: the blend band at the region's outer border, towards the world outside it
export const HOLE_BAND = 220;   // metres over which the region returns around a city that keeps its own ground (src/region.js)
const JOIN = 20;

// where the region's raster is the ground the game draws (WLD-29): the same test as src/region.js regionWeight(x, z) >= 1, for the bake. Outside it the
// drawn ground is the hand-made city's (the keep zone and its band), a city's own (the airport's hole) or a blend toward the world outside (the edge band),
// and a height baked from the raster would put a record above or below what the player sees.
export function drawnGround(R) {
  const holes = REGIONS.flatMap((r) => r.cities).filter((c) => c.def.viaRegion).map((c) => ({ x: c.def.x - CAPITAL.x, z: c.def.z - CAPITAL.z, r: c.def.r * 1.15 + HOLE_BAND }));
  const keep = (R.keep ?? KEEP) + (R.band ?? BAND), edge = R.edge ?? EDGE, x1 = R.x0 + (R.nx - 1) * R.g, z1 = R.z0 + (R.nz - 1) * R.g;
  if (R.own) return (x, z) => { const i = Math.round((x - R.x0) / R.g), j = Math.round((z - R.z0) / R.g); return i >= 0 && j >= 0 && i < R.nx && j < R.nz && R.own[j * R.nx + i] === 255 && holes.every((h) => Math.hypot(x - h.x, z - h.z) >= h.r); };   // a province: its owned cells
  return (x, z) => Math.max(Math.abs(x), Math.abs(z)) >= keep && Math.min(x - R.x0, x1 - x, z - R.z0, z1 - z) >= edge && holes.every((h) => Math.hypot(x - h.x, z - h.z) >= h.r);
}   // map metres: a line end this close to another line meets it there

// A province (WLD-25c) owns the cells of its box that src/regions regionOf gives it, less the capital's raster where that is drawn at full weight: the
// capital's roads end where its edge band starts and the province's begin there. `own` holds 255 on owned cells and, elsewhere, the distance to them in
// cells (up to 254): src/region.js gives the owner alone where a cell is owned and lets an unowned edge fade into the world outside over EDGE.
// A piece of a big province (pieces.mjs) owns only the cells inside its own lon/lat rectangle.
export function ownership(R, id, capital, rect = null) {
  const lx0 = R.x0 - CAPITAL.x, lz0 = R.z0 - CAPITAL.z, on = new Uint8Array(R.nx * R.nz), capW = capital ? drawnEdge(capital) : () => false;
  const inRect = rect ? (i, j) => { const p = unproject(R.x0 + i * R.g, R.z0 + j * R.g); return p.lon >= rect.w && p.lon < rect.e && p.lat >= rect.s && p.lat < rect.n; } : () => true;
  for (let j = 0; j < R.nz; j++) for (let i = 0; i < R.nx; i++) { const x = lx0 + i * R.g, z = lz0 + j * R.g; on[j * R.nx + i] = regionOf(x, z) === id && !capW(x, z) && inRect(i, j) ? 1 : 0; }
  const d = distanceTo(on, R.nx, R.nz), own = new Uint8Array(on.length);
  for (let k = 0; k < on.length; k++) own[k] = on[k] ? 255 : Math.min(254, Math.ceil(d[k]));
  return own;
}
// inside the capital's raster at full weight as to its outer edge (its keep zone counts as inside: no province lays roads there)
const drawnEdge = (C) => { const x1 = C.x0 + (C.nx - 1) * C.g, z1 = C.z0 + (C.nz - 1) * C.g; return (x, z) => Math.min(x - C.x0, x1 - x, z - C.z0, z1 - z) >= (C.edge ?? EDGE); };

export function emitRegion(file, name, R, gh, lines, V, places = [], own = null) {
  const lx0 = R.x0 - CAPITAL.x, lz0 = R.z0 - CAPITAL.z, n = R.nx * R.nz, at = (x, z) => own[Math.min(R.nz - 1, Math.max(0, Math.round((z - lz0) / R.g))) * R.nx + Math.min(R.nx - 1, Math.max(0, Math.round((x - lx0) / R.g)))];
  const kept = own ? () => true : (x, z) => Math.max(Math.abs(x), Math.abs(z)) >= KEEP + BAND;   // local coordinates outside the capital's keep zone and its band
  // the outer border blends into the world outside, whose ground is another height scale: a road there would sink far under it, so lines end where the blend
  // starts; a province's roads keep to the cells it owns
  const inner = own ? (x, z) => at(x, z) === 255 : (x, z) => x >= lx0 + EDGE && z >= lz0 + EDGE && x <= lx0 + (R.nx - 1) * R.g - EDGE && z <= lz0 + (R.nz - 1) * R.g - EDGE;
  if (own) places = places.filter((p) => at(p.x, p.z) === 255);
  const h = new Int16Array(n), water = new Uint8Array(n), level = new Int16Array(n);
  for (let j = 0; j < R.nz; j++) for (let i = 0; i < R.nx; i++) {
    const k = j * R.nx + i, x = lx0 + i * R.g, z = lz0 + j * R.g;
    h[k] = Math.round((gh[k] + SEA) * 10);
    if (R.water[k] && kept(x, z)) { water[k] = R.water[k]; level[k] = R.water[k] === 1 ? Math.round(SEA * 10) : Math.round((R.level[k] * V + SEA) * 10); }
  }
  // road lines: in the local frame, cut where they enter the keep zone, each piece its own line with a stable id
  const roads = [], groupCount = new Map();
  for (const L of lines) {
    let run = [];
    const flush = () => {
      if (run.length >= 3) {
        const key = `${L.hw}:${L.ref || L.name || '-'}`, k = groupCount.get(key) || 0; groupCount.set(key, k + 1);
        roads.push({ id: (own ? name + ":" : "") + `osm:${key}:${k}`, hw: L.hw, oneway: !!L.oneway, lanes: lanesOf(L), half: halfOf(L), ref: L.ref, name: L.name, ds: 8,
          x: Float32Array.from(run, (q) => L.X[q] - CAPITAL.x), z: Float32Array.from(run, (q) => L.Z[q] - CAPITAL.z), y: Float32Array.from(run, (q) => L.Y[q] + SEA), cls: Uint8Array.from(run, (q) => L.cls[q]),
          why: Uint8Array.from(run, (q) => (L.why ? L.why[q] : 0)), next: [], prev: [] });   // why: the bridge or tunnel reason (roads.mjs WHY; 1 = the map's own tag), for the flyovers of streets.mjs
      }
      run = [];
    };
    for (let i = 0; i < L.n; i++) { if (kept(L.X[i] - CAPITAL.x, L.Z[i] - CAPITAL.z) && inner(L.X[i] - CAPITAL.x, L.Z[i] - CAPITAL.z)) run.push(i); else flush(); }
    flush();
  }
  // junctions: each line end joins the nearest point of another line within JOIN (a line that starts there, or the middle of a crossing road)
  const CS = 64, grid = new Map(), key = (x, z) => Math.floor(x / CS) * 100003 + Math.floor(z / CS);
  roads.forEach((r, ri) => { for (let i = 0; i < r.x.length; i++) { const q = key(r.x[i], r.z[i]); let a = grid.get(q); if (!a) grid.set(q, (a = [])); a.push(ri, i); } });
  const nearest = (ri, x, z) => {
    let best = null, bd = JOIN;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const c = grid.get(key(x + a * CS, z + b * CS)); if (!c) continue;
      for (let q = 0; q < c.length; q += 2) { if (c[q] === ri) continue; const r = roads[c[q]], d = Math.hypot(r.x[c[q + 1]] - x, r.z[c[q + 1]] - z); if (d < bd) { bd = d; best = [c[q], c[q + 1]]; } }
    }
    return best;
  };
  roads.forEach((r, ri) => {
    const m = r.x.length - 1, e = nearest(ri, r.x[m], r.z[m]), s = nearest(ri, r.x[0], r.z[0]);
    if (e) r.next.push(e); if (s) r.prev.push(s);
  });
  const region = own ? { name, V, scale: KOREA_SCALE, g: R.g, nx: R.nx, nz: R.nz, x0: lx0, z0: lz0, edge: EDGE, own, h, water, level, roads, places }
    : { name, V, scale: KOREA_SCALE, g: R.g, nx: R.nx, nz: R.nz, x0: lx0, z0: lz0, keep: KEEP, band: BAND, edge: EDGE, h, water, level, roads, places };
  fs.writeFileSync(file, zlib.deflateRawSync(encodeChunk(region), { level: 9 }));
  return { roads: roads.length, points: roads.reduce((s, r) => s + r.x.length, 0), bytes: fs.statSync(file).size };
}

// the region a build or a test uses: decoded from its file, or null when it was never compiled
export function readRegion(file) {
  if (!fs.existsSync(file)) return null;
  return decodeChunk(new Uint8Array(zlib.inflateRawSync(fs.readFileSync(file))));
}
