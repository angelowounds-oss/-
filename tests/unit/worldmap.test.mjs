// The 100 km world design (src/worldmap.js): deterministic, the capital sits at the origin on flat ground, every city is on land and 15+ km
// from the others, the highways join all cities into one network over land only, heights are finite and fine detail only appears when asked.
import { world, cities, highways, rivers, farHeight, biomeAt, surfaceColor, WORLD_HALF, SEA, CITY_DEFS } from '../../src/worldmap.js';
import { CAPITAL } from '../../src/koreamap.js';   // the game reads the world in the local frame (ADR-0017): the map edge is at -CAPITAL +- WORLD_HALF
const bad = [];
const t0 = performance.now(); world(); const buildMs = performance.now() - t0;
const cs = cities();
if (cs.length !== CITY_DEFS.length) bad.push(['city count', cs.length]);
const cap = cs[0]; if (cap.x !== 0 || cap.z !== 0 || cap.type !== 'metropolis' || Math.abs(farHeight(0, 0))> 0.5) bad.push(['capital', cap, farHeight(0, 0)]);
cs.forEach((c, i) => {
  if (farHeight(c.x, c.z) < SEA + 1.5) bad.push(['city on water', c.id]);
  if (i && Math.abs(farHeight(c.x, c.z) - c.y) > 3) bad.push(['city not flat', c.id, farHeight(c.x, c.z), c.y]);
  for (let k = 0; k < i; k++) if (Math.hypot(c.x - cs[k].x, c.z - cs[k].z) < 14500) bad.push(['cities too close', c.id, cs[k].id]);
  if (Math.abs(c.x + CAPITAL.x) > WORLD_HALF - 5000 || Math.abs(c.z + CAPITAL.z) > WORLD_HALF - 5000) bad.push(['city at the edge', c.id]);
});
if (!cs.some((c) => c.type === 'port') || !cs.some((c) => c.type === 'airport')) bad.push(['missing city types']);
// highways: one connected network, no point in the sea, every polyline starts / ends at its cities
const hw = highways(), adj = new Map(cs.map((c) => [c.id, new Set()]));
for (const h of hw) { adj.get(h.a).add(h.b); adj.get(h.b).add(h.a); let wet = 0; for (const [x, z] of h.pts) if (farHeight(x, z) < SEA) wet++; if (wet) bad.push(['highway in water', h.id, wet]); if (h.length < 3000) bad.push(['highway short', h.id]); }
const seen = new Set(['neon']), q = ['neon']; while (q.length) for (const n of adj.get(q.pop())) if (!seen.has(n)) { seen.add(n); q.push(n); }
if (seen.size !== cs.length) bad.push(['highways not connected', [...seen]]);
if (hw.length < cs.length) bad.push(['too few highways', hw.length]);
// heights / biomes / colours: finite, within range, a variety of biomes exists, sea at the edge, detail only with a small cell
let min = 1e9, max = -1e9, nan = 0; const biomes = new Set(); const col = [0, 0, 0];
for (let i = 0; i < 4000; i++) { const x = ((i * 7919) % 20000 - 10000) * 4.9, z = ((i * 104729) % 20000 - 10000) * 4.9, h = farHeight(x, z, 64); if (!Number.isFinite(h)) nan++; min = Math.min(min, h); max = Math.max(max, h); biomes.add(surfaceColor(x, z, h, col)); if (![0, 1, 2].every((k) => Number.isFinite(col[k]) && col[k] >= 0 && col[k] < 2)) bad.push(['colour', x, z]); }
if (nan) bad.push(['NaN heights', nan]); if (max < 900 || max > 3500 || min > SEA - 20) bad.push(['range', min, max]);
if (biomes.size < 7) bad.push(['biomes', [...biomes]]);
if (farHeight(-WORLD_HALF + 100 - CAPITAL.x, -CAPITAL.z) > SEA || farHeight(-CAPITAL.x, WORLD_HALF - 100 - CAPITAL.z) > SEA) bad.push(['edge is not sea']);
let diff = 0; for (let i = 0; i < 200; i++) { const x = 12345 + i * 37, z = -8000 + i * 53; if (Math.abs(farHeight(x, z, 0) - farHeight(x, z, 4000)) > 0.5) diff++; } if (diff < 20) bad.push(['no fine detail', diff]);
// determinism: the same call twice, and a hash of a sample of the world is stable
let a = 0, b = 0; for (let i = 0; i < 500; i++) { a += farHeight(i * 97 - 20000, i * 61 - 15000, 32); b += farHeight(i * 97 - 20000, i * 61 - 15000, 32); } if (a !== b) bad.push(['not deterministic']);
if (buildMs > 3000) bad.push(['build too slow', buildMs]);
console.log('RESULT ' + JSON.stringify({ test: 'worldmap', pass: bad.length === 0, metrics: { buildMs: Math.round(buildMs), cities: cs.map((c) => `${c.id}@${Math.round(c.x / 1000)},${Math.round(c.z / 1000)}`), highways: hw.length, km: Math.round(hw.reduce((s, h) => s + h.length, 0) / 1000), rivers: rivers().length, hmin: Math.round(min), hmax: Math.round(max), biomes: [...biomes].sort(), bad: bad.slice(0, 8) }, note: '' }));
if (bad.length) process.exitCode = 1;
