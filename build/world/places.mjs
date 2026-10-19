// Real settlements of a region (KOREA-PLAN v2 M4a, ADR-0021): OpenStreetMap place nodes (city, town, suburb, village) become the game's villages. Each gets a
// site that is land and not steep, a minimum spacing, and a flat pad cut into the raster before the roads are laid in (the game's ground inside a region
// is the compiled raster alone, so a pad has to be made here).
import { project, CAPITAL } from '../../src/koreamap.js';
import { KEEP, BAND, EDGE } from './emit.mjs';

// r lists the pad radii to try, widest first: a city or town gets a district-sized pad (M4b-1) when the ground allows, else the old village size
const KIND = { city: { rank: 4, r: [900, 600, 300] }, town: { rank: 3, r: [500, 350, 260] }, suburb: { rank: 2, r: [230] }, village: { rank: 1, r: [200] } };
const SPACING = 800, MAX_PLACES = 80, MAX_SLOPE = 0.3, MAX_WET = 0.1, FADE = 40;
const hangul = (s) => /[가-힣]/.test(s || '');

export function placesPass(R, gh, els, SEA) {
  const lx0 = R.x0 - CAPITAL.x, lz0 = R.z0 - CAPITAL.z, g = R.g;
  const ok = (x, z) => Math.max(Math.abs(x), Math.abs(z)) >= KEEP + BAND && x >= lx0 + EDGE && z >= lz0 + EDGE && x <= lx0 + (R.nx - 1) * g - EDGE && z <= lz0 + (R.nz - 1) * g - EDGE;
  const cand = [];
  for (const e of els) {
    const t = e.tags || {}, k = KIND[t.place], name = t['name:ko'] || t.name; if (!k || !hangul(name)) continue;
    const p = project(e.lon, e.lat), x = p.x - CAPITAL.x, z = p.z - CAPITAL.z; if (!ok(x, z)) continue;
    cand.push({ name, kind: t.place, pop: +t.population || 0, x, z, k });
  }
  cand.sort((a, b) => b.k.rank - a.k.rank || b.pop - a.pop || a.name.localeCompare(b.name));
  // the cells of the disc (r) around (x, z): heights of the land and the share of water
  const disc = (x, z, r, fn) => {
    const i0 = Math.max(0, Math.floor((x - r - lx0) / g)), i1 = Math.min(R.nx - 1, Math.ceil((x + r - lx0) / g)), j0 = Math.max(0, Math.floor((z - r - lz0) / g)), j1 = Math.min(R.nz - 1, Math.ceil((z + r - lz0) / g));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const d = Math.hypot(lx0 + i * g - x, lz0 + j * g - z); if (d <= r) fn(j * R.nx + i, d); }
  };
  const site = (x, z, r) => {
    const hs = []; let n = 0, wet = 0, core = 0; disc(x, z, r, (k, d) => { n++; if (R.water[k]) { wet++; if (d < r * 0.6) core++; } else hs.push(gh[k]); });
    if (n < 4 || wet / n > MAX_WET || core || hs.length < 4) return null;
    hs.sort((a, b) => a - b); const lo = hs[Math.floor(hs.length * 0.1)], hi = hs[Math.floor(hs.length * 0.9)], slope = (hi - lo) / (2 * r);
    return slope > MAX_SLOPE ? null : { y: hs[hs.length >> 1], slope };
  };
  const out = [], st = { candidates: cand.length, water: 0, steep: 0, crowded: 0, placed: 0 };
  for (const c of cand) {
    if (out.length >= MAX_PLACES) break;
    let best = null, why = 'crowded';
    for (const [dx, dz] of [[0, 0], ...[200, 400].flatMap((d) => Array.from({ length: 8 }, (_, a) => [Math.cos(a * Math.PI / 4) * d, Math.sin(a * Math.PI / 4) * d]))]) {
      const x = c.x + dx, z = c.z + dz; if (!ok(x, z)) continue;
      for (const r of c.k.r) {
        if (out.some((o) => Math.hypot(o.x - x, o.z - z) < Math.max(SPACING, o.r + r + 100))) continue;
        const s = site(x, z, r); if (!s) { why = 'site'; continue; }
        best = { x, z, y: s.y, r }; break;
      }
      if (best) break;
    }
    if (!best) { if (why === 'site') st.steep++; else st.crowded++; continue; }
    out.push({ id: `osm:place:${out.length}`, name: c.name, kind: c.kind, pop: c.pop, x: best.x, z: best.z, r: best.r, y0: best.y });
  }
  // the pads: inside r the ground is the site height, over the next FADE metres it returns to the natural ground
  for (const o of out) disc(o.x, o.z, o.r + FADE, (k, d) => { if (R.water[k]) return; const w = d <= o.r ? 1 : 1 - (d - o.r) / FADE, s = w * w * (3 - 2 * w); gh[k] = gh[k] * (1 - s) + o.y0 * s; });
  st.placed = out.length;
  return { places: out.map((o) => ({ id: o.id, name: o.name, kind: o.kind, pop: o.pop, x: o.x, z: o.z, y: o.y0 + SEA, r: o.r })), stats: st };
}
