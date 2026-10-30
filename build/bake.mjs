// Bake step: runs the pure world generators once at build time and stores the results as a chunk container (src/bakefmt.js), so the browser
// does not regenerate the world on every start. Jobs (one per chunk or group of chunks) run in parallel worker threads and each result is cached
// under build/baked/cache by a hash of the job's source files, so a build after a change that touches one job redoes only that job.
// Deterministic: same sources -> same bytes (the manifest's `data` hash proves it). Usage: `node build/bake.mjs [--pack]` writes
// build/baked/world.bin (+ manifest.json); with --pack also build/baked/pack/ (the optional high-detail files). build.mjs writes the base
// world's files by province into the game's world/base/ (writeBase) and copies the pack to world/high/.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FORMAT = 2;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const imp = (f) => import(pathToFileURL(path.join(root, f)).href);

// A job makes one chunk: `src` lists the files whose content decides the result, `tier` says where it goes ('embed' = into the page, 'pack' = into
// the high-detail pack), `run` (in jobs.mjs) returns the object to store. Later steps add the terrain tiles, city tiles, forests... here.
// the compiled region (build/world/compile.mjs --emit) is a source of every job that reads the ground or the roads, when it exists
const REGION_SRC = fs.existsSync(path.join(root, 'build/baked/world/capital/region.bin')) ? ['build/baked/world/capital/region.bin', 'src/region.js'] : ['src/region.js'];
const TERRAIN_SRC = ['src/worldmap.js', 'src/terrainfn.js', 'src/settlements.js', 'src/roadnet.js', 'src/landfn.js', 'src/groundfn.js', 'src/heightmap.js', 'src/bakefmt.js', 'build/jobs.mjs',
  'src/roadgrade.js', 'src/countryplan.js', ...REGION_SRC];
