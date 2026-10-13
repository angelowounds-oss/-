// Writes assets/character_game.glb: the character file with only the animations the game plays (the names in CLIPS in src/assets.js).
// assets/Character.glb stays untouched in the repo; 178 clips make up about 90% of its bytes and the game uses 32 of them.
import fs from 'fs';

const src = 'assets/Character.glb', dst = 'assets/character_game.glb';
const assets = fs.readFileSync('src/assets.js', 'utf8');
const block = assets.slice(assets.indexOf('const CLIPS = {'), assets.indexOf('};', assets.indexOf('const CLIPS = {')));
const keep = new Set([...block.matchAll(/'([A-Za-z0-9_]+)'/g)].map((m) => m[1]));

const buf = fs.readFileSync(src);
const jl = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
const binStart = 20 + jl + 8, bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jl));

const animsAll = json.animations;
const kept = animsAll.filter((a) => keep.has(a.name));
const animAcc = new Set(animsAll.flatMap((a) => a.samplers.flatMap((s) => [s.input, s.output])));
const keptAcc = new Set(kept.flatMap((a) => a.samplers.flatMap((s) => [s.input, s.output])));
const otherAcc = new Set();
const useAcc = (i) => { if (i !== undefined) otherAcc.add(i); };
for (const m of json.meshes || []) for (const p of m.primitives) { for (const v of Object.values(p.attributes || {})) useAcc(v); useAcc(p.indices); for (const t of p.targets || []) for (const v of Object.values(t)) useAcc(v); }
for (const s of json.skins || []) useAcc(s.inverseBindMatrices);
const accOk = new Set([...otherAcc, ...keptAcc]);
const accList = json.accessors.map((_, i) => i).filter((i) => accOk.has(i) || !animAcc.has(i));
const accMap = new Map(accList.map((o, n) => [o, n]));
const bvUsed = new Set(accList.map((i) => json.accessors[i].bufferView).filter((b) => b !== undefined));
for (const im of json.images || []) if (im.bufferView !== undefined) bvUsed.add(im.bufferView);
const bvList = json.bufferViews.map((_, i) => i).filter((i) => bvUsed.has(i));
const bvMap = new Map(bvList.map((o, n) => [o, n]));

const chunks = []; let off = 0;
const newBV = bvList.map((i) => {
  const v = json.bufferViews[i], s = v.byteOffset || 0, data = bin.subarray(s, s + v.byteLength);
  const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
  chunks.push(data); const o = { ...v, byteOffset: off }; delete o.byteStride; off += data.length; return o;
});
const newBin = Buffer.concat(chunks), padN = (4 - (newBin.length % 4)) % 4;
const outBin = Buffer.concat([newBin, Buffer.alloc(padN)]);

const remapAcc = (i) => (i === undefined ? undefined : accMap.get(i));
const out = { ...json };
out.accessors = accList.map((i) => ({ ...json.accessors[i], bufferView: json.accessors[i].bufferView === undefined ? undefined : bvMap.get(json.accessors[i].bufferView) }));
out.bufferViews = newBV; out.buffers = [{ byteLength: outBin.length }];
out.animations = kept.map((a) => ({ ...a, samplers: a.samplers.map((s) => ({ ...s, input: remapAcc(s.input), output: remapAcc(s.output) })) }));
out.meshes = json.meshes.map((m) => ({ ...m, primitives: m.primitives.map((p) => ({ ...p, attributes: Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, remapAcc(v)])), indices: remapAcc(p.indices), targets: p.targets && p.targets.map((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, remapAcc(v)]))) })) }));
if (json.images) out.images = json.images.map((im) => (im.bufferView === undefined ? im : { ...im, bufferView: bvMap.get(im.bufferView) }));
if (json.skins) out.skins = json.skins.map((s) => ({ ...s, inverseBindMatrices: remapAcc(s.inverseBindMatrices) }));
let jsonBuf = Buffer.from(JSON.stringify(out));
jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
const head = Buffer.alloc(20);
head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + outBin.length, 8);
head.writeUInt32LE(jsonBuf.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
const binHead = Buffer.alloc(8); binHead.writeUInt32LE(outBin.length, 0); binHead.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(dst, Buffer.concat([head, jsonBuf, binHead, outBin]));
console.log(`${dst}: ${kept.length} clips, ${(fs.statSync(dst).size / 1e6).toFixed(2)} MB (from ${(buf.length / 1e6).toFixed(2)} MB)`);
