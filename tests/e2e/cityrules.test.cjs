// gameplay (ADR-0012 phase 5c): what differs from city to city. Local time/weather/light follow the place, the wanted level stays with the city it was
// earned in (and is found again on return), facility staff stand at the airport and in the docks, a long-distance courier job pays by distance, cities
// the player is not in have incidents that reach the news, and a ruin older than the rebuild time is a building again when the tile comes back.
const { run, freeze, result } = require('../lib.cjs');
run('cityrules', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, R = g.rules, pl = g.player, S = g.citysites, o = {}; g.hurtPlayer = () => {}; g.eng.render = () => {};
    const step = (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); };
    const park = (x, z) => { pl.body3.teleport(x, 1, z); pl.x = x; pl.y = 1; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
    o.has = !!R; if (!R) return o;
    const C = (id) => S.cities.find((q) => q.c.id === id), c = (id) => C(id).c;
    // local conditions
    park(c('mid2').x, c('mid2').z); step(60); const dry = { ...R.local }; park(c('harbor').x, c('harbor').z); step(60); const wetter = { ...R.local }; park(0, 0); step(60); const home = { ...R.local };
    o.cond = { dryWet: +dry.wet.toFixed(2), harborWet: +wetter.wet.toFixed(2), homeWet: +home.wet.toFixed(2), harborTint: wetter.tint.map((v) => +v.toFixed(2)), hourE: +dry.hourOffset.toFixed(2) };
    // jurisdiction: heat earned in the capital stays there
    park(0, 0); step(30); g.addHeat(90); step(5); const w0 = g.wanted; park(c('harbor').x, c('harbor').z + 30); step(90); o.heat = { before: w0, atHarbor: g.wanted, saved: Math.round(R.st.neon.heat) };
    park(0, 0); step(120); o.heat.back = g.wanted; g.clearWanted();
    // facility staff
    const air = C('airfield'), ar = air.c; park(ar.x, ar.z + ar.r * 0.28 - 330); step(90); o.airGuards = g.humans.filter((h) => h.facility === 'airfield').length;
    const hb = C('harbor'); const fp = R.facilityPoints(hb)[0]; park(fp.x, fp.z + 20); step(90); o.dockGuards = g.humans.filter((h) => h.facility === 'harbor').length;
    park(0, 0); step(180); o.guardsGone = g.humans.filter((h) => h.facility && !h.remove).length;
    // a long-distance courier
    park(0, 0); step(30); g.jobs.cur = null; g.jobs.start('courier'); const j = g.jobs.cur; o.courier = j ? { type: j.type, km: Math.round(Math.hypot(j.e.x, j.e.z) / 1000), reward: j.reward, wp: !!g.waypoint, hud: (step(2), j.hud) } : null;
    if (j) { const cash0 = g.cash; park(j.e.x, j.e.z); step(5); g.jobs.finish(true); o.courier.paid = Math.round(g.cash - cash0); }
    // incidents in cities nobody watches
    { const n0 = g.memory.st.events.length; for (const id of ['harbor', 'mid1']) R.st[id].incident = 0; R.statT = 0; R.farSim(); const ev = g.memory.st.events.slice(n0); o.incidents = ev.length; o.incidentText = ev[0] && g.memory.headline(ev[0]); }
    // time away rebuilds a ruin
    { const cc = C('mid3'); park(cc.c.x + 30, cc.c.z + 30); step(150); const lots = [...cc.tiles.values()].flatMap((t) => (t.near ? t.near.lots : [])), lot = lots[0], id = lot.id; park(lot.door.px + lot.door.nx * 30, lot.door.pz + lot.door.nz * 30); step(30);
      g.blaze.collapseNow(lot, null); step(720); o.ruinMade = g.blaze.ruins.has(lot) && g.state.rruins[id] != null;
      park(cc.c.x - 3500, cc.c.z); step(240); g.clock.t += 5000; park(lot.door.px + lot.door.nx * 30, lot.door.pz + lot.door.nz * 30); step(240);
      const lot2 = [...cc.tiles.values()].flatMap((t) => (t.near ? t.near.lots : [])).find((l) => l.id === id); o.rebuilt = !!lot2 && !g.blaze.ruins.has(lot2) && g.state.rruins[id] == null; }
    return o;
  });
  const pass = o.has && o.cond.dryWet <= 0.01 && o.cond.harborWet > 0.2 && o.cond.homeWet < 0.05 && o.cond.harborTint[2] > 1.04 && o.cond.hourE > 0.2 && o.heat.before >= 1 && o.heat.atHarbor === 0 && o.heat.saved > 30 && o.heat.back >= 1 && o.airGuards >= 4 && o.dockGuards >= 2 && o.guardsGone === 0 && o.courier && o.courier.paid > 500 && o.courier.wp && o.incidents >= 2 && /속보/.test(o.incidentText) && o.ruinMade && o.rebuilt;
  result('cityrules', pass, o);
});
