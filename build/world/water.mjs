// The water pass of the world compiler (ADR-0019, KOREA-PLAN v2 M2): sea and coast from the OpenStreetMap coastline, inland water from the water
// areas (rivers wide enough to have banks, lakes, reservoirs), written into the raster as a class per cell and the game height of its surface or bed.
// R: { nx, nz, g, x0, z0, h (real metres) }. waterPass adds R.water (0 land, 1 sea, 2 inland water) and the water level; waterHeights gives the
// game heights at a height scale V (land x V, water depths in plain metres).
import { project } from '../../src/koreamap.js';

const LAND_MIN = 1.5;     // real metres: reclaimed land and flats the elevation gives as 0 m stay above the sea
const COAST_REACH = 1500; // map metres: within this of a coastline the side of the line decides land or sea; beyond it the elevation does

// the polygon rings of a way or relation as map-cell coordinates [[i, j], ...] per member line (closed rings need not be assembled: the fill is even-odd)
function lines(e, R) {
  const toCell = (p) => { const q = project(p.lon, p.lat); return [(q.x - R.x0) / R.g, (q.z - R.z0) / R.g]; };
  if (e.type === 'way') return e.geometry ? [e.geometry.map(toCell)] : [];
  return (e.members || []).filter((m) => m.type === 'way' && m.geometry && (m.role === 'outer' || m.role === 'inner' || m.role === '')).map((m) => m.geometry.map(toCell));
}

// even-odd scanline fill of one polygon (all its lines together) into mask with value v; cell centres are at integer coordinates
function fill(mask, R, L, v) {
  let j0 = Infinity, j1 = -Infinity;
  for (const P of L) for (const [, j] of P) { if (j < j0) j0 = j; if (j > j1) j1 = j; }
  j0 = Math.max(0, Math.ceil(j0)); j1 = Math.min(R.nz - 1, Math.floor(j1));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    xs.length = 0;
    for (const P of L) for (let k = 0; k + 1 < P.length; k++) {
      const [ai, aj] = P[k], [bi, bj] = P[k + 1];
      if ((aj <= j && bj > j) || (bj <= j && aj > j)) xs.push(ai + ((j - aj) / (bj - aj)) * (bi - ai));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil(xs[k])); i <= Math.min(R.nx - 1, Math.floor(xs[k + 1])); i++) mask[j * R.nx + i] = v;
  }
}

// distance in cells to the nearest cell where on[k] is set (two-pass chamfer, 3-4 weights)
export function distanceTo(on, nx, nz) {
  const d = new Float32Array(nx * nz).fill(1e9);
  for (let k = 0; k < d.length; k++) if (on[k]) d[k] = 0;
  const relax = (k, n, w) => { if (d[n] + w < d[k]) d[k] = d[n] + w; };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (i) relax(k, k - 1, 3); if (j) { relax(k, k - nx, 3); if (i) relax(k, k - nx - 1, 4); if (i < nx - 1) relax(k, k - nx + 1, 4); } }
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; if (i < nx - 1) relax(k, k + 1, 3); if (j < nz - 1) { relax(k, k + nx, 3); if (i < nx - 1) relax(k, k + nx + 1, 4); if (i) relax(k, k + nx - 1, 4); } }
  for (let k = 0; k < d.length; k++) d[k] /= 3;
  return d;
}

// land or sea near the coast: the side of the nearest coastline segment (OpenStreetMap draws the coastline with the land on its left)
function coastSide(R, coast) {
  const segs = [], CS = 256 / R.g, grid = new Map(), key = (a, b) => a * 100003 + b;
  for (const e of coast) for (const P of lines(e, R)) for (let k = 0; k + 1 < P.length; k++) {
    const s = segs.length; segs.push([P[k], P[k + 1]]);
    const r = COAST_REACH / R.g;
    for (let a = Math.floor((Math.min(P[k][0], P[k + 1][0]) - r) / CS); a <= Math.floor((Math.max(P[k][0], P[k + 1][0]) + r) / CS); a++)
      for (let b = Math.floor((Math.min(P[k][1], P[k + 1][1]) - r) / CS); b <= Math.floor((Math.max(P[k][1], P[k + 1][1]) + r) / CS); b++) { const q = key(a, b); let l = grid.get(q); if (!l) grid.set(q, (l = [])); l.push(s); }
  }
  const side = new Int8Array(R.nx * R.nz), dist = new Float32Array(R.nx * R.nz).fill(Infinity), reach2 = (COAST_REACH / R.g) ** 2;
  for (let j = 0; j < R.nz; j++) for (let i = 0; i < R.nx; i++) {
    const l = grid.get(key(Math.floor(i / CS), Math.floor(j / CS))); if (!l) continue;
    let best = reach2, bs = -1, bc = 0;
    for (const s of l) {
      const [[ai, aj], [bi, bj]] = segs[s], dx = bi - ai, dz = bj - aj, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((i - ai) * dx + (j - aj) * dz) / l2));
      const d2 = (i - ai - dx * t) ** 2 + (j - aj - dz * t) ** 2;
      // z runs south: in (east, north) terms the cross product flips sign, so "left of the line" is cross < 0 here
      const cross = dx * (j - aj) - dz * (i - ai);
      if (d2 < best - 1e-9 || (Math.abs(d2 - best) <= 1e-9 && Math.abs(cross) > Math.abs(bc))) { best = d2; bs = s; bc = cross; }
    }
    if (bs >= 0) { side[j * R.nx + i] = bc < 0 ? 1 : -1; dist[j * R.nx + i] = Math.sqrt(best); }
  }
  return { side, dist };
}

