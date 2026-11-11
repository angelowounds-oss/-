// Real buildings for the capital region (WLD-24h, ADR-0042): the outlines and heights of OpenStreetMap (build/world/realdetail.mjs) replace the procedural
// buildings of blocks.mjs wherever the map has buildings, and the procedural ones stay only in the gaps (where nobody mapped). Every building keeps where its
// height came from (`src`: 2 a height tag, 1 a level count, 0 guessed), so the stats can say how much of the city is real and a debug view can show the rest.
// A guessed height is the one the procedural generator would have put there (it knows the district), held down for a small footprint.
import { area, LEVEL_H } from './realdetail.mjs';

// the same numbers as blocks.mjs, which imports this file while it runs (importing them back would wait on it forever)
const TILE = 512, TILE_OFF = 256, KIND = { house: 0, villa: 1, shop: 2, office: 3, apartment: 4, industrial: 5, tower: 6 };

export const SRC = { guess: 0, levels: 1, height: 2 };
const ROOF_TOP = 7, ROOF_SLAB = 1.5;   // a canopy with no height mapped: its top, and how thick a roof is solid
const TAG = {
  apartment: ['apartments'], house: ['house', 'detached', 'semidetached_house', 'terrace', 'hut', 'bungalow', 'cabin', 'farm'], villa: ['residential', 'dormitory'],
  shop: ['retail', 'commercial', 'supermarket', 'kiosk', 'shop'], office: ['office', 'government', 'civic', 'public', 'hospital', 'school', 'university', 'college', 'hotel', 'train_station', 'transportation', 'church', 'temple', 'religious'],
  industrial: ['industrial', 'warehouse', 'factory', 'manufacture', 'garage', 'garages', 'hangar', 'service', 'storage_tank', 'greenhouse', 'barn', 'shed', 'parking'],
};
const KIND_OF = new Map(); for (const [k, tags] of Object.entries(TAG)) for (const t of tags) KIND_OF.set(t, KIND[k]);
const DEFAULT_FL = [2, 4, 3, 8, 15, 1, 30];   // a guess by kind when no procedural building stands near (house villa shop office apartment industrial tower)

// the kind of a real building: its tag when that says something, else the procedural building that stood there, else its height and footprint
function kindOf(b, near, fl, a) {
  let k = KIND_OF.get(b.tag);
  if (k === undefined) k = near ? near.kind : fl >= 12 && a > 600 ? KIND.apartment : fl >= 6 ? KIND.office : fl >= 3 ? KIND.villa : KIND.house;
  if ((k === KIND.office || k === KIND.shop) && fl >= 30) k = KIND.tower;
  return k;
}

