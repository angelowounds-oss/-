// Dependency map of the single-scope engine: which top-level declarations reference which, and what stays alive without a given set of files/units.
// node tools/deps.mjs [--remove=70-smoke-particles.js,87-lbm.js] [--show=name]
import fs from 'node:fs'; import path from 'node:path';
import * as espree from '/opt/node22/lib/node_modules/eslint/node_modules/espree/dist/espree.cjs';
import * as escope from '/opt/node22/lib/node_modules/eslint/node_modules/eslint-scope/dist/eslint-scope.cjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').split('=')[1];
const removeFiles = (arg('remove') || '').split(',').filter(Boolean);
const removeNames = new Set((arg('names') || '').split(',').filter(Boolean)); // remove units declaring any of these names
const removeStmts = (arg('stmts') || '').split(',').filter(Boolean); // file:fileRelativeLine of non-declaration statements to remove
const files = fs.readdirSync(path.join(root, 'src/engine')).filter(f => f.endsWith('.js')).sort();
let text = ''; const spans = [];
for (const f of files) { const t = fs.readFileSync(path.join(root, 'src/engine', f), 'utf8'); spans.push({ f, a: text.length, b: text.length + t.length }); text += t; }
const fileOf = pos => spans.find(s => pos >= s.a && pos < s.b)?.f;
const ast = espree.parse(text, { ecmaVersion: 2023, sourceType: 'script', range: true, loc: true });
const iife = ast.body[0].expression.callee.body.body; // statements of (()=>{...})()
const units = iife.map((st, i) => {
  const names = []; if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') names.push(st.id.name);
  else if (st.type === 'VariableDeclaration') for (const d of st.declarations) { const walk = p => { if (p.type === 'Identifier') names.push(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(q => walk(q.value || q.argument)); else if (p.type === 'ArrayPattern') p.elements.forEach(e => e && walk(e)); else if (p.type === 'AssignmentPattern') walk(p.left); }; walk(d.id); }
  return { i, st, names, a: st.range[0], b: st.range[1], file: fileOf(st.range[0]), decl: names.length > 0, line: st.loc.start.line };
});
const unitAt = pos => { let lo = 0, hi = units.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (pos < units[m].a) hi = m - 1; else if (pos >= units[m].b) lo = m + 1; else return units[m]; } return null; };
const sm = escope.analyze(ast, { ecmaVersion: 2023, sourceType: 'script', nodejsScope: false });
const fnScope = sm.scopes.find(s => s.block === ast.body[0].expression.callee);
const varOwner = new Map(); // variable -> unit
for (const v of fnScope.variables) { const d = v.defs[0]; if (d) { const u = unitAt(d.node.range[0]); if (u) varOwner.set(v, u); } }
const edges = units.map(() => new Set());
for (const sc of sm.scopes) for (const r of sc.references) { const v = r.resolved; if (!v) continue; const owner = varOwner.get(v); if (!owner) continue; const from = unitAt(r.identifier.range[0]); if (from && from !== owner) edges[from.i].add(owner.i); }
// mark & sweep: roots = non-declaration statements (side effects) outside the removed files
const alive = new Set(), stack = [];
const fileStart = f => text.slice(0, spans.find(s => s.f === f).a).split('\n').length - 1;
const isRemoved = u => removeFiles.includes(u.file) || u.names.some(n => removeNames.has(n)) || removeStmts.some(x => { const [f, l] = x.split(':'); return u.file === f && u.line - fileStart(f) === +l; });
for (const u of units) if (!u.decl && !isRemoved(u)) { alive.add(u.i); stack.push(u.i); }
// declarations that are removed-by-file are never roots; declarations in kept files are NOT roots either (only reachable ones stay)
while (stack.length) { const i = stack.pop(); for (const j of edges[i]) if (!alive.has(j) && !isRemoved(units[j])) { alive.add(j); stack.push(j); } }
// references from alive units into removed files (must be patched by hand)
const blockers = []; for (const i of alive) for (const j of edges[i]) if (isRemoved(units[j])) blockers.push({ from: units[i], to: units[j] });
const dead = units.filter(u => u.decl && !alive.has(u.i) && !isRemoved(u));
const bytes = us => us.reduce((a, u) => a + (u.b - u.a), 0);
console.log('units', units.length, 'removed-file units', units.filter(isRemoved).length, '(' + bytes(units.filter(isRemoved)) + ' B)');
console.log('collateral dead declarations in kept files:', dead.length, '(' + bytes(dead) + ' B)');
const byFile = {}; for (const u of dead) (byFile[u.file] = byFile[u.file] || []).push(u.names.join('/')); for (const f in byFile) console.log('  ', f, byFile[f].length, byFile[f].slice(0, 40).join(', '));
const seen = new Set(); console.log('\nalive units that still reference removed code:');
for (const b of blockers) { const k = b.from.file + ':' + b.from.line + '>' + b.to.names.join('/'); if (seen.has(k)) continue; seen.add(k); console.log('  ', b.from.file + ':' + b.from.line, (b.from.names.join('/') || '<stmt>') + ' ->', b.to.file, b.to.names.join('/')); }
if (arg('list')) { const f = arg('list'); const st = fileStart(f); for (const u of units.filter(x => x.file === f)) console.log(String(u.line - st).padStart(5), String(u.b - u.a).padStart(6), u.decl ? 'decl' : 'stmt', u.names.join('/') || text.slice(u.a, u.a + 70).replace(/\n/g, ' ')); }
if (arg('show')) { const u = units.find(x => x.names.includes(arg('show'))); if (u) { console.log('\nrefs of', arg('show'), 'from:'); units.forEach(x => { if (edges[x.i].has(u.i)) console.log('  ', x.file, x.line, x.names.join('/') || '<stmt>'); }); } }
