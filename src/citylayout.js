// Layout of the five other cities as data (no three.js): street plan, building footprints and heights, facilities (parks, stadium, hospital,
// schools), the port's container yards and cranes, the airport's runways. Every city has its own style (street pattern, block size, palette,
// accent colours, sign language), so they do not look like copies of one another. Coordinates are relative to the city centre (so they stay
// precise in Float32 far from the origin). Pure and seeded: the bake stores the result, the browser only draws it.
import { cities, farHeight, SEA } from './worldmap.js';
import { LM_DIMS } from './landmarkdims.js';
import { cityPart } from './regions/index.js';

export const STYLES = {
  harbor:   { pattern: 'grid',   pitch: [118, 88],  jitter: 0.12, roadW: 16, hMax: 150,  hBase: 14, palette: [0x56606b, 0x6b7480, 0x4a5560, 0x7b6a5a, 0x8a8f96, 0x3f4a55, 0x5f6b72, 0x716456], accents: [1, 4, 2],   lang: 'en', words: ['PORT AUTHORITY', 'HARBOR BANK', 'SEA FREIGHT', 'DOCK 7', 'GATE MART', 'CARGO INN', 'TIDE CAFE', 'FERRY'],        density: 0.9 },
  airfield: cityPart('airfield', 'style'),   // src/regions/incheon.js
  mid1:     { pattern: 'organic',pitch: [96, 82],   jitter: 0.42, roadW: 12, hMax: 110,  hBase: 12,  palette: [0x6b5a48, 0x7c6650, 0x5a4a3a, 0x8a7560, 0x4f5a45, 0x6e5f52, 0x796b58, 0x5d4f41], accents: [4, 2, 0],   lang: 'sv', words: ['REDWOOD', 'SAGVERK', 'BAGERI', 'KAFFE', 'JAKT & FISKE', 'BYGGMAX', 'APOTEK', 'HERRGARD'],           density: 0.82 },
  mid2:     { pattern: 'grid',   pitch: [150, 110], jitter: 0.1,  roadW: 22, hMax: 100,  hBase: 11,  palette: [0xb59b72, 0xc7ac80, 0xa88c64, 0xd1bc92, 0x9b8460, 0xbea57a, 0xc4a77d, 0xa89068], accents: [2, 0, 5],   lang: 'es', words: ['AMBER FLATS', 'CANTINA', 'MERCADO', 'FARMACIA', 'TALLER', 'HOTEL SOL', 'TACOS', 'BANCO'],              density: 0.72 },
  mid3:     { pattern: 'organic',pitch: [78, 70],   jitter: 0.3,  roadW: 11, hMax: 100,  hBase: 12,  palette: [0xd8d2c6, 0xc9c0b0, 0xb9c4cc, 0xe0dccf, 0xa8b4bd, 0xd2c9bb, 0xbfb9ad, 0xc4cdd3], accents: [1, 3, 4],   lang: 'sv', words: ['SILVERFJORD', 'FISKTORG', 'KONDITORI', 'BIBLIOTEK', 'HAMN', 'BRYGGERI', 'FJORD INN', 'SAUNA'],      density: 0.85 },
  mid4:     { pattern: 'grid',   pitch: [90, 100],  jitter: 0.2,  roadW: 15, hMax: 70,  hBase: 10,  palette: [0x35383f, 0x2b2e35, 0x40434b, 0x4a3c3c, 0x383c44, 0x2f3238, 0x45464d, 0x3a3230], accents: [0, 5, 3],   lang: 'ja', words: ['シンダーベイ', 'ラーメン', '居酒屋', 'カラオケ', 'ゲーム', '薬局', 'ホテル', '喫茶'],                       density: 0.88 },
};

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const KIND = { normal: 0, park: 1, stadium: 2, hospital: 3, school: 4, warehouse: 5, terminal: 6, hangar: 7, tower: 8, station: 9, landmark: 10 };
export { KIND };

// a string of cumulative line positions from -R to R with jittered spacing
function lines(R, pitch, jitter, rnd) {
  const out = []; let p = -R + pitch * rnd();
  while (p < R) { out.push(p); p += pitch * (1 + (rnd() * 2 - 1) * jitter); }
  return out;
}
const segDist = (px, pz, s) => {
  const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - s[0]) * dx + (pz - s[1]) * dz) / l2));
  return Math.hypot(px - (s[0] + dx * t), pz - (s[1] + dz * t));
};

