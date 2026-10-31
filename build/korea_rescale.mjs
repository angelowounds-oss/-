// Re-projects the embedded Korea data (src/korearoads.js, korerivers.js, koreaplaces.js) from the scale it was converted at to KOREA_SCALE (WLD-23b-2).
// The projection is azimuthal equidistant, so every map coordinate is proportional to 1/scale: changing the scale is one multiplication, no raw OSM
// extract is needed (the extracts were never committed, and the simplification tolerance stays the same in real metres). Idempotent: each file says
// the scale it is at (ROADS.scale, RIVERS_SCALE, PLACES_SCALE), and a file already at KOREA_SCALE is left alone.
// Usage: node build/korea_rescale.mjs
import fs from 'node:fs';
import { KOREA_SCALE } from '../src/koreamap.js';

const R1 = (v) => Math.round(v * 10) / 10;
const pts = (a, f) => a.map(([x, z]) => [R1(x * f), R1(z * f)]);
const head = (file) => fs.readFileSync(file, 'utf8').split('\n')[0];

{
  const file = 'src/korearoads.js', { ROADS } = await import('../' + file), f = ROADS.scale / KOREA_SCALE;
  if (Math.abs(f - 1) > 1e-9) {
    const out = { ...ROADS, scale: KOREA_SCALE, roads: ROADS.roads.map((r) => ({ ...r, pts: pts(r.pts, f) })) };
    fs.writeFileSync(file, head(file) + '\nexport const ROADS = ' + JSON.stringify(out) + ';\n');
    console.log(file, 'x' + f);
  }
}
{
  const file = 'src/korerivers.js', mod = await import('../' + file), have = mod.RIVERS_SCALE || 6.5, f = have / KOREA_SCALE;
  if (Math.abs(f - 1) > 1e-9) {
    const out = mod.RIVERS.map((r) => ({ ...r, pts: pts(r.pts, f) }));   // widths are real metres and stay
    fs.writeFileSync(file, head(file) + `\nexport const RIVERS_SCALE = ${KOREA_SCALE};\nexport const RIVERS = ` + JSON.stringify(out) + ';\n');
    console.log(file, 'x' + f);
  }
}
{
  const file = 'src/koreaplaces.js', mod = await import('../' + file), have = mod.PLACES_SCALE || 6.5, f = have / KOREA_SCALE;
  if (Math.abs(f - 1) > 1e-9) {
    const out = mod.PLACES.map((p) => ({ ...p, x: Math.round(p.x * f), z: Math.round(p.z * f) }));
    fs.writeFileSync(file, head(file) + `\nexport const PLACES_SCALE = ${KOREA_SCALE};\nexport const PLACES = ` + JSON.stringify(out) + ';\n');
    console.log(file, 'x' + f);
  }
}
