// Seoul's own records of its traffic safety facilities (DATA-01, ADR-0042), from the city's open data portal (data.seoul.go.kr, 공공누리 제1유형: free use
// with the source named): every zebra crossing as a polygon (OA-15554 "서울시 교통안전시설물 횡단보도 정보", A004_A shapefile) and every signal mount
// (OA-15546 "서울시 신호등 관련 정보", 부착대 csv). OpenStreetMap has only a part of these in Seoul (4,680 signal nodes and 26,000 crossings in the whole
// capital box against the city's 44,020 mounts and 37,324 crossings), so inside Seoul these records decide where the signals and crossings are.
// Both are in Korea 2000 / Central Belt 2010 (EPSG:5186, GRS80 transverse Mercator, 38 N 127 E, false origin 200,000 / 600,000), turned here into the
// world metres of the roads. The files are fetched once into build/.osm-cache/seoul (not committed, ADR-0013):
//   curl -X POST 'https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false' -d 'infId=OA-15554&seqNo=&seq=10&infSeq=3' -o crossings.zip
//   curl -X POST 'https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false' -d 'infId=OA-15546&seqNo=&seq=7&infSeq=3' -o signals.csv
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { project, CAPITAL } from '../../src/koreamap.js';

const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../.osm-cache/seoul');
export const SEOUL_FILES = ['crossings.zip', 'signals.csv'].map((f) => path.join(DIR, f));

// EPSG:5186 grid metres to longitude and latitude (Snyder's inverse transverse Mercator, ellipsoidal; well under a centimetre over Seoul)
export function tmToLonLat(x, y) {
  const a = 6378137, f = 1 / 298.257222101, e2 = 2 * f - f * f, ep2 = e2 / (1 - e2), k0 = 1, lat0 = 38 * Math.PI / 180, lon0 = 127, FE = 200000, FN = 600000;
  const e4 = e2 * e2, e6 = e4 * e2;
  const M = (p) => a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * p) + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * p) - (35 * e6 / 3072) * Math.sin(6 * p));
  const mu = (M(lat0) + (y - FN) / k0) / (a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256)), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1), C1 = ep2 * c * c, T1 = t * t, N1 = a / Math.sqrt(1 - e2 * s * s), R1 = a * (1 - e2) / (1 - e2 * s * s) ** 1.5, D = (x - FE) / (N1 * k0);
  const lat = p1 - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / c * 180 / Math.PI;
  return [lon, lat * 180 / Math.PI];
}
const world = (x, y) => { const [lon, lat] = tmToLonLat(x, y), p = project(lon, lat); return [p.x - CAPITAL.x, p.z - CAPITAL.z]; };

// the entries of a zip archive (stored or deflated), names decoded as the Korean code page the portal uses when the UTF-8 flag is not set
function unzip(buf) {
  const out = new Map(); let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip archive');
  let p = buf.readUInt32LE(e + 16); const n = buf.readUInt16LE(e + 10), dec = new TextDecoder('euc-kr');
  for (let k = 0; k < n; k++) {
    const flag = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const raw = buf.subarray(p + 46, p + 46 + nl), name = flag & 0x800 ? raw.toString('utf8') : dec.decode(raw);
    const d0 = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), data = buf.subarray(d0, d0 + csize);
    out.set(name, method === 0 ? Buffer.from(data) : zlib.inflateRawSync(data));
    p += 46 + nl + xl + cl;
  }
  return out;
}
// the polygons of a shapefile (type 5) as rings of [x, y]
function shpPolygons(buf) {
  const out = []; let p = 100;
  while (p + 8 <= buf.length) {
    const len = buf.readInt32BE(p + 4) * 2, r = p + 8; p = r + len;
    if (buf.readInt32LE(r) !== 5) { out.push(null); continue; }
    const np = buf.readInt32LE(r + 36), nv = buf.readInt32LE(r + 40), parts = [], rings = [];
    for (let k = 0; k < np; k++) parts.push(buf.readInt32LE(r + 44 + k * 4));
    parts.push(nv); const v0 = r + 44 + np * 4;
    for (let k = 0; k < np; k++) { const ring = []; for (let i = parts[k]; i < parts[k + 1]; i++) ring.push([buf.readDoubleLE(v0 + i * 16), buf.readDoubleLE(v0 + i * 16 + 8)]); rings.push(ring); }
    out.push(rings);
  }
  return out;
}
// one line of a csv with quoted fields
function csvLine(s) { const out = []; let cur = '', q = false; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (q) { if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; }

// the records as street points in the format of realdetail.mjs readDetail (crossings with their outline and long axis, signal mounts), or [] without the files
export function readSeoul() {
  if (!SEOUL_FILES.every((f) => fs.existsSync(f))) return [];
  const pts = [];
  // crossings: the zip holds a zip of the A004_A shapefile
  const outer = unzip(fs.readFileSync(SEOUL_FILES[0])), inner = [...outer].find(([k]) => k.includes('A004'));
  if (inner) {
    const files = unzip(inner[1]), shp = [...files].find(([k]) => k.endsWith('.shp'));
    shpPolygons(shp[1]).forEach((rings, k) => {
      if (!rings || !rings[0] || rings[0].length < 3) return;
      const ring = rings[0].map(([x, y]) => world(x, y)); let cx = 0, cz = 0; for (const [x, z] of ring) { cx += x; cz += z; } cx /= ring.length; cz /= ring.length;
      // the long axis of the stripe block runs across the road: the direction of its longest edge
      let best = 0, ax = 1, az = 0; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; ax = (b[0] - a[0]) / l; az = (b[1] - a[1]) / l; } }
      pts.push({ id: 'sc' + k, t: 'crossing', x: cx, z: cz, signal: false, marked: true, len: best, ax, az, ring, src: 'seoul' });
    });
  }
  // signal mounts: X and Y columns in EPSG:5186
  const text = new TextDecoder('euc-kr').decode(fs.readFileSync(SEOUL_FILES[1])), lines = text.split(/\r?\n/), head = csvLine(lines[0]), ix = head.indexOf('X좌표'), iy = head.indexOf('Y좌표'), ik = head.indexOf('신호등종류');
  for (let k = 1; k < lines.length; k++) {
    if (!lines[k]) continue; const f = csvLine(lines[k]), x = parseFloat(f[ix]), y = parseFloat(f[iy]);
    if (!(x > 100000 && y > 400000)) continue;
    const [wx, wz] = world(x, y); pts.push({ id: 'ss' + k, t: 'signal', x: wx, z: wz, kind: f[ik] || '', src: 'seoul' });
  }
  return pts;
}

if (process.argv[1] && process.argv[1].endsWith('seouldata.mjs')) {
  const p = readSeoul(), c = {}; for (const q of p) c[q.t] = (c[q.t] || 0) + 1;
  console.log(JSON.stringify({ ...c, sample: p.slice(0, 2).map(({ ring, ...q }) => q) }));
}
