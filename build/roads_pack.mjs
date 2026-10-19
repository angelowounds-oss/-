// Plans the country roads (villages, farms, industry and the cities joined by two-lane roads) and packs them into assets/roads/country.bin for
// src/countryroads.js (docs/ASSETS.md, ADR-0013). The plan is pure data from the world design: it only reads settlements.js, roadnet.js and the
// procedural land, so it runs here and not in the game. Roads are found on a 48 m grid (A*: no water, no river, no steep ground, no crossing of a
// highway or a city) between the gates of the places, rounded off and resampled every 16 m. Heights are not stored: the game drapes the road on the
// ground it draws. usage: node build/roads_pack.mjs
// Layout: u32 json length (space padded), json header { roads: [{ id, cls, n, off }] }, then f32 x,z pairs (n points) per road at byte offset `off`.
import fs from 'node:fs';
import { settlements } from '../src/settlements.js';
import { net } from '../src/roadnet.js';
import { cities } from '../src/worldmap.js';
import { landHeight, riverAt } from '../src/landfn.js';
import { SEA } from '../src/worldmap.js';
import { CC } from '../src/countrycarve.js';

CC.on = false;   // route over the natural ground: the grading follows from the roads, so it must not shape them

const G = 48, STEP = 16;
const S = settlements(), N = net(), C = cities();

// ---- the places and the gate a road enters each by
const nodes = [];
for (const v of S.villages) nodes.push({ id: v.id, kind: 'village', x: v.x, z: v.z, r: v.r, gate: (tx) => ({ x: v.x + Math.sign(tx - v.x || 1) * (v.Lh + 64), z: v.z, in: [v.x + Math.sign(tx - v.x || 1) * (v.Lh + 4), v.z], pad: v.r }) });
for (const f of S.farms) nodes.push({ id: f.id, kind: 'farm', x: f.x, z: f.z, r: 70, parent: f.village, gate: (tx, tz) => { const a = Math.atan2(tz - f.z, tx - f.x); return { x: f.x + Math.cos(a) * 76, z: f.z + Math.sin(a) * 76, in: [f.x + Math.cos(a) * 34, f.z + Math.sin(a) * 34], pad: 70 }; } });
for (const s of S.industry) { const r = s.type === 'wind' ? 60 : s.type === 'refinery' ? 210 : s.type === 'mine' ? 190 : 150; nodes.push({ id: s.id, kind: 'industry', x: s.x, z: s.z, r, gate: (tx, tz) => { const a = Math.atan2(tz - s.z, tx - s.x); return { x: s.x + Math.cos(a) * (r + 10), z: s.z + Math.sin(a) * (r + 10), in: [s.x + Math.cos(a) * r * 0.7, s.z + Math.sin(a) * r * 0.7], pad: r }; } }); }
for (const c of C) if (!c.fixed || c.id) nodes.push({ id: 'c:' + c.id, kind: 'city', x: c.x, z: c.z, r: c.r, gate: (tx, tz) => { const a = Math.atan2(tz - c.z, tx - c.x); return { x: c.x + Math.cos(a) * c.r * 0.97, z: c.z + Math.sin(a) * c.r * 0.97, in: null, pad: 0 }; } });

