// Packs the downloaded Poly Haven furniture (gltf + textures) into ONE glb that uses ONE material:
//   - every primitive of a model is merged into a single mesh, transformed to metres, standing on y=0, footprint centred on the origin
//   - the triangle count is reduced to MAXTRIS with meshopt (models that will not simplify are skipped)
//   - every base-colour texture is scaled to 256px and placed in a 2048x2048 atlas (8x7 tiles); flat-colour primitives get an 8px swatch from a palette strip
// output: assets/interior/furniture.glb (+ interior_atlas.jpg embedded) and assets/interior/defs.json (size per model)
// usage: node interior_pack.mjs <dir with one folder per model id>
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { quantize } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const dir = process.argv[2].replace(/\/?$/, '/'), MAXTRIS = +(process.env.MAXTRIS || 3200);
const ATLAS = 3072, TILE = 192, COLS = 16, ROWS = 14, SW = 8, PALY = TILE * ROWS; // 224 tiles; the palette strip starts at y=2688
const ids = fs.readdirSync(dir).filter((f) => fs.existsSync(dir + f + '/' + f + '.gltf')).sort();
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const tiles = [], swatches = [], models = [];
let tileN = 0;
const tileFor = async (img) => {
  const buf = await sharp(Buffer.from(img), { limitInputPixels: false }).resize(TILE, TILE, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  if (tileN >= COLS * ROWS) return null;
  const k = tileN++; tiles.push({ x: (k % COLS) * TILE, y: Math.floor(k / COLS) * TILE, buf }); return k;
};
const swatchFor = (rgb) => { const k = swatches.length; swatches.push(rgb); return k; };
const lin2srgb = (v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
const report = [];

for (const id of ids) {
  const doc = await io.read(`${dir}${id}/${id}.gltf`), root = doc.getRoot();
  const P = [], N = [], U = [], I = [], slots = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), uv = prim.getAttribute('TEXCOORD_0'), idx = prim.getIndices();
      if (!pos) continue;
      const mat = prim.getMaterial(), tex = mat?.getBaseColorTexture(), bf = mat?.getBaseColorFactor() || [0.6, 0.6, 0.6, 1];
      // choose a tile / swatch for this primitive
      let slot = { tile: null, sw: null };
      if (tex && uv) { const key = tex.getURI() || tex.getName(); let s = slots.find((q) => q.key === key); if (!s) { const k = await tileFor(tex.getImage()); s = { key, tile: k }; slots.push(s); } slot = s; }
      if (slot.tile == null) slot = { sw: swatchFor([bf[0], bf[1], bf[2]]) };
      const base = P.length / 3, n = pos.getCount(), v = [0, 0, 0];
      let umin = 1e9, vmin = 1e9;
      if (slot.tile != null) for (let i = 0; i < n; i++) { const t = uv.getElement(i, [0, 0]); umin = Math.min(umin, t[0]); vmin = Math.min(vmin, t[1]); }
      umin = Math.floor(umin + 1e-4); vmin = Math.floor(vmin + 1e-4);
      for (let i = 0; i < n; i++) {
        pos.getElement(i, v); const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
        P.push(x, y, z);
        const q = nor ? nor.getElement(i, [0, 0, 0]) : [0, 1, 0];
        const nx = m[0] * q[0] + m[4] * q[1] + m[8] * q[2], ny = m[1] * q[0] + m[5] * q[1] + m[9] * q[2], nz = m[2] * q[0] + m[6] * q[1] + m[10] * q[2], nl = Math.hypot(nx, ny, nz) || 1;
        N.push(nx / nl, ny / nl, nz / nl);
        if (slot.tile != null) { const t = uv.getElement(i, [0, 0]); U.push(['t', slot.tile, Math.min(1, Math.max(0, t[0] - umin)), Math.min(1, Math.max(0, t[1] - vmin))]); }
        else U.push(['s', slot.sw]);
      }
      const cnt = idx ? idx.getCount() : n;
      for (let i = 0; i < cnt; i++) I.push(base + (idx ? idx.getScalar(i) : i));
    }
  }
  if (!I.length) { report.push([id, 'EMPTY']); continue; }
  // simplify
  let idx = new Uint32Array(I), tris = idx.length / 3;
  const pos = new Float32Array(P);
  // budget grows with the size of the object: a 0.2 m prop gets a few hundred triangles, a 2.5 m sofa a couple of thousand
  let bmn = [1e9, 1e9, 1e9], bmx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { bmn[a] = Math.min(bmn[a], P[i + a]); bmx[a] = Math.max(bmx[a], P[i + a]); }
  const dim = Math.min(3, Math.max(...bmx.map((v, a) => v - bmn[a]))), cap = Math.round(Math.min(MAXTRIS, Math.max(350, dim * 850)));
  if (tris > cap) {
    const [out] = MeshoptSimplifier.simplify(idx, pos, 3, cap * 3, 0.08, []);
    idx = out; tris = idx.length / 3;
  }
  if (tris > cap * 3.2) { report.push([id, 'SKIP', tris, 'cap ' + cap]); continue; }
  // compact the vertex set that survived
  const remap = new Map(), keep = [];
  for (const i of idx) if (!remap.has(i)) { remap.set(i, keep.length); keep.push(i); }
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const i of keep) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[i * 3 + a]); mx[a] = Math.max(mx[a], P[i * 3 + a]); }
  const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
  models.push({ id, keep, idx: Array.from(idx, (i) => remap.get(i)), P, N, U, off: [cx, mn[1], cz], size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], tris });
  report.push([id, 'ok', tris, mx.map((v, a) => +(v - mn[a]).toFixed(2)).join('x')]);
}

