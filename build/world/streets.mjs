// Street data of the capital region (WLD-24g-1): where the roads meet (junctions with their arms, signals and crossings) and where a road has pavement on
// its sides (runs of samples with a width). The geometry is made at run time from the road samples (src/streetscape.js); this file only decides, from the
// compiled network (region.bin) and the procedural buildings (buildings.bin), so that the decision is the same for every player and every run.
//   node build/world/streets.mjs [region.bin] [buildings.bin] [out dir]       writes streets.bin (a deflated bakefmt chunk) and streets-stats.json
// Junctions: the compiled lines are cut at every junction, so a junction is where line ends meet (within 5 m); a line that ends on the middle of another
// (a T) adds that line's two directions as arms. Pavement: urban places only (the number of buildings in the 3 x 3 tiles around), never in tunnels, never
// on motorways and ramps, and not in the keep zone (the hand-made city has its own until WLD-24c).
// Real records first (DATA-01, ADR-0042): a junction is signalled where the map has a signal or a signalled crossing at it, an arm has a crossing where the
// map has one on it, and the map's street trees stand where the judge lets them; the rules only fill in what the map does not say, and every decision keeps
// where it came from (junction flag bit 1, arm meta bit 6, tree variant bit 5) so the share of real records can be counted.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { encodeChunk, decodeChunk } from '../../src/bakefmt.js';
import { readRegion, KEEP, BAND } from './emit.mjs';
import { TILE, TILE_OFF, readBuildings } from './blocks.mjs';
import { trims, radiusOf, decodeTile } from '../../src/streetgeo.js';
import { placeFurniture } from './streetfurn.mjs';
import { readDetail } from './realdetail.mjs';
import { readSeoul } from './seouldata.mjs';

export { TILE, TILE_OFF };
// rank: 0 trunk / primary, 1 secondary, 2 tertiary, 3 street; 8 ramps and 9 motorways have no pavement and no crossing
export const RANK = { trunk: 0, primary: 0, secondary: 1, tertiary: 2, residential: 3, living_street: 3, unclassified: 3 };
const rankOf = (hw) => (hw in RANK ? RANK[hw] : hw.endsWith('_link') ? 8 : 9);
// pavement width in metres by rank (a Seoul main road has 3 - 5 m, a side street 1.5 - 2 m; the buildings stand 5.3 - 5.8 m from the carriageway edge, blocks.mjs)
export const WALK = [3.6, 3.2, 2.6, 1.8];
// buildings in the 3 x 3 tiles around (1.5 km square) from which a rank gets pavement
export const URBAN = [150, 150, 300, 600];
const CLUSTER = 5, ARM_LEN = 7;
const MAPPED = 6;   // records in the 600 m square around a junction that make its neighbourhood "mapped" (a few signalled junctions, each 2-4 nodes)

// buildings per tile -> the count of the 3 x 3 around
function urbanOf(bld) {
  const cnt = new Map(); for (const [k, t] of Object.entries(bld?.tiles || {})) cnt.set(k, t.n + (t.pn || 0));
  const memo = new Map();
  return (ti, tj) => { const k = ti + '_' + tj; let v = memo.get(k); if (v === undefined) { v = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) v += cnt.get((ti + a) + '_' + (tj + b)) || 0; memo.set(k, v); } return v; };
}

// the map's street points in 16 m cells, by kind: signal (a signal node or a signalled crossing), cross (any marked crossing), tree
function pointIndex(points) {
  const G = { signal: new Map(), cross: new Map(), tree: [] }, put = (m, p) => { const k = Math.floor(p.x / 16) * 100003 + Math.floor(p.z / 16); (m.get(k) || m.set(k, []).get(k)).push(p); };
  for (const p of points || []) {
    if (p.t === 'signal' || (p.t === 'crossing' && p.signal)) put(G.signal, p);
    if (p.t === 'crossing' && p.marked) put(G.cross, p);
    if (p.t === 'tree') G.tree.push(p);
  }
  // mappers who map signals or crossings map a whole neighbourhood: where the 600 m around a point holds enough of them, the map's silence means "none here"
  // (and the rule must not add one); elsewhere it means "not mapped" and the rule fills in
  const dens = (m) => { const c = new Map(); for (const l of m.values()) for (const p of l) { const k = Math.floor(p.x / 200) * 100003 + Math.floor(p.z / 200); c.set(k, (c.get(k) || 0) + 1); } return c; };
  const D = { signal: dens(G.signal), cross: dens(G.cross) };
  G.mapped = (kind, x, z, need) => { const c = D[kind], i = Math.floor(x / 200), j = Math.floor(z / 200); let n = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) n += c.get((i + a) * 100003 + j + b) || 0; return n >= need; };
  G.near = (m, x, z, r) => { const out = []; for (let b = Math.floor((z - r) / 16); b <= Math.floor((z + r) / 16); b++) for (let a = Math.floor((x - r) / 16); a <= Math.floor((x + r) / 16); a++) for (const p of m.get(a * 100003 + b) || []) if (Math.hypot(p.x - x, p.z - z) <= r) out.push(p); return out; };
  return G;
}

