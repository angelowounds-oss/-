import { KIND } from './citylayout.js';
import { cityPart } from './regions/index.js';

// The small things of the other cities, as data (pure, no three.js): lane marks and zebra crossings, traffic signals, benches, bins, hydrants and
// street trees, and what stands on the roofs (mechanical units, water tanks, masts, helipads, parapets, penthouses, pitched roofs). One chunk per
// 600 m tile of a city (key `city/<id>/<i>_<j>`), made by the bake and drawn by citysites.js from compact lists:
//   boxes  Float32 [x0 y0 z0 x1 y1 z1] x n   +  bcol  Uint8 [r g b k] x n   (rgb = sqrt of linear colour * 255; k: 0 plain, 2 lamp glow, 1 wash)
//   prisms Float32 [x0 z0 x1 z1 y0 h ridgeX] x n  +  pcol  Uint8 [r g b] x n  (gable roof over a rectangle)
//   quads  Float32 [x0 z0 x1 z1 y] x n  +  qcol  Uint8 [r g b k] x n          (flat marks on the ground)
// Everything is relative to the tile's centre. `hi` (the high-detail pack) doubles the density of furniture and adds more roof clutter.
export const TILE = 600;
const hash = (n) => { let h = Math.imul(Math.floor(n * 1000) | 0, 0x9e3779b1); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
const byte = (v) => Math.max(0, Math.min(255, Math.round(Math.sqrt(Math.max(0, v)) * 255)));
// the share of pitched roofs and the street trees (1 = every row) of a city: from its region file (ADR-0036), else these tables (WLD-21e)
const PITCHED = { mid1: 0.8, mid3: 0.7, mid2: 0.25, mid4: 0.1, harbor: 0.1 };
const ROOF = [[0.36, 0.14, 0.09], [0.2, 0.2, 0.24], [0.3, 0.2, 0.12], [0.16, 0.2, 0.17]];
const WHITE = [0.8, 0.8, 0.76], YELLOW = [0.7, 0.55, 0.15], GREY = [0.22, 0.23, 0.26], DARK = [0.05, 0.05, 0.06], GREEN = [0.05, 0.16, 0.06], RED = [0.5, 0.06, 0.05];

class Out {
  constructor() { this.b = []; this.bc = []; this.p = []; this.pc = []; this.q = []; this.qc = []; }
  box(x0, y0, z0, x1, y1, z1, c, k = 0) { this.b.push(x0, y0, z0, x1, y1, z1); this.bc.push(byte(c[0]), byte(c[1]), byte(c[2]), k < 0 ? 100 - k : k); }
  prism(x0, z0, x1, z1, y0, h, rx, c) { this.p.push(x0, z0, x1, z1, y0, h, rx); this.pc.push(byte(c[0]), byte(c[1]), byte(c[2])); }
  quad(x0, z0, x1, z1, y, c, k = 0) { this.q.push(x0, z0, x1, z1, y); this.qc.push(byte(c[0]), byte(c[1]), byte(c[2]), k < 0 ? 100 - k : k); }
  pack() { return { boxes: Float32Array.from(this.b), bcol: Uint8Array.from(this.bc), prisms: Float32Array.from(this.p), pcol: Uint8Array.from(this.pc), quads: Float32Array.from(this.q), qcol: Uint8Array.from(this.qc) }; }
  get empty() { return !this.b.length && !this.p.length && !this.q.length; }
}
// codes in the k byte: 100 - k for k < 0 (so -1 -> 101 wash, -2 -> 102 lamp glow); the reader maps them back
export const kOf = (b) => (b >= 100 ? 100 - b : b);

// the tile (i, j) of a city: its box in city coordinates, centre (ox, oz)
export const tileBox = (L, i, j) => { const x0 = -L.R * 1.1 + i * TILE, z0 = -L.R * 1.1 + j * TILE; return { x0, z0, x1: x0 + TILE, z1: z0 + TILE, ox: x0 + TILE / 2, oz: z0 + TILE / 2 }; };

export function tileDetail(c, L, S, i, j, hi = false) {
  const T = tileBox(L, i, j), O = new Out(), dens = hi ? 2 : 1, pitched = cityPart(c.id, 'pitched') ?? PITCHED[c.id] ?? 0.2;
  const inT = (x, z, m = 0) => x >= T.x0 - m && x < T.x1 + m && z >= T.z0 - m && z < T.z1 + m;
  // axis-aligned roads: v = x constant (running along z), h = z constant
  const V = [], H = [];
  for (let r = 0; r < L.roads.length; r += 5) { const a = L.roads[r], b = L.roads[r + 1], d = L.roads[r + 2], e = L.roads[r + 3], w = L.roads[r + 4]; if (a === d) V.push({ p: a, lo: Math.min(b, e), hi: Math.max(b, e), w }); else if (b === e) H.push({ p: b, lo: Math.min(a, d), hi: Math.max(a, d), w }); }
  const crossH = (x, z0, z1) => H.filter((h) => h.p > z0 && h.p < z1 && x >= h.lo && x <= h.hi), crossV = (z, x0, x1) => V.filter((v) => v.p > x0 && v.p < x1 && z >= v.lo && z <= v.hi);
  const rx = (x) => x - T.ox, rz = (z) => z - T.oz;
  // ---- lane marks: dashed lines on the roads, edge lines, zebra crossings, stop lines and arrows at each crossing
  const dashV = (v) => { const a = Math.max(v.lo, T.z0), b = Math.min(v.hi, T.z1); if (b <= a || v.p < T.x0 - 20 || v.p > T.x1 + 20) return;
    const hw = v.w / 2, lines = v.w >= 18 ? [-v.w / 4, v.w / 4] : v.w >= 11 ? [0] : [];
    for (const off of lines) for (let z = Math.ceil(a / 14) * 14; z < b; z += 14) { if (crossH(v.p, z - 8, z + 10).some((h) => Math.abs(h.p - z) < h.w / 2 + 6)) continue; O.quad(rx(v.p + off) - 0.12, rz(z), rx(v.p + off) + 0.12, rz(z + 5.5), 0.13, WHITE, 0); }
    for (const s of [-1, 1]) O.quad(rx(v.p + s * (hw - 0.5)) - 0.1, rz(a), rx(v.p + s * (hw - 0.5)) + 0.1, rz(b), 0.125, WHITE, 0); };
  const dashH = (h) => { const a = Math.max(h.lo, T.x0), b = Math.min(h.hi, T.x1); if (b <= a || h.p < T.z0 - 20 || h.p > T.z1 + 20) return;
    const hw = h.w / 2, lines = h.w >= 18 ? [-h.w / 4, h.w / 4] : h.w >= 11 ? [0] : [];
    for (const off of lines) for (let x = Math.ceil(a / 14) * 14; x < b; x += 14) { if (crossV(h.p, x - 8, x + 8).some((v) => Math.abs(v.p - x) < v.w / 2 + 6)) continue; O.quad(rx(x), rz(h.p + off) - 0.12, rx(x + 5.5), rz(h.p + off) + 0.12, 0.13, WHITE, 0); }
    for (const s of [-1, 1]) O.quad(rx(a), rz(h.p + s * (hw - 0.5)) - 0.1, rx(b), rz(h.p + s * (hw - 0.5)) + 0.1, 0.125, WHITE, 0); };
  V.forEach(dashV); H.forEach(dashH);
  const avenue = (w) => w >= S.roadW * 1.4;
  for (const v of V) for (const h of H) {
    const cx = v.p, cz = h.p; if (!inT(cx, cz) || cz < v.lo || cz > v.hi || cx < h.lo || cx > h.hi) continue;
    // zebra: on each arm, stripes along the travel direction across the width of the street, 1.6 m after the kerb of the crossing street
    const arm = (dx, dz, w, wx) => {   // arm direction (dx, dz); w = width of this street; wx = half width of the crossing street
      const dist = wx + 2.2, n = Math.floor(w / 1.7);
      for (let s = 0; s < n; s++) { const off = -w / 2 + 0.85 + s * 1.7, px = cx + dx * dist + (dz ? off : 0), pz = cz + dz * dist + (dx ? off : 0);
        if (dx) O.quad(rx(px - 1.4), rz(pz - 0.3), rx(px + 1.4), rz(pz + 0.3), 0.135, WHITE, 0); else O.quad(rx(px - 0.3), rz(pz - 1.4), rx(px + 0.3), rz(pz + 1.4), 0.135, WHITE, 0); }
      // stop line on the incoming lane (right-hand traffic) and an arrow
      const sd = dist + 3.2, sx = cx + dx * sd, sz = cz + dz * sd, lane = w / 4;
      if (dx) { O.quad(rx(sx - 0.2), rz(sz + lane * -dx - w / 4 + 0.4), rx(sx + 0.2), rz(sz + lane * -dx + w / 4 - 0.4), 0.135, WHITE, 0); } else { O.quad(rx(sx + lane * dz - w / 4 + 0.4), rz(sz - 0.2), rx(sx + lane * dz + w / 4 - 0.4), rz(sz + 0.2), 0.135, WHITE, 0); }
    };
    arm(1, 0, h.w, v.w / 2); arm(-1, 0, h.w, v.w / 2); arm(0, 1, v.w, h.w / 2); arm(0, -1, v.w, h.w / 2);
    // traffic signals at the avenue crossings: a pole at each corner with an arm over the road and three lamps
    if (avenue(v.w) && avenue(h.w)) for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const px = cx + sx * (v.w / 2 + 1.2), pz = cz + sz * (h.w / 2 + 1.2), k = hash(px * 0.37 + pz * 0.11), lamp = k < 0.45 ? RED : k < 0.55 ? [0.8, 0.5, 0.05] : [0.05, 0.6, 0.15];
      O.box(rx(px) - 0.12, 0, rz(pz) - 0.12, rx(px) + 0.12, 6.2, rz(pz) + 0.12, GREY); O.box(rx(px) - 0.1, 5.6, rz(pz) - 0.1, rx(px) - sx * 3.4 + 0.1, 5.85, rz(pz) + 0.1, GREY);
      O.box(rx(px) - sx * 3.2 - 0.25, 4.3, rz(pz) - 0.25, rx(px) - sx * 3.2 + 0.25, 5.6, rz(pz) + 0.25, DARK); O.box(rx(px) - sx * 3.2 - 0.3, 5.0, rz(pz) - 0.05, rx(px) - sx * 3.2 + 0.3, 5.3, rz(pz) + 0.3, lamp.map((q) => q * 5), -2);
    }
  }
  // ---- street furniture along the roads: every ~34 m a bench, bin, hydrant or a tree; bus shelters on avenues; none near a crossing
  const nearCross = (x, z) => V.some((v) => Math.abs(v.p - x) < v.w / 2 + 7 && z >= v.lo && z <= v.hi) && H.some((h) => Math.abs(h.p - z) < h.w / 2 + 7 && x >= h.lo && x <= h.hi);
  const treeRows = cityPart(c.id, 'treeRows') ?? (c.id === 'mid1' || c.id === 'mid3' || c.id === 'harbor' ? 1 : 0.35);
  const furn = (x, z, ry, seed, avenueRoad) => {   // ry: 0 = along x, 1 = along z (the street direction)
    const k = hash(seed), px = rx(x), pz = rz(z);
    if (k < treeRows * 0.55) { const hh = 4.5 + hash(seed + 1) * 3.5; O.box(px - 0.25, 0, pz - 0.25, px + 0.25, hh * 0.45, pz + 0.25, [0.1, 0.07, 0.04]); O.box(px - 1.9, hh * 0.35, pz - 1.9, px + 1.9, hh, pz + 1.9, [0.04 + hash(seed + 2) * 0.04, 0.16 + hash(seed + 3) * 0.08, 0.05]); O.box(px - 1.1, hh, pz - 1.1, px + 1.1, hh + 1.3, pz + 1.1, [0.05, 0.19, 0.06]); }
    else if (k < 0.75) { const bx = ry ? 0.35 : 0.9, bz = ry ? 0.9 : 0.35; O.box(px - bx, 0.45, pz - bz, px + bx, 0.55, pz + bz, [0.3, 0.2, 0.1]); O.box(px - (ry ? 0.35 : 0.9), 0.1, pz - (ry ? 0.9 : 0.35), px + (ry ? 0.35 : 0.9), 0.45, pz + (ry ? 0.9 : 0.35), GREY); }
    else if (k < 0.87) O.box(px - 0.25, 0, pz - 0.25, px + 0.25, 0.95, pz + 0.25, [0.08, 0.14, 0.09]);
    else if (k < 0.94) { O.box(px - 0.16, 0, pz - 0.16, px + 0.16, 0.7, pz + 0.16, RED); O.box(px - 0.1, 0.7, pz - 0.1, px + 0.1, 0.82, pz + 0.1, RED); }
    else if (avenueRoad) { const sx = ry ? 0.9 : 2.4, sz = ry ? 2.4 : 0.9; O.box(px - sx, 2.4, pz - sz, px + sx, 2.6, pz + sz, [0.05, 0.1, 0.14]); O.box(px - sx, 0, pz - sz, px - sx + 0.12, 2.4, pz - sz + 0.12, GREY); O.box(px + sx - 0.12, 0, pz + sz - 0.12, px + sx, 2.4, pz + sz, GREY); O.box(px - sx, 0.5, pz + (ry ? -sz : sz) * 0.9, px + sx, 1.0, pz + (ry ? -sz : sz) * 0.9 + 0.1, [0.6, 0.5, 0.3]); }
  };
  const step = 34 / dens;
  for (const v of V) { const a = Math.max(v.lo, T.z0), b = Math.min(v.hi, T.z1); if (v.p < T.x0 - 8 || v.p > T.x1 + 8) continue;
    for (let z = Math.ceil(a / step) * step; z < b; z += step) for (const s of [-1, 1]) { const x = v.p + s * (v.w / 2 + 3.2); if (!inT(x, z) || nearCross(x, z)) continue; furn(x, z, 1, v.p * 3.1 + z * 0.7 + s * 5, avenue(v.w)); } }
  for (const h of H) { const a = Math.max(h.lo, T.x0), b = Math.min(h.hi, T.x1); if (h.p < T.z0 - 8 || h.p > T.z1 + 8) continue;
    for (let x = Math.ceil(a / step) * step; x < b; x += step) for (const s of [-1, 1]) { const z = h.p + s * (h.w / 2 + 3.2); if (!inT(x, z) || nearCross(x, z)) continue; furn(x, z, 0, h.p * 2.3 + x * 0.9 + s * 7, avenue(h.w)); } }
  // ---- roofs
  const nb = L.bld.length / 12;
  for (let n = 0; n < nb; n++) {
    const o = n * 12, bx = L.bld[o], bz = L.bld[o + 1]; if (!inT(bx, bz)) continue;
    const W = L.bld[o + 2], D = L.bld[o + 3], hp = L.bld[o + 4], ht = L.bld[o + 5], seed = L.bld[o + 6], ins = L.bld[o + 10], code = L.bld[o + 9], kind = Math.floor(code / 16);
    if (kind === KIND.stadium || kind === KIND.park) continue;
    const tw = ht > 0 && W - ins * 2 > 6 && D - ins * 2 > 6 ? [W - ins * 2, D - ins * 2] : [W, D], top = hp + (ht > 0 ? ht : 0) + (tw[0] === W ? 0 : 0);
    const x0 = rx(bx) - tw[0] / 2, x1 = rx(bx) + tw[0] / 2, z0 = rz(bz) - tw[1] / 2, z1 = rz(bz) + tw[1] / 2, hs = (k) => hash(seed + k), ytop = ht > 0 && tw[0] !== W ? hp + ht : hp + Math.max(0, ht);
    void top;
    const low = ytop < 17 && kind !== KIND.warehouse && kind !== KIND.hangar && kind !== KIND.terminal;
    if (low && hs(40) < pitched) { const rxr = tw[0] >= tw[1] ? 1 : 0, ov = 0.6; O.prism(x0 - ov, z0 - ov, x1 + ov, z1 + ov, ytop, Math.min(tw[0], tw[1]) * (0.22 + hs(41) * 0.1), rxr, ROOF[Math.floor(hs(42) * ROOF.length)]); continue; }
    if (hs(43) < 0.6) { const t = 0.4, pc = [0.14, 0.14, 0.16]; O.box(x0, ytop, z0, x1, ytop + 0.9, z0 + t, pc); O.box(x0, ytop, z1 - t, x1, ytop + 0.9, z1, pc); O.box(x0, ytop, z0 + t, x0 + t, ytop + 0.9, z1 - t, pc); O.box(x1 - t, ytop, z0 + t, x1, ytop + 0.9, z1 - t, pc); }
    const place = (k, w, d) => ({ x: x0 + 1.5 + w / 2 + hs(k) * Math.max(0, tw[0] - 3 - w), z: z0 + 1.5 + d / 2 + hs(k + 0.5) * Math.max(0, tw[1] - 3 - d) });
    if (tw[0] > 8 && tw[1] > 8) {
      const units = Math.round((hs(44) < 0.55 ? 2 + hs(45) * 3 : 0) * dens);
      for (let u = 0; u < units; u++) { const p = place(46 + u, 2.2, 1.6); O.box(p.x - 1.1, ytop, p.z - 0.8, p.x + 1.1, ytop + 1.2, p.z + 0.8, [0.2, 0.21, 0.23]); O.box(p.x - 0.5, ytop + 1.2, p.z - 0.5, p.x + 0.5, ytop + 1.35, p.z + 0.5, DARK); }
      if (ytop > 20 && hs(52) < 0.3) { const p = place(53, 3.2, 3.2), leg = 2.6; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) O.box(p.x + a * 1.2 - 0.12, ytop, p.z + b * 1.2 - 0.12, p.x + a * 1.2 + 0.12, ytop + leg, p.z + b * 1.2 + 0.12, GREY); O.box(p.x - 1.7, ytop + leg, p.z - 1.7, p.x + 1.7, ytop + leg + 3.2, p.z + 1.7, [0.2, 0.12, 0.08]); O.box(p.x - 1.3, ytop + leg + 3.2, p.z - 1.3, p.x + 1.3, ytop + leg + 3.6, p.z + 1.3, [0.14, 0.09, 0.06]); }
      if (hs(55) < 0.32) { const p = place(56, 1, 1), hh = 7 + hs(57) * (ytop > 40 ? 24 : 8); O.box(p.x - 0.14, ytop, p.z - 0.14, p.x + 0.14, ytop + hh, p.z + 0.14, GREY); O.box(p.x - 1.2, ytop + hh * 0.7, p.z - 0.07, p.x + 1.2, ytop + hh * 0.7 + 0.12, p.z + 0.07, GREY); if (ytop + hh > 38) O.box(p.x - 0.3, ytop + hh, p.z - 0.3, p.x + 0.3, ytop + hh + 0.6, p.z + 0.3, [6, 0.2, 0.15], -2); }
      if (hs(58) < 0.4) { const p = place(59, 4.2, 4.2); O.box(p.x - 2.1, ytop, p.z - 2.1, p.x + 2.1, ytop + 3, p.z + 2.1, [0.17, 0.17, 0.19]); }
      if (ytop > 34 && tw[0] > 18 && tw[1] > 18 && hs(60) < 0.18) { const p = place(61, 12, 12); O.box(p.x - 6, ytop, p.z - 6, p.x + 6, ytop + 0.25, p.z + 6, [0.12, 0.12, 0.14]); O.box(p.x - 3.2, ytop + 0.25, p.z - 3.2, p.x - 2.4, ytop + 0.3, p.z + 3.2, YELLOW, 0); O.box(p.x + 2.4, ytop + 0.25, p.z - 3.2, p.x + 3.2, ytop + 0.3, p.z + 3.2, YELLOW, 0); O.box(p.x - 2.4, ytop + 0.25, p.z - 0.4, p.x + 2.4, ytop + 0.3, p.z + 0.4, YELLOW, 0); }
      if (hi) { const extra = Math.round(hs(62) * 4); for (let u = 0; u < extra; u++) { const p = place(63 + u, 1.2, 1.2); O.box(p.x - 0.6, ytop, p.z - 0.6, p.x + 0.6, ytop + 0.8 + hs(70 + u) * 0.8, p.z + 0.6, [0.18, 0.19, 0.2]); } }
    }
  }
  return O.empty ? null : { ...O.pack(), n: [O.b.length / 6, O.p.length / 7, O.q.length / 5] };
}

// every tile of a city that has anything: [[i, j], ...] (the bake makes one job per entry)
export function tilesOf(L) { const n = Math.ceil(L.R * 2.2 / TILE), out = []; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out.push([i, j]); return out; }