export function waterPass(R, els) {
  const n = R.nx * R.nz, water = new Uint8Array(n);
  // inland water areas (swimming pools and the like are too small to show and are left out)
  const areas = els.filter((e) => (e.tags?.natural === 'water' && e.tags?.water !== 'pool') || e.tags?.waterway === 'riverbank');
  for (const e of areas) fill(water, R, lines(e, R), 2);
  // rivers mapped only as a line (most tributaries): a channel one cell wide along the line, so the valley floor carries its river
  let channels = 0;
  for (const e of els) {
    if (e.tags?.waterway !== 'river') continue;
    for (const P of lines(e, R)) for (let k = 0; k + 1 < P.length; k++) {
      const [ai, aj] = P[k], [bi, bj] = P[k + 1], m = Math.max(1, Math.ceil(Math.hypot(bi - ai, bj - aj) * 2));
      for (let t = 0; t <= m; t++) {
        const i = Math.round(ai + (bi - ai) * t / m), j = Math.round(aj + (bj - aj) * t / m); if (i < 0 || j < 0 || i >= R.nx || j >= R.nz) continue;
        const q = j * R.nx + i; if (!water[q]) { water[q] = 2; channels++; }
      }
    }
  }
  // the sea: the coastline's side near it, the elevation (0 m or below) away from it
  const { side, dist } = coastSide(R, els.filter((e) => e.tags?.natural === 'coastline'));
  for (let k = 0; k < n; k++) {
    const sea = side[k] ? side[k] < 0 : !(R.h[k] > 0.5);
    if (sea) water[k] = 1;
    else if (water[k] !== 2 && R.h[k] < LAND_MIN) R.h[k] = LAND_MIN;
  }
  // the distances the heights need, and the level of inland water: the lowest bank nearby, so the surface stays flat
  const fromShore = distanceTo(Uint8Array.from(water, (w) => (w === 1 ? 0 : 1)), R.nx, R.nz), fromBank = distanceTo(Uint8Array.from(water, (w) => (w === 2 ? 0 : 1)), R.nx, R.nz);
  const level = new Float32Array(n).fill(NaN), W = 4;
  for (let j = 0; j < R.nz; j++) for (let i = 0; i < R.nx; i++) {
    const k = j * R.nx + i; if (water[k] !== 2) continue;
    let lo = Infinity;   // the lowest ground of this water within W cells: the surface does not climb the noisy elevation of the river
    for (let b = Math.max(0, j - W); b <= Math.min(R.nz - 1, j + W); b++) for (let a = Math.max(0, i - W); a <= Math.min(R.nx - 1, i + W); a++) { const q = b * R.nx + a; if (water[q] === 2 && R.h[q] < lo) lo = R.h[q]; }
    level[k] = Math.max(0.5, lo);
  }
  R.water = water; R.level = level; R.coastDist = dist; R.fromShore = fromShore; R.fromBank = fromBank;
  return { areas: areas.length, channelCells: channels, coastWays: els.filter((e) => e.tags?.natural === 'coastline').length };
}

// the game height of every cell at height scale V: land scaled, the sea floor falling from the shore, inland water a level surface with a bed below it
export function waterHeights(R, V) {
  const n = R.nx * R.nz, gh = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    if (R.water[k] === 0) gh[k] = R.h[k] * V;
    else if (R.water[k] === 1) gh[k] = -1.5 - Math.min(25, (R.fromShore[k] * R.g) / 40);
    else gh[k] = R.level[k] * V - Math.min(6, 1 + 0.06 * R.fromBank[k] * R.g);   // depth grows away from the bank, 6 m at most (a swimmer's world, not scaled)
  }
  return gh;
}
