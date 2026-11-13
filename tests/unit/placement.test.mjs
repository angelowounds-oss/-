// Placement audit (WLD-35, docs/IMPROVEMENTS-2026-11-11.md 3.7): what the other world tests missed, measured with the audit tools themselves.
//   floaters  every street record (lamps, trees, stops, entrances, benches, bins, hydrants, vending) against the ground the game draws: none where the
//             region's raster is not the drawn ground (the keep zone, its band, a city's hole, the edge band), none hanging over 2 m inside, no deck item
//             without a road surface under it (WLD-29, WLD-32)
//   sites     no house of a village or farm on a road or on a map building (WLD-30)
//   corridor  no real building across a road of the collector class or bigger, no stretch of road where the walls leave under 3 m (WLD-31, WLD-33);
//             the residential length with a wall inside the drawn carriageway stays under a regression bar
// Skips with a note when the compiled region is missing. The corridor needs a big heap: the test runs itself again with one.
import path from 'node:path';
import { spawnSync } from 'node:child_process';

if (!process.execArgv.some((a) => a.startsWith('--max-old-space-size'))) {
  const r = spawnSync(process.execPath, ['--max-old-space-size=12000', new URL(import.meta.url).pathname], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || ''); process.exit(r.status ?? 1);
}

const { readRegion } = await import('../../build/world/emit.mjs');
const { readStreets } = await import('../../build/world/streets.mjs');
const { readBuildings } = await import('../../build/world/blocks.mjs');
const { floaters } = await import('../../build/world/floaters.mjs');
const { siteCheck } = await import('../../build/world/sites.mjs');
const { measure } = await import('../../build/world/corridor.mjs');
const { drawnGround } = await import('../../build/world/emit.mjs');

// WORLD_REGION=<piece> audits a compiled province piece instead of the capital (build/world/compile-all.mjs, EV-09); the sites part reads the capital's
// villages and network, so it is the capital's only
const ID = process.env.WORLD_REGION || 'capital';
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '../../build/baked/world'), dir = path.join(root, ID);
const bad = [], m = {}, notes = [];
const R = readRegion(path.join(dir, 'region.bin'));
const RES_COVERED_KM = Number(process.env.RES_COVERED_KM || 100);   // regression bar: 1,535 km before the fit (build/world/fit.mjs), 87 km after it
if (!R) notes.push('no compiled region');
else {
  // ---- the bake's test of where the raster is the drawn ground agrees with the game's (src/region.js regionWeight >= 1), around the keep zone, the airport's
  // hole and the border
  {
    globalThis.__REGION = R; const { regionWeight } = await import('../../src/region.js'), drawn = drawnGround(R);
    let n = 0, off = 0; const x1 = R.x0 + (R.nx - 1) * R.g, z1 = R.z0 + (R.nz - 1) * R.g;
    for (let k = 0; k < 40000; k++) {
      const u = ((k * 0.6180339887) % 1), v = ((k * 0.7548776662) % 1), x = R.x0 + u * (x1 - R.x0), z = R.z0 + v * (z1 - R.z0);
      n++; if (drawn(x, z) !== (regionWeight(x, z) >= 1)) off++;
    }
    m.drawnParity = { n, off }; if (off) bad.push(['drawnGround and regionWeight disagree', off]);
  }
  // ---- floaters
  const S = readStreets(path.join(dir, 'streets.bin'));
  if (!S) notes.push('no streets.bin');
  else {
    const { zones, deck } = await floaters(R, S), sum = (z, k) => Object.values(zones[z] || {}).reduce((s, o) => s + o[k], 0);
    m.wrongZone = {}; for (const z of ['keep', 'band', 'hole', 'edge']) { m.wrongZone[z] = sum(z, 'n'); if (m.wrongZone[z]) bad.push(['street records where the region is not the drawn ground', z, m.wrongZone[z]]); }
    m.floatingInside = {}; for (const [t, o] of Object.entries(zones.inside || {})) if (o.floating) m.floatingInside[t] = o.floating;
    if (Object.keys(m.floatingInside).length) bad.push(['street records hanging over the ground', m.floatingInside]);
    m.deck = deck; if (deck.unsupported) bad.push(['deck records with no road under them', deck.unsupported]);
  }
  // ---- sites
  if (ID === 'capital') {
    const st = await siteCheck(root); m.sites = st.total;
    if (st.total.onRoad) bad.push(['houses on a road', st.total.onRoad]);
    if (st.total.onMapBuilding) bad.push(['houses on a map building', st.total.onMapBuilding]);
    if (st.pads.length) bad.push(['industry pads on a road', st.pads.length]);
  } else notes.push('sites: the capital only');
  // ---- corridor
  const B = readBuildings(path.join(dir, 'buildings.bin'));
  if (!B) notes.push('no buildings.bin');
  else {
    const { lines, crossed } = measure(R, B), km = (f, k) => +lines.filter(f).reduce((s, l) => s + l[k] * l.len / 1000, 0).toFixed(1);
    const big = (l) => l.hw !== 'residential' && l.hw !== 'living_street' && l.hw !== 'service' && l.hw !== 'unclassified', res = (l) => l.hw === 'residential' && !R.roads[l.ri].alley;   // an alley (build/world/fit.mjs) is no road for cars
    m.crossed = crossed.length; m.crossedMetres = crossed.reduce((s, o) => s + o.metres, 0);
    m.alleyKm = +lines.filter((l) => R.roads[l.ri].alley).reduce((s, l) => s + l.len / 1000, 0).toFixed(1); m.noPassageBigKm = km(big, 'gap3'); m.noPassageResKm = km(res, 'gap3'); m.coveredResKm = km(res, 'covered');
    if (crossed.length) bad.push(['real buildings across a collector or bigger road', crossed.length, crossed.slice(0, 3)]);
    if (m.noPassageBigKm > 0) bad.push(['big roads a car cannot pass (km)', m.noPassageBigKm]);
    if (m.noPassageResKm > 0) bad.push(['residential streets a car cannot pass (km)', m.noPassageResKm]);
    if (m.coveredResKm > RES_COVERED_KM) bad.push(['residential carriageway over walls (km)', m.coveredResKm, RES_COVERED_KM]);
  }
}
console.log('RESULT ' + JSON.stringify({ test: 'placement', region: ID, pass: bad.length === 0, metrics: m, note: [...notes, ...(bad.length ? [JSON.stringify(bad.slice(0, 10))] : [])].join('; ') }));
process.exitCode = bad.length ? 1 : 0;
