// gameplay (ADR-0013): the landmark towers (assets/landmarks) stand in reserved city blocks. One is built when the player comes near, has a collider box,
// comes down in a few seconds when blown up (collider gone at once, ruin remembered in state.places), and is dropped when he leaves.
const { run, freeze, result } = require('../lib.cjs');
run('landmarks', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, M = g.landmarks, o = {}; g.eng.render = () => {}; g.hurtPlayer = () => {};
    if (!M) return { has: false };
    const L = M.list[0]; o.count = M.list.length;
    const park = (x, z) => { pl.body3.teleport(x, 3, z); pl.x = x; pl.y = 3; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
    const run = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 10 === 0) await new Promise((r) => setTimeout(r, 4)); } };
    park(L.x + L.w / 2 + 40, L.z); await run(240);
    o.has = true; o.built = L.built; o.box = !!L.cb; o.kids = L.group ? L.group.children.length : 0;
    g.explosion(L.x, 2, L.z, 60, 2500, null); await run(10);
    o.falling = !L.alive && L.anim !== undefined && !L.cb && L.group.scale.y < 1 && g.state.places.ruins[L.key] != null;
    await run(600); o.ruin = L.anim === undefined && L.group.scale.y < 0.1;
    park(0, 0); await run(60); o.dropped = !L.built;
    g.clock.t += 3000; park(L.x + L.w / 2 + 40, L.z); await run(240); o.rebuilt = L.built && L.alive && L.group.scale.y === 1;
    return o;
  });
  result('landmarks', !!(o.has && o.count >= 5 && o.built && o.box && o.kids >= 2 && o.falling && o.ruin && o.dropped && o.rebuilt), o);
});
