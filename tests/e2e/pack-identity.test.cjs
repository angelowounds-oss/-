// render: distance packing of static instanced meshes (src/instcull.js) must not change a pixel in the city, where it is applied
// (street level, both directions, and at the city edges looking out at the hills). Packed vs all instances, same frame.
const { run, freeze, shot, pixelDiff, result } = require('../lib.cjs');
run('pack-identity', { q: 1, width: 480, height: 360 }, async ({ page }) => {
  await freeze(page);
  await page.evaluate(() => {
    const g = window.__game, items = []; g.scene.traverse((o) => { if (o.userData && o.userData.packed) items.push(o.userData.packed); });
    // the facade relief (relief.js) has its own, deliberately shorter reach (a visual detail, not a lossless cull): left out of this check
    for (const p of items.filter((q) => q.maxCut)) p.mesh.visible = false; items.splice(0, items.length, ...items.filter((q) => !q.maxCut)); window.__items = items;
    window.__setPack = (on) => {
      const cam = g.camera, fog = g.scene.fog;
      for (const pk of items) {
        const proto = Object.getPrototypeOf(pk);
        if (!on) { pk.pack = () => {}; for (const t of pk.attrs) { t.a.array.set(t.src); t.a.clearUpdateRanges(); t.a.needsUpdate = true; } pk.mesh.count = pk.n; pk.mesh.boundingSphere = null; }
        else { delete pk.pack; pk.shown = -1; pk.slot.fill(-1); const th = Math.tan(cam.fov * Math.PI / 360), tw = th * cam.aspect; proto.pack.call(pk, cam.position.x, cam.position.y, cam.position.z, 2.76 / fog.density * Math.sqrt(1 + th * th + tw * tw) + 40); }
      }
    };
    window.__go = (x, z, yaw) => { const pl = g.player, er = g.eng.render; g.eng.render = () => {}; if (x !== null) { pl.body3.teleport(x, 0, z); pl.x = x; pl.z = z; } if (yaw !== null) g.cam.yaw = yaw; g.cam.pitch = 0.06; for (let i = 0; i < 40; i++) window.__upd(1 / 60); g.eng.render = er; };
  });
  const metrics = {}; let pass = true, shown = 0, total = 0;
  for (const [label, x, z, yaw] of [['street', null, null, null], ['turned', null, null, 'turn'], ['edge-east-out', 395, 10, Math.PI / 2], ['edge-north-out', 15, 395, 0]]) {
    await page.evaluate(([x, z, yaw]) => { const g = window.__game; window.__go(x, z, yaw === 'turn' ? g.cam.yaw + 2.2 : yaw); g.renderFrame(0, true); window.__setPack(true); }, [x, z, yaw]);
    const A = await shot(page);
    const counts = await page.evaluate(() => [window.__items.reduce((s, p) => s + p.mesh.count, 0), window.__items.reduce((s, p) => s + p.n, 0)]);
    await page.evaluate(() => window.__setPack(false)); const B = await shot(page); await page.evaluate(() => window.__setPack(true));
    const d = pixelDiff(A, B); metrics[label] = d.diffBytes; if (d.diffBytes) pass = false; shown += counts[0]; total += counts[1];
  }
  result('pack-identity', pass, { diffBytes: metrics, instancesDrawnPct: Math.round(shown / total * 100) });
});
