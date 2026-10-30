import { openContainer } from './bakefmt.js';
import { WorldData, memoryReader } from './chunkstore.js';

// Reads the baked base world (world/base/ next to the page: index.json and the chunk containers it lists, core.pak and one per province,
// ADR-0036, bakefmt.js) and publishes it: globalThis.__WORLD is the chunk store (the high-detail pack is added in front by detail.js), and the
// 'core' chunk (coarse world, road network, city layouts) is decoded at once as globalThis.__BAKED for worldmap.js / roadnet.js /
// citylayout.js. The files are fetched whole and together: the boot reads most of them anyway (every 16 m ground tile and the vegetation,
// heightmap.js / forest.js). Without the folder (WORLD=small builds) nothing happens and the generators run; a listed file that is missing or
// cut short stops the boot (a damaged game folder).
export const BASE_DIR = 'world/base/';
export async function loadBaked(get = (n) => fetch(BASE_DIR + n, { cache: 'no-cache' })) {
  if (globalThis.__BAKED) return globalThis.__BAKED;
  const t0 = performance.now();
  let ix = null;
  try { const r = await get('index.json'); if (r.ok) ix = await r.json(); } catch (e) { /* no baked world */ }
  if (!ix) return null;
  const files = await Promise.all(ix.files.map(async (f) => {
    const r = await get(f.name).catch(() => null), b = r && r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    if (!b || b.length !== f.bytes) throw new Error(BASE_DIR + f.name + (b ? ' 크기가 다름' : ' 없음') + ' (게임 폴더를 다시 풀어 주세요)');
    return [f.name, b];
  }));
  const wd = (globalThis.__WORLD = globalThis.__WORLD || new WorldData());
  for (const [n, b] of files) wd.add('base:' + n, await openContainer(memoryReader(b)));
  globalThis.__BAKED = await wd.get('core');
  globalThis.__BAKED_MS = Math.round(performance.now() - t0);
  return globalThis.__BAKED;
}
