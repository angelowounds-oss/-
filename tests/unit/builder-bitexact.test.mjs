// Builder (src/gfx.js) must produce the same vertex data as the reference implementation (tests/fixtures/gfx_ref.js), bit for bit:
// boxes and icosahedra in four material classes, several builders interleaved and finished in a scrambled order, with and without the
// buffer pool (floors use it) and with pooled buffers forced back and reused between rounds.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NM = path.join(ROOT, 'build/node_modules');
// src/ imports bare 'three' specifiers that only resolve under build/node_modules: rewrite them into a temp copy
const loadAs = async (src, name) => {
  const code = fs.readFileSync(src, 'utf8')
    .replace(/from 'three';/g, `from '${pathToFileURL(path.join(NM, 'three/build/three.module.js')).href}';`)
    .replace(/from 'three\/examples\/jsm\/([^']+)';/g, (_, p) => `from '${pathToFileURL(path.join(NM, 'three/examples/jsm', p)).href}';`);
  const out = path.join(os.tmpdir(), `neon-test-${process.pid}-${name}.mjs`);
  fs.writeFileSync(out, code);
  return import(pathToFileURL(out).href);
};
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
const THREE = await import(pathToFileURL(path.join(NM, 'three/build/three.module.js')).href);
const Ref = await loadAs(path.join(ROOT, 'tests/fixtures/gfx_ref.js'), 'ref');
const Cur = await loadAs(path.join(ROOT, 'src/gfx.js'), 'cur');

let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const keys = ['decor', 'emit', 'glass', 'steel'];
const op = (bs, k) => {
  const x = (rnd() - 0.5) * 500, y = rnd() * 40, z = (rnd() - 0.5) * 500, w = 0.1 + rnd() * 9, h = 0.1 + rnd() * 5, d = 0.1 + rnd() * 9, col = Math.floor(rnd() * 0xffffff);
  if (rnd() < 0.3) { const r = [0.7, 0.5, 0.35][Math.floor(rnd() * 3)], sy = 0.8 + rnd(); for (const b of bs) b.ico(k, x, y, z, r, col, sy); }
  else for (const b of bs) b.box(k, x, y, z, w, h, d, col);
};
let bad = 0, n = 0;
for (let r = 0; r < 30; r++) {
  const refs = [new Ref.Builder(), new Ref.Builder(), new Ref.Builder()], curs = [new Cur.Builder(), new Cur.Builder(), new Cur.Builder()];
  if (r % 2) for (const b of curs) b.pooled = true;
  for (let i = 0; i < 3000; i++) { const j = Math.floor(rnd() * 3); op([refs[j], curs[j]], keys[Math.floor(rnd() * 4)]); if (rnd() < 0.01) { const s = Math.floor(rnd() * 5); refs[j].surf = s; curs[j].surf = s; } }
  for (const j of [2, 0, 1]) {
    const ga = new THREE.Group(), gb = new THREE.Group(); refs[j].finish(ga); curs[j].finish(gb); n++;
    if (ga.children.length !== gb.children.length) { bad++; continue; }
    ga.children.forEach((ma, i) => { for (const nm in ma.geometry.attributes) { const x = ma.geometry.attributes[nm].array, y = gb.children[i].geometry.attributes[nm].array; if (x.length !== y.length) { bad++; return; } for (let q = 0; q < x.length; q++) if (x[q] !== y[q]) { bad++; return; } } });
    if (r % 4 === 1) gb.children.forEach((m) => m.geometry.dispose());   // pooled buffers go back and are reused by the next rounds
  }
}
const pass = bad === 0 && n === 90;
console.log('RESULT ' + JSON.stringify({ test: 'builder-bitexact', pass, metrics: { buildersCompared: n, differences: bad } }));
if (!pass) process.exitCode = 1;
