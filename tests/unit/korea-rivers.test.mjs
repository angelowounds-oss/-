// The real river courses (src/korerivers.js, build/korea_rivers_convert.mjs; KOREA-PLAN B1): each named place lies on its river within
// 2.5 km real, the course length is between 60% and 125% of the published length (references are approximate), the width grows downstream, and the mouth ends at the sea.
import { RIVERS } from '../../src/korerivers.js';
import { project, koreaMask, landAt, KOREA_SCALE } from '../../src/koreamap.js';

const bad = [];
const mask = koreaMask();
const TOL = 2500 / KOREA_SCALE;   // 2.5 km real in map m
const PLACES = [
  { river: '한강', name: '두물머리', lon: 127.31, lat: 37.52, km: 514 },
  { river: '한강', name: '여의도', lon: 126.93, lat: 37.52, km: 514 },
  { river: '낙동강', name: '하구', lon: 128.95, lat: 35.11, km: 525 },
  { river: '금강', name: '공주', lon: 127.12, lat: 36.46, km: 401 },
  { river: '섬진강', name: '구례', lon: 127.46, lat: 35.20, km: 212 },
  { river: '영산강', name: '나주', lon: 126.71, lat: 35.02, km: 115 },
  { river: '형산강', name: '포항', lon: 129.37, lat: 36.03, km: 50 },
];

// distance from (x, z) to the polyline
function dist(P, x, z) {
  let best = Infinity;
  for (let i = 1; i < P.length; i++) {
    const [ax, az] = P[i - 1], [bx, bz] = P[i], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

const metrics = {};
for (const p of PLACES) {
  const r = RIVERS.find((q) => q.name === p.river);
  if (!r) { bad.push(['missing river', p.river]); continue; }
  const c = project(p.lon, p.lat), d = dist(r.pts, c.x, c.z) * KOREA_SCALE;
  metrics[p.name] = Math.round(d);
  if (d > 2500) bad.push([p.name + ' is ' + Math.round(d) + ' m from the ' + p.river, '']);
  const len = r.length;
  // the OpenStreetMap extract ends where the download boxes or the data end (the Han's upper arms), so the course may be shorter than published
  if (len < 0.6 * p.km || len > 1.25 * p.km) bad.push([p.river + ' length', len + ' km vs ' + p.km]);
  // width grows downstream
  if (r.w[r.w.length - 1] <= r.w[0]) bad.push([p.river + ' width does not grow', '']);
  // the mouth is at the sea: the last point has sea within 6 km
  const m = r.pts[r.pts.length - 1];
  let sea = false;
  for (let i = -6; i <= 6 && !sea; i++) for (let j = -6; j <= 6 && !sea; j++) if (!landAt(mask, m[0] + i * 1000, m[1] + j * 1000)) sea = true;
  if (!sea) bad.push([p.river + ' mouth is not at the sea', '']);
}

console.log('RESULT ' + JSON.stringify({ test: 'korea-rivers', pass: bad.length === 0, metrics, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
