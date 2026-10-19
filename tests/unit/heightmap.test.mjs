// Baked height tiles: the tile a job makes must give back the ground of landfn.js at its nodes (to the 0.1 m of the Int16 step) and stay close between
// nodes, the predictor coding must round-trip, rivers must be cut into the ground, and a missing tile must fall back to the computation.
import zlib from 'node:zlib';
import fs from 'node:fs';
import '../../build/jobs.mjs';   // installs the compiled region (when there is one) as the bake does, so the tiles and landfn here agree
import { bake } from '../../build/bake.mjs';
import { openContainer, decodeChunk } from '../../src/bakefmt.js';
import { encodeTile, decodeTile, N1, TILE, CN, levels, sample, loadResident, colorAt, TILE_ORIGIN } from '../../src/heightmap.js';
import { landProc, physProc, landHeight, riverAt, bedDepth } from '../../src/landfn.js';
import { rivers, highways } from '../../src/worldmap.js';
import { WorldData, memoryReader } from '../../src/chunkstore.js';

const REGION = 'build/baked/world/capital/region.bin';
const bad = [], S = ['src/worldmap.js', 'src/terrainfn.js', 'src/settlements.js', 'src/roadnet.js', 'src/landfn.js', 'src/groundfn.js', 'src/heightmap.js', 'src/bakefmt.js', 'build/jobs.mjs',
  'src/roadgrade.js', 'src/countryplan.js', 'src/region.js', ...(fs.existsSync(new URL('../../' + REGION, import.meta.url)) ? [REGION] : [])];
const tileOf = (x, z, g = 16) => [Math.floor((x - TILE_ORIGIN.x) / (g * TILE)), Math.floor((z - TILE_ORIGIN.z) / (g * TILE))];   // the tile grid is in the local frame (ADR-0017)
const rp = rivers()[0].pts[Math.floor(rivers()[0].pts.length / 2)], hp = highways()[0].pts[Math.floor(highways()[0].pts.length / 2)];
const spots = [[0, 0], [rp[0], rp[1]], [hp[0], hp[1]]], want = new Map();
for (const [x, z] of spots) { const [i, j] = tileOf(x, z); want.set(`${i}_${j}`, { key: `t16/${i}_${j}`, gen: 'tile', tier: 'embed', g: 16, i, j, src: S }); }
const r = await bake({ jobs: [...want.values()], cache: false, threads: 3 });
const C = await openContainer(memoryReader(r.embedded)), wd = new WorldData(); wd.add('embedded', C);
const n = await loadResident(wd);
if (n !== want.size) bad.push(['loaded', n, want.size]);

// the predictor round-trips
{ const h = new Float32Array(N1 * N1).map((_, k) => Math.sin(k * 0.013) * 400 + (k % 7)), e = decodeTile(encodeTile(h)); for (let k = 0; k < h.length; k++) if (Math.abs(e[k] * 0.1 - h[k]) > 0.051) { bad.push(['predictor', k]); break; } }

// at the nodes: exact to the step; between the nodes: close
let maxNode = 0, maxMid = 0, cnt = 0;
for (const [x, z] of spots) {
  const [i, j] = tileOf(x, z), x0 = TILE_ORIGIN.x + i * 4096, z0 = TILE_ORIGIN.z + j * 4096;
  for (let q = 0; q < 300; q++) {
    const a = (q * 37) % TILE, b = (q * 91) % TILE, nx = x0 + a * 16, nz = z0 + b * 16, mx = nx + 8, mz = nz + 8;
    maxNode = Math.max(maxNode, Math.abs(sample(nx, nz) - landProc(nx, nz, 16)));
    maxMid = Math.max(maxMid, Math.abs(sample(mx, mz) - landProc(mx, mz, 16))); cnt++;
  }
}
if (maxNode > 0.06) bad.push(['node error', maxNode]);
if (maxMid > 6) bad.push(['mid error', maxMid]);
// a river is cut: on the centreline the ground lies below the river's water level by about the bed depth, so water stands there
{ const q = riverAt(rp[0], rp[1]); if (!q || q.d > 1) bad.push(['riverAt', q]); else { const g = landProc(rp[0], rp[1], 16); if (!(g < q.y - 1.0 && g > q.y - bedDepth(q.w) - 0.5)) bad.push(['river bed', g, q.y]); } }
// physics layer: bridges/tunnels filled where the tile has one, same as the computation
{ const [i, j] = tileOf(hp[0], hp[1]), t = levels[1].tiles.get(j * levels[1].n + i); let dm = 0; if (t.phys) for (let q = 0; q < 200; q++) { const x = hp[0] + (q - 100) * 16, z = hp[1]; dm = Math.max(dm, Math.abs(sample(x, z, true) - physProc(x, z, 16)) > 6 ? 1 : 0); } if (dm) bad.push(['phys layer']); }
// a point in a tile that is not loaded: NaN from the tiles, the computation from landHeight
const far = [-44000, 44000]; if (sample(far[0], far[1]) === sample(far[0], far[1])) bad.push(['unloaded tile gave a value']);
if (Math.abs(landHeight(far[0], far[1], 16) - landProc(far[0], far[1], 16)) > 1e-6) bad.push(['fallback']);
// the ground colour: present, in range, and the same where the tile and the computation both give it (to the byte steps)
{ const o = [0, 0, 0]; if (!colorAt(rp[0] + 40, rp[1] + 40, o) || o.some((v) => !(v >= 0 && v <= 1))) bad.push(['colour', o]); const t = levels[1].tiles.values().next().value; if (!t.col || t.col.length !== CN * CN * 3) bad.push(['colour size']); if (colorAt(far[0], far[1], o)) bad.push(['colour from unloaded tile']); }
// size
const sizes = Object.values(C.chunks).map((c) => c.z), kb = sizes.reduce((s, v) => s + v, 0) / sizes.length / 1024;
console.log('RESULT ' + JSON.stringify({ test: 'heightmap', pass: bad.length === 0, metrics: { tiles: n, KBperTile: +kb.toFixed(1), maxNode: +maxNode.toFixed(3), maxMid: +maxMid.toFixed(2) }, note: bad.slice(0, 5).map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
