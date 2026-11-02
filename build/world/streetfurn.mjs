// Where the street lamps and street trees of the capital region stand (WLD-24g): every candidate spot is judged against what is around it, and the object
// is only put there when it belongs there. Nothing is placed by spacing alone.
// Inputs: the compiled roads (region.bin: lines with height, width, class), the procedural buildings (rotated rectangles), the junctions and pavement runs of
// streets.mjs. The order is the order a street is fitted out in: the fixed things of the junction first (crossings, signal poles), then lighting by road
// importance (an arterial is lit before the side street that meets it, and a spot that the arterial's lamps already light needs no second lamp), then the
// trees, which have to keep clear of everything else.
// Rules, with the reason recorded when a spot is refused (streets-stats.json counts them):
//   need      lamps: the arrangement follows the carriageway width as a lighting design does (one side under 12 m, staggered under 20 m, opposite pairs
//             beyond), spacing about 3.2 x the mounting height; trees: a pavement of 2.5 m or more (a 1.2 m tree pit leaves a 1.5 m walkway), not on a
//             bridge deck (no soil), one species per road.
//   water     the spot is in the river or the sea
//   ground    the graded ground (grade.mjs) lies more than 1 m from the pavement there: the foot would hang in the air or stand buried
//   building  the pole or trunk would stand in a building (or closer than 0.4 m); `facade` a tree's crown would grow into the wall
//   road      the spot is on another carriageway (a road beside this one, the median of a dual carriageway)
//   overpass  another road passes over within the object's height (a lamp would pierce the deck, a tree would get no light or rain)
//   crossing  on or right next to a zebra crossing (a pole in the walking line, a tree hiding the people crossing)
//   signal    too close to a signal pole (the signal pole lights its own corner; a tree would hide the signal head from the drivers arriving)
//   lit       another lamp already lights this spot
//   entrance  in front of the middle of a building's frontage (its door, or the driveway of an apartment block, office or tower)
//   corner    a tree within the sight triangle of a junction
//   lamp      a tree too close to a lamp (it would shade the light)
//   tree      too close to another tree
import { crossingSpan, signalFoot, hasSignal } from '../../src/streetgeo.js';
import { readTile as readBldTile, KIND } from './blocks.mjs';
import { readRealTile } from './osmbuildings.mjs';
import { placePoints, midCrossings, PTYPE } from './streetpoints.mjs';

const RANK = { trunk: 0, primary: 0, secondary: 1, tertiary: 2, residential: 3, living_street: 3, unclassified: 3 };
const rankOf = (hw) => (hw in RANK ? RANK[hw] : 9);
// lamps: mounting height by rank (Seoul arterial 10 - 12 m, collector 9 m, local 7.5 m, a side street's pole lamp 6 m)
export const LAMP_H = [10, 9, 7.5, 6];
// lamp interval: about 3.2 x the mounting height on lit roads; a side street's lamps hang on the utility poles, about every 30 m
export const LAMP_GAP = [32, 29, 24, 30];
// trees: Seoul's street trees by share (ginkgo, plane tree, zelkova, cherry), crown radius and planting interval of each
export const SPECIES = [{ name: 'ginkgo', share: 0.4, r: 1.5, gap: 8 }, { name: 'plane', share: 0.25, r: 2.3, gap: 10 }, { name: 'zelkova', share: 0.2, r: 2.2, gap: 9 }, { name: 'cherry', share: 0.15, r: 1.9, gap: 8 }];
export const TREE_MIN_WALK = 2.5;
export const TYPE = { lamp: 0, tree: 1, ...PTYPE };
const hash = (a, b) => { let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b + 1, 0x165667b1); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const speciesOf = (ri) => { const u = hash(ri, 7771); let a = 0; for (let k = 0; k < SPECIES.length; k++) { a += SPECIES[k].share; if (u < a) return k; } return 0; };

// a spatial hash of small records for "anything of this kind within d"
class Grid {
  constructor(cs) { this.cs = cs; this.m = new Map(); }
  key(i, j) { return i * 1000003 + j; }
  add(x, z, rec) { const k = this.key(Math.floor(x / this.cs), Math.floor(z / this.cs)); (this.m.get(k) || this.m.set(k, []).get(k)).push(rec); }
  // every record whose cell is within d of (x, z)
  *near(x, z, d) {
    const i0 = Math.floor((x - d) / this.cs), i1 = Math.floor((x + d) / this.cs), j0 = Math.floor((z - d) / this.cs), j1 = Math.floor((z + d) / this.cs);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const l = this.m.get(this.key(i, j)); if (l) yield* l; }
  }
}

