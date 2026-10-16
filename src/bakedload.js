import { unpack } from './bakefmt.js';

// Reads the baked world container embedded in the page (<script type="application/octet-stream" id="baked">, base64), inflates it in a worker
// (the main thread keeps drawing the loading screen) and publishes the decoded data as globalThis.__BAKED for worldmap.js / roadnet.js.
// Without the element (WORLD=small builds, node tests) nothing happens and the generators run as before.
const WORKER = `onmessage=async(e)=>{try{const s=new DecompressionStream('deflate-raw'),w=s.writable.getWriter();w.write(e.data);w.close();const b=await new Response(s.readable).arrayBuffer();postMessage(b,[b])}catch(x){postMessage({err:String(x)})}}`;

async function inflate(bytes) {
  try {
    const url = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })), w = new Worker(url);
    const out = await new Promise((res, rej) => { w.onmessage = (e) => res(e.data); w.onerror = (e) => rej(e); w.postMessage(bytes, [bytes.buffer]); });
    w.terminate(); URL.revokeObjectURL(url);
    if (out.err) throw new Error(out.err);
    return new Uint8Array(out);
  } catch (e) {   // no workers (file:// in some browsers): same work on the main thread
    const s = new DecompressionStream('deflate-raw'), w = s.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(s.readable).arrayBuffer());
  }
}

export async function loadBaked() {
  const node = document.getElementById('baked'); if (!node || globalThis.__BAKED) return null;
  const t0 = performance.now(), bin = atob(node.textContent.trim()), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  node.remove();   // the base64 text is not needed any more
  const raw = await inflate(bytes), dv = new DataView(raw.buffer, raw.byteOffset), jl = dv.getUint32(0, true), bl = dv.getUint32(4, true);
  const json = new TextDecoder().decode(raw.subarray(8, 8 + jl)), blob = raw.slice(8 + jl, 8 + jl + bl);
  globalThis.__BAKED = unpack(json, blob);
  globalThis.__BAKED_MS = Math.round(performance.now() - t0);
  return globalThis.__BAKED;
}
