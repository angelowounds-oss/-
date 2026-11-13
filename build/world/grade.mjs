// The ground contract of the compiled region (WLD-24g): the 16 m raster is conditioned to the road surfaces so that the drawn ground, the physics ground
// and the structures agree. compile.mjs lays only the main roads in (streets follow the smoothed ground, bridges and tunnels are bridged straight over),
// which left 18 % of the road samples under the ground, 5 % of the bridge decks buried and a fifth of the tunnels with less than 3 m over them.
// The rules, in this order (a later rule never undoes an earlier one where both apply):
//   1. tunnels: from each portal inward, the samples with less than OPEN (3 m) of ground over the road become an open cut (class 0); inside, the ground is
//      filled up to COVER (8 m: the 7 m lining and a metre over it) over the road where it is lower (not in the water).
//   2. ground roads: every cell whose centre lies within half + INNER of a road on the ground takes the road's height (the nearest road decides); beyond
//      that the cut or the fill slope falls back to the original ground over twice the height difference (8 - 48 m). INNER is chosen so that the four
//      cells around any point of a road all carry the road's height: the bilinear ground then meets the road along its whole length.
//   3. bridges: away from the abutments (ABUT metres from each end of a bridge) the ground under the deck lies at least CLEAR below it; at the abutments it
//      meets the deck. The water is left alone, and a cell that carries a road on the ground (a street passing under) keeps that road's height.
//   4. the roads on the ground take the graded ground's height where they are within SNAP of it (below).
//   4b. a road the snap left steeper than its class allows (STEEP: its design grade and a quarter) is eased back along its line.
//   5. an underpass too close under a street dips deeper, within the grade, from its open approaches (below).
//   6. the cells of the roads that 4b and 5 moved follow them (after each).
//   7. the ground over a lining 5 could not lower enough is raised over it.
//   8. roads whose carriageways overlap are made one surface again (roads.mjs fuseOverlaps; the snap of 4 parts them), the ground following them.
//   9. the joins: line ends meet the road they join at its height, and a join leads only to a road at the end's height (joins.mjs).
//   node build/world/grade.mjs [region.bin]   grades the region in place (a copy of the ungraded one is kept as region-raw.bin, graded again from it)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { encodeChunk } from '../../src/bakefmt.js';
import { readRegion } from './emit.mjs';
import { CLASS, fuseOverlaps } from './roads.mjs';
import { joinPass } from './joins.mjs';

const FOLLOW = new Set(['residential', 'living_street', 'unclassified', 'service']);
// step 4b: the steepest grade a road on the ground keeps after the snap (a quarter over its design grade in roads.mjs: 7.5 % motorways, 10 % trunk and
// primary, 18.75 % streets), and how many passes spread the easing along a line. Streets and links were not eased: a street takes the graded ground
// whatever the difference, and where it passed the cells of another road at another height it took that road's height for one sample, a step of
// 1.5-6 m in 8 m at 21,000 places (GPL-19)
const STEEP = Object.fromEntries(Object.entries(CLASS).map(([k, c]) => [k, c.grade * 1.25])), EASE_PASSES = 200;
// COVER: the tunnel lining of highways.js stands 7 m over the road (its portal 9 m); a metre of ground over the ceiling keeps the terrain off it
// OPEN: with less ground than this over the road at a portal the hill is not there (the 16 m raster smooths hills down, so between OPEN and COVER the
// ground is filled up instead of opening the tunnel into a cut)
export const OPEN = 3, COVER = 8, CLEAR = 3, ABUT = 8, INNER = 12, SNAP = 2, APPROACH = 40, GRADE_VERSION = 5;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// arc length along a line, sample by sample
const arcOf = (r) => { const s = new Float64Array(r.x.length); for (let i = 1; i < r.x.length; i++) s[i] = s[i - 1] + Math.hypot(r.x[i] - r.x[i - 1], r.z[i] - r.z[i - 1]); return s; };
// the runs of consecutive samples of one class: [i0, i1]
const runsOf = (r, c) => { const out = []; let i0 = -1; for (let i = 0; i <= r.x.length; i++) { const on = i < r.x.length && r.cls[i] === c; if (on && i0 < 0) i0 = i; if (!on && i0 >= 0) { out.push([i0, i - 1]); i0 = -1; } } return out; };

