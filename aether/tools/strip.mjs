// Remove top-level units of the engine scope from src/engine files.  node tools/strip.mjs <file> --names=a,b --stmts=line,line --keep-names=a,b [--dry]
//   --names     remove declaration units that declare any of these names
//   --stmts     remove units that START on these file-relative lines (1-based) (statements without a name)
//   --all-but   remove every unit of the file except those declaring one of these names (and statements starting on --keep-stmts lines)
import fs from 'node:fs'; import path from 'node:path';
import * as espree from '/opt/node22/lib/node_modules/eslint/node_modules/espree/dist/espree.cjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = process.argv[2]; const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').split('=')[1] || '';
const names = new Set(arg('names').split(',').filter(Boolean)), stmts = new Set(arg('stmts').split(',').filter(Boolean).map(Number));
const allBut = arg('all-but') ? new Set(arg('all-but').split(',')) : null, keepStmts = new Set(arg('keep-stmts').split(',').filter(Boolean).map(Number));
const dry = process.argv.includes('--dry');
const engDir = path.join(root, 'src/engine'); const files = fs.readdirSync(engDir).filter(f => f.endsWith('.js')).sort();
let text = ''; let start = 0, end = 0; for (const f of files) { const t = fs.readFileSync(path.join(engDir, f), 'utf8'); if (f === file) { start = text.length; end = start + t.length; } text += t; }
if (!end) throw Error('file not found: ' + file);
const ast = espree.parse(text, { ecmaVersion: 2023, sourceType: 'script', range: true, loc: true });
const body = ast.body[0].expression.callee.body.body;
const startLine = text.slice(0, start).split('\n').length - 1;
const declNames = st => { const out = []; if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') out.push(st.id.name); else if (st.type === 'VariableDeclaration') for (const d of st.declarations) { const w = p => { if (p.type === 'Identifier') out.push(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(q => w(q.value || q.argument)); else if (p.type === 'ArrayPattern') p.elements.forEach(e => e && w(e)); else if (p.type === 'AssignmentPattern') w(p.left); }; w(d.id); } return out; };
const cuts = [];
for (const st of body) { if (st.range[0] < start || st.range[0] >= end) continue; const dn = declNames(st), rel = st.loc.start.line - startLine;
  let del = dn.some(n => names.has(n)) || (dn.length === 0 && stmts.has(rel));
  if (allBut) del = !(dn.some(n => allBut.has(n)) || (dn.length === 0 && keepStmts.has(rel)));
  if (del) cuts.push([st.range[0] - start, st.range[1] - start, dn.join('/') || ('stmt@' + rel)]); }
let src = text.slice(start, end), removed = 0; for (const [a, b] of cuts.slice().reverse()) { src = src.slice(0, a) + src.slice(b); removed += b - a; }
console.log(file + ': removing', cuts.length, 'units,', removed, 'bytes:', cuts.map(c => c[2]).join(', ').slice(0, 600));
if (!dry) fs.writeFileSync(path.join(engDir, file), src);
