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
const TERRAIN_SRC = ['src/worldmap.js', 'src/terrainfn.js', 'src/roadnet.js', 'src/landfn.js', 'src/heightmap.js', 'src/bakefmt.js', 'build/jobs.mjs'];
export function jobsFor({ pack = false } = {}) {
  const out = [{ key: 'core', tier: 'embed', src: ['src/worldmap.js', 'src/terrainfn.js', 'src/roadnet.js', 'src/citylayout.js', 'src/bakefmt.js', 'build/jobs.mjs'] }];
  const tiles = (g, key, tier) => { const n = Math.ceil(100000 / (g * 256)); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out.push({ key: `${key}/${i}_${j}`, gen: 'tile', tier, g, i, j, src: TERRAIN_SRC }); };
  tiles(16, 't16', 'embed'); if (pack) tiles(8, 't8', 'pack');
  return out;
}

const fileHash = new Map();
const hashOf = (f) => fileHash.get(f) || (fileHash.set(f, sha(fs.readFileSync(path.join(root, f)))), fileHash.get(f));
const jobHash = (j) => sha(JSON.stringify([FORMAT, j.key, j.gen || '', j.g || 0, j.src.map(hashOf)])).slice(0, 24);

async function runJob(j) {
  const { RUN } = await imp('build/jobs.mjs'), { encodeChunk } = await imp('src/bakefmt.js');
  const raw = encodeChunk(await RUN[j.gen || j.key](j)), z = zlib.deflateRawSync(raw, { level: 9 });
  return { z, r: raw.length };
}

if (!isMainThread && workerData?.bakeWorker) {
  parentPort.on('message', async (j) => {
    try { const o = await runJob(j); parentPort.postMessage({ key: j.key, z: o.z, r: o.r }); } catch (e) { parentPort.postMessage({ key: j.key, err: String(e && e.stack || e) }); }
  });
}

// returns {embedded: Uint8Array (container), pack: Map(file -> Uint8Array) | null, manifest}
export async function bake({ pack = false, jobs: given = null, cache = true, threads = Math.max(1, Math.min(os.cpus().length, 4)) } = {}) {
  const jobs = given || jobsFor(pack), t0 = performance.now(), dir = path.join(root, 'build/baked/cache'); if (cache) fs.mkdirSync(dir, { recursive: true });
  const todo = jobs.filter((j) => pack || j.tier === 'embed'), results = new Map(), miss = [];
  for (const j of todo) {
    const f = path.join(dir, j.key.replace(/[^\w.-]/g, '_') + '-' + jobHash(j) + '.json');
    if (cache && fs.existsSync(f)) { const c = JSON.parse(fs.readFileSync(f, 'utf8')); results.set(j.key, { z: Buffer.from(c.z, 'base64'), r: c.r }); } else miss.push({ j, f });
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
          const it = miss.find((x) => x.j.key === m.key), z = Buffer.from(m.z); results.set(m.key, { z, r: m.r });
          if (cache) fs.writeFileSync(it.f, JSON.stringify({ z: z.toString('base64'), r: m.r }));
          if (--left === 0) resolve(); else feed(w);
        });
        w.on('error', reject); feed(w);
      }
    }).finally(() => workers.forEach((w) => w.terminate()));
  }
  const { buildContainer } = await imp('src/bakefmt.js');
  const entries = (tier) => todo.filter((j) => j.tier === tier).sort((a, b) => (a.key < b.key ? -1 : 1)).map((j) => ({ key: j.key, ...results.get(j.key) }));
  const embedded = buildContainer(entries('embed'), { tier: 'embed' });
  const out = { embedded, pack: null };
  if (pack) {
    const e = entries('pack'); out.pack = new Map();
    if (e.length) {
      const c = buildContainer(e, { tier: 'high' }); out.pack.set('high.pak', c);
      out.pack.set('index.json', Buffer.from(JSON.stringify({ format: FORMAT, tier: 'high', files: [{ name: 'high.pak', bytes: c.length, h: sha(c).slice(0, 32) }] }, null, 1)));
    }
  }
  out.manifest = {
    format: FORMAT, jobs: todo.map((j) => ({ key: j.key, tier: j.tier, bytes: results.get(j.key).z.length, raw: results.get(j.key).r })),
    bytes: embedded.length, data: sha(embedded).slice(0, 32), cached: todo.length - miss.length, ms: Math.round(performance.now() - t0),
  };
  return out;
}

if (isMainThread && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const withPack = process.argv.includes('--pack'), r = await bake({ pack: withPack }), dir = path.join(root, 'build/baked');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'world.bin'), r.embedded); fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(r.manifest, null, 1));
  if (r.pack) { const pd = path.join(dir, 'pack'); fs.mkdirSync(pd, { recursive: true }); for (const [n, b] of r.pack) fs.writeFileSync(path.join(pd, n), b); }
  console.log('baked', r.manifest.bytes, 'bytes', 'hash', r.manifest.data, `${r.manifest.ms} ms (${r.manifest.cached}/${r.manifest.jobs.length} from cache)`);
}
