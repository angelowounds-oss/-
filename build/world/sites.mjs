// Sites against roads (WLD-30, WLD-35): every house of every village and farm of src/settlements.js against the road network, the country roads and,
// inside the compiled region, the map's own buildings; the pads of the industry and the towers against the roads. Called by blockers.mjs sites and by
// tests/unit/placement.test.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { readBuildings } from './blocks.mjs';
import { readRegion } from './emit.mjs';
import { unproject } from './geo.mjs';
import { CAPITAL } from '../../src/koreamap.js';

const MIN_AREA = 4, K = (a, b) => a * 100003 + b;
// point in a polygon (even-odd ray cast)
function inside(x, z, px, pz) {
  let c = false;
  for (let i = 0, j = px.length - 1; i < px.length; j = i++) if ((pz[i] > z) !== (pz[j] > z) && x < ((px[j] - px[i]) * (z - pz[i])) / (pz[j] - pz[i]) + px[i]) c = !c;
  return c;
}

// ---- sites: every house of every village and farm (a rectangle in the place's own frame, which has the world's axes) against the roads and, inside the
// compiled region, the map's buildings; and the pads of the industry and the towers against the roads. A place with a real name (ADR-0021) is an invented
// village laid at the real town's spot, where the map now has its own streets and buildings (WLD-24h): that is where houses stand on roads.
export async function siteCheck(root) {
  const R = readRegion(path.join(root, 'capital', 'region.bin')), B = R ? readBuildings(path.join(root, 'capital', 'buildings.bin')) : null;
  if (R) globalThis.__REGION = R;
  const { settlements } = await import('../../src/settlements.js'), { net } = await import('../../src/roadnet.js'), { regionWeight } = await import('../../src/region.js');
  const S = settlements(), N = net(), CS = 64, SEG = [], grid = new Map();
  // a road segment with its drawn half width, in every 64 m cell it reaches (bridges and tunnels left out: nothing stands at their level)
  const seg = (x0, z0, x1, z1, half, label) => { const id = SEG.push([x0, z0, x1, z1, half, label]) - 1, m = half + 2; for (let a = Math.floor((Math.min(x0, x1) - m) / CS); a <= Math.floor((Math.max(x0, x1) + m) / CS); a++) for (let b = Math.floor((Math.min(z0, z1) - m) / CS); b <= Math.floor((Math.max(z0, z1) + m) / CS); b++) { const k = K(a, b); let g = grid.get(k); if (!g) grid.set(k, (g = [])); g.push(id); } };
  // compiled lines carry their half width; a ramp of the old network is 9.2 m wide, its dual highways 30.5 m (src/highways.js)
  for (const r of N.roads) { const half = r.kind === 'arterial' ? (r.half || 5) : r.kind === 'ramp' ? 4.6 : 15.25, n = r.x.length, m = r.closed ? n : n - 1; for (let i = 0; i < m; i++) { if (r.cls && (r.cls[i] || r.cls[(i + 1) % n])) continue; const j = (i + 1) % n; seg(r.x[i], r.z[i], r.x[j], r.z[j], half, r.kind === 'arterial' ? r.hw : r.kind); } }
  // the country roads (assets/roads/country.bin, src/countryroads.js): u32 header length, a JSON head, then x z pairs; 8.8 m asphalt or a 5.8 m track
  { const bin = fs.readFileSync(path.join(root, '..', '..', '..', 'assets', 'roads', 'country.bin')), hl = bin.readUInt32LE(0), head = JSON.parse(bin.subarray(4, 4 + hl).toString('utf8'));
    for (const r of head.roads) { const p = new Float32Array(bin.buffer.slice(bin.byteOffset + 4 + hl + r.off, bin.byteOffset + 4 + hl + r.off + r.n * 8)); for (let q = 0; q + 1 < r.n; q++) seg(p[q * 2], p[q * 2 + 1], p[q * 2 + 2], p[q * 2 + 3], r.cls ? 2.9 : 4.4, 'country'); } }
  const onRoad = (x, z) => { const g = grid.get(K(Math.floor(x / CS), Math.floor(z / CS))); if (!g) return null; for (const id of g) { const s = SEG[id], ex = s[2] - s[0], ez = s[3] - s[1], l2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - s[0]) * ex + (z - s[1]) * ez) / l2)); if (Math.hypot(s[0] + ex * t - x, s[1] + ez * t - z) < s[4]) return s[5]; } return null; };
  // the map's outlines of a 512 m tile and the eight around it, read when a place needs them
  const polys = new Map();
  const tilePolys = (ti, tj) => { const key = ti + '_' + tj; if (polys.has(key)) return polys.get(key); const t = B?.tiles[key], out = []; if (t) { const ox = (ti - B.off) * B.tile + B.tile / 2, oz = (tj - B.off) * B.tile + B.tile / 2; for (let b = 0; b < (t.pn || 0); b++) { const r0 = t.pr[b], px = [], pz = []; for (let i = t.ro[r0]; i < t.ro[r0 + 1]; i++) { px.push(ox + t.px[i] / 10); pz.push(oz + t.pz[i] / 10); } out.push({ px, pz }); } } polys.set(key, out); return out; };
  const inBuilding = (x, z) => { if (!B) return false; const ti = Math.floor(x / B.tile) + B.off, tj = Math.floor(z / B.tile) + B.off; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const p of tilePolys(ti + a, tj + b)) if (inside(x, z, p.px, p.pz)) return true; return false; };
  const rows = [], tot = { places: 0, houses: 0, onRoad: 0, onMapBuilding: 0 };
  for (const v of [...S.villages, ...S.farms]) {
    const inReg = regionWeight(v.x, v.z) > 0, labels = new Set(); let hr = 0, hb = 0; tot.places++;
    for (const h of v.houses) {
      const [x0, z0, x1, z1] = h.r; let r = 0, b = 0; tot.houses++;
      for (let x = x0 + 1; x < x1; x += 2) for (let z = z0 + 1; z < z1; z += 2) { const lab = onRoad(v.x + x, v.z + z); if (lab) { r++; labels.add(lab); } if (inReg && inBuilding(v.x + x, v.z + z)) b++; }
      if (r * 4 >= MIN_AREA) hr++; if (b * 4 >= MIN_AREA) hb++;
    }
    // the village's own main street (along x through its centre) inside the map's buildings
    let sIn = 0, sN = 0; if (inReg && v.Lh) for (let x = -v.Lh; x <= v.Lh; x += 4) { sN++; if (inBuilding(v.x + x, v.z)) sIn++; }
    tot.onRoad += hr; tot.onMapBuilding += hb;
    if (hr || hb || sIn) { const ll = unproject(v.x + CAPITAL.x, v.z + CAPITAL.z); rows.push({ id: v.id, name: v.name, tag: v.tag || (v.farm ? 'farm' : ''), lat: +ll.lat.toFixed(4), lon: +ll.lon.toFixed(4), x: Math.round(v.x), z: Math.round(v.z), houses: v.houses.length, onRoad: hr, onMapBuilding: hb, streetInBuildingPct: sN ? Math.round(100 * sIn / sN) : 0, roads: [...labels].join(', ') }); }
  }
  // the pads of the industry and the towers: a road through the flat ground they stand on
  const pads = [];
  for (const s of [...S.industry, ...S.towers]) { const r = s.type === 'wind' ? 60 : s.type === 'refinery' ? 210 : s.type === 'mine' ? 190 : s.type ? 150 : 24; let hit = 0, n = 0; for (let a = 0; a < 6.28; a += 0.2) for (const k of [0.3, 0.6, 0.9]) { n++; if (onRoad(s.x + Math.cos(a) * r * k, s.z + Math.sin(a) * r * k)) hit++; } if (hit) pads.push({ id: s.id, type: s.type || 'tower', roadPct: Math.round(100 * hit / n) }); }
  rows.sort((a, b) => b.onRoad - a.onRoad || b.onMapBuilding - a.onMapBuilding);
  const out = { mode: 'sites', counts: { villages: S.villages.length, realNamed: S.villages.filter((v) => v.tag === 'real').length, farms: S.farms.length, industry: S.industry.length, towers: S.towers.length }, total: tot, placesAffected: rows.length, places: rows, pads };
  out.root = root; return out;
}

// writes blockers.json under build/baked/world/sites/ and prints the summary (blockers.mjs sites)
export function siteReport(out) {
  const root = out.root; delete out.root;
  fs.mkdirSync(path.join(root, 'sites'), { recursive: true }); fs.writeFileSync(path.join(root, 'sites', 'blockers.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ counts: out.counts, total: out.total, placesAffected: out.placesAffected, pads: out.pads }));
  for (const r of out.places.slice(0, 20)) console.log(`${r.lat},${r.lon}\t${r.name} (${r.tag})\t${r.onRoad} of ${r.houses} houses on a road, ${r.onMapBuilding} on a map building\t${r.roads}`);
}
