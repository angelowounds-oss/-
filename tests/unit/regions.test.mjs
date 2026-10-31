// The region files (src/regions/, ADR-0036): the 17 provinces are all there with a name, a box and a city hall; every file in the folder is one
// of them and is listed; a city belongs to one province only, lies inside that province's box, and its data is what the generators read
// (worldmap CITY_DEFS, citylayout STYLES). regionOf puts every city hall in its own province. The bake (WLD-21b): every job has a province,
// a change to one file redoes only what reads it (a style: that province's city tiles and the core; the rules: nothing; a city's place:
// everything), and the generators agree (a style change leaves the other cities' layouts and the ground under the city as they were).
import fs from 'node:fs';
import { REGIONS, IDS, regionCity, regionOf } from '../../src/regions/index.js';
import { CITY_DEFS, cities } from '../../src/worldmap.js';
import { STYLES, layouts } from '../../src/citylayout.js';
import { project, CAPITAL } from '../../src/koreamap.js';
import { jobsFor, jobHash, sourcesOf } from '../../build/bake.mjs';
import { RUN } from '../../build/jobs.mjs';
import { encodeChunk } from '../../src/bakefmt.js';
import { TILE_ORIGIN } from '../../src/heightmap.js';
import { VEG_ORIGIN } from '../../src/vegfn.js';

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
const local = (p) => [p.x - CAPITAL.x, p.z - CAPITAL.z];
for (const r of REGIONS) if (regionOf(...local(project(r.hall.lon, r.hall.lat))) !== r.id) bad.push(['regionOf of the city hall', r.id]);
if (regionOf(...local(project(124.0, 33.0))) !== 'sea') bad.push(['regionOf at sea']);
const seen = new Map();
for (const r of REGIONS) for (const c of r.cities) {
  const id = c.def.id; if (seen.has(id)) bad.push(['city in two provinces', id, seen.get(id), r.id]); seen.set(id, r.id);
  // a city lies in its province's box (the box in game metres from its corners; a few hundred metres of slack for the projection)
  const a = project(r.box.w, r.box.n), b = project(r.box.e, r.box.s), m = 500;
  if (c.def.x < Math.min(a.x, b.x) - m || c.def.x > Math.max(a.x, b.x) + m || c.def.z < Math.min(a.z, b.z) - m || c.def.z > Math.max(a.z, b.z) + m) bad.push(['city outside its province', id, r.id]);
  if (regionOf(...local(c.def)) !== r.id) bad.push(['regionOf of the city', id, regionOf(...local(c.def)), r.id]);
  if (regionCity(id).region !== r.id) bad.push(['regionCity', id]);
  // the generators read the file's data, the same objects
  if (!CITY_DEFS.includes(c.def)) bad.push(['CITY_DEFS does not take the def', id]);
  if (c.style && STYLES[id] !== c.style) bad.push(['STYLES does not take the style', id]);
}

// ---- the bake: every job has a province, the region files are data (not sources), the rules are read by no job
const jobs = jobsFor({ pack: true }), known = new Set([...IDS.map(([id]) => id), 'sea']), per = {};
for (const j of jobs) { if (j.key === 'core' ? j.region !== null : !known.has(j.region)) bad.push(['job region', j.key, j.region]); per[j.region ?? 'core'] = (per[j.region ?? 'core'] || 0) + 1; }
const air = jobs.filter((j) => j.id === 'airfield');
if (air.some((j) => j.region !== 'incheon')) bad.push(['airport city chunks not in incheon']);
const closure = new Set(jobs.flatMap((j) => sourcesOf(j.src)));
for (const f of closure) if (/^src\/regions\/(?!index)/.test(f)) bad.push(['region file hashed as a source', f]);
if (closure.has('src/cityrules.js')) bad.push(['a bake job reads cityrules.js: the rules must enter the hash']);
for (const f of ['src/koreadem.js', 'src/osmroads.js', 'src/korerivers.js']) if (!sourcesOf(jobs.find((j) => j.key === 't16/12_12').src).includes(f)) bad.push(['import not followed', f]);

