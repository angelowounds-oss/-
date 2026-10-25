// The world compiler (ADR-0019, KOREA-PLAN v2). M1: the terrain of a region from the real elevation at a chosen height scale V; M2: its sea, coast
// and inland water from OpenStreetMap. With the pictures and numbers to check it by eye. Output goes to build/baked/world/<region>/ (not committed, ADR-0013).
// Usage: node build/world/compile.mjs --region capital --v 1/3,1/4 [--preview] [--roads] [--emit]   (--roads lays the arterial roads in at the first V;
// --emit (with --roads) writes region.bin, what the game reads)
import fs from 'node:fs';
import path from 'node:path';
import { project, CAPITAL } from '../../src/koreamap.js';
import { unproject, mapBox } from './geo.mjs';
import { Dem, osmTiles } from './dem.mjs';
import { relief, sheet, profile, roadSvg, crop } from './preview.mjs';
import { roadPass } from './roads.mjs';
import { emitRegion } from './emit.mjs';
import { placesPass } from './places.mjs';
import { SEA } from '../../src/worldmap.js';
import { overpass, bbox } from './osm.mjs';
import { waterPass, waterHeights, distanceTo } from './water.mjs';

const REGIONS = {
  // Seoul, Incheon and part of Gyeonggi: about 80 x 60 km real (KOREA-PLAN v2 M1)
  capital: { box: { w: 126.45, e: 127.35, s: 37.25, n: 37.80 }, osmZoom: 10,
    marks: [['City Hall', 126.978, 37.5665], ['Bukhansan 836', 126.9779, 37.6587], ['Gwanaksan 629', 126.9637, 37.4448], ['Namsan 262', 126.9882, 37.5512], ['Yeouido', 126.924, 37.525], ['Wolmido', 126.597, 37.476], ['Gimpo Airport', 126.795, 37.558]],
    section: { from: [126.597, 37.476], to: [126.9779, 37.6587], name: 'Wolmido (Incheon) -> Bukhansan' } },
};
const G = +(process.argv.join(' ').match(/--cell (\d+)/)?.[1] || 16);   // map metres per cell: 16 for the t16 tiles, 8 for the t8 pack (--cell 8)

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => { const [k, ...v] = s.trim().split(/\s+/); return [k, v.join(' ') || true]; }));
const region = REGIONS[args.region || 'capital']; if (!region) { console.error('unknown region', args.region); process.exit(2); }
const Vs = String(args.v || '1/3,1/4').split(',').map((s) => { const [a, b] = s.split('/').map(Number); return { name: s, v: b ? a / b : a }; });
const out = path.join('build/baked/world', (args.region || 'capital') + (G === 16 ? '' : '-' + G)); fs.mkdirSync(out, { recursive: true });

