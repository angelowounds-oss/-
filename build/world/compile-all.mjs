// The whole country's compiled regions (EV-09, ADR-0044): every piece of build/world/pieces.mjs through its chain (build/world/chain.mjs: compile, grade,
// buildings, street fit, streets), as many side by side as the memory allows, a failed piece tried again, each piece's output checked and the
// placement audit run on it, and one summary table of the pieces' stats.json numbers.
//   node build/world/compile-all.mjs [--pieces gyeonggi,jeju~1,...] [--capital] [--mem 14] [--jobs 2] [--retries 1] [--no-audit] [--dry]
//     --pieces    province ids or piece names (default: all 31 pieces); --capital adds the capital
//     --mem       the GB the queue may give the pieces (default 85 % of the machine); a piece holds its chain's heap (chain.mjs heapOf) plus 10 %
//     --jobs      at most this many pieces at once (default: as many as --mem holds)
//     --retries   a piece whose chain fails is run again this many times (its chain goes on from the step that failed)
//     --dry       print the plan (pieces, the steps each is due, the slots) and stop
// Writes build/baked/world/<piece>/chain.log (the steps' output), <piece>/chain-run.jsonl (each step's time and peak memory) and
// build/baked/world/compile-all.json (the summary). A piece is checked by the child that ran it (its region read back, graded with this
// GRADE_VERSION, buildings and streets present), so the queue process itself holds no region.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { PIECES, piecesFor } from './pieces.mjs';
import { regionChain, heapOf } from './chain.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'), WORLD = path.join(ROOT, 'build/baked/world');
const argv = process.argv.slice(2), flag = (k) => argv.includes('--' + k), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const { V_SCALE } = await import('../../src/koreamap.js');

// ---- a child: one piece's chain, its check and its audit (run by the queue below as `compile-all.mjs --one <piece>`)
if (flag('one')) {
  const id = opt('one'), dir = path.join(WORLD, id), report = path.join(dir, 'chain-run.jsonl'); fs.mkdirSync(dir, { recursive: true });
  // a step in its own node with the chain's heap, through step.mjs (which records its time and peak memory); a failed step stops the chain
  const run = (script, heap, ...a) => {
    const r = spawnSync(process.execPath, ['--max-old-space-size=' + heap, path.join(ROOT, 'build/world/step.mjs'), report, script, ...a], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`${script} exited ${r.status ?? r.signal}`);
  };
  const ran = regionChain(id, run, { V: V_SCALE, root: ROOT });
  // the check: the region reads back, is graded by this grade.mjs, and has roads; its buildings and streets are there
  const { readRegion } = await import('./emit.mjs'), { GRADE_VERSION } = await import('./grade.mjs');
  const R = readRegion(path.join(dir, 'region.bin')), bad = [];
  if (!R) bad.push('region.bin unreadable'); else { if (R.graded !== GRADE_VERSION) bad.push(`graded ${R.graded}, want ${GRADE_VERSION}`); if (!R.roads.length) bad.push('no roads'); }
  for (const f of ['buildings.bin', 'streets.bin']) if (!fs.existsSync(path.join(dir, f))) bad.push(f + ' missing');
  const check = { ran, roads: R ? R.roads.length : 0, bad };
  // the placement audit (tests/unit/placement.test.mjs, WLD-35) on this piece
  let audit = null;
  if (!flag('no-audit') && !bad.length) {
    const a = spawnSync(process.execPath, [path.join(ROOT, 'tests/unit/placement.test.mjs')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, WORLD_REGION: id }, maxBuffer: 64 << 20 });
    const line = (a.stdout || '').split('\n').filter((l) => l.startsWith('RESULT ')).pop();
    audit = line ? (({ pass, note, metrics }) => ({ pass, note: (note || '').slice(0, 400), metrics }))(JSON.parse(line.slice(7))) : { pass: false, note: 'no RESULT (exit ' + a.status + ')' };
  }
  fs.writeFileSync(path.join(dir, 'chain-check.json'), JSON.stringify({ check, audit }, null, 1));
  process.exit(bad.length ? 3 : 0);
}

// ---- the queue
const want = opt('pieces'), list = [...(flag('capital') ? [{ name: 'capital' }] : []), ...(want ? piecesFor(want.split(',')) : PIECES)];
if (!list.length) { console.error('compile-all: no piece matches', want); process.exit(2); }
const memMB = Number(opt('mem', 0)) * 1024 || Math.floor(os.totalmem() / 1048576 * 0.85), need = (id) => Math.round(heapOf(id) * 1.1);
const jobs = Math.max(1, Math.min(Number(opt('jobs', 0)) || Infinity, Math.floor(memMB / need('piece')) || 1, list.length)), retries = Number(opt('retries', 1));

