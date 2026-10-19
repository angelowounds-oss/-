// The country roads as packed (assets/roads/country.bin): no kink sharper than 30 degrees, no duplicate points, and the ground under a
// ribbon stays within a metre and a half of the road for almost every sample (the banks close the rest). Pure data, no browser.
import fs from 'node:fs';
import { landHeight } from '../../src/landfn.js';

const bin = fs.readFileSync(new URL('../../assets/roads/country.bin', import.meta.url));
const hl = bin.readUInt32LE(0), head = JSON.parse(bin.subarray(4, 4 + hl).toString('utf8')), base = 4 + hl;
const roads = head.roads.map((r) => ({ ...r, p: new Float32Array(bin.buffer.slice(bin.byteOffset + base + r.off, bin.byteOffset + base + r.off + r.n * 8)) }));

let bends = 0, maxBend = 0, dups = 0, samples = 0, far = 0, maxCross = 0;
for (const r of roads) {
  const p = r.p;
  for (let s = 1; s < r.n; s++) if (Math.hypot(p[s * 2] - p[(s - 1) * 2], p[s * 2 + 1] - p[(s - 1) * 2 + 1]) < 0.5) dups++;
  for (let s = 1; s < r.n - 1; s++) {
    const ax = p[s * 2] - p[(s - 1) * 2], az = p[s * 2 + 1] - p[(s - 1) * 2 + 1], bx = p[(s + 1) * 2] - p[s * 2], bz = p[(s + 1) * 2 + 1] - p[s * 2 + 1];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz); if (la < 0.5 || lb < 0.5) continue;
    const deg = Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb)))) * 180 / Math.PI;
    if (deg > maxBend) maxBend = deg; if (deg > 30) bends++;
  }
  for (let s = 0; s < r.n; s += 3) {   // the ground 4.4 m to either side of the centre line (the ribbon is 8.8 m wide)
    const x = p[s * 2], z = p[s * 2 + 1], g = landHeight(x, z, 16), d = Math.max(Math.abs(landHeight(x + 4.4, z, 16) - g), Math.abs(landHeight(x - 4.4, z, 16) - g));
    samples++; if (d > maxCross) maxCross = d; if (d > 1.5) far++;
  }
}
const bad = [];
if (bends > 0) bad.push(['kinks over 30 degrees', bends, maxBend.toFixed(1)]);
if (dups > 0) bad.push(['duplicate points', dups]);
// 3%: the looser slope retry (A2, KOREA-PLAN) trades a little ground fit for coverage; the owner allowed the criterion to change for the result
if (far / samples > 0.03) bad.push(['ground off the ribbon', far, samples]);
console.log('RESULT ' + JSON.stringify({ test: 'countryroads-quality', pass: bad.length === 0, metrics: { roads: roads.length, bends30: bends, maxBendDeg: +maxBend.toFixed(1), dups, crossOver1_5m: +(far / samples * 100).toFixed(2) + '%', maxCrossM: +maxCross.toFixed(2) }, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