// grade R (a decoded region) in place; returns the counts of what changed
export function gradeRegion(R) {
  const { nx, nz, g, x0, z0 } = R, N = nx * nz, H = new Float32Array(N); for (let k = 0; k < N; k++) H[k] = R.h[k] / 10;
  const ground = (x, z) => { const fx = (x - x0) / g, fz = (z - z0) / g, i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(nz - 2, Math.floor(fz))), u = fx - i, v = fz - j, k = j * nx + i; return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + nx] * (1 - u) + H[k + nx + 1] * u) * v; };
  const wet = (k) => R.water[k] > 0, st = { opened: 0, filled: 0, roadCells: 0, cut: 0, fill: 0, bridgeCells: 0, bridgeCut: 0 };
  // visit the cells within `reach` of segment i of line r: fn(k, d, t) with d the distance to the centre line and t the position along the segment
  const cells = (r, i, reach, fn) => {
    const ax = r.x[i], az = r.z[i], dx = r.x[i + 1] - ax, dz = r.z[i + 1] - az, l2 = dx * dx + dz * dz || 1;
    const i0 = Math.max(0, Math.floor((Math.min(ax, ax + dx) - reach - x0) / g)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, ax + dx) + reach - x0) / g));
    const j0 = Math.max(0, Math.floor((Math.min(az, az + dz) - reach - z0) / g)), j1 = Math.min(nz - 1, Math.ceil((Math.max(az, az + dz) + reach - z0) / g));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
      const x = x0 + ii * g, z = z0 + j * g, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d <= reach) fn(j * nx + ii, d, t);
    }
  };
  // ---- 1. tunnels: open the shallow ends, fill the shallow middles (the distance of each cell to the nearest tunnel is kept: step 6 does not cut down
  // the ground nearer a tunnel than to the road it lowers)
  const cover = new Float32Array(N).fill(1e9);
  for (const r of R.roads) for (const [a, b] of runsOf(r, 2)) {
    let i0 = a, i1 = b;
    // the approach road's grading (rule 2) cuts the ground near the portal down to the road over INNER metres: open until the cover clears that by a margin
    while (i0 <= i1 && ground(r.x[i0], r.z[i0]) - r.y[i0] < OPEN + 2) { r.cls[i0] = 0; i0++; st.opened++; }
    while (i1 >= i0 && ground(r.x[i1], r.z[i1]) - r.y[i1] < OPEN + 2) { r.cls[i1] = 0; i1--; st.opened++; }
    for (let i = i0; i < i1; i++) cells(r, i, r.half + 14, (k, d, t) => {
      if (d < cover[k]) cover[k] = d; const need = r.y[i] + (r.y[i + 1] - r.y[i]) * t + COVER; if (wet(k) || H[k] >= need) return;
      const w = 1 - sstep(r.half + 3, r.half + 14, d), nh = H[k] + (need - H[k]) * w; if (nh > H[k]) { H[k] = nh; st.filled++; }
    });
  }
  // ---- 2. ground roads: the nearest road's height near it, the slope back to the ground beyond
  // (the nearest road's segment and the ground before this rule are kept per cell: step 6 grades the cells again where steps 4b and 5 moved that road)
  const best = new Float32Array(N).fill(1e9), tgt = new Float32Array(N), MAXW = 48, own = new Int32Array(N).fill(-1), ownSeg = new Int32Array(N), ownT = new Float32Array(N), H0 = Float32Array.from(H);
  R.roads.forEach((r, ri) => { for (let i = 0; i + 1 < r.x.length; i++) {
    if (r.cls[i] || r.cls[i + 1]) continue;
    cells(r, i, r.half + INNER + MAXW, (k, d, t) => { const e = d - r.half; if (e < best[k]) { best[k] = e; tgt[k] = r.y[i] + (r.y[i + 1] - r.y[i]) * t; own[k] = ri; ownSeg[k] = i; ownT[k] = t; } });
  } });
  const onRoad = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    if (best[k] > 1e8 || wet(k)) continue;
    const dh = H[k] - tgt[k], W = Math.min(MAXW, Math.max(8, 2 * Math.abs(dh))), e = best[k];
    if (e <= INNER) { onRoad[k] = 1; st.roadCells++; if (dh > 0.05) st.cut++; else if (dh < -0.05) st.fill++; H[k] = tgt[k]; continue; }
    if (e > INNER + W) continue;
    H[k] = tgt[k] + dh * sstep(INNER, INNER + W, e);
  }
  // ---- 3. bridges: the clearance under the deck, the abutments meeting it (bridgeClear: also for the runs step 9 lays again)
  const bridgeClear = (r, a, b, s = arcOf(r)) => {
    const sa = s[a], sb = s[b];
    for (let i = Math.max(0, a - 1); i < Math.min(r.x.length - 1, b + 1); i++) cells(r, i, r.half + 4 + 30, (k, d, t) => {
      // under the deck itself the bridge decides (no street can pass there higher than the clearance allows); beside it a street keeps its height
      if (wet(k) || (onRoad[k] && d > r.half)) return;
      const y = r.y[i] + (r.y[i + 1] - r.y[i]) * t, si = s[i] + (s[i + 1] - s[i]) * t, end = Math.min(si - sa, sb - si);
      // the clearance grows from 0.3 m at the abutment to CLEAR beyond ABUT; the cut slopes back over 1.5 x its depth
      const clear = end <= 0 ? 0.3 : 0.3 + (CLEAR - 0.3) * sstep(0, ABUT, end), cap = y - clear; if (H[k] <= cap) return;
      const reach = r.half + 4 + Math.min(30, 1.5 * (H[k] - cap)), w = 1 - sstep(r.half + 4, reach, d); if (w <= 0) return;
      H[k] = H[k] + (cap - H[k]) * w; st.bridgeCells++; if (w > 0.99) st.bridgeCut++; own[k] = -1;   // the bridge's clearance is not graded again in 6
    });
  };
  for (const r of R.roads) { const s = arcOf(r); for (const [a, b] of runsOf(r, 1)) bridgeClear(r, a, b, s); }
  for (let k = 0; k < N; k++) R.h[k] = Math.max(-32768, Math.min(32767, Math.round(H[k] * 10)));
  // ---- 4. the roads on the ground take the graded ground's height where it is within SNAP of their own: all lines meeting at a junction then share one
  // surface (their profiles were smoothed apart), and the drawn road, the drawn ground and the physics ground are one. A larger difference is a retaining
  // wall or an embankment the 16 m raster cannot carry next to another road; the road keeps its height there (counted as `kept`).
  const G = (x, z) => { const fx = (x - x0) / g, fz = (z - z0) / g, i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(nz - 2, Math.floor(fz))), u = fx - i, v = fz - j, k = j * nx + i, h = R.h; return ((h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + nx] * (1 - u) + h[k + nx + 1] * u) * v) / 10; };
  st.snapped = 0; st.kept = 0;
  R.roads.forEach((r, ri) => { for (let i = 0; i < r.x.length; i++) {
    if (r.cls[i]) continue;
    const gy = G(r.x[i], r.z[i]), d = r.y[i] - gy; if (Math.abs(d) <= 0.02) continue;
    // a street follows the ground by design (roads.mjs lay: false): it takes the graded ground whatever the difference
    if (Math.abs(d) <= SNAP || FOLLOW.has(r.hw)) { r.y[i] = gy; st.snapped++; } else st.kept++;
  } });
  // ---- 4b. the snap must not step a road: where two lines share cells (the two carriageways of a motorway, a road and its frontage road, a
  // junction) the raster mixes their heights and the snapped profile can climb 0.5-2 m in one 8 m segment. Such a segment is eased back to its class
  // grade (STEEP) by moving both of its ground samples toward each other, a few passes so the change spreads along the line (bridges and tunnels stay)
  st.eased = 0; const snapY = R.roads.map((r) => Float32Array.from(r.y));
  R.roads.forEach((r) => {
    const lim = STEEP[r.hw]; if (!lim) return;
    for (let pass = 0; pass < EASE_PASSES; pass++) {
      let moved = false;
      for (let i = 0; i + 1 < r.x.length; i++) {
        const a = !r.cls[i], b = !r.cls[i + 1]; if (!a && !b) continue;
        const sg = Math.hypot(r.x[i + 1] - r.x[i], r.z[i + 1] - r.z[i]), dy = r.y[i + 1] - r.y[i], ex = Math.abs(dy) - lim * sg; if (sg < 1 || ex <= 0.005) continue;
        const s = Math.sign(dy) * ex; if (a && b) { r.y[i] += s / 2; r.y[i + 1] -= s / 2; } else if (a) r.y[i] += s; else r.y[i + 1] -= s;
        moved = true; if (!pass) st.eased++;
      }
      if (!moved) break;
    }
  });
  // ---- 6. the cells of a road that 4b eased or 5 lowered move with it, by what that moved the road there (all of it within INNER, fading out over the
  // slope of rule 2 beyond; not the ground nearer a tunnel than to that road): left as they were, an eased street lay up to 1.5 m off the ground at
  // 25,000 samples. Once after 4b (5 reads the ground over its tunnels) and once after 5
  st.regraded = 0;
  const follow = (base, cut) => { for (let k = 0; k < N; k++) {
    if (own[k] < 0 || wet(k)) continue;
    const r = R.roads[own[k]], y0 = base[own[k]], i = ownSeg[k], t = ownT[k], dy = (r.y[i] - y0[i]) * (1 - t) + (r.y[i + 1] - y0[i + 1]) * t; if (Math.abs(dy) < 0.01) continue;
    const W = Math.min(MAXW, Math.max(8, 2 * Math.abs(H0[k] - tgt[k]))), e = best[k]; if (cut ? e > INNER : e > INNER + W || (dy < 0 && cover[k] < e + r.half)) continue;
    H[k] += dy * (e <= INNER ? 1 : 1 - sstep(INNER, INNER + W, e)); R.h[k] = Math.max(-32768, Math.min(32767, Math.round(H[k] * 10))); st.regraded++;
  } };
  follow(snapY); const base5 = R.roads.map((r) => Float32Array.from(r.y));
  // ---- 5. an underpass right under a street: its road dips until the lowest lining (4.7 m) and 0.7 m of ground fit under the graded street, as deep as
  // the grade allows (6 % on motorways, 8 % elsewhere). The dip starts on the open approach before each portal (a cut between retaining walls, as a real
  // underpass's ramp is), up to APPROACH samples out, on into the line that goes on where this one ends at the portal, and not past a bridge or another
  // tunnel; the far ends of the approaches keep their height. Held at the portals, the deepest profile within the grade dropped under them, and the
  // first sample inside fell 3-6 m in one 8 m segment (2,500 tunnels, GPL-19)
  st.deepened = 0; st.approach = 0;
  // the open samples leading away from sample i of line r (dir -1 back, +1 on), into the line joined at its end: [road, sample] pairs, nearest first
  const lead = (r, i, dir) => {
    const out = []; let q = r, j = i + dir, seen = 0;
    while (out.length < APPROACH) {
      if (j < 0 || j >= q.x.length) {
        const join = (j < 0 ? q.prev : q.next)[0]; if (!join || seen++) break;
        const q2 = R.roads[join[0]], e = join[1]; if (e !== 0 && e !== q2.x.length - 1) break;   // it meets the middle of a road: a junction, which stays
        q = q2; dir = e === 0 ? 1 : -1; j = e; continue;
      }
      if (q.cls[j]) break; out.push([q, j]); j += dir;
    }
    return out;
  };
  for (const r of R.roads) {
    const gr = r.hw.startsWith('motorway') ? 0.06 : 0.08;
    for (const [a, b] of runsOf(r, 2)) {
      if (b - a < 2) continue;
      const path = [...lead(r, a, -1).reverse()]; for (let i = a; i <= b; i++) path.push([r, i]); path.push(...lead(r, b, 1));
      const n = path.length, s = new Float64Array(n), y = (p) => p[0].y[p[1]];
      for (let k = 1; k < n; k++) s[k] = s[k - 1] + Math.hypot(path[k][0].x[path[k][1]] - path[k - 1][0].x[path[k - 1][1]], path[k][0].z[path[k][1]] - path[k - 1][0].z[path[k - 1][1]]);
      const req = path.map((p) => (p[0] === r && p[1] > a && p[1] < b ? Math.min(y(p), G(r.x[p[1]], r.z[p[1]]) - 5.4) : y(p)));
      const y0 = y(path[0]), y1 = y(path[n - 1]), lowered = [];
      for (let k = 1; k < n - 1; k++) {
        let env = Infinity; for (let j = 0; j < n; j++) env = Math.min(env, req[j] + gr * Math.abs(s[k] - s[j]));
        env = Math.max(env, y0 - gr * s[k], y1 - gr * (s[n - 1] - s[k]));
        if (env < y(path[k]) - 0.02) lowered.push([path[k], env]);
      }
      for (const [[q, i], v] of lowered) { q.y[i] = v; if (q === r && i > a && i < b) st.deepened++; else st.approach++; }
    }
  }
  follow(base5, true);
  // ---- 7. where the dip could not go deep enough (an approach too short: a bridge, a junction or the end of the line right before the portal), the
  // ground over the lining is raised to it and 0.7 m over it, across the lining and fading out 14 m past the road's edge, but not on the ground of a
  // road nearer than the tunnel (a street over it keeps its height) nor under a bridge
  st.covered = 0;
  // (a function: step 9 covers the linings again after its ground moves)
  const coverLinings = () => { for (const r of R.roads) for (const [a, b] of runsOf(r, 2)) for (let i = a; i < b; i++) cells(r, i, r.half + 14, (k, d, t) => {
    if (wet(k) || (best[k] < 1e8 && own[k] < 0) || (own[k] >= 0 && best[k] + R.roads[own[k]].half <= d)) return;
    const need = r.y[i] + (r.y[i + 1] - r.y[i]) * t + 5.4; if (H[k] >= need) return;
    const w = 1 - sstep(r.half + 3, r.half + 14, d); if (w <= 0) return;
    H[k] += (need - H[k]) * w; R.h[k] = Math.max(-32768, Math.min(32767, Math.round(H[k] * 10))); st.covered++;
  }); };
  coverLinings();
  // ---- 8. the snap (4) and the easing (4b) part again roads whose carriageways overlap and that the compile's fuse step had made one surface (1,800 of
  // the 200 m cells of road-overlap came back): the same step once more over the graded roads, moving the ground under a moved ground stretch with it
  // (the fade only over cells no road holds)
  const lineOf = R.roads.map((r) => (CLASS[r.hw] ? { hw: r.hw, oneway: r.oneway, lanes: r.lanes, ref: r.ref, X: r.x, Z: r.z, Y: r.y, cls: r.cls, why: r.why, n: r.x.length } : null));
  const lines = lineOf.filter(Boolean).sort((a, b) => CLASS[a.hw].order - CLASS[b.hw].order || b.n - a.n);
  // a cell another road holds moves only to that road's own height there (the overlap itself) or when a street holds it (the street follows it again
  // below); the clearance under a bridge does not move
  const mayRelay = (k, L, y) => (own[k] < 0 ? best[k] > 1e8 : lineOf[own[k]] === L || FOLLOW.has(R.roads[own[k]].hw) || Math.abs(y - H[k]) < 0.3);   // a street follows its ground below
  const y8 = R.roads.map((r) => Float32Array.from(r.y)), g8 = R.roads.map((r) => Float32Array.from(r.x, (x, i) => G(x, r.z[i])));
  st.fuse = fuseOverlaps(lines, { g, nx, nz, x0, z0, water: R.water }, H, onRoad, { mayRelay, still: (L) => FOLLOW.has(L.hw) });   // a street follows its ground (moved, it stood off the mixed raster at 10,000 samples)
  for (let k = 0; k < N; k++) R.h[k] = Math.max(-32768, Math.min(32767, Math.round(H[k] * 10)));
  // a street (FOLLOW) this step left where it was (y0: its heights before the step, g0: its ground then), whose ground a moved road beside it took
  // along, follows its ground again as in rule 4 (the main roads keep their height: snapped to the ground the moved road shares with them, they
  // stepped over their grade at 1,100 places); the resnapped streets are eased back to their grade as in 4b (the raster mixes the heights of the roads
  // it carries), and their cells follow them as in 6. Again after step 9 (key: the count's name)
  const resettle = (y0, g0, key, pin = null) => {   // pin: per road, the samples that keep their height (step 9's joins)
    let n = 0;
    R.roads.forEach((r, ri) => { for (let i = 0; i < r.x.length; i++) {
      if (!FOLLOW.has(r.hw) || r.cls[i] || Math.abs(r.y[i] - y0[ri][i]) > 0.02 || (pin && pin[ri] && pin[ri][i])) continue;
      const gy = G(r.x[i], r.z[i]), d = r.y[i] - gy; if (Math.abs(gy - g0[ri][i]) < 0.02 || Math.abs(d) <= 0.02) continue;
      r.y[i] = gy; n++;
    } });
    st['resnapped' + key] = n; const ek = 'eased' + (key || '8');   // the counts of step 8 keep their names (resnapped, eased8)
    const base = R.roads.map((r) => Float32Array.from(r.y));
    R.roads.forEach((r, ri) => {
      const lim = STEEP[r.hw], P = pin && pin[ri]; if (!lim || !FOLLOW.has(r.hw)) return;
      for (let pass = 0; pass < EASE_PASSES; pass++) {
        let moved = false;
        for (let i = 0; i + 1 < r.x.length; i++) {
          const a = !r.cls[i] && !(P && P[i]), b = !r.cls[i + 1] && !(P && P[i + 1]); if (!a && !b) continue;
          const sg = Math.hypot(r.x[i + 1] - r.x[i], r.z[i + 1] - r.z[i]), dy = r.y[i + 1] - r.y[i], ex = Math.abs(dy) - lim * sg; if (sg < 1 || ex <= 0.005) continue;
          const sd = Math.sign(dy) * ex; if (a && b) { r.y[i] += sd / 2; r.y[i + 1] -= sd / 2; } else if (a) r.y[i] += sd; else r.y[i + 1] -= sd;
          moved = true; if (!pass) st[ek] = (st[ek] || 0) + 1;
        }
        if (!moved) break;
      }
    });
    follow(base);
  };
  resettle(y8, g8, '');
  // ---- 9. the joins (joins.mjs, WLD-36): a bridge run carried to a line end at the wrong height laid again to the road it joins there, the steps
  // left at the joins welded within the class grade, and the joins themselves made again with heights; the ground follows the roads moved on it
  // (as in 6) and is cleared under the bridges laid again (as in 3); the streets whose ground that moved follow it again and the linings are covered
  // again (as in 8 and 7: left, 18,000 samples stood off the ground and 250 linings showed through it)
  const base9 = R.roads.map((r) => Float32Array.from(r.y)), g9 = R.roads.map((r) => Float32Array.from(r.x, (x, i) => G(x, r.z[i])));
  const J = joinPass(R, G); st.joins = J.st;
  follow(base9);
  for (const [r, a, b] of J.runs) for (const [p, q] of runsOf(r, 1)) if (q >= a && p <= b) bridgeClear(r, p, q);
  for (let k = 0; k < N; k++) R.h[k] = Math.max(-32768, Math.min(32767, Math.round(H[k] * 10)));
  // the samples step 9 moved itself keep their height, and so do both sides of every join (resnapped, the streets parted 1,800 joins again)
  const pin9 = R.roads.map(() => null), pinAt = (ri, i) => { (pin9[ri] ||= new Uint8Array(R.roads[ri].x.length))[i] = 1; };
  R.roads.forEach((r, ri) => { for (const [e, links] of [[0, r.prev], [r.x.length - 1, r.next]]) for (const [li, j] of links || []) { pinAt(ri, e); if (R.roads[li] && j < R.roads[li].x.length) pinAt(li, j); } });
  resettle(base9, g9, '9', pin9);
  coverLinings();
  R.graded = GRADE_VERSION;
  return st;
}

