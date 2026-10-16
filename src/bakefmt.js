// Binary container for baked world data: a JSON skeleton plus one blob holding every typed array. Typed arrays become {$t, o, n} references
// into the blob and Maps become {$m: [[k, v], ...]}, so the data decodes with no per-element parsing of the big grids. Pure (no three.js).
const TYPES = { f32: Float32Array, u8: Uint8Array, i32: Int32Array, u16: Uint16Array, f64: Float64Array };
const NAME = new Map([[Float32Array, 'f32'], [Uint8Array, 'u8'], [Int32Array, 'i32'], [Uint16Array, 'u16'], [Float64Array, 'f64']]);

export function pack(root) {
  const parts = []; let off = 0;
  // objects reachable twice (a road listed by its ring and in the road table) must decode to one object again
  const count = new Map();
  const scan = (v) => { if (v === null || typeof v !== 'object' || ArrayBuffer.isView(v)) return; const c = count.get(v) || 0; count.set(v, c + 1); if (c) return; if (v instanceof Map) for (const [k, x] of v) { scan(k); scan(x); } else for (const k of Object.keys(v)) scan(v[k]); };
  scan(root);
  const ids = new Map();
  const walk = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (!ArrayBuffer.isView(v) && count.get(v) > 1) {
      if (ids.has(v)) return { $r: ids.get(v) };
      const id = ids.size; ids.set(v, id); return { $d: id, v: walk1(v) };
    }
    return walk1(v);
  };
  const walk1 = (v) => {
    if (ArrayBuffer.isView(v)) {
      const t = NAME.get(v.constructor); if (!t) throw new Error('bakefmt: unsupported typed array');
      off = (off + 7) & ~7; const o = off; parts.push([o, new Uint8Array(v.buffer, v.byteOffset, v.byteLength)]); off += v.byteLength;
      return { $t: t, o, n: v.length };
    }
    if (v instanceof Map) return { $m: [...v].map(([k, x]) => [walk(k), walk(x)]) };
    if (Array.isArray(v)) return v.map(walk);
    const out = {}; for (const k of Object.keys(v)) out[k] = walk(v[k]); return out;
  };
  const skel = walk(root), blob = new Uint8Array((off + 7) & ~7);
  for (const [o, u] of parts) blob.set(u, o);
  return { json: JSON.stringify(skel), blob };
}

export function unpack(json, blob) {
  const buf = blob.buffer.byteLength === blob.byteLength && blob.byteOffset === 0 ? blob.buffer : blob.slice().buffer;
  const defs = new Map();
  const walk = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(walk);
    if (v.$r !== undefined) return defs.get(v.$r);
    if (v.$d !== undefined) { const o = walk(v.v); defs.set(v.$d, o); return o; }
    if (v.$t) return new TYPES[v.$t](buf, v.o, v.n);
    if (v.$m) return new Map(v.$m.map(([k, x]) => [walk(k), walk(x)]));
    const out = {}; for (const k of Object.keys(v)) out[k] = walk(v[k]); return out;
  };
  return walk(JSON.parse(json));
}
