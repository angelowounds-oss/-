import { openContainer, decodeChunk, hash53 } from './bakefmt.js';
import { fileReader, httpFile, inflate } from './chunkstore.js';
import { inflateSync } from 'three/examples/jsm/libs/fflate.module.js';
import { readTile, regKey } from './regtile.js';
import { setRegionLoader } from './region.js';

// The page's reader of the compiled regions' raster tiles (EV-01): world/reg/ holds index.json and one chunk container per region (build/bake.mjs
// 'reg' jobs). The files are not fetched: each tile is one Range request (the launcher and the test server answer them, as for the high pack), so
// the rasters never sit in memory, packed or not. region.js asks in two ways: request() streams a tile in the background (the chunk inflated in
// the worker of chunkstore.js), sync() reads one at once for a fine question about a cell whose tile has not arrived (a jump: the ground under the
// player must be the fine one in the same frame), with a synchronous request and fflate. Without the folder (a WORLD=small build, the bake's
// regions with whole rasters) nothing is mounted and region.js never asks.
export const REG_DIR = 'world/reg/';

// one byte range of a file, synchronously (sync XHR cannot ask for an ArrayBuffer in a page: the bytes come as a user-defined charset string)
function rangeSync(url, a, n) {
  const x = new XMLHttpRequest(); x.open('GET', url, false); x.setRequestHeader('Range', `bytes=${a}-${a + n - 1}`); x.overrideMimeType('text/plain; charset=x-user-defined'); x.send();
  if (x.status !== 206 && x.status !== 200) return null;
  const s = x.responseText, off = x.status === 200 ? a : 0, out = new Uint8Array(n);   // a server that ignores Range sends the whole file
  for (let i = 0; i < n; i++) out[i] = s.charCodeAt(off + i) & 0xff;
  return out;
}

// one chunk of a store source that knows its file's url (bakedload.js), read, checked and decoded at once: the resident ground tiles' heights
// for a fine question on a tile whose heights were let go (heightmap.js setTileReader). Null when no source with a url has it.
export function syncChunk(wd, key) {
  const s = wd.find(key), e = s && s.url && s.c.chunks[key]; if (!e) return null;
  const z = rangeSync(s.url, s.c.start + e.o, e.z); if (!z) return null;
  if (hash53(z) !== e.h) throw new Error(`world data: chunk ${key} of ${s.name} is damaged (hash)`);
  return decodeChunk(inflateSync(z));
}

// opens world/reg/ and hands region.js its loader; the number of region files (0: none there)
export async function mountRegionTiles(dir = REG_DIR) {
  let ix = null;
  try { const r = await fetch(dir + 'index.json', { cache: 'no-cache' }); if (r.ok) ix = await r.json(); } catch (e) { /* no tiles */ }
  if (!ix) return 0;
  const by = new Map();
  for (const f of ix.files) {
    const file = await httpFile(dir + f.name);
    if (!file || file.size !== f.bytes) throw new Error(dir + f.name + (file ? ' 크기가 다름' : ' 없음') + ' (게임 폴더를 다시 풀어 주세요)');
    by.set(f.region, { c: await openContainer(fileReader(file)), url: dir + f.name });
  }
  // the stored chunk of a tile: its source and index entry, or null (a region without that tile)
  const find = (R, ti, tj) => { const s = by.get(R.name), e = s && s.c.chunks[regKey(R.name, ti, tj)]; return e ? { s, e } : null; };
  const check = (z, e, key) => { if (hash53(z) !== e.h) throw new Error(`world data: tile ${key} is damaged (hash)`); return z; };
  setRegionLoader({
    async request(R, ti, tj) {
      const f = find(R, ti, tj); if (!f) return null;
      const z = check(await f.s.c.read(f.s.c.start + f.e.o, f.e.z), f.e, regKey(R.name, ti, tj));
      return readTile(decodeChunk(await inflate(z)));
    },
    sync(R, ti, tj) {
      const f = find(R, ti, tj); if (!f) return null;
      const z = rangeSync(f.s.url, f.s.c.start + f.e.o, f.e.z); if (!z) return null;
      return readTile(decodeChunk(inflateSync(check(z, f.e, regKey(R.name, ti, tj)))));
    },
  });
  return by.size;
}