// detail: readDetail()'s result (the map's records), or null for rules only
export function makeStreets(R, bld, detail = null) {
  const roads = R.roads, urb = urbanOf(bld), keepR = KEEP + BAND, PI = pointIndex(detail?.points);
  const tileOf = (x, z) => [Math.floor(x / TILE) + TILE_OFF, Math.floor(z / TILE) + TILE_OFF];
  const urbanAt = (x, z) => { const [a, b] = tileOf(x, z); return urb(a, b); };
  // ---- which sides of which segments have pavement (sample i to i + 1), per line: bit 0 the left, bit 1 the right side of the line's direction
  // A side is left bare where another road's carriageway lies under the strip (the median of a dual carriageway drawn as two lines, a road running alongside).
  const SEG = new Map(), SC = 16, kc = (a, b) => a * 100003 + b;
  roads.forEach((r, ri) => { for (let i = 0; i + 1 < r.x.length; i++) {
    const n = Math.max(1, Math.ceil(Math.hypot(r.x[i + 1] - r.x[i], r.z[i + 1] - r.z[i]) / 8)), seen = new Set();
    for (let k = 0; k <= n; k++) { const x = r.x[i] + (r.x[i + 1] - r.x[i]) * k / n, z = r.z[i] + (r.z[i + 1] - r.z[i]) * k / n, c = kc(Math.floor(x / SC), Math.floor(z / SC)); if (seen.has(c)) continue; seen.add(c); (SEG.get(c) || SEG.set(c, []).get(c)).push(ri, i); }
  } });
  // the distance from (x, z) to the nearest other carriageway edge: negative when the point is on it
  const gapTo = (x, z, ri, y, skip) => {
    let best = 1e9; const cx = Math.floor(x / SC), cz = Math.floor(z / SC);
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const list = SEG.get(kc(cx + a, cz + b)); if (!list) continue;
      for (let q = 0; q < list.length; q += 2) {
        const rj = list[q], j = list[q + 1]; if (rj === ri) continue; const o = roads[rj];
        if (skip && skip.has(rj)) continue;
        if (Math.abs((o.y[j] + o.y[j + 1]) / 2 - y) > 4) continue;   // another level: a bridge over the street
        const dx = o.x[j + 1] - o.x[j], dz = o.z[j + 1] - o.z[j], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - o.x[j]) * dx + (z - o.z[j]) * dz) / l2));
        const d = Math.hypot(x - (o.x[j] + dx * t), z - (o.z[j] + dz * t)) - o.half; if (d < best) best = d;
      } }
    return best;
  };
  const pave = roads.map((r, ri) => {
    const rk = rankOf(r.hw), n = r.x.length, ok = new Uint8Array(Math.max(0, n - 1)); if (rk > 3) return ok;
    // arc length from each end: close to a junction the other arms are meant to be near (the corners are shaped there)
    const sl = [0]; for (let i = 1; i < n; i++) sl.push(sl[i - 1] + Math.hypot(r.x[i] - r.x[i - 1], r.z[i] - r.z[i - 1]));
    for (let i = 0; i + 1 < n; i++) {
      const mx = (r.x[i] + r.x[i + 1]) / 2, mz = (r.z[i] + r.z[i + 1]) / 2;
      if (!(r.cls[i] !== 2 && r.cls[i + 1] !== 2 && Math.max(Math.abs(mx), Math.abs(mz)) >= keepR && urbanAt(mx, mz) >= URBAN[rk])) continue;
      let m = 3;
      const sm = (sl[i] + sl[i + 1]) / 2;
      if (sm > 30 && sl[n - 1] - sm > 30) {
        const tx = r.x[i + 1] - r.x[i], tz = r.z[i + 1] - r.z[i], l = Math.hypot(tx, tz) || 1, off = r.half + WALK[rk] / 2, y = (r.y[i] + r.y[i + 1]) / 2;
        // left of the direction is -(tz, -tx) in the frame the renderer uses (right = (tz, -tx))
        if (gapTo(mx - tz / l * off, mz + tx / l * off, ri, y) < WALK[rk] / 2 + 0.2) m &= ~1;
        if (gapTo(mx + tz / l * off, mz - tx / l * off, ri, y) < WALK[rk] / 2 + 0.2) m &= ~2;
      }
      ok[i] = m;
    }
    return ok;
  });
  // ---- line ends -> junctions
  // ---- line ends -> junctions
  const arms = [];   // { ri, i, x, z, dx, dz, dirn (+1: the arm runs toward higher samples), virt }
  const armKey = new Set();
  const addArm = (ri, i, dirn, virt) => {
    const r = roads[ri], n = r.x.length, key = ri + ':' + i + ':' + dirn; if (armKey.has(key)) return; armKey.add(key);
    let k = i, d = 0; while (k + dirn >= 0 && k + dirn < n && d < ARM_LEN) { k += dirn; d = Math.hypot(r.x[k] - r.x[i], r.z[k] - r.z[i]); }
    if (d < 1) return;
    arms.push({ ri, i, x: r.x[i], z: r.z[i], dx: (r.x[k] - r.x[i]) / d, dz: (r.z[k] - r.z[i]) / d, dirn, virt });
  };
  roads.forEach((r, ri) => {
    const n = r.x.length; if (n < 2) return;
    addArm(ri, 0, 1, false); addArm(ri, n - 1, -1, false);
    // a line that ends on the middle of another: the other's two directions are arms there
    for (const [list, i0] of [[r.prev, 0], [r.next, n - 1]]) for (const [lj, i] of list) {
      const o = roads[lj]; if (!o || i <= 0 || i >= o.x.length - 1) continue;
      if (Math.hypot(o.x[i] - r.x[i0], o.z[i] - r.z[i0]) > 9) continue;
      addArm(lj, i, 1, true); addArm(lj, i, -1, true);
    }
  });
  // cluster the arms by their feet (union-find over a hash of 8 m cells)
  const par = Int32Array.from(arms, (_, i) => i), find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const cell = new Map(), CS = 8;
  arms.forEach((a, q) => { const k = Math.floor(a.x / CS) * 100003 + Math.floor(a.z / CS); (cell.get(k) || cell.set(k, []).get(k)).push(q); });
  arms.forEach((a, q) => {
    const cx = Math.floor(a.x / CS), cz = Math.floor(a.z / CS);
    for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const p of cell.get((cx + c) * 100003 + cz + b) || []) {
      if (p <= q || Math.hypot(arms[p].x - a.x, arms[p].z - a.z) > CLUSTER) continue;
      const u = find(q), v = find(p); if (u !== v) par[Math.max(u, v)] = Math.min(u, v);
    }
  });
  const groups = new Map(); arms.forEach((a, q) => { const g = find(q); (groups.get(g) || groups.set(g, []).get(g)).push(a); });
  const junctions = [], armOf = new Map();   // armOf: 'line:sample:dirn' -> the arm record (trims for the pavement runs)
  for (const g of [...groups.keys()].sort((a, b) => a - b)) {
    const list = groups.get(g); if (list.length < 3) continue;
    let x = 0, z = 0, y = 0; for (const a of list) { x += a.x; z += a.z; y += roads[a.ri].y[a.i]; } x /= list.length; z /= list.length; y /= list.length;
    if (Math.max(Math.abs(x), Math.abs(z)) < keepR) continue;
    // not on a bridge or in a tunnel; not where only ramps and motorways meet
    if (list.some((a) => roads[a.ri].cls[a.i] || roads[a.ri].cls[Math.max(0, a.i - 1)] || roads[a.ri].cls[Math.min(roads[a.ri].cls.length - 1, a.i + 1)])) continue;
    const ranks = list.map((a) => rankOf(roads[a.ri].hw)); if (ranks.every((k) => k >= 8)) continue;
    const u = urbanAt(x, z), a2 = ranks.filter((k) => k <= 2).length, best = Math.min(...ranks);
    // a signal or signalled crossing of the map within the junction (its arms' widths plus the crossing set back from the corner)
    const reach = Math.max(...list.map((a) => roads[a.ri].half)) + 14, sigReal = PI.near(PI.signal, x, z, reach).length > 0, sigMapped = !sigReal && PI.mapped('signal', x, z, MAPPED);
    const signal = sigReal || (!sigMapped && u >= URBAN[0] && list.length >= 3 && (a2 >= 3 || (a2 >= 2 && best <= 1)));
    // the arms around the centre, from the centre of the junction (a line end can be a few metres off it)
    for (const a of list) { a.ang = Math.atan2(a.z + a.dz * 3 - z, a.x + a.dx * 3 - x); }
    list.sort((p, q) => p.ang - q.ang);
    const J = { x, z, y, signal, sigReal, sigMapped, urban: u, arms: [] };
    for (const a of list) {
      const r = roads[a.ri], rk = rankOf(r.hw), seg = a.dirn > 0 ? a.i : a.i - 1, w = rk <= 3 && pave[a.ri][seg] ? WALK[rk] : 0;
      // traffic of a one-way line leaves a junction along its direction and arrives against it
      const flow = r.oneway ? (a.dirn > 0 ? 1 : 2) : 0;
      // a crossing of the map on this arm: within 30 m of the centre along it, over its carriageway
      // (a crossing node sits on the carriageway's centre line, a few metres to 40 m back from the junction's centre on a wide road)
      const ax = Math.cos(a.ang), az = Math.sin(a.ang), crossReal = rk <= 3 && PI.near(PI.cross, x, z, 42).some((p) => { const s = (p.x - x) * ax + (p.z - z) * az, l = -(p.x - x) * az + (p.z - z) * ax; return s > -2 && s < 40 && Math.abs(l) < r.half + 3; });
      const crossMapped = !crossReal && PI.mapped('cross', x, z, MAPPED);
      const arm = { ri: a.ri, i: a.i, dirn: a.dirn, ang: a.ang, half: r.half, rank: rk, flow, w, cross: crossReal || (!crossMapped && rk <= 3 && u >= URBAN[rk] * 0.5), crossReal, crossMapped, tl: 0, tr: 0, d: Math.hypot(a.x - x, a.z - z) };
      J.arms.push(arm); armOf.set(a.ri + ':' + a.i + ':' + a.dirn, arm);
    }
    const T = trims(J.arms, radiusOf(J.arms)).trims; J.arms.forEach((arm, k) => { arm.tl = T[k].tl; arm.tr = T[k].tr; });
    junctions.push(J);
  }
  // ---- road markings decided per arm (WLD-24g-2): which way each arriving lane may go, whether the approach is long enough for one or two sets of lane
  // arrows, the diamond that warns of an unsignalled crossing, and the central bus lanes of the busiest arterials
  markings(roads, junctions, urbanAt);
  // ---- pavement runs: consecutive paved segments of a line in one tile, cut where another road meets the middle of the line, with the trims at the ends
  const cut = new Set(); for (const k of armOf.keys()) { const [ri, i] = k.split(':').map(Number); if (i > 0 && i < roads[ri].x.length - 1) cut.add(ri + ':' + i); }
  const runs = [];
  const q10 = (m) => Math.min(255, Math.round(m * 10));
  roads.forEach((r, ri) => {
    const rk = rankOf(r.hw); if (rk > 3) return;
    const n = r.x.length; let cur = null;
    const flush = (end) => {
      if (cur && cur.i1 > cur.i0) {
        // the trims at the two ends, from the arms that start there; the left side of an arm that points back along the line is the right side of the line
        const A = armOf.get(ri + ':' + cur.i0 + ':1'), B = armOf.get(ri + ':' + cur.i1 + ':-1');
        // a trim is measured from the junction's centre; the run starts at the line's end sample, `d` metres from it
        cur.ta = A ? [Math.max(0, A.tl - A.d), Math.max(0, A.tr - A.d)] : [0, 0]; cur.tb = B ? [Math.max(0, B.tr - B.d), Math.max(0, B.tl - B.d)] : [0, 0];
        // a short link between two junctions can be eaten whole by the corners at both ends: nothing to draw
        let len = 0; for (let i = cur.i0; i < cur.i1; i++) len += Math.hypot(roads[ri].x[i + 1] - roads[ri].x[i], roads[ri].z[i + 1] - roads[ri].z[i]);
        if (((cur.m & 1) && len - cur.ta[0] - cur.tb[0] >= 1) || ((cur.m & 2) && len - cur.ta[1] - cur.tb[1] >= 1)) runs.push(cur);
      }
      cur = null; void end;
    };
    for (let i = 0; i + 1 < n; i++) {
      const [ti, tj] = tileOf(r.x[i], r.z[i]);
      if (!pave[ri][i]) { flush(); continue; }
      if (cur && cur.ti === ti && cur.tj === tj && cur.i1 === i && cur.m === (pave[ri][i] | (r.bus ? 4 : 0)) && !cut.has(ri + ':' + i)) cur.i1 = i + 1; else { flush(); cur = { ri, i0: i, i1: i + 1, w: q10(WALK[rk]), ti, tj, m: pave[ri][i] | (r.bus ? 4 : 0) }; }
    }
    flush();
  });
  void q10;
  // ---- lamps and trees, each judged against what is around it (streetfurn.mjs)
  const { items, why, judge } = placeFurniture(R, bld, junctions, runs, tileOf, PI.tree);
  return { junctions, runs, items, why, judge };
}

