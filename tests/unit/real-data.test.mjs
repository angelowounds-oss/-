// The real records of the capital region (DATA-01, WLD-24h, ADR-0042): the height facts read from the map's tags, the projection of Seoul's own records
// (EPSG:5186), and on a cropped Gangnam (where the caches were fetched): the real buildings replace the procedural ones without overlapping the ones
// kept in the gaps, every real building keeps a unique OSM uid and its outline to 0.1 m, the same input gives the same bytes, and the street decisions
// (signals, crossings) come mostly from records. Skips the cached parts with a note when the caches or the compiled region are missing.
import path from 'node:path';
import { project, CAPITAL } from '../../src/koreamap.js';
import { readRegion } from '../../build/world/emit.mjs';
import { makeBuildings } from '../../build/world/blocks.mjs';
import { metres, heightOf, readDetail, inside } from '../../build/world/realdetail.mjs';
import { mergeReal, addRealTiles, readRealTile } from '../../build/world/osmbuildings.mjs';
import { tmToLonLat, readSeoul } from '../../build/world/seouldata.mjs';
import { makeStreets, realShare, toTiles, readTile } from '../../build/world/streets.mjs';

const bad = [], m = {}, notes = [];
const near = (a, b, e) => Math.abs(a - b) <= e;
// ---- tags
if (metres('15') !== 15 || metres('15 m') !== 15 || metres('15.5m') !== 15.5 || !near(metres("50'"), 15.24, 1e-9) || !Number.isNaN(metres('tall'))) bad.push(['metres() parses lengths wrong']);
{
  const a = heightOf({ height: '42' }), b = heightOf({ 'building:levels': '5' }), c = heightOf({ building: 'retail', 'building:levels': '2' }), d = heightOf({}), e = heightOf({ 'building:levels': '10', 'building:min_level': '3' });
  if (a.src !== 2 || a.h !== 42) bad.push(['a height tag is the height', a]);
  if (b.src !== 1 || !near(b.h, 5 * 3.3 + 0.6, 1e-9)) bad.push(['5 levels are 3.3 m each plus the parapet', b]);
  if (!near(c.h - b.h, 4.5 - 3.3 - 3 * 3.3, 1e-9)) bad.push(['a shop has a 4.5 m ground floor', c.h]);
  if (d.src !== 0 || !Number.isNaN(d.h)) bad.push(['no tag is no height', d]);
  if (!near(e.base, 9.9, 1e-9)) bad.push(['min_level lifts the base', e.base]);
}
// ---- EPSG:5186: the false origin is 38 N 127 E, and a kilometre of grid is a kilometre of ground (scale factor 1 on the central meridian)
{
  const [lon, lat] = tmToLonLat(200000, 600000); if (!near(lon, 127, 1e-9) || !near(lat, 38, 1e-9)) bad.push(['TM origin', lon, lat]);
  const hav = (a, b) => { const r = Math.PI / 180, dl = (b[1] - a[1]) * r, dg = (b[0] - a[0]) * r, h = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dg / 2) ** 2; return 2 * 6371008.8 * Math.asin(Math.sqrt(h)); };
  const p0 = tmToLonLat(200000, 550000), pn = tmToLonLat(200000, 551000), pe = tmToLonLat(201000, 550000);
  m.tmNorth = +hav(p0, pn).toFixed(2); m.tmEast = +hav(p0, pe).toFixed(2);
  if (!near(m.tmNorth, 1000, 3) || !near(m.tmEast, 1000, 3)) bad.push(['TM grid kilometre', m.tmNorth, m.tmEast]);
}