// ---- which edges: every place to its nearest neighbours, then a spanning tree so the whole network is one piece
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z), byId = new Map(nodes.map((n) => [n.id, n]));
const cand = new Map(), addE = (a, b) => { if (a === b) return; const k = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id; if (!cand.has(k)) cand.set(k, [a, b, dist(a, b)]); };
for (const n of nodes) {
  if (n.kind === 'farm') { addE(n, byId.get(n.parent)); continue; }
  const near = nodes.filter((m) => m !== n && m.kind !== 'farm' && dist(m, n) < 14000).sort((p, q) => dist(p, n) - dist(q, n));
  for (const m of near.slice(0, 6)) addE(n, m);
}
const parent = new Map(nodes.map((n) => [n.id, n.id])), find = (i) => { while (parent.get(i) !== i) { parent.set(i, parent.get(parent.get(i))); i = parent.get(i); } return i; };
const edges = [...cand.values()].sort((p, q) => p[2] - q[2]);
// a village beside a highway also gets its own short road to the carriageway (a frontage road that stops outside the fence)
const hw = N.roads.filter((r) => r.kind === 'highway'), hwPts = []; for (const r of hw) for (let i = 0; i < r.pts.length; i += 2) hwPts.push([r.pts[i][0], r.pts[i][1]]);
const hwGrid = new Map(), hk = (x, z) => Math.floor(x / 64) * 100003 + Math.floor(z / 64);
for (const p of hwPts) { const k = hk(p[0], p[1]); (hwGrid.get(k) || hwGrid.set(k, []).get(k)).push(p); }
const hwNear = (x, z, r) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = hwGrid.get(hk(x + i * 64, z + j * 64)); if (a) for (const p of a) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < r * r) return p; } return null; };
const links = [];
for (const v of S.villages) if (v.tag === 'highway') { let best = null, bd = 1e18; for (const p of hwPts) { const d = (p[0] - v.x) ** 2 + (p[1] - v.z) ** 2; if (d < bd) { bd = d; best = p; } } if (best && Math.sqrt(bd) < 3000) links.push([byId.get(v.id), { id: 'h:' + v.id, kind: 'highway', x: best[0], z: best[1], r: 0, gate: () => ({ x: best[0], z: best[1], in: null, pad: 0, hw: true }) }, Math.sqrt(bd)]); }

// resampling leaves duplicate points and a short leftover piece at the corners, which read as kinks of 30-65 degrees; drop the duplicates, fold a short
// last piece into its neighbour, then relax the inner points (the first and last point stay on the gates)
function tidy(pts) {
  const near = (P) => { const d = [P[0]]; for (let i = 1; i < P.length - 1; i++) if (Math.hypot(P[i][0] - d[d.length - 1][0], P[i][1] - d[d.length - 1][1]) > 4) d.push(P[i]); d.push(P[P.length - 1]); return d; };   // points closer than 4 m read as a kink
  // a spike (the route runs out and back) is dropped: a point whose two sides meet at more than 90 degrees (a hairpin at a gate)
  const spike = (P) => { const Q = [P[0]]; for (let i = 1; i < P.length - 1; i++) { const a = Q[Q.length - 1], b = P[i], c = P[i + 1], ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1], l = Math.hypot(ux, uz) * Math.hypot(vx, vz) || 1; if ((ux * vx + uz * vz) / l > 0) Q.push(b); } Q.push(P[P.length - 1]); return Q; };
  let d = near(spike(pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.5)));
  for (let r = 0; r < 8; r++) for (let i = 1; i < d.length - 1; i++) d[i] = [(d[i - 1][0] + 2 * d[i][0] + d[i + 1][0]) / 4, (d[i - 1][1] + 2 * d[i][1] + d[i + 1][1]) / 4];
  for (let k = 0; k < 6; k++) { const n = d.length; d = near(spike(d)); if (d.length === n) break; }   // a removed hairpin can leave a new one behind
  // a kink left at a gate is relaxed: only the points around a bend over 25 degrees move, so the straight runs stay put
  const bend = (i) => { const ax = d[i][0] - d[i - 1][0], az = d[i][1] - d[i - 1][1], bx = d[i + 1][0] - d[i][0], bz = d[i + 1][1] - d[i][1], l = Math.hypot(ax, az) * Math.hypot(bx, bz) || 1; return Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / l))) * 180 / Math.PI; };
  for (let r = 0; r < 400; r++) { let moved = false; for (let i = 1; i < d.length - 1; i++) if (bend(i) > 25) { for (let j = Math.max(1, i - 1); j <= Math.min(d.length - 2, i + 1); j++) d[j] = [(d[j - 1][0] + 2 * d[j][0] + d[j + 1][0]) / 4, (d[j - 1][1] + 2 * d[j][1] + d[j + 1][1]) / 4]; moved = true; } if (!moved) break; }
  return d;
}

