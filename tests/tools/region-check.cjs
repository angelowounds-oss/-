// Tool (not a test): boot a build and look at one province (WLD-21d, ADR-0036). It goes to the province's detailed city (else its city hall),
// runs four seconds of game, and reports the page errors, which world files are loaded, where the 16 m ground tiles around come from (that
// province's file, another baked file, or none: the page computes them, as in a REGIONS= build without that province), the ground heights that
// are NaN on a 4 km grid, the vegetation drawn 1.5 km beyond the city edge, and one picture from above at midday. Usage: [GAME_DIR=<build>/game] [OUT=shot.jpg] node tests/tools/region-check.cjs <id>
const { openGame, freeze, result } = require('../lib.cjs');
const fs = require('fs');
const path = require('path');
(async () => {
  const id = process.argv[2], src = (f) => import(path.join(__dirname, '../../src', f));
  const [{ REGIONS, regionCity, regionOf }, { CITY_DEFS }, { CAPITAL, project }, { TILE_ORIGIN }] = await Promise.all(['regions/index.js', 'worldmap.js', 'koreamap.js', 'heightmap.js'].map(src));
  const R = REGIONS.find((r) => r.id === id);
  if (!R) { console.error('unknown province ' + id + ' (one of ' + REGIONS.map((r) => r.id).join(', ') + ')'); process.exit(2); }
  // the province's detailed city: from its file, else the one its city hall position falls in (the bake's rule, build/bake.mjs jobsFor)
  const city = CITY_DEFS.find((d) => (regionCity(d.id)?.region || regionOf(d.x - CAPITAL.x, d.z - CAPITAL.z)) === id);
  const hall = project(R.hall.lon, R.hall.lat), at = { city: city?.id || null, x: hall.x - CAPITAL.x, z: hall.z - CAPITAL.z };
  // the 16 m tiles within 8 km (tiles are 4096 m)
  const tiles = [], T = 4096, ci = Math.floor((at.x - TILE_ORIGIN.x) / T), cj = Math.floor((at.z - TILE_ORIGIN.z) / T);
  for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) tiles.push(`t16/${i}_${j}`);
  const { browser, page, errors } = await openGame({ q: 1, width: 640, height: 360 });
  let o = null;
  try {
    await freeze(page);
    o = await page.evaluate(async ({ id, at, tiles }) => {
      const g = window.__game, pl = g.player, wd = window.__WORLD; g.hurtPlayer = () => {};
      const C = at.city && g.citysites.cities.find((q) => q.c.id === at.city), x = C ? C.c.x + 30 : at.x, z = C ? C.c.z + 30 : at.z;
      const y = window.__landfn.physHeight(x, z) + 1.5;
      pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false;
      // midday, clear (as views.js sets a reference view), and the camera pinned 250 m up, 700 m south, so the ground, the vegetation and the
      // city edge show (the street itself can be inside a lot)
      const sky = () => { g.clock.scale = 0; g.clock.t = Math.floor(g.clock.t / 1440) * 1440 + ((13 - (g.rules?.local?.hourOffset || 0) + 24) % 24) * 60; g.state.weather = { type: 'clear', until: g.clock.t + 1e9 }; g.daynight.wet = 0; };
      const gy = window.__landfn.landHeight(x, z + 700);
      sky(); g.viewCam = { x, y: (Number.isFinite(gy) ? gy : 0) + 250, z: z + 700, tx: x, ty: window.__landfn.landHeight(x, z) || 0, tz: z };
      // stepped with rendering stubbed (a SwiftShader frame takes about a second here); the picture below is one real frame
      const realRender = g.eng.render; g.eng.render = () => {};
      for (let i = 0; i < 240; i++) { window.__upd(1 / 60); if (i === 120) sky(); }
      g.eng.render = realRender;
      const from = { own: 0, other: 0, none: 0 };
      for (const k of tiles) { const s = wd && wd.find(k); from[!s ? 'none' : s.name.endsWith(':' + id + '.pak') ? 'own' : 'other']++; }
      let nan = 0; for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) if (!Number.isFinite(window.__landfn.landHeight(x - 2000 + i * 210, z - 2000 + j * 210))) nan++;
      g.renderFrame(0, true);
      const cv = g.eng.renderer.domElement, k = document.createElement('canvas'); k.width = cv.width; k.height = cv.height; k.getContext('2d').drawImage(cv, 0, 0);
      const img = k.toDataURL('image/jpeg', 0.85);
      // the vegetation 1.5 km beyond the city edge, on the first side that is land (trees drawn near the player, billboards farther, grass)
      const d = (C ? C.c.r || 0 : 0) + 1500, side = [[0, -1], [1, 0], [-1, 0], [0, 1]].find(([a, b]) => window.__landfn.landHeight(x + a * d, z + b * d) > 2) || [0, -1];
      const vx = x + side[0] * d, vz = z + side[1] * d, vy = window.__landfn.physHeight(vx, vz) + 1.5;
      g.viewCam = null; pl.body3.teleport(vx, vy, vz); pl.x = vx; pl.y = vy; pl.z = vz; g.eng.render = () => {};
      for (let i = 0; i < 120; i++) window.__upd(1 / 60);
      g.eng.render = realRender;
      const st = g.forest ? g.forest.stats : {}, veg = { near: st.near | 0, bill: st.bill | 0, grass: st.grass | 0 };
      return { at: { city: at.city, x: Math.round(x), z: Math.round(z) }, files: wd ? wd.sources.map((s) => s.name) : [], tiles: from, nan, veg, img };
    }, { id, at, tiles });
  } finally { await browser.close(); }
  const out = process.env.OUT || path.join(process.cwd(), `region-${id}.jpg`);
  fs.writeFileSync(out, Buffer.from(o.img.split(',')[1], 'base64'));
  const loaded = o.files.some((n) => n.endsWith(':' + id + '.pak'));
  result('region-check:' + id, errors.length === 0 && o.nan === 0, { at: o.at, loaded, files: o.files.length, tiles: o.tiles, nan: o.nan, veg: o.veg, errors: errors.slice(0, 5), shot: out });
})().catch((e) => { result('region-check', false, { error: String(e && e.stack || e).slice(0, 600) }); });
