// The real settlements of the compiled region (build/world/places.mjs, ADR-0021): Korean names, on land, on a flat pad, apart from one another, inside the
// region proper, and every one is a village of the game.
import '../../build/jobs.mjs';
const { regionPlaces, regionHeight, regionWater, regionWeight, region } = await import('../../src/region.js');
const { settlements } = await import('../../src/settlements.js');
const { SEA } = await import('../../src/worldmap.js');
const bad = [], m = {}, P = regionPlaces();
if (!region()) { console.log('RESULT ' + JSON.stringify({ test: 'world-places', pass: true, metrics: {}, note: 'no compiled region' })); }
else {
  m.places = P.length; if (P.length < 20) bad.push(['too few places', P.length]);
  let nameBad = 0, wet = 0, rough = 0, close = 0, band = 0, tot = 0, totFlat = 0;
  P.forEach((p, i) => {
    if (!/[가-힣]/.test(p.name)) nameBad++;
    if (regionWeight(p.x, p.z) < 1) band++;
    if (regionWater(p.x, p.z)?.cls) wet++;
    // the roads laid in afterwards cut through a pad, so most of it, not all, must lie at the pad's height
    let n = 0, flat = 0; for (let a = 0; a < 16; a++) for (const f of [0.3, 0.7]) { const h = regionHeight(p.x + Math.cos(a / 16 * 6.2832) * p.r * f, p.z + Math.sin(a / 16 * 6.2832) * p.r * f); if (h === h) { n++; if (Math.abs(h - p.y) < 1.5) flat++; } }
    tot += n; totFlat += flat; if (flat / n < 0.6 || Math.abs(regionHeight(p.x, p.z) - p.y) > 1.5) rough++;
    for (let j = 0; j < i; j++) if (Math.hypot(P[j].x - p.x, P[j].z - p.z) < 800) close++;
  });
  m.flatShare = +(totFlat / tot).toFixed(2); if (totFlat / tot < 0.85) bad.push(['pads are not flat', m.flatShare]); m.nameBad = nameBad; m.wet = wet; m.rough = rough; m.close = close; m.band = band;
  for (const [k, v] of Object.entries({ nameBad, wet, rough, close, band })) if (v) bad.push([k, v]);
  const real = settlements().villages.filter((v) => v.tag === 'real'); m.villages = real.length; if (real.length !== P.length) bad.push(['villages differ from places', real.length, P.length]);
  void SEA;
  console.log('RESULT ' + JSON.stringify({ test: 'world-places', pass: bad.length === 0, metrics: m, note: bad.map((b) => b.join(' ')).join(' | ') }));
  process.exitCode = bad.length ? 1 : 0;
}
