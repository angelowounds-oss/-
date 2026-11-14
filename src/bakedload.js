import { openContainer } from './bakefmt.js';
import { WorldData, fileReader, httpFile } from './chunkstore.js';
import { slimCore } from './roadslim.js';

// Reads the baked base world (world/base/ next to the page: index.json and the chunk containers it lists, core.pak and one per province,
// ADR-0036, bakefmt.js) and publishes it: globalThis.__WORLD is the chunk store (the high-detail pack is added in front by detail.js), and the
// 'core' chunk (coarse world, road network, city layouts) is decoded at once as globalThis.__BAKED for worldmap.js / roadnet.js /
// citylayout.js. The files are opened, not fetched: each chunk is one Range request when it is asked for (the launcher and the test server
// answer them, as for the high pack), so the packed bytes (217 MB of the capital build, EV-01) never sit in the page's memory next to the
// decoded chunks. Without the folder (WORLD=small builds) nothing happens and the generators run; a listed file that is missing or cut short
// stops the boot (a damaged game folder).
export const BASE_DIR = 'world/base/';
// the folder as {get(name) -> file-like | null} (chunkstore.js httpFile: size, text(), slice(a, b).arrayBuffer())
const fromHttp = (base) => ({ base, get: (n) => httpFile(base + n) });   // base: each source keeps its file's url for synchronous reads (regionload.js syncChunk)
export async function loadBaked(dir = fromHttp(BASE_DIR)) {
  if (globalThis.__BAKED) return globalThis.__BAKED;
  const t0 = performance.now();
  let ix = null;
  try { const f = await dir.get('index.json'); if (f) ix = JSON.parse(await f.text()); } catch (e) { /* no baked world */ }
  if (!ix) return null;
  const files = await Promise.all(ix.files.map(async (f) => {
    const file = await dir.get(f.name).catch(() => null);
    if (!file || file.size !== f.bytes) throw new Error(BASE_DIR + f.name + (file ? ' 크기가 다름' : ' 없음') + ' (게임 폴더를 다시 풀어 주세요)');
    return [f.name, await openContainer(fileReader(file))];
  }));
  const wd = (globalThis.__WORLD = globalThis.__WORLD || new WorldData());
  for (const [n, c] of files) { const s = wd.add('base:' + n, c); if (dir.base) s.url = dir.base + n; }
  globalThis.__BAKED = slimCore(await wd.get('core'));   // repeated strings and empty lists made one (roadslim.js)
  globalThis.__BAKED_MS = Math.round(performance.now() - t0);
  return globalThis.__BAKED;
}
