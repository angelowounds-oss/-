// The detail tiles of build/world/fetch-detail.mjs made from one downloaded OpenStreetMap extract instead of one Overpass query per tile (DATA-01,
// ADR-0042). Overpass took about eight minutes a tile on 2026-11-01 (198 tiles: more than a day); the BBBike extract of Seoul (OSM XML, osmium, one
// element per line) covers 126.58-127.31 E, 37.35-37.72 N and arrives in seconds. Every tile that lies wholly inside the extract is written to the same
// cache file the Overpass query would have filled, in the same JSON shape (`out tags geom`), with the extract named in `source`, so realdetail.mjs reads
// both the same way and fetch-detail.mjs then fetches only the tiles at the edge.
//   curl -o build/.osm-cache/bbbike/Seoul.osm.gz https://download.bbbike.org/osm/bbbike/Seoul/Seoul.osm.gz
//   node build/world/bbbike-detail.mjs [build/.osm-cache/bbbike/Seoul.osm.gz]
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { tiles, STEP } from './fetch-detail.mjs';
import { cacheFile } from './osm.mjs';

// the same selection as tileQuery: which tagged nodes and which ways and relations are kept
const NODE_HW = new Set(['traffic_signals', 'crossing', 'bus_stop', 'street_lamp', 'stop', 'give_way']), NODE_AM = new Set(['bench', 'waste_basket', 'vending_machine', 'fire_hydrant']);
export const keepNode = (t) => NODE_HW.has(t.highway) || t.natural === 'tree' || t.railway === 'subway_entrance' || (t.public_transport === 'platform' && t.bus === 'yes') || NODE_AM.has(t.amenity) || t.emergency === 'fire_hydrant';
export const keepWay = (t) => 'building' in t || 'building:part' in t;
export const keepRel = (t) => 'building' in t && t.type === 'multipolygon';

const attr = (line, k) => { const i = line.indexOf(` ${k}="`); if (i < 0) return null; const j = line.indexOf('"', i + k.length + 3); return line.slice(i + k.length + 3, j); };
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// every element of the file in order: { type, id, lat, lon, tags, refs, members }, calling fn for each
async function scan(file, fn) {
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let cur = null;
  for await (const raw of rl) {
    const line = raw.trimStart();
    if (line.startsWith('<node ') || line.startsWith('<way ') || line.startsWith('<relation ')) {
      const type = line.slice(1, line.indexOf(' '));
      cur = { type, id: Number(attr(line, 'id')), tags: {}, refs: type === 'way' ? [] : null, members: type === 'relation' ? [] : null };
      if (type === 'node') { cur.lat = Number(attr(line, 'lat')); cur.lon = Number(attr(line, 'lon')); }
      if (line.endsWith('/>')) { fn(cur); cur = null; }
    } else if (!cur) continue;
    else if (line.startsWith('<tag ')) cur.tags[unesc(attr(line, 'k'))] = unesc(attr(line, 'v'));
    else if (line.startsWith('<nd ')) cur.refs.push(Number(attr(line, 'ref')));
    else if (line.startsWith('<member ')) cur.members.push({ type: attr(line, 'type'), ref: Number(attr(line, 'ref')), role: unesc(attr(line, 'role') || '') });
    else if (line.startsWith('</node') || line.startsWith('</way') || line.startsWith('</relation')) { fn(cur); cur = null; }
  }
}

