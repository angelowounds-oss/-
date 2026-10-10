// gameplay: a breaching charge opens any wall of a tower floor - outer walls on three sides and the core (stairs / lift block); the way
// through an outer-wall hole is free afterwards (a physics ray through it is not blocked).
const { run, freeze, result } = require('../lib.cjs');
run('breach', { q: 0 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, B = g.buildings, pl = g.player; g.eng.render = () => {};
    const bd = B.list.filter((x) => x.lot.h > 60 && !x.lot.model && !x.lot.far).sort((a, b) => b.lot.h - a.lot.h)[0], d = bd.lot.door;
    pl.body3.teleport(d.px + d.nx * 3, 0, d.pz + d.nz * 3); pl.x = d.px + d.nx * 3; pl.z = d.pz + d.nz * 3;
    for (let i = 0; i < 600 && !bd.open; i++) window.__upd(1 / 60);
    const k = bd.levels.findIndex((l) => l.tier === 'tower'); bd.ensureRange(k - 1, k + 1, true); for (let i = 0; i < 400; i++) window.__upd(1 / 60);
    const fl = bd.floors.get(k), L = bd.levels[k], r = L.rect, o = {};
    // the interior layout decides what stands in front of a wall (furniture, windows): probe several spots along the wall, take the first that finds it
    const tryWall = (px, pz, yaw) => {
      const along = Math.abs(Math.sin(yaw)) > 0.5 ? [0, 1] : [1, 0];   // wall runs along z for east/west looks, along x for north/south
      let last = null;
      for (const off of [0, 2, -2, 4, -4, 6, -6, 8, -8, 10, -10]) { last = tryWall1(px + along[0] * off, pz + along[1] * off, yaw); if (last.found) return last; }
      return last;
    };
    const tryWall1 = (px, pz, yaw) => {
      pl.body3.teleport(px, L.y, pz); pl.x = px; pl.y = L.y + 0.06; pl.z = pz; pl.vx = pl.vz = 0; g.cam.yaw = yaw; g.phys.world.step();
      const wa = g.breach.wallAhead(pl); if (!wa) return { found: false };
      const nh = g.breach.holes.length; g.items.add('breach'); g.breach.plant(wa);
      for (let i = 0; i < 200; i++) g.breach.update(1 / 60);
      g.phys.world.step();
      const hit = g.phys.ray(px, L.y + 1.1, pz, Math.sin(yaw), 0, Math.cos(yaw), 4, 1);
      return { found: true, tag: wa.box.tag, holeAdded: g.breach.holes.length - nh, blocked: hit ? +hit.t.toFixed(2) : null };
    };
    o.outerWest = tryWall(r.x0 + 1.6, (r.z0 + r.z1) / 2 + 3, -Math.PI / 2);
    o.outerNorth = tryWall((r.x0 + r.x1) / 2 + 4, r.z0 + 1.6, Math.PI);
    o.outerEast = tryWall(r.x1 - 1.6, (r.z0 + r.z1) / 2 - 3, Math.PI / 2);
    const c = bd.core; if (c) { o.coreSouth = tryWall(c.x0 + 3, c.z0 + 6.5, Math.PI); o.coreEast = tryWall(c.x0 - 1.5, c.z0 + 3, Math.PI / 2); }
    return o;
  });
  // outer walls: hole and a free way through. Core walls (stairs / lift block): the hole must open, but the core behind it is not empty
  // space (stairs, cab), so the ray is not required to pass; at least one of the two probe spots must find a core wall.
  const outer = [o.outerWest, o.outerNorth, o.outerEast], core = [o.coreSouth, o.coreEast].filter((w) => w && w.found);
  const pass = outer.every((w) => w.found && w.holeAdded >= 1 && w.blocked === null) && core.length >= 1 && core.every((w) => w.holeAdded >= 1);
  result('breach', pass, o);
});
