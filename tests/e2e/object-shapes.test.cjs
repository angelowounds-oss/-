// Object shapes (EV-03): after walking and then driving, every car shares one hidden class and so does every person. Keys added after the
// constructor, in an order that differed from object to object, had given cars 12 shapes and people 30; the loops over them went megamorphic,
// were deoptimised over and over, and the deoptimised code boxed every number it wrote. A key that one system adds later belongs in the
// constructor's list (vehicle.js, human.js); this test names the first key where a stray shape parts from the common one.
const { run, freeze, result } = require('../lib.cjs');
const MAX = +(process.env.MAX_SHAPES || 1);
run('object-shapes', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const r = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, upd = window.__upd; g.eng.render = () => {}; g.sandbox.on = true; g.sandbox.god = true;
    let x = pl.x; const z = pl.z;
    for (let i = 0; i < 600; i++) { x += 7 / 60; pl.body3.teleport(x, pl.y, z); pl.x = x; upd(1 / 60); if (i % 50 === 49) await new Promise((f) => setTimeout(f, 0)); }
    const v = g.vehicles.filter((q) => !q.dead && !q.spec.craft).sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z))[0];
    pl.body3.teleport(v.x + 2.5, pl.y, v.z); pl.x = v.x + 2.5; pl.z = v.z; for (let i = 0; i < 5; i++) upd(1 / 60); g.enterVehicle(v);
    for (let i = 0; i < 600; i++) { g.input.keys.add('KeyW'); if (i % 240 < 20) g.input.keys.add('KeyD'); else g.input.keys.delete('KeyD'); upd(1 / 60); if (i % 50 === 49) await new Promise((f) => setTimeout(f, 0)); }
    g.input.keys.delete('KeyW'); g.input.keys.delete('KeyD');
    // the distinct own-key sequences (one per hidden class), the commonest first; for the others, the first key where they part from it
    const shapes = (list) => {
      const m = new Map(); for (const o of list) { const k = Object.keys(o).join(','); m.set(k, (m.get(k) || 0) + 1); }
      const all = [...m].sort((a, b) => b[1] - a[1]), base = all[0][0].split(',');
      return { n: list.length, kinds: all.length, keys: base.length, strays: all.slice(1, 8).map(([k, c]) => { const ks = k.split(','); let i = 0; while (i < ks.length && ks[i] === base[i]) i++; return { c, at: i, has: ks[i] ?? null, common: base[i] ?? null }; }) };
    };
    return { cars: shapes(g.vehicles), people: shapes(g.humans) };
  });
  const bad = [];
  if (r.cars.kinds > MAX) bad.push(`cars: ${r.cars.kinds} shapes`);
  if (r.people.kinds > MAX) bad.push(`people: ${r.people.kinds} shapes`);
  result('object-shapes', bad.length === 0, r, bad.join(' | '));
});
