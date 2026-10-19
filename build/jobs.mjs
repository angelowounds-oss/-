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
  // one tile of baked ground (heightmap.js): the ground of landfn.js on the tile's grid; the physics layer only when it differs (bridges, tunnels)
  async tile(j) {
    const [{ landProc, physProc }, { encodeTile, N1, TILE, CT, CN, TILE_ORIGIN }, { groundColor }] = await Promise.all([imp('src/landfn.js'), imp('src/heightmap.js'), imp('src/groundfn.js')]);
    const size = j.g * TILE, x0 = TILE_ORIGIN.x + j.i * size, z0 = TILE_ORIGIN.z + j.j * size, land = new Float32Array(N1 * N1), phys = new Float32Array(N1 * N1); let diff = false;
    for (let b = 0; b < N1; b++) for (let a = 0; a < N1; a++) {
      const x = x0 + a * j.g, z = z0 + b * j.g, k = b * N1 + a; land[k] = landProc(x, z, j.g); phys[k] = physProc(x, z, j.g);
      if (Math.abs(phys[k] - land[k]) > 0.05) diff = true;
    }
    // the ground colour on a grid twice as coarse (the colour has no detail the height cell could show), stored gamma 2 in bytes
    const col = new Uint8Array(CN * CN * 3), c3 = [0, 0, 0], cs = size / CT;
    for (let b = 0; b < CN; b++) for (let a = 0; a < CN; a++) {
      const x = x0 + a * cs, z = z0 + b * cs, h = landProc(x, z, j.g), sl = Math.hypot(landProc(x + 16, z, 16) - landProc(x - 16, z, 16), landProc(x, z + 16, 16) - landProc(x, z - 16, 16)) / 32;
      groundColor(x, z, h, sl, c3); for (let q = 0; q < 3; q++) col[(b * CN + a) * 3 + q] = Math.round(Math.sqrt(Math.max(0, Math.min(1, c3[q]))) * 255);
    }
    return { land: encodeTile(land), phys: diff ? encodeTile(phys) : null, col };
  },
  // growth cells of one 4096 m tile (vegfn.js)
  async veg(j) { const { vegTile } = await imp('src/vegfn.js'); return { v: vegTile(j.i, j.j) }; },
  // the small things of one city tile (citydetail.js); null (no detail there) is stored as an empty chunk
  async citytile(j) {
    const [{ cities }, { layouts, STYLES }, { tileDetail }] = await Promise.all([imp('src/worldmap.js'), imp('src/citylayout.js'), imp('src/citydetail.js')]);
    const c = cities().find((q) => q.id === j.id), L = layouts().get(j.id);
    return tileDetail(c, L, STYLES[j.id], j.i, j.j, j.hi) || { empty: 1 };
  },
  // only for the tests of the container, the cache and the pack: a small deterministic chunk
  async selftest(j) { return { id: j.key, a: new Float32Array([0.5, 1.5, 2.5]), m: new Map([['k', { v: 7 }]]) }; },
};
