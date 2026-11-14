// The place index (EV-72): encode/decode keeps every place, the cell queries find exactly the places a brute-force search finds, and the real
// extract (when build/.osm-cache/poi.json is there) projects into the game's frame with every kind present.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encodePlaces, decodePlaces, PLACE_KINDS } from '../../src/placeindex.js';
import { readPlaces, POI_JSON } from '../../build/world/placeindex.mjs';

let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const sample = Array.from({ length: 3000 }, (_, i) => ({ k: i % PLACE_KINDS.length, x: (rnd() - 0.5) * 40000, z: (rnd() - 0.5) * 40000, name: i % 7 ? '가게' + i : '' }));

test('round trip and names', () => {
  const I = decodePlaces(encodePlaces(sample));
  assert.equal(I.count, sample.length);
  const got = new Set(Array.from({ length: I.count }, (_, i) => { const p = I.get(i); return `${p.k}:${Math.round(p.x)}:${Math.round(p.z)}:${p.named ? p.name : ''}`; }));
  for (const p of sample) assert.ok(got.has(`${p.k}:${Math.round(Math.fround(p.x))}:${Math.round(Math.fround(p.z))}:${p.name}`));
  const unnamed = Array.from({ length: I.count }, (_, i) => I.get(i)).find((p) => !p.named); assert.ok(unnamed.name.length > 0);   // the kind's label
});

test('near and nearest match brute force', () => {
  const I = decodePlaces(encodePlaces(sample)), all = Array.from({ length: I.count }, (_, i) => I.get(i));
  for (let q = 0; q < 40; q++) {
    const x = (rnd() - 0.5) * 40000, z = (rnd() - 0.5) * 40000, r = 300 + rnd() * 4000, kinds = q % 2 ? new Set(['fuel', 'police']) : undefined;
    const want = all.filter((p) => (!kinds || kinds.has(p.kind)) && (p.x - x) ** 2 + (p.z - z) ** 2 <= r * r).map((p) => p.i).sort((a, b) => a - b);
    assert.deepEqual(I.near(x, z, r, kinds).sort((a, b) => a - b), want);
    const n = I.nearest(x, z, kinds, r), bf = want.map((i) => all[i]).sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2))[0];
    assert.equal(n ? n.i : null, bf ? bf.i : null);
  }
});

test('the real extract', { skip: !fs.existsSync(POI_JSON) }, () => {
  const P = readPlaces(), I = decodePlaces(encodePlaces(P)), c = I.counts();
  for (const k of PLACE_KINDS) assert.ok(c[k] > 100, k + ' ' + c[k]);
  // Seoul City Hall is the frame's origin: there are convenience stores and a police station within 1 km of it
  assert.ok(I.near(0, 0, 1000, new Set(['convenience'])).length > 5);
  assert.ok(I.nearest(0, 0, new Set(['police']), 2000));
  console.log('places', I.count, JSON.stringify(c));
});
