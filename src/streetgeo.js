// Corner geometry of a junction (WLD-24g), pure maths shared by the bake (build/world/streets.mjs: where each pavement strip has to stop) and the game
// (src/streetscape.js: the pavement and the asphalt of the corner). Everything is in the plane (x, z), relative to the junction's centre.
// An arm leaves the centre at angle `ang` with half width `half` (its carriageway edge) and a pavement of width `w` (0: none). Arms are sorted by angle;
// the corner between an arm and the next one (counter-clockwise) is where the left edge of the first meets the right edge of the second. The kerb
// there is a circular arc of radius R that touches both edges: the asphalt bulges into the corner, the pavement is outside the arc.
const MIN_TURN = 0.35;      // closer arms than 20 degrees get no arc: their edges meet far out
const STRAIGHT = Math.PI - 0.05;   // wider than this the two edges are one line: no corner
export const ARC_STEPS = 6;

const dirOf = (a) => [Math.cos(a), Math.sin(a)], leftOf = (d) => [-d[1], d[0]];
// the point where the line (o1 + d1 s) meets (o2 + d2 u): [s, u], or null when parallel
function meet(o1, d1, o2, d2) {
  const det = d1[0] * d2[1] - d1[1] * d2[0]; if (Math.abs(det) < 1e-6) return null;
  const rx = o2[0] - o1[0], rz = o2[1] - o1[1];
  return [(rx * d2[1] - rz * d2[0]) / det, (rx * d1[1] - rz * d1[0]) / det];
}

// the corner between arm a and the next arm b, or null. Returns the distances along each arm at which its straight kerb starts (`sa` on the left side of a,
// `sb` on the right side of b), the arc, the sharp corner P of the two edges, and the outer corner of the two pavement edges.
export function corner(a, b, R) {
  let th = (b.ang - a.ang) % (Math.PI * 2); if (th < 0) th += Math.PI * 2;
  if (th >= STRAIGHT) return null;
  const d1 = dirOf(a.ang), d2 = dirOf(b.ang), n1 = leftOf(d1), n2 = leftOf(d2);
  const e1 = [n1[0] * a.half, n1[1] * a.half], e2 = [-n2[0] * b.half, -n2[1] * b.half];
  const m = meet(e1, d1, e2, d2); if (!m) return null;
  const [pa, pb] = m;   // along each arm to the sharp corner (negative: the edges cross behind the centre)
  // no pavement on one of the two arms: nothing to round, the edges meet in a sharp corner
  if (th < MIN_TURN || !(a.w > 0 && b.w > 0)) return { th, arc: false, sa: Math.max(0, pa), sb: Math.max(0, pb), P: [e1[0] + d1[0] * pa, e1[1] + d1[1] * pa] };
  const t = R / Math.tan(th / 2), sa = Math.max(0, pa) + t, sb = Math.max(0, pb) + t;
  const P = [e1[0] + d1[0] * pa, e1[1] + d1[1] * pa];
  const T1 = [e1[0] + d1[0] * (pa + t), e1[1] + d1[1] * (pa + t)], T2 = [e2[0] + d2[0] * (pb + t), e2[1] + d2[1] * (pb + t)];
  const C = [T1[0] + n1[0] * R, T1[1] + n1[1] * R];
  // the outer corner of the pavement edges (a.half + a.w, b.half + b.w)
  const f1 = [n1[0] * (a.half + a.w), n1[1] * (a.half + a.w)], f2 = [-n2[0] * (b.half + b.w), -n2[1] * (b.half + b.w)], mo = meet(f1, d1, f2, d2);
  const O1 = [f1[0] + d1[0] * (pa + t), f1[1] + d1[1] * (pa + t)], O2 = [f2[0] + d2[0] * (pb + t), f2[1] + d2[1] * (pb + t)];
  const Q = mo ? [f1[0] + d1[0] * mo[0], f1[1] + d1[1] * mo[0]] : [(O1[0] + O2[0]) / 2, (O1[1] + O2[1]) / 2];
  // the arc from T1 to T2 around C
  const a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]); let a2 = Math.atan2(T2[1] - C[1], T2[0] - C[0]), dl = a2 - a1; while (dl > Math.PI) dl -= Math.PI * 2; while (dl < -Math.PI) dl += Math.PI * 2;
  const arcPts = []; for (let k = 0; k <= ARC_STEPS; k++) { const q = a1 + dl * k / ARC_STEPS; arcPts.push([C[0] + Math.cos(q) * R, C[1] + Math.sin(q) * R]); }
  return { th, arc: true, sa, sb, P, T1, T2, C, O1, O2, Q, arcPts };
}

