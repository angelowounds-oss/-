// render/stutter: every shader program is compiled during loading (Game.prewarmShaders); nothing seen in play may compile a new one
// (a compile is a 50-500 ms freeze on many GPUs). Walk with a turning camera, then trigger every event that brings new materials or
// changes the light set: explosion, ragdolls, five stars, flashlight, night / rain / day, shooting, grenade, breach, driving, player
// ragdoll, water, sandbox spawns, lobby, an upper floor and the roof.
const { run, freeze, result } = require('../lib.cjs');
run('no-runtime-compile', { q: 1, width: 320, height: 200 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, R = g.eng.renderer, er = g.eng.render.bind(g.eng), upd = window.__upd;
    const progs = () => R.info.programs || [], seen = new Set(progs().map((x) => x.cacheKey)), start = progs().length, log = [];
    const note = (what) => { for (const pr of progs()) if (!seen.has(pr.cacheKey)) { seen.add(pr.cacheKey); log.push(what); } };
    // the undrawn updates give the event loop a turn every other one too (memory the renderer frees only between tasks grew in await runN(200) until it was killed)
    const runN = async (n) => { g.eng.render = () => {}; for (let k = 0; k < n; k++) { upd(1 / 60); if (k % 2) await new Promise((r) => setTimeout(r, 4)); } g.eng.render = er; };
    let x = pl.x, z = pl.z, dir = 0; const wp = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    for (let i = 0; i < 900; i++) {
      if (i % 300 === 0) dir = (dir + 1) % 4; x += wp[dir][0] * 7 / 60; z += wp[dir][1] * 7 / 60; pl.body3.teleport(x, pl.y, z); pl.x = x; pl.z = z; g.cam.yaw += 0.02;
      g.eng.render = i % 12 === 0 ? er : () => {}; upd(1 / 60); if (i % 12 === 0) note('walk');
      // after a drawn frame the page gives the event loop a turn (and collects): a software-GPU frame takes seconds, and a page that never yields grew
      // by gigabytes until the container killed it (docs/TESTING.md, memory)
      if (i % 12 === 0) { if (window.gc) window.gc(); await new Promise((r) => setTimeout(r, 20)); }
    }
    g.eng.render = er;
    // each event: three drawn frames, the event loop given a turn after each (see the walk above)
    const ev = async (name, fn) => { try { await fn(); } catch (e) { log.push(name + ' threw ' + e.message); } for (let k = 0; k < 3; k++) { upd(1 / 60); if (window.gc) window.gc(); await new Promise((r) => setTimeout(r, 20)); } note(name); };
    await ev('explosion', async () => g.explosion(pl.x + 6, 1, pl.z + 6, 6, 40, null));
    await ev('ragdolls', async () => { for (const h of g.humans.slice(0, 6)) if (!h.dead) h.ragdoll(3, 3, 3); });
    await ev('wanted 5', async () => { g.wanted = 5; g.heat = 200; await runN(200); });
    await ev('flashlight', async () => { g.items.add('flashlight'); g.flashlightOn = true; });
    await ev('night', async () => { g.clock.t = 23 * 60; await runN(30); });
    await ev('rain', async () => { g.state.weather = { type: 'rain', until: g.clock.t + 600 }; await runN(60); });
    await ev('day', async () => { g.clock.t = 13 * 60; await runN(30); });
    await ev('shoot', async () => { g.switchWeapon(0); for (let k = 0; k < 5; k++) { pl.fireCd = 0; pl.reloadT = 0; try { g.playerShoot(g.pw(0), pl.ammo[0]); } catch (e) { /* weapon state */ } } });
    await ev('grenade', async () => { g.items.add('grenade', 3); g.throwGrenade(); await runN(200); });
    await ev('breach', async () => { const b0 = [...g.buildings.active].find((b) => b.floors.has(0)); if (b0) { const d = b0.door; pl.body3.teleport(d.px - d.nx * 3, 0.06, d.pz - d.nz * 3); pl.x = d.px - d.nx * 3; pl.z = d.pz - d.nz * 3; await runN(5); g.items.add('breach'); const w = g.breach.wallAhead(pl); if (w) { g.breach.plant(w); await runN(240); } } });
    await ev('drive', async () => { const v = g.vehicles.filter((q) => !q.dead && !q.spec.craft).sort((a, c) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(c.x - pl.x, c.z - pl.z))[0]; if (v) { pl.body3.teleport(v.x + 2.5, 0.06, v.z); pl.x = v.x + 2.5; pl.z = v.z; await runN(3); g.enterVehicle(v); for (let k = 0; k < 120; k++) { g.input.keys.add('KeyW'); g.eng.render = k % 20 ? () => {} : er; upd(1 / 60); } g.input.keys.delete('KeyW'); g.eng.render = er; g.exitVehicle(); await runN(60); } });
    await ev('player ragdoll', async () => { g.ragdolls.spawn(pl, { cause: 'bail', alive: true, vel: { x: 4, y: 2, z: 0 } }); await runN(120); });
    await ev('water', async () => { const w = g.world.waters && g.world.waters[0]; if (w) { const wx = (w.x0 + w.x1) / 2, wz = (w.z0 + w.z1) / 2; pl.body3.teleport(wx, 0.5, wz); pl.x = wx; pl.z = wz; await runN(90); } });
    await ev('sandbox spawns', async () => { g.sandbox.spawnCar(); g.sandbox.spawnPeople(4); await runN(20); });
    const bd = [...g.buildings.active].find((b) => b.floors.has(0));
    if (bd) {
      await ev('lobby', async () => { const d = bd.door; pl.body3.teleport(d.px - d.nx * 4, 0.06, d.pz - d.nz * 4); pl.x = d.px - d.nx * 4; pl.z = d.pz - d.nz * 4; await runN(30); });
      await ev('upper floor', async () => { const k = Math.min(bd.levels.length - 2, 6); bd.ensureRange(k - 1, k + 1, true); const L = bd.levels[k], r = L.rect, ux = (r.x0 + r.x1) / 2 + 2, uz = (r.z0 + r.z1) / 2 + 4; pl.body3.teleport(ux, L.y + 0.06, uz); pl.x = ux; pl.y = L.y + 0.06; pl.z = uz; await runN(60); });
      await ev('roof', async () => { const k = bd.levels.length - 1; bd.ensureRange(k - 1, k, true); const L = bd.levels[k], r = L.rect, ux = (r.x0 + r.x1) / 2, uz = (r.z0 + r.z1) / 2; pl.body3.teleport(ux, L.y + 0.06, uz); pl.x = ux; pl.y = L.y + 0.06; pl.z = uz; await runN(60); });
    }
    return { programsAtStart: start, newDuringPlay: log.length, where: log.slice(0, 10) };
  });
  result('no-runtime-compile', o.newDuringPlay === 0, o);
});