// ---- a build of some provinces (REGIONS=, WLD-21d): their chunks and the core file's, under the same hashes (the cache serves both builds)
const only = jobsFor({ pack: true, regions: ['incheon'] }), fullHash = new Map(jobs.map((j) => [j.tier + ':' + j.key, jobHash(j)]));
if (only.some((j) => j.region && j.region !== 'sea' && j.region !== 'incheon') || only.length !== per.core + per.sea + per.incheon) bad.push(['REGIONS=incheon jobs', only.length]);
if (only.some((j) => jobHash(j) !== fullHash.get(j.tier + ':' + j.key))) bad.push(['REGIONS=incheon hashes differ from the full build']);

// ---- a change to one region file redoes only what reads it
const h0 = new Map(jobs.map((j) => [j.tier + ':' + j.key, jobHash(j)]));
const changed = () => { const o = new Set(); for (const j of jobsFor({ pack: true })) if (jobHash(j) !== h0.get(j.tier + ':' + j.key)) o.add(j.key === 'core' ? 'core' : j.gen === 'citytile' ? 'city/' + j.id : j.key.split('/')[0]); return [...o].sort().join(','); };
const inc = REGIONS.find((r) => r.id === 'incheon').data.cities.find((c) => c.def.id === 'airfield'), cases = {};   // the file's own object (regionCity gives a copy)
const tryEdit = (name, obj, k, v, want) => { const old = obj[k]; obj[k] = v; cases[name] = changed(); obj[k] = old; if (cases[name] !== want) bad.push(['redone on ' + name, cases[name], 'want ' + want]); };
tryEdit('style', inc.style, 'hMax', inc.style.hMax + 1, 'city/airfield,core');
tryEdit('roofs', inc, 'pitched', 0.5, 'city/airfield,core');
tryEdit('rules', inc.rules, 'econ', 2, '');
tryEdit('place', inc.def, 'r', inc.def.r + 10, 'city/airfield,city/harbor,city/mid1,city/mid2,city/mid3,city/mid4,core,t16,t8,veg');
if (changed() !== '') bad.push(['hashes not back after the edits']);

// ---- the generators agree: with the airport city's style changed, the other layouts and the ground under it are the same bytes
const C = cities().find((c) => c.id === 'airfield'), T = { g: 16, i: Math.floor((C.x - TILE_ORIGIN.x) / 4096), j: Math.floor((C.z - TILE_ORIGIN.z) / 4096) }, V = { i: Math.floor((C.x - VEG_ORIGIN.x) / 4096), j: Math.floor((C.z - VEG_ORIGIN.z) / 4096) };
const bytes = async () => ({ layouts: new Map([...layouts()].map(([id, L]) => [id, Buffer.from(encodeChunk(L)).toString('base64')])), tile: Buffer.from(encodeChunk(await RUN.tile(T))).toString('base64'), veg: Buffer.from(encodeChunk(await RUN.veg(V))).toString('base64') });
const b0 = await bytes(); inc.style.hMax += 30; inc.style.pitch = [inc.style.pitch[0] + 20, inc.style.pitch[1]]; const b1 = await bytes(); inc.style.hMax -= 30; inc.style.pitch = [inc.style.pitch[0] - 20, inc.style.pitch[1]];
if (b0.layouts.get('airfield') === b1.layouts.get('airfield')) bad.push(['the style change did not change the airport layout (test is blind)']);
for (const [id, s] of b0.layouts) if (id !== 'airfield' && b1.layouts.get(id) !== s) bad.push(['style of incheon changed the layout of', id]);
if (b0.tile !== b1.tile) bad.push(['style of incheon changed the ground tile under it', `t16/${T.i}_${T.j}`]);
if (b0.veg !== b1.veg) bad.push(['style of incheon changed the vegetation under it']);

console.log('RESULT ' + JSON.stringify({ test: 'regions', pass: bad.length === 0, metrics: { onlyIncheon: only.length, provinces: REGIONS.length, files: files.length, cities: seen.size, jobs: jobs.length, sources: closure.size, perRegion: per, redone: cases }, note: bad.slice(0, 5).map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
