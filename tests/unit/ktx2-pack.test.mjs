// The high-detail asset pack (ADR-0029): pack.mjs turns the manifest's recipes into KTX2 textures (right identifier, mip levels down to 1 px,
// sRGB only for colour) inside a chunk container that also carries the Basis transcoder, and the pack folder's index lists the file with its size.
// Needs the sources downloaded (node build/assets/fetch.mjs --fetch); without them the test says so and fails.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const { packAssets } = await import('../../build/assets/pack.mjs');
const { openContainer, decodeChunk } = await import('../../src/bakefmt.js');
const zlib = await import('node:zlib');
const bad = [], m = {};
const t0 = performance.now(), r = await packAssets().catch((e) => { bad.push(['pack failed', String(e.message || e)]); return null; });
m.ms = Math.round(performance.now() - t0);
if (r) {
  const file = path.join(ROOT, 'build/baked/pack/assets.pak'), bytes = new Uint8Array(fs.readFileSync(file));
  const c = await openContainer(async (o, n) => bytes.subarray(o, o + n)), get = (k) => { const e = c.chunks[k]; return decodeChunk(new Uint8Array(zlib.inflateRawSync(bytes.subarray(c.start + e.o, c.start + e.o + e.z)))); };   // a plain array, as in the page (a node Buffer's slice is a view)
  m.bytes = bytes.length; m.textures = Object.keys(c.chunks).filter((k) => k.startsWith('asset/tex/')).length;
  if (!c.chunks['asset/basis']) bad.push(['no transcoder chunk']); else { const b = get('asset/basis'); if (!b.js.includes('BASIS') || b.wasm[0] !== 0 || b.wasm[1] !== 0x61) bad.push(['transcoder chunk damaged']); }
  const ID = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb];
  for (const k of Object.keys(c.chunks).filter((k) => k.startsWith('asset/tex/'))) {
    const t = get(k), d = t.data, dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    if (!ID.every((v, i) => d[i] === v)) { bad.push([k, 'not KTX2']); continue; }
    const w = dv.getUint32(20, true), levels = dv.getUint32(40, true), dfd = dv.getUint32(48, true), transfer = d[dfd + 4 + 10];
    if (levels !== Math.floor(Math.log2(w)) + 1) bad.push([k, 'mip levels', levels, 'for', w]);
    if ((transfer === 2) !== t.srgb) bad.push([k, 'transfer', transfer, 'srgb', t.srgb]);
    m[k.slice(10)] = `${w}px ${(d.length / 1024) | 0}KB`;
  }
  const ix = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/baked/pack/index.json'), 'utf8')), line = ix.files.find((f) => f.name === 'assets.pak');
  if (!line || line.bytes !== bytes.length) bad.push(['index.json line for assets.pak', JSON.stringify(line)]);
  if (m.textures < 4) bad.push(['textures', m.textures]);
}
console.log('RESULT ' + JSON.stringify({ test: 'ktx2-pack', pass: bad.length === 0, metrics: m, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