// signed distance from (x, z) to a polygon with holes (negative inside), and on the nearest wall: its length and where the foot falls from its middle
function polyDist(x, z, rings) {
  let d2 = Infinity, s = 0, len = 0, inside = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const ax = r[j][0], az = r[j][1], bx = r[i][0], bz = r[i][1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9;
    if ((az > z) !== (bz > z) && x < dx * (z - az) / (bz - az || 1e-12) + ax) inside = !inside;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), ex = ax + dx * t - x, ez = az + dz * t - z, e2 = ex * ex + ez * ez;
    if (e2 < d2) { d2 = e2; const l = Math.sqrt(l2); len = l; s = (t - 0.5) * l; }
  }
  const d = Math.sqrt(d2); return { d: inside ? -d : d, s, len };
}

// the judge: the world around the street as indexes, and the tests a spot has to pass
export function makeJudge(R, bld, junctions) {
  const roads = R.roads;
  // buildings as rotated rectangles in world metres
  const B = [], bg = new Grid(32);
  for (const [key, t] of Object.entries(bld?.tiles || {})) for (const b of readBldTile(key, t)) {
    const ux = Math.cos(b.rot), uz = Math.sin(b.rot), rec = { x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, ux, uz, kind: b.kind };
    // in every 32 m cell its bounding square touches
    B.push(rec); const r = Math.hypot(rec.hw, rec.hd);
    for (let j = Math.floor((b.z - r) / 32); j <= Math.floor((b.z + r) / 32); j++) for (let i = Math.floor((b.x - r) / 32); i <= Math.floor((b.x + r) / 32); i++) bg.add(i * 32 + 1, j * 32 + 1, rec);
  }
  // the real buildings (OSM outlines, build/world/osmbuildings.mjs) as polygons, in every 32 m cell their bounding box touches
  for (const [key, t] of Object.entries(bld?.tiles || {})) for (const b of readRealTile(key, t)) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of b.rings[0]) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    const rec = { poly: b.rings, x: (x0 + x1) / 2, z: (z0 + z1) / 2, kind: b.kind, uid: b.uid };
    B.push(rec);
    for (let j = Math.floor(z0 / 32); j <= Math.floor(z1 / 32); j++) for (let i = Math.floor(x0 / 32); i <= Math.floor(x1 / 32); i++) bg.add(i * 32 + 1, j * 32 + 1, rec);
  }
  // road segments (each segment once per 16 m cell it passes)
  const sg = new Grid(16);
  roads.forEach((r, ri) => { for (let i = 0; i + 1 < r.x.length; i++) {
    const n = Math.max(1, Math.ceil(Math.hypot(r.x[i + 1] - r.x[i], r.z[i + 1] - r.z[i]) / 8)), seen = new Set();
    for (let k = 0; k <= n; k++) { const x = r.x[i] + (r.x[i + 1] - r.x[i]) * k / n, z = r.z[i] + (r.z[i + 1] - r.z[i]) * k / n, c = Math.floor(x / 16) * 7919 + Math.floor(z / 16); if (seen.has(c)) continue; seen.add(c); sg.add(x, z, [ri, i]); }
  } });
  // crossings (as boxes along their arms) and signal poles, from the junctions
  const cross = new Grid(32), poles = new Grid(32);
  for (const j of junctions) for (const a of j.arms) {
    const dx = Math.cos(a.ang), dz = Math.sin(a.ang);
    if (a.cross) { const { s0, len } = crossingSpan(a), c = { x: j.x, z: j.z, dx, dz, s0, s1: s0 + len, lat: a.half + a.w }; cross.add(j.x + dx * (s0 + len / 2), j.z + dz * (s0 + len / 2), c); }
    if (hasSignal(j, a)) { const f = signalFoot(a), p = { x: j.x + f[0], z: j.z + f[1], dx, dz, half: a.half, jx: j.x, jz: j.z }; poles.add(p.x, p.z, p); }
  }
  const placed = new Grid(16);
  // the graded ground (build/world/grade.mjs) under a point, bilinear like region.js regionHeight
  const groundY = (x, z) => { const fx = (x - R.x0) / R.g, fz = (z - R.z0) / R.g, i = Math.max(0, Math.min(R.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(R.nz - 2, Math.floor(fz))), u = fx - i, v = fz - j, k = j * R.nx + i, h = R.h; return ((h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + R.nx] * (1 - u) + h[k + R.nx + 1] * u) * v) / 10; };
  const water = (x, z) => { const i = Math.floor((x - R.x0) / R.g), k = Math.floor((z - R.z0) / R.g); return i >= 0 && k >= 0 && i < R.nx && k < R.nz && R.water[k * R.nx + i] > 0; };
  // signed distance from (x, z) to the nearest building wall (negative inside), and that building
  const bdist = (x, z, reach = 12) => {
    let best = 1e9, who = null; const seen = new Set();
    for (const b of bg.near(x, z, reach)) {
      if (seen.has(b)) continue; seen.add(b);
      if (b.poly) { const r = polyDist(x, z, b.poly); if (r.d < best) { best = r.d; who = { b, ...r }; } continue; }
      const px = x - b.x, pz = z - b.z, u = px * b.ux + pz * b.uz, v = -px * b.uz + pz * b.ux, du = Math.abs(u) - b.hw, dv = Math.abs(v) - b.hd;
      const d = du > 0 || dv > 0 ? Math.hypot(Math.max(du, 0), Math.max(dv, 0)) : Math.max(du, dv);
      if (d < best) { best = d; who = { b, u, v }; }
    }
    return { d: best, who };
  };
  // the distance from (x, z) to the edge of any carriageway but line `ri` at about height y (negative: on it), and the lowest road passing over between y + lo and y + hi
  const roadsNear = (x, z, ri, y, lo, hi) => {
    let gap = 1e9, over = false;
    for (const [rj, i] of sg.near(x, z, 16)) {
      const o = roads[rj], dx = o.x[i + 1] - o.x[i], dz = o.z[i + 1] - o.z[i], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - o.x[i]) * dx + (z - o.z[i]) * dz) / l2));
      const d = Math.hypot(x - (o.x[i] + dx * t), z - (o.z[i] + dz * t)) - o.half, oy = o.y[i] + (o.y[i + 1] - o.y[i]) * t;
      if (oy - y > lo && oy - y < hi && d < 2) over = true;
      if (rj !== ri && Math.abs(oy - y) <= 4 && d < gap) gap = d;
    }
    return { gap, over };
  };
  // is (x, z) on a crossing or within m metres of one
  const onCrossing = (x, z, m) => {
    for (const c of cross.near(x, z, 40)) {
      const px = x - c.x, pz = z - c.z, s = px * c.dx + pz * c.dz, lat = -px * c.dz + pz * c.dx;
      if (s > c.s0 - m && s < c.s1 + m && Math.abs(lat) < c.lat + m) return true;
    }
    return false;
  };
  const nearPole = (x, z, d) => { for (const p of poles.near(x, z, d)) if (Math.hypot(p.x - x, p.z - z) < d) return p; return null; };
  // does a tree at (x, z) stand between the drivers arriving on an arm and its signal head (within 30 m before the stop line, on the arriving side)
  const hidesSignal = (x, z) => {
    for (const p of poles.near(x, z, 34)) {
      const px = x - p.jx, pz = z - p.jz, s = px * p.dx + pz * p.dz, lat = -px * p.dz + pz * p.dx;
      if (s > 0 && s < 34 && lat < 0 && lat > -(p.half + 4)) return true;
    }
    return false;
  };
  const nearPlaced = (x, z, d, type) => { for (const q of placed.near(x, z, d)) if (q.t === type && Math.hypot(q.x - x, q.z - z) < d) return q; return null; };
  // in front of the middle of a frontage: the door of a house or shop (+-1.5 m), the driveway of a large building (+-4 m), within 8 m of the wall
  const entrance = (x, z, half) => {
    const { d, who } = bdist(x, z, 14); if (!who || d > 8) return false;
    const { b, u, v } = who, big = b.kind === KIND.apartment || b.kind === KIND.office || b.kind === KIND.tower || b.kind === KIND.industrial;
    // a real outline: in front of the middle of the wall nearest (only walls long enough to have a door, 3 m+)
    if (b.poly) return d > 0 && who.len >= 3 && Math.abs(who.s) < (big ? 4 : 1.5) + half;
    return Math.abs(v) > b.hd && Math.abs(u) < (big ? 4 : 1.5) + half;
  };
  // the nearest carriageway within r: its line, the distance from its edge (negative: on it) and the unit direction from the point toward its centre;
  // surface: leave out the segments in a tunnel (a stop or a crossing on the street above one belongs to the street)
  const nearestRoad = (x, z, r, surface = false) => {
    let best = null;
    for (const [rj, i] of sg.near(x, z, r)) {
      if (surface && (roads[rj].cls[i] === 2 || roads[rj].cls[i + 1] === 2)) continue;
      const o = roads[rj], dx = o.x[i + 1] - o.x[i], dz = o.z[i + 1] - o.z[i], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - o.x[i]) * dx + (z - o.z[i]) * dz) / l2));
      const ex = o.x[i] + dx * t - x, ez = o.z[i] + dz * t - z, d = Math.hypot(ex, ez), l = Math.sqrt(l2);
      // also the foot on the centre line, the line's direction there and its height (where a record is set against the kerb)
      if (d - o.half < r && (!best || d - o.half < best.gap)) best = { ri: rj, i, gap: d - o.half, nx: ex / (d || 1), nz: ez / (d || 1), fx: x + ex, fz: z + ez, tx: dx / l, tz: dz / l, y: o.y[i] + (o.y[i + 1] - o.y[i]) * t };
    }
    return best;
  };
  // a crossing away from junctions (streetpoints.mjs midCrossings): a box across its road, in the frame the junction crossings use
  const addCross = (c) => cross.add(c.x, c.z, { x: c.x, z: c.z, dx: c.tx, dz: c.tz, s0: -c.wid / 2, s1: c.wid / 2, lat: c.half + 3 });
  return { B, groundY, water, bdist, roadsNear, nearestRoad, onCrossing, nearPole, hidesSignal, nearPlaced, entrance, addCross, add: (rec) => placed.add(rec.x, rec.z, rec) };
}

