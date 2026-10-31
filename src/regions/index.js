// The 17 provinces (시·도) of the world, a file each (ADR-0036): what is a region's own (its detailed cities with their place, style, rules and
// detail) lives in src/regions/<id>.js, and the generators all regions share read it through here. Pure data, no three.js. Provinces without a
// file yet keep their cities in the old tables (worldmap CITY_DEFS, citylayout STYLES, cityrules RULES, ...) until they move (WLD-21e).
import { REGIONS as BOXES, CITIES as HALLS, CAPITAL, project } from '../koreamap.js';
import seoul from './seoul.js';
import incheon from './incheon.js';
import gyeonggi from './gyeonggi.js';

// [id, KOSTAT code] of the 17 provinces
export const IDS = [
  ['seoul', '11'], ['busan', '21'], ['daegu', '22'], ['incheon', '23'], ['gwangju', '24'], ['daejeon', '25'], ['ulsan', '26'], ['sejong', '29'], ['gyeonggi', '31'],
  ['gangwon', '32'], ['chungbuk', '33'], ['chungnam', '34'], ['jeonbuk', '35'], ['jeonnam', '36'], ['gyeongbuk', '37'], ['gyeongnam', '38'], ['jeju', '39'],
];
const FILES = new Map([seoul, incheon, gyeonggi].map((f) => [f.id, f]));

// every province: its name and lon/lat box (koreamap.REGIONS), its city hall (koreamap.CITIES), and the cities of its file when it has one
export const REGIONS = IDS.map(([id, code]) => {
  const b = BOXES.find((r) => r[0] === code), hall = HALLS.find((c) => c.region === code), f = FILES.get(id);
  return { id, code, name: b[1], box: { w: b[2], s: b[3], e: b[4], n: b[5] }, hall: { name: hall.name, lon: hall.lon, lat: hall.lat }, own: !!f, cities: f ? f.cities : [], data: f || null };
});

// the province a point of the world belongs to (local metres, ADR-0017): of the province boxes that hold it, the one whose city hall is
// nearest (the boxes overlap: Seoul lies inside Gyeonggi's, Sejong between the Chungcheongs); 'sea' when no box holds it. The bake puts a
// chunk into its province's file by this (WLD-21c)
let PLACED = null;
const placed = () => PLACED || (PLACED = REGIONS.map((r) => {
  const c = [project(r.box.w, r.box.n), project(r.box.e, r.box.n), project(r.box.w, r.box.s), project(r.box.e, r.box.s)], h = project(r.hall.lon, r.hall.lat);
  return { id: r.id, x0: Math.min(...c.map((p) => p.x)) - CAPITAL.x, x1: Math.max(...c.map((p) => p.x)) - CAPITAL.x, z0: Math.min(...c.map((p) => p.z)) - CAPITAL.z, z1: Math.max(...c.map((p) => p.z)) - CAPITAL.z, hx: h.x - CAPITAL.x, hz: h.z - CAPITAL.z };
}));
export function regionOf(x, z) {
  let best = 'sea', bd = Infinity;
  for (const r of placed()) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) { const d = (x - r.hx) ** 2 + (z - r.hz) ** 2; if (d < bd) { bd = d; best = r.id; } }
  return best;
}

// the bridges with a main span of the region files (ADR-0037), each with the id of its region
export const BRIDGES = REGIONS.flatMap((r) => (r.data?.bridges || []).map((b) => ({ ...b, region: r.id })));

// the detailed cities of the region files by city id, each with the id of its region
const CITY = new Map(REGIONS.flatMap((r) => r.cities.map((c) => [c.def.id, { ...c, region: r.id }])));
export const regionCity = (id) => CITY.get(id) || null;
// one part of a city's data (def, style, rules, pitched, treeRows, villageLang); undefined while its province has no file
export const cityPart = (id, part) => CITY.get(id)?.[part];
