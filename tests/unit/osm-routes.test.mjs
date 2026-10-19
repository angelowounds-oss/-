// The planner's motorway route between cities (src/osmroads.js, KOREA-PLAN D2): Seoul to Busan follows the real Gyeongbu line
// past Daejeon and Daegu, and its length is plausible for the 1:6.5 map. Pure data, no browser.
import { osmRoute } from '../../src/osmroads.js';
import { project, KOREA_SCALE } from '../../src/koreamap.js';

const bad = [];
const at = (lon, lat) => project(lon, lat);
const S = at(126.978, 37.5665), B = at(129.075, 35.179), D = at(127.385, 36.35), G = at(128.601, 35.871);
const route = osmRoute(S.x, S.z, B.x, B.z);
if (!route) bad.push(['no motorway route from Seoul to Busan']);
let km = 0;
const near = (c) => { let m = Infinity; for (const [x, z] of route || []) m = Math.min(m, Math.hypot(x - c.x, z - c.z)); return m * KOREA_SCALE; };
if (route) {
  for (let i = 1; i < route.length; i++) km += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]) * KOREA_SCALE / 1000;
  // the Gyeongbu expressway is about 430 km; the two city connectors add about 20 km
  if (km < 330 || km > 520) bad.push(['route length outside 330..520 km real', km.toFixed(0)]);
  if (near(D) > 25000) bad.push(['route misses Daejeon by more than 25 km', near(D).toFixed(0)]);
  if (near(G) > 25000) bad.push(['route misses Daegu by more than 25 km', near(G).toFixed(0)]);
}

console.log('RESULT ' + JSON.stringify({
  test: 'osm-routes', pass: bad.length === 0,
  metrics: { seoulBusanKm: Math.round(km), daejeonM: route ? Math.round(near(D)) : null, daeguM: route ? Math.round(near(G)) : null, points: route ? route.length : 0 },
  note: bad.map((b) => b.join(' ')).join(' | '),
}));
process.exitCode = bad.length ? 1 : 0;
