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
} else if (mode === 'sites') { await sites(); process.exit(0); } else { console.error('usage: node build/world/blockers.mjs [capital|cities|sites]'); process.exit(1); }

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

// ---- sites: every house of every village and farm (a rectangle in the place's own frame, which has the world's axes) against the roads and, inside the
// compiled region, the map's buildings; and the pads of the industry and the towers against the roads. A place with a real name (ADR-0021) is an invented
// village laid at the real town's spot, where the map now has its own streets and buildings (WLD-24h): that is where houses stand on roads.
async function sites() {
  const R = readRegion(path.join(root, 'capital', 'region.bin')), B = R ? readBuildings(path.join(root, 'capital', 'buildings.bin')) : null;
  if (R) globalThis.__REGION = R;
  const { settlements } = await import('../../src/settlements.js'), { net } = await import('../../src/roadnet.js'), { regionWeight } = await import('../../src/region.js');
  const S = settlements(), N = net(), CS = 64, SEG = [], grid = new Map();
  // a road segment with its drawn half width, in every 64 m cell it reaches (bridges and tunnels left out: nothing stands at their level)
  const seg = (x0, z0, x1, z1, half, label) => { const id = SEG.push([x0, z0, x1, z1, half, label]) - 1, m = half + 2; for (let a = Math.floor((Math.min(x0, x1) - m) / CS); a <= Math.floor((Math.max(x0, x1) + m) / CS); a++) for (let b = Math.floor((Math.min(z0, z1) - m) / CS); b <= Math.floor((Math.max(z0, z1) + m) / CS); b++) { const k = K(a, b); let g = grid.get(k); if (!g) grid.set(k, (g = [])); g.push(id); } };
  // compiled lines carry their half width; a ramp of the old network is 9.2 m wide, its dual highways 30.5 m (src/highways.js)
  for (const r of N.roads) { const half = r.kind === 'arterial' ? (r.half || 5) : r.kind === 'ramp' ? 4.6 : 15.25, n = r.pts.length, m = r.closed ? n : n - 1; for (let i = 0; i < m; i++) { if (r.cls && (r.cls[i] || r.cls[(i + 1) % n])) continue; const A = r.pts[i], P = r.pts[(i + 1) % n]; seg(A[0], A[1], P[0], P[1], half, r.kind === 'arterial' ? r.hw : r.kind); } }
  // the country roads (assets/roads/country.bin, src/countryroads.js): u32 header length, a JSON head, then x z pairs; 8.8 m asphalt or a 5.8 m track
  { const bin = fs.readFileSync(path.join(root, '..', '..', '..', 'assets', 'roads', 'country.bin')), hl = bin.readUInt32LE(0), head = JSON.parse(bin.subarray(4, 4 + hl).toString('utf8'));
    for (const r of head.roads) { const p = new Float32Array(bin.buffer.slice(bin.byteOffset + 4 + hl + r.off, bin.byteOffset + 4 + hl + r.off + r.n * 8)); for (let q = 0; q + 1 < r.n; q++) seg(p[q * 2], p[q * 2 + 1], p[q * 2 + 2], p[q * 2 + 3], r.cls ? 2.9 : 4.4, 'country'); } }
  const onRoad = (x, z) => { const g = grid.get(K(Math.floor(x / CS), Math.floor(z / CS))); if (!g) return null; for (const id of g) { const s = SEG[id], ex = s[2] - s[0], ez = s[3] - s[1], l2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - s[0]) * ex + (z - s[1]) * ez) / l2)); if (Math.hypot(s[0] + ex * t - x, s[1] + ez * t - z) < s[4]) return s[5]; } return null; };
  // the map's outlines of a 512 m tile and the eight around it, read when a place needs them
  const polys = new Map();
  const tilePolys = (ti, tj) => { const key = ti + '_' + tj; if (polys.has(key)) return polys.get(key); const t = B?.tiles[key], out = []; if (t) { const ox = (ti - B.off) * B.tile + B.tile / 2, oz = (tj - B.off) * B.tile + B.tile / 2; for (let b = 0; b < (t.pn || 0); b++) { const r0 = t.pr[b], px = [], pz = []; for (let i = t.ro[r0]; i < t.ro[r0 + 1]; i++) { px.push(ox + t.px[i] / 10); pz.push(oz + t.pz[i] / 10); } out.push({ px, pz }); } } polys.set(key, out); return out; };
  const inBuilding = (x, z) => { if (!B) return false; const ti = Math.floor(x / B.tile) + B.off, tj = Math.floor(z / B.tile) + B.off; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const p of tilePolys(ti + a, tj + b)) if (inside(x, z, p.px, p.pz)) return true; return false; };
  const rows = [], tot = { places: 0, houses: 0, onRoad: 0, onMapBuilding: 0 };
  for (const v of [...S.villages, ...S.farms]) {
    const inReg = regionWeight(v.x, v.z) > 0, labels = new Set(); let hr = 0, hb = 0; tot.places++;
    for (const h of v.houses) {
      const [x0, z0, x1, z1] = h.r; let r = 0, b = 0; tot.houses++;
      for (let x = x0 + 1; x < x1; x += 2) for (let z = z0 + 1; z < z1; z += 2) { const lab = onRoad(v.x + x, v.z + z); if (lab) { r++; labels.add(lab); } if (inReg && inBuilding(v.x + x, v.z + z)) b++; }
      if (r * 4 >= MIN_AREA) hr++; if (b * 4 >= MIN_AREA) hb++;
    }
    // the village's own main street (along x through its centre) inside the map's buildings
    let sIn = 0, sN = 0; if (inReg && v.Lh) for (let x = -v.Lh; x <= v.Lh; x += 4) { sN++; if (inBuilding(v.x + x, v.z)) sIn++; }
    tot.onRoad += hr; tot.onMapBuilding += hb;
    if (hr || hb || sIn) { const ll = unproject(v.x + CAPITAL.x, v.z + CAPITAL.z); rows.push({ id: v.id, name: v.name, tag: v.tag || (v.farm ? 'farm' : ''), lat: +ll.lat.toFixed(4), lon: +ll.lon.toFixed(4), x: Math.round(v.x), z: Math.round(v.z), houses: v.houses.length, onRoad: hr, onMapBuilding: hb, streetInBuildingPct: sN ? Math.round(100 * sIn / sN) : 0, roads: [...labels].join(', ') }); }
  }
  // the pads of the industry and the towers: a road through the flat ground they stand on
  const pads = [];
  for (const s of [...S.industry, ...S.towers]) { const r = s.type === 'wind' ? 60 : s.type === 'refinery' ? 210 : s.type === 'mine' ? 190 : s.type ? 150 : 24; let hit = 0, n = 0; for (let a = 0; a < 6.28; a += 0.2) for (const k of [0.3, 0.6, 0.9]) { n++; if (onRoad(s.x + Math.cos(a) * r * k, s.z + Math.sin(a) * r * k)) hit++; } if (hit) pads.push({ id: s.id, type: s.type || 'tower', roadPct: Math.round(100 * hit / n) }); }
  rows.sort((a, b) => b.onRoad - a.onRoad || b.onMapBuilding - a.onMapBuilding);
  const out = { mode: 'sites', counts: { villages: S.villages.length, realNamed: S.villages.filter((v) => v.tag === 'real').length, farms: S.farms.length, industry: S.industry.length, towers: S.towers.length }, total: tot, placesAffected: rows.length, places: rows, pads };
  fs.mkdirSync(path.join(root, 'sites'), { recursive: true }); fs.writeFileSync(path.join(root, 'sites', 'blockers.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ counts: out.counts, total: tot, placesAffected: rows.length, pads }));
  for (const r of rows.slice(0, 20)) console.log(`${r.lat},${r.lon}\t${r.name} (${r.tag})\t${r.onRoad} of ${r.houses} houses on a road, ${r.onMapBuilding} on a map building\t${r.roads}`);
}
