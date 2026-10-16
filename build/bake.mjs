// Bake step: runs the pure world generators (worldmap.js, roadnet.js) once at build time and stores the result as one compressed binary
// container, so the browser does not regenerate the world on every start. Deterministic: same sources -> same bytes (the manifest's
// `data` hash proves it). Usage: `node build/bake.mjs` writes build/baked/world.bin + manifest.json; build.mjs embeds the same bytes.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SOURCES = ['src/worldmap.js', 'src/terrainfn.js', 'src/roadnet.js', 'src/bakefmt.js', 'src/citylayout.js'];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

export async function bake() {
  const t0 = performance.now();
  const imp = (f) => import(pathToFileURL(path.join(root, f)).href);
  const [{ world }, { net }, { pack }, { layouts }] = await Promise.all([imp('src/worldmap.js'), imp('src/roadnet.js'), imp('src/bakefmt.js'), imp('src/citylayout.js')]);
  const { json, blob } = pack({ world: world(), net: net(), layouts: layouts() });
  const jb = Buffer.from(json, 'utf8'), head = Buffer.alloc(8); head.writeUInt32LE(jb.length, 0); head.writeUInt32LE(blob.length, 4);
  const raw = Buffer.concat([head, jb, blob]), data = zlib.deflateRawSync(raw, { level: 9 });
  const manifest = {
    format: 1, sources: Object.fromEntries(SOURCES.map((f) => [f, sha(fs.readFileSync(path.join(root, f))).slice(0, 16)])),
    rawBytes: raw.length, bytes: data.length, data: sha(data).slice(0, 32), ms: Math.round(performance.now() - t0),
  };
  return { data, manifest };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { data, manifest } = await bake();
  const dir = path.join(root, 'build/baked'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'world.bin'), data); fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log('baked', manifest.bytes, 'bytes (raw', manifest.rawBytes + ')', 'hash', manifest.data, manifest.ms + ' ms');
}
