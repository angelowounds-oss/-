// OpenStreetMap data for the world compiler (ADR-0019) through Overpass, region by region, cached in build/.osm-cache/world (not committed: ODbL).
// The mirrors time out now and then: each query goes to them in turn, a few times, before giving up.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, execFile } from 'node:child_process';

// mail.ru first: on 2026-11-01 kumi timed out and overpass-api.de reset every connection from the build container
const MIRRORS = ['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const CACHE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.osm-cache', 'world');

// ---- the country's records from one pbf (build/world/pbf-store.py, WLD-25a): a tile store that answers the compiler's queries without the network
export const PBF_STORE = path.join(CACHE, '..', 'pbf');
const KIND = [['roads-minor-', ['minor']], ['roads-', ['roads']], ['water-', ['water']], ['places-', ['places']], ['detail-', ['detail']], ['roadedge-', ['roads', 'minor', 'places']], ['roadcheck-', ['roads']]];
let storeMeta;
// the elements the store holds for a query (its kind from the cache name, its box from the first (s,w,n,e) of the query text), or null without a store
export function localElements(name, ql) {
  if (storeMeta === undefined) storeMeta = fs.existsSync(path.join(PBF_STORE, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(PBF_STORE, 'meta.json'), 'utf8')) : null;
  if (!storeMeta) return null;
  const kinds = KIND.find(([p]) => name.startsWith(p))?.[1], m = ql.match(/\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/); if (!kinds || !m) return null;
  const [s, w, n, e] = m.slice(1).map(Number), S = storeMeta.step, seen = new Set(), out = [];
  for (const kind of kinds) for (let i = Math.floor(s / S); i <= Math.floor(n / S); i++) for (let j = Math.floor(w / S); j <= Math.floor(e / S); j++) {
    const f = path.join(PBF_STORE, kind, `${i}_${j}.jsonl`); if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line) continue; const el = JSON.parse(line), key = el.type + el.id; if (seen.has(key)) continue;
      const b = el.bounds || { minlat: el.lat, maxlat: el.lat, minlon: el.lon, maxlon: el.lon };
      if (b.maxlat < s || b.minlat > n || b.maxlon < w || b.minlon > e) continue;
      // a node at the box's north or east edge belongs to the next tile's query, as Overpass's closed box would give it twice; the bake dedupes by id
      seen.add(key); delete el.bounds; out.push(el);
    }
  }
  return out;
}

// the elements of an Overpass QL query (with `out geom`), cached by the query text; then the pbf store; then the network
export function overpass(name, ql) {
  const f = path.join(CACHE, `${name}-${crypto.createHash('sha1').update(ql).digest('hex').slice(0, 10)}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')).elements;
  const local = localElements(name, ql); if (local) return local;
  fs.mkdirSync(CACHE, { recursive: true });
  for (let k = 0; k < 6; k++) {
    try {
      execFileSync('curl', ['-sS', '-f', '-m', '300', '-o', f + '.part', '--data-urlencode', `data=${ql}`, MIRRORS[k % MIRRORS.length]], { stdio: ['ignore', 'ignore', 'pipe'] });
      const text = fs.readFileSync(f + '.part', 'utf8');
      if (text.startsWith('{')) { fs.renameSync(f + '.part', f); return JSON.parse(text).elements; }
    } catch { /* next mirror */ }
  }
  throw new Error('overpass failed: ' + name);
}
export const bbox = (b) => `${b.s},${b.w},${b.n},${b.e}`;
// the road and place queries of a compiled region as [cache name, query]: compile.mjs asks them, bbbike-roads.mjs fills the same cache files without them
export const ROAD_MAJOR = 'motorway|trunk|primary|secondary|motorway_link|trunk_link|primary_link|secondary_link|tertiary|tertiary_link', ROAD_MINOR = 'residential|unclassified|living_street', PLACE = 'city|town|village|suburb';
export const REGION_QL = {
  roads: (r, B4) => [`roads-${r}`, `[out:json][timeout:240];way["highway"~"^(${ROAD_MAJOR})$"](${B4});out geom tags;`],
  minor: (r, B4) => [`roads-minor-${r}`, `[out:json][timeout:300];way["highway"~"^(${ROAD_MINOR})$"](${B4});out geom tags;`],
  places: (r, B4) => [`places-${r}`, `[out:json][timeout:120];(node["place"~"^(${PLACE})$"]["name"](${B4}););out;`],
};

// the cache file of a query (the same name the synchronous call reads, so a prefetch fills it)
export const cacheFile = (name, ql) => path.join(CACHE, `${name}-${crypto.createHash('sha1').update(ql).digest('hex').slice(0, 10)}.json`);
// the same query without blocking, for fetching many tiles a few at a time; resolves to the cache file
export async function overpassFile(name, ql) {
  const f = cacheFile(name, ql); if (fs.existsSync(f)) return f;
  fs.mkdirSync(CACHE, { recursive: true });
  for (let k = 0; k < 8; k++) {
    const ok = await new Promise((res) => execFile('curl', ['-sS', '-f', '-m', '600', '-o', f + '.part', '--data-urlencode', `data=${ql}`, MIRRORS[k % MIRRORS.length]], (err) => res(!err)));
    if (ok && fs.readFileSync(f + '.part', 'utf8', { flag: 'r' }).startsWith('{')) { fs.renameSync(f + '.part', f); return f; }
    await new Promise((r) => setTimeout(r, 5000 * (k + 1)));   // a busy mirror answers 429 or a timeout: wait longer each time
  }
  throw new Error('overpass failed: ' + name);
}
