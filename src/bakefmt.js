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

// ---- chunk container v2: many packed chunks in one file, each deflated on its own so a reader can take just the ones it needs.
// Layout: [u32 magic][u32 indexLen][index JSON][pad to 8][chunk data...]; the index maps a key to {o, z, r, h} (offset from the data start,
// compressed bytes, raw bytes, hash of the compressed bytes). The embedded world and the optional high-detail packs share this layout.
export const MAGIC = 0x3242434e;   // 'NCB2'
export function hash53(b, seed = 0) {   // cyrb53 over bytes: cheap, the same in node and in the browser, enough to catch a damaged or mismatched file
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < b.length; i++) { const c = b[i]; h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
// one chunk as raw bytes [u32 jsonLen][u32 blobLen][json][blob] (before deflate)
export function encodeChunk(obj) {
  const { json, blob } = pack(obj), jb = new TextEncoder().encode(json), out = new Uint8Array(8 + jb.length + blob.length), dv = new DataView(out.buffer);
  dv.setUint32(0, jb.length, true); dv.setUint32(4, blob.length, true); out.set(jb, 8); out.set(blob, 8 + jb.length);
  return out;
}
export function decodeChunk(raw) {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), jl = dv.getUint32(0, true), bl = dv.getUint32(4, true);
  return unpack(new TextDecoder().decode(raw.subarray(8, 8 + jl)), raw.slice(8 + jl, 8 + jl + bl));
}
// entries: [{key, z: compressed bytes, r: raw length}] in the order they should be stored; meta is stored verbatim in the index
export function buildContainer(entries, meta = {}) {
  const chunks = {}; let o = 0;
  for (const e of entries) { o = (o + 7) & ~7; chunks[e.key] = { o, z: e.z.length, r: e.r, h: hash53(e.z) }; o += e.z.length; }
  const idx = new TextEncoder().encode(JSON.stringify({ format: 2, meta, chunks })), start = (8 + idx.length + 7) & ~7, out = new Uint8Array(start + o), dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, idx.length, true); out.set(idx, 8);
  for (const e of entries) out.set(e.z, start + chunks[e.key].o);
  return out;
}
// the index of a container, given a reader read(offset, length) -> Uint8Array (a slice of memory or of a File)
export async function openContainer(read) {
  const head = await read(0, 8), dv = new DataView(head.buffer, head.byteOffset, 8);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('bakefmt: not a world container');
  const il = dv.getUint32(4, true), idx = JSON.parse(new TextDecoder().decode(await read(8, il)));
  return { meta: idx.meta, chunks: idx.chunks, start: (8 + il + 7) & ~7, read };
}
