// The region files (src/regions/, ADR-0036): the 17 provinces are all there with a name, a box and a city hall; every file in the folder is one
// of them and is listed; a city belongs to one province only, lies inside that province's box, and its data is what the generators read
// (worldmap CITY_DEFS, citylayout STYLES); and the bake lists every region file with the jobs that read the cities.
import fs from 'node:fs';
import { REGIONS, IDS, regionCity } from '../../src/regions/index.js';
import { CITY_DEFS } from '../../src/worldmap.js';
import { STYLES } from '../../src/citylayout.js';
import { project } from '../../src/koreamap.js';
import { jobsFor } from '../../build/bake.mjs';

const bad = [];
if (REGIONS.length !== 17 || new Set(REGIONS.map((r) => r.id)).size !== 17) bad.push(['provinces', REGIONS.length]);
for (const r of REGIONS) if (!r.name || !r.hall || !(r.box.w < r.box.e && r.box.s < r.box.n)) bad.push(['province data', r.id]);
// a file in the folder is a province of the list and the list imports it (else its cities would silently be missing)
const files = fs.readdirSync(new URL('../../src/regions/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'index.js').map((f) => f.slice(0, -3));
for (const f of files) {
  if (!IDS.some(([id]) => id === f)) bad.push(['file of no province', f]);
  const m = (await import(`../../src/regions/${f}.js`)).default;
  if (m.id !== f) bad.push(['file id', f, m.id]);
  if (!REGIONS.find((r) => r.id === f).own) bad.push(['file not listed in index.js', f]);
}
const seen = new Map();
for (const r of REGIONS) for (const c of r.cities) {
  const id = c.def.id; if (seen.has(id)) bad.push(['city in two provinces', id, seen.get(id), r.id]); seen.set(id, r.id);
  // a city lies in its province's box (the box in game metres from its corners; a few hundred metres of slack for the projection)
  const a = project(r.box.w, r.box.n), b = project(r.box.e, r.box.s), m = 500;
  if (c.def.x < Math.min(a.x, b.x) - m || c.def.x > Math.max(a.x, b.x) + m || c.def.z < Math.min(a.z, b.z) - m || c.def.z > Math.max(a.z, b.z) + m) bad.push(['city outside its province', id, r.id]);
  if (regionCity(id).region !== r.id) bad.push(['regionCity', id]);
  // the generators read the file's data, the same objects
  if (!CITY_DEFS.includes(c.def)) bad.push(['CITY_DEFS does not take the def', id]);
  if (c.style && STYLES[id] !== c.style) bad.push(['STYLES does not take the style', id]);
}
// every job that reads the cities lists every region file (the hash does not follow imports)
const regionSrc = files.map((f) => `src/regions/${f}.js`).concat('src/regions/index.js');
for (const j of jobsFor({ pack: true })) if (j.src.includes('src/worldmap.js') && regionSrc.some((f) => !j.src.includes(f))) { bad.push(['job without the region files', j.key]); break; }
console.log('RESULT ' + JSON.stringify({ test: 'regions', pass: bad.length === 0, metrics: { provinces: REGIONS.length, files: files.length, cities: seen.size }, note: bad.slice(0, 5).map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
