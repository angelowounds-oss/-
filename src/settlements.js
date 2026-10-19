import { regionWeight, regionPlaces } from './region.js';
import { cities, farHeight, highways, rivers, biomeAt, SEA } from './worldmap.js';

// The places between the cities (ADR-0013), as data (pure): about thirty villages (eight beside the highways, the rest over the countryside), the farms
// near them, the industry (wind farms, solar fields, mines, refineries), the comms towers and the pylon lines. Everything is a function of the seed and the
// world, so the bake can carve a flat pad under each site (roadnet.js) and the page can lay the same places out. Coordinates are world metres; the
// layout of a village is in its own frame (x along the main street, z across it), y is the height of its pad.
// footprints of the three apartment block models in assets/blocks (long side along the street)
const BLOCKS = [{ w: 23, d: 12.6 }, { w: 23, d: 12.6 }, { w: 23, d: 12.6 }];
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const sl = (x, z, e = 60) => Math.hypot(farHeight(x + e, z, 40) - farHeight(x - e, z, 40), farHeight(x, z + e, 40) - farHeight(x, z - e, 40)) / (2 * e);
const NAMES = {
  en: [['Ash', 'Brook', 'Clay', 'Dun', 'Elm', 'Fair', 'Glen', 'Hollow', 'Iron', 'Kings', 'Lake', 'Mill', 'North', 'Oak', 'Pine', 'Quarry', 'Red', 'Stone', 'Thorn', 'West'], ['ford', 'field', 'ton', 'wick', 'dale', 'ridge', 'hurst', 'bury', 'haven', 'ley']],
  sv: [['Björk', 'Lund', 'Sand', 'Fors', 'Hög', 'Berg', 'Vik', 'Skog', 'Ek', 'Gran', 'Sten', 'Ljung'], ['by', 'torp', 'näs', 'hed', 'sta', 'mark', 'vall', 'bo']],
  es: [['San ', 'Santa ', 'Villa ', 'Los ', 'El ', 'Puerto ', 'Nueva '], ['Pedro', 'Rosa', 'Verde', 'Alta', 'Piedras', 'Cruz', 'Luz', 'Sol', 'Paloma', 'Mesa']],
  ja: [['Kita', 'Minami', 'Higashi', 'Nishi', 'Aka', 'Kuro', 'Shiro', 'Naka', 'Ao', 'Tsuki'], ['mura', 'machi', 'hama', 'yama', 'gawa', 'saki', 'no', 'hara']],
};
const LANG = { mid1: 'sv', mid3: 'sv', mid2: 'es', mid4: 'ja', harbor: 'en', airfield: 'en', neon: 'en' };
const PALETTES = { en: [0xb9a58a, 0xa8b0b8, 0xc9b79a, 0x9a8a78, 0xb8b0a0], sv: [0xa6402f, 0xd8c9a0, 0x6b4a32, 0xb08a4a, 0x8a3a2c], es: [0xe0cfa8, 0xd8b88a, 0xe8dcc0, 0xc79a6a], ja: [0x9a8f84, 0xb8aea0, 0x7a746e, 0xcfc6b6], ko: [0xc9c4b8, 0xb5b0a4, 0xd8d0c0, 0xa7a79f, 0xcbbfa8] };
const ROOFS = [0x7a2f22, 0x3a3f4a, 0x5a4a38, 0x4a5a48];

