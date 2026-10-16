import { HM } from './landfn.js';

// Baked height tiles of the land (ADR-0013): the ground of landfn.js sampled on a grid and stored as Int16 in 0.1 m steps, a plane predictor in
// front of deflate (most samples then are small numbers). A level has square tiles of TILE cells (+1 shared edge sample, so a lookup never needs a
// neighbour): "t16" has 16 m cells (4096 m tiles, all kept in memory, made into the page), "t8" has 8 m cells (2048 m tiles, from the high pack,
// streamed around the player and dropped when far). `sample` takes the finest tile that is loaded and says NaN where none is (landfn then computes it).
export const TILE = 256, N1 = TILE + 1, HALF = 50000, UNIT = 0.1;
export const LEVELS = [{ g: 8, key: 't8', stream: true }, { g: 16, key: 't16', stream: false }];   // finest first
const tileM = (g) => g * TILE, count = (g) => Math.ceil((2 * HALF) / tileM(g));

// encode: floats -> Int16 + predictor (bake side); decode: the reverse (page side). The predictor is v - left - up + upleft, modulo 16 bits.
export function encodeTile(h) {
  const v = new Int16Array(N1 * N1), o = new Int16Array(N1 * N1);
  for (let k = 0; k < v.length; k++) v[k] = Math.max(-32768, Math.min(32767, Math.round(h[k] / UNIT)));
  for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) { const k = j * N1 + i; o[k] = v[k] - (i ? v[k - 1] : 0) - (j ? v[k - N1] : 0) + (i && j ? v[k - N1 - 1] : 0); }
  return o;
}
export function decodeTile(o) {
  const v = new Int16Array(N1 * N1);
  for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) { const k = j * N1 + i; v[k] = o[k] + (i ? v[k - 1] : 0) + (j ? v[k - N1] : 0) - (i && j ? v[k - N1 - 1] : 0); }
  return v;
}
export const tileKey = (L, i, j) => `${L.key}/${i}_${j}`;

class Level {
  constructor(spec) { Object.assign(this, spec); this.n = count(spec.g); this.size = tileM(spec.g); this.tiles = new Map(); this.loading = new Set(); }
  tile(x, z) {
    const fx = (x + HALF) / this.size, fz = (z + HALF) / this.size, i = Math.min(this.n - 1, Math.max(0, Math.floor(fx))), j = Math.min(this.n - 1, Math.max(0, Math.floor(fz)));
    return { t: this.tiles.get(j * this.n + i), u: (fx - i) * TILE, v: (fz - j) * TILE };
  }
}
const lvl = LEVELS.map((s) => new Level(s));
export const levels = lvl;

function bilerp(a, u, v) {
  u = Math.min(TILE - 1e-6, Math.max(0, u)); v = Math.min(TILE - 1e-6, Math.max(0, v));
  const i = u | 0, j = v | 0, fu = u - i, fv = v - j, k = j * N1 + i;
  return ((a[k] * (1 - fu) + a[k + 1] * fu) * (1 - fv) + (a[k + N1] * (1 - fu) + a[k + N1 + 1] * fu) * fv) * UNIT;
}
// the height at (x, z): from the finest loaded tile, NaN when there is none. phys: the layer with bridges and tunnels filled (absent in most tiles)
export function sample(x, z, phys = false) {
  for (const L of lvl) {
    if (!L.tiles.size) continue;
    const { t, u, v } = L.tile(x, z); if (!t) continue;
    return bilerp(phys && t.phys ? t.phys : t.land, u, v);
  }
  return NaN;
}
HM.land = (x, z) => sample(x, z, false); HM.phys = (x, z) => sample(x, z, true);

// decode a chunk object {land, phys?} (predictor-coded) into a tile ready for lookups
const toTile = (c) => ({ land: decodeTile(c.land), phys: c.phys ? decodeTile(c.phys) : null });

// load every tile of the always-resident level from the store (before the game starts); returns how many
export async function loadResident(wd) {
  let n = 0;
  for (const L of lvl) {
    if (L.stream) continue;
    const keys = wd.keys(L.key + '/'); if (!keys.length) continue;
    for (let a = 0; a < keys.length; a += 24) {
      await Promise.all(keys.slice(a, a + 24).map(async (k) => { const [i, j] = k.slice(L.key.length + 1).split('_').map(Number); L.tiles.set(j * L.n + i, toTile(await wd.get(k))); wd.drop(k); n++; }));
    }
  }
  return n;
}
// keep the streamed levels around (x, z): tiles within `ring` tiles are requested, tiles beyond ring + 2 are let go. Cheap when the focus stays in its tile.
export function stream(wd, x, z, ring = 1) {
  for (const L of lvl) {
    if (!L.stream || !wd.keys(L.key + '/').length) continue;
    const ci = Math.floor((x + HALF) / L.size), cj = Math.floor((z + HALF) / L.size);
    if (L.ci === ci && L.cj === cj && !L.loading.size) continue; L.ci = ci; L.cj = cj;
    for (let j = cj - ring; j <= cj + ring; j++) for (let i = ci - ring; i <= ci + ring; i++) {
      if (i < 0 || j < 0 || i >= L.n || j >= L.n) continue; const id = j * L.n + i, key = `${L.key}/${i}_${j}`;
      if (L.tiles.has(id) || L.loading.has(id) || !wd.has(key)) continue;
      L.loading.add(id); wd.get(key).then((c) => { L.tiles.set(id, toTile(c)); wd.drop(key); }).catch(() => {}).finally(() => L.loading.delete(id));
    }
    for (const id of [...L.tiles.keys()]) { const i = id % L.n, j = (id / L.n) | 0; if (Math.abs(i - ci) > ring + 2 || Math.abs(j - cj) > ring + 2) L.tiles.delete(id); }
  }
}
export const resident = () => lvl.reduce((s, L) => s + (L.stream ? 0 : L.tiles.size), 0);
