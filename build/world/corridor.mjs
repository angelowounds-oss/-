// The corridor of every compiled road line (2026-11-10): how far the nearest building wall stands to the left and to the right of the centre line, sample
// by sample (a perpendicular ray each way), and whether the centre line itself runs inside a building. The game draws a road as wide as its lanes say
// (src/highways.js artWidth: 12.3 m for a two-way street without a lane tag), not as wide as the gap between the map's walls, so this is where a drawn
// road covers real buildings and where a car cannot pass at all. `measure` is the measurement, kept apart from the report so that a compile pass can fit
// the widths with it. Bridges and tunnels are left out (no building stands at their level), and so is the keep zone (no real buildings there).
// usage: node build/world/corridor.mjs [region=capital]      prints the totals by class, writes corridor.json beside region.bin
import fs from 'node:fs';
import path from 'node:path';
import { readBuildings, readTile } from './blocks.mjs';
import { readRegion, KEEP, BAND } from './emit.mjs';
import { unproject } from './geo.mjs';
import { namer } from './names.mjs';
import { CAPITAL } from '../../src/koreamap.js';

export const REACH = 16, STEP = 4;   // metres a ray looks for a wall; metres between the samples along a line
const C = 16, K = (a, b) => a * 100003 + b;

// the walls of every building that stands at road level, in 16 m cells: { ray, which, inside, id, walls, buildings }. A roof slab with 2.5 m or more of air
// under it (a toll plaza's canopy, osmbuildings.mjs) is no wall. `id` is the map's id of a real outline, undefined for a procedural building.
export function wallIndex(B) {
  const X0 = [], Z0 = [], X1 = [], Z1 = [], grid = new Map(), polys = [], pgrid = new Map();
  const add = (px, pz, pid) => {
    const id = polys.length; polys.push({ px, pz, pid });
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0, j = px.length - 1; i < px.length; j = i++) {
      const e = X0.length; X0.push(px[j]); Z0.push(pz[j]); X1.push(px[i]); Z1.push(pz[i]);
      for (let a = Math.floor(Math.min(px[j], px[i]) / C); a <= Math.floor(Math.max(px[j], px[i]) / C); a++) for (let b = Math.floor(Math.min(pz[j], pz[i]) / C); b <= Math.floor(Math.max(pz[j], pz[i]) / C); b++) { const k = K(a, b); let g = grid.get(k); if (!g) grid.set(k, (g = [])); g.push(e); }
      x0 = Math.min(x0, px[i]); x1 = Math.max(x1, px[i]); z0 = Math.min(z0, pz[i]); z1 = Math.max(z1, pz[i]);
    }
    for (let a = Math.floor(x0 / C); a <= Math.floor(x1 / C); a++) for (let b = Math.floor(z0 / C); b <= Math.floor(z1 / C); b++) { const k = K(a, b); let g = pgrid.get(k); if (!g) pgrid.set(k, (g = [])); g.push(id); }
  };
  for (const key of Object.keys(B.tiles)) {
    const [ti, tj] = key.split('_').map(Number), ox = (ti - B.off) * B.tile + B.tile / 2, oz = (tj - B.off) * B.tile + B.tile / 2, t = B.tiles[key];
    for (const p of readTile(key, t)) { const c = Math.cos(p.rot), s = Math.sin(p.rot), hw = p.w / 2, hd = p.d / 2, px = [], pz = []; for (const [u, v] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) { px.push(p.x + u * c - v * s); pz.push(p.z + u * s + v * c); } add(px, pz); }
    for (let b = 0; b < (t.pn || 0); b++) { if (t.pb[b] / 10 >= 2.5) continue; const r0 = t.pr[b], v0 = t.ro[r0], v1 = t.ro[r0 + 1]; if (v1 - v0 < 3) continue; const px = [], pz = []; for (let i = v0; i < v1; i++) { px.push(ox + t.px[i] / 10); pz.push(oz + t.pz[i] / 10); } add(px, pz, t.pid[b]); }
  }
  const seen = new Int32Array(X0.length).fill(-1); let stamp = 0;
  // the building whose outline holds (x, z): its index, or -1
  const which = (x, z) => { const g = pgrid.get(K(Math.floor(x / C), Math.floor(z / C))); if (!g) return -1; for (const id of g) { const { px, pz } = polys[id]; let c = false; for (let i = 0, j = px.length - 1; i < px.length; j = i++) if ((pz[i] > z) !== (pz[j] > z) && x < ((px[j] - px[i]) * (z - pz[i])) / (pz[j] - pz[i]) + px[i]) c = !c; if (c) return id; } return -1; };
  const inside = (x, z) => which(x, z) >= 0;
  // the distance to the nearest wall along the ray from (x, z) in the unit direction (dx, dz); REACH when none is that near
  const ray = (x, z, dx, dz) => {
    let best = REACH; stamp++;
    for (let q = 0, n = Math.ceil(REACH / (C / 2)); q <= n; q++) {
      const d = Math.min(REACH, q * C / 2), g = grid.get(K(Math.floor((x + dx * d) / C), Math.floor((z + dz * d) / C))); if (!g) continue;
      for (const e of g) {
        if (seen[e] === stamp) continue; seen[e] = stamp;
        const ex = X1[e] - X0[e], ez = Z1[e] - Z0[e], den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
        const t = ((X0[e] - x) * ez - (Z0[e] - z) * ex) / den, u = ((X0[e] - x) * dz - (Z0[e] - z) * dx) / den;
        if (t >= 0 && t < best && u >= 0 && u <= 1) best = t;
      }
    }
    return best;
  };
  return { ray, which, inside, id: (k) => polys[k].pid, walls: X0.length, buildings: polys.length };
}

