// gameplay (ADR-0012, phase 4): the five other cities. Every city has a plan with its own style, the three levels of detail follow the camera
// (instanced facade near, merged meshes in range, a skyline mesh at any distance), collision boxes exist around the player and hold him up,
// and the cost stays inside the budget. CITYSHOTS=1 also writes a screenshot per city to tests/results/.
const fs = require('node:fs');
const { run, freeze, result } = require('../lib.cjs');
run('cities', { q: 1, width: 640, height: 360 }, async ({ page }) => {
  await freeze(page);
  const shots = !!process.env.CITYSHOTS;
  const o = await page.evaluate(async (shots) => {
    const g = window.__game, S = g.citysites, pl = g.player, o = { shots: {} }; g.hurtPlayer = () => {};
    const realRender = g.eng.render; g.eng.render = () => {}; const snap = () => { g.eng.render = realRender; g.renderFrame(0, true); const u = g.eng.renderer.domElement.toDataURL('image/png'); g.eng.render = () => {}; return u; };
    const step = (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); };
    o.has = !!S; if (!S) return o;
    o.cities = S.cities.length; o.tiles = S.stats.tiles; o.tris = Math.round(S.stats.tris); o.signs = S.stats.signs;
    // city 1 is the airport city on Yeongjong (ADR-0037): a fixed city of r ~1.1 km, a terminal and hangars rather than blocks, so far fewer buildings
    o.buildings = S.cities.map((C) => C.L.bld.length / 12);
    o.styles = new Set(S.cities.map((C) => C.S.palette[0] + ':' + C.S.pattern)).size;
    // a free camera for the pictures: the game's chase camera lags behind teleports
    const view = (x, y, z, tx, ty, tz) => { const cam = g.camera; cam.position.set(x, y, z); cam.lookAt(tx, ty, tz); cam.updateMatrixWorld(); for (let i = 0; i < 24; i++) { g.farland.update(cam, { x, y, z }); g.highways.update(cam); S.update(cam, { x, y, z }, 0.02); } };
    // fly to each city, look at the middle, and stand in the street
    const per = {}; let worst = 0;
    for (const C of S.cities) {
      const c = C.c; pl.body3.teleport(c.x + 40, c.y + 6, c.z + 40); pl.x = c.x + 40; pl.y = c.y + 6; pl.z = c.z + 40; pl.vx = pl.vz = pl.vy = 0;
      for (let i = 0; i < 90; i++) { const t0 = performance.now(); window.__upd(1 / 60); const d = performance.now() - t0; if (i > 10 && d > worst) worst = d; }
      per[c.id] = { near: S.stats.near, mid: S.stats.mid, coll: S.stats.coll, y: +pl.y.toFixed(1), ground: c.y };
      if (shots) {
        view(c.x, c.y + 3.5, c.z + 150, c.x, c.y + 30, c.z); o.shots[c.id + '-street'] = snap();
        view(c.x, c.y + 380, c.z + 700, c.x, c.y, c.z - 200); o.shots[c.id + '-aerial'] = snap();
        if (C.L.seaDir) { const d = C.L.seaDir; view(c.x + d.x * C.L.R * 0.2, c.y + 900, c.z + d.z * C.L.R * 0.2 - 300, c.x + d.x * C.L.R * 0.6, c.y, c.z + d.z * C.L.R * 0.6); o.shots[c.id + '-quay'] = snap(); }
        if (c.type === 'airport') { view(c.x, c.y + 800, c.z + C.L.R * 0.28 + 500, c.x, c.y, c.z + C.L.R * 0.28); o.shots[c.id + '-runway'] = snap(); }
        view(c.x, c.y + 260, c.z + C.L.R * 2.2, c.x, c.y + 20, c.z); o.shots[c.id + '-far'] = snap();
      }
    }
    // an enterable building in the third city: its lot reaches the Buildings manager, opens at the door, and the lobby holds the player up
    { const C = S.cities[3], c = C.c; pl.body3.teleport(c.x + 40, 1, c.z + 40); pl.x = c.x + 40; pl.y = 1; pl.z = c.z + 40; step(120);
      const lots = [...C.tiles.values()].flatMap((t) => (t.near ? t.near.lots : [])), lot = lots.sort((a, b) => Math.hypot(a.door.px - pl.x, a.door.pz - pl.z) - Math.hypot(b.door.px - pl.x, b.door.pz - pl.z))[0], d = lot.door;
      pl.body3.teleport(d.px + d.nx * 3, 0.6, d.pz + d.nz * 3); pl.x = d.px + d.nx * 3; pl.y = 0.6; pl.z = d.pz + d.nz * 3; pl.vx = pl.vz = pl.vy = 0; step(240);
      const b = g.buildings.byLot.get(lot); o.int = { lots: lots.length, has: !!b, open: !!b?.open, floors: b ? b.floors.size : 0, name: lot.name };
      pl.body3.teleport(d.px - d.nx * 4, 0.6, d.pz - d.nz * 4); pl.x = d.px - d.nx * 4; pl.y = 0.6; pl.z = d.pz - d.nz * 4; step(120);
      o.int.inside = !!g.buildings.current(pl.x, pl.z, pl.y); o.int.y = +pl.y.toFixed(2); o.int.alive = !pl.dead;
      // fire and collapse as in the capital: a building of this city burns, comes down, stays a ruin when the tile goes away and comes back
      pl.body3.teleport(d.px + d.nx * 40, 0.6, d.pz + d.nz * 40); pl.x = d.px + d.nx * 40; pl.y = 0.6; pl.z = d.pz + d.nz * 40; step(60);
      const Bz = g.blaze, st = Bz.igniteLot(lot, null); step(120); o.fire = { burning: !!st && st.heat[0] > 0.3, burnAttr: lot.fac.burn.array[lot.tierIdx * 4 + 2] };
      Bz.collapseNow(lot, null); step(720); o.fire.ruined = Bz.ruins.has(lot); o.fire.podiumH = +lot.fac.mesh.instanceMatrix.array[lot.tierIdx * 16 + 5].toFixed(1); o.fire.towerGone = lot.fac.mesh.instanceMatrix.array[(lot.tierIdx + 1) * 16 + 5] === 0;
      const lid = lot.id; pl.body3.teleport(c.x - 2400, 1, c.z - 2400); pl.x = c.x - 2400; pl.y = 1; pl.z = c.z - 2400; step(200);
      o.fire.droppedClean = !Bz.lots.includes(lot) && !Bz.ruins.has(lot);
      pl.body3.teleport(d.px + d.nx * 40, 0.6, d.pz + d.nz * 40); pl.x = d.px + d.nx * 40; pl.y = 0.6; pl.z = d.pz + d.nz * 40; step(240);
      const lot2 = [...C.tiles.values()].flatMap((t) => (t.near ? t.near.lots : [])).find((l) => l.id === lid); o.fire.restored = !!lot2 && Bz.ruins.has(lot2);
    }
    { const sh = g.ships.ships; const c = S.cities[0].c; pl.body3.teleport(c.x + 30, 1, c.z + 30); pl.x = c.x + 30; pl.y = 1; pl.z = c.z + 30; step(30); g.camera.position.set(c.x, 60, c.z); let vis = 0, moved = 0; const p0 = sh[1].g.position.x; g.time = 10; g.ships.update(0.016); g.time = 150; g.ships.update(0.016); moved = Math.abs(sh[1].g.position.x - p0) + Math.abs(sh[1].g.position.z); vis = sh.filter((q) => q.g.visible).length; o.ships = { n: sh.length, vis, moved: Math.round(moved) }; }
    o.per = per; o.worstFrameMs = +worst.toFixed(1);
    // from far away: skyline + mid tiles in range, no near tiles
    const c0 = S.cities[0].c; view(c0.x, c0.y + 300, c0.z + 5200, c0.x, c0.y + 30, c0.z);
    o.air = { near: S.stats.near, mid: S.stats.mid };
    return o;
  }, shots);
  if (shots) for (const [k, v] of Object.entries(o.shots || {})) fs.writeFileSync(`tests/results/city-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
  delete o.shots;
  const stood = o.per && Object.values(o.per).every((p) => p.y > p.ground - 0.5 && p.y < p.ground + 8);
  const pass = o.has && o.cities === 6 && o.styles === 6 && o.buildings.every((n, i) => n > (i === 1 ? 150 : 1000)) && o.tris < 2.2e6 && Object.values(o.per).every((p) => p.near > 0 && p.coll > 20) && stood && o.air.near === 0 && o.air.mid > 0 && o.worstFrameMs < 400 && o.int.has && o.int.open && o.int.floors >= 1 && o.int.inside && o.int.y < 1.5 && o.ships.n === 3 && o.ships.vis >= 1 && o.ships.moved > 50 && o.int.alive && o.fire.burning && o.fire.ruined && o.fire.towerGone && o.fire.droppedClean && o.fire.restored;
  result('cities', pass, { ...o, stood });
});