// walk one side of a pavement run: the polyline of the kerb, offset `lat` from the road's centre line, with arc length (for stations)
function sideOf(L, r, sd, lat) {
  const P = [];
  for (let i = r.i0; i <= r.i1; i++) {
    const a = Math.max(0, i - 1), b = Math.min(L.x.length - 1, i + 1); let tx = L.x[b] - L.x[a], tz = L.z[b] - L.z[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    P.push({ x: L.x[i] + tz * sd * lat, z: L.z[i] - tx * sd * lat, y: L.y[i], cls: L.cls[i], tx, tz, s: 0 });
  }
  for (let k = 1; k < P.length; k++) P[k].s = P[k - 1].s + Math.hypot(L.x[r.i0 + k] - L.x[r.i0 + k - 1], L.z[r.i0 + k] - L.z[r.i0 + k - 1]);
  // the station at arc length s (measured along the centre line, as the trims are)
  const at = (s) => {
    let k = 0; while (k < P.length - 2 && P[k + 1].s < s) k++;
    const A = P[k], B = P[k + 1] || A, t = Math.max(0, Math.min(1, (s - A.s) / ((B.s - A.s) || 1)));
    return { x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t, y: A.y + (B.y - A.y) * t, cls: t < 0.5 ? A.cls : B.cls, tx: A.tx, tz: A.tz };
  };
  return { at, len: P[P.length - 1].s };
}

// place the lamps and trees of all runs; returns the items ({ t, x, z, y, yaw, v, bridge, ri, ti, tj }) and the count of refusals by reason and type
// rec: the street records (streets.mjs): `points` (bus stops, entrances, benches...), `cross` (crossing records) and `used` (those a junction arm took)
export function placeFurniture(R, bld, junctions, runs, tileOf, realTrees = [], rec = null) {
  const roads = R.roads, J = makeJudge(R, bld, junctions), items = [], why = { lamp: {}, tree: {}, point: {}, mid: {} }, no = (t, k) => { why[t][k] = (why[t][k] || 0) + 1; return false; };
  // ---- the records first (streetpoints.mjs): the crossings away from junctions, then the stops, entrances and small things, so lamps and trees keep off them
  const mids = rec ? midCrossings(J, roads, junctions, rec.cross || [], rec.used || new Set(), why.mid) : [];
  for (const c of mids) J.addCross(c);
  if (rec) for (const it of placePoints(J, roads, rec.points || [], why.point)) items.push(it);
  // the ends of runs that are junctions (a tree keeps the sight triangle there clear)
  const jEnds = new Set(); for (const j of junctions) for (const a of j.arms) jEnds.add(a.ri + ':' + a.i);
  const order = runs.map((r, q) => q).sort((a, b) => rankOf(roads[runs[a].ri].hw) - rankOf(roads[runs[b].ri].hw) || a - b);
  // ---- lamps
  for (const q of order) {
    const r = runs[q], L = roads[r.ri], rk = rankOf(L.hw), H = LAMP_H[rk], S = LAMP_GAP[rk], W = 2 * L.half;
    if (rk > 3) continue;
    // the lighting arrangement of the carriageway: one side, staggered, or opposite pairs
    const mode = W < 12 ? 'one' : W < 20 ? 'stagger' : 'pair', oneSide = (r.m & 3) === 3 ? (hash(r.ri, 31) < 0.5 ? -1 : 1) : (r.m & 1 ? -1 : 1);
    for (const sd of [-1, 1]) {
      if (!(r.m & (sd < 0 ? 1 : 2))) continue;
      if (mode === 'one' && sd !== oneSide) continue;
      const lat = L.half + 0.6, side = sideOf(L, r, sd, lat), s0 = r.ta[sd < 0 ? 0 : 1], s1 = side.len - r.tb[sd < 0 ? 0 : 1];
      // stations measured from the line's start so that the stagger continues across runs and tiles
      let base = 0; for (let i = 0; i < r.i0; i++) base += Math.hypot(L.x[i + 1] - L.x[i], L.z[i + 1] - L.z[i]);
      const shift = (mode === 'stagger' && sd > 0 ? S / 2 : 0) + hash(r.ri, 5) * S;
      for (let n = Math.ceil((base + s0 + 3 - shift) / S); ; n++) {
        const nominal = n * S + shift - base; if (nominal > s1 - 3) break;
        // try the nominal spot, then up to a quarter interval either way
        let ok = null, first = null;
        for (const off of [0, 2, -2, 4, -4, 6, -6, 8, -8].filter((o) => Math.abs(o) <= S / 4)) {
          const s = nominal + off; if (s < s0 + 3 || s > s1 - 3) continue;
          const st = side.at(s), res = lampAt(J, st, r.ri, H, S, sd, L);
          if (res === true) { ok = st; break; } if (first === null) first = res;
        }
        if (!ok) { no('lamp', first || 'end'); continue; }
        // (ix, iz) points toward the road: minus the outward side (tz, -tx) * sd
        const it = { t: 0, x: ok.x, z: ok.z, y: ok.y, ix: -ok.tz * sd, iz: ok.tx * sd, v: rk, bridge: ok.cls === 1 ? 1 : 0, ri: r.ri, S };
        J.add(it); items.push(it); why.lamp.placed = (why.lamp.placed || 0) + 1;
      }
    }
  }
  // ---- the map's street trees first, where the judge lets them stand (the size of each kept from its position, the species of the road beside it)
  why.realTree = {};
  for (const p of [...realTrees].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const y = J.groundY(p.x, p.z), seg = J.nearestRoad(p.x, p.z, 25), sp = seg ? speciesOf(seg.ri) : 0, SP = SPECIES[sp];
    const res = J.water(p.x, p.z) ? 'water' : J.bdist(p.x, p.z).d < 0.4 ? 'building' : seg && seg.gap < 0.3 ? 'road' : J.nearPlaced(p.x, p.z, 1.5, 1) ? 'tree' : J.nearPlaced(p.x, p.z, 2.5, PTYPE.bus) || J.nearPlaced(p.x, p.z, 3, PTYPE.subway) ? 'stop' : true;
    if (res !== true) { why.realTree[res] = (why.realTree[res] || 0) + 1; continue; }
    const ix = seg ? seg.nx : 1, iz = seg ? seg.nz : 0;
    const it = { t: 1, x: p.x, z: p.z, y, ix, iz, v: sp | (Math.floor(hash(Math.round(p.x * 3), Math.round(p.z * 3)) * 8) << 2) | 32, bridge: 0, ri: seg ? seg.ri : -1, r: SP.r, real: true };
    J.add(it); items.push(it); why.realTree.placed = (why.realTree.placed || 0) + 1;
  }
  // ---- trees
  for (const q of order) {
    const r = runs[q], L = roads[r.ri], rk = rankOf(L.hw), w = r.w / 10, sp = speciesOf(r.ri), SP = SPECIES[sp];
    if (rk > 2) { continue; }
    if (w < TREE_MIN_WALK) { no('tree', 'need'); continue; }
    for (const sd of [-1, 1]) {
      if (!(r.m & (sd < 0 ? 1 : 2))) continue;
      const lat = L.half + 1.05, side = sideOf(L, r, sd, lat), s0 = r.ta[sd < 0 ? 0 : 1], s1 = side.len - r.tb[sd < 0 ? 0 : 1];
      const endA = jEnds.has(r.ri + ':' + r.i0), endB = jEnds.has(r.ri + ':' + r.i1);
      for (let s = s0 + 2 + hash(r.ri * 2 + (sd > 0 ? 1 : 0), 17) * SP.gap; s < s1 - 2; s += 1) {
        // the sight triangle of a junction: no tree within 8 m of the corner
        if ((endA && s < s0 + 8) || (endB && s > s1 - 8)) { no('tree', 'corner'); s += SP.gap - 1; continue; }
        const st = side.at(s), res = treeAt(J, st, r.ri, SP);
        if (res !== true) { no('tree', res); continue; }   // move on by a metre and judge again
        const it = { t: 1, x: st.x, z: st.z, y: st.y, ix: -st.tz * sd, iz: st.tx * sd, v: sp | (Math.floor(hash(Math.round(st.x * 3), Math.round(st.z * 3)) * 8) << 2), bridge: 0, ri: r.ri, r: SP.r };
        J.add(it); items.push(it); why.tree.placed = (why.tree.placed || 0) + 1;
        s += SP.gap - 1;
      }
    }
  }
  for (const it of items) { const [ti, tj] = tileOf(it.x, it.z); it.ti = ti; it.tj = tj; }
  for (const c of mids) { const [ti, tj] = tileOf(c.x, c.z); c.ti = ti; c.tj = tj; }
  return { items, mids, why, judge: J };

  // a lamp pole at station st: true, or the reason it does not belong there
  function lampAt(J, st, ri, H, S, sd, L) {
    if (J.water(st.x, st.z)) return 'water';
    // off a deck the foot stands on the pavement, which lies on the ground: where the ground is far from the road (a cut slope, an embankment's edge) the
    // pole would hang in the air or stand buried
    if (st.cls !== 1 && Math.abs(J.groundY(st.x, st.z) - st.y) > 1.0) return 'ground';
    if (J.bdist(st.x, st.z).d < 0.4) return 'building';
    const rn = J.roadsNear(st.x, st.z, ri, st.y, 2.5, H + 2);
    if (rn.gap < 0.3) return 'road';
    if (rn.over) return 'overpass';
    if (J.onCrossing(st.x, st.z, 1.5)) return 'crossing';
    if (J.nearPole(st.x, st.z, 10)) return 'signal';
    // already lit: a lamp of this or another road within 60 % of this road's interval
    if (J.nearPlaced(st.x, st.z, S * 0.6, 0)) return 'lit';
    if (J.nearPlaced(st.x, st.z, 3.5, PTYPE.bus) || J.nearPlaced(st.x, st.z, 3.5, PTYPE.subway)) return 'stop';
    if (J.entrance(st.x, st.z, 0)) return 'entrance';
    void sd; void L;
    return true;
  }
  // a tree at station st: true, or the reason it does not belong there
  function treeAt(J, st, ri, SP) {
    if (st.cls === 1) return 'need';      // a bridge deck has no soil
    if (J.water(st.x, st.z)) return 'water';
    if (Math.abs(J.groundY(st.x, st.z) - st.y) > 1.0) return 'ground';
    const bd = J.bdist(st.x, st.z).d;
    if (bd < 0.4) return 'building';
    if (bd < SP.r * 0.8) return 'facade';
    const rn = J.roadsNear(st.x, st.z, ri, st.y, 1, 14);
    if (rn.gap < 0.8) return 'road';
    if (rn.over) return 'overpass';
    if (J.onCrossing(st.x, st.z, 4)) return 'crossing';
    if (J.nearPole(st.x, st.z, 6) || J.hidesSignal(st.x, st.z)) return 'signal';
    if (J.nearPlaced(st.x, st.z, 4, 0)) return 'lamp';
    if (J.nearPlaced(st.x, st.z, 3.5, PTYPE.bus) || J.nearPlaced(st.x, st.z, 3.5, PTYPE.subway) || J.nearPlaced(st.x, st.z, 1.5, PTYPE.vending)) return 'stop';
    if (J.nearPlaced(st.x, st.z, SP.gap * 0.8, 1)) return 'tree';
    if (J.entrance(st.x, st.z, SP.r * 0.5)) return 'entrance';
    return true;
  }
}
