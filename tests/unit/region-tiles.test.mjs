// EV-01: a compiled region streamed in tiles (src/regtile.js, build/regtiles.mjs, src/region.js) answers every question as the region holding its
// whole raster: the ground, the physics ground, the water and the weight at random points of the capital and the compiled provinces, through the
// stored form of the tiles (encodeChunk / decodeChunk, the page's path less deflate); the coarse raster with no tile loaded equals the fine ground on
// its nodes; the streaming keeps the tiles near the points and lets go of the far ones. Skips with a note when the regions were never compiled.
import path from 'node:path';
import fs from 'node:fs';
import { readRegion } from '../../build/world/emit.mjs';
import { regionMeta } from '../../build/regtiles.mjs';
import { cutTile, readTile, regTiles, REG_CG, REG_T, REG_S } from '../../src/regtile.js';
import { encodeChunk, decodeChunk } from '../../src/bakefmt.js';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '../../build/baked/world');
const names = ['capital', ...fs.readdirSync(DIR).filter((n) => n !== 'capital' && fs.existsSync(path.join(DIR, n, 'region.bin')))];
const full = names.map((n) => readRegion(path.join(DIR, n, 'region.bin'))).filter(Boolean);
const bad = [], m = {};
if (!full.length || full[0].name !== 'capital') {
  console.log('RESULT ' + JSON.stringify({ test: 'region-tiles', pass: true, metrics: {}, note: 'no compiled capital region (node build/world/compile.mjs --region capital --emit)' }));
} else {
  // the points: random over every raster (fractional cells), its corners and last row and column, the tile seams
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts = [];
  for (const R of full) {
    const x1 = R.x0 + (R.nx - 1) * R.g, z1 = R.z0 + (R.nz - 1) * R.g;
    for (let k = 0; k < 6000; k++) pts.push([R.x0 + rnd() * (x1 - R.x0), R.z0 + rnd() * (z1 - R.z0)]);
    pts.push([R.x0, R.z0], [x1, z1], [x1, R.z0], [R.x0, z1], [x1 - 0.01, z1 - 0.01]);
    for (let k = 1; k * REG_T < R.nx; k++) for (let q = 0; q < 6; q++) { const z = R.z0 + rnd() * (z1 - R.z0), x = R.x0 + k * REG_T * R.g; pts.push([x, z], [x - 0.3 * R.g, z], [x + 0.3 * R.g, z]); }
    for (let k = 1; k * REG_T < R.nz; k++) for (let q = 0; q < 6; q++) { const x = R.x0 + rnd() * (x1 - R.x0), z = R.z0 + k * REG_T * R.g; pts.push([x, z], [x, z - 0.3 * R.g], [x, z + 0.3 * R.g]); }
  }
  m.points = pts.length;
  // the coarse nodes inside every raster
  const nodes = [];
  for (const R of full) {
    const x1 = R.x0 + (R.nx - 1) * R.g, z1 = R.z0 + (R.nz - 1) * R.g;
    for (let z = Math.ceil(R.z0 / REG_CG) * REG_CG; z <= z1; z += REG_CG * 3) for (let x = Math.ceil(R.x0 / REG_CG) * REG_CG; x <= x1; x += REG_CG * 3) nodes.push([x, z]);
  }
  m.nodes = nodes.length;
  const ask = (RG) => pts.map(([x, z]) => { const w = RG.regionWater(x, z); return [RG.regionHeight(x, z), RG.regionPhysHeight(x, z), RG.regionWeight(x, z), w ? w.cls : -1, w ? w.level : -1]; });

  // 1. the whole rasters (the bake's form)
  globalThis.__REGION = full[0]; globalThis.__REGIONS = full.slice(1);
  const A = await import('../../src/region.js?whole');
  const a = ask(A), an = nodes.map(([x, z]) => A.regionHeight(x, z));
  // the meta (core chunk form) and every tile through its stored form
  const metas = full.map(regionMeta), stored = new Map();
  let tiles = 0, rawBytes = 0, metaBytes = 0;
  for (const R of full) {
    const T = regTiles(R);
    for (let tj = 0; tj < T.nj; tj++) for (let ti = 0; ti < T.ni; ti++) { const b = encodeChunk(cutTile(R, ti, tj)); stored.set(`${R.name}/${ti}_${tj}`, b); tiles++; }
    rawBytes += R.h.byteLength + R.water.byteLength + R.level.byteLength + (R.own ? R.own.byteLength : 0);
  }
  for (const M of metas) metaBytes += encodeChunk({ c: M.coarse, o: M.ownTiles || null, i: M.inland || null }).length;
  m.tiles = tiles; m.rasterMB = +(rawBytes / 2 ** 20).toFixed(1); m.metaRasterMB = +(metaBytes / 2 ** 20).toFixed(2);
  m.metaShare = +(metaBytes / rawBytes).toFixed(4);
  if (metaBytes > rawBytes * 0.1) bad.push(['the core keeps more than a tenth of the rasters', metaBytes, rawBytes]);
  for (const M of metas) if (M.h || M.water || M.level || M.own) bad.push(['meta kept a whole raster', M.name]);

  // 2. the streamed form: no raster, tiles read by a loader from the stored chunks
  globalThis.__REGION = metas[0]; globalThis.__REGIONS = metas.slice(1);
  const B = await import('../../src/region.js?tiled');
  const read = (R, ti, tj) => { const b = stored.get(`${R.name}/${ti}_${tj}`); return b ? readTile(decodeChunk(b)) : null; };
  B.setRegionLoader({ sync: read, request: async (R, ti, tj) => read(R, ti, tj) });
  // 2a. the coarse raster with no tile loaded: its nodes hold the fine ground
  let cOff = 0, cWorst = 0;
  nodes.forEach(([x, z], k) => { const d = Math.abs(B.regionHeight(x, z, true) - an[k]); cWorst = Math.max(cWorst, d); if (!(d <= 0.002)) cOff++; });
  m.coarseWorst = +cWorst.toFixed(5); m.tilesAfterCoarse = B.regionTilesLoaded();
  if (cOff) bad.push(['coarse nodes differ from the fine ground', cOff, nodes.length, cWorst]);
  if (B.regionTilesLoaded()) bad.push(['a coarse question read tiles', B.regionTilesLoaded()]);
  // 2b. every fine answer as with the whole raster (the missing tiles read at once)
  const b = ask(B);
  const what = ['height', 'phys', 'weight', 'water', 'level'], off = what.map(() => 0), worst = what.map(() => 0);
  for (let k = 0; k < pts.length; k++) for (let q = 0; q < 5; q++) {
    const u = a[k][q], v = b[k][q];
    if (u !== v && !(u !== u && v !== v)) { off[q]++; worst[q] = Math.max(worst[q], Math.abs(u - v)); }
  }
  what.forEach((w, q) => { m[w + 'Off'] = off[q]; if (off[q]) bad.push([w + ' differs from the whole raster', off[q], pts.length, worst[q]]); });
  m.syncReads = B.regionTileStats.sync;
  // 2c. the owner bytes: exact where they decide (owned, or a tile kept as it is); a tile summed up as beyond the band answers 254, still past it
  let oOff = 0, oN = 0;
  for (let q = 1; q < full.length; q++) {
    const R = full[q], M = B.regions().find((r) => r.name === R.name);
    for (let k = 0; k < 20000; k++) {
      const i = Math.floor(rnd() * R.nx), j = Math.floor(rnd() * R.nz), o = R.own[j * R.nx + i], t = B.ownAt(M, i, j); oN++;
      if (t === 254 && o !== 255 && o * R.g >= R.edge) continue;
      if (t !== o) oOff++;
    }
  }
  m.ownSamples = oN; if (oOff) bad.push(['owner bytes differ', oOff, oN]);
  // 3. the streaming: around one point only the near tiles stay, the far ones go, and a load brings the ones in reach
  for (const R of B.regions()) R.tiles.clear();
  const P = { x: 0, z: 0 }, reach = 3000;
  const n0 = await B.regionLoad(P.x, P.z, reach), inReach = B.regionTilesLoaded();
  B.regionStream([{ x: 60000, z: 60000 }], reach);   // walk far away: the tiles around the origin go
  const left = B.regions().reduce((s, R) => s + [...R.tiles.keys()].filter((id) => { const S = REG_T * R.g, cx = R.x0 + ((id % R.tiled.ni) + 0.5) * S, cz = R.z0 + (Math.floor(id / R.tiled.ni) + 0.5) * S; return Math.max(Math.abs(cx), Math.abs(cz)) < reach + S; }).length, 0);
  m.loadedAtBoot = n0; m.keptAfterLeaving = left;
  if (!(n0 > 0 && inReach === n0)) bad.push(['the boot load did not bring the tiles in reach', n0, inReach]);
  if (left) bad.push(['tiles far behind were kept', left]);
  // 3b. standing still: a tile read at once by a far question goes at the next pass when nothing reads it again, stays while something does, and
  // past REG_CAP out of reach the least recently used go (the pass was skipped while the player stayed in a tile, and nothing bounded the count)
  const C0 = B.regions().find((R) => R.tiled), S0 = REG_T * C0.g, home = { x: C0.x0 + S0 * 0.5, z: C0.z0 + S0 * 0.5 };
  for (const R of B.regions()) R.tiles.clear();
  await B.regionLoad(home.x, home.z, 1000); B.regionStream([home], 1000);
  const ids = [], far = [];
  for (let tj = 0; tj < C0.tiled.nj; tj++) for (let ti = 0; ti < C0.tiled.ni; ti++) { const cx = C0.x0 + (ti + 0.5) * S0, cz = C0.z0 + (tj + 0.5) * S0; if (Math.max(Math.abs(cx - home.x), Math.abs(cz - home.z)) > 1000 * 1.3 + S0 * 2 && stored.has(`${C0.name}/${ti}_${tj}`)) far.push([cx, cz, tj * C0.tiled.ni + ti]); }
  m.farTiles = far.length;
  if (far.length > B.REG_CAP + 4) {
    B.regionHeight(far[0][0], far[0][1]); B.regionHeight(far[1][0], far[1][1]);   // two far questions, then the pass
    B.regionStream([home], 1000);
    const kept1 = C0.tiles.has(far[0][2]) && C0.tiles.has(far[1][2]);
    B.regionHeight(far[0][0], far[0][1]); B.regionStream([home], 1000);         // far[0] read again since, far[1] not
    const reread = C0.tiles.has(far[0][2]), gone = !C0.tiles.has(far[1][2]);
    for (let k = 2; k < B.REG_CAP + 4; k++) B.regionHeight(far[k][0], far[k][1]);   // more far tiles than the cap, all read since the last pass
    B.regionStream([home], 1000);
    const outN = [...C0.tiles.keys()].filter((id) => ids.indexOf(id) < 0 && far.some((f) => f[2] === id)).length;
    m.lru = { kept1, reread, gone, outN, cap: B.REG_CAP };
    if (!kept1) bad.push(['a far tile read just before the pass was dropped (it would be read again each frame)']);
    if (!gone) bad.push(['a far tile nobody reads was kept while the player stood still']);
    if (outN > B.REG_CAP) bad.push(['more tiles out of reach than the cap', outN, B.REG_CAP]);
    if (C0.tiles.has(far[0][2])) bad.push(['the least recently used far tile kept past the cap']);
  } else bad.push(['too few far tiles to test the cap', far.length]);
  // 4. a tile holds REG_S samples a side and its seam row equals the next tile's first
  const R0 = full[0], t0 = readTile(decodeChunk(stored.get('capital/0_0'))), t1 = readTile(decodeChunk(stored.get('capital/1_0')));
  let seam = 0; for (let j = 0; j < REG_S; j++) if (t0.h[j * REG_S + REG_T] !== t1.h[j * REG_S]) seam++;
  if (R0.nx > REG_T && seam) bad.push(['tile seam differs', seam]);
}
console.log('RESULT ' + JSON.stringify({ test: 'region-tiles', pass: !bad.length, metrics: m, bad }));
process.exit(bad.length ? 1 : 0);
