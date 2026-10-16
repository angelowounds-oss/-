// The bake must be deterministic and lossless: two bakes give the same bytes, and the decoded container equals what the generators produce
// (typed arrays element by element, shared objects still shared).
import zlib from 'node:zlib';
import { bake } from '../../build/bake.mjs';
import { unpack } from '../../src/bakefmt.js';
import { world } from '../../src/worldmap.js';
import { net } from '../../src/roadnet.js';
import { layouts } from '../../src/citylayout.js';

const bad = [], a = await bake(), b = await bake();
if (a.manifest.data !== b.manifest.data) bad.push(['not deterministic']);
const raw = zlib.inflateRawSync(a.data), jl = raw.readUInt32LE(0), bl = raw.readUInt32LE(4);
const U = unpack(raw.subarray(8, 8 + jl).toString('utf8'), new Uint8Array(raw.subarray(8 + jl, 8 + jl + bl)));
const eq = (x, y, p) => {
  if (x === y) return;
  if (ArrayBuffer.isView(x)) { if (x.length !== y.length) { bad.push([p, 'length']); return; } for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { bad.push([p, i]); return; } return; }
  if (x instanceof Map) { for (const [k, v] of x) eq(v, y.get(k), p + '{' + k + '}'); if (x.size !== y.size) bad.push([p, 'size']); return; }
  if (x && typeof x === 'object') { for (const k of Object.keys(x)) eq(x[k], y?.[k], p + '.' + k); return; }
  if (!(Number.isNaN(x) && Number.isNaN(y))) bad.push([p, x, y]);
};
eq(world(), U.world, 'world'); eq(net(), U.net, 'net'); eq(layouts(), U.layouts, 'layouts');
if (U.net.rings.get('neon').roads[0] !== U.net.roads[0]) bad.push(['shared road lost']);
const mb = a.data.length / 1048576;
console.log('RESULT ' + JSON.stringify({ test: 'bake', pass: bad.length === 0, metrics: { MB: +mb.toFixed(2), rawMB: +(a.manifest.rawBytes / 1048576).toFixed(2), ms: a.manifest.ms, hash: a.manifest.data.slice(0, 8) }, note: bad.slice(0, 5).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