// ---- raster of real heights on the map grid
const t0 = Date.now(), dem = new Dem(11), nTiles = await dem.load(region.box);
const B = mapBox(region.box), x0 = Math.floor(B.x0 / G) * G, z0 = Math.floor(B.z0 / G) * G, nx = Math.ceil((B.x1 - x0) / G) + 1, nz = Math.ceil((B.z1 - z0) / G) + 1;
const h = new Float32Array(nx * nz);
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const p = unproject(x0 + i * G, z0 + j * G); h[j * nx + i] = dem.height(p.lon, p.lat); }
const R = { nx, nz, h, g: G, x0, z0 };
// ---- water (M2): coastline, water areas and river lines of the region
const B4 = bbox(region.box), els = overpass(`water-${args.region || 'capital'}`, `[out:json][timeout:200];(way["natural"="coastline"](${B4});way["natural"="water"](${B4});relation["natural"="water"](${B4});way["waterway"="riverbank"](${B4});relation["waterway"="riverbank"](${B4});way["waterway"="river"](${B4}););out geom;`);
const wInfo = waterPass(R, els);
console.log(`raster ${nx} x ${nz} (${(nx * G / 1000).toFixed(1)} x ${(nz * G / 1000).toFixed(1)} km map), ${nTiles} DEM tiles, ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// ---- slopes on land at each V (central difference over 32 m), and the current game terrain on a subsample for comparison
const pct = (a, p) => a[Math.floor(p * (a.length - 1))], share = (a, t) => +(a.filter((s) => s > t).length / a.length * 100).toFixed(1);
const base = [];
for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = j * nx + i; if (!(h[k] > 1)) continue; base.push(Math.hypot(h[k + 1] - h[k - 1], h[k + nx] - h[k - nx]) / (2 * G)); }
base.sort((a, b) => a - b);
const stats = { region: args.region || 'capital', cells: nx * nz, landCells: base.length, V: {} };
for (const { name, v } of [{ name: '1 (no scale)', v: 1 }, ...Vs]) { const a = base.map((s) => s * v); stats.V[name] = { median: +pct(a, 0.5).toFixed(3), p90: +pct(a, 0.9).toFixed(3), over012: share(a, 0.12), over030: share(a, 0.3), over050: share(a, 0.5) }; }
{
  const { landHeight } = await import('../../src/landfn.js'), a = [];
  for (let j = 2; j < nz - 2; j += 9) for (let i = 2; i < nx - 2; i += 9) {
    const x = x0 + i * G - CAPITAL.x, z = z0 + j * G - CAPITAL.z, hh = landHeight(x, z, 16); if (!(hh > 1)) continue;
    a.push(Math.hypot(landHeight(x + G, z, 16) - landHeight(x - G, z, 16), landHeight(x, z + G, 16) - landHeight(x, z - G, 16)) / (2 * G));
  }
  a.sort((u, w) => u - w);
  stats.currentGame = { samples: a.length, median: +pct(a, 0.5).toFixed(3), p90: +pct(a, 0.9).toFixed(3), over012: share(a, 0.12), over030: share(a, 0.3), over050: share(a, 0.5) };
}
// ---- water checks: the named main rivers' centre lines must lie in the compiled water (KOREA-PLAN v2 M2: 300 m real at most)
{
  const toWet = distanceTo(Uint8Array.from(R.water, (w) => (w ? 1 : 0)), nx, nz), river = {};
  for (const e of els) {
    const name = e.tags?.waterway === 'river' && e.tags.name; if (!name || !e.geometry) continue;
    for (let k = 0; k + 1 < e.geometry.length; k++) {
      const a = project(e.geometry[k].lon, e.geometry[k].lat), b = project(e.geometry[k + 1].lon, e.geometry[k + 1].lat), m = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / G));
      for (let t = 0; t < m; t++) {
        const i = Math.round((a.x + (b.x - a.x) * t / m - x0) / G), j = Math.round((a.z + (b.z - a.z) * t / m - z0) / G); if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        (river[name] || (river[name] = [])).push(toWet[j * nx + i] * G * 6.5);
      }
    }
  }
  stats.water = { areas: wInfo.areas, coastWays: wInfo.coastWays, seaCells: R.water.filter((w) => w === 1).length, inlandCells: R.water.filter((w) => w === 2).length, rivers: {} };
  for (const [name, d] of Object.entries(river)) { if (d.length < 50) continue; d.sort((u, v) => u - v); stats.water.rivers[name] = { samples: d.length, inWater: +(d.filter((v) => v === 0).length / d.length * 100).toFixed(1), p90m: Math.round(pct(d, 0.9)), maxm: Math.round(d[d.length - 1]) }; }
}
// ---- roads (M3a): the arterial network laid in at the first height scale
let roads = null;
if (args.roads) {
  const t1 = Date.now(), rels = overpass(`roads-${args.region || 'capital'}`, `[out:json][timeout:240];way["highway"~"^(motorway|trunk|primary|secondary|motorway_link|trunk_link|primary_link|secondary_link|tertiary|tertiary_link)$"](${B4});out geom tags;`), minor = overpass(`roads-minor-${args.region || 'capital'}`, `[out:json][timeout:300];way["highway"~"^(residential|unclassified|living_street)$"](${B4});out geom tags;`);
  const gh = waterHeights(R, Vs[0].v);
  // the real settlements (M4a): sites chosen and their pads cut into the ground before the roads are laid in
  const pl = placesPass(R, gh, overpass(`places-${args.region || 'capital'}`, `[out:json][timeout:120];(node["place"~"^(city|town|village|suburb)$"]["name"](${B4}););out;`), SEA); stats.places = pl.stats;
  const sites = pl.places.map((o) => ({ x: o.x + CAPITAL.x, z: o.z + CAPITAL.z, r: o.r + 120 }));   // map metres
  roads = { gh, ...roadPass(R, gh, rels.concat(minor), sites) };
  stats.roads = { V: Vs[0].name, seconds: +((Date.now() - t1) / 1000).toFixed(1), ...roads.stats };
  if (args.emit) stats.emit = emitRegion(path.join(out, 'region.bin'), args.region || 'capital', R, roads.gh, roads.lines, Vs[0].v, pl.places);
}
fs.writeFileSync(path.join(out, 'stats.json'), JSON.stringify(stats, null, 1));
console.log(JSON.stringify(stats));

// ---- pictures
if (args.preview) {
  const osm = osmTiles(region.osmZoom); await osm.load(region.box);
  const ref = Buffer.alloc(nx * nz * 3), c = [0, 0, 0];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const p = unproject(x0 + i * G, z0 + j * G); osm.rgb(p.lon, p.lat, c); for (let q = 0; q < 3; q++) ref[(j * nx + i) * 3 + q] = c[q]; }
  const marks = region.marks.map(([label, lon, lat]) => { const p = project(lon, lat); return { label, px: (p.x - x0) / G, py: (p.z - z0) / G }; });
  await sheet(path.join(out, 'compare.png'), [{ title: 'OpenStreetMap (reference)', rgb: ref }, ...Vs.map(({ name, v }) => ({ title: `compiled terrain + water, V = ${name}`, rgb: relief(R, v, waterHeights(R, v)) }))], nx, nz, marks);
  if (roads) {
    const rgb = relief(R, Vs[0].v, roads.gh), svg = roadSvg(roads.lines, x0, z0, G);
    await sheet(path.join(out, 'roads.png'), [{ title: 'OpenStreetMap (reference)', rgb: ref }, { title: `compiled roads, V = ${Vs[0].name}`, rgb, svg }, { title: 'ground after laying the roads in', rgb }], nx, nz, marks);
    // the centre of Seoul enlarged: 4 x 3 km of map around City Hall, three times
    const c = project(126.978, 37.5665), Z = 3, w = Math.round(4000 / G), hh = Math.round(3000 / G), i0 = Math.round((c.x - x0) / G - w / 2), j0 = Math.round((c.z - z0) / G - hh / 2);
    const zm = marks.map((m) => ({ ...m, px: (m.px - i0) * Z, py: (m.py - j0) * Z })).filter((m) => m.px > 0 && m.py > 0 && m.px < w * Z && m.py < hh * Z);
    const cz = await crop(rgb, nx, nz, i0, j0, w, hh, Z), cref = Buffer.alloc(w * Z * hh * Z * 3), osmZ = osmTiles(13), cc = [0, 0, 0];   // a finer reference for the enlargement
    const corners = [[0, 0], [w, 0], [0, hh], [w, hh]].map(([a, b]) => unproject(x0 + (i0 + a) * G, z0 + (j0 + b) * G));
    await osmZ.load({ w: Math.min(...corners.map((q) => q.lon)), e: Math.max(...corners.map((q) => q.lon)), s: Math.min(...corners.map((q) => q.lat)), n: Math.max(...corners.map((q) => q.lat)) });
    for (let b = 0; b < hh * Z; b++) for (let a = 0; a < w * Z; a++) { const q = unproject(x0 + (i0 + a / Z) * G, z0 + (j0 + b / Z) * G); osmZ.rgb(q.lon, q.lat, cc); for (let t = 0; t < 3; t++) cref[(b * w * Z + a) * 3 + t] = cc[t]; }
    await sheet(path.join(out, 'roads_zoom.png'), [{ title: 'OpenStreetMap (reference)', rgb: cref }, { title: 'compiled roads (centre of Seoul)', rgb: cz, svg: roadSvg(roads.lines, x0 + i0 * G, z0 + j0 * G, G, Z) }, { title: 'ground after laying the roads in', rgb: cz }], w * Z, hh * Z, zm);
  }
  // the section line, sampled every map cell
  const a = project(...region.section.from), b = project(...region.section.to), L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(L / G), dist = [], real = [];
  for (let k = 0; k <= n; k++) { const t = k / n, p = unproject(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t); dist.push(L * t); real.push(Math.max(0, dem.height(p.lon, p.lat))); }
  const colors = ['#999999', '#d0021b', '#2f6fdf', '#2a9d3a'];
  await profile(path.join(out, 'profile.png'), dist, [{ label: 'V = 1 (as now)', v: 1 }, ...Vs.map(({ name, v }) => ({ label: `V = ${name}`, v }))].map((s, k) => ({ label: s.label, color: colors[k], y: real.map((r) => r * s.v) })), `Section ${region.section.name}, ${(L / 1000).toFixed(1)} km map`);
  console.log('pictures in', out);
}
