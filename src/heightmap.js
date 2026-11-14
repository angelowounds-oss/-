import { HM } from './landfn.js';
import { CAPITAL, MAP_HALF } from './koreamap.js';

// Baked height tiles of the land (ADR-0013): the ground of landfn.js sampled on a grid and stored as Int16 in 0.1 m steps, a plane predictor in
// front of deflate (most samples then are small numbers). A level has square tiles of TILE cells (+1 shared edge sample, so a lookup never needs a
// neighbour): "t16" has 16 m cells (4096 m tiles, all kept in memory, made into the page), "t8" has 8 m cells (2048 m tiles, from the high pack,
// streamed around the player and dropped when far). `sample` takes the finest tile that is loaded and says NaN where none is (landfn then computes it).
export const TILE = 256, N1 = TILE + 1, HALF = MAP_HALF, UNIT = 0.1;
// the tile grid lies in the local frame (ADR-0017): its first corner is the map's (-HALF, -HALF) moved by the capital offset, so the same tiles hold the same ground
export const TILE_ORIGIN = { x: -HALF - CAPITAL.x, z: -HALF - CAPITAL.z };
export const CT = 128, CN = CT + 1;   // the ground colour grid of a tile: 128 cells (twice the height cell), RGB, gamma 2
// every resident tile keeps a coarse copy of its colours (32 cells of 128 m) for the far rings; the full grid comes and goes with the heights (CM_FULL)
export const CM = 32, CMN = CM + 1, CM_FULL = 64;
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
  constructor(spec) { Object.assign(this, spec); this.n = count(spec.g); this.size = tileM(spec.g); this.tiles = new Map(); this.loading = new Set(); this.live = new Set(); this.stats = { sync: 0, async: 0, freed: 0 }; }
  tile(x, z) {
    const fx = (x - TILE_ORIGIN.x) / this.size, fz = (z - TILE_ORIGIN.z) / this.size, i = Math.min(this.n - 1, Math.max(0, Math.floor(fx))), j = Math.min(this.n - 1, Math.max(0, Math.floor(fz)));
    return { t: this.tiles.get(j * this.n + i), u: (fx - i) * TILE, v: (fz - j) * TILE };
  }
}
const lvl = LEVELS.map((s) => new Level(s));
export const levels = lvl;
if (typeof window !== 'undefined') window.__hm = { levels: lvl, sample };   // test hook

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
    if (!t.land) { if (!t.missing) heights(L, t); if (!t.land) continue; }
    t.used = ++USE;
    return bilerp(phys && t.phys ? t.phys : t.land, u, v);
  }
  return NaN;
}
HM.land = (x, z) => sample(x, z, false); HM.phys = (x, z) => sample(x, z, true);

// decode a chunk object {land, phys?, col?} (heights predictor-coded) into a tile ready for lookups
const toTile = (c) => ({ land: decodeTile(c.land), phys: c.phys ? decodeTile(c.phys) : null, col: c.col || null, cm: c.col ? colourMip(c.col) : null });
// the coarse colours of a tile: each node the mean (in linear light) of the 5 x 5 fine nodes around it, so far land does not alias the 32 m grid
function colourMip(col) {
  const out = new Uint8Array(CMN * CMN * 3), S = CT / CM;
  for (let j = 0; j < CMN; j++) for (let i = 0; i < CMN; i++) for (let q = 0; q < 3; q++) {
    let s = 0, n = 0;
    for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { const fi = i * S + a, fj = j * S + b; if (fi < 0 || fj < 0 || fi > CT || fj > CT) continue; s += LUT[col[(fj * CN + fi) * 3 + q]]; n++; }
    out[(j * CMN + i) * 3 + q] = Math.round(Math.sqrt(s / n) * 255);
  }
  return out;
}

