// One step of a region's chain run under compile-all.mjs (EV-09): `node step.mjs <report.jsonl> <script> ...args` runs build/world/<script> with
// its own arguments and, when it ends (normally or by process.exit), appends {script, args, sec, rssMB, code} to the report: the step's peak
// memory, which the queue needs to know how many pieces fit side by side, and which no parent process can read for a child.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [report, script, ...args] = process.argv.slice(2), t0 = Date.now(), file = path.join(path.dirname(new URL(import.meta.url).pathname), script);
// the step's line in the report, written once however it ends
let done = false;
const note = (code) => { if (done) return; done = true; fs.appendFileSync(report, JSON.stringify({ script, args, sec: Math.round((Date.now() - t0) / 1000), rssMB: Math.round(process.resourceUsage().maxRSS / 1024), code }) + '\n'); };
process.on('exit', (code) => note(code));
process.argv = [process.argv[0], file, ...args];
try { await import(pathToFileURL(file).href); } catch (e) { console.error(e); note(1); process.exit(1); }
