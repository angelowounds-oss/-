import { COUNTRY } from './countryplan.js';
import { net, HALF_W, CARVE_FADE, BROKEN } from './roadnet.js';

// Grading of the ground under every road and pad (KOREA-PLAN A2b, ADR-0018), one rule for all of them. Pure (no three.js): landfn.js applies it to the
// natural ground, the bake samples that into the height tiles, and the page reads the tiles back.
// Everything that shapes the ground is a "carrier" with a surface height, a flat width and a reach: a highway, ramp or ring (surface from roadnet),
// a country road (surface graded here from the ground along its centre line) and a settlement pad (a circle). Where a spot is near several carriers,
// their surfaces are averaged with a weight that falls steeply beyond a carrier's core width: on its own carriageway its surface wins, halfway between two
// the average is taken, so there is no step on the line between them, whatever their kind.
const CS = 128, PCS = 256, PAD_FADE = 30, PAD_FLAT = 8;
const STEP = 16, HW_CORE = 8, COUNTRY_CORE = 4.4, COUNTRY_FLAT = 6, COUNTRY_REACH = 30, GRADE = 0.14;   // country roads: flat 6 m each side, back to the ground at 30 m, 14% at most
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const CC = { on: true };   // the road planner switches the country roads off so it routes over the natural ground, not over its own grading
let IDX = null;
const NEAR_C = new Int32Array(24), NEAR_S = new Int32Array(24), NEAR_D = new Float64Array(24), NEAR_T = new Float64Array(24);   // scratch for blend()

// the surface of a country road: the ground along the centre line, smoothed (two passes of a +-5 sample mean), then grade-limited both ways;
// the ends are read from the ground with the highways and pads laid in, so a road meets the place it joins
function countrySurface(C, natural, atEnd) {
  const n = C.n, g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = natural(C.X[i], C.Z[i], 16);
  let y = g;
  for (let pass = 0; pass < 2; pass++) {
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - 5); k <= Math.min(n - 1, i + 5); k++) { s += y[k]; c++; } o[i] = s / c; }
    y = o;
  }
  y[0] = atEnd(C.X[0], C.Z[0]); y[n - 1] = atEnd(C.X[n - 1], C.Z[n - 1]);
  const dh = GRADE * STEP;
  for (let i = 1; i < n; i++) y[i] = Math.max(y[i - 1] - dh, Math.min(y[i - 1] + dh, y[i]));
  for (let i = n - 2; i >= 0; i--) y[i] = Math.max(y[i + 1] - dh, Math.min(y[i + 1] + dh, y[i]));
  return y;
}

function build(natural) {
  const N = net(), carriers = [], grid = new Map(), pads = new Map();
  for (const r of N.roads) {
    const n = r.pts.length;
    carriers.push({ id: r.id, n, closed: r.closed, X: Float64Array.from(r.pts, (p) => p[0]), Z: Float64Array.from(r.pts, (p) => p[1]), Y: r.y, cls: r.cls, off: 0.25, flat: HALF_W + 1, core: HW_CORE, reach: HALF_W + CARVE_FADE, country: false });
  }
  if (CC.on) for (const r of COUNTRY) {
    const n = r.p.length / 2;
    carriers.push({ id: r.id, n, closed: false, X: Float64Array.from({ length: n }, (_, i) => r.p[i * 2]), Z: Float64Array.from({ length: n }, (_, i) => r.p[i * 2 + 1]), Y: null, cls: null, off: 0, flat: COUNTRY_FLAT, core: COUNTRY_CORE, reach: COUNTRY_REACH, country: true });
  }
  carriers.forEach((C, ci) => {
    const m = C.closed ? C.n : C.n - 1;
    for (let s = 0; s < m; s++) {
      const x0 = C.X[s], z0 = C.Z[s], x1 = C.X[(s + 1) % C.n], z1 = C.Z[(s + 1) % C.n];
      for (let cx = Math.floor((Math.min(x0, x1) - C.reach) / CS); cx <= Math.floor((Math.max(x0, x1) + C.reach) / CS); cx++) for (let cz = Math.floor((Math.min(z0, z1) - C.reach) / CS); cz <= Math.floor((Math.max(z0, z1) + C.reach) / CS); cz++) {
        const k = cx * 100003 + cz; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(ci, s);
      }
    }
  });
  for (const p of N.pads) for (let cx = Math.floor((p.x - p.r - PAD_FADE) / PCS); cx <= Math.floor((p.x + p.r + PAD_FADE) / PCS); cx++) for (let cz = Math.floor((p.z - p.r - PAD_FADE) / PCS); cz <= Math.floor((p.z + p.r + PAD_FADE) / PCS); cz++) {
    const k = cx * 100003 + cz; let a = pads.get(k); if (!a) pads.set(k, (a = [])); a.push(p);
  }
  IDX = { carriers, grid, pads };
  // the country surfaces need the highways and pads of the index above (for their ends), so they come last
  const atEnd = (x, z) => blend(x, z, natural(x, z, 16), false, false);
  for (const C of carriers) if (C.country) C.Y = countrySurface(C, natural, atEnd);
}

