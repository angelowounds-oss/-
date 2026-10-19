// Joins the OpenStreetMap river ways (build/korea_rivers_fetch.py) into one main course per river, in map metres (KOREA-PLAN B1).
// Each course runs source to mouth; its width grows from 40 m real at the source to 300 m real at the mouth.
// Data: © OpenStreetMap contributors, ODbL 1.0 (docs/ASSETS.md). Output: src/korerivers.js (generated).
// Usage: node build/korea_rivers_convert.mjs <korea_rivers_osm.json> <out.js>
import fs from 'node:fs';
import { project, koreaMask, landAt, KOREA_SCALE, LAND_HALF } from '../src/koreamap.js';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: node build/korea_rivers_convert.mjs <korea_rivers_osm.json> <out.js>'); process.exit(2); }

const TOL = 12;        // map m: simplification (about 80 m real)
const mask = koreaMask();

const key = (p) => p[0].toFixed(4) + ',' + p[1].toFixed(4);

// the main course of one river: the largest joined piece, from its mouth (the leaf nearest the sea) up the longest arm to the source.
// Walking from the mouth keeps the junctions on the longest arm (for the Han, the Namhan or the Bukhan with the mainstem below Yangpyeong).
function mainCourse(ways) {
  // vertices within SNAP (about 500 m) of each other are one junction: OpenStreetMap ways often stop short of the shared node
  const SNAP = 0.005, cellOf = (p) => Math.floor(p[0] / SNAP) + ',' + Math.floor(p[1] / SNAP);
  const grid = new Map();
  const join = (p) => {
    const cx = Math.floor(p[0] / SNAP), cy = Math.floor(p[1] / SNAP);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q of grid.get((cx + i) + ',' + (cy + j)) || []) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < SNAP) return q;
    const c = cellOf(p); if (!grid.has(c)) grid.set(c, []); grid.get(c).push(p); return p;
  };
  const pts = new Map(), adj = new Map();
  const add = (a, b, d) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, d]); };
  const node = (p) => { const q = join(p), k = key(q); if (!pts.has(k)) pts.set(k, q); return k; };
  for (const w of ways) {
    for (let i = 1; i < w.geom.length; i++) {
      const a = node(w.geom[i - 1]), b = node(w.geom[i]);
      if (a === b) continue;
      const d = Math.hypot((w.geom[i][0] - w.geom[i - 1][0]) * 88.8, (w.geom[i][1] - w.geom[i - 1][1]) * 111);   // km on the ground: a degree of longitude is shorter than a degree of latitude here
      add(a, b, d); add(b, a, d);
    }
  }
  // shortest paths from start (Dijkstra): the river has parallel duplicate ways, so a plain walk would not give true distances
  const dijkstra = (start) => {
    const dist = new Map([[start, 0]]), prev = new Map(), h = [[0, start]];
    while (h.length) {
      h.sort((a, b) => b[0] - a[0]); const [d, u] = h.pop();
      if (d > dist.get(u)) continue;
      for (const [v, w] of adj.get(u) || []) { const nd = d + w; if (nd < (dist.has(v) ? dist.get(v) : Infinity)) { dist.set(v, nd); prev.set(v, u); h.push([nd, v]); } }
    }
    let far = start; for (const [k, d] of dist) if (d > dist.get(far)) far = k;
    return { far, prev, dist };
  };
  const reach = (start) => { const seen = new Set([start]), st = [start]; while (st.length) { const u = st.pop(); for (const [v] of adj.get(u) || []) if (!seen.has(v)) { seen.add(v); st.push(v); } } return [...seen]; };
  const ends = [...adj.keys()];
  if (!ends.length) return [];
  const seen = new Set(), comps = [];
  for (const s0 of ends) { if (seen.has(s0)) continue; const c = reach(s0); for (const k of c) seen.add(k); comps.push({ s0, nodes: c }); }
  const main = comps.sort((p, q) => q.nodes.length - p.nodes.length)[0];
  // every mouth is south of 38.2 N: North Korea is outside the land mask, so its ends would count as sea
  const leaves = main.nodes.filter((k) => adj.get(k).length === 1 && pts.get(k)[1] < 38.2);
  const mouth = (leaves.length ? leaves : main.nodes).reduce((best, k) => (seaAround(pts.get(k)) > seaAround(pts.get(best)) ? k : best));
  const { far, prev } = dijkstra(mouth);
  const path = [far];
  for (let k = far; prev.has(k); k = prev.get(k)) path.push(prev.get(k));
  return path.map((k) => pts.get(k));   // source to mouth
}

// orient so the mouth comes last: the end with more sea within 5 km (the river runs into the sea)
function seaAround(p) {
  const q = project(p[0], p[1]); let sea = 0;
  // only cells inside the mask count: outside the country the mask is zero, which is not sea
  for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) { const x = q.x + i * 1000, z = q.z + j * 1000; if (Math.abs(x) < LAND_HALF && Math.abs(z) < LAND_HALF && !landAt(mask, x, z)) sea++; }
  return sea;
}

function simplify(P, tol) {
  if (P.length < 3) return P;
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
  const stack = [[0, P.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = 0, bi = -1;
    const [ax, az] = P[a], [bx, bz] = P[b], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((P[i][0] - ax) * dz - (P[i][1] - az) * dx) / L; if (d > best) { best = d; bi = i; } }
    if (bi >= 0 && best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return P.filter((_, i) => keep[i]);
}

const ways = JSON.parse(fs.readFileSync(src, 'utf8'));
const byName = new Map();
const RIVER_OF = { 남한강: '한강', 북한강: '한강' };   // the Han is two named branches joined at Yangpyeong
for (const w of ways) { if (!w.name) continue; const name = RIVER_OF[w.name] || w.name; if (!byName.has(name)) byName.set(name, []); byName.get(name).push(w); }

const rivers = [];
for (const [name, list] of byName) {
  let course = mainCourse(list);
  if (course.length < 2) continue;
  if (seaAround(course[0]) > seaAround(course[course.length - 1])) course = course.reverse();   // mouth last
  const P = simplify(course.map((p) => { const q = project(p[0], p[1]); return [q.x, q.z]; }), TOL);
  // width along the course, by cumulative length
  let total = 0; const cum = [0];
  for (let i = 1; i < P.length; i++) { total += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); cum.push(total); }
  const W = cum.map((c) => Math.round((40 + 260 * (c / total)) * 10) / 10);   // real metres
  rivers.push({ name, length: Math.round(total * KOREA_SCALE / 1000), pts: P.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]), w: W });
}

fs.writeFileSync(out, '// Generated by build/korea_rivers_convert.mjs from OpenStreetMap river ways (ODbL, credited in game). Do not edit by hand.\n' +
  'export const RIVERS = ' + JSON.stringify(rivers) + ';\n');
console.log(rivers.map((r) => `${r.name} ${r.length} km real, ${r.pts.length} pts`).join('\n'));
