// South Korea as game data (src/koreamap.js): the whole country, islands included, fits the 100 km map, every detailed city sits in its region,
// the projection keeps distances to the scale, and the 17 regions each have exactly one detailed city.
import { REGIONS, CITIES, ISLANDS, KOREA_SCALE, CAPITAL, project } from '../../src/koreamap.js';
import { WORLD_HALF } from '../../src/worldmap.js';

const bad = [];
const hav = (a, b) => {   // great-circle distance in km between two [lon, lat]
  const R = 6371, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const M = 2000;   // keep 2 km from the map edge
let minX = 1e12, maxX = -1e12, minZ = 1e12, maxZ = -1e12;
for (const [code, name, w, s, e, n] of REGIONS) {
  const a = project(w, n), b = project(e, s);   // north-west and south-east corners
  minX = Math.min(minX, a.x, b.x); maxX = Math.max(maxX, a.x, b.x); minZ = Math.min(minZ, a.z, b.z); maxZ = Math.max(maxZ, a.z, b.z);
}
for (const i of ISLANDS) { const p = project(i.lon, i.lat); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
if (minX < -WORLD_HALF + M || maxX > WORLD_HALF - M || minZ < -WORLD_HALF + M || maxZ > WORLD_HALF - M) bad.push(['country outside the map', minX, maxX, minZ, maxZ]);

if (REGIONS.length !== 17) bad.push(['regions', REGIONS.length]);
if (new Set(CITIES.map((c) => c.name)).size !== CITIES.length) bad.push(['city names not unique']);
const byRegion = new Map(); for (const c of CITIES) byRegion.set(c.region, (byRegion.get(c.region) || 0) + 1);
for (const [code, name, w, s, e, n] of REGIONS) {
  if (byRegion.get(code) !== 1) bad.push(['region needs exactly one detailed city', name, byRegion.get(code)]);
  const c = CITIES.find((q) => q.region === code); if (!c) continue;
  if (c.lon < w - 0.02 || c.lon > e + 0.02 || c.lat < s - 0.02 || c.lat > n + 0.02) bad.push(['city outside its region', c.name]);
}

// distance check: projected straight-line distance equals the real one divided by the scale (within 1%)
const pairs = [['서울', '부산'], ['제주', '울릉도'], ['인천', '강릉']].map(([a, b]) => [a, b]);
const find = (n) => CITIES.find((c) => c.name === n) || ISLANDS.find((c) => c.name === n) || (n === '강릉' ? { lon: 128.8961, lat: 37.7519 } : null);
for (const [a, b] of pairs) {
  const A = find(a), B = find(b); if (!A || !B) { bad.push(['missing', a, b]); continue; }
  const real = hav([A.lon, A.lat], [B.lon, B.lat]) * 1000 / KOREA_SCALE, pa = project(A.lon, A.lat), pb = project(B.lon, B.lat);
  const d = Math.hypot(pa.x - pb.x, pa.z - pb.z);
  if (Math.abs(d - real) / real > 0.01) bad.push(['distance off', a, b, Math.round(d), Math.round(real)]);
}

const seoul = project(126.978, 37.5665);
if (Math.abs(seoul.x - CAPITAL.x) > 1 || Math.abs(seoul.z - CAPITAL.z) > 1) bad.push(['CAPITAL is not Seoul', Math.round(seoul.x), Math.round(seoul.z)]);
console.log('RESULT ' + JSON.stringify({ test: 'koreamap', pass: bad.length === 0, metrics: { regions: REGIONS.length, cities: CITIES.length, islands: ISLANDS.length, scale: KOREA_SCALE, widthKm: +((maxX - minX) / 1000).toFixed(1), heightKm: +((maxZ - minZ) / 1000).toFixed(1), seoulXZ: [Math.round(seoul.x), Math.round(seoul.z)] }, note: bad.slice(0, 5).map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
