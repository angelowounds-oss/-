// gameplay (GPL-08c): a building set alight at street level burns upwards band by band (flames in the facade shader's aBurn), interior fires
// appear on its open floors, its structure fails and it collapses: facade instances sink, people under it die, the tall collider is replaced
// by a low rubble box, signs / roof props on it are hidden, the building never opens again, the ruin is saved; rebuilding restores it all.
const { run, freeze, result } = require('../lib.cjs');
run('building-fire', { q: 0 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, pl = g.player, B = g.blaze, o = {}; const R0 = g.eng.render; g.eng.render = () => {};
    const draw = () => { g.eng.render = R0; g.renderFrame(0, true); g.eng.render = () => {}; };
    const upd = (s) => { for (let i = 0; i < s * 60; i++) window.__upd(1 / 60); };
    // an enterable building with a crown or at least a tall tower, near the player: open it so it has floors
    const bd = g.buildings.list.filter((b) => !b.lot.far && !b.lot.model && b.lot.h > 40).sort((a, b) => Math.hypot(a.cx - pl.x, a.cz - pl.z) - Math.hypot(b.cx - pl.x, b.cz - pl.z))[0];
    const lot = bd.lot, d = lot.door; o.building = bd.name; o.h = Math.round(lot.h);
    pl.body3.teleport(d.px + d.nx * 3, 0, d.pz + d.nz * 3); pl.x = d.px + d.nx * 3; pl.z = d.pz + d.nz * 3;
    for (let i = 0; i < 600 && !bd.open; i++) window.__upd(1 / 60);
    o.openBefore = bd.open;
    // ignition by fire against the wall (a molotov-sized fire at the facade)
    const fx = d.px + d.nx * 0.6, fz = d.pz + d.nz * 0.6;
    for (let k = 0; k < 3; k++) g.fire.ignite(fx + k * 1.5 - 1.5, fz, { fuel: 30, r: 1.4, src: pl });
    upd(10);
    const s = B.fires.get(lot); o.ignited = !!s && s.heat[0] >= 0.35;
    // a civilian next to it
    const H = g.humans[0].constructor, c = new H(g, 'civ', { hp: 40 }); g.humans.push(c); g.scene.add(c.group); c.x = (lot.x0 + lot.x1) / 2; c.z = (lot.z0 + lot.z1) / 2; c.y = c.floorY = 0; c.static = true; c.state = 'stand';
    // the fire climbs: after 40 s several bands burn and the facade attribute shows it
    pl.body3.teleport(d.px + d.nx * 20, 0, d.pz + d.nz * 20); pl.x = d.px + d.nx * 20; pl.z = d.pz + d.nz * 20;
    upd(40);
    const a = B.burn.array, ti = lot.tierIdx; o.bandsBurning = s ? Array.from(s.heat).filter((h) => h >= 0.35).length : 0; o.aBurn = [a[ti * 4], a[ti * 4 + 1], +a[ti * 4 + 2].toFixed(2)].map((v) => +(+v).toFixed(1));
    o.interiorFires = g.fire.nodes.filter((n) => n.kind === 'ground' && n.x > lot.x0 && n.x < lot.x1 && n.z > lot.z0 && n.z < lot.z1 && n.y > 1).length;
    o.integMid = s ? +s.integ.toFixed(2) : null;
    // fast-forward the fire itself (the simulation, not the whole game) until it comes down
    let t = 0; while (s && s.phase === 'burn' && t < 3000) { B.sim(s, 0.5); t += 0.5; }
    // shader programs: one real frame before and one in the middle of the collapse (nothing may compile during play, ADR-0002)
    draw(); o.prog0 = g.eng.renderer.info.programs.length;
    o.secondsToCollapse = Math.round(t + 50); o.phase = s && s.phase;
    const solidH0 = lot.solid ? lot.solid.h : null;
    upd(3); draw(); o.prog1 = g.eng.renderer.info.programs.length;   // mid-collapse
    upd(7);   // the rest of the collapse animation (8 s)
    o.ruin = B.ruins.has(lot); o.civDead = c.dead; o.solidH = lot.solid ? +lot.solid.h.toFixed(1) : null; o.solidBefore = solidH0;
    const m = g.world.facade.instanceMatrix.array; o.towerScale = +Math.hypot(m[(ti + 1) * 16 + 4], m[(ti + 1) * 16 + 5], m[(ti + 1) * 16 + 6]).toFixed(3);
    o.decorHidden = B.ruins.get(lot)?.decor.inst.length || 0;
    o.saved = g.state.ruins[g.world.lots.indexOf(lot)] != null;
    // never opens again, even with the player at the door
    pl.body3.teleport(d.px + d.nx * 3, 0, d.pz + d.nz * 3); pl.x = d.px + d.nx * 3; pl.z = d.pz + d.nz * 3; upd(2); o.openAfter = bd.open;
    // rebuild
    B.rebuild(lot); o.rebuiltSolidH = lot.solid ? Math.round(lot.solid.h) : null; o.towerScaleAfter = +Math.hypot(m[(ti + 1) * 16 + 4], m[(ti + 1) * 16 + 5], m[(ti + 1) * 16 + 6]).toFixed(1); o.savedAfter = g.state.ruins[g.world.lots.indexOf(lot)] != null;
    // cost: 6 buildings burning at once
    const six = B.lots.filter((l) => !B.ruins.has(l)).slice(0, 6); for (const l of six) B.igniteLot(l, null); for (const l of six) { const q = B.fires.get(l); for (let i = 0; i < 40; i++) B.sim(q, 0.5); }
    const t0 = performance.now(); for (let i = 0; i < 300; i++) B.update(1 / 60); o.ms6 = +((performance.now() - t0) / 300).toFixed(3);
    return o;
  });
  // persistence: a ruin is saved with the game and comes back as a ruin after a reload (applied at start-up, no animation)
  const idx = await page.evaluate(() => {
    const g = window.__game, B = g.blaze, pl = g.player; g.eng.render = () => {};
    const lot = B.lots.filter((l) => !B.ruins.has(l) && !B.fires.has(l) && l.h > 30)[3]; B.collapseNow(lot, null);
    for (let i = 0; i < 600; i++) window.__upd(1 / 60);
    g.save(); return g.world.lots.indexOf(lot);
  });
  await page.reload();
  await page.waitForSelector('#go.rdy', { timeout: 240000 }); await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => window.__game && window.__game.running, null, { timeout: 30000 });
  Object.assign(o, await page.evaluate((idx) => {
    const g = window.__game, B = g.blaze, lot = g.world.lots[idx], m = g.world.facade.instanceMatrix.array, ti = lot.tierIdx;
    const r = { reloadRuin: B.ruins.has(lot), reloadSolidH: lot.solid ? +lot.solid.h.toFixed(1) : null, reloadTower: +Math.hypot(m[(ti + 1) * 16 + 4], m[(ti + 1) * 16 + 5], m[(ti + 1) * 16 + 6]).toFixed(3) };
    B.rebuildAll(); g.save(); return r;
  }, idx));
  const pass = o.reloadRuin && o.reloadSolidH < 8 && o.reloadTower < 0.01 && o.openBefore && o.ignited && o.bandsBurning >= 3 && o.aBurn[2] > 0 && o.phase === 'collapse' && o.ruin && o.civDead && o.solidH < 8 && o.towerScale < 0.01 && o.saved && !o.openAfter && o.rebuiltSolidH > 30 && o.towerScaleAfter > 1 && !o.savedAfter && o.ms6 < 2 && o.prog1 === o.prog0;
  result('building-fire', pass, o);
});
