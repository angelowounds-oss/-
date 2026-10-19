import { surfaceColor, biomeAt, vn, sstep, cities, SEA } from './worldmap.js';
import { roadAt, HALF_W } from './roadnet.js';
import { riverAt } from './landfn.js';
import { settlements } from './settlements.js';
import { regionWeight, regionWater } from './region.js';

// The colour of the ground at a point (pure, linear RGB): worldmap.surfaceColor (biome colour with fine noise) with what the landscape adds on top of
// it where the coarse grid cannot show it: bare rock on steep slopes and a snow line that follows the ground, patchwork fields on farmland, wet sand
// along shores and river banks, dirt along the road cuts, and a greyer hem around the cities. The bake samples this into the ground colour tiles.
const rock = [0.30, 0.27, 0.24], sand = [0.52, 0.47, 0.34], wet = [0.05, 0.09, 0.09], dirt = [0.20, 0.17, 0.13], snow = [0.82, 0.86, 0.92], hem = [0.17, 0.18, 0.17];
const CROPS = [[0.20, 0.34, 0.10], [0.36, 0.38, 0.12], [0.27, 0.19, 0.10], [0.45, 0.40, 0.13], [0.14, 0.27, 0.10], [0.31, 0.30, 0.14]];
const hash2 = (i, j) => { let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
const mixTo = (o, c, t) => { o[0] += (c[0] - o[0]) * t; o[1] += (c[1] - o[1]) * t; o[2] += (c[2] - o[2]) * t; };

export function groundColor(x, z, h, slope, out) {
  const b = surfaceColor(x, z, h, out), nz = vn(x / 90, z / 90, 41);
  if (b === 3 || (b === 2 && vn(x / 2600, z / 2600, 17) > 0.62)) {   // farmland (and some plains) in lots: a rotated grid, a crop colour per lot, a dark verge between them
    const a = 0.25 + 1.1 * Math.floor(vn(x / 9000, z / 9000, 23) * 4) / 4, ca = Math.cos(a), sa = Math.sin(a), u = (x * ca + z * sa) / 170, v = (-x * sa + z * ca) / 260, iu = Math.floor(u), iv = Math.floor(v);
    const crop = CROPS[Math.floor(hash2(iu, iv) * CROPS.length)], fu = u - iu, fv = v - iv, edge = Math.min(fu, 1 - fu, fv, 1 - fv);
    mixTo(out, crop, 0.82); const k = 0.9 + 0.2 * nz; out[0] *= k; out[1] *= k; out[2] *= k; mixTo(out, [0.07, 0.10, 0.05], 1 - sstep(0.012, 0.03, edge));
  }
  const rk = sstep(0.55, 1.0, slope); if (rk > 0 && b !== 0) mixTo(out, rock, rk * (b === 7 ? 0.6 : 0.85));
  if (h > 900) { const line = 1050 + 260 * vn(x / 3000, z / 3000, 29), sn = sstep(line, line + 220, h) * (1 - sstep(0.75, 1.3, slope)); if (sn > 0) mixTo(out, snow, sn); }
  if (h > SEA - 0.5 && h < SEA + 3.2) mixTo(out, sand, (1 - sstep(SEA + 1.2, SEA + 3.2, h)) * 0.8);
  const rw = regionWeight(x, z) >= 0.5 ? regionWater(x, z) : null; if (rw && rw.cls === 2) mixTo(out, wet, 0.9);
  const rv = riverAt(x, z);
  if (rv) { const hw = rv.w / 2; if (rv.d < hw + 10) mixTo(out, rv.d < hw ? wet : sand, rv.d < hw ? 0.9 : 0.7 * (1 - sstep(hw, hw + 10, rv.d))); }
  const rd = roadAt(x, z, HALF_W + 14), hw = rd?.road.half ?? HALF_W;   // a road's own half width (compiled lines carry theirs), the dual highway's otherwise
  if (rd && rd.d > hw - 4 && rd.d < hw + 14) mixTo(out, dirt, 0.75 * (1 - sstep(hw + 2, hw + 14, rd.d)));
  { const S = settlements();   // village ground, dirt tracks
    for (const v of S.villages) { const d = Math.hypot(x - v.x, z - v.z); if (d < v.r) mixTo(out, [0.2, 0.19, 0.16], 0.3 * (1 - sstep(v.Lh * 0.5, v.r * 0.9, d))); }
    for (const k of S.tracks) { if (x < Math.min(k[0], k[2]) - 8 || x > Math.max(k[0], k[2]) + 8 || z < Math.min(k[1], k[3]) - 8 || z > Math.max(k[1], k[3]) + 8) continue; const dx = k[2] - k[0], dz = k[3] - k[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - k[0]) * dx + (z - k[1]) * dz) / l2)), d = Math.hypot(x - k[0] - dx * t, z - k[1] - dz * t); if (d < 8) mixTo(out, dirt, 0.8 * (1 - sstep(2.5, 8, d))); } }
  const keepHem = 1 - regionWeight(x, z);   // a compiled region shows its own land use, not the capital's grey hem
  for (const c of cities()) { const d = Math.hypot(x - c.x, z - c.z); if (d < c.r * 2.6) mixTo(out, hem, keepHem * 0.4 * (1 - sstep(c.r * 1.0, c.r * 2.6, d))); }
  return b;
}