// the weighted surface at (x, z); `fine` lets the country roads in (not the coarse far ring), `physics` fills bridges and tunnels
function blend(x, z, h, physics, fine) {
  let sa = 0, sy = 0, sm = 0;   // sum of weights, sum of weight x surface, strongest pull
  const pl = IDX.pads.get(Math.floor(x / PCS) * 100003 + Math.floor(z / PCS));
  if (pl) for (const p of pl) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + PAD_FADE) { const w = 1 - sstep(p.r - PAD_FLAT, p.r + PAD_FADE, d), e = Math.max(0, d - (p.r - PAD_FLAT)) + 1, a = w / (e * e); sa += a; sy += a * p.y; if (w > sm) sm = w; } }
  const cell = IDX.grid.get(Math.floor(x / CS) * 100003 + Math.floor(z / CS));
  if (cell) {
    let nc = 0;
    for (let q = 0; q < cell.length; q += 2) {   // the nearest segment of each carrier within its reach
      const ci = cell[q], C = IDX.carriers[ci]; if (C.country && !fine) continue;
      const s = cell[q + 1], t1 = (s + 1) % C.n, ax = C.X[s], az = C.Z[s], dx = C.X[t1] - ax, dz = C.Z[t1] - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.sqrt((x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2);
      if (d >= C.reach) continue;
      let k = 0; while (k < nc && NEAR_C[k] !== ci) k++;
      if (k === nc) { if (nc >= NEAR_C.length) continue; nc++; } else if (NEAR_D[k] <= d) continue;
      NEAR_C[k] = ci; NEAR_S[k] = s; NEAR_D[k] = d; NEAR_T[k] = t;
    }
    for (let k = 0; k < nc; k++) {
      const C = IDX.carriers[NEAR_C[k]], s = NEAR_S[k];
      if (!C.country) {   // the terrain is left alone where the road is a bridge or tunnel; the physics ground fills them unless the span is blown up
        const cls = C.cls[s];
        if (cls !== 0 && !physics) continue;
        if (physics && cls === 1 && BROKEN.has(C.id + ':' + s)) continue;
      }
      const t1 = (s + 1) % C.n, w = 1 - sstep(C.flat, C.reach, NEAR_D[k]);
      const e = Math.max(0, NEAR_D[k] - C.core) + 1, a = w / (e * e);
      sa += a; sy += a * (C.Y[s] + (C.Y[t1] - C.Y[s]) * NEAR_T[k] - C.off); if (w > sm) sm = w;
    }
  }
  return sa > 0 ? h + (sy / sa - h) * sm : h;
}

// the ground at (x, z) with every road and pad laid in; `natural(x, z, cell)` is the ground before them (read for the country road surfaces)
export function gradeGround(x, z, h, physics, natural, fine = true) {
  if (!IDX) build(natural);
  return blend(x, z, h, physics, fine && CC.on);
}
