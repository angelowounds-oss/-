// Road blockers (2026-11-09): a building whose footprint lies on a road's carriageway at the road's own height blocks that road. Three sources:
//   capital  the compiled region (region.bin + buildings.bin, build/world/blocks.mjs): the map's outlines and the procedural buildings against the road lines;
//            the game's own reader (src/region.js) gives the ground and the road lines, so the check sees what the player sees.
//   cities   the other cities (src/citylayout.js layoutCity, the same layouts citysites.js draws): axis-aligned lots against the street lines, all at ground level.
//   sites    the places between the cities (src/settlements.js: villages, farms, industry, towers) against the road network, the country roads and, inside
//            the compiled region, the map's own buildings (its own check below: a house is a rectangle in the village's frame).
// The road-centred view of the first (how wide the gap between the walls is along every line) is build/world/corridor.mjs.
// A sample inside a footprint blocks when it lies within the road's half width of the centre line and the road's surface lies between the ground under the
// building and its top. A road on a flyover over a building, or in a tunnel under one, does not block. Writes blockers.json under build/baked/world/<mode>/.
// usage: node build/world/blockers.mjs [capital|cities|sites]
import fs from 'node:fs';
import path from 'node:path';
import { readBuildings, readTile } from './blocks.mjs';
import { readRegion } from './emit.mjs';
import { unproject } from './geo.mjs';
import { namer } from './names.mjs';
import { siteCheck } from './sites.mjs';
import { CAPITAL } from '../../src/koreamap.js';   // local = map - CAPITAL (src/frame.js): the lon/lat needs the offset back

const mode = process.argv[2] || 'capital';
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'baked', 'world');
const MIN_AREA = 4;        // m2 of footprint on the carriageway before a building counts as blocking (a corner touching a kerb does not)
const STRICT = 0.25;       // a share of the footprint on the carriageway from which the building is listed as strongly blocking
const CELL = 50, MARGIN = 9, K = (a, b) => a * 100003 + b;

// ---- the sources: road lines { x[], z[], y[], half, hw, name } and buildings { x, z, base, top, kind, id, px?, pz? } (px/pz: outline, else a rectangle)
let roads = [], groundAt = () => 0, buildingsOf = null, placeOf = (x, z) => '';
if (mode === 'capital') {
  const dir = path.join(root, 'capital');
  const R = readRegion(path.join(dir, 'region.bin'));
  if (!R) { console.error('no region at ' + dir); process.exit(1); }
  globalThis.__REGION = R;   // the game's reader takes the region from here (src/region.js region())
  const { regionRoads, regionHeight } = await import('../../src/region.js');
  roads = regionRoads();
  // what-if knob: RES_HALF=3.5 gives the untagged residential streets (drawn 12.3 m wide by default) a 7 m carriageway, to see how much of the count they carry
  if (process.env.RES_HALF) for (const r of roads) if (r.hw === 'residential' && r.half > 3.5) r.half = +process.env.RES_HALF;
  groundAt = (x, z) => regionHeight(x, z);
  placeOf = namer(R);   // the nearest named place: the province boxes call Seongnam and Gwangmyeong "seoul"
  buildingsOf = function* () {
    const B = readBuildings(path.join(dir, 'buildings.bin'));
    if (!B) { console.error('no buildings.bin in ' + dir); process.exit(1); }
    for (const key of Object.keys(B.tiles)) {
      const [ti, tj] = key.split('_').map(Number), TILE = 512, TOFF = 256;
      const ox = (ti - TOFF) * TILE + TILE / 2, oz = (tj - TOFF) * TILE + TILE / 2, t = B.tiles[key];
      for (const p of readTile(key, t)) {   // procedural: a rotated rectangle, floors x 3.5 m
        const c = Math.cos(p.rot), s = Math.sin(p.rot), hw = p.w / 2, hd = p.d / 2, px = [], pz = [];
        for (const [u, v] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) { px.push(p.x + u * c - v * s); pz.push(p.z + u * s + v * c); }
        yield { kind: 'proc', px, pz, base: 0, top: Math.max(3.5, p.fl * 3.5), x: p.x, z: p.z };
      }
      for (let b = 0; b < (t.pn || 0); b++) {   // real: the outline's ring (0.1 m from the tile centre), the height of the top and the base
        const r0 = t.pr[b], v0 = t.ro[r0], v1 = t.ro[r0 + 1];
        if (!(v1 - v0 >= 3)) continue;
        const px = [], pz = [];
        for (let i = v0; i < v1; i++) { px.push(ox + t.px[i] / 10); pz.push(oz + t.pz[i] / 10); }
        let cx = 0, cz = 0; for (let i = 0; i < px.length; i++) { cx += px[i]; cz += pz[i]; }
        yield { kind: 'real', id: t.pid[b], px, pz, base: t.pb[b] / 10, top: t.ph[b] / 10, x: cx / px.length, z: cz / pz.length };
      }
    }
  };
} else if (mode === 'cities') {
  // the other cities: each layout's streets and lots, placed at the city's centre (local frame)
  const wm = await import('../../src/worldmap.js'), L = await import('../../src/citylayout.js');
  const cs = wm.cities();
  const laid = cs.map((c, i) => (L.STYLES[c.id] ? { c, lay: L.layoutCity(c, i) } : null)).filter(Boolean);
  for (const { c, lay } of laid) {
    for (let r = 0; r < lay.roads.length; r += 5) {
      roads.push({ x: [c.x + lay.roads[r], c.x + lay.roads[r + 2]], z: [c.z + lay.roads[r + 1], c.z + lay.roads[r + 3]], y: [0, 0], half: lay.roads[r + 4] / 2, hw: 'city street', name: c.id, city: c.id });
    }
  }
  placeOf = (x, z) => laid.reduce((best, q) => (Math.hypot(q.c.x - x, q.c.z - z) < Math.hypot(best.c.x - x, best.c.z - z) ? q : best)).c.id;
  buildingsOf = function* () {
    for (const { c, lay } of laid) for (let i = 0; i < lay.bld.length / 12; i++) {
      const o = i * 12, x = c.x + lay.bld[o], z = c.z + lay.bld[o + 1], W = lay.bld[o + 2], D = lay.bld[o + 3], hp = lay.bld[o + 4], ht = lay.bld[o + 5];
      yield { kind: 'city', id: `${c.id}#${i}`, px: [x - W / 2, x + W / 2, x + W / 2, x - W / 2], pz: [z - D / 2, z - D / 2, z + D / 2, z + D / 2], base: 0, top: hp + ht, x, z };
    }
  };
} else if (mode === 'sites') { const { siteReport } = await import('./sites.mjs'); siteReport(await siteCheck(root)); process.exit(0); } else { console.error('usage: node build/world/blockers.mjs [capital|cities|sites]'); process.exit(1); }

