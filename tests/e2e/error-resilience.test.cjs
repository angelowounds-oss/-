// stability (PERF-03): one throw must not stop the game. An NPC whose update always throws and a car whose control always throws are each
// taken out of the world while the frames go on; a subsystem that throws once costs one skipped call; only a stage that keeps throwing for
// STAGE_FAILS (90) frames in a row reaches the error screen, and not one frame sooner. Every caught error lands once in the error log
// (repeats count up). The thrown messages carry "test-boom" and are taken out of the page-error list: they are the test's own.
const { run, freeze, result } = require('../lib.cjs');
run('error-resilience', { q: 1 }, async ({ page, errors }) => {
  await freeze(page);
  await page.evaluate(() => { window.__game.eng.render = () => {}; });   // the logic is under test; a 1:1 city frame on the software GPU only costs time
  const step = (n) => page.evaluate(async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 2) await new Promise((f) => setTimeout(f, 4)); } }, n);
  const o = {};
  // an NPC near the camera (updated every frame) that throws on every update
  o.npc = await page.evaluate(() => {
    const g = window.__game, c = g.camera.position;
    const h = g.humans.filter((x) => x !== g.player && !x.dead && !x.inside).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
    if (!h) return { found: false };
    window.__bad = h; h.update = () => { throw new Error('test-boom npc'); };
    return { found: true, t0: g.time, log0: g.errors.length };
  });
  await step(60);
  Object.assign(o.npc, await page.evaluate(() => {
    const g = window.__game, h = window.__bad, e = g.errors.find((x) => x.msg === 'test-boom npc');
    return { t1: +g.time.toFixed(2), gone: !g.humans.includes(h), logged: !!e, stage: e && e.stage, n: e && e.n };
  }));
  // a car that is driven this frame (taken out of the vehicle list the pass after it threw)
  o.car = await page.evaluate(() => {
    const g = window.__game;
    let v = g.vehicles.find((x) => x !== g.vehicle && x.driver === 'ai' && !x.dead);
    if (!v) { g.spawnTraffic(true); v = g.vehicles.find((x) => x !== g.vehicle && x.driver === 'ai' && !x.dead); }
    if (!v) return { found: false };
    window.__badCar = v; v.control = () => { throw new Error('test-boom car'); };
    return { found: true, t0: +g.time.toFixed(2) };
  });
  await step(20);
  Object.assign(o.car, await page.evaluate(() => {
    const g = window.__game, v = window.__badCar, e = g.errors.find((x) => x.msg === 'test-boom car');
    return { t1: +g.time.toFixed(2), gone: !g.vehicles.includes(v), logged: !!e, stage: e && e.stage };
  }));
  // a subsystem that throws once: the stage's run of failures goes back to 0 on the next frame
  o.once = await page.evaluate(() => {
    const g = window.__game, up = g.jobs.update; let left = 1;
    g.jobs.update = function (dt) { if (left-- > 0) throw new Error('test-boom once'); return up.call(this, dt); };
    window.__upd(1 / 60); const after1 = g.stageFails['규칙'];
    window.__upd(1 / 60); const after2 = g.stageFails['규칙'];
    g.jobs.update = up;
    return { after1, after2 };
  });
  // a subsystem that keeps throwing: frames 1..89 go on, frame 90 rethrows to the main loop (the error screen)
  o.always = await page.evaluate(() => {
    const g = window.__game, up = g.jobs.update; let frames = 0, threwAt = 0;
    g.jobs.update = () => { throw new Error('test-boom always'); };
    for (let i = 1; i <= 120 && !threwAt; i++) { try { window.__upd(1 / 60); frames = i; } catch (e) { threwAt = i; } }
    g.jobs.update = up; window.__upd(1 / 60);
    const e = g.errors.find((x) => x.msg === 'test-boom always');
    return { frames, threwAt, n: e && e.n, after: g.stageFails['규칙'] };
  });
  o.log = await page.evaluate(() => ({ size: window.__game.errors.length, button: document.getElementById('errCopy').textContent }));
  // the test's own throws are logged with console.error by design; anything else is a real page error
  for (let i = errors.length - 1; i >= 0; i--) if (/test-boom/.test(errors[i])) errors.splice(i, 1);
  const n = o.npc, c = o.car, a = o.always;
  const pass = n.found && n.gone && n.logged && n.stage === '사람 하나' && n.t1 > n.t0 + 0.9
    && c.found && c.gone && c.logged && c.stage === '차량 하나' && c.t1 > c.t0 + 0.3
    && o.once.after1 === 1 && o.once.after2 === 0
    && a.threwAt === 90 && a.frames === 89 && a.n >= 90 && a.after === 0
    && o.log.size <= 20;
  result('error-resilience', pass, o);
});
