// A car summoned and boarded on a raised stretch of a compiled road (embankment, bridge, tunnel) stays on the road (user report 2026-11-01: it went under the
// ground "on a highway"). Cause: the physics deck of a compiled road is part of its drawn piece, which streamed in over seconds in array order; until then the
// only ground below a viaduct or tunnel is the terrain far under it. The player is put on the road, the car is summoned 10 m ahead and boarded at once, and
// 60 frames later it must still be within 1.5 m of the road surface. Spots are drawn from a fixed pseudo-random sequence so the run is repeatable.
const { run, freeze, result } = require('../lib.cjs');
run('highway-spawn', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, L = window.__landfn, S = g.sandbox, HW = g.highways, R = window.__region.regionRoads(); g.hurtPlayer = () => {};
    const frames = async (n) => { const r = g.eng.render; g.eng.render = () => {}; for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 10 === 9) await new Promise((f) => setTimeout(f, 10)); } g.eng.render = r; };
    let seed = 99; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const idx = R.map((r, i) => i).filter((i) => (R[i].hw === 'motorway' || R[i].hw === 'trunk') && R[i].x.length > 12);
    const want = { emb: 3, bridge: 3, tunnel: 3 }, picks = [];
    for (let t = 0; t < 60000 && picks.length < 9; t++) {
      const r = R[idx[Math.floor(rnd() * idx.length)]], i = 3 + Math.floor(rnd() * (r.x.length - 6)), x = r.x[i], z = r.z[i];
      if (Math.max(Math.abs(x), Math.abs(z)) < 2300) continue;
      const d = r.y[i] - L.landHeight(x, z, 8), c = r.cls[i], k = c === 1 ? 'bridge' : c === 2 ? 'tunnel' : d > 2 ? 'emb' : null;
      if (!k || !want[k]) continue;
      // a bridge over the ground or a tunnel under a hill: the terrain is far from the road, the case that fell
      if ((k === 'bridge' && d < 4) || (k === 'tunnel' && d > -4)) continue;
      want[k]--; const tx = r.x[i + 1] - r.x[i - 1], tz = r.z[i + 1] - r.z[i - 1], tl = Math.hypot(tx, tz) || 1;
      picks.push({ k, x, z, y: r.y[i], tx: tx / tl, tz: tz / tl });
    }
    const out = { picks: picks.length, trials: [], bad: 0 };
    for (const p of picks) {
      if (g.vehicle) { g.vehicle = null; g.playerOnFoot = true; pl.group.visible = true; }
      // far from the last spot: the nearest pieces of the new place are not built yet, as for a player who just arrived
      pl.body3.teleport(p.x, p.y + 1.5, p.z); pl.x = p.x; pl.y = p.y + 1.5; pl.z = p.z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false;
      await frames(2);
      const orig = S.ahead.bind(S), yaw = Math.atan2(p.tx, p.tz); S.ahead = () => ({ x: pl.x + p.tx * 10, y: pl.y + 1, z: pl.z + p.tz * 10, yaw, dx: p.tx, dz: p.tz, pl });
      const n = g.vehicles.length; S.spawnCar(); const v = g.vehicles[n]; S.ahead = orig;
      if (!v) { out.trials.push({ k: p.k, err: 'no car' }); out.bad++; continue; }
      g.enterVehicle(v); await frames(60);
      const y = v.pv.body.translation().y, surface = HW.deckY(v.x, v.z), floor = surface === surface ? surface : L.physHeight(v.x, v.z, 8);
      const bad = !(y > floor - 1.5);
      out.trials.push({ k: p.k, road: +p.y.toFixed(1), surface: +floor.toFixed(1), carY: +y.toFixed(1), bad }); if (bad) out.bad++;
      g.vehicle = null; g.playerOnFoot = true; pl.group.visible = true; g.removeVehicle(v);
    }
    return out;
  }).catch((e) => ({ error: String(e) }));
  result('highway-spawn', !o.error && o.picks >= 6 && o.bad === 0, o);
});
