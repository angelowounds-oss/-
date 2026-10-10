// gameplay (GPL-09): with a gun drawn the cashier can be robbed: a timed intimidation, then till money; a silent alarm raises the
// wanted heat a few seconds later even if the player has left; the same till cannot be robbed twice; without a gun nothing happens.
const { run, freeze, result } = require('../lib.cjs');
run('shop-robbery', { q: 0 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, B = g.buildings, pl = g.player; g.eng.render = () => {}; const out = {};
    let fl = null, bd = null;
    for (const b of B.list.filter((x) => x.lot.h > 40 && !x.lot.model && !x.lot.far).sort((a, c) => c.lot.h - a.lot.h).slice(0, 6)) {
      const d = b.lot.door; pl.body3.teleport(d.px + d.nx * 3, 0, d.pz + d.nz * 3); pl.x = d.px + d.nx * 3; pl.z = d.pz + d.nz * 3;
      for (let i = 0; i < 400 && !b.open; i++) window.__upd(1 / 60);
      const k = b.levels.findIndex((l) => l.type === 'retail'); if (k < 0) continue;
      b.ensureRange(k - 1, k + 1, true); for (let i = 0; i < 500; i++) window.__upd(1 / 60);
      const f = b.floors.get(k); if (f && f.shop && f.shop.cashier && !f.shop.cashier.weapon) { fl = f; bd = b; break; }
    }
    out.foundShop = !!fl; if (!fl) return out;
    const sh = fl.shop, h = sh.cashier, L = bd.levels[bd.levels.findIndex((l) => l.type === 'retail')];
    pl.body3.teleport(h.x, L.y, h.z + 1.6); pl.x = h.x; pl.y = L.y + 0.06; pl.z = h.z + 1.6; g.phys.world.step();
    // unarmed: the robbery verb is not offered
    pl.weaponDrawn = false; out.offeredUnarmed = g.life.canRob();
    // armed
    pl.armed = true; pl.weaponDrawn = true; out.offeredArmed = g.life.canRob();
    const cash0 = g.cash, heat0 = g.heat;
    g.life.robStore(fl); out.timedStarted = !!g.timed;
    for (let i = 0; i < 260; i++) { pl.weaponDrawn = true; window.__upd(1 / 60); }
    out.gained = g.cash - cash0; out.alarmPending = sh.alarmT > 0;
    // leave the shop; the alarm still fires
    pl.x += 30; for (let i = 0; i < 700; i++) { pl.weaponDrawn = false; window.__upd(1 / 60); }
    out.heatRaised = g.heat > heat0 || g.wanted > 0;
    // same till again
    pl.x -= 30; pl.weaponDrawn = true; const c1 = g.cash; g.life.robStore(fl); for (let i = 0; i < 260; i++) window.__upd(1 / 60); out.secondGain = g.cash - c1;
    return out;
  });
  const pass = o.foundShop && !o.offeredUnarmed && o.offeredArmed && o.timedStarted && o.gained >= 300 && o.gained <= 1500 && o.heatRaised && o.secondGain === 0;
  result('shop-robbery', pass, o);
});
