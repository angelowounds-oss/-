// The carriageway a fitted street is drawn and driven at (src/carriage.js, WLD-33), and the airport's streets cut clear of its runways, apron and
// buildings (src/citylayout.js, WLD-34).
import { carriage, MIN_LANE, barrierGap, roadBeneath } from '../../src/carriage.js';
import { buildRoadGrid } from '../../src/roadgrid.js';
import { cities } from '../../src/worldmap.js';
import { layoutCity } from '../../src/citylayout.js';

const bad = [], m = {};
// an unfitted line keeps the compiler's lanes and shoulders, so the highways and arterials are drawn as before
const two = carriage({ lanes: 4 }), one = carriage({ lanes: 2, oneway: 1 });
if (two.half !== 2 * 3.75 + 2.4 || two.n !== 2) bad.push(['unfitted two-way', two]);
if (one.half !== (2 * 3.75 + 2.4) / 2 || one.n !== 2) bad.push(['unfitted one-way', one]);
// a fitted line is drawn at its own half width, its lanes inside it, never under the narrowest urban lane while it has more than one
for (const r of [{ lanes: 2, fit: 1, half: 3.25 }, { lanes: 4, fit: 1, half: 3.25 }, { lanes: 4, fit: 1, half: 7 }, { lanes: 2, oneway: 1, fit: 1, half: 1.75 }, { lanes: 2, fit: 1, half: 1.6 }]) {
  const c = carriage(r), way = c.two ? c.half - 0.12 : 2 * c.half;
  if (c.half !== r.half) bad.push(['fitted half not kept', r, c]);
  if (c.n * c.lane + c.edge > way + 1e-9) bad.push(['lanes wider than the carriageway', r, c]);
  if (c.n > 1 && c.lane < MIN_LANE) bad.push(['two lanes squeezed under the minimum', r, c]);
}
if (!carriage({ lanes: 2, fit: 1, half: 1.25, alley: 1 }).alley) bad.push(['an alley is not marked']);
// the airport: no street piece crosses a runway, the taxiway, the apron or the terminal block
const cs = cities(), i = cs.findIndex((c) => c.type === 'airport');
if (i < 0) bad.push(['no airport city']);
else {
  const c = cs[i], L = layoutCity(c, i), R = c.r, top = R * 0.28;
  const rects = [[-R * 0.95, top, R * 0.95, top + 60], [-R * 0.9, top + 190, R * 0.9, top + 250], [-R * 0.9, top + 70, R * 0.9, top + 105], [-330, top - 330, 330, top - 80], [-210, top - 435, 210, top - 365]];
  let hits = 0; m.roads = L.roads.length / 5;
  for (let k = 0; k < L.roads.length; k += 5) {
    const [x0, z0, x1, z1] = L.roads.slice(k, k + 4), n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4);
    for (let s = 0; s <= n; s++) { const x = x0 + (x1 - x0) * s / n, z = z0 + (z1 - z0) * s / n; if (rects.some((q) => x > q[0] && x < q[2] && z > q[1] && z < q[3])) { hits++; break; } }
  }
  m.throughAirside = hits; if (hits) bad.push(['airport streets through the airside or the terminal', hits]);
}
// the edge barriers left open where another road's surface reaches them (barrierGap). A one-way motorway line whose tail (samples 220-239) runs south
// 6 m beside and 0.45 m under its own start (samples 0-19), as the ring motorway's tail into its start south of 구리; the opposite carriageway 20 m
// the other side; a road 10 m over the start
{
  const S = 8, line = (pts, extra) => ({ kind: 'arterial', hw: 'motorway', ref: '100', oneway: true, lanes: 4, x: Float64Array.from(pts.map((p) => p[0])), z: Float64Array.from(pts.map((p) => p[1])), y: Float64Array.from(pts.map((p) => p[2])), cls: new Uint8Array(pts.length).fill(1), ...extra });
  const pts = [];
  for (let i = 0; i < 20; i++) pts.push([0, -i * S, 25]);                                // the start, south along x = 0
  for (let i = 0; i < 200; i++) pts.push([400 + i * S, -2000 - i * S, 25]);               // far away (the ring)
  for (let i = 0; i < 20; i++) pts.push([6, -i * S, 24.55]);                              // the tail, south along x = 6, 0.45 m lower
  const R = line(pts), opp = line(Array.from({ length: 20 }, (_, i) => [-20, -(19 - i) * S, 25])), over = line(Array.from({ length: 20 }, (_, i) => [0, -i * S, 35]), { ref: '1' });
  const roads = [R, opp, over], grid = buildRoadGrid(roads), N = { CS: grid.CS, roads, grid };   // the index roadnet.js builds (roadgrid.js)
  const fr = (r, i) => ({ x: r.x[i], z: r.z[i], y: r.y[i], rx: -1, rz: 0 });   // heading south: +right is -x
  const half = carriage(R).half + 0.25, gap = (i, o) => barrierGap(N, R, fr(R, i), fr(R, i + 1), o, i);
  m.barrier = { tailIntoStart: gap(230, half), tailOuter: gap(230, -half), startOverTail: gap(10, -half), startMedian: gap(10, half), lone: gap(30, half) };
  if (!m.barrier.tailIntoStart) bad.push(['the tail barrier across its own start kept']);
  if (!m.barrier.startOverTail) bad.push(['the start barrier across its own tail kept']);
  if (m.barrier.tailOuter) bad.push(['the tail outer barrier left open']);
  if (m.barrier.startMedian) bad.push(['the median barrier left open by the other carriageway or the road 10 m over']);
  if (m.barrier.lone) bad.push(['a barrier with no road beside it left open']);
}
// the piers of a bridge (roadBeneath): a link 7 m over a motorway that is itself a viaduct (cls 1, the case near 구리) has none in its lanes; a
// carriageway level with the deck beside it, a tunnel under it and a road over it do not stop a pier, nor does open ground
{
  const S = 8, line = (pts, extra) => ({ kind: 'arterial', hw: 'motorway', ref: '100', oneway: true, lanes: 4, x: Float64Array.from(pts.map((p) => p[0])), z: Float64Array.from(pts.map((p) => p[1])), y: Float64Array.from(pts.map((p) => p[2])), ...extra, cls: new Uint8Array(pts.length).fill(extra.cls ?? 1) });
  const along = (x0, y, n = 40) => Array.from({ length: n }, (_, i) => [x0, -160 + i * S, y]);
  const motorway = line(along(0, 70), { cls: 1 }), link = line(Array.from({ length: 40 }, (_, i) => [-160 + i * S, 0, 77]), { hw: 'motorway_link', ref: '', lanes: 1 });
  const twin = line(Array.from({ length: 40 }, (_, i) => [-160 + i * S, 9, 77]), { hw: 'motorway_link', ref: '', lanes: 1 }), tunnel = line(along(60, 50), { cls: 2 }), over = line(along(120, 90), { cls: 1 });
  const roads = [motorway, link, twin, tunnel, over], grid = buildRoadGrid(roads), N = { CS: grid.CS, roads, grid };
  m.pier = { overMotorway: roadBeneath(N, 0, 0, link, 1.5, 77), besideTwin: roadBeneath(N, -80, 0, link, 1.5, 77), overTunnel: roadBeneath(N, 60, 0, link, 1.5, 77), underRoad: roadBeneath(N, 120, 0, link, 1.5, 77), open: roadBeneath(N, -120, 0, link, 1.5, 77) };
  if (!m.pier.overMotorway) bad.push(['a pier stands in the lanes of a viaduct beneath']);
  if (m.pier.besideTwin) bad.push(['a level carriageway beside the deck stops a pier']);
  if (m.pier.overTunnel) bad.push(['a tunnel beneath stops a pier']);
  if (m.pier.underRoad) bad.push(['a road above stops a pier']);
  if (m.pier.open) bad.push(['open ground stops a pier']);
}
console.log('RESULT ' + JSON.stringify({ test: 'carriage', pass: bad.length === 0, metrics: m, note: bad.length ? JSON.stringify(bad) : '' }));
process.exitCode = bad.length ? 1 : 0;
