// The drawn road surfaces: every module that draws a road top (highways.js lanes and chunks, streetscape.js pavements and junction asphalt,
// countryroads.js) registers its triangles here while they are drawn, and the things that must stay below or off them ask:
//  - farland.js lowers its terrain vertices under them (the 16 m terrain triangles are a coarser surface than the roads laid on the 8 m height
//    tiles, and where the bake put two roads at different heights one of them was buried: grass showed through the asphalt);
//  - highways.js leaves out an earth bank that would lie over another road;
//  - forest.js puts no tree or grass tuft on them.
// No three.js here: plain arrays, so the unit tests can load it.
//
// The triangles are kept in square cells at LEVELS sizes (16 m, 32 m: the cells of the two finest terrain rings). Each cell remembers, per road id,
// a lower bound of that road's height inside the cell (the triangle's plane at the corners of its box clipped to the cell, never under its lowest
// vertex), so a terrain vertex asks four cells for "the lowest road top anywhere in the triangles around me". The 16 m cells also keep the triangles
// themselves for exact point queries.
export const LEVELS = 2, CELL0 = 16;
const sizeOf = (l) => CELL0 << l;
const key = (i, j) => (i + 32768) * 65536 + (j + 32768);   // |x| < 500 km: i, j stay within 16 bits

const ids = new Map();          // id -> { T: Float32Array (9 per triangle), cells: [[level, key], ...] }
const grid = [];                // per level: Map key -> { by: Map id -> lower bound, min, tris: Map id -> triangle indices (level 0 only) }
for (let l = 0; l < LEVELS; l++) grid.push(new Map());
const log = [];                 // changed areas: { v, x0, z0, x1, z1 }, read by version
let version = 0;

// does the triangle (a, b, c in x, z) overlap the box [x0, x1] x [z0, z1]? (separating axes: the box's two and the triangle's three edge normals)
function overlaps(ax, az, bx, bz, cx, cz, x0, z0, x1, z1) {
  if (Math.max(ax, bx, cx) < x0 || Math.min(ax, bx, cx) > x1 || Math.max(az, bz, cz) < z0 || Math.min(az, bz, cz) > z1) return false;
  const P = [ax, az, bx, bz, cx, cz];
  for (let e = 0; e < 3; e++) {
    const px = P[e * 2], pz = P[e * 2 + 1], qx = P[((e + 1) % 3) * 2], qz = P[((e + 1) % 3) * 2 + 1], ox = P[((e + 2) % 3) * 2], oz = P[((e + 2) % 3) * 2 + 1];
    const nx = qz - pz, nz = px - qx, side = (ox - px) * nx + (oz - pz) * nz; if (side === 0) continue;
    const s = Math.sign(side);
    // every corner of the box on the other side of this edge than the triangle: separated
    if ((((x0 - px) * nx + (z0 - pz) * nz) * s < 0) && (((x1 - px) * nx + (z0 - pz) * nz) * s < 0) && (((x0 - px) * nx + (z1 - pz) * nz) * s < 0) && (((x1 - px) * nx + (z1 - pz) * nz) * s < 0)) return false;
  }
  return true;
}
// a lower bound of the triangle's height over the part of it inside the box (see the header)
function lowIn(T, o, x0, z0, x1, z1) {
  const ax = T[o], ay = T[o + 1], az = T[o + 2], bx = T[o + 3], by = T[o + 4], bz = T[o + 5], cx = T[o + 6], cy = T[o + 7], cz = T[o + 8], lo = Math.min(ay, by, cy);
  const ux = bx - ax, uz = bz - az, vx = cx - ax, vz = cz - az, det = ux * vz - uz * vx; if (Math.abs(det) < 1e-6) return lo;
  const gx = ((by - ay) * vz - (cy - ay) * uz) / det, gz = ((cy - ay) * ux - (by - ay) * vx) / det;   // the plane's slope in x and z
  const X0 = Math.max(x0, Math.min(ax, bx, cx)), X1 = Math.min(x1, Math.max(ax, bx, cx)), Z0 = Math.max(z0, Math.min(az, bz, cz)), Z1 = Math.min(z1, Math.max(az, bz, cz));
  const m = ay + Math.min(gx * (X0 - ax), gx * (X1 - ax)) + Math.min(gz * (Z0 - az), gz * (Z1 - az));
  return Math.max(lo, m);
}

