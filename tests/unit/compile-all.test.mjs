// The country's compile queue (EV-09, build/world/compile-all.mjs) without compiling: the plan lists every piece of pieces.mjs (31) with the steps
// its chain is due, a piece list narrows it, the slots follow the memory given (a piece holds its chain's heap and 10 %), and a step run through
// step.mjs leaves its line in the report (time, peak memory, exit code) whether it ends well or fails. build.mjs and compile-all share one chain
// (chain.mjs): its compiler file list leaves the grade's join pass out (a change to joins.mjs grades again, it does not compile again).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PIECES } from '../../build/world/pieces.mjs';
import { NOT_COMPILER, heapOf } from '../../build/world/chain.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '../..'), bad = [], m = {};
const node = (...a) => spawnSync(process.execPath, a, { cwd: ROOT, encoding: 'utf8' });
// the plan
const all = node('build/world/compile-all.mjs', '--dry'), lines = all.stdout.split('\n').filter((l) => /^ {2}\S/.test(l));
m.pieces = lines.length; if (all.status !== 0 || lines.length !== PIECES.length || PIECES.length !== 31) bad.push(['plan of all pieces', all.status, lines.length, PIECES.length]);
for (const l of lines) if (!/(compile|grade|blocks|fit|streets)\.mjs|up to date/.test(l)) bad.push(['plan line without steps', l.trim()]);
const some = node('build/world/compile-all.mjs', '--dry', '--pieces', 'jeju,gangwon', '--capital', '--mem', '31');
const names = some.stdout.split('\n').filter((l) => /^ {2}\S/.test(l)).map((l) => l.trim().split(/\s+/)[0]);
m.some = names; if (names.join(',') !== 'capital,gangwon~1,gangwon~2,gangwon~3,gangwon~4,jeju') bad.push(['narrowed plan', names.join(',')]);
const slots = Number(some.stdout.match(/(\d+) at once/)?.[1]); m.slots31GB = slots;
if (slots !== Math.floor(31 * 1024 / Math.round(heapOf('x') * 1.1))) bad.push(['slots for 31 GB', slots]);
if (Number(node('build/world/compile-all.mjs', '--dry', '--mem', '4').stdout.match(/(\d+) at once/)?.[1]) !== 1) bad.push(['a small machine still runs one piece']);
// a step's report line, for a step that ends well and one that fails
const rep = path.join(os.tmpdir(), `compile-all-test-${process.pid}.jsonl`); fs.rmSync(rep, { force: true });
const ok = node('build/world/step.mjs', rep, 'pieces.mjs'), fail = node('build/world/step.mjs', rep, 'no-such-step.mjs');
const rows = fs.existsSync(rep) ? fs.readFileSync(rep, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []; fs.rmSync(rep, { force: true });
m.report = rows;
if (ok.status !== 0 || rows[0]?.script !== 'pieces.mjs' || rows[0]?.code !== 0 || !(rows[0]?.rssMB > 10)) bad.push(['report of a good step', ok.status, JSON.stringify(rows[0])]);
if (fail.status === 0 || rows[1]?.script !== 'no-such-step.mjs' || rows[1]?.code === 0) bad.push(['report of a failed step', fail.status, JSON.stringify(rows[1])]);
if (rows.length !== 2) bad.push(['one line per step', rows.length]);
// the shared chain
if (!NOT_COMPILER.includes('joins.mjs') || !NOT_COMPILER.includes('compile-all.mjs')) bad.push(['the compiler list takes in non-compiler files']);
if (!fs.readFileSync(path.join(ROOT, 'build/build.mjs'), 'utf8').includes('regionChain(')) bad.push(['build.mjs does not run the shared chain']);
console.log('RESULT ' + JSON.stringify({ test: 'compile-all', pass: !bad.length, metrics: m, note: bad.slice(0, 5).map((b) => b.join(' ')).join(' | ') }));
process.exit(bad.length ? 1 : 0);
