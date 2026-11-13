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
      for (const o of N.roads) { if (o.kind !== 'arterial' || !o.oneway || !o.ref || (o.hw !== 'motorway' && o.hw !== 'trunk')) continue; for (let j = 0; j < o.x.length; j++) { const k = Math.floor(o.x[j] / MED_GRID) * 100003 + Math.floor(o.z[j] / MED_GRID); (g.get(k) || g.set(k, []).get(k)).push(o, j); } }
    }
    const X = r.x, Z = r.z, n = X.length, med = (r.med = new Float32Array(n)), half = carriage(r).half;
    for (let s = 0; s < n; s++) {
      const a = Math.max(0, s - 1), b = Math.min(n - 1, s + 1); let tx = X[b] - X[a], tz = Z[b] - Z[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      let best = 0, bd = Infinity; const cx = Math.floor(X[s] / MED_GRID), cz = Math.floor(Z[s] / MED_GRID);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const l2 = N.medGrid.get((cx + dx) * 100003 + cz + dz); if (!l2) continue;
        for (let q = 0; q < l2.length; q += 2) {
          const o = l2[q], j = l2[q + 1]; if (o === r || o.ref !== r.ref || o.hw !== r.hw || Math.abs(o.y[j] - r.y[s]) > 3) continue;
          const A = Math.max(0, j - 1), B = Math.min(o.x.length - 1, j + 1); if ((o.x[B] - o.x[A]) * tx + (o.z[B] - o.z[A]) * tz >= 0) continue;   // the same way: a branch, not the other carriageway
          const ex = o.x[j] - X[s], ez = o.z[j] - Z[s], along = ex * tx + ez * tz, side = ex * tz - ez * tx; if (Math.abs(along) > 8) continue;
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

// Is the edge barrier at offset o (along +right) on segment f0-f1 of compiled line r to be left out? Another road's surface reaches its line, at about
// the same height, at either end or the middle (the other carriageway of the same motorway does not count: the barrier stands between the two). A
// branch of the same motorway leaving or joining it the same way does count, and so do the line's own samples 40 or more away: the ring motorway's
// tail (서울외곽순환선 100:0, samples 16,200-16,271) runs into its own start south of 구리, 0.45 m under it, and its barriers stood 0.4-0.6 m out of
// the lanes there: the traffic stopped on them and region-drive's autopilot with it. f0, f1: { x, z, y, rx, rz }; ia: f0's sample; N: the road
// network (roadnet.js net(): roads, grid (roadgrid.js), CS); halfW: the half width of a road that is neither arterial nor ramp
export function barrierGap(N, r, f0, f1, o, ia = -1, halfW = 17.5) {
  const CS = N.CS, ux = f1.x - f0.x, uz = f1.z - f0.z;
  for (const u of [0, 0.5, 1]) {
    const x = f0.x + (f1.x - f0.x) * u + (f0.rx + (f1.rx - f0.rx) * u) * o, z = f0.z + (f1.z - f0.z) * u + (f0.rz + (f1.rz - f0.rz) * u) * o, y = f0.y + (f1.y - f0.y) * u;
    const G = N.grid, c = G.ix.get(Math.floor(x / CS) * 100003 + Math.floor(z / CS)); if (c === undefined) continue;
    for (let q = G.off[c], e = G.off[c + 1]; q < e; q++) {
      const g = G.seg[q], ri = G.segRoad[g], o2 = N.roads[ri], i = g - G.seg0[ri], di = Math.abs(i - ia);   // samples apart along r (around the loop of a closed line only)
      if ((o2 === r && (ia < 0 || (o2.closed ? Math.min(di, o2.x.length - di) : di) < 40)) || o2.cls[i] === 2) continue;
      const n = o2.x.length, B = (i + 1) % n, ax = o2.x[i], az = o2.z[i], dx = o2.x[B] - ax, dz = o2.z[B] - az;
      if (o2.ref && o2.ref === r.ref && o2.hw === r.hw && dx * ux + dz * uz < 0) continue;
      const l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const w = o2.kind === 'arterial' ? carriage(o2).half : o2.kind === 'ramp' ? 4.6 : halfW, yo = o2.y[i] + (o2.y[B] - o2.y[i]) * t;
      // at about the same height (a road over or under it is no way off). Until 2026-11 the foot of the perpendicular was read off the sample index
      // as if it were a point (A[0], A[1]): the distance was NaN and no barrier was ever left open
      if (Math.abs(yo - y) < 3 && Math.hypot(x - ax - dx * t, z - az - dz * t) < w + 0.6) return true;
    }
  }
  return false;
}

// Whether a road other than r passes under a bridge's pier at (x, z): its open surface (a tunnel runs deeper) within its half width + pad there,
// and more than `below` under the deck top `top` (a road about level with the deck is a neighbour or a merge, not beneath). Every class counts:
// the check skipped bridge samples (cls 1), so where the road beneath is itself a viaduct (서울외곽순환선 100:1 under the links near 구리 and
// 100:9) the links' piers stood in its lanes, and the motorway traffic piled into them (traffic-audit, 2026-11-13). N as barrierGap.
export function roadBeneath(N, x, z, r, pad, top, below = 1, halfW = 17.5) {
  const G = N.grid, c = G.ix.get(Math.floor(x / N.CS) * 100003 + Math.floor(z / N.CS)); if (c === undefined) return false;
  for (let q = G.off[c], e = G.off[c + 1]; q < e; q++) {
    const g = G.seg[q], ri = G.segRoad[g], o2 = N.roads[ri], i = g - G.seg0[ri]; if (o2 === r || o2.cls[i] === 2) continue;
    const n = o2.x.length, B = (i + 1) % n, ax = o2.x[i], az = o2.z[i], dx = o2.x[B] - ax, dz = o2.z[B] - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    if (o2.y[i] + (o2.y[B] - o2.y[i]) * t > top - below) continue;
    const w = o2.kind === 'arterial' ? carriage(o2).half : halfW;
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < w + pad) return true;
  }
  return false;
}
