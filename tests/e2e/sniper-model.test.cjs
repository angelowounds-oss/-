// the supplied KSR-29 sniper rifle (assets/props/sniper_rifle.glb) is the sniper's look in the hand; the generic rifle shapes are hidden for it and the
// other long guns keep them.
const { run, freeze, result } = require('../lib.cjs');
run('sniper-model', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, o = {}; g.eng.render = () => {};
    const slots = [...Array(9).keys()], si = slots.find((i) => g.pw(i)?.look === 'sniper'), ci = slots.find((i) => g.pw(i) && g.pw(i).look !== 'sniper' && g.pw(i).short === 'rifle');
    o.si = si; o.ci = ci; if (si === undefined) return o;
    const vis = () => { const r = pl.m.rifle, m = r.getObjectByName('snipermodel'), gen = r.children.filter((c) => c.userData.gen); return { model: !!m && m.visible, gen: gen.every((c) => c.visible), n: gen.length }; };
    pl.setWeapon(si); o.sniper = vis(); let meshes = 0; pl.m.rifle.getObjectByName('snipermodel')?.traverse((q) => { if (q.isMesh) meshes++; }); o.meshes = meshes;
    if (ci !== undefined) { pl.setWeapon(ci); o.carbine = vis(); }
    pl.setWeapon(si); o.again = vis();
    return o;
  });
  result('sniper-model', !!(o.sniper && o.sniper.model && !o.sniper.gen && o.sniper.n >= 4 && o.meshes >= 2 && (!o.carbine || (!o.carbine.model && o.carbine.gen)) && o.again.model), o);
});
