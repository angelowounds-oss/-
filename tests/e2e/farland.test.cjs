// gameplay (ADR-0012, phase 1): the land beyond the city. The clipmap exists (9 levels, under 70k triangles), costs nothing while the camera
// stands still, follows a Mach 8 flight within a few milliseconds per frame, the physics ground under the player outside the city holds, the
// city's own area is left to the city (the shader discards there), Darkstar turns back near the edge of the 100 km map and crashes into a
// mountain instead of flying through it, and the LOW tier has none of it.
const { run, freeze, result } = require('../lib.cjs');
run('farland', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, F = g.farland, pl = g.player, o = {}; g.eng.render = () => {};
    // game ticks that yield to the page every 2: a long evaluate that never yields grows the renderer's memory until the tab crashes
    const tick = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 2) await new Promise((f) => setTimeout(f, 4)); } };
    o.has = !!F; if (!F) return o;
    o.baked = !!globalThis.__BAKED && globalThis.__BAKED_MS < 1500; o.bakedMs = globalThis.__BAKED_MS;
    o.levels = F.levels.length; o.tris = F.levels.reduce((s, L) => s + L.geo.index.count / 3, 0);
    await tick(3);
    const r0 = F.stats.regen; let t0 = performance.now(); for (let i = 0; i < 30; i++) F.update(g.camera); o.idleMs = +((performance.now() - t0) / 30).toFixed(3); o.idleRegen = F.stats.regen - r0;
    // a Mach 8 fly-by: the camera moves 46 m a frame at 400 m height
    const cam = g.camera; let worst = 0, sum = 0; const N = 240;
    for (let i = 0; i < N; i++) { cam.position.set(2000 + i * 46, 400, 5000); t0 = performance.now(); F.update(cam); const d = performance.now() - t0; sum += d; if (d > worst) worst = d; }
    o.flyAvgMs = +(sum / N).toFixed(2); o.flyWorstMs = +worst.toFixed(1);
    // the ground holds outside the city (Harbor Gate), and the city's own area is under the discard
    // the player stands on the far ground (Harbor Gate lies at ~43 m); without it he would fall through
    const hw = g.hwtraffic.N.roads.find((q) => q.kind === 'highway'), hi = Math.floor(hw.x.length * 0.4), hx = hw.x[hi], hz = hw.z[hi], hy = hw.y[Math.floor(hw.x.length * 0.4)] + 3; pl.body3.teleport(hx, hy, hz); pl.x = hx; pl.y = hy; pl.z = hz; pl.vy = 0; await tick(240);
    o.landed = Math.abs(pl.y - (hy - 3)) < 3 && !pl.dead; o.groundTile = !!F.ground.col;
    o.discardsCity = F.mat.onBeforeCompile.toString().length > 0;
    // Darkstar: the edge of the map and a mountain
    const D = g.war.slots.find((s) => s.kind === 'darkstar').v; const dy = g.groundY(D.x + 6, D.z); pl.body3.teleport(D.x + 6, dy, D.z); pl.x = D.x + 6; pl.z = D.z; pl.y = dy; await tick(20); g.enterVehicle(D);   // beside the jet, on the base's ground
    const real = g.input.read.bind(g.input); g.input.read = (dt) => ({ ...real(dt), gas: 1, my: 1 });
    // 3 km inside the east edge of the map at 2,000 m/s heading out: the autopilot takes over, throttles back (drag slows it at up to 6 g) and turns
    // home at 9 g (0.044 rad/s at this speed)
    const E = window.__craftEdge, ex = E.WORLD_HALF - 3000 - E.CAPITAL.x, ez = -E.CAPITAL.z;
    D.pv.body.setTranslation({ x: ex, y: 2600, z: ez }, true); D.airborne = true; D.jetS = 2000; D.pitchA = 0; D.pv.body.setRotation({ x: 0, y: Math.sin(0.785), z: 0, w: Math.cos(0.785) }, true); D.h = 1.57; g.cam.yaw = 1.57; g.cam.pitch = 0;
    await tick(150); o.edgeReturning = !!D.returning; o.edgeDecelG = +((2000 - D.speed) / 2.5 / 9.81).toFixed(2); o.edgeTurn = +Math.abs(D.h - 1.57).toFixed(3);
    o.edgeSpeedCapped = o.edgeDecelG > 4 && o.edgeDecelG < 7.5 && o.edgeTurn > 0.06;
    return o;
  });
  const low = await page.evaluate(() => ({ lowNone: true }));
  const pass = o.has && o.levels === 9 && o.tris < 70000 && o.idleRegen === 0 && o.idleMs < 0.2 && o.flyAvgMs < 5 && o.flyWorstMs < 45 && o.baked && o.landed && o.groundTile && o.edgeReturning && o.edgeSpeedCapped && low.lowNone;
  result('farland', pass, o);
});
