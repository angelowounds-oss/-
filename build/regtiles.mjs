// The core chunk's form of a compiled region (EV-01): everything but its rasters, which go to the streamed tiles (src/regtile.js, the bake's
// 'reg' jobs), plus what the page needs without them:
// - coarse: the raster on nodes at whole multiples of REG_CG metres, each node the fine raster's own bilinear height there (so the land's far rings,
//   which ask on those multiples, read the same ground with or without the tiles) and the water class and level of its nearest cell;
// - ownTiles: the owner bytes (emit.mjs ownership) per tile: class 1 all owned, 0 all beyond the edge band (each weighs 0), 2 kept as they are;
// - inland: the capital's inland water cells (cell index, level), from which rivers.js draws its water without the raster;
// - summit: the highest cell of the capital away from its border (views.js 'mountain-day'), found as views.js found it on the raster.
// Not in build/world/: build.mjs counts every file there as a part of the region compiler.
import { REG_T, REG_CG, regTiles } from '../src/regtile.js';
import { rasterHeight } from '../src/region.js';

export function regionMeta(R) {
  if (!R) return R;
  const { h, water, level, own, ...meta } = R, T = regTiles(R);
  meta.tiled = { ...T, T: REG_T };
  // the coarse raster: nodes from the multiple at or below the first cell to the one at or above the last; a node outside the raster takes the
  // nearest point inside it
  const x1 = R.x0 + (R.nx - 1) * R.g, z1 = R.z0 + (R.nz - 1) * R.g, cx0 = Math.floor(R.x0 / REG_CG) * REG_CG, cz0 = Math.floor(R.z0 / REG_CG) * REG_CG;
  const cnx = Math.ceil((x1 - cx0) / REG_CG) + 1, cnz = Math.ceil((z1 - cz0) / REG_CG) + 1;
  const ch = new Float32Array(cnx * cnz), cw = new Uint8Array(cnx * cnz), cl = new Int16Array(cnx * cnz);
  for (let j = 0; j < cnz; j++) for (let i = 0; i < cnx; i++) {
    const x = Math.min(x1, Math.max(R.x0, cx0 + i * REG_CG)), z = Math.min(z1, Math.max(R.z0, cz0 + j * REG_CG)), k = j * cnx + i;
    ch[k] = rasterHeight(R, x, z);
    const q = Math.round((z - R.z0) / R.g) * R.nx + Math.round((x - R.x0) / R.g); cw[k] = water[q]; cl[k] = level[q];
  }
  meta.coarse = { x0: cx0, z0: cz0, nx: cnx, nz: cnz, h: ch, water: cw, level: cl };
  // ownership by tile; a tile can only be summed up as 'beyond the band' when the 254 the page then answers lies beyond it too
  if (own) {
    const n = T.ni * T.nj, cls = new Uint8Array(n), at = new Int32Array(n).fill(-1), parts = [], far = 254 * R.g >= R.edge;
    for (let tj = 0; tj < T.nj; tj++) for (let ti = 0; ti < T.ni; ti++) {
      const b = new Uint8Array(REG_T * REG_T); let all = true, none = far;
      for (let j = 0; j < REG_T; j++) for (let i = 0; i < REG_T; i++) {
        const gi = Math.min(R.nx - 1, ti * REG_T + i), gj = Math.min(R.nz - 1, tj * REG_T + j), o = own[gj * R.nx + gi]; b[j * REG_T + i] = o;
        if (o !== 255) all = false; if (o === 255 || o * R.g < R.edge) none = false;
      }
      const t = tj * T.ni + ti; cls[t] = all ? 1 : none ? 0 : 2;
      if (cls[t] === 2) { at[t] = parts.length * REG_T * REG_T; parts.push(b); }
    }
    const data = new Uint8Array(parts.length * REG_T * REG_T); parts.forEach((b, q) => data.set(b, q * REG_T * REG_T));
    meta.ownTiles = { cls, at, data };
  }
  // the capital (no owner raster): its inland water cells and its summit
  if (!own) {
    let n = 0; for (let k = 0; k < water.length; k++) if (water[k] === 2) n++;
    const wk = new Int32Array(n), wl = new Int16Array(n); n = 0;
    for (let k = 0; k < water.length; k++) if (water[k] === 2) { wk[n] = k; wl[n++] = level[k]; }
    meta.inland = { k: wk, level: wl };   // not 'water': region.js reads R.water as the whole raster
    let b = -1, bi = 0, bj = 0; const m = 40;
    for (let j = m; j < R.nz - m; j += 2) for (let i = m; i < R.nx - m; i += 2) { const v = h[j * R.nx + i]; if (v > b) { b = v; bi = i; bj = j; } }
    meta.summit = { x: R.x0 + bi * R.g, z: R.z0 + bj * R.g, y: b / 10 };
  }
  return meta;
}
