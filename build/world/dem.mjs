// Real elevation for the world compiler (ADR-0019): Terrarium tiles (SRTM and GEBCO, AWS Open Data) at zoom 11 (about 60 m a pixel in Korea),
// cached in build/.dem-cache, read with bilinear sampling by lon/lat. Heights are real metres (negative at sea); the compiler applies the height scale.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mercPx } from './geo.mjs';

const require = createRequire(import.meta.url);
const sharp = require('../node_modules/sharp');
const CACHE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.dem-cache');

// a cached tile: curl (it goes through the proxy like every other fetch here), retried a few times
function tileFile(kind, z, x, y, url) {
  const dir = path.join(CACHE, kind, String(z)), f = path.join(dir, `${x}_${y}.png`);
  if (fs.existsSync(f) && fs.statSync(f).size > 100) return f;
  fs.mkdirSync(dir, { recursive: true });
  for (let k = 0; k < 4; k++) {
    try { execFileSync('curl', ['-sS', '-f', '-m', '60', '-A', 'neon-city-world-compiler/1.0', '-o', f, url]); if (fs.statSync(f).size > 100) return f; } catch { /* retried */ }
  }
  throw new Error('tile fetch failed: ' + url);
}

// decoded RGB tiles of one source, keyed "x_y"
export class TileSource {
  constructor(kind, z, url) { this.kind = kind; this.z = z; this.url = url; this.tiles = new Map(); }
  // fetch and decode every tile under a lon/lat box (call before sampling: sampling is synchronous)
  async load(b) {
    const a = mercPx(b.w, b.n, this.z), c = mercPx(b.e, b.s, this.z), jobs = [];
    for (let x = Math.floor(a.px / 256); x <= Math.floor(c.px / 256); x++) for (let y = Math.floor(a.py / 256); y <= Math.floor(c.py / 256); y++) {
      const k = `${x}_${y}`; if (this.tiles.has(k)) continue;
      const f = tileFile(this.kind, this.z, x, y, this.url(this.z, x, y));
      jobs.push(sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true }).then(({ data, info }) => this.tiles.set(k, { data, w: info.width, ch: info.channels })));
    }
    await Promise.all(jobs);
    return this.tiles.size;
  }
  // the RGB of the pixel under lon/lat, bilinear; out = [r, g, b]
  rgb(lon, lat, out) {
    const { px, py } = mercPx(lon, lat, this.z), fx = px - 0.5, fy = py - 0.5, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    out[0] = out[1] = out[2] = 0;
    for (const [di, dj, w] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
      const X = i + di, Y = j + dj, t = this.tiles.get(`${Math.floor(X / 256)}_${Math.floor(Y / 256)}`); if (!t) continue;
      const k = (((Y % 256) + 256) % 256 * t.w + (((X % 256) + 256) % 256)) * t.ch;
      out[0] += t.data[k] * w; out[1] += t.data[k + 1] * w; out[2] += t.data[k + 2] * w;
    }
    return out;
  }
}

// Terrarium: height = R * 256 + G + B / 256 - 32768. Decoded per pixel before blending (blending the bytes would mix the R and G steps)
export class Dem extends TileSource {
  constructor(z = 11) { super('terrarium', z, (Z, x, y) => `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${Z}/${x}/${y}.png`); }
  height(lon, lat) {
    const { px, py } = mercPx(lon, lat, this.z), fx = px - 0.5, fy = py - 0.5, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    let h = 0, ws = 0;
    for (const [di, dj, w] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
      const X = i + di, Y = j + dj, t = this.tiles.get(`${Math.floor(X / 256)}_${Math.floor(Y / 256)}`); if (!t) continue;
      const k = (((Y % 256) + 256) % 256 * t.w + (((X % 256) + 256) % 256)) * t.ch;
      h += (t.data[k] * 256 + t.data[k + 1] + t.data[k + 2] / 256 - 32768) * w; ws += w;
    }
    return ws ? h / ws : NaN;
  }
}

// OpenStreetMap standard tiles, only as the reference picture of a preview (a handful of tiles, cached; © OpenStreetMap contributors)
export const osmTiles = (z) => new TileSource('osm', z, (Z, x, y) => `https://tile.openstreetmap.org/${Z}/${x}/${y}.png`);