// The resident level's heights streamed (EV-01 follow-up): its 752 tiles' height arrays were 150 MB of the capital build's renderer, but only the
// fine questions (landfn: cells <= 32 m, within about a kilometre of the camera, and the physics) read them; the far rings read only the colours.
// With a synchronous reader (main.js: one Range request of the tile's chunk, regionload.js) every tile keeps its colours and its key, and its
// heights come in around the player (stream) or at once when a question lands on a tile without them (the same numbers as a resident tile), and
// go again when far and unread since the last pass, at most HM_CAP tiles' heights kept. Without a reader (node tests) every tile stays whole.
let SYNC = null, USE = 0, LAST = 0;
export const HM_CAP = 24;
// how a tile's chunk is read at once (key -> decoded chunk or null); set before loadResident
export function setTileReader(f) { SYNC = f; }
// the heights of a resident tile that has only its colours, read at once
function heights(L, t) {
  const c = SYNC && SYNC(t.key); if (!c) { t.missing = true; return; }
  t.land = decodeTile(c.land); t.phys = c.phys ? decodeTile(c.phys) : null; t.col = c.col || null; L.live.add(t.id); L.stats.sync++;
}
const LUT = new Float32Array(256).map((_, i) => (i / 255) ** 2);
// the baked ground colour at (x, z) into out (linear rgb), false where no tile with colour is loaded. cell: the size of the asker's grid in m; a
// grid coarser than CM_FULL reads the tile's coarse colours, a finer one the full grid (read at once, with the heights, when it was let go)
export function colorAt(x, z, out, cell = 0) {
  for (const L of lvl) {
    if (!L.tiles.size) continue;
    const { t, u, v } = L.tile(x, z); if (!t) continue;
    const full = cell <= CM_FULL || !t.cm;
    if (full && !t.col) { if (!SYNC || t.missing || L.stream) continue; heights(L, t); if (!t.col) continue; }
    if (full) t.used = ++USE;
    const R = full ? CT : CM, RN = R + 1, c = full ? t.col : t.cm;
    const cu = Math.min(R - 1e-6, Math.max(0, u * R / TILE)), cv = Math.min(R - 1e-6, Math.max(0, v * R / TILE)), i = cu | 0, j = cv | 0, fu = cu - i, fv = cv - j, k = (j * RN + i) * 3, K = RN * 3;
    const w00 = (1 - fu) * (1 - fv), w10 = fu * (1 - fv), w01 = (1 - fu) * fv, w11 = fu * fv;
    for (let q = 0; q < 3; q++) out[q] = LUT[c[k + q]] * w00 + LUT[c[k + 3 + q]] * w10 + LUT[c[k + K + q]] * w01 + LUT[c[k + K + 3 + q]] * w11;
    return true;
  }
  return false;
}

// load every tile of the always-resident level from the store (before the game starts); returns how many
export async function loadResident(wd) {
  let n = 0;
  for (const L of lvl) {
    if (L.stream) continue;
    const keys = wd.keys(L.key + '/'); if (!keys.length) continue;
    for (let a = 0; a < keys.length; a += 24) {
      await Promise.all(keys.slice(a, a + 24).map(async (k) => {
        const [i, j] = k.slice(L.key.length + 1).split('_').map(Number), id = j * L.n + i, c = await wd.get(k);
        L.tiles.set(id, SYNC ? { id, key: k, land: null, phys: null, col: null, cm: c.col ? colourMip(c.col) : null } : toTile(c)); wd.drop(k); n++;   // streamed heights: coarse colours only (above)
      }));
    }
  }
  return n;
}
// the resident level's heights around (x, z): the tiles within one tile read in the background, those further out and unread since the last pass
// let go (colours kept), and the oldest beyond HM_CAP. Walks only the tiles holding heights (a few dozen), so it runs every frame.
function streamHeights(wd, L, x, z) {
  const ci = Math.floor((x - TILE_ORIGIN.x) / L.size), cj = Math.floor((z - TILE_ORIGIN.z) / L.size), near = (id) => Math.abs(id % L.n - ci) <= 1 && Math.abs(((id / L.n) | 0) - cj) <= 1;
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const id = j * L.n + i, t = i >= 0 && j >= 0 && i < L.n && j < L.n ? L.tiles.get(id) : null;
    if (!t || t.land || t.missing || L.loading.has(id)) continue;
    L.loading.add(id);
    wd.get(t.key).then((c) => { if (!t.land) { t.land = decodeTile(c.land); t.phys = c.phys ? decodeTile(c.phys) : null; t.col = c.col || null; t.used = ++USE; L.live.add(id); L.stats.async++; } wd.drop(t.key); }).catch(() => {}).finally(() => L.loading.delete(id));
  }
  const far = [];
  for (const id of L.live) {
    const t = L.tiles.get(id); if (near(id)) continue;
    if ((t.used || 0) <= LAST) { t.land = t.phys = t.col = null; L.live.delete(id); L.stats.freed++; } else far.push(t);
  }
  if (L.live.size > HM_CAP) { far.sort((a, b) => a.used - b.used); for (const t of far.slice(0, L.live.size - HM_CAP)) { t.land = t.phys = t.col = null; L.live.delete(t.id); L.stats.freed++; } }
  LAST = USE;
}
// keep the streamed levels around (x, z): tiles within `ring` tiles are requested, tiles beyond ring + 2 are let go. Cheap when the focus stays in its tile.
export function stream(wd, x, z, ring = 1) {
  for (const L of lvl) {
    if (!L.stream && SYNC && L.tiles.size) streamHeights(wd, L, x, z);
    if (!L.stream) continue; if (L.have === undefined) L.have = wd.keys(L.key + '/').length > 0; if (!L.have) continue;
    const ci = Math.floor((x - TILE_ORIGIN.x) / L.size), cj = Math.floor((z - TILE_ORIGIN.z) / L.size);
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
