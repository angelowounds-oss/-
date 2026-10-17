// gameplay (ADR-0013): water outside the city. A river has a channel and a surface (waterAt says so, with a flow), the sea swallows a player who walks
// into it, diving takes him down while the breath runs out (and he drowns when it is gone), Space brings him up and the breath refills, a river current
// carries a swimmer along its flow, and the coast and the land beside the river are dry.
const { run, freeze, result } = require('../lib.cjs');
run('water', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, o = {}; g.eng.render = () => {};
    const step = (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); };
    const park = (x, y, z) => { pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; pl.hpv = 100; };
    const W = window.__waterfn, R = W.rivers.sort((a, b) => b.pts.length - a.pts.length)[0], m = R.pts[Math.floor(R.pts.length * 0.8)];
    // the river: waterAt answers on the centreline with a level and a flow, and not 300 m off
    const wa = g.waterAt(m[0], m[1]); o.river = !!wa && wa.kind === 'river' && wa.depth > 0.8 && Math.hypot(wa.fx, wa.fz) > 0.99; o.depth = wa && +wa.depth.toFixed(2);
    o.dryBank = !g.waterAt(m[0] + 300, m[1] + 300) || g.waterAt(m[0] + 300, m[1] + 300).kind !== 'river';
    // the player stands in it: the far ground holds him; deep enough he swims, the current moves him along the flow
    park(m[0], wa.y + 2, m[1]); step(120); o.swim = pl.swimming; const x0 = pl.x, z0 = pl.z; step(240); o.drift = +((pl.x - x0) * wa.fx + (pl.z - z0) * wa.fz).toFixed(1);
    // the sea: far out in the harbour approach; dive, breath, surface
    const c = g.citysites.cities.find((q) => q.c.type === 'port').c, sx = c.x + c.seaDir.x * c.r * 3.2, sz = c.z + c.seaDir.z * c.r * 3.2;
    const sea = g.waterAt(sx, sz); o.sea = !!sea && sea.kind === 'sea' && sea.depth > 3; if (!sea) return o;
    park(sx, sea.y + 1, sz); step(90); o.seaSwim = pl.swimming;
    const keys = g.input.keys; keys.add('KeyZ'); step(150); o.dive = +pl.dive.toFixed(2); const b0 = pl.breath; step(120); o.breathDrops = pl.breath < b0 - 1;
    keys.delete('KeyZ'); keys.add('Space'); step(240); o.surfaced = pl.dive < 0.2; keys.delete('Space'); step(240); o.breathBack = pl.breath > 40;
    // out of air: dive and hold until the breath is gone
    keys.add('KeyZ'); pl.breath = 1; step(400); keys.delete('KeyZ'); o.drowns = pl.hpv < 100 || pl.dead;
    return o;
  });
  const pass = o.river && o.dryBank && o.swim && o.drift > 3 && o.sea && o.seaSwim && o.dive > 1.5 && o.breathDrops && o.surfaced && o.breathBack && o.drowns;
  result('water', pass, o);
});
