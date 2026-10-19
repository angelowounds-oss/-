// Converts the OpenStreetMap motorway and trunk ways (build/korea_roads_fetch.py) into the game's map metres (WLD-20f, KOREA-PLAN D1).
// Keeps only ways whose midpoint lies on South Korean land, drops the second carriageway of each pair, projects, and simplifies.
// Data: © OpenStreetMap contributors, ODbL 1.0 (docs/ASSETS.md). The output is a derived database and carries the same licence.
// Usage: node build/korea_roads_convert.mjs <korea_roads_osm.json> <out.json>
import fs from 'node:fs';
import { project, koreaMask, landAt, KOREA_SCALE } from '../src/koreamap.js';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: node build/korea_roads_convert.mjs <korea_roads_osm.json> <out.json>'); process.exit(2); }

const TOL = 25;                 // simplification tolerance: 25 map m = 160 m real
const PAIR = 120 / KOREA_SCALE;   // divided carriageways run 30-110 m apart in the mountains
const mask = koreaMask();

const ways = JSON.parse(fs.readFileSync(src, 'utf8'));

// Ramer-Douglas-Peucker on [x, z] pairs
function simplify(P, tol) {
  if (P.length < 3) return P;
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
  const stack = [[0, P.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = 0, bi = -1;
    const [ax, az] = P[a], [bx, bz] = P[b], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((P[i][0] - ax) * dz - (P[i][1] - az) * dx) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (bi >= 0 && best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return P.filter((_, i) => keep[i]);
}

// true when the two polylines run side by side: most vertices of a sit within PAIR of b
function parallel(a, b) {
  let near = 0;
  for (const [x, z] of a) {
    for (const [u, v] of b) if (Math.hypot(x - u, z - v) < PAIR) { near++; break; }
  }
  return near >= 0.8 * a.length;
}

const kept = [];
const byRef = new Map();   // dedupe only among ways that share a route number (or name when unnumbered)
let dropped = 0, offLand = 0;
for (const w of ways) {
  if (w.hw !== 'motorway' && w.hw !== 'trunk') continue;
  const P = w.geom.map(([lon, lat]) => { const p = project(lon, lat); return [p.x, p.z]; });
  if (P.length < 2) continue;
  const m = P[P.length >> 1];
  if (!landAt(mask, m[0], m[1])) { offLand++; continue; }
  const key = (w.ref || w.name || String(w.id)) + '|' + w.hw;
  const group = byRef.get(key) || [];
  if (group.some((k) => parallel(P, k.pts))) { dropped++; continue; }
  const rec = { id: w.id, hw: w.hw, ref: w.ref || null, name: w.name || null, lanes: w.lanes ? +w.lanes : null, maxspeed: w.maxspeed ? parseInt(w.maxspeed, 10) || null : null, bridge: !!w.bridge, tunnel: !!w.tunnel, pts: P };
  group.push(rec); byRef.set(key, group); kept.push(rec);
}

const roads = kept.map((r) => ({ ...r, pts: simplify(r.pts, TOL).map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]) }));
let km = 0;
for (const r of roads) for (let i = 1; i < r.pts.length; i++) km += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]) * KOREA_SCALE / 1000;

const doc = {
  licence: 'Derived from OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). Credit required in game.',
  scale: KOREA_SCALE, unit: 'map metres, local frame not applied (worldmap internal coordinates)',
  roads,
};
fs.writeFileSync(out, JSON.stringify(doc));
console.log(`${roads.length} ways kept, ${dropped} duplicate carriageways, ${offLand} off land, ${km.toFixed(0)} km real, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
