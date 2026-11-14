// Mission bot (EV-70): every mission of src/missions/defs.js is played through by a bot in the capital's compiled streets, where the EV-72
// place index gives real places. For the step running it does what a player would, in one move: walks to (is put at) the place, takes and
// drives the car there (a car is put on the spot and stopped), kills the gang, wrecks the fleeing car, waits out the wanted level, rides to the
// roof. Each mission must reach MISSION COMPLETE within 240 s of game time, and the places it used must be real ones where it asked for kinds.
// Pass: every mission completes; at least 80 % of the places asked by kind are real places of the index.
const { run, freeze, result } = require('../lib.cjs');
run('mission-bot', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, T = window.__test, RG = window.__region; g.hurtPlayer = () => {}; g.eng.render = () => {};
    const yieldN = async (n) => { for (let k = 0; k < n; k++) { T.step(1); if (k % 2) await new Promise((f) => setTimeout(f, 0)); } };
    await window.__places.loadPlaces();
    const C = RG.regions()[0]; let p = null;
    for (const r of RG.regionRoads()) { if (r.hw !== 'primary' || r.x.length < 40) continue; const i = r.x.length >> 1; if (RG.regionWeight(r.x[i], r.z[i]) >= 1 && r.x[i] > C.x0 + 3000 && r.z[i] > C.z0 + 3000) { p = [r.x[i], r.z[i], r.y[i]]; break; } }
    if (!p) return { error: 'no primary road' };
    const home = async () => { await T.arrive(p[0] + 12, p[1], p[2] + 1); await yieldN(60); };
    // the player in a car of his own (one is made when he has none)
    const inCar = () => { if (g.vehicle) return g.vehicle; const v = T.spawn('sedan', g.player.x + 3, g.player.z, 0, 'drive'); g.enterVehicle(v); return v; };
    // a car put down at (x, z), stopped
    const put = (v, x, z) => { const y = g.groundY(x, z, 1e9) + 1; v.pv.body.setTranslation({ x, y, z }, true); v.pv.body.setLinvel({ x: 0, y: 0, z: 0 }, true); v.x = x; v.z = z; v.vx = v.vz = 0; };
    const out = [];
    const total = 5 + 14;
    for (let i = 0; i < total; i++) {
      await home(); if (g.vehicle) g.exitVehicle(true); g.clearWanted();
      g.mission?.cleanup?.(); const n0 = g.stats.missions; g.startMission(i); const m = g.mission, rec = { i, id: m.id, steps: [], ok: false, asked: 0, real: 0 };
      let t = 0, lastK = -1;
      while (t < 240 && !m.done) {
        const s = m.s, c = m.c; if (!s) break;
        if (m.k !== lastK) { lastK = m.k; rec.steps.push(s.do); if (s.at && s.at.kinds) { rec.asked++; if (c.place && c.place.real) rec.real++; } }
        const P = c.place;
        if (s.do === 'goto' || s.do === 'wait' || s.do === 'ignite' || s.do === 'guards') { if (g.vehicle) g.exitVehicle(true); T.teleport(P.x, P.z); }
        else if (s.do === 'stealCar') g.enterVehicle(c.obj);
        else if (s.do === 'deliverCar') { if (g.vehicle !== c.car) g.enterVehicle(c.car); put(c.car, P.x, P.z); }
        else if (s.do === 'passenger') { const v = inCar(); put(v, c.obj.x + 3, c.obj.z); }
        else if (s.do === 'dropoff') put(inCar(), P.x, P.z);
        else if (s.do === 'checkpoints') put(inCar(), c.cp.x, c.cp.z);
        else if (s.do === 'gang') { for (const h of c.gang) if (!h.dead) h.die(g.player); }
        else if (s.do === 'escape') g.clearWanted();
        else if (s.do === 'chase') { if (!c.obj.dead) c.obj.destroy(g.player); }
        else if (s.do === 'roof') { const l = c.b.lot; T.teleport((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2, c.b.roofY + 0.3); }
        await yieldN(30); t += 0.5;
      }
      // the bot does each step in one move: a mission that needs a minute is stuck
      rec.ok = g.stats.missions === n0 + 1 && t < 60; rec.t = t; if (!rec.ok) rec.end = g.mission.text;
      out.push(rec);
      await yieldN(4 * 60);   // the next mission starts on its own 3.5 s later: let it, then start ours
    }
    return out;
  });
  if (o.error) return result('mission-bot', false, o);
  const asked = o.reduce((s, r) => s + r.asked, 0), real = o.reduce((s, r) => s + r.real, 0);
  result('mission-bot', o.every((r) => r.ok) && asked > 0 && real / asked >= 0.8, { missions: o.length, done: o.filter((r) => r.ok).length, asked, real, failed: o.filter((r) => !r.ok), all: o.map((r) => [r.id, r.ok, r.t, r.steps.join('>')]) });
});
