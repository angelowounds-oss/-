// The chain of one compiled region (ADR-0044) in build/baked/world/<id>/: compile, grade, buildings, the street fit with its grade and buildings again,
// the streets. Each step runs again only when its output is missing or older than what it reads, so a chain that stopped part way goes on from the step
// that failed. build/build.mjs runs it for the capital and WORLD_PROVINCES; build/world/compile-all.mjs (EV-09) for the whole country, piece by piece.
import fs from 'node:fs';

// the files under build/world/ that are not the compiler (a change to one of them does not make the regions again); joins.mjs is grade's (WLD-36)
export const NOT_COMPILER = ['blocks.mjs', 'grade.mjs', 'joins.mjs', 'streets.mjs', 'streetfurn.mjs', 'realdetail.mjs', 'osmbuildings.mjs', 'fetch-detail.mjs', 'bbbike-detail.mjs', 'bbbike-roads.mjs', 'streetpoints.mjs', 'seouldata.mjs', 'fit.mjs', 'sites.mjs', 'floaters.mjs', 'corridor.mjs', 'blockers.mjs', 'mergetiles.mjs', 'pbf-store.py', 'pieces.mjs', 'chain.mjs', 'compile-all.mjs', 'step.mjs'];
// the V8 heap of a region's steps (MB): the capital 12 GB, a province piece 14 GB (Gyeonggi took 10.4 GB)
export const heapOf = (id) => (id === 'capital' ? 12000 : 14000);

// out is missing, or a file of list that exists is newer than it
const newer = (out, list) => !fs.existsSync(out) || list.some((f) => fs.existsSync(f) && fs.statSync(f).mtimeMs > fs.statSync(out).mtimeMs);

// the steps of region `id` that are due, in order, each as run(script, heap, ...args), synchronous (a step reads what the one before it wrote).
// opt.V is the height scale as the compiler's --v argument (koreamap.js V_SCALE); opt.root the repository folder (default the working folder).
// Returns the scripts run.
export function regionChain(id, run, opt) {
  const root = opt.root || '.', at = (f) => root + '/' + f, ran = [], w = (f) => at('build/world/' + f);
  const srcs = [...fs.readdirSync(at('build/world')).filter((f) => !NOT_COMPILER.includes(f)).map(w), at('src/koreamap.js')];   // the scale lives in koreamap.js
  const cache = at('build/.osm-cache/world');
  const detailFiles = (fs.existsSync(cache) ? fs.readdirSync(cache) : []).filter((f) => f.startsWith('detail-') && f.endsWith('.json')).map((f) => cache + '/' + f).concat(fs.existsSync(at('build/.osm-cache/pbf/meta.json')) ? [at('build/.osm-cache/pbf/meta.json')] : []);
  const rel = 'build/baked/world/' + id, dir = at(rel), out = dir + '/region.bin', bout = dir + '/buildings.bin', heap = heapOf(id);
  const step = (script, ...a) => { ran.push(script); run(script, heap, ...a); };
  // the region (DEM and OSM are cached), again when it is missing or older than the compiler
  if (newer(out, srcs)) step('compile.mjs', '--region', id, '--v', String(opt.V), '--roads', '--emit');
  // the ground contract (grade.mjs with its join pass): the raster conditioned to the roads, bridges and tunnels; again after a compile or when the rules changed
  if (newer(dir + '/grade-stats.json', [out, w('grade.mjs'), w('joins.mjs')])) step('grade.mjs', rel + '/region.bin');
  // the procedural and real buildings (WLD-24a, WLD-24h) on the region: again when it, their generator or the district table is newer
  if (newer(bout, [out, ...['blocks.mjs', 'emit.mjs', 'realdetail.mjs', 'osmbuildings.mjs', 'fetch-detail.mjs'].map(w), at('src/districts.js'), at('src/koreamap.js'), ...detailFiles])) step('blocks.mjs', rel + '/region.bin');
  // the residential streets fitted to the walls of the real buildings (WLD-33, fit.mjs), then graded and built on again: after a compile (grade.mjs made a
  // new raw copy) or when the fit's rules changed
  if (newer(dir + '/fit-stats.json', [w('fit.mjs'), w('corridor.mjs'), dir + '/region-raw.bin'])) { step('fit.mjs', rel); step('grade.mjs', rel + '/region.bin'); step('blocks.mjs', rel + '/region.bin'); }
  // the street data (WLD-24g: junctions and pavement runs) from the roads and the buildings
  if (newer(dir + '/streets.bin', [out, bout, ...['streets.mjs', 'streetfurn.mjs', 'streetpoints.mjs', 'emit.mjs', 'realdetail.mjs', 'seouldata.mjs', 'osmbuildings.mjs'].map(w), at('src/streetgeo.js'), ...['crossings.zip', 'signals.csv'].map((f) => at('build/.osm-cache/seoul/' + f))])) step('streets.mjs', rel + '/region.bin');
  return ran;
}