// lane arrows: a lane may turn left (1), go straight (2) or turn right (4); `mark` bits: 1 a set of arrows 4 m behind the stop line, 2 a second set 30 m
// further back, 4 a crossing-ahead diamond, 8 the arm carries a central bus lane; bits 4-6 the number of arriving lanes
export const TURN = { L: 1, S: 2, R: 4 }, LANE_W = 3.75;
const NEAR_ROOM = 30, FAR_ROOM = 62, DIAMOND_ROOM = 55;
// the central bus lanes of Seoul run on the wide arterials of the dense districts: two-way trunk / primary roads with three lanes or more each way
function busLine(r, urbanAt) {
  if (!(r.hw === 'trunk' || r.hw === 'primary') || r.oneway || Math.ceil((r.lanes || 0) / 2) < 3) return false;
  const m = Math.floor(r.x.length / 2); return urbanAt(r.x[m], r.z[m]) >= URBAN[0] * 3;
}
function markings(roads, junctions, urbanAt) {
  for (const r of roads) r.bus = busLine(r, urbanAt);
  const ends = new Set(); for (const J of junctions) for (const a of J.arms) ends.add(a.ri + ':' + a.i);
  // the length of an arm's road up to the next junction or the line's end (where arrows have room)
  const room = (a) => { const r = roads[a.ri]; let d = 0, k = a.i; while (k + a.dirn >= 0 && k + a.dirn < r.x.length) { const n = k + a.dirn; d += Math.hypot(r.x[n] - r.x[k], r.z[n] - r.z[k]); k = n; if (ends.has(a.ri + ':' + k)) break; if (d > 200) break; } return d; };
  for (const J of junctions) for (const a of J.arms) {
    const r = roads[a.ri]; a.arr = 0; a.mark = 0;
    if (a.rank > 2 || a.flow === 1) continue;   // only collectors and up get arrows; no traffic arrives on an arm a one-way road leaves along
    const n = Math.max(1, Math.min(4, r.oneway ? r.lanes || 1 : Math.ceil((r.lanes || 2) / 2))), tx = -Math.cos(a.ang), tz = -Math.sin(a.ang);
    // where the arriving driver can go: the other arms that traffic may enter, by their angle to the direction of travel (right = (-tz, tx), as streetscape.js)
    let has = 0;
    for (const b of J.arms) {
      if (b === a || b.flow === 2 || b.rank > 3) continue;
      const ex = Math.cos(b.ang), ez = Math.sin(b.ang), c = tx * ex + tz * ez, sn = tx * ez - tz * ex;
      if (c > Math.cos(0.6)) has |= TURN.S; else if (c > Math.cos(2.7)) has |= sn > 0 ? TURN.R : TURN.L;
    }
    if (!has) continue;
    // lanes from the driver's left: the inner lane turns left, the outer one right (with straight on when there is a straight), the rest go straight; a
    // central bus lane is the inner lane and goes straight (at a T it turns with the road), and the arrows of the others start one lane out
    const bus = r.bus && !r.oneway && n >= 3, m = bus ? n - 1 : n, lane = [];
    if (bus) lane.push(has & TURN.S ? TURN.S : has & TURN.L ? TURN.L : TURN.R);   // at a T the bus lane turns with the road
    for (let k = 0; k < m; k++) {
      let t;
      if (m === 1) t = has;
      else if (k === 0) t = has & TURN.L ? TURN.L : has & TURN.S ? TURN.S : TURN.R;
      else if (k === m - 1) t = has & TURN.R ? (has & TURN.S ? TURN.S | TURN.R : TURN.R) : has & TURN.S ? TURN.S : TURN.L;
      else t = has & TURN.S ? TURN.S : k < m / 2 ? (has & TURN.L ? TURN.L : TURN.R) : (has & TURN.R ? TURN.R : TURN.L);
      lane.push(t);
    }
    lane.forEach((t, k) => { a.arr |= t << (3 * k); });
    const len = room(a);
    if (len >= NEAR_ROOM) a.mark |= 1;
    if (len >= FAR_ROOM) a.mark |= 2;
    if (a.cross && !J.signal && len >= DIAMOND_ROOM) a.mark |= 4;
    if (bus) a.mark |= 8;
    a.mark |= n << 4;
  }
}

