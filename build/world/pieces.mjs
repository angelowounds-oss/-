// The compiled pieces of the provinces (ADR-0044): a province whose box is wider or taller than MAX degrees is compiled in a grid of equal pieces, so
// no raster outgrows the build machine's memory (Gyeongbuk with Ulleungdo is 3.1 x 2.0 degrees, 280 x 220 km). A piece is a region of its own
// (build/baked/world/<province>~<k>/) owning the cells of its province inside its own rectangle; a small province is one piece named after it.
import { REGIONS } from '../../src/regions/index.js';

export const MAX = 1.45;
const CAP = { w: 126.45, e: 127.35, s: 37.25, n: 37.80 };   // the capital's box (compile.mjs REGIONS.capital)
// a province inside the capital's box (Seoul) would own no cell: it has no piece
const inside = (b) => b.w > CAP.w + 0.02 && b.e < CAP.e - 0.02 && b.s > CAP.s + 0.02 && b.n < CAP.n - 0.02;

// every piece in src/regions order: { name, id (the province), box (its rectangle, lon/lat) }
export const PIECES = REGIONS.filter((r) => !inside(r.box)).flatMap((r) => {
  const b = r.box, ni = Math.ceil((b.e - b.w) / MAX - 1e-9), nj = Math.ceil((b.n - b.s) / MAX - 1e-9);
  if (ni * nj === 1) return [{ name: r.id, id: r.id, box: { ...b } }];
  const out = [];
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) out.push({ name: `${r.id}~${out.length + 1}`, id: r.id, box: { w: b.w + (b.e - b.w) * i / ni, e: b.w + (b.e - b.w) * (i + 1) / ni, s: b.s + (b.n - b.s) * j / nj, n: b.s + (b.n - b.s) * (j + 1) / nj } });
  return out;
});
export const pieceOf = (name) => PIECES.find((p) => p.name === name) || null;
// the pieces of the provinces asked for (ids or piece names)
export const piecesFor = (list) => PIECES.filter((p) => list.includes(p.id) || list.includes(p.name));
