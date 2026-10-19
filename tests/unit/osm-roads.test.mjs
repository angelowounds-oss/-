// The converted OpenStreetMap roads (src/korearoads.js, build/korea_roads_convert.mjs): on land, one carriageway's motorway length is plausible,
// route 1 (Gyeongbu) reaches both Seoul and Busan, and the file stays small. Pure data, no browser.
import { project, koreaMask, landAt, KOREA_SCALE } from '../../src/koreamap.js';
import { ROADS as doc } from '../../src/korearoads.js';

const bytes = JSON.stringify(doc).length;
const mask = koreaMask();
const bad = [];

let samples = 0, onLand = 0, motorwayKm = 0;
for (const r of doc.roads) {
  for (let i = 0; i < r.pts.length; i++) {
    samples++;
    if (landAt(mask, r.pts[i][0], r.pts[i][1])) onLand++;
    if (i > 0 && r.hw === 'motorway' && !r.twin) motorwayKm += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]) * KOREA_SCALE / 1000;
  }
}
const landShare = onLand / samples;
if (landShare < 0.98) bad.push(['points on land below 98%', landShare.toFixed(4)]);
if (motorwayKm < 4500 || motorwayKm > 6000) bad.push(['motorway km outside 4500..6000', motorwayKm.toFixed(0)]);

// route 1 must pass within 15 km real of City Hall and Busan (the Gyeongbu terminus at Yangjae is about 12.6 km from City Hall)
const seoul = project(126.978, 37.5665), busan = project(129.075, 35.179);
const route1 = doc.roads.filter((r) => r.hw === 'motorway' && r.ref === '1').flatMap((r) => r.pts);
const near = (c) => Math.min(...route1.map(([x, z]) => Math.hypot(x - c.x, z - c.z))) * KOREA_SCALE;
const dSeoul = near(seoul), dBusan = near(busan);
if (dSeoul > 15000) bad.push(['route 1 does not reach Seoul', dSeoul.toFixed(0)]);
if (dBusan > 15000) bad.push(['route 1 does not reach Busan', dBusan.toFixed(0)]);

if (bytes > 4 * 1024 * 1024) bad.push(['file larger than 4 MB', bytes]);

console.log('RESULT ' + JSON.stringify({
  test: 'osm-roads', pass: bad.length === 0,
  metrics: { ways: doc.roads.length, landShare: +landShare.toFixed(4), motorwayKm: Math.round(motorwayKm), route1ToSeoulM: Math.round(dSeoul), route1ToBusanM: Math.round(dBusan), kB: Math.round(bytes / 1024) },
  note: bad.map((b) => b.join(' ')).join(' | '),
}));
process.exitCode = bad.length ? 1 : 0;
