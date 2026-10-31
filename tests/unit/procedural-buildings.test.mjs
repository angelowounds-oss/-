// The procedural buildings of the capital region (WLD-24a, build/world/blocks.mjs): they stand beside the compiled roads, never on a road, in the water
// or inside the hand-made city, never overlap each other, are tall where the district table says so, and come out the same on every run.
// Works on a cropped copy of the compiled region (about 9 x 9 km) so it takes a few seconds; skips with a note when the region was never compiled.
import path from 'node:path';
import { project, CAPITAL } from '../../src/koreamap.js';
import { readRegion, KEEP, BAND } from '../../build/world/emit.mjs';
import { makeBuildings, toTiles, readTile, KIND, TILE_OFF } from '../../build/world/blocks.mjs';

const file = path.join(path.dirname(new URL(import.meta.url).pathname), '../../build/baked/world/capital/region.bin');
const R0 = readRegion(file), bad = [], m = {};
if (!R0) {
  console.log('RESULT ' + JSON.stringify({ test: 'procedural-buildings', pass: true, metrics: {}, note: 'no compiled region (node build/world/compile.mjs --roads --emit)' }));
} else {
  // a crop: a square of the raster and the roads that touch it, in the same local frame
  const crop = (cx, cz, half) => {
    const i0 = Math.max(0, Math.floor((cx - half - R0.x0) / R0.g)), i1 = Math.min(R0.nx - 1, Math.ceil((cx + half - R0.x0) / R0.g)), j0 = Math.max(0, Math.floor((cz - half - R0.z0) / R0.g)), j1 = Math.min(R0.nz - 1, Math.ceil((cz + half - R0.z0) / R0.g));
    const nx = i1 - i0 + 1, nz = j1 - j0 + 1, h = new Int16Array(nx * nz), water = new Uint8Array(nx * nz), level = new Int16Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i, s = (j + j0) * R0.nx + i + i0; h[k] = R0.h[s]; water[k] = R0.water[s]; level[k] = R0.level[s]; }
    const roads = R0.roads.filter((r) => { for (let i = 0; i < r.x.length; i++) if (Math.abs(r.x[i] - cx) < half + 60 && Math.abs(r.z[i] - cz) < half + 60) return true; return false; });
    return { ...R0, nx, nz, x0: R0.x0 + i0 * R0.g, z0: R0.z0 + j0 * R0.g, h, water, level, roads };
  };
  const at = (lon, lat) => { const p = project(lon, lat); return { x: p.x - CAPITAL.x, z: p.z - CAPITAL.z }; };
  const gn = at(127.0276, 37.4979), R = crop(gn.x, gn.z, 4500);
  const a = makeBuildings(R, {}), b = makeBuildings(R, {});
  m.buildings = a.count; m.apartments = a.apartments; m.infill = a.infill; m.roads = R.roads.length;
  if (a.count < 5000) bad.push(['too few buildings in 9 x 9 km of Gangnam', a.count]);
  // 1. the same input gives the same output
  const A = JSON.stringify(a.B), Bj = JSON.stringify(b.B); if (A !== Bj) bad.push(['two runs differ']);
  // 2. every building is a real rectangle, and the tile record round-trips (0.1 m, 16 bit rotation)
  const tiles = toTiles(a), ids = new Set(); let total = 0;
  const list = [];
  for (const [key, t] of Object.entries(tiles)) for (const bd of readTile(key, t)) { total++; ids.add(bd.uid); list.push(bd); }
  m.tiles = Object.keys(tiles).length;
  if (total !== a.count) bad.push(['tile records lose buildings', total, a.count]);
  if (ids.size !== total) bad.push(['uid not unique', ids.size, total]);
  // 3. no building in the keep zone, in the water or on a carriageway: exact tests on the stored rectangles
  const keepR = KEEP + BAND, corners = (q) => { const ux = Math.cos(q.rot), uz = Math.sin(q.rot); return [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([s, t]) => [q.x + (s * q.w / 2) * ux - (t * q.d / 2) * uz, q.z + (s * q.w / 2) * uz + (t * q.d / 2) * ux]); };
  const CS = 64, grid = new Map(), K = (i, j) => i * 100003 + j;
  for (const r of R.roads) for (let i = 0; i + 1 < r.x.length; i++) {
    if (r.cls[i] === 2 && r.cls[i + 1] === 2) continue;   // a tunnel: the ground above it is free
    for (let ci = Math.floor((Math.min(r.x[i], r.x[i + 1]) - r.half - 2) / CS); ci <= Math.floor((Math.max(r.x[i], r.x[i + 1]) + r.half + 2) / CS); ci++)
      for (let cj = Math.floor((Math.min(r.z[i], r.z[i + 1]) - r.half - 2) / CS); cj <= Math.floor((Math.max(r.z[i], r.z[i + 1]) + r.half + 2) / CS); cj++) { const k = K(ci, cj); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(r, i); }
  }
  const onRoad = (x, z) => {
    const l = grid.get(K(Math.floor(x / CS), Math.floor(z / CS))); if (!l) return false;
    for (let q = 0; q < l.length; q += 2) {
      const r = l[q], i = l[q + 1], ax = r.x[i], az = r.z[i], dx = r.x[i + 1] - ax, dz = r.z[i + 1] - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < r.half) return true;
    }
    return false;
  };
  const wetAt = (x, z) => { const i = Math.round((x - R.x0) / R.g), j = Math.round((z - R.z0) / R.g); return i >= 0 && j >= 0 && i < R.nx && j < R.nz && R.water[j * R.nx + i] > 0; };
  let keep = 0, wet = 0, road = 0;
  for (const q of list) for (const [x, z] of corners(q)) {
    if (Math.max(Math.abs(x), Math.abs(z)) < keepR) keep++;
    if (wetAt(x, z)) wet++;
    if (onRoad(x, z)) road++;
  }
  m.keep = keep; m.wet = wet; m.onRoad = road;
  if (keep) bad.push(['building corners inside the hand-made city', keep]);
  if (wet) bad.push(['building corners in the water', wet]);
  if (road) bad.push(['building corners on a carriageway', road]);
  // 4. no two buildings overlap (separating axes on the stored rectangles; the storage rounds to 0.1 m, so 0.15 m of slack)
  const hash = new Map(), HC = 64; list.forEach((q, i) => { const r = Math.hypot(q.w, q.d) / 2; for (let ci = Math.floor((q.x - r) / HC); ci <= Math.floor((q.x + r) / HC); ci++) for (let cj = Math.floor((q.z - r) / HC); cj <= Math.floor((q.z + r) / HC); cj++) { const k = K(ci, cj); let l = hash.get(k); if (!l) hash.set(k, (l = [])); l.push(i); } });
  const hit = (p, q) => {
    const ax = [[Math.cos(p.rot), Math.sin(p.rot)], [-Math.sin(p.rot), Math.cos(p.rot)], [Math.cos(q.rot), Math.sin(q.rot)], [-Math.sin(q.rot), Math.cos(q.rot)]];
    for (const [x, z] of ax) {
      const rp = Math.abs(Math.cos(p.rot) * x + Math.sin(p.rot) * z) * p.w / 2 + Math.abs(-Math.sin(p.rot) * x + Math.cos(p.rot) * z) * p.d / 2, rq = Math.abs(Math.cos(q.rot) * x + Math.sin(q.rot) * z) * q.w / 2 + Math.abs(-Math.sin(q.rot) * x + Math.cos(q.rot) * z) * q.d / 2;
      if (Math.abs((q.x - p.x) * x + (q.z - p.z) * z) > rp + rq - 0.15) return false;
    }
    return true;
  };
  let overlap = 0; const seen = new Set();
  for (const l of hash.values()) for (let u = 0; u < l.length; u++) for (let v = u + 1; v < l.length; v++) { const k = l[u] * 4000000 + l[v]; if (seen.has(k)) continue; seen.add(k); if (hit(list[l[u]], list[l[v]])) overlap++; }
  m.overlap = overlap; if (overlap) bad.push(['overlapping buildings', overlap]);
  // 5. the district table: offices and tall buildings in Gangnam, low houses far out
  const near = list.filter((q) => Math.hypot(q.x - gn.x, q.z - gn.z) < 1500), mean = (l) => l.reduce((s, q) => s + q.fl, 0) / Math.max(1, l.length);
  const edge = list.filter((q) => Math.hypot(q.x - gn.x, q.z - gn.z) > 3600);
  m.meanFloorsCentre = +mean(near).toFixed(1); m.meanFloorsEdge = +mean(edge).toFixed(1); m.maxFloors = Math.max(...list.map((q) => q.fl));
  if (!(mean(near) > mean(edge) + 1.5)) bad.push(['the district is not taller than its edge', mean(near), mean(edge)]);
  if (!near.some((q) => q.kind === KIND.office && q.fl >= 15)) bad.push(['no high office building in Gangnam']);
  if (m.maxFloors > 80) bad.push(['a building is taller than 80 floors', m.maxFloors]);
  const small = list.filter((q) => q.w < 3 || q.d < 3 || q.w > 120 || q.d > 120); if (small.length) bad.push(['building footprint out of range', small.length]);
  // 6. the hills stay empty: the real Namsan (262 m) and Bukhansan summit have no building within 80 m
  for (const [name, lon, lat] of [['남산', 126.9882, 37.5512], ['백운대', 126.9886, 37.6591]]) {
    const p = at(lon, lat), c = crop(p.x, p.z, 2500), r = makeBuildings(c, {}), n = r.B.cx.filter((x, i) => Math.hypot(x - p.x, r.B.cz[i] - p.z) < 80).length;
    m['near' + name] = n; if (n) bad.push(['a building on the summit of ' + name, n]);
  }
  console.log('RESULT ' + JSON.stringify({ test: 'procedural-buildings', pass: bad.length === 0, metrics: m, note: bad.length ? JSON.stringify(bad) : '' }));
  process.exitCode = bad.length ? 1 : 0;
}
