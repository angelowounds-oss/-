// Road joins (WLD-36, build/world/joins.mjs, the step 9 of grade.mjs): a line end meets the road it joins at one height, and a join (next/prev, which
// AI traffic and the autopilot follow) leads only to road at the end's height. Three made-up cases (a bridge carried to its end at the wrong height,
// a street ending a few metres under the road it joins at a shared node, a street ending under a viaduct and joined to it in plan), then the graded
// capital region: its joins at a shared node more than 0.3 / 1.5 m apart, and joins more than JOIN_DY apart (17,578 and 10,903 shared steps over
// 1.5 m before the step). Skips the region part with a note when it was never graded.
import path from 'node:path';
import { joinPass, joinSteps, JOIN_DY } from '../../build/world/joins.mjs';
import { readRegion } from '../../build/world/emit.mjs';

const bad = [], m = {};
// a flat 2 km square at 10 m, roads along x
const nx = 129, nz = 129, g = 16, x0 = -1024, z0 = -1024, h = new Int16Array(nx * nz).fill(100);
const G = () => 10;
const line = (id, hw, x0l, x1l, z, y, cls = 0) => { const n = Math.round(Math.abs(x1l - x0l) / 8) + 1; return { id, hw, x: Float32Array.from({ length: n }, (_, i) => x0l + (x1l - x0l) * i / (n - 1)), z: new Float32Array(n).fill(z), y: Float32Array.from({ length: n }, (_, i) => (typeof y === 'function' ? y(i, n) : y)), cls: new Uint8Array(n).fill(cls), next: [], prev: [] }; };
// 1. a viaduct (all bridge) at 60 m from x -800 to 0 between two ground roads at 10 m: it comes down to them, its middle over the ground
const A = line('a', 'trunk', -1000, -800, 0, 10), B = line('b', 'trunk', -800, 0, 0, 60, 1), C = line('c', 'trunk', 0, 200, 0, 10);
// 2. a street (residential) ending at a shared node on the middle of a primary road 3 m higher (an embankment)
const P = line('p', 'primary', -400, 400, 400, 13), S = line('s', 'residential', 0, 0.01, 400, 10); S.x = Float32Array.from({ length: 30 }, () => 0); S.z = Float32Array.from({ length: 30 }, (_, i) => 400 - 232 + i * 8); S.y = new Float32Array(30).fill(10); S.cls = new Uint8Array(30);
// 3. a street ending 6 m (in plan) beside a viaduct 20 m over it, joined to it; a ground road 12 m away at its height
const V = line('v', 'primary', -400, 400, -400, 30, 1), T = line('t', 'residential', -200, -6, -406, 10), W = line('w', 'residential', 6, 300, -394, 10);
const roads = [A, B, C, P, S, V, T, W], ix = new Map(roads.map((r, i) => [r, i]));
B.prev.push([ix.get(A), A.x.length - 1]); B.next.push([ix.get(C), 0]); A.next.push([ix.get(B), 0]); C.prev.push([ix.get(B), B.x.length - 1]);
S.next.push([ix.get(P), 50]); T.next.push([ix.get(V), 49]);
const R = { nx, nz, g, x0, z0, h, roads };
const J = joinPass(R, G);
m.synthetic = J.st;
const n = B.x.length, top = Math.max(...B.y);
if (Math.abs(B.y[0] - 10) > 0.05 || Math.abs(B.y[n - 1] - 10) > 0.05) bad.push(['the viaduct does not come down to the roads it joins', B.y[0], B.y[n - 1]]);
if (top > 13.2 || Math.min(...B.y.slice(60, n - 60)) < 12.9) bad.push(['the viaduct does not clear the ground by 3 m in its middle', top]);
for (let i = 0; i + 1 < n; i++) if (Math.abs(B.y[i + 1] - B.y[i]) > 0.08 * 1.25 * 8 + 0.01) { bad.push(['the viaduct steps', i]); break; }
if (Math.abs(S.y[29] - 13) > 0.05) bad.push(['the street does not meet the road at the shared node', S.y[29]]);
if (Math.abs(S.y[0] - 10) > 0.05) bad.push(['the street moved beyond its blend', S.y[0]]);
for (let i = 0; i + 1 < 30; i++) if (Math.abs(S.y[i + 1] - S.y[i]) > 0.15 * 1.25 * 8 + 0.01) { bad.push(['the street steps', i]); break; }
if (T.next.some(([li]) => R.roads[li] === V)) bad.push(['the street under the viaduct is still joined to it', JSON.stringify(T.next)]);   // dropped: a join moves only along its own road
if (Math.abs(T.y[T.x.length - 1] - 10) > 0.05) bad.push(['the street under the viaduct was moved toward it']);

// the graded capital region
const file = path.join(path.dirname(new URL(import.meta.url).pathname), '../../build/baked/world/capital/region.bin');
const Rg = readRegion(file);
if (!Rg || !Rg.graded) m.region = 'no graded region';
else {
  const s = joinSteps(Rg); Object.assign(m, { region: s });
  // a join that is only near in plan never leads to another height; at a shared node the steps the welds could not take remain (WLD-36 open part:
  // bridge lines laid at the wrong height, tunnels, grade separations), held to what is measured so they cannot grow
  if (s.overDy - s.sharedDy) bad.push(['joins near in plan to a road at another height', s.overDy - s.sharedDy]);
  if (s.shared15 > 7000) bad.push(['steps over 1.5 m at a shared node', s.shared15]);
  if (s.shared03 > 7200) bad.push(['steps over 0.3 m at a shared node', s.shared03]);
  if (s.shared < 80000) bad.push(['joins at a shared node lost', s.shared]);
}
console.log('RESULT ' + JSON.stringify({ test: 'world-road-joins', pass: !bad.length, metrics: { ...m, JOIN_DY }, note: bad.slice(0, 5).map((b) => b.join(' ')).join(' | ') }));
process.exit(bad.length ? 1 : 0);
