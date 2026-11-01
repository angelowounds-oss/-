// The ground contract of the compiled region (WLD-24g, build/world/grade.mjs): the raster is conditioned so that the roads, bridges and tunnels fit it.
// Checked over every road sample of the region (the water left out): a road on the ground lies on the ground (0.3 m), a bridge deck is never under the
// ground away from its abutments, a tunnel's lowest lining (4.7 m) and 0.6 m fit under the ground. The 16 m raster cannot carry two levels within a cell
// of each other, so a small share is allowed (the thresholds below, with the counts in the metrics); before the contract it was 40 %, 4.8 % and 28 %.
// Also: grading twice from the raw copy gives the same bytes. Skips with a note when the region was never compiled and graded.
import path from 'node:path';
import { readRegion } from '../../build/world/emit.mjs';
import { gradeRegion, contractOf, GRADE_VERSION } from '../../build/world/grade.mjs';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../../build/baked/world/capital');
const R = readRegion(path.join(dir, 'region.bin')), bad = [], m = {};
if (!R || !R.graded) {
  console.log('RESULT ' + JSON.stringify({ test: 'ground-contract', pass: true, metrics: m, note: 'no graded region (node build/build.mjs grades it)' }));
} else {
  if (R.graded !== GRADE_VERSION) bad.push(['region graded by another version of the rules', R.graded, GRADE_VERSION]);
  const c = contractOf(R); Object.assign(m, c);
  const share = (a, b) => (b ? a / b : 0);
  m.roadOffShare = +share(c.roadOff, c.road).toFixed(4); m.bridgeBuriedShare = +share(c.bridgeBuried, c.bridge).toFixed(4); m.tunnelShallowShare = +share(c.tunnelShallow, c.tunnel).toFixed(4);
  if (m.roadOffShare > 0.005) bad.push(['roads off the ground', c.roadOff, c.road]);
  if (m.bridgeBuriedShare > 0.01) bad.push(['bridge decks under the ground', c.bridgeBuried, c.bridge]);
  if (m.tunnelShallowShare > 0.04) bad.push(['tunnel linings through the ground', c.tunnelShallow, c.tunnel]);
  // the same raw region graded twice gives the same raster and the same roads
  const raw = readRegion(path.join(dir, 'region-raw.bin'));
  if (raw) {
    const a = readRegion(path.join(dir, 'region-raw.bin')); gradeRegion(raw); gradeRegion(a);
    let diff = 0; for (let k = 0; k < raw.h.length; k++) if (raw.h[k] !== a.h[k]) diff++;
    for (let ri = 0; ri < raw.roads.length; ri++) for (let i = 0; i < raw.roads[ri].y.length; i++) if (raw.roads[ri].y[i] !== a.roads[ri].y[i]) diff++;
    // and the stored region is what the rules make of the raw one
    let stored = 0; for (let k = 0; k < raw.h.length; k++) if (raw.h[k] !== R.h[k]) stored++;
    m.repeatDiff = diff; m.storedDiff = stored;
    if (diff) bad.push(['grading is not repeatable', diff]); if (stored) bad.push(['the stored region is not the graded raw one', stored]);
  } else m.note = 'no raw copy';
  console.log('RESULT ' + JSON.stringify({ test: 'ground-contract', pass: bad.length === 0, metrics: m, note: bad.length ? JSON.stringify(bad) : '' }));
  process.exitCode = bad.length ? 1 : 0;
}
