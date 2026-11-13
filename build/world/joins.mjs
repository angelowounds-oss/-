// Road joins (WLD-36, the last step of grade.mjs): where one line ends on another the two must meet at one height, and a join (next/prev) must lead
// to road a car can drive onto. emit.mjs joins each line end to the nearest sample of another line within 20 m in plan, whatever its height, and
// the profiles were made line by line, so in the capital region 9,758 joins at a shared node stood more than 1.5 m apart (6,117 more than 6 m), and
// AI traffic (hwtraffic.js) and the autopilot's graph (worldnav.js) followed joins from a street onto a viaduct 80 m over it. Three parts:
//   A. a bridge run that reaches a line end at a shared node with a road on the ground has no height of its own there (the map tags the whole way a
//      bridge; profile() carried the height of the tunnel portal before it to the end, trunk 30 101 m over the city for 10 km): the run is laid
//      straight again from the sample before it to the joined road's height, never under CLEAR over the ground away from its ends, within the class grade
//   B. the remaining steps up to WELD_MAX: the line whose end it is meets the other within its class grade, clamped into a cone (a tunnel in the
//      blend, a grade separation the move would close, or a grade over the class's leaves it)
//   C. the joins again in three dimensions: a join more than JOIN_DY apart in height goes to the nearest sample of the same road within JOIN at the end's
//      height, else stays at a shared node (the road going on over a step) or is dropped (a street ending under a viaduct does not lead onto it)
import { CLASS } from './roads.mjs';

export const JOIN = 20, SHARED = 1, NEAR = 8, JOIN_DY = 2, JOIN_MIN = 0.3, WELD_MAX = 4, TALL = 15, SEP = 5.4;
const CLEAR = 3, CS = 48, K = (a, b) => a * 100003 + b;
const gradeOf = (r) => (CLASS[r.hw] ? CLASS[r.hw].grade : 0.08);
// the laying order of roads.mjs: a lower class first, then the longer line (a later line meets an earlier one)
const rankOf = (r) => (CLASS[r.hw] ? CLASS[r.hw].order : 99) * 1e7 - r.x.length;
// arc length along a line, sample by sample
const arcOf = (r) => { const s = new Float64Array(r.x.length); for (let i = 1; i < r.x.length; i++) s[i] = s[i - 1] + Math.hypot(r.x[i] - r.x[i - 1], r.z[i] - r.z[i - 1]); return s; };

// the joins of every line end: { r, e, M, j, d } for each next/prev entry (e the end sample, j the joined sample, d their distance in plan)
function joinsOf(R) {
  const out = [];
  for (const r of R.roads) for (const [e, links] of [[0, r.prev], [r.x.length - 1, r.next]]) for (const [li, j] of links || []) {
    const M = R.roads[li]; if (!M || j >= M.x.length) continue;
    out.push({ r, e, M, j, d: Math.hypot(r.x[e] - M.x[j], r.z[e] - M.z[j]) });
  }
  return out;
}

// the crossings of the segments of line r between samples a and b with every other line: [i, t, M, j, u], for the clearance check
function crossingsOf(R, segGrid, r, a, b) {
  const out = [];
  for (let i = Math.max(0, a - 1); i < Math.min(r.x.length - 1, b + 1); i++) {
    const ax = r.x[i], az = r.z[i], bx = r.x[i + 1], bz = r.z[i + 1], seen = new Set();
    for (let cx = Math.floor(Math.min(ax, bx) / CS); cx <= Math.floor(Math.max(ax, bx) / CS); cx++) for (let cz = Math.floor(Math.min(az, bz) / CS); cz <= Math.floor(Math.max(az, bz) / CS); cz++) {
      const c = segGrid.get(K(cx, cz)); if (!c) continue;
      for (let q = 0; q < c.length; q += 2) {
        const M = R.roads[c[q]], j = c[q + 1]; if (M === r || seen.has(c[q] * 1e6 + j)) continue; seen.add(c[q] * 1e6 + j);
        const cx2 = M.x[j], cz2 = M.z[j], dx2 = M.x[j + 1] - cx2, dz2 = M.z[j + 1] - cz2, dx = bx - ax, dz = bz - az, den = dx * dz2 - dz * dx2; if (Math.abs(den) < 1e-9) continue;
        const t = ((cx2 - ax) * dz2 - (cz2 - az) * dx2) / den, u = ((cx2 - ax) * dz - (cz2 - az) * dx) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push([i, t, M, j, u]);
      }
    }
  }
  return out;
}
const yAt = (r, i, t) => r.y[i] + (r.y[Math.min(r.x.length - 1, i + 1)] - r.y[i]) * t;

