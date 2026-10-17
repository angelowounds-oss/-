// gameplay (ADR-0013): the small things of a city (lane marks, furniture, roof clutter) arrive as baked chunks while the player stands in a city, are
// built one tile per frame, are shown only near him, and go again when he leaves; the chunk store holds them.
const { run, freeze, result } = require('../lib.cjs');
run('citydetail', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, S = g.citysites, o = {}; g.eng.render = () => {};
    const C = S.cities.find((c) => c.c.id === 'mid1'), c = C.c, park = (x, z) => { pl.body3.teleport(x, 1, z); pl.x = x; pl.z = z; pl.y = 1; pl.vx = pl.vz = 0; };
    const run = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 10 === 0) await new Promise((r) => setTimeout(r, 5)); } };
    o.chunks = globalThis.__WORLD ? globalThis.__WORLD.keys('city/').length : 0;
    park(c.x + 60, c.z + 60); await run(300);
    const tiles = [...C.tiles.values()], built = tiles.filter((t) => t.det && t.det.length), shown = built.filter((t) => t.det.some((m) => m.visible));
    o.built = built.length; o.shown = shown.length; o.tris = Math.round(S.stats.detTris || 0);
    const t0 = performance.now(); await run(120); o.frameMs = +((performance.now() - t0) / 120).toFixed(2);
    // away: the chunks of far tiles are dropped, nothing is left shown
    park(0, 0); await run(300); o.left = tiles.filter((t) => t.det && t.det.some((m) => m.visible)).length; o.kept = tiles.filter((t) => t.det && t.det.length).length;
    return o;
  });
  result('citydetail', o.chunks > 300 && o.built > 20 && o.shown > 4 && o.shown < o.built && o.tris < 900000 && o.left === 0 && o.kept === 0, o);
});