// the corner trims of all arms of a junction: arms sorted by angle, each { ang, half, w }; returns per arm { tl, tr } (metres from the centre at which the
// pavement of the left / right side begins) and the corner records for the renderer
export function trims(arms, R) {
  const n = arms.length, out = arms.map(() => ({ tl: 0, tr: 0 })), cs = [];
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n, c = corner(arms[k], arms[j], R);
    if (!c) continue;
    out[k].tl = Math.min(c.sa, 25); out[j].tr = Math.min(c.sb, 25); cs.push({ k, j, c });
  }
  return { trims: out, corners: cs };
}
// the kerb radius for a junction: wide roads get wide returns
// and not wider than the narrowest pavement can follow (the arc's circle reaches the pavement's outer corner when w >= 0.29 R)
export function radiusOf(arms) {
  const ws = arms.map((a) => a.w).filter((w) => w > 0), cap = ws.length ? Math.min(...ws) * 3.3 : 8;
  return Math.max(2.5, Math.min(8, Math.min(...arms.map((a) => a.half)) * 0.9, cap));
}

// a stored street tile back to numbers in metres relative to the world origin: junctions with their arms, and pavement runs (shared by the tests and the renderer)
export const TILE = 512, TILE_OFF = 256;
export function decodeTile(key, t) {
  const [ti, tj] = key.split('_').map(Number), ox = (ti - TILE_OFF) * TILE + TILE / 2, oz = (tj - TILE_OFF) * TILE + TILE / 2, J = [], R = [];
  for (let k = 0; k < t.nj; k++) {
    const arms = []; for (let q = t.jo[k]; q < t.jo[k + 1]; q++) arms.push({ ang: t.aang[q] / 65535 * Math.PI * 2, half: t.ahalf[q] / 10, rank: t.ameta[q] & 3, cross: !!(t.ameta[q] & 4), flow: t.ameta[q] >> 3, w: t.aw[q] / 10, tl: t.atl[q] / 10, tr: t.atr[q] / 10, line: t.aline[q], arr: t.aarr ? t.aarr[q] : 0, mark: t.amark ? t.amark[q] : 0 });
    J.push({ x: ox + t.jx[k] / 10, z: oz + t.jz[k] / 10, y: t.jy[k] / 10, signal: !!(t.jf[k] & 1), arms });
  }
  for (let k = 0; k < t.nr; k++) R.push({ line: t.rline[k], i0: t.ri0[k], i1: t.ri1[k], w: t.rw[k] / 10, m: t.rm[k], bus: !!(t.rm[k] & 4), ta: [t.rta[k * 2] / 10, t.rta[k * 2 + 1] / 10], tb: [t.rtb[k * 2] / 10, t.rtb[k * 2 + 1] / 10] });
  // lamps and trees as the bake judged them (build/world/streetfurn.mjs); tiles from before the furniture was baked have none
  const F = []; for (let k = 0; k < (t.nf || 0); k++) { const a = t.fdir[k] / 256 * Math.PI * 2; F.push({ t: t.ft[k] & 127, bridge: t.ft[k] >> 7, x: ox + t.fx[k] / 10, z: oz + t.fz[k] / 10, y: t.fy[k] / 10, ix: Math.cos(a), iz: Math.sin(a), v: t.fv[k] }); }
  return { J, R, F, ox, oz };
}

// signal groups of a junction: the arms along the main road (the arm of best rank, and those within 45 degrees of its line) are group 0, the others group 1
export function signalGroups(arms) {
  let best = 0; arms.forEach((a, k) => { if (a.rank < arms[best].rank || (a.rank === arms[best].rank && a.half > arms[best].half)) best = k; });
  const b = arms[best].ang;
  return arms.map((a) => { let d = Math.abs(a.ang - b) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d; return d <= Math.PI / 4 ? 0 : 1; });
}
// the signal a driver sees on arriving along a group at time t (seconds): 0 red, 1 yellow, 2 green; `phase` (0..1) makes neighbouring junctions differ
export const SIGNAL_CYCLE = 82;
export function signalState(group, t, phase = 0) {
  const c = (((t + phase * SIGNAL_CYCLE) % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE, a = group === 0 ? 0 : 41, u = c - a;
  return u >= 0 && u < 36 ? 2 : u >= 36 && u < 39 ? 1 : 0;
}

// where a crossing lies on an arm: from `s0` to `s0 + len` metres from the junction's centre, across the carriageway (shared so that the bake keeps trees and
// lamps off it and the renderer paints it at the same place)
export function crossingSpan(a) { return { s0: Math.max(a.tl, a.tr, 2.5) + 0.7, len: a.rank <= 1 ? 4.0 : 3.0 }; }
// the foot of the signal pole of an arm (on the pavement of the arriving side, at the middle of the crossing), relative to the junction's centre
export function signalFoot(a) {
  const { s0, len } = crossingSpan(a), dx = Math.cos(a.ang), dz = Math.sin(a.ang), lat = -(a.half + 0.9), sp = s0 + len * 0.5;
  return [dx * sp - dz * lat, dz * sp + dx * lat];
}
// does an arm carry a signal pole (a signalled junction, a crossing, traffic arriving on it, a pavement to stand on)
export const hasSignal = (j, a) => j.signal && a.cross && a.flow !== 1 && a.w > 0;
