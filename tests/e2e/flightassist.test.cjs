// gameplay (ADR-0012 phase 5d): the two flight helps. Heading for the volcano (1,900 m) at 1,000 m/s: with the low-altitude assist alone the aircraft is
// lifted over it instead of crashing (PULL UP shows), with altitude hold it keeps the target and is lifted when the mountain is higher than the
// target. Hold is also dropped below 120 m/s (landing), and a pilot who dives on purpose (descend key) is left alone.
const { run, freeze, result } = require('../lib.cjs');
// Hallasan's summit in game coordinates (worldmap VOLCANO less koreamap CAPITAL; the terrain there peaks at ~1,700 m); the old (-21000, 24000)
// is flat land near the capital at 1:1
const VOLCANO = { x: -44602, z: 467593 };
run('flightassist', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async (V) => {
    const g = window.__game, pl = g.player, o = {}; g.eng.render = () => {}; g.hurtPlayer = () => {};
    // yields to the page every 2 ticks: a long evaluate that never yields grows the renderer's memory until the tab crashes
    let ticks = 0; const step = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (++ticks % 2 === 0) await new Promise((f) => setTimeout(f, 4)); } };
    const D = g.war.slots.find((s) => s.kind === 'darkstar').v; o.has = !!D;
    const real = g.input.read.bind(g.input); g.input.read = (dt) => ({ ...real(dt), gas: 0, my: 0, brake: 0 });
    const dy = g.groundY(D.x + 6, D.z); pl.body3.teleport(D.x + 6, dy, D.z); pl.x = D.x + 6; pl.z = D.z; pl.y = dy;
    await step(20); g.enterVehicle(D);
    const launch = (y, speed) => { D.dead = false; D.hp = D.maxHp; D.pv.body.setTranslation({ x: V.x + 15000, y, z: V.z }, true); D.airborne = true; D.jetS = speed; D.thrLvl = speed / 3430; g.cam.yaw = -1.5708; g.cam.pitch = 0; D.h = -1.5708; D.pitchA = 0; D.bank = 0; D.altHold = null; D.returning = false; };   // pointed west at the summit: the first flight kept the parked heading and curved past the mountain
    const fly = async (frames) => { let minAgl = 1e9, pull = 0, maxY = 0, peak = 0; for (let k = 0; k < frames && !D.dead; k++) { await step(1); const b = D.pv.body.translation(); const gnd = window.__farHeights.landHeight(b.x, b.z, 64); minAgl = Math.min(minAgl, b.y - gnd); peak = Math.max(peak, gnd); maxY = Math.max(maxY, b.y); if (D.pullUp) pull++; if (Math.abs(b.x - V.x) < 800 && Math.abs(b.z - V.z) < 800) break; } return { minAgl: Math.round(minAgl), peak: Math.round(peak), pull, maxY: Math.round(maxY), dead: !!D.dead, x: Math.round(D.pv.body.translation().x) }; };
    launch(1200, 1000); o.assist = await fly(900);
    launch(2600, 1000); D.altHold = 2600; g.input.edge('alt'); o.hold = await fly(900); o.hold.target = Math.round(D.altHold);
    // 300 m over the slope it starts above
    launch(window.__farHeights.landHeight(V.x + 15000, V.z, 64) + 300, 80); o.slow = { pull: 0 }; await step(60); o.slow.holdDropped = D.altHold == null; o.slow.noPull = !D.pullUp;
    g.input.read = real; return o;
  }, VOLCANO);
  const pass = o.has && !o.assist.dead && o.assist.pull > 0 && o.assist.peak > 1200 && o.assist.minAgl > 20 && !o.hold.dead && o.hold.minAgl > 60 && o.slow.holdDropped && o.slow.noPull;
  result('flightassist', pass, o);
});