const file = path.join(path.dirname(new URL(import.meta.url).pathname), '../../build/baked/world/capital/region.bin');
const R0 = readRegion(file), at = (lon, lat) => { const p = project(lon, lat); return { x: p.x - CAPITAL.x, z: p.z - CAPITAL.z }; };
// Gangnam station and the six detail tiles around it (37.45 - 37.55 N, 126.95 - 127.1 E)
const BOX = { w: 126.95, s: 37.45, e: 127.1, n: 37.55 }, detail = readDetail(BOX);
if (!R0) notes.push('no compiled region');
else if (detail.missing.length) notes.push('detail tiles not fetched: ' + detail.missing.join(','));
else {
  const crop = (cx, cz, half) => {
    const i0 = Math.max(0, Math.floor((cx - half - R0.x0) / R0.g)), i1 = Math.min(R0.nx - 1, Math.ceil((cx + half - R0.x0) / R0.g)), j0 = Math.max(0, Math.floor((cz - half - R0.z0) / R0.g)), j1 = Math.min(R0.nz - 1, Math.ceil((cz + half - R0.z0) / R0.g));
    const nx = i1 - i0 + 1, nz = j1 - j0 + 1, h = new Int16Array(nx * nz), water = new Uint8Array(nx * nz), level = new Int16Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i, s = (j + j0) * R0.nx + i + i0; h[k] = R0.h[s]; water[k] = R0.water[s]; level[k] = R0.level[s]; }
    const keep = R0.roads.map((r) => { for (let i = 0; i < r.x.length; i++) if (Math.abs(r.x[i] - cx) < half + 60 && Math.abs(r.z[i] - cz) < half + 60) return true; return false; }), remap = new Map(); keep.forEach((k, i) => { if (k) remap.set(i, remap.size); });
    const roads = R0.roads.filter((r, i) => keep[i]).map((r) => ({ ...r, next: (r.next || []).filter(([l]) => remap.has(l)).map(([l, i]) => [remap.get(l), i]), prev: (r.prev || []).filter(([l]) => remap.has(l)).map(([l, i]) => [remap.get(l), i]) }));
    return { ...R0, nx, nz, x0: R0.x0 + i0 * R0.g, z0: R0.z0 + j0 * R0.g, h, water, level, roads };
  };
  const gn = at(127.0276, 37.4979), half = 2500, C = crop(gn.x, gn.z, half), inCrop = (x, z) => Math.abs(x - gn.x) < half && Math.abs(z - gn.z) < half;
  const sub = { ...detail, buildings: detail.buildings.filter((b) => inCrop(b.rings[0][0][0], b.rings[0][0][1])), points: detail.points.filter((p) => inCrop(p.x, p.z)) };
  const run = () => { const res = makeBuildings(C, {}), mm = mergeReal(res, sub); for (const k of Object.keys(res.B)) res.B[k] = res.B[k].filter((v, i) => mm.keep[i]); return { res, mm }; };
  const A = run(), Bm = run();
  m.real = A.mm.stats.real; m.kept = A.mm.stats.kept; m.realShare = A.mm.stats.realShare; m.heightShare = A.mm.stats.heightShare;
  if (m.real < 5000) bad.push(['too few real buildings around Gangnam station', m.real]);
  // 1. no kept procedural building stands in a real one, and no real corner lies in a kept procedural one
  const cells = new Map(), put = (x, z, v) => { const k = Math.floor(x / 64) * 1e6 + Math.floor(z / 64); (cells.get(k) || cells.set(k, []).get(k)).push(v); };
  for (const b of A.mm.real) for (const p of b.rings[0]) put(p[0], p[1], b);
  let overlap = 0; const B = A.res.B;
  for (let i = 0; i < B.cx.length; i++) {
    const c = Math.cos(B.rot[i]), s = Math.sin(B.rot[i]), hw = B.w[i] / 2, hd = B.d[i] / 2, pts = [[0, 0], [hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]].map(([u, v]) => [B.cx[i] + u * c - v * s, B.cz[i] + u * s + v * c]);
    const seen = new Set(); for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) for (const r of cells.get((Math.floor(B.cx[i] / 64) + a) * 1e6 + Math.floor(B.cz[i] / 64) + b) || []) {
      if (seen.has(r)) continue; seen.add(r);
      if (pts.some((p) => inside(p, r.rings[0]))) { overlap++; continue; }
      if (r.rings[0].some((p) => { const dx = p[0] - B.cx[i], dz = p[1] - B.cz[i], u = dx * c + dz * s, v = -dx * s + dz * c; return Math.abs(u) < hw - 0.5 && Math.abs(v) < hd - 0.5; })) overlap++;
    }
  }
  m.overlap = overlap; if (overlap) bad.push(['kept procedural buildings overlap real ones', overlap]);
  // 2. the tiles: the same bytes twice, a unique uid per building, outlines back to 0.1 m
  const tilesOf = (X) => addRealTiles({}, X.mm.real), ta = tilesOf(A), tb = tilesOf(Bm);
  const bytes = (T) => Object.keys(T).sort().map((k) => k + Object.entries(T[k]).map(([f, v]) => (ArrayBuffer.isView(v) ? Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64') : v)).join('|')).join('\n');
  if (bytes(ta) !== bytes(tb)) bad.push(['two runs give different tiles']);
  const uids = new Set(), byId = new Map(A.mm.real.map((b) => [b.id, b])); let worst = 0, n = 0;
  for (const [k, t] of Object.entries(ta)) for (const b of readRealTile(k, t)) {
    n++; if (uids.has(b.uid)) bad.push(['uid twice', b.uid]); uids.add(b.uid);
    const o = byId.get(b.uid.slice(4)); if (!o) { bad.push(['uid names no building', b.uid]); continue; }
    for (let r = 0; r < o.rings.length; r++) for (let v = 0; v < o.rings[r].length; v++) worst = Math.max(worst, Math.hypot(o.rings[r][v][0] - b.rings[r][v][0], o.rings[r][v][1] - b.rings[r][v][1]));
  }
  m.stored = n; m.worstVertex = +worst.toFixed(3);
  if (n !== A.mm.real.length) bad.push(['tiles lose buildings', n, A.mm.real.length]);
  if (worst > 0.071) bad.push(['an outline vertex moved more than 0.05 m per axis', worst]);
  // 3. the streets of the crop decide from records: the map and, with the city's files, Seoul's crossings and signals
  const seoul = readSeoul();
  if (!seoul.length) notes.push('no Seoul files (build/.osm-cache/seoul): street shares not checked');
  else {
    const points = sub.points.concat(seoul.filter((p) => inCrop(p.x, p.z))), bt = { tiles: ta }, st = makeStreets(C, bt, { points }), sh = realShare(st);
    m.streets = sh; m.signals = st.junctions.filter((j) => j.signal).length;
    if (sh.signalDecisions < 0.95 || sh.crossingDecisions < 0.9) bad.push(['Gangnam street decisions not from records', sh]);
    // every crossing said to be real has a record on its arm
    for (const j of st.junctions) for (const a of j.arms) if (a.crossReal && !points.some((p) => p.t === 'crossing' && Math.hypot(p.x - j.x, p.z - j.z) < 45)) { bad.push(['a real crossing without a record']); break; }
    // 4. the street's records (WLD-24g-3): most of them stand (refused only for a reason other than being a second record of the same thing), none in a
    //    building, on a carriageway or in the water (checked here by brute force, not with the bake's judge), and the crossings away from junctions lie
    //    on their road and away from every junction
    // the rate counts the records that did not fit where they are (in a wall, on a carriageway, in the water, no room on the kerb); not a second record of
    // the same stop, an entrance that opens in a building's own wall, or a stop with no compiled road within 30 m (on a service road the network leaves out)
    const why = st.why.point, refused = ['building', 'road', 'water', 'room'].reduce((s, k) => s + (why[k] || 0), 0);
    m.points = sh.points; m.pointRefused = why; m.mid = st.mids.length; m.midWhy = st.why.mid;
    m.pointRate = +(why.placed / Math.max(1, why.placed + refused)).toFixed(3);
    if (sh.points.bus < 300 || sh.points.subway < 50) bad.push(['too few stops or entrances around Gangnam', sh.points]);
    if (m.pointRate < 0.85) bad.push(['too many street records refused', m.pointRate, why]);
    if (m.mid < 20) bad.push(['too few crossings away from junctions around Gangnam', m.mid]);
    const pts = st.items.filter((f) => f.t >= 2), segs = C.roads, onCarriage = (x, z, y, r) => {
      for (const o of segs) for (let i = 0; i + 1 < o.x.length; i++) {
        if (Math.abs(o.x[i] - x) > 90 || Math.abs(o.z[i] - z) > 90) continue;
        const dx = o.x[i + 1] - o.x[i], dz = o.z[i + 1] - o.z[i], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - o.x[i]) * dx + (z - o.z[i]) * dz) / l2));
        if (Math.abs(o.y[i] + (o.y[i + 1] - o.y[i]) * t - y) < 4 && Math.hypot(x - o.x[i] - dx * t, z - o.z[i] - dz * t) < o.half + r - 0.05) return true;
      }
      return false;
    };
    const realNear = new Map(); for (const b of A.mm.real) { const k = Math.floor(b.rings[0][0][0] / 64) * 1e6 + Math.floor(b.rings[0][0][1] / 64); (realNear.get(k) || realNear.set(k, []).get(k)).push(b); }
    const inReal = (x, z) => { for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) for (const r of realNear.get((Math.floor(x / 64) + a) * 1e6 + Math.floor(z / 64) + b) || []) if (inside([x, z], r.rings[0])) return true; return false; };
    const wet = (x, z) => { const i = Math.floor((x - C.x0) / C.g), j = Math.floor((z - C.z0) / C.g); return i >= 0 && j >= 0 && i < C.nx && j < C.nz && C.water[j * C.nx + i] > 0; };
    const pv = { building: 0, road: 0, water: 0 };
    for (const f of pts) { if (inReal(f.x, f.z)) pv.building++; if (onCarriage(f.x, f.z, f.y, f.t === 2 && (f.v & 1) ? 0.75 : 0.1)) pv.road++; if (wet(f.x, f.z)) pv.water++; }
    m.pointViolations = pv; for (const [k, n] of Object.entries(pv)) if (n) bad.push(['a street record ' + k + ' violation', n]);
    for (const c of st.mids) {
      if (st.junctions.some((j) => Math.hypot(j.x - c.x, j.z - c.z) < 45)) { bad.push(['a mid-block crossing at a junction']); break; }
      if (!onCarriage(c.x, c.z, c.y, 0.1)) { bad.push(['a mid-block crossing off its road']); break; }
    }
    // the tiles keep them: every record and every mid-block crossing reads back
    const T = toTiles(st); let nf = 0, nc = 0; for (const [k, t] of Object.entries(T)) { const d = readTile(k, t); nf += d.F.filter((f) => f.t >= 2).length; nc += d.C.length; }
    if (nf !== pts.length || nc !== st.mids.length) bad.push(['tiles lose street records', nf, pts.length, nc, st.mids.length]);
  }
}
console.log('RESULT ' + JSON.stringify({ test: 'real-data', pass: bad.length === 0, metrics: m, note: [...notes, ...(bad.length ? [JSON.stringify(bad.slice(0, 8))] : [])].join('; ') }));
process.exitCode = bad.length ? 1 : 0;
