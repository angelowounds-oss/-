// gameplay: five stars bring attack helicopters and a tank (src/military.js); both take damage from explosions, the helicopter from
// gunfire when there is a line of sight, and both leave when the wanted level is cleared.
const { run, freeze, result } = require('../lib.cjs');
run('military', { q: 0 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, pl = g.player, M = g.military, o = {};
    g.sandbox.on = false; g.wanted = 5; g.heat = 200;
    const run = (n) => { for (let i = 0; i < n; i++) { g.time += 1 / 30; M.update(1 / 30); } };
    run(30); o.afterSpawn = { heli: M.heli.length, tank: M.tank.length };
    run(450); o.afterWait = { heli: M.heli.length, tank: M.tank.length };
    const h = M.heli[0];
    if (h) { const hp0 = h.hp; g.explosion(h.x, h.y, h.z, 8, 200, pl); o.heliBlastDamage = +(hp0 - h.hp).toFixed(0); }
    const t = M.tank[0];
    if (t) { const d0 = Math.hypot(t.x - pl.x, t.z - pl.z); run(600); o.tankApproach = +(d0 - Math.hypot(t.x - pl.x, t.z - pl.z)).toFixed(0); const hp = t.hp; g.explosion(t.x, 1, t.z, 8, 250, pl); o.tankBlastDamage = +(hp - t.hp).toFixed(0); }
    g.wanted = 0; g.clearWanted(); run(60); o.leaving = [...M.heli, ...M.tank].every((e) => e.leaving || e.dead);
    return o;
  });
  const pass = o.afterSpawn.heli >= 1 && o.afterSpawn.tank >= 1 && o.heliBlastDamage > 0 && o.tankBlastDamage > 0 && o.leaving;
  result('military', pass, o);
});
