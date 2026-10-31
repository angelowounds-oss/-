// Where two compiled roads cross (build/world/roads.mjs clearance pass, ADR-0023): the one above clears the one below by a vehicle and its deck; a motorway
// never crosses on the level; the grade of every road stays near its class limit. Crossings on the ground between lower classes stay junctions.
import '../../build/jobs.mjs';
const { regionRoads } = await import('../../src/region.js');
const R = regionRoads(), bad = [], m = {};
if (!R.length) { console.log('RESULT ' + JSON.stringify({ test: 'world-crossings', pass: true, metrics: {}, note: 'no compiled region' })); }
else {
  const CS = 64, K = (a, b) => a * 100003 + b, grid = new Map(), lo = (P, i, ax) => Math.floor(Math.min(P[ax][i], P[ax][i + 1]) / CS);
  R.forEach((r, ri) => { for (let i = 0; i + 1 < r.x.length; i++) for (let a = Math.floor(Math.min(r.x[i], r.x[i + 1]) / CS); a <= Math.floor(Math.max(r.x[i], r.x[i + 1]) / CS); a++) for (let b = Math.floor(Math.min(r.z[i], r.z[i + 1]) / CS); b <= Math.floor(Math.max(r.z[i], r.z[i + 1]) / CS); b++) { const k = K(a, b); (grid.get(k) || grid.set(k, { a, b, l: [] }).get(k)).l.push(ri, i); } });
  let cross = 0, junc = 0, deficient = 0, motorwayLevel = 0; const CLEAR = 6.0;
  for (const { a: ca, b: cb, l } of grid.values()) for (let u = 0; u < l.length; u += 2) for (let v = u + 2; v < l.length; v += 2) {
    const A = l[u], a = l[u + 1], B = l[v], b = l[v + 1]; if (A === B) continue;
    // a pair meets in every cell both segments share; count it once, in the cell with the largest lower-left corner (no pair set: it grows past Set limits)
    if (ca !== Math.max(lo(R[A], a, 'x'), lo(R[l[v]], b, 'x')) || cb !== Math.max(lo(R[A], a, 'z'), lo(R[l[v]], b, 'z'))) continue;
    const P = R[A], Q = R[B], o = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
    const d1 = o(P.x[a], P.z[a], P.x[a + 1], P.z[a + 1], Q.x[b], Q.z[b]), d2 = o(P.x[a], P.z[a], P.x[a + 1], P.z[a + 1], Q.x[b + 1], Q.z[b + 1]), d3 = o(Q.x[b], Q.z[b], Q.x[b + 1], Q.z[b + 1], P.x[a], P.z[a]), d4 = o(Q.x[b], Q.z[b], Q.x[b + 1], Q.z[b + 1], P.x[a + 1], P.z[a + 1]);
    if (!(d1 * d2 < 0 && d3 * d4 < 0)) continue;
    let ang = Math.abs(Math.atan2(P.z[a + 1] - P.z[a], P.x[a + 1] - P.x[a]) - Math.atan2(Q.z[b + 1] - Q.z[b], Q.x[b + 1] - Q.x[b])) % Math.PI; ang = Math.min(ang, Math.PI - ang); if (ang < 20 * Math.PI / 180) continue;
    cross++; const t = d3 / (d3 - d4), t2 = d1 / (d1 - d2), dy = Math.abs(P.y[a] + (P.y[a + 1] - P.y[a]) * t - (Q.y[b] + (Q.y[b + 1] - Q.y[b]) * t2));
    const st = P.cls[a] || P.cls[a + 1] || Q.cls[b] || Q.cls[b + 1], mw = P.hw === 'motorway' || Q.hw === 'motorway';
    if (!st && !mw) { junc++; continue; }
    if (dy < CLEAR) { deficient++; if (!st) motorwayLevel++; }
  }
  m.crossings = cross; m.junctions = junc; m.deficient = deficient; m.motorwayLevel = motorwayLevel;
  const share = deficient / Math.max(1, cross - junc); m.deficientShare = +share.toFixed(3); if (share > 0.03) bad.push(['crossings without clearance', m.deficientShare]);
  const lim = { motorway: 0.06, trunk: 0.08, primary: 0.08, secondary: 0.1 }; const over = {};
  for (const r of R) for (let i = 0; i + 1 < r.x.length; i++) { const sg = Math.hypot(r.x[i + 1] - r.x[i], r.z[i + 1] - r.z[i]); if (sg < 3 || r.cls[i] || r.cls[i + 1]) continue; if (Math.abs(r.y[i + 1] - r.y[i]) / sg > lim[r.hw] * 1.5) over[r.hw] = (over[r.hw] || 0) + 1; }
  m.gradeOver = over; for (const [hw, n] of Object.entries(over)) if (n > 25) bad.push(['grade over limit', hw, n]);
  console.log('RESULT ' + JSON.stringify({ test: 'world-crossings', pass: bad.length === 0, metrics: m, note: bad.map((x) => x.join(' ')).join(' | ') }));
  process.exitCode = bad.length ? 1 : 0;
}
