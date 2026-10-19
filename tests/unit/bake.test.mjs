// The bake must be deterministic and lossless: two bakes give the same bytes, and the decoded container equals what the generators produce
// (typed arrays element by element, shared objects still shared).
import zlib from 'node:zlib';
import '../../build/jobs.mjs';   // installs the compiled region, as the bake workers have it
import { bake } from '../../build/bake.mjs';
import { openContainer, decodeChunk, hash53, buildContainer, encodeChunk } from '../../src/bakefmt.js';
import { world } from '../../src/worldmap.js';
import { net } from '../../src/roadnet.js';
import { layouts } from '../../src/citylayout.js';

const bad = [], jobs = [{ key: 'core', tier: 'embed', src: ['src/worldmap.js', 'src/terrainfn.js', 'src/roadnet.js', 'src/citylayout.js', 'src/bakefmt.js', 'build/jobs.mjs'] }], a = await bake({ cache: false, jobs }), b = await bake({ jobs });
if (a.manifest.data !== b.manifest.data) bad.push(['not deterministic (or the cache differs from a fresh bake)']);
const mem = (u) => async (o, n) => u.subarray(o, o + n), C = await openContainer(mem(a.embedded)), e = C.chunks.core;
const zc = a.embedded.subarray(C.start + e.o, C.start + e.o + e.z);
if (hash53(zc) !== e.h) bad.push(['chunk hash']);
const U = decodeChunk(new Uint8Array(zlib.inflateRawSync(zc)));
// a damaged byte must change the hash, and a container of several chunks gives each one back
{ const z2 = Uint8Array.from(zc); z2[5] ^= 1; if (hash53(z2) === e.h) bad.push(['hash blind to damage']); }
{ const objs = { 'a/1': { v: new Float32Array([1, 2, 3]) }, 'b': { m: new Map([[1, { x: 1 }]]) } };
  const ents = Object.entries(objs).map(([key, o]) => { const raw = encodeChunk(o); return { key, z: new Uint8Array(zlib.deflateRawSync(raw)), r: raw.length }; });
  const K = buildContainer(ents), KC = await openContainer(mem(K));
  if (Object.keys(KC.chunks).join() !== 'a/1,b') bad.push(['container keys']);
  const g = (k) => decodeChunk(new Uint8Array(zlib.inflateRawSync(K.subarray(KC.start + KC.chunks[k].o, KC.start + KC.chunks[k].o + KC.chunks[k].z))));
  if (g('a/1').v[2] !== 3 || g('b').m.get(1).x !== 1) bad.push(['container roundtrip']); }
const eq = (x, y, p) => {
  if (x === y) return;
  if (ArrayBuffer.isView(x)) { if (!y) { bad.push([p, "missing"]); return; } if (x.length !== y.length) { bad.push([p, 'length']); return; } for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { bad.push([p, i]); return; } return; }
  if (x instanceof Map) { for (const [k, v] of x) eq(v, y.get(k), p + '{' + k + '}'); if (x.size !== y.size) bad.push([p, 'size']); return; }
  if (x && typeof x === 'object') { for (const k of Object.keys(x)) eq(x[k], y?.[k], p + '.' + k); return; }
  if (!(Number.isNaN(x) && Number.isNaN(y))) bad.push([p, x, y]);
};
eq(world(), U.world, 'world'); eq(net(), U.net, 'net'); eq(layouts(), U.layouts, 'layouts');
// a compiled region drops the capital's ring, so any ring that exists shows that records are shared
const ring = U.net.rings.get('neon') || [...U.net.rings.values()][0];
if (ring.roads[0] !== U.net.roads.find((r) => r.id === ring.roads[0].id)) bad.push(['shared road lost']);
const mb = a.embedded.length / 1048576;
console.log('RESULT ' + JSON.stringify({ test: 'bake', pass: bad.length === 0, metrics: { MB: +mb.toFixed(2), rawMB: +(e.r / 1048576).toFixed(2), ms: a.manifest.ms, hash: a.manifest.data.slice(0, 8) }, note: bad.slice(0, 5).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
