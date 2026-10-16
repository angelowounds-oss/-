import { openContainer } from './bakefmt.js';
import { WorldData, memoryReader } from './chunkstore.js';

// Reads the baked world embedded in the page (<script type="application/octet-stream" id="baked">, base64 of a chunk container, bakefmt.js) and
// publishes it: globalThis.__WORLD is the chunk store (more sources, like the high-detail pack, are added by detail.js), and the 'core' chunk
// (coarse world, road network, city layouts) is decoded at once as globalThis.__BAKED for worldmap.js / roadnet.js / citylayout.js.
// Without the element (WORLD=small builds, node tests) nothing happens and the generators run as before.
export async function loadBaked() {
  const node = document.getElementById('baked'); if (!node || globalThis.__BAKED) return null;
  const t0 = performance.now(), bin = atob(node.textContent.trim()), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  node.remove();   // the base64 text is not needed any more
  const wd = (globalThis.__WORLD = globalThis.__WORLD || new WorldData());
  wd.add('embedded', await openContainer(memoryReader(bytes)));
  globalThis.__BAKED = await wd.get('core');
  globalThis.__BAKED_MS = Math.round(performance.now() - t0);
  return globalThis.__BAKED;
}