// ---- tiles: the records of 512 m tiles as typed arrays (junction centres and run starts decide the tile), relative to the tile centre
export function toTiles(res) {
  const by = new Map(), get = (ti, tj) => { const k = ti + '_' + tj; return by.get(k) || by.set(k, { J: [], R: [], F: [] }).get(k); };
  for (const J of res.junctions) get(Math.floor(J.x / TILE) + TILE_OFF, Math.floor(J.z / TILE) + TILE_OFF).J.push(J);
  for (const r of res.runs) get(r.ti, r.tj).R.push(r);
  for (const f of res.items || []) get(f.ti, f.tj).F.push(f);
  const tiles = {}, u10 = (m) => Math.min(255, Math.round(m * 10));
  for (const key of [...by.keys()].sort()) {
    const [ti, tj] = key.split('_').map(Number), ox = (ti - TILE_OFF) * TILE + TILE / 2, oz = (tj - TILE_OFF) * TILE + TILE / 2, { J, R, F } = by.get(key), nf = F.length;
    const nj = J.length, na = J.reduce((s, j) => s + j.arms.length, 0), nr = R.length;
    const t = { nj, jx: new Int16Array(nj), jz: new Int16Array(nj), jy: new Int16Array(nj), jf: new Uint8Array(nj), jn: new Uint8Array(nj), jo: new Int32Array(nj + 1),
      na, aang: new Uint16Array(na), ahalf: new Uint8Array(na), ameta: new Uint8Array(na), aw: new Uint8Array(na), atl: new Uint8Array(na), atr: new Uint8Array(na), aline: new Int32Array(na), aarr: new Uint16Array(na), amark: new Uint8Array(na),
      nr, rline: new Int32Array(nr), ri0: new Uint16Array(nr), ri1: new Uint16Array(nr), rw: new Uint8Array(nr), rm: new Uint8Array(nr), rta: new Uint8Array(nr * 2), rtb: new Uint8Array(nr * 2),
      nf, ft: new Uint8Array(nf), fx: new Int16Array(nf), fz: new Int16Array(nf), fy: new Int16Array(nf), fdir: new Uint8Array(nf), fv: new Uint8Array(nf) };
    let q = 0;
    J.forEach((j, k) => {
      t.jx[k] = Math.round((j.x - ox) * 10); t.jz[k] = Math.round((j.z - oz) * 10); t.jy[k] = Math.round(j.y * 10); t.jf[k] = (j.signal ? 1 : 0) | (j.sigReal ? 2 : 0); t.jn[k] = j.arms.length; t.jo[k] = q;
      for (const a of j.arms) {
        t.aang[q] = Math.round(((a.ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 65535); t.ahalf[q] = u10(a.half);
        t.ameta[q] = a.rank | (a.cross ? 4 : 0) | (a.flow << 3) | (a.crossReal ? 64 : 0); t.aw[q] = u10(a.w); t.atl[q] = u10(a.tl); t.atr[q] = u10(a.tr); t.aline[q] = a.ri; t.aarr[q] = a.arr || 0; t.amark[q] = a.mark || 0; q++;
      }
    });
    t.jo[nj] = q;
    R.forEach((r, k) => { t.rline[k] = r.ri; t.ri0[k] = r.i0; t.ri1[k] = r.i1; t.rw[k] = r.w; t.rm[k] = r.m; t.rta[k * 2] = u10(r.ta[0]); t.rta[k * 2 + 1] = u10(r.ta[1]); t.rtb[k * 2] = u10(r.tb[0]); t.rtb[k * 2 + 1] = u10(r.tb[1]); });
    // furniture: type (bit 7: on a bridge deck), position, the direction toward the road in 256 steps, the variant (lamp: rank; tree: species | size << 2)
    F.forEach((f, k) => { t.ft[k] = f.t | (f.bridge ? 128 : 0); t.fx[k] = Math.round((f.x - ox) * 10); t.fz[k] = Math.round((f.z - oz) * 10); t.fy[k] = Math.round(f.y * 10); t.fdir[k] = Math.round(((Math.atan2(f.iz, f.ix) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 256) & 255; t.fv[k] = f.v; });
    tiles[key] = t;
  }
  return tiles;
}

// a stored tile back to numbers (local metres): what the tests and the renderer read
export const readTile = decodeTile;

export function writeStreets(file, tiles, stats) {
  fs.writeFileSync(file, zlib.deflateRawSync(encodeChunk({ tile: TILE, off: TILE_OFF, tiles, stats }), { level: 9 }));
  return fs.statSync(file).size;
}
export function readStreets(file) {
  if (!fs.existsSync(file)) return null;
  return decodeChunk(new Uint8Array(zlib.inflateRawSync(fs.readFileSync(file))));
}

// how much of the street came from the map: signalled junctions, crossings and street trees with a record behind them, and the tiles still to be fetched
export function realShare(res) {
  const sig = res.junctions.filter((j) => j.signal), arms = res.junctions.flatMap((j) => j.arms.filter((a) => a.cross)), trees = res.items.filter((f) => f.t === 1);
  const share = (n, d) => +(n / Math.max(1, d)).toFixed(3);
  // a decision is backed by the map when the map says yes (a record) or says no (a mapped neighbourhood without one)
  const allArms = res.junctions.flatMap((j) => j.arms.filter((a) => a.rank <= 3));
  return { signals: share(sig.filter((j) => j.sigReal).length, sig.length), signalDecisions: share(res.junctions.filter((j) => j.sigReal || j.sigMapped).length, res.junctions.length),
    crossings: share(arms.filter((a) => a.crossReal).length, arms.length), crossingDecisions: share(allArms.filter((a) => a.crossReal || a.crossMapped).length, allArms.length), trees: share(trees.filter((f) => f.real).length, trees.length) };
}

// ---- command line
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'), dir = path.join(root, 'build/baked/world/capital');
  const file = process.argv[2] || path.join(dir, 'region.bin'), bfile = process.argv[3] || path.join(dir, 'buildings.bin'), out = process.argv[4] || dir;
  const R = readRegion(file); if (!R) { console.error('no region at ' + file); process.exit(1); }
  // the map's points and, inside Seoul, the city's own crossing and signal records (seouldata.mjs)
  const t0 = Date.now(), detail = readDetail(); detail.points = detail.points.concat(readSeoul());
  const res = makeStreets(R, readBuildings(bfile), detail), tiles = toTiles(res);
  const km = res.runs.reduce((s, r) => { const L = R.roads[r.ri]; let d = 0; for (let i = r.i0; i < r.i1; i++) d += Math.hypot(L.x[i + 1] - L.x[i], L.z[i + 1] - L.z[i]); return s + d; }, 0) / 1000;
  const sig = res.junctions.filter((j) => j.signal).length, cross = res.junctions.reduce((s, j) => s + j.arms.filter((a) => a.cross).length, 0);
  fs.mkdirSync(out, { recursive: true });
  const bytes = writeStreets(path.join(out, 'streets.bin'), tiles, { junctions: res.junctions.length, runs: res.runs.length });
  const real = realShare(res), stats = { real, lamps: res.items.filter((f) => f.t === 0).length, trees: res.items.filter((f) => f.t === 1).length, refused: res.why, junctions: res.junctions.length, signals: sig, crossings: cross, runs: res.runs.length, paveKm: Math.round(km), tiles: Object.keys(tiles).length, bytes, seconds: Math.round((Date.now() - t0) / 100) / 10 };
  fs.writeFileSync(path.join(out, 'streets-stats.json'), JSON.stringify(stats)); console.log(JSON.stringify(stats));
}
