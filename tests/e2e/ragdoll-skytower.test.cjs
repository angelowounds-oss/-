// gameplay: no ragdolls are created within 60 m of the 1000 m tower (they would hang or fall from it); elsewhere they still are.
const { run, freeze, result } = require('../lib.cjs');
run('ragdoll-skytower', { q: 0 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, l = g.world.skyTower, pl = g.player; g.eng.render = () => {};
    const H = g.humans[0].constructor, mk = (x, z) => { const h = new H(g, 'civ', { hp: 50 }); h.x = x; h.z = z; h.y = 0; h.group.visible = true; g.humans.push(h); g.scene.add(h.group); return h; };
    const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2, o = {};
    pl.body3.teleport(l.x0 - 20, 0, cz); pl.x = l.x0 - 20; pl.z = cz; for (let i = 0; i < 60; i++) window.__upd(1 / 60);
    const near = mk(l.x0 - 12, cz); o.nearRag = !!g.ragdolls.spawn(near, { cause: 'test', alive: false });
    const far = mk(l.x0 - 12, cz); far.x = pl.x + 400; o.farUsable = g.ragdolls.nearSkyTower(far.x, far.z) === false;
    // the same civilian a long way from the tower and next to the camera does get one
    pl.body3.teleport(0, 0, 0); pl.x = 0; pl.z = 0; for (let i = 0; i < 60; i++) window.__upd(1 / 60);
    const ok = mk(4, 0); o.elsewhereRag = !!g.ragdolls.spawn(ok, { cause: 'test', alive: false });
    return o;
  });
  result('ragdoll-skytower', o.nearRag === false && o.farUsable && o.elsewhereRag === true, o);
});