// merge: res is makeBuildings' result (procedural, struct of arrays), detail is readDetail's result, blocked(x, z) ground left alone, roads the region's lines
// (the buildings a big road runs through, below). Returns { real: [...], keep: Uint8Array over the
// procedural buildings (1 stays), stats }
export function mergeReal(res, detail, blocked = () => false, roads = null) {
  const B = res.B, nP = B.cx.length, C = 32, grid = new Map(), key = (a, b) => a * 65536 + b;
  const add = (x, z, v) => { const k = key(Math.floor(x / C), Math.floor(z / C)); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(v); };
  // building parts stand for the outline they sit in: an outline with parts inside is left out (the parts carry the real shape and heights)
  const parts = detail.buildings.filter((b) => b.part), pgrid = new Map();
  for (const p of parts) { const c = centroid(p.rings[0]), k = key(Math.floor(c[0] / 64), Math.floor(c[1] / 64)); let l = pgrid.get(k); if (!l) pgrid.set(k, (l = [])); l.push(c); }
  const hasPart = (b) => { const bb = bbox(b.rings[0]); for (let j = Math.floor(bb[1] / 64); j <= Math.floor(bb[3] / 64); j++) for (let i = Math.floor(bb[0] / 64); i <= Math.floor(bb[2] / 64); i++) for (const c of pgrid.get(key(i, j)) || []) if (inRing(c, b.rings[0])) return true; return false; };
  // (blocked: the hand-made city until WLD-24c and the places with a city of their own, the same ground the procedural buildings leave free)
  const list = detail.buildings.filter((b) => (b.part || !hasPart(b)) && !blocked(...centroid(b.rings[0])));
  // the procedural buildings, indexed, for the guesses
  const pgridP = new Map(); for (let i = 0; i < nP; i++) { const k = key(Math.floor(B.cx[i] / C), Math.floor(B.cz[i] / C)); let l = pgridP.get(k); if (!l) pgridP.set(k, (l = [])); l.push(i); }
  const nearest = (x, z, R) => { let best = -1, bd = R * R; for (let b = Math.floor((z - R) / C); b <= Math.floor((z + R) / C); b++) for (let a = Math.floor((x - R) / C); a <= Math.floor((x + R) / C); a++) for (const i of pgridP.get(key(a, b)) || []) { const d = (B.cx[i] - x) ** 2 + (B.cz[i] - z) ** 2; if (d < bd) { bd = d; best = i; } } return best; };
  const real = [], src = [0, 0, 0], passage = { under: 0, over: 0, lifted: 0, ids: [] }, crossing = roads ? throughRoads(roads) : null;
  for (const b of list) {
    const c = centroid(b.rings[0]), a = Math.abs(area(b.rings[0])), ni = nearest(c[0], c[1], 60), near = ni >= 0 ? { kind: B.kind[ni], fl: B.fl[ni] } : null;
    let h = b.h, fl = b.levels, s = b.src;
    if (s === SRC.guess) {
      fl = near ? near.fl : DEFAULT_FL[KIND_OF.get(b.tag) ?? KIND.villa];
      if (a < 80) fl = Math.min(fl, 3); else if (a < 200) fl = Math.min(fl, 5); else if (a < 400) fl = Math.min(fl, 8);
      h = b.base + fl * LEVEL_H + 0.6;
    }
    // a roof is a slab at its top (min_height when the map gives one): the toll plaza canopy of 구리남양주TG stood 15 m solid across the motorway, and every
    // car driving into it was wrecked (WLD-22e); with no height mapped it is a canopy's, 7 m to its top over 5.5 m of clearance
    let base = b.base;
    if (b.roof) { if (s === SRC.guess) { h = Math.max(b.base + 2.5, ROOF_TOP); fl = 1; } base = Math.max(b.base, h - ROOF_SLAB); }
    const kind = kindOf(b, near, fl, a);
    // a building a collector road or a bigger one runs through at ground level (WLD-31): the map puts a structure there that the road passes under or
    // over. Below the ground (a negative layer, with the road on the ground through it) it is left out; above the road it stands on the road's
    // clearance (an elevated station, a deck, a building over the road); the rest are listed for a look at the map
    const through = crossing ? crossing(b.rings[0]) : 0;
    if (through >= THROUGH && base < CLEAR - 1) {
      if (b.layer < 0) { passage.under++; continue; }
      const up = b.layer > 0 || b.tag === 'train_station' || b.tag === 'bridge' ? 'over' : 'lifted'; passage[up]++; if (up === 'lifted') passage.ids.push(b.id);
      const tall = Math.max(3, h - base); base = CLEAR; h = Math.max(h, base + tall); fl = Math.max(1, Math.round((h - base) / LEVEL_H));
    }
    real.push({ id: b.id, rings: b.rings, cx: c[0], cz: c[1], h, base, fl: Math.max(1, Math.round(fl)), kind, src: s, name: b.name });
    src[s]++;
    // the cells it covers: its corners, and every cell whose centre lies inside (a 300 m warehouse has its corners far apart)
    for (const p of b.rings[0]) add(p[0], p[1], real.length - 1);
    add(c[0], c[1], real.length - 1);
    const bb = bbox(b.rings[0]);
    for (let j = Math.floor(bb[1] / C); j <= Math.floor(bb[3] / C); j++) for (let i = Math.floor(bb[0] / C); i <= Math.floor(bb[2] / C); i++) if (inRing([(i + 0.5) * C, (j + 0.5) * C], b.rings[0])) add((i + 0.5) * C, (j + 0.5) * C, real.length - 1);
  }
  // a procedural building stays only where no real building is near: the map's gaps (fields, parks, car parks) are real gaps in a mapped district, so the
  // test is about mapped ground, not about overlap (a 32 m cell with any real outline point, or the cells next to it)
  const keep = new Uint8Array(nP);
  for (let i = 0; i < nP; i++) {
    const ci = Math.floor(B.cx[i] / C), cj = Math.floor(B.cz[i] / C), r = Math.ceil((Math.hypot(B.w[i], B.d[i]) / 2) / C);
    let mapped = false; for (let b = cj - r; b <= cj + r && !mapped; b++) for (let a = ci - r; a <= ci + r; a++) if (grid.has(key(a, b))) { mapped = true; break; }
    keep[i] = mapped ? 0 : 1;
  }
  let kept = 0; for (const k of keep) kept += k;
  return { real, keep, stats: { real: real.length, height: src[2], levels: src[1], guessed: src[0], dropped: detail.buildings.length - list.length, procedural: nP, kept, passage, realShare: +(real.length / Math.max(1, real.length + kept)).toFixed(3), heightShare: +((src[1] + src[2]) / Math.max(1, real.length + kept)).toFixed(3) } };
}
// the metres of ground-level centre line of the collector roads and bigger ones inside a ring (2 m samples, the keep zone's lines included: the caller's
// `blocked` leaves those buildings out anyway). Returns a function of the ring.
const BIG = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link']);
const THROUGH = 1.5, CLEAR = 5.5, STEP = 2;   // metres inside (one sample) before a building counts as across the road; the clearance of a road under a structure (toll canopies, WLD-22e)
function throughRoads(roads) {
  const G = 64, cells = new Map(), key = (a, b) => a * 65536 + b;
  for (const r of roads) {
    if (!BIG.has(r.hw)) continue;
    for (let i = 0; i + 1 < r.x.length; i++) {
      if (r.cls[i] || r.cls[i + 1]) continue;
      const L = Math.hypot(r.x[i + 1] - r.x[i], r.z[i + 1] - r.z[i]), n = Math.max(1, Math.round(L / STEP)), w = L / n;
      for (let k = 0; k < n; k++) { const x = r.x[i] + (r.x[i + 1] - r.x[i]) * (k + 0.5) / n, z = r.z[i] + (r.z[i + 1] - r.z[i]) * (k + 0.5) / n, c = key(Math.floor(x / G), Math.floor(z / G)); let l = cells.get(c); if (!l) cells.set(c, (l = [])); l.push(x, z, w); }
    }
  }
  return (ring) => {
    const bb = bbox(ring); let m = 0;
    for (let j = Math.floor(bb[1] / G); j <= Math.floor(bb[3] / G); j++) for (let i = Math.floor(bb[0] / G); i <= Math.floor(bb[2] / G); i++) {
      const l = cells.get(key(i, j)); if (!l) continue;
      for (let q = 0; q < l.length; q += 3) if (l[q] >= bb[0] && l[q] <= bb[2] && l[q + 1] >= bb[1] && l[q + 1] <= bb[3] && inRing([l[q], l[q + 1]], ring)) m += l[q + 2];
    }
    return m;
  };
}
export function centroid(r) { let a = 0, x = 0, z = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; x += (r[j][0] + r[i][0]) * f; z += (r[j][1] + r[i][1]) * f; } if (Math.abs(a) < 1e-9) return r[0]; return [x / (3 * a), z / (3 * a)]; }
const bbox = (r) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of r) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); } return [a, b, c, d]; };
function inRing(p, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }

