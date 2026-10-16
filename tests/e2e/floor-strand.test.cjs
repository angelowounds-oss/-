// gameplay: people who stand on a floor without belonging to it (a fleeing trip-taker, a corpse) must not hover when the floor is
// streamed out. Seen as citizens "floating in the sky" around the 1000 m tower, whose upper floors are built and dropped all the time.
const { run, freeze, result } = require('../lib.cjs');
run('floor-strand', { q: 0 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, B = g.buildings, pl = g.player; g.eng.render = () => {};
    const bd = B.list.filter((x) => x.lot.h > 60 && !x.lot.model && !x.lot.far).sort((a, b) => b.lot.h - a.lot.h)[0], d = bd.lot.door;
    pl.body3.teleport(d.px + d.nx * 3, 0, d.pz + d.nz * 3); pl.x = d.px + d.nx * 3; pl.z = d.pz + d.nz * 3;
    for (let i = 0; i < 900; i++) window.__upd(1 / 60);
    const k = [...bd.floors.keys()].filter((v) => v >= 2).sort((a, b) => a - b)[0], L = bd.levels[k], r = L.rect, o = { k, y: L.y };
    const H = g.humans[0].constructor, mk = (dead) => { const h = new H(g, 'civ', { hp: 50 }); h.x = (r.x0 + r.x1) / 2; h.z = (r.z0 + r.z1) / 2; h.y = h.floorY = L.y; h.state = 'flee'; h.dead = dead; g.humans.push(h); g.scene.add(h.group); return h; };
    const alive = mk(false), corpse = mk(true);
    bd.dropFloor(k);
    o.aliveY = +alive.y.toFixed(2); o.aliveFloorY = alive.floorY; o.corpseGone = !g.humans.includes(corpse); o.aliveKept = g.humans.includes(alive);
    return o;
  });
  result('floor-strand', o.aliveKept && o.aliveY === 0 && o.aliveFloorY === 0 && o.corpseGone && o.y > 3, o);
});
