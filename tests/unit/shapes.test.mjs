// WLD-07: the tower stage planner (src/shapes.js). Over thousands of buildings: every stage lies inside the one below and shares its
// x0 / z0 corner (the lift and stair core stands there), no side is shorter than 14 m (or than the lot's own side), the core fits in every
// stage, heights are contiguous and the total is unchanged, the same seed always gives the same shape, and a sensible share of the tall
// buildings step back.
import { planTowerStages, MIN_SIDE, CORE_MIN_X, CORE_MIN_Z } from '../../src/shapes.js';

const bad = [];
let multi = 0, tallMulti = 0, tall = 0, three = 0, total = 0;
for (let i = 0; i < 6000; i++) {
  const w = 20 + (i * 7919 % 41), d = 20 + (i * 104729 % 43), th = 12 + (i * 15485863 % 160), seed = (i * 0.37) % 50, zone = i % 5;
  const args = { x0: 3, z0: -4, x1: 3 + w, z1: -4 + d, y0: 8, y1: 8 + th, seed, zone };
  const s = planTowerStages(args), again = planTowerStages(args);
  if (JSON.stringify(s) !== JSON.stringify(again)) bad.push(['determinism', i]);
  total++; if (s.length > 1) multi++; if (s.length === 3) three++;
  if (th > 60) { tall++; if (s.length > 1) tallMulti++; }
  s.forEach((r, k) => {
    const p = s[k - 1];
    if (k > 0 && !(r.x0 === p.x0 && r.z0 === p.z0 && r.x1 <= p.x1 + 1e-9 && r.z1 <= p.z1 + 1e-9)) bad.push(['nest', i, k]);
    if (k > 0 && Math.abs(r.y0 - p.y1) > 1e-9) bad.push(['gap', i, k]);
    if (!(r.y1 > r.y0)) bad.push(['height', i, k]);
    if (r.x1 - r.x0 < Math.min(w, MIN_SIDE) - 1e-9 || r.z1 - r.z0 < Math.min(d, MIN_SIDE) - 1e-9) bad.push(['side', i, k]);
    if (r.x1 - r.x0 < CORE_MIN_X || r.z1 - r.z0 < CORE_MIN_Z) bad.push(['core', i, k]);
  });
  if (s[0].y0 !== 8 || s[s.length - 1].y1 !== 8 + th) bad.push(['span', i]);
}
const tallShare = tall ? tallMulti / tall : 0;
const pass = bad.length === 0 && tallShare >= 0.4 && three > 0;
console.log('RESULT ' + JSON.stringify({ test: 'shapes', pass, metrics: { total, multi, three, tall, tallShare: +tallShare.toFixed(2), violations: bad.length, sample: bad.slice(0, 3) }, note: '' }));
if (!pass) process.exitCode = 1;