export function layoutCity(c, index) {
  const S = STYLES[c.id]; if (!S) return null;
  const rnd = mulberry(7001 + index * 977), R = c.r, roads = [], areas = [], props = [], bld = [];
  const xs = lines(R, S.pitch[0], S.jitter, rnd), zs = lines(R, S.pitch[1], S.jitter, rnd);
  // ---- streets: axis-aligned lines clipped to the city disc; every 4th is an avenue
  const clip = (x0, z0, x1, z1) => { // clip a horizontal/vertical segment to radius R * 0.97
    const r = R * 0.97; if (x0 === x1) { const h = Math.sqrt(Math.max(0, r * r - x0 * x0)); return h > 20 ? [x0, -h, x1, h] : null; }
    const h = Math.sqrt(Math.max(0, r * r - z0 * z0)); return h > 20 ? [-h, z0, h, z1] : null;
  };
  xs.forEach((x, i) => { const s = clip(x, -R, x, R); if (s) roads.push([...s, i % 4 === 0 ? S.roadW * 1.5 : S.roadW]); });
  zs.forEach((z, i) => { const s = clip(-R, z, R, z); if (s) roads.push([...s, i % 4 === 0 ? S.roadW * 1.5 : S.roadW]); });
  const extra = [];   // non-axis streets: lots must keep clear of them
  if (S.pattern === 'radial') for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.2; const s = [Math.cos(a) * 60, Math.sin(a) * 60, Math.cos(a) * R * 0.97, Math.sin(a) * R * 0.97, S.roadW * 1.4]; roads.push(s); extra.push(s); }
  if (S.pattern === 'radial' || S.pattern === 'organic') {   // a ring street at 0.55 R, approximated by 24 chords
    const rr = R * 0.55; for (let k = 0; k < 24; k++) { const a0 = k / 24 * Math.PI * 2, a1 = (k + 1) / 24 * Math.PI * 2; const s = [Math.cos(a0) * rr, Math.sin(a0) * rr, Math.cos(a1) * rr, Math.sin(a1) * rr, S.roadW * 1.2]; roads.push(s); extra.push(s); }
  }
  const sea = (x, z) => farHeight(c.x + x, c.z + z, 64) < SEA + 2;
  // ---- the airport: two runways + taxiway + apron take the middle of the plan
  const keepOut = [];   // rects [x0,z0,x1,z1] where no ordinary lots go
  if (c.type === 'airport') {
    const rw = [[-R * 0.95, R * 0.28, R * 0.95, R * 0.28 + 60], [-R * 0.9, R * 0.28 + 190, R * 0.9, R * 0.28 + 250]];
    for (const r of rw) { areas.push([10, r[0], r[1], r[2], r[3], 0]); keepOut.push([r[0] - 30, r[1] - 30, r[2] + 30, r[3] + 30]); }
    areas.push([11, -R * 0.9, R * 0.28 + 70, R * 0.9, R * 0.28 + 105, 0]);   // taxiway
    keepOut.push([-R * 0.9, R * 0.28 + 60, R * 0.9, R * 0.28 + 115]);
    areas.push([12, -330, R * 0.28 - 330, 330, R * 0.28 - 80, 0]);          // apron
    keepOut.push([-340, R * 0.28 - 340, 340, R * 0.28 - 70]);
    bld.push([0, R * 0.28 - 400, 420, 70, 14, 12, 3.3, 1, 1, 0 + KIND.terminal * 16]);           // terminal
    bld.push([-380, R * 0.28 - 260, 36, 36, 6, 40, 1.2, 0, 5, 3 + KIND.tower * 16]);             // control tower
    for (let k = 0; k < 4; k++) bld.push([-520 + k * 130, R * 0.28 - 130, 90, 70, 3, 14, 4.4 + k, 0, 1, 2 + KIND.hangar * 16]);   // hangars
    keepOut.push([-600, R * 0.28 - 440, 600, R * 0.28 - 90]);
  }
  // ---- the port: the sea-ward sector of the disc is quay, container yards, warehouses, cranes
  let seaDir = null;
  if (c.type === 'port') {
    seaDir = { x: c.seaDir.x, z: c.seaDir.z, d: c.r * 0.74 };
    const q = (px, pz) => px * seaDir.x + pz * seaDir.z;
    // yards on the sea side of the plane q > R*0.35: 5 x 3 yards of 20-foot container stacks, warehouses behind
    const ux = -seaDir.z, uz = seaDir.x, rows = 3, cols = 5;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const lx = (k - (cols - 1) / 2) * 190, ly = R * 0.52 + r * 150, px = seaDir.x * ly + ux * lx, pz = seaDir.z * ly + uz * lx;
      if (Math.hypot(px, pz) > R * 0.98) continue;
      const axis = Math.abs(seaDir.x) > Math.abs(seaDir.z);   // keep everything axis-aligned: snap the yard to the dominant axis
      const w = axis ? 90 : 160, d = axis ? 160 : 90;
      areas.push([13, px - w / 2, pz - d / 2, px + w / 2, pz + d / 2, (r * 7 + k) % 5]); keepOut.push([px - w / 2 - 6, pz - d / 2 - 6, px + w / 2 + 6, pz + d / 2 + 6]);
    }
    keepOut.push([-R, -R, R, R].map((v) => v)); keepOut.pop();
    // quay cranes along the sea side
    for (let k = 0; k < 6; k++) { const lx = (k - 2.5) * 210, ly = R * 0.72, px = seaDir.x * ly + ux * lx, pz = seaDir.z * ly + uz * lx; if (Math.hypot(px, pz) < R * 1.05) props.push([1, px, pz, 0, 0, 0, 0]); }
  }
  const inKeep = (x, z, rx, rz) => keepOut.some((k) => x + rx > k[0] && x - rx < k[2] && z + rz > k[1] && z - rz < k[3]);
  // ---- blocks and lots
  const block = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const ax = xs[i] + S.roadW / 2 + 5, bx = xs[i + 1] - S.roadW / 2 - 5, az = zs[j] + S.roadW / 2 + 5, bz = zs[j + 1] - S.roadW / 2 - 5;
    if (bx - ax < 24 || bz - az < 24) continue;
    const cx = (ax + bx) / 2, cz = (az + bz) / 2, t = Math.hypot(cx, cz) / R;
    if (t > 0.96 || sea(cx, cz)) continue;
    block.push({ ax, bx, az, bz, cx, cz, t });
  }
  // facilities: pick distinct blocks (never the very centre for parks' sake of density, but the stadium near the edge)
  const order = block.map((b, k) => k).sort((p, q) => rnd() - 0.5), role = new Map();
  const take = (n, kind, filter) => { let c2 = 0; for (const k of order) { if (c2 >= n) break; if (role.has(k)) continue; const b = block[k]; if (filter && !filter(b)) continue; if (inKeep(b.cx, b.cz, (b.bx - b.ax) / 2, (b.bz - b.az) / 2)) continue; role.set(k, kind); c2++; } };
  take(c.type === 'town' ? 3 : 5, KIND.park); take(1, KIND.stadium, (b) => b.t > 0.35 && b.t < 0.8 && b.bx - b.ax > 60 && b.bz - b.az > 60);
  take(1, KIND.hospital, (b) => b.t < 0.6); take(c.type === 'town' ? 2 : 3, KIND.school, (b) => b.t > 0.2);
  take(1, KIND.station, (b) => b.t < 0.5);
  take(S.hMax >= 56 ? 3 : S.hMax >= 38 ? 2 : 1, KIND.landmark, (b) => b.t < 0.55 && b.bx - b.ax >= 62 && b.bz - b.az >= 56);   // a tower from assets/landmarks stands in each of these blocks
  const lm = [], lmRnd = mulberry(index * 977 + 0x1a2d), lmUsed = new Set();
  block.forEach((b, k) => {
    const kind = role.get(k) ?? 0, w = b.bx - b.ax, d = b.bz - b.az;
    if (kind === KIND.landmark) {   // the model whose fitted height is nearest to 2.6 x the tallest ordinary building, turned so the long sides agree; [x, z, model, quarter turns, scale, w, d]
      let best = -1, bs = 1, bq = 0, bd = 1e9; const want = S.hMax * 2.6;
      LM_DIMS.forEach(([mh, mw, md], q) => { const turn = (mw > md) !== (w > d) ? 1 : 0, fw = turn ? md : mw, fd = turn ? mw : md, sc = Math.min(1, (w * 0.9) / fw, (d * 0.9) / fd); if (sc < 0.55 || lmUsed.has(q)) return; const e = Math.abs(sc * mh - want) + lmRnd() * 12; if (e < bd) { bd = e; best = q; bs = sc; bq = turn; } });
      if (best >= 0) { lmUsed.add(best); const [, mw, md] = LM_DIMS[best]; lm.push([b.cx, b.cz, best, bq, bs, (bq ? md : mw) * bs, (bq ? mw : md) * bs]); }
      return;
    }
    if (kind === KIND.park) { areas.push([1, b.ax, b.az, b.bx, b.bz, Math.floor(rnd() * 4)]); return; }
    if (kind === KIND.stadium) { areas.push([2, b.ax, b.az, b.bx, b.bz, 0]); const bw = 16; bld.push([b.cx, b.az + bw / 2, w, bw, 4, 22, 2, 2, c.type === 'port' ? 1 : 3, 7 + KIND.stadium * 16], [b.cx, b.bz - bw / 2, w, bw, 4, 22, 3, 2, 3, 7 + KIND.stadium * 16], [b.ax + bw / 2, b.cz, bw, d - bw * 2, 4, 22, 4, 2, 3, 7 + KIND.stadium * 16], [b.bx - bw / 2, b.cz, bw, d - bw * 2, 4, 22, 5, 2, 3, 7 + KIND.stadium * 16]); return; }
    // lots: split the long side into pieces of 22..46 m; a deep block gets two rows
    const alongX = w >= d, long = alongX ? w : d, short = alongX ? d : w, rowsN = short > 78 ? 2 : 1;
    for (let r = 0; r < rowsN; r++) {
      const s0 = r * (short / rowsN), s1 = (r + 1) * (short / rowsN) - (rowsN > 1 ? 3 : 0);
      let p = 0;
      while (p < long - 14) {
        let L = 22 + rnd() * 24; if (long - p - L < 20) L = long - p;
        const lx0 = alongX ? b.ax + p : b.ax + s0, lx1 = alongX ? b.ax + p + L : b.ax + s1, lz0 = alongX ? b.az + s0 : b.az + p, lz1 = alongX ? b.az + s1 : b.az + p + L;
        p += L + 1.5;
        const x = (lx0 + lx1) / 2, z = (lz0 + lz1) / 2, W = lx1 - lx0, D = lz1 - lz0, t = Math.hypot(x, z) / R;
        const edges = (lx0 <= b.ax + 0.5 ? 1 : 0) | (lx1 >= b.bx - 0.5 ? 2 : 0) | (lz0 <= b.az + 0.5 ? 4 : 0) | (lz1 >= b.bz - 0.5 ? 8 : 0);   // which sides face a street (w, e, n, s)
        if (W < 14 || D < 14 || inKeep(x, z, W / 2, D / 2) || sea(x, z) || extra.some((s) => segDist(x, z, s) < s[4] / 2 + Math.hypot(W, D) / 2 + 3)) continue;
        if (rnd() > S.density * (1 - sstep(0.78, 0.97, t))) continue;
        const core = Math.pow(1 - Math.min(1, t * 1.05), 1.5);
        let H = S.hBase + (S.hMax - S.hBase) * core * (0.45 + 0.9 * rnd()); if (kind === KIND.hospital) H = Math.max(H, 32); if (kind === KIND.school) H = 12;
        if (c.type === 'port' && t > 0.55) H = 8 + rnd() * 10;   // warehouses and offices behind the quays
        const podium = Math.min(H * 0.5, 4.5 + rnd() * 5), inset = Math.min(1 + rnd() * 3, Math.min(W, D) * 0.15);
        const warehouse = c.type === 'port' && t > 0.55 && kind === 0, palette = kind === KIND.hospital ? 4 : Math.floor(rnd() * 8);
        bld.push([x, z, W, D, podium, Math.max(H - podium, 4), rnd() * 50, Math.floor(rnd() * 4), S.accents[Math.floor(rnd() * S.accents.length)], palette + (warehouse ? KIND.warehouse : kind) * 16, inset, edges]);
      }
    }
  });
  // ---- transit points (relative to the centre): kind 0 metro entrance, 1 central rail station, 2 airport gate. They stand on the pavement corner of
  // an avenue crossing: the most central crossing is the rail station, three more spread around are metro entrances.
  const stations = [];
  { const ax = xs.filter((_, i) => i % 4 === 0), az = zs.filter((_, i) => i % 4 === 0), cand = [];
    for (const x of ax) for (const z of az) if (Math.hypot(x, z) < R * 0.62 && !inKeep(x, z, 14, 14) && !sea(x, z)) cand.push([x, z, Math.hypot(x, z)]);
    cand.sort((a, b) => a[2] - b[2]);
    const wa = S.roadW * 1.5, put = (c, kind) => stations.push([c[0] + wa / 2 + 2.5, c[1] + wa / 2 + 2.5, kind]);
    if (cand.length) put(cand[0], 1);
    const spread = []; for (const c of cand.slice(1)) { if (spread.length >= 3) break; if (stations.every((s) => Math.hypot(s[0] - c[0], s[1] - c[1]) > R * 0.28)) { spread.push(c); put(c, 0); } }
    if (c.type === 'airport') stations.push([0, R * 0.28 - 350, 2]);
  }
  const trim = bld.map((b) => { const o = b.slice(); while (o.length < 12) o.push(o.length === 11 ? 15 : 1.5); return o; });
  const q = (arr, stride) => { const f = new Float32Array(arr.length * stride); arr.forEach((a, i) => { for (let k = 0; k < stride; k++) f[i * stride + k] = a[k] ?? 0; }); return f; };
  return { id: c.id, R, stations: q(stations, 3), bld: q(trim, 12), roads: q(roads, 5), areas: q(areas, 6), props: q(props, 7), lm: q(lm, 7), seaDir };
}

export function layouts() {
  if (globalThis.__BAKED?.layouts) return globalThis.__BAKED.layouts;
  const out = new Map();
  cities().forEach((c, i) => { const L = layoutCity(c, i); if (L) out.set(c.id, L); });
  return out;
}
