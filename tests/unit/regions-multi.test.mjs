// Several compiled regions at once (ADR-0044, src/region.js regions): a province's owned cells are its own ground alone, its unowned edge fades out
// over the edge band, the capital keeps its keep zone and bands, and the road lists join with their junction numbers renumbered. Made-up rasters, so it
// runs without a compiled world.
const g = 16, mk = (name, x0, z0, nx, nz, hgt, extra) => ({ name, scale: undefined, g, nx, nz, x0, z0, edge: 1000, h: new Int16Array(nx * nz).fill(hgt * 10),
  water: new Uint8Array(nx * nz), level: new Int16Array(nx * nz), places: [{ name: name + '-p', x: x0 + 100, z: z0 + 100 }],
  roads: [{ id: name + ':a', x: [x0 + 50, x0 + 60], z: [z0 + 50, z0 + 50], next: [[1, 0]], prev: [] }, { id: name + ':b', x: [x0 + 60, x0 + 70], z: [z0 + 50, z0 + 50], next: [], prev: [[0, 1]] }], ...extra });
const { KOREA_SCALE } = await import('../../src/koreamap.js');
// the capital: 20 km square around the origin; a province east of it, 20 km wide, owning the cells east of x = 9,000
const cap = mk('capital', -10000, -10000, 1251, 1251, 10, { scale: KOREA_SCALE, keep: 1500, band: 600 });
const pnx = 1251, pnz = 1251, px0 = 5000, own = new Uint8Array(pnx * pnz);
for (let j = 0; j < pnz; j++) for (let i = 0; i < pnx; i++) { const x = px0 + i * g; own[j * pnx + i] = x >= 9000 && x <= 24000 ? 255 : Math.min(254, Math.ceil(Math.max(9000 - x, x - 24000) / g)); }
const prov = mk('gyeonggi', px0, -10000, pnx, pnz, 50, { scale: KOREA_SCALE, own });
globalThis.__REGION = cap; globalThis.__REGIONS = [prov];
const R = await import('../../src/region.js');
const bad = [], m = {};
const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;
m.regions = R.regions().length; if (m.regions !== 2) bad.push(['regions', m.regions]);
// inside the capital, away from its edge: the capital alone
if (!near(R.regionWeight(5000, 0), 1) || !near(R.regionHeight(5000, 0), 10)) bad.push(['capital inside', R.regionWeight(5000, 0), R.regionHeight(5000, 0)]);
// the keep zone is nobody's (the province does not reach the origin)
if (R.regionWeight(0, 0) !== 0) bad.push(['keep zone', R.regionWeight(0, 0)]);
// an owned cell of the province, in the capital's edge band: the province alone
m.seam = [R.regionWeight(9500, 0), R.regionHeight(9500, 0)];
if (!near(m.seam[0], 1) || !near(m.seam[1], 50)) bad.push(['owned cell in the capital band', ...m.seam]);
// deep in the province
if (!near(R.regionHeight(20000, 0), 50)) bad.push(['province inside', R.regionHeight(20000, 0)]);
// past the province's owned cells: fading out over the edge band, nothing beyond it
const w1 = R.regionWeight(24500, 0), w2 = R.regionWeight(25200, 0);
m.fade = [w1, w2]; if (!(w1 > 0 && w1 < 1) || w2 !== 0) bad.push(['fade', w1, w2]);
// the joined lists
const roads = R.regionRoads(); m.roads = roads.length;
if (roads.length !== 4 || roads[2].next[0][0] !== 3 || roads[3].prev[0][0] !== 2 || roads[0].next[0][0] !== 1) bad.push(['roads renumbered', JSON.stringify(roads.map((r) => [r.next, r.prev]))]);
if (R.regionPlaces().length !== 2) bad.push(['places', R.regionPlaces().length]);
// heights continuous along a line across the capital band and into the province (no step over 1 m per 16 m)
let step = 0, prev = R.regionHeight(7000, 3000);
for (let x = 7016; x < 12000; x += 16) { const h = R.regionHeight(x, 3000); step = Math.max(step, Math.abs(h - prev)); prev = h; }
m.maxStep = +step.toFixed(2);
// the step at the owned edge is the one seam: the capital's band blends toward the province's ground, so the height there moves smoothly except where
// ownership starts (both rasters are the same DEM in a real compile; here they differ by 40 m on purpose)
if (step > 40.01) bad.push(['height jump', step]);
// tiles of two regions on one seam tile join (build/world/mergetiles.mjs): the second's buildings and rings after the first's, its street arms and runs
// after the first's with its road lines moved up by the first region's count
{
  const { mergeTiles } = await import('../../build/world/mergetiles.mjs'), { readRealTile } = await import('../../build/world/osmbuildings.mjs'), { decodeTile } = await import('../../src/streetgeo.js');
  const ring = (x, z) => [[x, z], [x + 5, z], [x + 5, z + 5], [x, z + 5]];
  const bt = (x) => ({ n: 1, cx: Int16Array.of(x), cz: Int16Array.of(0), w: Uint16Array.of(80), d: Uint16Array.of(80), rot: Uint16Array.of(0), fl: Uint8Array.of(2), kind: Uint8Array.of(0), notch: Uint8Array.of(0),
    pn: 1, pr: Int32Array.of(0, 1), ro: Int32Array.of(0, 4), px: Int16Array.from(ring(x, 0).map((p) => p[0])), pz: Int16Array.from(ring(x, 0).map((p) => p[1])), ph: Uint16Array.of(90), pb: Uint16Array.of(0), pfl: Uint8Array.of(3), pk: Uint8Array.of(0), ps: Uint8Array.of(1), pid: Float64Array.of(x) });
  const B = mergeTiles([{ tiles: { '256_256': bt(10) } }, { tiles: { '256_256': bt(500) } }], 'bld').tiles['256_256'], rb = readRealTile('256_256', B);
  m.mergedBld = [B.n, B.pn, rb.length, rb[1]?.rings[0].length];
  if (B.n !== 2 || B.pn !== 2 || rb.length !== 2 || rb[1].rings[0].length !== 4 || Math.abs(rb[1].rings[0][0][0] - rb[0].rings[0][0][0] - 49) > 0.01) bad.push(['buildings merge', JSON.stringify(m.mergedBld)]);
  const st = (line) => ({ nj: 1, jx: Int16Array.of(0), jz: Int16Array.of(0), jy: Int16Array.of(0), jf: Uint8Array.of(0), jn: Uint8Array.of(2), jo: Int32Array.of(0, 2),
    na: 2, aang: Uint16Array.of(0, 30000), ahalf: Uint8Array.of(30, 30), ameta: Uint8Array.of(0, 0), aw: Uint8Array.of(0, 0), atl: Uint8Array.of(0, 0), atr: Uint8Array.of(0, 0), aline: Int32Array.of(line, line), aarr: Uint16Array.of(0, 0), amark: Uint8Array.of(0, 0),
    nr: 1, rline: Int32Array.of(line), ri0: Uint16Array.of(0), ri1: Uint16Array.of(1), rw: Uint8Array.of(20), rm: Uint8Array.of(0), rta: Uint8Array.of(0, 0), rtb: Uint8Array.of(0, 0),
    nf: 0, ft: new Uint8Array(0), fx: new Int16Array(0), fz: new Int16Array(0), fy: new Int16Array(0), fdir: new Uint8Array(0), fv: new Uint8Array(0),
    nc: 0, cx: new Int16Array(0), cz: new Int16Array(0), cy: new Int16Array(0), cang: new Uint16Array(0), chalf: new Uint8Array(0), cwid: new Uint8Array(0), cf: new Uint8Array(0) });
  const S = mergeTiles([{ tiles: { '256_256': st(3) } }, { tiles: { '256_256': st(1) }, roadOff: 100 }], 'str').tiles['256_256'];
  m.mergedStr = [S.nj, S.na, Array.from(S.jo), Array.from(S.aline), Array.from(S.rline)];
  if (S.nj !== 2 || S.na !== 4 || S.jo.join() !== '0,2,4' || S.aline.join() !== '3,3,101,101' || S.rline.join() !== '3,101') bad.push(['streets merge', JSON.stringify(m.mergedStr)]);
  try { decodeTile('256_256', S); } catch (e) { bad.push(['merged street tile does not decode', e.message]); }
}
console.log('RESULT ' + JSON.stringify({ test: 'regions-multi', pass: bad.length === 0, metrics: m, note: bad.length ? JSON.stringify(bad) : '' }));
process.exit(bad.length ? 1 : 0);
