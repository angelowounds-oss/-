// Save files (SAV-01/02, src/savefile.js): an unversioned save (v0, the format before versioning) is brought to the current version with its
// contents kept; a save from a newer build is read but flagged so it is never written over; a slot that does not parse falls back to its backup;
// every write keeps the previous good text as the backup; a snapshot over the size budget leaves out the oldest bullet holes and events until it
// fits (the newest are kept); a full storage is reported as 'quota' instead of being ignored; a save file brought back in (SAV-03) is checked:
// a v0 file is brought up to date, other JSON, broken text and a newer build's file are refused.
import { SAVE_V, BUDGET, migrate, readSave, writeSave, encode, importText } from '../../src/savefile.js';

const bad = [];
const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
// two saves in the v0 format as the game wrote them (no `v`; a world with doors and memory; one without a world at all)
const V0 = [
  { cash: 1234.5, mission: 3, kills: 17, world: { doors: { 'L12:0': 1 }, glass: {}, taken: { a: true }, moved: {}, homes: { u1: { x: 1, z: 2, y: 0 } }, bank: 900, memory: { holes: [[1, 2, 3]], scorch: [], wrecks: [], events: [], said: 0, knowers: {} } } },
  { cash: 50, mission: 0 },
];

// v0 -> current: contents kept, missing parts made empty, version set
for (const [k, s] of V0.entries()) {
  const r = migrate(JSON.parse(JSON.stringify(s)));
  if (r.from !== 0 || r.future || r.data.v !== SAVE_V) bad.push(['v0 migrate', k, JSON.stringify({ from: r.from, future: r.future, v: r.data.v })]);
  if (r.data.cash !== s.cash || r.data.mission !== s.mission) bad.push(['v0 contents', k]);
  for (const f of ['doors', 'glass', 'taken', 'moved', 'homes']) if (!r.data.world[f] || typeof r.data.world[f] !== 'object') bad.push(['v0 missing', k, f]);
}
if (migrate(JSON.parse(JSON.stringify(V0[0]))).data.world.doors['L12:0'] !== 1) bad.push(['v0 doors lost']);
// a save already current is unchanged; one from a newer build is flagged and left as it is
{ const cur = migrate({ v: SAVE_V, cash: 7, world: { doors: {} } }); if (cur.from !== SAVE_V || cur.data.cash !== 7) bad.push(['current']); }
{ const fut = migrate({ v: SAVE_V + 5, cash: 9, novel: { x: 1 } }); if (!fut.future || fut.data.v !== SAVE_V + 5 || !fut.data.novel) bad.push(['future']); }
// junk is a new game
for (const j of [null, 5, 'x', [1, 2]]) { const r = migrate(j); if (r.data.v !== SAVE_V || r.data.cash !== 0) bad.push(['junk', JSON.stringify(j)]); }

// reading: the slot; a slot that does not parse falls back to its backup; nothing at all is a new game; the pre-slot key is the last resort
{
  const st = mem({ s_1: JSON.stringify(V0[0]), s_2: '{"cash": 3,', s_2_bak: JSON.stringify({ v: 1, cash: 777 }), legacy: JSON.stringify({ cash: 42 }) });
  const a = readSave(st, 's_1', 'legacy'), b = readSave(st, 's_2', 'legacy'), c = readSave(st, 's_3', null), d = readSave(st, 's_3', 'legacy');
  if (a.source !== 'slot' || a.data.cash !== 1234.5 || a.from !== 0) bad.push(['read slot', a.source, a.data.cash]);
  if (b.source !== 'backup' || b.data.cash !== 777) bad.push(['read backup', b.source, b.data.cash]);
  if (c.source !== 'new' || c.data.cash !== 0) bad.push(['read new', c.source]);
  if (d.source !== 'legacy' || d.data.cash !== 42) bad.push(['read legacy', d.source]);
}

