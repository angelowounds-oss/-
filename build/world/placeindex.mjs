// The place index's bake (EV-72): build/.osm-cache/poi.json (poi-extract.py) projected into the game's frame and packed by src/placeindex.js
// encodePlaces into world/places.bin. Places off the game's map (out at sea, across the border) and exact duplicates (a shop mapped as a point and
// as its building) within 15 m of one of the same kind and name are dropped.
import fs from 'node:fs';
import { project, CAPITAL } from '../../src/koreamap.js';
import { PLACE_KINDS, encodePlaces } from '../../src/placeindex.js';

export const POI_JSON = 'build/.osm-cache/poi.json';

// the places of poi.json in game metres, deduplicated; null when there is no poi.json
export function readPlaces(file = POI_JSON) {
  if (!fs.existsSync(file)) return null;
  const J = JSON.parse(fs.readFileSync(file, 'utf8')), map = J.kinds.map((k) => PLACE_KINDS.indexOf(k));
  if (map.some((k) => k < 0)) throw new Error('poi.json: kinds differ from src/placeindex.js PLACE_KINDS');
  const out = [], seen = new Map();
  for (const [k0, lat, lon, name] of J.places) {
    if (lat < 33 || lat > 38.7 || lon < 124.5 || lon > 131) continue;   // the game's map (the island of Jeju to the DMZ, Ulleung-do)
    const p = project(lon, lat), x = Math.round(p.x - CAPITAL.x), z = Math.round(p.z - CAPITAL.z), k = map[k0];
    const key = k + ':' + name + ':' + Math.round(x / 15) + ':' + Math.round(z / 15); if (seen.has(key)) continue; seen.set(key, 1);
    out.push({ k, x, z, name });
  }
  return out;
}

// write world/places.bin into a game folder; returns how many places, or 0 when there is no poi.json
export function writePlaces(gameDir, file = POI_JSON) {
  const P = readPlaces(file); if (!P) return 0;
  fs.mkdirSync(gameDir + '/world', { recursive: true }); fs.writeFileSync(gameDir + '/world/places.bin', encodePlaces(P));
  return P.length;
}
