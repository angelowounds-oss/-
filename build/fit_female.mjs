// Writes assets/player_female.glb: the player's body. The source is a static T-pose mesh (OBJ, 33 parts, no UVs, no skeleton); this script
// simplifies each part, bends the mesh into the proportions of the shared character rig (piecewise warp of the legs, torso and arms), copies the
// skin weights from the nearest vertex of assets/character_game.glb, paints per-part vertex colours and keeps the shared skeleton, so every clip
// plays on it unchanged. Usage: node build/fit_female.mjs <path to .obj>
import fs from 'fs';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const objPath = process.argv[2]; if (!objPath) throw new Error('usage: node build/fit_female.mjs <file.obj>');
await MeshoptSimplifier.ready;

// --- source parts
const parts = []; let cur = null; const P = [];
for (const l of fs.readFileSync(objPath, 'utf8').split('\n')) {
  if (l.startsWith('o ')) { cur = { name: l.slice(2).trim(), v0: P.length / 3, f: [] }; parts.push(cur); }
  else if (l.startsWith('v ')) { const t = l.split(' '); P.push(+t[1], +t[2], +t[3]); }
  else if (l.startsWith('f ')) { const t = l.split(' ').slice(1).map((s) => parseInt(s, 10) - 1); for (let k = 1; k + 1 < t.length; k++) cur.f.push(t[0], t[k], t[k + 1]); }
}
const pos = new Float32Array(P);

// --- colours by part number (sRGB hex); decided from the part bounds and a colour-coded render
const srgb = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255].map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
const COL = { hair: 0x7a2418, skin: 0xe2b49a, jacket: 0x232f3d, pants: 0x2c3140, boots: 0x16181e, trim: 0x9aa6b4 };
const KIND = (n) => (n === 0 ? 'hair' : n === 15 || n === 10 || n === 14 || n === 23 || n === 26 || n === 21 || n === 22 || n === 25 ? 'skin' : n === 1 || n === 2 ? 'pants'
  : [3, 8, 9, 16, 17, 18, 24].includes(n) ? 'boots' : n >= 27 ? 'trim' : 'jacket');

// --- simplify each part (shells are separate, so the part colours survive), then weld into one mesh
const outP = [], outC = [], outI = []; let base = 0;
for (const pt of parts) {
  const used = [...new Set(pt.f)], remap = new Map(used.map((o, i) => [o, i]));
  const vp = new Float32Array(used.length * 3); used.forEach((o, i) => { vp[i * 3] = pos[o * 3]; vp[i * 3 + 1] = pos[o * 3 + 1]; vp[i * 3 + 2] = pos[o * 3 + 2]; });
  let idx = Uint32Array.from(pt.f, (o) => remap.get(o));
  const n = +pt.name.split('_').pop(), target = Math.max(120, Math.floor(idx.length * (n === 15 ? 0.2 : n === 0 ? 0.1 : 0.12)) / 3 * 3);
  [idx] = MeshoptSimplifier.simplify(idx, vp, 3, target - (target % 3), 0.02, ['LockBorder']);
  const col = srgb(COL[KIND(n)]);
  for (let i = 0; i < used.length; i++) { outP.push(vp[i * 3], vp[i * 3 + 1], vp[i * 3 + 2]); outC.push(...col); }
  for (const i of idx) outI.push(i + base);
  base += used.length;
}
// drop vertices no triangle uses
{ const keep = new Map(); const np = [], nc = []; const ni = outI.map((i) => { if (!keep.has(i)) { keep.set(i, np.length / 3); np.push(outP[i * 3], outP[i * 3 + 1], outP[i * 3 + 2]); nc.push(outC[i * 3], outC[i * 3 + 1], outC[i * 3 + 2]); } return keep.get(i); });
  outP.length = 0; outP.push(...np); outC.length = 0; outC.push(...nc); outI.length = 0; outI.push(...ni); }
const NV = outP.length / 3;