// how well a region keeps the contract: per class, the samples that break it (the unit test and the build report read this)
export function contractOf(R) {
  const { nx, nz, g, x0, z0 } = R;
  const ground = (x, z) => { const fx = (x - x0) / g, fz = (z - z0) / g, i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(nz - 2, Math.floor(fz))), u = fx - i, v = fz - j, k = j * nx + i, h = R.h; return ((h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + nx] * (1 - u) + h[k + nx + 1] * u) * v) / 10; };
  const wetAt = (x, z) => { const i = Math.round((x - x0) / g), j = Math.round((z - z0) / g); return i >= 0 && j >= 0 && i < nx && j < nz && R.water[j * nx + i] > 0; };
  const c = { road: 0, roadOff: 0, bridge: 0, bridgeBuried: 0, bridgeLow: 0, tunnel: 0, tunnelShallow: 0, tunnelThin: 0 };
  for (const r of R.roads) {
    const s = arcOf(r), runs = runsOf(r, 1), endOf = (i) => { for (const [a, b] of runs) if (i >= a && i <= b) return Math.min(s[i] - s[a], s[b] - s[i]); return 0; };
    for (let i = 0; i < r.x.length; i++) {
      if (wetAt(r.x[i], r.z[i])) continue;
      const d = r.y[i] - ground(r.x[i], r.z[i]);
      if (r.cls[i] === 0) { c.road++; if (Math.abs(d) > 0.3) c.roadOff++; }
      else if (r.cls[i] === 1) { c.bridge++; const e = endOf(i); if (e > 2 && d < 0) c.bridgeBuried++; else if (e > ABUT && d < CLEAR - 0.2) c.bridgeLow++; }
      // a tunnel's lining comes down to 4.7 m where the cover is thin (highways.js): broken only where even that would show through the ground
      else { c.tunnel++; if (-d < 4.7 + 0.6 - 0.2) c.tunnelShallow++; if (-d < COVER - 0.2) c.tunnelThin++; }
    }
  }
  return c;
}

