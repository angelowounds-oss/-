// The ground's detail maps from the patch-cc0 scans (assets/patch-cc0/tex): the ground shader (src/world.js createGround) reads one colour
// map and one data map per surface, the data map carrying the OpenGL normal in RG and the roughness in B, so the two scans are combined here
// into assets/tex/<name>_n.jpg (as build/packtex.mjs did for asphalt_04). Prints each colour map's mean brightness, the number the shader
// divides by (scaled by the replaced scan's ratio: asphalt_04 0.509, concrete_pavers 0.366) so the look keeps its old average.
// usage: node build/assets/groundtex.mjs   (then node build/assets/fetch.mjs --update to record the hashes)
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const T = (f) => path.join(ROOT, 'assets/patch-cc0/tex', f);
const SETS = [
  { name: 'clean_asphalt', color: T('clean_asphalt/clean_asphalt_baseColor.jpg'), normal: T('clean_asphalt/clean_asphalt_normal.jpg'), rough: T('clean_asphalt/clean_asphalt_roughness.jpg') },
  { name: 'paving_stones', color: T('paving_stones/PavingStones003_1K-JPG_Color.jpg'), normal: T('paving_stones/PavingStones003_1K-JPG_NormalGL.jpg'), rough: T('paving_stones/PavingStones003_1K-JPG_Roughness.jpg') },
];

// normal RG + roughness B in one 1024 JPEG, the layout the ground shader samples (tn.xy normal, tn.z roughness)
async function combine(s, S = 1024) {
  const nor = await sharp(s.normal).resize(S, S).removeAlpha().raw().toBuffer(), r = await sharp(s.rough).resize(S, S).greyscale().raw().toBuffer();
  const out = Buffer.alloc(S * S * 3); for (let i = 0; i < S * S; i++) { out[i * 3] = nor[i * 3]; out[i * 3 + 1] = nor[i * 3 + 1]; out[i * 3 + 2] = r[i]; }
  const dst = path.join(ROOT, 'assets/tex', s.name + '_n.jpg');
  await sharp(out, { raw: { width: S, height: S, channels: 3 } }).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toFile(dst);
  return dst;
}
// mean of (r+g+b)/3 over the sRGB colour map in 0..1, what the shader's dot(tc, vec3(.333)) averages to
async function meanBrightness(f) { const st = await sharp(f).stats(); return st.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3 / 255; }

for (const s of SETS) console.log(s.name, path.relative(ROOT, await combine(s)), 'mean', (await meanBrightness(s.color)).toFixed(3));
