// Analyse tests/out/coverage.raw.json (written by tests/coverage.mjs) against the engine source files.
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'tests/out/coverage.raw.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'dist/aether.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engSrc = scripts.find(s => s.startsWith("(()=>{'use strict';"));
const eng = raw.find(c => c.len === engSrc.length);
if (!eng) throw Error('engine coverage entry not found (lengths: ' + raw.map(r => r.len).join(',') + ' vs ' + engSrc.length + ')');
const files = fs.readdirSync(path.join(root, 'src/engine')).filter(f => f.endsWith('.js')).sort();
let off = engSrc.indexOf(fs.readFileSync(path.join(root, 'src/engine', files[0]), 'utf8').slice(0, 80)); const spans = [];
for (const f of files) { const t = fs.readFileSync(path.join(root, 'src/engine', f), 'utf8'); spans.push({ f, a: off, b: off + t.length }); off += t.length; }
const used = new Uint8Array(engSrc.length);
const ranges = eng.functions.flatMap(fn => fn.ranges).sort((x, y) => x.startOffset - y.startOffset || y.endOffset - x.endOffset);
for (const r of ranges) used.fill(r.count > 0 ? 1 : 0, r.startOffset, r.endOffset);
const per = spans.map(s => { let u = 0; for (let i = s.a; i < s.b; i++) u += used[i]; return { file: s.f, bytes: s.b - s.a, executed: u, never: s.b - s.a - u, pct: +(100 * u / (s.b - s.a)).toFixed(1) }; });
console.table(per);
const dead = eng.functions.filter(fn => fn.functionName && fn.ranges[0].count === 0 && fn.ranges[0].endOffset - fn.ranges[0].startOffset > 300).map(fn => { const r = fn.ranges[0], sp = spans.find(s => r.startOffset >= s.a && r.startOffset < s.b); return { name: fn.functionName, file: sp?.f, bytes: r.endOffset - r.startOffset }; }).sort((a, b) => b.bytes - a.bytes);
fs.writeFileSync(path.join(root, 'tests/out/coverage.json'), JSON.stringify({ per, dead: dead.slice(0, 120) }, null, 1));
console.log('never-executed named functions > 300 B:', dead.length, 'total bytes', dead.reduce((a, b) => a + b.bytes, 0));
for (const d of dead.slice(0, 45)) console.log(String(d.bytes).padStart(7), d.file, d.name);