// writing: the previous good text becomes the backup; a broken previous text is not copied over a good backup
{
  const st = mem();
  const w1 = writeSave(st, 's_1', { v: SAVE_V, cash: 1 }), w2 = writeSave(st, 's_1', { v: SAVE_V, cash: 2 });
  if (!w1.ok || !w2.ok || JSON.parse(st.getItem('s_1')).cash !== 2 || JSON.parse(st.getItem('s_1_bak')).cash !== 1) bad.push(['backup on write', st.getItem('s_1'), st.getItem('s_1_bak')]);
  st.setItem('s_1', '{broken'); writeSave(st, 's_1', { v: SAVE_V, cash: 3 });
  if (JSON.parse(st.getItem('s_1_bak')).cash !== 1 || JSON.parse(st.getItem('s_1')).cash !== 3) bad.push(['broken not backed up', st.getItem('s_1_bak')]);
}

// budget: 2 MB of bullet holes and events are cut, oldest first, to fit 1 MB; the newest entries and everything else are kept
let trim = null;
{
  const holes = [], events = [];
  for (let i = 0; i < 40000; i++) holes.push([i, +(i * 0.37).toFixed(2), +(i * 0.11).toFixed(2), 1.2, 0, 1]);
  for (let i = 0; i < 6000; i++) events.push({ type: 'shot', t: i, zone: 'z' + (i % 50), note: 'x'.repeat(40) });
  const snap = { v: SAVE_V, cash: 5, world: { doors: { d: 1 }, memory: { holes, events, scorch: [], wrecks: [] } } };
  const big = JSON.stringify(snap).length, { text, trimmed } = encode(snap), o = JSON.parse(text);
  trim = { before: big, after: text.length, trimmed, holes: o.world.memory.holes.length, events: o.world.memory.events.length };
  if (big <= BUDGET || text.length > BUDGET || !trimmed) bad.push(['budget', JSON.stringify(trim)]);
  const lastHole = o.world.memory.holes[o.world.memory.holes.length - 1], lastEvent = o.world.memory.events[o.world.memory.events.length - 1];
  if (lastHole[0] !== 39999 || lastEvent.t !== 5999 || o.world.doors.d !== 1 || o.cash !== 5) bad.push(['budget kept the wrong part', JSON.stringify(lastHole), lastEvent && lastEvent.t]);
  if (holes.length !== 40000) bad.push(['budget changed the live state']);
  const st = mem(), w = writeSave(st, 's_1', snap); if (!w.ok || w.bytes > BUDGET || !w.trimmed) bad.push(['budget write', JSON.stringify(w)]);
}

// a full storage is reported, not ignored
{
  const st = mem(); st.setItem = () => { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; };
  const w = writeSave(st, 's_1', { v: SAVE_V, cash: 1 }); if (w.ok || w.error !== 'quota') bad.push(['quota', JSON.stringify(w)]);
}

// a save file brought back in (SAV-03)
{
  const a = importText(JSON.stringify(V0[0])), b = importText('{"name": "package"}'), c = importText('{"cash": 1,'), d = importText(JSON.stringify({ v: SAVE_V + 1, cash: 2 })), e = importText('[1, 2]');
  if (!a.ok || a.from !== 0 || a.data.v !== SAVE_V || a.data.cash !== 1234.5 || a.data.world.doors['L12:0'] !== 1) bad.push(['import v0', JSON.stringify({ ok: a.ok, from: a.from })]);
  if (b.ok || b.error !== 'not-a-save') bad.push(['import other json', b.error]);
  if (c.ok || c.error !== 'parse') bad.push(['import broken', c.error]);
  if (d.ok || d.error !== 'future') bad.push(['import future', d.error]);
  if (e.ok || e.error !== 'not-a-save') bad.push(['import array', e.error]);
}

console.log('RESULT ' + JSON.stringify({ test: 'savefile', pass: bad.length === 0, metrics: { version: SAVE_V, budget: BUDGET, trim }, note: bad.map((x) => x.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
