// The route planner over the highway graph (pure): every pair of cities is joined, routes are not absurdly long, and the graph part follows highways.
import '../../build/jobs.mjs';   // the compiled region when it is baked: its roads are the capital's part of the graph, and it was cut off from the other cities' highways
import { Router, graph } from '../../src/worldnav.js';
import { cities } from '../../src/worldmap.js';
import { region } from '../../src/region.js';

const bad = [], tg = performance.now(), G = graph(), gMs = performance.now() - tg, t0 = performance.now(), R = new Router(() => null), cs = cities(), rows = [], room = { zero: 0, lane: 0, bad: 0 };   // the routes are timed, the graph's build apart
if (G.n < 5000) bad.push(['graph too small', G.n]);
for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
  const a = cs[i], b = cs[j]; if ((a.viaRegion || b.viaRegion) && !region()) continue;   // its road is the compiled region's (ADR-0037); without the region the island has none at 1:1
  const r = R.route(a.x + 60, a.z, b.x, b.z), d = Math.hypot(a.x - b.x, a.z - b.z);
  if (r.straight) bad.push(['no route', a.id, b.id]); else if (r.length > d * 2.6 || r.length < d * 0.95) bad.push(['route length', a.id, b.id, Math.round(r.length), Math.round(d)]);
  rows.push(Math.round(r.length / d * 100) / 100);
  // [5]: the room for an overtake to the outer side, never negative; on a compiled one-way line (its route in the outer lane) none
  for (const p of r.pts || []) { const q = p[5]; if (!(q >= 0)) room.bad++; else if (q === 0) room.zero++; else room.lane++; }
}
if (room.bad) bad.push(['route points without outer room', room.bad]);
if (region() && !room.zero) bad.push(['no route point in an outer lane (compiled one-way lines)']);
const ms = performance.now() - t0; if (ms > 6000) bad.push(['slow', ms]);
console.log('RESULT ' + JSON.stringify({ test: 'worldnav-unit', pass: bad.length === 0, metrics: { nodes: G.n, graphMs: Math.round(gMs), mainShare: +G.mainShare.toFixed(3), pairs: rows.length, ms: Math.round(ms), ratioMin: Math.min(...rows), ratioMax: Math.max(...rows), room }, note: bad.slice(0, 4).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
