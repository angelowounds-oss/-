import { openContainer } from './bakefmt.js';
import { WorldData, memoryReader } from './chunkstore.js';

// Reads the baked base world (world/base.pak next to the page: a chunk container, bakefmt.js) and publishes it: globalThis.__WORLD is the chunk
// store (the high-detail pack is added in front by detail.js), and the 'core' chunk (coarse world, road network, city layouts) is decoded at once
// as globalThis.__BAKED for worldmap.js / roadnet.js / citylayout.js. The file is fetched whole: the boot reads most of it anyway (every 16 m
// ground tile and the vegetation, heightmap.js / forest.js). Without the file (WORLD=small builds) nothing happens and the generators run.
export async function loadBaked() {
  if (globalThis.__BAKED) return globalThis.__BAKED;
  const t0 = performance.now();
  let bytes = null;
  try { const r = await fetch('world/base.pak', { cache: 'no-cache' }); if (r.ok) bytes = new Uint8Array(await r.arrayBuffer()); } catch (e) { /* no file */ }
  if (!bytes) return null;
  const wd = (globalThis.__WORLD = globalThis.__WORLD || new WorldData());
  wd.add('base', await openContainer(memoryReader(bytes)));
  globalThis.__BAKED = await wd.get('core');
  globalThis.__BAKED_MS = Math.round(performance.now() - t0);
  return globalThis.__BAKED;
}
