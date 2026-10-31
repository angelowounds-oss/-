// Procedural buildings of the capital region (WLD-24a). There is no building outline or height data in the repository, so the buildings stand on what is
// real: the compiled road network (region.bin, every street) and its water and ground. One global pass, deterministic (the same region gives the same
// bytes), written as build/baked/world/capital/buildings.bin and cut into 512 m tiles by the bake.
//   1. occupancy raster (4 m): road corridors (half width + pavement + a margin for the raster), water, steep ground
//   2. street density (128 m): how urban a place is, so fields and hills stay empty
//   3. apartment complexes first, on the big free ground far from any road (rows of slabs facing south, towers in the tower districts)
//   4. frontage lots along every road, highest class first: a building each side, sized by the district (src/districts.js) and the road class
// A building is a rotated rectangle (centre, width along the road, depth, rotation) with floors, a kind and an optional notched corner (an L shape).
//   node build/world/blocks.mjs [region.bin] [out dir]
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { encodeChunk, decodeChunk } from '../../src/bakefmt.js';
import { districtAt } from '../../src/districts.js';
import { readRegion, KEEP, BAND } from './emit.mjs';

export const TILE = 512, TILE_OFF = 256;   // tile index = floor(x / TILE) + TILE_OFF (never negative inside the region)
export const KIND = { house: 0, villa: 1, shop: 2, office: 3, apartment: 4, industrial: 5, tower: 6 };
const C = 4;   // metres per raster cell
const SKIP = new Set(['motorway', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);   // sound walls and ramps: nothing faces them
const RANK = { trunk: 0, primary: 0, secondary: 0, tertiary: 1, residential: 2 };
const ORDER = { trunk: 0, primary: 1, secondary: 2, tertiary: 3, residential: 4 };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// a stable number in [0, 1) from three integers (no shared random sequence: a change in one place never reorders another)
function hash(a, b, c) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x7f4a7c15) | 0, 0xc2b2ae35) ^ Math.imul((c + 0x165667b1) | 0, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const strHash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) | 0; return h; };

// the size, floors and kind of the building at a frontage (rank 0 arterial, 1 collector, 2 street); null leaves the place empty
function pick(u, c) {
  const z = c.zone, type = z ? z.type : null, t = z ? z.t : 0, r1 = u(1), r2 = u(2), r3 = u(3), r4 = u(4);
  if (c.urb < 0.06) return null;
  if (type === 'industrial' || type === 'port') return { kind: KIND.industrial, w: lerp(28, 90, r1), d: lerp(24, 60, r2), fl: 1 + Math.floor(r3 * 3), gap: lerp(4, 14, r4) };
  if (type === 'aptHigh' && t > 0.2 && c.rank < 2 && r4 < 0.6) return { kind: KIND.tower, w: lerp(26, 36, r1), d: lerp(26, 36, r2), fl: Math.round(lerp(z.fl[0], z.fl[1], r3 ** 1.5)), gap: lerp(20, 45, r4) };
  const office = type === 'core' || type === 'tech' || type === 'mixed';
  if (office && t > 0.2 && c.rank < 2) return { kind: KIND.office, w: lerp(16, 38, r1), d: lerp(20, 36, r2), fl: Math.max(5, Math.round(lerp(z.fl[0], z.fl[1], r3 ** 1.4) * (0.5 + 0.5 * t))), gap: lerp(0, 6, r4) };
  if (c.rank < 2) return { kind: KIND.shop, w: lerp(7, 16, r1), d: lerp(14, 22, r2), fl: 2 + Math.floor(r3 * (c.urb > 0.6 ? 5 : 2)), gap: lerp(0, 1.5, r4) };
  if (office && t > 0.4 && r4 < 0.5) return { kind: KIND.office, w: lerp(14, 24, r1), d: lerp(16, 26, r2), fl: 5 + Math.floor(r3 * z.fl[1] * 0.5), gap: lerp(0.5, 3, r1) };
  if (c.urb < 0.2) return r3 < 0.5 ? { kind: KIND.house, w: lerp(7, 12, r1), d: lerp(8, 12, r2), fl: 1 + Math.floor(r4 * 1.6), gap: lerp(10, 40, r4) } : null;
  if (r3 < 0.6) return { kind: KIND.house, w: lerp(7, 12.5, r1), d: lerp(9, 14, r2), fl: 2 + Math.floor(r4 * 2), gap: lerp(0.4, 2, r4) };
  return { kind: KIND.villa, w: lerp(12, 20, r1), d: lerp(13, 18, r2), fl: 4 + Math.floor(r4 * 2), gap: lerp(0.8, 3, r4) };
}

