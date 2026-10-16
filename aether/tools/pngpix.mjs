#!/usr/bin/env node
// Print pixel colours at given points of PNG files (8-bit, non-interlaced, as written by Chromium). node tools/pngpix.mjs "x,y;x,y" a.png [b.png ...]
import fs from 'node:fs'; import zlib from 'node:zlib';
function decode(file) {
  const b = fs.readFileSync(file); let p = 8, w = 0, h = 0, ct = 0, idat = [];
  while (p < b.length) { const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len); if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } else if (type === 'IDAT') idat.push(d); p += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(w * h * bpp), st = w * bpp;
  for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)], o = y * (st + 1) + 1; for (let x = 0; x < st; x++) { const a = x >= bpp ? px[y * st + x - bpp] : 0, up = y ? px[(y - 1) * st + x] : 0, c = x >= bpp && y ? px[(y - 1) * st + x - bpp] : 0; let v = raw[o + x]; if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1; else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; } px[y * st + x] = v & 255; } }
  return { w, h, bpp, px };
}
const pts = process.argv[2].split(';').map(s => s.split(',').map(Number)), imgs = process.argv.slice(3).map(decode);
for (const [x, y] of pts) console.log(`(${x},${y})`.padEnd(12), imgs.map(i => { const o = (y * i.w + x) * i.bpp; return `${i.px[o]},${i.px[o + 1]},${i.px[o + 2]}`.padEnd(14); }).join(' '));
