// Lint js/engine.js (after tools/build.mjs) and map every no-undef back to src/engine file:line.   node tools/undef.mjs [--ctx]
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let out = ''; try { execFileSync('/opt/node22/lib/node_modules/eslint/bin/eslint.js', ['js/engine.js', '-f', 'json'], { cwd: root, maxBuffer: 1e8 }); } catch (e) { out = e.stdout.toString(); }
if (!out) { console.log('no lint findings'); process.exit(0); }
const msgs = JSON.parse(out)[0].messages.filter(m => m.ruleId === 'no-undef');
const files = fs.readdirSync(path.join(root, 'src/engine')).filter(f => f.endsWith('.js')).sort(); const spans = []; let acc = 0;
for (const f of files) { const n = fs.readFileSync(path.join(root, 'src/engine', f), 'utf8').split('\n').length - 1; spans.push([f, acc + 1, acc + n]); acc += n; }
const by = {}; for (const m of msgs) { const s = spans.find(x => m.line >= x[1] && m.line <= x[2]); const key = s[0] + ':' + (m.line - s[1] + 1); (by[key] = by[key] || []).push(m.message.match(/'([^']+)'/)[1]); }
for (const k of Object.keys(by)) console.log(k.padEnd(34), [...new Set(by[k])].join(','));
console.log(msgs.length, 'findings');
