// Packs the supplied building facade texture sets into three vertical-strip JPEGs (one square layer per set), later uploaded as
// WebGL2 array textures by src/facade.js.
//   color  : 1024x1024 layers  (4 sets)
//   emis   : 512x512 layers    (4 sets + the alternate lit patterns "B" of sets 3 and 4 => 6 layers)
//   nr     : 512x512 layers    (4 sets) R,G = normal xy derived from the height map, B = roughness
// usage: node facade_pack.mjs <dir with the extracted maps>
import sharp from 'sharp';
import fs from 'fs';
const dir = process.argv[2].replace(/\/?$/, '/');
const SETS = [
  { color: '1_color.jpg', emis: '1_emissive.jpg', height: '1_displacement.png', rough: '1_rough.jpg' },
  { color: '2_color.jpg', emis: '2_emissive.jpg', height: '2_displacement.png', rough: '2_rough.jpg' },
  { color: 'building_03_color_A_03.png', emis: 'building_03_emissive_03.png', emisB: 'building_03_emissive_B_03.png', height: 'building_03_height_03.png', rough: 'building_03_roughness_03.png' },
  { color: 'building_04_color_04.png', emis: 'building_04_emmisive_04.png', emisB: 'building_04_emmisive_B_04.png', height: 'building_04_height_04.png', rough: 'building_04_Roughness_04.png' },
];
const open = (f, s, ch) => sharp(dir + f, { limitInputPixels: false }).resize(s, s, { fit: 'fill' });
async function strip(layers, size, out, quality) {
  const buf = Buffer.alloc(size * size * 3 * layers.length);
  layers.forEach((l, i) => l.copy(buf, i * size * size * 3));
  await sharp(buf, { raw: { width: size, height: size * layers.length, channels: 3 } }).jpeg({ quality, mozjpeg: true }).toFile(out);
  console.log(out, (fs.statSync(out).size / 1e6).toFixed(2), 'MB');
}
const rgb = async (f, s) => open(f, s).removeAlpha().raw().toBuffer();
const gray = async (f, s) => open(f, s).greyscale().raw().toBuffer();
// sobel normal from the height map; K controls how deep the window recesses read
function normals(h, s, rough, K) {
  const out = Buffer.alloc(s * s * 3), H = (x, y) => h[Math.min(s - 1, Math.max(0, y)) * s + Math.min(s - 1, Math.max(0, x))] / 255;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 0.5, dr = (H(x, y + 1) - H(x, y - 1)) * 0.5; // dr: towards image bottom
    let nx = -dx * K, ny = dr * K, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * s + x) * 3; out[o] = Math.round((nx * 0.5 + 0.5) * 255); out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255); out[o + 2] = rough[y * s + x];
  }
  return out;
}
const color = [], emis = [], nr = [];
for (const s of SETS) {
  color.push(await rgb(s.color, 1024));
  emis.push(await rgb(s.emis, 512));
  nr.push(normals(await gray(s.height, 512), 512, await gray(s.rough, 512), 6));
}
for (const s of SETS) if (s.emisB) emis.push(await rgb(s.emisB, 512));
await strip(color, 1024, 'assets/facade/facade_color.jpg', 80);
await strip(emis, 512, 'assets/facade/facade_emis.jpg', 88);
await strip(nr, 512, 'assets/facade/facade_nr.jpg', 90);
