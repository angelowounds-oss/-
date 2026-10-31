// The towers and cables of the named sea bridges (WLD-22c, ADR-0037): 인천대교 (cable-stayed, two H towers and fans of stays) and 영종대교
// (suspension, two portal towers, the main cables and their hangers). The deck itself is the compiled road (highways.js); this module only finds it
// at each bridge of the table (regions/*.js `bridges`) and stands the towers on it. Lengths along the road are at the map's scale (KOREA_SCALE) and
// heights at the terrain's (V = 1/4), as the deck's height already is. This file is the geometry alone (no three.js, so node tests read it); bridges.js
// makes the meshes and colliders. A is an accumulator with quad(a, b, c, d, colour), as highways.js has.
import { regionRoads } from './region.js';
import { CAPITAL, project, KOREA_SCALE } from './koreamap.js';
import { SEA } from './worldmap.js';

const V = 0.25, CONC = [0.62, 0.62, 0.6], STEEL = [0.78, 0.8, 0.84], CABLE = [0.86, 0.87, 0.9];

// a straight member of square section w between two points (four sides; the ends are hidden in what they join)
function beam(A, p, q, w, col) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], l = Math.hypot(dx, dy, dz) || 1, t = [dx / l, dy / l, dz / l];
  const up = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let u = [t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]]; const ul = Math.hypot(...u); u = u.map((c) => c / ul * w / 2);
  const v = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
  const at = (o, a, b) => [o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b];
  const C = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let k = 0; k < 4; k++) { const [a0, b0] = C[k], [a1, b1] = C[(k + 1) % 4]; A.quad(at(p, a0, b0), at(p, a1, b1), at(q, a1, b1), at(q, a0, b0), col); }
}

// where a bridge of the table lies on the compiled roads: the centre and the direction of its deck, the deck's highest point there, half its width
// (both carriageways) and yAt, the surface under any point of it; null when the region (or the road) is not there
export function findDeck(b) {
  const p = project(b.lon, b.lat), x = p.x - CAPITAL.x, z = p.z - CAPITAL.z, hits = [];
  for (const r of regionRoads()) {
    if (r.ref !== b.ref || r.hw !== 'motorway') continue;
    let best = -1, bd = 90; for (let i = 0; i < r.x.length; i++) { const d = Math.hypot(r.x[i] - x, r.z[i] - z); if (d < bd) { bd = d; best = i; } }
    if (best < 0 || r.cls[best] !== 1) continue;
    const a = Math.max(0, best - 2), c = Math.min(r.x.length - 1, best + 2), tl = Math.hypot(r.x[c] - r.x[a], r.z[c] - r.z[a]) || 1;
    hits.push({ r, best, x: r.x[best], z: r.z[best], y: r.y[best], tx: (r.x[c] - r.x[a]) / tl, tz: (r.z[c] - r.z[a]) / tl, half: r.half || 6 });
  }
  if (!hits.length) return null;
  // the carriageways run both ways: one direction for all, then the deck's middle and edges across it
  const t = hits[0]; let tx = 0, tz = 0; for (const h of hits) { const s = h.tx * t.tx + h.tz * t.tz < 0 ? -1 : 1; tx += h.tx * s; tz += h.tz * s; }
  const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl; const rx = tz, rz = -tx;
  let lo = Infinity, hi = -Infinity, y = -Infinity, sx = 0, sz = 0;
  for (const h of hits) { h.o = (h.x - x) * rx + (h.z - z) * rz; lo = Math.min(lo, h.o - h.half); hi = Math.max(hi, h.o + h.half); y = Math.max(y, h.y); sx += h.x; sz += h.z; }
  const mid = (lo + hi) / 2, ax = sx / hits.length, az = sz / hits.length, along = (ax - x) * tx + (az - z) * tz, cx = x + tx * along + rx * mid, cz = z + tz * along + rz * mid;
  // the road's own surface under a point (s along, o across from the centre): the carriageway on that side, its sample nearest the point (the two
  // carriageways need not stand at one height, nor the deck be level over the span)
  const yAt = (s, o) => {
    let h = hits[0]; for (const q of hits) if (Math.abs(q.o - mid - o) < Math.abs(h.o - mid - o)) h = q;
    const px = cx + tx * s + rx * o, pz = cz + tz * s + rz * o, r = h.r; let bi = h.best, bd = Infinity;
    for (let i = Math.max(0, h.best - 80); i < Math.min(r.x.length, h.best + 80); i++) { const d = Math.hypot(r.x[i] - px, r.z[i] - pz); if (d < bd) { bd = d; bi = i; } }
    return r.y[bi];
  };
  return { x: cx, z: cz, y, tx, tz, rx, rz, half: (hi - lo) / 2 + 1, yAt };
}