let CACHE = null;
export function settlements() {
  if (CACHE) return CACHE;
  const rnd = mulberry(9137), C = cities(), hw = highways(), rv = rivers(), V = [], F = [], I = [], T = [], P = [];
  const nearest = (x, z) => C.reduce((b, c) => { const d = Math.hypot(x - c.x, z - c.z); return d < b.d ? { c, d } : b; }, { c: C[0], d: 1e18 });
  const farFrom = (x, z, list, m) => list.every((q) => Math.hypot(q.x - x, q.z - z) >= m);
  const riverNear = (x, z, m) => rv.some((r) => r.pts.some((p, i) => i % 2 === 0 && Math.hypot(p[0] - x, p[1] - z) < m + p[2] / 2));
  const okVillage = (x, z) => {
    if (Math.abs(x) > 46000 || Math.abs(z) > 46000 || Math.hypot(x, z) < 11000) return false;
    const h = farHeight(x, z, 60); if (h < 8 || h > 520 || sl(x, z) > 0.045) return false;
    const b = biomeAt(x, z, h); if (b === 0 || b === 1 || b === 7 || b === 9 || b === 6) return false;
    if (C.some((c) => Math.hypot(x - c.x, z - c.z) < c.r * 1.7 + 1800)) return false;
    return !riverNear(x, z, 260) && farFrom(x, z, V, 5800);
  };
  const add = (x, z, tag) => {
    const nc = nearest(x, z).c, lang = LANG[nc.id] || 'en', [a, b] = NAMES[lang], seed = Math.floor(rnd() * 1e6);
    const name = lang === 'es' ? a[Math.floor(rnd() * a.length)] + b[Math.floor(rnd() * b.length)] : a[Math.floor(rnd() * a.length)] + b[Math.floor(rnd() * b.length)];
    V.push({ id: 'v' + V.length, name, x, z, y: farHeight(x, z, 100), seed, lang, tag, city: nc.id });
  };
  // eight beside the highways: every ~24 km of road, 700-1800 m to the side
  for (const h of hw) {
    for (let s = 11000; s < h.length - 9000; s += 24000) {
      let acc = 0, p = h.pts[0], q = h.pts[1];
      for (let i = 1; i < h.pts.length; i++) { const seg = Math.hypot(h.pts[i][0] - h.pts[i - 1][0], h.pts[i][1] - h.pts[i - 1][1]); if (acc + seg >= s) { p = h.pts[i - 1]; q = h.pts[i]; break; } acc += seg; }
      const tx = q[0] - p[0], tz = q[1] - p[1], l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l; let done = false;
      for (let k = 0; k < 24 && !done; k++) for (const sg of [1, -1]) { const off = (700 + k * 120) * sg, x = p[0] + nx * off, z = p[1] + nz * off; if (okVillage(x, z)) { add(x, z, 'highway'); done = true; break; } }
    }
  }
  // the rest over the countryside: a hashed scan of the land, nearest-flat first, 5.8 km apart
  const cand = []; for (let k = 0; k < 4000; k++) { const x = (rnd() * 2 - 1) * 46000, z = (rnd() * 2 - 1) * 46000; cand.push([x, z, sl(x, z)]); }
  cand.sort((a, b) => a[2] - b[2]);
  for (const [x, z] of cand) { if (V.length >= 30) break; if (okVillage(x, z)) add(x, z, 'country'); }
  // the real settlements of a compiled region (ADR-0021): Korean names, on the pad the compiler cut for them
  const SIZE = { village: 6, suburb: 8, town: 11, city: 13 };
  for (const q of regionPlaces()) { const nc = nearest(q.x, q.z).c; V.push({ id: 'v' + V.length, name: q.name, x: q.x, z: q.z, y: q.y, seed: 1000 + V.length * 7919, lang: 'ko', tag: 'real', city: nc.id, nHouses: SIZE[q.kind] || 6, real: q.id }); }
  for (const v of V) layoutVillage(v);
  // farms: one or two near each third village on farmland or plains, 600-1400 m out
  V.forEach((v, i) => { if (i % 3 !== 0) return; for (let k = 0; k < 2; k++) for (let t = 0; t < 30; t++) { const a = rnd() * 6.283, d = 600 + rnd() * 800, x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d, h = farHeight(x, z, 60); if (h > 6 && sl(x, z) < 0.04 && !riverNear(x, z, 150) && farFrom(x, z, F, 900) && ![0, 1, 7, 9].includes(biomeAt(x, z, h))) { F.push({ id: 'f' + F.length, x, z, y: farHeight(x, z, 80), seed: Math.floor(rnd() * 1e6), village: v.id }); break; } } });
  for (const f of F) layoutFarm(f, V.find((q) => q.id === f.village));
  // industry: wind farms on high open land, solar fields on dry flats, mines in the mountains, refineries on the coast and inland
  const pick = (n, score, ok, apart) => { const out = [], c2 = []; for (let k = 0; k < 6000; k++) { const x = (rnd() * 2 - 1) * 44000, z = (rnd() * 2 - 1) * 44000; if (ok(x, z)) c2.push([x, z, score(x, z)]); } c2.sort((a, b) => b[2] - a[2]); for (const [x, z] of c2) { if (out.length >= n) break; if (farFrom(x, z, out, apart) && farFrom(x, z, V, 2600) && C.every((c) => Math.hypot(x - c.x, z - c.z) > c.r * 1.7 + 2500)) out.push({ x, z }); } return out; };
  const flatDry = (x, z, lo, hi, s) => { const h = farHeight(x, z, 60); return Math.hypot(x, z) > 11000 && h > lo && h < hi && sl(x, z, 80) < s && !riverNear(x, z, 300) && ![0, 1, 7, 9].includes(biomeAt(x, z, h)); };
  pick(2, (x, z) => farHeight(x, z, 200), (x, z) => flatDry(x, z, 120, 600, 0.05), 15000).forEach((s, i) => I.push({ id: 'w' + i, type: 'wind', x: s.x, z: s.z, y: farHeight(s.x, s.z, 80), n: 9 + (i * 3), seed: 10 + i }));
  pick(2, (x, z) => -Math.abs(farHeight(x, z, 200) - 40) - sl(x, z, 80) * 400, (x, z) => flatDry(x, z, 10, 120, 0.02) && biomeAt(x, z, farHeight(x, z, 60)) === 8 || flatDry(x, z, 10, 120, 0.02), 15000).forEach((s, i) => I.push({ id: 's' + i, type: 'solar', x: s.x, z: s.z, y: farHeight(s.x, s.z, 80), seed: 20 + i }));
  pick(2, (x, z) => farHeight(x, z, 200), (x, z) => flatDry(x, z, 300, 1000, 0.06), 15000).forEach((s, i) => I.push({ id: 'm' + i, type: 'mine', x: s.x, z: s.z, y: farHeight(s.x, s.z, 80), seed: 30 + i }));
  { const hb = C.find((c) => c.id === 'harbor'); if (hb) { const sd = hb.seaDir, ux = -sd.z, uz = sd.x; for (let k = 0; k < 40; k++) { const x = hb.x + ux * (hb.r * 1.9 + k * 100) + sd.x * hb.r * 0.2, z = hb.z + uz * (hb.r * 1.9 + k * 100) + sd.z * hb.r * 0.2, h = farHeight(x, z, 60); if (h > 3 && sl(x, z, 80) < 0.04) { I.push({ id: 'r0', type: 'refinery', x, z, y: farHeight(x, z, 80), seed: 40 }); break; } } } }
  pick(1, (x, z) => -sl(x, z, 80), (x, z) => flatDry(x, z, 20, 200, 0.03), 15000).forEach((s) => I.push({ id: 'r1', type: 'refinery', x: s.x, z: s.z, y: farHeight(s.x, s.z, 80), seed: 41 }));
  // comms towers on high ground near the highways
  pick(12, (x, z) => farHeight(x, z, 300) + rnd() * 80, (x, z) => { const h = farHeight(x, z, 60); return Math.hypot(x, z) > 9000 && h > 80 && h < 1100 && sl(x, z, 40) < 0.2 && ![0, 1].includes(biomeAt(x, z, h)); }, 7000).forEach((s, i) => T.push({ id: 't' + i, x: s.x, z: s.z, y: farHeight(s.x, s.z, 30), h: 55 + (i % 4) * 14, seed: 50 + i }));
  // pylon lines: from the capital's ring to each other city along the highway, 420 m to its side, a pylon every 330 m
  for (const h of hw) {
    if (h.a !== 'neon' && h.b !== 'neon') continue;
    const line = { id: 'p' + P.length, a: h.a, b: h.b, pts: [] }; let acc = 0, last = null;
    for (let i = 1; i < h.pts.length; i++) {
      const a = h.pts[i - 1], b = h.pts[i], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l;
      acc += l; if (acc < 330 || Math.hypot(b[0], b[1]) < 6500) continue; acc = 0;
      const x = b[0] + nx * 420, z = b[1] + nz * 420, hh = farHeight(x, z, 30); if (hh < 6 || C.some((c) => c.id !== 'neon' && Math.hypot(x - c.x, z - c.z) < c.r * 1.3)) { last = null; continue; }
      line.pts.push([x, z, hh]); last = [x, z];
    }
    void last; if (line.pts.length > 6) P.push(line);
  }
  // dirt tracks: from each village to the nearest point of a highway (or to the nearest other village when that is closer), and from each farm to its village
  const K = [], hp = []; for (const h of hw) for (let i = 0; i < h.pts.length; i += 10) hp.push(h.pts[i]);
  for (const v of V) { let b = null, bd = 1e18; for (const p of hp) { const d = Math.hypot(p[0] - v.x, p[1] - v.z); if (d < bd) { bd = d; b = p; } } let o = null, od = 1e18; for (const w of V) if (w !== v) { const d = Math.hypot(w.x - v.x, w.z - v.z); if (d < od) { od = d; o = w; } } if (b && bd < 9000) K.push([v.x, v.z, b[0], b[1]]); if (o && od < 9000 && v.id < o.id) K.push([v.x, v.z, o.x, o.z]); }
  for (const f of F) { const v = V.find((q) => q.id === f.village); if (v) K.push([f.x, f.z, v.x, v.z]); }
  // inside a compiled region the real ground and roads are the only source (ADR-0020): the invented places leave it until real settlements come in M4
  const out = (q) => q.tag !== 'real' && regionWeight(q.x, q.z) > 0, away = (a) => a.filter((q) => !out(q));
  CACHE = { villages: away(V), farms: away(F), industry: away(I), towers: away(T), pylons: P.filter((l) => !l.pts.some((p) => regionWeight(p[0], p[1]) > 0)), tracks: K.filter((k) => !out({ x: k[0], z: k[1] }) && !out({ x: k[2], z: k[3] })) };
  return CACHE;
}

