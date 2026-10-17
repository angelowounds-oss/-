// Packs skyscraper shapes from the supplied "Manhattan" (FBX, extruded footprints, centimetres) and "Camellia City" (SketchUp OBJ, inches) models into
// assets/landmarks/landmarks.bin for src/landmarks.js (docs/ASSETS.md). Only the shapes are kept: every face becomes two flat-shaded triangles' worth of
// vertices with a planar window-tile uv (4 bays x 4 floors per tile); the walls and the roofs are two ranges of one buffer.
// usage: node build/landmarks_pack.mjs <manhattan.fbx> <Camellia City.obj>
// Layout: u32 json length (space padded), json header, then per model int16 pos (1/64 m), f32 uv (walls only), int8 normals, at the offsets in the header.
import fs from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const [fbxPath, objPath] = process.argv.slice(2);
if (!fbxPath || !objPath) { console.error('usage: node build/landmarks_pack.mjs <manhattan.fbx> <Camellia City.obj>'); process.exit(1); }
globalThis.self = globalThis; THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };

// ---- source triangles as arrays of [x,y,z]*3 in metres
function manhattan() {
  const b = fs.readFileSync(fbxPath), root = new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), ''); root.updateMatrixWorld(true);
  let mesh; root.traverse((o) => { if (o.isMesh && o.name === 'Areasbuilding') mesh = o; });
  const P = mesh.geometry.attributes.position, v = new THREE.Vector3(), tris = [];
  for (let t = 0; t < P.count; t += 3) tris.push([0, 1, 2].map((c) => { v.fromBufferAttribute(P, t + c).applyMatrix4(mesh.matrixWorld); return [v.x / 100, v.y / 100, v.z / 100]; }));
  return tris;
}
function camellia() {
  const V = [], tris = [];
  for (const l of fs.readFileSync(objPath, 'utf8').split('\n')) {
    if (l.startsWith('v ')) { const p = l.split(' '); V.push([+p[1] * 0.0254, +p[2] * 0.0254, +p[3] * 0.0254]); }
    else if (l.startsWith('f ')) { const q = l.trim().split(/\s+/).slice(1).map((s) => V[+s.split('/')[0] - 1]); for (let k = 1; k < q.length - 1; k++) tris.push([q[0], q[k], q[k + 1]]); }
  }
  return tris;
}
// ---- connected components by shared corner positions
function components(tris, q) {
  const par = new Map(), key = (p) => Math.round(p[0] * q) + ',' + Math.round(p[1] * q) + ',' + Math.round(p[2] * q), find = (a) => { while (par.get(a) !== a) { par.set(a, par.get(par.get(a))); a = par.get(a); } return a; };
  const ks = tris.map((t) => t.map(key)); for (const k3 of ks) { for (const k of k3) if (!par.has(k)) par.set(k, k); par.set(find(k3[1]), find(k3[0])); par.set(find(k3[2]), find(k3[0])); }
  const m = new Map(); tris.forEach((t, i) => { const r = find(ks[i][0]); (m.get(r) || m.set(r, []).get(r)).push(t); }); return [...m.values()];
}
const stats = (tris) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const t of tris) for (const p of t) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], p[a]); } return { mn, mx, w: mx[0] - mn[0], d: mx[2] - mn[2], h: mx[1] - mn[1], n: tris.length }; };

const pick = [];
{ const c = components(manhattan(), 100).map((t) => ({ t, s: stats(t) })).filter((c) => c.s.h >= 90 && c.s.h <= 330 && c.s.w <= 120 && c.s.d <= 120 && c.s.w >= 30 && c.s.d >= 30);
  c.sort((a, b) => b.s.n - a.s.n); const used = []; for (const x of c) { if (used.length >= 16) break; if (used.some((u) => Math.abs(u.s.h - x.s.h) < 15 && Math.abs(u.s.w - x.s.w) < 12 && Math.abs(u.s.d - x.s.d) < 12)) continue; used.push(x); }
  used.sort((a, b) => a.s.h - b.s.h); for (const x of used) pick.push({ src: 'manhattan', ...x }); }
{ const c = components(camellia(), 50).map((t) => ({ t, s: stats(t) })).filter((c) => c.s.h >= 100 && c.s.n >= 200 && c.s.n <= 1600 && c.s.w <= 130 && c.s.d <= 130);
  c.sort((a, b) => a.s.h - b.s.h); for (const x of c) pick.push({ src: 'camellia', ...x }); }

const chunks = [], header = { models: [] }; let off = 0;
const put = (ta) => { const buf = Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength), pad = (4 - (buf.length & 3)) & 3; chunks.push(buf, Buffer.alloc(pad)); const o = off; off += buf.length + pad; return o; };
for (const m of pick) {
  const { mn, mx } = m.s, cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, wallT = [], roofT = [];
  for (const t of m.t) {
    const p = t.map((q) => [q[0] - cx, q[1] - mn[1], q[2] - cz]), a = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], b = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    let nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0]; const l = Math.hypot(nx, ny, nz); if (l < 1e-9) continue; nx /= l; ny /= l; nz /= l;
    if (Math.abs(ny) < 0.6) wallT.push({ p, n: [nx, ny, nz] }); else if (!(ny < 0 && p[0][1] < 0.5 && p[1][1] < 0.5 && p[2][1] < 0.5)) roofT.push({ p, n: [nx, ny, nz] });
  }
  const all = [...wallT, ...roofT], nv = all.length * 3, pos = new Int16Array(nv * 3), nrm = new Int8Array(nv * 3), uv = new Float32Array(wallT.length * 6);
  all.forEach((f, i) => { for (let c = 0; c < 3; c++) { for (let k = 0; k < 3; k++) { pos[(i * 3 + c) * 3 + k] = Math.round(f.p[c][k] * 64); nrm[(i * 3 + c) * 3 + k] = Math.round(f.n[k] * 127); } if (i < wallT.length) { const hl = Math.hypot(f.n[0], f.n[2]) || 1, tx = -f.n[2] / hl, tz = f.n[0] / hl; uv[(i * 3 + c) * 2] = (f.p[c][0] * tx + f.p[c][2] * tz) / 14.4; uv[(i * 3 + c) * 2 + 1] = f.p[c][1] / 15.2; } } });
  header.models.push({ src: m.src, h: +m.s.h.toFixed(1), w: +m.s.w.toFixed(1), d: +m.s.d.toFixed(1), nWall: wallT.length * 3, nRoof: roofT.length * 3, pos: put(pos), nrm: put(nrm), uv: put(uv) });
}
const js = Buffer.from(JSON.stringify(header)), jp = Buffer.alloc((4 - (js.length & 3)) & 3, 0x20), len = Buffer.alloc(4); len.writeUInt32LE(js.length + jp.length);
fs.writeFileSync('assets/landmarks/landmarks.bin', Buffer.concat([len, js, jp, ...chunks]));
fs.writeFileSync('src/landmarkdims.js', `// generated by build/landmarks_pack.mjs: [height, width, depth] in metres of every model of assets/landmarks/landmarks.bin\nexport const LM_DIMS = ${JSON.stringify(header.models.map((m) => [m.h, m.w, m.d]))};\n`);
console.log('landmarks.bin', fs.statSync('assets/landmarks/landmarks.bin').size, 'bytes'); for (const m of header.models) console.log(m.src, `${m.h} m ${m.w}x${m.d}`, (m.nWall + m.nRoof) / 3, 'tris');
