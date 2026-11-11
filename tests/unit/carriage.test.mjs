// The carriageway a fitted street is drawn and driven at (src/carriage.js, WLD-33), and the airport's streets cut clear of its runways, apron and
// buildings (src/citylayout.js, WLD-34).
import { carriage, MIN_LANE } from '../../src/carriage.js';
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
console.log('RESULT ' + JSON.stringify({ test: 'carriage', pass: bad.length === 0, metrics: m, note: bad.length ? JSON.stringify(bad) : '' }));
process.exitCode = bad.length ? 1 : 0;
