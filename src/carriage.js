// The carriageway of a compiled road line, shared by the drawing (highways.js), the routes (worldnav.js), the traffic (hwtraffic.js) and the spots
// beside the road (game.js) so a car keeps to the lane that is drawn. A line fitted to the map's walls (build/world/fit.mjs, WLD-33) carries its own half
// width: its lanes shrink to fit (never under 2.75 m, the narrowest Korean urban lane) and drop to one a way where two do not fit. An alley carries no cars.
export const LANE = 3.75, SHOULDER = 2.4, EDGE = 0.25, MIN_LANE = 2.75;

// { n lanes a way, half width, two-way?, lane width, the outer edge strip, alley? }
export function carriage(r) {
  const n0 = Math.max(1, Math.min(4, r.oneway ? r.lanes || 1 : Math.ceil((r.lanes || 2) / 2)));
  if (!r.fit || !(r.half > 0)) return r.oneway ? { n: n0, half: (n0 * LANE + SHOULDER) / 2, two: false, lane: LANE, edge: SHOULDER / 2, alley: false } : { n: n0, half: n0 * LANE + SHOULDER, two: true, lane: LANE, edge: SHOULDER, alley: false };
  const two = !r.oneway, half = r.half, way = two ? half - 0.12 : 2 * half, n = Math.max(1, Math.min(n0, Math.floor((way - EDGE) / MIN_LANE)));
  return { n, half, two, lane: Math.min(LANE, (way - EDGE) / n), edge: EDGE, alley: !!r.alley };
}

// The room toward the median of a one-way motorway or trunk carriageway at sample i: the signed offset (along the road's right, +r) of the other
// carriageway of the same road (same ref, the other way, at about the same height) where it lies closer than the two drawn halves need, else 0. The
// map's two lines of a divided road are often 12-17 m apart while each is drawn 17.4 m wide (four 3.75 m lanes and the shoulders): the median barrier
// of one stood inside the other's lanes and its traffic was wrecked on it (서울외곽순환선 at 구리). highways.js puts the barrier halfway, and the
// traffic and the routes lay their lanes inside it. N is the road network (roadnet.js net()); the gaps of a road are worked out on its first use.
const MED_GRID = 32;
export function medianGap(N, r, i) {
  if (!r.oneway || !r.ref || (r.hw !== 'motorway' && r.hw !== 'trunk')) return 0;
  if (!r.med) {
    if (!N.medGrid) {   // the samples of every one-way motorway and trunk line with a ref, on a 32 m grid
      const g = new Map(); N.medGrid = g;
      for (const o of N.roads) { if (o.kind !== 'arterial' || !o.oneway || !o.ref || (o.hw !== 'motorway' && o.hw !== 'trunk')) continue; o.pts.forEach((p, j) => { const k = Math.floor(p[0] / MED_GRID) * 100003 + Math.floor(p[1] / MED_GRID); (g.get(k) || g.set(k, []).get(k)).push(o, j); }); }
    }
    const P = r.pts, n = P.length, med = (r.med = new Float32Array(n)), half = carriage(r).half;
    for (let s = 0; s < n; s++) {
      const a = P[Math.max(0, s - 1)], b = P[Math.min(n - 1, s + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      let best = 0, bd = Infinity; const cx = Math.floor(P[s][0] / MED_GRID), cz = Math.floor(P[s][1] / MED_GRID);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const l2 = N.medGrid.get((cx + dx) * 100003 + cz + dz); if (!l2) continue;
        for (let q = 0; q < l2.length; q += 2) {
          const o = l2[q], j = l2[q + 1]; if (o === r || o.ref !== r.ref || o.hw !== r.hw || Math.abs(o.y[j] - r.y[s]) > 3) continue;
          const A = o.pts[Math.max(0, j - 1)], B = o.pts[Math.min(o.pts.length - 1, j + 1)]; if ((B[0] - A[0]) * tx + (B[1] - A[1]) * tz >= 0) continue;   // the same way: a branch, not the other carriageway
          const ex = o.pts[j][0] - P[s][0], ez = o.pts[j][1] - P[s][1], along = ex * tx + ez * tz, side = ex * tz - ez * tx; if (Math.abs(along) > 8) continue;
          if (Math.abs(side) < bd) { bd = Math.abs(side); best = side; }
        }
      }
      med[s] = bd < half + carriage(r).half + 0.5 && bd > 1 ? best : 0;
    }
  }
  return r.med[Math.max(0, Math.min(r.med.length - 1, i))];
}
// the inner (median) edge of a one-way carriageway at sample i, on its +right side: its drawn half, or halfway to the other carriageway less the
// median barrier's half width and a hand's breadth where the two are closer than that
export function innerEdge(N, r, i) { const half = carriage(r).half, g = medianGap(N, r, i); return g > 0 ? Math.min(half, g / 2 - 0.45) : half; }
