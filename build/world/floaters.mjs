// Street things that do not stand on the ground the game draws (2026-11-10: the user's picture of street trees hanging 30 to 60 m over the hand-made
// city). Every item of streets.bin (lamps, trees, bus stops, subway entrances, benches, bins, hydrants, vending machines) is compared with the ground
// of landfn.landProc at its place, the function the height tiles are sampled from, so the check sees what the player sees: the renderer puts an item
// at max(baked y, ground) (src/streetscape.js footY), and an item baked higher than the ground hangs in the air. The bake takes every height from the
// region's raster, which is the drawn ground only where the region's weight is 1: not in the capital's keep zone and its band, not in a city's hole
// (the airport), not in the band at the region's border. An item on a bridge deck is checked against the road surfaces instead.
// usage: node build/world/floaters.mjs [region=capital]      prints the counts by zone and type, writes floaters.json beside region.bin
import fs from 'node:fs';
import path from 'node:path';
import { readStreets } from './streets.mjs';
import { readRegion, KEEP, BAND } from './emit.mjs';
import { unproject } from './geo.mjs';
import { namer } from './names.mjs';
import { decodeTile } from '../../src/streetgeo.js';
import { CAPITAL } from '../../src/koreamap.js';
import { REGIONS } from '../../src/regions/index.js';

const TYPE = { 0: 'lamp', 1: 'tree', 2: 'bus', 3: 'subway', 4: 'bench', 5: 'bin', 6: 'hydrant', 7: 'vending' };
export const FLOAT = 2, HOLE_BAND = 220;   // metres over the drawn ground from which an item counts as hanging; the band round a city's hole (src/region.js)

// every item against the drawn ground. Returns { zones: { zone: { type: { n, floating, misplaced, max } } }, list: [{ t, zone, x, z, gap }] (the hanging
// ones), deck: { n, unsupported } }. `misplaced`: baked 2 m or more under the drawn ground (the renderer lifts it, so it stands, but on ground the bake
// never looked at). Needs globalThis.__REGION = R before the game's modules are loaded.
export async function floaters(R, S) {
  globalThis.__REGION = R;
  const { landProc } = await import('../../src/landfn.js'), { regionWeight } = await import('../../src/region.js');
  const holes = REGIONS.flatMap((r) => r.cities).filter((c) => c.def.viaRegion).map((c) => ({ id: c.def.id, x: c.def.x - CAPITAL.x, z: c.def.z - CAPITAL.z, r: c.def.r * 1.15 }));
  const zoneOf = (x, z) => {
    const d = Math.max(Math.abs(x), Math.abs(z)); if (d < KEEP) return 'keep'; if (d < KEEP + BAND) return 'band';
    for (const h of holes) { const q = Math.hypot(x - h.x, z - h.z); if (q < h.r + HOLE_BAND) return 'hole'; }
    return regionWeight(x, z) < 1 ? 'edge' : 'inside';
  };
  // road surfaces in 50 m cells, for the items that say they stand on a deck
  const CELL = 50, K = (a, b) => a * 100003 + b, grid = new Map(), SG = [];
  R.roads.forEach((r) => { for (let i = 0; i + 1 < r.x.length; i++) { const id = SG.push([r.x[i], r.z[i], r.x[i + 1], r.z[i + 1], r.y[i], r.y[i + 1], r.half || 4]) - 1, m = (r.half || 4) + 3; for (let a = Math.floor((Math.min(r.x[i], r.x[i + 1]) - m) / CELL); a <= Math.floor((Math.max(r.x[i], r.x[i + 1]) + m) / CELL); a++) for (let b = Math.floor((Math.min(r.z[i], r.z[i + 1]) - m) / CELL); b <= Math.floor((Math.max(r.z[i], r.z[i + 1]) + m) / CELL); b++) { const k = K(a, b); let g = grid.get(k); if (!g) grid.set(k, (g = [])); g.push(id); } } });
  // is there a road surface under (x, y, z): within its half width and the 2 m of a deck's footway (a shelter stands 1.15 m off the kerb), at the item's height
  const onDeck = (x, z, y) => { const g = grid.get(K(Math.floor(x / CELL), Math.floor(z / CELL))); if (!g) return false; for (const id of g) { const s = SG[id], ex = s[2] - s[0], ez = s[3] - s[1], l2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - s[0]) * ex + (z - s[1]) * ez) / l2)); if (Math.hypot(s[0] + ex * t - x, s[1] + ez * t - z) <= s[6] + 2 && Math.abs(s[4] + (s[5] - s[4]) * t - y) < 1.5) return true; } return false; };
  const zones = {}, list = [], deck = { n: 0, unsupported: 0 };
  for (const key of Object.keys(S.tiles)) for (const f of decodeTile(key, S.tiles[key]).F) {
    const type = TYPE[f.t] || 't' + f.t;
    if (f.bridge) { deck.n++; if (!onDeck(f.x, f.z, f.y)) { deck.unsupported++; list.push({ t: type, zone: 'deck', x: f.x, z: f.z, y: f.y, gap: f.y - landProc(f.x, f.z, 16) }); } continue; }
    const gap = f.y - landProc(f.x, f.z, 16), zone = zoneOf(f.x, f.z), o = (zones[zone] ||= {})[type] ||= { n: 0, floating: 0, misplaced: 0, max: 0 };
    o.n++; if (gap > FLOAT) { o.floating++; list.push({ t: type, zone, x: f.x, z: f.z, gap }); } else if (gap < -FLOAT) o.misplaced++; if (gap > o.max) o.max = +gap.toFixed(1);
  }
  return { zones, list, deck };
}