export function makeBuildings(R, { exclude = [] } = {}) {
  const g = R.g, x0 = R.x0, z0 = R.z0, x1 = x0 + (R.nx - 1) * g, z1 = z0 + (R.nz - 1) * g;
  const W = Math.ceil((x1 - x0) / C), H = Math.ceil((z1 - z0) / C), occ = new Uint8Array(W * H);   // 0 free, 1 water, 2 road, 3 steep, 4 keep zone or excluded
  const cx2i = (x) => Math.floor((x - x0) / C), cz2j = (z) => Math.floor((z - z0) / C);

  // ---- 1. occupancy
  // water, one 16 m cell wider than it is (the raster of the water is coarse), and steep ground
  const nx = R.nx, nz = R.nz, wet = new Uint8Array(nx * nz);
  for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const k = j * nx + i; if (!R.water[k]) continue;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) wet[k + b * nx + a] = 1;
  }
  const fillCells = (i0, j0, i1, j1, v) => { for (let j = Math.max(0, j0); j < Math.min(H, j1); j++) { const row = j * W; for (let i = Math.max(0, i0); i < Math.min(W, i1); i++) occ[row + i] = v; } };
  const per = g / C;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; let v = 0;
    if (wet[k]) v = 1;
    else if (i > 0 && j > 0 && i < nx - 1 && j < nz - 1) {
      const sx = (R.h[k + 1] - R.h[k - 1]) / 10 / (2 * g), sz = (R.h[k + nx] - R.h[k - nx]) / 10 / (2 * g);
      if (Math.hypot(sx, sz) > 0.3) v = 3;
    }
    if (v) fillCells(Math.round((i - 0.5) * per), Math.round((j - 0.5) * per), Math.round((i + 0.5) * per), Math.round((j + 0.5) * per), v);
  }
  // the keep zone (the hand-made city, until WLD-24c) and the places that have a city of their own
  const keepR = KEEP + BAND;
  fillCells(cx2i(-keepR), cz2j(-keepR), cx2i(keepR) + 1, cz2j(keepR) + 1, 4);
  for (const e of exclude) for (let j = cz2j(e.z - e.r); j <= cz2j(e.z + e.r); j++) for (let i = cx2i(e.x - e.r); i <= cx2i(e.x + e.r); i++) {
    if (i >= 0 && j >= 0 && i < W && j < H && Math.hypot(x0 + (i + 0.5) * C - e.x, z0 + (j + 0.5) * C - e.z) < e.r) occ[j * W + i] = 4;
  }
  // road corridors: the carriageway, a pavement of 2.5 m and 2.1 m for the cell size; tunnels are left (a building may stand over them)
  const DC = 128, DW = Math.ceil((x1 - x0) / DC), DH = Math.ceil((z1 - z0) / DC), dens = new Float32Array(DW * DH);
  for (const r of R.roads) {
    const rad = r.half + 4.6, n = r.x.length, street = !SKIP.has(r.hw);
    for (let i = 0; i + 1 < n; i++) {
      const ax = r.x[i], az = r.z[i], bx = r.x[i + 1], bz = r.z[i + 1], len = Math.hypot(bx - ax, bz - az);
      if (street) { const di = Math.floor(((ax + bx) / 2 - x0) / DC), dj = Math.floor(((az + bz) / 2 - z0) / DC); if (di >= 0 && dj >= 0 && di < DW && dj < DH) dens[dj * DW + di] += len; }
      if (r.cls[i] === 2 && r.cls[i + 1] === 2) continue;
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const i0 = cx2i(Math.min(ax, bx) - rad), i1 = cx2i(Math.max(ax, bx) + rad), j0 = cz2j(Math.min(az, bz) - rad), j1 = cz2j(Math.max(az, bz) + rad);
      for (let j = Math.max(0, j0); j <= Math.min(H - 1, j1); j++) for (let ii = Math.max(0, i0); ii <= Math.min(W - 1, i1); ii++) {
        const px = x0 + (ii + 0.5) * C, pz = z0 + (j + 0.5) * C, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
        if (Math.hypot(px - ax - dx * t, pz - az - dz * t) <= rad) { const q = j * W + ii; if (!occ[q]) occ[q] = 2; }
      }
    }
  }
  // ---- 2. how urban a place is: street length per 128 m cell, averaged over 7 x 7 cells (about 900 m: a block without streets of its own inside a city is still the city)
  const urbA = new Float32Array(DW * DH), RAD = 3;
  for (let j = RAD; j < DH - RAD; j++) for (let i = RAD; i < DW - RAD; i++) {
    let s = 0; for (let b = -RAD; b <= RAD; b++) for (let a = -RAD; a <= RAD; a++) s += dens[(j + b) * DW + i + a];
    urbA[j * DW + i] = Math.min(1, Math.max(0, (s / ((2 * RAD + 1) ** 2) - 120) / 350));
  }
  const urbAt = (x, z) => { const i = Math.floor((x - x0) / DC), j = Math.floor((z - z0) / DC); return i >= 0 && j >= 0 && i < DW && j < DH ? urbA[j * DW + i] : 0; };

  // ---- placed buildings and the exact overlap test
  const B = { cx: [], cz: [], w: [], d: [], rot: [], fl: [], kind: [], notch: [] }, cellsOf = new Map(), HC = 32, hk = (a, b) => (a + 8192) * 16384 + (b + 8192);
  const sat = (i, cx, cz, w, d, ux, uz, gap) => {
    // two rotated rectangles apart by `gap` metres? (separating axis test on the four edge directions)
    const jx = Math.cos(B.rot[i]), jz = Math.sin(B.rot[i]), dxc = B.cx[i] - cx, dzc = B.cz[i] - cz;
    const axes = [[ux, uz], [-uz, ux], [jx, jz], [-jz, jx]];
    for (const [ax, az] of axes) {
      const r1 = Math.abs(ux * ax + uz * az) * (w / 2) + Math.abs(-uz * ax + ux * az) * (d / 2), r2 = Math.abs(jx * ax + jz * az) * (B.w[i] / 2) + Math.abs(-jz * ax + jx * az) * (B.d[i] / 2);
      if (Math.abs(dxc * ax + dzc * az) > r1 + r2 + gap) return false;
    }
    return true;
  };
  const crowded = (cx, cz, w, d, ux, uz, gap) => {
    const rr = Math.hypot(w, d) / 2 + gap + 60, a0 = Math.floor((cx - rr) / HC), a1 = Math.floor((cx + rr) / HC), b0 = Math.floor((cz - rr) / HC), b1 = Math.floor((cz + rr) / HC);
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) { const l = cellsOf.get(hk(a, b)); if (l) for (const i of l) if (sat(i, cx, cz, w, d, ux, uz, gap)) return true; }
    return false;
  };
  // is the rectangle (grown by `m`) on free ground? the cell centres inside it are looked at
  const free = (cx, cz, w, d, ux, uz, m) => {
    const hw = w / 2 + m, hd = d / 2 + m, ex = Math.abs(ux) * hw + Math.abs(uz) * hd, ez = Math.abs(uz) * hw + Math.abs(ux) * hd;
    const i0 = cx2i(cx - ex), i1 = cx2i(cx + ex), j0 = cz2j(cz - ez), j1 = cz2j(cz + ez);
    if (i0 < 0 || j0 < 0 || i1 >= W || j1 >= H) return false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!occ[j * W + i]) continue;
      const px = x0 + (i + 0.5) * C - cx, pz = z0 + (j + 0.5) * C - cz;
      if (Math.abs(px * ux + pz * uz) <= hw && Math.abs(-px * uz + pz * ux) <= hd) return false;
    }
    return true;
  };
  const place = (cx, cz, w, d, rot, fl, kind, notch) => {
    const i = B.cx.length;
    B.cx.push(cx); B.cz.push(cz); B.w.push(w); B.d.push(d); B.rot.push(rot); B.fl.push(fl); B.kind.push(kind); B.notch.push(notch);
    const ux = Math.cos(rot), uz = Math.sin(rot), ex = Math.abs(ux) * w / 2 + Math.abs(uz) * d / 2, ez = Math.abs(uz) * w / 2 + Math.abs(ux) * d / 2;
    for (let b = Math.floor((cz - ez) / HC); b <= Math.floor((cz + ez) / HC); b++) for (let a = Math.floor((cx - ex) / HC); a <= Math.floor((cx + ex) / HC); a++) { const k = hk(a, b); let l = cellsOf.get(k); if (!l) cellsOf.set(k, (l = [])); l.push(i); }
  };
  const qRot = (ang) => { let r = ang % Math.PI; if (r < 0) r += Math.PI; if (r >= Math.PI) r -= Math.PI; return Math.round(r / Math.PI * 65535) / 65535 * Math.PI; };
  const q1 = (v) => Math.round(v * 10) / 10;
  const notchOf = (h, kind, w, d) => (kind <= KIND.office && w >= 10 && d >= 10 && h < 0.22 ? ((Math.floor(h * 4 / 0.22) & 3) << 6) | (8 + Math.floor(hash(Math.floor(w * 10), Math.floor(d * 10), 5) * 22)) : 0);

  // ---- 3. apartment complexes: free ground far from any road. A coarse distance (8 m cells, chamfer) from everything that is not free.
  const FC = 8, FW = Math.ceil(W / 2), FH = Math.ceil(H / 2), dist = new Uint8Array(FW * FH);
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) { let v = 255; const a = i * 2, b = j * 2; if (occ[b * W + a] || (a + 1 < W && occ[b * W + a + 1]) || (b + 1 < H && occ[(b + 1) * W + a]) || (a + 1 < W && b + 1 < H && occ[(b + 1) * W + a + 1])) v = 0; dist[j * FW + i] = v; }
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) { const k = j * FW + i; let v = dist[k]; if (!v) continue; if (i === 0 || j === 0) { dist[k] = 1; continue; } v = Math.min(v, dist[k - 1] + 3, dist[k - FW] + 3, dist[k - FW - 1] + 4, i + 1 < FW ? dist[k - FW + 1] + 4 : 255); dist[k] = Math.min(255, v); }
  for (let j = FH - 1; j >= 0; j--) for (let i = FW - 1; i >= 0; i--) { const k = j * FW + i; let v = dist[k]; if (!v) continue; if (i === FW - 1 || j === FH - 1) { dist[k] = Math.min(v, 1); continue; } v = Math.min(v, dist[k + 1] + 3, dist[k + FW] + 3, dist[k + FW + 1] + 4, i > 0 ? dist[k + FW - 1] + 4 : 255); dist[k] = v; }
  const farFrom = (x, z) => { const i = Math.floor((x - x0) / FC), j = Math.floor((z - z0) / FC); return i >= 0 && j >= 0 && i < FW && j < FH ? dist[j * FW + i] * FC / 3 : 0; };   // metres to the nearest occupied cell (chamfer 3-4)
  const nearWater = (x, z, rad) => { for (let q = 0; q < 8; q++) { const a = q * Math.PI / 4, i = cx2i(x + Math.cos(a) * rad), j = cz2j(z + Math.sin(a) * rad); if (i >= 0 && j >= 0 && i < W && j < H && occ[j * W + i] === 1) return true; } return false; };
  const ROW = 56, PITCH = 100;
  const rowMin = Math.ceil(z0 / ROW), rowMax = Math.floor(z1 / ROW);
  for (let rj = rowMin; rj <= rowMax; rj++) {
    const zc = rj * ROW, shift = hash(rj, 7, 1) * PITCH;
    for (let ci = Math.floor((x0 - shift) / PITCH); ci <= Math.floor((x1 - shift) / PITCH); ci++) {
      const xc = ci * PITCH + shift; if (xc < x0 || xc > x1) continue;
      const urb = urbAt(xc, zc); if (urb < 0.5) continue;
      if (farFrom(xc, zc) < 26) continue;
      const zone = districtAt(xc, zc); if (zone && zone.block) continue;
      const u = (q) => hash(rj, ci, q);
      if (u(0) > 0.9 || nearWater(xc, zc, 90)) continue;
      const tower = zone && zone.type === 'aptHigh' ? u(1) < 0.5 : u(1) < 0.1, fl0 = zone && (zone.type === 'aptHigh' || zone.type === 'apt') ? zone.fl : [12, 22];
      const w = tower ? lerp(28, 36, u(2)) : lerp(45, 80, u(2)), d = tower ? lerp(28, 36, u(3)) : lerp(12, 14, u(3)), fl = Math.round(lerp(fl0[0], fl0[1], u(4) ** 1.2));
      const cx = xc + lerp(-8, 8, u(5)), cz = zc, rot = qRot(0);
      if (!free(cx, cz, w, d, 1, 0, 8) || crowded(cx, cz, w, d, 1, 0, 14)) continue;
      place(cx, cz, q1(w), q1(d), rot, fl, tower ? KIND.tower : KIND.apartment, 0);
    }
  }
  const apartments = B.cx.length;

  // ---- 4. frontage lots along the roads, highest class first
  const roads = R.roads.map((r, i) => i).filter((i) => ORDER[R.roads[i].hw] !== undefined && !SKIP.has(R.roads[i].hw));
  roads.sort((a, b) => ORDER[R.roads[a].hw] - ORDER[R.roads[b].hw] || (R.roads[a].id < R.roads[b].id ? -1 : R.roads[a].id > R.roads[b].id ? 1 : 0));
  for (const ri of roads) {
    const r = R.roads[ri], n = r.x.length; if (n < 2) continue;
    const cum = new Float64Array(n); for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(r.x[i] - r.x[i - 1], r.z[i] - r.z[i - 1]);
    const total = cum[n - 1]; if (total < 14) continue;
    const rid = strHash(r.id), rank = RANK[r.hw], set = rank === 0 ? 5.8 : 5.3;
    const seg = (s) => { let lo = 0, hi = n - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1; } return lo; };
    const pos = (s) => { const i = seg(s), t = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1); return [r.x[i] + (r.x[i + 1] - r.x[i]) * t, r.z[i] + (r.z[i + 1] - r.z[i]) * t, i]; };
    for (const side of [-1, 1]) {
      let s = 2 + hash(rid, side, 999) * 8, k = 0;
      while (s + 6 < total) {
        k++;
        const u = (q) => hash(rid, side * 1000 + (k & 0xffff), q);
        const [px, pz, pi] = pos(Math.min(total, s + 8));
        if (r.cls[pi] || r.cls[pi + 1]) { s += 20; continue; }
        const zone = districtAt(px, pz);
        if (zone && zone.block) { s += 40; continue; }
        const b = pick(u, { rank, zone, urb: urbAt(px, pz) });
        if (!b) { s += 24; continue; }
        if (s + b.w > total) break;
        const [ax, az] = pos(s), [bx, bz] = pos(s + b.w), [mx, mz] = pos(s + b.w / 2), tl = Math.hypot(bx - ax, bz - az) || 1;
        let tx = (bx - ax) / tl, tz = (bz - az) / tl;
        const rot = qRot(Math.atan2(tz, tx)); tx = Math.cos(rot); tz = Math.sin(rot);
        // the lot's front faces the road: step from the centre line out along the normal (the side the rotation did not flip is the one asked for)
        const nxv = -Math.sin(Math.atan2(bz - az, bx - ax)) * side, nzv = Math.cos(Math.atan2(bz - az, bx - ax)) * side;
        const w = q1(b.w), d = q1(b.d), off = r.half + set + d / 2, cx = q1(mx + nxv * off), cz = q1(mz + nzv * off);
        if (!free(cx, cz, w, d, tx, tz, 0.5) || crowded(cx, cz, w, d, tx, tz, 0.5)) { s += 5 + u(7) * 4; continue; }
        place(cx, cz, w, d, rot, b.fl, b.kind, notchOf(u(6), b.kind, w, d));
        s += b.w + b.gap;
      }
    }
  }
  // ---- 5. infill: the second row of a deep block, in the direction of the nearest lot (a 16 m lattice over the urban ground)
  const nearestRot = (x, z) => {
    let best = -1, bd = 80 * 80;
    for (let b = Math.floor((z - 80) / HC); b <= Math.floor((z + 80) / HC); b++) for (let a = Math.floor((x - 80) / HC); a <= Math.floor((x + 80) / HC); a++) {
      const l = cellsOf.get(hk(a, b)); if (l) for (const i of l) { if (B.kind[i] === KIND.apartment || B.kind[i] === KIND.tower) continue; const d2 = (B.cx[i] - x) ** 2 + (B.cz[i] - z) ** 2; if (d2 < bd) { bd = d2; best = i; } }
    }
    return best;
  };
  const before = B.cx.length, LAT = 16, jMin = Math.ceil(z0 / LAT), jMax = Math.floor(z1 / LAT);
  for (let lj = jMin; lj <= jMax; lj++) for (let li = Math.ceil(x0 / LAT); li <= Math.floor(x1 / LAT); li++) {
    const u = (q) => hash(lj, li, 77 + q), x = li * LAT + (u(1) - 0.5) * 10, z = lj * LAT + (u(2) - 0.5) * 10;
    const urb = urbAt(x, z); if (urb < 0.35 || u(0) > 0.85) continue;
    const zone = districtAt(x, z); if (zone && zone.block) continue;
    const nb = nearestRot(x, z); if (nb < 0) continue;
    const b = pick(u, { rank: 2, zone, urb }); if (!b || b.kind === KIND.industrial || b.kind === KIND.tower) continue;
    const rot = B.rot[nb], ux = Math.cos(rot), uz = Math.sin(rot), w = q1(b.w), d = q1(b.d), cx = q1(x), cz = q1(z);
    if (!free(cx, cz, w, d, ux, uz, 1) || crowded(cx, cz, w, d, ux, uz, 1.2)) continue;
    place(cx, cz, w, d, rot, b.fl, b.kind, notchOf(u(6), b.kind, w, d));
  }
  const probe = (x, z) => ({ occ: occ[cz2j(z) * W + cx2i(x)], urb: urbAt(x, z), far: farFrom(x, z), zone: districtAt(x, z), nb: nearestRot(x, z) });
  return { B, count: B.cx.length, apartments, infill: B.cx.length - before, W, H, probe };
}