// register the top triangles of road piece `id` (replacing what it had): P flat x, y, z in world metres, I triangle indices into it (or null: P is
// a plain list of triangles); `filter(t)` may leave triangle t out (a tunnel's floor is under the ground on purpose)
export function add(id, P, I = null, filter = null) {
  if (ids.has(id)) remove(id);
  const nt = I ? I.length / 3 : P.length / 9, T = []; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let t = 0; t < nt; t++) {
    if (filter && !filter(t)) continue;
    for (let v = 0; v < 3; v++) { const p = I ? I[t * 3 + v] * 3 : t * 9 + v * 3; T.push(P[p], P[p + 1], P[p + 2]); }
  }
  if (!T.length) return;
  const TT = new Float32Array(T), cells = [], n = TT.length / 9;
  for (let l = 0; l < LEVELS; l++) {
    const s = sizeOf(l), G = grid[l];
    for (let t = 0; t < n; t++) {
      const o = t * 9, ax = TT[o], az = TT[o + 2], bx = TT[o + 3], bz = TT[o + 5], cx = TT[o + 6], cz = TT[o + 8];
      const i0 = Math.floor(Math.min(ax, bx, cx) / s), i1 = Math.floor(Math.max(ax, bx, cx) / s), j0 = Math.floor(Math.min(az, bz, cz) / s), j1 = Math.floor(Math.max(az, bz, cz) / s);
      if (l === 0) { x0 = Math.min(x0, ax, bx, cx); x1 = Math.max(x1, ax, bx, cx); z0 = Math.min(z0, az, bz, cz); z1 = Math.max(z1, az, bz, cz); }
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const X0 = i * s, Z0 = j * s, X1 = X0 + s, Z1 = Z0 + s; if (!overlaps(ax, az, bx, bz, cx, cz, X0, Z0, X1, Z1)) continue;
        const k = key(i, j); let c = G.get(k); if (!c) { c = { by: new Map(), min: Infinity, tris: l === 0 ? new Map() : null }; G.set(k, c); }
        const low = lowIn(TT, o, X0, Z0, X1, Z1), had = c.by.get(id);
        if (had === undefined) { c.by.set(id, low); cells.push(l, k); } else if (low < had) c.by.set(id, low);
        if (low < c.min) c.min = low;
        if (c.tris) { let L = c.tris.get(id); if (!L) c.tris.set(id, (L = [])); L.push(t); }
      }
    }
  }
  ids.set(id, { T: TT, cells, box: [x0, z0, x1, z1] }); changed(x0, z0, x1, z1);
}
// forget road piece `id` (dropped from the scene)
export function remove(id) {
  const r = ids.get(id); if (!r) return;
  for (let q = 0; q < r.cells.length; q += 2) {
    const G = grid[r.cells[q]], k = r.cells[q + 1], c = G.get(k); if (!c) continue;
    c.by.delete(id); if (c.tris) c.tris.delete(id);
    if (!c.by.size) { G.delete(k); continue; }
    let m = Infinity; for (const v of c.by.values()) if (v < m) m = v; c.min = m;
  }
  ids.delete(id); changed(...r.box);
}
function changed(x0, z0, x1, z1) { version++; log.push({ v: version, x0, z0, x1, z1 }); if (log.length > 4096) log.splice(0, 2048); }

// the lowest road top in the 2 x 2 cells of `level` around the grid point (x, z) (a multiple of the cell size), or NaN where there is none:
// the bound a terrain vertex of the ring with that cell size must stay under, so that none of its triangles rises through a road
export function lowestAround(level, x, z) {
  const s = sizeOf(level), G = grid[level], i = Math.round(x / s), j = Math.round(z / s); let m = Infinity;
  for (let b = j - 1; b <= j; b++) for (let a = i - 1; a <= i; a++) { const c = G.get(key(a, b)); if (c && c.min < m) m = c.min; }
  return m === Infinity ? NaN : m;
}
// the height of the lowest drawn road top at (x, z), or NaN off every road; `except` leaves one road id out (a piece asking about the others)
export function topAt(x, z, except = null) {
  const c = grid[0].get(key(Math.floor(x / CELL0), Math.floor(z / CELL0))); if (!c) return NaN;
  let best = Infinity;
  for (const [id, list] of c.tris) {
    if (id === except) continue; const T = ids.get(id).T;
    for (const t of list) {
      const o = t * 9, ax = T[o], az = T[o + 2], bx = T[o + 3], bz = T[o + 5], cx = T[o + 6], cz = T[o + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(d) < 1e-9) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
      if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
      const y = u * T[o + 1] + v * T[o + 4] + w * T[o + 7]; if (y < best) best = y;
    }
  }
  return best === Infinity ? NaN : best;
}
// is (x, z) on a drawn road or within `margin` of one (a tree's trunk and crown)? Tested at the point and four around it
export function onRoad(x, z, margin = 0) {
  if (topAt(x, z) === topAt(x, z)) return true; if (!margin) return false;
  for (const [dx, dz] of [[margin, 0], [-margin, 0], [0, margin], [0, -margin]]) if (topAt(x + dx, z + dz) === topAt(x + dx, z + dz)) return true;
  return false;
}
// is any road registered in the 16 m cells touching the box? (a quick test before many point queries)
export function anyIn(x0, z0, x1, z1) {
  for (let j = Math.floor(z0 / CELL0); j <= Math.floor(z1 / CELL0); j++) for (let i = Math.floor(x0 / CELL0); i <= Math.floor(x1 / CELL0); i++) if (grid[0].has(key(i, j))) return true;
  return false;
}
// the areas changed after version `since`: a reader keeps the version it last saw; null when too much changed to say (read everything again)
export function changesSince(since) {
  if (since >= version) return [];
  if (!log.length || log[0].v > since + 1) return null;
  let a = log.length; while (a > 0 && log[a - 1].v > since) a--;
  return log.slice(a);
}
export function surfVersion() { return version; }
export function surfStats() { let tris = 0; for (const r of ids.values()) tris += r.T.length / 9; return { pieces: ids.size, tris, cells0: grid[0].size, cells1: grid[1].size, version }; }
export function surfIds() { return ids; }
// drop everything (a test starting over)
export function clearSurf() { for (const id of [...ids.keys()]) remove(id); }
if (typeof window !== 'undefined') window.__surf = { topAt, lowestAround, surfStats, surfIds, onRoad };   // test hook