// ---- every road segment, flat, and a grid of 50 m cells: a segment is listed in every cell its box grown by the half width reaches
let nseg = 0; for (const r of roads) nseg += Math.max(0, r.x.length - 1);
const SX0 = new Float64Array(nseg), SZ0 = new Float64Array(nseg), SX1 = new Float64Array(nseg), SZ1 = new Float64Array(nseg);
const SY0 = new Float64Array(nseg), SY1 = new Float64Array(nseg), SR = new Int32Array(nseg), SH = new Float64Array(nseg);
const grid = new Map();
{
  let s = 0;
  roads.forEach((r, ri) => {
    for (let i = 0; i + 1 < r.x.length; i++, s++) {
      SX0[s] = r.x[i]; SZ0[s] = r.z[i]; SX1[s] = r.x[i + 1]; SZ1[s] = r.z[i + 1]; SY0[s] = r.y[i]; SY1[s] = r.y[i + 1]; SR[s] = ri; SH[s] = r.half || 5;
      const m = SH[s] + MARGIN, x0 = Math.floor((Math.min(SX0[s], SX1[s]) - m) / CELL), x1 = Math.floor((Math.max(SX0[s], SX1[s]) + m) / CELL);
      const z0 = Math.floor((Math.min(SZ0[s], SZ1[s]) - m) / CELL), z1 = Math.floor((Math.max(SZ0[s], SZ1[s]) + m) / CELL);
      for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) { const k = K(a, b); let g = grid.get(k); if (!g) grid.set(k, (g = [])); g.push(s); }
    }
  });
}