// ---- A*
function route(a, b, slopeMax = 0.3, crossMax = 0.25) {
  const ga = a.gate(b.x, b.z), gb = b.gate(a.x, a.z), pad = 3500;
  let x0 = Math.min(ga.x, gb.x) - pad, x1 = Math.max(ga.x, gb.x) + pad, z0 = Math.min(ga.z, gb.z) - pad, z1 = Math.max(ga.z, gb.z) + pad;
  const W = Math.ceil((x1 - x0) / G), H = Math.ceil((z1 - z0) / G), cost = new Float32Array(W * H).fill(-1), hts = new Float32Array(W * H).fill(NaN);
  const cx = (i) => x0 + (i + 0.5) * G, cz = (j) => z0 + (j + 0.5) * G;
  const height = (i, j) => { const k = j * W + i; if (hts[k] !== hts[k]) hts[k] = landHeight(cx(i), cz(j), 32); return hts[k]; };
  const near = (n, x, z) => n.r && Math.hypot(x - n.x, z - n.z) < n.r + 24;
  const blocked = (i, j) => {
    const k = j * W + i; if (cost[k] >= 0) return cost[k] > 1e8; const x = cx(i), z = cz(j); let bad = false;
    const h = height(i, j); if (h < SEA + 2.5) bad = true;
    if (!bad) { const rv = riverAt(x, z); if (rv && rv.d < rv.w / 2 + 20) bad = true; }
    // real mountain country: a road may not run along a hillside whose cross slope would leave the 8.8 m ribbon more than 1.5 m off the ground
    if (!bad && i > 0 && j > 0 && i < W - 1 && j < H - 1) { const gx = (height(i + 1, j) - height(i - 1, j)) / (2 * G), gz = (height(i, j + 1) - height(i, j - 1)) / (2 * G); if (Math.hypot(gx, gz) > crossMax) bad = true; }
    if (!bad && !gb.hw && hwNear(x, z, 40)) bad = true;
    if (!bad && gb.hw && hwNear(x, z, 40) && Math.hypot(x - gb.x, z - gb.z) > 70) bad = true;
    if (!bad) for (const n of nodes) { if (n === a || n === b || !n.r) continue; const d = Math.hypot(x - n.x, z - n.z); if (d < (n.kind === 'city' ? n.r * 0.99 : n.r + 20)) { bad = true; break; } }
    if (!bad && (a.kind === 'city' || b.kind === 'city')) { for (const n of [a, b]) if (n.kind === 'city' && Math.hypot(x - n.x, z - n.z) < n.r * 0.94) bad = true; }
    cost[k] = bad ? 1e9 : 0; return bad;
  };
  const si = Math.round((ga.x - x0) / G - 0.5), sj = Math.round((ga.z - z0) / G - 0.5), ti = Math.round((gb.x - x0) / G - 0.5), tj = Math.round((gb.z - z0) / G - 0.5);
  if (si < 0 || sj < 0 || ti < 0 || tj < 0 || si >= W || ti >= W || sj >= H || tj >= H) return null;
  const g = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1), open = [];   // binary heap of [f, k]
  const push = (f, k) => { open.push([f, k]); let c = open.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (open[p][0] <= open[c][0]) break; [open[p], open[c]] = [open[c], open[p]]; c = p; } };
  const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === c) break; [open[m], open[c]] = [open[c], open[m]]; c = m; } } return top; };
  const s = sj * W + si, t = tj * W + ti; g[s] = 0; push(0, s);
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let it = 0;
  while (open.length && it++ < 400000) {
    const [, k] = pop(); if (k === t) break; const i = k % W, j = (k / W) | 0, hk0 = height(i, j);
    for (const [di, dj] of D) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue; const nk = nj * W + ni;
      if (nk !== t && blocked(ni, nj)) continue;
      const d = Math.hypot(di, dj) * G, sl = Math.abs(height(ni, nj) - hk0) / d; if (sl > slopeMax) continue;
      const turn = from[k] >= 0 ? (((from[k] % W) - i) * (di) + (((from[k] / W) | 0) - j) * (dj)) : 0;   // a bend costs a little: roads prefer straight runs
      const ng = g[k] + d * (1 + 26 * sl * sl) + (turn > 0 ? 6 : 0);
      if (ng < g[nk]) { g[nk] = ng; from[nk] = k; push(ng + Math.hypot(ni - ti, nj - tj) * G, nk); }
    }
  }
  if (from[t] < 0 && t !== s) return null;
  let pts = []; for (let k = t; k >= 0; k = from[k]) { pts.push([cx(k % W), cz((k / W) | 0)]); if (k === s) break; } pts.reverse();
  pts[0] = [ga.x, ga.z]; pts[pts.length - 1] = [gb.x, gb.z];
  if (ga.in) pts.unshift([ga.in[0], ga.in[1]]); if (gb.in) pts.push([gb.in[0], gb.in[1]]);
  for (let r = 0; r < 3; r++) {   // rounding: corner cutting keeps the first and last point
    const q = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i], p1 = pts[i + 1]; q.push([p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25], [p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75]); } q.push(pts[pts.length - 1]); pts = q;
  }
  const out = [pts[0]]; let acc = 0;   // resample every STEP metres
  for (let i = 1; i < pts.length; i++) { let a0 = out[out.length - 1], b0 = pts[i], l = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]); while (acc + l >= STEP) { const f = (STEP - acc) / l; a0 = [a0[0] + (b0[0] - a0[0]) * f, a0[1] + (b0[1] - a0[1]) * f]; out.push(a0); l = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]); acc = 0; } acc += l; }
  out.push(pts[pts.length - 1]); return tidy(out);
}

