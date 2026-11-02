// The road and place caches of the compiled capital region (compile.mjs --roads) made without one huge Overpass query (DATA-01, ADR-0042). On
// 2026-11-02 every Overpass mirror but maps.mail.ru refused the build container, and mail.ru did not finish the whole-region road query in 300 s.
// Inside the BBBike Seoul extract (126.58-127.31 E, 37.35-37.72 N, see bbbike-detail.mjs) the ways and place nodes are read from the file; the strips
// of the region outside it (Yeongjong and the airport, Siheung and Ansan to the south, Paju and Uijeongbu to the north, the eastern hills) are asked of
// Overpass in 0.1-degree tiles that reach 0.02 degrees into the extract, so a way cut at the extract's edge comes back whole. The merged elements are
// written, sorted by id as Overpass returns them, into the very cache files compile.mjs reads (osm.mjs REGION_QL), so the compiler is unchanged.
//   node build/world/bbbike-roads.mjs [build/.osm-cache/bbbike/Seoul.osm.gz] [--check] [--partial]   (--check compares a box inside the extract with
//   Overpass; --partial writes the caches from the edge tiles fetched so far, for a bake while the mirror is down)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { scan } from './bbbike-detail.mjs';
import { BOX } from './fetch-detail.mjs';
import { overpassFile, cacheFile, bbox, REGION_QL, ROAD_MAJOR, ROAD_MINOR, PLACE } from './osm.mjs';

const MAJOR = new Set(ROAD_MAJOR.split('|')), MINOR = new Set(ROAD_MINOR.split('|')), PLACES = new Set(PLACE.split('|'));
const EXTRACT = { w: 126.58, s: 37.35, e: 127.31, n: 37.72 }, OVER = 0.02, STEP = 0.1;
const r3 = (v) => +v.toFixed(3);

// the tiles of the region outside the extract (grown OVER into it), as boxes
export function edgeTiles(box = BOX, ex = EXTRACT) {
  const strips = [
    { w: box.w, e: ex.w + OVER, s: box.s, n: box.n }, { w: ex.e - OVER, e: box.e, s: box.s, n: box.n },
    { w: ex.w + OVER, e: ex.e - OVER, s: box.s, n: ex.s + OVER }, { w: ex.w + OVER, e: ex.e - OVER, s: ex.n - OVER, n: box.n },
  ], out = [];
  for (const b of strips) {
    if (b.e <= b.w || b.n <= b.s) continue;
    const ni = Math.ceil((b.e - b.w) / STEP - 1e-9), nj = Math.ceil((b.n - b.s) / STEP - 1e-9);
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) out.push({ w: r3(b.w + i * STEP), e: r3(Math.min(b.e, b.w + (i + 1) * STEP)), s: r3(b.s + j * STEP), n: r3(Math.min(b.n, b.s + (j + 1) * STEP)) });
  }
  return out;
}
// one query for all three selections of a tile
const edgeQL = (b) => { const q = bbox(b); return `[out:json][timeout:240];(way["highway"~"^(${ROAD_MAJOR}|${ROAD_MINOR})$"](${q});node["place"~"^(${PLACE})$"]["name"](${q}););out geom tags;`; };

// the highway ways and place nodes of the extract: { ways: [{ id, tags, geometry, cut }], places: [...] } (cut: a node lies outside the extract)
async function readExtract(file) {
  let ids = new Float64Array(1 << 22), ll = new Float64Array(1 << 23), nn = 0;
  const ways = [], places = [];
  await scan(file, (e) => {
    if (e.type === 'node') {
      if (nn === ids.length) { const a = new Float64Array(ids.length * 2); a.set(ids); ids = a; const b = new Float64Array(ll.length * 2); b.set(ll); ll = b; }
      if (nn && e.id <= ids[nn - 1]) throw new Error('nodes not sorted by id');
      ids[nn] = e.id; ll[nn * 2] = e.lat; ll[nn * 2 + 1] = e.lon; nn++;
      if (PLACES.has(e.tags.place) && e.tags.name) places.push({ type: 'node', id: e.id, lat: e.lat, lon: e.lon, tags: e.tags });
    } else if (e.type === 'way' && (MAJOR.has(e.tags.highway) || MINOR.has(e.tags.highway))) ways.push(e);
  });
  const at = (id) => { let lo = 0, hi = nn - 1; while (lo <= hi) { const m = (lo + hi) >> 1, v = ids[m]; if (v === id) return { lat: ll[m * 2], lon: ll[m * 2 + 1] }; if (v < id) lo = m + 1; else hi = m - 1; } return null; };
  const out = [];
  for (const w of ways) {
    // a way that leaves the extract keeps its longest run of known nodes (used only if no edge tile brings it whole)
    let best = [], cur = [];
    for (const r of w.refs) { const p = at(r); if (p) { cur.push(p); if (cur.length > best.length) best = cur; } else cur = []; }
    if (best.length >= 2) out.push({ type: 'way', id: w.id, tags: w.tags, geometry: best.map((p) => ({ lat: p.lat, lon: p.lon })), cut: best.length < w.refs.length });
  }
  return { ways: out, places };
}