const pct = (a, p) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// every road line against the walls. Returns { lines: [{ ri, hw, half, oneway, len, minSide, width, off, centreIn, gap3, covered }], blocked: [x, z, len...] }:
// minSide the 10th percentile of the nearer wall (so one bay window does not decide), width the 10th percentile of left + right, off the median offset
// to the middle of the corridor (metres to the right), centreIn / gap3 / covered the share of the length with the centre line in a building, with less
// than 3 m between the walls, and with a wall inside the drawn half width. `blocked` lists the samples a car cannot pass (the first two of those);
// `crossed` the real buildings a road of the collector class or bigger runs through: [{ id, metres, road }], the longest first.
const BIG = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link']);
export function measure(R, B, W = wallIndex(B)) {
  const keepR = KEEP + BAND, lines = [], blocked = [], on = new Map();
  R.roads.forEach((r, ri) => {
    const half = r.half || 5, gl = [], gr = []; let len = 0, cov = 0, cin = 0, g3 = 0;
    for (let i = 0; i + 1 < r.x.length; i++) {
      if (r.cls[i] || r.cls[i + 1]) continue;
      const ax = r.x[i], az = r.z[i], dx = r.x[i + 1] - ax, dz = r.z[i + 1] - az, L = Math.hypot(dx, dz); if (L < 0.5) continue;
      const tx = dx / L, tz = dz / L, m = Math.max(1, Math.round(L / STEP)), w = L / m;
      for (let k = 0; k < m; k++) {
        const x = ax + dx * (k + 0.5) / m, z = az + dz * (k + 0.5) / m;
        if (Math.max(Math.abs(x), Math.abs(z)) < keepR) continue;
        const bi = W.which(x, z), inB = bi >= 0, l = inB ? 0 : W.ray(x, z, tz, -tx), rr = inB ? 0 : W.ray(x, z, -tz, tx);
        if (inB && BIG.has(r.hw) && W.id(bi) !== undefined) { const o = on.get(bi) || { id: W.id(bi), metres: 0, by: new Map() }, nm = `${r.name || r.ref || r.id} (${r.hw})`; o.metres += w; o.by.set(nm, (o.by.get(nm) || 0) + w); on.set(bi, o); }
        gl.push(l); gr.push(rr); len += w;
        if (inB) cin += w;
        if (Math.min(l, rr) < half) cov += w;
        if (l + rr < 3) { g3 += w; blocked.push(x, z, w, ri); }
      }
    }
    if (!gl.length) return;
    lines.push({ ri, hw: r.hw, half, oneway: r.oneway ? 1 : 0, len, minSide: pct(gl.map((l, k) => Math.min(l, gr[k])), 0.1), width: pct(gl.map((l, k) => l + gr[k]), 0.1), off: pct(gl.map((l, k) => (gr[k] - l) / 2), 0.5), centreIn: cin / len, gap3: g3 / len, covered: cov / len });
  });
  const crossed = [...on.values()].filter((o) => o.metres >= 4).map((o) => ({ id: o.id, metres: Math.round(o.metres), road: [...o.by].sort((a, b) => b[1] - a[1])[0][0] })).sort((a, b) => b.metres - a.metres);
  return { lines, blocked, crossed };
}