if (flag('dry')) {
  console.log(`compile-all: ${list.length} pieces, ${jobs} at once (memory ${(memMB / 1024).toFixed(1)} GB, a piece ${(need('piece') / 1024).toFixed(1)} GB), ${retries} retries`);
  for (const p of list) { const due = regionChain(p.name, () => {}, { V: V_SCALE, root: ROOT }); console.log(`  ${p.name.padEnd(14)} ${due.length ? due.join(' ') : 'up to date'}`); }
  process.exit(0);
}

// a piece's numbers for the table, from its stats files (missing ones are left out)
const read = (id, f) => { try { return JSON.parse(fs.readFileSync(path.join(WORLD, id, f), 'utf8')); } catch { return null; } };
function summary(id) {
  const s = read(id, 'stats.json'), b = read(id, 'buildings-stats.json'), t = read(id, 'streets-stats.json'), g = read(id, 'grade-stats.json'), c = read(id, 'chain-check.json');
  const steps = fs.existsSync(path.join(WORLD, id, 'chain-run.jsonl')) ? fs.readFileSync(path.join(WORLD, id, 'chain-run.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const km = s?.roads ? Math.round(Object.values(s.roads).reduce((k, o) => k + (o && o.kmReal ? o.kmReal : 0), 0)) : null;
  return { landKm2: s ? Math.round(s.landCells * 256 / 1e6) : null, places: s?.places?.placed ?? null, roadKm: km, roads: c?.check?.roads ?? null, buildings: b?.count ?? null, lamps: t?.lamps ?? null, trees: t?.trees ?? null,
    graded: g?.version ?? null, joins: g?.joins ? { relaid: g.joins.relaid, welded: g.joins.welded, rejoined: g.joins.rejoined, dropped: g.joins.dropped } : null,
    peakMB: steps.reduce((m, x) => Math.max(m, x.rssMB || 0), 0) || null, steps: steps.slice(-12), check: c?.check?.bad || null, audit: c?.audit ? { pass: c.audit.pass, note: c.audit.note } : null };
}

const t0 = Date.now(), res = new Map(), queue = [...list];
// run one piece's child to the end (a retry continues its chain); resolves with its record
const runPiece = async (p) => {
  const id = p.name, dir = path.join(WORLD, id); fs.mkdirSync(dir, { recursive: true }); fs.rmSync(path.join(dir, 'chain-check.json'), { force: true });
  const log = fs.openSync(path.join(dir, 'chain.log'), 'a'), s0 = Date.now(); let code = -1, tries = 0;
  while (tries <= retries) {
    tries++; fs.writeSync(log, `\n== ${new Date().toISOString()} try ${tries}\n`);
    code = await new Promise((done) => spawn(process.execPath, [new URL(import.meta.url).pathname, '--one', id, ...(flag('no-audit') ? ['--no-audit'] : [])], { cwd: ROOT, stdio: ['ignore', log, log] }).on('close', (c) => done(c)));
    if (code === 0 || code === 3) break;   // 3: the chain ran but its output failed the check; running it again would not change that
    console.log(`  ${id}: try ${tries} failed (exit ${code})`);
  }
  fs.closeSync(log);
  const r = { piece: id, status: code === 0 ? 'ok' : code === 3 ? 'check' : 'failed', tries, minutes: +((Date.now() - s0) / 60000).toFixed(1), ...summary(id) };
  if (r.status === 'ok' && r.audit && !r.audit.pass) r.status = 'audit';
  console.log(`  ${id}: ${r.status} in ${r.minutes} min (peak ${r.peakMB} MB)`); return r;
};
console.log(`compile-all: ${list.length} pieces, ${jobs} at once`);
await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) { const p = queue.shift(); res.set(p.name, await runPiece(p)); } }));

const rows = list.map((p) => res.get(p.name)), out = { at: new Date().toISOString(), minutes: +((Date.now() - t0) / 60000).toFixed(1), jobs, memMB, pieces: rows };
fs.writeFileSync(path.join(WORLD, 'compile-all.json'), JSON.stringify(out, null, 1));
const col = (v) => (v == null ? '-' : String(v));
console.log('\n| piece | status | tries | min | peak GB | land km² | road km | lines | buildings | lamps | places | audit |\n|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.piece} | ${r.status} | ${r.tries} | ${r.minutes} | ${r.peakMB ? (r.peakMB / 1024).toFixed(1) : '-'} | ${col(r.landKm2)} | ${col(r.roadKm)} | ${col(r.roads)} | ${col(r.buildings)} | ${col(r.lamps)} | ${col(r.places)} | ${r.audit ? (r.audit.pass ? 'pass' : 'fail') : '-'} |`);
process.exit(rows.every((r) => r.status === 'ok') ? 0 : 1);