const roads = [], t0 = Date.now(); let failed = 0;
// spanning tree by trial: an edge joins two pieces only if a road can really be found between them (the world is an archipelago: some places have no way)
// a route that the strict limits cannot find is retried with looser ones (the ground check in countryroads-quality bounds the result)
const add = (a, b) => { const pts = route(a, b) || route(a, b, 0.5, 0.4); if (!pts || pts.length < 4) { failed++; return false; } roads.push({ id: a.id + '>' + b.id, cls: a.kind === 'farm' || b.kind === 'farm' ? 1 : 0, pts }); return true; };
for (const e of edges) { const ra = find(e[0].id), rb = find(e[1].id); if (e[0].kind !== 'farm' && e[1].kind !== 'farm' && ra === rb) continue; if (add(e[0], e[1])) parent.set(ra, rb); }
for (const l of links) add(l[0], l[1]);
let off = 0; const meta = roads.map((r) => { const m = { id: r.id, cls: r.cls, n: r.pts.length, off }; off += r.pts.length * 8; return m; });
let head = JSON.stringify({ roads: meta }); while ((4 + head.length) % 4) head += ' ';
const buf = Buffer.alloc(4 + head.length + off); buf.writeUInt32LE(head.length, 0); buf.write(head, 4);
const f32 = new Float32Array(off / 4); let q = 0; for (const r of roads) for (const p of r.pts) { f32[q++] = p[0]; f32[q++] = p[1]; }
Buffer.from(f32.buffer).copy(buf, 4 + head.length);
fs.mkdirSync('assets/roads', { recursive: true }); fs.writeFileSync('assets/roads/country.bin', buf);
// the same roads as plain numbers for src/countrycarve.js (the bake and the page grade the ground along them)
fs.writeFileSync('src/countryplan.js', '// Generated by build/roads_pack.mjs (KOREA-PLAN A2b): the country roads as x, z pairs every 16 m, read by countrycarve.js. Do not edit by hand.\nexport const COUNTRY = ' + JSON.stringify(roads.map((r) => ({ id: r.id, cls: r.cls, p: r.pts.flatMap((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]) }))) + ';\n');
const km = roads.reduce((s, r) => s + (r.pts.length - 1) * STEP, 0) / 1000;
console.log(`${roads.length} roads (${failed} had no way), ${km.toFixed(0)} km, ${(buf.length / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