// which tiles each city has (cheap to compute here: the plan only gives the radius)
const CITY_IDS = ['harbor', 'airfield', 'mid1', 'mid2', 'mid3', 'mid4'];
const CITY_TILES = await (async () => { const { CITY_DEFS } = await imp('src/worldmap.js'), { tilesOf } = await imp('src/citydetail.js'), o = {}; for (const id of CITY_IDS) { const d = CITY_DEFS.find((c) => c.id === id); o[id] = tilesOf({ R: d.r }); } return o; })();
// The region files (src/regions/<id>.js, ADR-0036) enter the hash as data, not as files, so that a change to one province redoes only what
// reads it. Every job depends on what the files say about the cities' places, the villages and anything else (`place`); a city's style,
// roofs and trees are read only by its own layout (seeded per city, citylayout.js) and tiles, so they are a dependency of that city's tiles
// and of the core (which stores every layout); the rules only the running game reads (cityrules.js, no job imports it: tests/unit/regions).
// A value nobody has sorted yet counts as `place` (redoing too much is safe, too little is not)
const CITY_OWN = new Set(['style', 'pitched', 'treeRows']), RUNTIME = new Set(['rules']);
const { REGIONS: PROVINCES, regionOf, regionCity } = await imp('src/regions/index.js');
const { cities, CITY_DEFS } = await imp('src/worldmap.js'), { CAPITAL } = await imp('src/koreamap.js'), { TILE_ORIGIN } = await imp('src/heightmap.js'), { VEG_ORIGIN } = await imp('src/vegfn.js');
const without = (f, drop) => f && { ...f, cities: f.cities.map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !drop.has(k)))) };
const regionDeps = () => {
  const place = sha(JSON.stringify(PROVINCES.map((r) => without(r.data, new Set([...CITY_OWN, ...RUNTIME]))))), of = (r) => JSON.stringify(without(r?.data, RUNTIME));
  return { place, all: sha(place + PROVINCES.map(of).join('\n')), of: (id) => sha(place + of(PROVINCES.find((r) => r.id === id))) };
};
export function jobsFor({ pack = false } = {}) {
  // `region`: the province a chunk belongs to (the file it goes into, WLD-21c), null = the core. A city's is its file's, else where its city
  // hall is (its wished place: the placement may push it off by up to 30 km, the airport city lies 13 km south of Incheon's hall). A tile
  // goes by its centre, and the ground a city flattens (1.15 r) goes with the city, so a province's file holds the ground of its own towns
  const D = regionDeps(), C = cities(), defOf = (id) => CITY_DEFS.find((d) => d.id === id);
  const cityRegion = (id) => regionCity(id)?.region || regionOf(defOf(id).x - CAPITAL.x, defOf(id).z - CAPITAL.z);
  const chunkRegion = (x, z) => { const c = C.find((q) => Math.hypot(x - q.x, z - q.z) < q.r * 1.15); return c ? cityRegion(c.id) : regionOf(x, z); };
  const out = [{ key: 'core', tier: 'embed', region: null, dep: D.all, src: ['src/worldmap.js', 'src/terrainfn.js', 'src/settlements.js', 'src/roadnet.js', 'src/citylayout.js', 'src/bakefmt.js', 'build/jobs.mjs', ...REGION_SRC] }];
  const tiles = (g, key, tier) => {
    const n = Math.ceil(100000 / (g * 256)), size = g * 256;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out.push({ key: `${key}/${i}_${j}`, gen: 'tile', tier, g, i, j, region: chunkRegion(TILE_ORIGIN.x + (i + 0.5) * size, TILE_ORIGIN.z + (j + 0.5) * size), dep: D.place, src: TERRAIN_SRC });
  };
  tiles(16, 't16', 'embed'); if (pack) tiles(8, 't8', 'pack');
  // where trees, grass and rocks grow (vegfn.js): one byte per 32 m cell, tiles of 4096 m
  for (let j = 0; j < 25; j++) for (let i = 0; i < 25; i++) out.push({ key: `veg/${i}_${j}`, gen: 'veg', tier: 'embed', i, j, region: chunkRegion(VEG_ORIGIN.x + (i + 0.5) * 4096, VEG_ORIGIN.z + (j + 0.5) * 4096), dep: D.place, src: [...TERRAIN_SRC, 'src/vegfn.js'] });
  // the small things of the cities (citydetail.js): one chunk per city tile; the pack makes the denser variant under the same keys
  const CITY_SRC = ['src/worldmap.js', 'src/citylayout.js', 'src/citydetail.js', 'src/bakefmt.js', 'build/jobs.mjs'];
  for (const hi of pack ? [false, true] : [false]) for (const id of CITY_IDS) {
    const region = cityRegion(id), dep = D.of(region);
    for (const [i, j] of CITY_TILES[id]) out.push({ key: `city/${id}/${i}_${j}`, gen: 'citytile', tier: hi ? 'pack' : 'embed', id, i, j, hi, region, dep, src: CITY_SRC });
  }
  return out;
}

