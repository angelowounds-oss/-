// What each bake job computes (see JOBS in bake.mjs). Pure functions of the sources; run inside worker threads.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const imp = (f) => import(pathToFileURL(path.join(root, f)).href);

export const RUN = {
  // the coarse world, the road network and the city layouts: what the page used to generate at start-up
  async core() {
    const [{ world }, { net }, { layouts }] = await Promise.all([imp('src/worldmap.js'), imp('src/roadnet.js'), imp('src/citylayout.js')]);
    return { world: world(), net: net(), layouts: layouts() };
  },
  // only for the tests of the container, the cache and the pack: a small deterministic chunk
  async selftest(j) { return { id: j.key, a: new Float32Array([0.5, 1.5, 2.5]), m: new Map([['k', { v: 7 }]]) }; },
};
