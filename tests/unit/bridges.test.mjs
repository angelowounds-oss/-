// The towers of the named sea bridges (WLD-22c, ADR-0037): each bridge of the table finds its deck on the compiled roads at its place; the towers
// stand a main span apart (at the map's scale) beside the deck, from under the sea up past the deck; the tower tops are at the table's height at the
// terrain's scale (or a fifth of the span over the deck); the stays or cables reach down to the deck and no member lies across the carriageways under
// a car's height.
import '../../build/jobs.mjs';
const { BRIDGES } = await import('../../src/regions/index.js');
const { findDeck, bridgeParts } = await import('../../src/bridgeparts.js');
const { SEA } = await import('../../src/worldmap.js');
const { KOREA_SCALE } = await import('../../src/koreamap.js');
const bad = [], m = {};
// the vertices and triangles of the parts (highways.js's accumulator needs three.js)
class Acc { constructor() { this.p = []; this.i = []; } quad(a, b, c, d) { const k = this.p.length / 3; for (const q of [a, b, c, d]) this.p.push(...q); this.i.push(k, k + 1, k + 2, k, k + 2, k + 3); } }
for (const b of BRIDGES) {
  const D = findDeck(b); if (!D) { bad.push(['no deck found', b.id]); continue; }
  const A = new Acc(), legs = [], { top } = bridgeParts(b, D, A, legs), span = b.span / KOREA_SCALE;
  m[b.id] = { deck: +(D.y - SEA).toFixed(1), top: +(top - SEA).toFixed(1), half: +D.half.toFixed(1), legs: legs.length, tris: A.i.length / 3 };
  if (legs.length !== 4) bad.push(['legs', b.id, legs.length]);
  if (!(top > D.y + span * 0.19)) bad.push(['tower top under the deck plus a fifth of the span', b.id, top, D.y]);
  if (Math.abs(top - Math.max(SEA + b.pylon * 0.25, D.y + span * 0.2)) > 0.01) bad.push(['tower top off the table', b.id]);
  for (const l of legs) {
    const o = Math.abs((l.x - D.x) * D.rx + (l.z - D.z) * D.rz), s = Math.abs((l.x - D.x) * D.tx + (l.z - D.z) * D.tz);
    if (o < D.half) bad.push(['a leg on the carriageway', b.id, o, D.half]); if (Math.abs(s - span / 2) > 0.5) bad.push(['legs not a main span apart', b.id, s * 2, span]);
    if (l.y0 > SEA - 1 || l.y1 !== top) bad.push(['leg not from the sea bed to the top', b.id, l.y0, l.y1]);
  }
  // no vertex inside the space a vehicle drives through: over the deck, within its half width less the edge, up to 4.5 m (between the towers)
  const P = A.p; let inside = 0;
  for (let k = 0; k < P.length; k += 3) {
    const dx = P[k] - D.x, dz = P[k + 2] - D.z, oo = dx * D.rx + dz * D.rz, ss = dx * D.tx + dz * D.tz, y = P[k + 1] - D.yAt(ss, oo);
    if (Math.abs(ss) < span / 2 - 3 && Math.abs(oo) < D.half - 1 && y > 0.3 && y < 4.5) inside++;
  }
  if (inside) bad.push(['members over the carriageways', b.id, inside]);
  // how far apart the two carriageways stand at the middle of the span (the stays and hangers end on each one's own surface, yAt)
  m[b.id].deckSpread = +(Math.abs(D.yAt(0, -D.half / 2) - D.yAt(0, D.half / 2))).toFixed(1);
  let ymax = -Infinity; for (let k = 1; k < P.length; k += 3) ymax = Math.max(ymax, P[k]); m[b.id].height = +(ymax - SEA).toFixed(1);
  if (ymax > top + 0.01) bad.push(['a member over the tower tops', b.id, ymax, top]);
}
if (Object.keys(m).length !== BRIDGES.length) bad.push(['bridges built', Object.keys(m).length, BRIDGES.length]);
console.log('RESULT ' + JSON.stringify({ test: 'bridges', pass: bad.length === 0, metrics: m, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
