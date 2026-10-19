// What the game reads of a compiled region (ADR-0019, KOREA-PLAN v2 M3b): heights and water on the game's datum, and the arterial road lines with
// their attributes and junctions, in the local frame. Written as one bakefmt chunk (deflated) to build/baked/world/<region>/region.bin; the bake puts
// it into the core chunk as `region`, and src/region.js samples it.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { CAPITAL } from '../../src/koreamap.js';
import { SEA } from '../../src/worldmap.js';
import { encodeChunk, decodeChunk } from '../../src/bakefmt.js';
import { lanesOf, halfOf } from './roads.mjs';

// the capital's own ground stays the city's (|x|, |z| below KEEP, local metres); the compiled data starts beyond KEEP + BAND, where the two blend
export const KEEP = 1500, BAND = 600, EDGE = 1000;   // EDGE: the blend band at the region's outer border, towards the world outside it
const JOIN = 20;   // map metres: a line end this close to another line meets it there

export function emitRegion(file, name, R, gh, lines, V, places = []) {
  const lx0 = R.x0 - CAPITAL.x, lz0 = R.z0 - CAPITAL.z, n = R.nx * R.nz;
  const kept = (x, z) => Math.max(Math.abs(x), Math.abs(z)) >= KEEP + BAND;   // local coordinates outside the capital's keep zone and its band
  // the outer border blends into the world outside, whose ground is another height scale: a road there would sink far under it, so lines end where the blend starts
  const inner = (x, z) => x >= lx0 + EDGE && z >= lz0 + EDGE && x <= lx0 + (R.nx - 1) * R.g - EDGE && z <= lz0 + (R.nz - 1) * R.g - EDGE;
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
        roads.push({ id: `osm:${key}:${k}`, hw: L.hw, oneway: !!L.oneway, lanes: lanesOf(L), half: halfOf(L), ref: L.ref, name: L.name, ds: 8,
          x: Float32Array.from(run, (q) => L.X[q] - CAPITAL.x), z: Float32Array.from(run, (q) => L.Z[q] - CAPITAL.z), y: Float32Array.from(run, (q) => L.Y[q] + SEA), cls: Uint8Array.from(run, (q) => L.cls[q]), next: [], prev: [] });
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
  const region = { name, V, g: R.g, nx: R.nx, nz: R.nz, x0: lx0, z0: lz0, keep: KEEP, band: BAND, edge: EDGE, h, water, level, roads, places };
  fs.writeFileSync(file, zlib.deflateRawSync(encodeChunk(region), { level: 9 }));
  return { roads: roads.length, points: roads.reduce((s, r) => s + r.x.length, 0), bytes: fs.statSync(file).size };
}

// the region a build or a test uses: decoded from its file, or null when it was never compiled
export function readRegion(file) {
  if (!fs.existsSync(file)) return null;
  return decodeChunk(new Uint8Array(zlib.inflateRawSync(fs.readFileSync(file))));
}