// the towers and cables of one bridge in A; legs collects the tower legs ({ x, z, y0, y1, w, d }) for their colliders
export function bridgeParts(b, D, A, legs) {
  const span = b.span / KOREA_SCALE, side = b.side / KOREA_SCALE, half = D.half, deck = D.y, base = SEA - 2;   // deck: its highest point
  // the tower top at its height over the sea at the terrain's scale, and at least a fifth of the main span over the deck (so a short scaled tower
  // still reads as one: 영종대교 at 1/4 is only 8 m over its deck)
  const top = Math.max(SEA + b.pylon * V, deck + span * 0.2), P = (s, o, y) => [D.x + D.tx * s + D.rx * o, y, D.z + D.tz * s + D.rz * o];
  const legW = b.type === 'suspension' ? 2.6 : 3.4, out = half + legW / 2 + 0.6;
  for (const s of [-span / 2, span / 2]) {
    for (const o of [-out, out]) { beam(A, P(s, o, base), P(s, o, top), legW, CONC); legs.push({ x: D.x + D.tx * s + D.rx * o, z: D.z + D.tz * s + D.rz * o, y0: base, y1: top, w: legW }); }
    const under = Math.min(D.yAt(s, -half / 2), D.yAt(s, half / 2)) - 1.6; beam(A, P(s, -out, under), P(s, out, under), 2.4, CONC);   // the cross beam under the deck
    beam(A, P(s, -out, top - 1.5), P(s, out, top - 1.5), 2.2, CONC);     // and the one at the top
    if (b.type === 'suspension') beam(A, P(s, -out, (deck + top) / 2), P(s, out, (deck + top) / 2), 1.6, CONC);
  }
  if (b.type === 'cable-stayed') {
    // a fan of stays from the upper third of each tower to the deck edges, over the main span and the side spans
    const n = Math.max(6, Math.round(span / 2 / 9)), a0 = deck + (top - deck) * 0.55;
    for (const s of [-1, 1]) for (const o of [-out, out]) for (let k = 1; k <= n; k++) {
      const ya = a0 + (top - 2.5 - a0) * (k / n), oe = o > 0 ? half - 0.4 : -half + 0.4;
      const u1 = s * span / 2 - s * (span / 2 - 4) * k / n, u2 = s * span / 2 + s * Math.min(side, span / 2 - 4) * k / n;
      beam(A, P(s * span / 2, o, ya), P(u1, oe, D.yAt(u1, oe) + 0.9), 0.35, CABLE);
      beam(A, P(s * span / 2, o, ya), P(u2, oe, D.yAt(u2, oe) + 0.9), 0.35, CABLE);
    }
  } else {
    // two main cables hung between the tower tops (a parabola sagging to just over the deck at mid-span), down to anchors at the side spans' ends,
    // and a hanger every 6 m
    const M = 24;
    for (const o of [-out, out]) {
      const oc = o > 0 ? half - 0.3 : -half + 0.3, d0 = D.yAt(0, oc), sag = (u) => d0 + 2 + (top - 1 - d0 - 2) * (2 * u / span) ** 2;
      for (let k = 0; k < M; k++) { const u0 = -span / 2 + span * k / M, u1 = -span / 2 + span * (k + 1) / M; beam(A, P(u0, oc + (o - oc) * (2 * Math.abs(u0) / span), sag(u0)), P(u1, oc + (o - oc) * (2 * Math.abs(u1) / span), sag(u1)), 0.7, STEEL); }
      for (const s of [-1, 1]) { const ua = s * (span / 2 + side); beam(A, P(s * span / 2, o, top - 1), P(ua, oc, D.yAt(ua, oc) + 1), 0.7, STEEL); }
      for (let u = -span / 2 + 6; u < span / 2 - 3; u += 6) { const oo = oc + (o - oc) * (2 * Math.abs(u) / span), yd = D.yAt(u, oo) + 0.8; if (sag(u) > yd + 0.5) beam(A, P(u, oo, sag(u)), P(u, oo, yd), 0.18, CABLE); }
    }
  }
  return { top };
}

