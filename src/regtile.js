// Region raster tiles (EV-01): the compiled rasters of a region (region.js: h, water, level) cut into tiles of REG_T x REG_T cells, so the page
// streams the ones around the player instead of holding the whole raster (the capital and Gyeonggi took 615 MB of the core chunk). A tile holds
// REG_S = REG_T + 1 samples a side: the last row and column are the next tile's first, so a bilinear lookup never needs a neighbour; samples past
// the raster's edge repeat its last row or column (no lookup reads them). Heights stay Int16 in 0.1 m behind the plane predictor of the ground
// tiles (heightmap.js), which deflate packs far better than the raw values. Pure (no three.js): the bake cuts, the page reads.
export const REG_SH = 7, REG_T = 1 << REG_SH, REG_M = REG_T - 1, REG_S = REG_T + 1;
// the coarse raster that answers where no tile is loaded: nodes on whole multiples of REG_CG metres of the local frame (the far rings of the land
// ask on those), each holding the fine raster's own bilinear value there
export const REG_CG = 128;
// how far around the player and the camera the tiles stay loaded (times the view distance, util.js VIEW.b): past every fine question the world
// asks while it streams (motorway pieces are built 8 km out, highways.js), so those find their tiles in and read none at once
export const REG_REACH = 9000;
// how many tiles a region's raster makes along x and z: every cell index 0 .. n - 1 falls in one
export const regTiles = (R) => ({ ni: ((R.nx - 1) >> REG_SH) + 1, nj: ((R.nz - 1) >> REG_SH) + 1 });
export const regKey = (name, ti, tj) => `reg/${name}/${ti}_${tj}`;

// the plane predictor (v - left - up + upleft, modulo 16 bits) over an S x S Int16 grid, and its inverse
function predict(v) {
  const o = new Int16Array(v.length);
  for (let j = 0; j < REG_S; j++) for (let i = 0; i < REG_S; i++) { const k = j * REG_S + i; o[k] = v[k] - (i ? v[k - 1] : 0) - (j ? v[k - REG_S] : 0) + (i && j ? v[k - REG_S - 1] : 0); }
  return o;
}
function unpredict(o) {
  const v = new Int16Array(o.length);
  for (let j = 0; j < REG_S; j++) for (let i = 0; i < REG_S; i++) { const k = j * REG_S + i; v[k] = o[k] + (i ? v[k - 1] : 0) + (j ? v[k - REG_S] : 0) - (i && j ? v[k - REG_S - 1] : 0); }
  return v;
}

// the stored chunk of tile (ti, tj) of a region that holds its whole raster (the bake)
export function cutTile(R, ti, tj) {
  const h = new Int16Array(REG_S * REG_S), water = new Uint8Array(REG_S * REG_S), level = new Int16Array(REG_S * REG_S);
  for (let j = 0; j < REG_S; j++) for (let i = 0; i < REG_S; i++) {
    const gi = Math.min(R.nx - 1, ti * REG_T + i), gj = Math.min(R.nz - 1, tj * REG_T + j), k = gj * R.nx + gi, q = j * REG_S + i;
    h[q] = R.h[k]; water[q] = R.water[k]; level[q] = R.level[k];
  }
  return { h: predict(h), water, level };
}
// a stored chunk made ready for lookups (the page)
export const readTile = (c) => ({ h: unpredict(c.h), water: c.water, level: c.level });