// a way's points touch the box (or a segment crosses it), as Overpass selects ways by a bounding box
function touches(g, b) {
  for (let k = 0; k < g.length; k++) {
    const p = g[k]; if (p.lat >= b.s && p.lat <= b.n && p.lon >= b.w && p.lon <= b.e) return true;
    if (k && segBox(g[k - 1], p, b)) return true;
  }
  return false;
}
function segBox(a, c, b) {   // Liang-Barsky clip of the segment against the box
  let t0 = 0, t1 = 1; const dx = c.lon - a.lon, dy = c.lat - a.lat;
  for (const [p, q] of [[-dx, a.lon - b.w], [dx, b.e - a.lon], [-dy, a.lat - b.s], [dy, b.n - a.lat]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

// fills the three caches; returns the counts. partial: use only the edge tiles already fetched (the rest are named in `missing` and in the caches'
// source, and a later full run replaces the caches)
export async function fill(file, box = BOX, partial = false) {
  const t0 = Date.now(), md5 = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
  const ex = await readExtract(file), tiles = edgeTiles(box), edge = new Map(), edgePlaces = new Map();
  let k = 0; const missing = [];
  for (const b of tiles) {
    const name = `roadedge-${b.s}_${b.w}`, have = cacheFile(name, edgeQL(b));
    if (partial && !fs.existsSync(have)) { missing.push(name); continue; }
    // a tile the mirror keeps refusing is left out of this run (named in `missing`); the next run asks again
    let f; try { f = await overpassFile(name, edgeQL(b)); } catch { missing.push(name); console.log(`edge ${++k}/${tiles.length} ${name} failed`); continue; }
    for (const e of JSON.parse(fs.readFileSync(f, 'utf8')).elements) {
      if (e.type === 'way' && e.geometry) { const o = edge.get(e.id); if (!o || e.geometry.length > o.geometry.length) edge.set(e.id, { type: 'way', id: e.id, tags: e.tags, geometry: e.geometry.map((p) => ({ lat: p.lat, lon: p.lon })) }); }
      else if (e.type === 'node') edgePlaces.set(e.id, { type: 'node', id: e.id, lat: e.lat, lon: e.lon, tags: e.tags });
    }
    console.log(`edge ${++k}/${tiles.length} ${b.s}_${b.w} ways ${edge.size} ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  // the extract's ways, a cut one replaced by the edge's whole copy; then the edge ways the extract lacks
  const ways = new Map(); let cutKept = 0, cutHealed = 0;
  for (const w of ex.ways) {
    if (w.cut && edge.has(w.id)) { cutHealed++; continue; }
    if (w.cut) cutKept++;
    const { cut, ...e } = w; ways.set(w.id, e);
  }
  for (const [id, e] of edge) if (!ways.has(id)) ways.set(id, e);
  const inBox = [...ways.values()].filter((e) => touches(e.geometry, box)).sort((a, b) => a.id - b.id);
  const places = new Map(ex.places.map((p) => [p.id, p])); for (const [id, p] of edgePlaces) places.set(id, p);
  const pl = [...places.values()].filter((p) => p.lat >= box.s && p.lat <= box.n && p.lon >= box.w && p.lon <= box.e).sort((a, b) => a.id - b.id);
  const source = `BBBike Seoul extract ${md5} + Overpass edge tiles (${tiles.length - missing.length} of ${tiles.length})`, B4 = bbox(box), write = ([name, ql], elements) => fs.writeFileSync(cacheFile(name, ql), JSON.stringify({ source, missing, elements }));
  const major = inBox.filter((e) => MAJOR.has(e.tags.highway)), minor = inBox.filter((e) => MINOR.has(e.tags.highway));
  write(REGION_QL.roads('capital', B4), major); write(REGION_QL.minor('capital', B4), minor); write(REGION_QL.places('capital', B4), pl);
  return { major: major.length, minor: minor.length, places: pl.length, extractWays: ex.ways.length, edgeWays: edge.size, cutHealed, cutKept, edgeTiles: tiles.length, missing, md5, seconds: Math.round((Date.now() - t0) / 1000) };
}

// a box inside the extract read both ways: the way ids and their points should agree but for edits made after the extract's date
export async function check(file, b = { s: 37.49, w: 127.02, n: 37.52, e: 127.06 }) {
  const ex = await readExtract(file), mine = new Map(ex.ways.filter((w) => MAJOR.has(w.tags.highway) && touches(w.geometry, b)).map((w) => [w.id, w]));
  const f = await overpassFile(`roadcheck-${b.s}_${b.w}`, `[out:json][timeout:120];way["highway"~"^(${ROAD_MAJOR})$"](${bbox(b)});out geom tags;`);
  const theirs = new Map(JSON.parse(fs.readFileSync(f, 'utf8')).elements.filter((e) => e.type === 'way').map((e) => [e.id, e]));
  let same = 0, moved = 0; const onlyExtract = [...mine.keys()].filter((id) => !theirs.has(id)), onlyOverpass = [...theirs.keys()].filter((id) => !mine.has(id));
  for (const [id, w] of mine) { const o = theirs.get(id); if (!o) continue; const ok = o.geometry.length === w.geometry.length && o.geometry.every((p, i) => p.lat === w.geometry[i].lat && p.lon === w.geometry[i].lon); if (ok) same++; else moved++; }
  return { box: b, extract: mine.size, overpass: theirs.size, sameGeometry: same, changedGeometry: moved, onlyExtract: onlyExtract.length, onlyOverpass: onlyOverpass.length };
}

if (process.argv[1] && process.argv[1].endsWith('bbbike-roads.mjs')) {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'build/.osm-cache/bbbike/Seoul.osm.gz';
  console.log(JSON.stringify(process.argv.includes('--check') ? await check(file) : await fill(file, BOX, process.argv.includes('--partial'))));
}
