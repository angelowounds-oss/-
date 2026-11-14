// Signal stop (EV-21): an AI car on a compiled street comes up to a signalled junction on red, stands short of its arm's stop line, and goes
// on green. For up to 6 approaches near a primary road of the capital: the car is put on the lane 100 m out heading in, the junction's clock
// is set to the start of that arm's red (41 s of it), 25 s pass, then the clock is set to its green and 15 s pass (the car's furthest point past the line in them counts). The player waits 30 m to the
// side of each junction tried (the ground's colliders are built around the player).
// A trial where the car was held at another signal on its way (red or green here) is left out.
// Pass: at least 2 approaches tried, and on every one the car stood (< 0.5 m/s) no further than 0.5 m past the line on red and then crossed it;
// and no signal pole within 900 m stands on a street's carriageway.
const { run, freeze, result } = require('../lib.cjs');
run('signal-stop', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, T = window.__test, RG = window.__region, H = g.hwtraffic; g.hurtPlayer = () => {}; g.eng.render = () => {}; g.addHeat = () => {};
    const yieldN = async (n) => { for (let k = 0; k < n; k++) { T.step(1); if (k % 2) await new Promise((f) => setTimeout(f, 0)); } };
    if (!H || !g.streetscape) return { error: 'no traffic or streets' };
    // a primary road well inside the capital
    const C = RG.regions()[0]; let p = null;
    for (const r of RG.regionRoads()) { if (r.hw !== 'primary' || r.x.length < 40) continue; const i = r.x.length >> 1; if (RG.regionWeight(r.x[i], r.z[i]) >= 1 && r.x[i] > C.x0 + 3000 && r.z[i] > C.z0 + 3000) { p = [r.x[i], r.z[i], r.y[i]]; break; } }
    if (!p) return { error: 'no primary road' };
    await T.arrive(p[0], p[1], p[2] + 1); await yieldN(400);
    const S = g.streetscape, sig = T.streets(p[0], p[1], 900).sig, trials = [];
    // the clock at which an arm's group turns red: group 0 is red from 39 s of the cycle, group 1 from 80 s (streetgeo.signalState)
    const at = (j, grp, c) => ((c - j.phase * 82) % 82 + 82) % 82 + 820;
    for (const j of sig) {
      if (trials.length >= 6) break;
      for (let k = 0; k < j.arms.length && trials.length < 6; k++) {
        const a = j.arms[k], ax = Math.cos(a.ang), az = Math.sin(a.ang), px = j.x + ax * (a.stop + 100), pz = j.z + az * (a.stop + 100);
        const near = H.nearestSample(px, pz, 6, true); if (!near || near.r.kind !== 'arterial' || near.i < 3 || near.i > near.r.x.length - 4) continue;
        // the street must be the arm's own (it passes within 12 m of the junction), not a side street that happens to lie 100 m out
        if (!near.r.x.some((x, q) => Math.hypot(x - j.x, near.r.z[q] - j.z) < 12)) continue;
        const r = near.r, i = near.i, tx = r.x[i + 1] - r.x[i - 1], tz = r.z[i + 1] - r.z[i - 1], dir = tx * -ax + tz * -az > 0 ? 1 : -1;
        if (r.oneway && dir < 0) continue;
        // the player 30 m to the side of the junction: the ground's colliders are built around the player, and a car tried 900 m away fell through the road
        if (Math.hypot(g.player.x - j.x, g.player.z - j.z) > 60) { const qx = j.x - az * 30, qz = j.z + ax * 30; await T.arrive(qx, qz, g.groundY(qx, qz, 1e9) + 1); await yieldN(300); }
        for (const c of H.cars.splice(0)) g.removeVehicle(c);
        const v = H.spawnCar(r, i, dir, 0); v.damage = () => {}; v.ai.speed = 15;
        const along = () => (v.x - j.x) * ax + (v.z - j.z) * az;
        S.t = at(j, a.g, a.g === 0 ? 39.5 : 80.5); await yieldN(25 * 60);
        const sp = Math.hypot(v.vx, v.vz), red = { along: +(along() - a.stop).toFixed(1), speed: +sp.toFixed(2), light: T.signal(j, k) }, elsewhereRed = !!(v.ai.hold && v.ai.hold.j !== j);
        // on green the furthest it got past the line: a street that ends at the junction sends the car on along another, which can bring it back past this arm
        S.t = at(j, a.g, a.g === 0 ? 0.5 : 41.5); let past = Infinity; for (let s = 0; s < 15; s++) { await yieldN(60); past = Math.min(past, along() - a.stop); }
        const green = { along: +past.toFixed(1), light: T.signal(j, k) }; const elsewhere = elsewhereRed || !!(v.ai.hold && v.ai.hold.j !== j);
        const gone = (!g.vehicles.includes(v) || v.hwDone) && !(green.along < -3);
        trials.push({ j: [Math.round(j.x), Math.round(j.z)], arm: k, road: r.id, red, green, gone, elsewhere, ok: red.speed < 0.5 && red.along > -0.5 && red.along < 25 && green.along < -3 });
        g.removeVehicle(v); H.cars = H.cars.filter((c) => c !== v);
      }
    }
    // signal poles standing on a street's carriageway (the junction's arm axis runs beside the street at some junctions; streetscape.js offLane)
    let poles = 0, inLane = 0;
    for (const rec of S.tiles.values()) {
      const O = rec.obst; if (!O) continue;
      for (let q = 0; q < O.length; q += 5) {
        if (Math.abs(O[q + 3] - 6.3) > 0.01 || Math.hypot(O[q] - p[0], O[q + 1] - p[1]) > 900) continue;
        poles++; const s = H.nearestSample(O[q], O[q + 1], 12, true); if (!s) continue;
        const r = s.r; let d = Infinity;
        for (const i of [s.i - 1, s.i]) { if (i < 0 || i + 1 >= r.x.length) continue; const ax = r.x[i], az = r.z[i], ex = r.x[i + 1] - ax, ez = r.z[i + 1] - az, t = Math.max(0, Math.min(1, ((O[q] - ax) * ex + (O[q + 1] - az) * ez) / (ex * ex + ez * ez || 1))); d = Math.min(d, Math.hypot(O[q] - ax - ex * t, O[q + 1] - az - ez * t)); }
        if (d < T.carriageHalf(r) - 0.3) inLane++;
      }
    }
    return { junctions: sig.length, trials, poles, inLane };
  });
  // a car held at another signal on its way (a junction between the spawn and this one, on its own clock) says nothing about this one
  const tr = (o.trials || []).filter((t) => !t.gone && !t.elsewhere);
  result('signal-stop', tr.length >= 2 && tr.every((t) => t.ok) && o.inLane === 0, o);
});
