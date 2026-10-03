import fs from 'fs';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
const [,, src, dst, W = '512'] = process.argv;
const buf = fs.readFileSync(src);
const loader = new RGBELoader().setDataType(THREE.FloatType);
const img = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const w = +W, h = w / 2, sx = img.width / w, sy = img.height / h, out = Buffer.alloc(w * h * 4);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let yy = Math.floor(y * sy); yy < Math.floor((y + 1) * sy); yy++) for (let xx = Math.floor(x * sx); xx < Math.floor((x + 1) * sx); xx++) {
    const i = (yy * img.width + xx) * 4; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
  }
  r /= n; g /= n; b /= n;
  const m = Math.max(r, g, b), o = (y * w + x) * 4;
  if (m < 1e-32) continue;
  const e = Math.ceil(Math.log2(m)), f = 256 / 2 ** e;
  out[o] = Math.min(255, r * f); out[o + 1] = Math.min(255, g * f); out[o + 2] = Math.min(255, b * f); out[o + 3] = e + 128;
}
fs.writeFileSync(dst, out);
console.log(dst, w, h, out.length);
