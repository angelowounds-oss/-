// render: frustum culling (meshes, instanced floors, skinned bodies via Game.cullSkins) must not change a single pixel.
// Each view is drawn with culling on and with every object forced visible-to-the-renderer, and the two frames are compared byte for byte.
const { run, freeze, shot, pixelDiff, result } = require('../lib.cjs');
run('cull-identity', { q: 0, width: 480, height: 360 }, async ({ page }) => {
  await freeze(page);
  const setCull = (on) => page.evaluate((on) => {
    const g = window.__game; if (!g.__cs) g.__cs = g.cullSkins; g.cullSkins = on ? g.__cs : () => {};
    g.scene.traverse((o) => { if (o.__fc === undefined) o.__fc = o.frustumCulled; o.frustumCulled = on ? o.__fc : false; });
  }, on);
  const metrics = {}; let pass = true;
  const view = async (label) => {
    await page.evaluate(() => window.__game.renderFrame(0, true));
    await setCull(true); const A = await shot(page);
    await setCull(false); const B = await shot(page);
    await setCull(true);
    const d = pixelDiff(A, B); metrics[label] = d.diffBytes; if (d.diffBytes) pass = false;
  };
  await view('street');
  await page.evaluate(() => { const g = window.__game; g.cam.yaw += 2.2; window.__upd(1 / 60); });
  await view('street-turned');
  // inside a tower floor with furniture
  await page.evaluate(async () => {
    const g = window.__game, B = g.buildings, pl = g.player, er = g.eng.render; g.eng.render = () => {};
    const bd = B.list.filter((x) => x.lot.h > 40 && !x.lot.model && !x.lot.far)[0], d = bd.lot.door;
    pl.body3.teleport(d.px + d.nx * 3, 0, d.pz + d.nz * 3); pl.x = d.px + d.nx * 3; pl.z = d.pz + d.nz * 3;
    for (let i = 0; i < 600 && !bd.open; i++) window.__upd(1 / 60);
    const k = Math.min(3, bd.levels.length - 1); bd.ensureRange(k - 1, k + 1, true);
    const L = bd.levels[k], r = L.rect, x = (r.x0 + r.x1) / 2 + 2, z = (r.z0 + r.z1) / 2 + 5;
    pl.body3.teleport(x, L.y, z); pl.x = x; pl.y = L.y + 0.06; pl.z = z;
    for (let i = 0; i < 4; i++) window.__upd(1 / 60); g.eng.render = er;
  });
  await view('interior');
  await page.evaluate(() => { const g = window.__game; g.cam.yaw += 1.6; window.__upd(1 / 60); });
  await view('interior-turned');
  result('cull-identity', pass, { diffBytes: metrics });
});
