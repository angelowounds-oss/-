import { biomeAt, vn, cities, SEA } from './worldmap.js';
import { roadAt, HALF_W } from './roadnet.js';
import { landProc, riverAt } from './landfn.js';

// Where things grow (pure): one byte per 32 m cell of the world, kind << 5 | trees (0..31 per cell). The bake stores them in the tiles `veg/<i>_<j>` (128 x
// 128 cells = 4096 m); forest.js reads them and puts trees, grass and rocks in the cells by hash, so the density is data and the exact positions are free.
//   kind: 0 bare/none (sea, city, roads, snow, cliffs)  1 broadleaf forest  2 conifer forest  3 palms  4 cactus and scrub  5 dead trees and ash  6 meadow  7 rock
export const CELL = 32, VT = 128;
export const KINDS = { none: 0, broad: 1, conifer: 2, palm: 3, cactus: 4, dead: 5, meadow: 6, rock: 7 };

// the byte for the cell whose centre is (x, z)
export function vegCell(x, z) {
  const h = landProc(x, z, 16);
  if (h < SEA + 1.2) return 0;
  const sl = Math.hypot(landProc(x + 16, z, 16) - landProc(x - 16, z, 16), landProc(x, z + 16, 16) - landProc(x, z - 16, 16)) / 32;
  // no growth in the cities and their hem, on roads and their cuts, in river channels
  for (const c of cities()) { const d = Math.hypot(x - c.x, z - c.z), lim = c.id === 'neon' ? 3300 : c.r * 1.3; if (d < lim) return 0; }
  const rd = roadAt(x, z, HALF_W + 40); if (rd && rd.d < HALF_W + 24) return 0;
  const rv = riverAt(x, z); if (rv && rv.d < rv.w / 2 + 14) return 0;
  const b = biomeAt(x, z, h), clump = vn(x / 260, z / 260, 61), fine = vn(x / 60, z / 60, 62);
  const near = (kind, per) => (kind << 5) | Math.max(0, Math.min(31, Math.round(per)));
  const ripa = rv && rv.d < rv.w / 2 + 70 ? 1.6 : 1;   // denser by the water
  if (sl > 0.85) return near(7, 0);
  switch (b) {
    case 4: return near(h > 150 && clump > 0.45 ? 2 : clump > 0.62 ? 2 : 1, (14 + 10 * clump + 6 * fine) * ripa * (1 - 0.6 * Math.max(0, sl - 0.35)));
    case 5: return near(2, (clump > 0.55 ? 8 : 1.5) * (1 - 0.7 * sl) * ripa);
    case 2: return near(clump > 0.58 ? 1 : 6, (clump > 0.58 ? 6 : 0.6) * ripa);
    case 3: return near(6, (fine > 0.8 ? 0.8 : 0));
    case 1: return near(h < SEA + 6 ? 3 : 6, h < SEA + 6 ? 0.8 : 0);
    case 6: return sl > 0.55 ? near(7, 0) : near(2, 2.5 * (1 - sstep(700, 950, h)));
    case 7: return near(h < 1050 && sl < 0.6 ? 2 : 7, h < 1050 ? 1.5 : 0);
    case 8: return near(4, (fine > 0.35 ? 3 : 0.8) * (1 + clump));
    case 9: return near(5, clump > 0.4 ? 2.5 : 0.7);
    default: return 0;
  }
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// one tile of the grid: Uint8Array(VT * VT), row = z, column = x
export function vegTile(i, j) {
  const out = new Uint8Array(VT * VT), x0 = -50000 + i * VT * CELL, z0 = -50000 + j * VT * CELL;
  for (let b = 0; b < VT; b++) for (let a = 0; a < VT; a++) out[b * VT + a] = vegCell(x0 + (a + 0.5) * CELL, z0 + (b + 0.5) * CELL);
  return out;
}
