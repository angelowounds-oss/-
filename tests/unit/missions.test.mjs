// The data missions (EV-70): every mission of src/missions/defs.js is plain data the runner can play: known step kinds with their fields, place
// rules with known kinds and a sane range, saved names defined before they are used, the twelve kinds of contract present, and the save index
// walking the story once and then the pool round and round.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STORY, POOL, STEP_KINDS, missionDef } from '../../src/missions/defs.js';
import { PLACE_KINDS } from '../../src/placeindex.js';

// check one step (and its fallback) against the schema; `saved` holds the names saved by earlier steps
function checkStep(id, s, saved) {
  assert.ok(STEP_KINDS[s.do], `${id}: unknown step ${s.do}`);
  for (const f of STEP_KINDS[s.do]) assert.ok(s[f] !== undefined, `${id}: ${s.do} needs ${f}`);
  if (s.at) {
    if (s.at.ref) assert.ok(saved.has(s.at.ref), `${id}: ${s.at.ref} used before it is saved`);
    else { assert.ok(s.at.min > 0 && s.at.max > s.at.min, `${id}: range`); for (const k of s.at.kinds || []) assert.ok(PLACE_KINDS.includes(k), `${id}: kind ${k}`); if (s.at.from && s.at.from !== 'player') assert.ok(saved.has(s.at.from), `${id}: from ${s.at.from}`); }
  }
  for (const k of [s.npc, s.do === 'deliverCar' ? s.car : null]) if (k) assert.ok(saved.has(k), `${id}: ${k} used before it is saved`);
  for (const m of (s.text || '').matchAll(/\{(\w+)\}/g)) assert.ok(saved.has(m[1]) || m[1] === s.save, `${id}: text names ${m[1]}`);
  if (s.fallback) checkStep(id + ' fallback', s.fallback, saved);
}

test('every mission is playable data', () => {
  const ids = new Set();
  for (const d of [...STORY, ...POOL]) {
    assert.ok(!ids.has(d.id), 'duplicate id ' + d.id); ids.add(d.id);
    assert.ok(d.title && d.text && d.reward > 0 && d.steps.length, d.id);
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(d)), d.id);
    const saved = new Set();
    for (const s of d.steps) { checkStep(d.id, s, saved); if (s.save) saved.add(s.save); }
  }
});

test('the twelve contract kinds are there', () => {
  const types = new Set(POOL.map((d) => d.type));
  for (const t of ['delivery', 'taxi', 'chase', 'escort', 'heist', 'kidnap', 'arson', 'infiltrate', 'collect', 'race', 'photo', 'rescue']) assert.ok(types.has(t), t);
});

test('the runner plays every step kind', () => {
  const src = fs.readFileSync(new URL('../../src/missions/runner.js', import.meta.url), 'utf8');
  for (const k of Object.keys(STEP_KINDS)) assert.match(src, new RegExp(`\\n  ${k}: \\{`), k);
});

test('story once, then the pool round and round', () => {
  STORY.forEach((d, i) => assert.equal(missionDef(i), d));
  assert.equal(missionDef(STORY.length), POOL[0]);
  assert.equal(missionDef(STORY.length + POOL.length + 2), POOL[2]);
});
