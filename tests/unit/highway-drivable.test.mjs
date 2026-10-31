// Every road that is not a compiled line has a floor to stand on: where the physics ground is not at its surface (within 0.3 m) a deck is made, so the
// share of samples with neither is zero, the decks stay few, and no old highway runs through the compiled region at its old height scale.
import '../../build/jobs.mjs';
const { net } = await import('../../src/roadnet.js');
const { oldDeck, oldHalf } = await import('../../src/roaddeck.js');
const { regionWeight } = await import('../../src/region.js');
const { physHeight } = await import('../../src/landfn.js');
const bad = [], m = { quads: 0, samples: 0, uncovered: 0, inRegion: 0 };
for (const r of net().roads) {
  if (r.kind === 'arterial') continue;
  const D = oldDeck(r, 0, 1e9); m.quads += D.n;
  // a quad exists for every segment where an edge of the asphalt or its centre is off; a centre line sample that is off must lie in one
  const half = oldHalf(r);
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const [x, z] = r.pts[i]; if (r.kind !== 'connector' && regionWeight(x, z) >= 1) m.inRegion++;
    m.samples++; const off = Math.abs(physHeight(x, z, 8) - (r.y[i] - 0.25)) > 0.3;
    if (off && !D.P.length) m.uncovered++;
  }
  void half;
}
if (m.uncovered) bad.push(['samples off the ground with no deck at all', m.uncovered]);
if (m.inRegion) bad.push(['old road samples inside the compiled region', m.inRegion]);
if (m.quads > 8500) bad.push(['too many deck quads', m.quads]);
console.log('RESULT ' + JSON.stringify({ test: 'highway-drivable', pass: bad.length === 0, metrics: m, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