// convert: returns { written: [tile names], skipped: [tile names at the edge], counts }
export async function convert(file) {
  const md5 = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
  // pass 1: the coordinates of every node (osmium writes them by ascending id: two growing arrays and a binary search), the kept elements, the member
  // ways the kept relations need
  let ids = new Float64Array(1 << 22), ll = new Float64Array(1 << 23), nn = 0, sorted = true;
  const nodes = [], ways = [], rels = [], need = new Set();
  await scan(file, (e) => {
    if (e.type === 'node') {
      if (nn === ids.length) { const a = new Float64Array(ids.length * 2); a.set(ids); ids = a; const b = new Float64Array(ll.length * 2); b.set(ll); ll = b; }
      if (nn && e.id <= ids[nn - 1]) sorted = false;
      ids[nn] = e.id; ll[nn * 2] = e.lat; ll[nn * 2 + 1] = e.lon; nn++;
      if (keepNode(e.tags)) nodes.push(e);
    } else if (e.type === 'way') { if (keepWay(e.tags)) ways.push(e); }
    else if (keepRel(e.tags)) { rels.push(e); for (const m of e.members) if (m.type === 'way') need.add(m.ref); }
  });
  if (!sorted) throw new Error('nodes not sorted by id: the binary search would be wrong');
  const at = (id) => { let lo = 0, hi = nn - 1; while (lo <= hi) { const m = (lo + hi) >> 1, v = ids[m]; if (v === id) return { lat: ll[m * 2], lon: ll[m * 2 + 1] }; if (v < id) lo = m + 1; else hi = m - 1; } return null; };
  // pass 2: the node lists of the relations' member ways (most carry no building tag of their own)
  const memberRefs = new Map(); for (const w of ways) if (need.has(w.id)) memberRefs.set(w.id, w.refs);
  if (need.size > memberRefs.size) await scan(file, (e) => { if (e.type === 'way' && need.has(e.id) && !memberRefs.has(e.id)) memberRefs.set(e.id, e.refs); });
  const geom = (refs) => { const g = []; for (const r of refs) { const p = at(r); if (!p) return null; g.push(p); } return g; };
  // the extract's bounds, and the tiles that lie wholly inside them
  const head = await new Promise((ok) => { const s = fs.createReadStream(file).pipe(zlib.createGunzip()); let b = ''; s.on('data', (d) => { b += d; if (b.length > 4096) { s.destroy(); ok(b); } }); s.on('end', () => ok(b)); });
  const bl = head.slice(head.indexOf('<bounds')), B = { s: +attr(bl, 'minlat'), w: +attr(bl, 'minlon'), n: +attr(bl, 'maxlat'), e: +attr(bl, 'maxlon') };
  const T = tiles().map(([name, ql]) => { const [s, w] = name.slice(7).split('_').map(Number); return { name, ql, s, w, inside: s >= B.s - 1e-9 && w >= B.w - 1e-9 && s + STEP <= B.n + 1e-9 && w + STEP <= B.e + 1e-9, els: [] }; });
  const tileOf = new Map(T.map((t) => [`${t.s.toFixed(3)}_${t.w.toFixed(3)}`, t]));
  const BOX0 = { s: Math.min(...T.map((t) => t.s)), w: Math.min(...T.map((t) => t.w)) };
  // an element goes to the tile of its first point (realdetail.mjs drops duplicates by id, so one tile each is enough)
  const put = (lat, lon, el) => { const s = BOX0.s + Math.floor((lat - BOX0.s) / STEP + 1e-9) * STEP, w = BOX0.w + Math.floor((lon - BOX0.w) / STEP + 1e-9) * STEP, t = tileOf.get(`${s.toFixed(3)}_${w.toFixed(3)}`); if (t && t.inside) t.els.push(el); };
  const counts = { nodes: 0, ways: 0, relations: 0, broken: 0 };
  for (const e of nodes) { put(e.lat, e.lon, { type: 'node', id: e.id, lat: e.lat, lon: e.lon, tags: e.tags }); counts.nodes++; }
  for (const w of ways) { const g = geom(w.refs); if (!g || g.length < 2) { counts.broken++; continue; } put(g[0].lat, g[0].lon, { type: 'way', id: w.id, tags: w.tags, geometry: g }); counts.ways++; }
  for (const r of rels) {
    const members = r.members.filter((m) => m.type === 'way').map((m) => { const refs = memberRefs.get(m.ref); const g = refs && geom(refs); return g ? { type: 'way', ref: m.ref, role: m.role, geometry: g } : null; }).filter(Boolean);
    if (!members.length) { counts.broken++; continue; }
    put(members[0].geometry[0].lat, members[0].geometry[0].lon, { type: 'relation', id: r.id, tags: r.tags, members }); counts.relations++;
  }
  const written = [], skipped = [];
  for (const t of T) {
    if (!t.inside) { skipped.push(t.name); continue; }
    fs.writeFileSync(cacheFile(t.name, t.ql), JSON.stringify({ source: `BBBike Seoul extract ${md5}`, elements: t.els })); written.push(t.name);
  }
  return { written, skipped, counts, bounds: B, md5 };
}

if (process.argv[1] && process.argv[1].endsWith('bbbike-detail.mjs')) {
  const t0 = Date.now(), r = await convert(process.argv[2] || 'build/.osm-cache/bbbike/Seoul.osm.gz');
  console.log(JSON.stringify({ written: r.written.length, edge: r.skipped.length, ...r.counts, bounds: r.bounds, md5: r.md5, seconds: Math.round((Date.now() - t0) / 1000) }));
}
