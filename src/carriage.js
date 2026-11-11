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
