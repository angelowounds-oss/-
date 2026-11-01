// The real street and building records of the capital region from OpenStreetMap (DATA-01, ADR-0042), tile by tile into build/.osm-cache/world:
// building outlines with their levels and heights, traffic signals, crossings (with whether they are signalled), bus stops, street trees and lamps,
// subway entrances. The bake reads only this cache (build/world/realdetail.mjs), so a rebake needs no network once the tiles are here.
// Usage: node build/world/fetch-detail.mjs [--jobs 2] [--box w,s,e,n]
import { overpassFile, cacheFile } from './osm.mjs';
import fs from 'node:fs';

export const BOX = { w: 126.45, s: 37.25, e: 127.35, n: 37.80 };   // the compiled region (same box as the roads)
export const STEP = 0.05;   // ~4.4 x 5.6 km: a dense Seoul tile stays under the mirror's default size limit (a raised maxsize was refused as busy)
// the query of one tile: ways and multipolygons that are buildings (with geometry), and the street nodes
export function tileQuery(s, w, n, e) {
  const b = `${s},${w},${n},${e}`;
  return `[out:json][timeout:300];(way["building"](${b});relation["building"]["type"="multipolygon"](${b});way["building:part"](${b});` +
    `node["highway"~"^(traffic_signals|crossing|bus_stop|street_lamp|stop|give_way)$"](${b});node["natural"="tree"](${b});node["railway"="subway_entrance"](${b});` +
    `node["public_transport"="platform"]["bus"="yes"](${b});node["amenity"~"^(bench|waste_basket|vending_machine|fire_hydrant)$"](${b});node["emergency"="fire_hydrant"](${b}););out tags geom;`;
}
// every tile of the box as [name, query]
export function tiles(box = BOX) {
  const out = [];
  for (let s = box.s; s < box.n - 1e-9; s += STEP) for (let w = box.w; w < box.e - 1e-9; w += STEP) {
    const r = (v) => +v.toFixed(3), n = Math.min(box.n, s + STEP), e = Math.min(box.e, w + STEP);
    out.push([`detail-${r(s)}_${r(w)}`, tileQuery(r(s), r(w), r(n), r(e))]);
  }
  // the centre of Seoul first: a slow mirror (about two minutes a tile on 2026-11-01) then gives the places that matter most within the first hour
  const d = ([name]) => { const [s, w] = name.slice(7).split('_').map(Number); return Math.hypot(s + STEP / 2 - 37.5665, (w + STEP / 2 - 126.978) * 0.79); };
  return out.sort((a, b) => d(a) - d(b));
}

if (process.argv[1] && process.argv[1].endsWith('fetch-detail.mjs')) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const jobs = +arg('--jobs', 2), bx = arg('--box'), box = bx ? Object.fromEntries(bx.split(',').map(Number).map((v, i) => [['w', 's', 'e', 'n'][i], v])) : BOX;
  const T = tiles(box); let next = 0, done = 0, bytes = 0, failed = [];
  const t0 = Date.now();
  const worker = async () => { while (next < T.length) { const [name, ql] = T[next++]; const had = fs.existsSync(cacheFile(name, ql)); try { const f = await overpassFile(name, ql); bytes += fs.statSync(f).size; } catch (e) { failed.push(name); } done++; if (!had) console.log(`${done}/${T.length} ${name} ${(bytes / 1e6).toFixed(0)} MB ${((Date.now() - t0) / 1000).toFixed(0)} s`); } };
  await Promise.all(Array.from({ length: jobs }, worker));
  console.log(JSON.stringify({ tiles: T.length, failed, mb: +(bytes / 1e6).toFixed(1), seconds: Math.round((Date.now() - t0) / 1000) }));
  process.exitCode = failed.length ? 1 : 0;
}
