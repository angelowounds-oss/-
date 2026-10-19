// Does the game map match the real South Korea? Real places (lon/lat from public survey points, city halls, peaks, capes) are projected
// with the same projection as the map; each must be land or sea as it is in reality, and the distances between the 17 city halls must
// match the great-circle distance on Earth to within 1.5% (the map is 1:KOREA_SCALE, so 1 km real = 1/KOREA_SCALE map metres).
import { project, KOREA_SCALE, CITIES, CAPITAL } from '../../src/koreamap.js';
import { farHeight, SEA } from '../../src/worldmap.js';

const bad = [];
const LAND = [   // real land points (lon, lat)
  ['서울시청', 126.978, 37.5665], ['부산시청', 129.0756, 35.1796], ['대구시청', 128.6014, 35.8714], ['광주시청', 126.8526, 35.1595],
  ['대전시청', 127.3845, 36.3504], ['강릉', 128.8961, 37.7519], ['제주시청', 126.5312, 33.4996], ['울릉도 성인봉', 130.8737, 37.5036],
  ['속초', 128.5918, 38.2070], ['목포', 126.3922, 34.8118], ['여수', 127.6622, 34.7604], ['인천', 126.7052, 37.4563],
  ['태백산', 128.9180, 37.0956], ['지리산 천왕봉', 127.7309, 35.3366], ['한라산 정상', 126.5329, 33.3617],
];
const SEA_PTS = [   // real sea points
  ['동해 중부', 130.0, 37.5], ['서해 중부', 125.5, 36.5], ['남해 중앙', 127.5, 33.8], ['대한해협', 129.6, 34.0], ['제주 남쪽', 126.5, 32.5],
];
const hav = (a, b) => {   // great-circle km
  const r = Math.PI / 180, dl = (b[0] - a[0]) * r, p1 = a[1] * r, p2 = b[1] * r;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2));
};
const local = (lon, lat) => { const p = project(lon, lat); return { x: p.x - CAPITAL.x, z: p.z - CAPITAL.z }; };   // local frame for farHeight
const rows = [];
// the height grid has one node per 390 m of map (about 2.5 km of real ground): a city hall on the shore shares its node with sea, so a land point
// passes when the highest height within one node spacing is above the sea
const around = (q) => { let m = -1e9; for (const [dx, dz] of [[0, 0], [390, 0], [-390, 0], [0, 390], [0, -390]]) m = Math.max(m, farHeight(q.x + dx, q.z + dz)); return m; };
for (const [name, lon, lat] of LAND) {
  const q = local(lon, lat), h = around(q), ok = h > SEA + 1;
  rows.push({ name, kind: 'land', h: Math.round(h), ok });
  if (!ok) bad.push(['real land is sea in the map', name, Math.round(h)]);
}
for (const [name, lon, lat] of SEA_PTS) {
  const q = local(lon, lat), h = farHeight(q.x, q.z), ok = h < SEA;
  rows.push({ name, kind: 'sea', h: Math.round(h), ok });
  if (!ok) bad.push(['real sea is land in the map', name, Math.round(h)]);
}
// city halls: pairwise distance on the map against the real great-circle distance
const cities = CITIES.map((c) => ({ name: c.name, lon: c.lon, lat: c.lat }));
let worst = 0;
for (let i = 0; i < cities.length; i++) for (let j = i + 1; j < cities.length; j++) {
  const a = cities[i], b = cities[j], real = hav([a.lon, a.lat], [b.lon, b.lat]);
  const pa = project(a.lon, a.lat), pb = project(b.lon, b.lat), mapKm = Math.hypot(pa.x - pb.x, pa.z - pb.z) * KOREA_SCALE / 1000;
  const err = Math.abs(mapKm - real) / real;
  worst = Math.max(worst, err);
  if (err > 0.015) bad.push(['distance off', a.name, b.name, Math.round(real), Math.round(mapKm)]);
}
console.log(JSON.stringify(rows));
console.log('worst city-pair distance error', (worst * 100).toFixed(2) + '%');
console.log('RESULT ' + JSON.stringify({ test: 'korea-match', pass: bad.length === 0, metrics: { worstDistErrPct: +(worst * 100).toFixed(2) }, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
