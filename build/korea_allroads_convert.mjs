// Joins every per-box OpenStreetMap road extract (build/korea_allroads_fetch.py) into one nationwide road list in map metres (KOREA-PLAN D3, E-tier roads).
// Each way is kept once (boxes overlap at their edges), only when its midpoint lies on South Korean land, and tagged with its tier:
// 1 = motorway and national/provincial roads, 2 = city streets, 3 = mountain tracks and paths.
// Data: © OpenStreetMap contributors, ODbL 1.0 (docs/ASSETS.md). Output is a baked file under build/baked/ (not committed, ADR-0013).
// Usage: node build/korea_allroads_convert.mjs <allroads dir> <out.json>
import fs from 'node:fs';
import path from 'node:path';
import { project, koreaMask, landAt, KOREA_SCALE } from '../src/koreamap.js';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: node build/korea_allroads_convert.mjs <allroads dir> <out.json>'); process.exit(2); }

const TIER = {
  motorway: 1, trunk: 1, primary: 1, secondary: 1, motorway_link: 1, trunk_link: 1, primary_link: 1, secondary_link: 1,
  tertiary: 2, unclassified: 2, residential: 2, living_street: 2, service: 2, road: 2, tertiary_link: 2,
  track: 3, path: 3,
};
const TOL = { 1: 25, 2: 12, 3: 8 };   // map m, simplification per tier (tier 1 keeps the motorway setting of korea_roads_convert.mjs)
const PAIR = 120 / KOREA_SCALE;

const mask = koreaMask();
const seen = new Set();
const kept = [];
let offLand = 0, dupe = 0, unknown = 0;

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

// the second carriageway of a divided road runs beside the first: flag it so the graph keeps both sides
const bySet = new Map();   // ref|hw -> projected lines already kept
function parallel(P, group) {
  for (const Q of group) {
    let near = 0;
    for (const [x, z] of P) for (const [u, v] of Q) if (Math.hypot(x - u, z - v) < PAIR) { near++; break; }
    if (near >= 0.8 * P.length) return true;
  }
  return false;
}

for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
  const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const e of doc.elements || []) {
    if (e.type !== 'way' || !e.geometry || seen.has(e.id)) { if (seen.has(e.id)) dupe++; continue; }
    seen.add(e.id);
    const hw = e.tags?.highway;
    const tier = TIER[hw];
    if (!tier) { unknown++; continue; }
    const P = e.geometry.map((p) => { const q = project(p.lon, p.lat); return [q.x, q.z]; });
    if (P.length < 2) continue;
    const m = P[P.length >> 1];
    if (!landAt(mask, m[0], m[1])) { offLand++; continue; }
    const key = (e.tags.ref || e.tags.name || String(e.id)) + '|' + hw;
    const group = bySet.get(key) || [];
    const twin = tier === 1 && parallel(P, group);
    group.push(P); bySet.set(key, group);
    kept.push({ id: e.id, hw, tier, ref: e.tags.ref || null, name: e.tags.name || null, name_en: e.tags['name:en'] || null, lanes: e.tags.lanes ? +e.tags.lanes : null, maxspeed: e.tags.maxspeed ? parseInt(e.tags.maxspeed, 10) || null : null, bridge: !!e.tags.bridge, tunnel: !!e.tags.tunnel, twin, pts: P });
  }
}

const roads = kept.map((r) => ({ ...r, pts: simplify(r.pts, TOL[r.tier]).map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]) }));
const km = { 1: 0, 2: 0, 3: 0 };
for (const r of roads) for (let i = 1; i < r.pts.length; i++) km[r.tier] += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]) * KOREA_SCALE / 1000;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({
  licence: 'Derived from OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). Credit required in game.',
  scale: KOREA_SCALE, unit: 'map metres (worldmap internal coordinates)', roads,
}));
console.log(`${roads.length} ways (${roads.filter((r) => r.twin).length} twins), tier km 1:${km[1].toFixed(0)} 2:${km[2].toFixed(0)} 3:${km[3].toFixed(0)}, ${offLand} off land, ${dupe} dupes, ${unknown} other classes, ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
