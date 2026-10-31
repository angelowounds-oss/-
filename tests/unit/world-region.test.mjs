// The compiled region (src/region.js, build/world/compile.mjs --emit) as the ground: inside it the ground is the compiled raster, the capital keeps
// its own ground, the bands blend without cliffs, and the Han reads as inland water. Skips with a note when the region was never compiled.
import path from 'node:path';
import { project, CAPITAL } from '../../src/koreamap.js';
import { readRegion } from '../../build/world/emit.mjs';

const file = path.join(path.dirname(new URL(import.meta.url).pathname), '../../build/baked/world/capital/region.bin');
globalThis.__REGION = readRegion(file);
const bad = [], m = {};
if (!globalThis.__REGION) {
  console.log('RESULT ' + JSON.stringify({ test: 'world-region', pass: true, metrics: {}, note: 'no compiled region (run node build/world/compile.mjs --region capital --v 1/4 --roads --emit)' }));
} else {
  const { regionWeight, regionHeight, regionWater, regionRoads } = await import('../../src/region.js');
  const { landProc, physProc, worldProc } = await import('../../src/landfn.js');
  const R = globalThis.__REGION;
  // 1. inside: the ground is the compiled raster (0.1 m steps)
  let n = 0, off = 0;
  for (let k = 0; k < 4000; k++) {
    const x = R.x0 + ((k * 7919) % (R.nx - 1)) * R.g + 3.3, z = R.z0 + ((k * 104729) % (R.nz - 1)) * R.g + 5.1;
    if (regionWeight(x, z) < 1) continue;
    n++; if (Math.abs(landProc(x, z, 16) - regionHeight(x, z)) > 0.1) off++;
  }
  m.insideSamples = n; if (n < 1000 || off) bad.push(['inside ground differs from the compiled raster', off, n]);
  // 2. the capital keeps its own ground
  if (regionWeight(0, 0) !== 0 || regionWeight(R.keep - 1, 0) !== 0) bad.push(['keep zone not left to the city']);
  // 3. the bands: blending adds no slope beyond 0.35 to the steeper of the two grounds it blends (the real mountains are steep on their own; at V=1 the two grounds differ by real heights, so the blend is steeper than at V=1/4: 0.32 measured), along
  // lines out from the capital and in from the edges
  let worst = 0;
  const walk = (x0, z0, dx, dz, len) => {
    let p = [landProc(x0, z0, 16), worldProc(x0, z0, 16), regionHeight(x0, z0)];
    for (let s = 8; s <= len; s += 8) {
      const x = x0 + dx * s, z = z0 + dz * s, q = [landProc(x, z, 16), worldProc(x, z, 16), regionHeight(x, z)];
      const own = Math.max(Math.abs(q[1] - p[1]), q[2] === q[2] && p[2] === p[2] ? Math.abs(q[2] - p[2]) : 0);
      worst = Math.max(worst, (Math.abs(q[0] - p[0]) - own) / 8); p = q;
    }
  };
  for (let a = 0; a < 16; a++) { const c = Math.cos(a / 16 * 6.2832), s = Math.sin(a / 16 * 6.2832), r0 = R.keep / Math.max(Math.abs(c), Math.abs(s)); walk(c * r0, s * r0, c, s, R.band * 1.6); }
  const x1 = R.x0 + (R.nx - 1) * R.g, z1 = R.z0 + (R.nz - 1) * R.g;
  for (let t = 0.1; t < 1; t += 0.2) { walk(R.x0 - 200, R.z0 + (z1 - R.z0) * t, 1, 0, R.edge + 400); walk(x1 + 200, R.z0 + (z1 - R.z0) * t, -1, 0, R.edge + 400); }
  m.bandExtraSlope = +worst.toFixed(3); if (worst > 0.35) bad.push(['the band adds more than 0.35 of slope', worst.toFixed(3)]);
  // 4. water: the Han at Haengju (a point of its OpenStreetMap centre line) is inland water, the sea off Incheon is sea, and the physics ground fills a bridge deck
  const loc = (lon, lat) => { const p = project(lon, lat); return [p.x - CAPITAL.x, p.z - CAPITAL.z]; };
  const han = regionWater(...loc(126.8163, 37.5940)), sea = regionWater(...loc(126.50, 37.45));
  m.han = han; m.sea = sea;
  if (!han || han.cls !== 2) bad.push(['the Han at Haengju is not inland water', JSON.stringify(han)]);
  if (!sea || sea.cls !== 1) bad.push(['the sea off Incheon is not sea', JSON.stringify(sea)]);
  let deck = 0, filled = 0;
  for (const r of regionRoads()) for (let i = 1; i + 1 < r.x.length; i++) if (r.cls[i] === 1 && r.cls[i - 1] === 1 && r.cls[i + 1] === 1) { deck++; if (Math.abs(physProc(r.x[i], r.z[i], 16) - (r.y[i] - 0.25)) < 0.3 || regionWeight(r.x[i], r.z[i]) < 1) filled++; }
  m.bridgeSamples = deck; if (!deck || filled / deck < 0.99) bad.push(['physics ground does not fill bridge decks', filled, deck]);
  m.roads = regionRoads().length;
  console.log('RESULT ' + JSON.stringify({ test: 'world-region', pass: bad.length === 0, metrics: m, note: bad.map((b) => b.join(' ')).join(' | ') }));
  process.exitCode = bad.length ? 1 : 0;
}
