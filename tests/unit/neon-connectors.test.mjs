// The capital's four connectors run over ground the compiled region owns and nothing carves for them: where they are not a bridge or a tunnel they sit
// on the ground (within 4 m, a deck covers the rest), they meet a compiled road on the ground (not on a viaduct), and never exceed the highway grade.
import '../../build/jobs.mjs';
const { net, capitalH } = await import('../../src/roadnet.js');
const { regionRoads } = await import('../../src/region.js');
const bad = [], m = { connectors: 0, samples: 0, offGround: 0, maxDev: 0, maxGrade: 0, joinOnViaduct: 0, floating: 0 };
const roads = new Map(regionRoads().map((r) => [r.id, r]));
for (const r of net().roads) {
  if (r.kind !== 'connector' || r.city !== 'neon' || r.id.startsWith('conn:hw:')) continue; m.connectors++;   // the airport city's connectors (ADR-0037) are checked by unit/incheon-roads; a highway's gap connector (roadnet.js) lies outside the capital's ground, by unit/worldnav
  for (let i = 0; i < r.x.length; i++) {
    const g = capitalH(r.x[i], r.z[i]), d = r.y[i] - g; m.samples++;
    if (r.cls[i] === 0) { if (Math.abs(d) > 4) m.offGround++; m.maxDev = Math.max(m.maxDev, Math.abs(d)); }
    else if (r.cls[i] === 1 && d < 0) m.floating++;   // a bridge below the ground
    else if (r.cls[i] === 2 && d > 0) m.floating++;   // a tunnel above the ground
    if (i) m.maxGrade = Math.max(m.maxGrade, Math.abs(r.y[i] - r.y[i - 1]) / Math.hypot(r.x[i] - r.x[i - 1], r.z[i] - r.z[i - 1]));
  }
  const j = r.joinB && roads.get(r.joinB.road); if (j && j.cls[r.joinB.i]) m.joinOnViaduct++;
}
if (m.connectors !== 4) bad.push(['connectors', m.connectors]);
if (m.offGround) bad.push(['ground-level samples more than 4 m off the ground', m.offGround]);
if (m.floating) bad.push(['bridge/tunnel samples on the wrong side of the ground', m.floating]);
if (m.joinOnViaduct) bad.push(['connectors that meet a viaduct', m.joinOnViaduct]);
if (m.maxGrade > 0.08) bad.push(['grade', m.maxGrade]);
console.log('RESULT ' + JSON.stringify({ test: 'neon-connectors', pass: bad.length === 0, metrics: m, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
