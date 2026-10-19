// Rasterises the 2013 KOSTAT province outlines (assets/korea/provinces_2013_simple.geojson) into a land mask for the Korea-scale map (WLD-20e):
// one byte per 500 m cell over the 100 x 100 km world (1 = land), written to assets/korea/land.bin. The projection is src/koreamap.js project().
// usage: node build/korea_mask.mjs
import fs from 'node:fs';
import { project } from '../src/koreamap.js';
import { WORLD_HALF } from '../src/worldmap.js';

const CELL = 500, N = (2 * WORLD_HALF) / CELL;
const geo = JSON.parse(fs.readFileSync('assets/korea/provinces_2013_simple.geojson', 'utf8'));
const mask = new Uint8Array(N * N);
// each ring to game metres, then even-odd fill per row of cell centres (crossings of the ring's edges)
const rings = [];
for (const f of geo.features) for (const poly of f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
  for (const ring of poly) rings.push(ring.map(([lon, lat]) => { const p = project(lon, lat); return [p.x, p.z]; }));
for (const ring of rings) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const j0 = Math.max(0, Math.floor((z0 + WORLD_HALF) / CELL)), j1 = Math.min(N - 1, Math.floor((z1 + WORLD_HALF) / CELL));
  for (let j = j0; j <= j1; j++) {
    const z = -WORLD_HALF + (j + 0.5) * CELL, xs = [];
    for (let k = 0; k < ring.length - 1; k++) {
      const [ax, az] = ring[k], [bx, bz] = ring[k + 1];
      if ((az <= z) === (bz <= z)) continue;
      xs.push(ax + ((z - az) * (bx - ax)) / (bz - az));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] + WORLD_HALF) / CELL - 0.5)), i1 = Math.min(N - 1, Math.floor((xs[k + 1] + WORLD_HALF) / CELL - 0.5));
      for (let i = i0; i <= i1; i++) mask[j * N + i] ^= 1;   // even-odd: holes and the overlapping outlines cancel out
    }
  }
}
fs.writeFileSync('assets/korea/land.bin', Buffer.from(mask));
let land = 0; for (const v of mask) land += v;
console.log(`land mask ${N} x ${N} cells of ${CELL} m: ${land} land cells, ${((land * CELL * CELL) / 1e6).toFixed(0)} km2 (game), ${((land * CELL * CELL * 6.5 * 6.5) / 1e6).toFixed(0)} km2 real`);
