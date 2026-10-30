// The high-detail asset pack (ADR-0029): every `pack` recipe of the manifest becomes a KTX2 texture (Basis Universal: ETC1S for colour,
// UASTC + zstd for normals and data) in build/baked/pack/assets.pak, a chunk container (src/bakefmt.js) next to the world pack's files (one per province), with
// the Basis transcoder as one more chunk so the page carries none of it. The pack's index.json lists both files (src/detail.js mounts them).
// usage: node build/assets/pack.mjs   (downloads what is missing first: node build/assets/fetch.mjs --fetch)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { encodeChunk, buildContainer } from '../../src/bakefmt.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const CACHE = path.join(ROOT, 'build/.asset-cache'), OUT = path.join(ROOT, 'build/baked/pack');
const BASISU = path.join(ROOT, 'build/node_modules/basisu/bin/linux/x64/basisu');
const BASIS_LIB = path.join(ROOT, 'build/node_modules/three/examples/jsm/libs/basis');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const chunk = (key, obj) => { const raw = encodeChunk(obj); return { key, z: zlib.deflateRawSync(raw, { level: 9 }), r: raw.length }; };

// one recipe -> the bytes of its KTX2 file; `combine` packs a normal map's RG and a roughness map into one RGB image first (as build/packtex.mjs)
async function encode(id, rc, tmp) {
  const src = (f) => path.join(CACHE, id, f);
  let input = src(rc.from || '');
  if (rc.combine) {
    const S = rc.size || 2048, nor = await sharp(src(rc.combine.rg)).resize(S, S).removeAlpha().raw().toBuffer(), b = await sharp(src(rc.combine.b)).resize(S, S).greyscale().raw().toBuffer();
    const out = Buffer.alloc(S * S * 3); for (let i = 0; i < S * S; i++) { out[i * 3] = nor[i * 3]; out[i * 3 + 1] = nor[i * 3 + 1]; out[i * 3 + 2] = b[i]; }
    input = path.join(tmp, rc.name + '.png'); await sharp(out, { raw: { width: S, height: S, channels: 3 } }).png().toFile(input);
  } else if (rc.size) { const r = path.join(tmp, rc.name + '.png'); await sharp(input).resize(rc.size, rc.size).png().toFile(r); input = r; }
  const out = path.join(tmp, rc.name + '.ktx2');
  const args = ['-ktx2', '-mipmap', '-output_file', out, ...(rc.srgb ? [] : ['-linear']), ...(rc.mode === 'uastc' ? ['-uastc', '-uastc_rdo_l', '1'] : ['-q', '192']), input];
  execFileSync(BASISU, args, { stdio: 'ignore' });
  return new Uint8Array(fs.readFileSync(out));
}

export async function packAssets(man = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/assets/manifest.json'), 'utf8'))) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ncpack-')), entries = [], list = [];
  try {
    for (const a of man.assets) for (const rc of a.pack || []) {
      const data = await encode(a.id, rc, tmp); entries.push(chunk('asset/tex/' + rc.name, { data, srgb: !!rc.srgb, from: a.id })); list.push({ name: rc.name, bytes: data.length });
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (!entries.length) return null;
  entries.push(chunk('asset/basis', { js: fs.readFileSync(path.join(BASIS_LIB, 'basis_transcoder.js'), 'utf8'), wasm: new Uint8Array(fs.readFileSync(path.join(BASIS_LIB, 'basis_transcoder.wasm'))) }));
  entries.sort((a, b) => (a.key < b.key ? -1 : 1));
  const c = buildContainer(entries, { tier: 'high', kind: 'assets' });
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'assets.pak'), c);
  // the folder's index lists the world pack (bake.mjs --pack) and this one; either can be rebuilt without the other
  const ixf = path.join(OUT, 'index.json'), ix = fs.existsSync(ixf) ? JSON.parse(fs.readFileSync(ixf, 'utf8')) : { format: 2, tier: 'high', files: [] };
  ix.files = ix.files.filter((f) => f.name !== 'assets.pak').concat([{ name: 'assets.pak', bytes: c.length, h: sha(c).slice(0, 32) }]);
  fs.writeFileSync(ixf, JSON.stringify(ix, null, 1));
  return { bytes: c.length, textures: list };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const r = await packAssets();
  console.log(r ? `assets.pak ${(r.bytes / 1048576).toFixed(1)} MB, ${r.textures.length} textures` : 'no pack recipes');
}