// ---- output: the buildings of each 512 m tile, in the order they were made (their number in the tile is part of the building's uid)
export function toTiles(res) {
  const { B } = res, byTile = new Map();
  for (let i = 0; i < B.cx.length; i++) {
    const ti = Math.floor(B.cx[i] / TILE) + TILE_OFF, tj = Math.floor(B.cz[i] / TILE) + TILE_OFF, key = `${ti}_${tj}`;
    let t = byTile.get(key); if (!t) byTile.set(key, (t = []));
    t.push(i);
  }
  const tiles = {};
  for (const key of [...byTile.keys()].sort()) {
    const [ti, tj] = key.split('_').map(Number), ids = byTile.get(key), n = ids.length, ox = (ti - TILE_OFF) * TILE + TILE / 2, oz = (tj - TILE_OFF) * TILE + TILE / 2;
    const t = { n, cx: new Int16Array(n), cz: new Int16Array(n), w: new Uint16Array(n), d: new Uint16Array(n), rot: new Uint16Array(n), fl: new Uint8Array(n), kind: new Uint8Array(n), notch: new Uint8Array(n) };
    ids.forEach((i, q) => {
      t.cx[q] = Math.round((B.cx[i] - ox) * 10); t.cz[q] = Math.round((B.cz[i] - oz) * 10); t.w[q] = Math.round(B.w[i] * 10); t.d[q] = Math.round(B.d[i] * 10);
      t.rot[q] = Math.round(B.rot[i] / Math.PI * 65535); t.fl[q] = Math.min(255, B.fl[i]); t.kind[q] = B.kind[i]; t.notch[q] = B.notch[i];
    });
    tiles[key] = t;
  }
  return tiles;
}
export const uidOf = (key, n) => `KR-${key}-${n}`;