// ---- command line: grade region.bin in place (from region-raw.bin when an earlier grade made it)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'), file = process.argv[2] || path.join(root, 'build/baked/world/capital/region.bin'), raw = file.replace(/\.bin$/, '-raw.bin');
  let R = readRegion(file); if (!R) { console.error('no region at ' + file); process.exit(1); }
  if (R.graded) { if (!fs.existsSync(raw)) { console.error('region is graded and has no raw copy: compile it again'); process.exit(1); } R = readRegion(raw); }
  else fs.copyFileSync(file, raw);
  const t0 = Date.now(), before = contractOf(R), st = gradeRegion(R), after = contractOf(R);
  // the grade moved fitted streets: close to cars the ones that now pass under PASS m of the walls (build/world/fit.mjs)
  const bfile = path.join(path.dirname(file), 'buildings.bin');
  if (R.roads.some((r) => r.fit) && fs.existsSync(bfile)) { const { readBuildings } = await import('./blocks.mjs'), { wallIndex } = await import('./corridor.mjs'), { recheckPinches } = await import('./fit.mjs'); st.fitPinched = recheckPinches(R, wallIndex(readBuildings(bfile))); }
  fs.writeFileSync(file, zlib.deflateRawSync(encodeChunk(R), { level: 9 }));
  const out = { version: GRADE_VERSION, changed: st, before, after, seconds: (Date.now() - t0) / 1000 };
  fs.writeFileSync(path.join(path.dirname(file), 'grade-stats.json'), JSON.stringify(out)); console.log(JSON.stringify(out));
}
