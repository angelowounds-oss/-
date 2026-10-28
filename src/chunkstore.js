import { openContainer, decodeChunk, hash53 } from './bakefmt.js';

// Reads chunks out of world containers (bakefmt.js): the one embedded in the page and, when connected, the high-detail pack files. A chunk is
// found in the first source that has it (packs come first, so a pack chunk replaces the embedded one of the same key), checked against the hash in
// the index, inflated in a worker (the main thread keeps drawing) and decoded once; later calls get the same object.
const WORKER = `onmessage=async(e)=>{const{id,b}=e.data;try{const s=new DecompressionStream('deflate-raw'),w=s.writable.getWriter();w.write(b);w.close();const o=await new Response(s.readable).arrayBuffer();postMessage({id,o},[o])}catch(x){postMessage({id,err:String(x)})}}`;
let pool = null, nextId = 1;
const waiting = new Map();
function worker() {
  if (pool !== null) return pool;
  try {
    const url = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })), w = new Worker(url);
    w.onmessage = (e) => { const p = waiting.get(e.data.id); waiting.delete(e.data.id); if (e.data.err) p.rej(new Error(e.data.err)); else p.res(new Uint8Array(e.data.o)); };
    w.onerror = () => { pool = false; for (const p of waiting.values()) p.rej(new Error('worker failed')); waiting.clear(); };
    return (pool = w);
  } catch (e) { return (pool = false); }
}
export async function inflate(bytes) {
  const w = worker();
  if (w) {
    try { return await new Promise((res, rej) => { const id = nextId++; waiting.set(id, { res, rej }); w.postMessage({ id, b: bytes }); }); } catch (e) { /* fall through to the main thread */ }
  }
  const s = new DecompressionStream('deflate-raw'), wr = s.writable.getWriter(); wr.write(bytes); wr.close();
  return new Uint8Array(await new Response(s.readable).arrayBuffer());
}

export class WorldData {
  constructor() { this.sources = []; this.cache = new Map(); this.pending = new Map(); this.stats = { chunks: 0, bytes: 0, ms: 0 }; }
  // a source: {name, container}; a newer source with a higher priority (packs) goes in front
  add(name, container, front = false) { const s = { name, c: container }; if (front) this.sources.unshift(s); else this.sources.push(s); return s; }
  remove(name) { this.sources = this.sources.filter((s) => s.name !== name); this.cache.clear(); }
  find(key) { for (const s of this.sources) if (s.c.chunks[key]) return s; return null; }
  has(key) { return !!this.find(key); }
  keys(prefix = '') { const out = new Set(); for (const s of this.sources) for (const k of Object.keys(s.c.chunks)) if (k.startsWith(prefix)) out.add(k); return [...out].sort(); }
  peek(key) { return this.cache.get(key); }   // a chunk that has been loaded already, or undefined
  async get(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.pending.has(key)) return this.pending.get(key);
    const p = this.load(key).finally(() => this.pending.delete(key)); this.pending.set(key, p); return p;
  }
  async load(key) {
    const s = this.find(key); if (!s) throw new Error('world data: no chunk ' + key);
    const t0 = performance.now(), e = s.c.chunks[key], z = await s.c.read(s.c.start + e.o, e.z);
    if (hash53(z) !== e.h) throw new Error(`world data: chunk ${key} of ${s.name} is damaged (hash)`);
    const obj = decodeChunk(await inflate(z));
    this.cache.set(key, obj); this.stats.chunks++; this.stats.bytes += e.z; this.stats.ms += performance.now() - t0;
    return obj;
  }
  drop(key) { this.cache.delete(key); }   // let a streamed chunk go; it is read again when asked for
}
export const memoryReader = (bytes) => async (o, n) => bytes.subarray(o, o + n);
export const fileReader = (file) => async (o, n) => new Uint8Array(await file.slice(o, o + n).arrayBuffer());
// A file of the game folder, served over http, in the shape fileReader and mountPack expect ({size, text(), slice(a, b).arrayBuffer()}): each
// slice is one Range request, so a pack of any size is read a chunk at a time. Null when the file is not there.
export async function httpFile(url) {
  const h = await fetch(url, { method: 'HEAD', cache: 'no-cache' }); if (!h.ok) return null;
  const size = +h.headers.get('content-length');
  const slice = (a, b) => ({ async arrayBuffer() {
    const r = await fetch(url, { headers: { Range: `bytes=${a}-${b - 1}` } });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    if (r.headers.get('content-encoding')) throw new Error(url + ': compressed response, offsets would be wrong');
    const buf = await r.arrayBuffer();
    return r.status === 206 ? buf : buf.slice(a, b);   // a server that ignores Range sends the whole file
  } });
  return { name: url.split('/').pop(), size, slice, text: async () => (await fetch(url, { cache: 'no-cache' })).text() };
}
export { openContainer };
