// The road network's spatial index (roadnet.js net, EV-02 stage 3): every segment of every road in each 240 m cell its box, grown by PAD, touches.
// Stored compressed-sparse-row: one Int32Array of segment numbers for all cells (`seg`), the cell's slice of it from `off[c]` to `off[c + 1]`,
// and the cell's number from its key in `ix` (a Map of numbers only). A segment number is global: road `segRoad[g]`, sample `g - seg0[road]`.
// It was a Map of one Int32Array of [road, sample] pairs per cell: 15.8 M pairs (121 MB) and 128 k typed arrays with their own buffers on the
// capital build; the same cells in the same order are now half the bytes and three buffers. Readers walk a cell as
//   const c = G.ix.get(key); if (c !== undefined) for (let q = G.off[c]; q < G.off[c + 1]; q++) { const g = G.seg[q], ri = G.segRoad[g], i = g - G.seg0[ri]; ... }
export const CS = 240, PAD = 70;
export const cellKey = (cx, cz) => cx * 100003 + cz;

// the index over roads ({x, z, closed}): two passes (count, then fill), so no per-cell array is ever built
export function buildRoadGrid(roads, cs = CS, pad = PAD) {
  const seg0 = new Int32Array(roads.length + 1);
  for (let k = 0; k < roads.length; k++) seg0[k + 1] = seg0[k] + roads[k].x.length;
  const segRoad = new Int32Array(seg0[roads.length]);
  for (let k = 0; k < roads.length; k++) segRoad.fill(k, seg0[k], seg0[k + 1]);
  // each segment's cells, in the order the old index pushed them (road, sample, cx, cz), handed to visit(key, g)
  const each = (visit) => {
    for (let k = 0; k < roads.length; k++) {
      const r = roads[k], X = r.x, Z = r.z, n = X.length, m = r.closed ? n : n - 1;
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % n, x0 = Math.floor((Math.min(X[i], X[j]) - pad) / cs), x1 = Math.floor((Math.max(X[i], X[j]) + pad) / cs), z0 = Math.floor((Math.min(Z[i], Z[j]) - pad) / cs), z1 = Math.floor((Math.max(Z[i], Z[j]) + pad) / cs);
        for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) visit(cellKey(cx, cz), seg0[k] + i);
      }
    }
  };
  const ix = new Map(), count = [];
  each((key) => { let c = ix.get(key); if (c === undefined) { c = count.length; ix.set(key, c); count.push(0); } count[c]++; });
  const off = new Int32Array(count.length + 1);
  for (let c = 0; c < count.length; c++) off[c + 1] = off[c] + count[c];
  const seg = new Int32Array(off[count.length]), at = off.slice(0, count.length);
  each((key, g) => { seg[at[ix.get(key)]++] = g; });
  return { CS: cs, ix, off, seg, segRoad, seg0 };
}