// A job's sources are its listed files and every module they import, followed through `import ... from './x.js'` and the bake's
// `imp('src/x.js')` (listing them by hand had left out the elevation, the rivers and the OSM roads the ground is made of). The region files
// are not followed: their data is the job's `dep` (above)
const fileHash = new Map(), deps = new Map();
const hashOf = (f) => fileHash.get(f) || (fileHash.set(f, sha(fs.readFileSync(path.join(root, f)))), fileHash.get(f));
const isRegionFile = (f) => /^src\/regions\/(?!index\.js$)[\w-]+\.js$/.test(f);
function importsOf(f) {
  if (deps.has(f)) return deps.get(f);
  const s = /\.m?js$/.test(f) ? fs.readFileSync(path.join(root, f), 'utf8') : '', dir = path.posix.dirname(f), found = [];
  for (const m of s.matchAll(/(?:^|\n)\s*(?:import\s*|(?:import|export)\b[^'"]*?\bfrom\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) found.push(path.posix.normalize(path.posix.join(dir, m[1])));
  for (const m of s.matchAll(/\bimp\(\s*'([^']+)'\s*\)/g)) found.push(m[1]);
  // a match inside a comment may name a file that is not there; a real import of a missing file fails the job anyway
  const out = found.filter((g) => fs.existsSync(path.join(root, g))); deps.set(f, out); return out;
}
export function sourcesOf(src) {
  const seen = new Set(), todo = [...src];
  while (todo.length) { const f = todo.pop(); if (seen.has(f) || isRegionFile(f)) continue; seen.add(f); todo.push(...importsOf(f)); }
  return [...seen].sort();
}
const rid = (j) => j.tier + ':' + j.key;
export const jobHash = (j) => sha(JSON.stringify([FORMAT, j.tier, j.key, j.gen || '', j.g || 0, j.hi ? 1 : 0, j.dep || '', sourcesOf(j.src).map((f) => [f, hashOf(f)])])).slice(0, 24);

async function runJob(j) {
  const { RUN } = await imp('build/jobs.mjs'), { encodeChunk } = await imp('src/bakefmt.js');
  const raw = encodeChunk(await RUN[j.gen || j.key](j)), z = zlib.deflateRawSync(raw, { level: 9 });
  return { z, r: raw.length };
}

if (!isMainThread && workerData?.bakeWorker) {
  parentPort.on('message', async (j) => {
    try { const o = await runJob(j); parentPort.postMessage({ key: rid(j), z: o.z, r: o.r }); } catch (e) { parentPort.postMessage({ key: rid(j), err: String(e && e.stack || e) }); }
  });
}

// returns {embedded: Uint8Array (container), pack: Map(file -> Uint8Array) | null, manifest}
export async function bake({ pack = false, jobs: given = null, cache = true, threads = Math.max(1, Math.min(os.cpus().length, 4)) } = {}) {
  const jobs = given || jobsFor({ pack }), t0 = performance.now(), dir = path.join(root, 'build/baked/cache'); if (cache) fs.mkdirSync(dir, { recursive: true });
  const todo = jobs.filter((j) => pack || j.tier === 'embed'), results = new Map(), miss = [];
  for (const j of todo) {
    const f = path.join(dir, j.key.replace(/[^\w.-]/g, '_') + '-' + jobHash(j) + '.json');
    if (cache && fs.existsSync(f)) { const c = JSON.parse(fs.readFileSync(f, 'utf8')); results.set(rid(j), { z: Buffer.from(c.z, 'base64'), r: c.r }); } else miss.push({ j, f });
  }
  if (miss.length) {
    const nw = Math.min(threads, miss.length), workers = [];
    await new Promise((resolve, reject) => {
      let next = 0, left = miss.length;
      const feed = (w) => { if (next < miss.length) w.postMessage(miss[next++].j); };
      for (let i = 0; i < nw; i++) {
        const w = new Worker(new URL(import.meta.url), { workerData: { bakeWorker: true } }); workers.push(w);
        w.on('message', (m) => {
          if (m.err) return reject(new Error(m.err));
          const it = miss.find((x) => rid(x.j) === m.key), z = Buffer.from(m.z); results.set(m.key, { z, r: m.r });
          if (cache) fs.writeFileSync(it.f, JSON.stringify({ z: z.toString('base64'), r: m.r }));
          if (--left === 0) resolve(); else feed(w);
        });
        w.on('error', reject); feed(w);
      }
    }).finally(() => workers.forEach((w) => w.terminate()));
  }
  // the cache keeps only what the current sources use (a changed source leaves its old results behind)
  if (cache && jobs === given) { /* a partial job list (tests) must not prune */ } else if (cache) {
    const keep = new Set(jobsFor({ pack: true }).map((j) => j.key.replace(/[^\w.-]/g, '_') + '-' + jobHash(j) + '.json'));
    for (const f of fs.readdirSync(dir)) if (!keep.has(f)) fs.unlinkSync(path.join(dir, f));
  }
  const { buildContainer } = await imp('src/bakefmt.js');
  const entries = (tier) => todo.filter((j) => j.tier === tier).sort((a, b) => (a.key < b.key ? -1 : 1)).map((j) => ({ key: j.key, region: j.region, ...results.get(rid(j)) }));
  // the base world's id (from its chunks) goes into every world file: the page refuses a pack made for another world (detail.js), as the high
  // detail's 8 m ground from an older bake stood up to 1.4 km off the base ground (BLD-07)
  const emb = entries('embed'), world = sha(emb.map((e) => e.key + ':' + sha(e.z)).join('\n')).slice(0, 16);
  // the world files by province (ADR-0036, WLD-21c): core.pak (the core chunk and the sea) and <id>.pak for each province with chunks, listed in
  // the tier's index.json; a chunk keeps its key and bytes, so the readers of the store do not change. `embedded` is the same chunks in one
  // container (the tests, build/baked/world.bin)
  const split = (e, tier) => {
    const by = new Map([['core', []]]);
    for (const x of e) { const n = !x.region || x.region === 'sea' ? 'core' : x.region; if (!by.has(n)) by.set(n, []); by.get(n).push(x); }
    const files = new Map(), list = [], names = [...by.keys()].filter((n) => by.get(n).length).sort((a, b) => (a === 'core' ? -1 : b === 'core' ? 1 : a < b ? -1 : 1));
    for (const n of names) {
      const c = buildContainer(by.get(n), { tier, world, region: n }); files.set(n + '.pak', c);
      list.push({ name: n + '.pak', region: n === 'core' ? null : n, chunks: by.get(n).length, bytes: c.length, h: sha(c).slice(0, 32) });
    }
    files.set('index.json', Buffer.from(JSON.stringify({ format: FORMAT, tier, world, files: list }, null, 1)));
    return files;
  };
  const embedded = buildContainer(emb, { tier: 'embed', world });
  const out = { embedded, base: split(emb, 'embed'), pack: null };
  if (pack) { const e = entries('pack'); out.pack = e.length ? split(e, 'high') : new Map(); }
  out.manifest = {
    format: FORMAT, world, jobs: todo.map((j) => ({ key: j.key, tier: j.tier, bytes: results.get(rid(j)).z.length, raw: results.get(rid(j)).r })),
    bytes: embedded.length, data: sha(embedded).slice(0, 32), cached: todo.length - miss.length, ms: Math.round(performance.now() - t0),
  };
  return out;
}

// writes a bake's pack into build/baked/pack/ next to the asset pack (build/assets/pack.mjs), whose line in the index stays; the world files
// of an older bake that this one does not make go (high.pak was the one file before WLD-21c, and a province can lose its last chunk)
export function writePack(r, dir = path.join(root, 'build/baked/pack')) {
  if (!r.pack?.has('index.json')) return;
  const ixf = path.join(dir, 'index.json'); fs.mkdirSync(dir, { recursive: true });
  const prev = fs.existsSync(ixf) ? JSON.parse(fs.readFileSync(ixf, 'utf8')).files : [], isWorld = (f) => 'region' in f || f.name === 'high.pak';
  for (const f of prev) if (isWorld(f) && !r.pack.has(f.name)) fs.rmSync(path.join(dir, f.name), { force: true });
  for (const [n, b] of r.pack) if (n !== 'index.json') fs.writeFileSync(path.join(dir, n), b);
  const ix = JSON.parse(r.pack.get('index.json')); ix.files = ix.files.concat(prev.filter((f) => !isWorld(f))); fs.writeFileSync(ixf, JSON.stringify(ix, null, 1));
}
// writes a bake's base world files into a folder (the game's world/base/, bakedload.js)
export function writeBase(r, dir) {
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (const [n, b] of r.base) fs.writeFileSync(path.join(dir, n), b);
}

if (isMainThread && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const withPack = process.argv.includes('--pack'), r = await bake({ pack: withPack }), dir = path.join(root, 'build/baked');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'world.bin'), r.embedded); fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(r.manifest, null, 1));
  if (r.pack) writePack(r);
  console.log('baked', r.manifest.bytes, 'bytes', 'hash', r.manifest.data, `${r.manifest.ms} ms (${r.manifest.cached}/${r.manifest.jobs.length} from cache)`);
}