// a stored tile back to numbers (local metres): what the tests and the renderer (WLD-24b) read
export function readTile(key, t) {
  const [ti, tj] = key.split('_').map(Number), ox = (ti - TILE_OFF) * TILE + TILE / 2, oz = (tj - TILE_OFF) * TILE + TILE / 2, out = [];
  for (let q = 0; q < t.n; q++) out.push({ uid: uidOf(key, q), x: ox + t.cx[q] / 10, z: oz + t.cz[q] / 10, w: t.w[q] / 10, d: t.d[q] / 10, rot: t.rot[q] / 65535 * Math.PI, fl: t.fl[q], kind: t.kind[q], notch: t.notch[q] });
  return out;
}

export function writeBuildings(file, tiles, stats) {
  fs.writeFileSync(file, zlib.deflateRawSync(encodeChunk({ tile: TILE, off: TILE_OFF, tiles, stats }), { level: 9 }));
  return fs.statSync(file).size;
}
export function readBuildings(file) {
  if (!fs.existsSync(file)) return null;
  return decodeChunk(new Uint8Array(zlib.inflateRawSync(fs.readFileSync(file))));
}

// ---- command line: node build/world/blocks.mjs [region.bin] [out dir]
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'), dir = path.join(root, 'build/baked/world/capital');
  const file = process.argv[2] || path.join(dir, 'region.bin'), out = process.argv[3] || dir;
  const R = readRegion(file); if (!R) { console.error('no region at ' + file); process.exit(1); }
  const { REGIONS } = await import('../../src/regions/index.js'), { CAPITAL } = await import('../../src/koreamap.js');
  const exclude = REGIONS.flatMap((r) => r.cities).filter((c) => c.def.viaRegion).map((c) => ({ x: c.def.x - CAPITAL.x, z: c.def.z - CAPITAL.z, r: c.def.r * 1.15 + 60 }));
  const t0 = Date.now(), res = makeBuildings(R, { exclude }), tiles = toTiles(res);
  const kinds = {}; for (const k of res.B.kind) kinds[k] = (kinds[k] || 0) + 1;
  const stats = { count: res.count, apartments: res.apartments, infill: res.infill, tiles: Object.keys(tiles).length, kinds, perTile: Object.fromEntries(Object.entries(tiles).map(([k, t]) => [k, t.n])), seconds: (Date.now() - t0) / 1000 };
  fs.mkdirSync(out, { recursive: true });
  const bytes = writeBuildings(path.join(out, 'buildings.bin'), tiles, { count: res.count, kinds });
  fs.writeFileSync(path.join(out, 'buildings-stats.json'), JSON.stringify(stats));
  console.log(JSON.stringify({ count: res.count, apartments: res.apartments, infill: res.infill, tiles: stats.tiles, kinds, bytes, seconds: stats.seconds }));
}