// ---- command line
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'baked', 'world', process.argv[2] || 'capital');
  const R = readRegion(path.join(dir, 'region.bin')), S = readStreets(path.join(dir, 'streets.bin'));
  if (!R || !S) { console.error('no region.bin or streets.bin in ' + dir); process.exit(1); }
  const t0 = Date.now(), { zones, list, deck } = await floaters(R, S), name = namer(R);
  const total = {};
  for (const [z, types] of Object.entries(zones)) { const o = total[z] = { items: 0, floating: 0, misplaced: 0, max: 0 }; for (const v of Object.values(types)) { o.items += v.n; o.floating += v.floating; o.misplaced += v.misplaced; o.max = Math.max(o.max, v.max); } }
  // where the hanging items of the region's own ground are (the keep zone and the bands are one known place each): clusters of 300 m
  const cl = new Map();
  for (const f of list) { if (f.zone !== 'inside' && f.zone !== 'deck') continue; const k = Math.floor(f.x / 300) + ',' + Math.floor(f.z / 300); const c = cl.get(k) || { n: 0, sx: 0, sz: 0, max: 0, types: {} }; c.n++; c.sx += f.x; c.sz += f.z; c.max = Math.max(c.max, f.gap); c.types[f.t] = (c.types[f.t] || 0) + 1; cl.set(k, c); }
  const clusters = [...cl.values()].map((c) => { const x = c.sx / c.n, z = c.sz / c.n, ll = unproject(x + CAPITAL.x, z + CAPITAL.z); return { lat: +ll.lat.toFixed(5), lon: +ll.lon.toFixed(5), x: Math.round(x), z: Math.round(z), near: name(x, z), items: c.n, maxM: +c.max.toFixed(1), types: c.types }; }).sort((a, b) => b.items - a.items || b.maxM - a.maxM);
  const out = { seconds: +((Date.now() - t0) / 1000).toFixed(1), floatFrom: FLOAT, total, zones, deck, clusters: clusters.slice(0, 200) };
  fs.writeFileSync(path.join(dir, 'floaters.json'), JSON.stringify(out, null, 1));
  console.table(total); console.log(JSON.stringify({ deck, zones }));
  for (const c of clusters.slice(0, 12)) console.log(`${c.lat},${c.lon}\t${c.near}\t${c.items} items, up to ${c.maxM} m\t${JSON.stringify(c.types)}`);
}
