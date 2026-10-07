#!/usr/bin/env node
// Converts the user-provided Koenigsegg Agera OBJ (Blender export: Y up, +Z forward, no MTL/textures in the package) into the same five-part GLB contract the BMW uses
// (one body node 'OBcovered_car' + four wheel nodes 'OBcovered_car_wheel_01..04', source axes X lateral / Y forward / Z up, one embedded texture atlas) and writes assets/vehicle-agera.js.
//   node tools/gen/obj2glb.mjs <Koenigsegg.obj> <source.zip>
// The package has no material file, so materials are assigned by their OBJ names onto tiles of the engine's 5 x 4 vehicle atlas (see VT[] in 30-renderer-lighting.js):
//   Car_Texture -> body paint (4,0) | Carbon, Carbon.00x -> carbon (4,3) | Window_Glass -> glass (0,2) | Rear_Lights -> red plastic (0,1) | wheels: tyre rubber (3,0), rim metal (2,0)
// Every vertex gets the UV of its tile centre, the atlas is flat colours per 64 px tile (mip-safe), so the body paint presets and the existing PBR tile table work unchanged.
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import crypto from 'node:crypto';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const [objPath, zipPath] = process.argv.slice(2); if (!objPath || !zipPath) { console.error('usage: obj2glb.mjs <obj> <zip>'); process.exit(1); }
const LENGTH = 4.293; // metres: the Agera R is 4.293 m long; the source is in arbitrary Blender units
const TILE = { paint: [4, 0], carbon: [4, 3], glass: [0, 2], lights: [0, 1], tyre: [3, 0], rim: [2, 0] };
const COLOR = { paint: [235, 95, 15], carbon: [14, 15, 17], glass: [10, 14, 20], lights: [150, 10, 14], tyre: [18, 18, 20], rim: [112, 114, 118] };
const MAT = m => /^Car_Texture/.test(m) ? 'paint' : /Window_Glass/.test(m) ? 'glass' : /Rear_Lights/.test(m) ? 'lights' : 'carbon';
// ---- parse OBJ
const V = [], N = [], faces = []; let obj = null, mat = null;
for (const line of fs.readFileSync(objPath, 'utf8').split('\n')) {
  const t = line.trim().split(/\s+/); if (!t[0]) continue;
  if (t[0] === 'v') V.push([+t[1], +t[2], +t[3]]); else if (t[0] === 'vn') N.push([+t[1], +t[2], +t[3]]);
  else if (t[0] === 'o') obj = t[1]; else if (t[0] === 'usemtl') mat = t[1];
  else if (t[0] === 'f') { const c = t.slice(1).map(k => { const p = k.split('/'); return [+p[0] - 1, p[2] ? +p[2] - 1 : -1]; }); for (let i = 1; i + 1 < c.length; i++) faces.push({ obj, mat, c: [c[0], c[i], c[i + 1]] }); }
}
const kept = faces.filter(f => f.c.every(([v]) => Math.abs(V[v][0]) <= 12)); // three single stray triangles sit at x = 25 in the source
console.log('faces', faces.length, 'kept', kept.length, 'culled', faces.length - kept.length);
// ---- axes: OBJ (x left, y up, z forward) -> source (x right, y forward, z up): (-x, z, y), a proper rotation; then scale to metres
let zmin = 1e9, zmax = -1e9; for (const f of kept) for (const [v] of f.c) { zmin = Math.min(zmin, V[v][2]); zmax = Math.max(zmax, V[v][2]); }
const K = LENGTH / (zmax - zmin), mapP = p => [-p[0] * K, p[2] * K, p[1] * K], mapN = n => [-n[0], n[2], n[1]];
const wheelNames = { FR: 1, FL: 2, RL: 3, RR: 4 };
const groups = { body: [], 1: [], 2: [], 3: [], 4: [] };
for (const f of kept) { const w = /^(FR|FL|RL|RR)_/.exec(f.obj); groups[w ? wheelNames[w[1]] : 'body'].push(f); }
// ---- wheels: all four rest on the same plane (the source has up to 4 mm of difference), tyre vs rim by radius
const wheelInfo = {}; let wmin = 1e9;
for (const k of [1, 2, 3, 4]) { let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const f of groups[k]) for (const [v] of f.c) { const p = mapP(V[v]); for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); } } wheelInfo[k] = { lo, hi, c: [(lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] }; wmin = Math.min(wmin, lo[2]); }
const build = (list, wheel) => {
  const P = [], Nn = [], U = [], I = [], key = new Map(); let minP = [1e9, 1e9, 1e9], maxP = [-1e9, -1e9, -1e9], flipVotes = 0, tot = 0;
  const wi = wheel ? wheelInfo[wheel] : null, shift = wheel ? wmin - wi.lo[2] : 0, R = wi ? Math.max((wi.hi[1] - wi.lo[1]), (wi.hi[2] - wi.lo[2])) / 2 : 0;
  for (const f of list) {
    let tile;
    if (wheel) { const q = f.c.map(([v]) => mapP(V[v])); const cy = (q[0][1] + q[1][1] + q[2][1]) / 3 - wi.c[0], cz = (q[0][2] + q[1][2] + q[2][2]) / 3 - wi.c[1]; tile = Math.hypot(cy, cz) > .74 * R ? 'tyre' : 'rim'; } else tile = MAT(f.mat);
    const ids = f.c.map(([v, n]) => {
      const kk = v + '/' + n + '/' + tile; let id = key.get(kk);
      if (id === undefined) {
        id = P.length / 3; key.set(kk, id); const p = mapP(V[v]); p[2] += shift; P.push(...p); Nn.push(...(n >= 0 ? mapN(N[n]) : [0, 0, 1]));
        const [tx, ty] = TILE[tile]; U.push((tx + .5) / 5, (3 - ty + .5) / 4); for (let i = 0; i < 3; i++) { minP[i] = Math.min(minP[i], p[i]); maxP[i] = Math.max(maxP[i], p[i]); }
      } return id;
    });
    const a = ids.map(i => P.slice(i * 3, i * 3 + 3)), e1 = a[1].map((x, i) => x - a[0][i]), e2 = a[2].map((x, i) => x - a[0][i]), cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (Math.hypot(...cr) < 1e-14) continue; const nn = ids.reduce((s, i) => s.map((x, k) => x + Nn[i * 3 + k]), [0, 0, 0]); tot++; if (cr[0] * nn[0] + cr[1] * nn[1] + cr[2] * nn[2] < 0) flipVotes++;
    I.push(...ids);
  }
  return { P: new Float32Array(P), N: new Float32Array(Nn), U: new Float32Array(U), I: new Uint32Array(I), minP, maxP, flip: flipVotes / Math.max(tot, 1), tris: I.length / 3 };
};
const parts = [build(groups.body, 0), ...[1, 2, 3, 4].map(k => build(groups[k], k))];
for (const [i, p] of parts.entries()) console.log(i ? 'wheel ' + i : 'body', 'verts', p.P.length / 3, 'tris', p.tris, 'wrong-winding share', p.flip.toFixed(4));
// ---- PNG atlas 320 x 256 (5 x 4 tiles of 64 px, flat colours; row 0 = top of the image)
const png = (() => {
  const W = 320, H = 256, raw = Buffer.alloc((W * 3 + 1) * H);
  const tileColor = (tx, ty) => { for (const [k, [a, b]] of Object.entries(TILE)) if (a === tx && b === ty) return COLOR[k]; return [96, 98, 102]; };
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) { const c = tileColor(Math.floor(x / 64), Math.floor(y / 64)); raw.set(c, y * (W * 3 + 1) + 1 + x * 3); } }
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
})();
// ---- GLB
const chunks = [], views = [], accessors = []; let off = 0;
const add = (buf, target) => { const pad = (4 - buf.byteLength % 4) % 4, b = Buffer.concat([Buffer.from(buf.buffer ? Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength) : buf), Buffer.alloc(pad)]); views.push({ buffer: 0, byteOffset: off, byteLength: buf.byteLength, ...(target ? { target } : {}) }); chunks.push(b); off += b.length; return views.length - 1; };
const acc = (view, type, count, ct, extra = {}) => { accessors.push({ bufferView: view, componentType: ct, count, type, ...extra }); return accessors.length - 1; };
const nodes = [], meshes = [], names = ['OBcovered_car', 'OBcovered_car_wheel_01', 'OBcovered_car_wheel_02', 'OBcovered_car_wheel_03', 'OBcovered_car_wheel_04'];
parts.forEach((p, i) => {
  const a0 = acc(add(p.P, 34962), 'VEC3', p.P.length / 3, 5126, { min: p.minP, max: p.maxP }), a1 = acc(add(p.N, 34962), 'VEC3', p.N.length / 3, 5126), a2 = acc(add(p.U, 34962), 'VEC2', p.U.length / 2, 5126), a3 = acc(add(p.I, 34963), 'SCALAR', p.I.length, 5125);
  meshes.push({ primitives: [{ attributes: { POSITION: a0, NORMAL: a1, TEXCOORD_0: a2 }, indices: a3, material: 0, mode: 4 }] }); nodes.push({ name: names[i], mesh: i });
});
const imgView = add(png);
const json = { asset: { version: '2.0', generator: 'AETHER Koenigsegg Agera OBJ converter (tools/gen/obj2glb.mjs)', extras: { sourceAxes: 'source +Y length/forward, +Z up, +X lateral', note: 'no material file in the source package: materials assigned by OBJ material name onto the engine atlas tiles' } }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes,
  materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, roughnessFactor: .44, metallicFactor: .38 } }], textures: [{ source: 0 }], images: [{ bufferView: imgView, mimeType: 'image/png' }], accessors, bufferViews: views, buffers: [{ byteLength: off }] };
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
const bin = Buffer.concat(chunks), total = 12 + 8 + js.length + 8 + bin.length, head = Buffer.alloc(20); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8); head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
const binHead = Buffer.alloc(8); binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004e4942, 4);
const glb = Buffer.concat([head, js, binHead, bin]); fs.writeFileSync(path.join(root, 'assets/vehicle-agera.glb'), glb);
// ---- normalised dimensions exactly as the engine loader will produce them (scale so the source Y extent = lengthX)
const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const p of parts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p.minP[i]); hi[i] = Math.max(hi[i], p.maxP[i]); }
const ext = hi.map((v, i) => v - lo[i]), s = LENGTH / ext[1], dims = { lengthX: LENGTH, widthZ: ext[0] * s, heightY: ext[2] * s };
const sha = b => crypto.createHash('sha256').update(b).digest('hex'), sv = parts.reduce((a, p) => a + p.P.length / 3, 0), st = parts.reduce((a, p) => a + p.tris, 0);
const meta = { name: 'Koenigsegg Agera (embedded five-part GLB converted from OBJ)', source: path.basename(objPath), sourceType: 'User-provided OBJ (Blender 2.83 export, no material file); merged into 5 scene parts', license: 'User-provided source; redistribution rights not established', credit: path.basename(zipPath) + ' (user-provided)',
  sha256: sha(glb), sourceZipSha256: sha(fs.readFileSync(zipPath)), diffEmbeddedSha256: sha(png), sourceMeshBlocks: 5, sourceObjectBlocks: 5, sourceVertices: V.length, sourcePolygons: faces.length, sourceLoops: 0, sourceTriangles: st,
  rawSourceBBoxMin: lo, rawSourceBBoxMax: hi, rawSourceBBoxExtents: ext, runtimeAxisMapping: 'GLB +Y length/forward, +Z up, +X lateral -> local +X nose -> VehicleTransform world -X nose; +X downstream / +Y up / +Z lateral', dims, culledStrayTriangles: faces.length - kept.length, convertedVertices: sv };
fs.writeFileSync(path.join(root, 'assets/vehicle-agera.js'), '(window.__ASSETS=window.__ASSETS||{}).VEHICLE_AGERA=' + JSON.stringify({ ...meta, base64: glb.toString('base64') }) + ';\n');
console.log('GLB', glb.length, 'bytes; dims', dims, 'wheels min z', wmin, 'sha', meta.sha256.slice(0, 12));
