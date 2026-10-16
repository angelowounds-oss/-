// The highway network (src/roadnet.js): rings around every city, highways trimmed onto the rings with an interchange at each junction,
// four connectors from the capital's loop, grades within the limit, no NaN, classes (bridge / tunnel) exist but are minorities, the spatial
// index finds a road at its own centre line, and carving puts the terrain at the road surface there.
import { net, roadAt, carve, DS, GRADE, groundH } from '../../src/roadnet.js';
import { cities, highways } from '../../src/worldmap.js';
const bad = [];
const t0 = performance.now(); const N = net(); const ms = performance.now() - t0;
const cs = cities();
for (const c of cs) if (!N.rings.get(c.id) || !N.rings.get(c.id).roads.length) bad.push(['no ring', c.id]);
const kinds = { ring: 0, highway: 0, connector: 0, ramp: 0 }; let km = 0, bridge = 0, tunnel = 0, samples = 0, maxGrade = 0, nan = 0;
for (const r of N.roads) {
  kinds[r.kind]++; if (r.kind === 'ramp') continue;   // ramps are short and steep, they are checked for existence only
  for (let i = 0; i < r.pts.length; i++) { samples++; if (!Number.isFinite(r.y[i]) || !Number.isFinite(r.pts[i][0])) nan++; if (r.cls[i] === 1) bridge++; if (r.cls[i] === 2) tunnel++; if (i) { km += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]); maxGrade = Math.max(maxGrade, Math.abs(r.y[i] - r.y[i - 1]) / Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1])); } }
}
if (nan) bad.push(['NaN', nan]);
if (kinds.highway < highways().length - 1) bad.push(['highways lost', kinds.highway, highways().length]);
if (kinds.connector !== 4) bad.push(['connectors', kinds.connector]);
if (maxGrade > GRADE + 0.03) bad.push(['grade', maxGrade]);
if (N.junctions.length < kinds.highway * 2) bad.push(['junctions', N.junctions.length]);
const types = new Set(N.junctions.map((j) => j.type)); if (types.size < 3) bad.push(['interchange types', [...types]]);
if (bridge / samples > 0.2 || tunnel / samples > 0.2) bad.push(['too many bridges/tunnels', bridge, tunnel, samples]);
if (kinds.ramp < N.junctions.length) bad.push(['ramps', kinds.ramp]);
if (!N.tolls.length || !N.services.length || !N.gantries.length) bad.push(['facilities', N.tolls.length, N.services.length, N.gantries.length]);
// index + carve
let miss = 0, off = 0; for (let k = 0; k < 400; k++) { const flat = N.roads.filter((q) => q.kind !== 'ramp'), r = flat[k % flat.length], i = (k * 37) % r.pts.length, p = r.pts[i], q = roadAt(p[0], p[1]); if (!q || q.d > 1) miss++; else if (r.cls[i] === 0 && Math.abs(carve(p[0], p[1], 50) - (r.y[i] - 0.25)) > 1.0) off++; }
if (miss) bad.push(['roadAt missed', miss]); if (off > 12) bad.push(['carve off the surface', off]);
if (roadAt(0, 0) !== null) bad.push(['road at the capital centre']);
if (ms > 4000) bad.push(['slow', ms]);
console.log('RESULT ' + JSON.stringify({ test: 'roadnet', pass: bad.length === 0, metrics: { ms: Math.round(ms), roads: N.roads.length, kinds, km: Math.round(km / 1000), junctions: N.junctions.length, types: [...types], tolls: N.tolls.length, services: N.services.length, gantries: N.gantries.length, bridgePct: +(100 * bridge / samples).toFixed(1), tunnelPct: +(100 * tunnel / samples).toFixed(1), maxGrade: +maxGrade.toFixed(3), bad: bad.slice(0, 6) }, note: '' }));
process.exitCode = bad.length ? 1 : 0;
void DS; void groundH;
