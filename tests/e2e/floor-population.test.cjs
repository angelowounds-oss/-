// gameplay: standing at the door of the tallest tower builds its lower floors in the background (generator steps): within 15 s the
// lobby and the floors above exist with colliders, furniture meshes and their staff / residents.
const { run, freeze, result } = require('../lib.cjs');
run('floor-population', { q: 0 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, B = g.buildings, pl = g.player; g.eng.render = () => {};
    const bd = B.list.filter((x) => x.lot.h > 60 && !x.lot.model && !x.lot.far).sort((a, b) => b.lot.h - a.lot.h)[0], d = bd.lot.door;
    pl.body3.teleport(d.px + d.nx * 3, 0, d.pz + d.nz * 3); pl.x = d.px + d.nx * 3; pl.z = d.pz + d.nz * 3;
    for (let i = 0; i < 900; i++) window.__upd(1 / 60);
    const floors = [...bd.floors].map(([k, fl]) => ({ k, npcs: fl.npcs ? fl.npcs.length : 0, citizens: fl.citizens ? fl.citizens.length : 0, boxes: fl.boxes.length, meshes: fl.group.children.length }));
    return { building: bd.name, floors, pending: bd.pending.length, job: !!bd.job };
  });
  const npcs = o.floors.reduce((s, f) => s + f.npcs + f.citizens, 0);
  const pass = o.floors.length >= 3 && o.floors.some((f) => f.k === 0) && o.floors.every((f) => f.boxes > 100 && f.meshes >= 3) && npcs >= 1;
  result('floor-population', pass, o);
});
