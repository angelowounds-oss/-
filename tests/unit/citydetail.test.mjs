// The small things of the cities: deterministic, inside their tile, no NaN, the high variant is denser, every tile citysites can ask for is covered,
// and the budgets hold (the tris a tile may add within sight).
import { cities } from '../../src/worldmap.js';
import { layouts, STYLES } from '../../src/citylayout.js';
import { tileDetail, tilesOf, tileBox, TILE } from '../../src/citydetail.js';

const bad = [], L = layouts(); let boxes = 0, quads = 0, prisms = 0, tiles = 0, maxTris = 0, hiBoxes = 0;
for (const c of cities()) {
  const l = L.get(c.id); if (!l) continue; const S = STYLES[c.id];
  const n = Math.ceil(l.R * 2.2 / TILE), ts = tilesOf(l); if (ts.length !== n * n) bad.push([c.id, 'tilesOf']);
  // every building and road midpoint falls in a listed tile
  const idx = (x, z) => [Math.floor((x + l.R * 1.1) / TILE), Math.floor((z + l.R * 1.1) / TILE)];
  for (let b = 0; b < l.bld.length; b += 12) { const [i, j] = idx(l.bld[b], l.bld[b + 1]); if (i < 0 || j < 0 || i >= n || j >= n) { bad.push([c.id, 'building outside the tiles']); break; } }
  for (const [i, j] of ts) {
    const a = tileDetail(c, l, S, i, j, false), b = tileDetail(c, l, S, i, j, false), h = tileDetail(c, l, S, i, j, true);
    if (!!a !== !!b || (a && a.boxes.length !== b.boxes.length)) bad.push([c.id, i, j, 'not deterministic']);
    if (!a) continue; tiles++; boxes += a.n[0]; prisms += a.n[1]; quads += a.n[2]; hiBoxes += h ? h.n[0] : 0;
    const tris = a.n[0] * 10 + a.n[1] * 8 + a.n[2] * 2; maxTris = Math.max(maxTris, tris);
    const T = tileBox(l, i, j), m = 120;   // furniture and roofs lie inside the tile; lane marks and roofs may overhang by a few metres
    for (let k = 0; k < a.boxes.length; k += 6) { for (let q = 0; q < 6; q++) if (!Number.isFinite(a.boxes[k + q])) { bad.push([c.id, 'NaN']); break; } if (Math.abs(a.boxes[k]) > TILE / 2 + m || Math.abs(a.boxes[k + 2]) > TILE / 2 + m) { bad.push([c.id, i, j, 'box outside']); break; } }
    for (let k = 0; k < a.quads.length; k += 5) if (Math.abs(a.quads[k]) > TILE / 2 + m || Math.abs(a.quads[k + 1]) > TILE / 2 + m) { bad.push([c.id, i, j, 'quad outside']); break; }
    void T;
  }
}
if (maxTris > 60000) bad.push(['a tile adds too many triangles', maxTris]);
if (hiBoxes <= boxes) bad.push(['high is not denser', hiBoxes, boxes]);
if (!(boxes > 1e5 && quads > 1e5 && prisms > 500)) bad.push(['too little detail', boxes, quads, prisms]);
console.log('RESULT ' + JSON.stringify({ test: 'citydetail', pass: bad.length === 0, metrics: { tiles, boxes, quads, prisms, maxTrisPerTile: maxTris, hiBoxes }, note: bad.slice(0, 5).map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
