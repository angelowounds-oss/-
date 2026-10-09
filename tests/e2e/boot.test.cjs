// smoke: the bundle loads, the game starts without page errors, a frame is drawn with real content, and the counts are in the usual range
const { run, freeze, shot, result } = require('../lib.cjs');
run('boot', { q: 1 }, async ({ page, errors }) => {
  await freeze(page);
  const info = await page.evaluate(() => {
    const g = window.__game, R = g.eng.renderer, t0 = performance.now();
    for (let i = 0; i < 10; i++) window.__upd(1 / 60);
    const ms = (performance.now() - t0) / 10;
    R.info.autoReset = false; R.info.reset(); g.renderFrame(0, true); const calls = R.info.render.calls, tris = R.info.render.triangles; R.info.autoReset = true;
    return { programs: R.info.programs.length, calls, tris, humans: g.humans.length, vehicles: g.vehicles.length, buildingsOpen: g.buildings.active.size, updateMs: +ms.toFixed(1) };
  });
  const px = await shot(page);
  let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 30) lit++;
  info.litPct = Math.round(lit / (px.length / 4) * 100);
  result('boot', errors.length === 0 && info.litPct > 40 && info.programs > 20 && info.humans > 10 && info.vehicles > 10, info);
});
