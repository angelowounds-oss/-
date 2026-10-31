// The map is at real scale (ADR-0038): distances in game metres match the great-circle distances of the real places, the heights are real (V = 1), and
// the national road data (korearoads.js) is as long as the real roads. A change of KOREA_SCALE or V_SCALE without the data is caught here.
import { KOREA_SCALE, V_SCALE, CAPITAL, project } from '../../src/koreamap.js';
import { farHeight } from '../../src/worldmap.js';
import { ROADS } from '../../src/korearoads.js';

const bad = [], m = {};
const hav = (a, b) => {   // great-circle metres between [lon, lat] pairs
  const R = 6371000, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2));
};
const game = (a, b) => { const p = project(...a), q = project(...b); return Math.hypot(p.x - q.x, p.z - q.z) * KOREA_SCALE; };
const pairs = { 'seoul-busan': [[126.978, 37.5665], [129.0756, 35.1796], 325000], 'cityhall-incheon-airport': [[126.978, 37.5665], [126.4506, 37.4492], 48000] };
for (const [k, [a, b, want]] of Object.entries(pairs)) {
  const real = hav(a, b), g = game(a, b); m[k] = { realKm: +(real / 1000).toFixed(1), gameKm: +(g / 1000).toFixed(1) };
  if (Math.abs(real - want) / want > 0.02) bad.push(['reference distance is not what the test says', k, real]);
  if (Math.abs(g - real) / real > 0.01) bad.push(['game distance off the real one by more than 1%', k, g, real]);
}
// 1:1 and V = 1 are the shipped values (the national data and the compiled region are in this scale)
if (KOREA_SCALE !== 1 || V_SCALE !== 1) bad.push(['the scale switches are not 1', KOREA_SCALE, V_SCALE]);
if (ROADS.scale !== KOREA_SCALE) bad.push(['korearoads is stamped with another scale', ROADS.scale]);
// Gyeongbu Expressway (route 1): about 416 km of real road in the data (one carriageway of each pair: twin lines are the other direction)
let len = 0; for (const r of ROADS.roads) if (r.ref === '1' && r.hw === 'motorway' && !r.twin) for (let i = 1; i < r.pts.length; i++) len += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
m.gyeongbuKm = +(len * KOREA_SCALE / 1000).toFixed(1); if (Math.abs(len * KOREA_SCALE / 1000 - 416) / 416 > 0.05) bad.push(['Gyeongbu Expressway length off 416 km by more than 5%', m.gyeongbuKm]);
// real heights at V = 1: Hallasan (1947 m) is the top of the national terrain near Jeju (the coarse grid is 2.5 km, so the summit is smoothed: a wide tolerance until WLD-23d refines the national terrain)
const jeju = project(126.533, 33.3617); let top = -Infinity;
for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) top = Math.max(top, farHeight(jeju.x - CAPITAL.x + dx * 700, jeju.z - CAPITAL.z + dz * 700));
m.hallasanM = Math.round(top); if (Math.abs(top - 1947) > 300) bad.push(['Hallasan is not about 1947 m (V = 1)', top]);
console.log('RESULT ' + JSON.stringify({ test: 'scale', pass: bad.length === 0, metrics: m, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
