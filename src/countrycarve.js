import { COUNTRY } from './countryplan.js';

// Grading of the country roads (KOREA-PLAN A2b): the ground along each road is cut or filled to the road surface so the 8.8 m ribbon lies level
// across the slope. Pure (no three.js): landfn.js applies it under the highways and settlement pads, so the bake and the page agree.
// The road surface is the ground along the centre line, smoothed and grade-limited; the corridor is flat to FLAT metres from the centre line
// and blends back to the natural ground over FADE metres (wide enough for the 16 m height tiles to hold it).
const STEP = 16, FLAT = 6, FADE = 24, GRADE = 0.14, CS = 64, REACH = FLAT + FADE;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const CC = { on: true };   // the road planner switches it off so it routes over the natural ground, not over its own grading
let IDX = null;
const NEAR_R = new Int32Array(16), NEAR_D = new Float64Array(16), NEAR_Y = new Float64Array(16);   // scratch for carveCountry (a spot is near a few roads at most)

// the surface height at each sample: smooth the ground along the road (two passes of a +-5 sample mean), then limit the grade both ways
function profile(r, ground, endGround) {
  const n = r.p.length / 2, g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = ground(r.p[i * 2], r.p[i * 2 + 1], 16);
  let y = g;
  for (let pass = 0; pass < 2; pass++) {
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - 5); k <= Math.min(n - 1, i + 5); k++) { s += y[k]; c++; } o[i] = s / c; }
    y = o;
  }
  // the ends meet the pads of the places and the highways they join: read from the ground with those laid in
  y[0] = endGround(r.p[0], r.p[1], 16); y[n - 1] = endGround(r.p[(n - 1) * 2], r.p[(n - 1) * 2 + 1], 16);
  const dh = GRADE * STEP;
  for (let i = 1; i < n; i++) y[i] = Math.max(y[i - 1] - dh, Math.min(y[i - 1] + dh, y[i]));
  for (let i = n - 2; i >= 0; i--) y[i] = Math.max(y[i + 1] - dh, Math.min(y[i + 1] + dh, y[i]));
  return y;
}

function index(ground, endGround) {
  const roads = COUNTRY.map((r) => ({ p: r.p, y: profile(r, ground, endGround) })), grid = new Map();
  roads.forEach((r, ri) => {
    const n = r.p.length / 2;
    for (let s = 0; s + 1 < n; s++) {
      const ax = r.p[s * 2], az = r.p[s * 2 + 1], bx = r.p[s * 2 + 2], bz = r.p[s * 2 + 3];
      for (let cx = Math.floor((Math.min(ax, bx) - REACH) / CS); cx <= Math.floor((Math.max(ax, bx) + REACH) / CS); cx++) for (let cz = Math.floor((Math.min(az, bz) - REACH) / CS); cz <= Math.floor((Math.max(az, bz) + REACH) / CS); cz++) {
        const k = cx * 100003 + cz; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(ri, s);
      }
    }
  });
  return { roads, grid };
}

// the ground at (x, z) once the roads are graded; `ground(x, z, cell)` is the natural ground the profile is read from, `endGround` the same with
// the highways and pads laid in (where a road ends)
export function carveCountry(x, z, h, ground, endGround) {
  if (!CC.on || !COUNTRY.length) return h;
  if (!IDX) IDX = index(ground, endGround);
  const cell = IDX.grid.get(Math.floor(x / CS) * 100003 + Math.floor(z / CS)); if (!cell) return h;
  // the nearest segment of each road within reach; where two roads run close (at a shared place) their surfaces are averaged by weight, so the
  // ground has no step on the line between them
  let n = 0;
  for (let q = 0; q < cell.length; q += 2) {
    const ri = cell[q], r = IDX.roads[ri], s = cell[q + 1], ax = r.p[s * 2], az = r.p[s * 2 + 1], dx = r.p[s * 2 + 2] - ax, dz = r.p[s * 2 + 3] - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.sqrt((x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2);
    if (d >= REACH) continue;
    let k = 0; while (k < n && NEAR_R[k] !== ri) k++;
    if (k === n) { if (n >= NEAR_R.length) continue; n++; }
    else if (NEAR_D[k] <= d) continue;
    NEAR_R[k] = ri; NEAR_D[k] = d; NEAR_Y[k] = r.y[s] + (r.y[s + 1] - r.y[s]) * t;
  }
  if (!n) return h;
  let sw = 0, sy = 0, wmax = 0;
  for (let k = 0; k < n; k++) { const w = 1 - sstep(FLAT, REACH, NEAR_D[k]); sw += w; sy += w * NEAR_Y[k]; if (w > wmax) wmax = w; }
  if (sw <= 0) return h;
  return h + (sy / sw - h) * wmax;
}
