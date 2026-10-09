// perf: sustained automatic fire next to NPCs. Gunshots put armed NPCs into investigate / search (path finding); the cost of the
// people update while firing and right after must stay small (it used to be ~4 ms per investigating NPC, and seconds per unreachable path).
const { run, freeze, result } = require('../lib.cjs');
run('gunfire-load', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, upd = window.__upd; g.eng.render = () => {};
    let uh = 0; const ouh = g.updateHumans.bind(g); g.updateHumans = (dt) => { const t = performance.now(); ouh(dt); uh += performance.now() - t; };
    let shots = 0; const ps = g.playerShoot.bind(g); g.playerShoot = (...a) => { shots++; return ps(...a); };
    pl.cur = 1; pl.owned[1] = true;
    for (let i = 0; i < 120; i++) upd(1 / 60);
    const phase = async (n, fire) => {
      uh = 0; const fr = [];
      for (let i = 0; i < n; i++) { g.input.fire = !!fire; if (fire) { pl.ammo[1].clip = 30; pl.reloadT = 0; } const t = performance.now(); upd(1 / 60); fr.push(performance.now() - t); if (i % 60 === 0) await new Promise((r) => setTimeout(r, 0)); }
      g.input.fire = false; fr.sort((a, b) => a - b);
      return { humansMsPerFrame: +(uh / n).toFixed(2), frameMedian: +fr[n >> 1].toFixed(1), frameP90: +fr[Math.floor(n * 0.9)].toFixed(1) };
    };
    const before = await phase(240, false); g.cam.pitch = -0.25;
    const firing = await phase(300, true);
    const after = await phase(300, false);
    return { shots, before, firing, after, investigating: g.humans.filter((h) => h.state === 'investigate').length };
  });
  result('gunfire-load', o.shots >= 30 && o.firing.humansMsPerFrame < 3 && o.after.humansMsPerFrame < 3 && o.firing.frameP90 < 12, o);
});