// what a width rule would leave: every street gets `two` (two-way) or `one` (one-way) metres of half width where the walls allow it, less where they do
// not (0.3 m clear of the wall), and is no road for cars under `min`; `centred` first moves a line toward the middle of its corridor by up to `shift` m
export function fit(lines, { two = 3.0, one = 1.75, min = 1.5, centred = false, shift = 3 } = {}) {
  const o = { km: 0, full: 0, narrowed: 0, foot: 0 };
  for (const l of lines) {
    const want = l.oneway ? one : two, free = centred ? l.minSide + Math.max(0, Math.min(l.width / 2 - l.minSide, shift)) : l.minSide, h = Math.min(want, free - 0.3), km = l.len / 1000;
    o.km += km; if (h >= want - 1e-9) o.full += km; else if (h >= min) o.narrowed += km; else o.foot += km;
  }
  for (const k of Object.keys(o)) o[k] = Math.round(o[k]);
  return o;
}

// ---- command line
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'baked', 'world', process.argv[2] || 'capital');
  const R = readRegion(path.join(dir, 'region.bin')), B = readBuildings(path.join(dir, 'buildings.bin'));
  if (!R || !B) { console.error('no region.bin or buildings.bin in ' + dir); process.exit(1); }
  const t0 = Date.now(), W = wallIndex(B), { lines, blocked, crossed } = measure(R, B, W), name = namer(R);
  const cls = {};
  for (const l of lines) { const o = cls[l.hw] || (cls[l.hw] = { lines: 0, km: 0, kmCovered: 0, kmCentreIn: 0, kmNoPassage: 0, linesNoPassage: 0 }); o.lines++; o.km += l.len / 1000; o.kmCovered += l.covered * l.len / 1000; o.kmCentreIn += l.centreIn * l.len / 1000; o.kmNoPassage += l.gap3 * l.len / 1000; if (l.gap3 > 0) o.linesNoPassage++; }
  for (const o of Object.values(cls)) for (const k of ['km', 'kmCovered', 'kmCentreIn', 'kmNoPassage']) o[k] = +o[k].toFixed(1);
  const res = lines.filter((l) => l.hw === 'residential'), tight = res.filter((l) => l.minSide < 3.25), offs = tight.map((l) => Math.abs(l.off)), wid = tight.map((l) => l.width);
  const streets = { lines: res.length, km: Math.round(res.reduce((s, l) => s + l.len, 0) / 1000), tightLines: tight.length, tightKm: Math.round(tight.reduce((s, l) => s + l.len, 0) / 1000),
    offsetP50: +pct(offs, 0.5).toFixed(2), offsetP75: +pct(offs, 0.75).toFixed(2), offsetP90: +pct(offs, 0.9).toFixed(2), widthP10: +pct(wid, 0.1).toFixed(1), widthP50: +pct(wid, 0.5).toFixed(1), widthP90: +pct(wid, 0.9).toFixed(1) };
  const rules = { now: fit(res, { two: 6.15, one: 3.075 }), narrow: fit(res), narrowCentred: fit(res, { centred: true }) };
  // where a car cannot pass: clusters of 300 m, the longest first
  const cl = new Map();
  for (let q = 0; q < blocked.length; q += 4) { const k = Math.floor(blocked[q] / 300) + ',' + Math.floor(blocked[q + 1] / 300); const c = cl.get(k) || { m: 0, sx: 0, sz: 0, n: 0, roads: new Map() }; c.m += blocked[q + 2]; c.sx += blocked[q]; c.sz += blocked[q + 1]; c.n++; const rd = R.roads[blocked[q + 3]], nm = `${rd.name || rd.ref || rd.id} (${rd.hw})`; c.roads.set(nm, (c.roads.get(nm) || 0) + blocked[q + 2]); cl.set(k, c); }
  const clusters = [...cl.values()].map((c) => { const x = c.sx / c.n, z = c.sz / c.n, ll = unproject(x + CAPITAL.x, z + CAPITAL.z); return { lat: +ll.lat.toFixed(5), lon: +ll.lon.toFixed(5), x: Math.round(x), z: Math.round(z), near: name(x, z), metres: Math.round(c.m), roads: [...c.roads].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, m]) => `${n} ${Math.round(m)} m`) }; }).sort((a, b) => b.metres - a.metres);
  const out = { buildings: W.buildings, walls: W.walls, seconds: +((Date.now() - t0) / 1000).toFixed(1), byClass: cls, streets, rules, crossed, clusters: clusters.slice(0, 300) };
  fs.writeFileSync(path.join(dir, 'corridor.json'), JSON.stringify(out, null, 1));
  console.table(cls); console.log(JSON.stringify({ streets, rules, crossedBuildings: crossed.length, crossedMetres: crossed.reduce((s, o) => s + o.metres, 0), clusters: clusters.length, seconds: out.seconds }));
  for (const c of clusters.slice(0, 12)) console.log(`${c.lat},${c.lon}\t${c.near}\t${c.metres} m\t${c.roads.join(' / ')}`);
}
