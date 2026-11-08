// Road surfaces that lie on one another (build/world/roads.mjs fuseOverlaps): where the carriageways of two compiled roads overlap in plan, their
// surfaces are one (under 0.3 m apart) or a grade separation (6.5 m and more); between the two, one road was drawn through the other, its lanes,
// lamps and deck sides cutting across the other's lanes (the user's screenshot of 2026-11-08). Measured at the same point: a sample of one road
// against the other road's surface where the sample projects onto it.
import '../../build/jobs.mjs';
const { regionRoads } = await import('../../src/region.js');
const R = regionRoads(), half = (r) => r.half || 5, CS = 40, grid = new Map(), K = (a, b) => a * 100003 + b;
R.forEach((r, k) => { for (let i = 0; i + 1 < r.x.length; i++) { const key = K(Math.floor(r.x[i] / CS), Math.floor(r.z[i] / CS)); let a = grid.get(key); if (!a) grid.set(key, (a = [])); a.push(k, i); } });
let clash = 0, major = 0, motorway = 0, samples = 0; const ex = [], seen = new Set();
R.forEach((r, k) => {
  for (let i = 0; i < r.x.length; i += 3) {
    samples++; const x = r.x[i], z = r.z[i], y = r.y[i], cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const a = grid.get(K(cx + dx, cz + dz)); if (!a) continue;
      for (let q = 0; q < a.length; q += 2) {
        const k2 = a[q]; if (k2 <= k) continue; const s = R[k2], j = a[q + 1];
        const ax = s.x[j], az = s.z[j], ex2 = s.x[j + 1] - ax, ez = s.z[j + 1] - az, l2 = ex2 * ex2 + ez * ez || 1, t = ((x - ax) * ex2 + (z - az) * ez) / l2; if (t < 0 || t > 1) continue;
        if (Math.hypot(ax + ex2 * t - x, az + ez * t - z) > 0.7 * (half(r) + half(s))) continue;
        const dy = Math.abs(s.y[j] + (s.y[j + 1] - s.y[j]) * t - y); if (dy < 0.8 || dy > 4.5) continue;
        const cell = K(Math.floor(x / 200), Math.floor(z / 200)) + ':' + k + ':' + k2; if (seen.has(cell)) continue; seen.add(cell);
        clash++; if (dy >= 1.5) major++; if (/motorway|trunk/.test(r.hw + s.hw)) motorway++;
        if (ex.length < 6) ex.push({ a: r.id, b: s.id, x: Math.round(x), z: Math.round(z), dy: +dy.toFixed(1) });
      }
    }
  }
});
// 6,289 clashing 200 m cells before the fuse step (3,865 of them 1.5 m and more apart, 1,284 with a motorway or trunk), 4,825 / 2,716 / 793 after it
// (2026-11-08). What stays: ground roads crossing on the slant at a junction (under 1.5 m over the carriageway width), two ground roads more than 4 m
// apart (a terrace the 16 m raster cannot carry), moves held back by the grade or by a crossing's clearance, and roads beside a tunnel. The bar is the
// measured value with a margin: it catches a regression, not the rest
const pass = clash < 5200 && major < 3000 && motorway < 900;
console.log('RESULT ' + JSON.stringify({ test: 'road-overlap', pass, metrics: { lines: R.length, samples, clash, major, motorway, ex }, note: '' }));
process.exit(pass ? 0 : 1);
