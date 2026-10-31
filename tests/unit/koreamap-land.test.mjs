// The Korea land mask (assets/korea/land.bin, from build/korea_mask.mjs): the area is the real one within 3%, the big cities and islands are land,
// the seas around the peninsula are sea, and the mask covers exactly the map (200 x 200 cells).
import fs from 'node:fs';
import { project, landAt, LAND_N, LAND_CELL, KOREA_SCALE } from '../../src/koreamap.js';

const bad = [];
const mask = new Uint8Array(fs.readFileSync(new URL('../../assets/korea/land.bin', import.meta.url)));
if (mask.length !== LAND_N * LAND_N) bad.push(['mask size', mask.length]);
let land = 0; for (const v of mask) land += v;
const realKm2 = (land * LAND_CELL * LAND_CELL * KOREA_SCALE * KOREA_SCALE) / 1e6;   // official South Korea area is about 100,400 km2 (including the islands)
if (Math.abs(realKm2 - 100400) / 100400 > 0.03) bad.push(['land area', Math.round(realKm2)]);

const at = (lon, lat) => { const p = project(lon, lat); return landAt(mask, p.x, p.z); };
const land_pts = { '서울': [126.978, 37.5665], '부산': [129.0756, 35.1796], '제주': [126.5312, 33.4996], '울릉도 성인봉': [130.8737, 37.5036], '태백산': [128.9, 37.1] };
const sea_pts = { '서해 중앙': [125.5, 36.0], '동해 중앙': [130.3, 36.6], '남해 중앙': [127.5, 33.9] };
for (const [n, [lon, lat]] of Object.entries(land_pts)) if (at(lon, lat) !== 1) bad.push(['should be land', n]);
for (const [n, [lon, lat]] of Object.entries(sea_pts)) if (at(lon, lat) !== 0) bad.push(['should be sea', n]);
if (landAt(mask, 1e9, 0) !== 0) bad.push(['outside the map must read as sea']);

console.log('RESULT ' + JSON.stringify({ test: 'koreamap-land', pass: bad.length === 0, metrics: { landCells: land, realKm2: Math.round(realKm2) }, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
