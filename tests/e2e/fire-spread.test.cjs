// gameplay (GPL-08): fire spreads from an explosion / bottle to a nearby car (damage -> it burns, then it can explode), a fuel pool
// flares up when a flame reaches it, civilians nearby run from a new fire, a person standing in it takes damage and carries it on,
// fires burn out by themselves, and the whole system stays cheap (update < 1 ms/frame with a full set of fires).
const { run, freeze, result } = require('../lib.cjs');
run('fire-spread', { q: 0 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, pl = g.player, F = g.fire, H = g.humans[0].constructor, o = {}; g.eng.render = () => {}; g.wanted = 0;
    const upd = (s) => { for (let i = 0; i < s * 60; i++) window.__upd(1 / 60); };
    const clearNodes = () => { F.nodes.length = 0; F.pools.length = 0; };
    // --- a car next to a fire
    g.sandbox.spawnCar(); const car = g.vehicles[g.vehicles.length - 1];
    const cx = car.x, cz = car.z, hp0 = car.hp;
    F.ignite(cx + 2.2, cz, { fuel: 40, r: 1.8, src: pl });
    upd(14); o.carHpLoss = Math.round(hp0 - car.hp); o.carBurning = car.burn > 0.2 || car.dead; o.carNode = !!car.fireNode || car.dead;
    clearNodes();
    // --- fuel pool + flame
    const px = pl.x + 20, pz = pl.z + 20; F.pour(px, pz, pl); o.poolsBefore = F.pools.length; const n0 = F.nodes.length;
    F.ignite(px + 2.5, pz, { fuel: 6, r: 1.2, src: pl }); upd(1); o.poolConsumed = F.pools.length === 0; o.poolNode = F.nodes.some((n) => Math.hypot(n.x - px, n.z - pz) < 0.5 && n.r > 2);
    clearNodes();
    // --- civilians flee, a person standing in the fire takes damage and burns on
    const civ = () => { const c = new H(g, 'civ', { hp: 60 }); g.humans.push(c); g.scene.add(c.group); c.static = false; c.state = 'walk'; c.node = null; c.y = pl.y; c.floorY = pl.y; return c; };
    const a = civ(), b = civ(); a.x = pl.x - 20; a.z = pl.z - 20; b.x = pl.x - 30; b.z = pl.z - 20;
    const fn = F.ignite(a.x + 0.4, a.z, { fuel: 12, r: 1.4 }); F.alert(fn); o.nearbyFled = b.state === 'flee';
    // a person caught in the flames (spread() is what the fire runs every 0.6 s)
    o.victimHp = a.hp; F.spread(fn); F.spread(fn); o.victimBurn = a.burnT > 0; o.victimHpLater = a.hp; a.x += 6; F.spread(fn); o.carriesFire = F.nodes.some((n) => n.kind === 'human');
    clearNodes();
    // --- crime: arson by the player is logged
    const ev = g.memory.st.events.length; F.ignite(pl.x + 40, pl.z - 40, { fuel: 5, r: 1, src: pl }); o.arsonLogged = g.memory.st.events.slice(ev).some((e) => e.type === 'arson');
    clearNodes();
    // --- burn out
    F.ignite(pl.x - 60, pl.z + 60, { fuel: 8, r: 1.4 }); upd(12); o.burnedOut = F.nodes.length === 0;
    // --- cost: 24 fires
    for (let i = 0; i < 24; i++) F.ignite(pl.x + 5 + i * 3, pl.z + 8, { fuel: 999, r: 2 });
    const t0 = performance.now(); for (let i = 0; i < 300; i++) { F.update(1 / 60); } o.msPerFrame = +((performance.now() - t0) / 300).toFixed(3); o.nodes = F.nodes.length;
    return o;
  });
  const pass = o.carHpLoss > 20 && o.carBurning && o.poolConsumed && o.poolNode && o.nearbyFled && o.victimHpLater < o.victimHp && o.victimBurn && o.carriesFire && o.arsonLogged && o.burnedOut && o.msPerFrame < 1;
  result('fire-spread', pass, o);
});