// distance from a point to one road segment; the road's height at the nearest point goes to NY
let NY = 0;
function segDist(s, x, z) {
  const ex = SX1[s] - SX0[s], ez = SZ1[s] - SZ0[s], l2 = ex * ex + ez * ez || 1;
  let t = ((x - SX0[s]) * ex + (z - SZ0[s]) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  NY = SY0[s] + (SY1[s] - SY0[s]) * t;
  return Math.hypot(SX0[s] + ex * t - x, SZ0[s] + ez * t - z);
}
// point in a polygon (even-odd ray cast)
function inside(x, z, px, pz) {
  let c = false;
  for (let i = 0, j = px.length - 1; i < px.length; j = i++) if ((pz[i] > z) !== (pz[j] > z) && x < ((px[j] - px[i]) * (z - pz[i])) / (pz[j] - pz[i]) + px[i]) c = !c;
  return c;
}
// the area of a polygon (shoelace), m2
function area(px, pz) { let a = 0; for (let i = 0, j = px.length - 1; i < px.length; j = i++) a += px[j] * pz[i] - px[i] * pz[j]; return Math.abs(a) / 2; }

// one building against the roads: its footprint sampled on a grid (2 m, coarser for a big one); every sample on a carriageway at the road's height counts.
// Returns the blocked area (m2) and the road it blocks most (index into roads)
function check(b) {
  const px = b.px, pz = b.pz;
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (let i = 0; i < px.length; i++) { if (px[i] < minx) minx = px[i]; if (px[i] > maxx) maxx = px[i]; if (pz[i] < minz) minz = pz[i]; if (pz[i] > maxz) maxz = pz[i]; }
  const span = Math.max(maxx - minx, maxz - minz), S = span > 120 ? span / 60 : 2;
  const roadHits = new Map(); let hits = 0;
  for (let x = minx + S / 2; x < maxx; x += S) for (let z = minz + S / 2; z < maxz; z += S) {
    if (!inside(x, z, px, pz)) continue;
    const g = grid.get(K(Math.floor(x / CELL), Math.floor(z / CELL))); if (!g) continue;
    const ground = groundAt(x, z); if (ground !== ground) continue;   // outside the raster: nothing to judge
    for (const s of g) {
      if (segDist(s, x, z) > SH[s]) continue;
      // the road's surface must lie inside the building's height (not under the ground, not above the roof)
      if (NY > ground + b.base - 0.5 && NY < ground + b.top) { hits++; roadHits.set(SR[s], (roadHits.get(SR[s]) || 0) + 1); break; }
    }
  }
  let road = -1, most = 0; for (const [ri, n] of roadHits) if (n > most) { most = n; road = ri; }
  return { area: hits * S * S, road, footprint: area(px, pz) };
}

// every building: flagged when it blocks at least MIN_AREA
const found = [], scanned = { real: 0, proc: 0, city: 0 }, t0 = Date.now();
for (const b of buildingsOf()) {
  scanned[b.kind]++;
  const r = check(b);
  if (r.area >= MIN_AREA) found.push({ kind: b.kind, id: b.id, x: b.x, z: b.z, area: r.area, frac: r.area / Math.max(1, r.footprint), road: r.road });
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);

// clusters of 300 m: how many buildings, the area blocked, the roads they block, and the place (lon/lat, province)
const CL = 300, cl = new Map();
for (const f of found) {
  const k = Math.floor(f.x / CL) + ',' + Math.floor(f.z / CL);
  let c = cl.get(k); if (!c) cl.set(k, (c = { n: 0, area: 0, max: 0, sx: 0, sz: 0, roads: new Map(), real: 0, strict: 0 }));
  c.n++; c.area += f.area; c.max = Math.max(c.max, f.area); c.sx += f.x; c.sz += f.z; if (f.kind === 'real') c.real++; if (f.frac >= STRICT) c.strict++;
  if (f.road >= 0) { const rd = roads[f.road], nm = `${rd.name || rd.ref || rd.id} (${rd.hw})`; c.roads.set(nm, (c.roads.get(nm) || 0) + 1); }
}
const clusters = [...cl.values()].map((c) => {
  const x = c.sx / c.n, z = c.sz / c.n, ll = unproject(x + CAPITAL.x, z + CAPITAL.z);
  const roadTop = [...c.roads].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, k]) => `${n} ${k}`);
  return { lon: +ll.lon.toFixed(5), lat: +ll.lat.toFixed(5), x: Math.round(x), z: Math.round(z), place: placeOf(x, z), buildings: c.n, strict: c.strict, real: c.real, areaM2: Math.round(c.area), maxM2: Math.round(c.max), roads: roadTop };
}).sort((a, b) => b.areaM2 - a.areaM2);

const byPlace = {}, byHw = {}, hist = new Array(10).fill(0);
for (const c of clusters) byPlace[c.place] = (byPlace[c.place] || 0) + c.buildings;
for (const f of found) { const hw = f.road >= 0 ? roads[f.road].hw : 'none'; byHw[hw] = (byHw[hw] || 0) + 1; hist[Math.min(9, Math.floor(f.frac * 10))]++; }
const out = { mode, scanned, flagged: found.length, strict: found.filter((f) => f.frac >= STRICT).length, fracHist: hist, seconds: +secs, byPlace, byRoadClass: byHw, clusters: clusters.slice(0, 500) };
const dir = path.join(root, mode); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'blockers.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ scanned, flagged: out.flagged, strict: out.strict, fracHist: hist, clusters: clusters.length, seconds: out.seconds, byRoadClass: byHw }));
for (const c of clusters.slice(0, 25)) console.log(`${c.lat},${c.lon}\t${c.place}\t${c.buildings} buildings (${c.strict} strong)\t${c.areaM2} m2\t${c.roads.join(' / ')}`);