// --- warp into the rig's bind pose (a T-pose with flat arms, 1.83 m): piecewise y and x landmarks, arms levelled
const S = 1.83, smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const pw = (xs, ys, v) => { if (v <= xs[0]) return ys[0] + (v - xs[0]) * (ys[1] - ys[0]) / (xs[1] - xs[0]); for (let i = 1; i < xs.length; i++) if (v <= xs[i]) return ys[i - 1] + (v - xs[i - 1]) * (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]); const n = xs.length - 1; return ys[n] + (v - xs[n]) * S; };
const YN = [0, 0.07, 0.30, 0.52, 0.79, 0.86, 0.964], YO = [0, 0.098, 0.526, 0.917, 1.446, 1.53, 1.72];
const XN = [0, 0.08, 0.20, 0.335, 0.432], XO = [0, 0.146, 0.47, 0.75, 0.967];
const armAxis = (ax) => 0.79 - (ax - 0.08) * (0.065 / 0.352);
const W = new Float32Array(NV * 3);
for (let i = 0; i < NV; i++) {
  let [x, y, z] = [outP[i * 3], outP[i * 3 + 1], outP[i * 3 + 2]]; const ax = Math.abs(x), sg = Math.sign(x) || 1;
  const arm = smooth(0.07, 0.12, ax) * smooth(0.62, 0.68, y);
  const yy = y + (0.79 - armAxis(Math.min(ax, 0.432))) * arm;
  const xw = pw(XN, XO, ax), xk = ax * S + (xw - ax * S) * smooth(0.58, 0.68, y);
  W[i * 3] = sg * (ax < 1e-6 ? 0 : xk); W[i * 3 + 1] = pw(YN, YO, yy); W[i * 3 + 2] = z * S;
}

// --- skin weights from the nearest vertex of the shared character mesh
const io = new NodeIO(), doc = await io.read('assets/character_game.glb'), root = doc.getRoot();
const prim = root.listMeshes()[0].listPrimitives()[0];
const oP = prim.getAttribute('POSITION'), oJ = prim.getAttribute('JOINTS_0'), oW = prim.getAttribute('WEIGHTS_0'), NO = oP.getCount();
const op = new Float32Array(NO * 3), oj = new Uint16Array(NO * 4), ow = new Float32Array(NO * 4), t3 = [0, 0, 0, 0];
for (let i = 0; i < NO; i++) { oP.getElement(i, t3); op.set(t3.slice(0, 3), i * 3); oJ.getElement(i, t3); oj.set(t3, i * 4); oW.getElement(i, t3); ow.set(t3, i * 4); }
const J = new Uint16Array(NV * 4), WT = new Float32Array(NV * 4);
for (let i = 0; i < NV; i++) {
  let best = 0, bd = 1e9; const x = W[i * 3], y = W[i * 3 + 1], z = W[i * 3 + 2];
  for (let k = 0; k < NO; k++) { const dx = op[k * 3] - x, dy = op[k * 3 + 1] - y, dz = op[k * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = k; } }
  J.set(oj.subarray(best * 4, best * 4 + 4), i * 4); WT.set(ow.subarray(best * 4, best * 4 + 4), i * 4);
}
// smooth normals (area weighted)
const NR = new Float32Array(NV * 3);
for (let t = 0; t < outI.length; t += 3) {
  const [a, b, c] = [outI[t], outI[t + 1], outI[t + 2]];
  const ux = W[b * 3] - W[a * 3], uy = W[b * 3 + 1] - W[a * 3 + 1], uz = W[b * 3 + 2] - W[a * 3 + 2], vx = W[c * 3] - W[a * 3], vy = W[c * 3 + 1] - W[a * 3 + 1], vz = W[c * 3 + 2] - W[a * 3 + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  for (const v of [a, b, c]) { NR[v * 3] += nx; NR[v * 3 + 1] += ny; NR[v * 3 + 2] += nz; }
}
for (let i = 0; i < NV; i++) { const l = Math.hypot(NR[i * 3], NR[i * 3 + 1], NR[i * 3 + 2]) || 1; NR[i * 3] /= l; NR[i * 3 + 1] /= l; NR[i * 3 + 2] /= l; }

// --- write: shared skeleton, new primitive, flat-coloured material, no clips
const buf = root.listBuffers()[0];
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
for (const s of prim.listSemantics()) prim.setAttribute(s, null);
prim.setAttribute('POSITION', acc('VEC3', W)).setAttribute('NORMAL', acc('VEC3', NR)).setAttribute('COLOR_0', acc('VEC3', new Float32Array(outC)))
  .setAttribute('JOINTS_0', acc('VEC4', J)).setAttribute('WEIGHTS_0', acc('VEC4', WT)).setIndices(acc('SCALAR', new Uint32Array(outI)));
const mat = prim.getMaterial().setName('Female').setBaseColorTexture(null).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.72).setMetallicFactor(0).setDoubleSided(false);
for (const a of root.listAnimations()) { for (const c of a.listChannels()) c.dispose(); for (const sm of a.listSamplers()) sm.dispose(); a.dispose(); }
await doc.transform(prune());
await io.write('assets/player_female.glb', doc);
console.log(`assets/player_female.glb: ${NV} vertices, ${outI.length / 3} triangles, ${(fs.statSync('assets/player_female.glb').size / 1e6).toFixed(2)} MB`);