// add the real buildings to the tiles of toTiles (each in the tile of its centroid, sorted by OSM id so the bytes do not depend on fetch order):
// pn buildings; pr ring offsets (pn + 1), ro vertex offsets (rings + 1), px/pz vertices (0.1 m from the tile centre), ph top and pb base height above the
// ground (0.1 m), pfl floors, pk kind, ps where the height came from, pid the OSM id (ways positive, relations negative)
export function addRealTiles(tiles, real) {
  const by = new Map();
  for (const b of real) { const ti = Math.floor(b.cx / TILE) + TILE_OFF, tj = Math.floor(b.cz / TILE) + TILE_OFF, k = `${ti}_${tj}`; let l = by.get(k); if (!l) by.set(k, (l = [])); l.push(b); }
  // the OSM id as one number: ways positive, relations negative, a relation's piece k (r123-k) above 2^34 (OSM ids stay far below)
  const osmId = (id) => { const [n, k] = id.slice(1).split('-').map(Number); return (id[0] === 'r' ? -1 : 1) * (n + (k || 0) * 2 ** 34); };
  for (const [k, list] of by) {
    list.sort((a, b) => osmId(a.id) - osmId(b.id));
    const [ti, tj] = k.split('_').map(Number), ox = (ti - TILE_OFF) * TILE + TILE / 2, oz = (tj - TILE_OFF) * TILE + TILE / 2, n = list.length;
    let nr = 0, nv = 0; for (const b of list) { nr += b.rings.length; for (const r of b.rings) nv += r.length; }
    const t = tiles[k] || (tiles[k] = { n: 0, cx: new Int16Array(0), cz: new Int16Array(0), w: new Uint16Array(0), d: new Uint16Array(0), rot: new Uint16Array(0), fl: new Uint8Array(0), kind: new Uint8Array(0), notch: new Uint8Array(0) });
    Object.assign(t, { pn: n, pr: new Int32Array(n + 1), ro: new Int32Array(nr + 1), px: new Int16Array(nv), pz: new Int16Array(nv), ph: new Uint16Array(n), pb: new Uint16Array(n), pfl: new Uint8Array(n), pk: new Uint8Array(n), ps: new Uint8Array(n), pid: new Float64Array(n) });
    let r = 0, v = 0;
    list.forEach((b, q) => {
      t.pr[q] = r; t.ph[q] = Math.min(65535, Math.round(b.h * 10)); t.pb[q] = Math.min(65535, Math.round(b.base * 10)); t.pfl[q] = Math.min(255, b.fl); t.pk[q] = b.kind; t.ps[q] = b.src; t.pid[q] = osmId(b.id);
      for (const ring of b.rings) { t.ro[r++] = v; for (const p of ring) { t.px[v] = Math.max(-32767, Math.min(32767, Math.round((p[0] - ox) * 10))); t.pz[v] = Math.max(-32767, Math.min(32767, Math.round((p[1] - oz) * 10))); v++; } }
    });
    t.pr[n] = r; t.ro[nr] = v;
  }
  return tiles;
}
// a stored tile's real buildings back to numbers (world metres): what the tests and the judge read
export function readRealTile(key, t) {
  if (!t.pn) return [];
  const [ti, tj] = key.split('_').map(Number), ox = (ti - TILE_OFF) * TILE + TILE / 2, oz = (tj - TILE_OFF) * TILE + TILE / 2, out = [];
  for (let q = 0; q < t.pn; q++) {
    const rings = []; for (let r = t.pr[q]; r < t.pr[q + 1]; r++) { const ring = []; for (let v = t.ro[r]; v < t.ro[r + 1]; v++) ring.push([ox + t.px[v] / 10, oz + t.pz[v] / 10]); rings.push(ring); }
    const a = Math.abs(t.pid[q]), k = Math.floor(a / 2 ** 34), n = a - k * 2 ** 34;
    out.push({ uid: `OSM-${t.pid[q] < 0 ? 'r' : 'w'}${n}${k ? '-' + k : ''}`, rings, h: t.ph[q] / 10, base: t.pb[q] / 10, fl: t.pfl[q], kind: t.pk[q], src: t.ps[q] });
  }
  return out;
}
