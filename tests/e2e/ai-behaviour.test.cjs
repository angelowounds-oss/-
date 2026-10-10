// gameplay: NPC brains (src/ai.js). A gang member facing away does not notice the player, investigates a gunshot and walks toward it;
// one facing the player and hurt goes for cover (or fights); a fleeing civilian spreads fear to a neighbour.
const { run, freeze, result } = require('../lib.cjs');
run('ai-behaviour', { q: 0 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, pl = g.player, H = g.humans[0].constructor, o = {};
    const mk = (team, x, z, ry, w = 1) => { const h = new H(g, team, { hp: 75, weapon: w }); h.x = x; h.z = z; h.y = pl.y; h.floorY = pl.y; h.ry = ry; h.home = { x, z }; h.patrol = false; h.state = 'idle'; h.detect = 40; g.humans.push(h); g.scene.add(h.group); return h; };
    const step = (h, n) => { for (let i = 0; i < n; i++) h.update(1 / 30); };
    g.wanted = 0;
    const h = mk('gang', pl.x + 18, pl.z, Math.PI / 2);
    step(h, 60); o.unseenBehind = h.state;
    const d0 = Math.hypot(h.x - pl.x, h.z - pl.z);
    // the route to the noise is found by A* and the walk can be blocked by whatever random traffic stands there: fresh members at four spots
    o.afterNoise = null; o.movedToward = 0; o.tries = 0;
    for (const [dx, dz] of [[0, 0], [0, 18], [-18, 0], [0, -18], [18, 18]]) {
      const m = dx === 0 && dz === 0 ? h : mk('gang', pl.x + dx, pl.z + dz, Math.PI / 2); if (m !== h) { step(m, 60); m.ry = Math.atan2(-dx, -dz) + Math.PI; }
      const dd0 = Math.hypot(m.x - pl.x, m.z - pl.z); o.tries++;
      g.noise(pl.x, pl.z, 60, 'shot'); if (o.afterNoise === null) o.afterNoise = m.state; step(m, 150);
      o.movedToward = +(dd0 - Math.hypot(m.x - pl.x, m.z - pl.z)).toFixed(1); if (o.movedToward > 0.5) break;
    }
    const h2 = mk('gang', pl.x - 15, pl.z + 0.1, -Math.PI / 2); h2.ry = Math.atan2(pl.x - h2.x, pl.z - h2.z);
    step(h2, 40); o.facing = h2.state;
    h2.hurt(10, { x: pl.x, z: pl.z }, false, pl); step(h2, 5); o.afterHurt = h2.state;
    // civilians made directly (spawnCivilian picks a random sidewalk spot and can find none)
    const civ = () => { const c = new H(g, 'civ', { hp: 40 }); g.humans.push(c); g.scene.add(c.group); c.static = false; c.state = 'walk'; c.node = null; return c; };
    const c1 = civ(), c2 = civ();
    c1.x = pl.x + 10; c1.z = pl.z + 10; c2.x = pl.x + 14; c2.z = pl.z + 10; c1.y = c2.y = pl.y; c1.floorY = c2.floorY = pl.y;
    c1.state = 'flee'; c1.fleeT = 6; c1.threat = { x: pl.x, z: pl.z };
    for (let i = 0; i < 30; i++) { c1.update(1 / 30); c2.update(1 / 30); } o.contagion = c2.state;
    return o;
  });
  const pass = o.unseenBehind === 'idle' && o.afterNoise === 'investigate' && o.movedToward > 0.5 && ['attack', 'cover', 'retreat'].includes(o.afterHurt) && o.contagion === 'flee';
  result('ai-behaviour', pass, o);
});
