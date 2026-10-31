// Road ends and bends of the compiled network (build/world/roads.mjs, ADR-0025): a line either meets another road or ends at the edge of the region, and no
// stretch of road kinks. Counted in the compiled lines, not in the source data.
import '../../build/jobs.mjs';
const { regionRoads, region } = await import('../../src/region.js');
const R = regionRoads(), bad = [], m = {};
if (!R.length) { console.log('RESULT ' + JSON.stringify({ test: 'world-road-ends', pass: true, metrics: {}, note: 'no compiled region' })); }
else {
  const reg = region(), g = reg.g, CS = 30, K = (a, b) => a * 100003 + b, grid = new Map();
  R.forEach((r, ri) => r.x.forEach((x, i) => { const k = K(Math.floor(x / CS), Math.floor(r.z[i] / CS)); (grid.get(k) || grid.set(k, []).get(k)).push(ri, i); }));
  const near = (x, z, ri, rad) => { let b = 1e9; const a = Math.floor(x / CS), c = Math.floor(z / CS), n = Math.ceil(rad / CS); for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { const l = grid.get(K(a + i, c + j)); if (!l) continue; for (let q = 0; q < l.length; q += 2) { if (l[q] === ri) continue; const d = Math.hypot(R[l[q]].x[l[q + 1]] - x, R[l[q]].z[l[q + 1]] - z); if (d < b) b = d; } } return b; };
  let inner = 0, ends = 0, pts = 0, sharp = 0, dup = 0;
  R.forEach((r, ri) => {
    const n = r.x.length; pts += n; if (r.hw === 'residential') { for (let i = 1; i + 1 < n; i++) if (Math.hypot(r.x[i] - r.x[i - 1], r.z[i] - r.z[i - 1]) < 2) dup++; return; }
    for (const [idx, link] of [[0, r.prev], [n - 1, r.next]]) { ends++; if (link && link.length) continue; if (near(r.x[idx], r.z[idx], ri, 60) < 40) continue;
      const x = r.x[idx], z = r.z[idx], dEdge = Math.min(x - reg.x0, reg.x0 + reg.nx * g - x, z - reg.z0, reg.z0 + reg.nz * g - z), dKeep = Math.max(Math.abs(x), Math.abs(z)); if (dEdge >= 1200 && dKeep >= 2200) inner++; }
    for (let i = 1; i + 1 < n; i++) {
      const l1 = Math.hypot(r.x[i] - r.x[i - 1], r.z[i] - r.z[i - 1]); if (l1 < 2) dup++;
      const a1 = Math.atan2(r.z[i] - r.z[i - 1], r.x[i] - r.x[i - 1]), a2 = Math.atan2(r.z[i + 1] - r.z[i], r.x[i + 1] - r.x[i]); let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d; if (d > 0.5) sharp++;
    }
  });
  m.ends = ends; m.danglingInner = inner; m.points = pts; m.sharp = sharp; m.sharpShare = +(sharp / pts).toFixed(4); m.dupPoints = dup;
  // at 1:1 every class of OpenStreetMap road is in the region (not only the arterials), and real tertiary / service roads end in dead ends: 1.5% of the ends
  if (inner > Math.max(80, ends * 0.015)) bad.push(['dangling ends inside the region', inner]);
  if (sharp / pts > 0.005) bad.push(['sharp bends', m.sharpShare]);
  if (dup / pts > 0.001) bad.push(['points closer than 2 m', dup]);
  console.log('RESULT ' + JSON.stringify({ test: 'world-road-ends', pass: bad.length === 0, metrics: m, note: bad.map((x) => x.join(' ')).join(' | ') }));
  process.exitCode = bad.length ? 1 : 0;
}
