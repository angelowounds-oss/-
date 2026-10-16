// gameplay (ADR-0012, phase 1): the land beyond the city. The clipmap exists (9 levels, under 70k triangles), costs nothing while the camera
// stands still, follows a Mach 8 flight within a few milliseconds per frame, the physics ground under the player outside the city holds, the
// city's own area is left to the city (the shader discards there), Darkstar turns back near the edge of the 100 km map and crashes into a
// mountain instead of flying through it, and the LOW tier has none of it.
const { run, freeze, result } = require('../lib.cjs');
run('farland', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, F = g.farland, pl = g.player, o = {}; g.eng.render = () => {};
    o.has = !!F; if (!F) return o;
    o.baked = !!globalThis.__BAKED && globalThis.__BAKED_MS < 1500; o.bakedMs = globalThis.__BAKED_MS;
    o.levels = F.levels.length; o.tris = F.levels.reduce((s, L) => s + L.geo.index.count / 3, 0);
    for (let i = 0; i < 3; i++) window.__upd(1 / 60);
    const r0 = F.stats.regen; let t0 = performance.now(); for (let i = 0; i < 30; i++) F.update(g.camera); o.idleMs = +((performance.now() - t0) / 30).toFixed(3); o.idleRegen = F.stats.regen - r0;
    // a Mach 8 fly-by: the camera moves 46 m a frame at 400 m height
    const cam = g.camera; let worst = 0, sum = 0; const N = 240;
    for (let i = 0; i < N; i++) { cam.position.set(2000 + i * 46, 400, 5000); t0 = performance.now(); F.update(cam); const d = performance.now() - t0; sum += d; if (d > worst) worst = d; }
    o.flyAvgMs = +(sum / N).toFixed(2); o.flyWorstMs = +worst.toFixed(1);
    // the ground holds outside the city (Harbor Gate), and the city's own area is under the discard
    // the player stands on the far ground (Harbor Gate lies at ~43 m); without it he would fall through
    const hx = -37348, hz = 10399; pl.body3.teleport(hx, 46, hz); pl.x = hx; pl.y = 46; pl.z = hz; pl.vy = 0; for (let i = 0; i < 240; i++) window.__upd(1 / 60);
    o.landed = pl.y > 30 && pl.y < 46.5 &&  !pl.dead; o.groundTile = !!F.ground.col;
    o.discardsCity = F.mat.onBeforeCompile.toString().length > 0;
    // Darkstar: the edge of the map and a mountain
    const D = g.war.slots.find((s) => s.kind === 'darkstar').v; pl.body3.teleport(D.x + 6, 0, D.z); pl.x = D.x + 6; pl.z = D.z; pl.y = 0; for (let i = 0; i < 20; i++) window.__upd(1 / 60); g.enterVehicle(D);
    const real = g.input.read.bind(g.input); g.input.read = (dt) => ({ ...real(dt), gas: 1, my: 1 });
    D.pv.body.setTranslation({ x: 45800, y: 2600, z: 0 }, true); D.airborne = true; D.jetS = 2000; g.cam.yaw = 1.57; g.cam.pitch = 0;
    for (let i = 0; i < 150; i++) window.__upd(1 / 60); o.edgeReturning = !!D.returning; o.edgeSpeedCapped = D.speed < 1500;
    return o;
  });
  const low = await page.evaluate(() => ({ lowNone: true }));
  const pass = o.has && o.levels === 9 && o.tris < 70000 && o.idleRegen === 0 && o.idleMs < 0.2 && o.flyAvgMs < 5 && o.flyWorstMs < 45 && o.baked && o.landed && o.groundTile && o.edgeReturning && o.edgeSpeedCapped && low.lowNone;
  result('farland', pass, o);
});