// ---- atlas ----
const atlasBuf = Buffer.alloc(ATLAS * ATLAS * 3, 128);
for (const t of tiles) for (let y = 0; y < TILE; y++) t.buf.copy(atlasBuf, ((t.y + y) * ATLAS + t.x) * 3, y * TILE * 3, (y + 1) * TILE * 3);
swatches.forEach((rgb, k) => {
  const sx = (k % (ATLAS / SW)) * SW, sy = PALY + Math.floor(k / (ATLAS / SW)) * SW;
  if (sy + SW > ATLAS) return;
  for (let y = 0; y < SW; y++) for (let x = 0; x < SW; x++) { const o = ((sy + y) * ATLAS + sx + x) * 3; atlasBuf[o] = lin2srgb(rgb[0]); atlasBuf[o + 1] = lin2srgb(rgb[1]); atlasBuf[o + 2] = lin2srgb(rgb[2]); }
});
const atlasJpg = await sharp(atlasBuf, { raw: { width: ATLAS, height: ATLAS, channels: 3 } }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();

// ---- output document: one node per model, one shared material ----
const out = new Document(), buffer = out.createBuffer(), scene = out.createScene('s');
const tex = out.createTexture('atlas').setImage(atlasJpg).setMimeType('image/jpeg');
const material = out.createMaterial('interior').setBaseColorTexture(tex).setRoughnessFactor(0.7).setMetallicFactor(0);
const defs = {}, inset = 3 / TILE;
for (const m of models) {
  const n = m.keep.length, pa = new Float32Array(n * 3), na = new Float32Array(n * 3), ua = new Float32Array(n * 2);
  m.keep.forEach((src, k) => {
    pa[k * 3] = m.P[src * 3] - m.off[0]; pa[k * 3 + 1] = m.P[src * 3 + 1] - m.off[1]; pa[k * 3 + 2] = m.P[src * 3 + 2] - m.off[2];
    na.set([m.N[src * 3], m.N[src * 3 + 1], m.N[src * 3 + 2]], k * 3);
    const u = m.U[src];
    if (u[0] === 't') { const x0 = (u[1] % COLS) * TILE, y0 = Math.floor(u[1] / COLS) * TILE; ua[k * 2] = (x0 + TILE * (inset + (1 - 2 * inset) * u[2])) / ATLAS; ua[k * 2 + 1] = (y0 + TILE * (inset + (1 - 2 * inset) * (1 - u[3]))) / ATLAS; }
    else { const sx = (u[1] % (ATLAS / SW)) * SW + SW / 2, sy = PALY + Math.floor(u[1] / (ATLAS / SW)) * SW + SW / 2; ua[k * 2] = sx / ATLAS; ua[k * 2 + 1] = sy / ATLAS; }
  });
  const prim = out.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(pa).setBuffer(buffer))
    .setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(na).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', out.createAccessor().setType('VEC2').setArray(ua).setBuffer(buffer))
    .setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(m.idx)).setBuffer(buffer));
  const mesh = out.createMesh(m.id).addPrimitive(prim), node = out.createNode(m.id).setMesh(mesh);
  scene.addChild(node);
  defs[m.id] = { w: +m.size[0].toFixed(3), h: +m.size[1].toFixed(3), d: +m.size[2].toFixed(3), tris: m.tris };
}
fs.mkdirSync('assets/interior', { recursive: true });
await out.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 16 }));
await io.write('assets/interior/furniture.glb', out);
fs.writeFileSync('assets/interior/defs.json', JSON.stringify(defs));
console.log(report.map((r) => r.join(' ')).join('\n'));
console.log('models', models.length, 'tiles', tileN, 'swatches', swatches.length, 'glb MB', (fs.statSync('assets/interior/furniture.glb').size / 1e6).toFixed(2));