// the joins pass over a graded region R (roads with x, z, y, cls, next, prev); G(x, z) the graded ground. Moves road heights and rewrites the joins.
// Returns { st, moved, runs }: the counts, the roads it moved (their ground follows them), and the bridge runs laid again ([road, a, b])
export function joinPass(R, G) {
  const st = { joins: 0, steps03: 0, steps15: 0, relaid: 0, relaidMax: 0, relaidSteep: 0, relaidHurt: 0, welded: 0, weldMax: 0, weldTall: 0, weldTunnel: 0, weldSteep: 0, weldHurt: 0, rejoined: 0, dropped: 0, keptJoin: 0 };
  const moved = new Set(), runs = [], keep = (r) => moved.add(r);
  const segGrid = new Map();
  R.roads.forEach((r, ri) => { for (let i = 0; i + 1 < r.x.length; i++) {
    for (let cx = Math.floor(Math.min(r.x[i], r.x[i + 1]) / CS); cx <= Math.floor(Math.max(r.x[i], r.x[i + 1]) / CS); cx++) for (let cz = Math.floor(Math.min(r.z[i], r.z[i + 1]) / CS); cz <= Math.floor(Math.max(r.z[i], r.z[i + 1]) / CS); cz++) {
      const k = K(cx, cz); let c = segGrid.get(k); if (!c) segGrid.set(k, (c = [])); c.push(ri, i);
    }
  } });
  // a new profile Y for samples a..b of r: refused when a crossing that was a grade separation (SEP apart) would come closer than SEP
  const hurts = (r, a, b, Y) => {
    for (const [i, t, M, j, u] of crossingsOf(R, segGrid, r, a, b)) {
      const old = Math.abs(yAt(r, i, t) - yAt(M, j, u)), ny = Y[i] + (Y[Math.min(r.x.length - 1, i + 1)] - Y[i]) * t, now = Math.abs(ny - yAt(M, j, u));
      if (old >= SEP && now < SEP) return true;
    }
    return false;
  };
  for (const J of joinsOf(R)) { st.joins++; const dy = Math.abs(J.r.y[J.e] - J.M.y[J.j]); if (J.d < SHARED && dy > JOIN_MIN) st.steps03++; if (J.d < SHARED && dy > 1.5) st.steps15++; }

  // ---- A. bridge runs reaching a line end at a shared node with a road on the ground: laid straight to that road's height
  const target = new Map();   // road -> [height at sample 0 or NaN, height at its last sample or NaN]
  for (const J of joinsOf(R)) {
    const { r, e, M, j, d } = J; if (d >= SHARED || r.cls[e] !== 1 || M.cls[j] !== 0 || Math.abs(M.y[j] - r.y[e]) < JOIN_MIN) continue;
    const t = target.get(r) || [NaN, NaN]; t[e === 0 ? 0 : 1] = M.y[j]; target.set(r, t);
  }
  for (const [r, [T0, T1]] of target) {
    const n = r.x.length, s = arcOf(r), Y = Float64Array.from(r.y), gr = gradeOf(r) * 1.25;
    // the run at each end with a target: from the sample before it (its anchor, kept) to the end, or the whole line when it is one run
    let a = 0; while (a < n && r.cls[a] === 1) a++;   // samples 0..a-1: the run at the start
    let b = n - 1; while (b >= 0 && r.cls[b] === 1) b--;   // samples b+1..n-1: the run at the end
    const spans = [];
    if (a >= n) spans.push([0, n - 1, T0 === T0 ? T0 : r.y[0], T1 === T1 ? T1 : r.y[n - 1]]);   // the whole line a bridge
    else { if (T0 === T0) spans.push([0, a, T0, r.y[a]]); if (T1 === T1) spans.push([b, n - 1, r.y[b], T1]); }
    for (const [p, q, y0, y1] of spans) {
      const len = s[q] - s[p]; if (len < 1) continue;
      if (Math.abs(y1 - y0) / len > gr) { st.relaidSteep++; continue; }
      // what the deck must clear: the ground (CLEAR, away from its ends) and the roads it passes over (SEP over them where it cleared them before);
      // and what it must stay under: the roads that pass over it. The profile is the straight line raised to the floors within the grade (an
      // envelope falling at the grade from each floor, forward and back); infeasible where that lifts an end or meets a ceiling
      const fl = new Float64Array(n).fill(-Infinity), ce = new Float64Array(n).fill(Infinity);
      // (the clearance over the ground grows from nothing at an end at 0.9 of the grade: a deck can always come down to its abutment)
      for (let i = p; i <= q; i++) if (r.cls[i] === 1) fl[i] = G(r.x[i], r.z[i]) + Math.min(CLEAR, 0.9 * gr * Math.min(s[i] - s[p], s[q] - s[i]));
      for (const [i, t, M, j, u] of crossingsOf(R, segGrid, r, p, q)) {
        const k = t > 0.5 ? Math.min(q, i + 1) : Math.max(p, i), mine = yAt(r, i, t), other = yAt(M, j, u); if (Math.abs(mine - other) < SEP) continue;
        if (other < mine) fl[k] = Math.max(fl[k], other + SEP + 0.1); else ce[k] = Math.min(ce[k], other - SEP - 0.1);
      }
      const env = Float64Array.from(fl);
      for (let i = p + 1; i <= q; i++) env[i] = Math.max(env[i], env[i - 1] - gr * (s[i] - s[i - 1]));
      for (let i = q - 1; i >= p; i--) env[i] = Math.max(env[i], env[i + 1] - gr * (s[i + 1] - s[i]));
      let ok = env[p] <= y0 + 0.05 && env[q] <= y1 + 0.05;
      for (let i = p; i <= q && ok; i++) { Y[i] = Math.max(y0 + (y1 - y0) * (s[i] - s[p]) / len, env[i]); if (Y[i] > ce[i]) ok = false; }
      Y[p] = y0; Y[q] = y1;
      if (!ok) { st.relaidSteep++; for (let i = p; i <= q; i++) Y[i] = r.y[i]; continue; }
      if (hurts(r, p, q, Y)) { st.relaidHurt++; for (let i = p; i <= q; i++) Y[i] = r.y[i]; continue; }
      keep(r); let mx = 0; for (let i = p; i <= q; i++) { mx = Math.max(mx, Math.abs(Y[i] - r.y[i])); r.y[i] = Y[i]; }
      st.relaid++; st.relaidMax = Math.max(st.relaidMax, mx); runs.push([r, p, q]);
    }
  }

  // ---- B. the steps left, up to WELD_MAX: the line whose end it is meets the other (twice: a line the first round moved may part a join it carries).
  // Its profile is clamped into the cone of grade 0.8 x (else 1.25 x) its class grade standing on the joined height at the end: the samples outside it come in,
  // the rest stay, so the result is never steeper than the profile was or the cone is (a raised cosine added on top of a stretch already at its
  // grade, as 4b leaves the streets, stepped it 1.5 x over at 3,600 ends)
  for (let round = 0; round < 2; round++) for (const J of joinsOf(R)) {
    const { r, e, M, j, d } = J; if (d >= NEAR) continue;
    // at a shared node the two are one road whatever the step (an untagged embankment or ramp: the end climbs to it, up to TALL); a join that is
    // only near in plan meets up to WELD_MAX (more is another level, which C below leaves)
    const T = M.y[j], h = T - r.y[e]; if (Math.abs(h) < JOIN_MIN) continue; if (Math.abs(h) > (d < SHARED ? TALL : WELD_MAX)) { if (!round) st.weldTall++; continue; }
    const n = r.x.length, s = arcOf(r), se = s[e], far = e ? 0 : n - 1, farFree = !((e ? r.prev : r.next) || []).length;
    // the cone at 0.8 x the grade, else at the grade's limit (STEEP of grade.mjs, 1.25 x); it may reach the line's other end only where nothing joins
    // there (a dead end follows), else the step is over the grade along the whole line and is left as it is
    let Y = null, tunnel = false, lo = n, hi = -1;
    for (const k of [0.8, 1.25]) {
      const lim = gradeOf(r) * k; Y = Float64Array.from(r.y); tunnel = false; lo = n; hi = -1;
      for (let i = 0; i < n; i++) {
        const w = lim * Math.abs(s[i] - se), y = Math.min(T + w, Math.max(T - w, r.y[i])); if (Math.abs(y - r.y[i]) < 0.005) continue;
        if (r.cls[i] === 2) tunnel = true; Y[i] = y; lo = Math.min(lo, i); hi = Math.max(hi, i);
      }
      if (farFree || Math.abs(Y[far] - r.y[far]) <= 0.02) break;
      Y = null;
    }
    if (!Y) { if (!round) st.weldSteep++; continue; }
    if (tunnel) { if (!round) st.weldTunnel++; continue; }
    if (hurts(r, lo, hi, Y)) { if (!round) st.weldHurt++; continue; }
    keep(r); for (let i = lo; i <= hi; i++) r.y[i] = Y[i]; st.welded++; st.weldMax = Math.max(st.weldMax, Math.abs(h));
  }

  // ---- C. the joins again with heights: one more than JOIN_DY apart goes to the nearest sample of the same road at the end's height within JOIN (another
  // road there may be the other carriageway, one way the other way). Else a join at a shared node is the road going on (the map's own node), a step the
  // welds could not take (a line too short to climb it, a grade separation or a tunnel in the way, a bridge line laid at the wrong height), and
  // stays: dropped, they cut the airfield and the harbour off the capital in worldnav's graph. Only a join that is near in plan only is dropped
  const pts = new Map();
  R.roads.forEach((r, ri) => { for (let i = 0; i < r.x.length; i++) { const k = K(Math.floor(r.x[i] / JOIN), Math.floor(r.z[i] / JOIN)); let c = pts.get(k); if (!c) pts.set(k, (c = [])); c.push(ri, i); } });
  R.roads.forEach((r, ri) => {
    for (const [e, key] of [[0, 'prev'], [r.x.length - 1, 'next']]) {
      const links = r[key]; if (!links || !links.length) continue;
      r[key] = links.map(([li, j]) => {
        const M = R.roads[li], dy = Math.abs(M.y[j] - r.y[e]); if (dy <= JOIN_DY) return [li, j];
        let best = null, bd = JOIN; const x = r.x[e], z = r.z[e], a = Math.floor(x / JOIN), b = Math.floor(z / JOIN);
        for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
          const c = pts.get(K(a + da, b + db)); if (!c) continue;
          for (let q = 0; q < c.length; q += 2) { if (c[q] !== li) continue; const N = R.roads[c[q]], i = c[q + 1]; if (Math.abs(N.y[i] - r.y[e]) > JOIN_DY) continue; const dd = Math.hypot(N.x[i] - x, N.z[i] - z); if (dd < bd) { bd = dd; best = [c[q], i]; } }
        }
        if (best) { st.rejoined++; return best; }
        if (Math.hypot(M.x[j] - x, M.z[j] - z) < SHARED) { st.keptJoin++; return [li, j]; }
        st.dropped++; return null;
      }).filter(Boolean);
    }
  });
  st.relaidMax = +st.relaidMax.toFixed(2); st.weldMax = +st.weldMax.toFixed(2);
  return { st, moved, runs };
}

// the joins' height steps (the unit test and the build report): at a shared node (in plan under SHARED) and at any join, and joins over JOIN_DY
export function joinSteps(R) {
  const m = { joins: 0, shared: 0, shared03: 0, shared15: 0, shared6: 0, near15: 0, overDy: 0, sharedDy: 0 };
  for (const { r, e, M, j, d } of joinsOf(R)) {
    m.joins++; const dy = Math.abs(r.y[e] - M.y[j]); if (dy > JOIN_DY) { m.overDy++; if (d < SHARED) m.sharedDy++; }
    if (d < SHARED) { m.shared++; if (dy > JOIN_MIN) m.shared03++; if (dy > 1.5) m.shared15++; if (dy > 6) m.shared6++; } else if (d < NEAR && dy > 1.5) m.near15++;
  }
  return m;
}
export { rankOf };
