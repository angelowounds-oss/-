// Bake step: runs the pure world generators once at build time and stores the results as a chunk container (src/bakefmt.js), so the browser
// does not regenerate the world on every start. Jobs (one per chunk or group of chunks) run in parallel worker threads and each result is cached
// under build/baked/cache by a hash of the job's source files, so a build after a change that touches one job redoes only that job.
// Deterministic: same sources -> same bytes (the manifest's `data` hash proves it). Usage: `node build/bake.mjs [--pack]` writes
// build/baked/world.bin (+ manifest.json); with --pack also build/baked/pack/ (the optional high-detail files). build.mjs embeds world.bin.
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
// the region files (src/regions/, ADR-0036) hold the cities' places, styles and detail; imports are not followed by the hash, so they are listed
// with every job that reads the cities
const REGION_FILES = fs.readdirSync(path.join(root, 'src/regions')).filter((f) => f.endsWith('.js')).sort().map((f) => 'src/regions/' + f);
const TERRAIN_SRC = ['src/worldmap.js', ...REGION_FILES, 'src/terrainfn.js', 'src/settlements.js', 'src/roadnet.js', 'src/landfn.js', 'src/groundfn.js', 'src/heightmap.js', 'src/bakefmt.js', 'build/jobs.mjs',
  'src/roadgrade.js', 'src/countryplan.js', ...REGION_SRC];
// which tiles each city has (cheap to compute here: the plan only gives the radius)
const CITY_IDS = ['harbor', 'airfield', 'mid1', 'mid2', 'mid3', 'mid4'];
const CITY_TILES = await (async () => { const { CITY_DEFS } = await imp('src/worldmap.js'), { tilesOf } = await imp('src/citydetail.js'), o = {}; for (const id of CITY_IDS) { const d = CITY_DEFS.find((c) => c.id === id); o[id] = tilesOf({ R: d.r }); } return o; })();
export function jobsFor({ pack = false } = {}) {
  const out = [{ key: 'core', tier: 'embed', src: ['src/worldmap.js', ...REGION_FILES, 'src/terrainfn.js', 'src/settlements.js', 'src/roadnet.js', 'src/citylayout.js', 'src/bakefmt.js', 'build/jobs.mjs', ...REGION_SRC] }];
  const tiles = (g, key, tier) => { const n = Math.ceil(100000 / (g * 256)); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out.push({ key: `${key}/${i}_${j}`, gen: 'tile', tier, g, i, j, src: TERRAIN_SRC }); };
  tiles(16, 't16', 'embed'); if (pack) tiles(8, 't8', 'pack');
  // where trees, grass and rocks grow (vegfn.js): one byte per 32 m cell, tiles of 4096 m
  for (let j = 0; j < 25; j++) for (let i = 0; i < 25; i++) out.push({ key: `veg/${i}_${j}`, gen: 'veg', tier: 'embed', i, j, src: [...TERRAIN_SRC, 'src/vegfn.js'] });
  // the small things of the cities (citydetail.js): one chunk per city tile; the pack makes the denser variant under the same keys
  const CITY_SRC = ['src/worldmap.js', ...REGION_FILES, 'src/citylayout.js', 'src/citydetail.js', 'src/bakefmt.js', 'build/jobs.mjs'];
  for (const hi of pack ? [false, true] : [false]) for (const [ci, id] of CITY_IDS.entries()) { const L = CITY_TILES[id]; for (const [i, j] of L) out.push({ key: `city/${id}/${i}_${j}`, gen: 'citytile', tier: hi ? 'pack' : 'embed', id, i, j, hi, src: CITY_SRC }); void ci; }
  return out;
}

const fileHash = new Map();
const hashOf = (f) => fileHash.get(f) || (fileHash.set(f, sha(fs.readFileSync(path.join(root, f)))), fileHash.get(f));
const rid = (j) => j.tier + ':' + j.key;
const jobHash = (j) => sha(JSON.stringify([FORMAT, j.tier, j.key, j.gen || '', j.g || 0, j.hi ? 1 : 0, j.src.map(hashOf)])).slice(0, 24);

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
  const entries = (tier) => todo.filter((j) => j.tier === tier).sort((a, b) => (a.key < b.key ? -1 : 1)).map((j) => ({ key: j.key, ...results.get(rid(j)) }));
  // the base world's id (from its chunks) goes into the base container and into the pack: the page refuses a pack made for another world
  // (detail.js), as the high detail's 8 m ground from an older bake stood up to 1.4 km off the base ground (BLD-07)
  const emb = entries('embed'), world = sha(emb.map((e) => e.key + ':' + sha(e.z)).join('\n')).slice(0, 16);
  const embedded = buildContainer(emb, { tier: 'embed', world });
  const out = { embedded, pack: null };
  if (pack) {
    const e = entries('pack'); out.pack = new Map();
    if (e.length) {
      const c = buildContainer(e, { tier: 'high', world }); out.pack.set('high.pak', c);
      out.pack.set('index.json', Buffer.from(JSON.stringify({ format: FORMAT, tier: 'high', world, files: [{ name: 'high.pak', bytes: c.length, h: sha(c).slice(0, 32) }] }, null, 1)));
    }
  }
  out.manifest = {
    format: FORMAT, world, jobs: todo.map((j) => ({ key: j.key, tier: j.tier, bytes: results.get(rid(j)).z.length, raw: results.get(rid(j)).r })),
    bytes: embedded.length, data: sha(embedded).slice(0, 32), cached: todo.length - miss.length, ms: Math.round(performance.now() - t0),
  };
  return out;
}

// writes a bake's pack into build/baked/pack/ next to the asset pack (build/assets/pack.mjs), whose line in the index stays
export function writePack(r, dir = path.join(root, 'build/baked/pack')) {
  const ixf = path.join(dir, 'index.json'); fs.mkdirSync(dir, { recursive: true });
  const old = fs.existsSync(ixf) ? JSON.parse(fs.readFileSync(ixf, 'utf8')).files.filter((f) => f.name !== 'high.pak') : [];
  for (const [n, b] of r.pack) { if (n !== 'index.json') { fs.writeFileSync(path.join(dir, n), b); continue; } const ix = JSON.parse(b); ix.files = ix.files.concat(old); fs.writeFileSync(ixf, JSON.stringify(ix, null, 1)); }
}

if (isMainThread && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const withPack = process.argv.includes('--pack'), r = await bake({ pack: withPack }), dir = path.join(root, 'build/baked');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'world.bin'), r.embedded); fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(r.manifest, null, 1));
  if (r.pack) writePack(r);
  console.log('baked', r.manifest.bytes, 'bytes', 'hash', r.manifest.data, `${r.manifest.ms} ms (${r.manifest.cached}/${r.manifest.jobs.length} from cache)`);
}