// the plan of a village in its own frame (x along the main street, z across; y of the pad is v.y): houses on both sides, a plaza with the general store, an
// optional filling station, church and water tower. All rectangles are [x0, z0, x1, z1]; a door is on the wall facing the street.
export function layoutVillage(v) {
  const rnd = mulberry(v.seed), n = v.nHouses || 6 + Math.floor(rnd() * 9), pal = PALETTES[v.lang] || PALETTES.en, houses = [];
  const Lh = 70 + n * 9;
  v.Lh = Lh; v.r = Lh + 70; v.church = rnd() < 0.4; v.gas = rnd() < 0.55; v.tower = rnd() < 0.3; v.pitched = v.lang === 'sv' || v.lang === 'en' || rnd() < 0.4;
  v.shopKind = ['convenience', 'hardware', 'pharmacy', 'restaurant', 'convenience', 'convenience'][Math.floor(rnd() * 6)];
  const occupied = [[-18, -30, 18, 30]];   // the plaza
  const free = (r) => occupied.every((o) => r[2] < o[0] - 3 || r[0] > o[2] + 3 || r[3] < o[1] - 3 || r[1] > o[3] + 3);
  const put = (kind, x, side, w, d, extra = {}) => { const zc = side * (4.5 + 4 + d / 2), r = [x - w / 2, zc - d / 2, x + w / 2, zc + d / 2]; if (!free(r)) return null; occupied.push(r); const hs = { kind, x, z: zc, w, d, r, side, door: { x, z: side * 4.5 }, color: pal[Math.floor(rnd() * pal.length)], roof: ROOFS[Math.floor(rnd() * ROOFS.length)], ...extra }; houses.push(hs); return hs; };
  put('shop', 32, -1, 15, 11, { name: (v.lang === 'ko' ? { convenience: '편의점', hardware: '철물점', pharmacy: '약국', restaurant: '식당' } : { convenience: 'General Store', hardware: 'Hardware', pharmacy: 'Pharmacy', restaurant: 'Diner' })[v.shopKind], stock: v.shopKind });
  if (v.gas) put('gas', -48, 1, 8, 6, { name: v.lang === 'ko' ? '주유소' : 'Gas & Go' });
  if (v.church) put('church', Lh - 18, -1, 10, 18, { name: v.lang === 'ko' ? '교회' : 'Chapel' });
  let slot = 0;
  for (let x = -Lh + 14; x < Lh - 10 && houses.filter((h) => h.kind === 'house').length < n; x += 17 + rnd() * 6) for (const side of [-1, 1]) {
    if (houses.filter((h) => h.kind === 'house').length >= n) break; const w = 8 + rnd() * 5, d = 7 + rnd() * 4; if (put('house', x + (rnd() - 0.5) * 3, side, w, d)) slot++;
  }
  void slot;
  v.houses = houses;
  // residents: two or three to a house, a few more at the shop; each has a work place (the plaza, the shop, the fields, the church)
  const residents = []; let k = 0;
  for (const h of houses) {
    const count = h.kind === 'house' ? 1 + Math.floor(rnd() * 3) : h.kind === 'shop' ? 1 : 0;
    for (let q = 0; q < count; q++) { const work = h.kind === 'shop' ? 'shop' : ['plaza', 'plaza', 'fields', 'church', 'shop'][Math.floor(rnd() * 5)]; residents.push({ id: v.id + ':' + k++, home: houses.indexOf(h), work: work === 'church' && !v.church ? 'plaza' : work, seed: Math.floor(rnd() * 1e6), age: rnd(), name: ['Alex', 'Sam', 'Jo', 'Kim', 'Lee', 'Max', 'Ana', 'Ben', 'Eva', 'Tom', 'Ida', 'Joe'][Math.floor(rnd() * 12)] }); }
  }
  v.residents = residents.slice(0, 22);
  // apartment blocks (assets/blocks): one or two at the quiet ends of the street, on their own random stream so the rest of the plan stays as it was
  const br = mulberry(v.seed ^ 0xb10c), nb = br() < 0.8 ? 1 + (n >= 11 && br() < 0.6 ? 1 : 0) : 0;
  for (let b = 0; b < nb; b++) {
    const model = Math.floor(br() * BLOCKS.length), { w, d } = BLOCKS[model], from = br() < 0.5 ? -1 : 1; let placed = null;
    for (let q = 0; q < 30 && !placed; q++) for (const side of [from, -from]) { const x = from * (Lh - 12 - q * 6), zc = side * (4.5 + 4 + d / 2), r = [x - w / 2, zc - d / 2, x + w / 2, zc + d / 2]; if (Math.abs(x) + w / 2 > Lh + 8 || !free(r)) continue; occupied.push(r); placed = { kind: 'block', model, x, z: zc, w, d, r, side, door: { x, z: side * 4.5 }, color: pal[Math.floor(br() * pal.length)], roof: ROOFS[0] }; houses.push(placed); break; }
    if (placed) for (let q = 0; q < 3; q++) v.residents.push({ id: v.id + ':b' + b + q, home: houses.length - 1, work: ['plaza', 'plaza', 'fields', 'shop'][Math.floor(br() * 4)], seed: Math.floor(br() * 1e6), age: br(), name: ['Alex', 'Sam', 'Jo', 'Kim', 'Lee', 'Max', 'Ana', 'Ben'][Math.floor(br() * 8)] });
  }
  return v;
}
// a farm: a farmhouse and a barn either side of a short track, a silo, hay; one farmer
export function layoutFarm(f, v) {
  const rnd = mulberry(f.seed), pal = PALETTES[v?.lang] || PALETTES.en;
  f.name = (v ? v.name : 'Old') + ' ' + ['Farm', 'Ranch', 'Acres', 'Steading'][Math.floor(rnd() * 4)]; f.lang = v?.lang || 'en'; f.Lh = 45; f.r = 70; f.pitched = true; f.farm = true; f.y = f.y;
  const house = { kind: 'house', x: -14, z: -(4.5 + 4 + 4.5), w: 11, d: 9, r: [-19.5, -17.5, -8.5, -8.5], side: -1, door: { x: -14, z: -4.5 }, color: pal[Math.floor(rnd() * pal.length)], roof: ROOFS[Math.floor(rnd() * ROOFS.length)] };
  const barn = { kind: 'barn', name: 'Barn', x: 14, z: 4.5 + 4 + 5.5, w: 16, d: 11, r: [6, 8.5, 22, 19.5], side: 1, door: { x: 14, z: 4.5 }, color: 0x7a2f22, roof: 0x3a3f4a };
  f.houses = [house, barn]; f.residents = [{ id: f.id + ':0', home: 0, work: 'fields', seed: Math.floor(rnd() * 1e6), age: rnd(), name: ['Hank', 'Marta', 'Olle', 'Rosa', 'Jun', 'Walt'][Math.floor(rnd() * 6)] }]; f.shopKind = null; f.gas = false; f.tower = false; f.church = false;
  return f;
}
export { SEA };
