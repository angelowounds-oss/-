import { farHeight, rivers, SEA } from './worldmap.js';
import { baseHeight } from './terrainfn.js';
import { carve, brokenAt } from './roadnet.js';
import { carveCountry } from './countrycarve.js';

// The ground height of the land outside the city as one function, pure (no three.js) so the bake can sample it into height tiles (build/jobs.mjs)
// and the page can read those tiles back (heightmap.js): `landHeight` is the ground as drawn, `physHeight` the ground the physics uses (bridges and
// tunnels filled so a vehicle has ground on the deck). Order of the layers: the world's landscape (worldmap.farHeight), the city's own hills near the
// origin, the river channels, then the road corridors and service pads (roadnet.carve).
const NEAR_BLEND0 = 1400, NEAR_BLEND1 = 9000;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- river channels: the rivers of worldmap.js are polylines [x, z, width]; the channel is cut into the ground along them
const RC = 400;   // spatial index cell (m)
let RIV = null;
function riverIndex() {
  if (RIV) return RIV;
  const grid = new Map(), segs = [], lv = [], polys = [];
  for (const r of rivers()) {
    // the water surface: a metre below the bank at each point and never rising downstream (the points run from the source to the sea)
    let run = 1e9; const L = r.pts.map((p) => { run = Math.min(run, groundNoRiver(p[0], p[1], 16) - 1.0); return Math.max(SEA + 0.1, run); });
    for (let i = 0; i + 1 < r.pts.length; i++) lv.push(L[i], L[i + 1]);
    polys.push({ pts: r.pts, lv: L });
  }
  for (const r of rivers()) for (let i = 0; i + 1 < r.pts.length; i++) {
    const A = r.pts[i], B = r.pts[i + 1], pad = Math.max(A[2], B[2]) + 260, id = segs.length / 2; segs.push(A, B);
    for (let cx = Math.floor((Math.min(A[0], B[0]) - pad) / RC); cx <= Math.floor((Math.max(A[0], B[0]) + pad) / RC); cx++) for (let cz = Math.floor((Math.min(A[1], B[1]) - pad) / RC); cz <= Math.floor((Math.max(A[1], B[1]) + pad) / RC); cz++) { const k = cx * 100003 + cz; (grid.get(k) || grid.set(k, []).get(k)).push(id); }
  }
  return (RIV = { grid, segs, lv, polys });
}
// every river as { pts: [x, z, width][], lv: water level per point } (for drawing the water)
export const riverPolys = () => riverIndex().polys;
// the nearest river centreline within reach of (x, z): { d (distance), w (width there), fx, fz (flow direction), t } or null
export function riverAt(x, z) {
  const { grid, segs, lv } = riverIndex(), c = grid.get(Math.floor(x / RC) * 100003 + Math.floor(z / RC)); if (!c) return null;
  let best = null, bd = 1e18;
  for (const id of c) {
    const A = segs[id * 2], B = segs[id * 2 + 1], dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - A[0]) * dx + (z - A[1]) * dz) / l2));
    const px = A[0] + dx * t, pz = A[1] + dz * t, d2 = (x - px) ** 2 + (z - pz) ** 2;
    if (d2 < bd) { bd = d2; const l = Math.sqrt(l2); best = { d: Math.sqrt(d2), w: A[2] + (B[2] - A[2]) * t, fx: dx / l, fz: dz / l, t, y: lv[id * 2] + (lv[id * 2 + 1] - lv[id * 2]) * t }; }
  }
  return best;
}
// the channel: its bed lies below the river's water level by a depth that grows with the width (1.9 m for a 14 m brook, 6 m from 140 m on), rounds
// off to the surrounding ground over the banks; where the land is lower than that already it stays. The channel follows the water level, not the ground,
// so a river that crosses a rise cuts a gorge instead of running dry.
export const bedDepth = (w) => Math.min(6, 1.5 + 0.03 * w);
function riverCut(x, z, h) {
  const r = riverAt(x, z); if (!r) return h;
  const half = r.w / 2, bed = r.y - bedDepth(r.w), drop = Math.max(0, h - bed);
  // the banks widen with the depth of the cut, so a river in real mountain country runs in a valley, not between 20 m walls
  const t = smooth(half * 0.45, half + 14 + Math.min(2 * drop, 200), r.d);
  return Math.min(h, bed + (h - bed) * t);
}

// the world's ground before roads: the city's hills near the origin blend into the landscape between 1.4 and 9 km
function groundNoRiver(x, z, cell) { const r = Math.hypot(x, z), w = smooth(NEAR_BLEND0, NEAR_BLEND1, r), f = farHeight(x, z, cell); return w >= 1 ? f : baseHeight(x, z) * (1 - w) + f * w; }
const groundBase = (x, z, cell) => riverCut(x, z, groundNoRiver(x, z, cell));
// the country roads are graded into the ground first (their profile reads the ground without them); highways and pads then lie over that
const withNet = (x, z, cell) => carve(x, z, groundBase(x, z, cell), false);
const graded = (x, z, cell) => (cell <= 32 ? carveCountry(x, z, groundBase(x, z, cell), groundBase, withNet) : groundBase(x, z, cell));
export const landProc = (x, z, cell = 0) => carve(x, z, graded(x, z, cell), false);
export const physProc = (x, z, cell = 0) => carve(x, z, graded(x, z, cell), true);

// the baked tiles (heightmap.js) replace the computation where they are loaded; `cell` above 32 m keeps the computation (it leaves out the fine
// octaves and the road corridors, which a coarse ring of the far land does not show anyway)
export const HM = { land: null, phys: null };
export function landHeight(x, z, cell = 0) { if (HM.land && cell <= 32) { const h = HM.land(x, z); if (h === h) return h; } return landProc(x, z, cell); }
export function physHeight(x, z, cell = 0) { if (brokenAt(x, z)) return landHeight(x, z, cell); if (HM.phys && cell <= 32) { const h = HM.phys(x, z); if (h === h) return h; } return physProc(x, z, cell); }
